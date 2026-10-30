<template>
  <view class="screen" @touchstart="onTouchStart" @touchend="onTouchEnd">
    <!-- 全站背景（粒子连线 + 底部过山车，与 web 的 ParticleBackground 同款） -->
    <ParticleBackground />
    <view class="page">
    <!-- 分数区：只放最高分 / 分数（与 web 的 score-area 一致） -->
    <view class="card score-area">
      <view class="stat">
        <text class="label">🏆 {{ t('best') }}</text>
        <text class="value">{{ bestScore }}</text>
      </view>
      <view class="divider" />
      <view class="stat">
        <text class="label">✨ {{ t('score') }}</text>
        <text class="value">{{ score }}</text>
      </view>
    </view>

    <!-- 操作区：计时 + 新游戏（与 web 的 opt-area 一致） -->
    <view class="card opt-area">
      <view class="opt-half">
        <text class="timer">{{ timeText }}</text>
      </view>
      <view class="divider" />
      <view class="opt-half">
        <button class="btn" @click="initGame">{{ t('start') }}</button>
      </view>
    </view>

    <view class="board" :style="boardStyle">
      <view v-for="i in 16" :key="'bg-' + i" class="cell" :style="cellStyle(i - 1)" />
      <!-- 与 threes 同一套渲染模型：**只有 tiles 一份数据**，没有幽灵、没有隐身标记。
           滑动 = 现有牌换格（transition）；落定后再换成合并牌（.merged 弹一下）+ 补新牌（.fresh） -->
      <view
        v-for="tile in tiles"
        :key="tile.id"
        class="tile"
        :class="['v-' + vClass(tile.value), {
          merged: tile.merged,
          fresh: tile.fresh,
          dealt: tile.dealIdx != null,
        }]"
        :style="tileStyle(tile)"
      >
        <text class="tile-text" :style="{ fontSize: fontSize(tile.value) + 'rpx' }">{{ tile.value }}</text>
      </view>

      <view v-if="gameResult === WIN" class="result win">
        <text class="result-title">{{ t('win') }}</text>
        <text v-if="newBest" class="result-sub">{{ t('newBest') }}</text>
        <button class="btn" @click="keepGoing">{{ t('keepGoing') }}</button>
      </view>
      <view v-else-if="gameResult === LOSE" class="result lose">
        <text class="result-title">{{ t('lose') }}</text>
        <text class="result-sub">{{ t('score') }} {{ score }}</text>
      </view>
    </view>

    </view>
    <!-- 胜利彩带（纯 CSS 降级版，web 是 confetti canvas） -->
    <Confetti v-if="justWon" />
    <FloatingActions>
      <view class="fab" @click="showHelp"><view class="fab-ico i-carbon-help" /></view>
    </FloatingActions>
    <HelpSheet :open="helpOpen" :text="t('helpG2048')" @close="helpOpen = false" />
  </view>
</template>

<script setup>
// 2048 · 微信小程序版
// 逻辑照 web 版 src/games/g2048/Game2048.vue 搬（移动 / 合并 / 新牌 / 逐张入场 / 胜负 / 存档），
// **动画也照 web 一条一条抄**：
// - 移动：存活牌靠 `transition: left/top 0.13s ease-in-out` 滑过去（web 同款曲线与时长）；
// - 合并：合并牌是**新牌**（新 id，滑行期间 `merging` → opacity 0 隐身），被吃掉的两张各留一个
//   **幽灵**（同一个 id，所以复用原来的节点）从原格滑到目标格；滑行结束后才摘掉 merging、
//   给合并牌 `popping`（merge-pop 0.5 → 1.16 → 1 且淡入，0.19s ease-out）；
// - 新牌：`spawnTile(true)` 打 `isNew`，CSS 用 `animation-delay` 等滑行结束（0.13s）再缩放淡入，
//   所以**不会在滑动一开始就冒出来**；
// - 开局 / 恢复存档：`playDeal()` 给每张牌排一个 `dealIdx`，`.tile.dealt` 用
//   `animation-delay` + `backwards` 逐张弹出（web 同款，`DEAL_STEP_FEW = 140` 给 2 张牌的开局）。
// 与 web 的三处平台差异：
// 1. 布局改成 **rpx 固定棋盘**（660rpx，每格 165rpx，缝 8rpx），不依赖 DOM 测量；
// 2. 交互从 Pointer Events 换成小程序原生的 touchstart / touchend，键盘（方向键）不存在；
// 3. web 用 `void el.offsetWidth` 强制重排来锚定「幽灵在原位」这个过渡起点，小程序没有这个 API。
//    这里改用**两段式**：`await nextTick()`（数据提交）→ **再等两帧**（视图层真的画完原位这一帧）
//    → 才把幽灵挪到目标格。而且合并的落定计时**从幽灵开始滑那一刻**算起（web 从 move() 起算，
//    因为它的强制重排就在同一个 tick 里，二者等价）——详见 flipGhosts() / settle() 的注释。
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

