<template>
  <div class="wrapper">
    <TopHeader @onScoreReset="() => {}" />

    <div class="card score-area">
      <div class="stat">
        <span class="stat-label">{{ i18n('best') }}</span>
        <span class="stat-value">{{ best ? fmtTime(best) : '--:--' }}</span>
      </div>
      <div class="divider" />
      <div class="stat">
        <span class="stat-label">{{ i18n('time') }}</span>
        <span class="stat-value">{{ fmtTime(elapsed) }}</span>
      </div>
    </div>

    <CountTimer ref="timerRef" :enable="phase === PLAY || phase === CHECKING" :on-tick="onTimerTick" :show="false" />

    <div class="card opt-card">
      <div class="opt-item difficulty-wrapper">
        <button class="opt-icon" :class="{ disable: difficulty === MIN_DIFFICULTY }" @click="changeDifficulty(-1)">
          <i i-carbon-subtract-alt />
        </button>
        <span class="difficulty-value">{{ count }}</span>
        <button class="opt-icon" :class="{ disable: difficulty === MAX_DIFFICULTY }" @click="changeDifficulty(1)">
          <i i-carbon-add-alt />
        </button>
      </div>
      <div class="divider" />
      <div class="opt-item">
        <button class="game-icon" @click="restartRound">{{ i18n('start') }}</button>
      </div>
    </div>

    <div class="game-area" :style="{ '--card': metrics.card + 'px', '--card-gap': metrics.gap + 'px' }">
      <!-- 展示区：亮出来 → 翻面 → 聚到中间 → 随机飞回各自位置（洗牌全程只看到牌背） -->
      <div class="area display-area">
        <div class="rows">
          <div v-for="(row, ri) in rows" :key="`d${ri}`" class="card-row">
            <div
              v-for="i in row"
              :key="`dc${i}`"
              class="mirror-card"
              :class="{ 'face-down': hidden[i], gather: gathering, silent: silent }"
              :style="displayStyle(i)"
            >
              <div class="flip">
                <div class="face front">{{ display[i] }}</div>
                <div class="face back"><i i-mdi-mirror-variant /></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 提示区 -->
      <div class="hint-bar" :class="{ busy: phase === CHECKING }">
        <template v-if="phase === CHECKING">
          <i i-mdi-progress-clock class="spin" />{{ i18n('checking') }}
        </template>
        <template v-else>
          <span>{{ i18n('matchHint') }}</span>
          <b class="hint-num">{{ matches }}</b>
          <span class="hint-total">/ {{ count }}</span>
        </template>
      </div>

      <!-- 游戏区：初始也是背面，洗牌完成后才翻开；点两张交换 -->
      <div class="area play-area">
        <div class="rows">
          <div v-for="(row, ri) in rows" :key="`g${ri}`" class="card-row">
            <div
              v-for="i in row"
              :key="`gc${i}`"
              class="mirror-card playable"
              :class="{
                picked: pick === i,
                flying: swap && (swap.a === i || swap.b === i),
                settling: settling,
                silent: silent,
                'face-down': gameHidden[i],
              }"
              :style="swapStyle(i)"
              @click="onCardClick(i)"
            >
              <div class="flip">
                <div class="face front">{{ game[i] }}</div>
                <div class="face back"><i i-mdi-mirror-variant /></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="phase === WON && showResult" class="result win">
        <span class="tip">{{ i18n('tipWin') }}</span>
        <span class="final-time">{{ fmtTime(elapsed) }}</span>
        <span v-if="isNewBest" class="new-best">{{ i18n('newBest') }}</span>
        <button class="game-icon" @click="restartRound">{{ i18n('start') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, nextTick, onMounted, onUnmounted } from 'vue';

import TopHeader from '@/components/TopHeader.vue';
import CountTimer from '@/shared/CountTimer.vue';
import confetti from '@/shared/confetti';
import { i18n } from '@/shared/i18n';
import {
  MIN_DIFFICULTY, MAX_DIFFICULTY, emojiCount, rowsOf, sameCount, newRound, swapAt, fmtTime,
} from './board';

const [DEAL, PLAY, CHECKING, WON] = ['deal', 'play', 'checking', 'won'];
const STATE_KEY = '__emoji_mirror__state';
const BEST_KEY = '__emoji_mirror__best_';
const REVEAL_MS = 1100;    // 展示区正面亮这么久（让玩家看一眼这一局有哪些 emoji）
const FLIP_STAGGER = 90;   // 逐张翻面的间隔
const FLIP_MS = 460;       // 单张翻面时长（与 CSS 的 transition 一致）
const GATHER_MS = 420;     // 聚到中间的时长
const FLY_STEP = 90;       // 飞回各自位置时每张的错开间隔
const SWAP_MS = 300;       // 交换动画时长
const CHECK_MS = 500;      // 「计算中」停留（用户指定 0.5 秒）
const GAP = 10;

const difficulty = ref(MIN_DIFFICULTY);
const display = ref([]);
const game = ref([]);
const hidden = ref([]);         // 展示区某张是否背面朝上
const gameHidden = ref([]);     // 游戏区每张是否背面朝上（只在开局的洗牌阶段为 true）
const gathering = ref(false);   // 展示区是否正聚在中间
const flyDelay = ref([]);       // 飞出时每张的 transition-delay
const matches = ref(0);
const pick = ref(null);
const swap = ref(null);         // { a, b, delta } —— 交换动画期间的两张牌
const settling = ref(false);    // 撤掉交换位移的那一帧禁用过渡
const silent = ref(true);       // 恢复存档后的首帧禁用一切过渡（否则展示区会「翻」一下）
const phase = ref(DEAL);
const elapsed = ref(0);
const best = ref(0);
const isNewBest = ref(false);
const showResult = ref(false);   // 展示区翻完之后才铺遮罩 / 放烟花
const timerRef = ref(null);
const metrics = reactive({ card: 56, gap: GAP });

let timers = [];
let round = 0;                  // 局序号：换难度 / 重开时作废旧动画
const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
const wait = ms => new Promise(res => { timers.push(setTimeout(res, ms)); });

const count = computed(() => emojiCount(difficulty.value));
const rows = computed(() => {
  const out = [];
  let at = 0;
  for (const n of rowsOf(count.value)) { out.push(Array.from({ length: n }, (_, k) => at + k)); at += n; }
  return out;
});

const CARD_MIN = 34;
const CARD_MAX = 72;

function computeMetrics() {
  const vw = Math.min(window.innerWidth, 480) - 32;   // .wrapper 左右内边距
  const maxRow = Math.max(...rowsOf(count.value));
  const byW = Math.floor((vw - 24 - (maxRow - 1) * GAP) / maxRow);
  // 竖向预算：统计卡（64 上边距 + 72）+ 操作卡（上下 12 + 72）+ 提示条 34 + 游戏区内边距与缝隙
  const rowsTotal = rowsOf(count.value).length * 2;
  const reserved = 64 + 72 + 24 + 72 + 34 + 24 + 30;
  const byH = Math.floor((window.innerHeight - reserved - (rowsTotal - 2) * GAP) / rowsTotal);
  metrics.card = Math.max(CARD_MIN, Math.min(CARD_MAX, Math.min(byW, byH)));
}

function bestKey(d = difficulty.value) { return `${BEST_KEY}${d}`; }
function loadBest() {
  best.value = Math.max(0, Math.floor(+(localStorage.getItem(bestKey()) || 0)));
}

function shuffle(arr) {
  const next = arr.slice();
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

// ---------- 开局：亮出来 → 翻面 → 聚到中间 → 随机飞回各自位置 → 游戏区翻开 ----------
async function startRound(lv = difficulty.value) {
  clearTimers();
  round += 1;
  const my = round;
  difficulty.value = Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, lv));
  const { count: n, display: d, game: g } = newRound(difficulty.value);
  display.value = d;
  game.value = g;
  hidden.value = new Array(n).fill(false);
  gameHidden.value = new Array(n).fill(true);   // 游戏区开局是背面（洗牌完成后才翻开）
  gathering.value = false;
  flyDelay.value = new Array(n).fill(0);
  matches.value = 0;
  pick.value = null;
  swap.value = null;
  settling.value = false;
  elapsed.value = 0;
  isNewBest.value = false;
  showResult.value = false;
  phase.value = DEAL;
  loadBest();
  computeMetrics();
  timerRef.value?.reset();
  timerRef.value?.stop();

  await wait(REVEAL_MS);                       // ① 展示区正面亮一会儿
  if (my !== round) return;
  for (let i = 0; i < n; i++) {                // ② 先逐张翻面（玩家看不到后面的洗牌）
    hidden.value = hidden.value.map((v, k) => (k === i ? true : v));
    await wait(FLIP_STAGGER);
    if (my !== round) return;
  }
  await wait(FLIP_MS);
  if (my !== round) return;

  gathering.value = true;                      // ③ 全部叠到展示区中间
  await wait(GATHER_MS);
  if (my !== round) return;
  // ④ 数据打乱（牌背朝上，玩家看不到结果），再让每张按随机顺序飞回自己的格子
  display.value = shuffle(display.value);
  const delays = new Array(n).fill(0);
  shuffle(Array.from({ length: n }, (_, i) => i)).forEach((card, k) => { delays[card] = k * FLY_STEP; });
  flyDelay.value = delays;
  gathering.value = false;
  await wait(GATHER_MS + (n - 1) * FLY_STEP + 80);
  if (my !== round) return;
  flyDelay.value = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {                // ⑤ 洗牌完成后再把游戏区逐张翻开
    gameHidden.value = gameHidden.value.map((v, k) => (k === i ? false : v));
    await wait(FLIP_STAGGER);
    if (my !== round) return;
  }
  await wait(FLIP_MS);
  if (my !== round) return;
  phase.value = PLAY;
  timerRef.value?.start();
  save();
}

