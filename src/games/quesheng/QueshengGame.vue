<template>
  <div
    class="wrapper"
    @pointerdown="onPointerDown"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
  >
    <TopHeader @onScoreReset="() => {}" />

    <!-- 统计条：关卡 / 剩余牌 / 剩余步数 -->
    <div class="card score-area">
      <div class="stat">
        <span class="stat-label">{{ i18n('level') }}</span>
        <span class="stat-value">{{ level }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('left') }}</span>
        <span class="stat-value">{{ tilesLeft }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('moves') }}</span>
        <span class="stat-value">{{ movesLeft }}</span>
      </div>
      <!-- 本关进度条（已消除张数 / 14） -->
      <div class="progress"><div class="progress-bar" :style="{ width: `${progress}%` }"></div></div>
    </div>

    <div class="card opt-area">
      <div class="opt-half">
        <span class="board-info">{{ i18n('boardInfo') }}</span>
      </div>
      <div class="divider"></div>
      <div class="start-wrapper">
        <button class="game-icon" @click="confirming = true">{{ i18n('start') }}</button>
      </div>
    </div>

    <div class="game-area">
      <!-- 网格底纹：常驻 25 格 -->
      <div class="board dot-board" :style="boardVars" @pointerdown="onBoardDown">
        <div v-for="i in CELLS" :key="`g${i}`" class="grid-cell" />
        <!-- 可消牌组的高亮边框：圈住整组 -->
        <span
          v-for="(g, i) in groups"
          :key="`r${i}-${g.cells.join('-')}`"
          class="group-ring"
          :style="ringStyle(g)"
        />
        <!-- 点齐两张后的消除提示（类 tooltip）：一对可以直接点它消，刻子 / 顺子再点第三张 -->
        <span
          v-if="hint"
          class="clear-tip"
          :style="hintStyle"
          @click.stop="hint.pair && clearGroup(hint.pair)"
        >
          <span v-if="hint.pair" class="tip-act">✨ {{ i18n('clearPair') }}</span>
          <span v-if="hint.meld" class="tip-hint">{{ i18n('clearMeldHint') }}</span>
        </span>

        <!-- 牌：绝对定位，滑动时靠 left/top 过渡动画 -->
        <span
          v-for="t in tiles"
          :key="t.id"
          class="tile"
          :class="{ active: selected.includes(t.cell), clearing: clearing.has(t.id), dealt: dealing }"
          :style="tileStyle(t)"
          @click.stop="onTileClick(t)"
        >
          <img class="mj-img" :src="tileImg(t)" alt="" draggable="false" />
        </span>
      </div>

      <div v-if="phase !== PLAY" class="result" :class="phase === WON ? 'win' : 'lose'">
        <template v-if="phase === WON">
          <span>🎉🎉 {{ i18n('tipWin') }} 🎉🎉</span>
          <span class="level-note">{{ i18n('levelDone').replace('{n}', level) }}</span>
          <button class="game-icon" @click="nextLevel">{{ i18n('nextLevel') }}</button>
        </template>
        <template v-else>
          <span>💤💤 {{ i18n('tipLost') }} 💤💤</span>
          <span class="level-note">{{ i18n('level') }} {{ level }}</span>
          <button class="game-icon" @click="retryLevel">{{ i18n('replayLevel') }}</button>
        </template>
      </div>
    </div>

    <!-- 撤销 / 重做：放在游戏区下方（与点击游戏同一套做法） -->
    <div class="card undo-card">
      <div class="undo-item">
        <button class="undo" :disabled="!canUndo" @click="undo">
          <i i-carbon-undo />
          <span>{{ i18n('undo') }}</span>
        </button>
      </div>
      <div class="divider"></div>
      <div class="undo-item">
        <button class="undo" :disabled="!canRedo" @click="redo">
          <i i-carbon-redo />
          <span>{{ i18n('redo') }}</span>
        </button>
      </div>
    </div>

    <ConfirmDialog
      :show="confirming"
      @confirm="startNewGame"
      @replay="retryLevel"
      @cancel="confirming = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';

