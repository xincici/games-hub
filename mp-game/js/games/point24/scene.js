const { W, H, SAFE_TOP, SAFE_BOTTOM } = require('../../core/canvas');
const HEADER = require('../../core/header');
const { Scene } = require('../../core/app');
const theme = require('../../core/theme');
const { t } = require('../../core/i18n');
const { getRaw, setRaw, removeRaw } = require('../../core/storage');
const D = require('../../core/draw');
const ParticleField = require('../../core/particles');
const icons = require('../../core/icons');
const fabKit = require('../../core/fab');
const {
  appendable, evalTokens, isComplete, usedIndexes, newPuzzle, parseExprText,
  solveAll, scorePuzzle, NUM_COUNT,
} = require('./board');
const i18nDict = require('./i18n');

const coreI18n = require('../../core/i18n');
const confetti = require('../../core/confetti');
if (!coreI18n.__point24Registered) {
  coreI18n.register('point24', i18nDict);
  coreI18n.__point24Registered = true;
}

const PLAY = 'play';
const WON = 'won';
const GAVEUP = 'gaveup';
const OPS = ['+', '−', '×', '÷', '(', ')'];
const KEYS = {
  state: '__point24__state',
  streak: '__point24__streak',
  best: '__point24__best_streak',
};
const RECENT_MAX = 10;

function readInt(key, dflt) {
  const v = Number(getRaw(key, dflt));
  return Number.isFinite(v) && v >= 0 ? v : dflt;
}
function writeInt(key, value) { setRaw(key, String(value)); }
function tokOf(op) {
  if (op === '(') return { t: 'lp' };
  if (op === ')') return { t: 'rp' };
  return { t: 'op', op: op === '−' ? '-' : op };
}
function tokText(tok) {
  if (tok.t === 'num') return String(tok.v);
  if (tok.t === 'lp') return '(';
  if (tok.t === 'rp') return ')';
  return tok.op === '-' ? '−' : tok.op;
}

class Point24Scene extends Scene {
  constructor(app) {
    super(app);
    this.bg = new ParticleField();
    this.level = 1;
    this.nums = [];
    this.tokens = [];
    this.phase = PLAY;
    this.streak = readInt(KEYS.streak, 0);
    this.best = readInt(KEYS.best, 0);
    this.recent = [];
    this.score = 1;
    this.answer = '';
    this.revealed = '';
    this.note = '';
    this.confirming = false;
    this.helpOpen = false;
    this.confetti = [];
    this.confettiUntil = 0;
    this.lastConfettiAt = 0;
    this.now = Date.now();
    this.restored = this.restoreState();
    this.layout();
    if (!this.restored) this.deal(this.level);
  }

