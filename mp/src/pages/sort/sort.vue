<template>
  <view class="screen">
    <!-- 全站背景（粒子连线 + 底部过山车，与 web 的 ParticleBackground 同款） -->
    <ParticleBackground />
    <view class="page">
      <!-- 统计条：关卡 / 已归位 / 步数（label 的 emoji 在字典原文里，与 web 的 score-area 一致）+ 本关进度条 -->
      <view class="card score-area">
        <view class="stat">
          <text class="stat-label">{{ tt('levelLabel') }}</text>
          <text class="stat-value">{{ level }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('doneLabel') }}</text>
          <text class="stat-value">{{ done }}/{{ cfg.kinds }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('movesLabel') }}</text>
          <text class="stat-value">{{ moves }}</text>
        </view>
        <view class="progress"><view class="progress-bar" :style="{ width: progress + '%' }" /></view>
      </view>

      <!-- 操作区：盘面信息（槽位 · 层数 · 种类）+ 新游戏（web 的 opt-area，1.6 : 1.2 分格） -->
      <view class="card opt-area">
        <view class="opt-half">
          <text class="level-note">{{ boardLabel }}</text>
        </view>
        <view class="divider" />
        <view class="start-wrapper">
          <button class="game-icon" hover-class="none" @click="confirming = true">{{ tt('start') }}</button>
        </view>
      </view>

      <!-- 游戏区：点阵底纹 + 槽位。槽位底座 / 水果 / 点击热区共用同一份 PAD + step 数学 -->
      <view class="game-area">
        <view class="board" :style="boardStyle">
          <!-- 槽位底座（只画容器，不吃点击） -->
          <view
            v-for="(box, i) in slotBoxes"
            :key="'bg-' + i"
            class="slot-bg"
            :class="{ picked: selected === i, ready: isTarget(i) }"
            :style="box"
          />
          <!-- 水果：全部绝对定位在同一层里，key 稳定，抬起 / 平移 / 落下都只改 left/top。
               牌面 / 牌背两面常驻（§二十一「翻面动画唯一标准」），只靠 up 类切换 rotateY -->
          <view
            v-for="f in fruits"
            :key="f.id"
            class="fruit"
            :class="{ up: faceUp(f), picked: pickedIds.has(f.id), waving, dealing }"
            :style="fruitStyle(f)"
          >
            <view class="flip">
              <view class="face face-back">
                <view class="back-ico" :class="BACK_ICON" />
              </view>
              <view class="face face-front">
                <text class="fruit-face">{{ FRUITS[f.kind] }}</text>
              </view>
            </view>
          </view>
          <!-- 点击热区：整列（含槽口上方预留的空白带）都可点，压在水果之上 -->
          <view
            v-for="(box, i) in hitBoxes"
            :key="'hit-' + i"
            class="slot-hit"
            :style="box"
            @click="onSlotClick(i)"
          />
        </view>

        <!-- 过关结算层：与游戏区完全同矩形（web 的 .result.win） -->
        <view v-if="phase === WON" class="result win">
          <text>🎉🎉 {{ tt('levelDone').replace('{n}', level) }} 🎉🎉</text>
          <text class="final-time">{{ tt('movesDone').replace('{n}', moves) }}</text>
          <view class="result-actions">
            <button class="game-icon replay-btn" hover-class="none" @click="replayLevel">{{ tt('replayLevel') }}</button>
            <button class="game-icon" hover-class="none" @click="nextLevel">{{ tt('nextLevel') }}</button>
          </view>
        </view>
        <!-- 失败结算层（web 的 .result.lose） -->
        <view v-else-if="phase === OVER" class="result lose">
          <text>🚧 {{ tt('stuckTitle') }} 🚧</text>
          <text class="final-time">{{ tt('stuckNote').replace('{n}', done) }}</text>
          <button class="game-icon replay-btn" hover-class="none" @click="replayLevel">{{ tt('replayLevel') }}</button>
        </view>
      </view>
    </view>

    <!-- 彩带：只在真正赢下这一刻放（恢复存档的胜利态不放，justWon 恒为 false） -->
    <Confetti v-if="justWon" />

    <FloatingActions>
      <!-- 玩法切换（经典 / 紧凑）：模式在左、帮助在右（与侦探 / 赌神 / 猎手一致） -->
      <view class="fab" @click="toggleMode">
        <view class="fab-ico" :class="mode === 1 ? 'i-mdi-test-tube' : 'i-mdi-test-tube-empty'" />
      </view>
      <view class="fab" @click="showHelp"><view class="fab-ico i-carbon-help" /></view>
    </FloatingActions>
    <HelpSheet :open="helpOpen" :text="helpText" @close="helpOpen = false" />

    <!-- 新游戏二次确认（web 的 shared/ConfirmDialog 三按钮版；小程序没有共享弹窗，这里本地实现） -->
    <view v-if="confirming" class="confirm-mask" @click="confirming = false">
      <view class="card confirm-box" @click.stop>
        <text class="confirm-title">{{ tt('confirmTitle') }}</text>
        <text class="confirm-msg">{{ tt('confirmMsg') }}</text>
        <view class="confirm-actions">
          <button class="confirm-cancel" @click="confirming = false">{{ tt('cancel') }}</button>
          <button class="confirm-replay" @click="replayLevel">{{ tt('confirmReplay') }}</button>
          <button class="confirm-ok" @click="startNewGame">{{ tt('confirmOk') }}</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
