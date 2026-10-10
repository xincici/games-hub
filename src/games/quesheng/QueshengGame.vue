<template>
  <div
    class="wrapper"
    :style="{ '--sheet': `url(${TILE_SHEET})` }"
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
      <!-- 原来这里是一句「滑动合并 · 点组消除」的说明文案（用户要求去掉）；
           现在两半放「新游戏」与「上帝模式」两个按钮 -->
      <div class="start-wrapper">
        <button class="game-icon" @click="confirming = true">{{ i18n('start') }}</button>
      </div>
      <div class="divider"></div>
      <div class="opt-half">
        <button class="game-icon god-btn" :disabled="!canGod && !godPlaying" @click="godPlay">
          {{ godPlaying ? i18n('godStop') : i18n('godMode') }}
        </button>
      </div>
    </div>

    <div class="game-area">
      <!-- 网格底纹：常驻 25 格 -->
      <div class="board dot-board" :style="boardVars" @pointerdown="onBoardDown">
        <div v-for="i in CELLS" :key="`g${i}`" class="grid-cell" />
        <!-- 可消牌组的高亮边框：圈住整组。等牌全部铺开之后再出现（铺牌期间 groups 为空） -->
        <span
          v-for="(g, i) in ringGroups"
          :key="`r${i}-${g.cells.join('-')}`"
          class="group-ring"
          :style="ringStyle(g)"
        />
        <!-- 点齐两张后的消除提示（类 tooltip）：只在真有一对可消时出现，且只给「消除这一对」 -->
        <span
          v-if="hint"
          class="clear-tip"
          :class="{ below: hint.below }"
          :style="hintStyle"
          @click.stop="clearGroup(hint.pair)"
        >
          <span class="tip-act">✨ {{ i18n('clearPair') }}</span>
        </span>

        <!-- 上帝模式播放期间盖一层透明遮罩：挡住点击 / 滑动，和点击游戏同款做法 -->
        <div v-if="godPlaying" class="automask" />
        <!-- 牌：绝对定位，滑动时靠 left/top 过渡动画 -->
        <span
          v-for="t in tiles"
          :key="`${dealSeq}-${t.id}`"
          class="tile"
          :class="{ active: selected.includes(t.cell), clearing: clearing.has(t.id), dealt: dealing }"
          :style="tileStyle(t)"
          @click.stop="onTileClick(t)"
        >
          <span class="mj-face" :style="spriteVars(t)" />
        </span>
        <!-- 刚消掉的牌：留在场上播「闪烁 → 消失」。
             注意不能只靠给 tiles 里的牌加 .clearing —— 消除时格子已经置 null、牌立刻就不在 tiles 里了 -->
        <span
          v-for="t in clearingTiles"
          :key="`clear-${t.id}`"
          class="tile clearing"
          :style="posOf(t.cell)"
        >
          <span class="mj-face" :style="spriteVars(t)" />
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
        <button class="undo" :disabled="!canUndo || godPlaying" @click="undo">
          <i i-carbon-undo />
          <span>{{ i18n('undo') }}</span>
        </button>
      </div>
      <div class="divider"></div>
      <div class="undo-item">
        <button class="undo" :disabled="!canRedo || godPlaying" @click="redo">
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
  SIZE, CELLS, HAND_TILES, levelConfig, newGame, slide, findGroups, sameBoard, tileName, solvePuzzle,
} from './board';

// 牌面是参考图裁出来的 34 张牌拼成的雪碧图（与麻将英雄共用，见 src/shared/mahjongTiles.js）
import { TILE_SHEET, spriteVars, preloadTiles } from '@/shared/mahjongTiles';

const MODE_KEY = '__quesheng__level';
const STATE_KEY = '__quesheng__state';
const [PLAY, WON, OVER] = ['play', 'won', 'over'];
const SWIPE_MIN = 24;            // 滑动判定的最小位移
const CLEAR_MS = 520;
const DEAL_MS = 340;             // 单张牌的入场动画时长（与 qs-deal 保持一致）

