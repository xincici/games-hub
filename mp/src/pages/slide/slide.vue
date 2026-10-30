<template>
  <view class="screen">
    <!-- 全站背景（粒子连线 + 底部过山车，与 web 的 ParticleBackground 同款） -->
    <ParticleBackground />
    <view class="page">
      <!-- 统计条：关卡 / 时间 / 剩余（web 的 .card.score-area，三格）+ 底部本关进度条 -->
      <view class="card score-area">
        <view class="stat">
          <text class="stat-label">{{ tt('level') }}</text>
          <text class="stat-value">{{ level }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('time') }}</text>
          <text class="stat-value">{{ clock }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('left') }}</text>
          <text class="stat-value">{{ pairsLeft }}</text>
        </view>
        <view class="progress"><view class="progress-bar" :style="{ width: progress + '%' }" /></view>
      </view>

      <!-- 操作区：左侧盘面信息 + 右侧「新游戏」（web 的 .card.opt-area，1.6 : 1.2 分格） -->
      <view class="card opt-area">
        <view class="opt-half">
          <text class="board-info">{{ conf.rows }}×{{ conf.cols }} · {{ conf.kinds }} {{ tt('kindsUnit') }}</text>
        </view>
        <view class="divider" />
        <view class="start-wrapper">
          <button class="game-icon" hover-class="none" @click="confirming = true">{{ tt('start') }}</button>
        </view>
      </view>

      <!-- 游戏区：尺寸由「格子 × 行列」反算（web 的 .game-area，棋盘与它等大）；
           棋盘自己带点阵底纹（web 的 .dot-board），牌子绝对定位、共用同一份 cell 数学（PAD = 0） -->
      <view class="game-area" :style="{ width: boardW + 'rpx', height: boardH + 'rpx' }">
        <view
          id="slide-board"
          class="board"
          @touchstart="onTouchStart"
          @touchmove.stop.prevent="onTouchMove"
          @touchend="onTouchEnd"
          @touchcancel="onTouchCancel"
        >
          <view v-for="t in tiles" :key="t.id" class="tile" :class="tileClass(t)" :style="tileStyle(t)">
            <view class="tile-body" :style="bodyStyle(t)">
              <text class="tile-glyph">{{ glyphOf(t.kind) }}</text>
              <!-- 炸开时从牌心扩出去的一圈光晕（web 的 .tile-body::after + pop-ring） -->
              <view v-if="t.popping" class="pop-ring" />
            </view>
          </view>
        </view>

        <!-- 连击提示：必须在 .board **外面**（.board 有 overflow:hidden，会把向上探出棋盘的
             那一截整条裁掉）；落在棋盘上方那条 31rpx 空隙里（web 的 .combo-tip，top: -15px） -->
        <view v-if="comboTip" class="combo-tip" :class="comboTipClass">{{ comboTipText }}</view>
        <!-- 死局重排提示：棋盘正中浮一下（web 的 .shuffle-tip） -->
        <view v-if="shuffling" class="shuffle-tip">{{ tt('shuffled') }}</view>

        <!-- 结算层：与游戏区矩形完全重合（web 的 .result，按钮规格走 App.vue 全局） -->
        <view v-if="phase === WON" class="result win">
          <text class="result-title">🎉 {{ tt('tipWin') }} 🎉</text>
          <text class="result-line">{{ tt('time') }} {{ clock }}</text>
          <view class="result-btns">
            <button class="btn ghost" hover-class="none" @click="startLevel(level)">{{ tt('replayLevel') }}</button>
            <button class="btn" hover-class="none" @click="startLevel(level + 1)">{{ tt('nextLevel') }}</button>
          </view>
        </view>
        <view v-else-if="phase === OVER" class="result lose">
          <text class="result-title">⏰ {{ tt('tipOver') }} ⏰</text>
          <text class="result-line">{{ tt('left') }} {{ pairsLeft }}</text>
          <view class="result-btns">
            <button class="btn ghost" hover-class="none" @click="startLevel(level)">{{ tt('replayLevel') }}</button>
          </view>
        </view>
      </view>
    </view>

    <!-- 胜利彩带（纯 CSS 版，web 是 canvas confetti；只在真正赢下那一刻放，恢复存档不放） -->
    <Confetti v-if="justWon" />
    <!-- 本游戏没有模式切换，右下角只有帮助（按钮上无文字，图标放内层） -->
    <FloatingActions>
      <view class="fab" @click="showHelp"><view class="fab-ico i-carbon-help" /></view>
    </FloatingActions>
    <!-- 连击烟花粒子层（共享实现：@/core/firework 的 burstConfetti → 这里渲染，喷发点=游戏区顶部中间） -->
    <FireworkBurst />
    <HelpSheet :open="helpOpen" :text="helpText" @close="helpOpen = false" />

    <!-- 新游戏二次确认（web 的 shared/ConfirmDialog 三按钮版；小程序没有共享弹窗，本地实现） -->
    <view v-if="confirming" class="confirm-mask" @click="confirming = false">
      <view class="card confirm-box" @click.stop>
        <text class="confirm-title">{{ tt('confirmTitle') }}</text>
        <text class="confirm-msg">{{ tt('confirmMsg') }}</text>
        <view class="confirm-actions">
          <button class="confirm-cancel" hover-class="none" @click="confirming = false">{{ tt('cancel') }}</button>
          <button class="confirm-replay" hover-class="none" @click="retryLevel">{{ tt('confirmReplay') }}</button>
          <button class="confirm-ok" hover-class="none" @click="startNewGame">{{ tt('confirmOk') }}</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
