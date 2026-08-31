<template>
  <div class="wrapper" :class="`${rocker? 'rocker' : '' }`" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
    <TopHeader @onScoreReset="bestScore = null">
      <span class="item-wrapper" @click="toggleRocker">
        <i i-mdi-power-socket-fr v-if="rocker" />
        <i i-mdi-cursor-move v-else />
      </span>
    </TopHeader>
    <div class="score-area card">
      <div class="stat">
        <span class="stat-label">{{ i18n('bestScore') }}</span>
        <span class="stat-value">{{ bestScore === null ? '--' : bestScore }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('availableClicks') }}</span>
        <span class="stat-value">{{ clickCount }}</span>
      </div>
    </div>
    <div class="opt-area card">
      <div class="difficulty-wrapper">
        <button @click="changeDifficulty(-1)" class="opt-icon" :class="{disable: difficulty === MIN_DIFFICULTY}">
          <i i-carbon-subtract-alt />
        </button>
        <span class="difficulty-value">{{ difficulty }}</span>
        <button @click="changeDifficulty(1)" class="opt-icon" :class="{disable: difficulty === MAX_DIFFICULTY}">
          <i i-carbon-add-alt />
        </button>
      </div>
      <div class="divider"></div>
      <div class="start-wrapper">
        <button @click="initGame" class="game-icon">{{ i18n('start') }}</button>
      </div>
    </div>
    <div class="game-area" :class="`cell-${difficulty}`">
      <div
        class="cell"
        v-for="(item, idx) in gameData.list"
        :key="item"
        @click="onCellClick(idx)"
      >
        <div
          class="inner"
          :class="{
            hide: item === maxNumber && !gameData.mask[idx] && !showWin,
            even: item % 2 === 0,
            odd: item % 2 !== 0,
            zoom: gameResult >= WIN && gameData.zoom[idx],
            shake: gameData.shake === idx,
          }"
        >
          <div class="mask" v-if="gameData.mask[idx]"></div>
          {{ item }}
        </div>
      </div>
      <div v-if="showWin" class="win">
        <span>🎉🎉 {{ i18n('tipWin') }} 🎉🎉</span>
        <span v-if="gameResult === NB">{{ i18n('newBest') }}</span>
      </div>
    </div>
    <Transition name="rocker">
      <div v-if="rocker" class="rocker-area">
        <button
          @click="rockerClick(1, 0)"
          :disabled="rockerDisable[0]"
        >
          <i i-mdi-arrow-up-bold-circle />
        </button>
        <br />
        <button
          @click="rockerClick(0, 1)"
          :disabled="rockerDisable[1]"
        >
          <i i-mdi-arrow-left-bold-circle />
        </button>
        <button
          @click="rockerClick(0, -1)"
          :disabled="rockerDisable[2]"
        >
          <i i-mdi-arrow-right-bold-circle />
        </button>
        <br />
        <button
          @click="rockerClick(-1, 0)"
          :disabled="rockerDisable[3]"
        >
          <i i-mdi-arrow-down-bold-circle />
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, watchEffect } from 'vue';

import TopHeader from '@/components/TopHeader.vue';
import confetti from './confetti';
import { rocker, toggle as toggleRocker } from './rocker';
import { difficulty, changeDifficulty, MIN_DIFFICULTY, MAX_DIFFICULTY } from './difficulty';

const [GAMING, WIN, NB] = [0, 1, 2];

const clickCount = ref(0);
const gameResult = ref(GAMING);
const showWin = ref(false);
const storageKey = computed(() => `__number_puzzle__${difficulty.value}`);
const maxNumber = computed(() => difficulty.value * difficulty.value);
const maxIndex = ref(-1); // 最大值的下标，视觉上就是空白位的下标，-1 代表未初始化
const randomCount = computed(() => 12 << difficulty.value);
const animateTime = computed(() => ~~(800 / maxNumber.value));
const rockerDisable = computed(() => {
  if (gameResult.value !== GAMING) return new Array(4).fill(true);
  const len = difficulty.value;
  const maxRow = ~~(maxIndex.value / len);
  const maxCol = maxIndex.value % len;
  return [
    maxRow === len - 1,
    maxCol === len - 1,
    maxCol === 0,
    maxRow === 0
  ];
});
const neighbours = [[-1, 0], [0, -1], [0, 1], [1, 0]]; // order matters
const bestScore = ref(localStorage.getItem(storageKey.value) || null);

