<template>
  <div class="wrapper">
    <TopHeader @onScoreReset="onScoreReset" />
    <div class="card score-area">
      <div class="stat">
        <span class="stat-label">{{ i18n('bestScore') }}</span>
        <span class="stat-value">{{ bestScore || '--' }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('movesLabel') }}</span>
        <span class="stat-value">{{ moves }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('score') }}</span>
        <span class="stat-value">{{ score }}</span>
      </div>
    </div>
    <div class="card opt-area">
      <div class="difficulty-wrapper">
        <button @click="changeDifficulty(-1)" class="opt-icon" :class="{ disable: difficulty === MIN_DIFFICULTY }">
          <i i-carbon-subtract-alt />
        </button>
        <span class="difficulty-value">{{ boardSize }}×{{ boardSize }}</span>
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
      <div class="board-frame" :style="boardStyle">
        <div class="board" @touchstart.passive="onTouchStart" @touchmove.passive="onTouchMove" @touchend.passive="onTouchEnd">
          <div v-for="(cell, idx) in cells" :key="`bg-${idx}`" class="cell" @click="onCellClick(idx)"></div>
          <div
            v-for="gem in gems"
            :key="gem.id"
            class="gem"
            :class="gemClasses(gem)"
            :style="gemStyle(gem.idx, gem.dealIdx)"
            @click="onCellClick(gem.idx)"
          >{{ EMOJIS[gem.value] }}</div>
        </div>
      </div>
      <div v-if="cascade > 1" class="cascade-tip">×{{ cascade }} {{ i18n('cascade') }}</div>
      <div v-if="phase === OVER" class="result lose">
        <div>
          <div>👻👻 {{ i18n('gameover') }} 👻👻</div>
          <div v-if="newBest" class="new-best">🎉 {{ i18n('tipWin') }} 🎉</div>
          <div class="final-score">{{ score }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';

import TopHeader from '@/components/TopHeader.vue';
import CountTimer from '@/shared/CountTimer.vue';
import { i18n } from '@/shared/i18n';
import { EMOJIS } from '@/shared/emojis';
import { generateBoard, findMatches, hasMatchAfterSwap, adjacent, hasAnyMove, applyGravity, scoreForMatches, reshuffle } from './board';

// 三档：7×7/5 种、8×8/6 种、9×9/7 种；步数制
const LEVELS = [
  { n: 7, kinds: 5, moves: 25 },
  { n: 8, kinds: 6, moves: 30 },
  { n: 9, kinds: 7, moves: 35 },
];
const [PLAY, OVER] = ['play', 'over'];
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 3;
const KEY_PREFIX = '__emoji_crush__';
const DIFFICULTY_KEY = `${KEY_PREFIX}difficulty`;
const STATE_KEY = `${KEY_PREFIX}state`;
const BEST_KEY = `${KEY_PREFIX}best`;
// 各难度最高分：前缀 + 难度数字
const BEST_KEY_PREFIX = `${KEY_PREFIX}best_`;

const difficulty = ref(Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, +(localStorage.getItem(DIFFICULTY_KEY) || 1))));
// 逻辑层：cells[idx] = emoji 种类或 null；渲染层：gems（稳定 id 的牌，位置过渡即交换/掉落动画）
const cells = ref([]);
const gems = ref([]);
let gemId = 0;
// cells → gems 同步：下落只沿列发生——复用仅限「同列更上方」的同值 gem，
// 无关列的 gem 保持原位（避免被拉来补位产生横跨盘面的滑动）。
// 找不到同列来源的格生成新 gem（标记 fresh 从上空降入）
function syncGems(prevGems, fresh = false) {
  const n = boardSize.value;
  const available = new Map(); // 列 → [gem]，按行降序（下方的先用）
  (prevGems || []).forEach(g => {
    const col = g.idx % n;
    if (!available.has(col)) available.set(col, []);
    available.get(col).push(g);
  });
  for (const list of available.values()) list.sort((a, b) => b.idx - a.idx);
  const out = [];
  for (let i = 0; i < cells.value.length; i++) {
    const v = cells.value[i];
    if (v === null || v === undefined) continue;
    const col = i % n;
    const list = available.get(col) || [];
    // 该格上方（含本格）的同值 gem 才能落到这里；本格原 gem 优先
    const at = list.findIndex(g => g.idx === i && g.value === v);
    let pick;
    if (at >= 0) {
      pick = list[at];
      list.splice(at, 1);
    } else {
      // 从该列上方找同值（列表按行降序，findIndex 命中最近的上方来源）
      const upper = list.findIndex(g => g.idx < i && g.value === v);
      if (upper >= 0) {
        pick = list[upper];
        list.splice(upper, 1);
      }
    }
    if (pick) {
      // fall：位置发生变化（下落）——落地时配弹跳动画，
      // 避免「同值补位」时 1 格位移过小而看起来没有动画
      out.push({ ...pick, idx: i, fresh: false, fall: pick.idx !== i ? i : undefined });
    } else {
      out.push({ id: ++gemId, value: v, idx: i, fresh });
    }
  }
  gems.value = out;
}
const phase = ref(PLAY);
const score = ref(0);
const moves = ref(0);
const newBest = ref(false);
const bestScore = ref(+(localStorage.getItem(BEST_KEY_PREFIX + difficulty.value) || 0));
const selected = ref(-1);
const swapPair = ref([]);
const matchedSet = ref(new Set());
const cascade = ref(0);
const timerRef = ref(null);

