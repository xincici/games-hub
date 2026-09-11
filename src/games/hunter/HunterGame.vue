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
        <span class="difficulty-value">{{ targetCount }} · {{ gridLabel }}</span>
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
      <div class="stage-frame" :style="stageStyle">
        <div class="stage">
          <div v-for="(cell, idx) in stage" :key="idx" class="stage-cell">
            <div class="card-flip" :class="{ flipped: isStageFaceDown(idx) }">
              <div class="face back-face"><i i-mdi-target /></div>
              <div class="face front-face">{{ cell }}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="candidate-area" :style="candidateStyle">
        <div
          v-for="(opt, idx) in candidates"
          :key="idx"
          class="candidate-tile"
          @click="pick(idx)"
        >
          <div class="cand-flip" :class="{ flipped: isCandFaceDown(opt), found: foundSet.has(opt), wrong: wrongSet.has(opt) }">
            <div class="face cand-back"><i i-mdi-target /></div>
            <div class="face cand-front">{{ opt }}</div>
          </div>
        </div>
        <div v-if="phase === WON || phase === LOST" class="result" :class="phase === WON ? 'win' : 'lose'">
          <span v-if="phase === WON">🎉🎉 {{ i18n('tipWin') }} 🎉🎉</span>
          <span v-else>👻👻 {{ i18n('tipLost') }} 👻👻</span>
          <div class="result-actions">
            <button class="game-icon" @click="retryLevel">{{ i18n('retry') }}</button>
            <button v-if="phase === WON" class="game-icon primary" @click="nextLevel">{{ i18n('nextLevel') }}</button>
          </div>
        </div>
      </div>
      <div v-if="phase === MEMORY" class="phase-tip">{{ i18n('phaseMemory') }}</div>
      <div v-else-if="phase === FLIP" class="phase-tip">{{ i18n('phaseFlip') }}</div>
      <div v-else-if="phase === ANSWER" class="phase-tip">{{ i18n('phaseAnswer') }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';

import TopHeader from '@/components/TopHeader.vue';
import CountTimer from '@/shared/CountTimer.vue';
import confetti from '@/shared/confetti';
import { i18n } from '@/shared/i18n';
import { EMOJIS } from '@/shared/emojis';

// 6 关：展示 3~8 个 emoji；候选区依次 3×3 / 3×4 / 3×4 / 4×4 / 4×4 / 4×5
const LEVELS = [
  { show: 3, grid: [3, 3] },
  { show: 4, grid: [3, 4] },
  { show: 5, grid: [3, 4] },
  { show: 6, grid: [4, 4] },
  { show: 7, grid: [4, 4] },
  { show: 8, grid: [4, 5] },
];
const MEMORIES = 3000;
const [MEMORY, FLIP, ANSWER, WON, LOST] = ['memory', 'flip', 'answer', 'won', 'lost'];
const KEY_PREFIX = '__emoji_hunter__';
const LEVEL_KEY = `${KEY_PREFIX}level`;
const BEST_KEY = `${KEY_PREFIX}best`;

const level = ref(0);
const phase = ref(MEMORY);
const stage = ref([]);
const candidates = ref([]);
const foundSet = ref(new Set());
const wrongSet = ref(new Set());
const hearts = ref(3);
const bestLevel = ref(+(localStorage.getItem(BEST_KEY) || 0));
const timerRef = ref(null);

const targetCount = computed(() => LEVELS[level.value].show);
const grid = computed(() => LEVELS[level.value].grid);
const gridLabel = computed(() => `${grid.value[0]}×${grid.value[1]}`);
const timerRunning = computed(() => phase.value !== WON && phase.value !== LOST);

// 展示区：单行 flex 布局。可用宽 = 视口(≤440) − 32；扣除 frame 上下 padding 16 与格间 gap，
// 5 个以上目标时按剩余宽度均分（此前只减了单侧 padding，7~8 个时右侧溢出）
const stageStyle = computed(() => {
  const avail = Math.min(window.innerWidth || 420, 440) - 32;
  const n = stage.value.length || 1;
  const cell = Math.min(64, Math.floor((avail - 16 - (n - 1) * 8) / n));
  return { '--stage-cell': `${cell}px` };
});

// 候选区格子边长：按可用宽度均分（含 8px gap 与 padding），96px 封顶
//（与侦探游戏一致，避免 3×3 时格子过大）
const CAND_CELL_MAX = 96;
const candCellPx = computed(() => {
  const [, cols] = LEVELS[level.value].grid;
  const avail = Math.min(window.innerWidth || 420, 440) - 32;
  return Math.min(CAND_CELL_MAX, Math.floor((avail - 16 - (cols - 1) * 8) / cols));
});
const candidateStyle = computed(() => ({
  '--c-cols': LEVELS[level.value].grid[1],
  '--cand-cell': `${candCellPx.value}px`,
  '--cand-font': `${Math.floor(candCellPx.value * 0.5)}px`,
}));

let memoryTimer = null;

onMounted(() => {
  const saved = restore();
  if (!saved) initGame();
});

onUnmounted(() => clearTimeout(memoryTimer));

function clearTimers() {
  clearTimeout(memoryTimer);
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

// 展示牌是否背面：记忆结束后未被找回的；结算（胜负）后全部翻正供复盘
function isStageFaceDown(idx) {
  if (phase.value === MEMORY || phase.value === WON || phase.value === LOST) return false;
  return !foundSet.value.has(stage.value[idx]);
}

// 候选牌是否背面：记忆阶段候选区整体背面（盖住内容防偷看），
// 进入答题后翻正；胜负结算后全部翻正（含漏选的）供玩家复盘
function isCandFaceDown(opt) {
  if (phase.value === MEMORY || phase.value === FLIP) return true;
  return false;
}

async function startLevel() {
  clearTimers();
  foundSet.value = new Set();
  wrongSet.value = new Set();
  hearts.value = 3;
  const lv = LEVELS[level.value];
  // 展示牌 + 候选牌（含展示牌）互不重复
  const all = pickEmojis(lv.show + lv.grid[0] * lv.grid[1] - lv.show);
  stage.value = all.slice(0, lv.show);
  const rest = all.slice(lv.show);
  // 候选区：展示牌 + 干扰项打乱
  candidates.value = [...stage.value, ...rest].sort(() => Math.random() - 0.5);
  // 先以「全正面」渲染并 paint 一帧新内容，再进入记忆阶段（翻背面）：
  // nextTick 只等 DOM 更新，同一 paint 前移除/添加 flipped 会被合并成瞬变，
  // 必须跨过一次 requestAnimationFrame 让浏览器先画「正面」起始帧
  phase.value = ANSWER;
  await nextTick();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  phase.value = MEMORY;
  timerRef.value?.reset();
  memoryTimer = setTimeout(() => {
    phase.value = FLIP;
    setTimeout(() => {
      if (phase.value === FLIP) {
        phase.value = ANSWER;
        save();
      }
    }, 500);
  }, MEMORIES);
  save();
}

// 点候选：是展示过的 → 标记找回（对应展示牌翻回）；
// 不是 → 红色高亮标错且不可再选，扣心
function pick(idx) {
  if (phase.value !== ANSWER) return;
  const emoji = candidates.value[idx];
  if (foundSet.value.has(emoji) || wrongSet.value.has(emoji)) return;
  if (stage.value.includes(emoji)) {
    foundSet.value = new Set([...foundSet.value, emoji]);
    if (foundSet.value.size === stage.value.length) {
      phase.value = WON;
      timerRef.value?.stop();
      if (level.value + 1 > bestLevel.value) {
        bestLevel.value = level.value + 1;
        localStorage.setItem(BEST_KEY, bestLevel.value);
      }
      confetti();
      save();
    }
  } else {
    wrongSet.value = new Set([...wrongSet.value, emoji]);
    hearts.value = Math.max(0, hearts.value - 1);
    if (hearts.value <= 0) {
      setTimeout(() => {
        phase.value = LOST;
        timerRef.value?.stop();
        save();
      }, 600);
    }
    save();
  }
}

function nextLevel() {
  if (level.value < LEVELS.length - 1) level.value++;
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
    level.value = Math.min(LEVELS.length - 1, Math.max(0, saved.level));
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
        color: var(--muted-color);
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
  // 展示区：单行居中，卡片 64px 上限
  .stage-frame {
    width: fit-content;
    margin: 0 auto 16px;
    padding: 8px;
    background: var(--board-bg);
    border-radius: var(--card-radius);
  }
  .stage {
    display: flex;
    gap: 8px;
    .stage-cell {
      width: var(--stage-cell);
      height: var(--stage-cell);
      perspective: 500px;
    }
  }
  .card-flip {
    position: relative;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
    transition: transform 0.45s ease-in-out;
    &.flipped {
      transform: rotateY(180deg);
    }
  }
  // 通用翻牌面样式（两区共用基础部分）
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
    font-size: calc(var(--stage-cell) * 0.4);
    transform: rotateY(180deg);
  }
  .front-face {
    background: var(--card-bg-color);
    font-size: calc(var(--stage-cell) * 0.52);
  }
  // 候选区：记忆阶段即显示（牌面朝下），答案区翻回后随之翻正。
  // 宽度收缩到内容并居中，格子边长与字号由 JS 按 --cand-cell 计算
  .candidate-area {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--c-cols), var(--cand-cell));
    grid-auto-rows: var(--cand-cell);
    gap: 8px;
    width: fit-content;
    margin: 0 auto;
    padding: 8px;
    background: var(--board-bg);
    border-radius: var(--card-radius);
  }
  .candidate-tile {
    width: var(--cand-cell);
    height: var(--cand-cell);
    perspective: 500px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    .cand-flip {
      position: relative;
      width: 100%;
      height: 100%;
      transform-style: preserve-3d;
      transition: transform 0.45s ease-in-out;
      &.flipped {
        transform: rotateY(180deg);
      }
    }
    .cand-back {
      background: var(--primary-bg);
      color: #fff;
      font-size: calc(var(--cand-cell) * 0.4);
      transform: rotateY(180deg);
    }
    .cand-front {
      background: var(--card-bg-color);
      border: 1px solid var(--tile-border-color);
      font-size: var(--cand-font);
      line-height: 1;
    }
    // 找回的目标：绿色标记并缩小
    .cand-flip.found .cand-front {
      background: var(--enter-bg);
      border-color: var(--primary-bg);
      box-shadow: inset 0 0 0 1px var(--primary-bg);
    }
    // 选错：红色高亮且不可再选
    .cand-flip.wrong {
      .cand-front {
        background: var(--del-bg);
        border-color: var(--lose-color);
        color: var(--lose-color);
      }
      cursor: not-allowed;
    }
  }
  .phase-tip {
    position: absolute;
    top: -14px;
    left: 50%;
    transform: translateX(-50%);
    padding: 2px 14px;
    border-radius: var(--radius-tile);
    background: var(--card-bg-color);
    color: var(--text-color);
    border: 1px solid var(--border-color);
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    z-index: 3;
  }
  // 结算遮罩覆盖在候选区上（候选区 position:relative）
  .result {
    position: absolute;
    inset: 0;
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
    &.lose {
      color: var(--lose-color);
    }
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