// Emoji 滑行 · 微信小程序版
// 玩法逻辑逐行对照 web 的 src/games/slide/SlideGame.vue（关卡曲线 / 发牌 / 相邻判定 / 整组滑行 /
// 连击 / 死局重排 / 存档字段都一致），board.js 是原文逐字节复制。平台差异只有这几处：
// - 指针事件（Pointer Events）→ touchstart / touchmove / touchend / touchcancel（小程序没有 pointer 事件），
//   阈值仍是 TAP_SLOP = 8px；按住的位置用 selectorQuery 量到的棋盘矩形换算成 (r, c)；
// - 牌的位置从 web 的 `transform: translate3d()` 换成 absolute + left/top（本工程其它页面同一套做法，
//   拖动时关掉 transition 做到 1:1 跟手，松手后带同样的回弹 bezier）；
// - 棋盘尺寸不再靠 CSS 变量 + 内联 px，而是「格子 × 行列」在 rpx 里反算（§零 第 2 条），
//   格子与牌共用同一份 cell 数学（web 的棋盘没有内边距，3px 缝就在格子内部，所以这里 PAD = 0）；
// - 连击烟花：canvas-confetti → @/core/firework 的 burstConfetti（喷发点=游戏区顶部中间、粒子数比 web 少；音效由它内部播 playFirework）；
// - localStorage → @/core/storage（key 与 web 一字不差：__emoji_slide__state）；Web Audio → @/core/sfx。
// - **不是全局锁**：拖动 / 消除动画期间，玩家照样能按住别的牌继续滑、点别的牌继续消；
//   真正挡住的只有「已经被消费的那两张牌」（它们已经 popping）。
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { onHide, onShow } from '@dcloudio/uni-app';

import Confetti from '@/components/Confetti.vue';
import FireworkBurst from '@/components/FireworkBurst.vue';
import FloatingActions from '@/components/FloatingActions.vue';
import HelpSheet from '@/components/HelpSheet.vue';
import { getJSON, setJSON } from '@/core/storage';
import { playElimination, playLose, playWin } from '@/core/sfx';
import { burstConfetti } from '@/core/firework';
import { setNavTitle } from '@/core/i18n';
import {
  levelConfig, makeBoard, findPartner, slideParams, shiftGroup,
  hasAnyMove, reshuffleBoard,
} from './board';
import { tt } from './i18n';
import ParticleBackground from '@/components/ParticleBackground.vue';

// 原生导航栏标题跟随语言（pages.json 里的标题是静态的）
setNavTitle(() => tt('gameTitle'));

const [PLAY, WON, OVER] = ['play', 'won', 'over'];

// ---------- 存档 key：与 web 一字不差 ----------
const KEY_PREFIX = '__emoji_slide__';
const STATE_KEY = `${KEY_PREFIX}state`;   // 局面存档（关卡进度就在里面）

// ---------- 与 web 完全同名的尺寸 / 动画常量 ----------
const MAX_CELL = 56;      // 小棋盘（6×6）时别撑得太满（web 的单格上限 56px）
const GAP = 3;            // 每格之间的缝（在格子内部，靠 .tile-body 比槽位小 3px 实现）
const TAP_SLOP = 8;       // 位移小于它就当成「点击」而不是拖动
const POP_MS = 280;       // 炸开动画时长（CSS 里的 tile-pop 要同步）
const SHAKE_MS = 620;     // 同款晃动提示时长（CSS 里的 tile-shake 要同步）
const SHUFFLE_MS = 1000;  // 死局重排的提示时长（CSS 里的 tile-reshuffle 要同步）
const COMBO_MS = 2500;    // 连击窗口
const COMBO_TIP_MS = 1500; // 提示条停留时长（比窗口短一点，收得干净）
const DEAL_STEP = 28;     // 入场错峰：按 (行 + 列) 排波浪，第几张就延迟几个 DEAL_STEP
const DEAL_MS = 320;
const GLYPHS = ['🍎', '🍋', '🍇', '🥝', '🫐', '🍑', '🥕', '🍄'];

// ---------- 页面固定高度（rpx）：棋盘以上 / 底部让开悬浮按钮 ----------
// 上内边距 27 + 统计卡 168 + 间距 31 + 操作区 120 + 间距 31 = 377（高度来自 App.vue 的全局 .score-area / .opt-area）
const PAGE_FIXED_H = 27 + 168 + 31 + 120 + 31;
const PAGE_BOTTOM = 140;
const MIN_CELL_PX = 14;   // web 的兜底下限
const BOX_MAX_W = 690;    // 卡片宽（web 的 calc(100% - 32px) = 361px）