// Emoji 排序 · 微信小程序版
// 逻辑逐行对照 web 的 src/games/sort/SortGame.vue（关卡曲线 / 发牌求解器 / 抬起-平移-落下三段搬运 /
// 自动搬运 / 失败演出 / 存档字段 / 计步全部一致），board.js 为 web 逐字节复制。平台差异只有这几处：
// - web 用 CSS 变量 + px 算几何 → 这里按 750rpx = 屏宽换算成 rpx，槽位底座 / 水果 / 热区共用同一份
//   PAD / stepX / stepY（绝对定位，不用 flex gap）；
// - 尺寸口径照 web：宽度 = 页面内容宽 690rpx（web 的 calc(100% - 32px) = 361px）、格子上限 46px、
//   可用高 = 视口高 − 统计条/操作区 − 底部 140rpx（让开右下角悬浮按钮）；
// - 翻面按 §二十一「翻面动画唯一标准」：.fruit > .flip(perspective) > 两个常驻 .face，靠 up 类切换；
//   web 原本是 scaleX 压扁 + v-if 换面，这里按小程序统一标准改成 3D 翻转（FLIP_MS 同步 0.46s）；
// - 没有 Pointer Events：点列用 @click（web 也是 click，无拖动）；
// - localStorage → @/core/storage（key 与 web 一字不差：__emoji_sort__*）；
// - Web Audio → @/core/sfx；彩带照 web 的 confetti()（成功 success.mp3 / 失败 lose.mp3）；
// - 没有全局锁：搬运期间照样能抬别的槽，只有「一手搬运」串行（deferred 补做）。
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { onHide } from '@dcloudio/uni-app';

import Confetti from '@/components/Confetti.vue';
import FloatingActions from '@/components/FloatingActions.vue';
import HelpSheet from '@/components/HelpSheet.vue';
import { setNavTitle } from '@/core/i18n';
import { playLose, playWin } from '@/core/sfx';
import { getJSON, getRaw, setJSON, setRaw } from '@/core/storage';
import { EMOJIS } from '@/shared/emojis';
import {
  levelConfig, generateSolvable, topRun, moveCount, moveTargets, isWon, isDeadEnd,
  countDone, progressPct,
} from './board';
import { tt } from './i18n';
import ParticleBackground from '@/components/ParticleBackground.vue';

// 原生导航栏标题跟随语言（pages.json 里的标题是静态的）
setNavTitle(() => tt('gameTitle'));

// ---------- 存档 key：与 web 完全一致 ----------
const [PLAY, WON, OVER] = ['play', 'won', 'over'];
const KEY_PREFIX = '__emoji_sort__';
const MODE_KEY = `${KEY_PREFIX}mode`;              // 上次选的玩法
// 两种玩法（经典 / 紧凑）的关卡进度与局面存档各自独立：模式 1 沿用不带后缀的 key，
// 模式 2 加 _2 后缀；历史最高关卡沿用「前缀 + 玩法号」（与 web 一致）
const modeSuffix = () => (mode.value === 2 ? '_2' : '');
const levelKey = () => `${KEY_PREFIX}level${modeSuffix()}`;
const stateKey = () => `${KEY_PREFIX}state${modeSuffix()}`;
const bestKey = () => `${KEY_PREFIX}best_${mode.value}`;