const conf = computed(() => LEVELS[difficulty.value - 1]);
const boardSize = computed(() => conf.value.n);
const kinds = computed(() => conf.value.kinds);
const timerRunning = computed(() => phase.value === PLAY);

// 格子尺寸：96px 封顶按视口收缩（与其它游戏一致）
const boardStyle = computed(() => {
  const n = boardSize.value;
  const avail = Math.min(window.innerWidth || 420, 440) - 32;
  const cell = Math.min(96, Math.floor((avail - 16 - (n - 1) * 4) / n));
  return {
    '--n': n,
    '--cell': `${cell}px`,
    '--font': `${Math.floor(cell * 0.55)}px`,
  };
});

let busy = false;
let dealing = false;
let dealTimer = null;
let cascadeTimer = null;
let resetTimer = null;
// 滑动操作状态
let touchFrom = -1;
let touchHandled = false;

onMounted(() => {
  if (!restore()) initGame();
});

onUnmounted(() => {
  clearTimeout(cascadeTimer);
  clearTimeout(resetTimer);
  clearTimeout(dealTimer);
});

// ---------- 布局 ----------

function gemClasses(gem) {
  const out = [`k-${gem.value}`];
  if (selected.value === gem.idx) out.push('selected');
  if (swapPair.value.includes(gem.idx)) out.push('swapping');
  if (matchedSet.value.has(gem.idx)) out.push('matched');
  if (gem.fresh) out.push('fresh');
  if (gem.fall != null) out.push('falling');
  if (gem.dealIdx != null) out.push('dealt');
  return out;
}

function gemStyle(idx, dealIdx) {
  const n = boardSize.value;
  const r = ~~(idx / n);
  const c = idx % n;
  const pos = k => `calc(${k} * (var(--cell) + 4px))`;
  return {
    left: pos(c),
    top: pos(r),
    ...(dealIdx !== undefined ? { animationDelay: `${dealIdx * 18}ms` } : null),
  };
}

// ---------- 游戏流程 ----------

function initGame() {
  clearTimeout(cascadeTimer);
  clearTimeout(resetTimer);
  busy = false;
  selected.value = -1;
  swapPair.value = [];
  matchedSet.value = new Set();
  cascade.value = 0;
  newBest.value = false;
  let b;
  do {
    b = generateBoard(boardSize.value, kinds.value);
  } while (!hasAnyMove(b, boardSize.value, kinds.value));
  cells.value = b;
  gemId = 0;
  // 清空后逐个入场：先渲染空盘，再依次放入（配 deal 延迟动画）
  gems.value = [];
  score.value = 0;
  moves.value = conf.value.moves;
  phase.value = PLAY;
  bestScore.value = +(localStorage.getItem(bestKey()) || 0);
  timerRef.value?.reset();
  // 从第一格开始逐个入场（每格 18ms 间隔的缩放弹入动画）
  dealBoard();
  save();
}