import FloatingActions from '@/components/FloatingActions.vue';
import HelpSheet from '@/components/HelpSheet.vue';

import { t, setNavTitle } from '@/core/i18n';
import { getJSON, getRaw, setJSON, setRaw } from '@/core/storage';
import { playLose, playWin } from '@/core/sfx';
import Confetti from '@/components/Confetti.vue';
import ParticleBackground from '@/components/ParticleBackground.vue';

// 原生导航栏标题跟随语言（pages.json 里的标题是静态的）
setNavTitle(() => t('g2048'));

const SIZE = 4;
const WIN_VAL = 2048;
const [GAMING, WIN, LOSE] = [0, 1, 2];
const BEST_KEY = '__game_2048__best';
const STATE_KEY = '__game_2048__state';

// 棋盘尺寸（rpx）：660 = 165×4，牌 157（留 8rpx 缝，四周 4rpx 内边距）
const BOARD = 660;
const STEP = 165;
const TILE = 157;
const PAD = 4;

// 动画节奏（全部对 web，逐项同名同值）：
// - DEAL_STEP 45 / DEAL_STEP_FEW 140 / DEAL_MS 280 / DEAL_TAIL 120 = 逐张入场的节奏
// - MOVE_MS 130 = web 的 `.tile { transition: left/top 0.13s ease-in-out }`
// - POP_MS  190 = web 的 `.tile.popping { animation: 0.19s ease-out merge-pop }`
// 小程序自己的一条：没有 requestAnimationFrame，用 16ms 定时器代表一帧；
// 幽灵的 FLIP 第二段要等 **2 帧**（见 flipGhosts）。
const DEAL_STEP = 45;
const DEAL_STEP_FEW = 140;
const DEAL_MS = 280;
const DEAL_TAIL = 120;
const MOVE_MS = 130;
const POP_MS = 190;

const score = ref(0);
const bestScore = ref(+(getRaw(BEST_KEY) || 0));
const gameResult = ref(GAMING);
// 彩带只在真正赢下的那一刻放：恢复存档的胜利态不放（与 web 一致）
const justWon = ref(false);
let wonTimer = 0;
const newBest = ref(false);
// tiles 只放**局面**（每张都是真实存在的牌）。
const tiles = ref([]);
// 合并掉的那两张：仍然渲染（保持同一个 id → 复用原来的 DOM 节点，所以能从原格滑到目标格），
// 落定后由合并出来的新牌顶替。**不能塞进 tiles** —— tiles 是局面状态，
// 会被存档 watch 与 emptyCells/checkLose 读，多出来的牌会让局面错乱（web 同款约定）
// 合并弹跳：按 id 存在 Set 里，不写进 tiles 的对象（web 同款）

const seconds = ref(0);
let tileId = 0;
let winShown = false;
// 逐张入场期间禁止移动（web 同款；否则会在发牌动画中途插一手，dealIdx 与 popping 打架）
let dealing = false;
let busy = false;      // 动画中不接受滑动（落定回调里放开，另有看门狗兜底）
let dealStep = DEAL_STEP;
let dealTimer = null;
let tickTimer = null;
let moveTimer = null;
let busyWatchdog = null;
let popTimer = null;
// 每次移动 / 新开局自增：幽灵的 FLIP 第二段（跨了两帧的异步）靠它判断
// 「这一步是否已经被新的一步取代 / 页面是否已经卸载」
let moveSeq = 0;

const boardStyle = computed(() => ({ width: BOARD + 'rpx', height: BOARD + 'rpx' }));
const timeText = computed(() => {
  const m = Math.floor(seconds.value / 60);
  const s = seconds.value % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
});

const cellStyle = (idx) => {
  const row = Math.floor(idx / SIZE);
  const col = idx % SIZE;
  return {
    width: TILE + 'rpx',
    height: TILE + 'rpx',
    left: col * STEP + PAD + 'rpx',
    top: row * STEP + PAD + 'rpx',
  };
};

