const { W, H, SAFE_BOTTOM } = require('../../core/canvas');
const share = require('../../core/share');
const { Scene } = require('../../core/app');
const theme = require('../../core/theme');
const { t } = require('../../core/i18n');
const { getRaw, setRaw, removeRaw } = require('../../core/storage');
const D = require('../../core/draw');
const actionLabel = require('../../core/action-label');
const resultButton = require('../../core/result-button');
const ParticleField = require('../../core/particles');
const icons = require('../../core/icons');
const fabKit = require('../../core/fab');
const cards = require('../../core/cards');
const HEADER = require('../../core/header');
const { drawTimer } = require('../../core/timer');
const boardLogic = require('./board');
const i18nDict = require('./i18n');

const coreI18n = require('../../core/i18n');
const confetti = require('../../core/confetti');
const achv = require('../../core/achv');
if (!coreI18n.__linkRegistered) {
  coreI18n.register('link', i18nDict);
  coreI18n.__linkRegistered = true;
}

const PREFIX = '__emoji_link__';
const LEVEL_KEY = `${PREFIX}level`;
const BEST_KEY = `${PREFIX}best_1`;
const STATE_KEY = `${PREFIX}state`;
const DEAL_STEP = 7;
const DEAL_MS = 200;
const PLAY = 'play', WON = 'won', OVER = 'over';
const COMBO_MS = 3000;         // 连击窗口
const COMBO_TIME = [0, 0, 0.6, 1.0, 1.5, 2.0];
const TURN_BONUS = [0, 50, 120]; // 0 / 1 / 2 转折
const PAIR_BASE = 100;
const COMBO_FREEZE_MS = 2500;   // 3 连击起冻结倒计时
const COMBO_MILESTONES = [3, 5, 7];  // 连击里程碑：补一个特殊对
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function allTiles(board) {
  const out = [];
  if (!Array.isArray(board)) return out;
  board.forEach((row) => { if (Array.isArray(row)) row.forEach(v => { if (v) out.push(v); }); });
  return out;
}

