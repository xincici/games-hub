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
        <span class="stat-label">{{ i18n('nextLabel') }}</span>
        <span class="next-tile" :class="`v-${nextTile}`">{{ nextTile }}</span>
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
      <div class="divider"></div>
      <div class="opt-half">
        <button class="game-icon" @click="initGame">{{ i18n('start') }}</button>
      </div>
    </div>
    <div class="game-area">
      <div class="grid">
        <div class="cell" v-for="idx in SIZE * SIZE" :key="`bg-${idx}`"></div>
        <div
          class="tile"
          v-for="tile in tiles"
          :key="tile.id"
          :class="[`v-${capValue(tile.value)}`, { merged: tile.merged, fresh: tile.fresh }]"
          :style="tileStyle(tile)"
        >
          <span class="tile-value">{{ tile.value }}</span>
          <span v-if="tile.value >= 3" class="tile-score">{{ tileScore(tile.value) }}</span>
        </div>
      </div>
      <div v-if="phase === LOSE" class="result lose">👻👻 {{ i18n('tipLost') }} 👻👻</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';

import TopHeader from '@/components/TopHeader.vue';
import CountTimer from '@/games/link/CountTimer.vue';
import { i18n } from '@/shared/i18n';

// 经典 Threes：4×4；1+2=3，3 起相同数字翻倍合成；
// 得分 = 盘面各牌分值之和（1/2 记 0 分，3·2^k 记 3^(k+1)）
const SIZE = 4;
const [GAMING, LOSE] = [0, 1];
const BEST_KEY = '__threes_game__best';
const STATE_KEY = '__threes_game__state';

const tiles = ref([]);
const phase = ref(GAMING);
const score = ref(0);
const nextTile = ref(1);
const bestScore = ref(+(localStorage.getItem(BEST_KEY) || 0));
const timerRef = ref(null);

const timerRunning = computed(() => phase.value === GAMING);

let deck = [];
let tileId = 0;
let busy = false;

onMounted(() => {
  if (!restore()) initGame();
  window.addEventListener('keyup', onKeyUp);
});

onUnmounted(() => {
  window.removeEventListener('keyup', onKeyUp);
});

function onKeyUp(e) {
  const keyMap = {
    ArrowUp: 'up', w: 'up', W: 'up',
    ArrowDown: 'down', s: 'down', S: 'down',
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
  };
  const dir = keyMap[e.key];
  if (!dir) return;
  e.preventDefault();
  move(dir);
}

// ---------- 牌堆（经典配比 12×1、12×2、4×3，抽空重洗） ----------