// 幽灵的 row/col 就是「当前要画在哪」：先原格、下一拍改成目标格；未落定的合并牌靠 merging 隐身
const tileStyle = (tile) => ({
  width: TILE + 'rpx',
  height: TILE + 'rpx',
  left: tile.col * STEP + PAD + 'rpx',
  top: tile.row * STEP + PAD + 'rpx',
  // 逐张入场的错峰延迟（与 web 的 tileStyle 完全一致）
  ...(tile.dealIdx != null ? { animationDelay: `${tile.dealIdx * dealStep}ms` } : null),
});

// 数字越大字号越小，避免 4 位数撑破格子
const fontSize = (v) => (v < 100 ? 72 : v < 1000 ? 56 : v < 10000 ? 44 : 36);
const vClass = (v) => (v > 2048 ? 2048 : v);
// 模板里用函数而不是直接 `popping.has(...)`：不同运行时对 ref 解包 .has 的表现不一致（crush 也踩过）

function save() {
  setJSON(STATE_KEY, {
    tiles: tiles.value.map(({ row, col, value }) => ({ row, col, value })),
    score: score.value,
    time: seconds.value,
    result: gameResult.value,
    winShown,
  });
}

function clearTimers() {
  clearTimeout(moveTimer);
  clearTimeout(popTimer);
  moveTimer = null;
  popTimer = null;
}

function restore() {
  const saved = getJSON(STATE_KEY);
  if (!saved || !Array.isArray(saved.tiles) || !saved.tiles.length) return false;
  // 存档不含 id，恢复时重新分配（:key 依赖 id，缺 id 会让移动动画错乱）
  tiles.value = saved.tiles.map(x => ({ ...x, id: ++tileId }));
  dealing = false;
  score.value = Math.max(...saved.tiles.map(x => x.value));
  seconds.value = +saved.time || 0;
  winShown = Boolean(saved.winShown);
  gameResult.value = saved.result === LOSE ? LOSE : GAMING;
  return true;
}

function emptyCells() {
  const occupied = new Set(tiles.value.map(x => `${x.row},${x.col}`));
  const cells = [];
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (!occupied.has(`${row},${col}`)) cells.push([row, col]);
    }
  }
  return cells;
}

// fresh = 局中新生成的牌：靠 CSS 的 animation-delay 等滑行结束再淡入
// （开局那两张走 playDeal 的逐张入场，这条不参与，否则两个 animation 会互相顶掉）
function spawnTile(fresh = false) {
  const cells = emptyCells();
  if (!cells.length) return;
  const [row, col] = cells[Math.floor(Math.random() * cells.length)];
  tiles.value.push({
    id: ++tileId,
    row,
    col,
    value: Math.random() < 0.9 ? 2 : 4,
    fresh,
  });
}

// 逐张入场：按「先上后下、从左到右」的顺序给每张牌排一个延迟，
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
    .forEach((x, i) => rank.set(x.id, i));
  tiles.value = tiles.value.map(x => ({ ...x, dealIdx: rank.get(x.id) }));
  dealTimer = setTimeout(() => {
    dealing = false;
    tiles.value = tiles.value.map(({ dealIdx, ...x }) => x);
  }, (tiles.value.length - 1) * dealStep + DEAL_MS + DEAL_TAIL);
}

function initGame() {
  // 打断可能还在等的动画回调：否则旧回调会清掉新一局的幽灵 / 改动新一局的对象
  moveSeq += 1;
  clearTimers();
  clearTimeout(dealTimer);
  gameResult.value = GAMING;
  newBest.value = false;
  winShown = false;
  dealing = false;
  tiles.value = [];
  seconds.value = 0;
  spawnTile();
  spawnTile();
  score.value = Math.max(...tiles.value.map(x => x.value));
  playDeal();
  save();
  startTick();
}

function startTick() {
  stopTick();
  tickTimer = setInterval(() => {
    if (gameResult.value === LOSE) return;
    seconds.value += 1;
    save();
  }, 1000);
}
function stopTick() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
}

