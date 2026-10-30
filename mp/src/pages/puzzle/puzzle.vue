<template>
  <view
    class="screen"
    @touchstart="onTouchStart"
    @touchend="onTouchEnd"
    @touchcancel="onTouchCancel"
  >
    <view class="page">
      <!-- 全站背景（粒子连线 + 底部过山车，与 web 的 ParticleBackground 同款） -->
      <ParticleBackground />
      <!-- 统计条（web 的 .score-area）：最佳得分 / 点击次数。
           点击次数从 0 往上加（不是「剩余可用」），它同时就是存进 __number_puzzle__<难度> 的分数（越少越好）。
           label 的 emoji 前缀写在字典里（与 web 的 i18n cn 原文一字不差）。 -->
      <view class="card score-area">
        <view class="stat">
          <text class="stat-label">{{ tt('bestScore') }}</text>
          <text class="stat-value">{{ bestScore === null ? '--' : bestScore }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('availableClicks') }}</text>
          <text class="stat-value">{{ clickCount }}</text>
        </view>
      </view>

      <!-- 操作区（web 的 .card.opt-card）：难度 −/+（flex 3）+ 新游戏（flex 3.5） -->
      <view class="card opt-area">
        <view class="opt-item difficulty-wrapper">
          <view class="opt-icon" :class="{ disable: difficulty === MIN_DIFFICULTY }" @click="changeDifficulty(-1)">
            <view class="opt-ico i-carbon-subtract-alt" />
          </view>
          <text class="difficulty-num">{{ difficulty }}</text>
          <view class="opt-icon" :class="{ disable: difficulty === MAX_DIFFICULTY }" @click="changeDifficulty(1)">
            <view class="opt-ico i-carbon-add-alt" />
          </view>
        </view>
        <view class="divider" />
        <view class="opt-item">
          <button class="game-icon" @click="initGame">{{ tt('start') }}</button>
        </view>
      </view>

      <!-- 游戏区（web 的 .game-area）：棋盘尺寸由内容反算 —— 2 * PAD + n * CELL（见 areaStyle）。
           格子与内容全部绝对定位、共用同一份 PAD / CELL 数学（不用 flex gap）。 -->
      <view class="game-area" :style="areaStyle">
        <view
          v-for="(item, idx) in gameData.list"
          :key="idx"
          class="cell"
          :style="cellStyle(idx)"
          @click="onCellClick(idx)"
        >
          <view
            class="inner"
            :class="{
              hide: item === maxNumber && !gameData.mask[idx] && !showWin,
              even: item % 2 === 0,
              odd: item % 2 !== 0,
              zoom: gameResult >= WIN && gameData.zoom[idx],
              shake: gameData.shake === idx,
            }"
          >
            <view v-if="gameData.mask[idx]" class="mask" />
            <text class="num">{{ item }}</text>
          </view>
        </view>

        <!-- 胜利层（web 的 .win）：盖住整块棋盘，等 zoom 波浪走完 300ms 才出现 -->
        <view v-if="showWin" class="win">
          <text class="win-line">🎉🎉 {{ tt('tipWin') }} 🎉🎉</text>
          <text v-if="gameResult === NB" class="win-new">{{ tt('newBest') }}</text>
        </view>
      </view>

      <!-- 摇杆（web 的 .rocker-area，顶栏开关）：小程序没有页面内顶栏，
           开关改成右下角悬浮按钮（模式在上、帮助在下）；摇杆本体仍在页面底部，位置与 web 一致 -->
      <view v-if="rocker" class="rocker-area">
        <view class="rocker-row">
          <button class="rocker-btn" :class="{ off: rockerDisable[0] }" :disabled="rockerDisable[0]" @click="rockerClick(1, 0)">
            <view class="rocker-ico i-mdi-arrow-up-bold-circle" />
          </button>
        </view>
        <view class="rocker-row">
          <button class="rocker-btn" :class="{ off: rockerDisable[1] }" :disabled="rockerDisable[1]" @click="rockerClick(0, 1)">
            <view class="rocker-ico i-mdi-arrow-left-bold-circle" />
          </button>
          <button class="rocker-btn" :class="{ off: rockerDisable[2] }" :disabled="rockerDisable[2]" @click="rockerClick(0, -1)">
            <view class="rocker-ico i-mdi-arrow-right-bold-circle" />
          </button>
        </view>
        <view class="rocker-row">
          <button class="rocker-btn" :class="{ off: rockerDisable[3] }" :disabled="rockerDisable[3]" @click="rockerClick(-1, 0)">
            <view class="rocker-ico i-mdi-arrow-down-bold-circle" />
          </button>
        </view>
      </view>
    </view>

    <!-- 胜利彩带（纯 CSS 降级版，web 是 canvas-confetti + 同一时刻播 success.mp3） -->
    <Confetti v-if="justWon" />
    <FloatingActions>
      <view class="fab" @click="toggleRocker">
        <view v-if="rocker" class="fab-ico i-mdi-power-socket-fr" />
        <view v-else class="fab-ico i-mdi-cursor-move" />
      </view>
      <view class="fab" @click="showHelp"><view class="fab-ico i-carbon-help" /></view>
    </FloatingActions>
    <HelpSheet :open="helpOpen" :text="helpText" @close="helpOpen = false" />
  </view>
