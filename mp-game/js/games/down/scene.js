const { W, H, SAFE_BOTTOM } = require('../../core/canvas');
const { Scene } = require('../../core/app');
const theme = require('../../core/theme');
const { t } = require('../../core/i18n');
const { getRaw, setRaw, removeRaw } = require('../../core/storage');
const D = require('../../core/draw');
const ParticleField = require('../../core/particles');
const icons = require('../../core/icons');
const achv = require('../../core/achv');
const daily = require('../../core/daily');
const fabKit = require('../../core/fab');
const confetti = require('../../core/confetti');
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
// 每 50 分：游戏区上方放烟花 + 一条夸张鼓励（随机、不与上一条重复）
const CHEER_KEYS = ['cheer1', 'cheer2', 'cheer3', 'cheer4', 'cheer5', 'cheer6', 'cheer7', 'cheer8'];
const CHEER_LIFE = 1500;      // 整条提示的存在时间
const CHEER_DROP_MS = 460;    // 从屏幕顶部砸下来（越过落点 → 压扁 → 回弹）
const CHEER_EXIT_MS = 360;    // 最后这段放大 + 淡出
const MILESTONE = 50;         // 分数每逢 50 的倍数就庆祝一次

// 鼓励条「砸下来」的位移曲线：像有重量的东西 —— 先慢慢出动，后段重力加速，
// 越过落点 4.5%（咚一下压进牌面一点），再弹回来 0.985 抖一下才停。
function dropProgress(t) {
  const k = Math.max(0, Math.min(1, t));
  const IMPACT = 0.66;
  if (k < IMPACT) {
    const u = k / IMPACT;
    return 1.045 * u * u;                    // 重力加速（ease-in）
  }
  if (k < 0.8) return 1.045 + (0.985 - 1.045) * ((k - IMPACT) / (0.8 - IMPACT));
  if (k < 0.92) return 0.985 + (1.008 - 0.985) * ((k - 0.8) / (0.92 - 0.8));
  return 1.008 + (1 - 1.008) * ((k - 0.92) / (1 - 0.92));
}

// 砸下来的挤压 / 拉伸：下落时纵向拉长，触底瞬间压扁，然后阻尼回正
function dropSquash(age) {
  const IMPACT_MS = CHEER_DROP_MS * 0.66;
  if (age < IMPACT_MS) {
    const u = Math.max(0, Math.min(1, age / IMPACT_MS));
    return { x: 1 - 0.05 * u, y: 1 + 0.1 * u };
  }
  const d = (age - IMPACT_MS) / 300;
  const damp = Math.exp(-3.2 * d) * Math.cos(d * Math.PI * 2.6);
  return { x: 1 + 0.12 * damp, y: 1 - 0.17 * damp };
}

