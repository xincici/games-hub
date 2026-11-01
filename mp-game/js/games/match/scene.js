const { W, H, SAFE_TOP, SAFE_BOTTOM } = require('../../core/canvas');
const HEADER = require('../../core/header');
const { drawTimer } = require('../../core/timer');
const { Scene } = require('../../core/app');
const theme = require('../../core/theme');
const { t } = require('../../core/i18n');
const { getRaw, setRaw, removeRaw } = require('../../core/storage');
const D = require('../../core/draw');
const ParticleField = require('../../core/particles');
const icons = require('../../core/icons');
const cards = require('../../core/cards');
const { matchedMotion } = require('../../core/motion');
const { levelConfig, shuffle } = require('./board');
const data = require('./data');
const tiles = require('../../core/tiles');
const i18nDict = require('./i18n');

const coreI18n = require('../../core/i18n');
const confetti = require('../../core/confetti');
if (!coreI18n.__matchRegistered) {
  coreI18n.register('match', i18nDict);
  coreI18n.__matchRegistered = true;
}

const PREVIEW = 'preview';
const PLAY = 'play';
const WON = 'won';
const OVER = 'over';
const MODE_EMOJI = 1;
const MODE_POKER = 2;
const MODE_MAHJONG = 3;
const PREFIX = '__emoji_match__';
const COMBO_MS = 2500;
const FLIP_BACK_MS = 700;
const MATCH_FLIP_MS = 470;
const FLIP_HINT_MS = 2600;
const MODE_KEY = `${PREFIX}mode`;

const modeSuffix = (m) => (m === MODE_POKER ? '_2' : m === MODE_MAHJONG ? '_3' : '');
const levelKeyFor = (m) => `${PREFIX}level${modeSuffix(m)}`;
const bestKeyFor = (m) => `${PREFIX}best_1${modeSuffix(m)}`;
const stateKeyFor = (m) => `${PREFIX}state${modeSuffix(m)}`;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function fmt(sec) { return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; }
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
function rgba(arr) { return D.rgba(arr); }

class MatchScene extends Scene {
  constructor(app) {
    super(app);
    this.bg = new ParticleField();
    this.mode = this.loadMode();
    this.level = this.loadLevel(this.mode);
    this.best = this.loadBest(this.mode);
    this.phase = PREVIEW;
    this.cards = [];
    this.conf = levelConfig(this.level, this.mode);
    this.helpOpen = false;
    this.confirming = false;
    this.firstCard = null;
    this.lock = false;
    this.pendingMatch = null;
    this.pendingMismatch = null;
    this.winAt = 0;
    this.finished = false;
    this.silent = false;
    this.elapsed = 0;
    this.usedTime = 0;
    this.previewLeft = 0;
    this.dealStart = 0;
    this.previewEndAt = 0;
    this.playStart = 0;
    this.flipHintUntil = 0;
    this.combo = 0;
    this.comboAt = 0;
    this.comboUntil = 0;
    this.lastClearAt = 0;
    this.comboBroken = false;
    this.pauseAt = 0;
    this.cardId = 0;
    this.now = Date.now();
    this.confetti = [];
    this.confettiUntil = 0;
    this.lastConfettiAt = 0;
    this.bursts = [];
    this.layout();
    if (this.mode === MODE_MAHJONG) tiles.preload();
    const restored = this.restore();
    this.initLevel(restored ? restored.level : this.level, restored);
  }

