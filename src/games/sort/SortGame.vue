<template>
  <div class="wrapper">
    <TopHeader @onScoreReset="onScoreReset">
      <!-- 玩法开关（放在帮助图标旁边）：经典 = 2 个空槽；紧凑 = 1 个空槽 + 每槽顶部留一格 -->
      <span class="item-wrapper" :title="i18n('modeTip')" @click="toggleMode">
        <i i-mdi-test-tube v-if="mode === 1" />
        <i i-mdi-test-tube-empty v-else />
      </span>
    </TopHeader>
    <div class="card score-area">
      <div class="stat">
        <span class="stat-label">{{ i18n('levelLabel') }}</span>
        <span class="stat-value">{{ level }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('doneLabel') }}</span>
        <span class="stat-value">{{ done }}/{{ cfg.kinds }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('movesLabel') }}</span>
        <span class="stat-value">{{ moves }}</span>
      </div>
      <!-- 本关进度条：已归位的槽里翻成正面的水果 / 全部水果 -->
      <div class="progress"><div class="progress-bar" :style="{ width: `${progress}%` }"></div></div>
    </div>
    <div class="card opt-area">
      <div class="opt-half">
        <span class="level-note">{{ boardLabel }}</span>
      </div>
      <div class="divider"></div>
      <div class="start-wrapper">
        <button @click="confirming = true" class="game-icon">{{ i18n('start') }}</button>
      </div>
    </div>
    <div class="game-area">
      <div ref="boardRef" class="board dot-board" :style="boardStyle">
        <!-- 槽位底座（只画容器，不吃点击） -->
        <div
          v-for="(box, i) in slotBoxes"
          :key="`bg-${i}`"
          class="slot-bg"
          :class="{ picked: selected === i, ready: isTarget(i) }"
          :style="box"
        ></div>
        <!-- 水果：全部绝对定位在同一层里，key 稳定，抬起 / 平移 / 落下都只改 left/top -->
        <div
          v-for="f in fruits"
          :key="f.id"
          class="fruit"
          :class="{ back: !faceUp(f), picked: pickedIds.has(f.id), lifted: f.lift >= 0, moving: f.flying, flipping: f.flipping, dealing }"
          :style="fruitStyle(f)"
          :data-id="f.id"
        >
          <span v-if="faceUp(f)" class="fruit-face">{{ FRUITS[f.kind] }}</span>
          <i v-else :class="BACK_ICON" />
        </div>
        <!-- 点击热区：整列（含槽口上方预留的空白带）都可点，压在水果之上 -->
        <div
          v-for="(box, i) in hitBoxes"
          :key="`hit-${i}`"
          class="slot-hit"
          :style="box"
          @click="onSlotClick(i)"
        ></div>
      </div>
      <div v-if="phase === WON" class="result win">
        <div>🎉🎉 {{ i18n('levelDone').replace('{n}', level) }} 🎉🎉</div>
        <div class="final-time">{{ i18n('movesDone').replace('{n}', moves) }}</div>
        <button class="game-icon" @click="nextLevel">{{ i18n('nextLevel') }}</button>
      </div>
      <div v-else-if="phase === OVER" class="result lose">
        <div>🚧 {{ i18n('stuckTitle') }} 🚧</div>
        <div class="final-time">{{ i18n('stuckNote').replace('{n}', done) }}</div>
        <button class="game-icon" @click="replayLevel">{{ i18n('replayLevel') }}</button>
      </div>
    </div>
    <!-- 共用的二次确认弹窗（文案与样式都在 shared/ConfirmDialog.vue 里） -->
    <ConfirmDialog :show="confirming" @confirm="startNewGame" @cancel="confirming = false" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';

