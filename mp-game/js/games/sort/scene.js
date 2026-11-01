// Emoji 排序（Emoji Sort）· 微信小游戏 canvas 场景
//
// 玩法：水排序。槽里自下而上堆着水果，开局只有槽口那张正面朝上；点一个槽位把
// 槽口那一摞同种（topRun）整摞抬到槽口上方，再点同一槽放回 / 点另一个槽搬运。
// 目标槽要么槽口同种、要么全空，装不下只搬放得下的张数；落定后源槽新露出的
// 那张才翻面。全部翻正 + 每槽同种 + 非空槽数 = 种类数 即过关；只有「以后再也
// 翻不开新牌」或「全翻开后已经排不出来」才判负。
//
// 纯逻辑（关卡曲线 / 可解发牌 / 死局搜索）在 board.js；本文件只做 canvas 表现、
// 动画编排、触控与存档。所有牌面统一走 core/cards.js 的 MODE_EMOJI，不写私有牌面。
const { W, H, SAFE_BOTTOM } = require('../../core/canvas');
const { Scene } = require('../../core/app');
const theme = require('../../core/theme');
const coreI18n = require('../../core/i18n');
const { t } = coreI18n;
const { getRaw, setRaw, removeRaw } = require('../../core/storage');
const D = require('../../core/draw');
const ParticleField = require('../../core/particles');
const icons = require('../../core/icons');
const cards = require('../../core/cards');
const HEADER = require('../../core/header');
const confetti = require('../../core/confetti');
const fx = require('../../core/fx');
const logic = require('./board');
const i18nDict = require('./i18n');

if (!coreI18n.__sortRegistered) {
  coreI18n.register('sort', i18nDict);
  coreI18n.__sortRegistered = true;
}

const PLAY = 'play';
const WON = 'won';
const OVER = 'over';

// 存档 key 严格沿用 web：mode 1（经典）用不带后缀的 level / state，
// mode 2（紧凑）用 _2；最高关按模式存 best_1 / best_2。
const KEY_PREFIX = '__emoji_sort__';
const MODE_KEY = `${KEY_PREFIX}mode`;

// 水果池：cards.EMOJIS 最前面 8 个（🍎🍌🍇🍉🥝🥭🫐🍒），最多种类数就是它的长度
const FRUITS = cards.EMOJIS.slice(0, 8);

// ---------- 棋盘几何（与 web 同一套口径）----------
const PAD = 8;            // 棋盘内边距
const GAP_X = 5;          // 槽与槽的间距
const GAP_Y = 3;          // 槽内相邻水果的间距
const LIFT_OVERLAP = 0.85; // 抬起的一摞里每张盖住下面那张约 85%
const HEAD_GAP = GAP_Y;    // 抬起后最低那张与槽口之间的小缝
const HEAD_MARGIN = 8;     // 抬起的一摞顶到棋盘上边缘还要留的余量
const MAX_CELL = 46;       // 格子边长上限

// ---------- 动画时长（与 web 对齐）----------
const STAGGER_MS = 22;
const LIFT_MS = 150;
const TRAVEL_MS = 200;
const DROP_MS = 150;
const FLIP_MS = 340;
const FAIL_PAUSE_MS = 500;
const WAVE_MS = 560;
const WAVE_STEP_MS = 75;
const DEAL_STEP_MS = 18;
const DEAL_MS = 300;
// 死局搜索预算：预算用尽按「没死局」处理（宁可不判）
const DEAD_BUDGET = 12000;
// 帮助面板
const HELP_LINE_H = 18;
const HELP_SIZE = 12;

class SortScene extends Scene {
  constructor(app) {
    super(app);
    this.bg = new ParticleField();
    this.mode = this.loadMode();
    this.level = 1;
    this.cfg = logic.levelConfig(1, this.mode);
    this.fruits = [];
    this.hidden = [];
    this.moves = 0;
    this.phase = PLAY;
    this.selected = -1;
    this.autoTarget = -1;
    this.best = 1;
    this.confirming = false;
    this.helpOpen = false;
    this.helpScroll = 0;
    this.helpScrollMax = 0;
    this.helpDrag = null;
    this.helpCache = null;
    this.dealing = false;
    this.dealStart = 0;
    this.dealUntil = 0;
    this.failing = false;
    this.waving = false;
    this.waveStart = 0;
    this.busy = false;
    this.liftUntil = 0;
    this.deferred = null;
    this.generation = 0;
    this.wrong = { slot: -1, start: 0 };
    this.lastFlipAt = 0;
    this.confetti = [];
    this.confettiUntil = 0;
    this.lastConfettiAt = 0;
    this.now = Date.now();
    this._dotCanvas = undefined;
    this.layout();
    this.boot();
  }

  // ---------- 存档 key / 读取 ----------
  get suffix() { return this.mode === 2 ? '_2' : ''; }
  levelKey() { return `${KEY_PREFIX}level${this.suffix}`; }
  stateKey() { return `${KEY_PREFIX}state${this.suffix}`; }
  bestKey() { return `${KEY_PREFIX}best_${this.mode}`; }

  loadMode() {
    return +(getRaw(MODE_KEY, 1) || 1) === 2 ? 2 : 1;
  }
  loadLevel() {
    return Math.max(1, Math.floor(+(getRaw(this.levelKey(), 1) || 1)) || 1);
  }
  loadBest() {
    return Math.max(this.level, Math.floor(+(getRaw(this.bestKey(), 1) || 1)) || 1);
  }

  boot() {
    this.level = this.loadLevel();
    this.best = this.loadBest();
    if (!this.restore()) {
      this.initLevel(this.level);
      return;
    }
    if (this.phase === PLAY) {
      this.startDeal();
      // 存档可能是动画没播完就退出时的局面，补判一次死局
      this.evaluate();
    } else {
      this.save();
    }
  }

