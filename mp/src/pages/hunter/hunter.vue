<template>
  <view class="screen">
    <!-- 全站背景（粒子连线 + 底部过山车，与 web 的 ParticleBackground 同款） -->
    <ParticleBackground />
    <view class="page">
      <!-- 统计条：最高关卡 / 当前关卡 / 生命（与 web 的 .score-area 一致，标签的 emoji 来自 i18n 原文） -->
      <view class="card score-area">
        <view class="stat">
          <text class="stat-label">{{ tt('bestScore') }}</text>
          <text class="stat-value">{{ bestLevel || '--' }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('levelLabel') }}</text>
          <text class="stat-value">{{ level + 1 }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('livesLabel') }}</text>
          <view class="stat-value stat-hearts">
            <view class="hearts">
              <text
                v-for="x in heartList"
                :key="'heart-' + x.h"
                class="heart"
                :class="{ dead: x.dead, popping: x.popping }"
              >{{ x.text }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 操作区：本关目标数 · 候选网格 / 用时 / 新游戏（web 的 3.5 : 2.5 : 4 分格） -->
      <view class="card opt-area">
        <view class="difficulty-wrapper">
          <text class="difficulty-value">{{ targetCount }} · {{ gridLabel }}</text>
        </view>
        <view class="divider" />
        <view class="opt-half">
          <!-- web 的 shared/CountTimer：图标 + MM:SS，每秒把秒数写进存档 -->
          <view class="timer">
            <view class="timer-ico i-carbon-timer" />
            <text class="timer-txt">{{ timeText }}</text>
          </view>
        </view>
        <view class="divider" />
        <view class="start-wrapper">
          <button class="game-icon" @click="confirming = true">{{ tt('start') }}</button>
        </view>
      </view>

      <!-- 游戏区：顶部一条「阶段提示带」，展示区 / 候选区都从带子下面开始（两者永不重叠）。
           两个区的宽高都由内容反算：PAD*2 + n*size + GAP*(n-1)，并 margin auto 居中。 -->
      <view class="game-area">
        <!-- 展示区：一行到底，目标越多格子越小；emoji 正方形 / 扑克 2:3 / 麻将 131:168 -->
        <view
          class="stage-frame dot-board"
          :class="[modeClass, { 'no-anim': snapping }]"
          :style="{ width: m.stageFrameW + 'rpx', height: m.stageFrameH + 'rpx' }"
        >
          <view class="stage">
            <view
              v-for="(cell, idx) in stage"
              :key="'s' + idx"
              class="tile"
              :class="{ up: !isStageFaceDown(idx) }"
              :style="{ width: m.stageW + 'rpx', height: m.stageH + 'rpx' }"
            >
              <!-- 翻面结构：.tile（定位/尺寸）> .flip（唯一的 perspective）> 两个常驻 .face -->
              <view class="flip">
                <view class="face face-back">
                  <!-- ⚠️ 图标类只能放内层：i-xxx 会加 mask + currentColor，写在整块面上会把面裁成图标形状 -->
                  <view
                    v-if="mode === MODE_EMOJI"
                    class="back-ico i-mdi-target"
                    :style="{ fontSize: backIcoFs(m.stageW) }"
                  />
                  <template v-else-if="mode === MODE_POKER">
                    <view class="pback" />
                    <view class="pback-ico i-mdi-cards-playing" :style="{ fontSize: backIcoFs(m.stageW) }" />
                  </template>
                  <view v-else class="mj-back" />
                </view>
                <view class="face face-front">
                  <text
                    v-if="mode === MODE_EMOJI"
                    class="emoji"
                    :style="{ fontSize: emojiFs(m.stageW, 0.52) }"
                  >{{ cell }}</text>
                  <view v-else-if="mode === MODE_POKER" class="pcard" :class="{ red: isRedCard(cell) }">
                    <text class="pnum pnum-top" :style="{ fontSize: pNumFs(m.stageW) }">{{ pointOf(cell) }}</text>
                    <text class="psuit" :style="{ fontSize: pSuitFs(m.stageW) }">{{ suitOf(cell) }}</text>
                    <text class="pnum pnum-bot" :style="{ fontSize: pNumFs(m.stageW) }">{{ pointOf(cell) }}</text>
                  </view>
                  <MahjongTile
                    v-else
                    class="mj"
                    :suit="faceOf(cell).suit"
                    :value="faceOf(cell).value"
                  />
                </view>
              </view>
            </view>
          </view>
        </view>

        <!-- 候选区：web 的 .candidate-area（点阵底纹 + 圆角 + 内边距），列数由关卡表给；
             结算层正好盖住这一块（web 的 .result 就在候选区里） -->
        <view
          class="candidate-area dot-board"
          :class="[modeClass, { 'no-anim': snapping }]"
          :style="{ width: m.candFrameW + 'rpx', height: m.candFrameH + 'rpx' }"
        >
          <view
            v-for="(opt, idx) in candidates"
            :key="'c' + idx"
            class="tile cand-tile"
            :class="{
              up: !isCandFaceDown(opt),
              found: foundSet.has(keyOf(opt)),
              wrong: wrongSet.has(keyOf(opt)),
              shaking: shakeIdx === idx,
              popping: justFound === keyOf(opt),
            }"
            :style="{ width: m.candW + 'rpx', height: m.candH + 'rpx' }"
            @click="pick(idx)"
          >
            <view class="flip">
              <view class="face face-back">
                <view
                  v-if="mode === MODE_EMOJI"
                  class="back-ico i-mdi-target"
                  :style="{ fontSize: backIcoFs(m.candW) }"
                />
                <template v-else-if="mode === MODE_POKER">
                  <view class="pback" />
                  <view class="pback-ico i-mdi-cards-playing" :style="{ fontSize: backIcoFs(m.candW) }" />
                </template>
                <view v-else class="mj-back" />
              </view>
              <view class="face face-front">
                <text
                  v-if="mode === MODE_EMOJI"
                  class="emoji"
                  :style="{ fontSize: emojiFs(m.candW, 0.5) }"
                >{{ opt }}</text>
                <view v-else-if="mode === MODE_POKER" class="pcard" :class="{ red: isRedCard(opt) }">
                  <text class="pnum pnum-top" :style="{ fontSize: pNumFs(m.candW) }">{{ pointOf(opt) }}</text>
                  <text class="psuit" :style="{ fontSize: pSuitFs(m.candW) }">{{ suitOf(opt) }}</text>
                  <text class="pnum pnum-bot" :style="{ fontSize: pNumFs(m.candW) }">{{ pointOf(opt) }}</text>
                </view>
                <MahjongTile
                  v-else
                  class="mj"
                  :suit="faceOf(opt).suit"
                  :value="faceOf(opt).value"
                />
              </view>
            </view>
          </view>

          <!-- 结算层：盖住候选区，胜利时才有「下一关」；「重玩本关」是橙色描边按钮（全局规格） -->
          <view v-if="phase === WON || phase === LOST" class="result" :class="phase === WON ? 'win' : 'lose'">
            <text class="result-tip">{{ phase === WON ? '🎉🎉 ' + tt('tipWin') + ' 🎉🎉' : '👻👻 ' + tt('tipLost') + ' 👻👻' }}</text>
            <view class="result-actions">
              <button class="game-icon replay-btn" @click="retryLevel">{{ tt('replayLevel') }}</button>
              <button v-if="phase === WON" class="game-icon" @click="nextLevel">{{ tt('nextLevel') }}</button>
            </view>
          </view>
        </view>

        <!-- 阶段提示：落在提示带里（不压牌）；空字符串时保留占位，避免布局跳动 -->
        <view class="phase-tip" :class="{ empty: !phaseTip }">{{ phaseTip }}</view>
      </view>
    </view>

    <!-- 胜利彩带：只在真正赢下的那一刻放（恢复存档的胜利态不放） -->
    <Confetti v-if="justWon" />

    <!-- 右下角悬浮按钮：模式在上、帮助在下，按钮上无文字 -->
    <FloatingActions>
      <view class="fab" @click="toggleMode">
        <view
          class="fab-ico"
          :class="mode === MODE_EMOJI
            ? 'i-mdi-emoticon-happy-outline'
            : mode === MODE_POKER
              ? 'i-mdi-cards-playing-outline'
              : 'i-dinkie-icons-three-of-circles-mahjong'"
        />
      </view>
      <view class="fab" @click="showHelp"><view class="fab-ico i-carbon-help" /></view>
    </FloatingActions>

    <HelpSheet :open="helpOpen" :text="helpText" @close="helpOpen = false" />

    <!-- 「新游戏」二次确认（照 web 的 shared/ConfirmDialog：取消 / 重玩本关 / 确定重来） -->
    <view v-if="confirming" class="confirm-mask" @click="confirming = false">
      <view class="confirm-box" @click.stop>
        <text class="confirm-title">{{ tt('confirmTitle') }}</text>
        <text class="confirm-msg">{{ tt('confirmMsg') }}</text>
        <view class="confirm-actions">
          <button class="confirm-btn cancel" @click="confirming = false">{{ tt('cancel') }}</button>
          <button class="confirm-btn replay" @click="retryLevel">{{ tt('confirmReplay') }}</button>
          <button class="confirm-btn ok" @click="startNewGame">{{ tt('confirmRestart') }}</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