import TopHeader from '@/components/TopHeader.vue';
import ConfirmDialog from '@/shared/ConfirmDialog.vue';
import confetti from '@/shared/confetti';
import { i18n } from '@/shared/i18n';
import { EMOJIS } from '@/shared/emojis';
import { gameConfig } from '@/shared/games';
import {
  levelConfig, generateSolvable, topRun, moveCount, isWon, isStuck,
  countDone, progressPct,
} from './board';

// Emoji 排序 · 闯关制：槽里自下而上堆着扣着的水果，只能搬槽口那张（连同正下方
// 同种的一连串），目标槽要么同种、要么全空；把每槽都理成同一种、且所有
// 水果都翻成正面即过关。规则与关卡曲线见 board.js
const [PLAY, WON, OVER] = ['play', 'won', 'over'];
const KEY_PREFIX = '__emoji_sort__';
const MODE_KEY = `${KEY_PREFIX}mode`;            // 上次选的玩法
// 两种玩法（经典 / 紧凑）的关卡进度与局面存档各自独立：模式 1 沿用不带后缀的
// key（已经玩过的进度不丢），模式 2 加 _2 后缀；历史最高关卡沿用「前缀+数字」，
// 正好让连点标题的彩蛋一次把两个玩法的记录都清掉（games.js 里 maxDifficulty = 2）
const modeSuffix = () => (mode.value === 2 ? '_2' : '');
const levelKey = () => `${KEY_PREFIX}level${modeSuffix()}`;
const stateKey = () => `${KEY_PREFIX}state${modeSuffix()}`;
const bestKey = () => `${KEY_PREFIX}best_${mode.value}`;

// 水果池：emoji 列表里排最前的那几种（🍎🍌🍇🍉🥝🥭🫐🍒…），最多种类数就是它的长度
const FRUITS = EMOJIS.slice(0, 8);
// 牌背图标直接取本游戏在首页的图标（与对对碰 / 侦探 / 猎手 / 大师同款）
const BACK_ICON = gameConfig('sort').icon;

// ---------- 棋盘几何 ----------
// 槽位横向铺开、水果在槽内自下而上堆叠，槽口上方另留一条空白带（HEAD_ROWS 行）：
// 选中时整摞水果抬到这条带子里，之后只在这里横向平移，再从目标槽正上方垂直落下
const PAD = 8;           // 棋盘内边距（与大师的 BOARD_PAD 同款）
const GAP_X = 5;         // 槽与槽的间距
const GAP_Y = 3;         // 槽内相邻水果的间距
// 抬起的一摞里，上面那张盖住下面那张约 80% 的面积，所以每多一张只往上错开
// 0.2 个格子 —— 槽口上方的空白带也就只要「一张 + 这么点」的高度，不用留一大条
const LIFT_OVERLAP = 0.8;
const HEAD_GAP = GAP_Y;  // 抬起后最低那张与槽口之间的小缝
const HEAD_MARGIN = 8;   // 抬起的一摞顶到棋盘上边缘还要留的余量
const MAX_CELL = 46;     // 格子边长上限

// 三段动画时长（抬 → 平移 → 落），同一批水果之间再错峰一点
const STAGGER_MS = 22;
const LIFT_MS = 150;    // 抬出槽口 / 放回槽里（纯竖向）
const TRAVEL_MS = 200;  // 空白带里的横向平移
const DROP_MS = 150;    // 落到目标槽里（纯竖向）
const FLIP_MS = 340;    // 翻面动画

function loadMode() {
  return +(localStorage.getItem(MODE_KEY) || 1) === 2 ? 2 : 1;
}

function loadLevel() {
  return Math.max(1, Math.floor(+(localStorage.getItem(levelKey()) || 1)) || 1);
}

function loadBest() {
  return Math.max(level.value, Math.floor(+(localStorage.getItem(bestKey()) || 1)) || 1);
}