import TopHeader from '@/components/TopHeader.vue';
import ConfirmDialog from '@/shared/ConfirmDialog.vue';
import confetti from '@/shared/confetti';
import { i18n } from '@/shared/i18n';
import {
  SIZE, CELLS, HAND_TILES, levelConfig, newGame, slide, findGroups, sameBoard, tileName,
} from './board';

// 牌面直接用参考图裁出来的 34 张图片（万 / 条 / 筒 / 字），不再用 CSS 画
const TILE_IMG = import.meta.glob('./tiles/*.webp', { eager: true, query: '?url', import: 'default' });
const tileImg = t => TILE_IMG[`./tiles/${t.suit}${t.num}.webp`];

const MODE_KEY = '__quesheng__level';
const STATE_KEY = '__quesheng__state';
const [PLAY, WON, OVER] = ['play', 'won', 'over'];
const SWIPE_MIN = 24;            // 滑动判定的最小位移
const CLEAR_MS = 520;

const level = ref(1);
const board = ref(new Array(CELLS).fill(null));   // 每个格子放一张牌（或 null）
const movesLeft = ref(0);
const phase = ref(PLAY);
const selected = ref([]);        // 已点选、准备消掉的牌所在的格子
const clearing = ref(new Map()); // 正在闪烁消失的牌 id -> 牌
const groups = ref([]);          // 当前所有可消牌组
const dealing = ref(false);      // 开局铺牌动画中
const confirming = ref(false);
const history = ref([]);         // undo 栈
const future = ref([]);          // redo 栈

// ---------- 尺寸 ----------
const metrics = ref({ cell: 56, cellH: 80, gap: 6, pad: 8 });
const boardVars = computed(() => ({
  '--cell': `${metrics.value.cell}px`,
  '--cell-h': `${metrics.value.cellH}px`,
  '--gap': `${metrics.value.gap}px`,
  '--pad': `${metrics.value.pad}px`,
}));
// 牌是 1:1.35 的竖牌，所以纵向步长 != 横向步长（网格行高也必须按牌高走，
// 否则每行都会被下一行压住、牌面下半截被切掉 —— 根 AGENTS 里记过这个 grid 坑）
const stepX = computed(() => metrics.value.cell + metrics.value.gap);
const stepY = computed(() => metrics.value.cellH + metrics.value.gap);
// 注意要加上棋盘自己的 padding：绝对定位的包含块是 padding box，
// 而网格里的格子是从内容盒（= padding 之内）开始排的，少了这个偏移整盘牌会往左上偏 8px
const posOf = cell => ({
  left: `${metrics.value.pad + (cell % SIZE) * stepX.value}px`,
  top: `${metrics.value.pad + Math.floor(cell / SIZE) * stepY.value}px`,
});
const tileStyle = t => ({
  ...posOf(t.cell),
  ...(t.delay ? { animationDelay: `${t.delay}ms` } : null),
});

function computeMetrics() {
  const vw = Math.min(window.innerWidth, 480);
  const pad = 8;
  const avail = vw - 32 - pad * 2;             // 页面左右 16 + 棋盘内边距
  const byW = (avail - metrics.value.gap * (SIZE - 1)) / SIZE;
  // 牌面是裁剪出来的图片，长宽比就是图片本身的比例（168/131 ≈ 1.282）。
  // 高度预算 = 通用留白 262 + 游戏区下方那张撤销卡（实测 54px 高 + 12px 上边距 = 66）
  const RATIO = 1.282;
  const BELOW = 66;
  const byH = (window.innerHeight - 262 - BELOW - pad * 2 - metrics.value.gap * (SIZE - 1)) / SIZE / RATIO;
  const cell = Math.max(34, Math.min(byW, byH, 78));
  const w = Math.round(cell);
  metrics.value = { cell: w, cellH: Math.round(w * RATIO), gap: metrics.value.gap, pad };
}

// ---------- 牌 ----------
const tiles = computed(() => board.value
  .map((t, cell) => (t ? { ...t, cell } : null))
  .filter(Boolean));