// 猎手 · 微信小程序版
// 玩法与关卡曲线逐条照 web 的 src/games/hunter/HunterGame.vue 重写，只替换平台能力：
// - 存档：localStorage → @/core/storage（key 与 web 一字不差：__emoji_hunter__level[_2/_3] /
//   __emoji_hunter__best[_2/_3] / __emoji_hunter__mode）
// - 音效：Web Audio → @/core/sfx（选对 playElimination、选错 playFail、过关 playWin、失败 playLose）
// - 计时：web 的 shared/CountTimer → 本页 setInterval（每秒 +1，写进存档的 time）
// - 牌面：emoji / 扑克 / 麻将三种模式都保留；扑克牌面在本页自绘（web 复用 poker/CardItem，
//   小程序那份 card.vue 是固定尺寸、mini 态只有正面，不能按关卡缩放 → 这里用同一套 2:3 比例自绘）
// - 翻面：照 AGENTS 第二十一节「翻面动画唯一标准」：.tile > .flip(perspective) > 两个常驻 .face
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { onHide, onShow } from '@dcloudio/uni-app';

import Confetti from '@/components/Confetti.vue';
import FloatingActions from '@/components/FloatingActions.vue';
import HelpSheet from '@/components/HelpSheet.vue';
import MahjongTile from '@/components/MahjongTile.vue';
import { face } from '@/core/settings';
import { setNavTitle } from '@/core/i18n';
import { playElimination, playFail, playLose, playWin } from '@/core/sfx';
import { getJSON, getRaw, setRaw } from '@/core/storage';
import { EMOJIS } from '@/shared/emojis';
import { MAHJONG_FACES, faceOf } from '@/shared/mahjongFaces';
import { TILE_RATIO, preloadTiles } from '@/shared/mahjongTiles';
import { tt } from './i18n';
import ParticleBackground from '@/components/ParticleBackground.vue';

// 原生导航栏标题跟随语言（pages.json 里的标题是静态的）
setNavTitle(() => tt('gameTitle'));

