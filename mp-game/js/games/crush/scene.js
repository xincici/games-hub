// Emoji 消消乐 · 小游戏 canvas 场景。
// 纯逻辑在 board.js（与 web 同一套规则）；这里负责布局、绘制、输入、动画与存档。
const { W, H, SAFE_BOTTOM } = require('../../core/canvas');
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
const confetti = require('../../core/confetti');
const achv = require('../../core/achv');
const logic = require('./board');
const i18nDict = require('./i18n');

const coreI18n = require('../../core/i18n');
if (!coreI18n.__crushRegistered) {
  coreI18n.register('crush', i18nDict);
  coreI18n.__crushRegistered = true;
}

const PREFIX = '__emoji_crush__';
const LEVEL_KEY = `${PREFIX}level`;          // 当前关卡
const BEST_KEY = `${PREFIX}best_1`;          // 历史最高关卡（与当前关卡独立）
const STATE_KEY = `${PREFIX}state`;          // 局面存档（含墙 / 炸弹 / 万能 / 冰块的负值）
const PLAY = 'play';
const WON = 'won';
const OVER = 'over';

const BOMB_FACE = '💣';
const WILD_FACE = '💎';

const SWAP_MS = 240;
const CLEAR_MS = 360;
const FALL_MS = 300;
const REFILL_MS = 300;
const SPRING_MS = 420;
const DEAL_MS = 300;
const IDLE_HINT_MS = 6000;
const HINT_MS = 2600;
const SHAKE_MS = 340;
const GLOW_MS = 900;

// 解冻碎屑：[横向, 纵向, 自转角度, 缩放]，位移单位是「格」
const ICE_SHARDS = [
  [-0.74, -0.6, -150, 0.95],
  [0.68, -0.74, 130, 1.05],
  [-0.86, 0.22, -85, 0.7],
  [0.8, 0.52, 165, 0.85],
  [0.04, -0.94, -35, 0.6],
  [-0.26, 0.86, 65, 0.75],
];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const easeOut = p => 1 - Math.pow(1 - p, 3);

class CrushScene extends Scene {
  constructor(app) {
    super(app);
    this.bg = new ParticleField();
    // 所有动画 / 逻辑计时都用场景时钟，帮助 / 二次确认打开时冻结（PITFALLS #32）
    this.clock = 0;
    this.now = 0;
    this.level = Math.max(1, Math.floor(+(getRaw(LEVEL_KEY, 1) || 1)) || 1);
    this.best = Math.max(this.level, Math.floor(+(getRaw(BEST_KEY, 1) || 1)) || 1);
    this.conf = logic.levelConfig(this.level);
    this.cells = [];
    this.tiles = [];
    this.tileId = 0;
    this.phase = PLAY;
    this.score = 0;
    this.moves = this.conf.moves;
    this.selected = -1;
    this.selectedId = -1;
    this.helpOpen = false;
    this.confirming = false;
    this.busy = false;
    this.timers = [];
    this.clearFx = null;
    this.thawFx = null;
    this.spring = null;
    this.shakeAt = -SHAKE_MS - 1;
    this.glowAt = -GLOW_MS - 1;
    this.celebrate = null;
    this.confetti = [];
    this.confettiUntil = 0;
    this.lastConfettiAt = 0;
    this.hint = null;
    this.hintAt = 0;
    this.hintNextAt = 0;
    this.lastHints = [];
    this.touch = null;
    this.helpScroll = 0;
    this.helpScrollMax = 0;
    this.helpDrag = null;
    this.dealUntil = 0;
    this.layout();
    this.boot();
  }

  spawnOpts() {
    const c = this.conf;
    return { walls: c.walls, ice: c.ice, bombChance: c.bombChance, wildChance: c.wildChance };
  }

  // ---------- 启动 / 关卡流程 ----------

  boot() {
    if (!this.restore()) this.initLevel(this.level);
  }

  initLevel(lv) {
    this.flushTimers();
    this.level = Math.max(1, Math.floor(lv) || 1);
    this.conf = logic.levelConfig(this.level);
    setRaw(LEVEL_KEY, String(this.level));
    if (this.level > this.best) {
      this.best = this.level;
      setRaw(BEST_KEY, String(this.best));
    }
    // 初始盘面：无现成三连 + 至少一个有效交换；高关卡带墙、冰块与少量特殊元素
    this.cells = logic.generateBoard(this.conf.cols, this.conf.rows, this.conf.kinds, {
      ...this.spawnOpts(),
      initials: Math.min(3, Math.floor(this.level / 3)),
    });
    this.score = 0;
    this.moves = this.conf.moves;
    this.phase = PLAY;
    this.selected = -1;
    this.selectedId = -1;
    this.busy = false;
    this.helpOpen = false;
    this.confirming = false;
    this.clearFx = null;
    this.thawFx = null;
    this.spring = null;
    this.celebrate = null;
    this.confetti = [];
    this.confettiUntil = 0;
    this.hint = null;
    this.lastHints = [];
    this.touch = null;
    this.shakeAt = -SHAKE_MS - 1;
    this.glowAt = -GLOW_MS - 1;
    this.layout();
    this.tiles = this.buildTiles();
    this.playDeal();
    this.touchIdle();
    this.save();
  }

  nextLevel() { this.initLevel(this.level + 1); }
  replayLevel() { this.confirming = false; this.initLevel(this.level); }

  // 新游戏：清闯关记录并从第 1 关重开，任何时候都要二次确认
  startNewGame() {
    this.confirming = false;
    removeRaw(BEST_KEY);
    this.best = 1;
    this.initLevel(1);
  }

  buildTiles() {
    const out = [];
    const cols = this.conf.cols;
    for (let i = 0; i < this.cells.length; i++) {
      const v = this.cells[i];
      if (v === null || v === undefined || logic.isWall(v)) continue;
      out.push(this.newTile(v, ~~(i / cols), i % cols));
    }
    return out;
  }

  newTile(value, r, c) {
    return {
      id: ++this.tileId, value, r, c,
      fromR: null, fromC: null, moveAt: 0, moveDur: 0, dealAt: 0,
    };
  }

  // 发牌入场：行优先 r*cols+c 错峰，左上 → 右下（PITFALLS #40）
  playDeal() {
    const now = this.clock;
    const cols = this.conf.cols;
    const total = this.tiles.length;
    const step = clamp(Math.round(1100 / Math.max(1, total)), 8, 24);
    this.tiles.forEach((tile) => {
      tile.dealAt = now + (tile.r * cols + tile.c) * step;
      tile.fromR = null;
      tile.fromC = null;
      tile.moveAt = 0;
      tile.moveDur = 0;
    });
    this.dealUntil = now + (total ? (total - 1) * step : 0) + DEAL_MS;
  }

  // ---------- 存档 ----------

  save() {
    if (!this.cells.length) return;
    try {
      setRaw(STATE_KEY, JSON.stringify({
        cells: this.cells, level: this.level, score: this.score, moves: this.moves, phase: this.phase,
      }));
    } catch (e) { /* 存储异常不影响游玩 */ }
  }

