<template>
  <view class="screen">
    <!-- 全站背景（粒子连线 + 底部过山车，与 web 的 ParticleBackground 同款） -->
    <ParticleBackground />
    <view class="page" @touchstart="onTouchStart" @touchend="onTouchEnd" @touchcancel="onTouchCancel">
      <!-- 统计条：关卡 / 剩余牌 / 剩余步数（底部一条本关进度） -->
      <view class="card score-area">
        <view class="stat">
          <text class="stat-label">{{ tt('level') }}</text>
          <text class="stat-value">{{ level }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('left') }}</text>
          <text class="stat-value">{{ tilesLeft }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('moves') }}</text>
          <text class="stat-value">{{ movesLeft }}</text>
        </view>
        <!-- 本关进度条（已消除张数 / 14） -->
        <view class="progress"><view class="progress-bar" :style="{ width: progress + '%' }" /></view>
      </view>

      <!-- 操作区：左「新游戏」、右「上帝模式」（与 web 一致） -->
      <view class="card opt-area">
        <view class="start-wrapper">
          <button class="game-icon" @click="confirming = true">{{ tt('start') }}</button>
        </view>
        <view class="divider" />
        <view class="opt-half">
          <button class="game-icon god-btn" :disabled="!canGod && !godPlaying" @click="godPlay">
            {{ godPlaying ? tt('godStop') : tt('godMode') }}
          </button>
        </view>
      </view>

      <!-- 游戏区：5×5 棋盘；结算层正好盖住这块 -->
      <view class="game-area" :style="{ width: boardW + 'rpx', height: boardH + 'rpx' }">
        <view
          class="board dot-board"
          :style="{
            width: boardW + 'rpx',
            height: boardH + 'rpx',
            padding: PAD + 'rpx',
            gap: GAP + 'rpx',
          }"
          @touchmove.stop.prevent="noop"
        >
          <!-- 网格底纹：常驻 25 格 -->
          <view v-for="i in CELLS" :key="'g' + i" class="grid-cell" :style="cellPos(i - 1)" />
          <!-- 可消牌组的高亮边框：圈住整组。等牌全部铺开之后再出现（铺牌期间 groups 为空） -->
          <view
            v-for="(g, i) in ringGroups"
            :key="'r' + i + '-' + g.cells.join('-')"
            class="group-ring"
            :style="ringStyle(g)"
          />
          <!-- 点齐两张后的消除提示（类 tooltip）：只在真有一对可消时出现，且只给「消除这一对」 -->
          <view
            v-if="hint"
            class="clear-tip"
            :class="{ below: hint.below }"
            :style="hintStyle"
            @click.stop="clearGroup(hint.pair)"
          >
            <text class="tip-act">✨ {{ tt('clearPair') }}</text>
          </view>

          <!-- 上帝模式播放期间盖一层透明遮罩：挡住点击 / 滑动，和点击游戏同款做法 -->
          <view v-if="godPlaying" class="automask" />
          <!-- 牌：绝对定位，滑动时靠 left/top 过渡动画 -->
          <view
            v-for="t in tiles"
            :key="dealSeq + '-' + t.id"
            class="tile"
            :class="{ active: selected.includes(t.cell), dealt: dealing }"
            :style="tileStyle(t)"
            @click.stop="onTileClick(t)"
          >
            <MahjongTile :suit="t.suit" :value="t.num" class="mj" />
          </view>
          <!-- 刚消掉的牌：留在场上播「闪烁 → 消失」。
               注意不能只靠给 tiles 里的牌加 .clearing —— 消除时格子已经置 null、牌立刻就不在 tiles 里了 -->
          <view
            v-for="t in clearingTiles"
            :key="'clear-' + t.id"
            class="tile clearing"
            :style="tileStyle(t)"
          >
            <MahjongTile :suit="t.suit" :value="t.num" class="mj" />
          </view>
        </view>

        <view v-if="phase !== PLAY" class="result" :class="phase === WON ? 'win' : 'lose'">
          <template v-if="phase === WON">
            <text class="result-main">🎉🎉 {{ tt('tipWin') }} 🎉🎉</text>
            <text class="level-note">{{ tt('levelDone').replace('{n}', level) }}</text>
            <view class="result-btns">
              <button class="game-icon replay-btn" @click="retryLevel">{{ tt('replayLevel') }}</button>
              <button class="game-icon" @click="nextLevel">{{ tt('nextLevel') }}</button>
            </view>
          </template>
          <template v-else>
            <text class="result-main">💤💤 {{ tt('tipLost') }} 💤💤</text>
            <text class="level-note">{{ tt('level') }} {{ level }}</text>
            <button class="game-icon replay-btn" @click="retryLevel">{{ tt('replayLevel') }}</button>
          </template>
        </view>
      </view>

      <!-- 撤销 / 重做：放在游戏区下方（与点击游戏同一套做法） -->
      <view class="card undo-card">   <!-- 右侧靠 padding 让开右下角悬浮按钮 -->
        <view class="undo-item">
          <button class="undo" :disabled="!canUndo || godPlaying" @click="undo">
            <view class="i-carbon-undo" />
            <text>{{ tt('undo') }}</text>
          </button>
        </view>
        <view class="divider" />
        <view class="undo-item">
          <button class="undo" :disabled="!canRedo || godPlaying" @click="redo">
            <view class="i-carbon-redo" />
            <text>{{ tt('redo') }}</text>
          </button>
        </view>
      </view>
    </view>

    <!-- 新游戏二次确认（web 的 shared/ConfirmDialog 三按钮版；小程序没有共享弹窗，这里本地实现） -->
    <view v-if="confirming" class="confirm-mask" @click="confirming = false">
      <view class="card confirm-box" @click.stop>
        <text class="confirm-title">{{ tt('confirmTitle') }}</text>
        <text class="confirm-msg">{{ tt('confirmMsg') }}</text>
        <view class="confirm-actions">
          <button class="confirm-cancel" @click="confirming = false">{{ tt('cancel') }}</button>
          <button class="confirm-replay" @click="retryLevel">{{ tt('confirmReplay') }}</button>
          <button class="confirm-ok" @click="startNewGame">{{ tt('confirmOk') }}</button>
        </view>
      </view>
    </view>

    <!-- 胜利彩带（只在真正赢下这一刻放；恢复存档不放） -->
    <Confetti v-if="justWon" />
    <FloatingActions>
      <!-- 模式切换：老模式「一路滑到底」/ 新模式「一次一格」（图标与 web 同一套） -->
      <view class="fab" @click="toggleMode">
        <view class="fab-ico" :class="mode === 1 ? 'i-mdi-arrow-right-bold' : 'i-mdi-arrow-right-bold-outline'" />
      </view>
      <view class="fab" @click="showHelp"><view class="fab-ico i-carbon-help" /></view>
    </FloatingActions>
    <HelpSheet :open="helpOpen" :text="helpText" @close="helpOpen = false" />
  </view>