// ---------- 关卡表（与 web 逐字相同） ----------
// emoji 6 关：3~8 个目标，候选区 3×3 → 4×5；麻将只换牌面，沿用这张表
const LEVELS = [
  { show: 3, grid: [3, 3] },
  { show: 4, grid: [3, 4] },
  { show: 5, grid: [3, 4] },
  { show: 6, grid: [4, 4] },
  { show: 7, grid: [4, 4] },
  { show: 8, grid: [4, 5] },
];
// 扑克 2:3 更好记 → 目标更多、候选区列多行少
const CARD_LEVELS = [
  { show: 4, grid: [3, 4] },
  { show: 5, grid: [3, 5] },
  { show: 6, grid: [3, 6] },
  { show: 7, grid: [4, 6] },
  { show: 8, grid: [4, 7] },
  { show: 9, grid: [4, 8] },
];
const CARD_RATIO = 1.5;
const CARD_TYPES = ['spade', 'club', 'heart', 'diamond'];
const CARD_POINTS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const CARD_SUITS = { spade: '♠', club: '♣', heart: '♥', diamond: '♦' };

const [MEMORY, FLIP, ANSWER, WON, LOST] = ['memory', 'flip', 'answer', 'won', 'lost'];
const MODE_EMOJI = 1;
const MODE_POKER = 2;
const MODE_MAHJONG = 3;

// ---------- 存档 key（与 web 一字不差） ----------
const PREFIX = '__emoji_hunter__';
const LEVEL_KEY = `${PREFIX}level`;
const BEST_KEY = `${PREFIX}best`;
const MODE_KEY = `${PREFIX}mode`;
const FACE_TO_MODE = { emoji: MODE_EMOJI, poker: MODE_POKER, mahjong: MODE_MAHJONG };
const HEARTS_MAX = 3;
const MEMORIES = 3000;
const MEMORY_EXTRA = 400;
const memoriesFor = lv => MEMORIES + Math.max(0, lv - 2) * MEMORY_EXTRA;

// 读到的模式只接受 1/2/3，其它（含旧存档里的脏值）一律当 emoji；
// 玩家没改过（key 不存在）才用设置里的牌面偏好当默认，改过就按他自己的
const rawMode = getRaw(MODE_KEY);
const storedMode = rawMode === null || rawMode === ''
  ? (FACE_TO_MODE[face.value] || MODE_EMOJI)
  : Math.floor(+rawMode);
const mode = ref([MODE_EMOJI, MODE_POKER, MODE_MAHJONG].includes(storedMode) ? storedMode : MODE_EMOJI);
const modeSuffix = () => (mode.value === MODE_POKER ? '_2' : mode.value === MODE_MAHJONG ? '_3' : '');
const levelKey = () => `${LEVEL_KEY}${modeSuffix()}`;
const bestKey = () => `${BEST_KEY}${modeSuffix()}`;
const levels = computed(() => (mode.value === MODE_POKER ? CARD_LEVELS : LEVELS));
const modeClass = computed(() => ({ poker: mode.value === MODE_POKER, mahjong: mode.value === MODE_MAHJONG }));

// ---------- 局面状态 ----------
const level = ref(0);
const phase = ref(MEMORY);
// 换一关的瞬间：全体先瞬移到背面（关掉过渡），画一帧之后再开过渡翻正面。
// 不这么做的话「加上 flipped 又很快摘掉」会取消过渡，复用的旧节点等于没翻、只换了内容
const snapping = ref(false);
const stage = ref([]);
const candidates = ref([]);
const foundSet = ref(new Set());
const wrongSet = ref(new Set());
// 本次点击刚找回的那张（键）：只驱动「弹一下 + 光环」，不写进存档，避免还原时重播动画
const justFound = ref(null);
// 选错的那张抖一下（记下标 → 600ms 后摘掉，与 web / 侦探同款）
const shakeIdx = ref(-1);
const hearts = ref(HEARTS_MAX);
const bestLevel = ref(0);
const confirming = ref(false);
const helpOpen = ref(false);
const justWon = ref(false);

const targetCount = computed(() => levels.value[level.value].show);
const grid = computed(() => levels.value[level.value].grid);
const gridLabel = computed(() => `${grid.value[0]}×${grid.value[1]}`);
const phaseTip = computed(() => {
  if (phase.value === MEMORY) return tt('phaseMemory');
  if (phase.value === FLIP) return tt('phaseFlip');
  if (phase.value === ANSWER) return tt('phaseAnswer');
  return '';
});

// ---------- 生命：逐颗 ❤️ / 🤍 + 掉心动画（web 的 shared/Hearts.vue） ----------
const poppingHeart = ref(0);
let heartPopTimer = null;
const heartList = computed(() => {
  const out = [];
  for (let h = 1; h <= HEARTS_MAX; h += 1) {
    const pop = poppingHeart.value === h;
    const alive = h <= hearts.value || pop;
    out.push({ h, text: alive ? '❤️' : '🤍', dead: !alive, popping: pop });
  }
  return out;
});
watch(hearts, (now, was) => {
  clearTimeout(heartPopTimer);
  poppingHeart.value = 0;
  if (!(now < was) || was < 1) return;   // 只有掉心才播
  poppingHeart.value = was;
  heartPopTimer = setTimeout(() => { poppingHeart.value = 0; }, 450);
});

// ---------- 计时（web 的 shared/CountTimer：MM:SS，每秒回调写存档） ----------
const seconds = ref(0);
let tickTimer = null;
const timeText = computed(() => {
  const s = seconds.value;
  return `${('0' + Math.floor(s / 60)).slice(-2)}:${('0' + Math.floor(s % 60)).slice(-2)}`;
});
function startTick() {
  if (tickTimer) return;
  tickTimer = setInterval(() => { seconds.value += 1; }, 1000);
}
function stopTick() {
  clearInterval(tickTimer);
  tickTimer = null;
}
function resetTick() {
  stopTick();
  seconds.value = 0;
  startTick();
}