const phase = ref(PLAY);
const level = ref(1);
const tiles = ref([]);          // [{ id, kind, r, c, popping }]
const elapsed = ref(0);
const shakeKind = ref(0);
const shuffling = ref(false);   // 死局重排中（所有牌播打乱动画 + 棋盘正中提示）
const dealing = ref(false);     // 开局 / 恢复存档的逐张入场（斜向波浪）
const comboTip = ref(null);     // { id, n, pop } 棋盘上方那条「N 连击」
const combo = ref(0);           // 当前连到几（1 = 刚消一对，0 = 没有连击在进行）
const confirming = ref(false);
const justWon = ref(false);
const helpOpen = ref(false);
// 拖拽状态：ref 里的对象是深响应式，逐帧只改 shift 一个数
const drag = ref(null);

const conf = computed(() => levelConfig(level.value));

let tileId = 0;
let shakeTimer = null;
let shuffleTimer = null;
let dealTimer = null;
let lastClearAt = 0;            // 上一次消除的时刻
let comboBroken = false;        // 上一次消除之后是否出现过无效操作
let comboTimer = null;          // 窗口到期就断开
let comboTipTimer = null;
let comboSeq = 0;
let wonTimer = null;
let generation = 0;             // 换局时 +1，异步动画据此收手
let tickTimer = null;

// ---------- 视口 / 棋盘几何 ----------
// H5 的 innerHeight 含 uni 自带导航栏（44px）；小程序的 windowHeight 已扣掉原生导航栏
function readViewport() {
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

const viewport = ref(readViewport());
const k = computed(() => 750 / (viewport.value.w || 375));   // 1px = ?rpx

// 单格尺寸：与 web 同一口径（可用宽 = min(视口宽, 440) − 32；可用高 = 视口高 − 固定块 − 底部留白），
// 再套 56px 上限，最后换回 rpx。棋盘 / 游戏区尺寸全部由它反算，容器不写死（§零 第 2 条）。
const cellPx = computed(() => {
  const vw = viewport.value.w || 375;
  const vh = viewport.value.h || 667;
  const { rows, cols } = conf.value;
  const availW = Math.min(vw, 440) - 32;
  const availH = Math.max(200, vh - (PAGE_FIXED_H + PAGE_BOTTOM) / k.value);
  return Math.max(MIN_CELL_PX, Math.floor(Math.min(availW / cols, availH / rows, MAX_CELL)));
});
const cellR = computed(() => {
  const maxCellR = Math.floor(BOX_MAX_W / Math.max(1, conf.value.cols));
  return Math.max(24, Math.min(Math.round(cellPx.value * k.value), maxCellR));
});
const gapR = computed(() => Math.max(2, Math.round(GAP * k.value)));
const tileR = computed(() => cellR.value - gapR.value);
const fontR = computed(() => Math.round(tileR.value * 0.64));   // web 的 --font = (c − GAP) × 0.64
const boardW = computed(() => cellR.value * conf.value.cols);
const boardH = computed(() => cellR.value * conf.value.rows);
// 拖动位移是 px、牌位是 rpx：一格在 px 里的长度
const cellPxLen = computed(() => cellR.value / k.value);

const remaining = computed(() => Math.max(0, conf.value.seconds - elapsed.value));
const clock = computed(() => {
  const s = remaining.value;
  return ('00' + ~~(s / 60)).slice(-2) + ':' + ('00' + (s % 60)).slice(-2);
});
const pairsLeft = computed(() => tiles.value.filter(t => !t.popping).length / 2);
// 本关总对数：棋盘是 rows×cols、面积奇数时留一个空格，所以正好是 floor(rows×cols/2)
// （与 board.js 的 makeBoard 一致）。**不要数当前牌数** —— 中途退出再进来（恢复存档）
// 会把总数当成剩余数，进度条直接归零。
const totalPairs = computed(() => Math.floor((conf.value.rows * conf.value.cols) / 2));
const progress = computed(() => (totalPairs.value
  ? Math.min(100, Math.round(((totalPairs.value - pairsLeft.value) / totalPairs.value) * 100))
  : 0));

// 逻辑用棋盘：炸着的牌已经算消掉了（空格才能当通道）
const grid = computed(() => {
  const g = Array.from({ length: conf.value.rows }, () => Array(conf.value.cols).fill(0));
  for (const t of tiles.value) if (!t.popping) g[t.r][t.c] = t.kind;
  return g;
});

function tileAt(r, c, list = tiles.value) {
  return list.find(t => t.r === r && t.c === c && !t.popping) || null;
}

function glyphOf(kind) {
  return GLYPHS[(kind - 1) % GLYPHS.length];
}

function tileStyle(t) {
  const c = cellR.value;
  let dr = 0;
  let dc = 0;
  const d = drag.value;
  if (d && d.axis && d.groupIds.has(t.id)) {
    dr = d.dir.r * d.shift;
    dc = d.dir.c * d.shift;
  }
  return {
    width: `${c}rpx`,
    height: `${c}rpx`,
    // 自己的格子坐标 + 拖动偏移（两者都以格为单位）：只写偏移会让所有牌堆在左上角
    left: `${((t.c + dc) * c).toFixed(2)}rpx`,
    top: `${((t.r + dr) * c).toFixed(2)}rpx`,
  };
}

// 入场 / 重排的错峰延迟（两者同时成立时以「重排」为准，与 web 的 CSS 层叠顺序一致）。
// 数字为 0 时不写 animationDelay，避免盖掉消除动画默认的 0 延迟。
function animDelay(t) {
  if (shuffling.value && !t.popping) return ((t.r + t.c) % 10) * 22;
  if (dealing.value && !t.popping) return (t.r + t.c) * DEAL_STEP;
  return 0;
}

function bodyStyle(t) {
  const style = {
    width: `${tileR.value}rpx`,
    height: `${tileR.value}rpx`,
    fontSize: `${fontR.value}rpx`,
  };
  const delay = animDelay(t);
  if (delay) style.animationDelay = `${delay}ms`;
  return style;
}

// 拖动中的那一组要关掉过渡（1:1 跟手），松手后再打开（落位 / 弹回才有动画）
function isDragging(t) {
  const d = drag.value;
  return !!(d && d.axis && d.groupIds.has(t.id) && d.shift > 0);
}

function tileClass(t) {
  return {
    dragging: isDragging(t),
    popping: t.popping,
    shaking: shakeKind.value === t.kind,
    // 重排时错峰播翻转；正在炸掉的牌不掺和（否则它的消除动画会被重排动画顶掉）
    shuffling: shuffling.value && !t.popping,
    dealing: dealing.value && !t.popping,
  };
}

// ---------- 计时（web 的 shared/CountTimer.vue：每秒回调、页面隐藏时暂停） ----------
function startTick() {
  if (tickTimer) return;
  tickTimer = setInterval(onTimerTick, 1000);
}
function stopTick() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
}
function onTimerTick() {
  elapsed.value += 1;
  if (phase.value !== PLAY) return;
  if (remaining.value <= 0) lose();
  else save();
}