const tilesLeft = computed(() => tiles.value.filter(t => !clearing.value.has(t.id)).length);
const progress = computed(() => Math.min(100, Math.round(((HAND_TILES - tilesLeft.value) / HAND_TILES) * 100)));
const canUndo = computed(() => history.value.length > 0 && phase.value === PLAY);
const canRedo = computed(() => future.value.length > 0 && phase.value === PLAY);

// ---------- 开局 ----------
let timers = [];
const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

function startLevel(lv) {
  clearTimers();
  level.value = Math.max(1, lv);
  const { board: b, moves } = newGame(level.value);
  board.value = b;
  movesLeft.value = moves;
  phase.value = PLAY;
  selected.value = [];
  clearing.value = new Map();
  history.value = [];
  future.value = [];
  refreshGroups();
  // 铺牌动画：按「从左上到右下」的次序逐张出现
  dealing.value = true;
  board.value = board.value.map((t, cell) => (t
    ? { ...t, delay: (Math.floor(cell / SIZE) + (cell % SIZE)) * 55 }
    : null));
  timers.push(setTimeout(() => { dealing.value = false; board.value = board.value.map(t => (t ? { ...t, delay: 0 } : null)); }, 900));
  save();
}

function retryLevel() {
  confirming.value = false;
  startLevel(level.value);
}

function nextLevel() {
  startLevel(level.value + 1);
}

function startNewGame() {
  confirming.value = false;
  startLevel(1);
}

// ---------- 可消牌组 ----------
function refreshGroups() {
  groups.value = findGroups(board.value);
  // 选中的牌若已经不在任何可消组里，清掉选择
  if (selected.value.length) {
    const inSome = groups.value.some(g => selected.value.every(c => g.cells.includes(c)));
    if (!inSome) selected.value = [];
  }
}

// 一组牌的外框（圈住整组）
function ringStyle(g) {
  const rs = g.cells.map(c => Math.floor(c / SIZE));
  const cs = g.cells.map(c => c % SIZE);
  const r0 = Math.min(...rs), r1 = Math.max(...rs);
  const c0 = Math.min(...cs), c1 = Math.max(...cs);
  const pad = 3;
  return {
    left: `${metrics.value.pad + c0 * stepX.value - pad}px`,
    top: `${metrics.value.pad + r0 * stepY.value - pad}px`,
    width: `${(c1 - c0 + 1) * stepX.value - metrics.value.gap + pad * 2}px`,
    height: `${(r1 - r0 + 1) * stepY.value - metrics.value.gap + pad * 2}px`,
  };
}

// ---------- 点击 ----------
function onTileClick(t) {
  if (phase.value !== PLAY || clearing.value.size) return;
  const cell = t.cell;
  const hit = groups.value.filter(g => g.cells.includes(cell));
  if (!hit.length) { selected.value = []; return; }
  // 已经点过：取消选中
  if (selected.value.includes(cell)) {
    selected.value = selected.value.filter(c => c !== cell);
    return;
  }
  let next = [...selected.value, cell];
  // 选中的牌必须还都在同一个可消组里，否则以刚点的这张重新开始选
  if (!groups.value.some(g => next.every(c => g.cells.includes(c)))) {
    next = groups.value.some(g => g.cells.includes(cell)) ? [cell] : [];
  }
  selected.value = next;
  // 三张点齐 → 直接消掉
  const done = groups.value.find(g => g.cells.length === 3 && next.length === 3
    && g.cells.every(c => next.includes(c)));
  if (done) { clearGroup(done); return; }
  // 两张：**只**构成一对（这两张不属于任何三张组）时直接消，不必再点提示；
  // 只有当它们同时还能凑成三张组（歧义）时，才留给下面浮出的提示让玩家选
  if (next.length === 2) {
    const pair = groups.value.find(g => g.cells.length === 2 && g.cells.every(c => next.includes(c)));
    const alsoMeld = groups.value.some(g => g.cells.length === 3 && next.every(c => g.cells.includes(c)));
    if (pair && !alsoMeld) clearGroup(pair);
  }
}