// ---------- 尺寸：全部由内容反算（与 web 的 metrics 同一套口径） ----------
// 页面里除游戏区之外的固定高度（rpx）：top 27 + 统计条 168 + gap 31 + 操作区 120 + gap 31
// + 底部 140（让开悬浮按钮）+ 提示带 56
const GAME_W = 690;            // 与其它页的卡片同宽（web 的 calc(100% - 32px)）
const PAD = 16;                // web 两个区的 padding 8px
const GAP = 16;                // web 的 gap 8px
const STAGE_DOWN = 31;         // web 的 .stage-frame margin-bottom 16px（全工程 16px → 31rpx）
const TIP_BAND = 56;           // web 的 --tip-band 28px
const PAGE_FIXED_H = 27 + 168 + 31 + 120 + 31 + 140 + TIP_BAND;   // 573
const STAGE_CELL_MAX = 128;    // web 的 STAGE_CELL_MAX 64px
const CAND_CELL_MAX = 192;     // web 的 CAND_CELL_MAX 96px
const CARD_STAGE_MAX_W = 96;   // web 的 CARD_STAGE_MAX_W 48px
const CARD_CAND_MAX_W = 128;   // web 的 CARD_CAND_MAX_W 64px
const MJ_STAGE_MAX_W = 92;     // web 的 MJ_STAGE_MAX_W 46px
const MJ_CAND_MAX_W = 120;     // web 的 MJ_CAND_MAX_W 60px

function readViewport() {
  // H5 的 innerHeight 含 uni 自带的导航栏（44px）；小程序的 windowHeight 已扣掉原生导航栏
  if (typeof window !== 'undefined' && window.innerWidth) {
    const head = typeof document !== 'undefined' ? document.querySelector('uni-page-head') : null;
    return { w: window.innerWidth, h: window.innerHeight - (head ? head.offsetHeight : 0) };
  }
  try {
    const s = uni.getSystemInfoSync();
    return { w: s.windowWidth || 375, h: s.windowHeight || 667 };
  } catch {
    return { w: 375, h: 667 };
  }
}
const viewport = ref(readViewport());
const viewH = computed(() => Math.round((viewport.value.h * 750) / viewport.value.w));

const m = computed(() => {
  const lv = levels.value[level.value];
  const n = Math.max(1, lv.show);
  const [rows, cols] = lv.grid;
  const availH = Math.max(360, viewH.value - PAGE_FIXED_H);
  const stageByW = Math.floor((GAME_W - PAD * 2 - (n - 1) * GAP) / n);
  const candByW = Math.floor((GAME_W - PAD * 2 - (cols - 1) * GAP) / cols);

  if (mode.value === MODE_EMOJI) {
    const stageW = Math.max(28, Math.min(STAGE_CELL_MAX, stageByW));
    const stageFrameH = stageW + PAD * 2;
    // 一整页必须装得下（底部已留 140rpx 给悬浮按钮），否则候选区最后一行会落到屏幕外
    const candByH = Math.floor((availH - stageFrameH - STAGE_DOWN - PAD * 2 - (rows - 1) * GAP) / rows);
    const candW = Math.max(28, Math.min(CAND_CELL_MAX, candByW, candByH));
    return {
      stageW,
      stageH: stageW,
      candW,
      candH: candW,
      stageFrameW: n * stageW + (n - 1) * GAP + PAD * 2,
      stageFrameH,
      candFrameW: cols * candW + (cols - 1) * GAP + PAD * 2,
      candFrameH: rows * candW + (rows - 1) * GAP + PAD * 2,
    };
  }

  // 竖牌模式（扑克 2:3 / 麻将 168:131）：比例与宽度上限不同，其余算法一致
  const ratio = mode.value === MODE_MAHJONG ? TILE_RATIO : CARD_RATIO;
  const stageMax = mode.value === MODE_MAHJONG ? MJ_STAGE_MAX_W : CARD_STAGE_MAX_W;
  const candMax = mode.value === MODE_MAHJONG ? MJ_CAND_MAX_W : CARD_CAND_MAX_W;
  const stageW = Math.max(24, Math.min(stageMax, stageByW));
  const stageH = Math.round(stageW * ratio);
  const stageFrameH = stageH + PAD * 2;
  const candByH = Math.floor(
    (availH - stageFrameH - STAGE_DOWN - PAD * 2 - (rows - 1) * GAP) / rows / ratio,
  );
  const candW = Math.max(20, Math.min(candMax, candByW, candByH));
  // 高度向下取整：向上取整时每行多出的半 rpx 会让候选区整体高出预算、最后一排落到屏幕外
  const candH = Math.floor(candW * ratio);
  return {
    stageW,
    stageH,
    candW,
    candH,
    stageFrameW: n * stageW + (n - 1) * GAP + PAD * 2,
    stageFrameH,
    candFrameW: cols * candW + (cols - 1) * GAP + PAD * 2,
    candFrameH: rows * candH + (rows - 1) * GAP + PAD * 2,
  };
});

// 字号都要按格子宽现算（web 用 calc(var(--stage-cell) * 0.52) 这类算式）
const emojiFs = (w, k) => `${Math.round(w * k)}rpx`;
const backIcoFs = w => `${Math.round(w * 0.4)}rpx`;
const pNumFs = w => `${Math.max(10, Math.round(w * 0.26))}rpx`;
const pSuitFs = w => `${Math.max(14, Math.round(w * 0.6))}rpx`;

