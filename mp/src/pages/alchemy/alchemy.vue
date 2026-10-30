<template>
  <view class="screen">
    <!-- 全站背景（粒子连线 + 底部过山车，与 web 的 ParticleBackground 同款） -->
    <ParticleBackground />
    <view class="page">
      <!-- 统计条：关卡 / 剩余 / 得分 / 目标四格（label 的 emoji 在字典原文里，与 web 的 score-area.four 一致）
           + 本关进度条（得分 / 目标分，样式与连连看一致，贴在卡片底边） -->
      <view class="card score-area">
        <view class="stat">
          <text class="stat-label">{{ tt('level') }}</text>
          <text class="stat-value">{{ level }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('left') }}</text>
          <text class="stat-value">{{ cardsLeft }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('score') }}</text>
          <text class="stat-value">{{ score }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('target') }}</text>
          <text class="stat-value">{{ cfg.target }}</text>
        </view>
        <view class="progress"><view class="progress-bar" :style="{ width: progress + '%' }" /></view>
      </view>

      <!-- 操作区：左边手牌（当前一张 + 接下来两张），右边「新游戏」（web 的 opt-area，1.6 : 1.2 分格） -->
      <view class="card opt-area">
        <view class="opt-half hand">
          <!-- 手牌：跟手拖动的起点（小程序没有 Pointer Events，用 touchstart/touchmove/touchend） -->
          <view
            id="hand-slot"
            class="card-slot current"
            :class="{ ghost: dragging }"
            @touchstart="onHandTouchStart"
            @touchmove.stop.prevent="onHandTouchMove"
            @touchend="onHandTouchEnd"
            @touchcancel="onHandTouchCancel"
          >
            <!-- 与 web 一致：card-in 挂在槽位上（页面进来播一次），换牌不重播 -->
            <view
              v-if="hand"
              class="pcard"
              :class="{ red: isRedCard(hand) }"
              :style="handCard"
            >
              <template v-if="isJokerCard(hand)">
                <text class="pnum pnum-top jnum">JOKER</text>
                <view class="ptype"><view class="pico i-mdi-account-cowboy-hat" /></view>
              </template>
              <template v-else>
                <text class="pnum pnum-top">{{ pointOf(hand) }}</text>
                <text class="pnum pnum-bot">{{ pointOf(hand) }}</text>
                <view class="ptype"><text class="psuit">{{ suitOf(hand) }}</text></view>
              </template>
            </view>
            <text v-else class="slot-hint">{{ tt('next') }}</text>
          </view>
          <!-- 下两张：槽位仍是手牌大小，牌本体按 PREVIEW_SCALE 缩小（web 用 transform scale，这里直接缩尺寸） -->
          <view class="preview">
            <view v-for="(c, i) in preview" :key="c.id" class="card-slot next">
              <view class="pcard" :class="{ red: isRedCard(c) }" :style="previewCards[i]">
                <template v-if="isJokerCard(c)">
                  <text class="pnum pnum-top jnum">JOKER</text>
                  <view class="ptype"><view class="pico i-mdi-account-cowboy-hat" /></view>
                </template>
                <template v-else>
                  <text class="pnum pnum-top">{{ pointOf(c) }}</text>
                  <text class="pnum pnum-bot">{{ pointOf(c) }}</text>
                  <view class="ptype"><text class="psuit">{{ suitOf(c) }}</text></view>
                </template>
              </view>
            </view>
          </view>
        </view>
        <view class="opt-half">
          <button class="game-icon" hover-class="none" @click="confirming = true">{{ tt('start') }}</button>
        </view>
      </view>

      <!-- 游戏区：棋盘 + 中央得分浮字 + 结算层 -->
      <view class="game-area">
        <!-- 棋盘：常驻网格格位（描边 + 半透明底 + 点阵底纹）+ 牌绝对定位；
             格子与牌共用同一份 PAD/step，尺寸由内容反算（pad*2 + n*格 + gap*(n-1)） -->
        <view id="alchemy-board" class="board" :class="{ shaking, celebrating }" :style="boardStyle">
          <view
            v-for="idx in cells"
            :key="'cell-' + idx"
            class="cell"
            :class="{
              filled: !!board[idx - 1],
              placeable: !board[idx - 1] && canPlace,
              actable: !!board[idx - 1] && mode === 2 && canPlace,
              incoming: flyingTo === idx - 1,
              flash: flashCell === idx - 1,
            }"
            :style="cellStyle(idx - 1)"
            :hover-class="hoverClass(idx - 1)"
            @click="onCellClick(idx - 1)"
          >
            <view
              v-if="board[idx - 1]"
              class="pcard"
              :class="{ red: isRedCard(board[idx - 1]), dealt: dealing }"
              :style="cellCardStyle(idx - 1)"
            >
              <template v-if="isJokerCard(board[idx - 1])">
                <text class="pnum pnum-top jnum">JOKER</text>
                <view class="ptype"><view class="pico i-mdi-account-cowboy-hat" /></view>
              </template>
              <template v-else>
                <text class="pnum pnum-top">{{ pointOf(board[idx - 1]) }}</text>
                <text class="pnum pnum-bot">{{ pointOf(board[idx - 1]) }}</text>
                <view class="ptype"><text class="psuit">{{ suitOf(board[idx - 1]) }}</text></view>
              </template>
            </view>
            <!-- 刚消掉的牌：浮影层播完 blink-clear 就走（局面已经立刻清空，避免同一条线重复计分） -->
            <view v-else-if="clearing[idx - 1]" class="clearing">
              <view class="pcard" :class="{ red: isRedCard(clearing[idx - 1]) }" :style="cellCard">
                <template v-if="isJokerCard(clearing[idx - 1])">
                  <text class="pnum pnum-top jnum">JOKER</text>
                  <view class="ptype"><view class="pico i-mdi-account-cowboy-hat" /></view>
                </template>
                <template v-else>
                  <text class="pnum pnum-top">{{ pointOf(clearing[idx - 1]) }}</text>
                  <text class="pnum pnum-bot">{{ pointOf(clearing[idx - 1]) }}</text>
                  <view class="ptype"><text class="psuit">{{ suitOf(clearing[idx - 1]) }}</text></view>
                </template>
              </view>
            </view>
          </view>
        </view>

        <!-- 得分浮字：棋盘正中弹出「牌型名 + 本次得分」，按档位放大（web 的 .celebrate） -->
        <view
          v-for="cel in celebrationList"
          :key="cel.id"
          class="celebrate"
          :class="'tier-' + cel.tier"
        >
          <text class="celebrate-text">{{ cel.name }}</text>
          <text v-if="cel.groups > 1" class="celebrate-groups">{{ tt('comboGroups').replace('{n}', cel.groups) }}</text>
          <text v-if="cel.chain > 1" class="celebrate-chain">{{ tt('comboChain').replace('{n}', cel.chain) }}</text>
          <text class="celebrate-score">+{{ cel.gained }}</text>
        </view>

        <!-- 结算层：与棋盘同矩形（窄棋盘也要放得下两颗按钮，故给 min-width） -->
        <view v-if="phase !== 'play'" class="result" :class="phase === 'won' ? 'win' : 'lose'">
          <template v-if="phase === 'won'">
            <text class="result-main">🎉🎉 {{ tt('tipWin') }} 🎉🎉</text>
            <text class="result-note">{{ tt('levelDone').replace('{n}', level) }}</text>
            <view class="result-btns">
              <button class="game-icon replay-btn" hover-class="none" @click="retryLevel">{{ tt('replayLevel') }}</button>
              <button class="game-icon" hover-class="none" @click="nextLevel">{{ tt('nextLevel') }}</button>
            </view>
          </template>
          <template v-else>
            <text class="result-main">💤💤 {{ tt('tipLost') }} 💤💤</text>
            <text class="result-note">{{ tt('score') }} {{ score }}</text>
            <view class="result-btns">
              <button class="game-icon replay-btn" hover-class="none" @click="retryLevel">{{ tt('replayLevel') }}</button>
            </view>
          </template>
        </view>
      </view>
    </view>

    <!-- 跟手浮层：拖着的那张牌（fixed + 手指坐标，与 web 的 .drag-ghost 同款） -->
    <view v-if="dragging && dragPos && hand" class="drag-ghost" :style="{ left: dragPos.x + 'px', top: dragPos.y + 'px' }">
      <view class="pcard" :class="{ red: isRedCard(hand) }" :style="dragCard">
        <template v-if="isJokerCard(hand)">
          <text class="pnum pnum-top jnum">JOKER</text>
          <view class="ptype"><view class="pico i-mdi-account-cowboy-hat" /></view>
        </template>
        <template v-else>
          <text class="pnum pnum-top">{{ pointOf(hand) }}</text>
          <text class="pnum pnum-bot">{{ pointOf(hand) }}</text>
          <view class="ptype"><text class="psuit">{{ suitOf(hand) }}</text></view>
        </template>
      </view>
    </view>

    <!-- 点击放置的飞行浮牌：从手牌位置飞到目标格，落定后才结算 -->
    <view v-if="flying" class="fly-card" :style="flyStyle">
      <view class="pcard" :class="{ red: isRedCard(flying.card) }" :style="flying.sizes">
        <template v-if="isJokerCard(flying.card)">
          <text class="pnum pnum-top jnum">JOKER</text>
          <view class="ptype"><view class="pico i-mdi-account-cowboy-hat" /></view>
        </template>
        <template v-else>
          <text class="pnum pnum-top">{{ pointOf(flying.card) }}</text>
          <text class="pnum pnum-bot">{{ pointOf(flying.card) }}</text>
          <view class="ptype"><text class="psuit">{{ suitOf(flying.card) }}</text></view>
        </template>
      </view>
    </view>

    <!-- 胜利彩带（只在「真的过关」那一刻放；恢复存档的结算态不放） -->
    <Confetti v-if="justWon" />

    <!-- 右下角悬浮按钮：模式在左、帮助在最右（插槽顺序 = 左→右），按钮上无文字 -->
    <FloatingActions>
      <view class="fab" @click="toggleMode">
        <view v-if="mode === 1" class="fab-ico i-mdi-trophy-variant-outline" />
        <view v-else class="fab-ico i-mdi-cards-playing-outline" />
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
          <button class="confirm-cancel" hover-class="none" @click="confirming = false">{{ tt('cancel') }}</button>
          <button class="confirm-replay" hover-class="none" @click="retryLevel">{{ tt('confirmReplay') }}</button>
          <button class="confirm-ok" hover-class="none" @click="startNewGame">{{ tt('confirmOk') }}</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