const mode = ref(loadMode());
const level = ref(loadLevel());
const bestLevel = ref(loadBest());
// [{ id, kind, slot, depth, lift, liftN, moveMs, delay, flying, pending, flipping }]
// lift = -1 表示在槽里，>= 0 表示正被抬起（值是在这一摞里从下往上的序号）
// pending = 状态上已经翻成正面、但等这一摞落定后才播翻面（先继续画牌背）
const fruits = ref([]);
const hidden = ref([]);        // 每槽底部扣着的张数（可见的永远是最上面一段）
const moves = ref(0);
const phase = ref(PLAY);
const selected = ref(-1);      // 选中的槽位下标（-1 = 没选）
const confirming = ref(false);
const dealing = ref(false);    // 开局逐张入场中（期间不接受操作）
const boardRef = ref(null);
const viewport = ref({ w: window.innerWidth || 420, h: window.innerHeight || 700 });

const cfg = computed(() => levelConfig(level.value, mode.value));
const capacity = computed(() => cfg.value.capacity);

// 盘面（board.js 需要的 { items, hidden } 形态，原地由水果对象组装）
const piles = computed(() => {
  const out = Array.from({ length: cfg.value.slots }, () => []);
  fruits.value.forEach(f => { out[f.slot][f.depth] = f; });
  return out.map((items, i) => ({ items, hidden: hidden.value[i] || 0 }));
});

const done = computed(() => countDone(piles.value, cfg.value.copies));
const progress = computed(() => progressPct(piles.value, cfg.value.copies));
const boardLabel = computed(() => i18n('boardLabel')
  .replace('{slots}', cfg.value.slots)
  .replace('{capacity}', cfg.value.capacity)
  .replace('{kinds}', cfg.value.kinds));

// 选中槽口那串同种水果的 id（只有正面朝上的能被选中）
const pickedIds = computed(() => {
  const ids = new Set();
  if (selected.value < 0) return ids;
  const items = piles.value[selected.value].items;
  const run = topRun(piles.value[selected.value]);
  items.slice(items.length - run).forEach(f => ids.add(f.id));
  return ids;
});

const metrics = computed(() => {
  const { slots, capacity: cap } = cfg.value;
  const boardW = Math.min(viewport.value.w, 440) - 32;          // .game-area 的宽度
  const availH = Math.max(200, viewport.value.h - 262);         // 标题栏 + 统计条 + 操作区
  // 最多会抬起 cap 张：每张之间错开 (1 - LIFT_OVERLAP) 个格子，
  // 整块棋盘折算成「槽 cap 行 + 空白带」共 rowUnits 行格子来解高度约束
  const overlapStep = 1 - LIFT_OVERLAP;
  const rowUnits = 1 + cap + (cap - 1) * overlapStep;
  const fixedH = PAD * 2 + HEAD_GAP + HEAD_MARGIN + (cap - 1) * GAP_Y;
  const cell = Math.max(16, Math.floor(Math.min(
    (boardW - PAD * 2 - GAP_X * (slots - 1)) / slots,
    (availH - fixedH) / rowUnits,
    MAX_CELL,
  )));
  const stepY = cell + GAP_Y;
  const hoverStep = overlapStep * cell;                        // 抬起的一摞里相邻两张的错位
  const headH = (cap - 1) * hoverStep + cell + HEAD_GAP + HEAD_MARGIN;
  const groupW = slots * cell + GAP_X * (slots - 1);
  return {
    cell,
    stepX: cell + GAP_X,
    stepY,
    hoverStep,
    font: Math.max(12, Math.round(cell * 0.55)),
    // 槽位整体在棋盘里居中（格子取整后会剩几个像素）
    offsetX: PAD + Math.max(0, (boardW - PAD * 2 - groupW) / 2),
    headH,
    slotTop: PAD + headH,
    slotH: cap * cell + (cap - 1) * GAP_Y,
    height: PAD * 2 + headH + cap * cell + (cap - 1) * GAP_Y,
  };
});

const boardStyle = computed(() => ({ height: `${metrics.value.height}px` }));