const level = ref(1);
const board = ref(new Array(CELLS).fill(null));   // 每个格子放一张牌（或 null）
const movesLeft = ref(0);
const phase = ref(PLAY);
const selected = ref([]);        // 已点选、准备消掉的牌所在的格子
const clearing = ref(new Map()); // 正在闪烁消失的牌 id -> 牌
const groups = ref([]);          // 当前所有可消牌组
const dealing = ref(false);      // 开局铺牌动画中
const dealSeq = ref(0);          // 每次铺牌 +1：让 :key 变化，牌元素重建、入场动画才会重播
const confirming = ref(false);
const history = ref([]);         // undo 栈
const future = ref([]);          // redo 栈
// ---------- 上帝模式 ----------
// 只对「还没动过的开局」开放（和点击游戏的上帝模式一样）：发牌时 newGame 已经把解算好放在这里，
// 所以点下去是零延迟开始播；万一没有（例如是旧存档恢复出来的局面）就现场再解一次。
const godPlaying = ref(false);
const godSolution = ref(null);
const GOD_SLIDE_MS = 620;        // 一次滑动：过渡 0.17s + 停留让人看清
const GOD_PICK_MS = 360;         // 消除前先把这一组点亮，让玩家看清消的是哪组
const GOD_CLEAR_MS = 600;        // 闪烁消除 520ms + 余量
let godTimers = [];              // 可取消的等待（卸载 / 停止时立刻唤醒）
const godSleep = ms => new Promise(resolve => {
  const one = { id: 0, resolve };
  one.id = setTimeout(() => { godTimers = godTimers.filter(x => x !== one); resolve(); }, ms);
  godTimers.push(one);
});
function stopGod() {
  godPlaying.value = false;
  godTimers.forEach(t => clearTimeout(t.id));
  godTimers.forEach(t => t.resolve());
  godTimers = [];
}

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
const clearingTiles = computed(() => [...clearing.value.values()]);
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
  const { board: b, moves, solution } = newGame(level.value);
  board.value = b;
  godSolution.value = solution || null;   // 发牌时就算好的解（上帝模式直接用）
  stopGod();
  groups.value = [];        // 铺牌期间不显示高亮框
  movesLeft.value = moves;
  phase.value = PLAY;
  selected.value = [];
  clearing.value = new Map();
  history.value = [];
  future.value = [];
  groups.value = [];        // 铺牌期间不显示高亮框，等牌铺完（下面的定时器里）再算
  // 铺牌动画：按「从左上到右下」的次序逐张出现
  dealing.value = true;
  dealSeq.value += 1;
  // 波浪：延迟按「行 + 列」递增，波前从左上角一路扫到右下角
  board.value = board.value.map((t, cell) => (t
    ? { ...t, delay: (Math.floor(cell / SIZE) + (cell % SIZE)) * 60 }
    : null));
  const last = (SIZE - 1) * 2 * 60 + DEAL_MS;
  timers.push(setTimeout(() => {
    dealing.value = false;
    board.value = board.value.map(t => (t ? { ...t, delay: 0 } : null));
    refreshGroups();          // 牌全部铺完之后才显示可消高亮
  }, last));
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