// 点齐两张时的提示：只在「这两张还能凑成三张的一组」这种有歧义的局面出现
// （纯一对在上面的 onTileClick 里就已经直接消掉了，轮不到这里）。
// 歧义时提示里同时给出两条路：这两张本身也成一对 → 点提示消一对；
// 想凑三张 → 提示里写着「或再点第三张」，点第三张即可消。
const hint = computed(() => {
  if (phase.value !== PLAY || selected.value.length !== 2 || clearing.value.size) return null;
  const sel = selected.value;
  const inBoth = groups.value.filter(g => sel.every(c => g.cells.includes(c)));
  if (!inBoth.length) return null;
  return {
    cell: sel[1],
    pair: inBoth.find(g => g.cells.length === 2) || null,
    meld: inBoth.find(g => g.cells.length === 3) || null,
  };
});
const hintStyle = computed(() => {
  if (!hint.value) return {};
  const p = posOf(hint.value.cell);
  const left = parseFloat(p.left) + metrics.value.cell / 2;
  const top = parseFloat(p.top) - 6;
  return { left: `${left}px`, top: `${top}px` };
});

function clearGroup(g) {
  pushHistory();
  const going = new Map();
  g.cells.forEach(c => { if (board.value[c]) going.set(board.value[c].id, board.value[c]); });
  selected.value = [];
  clearing.value = going;
  board.value = board.value.map((t, i) => (g.cells.includes(i) ? null : t));
  refreshGroups();
  timers.push(setTimeout(() => {
    clearing.value = new Map();
    checkEnd();
    save();
  }, CLEAR_MS));
  save();
}

// ---------- 滑动 ----------
function applySlide(dir) {
  if (phase.value !== PLAY || clearing.value.size) return;
  const next = slide(board.value, dir);
  if (sameBoard(board.value, next)) return;
  pushHistory();
  selected.value = [];
  board.value = next;
  movesLeft.value -= 1;
  refreshGroups();
  save();
  timers.push(setTimeout(() => { checkEnd(); save(); }, 220));
}

const DIR_KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
};

function onKeyUp(e) {
  const dir = DIR_KEYS[e.key];
  if (!dir) return;
  e.preventDefault();
  applySlide(dir);
}

// 用 Pointer Events 做滑动（手势区域 touch-action: none）
let press = null;
function onBoardDown(e) {
  if (phase.value !== PLAY) return;
  press = { x: e.clientX, y: e.clientY };
}
function onPointerDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  onBoardDown(e);
}
function onPointerUp(e) {
  if (!press) return;
  const dx = e.clientX - press.x;
  const dy = e.clientY - press.y;
  press = null;
  if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return;
  applySlide(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
}
function onPointerCancel() { press = null; }

// ---------- undo / redo ----------
const snapshot = () => ({
  board: board.value.map(t => (t ? { id: t.id, suit: t.suit, num: t.num } : null)),
  movesLeft: movesLeft.value,
  level: level.value,
});
function pushHistory() {
  history.value = [...history.value, snapshot()].slice(-60);
  future.value = [];
}
function restore(snap) {
  board.value = snap.board.map(t => (t ? { ...t, delay: 0 } : null));
  movesLeft.value = snap.movesLeft;
  level.value = snap.level;
  phase.value = PLAY;
  selected.value = [];
  clearing.value = new Map();
  refreshGroups();
  save();
}
function undo() {
  if (!canUndo.value) return;
  const snap = history.value[history.value.length - 1];
  future.value = [...future.value, snapshot()];
  history.value = history.value.slice(0, -1);
  restore(snap);
}
function redo() {
  if (!canRedo.value) return;
  const snap = future.value[future.value.length - 1];
  history.value = [...history.value, snapshot()];
  future.value = future.value.slice(0, -1);
  restore(snap);
}

// ---------- 结算 / 存档 ----------
function checkEnd() {
  if (phase.value !== PLAY) return;
  if (tilesLeft.value === 0) {
    phase.value = WON;
    confetti();
    return;
  }
  if (movesLeft.value <= 0) phase.value = OVER;
}

function save() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({
      level: level.value,
      phase: phase.value,
      movesLeft: movesLeft.value,
      board: board.value.map(t => (t ? { suit: t.suit, num: t.num } : null)),
      history: history.value,
      future: future.value,
    }));
    const best = +(localStorage.getItem(MODE_KEY) || 1);
    if (level.value > best) localStorage.setItem(MODE_KEY, String(level.value));
  } catch { /* 隐私模式写不进去就算了 */ }
}