  // ---------- 新局 / 恢复 ----------
  initLevel(level) {
    this.clearTransient();
    this.confirming = false;
    this.level = Math.max(1, Math.floor(level) || 1);
    setRaw(this.levelKey(), String(this.level));
    if (this.level > this.best) {
      this.best = this.level;
      setRaw(this.bestKey(), String(this.best));
    }
    this.cfg = logic.levelConfig(this.level, this.mode);
    const plain = logic.generateSolvable(this.cfg);
    this.hidden = plain.map(slot => slot.hidden);
    this.fruits = [];
    let id = 0;
    plain.forEach((slot, slotIndex) => {
      slot.items.forEach((kind, depth) => {
        this.fruits.push(this.newFruit(id++, kind, slotIndex, depth));
      });
    });
    this.moves = 0;
    this.phase = PLAY;
    this.layout();
    this.prepareDeal();
    this.startDeal();
    this.save();
  }

  newFruit(id, kind, slot, depth) {
    return {
      id,
      kind,
      slot,
      depth,
      lift: -1,
      pending: false,
      flipping: false,
      flipStart: 0,
      transit: false,
      x: 0,
      y: 0,
      fx: 0,
      fy: 0,
      tx: NaN,
      ty: NaN,
      dur: 0,
      delay: 0,
      movStart: 0,
      movDur: 0,
      dealOrder: id,
    };
  }

  save() {
    try {
      setRaw(this.stateKey(), JSON.stringify({
        level: this.level,
        mode: this.mode,
        moves: this.moves,
        hidden: this.hidden,
        fruits: this.fruits.map(f => [f.kind, f.slot, f.depth]),
        phase: this.phase,
      }));
    } catch (e) {
      // 存储异常不影响游玩
    }
  }

  restore() {
    try {
      const raw = getRaw(this.stateKey(), '');
      if (!raw) return false;
      const saved = JSON.parse(raw);
      if (!saved || !Array.isArray(saved.fruits) || !saved.fruits.length) return false;
      if (saved.mode && +saved.mode !== this.mode) return false;
      const lv = Math.max(1, Math.floor(+(saved.level || 1)) || 1);
      const cfg = logic.levelConfig(lv, this.mode);
      if (!Array.isArray(saved.hidden) || saved.hidden.length !== cfg.slots) return false;
      if (saved.fruits.length !== cfg.total) return false;

      // 逐槽重建并校验：层数必须从 0 连续、不能重复、每种水果张数必须等于 copies
      const grid = Array.from({ length: cfg.slots }, () => []);
      const counts = new Array(FRUITS.length).fill(0);
      for (const row of saved.fruits) {
        if (!Array.isArray(row) || row.length < 3) return false;
        const kind = +row[0];
        const slot = +row[1];
        const depth = +row[2];
        if (!(kind >= 0 && kind < cfg.kinds)) return false;
        if (!(slot >= 0 && slot < cfg.slots)) return false;
        if (!(depth >= 0 && depth < cfg.capacity)) return false;
        if (grid[slot][depth] !== undefined) return false;
        grid[slot][depth] = kind;
        counts[kind] += 1;
      }
      for (let k = 0; k < cfg.kinds; k++) {
        if (counts[k] !== cfg.copies) return false;
      }
      const hidden = [];
      for (let i = 0; i < cfg.slots; i++) {
        const len = grid[i].length;
        if (len > cfg.capacity) return false;
        for (let d = 0; d < len; d++) {
          if (grid[i][d] === undefined) return false;
        }
        const h = Math.max(0, Math.min(cfg.capacity, saved.hidden[i] | 0));
        if (len ? h > len - 1 : h !== 0) return false;
        hidden.push(len ? h : 0);
      }

      this.clearTransient();
      this.level = lv;
      if (this.level > this.best) this.best = this.level;
      this.cfg = cfg;
      this.hidden = hidden;
      this.moves = Math.max(0, saved.moves | 0);
      this.phase = saved.phase === WON ? WON : saved.phase === OVER ? OVER : PLAY;
      this.fruits = [];
      let id = 0;
      for (let slot = 0; slot < cfg.slots; slot++) {
        for (let depth = 0; depth < grid[slot].length; depth++) {
          this.fruits.push(this.newFruit(id++, grid[slot][depth], slot, depth));
        }
      }
      this.layout();
      this.prepareDeal();
      return true;
    } catch (e) {
      return false;
    }
  }

  nextLevel() { this.initLevel(this.level + 1); }
  replayLevel() { this.confirming = false; this.initLevel(this.level); }

  startNewGame() {
    this.confirming = false;
    removeRaw(this.levelKey());
    removeRaw(this.stateKey());
    removeRaw(this.bestKey());
    this.best = 1;
    this.initLevel(1);
  }

  // 切换玩法：先把当前玩法落档，再按另一种玩法自己的关卡 / 存档接着玩
  toggleMode() {
    this.save();
    this.clearTransient();
    this.mode = this.mode === 1 ? 2 : 1;
    setRaw(MODE_KEY, String(this.mode));
    this.level = this.loadLevel();
    this.best = this.loadBest();
    this.boot();
  }

  // ---------- 动画清理 ----------
  clearTransient() {
    this.generation += 1;
    this.autoTarget = -1;
    this.selected = -1;
    this.deferred = null;
    this.busy = false;
    this.liftUntil = 0;
    this.failing = false;
    this.waving = false;
    this.wrong = { slot: -1, start: 0 };
    this.dealing = false;
    this.dealStart = 0;
    this.dealUntil = 0;
    this.confetti = [];
    this.confettiUntil = 0;
    this.fruits.forEach((f) => {
      f.lift = -1;
      f.pending = false;
      f.flipping = false;
      f.flipStart = 0;
      f.transit = false;
      f.dur = 0;
      f.delay = 0;
      f.movDur = 0;
    });
  }

  // 逐张入场：按槽位行优先（单行 = 从左到右）、槽内自下而上；与 web 的发牌顺序一致。
  // 恢复局面也走这里（requirement：new game / restore 都按左上到右下）。
  prepareDeal() {
    const order = this.fruits.slice().sort((a, b) => a.slot - b.slot || a.depth - b.depth);
    order.forEach((f, i) => { f.dealOrder = i; });
    this.dealStart = this.now;
  }