// 槽位底座（只到槽口）与点击热区（连槽口上方的空白带一起）
const slotBoxes = computed(() => {
  const m = metrics.value;
  return Array.from({ length: cfg.value.slots }, (_, i) => ({
    left: `${m.offsetX + i * m.stepX}px`,
    top: `${m.slotTop}px`,
    width: `${m.cell}px`,
    height: `${m.slotH}px`,
  }));
});
const hitBoxes = computed(() => {
  const m = metrics.value;
  // 热区把槽与槽之间的缝也算进来（点击目标是整列，缝里的点击也归最近这一列），
  // 小屏上格子只有 20px 上下时更好点
  return Array.from({ length: cfg.value.slots }, (_, i) => ({
    left: `${m.offsetX + i * m.stepX - GAP_X / 2}px`,
    top: `${PAD}px`,
    width: `${m.cell + GAP_X}px`,
    height: `${m.headH + m.slotH}px`,
  }));
});

function fruitStyle(f) {
  const m = metrics.value;
  const top = f.lift >= 0
    ? m.slotTop - HEAD_GAP - m.cell - f.lift * m.hoverStep
    : m.slotTop + (capacity.value - 1 - f.depth) * m.stepY;
  return {
    left: `${m.offsetX + f.slot * m.stepX}px`,
    top: `${top}px`,
    width: `${m.cell}px`,
    height: `${m.cell}px`,
    fontSize: `${m.font}px`,
    // 一摞里越靠上的越要盖在上面（层级按它在槽里的层数走，抬起来时也是这个相对次序）
    zIndex: f.flying ? 30 + f.depth : 1,
    '--move-dur': `${f.moveMs}ms`,
    '--move-delay': `${f.delay}ms`,
    animationDelay: dealing.value ? `${f.deal * 18}ms` : '0ms',
  };
}

// 正面朝上 = 状态上已经翻过来了，且不在「等落定再翻面」的过渡里
function faceUp(f) {
  return !f.pending && f.depth >= (hidden.value[f.slot] || 0);
}

function isTarget(i) {
  if (selected.value < 0 || selected.value === i) return false;
  return moveCount(piles.value, selected.value, i, capacity.value) > 0;
}

// ---------- 存档 ----------
function save() {
  try {
    localStorage.setItem(stateKey(), JSON.stringify({
      level: level.value,
      mode: mode.value,
      moves: moves.value,
      hidden: hidden.value,
      // 水果按 [种类, 槽位, 层数] 存，顺序即 id
      fruits: fruits.value.map(f => [f.kind, f.slot, f.depth]),
      phase: phase.value,
    }));
  } catch { /* 隐私模式等写不进去的场景静默跳过 */ }
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(stateKey()));
    if (!saved || !Array.isArray(saved.fruits) || !saved.fruits.length) return false;
    if (saved.mode && saved.mode !== mode.value) return false;
    const lv = Math.max(1, Math.floor(+(saved.level || 1)) || 1);
    const c = levelConfig(lv, mode.value);
    if (!Array.isArray(saved.hidden) || saved.hidden.length !== c.slots) return false;
    if (saved.fruits.length !== c.total) return false;
    const next = saved.fruits.map(([kind, slot, depth], id) => ({ id, kind, slot, depth }));
    if (next.some(f => !(f.kind >= 0 && f.kind < FRUITS.length)
      || f.slot < 0 || f.slot >= c.slots || f.depth < 0 || f.depth >= c.capacity)) return false;
    level.value = lv;
    if (level.value > bestLevel.value) bestLevel.value = level.value;
    fruits.value = next.map((f, i) => ({ ...newFruit(i, f.kind, f.slot, f.depth), deal: i }));
    hidden.value = saved.hidden.map(n => Math.max(0, Math.min(c.capacity, n | 0)));
    moves.value = Math.max(0, saved.moves | 0);
    selected.value = -1;
    phase.value = saved.phase === WON ? WON : saved.phase === OVER ? OVER : PLAY;
    return true;
  } catch {
    return false;
  }
}

