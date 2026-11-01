const { W, H, SAFE_BOTTOM } = require('../../core/canvas');
const { Scene } = require('../../core/app');
const theme = require('../../core/theme');
const { t } = require('../../core/i18n');
const { getRaw, setRaw, removeRaw } = require('../../core/storage');
const D = require('../../core/draw');
const ParticleField = require('../../core/particles');
const icons = require('../../core/icons');
const cards = require('../../core/cards');
const HEADER = require('../../core/header');
const { drawTimer } = require('../../core/timer');
const boardLogic = require('./board');
const i18nDict = require('./i18n');

const coreI18n = require('../../core/i18n');
const confetti = require('../../core/confetti');
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
    this.helpOpen = false;
    this.confirming = false;
    this.shuffleAt = 0;
    this.shufflePlan = 0;
    this.combo = 0;
    this.comboAt = 0;
    this.comboUntil = 0;
    this.lastClearAt = 0;
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
    this.helpOpen = false;
    this.confirming = false;
    removeRaw(STATE_KEY);
    this.save();
    this.layout();
  }
  save() {
    setRaw(STATE_KEY, JSON.stringify({
      board: this.board, walls: this.walls, level: this.level,
      time: this.elapsed, phase: this.phase,
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
      if (s.phase === WON && !this.leftPairs) this.phase = WON;
      else if (s.phase === OVER && this.leftPairs) this.phase = OVER;
      else if (this.leftPairs) this.phase = PLAY;
      else return false;
      if (this.phase === PLAY && !boardLogic.hasMove(this.board, this.rows, this.cols, this.walls)) {
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
      this.board = boardLogic.shuffleBoard(this.board, this.rows, this.cols, Math.random, this.walls);
      if (!boardLogic.hasMove(this.board, this.rows, this.cols, this.walls)) {
        const remaining = allTiles(this.board);
        this.board = boardLogic.generateBoard(this.rows, this.cols, remaining, Math.random, remaining.length / 2, this.walls);
      }
      this.save();
    }
    this.elapsed += delta / 1000;
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
  onCell(r, c) {
    if (this.phase !== PLAY || this.helpOpen || this.confirming || this.shufflePlan) return;
    if (!this.board[r]) return;
    const value = this.board[r][c];
    if (!value || (this.walls[r] && this.walls[r][c])) return;
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
    this.combo = this.lastClearAt && now - this.lastClearAt < 2500 ? this.combo + 1 : 1;
    this.lastClearAt = now;
    this.comboAt = now;
    this.comboUntil = now + 1500;
    if (this.combo >= 2) this.spawnBurst();
    this.selected = null;
    // 逻辑上立刻移除两张牌，但保留一份闪烁 ghost 和连线；这样其它牌可以继续点。
    this.board[r1][c1] = null;
    this.board[r][c] = null;
    this.clears.push({ at: now + 520, start: now, path, cells: [[r1, c1], [r, c]], items: [value, value] });
    this.app.audio.playElimination();
    this.save();
  }
  breakCombo() { this.lastClearAt = 0; this.combo = 0; this.comboAt = 0; this.comboUntil = 0; }
  afterClears() {
    if (this.clears.length) return;
    if (!this.leftPairs) {
      this.phase = WON;
      this.best = Math.max(this.best, this.level + 1);
      setRaw(BEST_KEY, String(this.best));
      this.app.audio.playSuccess();
      this.startConfetti();
      this.save();
      return;
    }
    if (!boardLogic.hasMove(this.board, this.rows, this.cols, this.walls)) {
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
    this.helpFab = { x: W - 16 - 40, y: H - SAFE_BOTTOM - 16 - 40, w: 40, h: 40 };
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
    const third = this.cw / 3;
    const stats = [[t('link.levelLabel'), String(this.level)], [t('link.timeLeft'), fmt(this.timeLeft)], [t('link.leftPairs'), String(this.leftPairs)]];
    stats.forEach(([label, value], i) => {
      if (i) D.divider(c, this.cx + third * i, this.scoreY + this.scoreH / 2, 24, T.border, 1);
      D.text(c, label, this.cx + third * (i + 0.5), this.scoreY + 24, { size: 11, color: T.muted, align: 'center' });
      if (i === 1) {
        drawTimer(c, 'hourglass', this.cx + third * 1.5, this.scoreY + 48, value, {
          size: 20, color: this.timeLeft <= 15 ? T.del : T.text,
        });
      } else {
        D.text(c, value, this.cx + third * (i + 0.5), this.scoreY + 48, {
          size: 22, weight: 'bold', color: T.text, align: 'center',
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
    const bw = Math.min(110, D.measure(c, label, 13, 'bold') + 24);
    const bx = (x1 + this.cx + this.cw) / 2 - bw / 2;
    D.fillRoundRect(c, bx, this.optY + 20, bw, 32, 8, T.primary);
    D.text(c, label, bx + bw / 2, this.optY + 36, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('new', bx, this.optY + 20, bw, 32, () => { this.confirming = true; });
  }
  drawTip(c) {
    const T = theme.tokens;
    let text = '';
    let combo = false;
    if (this.combo >= 2 && Date.now() < this.comboUntil) {
      text = t('link.comboTip').replace('{n}', String(this.combo));
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
  drawResult(c) {
    if (!this.resultVisible()) return;
    const T = theme.tokens;
    D.fillRoundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 14, 'rgba(250,248,239,0.9)');
    const cx = W / 2, cy = this.boardY + this.boardH / 2;
    if (this.phase === WON) {
      D.text(c, `🎉🎉 ${t('link.levelDone').replace('{n}', this.level)} 🎉🎉`, cx, cy - 24, { size: 18, weight: 'bold', color: T.win, align: 'center' });
      const bw = 100, gap = 10, bx = cx - (bw * 2 + gap) / 2;
      D.strokeRoundRect(c, bx, cy + 20, bw, 32, 8, T.god, 1);
      D.text(c, t('link.replayLevel'), bx + bw / 2, cy + 36, { size: 12, weight: 'bold', color: T.god, align: 'center' });
      this.addButton('replay', bx, cy + 20, bw, 32, () => this.replayLevel());
      D.fillRoundRect(c, bx + bw + gap, cy + 20, bw, 32, 8, T.primary);
      D.text(c, t('link.nextLevel'), bx + bw + gap + bw / 2, cy + 36, { size: 12, weight: 'bold', color: '#fff', align: 'center' });
      this.addButton('next', bx + bw + gap, cy + 20, bw, 32, () => this.nextLevel());
    } else {
      D.text(c, `👻👻 ${t('link.timeUp')} 👻👻`, cx, cy - 18, { size: 18, weight: 'bold', color: T.lose, align: 'center' });
      const bw = 108;
      D.fillRoundRect(c, cx - bw / 2, cy + 20, bw, 32, 8, T.primary);
      D.text(c, t('link.replayLevel'), cx, cy + 36, { size: 12, weight: 'bold', color: '#fff', align: 'center' });
      this.addButton('replay', cx - bw / 2, cy + 20, bw, 32, () => this.replayLevel());
    }
  }
  drawFab(c) {
    const T = theme.tokens, r = this.helpFab;
    c.save(); c.shadowColor = 'rgba(0,0,0,0.12)'; c.shadowBlur = 10; c.shadowOffsetY = 2;
    D.circle(c, r.x + r.w / 2, r.y + r.h / 2, r.w / 2, T.card); c.restore();
    if (!icons.draw(c, 'help', r.x + r.w / 2, r.y + r.h / 2, 20, T.text)) D.text(c, '?', r.x + r.w / 2, r.y + r.h / 2, { size: 18, color: T.text, align: 'center' });
    this.addButton('help', r.x, r.y, r.w, r.h, () => { this.helpOpen = true; });
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