// 扑克炼金术 · 微信小程序版（web 的 src/games/alchemy/AlchemyGame.vue 移植）
// 纯逻辑 / 关卡曲线 / 牌型判定：本目录 board.js（从 web **逐字节复制**，一行未改）。
// 与 web 的差异只在平台能力，已逐条写在交付说明里，主要有：
// - 存档 localStorage → @/core/storage（key 与 web 一字不差：__poker_alchemy__mode / level[_2] /
//   state[_2] / best_1|2）；音效 Web Audio → @/core/sfx；
// - 顶栏（TopHeader）→ 小程序原生导航栏 + 右下角悬浮按钮（模式在左、帮助在最右）；
// - 扑克牌面不引 web 的 CardItem：照 pages/poker/card.vue 的做法自绘（花色用文字 ♠♥♦♣ + CSS 上色，
//   Joker 用 UnoCSS 牛仔帽图标）；尺寸全部按牌宽反算，牌宽由格子宽反算；
// - 棋盘格位 / 牌 / 飞牌落点共用同一份 PAD + step（小程序不用 flex gap 排格子）；
// - 拖拽：web 的 Pointer Events → touchstart / touchmove.stop.prevent / touchend；
// - 飞牌：web 的 getBoundingClientRect + 固定浮牌 → selectorQuery 量矩形 + fixed 替身 + transition
//   （量不到就直接落位，绝不卡住）；
// - 得分 ≥300 时的 burstConfetti（短促烟花）小程序没有粒子层 → 降级为「震屏 + 外圈光圈」；
// - 恢复存档的铺牌波浪、消除闪烁、发牌 card-in、得分浮字 celebrate-pop 全部用 CSS 保留。
//
// 注意：本页**没有**全局锁 —— 飞牌期间只挡那一次落子（web 的 busy），消除动画期间棋盘照常可点。
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { onHide } from '@dcloudio/uni-app';

import Confetti from '@/components/Confetti.vue';
import FloatingActions from '@/components/FloatingActions.vue';
import HelpSheet from '@/components/HelpSheet.vue';
import { setNavTitle } from '@/core/i18n';
import { playElimination, playLose, playWin } from '@/core/sfx';
import { getJSON, getRaw, setRaw } from '@/core/storage';
import {
  SIZE, CELLS, SIZE3, CELLS3, PREVIEW,
  JOKER, BLACK, RED, JOKER_SUIT,
  createDealer, createZjhDeck, cardKey, resetUid, scoringLines, scoringLines3,
  zjhComboBonus, zjhChainBonus, levelConfig, zjhLevelConfig,
} from './board';
import { tt } from './i18n';
import ParticleBackground from '@/components/ParticleBackground.vue';

// 原生导航栏标题跟随语言（pages.json 里的标题是静态的）
setNavTitle(() => tt('gameTitle'));

// ---------- 存档 key（与 web 一字不差） ----------
const MODE_KEY = '__poker_alchemy__mode';
const LEVEL_KEY = '__poker_alchemy__level';
const LEVEL_KEY_2 = '__poker_alchemy__level_2';
const STATE_KEY = '__poker_alchemy__state';
const STATE_KEY_2 = '__poker_alchemy__state_2';
const BEST_KEY = '__poker_alchemy__best_';

