<template>
  <div class="wrapper">
    <TopHeader @onScoreReset="onScoreReset">
      <span
        class="item-wrapper wall-toggle"
        :class="{ 'wall-toggle-disable': !wallToggleable }"
        :title="i18n('wallModeTip')"
        @click="toggleWallMode"
      >
        <i i-mdi-wall v-if="wallsActive" />
        <i i-mdi-wall v-else style="opacity: 0.35" />
      </span>
    </TopHeader>
    <div class="card score-area">
      <div class="stat">
        <span class="stat-label">{{ i18n('bestScore') }}</span>
        <span class="stat-value">{{ bestTime ? fmt(bestTime) : '--:--' }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('leftPairs') }}</span>
        <span class="stat-value">{{ leftPairs }}</span>
      </div>
    </div>
    <div class="card opt-area">
      <div class="difficulty-wrapper">
        <button @click="changeDifficulty(-1)" class="opt-icon" :class="{ disable: difficulty === MIN_DIFFICULTY }">
          <i i-carbon-subtract-alt />
        </button>
        <span class="difficulty-value">{{ size[0] }}×{{ size[1] }}</span>
        <button @click="changeDifficulty(1)" class="opt-icon" :class="{ disable: difficulty === MAX_DIFFICULTY }">
          <i i-carbon-add-alt />
        </button>
      </div>
      <div class="divider"></div>
      <div class="opt-half">
        <CountTimer ref="timerRef" :enable="timerRunning" :on-tick="onTimerTick" />
      </div>
      <div class="divider"></div>
      <div class="start-wrapper">
        <button @click="initGame" class="game-icon">{{ i18n('start') }}</button>
      </div>
    </div>
    <div class="game-area">
      <div class="board" :class="`size-${difficulty}`">
        <template v-for="(row, r) in board" :key="r">
          <div v-for="(cell, c) in row" :key="`${r}-${c}`" class="cell">
            <button
              v-if="cell"
              class="tile"
              :class="{ selected: isSelected(r, c), shaking: isShaking(r, c), dealing }"
              :style="{ animationDelay: `${dealing ? tileIndex(r, c) * 25 : 0}ms` }"
              @click="onTileClick(r, c)"
            >{{ cell }}</button>
            <div v-else-if="ghostAt(r, c)" class="tile vanishing">{{ ghostAt(r, c).emoji }}</div>
            <div v-else-if="walls[r] && walls[r][c]" class="wall-block"></div>
          </div>
        </template>
        <svg
          v-if="linkPath"
          :key="linkKey"
          class="link-layer"
          :style="linkLayerStyle"
          :viewBox="linkViewBox"
          preserveAspectRatio="none"
        >
          <polyline class="link-halo" :points="linkPoints" pathLength="1" />
          <polyline class="link-line" :points="linkPoints" pathLength="1" />
          <polyline class="link-comet" :points="linkPoints" pathLength="1" />
        </svg>
      </div>
      <div v-if="shuffleTip" class="shuffle-tip">{{ i18n('shuffleTip') }}</div>
      <div v-if="showResult" class="result win">
        <span>🎉🎉 {{ i18n('tipWin') }} 🎉🎉</span>
        <span v-if="newBest">{{ i18n('newBest') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';

import TopHeader from '@/components/TopHeader.vue';
import CountTimer from './CountTimer.vue';
import confetti from './confetti';
import { i18n } from '@/shared/i18n';
import { EMOJIS } from '@/shared/emojis';
import { findPath, generateBoard, hasMove, shuffleBoard } from './board';

// 棋盘比「满盘所需」适当放大，emoji 随机散布、留白约一半格子；
// 生成时优先避开相邻摆放，密度 ~50% 让牌面不挤
const SIZES = [[6, 6], [6, 8], [8, 8], [8, 10], [10, 10]];
const PAIRS = [9, 12, 15, 20, 25];
const [PLAY, WON] = ['play', 'won'];
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 5;
const KEY_PREFIX = '__emoji_link__';
const DIFFICULTY_KEY = `${KEY_PREFIX}difficulty`;
const STATE_KEY = `${KEY_PREFIX}state`;
const WALL_MODE_KEY = `${KEY_PREFIX}walls`;
// 墙壁密度：约 15% 的格子随机成为墙
const WALL_DENSITY = 0.15;

const difficulty = ref(+(localStorage.getItem(DIFFICULTY_KEY) || 1));
const board = ref([]);
// 当前局的墙壁网格（H×W 0/1），无墙时为 []
const walls = ref([]);
// 墙壁模式偏好（影响新开的一局）
const wallMode = ref(localStorage.getItem(WALL_MODE_KEY) === '1');
const phase = ref(PLAY);
const showResult = ref(false);
const selected = ref(null);
const mismatch = ref(null);
const vanishing = ref([]);
const linkPath = ref(null);
const linkKey = ref(0);
const shuffleTip = ref(false);
// 发牌动画中：牌按序号逐个入场（与对对碰一致），结束后恢复无延迟
const dealing = ref(false);
let dealTimer = null;
const newBest = ref(false);
const bestTime = ref(0);
const timerRef = ref(null);

const size = computed(() => SIZES[difficulty.value - 1]);
const leftPairs = computed(() => board.value.flat().filter(Boolean).length / 2);
const timerRunning = computed(() => phase.value === PLAY);
const wallsActive = computed(() => walls.value.length > 0 && walls.value.some(row => row.some(Boolean)));
// 已连过至少一对（或已通关）后不可再切换墙壁模式——中途换墙会破坏进行中的局面
const wallToggleable = computed(() => phase.value === WON
  || leftPairs.value === PAIRS[difficulty.value - 1]);

function toggleWallMode() {
  if (!wallToggleable.value) return;
  wallMode.value = !wallMode.value;
  if (wallMode.value) localStorage.setItem(WALL_MODE_KEY, '1');
  else localStorage.removeItem(WALL_MODE_KEY);
  initGame();
}

// 发牌序号：按阅读顺序只数有牌的格子，空白格不占号，让入场节奏均匀
const tileOrder = computed(() => {
  const order = new Map();
  let idx = 0;
  board.value.forEach((row, r) => row.forEach((cell, c) => {
    if (cell) order.set(`${r},${c}`, idx++);
  }));
  return order;
});
function tileIndex(r, c) {
  return tileOrder.value.get(`${r},${c}`) || 0;
}

// 触发逐个入场动画；totalDelay 后结束（动画本身 0.35s）
function startDealing() {
  clearTimeout(dealTimer);
  dealing.value = true;
  const count = tileOrder.value.size;
  dealTimer = setTimeout(() => {
    dealing.value = false;
  }, count * 25 + 350);
}

const linkLayerStyle = computed(() => {
  const [H, W] = size.value;
  return {
    width: `${((W + 2) / W) * 100}%`,
    height: `${((H + 2) / H) * 100}%`,
    left: `${-100 / W}%`,
    top: `${-100 / H}%`,
  };
});
const linkViewBox = computed(() => {
  const [H, W] = size.value;
  return `0 0 ${W + 2} ${H + 2}`;
});
// 连线端点从牌中心沿路径方向内缩，让线贴近牌的边缘起止
const ENDPOINT_INSET = 0.42;
// 棋盘外一圈的虚拟通道渲染时贴着棋盘边缘（而非半格之外）：
// 棋盘几乎占满屏宽（左右页边距仅 16px），绕左右两侧的线跑到半格外就会出屏
const LANE_GAP = 0.2;
const linkPoints = computed(() => {
  const pts = linkPath.value || [];
  if (pts.length < 2) return '';
  const [H, W] = size.value;
  const svg = pts.map(([r, c]) => {
    let x = c + 1.5;
    let y = r + 1.5;
    if (c === -1) x = 1 - LANE_GAP;
    else if (c === W) x = W + 1 + LANE_GAP;
    if (r === -1) y = 1 - LANE_GAP;
    else if (r === H) y = H + 1 + LANE_GAP;
    return [x, y];
  });
  const inset = (idx, towards) => {
    const [x1, y1] = svg[idx];
    const [x2, y2] = svg[towards];
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    svg[idx] = [x1 + ((x2 - x1) / len) * ENDPOINT_INSET, y1 + ((y2 - y1) / len) * ENDPOINT_INSET];
  };
  inset(0, 1);
  inset(svg.length - 1, svg.length - 2);
  return svg.map(([x, y]) => `${x},${y}`).join(' ');
});

let vanishId = 0;
let linkTimer = null;
let vanishTimers = [];
let shuffleTimer = null;
let shuffleTipTimer = null;
let winTimer = null;

onMounted(() => {
  const savedTime = restore();
  if (savedTime == null) {
    initGame();
  } else {
    timerRef.value.restore(savedTime);
    if (phase.value === WON) timerRef.value.stop();
  }
});

onUnmounted(clearTransient);

function bestKey() {
  return KEY_PREFIX + difficulty.value;
}

function fmt(sec) {
  return ('00' + ~~(sec / 60)).slice(-2) + ':' + ('00' + sec % 60).slice(-2);
}

// 恢复退出前的局面：棋盘 + 难度 + 墙壁 + 用时 + 胜负状态
let shuffledOnRestore = false;
function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY));
    if (!saved || !Array.isArray(saved.board) || !saved.board.length) return null;
    const d = Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, +(saved.difficulty || 1)));
    const [H, W] = SIZES[d - 1];
    if (saved.board.length !== H || !Array.isArray(saved.board[0]) || saved.board[0].length !== W) return null;
    let restoredWalls = [];
    if (Array.isArray(saved.walls) && saved.walls.length === H
      && Array.isArray(saved.walls[0]) && saved.walls[0].length === W) {
      restoredWalls = saved.walls.map(row => row.slice());
    }
    let restored = saved.board.map(row => row.slice());
    const remaining = restored.flat().filter(Boolean).length;
    bestTime.value = +(localStorage.getItem(KEY_PREFIX + d) || 0);
    if (saved.phase === WON && !remaining) {
      phase.value = WON;
      showResult.value = true;
    } else if (remaining) {
      phase.value = PLAY;
      // 存档时正处于死局重排的间隙：恢复后立即重排（同样带发牌动画）
      if (!hasMove(restored, H, W, restoredWalls)) {
        const rest = restored.flat().filter(Boolean);
        restored = shuffleBoard(restored, H, W, Math.random, restoredWalls);
        if (!hasMove(restored, H, W, restoredWalls)) {
          restored = generateBoard(H, W, rest, Math.random, rest.length / 2, restoredWalls);
        }
        shuffledOnRestore = true;
      }
    } else {
      return null;
    }
    difficulty.value = d;
    board.value = restored;
    walls.value = restoredWalls;
    if (phase.value === PLAY) startDealing();
    if (shuffledOnRestore) shuffleTip.value = true;
    shuffledOnRestore = false;
    return saved.time || 0;
  } catch {
    return null;
  }
}

