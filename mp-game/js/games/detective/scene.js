const { W, H, SAFE_TOP, SAFE_BOTTOM } = require('../../core/canvas');
const { Scene } = require('../../core/app');
const theme = require('../../core/theme');
const { t } = require('../../core/i18n');
const { getRaw, setRaw, removeRaw } = require('../../core/storage');
const D = require('../../core/draw');
const ParticleField = require('../../core/particles');
const icons = require('../../core/icons');
const fabKit = require('../../core/fab');
const cards = require('../../core/cards');
const HEADER = require('../../core/header');
const share = require('../../core/share');
const { drawTimer } = require('../../core/timer');
const { wrongShake, popScale } = require('../../core/fx');
const i18nDict = require('./i18n');

const coreI18n = require('../../core/i18n');
const confetti = require('../../core/confetti');
const achv = require('../../core/achv');
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
// 全部牌翻到背面后，先停留这么久再开始揭面（偷换就发生在这一段里，玩家看不到）
const REVEAL_HOLD = 160;
// 失败时「把正确答案盖章标出来」的动画：盖章 420ms，命中后 450ms 开始震牌 500ms = 950ms
const STAMP_IN_MS = 420;
const STAMP_SHAKE_DELAY = 450;
const STAMP_SHAKE_MS = 500;
const STAMP_TOTAL_MS = STAMP_SHAKE_DELAY + STAMP_SHAKE_MS;
// 盖章动画放完后再停这么久才出失败遮罩（以前是点错后 500ms 直接盖遮罩，来不及看清答案）
const LOSE_AFTER_STAMP = 300;
// 盖章：章从「z 轴很远的地方」飞过来 —— 一开始大到显示不全（4.2 倍），
// 越靠近卡片缩得越快（3.4 → 2.0 → 1.25），贴上去时压过一点（0.96），再回弹 1.04 → 1 落定
const STAMP_IN_KEYS = [
  { t: 0, s: 4.2, a: 0 },
  { t: 0.1, s: 3.4, a: 1 },
  { t: 0.3, s: 2.0, a: 1 },
  { t: 0.48, s: 1.25, a: 1 },
  { t: 0.62, s: 0.96, a: 1 },   // 盖上去，压过一点
  { t: 0.78, s: 1.04, a: 1 },   // 回弹
  { t: 1, s: 1, a: 1 },
];
// 落定后章占卡片的一半（用户指定），不随关卡变大
const STAMP_W_RATIO = 0.52;
const STAMP_H_RATIO = 0.52;
// 章落定后这张牌被「按」得晃一下（幅度比点错小，关键帧照 web 的 stamp-shake）
const STAMP_SHAKE_KEYS = [
  { t: 0, x: 0, y: 0, r: 0 },
  { t: 0.2, x: -2, y: 1, r: -1.2 },
  { t: 0.45, x: 2, y: -1, r: 1.2 },
  { t: 0.7, x: -1, y: 1, r: -0.8 },
  { t: 1, x: 0, y: 0, r: 0 },
];

// 关键帧插值：keys 里 t 递增，返回 { ... } 线性插值
function lerpKeys(keys, t) {
  const k = Math.max(0, Math.min(1, t));
  for (let i = 1; i < keys.length; i += 1) {
    const a = keys[i - 1];
    const b = keys[i];
    if (k <= b.t) {
      const f = b.t === a.t ? 0 : (k - a.t) / (b.t - a.t);
      const out = {};
      Object.keys(a).forEach((key) => {
        if (key === 't') return;
        out[key] = a[key] + (b[key] - a[key]) * f;
      });
      return out;
    }
  }
  const last = keys[keys.length - 1];
  const out = {};
  Object.keys(last).forEach((key) => { if (key !== 't') out[key] = last[key]; });
  return out;
}

function stampInOf(age) {
  return lerpKeys(STAMP_IN_KEYS, age / STAMP_IN_MS);
}