const [PLAY, WON, OVER] = ['play', 'won', 'over'];
// 中央得分浮字的档位（按分数大小放大）：≥1000 最强、≥500 次之、其余基础档
const TIER_BY_SCORE = (s) => (s >= 1000 ? 3 : s >= 500 ? 2 : 1);
// 低于这个分数的得分只弹浮字，不震屏、不闪光
const FX_MIN = 300;
// 结算层只等浮字露一下脸（web 的 shared/resultDelay.js）
const RESULT_DELAY_MS = 500;
// 恢复存档时棋盘逐张铺开的波浪
const DEAL_MS = 340;
// 手牌固定宽度（web 的 HAND_W = 44px），下两张用同一张牌按比例缩小
const HAND_W = 84;
const PREVIEW_SCALE = [0.8, 0.6];

const storedMode = Math.floor(+(getRaw(MODE_KEY) || 1));
const mode = ref(storedMode === 2 ? 2 : 1);   // 1 炼金闯关（4×4）/ 2 炸金花闯关（3×3）
const size = computed(() => (mode.value === 2 ? SIZE3 : SIZE));
const cells = computed(() => size.value * size.value);

// ---------- 存档读取（切模式 / 恢复各一套 key；放在 mode 之后，避免 TDZ） ----------
const levelKey = () => (mode.value === 2 ? LEVEL_KEY_2 : LEVEL_KEY);
const stateKey = () => (mode.value === 2 ? STATE_KEY_2 : STATE_KEY);
const bestKey = () => `${BEST_KEY}${mode.value}`;

const level = ref(1);
const score = ref(0);
const chain = ref(0);          // 炸金花连击：连续每次消除 +1，没消掉归零
const bestLevel = ref(0);
const phase = ref(PLAY);
const board = ref(new Array(mode.value === 2 ? CELLS3 : CELLS).fill(null));
const pile = ref([]);          // 本关的整副牌（两种模式都是有限牌堆）
const cursor = ref(0);         // pile 里当前手牌的下标
const confirming = ref(false);
const shaking = ref(false);
const celebrating = ref(false);
// 大牌型的庆祝浮字（同消消乐：按档位放大、中央弹出、自动消失）
const celebration = ref(null);
// 刚被消除的牌：局面里立刻清空（否则动画期间再落子会把同一条线重复计分），
// 但保留一层浮影把「闪烁 → 消失」播完。web 用 Map，这里用「下标 → 牌」的普通对象
// （模板里只需 clearing[idx]，而且绕开小程序对 Map 响应式的兼容问题）
const clearing = ref({});
// 点击放置：牌从手牌位置飞到目标格；落点那一格先隐身，等飞到了再显形
const flying = ref(null);
const flyingTo = ref(-1);
const flashCell = ref(-1);     // 刚点过的格子（边框实线高亮，短暂反馈）
const dealing = ref(false);    // 恢复存档时棋盘逐张铺开（波浪；web 用 dealSeq 拼 :key 强制重建，
                               // 小程序里棋盘卡是恢复时才挂载的新节点，动画本来就会播）
const busy = ref(false);
const justWon = ref(false);

const cfg = computed(() => (mode.value === 1 ? levelConfig(level.value) : zjhLevelConfig(level.value)));
// 本关进度：得分占目标分的比例
const progress = computed(() => {
  const total = cfg.value.target;
  return total ? Math.min(100, Math.round((score.value / total) * 100)) : 0;
});
const cardsLeft = computed(() => Math.max(0, pile.value.length - cursor.value));
const hand = computed(() => pile.value[cursor.value] || null);
const preview = computed(() => pile.value.slice(cursor.value + 1, cursor.value + 1 + PREVIEW));
const canPlace = computed(() => phase.value === PLAY && !!hand.value);
const celebrationList = computed(() => (celebration.value ? [celebration.value] : []));

// ---------- 尺寸 ----------
// 全部由内容反算：视口 → 格子宽（web 的 computeMetrics 同口径）→ 牌宽（格子 − 6px）→ 牌内字号。
// 单位统一 rpx（750rpx = 屏宽），所以与 web 在 390 宽上同比例。
// 棋盘宽度基准：**屏宽的 75%**（750 × 0.75 = 562rpx）。用户要求「游戏区稍微小一点」；
// 注意别写 `width: 75%` —— 这个页面在 .page（690rpx）里，百分比会变成页面宽的 75% ✗（见 §零 第 10 条）
const CONTENT_W_RPX = 562;
const OPT_H_RPX = 150;                      // 操作区实际高度（手牌 126 + 上下各 12）
// 盘面以上 / 以下占掉的固定高度：页面 padding 27 + 统计条 168 + 31 + 操作区 + 31 + 底部留白 140
// 再加 16rpx 余量，保证「牌多一层也不用滚动」（否则拖拽时量到的是滚动前的矩形）
const PAGE_FIXED_RPX = 27 + 168 + 31 + OPT_H_RPX + 31 + 140 + 16;

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
const viewport = ref(readViewport());
const rpxPerPx = computed(() => 750 / (viewport.value.w || 393));

const metrics = ref({ cw: 160, ch: 240, pad: 15, gap: 15 });
const cw = computed(() => metrics.value.cw);
const ch = computed(() => metrics.value.ch);
// 棋盘里的牌比格位内缩 3px（四周各 3px），格位那条网格线才不会被牌盖掉（web 的 CARD_INSET = 6）
const CARD_INSET = computed(() => Math.max(2, Math.round(6 * rpxPerPx.value)));
const cellW = computed(() => cw.value - CARD_INSET.value);
const cellH = computed(() => ch.value - CARD_INSET.value);
// 棋盘尺寸由内容反算（§零 第 2 条）：pad*2 + 格数*格宽 + 缝*(格数-1)
const boardW = computed(() => metrics.value.pad * 2 + size.value * cw.value + metrics.value.gap * (size.value - 1));
const boardH = computed(() => metrics.value.pad * 2 + size.value * ch.value + metrics.value.gap * (size.value - 1));
const boardStyle = computed(() => ({ width: boardW.value + 'rpx', height: boardH.value + 'rpx' }));

// 格子与牌共用这一份 left/top 数学（不再一边 flex gap 一边绝对定位）
function cellStyle(idx) {
  const n = size.value;
  const { pad, gap } = metrics.value;
  return {
    width: cw.value + 'rpx',
    height: ch.value + 'rpx',
    left: pad + (idx % n) * (cw.value + gap) + 'rpx',
    top: pad + Math.floor(idx / n) * (ch.value + gap) + 'rpx',
  };
}

function computeMetrics() {
  const n = size.value;
  const k = rpxPerPx.value;
  const pad = Math.max(8, Math.round(8 * k));       // web 的 --pad: 8px
  const gap = Math.max(8, Math.round(8 * k));       // web 的 --gap: 8px（与 pad 同口径，按机型折算）
  const availW = CONTENT_W_RPX - pad * 2;           // 卡片宽 − 棋盘内边距
  const byW = (availW - gap * (n - 1)) / n;
  // 高度：视口扣掉盘面以上 / 以下的固定高度 + 棋盘内边距 + 行缝（web 的 -262 同口径）
  const vhRpx = ((viewport.value.h || 780) - (viewport.value.head || 0)) * k;
  const budget = vhRpx - PAGE_FIXED_RPX - pad * 2 - gap * (n - 1);
  const byH = budget / n / 1.5;
  // 3×3 牌少、空间大，可以比 4×4 的牌更大（web 的上限 104 / 84 px）
  const cap = (n === 3 ? 104 : 84) * k;
  const w = Math.max(30 * k, Math.min(byW, byH, cap));
  metrics.value = { cw: Math.round(w), ch: Math.round(w * 1.5), pad, gap };
}

