<template>
  <view class="screen" @touchstart="onTouchStart" @touchmove.stop.prevent="onTouchMove" @touchend="onTouchEnd" @touchcancel="onTouchCancel">
    <!-- 全站背景（粒子连线 + 底部过山车，与 web 的 ParticleBackground 同款） -->
    <ParticleBackground />
    <view class="page">
      <!-- 统计条：最高分 / 下一张 / 得分（与 web 的 score-area 三格一致） -->
      <view class="card score-area">
        <view class="stat">
          <text class="stat-label">{{ tt('bestScore') }}</text>
          <text class="stat-value">{{ bestScore }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('nextLabel') }}</text>
          <view class="next-tile" :class="'v-' + capValue(nextTile)"><text>{{ nextTile }}</text></view>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('score') }}</text>
          <text class="stat-value">{{ score }}</text>
        </view>
      </view>

      <!-- 操作区：计时 + 新游戏（与 web 的 opt-area 一致） -->
      <view class="card opt-area">
        <view class="opt-half">
          <view class="timer">
            <view class="timer-ico i-carbon-timer" />
            <text class="timer-txt">{{ timeText }}</text>
          </view>
        </view>
        <view class="divider" />
        <view class="opt-half">
          <button class="game-icon" @click="initGame">{{ tt('start') }}</button>
        </view>
      </view>

      <!-- 游戏区：4×4 棋盘；牌绝对定位，滑动 / 新牌 / 合并都有 transition 与缩放动画 -->
      <view class="board" :class="{ dragging }" :style="boardStyle">
        <view v-for="i in CELLS" :key="'bg-' + i" class="cell" :style="cellStyle(i - 1)" />
        <view
          v-for="tile in tiles"
          :key="tile.id"
          class="tile"
          :class="tileClass(tile)"
          :style="tileStyle(tile)"
        >
          <text class="tile-value">{{ tile.value }}</text>
          <text v-if="tile.value >= 3" class="tile-score">{{ tileScore(tile.value) }}</text>
        </view>

        <!-- 死局遮罩：与棋盘完全同尺寸（web 的 .result.lose） -->
        <view v-if="phase === LOSE" class="result lose">
          <text>{{ '👻👻 ' + tt('tipLost') + ' 👻👻' }}</text>
        </view>
      </view>
    </view>

    <!-- Threes 没有「赢」的状态：保留彩带格式，justWon 恒为 false（恢复存档也绝不置 true） -->
    <Confetti v-if="justWon" />
    <FloatingActions>
      <view class="fab" @click="showHelp"><view class="fab-ico i-carbon-help" /></view>
    </FloatingActions>
    <HelpSheet :open="helpOpen" :text="helpText" @close="helpOpen = false" />
  </view>
</template>

<script setup>
// Threes · 微信小程序版
// 逻辑从 web 版 src/games/three/ThreeGame.vue 原样搬过来（1+2=3 合成 / 牌堆预告 / 平衡补牌 /
// 两阶段滑动合成 / 死局判定 / 存档），只改三处平台差异：
// - 布局：web 用 grid + calc 百分比定位牌，这里改成 **rpx 固定棋盘**（702rpx，牌 157rpx，缝 14rpx），
//   不依赖 DOM 测量；
// - 交互：web 的 Pointer Events 跟手拖动换成小程序原生的 touchstart / touchend（阈值 20px，与 2048 一致）；
// - 存档 / 音效：localStorage → @/core/storage，Web Audio → @/core/sfx。
import { computed, onMounted, onUnmounted, ref } from 'vue';

import FloatingActions from '@/components/FloatingActions.vue';
import HelpSheet from '@/components/HelpSheet.vue';
import Confetti from '@/components/Confetti.vue';
import { getJSON, getRaw, setJSON, setRaw } from '@/core/storage';
import { playLose } from '@/core/sfx';
import { tt } from './i18n';
import { setNavTitle } from '@/core/i18n';
import ParticleBackground from '@/components/ParticleBackground.vue';

// 原生导航栏标题跟随语言（pages.json 里的标题是静态的）
setNavTitle(() => tt('gameTitle'));

// ---------- 存档 key：与 web 完全一致 ----------
const BEST_KEY = '__threes_game__best';
const STATE_KEY = '__threes_game__state';

// 经典 Threes：4×4；1+2=3，3 起相同数字翻倍合成；
// 得分 = 盘面各牌分值之和（1/2 记 0 分，3·2^k 记 3^(k+1)）
const SIZE = 4;
const [GAMING, LOSE] = [0, 1];