// 展示区某张牌的样式：聚集时移到区域中心；飞回时按顺序错开
function displayStyle(i) {
  const style = {};
  if (flyDelay.value[i]) style.transitionDelay = `${flyDelay.value[i]}ms`;
  if (!gathering.value) return style;
  const el = document.querySelectorAll('.display-area .mirror-card')[i];
  const area = document.querySelector('.display-area');
  if (!el || !area) return style;
  const r = el.getBoundingClientRect();
  const a = area.getBoundingClientRect();
  style.transform = `translate(${(a.left + a.width / 2) - (r.left + r.width / 2)}px, `
    + `${(a.top + a.height / 2) - (r.top + r.height / 2)}px) scale(0.82)`;
  style.zIndex = 1;
  return style;
}

// ---------- 交换 ----------
function deltaBetween(a, b) {
  const els = document.querySelectorAll('.play-area .mirror-card');
  const ea = els[a], eb = els[b];
  if (!ea || !eb) return { x: 0, y: 0 };
  const ra = ea.getBoundingClientRect(), rb = eb.getBoundingClientRect();
  return { x: rb.left - ra.left, y: rb.top - ra.top };
}

function swapStyle(i) {
  const s = swap.value;
  if (!s) return null;
  if (i === s.a) return { transform: `translate(${s.delta.x}px, ${s.delta.y}px)` };
  if (i === s.b) return { transform: `translate(${-s.delta.x}px, ${-s.delta.y}px)` };
  return null;
}

