const { W, H, SAFE_BOTTOM } = require('../../core/canvas');
const { Scene } = require('../../core/app');
const confetti = require('../../core/confetti');
const theme = require('../../core/theme');
const { t } = require('../../core/i18n');
const { getRaw, setRaw, removeRaw } = require('../../core/storage');
const D = require('../../core/draw');
const ParticleField = require('../../core/particles');
const icons = require('../../core/icons');
const fabKit = require('../../core/fab');
const HEADER = require('../../core/header');
const achv = require('../../core/achv');
const i18nDict = require('./i18n');

const coreI18n = require('../../core/i18n');
if (!coreI18n.__puzzleRegistered) {
  coreI18n.register('puzzle', i18nDict);
  coreI18n.__puzzleRegistered = true;
}

const DIFFICULTY_KEY = '__number_puzzle__difficulty';
const MIN_DIFFICULTY = 3;
const MAX_DIFFICULTY = 6;
const PLAY = 'play', WON = 'won';

function bestKey(n) { return `__number_puzzle__${n}`; }
function shuffle(a) { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; }

class PuzzleScene extends Scene {
  constructor(app) {
    super(app);
    this.bg = new ParticleField();
    this.difficulty = Math.max(MIN_DIFFICULTY, Math.min(MAX_DIFFICULTY, +(getRaw(DIFFICULTY_KEY, 4) || 4)));
    this.n = this.difficulty;
    this.cells = [];
    this.blank = 0;
    this.clicks = 0;
    this.phase = PLAY;
    this.moveAnim = null;
    this.touch = null;
    this.dealStart = 0;
    this.dealing = false;
    this.winStart = 0;
    this.winAt = 0;
    this.confetti = [];
    this.confettiUntil = 0;
    this.lastConfettiAt = 0;
    this.helpOpen = false;
    this.best = null;
    this.newBest = false;
    this.layout();
    this.loadBest();
    this.newGame();
  }
  loadBest() {
    const raw = getRaw(bestKey(this.difficulty), '');
    this.best = raw === '' ? null : +raw || null;
  }
  newGame() {
    this.n = this.difficulty;
    this.cells = Array.from({ length: this.n * this.n }, (_, i) => i + 1);
    this.cells[this.cells.length - 1] = 0;
    this.blank = this.cells.length - 1;
    this.clicks = 0;
    this.phase = PLAY;
    this.moveAnim = null;
    this.dealStart = Date.now();
    this.dealing = true;
    this.winStart = 0;
    this.winAt = 0;
    this.confetti = [];
    this.confettiUntil = 0;
    this.lastConfettiAt = 0;
    this.newBest = false;
    // 从完成态随机走合法步，保证一定可解
    for (let i = 0; i < this.n * this.n * 35; i++) this.randomMove();
    if (this.isSolved()) this.randomMove();
    this.loadBest();
    this.layout();
  }
  randomMove() {
    const n = this.n;
    const r = Math.floor(this.blank / n), c = this.blank % n;
    const opts = [];
    if (r > 0) opts.push(this.blank - n);
    if (r < n - 1) opts.push(this.blank + n);
    if (c > 0) opts.push(this.blank - 1);
    if (c < n - 1) opts.push(this.blank + 1);
    const at = opts[Math.floor(Math.random() * opts.length)];
    this.cells[this.blank] = this.cells[at];
    this.cells[at] = 0;
    this.blank = at;
  }
  isSolved() {
    for (let i = 0; i < this.cells.length - 1; i++) if (this.cells[i] !== i + 1) return false;
    return this.cells[this.cells.length - 1] === 0;
  }
  adjacent(idx) {
    const n = this.n;
    const r = Math.floor(idx / n), c = idx % n;
    const br = Math.floor(this.blank / n), bc = this.blank % n;
    return Math.abs(r - br) + Math.abs(c - bc) === 1;
  }
  onCell(idx) {
    if (this.phase !== PLAY || this.moveAnim || this.dealing || !this.adjacent(idx)) return;
    const to = this.blank;
    const value = this.cells[idx];
    this.cells[this.blank] = this.cells[idx];
    this.cells[idx] = 0;
    this.blank = idx;
    this.moveAnim = { from: idx, to, value, start: Date.now() };
    this.clicks++;
    if (this.isSolved()) {
      this.phase = WON;
      achv.win('puzzle', { mode: this.difficulty });
      this.winStart = Date.now();
      this.winAt = this.winStart + this.n * this.n * 35 + 620;
      this.confettiUntil = 0;
      const prev = this.best;
      this.newBest = prev == null || this.clicks < prev;
      if (this.newBest) {
        this.best = this.clicks;
        setRaw(bestKey(this.difficulty), String(this.best));
      }
      this.app.audio.playSuccess();
    }
  }
  onTouchStart(p) {
    if (!p || this.phase !== PLAY || this.dealing || this.moveAnim) return;
    this.touch = p;
  }
  onTouchEnd(p) {
    const start = this.touch;
    this.touch = null;
    if (!start || !p || this.phase !== PLAY || this.dealing || this.moveAnim) return;
    const dx = p.x - start.x;
    const dy = p.y - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    const n = this.n;
    const br = Math.floor(this.blank / n);
    const bc = this.blank % n;
    let target = -1;
    if (Math.abs(dx) > Math.abs(dy)) {
      // 向左滑 = 把空白右边的牌滑进空白
      if (dx < 0 && bc + 1 < n) target = this.blank + 1;
      if (dx > 0 && bc - 1 >= 0) target = this.blank - 1;
    } else {
      if (dy < 0 && br + 1 < n) target = this.blank + n;
      if (dy > 0 && br - 1 >= 0) target = this.blank - n;
    }
    if (target >= 0) this.onCell(target);
  }