  restore() {
    try {
      const raw = getRaw(STATE_KEY, '');
      if (!raw) return false;
      const saved = JSON.parse(raw);
      if (!saved || !Array.isArray(saved.cells) || !saved.cells.length) return false;
      if (saved.phase !== PLAY && saved.phase !== WON && saved.phase !== OVER) return false;
      const c = logic.levelConfig(+saved.level || 1);
      if (saved.cells.length !== c.cols * c.rows) return false;
      // 字段校验：空格 / 普通种类 / 墙 / 炸弹 / 万能 / 冰块（冰下种类必须在 kinds 内）
      const okValue = v => v === null || (Number.isInteger(v) && (
        (v >= 0 && v < c.kinds)
        || v === logic.WALL || v === logic.BOMB || v === logic.WILD
        || (logic.isFrozen(v) && logic.frozenKind(v) >= 0 && logic.frozenKind(v) < c.kinds)
      ));
      if (!saved.cells.every(okValue)) return false;
      this.level = c.level;
      this.conf = c;
      this.cells = saved.cells.slice();
      this.score = Math.max(0, Math.floor(+saved.score) || 0);
      this.moves = clamp(Math.floor(+saved.moves) || 0, 0, c.moves);
      this.phase = saved.phase;
      if (this.level > this.best) this.best = this.level;
      if (this.phase === PLAY && !logic.hasAnyMove(this.cells, c.cols, c.rows, c.kinds)) {
        this.cells = logic.reshuffle(this.cells, c.cols, c.rows, c.kinds);
      }
      // 恢复后必须重新布局（PITFALLS #9），再按当前盘面重建牌
      this.layout();
      this.selected = -1;
      this.selectedId = -1;
      this.busy = false;
      this.clearFx = null;
      this.thawFx = null;
      this.spring = null;
      this.celebrate = null;
      this.hint = null;
      this.tiles = this.buildTiles();
      // 玩到一半才逐张发牌；恢复的是结算层就静默落定，不再播入场 / 烟花
      if (this.phase === PLAY) this.playDeal();
      else this.dealUntil = 0;
      this.touchIdle();
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- 计时器 / 时钟 ----------

  schedule(delay, fn) {
    this.timers.push({ at: this.clock + Math.max(0, delay), fn });
  }

  flushTimers() { this.timers.length = 0; }

  tickTimers() {
    let guard = 0;
    while (this.timers.length && guard++ < 40) {
      this.timers.sort((a, b) => a.at - b.at);
      if (this.timers[0].at > this.clock) break;
      const job = this.timers.shift();
      job.fn();
    }
  }

  update(dt) {
    const delta = Math.min(50, dt || 16);
    if (this.bg) this.bg.update(delta);
    // 帮助 / 二次确认打开时冻结游戏时钟与所有动画
    if (!this.helpOpen && !this.confirming) {
      this.clock += delta;
      this.now = this.clock;
      this.tickTimers();
      this.advanceFx();
      this.updateHint();
      if (this.dealUntil && this.clock >= this.dealUntil) this.dealUntil = 0;
      if (this.now < this.confettiUntil && this.now - this.lastConfettiAt >= 40) {
        this.lastConfettiAt = this.now;
        this.emitConfetti();
      }
      this.confetti = confetti.update(this.confetti, delta, H);
    }
    this.now = this.clock;
  }

  // 所有动画都有明确的结束态，不能只靠 render 读时间（PITFALLS #31 / #25）
  advanceFx() {
    const now = this.clock;
    this.tiles.forEach((tile) => {
      if (tile.moveAt && now >= tile.moveAt + tile.moveDur) {
        tile.fromR = null;
        tile.fromC = null;
        tile.moveAt = 0;
        tile.moveDur = 0;
      }
      if (tile.dealAt && now >= tile.dealAt + DEAL_MS) tile.dealAt = 0;
    });
    if (this.clearFx && now - this.clearFx.at > CLEAR_MS) this.clearFx = null;
    if (this.thawFx && now - this.thawFx.at > 560) this.thawFx = null;
    if (this.spring && now - this.spring.at > this.spring.dur) this.spring = null;
    if (this.celebrate && now - this.celebrate.at > this.celebrate.dur) this.celebrate = null;
  }

  // ---------- 空闲提示 ----------

  touchIdle() {
    this.hint = null;
    this.lastHints = [];
    this.hintNextAt = this.clock + IDLE_HINT_MS;
  }

  pickHint() {
    const { cols, rows } = this.conf;
    const board = this.cells;
    const found = [];
    for (let i = 0; i < board.length; i++) {
      if (!logic.isTile(board[i])) continue;
      const r = ~~(i / cols);
      const c = i % cols;
      const pairs = [];
      if (c + 1 < cols) pairs.push([i, i + 1]);
      if (r + 1 < rows) pairs.push([i, i + cols]);
      for (const [a, b] of pairs) {
        if (!logic.hasMatchAfterSwap(board, cols, rows, a, b)) continue;
        const trial = [...board];
        [trial[a], trial[b]] = [trial[b], trial[a]];
        found.push({ a, b, size: logic.findMatches(trial, cols, rows).size });
      }
    }
    if (!found.length) return null;
    found.sort((x, y) => y.size - x.size);
    const samePair = (p, q) => !!q && ((p.a === q.a && p.b === q.b) || (p.a === q.b && p.b === q.a));
    const fresh = found.filter(p => !this.lastHints.some(h => samePair(p, h)));
    const list = fresh.length ? fresh : found.filter(p => !samePair(p, this.lastHints[0]));
    const pool = list.length ? list : found;
    const top = pool.filter(p => p.size === pool[0].size);
    return top[Math.floor(Math.random() * top.length)];
  }

  updateHint() {
    if (this.phase !== PLAY) { this.hint = null; return; }
    if (this.hint) {
      if (this.clock >= this.hint.until) {
        this.hint = null;
        this.hintNextAt = this.clock + IDLE_HINT_MS;
      }
      return;
    }
    if (this.busy || this.clock < this.dealUntil || this.helpOpen || this.confirming) return;
    if (this.clock < this.hintNextAt) return;
    const pick = this.pickHint();
    if (!pick) { this.hintNextAt = this.clock + IDLE_HINT_MS; return; }
    this.hint = { a: pick.a, b: pick.b, at: this.clock, until: this.clock + HINT_MS };
    this.hintAt = this.clock;
    this.lastHints = [this.hint, ...this.lastHints].slice(0, 3);
    this.hintNextAt = this.hint.until + IDLE_HINT_MS;
  }

  // ---------- 输入 ----------

  isSelectable(idx) {
    return this.phase === PLAY && logic.isTile(this.cells[idx]) && !this.isClearing(idx);
  }

  isClearing(idx) {
    const fx = this.clearFx;
    return !!fx && (fx.matched.has(idx) || fx.blast.has(idx));
  }

  tileAt(idx) {
    return this.tiles.find(t => t.r * this.conf.cols + t.c === idx) || null;
  }

  cellAt(x, y) {
    if (x < this.innerX - 2 || x > this.innerX + this.conf.cols * this.pitch
      || y < this.innerY - 2 || y > this.innerY + this.conf.rows * this.pitch) return -1;
    const c = Math.floor((x - this.innerX) / this.pitch);
    const r = Math.floor((y - this.innerY) / this.pitch);
    if (r < 0 || r >= this.conf.rows || c < 0 || c >= this.conf.cols) return -1;
    return r * this.conf.cols + c;
  }

  onCellTap(idx) {
    if (this.phase !== PLAY || this.helpOpen || this.confirming) return;
    if (this.clock < this.dealUntil) return;
    if (!this.isSelectable(idx)) return;
    this.touchIdle();
    const tile = this.tileAt(idx);
    // 连锁结算期间只有被消除的格子不可点；其它格仍可选中，落定后再换位（不整盘锁死）
    if (this.busy) {
      this.selected = idx;
      this.selectedId = tile ? tile.id : -1;
      return;
    }
    if (this.selected >= 0 && !this.isSelectable(this.selected)) {
      this.selected = -1;
      this.selectedId = -1;
    }
    if (this.selected < 0) {
      this.selected = idx;
      this.selectedId = tile ? tile.id : -1;
      return;
    }
    if (this.selected === idx) {
      this.selected = -1;
      this.selectedId = -1;
      return;
    }
    if (logic.adjacent(this.selected, idx, this.conf.cols)) {
      const from = this.selected;
      this.selected = -1;
      this.selectedId = -1;
      this.trySwap(from, idx);
    } else {
      this.selected = idx;
      this.selectedId = tile ? tile.id : -1;
    }
  }

  onTouchStart(p) {
    if (this.helpOpen) {
      this.helpDrag = p ? { y: p.y, from: this.helpScroll } : null;
      return;
    }
    if (!p || this.phase !== PLAY || this.confirming) { this.touch = null; return; }
    const cell = this.cellAt(p.x, p.y);
    this.touch = cell >= 0 ? { from: cell, done: false } : null;
  }

  onTouchMove(p) {
    if (this.helpOpen) {
      if (this.helpDrag && p) {
        const next = this.helpDrag.from + (this.helpDrag.y - p.y);
        this.helpScroll = clamp(next, 0, this.helpScrollMax || 0);
      }
      return;
    }
    const touch = this.touch;
    if (!touch || !p || touch.done) return;
    if (this.phase !== PLAY || this.helpOpen || this.confirming) return;
    const cell = this.cellAt(p.x, p.y);
    if (cell < 0 || cell === touch.from) return;
    if (!logic.adjacent(touch.from, cell, this.conf.cols)) return;
    touch.done = true;
    if (this.clock < this.dealUntil || this.busy) return;
    if (!this.isSelectable(touch.from) || !this.isSelectable(cell)) return;
    const from = touch.from;
    this.touch = null;
    this.selected = -1;
    this.selectedId = -1;
    this.trySwap(from, cell);
  }

  onTouchEnd() {
    this.touch = null;
    this.helpDrag = null;
  }

  trySwap(a, b) {
    const { cols, rows } = this.conf;
    if (this.phase !== PLAY || this.busy) return;
    if (!logic.isTile(this.cells[a]) || !logic.isTile(this.cells[b])) return;
    if (!logic.adjacent(a, b, cols)) return;
    this.touchIdle();
    if (!logic.hasMatchAfterSwap(this.cells, cols, rows, a, b)) {
      // 无效交换：两张牌向对方轻推再弹回，不耗步数
      this.spring = { a, b, at: this.clock, dur: SPRING_MS };
      this.selected = -1;
      this.selectedId = -1;
      return;
    }
    this.spring = null;
    this.touch = null;
    const ta = this.tileAt(a);
    const tb = this.tileAt(b);
    this.busy = true;
    this.selected = -1;
    this.selectedId = -1;
    if (ta && tb) {
      const ar = ta.r, ac = ta.c, br = tb.r, bc = tb.c;
      ta.r = br; ta.c = bc; ta.fromR = ar; ta.fromC = ac; ta.moveAt = this.clock; ta.moveDur = SWAP_MS;
      tb.r = ar; tb.c = ac; tb.fromR = br; tb.fromC = bc; tb.moveAt = this.clock; tb.moveDur = SWAP_MS;
    }
    const next = this.cells.slice();
    [next[a], next[b]] = [next[b], next[a]];
    this.cells = next;
    this.schedule(SWAP_MS, () => {
      if (this.phase !== PLAY) { this.busy = false; return; }
      this.moves = Math.max(0, this.moves - 1);
      this.resolve(1);
    });
  }

  // ---------- 连锁结算 ----------

  resolve(chain) {
    if (this.phase !== PLAY) { this.busy = false; return; }
    const { cols, rows, kinds } = this.conf;
    const matched = logic.findMatches(this.cells, cols, rows);
    if (!matched.size) {
      this.settleBoard();
      this.finishTurn();
      return;
    }
    const { blast } = logic.explode(this.cells, cols, rows, matched);
    const all = new Set([...matched, ...blast]);
    const thawed = logic.thawTargets(this.cells, cols, rows, all);
    if (thawed.size) this.thawFx = { set: thawed, at: this.clock };
    const gained = logic.scoreForMatches(matched.size, chain) + logic.scoreForBlast(blast.size, chain);
    this.score += gained;
    if (blast.size) this.shakeAt = this.clock;
    const bombBlast = blast.size > 0;
    this.clearFx = { matched, blast, at: this.clock, huge: matched.size > 3 };
    const celebrated = this.announce(matched.size, chain, gained);
    // 炸弹触发的那次消除即使不足 3 个、没有连击，也播连击（烟花）音。
    if (bombBlast || celebrated) this.app.audio.playFirework();
    else this.app.audio.playElimination();
    this.schedule(CLEAR_MS, () => {
      if (this.phase !== PLAY) { this.clearFx = null; this.busy = false; return; }
      let cleared = this.cells.map((v, i) => (all.has(i) ? null : v));
      this.clearFx = null;
      // 先化冰（原地变回普通 emoji），再让重力穿过墙 / 冰回填
      this.cells = logic.applyThaw(cleared, thawed);
      this.cells = logic.applyGravity(this.cells, cols, rows, kinds, this.spawnOpts());
      // 已消除的牌不能参与配对，否则会被「搬」到底部格再消失（web 同款 survivors）
      const survivors = this.tiles.filter(t => !all.has(t.r * cols + t.c));
      this.syncTiles(survivors, true);
      this.clearStaleSelection();
      this.schedule(FALL_MS, () => this.resolve(chain + 1));
    });
  }

  // cells → tiles 同步：下落只沿列发生，按列内顺序从下往上配对，不能按值配对
  syncTiles(prev, spawn) {
    const cols = this.conf.cols;
    const rows = this.conf.rows;
    const old = prev || [];
    const oldByCol = new Map();
    old.forEach((g) => {
      if (!oldByCol.has(g.c)) oldByCol.set(g.c, []);
      oldByCol.get(g.c).push(g);
    });
    const next = new Map();
    const created = [];
    for (let c = 0; c < cols; c++) {
      const oldCol = oldByCol.get(c) || [];
      const frozenByIdx = new Map();
      const movable = [];
      oldCol.forEach((g) => {
        const idx = g.r * cols + g.c;
        if (logic.isFrozen(g.value)) frozenByIdx.set(idx, g);
        else movable.push(g);
      });
      const targets = [];
      for (let r = 0; r < rows; r++) {
        const i = r * cols + c;
        const v = this.cells[i];
        if (v === null || v === undefined || logic.isWall(v)) continue;
        const fixed = frozenByIdx.get(i);
        if (fixed) {
          next.set(fixed.id, {
            ...fixed, r, c, value: v, fromR: null, fromC: null, moveAt: 0, moveDur: 0, dealAt: 0,
          });
          frozenByIdx.delete(i);
        } else if (logic.isFrozen(v)) {
          created.push(this.newTile(v, r, c));
        } else {
          targets.push(i);
        }
      }
      movable.sort((x, y) => (y.r * cols + y.c) - (x.r * cols + x.c));
      const targetBottomUp = targets.slice().sort((x, y) => y - x);
      const paired = Math.min(movable.length, targetBottomUp.length);
      for (let k = 0; k < paired; k++) {
        const g = movable[k];
        const idx = targetBottomUp[k];
        const r = ~~(idx / cols);
        const cc = idx % cols;
        const moved = g.r !== r || g.c !== cc;
        next.set(g.id, {
          ...g,
          r, c: cc, value: this.cells[idx],
          fromR: moved ? g.r : null,
          fromC: moved ? g.c : null,
          moveAt: moved ? this.clock : 0,
          moveDur: moved ? FALL_MS : 0,
          dealAt: 0,
        });
      }
      const newTargets = targetBottomUp.slice(paired).sort((x, y) => x - y);
      newTargets.forEach((idx, k) => {
        const r = ~~(idx / cols);
        const cc = idx % cols;
        const tile = this.newTile(this.cells[idx], r, cc);
        if (spawn !== false) {
          // 新牌从棋盘上方落入；同一列里越靠上的新牌起点越高
          tile.fromR = -(newTargets.length - k);
          tile.fromC = cc;
          tile.moveAt = this.clock;
          tile.moveDur = REFILL_MS;
        }
        created.push(tile);
      });
    }
    // 老牌保持相对顺序 + 新牌追加末尾，避免渲染层来回搬动
    this.tiles = old.map(g => next.get(g.id)).filter(Boolean).concat(created);
    this.repairTiles();
    this.clearStaleSelection();
  }

  // 兜底：每个有值格子恰好一张牌，重复 id 重新编号
  repairTiles() {
    const cols = this.conf.cols;
    const wanted = new Set();
    for (let i = 0; i < this.cells.length; i++) {
      const v = this.cells[i];
      if (v !== null && v !== undefined && !logic.isWall(v)) wanted.add(i);
    }
    const seen = new Set();
    const seenIds = new Set();
    const kept = [];
    for (const g of this.tiles) {
      const idx = g.r * cols + g.c;
      if (!wanted.has(idx) || seen.has(idx)) continue;
      let item = g.value === this.cells[idx] ? g : { ...g, value: this.cells[idx] };
      if (seenIds.has(item.id)) item = { ...item, id: ++this.tileId };
      seenIds.add(item.id);
      seen.add(idx);
      kept.push(item);
    }
    for (const idx of wanted) {
      if (seen.has(idx)) continue;
      kept.push(this.newTile(this.cells[idx], ~~(idx / cols), idx % cols));
    }
    this.tiles = kept;
  }

  clearStaleSelection() {
    if (this.selected < 0) return;
    const tile = this.tileAt(this.selected);
    if (!tile || (this.selectedId > 0 && tile.id !== this.selectedId)) {
      this.selected = -1;
      this.selectedId = -1;
    }
  }

  settleBoard() {
    const kinds = this.conf.kinds;
    let fixed = false;
    const next = this.cells.slice();
    for (let i = 0; i < next.length; i++) {
      if (next[i] === null || next[i] === undefined) {
        next[i] = Math.floor(Math.random() * kinds);
        fixed = true;
      }
    }
    if (fixed) this.cells = next;
    this.syncTiles(this.tiles, false);
    this.tiles.forEach((tile) => {
      tile.fromR = null;
      tile.fromC = null;
      tile.moveAt = 0;
      tile.moveDur = 0;
      tile.dealAt = 0;
    });
    this.clearFx = null;
    this.thawFx = null;
    this.dealUntil = 0;
  }

  finishTurn() {
    this.busy = false;
    if (this.phase !== PLAY) return;
    this.settleBoard();
    this.clearStaleSelection();
    if (this.score >= this.conf.target) { this.winLevel(); return; }
    if (this.moves <= 0) { this.loseLevel(); return; }
    if (!logic.hasAnyMove(this.cells, this.conf.cols, this.conf.rows, this.conf.kinds)) {
      this.cells = logic.reshuffle(this.cells, this.conf.cols, this.conf.rows, this.conf.kinds);
      this.syncTiles(this.tiles, false);
      this.selected = -1;
      this.selectedId = -1;
    }
    this.save();
    this.touchIdle();
  }

  winLevel() {
    if (this.phase !== PLAY) return;
    this.phase = WON;
    this.busy = false;
    achv.win('crush', { level: this.level + 1 });
    if (this.level + 1 > this.best) {
      this.best = this.level + 1;
      setRaw(BEST_KEY, String(this.best));
    }
    this.startConfetti();
    this.app.audio.playSuccess();
    this.save();
  }

  loseLevel() {
    if (this.phase !== PLAY) return;
    this.phase = OVER;
    this.busy = false;
    this.app.audio.playLose();
    this.save();
  }

  // ---------- 庆祝 / 撒花 ----------

  announce(count, chain, gained) {
    const big = count > 3;
    const combo = chain > 1;
    if (!big && !combo) return false;
    const tier = big && combo ? 3 : combo ? 2 : 1;
    const lines = [];
    if (combo) lines.push(t('crush.niceCombo').replace('{n}', String(chain)));
    if (big) lines.push(t('crush.niceBig').replace('{n}', String(count)));
    // 与 web 的 celebrate-pop 动画时长对齐：0.95s 内完成弹出 → 上飘 → 淡出。
    this.celebrate = { lines, gained, tier, at: this.clock, dur: 950 };
    this.glowAt = this.clock;
    // 小庆祝复用统一 confetti，不另写一套粒子模板（PITFALLS #46）
    confetti.spawn(this.confetti, {
      W, H, count: Math.min(14, 6 + tier * 3), startY: this.boardY + this.boardH * 0.55,
    });
    return true;
  }

  startConfetti() {
    this.confetti = [];
    this.confettiUntil = this.clock + 1200;
    this.lastConfettiAt = this.clock - 1000;
  }

  emitConfetti() {
    confetti.spawn(this.confetti, { W, H, startY: H * 0.58 });
  }

  // ---------- 布局 ----------

  layout() {
    this.cw = Math.min(W - 32, 440);
    this.cx = (W - this.cw) / 2;
    this.headerY = HEADER.TOP;
    this.headerH = HEADER.HEIGHT;
    this.homeRect = { ...HEADER.HOME_RECT };
    this.scoreY = this.headerY + this.headerH + 12;
    this.scoreH = 72;
    this.optY = this.scoreY + this.scoreH + 16;
    this.optH = 72;
    const boardTop = this.optY + this.optH + 16;
    const reserve = SAFE_BOTTOM + 100;
    const availH = Math.max(120, H - boardTop - reserve);
    const c = this.conf;
    this.pad = 8;
    this.gap = 4;
    this.cell = Math.max(10, Math.min(
      96,
      Math.floor((this.cw - this.pad * 2 - (c.cols - 1) * this.gap) / c.cols),
      Math.floor((availH - this.pad * 2 - (c.rows - 1) * this.gap) / c.rows),
    ));
    this.pitch = this.cell + this.gap;
    this.boardW = c.cols * this.cell + (c.cols - 1) * this.gap + this.pad * 2;
    this.boardH = c.rows * this.cell + (c.rows - 1) * this.gap + this.pad * 2;
    this.boardX = (W - this.boardW) / 2;
    this.boardY = boardTop + Math.max(0, (availH - this.boardH) / 2);
    this.innerX = this.boardX + this.pad;
    this.innerY = this.boardY + this.pad;
    this.innerW = c.cols * this.cell + (c.cols - 1) * this.gap;
    this.innerH = c.rows * this.cell + (c.rows - 1) * this.gap;
    this.fabSize = 48;
    this.helpX = W - 16 - this.fabSize;
    this.opX = this.helpX - 60;
    this.fabY = H - SAFE_BOTTOM - 16 - this.fabSize;
  }

  // ---------- 渲染 ----------

  faceOf(value) {
    if (value === logic.BOMB) return BOMB_FACE;
    if (value === logic.WILD) return WILD_FACE;
    if (logic.isFrozen(value)) return cards.EMOJIS[logic.frozenKind(value)] || cards.EMOJIS[0];
    return cards.EMOJIS[value] || cards.EMOJIS[0];
  }

  render(c) {
    this.buttons = [];
    this.now = this.clock;
    const T = theme.tokens;
    c.fillStyle = T.bg;
    c.fillRect(0, 0, W, H);
    if (this.bg) this.bg.draw(c, theme.dark);
    this.drawHeader(c);
    this.drawScore(c);
    this.drawOptions(c);
    this.drawBoard(c);
    this.drawCelebration(c);
    if (this.phase !== PLAY) this.drawResult(c);
    this.drawConfetti(c);
    if (!this.helpOpen && !this.confirming) this.drawFabs(c);
    if (this.helpOpen) this.drawHelp(c);
    else if (this.confirming) this.drawConfirm(c);
  }

  drawHeader(c) {
    const T = theme.tokens;
    D.text(c, t('crush.gameTitle'), W / 2, this.headerY + this.headerH / 2, {
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
    const q = this.cw / 4;
    const stats = [
      [t('crush.levelLabel'), String(this.level), T.text],
      [t('crush.movesLabel'), String(this.moves), this.moves <= 0 ? T.lose : T.text],
      [t('crush.score'), String(this.score), T.primary],
      [t('crush.targetLabel'), String(this.conf.target), T.text],
    ];
    stats.forEach(([label, value, color], i) => {
      if (i) D.divider(c, this.cx + q * i, this.scoreY + this.scoreH / 2, 24, T.border, 1);
      D.text(c, label, this.cx + q * (i + 0.5), this.scoreY + 23, { size: 10.5, color: T.muted, align: 'center' });
      D.text(c, value, this.cx + q * (i + 0.5), this.scoreY + 48, { size: 20, weight: 'bold', color, align: 'center' });
    });
    const progress = this.conf.target ? this.score / this.conf.target : 0;
    D.progressBar(c, this.cx, this.scoreY, this.cw, this.scoreH, Math.min(1, progress), T.border, T.primary);
  }

  drawOptions(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.optY, this.cw, this.optH, T);
    const split = this.cx + this.cw / 2;
    D.divider(c, split, this.optY + this.optH / 2, 24, T.border, 1);
    // 盘面信息：列×行 · 种类 · 实际墙数（0 面墙不显示）；最高关卡单独一行，避免挤到 9px
    const wallCount = this.cells.filter(logic.isWall).length;
    const kinds = t('crush.kindsLabel').replace('{n}', String(this.conf.kinds));
    const walls = wallCount ? ` · ${t('crush.wallsLabel').replace('{n}', String(wallCount))}` : '';
    const info = `${this.conf.cols}×${this.conf.rows} · ${kinds}${walls}`;
    const maxW = (split - this.cx) - 16;
    const fitSize = (value, from, min) => {
      let next = from;
      while (next > min && D.measure(c, value, next) > maxW) next -= 0.5;
      return next;
    };
    if (this.best > 1) {
      D.text(c, info, this.cx + (split - this.cx) / 2, this.optY + 27, {
        size: fitSize(info, 12, 9), color: T.muted, align: 'center',
      });
      const bestText = `${t('crush.bestLabel')} ${this.best}`;
      D.text(c, bestText, this.cx + (split - this.cx) / 2, this.optY + 47, {
        size: fitSize(bestText, 10.5, 8.5), color: T.muted, align: 'center',
      });
    } else {
      D.text(c, info, this.cx + (split - this.cx) / 2, this.optY + this.optH / 2, {
        size: fitSize(info, 12, 9), color: T.muted, align: 'center',
      });
    }
    const label = t('crush.start');
    const bw = Math.min(112, D.measure(c, label, 13, 'bold') + 24);
    const bx = split + (this.cx + this.cw - split) / 2 - bw / 2;
    const by = this.optY + 20;
    D.fillRoundRect(c, bx, by, bw, 32, 8, T.primary);
    D.text(c, label, bx + bw / 2, by + 16, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('new', bx, by, bw, 32, () => this.openConfirm());
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
    // 点阵底纹 + 格子底色 + 墙，统一裁在棋盘里
    c.save();
    D.roundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 14);
    c.clip();
    c.fillStyle = T.boardDot;
    for (let x = this.boardX + 5; x < this.boardX + this.boardW; x += 10) {
      for (let y = this.boardY + 5; y < this.boardY + this.boardH; y += 10) {
        c.beginPath();
        c.arc(x, y, 1.1, 0, Math.PI * 2);
        c.fill();
      }
    }
    const cellBg = theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(238,228,218,0.35)';
    for (let r = 0; r < this.conf.rows; r++) {
      for (let col = 0; col < this.conf.cols; col++) {
        const x = this.innerX + col * this.pitch;
        const y = this.innerY + r * this.pitch;
        const v = this.cells[r * this.conf.cols + col];
        if (logic.isWall(v)) { this.drawWall(c, x, y); continue; }
        D.fillRoundRect(c, x, y, this.cell, this.cell, 8, cellBg);
      }
    }
    c.restore();
    // 牌面只裁在内盘范围内：新补的牌从上方落入时不会画到棋盘外
    c.save();
    D.roundRect(c, this.innerX, this.innerY, this.innerW, this.innerH, 8);
    c.clip();
    const ordered = this.tiles.slice().sort((a, b) => this.drawRank(a) - this.drawRank(b));
    ordered.forEach(tile => this.drawTile(c, tile));
    c.restore();
    // 大消 / 连锁时棋盘外圈闪光
    if (now - this.glowAt < GLOW_MS) {
      const p = clamp((now - this.glowAt) / GLOW_MS, 0, 1);
      c.save();
      c.globalAlpha = (1 - p) * 0.8;
      c.strokeStyle = T.primary;
      c.lineWidth = 3 + 5 * Math.sin(p * Math.PI);
      D.roundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 14);
      c.stroke();
      c.restore();
    }
    c.restore();
    // 点击区：只给可操作、且不在本轮消除里的格子（墙 / 冰块 / 空格不响应）
    if (this.phase === PLAY && !this.helpOpen && !this.confirming) {
      for (let i = 0; i < this.cells.length; i++) {
        if (!logic.isTile(this.cells[i]) || this.isClearing(i)) continue;
        const r = ~~(i / this.conf.cols);
        const col = i % this.conf.cols;
        const x = this.innerX + col * this.pitch;
        const y = this.innerY + r * this.pitch;
        this.addButton(`cell-${i}`, x, y, this.cell, this.cell, () => this.onCellTap(i));
      }
    }
  }

  drawRank(tile) {
    const idx = tile.r * this.conf.cols + tile.c;
    if (this.isClearing(idx)) return 3;
    if (this.selected === idx && (this.selectedId < 0 || tile.id === this.selectedId)) return 2;
    if (this.hint && (this.hint.a === idx || this.hint.b === idx)) return 1;
    return 0;
  }

  drawWall(c, x, y) {
    const w = this.cell;
    const bg = theme.dark ? 'rgba(255,255,255,0.14)' : '#e4e8ee';
    D.fillRoundRect(c, x, y, w, w, 8, bg);
    c.save();
    D.roundRect(c, x, y, w, w, 8);
    c.clip();
    c.strokeStyle = theme.dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.14)';
    c.lineWidth = 2;
    for (let i = -w; i < w * 2; i += 7) {
      c.beginPath();
      c.moveTo(x + i, y);
      c.lineTo(x + i - w, y + w);
      c.stroke();
    }
    c.restore();
    D.strokeRoundRect(c, x + 1, y + 1, w - 2, w - 2, 7,
      theme.dark ? 'rgba(255,255,255,0.2)' : 'rgba(90,80,70,0.22)', 1);
  }

  tilePos(tile) {
    let r = tile.r;
    let c = tile.c;
    if (tile.moveAt && tile.moveDur) {
      const p = clamp((this.now - tile.moveAt) / tile.moveDur, 0, 1);
      const e = easeOut(p);
      if (tile.fromR !== null) r = tile.fromR + (tile.r - tile.fromR) * e;
      if (tile.fromC !== null) c = tile.fromC + (tile.c - tile.fromC) * e;
    }
    return { x: this.innerX + c * this.pitch, y: this.innerY + r * this.pitch };
  }

  drawTile(c, tile) {
    const T = theme.tokens;
    const now = this.now;
    const w = this.cell;
    if (tile.dealAt && now < tile.dealAt) return;
    const pos = this.tilePos(tile);
    const idx = tile.r * this.conf.cols + tile.c;
    const cols = this.conf.cols;
    let scale = 1;
    let alpha = 1;
    let bonusX = 0;
    let bonusY = 0;
    if (tile.dealAt) {
      const p = clamp((now - tile.dealAt) / DEAL_MS, 0, 1);
      scale = 0.2 + 0.8 * easeOut(p);
      alpha = Math.min(1, p * 2.5);
    }
    // 无效交换：两张牌向对方轻推后弹回
    if (this.spring && (idx === this.spring.a || idx === this.spring.b)) {
      const p = clamp((now - this.spring.at) / this.spring.dur, 0, 1);
      const k = Math.sin(p * Math.PI) * 0.42 * this.pitch;
      const other = idx === this.spring.a ? this.spring.b : this.spring.a;
      const or = ~~(other / cols);
      const oc = other % cols;
      bonusX = (oc - tile.c) * k;
      bonusY = (or - tile.r) * k;
    }
    const isSelected = this.selected === idx && (this.selectedId < 0 || tile.id === this.selectedId);
    const value = tile.value;
    let clearP = 0;
    let blasting = false;
    if (this.clearFx) {
      const age = now - this.clearFx.at;
      if (this.clearFx.matched.has(idx)) {
        const p = clamp(age / CLEAR_MS, 0, 1);
        // 先放大再缩小 + 两次闪烁
        const grow = p < 0.38 ? 1 + 0.25 * (p / 0.38) : 1.25 * (1 - (p - 0.38) / 0.62);
        scale *= Math.max(0, grow) * (this.clearFx.huge ? 1.08 : 1);
        alpha *= 0.55 + 0.45 * Math.abs(Math.cos(p * Math.PI * 2));
      } else if (this.clearFx.blast.has(idx)) {
        const p = clamp(age / CLEAR_MS, 0, 1);
        scale *= 1 + 0.7 * p;
        alpha *= 1 - p;
        blasting = true;
        clearP = p;
      }
    }
    if (value === logic.BOMB || value === logic.WILD) {
      scale *= 0.95 + 0.05 * Math.sin(now / 1600 * Math.PI * 2);
    }
    const hinted = !!this.hint && (this.hint.a === idx || this.hint.b === idx);
    if (hinted) {
      scale *= 1 + 0.14 * Math.abs(Math.sin((now - this.hint.at) / 800 * Math.PI * 2));
    }
    if (isSelected) scale *= 1.06;
    if (scale <= 0 || alpha <= 0) return;
    const face = this.faceOf(value);
    const frozen = logic.isFrozen(value);
    const thawing = !!(this.thawFx && this.thawFx.set.has(idx));
    const drawX = pos.x + bonusX;
    const drawY = pos.y + bonusY;
    c.save();
    c.globalAlpha = clamp(alpha, 0, 1);
    c.translate(drawX + w / 2, drawY + w / 2);
    c.scale(scale, scale);
    const dx = -w / 2;
    const dy = -w / 2;
    if (hinted) {
      const pulse = 0.35 + 0.3 * Math.abs(Math.sin((now - this.hint.at) / 800 * Math.PI * 2));
      c.save();
      c.globalAlpha = c.globalAlpha * pulse;
      c.fillStyle = theme.dark ? 'rgba(242,208,145,0.72)' : '#fff1c2';
      D.fillRoundRect(c, dx - 2.5, dy - 2.5, w + 5, w + 5, 10, theme.dark ? 'rgba(242,208,145,0.5)' : '#fff1c2');
      c.restore();
    }
    cards.draw(c, face, cards.MODE_EMOJI, dx, dy, w, w, true);
    // 炸弹 / 万能元素：统一牌面上叠一层淡色 + 重画 emoji，再补一圈语义色描边
    if (value === logic.BOMB || value === logic.WILD) {
      const tint = value === logic.BOMB
        ? (theme.dark ? 'rgba(229,127,121,0.16)' : 'rgba(200,70,60,0.12)')
        : (theme.dark ? 'rgba(78,201,138,0.16)' : 'rgba(35,128,78,0.10)');
      D.fillRoundRect(c, dx + 0.5, dy + 0.5, w - 1, w - 1, 7, tint);
      cards.drawEmoji(c, face, 0, 0, Math.max(10, Math.round(w * 0.58)));
      D.strokeRoundRect(c, dx + 1, dy + 1, w - 2, w - 2, 8,
        value === logic.BOMB ? T.del : T.primary, 1.5);
    }
    if (frozen) {
      const iceAlpha = thawing ? Math.max(0, 1 - (now - this.thawFx.at) / 260) : 1;
      this.drawIce(c, dx, dy, w, iceAlpha);
    }
    if (isSelected) {
      D.strokeRoundRect(c, dx + 1, dy + 1, w - 2, w - 2, 8, T.primary, 2);
    }
    if (blasting) {
      c.globalAlpha = clamp(alpha * (1 - clearP), 0, 1) * 0.85;
      D.fillRoundRect(c, dx, dy, w, w, 8, '#ffffff');
    }
    c.restore();
    if (thawing) this.drawThawShards(c, drawX + w / 2, drawY + w / 2, now - this.thawFx.at);
  }

  drawIce(c, x, y, w, alpha) {
    if (alpha <= 0) return;
    c.save();
    c.globalAlpha = clamp(c.globalAlpha * alpha, 0, 1);
    D.roundRect(c, x, y, w, w, 8);
    c.clip();
    c.fillStyle = theme.dark ? 'rgba(112,164,200,0.42)' : 'rgba(150,208,242,0.40)';
    c.fillRect(x, y, w, w);
    c.fillStyle = theme.dark ? 'rgba(214,238,252,0.22)' : 'rgba(255,255,255,0.32)';
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + w, y);
    c.lineTo(x + w, y + w * 0.36);
    c.closePath();
    c.fill();
    c.restore();
    c.save();
    c.globalAlpha = clamp(c.globalAlpha * alpha, 0, 1);
    D.strokeRoundRect(c, x + 0.5, y + 0.5, w - 1, w - 1, 8,
      theme.dark ? 'rgba(220,240,252,0.55)' : 'rgba(255,255,255,0.92)', 1);
    D.text(c, '❄', x + w * 0.80, y + w * 0.75, {
      size: Math.max(8, Math.round(w * 0.30)), color: '#ffffff', align: 'center',
    });
    c.restore();
  }