function onCardClick(i) {
  if (phase.value !== PLAY || swap.value) return;
  if (pick.value === null) { pick.value = i; return; }
  if (pick.value === i) { pick.value = null; return; }
  const a = pick.value, b = i;
  pick.value = null;
  swap.value = { a, b, delta: deltaBetween(a, b) };
  const my = round;
  timers.push(setTimeout(() => {
    if (my !== round) return;
    // 先换数据，再**在禁用过渡的那一帧**撤掉位移 —— 两者相抵、画面不动。
    // 不这么做的话，撤掉 transform 会再按 0.3s 滑回去一次（用户报的「多跳动了一次」）。
    game.value = swapAt(game.value, a, b);
    settling.value = true;
    swap.value = null;
    void document.body.offsetHeight;              // 强制重排，让「禁用过渡」先生效
    timers.push(setTimeout(() => { settling.value = false; }, 30));
    phase.value = CHECKING;                       // 计算中（用户要求 0.5 秒）
    timers.push(setTimeout(() => {
      if (my !== round) return;
      matches.value = sameCount(game.value, display.value);
      if (matches.value === count.value) finishWin();
      else { phase.value = PLAY; save(); }
    }, CHECK_MS));
  }, SWAP_MS));
}

function finishWin() {
  // 先停表：胜利后遮罩上的时间不能再走（用户报的）
  timerRef.value?.stop();
  phase.value = WON;
  const secs = Math.floor(timerRef.value?.seconds() || elapsed.value);
  elapsed.value = secs;
  const prev = Math.max(0, Math.floor(+(localStorage.getItem(bestKey()) || 0)));
  isNewBest.value = !prev || secs < prev;
  if (isNewBest.value) { try { localStorage.setItem(bestKey(), String(secs)); } catch { /* 隐私模式 */ } }
  loadBest();
  const my = round;
  const n = count.value;
  hidden.value.forEach((_, i) => {                // 展示区逐张翻回正面
    timers.push(setTimeout(() => { if (my === round) hidden.value = hidden.value.map((v, k) => (k === i ? false : v)); }, i * 90));
  });
  gameHidden.value = new Array(n).fill(false);
  // **等展示区全部翻完**再放烟花、铺遮罩（用户要求）
  timers.push(setTimeout(() => {
    if (my !== round) return;
    showResult.value = true;
    confetti();
  }, (n - 1) * 90 + FLIP_MS));
  save();
}

