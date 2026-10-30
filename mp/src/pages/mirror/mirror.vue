<template>
  <view class="screen">
    <!-- 全站背景（粒子连线 + 底部过山车，与 web 的 ParticleBackground 同款） -->
    <ParticleBackground />
    <view class="page">
      <!-- 统计条：最佳用时 / 当前用时（与 web 的 score-area 一致）。
           计时那一格是隐藏彩蛋的热区：按住 1.5 秒把展示区整片翻回正面偷看（帮助里不写）。 -->
      <view class="card score-area">
        <view class="stat">
          <text class="stat-label">{{ tt('best') }}</text>
          <text class="stat-value">{{ best ? fmtTime(best) : '--:--' }}</text>
        </view>
        <view class="divider" />
        <view
          class="stat time-stat"
          :class="{ peeking }"
          @touchstart="startPeek"
          @touchend="endPeek"
          @touchcancel="endPeek"
        >
          <text class="stat-label">{{ tt('time') }}</text>
          <text class="stat-value">{{ fmtTime(elapsed) }}</text>
        </view>
      </view>

      <!-- 操作区：难度 −/+（显示当前 emoji 个数）+ 新游戏（与 web 的 opt-card 一致，两格各占一半） -->
      <view class="card opt-area">
        <view class="opt-item difficulty-wrapper">
          <view class="opt-icon" :class="{ disable: difficulty === MIN_DIFFICULTY }" @click="changeDifficulty(-1)">
            <view class="opt-ico i-carbon-subtract-alt" />
          </view>
          <text class="difficulty-value">{{ count }}</text>
          <view class="opt-icon" :class="{ disable: difficulty === MAX_DIFFICULTY }" @click="changeDifficulty(1)">
            <view class="opt-ico i-carbon-add-alt" />
          </view>
        </view>
        <view class="divider" />
        <view class="opt-item">
          <button class="game-icon" @click="restartRound">{{ tt('start') }}</button>
        </view>
      </view>

      <!-- 游戏区：展示区 → 提示条 → 游戏区（顺序与 web 完全一致，没有区域标签）。
           两个区里每张牌都是绝对定位，和 layout 共用同一份坐标数学。 -->
      <view class="game-area">
        <view class="area display-area" :style="{ height: areaH + 'rpx' }">
          <view
            v-for="c in displayCards"
            :key="c.k"
            class="mirror-card"
            :class="{ 'face-down': displayDown(c.i), silent }"
            :style="displayStyle(c.i)"
          >
            <!-- 两个面常驻，.face-down 驱动它们各自绕 Y 轴转 180°（真 3D 过渡，见下面的 CSS）。
                 不用 v-if 换面：那样只看到新的一面转进来，看不到牌「翻过去」的过程。
                 也不用 preserve-3d / backface-visibility —— 小程序里表现不一致（AGENTS 第十七节）。 -->
            <view class="face front" :style="{ fontSize: frontFont + 'rpx' }">
              <text class="emoji">{{ display[c.i] }}</text>
            </view>
            <view class="face back" :style="{ fontSize: backFont + 'rpx' }">
              <view class="back-ico i-mdi-mirror-variant" />
            </view>
          </view>
        </view>

        <!-- 提示区：「位置相同 N / n」；交换提交后变成「计算中…」+ 转圈（CHECK_MS = 0.5s） -->
        <view class="hint-bar" :class="{ busy: phase === CHECKING }">
          <template v-if="phase === CHECKING">
            <view class="spin i-mdi-progress-clock" />
            <text>{{ tt('checking') }}</text>
          </template>
          <template v-else>
            <text>{{ tt('matchHint') }}</text>
            <text class="hint-num">{{ matches }}</text>
            <text class="hint-total">/ {{ count }}</text>
          </template>
        </view>

        <!-- 游戏区：开局也是背面，洗牌完成后才逐张翻开；点两张交换 -->
        <view class="area play-area" :style="{ height: areaH + 'rpx' }">
          <view
            v-for="c in playCards"
            :key="c.k"
            class="mirror-card playable"
            :class="{ 'face-down': gameHidden[c.i], picked: pick === c.i, settling, silent }"
            :style="playStyle(c.i)"
            @click="onCardClick(c.i)"
          >
            <view class="face front" :style="{ fontSize: frontFont + 'rpx' }">
              <text class="emoji">{{ game[c.i] }}</text>
            </view>
            <view class="face back" :style="{ fontSize: backFont + 'rpx' }">
              <view class="back-ico i-mdi-mirror-variant" />
            </view>
          </view>
        </view>

        <!-- 结算浮层：等展示区全部翻回正面之后才出现（showResult），恢复存档的胜利态直接铺 -->
        <view v-if="phase === WON && showResult" class="result win">
          <text class="tip">{{ tt('tipWin') }}</text>
          <text class="final-time">{{ fmtTime(elapsed) }}</text>
          <text v-if="isNewBest" class="new-best">{{ tt('newBest') }}</text>
          <button class="game-icon" @click="restartRound">{{ tt('start') }}</button>
        </view>
      </view>
    </view>

    <!-- 胜利彩带：只在真正赢下的那一刻放（justWon），恢复存档不放 -->
    <Confetti v-if="justWon" />
    <!-- 本作 web 没有模式切换，所以右下角只有帮助一颗（模式在上、帮助在下的约定在有模式的页面才用得上） -->
    <FloatingActions>
      <view class="fab" @click="showHelp"><view class="fab-ico i-carbon-help" /></view>
    </FloatingActions>
    <HelpSheet :open="helpOpen" :text="helpText" @close="helpOpen = false" />
  </view>