// 按移动方向生成 4 条线，每条线从「移动目标侧」开始
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
  const map = {};
  tiles.value.forEach(x => { map[`${x.row},${x.col}`] = x; });
  const placements = new Map();     // id -> { row, col }：这一步每张牌要滑到哪
  const mergeOps = [];              // { ids: [a, b], value, row, col }
  let moved = false;

  linesOf(dir).forEach((line) => {
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
      const [row, col] = line[idx];
      const [first, second] = group;
      if (first.row !== row || first.col !== col) moved = true;
      if (second) {
        moved = true;
        // 与 threes 同一套：两张都滑到目标格（叠在一起），落定后再换成一张合并牌
        placements.set(first.id, { row, col });
        placements.set(second.id, { row, col });
        mergeOps.push({ ids: [first.id, second.id], value: first.value * 2, row, col });
      } else {
        placements.set(first.id, { row, col });
      }
    });
  });

  if (!moved) return;
  busy = true;
  moveSeq += 1;
  const seq = moveSeq;
  clearTimers();
  // 兜底：落定之后 120ms 还没放开 busy 就强制放开（被打断的落定回调不会让棋盘卡住）。
  // ⚠️ 这个值不能大：正常节奏下玩家 ~200ms 就滑下一次，太长会「点了没反应」。
  if (busyWatchdog) clearTimeout(busyWatchdog);
  busyWatchdog = setTimeout(() => { busy = false; }, MOVE_MS + 120);

  // ① 第一阶段：现有牌**换格**（id 不变 → 复用节点 → transition 有起点，绝不会闪 / 消失）
  tiles.value = tiles.value.map((t) => {
    const pos = placements.get(t.id);
    return pos
      ? { ...t, row: pos.row, col: pos.col, merged: false, fresh: false }
      : { ...t, merged: false, fresh: false };
  });
  save();   // 第一阶段就落盘：中途刷新时盘面是「已滑到位」的状态，不会和屏幕上看到的不一致
  score.value = Math.max(...tiles.value.map(x => x.value));
  if (score.value > bestScore.value) {
    bestScore.value = score.value;
    setRaw(BEST_KEY, score.value);
    newBest.value = true;
  }

  // ② 第二阶段（滑行结束）：被合并的两张消失 → 生成合并牌（新 id → .merged 弹一下）→ 补一张新牌
  moveTimer = setTimeout(() => {
    if (seq !== moveSeq) return;
    busy = false;
    const eaten = new Set();
    mergeOps.forEach(m => m.ids.forEach(id => eaten.add(id)));
    const next = tiles.value.filter(t => !eaten.has(t.id)).map(t => ({ ...t, merged: false, fresh: false }));
    mergeOps.forEach((m) => {
      next.push({ id: ++tileId, value: m.value, row: m.row, col: m.col, merged: true });
    });
    tiles.value = next;
    spawnTile(true);
    save();
    busy = false;
    if (!winShown && tiles.value.some(x => x.value >= WIN_VAL)) {
      winShown = true;
      gameResult.value = WIN;
      justWon.value = true;
      clearTimeout(wonTimer);
      wonTimer = setTimeout(() => { justWon.value = false; }, 4000);
      playWin();
      save();
    }
    checkLose();
  }, MOVE_MS);
}

function checkLose() {
  if (emptyCells().length) return;
  const map = {};
  tiles.value.forEach(x => { map[`${x.row},${x.col}`] = x.value; });
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const val = map[`${row},${col}`];
      if (val === map[`${row},${col + 1}`] || val === map[`${row + 1},${col}`]) return;
    }
  }
  gameResult.value = LOSE;
  stopTick();
  playLose();
  save();
}

function keepGoing() {
  gameResult.value = GAMING;
  startTick();
}

// 小程序：touchstart / touchend，阈值 20px，方向取 |dx| / |dy| 较大者
let sx = 0;
let sy = 0;
let tracking = false;
function onTouchStart(e) {
  const p = e.touches && e.touches[0];
  if (!p) return;
  tracking = true;
  sx = p.clientX;
  sy = p.clientY;
}
function onTouchEnd(e) {
  if (!tracking) return;
  tracking = false;
  const p = (e.changedTouches && e.changedTouches[0]) || null;
  if (!p) return;
  const dx = p.clientX - sx;
  const dy = p.clientY - sy;
  if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
  if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
  else move(dy > 0 ? 'down' : 'up');
}

onMounted(() => {
  const ok = restore();
  if (!ok) {
    initGame();
  } else if (gameResult.value !== LOSE) {
    // 恢复出来的牌逐张入场（与 web 一致；失败局面被结算浮层盖住，就不做了，也不计时）
    playDeal();
    startTick();
  }
});
onUnmounted(() => {
  moveSeq += 1;
  stopTick();
  clearTimers();
  clearTimeout(dealTimer);
});

// 每步落定后落档
watch(tiles, () => save(), { deep: true });

const helpOpen = ref(false);

function showHelp() {
  helpOpen.value = true;
}
</script>

