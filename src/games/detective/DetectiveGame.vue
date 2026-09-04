<template>
  <div class="wrapper">
    <TopHeader @onScoreReset="onScoreReset" />
    <div class="card score-area">
      <div class="stat">
        <span class="stat-label">{{ i18n('bestScore') }}</span>
        <span class="stat-value">{{ bestLevel || '--' }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('livesLabel') }}</span>
        <span class="stat-value">{{ hearts }}</span>
      </div>
    </div>
    <div class="card opt-area">
      <div class="difficulty-wrapper">
        <span class="difficulty-value">{{ rows }}×{{ cols }}</span>
      </div>
      <div class="divider"></div>
      <div class="opt-half">
        <CountTimer ref="timerRef" :enable="timerRunning" />
      </div>
      <div class="divider"></div>
      <div class="start-wrapper">
        <button @click="initGame" class="game-icon">{{ i18n('start') }}</button>
      </div>
    </div>
    <div class="game-area">
      <div class="board-frame" :style="boardStyle">
        <div class="board">
          <div v-for="(cell, idx) in board" :key="idx" class="cell">
            <div class="card-flip" :class="{ flipped: isFaceDown(idx), shaking: shakeIdx === idx, revealed: phase === WON && idx === swappedIdx }" @click="onCellClick(idx)">
              <div class="face back-face"><i i-mdi-incognito /></div>
              <div class="face front-face">{{ cell }}</div>
            </div>
          </div>
        </div>
      </div>
      <div v-if="phase === MEMORY" class="phase-tip floating">{{ i18n('phaseMemory') }}</div>
      <div v-else-if="phase === FLIP" class="phase-tip floating">{{ i18n('phaseFlip') }}</div>
      <div v-else-if="phase === ANSWER" class="phase-tip floating">{{ i18n('phaseAnswer') }}</div>
      <div v-if="phase === WON" class="result win">
        <span>🎉🎉 {{ i18n('tipWin') }} 🎉🎉</span>
        <div class="result-actions">
          <button class="game-icon" @click="retryLevel">{{ i18n('retry') }}</button>
          <button class="game-icon primary" @click="nextLevel">{{ i18n('nextLevel') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';

import TopHeader from '@/components/TopHeader.vue';
import CountTimer from '@/games/link/CountTimer.vue';
import confetti from './confetti';
import { i18n } from '@/shared/i18n';
import { EMOJIS } from '@/shared/emojis';

// 2×2 / 2×3 / 3×3 / 3×4 / 4×4 / 4×5 / 5×5 共 7 关；观察时长随棋盘增大递增
const SIZES = [[2, 2], [2, 3], [3, 3], [3, 4], [4, 4], [4, 5], [5, 5]];
const MEMORIES = [2000, 2500, 3000, 3500, 4000, 4500, 5000];
const FLIP_MS = 1000;
const [MEMORY, FLIP, ANSWER, WON] = ['memory', 'flip', 'answer', 'won'];
const KEY_PREFIX = '__emoji_detective__';
const LEVEL_KEY = `${KEY_PREFIX}level`;
const BEST_KEY = `${KEY_PREFIX}best`;

const level = ref(0);
const phase = ref(MEMORY);
const board = ref([]);
const swappedIdx = ref(-1);
const shakeIdx = ref(-1);
const memoryLeft = ref(0);
const hearts = ref(3);
const bestLevel = ref(+(localStorage.getItem(BEST_KEY) || 0));
const timerRef = ref(null);

const size = computed(() => SIZES[level.value]);
const rows = computed(() => size.value[0]);
const cols = computed(() => size.value[1]);

// 格子边长：96px 封顶，窄屏按视口可用宽均分。
// CSS 自定义属性里的 % 是惰性求值、无法可靠用于 grid 列宽，故由 JS 计算
const CELL_MAX = 96;
const GAP = 6;
const boardStyle = computed(() => {
  const avail = Math.min(window.innerWidth || 420, 440) - 32; // game-area 宽
  const cell = Math.min(CELL_MAX, Math.floor((avail - 2 * GAP - (cols.value - 1) * GAP) / cols.value));
  return {
    '--cols': cols.value,
    '--rows': rows.value,
    '--gap': `${GAP}px`,
    '--cell': `${cell}px`,
  };
});
// 全程计时（观察/翻面/作答都在走），仅结算后暂停
const timerRunning = computed(() => phase.value !== WON);

let memoryTimer = null;
let memoryTicker = null;
let flipTimer = null;

onMounted(() => {
  const saved = restore();
  if (!saved) initGame();
});

onUnmounted(clearTimers);

function clearTimers() {
  clearTimeout(memoryTimer);
  clearInterval(memoryTicker);
  clearTimeout(flipTimer);
}

// ---------- 关卡流程 ----------

function pickEmojis(n) {
  const pool = [...EMOJIS];
  const out = [];
  for (let i = 0; i < n; i++) {
    const j = ~~(Math.random() * pool.length);
    out.push(pool.splice(j, 1)[0]);
  }
  return out;
}

// 某格当前是否背面朝上：仅翻面阶段全部背面，其余阶段全部正面
function isFaceDown(idx) {
  return phase.value === FLIP;
}

// 开始某一关：随机盘面 + 观察倒计时 → 全部翻面 → 偷换 → 翻回 → 作答
function startLevel() {
  clearTimers();
  swappedIdx.value = -1;
  hearts.value = 3;
  const n = rows.value * cols.value;
  board.value = pickEmojis(n);
  phase.value = MEMORY;
  const ms = MEMORIES[level.value];
  memoryLeft.value = Math.ceil(ms / 1000);
  memoryTicker = setInterval(() => {
    memoryLeft.value = Math.max(0, memoryLeft.value - 1);
  }, 1000);
  memoryTimer = setTimeout(() => {
    clearInterval(memoryTicker);
    flipPhase();
  }, ms);
  timerRef.value?.reset();
  save();
}

// 全部翻面；翻面动画进行中偷换一个 emoji，停 1s 后翻回（被换的牌保持背面）
function flipPhase() {
  phase.value = FLIP;
  const swapAt = 250; // 翻面动画（0.45s）过半时偷换，玩家看不清替换瞬间
  setTimeout(() => {
    if (phase.value !== FLIP) return;
    const idx = ~~(Math.random() * board.value.length);
    let replacement = null;
    for (let t = 0; t < 50; t++) {
      const cand = EMOJIS[~~(Math.random() * EMOJIS.length)];
      if (!board.value.includes(cand)) { replacement = cand; break; }
    }
    if (replacement == null) { startLevel(); return; } // 极端兜底
    swappedIdx.value = idx;
    board.value[idx] = replacement;
  }, swapAt);
  flipTimer = setTimeout(() => {
    if (phase.value !== FLIP) return;
    phase.value = ANSWER;
    save();
  }, FLIP_MS);
}

// 点击盘面卡片作答：翻回后全部正面朝上（含被换的），
// 玩家凭记忆点出被换的那张；点其它牌 → 短暂抖动
function onCellClick(idx) {
  if (phase.value !== ANSWER) return;
  if (idx === swappedIdx.value) {
    phase.value = WON;
    if (level.value + 1 > bestLevel.value) {
      bestLevel.value = level.value + 1;
      localStorage.setItem(BEST_KEY, bestLevel.value);
    }
    confetti();
    save();
  } else {
    shakeIdx.value = idx;
    hearts.value = Math.max(0, hearts.value - 1);
    setTimeout(() => {
      if (shakeIdx.value === idx) shakeIdx.value = -1;
    }, 600);
    save();
  }
}

function nextLevel() {
  if (level.value < SIZES.length - 1) level.value++;
  startLevel();
}

function retryLevel() {
  startLevel();
}

function initGame() {
  level.value = 0;
  startLevel();
}

// ---------- 存档 ----------

function save() {
  localStorage.setItem(LEVEL_KEY, JSON.stringify({
    level: level.value,
    hearts: hearts.value,
    phase: phase.value,
  }));
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(LEVEL_KEY));
    if (!saved || typeof saved.level !== 'number') return false;
    level.value = Math.min(SIZES.length - 1, Math.max(0, saved.level));
    hearts.value = 3;
    // 不恢复记忆中途：直接重开当前关（棋盘随机，公平）
    startLevel();
    return true;
  } catch {
    return false;
  }
}