// 开局 / 恢复存档时的挨个入场动画：每张牌间隔 DEAL_STEP 毫秒依次弹出
const DEAL_STEP = 45;
const DEAL_STEP_FEW = 130;
const DEAL_MS = 280;
const DEAL_TAIL = 120;
// 两阶段移动：先整体滑到目标位（transition 140ms），140ms 后替换成合成牌并补新牌
const MOVE_MS = 140;

// ---------- 棋盘几何（rpx = web px × 750/393 ≈ 1.908；这里取整数保证 4 列严丝合缝）----------
// 702 = 16×2（内边距，web 8px）+ 157×4（牌）+ 14×3（缝，web 8px）
const BOARD = 702;
const PAD = 16;
const GAP = 14;
const TILE = 157;
const STEP = TILE + GAP;        // 一格间距 171rpx
const CELLS = SIZE * SIZE;      // 16 个底格

const tiles = ref([]);
const phase = ref(GAMING);
const score = ref(0);
const nextTile = ref(1);
const bestScore = ref(+(getRaw(BEST_KEY) || 0));
// Threes 没有胜利态：彩带恒不出现（保留 web 的 justWon 格式）
const justWon = ref(false);

// 计时器：web 用 shared/CountTimer.vue（图标 + MM:SS，每秒把秒数写回存档），这里内联实现
const seconds = ref(0);
let tickTimer = null;

let deck = [];
let tileId = 0;
let busy = false;
let dealing = false;
let dealTimer = null;
let moveTimer = null;
let dealStep = DEAL_STEP;

const timeText = computed(() => {
  const sec = seconds.value;
  return ('00' + ~~(sec / 60)).slice(-2) + ':' + ('00' + (sec % 60)).slice(-2);
});
const boardStyle = computed(() => ({ width: BOARD + 'rpx', height: BOARD + 'rpx' }));

// ---------- 计时 ----------
function startTick() {
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    seconds.value += 1;
    onTimerTick();
  }, 1000);
}
function stopTick() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
}
function resetTick() {
  stopTick();
  seconds.value = 0;
  startTick();
}

// 每秒只补写 time 字段（与 web 的 CountTimer onTick 同口径，避免整盘重写）
function onTimerTick() {
  if (phase.value !== GAMING) return;
  try {
    const saved = getJSON(STATE_KEY) || {};
    saved.time = seconds.value;
    setJSON(STATE_KEY, saved);
  } catch { /* 存档损坏时静默跳过，下一次 save() 会整体重写 */ }
}

// ---------- 牌堆（经典配比 12×1、12×2、4×3，抽空重洗）----------

// 盘面上 1 与 2 的个数差上限：超过就强制抽另一个，避免整盘全是 1 / 全是 2
const BALANCE = 4;

function countOn(board, value) {
  return board.reduce((n, t) => n + (t.value === value ? 1 : 0), 0);
}

function newDeck() {
  const d = [...Array(12).fill(1), ...Array(12).fill(2), ...Array(4).fill(3)];
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

// ---------- 移动（经典 Threes 语义：每张牌每次最多移动一格）----------

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
  moveTimer = setTimeout(() => {
    const sourceIds = new Set();
    mergeOps.forEach((m) => { sourceIds.add(m.aId); sourceIds.add(m.bId); });
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
      setRaw(BEST_KEY, score.value);
    }
    busy = false;
    if (!canMove()) {
      phase.value = LOSE;
      playLose();
      stopTick();
    }
    save();
  }, MOVE_MS);
}

// ---------- 局面 ----------

function initGame() {
  // 打断可能还在等的「落定 → 合成」回调，否则 140ms 后会用旧盘面覆盖新的一局
  clearTimeout(moveTimer);
  busy = false;
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
  resetTick();
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
    tiles.value = tiles.value.map((t) => {
      const c = { ...t };
      delete c.dealIdx;
      return c;
    });
  }, (tiles.value.length - 1) * dealStep + DEAL_MS + DEAL_TAIL);
}

// 棋盘几何（rpx 固定值，不依赖测量）
function cellStyle(idx) {
  const row = Math.floor(idx / SIZE);
  const col = idx % SIZE;
  return {
    width: TILE + 'rpx',
    height: TILE + 'rpx',
    left: PAD + col * STEP + 'rpx',
    top: PAD + row * STEP + 'rpx',
  };
}