function onTimerTick() {
  if (phase.value === WON || phase.value === DEAL) return;   // 胜利 / 铺牌期间的时间不再变化
  elapsed.value = Math.floor(timerRef.value?.seconds() || 0);
  if (phase.value === PLAY || phase.value === CHECKING) save();
}

// ---------- 难度 / 新游戏 ----------
function changeDifficulty(step) {
  const next = Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, difficulty.value + step));
  if (next === difficulty.value) return;
  startRound(next);
}

function restartRound() { startRound(difficulty.value); }

// ---------- 存档 ----------
function save() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({
      difficulty: difficulty.value,
      display: display.value,
      game: game.value,
      elapsed: elapsed.value,
      phase: phase.value === WON ? WON : PLAY,
    }));
  } catch { /* 隐私模式 */ }
}

// **在 setup 阶段就把存档读进来**（而不是等 onMounted）：这样首帧渲染出来就已经是最终状态，
// 展示区不会先画一遍空盘再「翻」过去 —— 只靠 onMounted 补状态时，首帧可能已经被浏览器画出来了。
function restoreState() {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY));
    if (!s || !Array.isArray(s.display) || !Array.isArray(s.game)) return false;
    const n = emojiCount(s.difficulty);
    if (s.display.length !== n || s.game.length !== n) return false;
    difficulty.value = Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, s.difficulty));
    display.value = s.display;
    game.value = s.game;
    matches.value = sameCount(s.game, s.display);
    // **恢复界面时一律不放任何动画**（用户要求）：直接摆成该有的样子 ——
    // 展示区背面（胜利时正面）、游戏区正面，不铺牌、不洗牌、不翻面。
    hidden.value = new Array(n).fill(s.phase !== WON);
    gameHidden.value = new Array(n).fill(false);
    gathering.value = false;
    flyDelay.value = new Array(n).fill(0);
    pick.value = null;
    swap.value = null;
    settling.value = false;
    isNewBest.value = false;
    showResult.value = s.phase === WON;    // 恢复胜利态直接铺遮罩
    loadBest();
    phase.value = s.phase === WON ? WON : PLAY;
    elapsed.value = Math.max(0, Math.floor(Number(s.elapsed) || 0));
    return true;
  } catch { return false; }
}

// setup 里就恢复；返回值告诉 onMounted 要不要开新局
const restored = restoreState();
// **尺寸也要在这里先算一遍**：computeMetrics 只用到 innerWidth/innerHeight 与档位，
// 不碰 DOM。放到 onMounted 才算是来不及的 —— 首帧会先按默认 56px 渲染，
// 窄屏（320）下 5 列就横向超出视窗，下一帧再缩回来，看起来就是「先撑宽再弹回」。
computeMetrics();

onMounted(async () => {
  computeMetrics();
  window.addEventListener('resize', computeMetrics);
  if (restored) {
    // 状态在 setup 里就摆好了（首帧即最终态），这里只补计时器与尺寸
    if (phase.value === PLAY) timerRef.value?.restore(elapsed.value);   // 计时器接着上次走
    else timerRef.value?.stop();
    await nextTick();
    computeMetrics();
    requestAnimationFrame(() => { silent.value = false; });
    return;
  }
  await nextTick();
  computeMetrics();
  silent.value = false;      // 新开一局：铺牌 / 翻面动画照常
  startRound(MIN_DIFFICULTY);
});