// 水果池：emoji 列表里排最前的那几种（🍎🍌🍇🍉🥝🥭🫐🍒），最多种类数就是它的长度
const FRUITS = EMOJIS.slice(0, 8);
// 牌背图标直接取本游戏在首页的图标（与 web 的 gameConfig('sort').icon 相同）
const BACK_ICON = 'i-mdi-test-tube';

// ---------- 棋盘几何（web 的 px 常量，落样式时按 750rpx = 屏宽换算） ----------
const PAD = 8;             // 棋盘内边距（web 的 BOARD_PAD 同款）
const GAP_X = 5;           // 槽与槽的间距
const GAP_Y = 3;           // 槽内相邻水果的间距
const LIFT_OVERLAP = 0.85; // 抬起的一摞里，上面那张盖住下面那张约 85%
const HEAD_MARGIN = 8;     // 抬起的一摞顶到棋盘上边缘还要留的余量
const MAX_CELL = 46;       // 格子边长上限（px）
const CARD_W_RPX = 690;    // 页面内容宽 = web 的 calc(100% - 32px)
// 棋盘以上：上 padding 27 + 统计条 168 + 间距 31 + 操作区 120 + 间距 31（都是 rpx）
const PAGE_TOP_RPX = 27 + 168 + 31 + 120 + 31;
const PAGE_BOTTOM_RPX = 140;   // 页面底部留白，让开右下角悬浮按钮
const MIN_AVAIL_RPX = 360;     // 视口再矮也不把棋盘算成负数

// 三段动画时长（抬 → 平移 → 落），同一批水果之间再错峰一点（与 web 同值）
const STAGGER_MS = 22;
const LIFT_MS = 150;
const TRAVEL_MS = 200;
const DROP_MS = 150;
const FLIP_MS = 460;       // 翻面时长：与 CSS 的 .face transition-duration 0.46s 同步
// 失败演出：翻面之后先停一下，然后每个槽整摞抬起一格再落下
const FAIL_PAUSE_MS = 500;
const WAVE_MS = 560;
const WAVE_STEP_MS = 75;
let lastFlipAt = 0;        // 最近一次翻面的开始时间（失败要等它播完）

function loadMode() {
  return +(getRaw(MODE_KEY) || 1) === 2 ? 2 : 1;
}
function loadLevel() {
  return Math.max(1, Math.floor(+(getRaw(levelKey()) || 1)) || 1);
}
function loadBest() {
  return Math.max(level.value, Math.floor(+(getRaw(bestKey()) || 1)) || 1);
}

const mode = ref(loadMode());
const level = ref(loadLevel());
const bestLevel = ref(loadBest());
// [{ id, kind, slot, depth, lift, liftN, moveMs, delay, flying, transit, pending }]
// lift = -1 表示在槽里，>= 0 表示正被抬起（值是在这一摞里从下往上的序号）
// pending = 状态上已经翻成正面、但等这一摞落定后才播翻面（先继续画牌背）
const fruits = ref([]);
const hidden = ref([]);        // 每槽底部扣着的张数（可见的永远是最上面一段）
const moves = ref(0);
const phase = ref(PLAY);
const selected = ref(-1);      // 选中的槽位下标（-1 = 没选）
// 自动搬运的目标槽：selected 在 performMove 一开头就被清成 -1，只靠它的话
// 「可放置」高亮会在搬运刚开始时闪掉；这个瞬时下标让目标槽在整段搬运里一直亮着
const autoTarget = ref(-1);
const failing = ref(false);
const waving = ref(false);
const confirming = ref(false);
const dealing = ref(false);    // 开局逐张入场中（期间不接受操作）
const justWon = ref(false);    // 彩带只在真正赢下这一刻为 true（恢复存档绝不放）
const viewport = ref(readViewport());

const cfg = computed(() => levelConfig(level.value, mode.value));
const capacity = computed(() => cfg.value.capacity);

// 盘面（board.js 需要的 { items, hidden } 形态，原地由水果对象组装）
const piles = computed(() => {
  const out = Array.from({ length: cfg.value.slots }, () => []);
  fruits.value.forEach((f) => { out[f.slot][f.depth] = f; });
  return out.map((items, i) => ({ items, hidden: hidden.value[i] || 0 }));
});

