<template>
  <view class="screen">
    <!-- 全站背景（粒子连线 + 底部过山车，与 web 的 ParticleBackground 同款） -->
    <ParticleBackground />
    <view class="page">
      <!-- 统计条：最高关卡 / 当前关卡 / 生命（与 web 的 score-area 同序；label 的 emoji 在字典原文里） -->
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

      <!-- 操作区：盘面规格 · 牌面名 / 计时 / 新游戏（web 的 3.5 : 2.5 : 4 分格） -->
      <view class="card opt-area">
        <view class="difficulty-wrapper">
          <text class="difficulty-value">{{ rows }}×{{ cols }} · {{ modeName }}</text>
        </view>
        <view class="divider" />
        <view class="opt-half">
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

      <!-- 游戏区：顶部一条提示带 + 棋盘外框（宽度/高度都由格子数反算，margin auto 居中）。
           结算层是外框的子节点，正好严丝合缝地盖住棋盘（web 的 .result 同一份矩形）。 -->
      <view class="game-area" :style="{ width: boardW + 'rpx' }">
        <view class="board-frame" :style="{ width: boardW + 'rpx', height: boardH + 'rpx' }">
          <view class="board" :class="{ poker: mode === MODE_CARDS, mahjong: mode === MODE_MAHJONG }">
            <view
              v-for="(cell, i) in board"
              :key="i"
              class="tile"
              :class="{
                up: phase !== FLIP,
                shaking: shakeIdx === i,
                popping: rightIdx === i,
                stamped: i === swappedIdx && stampShown,
              }"
              :style="tileStyle(i)"
              @click="onCellClick(i)"
            >
              <!-- 三层结构（AGENTS 第二十一节）：.tile 定位、.flip 只放 perspective、
                   正反两面常驻 DOM。默认背面朝上，.up 才是翻开。 -->
              <view class="flip">
                <!-- 牌背：emoji 模式用本游戏的首页图标；扑克用迷你牌背；麻将用绿色纹理牌背 -->
                <view class="face face-back" :class="{ 'mj-back': mode === MODE_MAHJONG, 'poker-back': mode === MODE_CARDS }">
                  <view
                    v-if="mode === MODE_EMOJI"
                    class="back-ico i-mdi-incognito"
                    :style="{ fontSize: backIcon + 'rpx' }"
                  />
                  <view v-else-if="mode === MODE_CARDS" class="pc-back">
                    <view class="pc-back-fill" />
                    <view class="pc-back-ico i-mdi-cards-playing" :style="{ fontSize: backIcon + 'rpx' }" />
                  </view>
                </view>
                <!-- 正面：三种牌面各自的内容；红标 / 绿框 / 弹一下都挂在这一层 -->
                <view class="face face-front" :class="{ wrong: isWrong(i), revealed: isRevealed(i) }">
                  <view class="front-inner">
                    <text
                      v-if="mode === MODE_EMOJI"
                      class="emoji"
                      :style="{ fontSize: emojiFont + 'rpx' }"
                    >{{ cell }}</text>
                    <view v-else-if="mode === MODE_CARDS" class="pcard">
                      <text
                        class="pc-rank pc-rank-top"
                        :class="{ red: isRed(cell) }"
                        :style="{ fontSize: rankFont + 'rpx' }"
                      >{{ pointOf(cell) }}</text>
                      <text
                        class="pc-rank pc-rank-bottom"
                        :class="{ red: isRed(cell) }"
                        :style="{ fontSize: rankFont + 'rpx' }"
                      >{{ pointOf(cell) }}</text>
                      <text
                        class="pc-suit"
                        :class="{ red: isRed(cell) }"
                        :style="{ fontSize: suitFont + 'rpx' }"
                      >{{ suitOf(cell) }}</text>
                    </view>
                    <view v-else class="mj" :style="{ width: mjW + 'rpx', height: mjH + 'rpx' }">
                      <MahjongTile class="mj-face" :suit="cell.suit" :value="cell.value" />
                    </view>
                  </view>
                </view>
              </view>

              <!-- 生命耗尽：在正确答案上盖一个歪的「✓ 正确」章（失败结算后静态保留，不重播动画） -->
              <view v-if="i === swappedIdx && (stampShown || phase === LOST)" class="stamp">
                <view class="stamp-inner">
                  <text class="stamp-mark" :style="{ fontSize: stampMarkFont + 'rpx' }">✓</text>
                  <text class="stamp-text" :style="{ fontSize: stampTextFont + 'rpx' }">{{ tt('stampText') }}</text>
                </view>
              </view>
            </view>
          </view>

          <!-- 结算层：win 两颗按钮（重玩 / 下一关），lose 只有重玩 -->
          <view v-if="phase === WON" class="result win">
            <text class="result-main">🎉🎉 {{ tt('tipWin') }} 🎉🎉</text>
            <view class="result-btns">
              <button class="btn ghost" @click="retryLevel">{{ tt('replayLevel') }}</button>
              <button class="btn" @click="nextLevel">{{ tt('nextLevel') }}</button>
            </view>
          </view>
          <view v-else-if="phase === LOST" class="result lose">
            <text class="result-main">👻👻 {{ tt('tipLost') }} 👻👻</text>
            <view class="result-btns">
              <button class="btn ghost" @click="retryLevel">{{ tt('replayLevel') }}</button>
            </view>
          </view>
        </view>

        <!-- 阶段提示浮在棋盘上方的那条空白带里（带子由 .game-area 的 padding-top 预留，永不压第一行牌） -->
        <view v-if="phaseTipText" class="phase-tip">{{ phaseTipText }}</view>
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

    <!-- 胜利彩带：只在真正赢下的那一刻放（恢复存档的胜利态不放） -->
    <Confetti v-if="justWon" />
    <!-- 模式切换在上、帮助在下（按钮上无文字，图标沿用 web 的三个分支） -->
    <FloatingActions>
      <view class="fab" @click="toggleMode">
        <view v-if="mode === MODE_EMOJI" class="fab-ico i-mdi-emoticon-happy-outline" />
        <view v-else-if="mode === MODE_CARDS" class="fab-ico i-mdi-cards-playing-outline" />
        <view v-else class="fab-ico i-dinkie-icons-three-of-circles-mahjong" />
      </view>
      <view class="fab" @click="showHelp"><view class="fab-ico i-carbon-help" /></view>
    </FloatingActions>
    <HelpSheet :open="helpOpen" :text="helpText" @close="helpOpen = false" />
  </view>