// 实际画出来的高亮框：三张组旁边的「两两对子」框是多余的（刻子会同时产生 [0,1]、[1,2] 两个对子），
// 只留三张那张。注意只影响**显示** —— groups 里仍保留对子，因为「消除这一对」还要靠它。
const ringGroups = computed(() => {
  const melds = groups.value.filter(g => g.cells.length === 3);
  return groups.value.filter(g => !(g.cells.length === 2
    && melds.some(m => g.cells.every(c => m.cells.includes(c)))));
});

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
  if (phase.value !== PLAY || clearing.value.size || godPlaying.value) return;
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
// 点齐两张后的提示气泡：**只有「确实能消掉一对」时才浮出来**（点满两张相同的牌、且它们还能
// 与旁边第三张凑成刻子的情形）。顺子点两张没有对子可消，就完全不弹提示（用户要求）；
// 刻子那张也只给「消除这一对」一条路，不再提醒「再点第三张」——想消刻子直接点第三张即可。
const hint = computed(() => {
  if (phase.value !== PLAY || selected.value.length !== 2 || clearing.value.size) return null;
  const sel = selected.value;
  const inBoth = groups.value.filter(g => sel.every(c => g.cells.includes(c)));
  const pair = inBoth.find(g => g.cells.length === 2) || null;
  if (!pair) return null;
  // 第三张牌不能被子挡住，否则容易误点：纵向避开（它在上方就改到下方显示），
  // 横向也朝远离它的方向贴边对齐（气泡比两张牌还宽时，居中会向旁边溢出压到第三张）
  const rows = sel.map(c => Math.floor(c / SIZE));
  const cols = sel.map(c => c % SIZE);
  const minR = Math.min(...rows), maxR = Math.max(...rows);
  const minC = Math.min(...cols), maxC = Math.max(...cols);
  const thirds = inBoth.filter(g => g.cells.length === 3).flatMap(g => g.cells)
    .filter(c => !sel.includes(c));
  const rowOf = c => Math.floor(c / SIZE);
  const colOf = c => c % SIZE;
  const inCols = c => colOf(c) >= minC && colOf(c) <= maxC;
  const inRows = c => rowOf(c) >= minR && rowOf(c) <= maxR;
  const above = thirds.some(c => inCols(c) && rowOf(c) < minR);
  const below = thirds.some(c => inCols(c) && rowOf(c) > maxR);
  const right = thirds.some(c => inRows(c) && colOf(c) > maxC);
  const left = thirds.some(c => inRows(c) && colOf(c) < minC);
  return {
    pair,
    cells: sel,
    // below = 气泡挂在下方（箭头朝上）；tx 是气泡相对锚点的水平对齐：
    // 第三张在右边就让它向左延伸、在左边就向右延伸，都没有就居中
    below: above && !below,
    tx: right && !left ? '-100%' : (left && !right ? '0%' : '-50%'),
  };
});
// 气泡对齐「这两张牌的整体中心」而不是第二张牌：它比两张牌窄，就不会压到旁边 / 上下方的第三张
const hintStyle = computed(() => {
  const h = hint.value;
  if (!h) return {};
  const [a, b] = h.cells.map(posOf);
  const xs = [parseFloat(a.left), parseFloat(b.left)];
  const ys = [parseFloat(a.top), parseFloat(b.top)];
  const cell = metrics.value.cell;
  // 锚点：tx = -50% 时锚在两张牌的中心；-100% 时锚在右边缘（气泡向左长）；0% 时锚在左边缘
  const anchorX = h.tx === '-100%' ? Math.max(...xs) + cell
                : h.tx === '0%' ? Math.min(...xs)
                : (Math.min(...xs) + Math.max(...xs)) / 2 + cell / 2;
  const anchorY = h.below
    ? Math.max(...ys) + metrics.value.cellH + 6
    : Math.min(...ys) - 6;
  return { left: `${anchorX}px`, top: `${anchorY}px`, '--tip-tx': h.tx, '--tip-ty': h.below ? '0%' : '-100%' };
});