// ---------- 牌面工具 ----------
// 判定一律走 keyOf：扑克是对象，存档还原后必然不是同一个引用
const keyOf = (item) => {
  if (item === null || item === undefined) return '';
  return typeof item === 'string' ? item : `${item.num}-${item.type}`;
};
const isRedCard = item => item && (item.type === 'heart' || item.type === 'diamond');
const pointOf = item => CARD_POINTS[(item && item.num ? item.num : 1) - 1];
const suitOf = item => CARD_SUITS[item && item.type] || '';
const stageKeySet = computed(() => new Set(stage.value.map(keyOf)));

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function pickEmojis(n) {
  const pool = [...EMOJIS];
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const j = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(j, 1)[0]);
  }
  return out;
}
// 一副牌（52 张，四花色 × A~K）洗好后取前 n 张
function drawCards(n) {
  const deck = [];
  CARD_TYPES.forEach((type) => {
    for (let num = 1; num <= 13; num += 1) deck.push({ num, type });
  });
  return shuffle(deck).slice(0, n);
}
// 麻将 34 种牌面洗好后取前 n 张（麻将沿用 emoji 关卡表，最多 20 格，够用）
function drawMahjong(n) {
  return shuffle(MAHJONG_FACES).slice(0, n);
}
const newItems = n => {
  if (mode.value === MODE_POKER) return drawCards(n);
  return mode.value === MODE_MAHJONG ? drawMahjong(n) : pickEmojis(n);
};

// 展示牌是否背面：记忆结束后未被找回的；结算（胜负）后全部翻正供复盘
function isStageFaceDown(idx) {
  if (snapping.value) return true;
  if (phase.value === MEMORY || phase.value === WON || phase.value === LOST) return false;
  return !foundSet.value.has(keyOf(stage.value[idx]));
}
// 候选牌是否背面：记忆阶段整体背面（盖住内容防偷看），答题后翻正；结算后全部翻正复盘
function isCandFaceDown() {
  if (snapping.value || phase.value === MEMORY || phase.value === FLIP) return true;
  return false;
}

// ---------- 流程 ----------
let timers = [];
const wait = ms => new Promise((res) => { timers.push(setTimeout(res, ms)); });
let memoryTimer = null;
let flipTimer = null;
let shakeTimer = null;
let settleTimer = null;
let wonTimer = null;
// 换局 +1：上一次 startLevel 还停在 await 里时，这次换局作废旧流程
let levelToken = 0;
// 结算前停留 0.5s：让玩家看清最后一次选择，期间锁输入（只锁输入，不锁整盘）
const settling = ref(false);

function settleThen(cb) {
  settling.value = true;
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    settling.value = false;
    cb();
  }, 500);
}
function cancelSettle() {
  clearTimeout(settleTimer);
  settleTimer = null;
  settling.value = false;
}
function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
  clearTimeout(memoryTimer);
  clearTimeout(flipTimer);
  clearTimeout(shakeTimer);
  memoryTimer = null;
  flipTimer = null;
  shakeTimer = null;
  justFound.value = null;
  cancelSettle();
}

function save() {
  if (!stage.value.length) return;
  setRaw(levelKey(), JSON.stringify({
    level: level.value,
    hearts: hearts.value,
    phase: phase.value,
    time: seconds.value,
    // 这一局的盘面：胜利结算层要连牌一起还原，回来时看到的才是同一张盘
    stage: stage.value,
    candidates: candidates.value,
    found: [...foundSet.value],
    wrong: [...wrongSet.value],
  }));
}

function restore() {
  const saved = getJSON(levelKey());
  if (!saved || typeof saved.level !== 'number') return false;
  level.value = Math.min(levels.value.length - 1, Math.max(0, saved.level));
  // 结算局面（胜负都算）：原样还原那一盘（两面都翻正、标出找回 / 标错），由玩家自己选
  if (
    (saved.phase === WON || saved.phase === LOST)
    && Array.isArray(saved.stage) && saved.stage.length
    && Array.isArray(saved.candidates) && saved.candidates.length
  ) {
    stage.value = saved.stage;
    candidates.value = saved.candidates;
    foundSet.value = new Set(Array.isArray(saved.found) ? saved.found : []);
    wrongSet.value = new Set(Array.isArray(saved.wrong) ? saved.wrong : []);
    shakeIdx.value = -1;
    justFound.value = null;       // 还原出来的已找回牌不算「本次点击」，别重播动画
    hearts.value = typeof saved.hearts === 'number' ? saved.hearts : HEARTS_MAX;
    phase.value = saved.phase === LOST ? LOST : WON;
    // 结算层的钟停在过关那一刻
    stopTick();
    seconds.value = +saved.time || 0;
    return true;
  }
  // 玩到一半退出：重开当前关（棋盘随机，公平）
  startLevel();
  return true;
}

async function startLevel() {
  clearTimers();
  const token = ++levelToken;
  foundSet.value = new Set();
  wrongSet.value = new Set();
  shakeIdx.value = -1;
  hearts.value = HEARTS_MAX;
  // 先置 FLIP（= 两面都是背面），避免 snapping 关掉的那一帧候选区先翻正
  phase.value = FLIP;
  const lv = levels.value[level.value];
  const total = lv.grid[0] * lv.grid[1];
  const all = newItems(total);
  // 新内容先在「全体背面 + 关掉过渡」的状态下渲染（snapping）：新内容不会先在正面闪一下
  snapping.value = true;
  stage.value = all.slice(0, lv.show);
  const rest = all.slice(lv.show);
  // 候选区：展示牌 + 干扰项打乱（总数 = rows × cols）
  candidates.value = shuffle([...stage.value, ...rest]);
  await nextTick();
  await wait(32);
  if (token !== levelToken) return;
  snapping.value = false;          // 打开过渡（此时还都是背面，位置不变）
  await nextTick();
  await wait(32);
  if (token !== levelToken) return;
  phase.value = MEMORY;            // 全体从背面翻到正面
  resetTick();
  memoryTimer = setTimeout(() => {
    phase.value = FLIP;
    flipTimer = setTimeout(() => {
      if (phase.value !== FLIP) return;
      phase.value = ANSWER;
      save();
    }, 500);
  }, memoriesFor(level.value));
  save();
}