// 发牌：全部 gem 一次性渲染，靠 CSS animationDelay 从第一格逐个弹入
function dealBoard() {
  const all = [];
  for (let i = 0; i < cells.value.length; i++) {
    const v = cells.value[i];
    if (v === null || v === undefined) continue;
    all.push({ id: ++gemId, value: v, idx: i });
  }
  gems.value = all;
  playDeal();
}

// 逐格入场动画：按落格顺序（先上后下、从左到右）给每张 gem 排一个延迟。
// 新开局与「进入游戏恢复存档」都走这里，保证两种情况都是挨个渲染出来的
function playDeal() {
  if (!gems.value.length) return;
  clearTimeout(dealTimer);
  dealing = true;
  const rank = new Map();
  [...gems.value].sort((a, b) => a.idx - b.idx).forEach((g, i) => rank.set(g.id, i));
  gems.value = gems.value.map(g => ({ ...g, dealIdx: rank.get(g.id) }));
  dealTimer = setTimeout(() => {
    dealing = false;
    // 清掉 dealIdx，后续交互不再触发 deal 动画
    gems.value = gems.value.map(({ dealIdx, ...g }) => g);
  }, gems.value.length * 18 + 400);
}

function bestKey() {
  return BEST_KEY_PREFIX + difficulty.value;
}

function changeDifficulty(dir) {
  const next = difficulty.value + dir;
  if (next < MIN_DIFFICULTY || next > MAX_DIFFICULTY) return;
  difficulty.value = next;
  localStorage.setItem(DIFFICULTY_KEY, next);
  initGame();
}

// ---------- 交互 ----------

function onCellClick(idx) {
  if (phase.value !== PLAY || busy || dealing) return;
  // 滑动操作已处理则忽略紧随的 click（touch 后合成 click）
  if (touchHandled) { touchHandled = false; return; }
  if (selected.value < 0) {
    selected.value = idx;
    return;
  }
  if (selected.value === idx) {
    selected.value = -1;
    return;
  }
  if (adjacent(selected.value, idx, boardSize.value)) {
    trySwap(selected.value, idx);
  } else {
    selected.value = idx;
  }
}

function onTouchStart(e) {
  const touch = e.touches[0];
  const cell = touchTargetCell(touch);
  touchFrom = cell;
}

function onTouchMove(e) {
  if (touchFrom < 0 || phase.value !== PLAY || busy) return;
  const cell = touchTargetCell(e.touches[0]);
  if (cell >= 0 && cell !== touchFrom && adjacent(touchFrom, cell, boardSize.value)) {
    touchHandled = true;
    trySwap(touchFrom, cell);
    touchFrom = -1;
  }
}

function onTouchEnd() {
  touchFrom = -1;
}

function touchTargetCell(touch) {
  const board = document.querySelector('.board');
  if (!board) return -1;
  const rect = board.getBoundingClientRect();
  const x = touch.clientX - rect.left;
  const y = touch.clientY - rect.top;
  const n = boardSize.value;
  const step = rect.width / n;
  const c = ~~(x / step);
  const r = ~~(y / step);
  if (r < 0 || r >= n || c < 0 || c >= n) return -1;
  return r * n + c;
}

// ---------- 交换与结算链 ----------