</template>

<script setup>
// 雀圣 · 微信小程序版
// 纯逻辑来自 web 的 board.js（**原样复制**：发牌 = 摆牌 + 束搜索求解 + 真实规则复演、
// 两套滑动规则、找可消组、关卡曲线、上帝模式求解器），这里只重写视图：
// - localStorage → core/storage（存档 key 与 web 完全一致）
// - Web Audio → core/sfx
// - Pointer Events → touchstart / touchend；雪碧图 background → <MahjongTile>
// - getBoundingClientRect → 不依赖 DOM 测量：棋盘尺寸按 rpx 由视口算出（与 web 的 computeMetrics 同口径）
import { computed, onMounted, onUnmounted, ref } from 'vue';

import Confetti from '@/components/Confetti.vue';
import FloatingActions from '@/components/FloatingActions.vue';
import HelpSheet from '@/components/HelpSheet.vue';
import MahjongTile from '@/components/MahjongTile.vue';
import { playElimination, playLose, playWin } from '@/core/sfx';
import { getJSON, getRaw, setRaw } from '@/core/storage';
import { TILE_RATIO, preloadTiles } from '@/shared/mahjongTiles';
import { tt } from './i18n';
import {
  CELLS, HAND_TILES, SIZE, findGroups, levelConfig, newGame, sameBoard, slideBy, solveBeam, solvePuzzle,
} from './board';

import { setNavTitle } from '@/core/i18n';
import ParticleBackground from '@/components/ParticleBackground.vue';

// 原生导航栏标题跟随语言（pages.json 里的标题是静态的）
setNavTitle(() => tt('gameTitle'));
// 两种模式各自独立的记录：老模式沿用原来的 key，新模式加 _2 后缀（与麻将英雄同一套约定）
const MODE_KEY = '__quesheng__mode';           // 1 = 老模式（滑到底）/ 2 = 新模式（一次一格）
const BEST_KEY = () => (mode.value === 2 ? '__quesheng__level_2' : '__quesheng__level');
const STATE_KEY = () => (mode.value === 2 ? '__quesheng__state_2' : '__quesheng__state');
const mode = ref(+(getRaw(MODE_KEY) || 1) === 2 ? 2 : 1);
const [PLAY, WON, OVER] = ['play', 'won', 'over'];
const SWIPE_MIN = 24;            // 滑动判定的最小位移（px，touch 的 clientX/Y 就是 px）
const CLEAR_MS = 520;
const DEAL_MS = 340;             // 单张牌的入场动画时长（与 qs-deal 保持一致）

const level = ref(1);
const board = ref(new Array(CELLS).fill(null));   // 每个格子放一张牌（或 null）
const movesLeft = ref(0);
const phase = ref(PLAY);
const selected = ref([]);        // 已点选、准备消掉的牌所在的格子
const clearing = ref(new Map()); // 正在闪烁消失的牌 id -> 牌
const groups = ref([]);          // 当前所有可消牌组
const dealing = ref(false);      // 开局铺牌动画中
const dealSeq = ref(0);          // 每次铺牌 +1：让 :key 变化，牌元素重建、入场动画才会重播
const confirming = ref(false);
const history = ref([]);         // undo 栈
const future = ref([]);          // redo 栈
const justWon = ref(false);
// ---------- 上帝模式 ----------
// 只对「还没动过的开局」开放（和点击游戏的上帝模式一样）：发牌时 newGame 已经把解算好放在这里，
// 所以点下去是零延迟开始播；万一没有（例如是旧存档恢复出来的局面）就现场再解一次。
const godPlaying = ref(false);
const godSolution = ref(null);
const GOD_SLIDE_MS = 620;        // 一次滑动：过渡 0.17s + 停留让人看清
const GOD_PICK_MS = 360;         // 消除前先把这一组点亮，让玩家看清消的是哪组
const GOD_CLEAR_MS = 600;        // 闪烁消除 520ms + 余量
let godTimers = [];              // 可取消的等待（卸载 / 停止时立刻唤醒）
const godSleep = ms => new Promise(resolve => {
  const one = { id: 0, resolve };
  one.id = setTimeout(() => { godTimers = godTimers.filter(x => x !== one); resolve(); }, ms);
  godTimers.push(one);
});
function stopGod() {
  godPlaying.value = false;
  godTimers.forEach(t => clearTimeout(t.id));
  godTimers.forEach(t => t.resolve());
  godTimers = [];
}
// 一点击就落定的防抖：滑动手势结束后浏览器还会补一个 tap，别让它又清掉一组
let suppressClickUntil = 0;
let wonTimer = 0;