// 一张水果的初始状态：躺在槽里、没有动画在跑
function newFruit(id, kind, slot, depth) {
  return {
    id,
    kind,
    slot,
    depth,
    lift: -1,
    liftN: 1,
    moveMs: 0,
    delay: 0,
    flying: false,   // 有动画在跑（层级抬到最上面）
    transit: false,  // 正被这一手搬运带在途中（这段时间内它不能被再抬一次）
    pending: false,
    flipping: false,
  };
}

let dealTimer = null;
let flipTimers = [];
let phaseTimers = [];
let generation = 0;    // 局面被换掉（初始化 / 恢复 / 切玩法）就 +1，动画尾声据此收手
let busy = false;      // 有一手搬运正在播（只挡「下一手搬运」，不挡抬起）
let liftUntil = 0;     // 当前这一摞抬到位的时间点
// 搬运动画期间玩家按下的意图（等这一手落定后再执行）：{ type: 'select' | 'move', slot, to }
let deferred = null;
let disposed = false;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function clearTransient() {
  generation += 1;
  clearTimeout(dealTimer);
  dealTimer = null;
  flipTimers.forEach(clearTimeout);
  flipTimers = [];
  phaseTimers.forEach(clearTimeout);
  phaseTimers = [];
  fruits.value.forEach(f => {
    f.lift = -1;
    f.flying = false;
    f.transit = false;
    f.pending = false;
    f.flipping = false;
  });
  dealing.value = false;
  busy = false;
  liftUntil = 0;
  deferred = null;
}

// 逐张入场：从左到右、每槽自下而上（堆起来的感觉），结束后恢复无延迟
function startDealing() {
  clearTimeout(dealTimer);
  dealing.value = true;
  dealTimer = setTimeout(() => { dealing.value = false; }, fruits.value.length * 18 + 380);
}

onMounted(() => {
  window.addEventListener('resize', onResize);
  bootMode();
});

onUnmounted(() => {
  disposed = true;
  window.removeEventListener('resize', onResize);
  clearTransient();
});

function onResize() {
  viewport.value = { w: window.innerWidth || 420, h: window.innerHeight || 700 };
}

function initLevel(lv) {
  clearTransient();
  confirming.value = false;
  level.value = Math.max(1, lv);
  localStorage.setItem(levelKey(), level.value);
  if (level.value > bestLevel.value) {
    bestLevel.value = level.value;
    localStorage.setItem(bestKey(), bestLevel.value);
  }
  const c = cfg.value;
  const plain = generateSolvable(c);
  let id = 0;
  let deal = 0;
  const next = [];
  plain.forEach((slot, s) => {
    slot.items.forEach((kind, depth) => {
      next.push({ ...newFruit(id++, kind, s, depth), deal: deal++ });
    });
  });
  fruits.value = next;
  hidden.value = plain.map(slot => slot.hidden);
  moves.value = 0;
  selected.value = -1;
  phase.value = PLAY;
  startDealing();
  save();
}

function nextLevel() {
  initLevel(level.value + 1);
}

function replayLevel() {
  initLevel(level.value);
}

// 新游戏：只清当前玩法的记录（关卡 / 局面 / 最高关卡）并从第 1 关重新开始，
// 另一种玩法的进度完全不动，任何时候点都要二次确认
function startNewGame() {
  confirming.value = false;
  localStorage.removeItem(levelKey());
  localStorage.removeItem(stateKey());
  localStorage.removeItem(bestKey());
  bestLevel.value = 1;
  initLevel(1);
}

function onScoreReset() {
  localStorage.removeItem(bestKey());
  bestLevel.value = level.value;
}

