<template>
  <div class="wrapper">
    <TopHeader @onScoreReset="onScoreReset" />
    <div class="card score-area">
      <div class="stat">
        <span class="stat-label">{{ i18n('score') }}</span>
        <span class="stat-value">{{ score }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('best') }}</span>
        <span class="stat-value">{{ best || '--' }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('speed') }}</span>
        <span class="stat-value">{{ speedLabel }}</span>
      </div>
    </div>
    <div class="card opt-area">
      <div class="difficulty-wrapper">
        <span class="difficulty-value">{{ i18n('boardInfo') }}</span>
      </div>
      <div class="divider"></div>
      <div class="start-wrapper">
        <button @click="startNewGame" class="game-icon">{{ i18n('start') }}</button>
      </div>
    </div>
    <div class="game-area">
      <div class="board dot-board" :style="boardStyle">
        <!-- 整摞牌：整体靠 rAF 每帧改 transform 平移（不逐排改 top），
             里面的每一排只在自己下标变化（消除 / 补排）时才重排 -->
        <div ref="stackEl" class="stack">
          <div
            v-for="(row, j) in stack"
            :key="row.id"
            class="rise-row"
            :class="{ popping: row.popping }"
            :style="{ top: `${j * cell}px`, height: `${cell}px` }"
          >
            <span v-for="(g, c) in row.cells" :key="c" class="rise-cell" :style="cellStyle">
              <span class="tile">{{ g }}</span>
            </span>
          </div>
        </div>
        <!-- 玩家控制的 emoji：骑在整摞最上面那排的上方一格 -->
        <div ref="playerEl" class="player" :style="playerBaseStyle">
          <span class="tile player-tile">{{ glyph }}</span>
        </div>
        <!-- 点击热区：整列可点，压在牌与玩家之上 -->
        <div
          v-for="c in COLS"
          :key="`hit-${c}`"
          class="column-hit"
          :style="{ left: `${(c - 1) * cell}px`, width: `${cell}px` }"
          @click="pick(c - 1)"
        ></div>
      </div>
      <div v-if="phase === OVER" class="result lose">
        <div class="result-title">🏁 {{ i18n('tipOver') }} 🏁</div>
        <div class="final-score">{{ score }}</div>
        <button class="game-icon primary" @click="startNewGame">{{ i18n('retry') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';

import TopHeader from '@/components/TopHeader.vue';
import { i18n } from '@/shared/i18n';
import {
  ROWS, COLS, START_TOP, START_ROWS, SPEED_BASE,
  speedFor, makeRow, nextChangeIn,
} from './board';

const [PLAY, OVER] = ['play', 'over'];
const KEY_PREFIX = '__emoji_down__';
// 最高分沿用「前缀 + 数字」的存法，连点标题的彩蛋正好能清掉
const BEST_KEY = `${KEY_PREFIX}best_1`;
const STATE_KEY = `${KEY_PREFIX}state`;

const MAX_CELL = 58;   // 格子边长上限（纵向 8 行，多数情况下是宽度在限）
const GAP = 3;         // 每格之间的缝
const POP_MS = 180;    // 整排炸开动画时长（CSS 里的 rise-pop 要同步）
const FALL_K = 20;     // 落下一格的收敛速度（越大掉得越快）
const RECHECK_MS = 110; // 落定后补判一次：炸开那段时间玩家可能已经滑到别的列了

const phase = ref(PLAY);
const score = ref(0);
const best = ref(+(localStorage.getItem(BEST_KEY) || 0));
const stack = ref([]);          // [{ id, cells: [6 个 emoji], popping }]，下标 0 = 最上面那排
const glyph = ref('🍎');        // 玩家手里的 emoji
const colTarget = ref(~~(COLS / 2));

const stackEl = ref(null);
const playerEl = ref(null);

// 逐帧推进的量放在普通变量里（不进响应式，避免每帧触发整棵树重渲）
let top = START_TOP;     // 整摞最上面那排所在的行（越小越靠上，上升 = 变小）
let colVis = colTarget.value;   // 玩家横向的连续位置（滑过去靠它插值）
let playerLag = 0;       // 消除后往下掉一格的落后量（-1 → 0）
let cleared = 0;         // 已消除排数（速度只跟它有关）
let changeIn = nextChangeIn();  // 再消几排换手里的 emoji
let arrived = true;      // 这一次滑动是否已经到位（到位才判定）
let busy = false;        // 正在播炸开 / 落下的动画
let rowId = 0;
let raf = 0;
let last = 0;
let gen = 0;             // 换局 / 卸载时 +1，异步动画据此收手

const cell = computed(() => {
  const availW = Math.min(window.innerWidth || 420, 440) - 32;
  const availH = Math.max(200, (window.innerHeight || 700) - 262);
  return Math.max(14, Math.floor(Math.min(availW / COLS, availH / ROWS, MAX_CELL)));
});
const boardStyle = computed(() => {
  const c = cell.value;
  return {
    width: `${c * COLS}px`,
    height: `${c * ROWS}px`,
    '--cell': `${c}px`,
    '--tile': `${c - GAP}px`,
    '--font': `${Math.round((c - GAP) * 0.62)}px`,
  };
});
const cellStyle = { width: 'var(--cell)', height: 'var(--cell)' };
const playerBaseStyle = { width: 'var(--cell)', height: 'var(--cell)' };
// 速度只用来展示，倍数相对于起始速度
const speedLabel = computed(() => `${(speedFor(clearedShown.value) / SPEED_BASE).toFixed(1)}×`);
const clearedShown = ref(0);

// ---------- 关卡流程 ----------

function newRow() {
  return { id: ++rowId, cells: makeRow(), popping: false };
}

// 整摞始终保持「从顶排一路铺到棋盘底边」，不够就在底部补新排。
// 这一步是必须的：玩家消得比上升快时，消除会把整摞整体往下推，
// 推过头就会把牌堆推出棋盘、甚至清空（stack[0] 变 undefined，后面全炸）；
// 顶排同时钳在棋盘最后一行，于是堆里永远至少留着一排，玩家最多退到棋盘底部
function fillPile() {
  while (top + stack.value.length < ROWS) stack.value.push(newRow());
}

function startNewGame() {
  gen += 1;
  stopLoop();
  phase.value = PLAY;
  score.value = 0;
  cleared = 0;
  clearedShown.value = 0;
  changeIn = nextChangeIn();
  busy = false;
  top = START_TOP;
  playerLag = 0;
  stack.value = Array.from({ length: START_ROWS }, newRow);
  // 开局就找一个「当前列不是同款」的组合，玩家第一手就得动起来
  const startCol = ~~(COLS / 2);
  colTarget.value = startCol;
  colVis = startCol;
  const row = stack.value[0].cells;
  const other = row.findIndex((g, c) => c !== startCol && g !== row[startCol]);
  glyph.value = row[other >= 0 ? other : (startCol + 1) % COLS];
  arrived = true;
  best.value = +(localStorage.getItem(BEST_KEY) || 0);
  save();
  startLoop();
}

// 点列就能滑过去：busy（正在炸开 / 落地）不挡这里，
// 只挡「再开一次消除」——不然玩家消完一排立刻点下一列会白点一下
function pick(c) {
  if (phase.value !== PLAY) return;
  if (c === colTarget.value) {
    // 点自己所在的列：立刻判定一次（比如刚落下来就同款的情况）
    if (arrived) checkMatch();
    return;
  }
  colTarget.value = c;
  arrived = false;
}

// 到位后判定：顶排这一列跟自己同款 → 整排炸开
function checkMatch() {
  // arrived = 玩家此刻确实停在某一列上（还在滑动途中不算，判定留到到位时）
  if (phase.value !== PLAY || busy || !arrived) return;
  const row = stack.value[0];
  if (!row || row.popping) return;
  if (row.cells[colTarget.value] === glyph.value) clearTopRow();
}

function clearTopRow() {
  const row = stack.value[0];
  busy = true;
  row.popping = true;            // 炸开动画
  const g = gen;
  setTimeout(() => {
    if (g !== gen || phase.value !== PLAY) return;
    stack.value.shift();
    // 「顶」下移一排（其余排的绝对位置不变），但最多落到棋盘最后一行
    top = Math.min(top + 1, ROWS - 1);
    fillPile();                  // 立刻把底边补齐，堆里不会出现空档
    playerLag = -1;              // 玩家往下掉一格（渲染上先从上一格开始，逐帧落到位）
    score.value += 1;
    cleared += 1;
    clearedShown.value = cleared;
    if (score.value > best.value) {
      best.value = score.value;
      localStorage.setItem(BEST_KEY, best.value);
    }
    // 每 3~5 排换一次手里的 emoji，新的那个一定在当前顶排里
    if (cleared >= changeIn) {
      const next = stack.value[0];
      glyph.value = next.cells[~~(Math.random() * COLS)];
      changeIn = cleared + nextChangeIn();
    }
    busy = false;
    save();
    // 落定之后补判一次：新顶排要是也同款就接着消（连锁），
    // 或者玩家在炸开那会儿已经滑到同款上了，这一下也补上
    setTimeout(() => {
      if (g === gen && phase.value === PLAY) checkMatch();
    }, RECHECK_MS);
  }, POP_MS);
}

function lose() {
  if (phase.value !== PLAY) return;
  phase.value = OVER;
  stopLoop();
  save();
}

// ---------- 逐帧循环 ----------

function render() {
  const c = cell.value;
  if (stackEl.value) stackEl.value.style.transform = `translate3d(0, ${(top * c).toFixed(2)}px, 0)`;
  if (playerEl.value) {
    playerEl.value.style.transform =
      `translate3d(${(colVis * c).toFixed(2)}px, ${((top - 1 + playerLag) * c).toFixed(2)}px, 0)`;
  }
}

function frame(now) {
  if (phase.value !== PLAY) return;
  // 切后台再回来时 dt 会很大，钳一下，免得牌堆瞬间窜到顶
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
  last = now;
  top -= speedFor(cleared) * dt;
  fillPile();
  // 滑动：向目标列插值，到位后判定一次
  if (Math.abs(colTarget.value - colVis) > 0.004) {
    colVis += (colTarget.value - colVis) * Math.min(1, dt * 14);
  } else if (!arrived) {
    colVis = colTarget.value;
    arrived = true;
    checkMatch();
  }
  // 落下一格的动画
  if (playerLag !== 0) {
    playerLag += (0 - playerLag) * Math.min(1, dt * FALL_K);
    if (Math.abs(playerLag) < 0.02) playerLag = 0;
  }
  // 玩家（贴在整摞最上面那排的上方一格）顶到棋盘顶部 → 失败
  if (top - 1 <= 0) { render(); lose(); return; }
  render();
  raf = requestAnimationFrame(frame);
}

function startLoop() {
  stopLoop();
  last = 0;
  render();
  raf = requestAnimationFrame(frame);
}

function stopLoop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

onMounted(() => {
  if (!restore()) startNewGame();
});

onUnmounted(() => {
  gen += 1;
  stopLoop();
});

// ---------- 存档 ----------

function save() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({
      phase: phase.value,
      score: score.value,
      top,
      col: colTarget.value,
      glyph: glyph.value,
      cleared,
      changeIn,
      stack: stack.value.map(r => r.cells),
    }));
  } catch { /* 隐私模式等写不进去的场景忽略 */ }
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY));
    if (!saved || !Array.isArray(saved.stack) || !saved.stack.length) return false;
    if (saved.phase !== PLAY && saved.phase !== OVER) return false;
    stack.value = saved.stack.map(cells => ({ id: ++rowId, cells, popping: false }));
    score.value = Math.max(0, +saved.score || 0);
    glyph.value = typeof saved.glyph === 'string' ? saved.glyph : stack.value[0].cells[0];
    colTarget.value = Math.min(COLS - 1, Math.max(0, +saved.col || 0));
    colVis = colTarget.value;
    cleared = Math.max(0, +saved.cleared || 0);
    clearedShown.value = cleared;
    changeIn = Math.max(cleared + 1, +saved.changeIn || nextChangeIn());
    top = typeof saved.top === 'number' ? saved.top : START_TOP;
    playerLag = 0;
    arrived = true;
    busy = false;
    phase.value = saved.phase === OVER ? OVER : PLAY;
    if (phase.value === PLAY) startLoop();
    else render();
    return true;
  } catch {
    return false;
  }
}