function newDeck() {
  const d = [...Array(12).fill(1), ...Array(12).fill(2), ...Array(12 * 0 + 4).fill(3)];
  for (let i = d.length - 1; i > 0; i--) {
    const j = ~~(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function draw() {
  if (!deck.length) deck = newDeck();
  return deck.pop();
}

// ---------- 合成规则与得分 ----------

function compat(a, b) {
  return (a === 1 && b === 2) || (a === 2 && b === 1) || (a === b && a >= 3);
}

function mergeValue(a) {
  return a >= 3 ? a * 2 : 3;
}

function tileScore(v) {
  return v < 3 ? 0 : 3 ** (Math.log2(v / 3) + 1);
}

function capValue(v) {
  return Math.min(v, 6144);
}

// ---------- 移动（经典 Threes 语义：每张牌每次最多移动一格） ----------

const DIRS = {
  left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0],
};

// 纯函数：基于 tiles 副本计算一步移动，不修改入参。
// 每张牌沿方向最多走一格：前方空则进一格；前方是可合且本步未合成的牌
// 则贴上合成；被挡则不动。目标侧的牌先处理，后面的牌才能跟进补位
function computeMove(dir) {
  const [dr, dc] = DIRS[dir];
  const key = (r, c) => `${r},${c}`;
  const board = new Map();
  const live = tiles.value.map(t => ({ ...t }));
  live.forEach(t => board.set(key(t.row, t.col), t));
  const placements = [];
  const mergeOps = [];
  let moved = false;
  const order = [...live].sort((a, b) => {
    const da = (b.row * dr + b.col * dc) - (a.row * dr + a.col * dc);
    return da !== 0 ? da : a.id - b.id;
  });
  for (const tile of order) {
    const nr = tile.row + dr;
    const nc = tile.col + dc;
    if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) {
      placements.push({ ...tile });
      continue;
    }
    const ahead = board.get(key(nr, nc));
    if (!ahead) {
      board.delete(key(tile.row, tile.col));
      board.set(key(nr, nc), tile);
      tile.row = nr;
      tile.col = nc;
      moved = true;
      placements.push({ ...tile });
    } else if (compat(ahead.value, tile.value) && !ahead.mergedThisStep) {
      board.delete(key(tile.row, tile.col));
      tile.row = nr;
      tile.col = nc;
      ahead.mergedThisStep = true;
      moved = true;
      placements.push({ ...tile });
      mergeOps.push({ aId: ahead.id, bId: tile.id, row: nr, col: nc, value: mergeValue(ahead.value) });
    } else {
      placements.push({ ...tile });
    }
  }
  return { placements, mergeOps, moved };
}

function canMove() {
  return ['up', 'down', 'left', 'right'].some(dir => computeMove(dir).moved);
}

// 两阶段移动：先整体滑到目标位（合成对重叠），140ms 后替换为合成牌并补牌，
// 保证滑动过程与合成弹跳都能被看见
function move(dir) {
  if (phase.value !== GAMING || busy) return;
  const { placements, mergeOps, moved } = computeMove(dir);
  if (!moved) return;
  busy = true;
  tiles.value = placements;
  setTimeout(() => {
    const sourceIds = new Set(mergeOps.flatMap(m => [m.aId, m.bId]));
    const next = placements
      .filter(t => !sourceIds.has(t.id))
      .map(t => ({ ...t, merged: false, fresh: false }));
    mergeOps.forEach(m => {
      next.push({ id: ++tileId, value: m.value, row: m.row, col: m.col, merged: true });
    });
    // 补进一张新牌
    const empty = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!next.some(t => t.row === r && t.col === c)) empty.push([r, c]);
      }
    }
    if (empty.length) {
      const [r, c] = empty[~~(Math.random() * empty.length)];
      next.push({ id: ++tileId, value: nextTile.value, row: r, col: c, fresh: true });
      nextTile.value = draw();
    }
    tiles.value = next;
    score.value = next.reduce((s, t) => s + tileScore(t.value), 0);
    if (score.value > bestScore.value) {
      bestScore.value = score.value;
      localStorage.setItem(BEST_KEY, score.value);
    }
    busy = false;
    if (!canMove()) {
      phase.value = LOSE;
      timerRef.value?.stop();
    }
    save();
  }, 140);
}

// ---------- 局面 ----------

function initGame() {
  deck = [];
  const board = [];
  const cells = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) cells.push([r, c]);
  for (let i = 0; i < 9; i++) {
    const j = ~~(Math.random() * cells.length);
    const [r, c] = cells.splice(j, 1)[0];
    board.push({ id: ++tileId, value: draw(), row: r, col: c, fresh: true });
  }
  tiles.value = board;
  nextTile.value = draw();
  phase.value = GAMING;
  score.value = 0;
  timerRef.value?.reset();
  save();
}

function tileStyle(tile) {
  // 绝对定位 % 基于 padding box（比内容盒宽 16px），
  // 牌宽 = (内容宽 - 3×gap)/4 = (100% - 40px)/4
  const pos = n => `calc(${n} * ((100% - 40px) / 4 + 8px) + 8px)`;
  return { left: pos(tile.col), top: pos(tile.row) };
}

// ---------- 存档 ----------