// 一张牌的尺寸与字号：全部按牌的宽度反算（web 的 cardVars：圆角 / 角标 / 中央花色都取宽度比例）。
// w / h 是 web cardVars(w, h) 的那两个值（棋盘里传「格子 − CARD_INSET」，手牌传 44×66）。
// 字号走 CSS 变量下发（--pos / --num / --suit / --icon / --joker），模板里就不必给每个 text 写
// inline style —— 也避开了小程序对「样式数组」的不稳定支持。
function cardStyle(w, h, unit = 'rpx', scale = 1) {
  const W = w * scale;
  const H = (h == null ? Math.round(w * 1.5) : h) * scale;
  const px = (v) => `${Math.round(v * 100) / 100}${unit}`;
  return {
    width: px(W),
    height: px(H),
    borderRadius: px(Math.max(2, Math.round(W * 0.07))),
    '--pos': px(Math.max(1, Math.round(W * 0.07))),
    '--num': px(Math.max(7, Math.round(W * 0.26))),
    // 花色是文字（web 用 mdi 图标，画出来是 1.2em，文字字形只占 em 框的 ~0.75，所以再放一档）
    '--suit': px(Math.max(10, Math.round(W * 0.9))),
    // UnoCSS 图标自己会撑到 1.2em，这里给的就是 web 的 --icon-size（W × 0.56）
    '--icon': px(Math.max(10, Math.round(W * 0.56))),
    '--joker': px(Math.max(10, Math.min(24, Math.round(W * 0.18)))),
  };
}

const HAND_H = Math.round(HAND_W * 1.5);   // web 的 handVars：高度等比 2:3
const handCard = computed(() => cardStyle(HAND_W, HAND_H));
const previewCards = computed(() => PREVIEW_SCALE.map((s) => cardStyle(HAND_W, HAND_H, 'rpx', s)));
const cellCard = computed(() => cardStyle(cellW.value, cellH.value));
// 跟手浮层是 fixed + 手指的 px 坐标，所以这张牌的尺寸也用 px
const dragCard = computed(() => cardStyle(HAND_W / rpxPerPx.value, HAND_H / rpxPerPx.value, 'px'));

function cellCardStyle(idx) {
  const s = cellCard.value;
  return dealing.value ? { ...s, animationDelay: dealDelay(idx) + 'ms' } : s;
}

// 棋盘逐张铺开的波浪：延迟按「行 + 列」递增，波前从左上角扫到右下角
const dealDelay = (cell) => (Math.floor(cell / size.value) + (cell % size.value)) * 60;

// ---------- 牌面渲染辅助（花色用文字 + CSS 上色；Joker 用 UnoCSS 图标） ----------
const RANK_TEXT = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_TEXT = { spade: '♠', club: '♣', heart: '♥', diamond: '♦' };
const isJokerCard = (c) => !!c && c.kind === JOKER;
const pointOf = (c) => (c && c.kind === 'card' ? RANK_TEXT[c.rank - 1] || '' : '');
const suitOf = (c) => (c ? SUIT_TEXT[isJokerCard(c) ? JOKER_SUIT[c.color] : c.suit] || '' : '');
const isRedCard = (c) => {
  if (!c) return false;
  if (isJokerCard(c)) return c.color === RED;
  return c.suit === 'heart' || c.suit === 'diamond';
};

// ---------- 牌堆 ----------
const pack = (c) => (c.kind === 'card'
  ? { k: 'c', r: c.rank, s: c.suit }
  : { k: c.color === BLACK ? 'jb' : 'jr' });
const unpack = (o) => (o.k === 'c'
  ? { id: ++uidCounter, kind: 'card', rank: o.r, suit: o.s }
  : { id: ++uidCounter, kind: JOKER, color: o.k === 'jb' ? BLACK : RED });
let uidCounter = 0;
const dealer = createDealer();

// 当前「已经在场」的牌（棋盘 + 整个牌堆）：发牌器据此保证不会发出重复的牌
function usedKeys() {
  const out = new Set();
  for (const c of board.value) { const k = cardKey(c); if (k) out.add(k); }
  for (const c of pile.value) { const k = cardKey(c); if (k) out.add(k); }
  return out;
}
const freshCard = (used) => dealer.draw(used || usedKeys());

// ---------- 关卡 / 开局 ----------
// 旧版本的模式 2 是「无尽」：best_2 存的是最高分、state_2 是 16 格局面。新版本把它换成
// 炸金花关卡模式，用 `level_2` 是否存在来区分新旧存档；没有 level_2 就把旧的最高分 / 局面丢掉。
const removeKey = (k) => setRaw(k, '');

function migrateEndlessStorage() {
  try {
    if (!getRaw(LEVEL_KEY_2)) {
      removeKey(`${BEST_KEY}2`);
      removeKey(STATE_KEY_2);
    }
  } catch { /* 隐私模式忽略 */ }
}

function startLevel(lv) {
  clearTimeout(endTimer);   // 上一局延后待出的结算层作废
  level.value = Math.max(1, lv);
  score.value = 0;
  chain.value = 0;
  phase.value = PLAY;
  board.value = new Array(cells.value).fill(null);
  clearing.value = {};
  cursor.value = 0;
  shaking.value = false;
  celebrating.value = false;
  celebration.value = null;
  resetUid();
  uidCounter = 0;
  const { deck } = cfg.value;
  if (mode.value === 2) {
    // 炸金花：一副标准 52 张（无 Joker），按本关可用牌数截取；牌数在 board.js 里封顶 52
    pile.value = createZjhDeck().slice(0, Math.min(deck, 52));
  } else {
    // 炼金：逐张抽、逐张把 key 记进 used —— 不能一次性 Array.from，那样每张看到的都是空的 used 集合
    const built = [];
    const used = new Set();
    for (let i = 0; i < deck; i++) {
      const c = freshCard(used);
      built.push(c);
      used.add(cardKey(c));
    }
    pile.value = built;
  }
  save();
}

function startNewGame() {
  confirming.value = false;
  // 只清当前模式的关卡 / 最高关卡，另一种模式的记录不动
  removeKey(bestKey());
  removeKey(levelKey());
  bestLevel.value = 0;
  startLevel(1);
}

function retryLevel() {
  confirming.value = false;
  startLevel(level.value);
}

function nextLevel() {
  startLevel(level.value + 1);
}

function toggleMode() {
  save();
  mode.value = mode.value === 1 ? 2 : 1;
  setRaw(MODE_KEY, String(mode.value));
  if (mode.value === 2) migrateEndlessStorage();
  computeMetrics();   // 4×4 / 3×3 的格宽上限与行列数都变了，必须重算
  level.value = Math.max(1, +(getRaw(levelKey()) || 1));
  bestLevel.value = +(getRaw(bestKey()) || 0);
  if (!restore()) startLevel(level.value);
  else checkEnd(true);
  nextTick(measureRects);
}

