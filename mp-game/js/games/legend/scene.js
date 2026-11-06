// 麻将传奇 · 微信小游戏 canvas 场景。
// 玩法 / 数值 / 存档 key 与 web `src/games/legend/` 对齐：纯逻辑在 ./board.js（可直接 require 做单测），
// 这里只负责布局、绘制、输入、动画与存档。牌面统一走 core/cards.js 的 MODE_MAHJONG
// （条牌 s1..s9 / 字牌 z1..z7 / 花牌 f1..f8 都在 core/tiles.js 的雪碧图槽位里），
// 本文件不写任何私有牌面绘制。
const { W, H, SAFE_BOTTOM } = require('../../core/canvas');
const { Scene } = require('../../core/app');
const theme = require('../../core/theme');
const { t } = require('../../core/i18n');
const { getRaw, setRaw } = require('../../core/storage');
const D = require('../../core/draw');
const ParticleField = require('../../core/particles');
const icons = require('../../core/icons');
const achv = require('../../core/achv');
const fabKit = require('../../core/fab');
const cards = require('../../core/cards');
const tiles = require('../../core/tiles');
const HEADER = require('../../core/header');
const confetti = require('../../core/confetti');
const fx = require('../../core/fx');
const logic = require('./board');
const i18nDict = require('./i18n');

const coreI18n = require('../../core/i18n');
if (!coreI18n.__legendRegistered) {
  coreI18n.register('legend', i18nDict);
  coreI18n.__legendRegistered = true;
}

// 存档 key 严格沿用 web（麻将传奇）：局面 / 最高分。
// （web 的 __mahjong_legend__help_showed 是「首次自动弹帮助」的标记；小游戏其它场景都
//  不自动弹帮助，这里保持一致，帮助只从右下角 FAB 打开，因此不读写这个 key。）
const STATE_KEY = '__mahjong_legend__state';
const BEST_KEY = '__mahjong_legend__best_1';

const PLAY = 'play';
const OVER = 'over';

// ---------- 动画时长（与 board.js 的 CLEAR_MS / FALL_MS / SPAWN_MS 对齐） ----------
const DROP_MS = 210;          // 浮牌从候选区落到格子里
const CLEAR_MS = logic.CLEAR_MS;      // 第一段消除闪烁 520ms
const CHAIN_CLEAR_MS = 340;   // 连击的第二段起缩短，避免一串连消把输入按住太久
const FALL_MS = logic.FALL_MS;        // 悬空牌下落
const SPAWN_MS = logic.SPAWN_MS;      // 新一行从棋盘下方升起
const LAND_MS = 450;          // 落点 pop 一下（复用 core/fx.popScale）
const DEAL_STEP = 34;         // 入场逐张错峰（行优先）
const DEAL_MS = 300;
const SHAKE_MS = 340;
const GLOW_MS = 900;
const POP_MS = 1000;          // 得分浮字
const RESULT_DELAY = 300;     // 结算层至少等 250ms（PITFALLS #57）
const LEVEL_FLASH_MS = 800;
const FAB_SIZE = 40;

const PREVIEW_SCALES = [0.8, 0.6];   // 后两张：第二张 0.8、第三张 0.6（与 web 一致）

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
const readInt = (key, dflt) => {
  const v = Number(getRaw(key, dflt));
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : dflt;
};

// 消除闪烁：两次「亮 → 暗」再淡出（采样自 web 的 blink-clear 关键帧）
function blinkAlpha(p) {
  if (p < 0.16) return 1 - (0.88 * p) / 0.16;
  if (p < 0.32) return 0.12 + 0.88 * ((p - 0.16) / 0.16);
  if (p < 0.5) return 1 - 0.88 * ((p - 0.32) / 0.18);
  if (p < 0.66) return 0.12 + 0.88 * ((p - 0.5) / 0.16);
  if (p < 0.82) return 1;
  return Math.max(0, 1 - (p - 0.82) / 0.18);
}

class LegendScene extends Scene {
  constructor(app) {
    super(app);
    this.bg = new ParticleField();

    // ---------- 局面 ----------
    this.grid = logic.emptyGrid();
    this.queue = [];               // [当前, 下一张, 下下一张]
    this.score = 0;
    this.cleared = 0;
    this.maxChain = 0;             // 本局最高连击（统计卡最后一格）
    this.level = 1;
    this.best = readInt(BEST_KEY, 0);
    this.beatBest = false;
    this.phase = PLAY;
    this.helpOpen = false;

    // ---------- 动画 / 流程状态（全部由场景时钟推进，帮助打开时冻结） ----------
    this.clock = 0;
    this.now = 0;
    this.clearSeq = 0;             // 每消一次 +1，用于判断「这一手到底消没消」
    this.activeTurn = null;        // 正在结算的那一手
    this.pendingTurns = [];        // 消除动画期间也能落子：先记下来，随后逐手结算
    this.drops = [];               // 落子浮牌 { id, v, at, dur, from, to }
    this.ghosts = [];              // 被消掉的浮影（棋盘上已经置空）
    this.falls = [];               // 消除后下落的位移 { id, dy, at }
    this.landing = null;           // 刚落地的牌（pop 一下）
    this.rise = null;              // 升行动画 { at, dur, overflow, pushed }
    this.celebrate = null;         // 得分浮字
    this.flashCell = -1;           // 刚点过的格子
    this.flashAt = -1e9;
    this.shakeAt = -SHAKE_MS - 1;
    this.glowAt = -GLOW_MS - 1;
    this.levelFlashAt = -LEVEL_FLASH_MS - 1;
    this.dealStart = 0;
    this.dealDur = 0;
    this.dealRanks = new Map();
    this.overflowAt = 0;           // 溢出后的收尾延时（这期间不再收操作）
    this.confetti = [];

    this.layout();
    tiles.preload();

    if (!this.restore()) this.startNewRun();
  }