// ---------- 尺寸（rpx） ----------
// web 是按 px 量视口算格子；小程序里棋盘尺寸完全由 rpx 决定（750rpx = 屏宽），
// 所以把 web 的 computeMetrics 换成同一套口径的 rpx 版本：宽度优先、屏太矮时按高度缩格子。
const GAP = 12;                  // 棋缝 6px
const PAD = 15;                  // 棋盘内边距 8px
const CW_MAX = 150;              // 78px
const CW_MIN = 65;               // 34px
// 页面里除棋盘外的固定高度（rpx）：上下 padding 36+48、统计条 138、操作区 138、
// 三处块间距 36×3、下方撤销卡 ≈100
// 与其它页面统一：统计条吃全局 .score-area 168rpx、操作区吃 .opt-area 120rpx
const PAGE_FIXED_H = 36 + 140 + 168 + 120 + 36 * 3 + 100;   // 撤销卡 100；底部 140 让开悬浮按钮，让整块让开悬浮按钮

const metrics = ref({ cell: 122, cellH: Math.round(122 * TILE_RATIO) });
const cell = computed(() => metrics.value.cell);
const cellH = computed(() => metrics.value.cellH);
// 牌是 131:168 的竖牌，所以纵向步长 != 横向步长（网格行高也必须按牌高走，
// 否则每行都会被下一行压住、牌面下半截被切掉 —— 根 AGENTS 里记过这个 grid 坑）
const stepX = computed(() => cell.value + GAP);
const stepY = computed(() => cellH.value + GAP);
const boardW = computed(() => cell.value * SIZE + GAP * (SIZE - 1) + PAD * 2);
const boardH = computed(() => cellH.value * SIZE + GAP * (SIZE - 1) + PAD * 2);
// 网格底纹用**和牌完全相同的绝对定位**（不再依赖 flex 的 gap：小程序里 gap 支持不稳，
// 一格差一点就会让牌和背景格子整体错位）
const cellPos = (c) => ({
  left: `${PAD + (c % SIZE) * stepX.value}rpx`,
  top: `${PAD + Math.floor(c / SIZE) * stepY.value}rpx`,
  width: `${cell.value}rpx`,
  height: `${cellH.value}rpx`,
});

// 注意要加上棋盘自己的 padding：绝对定位的包含块是 padding box，
// 而网格里的格子是从内容盒（= padding 之内）开始排的，少了这个偏移整盘牌会往左上偏
const posOf = c => ({
  left: `${PAD + (c % SIZE) * stepX.value}rpx`,
  top: `${PAD + Math.floor(c / SIZE) * stepY.value}rpx`,
});
// 小程序对「样式数组」的支持不稳（H5 正常、mp 可能整段丢失）→ 合并成一个对象
const tileStyle = t => ({
  ...posOf(t.cell),
  width: `${cell.value}rpx`,
  height: `${cellH.value}rpx`,
  ...(t.delay ? { animationDelay: `${t.delay}ms` } : null),
});

function readViewport() {
  // H5 的 innerHeight 含 uni 自带的导航栏（44px），而小程序的 windowHeight 已经扣掉了原生导航栏
  if (typeof window !== 'undefined' && window.innerWidth) {
    const head = typeof document !== 'undefined' ? document.querySelector('uni-page-head') : null;
    return { w: window.innerWidth, h: window.innerHeight - (head ? head.offsetHeight : 0) };
  }
  try {
    const s = uni.getSystemInfoSync();
    return { w: s.windowWidth || 393, h: s.windowHeight || 852 };
  } catch {
    return { w: 393, h: 852 };
  }
}

function computeMetrics() {
  const { w, h } = readViewport();
  const pxToRpx = 750 / w;
  const byW = (690 - PAD * 2 - GAP * (SIZE - 1)) / SIZE;                       // 卡片宽 690rpx
  const byH = ((h * pxToRpx - PAGE_FIXED_H - PAD * 2 - GAP * (SIZE - 1)) / SIZE) / TILE_RATIO;
  const fit = Math.round(Math.max(CW_MIN, Math.min(byW, byH, CW_MAX)));
  metrics.value = { cell: fit, cellH: Math.round(fit * TILE_RATIO) };
}

// ---------- 牌 ----------
const tiles = computed(() => board.value
  .map((t, c) => (t ? { ...t, cell: c } : null))
  .filter(Boolean));
const clearingTiles = computed(() => [...clearing.value.values()]);
const tilesLeft = computed(() => tiles.value.filter(t => !clearing.value.has(t.id)).length);
const progress = computed(() => Math.min(100, Math.round(((HAND_TILES - tilesLeft.value) / HAND_TILES) * 100)));
const canUndo = computed(() => history.value.length > 0 && phase.value === PLAY);
const canRedo = computed(() => future.value.length > 0 && phase.value === PLAY);

// ---------- 开局 ----------
let timers = [];
const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

// 切换模式：存下当前模式、切过去恢复那个模式的存档（没有就按它自己的最高关卡开新局）
function toggleMode() {
  stopGod();
  mode.value = mode.value === 2 ? 1 : 2;
  setRaw(MODE_KEY, String(mode.value));
  godSolution.value = null;
  if (!restoreState()) startLevel(Math.max(1, +(getRaw(BEST_KEY()) || 1)));
}