// ---------- 存档 ----------
function save() {
  setRaw(stateKey(), JSON.stringify({
    mode: mode.value,
    level: level.value,
    score: score.value,
    chain: chain.value,
    phase: phase.value,
    board: board.value.map((c) => (c ? pack(c) : null)),
    pile: pile.value.map(pack),
    cursor: cursor.value,
  }));
  setRaw(levelKey(), String(level.value));
  const stored = +(getRaw(bestKey()) || 0);
  bestLevel.value = Math.max(bestLevel.value, stored, level.value);
  if (level.value > stored) setRaw(bestKey(), String(level.value));
}

function restore() {
  try {
    const saved = getJSON(stateKey());
    if (!saved || !Array.isArray(saved.board) || saved.board.length !== cells.value) return false;
    if (saved.mode !== mode.value) return false;
    if (![PLAY, WON, OVER].includes(saved.phase)) return false;
    if (!Array.isArray(saved.pile) || !saved.pile.length) return false;
    uidCounter = 0;
    board.value = saved.board.map((c) => (c ? unpack(c) : null));
    pile.value = saved.pile.map(unpack);
    cursor.value = Math.min(Math.max(0, +saved.cursor || 0), Math.max(0, pile.value.length - 1));
    level.value = Math.max(1, +saved.level || 1);
    score.value = Math.max(0, +saved.score || 0);
    chain.value = Math.max(0, +saved.chain || 0);
    phase.value = saved.phase;
    // 恢复的局面也按「从左上到右下」的波浪逐张出现
    startDeal();
    return true;
  } catch {
    return false;
  }
}

// ---------- 放置 / 转换 ----------
// 落子：只改局面、手牌前进，不做结算（结算交给 settle）
function commitPlacement(idx, card) {
  board.value = board.value.map((c, i) => (i === idx ? { ...card } : c));
  advanceHand();
}

function advanceHand() {
  cursor.value += 1;
}

// 点击空格：牌先落进目标格（那一格用 .incoming 隐身），再让一张浮牌从手牌位置飞过去，
// 落地后才结算 —— 于是「点空白」也能看到牌从候选位置移到目标位置
function placeByClick(idx) {
  const card = hand.value;
  if (!card) return;
  if (mode.value === 1 && board.value[idx]) return;
  busy.value = true;
  commitPlacement(idx, card);
  flyingTo.value = idx;
  flyTo(card, idx, () => {
    flyingTo.value = -1;
    busy.value = false;
    settle();
  });
}

// 拖拽落子：手指已经把牌带过去了，不必再飞，直接结算
function placeByDrag(idx) {
  const card = hand.value;
  if (!card) return;
  if (mode.value === 1 && board.value[idx]) return;
  commitPlacement(idx, card);
  settle();
}

// ---------- 尺寸测量（小程序没有 DOM，用 selectorQuery；量不到就退化成「直接落位」） ----------
// 手牌槽与棋盘的位置在布局里是固定的（.opt-area 与 .board 都定宽定高），所以一进页面就量好、
// 点格子时同步算落点 —— 与 web 一样「同一拍就出浮牌」，不会先让牌出现在格子里再消失。
const boardRect = ref(null);
const handRect = ref(null);
const queryRect = (sel) => new Promise((resolve) => {
  uni.createSelectorQuery()
    .select(sel)
    .boundingClientRect((r) => resolve(r && r.width ? r : null))
    .exec();
});

function measureBoard() {
  queryRect('#alchemy-board').then((r) => { if (r) boardRect.value = r; });
}
function measureRects() {
  measureBoard();
  queryRect('#hand-slot').then((r) => { if (r) handRect.value = r; });
}

// 浮牌飞行：left/top 固定在手牌中心，靠 transform 平移到目标格并缩放到格子大小。
// 目标格中心用与 cellStyle 完全相同的 PAD + step 算（§零 第 3 条：不许两套坐标数学）。
function flyTo(card, idx, done) {
  const from = handRect.value;
  const rect = boardRect.value;
  if (!from || !rect || !from.width) { done(); return; }
  const k = rpxPerPx.value;
  const n = size.value;
  const padPx = metrics.value.pad / k;
  const stepX = (cw.value + metrics.value.gap) / k;
  const stepY = (ch.value + metrics.value.gap) / k;
  const cwPx = cw.value / k;
  const x = from.left + from.width / 2;
  const y = from.top + from.height / 2;
  const tx = rect.left + padPx + (idx % n) * stepX + cwPx / 2;
  const ty = rect.top + padPx + Math.floor(idx / n) * stepY + ch.value / k / 2;
  flying.value = {
    card,
    x,
    y,
    dx: tx - x,
    dy: ty - y,
    w: from.width,
    scale: (cwPx - CARD_INSET.value / k) / from.width,
    go: false,
    sizes: cardStyle(from.width, from.width * 1.5, 'px'),
  };
  // 先让它停手牌原位，下一拍再改 transform 才会有过渡（同一拍改没有动画）
  nextTick(() => setTimeout(() => { if (flying.value) flying.value.go = true; }, 16));
  clearTimeout(flyTimer);
  flyTimer = setTimeout(() => {
    flying.value = null;
    done();
  }, 210);
}

const flyStyle = computed(() => {
  const f = flying.value;
  if (!f) return {};
  return {
    left: `${f.x}px`,
    top: `${f.y}px`,
    transform: f.go
      ? `translate(-50%, -50%) translate(${f.dx}px, ${f.dy}px) scale(${f.scale})`
      : 'translate(-50%, -50%)',
  };
});

function onCellClick(idx) {
  if (phase.value !== PLAY || busy.value || !hand.value) return;
  // 炼金模式只能放空格；炸金花模式点已有牌的格子 = 用手上这张替换掉它
  if (mode.value === 1 && board.value[idx]) return;
  // 点击立刻给这个格子一个实线高亮反馈（450ms 后自动消失）
  flashCell.value = idx;
  clearTimeout(cellFlashTimer);
  cellFlashTimer = setTimeout(() => { flashCell.value = -1; }, 450);
  placeByClick(idx);
}

// ---------- 拖拽（小程序没有 Pointer Events） ----------
const dragging = ref(false);
const dragPos = ref(null);

function onHandTouchStart(e) {
  if (phase.value !== PLAY || !hand.value) return;
  const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
  if (!t) return;
  dragging.value = true;
  dragPos.value = { x: t.clientX, y: t.clientY };
  // 拖拽要按屏幕坐标反推格子：touchstart 时顺手刷新一次棋盘矩形
  measureBoard();
}

function onHandTouchMove(e) {
  if (!dragging.value) return;
  const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
  if (!t) return;
  dragPos.value = { x: t.clientX, y: t.clientY };
}

function onHandTouchEnd(e) {
  if (!dragging.value) return;
  dragging.value = false;
  const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
  const pos = dragPos.value;
  dragPos.value = null;
  const x = t ? t.clientX : pos ? pos.x : -1;
  const y = t ? t.clientY : pos ? pos.y : -1;
  const idx = cellAt(x, y);
  if (idx >= 0) placeByDrag(idx);
}