// ---------- 关卡流程 ----------

// 开局与恢复存档都逐张入场：动画挂在内层 .tile-body 上（外层 .tile 的 left/top
// 是「自己在哪一格」，动画一旦写在外层就会把位置顶掉，牌会全堆到左上角）
function playDeal() {
  if (!tiles.value.length) return;
  clearTimeout(dealTimer);
  dealing.value = true;
  const span = (conf.value.rows + conf.value.cols) * DEAL_STEP + DEAL_MS;
  dealTimer = setTimeout(() => { dealing.value = false; }, span);
}

function startLevel(lv, restored = null) {
  generation += 1;
  clearTimeout(shakeTimer);
  clearTimeout(shuffleTimer);
  clearTimeout(dealTimer);
  dealTimer = null;
  shuffling.value = false;
  dealing.value = false;
  breakCombo();
  shakeKind.value = 0;
  drag.value = null;
  level.value = Math.max(1, lv);
  if (restored) {
    tiles.value = restored.tiles;
    elapsed.value = Math.max(0, +restored.elapsed || 0);
  } else {
    const g = makeBoard(conf.value.rows, conf.value.cols, conf.value.kinds);
    const list = [];
    for (let r = 0; r < conf.value.rows; r++) {
      for (let c = 0; c < conf.value.cols; c++) {
        // g[r][c] === 0 是奇数面积棋盘留下的空位：这里不建牌。
        // 建了的话会渲染成一张没有 emoji 的白卡片（GLYPHS[-1] 是 undefined），
        // 而且 findPartner 对 k=0 返回 null → 永远消不掉 → 胜利判定永远不成立
        if (!g[r][c]) continue;
        list.push({ id: ++tileId, kind: g[r][c], r, c, popping: false });
      }
    }
    tiles.value = list;
    elapsed.value = 0;
  }
  // ⚠️ 还原「胜利 / 失败」的局面时，阶段必须**跟着一起落地**：下面紧跟着一次 save()，
  //    如果这里先写死 PLAY，就会把胜利结算的存档冲成 PLAY —— 玩家重进一次看到浮层、
  //    再重进一次就掉回第 1 关。
  phase.value = restored && (restored.phase === WON || restored.phase === OVER) ? restored.phase : PLAY;
  // 计时的 reset()（stop → 0 → start）+ 有存档时 restore(elapsed)：结算局面要停表
  stopTick();
  if (phase.value === PLAY) startTick();
  save();
  playDeal();
  if (!restored) {
    nextTick(() => measureBoard());
    return;
  }
  // 还原的局面可能是死局（比如存档正好停在卡死的一步上）→ 下一帧再查，等牌先渲染出来
  const g = generation;
  setTimeout(() => { if (g === generation) checkDeadlock(); }, 16);
  nextTick(() => measureBoard());
}

function startNewGame() {
  confirming.value = false;
  startLevel(1);
}

// 「重玩本关」：只重开当前这一关，闯关进度与局面之外的东西都不动
function retryLevel() {
  confirming.value = false;
  startLevel(level.value);
}

function win() {
  if (phase.value !== PLAY) return;
  phase.value = WON;
  stopTick();
  playWin();
  justWon.value = true;
  clearTimeout(wonTimer);
  wonTimer = setTimeout(() => { justWon.value = false; }, 4000);
  save();
}

function lose() {
  if (phase.value !== PLAY) return;
  phase.value = OVER;
  playLose();
  stopTick();
  save();
}

// ---------- 连击 ----------

