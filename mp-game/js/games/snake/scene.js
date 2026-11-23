const { W, H, SAFE_BOTTOM } = require('../../core/canvas');
const share = require('../../core/share');
const { Scene } = require('../../core/app');
const theme = require('../../core/theme');
const { t } = require('../../core/i18n');
const { getRaw, setRaw, removeRaw } = require('../../core/storage');
const D = require('../../core/draw');
const actionLabel = require('../../core/action-label');
const resultButton = require('../../core/result-button');
const ParticleField = require('../../core/particles');
const icons = require('../../core/icons');
const achv = require('../../core/achv');
const daily = require('../../core/daily');
const fabKit = require('../../core/fab');
const HEADER = require('../../core/header');
const i18nDict = require('./i18n');

const coreI18n = require('../../core/i18n');
if (!coreI18n.__snakeRegistered) {
  coreI18n.register('snake', i18nDict);
  coreI18n.__snakeRegistered = true;
}

const BEST_KEY = '__snake_game__best';
const STATE_KEY = '__snake_game__state';
const WALL_KEY = '__snake_game__through_wall';
const GRID = 20;
const BASE_INTERVAL = 300;       // 起始步进
const MIN_INTERVAL = 90;         // 最快步进
const SPEED_PER_SCORE = 1.6;     // 每 1 分缩短多少毫秒
const COMBO_MS = 4000;          // 连吃窗口
const COMBO_MAX = 5;            // 连击最高倍率
// 按住棋盘不动：延迟后沿当前方向线性加速；松开立刻恢复（不是滑动换向）
const BOOST_DELAY_MS = 140;     // 按住多久才开始提速
const BOOST_RAMP_MS = 850;      // 线性加到最高速所需时间
const BOOST_MAX = 3;            // 最高倍速
const HOLD_MOVE_PX = 18;        // 按下后移动超过这个距离算滑动，退出按住
const GOLD_MS = 5000;           // 金色食物限时
const SPECIAL_EVERY = 5;        // 每吃 5 颗，下颗换特殊食物
const SHRINK_SEGMENTS = 3;      // 吃下后先 +1，再减 3 节 = 净缩短 2 节
const GAMING = 0;
const LOSE = 1;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const easeOut = p => 1 - Math.pow(1 - p, 3);