function trySwap(a, b) {
  if (!hasMatchAfterSwap(cells.value, boardSize.value, a, b)) {
    // 无效交换：两 gem 换位再换回（走完整过渡），不消耗步数
    selected.value = -1;
    const ga = gems.value.find(g => g.idx === a);
    const gb = gems.value.find(g => g.idx === b);
    if (ga && gb) {
      gems.value = gems.value.map(g =>
        g.id === ga.id ? { ...g, idx: b } : g.id === gb.id ? { ...g, idx: a } : g
      );
      resetTimer = setTimeout(() => {
        gems.value = gems.value.map(g =>
          g.id === ga.id ? { ...g, idx: a } : g.id === gb.id ? { ...g, idx: b } : g
        );
      }, 220);
    }
    swapPair.value = [a, b];
    resetTimer = setTimeout(() => {
      swapPair.value = [];
    }, 460);
    return;
  }
  selected.value = -1;
  busy = true;
  // 交换：gems 保身份换位置（left/top 过渡 = 丝滑交换动画），cells 同步换值
  const ga = gems.value.find(g => g.idx === a);
  const gb = gems.value.find(g => g.idx === b);
  if (ga && gb) {
    gems.value = gems.value.map(g =>
      g.id === ga.id ? { ...g, idx: b } : g.id === gb.id ? { ...g, idx: a } : g
    );
  }
  const next = [...cells.value];
  [next[a], next[b]] = [next[b], next[a]];
  cells.value = next;
  cascadeTimer = setTimeout(() => {
    moves.value--;
    resolveCascades(1);
  }, 240);
}

// 级联结算：消除 → 重力下落 → 再检测，直到无命中
function resolveCascades(level) {
  const matched = findMatches(cells.value, boardSize.value);
  if (!matched.size) {
    cascade.value = 0;
    // 连锁结束：清掉 fresh/fall 瞬态标记，避免 class 残留
    gems.value = gems.value.map(g => ({ ...g, fresh: false, fall: undefined }));
    finishTurn();
    return;
  }
  cascade.value = level;
  const gained = scoreForMatches(matched.size, level);
  score.value += gained;
  // 消除动画
  matchedSet.value = matched;
  cascadeTimer = setTimeout(() => {
    // 清除命中格
    const cleared = cells.value.map((v, i) => matched.has(i) ? null : v);
    // 重力下落 + 补新（一次完成，动画分两批：下落的 fall、新牌从顶 spawn）
    const { board: after, drops } = applyGravity(cleared, boardSize.value, kinds.value);
    // 本轮在盘面内的下落格（原索引在 drops 中能对上的）标记 falling；
    // applyGravity 的 drops 只记录 spawn，下落映射需要在清除前计算——简化：
    // 所有未消除且位置变化的格都重新渲染（绝对定位按新 cells 计算，配 transition 天然下落动画）
    matchedSet.value = new Set();
    cells.value = after;
    // 保身份同步：只传幸存 gem（被消除的若留在池中会被同值格复用「原地复活」，跳过下落动画），
    // 幸存 gem 位置过渡即掉落动画，新牌 fresh 从上空降入
    const survivors = gems.value.filter(g => !matched.has(g.idx));
    syncGems(survivors, true);
    cascadeTimer = setTimeout(() => {
      resolveCascades(level + 1);
    }, 300);
  }, 350);
}

function finishTurn() {
  busy = false;
  if (phase.value !== PLAY) return;
  if (moves.value <= 0) {
    phase.value = OVER;
    timerRef.value?.stop();
    if (score.value > bestScore.value) {
      bestScore.value = score.value;
      localStorage.setItem(bestKey(), score.value);
      newBest.value = true;
    }
    save();
    return;
  }
  // 无解自动重洗
  if (!hasAnyMove(cells.value, boardSize.value, kinds.value)) {
    cells.value = reshuffle(cells.value, boardSize.value, kinds.value);
    syncGems(gems.value);
    selected.value = -1;
  }
  save();
}

// ---------- 存档 ----------