function save() {
  localStorage.setItem(STATE_KEY, JSON.stringify({
    tiles: tiles.value.map(({ row, col, value }) => ({ row, col, value })),
    next: nextTile.value,
    deck,
    score: score.value,
    time: timerRef.value?.seconds() || 0,
    phase: phase.value,
  }));
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY));
    if (!saved || !Array.isArray(saved.tiles) || !saved.tiles.length) return false;
    if (saved.phase === LOSE) return false;
    tiles.value = saved.tiles.map(t => ({ ...t, id: ++tileId }));
    deck = Array.isArray(saved.deck) ? saved.deck : [];
    nextTile.value = saved.next || draw();
    score.value = +saved.score || 0;
    phase.value = GAMING;
    timerRef.value?.restore(saved.time || 0);
    // 恢复即是死局（例如存档于结算前一步）→ 直接判负
    if (!canMove()) phase.value = LOSE;
    return true;
  } catch {
    return false;
  }
}

function onTimerTick() {
  if (phase.value !== GAMING) return;
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
    saved.time = timerRef.value?.seconds() || 0;
    localStorage.setItem(STATE_KEY, JSON.stringify(saved));
  } catch { /* 存档损坏时静默跳过，下一次 save() 会整体重写 */ }
}

function onScoreReset() {
  localStorage.removeItem(BEST_KEY);
  bestScore.value = 0;
}

// ---------- 滑动操作 ----------

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
@keyframes appear {
  from {
    transform: scale(0.3);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes bump {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.18); }
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
      gap: 4px;
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
    min-height: 64px;
    .opt-half {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
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
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-auto-rows: 1fr;
    gap: 8px;
    padding: 8px;
    box-sizing: border-box;
    aspect-ratio: 1;
    background: var(--board-bg);
    border-radius: var(--card-radius);
    .cell {
      border-radius: 8px;
      background: var(--cell-bg);
    }
  }
  .tile {
    position: absolute;
    width: calc((100% - 40px) / 4);
    height: calc((100% - 40px) / 4);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    font-weight: bold;
    transition: left 0.14s ease-in-out, top 0.14s ease-in-out;
    z-index: 1;
    &.fresh {
      animation: 0.16s ease-out appear;
    }
    &.merged {
      animation: 0.2s ease-in-out bump;
    }
    .tile-value {
      font-size: 24px;
    }
    &.v-1536 .tile-value, &.v-3072 .tile-value, &.v-6144 .tile-value {
      font-size: 19px;
    }
    .tile-score {
      position: absolute;
      top: 3px;
      right: 5px;
      font-size: 9px;
      font-weight: 600;
      opacity: 0.55;
    }
  }
  // 经典 Threes 配色：1 蓝、2 红、3 骨白起按色环推进，6144 黑色终极牌
  .tile, .next-tile {
    &.v-1 { background: #5A9BD8; color: #fff; }
    &.v-2 { background: #E0564E; color: #fff; }
    &.v-3 { background: #EFE9DC; color: #4A4238; }
    &.v-6 { background: #8FBE4E; color: #fff; }
    &.v-12 { background: #E7C24F; color: #4A4238; }
    &.v-24 { background: #E1903D; color: #fff; }
    &.v-48 { background: #D65C3B; color: #fff; }
    &.v-96 { background: #A65C9E; color: #fff; }
    &.v-192 { background: #5C68B5; color: #fff; }
    &.v-384 { background: #4E9AA8; color: #fff; }
    &.v-768 { background: #6F54A8; color: #fff; }
    &.v-1536 { background: #3A4A9E; color: #fff; }
    &.v-3072 { background: #303E7A; color: #fff; }
    &.v-6144 { background: #232323; color: #fff; }
  }
  .next-tile {
    width: 36px;
    height: 36px;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 17px;
    font-weight: bold;
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
    align-items: center;
    justify-content: center;
  }
}
</style>
