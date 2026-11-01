// 雀圣 · 微信小游戏 canvas 场景。
// 玩法 / 数值 / 存档 key 与 web `src/games/quesheng/` 对齐：纯逻辑在 ./board.js
// （可直接 require 做离线自检），这里只负责布局、绘制、滑动 / 点选、动画与存档。
// 牌面统一走 core/cards.js（麻将雪碧图 + 8px 圆角裁切），本文件不写任何私有牌面绘制。
const { W, H, SAFE_BOTTOM } = require('../../core/canvas');
const { Scene } = require('../../core/app');
const theme = require('../../core/theme');
const { t } = require('../../core/i18n');
const { getRaw, setRaw } = require('../../core/storage');
const D = require('../../core/draw');
const ParticleField = require('../../core/particles');
const icons = require('../../core/icons');
const cards = require('../../core/cards');
const tiles = require('../../core/tiles');
const HEADER = require('../../core/header');
const confetti = require('../../core/confetti');
const motion = require('../../core/motion');
const board = require('./board');
const i18nDict = require('./i18n');

const coreI18n = require('../../core/i18n');
if (!coreI18n.__queshengRegistered) {
  coreI18n.register('quesheng', i18nDict);
  coreI18n.__queshengRegistered = true;
}

// 存档 key 严格沿用 web（雀圣）：局面 / 最高关卡 / 帮助是否弹过。
// 本移植版只做「一路滑到底」的经典模式，因此只用不带 _2 后缀的那一套 key。
const STATE_KEY = '__quesheng__state';
const STATE_KEY_2 = '__quesheng__state_2';
const BEST_KEY = '__quesheng__level';
const BEST_KEY_2 = '__quesheng__level_2';
const MODE_KEY = '__quesheng__mode';
const HELP_KEY = '__quesheng__help_showed';

const PLAY = 'play';
const WON = 'won';
const OVER = 'over';
const PHASES = [PLAY, WON, OVER];

const SIZE = board.SIZE;
const CELLS = board.CELLS;
const HAND_TILES = board.HAND_TILES;
const MODE = cards.MODE_MAHJONG;
const RATIO = cards.ratio(MODE);

const CELL_GAP = 6;
const BOARD_PAD = 8;
const DEAL_STEP = 22;          // 行优先逐张入场：rank * 22ms
const DEAL_MS = 300;
const SLIDE_MS = 150;          // 松手后落定
const SETTLE_MS = 130;         // 未过阈值弹回
const DRAG_SLOP = 10;          // 10px 锁定方向（与 Threes 同一套参数）
const DRAG_MIN = 0.5;          // 松手 ≥ 50% 格距提交
const DRAG_COMMIT = 0.95;      // 拖到 95% 直接提交
const CLEAR_MS = motion.TOTAL_MS; // 消除闪烁统一走 core/motion（最多两次明暗循环）
const RESULT_DELAY = 250;      // 结算遮罩至少延迟（Scene.resultVisible）
const RING_IN_MS = 160;
const CONFETTI_MS = 1100;
const HINT_H = 26;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const easeOut = p => 1 - Math.pow(1 - p, 3);
const readInt = (key, dflt) => {
  const v = Number(getRaw(key, dflt));
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : dflt;
};
const isSuit = suit => board.SUITS.indexOf(suit) >= 0;
const validFace = tile => !!tile && isSuit(tile.suit)
  && Number.isInteger(tile.num) && tile.num >= 1
  && tile.num <= board.NUM_MAX[tile.suit];
// cards.draw 的麻将分支按 { suit, value } 取雪碧图格子（core/tiles 的 key 是 `m1` / `z7`）。
const faceOf = tile => ({ suit: tile.suit, value: tile.num });

class QueshengScene extends Scene {
  constructor(app) {
    super(app);
    this.bg = new ParticleField();

    // ---------- 局面 ----------
    this.phase = PLAY;
    this.level = 1;
    this.movesLeft = 0;
    this.board = new Array(CELLS).fill(null);
    this.groups = [];
    this.selected = [];
    this.hint = null;
    this.ghosts = [];            // 刚消掉的牌：{ tile, cell, at }
    this.history = [];
    this.future = [];
    this.mode = +getRaw(MODE_KEY, 1) === 2 ? 2 : 1;
    this.best = readInt(this.bestKey(), 1);
    this.godSolution = null;
    this.godPlaying = false;
    this.godTimers = [];
    this.tileId = 0;

    // ---------- 动画 / 交互 ----------
    this.now = Date.now();
    this.pausedAt = 0;
    this.dealStart = 0;
    this.dealEnd = 0;
    this.slideAnim = null;       // { start, dur, offsets: Map(id -> {x,y}) }
    this.settle = null;          // { start, dur, dir, dist, stepsById }
    this.drag = null;            // { dir, dist, stepsById, maxSteps }
    this.press = null;
    this.ringAt = 0;
    this.checkAt = 0;
    this.confetti = [];
    this.confettiUntil = 0;
    this.lastConfettiAt = 0;
    this.helpOpen = false;
    this.confirming = false;
    this.resultSerial = 0;

    this.layout();
    tiles.preload();
    this.boot();
  }

  stateKey() { return this.mode === 2 ? STATE_KEY_2 : STATE_KEY; }
  bestKey() { return this.mode === 2 ? BEST_KEY_2 : BEST_KEY; }
  boot() {
    if (!this.restore()) this.startLevel(Math.max(1, this.best));
  }

  // ---------- storage ----------

  save() {
    try {
      const packBoard = list => list.map(tile => (tile ? { suit: tile.suit, num: tile.num } : null));
      const packSnap = snap => ({
        board: packBoard(snap.board),
        movesLeft: snap.movesLeft,
        level: snap.level,
      });
      setRaw(this.stateKey(), JSON.stringify({
        level: this.level,
        phase: this.phase,
        movesLeft: this.movesLeft,
        board: packBoard(this.board),
        history: this.history.map(packSnap),
        future: this.future.map(packSnap),
      }));
      if (this.level > this.best) {
        this.best = this.level;
        setRaw(this.bestKey(), String(this.best));
      }
    } catch (e) { /* 隐私模式 / 存储满时忽略，不影响游玩 */ }
  }

  readStoredBoard(list) {
    if (!Array.isArray(list) || list.length !== CELLS) return null;
    const out = new Array(CELLS).fill(null);
    for (let i = 0; i < CELLS; i++) {
      const item = list[i];
      if (item === null || item === undefined) continue;
      if (!validFace(item)) return null;
      out[i] = { suit: item.suit, num: item.num, id: ++this.tileId };
    }
    return out;
  }