const done = computed(() => countDone(piles.value, cfg.value.copies));
const progress = computed(() => progressPct(piles.value, cfg.value.copies));
const boardLabel = computed(() => tt('boardLabel')
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

// 视口 → 棋盘几何（全部 rpx）。与 web 的 metrics 同一套公式：
// 宽按槽数反算、高按「槽 cap 行 + 抬起空白带」反算，格子取整后整组左右居中
const metrics = computed(() => {
  const { slots, capacity: cap } = cfg.value;
  const vw = viewport.value.w || 393;
  const vh = viewport.value.h || 852;
  const k = 750 / vw;                                  // rpx / px
  const pad = Math.max(2, Math.round(PAD * k));
  const gapX = Math.max(1, Math.round(GAP_X * k));
  const gapY = Math.max(1, Math.round(GAP_Y * k));
  const headMargin = Math.max(2, Math.round(HEAD_MARGIN * k));
  const maxCell = Math.round(MAX_CELL * k);
  // H5 的 innerHeight 含 uni 自带导航栏，要扣掉；小程序 windowHeight 已扣过
  const availH = Math.max(
    MIN_AVAIL_RPX,
    (vh - (viewport.value.head || 0)) * k - PAGE_TOP_RPX - PAGE_BOTTOM_RPX,
  );
  const overlapStep = 1 - LIFT_OVERLAP;
  const rowUnits = 1 + cap + (cap - 1) * overlapStep;
  const fixedH = pad * 2 + gapY + headMargin + (cap - 1) * gapY;
  const cell = Math.max(
    Math.round(16 * k),
    Math.floor(Math.min(
      (CARD_W_RPX - pad * 2 - gapX * (slots - 1)) / slots,
      (availH - fixedH) / rowUnits,
      maxCell,
    )),
  );
  const stepY = cell + gapY;
  const hoverStep = overlapStep * cell;
  const headH = (cap - 1) * hoverStep + cell + gapY + headMargin;
  const groupW = slots * cell + gapX * (slots - 1);
  const slotH = cap * cell + (cap - 1) * gapY;
  return {
    cell,
    pad,
    gapX,
    gapY,
    stepX: cell + gapX,
    stepY,
    hoverStep,
    font: Math.max(Math.round(12 * k), Math.round(cell * 0.55)),
    // 槽位整体在棋盘里居中（格子取整后会剩几个 rpx）
    offsetX: pad + Math.max(0, (CARD_W_RPX - pad * 2 - groupW) / 2),
    headH,
    slotTop: pad + headH,
    slotH,
    height: pad * 2 + headH + slotH,
  };
});

const boardStyle = computed(() => ({
  height: `${metrics.value.height}rpx`,
  // 失败演出用：整摞抬起「一格」的高度（= 槽里相邻两张的间距）与单个槽的时长
  '--wave-lift': `${metrics.value.stepY}rpx`,
  '--wave-ms': `${WAVE_MS}ms`,
}));

// 槽位底座（只到槽口）与点击热区（连槽口上方的空白带一起）
const slotBoxes = computed(() => {
  const m = metrics.value;
  return Array.from({ length: cfg.value.slots }, (_, i) => ({
    left: `${m.offsetX + i * m.stepX}rpx`,
    top: `${m.slotTop}rpx`,
    width: `${m.cell}rpx`,
    height: `${m.slotH}rpx`,
  }));
});
const hitBoxes = computed(() => {
  const m = metrics.value;
  // 热区把槽与槽之间的缝也算进来（点击目标是整列，缝里的点击也归最近这一列）
  return Array.from({ length: cfg.value.slots }, (_, i) => ({
    left: `${m.offsetX + i * m.stepX - m.gapX / 2}rpx`,
    top: `${m.pad}rpx`,
    width: `${m.cell + m.gapX}rpx`,
    height: `${m.headH + m.slotH}rpx`,
  }));
});

function fruitStyle(f) {
  const m = metrics.value;
  const top = f.lift >= 0
    ? m.slotTop - m.gapY - m.cell - f.lift * m.hoverStep
    : m.slotTop + (capacity.value - 1 - f.depth) * m.stepY;
  return {
    left: `${m.offsetX + f.slot * m.stepX}rpx`,
    top: `${top}rpx`,
    width: `${m.cell}rpx`,
    height: `${m.cell}rpx`,
    fontSize: `${m.font}rpx`,
    // 一摞里越靠上的越要盖在上面（层级按它在槽里的层数走）
    zIndex: f.flying ? 30 + f.depth : 1,
    // 抬起 / 平移 / 落下的三段位移都靠这两条过渡；时长与错峰由当前这一段给
    transition: `left ${f.moveMs}ms ease, top ${f.moveMs}ms ease`,
    transitionDelay: `${f.delay}ms`,
    animationDelay: dealing.value ? `${f.deal * 18}ms` : (waving.value ? `${f.slot * WAVE_STEP_MS}ms` : '0ms'),
  };
}

// 正面朝上 = 状态上已经翻过来了，且不在「等落定再翻面」的过渡里
function faceUp(f) {
  return !f.pending && f.depth >= (hidden.value[f.slot] || 0);
}

function isTarget(i) {
  if (autoTarget.value === i) return true;     // 自动搬运途中：目标槽保持高亮
  if (selected.value < 0 || selected.value === i) return false;
  return moveCount(piles.value, selected.value, i, capacity.value) > 0;
}

// ---------- 存档 ----------
function save() {
  setJSON(stateKey(), {
    level: level.value,
    mode: mode.value,
    moves: moves.value,
    hidden: hidden.value,
    // 水果按 [种类, 槽位, 层数] 存，顺序即 id
    fruits: fruits.value.map(f => [f.kind, f.slot, f.depth]),
    phase: phase.value,
  });
}

function restore() {
  try {
    const saved = getJSON(stateKey());
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
    deal: 0,
  };
}

let dealTimer = null;
let wonTimer = null;
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
  autoTarget.value = -1;
  clearTimeout(dealTimer);
  dealTimer = null;
  clearTimeout(wonTimer);
  wonTimer = null;
  phaseTimers.forEach(clearTimeout);
  phaseTimers = [];
  fruits.value.forEach((f) => {
    f.lift = -1;
    f.flying = false;
    f.transit = false;
    f.pending = false;
  });
  dealing.value = false;
  busy = false;
  liftUntil = 0;
  deferred = null;
  // 防御：切玩法时槽数会变，渲染前先把选中态清掉，免得 pickedIds 读到越界的槽
  selected.value = -1;
  // 演出没播完就被换局 / 卸载时，异步流程会靠 generation 自己收手，但这两个标志要复位
  failing.value = false;
  waving.value = false;
  justWon.value = false;
}