function clearGroup(g) {
  pushHistory();
  const going = new Map();
  g.cells.forEach(c => { if (board.value[c]) going.set(board.value[c].id, { ...board.value[c], cell: c }); });
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

// 上帝模式：只要**当前局面回到本关的初始局**就可用 —— history 为空正是这个意思
//（undo 栈里存的是每一步之前的快照，全部撤销回去 = 发牌时的那个局面；快照连牌 id 都存了，
// 所以缓存的最优解对同一副初始局仍然成立）。**不能再要求 future 为空**：玩家撤销回初始局时，
// future 里正留着刚撤销掉的那些步骤，那样按钮会一直是灰的（用户报过）。
const canGod = computed(() => phase.value === PLAY && !godPlaying.value && !clearing.value.size
  && history.value.length === 0 && tilesLeft.value === HAND_TILES);

async function godPlay() {
  if (godPlaying.value) { stopGod(); return; }        // 播放中再点一下 = 停止
  if (!canGod.value) return;
  // 发牌时就算了，正常一定有解；万一没有（旧存档恢复出来的局面）就现场再解一次，解不出就静默不动
  const solution = godSolution.value || solvePuzzle(board.value, movesLeft.value);
  if (!solution || !solution.length) return;
  godPlaying.value = true;
  await godSleep(420);
  for (const step of solution) {
    if (!godPlaying.value || phase.value !== PLAY) break;
    if (step.type === 'slide') {
      applySlide(step.dir);
      await godSleep(GOD_SLIDE_MS);
    } else {
      selected.value = [...step.cells];      // 先点亮这一组（抬起 + 外框），让玩家看清消的是哪组
      await godSleep(GOD_PICK_MS);
      if (!godPlaying.value || phase.value !== PLAY) break;
      const g = groups.value.find(x => x.cells.length === step.cells.length
        && step.cells.every(c => x.cells.includes(c)));
      if (g) clearGroup(g);
      await godSleep(GOD_CLEAR_MS);
    }
  }
  stopGod();
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
  if (phase.value !== PLAY || godPlaying.value) return;
  press = { x: e.clientX, y: e.clientY };
}
function onPointerDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  onBoardDown(e);
}
function onPointerUp(e) {
  if (godPlaying.value) { press = null; return; }
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
    // **过关时棋盘是全空的**（最后那一组消完就没了），所以「棋盘必须有牌」这条不能一刀切，
    // 否则胜利结算永远恢复不出来（用户报过：退出重进后又从这一关重新开始）
    if (!s.board.some(Boolean) && s.phase !== WON) return false;
    level.value = Math.max(1, +s.level || 1);
    // +undefined 是 NaN，`??` 挡不住它，所以用 Number.isFinite 判
    const savedMoves = Number(s.movesLeft);
    movesLeft.value = Number.isFinite(savedMoves) ? Math.max(0, savedMoves) : levelConfig(level.value).moves;
    let n = 0;
    board.value = s.board.map(t => (t ? { suit: t.suit, num: t.num, id: ++n, delay: 0 } : null));
    history.value = Array.isArray(s.history) ? s.history : [];
    future.value = Array.isArray(s.future) ? s.future : [];
    phase.value = s.phase;
    selected.value = [];
    clearing.value = new Map();
    groups.value = [];
    // 恢复的局面也逐张铺开（不然一进来牌是「啪」地全出现的）
    dealing.value = true;
    dealSeq.value += 1;
    board.value = board.value.map((t, cell) => (t
      ? { ...t, delay: (Math.floor(cell / SIZE) + (cell % SIZE)) * 60 }
      : null));
    const last = (SIZE - 1) * 2 * 60 + DEAL_MS;
    timers.push(setTimeout(() => {
      dealing.value = false;
      board.value = board.value.map(t => (t ? { ...t, delay: 0 } : null));
      refreshGroups();
    }, last));
    return true;
  } catch {
    return false;
  }
}

onMounted(async () => {
  computeMetrics();
  window.addEventListener('resize', computeMetrics);
  window.addEventListener('keyup', onKeyUp);
  // 先把牌图全部读进缓存，再开局 —— 这样铺牌动画才不会被图片加载打断
  await preloadTiles();   // 共享模块里缓存的同一个 promise
  if (!restoreState()) startLevel(Math.max(1, +(localStorage.getItem(MODE_KEY) || 1)));
});

onUnmounted(() => {
  stopGod();
  window.removeEventListener('resize', computeMetrics);
  window.removeEventListener('keyup', onKeyUp);
  clearTimers();
  save();
});
</script>