  readSnapshot(snap) {
    if (!snap || typeof snap !== 'object') return null;
    const list = this.readStoredBoard(snap.board);
    if (!list) return null;
    const moves = Number(snap.movesLeft);
    const lv = Number(snap.level);
    return {
      board: list,
      movesLeft: Number.isFinite(moves) ? Math.max(0, Math.floor(moves)) : board.levelConfig(1, this.mode).moves,
      level: Number.isFinite(lv) && lv >= 1 ? Math.floor(lv) : 1,
    };
  }

  restore() {
    try {
      const raw = getRaw(this.stateKey(), '');
      if (!raw) return false;
      const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!s || typeof s !== 'object') return false;
      if (PHASES.indexOf(s.phase) < 0) return false;
      const stored = this.readStoredBoard(s.board);
      if (!stored) return false;
      // **过关时棋盘是全空的**（最后那组消完就没了），所以只有非胜利态才要求盘面有牌。
      if (!stored.some(Boolean) && s.phase !== WON) return false;
      // +undefined 是 NaN，`??` 挡不住它，必须用 Number.isFinite 判。
      const savedMoves = Number(s.movesLeft);
      const level = Math.max(1, Math.floor(Number(s.level)) || 1);
      this.level = level;
      this.movesLeft = Number.isFinite(savedMoves)
        ? Math.max(0, Math.floor(savedMoves))
        : board.levelConfig(level, this.mode).moves;
      this.board = stored;
      this.phase = s.phase;
      this.selected = [];
      this.hint = null;
      this.ghosts = [];
      this.slideAnim = null;
      this.settle = null;
      this.drag = null;
      this.press = null;
      this.checkAt = 0;
      this.confetti = [];
      this.confettiUntil = 0;
      this.lastConfettiAt = 0;
      this.history = Array.isArray(s.history)
        ? s.history.map(x => this.readSnapshot(x)).filter(Boolean)
        : [];
      this.future = Array.isArray(s.future)
        ? s.future.map(x => this.readSnapshot(x)).filter(Boolean)
        : [];
      if (this.level > this.best) {
        this.best = this.level;
        setRaw(this.bestKey(), String(this.best));
      }
      this.layout();          // 恢复后必须重新布局（PITFALLS #9）
      this.startDeal();
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- 开局 / 结算 ----------

  startLevel(lv) {
    this.stopGod();
    this.level = Math.max(1, Math.floor(Number(lv)) || 1);
    const gen = board.newGame(this.level, Math.random, this.mode);
    this.godSolution = gen.solution || null;
    this.board = gen.board.map(tile => (tile
      ? { suit: tile.suit, num: tile.num, id: ++this.tileId }
      : null));
    this.movesLeft = gen.moves;
    this.phase = PLAY;
    this.selected = [];
    this.hint = null;
    this.ghosts = [];
    this.history = [];
    this.future = [];
    this.slideAnim = null;
    this.settle = null;
    this.drag = null;
    this.press = null;
    this.checkAt = 0;
    this.confetti = [];
    this.confettiUntil = 0;
    this.lastConfettiAt = 0;
    this.startDeal();
    this.save();
  }

  startDeal() {
    this.selected = [];
    this.hint = null;
    this.groups = [];          // 铺牌期间不画高亮框
    this.ringAt = 0;
    this.dealStart = Date.now();
    this.dealEnd = this.dealStart + (CELLS - 1) * DEAL_STEP + DEAL_MS;
  }

  dealProgress(rank) {
    if (!this.dealStart) return 1;
    return clamp((this.now - this.dealStart - rank * DEAL_STEP) / DEAL_MS, 0, 1);
  }

  dealActive() {
    return !!this.dealEnd && this.now < this.dealEnd;
  }

  replayLevel() {
    this.startLevel(this.level);
  }

  nextLevel() {
    this.startLevel(this.level + 1);
  }

  openConfirm() {
    if (this.helpOpen) return;
    this.stopGod();
    this.confirming = true;
    this.drag = null;
    this.press = null;
  }

  startNewGame() {
    this.confirming = false;
    this.startLevel(1);
  }

  checkEnd() {
    if (this.phase !== PLAY) return;
    if (this.countTiles() === 0) {
      this.phase = WON;
      this.resultSerial += 1;
      this.save();
      this.startConfetti();
      this.playSuccess();
      return;
    }
    if (this.movesLeft <= 0) {
      this.phase = OVER;
      this.resultSerial += 1;
      this.save();
      this.playLose();
    }
  }

  countTiles() {
    let n = 0;
    for (let i = 0; i < CELLS; i++) if (this.board[i]) n++;
    return n;
  }

  // ---------- 可消组 ----------

  refreshGroups() {
    this.groups = board.findGroups(this.board);
    if (this.selected.length) {
      const inSome = this.groups.some(g => this.selected.every(c => g.cells.indexOf(c) >= 0));
      if (!inSome) this.selected = [];
    }
    this.refreshHint();
  }

  // 提示只在「点满的两张是相同的牌、且还能和第三张凑成刻子」时出现：
  // 纯一对在 onCellTap 里已经直接消掉，顺子点两张没有任何对子可消（不弹提示）。
  refreshHint() {
    this.hint = null;
    if (this.phase !== PLAY || this.selected.length !== 2) return;
    const sel = this.selected;
    const inBoth = this.groups.filter(g => sel.every(c => g.cells.indexOf(c) >= 0));
    const pair = inBoth.find(g => g.cells.length === 2);
    if (!pair) return;
    const rows = sel.map(c => Math.floor(c / SIZE));
    const cols = sel.map(c => c % SIZE);
    const minR = Math.min.apply(null, rows);
    const maxR = Math.max.apply(null, rows);
    const minC = Math.min.apply(null, cols);
    const maxC = Math.max.apply(null, cols);
    const thirds = inBoth.filter(g => g.cells.length === 3)
      .reduce((list, g) => list.concat(g.cells.filter(c => sel.indexOf(c) < 0)), []);
    const inCols = c => c % SIZE >= minC && c % SIZE <= maxC;
    const inRows = c => Math.floor(c / SIZE) >= minR && Math.floor(c / SIZE) <= maxR;
    const above = thirds.some(c => inCols(c) && Math.floor(c / SIZE) < minR);
    const below = thirds.some(c => inCols(c) && Math.floor(c / SIZE) > maxR);
    const right = thirds.some(c => inRows(c) && c % SIZE > maxC);
    const left = thirds.some(c => inRows(c) && c % SIZE < minC);
    // tx：-1 = 气泡向左长（贴右边缘）、0 = 向右长（贴左边缘）、0.5 = 居中
    this.hint = {
      pairCells: pair.cells.slice(),
      cells: sel.slice(),
      below: above && !below,
      tx: right && !left ? -1 : left && !right ? 0 : 0.5,
    };
  }

  ringGroups() {
    const melds = this.groups.filter(g => g.cells.length === 3);
    return this.groups.filter(g => !(g.cells.length === 2
      && melds.some(m => g.cells.every(c => m.cells.indexOf(c) >= 0))));
  }

  // ---------- 点选 ----------

  onCellTap(cell) {
    // 注意：这里**不能**判 `ghosts.length`：消除时盘面是同步置空 + 重新分组的，
    // 浮影只是动画层。用动画挡输入会丢掉半秒操作（web 版踩过，PITFALLS #34）。
    if (this.phase !== PLAY || this.helpOpen || this.confirming) return;
    if (this.slideAnim || this.settle) return;
    if (!this.board[cell]) return;
    const hits = this.groups.filter(g => g.cells.indexOf(cell) >= 0);
    if (!hits.length) {
      this.selected = [];
      this.refreshHint();
      return;
    }
    if (this.selected.indexOf(cell) >= 0) {
      this.selected = this.selected.filter(c => c !== cell);
      this.refreshHint();
      return;
    }
    let next = this.selected.concat([cell]);
    // 选中的牌必须还都在同一个可消组里，否则以刚点的这张重新开始选
    if (!this.groups.some(g => next.every(c => g.cells.indexOf(c) >= 0))) next = [cell];
    this.selected = next;

    if (next.length === 3) {
      const done = this.groups.find(g => g.cells.length === 3
        && next.every(c => g.cells.indexOf(c) >= 0));
      if (done) {
        this.clearGroup(done);
        return;
      }
    }
    if (next.length === 2) {
      const pair = this.groups.find(g => g.cells.length === 2
        && next.every(c => g.cells.indexOf(c) >= 0));
      const alsoMeld = this.groups.some(g => g.cells.length === 3
        && next.every(c => g.cells.indexOf(c) >= 0));
      if (pair && !alsoMeld) {
        this.clearGroup(pair);
        return;
      }
    }
    this.refreshHint();
  }

  clearGroup(group) {
    if (this.phase !== PLAY || !group || !group.cells) return;
    const cells = group.cells.slice();
    const gone = [];
    cells.forEach((cell) => {
      const tile = this.board[cell];
      if (tile) gone.push({ tile: { suit: tile.suit, num: tile.num, id: tile.id }, cell, at: this.now });
    });
    if (!gone.length) return;
    this.pushHistory();
    this.selected = [];
    this.hint = null;
    this.board = this.board.map((tile, i) => (cells.indexOf(i) >= 0 ? null : tile));
    this.ghosts = this.ghosts.concat(gone);
    this.refreshGroups();               // 同步更新，输入继续可用
    this.checkAt = Math.max(this.checkAt, this.now + CLEAR_MS);
    if (this.app && this.app.audio) this.app.audio.playElimination();
    this.save();
  }

  // ---------- 滑动 ----------

  pitchOf(dir) {
    return dir === 'left' || dir === 'right' ? this.stepX : this.stepY;
  }

  dirVec(dir, dist) {
    if (dir === 'up') return { x: 0, y: -dist };
    if (dir === 'down') return { x: 0, y: dist };
    if (dir === 'left') return { x: -dist, y: 0 };
    return { x: dist, y: 0 };
  }

  // 某个方向下每张牌会移动几格（用于跟手偏移与松手提交阈值）
  stepsMap(dir) {
    const next = board.slideBy(this.board, dir, this.mode);
    const from = new Map();
    this.board.forEach((tile, i) => { if (tile) from.set(tile.id, i); });
    const stepsById = new Map();
    let maxSteps = 0;
    next.forEach((tile, to) => {
      if (!tile) return;
      const at = from.get(tile.id);
      if (at === undefined) return;
      const steps = Math.abs(Math.floor(to / SIZE) - Math.floor(at / SIZE))
        + Math.abs((to % SIZE) - (at % SIZE));
      stepsById.set(tile.id, steps);
      if (steps > maxSteps) maxSteps = steps;
    });
    return { stepsById, maxSteps };
  }

  applySlide(dir, dist) {
    if (this.phase !== PLAY || this.helpOpen || this.confirming) return;
    if (this.slideAnim || this.settle) return;
    const next = board.slideBy(this.board, dir, this.mode);
    const now = Date.now();
    this.now = now;
    if (board.sameBoard(this.board, next)) {
      this.settle = {
        start: now, dur: SETTLE_MS, dir, dist: Math.max(0, dist || 0),
        stepsById: this.stepsMap(dir).stepsById,
      };
      return;
    }
    // 落定补间的起点 = 松手时手指带到的位置（PITFALLS #48），不能先回原格。
    const fromPos = new Map();
    this.board.forEach((tile, i) => { if (tile) fromPos.set(tile.id, i); });
    const { dr, dc } = board.DIRS[dir];
    const pitch = this.pitchOf(dir);
    const offsets = new Map();
    next.forEach((tile, to) => {
      if (!tile) return;
      const at = fromPos.get(tile.id);
      if (at === undefined) return;
      const steps = Math.abs(Math.floor(to / SIZE) - Math.floor(at / SIZE))
        + Math.abs((to % SIZE) - (at % SIZE));
      const applied = Math.min(Math.max(0, dist || 0), steps * pitch);
      offsets.set(tile.id, {
        x: ((at % SIZE) - (to % SIZE)) * this.stepX + dc * applied,
        y: (Math.floor(at / SIZE) - Math.floor(to / SIZE)) * this.stepY + dr * applied,
      });
    });
    this.pushHistory();
    this.board = next;
    this.movesLeft -= 1;
    this.selected = [];
    this.hint = null;
    this.ghosts = [];        // 浮影按消除时的格子定位，滑动后必须收掉（web 同款）
    this.slideAnim = { start: now, dur: SLIDE_MS, offsets };
    this.refreshGroups();
    this.checkAt = Math.max(this.checkAt, now + SLIDE_MS + 120);
    this.save();
  }

  tileOffset(id) {
    if (this.slideAnim) {
      const offset = this.slideAnim.offsets.get(id);
      if (!offset) return { x: 0, y: 0 };
      const p = clamp((this.now - this.slideAnim.start) / this.slideAnim.dur, 0, 1);
      const keep = 1 - easeOut(p);
      return { x: offset.x * keep, y: offset.y * keep };
    }
    if (this.settle) {
      const steps = this.settle.stepsById.get(id) || 0;
      if (!steps) return { x: 0, y: 0 };
      const p = clamp((this.now - this.settle.start) / this.settle.dur, 0, 1);
      const applied = Math.min(this.settle.dist, steps * this.pitchOf(this.settle.dir)) * (1 - easeOut(p));
      return this.dirVec(this.settle.dir, applied);
    }
    if (this.drag) {
      const steps = this.drag.stepsById.get(id) || 0;
      if (!steps) return { x: 0, y: 0 };
      const applied = Math.min(this.drag.dist, steps * this.pitchOf(this.drag.dir));
      return this.dirVec(this.drag.dir, applied);
    }
    return { x: 0, y: 0 };
  }

  // ---------- 触摸 ----------

  onTouchStart(p) {
    this.press = null;
    if (!p || this.phase !== PLAY || this.helpOpen || this.confirming || this.godPlaying) return;
    if (this.slideAnim || this.settle) return;
    if (p.x < this.boardX || p.y < this.boardY
      || p.x > this.boardX + this.boardW || p.y > this.boardY + this.boardH) return;
    this.press = { x: p.x, y: p.y };
    this.drag = null;
  }

  onTouchMove(p) {
    if (!this.press || !p) return;
    if (this.phase !== PLAY || this.helpOpen || this.confirming) {
      this.press = null;
      this.drag = null;
      return;
    }
    const dx = p.x - this.press.x;
    const dy = p.y - this.press.y;
    if (!this.drag) {
      if (Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      const { stepsById, maxSteps } = this.stepsMap(dir);
      this.drag = { dir, dist: 0, stepsById, maxSteps };
    }
    const pitch = this.pitchOf(this.drag.dir);
    const maxDist = this.drag.maxSteps * pitch;
    const along = this.drag.dir === 'left' || this.drag.dir === 'right'
      ? dx * (this.drag.dir === 'right' ? 1 : -1)
      : dy * (this.drag.dir === 'down' ? 1 : -1);
    this.drag.dist = clamp(along, 0, maxDist);
    if (maxDist > 0 && this.drag.dist >= pitch * DRAG_COMMIT) {
      const dir = this.drag.dir;
      const dist = this.drag.dist;
      this.drag = null;
      this.press = null;
      this.applySlide(dir, dist);
    }
  }

  onTouchEnd(p) {
    const drag = this.drag;
    this.drag = null;
    this.press = null;
    if (!drag || !p) return;
    if (this.phase !== PLAY || this.helpOpen || this.confirming) return;
    const pitch = this.pitchOf(drag.dir);
    if (drag.maxSteps > 0 && drag.dist >= pitch * DRAG_MIN) {
      this.applySlide(drag.dir, drag.dist);
      return;
    }
    if (drag.dist > 0.5) {
      this.settle = {
        start: Date.now(), dur: SETTLE_MS, dir: drag.dir, dist: drag.dist,
        stepsById: drag.stepsById,
      };
    }
  }

  // ---------- 上帝模式 / 模式切换 ----------

  stopGod() {
    this.godPlaying = false;
    this.godTimers.forEach(id => clearTimeout(id));
    this.godTimers = [];
  }

  canGod() {
    return this.phase === PLAY
      && !this.godPlaying
      && !this.helpOpen
      && !this.confirming
      && !this.dealActive()
      && this.history.length === 0;
  }

  godPlay() {
    if (this.godPlaying) { this.stopGod(); return; }
    if (!this.canGod()) return;
    let solution = this.godSolution;
    if (!solution) {
      solution = board.solveBeam(this.board, Math.max(1, this.movesLeft), this.mode)
        || board.solvePuzzle(this.board, Math.max(1, this.movesLeft), this.mode);
    }
    if (!solution || !solution.length) return;
    this.godPlaying = true;
    const step = (i) => {
      if (!this.godPlaying || this.phase !== PLAY || i >= solution.length) {
        this.stopGod();
        this.checkEnd();
        return;
      }
      const item = solution[i];
      if (item.type === 'slide') {
        this.applySlide(item.dir, 0);
        const id = setTimeout(() => step(i + 1), SLIDE_MS + 110);
        this.godTimers.push(id);
      } else {
        const key = item.cells.slice().sort((a, b) => a - b).join(',');
        const group = this.groups.find(g => g.cells.slice().sort((a, b) => a - b).join(',') === key);
        if (group) this.clearGroup(group);
        const id = setTimeout(() => step(i + 1), CLEAR_MS + 80);
        this.godTimers.push(id);
      }
    };
    const id = setTimeout(() => step(0), 280);
    this.godTimers.push(id);
  }

  toggleMode() {
    this.stopGod();
    this.mode = this.mode === 2 ? 1 : 2;
    setRaw(MODE_KEY, String(this.mode));
    this.godSolution = null;
    this.best = readInt(this.bestKey(), 1);
    if (!this.restore()) this.startLevel(Math.max(1, this.best));
  }

  // ---------- undo / redo ----------

  snapshot() {
    return {
      board: this.board.map(tile => (tile ? { suit: tile.suit, num: tile.num, id: tile.id } : null)),
      movesLeft: this.movesLeft,
      level: this.level,
    };
  }

  pushHistory() {
    this.history = this.history.concat([this.snapshot()]).slice(-60);
    this.future = [];
  }

  applySnapshot(snap) {
    this.board = snap.board.map(tile => (tile
      ? { suit: tile.suit, num: tile.num, id: tile.id || ++this.tileId }
      : null));
    this.movesLeft = snap.movesLeft;
    this.level = snap.level;
    this.phase = PLAY;
    this.selected = [];
    this.hint = null;
    this.ghosts = [];
    this.slideAnim = null;
    this.settle = null;
    this.drag = null;
    this.press = null;
    this.checkAt = 0;
    this.confetti = [];
    this.confettiUntil = 0;
    this.lastConfettiAt = 0;
    this.refreshGroups();
    this.save();
  }

  canUndo() {
    return this.phase === PLAY && !this.godPlaying && this.history.length > 0 && !this.helpOpen && !this.confirming;
  }

  canRedo() {
    return this.phase === PLAY && !this.godPlaying && this.future.length > 0 && !this.helpOpen && !this.confirming;
  }

  undo() {
    if (!this.canUndo()) return;
    this.future = this.future.concat([this.snapshot()]);
    const snap = this.history[this.history.length - 1];
    this.history = this.history.slice(0, -1);
    this.applySnapshot(snap);
  }

  redo() {
    if (!this.canRedo()) return;
    this.history = this.history.concat([this.snapshot()]);
    const snap = this.future[this.future.length - 1];
    this.future = this.future.slice(0, -1);
    this.applySnapshot(snap);
  }

  // ---------- 音效 / 撒花 ----------

  playElimination() {
    if (this.app && this.app.audio) this.app.audio.playElimination();
  }

  playSuccess() {
    if (this.app && this.app.audio) this.app.audio.playSuccess();
  }

  playLose() {
    if (this.app && this.app.audio) this.app.audio.playLose();
  }

  startConfetti() {
    this.confetti = [];
    this.confettiUntil = this.now + CONFETTI_MS;
    this.lastConfettiAt = 0;
  }

  emitConfetti() {
    confetti.spawn(this.confetti, { W, H, startY: this.boardY + this.boardH * 0.45 });
  }

  // ---------- 时间 ----------

  shiftTime(ms) {
    if (!ms || ms <= 0) return;
    if (this.dealStart) {
      this.dealStart += ms;
      this.dealEnd += ms;
    }
    if (this.slideAnim) this.slideAnim.start += ms;
    if (this.settle) this.settle.start += ms;
    this.ghosts.forEach((g) => { g.at += ms; });
    if (this.checkAt) this.checkAt += ms;
    if (this.confettiUntil) this.confettiUntil += ms;
    if (this.lastConfettiAt) this.lastConfettiAt += ms;
    if (this.ringAt) this.ringAt += ms;
  }

  update(dt) {
    this.now = Date.now();
    if (this.bg) this.bg.update(dt || 16);

    // modal / 二次确认打开期间冻结逻辑与动画（PITFALLS #32）
    if (this.helpOpen || this.confirming) {
      if (!this.pausedAt) this.pausedAt = this.now;
      return;
    }
    if (this.pausedAt) {
      this.shiftTime(this.now - this.pausedAt);
      this.pausedAt = 0;
    }

    if (this.dealEnd && this.now >= this.dealEnd) {
      this.dealEnd = 0;
      this.dealStart = 0;
      this.refreshGroups();       // 牌全部铺完之后才显示可消高亮
    }
    if (this.slideAnim && this.now >= this.slideAnim.start + this.slideAnim.dur) {
      this.slideAnim = null;
      this.ringAt = this.now;
    }
    if (this.settle && this.now >= this.settle.start + this.settle.dur) this.settle = null;
    if (this.checkAt && this.now >= this.checkAt) {
      this.checkAt = 0;
      this.checkEnd();
    }
    if (this.ghosts.length) {
      this.ghosts = this.ghosts.filter(g => this.now - g.at < CLEAR_MS);
    }
    if (this.now < this.confettiUntil && this.now - this.lastConfettiAt >= 40) {
      this.lastConfettiAt = this.now;
      this.emitConfetti();
    }
    this.confetti = confetti.update(this.confetti, dt || 16, H);
  }

  // ---------- layout ----------

  layout() {
    this.cw = Math.min(W - 32, 440);
    this.cx = (W - this.cw) / 2;
    this.top = HEADER.TOP;
    this.headerH = HEADER.HEIGHT;
    this.homeRect = { ...HEADER.HOME_RECT };

    this.fabSize = 40;
    this.helpRect = { x: W - 16 - 40, y: H - SAFE_BOTTOM - 16 - 40, w: 40, h: 40 };
    this.modeRect = { x: this.helpRect.x - 48, y: this.helpRect.y, w: 40, h: 40 };
    const undoW = Math.min(this.cw, W * 0.8293);
    this.undoW = undoW;
    this.undoH = 52;
    this.undoX = (W - undoW) / 2;
    this.undoY = this.helpRect.y - 10 - this.undoH;

    this.scoreY = this.top + this.headerH + 6;
    this.scoreH = 72;
    this.optY = this.scoreY + this.scoreH + 12;
    this.optH = 58;

    this.gap = CELL_GAP;
    this.pad = BOARD_PAD;
    const topMin = this.optY + this.optH + 12;
    // 底部留出撤销卡 + FAB 行，棋盘不能压到它们。
    const availH = Math.max(140, this.undoY - 12 - topMin);
    const byW = (this.cw - this.pad * 2 - this.gap * (SIZE - 1)) / SIZE;
    const byH = ((availH - this.pad * 2 - this.gap * (SIZE - 1)) / SIZE) / RATIO;
    this.cellW = Math.max(30, Math.floor(Math.min(byW, byH, 78)));
    this.cellH = Math.round(this.cellW * RATIO);
    this.stepX = this.cellW + this.gap;
    this.stepY = this.cellH + this.gap;
    this.boardW = this.cellW * SIZE + this.gap * (SIZE - 1) + this.pad * 2;
    this.boardH = this.cellH * SIZE + this.gap * (SIZE - 1) + this.pad * 2;
    this.boardX = (W - this.boardW) / 2;
    this.boardY = topMin + Math.max(0, (availH - this.boardH) / 2);

    // 尺寸变化后旧的像素级补间失效，直接收掉（避免 NaN / 错位）
    this.drag = null;
    this.settle = null;
    this.slideAnim = null;
    this.press = null;
  }

  cellPos(cell) {
    return {
      x: this.boardX + this.pad + (cell % SIZE) * this.stepX,
      y: this.boardY + this.pad + Math.floor(cell / SIZE) * this.stepY,
    };
  }

  // ---------- render ----------

  render(c) {
    this.buttons = [];
    // modal 打开时 update() 会把动画冻结；render 不能再把 now 往前推，否则动画仍在跑。
    if (!this.helpOpen && !this.confirming) this.now = Date.now();
    const T = theme.tokens;
    c.fillStyle = T.bg;
    c.fillRect(0, 0, W, H);
    if (this.bg) this.bg.draw(c, theme.dark);
    this.drawHeader(c, T);
    this.drawScore(c, T);
    this.drawOptions(c, T);
    this.drawBoard(c, T);
    this.drawUndoCard(c, T);
    if (!this.helpOpen && !this.confirming) this.drawFabs(c);
    if (this.phase === WON || this.phase === OVER) this.drawResult(c, T);
    this.drawConfetti(c);
    if (this.helpOpen) this.drawHelp(c, T);
    if (this.confirming) this.drawConfirm(c, T);
  }

  drawHeader(c, T) {
    D.text(c, t('quesheng.gameTitle'), W / 2, this.top + this.headerH / 2, {
      size: 15, weight: 'bold', color: T.text, align: 'center',
    });
    const h = this.homeRect;
    const hx = h.x + h.w / 2;
    const hy = h.y + h.h / 2;
    if (!icons.draw(c, 'home', hx, hy, 24, T.text)) {
      D.text(c, '⌂', hx, hy, { size: 24, color: T.text, align: 'center' });
    }
    this.addButton('home', h.x, h.y, h.w, h.h, () => this.app.goHome());

  }

  drawIconButton(c, T, rect, iconKey, fallback, enabled, onTap) {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const color = enabled ? T.text : T.disabled;
    c.save();
    c.globalAlpha = enabled ? 1 : 0.45;
    if (!icons.draw(c, iconKey, cx, cy, 20, color)) {
      D.text(c, fallback, cx, cy, { size: 20, weight: 'bold', color, align: 'center' });
    }
    c.restore();
    if (enabled) this.addButton('header-' + iconKey, rect.x - 4, rect.y - 4, rect.w + 8, rect.h + 8, onTap);
  }

  drawScore(c, T) {
    D.card(c, this.cx, this.scoreY, this.cw, this.scoreH, T);
    const left = this.countTiles();
    const cleared = HAND_TILES - left;
    const q = this.cw / 3;
    const stats = [
      [t('quesheng.level'), String(this.level), T.text],
      [t('quesheng.left'), String(left), T.text],
      [t('quesheng.moves'), String(Math.max(0, this.movesLeft)),
        this.movesLeft <= 3 ? T.lose : T.text],
    ];
    stats.forEach(([label, value, color], i) => {
      // 卡片内竖分隔线统一 24px、垂直居中（PITFALLS #37）
      if (i) D.divider(c, this.cx + q * i, this.scoreY + this.scoreH / 2, 24, T.border, 1);
      D.text(c, label, this.cx + q * (i + 0.5), this.scoreY + 23, {
        size: 12, color: T.muted, align: 'center',
      });
      D.text(c, value, this.cx + q * (i + 0.5), this.scoreY + 48, {
        size: 22, weight: 'bold', color, align: 'center',
      });
    });
    // 本关进度条（已消除张数 / 14）：必须裁到卡片 14px 圆角里（PITFALLS #38）
    D.progressBar(c, this.cx, this.scoreY, this.cw, this.scoreH,
      clamp(cleared / HAND_TILES, 0, 1), T.border, T.primary);
  }

  drawOptions(c, T) {
    D.card(c, this.cx, this.optY, this.cw, this.optH, T);
    const half = this.cw / 2;
    const midX = this.cx + half;
    D.divider(c, midX, this.optY + this.optH / 2, 24, T.border, 1);
    const bh = 32;
    const by = this.optY + (this.optH - bh) / 2;

    const startLabel = t('quesheng.start');
    const sw = Math.min(half - 24, Math.max(96, D.measure(c, startLabel, 13, 'bold') + 22));
    const sx = this.cx + half / 2 - sw / 2;
    D.fillRoundRect(c, sx, by, sw, bh, 8, T.primary);
    D.text(c, startLabel, sx + sw / 2, by + bh / 2, {
      size: 13, weight: 'bold', color: '#ffffff', align: 'center',
    });
    this.addButton('new', sx, by, sw, bh, () => this.openConfirm());

    // 上帝模式：与关灯游戏一致，使用闪电前缀；橙底。
    const godLabel = this.godPlaying ? t('quesheng.godStop') : t('quesheng.godMode');
    const gw = Math.min(half - 24, Math.max(96, D.measure(c, godLabel, 12.5, 'bold') + 20));
    const gx = midX + half / 2 - gw / 2;
    const godOn = this.canGod() || this.godPlaying;
    D.fillRoundRect(c, gx, by, gw, bh, 8, godOn ? T.god : T.disabled);
    D.text(c, godLabel, gx + gw / 2, by + bh / 2, {
      size: 12.5, weight: 'bold',
      color: godOn ? '#ffffff' : '#f3f3f3', align: 'center',
    });
    if (godOn) this.addButton('god', gx, by, gw, bh, () => this.godPlay());
  }

  drawUndoCard(c, T) {
    D.card(c, this.undoX, this.undoY, this.undoW, this.undoH, T);
    D.divider(c, this.undoX + this.undoW / 2, this.undoY + this.undoH / 2, 24, T.border, 1);
    const item = (x, w, iconKey, fallback, label, enabled, onTap, id) => {
      const cx = x + w / 2;
      const cy = this.undoY + this.undoH / 2;
      const lw = D.measure(c, label, 12.5, 'bold');
      const groupW = 18 + 6 + lw;
      const gx = cx - groupW / 2;
      c.save();
      c.globalAlpha = enabled ? 1 : 0.4;
      if (!icons.draw(c, iconKey, gx + 9, cy, 18, T.text)) {
        D.text(c, fallback, gx + 9, cy, { size: 18, weight: 'bold', color: T.text, align: 'center' });
      }
      D.text(c, label, gx + 18 + 6 + lw / 2, cy, {
        size: 12.5, weight: 'bold', color: T.text, align: 'center',
      });
      c.restore();
      if (enabled) this.addButton(id, x, this.undoY, w, this.undoH, onTap);
    };
    item(this.undoX, this.undoW / 2, 'undo', '↶', t('quesheng.undo'), this.canUndo(), () => this.undo(), 'undo');
    item(this.undoX + this.undoW / 2, this.undoW / 2, 'redo', '↷', t('quesheng.redo'), this.canRedo(), () => this.redo(), 'redo');
  }

  drawFabs(c) {
    const T = theme.tokens;
    const one = (rect, iconKey, fallback, color, id, onTap) => {
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.12)';
      c.shadowBlur = 10;
      c.shadowOffsetY = 2;
      D.circle(c, rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, T.card);
      c.restore();
      if (!icons.draw(c, iconKey, rect.x + rect.w / 2, rect.y + rect.h / 2, 21, color)) {
        D.text(c, fallback, rect.x + rect.w / 2, rect.y + rect.h / 2, { size: 19, color, align: 'center' });
      }
      this.addButton(id, rect.x, rect.y, rect.w, rect.h, onTap);
    };
    one(this.modeRect, 'mode-mahjong', '⇄', T.primary, 'mode', () => this.toggleMode());
    one(this.helpRect, 'help', '?', T.primary, 'help-fab', () => {
      if (this.confirming) return;
      this.stopGod();
      this.helpOpen = true;
      setRaw(HELP_KEY, '1');
    });
  }

  drawBoard(c, T) {
    // 游戏区外框背景：与其它棋盘场景一致，棋盘本身是一整块卡面，而不是只有一格一格。
    D.fillRoundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 16, T.boardBg);
    D.strokeRoundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 16, T.border, 1);
    const boardBg = theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.52)';
    for (let i = 0; i < CELLS; i++) {
      const pos = this.cellPos(i);
      D.fillRoundRect(c, pos.x, pos.y, this.cellW, this.cellH, 8, boardBg);
      D.strokeRoundRect(c, pos.x, pos.y, this.cellW, this.cellH, 8, T.tileBorder, 1);
    }
    this.drawRings(c);
    this.drawTiles(c, T);
    this.drawGhosts(c);
    this.drawHint(c, T);
  }

  ringVisible() {
    return this.phase === PLAY
      && !this.dealActive()
      && !this.drag && !this.settle && !this.slideAnim
      && !this.helpOpen && !this.confirming;
  }

  drawRings(c) {
    if (!this.ringVisible()) return;
    const list = this.ringGroups();
    if (!list.length) return;
    const alpha = this.ringAt ? clamp((this.now - this.ringAt) / RING_IN_MS, 0, 1) : 1;
    c.save();
    c.globalAlpha = alpha;
    c.shadowColor = 'rgba(255,166,61,0.65)';
    c.shadowBlur = 8;
    list.forEach((group) => {
      const rows = group.cells.map(cell => Math.floor(cell / SIZE));
      const cols = group.cells.map(cell => cell % SIZE);
      const r0 = Math.min.apply(null, rows);
      const r1 = Math.max.apply(null, rows);
      const c0 = Math.min.apply(null, cols);
      const c1 = Math.max.apply(null, cols);
      const x = this.boardX + this.pad + c0 * this.stepX - 3;
      const y = this.boardY + this.pad + r0 * this.stepY - 3;
      const w = (c1 - c0 + 1) * this.stepX - this.gap + 6;
      const h = (r1 - r0 + 1) * this.stepY - this.gap + 6;
      D.strokeRoundRect(c, x, y, w, h, 11, '#ffa63d', 2);
    });
    c.restore();
  }

  drawTiles(c, T) {
    const selected = this.selected;
    for (let i = 0; i < CELLS; i++) {
      const tile = this.board[i];
      if (!tile) continue;
      const pos = this.cellPos(i);
      const p = this.dealProgress(i);       // 行优先：cell 本身就是 row * SIZE + col
      if (p <= 0) continue;
      const offset = this.tileOffset(tile.id);
      const active = selected.indexOf(i) >= 0 && this.phase === PLAY;
      const lift = active ? -3 : 0;
      const e = easeOut(p);
      const scale = p >= 1 ? 1 : 0.45 + 0.55 * e;
      const dy = p >= 1 ? 0 : -(1 - e) * 10;
      const x = pos.x + offset.x;
      const y = pos.y + offset.y + dy + lift;

      c.save();
      if (p < 1) c.globalAlpha = p;
      if (scale !== 1) {
        c.translate(x + this.cellW / 2, y + this.cellH / 2);
        c.scale(scale, scale);
        cards.draw(c, faceOf(tile), MODE, -this.cellW / 2, -this.cellH / 2,
          this.cellW, this.cellH, true);
      } else {
        cards.draw(c, faceOf(tile), MODE, x, y, this.cellW, this.cellH, true);
      }
      c.restore();

      if (active) {
        D.strokeRoundRect(c, x - 1.5, y - 1.5, this.cellW + 3, this.cellH + 3, 10, T.primary, 2.5);
      }
      // 点选热区：牌铺开之后才接受点击；浮影播放期间**不锁**其它牌（PITFALLS #34）
      if (this.phase === PLAY && !this.helpOpen && !this.confirming
        && !this.dealActive() && !this.slideAnim && !this.settle && p >= 0.9) {
        this.addButton('cell-' + i, x, y, this.cellW, this.cellH, () => this.onCellTap(i));
      }
    }
  }

  ghostAlpha(age) {
    // 雀圣的消除：先闪两下，再原地淡出；不缩小、不下落。
    // 0~450ms 亮；450~900ms 两次明暗；900~1400ms 透明度 1→0。
    if (age >= CLEAR_MS) return 0;
    if (age < motion.FLASH_MS) return 1;
    const blinkEnd = 900;
    if (age < blinkEnd) {
      const p = (age - motion.FLASH_MS) / (blinkEnd - motion.FLASH_MS);
      return 0.15 + 0.85 * Math.abs(Math.cos(p * Math.PI * 2));
    }
    return Math.max(0, 1 - (age - blinkEnd) / (CLEAR_MS - blinkEnd));
  }

  drawGhosts(c) {
    const w = this.cellW;
    const h = this.cellH;
    this.ghosts.forEach((ghost) => {
      const age = this.now - ghost.at;
      if (age >= CLEAR_MS) return;
      const pos = this.cellPos(ghost.cell);
      c.save();
      c.globalAlpha = this.ghostAlpha(age);
      cards.draw(c, faceOf(ghost.tile), MODE, pos.x, pos.y, w, h, true);
      c.restore();
    });
  }

  drawHint(c, T) {
    const hint = this.hint;
    if (!hint || this.phase !== PLAY) return;
    if (this.drag || this.settle || this.slideAnim) return;
    const rects = hint.cells.map(cell => this.cellPos(cell));
    const minX = Math.min.apply(null, rects.map(r => r.x));
    const maxX = Math.max.apply(null, rects.map(r => r.x)) + this.cellW;
    const minY = Math.min.apply(null, rects.map(r => r.y));
    const maxY = Math.max.apply(null, rects.map(r => r.y)) + this.cellH;
    const label = '✨ ' + t('quesheng.clearPair');
    const bw = D.measure(c, label, 12, 'bold') + 18;
    const bh = HINT_H;
    const anchorX = hint.tx === -1 ? maxX : hint.tx === 0 ? minX : (minX + maxX) / 2;
    let bx = hint.tx === -1 ? anchorX - bw : hint.tx === 0 ? anchorX : anchorX - bw / 2;
    bx = clamp(bx, 6, W - 6 - bw);
    let by = hint.below ? maxY + 8 : minY - 8 - bh;
    by = clamp(by, 4, H - bh - 4);

    c.save();
    c.shadowColor = 'rgba(0,0,0,0.22)';
    c.shadowBlur = 8;
    c.shadowOffsetY = 2;
    D.fillRoundRect(c, bx, by, bw, bh, 8, T.primary);
    c.restore();
    D.text(c, label, bx + bw / 2, by + bh / 2, {
      size: 12, weight: 'bold', color: '#ffffff', align: 'center',
    });
    // 小箭头指向两张牌
    const acx = clamp(anchorX, bx + 10, bx + bw - 10);
    c.beginPath();
    c.fillStyle = T.primary;
    if (hint.below) {
      c.moveTo(acx, by + 0.5);
      c.lineTo(acx - 5, by - 5);
      c.lineTo(acx + 5, by - 5);
    } else {
      c.moveTo(acx, by + bh - 0.5);
      c.lineTo(acx - 5, by + bh + 5);
      c.lineTo(acx + 5, by + bh + 5);
    }
    c.closePath();
    c.fill();
    this.addButton('hint-clear', bx, by, bw, bh, () => this.clearGroup({ cells: hint.pairCells }));
  }

  // 结算层只盖棋盘（不挡上方分数卡与操作卡）；帮助 / 新游戏仍然可点（PITFALLS #10）
  drawResult(c, T) {
    if (!this.resultVisible(RESULT_DELAY, this.phase + ':' + this.resultSerial)) return;
    const win = this.phase === WON;
    const overlay = theme.dark ? 'rgba(38,38,38,0.94)' : 'rgba(250,248,239,0.94)';
    D.fillRoundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 14, overlay);
    const cx = this.boardX + this.boardW / 2;
    const cy = this.boardY + this.boardH / 2;
    if (win) {
      D.text(c, `🎉🎉 ${t('quesheng.tipWin')} 🎉🎉`, cx, cy - 62, {
        size: Math.min(18, this.boardW / 17), weight: 'bold', color: T.win, align: 'center',
      });
      D.text(c, t('quesheng.levelDone').replace('{n}', this.level), cx, cy - 32, {
        size: 13, color: T.muted, align: 'center',
      });
      D.text(c, `${HAND_TILES} / ${HAND_TILES}`, cx, cy - 4, {
        size: 20, weight: 'bold', color: T.text, align: 'center',
      });
      const gap = 10;
      const l1 = t('quesheng.replayLevel');
      const l2 = t('quesheng.nextLevel');
      const w1 = Math.min(140, D.measure(c, l1, 12, 'bold') + 26);
      const w2 = Math.min(140, D.measure(c, l2, 12, 'bold') + 26);
      const bx = cx - (w1 + w2 + gap) / 2;
      const by = cy + 30;
      // 「重玩本关」= 橙色描边按钮（全局约定）
      D.strokeRoundRect(c, bx, by, w1, 32, 8, T.god, 1);
      D.text(c, l1, bx + w1 / 2, by + 16, { size: 12, weight: 'bold', color: T.god, align: 'center' });
      this.addButton('result-replay', bx, by, w1, 32, () => this.replayLevel());
      D.fillRoundRect(c, bx + w1 + gap, by, w2, 32, 8, T.primary);
      D.text(c, l2, bx + w1 + gap + w2 / 2, by + 16, {
        size: 12, weight: 'bold', color: '#ffffff', align: 'center',
      });
      this.addButton('result-next', bx + w1 + gap, by, w2, 32, () => this.nextLevel());
    } else {
      D.text(c, `💤💤 ${t('quesheng.tipLost')} 💤💤`, cx, cy - 46, {
        size: Math.min(17, this.boardW / 18), weight: 'bold', color: T.lose, align: 'center',
      });
      D.text(c, `${t('quesheng.level')} ${this.level}`, cx, cy - 14, {
        size: 14, color: T.muted, align: 'center',
      });
      const label = t('quesheng.replayLevel');
      const bw = Math.min(140, D.measure(c, label, 12, 'bold') + 26);
      const bx = cx - bw / 2;
      const by = cy + 24;
      D.strokeRoundRect(c, bx, by, bw, 32, 8, T.god, 1);
      D.text(c, label, cx, by + 16, { size: 12, weight: 'bold', color: T.god, align: 'center' });
      this.addButton('result-replay', bx, by, bw, 32, () => this.replayLevel());
    }
  }

  drawConfetti(c) {
    if (this.confetti.length) confetti.draw(c, this.confetti);
  }

  drawHelp(c, T) {
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillRect(0, 0, W, H);
    const x = 18;
    const w = W - 36;
    const innerW = w - 36;
    const headerH = 54;
    const footerH = 52;
    const maxH = H - SAFE_BOTTOM - 24;
    const keys = ['helpMsg', 'help1', 'help2', 'help3'];
    let size = 12.5;
    let lineH = 17;
    let blocks = [];
    let contentH = 0;
    // 英文文案比中文长：从 12.5 一路缩到 10.5，挑第一个放得下的字号
    for (let step = 0; step < 5; step++) {
      size = 12.5 - step * 0.5;
      lineH = size + 4.5;
      blocks = [];
      contentH = 0;
      keys.forEach((key) => {
        const value = t('quesheng.' + key);
        if (value === 'quesheng.' + key) return;
        const lines = D.wrapText(c, value, innerW, size);
        blocks.push({ lines, gap: 7 });
        contentH += lines.length * lineH + 7;
      });
      if (headerH + contentH + 10 + footerH <= maxH) break;
    }
    const boxH = contentH + 4;
    const h = Math.min(maxH, headerH + boxH + footerH);
    const y = Math.max(12, (H - h) / 2);
    this.helpRect = { x, y, w, h };
    D.card(c, x, y, w, h, T);
    D.text(c, '?', x + 24, y + 28, { size: 23, weight: 'bold', color: T.primary });
    D.text(c, t('help'), x + 50, y + 28, { size: 16, weight: 'bold', color: T.text });
    const viewTop = y + headerH;
    const viewH = Math.max(20, h - headerH - footerH);
    c.save();
    D.roundRect(c, x + 1, viewTop, w - 2, viewH, 8);
    c.clip();
    let ly = viewTop + 4;
    blocks.forEach((block) => {
      block.lines.forEach((line) => {
        if (line) D.text(c, line, x + 18, ly, { size, color: T.text });
        ly += lineH;
      });
      ly += block.gap;
    });
    c.restore();
    // 全屏遮罩先加、面板按钮后加（Input 从后往前找，PITFALLS #12）
    this.addButton('help-mask', 0, 0, W, H, () => { this.helpOpen = false; });
    const bw = 110;
    const bx = x + (w - bw) / 2;
    const by = y + h - 42;
    D.fillRoundRect(c, bx, by, bw, 30, 8, T.primary);
    D.text(c, t('quesheng.confirmText'), bx + bw / 2, by + 15, {
      size: 13, weight: 'bold', color: '#ffffff', align: 'center',
    });
    this.addButton('help-ok', bx, by, bw, 30, () => { this.helpOpen = false; });
  }

  drawConfirm(c, T) {
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillRect(0, 0, W, H);
    const w = W - 56;
    const x = (W - w) / 2;
    const body = D.wrapText(c, t('quesheng.newGameConfirm'), w - 40, 13);
    const h = 92 + body.length * 20 + 58;
    const y = (H - h) / 2;
    this.confirmRect = { x, y, w, h };
    D.card(c, x, y, w, h, T);
    D.text(c, t('quesheng.start'), x + 20, y + 30, { size: 17, weight: 'bold', color: T.text });
    body.forEach((line, i) => {
      D.text(c, line, x + 20, y + 62 + i * 20, { size: 13, color: T.muted });
    });
    // 全屏遮罩先加，面板按钮后加（PITFALLS #12）
    this.addButton('confirm-mask', 0, 0, W, H, () => { this.confirming = false; });
    const gap = 12;
    const bw = (w - 40 - gap) / 2;
    const by = y + h - 48;
    D.fillRoundRect(c, x + 20, by, bw, 32, 8, T.enter);
    D.text(c, t('quesheng.cancel'), x + 20 + bw / 2, by + 16, {
      size: 13, weight: 'bold', color: T.enterColor, align: 'center',
    });
    this.addButton('confirm-cancel', x + 20, by, bw, 32, () => { this.confirming = false; });
    D.fillRoundRect(c, x + 20 + bw + gap, by, bw, 32, 8, T.primary);
    D.text(c, t('quesheng.confirmOk'), x + 20 + bw + gap + bw / 2, by + 16, {
      size: 13, weight: 'bold', color: '#ffffff', align: 'center',
    });
    this.addButton('confirm-ok', x + 20 + bw + gap, by, bw, 32, () => this.startNewGame());
  }

  // ---------- lifecycle ----------

  onTheme() { this.layout(); }

  onResize() { this.layout(); }

  onHide() {
    if (!this.pausedAt) this.pausedAt = Date.now();
    this.save();
  }

  onShow() {
    const now = Date.now();
    if (this.pausedAt) {
      this.shiftTime(now - this.pausedAt);
      this.pausedAt = 0;
    }
    this.now = now;
  }
}

module.exports = QueshengScene;