</template>

<script setup>
// 数字迷宫 · 微信小程序版
// 逻辑从 web 版 src/games/puzzle/MainGame.vue 原样搬过来（洗牌 / 点击 / 摇杆 / 胜负 / 最佳分）：
// - 存档：localStorage → @/core/storage，**key 与 web 一字不差**：
//     __number_puzzle__difficulty（当前难度）
//     __number_puzzle__<3|4|5|6>（各难度最佳点击次数，越少越好）
//     __number_puzzle_rocker（摇杆开关，注意只有单个下划线，与 web 的 rocker.js 一致）
//   web 的 difficulty.js / rocker.js 直接调 localStorage，在小程序里跑不了；
//   这两段（各十行）在这里用 @/core/storage 重写，导出/行为与 web 完全一致。
// - 交互：web 用 Pointer Events（PC 鼠标拖也能动）+ 键盘方向键；小程序只有触摸，
//   所以换成 touchstart/touchend（阈值 10px，与 web 同值），摇杆按钮与直接点格子照旧。
// - 尺寸：web 用 px（棋盘 225 / 270 / 305 / 330），这里按 750rpx = 屏宽折算成 rpx，
//   并且**由内容反算**棋盘宽高（2 * PAD + n * CELL），不写死一块固定大小的底板。
// - 动画：入场「遮罩逐格揭开」、胜利「逐格放大波浪」是 web 的 JS 时序，原样保留（CSS 关键帧同款）；
//   摇杆面板的进场（上滑 + 淡入）用 CSS animation 复刻（web 是 <Transition>，离场动画小程序没有）。
// - 音效：与 web 同落点 —— 只有「点了不能动的数字」播 playFail；胜利彩带那一刻播 playWin（web 由 confetti() 播）。
import { computed, onUnmounted, reactive, ref, watch, watchEffect } from 'vue';

import Confetti from '@/components/Confetti.vue';
import FloatingActions from '@/components/FloatingActions.vue';
import HelpSheet from '@/components/HelpSheet.vue';
import { getRaw, setRaw } from '@/core/storage';
import { playFail, playWin } from '@/core/sfx';
import { setNavTitle } from '@/core/i18n';
import { tt } from './i18n';
import ParticleBackground from '@/components/ParticleBackground.vue';

// 原生导航栏标题跟随语言（pages.json 里的标题是静态的）
setNavTitle(() => tt('gameTitle'));

const [GAMING, WIN, NB] = [0, 1, 2];

// ---------- 存档 key（与 web 完全一致，别改名） ----------
const DIFFICULTY_KEY = '__number_puzzle__difficulty';
const ROCKER_KEY = '__number_puzzle_rocker';

const INIT_DIFFICULTY = 4;
const MIN_DIFFICULTY = 3;
const MAX_DIFFICULTY = 6;

// ---------- 几何（rpx）：web 的 px × 1.923（750 / 390） ----------
const PAD = 29;                                   // web .game-area padding: 15px
// web：cell-3 65px / cell-4 60px / cell-5 55px / cell-6 50px
const CELL_SIZE = { 3: 125, 4: 115, 5: 106, 6: 96 };

// ---------- 难度（= web difficulty.js，存储换成 core/storage） ----------
// web 是 `+localStorage.getItem(key) || 4`；这里多一步「越界回落」，坏存档（被改成 9 之类）不会把 9×9 画出来
const savedDifficulty = +getRaw(DIFFICULTY_KEY);
const difficulty = ref(
  savedDifficulty >= MIN_DIFFICULTY && savedDifficulty <= MAX_DIFFICULTY ? savedDifficulty : INIT_DIFFICULTY,
);
watchEffect(() => { setRaw(DIFFICULTY_KEY, difficulty.value); });

