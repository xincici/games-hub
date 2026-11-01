const { W, H, SAFE_TOP, SAFE_BOTTOM } = require('../../core/canvas');
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
const { wrongShake, popScale } = require('../../core/fx');
const i18nDict = require('./i18n');

const coreI18n = require('../../core/i18n');
const confetti = require('../../core/confetti');
if (!coreI18n.__detectiveRegistered) {
  coreI18n.register('detective', i18nDict);
  coreI18n.__detectiveRegistered = true;
}

const MEMORY = 'memory';
const FLIP = 'flip';
const ANSWER = 'answer';
const WON = 'won';
const LOST = 'lost';
const PREFIX = '__emoji_detective__';
const MODE_KEY = `${PREFIX}mode`;
const MODE = { emoji: 1, poker: 2, mahjong: 3 };
const EMOJI_SIZES = [[1, 3], [2, 2], [2, 3], [2, 4], [3, 3], [3, 4], [3, 5], [4, 4], [4, 5]];
const EMOJI_MEMORIES = [2000, 2500, 3000, 3500, 4000, 4500, 5000, 6000, 7000];
const CARD_SIZES = [[1, 4], [2, 3], [2, 4], [2, 5], [3, 4], [3, 5], [3, 6], [4, 5], [4, 6], [4, 7]];
const CARD_MEMORIES = [2000, 2600, 3000, 3400, 3800, 4500, 5000, 5500, 6500, 7500];
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
function pickReplacement(items, mode) {
  const used = new Set(items.map(cards.keyOf));
  for (let i = 0; i < 200; i++) {
    const pool = cards.poolFor(mode);
    const cand = pool[Math.floor(Math.random() * pool.length)];
    if (!used.has(cards.keyOf(cand))) return cand;
  }
  return null;
}

class DetectiveScene extends Scene {
  constructor(app) {
    super(app);
    this.bg = new ParticleField();
    this.mode = loadMode();
    this.level = 0;
    this.phase = MEMORY;
    this.board = [];
    this.flips = [];
    this.flipTargets = [];
    this.flipStart = 0;
    this.flipDelays = [];
    this.swapped = -1;
    this.wrong = [];
    this.right = -1;
    this.rightAt = 0;
    this.wrongFx = new Map();
    this.hearts = HEARTS_MAX;
    this.best = +(getRaw(bestKey(this.mode), 0) || 0);
    this.memLeft = 0;
    this.time = 0;
    this.memoryEnd = 0;
    this.flipEnd = 0;
    this.swapAt = 0;
    this.playStart = 0;
    this.settleAt = 0;
    this.lock = false;
    this.confirming = false;
    this.helpOpen = false;
    this.confetti = [];
    this.confettiUntil = 0;
    this.lastConfettiAt = 0;
    this.now = Date.now();
    this.cw = 0;
    this.layout();
    this.boot();
  }

  get sizes() { return this.mode === 2 ? CARD_SIZES : EMOJI_SIZES; }
  get memories() { return this.mode === 2 ? CARD_MEMORIES : EMOJI_MEMORIES; }
  get rows() { return this.sizes[this.level][0]; }
  get cols() { return this.sizes[this.level][1]; }
  get ratio() { return cards.ratio(this.mode); }
  get modeName() { return t(this.mode === 2 ? 'detective.modePoker' : this.mode === 3 ? 'detective.modeMahjong' : 'detective.modeEmoji'); }