  startDeal() {
    this.dealStart = this.now;
    this.dealing = this.fruits.length > 0;
    this.dealUntil = this.now + this.fruits.length * DEAL_STEP_MS + DEAL_MS + 60;
  }

  // ---------- 布局 ----------
  layout() {
    const cfg = this.cfg || logic.levelConfig(1, this.mode);
    this.cw = Math.min(W - 32, 440);
    this.cx = (W - this.cw) / 2;
    this.top = HEADER.TOP;
    this.headerH = HEADER.HEIGHT;
    this.homeRect = { ...HEADER.HOME_RECT };
    this.scoreY = this.top + this.headerH + 6;
    this.scoreH = 72;
    this.optY = this.scoreY + this.scoreH + 16;
    this.optH = 72;
    this.boardY = this.optY + this.optH + 16;
    const boardW = this.cw;
    const bottom = SAFE_BOTTOM + 64;              // 给右下角两颗 FAB 留位
    const availH = Math.max(160, H - this.boardY - bottom);

    const slots = cfg.slots;
    const cap = cfg.capacity;
    const overlapStep = 1 - LIFT_OVERLAP;
    // 棋盘折算成「槽 cap 行 + 抬起一摞的空白带」共 rowUnits 行格子来解高度约束
    const rowUnits = 1 + cap + (cap - 1) * overlapStep;
    const fixedH = PAD * 2 + HEAD_GAP + HEAD_MARGIN + (cap - 1) * GAP_Y;
    const cell = Math.max(14, Math.floor(Math.min(
      (boardW - PAD * 2 - GAP_X * (slots - 1)) / slots,
      (availH - fixedH) / rowUnits,
      MAX_CELL,
    )));
    const stepX = cell + GAP_X;
    const stepY = cell + GAP_Y;
    const hoverStep = overlapStep * cell;
    const headH = (cap - 1) * hoverStep + cell + HEAD_GAP + HEAD_MARGIN;
    const groupW = slots * cell + GAP_X * (slots - 1);
    const offsetX = PAD + Math.max(0, (boardW - PAD * 2 - groupW) / 2);
    const slotTop = PAD + headH;
    const slotH = cap * cell + (cap - 1) * GAP_Y;
    const height = PAD * 2 + headH + slotH;

    this.boardX = (W - boardW) / 2;
    this.boardW = boardW;
    this.boardH = height;
    this.metrics = { cell, stepX, stepY, hoverStep, offsetX, slotTop, slotH, headH, height };

    this.helpFab = { x: W - 16 - 40, y: H - SAFE_BOTTOM - 16 - 40, w: 40, h: 40 };
    this.modeFab = { x: W - 16 - 40 - 48, y: this.helpFab.y, w: 40, h: 40 };
    this.helpScroll = Math.min(this.helpScroll, this.helpScrollMax || 0);
    if (this.fruits.length) this.syncPositions();
  }

  // 直接把所有牌放到目标位置（布局变化 / 恢复时用，不播动画）
  syncPositions() {
    this.fruits.forEach((f) => {
      const p = this.targetPos(f);
      f.x = p.x;
      f.y = p.y;
      f.tx = p.x;
      f.ty = p.y;
      f.fx = p.x;
      f.fy = p.y;
      f.movDur = 0;
    });
  }

  targetPos(f) {
    const m = this.metrics;
    const x = this.boardX + m.offsetX + f.slot * m.stepX;
    const y = f.lift >= 0
      ? this.boardY + m.slotTop - HEAD_GAP - m.cell - f.lift * m.hoverStep
      : this.boardY + m.slotTop + (this.cfg.capacity - 1 - f.depth) * m.stepY;
    return { x, y };
  }

  // ---------- 盘面数据（board.js 需要的 { items, hidden } 形态）----------
  piles() {
    const out = Array.from({ length: this.cfg.slots }, () => []);
    this.fruits.forEach((f) => {
      const arr = out[f.slot];
      if (arr) arr[f.depth] = f;
    });
    return out.map((items, i) => ({ items, hidden: this.hidden[i] || 0 }));
  }

  faceUp(f) {
    return !f.pending && f.depth >= (this.hidden[f.slot] || 0);
  }

  runInFlight(i, piles) {
    const pile = piles[i].items;
    const n = logic.topRun(piles[i]);
    const runIds = new Set(pile.slice(pile.length - n).map(f => f.id));
    return this.fruits.some(f => f.transit && (f.slot === i || runIds.has(f.id)));
  }

  // ---------- 更新 ----------
  update(dt) {
    this.now = Date.now();
    if (this.bg) this.bg.update(dt || 16);
    // 帮助 / 二次确认打开时冻结玩法逻辑（PITFALLS 32）
    if (this.helpOpen || this.confirming) return;

    if (this.dealing && this.now >= this.dealUntil) {
      this.dealing = false;
      this.dealStart = 0;
    }
    this.updateTweens();
    this.fruits.forEach((f) => {
      if (f.flipping && this.now - f.flipStart >= FLIP_MS) f.flipping = false;
    });

    if (this.now < this.confettiUntil && this.now - this.lastConfettiAt >= 40) {
      this.lastConfettiAt = this.now;
      this.emitConfetti();
    }
    this.confetti = confetti.update(this.confetti, dt || 16, H);
  }

  updateTweens() {
    this.fruits.forEach((f) => {
      const target = this.targetPos(f);
      if (target.x !== f.tx || target.y !== f.ty) {
        f.fx = f.x;
        f.fy = f.y;
        f.tx = target.x;
        f.ty = target.y;
        if (!f.dur) {
          f.x = target.x;
          f.y = target.y;
          f.movDur = 0;
        } else {
          f.movStart = this.now + (f.delay || 0);
          f.movDur = f.dur;
        }
        f.dur = 0;
        f.delay = 0;
      }
      if (f.movDur && this.now >= f.movStart) {
        const p = Math.min(1, (this.now - f.movStart) / f.movDur);
        const e = 1 - Math.pow(1 - p, 3);
        f.x = f.fx + (f.tx - f.fx) * e;
        f.y = f.fy + (f.ty - f.fy) * e;
        if (p >= 1) f.movDur = 0;
      }
    });
  }