  // ---------- 派生 ----------
  get canPlay() {
    return this.phase === PLAY && !this.helpOpen && !this.overflowAt;
  }
  drawKind() {
    return logic.randomKind(Math.random, logic.honorRateAt(this.level));
  }
  findTile(id) {
    for (let r = 0; r < logic.ROWS; r++) {
      for (let c = 0; c < logic.COLS; c++) {
        const tile = this.grid[r][c];
        if (tile && tile.id === id) return r * logic.COLS + c;
      }
    }
    return -1;
  }
  tileAt(idx) {
    if (idx < 0 || idx >= logic.CELLS) return null;
    return this.grid[Math.floor(idx / logic.COLS)][idx % logic.COLS];
  }

  // ---------- 新局 ----------
  startNewRun() {
    this.phase = PLAY;
    this.helpOpen = false;
    this.score = 0;
    this.cleared = 0;
    this.maxChain = 0;
    this.level = 1;
    this.beatBest = false;
    this.clearSeq = 0;
    this.activeTurn = null;
    this.pendingTurns = [];
    this.drops = [];
    this.ghosts = [];
    this.falls = [];
    this.landing = null;
    this.rise = null;
    this.celebrate = null;
    this.flashCell = -1;
    this.flashAt = -1e9;
    this.shakeAt = -SHAKE_MS - 1;
    this.glowAt = -GLOW_MS - 1;
    this.levelFlashAt = -LEVEL_FLASH_MS - 1;
    this.overflowAt = 0;
    this.confetti = [];
    logic.resetUid();
    this.grid = logic.initialGrid().grid;
    this.queue = [];
    for (let i = 0; i < 1 + logic.PREVIEW; i++) this.queue.push(this.drawKind());
    this.startDeal();
    this.save();
  }

  // ---------- 存档 ----------
  save() {
    try {
      setRaw(STATE_KEY, JSON.stringify({
        phase: this.phase,
        score: this.score,
        cleared: this.cleared,
        combo: this.maxChain,
        queue: this.queue.slice(0, 1 + logic.PREVIEW),
        // grid 只存点数，恢复时重新分配 id（与 web 一致）
        grid: this.grid.map(row => row.map(tile => (tile ? tile.v : null))),
      }));
    } catch (e) { /* 存储满 / 隐私限制不影响游玩 */ }
  }