  // ---------- storage ----------
  loadMode() {
    const raw = getRaw(MODE_KEY, '');
    const n = +raw;
    if ([MODE_EMOJI, MODE_POKER, MODE_MAHJONG].includes(n)) return n;
    // 没自己选过牌面时，用首页设置里的默认牌面
    const face = getRaw('__games_hub__face', 'emoji');
    return face === 'poker' ? MODE_POKER : face === 'mahjong' ? MODE_MAHJONG : MODE_EMOJI;
  }
  loadLevel(mode) {
    return Math.max(1, Math.floor(+(getRaw(levelKeyFor(mode), 1) || 1)) || 1);
  }
  loadBest(mode) {
    return Math.max(1, Math.floor(+(getRaw(bestKeyFor(mode), 1) || 1)) || 1);
  }
  save() {
    try {
      setRaw(stateKeyFor(this.mode), JSON.stringify({
        level: this.level,
        mode: this.mode,
        phase: this.phase,
        elapsed: this.elapsed,
        usedTime: this.usedTime,
        cards: this.cards.map(c => [c.item, c.matched ? 1 : 0]),
      }));
    } catch (e) { /* ignore */ }
  }
  restore() {
    try {
      const raw = getRaw(stateKeyFor(this.mode), '');
      if (!raw) return null;
      const saved = JSON.parse(raw);
      if (!saved || !Array.isArray(saved.cards) || !saved.cards.length) return null;
      if (saved.mode !== this.mode) return null;
      const lv = Math.max(1, +saved.level || 1);
      const c = levelConfig(lv, this.mode);
      if (saved.cards.length !== c.pairs * 2) return null;
      const allMatched = saved.cards.every(([, matched]) => matched);
      const phase = allMatched ? WON : saved.phase;
      if (phase !== WON && phase !== OVER) return null;
      return {
        level: lv,
        phase,
        elapsed: Math.max(0, +saved.elapsed || 0),
        usedTime: Math.max(0, +saved.usedTime || 0),
        cards: saved.cards.map(([item, matched]) => ({ item, matched: !!matched })),
      };
    } catch (e) {
      return null;
    }
  }

  // ---------- level lifecycle ----------
  initLevel(lv, restored) {
    this.clearTransient();
    this.confirming = false;
    this.helpOpen = false;
    this.level = Math.max(1, lv);
    setRaw(levelKeyFor(this.mode), this.level);
    if (this.level > this.best) {
      this.best = this.level;
      setRaw(bestKeyFor(this.mode), this.best);
    }
    this.conf = levelConfig(this.level, this.mode);
    this.layout();
    this.finished = false;
    if (restored) {
      this.silent = true;
      this.elapsed = restored.elapsed;
      this.usedTime = restored.usedTime;
      this.phase = restored.phase;
      this.cards = restored.cards.map((c, i) => ({
        id: ++this.cardId,
        item: c.item,
        matched: c.matched,
        settled: c.matched,
        flipped: !c.matched && restored.phase === OVER,
        flip: c.matched ? 1 : (!c.matched && restored.phase === OVER ? 1 : 0),
        flipTarget: c.matched ? 1 : (!c.matched && restored.phase === OVER ? 1 : 0),
        index: i,
      }));
      this.previewLeft = 0;
      this.finished = true;
      return;
    }
    this.silent = false;
    removeRaw(stateKeyFor(this.mode));
    this.elapsed = 0;
    this.usedTime = 0;
    this.phase = PREVIEW;
    this.previewLeft = this.conf.preview;
    const pool = this.drawPool(this.conf.pairs);
    const deck = shuffle(pool.concat(pool));
    this.cards = deck.map((item, i) => ({
      id: ++this.cardId,
      item,
      matched: false,
      settled: false,
      flipped: true,
      flip: 1,
      flipTarget: 1,
      index: i,
    }));
    this.dealStart = Date.now();
    this.previewEndAt = Date.now() + this.conf.preview * 1000;
    this.flipHintUntil = 0;
    this.playStart = 0;
  }

  clearTransient() {
    this.firstCard = null;
    this.lock = false;
    this.pendingMatch = null;
    this.pendingMismatch = null;
    this.winAt = 0;
    this.combo = 0;
    this.comboAt = 0;
    this.comboUntil = 0;
    this.lastClearAt = 0;
    this.comboBroken = false;
    this.confetti = [];
    this.confettiUntil = 0;
    this.bursts = [];
  }