  // ---------- 操作 ----------
  // 抬起随时都能做（上一手搬运还在播也可以抬另一摞）；只有「搬运」本身串行：
  // 动画期间点的目标槽会记进 deferred，等这一手落定后再补做。
  onSlot(i) {
    if (this.phase !== PLAY || this.dealing || this.failing) return;
    if (this.helpOpen || this.confirming) return;
    const piles = this.piles();
    if (this.deferred && (this.deferred.slot === i || this.deferred.to === i)) {
      this.deferred = null;
      return;
    }
    this.deferred = null;
    // 再点一次当前槽位：把抬起的一摞放回去
    if (this.selected === i) {
      this.selected = -1;
      this.dropRun(i);
      return;
    }
    if (this.selected >= 0) {
      const from = this.selected;
      const n = logic.moveCount(piles, from, i, this.cfg.capacity);
      if (n) {
        if (this.busy) {
          this.deferred = { type: 'move', slot: from, to: i };
          return;
        }
        this.performMove(from, i, n);
        return;
      }
      // 放不下 / 不合法：抬起的整摞落回原槽（错误反馈），保持未选中。
      // 不自动改选刚点的槽：那会顺带触发自动搬运，玩家会看到「点错一下反而走了一步」
      this.selected = -1;
      this.dropRun(from);
      this.wrong = { slot: from, start: this.now };
      return;
    }
    if (!piles[i].items.length) return;
    if (this.runInFlight(i, piles)) {
      this.deferred = { type: 'select', slot: i };
      return;
    }
    this.liftRun(i);
  }

  liftRun(i) {
    const piles = this.piles();
    const n = logic.topRun(piles[i]);
    if (!n) return;
    this.autoTarget = -1;
    const pile = piles[i].items;
    const run = pile.slice(pile.length - n);
    run.forEach((f, idx) => {
      // 上一手刚露出来、还在等落定再翻面的那张：玩家直接抓起来了就当场翻
      if (f.pending) this.reveal(f);
      f.lift = idx;
      f.dur = LIFT_MS;
      f.delay = (n - 1 - idx) * STAGGER_MS;   // 最上面那张先出来
    });
    this.selected = i;
    this.liftUntil = this.now + LIFT_MS + (n - 1) * STAGGER_MS;
    // 抬起后如果全场只有这一个槽放得下，就直接搬过去（自动搬运）
    const targets = logic.moveTargets(piles, i, this.cfg.capacity);
    if (targets.length === 1) {
      const { to, count } = targets[0];
      this.autoTarget = to;
      if (this.busy) this.deferred = { type: 'move', slot: i, to };
      else this.performMove(i, to, count);
    }
  }

  dropRun(i) {
    this.autoTarget = -1;
    const run = this.fruits.filter(f => f.slot === i && f.lift >= 0)
      .sort((a, b) => a.lift - b.lift);
    run.forEach((f, idx) => {
      f.lift = -1;
      f.dur = DROP_MS;
      f.delay = idx * STAGGER_MS;
    });
  }

  reveal(f) {
    f.pending = false;
    f.flipping = true;
    f.flipStart = this.now;
    this.lastFlipAt = this.now;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
  }

  // 搬运四段：① 等抬到位 → ② 横向平移到目标槽正上方 → ③ 垂直落进目标槽 →
  // ④ 落定后才把源槽新露出的那张翻面。合法性 / 张数走 board.js 的 moveCount。
  async performMove(from, to, n) {
    if (n <= 0) return;
    const gen = this.generation;
    const piles = this.piles();
    const srcPile = piles[from].items;
    const dstLen = piles[to].items.length;
    const oldLen = srcPile.length;
    const oldHidden = this.hidden[from] || 0;
    const moved = srcPile.slice(oldLen - n);
    const newLen = oldLen - n;
    if (!moved.length) return;

    this.busy = true;
    this.selected = -1;
    moved.forEach((f) => { f.transit = true; });

    const wait = Math.max(0, this.liftUntil - this.now);
    if (wait) await this.sleep(wait);
    if (gen !== this.generation) return;

    // 第二段：横向平移。lift 不动 → top 不变，只改 x
    const liftedRun = this.fruits.filter(f => f.slot === from && f.lift >= 0).length;
    moved.forEach((f, idx) => {
      f.slot = to;
      f.depth = dstLen + idx;
      f.dur = TRAVEL_MS;
      f.delay = (n - 1 - idx) * STAGGER_MS;
    });
    // 目标装不下整摞时只搬得下 n 张，剩下那几张落回原来的槽里
    if (n < liftedRun) this.dropRun(from);

    // 状态（暗牌张数 / 步数 / 存档）在这一刻落定；界面上新露出来的那张先继续
    // 按牌背画（pending），等这一摞落定后再翻
    this.hidden[from] = newLen ? Math.min(oldHidden, newLen - 1) : 0;
    let exposed = null;
    let exposedWasHidden = false;
    if (newLen) {
      exposed = this.fruits.find(f => f.slot === from && f.depth === newLen - 1) || null;
      exposedWasHidden = !!exposed && (newLen - 1) < oldHidden;
      if (exposedWasHidden) exposed.pending = true;
    }
    this.moves += 1;
    this.save();

    await this.sleep(TRAVEL_MS + (n - 1) * STAGGER_MS + 20);
    if (gen !== this.generation) return;

    // 第三段：从目标槽正上方垂直落下
    moved.forEach((f, idx) => {
      f.lift = -1;
      f.dur = DROP_MS;
      f.delay = idx * STAGGER_MS;
    });

    await this.sleep(DROP_MS + (n - 1) * STAGGER_MS + 40);
    if (gen !== this.generation) return;

    moved.forEach((f) => { f.transit = false; });
    // 第四段：落定后才翻开源槽槽口新露出来的那张（搬运途中被抓起来的话已经翻过）
    if (exposedWasHidden && exposed.pending) this.reveal(exposed);

    this.busy = false;
    this.autoTarget = -1;
    const next = this.deferred;
    this.deferred = null;
    this.evaluate();
    if (this.phase !== PLAY || this.failing || !next) return;
    if (next.type === 'select') {
      if (this.piles()[next.slot].items.length) this.liftRun(next.slot);
      return;
    }
    const count = logic.moveCount(this.piles(), next.slot, next.to, this.cfg.capacity);
    if (count) this.performMove(next.slot, next.to, count);
    else if (this.piles()[next.to].items.length) this.liftRun(next.to);
  }