</template>

<script setup>
// 侦探 · 微信小程序版（web 的 src/games/detective/DetectiveGame.vue 移植）
// 玩法：观察期记住全部牌面 → 全部翻面 1s（翻面途中偷换一张）→ 翻回后点出被换的那张。
// 与 web 的差异只有平台能力：
// - 存档：localStorage → @/core/storage（key 与 web 一字不差，含三种牌面的 _2 / _3 后缀）
// - 音效：Web Audio → @/core/sfx（选对 playElimination / 选错 playFail / 过关 playWin / 失败 playLose，落点同 web）
// - 计时：web 的 shared/CountTimer → 本页 setInterval（每秒 +1 并写存档；结算后停表）
// - 扑克牌面：web 复用 poker 的 CardItem，小程序这边 poker 的 card.vue 自带翻面与固定尺寸不适合当「面」，
//   所以在页面内画一张迷你牌（白底 + 左右角点数 + 中间花色文字），尺寸/字号仍按 web 的 cardVars 口径算
// - 顶部模式开关 + 帮助 → 右下角两颗悬浮按钮（模式在上、帮助在下）
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

import Confetti from '@/components/Confetti.vue';
import FloatingActions from '@/components/FloatingActions.vue';
import HelpSheet from '@/components/HelpSheet.vue';
import MahjongTile from '@/components/MahjongTile.vue';
import { setNavTitle } from '@/core/i18n';
import { face } from '@/core/settings';
import { playElimination, playFail, playLose, playWin } from '@/core/sfx';
import { getJSON, getRaw, setRaw } from '@/core/storage';
import { EMOJIS } from '@/shared/emojis';
import { MAHJONG_FACES, faceOf } from '@/shared/mahjongFaces';
import { TILE_RATIO } from '@/shared/mahjongTiles';
import { tt } from './i18n';
import ParticleBackground from '@/components/ParticleBackground.vue';

// 原生导航栏标题跟随语言（pages.json 里的标题是静态的）
setNavTitle(() => tt('gameTitle'));

// ---------- 常量（全部照 web 的 DetectiveGame.vue） ----------
const [MEMORY, FLIP, ANSWER, WON, LOST] = ['memory', 'flip', 'answer', 'won', 'lost'];
const MODE_EMOJI = 1;
const MODE_CARDS = 2;
const MODE_MAHJONG = 3;
const FACE_TO_MODE = { emoji: MODE_EMOJI, poker: MODE_CARDS, mahjong: MODE_MAHJONG };

const KEY_PREFIX = '__emoji_detective__';
const LEVEL_KEY = `${KEY_PREFIX}level`;
const BEST_KEY = `${KEY_PREFIX}best`;
const MODE_KEY = `${KEY_PREFIX}mode`;

// emoji / 麻将：1×3 → 4×5 共九关；扑克牌面有花色 + 点数两层线索，牌更多、多一关
const EMOJI_SIZES = [[1, 3], [2, 2], [2, 3], [2, 4], [3, 3], [3, 4], [3, 5], [4, 4], [4, 5]];
const EMOJI_MEMORIES = [2000, 2500, 3000, 3500, 4000, 4500, 5000, 6000, 7000];
const CARD_SIZES = [[1, 4], [2, 3], [2, 4], [2, 5], [3, 4], [3, 5], [3, 6], [4, 5], [4, 6], [4, 7]];
const CARD_MEMORIES = [2000, 2600, 3000, 3400, 3800, 4500, 5000, 5500, 6500, 7500];
const CARD_RATIO = 1.5;             // 扑克 2:3
const MAHJONG_RATIO = TILE_RATIO;   // 麻将 168/131 ≈ 1.282（与雀圣 / 麻将英雄同一个来源）
const CARD_TYPES = ['spade', 'club', 'heart', 'diamond'];
const CARD_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const CARD_SUITS = { spade: '♠', club: '♣', heart: '♥', diamond: '♦' };

const FLIP_MS = 1000;      // 翻面阶段总时长（web 同值）
const SWAP_AT = 250;       // 翻面过半时偷换（web 同值）
const HEARTS_MAX = 3;
const SETTLE_MS = 500;     // 答对后停留 0.5s 再弹结算
const WRONG_SHAKE_MS = 450; // 错满时等点错那张的抖动放完
const STAMP_MS = 1000;     // 盖章 + 震牌，然后才铺失败层
const SHAKE_MS = 600;      // 点错抖动标记的清理时间（web 同值）