function changeDifficulty(diff) {
  if ((difficulty.value === MIN_DIFFICULTY && diff < 0) || (difficulty.value === MAX_DIFFICULTY && diff > 0)) return;
  difficulty.value += diff;
}

// ---------- 摇杆开关（= web rocker.js，存储换成 core/storage） ----------
// web 关掉时 removeItem；core/storage 没有 remove，写 '' 后 getRaw 同样返回 null（等价「没有这个 key」）
const rocker = ref(Boolean(getRaw(ROCKER_KEY)));
watch(rocker, (val) => { setRaw(ROCKER_KEY, val ? 1 : ''); });

function toggleRocker() {
  rocker.value = !rocker.value;
}

// ---------- 局面 ----------
const clickCount = ref(0);
const gameResult = ref(GAMING);
const showWin = ref(false);
const justWon = ref(false);        // 只在「真正赢下这一刻」为真，恢复/初始态不放彩带
const maxNumber = computed(() => difficulty.value * difficulty.value);
const maxIndex = ref(-1);          // 最大值的下标，视觉上就是空白位的下标，-1 代表未初始化
const randomCount = computed(() => 12 << difficulty.value);
const animateTime = computed(() => ~~(800 / maxNumber.value));
const cellSize = computed(() => CELL_SIZE[difficulty.value] || CELL_SIZE[INIT_DIFFICULTY]);
// 容器尺寸由内容反算：左右各 PAD + n 个格子（§零 第 2 条，不要写死）
const boardSize = computed(() => PAD * 2 + cellSize.value * difficulty.value);
const areaStyle = computed(() => ({ width: boardSize.value + 'rpx', height: boardSize.value + 'rpx' }));

const bestKey = computed(() => `__number_puzzle__${difficulty.value}`);
const bestScore = ref(getRaw(bestKey.value));
// 与 web 的 watchEffect 一致：切难度就重新读该难度的最佳分
watchEffect(() => { bestScore.value = getRaw(bestKey.value); });

const rockerDisable = computed(() => {
  if (gameResult.value !== GAMING) return new Array(4).fill(true);
  const len = difficulty.value;
  const maxRow = ~~(maxIndex.value / len);
  const maxCol = maxIndex.value % len;
  return [
    maxRow === len - 1,
    maxCol === len - 1,
    maxCol === 0,
    maxRow === 0,
  ];
});
const neighbours = [[-1, 0], [0, -1], [0, 1], [1, 0]]; // order matters（与 web 同序）

const gameData = reactive({
  list: [],
  mask: [],
  zoom: [],
  shake: -1,
});
let maskTimer = null;
let zoomTimer = null;
let winTimer = null;
let shakeTimer = null;
let wonTimer = null;
let lastRandom = 0; // 最后一次随机的下标

// ---------- 坐标（格子与牌面共用这一份数学） ----------
function cellStyle(idx) {
  const len = difficulty.value;
  const size = cellSize.value;
  return {
    left: PAD + (idx % len) * size + 'rpx',
    top: PAD + Math.floor(idx / len) * size + 'rpx',
    width: size + 'rpx',
    height: size + 'rpx',
  };
}

const initData = len => new Array(len).fill(1).map((_, idx) => idx + 1);

function initGame() {
  clearTimer();
  gameData.list = initData(maxNumber.value);
  gameData.mask = new Array(maxNumber.value).fill(1);
  gameData.zoom = [];
  gameData.shake = -1;
  maxIndex.value = maxNumber.value - 1;
  gameResult.value = GAMING;
  showWin.value = false;
  justWon.value = false;
  clickCount.value = 0;
  lastRandom = 0;
  randomOperations();
  toggleMask(0);
}

function clearTimer() {
  if (maskTimer) clearTimeout(maskTimer);
  if (zoomTimer) clearTimeout(zoomTimer);
  if (winTimer) clearTimeout(winTimer);
  if (shakeTimer) clearTimeout(shakeTimer);
  maskTimer = zoomTimer = winTimer = shakeTimer = null;
}