function startLevel(lv) {
  clearTimers();
  level.value = Math.max(1, lv);
  const { board: b, moves, solution } = newGame(level.value, Math.random, mode.value);
  board.value = b;
  godSolution.value = solution || null;   // 发牌时就算好的解（上帝模式直接用）
  stopGod();
  groups.value = [];        // 铺牌期间不显示高亮框
  movesLeft.value = moves;
  phase.value = PLAY;
  selected.value = [];
  clearing.value = new Map();
  history.value = [];
  future.value = [];
  // 铺牌动画：按「从左上到右下」的次序逐张出现
  dealing.value = true;
  dealSeq.value += 1;
  // 波浪：延迟按「行 + 列」递增，波前从左上角一路扫到右下角
  board.value = board.value.map((t, c) => (t
    ? { ...t, delay: (Math.floor(c / SIZE) + (c % SIZE)) * 60 }
    : null));
  const last = (SIZE - 1) * 2 * 60 + DEAL_MS;
  timers.push(setTimeout(() => {
    dealing.value = false;
    board.value = board.value.map(t => (t ? { ...t, delay: 0 } : null));
    refreshGroups();          // 牌全部铺完之后才显示可消高亮
  }, last));
  save();
}

function retryLevel() {
  confirming.value = false;
  startLevel(level.value);
}

function nextLevel() {
  startLevel(level.value + 1);
}

function startNewGame() {
  confirming.value = false;
  startLevel(1);
}

// ---------- 可消牌组 ----------
function refreshGroups() {
  groups.value = findGroups(board.value);
  // 选中的牌若已经不在任何可消组里，清掉选择
  if (selected.value.length) {
    const inSome = groups.value.some(g => selected.value.every(c => g.cells.includes(c)));
    if (!inSome) selected.value = [];
  }
}

// 实际画出来的高亮框：三张组旁边的「两两对子」框是多余的（刻子会同时产生 [0,1]、[1,2] 两个对子），
// 只留三张那张。注意只影响**显示** —— groups 里仍保留对子，因为「消除这一对」还要靠它。
const ringGroups = computed(() => {
  const melds = groups.value.filter(g => g.cells.length === 3);
  return groups.value.filter(g => !(g.cells.length === 2
    && melds.some(m => g.cells.every(c => m.cells.includes(c)))));
});

// 一组牌的外框（圈住整组）
function ringStyle(g) {
  const rs = g.cells.map(c => Math.floor(c / SIZE));
  const cs = g.cells.map(c => c % SIZE);
  const r0 = Math.min(...rs), r1 = Math.max(...rs);
  const c0 = Math.min(...cs), c1 = Math.max(...cs);
  const pad = 6;   // web 的 3px
  return {
    left: `${PAD + c0 * stepX.value - pad}rpx`,
    top: `${PAD + r0 * stepY.value - pad}rpx`,
    width: `${(c1 - c0 + 1) * stepX.value - GAP + pad * 2}rpx`,
    height: `${(r1 - r0 + 1) * stepY.value - GAP + pad * 2}rpx`,
  };
}

// ---------- 点击 ----------
function onTileClick(t) {
  // ⚠️ 这里**不能**再判 `clearing.value.size`：clearGroup() 是**同步**把格子置 null 并
  // refreshGroups() 的，那 520ms 的 `clearing` 只是浮影层（闪烁消失的牌已经不在盘面上了）。
  // 用它挡输入会让「点掉一组之后紧接着点另一组」整整丢掉半秒的操作（用户报过）。
  if (Date.now() < suppressClickUntil) return;   // 滑动手势之后补发的 tap
  if (phase.value !== PLAY || godPlaying.value) return;
  const c = t.cell;
  const hit = groups.value.filter(g => g.cells.includes(c));
  if (!hit.length) { selected.value = []; return; }
  // 已经点过：取消选中
  if (selected.value.includes(c)) {
    selected.value = selected.value.filter(x => x !== c);
    return;
  }
  let next = [...selected.value, c];
  // 选中的牌必须还都在同一个可消组里，否则以刚点的这张重新开始选
  if (!groups.value.some(g => next.every(x => g.cells.includes(x)))) {
    next = groups.value.some(g => g.cells.includes(c)) ? [c] : [];
  }
  selected.value = next;
  // 三张点齐 → 直接消掉
  const done = groups.value.find(g => g.cells.length === 3 && next.length === 3
    && g.cells.every(x => next.includes(x)));
  if (done) { clearGroup(done); return; }
  // 两张：**只**构成一对（这两张不属于任何三张组）时直接消，不必再点提示；
  // 只有当它们同时还能凑成三张组（歧义）时，才留给下面浮出的提示让玩家选
  if (next.length === 2) {
    const pair = groups.value.find(g => g.cells.length === 2 && g.cells.every(x => next.includes(x)));
    const alsoMeld = groups.value.some(g => g.cells.length === 3 && next.every(x => g.cells.includes(x)));
    if (pair && !alsoMeld) clearGroup(pair);
  }
}

