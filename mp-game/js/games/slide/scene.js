// Emoji 滑行 · canvas 场景（微信小游戏）。
// 玩法 / 视觉基准：web 的 src/games/slide/SlideGame.vue；纯逻辑在 ./board.js。
//
// 关键实现要点（对照 PITFALLS.md）：
// - 牌面一律走 core/cards.js 的 MODE_EMOJI，空白格不画卡片；
// - 拖动跟手只给「本组」加偏移，松手提交 / 弹回的补间从当前手指位置开始，绝不先回原格；
// - 消除时逻辑上立刻把牌移出盘面（grid 里已空），闪烁只是 ghost，不锁整盘；
// - 入场按行优先 row * cols + col 错峰；恢复存档后重新 layout()；
// - 计时用沙漏 drawTimer('hourglass')，分数卡分隔线一律 24px。
const { W, H, SAFE_BOTTOM } = require('../../core/canvas');
const share = require('../../core/share');
const { Scene } = require('../../core/app');
const theme = require('../../core/theme');
const { t } = require('../../core/i18n');
const { getRaw, setRaw } = require('../../core/storage');
const D = require('../../core/draw');
const actionLabel = require('../../core/action-label');
const resultButton = require('../../core/result-button');
const ParticleField = require('../../core/particles');
const icons = require('../../core/icons');
const fabKit = require('../../core/fab');
const cards = require('../../core/cards');
const HEADER = require('../../core/header');
const { drawTimer } = require('../../core/timer');
const confetti = require('../../core/confetti');
const achv = require('../../core/achv');
const logic = require('./board');
const i18nDict = require('./i18n');

const coreI18n = require('../../core/i18n');
if (!coreI18n.__slideRegistered) {
  coreI18n.register('slide', i18nDict);
  coreI18n.__slideRegistered = true;
}

const PREFIX = '__emoji_slide__';
const STATE_KEY = `${PREFIX}state`; // 局面存档（关卡进度也在里面，web 同样只有这一个 key）
const PLAY = 'play';
const WON = 'won';
const OVER = 'over';

const MAX_CELL = 56; // 小棋盘（6×6）时别撑得太满
const GAP = 3; // 格子之间的缝
const TAP_SLOP = 8; // 位移小于它就当成「点击」而不是拖动
const MOVE_MS = 170; // 松手提交 / 弹回的补间
const POP_MS = 320; // 消除闪烁（两次明暗 + 缩小消失）
const SHAKE_MS = 620; // 同款晃动提示
const SHUFFLE_TILE_MS = 550; // 死局重排每张牌的动画
const SHUFFLE_TIP_MS = 1000; // 重排提示
const DEAL_STEP = 20; // 入场错峰：行优先逐个出现
const DEAL_MS = 320; // 单张入场
const COMBO_MS = 2500; // 连击窗口
const COMBO_TIP_MS = 1500; // 连击提示停留
const UPGRADE_TIME = 5; // 时间升级：每层 +5s
const UPGRADE_COMBO = 400; // 连击升级：每层 +0.4s
const UPGRADE_POOL = ['time', 'combo', 'special'];

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function easeOut(p) {
  return 1 - Math.pow(1 - p, 3);
}

function pad2(n) {
  return `${n < 10 ? '0' : ''}${n}`;
}

function fmt(seconds) {
  const s = Math.max(0, Math.ceil(seconds || 0));
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
}

// 同款晃动：0 → -14% → +14% → -10% → +8% → 0（含轻微旋转），620ms
const SHAKE_STOPS = [
  [0, 0, 0],
  [0.18, -0.14, -7],
  [0.38, 0.14, 7],
  [0.58, -0.1, -5],
  [0.78, 0.08, 4],
  [1, 0, 0],
];

function shakeMotion(age) {
  const p = clamp(age / SHAKE_MS, 0, 1);
  for (let i = 1; i < SHAKE_STOPS.length; i++) {
    const cur = SHAKE_STOPS[i];
    if (p <= cur[0]) {
      const prev = SHAKE_STOPS[i - 1];
      const span = cur[0] - prev[0] || 1;
      const k = (p - prev[0]) / span;
      return {
        dx: prev[1] + (cur[1] - prev[1]) * k,
        rot: (((prev[2] + (cur[2] - prev[2]) * k) * Math.PI) / 180),
      };
    }
  }
  return { dx: 0, rot: 0 };
}

// 死局重排：scale 1 → 0.7 → 1.14 → 1，配合旋转与短暂透明
function shuffleMotion(p) {
  if (p < 0.35) {
    const k = p / 0.35;
    return { scale: 1 - 0.3 * k, rot: ((-14 * k) * Math.PI) / 180, alpha: 1 - 0.7 * k };
  }
  if (p < 0.7) {
    const k = (p - 0.35) / 0.35;
    return { scale: 0.7 + 0.44 * k, rot: ((-14 + 23 * k) * Math.PI) / 180, alpha: 0.3 + 0.7 * k };
  }
  const k = (p - 0.7) / 0.3;
  return { scale: 1.14 - 0.14 * k, rot: ((9 - 9 * k) * Math.PI) / 180, alpha: 1 };
}

class SlideScene extends Scene {
  constructor(app) {
    super(app);
    this.bg = new ParticleField();
    this.level = 1;
    this.conf = logic.levelConfig(1);
    this.phase = PLAY;
    this.tiles = [];
    this.tileId = 0;
    this.elapsed = 0;
    this.score = 0;
    this.maxCombo = 0;
    this.scorePulseAt = -1;
    this.savedSecond = 0;
    this.now = Date.now();
    this.helpOpen = false;
    this.confirming = false;
    this.drag = null;
    this.touch = null;
    this.shakeKind = 0;
    this.shakeAt = 0;
    this.shuffleAt = 0;
    this.deadlockAt = 0;
    this.combo = 0;
    this.comboAt = 0;
    this.comboUntil = 0;
    this.comboExpireAt = 0;
    this.lastClearAt = 0;
    this.comboBroken = false;
    this.perks = { time: 0, combo: 0, special: 0 };
    this.upgradeOpen = false;
    this.upgradeOptions = [];
    this.score = 0;
    this.maxCombo = 0;
    this.scorePulseAt = -1;
    this.clearsSinceSpecial = 0;
    this.bursts = [];
    this.confetti = [];
    this.confettiUntil = 0;
    this.lastConfettiAt = 0;
    this.layout();
    this.boot();
  }

  get rows() { return this.conf.rows; }
  get cols() { return this.conf.cols; }
  get timeLeft() { return Math.max(0, this.conf.seconds - this.elapsed); }
  get leftPairs() { return this.tiles.filter(tile => !tile.popping).length / 2; }

  // ---------- 关卡流程 ----------

  boot() {
    const restored = this.restore();
    if (restored) this.startLevel(restored.level, restored);
    else this.startLevel(1);
  }