function swapTwoIdx(idx1, idx2) {
  const tmp = gameData.list[idx1];
  gameData.list[idx1] = gameData.list[idx2];
  gameData.list[idx2] = tmp;
  maxIndex.value = idx1;
}

function getRandom() {
  while (true) {
    const newIdx = ~~(Math.random() * 4);
    if (lastRandom + newIdx !== 3) {
      lastRandom = newIdx;
      break;
    }
  }
  return neighbours[lastRandom];
}

function randomOperations() {
  const len = difficulty.value;
  let lastRow = len - 1;
  let lastCol = len - 1;
  for (let i = 0; i < randomCount.value; i++) {
    const [dRow, dCol] = getRandom();
    const newRow = lastRow + dRow;
    const newCol = lastCol + dCol;
    if (newRow < 0 || newRow >= len || newCol < 0 || newCol >= len) continue;
    swapTwoIdx(newRow * len + newCol, lastRow * len + lastCol);
    lastRow = newRow;
    lastCol = newCol;
  }
  maxIndex.value = gameData.list.indexOf(maxNumber.value);
}

// 入场：遮罩逐格揭开（web 的 toggleMask）
function toggleMask(idx) {
  gameData.mask[idx] = 0;
  if (idx + 1 < maxNumber.value) {
    maskTimer = setTimeout(() => {
      toggleMask(idx + 1);
    }, animateTime.value);
  } else {
    checkResult();
  }
}

// 胜利：逐格放大波浪（web 的 toggleZoom）
function toggleZoom(idx) {
  gameData.zoom[idx] = 1;
  if (idx + 1 < maxNumber.value) {
    zoomTimer = setTimeout(() => {
      toggleZoom(idx + 1);
    }, animateTime.value);
  } else {
    winTimer = setTimeout(() => {
      showWin.value = true;
    }, 300);
  }
}

function updateBestScore() {
  const score = clickCount.value;
  if (bestScore.value === null || score < bestScore.value) {
    setRaw(bestKey.value, score);
    bestScore.value = score;
    gameResult.value = NB;
  }
}

function onCellClick(idx) {
  if (gameResult.value >= WIN) return;
  const len = difficulty.value;
  const lastRow = ~~(idx / len);
  const lastCol = idx % len;
  let operate = false;
  neighbours.forEach((diff) => {
    const newRow = lastRow + diff[0];
    const newCol = lastCol + diff[1];
    if (newRow < 0 || newRow >= len || newCol < 0 || newCol >= len) return;
    const newIdx = newRow * len + newCol;
    if (gameData.list[newIdx] !== maxNumber.value) return;
    operate = true;
    swapTwoIdx(idx, newIdx);
    clickCount.value++;
  });
  if (operate) {
    checkResult();
  } else {
    shakeCell(idx);
    // 点的是「空白那一格」（隐藏的最大数字本身）就不响：它不是走错，只是这里没有可换的邻居
    if (gameData.list[idx] !== maxNumber.value) playFail();
  }
}

function shakeCell(idx) {
  gameData.shake = idx;
  clearTimeout(shakeTimer);
  shakeTimer = setTimeout(() => {
    gameData.shake = -1;
  }, 100);
}

function rockerClick(dRow, dCol) {
  if (gameResult.value >= WIN) return;
  const len = difficulty.value;
  const lastRow = ~~(maxIndex.value / len);
  const lastCol = maxIndex.value % len;
  const newRow = lastRow + dRow;
  const newCol = lastCol + dCol;
  if (newRow < 0 || newRow >= len || newCol < 0 || newCol >= len) return;
  onCellClick(newRow * len + newCol);
}

function checkResult() {
  for (let i = 0; i < maxNumber.value; i++) {
    if (gameData.list[i] !== i + 1) return;
  }
  gameResult.value = WIN;
}

// ---------- 空白格跟手滑动（web 是 Pointer Events；小程序用 touchstart/touchend） ----------
// 阈值 10px 与 web 相同：小于阈值视为点击（交给 .cell 自己的 click），不在这里处理。
// 指针落在帮助弹窗上时不参与（弹窗是 .screen 的子节点，事件会冒泡上来）。
let dragStartX = 0;
let dragStartY = 0;
let tracking = false;

function onTouchStart(e) {
  if (helpOpen.value) return;
  const p = e.touches && e.touches[0];
  if (!p) return;
  tracking = true;
  dragStartX = p.clientX;
  dragStartY = p.clientY;
}