</template>

<script setup>
// Emoji 镜像 · 微信小程序版
// 纯逻辑来自 web 的 src/games/mirror/board.js（原样复制，import 都不用改：两端都是 @/shared/emojis）。
// 视图按 web 的 MirrorGame.vue 重写，只替换平台能力：
// - 存档：web 的本地存储 → @/core/storage（key 与 web 一字不差：__emoji_mirror__state / __emoji_mirror__best_<d>）
// - 音效：Web Audio → @/core/sfx（web 在放烟花那一刻播 success.mp3 → 这里 playWin() 同一个落点）
// - 计时：web 的 CountTimer → 本页 setInterval（PLAY / CHECKING 每秒 +1 并写存档）
// - 尺寸：web 用 innerWidth/innerHeight 现算 --card；这里同样按视口算，只是换成 rpx
// - 翻转：web 用 preserve-3d + backface-visibility 让整张牌转 180°。小程序这两项不稳
//   （AGENTS 第十七节），所以改成：牌面 / 牌背两个面常驻，靠 .face-down 让它们各自
//   rotateY(0 ↔ 180) 过渡 0.46s，透明度在 0.23s（刚好侧立那一刻）瞬切 —— 真 3D 翻转，
//   不用 scaleX 压扁、也不靠 backface-visibility。父级 perspective: 700rpx。
// - 聚拢 / 飞回 / 交换：web 靠量 DOM 位置算位移；这里牌本来就是绝对定位，
//   直接按 layout（同一份坐标数学）算 rpx 位移，不用 selectorQuery，量不到的问题不存在。
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';

import Confetti from '@/components/Confetti.vue';
import FloatingActions from '@/components/FloatingActions.vue';
import HelpSheet from '@/components/HelpSheet.vue';
import { getJSON, getRaw, setRaw } from '@/core/storage';
import { playWin } from '@/core/sfx';
import {
  MIN_DIFFICULTY, MAX_DIFFICULTY, emojiCount, rowsOf, sameCount, newRound, derange, swapAt, fmtTime,
} from './board';
import { tt } from './i18n';
import { setNavTitle } from '@/core/i18n';
import ParticleBackground from '@/components/ParticleBackground.vue';

// 原生导航栏标题跟随语言（pages.json 里的标题是静态的）
setNavTitle(() => tt('gameTitle'));

