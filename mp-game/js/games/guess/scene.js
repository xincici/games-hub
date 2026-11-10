const { W, H, SAFE_TOP, SAFE_BOTTOM } = require('../../core/canvas');
const share = require('../../core/share');
const HEADER = require('../../core/header');
const { drawTimer } = require('../../core/timer');
const { Scene } = require('../../core/app');
const theme = require('../../core/theme');
const { t } = require('../../core/i18n');
const { getRaw, setRaw, removeRaw } = require('../../core/storage');
const D = require('../../core/draw');
const ParticleField = require('../../core/particles');
const icons = require('../../core/icons');
const fabKit = require('../../core/fab');
const i18nDict = require('./i18n');

const coreI18n = require('../../core/i18n');
const confetti = require('../../core/confetti');
const achv = require('../../core/achv');
if (!coreI18n.__guessRegistered) {
  coreI18n.register('guess', i18nDict);
  coreI18n.__guessRegistered = true;
}

const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8];
const GAME_SIZE = 4;
const MAX_GUESS = 8;
const GAMING = 0;
const LOSE = 1;
const WIN = 2;
const PREFIX = '__guess_number__';
const KEY_STATE = `${PREFIX}state`;
const KEY_STREAK = `${PREFIX}streak`;
const KEY_BEST = `${PREFIX}best`;
const KEY_ROBOT = `${PREFIX}robot`;