// 逐张入场：从左到右、每槽自下而上（堆起来的感觉），结束后恢复无延迟
function startDealing() {
  clearTimeout(dealTimer);
  dealing.value = true;
  dealTimer = setTimeout(() => { dealing.value = false; }, fruits.value.length * 18 + 380);
}

// 视口（H5 的 innerHeight 含 uni 自带导航栏，要扣掉）
function readViewport() {
  if (typeof window !== 'undefined' && typeof window.innerWidth === 'number' && window.innerWidth) {
    const head = typeof document !== 'undefined' ? document.querySelector('uni-page-head') : null;
    return { w: window.innerWidth, h: window.innerHeight, head: head ? head.offsetHeight || 0 : 0 };
  }
  try {
    const s = uni.getSystemInfoSync();
    return { w: s.windowWidth || 393, h: s.windowHeight || 852, head: 0 };
  } catch {
    return { w: 393, h: 852, head: 0 };
  }
}

function onResize() {
  viewport.value = readViewport();
}

onMounted(() => {
  if (typeof uni.onWindowResize === 'function') uni.onWindowResize(onResize);
  bootMode();
});

onHide(() => {
  // 没有逐帧循环；离开时把局面落一次档（每次搬运落定也都会存）
  save();
});

onUnmounted(() => {
  disposed = true;
  if (typeof uni.offWindowResize === 'function') uni.offWindowResize(onResize);
  clearTransient();
});