const [DEAL, PLAY, CHECKING, WON] = ['deal', 'play', 'checking', 'won'];
const STATE_KEY = '__emoji_mirror__state';
const BEST_KEY = '__emoji_mirror__best_';
const REVEAL_MS = 1100;    // 展示区正面亮这么久（让玩家看一眼这一局有哪些 emoji）
const FLIP_STAGGER = 90;   // 逐张翻面的间隔
const FLIP_MS = 460;       // 单张翻面时长（与 CSS 的 transform 过渡时长一致，web 也是 0.46s）
const GATHER_MS = 420;     // 聚到中间的时长（web 同值；CSS 过渡 0.3s）
const FLY_STEP = 90;       // 飞回各自位置时每张的错开间隔
const SWAP_MS = 300;       // 交换动画时长（CSS transition 0.3s）
const CHECK_MS = 500;      // 「计算中」停留（用户指定 0.5 秒）
const PEEK_MS = 1500;      // 隐藏彩蛋：长按计时器这么久偷看展示区

// ---------- 尺寸（rpx：750rpx = 屏宽）----------
const GAP = 19;            // 牌缝 10px
const AREA_W = 644;        // 游戏区内容宽 = 690 − 左右 padding 23×2
// 页面里除「两个牌区」之外的固定高度（rpx）：
// padding 36 + 统计条 168 + gap 36 + 操作区 120 + gap 36 + 游戏区 padding 23×2 + 提示条 65 + 它上下 23×2
const PAGE_FIXED_H = 36 + 168 + 36 + 120 + 36 + 23 * 2 + 65 + 23 * 2;   // 553
// 右下角悬浮按钮让位：按钮 96 + 底距 40 + 余量 28（本页只有一颗帮助按钮）。
// 不再额外扣安全区：有 Home Indicator 的机型屏幕都更高（844/812），此时牌宽是被**宽度**卡住的，
// 竖向预算本来就用不满；而 375×667 这类短屏机型安全区为 0。实测 375×667 下仍留 ~11px 余量。
const FAB_CLEAR = 96 + 40 + 28;                                          // 164
const CARD_MIN = 65;       // 34px
const CARD_MAX = 137;      // 72px（web 的上限）

const difficulty = ref(MIN_DIFFICULTY);
const display = ref([]);
const game = ref([]);
const hidden = ref([]);        // 展示区某张是否背面朝上
const gameHidden = ref([]);    // 游戏区每张是否背面朝上（只在开局的洗牌阶段为 true）
const gathering = ref(false);  // 展示区是否正聚在中间
const flyDelay = ref([]);      // 飞出时每张的 transition-delay
const dealSeq = ref(0);        // 开局序号：拼进 :key，逼小程序每局重建卡片（见分册的「坑」）
const matches = ref(0);
const pick = ref(null);
const swap = ref(null);        // { a, b, dx, dy } —— 交换动画期间的两张牌
const settling = ref(false);   // 撤掉交换位移的那一帧禁用过渡
const silent = ref(true);      // 恢复存档后的首帧禁用一切过渡（否则展示区会「滑」一下）
const peeking = ref(false);    // 彩蛋：长按计时器满 1.5s 时把展示区翻开偷看（松手就翻回去）
const phase = ref(DEAL);
const elapsed = ref(0);
const best = ref(0);
const isNewBest = ref(false);
const showResult = ref(false); // 展示区翻完之后才铺遮罩 / 放烟花
// 彩带只在真正赢下的那一刻放：恢复存档的胜利态不放（与 web 一致）
const justWon = ref(false);

const cardSize = ref(CARD_MAX);

const count = computed(() => emojiCount(difficulty.value));
const rowsArr = computed(() => rowsOf(count.value));
const frontFont = computed(() => Math.round(cardSize.value * 0.5));    // web 的 .face font-size
const backFont = computed(() => Math.round(cardSize.value * 0.45));    // web 的 .back font-size
const areaH = computed(() => {
  const rows = rowsArr.value.length;
  return rows * cardSize.value + (rows - 1) * GAP;
});
// v-for 的 key 必须是**简单的成员表达式**才会被编成 wx:key（复合表达式会被丢掉 → 按下标复用），
// 所以把 key 预先拼进对象里，模板写 :key="c.k"。
const displayCards = computed(() => Array.from({ length: count.value }, (_, i) => ({ i, k: `d${dealSeq.value}-${i}` })));
const playCards = computed(() => Array.from({ length: count.value }, (_, i) => ({ i, k: `g${dealSeq.value}-${i}` })));