  // 每手落定后判一次：先过关，再判死局
  evaluate() {
    if (this.phase !== PLAY) return;
    const piles = this.piles();
    this.autoTarget = -1;
    if (logic.isWon(piles, this.cfg.copies, this.cfg.kinds)) {
      this.phase = WON;
      this.selected = -1;
      this.save();
      this.startConfetti();
      this.app.audio.playSuccess();
      return;
    }
    if (logic.isDeadEnd(piles, this.cfg, DEAD_BUDGET)) this.failSequence();
  }

  // 失败演出：等刚翻开那张翻完 → 停 0.5s → 每个槽整摞抬起一格再落下
  // （从左到右错峰）→ 全部落定才弹失败层。期间不响应操作。
  async failSequence() {
    if (this.failing || this.phase !== PLAY) return;
    const gen = this.generation;
    this.failing = true;
    this.selected = -1;
    this.autoTarget = -1;
    await this.sleep(Math.max(0, FLIP_MS - (this.now - this.lastFlipAt)));
    if (gen !== this.generation) return;
    await this.sleep(FAIL_PAUSE_MS);
    if (gen !== this.generation) return;
    this.waving = true;
    this.waveStart = this.now;
    await this.sleep(WAVE_MS + WAVE_STEP_MS * (this.cfg.slots - 1) + 60);
    if (gen !== this.generation) return;
    this.waving = false;
    this.failing = false;
    if (this.phase !== PLAY) return;
    this.phase = OVER;
    this.app.audio.playLose();
    this.save();
  }

  startConfetti() {
    this.confetti = [];
    this.confettiUntil = Date.now() + 1200;
    this.lastConfettiAt = 0;
  }
  emitConfetti() {
    confetti.spawn(this.confetti, { W, H, startY: H * 0.58 });
  }

  // ---------- 绘制 ----------
  render(c) {
    this.buttons = [];
    const T = theme.tokens;
    c.fillStyle = T.bg;
    c.fillRect(0, 0, W, H);
    this.bg.draw(c, theme.dark);
    const piles = this.piles();
    this.drawHeader(c, T);
    this.drawScore(c, T, piles);
    this.drawOptions(c, T);
    this.drawBoard(c, T);
    if (!this.helpOpen && !this.confirming) this.drawFabs(c, T);
    confetti.draw(c, this.confetti);
    if (this.helpOpen) this.drawHelp(c, T);
    if (this.confirming) this.drawConfirm(c, T);
  }

  drawHeader(c, T) {
    D.text(c, t('sort.gameTitle'), W / 2, this.top + this.headerH / 2, {
      size: 15, weight: 'bold', color: T.text, align: 'center',
    });
    const h = this.homeRect;
    const hcx = h.x + h.w / 2;
    const hcy = h.y + h.h / 2;
    if (!icons.draw(c, 'home', hcx, hcy, 24, T.text)) {
      D.text(c, '⌂', hcx, hcy, { size: 24, color: T.text, align: 'center' });
    }
    this.addButton('home', h.x, h.y, h.w, h.h, () => this.app.goHome());
  }

  drawScore(c, T, piles) {
    D.card(c, this.cx, this.scoreY, this.cw, this.scoreH, T);
    const third = this.cw / 3;
    D.divider(c, this.cx + third, this.scoreY + this.scoreH / 2, 24, T.border, 1);
    D.divider(c, this.cx + third * 2, this.scoreY + this.scoreH / 2, 24, T.border, 1);
    const done = logic.countDone(piles, this.cfg.copies);
    const midY = this.scoreY + this.scoreH / 2;
    const labelY = midY - 12;
    const valueY = midY + 11;
    D.text(c, t('sort.levelLabel'), this.cx + third * 0.5, labelY, { size: 12, color: T.muted, align: 'center' });
    D.text(c, String(this.level), this.cx + third * 0.5, valueY, { size: 22, weight: 'bold', color: T.text, align: 'center' });
    D.text(c, t('sort.doneLabel'), this.cx + third * 1.5, labelY, { size: 12, color: T.muted, align: 'center' });
    D.text(c, `${done}/${this.cfg.kinds}`, this.cx + third * 1.5, valueY, { size: 22, weight: 'bold', color: T.text, align: 'center' });
    D.text(c, t('sort.movesLabel'), this.cx + third * 2.5, labelY, { size: 12, color: T.muted, align: 'center' });
    D.text(c, String(this.moves), this.cx + third * 2.5, valueY, { size: 22, weight: 'bold', color: T.text, align: 'center' });
    const progress = logic.progressPct(piles, this.cfg.copies) / 100;
    D.progressBar(c, this.cx, this.scoreY, this.cw, this.scoreH, progress, T.border, T.primary);
  }

