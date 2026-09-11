<template>
  <div class="wrapper" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
    <TopHeader @onScoreReset="onScoreReset" />
    <div class="card score-area">
      <div class="stat">
        <span class="stat-label">{{ i18n('bestScore') }}</span>
        <span class="stat-value">{{ bestScore }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('score') }}</span>
        <span class="stat-value">{{ score }}</span>
      </div>
    </div>
    <div class="card opt-area">
      <div class="opt-half">
        <CountTimer ref="timerRef" :enable="timerRunning" :on-tick="onTimerTick" />
      </div>
      <div class="opt-half">
        <button class="game-icon" @click="initGame">{{ i18n('start') }}</button>
      </div>
    </div>
    <div class="game-area">
      <div class="grid">
        <div class="cell" v-for="idx in SIZE * SIZE" :key="`bg-${idx}`"></div>
        <div
          class="cell tile"
          v-for="tile in tiles"
          :key="tile.id"
          :class="[`v-${tile.value > 2048 ? 2048 : tile.value}`, { merged: tile.merged, dealt: tile.dealIdx != null }]"
          :style="tileStyle(tile)"
        >
          {{ tile.value }}
        </div>
      </div>
      <div v-if="gameResult === WIN" class="result win">
        <span>🎉🎉 {{ i18n('tipWin') }} 🎉🎉</span>
        <span v-if="newBest">{{ i18n('newBest') }}</span>
        <button class="game-icon keep" @click="keepGoing">{{ i18n('keepGoing') }}</button>
      </div>
      <div v-else-if="gameResult === LOSE" class="result lose">👻👻 {{ i18n('tipLost') }} 👻👻</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';

import TopHeader from '@/components/TopHeader.vue';
import CountTimer from '@/shared/CountTimer.vue';
import confetti from '@/shared/confetti';

const SIZE = 4;
const WIN_VAL = 2048;
const [GAMING, WIN, LOSE] = [0, 1, 2];
const BEST_KEY = '__game_2048__best';
const STATE_KEY = '__game_2048__state';
// 开局 / 恢复存档时的挨个入场动画：每张牌间隔 DEAL_STEP 毫秒依次弹出
const DEAL_STEP = 45;
const DEAL_STEP_FEW = 140;
const DEAL_MS = 280;
const DEAL_TAIL = 120;

const score = ref(0);
const bestScore = ref(+(localStorage.getItem(BEST_KEY) || 0));
const gameResult = ref(GAMING);
const newBest = ref(false);
const tiles = ref([]);
let tileId = 0;
let winShown = false;
let dealing = false;
let dealTimer = null;
let dealStep = DEAL_STEP;

const timerRef = ref(null);
// 进行中才计时（含 2048 达成后的继续游戏）；失败/未开始时暂停
const timerRunning = computed(() => gameResult.value === GAMING || gameResult.value === WIN);

// 恢复上次进度：棋盘 + 得分 + 是否已展示过胜利（继续游戏状态）+ 失败局面
function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY));
    if (!Array.isArray(saved?.tiles) || !saved.tiles.length) return false;
    // 存档不含 id，必须重新分配自增 id：模板 :key 依赖 id，缺 id 会导致移动动画错乱
    tiles.value = saved.tiles.map(t => ({ ...t, id: ++tileId }));
    score.value = Math.max(...saved.tiles.map(t => t.value));
    winShown = Boolean(saved.winShown);
    gameResult.value = saved.result === LOSE ? LOSE : GAMING;
    return true;
  } catch {
    return false;
  }
}

// 每步落定后持久化（含计时与胜负状态）
watch(tiles, () => {
  localStorage.setItem(STATE_KEY, JSON.stringify({
    tiles: tiles.value.map(({ row, col, value }) => ({ row, col, value })),
    score: score.value,
    time: timerRef.value?.seconds() || 0,
    result: gameResult.value,
    winShown,
  }));
}, { deep: true });

// 失败时把最终耗时写入存档（恢复时失败局面不恢复，但 best 依赖存档时序无关）
watch(gameResult, val => {
  if (val === LOSE) timerRef.value?.stop();
});