function initLevel(lv) {
  clearTransient();
  confirming.value = false;
  level.value = Math.max(1, lv);
  setRaw(levelKey(), String(level.value));
  if (level.value > bestLevel.value) {
    bestLevel.value = level.value;
    setRaw(bestKey(), String(bestLevel.value));
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
  setRaw(levelKey(), '');   // 空串在 core/storage 里读出来就是 null，等同 web 的 removeItem
  setRaw(stateKey(), '');
  setRaw(bestKey(), '');
  bestLevel.value = 1;
  initLevel(1);
}

// 切换玩法：先把当前玩法落档，再按另一种玩法自己的关卡 / 存档接着玩
function toggleMode() {
  save();
  clearTransient();
  mode.value = mode.value === 1 ? 2 : 1;
  setRaw(MODE_KEY, String(mode.value));
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
  if (phase.value === PLAY) {
    startDealing();
    evaluate(true);     // 存档可能是动画没播完就退出时的局面，补判一次死局（恢复不播演出）
  } else save();
}

// ---------- 操作 ----------
// 抬起随时都能做：上一步搬运的动画还在播，也不耽误把另一摞抬起来。
// 只有「搬运」本身是串行的——动画期间点的目标槽会记下来，等这一手落定再搬
function onSlotClick(i) {
  if (phase.value !== PLAY || dealing.value || failing.value) return;
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
  lastFlipAt = Date.now();
}

// 把槽口那一摞（只算正面朝上的）抬到槽口上方的空白带里
function liftRun(i) {
  const pile = piles.value[i].items;
  const n = topRun(piles.value[i]);
  if (!n) return;
  autoTarget.value = -1;                       // 新抬起的一摞重新判定
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
  // 抬起来之后，如果全场只有这一个槽放得下，就不用玩家再点第二下：直接搬过去。
  const targets = moveTargets(piles.value, i, capacity.value);
  if (targets.length === 1) {
    const { to, count } = targets[0];
    autoTarget.value = to;                     // 搬运途中目标槽继续亮着
    if (busy) deferred = { type: 'move', slot: i, to };
    else performMove(i, to, count);
  }
}

// 把抬起的一摞放回它自己的槽里（取消选中）
function dropRun(i) {
  autoTarget.value = -1;
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
  const liftedRun = fruits.value.filter(f => f.slot === from && f.lift >= 0).length;
  moved.forEach((f, i) => {
    f.slot = to;
    f.depth = dstLen + i;
    f.moveMs = TRAVEL_MS;
    f.delay = (n - 1 - i) * STAGGER_MS;
  });
  // 目标装不下整摞时只搬得下 n 张，剩下那几张落回原来的槽里
  if (n < liftedRun) dropRun(from);
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

  moved.forEach((f) => {
    f.flying = false;
    f.transit = false;
  });
  // 第四段：这一摞落定了，才翻开源槽槽口新露出来的那张
  if (exposedWasHidden && exposed.pending) reveal(exposed);

  busy = false;
  autoTarget.value = -1;
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

// 每手落定后判一次胜负：先看过关，再看是不是「从这个局面出发已经怎么走都赢不了」的死局。
// silent = 恢复存档时的补判：状态照改，但不放彩带 / 不播失败演出与音效
function evaluate(silent = false) {
  if (phase.value !== PLAY) return;
  if (isWon(piles.value, cfg.value.copies, cfg.value.kinds)) {
    phase.value = WON;
    save();
    if (!silent) celebrate();
    return;
  }
  if (isDeadEnd(piles.value, cfg.value)) failSequence(silent);
}

// 过关的这一刻：彩带 + success（web 的 confetti() 内部就是 celebrate → playWin）
function celebrate() {
  justWon.value = true;
  clearTimeout(wonTimer);
  wonTimer = setTimeout(() => { justWon.value = false; }, 4000);
  playWin();
}

// 失败演出：① 等刚翻出来的那张播完翻面；② 停 0.5s；
// ③ 每个槽整摞抬起一格再落下（从左到右错峰）；④ 全部落定才弹失败层。
// 期间 failing = true，玩家的操作一律不响应
async function failSequence(silent = false) {
  if (failing.value || phase.value !== PLAY) return;
  // 恢复存档时的补判：直接落到失败态，不重播那段「整盘叹气」的动画
  if (silent) {
    phase.value = OVER;
    save();
    return;
  }
  const gen = generation;
  failing.value = true;
  await sleep(Math.max(0, FLIP_MS - (Date.now() - lastFlipAt)));
  if (gen !== generation) return;
  await sleep(FAIL_PAUSE_MS);
  if (gen !== generation) return;
  waving.value = true;
  await sleep(WAVE_MS + WAVE_STEP_MS * (cfg.value.slots - 1) + 60);
  if (gen !== generation) return;
  waving.value = false;
  failing.value = false;
  if (phase.value !== PLAY) return;
  phase.value = OVER;
  playLose();
  save();
}

// ---------- 帮助 ----------
const helpOpen = ref(false);
const HELP_KEYS = ['helpMsg', ...Array.from({ length: 9 }, (_, i) => `help${i + 1}`)];
// 帮助文案 = web cn 段的 helpMsg + help1..help9（\n\n 连接，HelpSheet 会拆成段落）
const helpText = computed(() => HELP_KEYS
  .map(k => tt(k))
  .filter((v, i) => v && v !== HELP_KEYS[i])
  .join('\n\n'));
function showHelp() {
  helpOpen.value = true;
}
</script>

<style lang="scss" scoped>
/* 发牌：从 0.4 缩放淡入（web 的 deal 关键帧） */
@keyframes sort-deal {
  from { opacity: 0; transform: scale(0.4); }
  to { opacity: 1; transform: scale(1); }
}
/* 失败演出：整摞抬起一格再落回原处（只动 transform，不碰 left/top 的搬运过渡） */
@keyframes sort-wave {
  0%, 100% { transform: translateY(0); }
  45% { transform: translateY(calc(-1 * var(--wave-lift))); }
}

/* 一页只允许一处 min-height: 100vh（就在 .screen 上） */
.screen {
  min-height: 100vh;
  background: transparent;  /* 背景交给 ParticleBackground（canvas 自己铺底色） */
}
.page {
  padding: 27rpx 24rpx 140rpx;    /* 底部 140rpx 让开右下角悬浮按钮 */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 31rpx;                    /* = web 的 --row-gap: 16px */
  background: #f0f2f5;
  color: #2c3e50;
}

/* ---------- 统计条（高度由 App.vue 的全局 .score-area 给） ---------- */
.score-area {
  position: relative;
  width: 690rpx;
  display: flex;
  align-items: center;
  padding: 0 19rpx;
  overflow: hidden;
}
.stat {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4rpx;                     /* web 的 gap: 2px */
}
.stat-label {
  font-size: 23rpx;              /* 12px */
  color: #5f6b7a;
  line-height: 1.2;
  white-space: nowrap;
}
.stat-value {
  font-size: 42rpx;              /* 22px */
  font-weight: bold;
  line-height: 1.2;
  color: #2c3e50;
  font-variant-numeric: tabular-nums;
}
.divider {
  width: 2rpx;                   /* 1px */
  height: 46rpx;                 /* 24px */
  align-self: center;
  background: #e1e1e1;
  opacity: 0.6;
}
/* 本关进度条：贴在统计卡底边（web 的 .progress / .progress-bar） */
.progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 6rpx;                  /* 3px */
  background: #eef0f3;
}
.progress-bar {
  height: 100%;
  background: #23804e;
  transition: width 0.3s ease;
}

/* ---------- 操作区（高度由 App.vue 的全局 .opt-area 给；1.6 : 1.2 分格） ---------- */
.opt-area {
  width: 690rpx;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}
.opt-half {
  flex: 1.6;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}
.start-wrapper {
  flex: 1.2;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}
.level-note {
  font-size: 27rpx;              /* 14px */
  color: #5f6b7a;
  white-space: nowrap;
}
/* 主按钮：web 的 .game-icon（8px 16px / 14px 粗体 / 8px 圆角 / 品牌绿） */
.game-icon {
  margin: 0;
  padding: 0 31rpx;
  height: 71rpx;
  line-height: 71rpx;
  border: 0 none;
  border-radius: 15rpx;
  background: #23804e;
  color: #fff;
  font-size: 27rpx;
  font-weight: bold;
  white-space: nowrap;
  box-sizing: border-box;
}

/* ---------- 游戏区：点阵底纹 + 槽位 ---------- */
.game-area {
  position: relative;
  width: 690rpx;
}
/* web 的 .board.dot-board：底色 #bbada0 + 10px 一格的点阵 */
.board {
  position: relative;
  width: 100%;
  border-radius: 27rpx;
  box-sizing: border-box;
  background-color: #bbada0;
  background-image: radial-gradient(circle, rgba(255, 255, 255, 0.18) 2rpx, transparent 2rpx);
  background-size: 19rpx 19rpx;  /* web 的 10px 一格 */
  background-position: 10rpx 10rpx;
}
/* 槽位底座：淡淡的容器色 + 虚线描边，选中 / 可放置时换成主色 */
.slot-bg {
  position: absolute;
  z-index: 0;
  pointer-events: none;
  box-sizing: border-box;
  border-radius: 15rpx;
  border: 2rpx dashed #c9d0da;
  background: rgba(238, 228, 218, 0.35);
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}
.slot-bg.picked {
  border-style: solid;
  border-color: #23804e;
  box-shadow: 0 0 0 4rpx #23804e;
}
.slot-bg.ready {
  border-color: #23804e;
  background: #e5f6ec;
}
/* 点击热区：整列（含槽口上方空白带）都可点 */
.slot-hit {
  position: absolute;
  z-index: 3;
  -webkit-tap-highlight-color: transparent;
}

/* ---------- 水果：定位层（只管位置 / 尺寸 / 发牌与失败动画 + left/top 过渡） ---------- */
.fruit {
  position: absolute;
  box-sizing: border-box;
  border-radius: 15rpx;
  box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.12);   /* web 的 --shadow-soft */
  pointer-events: none;
  will-change: transform;
}
/* 发牌只在入场期间生效：结束后规则移除，翻面 / 搬运的动画不会被它顶掉 */
.fruit.dealing {
  animation: sort-deal 0.35s ease backwards;
}
.fruit.waving {
  animation: sort-wave var(--wave-ms, 400ms) cubic-bezier(0.34, 1.2, 0.64, 1);
}
.fruit.picked {
  box-shadow: 0 0 0 4rpx #23804e;
}