<style scoped lang="scss">
@keyframes qs-deal {
  from { opacity: 0; transform: translate(-18px, -18px) scale(0.45); }
  to { opacity: 1; transform: translate(0, 0) scale(1); }
}
@keyframes qs-ring-in {
  from { opacity: 0; transform: scale(0.94); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes qs-tip-in {
  // 入场只做缩放/淡入，位移沿用 --tip-tx / --tip-ty（否则动画期间会被硬编码的 -100% 拽到上方）
  from { opacity: 0; transform: translate(var(--tip-tx, -50%), var(--tip-ty, -100%)) scale(0.86); }
  to { opacity: 1; transform: translate(var(--tip-tx, -50%), var(--tip-ty, -100%)) scale(1); }
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
    // 上帝模式按钮：和「新游戏」同一套 .game-icon 外观，只是稍微窄一点
    .god-btn { padding: 8px 12px; font-size: 13px; }
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

  // 上帝模式播放期间挡输入的透明遮罩（点击游戏同款）。
  // 注意要写在能被匹配到的层级：它渲染在 .board 里，若跟着 .opt-area 一起嵌套就选不中了
  //（踩过：没有样式 → 变成 grid 里的普通子项、多撑出一行把棋盘撑高，而且完全挡不住输入）
  .automask {
    position: absolute;
    inset: 0;
    z-index: 5;
    background: rgb(255 255 255 / 0%);
    touch-action: none;
  }

  .game-area {
    position: relative;
    // 可消牌组的高亮色：浅橙。深浅两套主题下都够醒目，所以不跟主题变量走
    --group-ring: #ffa63d;
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
      // 可消高亮框用浅橙色（--group-ring），与主色绿区分开：绿是「可操作」、橙是「这一组能消」
      .group-ring {
        position: absolute;
        box-sizing: border-box;
        border: 2px solid var(--group-ring);
        border-radius: calc(var(--radius-tile) + 2px);
        box-shadow: 0 0 0 3px rgb(255 255 255 / 12%), 0 0 10px rgb(255 166 61 / 55%);
        pointer-events: none;
        transition: left 0.16s ease, top 0.16s ease, width 0.16s ease, height 0.16s ease;
        // 牌铺完之后高亮框再淡入，而不是一开始就挂在那儿
        animation: qs-ring-in 0.18s ease-out both;
      }
      // 消除提示气泡：贴在点过的第二张牌正上方
      .clear-tip {
        position: absolute;
        z-index: 3;
        // 变换量由 hintStyle 给的 --tip-tx / --tip-ty 决定（避开第三张牌的方向）
        transform: translate(var(--tip-tx, -50%), var(--tip-ty, -100%));
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
        // 第三张牌在正上方时改到下方显示，箭头也跟着翻过来，避免挡住要点的牌
        &.below {
          &::after {
            bottom: auto;
            top: -5px;
            border-top: none;
            border-bottom: 5px solid var(--primary-bg);
          }
        }
      }
      .tile {
        position: absolute;
        width: var(--cell);
        height: var(--cell-h);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        // 雪碧图取格子：background-size 是「列数 × 100%」，位置按 c/(列数-1)、r/(行数-1) 给百分比，
        // 这样与元素实际尺寸无关（牌随视口缩放也不用改）
        .mj-face {
          width: 100%;
          height: 100%;
          display: block;
          background-image: var(--sheet);
          background-repeat: no-repeat;
          background-size: var(--bg-w, 700%) var(--bg-h, 500%);
          background-position: var(--bg-x, 0%) var(--bg-y, 0%);
          user-select: none;
          // 原图每张牌自己是圆角的（约 5.3% 牌宽），而裁出来的是直角矩形 ——
          // 不给圆角的话四角会露出牌面之外的方块（浅底）。取 9%：比原图略大一点，
          // 刚好把那一圈盖住，又不会明显啃掉牌自身的描边；按牌宽取所以任何尺寸都对得上。
          border-radius: calc(var(--cell) * 0.09);
        }
        transition: left 0.17s cubic-bezier(0.3, 0.8, 0.4, 1), top 0.17s cubic-bezier(0.3, 0.8, 0.4, 1);
        // 开局从左上到右下逐张铺开（延迟由 JS 按 r + c 注入）
        &.dealt { animation: qs-deal 0.34s cubic-bezier(0.34, 1.4, 0.64, 1) both; }
        // 点选中的牌：主色描边 + 抬起来一点
        &.active {
          transform: translateY(-3px);
          filter: drop-shadow(0 4px 8px rgb(0 0 0 / 22%));
          .mj-face { outline: 3px solid var(--primary-bg); outline-offset: 1px; }
        }
        &.clearing {
          animation: qs-blink 0.52s ease-in-out forwards;
          pointer-events: none;
          cursor: default;
        }
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
