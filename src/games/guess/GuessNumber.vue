<template>
  <div class="wrapper">
    <TopHeader @onScoreReset="onScoreReset">
      <span class="item-wrapper" @click="toggleRobot">
        <i i-mdi-robot-outline v-if="robot" />
        <i i-mdi-robot-off-outline v-else />
      </span>
    </TopHeader>
    <!-- 统计条：最长连胜在前、当前连胜在后（约定第 4 节） -->
    <div class="card score-area">
      <div class="stat">
        <span class="stat-label">{{ i18n('bestStreak') }}</span>
        <span class="stat-value">{{ bestStreak || '--' }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('curStreak') }}</span>
        <span class="stat-value">{{ streak }}</span>
      </div>
    </div>
    <div class="card opt-area">
      <div class="opt-half">
        <CountTimer ref="timerRef" :enable="gameResult === GAMING"  :on-tick="onTimerTick" />
      </div>
      <div class="opt-half">
        <button ref="initRef" @click="onNewGame" class="game-icon">{{ i18n('start') }}</button>
      </div>
    </div>
    <!-- 猜测记录区：max-height 由 JS 按「离底部输入区还有多少可用空间」动态算，超出后**只在这一块内滚动** -->
    <div ref="gameAreaRef" class="card game-area" :style="gameAreaStyle">
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
    <!-- 新游戏二次确认：会清空当前连胜（最长连胜保留）。失败态下直接重开、不弹窗（与赌神同） -->
    <ConfirmDialog
      :show="confirming"
      :title="i18n('confirmTitle')"
      :message="i18n('confirmMsg').replace('{n}', streak)"
      :confirm-text="i18n('confirmOk')"
      :show-replay="false"
      @confirm="startNewGame"
      @cancel="confirming = false"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch, onMounted, onUnmounted } from 'vue';
import sampleSize from 'lodash.samplesize';

import TopHeader from '@/components/TopHeader.vue';
import ConfirmDialog from '@/shared/ConfirmDialog.vue';
import { playLose } from '@/shared/audio';
import CountTimer from '@/shared/CountTimer.vue';
import { robot, toggle as toggleRobot } from './robot.js';
import confetti from '@/shared/confetti';
import { clearGameStorage } from '@/shared/storage';

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

// 猜测记录区的动态高度（从卡片顶部到底部输入区上方的可用空间）
const gameAreaRef = ref(null);
const gameAreaMax = ref(0);
const gameAreaStyle = computed(() => (gameAreaMax.value ? { maxHeight: `${gameAreaMax.value}px` } : {}));
const AREA_GAP = 16;   // 记录区底部与输入区之间至少留 16px：即将接触就出滚动条
let inputObserver = null;

// 连胜记录：赢一局 +1、输一局清零；最长连胜只增不减（「新游戏」清当前连胜、保留最长）
const streak = ref(0);
const bestStreak = ref(0);
const confirming = ref(false);

// 存档 key（与机器人开关同一前缀 __guess_number__）
const KEY_PREFIX = '__guess_number__';
const KEY_STATE = '__guess_number__state';
const KEY_STREAK = '__guess_number__streak';
const KEY_BEST = '__guess_number__best';

let firstGuessTimer = null;
const firstGuessDuration = 200;

watch(gameResult, val => {
  if (val !== GAMING) timerRef.value.stop();
  if (val === WIN) confetti();
});

onMounted(() => {
  loadRecords();
  // 恢复存档（有存档就停在原处、不播任何动画；没有才开新局）
  if (!restoreState()) initGame();
  addListener();
  nextTick(() => {
    measureGameArea();
    scrollHistoryToEnd();
    // 输入区的键盘有 0.5s 的滑入过渡 / 字体也可能晚一点撑开，前几帧再多量几次
    [60, 200, 480].forEach((d) => setTimeout(measureGameArea, d));
  });
  window.addEventListener('resize', measureGameArea);
  // 输入区高度会变（结算时滑走、字体晚加载），观察它而不是只依赖一次测量
  if (typeof ResizeObserver !== 'undefined') {
    inputObserver = new ResizeObserver(() => measureGameArea());
    const inputEl = document.querySelector('.input-area');
    if (inputEl) inputObserver.observe(inputEl);
  }
});