// 规则：两次消除之间没有无效操作（滑动没消掉 / 点了但没同款），且间隔 < COMBO_MS 才算连上，
// 弹出「N 连击」+ 一小束烟花；间隔超时或出现无效操作则中断。
function registerClear() {
  const now = Date.now();
  const chained = lastClearAt > 0 && !comboBroken && now - lastClearAt < COMBO_MS;
  combo.value = chained ? combo.value + 1 : 1;
  lastClearAt = now;
  comboBroken = false;
  clearTimeout(comboTimer);
  comboTimer = setTimeout(breakCombo, COMBO_MS);
  if (combo.value >= 2) showCombo(combo.value);
}

function breakCombo() {
  combo.value = 0;
  lastClearAt = 0;
  comboBroken = false;
  clearTimeout(comboTimer);
  clearTimeout(comboTipTimer);
  comboTimer = null;
  comboTipTimer = null;
  comboTip.value = null;
}

// 有一次操作没消掉 → 标记中断（真正清空留给 registerClear / 窗口超时）
function missCombo() {
  if (combo.value) comboBroken = true;
}

const comboTipText = computed(() => (comboTip.value ? tt('comboTip').replace('{n}', comboTip.value.n) : ''));
const comboTipClass = computed(() => {
  const n = comboTip.value ? comboTip.value.n : 1;
  return `n-${Math.min(n, 4)} ${comboTip.value && comboTip.value.pop === 'b' ? 'pop-b' : 'pop-a'}`;
});

async function showCombo(n) {
  comboSeq += 1;
  // 同一条提示条靠切换两条同内容的关键帧名重播动画（不要用布尔开关）
  comboTip.value = { id: comboSeq, n, pop: comboSeq % 2 ? 'a' : 'b' };
  clearTimeout(comboTipTimer);
  comboTipTimer = setTimeout(() => { comboTip.value = null; }, COMBO_TIP_MS);
  // 与 web 一致：喷发点 = 提示条中心往下 30px（提示条刚渲染出来才量得到，所以放 nextTick）
  await nextTick();
  burstConfetti(Math.min(3, 1 + (n - 2) * 0.6), { count: Math.min(24, 8 + n * 3) });
}

// ---------- 消除 ----------

function eliminate(a, b) {
  const list = [tileAt(a[0], a[1]), tileAt(b[0], b[1])];
  if (list.some(t => !t)) return;
  registerClear();

  playElimination();

  const g = generation;
  list.forEach(t => { t.popping = true; });
  setTimeout(() => {
    if (g !== generation) return;
    const ids = new Set(list.map(t => t.id));
    tiles.value = tiles.value.filter(t => !ids.has(t.id));
    if (!tiles.value.length) win();
    else {
      save();
      checkDeadlock();   // 消完这一对之后没得走了就重排
    }
  }, POP_MS);
}

// 把一份盘面同步到 tiles 上：
// - 洗完之后每张牌原来的格子还都有牌（只换了种类）→ 原地换 emoji，保留牌的身份，动画最自然
// - 否则说明兜底那层挪了位置（只剩最后一对时就是这种情况）→ 按新盘面重建
function applyGrid(next) {
  const alive = tiles.value.filter(t => !t.popping);
  const inPlace = alive.length > 0 && alive.every(t => next[t.r][t.c]);
  if (inPlace) {
    alive.forEach(t => { t.kind = next[t.r][t.c]; });
    return;
  }
  const list = [];
  for (let r = 0; r < conf.value.rows; r++) {
    for (let c = 0; c < conf.value.cols; c++) {
      if (next[r][c]) list.push({ id: ++tileId, kind: next[r][c], r, c, popping: false });
    }
  }
  tiles.value = list;
}

// 死局检测：一点能消的对、一步能凑成对的滑动都没有 → 重排剩下的 emoji
// （先只换种类，不行再挪位置；reshuffleBoard 保证洗完一定有解）
function checkDeadlock() {
  if (phase.value !== PLAY || !tiles.value.length) return;
  if (hasAnyMove(grid.value)) return;
  applyGrid(reshuffleBoard(grid.value));
  save();
  shuffling.value = true;
  clearTimeout(shuffleTimer);
  shuffleTimer = setTimeout(() => { shuffling.value = false; }, SHUFFLE_MS);
}

// 点一下：上下左右有同款就消这一对，没有就让所有同款晃一下
function tapTile(r, c) {
  const t = tileAt(r, c);
  if (!t || phase.value !== PLAY) return;
  const partner = findPartner(grid.value, r, c);
  if (partner) {
    eliminate([r, c], partner);
    return;
  }
  // 点了但周围没有同款 → 只有晃动提示，算一次无效操作
  missCombo();
  shakeKind.value = t.kind;
  clearTimeout(shakeTimer);
  shakeTimer = setTimeout(() => { shakeKind.value = 0; }, SHAKE_MS);
}

// ---------- 触摸（web 的 pointerdown / pointermove / pointerup）----------
// 小程序没有 Pointer Events / getBoundingClientRect：棋盘矩形用 selectorQuery 量一次，
// 量不到时按「页面居中 + 固定高度」算出来兜底。
let boardRect = { left: 0, top: 0, width: 0, height: 0 };

function measureBoard(cb) {
  try {
    uni.createSelectorQuery()
      .select('#slide-board')
      .boundingClientRect((r) => {
        if (r && r.width) boardRect = { left: r.left, top: r.top, width: r.width, height: r.height };
        if (cb) cb();
      })
      .exec();
  } catch {
    if (cb) cb();
  }
}

