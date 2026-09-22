<template>
  <div class="wrapper">
    <TopHeader @onScoreReset="onScoreReset">
      <!-- 模式开关：emoji ↔ 扑克牌（玩法不变，只换牌面与排列） -->
      <span class="item-wrapper" :title="i18n('modeTip')" @click="toggleMode">
        <i v-if="mode === 1" i-mdi-emoticon-happy-outline />
        <i v-else i-mdi-cards-playing-outline />
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
        <span class="difficulty-value">{{ sizeLabel }}</span>
        <button @click="changeDifficulty(1)" class="opt-icon" :class="{ disable: difficulty === MAX_DIFFICULTY }">
          <i i-carbon-add-alt />
        </button>
      </div>
      <div class="divider"></div>
      <div class="opt-half">
        <span v-if="phase === PREVIEW" class="preview-tip">👀 {{ previewLeft }}s</span>
        <CountTimer v-else ref="timerRef" :enable="phase === PLAY && !finished" />
      </div>
      <div class="divider"></div>
      <div class="start-wrapper">
        <button @click="initGame" class="game-icon">{{ i18n('start') }}</button>
      </div>
    </div>
    <div class="game-area">
      <div class="board dot-board" :class="[`size-${difficulty}`, { poker: mode === 2 }]" :style="boardStyle">
        <div
          v-for="(card, idx) in cards"
          :key="card.id"
          class="tile"
          :class="{ flipped: card.flipped, matched: card.matched }"
          :style="{ animationDelay: `${idx * 25}ms` }"
          @click="onCardClick(card)"
        >
          <div class="card-inner">
            <!-- 牌背 / 牌面：emoji 模式用游戏图标与 emoji，扑克模式整个交给 CardItem -->
            <div class="face back-face">
              <i v-if="mode === 1" :class="BACK_ICON" />
              <CardItem v-else mini :style="cardVars" />
            </div>
            <div class="face front-face">
              <template v-if="mode === 1">{{ card.item }}</template>
              <CardItem v-else mini :num="card.item.num" :type="card.item.type" :style="cardVars" />
            </div>
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
import CountTimer from '@/shared/CountTimer.vue';
import confetti from '@/shared/confetti';
import { i18n } from '@/shared/i18n';
import { gameConfig } from '@/shared/games';
import { EMOJIS } from '@/shared/emojis';
// 扑克牌面直接复用扑克游戏的 CardItem（纯展示组件，没有扑克那边的状态依赖）
import CardItem from '@/games/poker/CardItem.vue';

// 牌背用的是本游戏在首页的图标（同一个 id 在 games.js 里注册，改图标两处一起变）
const BACK_ICON = gameConfig('match').icon;

// 每档难度：棋盘的行 × 列。emoji 模式是正方形棋盘；
// 扑克牌是 2:3 的长方形，同样格数会高出 50%，所以改成横向排布（列多行少）、
// 张数略减，保证牌面的点数与花色看得清
const LAYOUTS = [[[4, 4], [6, 6], [8, 8]], [[4, 4], [5, 6], [6, 8]]];
const GAPS = [6, 4, 2];
const CARD_RATIO = 1.5;   // 与 CardItem 的 60×90 一致
const CARD_MAX_W = 64;
const CARD_TYPES = ['spade', 'club', 'heart', 'diamond'];
const PREVIEWS = [4000, 6000, 8000];
const [PREVIEW, PLAY, WON] = ['preview', 'play', 'won'];
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 3;
const KEY_PREFIX = '__emoji_match__';
const DIFFICULTY_KEY = `${KEY_PREFIX}difficulty`;
// 模式与难度、最佳用时分开存：emoji 沿用不带后缀的老 key，扑克用 _2 后缀
const MODE_KEY = `${KEY_PREFIX}mode`;
const mode = ref(+(localStorage.getItem(MODE_KEY) || 1) === 2 ? 2 : 1);
const modeSuffix = () => (mode.value === 2 ? '_2' : '');
const difficultyKey = () => `${DIFFICULTY_KEY}${modeSuffix()}`;

const difficulty = ref(+(localStorage.getItem(difficultyKey()) || 1));
const cards = ref([]);
const phase = ref(PREVIEW);
const previewLeft = ref(0);
const newBest = ref(false);
const timerRef = ref(null);