// 两个区共用同一份坐标数学：按 rowsOf 分行、每行居中、行间 GAP
const layout = computed(() => {
  const card = cardSize.value;
  const out = [];
  let top = 0;
  rowsArr.value.forEach((n) => {
    const rowW = n * card + (n - 1) * GAP;
    const startLeft = Math.round((AREA_W - rowW) / 2);
    for (let k = 0; k < n; k += 1) out.push({ left: startLeft + k * (card + GAP), top });
    top += card + GAP;
  });
  return out;
});

let timers = [];
let peekTimer = null;
let wonTimer = null;
let tickTimer = null;
let round = 0;                  // 局序号：换难度 / 重开时作废旧动画

function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
  clearTimeout(peekTimer);
  peekTimer = null;
  clearTimeout(wonTimer);
  wonTimer = null;
}
const wait = ms => new Promise((res) => { timers.push(setTimeout(res, ms)); });

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
  const rows = rowsArr.value.length;
  const maxRow = Math.max(...rowsArr.value);
  const byW = (AREA_W - (maxRow - 1) * GAP) / maxRow;
  // 竖向预算：两个牌区共 2×rows 行，还要让开右下角的悬浮按钮
  const byH = (h * pxToRpx - PAGE_FIXED_H - FAB_CLEAR - 2 * (rows - 1) * GAP) / (2 * rows);
  cardSize.value = Math.round(Math.max(CARD_MIN, Math.min(byW, byH, CARD_MAX)));
}

// ---------- 存档 ----------
function bestKey(d = difficulty.value) { return `${BEST_KEY}${d}`; }
function loadBest() {
  best.value = Math.max(0, Math.floor(+(getRaw(bestKey()) || 0)));
}
function save() {
  setRaw(STATE_KEY, JSON.stringify({
    difficulty: difficulty.value,
    display: display.value,
    game: game.value,
    elapsed: elapsed.value,
    phase: phase.value === WON ? WON : PLAY,
  }));
}

// ---------- 计时（web 的 CountTimer：PLAY / CHECKING 每秒走一格并写存档）----------
function startTick() {
  stopTick();
  tickTimer = setInterval(() => {
    if (phase.value !== PLAY && phase.value !== CHECKING) return;
    elapsed.value += 1;
    save();
  }, 1000);
}
function stopTick() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
}

// ---------- 开局：亮出来 → 翻面 → 聚到中间 → 随机飞回各自位置 → 游戏区翻开 ----------
function shuffle(arr) {
  const next = arr.slice();
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

async function startRound(lv = difficulty.value) {
  clearTimers();
  round += 1;
  const my = round;
  difficulty.value = Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, lv));
  const { count: n, display: d, game: g } = newRound(difficulty.value);
  display.value = d;
  game.value = g;
  hidden.value = new Array(n).fill(false);
  gameHidden.value = new Array(n).fill(true);   // 游戏区开局是背面（洗牌完成后才翻开）
  gathering.value = false;
  flyDelay.value = new Array(n).fill(0);
  matches.value = 0;
  pick.value = null;
  swap.value = null;
  settling.value = false;
  elapsed.value = 0;
  isNewBest.value = false;
  showResult.value = false;
  justWon.value = false;
  phase.value = DEAL;
  dealSeq.value += 1;         // 每局换一批 key：所有卡片都重建，入场翻面表现才一致
  peeking.value = false;      // 新一局开始时收掉偷看态
  loadBest();
  computeMetrics();
  stopTick();

  await wait(REVEAL_MS);                       // ① 展示区正面亮一会儿
  if (my !== round) return;
  for (let i = 0; i < n; i += 1) {             // ② 先逐张翻面（玩家看不到后面的洗牌）
    hidden.value = hidden.value.map((v, k) => (k === i ? true : v));
    await wait(FLIP_STAGGER);
    if (my !== round) return;
  }
  await wait(FLIP_MS);
  if (my !== round) return;

  gathering.value = true;                      // ③ 全部叠到展示区中间
  await wait(GATHER_MS);
  if (my !== round) return;
  // ④ 数据打乱（牌背朝上，玩家看不到结果），再让每张按随机顺序飞回自己的格子
  display.value = shuffle(display.value);
  // **打乱之后必须重取一次错排**（web 分册记的坑）：newRound 里的错排是针对「打乱前的展示区」算的，
  // 展示区一被打乱那个保证就失效了（n=4 时至少撞上一个位置的概率约 63%）。此刻游戏区还是背面。
  game.value = derange(display.value);
  const delays = new Array(n).fill(0);
  shuffle(Array.from({ length: n }, (_, i) => i)).forEach((card, k) => { delays[card] = k * FLY_STEP; });
  flyDelay.value = delays;
  gathering.value = false;
  await wait(GATHER_MS + (n - 1) * FLY_STEP + 80);
  if (my !== round) return;
  flyDelay.value = new Array(n).fill(0);

  for (let i = 0; i < n; i += 1) {             // ⑤ 洗牌完成后再把游戏区逐张翻开
    gameHidden.value = gameHidden.value.map((v, k) => (k === i ? false : v));
    await wait(FLIP_STAGGER);
    if (my !== round) return;
  }
  await wait(FLIP_MS);
  if (my !== round) return;
  phase.value = PLAY;
  startTick();
  save();
}