// ---------- 棋盘几何（rpx）----------
const GAP = 12;             // web 的 gap: 6px
const PAD = 12;             // 棋盘外框内边距（web 的 padding: var(--gap)）
const TIP_BAND = 54;        // 提示条独占的空白带（web 的 28px）
const BOARD_MAX_W = 690;    // 游戏区内容宽
// 尺寸上限照抄 web：CELL_MAX / CARD_MAX_W / MAHJONG_MAX_W（96 / 64 / 60 px）
const CELL_MAX = 183;
const CARD_MAX_W = 122;
// 麻将牌上限：web 是 60px（115rpx），但 3 列的关卡会算出 206px 的窄棋盘，
// 胜利遮罩里的两颗按钮放不下会换行（用户报过）→ 放宽到 150rpx，3 列时棋盘 ≈277px
const MAHJONG_MAX_W = 150;
// 除棋盘外占掉的固定高度（rpx）：页面上内边距 27 + 统计条 168 + 间距 31 + 操作区 120 + 间距 31
//   + 提示带 54 + 右下角两颗悬浮按钮让出的位置。
// 关于最后一项：页面底部 padding 是 140rpx（全工程约定），但悬浮按钮组本身高
//   96（帮助）+ 24（间距）+ 96（模式）+ 16（底距）= 232rpx，
// 所以竖向预算要按 232 + 18 余量 = 250 让位，否则棋盘最底一行会压到「模式」那颗圆钮
// （短屏 375×667 上尤其明显）。代价：4 行牌的关卡在小屏上比 web 小 6~12%。
const FAB_CLEAR = 250;
const PAGE_FIXED_H = 27 + 168 + 31 + 120 + 31 + TIP_BAND + FAB_CLEAR;   // 681

// ---------- 牌面模式（三种牌面各自一套存档）----------
// 没改过（key 不存在）→ 用首页设置里的「默认牌面」；改过就按玩家自己的
const rawMode = getRaw(MODE_KEY);
const initialMode = rawMode == null ? FACE_TO_MODE[face.value] : +rawMode;
const mode = ref(initialMode === MODE_CARDS || initialMode === MODE_MAHJONG ? initialMode : MODE_EMOJI);

// emoji 沿用不带后缀的老 key（已玩过的进度不丢），扑克 _2、麻将 _3
const modeSuffix = () => (mode.value === MODE_EMOJI ? '' : `_${mode.value}`);
const levelKey = () => `${LEVEL_KEY}${modeSuffix()}`;
const bestKey = () => `${BEST_KEY}${modeSuffix()}`;

// ---------- 状态 ----------
const level = ref(0);
const bestLevel = ref(+(getRaw(bestKey()) || 0));
const phase = ref(MEMORY);
const board = ref([]);          // emoji: '🎃' / 扑克: { num, type } / 麻将: { suit, value }
const swappedIdx = ref(-1);     // 被偷换的那张
const shakeIdx = ref(-1);       // 本次点错的那张（驱动抖动）
const rightIdx = ref(-1);       // 本次点对的那张（驱动绿色高亮 + 弹一下）
const wrongIdxs = ref([]);      // 已标错的牌：常驻红标，且不再响应点击
const stampShown = ref(false);  // 章已盖上（驱动 stamp-in / stamp-shake）
const hearts = ref(HEARTS_MAX);
const elapsed = ref(0);
const confirming = ref(false);
const justWon = ref(false);
const helpOpen = ref(false);
const popping = ref(0);         // 掉心的那一片（放大淡出后变 🤍）

// ---------- 视口 / 尺寸 ----------
function readViewport() {
  // H5 的 innerHeight 含 uni 自带的导航栏（44px），小程序的 windowHeight 已经扣掉原生导航栏
  if (typeof window !== 'undefined' && window.innerWidth) {
    const head = typeof document !== 'undefined' ? document.querySelector('uni-page-head') : null;
    // 首帧 uni-page-head 可能还没挂上：先按默认 44px 估，onMounted 再用真实高度重算，
    // 不然首帧会把棋盘算大一圈、挂载后再缩小（看起来就是「先大后小」）
    const headH = head ? head.offsetHeight : 44;
    return { w: window.innerWidth, h: window.innerHeight - headH };
  }
  try {
    const s = uni.getSystemInfoSync();
    return { w: s.windowWidth || 393, h: s.windowHeight || 852 };
  } catch {
    return { w: 393, h: 852 };
  }
}
const vp = ref(readViewport());

const sizes = computed(() => (mode.value === MODE_CARDS ? CARD_SIZES : EMOJI_SIZES));
const memories = computed(() => (mode.value === MODE_CARDS ? CARD_MEMORIES : EMOJI_MEMORIES));
const modeName = computed(() => {
  if (mode.value === MODE_CARDS) return tt('modePoker');
  return mode.value === MODE_MAHJONG ? tt('modeMahjong') : tt('modeEmoji');
});
const size = computed(() => sizes.value[level.value] || EMOJI_SIZES[0]);
const rows = computed(() => size.value[0]);
const cols = computed(() => size.value[1]);