function onScoreReset() {
  localStorage.removeItem(BEST_KEY);
  best.value = 0;
}
</script>

<style scoped lang="scss">
@keyframes rise-pop {
  0% { transform: scale(1); opacity: 1; }
  45% { transform: scale(1.07); opacity: 1; }
  100% { transform: scale(1.3); opacity: 0; }
}

@keyframes player-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.07); }
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
  button { touch-action: manipulation; }
  .card {
    width: calc(100% - 32px);
    max-width: 440px;
    box-sizing: border-box;
    background: var(--card-bg-color);
    border-radius: var(--card-radius);
    box-shadow: var(--card-shadow);
  }
  .score-area {
    margin-top: 64px;
    position: relative;
    display: flex;
    align-items: center;
    height: var(--row-height);
    padding: 0 12px;
    .stat {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      .stat-label { font-size: 12px; opacity: 0.75; white-space: nowrap; }
      .stat-value {
        font-size: 22px;
        font-weight: bold;
        line-height: 1.2;
        font-variant-numeric: tabular-nums;
      }
    }
    .divider {
      width: 1px;
      height: 60%;
      background: var(--border-color);
    }
  }
  .opt-area {
    display: flex;
    align-items: center;
    margin: var(--row-gap) 0;
    height: var(--row-height);
    .difficulty-wrapper {
      flex: 1.6;
      display: flex;
      align-items: center;
      justify-content: center;
      .difficulty-value {
        font-size: 16px;
        font-weight: bold;
        white-space: nowrap;
      }
    }
    .start-wrapper {
      flex: 1.2;
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
    border-radius: var(--radius-tile);
  }
  .game-area {
    position: relative;
    width: fit-content;
    max-width: calc(100% - 32px);
    margin: 0 auto;
    box-sizing: border-box;
  }
  .board {
    position: relative;
    overflow: hidden;
    border-radius: var(--card-radius);
    // 点阵底纹自己不再画，交给 .dot-board
  }
  // 整摞牌：位置由 rAF 每帧改 transform（见 render()）
  .stack {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    will-change: transform;
  }
  .rise-row {
    position: absolute;
    left: 0;
    width: 100%;
    display: flex;
    transform-origin: center center;
    &.popping {
      animation: rise-pop 0.18s ease-out forwards;   // 与 POP_MS 同步
    }
  }
  .rise-cell {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .tile {
    width: var(--tile);
    height: var(--tile);
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-tile);
    border: 1px solid var(--tile-border-color);
    background: var(--card-bg-color);
    box-shadow: var(--shadow-soft);
    font-size: var(--font);
    line-height: 1;
  }
  // 玩家控制的那个：加一圈主色描边 + 呼吸，跟牌堆区分开
  .player {
    position: absolute;
    left: 0;
    top: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
    will-change: transform;
    .player-tile {
      box-shadow: 0 0 0 3px var(--primary-bg), var(--shadow-soft);
      animation: player-pulse 1.6s ease-in-out infinite;
    }
  }
  .column-hit {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 3;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .result {
    position: absolute;
    inset: 0;
    z-index: 4;
    border-radius: var(--card-radius);
    background: var(--mask-color);
    color: var(--lose-color);
    font-weight: bold;
    font-size: 18px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 12px;
    box-sizing: border-box;
    .final-score {
      font-size: 28px;
      font-variant-numeric: tabular-nums;
    }
  }
}
</style>