  makeTile(kind, r, c, special) {
    this.tileId += 1;
    return {
      id: this.tileId,
      kind,
      special: special === 'clock' || special === 'bomb' || special === 'wild' ? special : '',
      r,
      c,
      popping: false,
      popAt: 0,
      dealAt: 0,
      shuffleAt: 0,
      animFrom: null,
      animAt: 0,
    };
  }

  startLevel(level, restored) {
    if (!restored) achv.beginRound('slide');
    this.level = Math.max(1, Math.floor(level) || 1);
    this.usedShuffle = false;   // 本关是否用过死局重排（成就「无重排获胜」判定）
    this.conf = logic.levelConfig(this.level);
    this.layout();
    this.phase = PLAY;
    this.drag = null;
    this.touch = null;
    this.shakeKind = 0;
    this.shakeAt = 0;
    this.shuffleAt = 0;
    this.deadlockAt = 0;
    this.score = 0;
    this.maxCombo = 0;
    this.scorePulseAt = -1;
    this.clearsSinceSpecial = 0;
    this.bursts = [];
    this.confetti = [];
    this.confettiUntil = 0;
    this.lastConfettiAt = 0;
    this.helpOpen = false;
    this.confirming = false;
    this.breakCombo();
    const now = Date.now();
    if (restored) {
      this.tiles = restored.tiles.map(cell => this.makeTile(cell.kind, cell.r, cell.c, cell.special));
      this.elapsed = restored.elapsed;
      this.score = restored.score || 0;
      this.maxCombo = restored.maxCombo || 0;
      this.perks = restored.perks || this.perks;
      this.phase = restored.phase;
    } else {
      const g = logic.makeBoard(this.rows, this.cols, this.conf.kinds);
      this.tiles = [];
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          // 奇数面积棋盘留的空位（g[r][c] === 0）不建牌：
          // 建了会渲染成没有 emoji 的白卡片，而且永远消不掉，胜利判定永远不成立。
          if (g[r][c]) this.tiles.push(this.makeTile(g[r][c], r, c));
        }
      }
      this.elapsed = -((this.perks.time || 0) * UPGRADE_TIME);
    }
    if (!restored) {
      // 关卡越深，特殊牌越多；它们仍是正常对子，只多一个效果标记。
      if (this.level >= 2) this.seedSpecial('clock');
      if (this.level >= 4) this.seedSpecial('bomb');
      if (this.level >= 6) this.seedSpecial('wild');
      if (this.level >= 8 && Math.random() < 0.6) this.seedSpecial(Math.random() < 0.3 ? 'wild' : Math.random() < 0.5 ? 'clock' : 'bomb');
      for (let i = 0; i < (this.perks.special || 0); i += 1) this.seedSpecial(Math.random() < 0.3 ? 'wild' : Math.random() < 0.5 ? 'clock' : 'bomb');
    }
    // 入场：按行优先 row * cols + col 错峰，左上先出现、右下后出现（新建与恢复都一样）
    this.tiles.forEach((tile) => {
      tile.dealAt = now + (tile.r * this.cols + tile.c) * DEAL_STEP;
    });
    this.savedSecond = Math.floor(this.elapsed);
    // 注意：阶段必须先落地再 save() —— 恢复胜利 / 失败局面时若先写死 PLAY，
    //    这次 save() 会把结算存档冲成 PLAY（web 踩过，会掉回第 1 关）。
    this.save();
    if (restored) this.deadlockAt = now + 600;
  }

  replayLevel() {
    this.startLevel(this.level);
  }

  nextLevel() {
    if (this.upgradeOpen) return;
    this.upgradeOptions = UPGRADE_POOL.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    this.upgradeOpen = true;
  }

  comboWindow() {
    return COMBO_MS + (this.perks.combo || 0) * UPGRADE_COMBO;
  }

  applyUpgrade(id) {
    if (!this.upgradeOpen) return;
    if (id === 'time') this.perks.time += 1;
    else if (id === 'combo') this.perks.combo += 1;
    else if (id === 'special') this.perks.special += 1;
    this.upgradeOpen = false;
    this.upgradeOptions = [];
    this.startLevel(this.level + 1);
  }

  startNewGame() {
    this.confirming = false;
    this.perks = { time: 0, combo: 0, special: 0 };
    this.upgradeOpen = false;
    this.upgradeOptions = [];
    this.startLevel(1);
  }

  win() {
    if (this.phase !== PLAY) return;
    this.phase = WON;
    this.drag = null;
    achv.win('slide', { level: this.level, perfect: !this.usedShuffle });
    this.touch = null;
    // 收掉还没闪完的 ghost：棋盘已经清空，继续闪会被结算层盖住
    this.tiles = this.tiles.filter(tile => !tile.popping);
    this.save();
    this.app.audio.playSuccess();
    this.startConfetti();
    this.breakCombo();
  }

  lose() {
    if (this.phase !== PLAY) return;
    this.phase = OVER;
    this.drag = null;
    this.touch = null;
    this.save();
    this.app.audio.playLose();
    this.breakCombo();
  }

  // ---------- 存档 ----------

  save() {
    try {
      const alive = this.tiles.filter(tile => !tile.popping);
      // 最后一对刚消掉、pop 动画还没走完时退出，也要把胜利局面落档，
      // 否则存档会变成「PLAY + 空盘」，restore 会判无效而掉回第 1 关。
      const phase = !alive.length && this.phase === PLAY ? WON : this.phase;
      setRaw(STATE_KEY, JSON.stringify({
        level: this.level,
        phase,
        elapsed: Math.round(this.elapsed * 10) / 10,
        score: this.score,
        maxCombo: this.maxCombo,
        perks: this.perks,
        tiles: alive.map(tile => [tile.kind, tile.r, tile.c, tile.special || '']),
      }));
    } catch (e) { /* 存储不可用时不影响游玩 */ }
  }

  restore() {
    try {
      const raw = getRaw(STATE_KEY, '');
      if (!raw) return null;
      const saved = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!saved || typeof saved !== 'object') return null;
      if (saved.phase !== PLAY && saved.phase !== WON && saved.phase !== OVER) return null;
      if (!Array.isArray(saved.tiles)) return null;
      const lv = Math.max(1, Math.floor(+saved.level) || 1);
      const cfg = logic.levelConfig(lv);
      // 胜利时棋盘是空的（全消完），空盘只对 WON 合法；失败时盘上还剩着牌，照旧要校验。
      if (!saved.tiles.length && saved.phase !== WON) return null;
      if (saved.tiles.length > cfg.rows * cfg.cols) return null;
      const seen = new Set();
      const counts = new Array(cfg.kinds + 1).fill(0);
      const tiles = [];
      for (let i = 0; i < saved.tiles.length; i++) {
        const item = saved.tiles[i];
        if (!Array.isArray(item) || item.length < 3) return null;
        const kind = Math.floor(+item[0]);
        const r = Math.floor(+item[1]);
        const c = Math.floor(+item[2]);
        const special = item[3] === 'clock' || item[3] === 'bomb' || item[3] === 'wild' ? item[3] : '';
        // 种类 / 坐标 / 重复格全部要校验（老存档里混进过 kind = 0 的空位牌）
        if (!(kind >= 1 && kind <= cfg.kinds)) return null;
        if (!(r >= 0 && r < cfg.rows && c >= 0 && c < cfg.cols)) return null;
        const key = r * cfg.cols + c;
        if (seen.has(key)) return null;
        seen.add(key);
        counts[kind] += 1;
        tiles.push({ kind, r, c, special });
      }
      // 每种都成对（张数恒为偶数），否则不是合法局面
      if (tiles.length % 2 !== 0) return null;
      for (let k = 1; k <= cfg.kinds; k++) {
        if (counts[k] % 2 !== 0) return null;
      }
      let phase = saved.phase;
      if (phase === WON && tiles.length) phase = PLAY; // 胜利局面不该还剩牌
      const elapsed = clamp(+saved.elapsed || 0, -UPGRADE_TIME * 20, cfg.seconds);
      if (phase === PLAY && elapsed >= cfg.seconds) phase = OVER; // 存档里的时间已经用尽
      const perks = saved.perks && typeof saved.perks === 'object'
        ? { time: Math.max(0, Math.floor(+saved.perks.time) || 0), combo: Math.max(0, Math.floor(+saved.perks.combo) || 0), special: Math.max(0, Math.floor(+saved.perks.special) || 0) }
        : { time: 0, combo: 0, special: 0 };
      return { level: lv, phase, elapsed, score: Math.max(0, Math.floor(+saved.score) || 0), maxCombo: Math.max(0, Math.floor(+saved.maxCombo) || 0), perks, tiles };
    } catch (e) {
      return null;
    }
  }

  // ---------- 棋盘 / 坐标 ----------

  grid() {
    const g = [];
    for (let r = 0; r < this.rows; r++) g.push(new Array(this.cols).fill(0));
    this.tiles.forEach((tile) => {
      if (!tile.popping && g[tile.r]) g[tile.r][tile.c] = tile.kind;
    });
    return g;
  }

  tileAt(r, c) {
    for (let i = 0; i < this.tiles.length; i++) {
      const tile = this.tiles[i];
      if (tile.r === r && tile.c === c && !tile.popping) return tile;
    }
    return null;
  }

  cellAt(x, y) {
    if (!this.pitch) return null;
    const c = Math.floor((x - this.boardX) / this.pitch);
    const r = Math.floor((y - this.boardY) / this.pitch);
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return null;
    return { r, c };
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
    const availH = Math.max(120, H - this.boardY - reserve);
    const rows = this.conf.rows;
    const cols = this.conf.cols;
    this.gap = GAP;
    this.pitch = Math.max(10, Math.min(this.cw / cols, availH / rows, MAX_CELL));
    this.tile = Math.max(8, this.pitch - this.gap);
    this.boardW = cols * this.pitch;
    this.boardH = rows * this.pitch;
    this.boardX = (W - this.boardW) / 2;
    this.fabSize = fabKit.SIZE;
    this.helpFab = {
      x: W - 16 - this.fabSize,
      y: H - SAFE_BOTTOM - 16 - this.fabSize,
      w: this.fabSize,
      h: this.fabSize,
    };
  }

  // ---------- 更新 ----------

  update(dt) {
    this.now = Date.now();
    const delta = Math.min(50, dt || 16);
    if (this.bg) this.bg.update(delta);
    this.updateParticles(delta);
    if (this.helpOpen || this.confirming || this.upgradeOpen) return; // 弹层打开时冻结计时与判定
    if (this.phase === PLAY) {
      // 消除动画收尾：到期才把 ghost 移出牌堆（逻辑上早就是空格了）
      const expired = this.tiles.some(tile => tile.popping && this.now - tile.popAt >= POP_MS);
      if (expired) {
        this.tiles = this.tiles.filter(tile => !(tile.popping && this.now - tile.popAt >= POP_MS));
        if (!this.tiles.length) {
          this.win();
        } else {
          this.save();
          this.checkDeadlock();
        }
      }
    }
    if (this.phase === PLAY) {
      this.elapsed += delta / 1000;
      if (this.elapsed >= this.conf.seconds) {
        this.elapsed = this.conf.seconds;
        // 最后一对刚消掉、闪烁还没走完就压线：算过关（不能让 320ms 的 ghost 抢走胜利）
        if (!this.tiles.some(tile => !tile.popping)) this.win();
        else this.lose();
      } else if (Math.floor(this.elapsed) !== this.savedSecond) {
        this.savedSecond = Math.floor(this.elapsed);
        this.save();
      }
    }
    if (this.phase === PLAY) {
      if (this.shakeKind && this.now - this.shakeAt >= SHAKE_MS) this.shakeKind = 0;
      if (this.combo && this.comboExpireAt && this.now >= this.comboExpireAt) {
        this.combo = 0;
        this.lastClearAt = 0;
      }
      if (this.deadlockAt && this.now >= this.deadlockAt) {
        this.deadlockAt = 0;
        this.checkDeadlock();
      }
    }
    if (this.now < this.confettiUntil && this.now - this.lastConfettiAt >= 40) {
      this.lastConfettiAt = this.now;
      this.emitConfetti();
    }
  }

  updateParticles(delta) {
    const step = Math.min(50, delta || 16) / 16.67;
    if (this.bursts.length) {
      this.bursts.forEach((p) => {
        p.x += p.vx * step;
        p.y += p.vy * step;
        p.vy += 0.22 * step;
        p.rot += p.vr * step;
        p.age += delta;
      });
      this.bursts = this.bursts.filter(p => p.y < H + 30 && p.age < 1600);
    }
    this.confetti = confetti.update(this.confetti, delta, H);
  }

  // ---------- 消除 / 连击 / 死局 ----------

  tapTile(r, c) {
    if (this.phase !== PLAY || this.helpOpen || this.confirming || this.upgradeOpen) return;
    const tile = this.tileAt(r, c);
    if (!tile) return;
    const partner = this.findPartnerFor(r, c);
    if (partner) {
      this.eliminate([r, c], partner);
      return;
    }
    // 点了但没有同款邻居 → 所有同款一起晃动提示，并算一次无效操作
    this.missCombo();
    this.shakeKind = tile.kind;
    this.shakeAt = Date.now();
  }

  findPartnerFor(r, c) {
    const tile = this.tileAt(r, c);
    if (!tile) return null;
    for (const [dr, dc] of logic.DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      const other = this.tileAt(nr, nc);
      if (!other || other.popping) continue;
      if (tile.special === 'wild' || other.special === 'wild' || other.kind === tile.kind) {
        return [nr, nc];
      }
    }
    return null;
  }

  // 收集「与被移动的那组有关」的所有相邻对；一次滑动可以同时消多对。
  pairsForCells(grid, cells) {
    const used = new Set();
    const pairs = [];
    for (const [r, c] of cells) {
      const key = r * this.cols + c;
      if (used.has(key) || !grid[r] || !grid[r][c]) continue;
      const partner = this.findPartnerFor(r, c);
      if (!partner) continue;
      const pkey = partner[0] * this.cols + partner[1];
      if (used.has(pkey)) continue;
      pairs.push([[r, c], partner]);
      used.add(key);
      used.add(pkey);
    }
    return pairs;
  }

  seedSpecial(kind) {
    const candidates = [];
    this.tiles.forEach((tile) => {
      if (tile.popping || tile.special) return;
      const partner = this.tiles.find(o => o !== tile && !o.popping && o.kind === tile.kind
        && Math.abs(o.r - tile.r) + Math.abs(o.c - tile.c) === 1);
      if (partner && !partner.special) candidates.push(tile);
    });
    if (!candidates.length) return false;
    const tile = candidates[Math.floor(Math.random() * candidates.length)];
    if (kind === 'wild') {
      const partner = this.tiles.find(o => o !== tile && !o.popping && !o.special
        && o.kind === tile.kind && Math.abs(o.r - tile.r) + Math.abs(o.c - tile.c) === 1);
      if (!partner) return false;
      tile.special = 'wild';
      partner.special = 'wild';
      return true;
    }
    tile.special = kind === 'clock' || kind === 'bomb' ? kind : 'clock';
    return true;
  }

  eliminatePairs(pairs) {
    if (!pairs || !pairs.length) return false;
    const now = Date.now();
    const cells = [];
    const seen = new Set();
    const addCell = (tile) => {
      if (!tile || tile.popping) return;
      const key = tile.r * this.cols + tile.c;
      if (seen.has(key)) return;
      seen.add(key);
      cells.push(tile);
    };
    pairs.forEach(([a, b]) => {
      addCell(this.tileAt(a[0], a[1]));
      addCell(this.tileAt(b[0], b[1]));
    });
    let clockBonus = 0;
    // 万能牌：和任意相邻牌配对；同时带走万能牌的另一半和目标牌的另一半，保持偶数可解。
    if (cells.some(tile => tile.special === 'wild')) {
      this.tiles.filter(tile => !tile.popping && tile.special === 'wild').forEach(addCell);
      const normals = cells.filter(tile => tile.special !== 'wild');
      normals.forEach((tile) => {
        const mate = this.tiles.find(o => o !== tile && !o.popping && o.special !== 'wild'
          && o.kind === tile.kind && !seen.has(o.r * this.cols + o.c));
        if (mate) addCell(mate);
      });
    }
    // 炸弹牌：清掉盘面上同一种 emoji 的所有完整对子；只整对移除，保证剩余局面仍可解。
    for (let i = 0; i < cells.length; i += 1) {
      const tile = cells[i];
      if (tile.special === 'clock') clockBonus += 4;
      if (tile.special === 'bomb') {
        const same = this.tiles.filter(o => !o.popping && o.kind === tile.kind);
        same.forEach(addCell);
        this.spawnBombBurst(tile);
      }
    }
    const pairCount = Math.max(1, Math.ceil(cells.length / 2));
    this.registerClear(pairCount);
    if (clockBonus) this.elapsed = Math.max(0, this.elapsed - clockBonus);
    this.app.audio.playElimination();
    cells.forEach((tile) => {
      tile.popping = true;
      tile.popAt = now;
      tile.shuffleAt = 0;
    });
    // 每 8 对左右补一张特殊牌，让中后段持续有新变化。
    this.clearsSinceSpecial = (this.clearsSinceSpecial || 0) + pairCount;
    if (this.clearsSinceSpecial >= 8) {
      this.clearsSinceSpecial = 0;
      this.seedSpecial(Math.random() < 0.3 ? 'wild' : Math.random() < 0.5 ? 'clock' : 'bomb');
    }
    this.shakeKind = 0;
    this.save();
    return true;
  }

  spawnBombBurst(tile) {
    const cx = this.boardX + (tile.c + 0.5) * this.pitch;
    const cy = this.boardY + (tile.r + 0.5) * this.pitch;
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2;
      const v = 2 + Math.random() * 4;
      this.bursts.push({
        x: cx, y: cy,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1,
        vr: (Math.random() - 0.5) * 0.4,
        rot: Math.random() * Math.PI,
        color: i % 2 ? '#ff9d4d' : '#ffd166',
        w: 3 + Math.random() * 4, h: 2 + Math.random() * 3,
        age: 0,
      });
    }
  }

  eliminate(a, b) {
    return this.eliminatePairs([[a, b]]);
  }

  registerClear(pairCount) {
    const now = Date.now();
    const n = Math.max(1, Math.floor(pairCount) || 1);
    const chained = this.lastClearAt > 0 && !this.comboBroken && now - this.lastClearAt < this.comboWindow();
    this.combo = chained ? this.combo + n : n;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.lastClearAt = now;
    this.comboBroken = false;
    this.comboExpireAt = now + this.comboWindow();
    const mult = Math.min(5, this.combo);
    this.score += 10 * n * mult;
    this.scorePulseAt = now;
    // 连击直接买时间；这是玩家愿意追连击的核心奖励。
    const bonus = [0, 0, 0.5, 0.9, 1.3, 1.8][Math.min(5, this.combo)];
    this.comboBonus = bonus;
    if (bonus) this.elapsed = Math.max(0, this.elapsed - bonus);
    if (this.combo >= 2) {
      this.comboAt = now;
      this.comboUntil = now + COMBO_TIP_MS;
      this.app.audio.playFirework();
      this.spawnBurst();
    }
  }

  breakCombo() {
    this.combo = 0;
    this.comboAt = 0;
    this.comboUntil = 0;
    this.comboExpireAt = 0;
    this.lastClearAt = 0;
    this.comboBroken = false;
  }

  // 有一次操作没消掉 → 标记中断（真正清空留给下一次 registerClear / 窗口到期）
  missCombo() {
    if (this.combo) this.comboBroken = true;
  }

  checkDeadlock() {
    if (this.phase !== PLAY) return;
    // 只剩还在闪的 ghost（最后一对）时不算死局，等它闪完直接判胜
    if (!this.tiles.some(tile => !tile.popping)) return;
    if (logic.hasAnyMove(this.grid())) return;
    // 万能牌可以和任意邻居配对，棋盘逻辑不认识这个特殊规则，单独补一条。
    if (this.tiles.some(tile => !tile.popping && tile.special === 'wild' && this.findPartnerFor(tile.r, tile.c))) return;
    this.usedShuffle = true;   // 本关用过死局重排 → 不算「无重排获胜」
    this.applyGrid(logic.reshuffleBoard(this.grid()));
    this.save();
    this.startShuffle();
  }

  // 把一份盘面同步到 tiles 上：
  // - 洗完每张牌原来的格子还都有牌（只换种类）→ 原地换 emoji，保留牌的身份，动画最自然
  // - 否则说明兜底那层挪了位置（只剩最后一对时就是这种）→ 按新盘面重建
  applyGrid(next) {
    const alive = this.tiles.filter(tile => !tile.popping);
    const inPlace = alive.length > 0 && alive.every(tile => next[tile.r] && next[tile.r][tile.c]);
    if (inPlace) {
      alive.forEach((tile) => { tile.kind = next[tile.r][tile.c]; });
      return;
    }
    const ghosts = this.tiles.filter(tile => tile.popping);
    const list = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (next[r][c]) list.push(this.makeTile(next[r][c], r, c));
      }
    }
    this.tiles = list.concat(ghosts);
  }

  startShuffle() {
    const now = Date.now();
    this.shuffleAt = now;
    this.tiles.forEach((tile) => {
      tile.shuffleAt = now + ((tile.r * this.cols + tile.c) % 10) * 22;
    });
  }

  // ---------- 触摸：拖动跟手 + 松手提交 ----------

  onTouchStart(p) {
    if (!p) return;
    this.touch = null;
    this.drag = null;
    if (this.phase !== PLAY || this.helpOpen || this.confirming || this.upgradeOpen) return;
    const at = this.cellAt(p.x, p.y);
    if (!at) return;
    const tile = this.tileAt(at.r, at.c);
    if (!tile) return;
    this.touch = { x: p.x, y: p.y, r: at.r, c: at.c };
  }

  onTouchMove(p) {
    if (!p || !this.touch) return;
    if (this.phase !== PLAY || this.helpOpen || this.confirming || this.upgradeOpen) return;
    const dx = p.x - this.touch.x;
    const dy = p.y - this.touch.y;
    let d = this.drag;
    if (!d) {
      if (Math.hypot(dx, dy) < TAP_SLOP) return;
      // 方向一旦定下来就锁住：这一组 = 自己 + 该方向上紧挨着的连续 emoji
      const axis = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
      const sign = (axis === 'h' ? dx : dy) >= 0 ? 1 : -1;
      const dir = axis === 'h' ? { r: 0, c: sign } : { r: sign, c: 0 };
      const info = logic.slideParams(this.grid(), this.touch.r, this.touch.c, dir.r, dir.c);
      const cells = info ? info.cells : [[this.touch.r, this.touch.c]];
      const group = new Set();
      cells.forEach((cell) => {
        const tile = this.tileAt(cell[0], cell[1]);
        if (tile) group.add(tile.id);
      });
      d = {
        r: this.touch.r,
        c: this.touch.c,
        axis,
        sign,
        dir,
        cells,
        group,
        shift: 0,
        maxShift: info ? info.maxShift : 0,
      };
      this.drag = d;
      this.shakeKind = 0;
    }
    const along = (d.axis === 'h' ? dx : dy) * d.sign;
    d.shift = clamp(along / this.pitch, 0, d.maxShift);
  }

  onTouchEnd(p) {
    const d = this.drag;
    const start = this.touch;
    this.drag = null;
    this.touch = null;
    if (!start) return;
    if (!p || this.phase !== PLAY || this.helpOpen || this.confirming || this.upgradeOpen) return;
    if (!d || !d.axis) {
      this.tapTile(start.r, start.c);
      return;
    }
    const now = Date.now();
    const k = Math.round(d.shift);
    if (k < 1) {
      // 没滑出去一整格：整组从当前手指位置弹回（不是先回原格再播动画）
      this.animateBack(d, now);
      return;
    }
    const nr = d.r + d.dir.r * k;
    const nc = d.c + d.dir.c * k;
    const next = logic.shiftGroup(this.grid(), d.cells, d.dir.r, d.dir.c, k);
    const targetCells = d.cells.map(([r, c]) => [r + d.dir.r * k, c + d.dir.c * k]);
    // 先落位再判断：万能牌要按新位置找邻居，不能拿旧坐标算。
    const snapshot = d.cells
      .map(cell => this.tileAt(cell[0], cell[1]))
      .filter(Boolean)
      .map(tile => ({ tile, r: tile.r, c: tile.c }));
    snapshot.forEach(({ tile }) => {
      tile.r += d.dir.r * k;
      tile.c += d.dir.c * k;
    });
    const pairs = this.pairsForCells(next, targetCells);
    if (!pairs.length) {
      snapshot.forEach(({ tile, r, c }) => { tile.r = r; tile.c = c; });
      this.animateBack(d, now);
      this.missCombo();
      return;
    }
    snapshot.forEach(({ tile, r, c }) => {
      tile.animFrom = { r: r + d.dir.r * d.shift, c: c + d.dir.c * d.shift };
      tile.animAt = now;
    });
    // 落点所属的这组附近，所有相邻同款一起消；一次滑 3 对就是 3 连。
    this.eliminatePairs(pairs);
  }

  animateBack(d, now) {
    d.cells.forEach((cell) => {
      const tile = this.tileAt(cell[0], cell[1]);
      if (!tile) return;
      tile.animFrom = { r: cell[0] + d.dir.r * d.shift, c: cell[1] + d.dir.c * d.shift };
      tile.animAt = now;
    });
  }

  // ---------- 连击烟花 / 胜利礼炮 ----------

  spawnBurst() {
    const cx = W / 2;
    const cy = this.tipY + this.tipH + 26;
    const count = Math.min(44, 12 + this.combo * 4);
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const v = 2.5 + Math.random() * 3.5;
      this.bursts.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 1.5,
        vr: (Math.random() - 0.5) * 0.3,
        rot: Math.random() * Math.PI,
        color: confetti.COLORS[i % confetti.COLORS.length],
        w: 3 + Math.random() * 3,
        h: 2 + Math.random() * 3,
        age: 0,
      });
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

  // ---------- 渲染 ----------

  render(c) {
    this.buttons = [];
    const T = theme.tokens;
    c.fillStyle = T.bg;
    c.fillRect(0, 0, W, H);
    this.bg.draw(c, theme.dark);
    this.drawHeader(c);
    this.drawScore(c);
    this.drawOptions(c);
    this.drawComboTip(c);
    this.drawBoard(c);
    D.text(c, t('slide.boardHint'), W / 2, this.boardY + this.boardH + 14, {
      size: 11.5, color: theme.tokens.muted, align: 'center',
    });
    if (!this.helpOpen && !this.confirming) this.drawFab(c);
    this.drawParticles(c);
    if (this.helpOpen) this.drawHelp(c);
    if (this.confirming) this.drawConfirm(c);
    if (this.upgradeOpen) this.drawUpgrade(c);
  }

  drawHeader(c) {
    const T = theme.tokens;
    D.text(c, t('slide.gameTitle'), W / 2, this.top + this.headerH / 2, {
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
    const urgent = this.phase === PLAY && this.timeLeft <= 15;
    const stats = [
      [t('slide.levelLabel'), String(this.level), false],
      [t('slide.timeLabel'), fmt(this.timeLeft), true],
      [t('slide.score'), String(this.score), false],
    ];
    stats.forEach((stat, i) => {
      const x = this.cx + third * (i + 0.5);
      if (i) D.divider(c, this.cx + third * i, this.scoreY + this.scoreH / 2, 24, T.border, 1);
      D.text(c, stat[0], x, this.scoreY + 24, { size: 11, color: T.muted, align: 'center' });
      if (stat[2]) {
        // 倒计时统一走沙漏
        drawTimer(c, 'hourglass', x, this.scoreY + 48, stat[1], {
          size: 20, color: urgent ? T.del : T.text,
        });
      } else {
        let size = 22;
        if (i === 2 && this.scorePulseAt > 0 && this.now - this.scorePulseAt < 280) {
          size = 22 + 3 * (1 - (this.now - this.scorePulseAt) / 280);
        }
        D.text(c, stat[1], x, this.scoreY + 48, {
          size,
          weight: 'bold',
          color: i === 0 ? T.text : T.primary,
          align: 'center',
        });
      }
    });
    const total = logic.totalPairs(this.conf);
    const progress = total ? (total - this.leftPairs) / total : 0;
    D.progressBar(c, this.cx, this.scoreY, this.cw, this.scoreH, progress, T.border, T.primary);
  }

  drawOptions(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.optY, this.cw, this.optH, T);
    const split = this.cx + this.cw / 2;
    D.divider(c, split, this.optY + this.optH / 2, 24, T.border, 1);
    const note = `${this.rows}×${this.cols} · ${this.conf.kinds} ${t('slide.kindsUnit')}`;
    D.text(c, note, this.cx + (split - this.cx) / 2, this.optY + this.optH / 2, {
      size: 14, color: T.muted, align: 'center',
    });
    const label = t('slide.start');
    const bw = Math.min(120, actionLabel.width(c, label, { size: 13 }));
    const bx = (split + this.cx + this.cw) / 2 - bw / 2;
    const by = this.optY + (this.optH - 32) / 2;
    D.fillRoundRect(c, bx, by, bw, 32, 8, T.primary);
    actionLabel.draw(c, 'gamepad', label, bx + bw / 2, by + 16, { size: 13, color: '#fff' });
    this.addButton('new', bx, by, bw, 32, () => { this.confirming = true; });
  }

  drawComboTip(c) {
    const T = theme.tokens;
    const now = this.now || Date.now();
    if (!(this.combo >= 2 && now < this.comboUntil)) return;
    const text = t('slide.comboTip')
      .replace('{n}', String(this.combo))
      .replace('{s}', (this.comboBonus || 0).toFixed(1));
    const size = this.combo >= 4 ? 16 : this.combo >= 3 ? 14 : 12.5;
    const tw = D.measure(c, text, size, 'bold');
    const w = tw + 24;
    const h = 24;
    const x = W / 2 - w / 2;
    const y = this.tipY + 2;
    const p = clamp((now - this.comboAt) / COMBO_TIP_MS, 0, 1);
    const scale = p < 0.14 ? 0.6 + (p / 0.14) * 0.52
      : p < 0.26 ? 1.12 - ((p - 0.14) / 0.12) * 0.12
        : 1;
    c.save();
    c.globalAlpha = p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1;
    c.translate(W / 2, y + h / 2);
    c.scale(scale, scale);
    c.translate(-W / 2, -(y + h / 2));
    D.fillRoundRect(c, x, y, w, h, 8, T.primary);
    D.text(c, text, W / 2, y + h / 2, { size, weight: 'bold', color: '#fff', align: 'center' });
    c.restore();
  }

  drawBoard(c) {
    const T = theme.tokens;
    const now = this.now || Date.now();
    D.fillRoundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 14, T.boardBg);
    c.save();
    D.roundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 14);
    c.clip();
    // 点阵底纹（web 的 .dot-board）
    c.fillStyle = T.boardDot;
    for (let x = this.boardX + 5; x < this.boardX + this.boardW; x += 10) {
      for (let y = this.boardY + 5; y < this.boardY + this.boardH; y += 10) {
        c.beginPath();
        c.arc(x, y, 1.1, 0, Math.PI * 2);
        c.fill();
      }
    }
    // 绘制顺序：普通 → 消除 ghost → 拖动中的那一组（跟手的最上层）
    const ordered = this.tiles.slice().sort((a, b) => this.layerOf(a) - this.layerOf(b));
    ordered.forEach(tile => this.drawTile(c, tile, now));
    c.restore();
    // 重排提示画在棋盘裁切之外：英文文案比窄棋盘宽，放裁切里会被切掉（web 也在 .board 之外）
    if (this.shuffleAt && now < this.shuffleAt + SHUFFLE_TIP_MS) this.drawShuffleTip(c);
    if (this.phase === WON || this.phase === OVER) this.drawResult(c);
  }

  layerOf(tile) {
    if (this.isDraggingTile(tile)) return 2;
    return tile.popping ? 1 : 0;
  }

  isDraggingTile(tile) {
    return !!(this.drag && this.drag.axis && this.drag.group && this.drag.group.has(tile.id));
  }

  tilePosition(tile, now) {
    let r = tile.r;
    let c = tile.c;
    if (tile.animFrom) {
      const p = clamp((now - tile.animAt) / MOVE_MS, 0, 1);
      const e = easeOut(p);
      r = tile.animFrom.r + (tile.r - tile.animFrom.r) * e;
      c = tile.animFrom.c + (tile.c - tile.animFrom.c) * e;
    }
    const d = this.drag;
    if (d && d.axis && d.shift > 0 && this.isDraggingTile(tile)) {
      r += d.dir.r * d.shift;
      c += d.dir.c * d.shift;
    }
    return { r, c };
  }

  drawTile(c, tile, now) {
    const size = this.tile;
    // 入场还没轮到的牌先不画（错峰出现）
    if (!tile.popping && tile.dealAt && now < tile.dealAt) return;
    const pos = this.tilePosition(tile, now);
    let x = this.boardX + pos.c * this.pitch + (this.pitch - size) / 2;
    let y = this.boardY + pos.r * this.pitch + (this.pitch - size) / 2;
    let scale = 1;
    let alpha = 1;
    let rot = 0;
    if (!tile.popping && tile.dealAt) {
      const p = clamp((now - tile.dealAt) / DEAL_MS, 0, 1);
      if (p < 1) {
        const e = easeOut(p);
        scale *= 0.2 + 0.8 * e;
        alpha *= p;
      }
    }
    if (tile.shuffleAt) {
      const p = clamp((now - tile.shuffleAt) / SHUFFLE_TILE_MS, 0, 1);
      if (p > 0 && p < 1) {
        const motion = shuffleMotion(p);
        scale *= motion.scale;
        rot += motion.rot;
        alpha *= motion.alpha;
      }
    }
    if (this.shakeKind && !tile.popping && tile.kind === this.shakeKind) {
      const motion = shakeMotion(now - this.shakeAt);
      x += motion.dx * size;
      rot += motion.rot;
    }
    if (tile.popping) {
      // 两次明暗循环（与 core/motion 的节奏一致，这里按 320ms 压缩：
      // 滑行里空格必须马上成为通道，1.4s 的 ghost 会盖住可滑位置）
      const p = clamp((now - tile.popAt) / POP_MS, 0, 1);
      const blink = Math.abs(Math.cos(p * Math.PI * 2));
      alpha *= p < 0.55 ? 0.25 + 0.75 * blink : 1 - (p - 0.55) / 0.45;
      scale *= p < 0.35
        ? 1 + 0.16 * (p / 0.35)
        : 1.16 * (1 - 0.9 * ((p - 0.35) / 0.65));
      rot += p < 0.35 ? 0 : (Math.PI / 6) * ((p - 0.35) / 0.65);
    }
    if (scale <= 0.02 || alpha <= 0.01) return;
    c.save();
    c.globalAlpha = clamp(alpha, 0, 1);
    c.translate(x + size / 2, y + size / 2);
    if (rot) c.rotate(rot);
    if (scale !== 1) c.scale(scale, scale);
    // 所有牌面统一走 core/cards 的 MODE_EMOJI；空白格不画卡片
    cards.draw(c, logic.glyphFor(tile.kind), cards.MODE_EMOJI, -size / 2, -size / 2, size, size, true);
    if (tile.special) {
      const clock = tile.special === 'clock';
      const wild = tile.special === 'wild';
      const color = clock ? '#2c6aad' : wild ? '#8b5cf6' : '#d97706';
      D.strokeRoundRect(c, -size / 2, -size / 2, size, size, 8, color, 1.5);
      const br = size * 0.19;
      const bx = size * 0.34;
      const by = -size * 0.34;
      D.circle(c, bx, by, br, color);
      if (!icons.draw(c, clock ? 'timer' : wild ? 'wild' : 'bomb', bx, by, Math.max(8, size * 0.27), '#ffffff')) {
        D.text(c, clock ? 'T' : wild ? 'W' : 'B', bx, by, {
          size: Math.max(8, size * 0.24), weight: 'bold', color: '#fff', align: 'center',
        });
      }
    }
    c.restore();
  }

  drawShuffleTip(c) {
    const T = theme.tokens;
    const text = t('slide.shuffled');
    let size = 14;
    let tw = D.measure(c, text, size, 'bold');
    // 窄屏 + 英文长文案时缩一档，避免超出屏幕
    if (tw + 28 > W - 24) {
      size = 12;
      tw = D.measure(c, text, size, 'bold');
    }
    const w = tw + 28;
    const h = 34;
    const cx = W / 2;
    const cy = this.boardY + this.boardH / 2;
    D.fillRoundRect(c, cx - w / 2, cy - h / 2, w, h, 8, T.card);
    D.strokeRoundRect(c, cx - w / 2, cy - h / 2, w, h, 8, T.border, 1);
    D.text(c, text, cx, cy, { size, weight: 'bold', color: T.text, align: 'center' });
  }

  winStars() {
    let stars = 1;
    if (this.timeLeft >= this.conf.seconds * 0.2) stars += 1;
    if ((this.maxCombo || 0) >= 3) stars += 1;
    return Math.max(1, Math.min(3, stars));
  }

  drawUpgrade(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.50)';
    c.fillRect(0, 0, W, H);
    const w = W - 40;
    const h = 310;
    const x = (W - w) / 2;
    const y = (H - h) / 2;
    D.card(c, x, y, w, h, T);
    D.text(c, t('slide.upgradeTitle'), W / 2, y + 30, {
      size: 17, weight: 'bold', color: T.text, align: 'center',
    });
    D.text(c, t('slide.upgradeHint'), W / 2, y + 52, {
      size: 11, color: T.muted, align: 'center',
    });
    // 全屏遮罩必须先入按钮，三行选项后入（Input 从后往前找）
    this.addButton('upgrade-mask', 0, 0, W, H, () => {});
    const rows = [
      ['time', t('slide.upgradeTime'), t('slide.upgradeTimeDesc')],
      ['combo', t('slide.upgradeCombo'), t('slide.upgradeComboDesc')],
      ['special', t('slide.upgradeSpecial'), t('slide.upgradeSpecialDesc')],
    ];
    rows.forEach(([id, title, desc], i) => {
      const ry = y + 68 + i * 68;
      D.fillRoundRect(c, x + 16, ry, w - 32, 56, 10, T.card);
      D.strokeRoundRect(c, x + 16, ry, w - 32, 56, 10, T.border, 1);
      D.text(c, title, x + 30, ry + 20, { size: 14, weight: 'bold', color: T.text });
      D.text(c, desc, x + 30, ry + 40, { size: 11, color: T.muted });
      const btn = { x: x + w - 58, y: ry + 12, w: 30, h: 32 };
      D.fillRoundRect(c, btn.x, btn.y, btn.w, btn.h, 8, T.primary);
      D.text(c, '+', btn.x + btn.w / 2, btn.y + btn.h / 2, {
        size: 18, weight: 'bold', color: '#fff', align: 'center',
      });
      this.addButton(`upgrade-${id}`, x + 16, ry, w - 32, 56, () => this.applyUpgrade(id));
    });
  }

  drawResult(c) {
    if (!this.resultVisible()) return;
    const T = theme.tokens;
    const win = this.phase === WON;
    const cx = W / 2;
    const cy = this.boardY + this.boardH / 2;
    // 棋盘很窄时（320 宽）两个按钮会超出棋盘：只在放不下时按最小宽度撑开
    const l1 = t('slide.replayLevel');
    const l2 = t('slide.nextLevel');
    const w1 = resultButton.width(c, l1);
    const w2 = resultButton.width(c, l2);
    const gap = 12;
    const minW = Math.min(W - 32, Math.max(w1 + w2 + gap + 28, 96 + 32));
    share.resultPanel(c, this, this.boardY, this.boardH, { w: this.boardW, minW });
    if (win) {
      D.text(c, `🎉 ${t('slide.tipWin')} 🎉`, cx, cy - 30, {
        size: Math.min(18, this.boardW / 14), weight: 'bold', color: T.win, align: 'center',
      });
      D.text(c, `★${'★'.repeat(Math.max(0, this.winStars() - 1))}${'☆'.repeat(3 - this.winStars())}`, cx, cy - 8, {
        size: 18, color: T.god, align: 'center',
      });
      D.text(c, `${t('slide.score')} ${this.score}  ·  ${t('slide.timeUsed')} ${fmt(this.elapsed)}`, cx, cy + 14, {
        size: 14, color: T.win, align: 'center',
      });
      D.text(c, `${t('slide.maxCombo')} ×${Math.min(5, this.maxCombo || 1)}`, cx, cy + 32, {
        size: 12, color: T.muted, align: 'center',
      });
      const by = cy + 52;
      const bx = cx - (w1 + w2 + gap) / 2;
      resultButton.draw(c, this, l1, 'replay', bx, by, { id: 'result-replay', onTap: () => this.replayLevel() });
      resultButton.draw(c, this, l2, 'next', bx + w1 + gap, by, { id: 'result-next', onTap: () => this.nextLevel() });
    } else {
      D.text(c, `⏰ ${t('slide.tipOver')} ⏰`, cx, cy - 26, {
        size: Math.min(20, this.boardW / 12), weight: 'bold', color: T.lose, align: 'center',
      });
      D.text(c, `${t('slide.score')} ${this.score}  ·  ${this.leftPairs} ${t('slide.pairsLeftShort')}`, cx, cy + 4, {
        size: 14, color: T.lose, align: 'center',
      });
      const label = t('slide.replayLevel');
      const bw = resultButton.width(c, label);
      resultButton.draw(c, this, label, 'replay', cx - bw / 2, cy + 36, { id: 'result-replay', onTap: () => this.replayLevel() });
    }
  }

  drawOutlineButton(c, x, y, w, h, label, onTap) {
    const T = theme.tokens;
    D.strokeRoundRect(c, x, y, w, h, 8, T.god, 1);
    D.text(c, label, x + w / 2, y + h / 2, { size: 13, weight: 'bold', color: T.god, align: 'center' });
    this.addButton(`outline-${label}`, x, y, w, h, onTap);
  }

  drawPrimaryButton(c, x, y, w, h, label, onTap) {
    const T = theme.tokens;
    D.fillRoundRect(c, x, y, w, h, 8, T.primary);
    D.text(c, label, x + w / 2, y + h / 2, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton(`primary-${label}`, x, y, w, h, onTap);
  }

  drawFab(c) {
    const T = theme.tokens;
    const r = this.helpFab;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.12)';
    c.shadowBlur = 10;
    c.shadowOffsetY = 2;
    D.circle(c, cx, cy, r.w / 2, T.card);
    fabKit.stroke(c, cx, cy, r.w / 2, fabKit.borderOf('help'));
    c.restore();
    if (!icons.draw(c, 'help', cx, cy, 22, T.text)) {
      D.text(c, '?', cx, cy, { size: 20, weight: 'bold', color: T.text, align: 'center' });
    }
    this.addButton('help', r.x, r.y, r.w, r.h, () => { this.helpOpen = true; });
    fabKit.drawMute(this, c, fabKit.leftSlot(r));
  }

  drawParticles(c) {
    confetti.draw(c, this.confetti.concat(this.bursts));
  }

  drawHelp(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fillRect(0, 0, W, H);
    const x = 18;
    const w = W - 36;
    const lines = [];
    ['helpMsg', 'help1', 'help2', 'help3', 'help4', 'help5'].forEach((key) => {
      const value = t(`slide.${key}`);
      if (value !== `slide.${key}`) {
        lines.push(...D.wrapText(c, value, w - 36, 12));
        lines.push('');
      }
    });
    const lineH = 18;
    const h = Math.min(H - 60, 70 + lines.length * lineH + 54);
    const y = (H - h) / 2;
    D.card(c, x, y, w, h, T);
    D.text(c, '?', x + 22, y + 28, { size: 22, weight: 'bold', color: T.primary });
    D.text(c, t('help'), x + 46, y + 28, { size: 15, weight: 'bold', color: T.text });
    c.save();
    D.roundRect(c, x + 1, y + 1, w - 2, h - 2, 14);
    c.clip();
    let ly = y + 52;
    lines.forEach((line) => {
      if (line) D.text(c, line, x + 18, ly, { size: 12, color: T.text });
      ly += lineH;
    });
    c.restore();
    // 全屏遮罩必须先入按钮，面板按钮后入（Input 从后往前找）
    this.addButton('help-mask', 0, 0, W, H, () => { this.helpOpen = false; });
    const bw = 100;
    const bx = x + (w - bw) / 2;
    const by = y + h - 38;
    D.fillRoundRect(c, bx, by, bw, 28, 8, T.primary);
    D.text(c, t('slide.confirmText'), bx + bw / 2, by + 14, { size: 12, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('help-ok', bx, by, bw, 28, () => { this.helpOpen = false; });
  }

  drawConfirm(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fillRect(0, 0, W, H);
    const w = W - 56;
    const h = 216;
    const x = (W - w) / 2;
    const y = (H - h) / 2;
    D.card(c, x, y, w, h, T);
    D.text(c, t('slide.confirmTitle'), x + 20, y + 34, { size: 17, weight: 'bold', color: T.text });
    const lines = D.wrapText(c, t('slide.confirmMsg'), w - 40, 14);
    lines.forEach((line, i) => D.text(c, line, x + 20, y + 64 + i * 21, { size: 14, color: T.muted }));
    const gap = 10;
    const bw = (w - 40 - gap * 2) / 3;
    const by = y + h - 48;
    // 全屏遮罩先入按钮，面板按钮后入
    this.addButton('confirm-mask', 0, 0, W, H, () => { this.confirming = false; });
    this.drawConfirmButton(c, x + 20, by, bw, 32, t('slide.cancel'), T.border, T.text, () => {
      this.confirming = false;
    }, 'cancel');
    this.drawConfirmButton(c, x + 20 + bw + gap, by, bw, 32, t('slide.confirmReplay'), T.god, T.god, () => {
      this.confirming = false;
      this.replayLevel();
    }, 'replay');
    this.drawConfirmButton(c, x + 20 + (bw + gap) * 2, by, bw, 32, t('slide.confirmOk'), T.primary, '#fff', () => {
      this.startNewGame();
    }, 'ok');
  }

  drawConfirmButton(c, x, y, w, h, label, border, color, onTap, id) {
    D.fillRoundRect(c, x, y, w, h, 8, id === 'ok' ? border : 'rgba(0,0,0,0)');
    if (id !== 'ok') D.strokeRoundRect(c, x, y, w, h, 8, border, 1);
    D.text(c, label, x + w / 2, y + h / 2, { size: 12, weight: 'bold', color, align: 'center' });
    this.addButton(`confirm-${id}`, x, y, w, h, onTap);
  }

  // ---------- 生命周期 ----------

  onHide() {
    this.save();
  }

  onShow() {
    // 计时用 dt 累积，隐藏期间 app 不跑帧，回到前台不会跳秒
  }

  onTheme() {
    this.layout();
  }
}

module.exports = SlideScene;