// 同一份数学同时受宽与高约束（照 web 的 metrics）：
//  - 宽：游戏区宽 − 外框左右内边距 − 列间缝，再按列均分
//  - 高：窗口高 − 固定块 − 外框上下内边距 − 行间缝，再按行均分；竖牌还要再除以宽高比
const metrics = computed(() => {
  const c = cols.value;
  const r = rows.value;
  const boxed = mode.value === MODE_CARDS ? CARD_RATIO : mode.value === MODE_MAHJONG ? MAHJONG_RATIO : 1;
  const cap = mode.value === MODE_CARDS ? CARD_MAX_W : mode.value === MODE_MAHJONG ? MAHJONG_MAX_W : CELL_MAX;
  const byW = (BOARD_MAX_W - PAD * 2 - (c - 1) * GAP) / c;
  const byH = (vp.value.h * (750 / vp.value.w) - PAGE_FIXED_H - PAD * 2 - (r - 1) * GAP) / r;
  const cell = Math.max(28, Math.min(cap, byW, Math.floor(byH / boxed)));
  return { cell, cellH: Math.round(cell * boxed) };
});
// 棋盘尺寸由内容反算（牌是绝对定位，撑不起父级），再 margin auto 居中
const boardW = computed(() => Math.round(PAD * 2 + cols.value * metrics.value.cell + (cols.value - 1) * GAP));
const boardH = computed(() => Math.round(PAD * 2 + rows.value * metrics.value.cellH + (rows.value - 1) * GAP));

// 牌的位置：与棋盘尺寸共用同一份 PAD / cell / GAP
function tileStyle(i) {
  const { cell, cellH } = metrics.value;
  const col = i % cols.value;
  const row = Math.floor(i / cols.value);
  return {
    width: `${cell}rpx`,
    height: `${cellH}rpx`,
    left: `${PAD + col * (cell + GAP)}rpx`,
    top: `${PAD + row * (cellH + GAP)}rpx`,
  };
}

// ---------- 字号（口径同 web：emoji 用 board 的 font-size，牌面用格子宽的比例）----------
const emojiFont = computed(() => {
  // web: font-size = calc(46px − cols×5px)，32 位换算 ≈ ×(750/390)
  const base = Math.round((46 - cols.value * 5) * (750 / 390));
  return Math.max(20, Math.min(base, Math.round(metrics.value.cell * 0.8)));
});
// 牌背图标：UnoCSS 图标自身是 1.2em，所以这里的字号 = web 的 font-size
// （emoji 模式 web 用继承的 board font-size；扑克模式 --back-size = 0.68×牌宽）
const backIcon = computed(() => (mode.value === MODE_CARDS
  ? Math.max(24, Math.round(metrics.value.cell * 0.68))
  : Math.max(24, Math.round(emojiFont.value))));
const rankFont = computed(() => Math.max(16, Math.round(metrics.value.cell * 0.26)));
const suitFont = computed(() => Math.max(24, Math.round(metrics.value.cell * 0.86)));
// 麻将牌面：宽 = 格子 − 2，高按 131:168 反算（两边都减 2 会把长宽比拉偏，牌面就偏了）
const mjSize = computed(() => {
  const ww = Math.max(8, metrics.value.cell - 2);
  const hh = Math.min(ww * TILE_RATIO, Math.max(8, metrics.value.cellH - 2));
  return { w: hh / TILE_RATIO, h: hh };
});
const mjW = computed(() => Math.round(mjSize.value.w));
const mjH = computed(() => Math.round(mjSize.value.h));
const stampMarkFont = computed(() => Math.max(20, Math.round(metrics.value.cell * 0.4)));
const stampTextFont = computed(() => Math.max(16, Math.round(metrics.value.cell * 0.15)));

// ---------- 结算前的三段停留（web 的 useResultDelay）----------
function makeDelay(ms) {
  const pending = ref(false);
  let timer = 0;
  const cancel = () => {
    clearTimeout(timer);
    timer = 0;
    pending.value = false;
  };
  const later = (fn) => {
    pending.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = 0;
      pending.value = false;
      fn();
    }, ms);
  };
  return { pending, later, cancel };
}
const settle = makeDelay(SETTLE_MS);
const stamp = makeDelay(WRONG_SHAKE_MS);
const lose = makeDelay(STAMP_MS);
const settling = settle.pending;
const stamping = stamp.pending;
const losing = lose.pending;
// 停留期间不能再点（但**不锁整个棋盘**：已标错的牌本来就单独挡着）
const locked = computed(() => settling.value || stamping.value || losing.value);

let memoryTimer = 0;
let flipTimer = 0;
let swapTimer = 0;
let tickTimer = 0;
let shakeTimer = 0;
let wonTimer = 0;
let popTimer = 0;

function clearTimers() {
  clearTimeout(memoryTimer);
  clearTimeout(flipTimer);
  clearTimeout(swapTimer);
  clearTimeout(shakeTimer);
  memoryTimer = flipTimer = swapTimer = shakeTimer = 0;
  settle.cancel();
  stamp.cancel();
  lose.cancel();
  stampShown.value = false;
  rightIdx.value = -1;
  shakeIdx.value = -1;
}

// ---------- 计时（web 的 shared/CountTimer：每秒 +1 并写存档，结算后停表）----------
const timeText = computed(() => {
  const sec = Math.max(0, Math.floor(elapsed.value));
  return ('00' + ~~(sec / 60)).slice(-2) + ':' + ('00' + (sec % 60)).slice(-2);
});
function startTick() {
  stopTick();
  tickTimer = setInterval(() => {
    if (phase.value === WON || phase.value === LOST) return;
    elapsed.value += 1;
    save();
  }, 1000);
}
function stopTick() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = 0;
}

// ---------- 掉心动画：刚失去的那颗先放大淡出，播完才变 🤍 ----------
const heartList = computed(() => {
  const out = [];
  for (let h = 1; h <= HEARTS_MAX; h += 1) {
    const pop = popping.value === h;
    const full = h <= hearts.value || pop;
    out.push({ h, full, popping: pop, dead: !full, text: full ? '❤️' : '🤍' });
  }
  return out;
});
watch(hearts, (now, was) => {
  clearTimeout(popTimer);
  popping.value = 0;
  if (!(now < was) || was < 1) return;   // 只有掉心才播
  popping.value = was;
  popTimer = setTimeout(() => { popping.value = 0; }, 450);
});