// 切换玩法：先把当前玩法落档，再按另一种玩法自己的关卡 / 存档接着玩
function toggleMode() {
  save();
  clearTransient();
  mode.value = mode.value === 1 ? 2 : 1;
  localStorage.setItem(MODE_KEY, String(mode.value));
  level.value = loadLevel();
  bestLevel.value = loadBest();
  bootMode();
}

// 进入某个玩法的局面：有存档就接着玩，没有就从它自己的关卡开一局
function bootMode() {
  if (!restore()) {
    initLevel(level.value);
    return;
  }
  if (phase.value === PLAY) startDealing();
  else save();
}

// ---------- 操作 ----------
// 抬起随时都能做：上一步搬运的动画还在播，也不耽误把另一摞抬起来。
// 只有「搬运」本身是串行的——动画期间点的目标槽会记下来，等这一手落定再搬
function onSlotClick(i) {
  if (phase.value !== PLAY || dealing.value) return;
  // 再点一次刚按下的那个槽位 = 取消挂起的操作
  if (deferred && (deferred.slot === i || deferred.to === i)) {
    deferred = null;
    return;
  }
  deferred = null;
  // 再点一次当前槽位：把抬起的一摞放回去
  if (selected.value === i) {
    selected.value = -1;
    dropRun(i);
    return;
  }
  if (selected.value >= 0) {
    const from = selected.value;
    const n = moveCount(piles.value, from, i, capacity.value);
    if (n) {
      // 上一手还在飞：先记下意图，等它落定再搬（同一时间只允许一手在播）
      if (busy) {
        deferred = { type: 'move', slot: from, to: i };
        return;
      }
      performMove(from, i, n);
      return;
    }
    // 放不下：原来那摞放回去，改选刚点的槽（空槽则只是取消）
    selected.value = -1;
    dropRun(from);
    if (piles.value[i].items.length) liftRun(i);
    return;
  }
  if (!piles.value[i].items.length) return;
  // 这一摞顶上还压着上一手正在飞的牌：记下来，等落定再抬
  if (runInFlight(i)) {
    deferred = { type: 'select', slot: i };
    return;
  }
  liftRun(i);
}

// 这个槽现在能不能抬：槽口那一摞里不能有正被上一手带在途中的牌，
// 也不能有正飞过来、马上就要落进这个槽的牌（都在半空中，抬了会打架）
function runInFlight(i) {
  const pile = piles.value[i].items;
  const n = topRun(piles.value[i]);
  return pile.slice(pile.length - n).some(f => f.transit)
    || fruits.value.some(f => f.transit && f.slot === i);
}

// 把「状态上已经翻成正面、界面上还在等落定」的那张真正翻过来
function reveal(f) {
  f.pending = false;
  f.flipping = true;
  flipTimers.push(setTimeout(() => { f.flipping = false; }, FLIP_MS));
}

// 把槽口那一摞（只算正面朝上的）抬到槽口上方的空白带里
function liftRun(i) {
  const pile = piles.value[i].items;
  const n = topRun(piles.value[i]);
  if (!n) return;
  pile.slice(pile.length - n).forEach((f, idx) => {
    // 上一手刚露出来、还在等落定再翻面的那张：玩家既然直接抓起来了，就当场翻
    if (f.pending) reveal(f);
    f.lift = idx;                              // 0 = 这一摞里最下面那张
    f.liftN = n;
    f.flying = true;
    f.moveMs = LIFT_MS;
    f.delay = (n - 1 - idx) * STAGGER_MS;      // 最上面那张先出来
  });
  selected.value = i;
  liftUntil = Date.now() + LIFT_MS + (n - 1) * STAGGER_MS;
}

// 把抬起的一摞放回它自己的槽里（取消选中）
function dropRun(i) {
  const run = fruits.value.filter(f => f.slot === i && f.lift >= 0).sort((a, b) => a.lift - b.lift);
  run.forEach((f, idx) => {
    f.lift = -1;
    f.moveMs = DROP_MS;
    f.delay = idx * STAGGER_MS;
  });
  if (!run.length) return;
  phaseTimers.push(setTimeout(() => {
    // 中途又被重新抬起来的就别动它的层级了
    run.forEach(f => { if (f.lift < 0) f.flying = false; });
  }, DROP_MS + (run.length - 1) * STAGGER_MS + 40));
}

