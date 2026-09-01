<template>
  <div class="wrapper">
    <TopHeader @onScoreReset="onScoreReset" />
    <div class="card score-card">
      <div class="score-item">
        <span class="label">{{ i18n('bestScore') }}</span>
        <span class="value">{{ bestScore || '--' }}</span>
      </div>
      <div class="divider"></div>
      <div class="score-item">
        <span class="label">{{ i18n('availableClicks') }}</span>
        <span class="value">{{ maxClick - clickCount }}</span>
      </div>
    </div>
    <div class="card opt-card">
      <div class="opt-item">
        <button @click="changeDifficulty(-1)" class="opt-icon" :class="{disable: difficulty === MIN_DIFFICULTY}">
          <i i-carbon-subtract-alt />
        </button>
        <span class="difficulty-num">{{ difficulty }}</span>
        <button @click="changeDifficulty(1)" class="opt-icon" :class="{disable: difficulty === MAX_DIFFICULTY}">
          <i i-carbon-add-alt />
        </button>
      </div>
      <div class="divider"></div>
      <div class="opt-item">
        <button @click="initGame" class="game-icon">{{ i18n('start') }}</button>
      </div>
      <div class="divider"></div>
      <div class="opt-item">
        <button @click="autoplayGame" :disabled="clickCount !== 0" class="game-icon">{{ i18n('godMode') }}</button>
      </div>
    </div>
    <div class="game-area" :class="`cell-${cellSize}`">
      <div v-for="(item, idx_row) in gameData" :key="idx_row">
        <div class="cell" v-for="(cell, idx_col) in item" :key="idx_col">
          <div class="mask" v-show="maskData[idx_row][idx_col] === 0"></div>
          <button class="inner" :class="{zero: cell === 0, one: cell === 1, two: cell === 2, clicked: autoClick[0] === idx_row && autoClick[1] === idx_col}" @click="onCellClick(idx_row, idx_col)">{{ cell }}</button>
        </div>
      </div>
      <div v-if="gameResult >= WIN" class="win">
        <span>🎉🎉 {{ i18n('tipWin') }} 🎉🎉</span>
        <span v-if="gameResult === NB">{{ i18n('newBest') }}</span>
      </div>
      <div v-if="gameResult === LOSE" class="lose">👻👻 {{ i18n('tipLost') }} 👻👻</div>
      <div v-if="autoplaying" class="automask"></div>
    </div>
    <div class="card undo-card">
      <div class="undo-item">
        <button class="undo" @click="userUndo" :disabled="undoIndex < 0 || gameResult !== GAMING || autoplaying">
          <i i-carbon-undo />
          <span>{{ i18n('undo') }}</span>
        </button>
      </div>
      <div class="divider"></div>
      <div class="undo-item">
        <button class="undo" @click="userRedo" :disabled="undoIndex === userOpts.length - 1 || gameResult !== GAMING || autoplaying">
          <i i-carbon-redo />
          <span>{{ i18n('redo') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, watchEffect } from 'vue';

import TopHeader from '@/components/TopHeader.vue';
import confetti from './confetti';
import { difficulty, changeDifficulty, MIN_DIFFICULTY, MAX_DIFFICULTY } from './difficulty';

const BIG_VAL = 3;
const VIRTUAL_CLICK_EFFECT_DURATION = 220;
const VIRTUAL_CLICK_WAIT_DURATION = 300;
const [GAMING, LOSE, WIN, NB] = [0, 1, 2, 3];
const [TINY, MINI, SMALL, MIDDLE, LARGE] = ['tiny', 'mini', 'small', 'middle', 'large'];

const neighbours = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]];
const clickCount = ref(0);
const gameResult = ref(GAMING);
const autoplaying = ref(false);
const autoClick = reactive([-1, -1]);
const userOpts = reactive([]);
const undoIndex = ref(-1);
const storageKey = computed(() => `__easy_click_game__${difficulty.value}`);
const maxClick = computed(() => Math.pow(difficulty.value, 2));
const cellSize = computed(() => difficulty.value <= 4 ? LARGE : difficulty.value <= 6 ? MIDDLE : difficulty.value <= 8 ? SMALL : difficulty.value <= 9 ? MINI : TINY);
const bestScore = ref(localStorage.getItem(storageKey.value));