/* ---------- 翻面（§二十一「翻面动画唯一标准」：三层结构 + 两面常驻） ---------- */
/* 3D 舞台：perspective 只放这一层，不放动画 */
.flip {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  perspective: 700rpx;
}
.face {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border-radius: 15rpx;
  border: 2rpx solid #c9d0da;
  transform: rotateY(0deg);
  /* 真 3D 翻转：两面各自绕 Y 轴转 180°（0.46s）；透明度 0.01s + 0.225s 延迟，
     正好在牌侧立 90° 那一刻瞬切 → 永远看不到镜像的背面 */
  transition-property: transform, opacity;
  transition-duration: 0.46s, 0.01s;
  transition-timing-function: ease-in-out, linear;
  transition-delay: 0s, 0.225s;
}
/* 默认必须「背面朝上」—— up 表示翻开 */
.face-back {
  transform: rotateY(0deg);
  opacity: 1;
  background: #23804e;
  border-color: #23804e;
  color: #fff;
}
.face-front {
  transform: rotateY(180deg);
  opacity: 0;
  background: #fff;
  color: #2c3e50;
}
.fruit.up .face-back {
  transform: rotateY(180deg);
  opacity: 0;
}
.fruit.up .face-front {
  transform: rotateY(0deg);
  opacity: 1;
}
/* 图标类只能放内层：i-xxx 会给自己加 mask + background-color: currentColor */
.back-ico {
  pointer-events: none;
}
.fruit-face {
  line-height: 1;
}