  update(dt) {
    if (this.bg) this.bg.update(dt || 16);
    if (this.dealing && Date.now() - this.dealStart >= this.n * this.n * 45 + 280) this.dealing = false;
    if (this.moveAnim && Date.now() - this.moveAnim.start >= 140) this.moveAnim = null;
    if (this.phase === WON && !this.confettiUntil && Date.now() >= this.winAt) {
      this.confettiUntil = Date.now() + 1200;
      this.lastConfettiAt = 0;
    }
    if (this.confettiUntil && Date.now() < this.confettiUntil && Date.now() - this.lastConfettiAt >= 40) {
      this.lastConfettiAt = Date.now();
      confetti.spawn(this.confetti, { W, H, startY: H * 0.58 });
    }
    this.confetti = confetti.update(this.confetti, dt || 16, H);
  }

  changeDifficulty(delta) {
    const next = this.difficulty + delta;
    if (next < MIN_DIFFICULTY || next > MAX_DIFFICULTY) return;
    this.difficulty = next;
    setRaw(DIFFICULTY_KEY, String(next));
    this.newGame();
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
    this.boardY = this.optY + this.optH + 16;
    const reserve = SAFE_BOTTOM + 96;
    const availH = Math.max(160, H - this.boardY - reserve);
    this.boardSize = Math.min(this.cw, availH);
    this.boardX = (W - this.boardSize) / 2;
    this.pad = 6;
    this.gap = 4;
    this.cell = (this.boardSize - this.pad * 2 - (this.n - 1) * this.gap) / this.n;
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
    this.drawBoard(c);
    D.text(c, t('puzzle.boardHint'), W / 2, this.boardY + this.boardSize + 14, {
      size: 11.5, color: T.muted, align: 'center',
    });
    confetti.draw(c, this.confetti);
    if (!this.helpOpen) this.drawFab(c);
    if (this.helpOpen) this.drawHelp(c);
  }
  drawHeader(c) {
    const T = theme.tokens;
    D.text(c, t('puzzle.gameTitle'), W / 2, this.top + this.headerH / 2, { size: 15, weight: 'bold', color: T.text, align: 'center' });
    if (!icons.draw(c, 'home', this.homeRect.x + 20, this.homeRect.y + 20, 24, T.text)) D.text(c, '⌂', this.homeRect.x + 20, this.homeRect.y + 20, { size: 24, color: T.text, align: 'center' });
    this.addButton('home', this.homeRect.x, this.homeRect.y, this.homeRect.w, this.homeRect.h, () => this.app.goHome());
  }
  drawScore(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.scoreY, this.cw, this.scoreH, T);
    const half = this.cw / 2;
    D.divider(c, this.cx + half, this.scoreY + this.scoreH / 2, 24, T.border, 1);
    D.text(c, t('puzzle.bestScore'), this.cx + half / 2, this.scoreY + 24, { size: 12, color: T.muted, align: 'center' });
    D.text(c, this.best == null ? '--' : String(this.best), this.cx + half / 2, this.scoreY + 48, { size: 22, weight: 'bold', color: T.text, align: 'center' });
    D.text(c, t('puzzle.availableClicks'), this.cx + half + half / 2, this.scoreY + 24, { size: 12, color: T.muted, align: 'center' });
    D.text(c, String(this.clicks), this.cx + half + half / 2, this.scoreY + 48, { size: 22, weight: 'bold', color: T.primary, align: 'center' });
  }
  drawOptions(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.optY, this.cw, this.optH, T);
    const x1 = this.cx + this.cw / 2;
    D.divider(c, x1, this.optY + this.optH / 2, 24, T.border, 1);
    const mid = this.optY + this.optH / 2;
    // − 数字 + 作为一组紧挨着，在左半区居中；不要分别贴到两端。
    const numW = D.measure(c, String(this.difficulty), 18, 'bold');
    const gap = 12;
    const groupW = 28 + gap + numW + gap + 28;
    const gx = this.cx + (x1 - this.cx - groupW) / 2;
    const minus = { x: gx, y: mid - 14, w: 28, h: 28 };
    const plus = { x: gx + groupW - 28, y: mid - 14, w: 28, h: 28 };
    this.drawMiniButton(c, minus, '-', this.difficulty > MIN_DIFFICULTY, () => this.changeDifficulty(-1));
    this.drawMiniButton(c, plus, '+', this.difficulty < MAX_DIFFICULTY, () => this.changeDifficulty(1));
    D.text(c, String(this.difficulty), gx + 28 + gap + numW / 2, mid, { size: 18, weight: 'bold', color: T.text, align: 'center' });
    const label = t('puzzle.start');
    const bw = Math.min(120, D.measure(c, label, 13, 'bold') + 24);
    const bx = this.cx + x1 + (this.cw - (x1 - this.cx) - bw) / 2;
    D.fillRoundRect(c, bx, mid - 16, bw, 32, 8, T.primary);
    D.text(c, label, bx + bw / 2, mid, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('new', bx, mid - 16, bw, 32, () => this.newGame());
  }
  drawMiniButton(c, r, label, enabled, onTap) {
    const T = theme.tokens;
    D.fillRoundRect(c, r.x, r.y, r.w, r.h, 8, T.card);
    D.strokeRoundRect(c, r.x, r.y, r.w, r.h, 8, T.border, 1);
    D.text(c, label, r.x + r.w / 2, r.y + r.h / 2, { size: 15, weight: 'bold', color: enabled ? T.text : T.border, align: 'center' });
    if (enabled) this.addButton('diff-' + label, r.x - 8, r.y - 8, r.w + 16, r.h + 16, onTap);
  }
  cellRect(idx) {
    const r = Math.floor(idx / this.n), c = idx % this.n;
    return {
      x: this.boardX + this.pad + c * (this.cell + this.gap),
      y: this.boardY + this.pad + r * (this.cell + this.gap),
      w: this.cell, h: this.cell,
    };
  }
  drawBoard(c) {
    const T = theme.tokens;
    D.fillRoundRect(c, this.boardX, this.boardY, this.boardSize, this.boardSize, 14, T.boardBg);
    const skip = this.moveAnim ? this.moveAnim.to : -1;
    for (let r = 0; r < this.n; r++) for (let col = 0; col < this.n; col++) {
      const idx = r * this.n + col;
      const value = this.cells[idx];
      const q = this.cellRect(idx);
      if (value && idx !== skip) {
        const delay = idx * 45;
        const p = this.dealing ? Math.max(0, Math.min(1, (Date.now() - this.dealStart - delay) / 280)) : 1;
        if (p > 0) {
          c.save();
          c.globalAlpha = p;
          c.translate(q.x + q.w / 2, q.y + q.h / 2);
          let sc = 0.4 + 0.6 * (1 - Math.pow(1 - p, 3));
          if (this.phase === WON) {
            const wp = Math.max(0, Math.min(1, (Date.now() - this.winStart - idx * 35) / 320));
            sc *= 1 + 0.20 * Math.sin(Math.PI * wp);
          }
          c.scale(sc, sc);
          this.drawNumber(c, value, -q.w / 2, -q.h / 2, q.w, q.h);
          c.restore();
        }
        if (this.phase === PLAY && !this.moveAnim && !this.dealing) this.addButton('cell-' + idx, q.x, q.y, q.w, q.h, () => this.onCell(idx));
      }
    }
    if (this.phase === WON && this.cells[this.blank] === 0) {
      const q = this.cellRect(this.blank);
      const wp = Math.max(0, Math.min(1, (Date.now() - this.winStart - this.blank * 35) / 320));
      const sc = 1 + 0.20 * Math.sin(Math.PI * wp);
      c.save();
      c.translate(q.x + q.w / 2, q.y + q.h / 2);
      c.scale(sc, sc);
      this.drawNumber(c, this.n * this.n, -q.w / 2, -q.h / 2, q.w, q.h);
      c.restore();
    }
    if (this.moveAnim) {
      const a = this.cellRect(this.moveAnim.from);
      const b = this.cellRect(this.moveAnim.to);
      const p = Math.max(0, Math.min(1, (Date.now() - this.moveAnim.start) / 140));
      const ease = 1 - Math.pow(1 - p, 3);
      this.drawNumber(c, this.moveAnim.value, a.x + (b.x - a.x) * ease, a.y + (b.y - a.y) * ease, a.w, a.h);
    }
    if (this.phase === WON) this.drawResult(c);
  }
  drawNumber(c, value, x, y, w, h) {
    const T = theme.tokens;
    const evenBg = theme.dark ? 'rgba(255,255,255,0.06)' : '#f2f4f7';
    const oddBg = theme.dark ? 'rgba(78,201,138,0.22)' : '#d8f0e2';
    D.fillRoundRect(c, x, y, w, h, 8, value % 2 === 0 ? evenBg : oddBg);
    D.strokeRoundRect(c, x, y, w, h, 8, T.tileBorder, 1);
    D.text(c, String(value), x + w / 2, y + h / 2, {
      size: Math.max(12, Math.round(w * 0.38)), weight: 'bold', color: T.text, align: 'center',
    });
  }
  drawResult(c) {
    if (this.winAt && Date.now() < this.winAt) return;
    if (!this.resultVisible()) return;
    const T = theme.tokens;
    D.fillRoundRect(c, this.boardX, this.boardY, this.boardSize, this.boardSize, 14, theme.dark ? 'rgba(38,38,38,0.92)' : 'rgba(250,248,239,0.9)');
    const cx = W / 2, cy = this.boardY + this.boardSize / 2;
    D.text(c, `🎉🎉 ${t('puzzle.tipWin')} 🎉🎉`, cx, cy - 22, { size: 20, weight: 'bold', color: T.win, align: 'center' });
    D.text(c, t('puzzle.movesDone').replace('{n}', String(this.clicks)), cx, cy + 8, { size: 15, color: T.muted, align: 'center' });
    if (this.newBest) D.text(c, t('puzzle.newBest'), cx, cy + 32, { size: 13, color: T.muted, align: 'center' });
    const bw = 110;
    D.fillRoundRect(c, cx - bw / 2, cy + 52, bw, 32, 8, T.primary);
    D.text(c, t('puzzle.start'), cx, cy + 68, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('retry', cx - bw / 2, cy + 52, bw, 32, () => this.newGame());
  }
  drawFab(c) {
    const T = theme.tokens, r = this.helpFab;
    c.save(); c.shadowColor = 'rgba(0,0,0,0.12)'; c.shadowBlur = 10; c.shadowOffsetY = 2;
    D.circle(c, r.x + r.w / 2, r.y + r.h / 2, r.w / 2, T.card); c.restore();
    if (!icons.draw(c, 'help', r.x + r.w / 2, r.y + r.h / 2, 20, T.text)) D.text(c, '?', r.x + r.w / 2, r.y + r.h / 2, { size: 18, color: T.text, align: 'center' });
    this.addButton('help', r.x, r.y, r.w, r.h, () => { this.helpOpen = true; });
    fabKit.drawMute(this, c, fabKit.leftSlot(r));
  }
  drawHelp(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(0, 0, W, H);
    const x = 22, w = W - 44;
    const lines = [];
    ['helpMsg', 'help1'].forEach((k) => {
      const v = t('puzzle.' + k);
      if (v !== 'puzzle.' + k) { lines.push(...D.wrapText(c, v, w - 36, 14)); lines.push(''); }
    });
    const lineH = 20;
    const h = Math.min(H - 100, 76 + lines.length * lineH + 58);
    const y = (H - h) / 2;
    D.card(c, x, y, w, h, T);
    D.text(c, '?', x + 22, y + 30, { size: 24, weight: 'bold', color: T.primary });
    D.text(c, t('help'), x + 48, y + 30, { size: 16, weight: 'bold', color: T.text });
    c.save(); D.roundRect(c, x + 1, y + 1, w - 2, h - 2, 14); c.clip();
    let ly = y + 58;
    lines.forEach((line) => { if (line) D.text(c, line, x + 18, ly, { size: 14, color: T.text }); ly += lineH; });
    c.restore();
    this.addButton('help-mask', 0, 0, W, H, () => { this.helpOpen = false; });
    const bw = 110, bx = x + (w - bw) / 2, by = y + h - 42;
    D.fillRoundRect(c, bx, by, bw, 30, 8, T.primary);
    D.text(c, t('puzzle.confirmText'), bx + bw / 2, by + 15, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('help-ok', bx, by, bw, 30, () => { this.helpOpen = false; });
  }
  onTheme() { this.layout(); }
  onHide() {}
  onShow() {}
}
module.exports = PuzzleScene;
