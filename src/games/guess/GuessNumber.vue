<template>
  <div class="wrapper">
    <TopHeader>
      <span class="item-wrapper" @click="toggleRobot">
        <i i-mdi-robot-outline v-if="robot" />
        <i i-mdi-robot-off-outline v-else />
      </span>
    </TopHeader>
    <div class="card opt-area">
      <div class="opt-half">
        <CountTimer ref="timerRef" :enable="gameResult === GAMING" />
      </div>
      <div class="opt-half">
        <button ref="initRef" @click="initGame" class="game-icon">{{ i18n('start') }}</button>
      </div>
    </div>
    <div class="card game-area">
      <p v-show="isDebug">anwser: {{ anwser }}</p>
      <div
        v-for="(oneGuess, idx) in guessHistory"
        :key="idx"
        class="answer-line"
        >
        <span
          v-for="(number, index) in oneGuess.nums"
          :key="index"
          class="number-card"
          >{{ number }}</span>
        <span class="result-tip">{{ oneGuess.res }}</span>
      </div>
      <div
        v-if="gameResult === GAMING"
        class="answer-line"
      >
        <span
          v-for="n in GAME_SIZE"
          :key="n"
          class="number-card"
          :class="n - 1 === currentGuess.length ? 'current-input' : ''"
        >{{ currentGuess[n - 1] || '&nbsp;&nbsp;' }}</span>
        <span class="result-tip">_A_B</span>
      </div>
      <div v-if="gameResult >= WIN" class="win">
        <span>🎉🎉 {{ i18n('tipWin') }} 🎉🎉</span>
      </div>
      <div v-if="gameResult === LOSE" class="lose">
        👻👻 {{ i18n('tipLost') }} 👻👻
        <br />
        {{ i18n('anwserIs') + anwser }}
      </div>
    </div>
    <div class="input-area" :class="{ hide: gameResult !== GAMING }">
      <button
        v-for="num in NUMBERS"
        :key="num"
        class="number-button"
        :disabled="currentGuess.includes(num) || currentGuess.length >= GAME_SIZE || gameResult !== GAMING"
        @click="addNumber(num)"
        >{{ num }}</button>
      <button
        class="number-button opt-button del-button"
        @click="delNumber"
        :disabled="currentGuess.length === 0 || gameResult !== GAMING"
      >{{ i18n('optDel') }}</button>
      <button
        class="number-button opt-button enter-button"
        @click="guessOnce"
        :disabled="currentGuess.length !== GAME_SIZE || gameResult !== GAMING"
      >{{ i18n('optEnter') }}</button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import sampleSize from 'lodash.samplesize';

import TopHeader from '@/components/TopHeader.vue';
import CountTimer from './CountTimer.vue';
import { robot, toggle as toggleRobot } from './robot.js';
import confetti from './confetti.js';

const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8];
const [GAMING, LOSE, WIN] = [0, 1, 2];
const GAME_SIZE = 4; // it is always a 4 digits number
const MAX_GUESS = 8; // the maximun number of guess

const timerRef = ref(null);
const initRef = ref(null);

const isDebug = ref(location.search.includes('debug'));
const anwser = ref('');
const gameResult = ref(GAMING);

const guessHistory = ref([]);
const currentGuess = ref('');

let firstGuessTimer = null;
const firstGuessDuration = 200;

watch(gameResult, val => {
  if (val !== GAMING) timerRef.value.stop();
  if (val === WIN) confetti();
});

onMounted(() => {
  initGame();
  addListener();
});

onUnmounted(() => {
  window.removeEventListener('keyup', onKeyUp);
});

function initGame() {
  if (firstGuessTimer) {
    clearTimeout(firstGuessTimer);
    firstGuessTimer = null;
  }
  anwser.value = sampleSize(NUMBERS, GAME_SIZE).join('');
  guessHistory.value.length = 0;
  currentGuess.value = '';
  gameResult.value = GAMING;
  timerRef.value.reset();
  initRef.value.blur();
  if (robot.value) initWithFirstGuess(1);
}
function initWithFirstGuess(num) {
  firstGuessTimer = setTimeout(() => {
    currentGuess.value += String(num);
    if (currentGuess.value.length === GAME_SIZE) {
      firstGuessTimer = null;
      guessOnce();
      return;
    }
    initWithFirstGuess(num + 1);
  }, firstGuessDuration);
}
function onKeyUp(e) {
  const num = e.key;
  if (num === 'Enter') return guessOnce();
  if (num === 'Backspace') return delNumber();
  if (NUMBERS.includes(+num)) return addNumber(+num);
}