  drawThawShards(c, cx, cy, age) {
    const p = clamp(age / 360, 0, 1);
    if (p >= 1) return;
    const dist = easeOut(p);
    c.save();
    c.globalAlpha = 1 - p;
    c.fillStyle = theme.dark ? '#5f9dc4' : '#7cc0e8';
    ICE_SHARDS.forEach((sh) => {
      const x = cx + sh[0] * this.pitch * dist;
      const y = cy + sh[1] * this.pitch * dist;
      const s = Math.max(2, this.cell * 0.16 * sh[3] * (1 - p * 0.5));
      c.save();
      c.translate(x, y);
      c.rotate((sh[2] * Math.PI) / 180);
      c.beginPath();
      c.moveTo(0, -s);
      c.lineTo(s * 0.7, 0);
      c.lineTo(0, s);
      c.lineTo(-s * 0.7, 0);
      c.closePath();
      c.fill();
      c.restore();
    });
    c.restore();
  }

  drawCelebration(c) {
    const e = this.celebrate;
    if (!e) return;
    const T = theme.tokens;
    const p = clamp((this.now - e.at) / e.dur, 0, 1);
    const scale = p < 0.28 ? 0.4 + 0.76 * (p / 0.28)
      : p < 0.44 ? 1.16 - 0.16 * ((p - 0.28) / 0.16) : 1;
    const alpha = p > 0.78 ? 1 - (p - 0.78) / 0.22 : 1;
    const rise = p > 0.44 ? ((p - 0.44) / 0.56) * 26 : 0;
    const size = e.tier === 3 ? 24 : e.tier === 2 ? 21 : 18;
    const scoreSize = 14;
    const cx = W / 2;
    const cy = this.boardY + this.boardH / 2 - rise;
    c.save();
    c.globalAlpha = alpha;
    c.translate(cx, cy);
    c.scale(scale, scale);
    const widest = Math.max(
      ...e.lines.map(line => D.measure(c, line, size, 'bold')),
      D.measure(c, `+${e.gained}`, scoreSize, 'bold'),
    );
    const w = Math.min(this.boardW - 8, widest + 36);
    const h = e.lines.length * size * 1.22 + scoreSize * 1.5 + 16;
    c.save();
    c.shadowColor = 'rgba(35,128,78,0.5)';
    c.shadowBlur = e.tier * 8;
    D.fillRoundRect(c, -w / 2, -h / 2, w, h, 8, T.primary);
    c.restore();
    e.lines.forEach((line, i) => {
      D.text(c, line, 0, -h / 2 + 8 + size * 0.62 + i * size * 1.22, {
        size, weight: 'bold', color: '#ffffff', align: 'center',
      });
    });
    D.text(c, `+${e.gained}`, 0, h / 2 - 6 - scoreSize * 0.65, {
      size: scoreSize, weight: 'bold', color: 'rgba(255,255,255,0.92)', align: 'center',
    });
    c.restore();
  }