function onHandTouchCancel() {
  dragging.value = false;
  dragPos.value = null;
}

// 屏幕坐标 → 格子下标（与 cellStyle 共用 PAD / gap / cw / ch）
function cellAt(x, y) {
  const r = boardRect.value;
  if (!r || x < 0 || y < 0) return -1;
  const k = rpxPerPx.value;
  const pad = metrics.value.pad / k;
  const stepX = (cw.value + metrics.value.gap) / k;
  const stepY = (ch.value + metrics.value.gap) / k;
  const c = Math.floor((x - r.left - pad) / stepX);
  const row = Math.floor((y - r.top - pad) / stepY);
  const n = size.value;
  if (row < 0 || row >= n || c < 0 || c >= n) return -1;
  return row * n + c;
}

// 炸金花的已有牌格在按下时给一点实线主色反馈（web 是 hover；小程序没有 hover）
function hoverClass(idx) {
  return mode.value === 2 && phase.value === PLAY && !!hand.value && !!board.value[idx] ? 'cell-press' : 'none';
}

// 一次操作（放牌 / 转换）之后的统一收尾：结算 → 判结束 → 落档
function settle() {
  const zjh = mode.value === 2;
  const hits = zjh ? scoringLines3(board.value) : scoringLines(board.value);
  if (hits.length) {
    let taken;
    let best;
    if (zjh) {
      // 炸金花：一次落子凑成的**所有**线全部计分（麻将英雄同款），再叠加多消 / 连击奖励
      taken = hits;
      best = taken.reduce((a, b) => (b.combo.score > a.combo.score ? b : a), taken[0]);
      chain.value += 1;
    } else {
      // 炼金：一次落子可能同时凑成横 / 竖 / 斜好几条线：只按**分数最高**的那条算；
      // 最高分并列（两条或全部一样）时，把并列的这些一起消除并累加分数
      const top = Math.max(...hits.map((h) => h.combo.score));
      taken = hits.filter((h) => h.combo.score === top);
      best = taken[0];
    }
    let gained = taken.reduce((sum, h) => sum + h.combo.score, 0);
    if (zjh) gained += zjhComboBonus(taken.length) + zjhChainBonus(chain.value);
    score.value += gained;
    playElimination();   // 落子凑成一组
    const cleared = new Set(taken.flatMap((h) => h.indices));
    // 局面立刻清空（不留重复计分的窗口），被消掉的牌进浮影层播动画
    const gone = {};
    cleared.forEach((i) => { if (board.value[i]) gone[i] = board.value[i]; });
    board.value = board.value.map((c, i) => (cleared.has(i) ? null : c));
    clearing.value = gone;
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => { clearing.value = {}; save(); }, 520);
    announceCelebration(best.combo.id, gained, zjh ? { groups: taken.length, chain: chain.value } : null);
  } else if (zjh) {
    chain.value = 0;   // 这一手没消掉：连击断掉
  }
  // 结算层要等中央得分浮字消失之后再出现（没有浮字就立即结算）；
  // 只等 0.5s（web 的 RESULT_DELAY_MS），不等浮字整条生命周期走完
  const wait = celebration.value ? RESULT_DELAY_MS : 0;
  clearTimeout(endTimer);
  if (wait) endTimer = setTimeout(() => { checkEnd(); save(); }, wait);
  else { checkEnd(); save(); }
}

// ---------- 得分庆祝（照消消乐那一套）----------
// 每一次得分都在棋盘中央弹出「牌型名 + 本次得分」的浮字（按分数分档放大）；
// 得分 ≥ 300 时再加：棋盘震一下 + 外圈闪一圈光；低于 300 只有浮字。
function shakeBoard() {
  // 小程序没有强制重排的手段：先摘类名、下一拍再挂上，保证连续触发也能重播同一条动画
  clearTimeout(shakeTimer);
  clearTimeout(shakeRestart);
  shaking.value = false;
  shakeRestart = setTimeout(() => {
    shaking.value = true;
    shakeTimer = setTimeout(() => { shaking.value = false; }, 340);
  }, 16);
}

function celebrateFlash() {
  clearTimeout(flashTimer);
  clearTimeout(flashRestart);
  celebrating.value = false;
  flashRestart = setTimeout(() => {
    celebrating.value = true;
    flashTimer = setTimeout(() => { celebrating.value = false; }, 900);
  }, 16);
}

const celebrateLife = (tier) => 1100 + tier * 220;

function announceCelebration(id, gained, extra = null) {
  const tier = TIER_BY_SCORE(gained);
  celebration.value = {
    id: ++celebrationId,
    tier,
    gained,
    groups: (extra && extra.groups) || 0,
    chain: (extra && extra.chain) || 0,
    name: tt(`combo${id[0].toUpperCase()}${id.slice(1)}`),
  };
  clearTimeout(celebrateTimer);
  celebrateTimer = setTimeout(() => { celebration.value = null; }, celebrateLife(tier));
  // 低于 300 分：只有浮字，不震屏、不闪光
  if (gained < FX_MIN) return;
  shakeBoard();
  celebrateFlash();
  // web 这里还有 burstConfetti(tier)（短促烟花）：小程序没有粒子层，降级为「震屏 + 光圈」
}

// silent = true 时只补结算层、不播撒花（退出再进入时不该再放一次烟花）。
// 只有还在 PLAY 才结算：结算层是延后出现的，重复触发不能重复撒花
function checkEnd(silent = false) {
  if (phase.value !== PLAY) return;
  if (score.value >= cfg.value.target) {
    phase.value = WON;
    if (!silent) {
      justWon.value = true;
      playWin();
      clearTimeout(wonTimer);
      wonTimer = setTimeout(() => { justWon.value = false; }, 4000);
    }
    if (level.value > bestLevel.value) bestLevel.value = level.value;
    return;
  }
  // 两种模式都是关卡模式：牌用完了分数还不够就失败（棋盘满可以靠替换继续玩）
  if (cursor.value >= pile.value.length) { phase.value = OVER; playLose(); }
}

// ---------- 计时器 ----------
let shakeTimer = 0;
let shakeRestart = 0;
let clearTimer = 0;
let flyTimer = 0;
let celebrateTimer = 0;
let flashTimer = 0;
let flashRestart = 0;
let endTimer = 0;
let cellFlashTimer = 0;
let dealTimer = 0;
let wonTimer = 0;
let celebrationId = 0;

function startDeal() {
  dealing.value = true;
  clearTimeout(dealTimer);
  dealTimer = setTimeout(() => { dealing.value = false; }, (size.value - 1) * 2 * 60 + DEAL_MS);
}

// ---------- 生命周期 ----------
function onResize() {
  viewport.value = readViewport();
  computeMetrics();
  nextTick(measureRects);
}