function onTouchEnd(e) {
  if (!tracking) return;
  tracking = false;
  if (helpOpen.value) return;
  const p = (e.changedTouches && e.changedTouches[0]) || null;
  if (!p) return;
  const dx = p.clientX - dragStartX;
  const dy = p.clientY - dragStartY;
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return; // 视为点击，忽略
  if (Math.abs(dx) > Math.abs(dy)) {
    // 水平滑动：向右滑 → 空白格右移 (dCol = -1)
    if (dx > 0 && !rockerDisable.value[2]) rockerClick(0, -1);
    else if (dx < 0 && !rockerDisable.value[1]) rockerClick(0, 1);
  } else if (dy > 0 && !rockerDisable.value[3]) {
    rockerClick(-1, 0);
  } else if (dy < 0 && !rockerDisable.value[0]) {
    rockerClick(1, 0);
  }
}

function onTouchCancel() {
  tracking = false;
}

// ---------- 帮助 ----------
const helpOpen = ref(false);
// 帮助文案：导语 + 各条（HelpSheet 按 \n\n 拆段）
const helpText = computed(() => {
  const parts = [];
  const keys = ['helpMsg'];
  for (let i = 1; i <= 10; i += 1) keys.push(`help${i}`);
  keys.forEach((k) => { const v = tt(k); if (v && v !== k) parts.push(v); });
  return parts.join('\n\n');
});

function showHelp() {
  helpOpen.value = true;
}

// ---------- 启动 ----------
// 三个 watch 必须放在所有声明之后：`{ immediate: true }` 会**同步**调用 initGame，
// 而 initGame 用到 initData / toggleMask 等（const 箭头函数有 TDZ，放前面会 ReferenceError）
watch(difficulty, initGame, { immediate: true });
watch(gameResult, (val) => {
  if (val === WIN) {
    updateBestScore();
    toggleZoom(0);
  }
});
watch(showWin, (val) => {
  if (!val) return;
  // web: confetti() —— 左右礼炮 + 同一时刻播 success.mp3
  justWon.value = true;
  playWin();
  clearTimeout(wonTimer);
  wonTimer = setTimeout(() => { justWon.value = false; }, 4000);
});

onUnmounted(() => {
  clearTimer();
  clearTimeout(wonTimer);
});
</script>

<style lang="scss" scoped>
/* 整页只在 .screen 上写一次满屏高度（.page 不再写，否则 200vh 能白滚） */
.screen {
  min-height: 100vh;
  background: transparent;  /* 背景交给 ParticleBackground（canvas 自己铺底色） */
}
.page {
  padding: 27rpx 24rpx 140rpx;   /* 底部 140rpx 让开右下角悬浮按钮 */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 31rpx;                    /* = web 的 --row-gap: 16px */
  background: #f0f2f5;
  color: #222;
}

/* ---------- 统计条 / 操作区（高度由 App.vue 的全局 .score-area / .opt-area 统一给） ---------- */
.score-area,
.opt-area {
  width: 690rpx;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}
.stat {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4rpx;                     /* web 的 gap: 2px */
}
.stat-label {
  font-size: 23rpx;              /* 12px */
  color: #5f6b7a;
  line-height: 1.2;
}
.stat-value {
  font-size: 42rpx;              /* 22px */
  font-weight: 700;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
}
.divider {
  width: 2rpx;                   /* 1px */
  height: 46rpx;                 /* 24px */
  align-self: center;
  background: #e1e1e1;
  opacity: 0.6;
}

/* 难度格 flex 3、按钮格 flex 3.5（与 web 的 .opt-card 一致） */
.opt-item {
  display: flex;
  align-items: center;
  justify-content: center;
}
.opt-item:first-child { flex: 3; }
.opt-item:not(:first-child) { flex: 3.5; }
.difficulty-wrapper { gap: 8rpx; }   /* web 的 gap: 4px */

/* 难度加减的小方块（web 的 .opt-icon）：28×28、1px 边框、8px 圆角、15px 图标，
   点击热区用 ::after 扩到 44×44 */