onUnmounted(() => {
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('resize', measureGameArea);
  if (inputObserver) inputObserver.disconnect();
});

// 每添一行记录 / 结算层出现（输入区滑走）都重新量一次，并滚到最新一行
watch(() => guessHistory.value.length, () => nextTick(() => {
  scrollHistoryToEnd();
  measureGameArea();
}));
watch(gameResult, () => nextTick(measureGameArea));

// 记录区高度 = 视口底 − 卡片顶部 − 输入区高度 − 间距；量不到就给个兜底值
function measureGameArea() {
  const el = gameAreaRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const inputEl = document.querySelector('.input-area:not(.hide)');
  const inputH = inputEl ? inputEl.getBoundingClientRect().height : 0;
  const avail = Math.floor(window.innerHeight - rect.top - inputH - AREA_GAP);
  // 先记下「改高度之前是不是贴着底」：容器变矮时 scrollTop 不会自己跟着变，
  // 改完再判断会误以为玩家往上翻过（小屏实测过这一点）
  const wasAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  gameAreaMax.value = Math.max(96, avail);
  nextTick(() => scrollHistoryToEnd(wasAtBottom));
}

// 滚到最新一行（记录多了以后新结果要在视野里）
// force=true：新添了一行/刚进页面，必须贴底；否则只在「本来就在底部附近」时才贴底
function scrollHistoryToEnd(force = true) {
  const el = gameAreaRef.value;
  if (!el) return;
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  if (force || nearBottom) el.scrollTop = el.scrollHeight;
}

// 操作区「新游戏」：非失败态要二次确认（会清空当前连胜），失败态直接重开
function onNewGame() {
  initRef.value?.blur();
  if (gameResult.value === LOSE) {
    startNewGame();
    return;
  }
  confirming.value = true;
}

// 确定重来：清空当前连胜（最长连胜保留）→ 开新局
function startNewGame() {
  confirming.value = false;
  streak.value = 0;
  saveRecords();
  initGame();
}

// 内部：开一局新的（不清连胜，供首次进入 / 失败后重开用）
function initGame(opts = {}) {
  if (firstGuessTimer) {
    clearTimeout(firstGuessTimer);
    firstGuessTimer = null;
  }
  anwser.value = opts.answer || sampleSize(NUMBERS, GAME_SIZE).join('');
  guessHistory.value = opts.history ? opts.history.slice() : [];
  currentGuess.value = '';
  gameResult.value = opts.result ?? GAMING;
  if (opts.time != null) timerRef.value.restore(opts.time); else timerRef.value.reset();
  if (gameResult.value !== GAMING) timerRef.value.stop();
  initRef.value?.blur();
  // 恢复存档时不要自动帮玩家落子（那是「新一局」的行为）
  const autoGuess = opts.robot === true || (opts.robot === undefined && robot.value && !opts.history);
  if (autoGuess && gameResult.value === GAMING) initWithFirstGuess(1);
  saveState();
}

// ---------- 存档 ----------
function loadRecords() {
  streak.value = Math.max(0, +(localStorage.getItem(KEY_STREAK) || 0));
  bestStreak.value = Math.max(0, +(localStorage.getItem(KEY_BEST) || 0));
}
function saveRecords() {
  try {
    localStorage.setItem(KEY_STREAK, String(streak.value));
    localStorage.setItem(KEY_BEST, String(bestStreak.value));
  } catch { /* 隐私模式忽略 */ }
}
function saveState() {
  try {
    localStorage.setItem(KEY_STATE, JSON.stringify({
      answer: anwser.value,
      history: guessHistory.value,
      result: gameResult.value,
      time: timerRef.value?.seconds() || 0,
      streak: streak.value,
    }));
  } catch { /* 隐私模式忽略 */ }
}
// 恢复存档：返回 true 表示成功恢复（界面直接是「停在那里」的样子，不播动画）
function restoreState() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY_STATE) || 'null'); } catch { saved = null; }
  if (!saved || !/^[1-8]{4}$/.test(saved.answer || '')) return false;
  if (!Array.isArray(saved.history) || !saved.history.length) return false;   // 空盘口不算存档
  streak.value = Number.isFinite(saved.streak) ? saved.streak : streak.value;
  initGame({
    answer: saved.answer,
    history: saved.history,
    result: saved.result === LOSE ? LOSE : saved.result === WIN ? WIN : GAMING,
    time: +saved.time || 0,
    robot: false,
  });
  return true;
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
    // 连胜 +1；最长连胜同步（只增不减）
    streak.value += 1;
    bestStreak.value = Math.max(bestStreak.value, streak.value);
    saveRecords();
    saveState();
    return;
  }
  if (guessHistory.value.length >= MAX_GUESS) {
    gameResult.value = LOSE;
    playLose();
    streak.value = 0;          // 输一局：当前连胜清零（最长连胜保留）
    saveRecords();
  }
  currentGuess.value = '';
  saveState();
}