const initData = len => new Array(len).fill(1).map((_, idx) => idx + 1);
const sleep = ms => new Promise(res => setTimeout(res, ms));

const gameData = reactive({
  list: [],
  mask: [],
  zoom: [],
  shake: -1,
});
let maskTimer = null;
let zoomTimer = null;
let winTimer = null;
let lastRandom = 0; // 最后一次随机的下标

let eventInited = false;

watchEffect(() => {
  bestScore.value = localStorage.getItem(storageKey.value) || null;
});
watch(difficulty, initGame, { immediate: true });
watch(gameResult, val => {
  if (val === WIN) {
    updateBestScore();
    toggleZoom(0);
  }
});
watch(showWin, val => {
  if (val) confetti();
});

function initGame() {
  clearTimer();
  gameData.list = initData(maxNumber.value);
  gameData.mask = new Array(maxNumber.value).fill(1);
  gameData.zoom = [];
  maxIndex.value = maxNumber.value - 1;
  gameResult.value = GAMING;
  showWin.value = false;
  clickCount.value = 0;
  lastRandom = 0;
  randomOperations();
  addKeyboardHandler();
  toggleMask(0);
}
function clearTimer() {
  if (maskTimer) clearTimeout(maskTimer);
  if (zoomTimer) clearTimeout(zoomTimer);
  if (winTimer) clearTimeout(winTimer);
  maskTimer = zoomTimer = winTimer = null;
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
function addKeyboardHandler() {
  if (eventInited) return;
  eventInited = true;
  window.addEventListener('keyup', e => {
    if (!['ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'ArrowUp' && !rockerDisable.value[0]) return rockerClick(1, 0);
    if (e.key === 'ArrowLeft' && !rockerDisable.value[1]) return rockerClick(0, 1);
    if (e.key === 'ArrowRight' && !rockerDisable.value[2]) return rockerClick(0, -1);
    if (e.key === 'ArrowDown' && !rockerDisable.value[3]) return rockerClick(-1, 0);
  });
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
    localStorage.setItem(storageKey.value, score);
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
  neighbours.forEach(diff => {
    const newRow = lastRow + diff[0];
    const newCol = lastCol + diff[1];
    if (newRow < 0 || newRow >= len || newCol < 0 || newCol >= len) return;
    const newIdx = newRow * len + newCol;
    if (gameData.list[newIdx] !== maxNumber.value) return;
    operate = true;
    swapTwoIdx(idx, newIdx);
    clickCount.value++;
  });
  if (operate) checkResult();
  else shakeCell(idx);
}
function shakeCell(idx) {
  gameData.shake = idx;
  setTimeout(() => {
    gameData.shake = -1;
  }, 100);
}
function rockerClick(dRow, dCol) {
  const len = difficulty.value;
  const lastRow = ~~(maxIndex.value / len);
  const lastCol = maxIndex.value % len;
  const newRow = lastRow + dRow;
  const newCol = lastCol + dCol;
  if (newRow < 0 || newRow >= len || newCol < 0 || newCol >= len) return;
  const newIdx = newRow * len + newCol;
  onCellClick(newIdx);
}
function checkResult() {
  for (let i = 0; i < maxNumber.value; i++) {
    if (gameData.list[i] !== i + 1) return;
  }
  gameResult.value = WIN;
}

let touchStartX = 0;
let touchStartY = 0;
function onTouchStart(e) {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}
function onTouchEnd(e) {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return; // 视为点击，忽略
  if (Math.abs(dx) > Math.abs(dy)) {
    // 水平滑动：空白格跟随手指移动方向，即向右滑 → 空白格右移 (dCol = -1)
    if (dx > 0 && !rockerDisable.value[2]) rockerClick(0, -1);
    else if (dx < 0 && !rockerDisable.value[1]) rockerClick(0, 1);
  } else {
    // 垂直滑动
    if (dy > 0 && !rockerDisable.value[3]) rockerClick(-1, 0);
    else if (dy < 0 && !rockerDisable.value[0]) rockerClick(1, 0);
  }
}
</script>

<style scoped lang="scss">
@keyframes shake {
  from {
    transform: translateX(-12%);
  }
  to {
    transform: translateX(12%);
  }
}
@keyframes zoom {
  from {
    transform: scale(1);
  }
  50% {
    transform: scale(1.25);
  }
  to {
    transform: scale(1);
  }
}

.wrapper {
  width: 100vw;
  min-width: 360px;
  min-height: 100vh;
  box-sizing: border-box;
  overflow-y: auto;
  background: var(--bg-color);
  color: var(--text-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  .card {
    background: var(--card-bg-color);
    border-radius: var(--card-radius);
    box-shadow: var(--card-shadow);
    width: calc(100% - 32px);
    max-width: 480px;
    box-sizing: border-box;
  }
  &.rocker {
    .score-area {
      margin-top: 70px;
    }
    .game-area {
      margin-top: 0px;
    }
  }
  .divider {
    width: 1px;
    height: 24px;
    align-self: center;
    background: var(--border-color);
    opacity: 0.6;
  }
  .score-area {
    transition: margin-top 0.3s ease-in-out;
    margin: 70px 0 0;
    display: flex;
    .stat {
      flex: 1;
      padding: 14px 28px;
      display: flex;
      flex-direction: column;
      align-items: center;
      .stat-label {
        font-size: 12px;
        opacity: 0.6;
      }
      .stat-value {
        font-size: 22px;
        font-weight: bold;
        line-height: 1.3;
      }
    }
  }
  .opt-icon,.game-icon {
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border-color);
    padding: 2px;
    width: 28px;
    height: 28px;
    margin: 0 4px;
    color: var(--text-color);
    text-align: center;
    font-style: normal;
    font-weight: bold;
    font-size: 15px;
    border-radius: 8px;
    background: var(--card-bg-color);
    &.disable {
      color: var(--border-color);
      cursor: not-allowed;
    }
  }
  .game-icon {
    width: auto;
    height: 32px;
    padding: 6px 20px;
    font-size: 14px;
    background: var(--primary-bg);
    color: #fff;
    border: 0 none;
    &:disabled {
      background-color: #aaa;
      cursor: not-allowed;
    }
  }
  .opt-area {
    margin: 16px 0;
    padding: 12px 0;
    display: flex;
    align-items: center;
    font-weight: bold;
    .difficulty-wrapper,
    .start-wrapper {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .difficulty-value {
      margin: 0 8px;
    }
  }
  .game-area {
    display: inline-block;
    position: relative;
    transition: margin-top 0.3s ease-in-out;
    margin: 0 0 20px;
    padding: 15px;
    .win {
      background-color: var(--mask-color);
      position: absolute;
      width: 100%;
      height: 100%;
      left: 0;
      top: 0;
      border-radius: 8px;
      font-weight: bold;
      color: var(--win-color);
      font-size: 18px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    &.cell-3 {
      width: 195px;
      .cell {
        width: 65px;
        height: 65px;
      }
    }
    &.cell-4 {
      width: 240px;
      .cell {
        width: 60px;
        height: 60px;
      }
    }
    &.cell-5 {
      width: 275px;
      .cell {
        width: 55px;
        height: 55px;
      }
    }
    &.cell-6 {
      width: 300px;
      .cell {
        width: 50px;
        height: 50px;
      }
    }
    .cell {
      display: inline-block;
      position: relative;
      box-sizing: border-box;
      padding: 3px;
      .mask {
        width: 100%;
        height: 100%;
        position: absolute;
        z-index: 1;
        background: #ccc;
        border-radius: 8px;
      }
      .inner {
        cursor: pointer;
        display: flex;
        position: relative;
        width: 100%;
        height: 100%;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        font-size: 16px;
        font-weight: bold;
        color: #222;
        opacity: 1;
        &.hide {
          visibility: hidden;
        }
        &.shake {
          animation: 0.025s ease-in-out 0s infinite shake;
        }
        &.zoom {
          animation: 0.08s ease-in-out 0s zoom;
        }
        &.even {
          background: var(--even-bg-color);
        }
        &.odd {
          background: var(--odd-bg-color);
        }
      }
    }
  }
  .rocker-area {
    padding: 14px 28px 20px;
    button {
      height: 56px;
      width: 56px;
      border: 1px solid var(--border-color);
      border-radius: 10px;
      margin: 1px 29px;
      padding: 0;
      font-size: 24px;
      display: inline-block;
      text-align: center;
      vertical-align: middle;
      color: var(--text-color);
      background: var(--card-bg-color);
      i {
        margin: 0;
      }
      &:disabled {
        color: #aaa;
      }
    }
  }
  .rocker-enter-active,
  .rocker-leave-active {
    transition: all 0.3s ease-in-out;
  }
  .rocker-enter-from,
  .rocker-leave-to {
    transform: translateY(80px);
    opacity: 0;
  }
}
</style>
