const { W, H, SAFE_BOTTOM } = require('../../core/canvas');
const { Scene } = require('../../core/app');
const theme = require('../../core/theme');
const { t } = require('../../core/i18n');
const { getRaw, setRaw, removeRaw } = require('../../core/storage');
const D = require('../../core/draw');
const ParticleField = require('../../core/particles');
const icons = require('../../core/icons');
const fabKit = require('../../core/fab');
const HEADER = require('../../core/header');
const i18nDict = require('./i18n');

const coreI18n = require('../../core/i18n');
if (!coreI18n.__snakeRegistered) {
  coreI18n.register('snake', i18nDict);
  coreI18n.__snakeRegistered = true;
}

const DIFFICULTY_KEY = '__snake_game__difficulty';
const BEST_KEY = '__snake_game__best';
const STATE_KEY = '__snake_game__state';
const WALL_KEY = '__snake_game__through_wall';
const GRID = 20;
const SPEEDS = [400, 320, 250, 190, 140];
const SCORE_PER_FOOD = [1, 2, 3, 4, 6];
const GAMING = 0;
const LOSE = 1;
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 5;

class SnakeScene extends Scene {
  constructor(app) {
    super(app);
    this.bg = new ParticleField();
    this.difficulty = this.loadDifficulty();
    this.best = +(getRaw(BEST_KEY, 0) || 0);
    this.throughWall = getRaw(WALL_KEY, '1') !== '0';
    this.snake = [];
    this.dir = [0, 1];
    this.nextDir = [0, 1];
    this.food = null;
    this.score = 0;
    this.newBest = false;
    this.phase = GAMING;
    this.started = false;
    this.paused = false;
    this.resumeCount = 0;
    this.resumeAt = 0;
    this.acc = 0;
    this.helpOpen = false;
    this.confirming = false;
    this.layout();
    this.boot();
  }
  loadDifficulty() {
    const v = +(getRaw(DIFFICULTY_KEY, 1) || 1);
    return Math.max(MIN_DIFFICULTY, Math.min(MAX_DIFFICULTY, v || 1));
  }
  get interval() { return SPEEDS[this.difficulty - 1]; }
  boot() {
    if (!this.restore()) this.startGame();
  }
  startGame() {
    this.snake = [[10, 10], [10, 9], [10, 8]];
    this.dir = [0, 1];
    this.nextDir = [0, 1];
    this.score = 0;
    this.newBest = false;
    this.phase = GAMING;
    this.started = true;
    this.paused = false;
    this.resumeCount = 0;
    this.resumeAt = 0;
    this.acc = 0;
    this.spawnFood();
    removeRaw(STATE_KEY);
    this.save();
  }
  spawnFood() {
    const used = new Set(this.snake.map(([r, c]) => `${r},${c}`));
    const cells = [];
    for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) if (!used.has(`${r},${c}`)) cells.push([r, c]);
    this.food = cells.length ? cells[Math.floor(Math.random() * cells.length)] : null;
  }
  save() {
    if (!this.started || !this.food) return;
    setRaw(STATE_KEY, JSON.stringify({
      snake: this.snake, dir: this.dir, nextDir: this.nextDir, food: this.food,
      score: this.score, difficulty: this.difficulty,
      result: this.phase === LOSE ? 'lose' : 'gaming', newBest: this.newBest,
    }));
  }
  restore() {
    try {
      const raw = getRaw(STATE_KEY, '');
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.snake) || !s.snake.length || !Array.isArray(s.food)) return false;
      const d = +s.difficulty;
      if (d < MIN_DIFFICULTY || d > MAX_DIFFICULTY) return false;
      this.difficulty = d;
      this.snake = s.snake;
      this.dir = s.dir || [0, 1];
      this.nextDir = s.nextDir || this.dir;
      this.food = s.food;
      this.score = +s.score || 0;
      this.newBest = !!s.newBest;
      this.started = true;
      this.phase = s.result === 'lose' ? LOSE : GAMING;
      this.paused = this.phase === GAMING;
      return true;
    } catch (e) { return false; }
  }
  update(dt) {
    if (this.bg) this.bg.update(dt || 16);
    if (this.paused && this.resumeCount > 0 && Date.now() >= this.resumeAt) {
      this.resumeCount -= 1;
      this.resumeAt = Date.now() + 800;
      if (this.resumeCount <= 0) {
        this.paused = false;
        this.acc = 0;
      }
    }
    if (!this.started || this.phase !== GAMING || this.paused || this.helpOpen) return;
    this.acc += Math.min(50, dt || 16);
    while (this.acc >= this.interval) {
      this.acc -= this.interval;
      this.tick();
      if (this.phase !== GAMING) break;
    }
  }
  tick() {
    this.dir = this.nextDir;
    const head = [this.snake[0][0] + this.dir[0], this.snake[0][1] + this.dir[1]];
    if (this.throughWall) {
      head[0] = (head[0] + GRID) % GRID;
      head[1] = (head[1] + GRID) % GRID;
    }
    if (head[0] < 0 || head[0] >= GRID || head[1] < 0 || head[1] >= GRID
      || this.snake.some(([r, c]) => r === head[0] && c === head[1])) {
      this.phase = LOSE;
      this.app.audio.playLose();
      this.save();
      return;
    }
    this.snake.unshift(head);
    if (this.food && head[0] === this.food[0] && head[1] === this.food[1]) {
      this.score += SCORE_PER_FOOD[this.difficulty - 1];
      this.app.audio.playElimination();
      if (this.score > this.best) {
        this.best = this.score;
        this.newBest = true;
        setRaw(BEST_KEY, String(this.best));
      }
      this.spawnFood();
    } else {
      this.snake.pop();
    }
    this.save();
  }
  turn(d) {
    if (d[0] === -this.dir[0] && d[1] === -this.dir[1]) return;
    this.nextDir = d;
  }
  changeDifficulty(delta) {
    const next = this.difficulty + delta;
    if (next < MIN_DIFFICULTY || next > MAX_DIFFICULTY) return;
    this.difficulty = next;
    setRaw(DIFFICULTY_KEY, String(next));
    this.acc = 0;
  }
  togglePause() {
    if (!this.started || this.phase === LOSE) return;
    if (!this.paused) {
      this.paused = true;
      this.resumeCount = 0;
    } else if (!this.resumeCount) {
      this.resumeCount = 3;
      this.resumeAt = Date.now() + 800;
    }
    this.acc = 0;
    this.save();
  }
  toggleWall() {
    this.throughWall = !this.throughWall;
    setRaw(WALL_KEY, this.throughWall ? '1' : '0');
  }
  onTouchStart(p) { this.touch = p; }
  onTouchEnd(p) {
    if (!this.touch) return;
    const dx = p.x - this.touch.x;
    const dy = p.y - this.touch.y;
    this.touch = null;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
    if (Math.abs(dx) > Math.abs(dy)) this.turn([0, dx > 0 ? 1 : -1]);
    else this.turn([dy > 0 ? 1 : -1, 0]);
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
    const reserve = SAFE_BOTTOM + 92;
    const availH = Math.max(160, H - this.boardY - reserve);
    this.boardSize = Math.min(this.cw, availH);
    this.boardX = (W - this.boardSize) / 2;
    this.cell = this.boardSize / GRID;
    this.helpFab = { x: W - 16 - 40, y: H - SAFE_BOTTOM - 16 - 40, w: 40, h: 40 };
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
    this.drawPlayHint(c);
    if (!this.helpOpen && !this.confirming) this.drawFabs(c);
    if (this.helpOpen) this.drawHelp(c);
    if (this.confirming) this.drawConfirm(c);
  }
  // 游戏区下方的一句玩法提示（统一样式见 core/draw.js 的 hintLine）
  drawPlayHint(c) {
    D.hintLine(c, t('snake.playHint'), this.boardY + this.boardSize + 16, theme.tokens.muted);
  }

  drawHeader(c) {
    const T = theme.tokens;
    D.text(c, t('snake.gameTitle'), W / 2, this.top + this.headerH / 2, { size: 15, weight: 'bold', color: T.text, align: 'center' });
    if (!icons.draw(c, 'home', this.homeRect.x + 20, this.homeRect.y + 20, 24, T.text)) D.text(c, '⌂', this.homeRect.x + 20, this.homeRect.y + 20, { size: 24, color: T.text, align: 'center' });
    this.addButton('home', this.homeRect.x, this.homeRect.y, this.homeRect.w, this.homeRect.h, () => this.app.goHome());
  }
  drawScore(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.scoreY, this.cw, this.scoreH, T);
    const half = this.cw / 2;
    D.divider(c, this.cx + half, this.scoreY + this.scoreH / 2, 24, T.border, 1);
    D.text(c, t('snake.bestScore'), this.cx + half / 2, this.scoreY + 24, { size: 12, color: T.muted, align: 'center' });
    D.text(c, String(this.best), this.cx + half / 2, this.scoreY + 48, { size: 22, weight: 'bold', color: T.text, align: 'center' });
    D.text(c, t('snake.score'), this.cx + half + half / 2, this.scoreY + 24, { size: 12, color: T.muted, align: 'center' });
    D.text(c, String(this.score), this.cx + half + half / 2, this.scoreY + 48, { size: 22, weight: 'bold', color: T.primary, align: 'center' });
  }
  drawOptions(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.optY, this.cw, this.optH, T);
    // 与关灯游戏保持同一套难度步进器：28×28 描边小按钮，点击热区外扩 8。
    const x1 = this.cx + this.cw * 3 / 10;
    const x2 = this.cx + this.cw * (3 / 10 + 3.5 / 10);
    D.divider(c, x1, this.optY + this.optH / 2, 24, T.border, 1);
    D.divider(c, x2, this.optY + this.optH / 2, 24, T.border, 1);
    const mid = this.optY + this.optH / 2;
    const minus = { x: this.cx + 16, y: mid - 14, w: 28, h: 28 };
    const plus = { x: x1 - 44, y: mid - 14, w: 28, h: 28 };
    this.drawMiniButton(c, minus, '-', this.difficulty > 1, () => this.changeDifficulty(-1));
    this.drawMiniButton(c, plus, '+', this.difficulty < 5, () => this.changeDifficulty(1));
    D.text(c, String(this.difficulty), (minus.x + 28 + plus.x) / 2, mid, { size: 18, weight: 'bold', color: T.text, align: 'center' });
    const label = t('snake.start');
    const bw = Math.min(100, D.measure(c, label, 12, 'bold') + 18);
    const bx = (x1 + x2) / 2 - bw / 2;
    D.fillRoundRect(c, bx, mid - 16, bw, 32, 8, T.primary);
    D.text(c, label, bx + bw / 2, mid, { size: 12, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('new', bx, mid - 16, bw, 32, () => { this.startGame(); });
    const pauseLabel = this.paused ? t('snake.resume') : t('snake.pause');
    const pw = Math.min(Math.round(this.cw / 3) - 16, Math.max(80, D.measure(c, pauseLabel, 13, 'bold') + 22));
    const px = (x2 + this.cx + this.cw) / 2 - pw / 2;
    // 与 Emoji 下坠的暂停 / 继续按钮统一：主色实心 + 白字。
    D.fillRoundRect(c, px, mid - 16, pw, 32, 8, this.phase === LOSE ? T.disabled : T.god);
    D.text(c, pauseLabel, px + pw / 2, mid, { size: 12, weight: 'bold', color: this.phase === LOSE ? '#f3f3f3' : '#fff', align: 'center' });
    if (this.phase !== LOSE) this.addButton('pause', px, mid - 16, pw, 32, () => this.togglePause());
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
  drawBoard(c) {
    const T = theme.tokens;
    const x0 = this.boardX;
    const y0 = this.boardY;
    D.fillRoundRect(c, x0, y0, this.boardSize, this.boardSize, 14, '#e2e7eb');
    c.save();
    D.roundRect(c, x0, y0, this.boardSize, this.boardSize, 14);
    c.clip();
    for (let r = 0; r < GRID; r++) for (let col = 0; col < GRID; col++) {
      c.fillStyle = (r + col) % 2 === 0 ? '#e8ecef' : '#e2e7eb';
      c.fillRect(x0 + col * this.cell, y0 + r * this.cell, this.cell + 0.5, this.cell + 0.5);
    }
    this.snake.forEach(([r, col], i) => {
      const x = x0 + col * this.cell + 1;
      const y = y0 + r * this.cell + 1;
      const s = this.cell - 2;
      D.fillRoundRect(c, x, y, s, s, i === 0 ? 7 : 5, i === 0 ? T.primary : '#3b9463');
      if (i === 0) {
        c.fillStyle = '#fff';
        D.circle(c, x + s * 0.34, y + s * 0.38, Math.max(1.2, s * 0.1));
        D.circle(c, x + s * 0.66, y + s * 0.38, Math.max(1.2, s * 0.1));
      }
    });
    if (this.food) {
      const fx = x0 + (this.food[1] + 0.5) * this.cell;
      const fy = y0 + (this.food[0] + 0.5) * this.cell;
      D.circle(c, fx, fy, this.cell * 0.36, '#e05a47');
      D.circle(c, fx - this.cell * 0.1, fy - this.cell * 0.1, this.cell * 0.1, '#ffb3a6');
    }
    c.restore();
    // 关闭穿墙时，用明显的红色边框提示「边界不可穿过」；开启后边框消失。
    if (!this.throughWall) {
      D.strokeRoundRect(c, x0 + 1.5, y0 + 1.5, this.boardSize - 3, this.boardSize - 3, 13, T.delColor, 3);
    }
    if (this.paused && this.phase === GAMING) {
      D.fillRoundRect(c, x0, y0, this.boardSize, this.boardSize, 14, T.overlay);
      if (this.resumeCount) {
        D.text(c, String(this.resumeCount), W / 2, y0 + this.boardSize / 2 - 12, { size: 56, weight: 'bold', color: T.primary, align: 'center' });
        D.text(c, t('snake.readyTip'), W / 2, y0 + this.boardSize / 2 + 34, { size: 14, weight: 'bold', color: T.text, align: 'center' });
      } else {
        D.text(c, '⏸', W / 2, y0 + this.boardSize / 2 - 22, { size: 34, align: 'center' });
        D.text(c, t('snake.resumeTip'), W / 2, y0 + this.boardSize / 2 + 24, { size: 14, weight: 'bold', color: T.text, align: 'center' });
      }
      this.addButton('resume-board', x0, y0, this.boardSize, this.boardSize, () => this.togglePause());
    }
    if (this.phase === LOSE && this.resultVisible()) {
      D.fillRoundRect(c, x0, y0, this.boardSize, this.boardSize, 14, T.overlay);
      const cy = y0 + this.boardSize / 2;
      D.text(c, `👻👻 ${t('snake.tipLost')} 👻👻`, W / 2, cy - 28, { size: 18, weight: 'bold', color: T.lose, align: 'center' });
      if (this.newBest) D.text(c, t('snake.newBest'), W / 2, cy + 2, { size: 13, color: T.muted, align: 'center' });
      const bw = 104;
      D.fillRoundRect(c, W / 2 - bw / 2, cy + 24, bw, 32, 8, T.primary);
      D.text(c, t('snake.start'), W / 2, cy + 40, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
      this.addButton('lose-retry', W / 2 - bw / 2, cy + 24, bw, 32, () => this.startGame());
    }
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
    // 静音 FAB 隐藏（全局音效关闭）时，穿墙按钮顶上它那一格，中间不留空
    const muteRect = fabKit.muteSlot(this.helpFab);
    if (muteRect) fabKit.drawMute(this, c, muteRect);
    drawOne(fabKit.slotLeft(this.helpFab, muteRect ? 2 : 1), 'wall', '穿', this.throughWall ? T.primary : T.muted, () => this.toggleWall(), 'wall');
  }
  drawHelp(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(0, 0, W, H);
    const x = 20, w = W - 40;
    const lines = [];
    ['helpMsg', 'help1', 'help2', 'help3', 'help4'].forEach((k) => {
      const v = t('snake.' + k);
      if (v !== 'snake.' + k) { lines.push(...D.wrapText(c, v, w - 40, 14)); lines.push(''); }
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
    D.text(c, t('snake.confirmText'), bx + bw / 2, by + 15, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('help-ok', bx, by, bw, 30, () => { this.helpOpen = false; });
  }
  drawConfirm(c) { /* snake 新游戏直接开始，无需确认 */ }
  onTheme() { this.layout(); }
  onHide() { if (this.started && this.phase === GAMING) { this.paused = true; this.save(); } }
  onShow() {}
}
module.exports = SnakeScene;