// 点候选：是展示过的 → 标记找回（对应展示牌翻回）；不是 → 标红且不可再选，扣心
function pick(idx) {
  if (phase.value !== ANSWER || settling.value) return;
  const item = candidates.value[idx];
  const key = keyOf(item);
  if (foundSet.value.has(key) || wrongSet.value.has(key)) return;

  if (stageKeySet.value.has(key)) {
    foundSet.value = new Set([...foundSet.value, key]);
    playElimination();                 // 选对一张
    justFound.value = key;             // 只有这一张播动画
    if (foundSet.value.size === stage.value.length) {
      // 先让最后找回的那张亮 0.5s，再弹结算浮层
      settleThen(() => {
        phase.value = WON;
        stopTick();
        if (level.value + 1 > bestLevel.value) {
          bestLevel.value = level.value + 1;
          setRaw(bestKey(), bestLevel.value);
        }
        justWon.value = true;
        clearTimeout(wonTimer);
        wonTimer = setTimeout(() => { justWon.value = false; }, 4000);
        playWin();                     // 过关
        save();
      });
    }
    save();
  } else {
    wrongSet.value = new Set([...wrongSet.value, key]);
    shakeIdx.value = idx;
    hearts.value = Math.max(0, hearts.value - 1);
    playFail();                        // 扣❤️
    if (hearts.value <= 0) {
      // 生命耗尽：先留住 0.5s 让玩家看清标红的那张，再失败结算（计时随之停止）
      settleThen(() => {
        phase.value = LOST;
        playLose();
        stopTick();
        save();
      });
    }
    clearTimeout(shakeTimer);
    shakeTimer = setTimeout(() => {
      if (shakeIdx.value === idx) shakeIdx.value = -1;
    }, 600);
    save();
  }
}

function nextLevel() {
  if (level.value < levels.value.length - 1) level.value += 1;
  startLevel();
}
function retryLevel() {
  confirming.value = false;
  startLevel();
}
function initGame() {
  level.value = 0;
  startLevel();
}
// 「新游戏」二次确认后：清掉当前牌面的最高关卡记录，从第 1 关重来（另两种牌面的记录不动）
function startNewGame() {
  confirming.value = false;
  setRaw(bestKey(), '');
  // 与 web 的 localStorage.removeItem 对齐：清成空串后 getRaw 视为 null
  bestLevel.value = 0;
  initGame();
}

// 切换牌面：emoji → 扑克 → 麻将 → emoji。先落档当前模式，再按另一种模式自己的存档接着玩
function toggleMode() {
  save();
  clearTimers();
  levelToken += 1;                   // 作废还停在 await 里的旧流程
  mode.value = mode.value === MODE_EMOJI ? MODE_POKER : mode.value === MODE_POKER ? MODE_MAHJONG : MODE_EMOJI;
  setRaw(MODE_KEY, String(mode.value));
  // 先清盘再进新模式：否则旧牌面会被新模式的模板渲染一帧（emoji 当麻将 key / 扑克对象当 emoji）
  stage.value = [];
  candidates.value = [];
  phase.value = FLIP;
  bestLevel.value = Math.max(0, +(getRaw(bestKey()) || 0));
  bootMode();
}

// 进模式 / 切模式都从这里进：麻将模式先把雪碧图读进缓存再渲染（共享 promise，重复调用无成本）。
// bootToken 给这段 await 收手：连点模式开关时，上一次还停在 await 里的流程作废
let bootToken = 0;
async function bootMode() {
  const token = ++bootToken;
  if (mode.value === MODE_MAHJONG) {
    try { await preloadTiles(); } catch { /* 加载失败也不影响开局 */ }
  }
  if (token !== bootToken) return;
  bestLevel.value = Math.max(0, +(getRaw(bestKey()) || 0));
  if (!restore()) initGame();
}

// ---------- 帮助 ----------
function showHelp() {
  helpOpen.value = true;
}
// web 的猎手只有 help1~4 与 help6（没有 help5），照实际取
const helpText = computed(
  () => ['helpMsg', 'help1', 'help2', 'help3', 'help4', 'help6'].map(tt).join('\n\n'),
);

// ---------- 生命周期 ----------
onMounted(bootMode);

onShow(() => {
  viewport.value = readViewport();
  if (phase.value !== WON && phase.value !== LOST) startTick();
});
onHide(() => {
  stopTick();
});
onUnmounted(() => {
  levelToken += 1;
  clearTimers();
  clearTimeout(wonTimer);
  clearTimeout(heartPopTimer);
  stopTick();
});
</script>

<style lang="scss" scoped>
/* ---------- 页面骨架：.screen 只有一处 min-height，.page 负责间距 ---------- */
.screen {
  min-height: 100vh;
  background: transparent;  /* 背景交给 ParticleBackground（canvas 自己铺底色） */
}
.page {
  padding: 27rpx 24rpx 140rpx;   /* 底部 140rpx 让开右下角悬浮按钮 */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 31rpx;
  background: #f0f2f5;
  color: #2c3e50;
}

/* ---------- 统计条 / 操作区（高度由 App.vue 的全局 .score-area / .opt-area 给） ---------- */
.score-area,
.opt-area {
  width: 690rpx;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}
.score-area { padding: 0 19rpx; }
.opt-area { padding: 0 8rpx; }
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

/* 生命：逐颗 ❤️ / 🤍 + 掉心动画（web 的 shared/Hearts.vue） */
@keyframes heart-pop {
  0% { transform: scale(1); opacity: 1; }
  40% { transform: scale(1.55); opacity: 1; }
  100% { transform: scale(2.1); opacity: 0; }
}
.hearts {
  display: flex;
  align-items: center;
  gap: 8rpx;                     /* web 的 gap: 4px */
  font-size: 38rpx;
  line-height: 1;
}
.heart {
  display: inline-block;
  font-size: 36rpx;              /* 19px */
  line-height: 1;
}
.heart.dead { opacity: 0.3; }
.heart.popping { animation: heart-pop 450ms ease forwards; }