onMounted(() => {
  const saved = +(getRaw(MODE_KEY) || 1);
  mode.value = saved === 2 ? 2 : 1;
  if (mode.value === 2) migrateEndlessStorage();
  computeMetrics();
  level.value = Math.max(1, +(getRaw(levelKey()) || 1));
  bestLevel.value = +(getRaw(bestKey()) || 0);
  if (!restore()) startLevel(level.value);
  else {
    // 恢复存档要补判一次：存档可能正好停在「已达标 / 牌已用完」的一步上；
    // 传 true：重进不重播撒花
    checkEnd(true);
  }
  nextTick(measureRects);
  try { uni.onWindowResize(onResize); } catch { /* 平台不支持就算了 */ }
});

onHide(() => {
  // 切后台先落档（小程序页面不会马上卸载）
  save();
});

onUnmounted(() => {
  try { uni.offWindowResize(onResize); } catch { /* 忽略 */ }
  clearTimeout(shakeTimer);
  clearTimeout(shakeRestart);
  clearTimeout(clearTimer);
  clearTimeout(flyTimer);
  clearTimeout(celebrateTimer);
  clearTimeout(flashTimer);
  clearTimeout(flashRestart);
  clearTimeout(endTimer);
  clearTimeout(cellFlashTimer);
  clearTimeout(dealTimer);
  clearTimeout(wonTimer);
  save();
});

// ---------- 帮助 ----------
const helpOpen = ref(false);
// 帮助文案：导语 + 各条（web 的 helpMsg + help1..N 原文，用空行分段，HelpSheet 会拆成段落）
const helpText = computed(() => {
  const keys = ['helpMsg'];
  for (let i = 1; i <= 10; i += 1) keys.push(`help${i}`);
  return keys
    .map((k) => ({ k, v: tt(k) }))
    .filter(({ k, v }) => v && v !== k)
    .map(({ v }) => v)
    .join('\n\n');
});

function showHelp() {
  helpOpen.value = true;
}
</script>