// 拖动位移（rpx）：只给 dragMovers 里的牌，沿锁定方向（拖不动的牌返回 0）
function dragOffset(tile) {
  const movers = dragMovers.value;
  if (!movers || !movers.has(tile.id) || dragDist.value <= 0) return { left: 0, top: 0 };
  const [dr, dc] = DIRS[dragDir.value];
  const d = dragDist.value * pxToRpx.value;
  return { left: dc ? d * dc : 0, top: dr ? d * dr : 0 };
}

function tileStyle(tile) {
  const style = {
    width: TILE + 'rpx',
    height: TILE + 'rpx',
    // 跟手：只有「这一步会动」的牌沿锁定方向平移（最多一格），拖不动的牌留在原地
    left: PAD + tile.col * STEP + dragOffset(tile).left + 'rpx',
    top: PAD + tile.row * STEP + dragOffset(tile).top + 'rpx',
    };
  // 入场动画的逐张延迟（web 的 animationDelay）
  if (tile.dealIdx != null) style.animationDelay = tile.dealIdx * dealStep + 'ms';
  return style;
}

function tileClass(tile) {
  return [
    'v-' + capValue(tile.value),
    {
      merged: !!tile.merged,
      fresh: !!tile.fresh,
      dealt: tile.dealIdx != null,
      // 跟手拖动中会动的牌：抬高层级，**永远压在不动的那张上面**（web 的 .dragging）
      dragging: dragging.value && !!dragMovers.value && dragMovers.value.has(tile.id),
    },
  ];
}

// ---------- 存档 ----------

function save() {
  setJSON(STATE_KEY, {
    tiles: tiles.value.map(({ row, col, value }) => ({ row, col, value })),
    next: nextTile.value,
    deck,
    score: score.value,
    time: seconds.value,
    phase: phase.value,
  });
}

function restore() {
  try {
    const saved = getJSON(STATE_KEY);
    if (!saved || !Array.isArray(saved.tiles) || !saved.tiles.length) return false;
    // 失败局面同样恢复：退出再进来还是这盘死局，由玩家自己点「新游戏」开新的一局
    const wasLost = saved.phase === LOSE;
    tiles.value = saved.tiles.map(t => ({ ...t, id: ++tileId }));
    deck = Array.isArray(saved.deck) ? saved.deck : [];
    nextTile.value = saved.next || draw();
    score.value = +saved.score || 0;
    phase.value = wasLost ? LOSE : GAMING;
    // 计时器恢复：进行中接着走，死局停在最终用时（web 的 CountTimer.restore + stop）
    seconds.value = +saved.time || 0;
    if (phase.value === LOSE) stopTick();
    else startTick();
    // 恢复即是死局（例如存档于结算前一步）→ 直接判负
    if (!wasLost && !canMove()) {
      phase.value = LOSE;
      playLose();
      stopTick();
    }
    // 恢复出来的牌同样逐张入场（死局被结算浮层盖住，就不做了）
    if (phase.value !== LOSE) playDeal();
    return true;
  } catch {
    return false;
  }
}

// ---------- 帮助 ----------

const helpOpen = ref(false);
// 帮助文案：导语 + 各条（用空行分段，HelpSheet 会拆成段落）
const helpText = computed(() => {
  const parts = [];
  const keys = ['helpMsg'];
  for (let i = 1; i <= 10; i += 1) keys.push(`help${i}`);
  keys.forEach((k) => { const v = tt(k); if (v && v !== k) parts.push(v); });
  return parts.join('\n\n');
});
function showHelp() {
  helpOpen.value = true;
}

// ---------- 跟手滑动（严格照 web 的 ThreeGame：锁定方向 + dragState + dragMovers）----------
//   · 只有「这一步真的会动」的牌跟着手指走（dragMovers），拖不动 / 被边界挡住的牌原地不动；
//   · 沿锁定方向的净位移最多一格（clamp），所以牌会压在目标牌上 → 就是那个「覆盖」效果；
//   · 覆盖到 95% 不等松手，当场结算；松手时覆盖 ≥ 50% 才提交，否则弹回。
const DRAG_SLOP = 10;   // 与 web 一致       // 认定方向的最小位移（px）
const DRAG_MIN = 0.5;      // 松手提交阈值：覆盖半格
const DRAG_COMMIT = 0.95;  // 覆盖到 95% 当场结算
let sx = 0;
let sy = 0;
let tracking = false;
const pxToRpx = ref(2);    // 1px = ?rpx；onMounted 里按窗口宽度算（用 ref 才会触发 pitchPx 重算）
const dragDir = ref('');
const dragDist = ref(0);   // 已确认的拖动距离（px，沿锁定方向，0..pitch）