// 展示区某张是不是背面（偷看期间整片翻回正面）
const displayDown = i => hidden.value[i] && !peeking.value;

// 展示区某张的样式：聚拢时移到区域中心；飞回时按顺序错开
function displayStyle(i) {
  const pos = layout.value[i] || { left: 0, top: 0 };
  const card = cardSize.value;
  const style = {
    width: `${card}rpx`,
    height: `${card}rpx`,
    left: `${pos.left}rpx`,
    top: `${pos.top}rpx`,
  };
  if (gathering.value) {
    style.left = `${Math.round((AREA_W - card) / 2)}rpx`;
    style.top = `${Math.round((areaH.value - card) / 2)}rpx`;
    style.transform = 'scale(0.82)';
    style.zIndex = 3;
    return style;
  }
  if (flyDelay.value[i]) style.transitionDelay = `${flyDelay.value[i]}ms`;
  return style;
}

// 游戏区某张的样式：交换动画期间两张各带一个相反的位移（位移量直接由 layout 算，不用量 DOM）
function playStyle(i) {
  const pos = layout.value[i] || { left: 0, top: 0 };
  const card = cardSize.value;
  const style = {
    width: `${card}rpx`,
    height: `${card}rpx`,
    left: `${pos.left}rpx`,
    top: `${pos.top}rpx`,
  };
  const s = swap.value;
  if (s && s.a === i) {
    style.left = `${pos.left + s.dx}rpx`;
    style.top = `${pos.top + s.dy}rpx`;
    style.zIndex = 2;
  } else if (s && s.b === i) {
    style.left = `${pos.left - s.dx}rpx`;
    style.top = `${pos.top - s.dy}rpx`;
    style.zIndex = 2;
  }
  return style;
}

// ---------- 交换 ----------
function onCardClick(i) {
  if (phase.value !== PLAY || swap.value) return;
  if (pick.value === null) { pick.value = i; return; }
  if (pick.value === i) { pick.value = null; return; }
  const a = pick.value;
  const b = i;
  pick.value = null;
  const pa = layout.value[a] || { left: 0, top: 0 };
  const pb = layout.value[b] || { left: 0, top: 0 };
  swap.value = { a, b, dx: pb.left - pa.left, dy: pb.top - pa.top };
  const my = round;
  timers.push(setTimeout(() => {
    if (my !== round) return;
    // 先换数据，再**在禁用过渡的那一帧**撤掉位移 —— 两者相抵、画面不动。
    // 不这么做的话，撤掉位移会再按 0.3s 滑回去一次（web 分册里用户报的「多跳动了一次」）。
    game.value = swapAt(game.value, a, b);
    settling.value = true;
    swap.value = null;
    timers.push(setTimeout(() => { settling.value = false; }, 30));
    phase.value = CHECKING;                       // 计算中（用户要求 0.5 秒）
    timers.push(setTimeout(() => {
      if (my !== round) return;
      matches.value = sameCount(game.value, display.value);
      if (matches.value === count.value) finishWin();
      else { phase.value = PLAY; save(); }
    }, CHECK_MS));
  }, SWAP_MS));
}