class SnakeScene extends Scene {
  constructor(app) {
    super(app);
    this.bg = new ParticleField();
    this.best = +(getRaw(BEST_KEY, 0) || 0);
    this.throughWall = getRaw(WALL_KEY, '1') !== '0';
    this.snake = [];
    this.dir = [0, 1];
    this.nextDir = [0, 1];
    this.food = null;
    this.score = 0;
    this.combo = 0;
    this.comboUntil = 0;
    this.holdAt = 0;           // 按住起点时间（0 = 没在按）
    this.holdPoint = null;
    this.holdMoved = false;
    this.boost = 1;            // 当前提速倍率（松开立刻回 1）
    this.eatCount = 0;
    this.foodKind = 'normal';
    this.foodUntil = 0;
    this.scorePulseAt = -1;
    this.headPopAt = -1;
    this.eatFx = [];
    this.eatText = null;
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
  get interval() {
    // 分数越高越快：从 300ms 逐步压到 90ms，不再手动调难度。
    const fast = Math.min(BASE_INTERVAL - MIN_INTERVAL, Math.floor(this.score * SPEED_PER_SCORE));
    return Math.max(MIN_INTERVAL, BASE_INTERVAL - fast);
  }
  // 提速中的实际步进（按住棋盘不动时线性变大）
  get boostInterval() { return Math.max(40, this.interval / this.boost); }
  updateBoost(now) {
    if (!this.holdAt || this.holdMoved) {
      this.boost = 1;
      return;
    }
    const held = now - this.holdAt - BOOST_DELAY_MS;
    this.boost = held <= 0 ? 1 : 1 + (BOOST_MAX - 1) * Math.min(1, held / BOOST_RAMP_MS);
  }
  cancelHold() {
    this.holdAt = 0;
    this.holdPoint = null;
    this.holdMoved = false;
    this.boost = 1;
  }
  speedFactor() { return BASE_INTERVAL / this.boostInterval; }
  boot() {
    if (!this.restore()) this.startGame();
  }
  startGame() {
    achv.beginRound('snake');
    // 每日挑战：这是一局新的游戏（分数类任务从这一局开始才计数）
    daily.markNewRun('snake');
    this.snake = [[10, 10], [10, 9], [10, 8]];
    this.dir = [0, 1];
    this.nextDir = [0, 1];
    this.score = 0;
    this.combo = 0;
    this.comboUntil = 0;
    this.holdAt = 0;
    this.holdPoint = null;
    this.holdMoved = false;
    this.boost = 1;
    this.eatCount = 0;
    this.foodKind = 'normal';
    this.foodUntil = 0;
    this.scorePulseAt = -1;
    this.headPopAt = -1;
    this.eatFx = [];
    this.eatText = null;
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
  spawnFood(kind) {
    const used = new Set(this.snake.map(([r, c]) => `${r},${c}`));
    const cells = [];
    for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) if (!used.has(`${r},${c}`)) cells.push([r, c]);
    this.food = cells.length ? cells[Math.floor(Math.random() * cells.length)] : null;
    this.foodKind = kind === 'gold' || kind === 'shrink' ? kind : 'normal';
    this.foodUntil = this.foodKind === 'gold' ? Date.now() + GOLD_MS : 0;
  }
  save() {
    if (!this.started || !this.food) return;
    setRaw(STATE_KEY, JSON.stringify({
      snake: this.snake, dir: this.dir, nextDir: this.nextDir, food: this.food,
      score: this.score,
      combo: this.combo, comboUntil: this.comboUntil, eatCount: this.eatCount,
      foodKind: this.foodKind, foodUntil: this.foodUntil,
      result: this.phase === LOSE ? 'lose' : 'gaming', newBest: this.newBest,
    }));
  }
  restore() {
    try {
      const raw = getRaw(STATE_KEY, '');
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.snake) || !s.snake.length || !Array.isArray(s.food)) return false;
      this.snake = s.snake;
      this.dir = s.dir || [0, 1];
      this.nextDir = s.nextDir || this.dir;
      this.food = s.food;
      this.score = +s.score || 0;
      this.combo = Math.max(0, Math.floor(+s.combo) || 0);
      this.holdAt = 0;
      this.holdPoint = null;
      this.holdMoved = false;
      this.boost = 1;
      this.comboUntil = Math.max(0, Math.floor(+s.comboUntil) || 0);
      this.eatCount = Math.max(0, Math.floor(+s.eatCount) || 0);
      this.foodKind = s.foodKind === 'gold' || s.foodKind === 'shrink' ? s.foodKind : 'normal';
      this.foodUntil = Math.max(0, Math.floor(+s.foodUntil) || 0);
      this.scorePulseAt = -1;
      this.headPopAt = -1;
      this.eatFx = [];
      this.eatText = null;
      if (this.comboUntil <= Date.now()) this.combo = 0;
      if (this.foodKind === 'gold' && this.foodUntil <= Date.now()) this.spawnFood('normal');
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
    if (!this.started || this.phase !== GAMING || this.paused || this.helpOpen) {
      this.cancelHold();
      return;
    }
    const now = Date.now();
    this.updateBoost(now);
    if (this.combo > 0 && now >= this.comboUntil) this.combo = 0;
    if (this.food && this.foodKind === 'gold' && now >= this.foodUntil) this.spawnFood('normal');
    this.updateEatFx(Math.min(50, dt || 16), now);
    this.acc += Math.min(50, dt || 16);
    const stepMs = this.boostInterval;
    while (this.acc >= stepMs) {
      this.acc -= stepMs;
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
      // 一局结束：本局得分上报给成就系统（100/500/1000 各计一次）
      achv.reach('snake', this.score, [100, 300, 500]);
      this.app.audio.playLose();
      this.save();
      return;
    }
    this.snake.unshift(head);
    if (this.food && head[0] === this.food[0] && head[1] === this.food[1]) {
      const now = Date.now();
      const kind = this.foodKind;
      this.combo = this.combo > 0 && now <= this.comboUntil ? this.combo + 1 : 1;
      this.comboUntil = now + COMBO_MS;
      const mult = Math.min(COMBO_MAX, this.combo);
      let points = mult;
      if (kind === 'gold') points *= 3;
      this.score += points;
      this.eatCount += 1;
      this.scorePulseAt = now;
      this.headPopAt = now;
      this.spawnEatFx(head[0], head[1], kind, points);
      if (kind === 'shrink') {
        let removed = 0;
        while (this.snake.length > 3 && removed < SHRINK_SEGMENTS) {
          this.snake.pop();
          removed += 1;
        }
      }
      daily.report('snake', 'reach', { value: this.score });
      this.app.audio.playElimination();
      if (this.score > this.best) {
        this.best = this.score;
        this.newBest = true;
        setRaw(BEST_KEY, String(this.best));
      }
      const nextKind = this.eatCount % SPECIAL_EVERY === 0
        ? (Math.random() < 0.6 ? 'gold' : 'shrink')
        : 'normal';
      this.spawnFood(nextKind);
    } else {
      this.snake.pop();
    }
    this.save();
  }
  // ---------- 吃食物反馈 ----------
  spawnEatFx(r, c, kind, points) {
    const x = this.boardX + (c + 0.5) * this.cell;
    const y = this.boardY + (r + 0.5) * this.cell;
    const color = kind === 'gold' ? '#f5c542' : kind === 'shrink' ? '#4aa3df' : '#e05a47';
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 0.8 + Math.random() * 1.8;
      this.eatFx.push({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 0.6,
        size: Math.max(1.5, this.cell * (0.06 + Math.random() * 0.06)),
        color, age: 0, life: 320 + Math.random() * 220,
      });
    }
    this.eatText = { text: `+${points}`, x, y, color, age: 0, life: 760, combo: this.combo };
  }

  updateEatFx(dt, now) {
    if (this.eatFx.length) {
      const step = (dt || 16) / 16.67;
      this.eatFx.forEach((p) => {
        p.age += dt || 16;
        p.x += p.vx * step;
        p.y += p.vy * step;
        p.vy += 0.16 * step;
      });
      this.eatFx = this.eatFx.filter((p) => p.age < p.life);
    }
    if (this.eatText) {
      this.eatText.age += dt || 16;
      if (this.eatText.age >= this.eatText.life) this.eatText = null;
    }
    if (this.scorePulseAt > 0 && now - this.scorePulseAt > 280) this.scorePulseAt = -1;
    if (this.headPopAt > 0 && now - this.headPopAt > 180) this.headPopAt = -1;
  }

  drawEatFx(c) {
    this.eatFx.forEach((p) => {
      const k = 1 - p.age / p.life;
      if (k <= 0) return;
      c.save();
      c.globalAlpha = k;
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(p.x, p.y, p.size * (0.6 + k * 0.6), 0, Math.PI * 2);
      c.fill();
      c.restore();
    });
    const text = this.eatText;
    if (text) {
      const p = Math.min(1, text.age / text.life);
      c.save();
      c.globalAlpha = 1 - p * p;
      D.text(c, text.text, text.x, text.y - 14 - 24 * easeOut(p), {
        size: text.combo >= 2 ? 16 : 14,
        weight: 'bold',
        color: text.color,
        align: 'center',
      });
      if (text.combo >= 2) {
        D.text(c, `×${Math.min(COMBO_MAX, text.combo)}`, text.x + 28, text.y - 10 - 24 * easeOut(p), {
          size: 10, weight: 'bold', color: theme.tokens.god, align: 'left',
        });
      }
      c.restore();
    }
  }

  turn(d) {
    if (d[0] === -this.dir[0] && d[1] === -this.dir[1]) return;
    this.nextDir = d;
  }
  togglePause() {
    if (!this.started || this.phase === LOSE) return;
    if (!this.paused) {
      this.paused = true;
      this.resumeCount = 0;
      this.cancelHold();
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
  onTouchStart(p) {
    this.touch = p;
    this.holdPoint = { x: p.x, y: p.y };
    this.holdMoved = false;
    this.holdAt = Date.now();
  }
  onTouchMove(p) {
    if (!this.holdPoint) return;
    // 按下后明显移动 = 想换方向，不算「按住不动」，立刻取消提速
    if (Math.hypot(p.x - this.holdPoint.x, p.y - this.holdPoint.y) > HOLD_MOVE_PX) {
      this.holdMoved = true;
      this.boost = 1;
    }
  }
  onTouchEnd(p) {
    if (!this.touch) return;
    const dx = p.x - this.touch.x;
    const dy = p.y - this.touch.y;
    this.touch = null;
    this.cancelHold();   // 松开立刻恢复原速
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
    this.helpFab = { x: W - 16 - fabKit.SIZE, y: H - SAFE_BOTTOM - 16 - fabKit.SIZE, w: fabKit.SIZE, h: fabKit.SIZE };
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
    const now = Date.now();
    D.card(c, this.cx, this.scoreY, this.cw, this.scoreH, T);
    const q = this.cw / 3;
    const comboShown = this.combo > 0 ? `×${Math.min(COMBO_MAX, this.combo)}` : '--';
    const stats = [
      [t('snake.bestScore'), String(this.best), T.text],
      [t('snake.score'), String(this.score), T.primary],
      [t('snake.combo'), comboShown, this.combo >= 2 ? T.god : T.muted],
    ];
    stats.forEach(([label, value, color], i) => {
      if (i) D.divider(c, this.cx + q * i, this.scoreY + this.scoreH / 2, 24, T.border, 1);
      const x = this.cx + q * (i + 0.5);
      D.text(c, label, x, this.scoreY + 23, {
        size: 10.5, color: T.muted, align: 'center',
      });
      let scale = 1;
      if (i === 1 && this.scorePulseAt > 0 && now - this.scorePulseAt < 280) {
        scale = 1 + 0.16 * (1 - (now - this.scorePulseAt) / 280);
      } else if (i === 2 && this.combo >= 2 && now - this.comboUntil < 0) {
        scale = 1 + 0.06 * Math.abs(Math.sin(now / 180));
      }
      if (scale === 1) {
        D.text(c, value, x, this.scoreY + 48, { size: 22, weight: 'bold', color, align: 'center' });
      } else {
        c.save();
        c.translate(x, this.scoreY + 48);
        c.scale(scale, scale);
        D.text(c, value, 0, 0, { size: 22, weight: 'bold', color, align: 'center' });
        c.restore();
      }
    });
  }

  drawOptions(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.optY, this.cw, this.optH, T);
    const x1 = this.cx + this.cw * 3 / 10;
    const x2 = this.cx + this.cw * 6.5 / 10;
    D.divider(c, x1, this.optY + this.optH / 2, 24, T.border, 1);
    D.divider(c, x2, this.optY + this.optH / 2, 24, T.border, 1);
    const mid = this.optY + this.optH / 2;
    // 左侧不再是手动难度，显示当前自动加速倍率。
    const sx = this.cx + (x1 - this.cx) / 2;
    D.text(c, t('snake.speed'), sx, mid - 10, { size: 10.5, color: T.muted, align: 'center' });
    D.text(c, `×${this.speedFactor().toFixed(1)}`, sx, mid + 9, {
      size: 17, weight: 'bold', color: T.primary, align: 'center',
    });
    const label = t('snake.start');
    const bw = Math.min(100, actionLabel.width(c, label, { size: 12, iconSize: 12, gap: 4 }));
    const bx = (x1 + x2) / 2 - bw / 2;
    D.fillRoundRect(c, bx, mid - 16, bw, 32, 8, T.primary);
    actionLabel.draw(c, 'gamepad', label, bx + bw / 2, mid, { size: 12, color: '#fff', iconSize: 12, gap: 4 });
    this.addButton('new', bx, mid - 16, bw, 32, () => { this.startGame(); });
    const pauseLabel = this.paused ? t('snake.resume') : t('snake.pause');
    const pw = Math.min(Math.round(this.cw / 3) - 16, Math.max(80, actionLabel.width(c, pauseLabel, { size: 13 })));
    const px = (x2 + this.cx + this.cw) / 2 - pw / 2;
    D.fillRoundRect(c, px, mid - 16, pw, 32, 8, this.phase === LOSE ? T.disabled : T.god);
    actionLabel.draw(c, this.paused ? 'play' : 'pause', pauseLabel, px + pw / 2, mid, {
      size: 12, color: this.phase === LOSE ? '#f3f3f3' : '#fff', iconSize: 12, gap: 4,
    });
    if (this.phase !== LOSE) this.addButton('pause', px, mid - 16, pw, 32, () => this.togglePause());
    // 连击倒计时：新游戏这一行卡片的底部逆向进度条（满 → 空），和消除类的分数进度条同一套样式
    if (this.combo > 0) {
      const left = clamp((this.comboUntil - Date.now()) / COMBO_MS, 0, 1);
      D.progressBar(c, this.cx, this.optY, this.cw, this.optH, left, T.border, this.combo >= 2 ? T.god : T.primary);
    }
  }


  drawFood(c) {
    if (!this.food) return;
    const T = theme.tokens;
    const now = Date.now();
    const fx = this.boardX + (this.food[1] + 0.5) * this.cell;
    const fy = this.boardY + (this.food[0] + 0.5) * this.cell;
    const r = this.cell * 0.36;
    const kind = this.foodKind;
    if (kind === 'gold') {
      const pulse = 0.5 + 0.5 * Math.sin(now / 180);
      c.save();
      c.globalAlpha = 0.35 + 0.2 * pulse;
      [1.7, 1.35, 1.05].forEach((k, i) => {
        c.fillStyle = i === 0 ? 'rgba(245,197,66,0.10)' : i === 1 ? 'rgba(245,197,66,0.16)' : 'rgba(245,197,66,0.24)';
        c.beginPath();
        c.arc(fx, fy, r * k, 0, Math.PI * 2);
        c.fill();
      });
      c.restore();
      D.circle(c, fx, fy, r, '#f5c542');
      D.circle(c, fx - r * 0.3, fy - r * 0.3, r * 0.28, '#fff1b8');
      // 限时环：金色食物 5 秒内没吃到会变回普通食物
      if (this.foodUntil) {
        const left = clamp((this.foodUntil - now) / GOLD_MS, 0, 1);
        c.save();
        c.strokeStyle = '#fff6cf';
        c.lineWidth = Math.max(1.5, this.cell * 0.06);
        c.beginPath();
        c.arc(fx, fy, r * 1.45, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
        c.stroke();
        c.restore();
      }
    } else if (kind === 'shrink') {
      D.circle(c, fx, fy, r * 1.14, 'rgba(74,163,223,0.20)');
      D.circle(c, fx, fy, r, '#4aa3df');
      D.circle(c, fx - r * 0.28, fy - r * 0.28, r * 0.26, '#c9ecff');
      c.save();
      c.strokeStyle = '#ffffff';
      c.lineWidth = Math.max(1.8, this.cell * 0.07);
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(fx - r * 0.48, fy);
      c.lineTo(fx + r * 0.48, fy);
      c.stroke();
      c.restore();
    } else {
      D.circle(c, fx, fy, r, '#e05a47');
      D.circle(c, fx - this.cell * 0.1, fy - this.cell * 0.1, this.cell * 0.1, '#ffb3a6');
    }
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
    const now = Date.now();
    const pop = this.headPopAt > 0 ? 1 + 0.14 * (1 - (now - this.headPopAt) / 180) : 1;
    this.snake.forEach(([r, col], i) => {
      const x = x0 + col * this.cell + 1;
      const y = y0 + r * this.cell + 1;
      const s = this.cell - 2;
      if (i === 0 && pop > 1) {
        c.save();
        c.translate(x + s / 2, y + s / 2);
        c.scale(pop, pop);
        D.fillRoundRect(c, -s / 2, -s / 2, s, s, 7, T.primary);
        c.fillStyle = '#fff';
        D.circle(c, -s * 0.16, -s * 0.12, Math.max(1.2, s * 0.1));
        D.circle(c, s * 0.16, -s * 0.12, Math.max(1.2, s * 0.1));
        c.restore();
      } else {
        D.fillRoundRect(c, x, y, s, s, i === 0 ? 7 : 5, i === 0 ? T.primary : '#3b9463');
        if (i === 0) {
          c.fillStyle = '#fff';
          D.circle(c, x + s * 0.34, y + s * 0.38, Math.max(1.2, s * 0.1));
          D.circle(c, x + s * 0.66, y + s * 0.38, Math.max(1.2, s * 0.1));
        }
      }
    });
    this.drawFood(c);
    this.drawEatFx(c);
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
        if (!icons.draw(c, 'play', W / 2, y0 + this.boardSize / 2 - 22, 34, T.text)) {
          D.text(c, '>', W / 2, y0 + this.boardSize / 2 - 22, { size: 30, weight: 'bold', color: T.text, align: 'center' });
        }
        D.text(c, t('snake.resumeTip'), W / 2, y0 + this.boardSize / 2 + 24, { size: 14, weight: 'bold', color: T.text, align: 'center' });
      }
      this.addButton('resume-board', x0, y0, this.boardSize, this.boardSize, () => this.togglePause());
    }
    if (this.phase === LOSE && this.resultVisible()) {
      share.resultPanel(c, this, y0, this.boardSize, { w: this.boardSize });
      const cy = y0 + this.boardSize / 2;
      D.text(c, `👻👻 ${t('snake.tipLost')} 👻👻`, W / 2, cy - 28, { size: 18, weight: 'bold', color: T.lose, align: 'center' });
      if (this.newBest) D.text(c, t('snake.newBest'), W / 2, cy + 2, { size: 13, color: T.muted, align: 'center' });
      const label = t('snake.start');
      const bw = resultButton.width(c, label);
      resultButton.draw(c, this, label, 'new', W / 2 - bw / 2, cy + 24, {
        id: 'lose-retry', onTap: () => this.startGame(),
      });
    }
  }
  drawFabs(c) {
    const T = theme.tokens;
    const drawOne = (rect, key, fallback, color, onTap, id) => {
      c.save(); c.shadowColor = 'rgba(0,0,0,0.12)'; c.shadowBlur = 10; c.shadowOffsetY = 2;
      D.circle(c, rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, T.card); c.restore();
      fabKit.stroke(c, rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, fabKit.borderOf(key === 'help' ? 'help' : 'mode'));
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
SnakeScene.BOOST = { DELAY: BOOST_DELAY_MS, RAMP: BOOST_RAMP_MS, MAX: BOOST_MAX, MOVE_PX: HOLD_MOVE_PX };
module.exports = SnakeScene;