function stampShakeOf(age) {
  return lerpKeys(STAMP_SHAKE_KEYS, age / STAMP_SHAKE_MS);
}
// 存档版本：v2 起支持「答题中途退出后接着答」
const STATE_V = 2;

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
    this.revealAt = 0;
    this.stampAt = 0;      // 失败时盖章动画的起点（0 = 没在播 / 结算态静态显示）
    this.playStart = 0;
    this.settleAt = 0;
    this.lock = false;
    this.keepBestOnNewGame = true;
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
  // 存盘要覆盖「答题中途」：以前只在胜负结算时写，中途退出等于没存 —— 回来会掉回第 1 关。
  saveState() {
    try {
      setRaw(levelKey(this.mode), JSON.stringify({
        v: STATE_V,
        level: this.level, hearts: this.hearts, phase: this.phase, time: this.time,
        // 已经答了多久（毫秒）：恢复后接着计时，不能从 0 重算
        elapsed: this.playStart ? Math.max(0, this.now - this.playStart) : 0,
        board: this.board, swapped: this.swapped, wrong: this.wrong,
      }));
    } catch (e) { /* 存储异常不影响游玩 */ }
  }
  restore() {
    try {
      const raw = getRaw(levelKey(this.mode), '');
      if (!raw) return false;
      const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!s || typeof s.level !== 'number') return false;
      this.level = Math.min(this.sizes.length - 1, Math.max(0, s.level));
      const n = this.rows * this.cols;
      const boardOk = Array.isArray(s.board) && s.board.length === n;
      const savedHearts = typeof s.hearts === 'number' ? s.hearts : HEARTS_MAX;
      // 心已经扣到 0（含「盖章动画还没播完就退出」这种）按失败态恢复，不要重开本关
      const phase = s.phase === ANSWER && savedHearts <= 0 ? LOST : s.phase;
      // 观察阶段（记忆 / 翻面）没有「答案」可言，也没损失，直接重开本关最干净
      const resumable = boardOk && (phase === ANSWER || phase === WON || phase === LOST)
        && !(phase === ANSWER && !Number.isInteger(+s.swapped));
      if (!resumable) {
        this.startLevel();
        return true;
      }
      this.board = s.board.slice();
      this.swapped = Number.isInteger(+s.swapped) && +s.swapped >= 0 && +s.swapped < n ? +s.swapped : -1;
      this.wrong = Array.isArray(s.wrong) ? s.wrong.filter((i) => Number.isInteger(+i) && +i >= 0 && +i < n) : [];
      this.hearts = Math.max(0, Math.min(HEARTS_MAX, savedHearts));
      this.time = Math.max(0, +s.time || 0);
      this.flips = new Array(n).fill(1);
      this.flipTargets = new Array(n).fill(1);
      this.flipDelays = [];
      this.right = -1;
      this.rightAt = 0;
      this.settleAt = 0;
      this.stampAt = 0;          // 结算态静态保留盖章，不重播动画
      this.confirming = false;
      this.wrongFx = new Map();
      this.layout();
      if (phase === WON || phase === LOST) {
        this.phase = phase;
        this.lock = true;
        this.playStart = 0;
        return true;
      }
      // 答题中途退出：牌已经全部翻开过，接着答；计时扣掉已经用掉的部分
      this.phase = ANSWER;
      this.lock = false;
      const elapsed = Math.max(0, Math.min(24 * 3600 * 1000, +s.elapsed || 0));
      this.playStart = Date.now() - elapsed;
      this.revealAt = 0;
      this.memLeft = 0;
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
    this.revealAt = 0;
    this.layout();
    // 别 removeRaw：留一条观察阶段的记录，这样退出再进来仍然停在这一关
    this.saveState();
  }
  nextLevel() {
    if (this.level < this.sizes.length - 1) this.level++;
    this.startLevel();
  }
  retryLevel() { this.confirming = false; this.startLevel(); }
  startNewGame() {
    this.confirming = false;
    // 只把当前关重置到第 1 关，最高关卡记录保留。
    this.level = 0;
    this.startLevel();
  }
  toggleMode() {
    this.saveState();               // 先把当前模式这局的进度存下来
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
        this.revealAt = 0;
      }
    } else if (this.phase === FLIP) {
      // 偷换必须等所有牌**完全**翻到背面再做：翻面途中换牌，玩家能直接看到哪张变了
      const allDown = this.flips.length > 0 && this.flips.every((f) => f <= 0);
      if (allDown) {
        if (this.swapped < 0) {
          const idx = Math.floor(Math.random() * this.board.length);
          const repl = pickReplacement(this.board, this.mode);
          if (repl != null) {
            this.swapped = idx;
            this.board[idx] = repl;
          }
          // 全背面的停留：换完再揭面，任何一帧都看不到牌面内容变化
          this.revealAt = this.now + REVEAL_HOLD;
          if (repl != null) this.saveState();
        }
        if (this.revealAt && this.now >= this.revealAt) {
          this.phase = ANSWER;
          this.flipTargets = this.flipTargets.map(() => 1);
          this.flipStart = this.now;
          this.flipDelays = this.flipTargets.map((_, i) => i * 20);
          this.playStart = this.now;
          this.time = 0;
          this.memLeft = 0;
          this.saveState();
        }
      }
    } else if (this.phase === ANSWER) {
      if (this.playStart) this.time = Math.floor((this.now - this.playStart) / 1000);
      if (this.lock && this.settleAt && this.now >= this.settleAt) {
        if (this.hearts <= 0) {
          this.phase = LOST;
          this.stampAt = 0;          // 动画已放完，LOST 态静态保留章（重进不重播）
          this.shareLine = `${t('detective.levelLabel')} ${this.level + 1}`;
          this.app.audio.playLose();
          this.saveState();
        } else if (this.right >= 0) {
          this.phase = WON;
          this.shareLine = `${t('detective.levelLabel')} ${this.level + 1}`;
          this.best = Math.max(this.best, this.level + 1);
          achv.win('detective', { mode: this.mode, level: this.level + 1 });
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
      this.saveState();
      return;
    }
    this.wrong = this.wrong.concat([idx]);
    this.wrongFx.set(idx, Date.now());
    this.hearts = Math.max(0, this.hearts - 1);
    this.app.audio.playFail();
    if (this.hearts <= 0) {
      this.lock = true;
      this.stampAt = Date.now();
      // 先把正确答案盖章标出来（STAMP_TOTAL_MS），动画完整播完再停 LOSE_AFTER_STAMP 才盖失败遮罩
      this.settleAt = this.now + STAMP_TOTAL_MS + LOSE_AFTER_STAMP;
    }
    this.saveState();
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
    this.fabSize = fabKit.SIZE;
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
      let shake = wrongAt ? wrongShake(this.now - wrongAt) : 0;
      // 盖章落定后这张牌被按住晃一下（章本身不动，才有「盖上去」的感觉）
      const stampAge = this.stampAt ? this.now - this.stampAt : -1;
      let cardDy = 0;
      let cardRot = 0;
      if (this.swapped === i && stampAge >= STAMP_SHAKE_DELAY && stampAge < STAMP_TOTAL_MS) {
        const sk = stampShakeOf(stampAge - STAMP_SHAKE_DELAY);
        shake += sk.x;
        cardDy = sk.y;
        cardRot = sk.r;
      }
      const scale = i === this.right && this.rightAt ? popScale(this.now - this.rightAt) : 1;
      c.save();
      c.translate(r.x + r.w / 2 + shake, r.y + r.h / 2 + cardDy);
      if (cardRot) c.rotate((cardRot * Math.PI) / 180);
      c.scale(sx * scale, scale);
      cards.draw(c, item, this.mode, -r.w / 2, -r.h / 2, r.w, r.h, faceUp, 'incognito', '🕵');
      c.restore();
      // 失败：正确答案那张先播「盖章 + 震牌」，放完停在结算态
      const stamped = this.swapped === i && (this.phase === LOST || stampAge >= 0);
      if (this.right === i || stamped) {
        D.strokeRoundRect(c, r.x + 1, r.y + 1, r.w - 2, r.h - 2, 7, this.right === i ? T.primary : T.win, 3);
      }
      if (this.wrong.includes(i)) D.strokeRoundRect(c, r.x + 1, r.y + 1, r.w - 2, r.h - 2, 7, T.lose, 3);
      if (this.phase === ANSWER && !this.lock && !this.wrong.includes(i)) {
        this.addButton('cell-' + i, r.x, r.y, r.w, r.h, () => this.onCellClick(i));
      }
    });
    // 失败盖章画在所有牌之上：大章会压住周围一圈牌，才像真的盖上去
    const stampAgeAll = this.stampAt ? this.now - this.stampAt : -1;
    if (this.swapped >= 0 && this.swapped < this.board.length
      && (this.phase === LOST || stampAgeAll >= 0)) {
      const sr = this.cardRect(this.swapped);
      const st = stampAgeAll < 0 ? { s: 1, a: 1 } : stampInOf(stampAgeAll);
      const bw = sr.w * STAMP_W_RATIO;      // 就是卡片的一半，不封顶
      const bh = sr.h * STAMP_H_RATIO;
      const drawStamp = (fn) => {
        c.save();
        c.globalAlpha = st.a;
        c.translate(sr.x + sr.w / 2, sr.y + sr.h / 2);
        c.rotate((-12 * Math.PI) / 180);          // 盖章的手感：歪一点
        c.scale(st.s, st.s);
        fn();
        c.restore();
      };
      drawStamp(() => {
        c.shadowColor = 'rgba(0,0,0,0.12)';
        c.shadowBlur = 2;
        c.shadowOffsetY = 1;
        D.fillRoundRect(c, -bw / 2, -bh / 2, bw, bh, 9, 'rgba(255,255,255,0.4)');
      });
      drawStamp(() => D.strokeRoundRect(c, -bw / 2, -bh / 2, bw, bh, 9, T.primary, 2));
      drawStamp(() => {
        // 章只占卡片一半：太小就只留对钩，不再挤「正确」两个字
        const withText = bh >= 34;
        D.text(c, '✓', 0, withText ? -bh * 0.14 : 0, {
          size: Math.min(bw, bh) * (withText ? 0.42 : 0.6), weight: 'bold', color: T.primary, align: 'center',
        });
        if (withText) {
          D.text(c, t('detective.stampText'), 0, bh * 0.28, {
            size: Math.max(9, Math.min(bh * 0.22, bw * 0.28)), weight: 'bold', color: T.primary, align: 'center',
          });
        }
      });
    }

    const hint = this.phase === MEMORY ? t('detective.phaseMemory') : this.phase === FLIP ? t('detective.phaseFlip') : this.phase === ANSWER ? (this.mode === 1 ? t('detective.phaseAnswer') : t('detective.phaseAnswerCard')) : '';
    if (hint) {
      const tw = D.measure(c, hint, 13, 'bold');
      D.fillRoundRect(c, W / 2 - (tw + 24) / 2, this.tipY + 2, tw + 24, 24, 8, T.card);
      D.strokeRoundRect(c, W / 2 - (tw + 24) / 2, this.tipY + 2, tw + 24, 24, 8, T.border, 1);
      D.text(c, hint, W / 2, this.tipY + 14, { size: 13, weight: 'bold', color: T.text, align: 'center' });
    }
    if (this.phase === WON || this.phase === LOST) this.drawResult(c);
  }
    // 结算面板：**宽度和上面那张卡片一致**（不是只有棋盘那么宽 —— 第 1、2 关棋盘很窄，
    // 以前遮罩只有小小一块）。高度取「棋盘高度」和内容所需高度里的大者，垂直居中于棋盘。
    resultRect() {
      const w = this.cw;
      const needH = 196;
      // 从棋盘顶开始，只往下长：往上会盖住上面的选项卡（那里还有「新游戏」按钮）
      const bottom = H - SAFE_BOTTOM - 16 - 48 - 8;   // 让开底部 FAB 那一行
      const room = Math.max(150, bottom - this.boardY);
      const h = Math.min(Math.max(this.boardH, needH), room);
      return { x: this.cx, y: this.boardY, w, h };
    }

    drawResult(c) {
      // 失败遮罩的延时已经在 settleAt 里算过（盖章动画 + 300ms），这里不再叠一层 200ms 通用门槛
      if (this.phase !== LOST && !this.resultVisible()) return;
      const T = theme.tokens;
      const r = this.resultRect();
      // 面板：整宽遮罩 + 细描边，看起来是一张「结算卡」，不再像棋盘上的一块补丁
      D.fillRoundRect(c, r.x, r.y, r.w, r.h, 16, T.overlay);
      D.strokeRoundRect(c, r.x, r.y, r.w, r.h, 16, T.border, 1);
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      if (this.phase === WON) {
        D.text(c, `🎉🎉 ${t('detective.tipWin')} 🎉🎉`, cx, cy - 26, { size: 18, weight: 'bold', color: T.win, align: 'center' });
        const labels = [t('detective.replayLevel'), t('detective.nextLevel')];
        const gap = 10;
        const bw = 100;
        const bx = cx - (bw * 2 + gap) / 2;
        this.button(c, bx, cy + 16, bw, 32, labels[0], 'outline', () => this.retryLevel());
        this.button(c, bx + bw + gap, cy + 16, bw, 32, labels[1], 'primary', () => this.nextLevel());
      } else {
        D.text(c, `👻👻 ${t('detective.tipLost')} 👻👻`, cx, cy - 20, { size: 18, weight: 'bold', color: T.lose, align: 'center' });
        this.button(c, cx - 55, cy + 18, 110, 32, t('detective.replayLevel'), 'outline', () => this.retryLevel());
      }
      // 分享入口：结算面板自己的右上角（屏幕右上角被微信胶囊盖着，不能放那儿）
      share.drawResultChip(c, this, { x: r.x + r.w - 10 - 96, y: r.y + 10, w: 96, h: 28 },
        { filled: true, label: t('app.shareCta') });
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
      fabKit.stroke(c, rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, fabKit.borderOf(key === 'help' ? 'help' : 'mode'));
      c.restore();
      if (!icons.draw(c, key, rect.x + rect.w / 2, rect.y + rect.h / 2, 20, color)) {
        D.text(c, fallback, rect.x + rect.w / 2, rect.y + rect.h / 2, { size: 18, color, align: 'center' });
      }
      this.addButton(id, rect.x, rect.y, rect.w, rect.h, onTap);
    };
    drawOne(this.helpFab, 'help', '?', T.text, () => { this.helpOpen = true; }, 'help');
    const muteRect = fabKit.muteSlot(this.helpFab);
    if (muteRect) fabKit.drawMute(this, c, muteRect);
    const key = this.mode === 2 ? 'mode-poker' : this.mode === 3 ? 'mode-mahjong' : 'mode-emoji';
    const fallback = this.mode === 2 ? '🃏' : this.mode === 3 ? '🀄' : '😀';
    drawOne(fabKit.slotLeft(this.helpFab, muteRect ? 2 : 1), key, fallback, T.primary, () => this.toggleMode(), 'mode');
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
  // 回首页 / 切到后台：先把这局存下来（以前这里是空的，中途退出必然丢进度）
  onHide() { this.saveState(); }
  onShow() {}
}

module.exports = DetectiveScene;