function boardOrigin() {
  if (boardRect.width) return { left: boardRect.left, top: boardRect.top };
  const vw = viewport.value.w || 375;
  return {
    left: (vw - boardW.value / k.value) / 2,
    top: PAGE_FIXED_H / k.value,
  };
}

function cellAtPoint(clientX, clientY) {
  const o = boardOrigin();
  const stepX = boardRect.width ? boardRect.width / conf.value.cols : cellPxLen.value;
  const stepY = boardRect.height ? boardRect.height / conf.value.rows : cellPxLen.value;
  const c = Math.floor((clientX - o.left) / stepX);
  const r = Math.floor((clientY - o.top) / stepY);
  if (r < 0 || r >= conf.value.rows || c < 0 || c >= conf.value.cols) return null;
  return { r, c };
}

// 小程序没有 Pointer Events：坐标统一从触摸事件里取。
// 用 changedTouches（touchend 时 touches 是空的），取不到再退回 touches。
function touchPoint(e) {
  const changed = e && e.changedTouches;
  if (changed && changed.length) return changed[0];
  const list = e && e.touches;
  if (list && list.length) return list[0];
  return null;
}

function onTouchStart(e) {
  if (phase.value !== PLAY) return;
  const p = touchPoint(e);
  if (!p) return;
  const at = cellAtPoint(p.clientX, p.clientY);
  if (!at) return;
  const t = tileAt(at.r, at.c);
  if (!t) return;
  drag.value = {
    id: t.id, r: at.r, c: at.c,
    startX: p.clientX, startY: p.clientY,
    axis: null, sign: 1, dir: null, shift: 0, maxShift: 0,
    groupIds: new Set([t.id]), groupCells: [[at.r, at.c]],
  };
  if (!boardRect.width) measureBoard();
}

function onTouchMove(e) {
  const d = drag.value;
  if (!d) return;
  const p = touchPoint(e);
  if (!p) return;
  const dx = p.clientX - d.startX;
  const dy = p.clientY - d.startY;
  if (!d.axis) {
    if (Math.hypot(dx, dy) < TAP_SLOP) return;
    d.axis = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
    d.sign = (d.axis === 'h' ? dx : dy) >= 0 ? 1 : -1;
    d.dir = d.axis === 'h' ? { r: 0, c: d.sign } : { r: d.sign, c: 0 };
    // 方向一旦定下来就锁住：这一组 = 自己 + 该方向上所有 emoji，能滑多远看前面的空格
    const info = slideParams(grid.value, d.r, d.c, d.dir.r, d.dir.c);
    d.maxShift = info ? info.maxShift : 0;
    d.groupCells = info ? info.cells : [[d.r, d.c]];
    d.groupIds = new Set(
      d.groupCells.map(([r, c]) => (tileAt(r, c) || {}).id).filter(id => id !== undefined),
    );
  }
  const along = (d.axis === 'h' ? dx : dy) * d.sign;
  d.shift = Math.min(d.maxShift, Math.max(0, along / cellPxLen.value));   // 跟手（可以是小数）
}

function onTouchEnd() {
  const d = drag.value;
  drag.value = null;                 // 先把整组还原成格子坐标：没提交就是弹回原位
  if (!d || phase.value !== PLAY) return;
  if (!d.axis) { tapTile(d.r, d.c); return; }
  const k = Math.round(d.shift);
  if (k < 1) return;                 // 没滑出去一整格，什么都不做
  const nr = d.r + d.dir.r * k;
  const nc = d.c + d.dir.c * k;
  const next = shiftGroup(grid.value, d.groupCells, d.dir.r, d.dir.c, k);
  const partner = findPartner(next, nr, nc);
  // 落点四周没有同款 → 不提交（上面已经把 drag 清掉，就是弹回原位），并算一次无效操作
  if (!partner) {
    missCombo();
    return;
  }
  // 提交：这一组落到滑过去的位置，其余 emoji 留在原地
  const snapshot = d.groupCells.map(([r, c]) => tileAt(r, c)).filter(Boolean);
  snapshot.forEach(t => {
    t.r += d.dir.r * k;
    t.c += d.dir.c * k;
  });
  eliminate([nr, nc], partner);
}

function onTouchCancel() {
  drag.value = null;                 // 手势被打断：只弹回，不移动
}

// ---------- 帮助 ----------

// 帮助文案：导语 + 各条（用空行分段，HelpSheet 会拆成段落）
const helpText = computed(() => {
  const parts = [];
  const keys = ['helpMsg'];
  for (let i = 1; i <= 5; i += 1) keys.push(`help${i}`);
  keys.forEach((key) => { const v = tt(key); if (v && v !== key) parts.push(v); });
  return parts.join('\n\n');
});

function showHelp() {
  helpOpen.value = true;
}

// ---------- 存档（key 与字段都和 web 一字不差）----------

function save() {
  setJSON(STATE_KEY, {
    level: level.value,
    phase: phase.value,
    elapsed: elapsed.value,
    tiles: tiles.value.filter(t => !t.popping).map(t => [t.kind, t.r, t.c]),
  });
}