  restore() {
    try {
      const raw = getRaw(STATE_KEY, '');
      if (!raw) return false;
      const saved = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!saved || !Array.isArray(saved.grid) || saved.grid.length !== logic.ROWS) return false;
      if (saved.phase !== PLAY && saved.phase !== OVER) return false;
      const values = [];
      for (let r = 0; r < logic.ROWS; r++) {
        const row = saved.grid[r];
        if (!Array.isArray(row) || row.length !== logic.COLS) return false;
        for (let c = 0; c < logic.COLS; c++) {
          const cell = row[c];
          if (cell == null) { values.push(null); continue; }
          const n = Number(cell);
          if (!Number.isInteger(n) || n < 1 || n > logic.MAX_VALUE) return false;
          values.push(n);
        }
      }
      logic.resetUid();
      const grid = logic.emptyGrid();
      for (let r = 0; r < logic.ROWS; r++) {
        for (let c = 0; c < logic.COLS; c++) {
          const v = values[r * logic.COLS + c];
          if (v != null) grid[r][c] = logic.makeTile(v);
        }
      }
      // 存档可能停在「已消掉、还没下落」的中间帧：恢复时静默按重力落定。
      this.grid = logic.settle(grid);
      const queue = (Array.isArray(saved.queue) ? saved.queue : [])
        .map(Number)
        .filter(n => Number.isInteger(n) && n >= 1 && n <= logic.MAX_VALUE)
        .slice(0, 1 + logic.PREVIEW);
      this.queue = queue;
      this.score = Math.max(0, Math.floor(+saved.score) || 0);
      this.cleared = Math.max(0, Math.floor(+saved.cleared) || 0);
      this.maxChain = Math.max(0, Math.floor(+saved.combo) || 0);
      this.level = logic.levelOf(this.score);
      if (this.score > this.best) {
        this.best = this.score;
        setRaw(BEST_KEY, String(this.best));
      }
      while (this.queue.length < 1 + logic.PREVIEW) this.queue.push(this.drawKind());
      this.phase = saved.phase === OVER ? OVER : PLAY;
      this.beatBest = false;
      this.clearSeq = 0;
      this.activeTurn = null;
      this.pendingTurns = [];
      this.drops = [];
      this.ghosts = [];
      this.falls = [];
      this.landing = null;
      this.rise = null;
      this.celebrate = null;
      this.flashCell = -1;
      this.flashAt = -1e9;
      this.shakeAt = -SHAKE_MS - 1;
      this.glowAt = -GLOW_MS - 1;
      this.levelFlashAt = -LEVEL_FLASH_MS - 1;
      this.overflowAt = 0;
      this.confetti = [];
      this.helpOpen = false;
      this.layout();      // 恢复后必须重新布局（PITFALLS #9）
      this.startDeal();   // 恢复的局面也按「左上 → 右下」逐张铺开
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- 入场（行优先，左上 → 右下） ----------
  startDeal() {
    // 时钟从 0 起步，而 0 是「没有入场动画」的哨兵：首局要写 max(1, clock)
    this.dealStart = Math.max(1, this.clock);
    this.dealRanks = new Map();
    let rank = 0;
    // 行优先 index = row * COLS + col（PITFALLS #40：不要用 row+col 斜线）
    for (let r = 0; r < logic.ROWS; r++) {
      for (let c = 0; c < logic.COLS; c++) {
        if (this.grid[r][c]) this.dealRanks.set(r * logic.COLS + c, rank++);
      }
    }
    this.dealDur = Math.max(1, rank) * DEAL_STEP + DEAL_MS + 40;
  }

  // ---------- 帧循环 ----------
  update(dt) {
    const delta = Math.min(50, dt || 16);
    if (this.bg) this.bg.update(delta);
    // 帮助打开时冻结整个场景时钟：落子、闪烁、浮字、撒花、升行全部暂停（PITFALLS #32）
    if (this.helpOpen) {
      this.now = this.clock;
      return;
    }
    this.clock += delta;
    this.now = this.clock;
    this.tickFades();
    this.advanceTurn();
    if (this.overflowAt && this.clock >= this.overflowAt) {
      this.overflowAt = 0;
      this.gameOver();
    }
    this.confetti = confetti.update(this.confetti, delta, H);
    this.now = this.clock;
  }

  // 所有动画都有明确的结束态（PITFALLS #31 / #25）
  tickFades() {
    const now = this.clock;
    this.drops = this.drops.filter((drop) => {
      if (now < drop.at + drop.dur) return this.findTile(drop.id) >= 0;
      if (this.findTile(drop.id) >= 0) this.landing = { id: drop.id, at: now };
      return false;
    });
    this.ghosts = this.ghosts.filter(g => now < g.at + g.dur);
    this.falls = this.falls.filter(f => now < f.at + FALL_MS);
    if (this.rise && now >= this.rise.at + this.rise.dur) this.rise = null;
    if (this.landing && now >= this.landing.at + LAND_MS) this.landing = null;
    if (this.celebrate && now >= this.celebrate.at + this.celebrate.dur) this.celebrate = null;
    if (this.flashCell >= 0 && now >= this.flashAt + LAND_MS) this.flashCell = -1;
    if (this.dealStart && now >= this.dealStart + this.dealDur) {
      this.dealStart = 0;
      this.dealRanks = new Map();
    }
  }

  // ---------- 一手牌的结算状态机 ----------
  // 每手牌：drop（浮牌落位）→ check（找组）→ clear（闪烁）→ fall（下落）→ check …
  // 没有任何可消的组且这一手确实没消掉 → rise（升行）→ check（新行也可能消）→ 结束。
  advanceTurn() {
    let guard = 0;
    while (guard++ < 24) {
      if (!this.activeTurn) {
        if (!this.pendingTurns.length || this.phase !== PLAY || this.overflowAt) break;
        this.activeTurn = this.pendingTurns.shift();
        this.activeTurn.stage = this.clock < this.activeTurn.dropEnd ? 'drop' : 'check';
      }
      const turn = this.activeTurn;
      if (turn.stage === 'drop') {
        if (this.clock < turn.dropEnd) break;
        turn.stage = 'check';
        continue;
      }
      if (turn.stage === 'clear') {
        if (this.clock < turn.stageEnd) break;
        this.settleBoard();
        turn.stage = 'fall';
        turn.stageEnd = this.clock + FALL_MS;
        continue;
      }
      if (turn.stage === 'fall') {
        if (this.clock < turn.stageEnd) break;
        turn.stage = 'check';
        continue;
      }
      if (turn.stage === 'rise') {
        if (this.clock < turn.stageEnd) break;
        if (turn.overflowed) { this.endTurn(turn); break; }
        turn.stage = 'check';
        continue;
      }
      // check
      const groups = logic.findGroups(this.grid);
      if (groups.length) { this.startClear(turn, groups); continue; }
      if (!turn.raiseUsed && this.clearSeq <= turn.clearSeqAtApply) {
        this.riseRow(turn);
        continue;
      }
      this.endTurn(turn);
    }
  }

  endTurn(turn) {
    if (this.activeTurn === turn) this.activeTurn = null;
    this.save();
    if (this.phase === PLAY && !this.overflowAt && this.pendingTurns.length) {
      // 下一手立刻接着结算（它的浮牌早就落位了）
      this.activeTurn = this.pendingTurns.shift();
      this.activeTurn.stage = this.clock < this.activeTurn.dropEnd ? 'drop' : 'check';
    }
  }

  startClear(turn, groups) {
    this.clearSeq += 1;
    turn.chain += 1;
    const ms = turn.chain > 1 ? CHAIN_CLEAR_MS : CLEAR_MS;
    const base = groups.reduce((sum, g) => sum + g.score, 0);
    const gain = base + logic.multiBonus(groups.length) + logic.chainBonus(turn.chain);
    this.score += gain;
    this.cleared += groups.length;
    // 字牌（z）消除单独计数
    if (groups.some((g) => (g.tiles || g.cells || []).some((t) => t && t.suit === 'z'))) {
      achv.bump('legend', 'honor');
    }
    const prevLevel = this.level;
    this.level = logic.levelOf(this.score);
    if (this.level > prevLevel) this.levelFlashAt = this.clock;
    this.maxChain = Math.max(this.maxChain, turn.chain);

    // 先记浮影（像素坐标），再把牌从盘面拿掉 —— 必须先删后闪，
    // 否则闪烁的低透明度那几帧会被底下那张实牌透出来（PITFALLS / web 分册）。
    const clearedIds = new Set();
    const ghostList = [];
    for (const g of groups) {
      for (const [r, c] of g.cells) {
        const tile = this.grid[r][c];
        if (!tile || clearedIds.has(tile.id)) continue;
        clearedIds.add(tile.id);
        const rect = this.cellRect(r * logic.COLS + c);
        ghostList.push({
          v: tile.v, x: rect.x, y: rect.y, w: rect.w, h: rect.h,
          at: this.clock, dur: ms,
        });
      }
    }
    this.grid = logic.clearGroups(this.grid, groups);
    this.drops = this.drops.filter(drop => !clearedIds.has(drop.id));
    if (this.landing && clearedIds.has(this.landing.id)) this.landing = null;
    this.ghosts = this.ghosts.concat(ghostList);
    this.falls = [];
    this.flashCell = -1;

    const special = groups.length > 1 || turn.chain > 1;
    if (special) this.app.audio.playFirework();
    else this.app.audio.playElimination();
    this.celebrate = {
      title: groups.length > 1
        ? t('legend.multiName').replace('{n}', groups.length)
        : t(groups[0].kind === 'kong' ? 'legend.kongName'
          : groups[0].kind === 'triplet' ? 'legend.tripletName' : 'legend.runName'),
      gain,
      chain: turn.chain,
      at: this.clock,
      dur: POP_MS,
    };
    // 多消 / 连击 / 大分：震屏 + 外圈闪光 + 统一 confetti（PITFALLS #46）
    if (groups.length > 1 || turn.chain > 1 || gain >= 300) {
      this.shakeAt = this.clock;
      this.glowAt = this.clock;
      confetti.spawn(this.confetti, {
        W, H, count: Math.min(14, 6 + turn.chain * 3), startY: this.boardY + this.boardH * 0.5,
      });
    }
    if (this.score > this.best) {
      this.best = this.score;
      this.beatBest = true;
      setRaw(BEST_KEY, String(this.best));
    }
    this.save();
    turn.stage = 'clear';
    turn.stageEnd = this.clock + ms;
  }

  settleBoard() {
    const before = new Map();
    for (let r = 0; r < logic.ROWS; r++) {
      for (let c = 0; c < logic.COLS; c++) {
        const tile = this.grid[r][c];
        if (tile) before.set(tile.id, r);
      }
    }
    const next = logic.settle(this.grid);
    this.grid = next;
    this.falls = [];
    for (let r = 0; r < logic.ROWS; r++) {
      for (let c = 0; c < logic.COLS; c++) {
        const tile = next[r][c];
        if (!tile) continue;
        const old = before.get(tile.id);
        if (old != null && old < r) {
          this.falls.push({ id: tile.id, dy: (old - r) * this.rowStep, at: this.clock });
        }
      }
    }
    this.save();
  }

  riseRow(turn) {
    const overflow = this.grid[0].some(Boolean);
    const pushed = [];
    if (overflow) {
      for (let c = 0; c < logic.COLS; c++) {
        const tile = this.grid[0][c];
        if (tile) pushed.push({ v: tile.v, col: c });
      }
    }
    const row = [];
    for (let c = 0; c < logic.COLS; c++) row.push(this.drawKind());
    const res = logic.spawnRow(this.grid, row);
    this.grid = res.grid;
    this.rise = { at: this.clock, dur: SPAWN_MS, overflow, pushed };
    this.dealStart = 0;
    this.dealRanks = new Map();
    this.falls = [];
    this.shakeAt = this.clock;
    turn.raiseUsed = true;
    turn.stage = 'rise';
    turn.stageEnd = this.clock + SPAWN_MS;
    if (overflow) {
      turn.overflowed = true;
      this.overflowAt = this.clock + SPAWN_MS + 180;
      this.pendingTurns.length = 0;   // 已经结束，后面的操作不再结算
    }
    this.save();
  }

  gameOver() {
    if (this.phase === OVER) return;
    this.phase = OVER;
    // 一局结束：本局得分上报给成就系统（1000/5000/10000 各计一次）
    achv.reach('legend', this.score, [1000, 5000, 10000]);
    this.activeTurn = null;
    this.pendingTurns.length = 0;
    this.helpOpen = false;
    this.app.audio.playLose();
    this.save();
  }

  // ---------- 玩家操作：点格子（空格 = 落子，有牌 = 替换） ----------
  onCell(idx) {
    if (!this.canPlay) return;
    // 升行那 240ms 是整盘位移，期间不接操作；消除闪烁 / 下落期间**照常接**（不锁整盘）
    if (this.rise && this.clock < this.rise.at + this.rise.dur) return;
    if (!this.queue.length) return;
    const row = Math.floor(idx / logic.COLS);
    const col = idx % logic.COLS;
    if (row < 0 || row >= logic.ROWS || col < 0 || col >= logic.COLS) return;

    const value = this.queue.shift();
    this.queue.push(this.drawKind());
    const now = this.clock;
    const fromRect = this.handTileRect();
    let tileId = 0;
    let target = -1;

    if (this.grid[row][col]) {
      // 替换：手上这张盖掉原来那张（旧牌直接弃掉）
      const next = logic.replaceTile(this.grid, row, col, value);
      tileId = next[row][col].id;
      this.grid = next;
      target = row * logic.COLS + col;
      this.landing = { id: tileId, at: now };
    } else {
      // 落子：落到这一列最上面（点哪一行不重要）
      const placed = logic.placeTile(this.grid, col, value);
      if (!placed) {
        // 这一列满了：把牌还回去
        this.queue.pop();
        this.queue.unshift(value);
        return;
      }
      this.grid = placed.grid;
      tileId = this.grid[placed.row][col].id;
      target = placed.row * logic.COLS + col;
    }

    const toRect = this.cellRect(target);
    this.flashCell = target;
    this.flashAt = now;
    this.drops.push({
      id: tileId,
      v: value,
      at: now,
      dur: DROP_MS,
      from: {
        x: fromRect.x + fromRect.w / 2,
        y: fromRect.y + fromRect.h / 2,
        w: fromRect.w,
        h: fromRect.h,
      },
      to: {
        cx: toRect.x + toRect.w / 2,
        cy: toRect.y + toRect.h / 2,
        w: toRect.w,
      },
    });
    this.pendingTurns.push({
      id: tileId,
      value,
      dropEnd: now + DROP_MS,
      stage: 'drop',
      chain: 0,
      raiseUsed: false,
      overflowed: false,
      clearSeqAtApply: this.clearSeq,
    });
    this.save();
    this.advanceTurn();   // 空闲时立刻开始结算这一手
  }

  // ---------- 布局 ----------
  layout() {
    this.cw = Math.min(W - 32, 440);
    this.cx = (W - this.cw) / 2;
    this.top = HEADER.TOP;
    this.headerH = HEADER.HEIGHT;
    this.homeRect = { ...HEADER.HOME_RECT };

    this.scoreY = this.top + this.headerH + 12;
    this.scoreH = 68;
    this.optY = this.scoreY + this.scoreH + 12;
    this.optH = 68;
    const boardTop = this.optY + this.optH + 12;

    this.fabSize = FAB_SIZE;
    this.helpRect = {
      x: W - 16 - FAB_SIZE,
      y: H - SAFE_BOTTOM - 16 - FAB_SIZE,
      w: FAB_SIZE,
      h: FAB_SIZE,
    };
    // 底部给 FAB 留一条：棋盘底边不能压到 FAB 行
    // 棋盘下方还要放一句玩法提示：底部预留再 +18，棋盘底边与提示都落在 FAB 行上方
    const reserve = Math.max(SAFE_BOTTOM + 82, H - this.helpRect.y + 26);
    const availH = Math.max(220, H - boardTop - reserve);

    this.pad = 6;
    this.gap = 3;
    const byW = (this.cw - this.pad * 2 - this.gap * (logic.COLS - 1)) / logic.COLS;
    const byH = ((availH - this.pad * 2 - this.gap * (logic.ROWS - 1)) / logic.ROWS)
      / cards.ratio(cards.MODE_MAHJONG);
    this.cellW = Math.max(24, Math.floor(Math.min(byW, byH)));
    this.cellH = Math.round(this.cellW * cards.ratio(cards.MODE_MAHJONG));
    this.rowStep = this.cellH + this.gap;
    this.colStep = this.cellW + this.gap;
    this.boardW = this.cellW * logic.COLS + this.gap * (logic.COLS - 1) + this.pad * 2;
    this.boardH = this.cellH * logic.ROWS + this.gap * (logic.ROWS - 1) + this.pad * 2;
    this.boardX = (W - this.boardW) / 2;
    this.boardY = boardTop + Math.max(0, (availH - this.boardH) / 2);

    // 候选区：当前牌 44×56，后两张按 0.8 / 0.6 缩（布局盒仍是 44 宽，只缩视觉）
    this.handW = Math.min(44, Math.max(34, Math.floor(this.cw * 0.13)));
    this.handH = Math.round(this.handW * cards.ratio(cards.MODE_MAHJONG));
    this.handGap = 8;
    this.previewGap = 2;
    const groupW = this.handW * 3 + this.handGap + this.previewGap * 2;
    const leftW = this.cw * 0.58;
    this.handX = this.cx + Math.max(10, (leftW - groupW) / 2);
    this.handY = this.optY + (this.optH - this.handH) / 2;
  }

  cellRect(idx) {
    const row = Math.floor(idx / logic.COLS);
    const col = idx % logic.COLS;
    return {
      x: this.boardX + this.pad + col * this.colStep,
      y: this.boardY + this.pad + row * this.rowStep,
      w: this.cellW,
      h: this.cellH,
    };
  }

  handSlotRect(i) {
    const offsets = [0, this.handW + this.handGap,
      this.handW * 2 + this.handGap + this.previewGap];
    const slotX = this.handX + offsets[i];
    const scale = i === 0 ? 1 : PREVIEW_SCALES[i - 1];
    const w = this.handW * scale;
    const h = this.handH * scale;
    return {
      x: slotX + (this.handW - w) / 2,
      y: this.handY + (this.handH - h) / 2,
      w,
      h,
    };
  }

  handTileRect() {
    return this.handSlotRect(0);
  }

  // ---------- 渲染 ----------
  render(c) {
    this.buttons = [];
    this.now = this.clock;
    const T = theme.tokens;
    c.fillStyle = T.bg;
    c.fillRect(0, 0, W, H);
    if (this.bg) this.bg.draw(c, theme.dark);
    this.drawHeader(c);
    this.drawStats(c);
    this.drawHandCard(c);
    this.drawBoard(c);
    this.drawPlayHint(c);
    this.drawDrops(c);
    this.drawCelebrate(c);
    if (this.phase === OVER) this.drawResult(c);
    this.drawConfetti(c);
    if (!this.helpOpen) this.drawFabs(c);
    if (this.helpOpen) this.drawHelp(c);
  }

  // 条牌 / 字牌 / 花牌统一走 cards.draw 的 MODE_MAHJONG：
  // suit 's' / 'z' / 'f' + face 1..9 / 1..7 / 1..8 → 雪碧图 s1..s9 / z1..z7 / f1..f8。
  // 花牌（万能牌）在 core/tiles.js 里已有 f1..f8 槽位，不再需要单独的牌面渲染。
  drawTile(c, v, x, y, w, h) {
    cards.draw(c, { suit: logic.suitOf(v), value: logic.faceOf(v) },
      cards.MODE_MAHJONG, x, y, w, h, true);
  }

  // 游戏区下方的一句玩法提示（统一样式见 core/draw.js 的 hintLine）
  drawPlayHint(c) {
    D.hintLine(c, t('legend.playHint'), this.boardY + this.boardH + 16, theme.tokens.muted);
  }

  drawHeader(c) {
    const T = theme.tokens;
    D.text(c, t('legend.gameTitle'), W / 2, this.top + this.headerH / 2, {
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

  drawStats(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.scoreY, this.cw, this.scoreH, T);
    const cells = [
      [t('legend.best'), String(this.best), T.text],
      [t('legend.score'), String(this.score), T.primary],
      [t('legend.cleared'), String(this.cleared), T.text],
    ];
    const q = this.cw / cells.length;
    cells.forEach(([label, value, color], i) => {
      // 卡片内竖分隔线统一 24px、垂直居中（PITFALLS #37）
      if (i) D.divider(c, this.cx + q * i, this.scoreY + this.scoreH / 2, 24, T.border, 1);
      const x = this.cx + q * (i + 0.5);
      D.text(c, label, x, this.scoreY + 20, { size: 9.5, color: T.muted, align: 'center' });
      D.text(c, value, x, this.scoreY + 43, { size: 18, weight: 'bold', color, align: 'center' });
    });
    // 等级进度：本轮得分在「当前等级 → 下一等级」之间的位置
    const progress = (this.score % logic.LEVEL_STEP) / logic.LEVEL_STEP;
    D.progressBar(c, this.cx, this.scoreY, this.cw, this.scoreH,
      clamp(progress, 0, 1), T.border, T.primary);
  }

  drawHandCard(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.optY, this.cw, this.optH, T);
    const midX = this.cx + this.cw / 2;
    D.divider(c, midX, this.optY + this.optH / 2, 24, T.border, 1);

    if (this.queue.length) {
      for (let i = 0; i < Math.min(1 + logic.PREVIEW, this.queue.length); i++) {
        const rect = this.handSlotRect(i);
        c.save();
        if (i > 0) c.globalAlpha = 0.55;   // 后两张压暗，当前牌是主位
        this.drawTile(c, this.queue[i], rect.x, rect.y, rect.w, rect.h);
        c.restore();
        if (i === 0) {
          D.strokeRoundRect(c, rect.x - 1.5, rect.y - 1.5, rect.w + 3, rect.h + 3, 9, T.primary, 2);
        }
      }
    } else {
      D.text(c, '—', this.cx + this.cw * 0.29, this.optY + this.optH / 2,
        { size: 14, color: T.muted, align: 'center' });
    }

    const label = t('legend.start');
    const bw = Math.min(112, D.measure(c, label, 13, 'bold') + 24);
    const bx = midX + (this.cw / 2 - bw) / 2;
    const by = this.optY + (this.optH - 32) / 2;
    D.fillRoundRect(c, bx, by, bw, 32, 8, T.primary);
    D.text(c, label, bx + bw / 2, by + 16, { size: 13, weight: 'bold', color: '#ffffff', align: 'center' });
    this.addButton('new', bx, by, bw, 32, () => this.startNewRun());
  }

  drawBoard(c) {
    const T = theme.tokens;
    const now = this.now;
    let sx = 0;
    let sy = 0;
    if (now - this.shakeAt < SHAKE_MS) {
      const p = clamp((now - this.shakeAt) / SHAKE_MS, 0, 1);
      const amp = (1 - p) * 5;
      sx = Math.sin((now - this.shakeAt) / 22) * amp;
      sy = Math.cos((now - this.shakeAt) / 26) * amp * 0.5;
    }
    c.save();
    c.translate(sx, sy);

    D.fillRoundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 14, T.boardBg);
    c.save();
    D.roundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 14);
    c.clip();
    // 点阵底纹
    c.fillStyle = T.boardDot;
    for (let x = this.boardX + 5; x < this.boardX + this.boardW; x += 10) {
      for (let y = this.boardY + 5; y < this.boardY + this.boardH; y += 10) {
        c.beginPath();
        c.arc(x, y, 1.1, 0, Math.PI * 2);
        c.fill();
      }
    }

    // 升行：整盘内容先向下一行、再滑回原位；棋盘 clip 把被顶出去的牌裁掉
    const riseP = this.rise ? clamp((now - this.rise.at) / this.rise.dur, 0, 1) : 1;
    const riseOffset = this.rise ? this.rowStep * (1 - easeOut(riseP)) : 0;
    c.save();
    c.translate(0, riseOffset);

    // 空槽
    const canTap = this.canPlay && !(this.rise && now < this.rise.at + this.rise.dur);
    for (let i = 0; i < logic.CELLS; i++) {
      const r = this.cellRect(i);
      D.fillRoundRect(c, r.x, r.y, r.w, r.h, 8, 'rgba(255,255,255,0.06)');
      c.save();
      c.globalAlpha = this.grid[Math.floor(i / logic.COLS)][i % logic.COLS] ? 0.75 : 0.5;
      D.strokeRoundRect(c, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 8, T.tileBorder, 1);
      c.restore();
    }

    const dropping = new Set(this.drops.map(drop => drop.id));
    for (let i = 0; i < logic.CELLS; i++) {
      const tile = this.tileAt(i);
      if (!tile || dropping.has(tile.id)) continue;
      this.drawBoardTile(c, i, tile);
    }
    // 被消掉的浮影：棋盘上已经置空，这里播闪烁 → 缩小消失
    this.ghosts.forEach((g) => {
      const p = clamp((now - g.at) / g.dur, 0, 1);
      const alpha = blinkAlpha(p);
      const scale = p > 0.66 ? 1 - 0.3 * ((p - 0.66) / 0.34) : 1;
      c.save();
      c.globalAlpha = alpha;
      c.translate(g.x + g.w / 2, g.y + g.h / 2);
      c.scale(scale, scale);
      this.drawTile(c, g.v, -g.w / 2, -g.h / 2, g.w, g.h);
      c.restore();
    });
    c.restore();   // rise

    // 被顶出棋盘的牌：越过棋盘上沿滑出并淡出
    if (this.rise && this.rise.pushed.length) {
      const p = clamp((now - this.rise.at) / this.rise.dur, 0, 1);
      const e = easeOut(p);
      this.rise.pushed.forEach(({ v, col }) => {
        const x = this.boardX + this.pad + col * this.colStep;
        const y = this.boardY + this.pad - e * this.rowStep * 1.15;
        c.save();
        c.globalAlpha = Math.max(0, 1 - p);
        this.drawTile(c, v, x, y, this.cellW, this.cellH);
        c.restore();
      });
    }

    // 刚点过的格子：主色描边淡出
    if (this.flashCell >= 0 && now - this.flashAt <= LAND_MS) {
      const r = this.cellRect(this.flashCell);
      const p = clamp((now - this.flashAt) / LAND_MS, 0, 1);
      c.save();
      c.globalAlpha = 1 - p * 0.7;
      D.strokeRoundRect(c, r.x - 1, r.y - 1, r.w + 2, r.h + 2, 9, T.primary, 2);
      c.restore();
    }

    // 消除 / 升行的外圈闪光
    if (now - this.glowAt < GLOW_MS) {
      const p = clamp((now - this.glowAt) / GLOW_MS, 0, 1);
      c.save();
      c.globalAlpha = (1 - p) * 0.85;
      c.strokeStyle = T.primary;
      c.lineWidth = 3 + 5 * Math.sin(p * Math.PI);
      D.roundRect(c, this.boardX - 2, this.boardY - 2, this.boardW + 4, this.boardH + 4, 16);
      c.stroke();
      c.restore();
    }
    c.restore();   // clip

    // 溢出：红色描边提示「顶出去了」
    if (this.rise && this.rise.overflow) {
      const p = clamp((now - this.rise.at) / this.rise.dur, 0, 1);
      c.save();
      c.globalAlpha = 0.5 + 0.5 * Math.sin(p * Math.PI);
      D.strokeRoundRect(c, this.boardX - 1, this.boardY - 1, this.boardW + 2, this.boardH + 2, 15, T.lose, 2);
      c.restore();
    }
    c.restore();   // shake

    // 结算层不用整盘锁：闪烁 / 下落期间格子照常可点（PITFALLS #34）
    if (canTap) {
      for (let i = 0; i < logic.CELLS; i++) {
        const r = this.cellRect(i);
        this.addButton('cell-' + i, r.x, r.y, r.w, r.h, () => this.onCell(i));
      }
    }
  }