let gameData, maskData;
let animationFrameId = null;
const historyOpts = {
  list: new Map(),
  add: function (opt) {
    if (!this.list.has(opt)) this.list.set(opt, 1);
    else if (this.list.get(opt) === 1) this.list.set(opt, 2);
    else this.list.delete(opt);
  }
};

const randomOnce = max => [Math.floor(Math.random() * max), Math.floor(Math.random() * max)];
const randomData = length => Array.from({ length }, () => Array.from({ length }, () => 0));
const sleep = ms => new Promise(res => setTimeout(res, ms));

watchEffect(() => {
  bestScore.value = localStorage.getItem(storageKey.value);
});
watch(difficulty, initGame, { immediate: true });
watch(gameResult, val => {
  if (val === WIN) {
    updateBestScore();
    confetti();
  }
});

function initGame() {
  gameData = reactive(randomData(difficulty.value));
  maskData = reactive(randomData(difficulty.value));
  randomSomeOperations();
  gameResult.value = GAMING;
  autoplaying.value = false;
  clickCount.value = 0;
  userOpts.length = 0;
  undoIndex.value = -1;
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  toggleMask(0);
}
async function autoplayGame() {
  autoplaying.value = true;
  const opts = [];
  Array.from(historyOpts.list.keys()).forEach(item => {
    const one = item.split(',').map(v => +v);
    opts.push(one);
    if (historyOpts.list.get(item) === 1) opts.push(one);
  });
  opts.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
  for (let i = 0; i < opts.length; i++) {
    if (!autoplaying.value) return;
    onCellClick(...opts[i]);
    await virtualClick(...opts[i]);
    await sleep(VIRTUAL_CLICK_WAIT_DURATION);
  }
  autoplaying.value = false;
}
async function virtualClick(row, col) {
  autoClick[0] = row;
  autoClick[1] = col;
  await sleep(VIRTUAL_CLICK_EFFECT_DURATION);
  autoClick[0] = autoClick[1] = -1;
}
function randomSomeOperations() {
  historyOpts.list = new Map();
  for (let i = 0; i < (difficulty.value - 2) * 3; i++) {
    const [row, col] = randomOnce(difficulty.value);
    onCellClick(row, col, true);
    historyOpts.add(`${row},${col}`);
    if (Math.random() < 0.5) {
      onCellClick(row, col, true);
      historyOpts.add(`${row},${col}`);
    }
  }
}
function toggleMask(idx) {
  const row = ~~(idx / difficulty.value);
  const col = idx % difficulty.value;
  maskData[row][col] = 1;
  if (idx + 1 < difficulty.value * difficulty.value) {
    animationFrameId = requestAnimationFrame(() => {
      toggleMask(idx + 1);
    });
  }
}
function onScoreReset() {
  bestScore.value = null;
}
function updateBestScore() {
  const score = maxClick.value - clickCount.value;
  if (!bestScore.value || bestScore.value < score) {
    localStorage.setItem(storageKey.value, score);
    bestScore.value = score;
    gameResult.value = NB;
  }
}
function operateCell(row, col, diff) {
  neighbours.forEach(([iRow, iCol]) => {
    iRow += row;
    iCol += col;
    if (iRow < 0 || iRow >= difficulty.value) return;
    if (iCol < 0 || iCol >= difficulty.value) return;
    gameData[iRow][iCol] = (gameData[iRow][iCol] + diff + BIG_VAL) % BIG_VAL;
  });
}
function onCellClick(row, col, isRandom) {
  clickCount.value++;
  if (!isRandom) {
    userOpts.length = undoIndex.value + 1;
    userOpts.push([row, col]);
    undoIndex.value++;
  }
  operateCell(row, col, 1);
  checkResult();
  if (clickCount.value === maxClick.value && gameResult.value !== WIN) {
    gameResult.value = LOSE;
  }
}
function checkResult() {
  for (let i = 0; i < difficulty.value; i++) {
    for (let j = 0; j < difficulty.value; j++) {
      if (gameData[i][j] !== 0) return;
    }
  }
  gameResult.value = WIN;
}
function userUndo() {
  clickCount.value--;
  const [row, col] = userOpts[undoIndex.value];
  undoIndex.value--;
  operateCell(row, col, -1);
}
function userRedo() {
  clickCount.value++;
  const [row, col] = userOpts[undoIndex.value + 1];
  undoIndex.value++;
  operateCell(row, col, 1);
}
</script>