  drawPool(pairs) {
    if (this.mode === MODE_MAHJONG) return shuffle(data.MAHJONG_FACES).slice(0, pairs);
    if (this.mode === MODE_POKER) {
      const deck = [];
      data.CARD_TYPES.forEach((type) => {
        for (let num = 1; num <= 13; num++) deck.push({ num, type });
      });
      return shuffle(deck).slice(0, pairs);
    }
    return shuffle(data.EMOJIS).slice(0, pairs);
  }

  layout() {
    const c = this.conf;
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
    this.bottomReserve = SAFE_BOTTOM + 96;
    this.availH = Math.max(130, H - this.boardY - this.bottomReserve);
    this.gap = c.pairs <= 6 ? 6 : c.pairs <= 12 ? 4 : 3;
    this.pad = 6;
    this.ratio = this.mode === MODE_POKER ? 1.5 : this.mode === MODE_MAHJONG ? tiles.TILE_RATIO : 1;
    const cap = this.mode === MODE_POKER ? 64 : 96;
    const byW = Math.floor((this.cw - this.pad * 2 - (c.cols - 1) * this.gap) / c.cols);
    const byH = Math.floor(((this.availH - this.pad * 2 - (c.rows - 1) * this.gap) / c.rows) / this.ratio);
    this.cellW = Math.max(12, Math.min(cap, byW, byH));
    this.cellH = Math.round(this.cellW * this.ratio);
    this.boardW = c.cols * this.cellW + (c.cols - 1) * this.gap + this.pad * 2;
    this.boardH = c.rows * this.cellH + (c.rows - 1) * this.gap + this.pad * 2;
    this.boardX = (W - this.boardW) / 2;
    this.fabSize = 48;
    this.helpX = W - 16 - this.fabSize;
    this.modeX = this.helpX - 60;
    this.fabY = H - SAFE_BOTTOM - 16 - this.fabSize;
  }

  // ---------- update ----------
  update(dt) {
    this.now = Date.now();
    const delta = Math.min(50, dt || 16);
    if (this.bg) this.bg.update(delta);
    this.cards.forEach((card) => {
      if (card.flip < card.flipTarget) card.flip = Math.min(card.flipTarget, card.flip + delta / 450);
      else if (card.flip > card.flipTarget) card.flip = Math.max(card.flipTarget, card.flip - delta / 450);
    });
    if (this.phase === PREVIEW) {
      this.previewLeft = Math.max(0, Math.ceil((this.previewEndAt - this.now) / 1000));
      if (this.now >= this.previewEndAt) this.endPreview();
    } else if (this.phase === PLAY && !this.finished) {
      this.elapsed = Math.floor((this.now - this.playStart) / 1000);
      if (this.elapsed >= this.conf.time) this.loseLevel();
    }
    if (this.pendingMatch && this.now >= this.pendingMatch.at) this.resolveMatch();
    if (this.pendingMismatch && this.now >= this.pendingMismatch.at) this.resolveMismatch();
    if (this.winAt && this.now >= this.winAt) this.win();
    if (this.now < this.confettiUntil && this.now - this.lastConfettiAt >= 40) {
      this.lastConfettiAt = this.now;
      this.emitConfetti();
    }
    this.confetti = confetti.update(this.confetti, dt || 16, H);
    const step = Math.min(50, dt || 16) / 16.67;
    this.bursts.forEach((p) => {
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.vy += 0.22 * step;
      p.rot += p.vr * step;
      p.age += delta;
    });
    this.bursts = this.bursts.filter(p => p.y < H + 30 && p.age < 1600);
  }

  endPreview() {
    if (this.phase !== PREVIEW) return;
    this.cards.forEach((card) => { card.flipped = false; card.flipTarget = 0; });
    this.phase = PLAY;
    this.playStart = Date.now();
    this.elapsed = 0;
    this.flipHintUntil = Date.now() + FLIP_HINT_MS;
  }