  drawResult(c) {
    if (!this.resultVisible()) return;
    const T = theme.tokens;
    const overlay = theme.dark ? 'rgba(38,38,38,0.92)' : 'rgba(250,248,239,0.92)';
    D.fillRoundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 14, overlay);
    const cx = this.boardX + this.boardW / 2;
    const cy = this.boardY + this.boardH / 2;
    if (this.phase === WON) {
      D.text(c, `🎉🎉 ${t('crush.levelDone').replace('{n}', String(this.level))} 🎉🎉`, cx, cy - 62, {
        size: 16, weight: 'bold', color: T.win, align: 'center',
      });
      D.text(c, String(this.score), cx, cy - 18, { size: 30, weight: 'bold', color: T.text, align: 'center' });
      const l1 = t('crush.replayLevel');
      const l2 = t('crush.nextLevel');
      const w1 = Math.min(120, D.measure(c, l1, 12, 'bold') + 22);
      const w2 = Math.min(112, D.measure(c, l2, 12, 'bold') + 22);
      const gap = 10;
      const bx = cx - (w1 + w2 + gap) / 2;
      const by = cy + 24;
      D.fillRoundRect(c, bx, by, w1, 32, 8, 'rgba(0,0,0,0)');
      D.strokeRoundRect(c, bx, by, w1, 32, 8, T.god, 1);
      D.text(c, l1, bx + w1 / 2, by + 16, { size: 12, weight: 'bold', color: T.god, align: 'center' });
      this.addButton('result-replay', bx, by, w1, 32, () => this.replayLevel());
      D.fillRoundRect(c, bx + w1 + gap, by, w2, 32, 8, T.primary);
      D.text(c, l2, bx + w1 + gap + w2 / 2, by + 16, { size: 12, weight: 'bold', color: '#ffffff', align: 'center' });
      this.addButton('result-next', bx + w1 + gap, by, w2, 32, () => this.nextLevel());
    } else {
      D.text(c, `👻👻 ${t('crush.gameover')} 👻👻`, cx, cy - 52, {
        size: 17, weight: 'bold', color: T.lose, align: 'center',
      });
      D.text(c, `${this.score} / ${this.conf.target}`, cx, cy - 12, {
        size: 26, weight: 'bold', color: T.text, align: 'center',
      });
      const label = t('crush.replayLevel');
      const bw = Math.min(128, D.measure(c, label, 12, 'bold') + 24);
      const bx = cx - bw / 2;
      const by = cy + 28;
      D.fillRoundRect(c, bx, by, bw, 32, 8, 'rgba(0,0,0,0)');
      D.strokeRoundRect(c, bx, by, bw, 32, 8, T.god, 1);
      D.text(c, label, cx, by + 16, { size: 12, weight: 'bold', color: T.god, align: 'center' });
      this.addButton('result-replay', bx, by, bw, 32, () => this.replayLevel());
    }
  }

  drawConfetti(c) {
    if (this.confetti.length) confetti.draw(c, this.confetti);
  }

  drawFabs(c) {
    // 帮助按钮旁不再放操作 FAB（新游戏在操作卡里已有入口）。
    this.drawRoundFab(c, this.helpX, this.fabY, 'help', '?', () => this.openHelp());
    fabKit.drawMute(this, c, fabKit.leftSlot({ x: this.helpX, y: this.fabY, w: this.fabSize, h: this.fabSize }));
  }

  drawRoundFab(c, x, y, iconKey, fallback, onTap) {
    const T = theme.tokens;
    const size = this.fabSize;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.12)';
    c.shadowBlur = 10;
    c.shadowOffsetY = 2;
    D.circle(c, x + size / 2, y + size / 2, size / 2, T.card);
    c.restore();
    if (!icons.draw(c, iconKey, x + size / 2, y + size / 2, 22, T.primary)) {
      D.text(c, fallback, x + size / 2, y + size / 2, {
        size: 21, weight: 'bold', color: T.primary, align: 'center',
      });
    }
    this.addButton(`fab-${iconKey}`, x, y, size, size, onTap);
  }

  openHelp() {
    this.helpOpen = true;
    this.helpScroll = 0;
    this.helpDrag = null;
  }

  openConfirm() {
    if (this.helpOpen) return;
    this.confirming = true;
    this.selected = -1;
    this.selectedId = -1;
    this.touch = null;
  }

  drawHelp(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillRect(0, 0, W, H);
    const x = 18;
    const w = W - 36;
    const innerW = w - 36;
    const size = 11.5;
    const lineH = 16;
    const blocks = [];
    ['helpMsg', 'help1', 'help2', 'help3', 'help4', 'help5', 'help6', 'help7', 'help8', 'help9'].forEach((key) => {
      const value = t(`crush.${key}`);
      if (value === `crush.${key}`) return;
      blocks.push({ lines: D.wrapText(c, value, innerW, size), gap: 6 });
    });
    let contentH = 0;
    blocks.forEach((b) => { contentH += b.lines.length * lineH + b.gap; });
    const headerH = 54;
    const footerH = 52;
    const maxH = H - SAFE_BOTTOM - 24;
    // 上下各留 4px 内边距，避免首尾行贴着面板边
    const contentBoxH = contentH + 8;
    const h = Math.min(maxH, headerH + contentBoxH + footerH);
    const y = Math.max(12, (H - h) / 2);
    D.card(c, x, y, w, h, T);
    D.text(c, '?', x + 24, y + 30, { size: 24, weight: 'bold', color: T.primary });
    D.text(c, t('help'), x + 50, y + 30, { size: 16, weight: 'bold', color: T.text });
    const viewTop = y + headerH;
    const viewH = h - headerH - footerH;
    this.helpScrollMax = Math.max(0, contentBoxH - viewH);
    this.helpScroll = clamp(this.helpScroll, 0, this.helpScrollMax);
    if (this.helpScrollMax > 0) {
      D.text(c, t('crush.scrollTip'), x + w - 16, y + 30, { size: 9.5, color: T.muted, align: 'right' });
    }
    c.save();
    D.roundRect(c, x + 1, viewTop, w - 2, viewH, 8);
    c.clip();
    let ly = viewTop + 4 - this.helpScroll;
    const bottom = viewTop + viewH;
    blocks.forEach((b) => {
      b.lines.forEach((line) => {
        if (line && ly > viewTop - lineH && ly < bottom) {
          D.text(c, line, x + 18, ly, { size, color: T.text });
        }
        ly += lineH;
      });
      ly += b.gap;
    });
    c.restore();
    if (this.helpScrollMax > 0) {
      // 右侧滚动条：告诉玩家还能往下看
      const trackX = x + w - 7;
      const trackY = viewTop + 4;
      const trackH = viewH - 8;
      D.fillRoundRect(c, trackX, trackY, 3, trackH, 2, T.border);
      const thumbH = Math.max(22, trackH * (viewH / contentBoxH));
      const thumbY = trackY + (trackH - thumbH) * (this.helpScroll / this.helpScrollMax);
      D.fillRoundRect(c, trackX - 1, thumbY, 5, thumbH, 2.5, T.muted);
    }
    this.addButton('help-mask', 0, 0, W, H, () => {
      this.helpOpen = false;
      this.helpDrag = null;
    });
    const bw = 104;
    const bx = x + (w - bw) / 2;
    const by = y + h - 40;
    D.fillRoundRect(c, bx, by, bw, 30, 8, T.primary);
    D.text(c, t('crush.confirmText'), bx + bw / 2, by + 15, {
      size: 12, weight: 'bold', color: '#ffffff', align: 'center',
    });
    this.addButton('help-ok', bx, by, bw, 30, () => { this.helpOpen = false; });
  }

  drawConfirm(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(0, 0, W, H);
    const w = Math.min(W - 48, 330);
    const h = 214;
    const x = (W - w) / 2;
    const y = (H - h) / 2;
    D.card(c, x, y, w, h, T);
    D.text(c, t('crush.confirmTitle'), x + 20, y + 32, { size: 16, weight: 'bold', color: T.text });
    const lines = D.wrapText(c, t('crush.confirmMsg'), w - 40, 12.5).slice(0, 4);
    lines.forEach((line, i) => {
      D.text(c, line, x + 20, y + 60 + i * 19, { size: 12.5, color: T.muted });
    });
    const gap = 8;
    const bw = (w - 40 - gap * 2) / 3;
    const by = y + h - 48;
    // mask 先加入，面板按钮后加入，命中优先（PITFALLS #12）
    this.addButton('confirm-mask', 0, 0, W, H, () => { this.confirming = false; });
    D.fillRoundRect(c, x + 20, by, bw, 32, 8, 'rgba(0,0,0,0)');
    D.strokeRoundRect(c, x + 20, by, bw, 32, 8, T.border, 1);
    D.text(c, t('crush.confirmCancel'), x + 20 + bw / 2, by + 16, {
      size: 11, weight: 'bold', color: T.text, align: 'center',
    });
    this.addButton('confirm-cancel', x + 20, by, bw, 32, () => { this.confirming = false; });
    const rx = x + 20 + bw + gap;
    D.fillRoundRect(c, rx, by, bw, 32, 8, 'rgba(0,0,0,0)');
    D.strokeRoundRect(c, rx, by, bw, 32, 8, T.god, 1);
    D.text(c, t('crush.confirmReplay'), rx + bw / 2, by + 16, {
      size: 11, weight: 'bold', color: T.god, align: 'center',
    });
    this.addButton('confirm-replay', rx, by, bw, 32, () => this.replayLevel());
    const ox = x + 20 + (bw + gap) * 2;
    D.fillRoundRect(c, ox, by, bw, 32, 8, T.primary);
    D.text(c, t('crush.confirmOk'), ox + bw / 2, by + 16, {
      size: 11, weight: 'bold', color: '#ffffff', align: 'center',
    });
    this.addButton('confirm-ok', ox, by, bw, 32, () => this.startNewGame());
  }

  // ---------- 生命周期 ----------

  onResize() { this.layout(); }
  onTheme() { this.layout(); }
  onHide() {
    // 连锁结算中不落档，避免存下「有现成三连但还没结算」的中间盘面
    if (!this.busy) this.save();
  }
  onShow() {}
}

module.exports = CrushScene;