/* 操作区三格：本关难度 3.5 / 计时 2.5 / 新游戏 4（与 web 的 flex 比例一致） */
.difficulty-wrapper {
  flex: 3.5;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}
.difficulty-value {
  font-size: 27rpx;              /* 14px */
  color: #5f6b7a;
  font-weight: 400;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.opt-half {
  flex: 2.5;
  display: flex;
  align-items: center;
  justify-content: center;
}
.start-wrapper {
  flex: 4;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* 计时（web 的 CountTimer：图标 + MM:SS，14px / 600） */
.timer {
  display: flex;
  align-items: center;
  gap: 11rpx;                    /* 6px */
  font-size: 27rpx;
  font-weight: 600;
}
.timer-ico { pointer-events: none; }
.timer-txt { font-variant-numeric: tabular-nums; }

/* 主按钮：web 的 .game-icon（padding 8px 12px / 13px 粗体 / 8px 圆角） */
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

/* ---------- 游戏区 ---------- */
.game-area {
  position: relative;
  width: 690rpx;
  box-sizing: border-box;
  /* 顶部留出提示带：提示条落在带子里，展示区 / 候选区从带子下面开始，两者永不重叠 */
  padding-top: 56rpx;            /* web 的 --tip-band 28px */
}
.phase-tip {
  position: absolute;
  top: 4rpx;
  left: 50%;
  transform: translateX(-50%);
  padding: 2rpx 28rpx;
  border-radius: 15rpx;
  background: #fff;
  color: #2c3e50;
  border: 2rpx solid #e1e1e1;
  font-size: 28rpx;              /* 14px */
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  z-index: 3;
}
.phase-tip.empty { visibility: hidden; }

/* 两个区的尺寸都由 JS 反算（内容撑开 + margin auto 居中） */
.stage-frame {
  margin: 0 auto 31rpx;
  padding: 16rpx;
  box-sizing: border-box;
  border-radius: 27rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.stage {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.candidate-area {
  position: relative;
  margin: 0 auto;
  padding: 16rpx;
  box-sizing: border-box;
  border-radius: 27rpx;
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  justify-content: center;
  gap: 16rpx;
}
/* 点阵底纹（web App.vue 的 .dot-board；小程序没有全局那份，这里本地定义） */
.dot-board {
  background-color: #bbada0;
  background-image: radial-gradient(circle, rgba(255, 255, 255, 0.18) 2rpx, transparent 2rpx);
  background-size: 19rpx 19rpx;   /* 10px 一格 */
  background-position: 9rpx 9rpx;
}

/* ---------- 翻面（AGENTS 第二十一节唯一标准） ----------
   ① .tile 定位层：只管尺寸 / 位置（发牌动画也放这一层，本页 web 没有发牌动画就留空）
   ② .flip 3D 舞台：只放 perspective，不放动画
   ③ .face 两个面常驻，默认背面朝上，up 才翻到正面 */
.tile {
  position: relative;
  flex: 0 0 auto;
  box-sizing: border-box;
  border-radius: 15rpx;
}
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
  box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.12);   /* web 的 --shadow-soft */
  background: #fff;
  line-height: 1;
  transform: rotateY(0deg);
  /* 真 3D 翻转：两面各自绕 Y 轴转 180°；不透明度 0.01s + 0.225s 延迟，
     正好在牌侧立 90° 那一刻瞬切 → 永远看不到镜像的背面 */
  transition-property: transform, opacity;
  transition-duration: 0.46s, 0.01s;
  transition-timing-function: ease-in-out, linear;
  transition-delay: 0s, 0.225s;
}
/* 默认必须「背面朝上」—— up 表示翻开。
   选择器写成 `.face.face-back`（两个类）而不是单类：下面那组真机兜底里有
   `.face { -webkit-transform: translateZ(0) }`，单类会被它按同权重后写的规则压掉，
   正面就会退化成「只淡入、不旋转」。两个类权重更高，rotateY 一定生效（与 mirror 的
   `.face.front` / `.face.back` 同一做法）。 */
.face.face-back {
  transform: rotateY(0deg);
  opacity: 1;
  background: #23804e;           /* 底色挂在两个面上，不挂在 .tile 上 */
  color: #fff;
}
.face.face-front {
  transform: rotateY(180deg);
  opacity: 0;
  background: #fff;
}
.tile.up .face-back { transform: rotateY(180deg); opacity: 0; }
.tile.up .face-front { transform: rotateY(0deg); opacity: 1; }
/* 换一关的第一帧：关掉过渡，让所有牌先「瞬移」到背面（见 startLevel） */
.no-anim .face { transition: none; }

/* 真机在翻面收尾时偶尔会闪一下：两面都在 3D 里旋转，合成层在过渡结束重绘时可能把「背面」多画一帧。
   backface-visibility: hidden → 背朝观众的那一面永远不画（即使透明度切换晚一帧也看不到镜像）；
   will-change / translateZ(0) → 两面各自常驻合成层，过渡结束不再重新栅格化。 */
.face {
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
  -webkit-transform: translateZ(0);
  will-change: transform, opacity;
}

.emoji { line-height: 1; }
.back-ico { pointer-events: none; }

/* ---------- 扑克牌面（照 web 的 poker/CardItem 视觉：白底 + 细边 + 角标点数 + 中央花色） ---------- */
.poker .face {
  background: #fafafa;
  border-color: #dcdfe6;
}
.poker .face-back { background: #fafafa; color: #333; }
.pback {
  position: absolute;
  left: 3%;
  top: 3%;
  width: 94%;
  height: 94%;
  box-sizing: border-box;
  border: 2rpx dotted #eee;
  border-radius: 12rpx;
  background-image: radial-gradient(circle, #9a9a9a 1rpx, transparent 1rpx);
  background-size: 8% 8%;
}
.pback-ico {
  position: relative;
  z-index: 1;
  color: #333;
  pointer-events: none;
}
.pcard {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  color: #111;
}
.pcard.red { color: #e00; }
.pnum {
  position: absolute;
  font-weight: bold;
  line-height: 1;
}
.pnum-top { top: 7%; left: 9%; }
.pnum-bot { bottom: 7%; right: 9%; transform: rotate(180deg); }
.psuit {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-weight: bold;
  line-height: 1;
}

/* ---------- 麻将牌面（雪碧图由 MahjongTile 自己裁剪，外框让开底色/描边） ---------- */
.mahjong .face {
  border: 0 none;
  background: transparent;
  box-shadow: none;
}
.mahjong .face-back { background: transparent; }
/* 牌背：web 的 MahjongBack（绿色斜纹 + 内圈）——小程序里用渐变近似（与对对碰同一套） */
.mj-back {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background-color: #1f7a4d;
  background-image: linear-gradient(145deg, #2f8f5b, #1d6b3f);
  box-shadow: inset 0 0 0 4rpx rgba(255, 255, 255, 0.22);
}
.mj {
  width: 100%;
  height: 100%;
  display: block;
}

/* ---------- 候选：找回 / 标错 / 弹一下 / 抖一下 ---------- */
.cand-tile {
  -webkit-tap-highlight-color: transparent;
}
/* 找回的目标：绿色标记（emoji 模式给面上色，与 web 一致） */
.cand-tile.found .face-front {
  background: #e5f6ec;           /* web 的 --enter-bg */
  border-color: #23804e;
  box-shadow: inset 0 0 0 2rpx #23804e;
}
/* 选错：红标常驻 */
.cand-tile.wrong .face-front {
  background: #fdeeee;           /* web 的 --del-bg */
  border-color: #b11;
  box-shadow: inset 0 0 0 2rpx #b11;
}
/* 扑克 / 麻将：牌面自带底色，标记改画成牌外的一圈（web 也是把环画在 .card / .mj 上） */
.poker .cand-tile.found .face-front {
  background: #fafafa;
  border-color: #23804e;
  box-shadow: 0 0 0 6rpx #23804e;
}
.poker .cand-tile.wrong .face-front {
  background: #fafafa;
  border-color: #b11;
  box-shadow: 0 0 0 6rpx #b11;
}
.mahjong .cand-tile.found .face-front {
  background: transparent;
  border-color: transparent;
  box-shadow: 0 0 0 6rpx #23804e;
}
.mahjong .cand-tile.wrong .face-front {
  background: transparent;
  border-color: transparent;
  box-shadow: 0 0 0 6rpx #b11;
}
/* 弹一下（挂在定位层 .tile 上：.face 的 transform 已经被翻面占用，不能再叠动画） */
@keyframes found-pop {
  0% { transform: scale(1); }
  30% { transform: scale(1.18); }
  58% { transform: scale(0.96); }
  100% { transform: scale(1); }
}
@keyframes found-ring {
  0% { box-shadow: 0 0 0 0 rgba(35, 128, 78, 0.55); }
  100% { box-shadow: 0 0 0 18rpx rgba(35, 128, 78, 0); }
}
.cand-tile.popping { animation: found-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1); }
/* 光环只动 box-shadow，不碰 transform（.face 上不允许再叠 transform 动画） */
.cand-tile.popping .face-front { animation: found-ring 0.5s ease-out; }
/* 选错：当场抖一下（与 web / 侦探同款） */
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-6rpx); }
  75% { transform: translateX(6rpx); }
}
.cand-tile.shaking { animation: shake 0.4s ease; }

/* ---------- 结算层：正好盖住候选区（web 的 .result 就在 .candidate-area 里） ---------- */
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
  z-index: 4;
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
  font-weight: bold;
  animation: result-in 0.28s ease;
}
.result.lose { color: #b11; }
.result-tip { text-align: center; }
.result-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  width: 100%;
}
.result-actions .game-icon { flex: 0 0 auto; }

/* ---------- 「新游戏」二次确认（照 web shared/ConfirmDialog） ---------- */
@keyframes confirm-in {
  from { transform: scale(0.1); }
  to { transform: scale(1); }
}
.confirm-mask {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
}
.confirm-box {
  width: 610rpx;                 /* web 的 calc(100% - 64px) = 311px @375 / max-width 320px */
  max-width: 640rpx;
  padding: 40rpx 40rpx 32rpx;
  box-sizing: border-box;
  border-radius: 27rpx;
  background: #fff;
  color: #2c3e50;
  box-shadow: 0 4rpx 23rpx rgba(0, 0, 0, 0.08);
  animation: confirm-in 0.16s ease-in-out;
}
.confirm-title {
  display: block;
  font-size: 34rpx;              /* 17px */
  font-weight: bold;
  margin-bottom: 16rpx;
}
.confirm-msg {
  display: block;
  font-size: 28rpx;              /* 14px */
  line-height: 1.5;
  opacity: 0.8;
  margin-bottom: 32rpx;
}
.confirm-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 20rpx;
}
.confirm-btn {
  flex: 0 0 auto;
  margin: 0;
  padding: 0 24rpx;
  height: 68rpx;
  line-height: 68rpx;
  font-size: 28rpx;
  border-radius: 15rpx;
  border: 0;
  box-sizing: border-box;
}
.confirm-btn::after { border: none; }
.confirm-btn.cancel {
  background: #eef0f4;           /* web 的 --key-bg */
  color: #2c3e50;
}
/* 「重玩本关」是次要动作：橙色描边，和主按钮区分开 */
.confirm-btn.replay {
  background: transparent;
  border: 2rpx solid #c2410c;
  color: #c2410c;
  font-weight: bold;
  line-height: 64rpx;
}
.confirm-btn.ok {
  background: #23804e;
  color: #fff;
  font-weight: bold;
}
</style>
