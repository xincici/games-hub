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
if (!coreI18n.__downRegistered) {
  coreI18n.register('down', i18nDict);
  coreI18n.__downRegistered = true;
}

const BEST_KEY = '__emoji_down__best_1';
const STATE_KEY = '__emoji_down__state';
const PLAY = 'play', OVER = 'over';

function fmt(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

class DownScene extends Scene {
  constructor(app) {
    super(app);
    this.bg = new ParticleField();
    this.stack = [];
    this.top = logic.START_TOP;
    this.glyph = '🍎';
    this.col = 3;
    this.score = 0;
    this.best = +(getRaw(BEST_KEY, 0) || 0);
    this.cleared = 0;
    this.elapsed = 0;
    this.phase = PLAY;
    this.paused = false;
    this.resumeCount = 0;
    this.resumeAt = 0;
    this.helpOpen = false;
    this.newBest = false;
    this.rowId = 0;
    this.clearAnim = null;
    this.moveAnim = null;
    this.fallAnim = null;
    this.lastSaveAt = 0;
    this.now = Date.now();
    this.layout();
    this.boot();
  }
  boot() {
    if (!this.restore()) this.startGame();
  }
  newRow() { return { cells: logic.makeRow() }; }
  fillPile() {
    while (this.top + this.stack.length < logic.ROWS) this.stack.push(this.newRow());
  }
  startGame() {
    this.phase = PLAY;
    this.paused = false;
    this.resumeCount = 0;
    this.top = logic.START_TOP;
    this.score = 0;
    this.cleared = 0;
    this.elapsed = 0;
    this.newBest = false;
    this.clearAnim = null;
    this.moveAnim = null;
    this.fallAnim = null;
    this.col = 3;
    this.stack = [this.newRow(), this.newRow()];
    const row = this.stack[0].cells;
    const other = row.findIndex((g, c) => c !== this.col && g !== row[this.col]);
    this.glyph = row[other >= 0 ? other : (this.col + 1) % logic.COLS];
    this.fillPile();
    removeRaw(STATE_KEY);
    this.layout();
    this.save();
  }
  save() {
    setRaw(STATE_KEY, JSON.stringify({
      stack: this.stack, top: this.top, glyph: this.glyph, col: this.col,
      score: this.score, cleared: this.cleared, elapsed: this.elapsed,
      phase: this.phase,
    }));
  }
  restore() {
    try {
      const raw = getRaw(STATE_KEY, '');
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.stack) || !s.stack.length) return false;
      this.stack = s.stack.map(r => ({ cells: Array.isArray(r.cells) ? r.cells.slice() : [] })).filter(r => r.cells.length === logic.COLS);
      if (!this.stack.length) return false;
      this.top = +s.top || logic.START_TOP;
      this.glyph = s.glyph || '🍎';
      this.col = Math.max(0, Math.min(logic.COLS - 1, +s.col || 0));
      this.score = +s.score || 0;
      this.cleared = +s.cleared || 0;
      this.elapsed = +s.elapsed || 0;
      this.phase = s.phase === OVER ? OVER : PLAY;
      this.clearAnim = null;
      this.moveAnim = null;
      this.fallAnim = null;
      this.paused = this.phase === PLAY;
      this.layout();
      return true;
    } catch (e) { return false; }
  }
  update(dt) {
    if (this.bg) this.bg.update(dt || 16);
    if (this.phase !== PLAY || this.helpOpen) return;
    if (this.paused) {
      if (this.resumeCount && Date.now() >= this.resumeAt) {
        this.resumeCount--;
        this.resumeAt = Date.now() + 800;
        if (this.resumeCount <= 0) this.paused = false;
      }
      return;
    }
    if (this.moveAnim) {
      if (Date.now() >= this.moveAnim.at) {
        this.col = this.moveAnim.to;
        this.moveAnim = null;
        this.resolveLanding();
      }
      return;
    }
    if (this.clearAnim) {
      if (Date.now() >= this.clearAnim.at) this.finishClearRow();
      return;
    }
    if (this.fallAnim) {
      if (Date.now() >= this.fallAnim.at + 180) {
        this.fallAnim = null;
        if (this.top - 1 <= 0) this.lose();
        else this.resolveLanding();
      }
      return;
    }
    const d = Math.min(0.05, (dt || 16) / 1000);
    this.elapsed += d;
    this.top -= logic.speedFor(this.cleared) * d;
    this.fillPile();
    if (this.top - 1 <= 0) this.lose();
    if (Date.now() - this.lastSaveAt > 500) { this.lastSaveAt = Date.now(); this.save(); }
  }
  lose() {
    if (this.phase !== PLAY) return;
    this.phase = OVER;
    this.paused = false;
    this.app.audio.playLose();
    this.save();
  }
  togglePause() {
    if (this.phase !== PLAY) return;
    if (!this.paused) {
      this.paused = true;
      this.resumeCount = 0;
    } else if (!this.resumeCount) {
      this.resumeCount = 3;
      this.resumeAt = Date.now() + 800;
    }
    this.save();
  }
  resolveLanding() {
    if (this.phase !== PLAY || this.moveAnim || this.clearAnim || this.fallAnim) return;
    const row = this.stack[0];
    if (row && row.cells[this.col] === this.glyph) this.clearRow();
  }
  pick(idx) {
    if (this.phase !== PLAY || this.paused || this.clearAnim || this.fallAnim || this.moveAnim) return;
    const target = Math.max(0, Math.min(logic.COLS - 1, idx));
    if (target === this.col) {
      this.resolveLanding();
      return;
    }
    this.moveAnim = { from: this.col, to: target, start: Date.now(), at: Date.now() + 150 };
  }
  clearRow() {
    if (!this.stack.length || this.clearAnim) return;
    // 顶排先膨胀淡出，再整体下落。
    this.clearAnim = { at: Date.now() + 220, start: Date.now() };
    this.app.audio.playElimination();
  }
  finishClearRow() {
    this.clearAnim = null;
    this.stack.shift();
    this.top = Math.min(logic.ROWS - 1, this.top + 1);
    // 消掉的是顶排，下面的行位置不变；只让玩家牌平滑下落，不整排下移。
    this.fillPile();
    this.score++;
    this.cleared++;
    if (this.score > this.best) {
      this.best = this.score;
      this.newBest = true;
      setRaw(BEST_KEY, String(this.best));
    }
    if (this.cleared % 3 === 0) {
      const row = this.stack[0];
      if (row) {
        const others = row.cells.map((g, c) => g !== this.glyph ? c : -1).filter(c => c >= 0);
        this.glyph = row.cells[others.length ? others[Math.floor(Math.random() * others.length)] : 0];
      }
    }
    this.fallAnim = { start: Date.now(), at: Date.now() };
    this.save();
  }
  layout() {
    this.cw = Math.min(W - 32, 440);
    this.cx = (W - this.cw) / 2;
    this.topY = HEADER.TOP;
    this.headerH = HEADER.HEIGHT;
    this.homeRect = { ...HEADER.HOME_RECT };
    this.scoreY = this.topY + this.headerH + 6;
    this.scoreH = 72;
    this.optY = this.scoreY + this.scoreH + 16;
    this.optH = 72;
    this.boardY = this.optY + this.optH + 16;
    const reserve = SAFE_BOTTOM + 96;
    const availH = Math.max(160, H - this.boardY - reserve);
    this.cell = Math.max(12, Math.min(this.cw / logic.COLS, availH / logic.ROWS));
    this.boardW = this.cell * logic.COLS;
    this.boardH = this.cell * logic.ROWS;
    this.boardX = (W - this.boardW) / 2;
    this.boardY = this.boardY + Math.max(0, (availH - this.boardH) / 2);
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
    if (!this.helpOpen) this.drawFab(c);
    if (this.helpOpen) this.drawHelp(c);
  }
  drawHeader(c) {
    const T = theme.tokens;
    D.text(c, t('down.gameTitle'), W / 2, this.topY + this.headerH / 2, { size: 15, weight: 'bold', color: T.text, align: 'center' });
    if (!icons.draw(c, 'home', this.homeRect.x + 20, this.homeRect.y + 20, 24, T.text)) D.text(c, '⌂', this.homeRect.x + 20, this.homeRect.y + 20, { size: 24, color: T.text, align: 'center' });
    this.addButton('home', this.homeRect.x, this.homeRect.y, this.homeRect.w, this.homeRect.h, () => this.app.goHome());
  }
  drawScore(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.scoreY, this.cw, this.scoreH, T);
    const third = this.cw / 3;
    D.divider(c, this.cx + third, this.scoreY + this.scoreH / 2, 24, T.border, 1);
    D.divider(c, this.cx + third * 2, this.scoreY + this.scoreH / 2, 24, T.border, 1);
    D.text(c, t('down.best'), this.cx + third / 2, this.scoreY + 24, { size: 12, color: T.muted, align: 'center' });
    D.text(c, String(this.best), this.cx + third / 2, this.scoreY + 48, { size: 22, weight: 'bold', color: T.text, align: 'center' });
    D.text(c, t('down.score'), this.cx + third * 1.5, this.scoreY + 24, { size: 12, color: T.muted, align: 'center' });
    D.text(c, String(this.score), this.cx + third * 1.5, this.scoreY + 48, { size: 22, weight: 'bold', color: T.primary, align: 'center' });
    D.text(c, t('down.speed'), this.cx + third * 2.5, this.scoreY + 24, { size: 12, color: T.muted, align: 'center' });
    D.text(c, `${(logic.speedFor(this.cleared) / logic.SPEED_BASE).toFixed(1)}×`, this.cx + third * 2.5, this.scoreY + 48, { size: 20, weight: 'bold', color: T.text, align: 'center' });
  }
  drawOptions(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.optY, this.cw, this.optH, T);
    const half = this.cw / 2;
    D.divider(c, this.cx + half, this.optY + this.optH / 2, 24, T.border, 1);
    drawTimer(c, 'stopwatch', this.cx + half / 2, this.optY + this.optH / 2, fmt(this.elapsed), { size: 15, color: T.text });
    const label = this.paused ? t('down.resume') : t('down.pause');
    const bw = Math.min(106, D.measure(c, label, 13, 'bold') + 24);
    const bx = this.cx + half + (half - bw) / 2;
    const by = this.optY + 20;
    D.fillRoundRect(c, bx, by, bw, 32, 8, this.phase === PLAY ? T.primary : T.border);
    D.text(c, label, bx + bw / 2, by + 16, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    if (this.phase === PLAY) this.addButton('pause', bx, by, bw, 32, () => this.togglePause());
    // 新游戏放在暂停左侧的小按钮
    const nw = 34;
    D.fillRoundRect(c, this.cx + half - nw - 10, by, nw, 32, 8, T.card);
    D.strokeRoundRect(c, this.cx + half - nw - 10, by, nw, 32, 8, T.border, 1);
    D.text(c, '+', this.cx + half - nw / 2 - 10, by + 16, { size: 20, weight: 'bold', color: T.text, align: 'center' });
    this.addButton('new', this.cx + half - nw - 10, by, nw, 32, () => this.startGame());
  }
  drawBoard(c) {
    const T = theme.tokens;
    D.fillRoundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 14, T.boardBg);
    c.save();
    D.roundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 14);
    c.clip();
    for (let r = 0; r < logic.ROWS; r++) for (let col = 0; col < logic.COLS; col++) {
      const x = this.boardX + col * this.cell + 1;
      const y = this.boardY + r * this.cell + 1;
      D.fillRoundRect(c, x, y, this.cell - 2, this.cell - 2, 5, 'rgba(255,255,255,0.08)');
    }
    const now = Date.now();
    const clearP = this.clearAnim ? Math.max(0, Math.min(1, (now - this.clearAnim.start) / 220)) : 0;
    const fallP = this.fallAnim ? Math.max(0, Math.min(1, (now - this.fallAnim.start) / 180)) : 1;
    const fallOffset = this.fallAnim ? -this.cell * (1 - (1 - Math.pow(1 - fallP, 3))) : 0;
    this.stack.forEach((row, i) => {
      const y = this.boardY + (this.top + i) * this.cell;
      row.cells.forEach((g, col) => {
        const x = this.boardX + col * this.cell + 1;
        if (y + this.cell < this.boardY) return;
        if (i === 0 && this.clearAnim) {
          const s = 1 + 0.25 * Math.sin(Math.PI * clearP);
          c.save();
          c.globalAlpha = 1 - clearP;
          c.translate(x + (this.cell - 2) / 2, y + this.cell / 2);
          c.scale(s, s);
          cards.draw(c, g, cards.MODE_EMOJI, -(this.cell - 2) / 2, -(this.cell - 2) / 2, this.cell - 2, this.cell - 2, true);
          c.restore();
        } else {
          cards.draw(c, g, cards.MODE_EMOJI, x, y + 1, this.cell - 2, this.cell - 2, true);
        }
      });
    });
    const py = this.boardY + (this.top - 1) * this.cell + fallOffset;
    if (py + this.cell > this.boardY) {
      let pc = this.col;
      if (this.moveAnim) {
        const mp = Math.max(0, Math.min(1, (now - this.moveAnim.start) / 150));
        const ease = 1 - Math.pow(1 - mp, 3);
        pc = this.moveAnim.from + (this.moveAnim.to - this.moveAnim.from) * ease;
      }
      const px = this.boardX + pc * this.cell + 1;
      cards.draw(c, this.glyph, cards.MODE_EMOJI, px, py + 1, this.cell - 2, this.cell - 2, true);
      D.strokeRoundRect(c, px, py + 1, this.cell - 2, this.cell - 2, 8, T.primary, 2);
    }
    c.restore();
    for (let col = 0; col < logic.COLS; col++) {
      this.addButton('col-' + col, this.boardX + col * this.cell, this.boardY, this.cell, this.boardH, () => this.pick(col));
    }
    if (this.paused && this.phase === PLAY) {
      D.fillRoundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 14, 'rgba(250,248,239,0.9)');
      if (this.resumeCount) {
        D.text(c, String(this.resumeCount), W / 2, this.boardY + this.boardH / 2 - 10, { size: 56, weight: 'bold', color: T.primary, align: 'center' });
        D.text(c, t('down.readyTip'), W / 2, this.boardY + this.boardH / 2 + 36, { size: 14, weight: 'bold', color: T.text, align: 'center' });
      } else {
        D.text(c, '⏸', W / 2, this.boardY + this.boardH / 2 - 20, { size: 34, color: T.text, align: 'center' });
        D.text(c, t('down.resumeTip'), W / 2, this.boardY + this.boardH / 2 + 24, { size: 14, weight: 'bold', color: T.text, align: 'center' });
      }
      this.addButton('resume', this.boardX, this.boardY, this.boardW, this.boardH, () => this.togglePause());
    }
    if (this.phase === OVER && this.resultVisible()) {
      D.fillRoundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 14, 'rgba(250,248,239,0.9)');
      const cy = this.boardY + this.boardH / 2;
      D.text(c, `🏁 ${t('down.tipOver')} 🏁`, W / 2, cy - 20, { size: 19, weight: 'bold', color: T.lose, align: 'center' });
      D.text(c, String(this.score), W / 2, cy + 12, { size: 30, weight: 'bold', color: T.text, align: 'center' });
      const bw = 110;
      D.fillRoundRect(c, W / 2 - bw / 2, cy + 38, bw, 32, 8, T.primary);
      D.text(c, t('down.start'), W / 2, cy + 54, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
      this.addButton('retry', W / 2 - bw / 2, cy + 38, bw, 32, () => this.startGame());
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
    ['helpMsg', 'help1', 'help2', 'help3', 'help4', 'help5'].forEach((k) => {
      const v = t('down.' + k);
      if (v !== 'down.' + k) { lines.push(...D.wrapText(c, v, w - 36, 13)); lines.push(''); }
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
    D.text(c, t('down.confirmText'), bx + bw / 2, by + 14, { size: 12, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('help-ok', bx, by, bw, 28, () => { this.helpOpen = false; });
  }
  onTheme() { this.layout(); }
  onHide() { if (this.phase === PLAY && !this.paused) { this.paused = true; } this.save(); }
  onShow() {}
}
module.exports = DownScene;