  drawBoardTile(c, idx, tile) {
    const now = this.now;
    const r = this.cellRect(idx);
    let alpha = 1;
    let ox = 0;
    let oy = 0;
    let scale = 1;
    if (this.dealStart) {
      const rank = this.dealRanks.has(idx) ? this.dealRanks.get(idx) : 0;
      const p = clamp((now - this.dealStart - rank * DEAL_STEP) / DEAL_MS, 0, 1);
      if (p <= 0) return;
      const e = easeOut(p);
      ox = -18 * (1 - e);
      oy = -18 * (1 - e);
      scale = 0.45 + 0.55 * e;
      alpha = p;
    }
    const fall = this.falls.find(f => f.id === tile.id);
    if (fall) {
      const p = clamp((now - fall.at) / FALL_MS, 0, 1);
      oy += fall.dy * (1 - easeOut(p));
    }
    if (this.landing && this.landing.id === tile.id) {
      scale *= fx.popScale(now - this.landing.at);
    }
    c.save();
    c.globalAlpha = alpha;
    c.translate(r.x + r.w / 2 + ox, r.y + r.h / 2 + oy);
    c.scale(scale, scale);
    this.drawTile(c, tile.v, -r.w / 2, -r.h / 2, r.w, r.h);
    c.restore();
  }