// 点齐两张后的提示气泡：**只有「确实能消掉一对」时才浮出来**（点满两张相同的牌、且它们还能
// 与旁边第三张凑成刻子的情形）。顺子点两张没有对子可消，就完全不弹提示（用户要求）。
const hint = computed(() => {
  if (phase.value !== PLAY || selected.value.length !== 2) return null;
  const sel = selected.value;
  const inBoth = groups.value.filter(g => sel.every(c => g.cells.includes(c)));
  const pair = inBoth.find(g => g.cells.length === 2) || null;
  if (!pair) return null;
  // 第三张牌不能被气泡挡住，否则容易误点：纵向避开（它在上方就改到下方显示），
  // 横向也朝远离它的方向贴边对齐（气泡比两张牌还宽时，居中会向旁边溢出压到第三张）
  const rows = sel.map(c => Math.floor(c / SIZE));
  const cols = sel.map(c => c % SIZE);
  const minR = Math.min(...rows), maxR = Math.max(...rows);
  const minC = Math.min(...cols), maxC = Math.max(...cols);
  const thirds = inBoth.filter(g => g.cells.length === 3).flatMap(g => g.cells)
    .filter(c => !sel.includes(c));
  const rowOf = c => Math.floor(c / SIZE);
  const colOf = c => c % SIZE;
  const inCols = c => colOf(c) >= minC && colOf(c) <= maxC;
  const inRows = c => rowOf(c) >= minR && rowOf(c) <= maxR;
  const above = thirds.some(c => inCols(c) && rowOf(c) < minR);
  const below = thirds.some(c => inCols(c) && rowOf(c) > maxR);
  const right = thirds.some(c => inRows(c) && colOf(c) > maxC);
  const left = thirds.some(c => inRows(c) && colOf(c) < minC);
  return {
    pair,
    cells: sel,
    // below = 气泡挂在下方（箭头朝上）；tx 是气泡相对锚点的水平对齐：
    // 第三张在右边就让它向左延伸、在左边就向右延伸，都没有就居中
    below: above && !below,
    tx: right && !left ? '-100%' : (left && !right ? '0%' : '-50%'),
  };
});
// 气泡对齐「这两张牌的整体中心」而不是第二张牌：它比两张牌窄，就不会压到旁边 / 上下方的第三张
const hintStyle = computed(() => {
  const h = hint.value;
  if (!h) return {};
  const pts = h.cells.map(c => ({
    x: PAD + (c % SIZE) * stepX.value,
    y: PAD + Math.floor(c / SIZE) * stepY.value,
  }));
  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);
  // 锚点：tx = -50% 时锚在两张牌的中心；-100% 时锚在右边缘（气泡向左长）；0% 时锚在左边缘
  const anchorX = h.tx === '-100%' ? Math.max(...xs) + cell.value
    : h.tx === '0%' ? Math.min(...xs)
      : (Math.min(...xs) + Math.max(...xs)) / 2 + cell.value / 2;
  const anchorY = h.below
    ? Math.max(...ys) + cellH.value + 12
    : Math.min(...ys) - 12;
  return {
    left: `${anchorX}rpx`,
    top: `${anchorY}rpx`,
    '--tip-tx': h.tx,
    '--tip-ty': h.below ? '0%' : '-100%',
  };
});

function clearGroup(g) {
  pushHistory();
  const going = new Map();
  g.cells.forEach(c => { if (board.value[c]) going.set(board.value[c].id, { ...board.value[c], cell: c }); });
  selected.value = [];
  clearing.value = going;
  playElimination();   // 消掉一组 / 一对
  board.value = board.value.map((t, i) => (g.cells.includes(i) ? null : t));
  refreshGroups();
  timers.push(setTimeout(() => {
    clearing.value = new Map();
    checkEnd();
    save();
  }, CLEAR_MS));
  save();
}

// 上帝模式：只要**当前局面回到本关的初始局**就可用 —— history 为空正是这个意思
//（undo 栈里存的是每一步之前的快照，全部撤销回去 = 发牌时的那个局面；快照连牌 id 都存了，
// 所以缓存的最优解对同一副初始局仍然成立）。**不能再要求 future 为空**：玩家撤销回初始局时，
// future 里正留着刚撤销掉的那些步骤，那样按钮会一直是灰的（用户报过）。
const canGod = computed(() => phase.value === PLAY && !godPlaying.value && !clearing.value.size
  && history.value.length === 0 && tilesLeft.value === HAND_TILES);

async function godPlay() {
  if (godPlaying.value) { stopGod(); return; }        // 播放中再点一下 = 停止
  if (!canGod.value) return;
  // 发牌时就算了，正常一定有解；万一没有（旧存档恢复出来的局面）就现场再解一次，解不出就静默不动
  const solution = godSolution.value
    || solveBeam(board.value, movesLeft.value, mode.value)
    || solvePuzzle(board.value, movesLeft.value, mode.value);
  if (!solution || !solution.length) return;
  godPlaying.value = true;
  await godSleep(420);
  for (const step of solution) {
    if (!godPlaying.value || phase.value !== PLAY) break;
    if (step.type === 'slide') {
      // 播放中 `godPlaying` 是 true，而 applySlide 默认会拦截输入 —— 这里必须显式放行，
      // 否则上帝模式只清得掉现成的组、一步也滑不动（用户报过「不会移动牌了」）。
      applySlide(step.dir, true);
      await godSleep(GOD_SLIDE_MS);
    } else {
      selected.value = [...step.cells];      // 先点亮这一组（抬起 + 外框），让玩家看清消的是哪组
      await godSleep(GOD_PICK_MS);
      if (!godPlaying.value || phase.value !== PLAY) break;
      const g = groups.value.find(x => x.cells.length === step.cells.length
        && step.cells.every(c => x.cells.includes(c)));
      if (g) clearGroup(g);
      await godSleep(GOD_CLEAR_MS);
    }
  }
  stopGod();
}