function finishWin() {
  // 先停表：胜利后遮罩上的时间不能再走（web 分册里用户报过）
  stopTick();
  phase.value = WON;
  const secs = Math.max(0, Math.floor(elapsed.value));
  elapsed.value = secs;
  const prev = Math.max(0, Math.floor(+(getRaw(bestKey()) || 0)));
  isNewBest.value = !prev || secs < prev;
  if (isNewBest.value) setRaw(bestKey(), String(secs));
  loadBest();
  const my = round;
  const n = count.value;
  hidden.value.forEach((_, i) => {                // 展示区逐张翻回正面
    timers.push(setTimeout(() => {
      if (my !== round) return;
      hidden.value = hidden.value.map((v, k) => (k === i ? false : v));
    }, i * 90));
  });
  gameHidden.value = new Array(n).fill(false);
  // **等展示区全部翻完**再放烟花、铺遮罩（web 分册的用户要求）
  timers.push(setTimeout(() => {
    if (my !== round) return;
    showResult.value = true;
    justWon.value = true;                          // 彩带只在真正赢下这一刻放
    clearTimeout(wonTimer);
    wonTimer = setTimeout(() => { justWon.value = false; }, 4000);
    playWin();                                     // web 在 confetti() 里播 success.mp3：同一个落点
  }, (n - 1) * 90 + FLIP_MS));
  save();
}

// ---------- 隐藏彩蛋：长按计时器 1.5s 偷看展示区 ----------
// 只改一个独立标记，**不动 hidden、也不写存档**，所以松手就恢复原状，游戏逻辑与进度都不受影响。
function startPeek() {
  if (phase.value !== PLAY && phase.value !== CHECKING) return;
  clearTimeout(peekTimer);
  peekTimer = setTimeout(() => {
    peekTimer = null;
    peeking.value = true;      // 展示区整片翻回正面（.face-down 一撤，3D 过渡自己会播）
  }, PEEK_MS);
}
function endPeek() {
  if (peekTimer) { clearTimeout(peekTimer); peekTimer = null; }
  if (!peeking.value) return;
  peeking.value = false;
}

// ---------- 难度 / 新游戏 ----------
function changeDifficulty(step) {
  const next = Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, difficulty.value + step));
  if (next === difficulty.value) return;
  startRound(next);            // 切换难度 = 立刻开新的一局，不做二次确认（与 web 一致）
}

function restartRound() { startRound(difficulty.value); }

// ---------- 恢复存档 ----------
// **在 setup 阶段就把存档读进来**（而不是等 onMounted）：这样首帧渲染出来就已经是最终状态，
// 展示区不会先画一遍空盘再「翻」过去（web 分册记的坑）。
// **恢复界面时一律不放任何动画**：展示区背面（胜利时正面）、游戏区正面，不铺牌、不洗牌、不翻面。
function restoreState() {
  const s = getJSON(STATE_KEY);
  if (!s || !Array.isArray(s.display) || !Array.isArray(s.game)) return false;
  const n = emojiCount(s.difficulty);
  if (s.display.length !== n || s.game.length !== n) return false;
  difficulty.value = Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, s.difficulty));
  display.value = s.display;
  game.value = s.game;
  matches.value = sameCount(s.game, s.display);
  hidden.value = new Array(n).fill(s.phase !== WON);
  gameHidden.value = new Array(n).fill(false);
  gathering.value = false;
  flyDelay.value = new Array(n).fill(0);
  pick.value = null;
  swap.value = null;
  settling.value = false;
  isNewBest.value = false;
  showResult.value = s.phase === WON;    // 恢复胜利态直接铺遮罩
  loadBest();
  peeking.value = false;
  phase.value = s.phase === WON ? WON : PLAY;
  elapsed.value = Math.max(0, Math.floor(Number(s.elapsed) || 0));
  return true;
}

const restored = restoreState();
// **尺寸也要在 setup 里先算一遍**：只用到视口与档位，不碰 DOM。放到 onMounted 才算是来不及的 ——
// 首帧会先按默认值渲染，窄屏下多行档位会先撑宽再弹回，看起来就是「先大后小」。
computeMetrics();

onMounted(async () => {
  computeMetrics();
  if (restored) {
    // 状态在 setup 里就摆好了（首帧即最终态），这里只补计时器与尺寸
    if (phase.value === PLAY) startTick();        // 计时器接着上次走
    else stopTick();
    await nextTick();
    computeMetrics();
    setTimeout(() => { silent.value = false; }, 40);
    return;
  }
  await nextTick();
  computeMetrics();
  silent.value = false;      // 新开一局：铺牌 / 翻面动画照常
  startRound(MIN_DIFFICULTY);
});