function save() {
  localStorage.setItem(STATE_KEY, JSON.stringify({
    board: board.value,
    walls: walls.value,
    difficulty: difficulty.value,
    time: timerRef.value?.seconds() || 0,
    phase: phase.value,
  }));
}

function onTimerTick() {
  if (phase.value !== PLAY) return;
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
    saved.time = timerRef.value?.seconds() || 0;
    localStorage.setItem(STATE_KEY, JSON.stringify(saved));
  } catch { /* 存档损坏时静默跳过，下一次 save() 会整体重写 */ }
}

function clearTransient() {
  clearTimeout(linkTimer);
  linkTimer = null;
  clearTimeout(dealTimer);
  dealTimer = null;
  dealing.value = false;
  vanishTimers.forEach(clearTimeout);
  vanishTimers = [];
  clearTimeout(shuffleTimer);
  shuffleTimer = null;
  clearTimeout(shuffleTipTimer);
  shuffleTipTimer = null;
  clearTimeout(winTimer);
  winTimer = null;
  vanishing.value = [];
  linkPath.value = null;
  shuffleTip.value = false;
}

// 随机生成墙壁网格（先于牌生成，保证可解性判断含墙）
function generateWalls(H, W) {
  return Array.from({ length: H }, () => Array.from({ length: W }, () => Math.random() < WALL_DENSITY ? 1 : 0));
}