<style lang="scss" scoped>
/* ---------- keyframes（web 的逐条搬过来，时长不变；px → rpx 按 750/393 折算） ---------- */
/* 大牌型消除时的棋盘震动（与消消乐同一个关键帧） */
@keyframes board-shake {
  0%, 100% { transform: translate(0, 0); }
  15% { transform: translate(-10rpx, 4rpx); }
  30% { transform: translate(8rpx, -6rpx); }
  45% { transform: translate(-6rpx, -4rpx); }
  60% { transform: translate(6rpx, 4rpx); }
}
/* 棋盘外圈的一圈闪光（与震动是两套独立样式：一个动 box-shadow、一个动 transform） */
@keyframes board-celebrate {
  0% { box-shadow: 0 0 0 0 transparent; }
  25% { box-shadow: 0 0 0 8rpx rgba(35, 128, 78, 0.5), 0 0 50rpx 15rpx rgba(35, 128, 78, 0.5); }
  100% { box-shadow: 0 0 0 0 transparent; }
}
/* 庆祝浮字：弹出 → 顿一下 → 上飘淡出 */
@keyframes celebrate-pop {
  0% { opacity: 0; transform: translate(-50%, -30%) scale(0.4) rotate(-6deg); }
  28% { opacity: 1; transform: translate(-50%, -50%) scale(1.16) rotate(3deg); }
  44% { opacity: 1; transform: translate(-50%, -50%) scale(1) rotate(0deg); }
  78% { opacity: 1; transform: translate(-50%, -62%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -100%) scale(0.92); }
}
/* 恢复存档：棋盘逐张铺开（从左上方滑入 + 放大） */
@keyframes card-wave {
  from { opacity: 0; transform: translate(-34rpx, -34rpx) scale(0.45); }
  to { opacity: 1; transform: translate(0, 0) scale(1); }
}
/* 手牌到手：弹一下（与 web 的 .current 动画一致） */
@keyframes card-in {
  from { transform: scale(0.24); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
/* 消除：先闪两下（每下暗下去一半、亮起来一次）再整体消失 —— 「闪烁然后消除」 */
@keyframes blink-clear {
  0% { opacity: 1; filter: none; transform: scale(1); }
  16% { opacity: 0.12; }
  32% { opacity: 1; }
  50% { opacity: 0.12; }
  66% { opacity: 1; filter: brightness(1.9); }
  100% { opacity: 0; filter: brightness(2.6); transform: scale(0.72); }
}

/* 一页只允许一处 min-height: 100vh（就在 .screen 上） */
.screen {
  min-height: 100vh;
  background: transparent;  /* 背景交给 ParticleBackground（canvas 自己铺底色） */
}
.page {
  padding: 27rpx 24rpx 140rpx;   /* 底部 140rpx 让开右下角悬浮按钮 */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 31rpx;                   /* = web 的 --row-gap: 16px */
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
  gap: 4rpx;
}
.stat-label {
  font-size: 23rpx;             /* 12px */
  color: #5f6b7a;
  line-height: 1.2;
  white-space: nowrap;
}
/* 四格并排：每格只有 ~160rpx，数字缩到 18px（web 的 .score-area.four .stat-value）才放得下四位数 */
.stat-value {
  font-size: 34rpx;
  font-weight: bold;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.divider {
  width: 2rpx;
  height: 46rpx;
  align-self: center;
  background: #e1e1e1;
  opacity: 0.6;
}
/* 本关进度条：贴在统计卡底边（web 的 .progress / .progress-bar，与连连看同一套） */
.progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 6rpx;
  background: #eef0f3;
}
.progress-bar {
  height: 100%;
  background: #23804e;
  transition: width 0.3s ease;
}

/* ---------- 操作区：本作偏离共享约定 —— 左边是 2:3 的扑克牌，比行高更高，
   写死行高会让手牌上下溢出，所以高度由内容驱动（web 的 height: auto; min-height: --row-height） ---------- */
.opt-area {
  width: 690rpx;
  height: auto;
  min-height: 120rpx;
  display: flex;
  align-items: center;
  padding: 12rpx 19rpx;
}
.opt-half {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}
.opt-half:first-child { flex: 1.6; }
.opt-half:last-child { flex: 1.2; }
.hand { gap: 15rpx; }          /* web 的 8px */
/* 候选牌（手牌 + 下两张）只占位，不画外部容器：没有底色、没有描边，牌直接立在面板上 */
.card-slot {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}
.current {
  width: 84rpx;
  height: 126rpx;
  /* 手牌到手：弹一下（与 web 的 .current 动画一致；动画挂在槽位上，换牌不重播） */
  animation: card-in 0.26s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.current.ghost { opacity: 0.35; }
.preview {
  display: flex;
  align-items: center;
  gap: 4rpx;                   /* 牌本体缩小了，视觉间距靠这个小 gap 收（web 的 2px） */
  height: 126rpx;
}
.next {
  width: 84rpx;
  height: 126rpx;
  opacity: 0.55;
}
.slot-hint {
  font-size: 23rpx;
  color: #5f6b7a;
}
/* 当前这张：web 是 outline: 2px + offset 1px；小程序 outline 不稳，用同宽的双层 box-shadow 环 */
.current .pcard {
  box-shadow: 0 0 0 2rpx #fff, 0 0 0 6rpx #23804e;
}

/* 主按钮：web 的 .game-icon（8px 12px / 14px 粗体 / 8px 圆角） */
.game-icon {
  margin: 0;
  padding: 0 31rpx;
  height: 64rpx;
  line-height: 64rpx;
  border: 0 none;
  border-radius: 15rpx;
  background: #23804e;
  color: #fff;
  font-size: 27rpx;
  font-weight: bold;
  white-space: nowrap;
}

/* ---------- 牌（web 的 CardItem mini：白底 + 细边 + 角标点数 + 中央花色；这里全部自绘） ---------- */
.pcard {
  position: relative;
  flex: 0 0 auto;
  box-sizing: border-box;
  overflow: hidden;             /* 裁的是牌自己的圆角 */
  background: #fafafa;
  color: #111;
  border: 2rpx solid #dcdfe6;
  line-height: 1;
}
.pcard.red { color: #e00; }
/* 恢复存档时棋盘逐张铺开（延迟由 cellCardStyle 按行列注入） */
.pcard.dealt { animation: card-wave 0.34s cubic-bezier(0.34, 1.4, 0.64, 1) both; }
.pnum {
  position: absolute;
  font-size: var(--num);
  font-weight: bold;
  line-height: 1;
}
.pnum-top { top: var(--pos); left: var(--pos); }
.pnum-bot { bottom: var(--pos); right: var(--pos); transform: rotate(180deg); }
/* Joker 的角标是竖排的 JOKER（web 的 .card-joker .card-num） */
.jnum {
  width: 1em;
  font-size: var(--joker);
  word-break: break-all;
  line-height: 0.85;
}
.ptype {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  transform: translate(-50%, -50%);
}
.psuit {
  font-size: var(--suit);
  font-weight: bold;
  line-height: 1;
}
.pico { font-size: var(--icon); line-height: 1; }

/* ---------- 游戏区（棋盘 + 浮字 + 结算层） ---------- */
.game-area {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}
/* 棋盘：点阵底纹（web 的全局 .dot-board，mp 没有全局那份 → 本地写全）
   + 常驻网格格位；宽高由 boardW / boardH 反算，居中 */
.board {
  position: relative;
  box-sizing: border-box;
  margin: 0 auto;
  border-radius: 27rpx;
  background-color: #bbada0;
  background-image: radial-gradient(circle, rgba(255, 255, 255, 0.18) 2rpx, transparent 2rpx);
  background-size: 19rpx 19rpx;
  background-position: 10rpx 10rpx;
}
/* 与 web 的书写顺序一致：两条都挂 animation，后写的 celebrating 生效（web 的实际观感） */
.board.shaking { animation: board-shake 0.34s ease; }
.board.celebrating { animation: board-celebrate 0.9s ease-out; }
/* 格位：绝对定位 + 与牌共用同一份 PAD / step（不用 flex gap 排格子） */
.cell {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 15rpx;
  border: 2rpx solid #c9d0da;
  background-color: rgba(255, 255, 255, 0.08);
}
/* 手上有牌可放时，空格子换成主色虚线，明确「这里能落子」 */
.cell.placeable {
  border-color: #23804e;
  border-style: dashed;
}
/* 炸金花：已有牌的格子可以点（web 是 hover 实线 + 光环；小程序用 hover-class 给按下反馈） */
.cell-press {
  border-style: solid;
  border-color: #23804e;
  box-shadow: 0 0 0 4rpx #23804e;
}
/* 点击放置：目标格的牌先隐身，等外面的浮牌飞到了再显形 */
.cell.incoming .pcard { opacity: 0; }
/* 刚点过的格子：实线主色 + 光环（450ms 后自动消失） */
.cell.flash {
  border-style: solid;
  border-color: #23804e;
  box-shadow: 0 0 0 4rpx #23804e;
}

/* 刚消掉的牌：浮影层播完 blink-clear 就走 */
.clearing {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  animation: blink-clear 0.52s ease-in-out forwards;
}

/* 大牌型的庆祝浮字：棋盘正中弹出，不挡操作 */
.celebrate {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
  padding: 19rpx 34rpx;
  box-sizing: border-box;
  border-radius: 15rpx;
  background: #23804e;
  color: #fff;
  font-weight: bold;
  text-align: center;
  max-width: calc(100% - 8rpx);
  pointer-events: none;
  box-shadow: 0 12rpx 34rpx rgba(35, 128, 78, 0.5);
  animation: celebrate-pop 0.95s cubic-bezier(0.22, 1.2, 0.36, 1) forwards;
}
.celebrate-text {
  font-size: 34rpx;
  line-height: 1.2;
}
.celebrate-groups,
.celebrate-chain {
  font-size: 25rpx;
  line-height: 1.2;
  opacity: 0.95;
}
.celebrate-score {
  font-size: 27rpx;
  line-height: 1.2;
  margin-top: 6rpx;
  opacity: 0.92;
  font-variant-numeric: tabular-nums;
}
/* 三条是 tier-2、四条 / 同花顺 / 豹子是 tier-3，越高浮字越大、光圈越亮 */
.celebrate.tier-2 {
  box-shadow: 0 12rpx 38rpx rgba(35, 128, 78, 0.5), 0 0 0 6rpx rgba(35, 128, 78, 0.5);
}
.celebrate.tier-2 .celebrate-text { font-size: 40rpx; }
.celebrate.tier-3 {
  padding: 23rpx 42rpx;
  box-shadow: 0 15rpx 50rpx rgba(35, 128, 78, 0.5), 0 0 0 8rpx rgba(35, 128, 78, 0.5);
}
.celebrate.tier-3 .celebrate-text { font-size: 46rpx; }

/* 结算层：与棋盘同矩形；棋盘可能比 web 窄（矮屏被高度约束），给 min-width 保证两颗按钮不换行 */
.result {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 100%;
  min-width: 480rpx;
  max-width: 702rpx;
  z-index: 5;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 23rpx;                  /* web 的 12px */
  padding: 23rpx;
  border-radius: 27rpx;
  background: rgba(255, 255, 255, 0.8);
  color: #12833f;
  font-weight: bold;
  font-size: 34rpx;            /* web 的 18px */
  transform: translateX(-50%);
}
.result.lose { color: #b11; }
.result-main { font-size: 34rpx; line-height: 1.3; }
.result-note {
  font-size: 27rpx;
  color: #2c3e50;
  opacity: 0.75;
  font-weight: 400;
  text-align: center;
}
/* 结算按钮的基础规格（最终尺寸 / 配色由 App.vue 的全局 .result .game-icon 统一覆盖） */
.result .result-btns { flex-wrap: wrap; }

/* ---------- 跟手浮层 / 飞行浮牌 ---------- */
.drag-ghost {
  position: fixed;
  z-index: 50;
  pointer-events: none;
  transform: translate(-50%, -50%) scale(1.06);
  filter: drop-shadow(0 12rpx 23rpx rgba(0, 0, 0, 0.25));
}
.fly-card {
  position: fixed;
  z-index: 60;
  pointer-events: none;
  transition: transform 0.2s ease-out;
  filter: drop-shadow(0 8rpx 19rpx rgba(0, 0, 0, 0.22));
}

/* ---------- 新游戏二次确认（与消除大师 / 消消乐 / 侦探同一套本地弹窗） ---------- */
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