function restore() {
  try {
    const saved = getJSON(STATE_KEY);
    if (!saved || !Array.isArray(saved.tiles)) return false;
    if (saved.phase !== PLAY && saved.phase !== WON && saved.phase !== OVER) return false;
    // ⚠️ 胜利时棋盘是**空的**（全消完），所以不能拿「牌数非空」当门槛 ——
    //    否则胜利结算的存档会被判无效，onMounted 兜底 startLevel(1)，玩家直接掉回第 1 关。
    //    空盘只对 WON 合法（失败时盘上还剩着牌，照旧要校验）。
    if (!saved.tiles.length && saved.phase !== WON) return false;
    const lv = Math.max(1, +saved.level || 1);
    const cfg = levelConfig(lv);
    if (saved.tiles.length > cfg.rows * cfg.cols) return false;
    startLevel(lv, {
      // 老存档里可能混进过 kind = 0 的空位牌，这里一并丢掉
      tiles: saved.tiles
        .map(([kind, r, c]) => ({ id: ++tileId, kind, r, c, popping: false }))
        .filter(t => t.kind > 0),
      elapsed: Math.max(0, +saved.elapsed || 0),
      // 阶段也交给 startLevel 一起落地（胜利 / 失败都**停在结算层**，由玩家自己决定
      // 「➡️ 下一关」还是「🔄 重玩本关」）
      phase: saved.phase,
    });
    return true;
  } catch {
    return false;
  }
}

// ---------- 生命周期 ----------

function onResize() {
  viewport.value = readViewport();
  nextTick(() => measureBoard());
  // 旋转 / 改变窗口大小后布局要下一拍才落定，再补量一次
  setTimeout(() => measureBoard(), 60);
}

onMounted(() => {
  if (typeof uni.onWindowResize === 'function') uni.onWindowResize(onResize);
  if (!restore()) startLevel(1);
  nextTick(() => measureBoard());
  // 布局换算完再量一次（等原生导航栏 / 字体加载完成）
  setTimeout(() => measureBoard(), 80);
});

// 切后台（离开游戏界面）时暂停计时并存档；回前台按 CountTimer 的行为续上
onHide(() => {
  stopTick();
  save();
});
onShow(() => {
  if (phase.value === PLAY && tiles.value.length) startTick();
});

onUnmounted(() => {
  if (typeof uni.offWindowResize === 'function') uni.offWindowResize(onResize);
  generation += 1;
  stopTick();
  clearTimeout(shakeTimer);
  clearTimeout(shuffleTimer);
  clearTimeout(dealTimer);
  clearTimeout(comboTimer);
  clearTimeout(comboTipTimer);
  clearTimeout(wonTimer);
  drag.value = null;
  save();
});
</script>

<style lang="scss" scoped>
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

/* ---------- 统计条（web 的 .card.score-area：三格 + 贴底的本关进度条） ---------- */
.score-area {
  position: relative;
  width: 690rpx;                 /* web 的 calc(100% - 32px) = 361px */
  display: flex;
  align-items: center;
  padding: 0 19rpx;              /* web 的 padding: 0 8px */
  box-sizing: border-box;
  overflow: hidden;              /* 进度条贴底 + 圆角裁切 */
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
  font-variant-numeric: tabular-nums;
}
.divider {
  width: 2rpx;                   /* 1px */
  height: 46rpx;                 /* 24px */
  align-self: center;
  background: #e1e1e1;
  opacity: 0.6;
}
/* 本关进度条（与连连看 / 消消乐同一套：3px 高、贴底、主色填充） */
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