function save() {
  localStorage.setItem(STATE_KEY, JSON.stringify({
    cells: cells.value,
    difficulty: difficulty.value,
    score: score.value,
    moves: moves.value,
    time: timerRef.value?.seconds() || 0,
    phase: phase.value,
  }));
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY));
    if (!saved || !Array.isArray(saved.cells) || !saved.cells.length) return false;
    if (saved.phase === OVER) return false;
    const d = Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, +(saved.difficulty || 1)));
    const n = LEVELS[d - 1].n;
    if (saved.cells.length !== n * n) return false;
    difficulty.value = d;
    cells.value = saved.cells;
    syncGems([]);
    playDeal();   // 恢复的盘面同样逐个入场
    score.value = +saved.score || 0;
    moves.value = Math.min(LEVELS[d - 1].moves, Math.max(0, +saved.moves ?? LEVELS[d - 1].moves));
    phase.value = PLAY;
    bestScore.value = +(localStorage.getItem(bestKey()) || 0);
    timerRef.value?.restore(saved.time || 0);
    return true;
  } catch {
    return false;
  }
}

function onTimerTick() {
  if (phase.value !== PLAY) return;
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
    saved.time = timerRef.value?.seconds() || 0;
    localStorage.setItem(STATE_KEY, JSON.stringify(saved));
  } catch { /* 存档损坏时静默跳过 */ }
}

function onScoreReset() {
  for (let d = MIN_DIFFICULTY; d <= MAX_DIFFICULTY; d++) {
    localStorage.removeItem(BEST_KEY_PREFIX + d);
  }
  bestScore.value = 0;
}
</script>

<style scoped lang="scss">
@keyframes pop-out {
  0% { transform: scale(1); }
  40% { transform: scale(1.2); }
  100% { transform: scale(0); opacity: 0; }
}

@keyframes drop-in {
  from { transform: translateY(-100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

@keyframes land-bounce {
  0% { transform: translateY(-12%) scaleY(1.06); }
  60% { transform: translateY(0) scaleY(0.92); }
  100% { transform: translateY(0) scaleY(1); }
}

@keyframes deal-in {
  from { transform: scale(0.2); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

@keyframes swap-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-8%); }
  75% { transform: translateX(8%); }
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
        min-width: 48px;
        text-align: center;
        font-size: 17px;
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
  .game-area {
    position: relative;
    width: calc(100% - 32px);
    max-width: 440px;
    box-sizing: border-box;
  }
  .board-frame {
    width: fit-content;
    margin: 0 auto;
    padding: 8px;
    background: var(--board-bg);
    border-radius: var(--card-radius);
    touch-action: none;
  }
  .board {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--n), var(--cell));
    grid-auto-rows: var(--cell);
    gap: 4px;
  }
  .gem {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--cell);
    height: var(--cell);
    border-radius: 10px;
    background: var(--card-bg-color);
    border: 1px solid var(--tile-border-color);
    font-size: var(--font);
    line-height: 1;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    // 位置过渡 = 掉落/交换动画的载体（ease 平滑启停，交换/下落都丝滑）
    transition: left 0.24s ease, top 0.24s ease;
    &.selected {
      border-color: var(--primary-bg);
      box-shadow: 0 0 0 2px var(--primary-bg);
      transform: scale(1.06);
    }
    &.matched {
      animation: pop-out 0.35s ease forwards;
      pointer-events: none;
    }
    &.swapping {
      animation: swap-shake 0.4s ease;
    }
    // 新补充的牌从棋盘上方降入
    &.fresh {
      animation: drop-in 0.3s ease-out;
    }
    // 下落的牌落地时轻微压缩回弹（squash），即使位移只有一格也有明确的动态
    &.falling {
      animation: land-bounce 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    // 开局发牌：从第一格开始逐个缩放弹入（间隔由 animationDelay 控制）
    &.dealt {
      animation: deal-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
    }
  }
  .cascade-tip {
    position: absolute;
    top: -14px;
    right: 8px;
    padding: 2px 12px;
    border-radius: 10px;
    background: var(--primary-bg);
    color: #fff;
    font-size: 14px;
    font-weight: bold;
    z-index: 3;
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
    color: var(--lose-color);
    font-weight: bold;
    font-size: 18px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    text-align: center;
    .new-best {
      color: var(--win-color);
      margin-top: 6px;
    }
    .final-score {
      font-size: 28px;
      margin-top: 4px;
    }
  }
}
</style>