async function initGame() {
  clearTransient();
  const [H, W] = size.value;
  const newWalls = wallMode.value ? generateWalls(H, W) : [];
  // 先渲染空矩阵销毁全部旧牌元素再填充：牌按坐标 :key 复用，
  // 若直接换盘，同坐标的旧元素不会重播发牌动画、旧 emoji 会瞬间可见
  board.value = Array.from({ length: H }, () => Array.from({ length: W }, () => null));
  walls.value = newWalls;
  await nextTick();
  board.value = generateBoard(H, W, EMOJIS, Math.random, PAIRS[difficulty.value - 1], newWalls);
  phase.value = PLAY;
  showResult.value = false;
  selected.value = null;
  mismatch.value = null;
  newBest.value = false;
  bestTime.value = +(localStorage.getItem(bestKey()) || 0);
  timerRef.value?.reset();
  startDealing();
  save();
}

function changeDifficulty(dir) {
  const next = Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, difficulty.value + dir));
  if (next === difficulty.value) return;
  difficulty.value = next;
  localStorage.setItem(DIFFICULTY_KEY, next);
  initGame();
}

function onScoreReset() {
  localStorage.removeItem(bestKey());
  bestTime.value = 0;
}

function isSelected(r, c) {
  return selected.value && selected.value[0] === r && selected.value[1] === c;
}