  loseLevel() {
    if (this.phase !== PLAY) return;
    this.phase = OVER;
    this.finished = true;
    this.cards.forEach((card) => {
      if (!card.matched) { card.flipped = true; card.flipTarget = 1; }
    });
    this.breakCombo();
    this.app.audio.playLose();
    this.save();
  }

  win() {
    if (this.phase !== PLAY) return;
    this.phase = WON;
    this.finished = true;
    this.usedTime = this.usedTime || this.elapsed;
    this.save();
    this.app.audio.playSuccess();
    this.startConfetti();
    this.winAt = 0;
  }

  onCardClick(card) {
    if (this.phase !== PLAY || this.finished || this.lock || this.helpOpen || this.confirming) return;
    if (card.matched || card.flipped) return;
    card.flipped = true;
    card.flipTarget = 1;
    if (!this.firstCard) {
      this.firstCard = card;
      return;
    }
    const a = this.firstCard;
    this.firstCard = null;
    if (data.keyOf(a.item) === data.keyOf(card.item)) {
      // 配对成功立刻标记 matched，闪烁期间其它牌仍可继续点；不要用 lock 拦住整盘。
      a.flipped = true;
      card.flipped = true;
      a.matched = card.matched = true;
      a.settled = card.settled = false;
      a.matchedAt = card.matchedAt = Date.now();
      this.registerClear();
      this.app.audio.playElimination();
      if (this.cards.every(c => c.matched)) {
        this.usedTime = this.elapsed;
        this.finished = true;
        this.winAt = Date.now() + 1200;
        this.save();
      }
    } else {
      this.breakCombo();
      this.lock = true;
      this.pendingMismatch = { a, b: card, at: Date.now() + FLIP_BACK_MS };
    }
  }

  resolveMatch() {
    const { a, b } = this.pendingMatch;
    this.pendingMatch = null;
    a.matched = b.matched = true;
    a.settled = b.settled = false;
    a.matchedAt = b.matchedAt = Date.now();
    this.lock = false;
    this.registerClear();
    this.app.audio.playElimination();
    if (this.cards.every(card => card.matched)) {
      this.usedTime = this.elapsed;
      this.finished = true;
      this.winAt = Date.now() + 1200;
      this.save();
    }
  }

  resolveMismatch() {
    const { a, b } = this.pendingMismatch;
    this.pendingMismatch = null;
    a.flipped = false;
    b.flipped = false;
    a.flipTarget = 0;
    b.flipTarget = 0;
    this.lock = false;
  }

  registerClear() {
    const now = Date.now();
    const chained = this.lastClearAt > 0 && !this.comboBroken && now - this.lastClearAt < COMBO_MS;
    this.lastClearAt = now;
    this.comboBroken = false;
    this.combo = chained ? this.combo + 1 : 1;
    if (this.combo >= 2) {
      this.comboAt = now;
      this.comboUntil = now + 1500;
      this.spawnBurst();
    }
  }

  breakCombo() {
    this.combo = 0;
    this.comboAt = 0;
    this.comboUntil = 0;
    this.lastClearAt = 0;
    this.comboBroken = true;
  }

  // ---------- level actions ----------
  replayLevel() {
    this.confirming = false;
    this.initLevel(this.level);
  }
  nextLevel() {
    this.initLevel(this.level + 1);
  }
  startNewGame() {
    this.confirming = false;
    removeRaw(bestKeyFor(this.mode));
    this.best = 1;
    this.initLevel(1);
  }
  toggleMode() {
    this.clearTransient();
    this.mode = this.mode === MODE_EMOJI ? MODE_POKER : this.mode === MODE_POKER ? MODE_MAHJONG : MODE_EMOJI;
    setRaw(MODE_KEY, String(this.mode));
    if (this.mode === MODE_MAHJONG) tiles.preload();
    this.level = this.loadLevel(this.mode);
    this.best = this.loadBest(this.mode);
    this.conf = levelConfig(this.level, this.mode);
    this.layout();
    const restored = this.restore();
    this.initLevel(restored ? restored.level : this.level, restored);
  }