/* ---------- 结算层：与游戏区完全同矩形 ---------- */
.result {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  z-index: 4;
  box-sizing: border-box;
  border-radius: 27rpx;
  background: rgba(255, 255, 255, 0.8);
  color: #12833f;
  font-weight: bold;
  font-size: 34rpx;              /* 18px */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 23rpx;                    /* web 的 gap: 12px */
  padding: 23rpx;
  text-align: center;
}
.result.lose {
  color: #b11;
}
.final-time {
  font-size: 53rpx;              /* 28px */
  font-variant-numeric: tabular-nums;
}
/* 结算层/遮罩里的按钮行：横排、居中、12px 间隔（规范见 docs/CONVENTIONS.md） */
.result-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 23rpx;
}

/* ---------- 新游戏二次确认（与消消乐 / 大师同一套本地弹窗） ---------- */
.confirm-mask {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
}
.confirm-box {
  width: calc(100% - 122rpx);
  max-width: 610rpx;
  padding: 38rpx 38rpx 31rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  border-radius: 27rpx;
  background: #fff;
  color: #2c3e50;
}
.confirm-title {
  font-size: 32rpx;
  font-weight: bold;
  margin-bottom: 15rpx;
}
.confirm-msg {
  font-size: 27rpx;
  opacity: 0.8;
  line-height: 1.5;
  margin-bottom: 31rpx;
}
.confirm-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 19rpx;
}
.confirm-actions button {
  margin: 0;
  padding: 0 23rpx;
  height: 62rpx;
  line-height: 62rpx;
  font-size: 27rpx;
  border: 0;
  border-radius: 15rpx;
  white-space: nowrap;
  box-sizing: border-box;
}
.confirm-cancel {
  background: #eef0f4;
  color: #2c3e50;
}
.confirm-actions .confirm-replay {
  background: transparent;
  border: 2rpx solid #c2410c;
  color: #c2410c;
  font-weight: bold;
}
.confirm-ok {
  background: #23804e;
  color: #fff;
  font-weight: bold;
}
</style>