function onScoreReset() {
  localStorage.removeItem(BEST_KEY);
  bestLevel.value = 0;
}
</script>

<style scoped lang="scss">
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
      .difficulty-value {
        min-width: 48px;
        text-align: center;
        font-size: 18px;
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
  // 棋盘外框：宽度收缩到内容并居中，背景即棋盘底色；
  // --cell（格子边长）由 JS 按视口宽度计算，96px 封顶
  .board-frame {
    width: fit-content;
    margin: 0 auto;
    padding: var(--gap);
    background: var(--board-bg);
    border-radius: var(--card-radius);
  }
  .board {
    display: grid;
    grid-template-columns: repeat(var(--cols), var(--cell));
    grid-auto-rows: var(--cell);
    gap: var(--gap);
    font-size: calc(46px - var(--cols) * 5px);
    .face { font-size: inherit; }
  }
  .cell {
    perspective: 500px;
  }
  .card-flip {
    position: relative;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
    transition: transform 0.45s ease-in-out;
    cursor: pointer;
    &.flipped {
      transform: rotateY(180deg);
    }
    &.shaking {
      animation: shake 0.4s ease;
    }
    // 答对后被换的牌高亮标识
    &.revealed {
      .front-face {
        background: var(--enter-bg);
        box-shadow: 0 0 0 2px var(--primary-bg);
      }
    }
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
  // 正面（emoji）默认朝向玩家；背面图案转到 180°，
  // 卡片 .flipped 时整体旋转 180° 露出背面
  .back-face {
    background: var(--primary-bg);
    color: #fff;
    font-size: 20px;
    transform: rotateY(180deg);
  }
  .front-face {
    background: var(--card-bg-color);
  }
  // 阶段提示浮在棋盘上方
  .phase-tip {
    position: absolute;
    top: -14px;
    left: 50%;
    transform: translateX(-50%);
    padding: 2px 14px;
    border-radius: 10px;
    background: var(--card-bg-color);
    color: var(--text-color);
    border: 1px solid var(--border-color);
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
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
    color: var(--win-color);
    font-weight: bold;
    font-size: 18px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    .result-actions {
      display: flex;
      gap: 12px;
    }
  }
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-4px); }
    75% { transform: translateX(4px); }
  }
}
</style>