function restoreState() {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY));
    if (!s || !Array.isArray(s.board) || s.board.length !== CELLS) return false;
    if (![PLAY, WON, OVER].includes(s.phase)) return false;
    if (!s.board.some(Boolean)) return false;
    level.value = Math.max(1, +s.level || 1);
    movesLeft.value = Math.max(0, +s.movesLeft ?? levelConfig(level.value).moves);
    let n = 0;
    board.value = s.board.map(t => (t ? { suit: t.suit, num: t.num, id: ++n, delay: 0 } : null));
    history.value = Array.isArray(s.history) ? s.history : [];
    future.value = Array.isArray(s.future) ? s.future : [];
    phase.value = s.phase;
    selected.value = [];
    clearing.value = new Map();
    refreshGroups();
    return true;
  } catch {
    return false;
  }
}

onMounted(() => {
  computeMetrics();
  window.addEventListener('resize', computeMetrics);
  window.addEventListener('keyup', onKeyUp);
  if (!restoreState()) startLevel(Math.max(1, +(localStorage.getItem(MODE_KEY) || 1)));
});

onUnmounted(() => {
  window.removeEventListener('resize', computeMetrics);
  window.removeEventListener('keyup', onKeyUp);
  clearTimers();
  save();
});
</script>

<style scoped lang="scss">
@keyframes qs-deal {
  from { opacity: 0; transform: translate(-14px, -14px) scale(0.6); }
  to { opacity: 1; transform: translate(0, 0) scale(1); }
}
@keyframes qs-tip-in {
  from { opacity: 0; transform: translate(-50%, -80%) scale(0.85); }
  to { opacity: 1; transform: translate(-50%, -100%) scale(1); }
}
@keyframes qs-blink {
  0% { opacity: 1; filter: none; }
  22% { opacity: 0.15; }
  44% { opacity: 1; }
  66% { opacity: 0.15; }
  100% { opacity: 0; filter: brightness(2.4); transform: scale(0.72); }
}