// ---------- 牌面工具 ----------
const pointOf = cell => (cell && cell.num ? CARD_RANKS[cell.num - 1] : '');
const suitOf = cell => (cell ? CARD_SUITS[cell.type] || '' : '');
const isRed = cell => !!cell && (cell.type === 'heart' || cell.type === 'diamond');
const isWrong = i => wrongIdxs.value.includes(i);
// 被换的那张：本次点对后立刻亮绿；结算（含重进存档）也保留
const isRevealed = i => i === swappedIdx.value
  && (rightIdx.value >= 0 || phase.value === WON || phase.value === LOST);

// 盘面内容：emoji 是字符串，扑克 { num, type }，麻将 { suit, value }
const keyOf = item => (typeof item === 'string'
  ? item
  : 'num' in item ? `${item.num}-${item.type}` : `${item.suit}${item.value}`);

function pickEmojis(n) {
  const pool = [...EMOJIS];
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const j = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(j, 1)[0]);
  }
  return out;
}
function drawCards(n) {
  const deck = [];
  CARD_TYPES.forEach((type) => {
    for (let num = 1; num <= 13; num += 1) deck.push({ num, type });
  });
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, n);
}
function drawTiles(n) {
  const pool = [...MAHJONG_FACES];
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const j = Math.floor(Math.random() * pool.length);
    out.push(faceOf(pool.splice(j, 1)[0]));
  }
  return out;
}
const newBoard = n => (mode.value === MODE_CARDS ? drawCards(n) : mode.value === MODE_MAHJONG ? drawTiles(n) : pickEmojis(n));

// 偷换成一张盘面上还没有的牌
function pickReplacement() {
  const used = new Set(board.value.map(keyOf));
  for (let t = 0; t < 200; t += 1) {
    const cand = mode.value === MODE_CARDS
      ? { num: 1 + Math.floor(Math.random() * 13), type: CARD_TYPES[Math.floor(Math.random() * CARD_TYPES.length)] }
      : mode.value === MODE_MAHJONG
        ? faceOf(MAHJONG_FACES[Math.floor(Math.random() * MAHJONG_FACES.length)])
        : EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    if (!used.has(keyOf(cand))) return cand;
  }
  return null;
}

// ---------- 存档（key 与 web 一字不差）----------
function save() {
  setRaw(levelKey(), JSON.stringify({
    level: level.value,
    hearts: hearts.value,
    phase: phase.value,
    time: elapsed.value,
    board: board.value,
    swapped: swappedIdx.value,
    wrong: wrongIdxs.value,
  }));
}

function restore() {
  const saved = getJSON(levelKey());
  if (!saved || typeof saved.level !== 'number') return false;
  level.value = Math.min(sizes.value.length - 1, Math.max(0, saved.level));
  // 结算局面（win / lost，以及「正在亮出正确答案」那一秒的心 0 存档）原样还原
  const over = saved.phase === WON || saved.phase === LOST
    || (saved.phase === ANSWER && saved.hearts === 0);
  if (over && Array.isArray(saved.board) && saved.board.length === rows.value * cols.value) {
    board.value = saved.board;
    swappedIdx.value = Number.isInteger(+saved.swapped) ? +saved.swapped : -1;
    wrongIdxs.value = Array.isArray(saved.wrong)
      ? saved.wrong.filter(i => Number.isInteger(+i)).map(Number)
      : [];
    shakeIdx.value = -1;
    rightIdx.value = -1;        // 还原出来的答案不算「本次点击」，不重播动画
    stampShown.value = false;   // 章由 phase === LOST 静态保留
    hearts.value = typeof saved.hearts === 'number' ? saved.hearts : HEARTS_MAX;
    phase.value = saved.phase === WON ? WON : LOST;
    elapsed.value = Math.max(0, Math.floor(Number(saved.time) || 0));
    stopTick();
    return true;
  }
  hearts.value = HEARTS_MAX;
  // 不恢复记忆 / 翻面中途：直接重开当前关（棋盘随机，公平）
  startLevel();
  return true;
}

// ---------- 关卡流程 ----------
function startLevel() {
  clearTimers();
  swappedIdx.value = -1;
  wrongIdxs.value = [];
  hearts.value = HEARTS_MAX;
  justWon.value = false;
  clearTimeout(wonTimer);
  board.value = newBoard(rows.value * cols.value);
  phase.value = MEMORY;
  elapsed.value = 0;
  startTick();
  const ms = memories.value[level.value] || 2000;
  memoryTimer = setTimeout(flipPhase, ms);
  save();
}

// 全部翻面；翻面过半时偷换一张（牌背朝上，玩家看不见替换瞬间），1s 后翻回
function flipPhase() {
  if (phase.value !== MEMORY) return;
  phase.value = FLIP;
  swapTimer = setTimeout(() => {
    if (phase.value !== FLIP) return;
    const idx = Math.floor(Math.random() * board.value.length);
    const replacement = pickReplacement();
    if (replacement == null) { startLevel(); return; }   // 极端兜底
    const next = board.value.slice();
    next[idx] = replacement;
    board.value = next;
    swappedIdx.value = idx;
  }, SWAP_AT);
  flipTimer = setTimeout(() => {
    if (phase.value !== FLIP) return;
    phase.value = ANSWER;
    save();
  }, FLIP_MS);
}