/* ---------- 操作区（web 的 .card.opt-area，1.6 : 1.2 分格） ---------- */
.opt-area {
  width: 690rpx;
  display: flex;
  align-items: center;
  padding: 0 19rpx;
  box-sizing: border-box;
}
.opt-half {
  flex: 1.6;
  display: flex;
  align-items: center;
  justify-content: center;
}
.start-wrapper {
  flex: 1.2;
  display: flex;
  align-items: center;
  justify-content: center;
}
.board-info {
  font-size: 27rpx;              /* 14px */
  color: #5f6b7a;
  font-weight: 400;
  white-space: nowrap;
}
/* 主按钮：web 的 .game-icon（padding 8px 16px / 14px 字 / 8px 圆角） */
.game-icon {
  margin: 0;
  padding: 0 30rpx;
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

/* ---------- 游戏区：尺寸由棋盘反算（web 的 .game-area，width: fit-content） ---------- */
.game-area {
  position: relative;
  margin: 0 auto;
  box-sizing: border-box;
}
/* 棋盘：web 的 .board.dot-board（#bbada0 + 10px 一格的白点，透明度 .18），
   拖动是主要操作 → 禁掉棋盘上的滚动 / 缩放，overflow 与 web 一样是 hidden */
.board {
  position: relative;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  border-radius: 27rpx;
  background-color: #bbada0;
  background-image: radial-gradient(circle, rgba(255, 255, 255, 0.18) 2rpx, transparent 2rpx);
  background-size: 19rpx 19rpx;
  background-position: 10rpx 10rpx;
  overflow: hidden;
  touch-action: none;
}
/* 每张牌绝对定位，位置全靠 left/top 走（= 自己在哪一格 + 拖动偏移）：
   拖动时关掉过渡（1:1 跟手），松手后再打开，落位与弹回都带一点回弹 */
.tile {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: left 0.26s cubic-bezier(0.34, 1.4, 0.64, 1), top 0.26s cubic-bezier(0.34, 1.4, 0.64, 1);
  will-change: left, top;
}
.tile.dragging {
  transition: none;
  z-index: 3;                    /* 会动的牌永远压在不动的那张上面 */
}
.tile.popping {
  z-index: 2;
}
/* 入场 / 重排 / 晃动 / 消除的动画一律挂在**内层** .tile-body 上（外层的 left/top 是位置） */
.tile.shaking .tile-body {
  animation: tile-shake 0.62s ease-in-out;
}
.tile.shuffling .tile-body {
  animation: tile-reshuffle 0.55s ease-in-out both;
}
.tile.dealing .tile-body {
  animation: tile-deal 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.tile.popping .tile-body {
  animation: tile-pop 0.28s ease-in forwards;
}
.tile-body {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border-radius: 15rpx;          /* web 的 --radius-tile 8px */
  border: 2rpx solid #c9d0da;
  background: #fff;
  box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.12);
  line-height: 1;
}
.tile-glyph {
  line-height: 1;
}
/* 炸开时从牌心扩出去的一圈光晕（web 的 .tile-body::after + pop-ring） */
.pop-ring {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: #12833f;
  pointer-events: none;
  animation: pop-ring 0.28s ease-out forwards;
}

/* ---------- 连击提示（与连连看同款，落在棋盘上方那条空隙里） ---------- */
.combo-tip {
  position: absolute;
  left: 50%;
  top: -30rpx;                   /* web 的 top: -15px */
  z-index: 5;
  padding: 4rpx 19rpx;           /* web 的 2px 10px */
  border-radius: 15rpx;
  background: #23804e;
  color: #fff;
  font-size: 24rpx;              /* 12.5px */
  font-weight: bold;
  line-height: 1.1;
  white-space: nowrap;
  box-shadow: 0 4rpx 23rpx rgba(0, 0, 0, 0.08);
  pointer-events: none;
  transform: translate(-50%, 0);
  animation: combo-pop-a 1.5s ease forwards;
}
.combo-tip.n-3 { font-size: 27rpx; }   /* 连得越高字越大（web 的 .n-3 / .n-4） */
.combo-tip.n-4 { font-size: 31rpx; }
/* 同一条提示条靠切换两条同内容的关键帧名来重播 */
.combo-tip.pop-b { animation-name: combo-pop-b; }
/* 死局重排的提示：棋盘正中浮一下（web 的 .shuffle-tip） */
.shuffle-tip {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 3;
  padding: 11rpx 27rpx;          /* web 的 6px 14px */
  border-radius: 15rpx;
  background: #fff;
  color: #2c3e50;
  border: 2rpx solid #e1e1e1;
  box-shadow: 0 4rpx 23rpx rgba(0, 0, 0, 0.08);
  font-size: 27rpx;              /* 14px */
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
}

/* ---------- 结算层：与游戏区矩形完全重合（按钮规格走 App.vue 全局） ---------- */
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
.result.lose { color: #b11; }
.result-title { font-size: 34rpx; line-height: 1.35; }
.result-line {
  font-size: 29rpx;              /* 15px */
  font-variant-numeric: tabular-nums;
}

/* ---------- 新游戏二次确认（本地版 ConfirmDialog，三按钮） ---------- */
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

/* ---------- 关键帧（数值逐一照 web 的 SlideGame.vue / link.vue） ---------- */
@keyframes tile-pop {
  0% { transform: scale(1); opacity: 1; }
  35% { transform: scale(1.16); opacity: 1; }
  100% { transform: scale(0.12) rotate(30deg); opacity: 0; }
}
@keyframes tile-deal {
  0% { transform: scale(0.2); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes tile-shake {
  0%, 100% { transform: translateX(0) rotate(0); }
  18% { transform: translateX(-14%) rotate(-7deg); }
  38% { transform: translateX(14%) rotate(7deg); }
  58% { transform: translateX(-10%) rotate(-5deg); }
  78% { transform: translateX(8%) rotate(4deg); }
}
@keyframes tile-reshuffle {
  0% { transform: scale(1) rotate(0); opacity: 1; }
  35% { transform: scale(0.7) rotate(-14deg); opacity: 0.3; }
  70% { transform: scale(1.14) rotate(9deg); opacity: 1; }
  100% { transform: scale(1) rotate(0); }
}
@keyframes combo-pop-a {
  0% { opacity: 0; transform: translate(-50%, 15rpx) scale(0.6); }
  14% { opacity: 1; transform: translate(-50%, 0) scale(1.12); }
  26%, 78% { opacity: 1; transform: translate(-50%, 0) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -15rpx) scale(0.96); }
}
@keyframes combo-pop-b {
  0% { opacity: 0; transform: translate(-50%, 15rpx) scale(0.6); }
  14% { opacity: 1; transform: translate(-50%, 0) scale(1.12); }
  26%, 78% { opacity: 1; transform: translate(-50%, 0) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -15rpx) scale(0.96); }
}
@keyframes pop-ring {
  0% { transform: scale(0.6); opacity: 0.9; }
  100% { transform: scale(2.1); opacity: 0; }
}
</style>