<style scoped lang="scss">
.wrapper {
  width: 100%;
  min-width: 360px;
  box-sizing: border-box;
  background: var(--bg-color);
  color: var(--text-color);
  .card {
    width: calc(100% - 24px);
    max-width: 480px;
    margin: 0 auto;
    box-sizing: border-box;
    background: var(--card-bg-color);
    border: 1px solid var(--border-color);
    border-radius: 16px;
    box-shadow: var(--card-shadow);
  }
  .divider {
    width: 1px;
    align-self: stretch;
    margin: 10px 0;
    background: var(--border-color);
  }
  button,button:disabled {
    touch-action: manipulation;
  }
  .score-card {
    display: flex;
    align-items: center;
    margin-top: 70px;
    .score-item {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      padding: 14px 8px;
      .label {
        font-size: 13px;
        opacity: 0.6;
      }
      .value {
        font-size: 24px;
        font-weight: bold;
        line-height: 1.2;
      }
    }
  }
  .opt-card {
    display: flex;
    align-items: center;
    margin: 12px auto;
    .opt-item {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px 4px;
      &:first-child {
        flex: 3;
      }
      &:not(:first-child) {
        flex: 3.5;
      }
    }
    .difficulty-num {
      min-width: 22px;
      font-size: 18px;
      font-weight: bold;
      text-align: center;
    }
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
  .game-icon {
    cursor: pointer;
    display: inline-block;
    padding: 8px 10px;
    font-size: 14px;
    font-weight: bold;
    background: var(--primary-bg);
    color: #fff;
    border: 0 none;
    border-radius: 8px;
    &:disabled {
      background-color: #aaa;
      cursor: not-allowed;
    }
  }
  .game-area {
    display: inline-block;
    position: relative;
    padding: 10px;
    margin: 12px 0;
    .win,.lose,.automask {
      background: var(--mask-color);
      position: absolute;
      width: 100%;
      height: 100%;
      left: 0;
      top: 0;
      font-weight: bold;
      color: var(--win-color);
      font-size: 18px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .lose {
      color: var(--lose-color);
    }
    .automask {
      background: rgba(255, 255, 255, 0);
    }
    .cell {
      display: inline-block;
      margin: 2px;
      position: relative;
      .mask {
        width: 100%;
        height: 100%;
        position: absolute;
        z-index: 1;
        background: #ccc;
        border-radius: 2px;
      }
      .inner {
        cursor: pointer;
        display: block;
        width: 44px;
        height: 44px;
        line-height: 44px;
        padding: 0;
        border: 1px solid #e1e1e1;
        border-radius: 2px;
        font-size: 16px;
        font-weight: bold;
        background: var(--one-bg-color);
        color: #222;
        opacity: 1;
        &.zero {
          background: var(--zero-bg-color);
        }
        &.two {
          background: var(--two-bg-color);
        }
        &.clicked {
          opacity: 0.1;
        }
      }
    }
  }
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
      border-radius: 12px;
      transition: background-color 0.15s, border-color 0.15s, color 0.15s;
      &:not(:disabled) {
        color: var(--primary-bg);
        border-color: var(--primary-bg);
        background: transparent;
      }
      &:not(:disabled):active {
        background: rgba(60, 160, 60, 0.25);
      }
      &:disabled {
        opacity: 0.5;
        border-color: var(--text-color);
        cursor: not-allowed;
      }
    }
  }
}
@media only screen and (min-width: 320px) and (max-width: 720px) {
  .wrapper .game-area {
    &.cell-large .cell .inner {
      width: 50px;
      height: 50px;
      line-height: 50px;
    }
    &.cell-middle .cell .inner {
      width: 44px;
      height: 44px;
      line-height: 44px;
    }
    &.cell-small .cell .inner {
      width: 38px;
      height: 38px;
      line-height: 38px;
    }
    &.cell-mini .cell .inner {
      width: 33px;
      height: 33px;
      line-height: 33px;
    }
    &.cell-tiny .cell .inner {
      width: 30px;
      height: 30px;
      line-height: 30px;
      font-size: 13px;
    }
  }
}
</style>