const layout = computed(() => LAYOUTS[mode.value - 1][difficulty.value - 1]);
const rows = computed(() => layout.value[0]);
const cols = computed(() => layout.value[1]);
const sizeLabel = computed(() => `${rows.value}×${cols.value}`);
const cardsTotal = computed(() => rows.value * cols.value);
const gap = computed(() => GAPS[difficulty.value - 1]);
const leftPairs = computed(() => cards.value.filter(c => !c.matched).length / 2);
const bestTime = ref(0);

// 格子尺寸：emoji 模式是正方形（只受宽度限制，与原实现一致），
// 扑克模式是 2:3、还要把 rows 行塞进可用高度，所以再按高度反推一次宽度
const metrics = computed(() => {
  const boardW = Math.min(window.innerWidth || 420, 440) - 32;   // game-area 宽
  const availH = Math.max(200, (window.innerHeight || 700) - 262);
  const ratio = mode.value === 2 ? CARD_RATIO : 1;
  const byW = Math.floor((boardW - 12 - (cols.value - 1) * gap.value) / cols.value);
  const byH = Math.floor(((availH - 12 - (rows.value - 1) * gap.value) / rows.value) / ratio);
  const cap = mode.value === 2 ? CARD_MAX_W : Infinity;
  const w = Math.max(12, Math.min(cap, byW, byH));
  return { w, h: Math.round(w * ratio) };
});
const boardStyle = computed(() => ({
  '--n': cols.value,
  '--tile-w': `${metrics.value.w}px`,
  '--tile-h': `${metrics.value.h}px`,
  '--gap': `${gap.value}px`,
}));
// 交给 poker 的 CardItem 的尺寸变量（内联传进去：不用改扑克那边的样式，也不受 scoped 影响）
const cardVars = computed(() => {
  const w = metrics.value.w;
  return {
    // -2 是 CardItem 那张牌自己的左右 / 上下 1px 描边（content-box）
    '--width': `${Math.max(8, w - 2)}px`,
    '--height': `${Math.max(8, metrics.value.h - 2)}px`,
    '--margin': '0px',
    '--radius': `${Math.max(2, Math.round(w * 0.07))}px`,
    '--pos': `${Math.max(1, Math.round(w * 0.07))}px`,
    '--text-size': `${Math.max(7, Math.round(w * 0.26))}px`,
    '--icon-size': `${Math.max(10, Math.round(w * 0.56))}px`,
    '--back-size': `${Math.max(12, Math.round(w * 0.68))}px`,
  };
});

let cardId = 0;
let firstCard = null;
let lock = false;
let previewTimer = null;
let countdownTimer = null;
let mismatchTimer = null;
let winTimer = null;
// 最后一对消掉那一刻的用时：结算浮层要等闪烁动画播完才弹，但成绩不能用延后的读数
let finishTime = 0;
// 已清空（等演出结束）：期间切后台再回来，计时器也不能被 visibilitychange 重新拉起
const finished = ref(false);

onMounted(initGame);
onUnmounted(clearTimers);

function bestKey() {
  return KEY_PREFIX + difficulty.value + modeSuffix();
}

function onScoreReset() {
  // 连点标题清记录：两种牌面、三档难度的最佳用时一起清
  localStorage.removeItem(bestKey());
  for (let i = MIN_DIFFICULTY; i <= MAX_DIFFICULTY; i++) {
    localStorage.removeItem(`${KEY_PREFIX}${i}${modeSuffix()}`);
    localStorage.removeItem(`${KEY_PREFIX}${i}${modeSuffix() === '_2' ? '' : '_2'}`);
  }
  bestTime.value = 0;
}

function fmt(sec) {
  return ('00' + ~~(sec / 60)).slice(-2) + ':' + ('00' + sec % 60).slice(-2);
}

// 牌池：emoji 模式取 pairs 个不同 emoji；扑克模式取 pairs 张不同的牌
//（一副 52 张，最高档 24 对也够），再各复制一份凑成对
function drawPool(pairs) {
  if (mode.value === 1) return shuffle(EMOJIS).slice(0, pairs);
  const deck = [];
  CARD_TYPES.forEach(type => {
    for (let num = 1; num <= 13; num++) deck.push({ num, type });
  });
  return shuffle(deck).slice(0, pairs);
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
  clearTimeout(winTimer);
  clearInterval(countdownTimer);
}