  // ---------- pause ----------
  onHide() {
    this.pauseAt = Date.now();
  }
  onShow() {
    if (!this.pauseAt) return;
    const p = Date.now() - this.pauseAt;
    this.pauseAt = 0;
    if (this.previewEndAt) this.previewEndAt += p;
    if (this.playStart) this.playStart += p;
    if (this.dealStart) this.dealStart += p;
    if (this.flipHintUntil) this.flipHintUntil += p;
    if (this.comboUntil) this.comboUntil += p;
    if (this.lastClearAt) this.lastClearAt += p;
    if (this.pendingMatch) this.pendingMatch.at += p;
    if (this.pendingMismatch) this.pendingMismatch.at += p;
    if (this.winAt) this.winAt += p;
    if (this.confettiUntil) this.confettiUntil += p;
  }
  onTheme() { this.layout(); }

  // ---------- confetti ----------
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
        x: cx, y: cy,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 1.5,
        vr: (Math.random() - 0.5) * 0.3,
        rot: Math.random() * Math.PI,
        color: colors[i % colors.length],
        w: 3 + Math.random() * 3,
        h: 2 + Math.random() * 3,
        age: 0,
      });
    }
  }

  // ---------- layout helpers ----------
  cardRect(index) {
    const c = this.conf;
    const row = Math.floor(index / c.cols);
    const col = index % c.cols;
    return {
      x: this.boardX + this.pad + col * (this.cellW + this.gap),
      y: this.boardY + this.pad + row * (this.cellH + this.gap),
      w: this.cellW,
      h: this.cellH,
    };
  }
  leftPairs() {
    return this.cards.filter(c => !c.matched).length / 2;
  }
  clock() {
    return this.phase === PREVIEW ? this.previewLeft : Math.max(0, this.conf.time - this.elapsed);
  }

  // ---------- render ----------
  render(c) {
    this.buttons = [];
    const T = theme.tokens;
    c.fillStyle = T.bg;
    c.fillRect(0, 0, W, H);
    this.bg.draw(c, theme.dark);
    this.drawHeader(c);
    this.drawScore(c);
    this.drawOptions(c);
    this.drawTip(c);
    this.drawBoard(c);
    if (!this.helpOpen && !this.confirming) this.drawFabs(c);
    this.drawConfetti(c);
    if (this.helpOpen) this.drawHelp(c);
    if (this.confirming) this.drawConfirm(c);
  }

  drawHeader(c) {
    const T = theme.tokens;
    D.text(c, t('match.gameTitle'), W / 2, this.top + this.headerH / 2, {
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
    const statW = this.cw / 3;
    const stats = [
      [t('match.bestLevel'), this.best],
      [t('match.levelLabel'), this.level],
      [t('match.leftPairs'), this.leftPairs()],
    ];
    stats.forEach(([label, value], i) => {
      const x = this.cx + statW * (i + 0.5);
      if (i) D.divider(c, this.cx + statW * i, this.scoreY + this.scoreH / 2, 24, T.border, 1);
      D.text(c, label, x, this.scoreY + 25, { size: 12, color: T.muted, align: 'center' });
      D.text(c, String(value), x, this.scoreY + 48, { size: 22, weight: 'bold', color: T.text, align: 'center' });
    });
    const progress = Math.max(0, Math.min(1, (this.conf.pairs - this.leftPairs()) / this.conf.pairs));
    D.progressBar(c, this.cx, this.scoreY, this.cw, this.scoreH, progress, T.border, T.primary);
  }

  drawOptions(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.optY, this.cw, this.optH, T);
    const s1 = this.cw * (1.3 / 4.1);
    const s2 = this.cw * (2.6 / 4.1);
    const x1 = this.cx + s1;
    const x2 = this.cx + s2;
    D.divider(c, x1, this.optY + this.optH / 2, 24, T.border, 1);
    D.divider(c, x2, this.optY + this.optH / 2, 24, T.border, 1);
    D.text(c, `${this.conf.rows}×${this.conf.cols} · ${t('match.pairsLabel').replace('{n}', this.conf.pairs)}`,
      this.cx + s1 / 2, this.optY + this.optH / 2, { size: 14, color: T.muted, align: 'center' });
    const urgent = this.phase === PLAY && this.clock() <= 15;
    drawTimer(c, 'hourglass', (x1 + x2) / 2, this.optY + this.optH / 2, fmt(this.clock()), {
      size: urgent ? 15 : 14, color: urgent ? T.del : T.primary,
    });
    const btnText = t('match.start');
    const bw = Math.min(105, D.measure(c, btnText, 13, 'bold') + 24);
    const bx = this.cx + s2 + (this.cw - s2) / 2 - bw / 2;
    const by = this.optY + (this.optH - 32) / 2;
    D.fillRoundRect(c, bx, by, bw, 32, 8, T.primary);
    D.text(c, btnText, bx + bw / 2, by + 16, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('new', bx, by, bw, 32, () => { this.confirming = true; });
  }

  drawTip(c) {
    const T = theme.tokens;
    let text = '';
    if (this.combo && Date.now() < this.comboUntil) {
      text = t('match.comboTip').replace('{n}', this.combo);
    } else if (this.phase === PREVIEW) {
      text = t('match.hintRemember');
    } else if (this.phase === PLAY && Date.now() < this.flipHintUntil) {
      text = t('match.hintMatch');
    }
    if (!text) return;
    const combo = !!this.combo && Date.now() < this.comboUntil;
    const size = combo ? (this.combo >= 4 ? 16 : this.combo >= 3 ? 14 : 12.5) : 14;
    const tw = D.measure(c, text, size, 'bold');
    const w = tw + 24;
    const h = combo ? 24 : 24;
    const x = W / 2 - w / 2;
    const y = this.tipY + 2;
    c.save();
    if (combo) {
      const age = Date.now() - this.comboAt;
      const p = clamp(age / 1500, 0, 1);
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
    // 点阵底纹（web 的 .dot-board）
    c.save();
    D.roundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 14);
    c.clip();
    c.fillStyle = T.boardDot;
    for (let x = this.boardX + 5; x < this.boardX + this.boardW; x += 10) {
      for (let y = this.boardY + 5; y < this.boardY + this.boardH; y += 10) {
        c.beginPath();
        c.arc(x, y, 1.1, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();
    this.cards.forEach((card, i) => {
      this.drawCard(c, card, i);
      const r = this.cardRect(i);
      if (this.phase === PLAY && !this.finished && !card.matched && !card.flipped && !this.helpOpen && !this.confirming) {
        this.addButton('card-' + card.id, r.x, r.y, r.w, r.h, () => this.onCardClick(card));
      }
    });
    if (this.phase === WON || this.phase === OVER) this.drawResult(c);
  }

  drawCard(c, card, index) {
    const r = this.cardRect(index);
    if (card.settled) return;
    let mScale = 1;
    let mAlpha = 1;
    if (card.matched) {
      const motion = matchedMotion(this.now - card.matchedAt);
      if (motion.done) return;
      mScale = motion.scale;
      mAlpha = motion.alpha;
    }
    let dealScale = 1;
    let dealAlpha = 1;
    if (!this.silent && this.dealStart) {
      const delay = index * 25;
      const p = clamp((this.now - this.dealStart - delay) / 350, 0, 1);
      if (p <= 0) return;
      dealScale = 0.4 + 0.6 * easeOut(p);
      dealAlpha = p;
    }
    const flip = card.flip;
    const scaleX = Math.max(0.04, Math.abs(Math.cos(Math.PI * flip)));
    const faceUp = flip > 0.5;
    c.save();
    c.globalAlpha = mAlpha * dealAlpha;
    c.translate(r.x + r.w / 2, r.y + r.h / 2);
    c.scale(scaleX * mScale * dealScale, mScale * dealScale);
    const x = -r.w / 2;
    const y = -r.h / 2;
    // 全部牌面 / 牌背 / 边框 / 圆角统一走 core/cards，不在对对碰里另画一套。
    cards.draw(c, card.item, this.mode, x, y, r.w, r.h, faceUp, 'bulb', '💡');
    c.restore();
  }

  drawResult(c) {
    if (!this.resultVisible()) return;
    const T = theme.tokens;
    const win = this.phase === WON;
    D.fillRoundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 14, T.overlay);
    const cx = W / 2;
    const cy = this.boardY + this.boardH / 2;
    if (win) {
      D.text(c, `🎉🎉 ${t('match.levelDone').replace('{n}', this.level)} 🎉🎉`, cx, cy - 28, {
        size: Math.min(18, this.boardW / 18), weight: 'bold', color: T.win, align: 'center',
      });
      D.text(c, fmt(this.usedTime), cx, cy + 4, { size: 28, weight: 'bold', color: T.win, align: 'center' });
      const bw = 100;
      const gap = 12;
      const total = bw * 2 + gap;
      const bx = cx - total / 2;
      const by = cy + 38;
      this.drawOutlineButton(c, bx, by, bw, 32, t('match.replayLevel'), () => this.replayLevel());
      this.drawPrimaryButton(c, bx + bw + gap, by, bw, 32, t('match.nextLevel'), () => this.nextLevel());
    } else {
      D.text(c, `⏰ ${t('match.timeUp')} ⏰`, cx, cy - 24, {
        size: Math.min(20, this.boardW / 16), weight: 'bold', color: T.lose, align: 'center',
      });
      D.text(c, `${this.leftPairs()} ${t('match.leftPairsShort')}`, cx, cy + 10, {
        size: 15, color: T.lose, align: 'center',
      });
      const bw = 110;
      this.drawOutlineButton(c, cx - bw / 2, cy + 40, bw, 32, t('match.replayLevel'), () => this.replayLevel());
    }
  }

  drawOutlineButton(c, x, y, w, h, label, onTap) {
    const T = theme.tokens;
    D.fillRoundRect(c, x, y, w, h, 8, 'rgba(0,0,0,0)');
    D.strokeRoundRect(c, x, y, w, h, 8, T.god, 1);
    D.text(c, label, x + w / 2, y + h / 2, { size: 13, weight: 'bold', color: T.god, align: 'center' });
    this.addButton('outline-' + label, x, y, w, h, onTap);
  }
  drawPrimaryButton(c, x, y, w, h, label, onTap) {
    const T = theme.tokens;
    D.fillRoundRect(c, x, y, w, h, 8, T.primary);
    D.text(c, label, x + w / 2, y + h / 2, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('primary-' + label, x, y, w, h, onTap);
  }

  drawFabs(c) {
    this.drawRoundFab(c, this.helpX, this.fabY, 'help', '?', () => { this.helpOpen = true; });
    const modeKey = this.mode === MODE_POKER ? 'mode-poker' : this.mode === MODE_MAHJONG ? 'mode-mahjong' : 'mode-emoji';
    const fallback = this.mode === MODE_POKER ? '🃏' : this.mode === MODE_MAHJONG ? '🀄' : '😀';
    this.drawRoundFab(c, this.modeX, this.fabY, modeKey, fallback, () => this.toggleMode());
  }

  drawRoundFab(c, x, y, iconKey, fallback, onTap) {
    const T = theme.tokens;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.12)';
    c.shadowBlur = 10;
    c.shadowOffsetY = 2;
    D.circle(c, x + this.fabSize / 2, y + this.fabSize / 2, this.fabSize / 2, T.card);
    c.restore();
    if (!icons.draw(c, iconKey, x + this.fabSize / 2, y + this.fabSize / 2, 22, T.primary)) {
      D.text(c, fallback, x + this.fabSize / 2, y + this.fabSize / 2, {
        size: 21, weight: 'bold', color: T.primary, align: 'center',
        family: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif',
      });
    }
    this.addButton('fab-' + iconKey, x, y, this.fabSize, this.fabSize, onTap);
  }

  drawConfetti(c) {
    confetti.draw(c, this.confetti.concat(this.bursts || []));
  }

  drawHelp(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fillRect(0, 0, W, H);
    const x = 20;
    const w = W - 40;
    const lines = [];
    ['helpMsg', 'help1', 'help2', 'help3', 'help4', 'help5'].forEach((k) => {
      const value = t('match.' + k);
      if (value !== 'match.' + k) {
        lines.push(...D.wrapText(c, value, w - 40, 14));
        lines.push('');
      }
    });
    const lineH = 20;
    const h = Math.min(H - 80, 74 + lines.length * lineH + 62);
    const y = (H - h) / 2;
    D.card(c, x, y, w, h, T);
    D.text(c, '?', x + 24, y + 30, { size: 24, weight: 'bold', color: T.primary });
    D.text(c, t('help'), x + 50, y + 30, { size: 16, weight: 'bold', color: T.text });
    c.save();
    D.roundRect(c, x + 1, y + 1, w - 2, h - 2, 14);
    c.clip();
    let ly = y + 58;
    lines.forEach((line) => {
      if (line) D.text(c, line, x + 20, ly, { size: 14, color: T.text });
      ly += lineH;
    });
    c.restore();
    const bw = 110;
    const bx = x + (w - bw) / 2;
    const by = y + h - 44;
    this.addButton('help-close', 0, 0, W, H, () => { this.helpOpen = false; });
    D.fillRoundRect(c, bx, by, bw, 30, 8, T.primary);
    D.text(c, t('match.confirmText'), bx + bw / 2, by + 15, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('help-ok', bx, by, bw, 30, () => { this.helpOpen = false; });
  }

  drawConfirm(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fillRect(0, 0, W, H);
    const w = W - 56;
    const h = 216;
    const x = (W - w) / 2;
    const y = (H - h) / 2;
    D.card(c, x, y, w, h, T);
    D.text(c, t('match.confirmTitle'), x + 20, y + 34, { size: 17, weight: 'bold', color: T.text });
    const lines = D.wrapText(c, t('match.confirmMsg'), w - 40, 14);
    lines.forEach((line, i) => D.text(c, line, x + 20, y + 64 + i * 21, { size: 14, color: T.muted }));
    const gap = 10;
    const bw = (w - 40 - gap * 2) / 3;
    const by = y + h - 48;
    this.addButton('confirm-mask', 0, 0, W, H, () => { this.confirming = false; });
    this.drawConfirmButton(c, x + 20, by, bw, 32, t('match.cancel'), T.border, T.text, () => { this.confirming = false; }, 'cancel');
    this.drawConfirmButton(c, x + 20 + bw + gap, by, bw, 32, t('match.confirmReplay'), T.god, T.god, () => this.replayLevel(), 'replay');
    this.drawConfirmButton(c, x + 20 + (bw + gap) * 2, by, bw, 32, t('match.confirmOk'), T.primary, '#fff', () => this.startNewGame(), 'ok');
  }

  drawConfirmButton(c, x, y, w, h, label, border, color, onTap, id) {
    D.fillRoundRect(c, x, y, w, h, 8, id === 'ok' ? border : 'rgba(0,0,0,0)');
    if (id !== 'ok') D.strokeRoundRect(c, x, y, w, h, 8, border, 1);
    D.text(c, label, x + w / 2, y + h / 2, { size: 12, weight: 'bold', color, align: 'center' });
    this.addButton('confirm-' + id, x, y, w, h, onTap);
  }
}

module.exports = MatchScene;