onMounted(() => {
  const restored = restore();
  if (restored) {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY));
    timerRef.value.restore(saved?.time);
    // 恢复到失败局面时计时器保持停止，展示最终用时
    if (gameResult.value === LOSE) timerRef.value.stop();
    // 恢复出来的牌逐张入场（失败局面被结算浮层盖住，就不做了）
    if (gameResult.value !== LOSE) playDeal();
  } else {
    initGame();
  }
  window.addEventListener('keyup', onKeyUp);
});

onUnmounted(() => {
  window.removeEventListener('keyup', onKeyUp);
  clearTimeout(dealTimer);
});

function onKeyUp(e) {
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  move(e.key.replace('Arrow', '').toLowerCase());
}

function onScoreReset() {
  bestScore.value = 0;
}

// 计时每秒把时间写进存档（保持离开/刷新时的恢复精度）
function onTimerTick() {
  if (gameResult.value === LOSE) return;
  const saved = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
  saved.time = timerRef.value?.seconds() || 0;
  localStorage.setItem(STATE_KEY, JSON.stringify(saved));
}

function tileStyle(tile) {
  const step = `calc((100% - 10px) / ${SIZE})`;
  return {
    left: `calc(${tile.col} * ${step} + 10px)`,
    top: `calc(${tile.row} * ${step} + 10px)`,
    ...(tile.dealIdx != null ? { animationDelay: `${tile.dealIdx * dealStep}ms` } : null),
  };
}

// 挨个入场：按「先上后下、从左到右」的顺序给每张牌排一个延迟，
// 靠 CSS animationDelay + backwards 填充实现逐张弹出（新开局与恢复存档都走这里）
function playDeal() {
  if (!tiles.value.length) return;
  clearTimeout(dealTimer);
  dealing = true;
  // 新开局只有 2 张牌，间隔太短会看起来是同时出现，这里放慢一点
  dealStep = tiles.value.length <= 4 ? DEAL_STEP_FEW : DEAL_STEP;
  const rank = new Map();
  [...tiles.value]
    .sort((a, b) => (a.row - b.row) || (a.col - b.col))
    .forEach((t, i) => rank.set(t.id, i));
  tiles.value = tiles.value.map(t => ({ ...t, dealIdx: rank.get(t.id) }));
  dealTimer = setTimeout(() => {
    dealing = false;
    tiles.value = tiles.value.map(({ dealIdx, ...t }) => t);
  }, (tiles.value.length - 1) * dealStep + DEAL_MS + DEAL_TAIL);
}

function initGame() {
  gameResult.value = GAMING;
  newBest.value = false;
  winShown = false;
  tiles.value = [];
  spawnTile();
  spawnTile();
  score.value = Math.max(...tiles.value.map(t => t.value));
  timerRef.value?.reset();
  playDeal();
  localStorage.setItem(STATE_KEY, JSON.stringify({
    tiles: tiles.value.map(({ row, col, value }) => ({ row, col, value })),
    score: 0,
    time: 0,
    result: GAMING,
    winShown: false,
  }));
}

function emptyCells() {
  const occupied = new Set(tiles.value.map(t => `${t.row},${t.col}`));
  const cells = [];
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (!occupied.has(`${row},${col}`)) cells.push([row, col]);
    }
  }
  return cells;
}

function spawnTile() {
  const cells = emptyCells();
  if (!cells.length) return;
  const [row, col] = cells[~~(Math.random() * cells.length)];
  tiles.value.push({
    id: ++tileId,
    row,
    col,
    value: Math.random() < 0.9 ? 2 : 4,
    merged: false,
  });
}

// 按移动方向生成 SIZE 条线，每条线是从「移动目标侧」开始的坐标序列
function linesOf(dir) {
  const lines = [];
  const range = [0, 1, 2, 3];
  for (const i of range) {
    const line = [];
    for (const j of range) {
      if (dir === 'left') line.push([i, j]);
      else if (dir === 'right') line.push([i, SIZE - 1 - j]);
      else if (dir === 'up') line.push([j, i]);
      else line.push([SIZE - 1 - j, i]);
    }
    lines.push(line);
  }
  return lines;
}