function readInt(key, dflt) {
  const v = Number(getRaw(key, dflt));
  return Number.isFinite(v) && v >= 0 ? v : dflt;
}
function fmt(sec) {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}
function shuffle(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

class GuessScene extends Scene {
  constructor(app) {
    super(app);
    this.bg = new ParticleField();
    this.answer = '';
    this.history = [];
    this.current = '';
    this.result = GAMING;
    this.time = 0;
    this.baseTime = 0;
    this.startAt = 0;
    this.streak = readInt(KEY_STREAK, 0);
    this.best = readInt(KEY_BEST, 0);
    this.robot = getRaw(KEY_ROBOT, '') !== '';
    this.confirming = false;
    this.helpOpen = false;
    this.confetti = [];
    this.confettiUntil = 0;
    this.lastConfettiAt = 0;
    this.historyScroll = 0;
    this.drag = null;
    this.robotQueue = [];
    this.robotNextAt = 0;
    this.now = Date.now();
    this.layout();
    if (!this.restoreState()) this.initGame({ autoRobot: true });
  }

  // ---------- storage / lifecycle ----------
  loadRecords() {
    this.streak = readInt(KEY_STREAK, 0);
    this.best = readInt(KEY_BEST, 0);
  }
  saveRecords() {
    setRaw(KEY_STREAK, String(this.streak));
    setRaw(KEY_BEST, String(this.best));
  }
  saveState() {
    try {
      setRaw(KEY_STATE, JSON.stringify({
        answer: this.answer,
        history: this.history,
        result: this.result,
        time: this.time,
        streak: this.streak,
      }));
    } catch (e) { /* ignore */ }
  }
  restoreState() {
    try {
      const raw = getRaw(KEY_STATE, '');
      if (!raw) return false;
      const saved = JSON.parse(raw);
      if (!saved || !/^[1-8]{4}$/.test(saved.answer || '')) return false;
      if (!Array.isArray(saved.history) || !saved.history.length) return false;
      this.streak = Number.isFinite(saved.streak) ? Math.max(0, saved.streak) : this.streak;
      this.initGame({
        answer: saved.answer,
        history: saved.history,
        result: saved.result === LOSE ? LOSE : saved.result === WIN ? WIN : GAMING,
        time: +saved.time || 0,
        autoRobot: false,
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  initGame(opts) {
    const o = opts || {};
    this.robotQueue = [];
    this.robotNextAt = 0;
    this.answer = o.answer || shuffle(NUMBERS).slice(0, GAME_SIZE).join('');
    this.history = Array.isArray(o.history) ? o.history.slice() : [];
    this.current = '';
    this.result = o.result === LOSE ? LOSE : o.result === WIN ? WIN : GAMING;
    this.baseTime = Math.max(0, +o.time || 0);
    this.time = this.baseTime;
    this.startAt = Date.now();
    this.historyScroll = 0;
    this.confirming = false;
    this.helpOpen = false;
    const autoRobot = o.autoRobot === true;
    if (autoRobot && this.robot && this.result === GAMING) {
      this.robotQueue = [1, 2, 3, 4];
      this.robotNextAt = Date.now() + 200;
    }
    this.saveState();
    if (this.history.length) this.scrollToBottom();
  }

  newAnswer() {
    return shuffle(NUMBERS).slice(0, GAME_SIZE).join('');
  }

  onNewGame() {
    if (this.result === LOSE) {
      this.startNewGame();
      return;
    }
    this.confirming = true;
  }
  startNewGame() {
    this.confirming = false;
    this.streak = 0;
    this.saveRecords();
    this.initGame({ autoRobot: true });
  }
  nextRound() {
    this.initGame({ autoRobot: true });
  }
  toggleRobot() {
    this.robot = !this.robot;
    if (this.robot) setRaw(KEY_ROBOT, '1');
    else removeRaw(KEY_ROBOT);
  }

  // ---------- timer / robot ----------
  update(dt) {
    this.now = Date.now();
    if (this.bg) this.bg.update(dt || 16);
    if (this.result === GAMING) {
      const sec = this.baseTime + Math.floor((this.now - this.startAt) / 1000);
      if (sec !== this.time) {
        this.time = sec;
        this.saveState();
      }
    }
    if (this.robotQueue.length && this.result === GAMING && this.now >= this.robotNextAt) {
      const n = this.robotQueue.shift();
      if (!this.current.includes(String(n)) && this.current.length < GAME_SIZE) this.current += String(n);
      this.robotNextAt = this.now + 200;
      if (!this.robotQueue.length && this.current.length === GAME_SIZE) this.guessOnce();
    }
    if (this.now < this.confettiUntil && this.now - this.lastConfettiAt >= 40) {
      this.lastConfettiAt = this.now;
      this.emitConfetti();
    }
    this.confetti = confetti.update(this.confetti, dt || 16, H);
  }

  // ---------- input ----------
  addNumber(n) {
    if (this.result !== GAMING) return;
    if (this.robotQueue.length) this.robotQueue = [];
    if (this.current.includes(String(n)) || this.current.length >= GAME_SIZE) return;
    this.current += String(n);
  }
  delNumber() {
    if (this.result !== GAMING || !this.current.length) return;
    this.robotQueue = [];
    this.current = this.current.slice(0, -1);
  }
  guessOnce() {
    if (this.result !== GAMING || this.current.length !== GAME_SIZE) return;
    let a = 0;
    let b = 0;
    for (let i = 0; i < GAME_SIZE; i++) {
      const ch = this.current[i];
      if (this.answer[i] === ch) a += 1;
      else if (this.answer.indexOf(ch) >= 0) b += 1;
    }
    this.history.push({ nums: this.current.split('').map(Number), res: `${a}A${b}B` });
    this.current = '';
    if (a === GAME_SIZE) {
      this.result = WIN;
      achv.win('guess', { fast: this.history.length <= 4 });
      this.streak += 1;
      this.best = Math.max(this.best, this.streak);
      this.saveRecords();
      this.saveState();
      this.startConfetti();
      this.app.audio.playSuccess();
      this.scrollToBottom();
      return;
    }
    if (this.history.length >= MAX_GUESS) {
      this.result = LOSE;
      this.streak = 0;
      this.saveRecords();
      this.app.audio.playLose();
      this.saveState();
      this.scrollToBottom();
      return;
    }
    this.saveState();
    this.scrollToBottom();
  }

  // ---------- layout ----------
  layout() {
    this.cw = Math.min(W - 32, 440);
    this.cx = (W - this.cw) / 2;
    this.top = HEADER.TOP;
    this.headerH = HEADER.HEIGHT;
    this.homeRect = { ...HEADER.HOME_RECT };
    this.fabSize = fabKit.SIZE;
    this.helpFab = { x: W - 16 - fabKit.SIZE, y: 0, w: fabKit.SIZE, h: fabKit.SIZE };
    this.scoreY = this.top + this.headerH + 12;
    this.scoreH = 72;
    this.optY = this.scoreY + this.scoreH + 16;
    this.optH = 72;
    this.historyY = this.optY + this.optH + 16;
    this.keyboardH = 12 + 3 * 48 + 2 * 8 + 10 + SAFE_BOTTOM;
    this.keyboardY = H - this.keyboardH;
    this.historyH = this.keyboardY - 16 - this.historyY;
    this.keyboardW = Math.min(W, 480);
    this.keyboardX = (W - this.keyboardW) / 2;
    // 与退格/提交行垂直居中对齐（不在键盘最底部）。
    this.fabY = this.keyboardY + 12 + 2 * (48 + 8) + (48 - fabKit.SIZE) / 2;
    this.helpFab.y = this.fabY;
    // 右下角是「静音 / 机器人 / 帮助」三枚 FAB 一行；静音隐藏（全局音效关闭）时机器人自动顶上，
    // 坐标在 drawFab / drawKeyboard 里按当前状态现算。
  }

  historyRowH() { return 40; }
  historyContentH() { return this.historyH; }
  maxScroll() { return 0; }
  scrollToBottom() { this.historyScroll = 0; }
  historyRect() {
    return { x: this.cx, y: this.historyY, w: this.cw, h: this.historyH };
  }
  onTouchStart(p) {
    const r = this.historyRect();
    if (p && p.x >= r.x && p.y >= r.y && p.x <= r.x + r.w && p.y <= r.y + r.h) {
      this.drag = { y: p.y, scroll: this.historyScroll };
    }
  }
  onTouchMove(p) {
    if (!this.drag || !p) return;
    const max = this.maxScroll();
    this.historyScroll = Math.max(0, Math.min(max, this.drag.scroll - (p.y - this.drag.y)));
  }
  onTouchEnd() { this.drag = null; }

  // ---------- confetti ----------
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
    this.drawHistory(c);
    // 键盘常驻：结算时也留着（各键画成 35% alpha 且不注册热区，看得见、点不动）
    this.drawKeyboard(c);
    if (this.result === WIN || this.result === LOSE) this.drawResult(c);
    if (!this.helpOpen && !this.confirming) this.drawFab(c);
    this.drawConfetti(c);
    if (this.helpOpen) this.drawHelp(c);
    if (this.confirming) this.drawConfirm(c);
  }

  drawHeader(c) {
    const T = theme.tokens;
    D.text(c, t('guess.gameTitle'), W / 2, this.top + this.headerH / 2, {
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
    D.text(c, t('guess.bestStreak'), this.cx + half / 2, this.scoreY + 24, { size: 12, color: T.muted, align: 'center' });
    D.text(c, this.best ? String(this.best) : '--', this.cx + half / 2, this.scoreY + 48, { size: 22, weight: 'bold', color: T.text, align: 'center' });
    D.text(c, t('guess.curStreak'), this.cx + half + half / 2, this.scoreY + 24, { size: 12, color: T.muted, align: 'center' });
    D.text(c, String(this.streak), this.cx + half + half / 2, this.scoreY + 48, { size: 22, weight: 'bold', color: T.text, align: 'center' });
  }

  drawOptions(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.optY, this.cw, this.optH, T);
    const half = this.cw / 2;
    D.divider(c, this.cx + half, this.optY + this.optH / 2, 24, T.border, 1);
    drawTimer(c, 'stopwatch', this.cx + half / 2, this.optY + this.optH / 2, fmt(this.time), {
      size: 16, color: T.text,
    });
    const label = t('guess.start');
    const bw = Math.min(118, D.measure(c, label, 13, 'bold') + 24);
    const bx = this.cx + half + (half - bw) / 2;
    const by = this.optY + (this.optH - 32) / 2;
    D.fillRoundRect(c, bx, by, bw, 32, 8, T.primary);
    D.text(c, label, bx + bw / 2, by + 16, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('new', bx, by, bw, 32, () => this.onNewGame());
  }

  drawHistory(c) {
    const T = theme.tokens;
    const r = this.historyRect();
    D.card(c, r.x, r.y, r.w, r.h, T);
    c.save();
    D.roundRect(c, r.x, r.y, r.w, r.h, 14);
    c.clip();
    // 记录区内部上方的规则提示：第一行「8 次机会…」，第二行解释 A / B 与目标 4A0B。
    // 文字超宽时按卡片内宽折行，headerH 跟着行数长，下面的记录行照旧等分剩余高度。
    const hintSize = 10;
    // 行高 12：375×667 下记录区只有 225px，两行提示多占 3px/行会让 4 行记录卡到边界
    const hintLineH = 12;
    const hintMaxW = r.w - 16;
    const hintLines = [];
    [t('guess.historyHint'), t('guess.historyHint2')].forEach((text) => {
      // 第二行较长：10px 放不下就整行降到 9px（仍然一行），再放不下才折行 ——
      // 折行会让 headerH 变大、挤压 4 行记录（375 下每行刚好 45px）。
      let size = hintSize;
      if (D.measure(c, text, size, 'bold') > hintMaxW) size = 9;
      D.wrapText(c, text, hintMaxW, size, 'bold').forEach((line) => hintLines.push({ line, size }));
    });
    const headerH = hintLines.length * hintLineH + 4;
    hintLines.forEach((item, i) => {
      D.text(c, item.line, r.x + r.w / 2, r.y + 3 + i * hintLineH + hintLineH / 2, {
        size: item.size, weight: 'bold', color: T.muted, align: 'center',
      });
    });
    const padX = 8;
    const padY = 4;
    const gapX = 8;
    const gapY = 3;
    const colW = (r.w - padX * 2 - gapX) / 2;
    const rowH = (r.h - headerH - padY * 2 - gapY * 3) / 4;
    const indexW = 18;
    const indexGap = 3;
    const digitW = 28;
    const digitGap = 2;
    const digitsW = 4 * digitW + 3 * digitGap;
    const groupW = indexW + indexGap + digitsW;
    const boxH = 28;
    const resultW = 58;
    const resultH = 16;
    const maxRows = 8;
    for (let idx = 0; idx < maxRows; idx++) {
      const row = Math.floor(idx / 2);
      const col = idx % 2;
      const cellX = r.x + padX + col * (colW + gapX);
      const cellY = r.y + headerH + padY + row * (rowH + gapY);
      const one = this.history[idx];
      if (!one && !(this.result === GAMING && idx === this.history.length)) continue;
      const x0 = cellX + (colW - groupW) / 2;
      const top = cellY + Math.max(0, (rowH - boxH - resultH - 1) / 2);
      D.text(c, `#${idx + 1}`, x0, top + boxH / 2, {
        size: 11, weight: 'bold', color: T.primary, align: 'left',
      });
      let x = x0 + indexW + indexGap;
      if (one) {
        for (let i = 0; i < GAME_SIZE; i++) {
          D.fillRoundRect(c, x, top, digitW, boxH, 6, T.keyBg);
          D.text(c, String(one.nums[i]), x + digitW / 2, top + boxH / 2, {
            size: 18, weight: 'bold', color: T.text, align: 'center',
          });
          x += digitW + digitGap;
        }
        // 结果是记录区最关键的信息：主色块 + 白字，放在数字右下角。
        const rx = x0 + indexW + indexGap + digitsW - resultW;
        D.fillRoundRect(c, rx, top + boxH + 1, resultW, resultH, 7, T.primary);
        D.text(c, one.res, rx + resultW / 2, top + boxH + 1 + resultH / 2, {
          size: 14, weight: 'bold', color: '#fff', align: 'center',
        });
      } else {
        for (let i = 0; i < GAME_SIZE; i++) {
          D.fillRoundRect(c, x, top, digitW, boxH, 6, T.enter);
          if (this.current[i]) {
            D.text(c, this.current[i], x + digitW / 2, top + boxH / 2, {
              size: 18, weight: 'bold', color: T.text, align: 'center',
            });
          }
          if (i === this.current.length) {
            c.fillStyle = 'rgba(140,140,140,0.6)';
            c.fillRect(x + digitW * 0.28, top + boxH - 5, digitW * 0.44, 2);
          }
          x += digitW + digitGap;
        }
        const rx = x0 + indexW + indexGap + digitsW - resultW;
        D.fillRoundRect(c, rx, top + boxH + 1, resultW, resultH, 7, T.keyActive);
        D.text(c, '_A_B', rx + resultW / 2, top + boxH + 1 + resultH / 2, {
          size: 14, weight: 'bold', color: T.muted, align: 'center',
        });
      }
    }
    c.restore();
  }

  drawKeyboard(c) {
    const T = theme.tokens;
    const kx = this.keyboardX;
    const kw = this.keyboardW;
    const ky = this.keyboardY;
    const kh = this.keyboardH;
    c.save();
    c.shadowColor = T.cardShadow;
    c.shadowBlur = 12;
    c.shadowOffsetY = -2;
    D.fillRoundRect(c, kx, ky, kw, kh, 14, T.card);
    c.restore();
    const pad = 12;
    const gap = 8;
    // 每行 5 个：4 个数字 + 1 个操作键（退格 / 提交）。
    // 操作键比数字键宽一点（1.35 倍），所以同一行里数字键会略小。
    const wideRatio = 1.35;
    const nw = (kw - pad * 2 - gap * 4) / (4 + wideRatio);
    const ww = nw * wideRatio;
    const bh = 48;
    const rows = [
      { nums: [1, 2, 3, 4], action: 'del' },
      { nums: [5, 6, 7, 8], action: 'enter' },
    ];
    rows.forEach((row, ri) => {
      const y = ky + pad + ri * (bh + gap);
      row.nums.forEach((n, ci) => {
        const x = kx + pad + ci * (nw + gap);
        const enabled = this.result === GAMING && !this.current.includes(String(n))
          && this.current.length < GAME_SIZE;
        D.fillRoundRect(c, x, y, nw, bh, 8, T.keyBg);
        c.globalAlpha = enabled ? 1 : 0.35;
        D.text(c, String(n), x + nw / 2, y + bh / 2, { size: 18, weight: 'bold', color: T.text, align: 'center' });
        c.globalAlpha = 1;
        if (enabled) this.addButton('num-' + n, x, y, nw, bh, () => this.addNumber(n));
      });
      // 第 5 个：退格 / 提交
      const ax = kx + pad + 4 * (nw + gap);
      if (row.action === 'del') {
        const canDel = this.result === GAMING && this.current.length > 0;
        D.fillRoundRect(c, ax, y, ww, bh, 8, T.delBg);
        c.globalAlpha = canDel ? 1 : 0.35;
        const delText = t('guess.optDel').replace(/^⌫\s*/, '');
        const delLabelW = D.measure(c, delText, 13, 'bold');
        const delGroupW = 17 + 5 + delLabelW;
        const delGX = ax + (ww - delGroupW) / 2;
        const delCX = delGX + 8.5;
        if (!icons.draw(c, 'backspace', delCX, y + bh / 2, 17, T.delColor)) {
          D.text(c, '⌫', delCX, y + bh / 2, { size: 16, color: T.delColor, align: 'center' });
        }
        D.text(c, delText, delGX + 17 + 5 + delLabelW / 2, y + bh / 2,
          { size: 13, weight: 'bold', color: T.delColor, align: 'center' });
        c.globalAlpha = 1;
        if (canDel) this.addButton('del', ax, y, ww, bh, () => this.delNumber());
      } else {
        const canEnter = this.result === GAMING && this.current.length === GAME_SIZE;
        D.fillRoundRect(c, ax, y, ww, bh, 8, T.enter);
        c.globalAlpha = canEnter ? 1 : 0.35;
        D.text(c, t('guess.optEnter'), ax + ww / 2, y + bh / 2,
          { size: 13, weight: 'bold', color: T.enterColor, align: 'center' });
        c.globalAlpha = 1;
        if (canEnter) this.addButton('enter', ax, y, ww, bh, () => this.guessOnce());
      }
    });
  }

  drawResult(c) {
    if (!this.resultVisible()) return;
    const T = theme.tokens;
    // 只盖记录区那张卡：下方输入区保持可见（键盘自己画成禁用态），右下 FAB 也还能点
    const card = this.historyRect();
    share.resultPanel(c, this, card.y, card.h);
    const cx = W / 2;
    const cy = card.y + card.h / 2;
    if (this.result === WIN) {
      D.text(c, `🎉🎉 ${t('guess.tipWin')} 🎉🎉`, cx, cy - 30, { size: 18, weight: 'bold', color: T.win, align: 'center' });
      D.text(c, `${t('guess.curStreak')} ${this.streak}`, cx, cy + 2, { size: 14, color: T.win, align: 'center' });
      const label = t('guess.nextRound');
      const bw = Math.min(160, D.measure(c, label, 13, 'bold') + 24);
      const bx = cx - bw / 2;
      // 按钮锚在记录卡底部：320 宽下记录区只有 126px 高，写死 cy + 32 会溢出边缘
      const by = Math.min(cy + 32, card.y + card.h - 12 - 32);
      D.fillRoundRect(c, bx, by, bw, 32, 8, T.primary);
      D.text(c, label, cx, by + 16, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
      this.addButton('next', bx, by, bw, 32, () => this.nextRound());
    } else {
      D.text(c, `👻👻 ${t('guess.tipLost')} 👻👻`, cx, cy - 22, { size: 18, weight: 'bold', color: T.lose, align: 'center' });
      D.text(c, `${t('guess.anwserIs')}${this.answer}`, cx, cy + 12, { size: 16, color: T.lose, align: 'center' });
    }
  }

  drawFab(c) {
    const T = theme.tokens;
    const muteRect = fabKit.muteSlot(this.helpFab);
    const robotRect = fabKit.slotLeft(this.helpFab, muteRect ? 2 : 1);
    const drawOne = (rect, iconKey, fallback, color, onTap, id) => {
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.12)';
      c.shadowBlur = 10;
      c.shadowOffsetY = 2;
      D.circle(c, rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, T.card);
      fabKit.stroke(c, rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, fabKit.borderOf(id === 'help' ? 'help' : 'mode'));
      c.restore();
      if (!icons.draw(c, iconKey, rect.x + rect.w / 2, rect.y + rect.h / 2, 21, color)) {
        D.text(c, fallback, rect.x + rect.w / 2, rect.y + rect.h / 2, { size: 19, color, align: 'center' });
      }
      this.addButton(id, rect.x, rect.y, rect.w, rect.h, onTap);
    };
    drawOne(robotRect, this.robot ? 'robot' : 'robot-off', '🤖', this.robot ? T.primary : T.muted, () => this.toggleRobot(), 'robot');
    drawOne(this.helpFab, 'help', '?', T.text, () => { this.helpOpen = true; }, 'help');
    if (muteRect) fabKit.drawMute(this, c, muteRect);
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
    ['helpMsg', 'help1', 'help2', 'help3'].forEach((k) => {
      const value = t('guess.' + k);
      if (value !== 'guess.' + k) {
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
    this.addButton('help-close', 0, 0, W, H, () => { this.helpOpen = false; });
    const bw = 110;
    const bx = x + (w - bw) / 2;
    const by = y + h - 44;
    D.fillRoundRect(c, bx, by, bw, 30, 8, T.primary);
    D.text(c, t('guess.confirmText'), bx + bw / 2, by + 15, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
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
    D.text(c, t('guess.confirmTitle'), x + 20, y + 34, { size: 17, weight: 'bold', color: T.text });
    const lines = D.wrapText(c, t('guess.confirmMsg').replace('{n}', this.streak), w - 40, 14);
    lines.forEach((line, i) => D.text(c, line, x + 20, y + 64 + i * 21, { size: 14, color: T.muted }));
    const gap = 12;
    const bw = (w - 40 - gap) / 2;
    const by = y + h - 48;
    this.addButton('confirm-mask', 0, 0, W, H, () => { this.confirming = false; });
    D.fillRoundRect(c, x + 20, by, bw, 32, 8, T.enter);
    D.text(c, t('guess.cancel'), x + 20 + bw / 2, by + 16, { size: 13, weight: 'bold', color: T.text, align: 'center' });
    this.addButton('confirm-cancel', x + 20, by, bw, 32, () => { this.confirming = false; });
    D.fillRoundRect(c, x + 20 + bw + gap, by, bw, 32, 8, T.primary);
    D.text(c, t('guess.confirmOk'), x + 20 + bw + gap + bw / 2, by + 16, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('confirm-ok', x + 20 + bw + gap, by, bw, 32, () => this.startNewGame());
  }

  onTheme() { this.layout(); }
  onHide() {}
  onShow() {}
}

module.exports = GuessScene;
