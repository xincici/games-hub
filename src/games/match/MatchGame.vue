<template>
  <div class="wrapper">
    <TopHeader @onScoreReset="onScoreReset" />
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
        <span class="difficulty-value">{{ size }}×{{ size }}</span>
        <button @click="changeDifficulty(1)" class="opt-icon" :class="{ disable: difficulty === MAX_DIFFICULTY }">
          <i i-carbon-add-alt />
        </button>
      </div>
      <div class="divider"></div>
      <div class="opt-half">
        <span v-if="phase === PREVIEW" class="preview-tip">👀 {{ previewLeft }}s</span>
        <CountTimer v-else ref="timerRef" :enable="phase === PLAY" />
      </div>
      <div class="divider"></div>
      <div class="start-wrapper">
        <button @click="initGame" class="game-icon">{{ i18n('start') }}</button>
      </div>
    </div>
    <div class="game-area">
      <div class="board" :class="`size-${size}`">
        <div
          v-for="(card, idx) in cards"
          :key="card.id"
          class="tile"
          :class="{ flipped: card.flipped, matched: card.matched }"
          :style="{ animationDelay: `${idx * 25}ms` }"
          @click="onCardClick(card)"
        >
          <div class="card-inner">
            <div class="face back-face">
              <i i-mdi-star-four-points />
            </div>
            <div class="face front-face">{{ card.emoji }}</div>
          </div>
        </div>
      </div>
      <div v-if="phase === WON" class="result win">
        <span>🎉🎉 {{ i18n('tipWin') }} 🎉🎉</span>
        <span v-if="newBest">{{ i18n('newBest') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';

import TopHeader from '@/components/TopHeader.vue';
import CountTimer from './CountTimer.vue';
import confetti from './confetti';
import { i18n } from '@/shared/i18n';

const SIZES = [4, 6, 8];
const PREVIEWS = [4000, 6000, 8000];
// 池子去重后至少覆盖 8×8 = 32 对的上限
const EMOJIS = [...new Set([
  '🍎', '🍌', '🍊', '🍉', '🍇', '🍓', '🍈', '🍒', '🍑', '🥭', '🍍', '🥝', '🍐', '🍏',
  '🍆', '🥕', '🥑', '🍅', '🫐', '🥒', '🥦', '🍋', '🥔', '🌶️', '🍄', '🫛',
  '🌺', '🌼', '🌸', '🌹', '🌷', '💐', '💮', '🥀', '🌱', '🌿', '🍃', '🌳', '🌻',
  '🍂', '🍀', '🌾', '🌵', '🪴', '🎴', '🌴', '🌲', '☘️', '🪷', '🍁', '🥠',
  '🚗', '🚙', '🚘', '🚓', '🚕', '🚌', '🏎️', '🚚', '🚛', '🛻', '🚑', '🚒', '🚔',
  '🏍️', '🚨', '🚖', '🚋', '🚃', '🛺', '🏁', '🚜', '🚐',
  '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐸',
  '🏗️', '🏢', '🏠', '🏛️', '🏘️', '🏬', '🏭',
])];
const [PREVIEW, PLAY, WON] = ['preview', 'play', 'won'];
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 3;
const KEY_PREFIX = '__emoji_match__';
const DIFFICULTY_KEY = `${KEY_PREFIX}difficulty`;

const difficulty = ref(+(localStorage.getItem(DIFFICULTY_KEY) || 1));
const cards = ref([]);
const phase = ref(PREVIEW);
const previewLeft = ref(0);
const newBest = ref(false);
const timerRef = ref(null);

const size = computed(() => SIZES[difficulty.value - 1]);
const leftPairs = computed(() => cards.value.filter(c => !c.matched).length / 2);
const bestTime = ref(0);

let cardId = 0;
let firstCard = null;
let lock = false;
let previewTimer = null;
let countdownTimer = null;
let mismatchTimer = null;

onMounted(initGame);
onUnmounted(clearTimers);

function bestKey() {
  return KEY_PREFIX + difficulty.value;
}

function onScoreReset() {
  localStorage.removeItem(bestKey());
  bestTime.value = 0;
}

function fmt(sec) {
  return ('00' + ~~(sec / 60)).slice(-2) + ':' + ('00' + sec % 60).slice(-2);
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = ~~(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function clearTimers() {
  clearTimeout(previewTimer);
  clearTimeout(mismatchTimer);
  clearInterval(countdownTimer);
}

function initGame() {
  clearTimers();
  firstCard = null;
  lock = false;
  newBest.value = false;
  const pairs = (size.value * size.value) / 2;
  bestTime.value = +(localStorage.getItem(bestKey()) || 0);
  const pool = shuffle(EMOJIS).slice(0, pairs);
  cards.value = shuffle([...pool, ...pool]).map(emoji => ({
    id: ++cardId,
    emoji,
    flipped: true,
    matched: false,
  }));
  phase.value = PREVIEW;
  previewLeft.value = PREVIEWS[difficulty.value - 1] / 1000;
  countdownTimer = setInterval(() => {
    previewLeft.value = Math.max(0, previewLeft.value - 1);
  }, 1000);
  previewTimer = setTimeout(endPreview, PREVIEWS[difficulty.value - 1]);
}

function endPreview() {
  clearTimers();
  cards.value.forEach(card => { card.flipped = false; });
  phase.value = PLAY;
}

function changeDifficulty(dir) {
  const next = Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, difficulty.value + dir));
  if (next === difficulty.value) return;
  difficulty.value = next;
  localStorage.setItem(DIFFICULTY_KEY, next);
  initGame();
}

function onCardClick(card) {
  if (phase.value !== PLAY || lock || card.matched || card.flipped) return;
  card.flipped = true;
  if (!firstCard) {
    firstCard = card;
    return;
  }
  if (firstCard.emoji === card.emoji) {
    firstCard.matched = card.matched = true;
    firstCard = null;
    if (cards.value.every(c => c.matched)) setTimeout(win, 1500);
  } else {
    lock = true;
    const prev = firstCard;
    firstCard = null;
    mismatchTimer = setTimeout(() => {
      prev.flipped = card.flipped = false;
      lock = false;
    }, 700);
  }
}

function win() {
  phase.value = WON;
  timerRef.value?.stop();
  const elapsed = timerRef.value?.seconds() || 0;
  const best = bestTime.value;
  if (!best || elapsed < best) {
    localStorage.setItem(bestKey(), elapsed);
    bestTime.value = elapsed;
    newBest.value = true;
  }
  confetti();
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

// card-inner 上的 opacity < 1 会强制 3D 扁平化（preserve-3d 失效），
// 翻面被中断会露出背面，因此明暗闪烁只放在正面 .front-face 上
@keyframes flash {
  0%, 50%, 100% {
    transform: rotateY(180deg) scale(1);
  }
  25%, 75% {
    transform: rotateY(180deg) scale(1.08);
  }
}

@keyframes blink {
  0%, 50%, 100% {
    opacity: 1;
  }
  25%, 75% {
    opacity: 0.15;
  }
}

@keyframes clear {
  to {
    transform: rotateY(180deg) scale(0);
  }
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
      flex: 3;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 2px;
      .difficulty-value {
        min-width: 40px;
        text-align: center;
        font-size: 16px;
        font-weight: bold;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      .opt-icon {
        padding: 4px;
        font-size: 20px;
      }
    }
    .opt-half {
      flex: 3;
      display: flex;
      align-items: center;
      justify-content: center;
      .preview-tip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 18px;
        font-weight: 600;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
    }
    .start-wrapper {
      flex: 4;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .opt-icon {
      cursor: pointer;
      border: 0 none;
      background: transparent;
      padding: 6px;
      font-size: 22px;
      color: var(--text-color);
      display: inline-flex;
      &.disable {
        opacity: 0.3;
        pointer-events: none;
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
  .game-area {
    position: relative;
    width: calc(100% - 32px);
    max-width: 440px;
    box-sizing: border-box;
  }
  .board {
    display: grid;
    grid-template-columns: repeat(var(--n), 1fr);
    grid-auto-rows: 1fr;
    gap: var(--gap);
    padding: 6px;
    box-sizing: border-box;
    background: var(--board-bg);
    border-radius: var(--card-radius);
    aspect-ratio: 1;
    &.size-4 {
      --n: 4;
      --gap: 6px;
      .face {
        font-size: 28px;
      }
    }
    &.size-6 {
      --n: 6;
      --gap: 4px;
      .face {
        font-size: 19px;
      }
    }
    &.size-8 {
      --n: 8;
      --gap: 2px;
      .face {
        font-size: 14px;
      }
    }
  }
  // 棋盘卡片用 .tile 而非 .card：避免命中上方 .wrapper .card 的
  // width: calc(100% - 32px) 等面板样式，导致卡片变窄且非正方形
  .tile {
    perspective: 600px;
    cursor: pointer;
    animation: 0.35s ease backwards deal;
    -webkit-tap-highlight-color: transparent;
    &.matched {
      pointer-events: none;
      // 翻面 transition 0.4s → 先闪烁再消除，动画串行衔接
      .card-inner {
        animation: flash 0.6s ease 0.45s, clear 0.35s ease 1.05s forwards;
        .front-face {
          animation: blink 0.6s ease 0.45s;
        }
      }
    }
    .card-inner {
      position: relative;
      width: 100%;
      height: 100%;
      transform-style: preserve-3d;
      transition: transform 0.4s ease-in-out;
    }
    &.flipped .card-inner {
      transform: rotateY(180deg);
    }
    .face {
      position: absolute;
      inset: 0;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
    }
    .back-face {
      background: var(--primary-bg);
      color: #fff;
    }
    .front-face {
      background: var(--card-bg-color);
      transform: rotateY(180deg);
    }
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