function isShaking(r, c) {
  return mismatch.value && mismatch.value.some(([mr, mc]) => mr === r && mc === c);
}

function ghostAt(r, c) {
  return vanishing.value.find(g => g.r === r && g.c === c);
}

function onTileClick(r, c) {
  if (phase.value !== PLAY || !board.value[r][c] || mismatch.value) return;
  if (!selected.value) {
    selected.value = [r, c];
    return;
  }
  const [sr, sc] = selected.value;
  if (sr === r && sc === c) {
    selected.value = null;
    return;
  }
  const [H, W] = size.value;
  if (board.value[sr][sc] !== board.value[r][c]) {
    // emoji 不同：静默把焦点切换到刚点的牌
    selected.value = [r, c];
    return;
  }
  const path = findPath(board.value, H, W, sr, sc, r, c, walls.value);
  if (!path) {
    // 相同但路径不通：双牌抖动提示
    onMismatch([sr, sc], [r, c]);
    return;
  }
  removePair(path, [sr, sc], [r, c]);
}

function onMismatch(a, b) {
  mismatch.value = [a, b];
  selected.value = null;
  setTimeout(() => {
    if (mismatch.value) mismatch.value = null;
  }, 400);
}

function removePair(path, a, b) {
  const [ar, ac] = a;
  const [br, bc] = b;
  const ghosts = [
    { id: ++vanishId, r: ar, c: ac, emoji: board.value[ar][ac] },
    { id: ++vanishId, r: br, c: bc, emoji: board.value[br][bc] },
  ];
  // 数据立即消除（后续连通判断基于新盘面），动画交给幻影牌独立播放
  board.value[ar][ac] = null;
  board.value[br][bc] = null;
  selected.value = null;

  clearTimeout(linkTimer);
  linkKey.value++;
  linkPath.value = path;
  linkTimer = setTimeout(() => {
    linkPath.value = null;
  }, 800);

  vanishing.value.push(...ghosts);
  vanishTimers.push(setTimeout(() => {
    vanishing.value = vanishing.value.filter(g => !ghosts.some(x => x.id === g.id));
  }, 600));

  const [H, W] = size.value;
  if (!board.value.flat().some(Boolean)) {
    win();
    return;
  }
  if (!hasMove(board.value, H, W, walls.value)) {
    // 等连线动画播完再重排；重排本身带逐个入场的 deal 动画
    shuffleTimer = setTimeout(async () => {
      if (phase.value !== PLAY || hasMove(board.value, H, W, walls.value)) return;
      const before = board.value;
      const rest = before.flat().filter(Boolean);
      // 先在原位置集合上重排；若救不活（如仅剩的一对被墙围死，
      // 任何排列都无解），退而重新生成一局等对数的新盘面
      let next = shuffleBoard(before, H, W, Math.random, walls.value);
      if (!hasMove(next, H, W, walls.value)) {
        next = generateBoard(H, W, rest, Math.random, rest.length / 2, walls.value);
      }
      // 先清空渲染（销毁旧牌元素）再填充，让重排重播发牌动画
      board.value = Array.from({ length: H }, () => Array.from({ length: W }, () => null));
      await nextTick();
      board.value = next;
      selected.value = null;
      shuffleTip.value = true;
      startDealing();
      shuffleTipTimer = setTimeout(() => {
        shuffleTip.value = false;
      }, 1600);
      save();
    }, 650);
  }
  save();
}