onUnmounted(() => {
  clearTimers();
  window.removeEventListener('resize', computeMetrics);
});
</script>

<style lang="scss" scoped>
.wrapper {
  // 顶部这 64px 必须用 padding：写成 .score-area 的 margin-top 会从 .wrapper 顶部
  // 塌陷到 #app 之外，而 #app 有 min-height: 100dvh —— 结果 html 恒比视口高 64px、
  // 整页能滚 64px（用户报的「垂直方向还是有滚动条」）。padding 把它留在文档流里。
  padding: 64px 16px 0;
  color: var(--text-color);
}

.card {
  box-sizing: border-box;
  background: var(--card-bg-color);
  border-radius: var(--card-radius);
  box-shadow: var(--card-shadow);
}

.score-area {
  display: flex;
  align-items: center;
  height: 72px;
  .stat {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }
  .stat-label {
    font-size: 12px;
    color: var(--muted-color);
  }
  .stat-value {
    font-size: 22px;
    font-weight: 700;
  }
}

.game-icon {
  cursor: pointer;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: bold;
  white-space: nowrap;
  background: var(--primary-bg);
  color: #fff;
  border: 0 none;
  border-radius: var(--radius-tile);
}

.opt-card {
  margin: 12px 0;
  height: 72px;
  display: flex;
  align-items: center;
}
.opt-item {
  flex: 4;
  display: flex;
  align-items: center;
  justify-content: center;
}
.divider {
  width: 1px;
  height: 24px;
  align-self: center;
  background: var(--border-color);
  opacity: 0.6;
}

.difficulty-wrapper {
  gap: 4px;
  .opt-icon {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 0;
    color: var(--text-color);
    cursor: pointer;
    font-size: 18px;
    &.disable {
      opacity: 0.35;
      cursor: not-allowed;
    }
  }
  .difficulty-value {
    min-width: 22px;
    text-align: center;
    font-size: 18px;
    font-weight: 700;
  }
}

.game-area {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: var(--card-radius);
}
.area {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.rows {
  display: flex;
  flex-direction: column;
  gap: var(--card-gap);
  align-items: center;
}
.card-row {
  display: flex;
  gap: var(--card-gap);
  justify-content: center;
}

.mirror-card {
  position: relative;
  width: var(--card);
  height: var(--card);
  perspective: 600px;
  transition: transform 0.3s ease-in-out;
  &.playable {
    cursor: pointer;
  }
  // 撤掉交换位移的那一帧：关掉过渡，避免画面再滑回去一次
  &.settling,
  &.silent {
    transition: none;
    .flip {
      transition: none;
    }
  }
  .flip {
    position: relative;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
    transition: transform 0.46s ease-in-out;
  }
  .face {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-tile);
    border: 1px solid var(--tile-border-color);
    box-shadow: var(--shadow-soft);
    background: var(--card-bg-color);
    backface-visibility: hidden;
    font-size: calc(var(--card) * 0.5);
    line-height: 1;
  }
  .back {
    transform: rotateY(180deg);
    background: var(--primary-bg);
    color: #fff;
    font-size: calc(var(--card) * 0.45);
  }
  &.face-down .flip {
    transform: rotateY(180deg);
  }
  &.picked .front {
    outline: 2px solid var(--primary-bg);
    outline-offset: 1px;
    transform: translateY(-3px);
  }
  &.flying {
    z-index: 2;
  }
  &.gather {
    z-index: 3;
  }
}

.hint-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  background: var(--card-bg-color);
  box-shadow: var(--shadow-soft);
  font-size: 14px;
  color: var(--muted-color);
  .hint-num {
    font-size: 20px;
    color: var(--primary-bg);
  }
  .hint-total {
    font-size: 13px;
  }
  &.busy {
    color: var(--primary-bg);
    .spin {
      animation: spin 1s linear infinite;
    }
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
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
  color: var(--win-color);
  font-size: 18px;
  font-weight: 700;
  .final-time {
    font-size: 28px;
  }
  .new-best {
    font-size: 14px;
    color: var(--primary-bg);
  }
}
</style>