.wrapper {
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  color: var(--text-color);
  touch-action: none;

  .card {
    width: calc(100% - 32px);
    max-width: 440px;
    box-sizing: border-box;
    background: var(--card-bg-color);
    border-radius: var(--card-radius);
    box-shadow: var(--card-shadow);
  }
  .divider {
    width: 1px;
    height: 24px;
    align-self: center;
    background: var(--border-color);
    opacity: 0.6;
  }

  .score-area {
    position: relative;
    overflow: hidden;
    margin-top: 64px;
    display: flex;
    align-items: center;
    height: var(--row-height);
    .stat {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      .stat-label { font-size: 12px; color: var(--muted-color); }
      .stat-value { font-size: 22px; font-weight: bold; line-height: 1.3; }
    }
    // 本关进度条（与连连看同一套：3px 贴底、主色填充）
    .progress {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 3px;
      background: var(--border-color);
      .progress-bar {
        height: 100%;
        background: var(--primary-bg);
        transition: width 0.3s ease;
      }
    }
  }

  .opt-area {
    display: flex;
    align-items: center;
    margin: var(--row-gap) 0;
    height: var(--row-height);
    .opt-half {
      display: flex;
      align-items: center;
      justify-content: center;
      &:first-child { flex: 1.4; }
      &:last-child { flex: 1.2; }
    }
    .board-info { font-size: 14px; color: var(--muted-color); font-weight: 400; }
    .start-wrapper { display: flex; align-items: center; justify-content: center; flex: 1.2; }
  }

  .game-icon {
    cursor: pointer;
    padding: 8px 16px;
    border: 0;
    border-radius: var(--radius-tile);
    background: var(--primary-bg);
    color: #fff;
    font-size: 14px;
    font-weight: bold;
    &:disabled { background-color: #aaa; cursor: not-allowed; }
  }

  // 撤销 / 重做（与点击游戏同款）
  .undo-card {
    display: flex;
    align-items: stretch;
    margin: 12px auto;
    .undo-item {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px;
    }
    .undo {
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      max-width: 160px;
      padding: 8px 16px;
      font-size: 14px;
      font-weight: bold;
      color: var(--text-color);
      background: transparent;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-tile);
      transition: background-color 0.15s, border-color 0.15s, color 0.15s;
      &:not(:disabled) {
        color: var(--primary-bg);
        border-color: var(--primary-bg);
      }
      &:not(:disabled):active { background: rgba(60, 160, 60, 0.25); }
      &:disabled {
        opacity: 0.5;
        border-color: var(--text-color);
        cursor: not-allowed;
      }
    }
  }

  .game-area {
    position: relative;
    width: fit-content;
    margin: 0 auto;
    .board {
      position: relative;
      display: grid;
      grid-template-columns: repeat(5, var(--cell));
      // 行高必须跟着牌高走（牌是 1:1.35）
      grid-auto-rows: var(--cell-h);
      gap: var(--gap);
      padding: var(--pad);
      border-radius: var(--card-radius);
      box-sizing: content-box;
      .grid-cell {
        border-radius: var(--radius-tile);
        border: 1px solid var(--tile-border-color);
        background-color: rgb(255 255 255 / 8%);
        box-sizing: border-box;
      }
      // 可消牌组的高亮边框（圈住整组）
      .group-ring {
        position: absolute;
        box-sizing: border-box;
        border: 2px solid var(--primary-bg);
        border-radius: calc(var(--radius-tile) + 2px);
        box-shadow: 0 0 0 3px rgb(255 255 255 / 10%), 0 0 12px var(--celebrate-glow);
        pointer-events: none;
        transition: left 0.16s ease, top 0.16s ease, width 0.16s ease, height 0.16s ease;
      }
      // 消除提示气泡：贴在点过的第二张牌正上方
      .clear-tip {
        position: absolute;
        z-index: 3;
        transform: translate(-50%, -100%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: 5px 9px;
        border-radius: 8px;
        background: var(--primary-bg);
        color: #fff;
        font-size: 12px;
        font-weight: bold;
        line-height: 1.3;
        white-space: nowrap;
        box-shadow: 0 3px 10px rgb(0 0 0 / 25%);
        animation: qs-tip-in 0.14s ease-out;
        cursor: pointer;
        &::after {
          content: '';
          position: absolute;
          left: 50%;
          bottom: -5px;
          width: 0;
          height: 0;
          transform: translateX(-50%);
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-top: 5px solid var(--primary-bg);
        }
        .tip-hint { font-weight: 400; opacity: 0.9; }
      }
      .tile {
        position: absolute;
        width: var(--cell);
        height: var(--cell-h);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        .mj-img {
          width: 100%;
          height: 100%;
          display: block;
          user-select: none;
          -webkit-user-drag: none;
        }
        transition: left 0.17s cubic-bezier(0.3, 0.8, 0.4, 1), top 0.17s cubic-bezier(0.3, 0.8, 0.4, 1);
        // 开局从左上到右下逐张铺开（延迟由 JS 按 r + c 注入）
        &.dealt { animation: qs-deal 0.34s cubic-bezier(0.34, 1.4, 0.64, 1) both; }
        // 点选中的牌：主色描边 + 抬起来一点
        &.active {
          transform: translateY(-3px);
          filter: drop-shadow(0 4px 8px rgb(0 0 0 / 22%));
          .mj-img { outline: 3px solid var(--primary-bg); outline-offset: 1px; }
        }
        &.clearing { animation: qs-blink 0.52s ease-in-out forwards; pointer-events: none; }
      }
    }
    .result {
      position: absolute;
      inset: 0;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 12px;
      border-radius: var(--card-radius);
      background: var(--mask-color);
      font-size: 18px;
      font-weight: bold;
      color: var(--win-color);
      &.lose { color: var(--lose-color); }
      .level-note { font-size: 14px; color: var(--text-color); opacity: 0.75; font-weight: 400; }
    }
  }
}
</style>
