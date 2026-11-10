const { W, H, SAFE_TOP, SAFE_BOTTOM } = require('../../core/canvas');
const share = require('../../core/share');
const { Scene } = require('../../core/app');
const theme = require('../../core/theme');
const { t } = require('../../core/i18n');
const { getRaw, setRaw, removeRaw } = require('../../core/storage');
const D = require('../../core/draw');
const ParticleField = require('../../core/particles');
const icons = require('../../core/icons');
const fabKit = require('../../core/fab');
const cards = require('../../core/cards');
const HEADER = require('../../core/header');
const { drawTimer } = require('../../core/timer');
const { wrongShake, popScale } = require('../../core/fx');
const i18nDict = require('./i18n');

const coreI18n = require('../../core/i18n');
const confetti = require('../../core/confetti');
const achv = require('../../core/achv');
if (!coreI18n.__hunterRegistered) {
  coreI18n.register('hunter', i18nDict);
  coreI18n.__hunterRegistered = true;
}

const MEMORY = 'memory';
const FLIP = 'flip';
const ANSWER = 'answer';
const WON = 'won';
const LOST = 'lost';
const PREFIX = '__emoji_hunter__';
const MODE_KEY = `${PREFIX}mode`;
const LEVELS = [
  { show: 3, grid: [3, 3] }, { show: 4, grid: [3, 4] }, { show: 5, grid: [3, 4] },
  { show: 6, grid: [4, 4] }, { show: 7, grid: [4, 4] }, { show: 8, grid: [4, 5] },
];
const CARD_LEVELS = [
  { show: 4, grid: [3, 4] }, { show: 5, grid: [3, 5] }, { show: 6, grid: [3, 6] },
  { show: 7, grid: [4, 6] }, { show: 8, grid: [4, 7] }, { show: 9, grid: [4, 8] },
];
const HEARTS_MAX = 3;

function suffix(mode) { return mode === 1 ? '' : `_${mode}`; }
function levelKey(mode) { return `${PREFIX}level${suffix(mode)}`; }
function bestKey(mode) { return `${PREFIX}best${suffix(mode)}`; }
function loadMode() {
  const raw = getRaw(MODE_KEY, '');
  const n = +raw;
  if ([1, 2, 3].includes(n)) return n;
  const face = getRaw('__games_hub__face', 'emoji');
  return face === 'poker' ? 2 : face === 'mahjong' ? 3 : 1;
}
function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function fmt(sec) { return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; }