  loadRecords() { this.best = +(getRaw(bestKey(this.mode), 0) || 0); }
  saveState() {
    setRaw(levelKey(this.mode), JSON.stringify({
      level: this.level, hearts: this.hearts, phase: this.phase, time: this.time,
      board: this.board, swapped: this.swapped, wrong: this.wrong,
    }));
  }
  restore() {
    try {
      const raw = getRaw(levelKey(this.mode), '');
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || typeof s.level !== 'number') return false;
      this.level = Math.min(this.sizes.length - 1, Math.max(0, s.level));
      const over = s.phase === WON || s.phase === LOST;
      if (over && Array.isArray(s.board) && s.board.length === this.rows * this.cols) {
        this.board = s.board;
        this.swapped = Number.isInteger(+s.swapped) ? +s.swapped : -1;
        this.wrong = Array.isArray(s.wrong) ? s.wrong : [];
        this.hearts = typeof s.hearts === 'number' ? s.hearts : 0;
        this.phase = s.phase === WON ? WON : LOST;
        this.flips = new Array(this.board.length).fill(1);
        this.flipTargets = new Array(this.board.length).fill(1);
        this.time = Math.max(0, +s.time || 0);
        this.right = -1;
        this.lock = true;
        this.layout();
        return true;
      }
      this.startLevel();
      return true;
    } catch (e) { return false; }
  }
  boot() {
    this.loadRecords();
    if (!this.restore()) this.startLevel();
  }
  startLevel() {
    this.level = Math.max(0, Math.min(this.sizes.length - 1, this.level));
    this.swapped = -1;
    this.wrong = [];
    this.right = -1;
    this.rightAt = 0;
    this.wrongFx = new Map();
    this.hearts = HEARTS_MAX;
    this.phase = MEMORY;
    this.time = 0;
    this.playStart = 0;
    this.lock = false;
    const n = this.rows * this.cols;
    this.board = shuffle(cards.poolFor(this.mode)).slice(0, n);
    this.flips = new Array(n).fill(0);
    this.flipTargets = new Array(n).fill(1);
    this.flipStart = Date.now();
    this.flipDelays = Array.from({ length: n }, (_, i) => i * 25);
    this.now = Date.now();
    const ms = this.memories[this.level];
    this.memLeft = Math.ceil(ms / 1000);
    this.memoryEnd = this.now + ms;
    removeRaw(levelKey(this.mode));
    this.layout();
  }
  nextLevel() {
    if (this.level < this.sizes.length - 1) this.level++;
    this.startLevel();
  }
  retryLevel() { this.confirming = false; this.startLevel(); }
  startNewGame() {
    this.confirming = false;
    removeRaw(bestKey(this.mode));
    this.best = 0;
    this.level = 0;
    this.startLevel();
  }
  toggleMode() {
    this.mode = this.mode === 1 ? 2 : this.mode === 2 ? 3 : 1;
    setRaw(MODE_KEY, String(this.mode));
    this.loadRecords();
    this.boot();
  }
  update(dt) {
    this.now = Date.now();
    if (this.bg) this.bg.update(dt || 16);
    if (this.helpOpen || this.confirming) return;
    const flipStep = Math.min(32, dt || 16) / 450;
    for (let i = 0; i < this.flips.length; i++) {
      if ((this.flipDelays[i] || 0) && this.now - this.flipStart < this.flipDelays[i]) continue;
      if (this.flips[i] < this.flipTargets[i]) this.flips[i] = Math.min(this.flipTargets[i], this.flips[i] + flipStep);
      else if (this.flips[i] > this.flipTargets[i]) this.flips[i] = Math.max(this.flipTargets[i], this.flips[i] - flipStep);
    }
    if (this.phase === MEMORY) {
      this.memLeft = Math.max(0, Math.ceil((this.memoryEnd - this.now) / 1000));
      if (this.now >= this.memoryEnd) {
        this.phase = FLIP;
        this.flipTargets = this.flipTargets.map(() => 0);
        this.flipStart = this.now;
        this.flipDelays = this.flipTargets.map((_, i) => i * 20);
        this.flipEnd = this.now + 1000;
        this.swapAt = this.now + 250;
      }
    } else if (this.phase === FLIP) {
      if (this.swapped < 0 && this.now >= this.swapAt) {
        const idx = Math.floor(Math.random() * this.board.length);
        const repl = pickReplacement(this.board, this.mode);
        if (repl != null) { this.swapped = idx; this.board[idx] = repl; }
      }
      if (this.now >= this.flipEnd) {
        this.phase = ANSWER;
        this.flipTargets = this.flipTargets.map(() => 1);
        this.flipStart = this.now;
        this.flipDelays = this.flipTargets.map((_, i) => i * 20);
        this.playStart = this.now;
        this.time = 0;
        this.memLeft = 0;
      }
    } else if (this.phase === ANSWER) {
      if (this.playStart) this.time = Math.floor((this.now - this.playStart) / 1000);
      if (this.lock && this.settleAt && this.now >= this.settleAt) {
        if (this.hearts <= 0) {
          this.phase = LOST;
          this.app.audio.playLose();
          this.saveState();
        } else if (this.right >= 0) {
          this.phase = WON;
          this.best = Math.max(this.best, this.level + 1);
          setRaw(bestKey(this.mode), String(this.best));
          this.saveState();
          this.startConfetti();
          this.app.audio.playSuccess();
        }
        this.settleAt = 0;
        this.lock = true;
      }
    }
    if (this.now < this.confettiUntil && this.now - this.lastConfettiAt >= 40) {
      this.lastConfettiAt = this.now;
      this.emitConfetti();
    }
    this.confetti = confetti.update(this.confetti, dt || 16, H);
  }
  onCellClick(idx) {
    if (this.phase !== ANSWER || this.lock || this.wrong.includes(idx)) return;
    if (idx === this.swapped) {
      this.right = idx;
      this.rightAt = Date.now();
      this.lock = true;
      this.settleAt = this.now + 500;
      this.app.audio.playElimination();
      return;
    }
    this.wrong = this.wrong.concat([idx]);
    this.wrongFx.set(idx, Date.now());
    this.hearts = Math.max(0, this.hearts - 1);
    this.app.audio.playFail();
    if (this.hearts <= 0) {
      this.lock = true;
      this.settleAt = this.now + 500;
    }
  }
  startConfetti() {
    this.confetti = [];
    this.confettiUntil = Date.now() + 1200;
    this.lastConfettiAt = 0;
  }
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
    this.boardY = this.tipY + this.tipH;
    const reserve = SAFE_BOTTOM + 96;
    const availH = Math.max(150, H - this.boardY - reserve);
    const pad = 6;
    const gap = 6;
    const ratio = this.ratio;
    const cap = this.mode === 2 ? 64 : this.mode === 3 ? 60 : 96;
    const byW = Math.floor((this.cw - pad * 2 - (this.cols - 1) * gap) / this.cols);
    const byH = Math.floor(((availH - pad * 2 - (this.rows - 1) * gap) / this.rows) / ratio);
    this.cellW = Math.max(12, Math.min(cap, byW, byH));
    this.cellH = Math.round(this.cellW * ratio);
    this.boardW = this.cols * this.cellW + (this.cols - 1) * gap + pad * 2;
    this.boardH = this.rows * this.cellH + (this.rows - 1) * gap + pad * 2;
    this.boardX = (W - this.boardW) / 2;
    this.fabSize = 40;
    this.helpFab = { x: W - 16 - 40, y: H - SAFE_BOTTOM - 16 - 40, w: 40, h: 40 };
    this.modeFab = { x: W - 16 - 40 - 48, y: this.helpFab.y, w: 40, h: 40 };
  }
  render(c) {
    this.buttons = [];
    const T = theme.tokens;
    c.fillStyle = T.bg;
    c.fillRect(0, 0, W, H);
    this.bg.draw(c, theme.dark);
    this.drawHeader(c);
    this.drawScore(c);
    this.drawOptions(c);
    this.drawBoard(c);
    if (!this.helpOpen && !this.confirming) this.drawFabs(c);
    this.drawConfetti(c);
    if (this.helpOpen) this.drawHelp(c);
    if (this.confirming) this.drawConfirm(c);
  }

  drawHeader(c) {
    const T = theme.tokens;
    D.text(c, t('detective.gameTitle'), W / 2, this.top + this.headerH / 2, {
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
    const stats = [[t('detective.bestScore'), this.best || '--'], [t('detective.levelLabel'), this.level + 1], [t('detective.livesLabel'), '']];
    stats.forEach(([label, value], i) => {
      if (i) D.divider(c, this.cx + third * i, this.scoreY + this.scoreH / 2, 24, T.border, 1);
      D.text(c, label, this.cx + third * (i + 0.5), this.scoreY + 24, { size: 12, color: T.muted, align: 'center' });
      D.text(c, String(value), this.cx + third * (i + 0.5), this.scoreY + 48, { size: 22, weight: 'bold', color: T.text, align: 'center' });
    });
    let hx = this.cx + third * 2 + 12;
    for (let i = 0; i < HEARTS_MAX; i++) {
      D.text(c, i < this.hearts ? '❤️' : '🤍', hx + 12, this.scoreY + 48, {
        size: 17, align: 'center', family: '"Apple Color Emoji","Segoe UI Emoji",sans-serif',
      });
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
    D.text(c, `${this.rows}×${this.cols} · ${this.modeName}`, this.cx + (x1 - this.cx) / 2, this.optY + this.optH / 2, { size: 13, color: T.muted, align: 'center' });
    const observing = this.phase === MEMORY || this.phase === FLIP;
    drawTimer(c, observing ? 'hourglass' : 'stopwatch', (x1 + x2) / 2, this.optY + this.optH / 2,
      fmt(observing ? this.memLeft : this.time), { size: 15, color: observing ? T.del : T.text });
    const label = t('detective.start');
    const bw = Math.min(110, D.measure(c, label, 13, 'bold') + 24);
    const bx = (x2 + this.cx + this.cw) / 2 - bw / 2;
    const by = this.optY + (this.optH - 32) / 2;
    D.fillRoundRect(c, bx, by, bw, 32, 8, T.primary);
    D.text(c, label, bx + bw / 2, by + 16, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('new', bx, by, bw, 32, () => { this.confirming = true; });
  }
  cardRect(i) {
    const pad = 6;
    const gap = 6;
    return {
      x: this.boardX + pad + (i % this.cols) * (this.cellW + gap),
      y: this.boardY + pad + Math.floor(i / this.cols) * (this.cellH + gap),
      w: this.cellW, h: this.cellH,
    };
  }
  drawBoard(c) {
    const T = theme.tokens;
    D.fillRoundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 14, T.boardBg);
    this.board.forEach((item, i) => {
      const r = this.cardRect(i);
      const flip = this.flips[i] == null ? 1 : this.flips[i];
      const sx = Math.max(0.04, Math.abs(Math.cos(Math.PI * flip)));
      const faceUp = flip > 0.5;
      const wrongAt = this.wrongFx.get(i);
      const shake = wrongAt ? wrongShake(this.now - wrongAt) : 0;
      const scale = i === this.right && this.rightAt ? popScale(this.now - this.rightAt) : 1;
      c.save();
      c.translate(r.x + r.w / 2 + shake, r.y + r.h / 2);
      c.scale(sx * scale, scale);
      cards.draw(c, item, this.mode, -r.w / 2, -r.h / 2, r.w, r.h, faceUp, 'incognito', '🕵');
      c.restore();
      if (this.right === i || (this.phase === LOST && this.swapped === i)) {
        D.strokeRoundRect(c, r.x + 1, r.y + 1, r.w - 2, r.h - 2, 7, this.right === i ? T.primary : T.win, 3);
      }
      if (this.wrong.includes(i)) D.strokeRoundRect(c, r.x + 1, r.y + 1, r.w - 2, r.h - 2, 7, T.lose, 3);
      if (this.phase === LOST && this.swapped === i) {
        D.text(c, '✓', r.x + r.w / 2, r.y + r.h / 2, { size: 22, weight: 'bold', color: T.primary, align: 'center' });
      }
      if (this.phase === ANSWER && !this.lock && !this.wrong.includes(i)) {
        this.addButton('cell-' + i, r.x, r.y, r.w, r.h, () => this.onCellClick(i));
      }
    });
    const hint = this.phase === MEMORY ? t('detective.phaseMemory') : this.phase === FLIP ? t('detective.phaseFlip') : this.phase === ANSWER ? (this.mode === 1 ? t('detective.phaseAnswer') : t('detective.phaseAnswerCard')) : '';
    if (hint) {
      const tw = D.measure(c, hint, 13, 'bold');
      D.fillRoundRect(c, W / 2 - (tw + 24) / 2, this.tipY + 2, tw + 24, 24, 8, T.card);
      D.strokeRoundRect(c, W / 2 - (tw + 24) / 2, this.tipY + 2, tw + 24, 24, 8, T.border, 1);
      D.text(c, hint, W / 2, this.tipY + 14, { size: 13, weight: 'bold', color: T.text, align: 'center' });
    }
    if (this.phase === WON || this.phase === LOST) this.drawResult(c);
  }
  drawResult(c) {
    if (!this.resultVisible()) return;
    const T = theme.tokens;
    D.fillRoundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 14, T.overlay);
    const cx = W / 2;
    const cy = this.boardY + this.boardH / 2;
    if (this.phase === WON) {
      D.text(c, `🎉🎉 ${t('detective.tipWin')} 🎉🎉`, cx, cy - 24, { size: 18, weight: 'bold', color: T.win, align: 'center' });
      const labels = [t('detective.replayLevel'), t('detective.nextLevel')];
      const gap = 10;
      const bw = 100;
      const bx = cx - (bw * 2 + gap) / 2;
      this.button(c, bx, cy + 18, bw, 32, labels[0], 'outline', () => this.retryLevel());
      this.button(c, bx + bw + gap, cy + 18, bw, 32, labels[1], 'primary', () => this.nextLevel());
    } else {
      D.text(c, `👻👻 ${t('detective.tipLost')} 👻👻`, cx, cy - 18, { size: 18, weight: 'bold', color: T.lose, align: 'center' });
      this.button(c, cx - 55, cy + 20, 110, 32, t('detective.replayLevel'), 'outline', () => this.retryLevel());
    }
    this.lock = true;
  }
  button(c, x, y, w, h, label, kind, onTap) {
    const T = theme.tokens;
    if (kind === 'primary') {
      D.fillRoundRect(c, x, y, w, h, 8, T.primary);
      D.text(c, label, x + w / 2, y + h / 2, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    } else {
      D.strokeRoundRect(c, x, y, w, h, 8, T.god, 1);
      D.text(c, label, x + w / 2, y + h / 2, { size: 13, weight: 'bold', color: T.god, align: 'center' });
    }
    this.addButton('result-' + label, x, y, w, h, onTap);
  }
  drawConfetti(c) {
    confetti.draw(c, this.confetti.concat(this.bursts || []));
  }
  drawFabs(c) {
    const T = theme.tokens;
    const drawOne = (rect, key, fallback, color, onTap, id) => {
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.12)';
      c.shadowBlur = 10;
      c.shadowOffsetY = 2;
      D.circle(c, rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, T.card);
      c.restore();
      if (!icons.draw(c, key, rect.x + rect.w / 2, rect.y + rect.h / 2, 20, color)) {
        D.text(c, fallback, rect.x + rect.w / 2, rect.y + rect.h / 2, { size: 18, color, align: 'center' });
      }
      this.addButton(id, rect.x, rect.y, rect.w, rect.h, onTap);
    };
    drawOne(this.helpFab, 'help', '?', T.text, () => { this.helpOpen = true; }, 'help');
    const key = this.mode === 2 ? 'mode-poker' : this.mode === 3 ? 'mode-mahjong' : 'mode-emoji';
    const fallback = this.mode === 2 ? '🃏' : this.mode === 3 ? '🀄' : '😀';
    drawOne(this.modeFab, key, fallback, T.primary, () => this.toggleMode(), 'mode');
  }

  drawHelp(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fillRect(0, 0, W, H);
    const x = 20;
    const w = W - 40;
    const lines = [];
    ['helpMsg', 'help1', 'help2', 'help3', 'help4', 'help5'].forEach((k) => {
      const v = t('detective.' + k);
      if (v !== 'detective.' + k) { lines.push(...D.wrapText(c, v, w - 40, 14)); lines.push(''); }
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
    this.addButton('help-mask', 0, 0, W, H, () => { this.helpOpen = false; });
    const bw = 110;
    const bx = x + (w - bw) / 2;
    const by = y + h - 44;
    D.fillRoundRect(c, bx, by, bw, 30, 8, T.primary);
    D.text(c, t('detective.confirmText'), bx + bw / 2, by + 15, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
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
    D.text(c, t('detective.start'), x + 20, y + 34, { size: 17, weight: 'bold', color: T.text });
    D.text(c, t('detective.start'), x + 20, y + 66, { size: 14, color: T.muted });
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
    button(x + 20 + bw + gap, t('detective.replayLevel'), 'replay', () => this.retryLevel());
    button(x + 20 + (bw + gap) * 2, t('confirmOk'), 'ok', () => this.startNewGame());
  }

  onTheme() { this.layout(); }
  onHide() {}
  onShow() {}
}

module.exports = DetectiveScene;
