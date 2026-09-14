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
          :class="[`v-${capValue(tile.value)}`, { merged: tile.merged, fresh: tile.fresh, dealt: tile.dealIdx != null }]"
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
import CountTimer from '@/shared/CountTimer.vue';
import { i18n } from '@/shared/i18n';

// 经典 Threes：4×4；1+2=3，3 起相同数字翻倍合成；
// 得分 = 盘面各牌分值之和（1/2 记 0 分，3·2^k 记 3^(k+1)）
const SIZE = 4;
const [GAMING, LOSE] = [0, 1];
const BEST_KEY = '__threes_game__best';
const STATE_KEY = '__threes_game__state';
// 开局 / 恢复存档时的挨个入场动画：每张牌间隔 DEAL_STEP 毫秒依次弹出
const DEAL_STEP = 45;
const DEAL_STEP_FEW = 130;
const DEAL_MS = 280;
const DEAL_TAIL = 120;

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
let dealing = false;
let dealTimer = null;
let dealStep = DEAL_STEP;

onMounted(() => {
  if (!restore()) initGame();
  window.addEventListener('keyup', onKeyUp);
});

onUnmounted(() => {
  window.removeEventListener('keyup', onKeyUp);
  clearTimeout(dealTimer);
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

// 盘面上 1 与 2 的个数差上限：超过就强制抽另一个，避免整盘全是 1 / 全是 2
const BALANCE = 4;

function countOn(board, value) {
  return board.reduce((n, t) => n + (t.value === value ? 1 : 0), 0);
}

function newDeck() {
  const d = [...Array(12).fill(1), ...Array(12).fill(2), ...Array(12 * 0 + 4).fill(3)];
  for (let i = d.length - 1; i > 0; i--) {
    const j = ~~(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// 抽牌。board 传「这张牌将要落上去的盘面」：
// 新开局时传正在拼装的板子，移动时传补牌后的盘面，这样平衡约束在两种情况都成立
function draw(board = tiles.value) {
  if (!deck.length) deck = newDeck();
  let want = 0;
  const ones = countOn(board, 1);
  const twos = countOn(board, 2);
  if (ones - twos >= BALANCE) want = 2;
  else if (twos - ones >= BALANCE) want = 1;
  if (!want) return deck.pop();
  // 牌堆里恰好没有想要的数字时补一张进去，保证一定拿得到
  let idx = deck.lastIndexOf(want);
  if (idx < 0) {
    deck.push(want);
    idx = deck.length - 1;
  }
  return deck.splice(idx, 1)[0];
}

// 落牌前的兜底校正：预告的数值若会打破平衡，就换成另一个（原值塞回牌堆）
function balancedValue(value, board) {
  if (value !== 1 && value !== 2) return value;
  const ones = countOn(board, 1);
  const twos = countOn(board, 2);
  if (value === 1 && ones - twos >= BALANCE) {
    deck.push(1);
    return 2;
  }
  if (value === 2 && twos - ones >= BALANCE) {
    deck.push(2);
    return 1;
  }
  return value;
}

// 新牌落点：永远从「滑动的来源侧」那一行/列加入（向右滑 = 牌往右走 = 从最左一列进），
// 该边已满时退到离该侧最近的一条线，仍然贴着来源方向
function spawnCell(dir, board) {
  const empty = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!board.some(t => t.row === r && t.col === c)) empty.push([r, c]);
    }
  }
  if (!empty.length) return null;
  // 到「来源侧」的距离：向右滑时最左列（c=0）距离 0，其余方向同理
  const depth = ([r, c]) => {
    if (dir === 'right') return c;
    if (dir === 'left') return SIZE - 1 - c;
    if (dir === 'down') return r;
    return SIZE - 1 - r;
  };
  const min = Math.min(...empty.map(depth));
  const pool = empty.filter(p => depth(p) === min);
  return pool[~~(Math.random() * pool.length)];
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
  if (phase.value !== GAMING || busy || dealing) return;
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
    // 补进一张新牌：位置永远是「滑动的来源侧」边缘（向右滑就从最左一列进）
    const [r, c] = spawnCell(dir, next) || [];
    if (r !== undefined) {
      const value = balancedValue(nextTile.value, next);
      next.push({ id: ++tileId, value, row: r, col: c, fresh: true });
      nextTile.value = draw(next);
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
    // 逐张抽出、逐张计入 board，开局的 9 张牌同样满足 1/2 平衡
    const value = draw(board);
    board.push({ id: ++tileId, value, row: r, col: c, fresh: true });
  }
  tiles.value = board;
  nextTile.value = draw(board);
  phase.value = GAMING;
  score.value = 0;
  timerRef.value?.reset();
  playDeal();
  save();
}

// 挨个入场：按「先上后下、从左到右」的顺序给每张牌排一个延迟，
// 靠 CSS animationDelay + backwards 填充实现逐张弹出（新开局与恢复存档都走这里）
function playDeal() {
  if (!tiles.value.length) return;
  clearTimeout(dealTimer);
  dealing = true;
  // 牌很少时（例如恢复到只剩两三张的残局）放慢节奏，避免看起来是同时出现
  dealStep = tiles.value.length <= 4 ? DEAL_STEP_FEW : DEAL_STEP;
  const rank = new Map();
  [...tiles.value]
    .sort((a, b) => (a.row - b.row) || (a.col - b.col))
    .forEach((t, i) => rank.set(t.id, i));
  // fresh 也一并清掉：入场动画由 dealt 接管，否则动画结束后会再弹一次
  tiles.value = tiles.value.map(t => ({ ...t, fresh: false, dealIdx: rank.get(t.id) }));
  dealTimer = setTimeout(() => {
    dealing = false;
    tiles.value = tiles.value.map(({ dealIdx, ...t }) => t);
  }, (tiles.value.length - 1) * dealStep + DEAL_MS + DEAL_TAIL);
}

function tileStyle(tile) {
  // 绝对定位 % 基于 padding box（比内容盒宽 16px），
  // 牌宽 = (内容宽 - 3×gap)/4 = (100% - 40px)/4
  const pos = n => `calc(${n} * ((100% - 40px) / 4 + 8px) + 8px)`;
  return {
    left: pos(tile.col),
    top: pos(tile.row),
    ...(tile.dealIdx != null ? { animationDelay: `${tile.dealIdx * dealStep}ms` } : null),
  };
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
    // 失败局面同样恢复：退出再进来还是这盘死局，由玩家自己点「新游戏」开新的一局
    const wasLost = saved.phase === LOSE;
    tiles.value = saved.tiles.map(t => ({ ...t, id: ++tileId }));
    deck = Array.isArray(saved.deck) ? saved.deck : [];
    nextTile.value = saved.next || draw();
    score.value = +saved.score || 0;
    phase.value = wasLost ? LOSE : GAMING;
    timerRef.value?.restore(saved.time || 0);
    // 恢复的若是失败局面，计时器停在最终用时（CountTimer.restore 会重新启动计时）
    if (phase.value === LOSE) timerRef.value?.stop();
    // 恢复即是死局（例如存档于结算前一步）→ 直接判负
    if (!wasLost && !canMove()) phase.value = LOSE;
    // 恢复出来的牌同样逐张入场（死局被结算浮层盖住，就不做了）
    if (phase.value !== LOSE) playDeal();
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
    height: var(--row-height);
    .stat {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
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
    margin: var(--row-gap) 0;
    height: var(--row-height);
    .opt-half {
      flex: 1;
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
    // 开局 / 恢复存档：按行列顺序逐张弹出（间隔由 animationDelay 控制，
    // backwards 填充保证轮到自己之前先隐身）
    &.dealt {
      animation: 0.28s cubic-bezier(0.34, 1.56, 0.64, 1) backwards appear;
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
      font-size: 10px;
      font-weight: 600;
      opacity: 0.78;
    }
  }
  // 经典 Threes 配色：1 蓝、2 红、3 骨白起按色环推进，6144 黑色终极牌。
  // 文字色按底色明度在「白 / 深棕 #4A4238」之间切换——1/6/24 这几档原来用白字
  // 只有 2.2~2.95:1，是这一屏里最糊的地方
  .tile, .next-tile {
    &.v-1 { background: #5694d1; color: #fff; }
    &.v-2 { background: #E0564E; color: #fff; }
    &.v-3 { background: #EFE9DC; color: #4A4238; }
    &.v-6 { background: #8FBE4E; color: #4A4238; }
    &.v-12 { background: #E7C24F; color: #4A4238; }
    &.v-24 { background: #E1903D; color: #4A4238; }
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
    border-radius: var(--radius-tile);
    display: flex;
    align-items: center;
    justify-content: center;
    // 19px 粗体才算 WCAG 的「大号文字」（阈值 3:1），17px 时白字档位要求 4.5:1 会不达标
    font-size: 19px;
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