function initGame() {
  clearTimers();
  firstCard = null;
  lock = false;
  newBest.value = false;
  finishTime = 0;
  finished.value = false;
  const pairs = cardsTotal.value / 2;
  bestTime.value = +(localStorage.getItem(bestKey()) || 0);
  const pool = drawPool(pairs);
  cards.value = shuffle([...pool, ...pool]).map(item => ({
    id: ++cardId,
    item,
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
  localStorage.setItem(difficultyKey(), next);
  initGame();
}

// 切换牌面：先按另一种模式自己的难度接着来，再重新发牌
function toggleMode() {
  clearTimers();
  mode.value = mode.value === 1 ? 2 : 1;
  localStorage.setItem(MODE_KEY, String(mode.value));
  difficulty.value = Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY,
    +(localStorage.getItem(difficultyKey()) || 1)));
  initGame();
}

// 牌面内容的键：emoji 就是它自己，扑克是「点数-花色」
const keyOf = item => (typeof item === 'string' ? item : `${item.num}-${item.type}`);

function onCardClick(card) {
  if (phase.value !== PLAY || lock || card.matched || card.flipped) return;
  card.flipped = true;
  if (!firstCard) {
    firstCard = card;
    return;
  }
  if (keyOf(firstCard.item) === keyOf(card.item)) {
    firstCard.matched = card.matched = true;
    firstCard = null;
    if (cards.value.every(c => c.matched)) {
      // 清空最后一对的瞬间就停表取成绩，闪烁 + 撒花只是演出，不能算进用时
      finishTime = timerRef.value?.seconds() || 0;
      timerRef.value?.stop();
      finished.value = true;
      winTimer = setTimeout(win, 1500);
    }
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
  if (phase.value !== PLAY) return;   // 期间开了新局 → 这次结算作废
  phase.value = WON;
  timerRef.value?.stop();
  const elapsed = finishTime;
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
    margin-top: 64px;
    display: flex;
    align-items: center;
    height: var(--row-height);
    .stat {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      .stat-label {
        font-size: 12px;
        color: var(--muted-color);
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
    margin: var(--row-gap) 0;
    height: var(--row-height);
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
      display: inline-flex;
      align-items: center;
      justify-content: center;
      position: relative;
      width: 28px;
      height: 28px;
      padding: 0;
      // 视觉上仍是 28px 小方块，用伪元素把点击热区扩到 44×44（不占布局）
      &::after {
        content: "";
        position: absolute;
        inset: -8px;
      }
      border: 1px solid var(--border-color);
      border-radius: var(--radius-tile);
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
    border-radius: var(--radius-tile);
  }
  .game-area {
    position: relative;
    width: calc(100% - 32px);
    max-width: 440px;
    box-sizing: border-box;
  }
  // 轨道与格子尺寸都由 JS 算好（--tile-w / --tile-h / --gap）：
  // emoji 模式是正方形，扑克模式是 2:3 的长方形，没法再用 1fr + aspect-ratio: 1
  .board {
    display: grid;
    grid-template-columns: repeat(var(--n), var(--tile-w));
    grid-auto-rows: var(--tile-h);
    gap: var(--gap);
    padding: 6px;
    width: fit-content;
    margin: 0 auto;
    box-sizing: border-box;
    border-radius: var(--card-radius);
    &.size-1 .face { font-size: 28px; }
    &.size-2 .face { font-size: 19px; }
    &.size-3 .face { font-size: 14px; }
    // 扑克模式：牌面（含牌背）整个由 poker 的 CardItem 渲染，
    // 外面这层只留 3D 翻面与「配对成功」的闪烁
    // CardItem 的 .card 是「1px 描边 + content-box」，实际比 wrapper 宽 2px；wrapper 又会被
    // 外框的 1px 边框挤窄再居中，牌按 left: 0 贴左边 → 多出的 2px 全跑到右侧，看着就偏右。
    // 所以外框不要边框、宽度按「格子 - 2」传、牌绝对定位到左上角，牌的外框正好等于格子
    &.poker .face {
      border: 0 none;
      background: transparent;
      box-shadow: none;
    }
    &.poker .face .card-wrapper {
      position: absolute;
      left: 0;
      top: 0;
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
      // 翻面 transition 0.45s → 先闪烁再消除，动画串行衔接
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
      transition: transform 0.45s ease-in-out;
    }
    &.flipped .card-inner {
      transform: rotateY(180deg);
    }
    .face {
      position: absolute;
      inset: 0;
      box-sizing: border-box;
      border-radius: var(--radius-tile);
      border: 1px solid var(--tile-border-color);
      box-shadow: var(--shadow-soft);
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
    gap: 12px;
    padding: 12px;
    box-sizing: border-box;
  }
}
</style>