  drawOptions(c, T) {
    D.card(c, this.cx, this.optY, this.cw, this.optH, T);
    const half = this.cw / 2;
    D.divider(c, this.cx + half, this.optY + this.optH / 2, 24, T.border, 1);
    let label = t('sort.boardLabel')
      .replace('{slots}', this.cfg.slots)
      .replace('{capacity}', this.cfg.capacity)
      .replace('{kinds}', this.cfg.kinds);
    let size = 13;
    if (D.measure(c, label, size, 'bold') > half - 20) size = 11;
    if (D.measure(c, label, size, 'bold') > half - 20) size = 10;
    D.text(c, label, this.cx + half / 2, this.optY + this.optH / 2, {
      size, color: T.muted, align: 'center',
    });

    const startLabel = t('sort.start');
    const bw = Math.min(120, D.measure(c, startLabel, 13, 'bold') + 24);
    const bx = this.cx + half + (half - bw) / 2;
    const by = this.optY + (this.optH - 32) / 2;
    D.fillRoundRect(c, bx, by, bw, 32, 8, T.primary);
    D.text(c, startLabel, bx + bw / 2, by + 16, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('new', bx, by, bw, 32, () => { this.confirming = true; });
  }

  // 棋盘点阵底纹：把 10x10 的点预先画在一块离屏 canvas 上做 pattern，
  // 避免每帧画上千个 arc（真实点色跟随主题 T.boardDot）。
  dotCanvas(T) {
    const color = (T && T.boardDot) || 'rgba(255,255,255,0.18)';
    if (this._dotCanvas !== undefined && this._dotKey === color) return this._dotCanvas;
    this._dotCanvas = null;
    this._dotKey = color;
    try {
      if (wx.createCanvas) {
        const pc = wx.createCanvas();
        if (pc && pc !== require('../../core/canvas').canvas) {
          pc.width = 10;
          pc.height = 10;
          const pctx = pc.getContext('2d');
          pctx.fillStyle = color;
          pctx.beginPath();
          pctx.arc(5, 5, 1.1, 0, Math.PI * 2);
          pctx.fill();
          this._dotCanvas = pc;
        }
      }
    } catch (e) {
      this._dotCanvas = null;
    }
    return this._dotCanvas;
  }

  drawBoardBg(c, T) {
    const x = this.boardX;
    const y = this.boardY;
    const w = this.boardW;
    const h = this.boardH;
    D.fillRoundRect(c, x, y, w, h, 14, T.boardBg);
    c.save();
    D.roundRect(c, x, y, w, h, 14);
    c.clip();
    const dot = this.dotCanvas(T);
    let painted = false;
    if (dot && c.createPattern) {
      try {
        const pattern = c.createPattern(dot, 'repeat');
        if (pattern) {
          c.fillStyle = pattern;
          c.fillRect(x, y, w, h);
          painted = true;
        }
      } catch (e) {
        painted = false;
      }
    }
    if (!painted) {
      // 拿不到第二块 canvas 时用稀疏点阵降级
      c.fillStyle = T.boardDot;
      for (let yy = y + 6; yy < y + h; yy += 14) {
        for (let xx = x + 6; xx < x + w; xx += 14) {
          c.beginPath();
          c.arc(xx, yy, 1.1, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
    c.restore();
  }

  drawBoard(c, T) {
    this.drawBoardBg(c, T);
    this.drawSlots(c, T);
    this.drawCards(c, T);
    if (this.phase === WON) this.drawResult(c, T, true);
    else if (this.phase === OVER) this.drawResult(c, T, false);
    // 点击热区：整列（含槽口上方的空白带 + 槽缝）都可点，压在牌之上
    if (this.phase === PLAY && !this.dealing && !this.failing) {
      const m = this.metrics;
      for (let i = 0; i < this.cfg.slots; i++) {
        const x = this.boardX + m.offsetX + i * m.stepX - GAP_X / 2;
        const y = this.boardY + PAD;
        const w = m.cell + GAP_X;
        const h = this.boardH - PAD;
        this.addButton(`tube-${i}`, x, y, w, h, () => this.onSlot(i));
      }
    }
  }

  drawSlots(c, T) {
    const m = this.metrics;
    // 一次算出所有可放置目标，避免每个槽都重建一遍盘面
    const targets = this.selected >= 0
      ? logic.moveTargets(this.piles(), this.selected, this.cfg.capacity)
      : [];
    const targetSet = new Set(targets.map(t => t.to));
    for (let i = 0; i < this.cfg.slots; i++) {
      const x = this.boardX + m.offsetX + i * m.stepX;
      const y = this.boardY + m.slotTop;
      const selected = this.selected === i;
      const ready = this.autoTarget === i || targetSet.has(i);
      D.fillRoundRect(c, x, y, m.cell, m.slotH, 8,
        ready ? T.enter : 'rgba(255,255,255,0.12)');
      c.save();
      if (c.setLineDash) c.setLineDash([4, 3]);
      D.strokeRoundRect(c, x, y, m.cell, m.slotH, 8,
        selected || ready ? T.primary : T.tileBorder, selected ? 2 : 1);
      c.restore();
      if (selected) {
        c.save();
        c.globalAlpha = 0.35;
        D.strokeRoundRect(c, x - 3, y - 3, m.cell + 6, m.slotH + 6, 10, T.primary, 2);
        c.restore();
      }
    }
  }

  wrongOffset(slot) {
    if (!this.wrong || this.wrong.slot !== slot) return 0;
    return fx.wrongShake(this.now - this.wrong.start, 320, 4);
  }

  waveOffset(slot) {
    if (!this.waving) return 0;
    const t0 = (this.now - this.waveStart - slot * WAVE_STEP_MS) / WAVE_MS;
    if (t0 <= 0 || t0 >= 1) return 0;
    return -this.metrics.stepY * Math.sin(Math.PI * t0);
  }

  dealProgress(f) {
    if (!this.dealing || !this.dealStart) return 1;
    const start = this.dealStart + (f.dealOrder || 0) * DEAL_STEP_MS;
    return Math.max(0, Math.min(1, (this.now - start) / DEAL_MS));
  }

  drawCards(c, T) {
    const cell = this.metrics.cell;
    // 槽里的牌 → 抬起的牌（被抬 / 搬运途中的按层数压在上面）
    const list = this.fruits.slice().sort((a, b) => {
      const za = a.lift >= 0 || a.transit ? 30 + a.depth : 1;
      const zb = b.lift >= 0 || b.transit ? 30 + b.depth : 1;
      return za - zb;
    });
    list.forEach((f) => {
      const p = this.dealProgress(f);
      if (p <= 0) return;
      const face = this.faceUp(f);
      let scaleX = 1;
      if (f.flipping) {
        const fp = Math.min(1, (this.now - f.flipStart) / FLIP_MS);
        scaleX = Math.max(0.06, Math.abs(Math.cos(Math.PI * fp)));
      }
      const grow = this.dealing ? 0.4 + 0.6 * (1 - Math.pow(1 - p, 3)) : 1;
      const alpha = this.dealing ? p : 1;
      const dx = this.wrongOffset(f.slot);
      const dy = this.waveOffset(f.slot);
      c.save();
      c.globalAlpha = alpha;
      c.translate(f.x + dx + cell / 2, f.y + dy + cell / 2);
      c.scale(scaleX * grow, grow);
      cards.draw(c, face ? FRUITS[f.kind] : null, cards.MODE_EMOJI,
        -cell / 2, -cell / 2, cell, cell, face, 'sort', '🧪');
      c.restore();
      if (this.selected >= 0 && this.selected === f.slot && f.lift >= 0) {
        D.strokeRoundRect(c, f.x + dx + 1, f.y + dy + 1, cell - 2, cell - 2, 8, T.primary, 2);
      }
    });
  }

  drawResult(c, T, win) {
    if (!this.resultVisible()) return;
    const x = this.boardX;
    const y = this.boardY;
    const w = this.boardW;
    const h = this.boardH;
    // 遮罩先加：面板按钮后加才不会被吞掉
    this.addButton('result-mask', x, y, w, h, () => {});
    D.fillRoundRect(c, x, y, w, h, 14, T.overlay);
    const cx = W / 2;
    const cy = y + h / 2;
    const bw = 118;
    const gap = 12;
    const bx = cx - bw - gap / 2;
    if (win) {
      D.text(c, `🎉🎉 ${t('sort.levelDone').replace('{n}', this.level)} 🎉🎉`, cx, cy - 44, {
        size: 18, weight: 'bold', color: T.win, align: 'center',
      });
      D.text(c, t('sort.movesDone').replace('{n}', this.moves), cx, cy - 10, {
        size: 22, weight: 'bold', color: T.text, align: 'center',
      });
      this.resultButton(c, T, bx, cy + 22, bw, 34, t('sort.replayLevel'), false, () => this.replayLevel());
      this.resultButton(c, T, bx + bw + gap, cy + 22, bw, 34, t('sort.nextLevel'), true, () => this.nextLevel());
    } else {
      D.text(c, `🚧 ${t('sort.stuckTitle')} 🚧`, cx, cy - 44, {
        size: 18, weight: 'bold', color: T.lose, align: 'center',
      });
      const done = logic.countDone(this.piles(), this.cfg.copies);
      D.text(c, t('sort.stuckNote').replace('{n}', done), cx, cy - 10, {
        size: 14, color: T.muted, align: 'center',
      });
      this.resultButton(c, T, bx, cy + 18, bw, 34, t('sort.replayLevel'), false, () => this.replayLevel());
      this.resultButton(c, T, bx + bw + gap, cy + 18, bw, 34, t('sort.start'), true, () => { this.confirming = true; });
    }
  }

  resultButton(c, T, x, y, w, h, label, primary, onTap) {
    if (primary) {
      D.fillRoundRect(c, x, y, w, h, 8, T.primary);
      D.text(c, label, x + w / 2, y + h / 2, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    } else {
      // 「重玩本关」= 橙色描边按钮（透明底 + 橙字 + 1px 橙边），与全局规范一致
      D.strokeRoundRect(c, x, y, w, h, 8, T.god, 1);
      D.text(c, label, x + w / 2, y + h / 2, { size: 13, weight: 'bold', color: T.god, align: 'center' });
    }
    this.addButton(`result-${label}`, x, y, w, h, onTap);
  }

  // ---------- FAB ----------
  drawFabs(c, T) {
    const fab = (rect, onTap, id, paint) => {
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.12)';
      c.shadowBlur = 10;
      c.shadowOffsetY = 2;
      D.circle(c, rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, T.card);
      c.restore();
      paint(rect.x + rect.w / 2, rect.y + rect.h / 2);
      this.addButton(id, rect.x, rect.y, rect.w, rect.h, onTap);
    };
    fab(this.helpFab, () => { this.helpOpen = true; this.helpScroll = 0; }, 'help', (cx, cy) => {
      if (!icons.draw(c, 'help', cx, cy, 20, T.text)) {
        D.text(c, '?', cx, cy, { size: 18, color: T.text, align: 'center' });
      }
    });
    // 模式 FAB：icon font 里没有 test-tube glyph，且玩法差异是「空槽数」，
    // 所以这里画矢量试管本身当指示器（经典 2 根 / 紧凑 1 根），而不是复用首页的 sort 图标。
    fab(this.modeFab, () => this.toggleMode(), 'mode', (cx, cy) => {
      this.drawModeIcon(c, cx, cy, T.primary);
    });
  }

  // 经典 = 两个空槽（画两根试管），紧凑 = 一个空槽（画一根）
  drawModeIcon(c, cx, cy, color) {
    const tubes = this.mode === 1 ? [-6, 6] : [0];
    c.save();
    c.strokeStyle = color;
    c.lineWidth = 1.6;
    tubes.forEach((dx) => {
      const w = 7;
      const h = 14;
      const x = cx + dx - w / 2;
      const y = cy - h / 2;
      const r = w / 2;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x, y + h - r);
      c.arcTo(x, y + h, x + r, y + h, r);
      c.arcTo(x + w, y + h, x + w, y + h - r, r);
      c.lineTo(x + w, y);
      c.stroke();
      // 底部一小段液体
      c.save();
      c.beginPath();
      c.rect(x + 1, y + h - 5, w - 2, 4);
      c.clip();
      c.fillStyle = color;
      c.fillRect(x + 1, y + h - 5, w - 2, 4);
      c.restore();
    });
    c.restore();
  }

  // ---------- 帮助（内容较长，面板内可上下拖动）----------
  helpLines(c) {
    const key = `${coreI18n.lang}|${W}|${H}`;
    if (this.helpCache && this.helpCache.key === key) return this.helpCache.lines;
    const w = W - 40;
    const lines = [];
    ['helpMsg', 'help1', 'help2', 'help3', 'help4', 'help5', 'help6', 'help7', 'help8', 'help9'].forEach((k) => {
      const value = t(`sort.${k}`);
      if (value !== `sort.${k}`) {
        lines.push(...D.wrapText(c, value, w - 40, HELP_SIZE));
        lines.push('');
      }
    });
    this.helpCache = { key, lines };
    return lines;
  }

  drawHelp(c, T) {
    const x = 20;
    const w = W - 40;
    const lines = this.helpLines(c);
    const panelH = Math.min(H - 60, 68 + lines.length * HELP_LINE_H + 54);
    const y = (H - panelH) / 2;
    const contentTop = y + 52;
    const contentH = panelH - 52 - 48;
    this.helpScrollMax = Math.max(0, lines.length * HELP_LINE_H + 4 - contentH);
    this.helpScroll = Math.max(0, Math.min(this.helpScrollMax, this.helpScroll));

    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fillRect(0, 0, W, H);
    D.card(c, x, y, w, panelH, T);
    D.text(c, '?', x + 22, y + 27, { size: 22, weight: 'bold', color: T.primary });
    D.text(c, t('help'), x + 46, y + 27, { size: 15, weight: 'bold', color: T.text });

    c.save();
    c.beginPath();
    c.rect(x + 1, contentTop - 4, w - 2, contentH + 8);
    c.clip();
    let ly = contentTop + 6 - this.helpScroll;
    lines.forEach((line) => {
      if (line) D.text(c, line, x + 18, ly, { size: HELP_SIZE, color: T.text });
      ly += HELP_LINE_H;
    });
    c.restore();

    if (this.helpScrollMax > 0) {
      const trackY = contentTop;
      const trackH = contentH;
      const thumbH = Math.max(24, trackH * (trackH / (trackH + this.helpScrollMax)));
      const maxScroll = this.helpScrollMax;
      const thumbY = trackY + (trackH - thumbH) * (maxScroll ? this.helpScroll / maxScroll : 0);
      D.fillRoundRect(c, x + w - 12, trackY, 3, trackH, 2, T.border);
      D.fillRoundRect(c, x + w - 12, thumbY, 3, thumbH, 2, T.muted);
    }

    this.addButton('help-mask', 0, 0, W, H, () => { this.helpOpen = false; });
    const bw = 108;
    const bx = x + (w - bw) / 2;
    const by = y + panelH - 40;
    D.fillRoundRect(c, bx, by, bw, 30, 8, T.primary);
    D.text(c, t('sort.confirmText'), bx + bw / 2, by + 15, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('help-ok', bx, by, bw, 30, () => { this.helpOpen = false; });
  }

  // 帮助面板拖动滚动（小游戏没有滚动容器）
  onTouchStart(p) {
    if (!this.helpOpen || !p) return;
    this.helpDrag = { y: p.y, base: this.helpScroll };
  }

  onTouchMove(p) {
    if (!this.helpDrag || !p) return;
    const dy = p.y - this.helpDrag.y;
    this.helpScroll = Math.max(0, Math.min(this.helpScrollMax, this.helpDrag.base - dy));
  }

  onTouchEnd() {
    this.helpDrag = null;
  }

  // ---------- 二次确认（新游戏：取消 / 重玩本关 / 确定重来）----------
  drawConfirm(c, T) {
    const w = Math.min(W - 48, 320);
    const msg = t('sort.confirmMsg');
    const msgLines = D.wrapText(c, msg, w - 40, 13);
    const h = 24 + 26 + 8 + msgLines.length * 19 + 16 + 34 + 20;
    const x = (W - w) / 2;
    const y = (H - h) / 2;
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fillRect(0, 0, W, H);
    D.card(c, x, y, w, h, T);
    D.text(c, t('sort.confirmTitle'), x + 20, y + 30, { size: 17, weight: 'bold', color: T.text });
    let ly = y + 56;
    msgLines.forEach((line) => {
      D.text(c, line, x + 20, ly, { size: 13, color: T.muted });
      ly += 19;
    });

    const gap = 8;
    const bw = (w - 40 - gap * 2) / 3;
    const by = y + h - 50;
    this.addButton('confirm-mask', 0, 0, W, H, () => { this.confirming = false; });
    // 取消
    D.fillRoundRect(c, x + 20, by, bw, 34, 8, T.enter);
    D.text(c, t('sort.cancel'), x + 20 + bw / 2, by + 17, { size: 12, weight: 'bold', color: T.text, align: 'center' });
    this.addButton('confirm-cancel', x + 20, by, bw, 34, () => { this.confirming = false; });
    // 重玩本关（橙色描边）
    const rx = x + 20 + bw + gap;
    D.strokeRoundRect(c, rx, by, bw, 34, 8, T.god, 1);
    D.text(c, t('sort.replayLevel'), rx + bw / 2, by + 17, { size: 12, weight: 'bold', color: T.god, align: 'center' });
    this.addButton('confirm-replay', rx, by, bw, 34, () => this.replayLevel());
    // 确定重来
    const ox = rx + bw + gap;
    D.fillRoundRect(c, ox, by, bw, 34, 8, T.primary);
    D.text(c, t('sort.confirmOk'), ox + bw / 2, by + 17, { size: 12, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('confirm-ok', ox, by, bw, 34, () => this.startNewGame());
  }

  onTheme() { this.layout(); }
  onHide() { this.save(); }
  onShow() {}
}

module.exports = SortScene;