function onCellClick(i) {
  if (phase.value !== ANSWER) return;
  if (locked.value) return;              // 结算 / 盖章的停留期间不可操作
  if (wrongIdxs.value.includes(i)) return;   // 已标错的牌不再响应（同一张只能扣一次心）
  if (i === swappedIdx.value) {
    rightIdx.value = i;                  // 立刻亮绿，停留期间玩家看得到「选对了」
    playElimination();                   // 选对 = 一次消除
    settle.later(() => {
      phase.value = WON;
      stopTick();
      if (level.value + 1 > bestLevel.value) {
        bestLevel.value = level.value + 1;
        setRaw(bestKey(), bestLevel.value);
      }
      justWon.value = true;
      clearTimeout(wonTimer);
      wonTimer = setTimeout(() => { justWon.value = false; }, 4000);
      playWin();                         // web 在 confetti() 里播 success.mp3：同一个落点
      save();
    });
  } else {
    wrongIdxs.value = [...wrongIdxs.value, i];
    shakeIdx.value = i;
    hearts.value = Math.max(0, hearts.value - 1);
    playFail();                          // 扣 ❤️
    if (hearts.value <= 0) {
      // 生命耗尽：先等点错那张抖完 → 在正确答案上盖章 → 再铺失败层（web 的三段停留）
      stopTick();
      stamp.later(() => {
        stampShown.value = true;
        lose.later(() => { phase.value = LOST; playLose(); save(); });
      });
    }
    shakeTimer = setTimeout(() => {
      if (shakeIdx.value === i) shakeIdx.value = -1;
    }, SHAKE_MS);
    save();
  }
}

function nextLevel() {
  if (level.value < sizes.value.length - 1) level.value += 1;
  startLevel();
}
function retryLevel() {
  confirming.value = false;   // 从「新游戏」弹窗里点进来时也要把弹窗收掉
  startLevel();
}
function initGame() {
  level.value = 0;
  startLevel();
}
// 「新游戏」二次确认后：清掉当前牌面的最高关卡记录，从第 1 关重来（另两种牌面的记录不动）
function startNewGame() {
  confirming.value = false;
  setRaw(bestKey(), '');      // 空串在 core/storage 里读出来就是 null，等同 web 的 removeItem
  bestLevel.value = 0;
  initGame();
}
// 切换牌面 emoji → 扑克 → 麻将 → emoji：先把当前局面落档，再接着下一种牌面自己的存档
function toggleMode() {
  save();
  clearTimers();
  stopTick();
  mode.value = mode.value === MODE_EMOJI ? MODE_CARDS : mode.value === MODE_CARDS ? MODE_MAHJONG : MODE_EMOJI;
  setRaw(MODE_KEY, String(mode.value));
  bestLevel.value = +(getRaw(bestKey()) || 0);
  bootMode();
}
function bootMode() {
  if (!restore()) initGame();
}

// ---------- 文案 ----------
const phaseTipText = computed(() => {
  if (phase.value === MEMORY) return tt('phaseMemory');
  if (phase.value === FLIP) return tt('phaseFlip');
  if (phase.value === ANSWER) return tt(mode.value === MODE_EMOJI ? 'phaseAnswer' : 'phaseAnswerCard');
  return '';
});
// 帮助正文 = helpMsg + help1..N（web 的 HelpDialog 是「一段说明 + 编号列表」，这里用 \n\n 接起来）
const helpText = computed(() => ['helpMsg', 'help1', 'help2', 'help3', 'help4', 'help5']
  .map(k => tt(k))
  .join('\n\n'));
function showHelp() {
  helpOpen.value = true;
}

// ---------- 启动：能恢复结算局面就恢复，否则开新的一局 ----------
const restored = restore();
if (!restored) initGame();

function handleResize() {
  vp.value = readViewport();
}
onMounted(() => {
  vp.value = readViewport();
  if (typeof uni !== 'undefined' && uni.onWindowResize) uni.onWindowResize(handleResize);
});
onUnmounted(() => {
  clearTimers();
  stopTick();
  clearTimeout(wonTimer);
  clearTimeout(popTimer);
  if (typeof uni !== 'undefined' && uni.offWindowResize) uni.offWindowResize(handleResize);
});
</script>

<style lang="scss" scoped>
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
  gap: 31rpx;                    /* web 的 --row-gap: 16px */
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
  gap: 4rpx;
}
.stat-label {
  font-size: 23rpx;              /* 12px */
  color: #5f6b7a;
  line-height: 1.2;
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

/* 生命：逐颗 ❤️ / 🤍 + 掉心动画（web 的 shared/Hearts.vue 同款） */
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
@keyframes heart-pop {
  0% { transform: scale(1); opacity: 1; }
  40% { transform: scale(1.55); opacity: 1; }
  100% { transform: scale(2.1); opacity: 0; }
}

/* 操作区按 web 的 3.5 : 2.5 : 4 分格 */
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
  min-width: 0;
}
.start-wrapper {
  flex: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}