.opt-icon {
  position: relative;
  width: 53rpx;                  /* 28px */
  height: 53rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2rpx solid #e1e1e1;
  border-radius: 15rpx;          /* 8px */
  background: #fff;
  color: #222;
  font-size: 29rpx;              /* 15px → 图标 1.2em ≈ 35rpx ≈ 18px */
  box-sizing: border-box;
}
.opt-icon::after {
  content: '';
  position: absolute;
  top: -15rpx;
  right: -15rpx;
  bottom: -15rpx;
  left: -15rpx;
}
.opt-icon.disable { color: #e1e1e1; }
.opt-ico { pointer-events: none; }
.difficulty-num {
  min-width: 42rpx;              /* web 的 min-width: 22px */
  text-align: center;
  font-size: 34rpx;              /* 18px */
  font-weight: 700;
}

/* 主按钮：web 的 .game-icon（padding 8px 16px / 14px 粗体 / 8px 圆角） */
.game-icon {
  margin: 0;
  padding: 0 31rpx;
  height: 66rpx;
  line-height: 66rpx;
  border: 0;
  border-radius: 15rpx;
  background: #23804e;
  color: #fff;
  font-size: 27rpx;              /* 14px */
  font-weight: 700;
  white-space: nowrap;
  box-sizing: border-box;
}

/* ---------- 游戏区（web 的 .game-area：padding 15px、无底色） ---------- */
.game-area {
  position: relative;
  border-radius: 15rpx;
  /* 宽高由 areaStyle 内联给（2 * PAD + n * CELL），格子也绝对定位 —— 两者共用同一份 PAD / CELL */
  touch-action: none;            /* 与 web 一致：滑动归棋盘所有（加在整页会吃掉滚动） */
}
.cell {
  position: absolute;
  padding: 6rpx;                 /* web 的 .cell padding: 3px */
  box-sizing: border-box;
}
/* 遮罩（web 的 .mask）：盖住整格，入场时逐格揭开 */
.mask {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1;
  background: #c9ced6;
  border-radius: 15rpx;          /* 8px */
}
.inner {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  border: 2rpx solid #c9d0da;
  border-radius: 15rpx;          /* 8px */
  font-size: 31rpx;              /* 16px */
  font-weight: 700;
  color: #222;
  opacity: 1;
  box-sizing: border-box;
}
.inner.even { background: #f2f4f7; }
.inner.odd { background: #d8f0e2; }
/* 空白位（最大数字）揭开后就消失 —— 和 web 一样靠 visibility，不卸载节点 */
.inner.hide { visibility: hidden; }
/* 点了不能动的数字：约 11Hz 的「摇头」（web 从 0.025s 放宽到 0.09s，60Hz 屏才看得清） */
.inner.shake { animation: cell-shake 0.09s ease-in-out infinite; }
/* 胜利时逐格放大 */
.inner.zoom { animation: cell-zoom 0.08s ease-in-out; }
.num { line-height: 1; }

/* 胜利层（web 的 .win）：width/height 100% + 同尺寸圆角；z-index 压住入场遮罩 */
.win {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 15rpx;          /* 8px */
  background: rgba(255, 255, 255, 0.8);
  color: #12833f;
  font-size: 35rpx;              /* 18px */
  font-weight: 700;
  text-align: center;
}

/* ---------- 摇杆（web 的 .rocker-area：padding 14px 28px 20px，按钮 56px） ---------- */
.rocker-area {
  padding: 27rpx 54rpx 38rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;                     /* web 每行按钮上下 margin 1px */
  animation: rocker-in 0.3s ease-in-out both;   /* web 是 <Transition>，这里只做进场 */
}
.rocker-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 111rpx;                   /* web 两个按钮左右 margin 各 29px → 中缝 58px */
}
.rocker-btn {
  flex: 0 0 auto;
  width: 108rpx;                 /* 56px */
  height: 108rpx;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2rpx solid #e1e1e1;
  border-radius: 15rpx;          /* 8px */
  background: #fff;
  color: #222;
  font-size: 46rpx;              /* 24px → 图标 1.2em ≈ 55rpx ≈ 29px */
  line-height: 1;
  box-sizing: border-box;
}
.rocker-btn.off { color: #aaa; }
.rocker-ico { pointer-events: none; }

@keyframes cell-shake {
  from { transform: translateX(-12%); }
  to { transform: translateX(12%); }
}
@keyframes cell-zoom {
  from { transform: scale(1); }
  50% { transform: scale(1.25); }
  to { transform: scale(1); }
}
/* web 的 .rocker-enter-from：translateY(80px) + opacity 0，0.3s ease-in-out */
@keyframes rocker-in {
  from { transform: translateY(154rpx); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
</style>
