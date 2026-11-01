const { W, H, SAFE_TOP, SAFE_BOTTOM } = require('../../core/canvas');
const HEADER = require('../../core/header');
const { Scene } = require('../../core/app');
const theme = require('../../core/theme');
const { t } = require('../../core/i18n');
const { getRaw, setRaw } = require('../../core/storage');
const { ClickLogic, GAMING, LOSE, WIN, NB } = require('./logic');
const D = require('../../core/draw');
const ParticleField = require('../../core/particles');
const icons = require('../../core/icons');
const i18nDict = require('./i18n');

// 注册本游戏文案，键前缀 click.*
const coreI18n = require('../../core/i18n');
const confetti = require('../../core/confetti');
if (!coreI18n.__clickRegistered) {
  coreI18n.register('click', i18nDict);
  coreI18n.__clickRegistered = true;
}

const MIN_DIFFICULTY = 3;
const MAX_DIFFICULTY = 10;
const DIFFICULTY_KEY = '__easy_click_game__difficulty';
const INIT_DIFFICULTY = 6;
const VIRTUAL_CLICK_EFFECT_DURATION = 220;
const VIRTUAL_CLICK_WAIT_DURATION = 300;
const REVEAL_STEP_MS = 16;
const GAP = 4;
const PAD = 10;