function win() {
  const elapsed = timerRef.value?.seconds() || 0;
  timerRef.value?.stop();
  phase.value = WON;
  if (!bestTime.value || elapsed < bestTime.value) {
    localStorage.setItem(bestKey(), elapsed);
    bestTime.value = elapsed;
    newBest.value = true;
  }
  save();
  // 结算遮罩等最后一对的消除动画播完再出现
  winTimer = setTimeout(() => {
    showResult.value = true;
    confetti();
  }, 600);
}
</script>

<style scoped lang="scss">
@keyframes deal {
  from {
    opacity: 0;
    transform: scale(0.4);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}

@keyframes vanish {
  0% { transform: scale(1); opacity: 1; }
  40% { transform: scale(1.12); opacity: 1; }
  100% { transform: scale(0); opacity: 0; }
}

// 连线先描边画出（dashoffset 1→0），停留片刻后淡出
@keyframes link-draw {
  to { stroke-dashoffset: 0; }
}

@keyframes link-fade {
  to { opacity: 0; }
}

// 一小段亮线沿路径从头扫到尾（dashoffset 从 1 递减到 0.18）
@keyframes link-sweep {
  to { stroke-dashoffset: 0.18; }
}

.wrapper {
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  box-sizing: border-box;
  background: var(--bg-color);
  color: var(--text-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  button {
    touch-action: manipulation;
  }
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
    margin-top: 70px;
    display: flex;
    align-items: center;
    height: 72px;
    .stat {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      .stat-label {
        font-size: 12px;
        opacity: 0.6;
      }
      .stat-value {
        font-size: 22px;
        font-weight: bold;
        line-height: 1.2;
        font-variant-numeric: tabular-nums;
      }
    }
  }
  .opt-area {
    display: flex;
    align-items: center;
    margin: 16px 0;
    height: 72px;
    .difficulty-wrapper {
      flex: 3.5;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      .difficulty-value {
        min-width: 40px;
        text-align: center;
        font-size: 16px;
        font-weight: bold;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
    }
    .opt-half {
      flex: 2.5;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .start-wrapper {
      flex: 4;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .opt-icon {
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      background: var(--card-bg-color);
      color: var(--text-color);
      font-size: 15px;
      &.disable {
        color: var(--border-color);
        cursor: not-allowed;
      }
    }
  }
  .game-icon {
    cursor: pointer;
    padding: 8px 16px;
    font-size: 14px;
    font-weight: bold;
    white-space: nowrap;
    background: var(--primary-bg);
    color: #fff;
    border: 0 none;
    border-radius: 8px;
  }
  // 已开局后墙壁开关禁用态
  .wall-toggle-disable {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .game-area {
    position: relative;
    width: calc(100% - 32px);
    max-width: 440px;
    box-sizing: border-box;
  }
  .board {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--cols), 1fr);
    grid-auto-rows: 1fr;
    aspect-ratio: var(--cols) / var(--rows);
    background: var(--board-bg);
    border-radius: var(--card-radius);
    &.size-1 {
      --rows: 6;
      --cols: 6;
      .tile { font-size: 26px; }
    }
    &.size-2 {
      --rows: 6;
      --cols: 8;
      .tile { font-size: 22px; }
    }
    &.size-3 {
      --rows: 8;
      --cols: 8;
      .tile { font-size: 22px; }
    }
    &.size-4 {
      --rows: 8;
      --cols: 10;
      .tile { font-size: 18px; }
    }
    &.size-5 {
      --rows: 10;
      --cols: 10;
      .tile { font-size: 18px; }
    }
  }
  // 连线层比棋盘四周各大一格（虚拟外圈），viewBox 与格子等比例，
  // 格子中心严格落在 (col+1.5, row+1.5)，端点不会偏移
  .link-layer {
    position: absolute;
    pointer-events: none;
    z-index: 2;
    overflow: visible;
  }
  .link-line {
    fill: none;
    stroke: var(--win-color);
    stroke-width: 0.08;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: link-draw 0.12s ease-out forwards, link-fade 0.18s ease-in 0.55s forwards;
  }
  .link-halo {
    fill: none;
    stroke: var(--win-color);
    stroke-width: 0.18;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.25;
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: link-draw 0.12s ease-out forwards, link-fade 0.18s ease-in 0.55s forwards;
  }
  // 一段短亮线沿线扫过，营造流动感
  .link-comet {
    fill: none;
    stroke: var(--win-color);
    stroke-width: 0.11;
    stroke-linecap: round;
    opacity: 0.9;
    stroke-dasharray: 0.18 0.82;
    stroke-dashoffset: 1;
    animation: link-sweep 0.45s cubic-bezier(0.3, 0, 0.4, 1) forwards, link-fade 0.18s ease-in 0.55s forwards;
  }
  .cell {
    position: relative;
  }
  .tile {
    position: absolute;
    inset: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0 none;
    border-radius: 6px;
    background: var(--card-bg-color);
    color: var(--text-color);
    -webkit-tap-highlight-color: transparent;
    transition: transform 0.12s ease, box-shadow 0.12s ease;
    // 发牌动画只在 dealing 期间生效：结束后规则彻底移除，
    // 避免 selected/shaking 切换时 deal 规则重新应用导致牌「消失重现」
    &.dealing:not(.selected):not(.shaking):not(.vanishing) {
      animation: 0.35s ease backwards deal;
    }
    &.selected {
      transform: scale(1.12);
      background: var(--enter-bg);
      box-shadow: 0 0 0 2px var(--primary-bg);
      z-index: 1;
    }
    &.shaking {
      animation: shake 0.35s ease !important;
    }
    &.vanishing {
      pointer-events: none;
      background: var(--enter-bg);
      box-shadow: 0 0 0 2px var(--win-color);
      animation: vanish 0.55s ease forwards !important;
    }
  }
  // 墙壁：比牌更暗的斜纹块，不可点击、不参与消除
  .wall-block {
    position: absolute;
    inset: 3px;
    border-radius: 6px;
    background: var(--two-bg-color);
    background-image: repeating-linear-gradient(45deg,
      transparent 0 6px,
      rgba(0, 0, 0, 0.14) 6px 9px);
    border: 1px solid var(--tile-border-color);
    box-sizing: border-box;
  }
  .shuffle-tip {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 3;
    padding: 10px 18px;
    border-radius: 10px;
    background: var(--mask-color);
    color: var(--text-color);
    font-size: 15px;
    font-weight: bold;
    white-space: nowrap;
  }
  .result {
    position: absolute;
    width: 100%;
    height: 100%;
    left: 0;
    top: 0;
    z-index: 2;
    border-radius: var(--card-radius);
    background: var(--mask-color);
    color: var(--win-color);
    font-weight: bold;
    font-size: 18px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }
}
</style>