<style lang="scss" scoped>
/* 外层普通 block：header 在这一层，不受 .page 的 flex/align-items 影响，永远贴右边 */
.screen {
  min-height: 100vh;
  background: transparent;  /* 背景交给 ParticleBackground（canvas 自己铺底色） */
}
.page {
  padding: 36rpx 24rpx 48rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 36rpx;                  /* web 的 --row-gap: 16px */
  background: #f0f2f5;
}
.score-area {
  width: 660rpx;
  display: flex;
  align-items: center;
  padding: 0 23rpx;
}
.stat { flex: 1; display: flex; flex-direction: column; align-items: center; }
.stat > .label { font-size: 22rpx; color: #8a8f99; }
.stat > .value { font-size: 40rpx; font-weight: 800; color: #23804e; margin-top: 2rpx; }
.divider { width: 2rpx; height: 48rpx; background: #e6e8eb; }
.opt-area {
  width: 660rpx;
  display: flex;
  align-items: center;
  padding: 0 23rpx;
}
.opt-half {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.opt-area > .divider {
  width: 2rpx;
  height: 46rpx;
  background: #e1e1e1;
}
.timer { font-size: 34rpx; font-weight: 800; color: #333; letter-spacing: 1rpx; }
.btn {
  margin: 0;
  padding: 0 28rpx;
  height: 72rpx;
  line-height: 72rpx;
  background: #23804e;
  color: #fff;
  font-size: 26rpx;
  font-weight: 700;
}
.board {
  position: relative;
  border-radius: 27rpx;
  /* 必须裁切：棋盘圆角 27rpx 而牌只内缩 4rpx，四角的格子会戳到圆角外面。
     代价是合并牌 merge-pop 放大到 1.16 时在棋盘最外圈会被裁掉几 rpx（web 的 .grid 不裁切） */
  overflow: hidden;
  background: #bbada0;
}
.cell {
  position: absolute;
  border-radius: 12rpx;
  background: rgba(238, 228, 218, 0.35);
}
.tile {
  position: absolute;
  border-radius: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #eee4da;
  color: #776e65;
  font-weight: 800;
  /* 时长 / 曲线与 web 的 `.tile` 完全一致（JS 的 MOVE_MS 必须等于 0.13s） */
  transition: left 0.13s ease-in-out, top 0.13s ease-in-out;
  z-index: 1;
}
/* 合并出来的牌：落定时是新 id（新建节点）→ .merged 走一次 bump（0.19s ease-out，与 web 的 merge-pop 同款）。
   ⚠️ 这里**不再有**任何「隐身」相关的常驻样式 —— 与 threes 同一套模型：滑动阶段只有「换格」，
   落定阶段只换数据（删两张、加一张），所以不存在「标记残留 → 牌永久看不见」这一类 bug。 */
.tile.merged { animation: 0.19s ease-out merge-pop; z-index: 2; }
/* 落定时补进来的新牌：新建节点 → 缩放淡入（不需要 delay，它本来就在滑行结束才创建） */
.tile.fresh { animation: 0.18s ease-out deal-in; }
/* 开局 / 恢复存档：按行列顺序逐张弹出（间隔由 animationDelay 控制，
   backwards 填充保证轮到自己之前先隐身） */
.tile.dealt { animation: 0.28s cubic-bezier(0.34, 1.56, 0.64, 1) backwards deal-in; }
.tile-text { font-weight: 800; }

.v-2 { background: #eee4da; }
.v-4 { background: #ede0c8; }
.v-8 { background: #f2b179; color: #f9f6f2; }
.v-16 { background: #f59563; color: #f9f6f2; }
.v-32 { background: #f67c5f; color: #f9f6f2; }
.v-64 { background: #f65e3b; color: #f9f6f2; }
.v-128 { background: #edcf72; color: #f9f6f2; }
.v-256 { background: #edcc61; color: #f9f6f2; }
.v-512 { background: #edc850; color: #f9f6f2; }
.v-1024 { background: #edc53f; color: #f9f6f2; }
.v-2048 { background: #edc22e; color: #f9f6f2; }

.result {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20rpx;
  border-radius: 27rpx;
  background: rgba(250, 248, 239, 0.86);
}
.result > .result-title { font-size: 40rpx; font-weight: 800; color: #222; }
.result > .result-sub { font-size: 26rpx; color: #776e65; }
.hint { margin-top: 24rpx; font-size: 22rpx; color: #8a8f99; }

@keyframes deal-in {
  from { transform: scale(0.2); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
@keyframes merge-pop {
  0% { transform: scale(0.5); opacity: 0; }
  60% { transform: scale(1.16); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
</style>