// 搬运：① 等这一摞抬到位；② 只在槽口上方的空白带里横向平移到目标槽正上方；
// ③ 从目标槽正上方垂直落下去；④ 落定之后，才把源槽新露出来的那张翻面。
// 合法性 / 张数走 board.js 的 moveCount，槽位与层数由这里写：
// 界面要维持「每张水果一个稳定的 id + 自己的槽位/层数」，board.js 的 applyMove
// 只搬 items 数组，改不到这两样
async function performMove(from, to, n) {
  const gen = generation;
  const srcPile = piles.value[from].items;
  const dstLen = piles.value[to].items.length;
  const oldLen = srcPile.length;
  const oldHidden = hidden.value[from] || 0;
  const moved = srcPile.slice(oldLen - n);
  const newLen = oldLen - n;

  busy = true;
  selected.value = -1;
  // 这一批牌进入「搬运途中」：这段时间里它们不能再被抬一次（点它们只会挂起意图）
  moved.forEach(f => { f.transit = true; });

  // 手快在抬起动画没走完就点了目标槽：等它抬到位，横向平移才不会蹭到槽边
  const wait = Math.max(0, liftUntil - Date.now());
  if (wait) await sleep(wait);
  if (disposed || gen !== generation) return;

  // 第二段：横向平移到目标槽正上方。lift 不动，所以 top 一个像素都不变
  moved.forEach((f, i) => {
    f.slot = to;
    f.depth = dstLen + i;
    f.moveMs = TRAVEL_MS;
    f.delay = (n - 1 - i) * STAGGER_MS;
  });
  // 状态（暗牌张数 / 步数 / 存档）在这一刻就落定；界面上新露出来的那张
  // 先继续按牌背画（pending），等落定之后再翻
  hidden.value[from] = newLen ? Math.min(oldHidden, newLen - 1) : 0;
  const exposed = newLen
    ? fruits.value.find(f => f.slot === from && f.depth === newLen - 1)
    : null;
  const exposedWasHidden = !!exposed && newLen - 1 < oldHidden;
  if (exposedWasHidden) exposed.pending = true;
  moves.value += 1;
  save();

  await sleep(TRAVEL_MS + (n - 1) * STAGGER_MS + 20);
  if (disposed || gen !== generation) return;

  // 第三段：从目标槽正上方垂直落下（x 不变，只改 top）
  moved.forEach((f, i) => {
    f.lift = -1;
    f.moveMs = DROP_MS;
    f.delay = i * STAGGER_MS;
  });

  await sleep(DROP_MS + (n - 1) * STAGGER_MS + 40);
  if (disposed || gen !== generation) return;

  moved.forEach(f => {
    f.flying = false;
    f.transit = false;
  });
  // 第四段：这一摞落定了，才翻开源槽槽口新露出来的那张
  // （要是玩家在搬运途中就把它抓起来了，liftRun 已经提前翻过，这里不重复播）
  if (exposedWasHidden && exposed.pending) reveal(exposed);

  busy = false;
  const next = deferred;
  deferred = null;
  evaluate();
  if (phase.value !== PLAY || !next) return;
  // 搬运途中玩家按下的意图，现在补上：抬另一摞 / 接一手搬运
  if (next.type === 'select') {
    if (piles.value[next.slot].items.length) liftRun(next.slot);
    return;
  }
  const count = moveCount(piles.value, next.slot, next.to, capacity.value);
  if (count) performMove(next.slot, next.to, count);
  else if (piles.value[next.to].items.length) liftRun(next.to);
}