onUnmounted(() => {
  clearTimers();
  stopTick();
});

const helpOpen = ref(false);
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
</script>

<style lang="scss" scoped>
/* 整页只在 .screen 上写一次满屏高度（.page 不再写，否则 200vh 能白滚） */
.screen {
  min-height: 100vh;
  background: transparent;  /* 背景交给 ParticleBackground（canvas 自己铺底色） */
}
/* web 的 .wrapper：padding 64px 16px 0 → 这里按全工程统一成 36rpx / 24rpx，底部 140rpx 让开悬浮按钮 */
.page {
  padding: 36rpx 24rpx 140rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 36rpx;
  background: #f0f2f5;
  color: #2c3e50;
}

/* ---------- 统计条 / 操作区（高度由 App.vue 的全局 .score-area / .opt-area 统一给） ---------- */
.score-area,
.opt-area {
  width: 690rpx;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}
.stat {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4rpx;                     /* 与其它页的统计条统一（web 是 4px） */
}
.stat-label {
  font-size: 23rpx;              /* 12px */
  color: #5f6b7a;
  line-height: 1.2;
}
.stat-value {
  font-size: 42rpx;              /* 22px */
  font-weight: 700;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
/* 计时器那格是长按彩蛋的热区：别让长按变成选中文字 / 系统长按菜单 */
.time-stat {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
.divider {
  width: 2rpx;                   /* 1px */
  height: 46rpx;                 /* 24px */
  align-self: center;
  background: #e1e1e1;
  opacity: 0.6;
}

/* 操作区两格各占一半（web 是 flex: 4 / flex: 4） */
.opt-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* 难度 −/+：web 是 28px 透明方块（没有边框 / 底色）+ 18px 图标 */
.difficulty-wrapper {
  gap: 8rpx;                     /* web 的 gap: 4px */
}
.opt-icon {
  position: relative;
  width: 53rpx;                  /* 28px */
  height: 53rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: #2c3e50;
  font-size: 34rpx;              /* 18px → 图标 1.2em ≈ 41rpx */
  -webkit-tap-highlight-color: transparent;
}
/* 点选热区用 ::after 扩到约 44px，不占布局 */
.opt-icon::after {
  content: '';
  position: absolute;
  top: -15rpx;
  right: -15rpx;
  bottom: -15rpx;
  left: -15rpx;
}
.opt-icon.disable { opacity: 0.35; }
.opt-ico { pointer-events: none; }
.difficulty-value {
  min-width: 42rpx;              /* web 的 min-width: 22px */
  text-align: center;
  font-size: 34rpx;              /* 18px */
  font-weight: 700;
}

/* 主按钮：web 的 .game-icon（padding 8px 12px / 13px 粗体 / 8px 圆角；实测高 37px） */
.game-icon {
  margin: 0;
  padding: 0 23rpx;
  height: 71rpx;
  line-height: 71rpx;
  border: 0;
  border-radius: 15rpx;
  background: #23804e;
  color: #fff;
  font-size: 25rpx;              /* 13px */
  font-weight: bold;
  white-space: nowrap;
  box-sizing: border-box;
}

/* ---------- 游戏区（web 的 .game-area：padding 12px、圆角 14px、无底色） ---------- */
.game-area {
  position: relative;
  width: 690rpx;
  padding: 23rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-radius: 27rpx;
}
/* 两个牌区：宽度撑满内容区，高度由 areaH 给（牌是绝对定位，撑不起父级） */
.area {
  position: relative;
  width: 100%;
}

/* 一张牌：perspective 是 3D 翻转的舞台（子元素 .face 绕 Y 轴转时才像真的翻过来）。
   left/top 给聚拢 / 飞回 / 交换，transform 给聚拢时的缩放和选中的上浮。 */
.mirror-card {
  position: absolute;
  perspective: 700rpx;
  border-radius: 15rpx;
  transition: left 0.3s ease-in-out, top 0.3s ease-in-out, transform 0.3s ease-in-out;
  -webkit-tap-highlight-color: transparent;
}
.playable { cursor: pointer; }
/* 撤掉交换位移的那一帧 / 恢复存档的首帧：关掉过渡（翻转也一起停） */
.settling,
.silent {
  transition: none;
  .face { transition: none; }

}
/* 选中：web 是 outline 2px + offset 1px + 上浮 3px。小程序 outline 支持不稳 → 用双层阴影画描边 */
.mirror-card.picked {
  transform: translateY(-6rpx);
  box-shadow: 0 0 0 3rpx #f0f2f5, 0 0 0 7rpx #23804e;
}
.face {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border-radius: 15rpx;
  border: 2rpx solid #c9d0da;
  box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.12);   /* web 的 --shadow-soft */
  background: #fff;
  line-height: 1;
  transform: rotateY(0deg);
  /* 真 3D 翻转：两个面各自绕 Y 轴转 180°（0.46s，与 web 的 .flip 过渡同长）。
     不透明度用 0.01s 时长 + 0.225s 延迟 —— 刚好在两张牌侧立（90°）那一瞬间瞬切，
     所以永远看不到「背面朝自己」的镜像，也就不需要 backface-visibility。 */
  transition-property: transform, opacity;
  transition-duration: 0.46s, 0.01s;
  transition-timing-function: ease-in-out, linear;
  transition-delay: 0s, 0.225s;
}
/* 牌背：主色绿底 + 白色镜子图标（图标大小 = 1.2em × 0.45×牌宽，与 web 同一套图标）。
   平时在 180° 且全透明；.face-down 时转到 0° 并显形。 */
.face.back {
  transform: rotateY(180deg);
  opacity: 0;
  background: #23804e;
  color: #fff;
}
.face-down .face.front {
  transform: rotateY(180deg);
  opacity: 0;
}
.face-down .face.back {
  transform: rotateY(0deg);
  opacity: 1;
}
.back-ico { pointer-events: none; }
.emoji { line-height: 1; }

/* ---------- 提示条（web 的 .hint-bar 胶囊） ---------- */
.hint-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 11rpx;                    /* web 的 gap: 6px */
  min-height: 65rpx;             /* web 的 min-height: 34px */
  padding: 0 27rpx;              /* web 的 padding: 0 14px */
  margin: 23rpx 0;               /* 与上下两个牌区的间距（web 的 .game-area gap: 12px） */
  box-sizing: border-box;
  border-radius: 999rpx;
  background: #fff;
  box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.12);
  font-size: 27rpx;              /* 14px */
  color: #5f6b7a;
}
.hint-num {
  font-size: 38rpx;              /* 20px */
  color: #23804e;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.hint-total { font-size: 25rpx; }  /* 13px */
.hint-bar.busy { color: #23804e; }
@keyframes spin-clock {
  to { transform: rotate(360deg); }
}
.hint-bar.busy .spin {
  animation: spin-clock 1s linear infinite;
}

/* ---------- 结算浮层（盖住整块游戏区，与 web 的 .result 同一份矩形） ---------- */
@keyframes result-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.result {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  z-index: 2;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 23rpx;                    /* web 的 gap: 12px */
  padding: 23rpx;
  border-radius: 27rpx;
  background: rgba(255, 255, 255, 0.8);   /* web 的 --mask-color */
  color: #12833f;                /* web 的 --win-color */
  font-size: 34rpx;              /* 18px */
  font-weight: 700;
  animation: result-in 0.28s ease;
}
.result .tip { font-size: 34rpx; }
.result .final-time {
  font-size: 53rpx;              /* 28px */
  font-variant-numeric: tabular-nums;
}
.result .new-best {
  font-size: 27rpx;              /* 14px */
  color: #23804e;
}

/* 真机在翻面收尾时偶尔会闪一下：两面都在 3D 里旋转，合成层在过渡结束重绘时可能把「背面」多画一帧。
   backface-visibility: hidden → 背朝观众的那一面永远不画（即使透明度切换晚一帧也看不到镜像）；
   will-change / translateZ(0) → 两面各自常驻合成层，过渡结束不再重新栅格化。 */
.face {
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
  -webkit-transform: translateZ(0);
  will-change: transform, opacity;
}
</style>