// ---------- 滑动 ----------
// `fromGod` 只给上帝模式自己用：播放期间 godPlaying 为 true，而手势必须被挡住，
// 所以拦截条件不能去掉，只能由 godPlay 显式放行（别再写成「godPlaying 时一律 return」）。
function applySlide(dir, fromGod = false) {
  if (phase.value !== PLAY || (godPlaying.value && !fromGod)) return;
  // 浮影层是按消除当时的格子绝对定位的，滑动会让剩下的牌移动、浮影留在原地 —— 先收掉它
  //（原本那 520ms 的 checkEnd 定时器仍会照常跑，不影响胜负判定）
  if (clearing.value.size) clearing.value = new Map();
  const next = slideBy(board.value, dir, mode.value);
  if (sameBoard(board.value, next)) return;
  pushHistory();
  selected.value = [];
  board.value = next;
  movesLeft.value -= 1;
  refreshGroups();
  save();
  timers.push(setTimeout(() => { checkEnd(); save(); }, 220));
}

// 小程序没有 Pointer Events：滑动用 touchstart / touchend（坐标取 changedTouches）
const noop = () => {};
let press = null;

function touchPoint(e, changed) {
  const list = changed ? e.changedTouches : e.touches;
  const t = (list && list[0]) || (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
  if (!t) return null;
  return { x: t.clientX != null ? t.clientX : t.pageX, y: t.clientY != null ? t.clientY : t.pageY };
}

function onTouchStart(e) {
  if (phase.value !== PLAY || godPlaying.value) return;
  const p = touchPoint(e, false);
  if (!p) return;
  press = p;
}

function onTouchEnd(e) {
  if (godPlaying.value) { press = null; return; }
  if (!press) return;
  const p = touchPoint(e, true) || press;
  const dx = p.x - press.x;
  const dy = p.y - press.y;
  press = null;
  if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return;
  suppressClickUntil = Date.now() + 320;   // 滑动之后别再把这次手势当成点击
  applySlide(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
}

function onTouchCancel() { press = null; }

// ---------- undo / redo ----------
const snapshot = () => ({
  board: board.value.map(t => (t ? { id: t.id, suit: t.suit, num: t.num } : null)),
  movesLeft: movesLeft.value,
  level: level.value,
});
function pushHistory() {
  history.value = [...history.value, snapshot()].slice(-60);
  future.value = [];
}
function restore(snap) {
  board.value = snap.board.map(t => (t ? { ...t, delay: 0 } : null));
  movesLeft.value = snap.movesLeft;
  level.value = snap.level;
  phase.value = PLAY;
  selected.value = [];
  clearing.value = new Map();
  refreshGroups();
  save();
}
function undo() {
  if (!canUndo.value) return;
  const snap = history.value[history.value.length - 1];
  future.value = [...future.value, snapshot()];
  history.value = history.value.slice(0, -1);
  restore(snap);
}
function redo() {
  if (!canRedo.value) return;
  const snap = future.value[future.value.length - 1];
  history.value = [...history.value, snapshot()];
  future.value = future.value.slice(0, -1);
  restore(snap);
}

// ---------- 结算 / 存档 ----------
function checkEnd() {
  if (phase.value !== PLAY) return;
  if (tilesLeft.value === 0) {
    phase.value = WON;
    // 彩带只在真正赢下的这一刻放（恢复存档的胜利态不放）
    justWon.value = true;
    clearTimeout(wonTimer);
    wonTimer = setTimeout(() => { justWon.value = false; }, 4000);
    playWin();
    return;
  }
  if (movesLeft.value <= 0) { phase.value = OVER; playLose(); }
}

function save() {
  try {
    setRaw(STATE_KEY(), JSON.stringify({
      level: level.value,
      phase: phase.value,
      movesLeft: movesLeft.value,
      board: board.value.map(t => (t ? { suit: t.suit, num: t.num } : null)),
      history: history.value,
      future: future.value,
    }));
    const best = +(getRaw(BEST_KEY()) || 1);
    if (level.value > best) setRaw(BEST_KEY(), String(level.value));
  } catch { /* 存储写不进去也不影响玩 */ }
}

function restoreState() {
  try {
    const s = getJSON(STATE_KEY());
    if (!s || !Array.isArray(s.board) || s.board.length !== CELLS) return false;
    if (![PLAY, WON, OVER].includes(s.phase)) return false;
    // **过关时棋盘是全空的**（最后那一组消完就没了），所以「棋盘必须有牌」这条不能一刀切，
    // 否则胜利结算永远恢复不出来（用户报过：退出重进后又从这一关重新开始）
    if (!s.board.some(Boolean) && s.phase !== WON) return false;
    level.value = Math.max(1, +s.level || 1);
    // +undefined 是 NaN，`??` 挡不住它，所以用 Number.isFinite 判
    const savedMoves = Number(s.movesLeft);
    movesLeft.value = Number.isFinite(savedMoves)
      ? Math.max(0, savedMoves)
      : levelConfig(level.value, mode.value).moves;
    let n = 0;
    board.value = s.board.map(t => (t ? { suit: t.suit, num: t.num, id: ++n, delay: 0 } : null));
    history.value = Array.isArray(s.history) ? s.history : [];
    future.value = Array.isArray(s.future) ? s.future : [];
    phase.value = s.phase;
    selected.value = [];
    clearing.value = new Map();
    groups.value = [];
    // 恢复的局面也逐张铺开（不然一进来牌是「啪」地全出现的）
    dealing.value = true;
    dealSeq.value += 1;
    board.value = board.value.map((t, c) => (t
      ? { ...t, delay: (Math.floor(c / SIZE) + (c % SIZE)) * 60 }
      : null));
    const last = (SIZE - 1) * 2 * 60 + DEAL_MS;
    timers.push(setTimeout(() => {
      dealing.value = false;
      board.value = board.value.map(t => (t ? { ...t, delay: 0 } : null));
      refreshGroups();
    }, last));
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

// ---------- 生命周期 ----------
function onResize() {
  computeMetrics();
}

onMounted(async () => {
  computeMetrics();
  if (typeof uni.onWindowResize === 'function') uni.onWindowResize(onResize);
  // 先把牌面图读进缓存再铺盘（H5 下有效；小程序没有 Image 全局，直接跳过 —— 牌面是内联 data URI）
  if (typeof Image !== 'undefined') {
    try { await preloadTiles(); } catch { /* 加载失败也不影响开局 */ }
  }
  if (!restoreState()) startLevel(Math.max(1, +(getRaw(BEST_KEY()) || 1)));
});

onUnmounted(() => {
  if (typeof uni.offWindowResize === 'function') uni.offWindowResize(onResize);
  stopGod();
  clearTimers();
  clearTimeout(wonTimer);
  save();
});
</script>

<style lang="scss" scoped>
/* web 的 keyframes 逐条搬过来（px → rpx 按 1.923 折算） */
@keyframes qs-deal {
  from { opacity: 0; transform: translate(-35rpx, -35rpx) scale(0.45); }
  to { opacity: 1; transform: translate(0, 0) scale(1); }
}
@keyframes qs-ring-in {
  from { opacity: 0; transform: scale(0.94); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes qs-tip-in {
  /* 入场只做缩放/淡入，位移沿用 --tip-tx / --tip-ty（否则动画期间会被硬编码的 -100% 拽到上方） */
  from { opacity: 0; transform: translate(var(--tip-tx, -50%), var(--tip-ty, -100%)) scale(0.86); }
  to { opacity: 1; transform: translate(var(--tip-tx, -50%), var(--tip-ty, -100%)) scale(1); }
}
@keyframes qs-blink {
  0% { opacity: 1; }
  22% { opacity: 0.15; }
  44% { opacity: 1; }
  66% { opacity: 0.15; }
  100% { opacity: 0; filter: brightness(2.4); transform: scale(0.72); }
}
@keyframes qs-confirm-in {
  from { transform: scale(0.1); }
  to { transform: scale(1); }
}

/* 一页只允许一处 min-height: 100vh（就在 .screen 上） */
.screen {
  min-height: 100vh;
  background: transparent;  /* 背景交给 ParticleBackground（canvas 自己铺底色） */
}
.page {
  padding: 36rpx 24rpx 140rpx;   /* 底部让开右下角悬浮按钮，否则撤销/重做会被压住 */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 36rpx;
  background: #f0f2f5;
  color: #2c3e50;
}
/* 卡片吃全局 .card 的圆角 / 阴影 / 白底，这里只定宽度（web：100% - 32px，上限 440px） */
.card {
  width: 690rpx;
  box-sizing: border-box;
}
.divider {
  width: 2rpx;
  height: 46rpx;
  align-self: center;
  background: #e1e1e1;
  opacity: 0.6;
}

/* ---------- 统计条（web --row-height: 72px） ---------- */
.score-area {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
}
.stat {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
}
.stat-label { font-size: 23rpx; color: #5f6b7a; line-height: 1.2; }
.stat-value { font-size: 42rpx; font-weight: bold; line-height: 1.3; color: #2c3e50; }
.progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 6rpx;
  background: #e1e1e1;
}
.progress-bar {
  height: 100%;
  background: #23804e;
  transition: width 0.3s ease;
}

/* ---------- 操作区 ---------- */
.opt-area {
  display: flex;
  align-items: center;
}
.start-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1.2;
}
.opt-half {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1.2;
}
/* 操作按钮：web 的 .game-icon（8px 16px / 8px 圆角 / 14px 字号） */
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
.game-icon[disabled] { background-color: #aaa; }
/* 上帝模式按钮：可点击时是橙色（与点击游戏一致；禁用时仍是灰），比「新游戏」略窄略矮 */
.god-btn {
  padding: 0 23rpx;
  height: 70rpx;
  line-height: 70rpx;
  font-size: 25rpx;
  background-color: #c2410c;
}
.god-btn[disabled] { background-color: #aaa; }

/* ---------- 撤销 / 重做（与点击游戏同款） ---------- */
.undo-card {
  display: flex;
  align-items: stretch;
  /* 两颗按钮加起来 = 屏宽 75%（750 × 0.75 = 562rpx）。
     注意不能用 `width: 75%`：卡片在 .page（690rpx）里，75% 只是页面宽的 75% ✗
     所以直接写 rpx：562 + 4×15（两个 .undo-item 的左右内边距）= 622rpx */
  width: 622rpx;
  margin: 0 auto;
}
.undo-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 15rpx;
}
.undo {
  margin: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 15rpx;
  width: 100%;                  /* 不再限 max-width，两格各占一半 → 合计屏宽 75% */
  height: 65rpx;
  padding: 0 31rpx;
  font-size: 27rpx;
  font-weight: bold;
  line-height: 1;
  color: #23804e;
  background: transparent;
  border: 2rpx solid #23804e;
  border-radius: 15rpx;
  box-sizing: border-box;
  transition: background-color 0.15s, border-color 0.15s, color 0.15s;
}
/* 不可用时 50% 透明 + not-allowed（background 显式写一遍，压过微信 button[disabled] 自带底色） */
.undo[disabled] {
  opacity: 0.5;
  color: #2c3e50;
  border-color: #2c3e50;
  background: transparent;
}

/* ---------- 游戏区 ---------- */
.game-area {
  position: relative;
  margin: 0 auto;
}
.board {
  position: relative;
  box-sizing: border-box;
  border-radius: 27rpx;
}
/* 点阵底纹（web App.vue 的 .dot-board；小程序没有全局那份，这里本地定义） */
.dot-board {
  background-color: #bbada0;
  background-image: radial-gradient(circle, rgba(255, 255, 255, 0.18) 2rpx, transparent 2rpx);
  background-size: 19rpx 19rpx;
  background-position: 9rpx 9rpx;
}
.grid-cell {
  position: absolute;
  border-radius: 15rpx;
  border: 2rpx solid #c9d0da;
  background-color: rgba(255, 255, 255, 0.08);
  box-sizing: border-box;
}

/* 可消牌组的高亮边框（圈住整组）：浅橙色，与主色绿区分开 —— 绿＝可操作、橙＝这一组能消 */
.group-ring {
  position: absolute;
  box-sizing: border-box;
  border: 4rpx solid #ffa63d;
  border-radius: 19rpx;
  box-shadow: 0 0 0 6rpx rgba(255, 255, 255, 0.12), 0 0 19rpx rgba(255, 166, 61, 0.55);
  pointer-events: none;
  transition: left 0.16s ease, top 0.16s ease, width 0.16s ease, height 0.16s ease;
  /* 牌铺完之后高亮框再淡入，而不是一开始就挂在那儿 */
  animation: qs-ring-in 0.18s ease-out both;
}

/* 消除提示气泡：位置由 hintStyle 给的 --tip-tx / --tip-ty 决定（避开第三张牌的方向） */
.clear-tip {
  position: absolute;
  z-index: 3;
  transform: translate(var(--tip-tx, -50%), var(--tip-ty, -100%));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
  padding: 10rpx 17rpx;
  border-radius: 15rpx;
  background: #23804e;
  color: #fff;
  font-size: 23rpx;
  font-weight: bold;
  line-height: 1.3;
  white-space: nowrap;
  box-shadow: 0 6rpx 19rpx rgba(0, 0, 0, 0.25);
  animation: qs-tip-in 0.14s ease-out;
}
.clear-tip::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -10rpx;
  width: 0;
  height: 0;
  transform: translateX(-50%);
  border-left: 10rpx solid transparent;
  border-right: 10rpx solid transparent;
  border-top: 10rpx solid #23804e;
}
/* 第三张牌在正上方时改到下方显示，箭头也跟着翻过来，避免挡住要点的牌 */
.clear-tip.below::after {
  bottom: auto;
  top: -10rpx;
  border-top: none;
  border-bottom: 10rpx solid #23804e;
}

/* 上帝模式播放期间挡输入的透明遮罩（点击游戏同款）。
   注意要能匹配到：它渲染在 .board 里，所以写在 .board 同级的选择器上 */
.automask {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 5;
  background: rgba(255, 255, 255, 0);
}

/* 牌：绝对定位，滑动时靠 left/top 过渡动画 */
.tile {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: left 0.17s cubic-bezier(0.3, 0.8, 0.4, 1), top 0.17s cubic-bezier(0.3, 0.8, 0.4, 1);
}
/* 牌面比格子略小并居中：web 里每张牌与格子之间有一圈呼吸空间，
   铺满格子会显得「牌挤在格子的左上角、图案贴边」。 */
.tile .mj {
  width: 93%;
  height: 93%;
  border-radius: 9%;
}
/* 开局从左上到右下逐张铺开（延迟由 JS 按 r + c 注入） */
.tile.dealt {
  animation: qs-deal 0.34s cubic-bezier(0.34, 1.4, 0.64, 1) both;
}
/* 点选中的牌：主色描边 + 抬起来一点 */
.tile.active {
  transform: translateY(-6rpx);
  filter: drop-shadow(0 8rpx 15rpx rgba(0, 0, 0, 0.22));
}
.tile.active .mj {
  box-shadow: 0 0 0 6rpx #23804e;
}
/* 刚消掉的牌：闪烁 → 消失（浮影层） */
.tile.clearing {
  animation: qs-blink 0.52s ease-in-out forwards;
  pointer-events: none;
}

/* ---------- 结算层（与棋盘矩形完全重合） ---------- */
.result {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 23rpx;
  padding: 23rpx;
  border-radius: 27rpx;
  background: rgba(255, 255, 255, 0.8);
  font-size: 34rpx;
  font-weight: bold;
  color: #12833f;
}
.result.lose { color: #b11; }
.result-main { font-size: 34rpx; font-weight: bold; }
.level-note {
  font-size: 27rpx;
  color: #2c3e50;
  opacity: 0.75;
  font-weight: 400;
}
/* 结算层里的按钮行：横排、居中、12px 间隔（规范见 docs/CONVENTIONS.md） */
.result-btns {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 23rpx;
  width: 100%;
}
.result-btns .game-icon { flex: 0 0 auto; }

/* ---------- 新游戏二次确认（本地版 ConfirmDialog） ---------- */
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
  /* web 的 ConfirmDialog：盒子从 scale(0.1) 在 0.16s 内弹到 1（遮罩本身不淡入） */
  animation: qs-confirm-in 0.16s ease-in-out;
}
.confirm-title { font-size: 32rpx; font-weight: bold; margin-bottom: 15rpx; }
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
.confirm-cancel { background: #eef0f4; color: #2c3e50; }
.confirm-actions .confirm-replay {
  background: transparent;
  border: 2rpx solid #c2410c;
  color: #c2410c;
  font-weight: bold;
}
.confirm-ok { background: #23804e; color: #fff; font-weight: bold; }
</style>