function addListener() {
  window.addEventListener('keyup', onKeyUp);
}
function addNumber(num) {
  if (firstGuessTimer) return;
  if (currentGuess.value.includes(num)) return;
  currentGuess.value += num;
}
function delNumber() {
  if (firstGuessTimer) return;
  if (currentGuess.value.length === 0) return;
  currentGuess.value = currentGuess.value.slice(0, -1);
}
function guessOnce() {
  if (currentGuess.value.length !== GAME_SIZE) return;
  let [A, B] = [0, 0];
  for (let i = 0; i < GAME_SIZE; i++) {
    let one = currentGuess.value[i];
    const idx = anwser.value.indexOf(one);
    if (idx === i) A++;
    else if (idx >= 0) B++;
  }
  guessHistory.value.push({
    nums: currentGuess.value.split('').map(v => +v),
    res: `${A}A${B}B`
  });
  if (A === GAME_SIZE) {
    gameResult.value = WIN;
    currentGuess.value = '';
    return;
  }
  if (guessHistory.value.length >= MAX_GUESS) {
    gameResult.value = LOSE;
  }
  currentGuess.value = '';
}
</script>

<style scoped lang="scss">
$card-radius: 16px;

.wrapper {
  display: flow-root;
  width: 100vw;
  min-width: 360px;
  min-height: 100vh;
  min-height: 100dvh;
  box-sizing: border-box;
  background: var(--page-bg);
  color: var(--text-color);
  button,button:disabled {
    touch-action: manipulation;
  }
  .card {
    box-sizing: border-box;
    width: calc(100% - 32px);
    max-width: 448px;
    margin-left: auto;
    margin-right: auto;
    background: var(--card-bg);
    border-radius: $card-radius;
    box-shadow: var(--card-shadow);
  }
  .game-icon {
    cursor: pointer;
    min-width: 125px;
    height: 38px;
    padding: 0 18px;
    color: #fff;
    font-size: 16px;
    font-weight: bold;
    text-align: center;
    background: var(--primary-bg);
    border: 0 none;
    border-radius: 10px;
    &:active {
      opacity: 0.85;
    }
  }
  .opt-area {
    display: flex;
    align-items: stretch;
    margin-top: 70px;
    margin-bottom: 12px;
    min-height: 64px;
    .opt-half {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      &:first-child {
        position: relative;
        &:after {
          content: "";
          position: absolute;
          right: 0;
          top: 50%;
          transform: translateY(-50%);
          height: 24px;
          border-right: 1px solid var(--border-color);
          opacity: 0.6;
        }
      }
    }
  }
  .game-area {
    position: relative;
    padding: 16px 12px;
    margin-bottom: 185px;
    .answer-line {
      margin: 6px 0;
      .number-card, .result-tip {
        position: relative;
        display: inline-block;
        padding: 8px 18px;
        font-size: 16px;
        font-weight: bold;
        color: var(--text-color);
        text-align: center;
        background: var(--key-bg);
        margin: 1px 3px;
        border-radius: 10px;
        &.current-input:after {
          content: " ";
          position: absolute;
          background: rgba(140, 140, 140, 0.6);
          width: 40%;
          height: 2px;
          left: 30%;
          bottom: 20%;
        }
      }
      .result-tip {
        width: 80px;
        padding: 8px 0;
        vertical-align: bottom;
        background: var(--key-active-bg);
      }
    }
    .win,.lose {
      background: var(--mask-color);
      position: absolute;
      width: 100%;
      height: 100%;
      left: 0;
      top: 0;
      border-radius: $card-radius;
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
  }
  .input-area {
    width: 600px;
    height: auto;
    box-sizing: border-box;
    padding: 12px 12px calc(22px + env(safe-area-inset-bottom));
    position: fixed;
    left: 50%;
    bottom: 0;
    transform: translateX(-50%);
    transition: bottom 0.5s ease-in-out;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    background: var(--card-bg);
    border-radius: $card-radius $card-radius 0 0;
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.08);
    &.hide {
      bottom: -100%;
    }
    .number-button {
      flex: 0 0 calc(25% - 8px);
      height: 48px;
      margin: 4px;
      font-size: 18px;
      font-weight: 600;
      background: var(--key-bg);
      color: var(--text-color);
      border: 0 none;
      border-radius: 12px;
      cursor: pointer;
      transition: background 0.15s ease;
      &:active:not(:disabled) {
        background: var(--key-active-bg);
      }
      &:disabled {
        opacity: 0.35;
        cursor: default;
      }
      &.opt-button {
        flex-grow: 1;
        flex-basis: calc(50% - 8px);
      }
      &.enter-button {
        background: var(--enter-bg);
        color: var(--enter-color);
        &:active:not(:disabled) {
          opacity: 0.8;
        }
      }
      &.del-button {
        background: var(--del-bg);
        color: var(--del-color);
        &:active:not(:disabled) {
          opacity: 0.8;
        }
      }
    }
  }
}
@media only screen and (max-width: 720px) {
  .wrapper {
    .input-area {
      width: 100%;
      max-width: inherit;
      border-radius: $card-radius $card-radius 0 0;
    }
  }
}
</style>
