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
const logic = require('./board');
const i18nDict = require('./i18n');

const coreI18n = require('../../core/i18n');
if (!coreI18n.__mirrorRegistered) {
  coreI18n.register('mirror', i18nDict);
  coreI18n.__mirrorRegistered = true;
}

const STATE_KEY = '__emoji_mirror__state';
const REVEAL_MS = 1200;
const FLIP_MS = 350;
const FLIP_STEP = 65;
const GATHER_MS = 420;
const STACK_MS = 120;
const FLY_MS = 450;
const FLY_STEP = 90;
const SWAP_MS = 300;
const CHECK_MS = 500;
const REVEAL = 'reveal', FLIP_DOWN = 'flip-down', GATHER = 'gather', FLY_BACK = 'fly-back', GAME_FLIP = 'game-flip', PLAY = 'play', SWAP = 'swap', CHECK = 'check', WON = 'won';

function fmt(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

class MirrorScene extends Scene {
  constructor(app) {
    super(app);
    this.bg = new ParticleField();
    this.difficulty = 1;
    this.display = [];
    this.game = [];
    this.matches = 0;
    this.phase = REVEAL;
    this.selected = null;
    this.pendingSwap = null;
    this.swapAnim = null;
    this.displayFlips = [];
    this.displayTargets = [];
    this.gameFlips = [];
    this.gameTargets = [];
    this.displayOffsets = [];
    this.displayOffsetTargets = [];
    this.displayScales = [];
    this.displayGatherFrom = [];
    this.displayFlyFrom = [];
    this.displayGatherStart = 0;
    this.displayFlyDelays = [];
    this.displayFlyStart = 0;
    this.displayFlipStart = 0;
    this.displayFlipDelays = [];
    this.gameFlipStart = 0;
    this.gameFlipDelays = [];
    this.phaseEnd = 0;
    this.checkAt = 0;
    this.elapsed = 0;
    this.best = 0;
    this.newBest = false;
    this.helpOpen = false;
    this.revealAt = 0;
    this.winAt = 0;
    this.playStart = 0;
    this.now = Date.now();
    this.layout();
    this.boot();
  }
  get count() { return logic.emojiCount(this.difficulty); }
  get rows() { return logic.rowsOf(this.count); }
  bestKey() { return `__emoji_mirror__best_${this.difficulty}`; }
  boot() {
    if (!this.restore()) this.startRound(this.difficulty);
  }
  startRound(difficulty) {
    this.difficulty = Math.max(1, Math.min(5, difficulty || 1));
    const round = logic.newRound(this.difficulty);
    this.display = round.display;
    this.game = round.game;
    this.matches = 0;
    this.selected = null;
    this.pendingSwap = null;
    this.swapAnim = null;
    this.displayFlips = round.display.map(() => 1);
    this.displayTargets = round.display.map(() => 1);
    this.gameFlips = round.display.map(() => 0);
    this.gameTargets = round.display.map(() => 0);
    this.displayOffsets = round.display.map(() => ({ x: 0, y: 0 }));
    this.displayOffsetTargets = round.display.map(() => ({ x: 0, y: 0 }));
    this.displayScales = round.display.map(() => 1);
    this.displayGatherFrom = round.display.map(() => ({ x: 0, y: 0 }));
    this.displayFlyFrom = round.display.map(() => ({ x: 0, y: 0 }));
    this.displayGatherStart = 0;
    this.displayFlyDelays = round.display.map(() => 0);
    this.displayFlyStart = 0;
    this.displayFlipStart = 0;
    this.displayFlipDelays = round.display.map(() => 0);
    this.gameFlipStart = 0;
    this.gameFlipDelays = round.display.map(() => 0);
    this.phaseEnd = 0;
    this.checkAt = 0;
    this.elapsed = 0;
    this.newBest = false;
    this.phase = REVEAL;
    this.winAt = 0;
    this.revealAt = Date.now() + REVEAL_MS;
    this.playStart = 0;
    const raw = getRaw(this.bestKey(), '');
    this.best = +raw || 0;
    removeRaw(STATE_KEY);
    this.layout();
    this.save();
  }
  save() {
    setRaw(STATE_KEY, JSON.stringify({
      difficulty: this.difficulty, display: this.display, game: this.game,
      matches: this.matches, elapsed: this.elapsed, phase: this.phase,
    }));
  }
  restore() {
    try {
      const raw = getRaw(STATE_KEY, '');
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.display) || !Array.isArray(s.game) || s.display.length !== s.game.length) return false;
      const d = Math.max(1, Math.min(5, +s.difficulty || 1));
      const expected = logic.emojiCount(d);
      if (s.display.length !== expected || s.game.length !== expected) return false;
      this.difficulty = d;
      this.display = s.display;
      this.game = s.game;
      this.matches = +s.matches || 0;
      this.elapsed = +s.elapsed || 0;
      this.phase = s.phase === WON ? WON : PLAY;
      this.playStart = this.phase === PLAY && this.elapsed ? Date.now() - this.elapsed * 1000 : 0;
      // PLAY 恢复时展示区必须是背面；只有 WON 才把展示区翻开。
      const displayFace = this.phase === WON ? 1 : 0;
      this.displayFlips = s.display.map(() => displayFace);
      this.displayTargets = s.display.map(() => displayFace);
      this.gameFlips = s.display.map(() => 1);
      this.gameTargets = s.display.map(() => 1);
      this.displayOffsets = s.display.map(() => ({ x: 0, y: 0 }));
      this.displayOffsetTargets = s.display.map(() => ({ x: 0, y: 0 }));
      this.displayScales = s.display.map(() => 1);
      this.displayGatherFrom = s.display.map(() => ({ x: 0, y: 0 }));
      this.displayFlyFrom = s.display.map(() => ({ x: 0, y: 0 }));
      this.displayGatherStart = 0;
      this.displayFlyDelays = s.display.map(() => 0);
      this.displayFlyStart = 0;
      this.displayFlipStart = 0;
      this.displayFlipDelays = s.display.map(() => 0);
      this.gameFlipStart = 0;
      this.gameFlipDelays = s.display.map(() => 0);
      this.swapAnim = null;
      this.pendingSwap = null;
      this.winAt = 0;
      this.best = +(getRaw(this.bestKey(), '') || 0);
      this.layout();
      return true;
    } catch (e) { return false; }
  }
  update(dt) {
    if (this.bg) this.bg.update(dt || 16);
    const now = Date.now();
    const delta = Math.min(50, dt || 16);
    this.now = now;
    const flipStep = delta / FLIP_MS;
    for (let i = 0; i < this.displayFlips.length; i++) {
      if ((this.displayFlipDelays[i] || 0) && now - this.displayFlipStart < this.displayFlipDelays[i]) continue;
      if (this.displayFlips[i] < this.displayTargets[i]) this.displayFlips[i] = Math.min(this.displayTargets[i], this.displayFlips[i] + flipStep);
      else if (this.displayFlips[i] > this.displayTargets[i]) this.displayFlips[i] = Math.max(this.displayTargets[i], this.displayFlips[i] - flipStep);
    }
    for (let i = 0; i < this.gameFlips.length; i++) {
      if ((this.gameFlipDelays[i] || 0) && now - this.gameFlipStart < this.gameFlipDelays[i]) continue;
      if (this.gameFlips[i] < this.gameTargets[i]) this.gameFlips[i] = Math.min(this.gameTargets[i], this.gameFlips[i] + flipStep);
      else if (this.gameFlips[i] > this.gameTargets[i]) this.gameFlips[i] = Math.max(this.gameTargets[i], this.gameFlips[i] - flipStep);
    }
    if (this.phase === REVEAL && now >= this.revealAt) {
      this.phase = FLIP_DOWN;
      this.displayTargets = this.displayTargets.map(() => 0);
      this.displayFlipStart = now;
      this.displayFlipDelays = this.displayTargets.map((_, i) => i * 20);
      this.phaseEnd = now + (this.count - 1) * FLIP_STEP + FLIP_MS;
    } else if (this.phase === FLIP_DOWN && now >= this.phaseEnd) {
      this.phase = GATHER;
      this.displayGatherStart = now;
      this.displayGatherFrom = this.displayOffsets.map(o => ({ x: o.x, y: o.y }));
      const cy = this.boardY + this.displayH / 2;
      this.displayOffsetTargets = this.areaRects(this.boardY, this.rows).map(r => ({
        x: W / 2 - (r.x + r.w / 2),
        y: cy - (r.y + r.h / 2),
      }));
      this.phaseEnd = now + GATHER_MS;
    } else if (this.phase === GATHER && now >= this.phaseEnd) {
      // 聚拢结束的一帧直接对齐到同一个中心点，避免指数插值留下几像素偏差。
      this.displayOffsets = this.displayOffsetTargets.map(t => ({ x: t.x, y: t.y }));
      this.displayScales = this.display.map(() => 0.82);
      this.phase = 'stack';
      this.phaseEnd = now + STACK_MS;
    } else if (this.phase === 'stack' && now >= this.phaseEnd) {
      this.phase = FLY_BACK;
      this.displayFlyStart = now;
      this.displayFlyFrom = this.displayOffsets.map(o => ({ x: o.x, y: o.y }));
      const order = this.display.map((_, i) => i).sort(() => Math.random() - 0.5);
      this.displayFlyDelays = this.display.map(() => 0);
      order.forEach((idx, k) => { this.displayFlyDelays[idx] = k * FLY_STEP; });
      this.phaseEnd = now + (this.count - 1) * FLY_STEP + FLY_MS;
    } else if (this.phase === FLY_BACK) {
      if (now >= this.phaseEnd) {
        this.displayOffsets = this.displayOffsets.map(() => ({ x: 0, y: 0 }));
        this.displayScales = this.displayScales.map(() => 1);
        this.phase = GAME_FLIP;
        this.gameTargets = this.gameTargets.map(() => 1);
        this.gameFlipStart = now;
        this.gameFlipDelays = this.gameTargets.map((_, i) => i * 20);
        this.phaseEnd = now + (this.count - 1) * FLIP_STEP + FLIP_MS;
      }
    } else if (this.phase === GAME_FLIP && now >= this.phaseEnd) {
      this.phase = PLAY;
      this.playStart = now;
      this.save();
    }
    // 洗牌位移全部按时间缓动，不用逐帧指数插值；缩放也一起过渡，避免飞出瞬间从 0.82 跳到 1。
    if (this.phase === GATHER) {
      const p = Math.max(0, Math.min(1, (now - this.displayGatherStart) / GATHER_MS));
      const e = 1 - Math.pow(1 - p, 3);
      for (let i = 0; i < this.displayOffsets.length; i++) {
        const f = this.displayGatherFrom[i] || { x: 0, y: 0 };
        const t = this.displayOffsetTargets[i];
        this.displayOffsets[i].x = f.x + (t.x - f.x) * e;
        this.displayOffsets[i].y = f.y + (t.y - f.y) * e;
        this.displayScales[i] = 1 - 0.18 * e;
      }
    } else if (this.phase === 'stack') {
      for (let i = 0; i < this.displayOffsets.length; i++) {
        this.displayOffsets[i].x = this.displayOffsetTargets[i].x;
        this.displayOffsets[i].y = this.displayOffsetTargets[i].y;
        this.displayScales[i] = 0.82;
      }
    } else if (this.phase === FLY_BACK) {
      for (let i = 0; i < this.displayOffsets.length; i++) {
        const p = Math.max(0, Math.min(1, (now - this.displayFlyStart - this.displayFlyDelays[i]) / FLY_MS));
        const e = 1 - Math.pow(1 - p, 3);
        const f = this.displayFlyFrom[i] || { x: 0, y: 0 };
        this.displayOffsets[i].x = f.x * (1 - e);
        this.displayOffsets[i].y = f.y * (1 - e);
        this.displayScales[i] = 0.82 + 0.18 * e;
      }
    } else if (this.phase !== GAME_FLIP && this.phase !== PLAY && this.phase !== WON) {
      for (let i = 0; i < this.displayOffsets.length; i++) this.displayScales[i] = 1;
    }
    if ((this.phase === PLAY || this.phase === CHECK) && this.playStart && !this.helpOpen) this.elapsed = Math.floor((now - this.playStart) / 1000);
    if (this.phase === SWAP && this.swapAnim && now >= this.swapAnim.at) this.finishSwap();
    if (this.phase === CHECK && now >= this.checkAt) this.finishCheck();
  }
  finishSwap() {
    const { a, b } = this.swapAnim;
    this.swapAnim = null;
    this.game = logic.swapAt(this.game, a, b);
    this.matches = logic.sameCount(this.game, this.display);
    this.phase = CHECK;
    this.checkAt = Date.now() + CHECK_MS;
    this.app.audio.playElimination();
    this.save();
  }
  finishCheck() {
    if (this.matches === this.count) {
      this.phase = WON;
      this.winAt = Date.now() + (this.count - 1) * 20 + FLIP_MS + 60;
      this.displayTargets = this.displayTargets.map(() => 1);
      this.displayFlipStart = Date.now();
      this.displayFlipDelays = this.displayTargets.map((_, i) => i * 20);
      this.gameTargets = this.gameTargets.map(() => 1);
      this.gameFlipStart = Date.now();
      this.gameFlipDelays = this.gameTargets.map((_, i) => i * 20);
      const prev = +(getRaw(this.bestKey(), '') || 0);
      this.newBest = !prev || this.elapsed < prev;
      if (this.newBest) {
        this.best = this.elapsed;
        setRaw(this.bestKey(), String(this.best));
      }
      this.app.audio.playSuccess();
    } else {
      this.phase = PLAY;
    }
    this.save();
  }
  onCard(i) {
    if (this.phase !== PLAY || this.swapAnim) return;
    if (this.selected == null) { this.selected = i; return; }
    if (this.selected === i) { this.selected = null; return; }
    const a = this.selected;
    this.selected = null;
    this.swapAnim = { a, b: i, at: Date.now() + SWAP_MS };
    this.phase = SWAP;
  }
  changeDifficulty(delta) {
    const next = this.difficulty + delta;
    if (next < 1 || next > 5) return;
    this.startRound(next);
  }
  layout() {
    this.cw = Math.min(W - 32, 440);
    this.cx = (W - this.cw) / 2;
    this.top = HEADER.TOP;
    this.headerH = HEADER.HEIGHT;
    this.homeRect = { ...HEADER.HOME_RECT };
    this.scoreY = this.top + this.headerH + 6;
    this.scoreH = 72;
    this.optY = this.scoreY + this.scoreH + 16;
    this.optH = 72;
    this.boardY = this.optY + this.optH + 16;
    const reserve = SAFE_BOTTOM + 96;
    const availH = Math.max(180, H - this.boardY - reserve);
    const rows = this.rows;
    const maxCols = Math.max(...rows);
    const rowCount = rows.length * 2;
    const gap = 8;
    this.card = Math.max(26, Math.min(72, Math.floor((this.cw - gap * (maxCols - 1)) / maxCols), Math.floor((availH - 44 - gap * (rowCount - 1)) / rowCount)));
    this.gap = gap;
    this.displayH = this.rows.length * this.card + (this.rows.length - 1) * gap;
    this.hintY = this.boardY + this.displayH + 10;
    this.hintH = 28;
    this.gameY = this.hintY + this.hintH + 10;
    this.helpFab = { x: W - 16 - 40, y: H - SAFE_BOTTOM - 16 - 40, w: 40, h: 40 };
  }
  areaRects(y, rows) {
    const out = [];
    let at = 0;
    rows.forEach((n, ri) => {
      const total = n * this.card + (n - 1) * this.gap;
      const start = (W - total) / 2;
      for (let i = 0; i < n; i++) {
        out.push({ x: start + i * (this.card + this.gap), y: y + ri * (this.card + this.gap), w: this.card, h: this.card, index: at + i });
      }
      at += n;
    });
    return out;
  }
  render(c) {
    this.buttons = [];
    const T = theme.tokens;
    c.fillStyle = T.bg; c.fillRect(0, 0, W, H);
    this.bg.draw(c, theme.dark);
    this.drawHeader(c);
    this.drawScore(c);
    this.drawOptions(c);
    this.drawAreas(c);
    if (!this.helpOpen) this.drawFab(c);
    if (this.helpOpen) this.drawHelp(c);
  }
  drawHeader(c) {
    const T = theme.tokens;
    D.text(c, t('mirror.gameTitle'), W / 2, this.top + this.headerH / 2, { size: 15, weight: 'bold', color: T.text, align: 'center' });
    if (!icons.draw(c, 'home', this.homeRect.x + 20, this.homeRect.y + 20, 24, T.text)) D.text(c, '⌂', this.homeRect.x + 20, this.homeRect.y + 20, { size: 24, color: T.text, align: 'center' });
    this.addButton('home', this.homeRect.x, this.homeRect.y, this.homeRect.w, this.homeRect.h, () => this.app.goHome());
  }
  drawScore(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.scoreY, this.cw, this.scoreH, T);
    const half = this.cw / 2;
    D.divider(c, this.cx + half, this.scoreY + this.scoreH / 2, 24, T.border, 1);
    D.text(c, t('mirror.best'), this.cx + half / 2, this.scoreY + 24, { size: 12, color: T.muted, align: 'center' });
    D.text(c, this.best ? fmt(this.best) : '--:--', this.cx + half / 2, this.scoreY + 48, { size: 22, weight: 'bold', color: T.text, align: 'center' });
    D.text(c, t('mirror.time'), this.cx + half + half / 2, this.scoreY + 24, { size: 12, color: T.muted, align: 'center' });
    drawTimer(c, 'stopwatch', this.cx + half + half / 2, this.scoreY + 48, fmt(this.elapsed), { size: 18, color: T.text });
  }
  drawOptions(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.optY, this.cw, this.optH, T);
    const x1 = this.cx + this.cw / 2;
    D.divider(c, x1, this.optY + this.optH / 2, 24, T.border, 1);
    const mid = this.optY + this.optH / 2;
    const numW = D.measure(c, String(this.count), 18, 'bold');
    const gap = 12;
    const groupW = 28 + gap + numW + gap + 28;
    const gx = this.cx + (x1 - this.cx - groupW) / 2;
    const minus = { x: gx, y: mid - 14, w: 28, h: 28 };
    const plus = { x: gx + groupW - 28, y: mid - 14, w: 28, h: 28 };
    this.drawMiniButton(c, minus, '-', this.difficulty > 1, () => this.changeDifficulty(-1));
    this.drawMiniButton(c, plus, '+', this.difficulty < 5, () => this.changeDifficulty(1));
    D.text(c, String(this.count), gx + 28 + gap + numW / 2, mid, { size: 18, weight: 'bold', color: T.text, align: 'center' });
    const label = t('mirror.start');
    const bw = Math.min(120, D.measure(c, label, 13, 'bold') + 24);
    const bx = this.cx + x1 + (this.cw - (x1 - this.cx) - bw) / 2;
    D.fillRoundRect(c, bx, mid - 16, bw, 32, 8, T.primary);
    D.text(c, label, bx + bw / 2, mid, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('new', bx, mid - 16, bw, 32, () => this.startRound(this.difficulty));
  }
  drawMiniButton(c, r, label, enabled, onTap) {
    const T = theme.tokens;
    D.fillRoundRect(c, r.x, r.y, r.w, r.h, 8, T.card);
    D.strokeRoundRect(c, r.x, r.y, r.w, r.h, 8, T.border, 1);
    D.text(c, label, r.x + r.w / 2, r.y + r.h / 2, { size: 15, weight: 'bold', color: enabled ? T.text : T.border, align: 'center' });
    if (enabled) this.addButton('diff-' + label, r.x - 8, r.y - 8, r.w + 16, r.h + 16, onTap);
  }
  drawAreas(c) {
    const T = theme.tokens;
    const displayRects = this.areaRects(this.boardY, this.rows);
    const gameRects = this.areaRects(this.gameY, this.rows);
    const now = Date.now();
    displayRects.forEach((r, i) => {
      const flip = this.displayFlips[i] == null ? 1 : this.displayFlips[i];
      const sx = Math.max(0.04, Math.abs(Math.cos(Math.PI * flip)));
      const off = this.displayOffsets[i] || { x: 0, y: 0 };
      const scale = this.displayScales[i] == null ? 1 : this.displayScales[i];
      c.save();
      c.translate(r.x + r.w / 2 + off.x, r.y + r.h / 2 + off.y);
      c.scale(sx * scale, scale);
      cards.draw(c, this.display[i], cards.MODE_EMOJI, -r.w / 2, -r.h / 2, r.w, r.h, flip > 0.5, 'mirror', '🪞');
      c.restore();
    });
    // hint bar：交换动画 + CHECK 阶段显示「计算中…」，满 0.5s 后才揭晓对齐数
    const checking = this.phase === SWAP || this.phase === CHECK;
    const hint = checking ? t('mirror.checking') : `${t('mirror.matchHint')} ${this.matches} / ${this.count}`;
    const hw = Math.min(this.cw, D.measure(c, hint, 13, 'bold') + (checking ? 46 : 28));
    const hx = W / 2 - hw / 2;
    const hy = this.hintY;
    D.fillRoundRect(c, hx, hy, hw, this.hintH, 8, T.card);
    D.strokeRoundRect(c, hx, hy, hw, this.hintH, 8, T.border, 1);
    if (checking) {
      c.save();
      c.translate(hx + 15, hy + this.hintH / 2);
      c.rotate((now / 180) % (Math.PI * 2));
      c.strokeStyle = T.primary;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, 0, 5.5, 0, Math.PI * 1.5);
      c.stroke();
      c.restore();
    }
    D.text(c, hint, W / 2 + (checking ? 7 : 0), hy + this.hintH / 2, {
      size: 13, weight: 'bold', color: checking ? T.primary : (this.matches === this.count ? T.win : T.text), align: 'center',
    });
    const swapP = this.swapAnim ? Math.max(0, Math.min(1, (now - (this.swapAnim.at - SWAP_MS)) / SWAP_MS)) : 1;
    const ease = 1 - Math.pow(1 - swapP, 3);
    gameRects.forEach((r, i) => {
      let dx = 0, dy = 0;
      if (this.swapAnim) {
        const { a, b } = this.swapAnim;
        if (i === a) { dx = (gameRects[b].x - r.x) * ease; dy = (gameRects[b].y - r.y) * ease; }
        if (i === b) { dx = (gameRects[a].x - r.x) * ease; dy = (gameRects[a].y - r.y) * ease; }
      }
      const flip = this.gameFlips[i] == null ? 1 : this.gameFlips[i];
      const sx = Math.max(0.04, Math.abs(Math.cos(Math.PI * flip)));
      c.save();
      c.translate(r.x + r.w / 2 + dx, r.y + r.h / 2 + dy);
      c.scale(sx, 1);
      cards.draw(c, this.game[i], cards.MODE_EMOJI, -r.w / 2, -r.h / 2, r.w, r.h, flip > 0.5, 'mirror', '🪞');
      c.restore();
      if (this.selected === i) D.strokeRoundRect(c, r.x + dx + 1, r.y + dy + 1, r.w - 2, r.h - 2, 8, T.primary, 2);
      if (this.phase === PLAY && !this.swapAnim) this.addButton('card-' + i, r.x + dx, r.y + dy, r.w, r.h, () => this.onCard(i));
    });
    if (this.phase === WON) this.drawResult(c, displayRects, gameRects);
  }
  drawResult(c, displayRects, gameRects) {
    if (this.winAt && Date.now() < this.winAt) return;
    if (!this.resultVisible()) return;
    const T = theme.tokens;
    const y0 = this.boardY;
    const y1 = this.gameY + this.displayH;
    D.fillRoundRect(c, this.cx, y0, this.cw, y1 - y0, 14, 'rgba(250,248,239,0.9)');
    const cx = W / 2, cy = y0 + (y1 - y0) / 2;
    D.text(c, `🎉🎉 ${t('mirror.tipWin')} 🎉🎉`, cx, cy - 22, { size: 19, weight: 'bold', color: T.win, align: 'center' });
    D.text(c, fmt(this.elapsed), cx, cy + 6, { size: 18, weight: 'bold', color: T.text, align: 'center' });
    if (this.newBest) D.text(c, t('mirror.newBest'), cx, cy + 30, { size: 13, color: T.muted, align: 'center' });
    const bw = 110;
    D.fillRoundRect(c, cx - bw / 2, cy + 46, bw, 32, 8, T.primary);
    D.text(c, t('mirror.start'), cx, cy + 62, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('retry', cx - bw / 2, cy + 46, bw, 32, () => this.startRound(this.difficulty));
    void displayRects; void gameRects;
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
    const x = 20, w = W - 40;
    const lines = [];
    ['help1', 'help2', 'help3'].forEach((k) => {
      const v = t('mirror.' + k);
      if (v !== 'mirror.' + k) { lines.push(...D.wrapText(c, v, w - 36, 13)); lines.push(''); }
    });
    const lineH = 18;
    const h = Math.min(H - 70, 72 + lines.length * lineH + 52);
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
    D.text(c, t('mirror.confirmText'), bx + bw / 2, by + 14, { size: 12, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('help-ok', bx, by, bw, 28, () => { this.helpOpen = false; });
  }
  onTheme() { this.layout(); }
  onHide() { this.save(); }
  onShow() {}
}
module.exports = MirrorScene;