function evaluate() {
  if (phase.value !== PLAY) return;
  if (isWon(piles.value, cfg.value.copies, cfg.value.kinds)) {
    phase.value = WON;
    save();
    confetti();
  } else if (isStuck(piles.value, capacity.value)) {
    phase.value = OVER;
    save();
  }
}
</script>

<style scoped lang="scss">
@keyframes deal {
  from {
    opacity: 0;
    transform: scale(0.4);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

// 翻面：横向压扁再弹回，配合牌背换成水果的瞬间
@keyframes flip {
  0% { transform: scaleX(1); }
  40% { transform: scaleX(0.12); }
  100% { transform: scaleX(1); }
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
    position: relative;
    overflow: hidden;
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
      gap: 2px;
      .stat-label {
        font-size: 12px;
        color: var(--muted-color);
      }
      .stat-value {
        font-size: 22px;
        font-weight: bold;
        line-height: 1.2;
        font-variant-numeric: tabular-nums;
      }
    }
    .progress {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 3px;
      background: var(--border-color);
      .progress-bar {
        height: 100%;
        background: var(--primary-bg);
        transition: width 0.3s ease;
      }
    }
  }
  .opt-area {
    display: flex;
    align-items: center;
    margin: var(--row-gap) 0;
    height: var(--row-height);
    .opt-half {
      flex: 1.6;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .level-note {
      font-size: 13px;
      color: var(--muted-color);
      white-space: nowrap;
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
    width: calc(100% - 32px);
    max-width: 440px;
    box-sizing: border-box;
  }
  .board {
    position: relative;
    width: 100%;
    border-radius: var(--card-radius);
    box-sizing: border-box;
  }
  // 槽位底座：淡淡的容器色 + 虚线描边，选中 / 可放置时换成主色
  .slot-bg {
    position: absolute;
    z-index: 0;
    pointer-events: none;
    box-sizing: border-box;
    border-radius: var(--radius-tile);
    border: 1px dashed var(--tile-border-color);
    background: var(--cell-bg);
    transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
    &.picked {
      border-style: solid;
      border-color: var(--primary-bg);
      box-shadow: 0 0 0 2px var(--primary-bg);
    }
    &.ready {
      border-color: var(--primary-bg);
      background: var(--enter-bg);
    }
  }
  .slot-hit {
    position: absolute;
    z-index: 3;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .fruit {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    border-radius: var(--radius-tile);
    border: 1px solid var(--tile-border-color);
    box-shadow: var(--shadow-soft);
    background: var(--card-bg-color);
    color: var(--text-color);
    pointer-events: none;
    // 抬起 / 平移 / 落下的三段位移都靠这两条过渡；时长与错峰由内联变量给
    transition: left var(--move-dur, 0ms) ease, top var(--move-dur, 0ms) ease;
    transition-delay: var(--move-delay, 0ms);
    will-change: transform;
    // 发牌动画只在入场期间生效：结束后规则移除，翻面 / 搬运的动画不会被它顶掉
    &.dealing {
      animation: 0.35s ease backwards deal;
    }
    &.flipping {
      animation: flip 0.34s ease;
    }
    // 牌背：底色主色 + 白图标（与其它 emoji 游戏同款）
    &.back {
      background: var(--primary-bg);
      border-color: var(--primary-bg);
      color: #fff;
    }
    &.picked {
      box-shadow: 0 0 0 2px var(--primary-bg);
    }
    .fruit-face {
      line-height: 1;
    }
  }
  .result {
    position: absolute;
    width: 100%;
    height: 100%;
    left: 0;
    top: 0;
    z-index: 4;
    border-radius: var(--card-radius);
    background: var(--mask-color);
    color: var(--win-color);
    font-weight: bold;
    font-size: 18px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 12px;
    box-sizing: border-box;
    text-align: center;
    &.lose {
      color: var(--lose-color);
    }
    .final-time {
      font-size: 28px;
    }
  }
}
</style>