function fmt(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

class LinkScene extends Scene {
  constructor(app) {
    super(app);
    this.bg = new ParticleField();
    this.level = Math.max(1, Math.floor(+(getRaw(LEVEL_KEY, 1) || 1)) || 1);
    this.best = Math.max(this.level, Math.floor(+(getRaw(BEST_KEY, 1) || 1)) || 1);
    this.board = [];
    this.walls = [];
    this.phase = PLAY;
    this.selected = null;
    this.clears = [];
    this.shake = [];
    this.elapsed = 0;
    this.score = 0;
    this.maxCombo = 0;
    this.scorePulseAt = -1;
    this.clearedPairs = 0;
    this.specials = {};
    this.iceGroups = [];
    this.helpOpen = false;
    this.confirming = false;
    this.shuffleAt = 0;
    this.shufflePlan = 0;
    this.combo = 0;
    this.comboAt = 0;
    this.comboUntil = 0;
    this.lastClearAt = 0;
    this.freezeUntil = 0;       // 3 连击起倒计时冻结
    this.bonusTip = null;       // 里程碑 / 冻结提示
    this.comboMilestoneAt = 0;  // 里程碑全屏脉冲
    this.dealStart = 0;
    this.confetti = [];
    this.confettiUntil = 0;
    this.lastConfettiAt = 0;
    this.bursts = [];
    this.touch = null;
    this.layout();
    this.boot();
  }
  get conf() { return boardLogic.levelConfig(this.level); }
  get rows() { return this.conf.rows; }
  get cols() { return this.conf.cols; }
  get leftPairs() { return allTiles(this.board).length / 2; }
  get timeLeft() { return Math.max(0, this.conf.time - this.elapsed); }
  boot() {
    if (!this.restore()) this.startLevel(this.level);
  }
  startLevel(level) {
    achv.beginRound('link');
    this.level = Math.max(1, Math.floor(level) || 1);
    setRaw(LEVEL_KEY, String(this.level));
    if (this.level > this.best) { this.best = this.level; setRaw(BEST_KEY, String(this.best)); }
    const c = this.conf;
    const generated = boardLogic.generateLevelBoard(c.rows, c.cols, cards.EMOJIS, c);
    this.board = generated.board;
    this.walls = generated.walls;
    this.phase = PLAY;
    this.selected = null;
    this.clears = [];
    this.shake = [];
    this.shufflePlan = 0;
    this.shuffleAt = 0;
    this.combo = 0;
    this.comboUntil = 0;
    this.lastClearAt = 0;
    this.confetti = [];
    this.confettiUntil = 0;
    this.bursts = [];
    this.dealStart = Date.now();
    this.elapsed = 0;
    this.score = 0;
    this.maxCombo = 0;
    this.scorePulseAt = -1;
    this.clearedPairs = 0;
    this.specials = {};
    this.iceGroups = [];
    this.freezeUntil = 0;
    this.bonusTip = null;
    this.comboMilestoneAt = 0;
    this.seedLevelSpecials();
    this.helpOpen = false;
    this.confirming = false;
    removeRaw(STATE_KEY);
    this.save();
    this.layout();
  }
  cellKey(r, c) { return `${r},${c}`; }

  isIce(r, c) {
    return this.iceGroups.some(group => group.some(([gr, gc]) => gr === r && gc === c));
  }

  specialAt(r, c) {
    return this.specials[this.cellKey(r, c)] || '';
  }

  // 死局判定用的墙体：墙 + 冰封（冰点不动，不能作为可消的一对；
  // 以前只传 walls，盘面只剩冰封对时会误判「有解」而卡死）
  effectiveWalls() {
    const merged = this.walls.map(row => (row || []).slice(0, this.cols));
    while (merged.length < this.rows) merged.push(new Array(this.cols).fill(false));
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.isIce(r, c)) merged[r][c] = true;
      }
    }
    return merged;
  }

  hasMoveNow() {
    return boardLogic.hasMove(this.board, this.rows, this.cols, this.effectiveWalls());
  }

  restoreSpecials(raw, rows, cols) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.keys(raw).forEach((key) => {
      const [r, c] = String(key).split(',').map(Number);
      const type = raw[key];
      if (!(r >= 0 && r < rows && c >= 0 && c < cols)) return;
      if (type !== 'clock' && type !== 'bomb') return;
      if (!this.board[r] || !this.board[r][c]) return;
      out[key] = type;
    });
    return out;
  }

  restoreIce(raw, rows, cols) {
    if (!Array.isArray(raw)) return [];
    return raw.filter((group) => Array.isArray(group) && group.length === 2
      && group.every(([r, c]) => r >= 0 && r < rows && c >= 0 && c < cols
        && this.board[r] && this.board[r][c]))
      .map(group => group.map(([r, c]) => [r, c]));
  }

  seedLevelSpecials() {
    if (this.level >= 2) this.seedSpecial('clock');
    if (this.level >= 4) this.seedSpecial('bomb');
    if (this.level >= 6) this.seedSpecial('ice');
    if (this.level >= 8 && Math.random() < 0.5) this.seedSpecial(Math.random() < 0.5 ? 'clock' : 'bomb');
  }

  seedSpecial(type) {
    const byEmoji = new Map();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.walls[r] && this.walls[r][c]) continue;
        const value = this.board[r][c];
        if (!value || this.specialAt(r, c) || this.isIce(r, c)) continue;
        if (!byEmoji.has(value)) byEmoji.set(value, []);
        byEmoji.get(value).push([r, c]);
      }
    }
    const candidates = [...byEmoji.values()].filter(list => list.length >= 2);
    if (!candidates.length) return false;
    const list = candidates[Math.floor(Math.random() * candidates.length)];
    const a = list[0];
    const b = list[1 + Math.floor(Math.random() * (list.length - 1))];
    if (!a || !b) return false;
    if (type === 'ice') {
      this.iceGroups.push([a, b]);
    } else {
      this.specials[this.cellKey(a[0], a[1])] = type;
      this.specials[this.cellKey(b[0], b[1])] = type;
    }
    return true;
  }

  save() {
    setRaw(STATE_KEY, JSON.stringify({
      board: this.board, walls: this.walls, level: this.level,
      time: this.elapsed, phase: this.phase,
      score: this.score, maxCombo: this.maxCombo,
      clearedPairs: this.clearedPairs, specials: this.specials, iceGroups: this.iceGroups,
    }));
  }
  restore() {
    try {
      const raw = getRaw(STATE_KEY, '');
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.board) || !s.board.length) return false;
      const c = boardLogic.levelConfig(+(s.level || 1));
      if (s.board.length !== c.rows) return false;
      if (!s.board.every(row => Array.isArray(row) && row.length === c.cols)) return false;
      this.level = c.level;
      this.board = s.board.map(row => row.slice());
      this.walls = Array.isArray(s.walls) && s.walls.length === c.rows
        ? s.walls.map(row => (Array.isArray(row) ? row.slice(0, c.cols) : []))
        : [];
      this.elapsed = Math.max(0, +s.time || 0);
      this.score = Math.max(0, Math.floor(+s.score) || 0);
      this.maxCombo = Math.max(0, Math.floor(+s.maxCombo) || 0);
      this.clearedPairs = Math.max(0, Math.floor(+s.clearedPairs) || 0);
      this.specials = this.restoreSpecials(s.specials, c.rows, c.cols);
      this.iceGroups = this.restoreIce(s.iceGroups, c.rows, c.cols);
      this.freezeUntil = 0;
      this.bonusTip = null;
      this.comboMilestoneAt = 0;
      if (s.phase === WON && !this.leftPairs) this.phase = WON;
      else if (s.phase === OVER && this.leftPairs) this.phase = OVER;
      else if (this.leftPairs) this.phase = PLAY;
      else return false;
      if (this.phase === PLAY && !this.hasMoveNow()) {
        this.specials = {};
        this.iceGroups = [];
        this.board = boardLogic.shuffleBoard(this.board, this.rows, this.cols, Math.random, this.walls);
      }
      this.dealStart = Date.now();
      this.layout();
      return true;
    } catch (e) { return false; }
  }
  update(dt) {
    if (this.bg) this.bg.update(dt || 16);
    const delta = Math.min(50, dt || 16);
    this.now = Date.now();
    if (this.now < this.confettiUntil && this.now - this.lastConfettiAt >= 40) {
      this.lastConfettiAt = this.now;
      this.emitConfetti();
    }
    this.confetti = confetti.update(this.confetti, dt || 16, H);
    const step = Math.min(50, dt || 16) / 16.67;
    this.bursts.forEach((p) => {
      p.x += p.vx * step; p.y += p.vy * step; p.vy += 0.22 * step; p.rot += p.vr * step; p.age += delta;
    });
    this.bursts = this.bursts.filter(p => p.y < H + 30 && p.age < 1600);
    if (this.phase !== PLAY || this.helpOpen || this.confirming) return;
    if (this.shufflePlan && this.now >= this.shufflePlan) {
      this.shufflePlan = 0;
      this.shuffleAt = this.now;
      this.specials = {};
      this.iceGroups = [];
      this.board = boardLogic.shuffleBoard(this.board, this.rows, this.cols, Math.random, this.walls);
      if (!this.hasMoveNow()) {
        const remaining = allTiles(this.board);
        this.board = boardLogic.generateBoard(this.rows, this.cols, remaining, Math.random, remaining.length / 2, this.walls);
      }
      this.save();
    }
    const frozen = this.freezeUntil && this.now < this.freezeUntil;
    if (!frozen) this.elapsed += delta / 1000;
    if (this.elapsed >= this.conf.time) {
      this.phase = OVER;
      this.app.audio.playLose();
      this.save();
    }
    if (this.clears.length) {
      const done = this.clears.filter(c => this.now >= c.at);
      if (done.length) {
        this.clears = this.clears.filter(c => this.now < c.at);
        this.afterClears();
      }
    }
  }
  registerClear(turns) {
    const now = Date.now();
    const chained = this.lastClearAt && now - this.lastClearAt < COMBO_MS;
    this.combo = chained ? this.combo + 1 : 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.lastClearAt = now;
    this.comboAt = now;
    this.comboUntil = now + 1500;
    const mult = Math.min(5, this.combo);
    const turn = Math.max(0, Math.min(2, Math.floor(turns) || 0));
    this.score += (PAIR_BASE + TURN_BONUS[turn]) * mult;
    this.scorePulseAt = now;
    const bonus = COMBO_TIME[Math.min(5, this.combo)] || 0;
    this.comboBonus = bonus;
    if (bonus) this.elapsed = Math.max(0, this.elapsed - bonus);
    achv.peak('link', 'combo', this.maxCombo);
    achv.peak('link', 'score', this.score);
    if (this.combo >= 2) this.spawnBurst();
    // 连击越深越有实感：3 连击起冻结倒计时，3/5/7 连击各补一个特殊对
    if (this.combo >= 3) {
      this.freezeUntil = Math.max(this.freezeUntil, now + COMBO_FREEZE_MS);
      this.bonusTip = { text: t('link.comboFreeze').replace('{n}', String(this.combo)).replace('{s}', (COMBO_FREEZE_MS / 1000).toFixed(1)), at: now };
    }
    if (COMBO_MILESTONES.indexOf(this.combo) >= 0) {
      const type = this.combo >= 5 ? 'bomb' : (Math.random() < 0.5 ? 'clock' : 'ice');
      this.seedSpecial(type);
      this.comboMilestoneAt = now;
      this.bonusTip = { text: t('link.comboBonus').replace('{n}', String(this.combo)), at: now };
      if (this.combo === 5) this.app.audio.playFirework();
    }
  }

  removeExtraPair(now) {
    const byEmoji = new Map();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.walls[r] && this.walls[r][c]) continue;
        const value = this.board[r][c];
        if (!value || this.specialAt(r, c) || this.isIce(r, c)) continue;
        if (!byEmoji.has(value)) byEmoji.set(value, []);
        byEmoji.get(value).push([r, c]);
      }
    }
    const candidates = [...byEmoji.values()].filter(list => list.length >= 2);
    if (!candidates.length) return false;
    const list = candidates[Math.floor(Math.random() * candidates.length)];
    const a = list[0];
    const b = list[1 + Math.floor(Math.random() * (list.length - 1))];
    if (!a || !b) return false;
    const value = this.board[a[0]][a[1]];
    [a, b].forEach(([r, c]) => { this.board[r][c] = null; delete this.specials[this.cellKey(r, c)]; });
    this.score += PAIR_BASE;
    achv.peak('link', 'score', this.score);
    this.clears.push({ at: now + 520, start: now, path: [], cells: [a, b], items: [value, value], bomb: true });
    for (let i = 0; i < 10; i += 1) {
      const angle = (i / 10) * Math.PI * 2;
      this.bursts.push({
        x: W / 2, y: this.boardY + this.boardH / 2,
        vx: Math.cos(angle) * 3, vy: Math.sin(angle) * 3 - 1,
        vr: 0, rot: 0, color: '#ff9d4d', w: 4, h: 4, age: 0,
      });
    }
    return true;
  }

  thawNear(cells) {
    const thawed = [];
    this.iceGroups = this.iceGroups.filter((group) => {
      const near = group.some(([r, c]) => cells.some(([cr, cc]) => Math.max(Math.abs(r - cr), Math.abs(c - cc)) <= 1));
      if (near) thawed.push(...group);
      return !near;
    });
    thawed.forEach(([r, c]) => {
      const x = this.cellX(c) + this.cell / 2;
      const y = this.cellY(r) + this.cell / 2;
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        this.bursts.push({
          x, y, vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 1.6 - 0.4,
          vr: 0, rot: 0, color: '#9ed8ff', w: 3, h: 3, age: 0,
        });
      }
    });
  }

  onCell(r, c) {
    if (this.phase !== PLAY || this.helpOpen || this.confirming || this.shufflePlan) return;
    if (!this.board[r]) return;
    const value = this.board[r][c];
    if (!value || (this.walls[r] && this.walls[r][c])) return;
    if (this.isIce(r, c)) {
      this.shake = [[r, c]];
      setTimeout(() => { this.shake = []; }, 280);
      return;
    }
    if (!this.selected) {
      this.selected = [r, c];
      return;
    }
    if (this.selected[0] === r && this.selected[1] === c) {
      this.selected = null;
      return;
    }
    const [r1, c1] = this.selected;
    const other = this.board[r1][c1];
    if (other !== value) {
      this.breakCombo();
      this.shake = [[r, c], [r1, c1]];
      this.selected = null;
      setTimeout(() => { this.shake = []; }, 280);
      return;
    }
    const path = boardLogic.findPath(this.board, this.rows, this.cols, r1, c1, r, c, this.walls);
    if (!path) {
      this.breakCombo();
      this.shake = [[r, c], [r1, c1]];
      this.selected = null;
      setTimeout(() => { this.shake = []; }, 280);
      return;
    }
    const now = Date.now();
    this.registerClear(path.length - 2);
    const specials = [this.specialAt(r1, c1), this.specialAt(r, c)].filter(Boolean);
    this.selected = null;
    // 逻辑上立刻移除两张牌，但保留一份闪烁 ghost 和连线；这样其它牌可以继续点。
    this.board[r1][c1] = null;
    this.board[r][c] = null;
    delete this.specials[this.cellKey(r1, c1)];
    delete this.specials[this.cellKey(r, c)];
    const clearedCells = [[r1, c1], [r, c]];
    this.clears.push({ at: now + 520, start: now, path, cells: clearedCells, items: [value, value] });
    this.thawNear(clearedCells);
    if (specials.includes('clock')) this.elapsed = Math.max(0, this.elapsed - 4);
    const bombExtra = specials.includes('bomb') && this.removeExtraPair(now);
    if (bombExtra && this.clears.length) this.thawNear(this.clears[this.clears.length - 1].cells);
    this.clearedPairs += 1 + (bombExtra ? 1 : 0);
    if (this.clearedPairs % 8 === 0) {
      this.seedSpecial(Math.random() < 0.3 ? 'ice' : Math.random() < 0.5 ? 'clock' : 'bomb');
    }
    this.app.audio.playElimination();
    this.save();
  }
  breakCombo() { this.lastClearAt = 0; this.combo = 0; this.comboAt = 0; this.comboUntil = 0; }
  afterClears() {
    if (this.clears.length) return;
    if (!this.leftPairs) {
      this.phase = WON;
      this.best = Math.max(this.best, this.level + 1);
      achv.win('link', { level: this.level + 1 });
      setRaw(BEST_KEY, String(this.best));
      this.app.audio.playSuccess();
      this.startConfetti();
      this.save();
      return;
    }
    if (!this.hasMoveNow()) {
      // 先提示 0.65s，再真正洗牌；洗牌动画由 drawBoard 用 shuffleAt 驱动。
      this.shufflePlan = Date.now() + 650;
      this.save();
      return;
    }
    this.save();
  }
  nextLevel() { this.startLevel(this.level + 1); }
  replayLevel() { this.confirming = false; this.startLevel(this.level); }
  startNewGame() {
    this.confirming = false;
    removeRaw(BEST_KEY);
    this.best = 1;
    this.startLevel(1);
  }
  layout() {
    this.cw = Math.min(W - 32, 440);
    this.cx = (W - this.cw) / 2;
    this.top = HEADER.TOP;
    this.headerH = HEADER.HEIGHT;
    this.homeRect = { ...HEADER.HOME_RECT };
    this.scoreY = this.top + this.headerH + 12;
    this.scoreH = 72;
    this.optY = this.scoreY + this.scoreH + 16;
    this.optH = 72;
    this.tipY = this.optY + this.optH + 10;
    this.tipH = 28;
    this.boardY = this.tipY + this.tipH;
    const reserve = SAFE_BOTTOM + 96;
    const availH = Math.max(180, H - this.boardY - reserve);
    const c = this.conf;
    const pad = 6;
    const gap = c.pairs <= 6 ? 6 : c.pairs <= 12 ? 4 : 3;
    const byW = (this.cw - pad * 2 - (c.cols - 1) * gap) / c.cols;
    const byH = (availH - pad * 2 - (c.rows - 1) * gap) / c.rows;
    this.cell = Math.max(10, Math.min(byW, byH));
    this.boardW = c.cols * this.cell + (c.cols - 1) * gap + pad * 2;
    this.boardH = c.rows * this.cell + (c.rows - 1) * gap + pad * 2;
    this.boardX = (W - this.boardW) / 2;
    this.pad = pad;
    this.gap = gap;
    this.helpFab = { x: W - 16 - fabKit.SIZE, y: H - SAFE_BOTTOM - 16 - fabKit.SIZE, w: fabKit.SIZE, h: fabKit.SIZE };
  }
  cellX(c) { return this.boardX + this.pad + c * (this.cell + this.gap); }
  cellY(r) { return this.boardY + this.pad + r * (this.cell + this.gap); }
  render(c) {
    this.buttons = [];
    const T = theme.tokens;
    c.fillStyle = T.bg; c.fillRect(0, 0, W, H);
    this.bg.draw(c, theme.dark);
    this.drawHeader(c);
    this.drawScore(c);
    this.drawOptions(c);
    this.drawTip(c);
    this.drawBoard(c);
    this.drawComboPulse(c);
    if (!this.helpOpen && !this.confirming) this.drawFab(c);
    this.drawConfetti(c);
    if (this.helpOpen) this.drawHelp(c);
    if (this.confirming) this.drawConfirm(c);
  }

  drawHeader(c) {
    const T = theme.tokens;
    D.text(c, t('link.gameTitle'), W / 2, this.top + this.headerH / 2, {
      size: 15, weight: 'bold', color: T.text, align: 'center',
    });
    const h = this.homeRect;
    const cx = h.x + h.w / 2;
    const cy = h.y + h.h / 2;
    if (!icons.draw(c, 'home', cx, cy, 24, T.text)) {
      D.text(c, '⌂', cx, cy, { size: 24, color: T.text, align: 'center' });
    }
    this.addButton('home', h.x, h.y, h.w, h.h, () => this.app.goHome());
  }

  drawScore(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.scoreY, this.cw, this.scoreH, T);
    const q = this.cw / 4;
    const stats = [
      [t('link.levelLabel'), String(this.level)],
      [t('link.timeLeft'), fmt(this.timeLeft)],
      [t('link.leftPairs'), String(this.leftPairs)],
      [t('link.score'), String(this.score)],
    ];
    stats.forEach(([label, value], i) => {
      if (i) D.divider(c, this.cx + q * i, this.scoreY + this.scoreH / 2, 20, T.border, 1);
      const x = this.cx + q * (i + 0.5);
      D.text(c, label, x, this.scoreY + 24, { size: 10.5, color: T.muted, align: 'center' });
      if (i === 1) {
        drawTimer(c, 'hourglass', x, this.scoreY + 48, value, {
          size: 20, color: this.timeLeft <= 15 ? T.del : T.text,
        });
        if (this.freezeUntil && Date.now() < this.freezeUntil) {
          D.text(c, '❄', x - 30, this.scoreY + 48, { size: 13, color: T.primary, align: 'center' });
        }
      } else {
        let size = 20;
        if (i === 3 && this.scorePulseAt > 0 && Date.now() - this.scorePulseAt < 260) {
          size = 20 + 2.5 * (1 - (Date.now() - this.scorePulseAt) / 260);
        }
        D.text(c, value, x, this.scoreY + 48, {
          size, weight: 'bold', color: i === 3 ? T.primary : T.text, align: 'center',
        });
      }
    });
    const total = this.conf.pairs;
    const progress = total ? (total - this.leftPairs) / total : 0;
    D.progressBar(c, this.cx, this.scoreY, this.cw, this.scoreH, progress, T.border, T.primary);
  }
  drawOptions(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.optY, this.cw, this.optH, T);
    const x1 = this.cx + this.cw * 0.62;
    D.divider(c, x1, this.optY + this.optH / 2, 24, T.border, 1);
    const kinds = t('link.kindsLabel').replace('{n}', String(this.conf.kinds));
    const walls = this.conf.walls ? ` · ${t('link.wallsLabel').replace('{n}', String(this.conf.walls))}` : '';
    const note = `${this.rows}×${this.cols} · ${kinds}${walls}`;
    D.text(c, note, this.cx + (x1 - this.cx) / 2, this.optY + this.optH / 2, { size: 13, color: T.muted, align: 'center' });
    const label = t('link.start');
    const bw = Math.min(110, actionLabel.width(c, label, { size: 13 }));
    const bx = (x1 + this.cx + this.cw) / 2 - bw / 2;
    D.fillRoundRect(c, bx, this.optY + 20, bw, 32, 8, T.primary);
    actionLabel.draw(c, 'gamepad', label, bx + bw / 2, this.optY + 36, { size: 13, color: '#fff' });
    this.addButton('new', bx, this.optY + 20, bw, 32, () => { this.confirming = true; });
    // 连击倒计时：新游戏这一行卡片的底部逆向进度条（满 → 空），和消除类的分数进度条同一套样式
    if (this.combo > 0 && this.lastClearAt) {
      const left = clamp((this.lastClearAt + COMBO_MS - Date.now()) / COMBO_MS, 0, 1);
      if (left > 0) {
        D.progressBar(c, this.cx, this.optY, this.cw, this.optH, left, T.border, this.combo >= 3 ? T.god : T.primary);
      }
    }
  }
  // 3/5/7 连击的里程碑：从棋盘中心扩一圈，给「连起来了」一个全屏反馈
  drawComboPulse(c) {
    if (!this.comboMilestoneAt) return;
    const p = (Date.now() - this.comboMilestoneAt) / 700;
    if (p >= 1) {
      this.comboMilestoneAt = 0;
      return;
    }
    const T = theme.tokens;
    const cx = this.boardX + this.boardW / 2;
    const cy = this.boardY + this.boardH / 2;
    c.save();
    c.globalAlpha = (1 - p) * 0.55;
    c.strokeStyle = T.god;
    c.lineWidth = 3;
    c.beginPath();
    c.arc(cx, cy, Math.max(this.boardW, this.boardH) * (0.12 + 0.55 * p), 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }

  drawTip(c) {
    const T = theme.tokens;
    let text = '';
    let combo = false;
    const bonus = this.bonusTip && Date.now() - this.bonusTip.at < 1600 ? this.bonusTip : null;
    if (bonus) {
      text = bonus.text;
      combo = true;
    } else if (this.combo >= 2 && Date.now() < this.comboUntil) {
      text = t('link.comboTip')
        .replace('{n}', String(this.combo))
        .replace('{s}', (this.comboBonus || 0).toFixed(1));
      combo = true;
    } else if (this.shufflePlan) {
      text = t('link.shuffleHint');
    } else if (this.shuffleAt && Date.now() < this.shuffleAt + 1600) {
      text = t('link.shuffleTip');
    }
    if (!text) return;
    const size = combo ? (this.combo >= 4 ? 16 : this.combo >= 3 ? 14 : 12.5) : 14;
    const tw = D.measure(c, text, size, 'bold');
    const w = tw + 24;
    const h = 24;
    const x = W / 2 - w / 2;
    const y = this.tipY + 2;
    c.save();
    if (combo) {
      const p = Math.max(0, Math.min(1, (Date.now() - this.comboAt) / 1500));
      const scale = p < 0.14 ? 0.6 + (p / 0.14) * 0.52 : p < 0.26 ? 1.12 - ((p - 0.14) / 0.12) * 0.12 : 1;
      c.translate(W / 2, y + h / 2);
      c.scale(scale, scale);
      c.translate(-W / 2, -(y + h / 2));
      c.globalAlpha = p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1;
    }
    D.fillRoundRect(c, x, y, w, h, 8, combo ? T.primary : T.card);
    if (!combo) D.strokeRoundRect(c, x, y, w, h, 8, T.border, 1);
    D.text(c, text, W / 2, y + h / 2, { size, weight: 'bold', color: combo ? '#fff' : T.text, align: 'center' });
    c.restore();
  }
  drawBoard(c) {
    const T = theme.tokens;
    D.fillRoundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 14, T.boardBg);
    c.save();
    D.roundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 14);
    c.clip();
    c.fillStyle = T.boardDot;
    for (let x = this.boardX + 5; x < this.boardX + this.boardW; x += 10) {
      for (let y = this.boardY + 5; y < this.boardY + this.boardH; y += 10) {
        c.beginPath(); c.arc(x, y, 1.1, 0, Math.PI * 2); c.fill();
      }
    }
    c.restore();
    const now = Date.now();
    for (let r = 0; r < this.rows; r++) for (let col = 0; col < this.cols; col++) {
      const x = this.cellX(col), y = this.cellY(r);
      if (this.walls[r] && this.walls[r][col]) {
        this.drawWall(c, x, y);
        continue;
      }
      const value = this.board[r][col];
      const selected = this.selected && this.selected[0] === r && this.selected[1] === col;
      if (value) {
        const delay = (r * this.cols + col) * DEAL_STEP;
        const p = this.dealStart ? Math.max(0, Math.min(1, (now - this.dealStart - delay) / DEAL_MS)) : 1;
        if (p > 0) {
          const alpha = 1;
          const sh = this.shake.some(([sr, sc]) => sr === r && sc === col) ? Math.sin(now / 24) * 3 : 0;
          let shuffleScale = 1, shuffleRot = 0;
          if (this.shuffleAt && now - this.shuffleAt < 560) {
            const sp = Math.max(0, Math.min(1, (now - this.shuffleAt - (r * this.cols + col) * 8) / 520));
            const wave = Math.sin(sp * Math.PI);
            shuffleScale = 0.35 + 0.65 * Math.abs(Math.cos(sp * Math.PI));
            shuffleRot = Math.sin(sp * Math.PI * 2) * 0.16 * (1 - sp);
          }
          const scale = (0.4 + 0.6 * p) * (selected ? 1.12 : 1) * shuffleScale;
          c.save();
          c.globalAlpha = alpha;
          c.translate(x + this.cell / 2 + sh, y + this.cell / 2);
          c.rotate(shuffleRot);
          c.scale(scale, scale);
          // 所有 emoji 卡片统一走 core/cards；空白格不画卡片。
          cards.draw(c, value, cards.MODE_EMOJI, -this.cell / 2, -this.cell / 2, this.cell, this.cell, true);
          if (selected) {
            D.strokeRoundRect(c, -this.cell / 2 + 1, -this.cell / 2 + 1, this.cell - 2, this.cell - 2, 8, T.primary, 2);
          }
          c.restore();
          if (this.specialAt(r, col)) this.drawSpecialBadge(c, x, y, this.specialAt(r, col));
          if (this.isIce(r, col)) this.drawIce(c, x, y);
          if (this.shake.some(([sr, sc]) => sr === r && sc === col)) {
            c.save();
            c.strokeStyle = T.lose;
            c.lineWidth = 2;
            c.beginPath();
            c.arc(x + this.cell / 2, y + this.cell / 2, this.cell * 0.46, 0, Math.PI * 2);
            c.stroke();
            c.restore();
          }
        }
        if (this.phase === PLAY) this.addButton(`cell-${r}-${col}`, x, y, this.cell, this.cell, () => this.onCell(r, col));
      }
    }
    this.clears.forEach((entry) => {
      const age = Math.max(0, now - entry.start);
      const alpha = 0.2 + 0.8 * Math.abs(Math.cos((age / 520) * Math.PI * 2));
      entry.cells.forEach(([r, col], i) => {
        const x = this.cellX(col), y = this.cellY(r);
        c.save();
        c.globalAlpha = alpha;
        cards.draw(c, entry.items[i], cards.MODE_EMOJI, x, y, this.cell, this.cell, true);
        c.restore();
      });
      this.drawPath(c, entry);
    });
    if (this.phase === WON || this.phase === OVER) this.drawResult(c);
  }
  drawSpecialBadge(c, x, y, type) {
    const clock = type === 'clock';
    const color = clock ? '#2c6aad' : '#d97706';
    const r = this.cell * 0.18;
    const bx = x + this.cell - r - 2;
    const by = y + r + 2;
    D.circle(c, bx, by, r, color);
    if (!icons.draw(c, clock ? 'timer' : 'bomb', bx, by, Math.max(8, this.cell * 0.27), '#ffffff')) {
      D.text(c, clock ? 'T' : 'B', bx, by, {
        size: Math.max(8, this.cell * 0.24), weight: 'bold', color: '#fff', align: 'center',
      });
    }
  }

  drawIce(c, x, y) {
    D.fillRoundRect(c, x, y, this.cell, this.cell, 8, 'rgba(120,190,235,0.38)');
    D.strokeRoundRect(c, x + 1, y + 1, this.cell - 2, this.cell - 2, 7, 'rgba(230,248,255,0.9)', 1.5);
    D.text(c, '❄', x + this.cell / 2, y + this.cell / 2, {
      size: Math.max(12, this.cell * 0.46), color: 'rgba(255,255,255,0.92)', align: 'center',
    });
  }

  drawWall(c, x, y) {
    const T = theme.tokens;
    const bg = theme.dark ? 'rgba(255,255,255,0.14)' : '#d8d2c5';
    D.fillRoundRect(c, x, y, this.cell, this.cell, 8, bg);
    c.save();
    D.roundRect(c, x, y, this.cell, this.cell, 8);
    c.clip();
    c.strokeStyle = theme.dark ? 'rgba(0,0,0,0.28)' : 'rgba(105,96,84,0.22)';
    c.lineWidth = 2;
    for (let i = -this.cell; i < this.cell * 2; i += 7) {
      c.beginPath(); c.moveTo(x + i, y); c.lineTo(x + i - this.cell, y + this.cell); c.stroke();
    }
    c.restore();
    D.strokeRoundRect(c, x + 1, y + 1, this.cell - 2, this.cell - 2, 7, theme.dark ? 'rgba(255,255,255,0.2)' : 'rgba(90,80,70,0.22)', 1);
  }
  pathPoint(r, c) {
    const lane = this.cell * 0.14;
    let x, y;
    if (c < 0) x = this.boardX - lane;
    else if (c >= this.cols) x = this.boardX + this.boardW + lane;
    else x = this.cellX(c) + this.cell / 2;
    if (r < 0) y = this.boardY - lane;
    else if (r >= this.rows) y = this.boardY + this.boardH + lane;
    else y = this.cellY(r) + this.cell / 2;
    return { x, y };
  }
  drawPath(c, entry) {
    if (!entry.path || entry.path.length < 2) return;
    const T = theme.tokens;
    const age = Math.max(0, Date.now() - entry.start);
    const pathAlpha = age < 400 ? 1 : Math.max(0, 1 - (age - 400) / 120);
    const pts = entry.path.map(([r, col]) => this.pathPoint(r, col));
    const inset = this.cell * 0.42;
    const toward = (a, b) => {
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: a.x + dx / len * Math.min(inset, len / 2), y: a.y + dy / len * Math.min(inset, len / 2) };
    };
    if (pts.length > 1) {
      pts[0] = toward(pts[0], pts[1]);
      pts[pts.length - 1] = toward(pts[pts.length - 1], pts[pts.length - 2]);
    }
    const stroke = (color, width) => {
      c.save();
      c.strokeStyle = color;
      c.lineWidth = width;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.beginPath();
      pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
      c.stroke();
      c.restore();
    };
    c.save();
    c.globalAlpha = pathAlpha;
    stroke('rgba(18,131,63,0.22)', Math.max(5, this.cell * 0.18));
    stroke(T.win, Math.max(2, this.cell * 0.08));
    c.restore();
  }
  startConfetti() {
    this.confetti = [];
    this.confettiUntil = Date.now() + 1200;
    this.lastConfettiAt = 0;
  }
  emitConfetti() {
    confetti.spawn(this.confetti, { W, H, startY: H * 0.58, scoreY: this.scoreY });
  }
  spawnBurst() {
    if (this.app && this.app.audio) this.app.audio.playFirework();
    const cx = W / 2;
    const cy = this.tipY + this.tipH + 26;
    const colors = ['#5D8C7B', '#F2D091', '#F2A679', '#D9695F', '#8C4646'];
    for (let i = 0; i < 20; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const v = 2.5 + Math.random() * 3.5;
      this.bursts.push({
        x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5,
        vr: (Math.random() - 0.5) * 0.3, rot: Math.random() * Math.PI,
        color: colors[i % colors.length], w: 3 + Math.random() * 3, h: 2 + Math.random() * 3, age: 0,
      });
    }
  }
  drawConfetti(c) {
    confetti.draw(c, this.confetti.concat(this.bursts || []));
  }
  winStars() {
    let stars = 1;
    if (this.timeLeft >= this.conf.time * 0.2) stars += 1;
    if ((this.maxCombo || 0) >= 4) stars += 1;
    return Math.max(1, Math.min(3, stars));
  }

  drawResult(c) {
    if (!this.resultVisible()) return;
    const T = theme.tokens;
    share.resultPanel(c, this, this.boardY, this.boardH, { w: this.boardW });
    const cx = W / 2, cy = this.boardY + this.boardH / 2;
    if (this.phase === WON) {
      D.text(c, `🎉🎉 ${t('link.levelDone').replace('{n}', this.level)} 🎉🎉`, cx, cy - 30, { size: 18, weight: 'bold', color: T.win, align: 'center' });
      D.text(c, `★${'★'.repeat(this.winStars() - 1)}${'☆'.repeat(3 - this.winStars())}`, cx, cy - 8, {
        size: 18, color: T.god, align: 'center',
      });
      D.text(c, `${t('link.score')} ${this.score} · ${t('link.maxCombo')} ×${Math.min(5, this.maxCombo || 1)}`, cx, cy + 14, {
        size: 13, color: T.muted, align: 'center',
      });
      const gap = 10;
      const l1 = t('link.replayLevel');
      const l2 = t('link.nextLevel');
      const w1 = resultButton.width(c, l1);
      const w2 = resultButton.width(c, l2);
      const bx = cx - (w1 + w2 + gap) / 2;
      resultButton.draw(c, this, l1, 'replay', bx, cy + 34, { id: 'result-replay', onTap: () => this.replayLevel() });
      resultButton.draw(c, this, l2, 'next', bx + w1 + gap, cy + 34, { id: 'result-next', onTap: () => this.nextLevel() });
    } else {
      D.text(c, `👻👻 ${t('link.timeUp')} 👻👻`, cx, cy - 24, { size: 18, weight: 'bold', color: T.lose, align: 'center' });
      D.text(c, `${t('link.score')} ${this.score}`, cx, cy, { size: 13, color: T.muted, align: 'center' });
      const label = t('link.replayLevel');
      const bw = resultButton.width(c, label);
      resultButton.draw(c, this, label, 'replay', cx - bw / 2, cy + 24, { id: 'result-replay', onTap: () => this.replayLevel() });
    }
  }
  drawFab(c) {
    const T = theme.tokens, r = this.helpFab;
    c.save(); c.shadowColor = 'rgba(0,0,0,0.12)'; c.shadowBlur = 10; c.shadowOffsetY = 2;
    D.circle(c, r.x + r.w / 2, r.y + r.h / 2, r.w / 2, T.card); c.restore();
    fabKit.stroke(c, r.x + r.w / 2, r.y + r.h / 2, r.w / 2, fabKit.borderOf('help'));
    if (!icons.draw(c, 'help', r.x + r.w / 2, r.y + r.h / 2, 20, T.text)) D.text(c, '?', r.x + r.w / 2, r.y + r.h / 2, { size: 18, color: T.text, align: 'center' });
    this.addButton('help', r.x, r.y, r.w, r.h, () => { this.helpOpen = true; });
    fabKit.drawMute(this, c, fabKit.leftSlot(r));
  }
  drawHelp(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(0, 0, W, H);
    const x = 18, w = W - 36;
    const lines = [];
    ['helpMsg', 'help1', 'help2', 'help3', 'help4', 'help5', 'help6'].forEach((k) => {
      const v = t('link.' + k);
      if (v !== 'link.' + k) { lines.push(...D.wrapText(c, v, w - 36, 13)); lines.push(''); }
    });
    const lineH = 18;
    const h = Math.min(H - 60, 70 + lines.length * lineH + 54);
    const y = (H - h) / 2;
    D.card(c, x, y, w, h, T);
    D.text(c, '?', x + 22, y + 28, { size: 22, weight: 'bold', color: T.primary });
    D.text(c, t('help'), x + 46, y + 28, { size: 15, weight: 'bold', color: T.text });
    c.save(); D.roundRect(c, x + 1, y + 1, w - 2, h - 2, 14); c.clip();
    let ly = y + 52;
    lines.forEach((line) => { if (line) D.text(c, line, x + 18, ly, { size: 12, color: T.text }); ly += lineH; });
    c.restore();
    this.addButton('help-mask', 0, 0, W, H, () => { this.helpOpen = false; });
    const bw = 100, bx = x + (w - bw) / 2, by = y + h - 38;
    D.fillRoundRect(c, bx, by, bw, 28, 8, T.primary);
    D.text(c, t('link.confirmText'), bx + bw / 2, by + 14, { size: 12, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('help-ok', bx, by, bw, 28, () => { this.helpOpen = false; });
  }
  drawConfirm(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(0, 0, W, H);
    const w = W - 56, h = 200, x = (W - w) / 2, y = (H - h) / 2;
    D.card(c, x, y, w, h, T);
    D.text(c, t('link.start'), x + 20, y + 34, { size: 17, weight: 'bold', color: T.text });
    D.text(c, t('link.start'), x + 20, y + 66, { size: 14, color: T.muted });
    const gap = 10;
    const bw = (w - 40 - gap * 2) / 3;
    const by = y + h - 48;
    this.addButton('confirm-mask', 0, 0, W, H, () => { this.confirming = false; });
    const button = (bx, label, kind, onTap) => {
      if (kind === 'primary') D.fillRoundRect(c, bx, by, bw, 32, 8, T.primary);
      else if (kind === 'replay') {
        D.fillRoundRect(c, bx, by, bw, 32, 8, T.card);
        D.strokeRoundRect(c, bx, by, bw, 32, 8, T.god, 1);
      } else D.fillRoundRect(c, bx, by, bw, 32, 8, T.enter);
      D.text(c, label, bx + bw / 2, by + 16, {
        size: label.length > 8 ? 11 : 12.5, weight: 'bold',
        color: kind === 'primary' ? '#fff' : kind === 'replay' ? T.god : T.enterColor,
        align: 'center',
      });
      this.addButton(`confirm-${kind}`, bx, by, bw, 32, onTap);
    };
    button(x + 20, t('cancel'), 'cancel', () => { this.confirming = false; });
    button(x + 20 + bw + gap, t('link.replayLevel'), 'replay', () => this.replayLevel());
    button(x + 20 + (bw + gap) * 2, t('confirmOk'), 'ok', () => this.startNewGame());
  }

  onTheme() { this.layout(); }
  onHide() { this.save(); }
  onShow() {}
}
module.exports = LinkScene;