/* web 的 shared/CountTimer：图标 + MM:SS，14px / 600 */
.timer {
  display: flex;
  align-items: center;
  gap: 11rpx;                    /* web 的 gap: 6px */
  font-size: 27rpx;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.timer-ico { font-size: 29rpx; }
/* 主按钮：web 的 .game-icon（padding 8px 12px / 13px 粗体 / 8px 圆角，实测高 37px） */
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

/* ---------- 游戏区（web 的 .game-area：width fit-content + 顶部提示带） ---------- */
.game-area {
  position: relative;
  margin: 0 auto;
  padding-top: 54rpx;            /* = TIP_BAND，提示条落在这条带子里 */
  box-sizing: border-box;
}
/* web 的 .board-frame.dot-board：外框内边距 = 格子缝，背景 #bbada0 + 点阵 */
.board-frame {
  position: relative;
  box-sizing: border-box;
  /* ⚠️ 不要 padding：牌自己按 PAD 偏移（tileStyle 的 left/top 已含 PAD），
   * 外框再加一层会变「双份 PAD」→ 牌整体偏右下、右/下内距变 0（用户报过） */
  padding: 0;
  border-radius: 27rpx;          /* web 的 --card-radius */
  background-color: #bbada0;
  background-image: radial-gradient(circle, rgba(255, 255, 255, 0.18) 2rpx, transparent 2rpx);
  background-size: 19rpx 19rpx;  /* web 的 10px 一格 */
  background-position: 10rpx 10rpx;
}
.board {
  position: relative;
  width: 100%;
  height: 100%;
}

/* ---------- 牌：.tile（定位）> .flip（perspective）> 两个常驻 .face ---------- */
.tile {
  position: absolute;
  border-radius: 15rpx;          /* web 的 --radius-tile 8px */
  -webkit-tap-highlight-color: transparent;
}
.flip {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  perspective: 700rpx;           /* 唯一的 3D 舞台，不放动画 */
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
  border: 2rpx solid #c9d0da;    /* web 的 --tile-border-color */
  box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.12);   /* web 的 --shadow-soft */
  background: #fff;
  line-height: 1;
  transform: rotateY(0deg);
  /* 真 3D 翻转：两面各自绕 Y 轴转 180°（0.46s）；透明度 0.01s + 0.225s 延迟，
     正好在牌侧立 90° 那一刻瞬切 → 永远看不到镜像的背面。
     ⚠️ .face 上禁止 overflow:hidden（斜角会透出另一面），也不要 preserve-3d。 */
  transition-property: transform, opacity;
  transition-duration: 0.46s, 0.01s;
  transition-timing-function: ease-in-out, linear;
  transition-delay: 0s, 0.225s;
  /* AGENTS 第二十三节的兜底（真机翻面收尾偶尔闪一下）：背朝观众的面不画 + 两面常驻合成层 */
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
  -webkit-transform: translateZ(0);
  will-change: transform, opacity;
}
/* 默认必须「背面朝上」—— .up 表示翻开 */
.face-back {
  transform: rotateY(0deg);
  opacity: 1;
  background: #23804e;
  color: #fff;
}
.face-front {
  transform: rotateY(180deg);
  opacity: 0;
  background: #fff;
}
.tile.up .face-back {
  transform: rotateY(180deg);
  opacity: 0;
}
.tile.up .face-front {
  transform: rotateY(0deg);
  opacity: 1;
}
/* 牌面内容外边再包一层：抖动 / 弹一下 / 光环都动它，绝不动 .face 的翻面 transform */
.front-inner {
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
}
.back-ico { color: #fff; }       /* 图标放内层（i-xxx 会按 mask 裁形状），与 web 的绿底白图标一致 */
.emoji { line-height: 1; }

/* ---------- 扑克牌面（web 用 poker 的 CardItem mini；这里画一张等价的迷你牌） ---------- */
.board.poker .face-front,
.board.mahjong .face-front {
  /* 牌面整张交给内层（迷你牌 / 麻将图），外面这层只留翻面与高亮 */
  border: 0 none;
  background: transparent;
  box-shadow: none;
}
.face-back.poker-back {
  background: #fafafa;
  border-color: #dcdfe6;
  box-shadow: none;
  color: #9a9a9a;
}
.pc-back {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
}
.pc-back-fill {
  position: absolute;
  left: 2%;
  top: 2%;
  width: 96%;
  height: 96%;
  box-sizing: border-box;
  border: 2rpx dotted #eee;
  border-radius: 8rpx;
  background-image: radial-gradient(circle, #9a9a9a 1rpx, transparent 1rpx);
  background-size: 10rpx 10rpx;
}
.pc-back-ico {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  color: #9a9a9a;
}
.pcard {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  border: 2rpx solid #dcdfe6;
  border-radius: 8rpx;
  background: #fafafa;
  color: #111;
  overflow: hidden;              /* 裁的是牌自己的圆角（不在 .face 上） */
}
.pc-rank {
  position: absolute;
  font-weight: bold;
  line-height: 1;
}
.pc-rank-top { top: 8rpx; left: 8rpx; }
.pc-rank-bottom {
  bottom: 8rpx;
  right: 8rpx;
  transform: rotate(180deg);
}
.pc-suit {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-weight: bold;
  line-height: 1;
}
.pc-rank.red,
.pc-suit.red { color: #e00; }
/* 扑克牌面是透明的，红标 / 绿框画在牌外面一圈 */
.board.poker .face-front.wrong .pcard { box-shadow: 0 0 0 3rpx #b11; }
.board.poker .face-front.revealed .pcard { box-shadow: 0 0 0 3rpx #23804e; }

/* ---------- 麻将牌面（web 的 MahjongTile + 绿色纹理牌背） ---------- */
.face-back.mj-back {
  border: 0 none;
  box-shadow: none;
  background-color: #1f7a4d;
  /* 绿色底 + 45° 亮纹叠 -45° 暗纹，织出牌背的斜格纹理（与 web 的 shared/MahjongBack.vue 同款） */
  background-image:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.18) 0 5%, rgba(255, 255, 255, 0) 5% 12%),
    repeating-linear-gradient(-45deg, rgba(0, 0, 0, 0.12) 0 5%, rgba(0, 0, 0, 0) 5% 12%);
}
.face-back.mj-back::after {
  content: '';
  position: absolute;
  left: 6%;
  right: 6%;
  top: 7%;
  bottom: 7%;
  border-radius: 10rpx;
  border: 1px solid rgba(255, 255, 255, 0.24);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.12);
}
.mj {
  position: relative;
  border-radius: 10rpx;
}
/* 组件宿主也吃这份圆角（小程序多一层宿主，见 MahjongTile 的 :host 注释） */
.mj-face {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 10rpx;
  overflow: hidden;
}
/* 麻将牌面是圆角图，红标 / 绿框用外圈阴影画（跟着圆角走） */
.board.mahjong .face-front.wrong .mj { box-shadow: 0 0 0 3rpx #b11; }
.board.mahjong .face-front.revealed .mj { box-shadow: 0 0 0 3rpx #23804e; }

/* ---------- 选错 / 答对 / 盖章 ---------- */
.face-front.wrong {
  background: #fdeeee;           /* web 的 --del-bg */
  border-color: #b11;            /* web 的 --lose-color */
  box-shadow: inset 0 0 0 2rpx #b11;
}
.face-front.revealed {
  background: #e5f6ec;           /* web 的 --enter-bg */
  box-shadow: 0 0 0 2rpx #23804e;
}
/* 弹一下 + 绿色光环（web 的 App.vue 关键帧）；必须由「本次点击」驱动，不能挂在 .revealed 上 */
.tile.popping .front-inner {
  animation: pick-right-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), pick-right-ring 0.5s ease-out;
}
@keyframes pick-right-pop {
  0% { transform: scale(1); }
  30% { transform: scale(1.18); }
  58% { transform: scale(0.96); }
  78% { transform: scale(1.04); }
  100% { transform: scale(1); }
}
@keyframes pick-right-ring {
  0% { box-shadow: 0 0 0 0 #23804e, 0 0 10rpx 1rpx #23804e; }
  100% { box-shadow: 0 0 0 14rpx transparent, 0 0 0 0 transparent; }
}
/* 点错抖动（web 的 shake 0.4s，±4px） */
.tile.shaking .front-inner { animation: shake 0.4s ease; }
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-8rpx); }
  75% { transform: translateX(8rpx); }
}

/* 生命耗尽时盖在正确答案上的「✓」章：放大着斜着落下来（带一点回弹），像盖章一样 */
.stamp {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.stamp-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rpx;
  padding: 6rpx 14rpx;
  box-sizing: border-box;
  border: 2rpx solid #23804e;
  border-radius: 17rpx;          /* web 的 9px */
  /* 底色 40% 白：图案透得出来，章也还压得住（web 调过两轮后的最终值） */
  background: rgba(255, 255, 255, 0.4);
  color: #23804e;
  font-weight: 900;
  line-height: 1.05;
  transform: rotate(-12deg);     /* 盖章的手感：歪一点 */
  box-shadow: 0 2rpx 4rpx rgba(0, 0, 0, 0.12);
}
.stamp-text {
  letter-spacing: 1rpx;
  white-space: nowrap;
}
.tile.stamped .stamp {
  animation: stamp-in 0.42s cubic-bezier(0.22, 1.5, 0.44, 1) both;
}
/* 章落下之后这张牌再震一下 —— 动的是正面内层，不是翻面那层 */
.tile.stamped .front-inner { animation: stamp-shake 0.5s ease 0.45s; }
@keyframes stamp-in {
  0% { opacity: 0; transform: scale(2.4); }
  55% { opacity: 1; transform: scale(0.94); }
  78% { transform: scale(1.04); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes stamp-shake {
  0%, 100% { transform: translate(0, 0) rotate(0); }
  20% { transform: translate(-4rpx, 2rpx) rotate(-1.2deg); }
  45% { transform: translate(4rpx, -2rpx) rotate(1.2deg); }
  70% { transform: translate(-2rpx, 2rpx) rotate(-0.8deg); }
}

/* ---------- 阶段提示（浮在棋盘上方的空白带里） ---------- */
.phase-tip {
  position: absolute;
  top: 4rpx;
  left: 50%;
  transform: translateX(-50%);
  padding: 4rpx 27rpx;
  border-radius: 15rpx;
  background: #fff;
  color: #2c3e50;
  border: 2rpx solid #e1e1e1;
  font-size: 27rpx;              /* 14px */
  font-weight: 600;
  white-space: nowrap;
  z-index: 3;
}

/* ---------- 结算层（web 的 .result：正好盖住棋盘外框） ---------- */
.result {
  position: absolute;
  /* 结算层：宽度至少容得下「重玩本关 + 下一关」两颗按钮（实测 ≈221px），
     否则窄棋盘（麻将 2×2 只有 176px）会把按钮挤到换行 */
  left: 50%;
  transform: translateX(-50%);
  top: 0;
  width: 100%;
  min-width: 480rpx;
  max-width: 702rpx;
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
  color: #12833f;                /* web 的 --win-color（失败层也是这个色） */
  font-weight: bold;
  font-size: 34rpx;              /* 18px */
}
.result-main { font-size: 34rpx; }
/* 最窄的棋盘（麻将 1×3 只有 393rpx 宽）上两颗结算按钮可能刚好超出遮罩内宽：
   允许换行，别让按钮被挤到圆角外（按钮尺寸仍走 App.vue 的全局规格） */
.result-btns {
  flex-wrap: wrap;                /* 极窄棋盘（麻将 2×2 只有 176px）允许换行，绝不溢出圆角 */
  row-gap: 12rpx;
}

/* ---------- 新游戏二次确认（本地版 ConfirmDialog，与麻将英雄同一套） ---------- */
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
</style>