function rgba(arr) { return D.rgba(arr); }
function mix(a, b, t) { return D.mix(a, b, t); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function bestKey(n) { return `__easy_click_game__${n}`; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

class ClickScene extends Scene {
  constructor(app) {
    super(app);
    this.difficulty = clamp(+getRaw(DIFFICULTY_KEY, INIT_DIFFICULTY) || INIT_DIFFICULTY, MIN_DIFFICULTY, MAX_DIFFICULTY);
    this.logic = new ClickLogic(this.difficulty);
    this.best = +getRaw(bestKey(this.difficulty), 0) || 0;
    this.revealStart = 0;
    this.revealCount = 0;
    this.display = this.logic.cells.slice();
    this.anim = new Array(this.display.length).fill(null);
    this.pressedId = null;
    this.helpOpen = false;
    this.lastResult = GAMING;
    this.autoGen = 0;
    this.autoplaying = false;
    this.highlight = null;
    this.confetti = [];
    this.confettiUntil = 0;
    this.lastConfettiAt = 0;
    this.now = Date.now();
    this.bg = new ParticleField();
    this.layout();
    this.startReveal();
  }

  // ---------- 生命周期 / 状态 ----------
  startReveal() {
    this.revealStart = Date.now();
    this.revealCount = 1;
  }

  newGame() {
    this.stopAutoplay();
    this.logic = new ClickLogic(this.difficulty);
    this.display = this.logic.cells.slice();
    this.anim = new Array(this.display.length).fill(null);
    this.best = +getRaw(bestKey(this.difficulty), 0) || 0;
    this.lastResult = GAMING;
    this.confetti = [];
    this.startReveal();
  }

  changeDifficulty(delta) {
    const next = this.difficulty + delta;
    if (next < MIN_DIFFICULTY || next > MAX_DIFFICULTY) return;
    this.difficulty = next;
    setRaw(DIFFICULTY_KEY, String(next));
    this.newGame();
    this.layout();
  }

  stopAutoplay() {
    this.autoGen += 1;
    this.autoplaying = false;
    this.highlight = null;
  }

  async autoplay() {
    if (this.autoplaying) { this.stopAutoplay(); return; }
    if (this.logic.undoIndex !== -1) return;
    const gen = ++this.autoGen;
    this.autoplaying = true;
    const opts = this.logic.solutionOps();
    for (let i = 0; i < opts.length; i++) {
      if (gen !== this.autoGen || !this.autoplaying || this.logic.result !== GAMING) break;
      const [row, col] = opts[i];
      this.highlight = [row, col];
      this.clickCell(row, col, true);
      await sleep(VIRTUAL_CLICK_EFFECT_DURATION);
      if (gen !== this.autoGen) break;
      this.highlight = null;
      await sleep(VIRTUAL_CLICK_WAIT_DURATION);
    }
    if (gen === this.autoGen) this.stopAutoplay();
  }

  onHide() {
    this.stopAutoplay();
    this.revealPausedAt = Date.now();
  }

  onShow() {
    if (this.revealCount < this.difficulty * this.difficulty) {
      const paused = this.revealPausedAt ? Date.now() - this.revealPausedAt : 0;
      this.revealStart += paused;
    }
  }

  onTheme() {
    this.layout();
  }

  // ---------- 布局 ----------
  layout() {
    const n = this.difficulty;
    this.cw = Math.min(W - 32, 480);
    this.cx = (W - this.cw) / 2;
    this.top = HEADER.TOP;
    this.headerH = HEADER.HEIGHT;
    this.homeRect = { ...HEADER.HOME_RECT };
    this.scoreY = this.top + this.headerH + 12;
    this.scoreH = 72;
    this.optY = this.scoreY + this.scoreH + 16;
    this.optH = 72;
    this.legendY = this.optY + this.optH + 10;
    this.legendH = 24;
    this.boardY = this.legendY + this.legendH;
    const undoH = 48;
    const fabBottom = SAFE_BOTTOM + 16;
    const reserve = 12 + undoH + 16 + 56 + fabBottom;
    const maxH = H - this.boardY - reserve;
    const maxW = W - 24;
    const base = n <= 4 ? 50 : n <= 6 ? 44 : n <= 8 ? 38 : n <= 9 ? 33 : 30;
    const byW = Math.floor((maxW - PAD * 2 - (n - 1) * GAP) / n);
    const byH = Math.floor((maxH - PAD * 2 - (n - 1) * GAP) / n);
    this.cell = clamp(Math.min(base, byW, byH), 20, 50);
    this.boardW = n * this.cell + (n - 1) * GAP + PAD * 2;
    this.boardH = this.boardW;
    this.boardX = (W - this.boardW) / 2;
    this.undoY = this.boardY + this.boardH + 12;
    this.undoW = Math.min(this.cw * 622 / 750, 398);
    this.undoX = (W - this.undoW) / 2;
    this.undoH = undoH;
    this.fabSize = 48;
    this.fabX = W - 16 - this.fabSize;
    this.fabY = H - SAFE_BOTTOM - 16 - this.fabSize;
  }

  // 每格坐标（board 内 + PAD/GAP）
  cellRect(idx) {
    const n = this.difficulty;
    const r = Math.floor(idx / n);
    const c = idx % n;
    return {
      x: this.boardX + PAD + c * (this.cell + GAP),
      y: this.boardY + PAD + r * (this.cell + GAP),
      w: this.cell,
      h: this.cell,
    };
  }

  addButton(id, x, y, w, h, onTap) {
    this.buttons.push({ id, x, y, w, h, onTap });
  }

  // ---------- 更新时间 ----------
  update(dt) {
    this.now = Date.now();
    const step = Math.min(32, dt || 16) / 16.67;
    if (this.bg) this.bg.update(16);
    const total = this.difficulty * this.difficulty;
    if (this.revealCount < total) {
      const next = Math.min(total, 1 + Math.floor((this.now - this.revealStart) / REVEAL_STEP_MS));
      if (next > this.revealCount) this.revealCount = next;
    }
    const n = this.difficulty;
    if (this.lastResult !== this.logic.result) {
      this.lastResult = this.logic.result;
      if (this.logic.result === WIN) {
        this.updateBest();
        this.app.audio.playSuccess();
        this.startConfetti();
      } else if (this.logic.result === LOSE) {
        this.app.audio.playLose();
      }
    }
    for (let i = 0; i < this.anim.length; i++) {
      const a = this.anim[i];
      if (!a) continue;
      const p = clamp((this.now - a.start) / 320, 0, 1);
      this.display[i] = a.from + (a.to - a.from) * easeOut(p);
      if (p >= 1) this.anim[i] = null;
    }
    // 胜利撒花：左右两侧各一门礼炮，持续 1.2s（与 web 的 celebrate 一致）
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

  updateBest() {
    const score = this.logic.maxClick - this.logic.clickCount;
    if (!this.best || this.best < score) {
      setRaw(bestKey(this.difficulty), String(score));
      this.best = score;
      this.logic.result = NB;
    }
  }

  // ---------- 触摸 / 按钮 ----------
  clickCell(row, col, fromAuto) {
    if (!fromAuto && this.autoplaying) return;
    if (this.logic.result !== GAMING) return;
    const idx = row * this.difficulty + col;
    if (!fromAuto && idx >= this.revealCount) return;
    const before = this.logic.cells.slice();
    if (!this.logic.click(row, col)) return;
    this.syncTargets(before);
  }

  syncTargets(before) {
    for (let i = 0; i < this.logic.cells.length; i++) {
      if (before[i] !== this.logic.cells[i]) {
        this.anim[i] = { from: this.display[i], to: this.logic.cells[i], start: Date.now() };
      }
    }
  }

  undo() {
    if (this.autoplaying) return;
    const before = this.logic.cells.slice();
    this.logic.undo();
    this.syncTargets(before);
  }

  redo() {
    if (this.autoplaying) return;
    const before = this.logic.cells.slice();
    this.logic.redo();
    this.syncTargets(before);
  }

  // ---------- 绘制 ----------
  render(c) {
    const T = theme.tokens;
    c.fillStyle = T.bg;
    c.fillRect(0, 0, W, H);
    if (this.bg) this.bg.draw(c, theme.dark);

    this.drawHeader(c);
    this.drawScore(c);
    this.drawOptions(c);
    this.drawLegend(c);
    this.drawBoard(c);
    this.drawUndo(c);
    if (!this.helpOpen) {
      this.addButton('home', this.homeRect.x, this.homeRect.y, this.homeRect.w, this.homeRect.h, () => {
        this.app.goHome();
      });
      this.drawFab(c);
    } else {
      this.addButton('help', this.fabX, this.fabY, this.fabSize, this.fabSize, () => { this.helpOpen = true; });
    }
    this.drawConfetti(c);
    if (this.helpOpen) this.drawHelp(c);
  }

  drawHeader(c) {
    const T = theme.tokens;
    D.text(c, t('click.gameTitle'), W / 2, this.top + this.headerH / 2, {
      size: 15, weight: 'bold', color: T.text, align: 'center',
    });
    // 返回首页：小游戏没有原生导航栏，只能自绘一枚 home 图标
    const h = this.homeRect;
    const cx = h.x + h.w / 2;
    const cy = h.y + h.h / 2;
    if (!icons.draw(c, 'home', cx, cy, 24, T.text)) {
      c.save();
      c.strokeStyle = T.text;
      c.lineWidth = 1.8;
      c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(cx - 11, cy - 1);
      c.lineTo(cx, cy - 11);
      c.lineTo(cx + 11, cy - 1);
      c.moveTo(cx - 8, cy - 1);
      c.lineTo(cx - 8, cy + 10);
      c.lineTo(cx + 8, cy + 10);
      c.lineTo(cx + 8, cy - 1);
      c.stroke();
      c.restore();
    }
  }

  drawScore(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.scoreY, this.cw, this.scoreH, T);
    const mid = this.cx + this.cw / 2;
    D.divider(c, mid, this.scoreY + this.scoreH / 2, 24, T.border, 1);
    D.text(c, t('click.bestScore'), this.cx + this.cw / 4, this.scoreY + 25, { size: 12, color: T.muted, align: 'center' });
    D.text(c, this.best || '--', this.cx + this.cw / 4, this.scoreY + 48, { size: 22, weight: 'bold', color: T.text, align: 'center' });
    D.text(c, t('click.availableClicks'), this.cx + this.cw * 3 / 4, this.scoreY + 25, { size: 12, color: T.muted, align: 'center' });
    D.text(c, String(this.logic.maxClick - this.logic.clickCount), this.cx + this.cw * 3 / 4, this.scoreY + 48, { size: 22, weight: 'bold', color: T.text, align: 'center' });
  }

  drawOptions(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.optY, this.cw, this.optH, T);
    const y = this.optY;
    const x1 = this.cx + this.cw * 3 / 10;
    const x2 = this.cx + this.cw * (3 / 10 + 3.5 / 10);
    D.divider(c, x1, y + this.optH / 2, 24, T.border, 1);
    D.divider(c, x2, y + this.optH / 2, 24, T.border, 1);

    // 难度 - / 数字 / +
    const minus = { x: this.cx + 16, y: y + this.optH / 2 - 14, w: 28, h: 28 };
    const plus = { x: x1 - 44, y: minus.y, w: 28, h: 28 };
    this.drawMiniButton(c, minus, '-', this.difficulty > MIN_DIFFICULTY, () => this.changeDifficulty(-1));
    this.drawMiniButton(c, plus, '+', this.difficulty < MAX_DIFFICULTY, () => this.changeDifficulty(1));
    D.text(c, String(this.difficulty), (minus.x + 28 + plus.x) / 2, y + this.optH / 2, {
      size: 18, weight: 'bold', color: T.text, align: 'center',
    });

    // 新游戏
    const startText = t('click.start');
    const startW = Math.min(x2 - x1 - 12, D.measure(c, startText, 13, 'bold') + 24);
    const startX = (x1 + x2) / 2 - startW / 2;
    const startY = y + (this.optH - 32) / 2;
    this.drawPrimaryButton(c, startX, startY, startW, 32, startText, T.primary, true, () => this.newGame(), 'new');

    // 上帝模式
    const godText = this.autoplaying ? t('click.godPause') : t('click.godMode');
    const godSegment = this.cx + this.cw - x2;
    const godW = Math.min(godSegment - 12, D.measure(c, godText, 13, 'bold') + 24);
    const godX = (x2 + this.cx + this.cw) / 2 - godW / 2;
    const godY = y + (this.optH - 32) / 2;
    const godEnabled = this.autoplaying || this.logic.undoIndex === -1;
    this.drawPrimaryButton(c, godX, godY, godW, 32, godText, godEnabled ? T.god : T.disabled, godEnabled, () => this.autoplay(), 'god');
  }

  drawMiniButton(c, r, label, enabled, onTap) {
    const T = theme.tokens;
    D.fillRoundRect(c, r.x, r.y, r.w, r.h, 8, T.card);
    D.strokeRoundRect(c, r.x, r.y, r.w, r.h, 8, T.border, 1);
    D.text(c, label, r.x + r.w / 2, r.y + r.h / 2, {
      size: 15, weight: 'bold', color: enabled ? T.text : T.border, align: 'center',
    });
    if (enabled) this.addButton('diff-' + label, r.x - 8, r.y - 8, r.w + 16, r.h + 16, onTap);
  }

  drawPrimaryButton(c, x, y, w, h, label, color, enabled, onTap, id) {
    const T = theme.tokens;
    D.fillRoundRect(c, x, y, w, h, 8, color);
    D.text(c, label, x + w / 2, y + h / 2, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    if (enabled) this.addButton(id, x, y, w, h, onTap);
    void T;
  }

  drawLegend(c) {
    const T = theme.tokens;
    const y = this.legendY + 12;
    const items = [
      { level: 0, label: t('click.lampOff') },
      { level: 1, label: t('click.lampFull') },
      { level: 2, label: t('click.lampHalf') },
    ];
    const tip = t('click.lampTip');
    const widths = items.map(item => 18 + D.measure(c, item.label, 11));
    const arrowW = D.measure(c, '→', 12);
    const loopW = D.measure(c, '↺', 12);
    const tipW = D.measure(c, tip, 10);
    const total = widths[0] + widths[1] + widths[2] + arrowW * 3 + loopW + tipW + 26;
    let x = (W - total) / 2;
    items.forEach((item, i) => {
      const off = item.level === 0;
      const half = item.level === 2;
      const color = off ? T.lamp.bulbOff : half ? T.lamp.bulbHalf : T.lamp.bulbFull;
      c.save();
      c.shadowColor = off ? 'transparent' : rgba(half ? T.lamp.glowHalf : T.lamp.glowFull);
      c.shadowBlur = off ? 0 : half ? 6 : 8;
      D.circle(c, x + 7, y, 7, rgba(color));
      c.restore();
      D.text(c, item.label, x + 18, y, { size: 11, color: T.muted, align: 'left' });
      x += widths[i] + 4;
      if (i < items.length - 1) {
        D.text(c, '→', x, y, { size: 12, color: T.muted, align: 'center' });
        x += arrowW + 2;
      }
    });
    D.text(c, '↺', x, y, { size: 12, color: T.muted, align: 'center' });
    x += loopW + 4;
    D.text(c, tip, x, y, { size: 10, color: T.muted, align: 'left' });
  }

  drawBoard(c) {
    const T = theme.tokens;
    const n = this.difficulty;
    const total = n * n;
    for (let i = 0; i < total; i++) {
      const r = this.cellRect(i);
      this.drawLamp(c, r, this.display[i]);
      if (i >= this.revealCount) {
        D.fillRoundRect(c, r.x, r.y, r.w, r.h, 8, T.cellMask);
      }
      if (this.highlight && this.highlight[0] * n + this.highlight[1] === i) {
        D.strokeRoundRect(c, r.x + 2, r.y + 2, r.w - 4, r.h - 4, 7, T.primary, 3);
      }
      if (this.revealCount >= total && !this.autoplaying && this.logic.result === GAMING) {
        this.addButton('cell-' + i, r.x, r.y, r.w, r.h, () => this.clickCell(Math.floor(i / n), i % n));
      }
    }
    if (!this.resultVisible(250, 'click:' + this.logic.result)) return;
    if (this.logic.result >= WIN) {
      c.fillStyle = T.overlay;
      D.fillRoundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 8, T.overlay);
      D.text(c, `🎉🎉 ${t('click.tipWin')} 🎉🎉`, W / 2, this.boardY + this.boardH / 2 - 8, {
        size: 18, weight: 'bold', color: T.win, align: 'center',
      });
      if (this.logic.result === NB) {
        D.text(c, t('click.newBest'), W / 2, this.boardY + this.boardH / 2 + 20, {
          size: 14, color: T.win, align: 'center',
        });
      }
    } else if (this.logic.result === LOSE) {
      D.fillRoundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 8, T.overlay);
      D.text(c, `👻👻 ${t('click.tipLost')} 👻👻`, W / 2, this.boardY + this.boardH / 2, {
        size: 18, weight: 'bold', color: T.lose, align: 'center',
      });
    }
  }

  drawLamp(c, r, level) {
    const T = theme.tokens;
    const off = T.lamp.housingOff;
    const half = T.lamp.housingHalf;
    const on = T.lamp.housingOn;
    const housing = level <= 1 ? mix(off, on, clamp(level, 0, 1)) : mix(on, half, clamp(level - 1, 0, 1));
    const bulbOff = T.lamp.bulbOff;
    const bulbFull = T.lamp.bulbFull;
    const bulbHalf = T.lamp.bulbHalf;
    const bulb = level <= 1 ? mix(bulbOff, bulbFull, clamp(level, 0, 1)) : mix(bulbFull, bulbHalf, clamp(level - 1, 0, 1));
    const glow = level <= 1 ? mix(T.lamp.glowHalf, T.lamp.glowFull, level) : mix(T.lamp.glowFull, T.lamp.glowHalf, level - 1);
    const rim = level <= 1 ? mix([0, 0, 0, 0], T.lamp.rimOn, level) : mix(T.lamp.rimOn, T.lamp.rimHalf, level - 1);

    c.save();
    c.shadowColor = rgba(glow);
    c.shadowBlur = level * 10;
    D.fillRoundRect(c, r.x, r.y, r.w, r.h, 8, rgba(housing));
    c.restore();
    D.strokeRoundRect(c, r.x, r.y, r.w, r.h, 8, rgba(rim), 1);

    const inset = r.w * 0.22;
    const bx = r.x + inset;
    const by = r.y + inset;
    const bw = r.w - inset * 2;
    c.save();
    c.shadowColor = rgba(glow);
    c.shadowBlur = level * 16;
    D.circle(c, bx + bw / 2, by + bw / 2, bw / 2, rgba(bulb));
    c.restore();
  }

  drawUndo(c) {
    const T = theme.tokens;
    const h = this.undoH;
    D.card(c, this.undoX, this.undoY, this.undoW, h, T);
    const half = this.undoW / 2;
    D.divider(c, this.undoX + half, this.undoY + h / 2, 24, T.border, 1);
    const canUndo = this.logic.undoIndex >= 0 && this.logic.result === GAMING && !this.autoplaying;
    const canRedo = this.logic.undoIndex < this.logic.userOpts.length - 1 && this.logic.result === GAMING && !this.autoplaying;
    this.drawUndoButton(c, this.undoX, this.undoY, half, h, 'undo', '↶', t('click.undo'), canUndo, () => this.undo());
    this.drawUndoButton(c, this.undoX + half, this.undoY, half, h, 'redo', '↷', t('click.redo'), canRedo, () => this.redo());
  }

  drawUndoButton(c, x, y, w, h, iconKey, fallbackIcon, label, enabled, onTap) {
    const T = theme.tokens;
    const cy = y + h / 2;
    const labelW = D.measure(c, label, 12.5, 'bold');
    const groupW = 18 + 6 + labelW;
    const start = x + (w - groupW) / 2;
    c.save();
    c.globalAlpha = enabled ? 1 : 0.4;
    if (!icons.draw(c, iconKey, start + 9, cy, 18, T.text)) {
      D.text(c, fallbackIcon, start + 9, cy, { size: 18, weight: 'bold', color: T.text, align: 'center' });
    }
    D.text(c, label, start + 18 + 6 + labelW / 2, cy, {
      size: 12.5, weight: 'bold', color: T.text, align: 'center',
    });
    c.restore();
    if (enabled) this.addButton('undo-' + label, x, y, w, h, onTap);
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
    ['helpMsg', 'help1', 'help2', 'help3', 'help4'].forEach((k) => {
      if (t('click.' + k) !== 'click.' + k) {
        lines.push(...D.wrapText(c, t('click.' + k), w - 40, 14));
        lines.push('');
      }
    });
    const lineH = 21;
    const h = Math.min(H - 80, 74 + lines.length * lineH + 64);
    const y = (H - h) / 2;
    D.card(c, x, y, w, h, T);
    D.text(c, '?', x + 24, y + 30, { size: 24, weight: 'bold', color: T.primary });
    D.text(c, t('help'), x + 50, y + 30, {
      size: 16, weight: 'bold', color: T.text,
    });
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
    D.fillRoundRect(c, bx, by, bw, 30, 8, T.primary);
    D.text(c, t('click.confirmText'), bx + bw / 2, by + 15, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('help-close', bx, by, bw, 30, () => { this.helpOpen = false; });
  }
}

module.exports = ClickScene;