  // 浮牌：从候选区落进格子；每帧重新定位目标格（消除下落期间也会跟着走）
  drawDrops(c) {
    const now = this.now;
    this.drops.forEach((drop) => {
      const p = clamp((now - drop.at) / drop.dur, 0, 1);
      const e = easeOut(p);
      const target = this.dropTarget(drop);
      const w = drop.from.w + (target.w - drop.from.w) * e;
      const h = w * cards.ratio(cards.MODE_MAHJONG);
      const cx = drop.from.x + (target.cx - drop.from.x) * e;
      const cy = drop.from.y + (target.cy - drop.from.y) * (0.2 * p + 0.8 * p * p);
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.22)';
      c.shadowBlur = 10;
      c.shadowOffsetY = 4;
      this.drawTile(c, drop.v, cx - w / 2, cy - h / 2, w, h);
      c.restore();
    });
  }

  dropTarget(drop) {
    const idx = this.findTile(drop.id);
    if (idx >= 0) {
      const r = this.cellRect(idx);
      return { cx: r.x + r.w / 2, cy: r.y + r.h / 2, w: r.w };
    }
    return drop.to || { cx: W / 2, cy: this.boardY + this.boardH / 2, w: this.cellW };
  }

  drawCelebrate(c) {
    const e = this.celebrate;
    if (!e) return;
    const T = theme.tokens;
    const p = clamp((this.now - e.at) / e.dur, 0, 1);
    const scale = p < 0.28 ? 0.4 + 0.76 * (p / 0.28)
      : p < 0.44 ? 1.16 - 0.16 * ((p - 0.28) / 0.16) : 1;
    const alpha = p > 0.78 ? 1 - (p - 0.78) / 0.22 : 1;
    const rise = p > 0.44 ? ((p - 0.44) / 0.56) * 26 : 0;
    const titleSize = 16;
    const scoreSize = 19;
    const chainSize = 12;
    const chainText = e.chain > 1 ? t('legend.chainName').replace('{n}', e.chain) : '';
    const cx = this.boardX + this.boardW / 2;
    const cy = this.boardY + this.boardH / 2 - rise;
    c.save();
    c.globalAlpha = alpha;
    c.translate(cx, cy);
    c.scale(scale, scale);
    const widest = Math.max(
      D.measure(c, e.title, titleSize, 'bold'),
      chainText ? D.measure(c, chainText, chainSize, 'bold') : 0,
      D.measure(c, `+${e.gain}`, scoreSize, 'bold'),
    );
    const w = Math.min(this.boardW - 8, widest + 36);
    const h = (chainText ? titleSize * 1.1 + chainSize * 1.35 : titleSize * 1.1)
      + scoreSize * 1.55 + 14;
    c.save();
    c.shadowColor = 'rgba(35,128,78,0.5)';
    c.shadowBlur = 10;
    D.fillRoundRect(c, -w / 2, -h / 2, w, h, 8, T.primary);
    c.restore();
    let ly = -h / 2 + 7 + titleSize * 0.62;
    D.text(c, e.title, 0, ly, { size: titleSize, weight: 'bold', color: '#ffffff', align: 'center' });
    if (chainText) {
      ly += titleSize * 0.55 + chainSize * 0.7;
      D.text(c, chainText, 0, ly, {
        size: chainSize, weight: 'bold', color: 'rgba(255,255,255,0.95)', align: 'center',
      });
    }
    D.text(c, `+${e.gain}`, 0, h / 2 - 6 - scoreSize * 0.62, {
      size: scoreSize, weight: 'bold', color: 'rgba(255,255,255,0.92)', align: 'center',
    });
    c.restore();
  }

  // 结算层只盖棋盘（不挡上方统计卡 / 候选区）；帮助 FAB 仍然显示（PITFALLS #10）
  drawResult(c) {
    if (!this.resultVisible(RESULT_DELAY)) return;
    const T = theme.tokens;
    const overlay = theme.dark ? 'rgba(38,38,38,0.94)' : 'rgba(250,248,239,0.94)';
    D.fillRoundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 14, overlay);
    const cx = this.boardX + this.boardW / 2;
    const cy = this.boardY + this.boardH / 2;
    const title = `💤💤 ${t('legend.tipLost')} 💤💤`;
    D.text(c, title, cx, cy - 54, {
      size: Math.min(18, this.boardW / 15), weight: 'bold', color: T.lose, align: 'center',
    });
    D.text(c, t('legend.finalScore'), cx, cy - 22, {
      size: 12, color: T.muted, align: 'center',
    });
    D.text(c, String(this.score), cx, cy + 4, {
      size: Math.min(30, this.boardW / 9), weight: 'bold', color: T.text, align: 'center',
    });
    if (this.beatBest) {
      D.text(c, t('legend.newBest'), cx, cy + 30, {
        size: 12, weight: 'bold', color: T.primary, align: 'center',
      });
    }
    const label = t('legend.replay');
    const bw = Math.min(140, D.measure(c, label, 13, 'bold') + 26);
    const bx = cx - bw / 2;
    const by = cy + 50;
    D.fillRoundRect(c, bx, by, bw, 34, 8, T.primary);
    D.text(c, label, bx + bw / 2, by + 17, { size: 13, weight: 'bold', color: '#ffffff', align: 'center' });
    this.addButton('result-replay', bx, by, bw, 34, () => this.startNewRun());
  }

  drawConfetti(c) {
    if (this.confetti.length) confetti.draw(c, this.confetti);
  }

  drawFabs(c) {
    const T = theme.tokens;
    const r = this.helpRect;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.12)';
    c.shadowBlur = 10;
    c.shadowOffsetY = 2;
    D.circle(c, r.x + r.w / 2, r.y + r.h / 2, r.w / 2, T.card);
    c.restore();
    if (!icons.draw(c, 'help', r.x + r.w / 2, r.y + r.h / 2, 22, T.text)) {
      D.text(c, '?', r.x + r.w / 2, r.y + r.h / 2,
        { size: 22, weight: 'bold', color: T.text, align: 'center' });
    }
    this.addButton('fab-help', r.x, r.y, r.w, r.h, () => { this.helpOpen = true; });
    fabKit.drawMute(this, c, fabKit.leftSlot(r));
  }

  drawHelp(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillRect(0, 0, W, H);
    const x = 18;
    const w = W - 36;
    const innerW = w - 36;
    const headerH = 52;
    const footerH = 52;
    const maxH = H - SAFE_BOTTOM - 24;
    const keys = ['help1', 'help2', 'help3', 'help4', 'help5'];
    let size = 12.5;
    let lineH = 17;
    let blocks = [];
    let contentH = 0;
    // 英文文案比中文长：逐档缩字号，挑第一个放得下的
    for (let step = 0; step < 8; step++) {
      size = 12.5 - step * 0.4;
      lineH = size + 4;
      blocks = [];
      contentH = 0;
      keys.forEach((key) => {
        const value = t(`legend.${key}`);
        if (value === `legend.${key}`) return;
        const lines = D.wrapText(c, value, innerW, size);
        blocks.push({ lines, gap: 6 });
        contentH += lines.length * lineH + 6;
      });
      if (headerH + contentH + 8 + footerH <= maxH) break;
    }
    const h = Math.min(maxH, headerH + contentH + 8 + footerH);
    const y = Math.max(12, (H - h) / 2);
    D.card(c, x, y, w, h, T);
    D.text(c, '?', x + 24, y + 26, { size: 22, weight: 'bold', color: T.primary });
    D.text(c, t('help'), x + 48, y + 26, { size: 16, weight: 'bold', color: T.text });
    const viewTop = y + headerH;
    const viewH = Math.max(20, h - headerH - footerH);
    c.save();
    D.roundRect(c, x + 1, viewTop, w - 2, viewH, 8);
    c.clip();
    let ly = viewTop + 2;
    blocks.forEach((block) => {
      block.lines.forEach((line) => {
        if (line) D.text(c, line, x + 18, ly, { size, color: T.text });
        ly += lineH;
      });
      ly += block.gap;
    });
    c.restore();
    // 全屏遮罩先加，面板按钮后加（PITFALLS #12）
    this.addButton('help-mask', 0, 0, W, H, () => { this.helpOpen = false; });
    const bw = 110;
    const bx = x + (w - bw) / 2;
    const by = y + h - 42;
    D.fillRoundRect(c, bx, by, bw, 30, 8, T.primary);
    D.text(c, t('legend.confirmText'), bx + bw / 2, by + 15, {
      size: 12, weight: 'bold', color: '#ffffff', align: 'center',
    });
    this.addButton('help-ok', bx, by, bw, 30, () => { this.helpOpen = false; });
  }

  // ---------- 生命周期 ----------
  onTheme() { this.layout(); }
  onResize() { this.layout(); }
  onHide() { this.save(); }
  onShow() { this.now = this.clock; }
}

module.exports = LegendScene;