function move(dir) {
  if (gameResult.value === WIN || gameResult.value === LOSE || dealing) return;
  const map = tiles.value.reduce((acc, t) => {
    acc[`${t.row},${t.col}`] = t;
    return acc;
  }, {});
  const next = [];
  let moved = false;

  linesOf(dir).forEach(line => {
    const existing = line.map(([r, c]) => map[`${r},${c}`]).filter(Boolean);
    const groups = [];
    for (let i = 0; i < existing.length; i++) {
      if (i + 1 < existing.length && existing[i].value === existing[i + 1].value) {
        groups.push([existing[i], existing[i + 1]]);
        i++;
      } else {
        groups.push([existing[i]]);
      }
    }
    groups.forEach((group, idx) => {
      const [first, second] = group;
      const [row, col] = line[idx];
      if (first.row !== row || first.col !== col) moved = true;
      if (second) {
        moved = true;
        next.push({ id: ++tileId, row, col, value: first.value * 2, merged: true });
      } else {
        next.push({ id: first.id, row, col, value: first.value, merged: false });
      }
    });
  });

  if (!moved) return;
  tiles.value = next;
  score.value = Math.max(...tiles.value.map(t => t.value));
  if (score.value > bestScore.value) {
    bestScore.value = score.value;
    localStorage.setItem(BEST_KEY, score.value);
    newBest.value = true;
  }
  spawnTile();
  if (!winShown && tiles.value.some(t => t.value >= WIN_VAL)) {
    winShown = true;
    gameResult.value = WIN;
    confetti();
  }
  checkLose();
}

function checkLose() {
  if (emptyCells().length) return;
  const map = tiles.value.reduce((acc, t) => {
    acc[`${t.row},${t.col}`] = t.value;
    return acc;
  }, {});
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const val = map[`${row},${col}`];
      if (val === map[`${row},${col + 1}`] || val === map[`${row + 1},${col}`]) return;
    }
  }
  gameResult.value = LOSE;
}

function keepGoing() {
  gameResult.value = GAMING;
}

let touchStartX = 0;
let touchStartY = 0;
function onTouchStart(e) {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}
function onTouchEnd(e) {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
  if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
  else move(dy > 0 ? 'down' : 'up');
}
</script>

<style scoped lang="scss">
@keyframes pop {
  from {
    transform: scale(0.4);
  }
  to {
    transform: scale(1);
  }
}

@keyframes deal-in {
  from {
    transform: scale(0.2);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
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
    .stat {
      flex: 1;
      padding: 14px 28px;
      display: flex;
      flex-direction: column;
      align-items: center;
      .stat-label {
        font-size: 12px;
        opacity: 0.6;
      }
      .stat-value {
        font-size: 22px;
        font-weight: bold;
        line-height: 1.3;
      }
    }
  }
  .opt-area {
    display: flex;
    align-items: center;
    margin: 16px 0;
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
  .game-icon {
    cursor: pointer;
    padding: 8px 20px;
    font-size: 14px;
    font-weight: bold;
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
  .grid {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding: 10px;
    box-sizing: border-box;
    background: var(--board-bg);
    border-radius: var(--card-radius);
    aspect-ratio: 1;
    .cell {
      width: calc((100% - 30px) / 4);
      height: calc((100% - 30px) / 4);
      border-radius: 8px;
      background: var(--cell-bg);
    }
    .tile {
      position: absolute;
      // 绝对定位的 % 基于 padding box（比内容盒宽 20px），需与背景格实际尺寸保持一致
      width: calc((100% - 50px) / 4);
      height: calc((100% - 50px) / 4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      font-weight: bold;
      color: #fff;
      background: #eda437;
      transition: left 0.12s ease-in-out, top 0.12s ease-in-out;
      z-index: 1;
      &.merged {
        animation: 0.16s ease-in-out pop;
      }
      // 开局 / 恢复存档：按行列顺序逐张弹出（间隔由 animationDelay 控制，
      // backwards 填充保证轮到自己之前先隐身）
      &.dealt {
        animation: 0.28s cubic-bezier(0.34, 1.56, 0.64, 1) backwards deal-in;
      }
      &.v-4 { background: #f2b179; }
      &.v-8 { background: #f59563; }
      &.v-16 { background: #f67c5f; }
      &.v-32 { background: #f65e3b; }
      &.v-64 { background: #edcf72; }
      &.v-128 { background: #edcc61; font-size: 24px; }
      &.v-256 { background: #edc850; font-size: 24px; }
      &.v-512 { background: #edc53f; font-size: 24px; }
      &.v-1024 { background: #edc22e; font-size: 20px; }
      &.v-2048 { background: var(--primary-bg); font-size: 20px; }
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
    &.lose {
      color: var(--lose-color);
    }
  }
}
</style>