  restoreState() {
    try {
      const raw = getRaw(KEYS.state, '');
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.nums) || s.nums.length !== NUM_COUNT) return false;
      if (!s.nums.every(n => Number.isInteger(n) && n >= 1 && n <= 9)) return false;
      const sols = solveAll(s.nums);
      if (!sols.length) return false;
      this.answer = sols[0].expr;
      this.score = scorePuzzle(s.nums, sols);
      this.recent = (Array.isArray(s.recent) ? s.recent : [])
        .filter(a => Array.isArray(a) && a.length === NUM_COUNT && a.every(n => Number.isInteger(n) && n >= 1 && n <= 9))
        .slice(-RECENT_MAX);
      this.level = Math.max(1, Math.floor(s.level) || 1);
      this.nums = s.nums.slice();
      this.tokens = Array.isArray(s.tokens) ? s.tokens : [];
      this.phase = s.phase === WON ? WON : s.phase === GAVEUP ? GAVEUP : PLAY;
      this.revealed = typeof s.revealed === 'string' ? s.revealed : '';
      this.note = typeof s.note === 'string' ? s.note : '';
      this.best = Math.max(this.best, this.streak);
      return true;
    } catch (e) {
      return false;
    }
  }

  save() {
    try {
      setRaw(KEYS.state, JSON.stringify({
        level: this.level,
        nums: this.nums,
        tokens: this.tokens,
        phase: this.phase,
        revealed: this.revealed,
        note: this.note,
        recent: this.recent,
      }));
    } catch (e) { /* ignore */ }
  }

  deal(level) {
    this.level = Math.max(1, level || 1);
    const p = newPuzzle(this.level, Math.random, this.recent);
    this.nums = p.nums;
    this.answer = p.answer;
    this.score = p.score;
    this.recent = this.recent.concat([p.nums]).slice(-RECENT_MAX);
    this.tokens = [];
    this.revealed = '';
    this.note = '';
    this.phase = PLAY;
    this.save();
  }

  usedAll() { return usedIndexes(this.tokens).length === NUM_COUNT; }
  complete() { return isComplete(this.tokens); }
  current() { return this.complete() ? evalTokens(this.tokens) : null; }
  wrongResult() {
    return this.phase === PLAY && this.usedAll() && this.complete() && !(this.current() && this.current().is24);
  }
  noteText() {
    if (this.phase === GAVEUP) return t('point24.gaveUpNote');
    return this.note || '';
  }
  noteBad() { return this.phase === PLAY && this.wrongResult(); }

  add(tok) {
    if (this.phase !== PLAY || !appendable(this.tokens, tok)) return;
    this.tokens = this.tokens.concat([tok]);
    const done = isComplete(this.tokens) && usedIndexes(this.tokens).length === NUM_COUNT;
    if (!done) {
      this.note = '';
      this.save();
      return;
    }
    const r = evalTokens(this.tokens);
    if (r.ok && r.is24) { this.win(); return; }
    this.note = `${t('point24.notTarget')} · = ${r.ok ? r.value : '?'}`;
    this.save();
  }

  undo() {
    if (this.phase !== PLAY || !this.tokens.length) return;
    this.tokens = this.tokens.slice(0, -1);
    this.note = this.wrongResult() && this.current() ? `${t('point24.notTarget')} · = ${this.current().value}` : '';
    this.save();
  }

  win() {
    this.phase = WON;
    this.streak += 1;
    if (this.streak > this.best) {
      this.best = this.streak;
      writeInt(KEYS.best, this.best);
    }
    writeInt(KEYS.streak, this.streak);
    this.note = '';
    this.save();
    this.app.audio.playSuccess();
    this.startConfetti();
  }

  revealAnswer() {
    if (this.phase !== PLAY) return;
    this.phase = GAVEUP;
    this.app.audio.playLose();
    this.streak = 0;
    this.recent = [];
    writeInt(KEYS.streak, 0);
    this.revealed = this.answer;
    this.note = '';
    this.save();
  }

  onNewGameClick() {
    if (this.streak > 0) this.confirming = true;
    else this.startNewGame();
  }
  startNewGame() {
    this.confirming = false;
    this.streak = 0;
    this.recent = [];
    writeInt(KEYS.streak, 0);
    this.level = 1;
    this.deal(1);
  }
  nextLevel() { this.deal(this.level + 1); }

  // ---------- layout ----------
  layout() {
    this.cw = Math.min(W - 32, 440);
    this.cx = (W - this.cw) / 2;
    this.top = HEADER.TOP;
    this.headerH = HEADER.HEIGHT;
    this.homeRect = { ...HEADER.HOME_RECT };
    this.scoreY = this.top + this.headerH + 12;
    this.scoreH = 88;
    this.optY = this.scoreY + this.scoreH + 16;
    this.optH = 72;
    this.exprY = this.optY + this.optH + 16;
    this.exprH = 104;
    this.numsY = this.exprY + this.exprH + 16;
    this.numsH = 72;
    this.opsY = this.numsY + this.numsH + 16;
    this.opsH = 60;
    this.gameBottom = this.opsY + this.opsH;
    this.fabSize = 48;
    this.fabX = W - 16 - this.fabSize;
    this.fabY = H - SAFE_BOTTOM - 16 - this.fabSize;
  }

  // ---------- update / confetti ----------
  update(dt) {
    this.now = Date.now();
    if (this.bg) this.bg.update(dt || 16);
    if (this.now < this.confettiUntil && this.now - this.lastConfettiAt >= 40) {
      this.lastConfettiAt = this.now;
      this.emitConfetti();
    }
    this.confetti = confetti.update(this.confetti, dt || 16, H);
  }

  startConfetti() {
    this.confetti = [];
    this.confettiUntil = Date.now() + 1200;
    this.lastConfettiAt = 0;
  }
  emitConfetti() {
    confetti.spawn(this.confetti, { W, H, startY: H * 0.58, scoreY: this.scoreY });
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
    this.drawGame(c);
    if (!this.helpOpen && !this.confirming) this.drawFab(c);
    this.drawConfetti(c);
    if (this.helpOpen) this.drawHelp(c);
    if (this.confirming) this.drawConfirm(c);
  }

  drawHeader(c) {
    const T = theme.tokens;
    D.text(c, t('point24.gameTitle'), W / 2, this.top + this.headerH / 2, {
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
    const half = this.cw / 2;
    D.divider(c, this.cx + half, this.scoreY + this.scoreH / 2, 24, T.border, 1);
    D.text(c, t('point24.bestStreak'), this.cx + half / 2, this.scoreY + 24, { size: 12, color: T.muted, align: 'center' });
    D.text(c, String(this.best), this.cx + half / 2, this.scoreY + 49, { size: 22, weight: 'bold', color: T.text, align: 'center' });
    D.text(c, t('point24.streak'), this.cx + half + half / 2, this.scoreY + 24, { size: 12, color: T.muted, align: 'center' });
    D.text(c, String(this.streak), this.cx + half + half / 2, this.scoreY + 49, { size: 22, weight: 'bold', color: T.text, align: 'center' });
  }

  drawOptions(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.optY, this.cw, this.optH, T);
    const x1 = this.cx + this.cw * 0.3;
    const x2 = this.cx + this.cw * 0.65;
    D.divider(c, x1, this.optY + this.optH / 2, 24, T.border, 1);
    D.divider(c, x2, this.optY + this.optH / 2, 24, T.border, 1);
    const midY = this.optY + this.optH / 2;
    const label = t('point24.difficulty');
    const labelW = D.measure(c, label, 12);
    const scoreW = D.measure(c, String(this.score), 16, 'bold');
    const total = labelW + 4 + D.measure(c, '·', 12) + 4 + scoreW;
    let sx = this.cx + (x1 - this.cx - total) / 2;
    D.text(c, label, sx, midY, { size: 12, color: T.muted });
    sx += labelW + 4;
    D.text(c, '·', sx, midY, { size: 12, color: T.muted });
    sx += D.measure(c, '·', 12) + 4;
    D.text(c, String(this.score), sx, midY, { size: 16, weight: 'bold', color: T.text });

    this.drawButton(c, (x1 + x2) / 2, midY, t('point24.start'), T.primary, true, () => this.onNewGameClick(), 'new');
    this.drawButton(c, (x2 + this.cx + this.cw) / 2, midY, t('point24.reveal'), this.phase === PLAY ? T.god : T.disabled, this.phase === PLAY, () => this.revealAnswer(), 'reveal');
  }

  drawButton(c, cx, cy, label, color, enabled, onTap, id) {
    const T = theme.tokens;
    const w = Math.min(118, D.measure(c, label, 13, 'bold') + 24);
    const h = 32;
    const x = cx - w / 2;
    const y = cy - h / 2;
    D.fillRoundRect(c, x, y, w, h, 8, color);
    D.text(c, label, cx, cy, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    if (enabled) this.addButton(id, x, y, w, h, onTap);
    void T;
  }

  drawGame(c) {
    const T = theme.tokens;
    // expr
    D.card(c, this.cx, this.exprY, this.cw, this.exprH, T);
    // 算式区内部顶部常驻操作提示。
    D.text(c, t('point24.exprTip'), W / 2, this.exprY + 11, {
      size: 11.5, color: T.muted, align: 'center',
    });
    const back = { x: this.cx + this.cw - 8 - 30, y: this.exprY + this.exprH / 2 - 15, w: 30, h: 30 };
    const canBack = this.phase === PLAY && this.tokens.length > 0;
    D.fillRoundRect(c, back.x, back.y, back.w, back.h, 8, T.enter);
    const backColor = canBack ? T.text : T.muted;
    if (!icons.draw(c, 'backspace', back.x + 15, back.y + 15, 17, backColor)) {
      D.text(c, '⌫', back.x + 15, back.y + 15, { size: 15, color: backColor, align: 'center' });
    }
    if (canBack) this.addButton('backspace', back.x, back.y, back.w, back.h, () => this.undo());

    const shown = this.phase === GAVEUP ? (parseExprText(this.revealed) || []) : this.tokens;
    this.drawTokens(c, shown, W / 2, this.exprY + 24, this.cw - 80, this.exprH - 34);
    const note = this.noteText();
    if (note) {
      D.text(c, note, this.cx + this.cw / 2, this.exprY + this.exprH - 9, {
        size: 12, weight: this.noteBad() ? 'bold' : 'normal',
        color: this.noteBad() ? T.lose : (this.phase === GAVEUP ? T.primary : T.muted), align: 'center',
      });
    }

    // nums
    D.card(c, this.cx, this.numsY, this.cw, this.numsH, T);
    const numW = 56;
    const numGap = 8;
    const numsTotal = NUM_COUNT * numW + (NUM_COUNT - 1) * numGap;
    let nx = this.cx + (this.cw - numsTotal) / 2;
    const ny = this.numsY + (this.numsH - numW) / 2;
    this.nums.forEach((n, i) => {
      const tok = { t: 'num', i, v: n };
      const enabled = this.phase === PLAY && appendable(this.tokens, tok);
      D.fillRoundRect(c, nx, ny, numW, numW, 8, enabled ? T.primary : T.disabled);
      D.text(c, String(n), nx + numW / 2, ny + numW / 2, {
        size: 26, weight: 'bold', color: enabled ? '#fff' : T.muted, align: 'center',
      });
      if (enabled) this.addButton('num-' + i, nx, ny, numW, numW, () => this.add(tok));
      nx += numW + numGap;
    });

    // ops
    D.card(c, this.cx, this.opsY, this.cw, this.opsH, T);
    const opGap = 6;
    const opPad = 12;
    const opW = (this.cw - opPad * 2 - opGap * (OPS.length - 1)) / OPS.length;
    const oh = 44;
    let ox = this.cx + opPad;
    const oy = this.opsY + (this.opsH - oh) / 2;
    OPS.forEach((op) => {
      const tok = tokOf(op);
      const enabled = this.phase === PLAY && appendable(this.tokens, tok);
      // 可点：白底 + 主色描边；不可点：明显的灰底 + 灰字，不再和可点态几乎一样。
      D.fillRoundRect(c, ox, oy, opW, oh, 8, enabled ? T.card : T.disabled);
      D.strokeRoundRect(c, ox, oy, opW, oh, 8, enabled ? T.primary : T.border, 1);
      D.text(c, op, ox + opW / 2, oy + oh / 2, {
        size: 20, weight: 'bold', color: enabled ? T.primary : T.muted, align: 'center',
      });
      if (enabled) this.addButton('op-' + op, ox, oy, opW, oh, () => this.add(tok));
      ox += opW + opGap;
    });

    if (this.phase === WON) this.drawWin(c);
  }

  drawTokens(c, tokens, centerX, y, maxW, maxH) {
    const T = theme.tokens;
    if (!tokens.length) return;
    const gap = 6;
    const rows = [];
    let row = [];
    let rowW = 0;
    const measureToken = (tok) => {
      const txt = tokText(tok);
      return (tok.t === 'num' ? D.measure(c, txt, 18, 'bold') + 16 : D.measure(c, txt, 18, 'bold') + 4);
    };
    tokens.forEach((tok) => {
      const tw = measureToken(tok);
      if (row.length && rowW + gap + tw > maxW) {
        rows.push(row);
        row = [];
        rowW = 0;
      }
      row.push({ tok, w: tw });
      rowW += (row.length > 1 ? gap : 0) + tw;
    });
    if (row.length) rows.push(row);
    const rowH = 30;
    const totalH = rows.length * rowH + (rows.length - 1) * 4;
    let ty = y + (maxH - totalH) / 2;
    rows.forEach((r) => {
      const total = r.reduce((a, b, i) => a + b.w + (i ? gap : 0), 0);
      let tx = centerX - total / 2;
      r.forEach(({ tok, w }) => {
        const txt = tokText(tok);
        if (tok.t === 'num') {
          D.fillRoundRect(c, tx, ty + 2, w, 26, 7, T.enter);
          D.text(c, txt, tx + w / 2, ty + 15, { size: 18, weight: 'bold', color: T.text, align: 'center' });
        } else {
          D.text(c, txt, tx + w / 2, ty + 15, { size: 18, weight: 'bold', color: T.muted, align: 'center' });
        }
        tx += w + gap;
      });
      ty += rowH + 4;
    });
  }

  drawWin(c) {
    if (!this.resultVisible()) return;
    const T = theme.tokens;
    const top = this.exprY;
    const h = this.gameBottom - top;
    D.fillRoundRect(c, this.cx, top, this.cw, h, 14, T.overlay);
    const cx = W / 2;
    const cy = top + h / 2;
    D.text(c, `🎉 ${t('point24.win')}`, cx, cy - 34, { size: 18, weight: 'bold', color: T.win, align: 'center' });
    D.text(c, `🔥 ${t('point24.streak')} ${this.streak}`, cx, cy - 4, { size: 16, weight: 'bold', color: T.win, align: 'center' });
    const label = t('point24.nextLevel');
    const bw = Math.min(160, D.measure(c, label, 13, 'bold') + 24);
    const bx = cx - bw / 2;
    const by = cy + 28;
    D.fillRoundRect(c, bx, by, bw, 32, 8, T.primary);
    D.text(c, label, cx, by + 16, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('next', bx, by, bw, 32, () => this.nextLevel());
  }

  drawFab(c) {
    const T = theme.tokens;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.12)';
    c.shadowBlur = 10;
    c.shadowOffsetY = 2;
    D.circle(c, this.fabX + this.fabSize / 2, this.fabY + this.fabSize / 2, this.fabSize / 2, T.card);
    c.restore();
    if (!icons.draw(c, 'help', this.fabX + this.fabSize / 2, this.fabY + this.fabSize / 2, 22, T.primary)) {
      D.text(c, '?', this.fabX + this.fabSize / 2, this.fabY + this.fabSize / 2, {
        size: 22, weight: 'bold', color: T.primary, align: 'center',
      });
    }
    this.addButton('help', this.fabX, this.fabY, this.fabSize, this.fabSize, () => { this.helpOpen = true; });
    fabKit.drawMute(this, c, fabKit.leftSlot({ x: this.fabX, y: this.fabY, w: this.fabSize, h: this.fabSize }));
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
    ['help1', 'help2', 'help3'].forEach((k) => {
      const value = t('point24.' + k);
      if (value !== 'point24.' + k) {
        lines.push(...D.wrapText(c, value, w - 40, 14));
        lines.push('');
      }
    });
    const lineH = 21;
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
    D.text(c, t('point24.confirmText'), bx + bw / 2, by + 15, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('help-ok', bx, by, bw, 30, () => { this.helpOpen = false; });
  }

  drawConfirm(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fillRect(0, 0, W, H);
    const w = W - 56;
    const h = 210;
    const x = (W - w) / 2;
    const y = (H - h) / 2;
    D.card(c, x, y, w, h, T);
    D.text(c, t('point24.newGame'), x + 20, y + 34, { size: 17, weight: 'bold', color: T.text });
    const lines = D.wrapText(c, t('point24.newGameConfirm'), w - 40, 14);
    lines.forEach((line, i) => D.text(c, line, x + 20, y + 64 + i * 21, { size: 14, color: T.muted }));
    const gap = 12;
    const bw = (w - 40 - gap) / 2;
    const by = y + h - 48;
    this.addButton('confirm-mask', 0, 0, W, H, () => { this.confirming = false; });
    this.drawConfirmButton(c, x + 20, by, bw, 32, t('point24.cancel'), T.border, T.text, () => { this.confirming = false; });
    this.drawConfirmButton(c, x + 20 + bw + gap, by, bw, 32, t('point24.confirmOk'), T.primary, '#fff', () => this.startNewGame());
  }

  drawConfirmButton(c, x, y, w, h, label, border, color, onTap) {
    D.fillRoundRect(c, x, y, w, h, 8, color === '#fff' ? border : 'rgba(0,0,0,0)');
    if (color !== '#fff') D.strokeRoundRect(c, x, y, w, h, 8, border, 1);
    D.text(c, label, x + w / 2, y + h / 2, { size: 13, weight: 'bold', color, align: 'center' });
    this.addButton('confirm-' + label, x, y, w, h, onTap);
  }

  onTheme() { this.layout(); }
  onHide() {}
  onShow() {}
}

module.exports = Point24Scene;