// 这一步真的会动的牌（web 的 dragMovers）：拖不动时是空集 → 牌不跟手、松手也不动
const dragMovers = computed(() => {
  const dir = dragDir.value;
  if (!dir) return null;
  const { placements, moved } = computeMove(dir);
  if (!moved) return new Set();
  const now = new Map(tiles.value.map((t) => [t.id, t]));
  const set = new Set();
  placements.forEach((p) => {
    const t = now.get(p.id);
    if (t && (t.row !== p.row || t.col !== p.col || t.col !== t.col)) set.add(p.id);
  });
  return set;
});
const dragging = computed(() => !!dragDir.value && dragDist.value > 0);
const pitchPx = computed(() => (STEP / pxToRpx.value));   // 一格在 px 里的长度

function resetDrag() {
  tracking = false;
  dragDir.value = '';
  dragDist.value = 0;
}

function onTouchStart(e) {
  const p = e.touches && e.touches[0];
  if (!p) return;
  tracking = true;
  dragDir.value = '';
  dragDist.value = 0;
  sx = p.clientX;
  sy = p.clientY;
}

function onTouchMove(e) {
  if (!tracking) return;
  const p = e.touches && e.touches[0];
  if (!p) return;
  const dx = p.clientX - sx;
  const dy = p.clientY - sy;
  if (!dragDir.value) {
    if (Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return;
    // 方向一旦认定就锁住，避免手指抖动时牌来回跳
    dragDir.value = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  }
  const [dr, dc] = DIRS[dragDir.value];
  const along = dx * dc + dy * dr;
  dragDist.value = Math.max(0, Math.min(along, pitchPx.value));
  if (along >= pitchPx.value * DRAG_COMMIT) finishDrag(true);
}

function finishDrag(forced) {
  const dir = dragDir.value;
  const dist = dragDist.value;
  resetDrag();   // 先撤跟手位移：提交时 move() 改 left/top 会从手指位置接着滑
  if (!dir || dist <= 0) return;
  if (forced || dist >= pitchPx.value * DRAG_MIN) move(dir);
}

function onTouchEnd() {
  if (!tracking) return;
  finishDrag(false);
}

function onTouchCancel() {
  resetDrag();   // 手势被打断：只弹回，不移动
}


// ---------- 生命周期 ----------

onMounted(() => {
  // 拖动位移是 px、牌位是 rpx：按窗口宽度换算一次（750rpx = 屏宽）
  try { pxToRpx.value = 750 / (uni.getSystemInfoSync().windowWidth || 375); } catch { pxToRpx.value = 2; }
  // 恢复存档（含失败局面）→ 没有存档才开新局；两者都会走到 playDeal 的逐张入场
  if (!restore()) initGame();
});

onUnmounted(() => {
  stopTick();
  clearTimeout(dealTimer);
  clearTimeout(moveTimer);
  save();
});
</script>

<style lang="scss" scoped>
/* 外层普通 block：min-height 只在这一处（.page 不再写，避免 200vh 白滚） */
.screen {
  min-height: 100vh;
  background: transparent;  /* 背景交给 ParticleBackground（canvas 自己铺底色） */
}
.page {
  padding: 36rpx 24rpx 140rpx;   /* 底部 140rpx 让开右下角悬浮按钮 */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 36rpx;                    /* web 的 --row-gap: 16px */
  background: #f0f2f5;
}

/* ---------- 统计条 / 操作区（高度由 App.vue 的全局 .score-area / .opt-area 统一给）---------- */
.score-area,
.opt-area {
  width: 702rpx;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}
.stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8rpx;                     /* web 的 gap: 4px */
}
.stat-label {
  font-size: 23rpx;              /* 12px */
  color: #5f6b7a;
}
.stat-value {
  font-size: 42rpx;              /* 22px */
  font-weight: bold;
  line-height: 1.2;
}
.divider {
  width: 2rpx;                   /* 1px */
  height: 46rpx;                 /* 24px */
  align-self: center;
  background: #e1e1e1;
  opacity: 0.6;
}
.opt-half {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 计时（web 的 CountTimer：图标 + MM:SS，14px / 600） */
.timer {
  display: flex;
  align-items: center;
  gap: 11rpx;                    /* 6px */
  font-size: 27rpx;              /* 14px */
  font-weight: 600;
}
.timer-ico { pointer-events: none; }
.timer-txt { font-variant-numeric: tabular-nums; }

/* 操作按钮：web 的 .game-icon（padding 8px 16px / 14px 字 / 8px 圆角） */
.game-icon {
  margin: 0;
  padding: 0 31rpx;
  height: 74rpx;
  line-height: 74rpx;
  border: 0;
  border-radius: 15rpx;
  background: #23804e;
  color: #fff;
  font-size: 27rpx;
  font-weight: bold;
  white-space: nowrap;
  box-sizing: border-box;
}

/* ---------- 棋盘（702rpx，牌 157rpx，内边距 16rpx，缝 14rpx）---------- */
.board {
  position: relative;
  box-sizing: border-box;
  border-radius: 27rpx;
  background: #bbada0;
  /* 不写 overflow:hidden：web 的 .grid 也没有，合并牌的 bump 放大可以略微探出棋盘边 */
}
/* 底格与牌的宽高由 cellStyle() / tileStyle() 按 JS 常量给（702 / 157 / 16 / 14） */
.cell {
  position: absolute;
  border-radius: 15rpx;
  background: rgba(238, 228, 218, 0.35);
}
.tile {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 15rpx;
  font-weight: bold;
  /* 滑动过渡（web 的 transition: left .14s, top .14s）*/
  transition: left 0.14s ease-in-out, top 0.14s ease-in-out;
  z-index: 1;
}
/* 新牌弹入 0.16s / 合并弹跳 0.2s / 开局逐张入场 0.28s（backwards 保证轮到自己前先隐身）*/
.tile.fresh {
  animation: appear 0.16s ease-out;
}
.tile.merged {
  animation: bump 0.2s ease-in-out;
}
.tile.dealt {
  animation: appear 0.28s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
}
.tile-value {
  font-size: 46rpx;              /* 24px */
}
.tile.v-1536 .tile-value,
.tile.v-3072 .tile-value,
.tile.v-6144 .tile-value {
  font-size: 36rpx;              /* 19px */
}
.tile-score {
  position: absolute;
  top: 6rpx;                     /* 3px */
  right: 10rpx;                  /* 5px */
  font-size: 19rpx;              /* 10px */
  font-weight: 600;
  opacity: 0.78;
}

/* 经典 Threes 配色：1 蓝、2 红、3 骨白起按色环推进，6144 黑色终极牌。
   文字色按底色明度在「白 / 深棕 #4A4238」之间切换（与 web 一致） */
.tile.v-1, .next-tile.v-1 { background: #5694d1; color: #fff; }
.tile.v-2, .next-tile.v-2 { background: #e0564e; color: #fff; }
.tile.v-3, .next-tile.v-3 { background: #efe9dc; color: #4a4238; }
.tile.v-6, .next-tile.v-6 { background: #8fbe4e; color: #4a4238; }
.tile.v-12, .next-tile.v-12 { background: #e7c24f; color: #4a4238; }
.tile.v-24, .next-tile.v-24 { background: #e1903d; color: #4a4238; }
.tile.v-48, .next-tile.v-48 { background: #d65c3b; color: #fff; }
.tile.v-96, .next-tile.v-96 { background: #a65c9e; color: #fff; }
.tile.v-192, .next-tile.v-192 { background: #5c68b5; color: #fff; }
.tile.v-384, .next-tile.v-384 { background: #4e9aa8; color: #fff; }
.tile.v-768, .next-tile.v-768 { background: #6f54a8; color: #fff; }
.tile.v-1536, .next-tile.v-1536 { background: #3a4a9e; color: #fff; }
.tile.v-3072, .next-tile.v-3072 { background: #303e7a; color: #fff; }
.tile.v-6144, .next-tile.v-6144 { background: #232323; color: #fff; }

/* 统计条里的「下一张」小牌：36px 见方 / 19px 粗体 / 8px 圆角 */
.next-tile {
  width: 69rpx;
  height: 69rpx;
  border-radius: 15rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36rpx;              /* 19px */
  font-weight: bold;
}

/* 死局遮罩：与棋盘矩形完全重合（web 的 .result.lose）*/
.result {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 27rpx;
  background: rgba(255, 255, 255, 0.8);
  font-weight: bold;
  font-size: 34rpx;              /* 18px */
}
.result.lose { color: #b11; }

@keyframes appear {
  from { transform: scale(0.3); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
@keyframes bump {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.18); }
}
  /* 跟手拖动期间不要过渡（否则牌会追不上手指）—— 放在最后，权重也够 */
  .board.dragging .tile { transition: none !important; }
  /* 会动的牌压到最上面（web: z-index 1 → 2 + 阴影），否则会被不动的牌挡住 */
  .tile.dragging {
    z-index: 2 !important;
    box-shadow: 0 6rpx 14rpx rgba(0, 0, 0, 0.22);
  }
</style>