function fmt(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

class DownScene extends Scene {
  constructor(app) {
    super(app);
    this.bg = new ParticleField();
    this.stack = [];
    this.cheer = null;        // { text, at }：里程碑的鼓励话
    this.cheerIdx = -1;       // 上一条是第几句，避免连着重复
    this.bursts = [];         // 游戏区上方的小烟花
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
    this.queuedCol = null;
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
    // 每日挑战：这是一局新的游戏（分数类任务从这一局开始才计数）
    daily.markNewRun('down');
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
    this.queuedCol = null;
    this.col = 3;
    this.cheer = null;
    this.bursts = [];
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
      this.queuedCol = null;
      this.paused = this.phase === PLAY;
      this.layout();
      return true;
    } catch (e) { return false; }
  }
  update(dt) {
    if (this.bg) this.bg.update(dt || 16);
    // 庆祝动画不受暂停 / 结算影响，先推进
    if (this.bursts.length) this.bursts = confetti.update(this.bursts, dt || 16, H);
    if (this.cheer && Date.now() - this.cheer.at > CHEER_LIFE) this.cheer = null;
    if (this.phase !== PLAY || this.helpOpen) return;
    if (this.paused) {
      if (this.resumeCount && Date.now() >= this.resumeAt) {
        this.resumeCount--;
        this.resumeAt = Date.now() + 800;
        if (this.resumeCount <= 0) this.paused = false;
      }
      return;
    }
    const now = Date.now();
    if (this.moveAnim && now >= this.moveAnim.at) {
      this.col = this.moveAnim.to;
      this.moveAnim = null;
      this.resolveLanding();
      // 滑动落定、判定完立刻处理排队的新目标列。
      this.startQueuedMove();
    }
    if (this.clearAnim && now >= this.clearAnim.at) this.finishClearRow();
    if (this.fallAnim && now >= this.fallAnim.at + 180) {
      this.fallAnim = null;
      if (this.top - 1 <= 0) this.lose();
      else this.resolveLanding();
      this.startQueuedMove();
    }
    if (this.phase !== PLAY) return;
    // 上升不受移动 / 消除 / 下落动画影响：只有暂停或失败才停。
    const d = Math.min(0.05, (dt || 16) / 1000);
    this.elapsed += d;
    this.top -= logic.speedFor(this.cleared) * d;
    this.fillPile();
    if (this.top - 1 <= 0) { this.lose(); return; }
    if (Date.now() - this.lastSaveAt > 500) { this.lastSaveAt = Date.now(); this.save(); }
  }

  lose() {
    if (this.phase !== PLAY) return;
    this.phase = OVER;
    // 一局结束：本局得分上报给成就系统（50/100/1000 各计一次）
    achv.reach('down', this.score, [50, 100, 1000]);
    this.queuedCol = null;
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
    if (this.phase !== PLAY || this.paused || this.helpOpen) return;
    const target = Math.max(0, Math.min(logic.COLS - 1, idx));
    if (this.moveAnim || this.clearAnim || this.fallAnim) {
      this.queuedCol = target;
      return;
    }
    if (target === this.col) {
      this.resolveLanding();
      return;
    }
    this.moveAnim = { from: this.col, to: target, start: Date.now(), at: Date.now() + 150 };
  }

  startQueuedMove() {
    if (this.phase !== PLAY || this.paused || this.helpOpen || this.moveAnim) return;
    if (this.queuedCol == null) return;
    const target = this.queuedCol;
    this.queuedCol = null;
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
    // 这一次消完正好到 50 的倍数：不播普通消除音，留给 celebrateScore() 播烟花（多消/连击）音，
    // 和盖下来的鼓励条、烟花同时响
    if ((this.score + 1) % MILESTONE !== 0) this.app.audio.playElimination();
  }
  finishClearRow() {
    this.clearAnim = null;
    this.stack.shift();
    this.top = Math.min(logic.ROWS - 1, this.top + 1);
    // 消掉的是顶排，下面的行位置不变；只让玩家牌平滑下落，不整排下移。
    this.fillPile();
    this.score++;
    // 每日挑战：消一排就上报分数（不用等一局结束）
    daily.report('down', 'reach', { value: this.score });
    // 每逢 50 的倍数：游戏区上方放烟花 + 一条夸张鼓励
    if (this.score % MILESTONE === 0) this.celebrateScore();
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
  // 分数到 50 的倍数：随机挑一条夸张的鼓励（不与上一条相同）+ 游戏区上方三朵小烟花
  celebrateScore() {
    let i = Math.floor(Math.random() * CHEER_KEYS.length);
    if (CHEER_KEYS.length > 1 && i === this.cheerIdx) i = (i + 1) % CHEER_KEYS.length;
    this.cheerIdx = i;
    this.cheer = { text: t('down.' + CHEER_KEYS[i]), at: Date.now() };
    this.spawnCheerBursts();
    try {
      this.app.audio.playFirework();
    } catch (e) {
      // 音效失败不影响庆祝
    }
  }

  // 小烟花只落在游戏区上方（不遮牌面、不注册按钮，纯装饰）
  spawnCheerBursts() {
    const baseY = this.boardY - 44;    // 就在鼓励条上方炸开
    [[W * 0.22, baseY + 6], [W * 0.5, baseY - 18], [W * 0.78, baseY + 4]].forEach(([cx, cy]) => {
      for (let i = 0; i < 26; i += 1) {
        const angle = (Math.PI * 2 * i) / 26 + Math.random() * 0.3;
        const speed = 1.4 + Math.random() * 3.6;
        this.bursts.push({
          x: cx + (Math.random() - 0.5) * 18,
          y: cy + (Math.random() - 0.5) * 12,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.4,
          gravity: 0.12 + Math.random() * 0.08,
          rot: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 0.32,
          w: 2.5 + Math.random() * 5,
          h: 2 + Math.random() * 4,
          color: confetti.COLORS[i % confetti.COLORS.length],
          shape: ['rect', 'circle', 'ribbon', 'triangle'][i % 4],
          age: 0,
          life: 900 + Math.random() * 520,
        });
      }
    });
  }

  // 游戏区上方那条夸张鼓励：弹出 1.34 → 1、最后淡出；不拦操作
  drawCheer(c) {
    if (!this.cheer) return;
    const T = theme.tokens;
    const dark = theme.dark;
    const age = Date.now() - this.cheer.at;
    if (age > CHEER_LIFE) { this.cheer = null; return; }
    const fadeIn = Math.min(1, age / 100);
    // 最后一段：一边放大一边淡出（像被"吹"散掉）
    const outT = age > CHEER_LIFE - CHEER_EXIT_MS
      ? Math.max(0, Math.min(1, (age - (CHEER_LIFE - CHEER_EXIT_MS)) / CHEER_EXIT_MS))
      : 0;
    const alpha = fadeIn * (1 - outT) * (1 - outT);   // 先慢后快地消失
    const label = this.cheer.text;
    const maxTextW = W - 72;
    let size = 17;
    while (size > 10 && D.measure(c, label, size, 'bold') > maxTextW) size -= 1;
    const textW = D.measure(c, label, size, 'bold');
    const bw = Math.min(W - 40, textW + 30);
    const bh = Math.round(size + 17);
    // 从屏幕顶部（header 之上）掉下来，落点是「底边正好贴着游戏区顶部」
    const yStart = this.topY - bh;
    const yTarget = this.boardY - bh / 2;
    const k = age >= CHEER_DROP_MS ? 1 : dropProgress(age / CHEER_DROP_MS);
    const y = yStart + (yTarget - yStart) * k;
    const squash = dropSquash(age);
    const grow = 1 + 0.45 * outT * outT;           // 消失时往上顶大一圈
    const sx = squash.x * grow;
    const sy = squash.y * grow;
    this.cheerRect = { x: (W - bw) / 2, y: y - bh / 2, w: bw, h: bh };
    // 只有浅色半透明底，不描边：底下的画面透得出来，不会糊成一块实心色
    const fill = dark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.8)';
    const fg = dark ? '#ffffff' : T.primary;
    c.save();
    c.globalAlpha = alpha;
    c.translate(W / 2, y);
    c.scale(sx, sy);
    c.shadowColor = dark ? 'rgba(0,0,0,0.42)' : 'rgba(0,0,0,0.18)';
    c.shadowBlur = 14;
    c.shadowOffsetY = 4;
    D.fillRoundRect(c, -bw / 2, -bh / 2, bw, bh, bh / 2, fill);
    c.restore();
    c.save();
    c.globalAlpha = alpha;
    c.translate(W / 2, y);
    c.scale(sx, sy);
    D.text(c, label, 0, 0, { size, weight: 'bold', color: fg, align: 'center' });
    c.restore();
  }

  layout() {
    this.cw = Math.min(W - 32, 440);
    this.cx = (W - this.cw) / 2;
    this.topY = HEADER.TOP;
    this.headerH = HEADER.HEIGHT;
    this.homeRect = { ...HEADER.HOME_RECT };
    this.scoreY = this.topY + this.headerH + 12;
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
    if (this.bursts.length) confetti.draw(c, this.bursts);
    this.drawCheer(c);
    this.drawPlayHint(c);
    if (!this.helpOpen) this.drawFab(c);
    if (this.helpOpen) this.drawHelp(c);
  }
  // 游戏区下方的一句玩法提示（统一样式见 core/draw.js 的 hintLine）
  drawPlayHint(c) {
    D.hintLine(c, t('down.playHint'), this.boardY + this.boardH + 16, theme.tokens.muted);
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
    const third = this.cw / 3;
    D.divider(c, this.cx + third, this.optY + this.optH / 2, 24, T.border, 1);
    D.divider(c, this.cx + third * 2, this.optY + this.optH / 2, 24, T.border, 1);
    drawTimer(c, 'stopwatch', this.cx + third / 2, this.optY + this.optH / 2, fmt(this.elapsed), { size: 15, color: T.text });

    const by = this.optY + (this.optH - 32) / 2;
    const startLabel = t('down.start');
    const startW = Math.min(third - 16, Math.max(80, D.measure(c, startLabel, 13, 'bold') + 22));
    const startX = this.cx + third + (third - startW) / 2;
    D.fillRoundRect(c, startX, by, startW, 32, 8, T.primary);
    D.text(c, startLabel, startX + startW / 2, by + 16, {
      size: 13, weight: 'bold', color: '#ffffff', align: 'center',
    });
    this.addButton('new', startX, by, startW, 32, () => this.startGame());

    const label = this.paused ? t('down.resume') : t('down.pause');
    const pw = Math.min(Math.round(this.cw / 3) - 16, Math.max(80, D.measure(c, label, 13, 'bold') + 22));
    const px = this.cx + third * 2 + (third - pw) / 2;
    const canPause = this.phase === PLAY;
    D.fillRoundRect(c, px, by, pw, 32, 8, canPause ? T.god : T.disabled);
    D.text(c, label, px + pw / 2, by + 16, {
      size: 13, weight: 'bold', color: '#ffffff', align: 'center',
    });
    if (canPause) this.addButton('pause', px, by, pw, 32, () => this.togglePause());
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
      D.fillRoundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 14, T.overlay);
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
      D.fillRoundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 14, T.overlay);
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
    fabKit.drawMute(this, c, fabKit.leftSlot(r));
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