class HunterScene extends Scene {
  constructor(app) {
    super(app);
    this.bg = new ParticleField();
    this.mode = loadMode();
    this.level = 0;
    this.phase = MEMORY;
    this.stage = [];
    this.candidates = [];
    this.stageFlips = [];
    this.stageTargets = [];
    this.candFlips = [];
    this.candTargets = [];
    this.stageFlipStart = 0;
    this.stageFlipDelays = [];
    this.candFlipStart = 0;
    this.candFlipDelays = [];
    this.found = new Set();
    this.wrong = new Set();
    this.candFx = new Map();
    this.hearts = HEARTS_MAX;
    this.best = +(getRaw(bestKey(this.mode), 0) || 0);
    this.memLeft = 0;
    this.time = 0;
    this.memoryEnd = 0;
    this.playStart = 0;
    this.settleAt = 0;
    this.lock = false;
    this.keepBestOnNewGame = true;
    this.confirming = false;
    this.helpOpen = false;
    this.confetti = [];
    this.confettiUntil = 0;
    this.lastConfettiAt = 0;
    this.now = Date.now();
    this.layout();
    this.boot();
  }
  get levels() { return this.mode === 2 ? CARD_LEVELS : LEVELS; }
  get conf() { return this.levels[this.level]; }
  get modeName() { return t(this.mode === 2 ? 'hunter.modePoker' : this.mode === 3 ? 'hunter.modeEmoji' : 'hunter.modeEmoji'); }
  get targetText() { return `${this.stage.length} · ${this.conf.grid[0]}×${this.conf.grid[1]}`; }
  loadRecords() { this.best = +(getRaw(bestKey(this.mode), 0) || 0); }
  saveState() {
    setRaw(levelKey(this.mode), JSON.stringify({
      level: this.level, hearts: this.hearts, phase: this.phase, time: this.time,
      stage: this.stage, candidates: this.candidates, found: [...this.found], wrong: [...this.wrong],
    }));
  }
  restore() {
    try {
      const raw = getRaw(levelKey(this.mode), '');
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || typeof s.level !== 'number') return false;
      this.level = Math.min(this.levels.length - 1, Math.max(0, s.level));
      if ((s.phase === WON || s.phase === LOST) && Array.isArray(s.stage) && Array.isArray(s.candidates)) {
        this.stage = s.stage;
        this.candidates = s.candidates;
        this.found = new Set(s.found || []);
        this.wrong = new Set(s.wrong || []);
        this.hearts = typeof s.hearts === 'number' ? s.hearts : 0;
        this.phase = s.phase === WON ? WON : LOST;
        this.stageFlips = new Array(this.stage.length).fill(1);
        this.stageTargets = new Array(this.stage.length).fill(1);
        this.candFlips = new Array(this.candidates.length).fill(1);
        this.candTargets = new Array(this.candidates.length).fill(1);
        this.time = Math.max(0, +s.time || 0);
        this.lock = true;
        this.layout();
        return true;
      }
      this.startLevel();
      return true;
    } catch (e) { return false; }
  }
  boot() { this.loadRecords(); if (!this.restore()) this.startLevel(); }
  startLevel() {
    this.level = Math.max(0, Math.min(this.levels.length - 1, this.level));
    this.found = new Set();
    this.wrong = new Set();
    this.candFx = new Map();
    this.hearts = HEARTS_MAX;
    this.phase = MEMORY;
    this.time = 0;
    this.playStart = 0;
    this.lock = false;
    const cfg = this.conf;
    const total = cfg.show + cfg.grid[0] * cfg.grid[1] - cfg.show;
    const pool = shuffle(cards.poolFor(this.mode));
    const items = [];
    for (let i = 0; i < total; i++) items.push(pool[i % pool.length]);
    // 保证唯一：侦探/猎手盘面需要不同牌面；池子不足时允许重复
    this.stage = items.slice(0, cfg.show);
    this.candidates = shuffle(this.stage.concat(items.slice(cfg.show)));
    this.stageFlips = new Array(this.stage.length).fill(0);
    this.stageTargets = new Array(this.stage.length).fill(1);
    this.stageFlipStart = Date.now();
    this.stageFlipDelays = Array.from({ length: this.stage.length }, (_, i) => i * 25);
    this.candFlips = new Array(this.candidates.length).fill(0);
    this.candTargets = new Array(this.candidates.length).fill(0);
    this.candFlipStart = Date.now();
    this.candFlipDelays = Array.from({ length: this.candidates.length }, (_, i) => i * 20);
    this.now = Date.now();
    const ms = 3000 + Math.max(0, this.level - 2) * 400;
    this.memLeft = Math.ceil(ms / 1000);
    this.memoryEnd = this.now + ms;
    removeRaw(levelKey(this.mode));
    this.layout();
  }
  update(dt) {
    this.now = Date.now();
    if (this.bg) this.bg.update(dt || 16);
    if (this.helpOpen || this.confirming) return;
    const flipStep = Math.min(32, dt || 16) / 450;
    for (let i = 0; i < this.stageFlips.length; i++) {
      if ((this.stageFlipDelays[i] || 0) && this.now - this.stageFlipStart < this.stageFlipDelays[i]) continue;
      if (this.stageFlips[i] < this.stageTargets[i]) this.stageFlips[i] = Math.min(this.stageTargets[i], this.stageFlips[i] + flipStep);
      else if (this.stageFlips[i] > this.stageTargets[i]) this.stageFlips[i] = Math.max(this.stageTargets[i], this.stageFlips[i] - flipStep);
    }
    for (let i = 0; i < this.candFlips.length; i++) {
      if ((this.candFlipDelays[i] || 0) && this.now - this.candFlipStart < this.candFlipDelays[i]) continue;
      if (this.candFlips[i] < this.candTargets[i]) this.candFlips[i] = Math.min(this.candTargets[i], this.candFlips[i] + flipStep);
      else if (this.candFlips[i] > this.candTargets[i]) this.candFlips[i] = Math.max(this.candTargets[i], this.candFlips[i] - flipStep);
    }
    if (this.phase === MEMORY) {
      this.memLeft = Math.max(0, Math.ceil((this.memoryEnd - this.now) / 1000));
      if (this.now >= this.memoryEnd) {
        this.phase = FLIP;
        this.flipAt = this.now + 500;
      }
    } else if (this.phase === FLIP) {
      if (this.now >= this.flipAt) {
        this.phase = ANSWER;
        // 玩家开始选择前，展示区目标牌先翻回背面；候选区同时翻正。
        this.stageTargets = this.stageTargets.map(() => 0);
        this.stageFlipStart = this.now;
        this.stageFlipDelays = this.stageTargets.map((_, i) => i * 20);
        this.candTargets = this.candTargets.map(() => 1);
        this.candFlipStart = this.now;
        this.candFlipDelays = this.candTargets.map((_, i) => i * 20);
        this.playStart = this.now;
        this.time = 0;
      }
    } else if (this.phase === ANSWER) {
      if (this.playStart) this.time = Math.floor((this.now - this.playStart) / 1000);
      if (this.lock && this.settleAt && this.now >= this.settleAt) {
        if (this.hearts <= 0) {
          // 失败：把上方答案区还没找到的目标牌全部翻正。
          this.stageTargets = this.stageTargets.map(() => 1);
          this.stageFlipStart = this.now;
          this.stageFlipDelays = this.stageTargets.map((_, i) => i * 20);
          this.phase = LOST;
          this.app.audio.playLose();
          this.saveState();
        }
        else if (this.found.size === this.stage.length) {
          this.phase = WON;
          this.best = Math.max(this.best, this.level + 1);
          achv.win('hunter', { mode: this.mode, level: this.level + 1 });
          setRaw(bestKey(this.mode), String(this.best));
          this.saveState();
          this.startConfetti();
          this.app.audio.playSuccess();
        }
        this.settleAt = 0;
      }
    }
    if (this.now < this.confettiUntil && this.now - this.lastConfettiAt >= 40) {
      this.lastConfettiAt = this.now;
      this.emitConfetti();
    }
    this.confetti = confetti.update(this.confetti, dt || 16, H);
  }
  pick(item) {
    if (this.phase !== ANSWER || this.lock) return;
    const key = cards.keyOf(item);
    if (this.found.has(key) || this.wrong.has(key)) return;
    if (this.stage.some(x => cards.keyOf(x) === key)) {
      this.found.add(key);
      const ci = this.candidates.findIndex(x => cards.keyOf(x) === key);
      if (ci >= 0) this.candFx.set(ci, { type: 'correct', at: Date.now() });
      // 找回目标后，上方对应位置的目标牌翻正（其余仍保持背面）。
      const si = this.stage.findIndex(x => cards.keyOf(x) === key);
      if (si >= 0) this.stageTargets[si] = 1;
      this.app.audio.playElimination();
      if (this.found.size === this.stage.length) {
        this.lock = true;
        this.settleAt = this.now + 500;
      }
    } else {
      this.wrong.add(key);
      const ci = this.candidates.findIndex(x => cards.keyOf(x) === key);
      if (ci >= 0) this.candFx.set(ci, { type: 'wrong', at: Date.now() });
      this.hearts = Math.max(0, this.hearts - 1);
      this.app.audio.playFail();
      if (this.hearts <= 0) { this.lock = true; this.settleAt = this.now + 500; }
    }
  }
  nextLevel() { if (this.level < this.levels.length - 1) this.level++; this.startLevel(); }
  retryLevel() { this.confirming = false; this.startLevel(); }
  startNewGame() { this.confirming = false; this.level = 0; this.startLevel(); }
  toggleMode() { this.mode = this.mode === 1 ? 2 : this.mode === 2 ? 3 : 1; setRaw(MODE_KEY, String(this.mode)); this.loadRecords(); this.boot(); }
  startConfetti() { this.confetti = []; this.confettiUntil = Date.now() + 1200; this.lastConfettiAt = 0; }
  emitConfetti() {
    confetti.spawn(this.confetti, { W, H, startY: H * 0.58, scoreY: this.scoreY });
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
    this.stageY = this.tipY + this.tipH;
    const cfg = this.conf;
    const gap = 8;
    const pad = 6;
    const ratio = cards.ratio(this.mode);
    const capStage = this.mode === 2 ? 48 : this.mode === 3 ? 46 : 64;
    const capCand = this.mode === 2 ? 64 : this.mode === 3 ? 60 : 96;
    const stageByW = Math.floor((this.cw - pad * 2 - (this.stage.length - 1) * gap) / Math.max(1, this.stage.length));
    this.stageW = Math.max(12, Math.min(capStage, stageByW));
    this.stageH = Math.round(this.stageW * ratio);
    const availH = Math.max(150, H - this.stageY - (SAFE_BOTTOM + 96) - this.stageH - 16);
    const byW = Math.floor((this.cw - pad * 2 - (cfg.grid[1] - 1) * gap) / cfg.grid[1]);
    const byH = Math.floor(((availH - pad * 2 - (cfg.grid[0] - 1) * gap) / cfg.grid[0]) / ratio);
    this.candW = Math.max(12, Math.min(capCand, byW, byH));
    this.candH = Math.round(this.candW * ratio);
    this.stageFrameW = this.stage.length * this.stageW + (this.stage.length - 1) * gap + pad * 2;
    this.candFrameW = cfg.grid[1] * this.candW + (cfg.grid[1] - 1) * gap + pad * 2;
    this.candFrameH = cfg.grid[0] * this.candH + (cfg.grid[0] - 1) * gap + pad * 2;
    this.candY = this.stageY + this.stageH + pad * 2 + 16;
    this.fabSize = 40;
    this.helpFab = { x: W - 16 - 40, y: H - SAFE_BOTTOM - 16 - 40, w: 40, h: 40 };
  }
  render(c) {
    this.buttons = [];
    const T = theme.tokens;
    c.fillStyle = T.bg; c.fillRect(0, 0, W, H);
    this.bg.draw(c, theme.dark);
    this.drawHeader(c);
    this.drawScore(c);
    this.drawOptions(c);
    this.drawStage(c);
    this.drawCandidates(c);
    if (!this.helpOpen && !this.confirming) this.drawFabs(c);
    this.drawConfetti(c);
    if (this.helpOpen) this.drawHelp(c);
    if (this.confirming) this.drawConfirm(c);
  }

  drawHeader(c) {
    const T = theme.tokens;
    D.text(c, t('hunter.gameTitle'), W / 2, this.top + this.headerH / 2, {
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
    const stats = [[t('hunter.bestScore'), this.best || '--'], [t('hunter.levelLabel'), this.level + 1], [t('hunter.livesLabel'), '']];
    stats.forEach(([label, value], i) => {
      if (i) D.divider(c, this.cx + third * i, this.scoreY + this.scoreH / 2, 24, T.border, 1);
      D.text(c, label, this.cx + third * (i + 0.5), this.scoreY + 24, { size: 12, color: T.muted, align: 'center' });
      D.text(c, String(value), this.cx + third * (i + 0.5), this.scoreY + 48, { size: 22, weight: 'bold', color: T.text, align: 'center' });
    });
    let hx = this.cx + third * 2 + 12;
    for (let i = 0; i < HEARTS_MAX; i++) {
      D.text(c, i < this.hearts ? '❤️' : '🤍', hx + 12, this.scoreY + 48, { size: 17, align: 'center', family: '"Apple Color Emoji","Segoe UI Emoji",sans-serif' });
      hx += 25;
    }
  }
  drawOptions(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.optY, this.cw, this.optH, T);
    const x1 = this.cx + this.cw * 0.35;
    const x2 = this.cx + this.cw * 0.6;
    D.divider(c, x1, this.optY + this.optH / 2, 24, T.border, 1);
    D.divider(c, x2, this.optY + this.optH / 2, 24, T.border, 1);
    D.text(c, this.targetText, this.cx + (x1 - this.cx) / 2, this.optY + this.optH / 2, { size: 13, color: T.muted, align: 'center' });
    const observing = this.phase === MEMORY || this.phase === FLIP;
    drawTimer(c, observing ? 'hourglass' : 'stopwatch', (x1 + x2) / 2, this.optY + this.optH / 2,
      fmt(observing ? this.memLeft : this.time), { size: 15, color: observing ? T.del : T.text });
    const label = t('hunter.start');
    const bw = Math.min(110, D.measure(c, label, 13, 'bold') + 24);
    const bx = (x2 + this.cx + this.cw) / 2 - bw / 2;
    const by = this.optY + (this.optH - 32) / 2;
    D.fillRoundRect(c, bx, by, bw, 32, 8, T.primary);
    D.text(c, label, bx + bw / 2, by + 16, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('new', bx, by, bw, 32, () => { this.confirming = true; });
  }
  drawStage(c) {
    const T = theme.tokens;
    const gap = 8;
    const pad = 6;
    const x = (W - this.stageFrameW) / 2;
    D.fillRoundRect(c, x, this.stageY, this.stageFrameW, this.stageH + pad * 2, 14, T.boardBg);
    this.stage.forEach((item, i) => {
      const sx = x + pad + i * (this.stageW + gap);
      const sy = this.stageY + pad;
      const sf = this.stageFlips[i] == null ? 1 : this.stageFlips[i];
      const ssx = Math.max(0.04, Math.abs(Math.cos(Math.PI * sf)));
      c.save();
      c.translate(sx + this.stageW / 2, sy + this.stageH / 2);
      c.scale(ssx, 1);
      cards.draw(c, item, this.mode, -this.stageW / 2, -this.stageH / 2, this.stageW, this.stageH, sf > 0.5, 'target', '🎯');
      c.restore();
      const found = this.found.has(cards.keyOf(item));
      // 绿色只做外圈，不再用半透明色块盖在牌面上；否则翻正后的 emoji 会被压到背景层下面。
      if (found) D.strokeRoundRect(c, sx + 1, sy + 1, this.stageW - 2, this.stageH - 2, 7, T.primary, 2);
    });
    const hint = this.phase === MEMORY ? t('hunter.phaseMemory') : this.phase === FLIP ? t('hunter.phaseFlip') : t('hunter.phaseAnswer');
    const tw = D.measure(c, hint, 13, 'bold');
    D.fillRoundRect(c, W / 2 - (tw + 24) / 2, this.tipY + 2, tw + 24, 24, 8, T.card);
    D.strokeRoundRect(c, W / 2 - (tw + 24) / 2, this.tipY + 2, tw + 24, 24, 8, T.border, 1);
    D.text(c, hint, W / 2, this.tipY + 14, { size: 13, weight: 'bold', color: T.text, align: 'center' });
  }
  drawCandidates(c) {
    const T = theme.tokens;
    const gap = 8;
    const pad = 6;
    const rows = this.conf.grid[0];
    const cols = this.conf.grid[1];
    const x = (W - this.candFrameW) / 2;
    D.fillRoundRect(c, x, this.candY, this.candFrameW, this.candFrameH, 14, T.boardBg);
    this.candidates.forEach((item, i) => {
      const cx = x + pad + (i % cols) * (this.candW + gap);
      const cy = this.candY + pad + Math.floor(i / cols) * (this.candH + gap);
      const key = cards.keyOf(item);
      const known = this.found.has(key) || this.wrong.has(key);
      const cf = this.candFlips[i] == null ? 1 : this.candFlips[i];
      const csx = Math.max(0.04, Math.abs(Math.cos(Math.PI * cf)));
      const fx = this.candFx.get(i);
      const shake = fx && fx.type === 'wrong' ? wrongShake(this.now - fx.at) : 0;
      const scale = fx && fx.type === 'correct' ? popScale(this.now - fx.at) : 1;
      c.save();
      c.translate(cx + this.candW / 2 + shake, cy + this.candH / 2);
      c.scale(csx * scale, scale);
      cards.draw(c, item, this.mode, -this.candW / 2, -this.candH / 2, this.candW, this.candH, cf > 0.5 || known, 'target', '🎯');
      c.restore();
      if (this.found.has(key)) D.strokeRoundRect(c, cx + 1, cy + 1, this.candW - 2, this.candH - 2, 7, T.primary, 3);
      if (this.wrong.has(key)) D.strokeRoundRect(c, cx + 1, cy + 1, this.candW - 2, this.candH - 2, 7, T.lose, 3);
      if (this.phase === ANSWER && !this.lock && !known) this.addButton('cand-' + i, cx, cy, this.candW, this.candH, () => this.pick(item));
    });
    if (this.phase === WON || this.phase === LOST) this.drawResult(c);
  }
  drawResult(c) {
    if (!this.resultVisible()) return;
    const T = theme.tokens;
    // 只盖候选区（游戏区），保留上方目标区/答案区可见
    const x = (W - this.candFrameW) / 2;
    const top = this.candY;
    const h = this.candFrameH;
    share.resultPanel(c, this, top, h);
    const cx = W / 2;
    const cy = top + h / 2;
    if (this.phase === WON) {
      D.text(c, `🎉🎉 ${t('hunter.tipWin')} 🎉🎉`, cx, cy - 24, { size: 18, weight: 'bold', color: T.win, align: 'center' });
      const labels = [t('hunter.replayLevel'), t('hunter.nextLevel')];
      const bw = 100, gap = 10;
      const bx = cx - (bw * 2 + gap) / 2;
      this.button(c, bx, cy + 18, bw, 32, labels[0], false, () => this.retryLevel());
      this.button(c, bx + bw + gap, cy + 18, bw, 32, labels[1], true, () => this.nextLevel());
    } else {
      D.text(c, `👻👻 ${t('hunter.tipLost')} 👻👻`, cx, cy - 18, { size: 18, weight: 'bold', color: T.lose, align: 'center' });
      this.button(c, cx - 55, cy + 20, 110, 32, t('hunter.replayLevel'), false, () => this.retryLevel());
    }
    this.lock = true;
  }
  button(c, x, y, w, h, label, primary, onTap) {
    const T = theme.tokens;
    if (primary) { D.fillRoundRect(c, x, y, w, h, 8, T.primary); D.text(c, label, x + w / 2, y + h / 2, { size: 13, weight: 'bold', color: '#fff', align: 'center' }); }
    else { D.strokeRoundRect(c, x, y, w, h, 8, T.god, 1); D.text(c, label, x + w / 2, y + h / 2, { size: 13, weight: 'bold', color: T.god, align: 'center' }); }
    this.addButton('result-' + label, x, y, w, h, onTap);
  }
  drawConfetti(c) {
    confetti.draw(c, this.confetti.concat(this.bursts || []));
  }
  drawFabs(c) {
    const T = theme.tokens;
    const drawOne = (rect, key, fallback, color, onTap, id) => {
      c.save(); c.shadowColor = 'rgba(0,0,0,0.12)'; c.shadowBlur = 10; c.shadowOffsetY = 2;
      D.circle(c, rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, T.card); c.restore();
      if (!icons.draw(c, key, rect.x + rect.w / 2, rect.y + rect.h / 2, 20, color)) D.text(c, fallback, rect.x + rect.w / 2, rect.y + rect.h / 2, { size: 18, color, align: 'center' });
      this.addButton(id, rect.x, rect.y, rect.w, rect.h, onTap);
    };
    drawOne(this.helpFab, 'help', '?', T.text, () => { this.helpOpen = true; }, 'help');
    const muteRect = fabKit.muteSlot(this.helpFab);
    if (muteRect) fabKit.drawMute(this, c, muteRect);
    const key = this.mode === 2 ? 'mode-poker' : this.mode === 3 ? 'mode-mahjong' : 'mode-emoji';
    const fallback = this.mode === 2 ? '🃏' : this.mode === 3 ? '🀄' : '😀';
    drawOne(fabKit.slotLeft(this.helpFab, muteRect ? 2 : 1), key, fallback, T.primary, () => this.toggleMode(), 'mode');
  }
  drawHelp(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(0, 0, W, H);
    const x = 20, w = W - 40;
    const lines = [];
    ['helpMsg', 'help1', 'help2', 'help3', 'help4', 'help6'].forEach((k) => {
      const v = t('hunter.' + k);
      if (v !== 'hunter.' + k) { lines.push(...D.wrapText(c, v, w - 40, 14)); lines.push(''); }
    });
    const lineH = 20;
    const h = Math.min(H - 80, 74 + lines.length * lineH + 62);
    const y = (H - h) / 2;
    D.card(c, x, y, w, h, T);
    D.text(c, '?', x + 24, y + 30, { size: 24, weight: 'bold', color: T.primary });
    D.text(c, t('help'), x + 50, y + 30, { size: 16, weight: 'bold', color: T.text });
    c.save(); D.roundRect(c, x + 1, y + 1, w - 2, h - 2, 14); c.clip();
    let ly = y + 58;
    lines.forEach((line) => { if (line) D.text(c, line, x + 20, ly, { size: 14, color: T.text }); ly += lineH; });
    c.restore();
    this.addButton('help-mask', 0, 0, W, H, () => { this.helpOpen = false; });
    const bw = 110, bx = x + (w - bw) / 2, by = y + h - 44;
    D.fillRoundRect(c, bx, by, bw, 30, 8, T.primary);
    D.text(c, t('hunter.confirmText'), bx + bw / 2, by + 15, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('help-ok', bx, by, bw, 30, () => { this.helpOpen = false; });
  }
  drawConfirm(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fillRect(0, 0, W, H);
    const w = W - 56;
    const h = 200;
    const x = (W - w) / 2;
    const y = (H - h) / 2;
    D.card(c, x, y, w, h, T);
    D.text(c, t('hunter.start'), x + 20, y + 34, { size: 17, weight: 'bold', color: T.text });
    D.text(c, t('hunter.start'), x + 20, y + 66, { size: 14, color: T.muted });
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
    button(x + 20 + bw + gap, t('hunter.replayLevel'), 'replay', () => this.retryLevel());
    button(x + 20 + (bw + gap) * 2, t('confirmOk'), 'ok', () => this.startNewGame());
  }

  onTheme() { this.layout(); }
  onHide() {}
  onShow() {}
}

module.exports = HunterScene;