// 计时每秒回调：把当前用时写进存档（刷新后时间接着走）
function onTimerTick() {
  saveState();
}

// 连点标题 5 次：清掉本游戏的所有记录（局面 / 当前连胜 / 最长连胜 / 机器人偏好）后开新局
function onScoreReset() {
  clearGameStorage(KEY_PREFIX);
  streak.value = 0;
  bestStreak.value = 0;
  anwser.value = '';
  guessHistory.value = [];
  initGame();
}
</script>

<style scoped lang="scss">
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
    max-width: var(--card-max-width);
    margin-left: auto;
    margin-right: auto;
    background: var(--card-bg);
    border-radius: var(--card-radius);
    box-shadow: var(--card-shadow);
  }
  .game-icon {
    cursor: pointer;
    min-width: 125px;
    padding: 8px 16px;   // 与其余游戏的 .game-icon 统一（原先写死 height: 40px + padding: 0 16px）
    color: #fff;
    font-size: 14px;
    font-weight: bold;
    text-align: center;
    background: var(--primary-bg);
    border: 0 none;
    border-radius: var(--radius-tile);
    // 按压反馈统一由 App.vue 的全局 :active 规则提供
  }
  // 统计条：最长连胜 / 当前连胜（约定第 4 节：记录在前、当前在后；高 var(--row-height)）
  .score-area {
    display: flex;
    align-items: center;
    margin-top: 64px;
    margin-bottom: var(--row-gap);
    height: var(--row-height);
    .stat {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      min-width: 0;
    }
    .stat-label {
      font-size: 12px;
      color: var(--muted-color);
      opacity: 0.75;
      white-space: nowrap;
    }
    .stat-value {
      font-size: 22px;
      font-weight: bold;
      line-height: 1.1;
      font-variant-numeric: tabular-nums;
    }
  }
  // 竖分隔线：统计条与操作区共用（必须定义在 .wrapper 层级）
  .divider {
    width: 1px;
    height: 24px;
    align-self: center;
    flex: 0 0 auto;
    background: var(--border-color);
    opacity: 0.6;
  }
  .opt-area {
    display: flex;
    align-items: stretch;
    margin-top: 0;
    margin-bottom: var(--row-gap);
    height: var(--row-height);
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
    /* 高度由 JS 写 max-height（见 measureGameArea）：底部输入区是 fixed 的，这里不再靠
       margin-bottom 给输入区留位，而是「量出来」——超出就在本区域内部滚动 */
    overflow-y: auto;
    overscroll-behavior: contain;      /* 滚到边界也不带动整页 */
    -webkit-overflow-scrolling: touch;
    /* 显式画一条细滚动条：macOS 的 overlay 滚动条平时看不见，不画的话玩家不知道这里能滚 */
    scrollbar-width: thin;
    scrollbar-color: var(--muted-color) transparent;
    &::-webkit-scrollbar {
      width: 6px;
    }
    &::-webkit-scrollbar-track {
      background: transparent;
    }
    &::-webkit-scrollbar-thumb {
      background: color-mix(in srgb, var(--muted-color) 55%, transparent);
      border-radius: 3px;
    }
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
        border-radius: var(--radius-tile);
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
      border-radius: var(--card-radius);
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
    // 和顶部标题栏用同一套宽度口径（width 100% + max-width: var(--max-width)，再居中）：
    // 原来宽屏写死 600px，比标题栏（480）和上面的卡片（440）都宽出一截（用户报过）。
    width: 100%;
    max-width: var(--max-width);
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
    border-radius: var(--card-radius) var(--card-radius) 0 0;
    box-shadow: var(--shadow-sheet);
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
      border-radius: var(--radius-tile);
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
</style>
