<template>
  <view class="screen">
    <!-- 全站背景（粒子连线 + 底部过山车，与 web 的 ParticleBackground 同款） -->
    <ParticleBackground />
    <view class="page">
      <!-- 统计条：关卡 / 剩余卡片（label 的 emoji 在字典原文里，与 web 的 score-area 一致）+ 本关进度条 -->
      <view class="card score-area">
        <view class="stat">
          <text class="stat-label">{{ tt('level') }}</text>
          <text class="stat-value">{{ level }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('remain') }}</text>
          <text class="stat-value">{{ tiles.length }}</text>
        </view>
        <view class="progress"><view class="progress-bar" :style="{ width: progress + '%' }" /></view>
      </view>

      <!-- 操作区：盘面信息（层数 · 种类）+ 新游戏（web 的 opt-area，1.6 : 1.2 分格） -->
      <view class="card opt-area">
        <view class="opt-half">
          <text class="level-note">{{ boardLabel }}</text>
        </view>
        <view class="divider" />
        <view class="start-wrapper">
          <button class="game-icon" hover-class="none" @click="confirming = true">{{ tt('start') }}</button>
        </view>
      </view>

      <!-- 游戏区：本身是一张带底色 + 点阵的卡片（web 的 .board-wrap.dot-board）；
           宽高都由「14 单位 × 单位边长」反算，托盘同理，底部留 140rpx 让开悬浮按钮 -->
      <view id="board-wrap" class="board-wrap" :style="boardWrapStyle">
        <view class="board">
          <view
            v-for="tile in tiles"
            :key="tile.id"
            class="tile"
            :class="[{ covered: !freeSet.has(tile.id) }, mode]"
            :style="tileStyle(tile)"
            :hover-class="freeSet.has(tile.id) ? 'tile-press' : 'none'"
            @click="pick(tile)"
          >
            <!-- 三种牌面：麻将（雪碧图牌面，131:168）/ 扑克（迷你牌，2:3）/ emoji（字符） -->
            <view
              v-if="isMahjong"
              class="mj-box"
              :style="{ width: layout.mjTile.w + 'rpx', height: layout.mjTile.h + 'rpx' }"
            >
              <MahjongTile :suit="faceOf(tile.emoji).suit" :value="faceOf(tile.emoji).value" />
            </view>
            <view
              v-else-if="isPoker"
              class="pcard"
              :class="{ red: isRedCard(tile.emoji) }"
              :style="pokerBoxStyle(layout.pokerTile)"
            >
              <text class="pnum pnum-top" :style="{ fontSize: layout.pokerTile.num + 'rpx' }">{{ pointOf(tile.emoji) }}</text>
              <text class="psuit" :style="{ fontSize: layout.pokerTile.suit + 'rpx' }">{{ suitOf(tile.emoji) }}</text>
              <text class="pnum pnum-bot" :style="{ fontSize: layout.pokerTile.num + 'rpx' }">{{ pointOf(tile.emoji) }}</text>
            </view>
            <text v-else class="tile-face">{{ tile.emoji }}</text>
          </view>
        </view>

        <!-- 结算层：盖住棋盘（与 .board-wrap 同矩形，web 的 .result / win-pop） -->
        <view
          v-if="phase === WON || phase === OVER"
          class="result"
          :class="[phase === WON ? 'win' : 'lose', { pop: resultPop }]"
        >
          <template v-if="phase === WON">
            <text class="result-main">🎉🎉 {{ tt('tipWin') }} 🎉🎉</text>
            <text class="result-note">{{ tt('levelDone').replace('{n}', level) }}</text>
            <view class="result-btns">
              <button class="btn ghost" hover-class="none" @click="replayLevel">{{ tt('replayLevel') }}</button>
              <button class="btn" hover-class="none" @click="nextLevel">{{ tt('nextLevel') }}</button>
            </view>
          </template>
          <template v-else>
            <text class="result-main">👻👻 {{ tt('tipLost') }} 👻👻</text>
            <text class="result-note">{{ tt('level') }} {{ level }}</text>
            <view class="result-btns">
              <button class="btn ghost" hover-class="none" @click="replayLevel">{{ tt('replayLevel') }}</button>
            </view>
          </template>
        </view>
      </view>

      <!-- 收集槽（7 格）：槽位底板形状跟着牌面走（emoji 方牌 / 扑克 2:3 / 麻将 131:168） -->
      <view class="card tray" :style="trayStyle">
        <view
          v-for="i in TRAY_SIZE"
          :key="'slot-' + i"
          class="slot"
          :style="slotStyle(i - 1)"
        >
          <view class="slot-shape" :style="slotShapeStyle" />
        </view>
        <view
          v-for="(card, idx) in tray"
          :key="card.uid"
          class="tray-card"
          :class="[mode, { clearing: card.clearing, fresh: card.fresh }]"
          :style="trayCardStyle(idx)"
        >
          <view
            v-if="isMahjong"
            class="mj-box"
            :style="{ width: layout.mjSlot.w + 'rpx', height: layout.mjSlot.h + 'rpx' }"
          >
            <MahjongTile :suit="faceOf(card.emoji).suit" :value="faceOf(card.emoji).value" />
          </view>
          <view
            v-else-if="isPoker"
            class="pcard"
            :class="{ red: isRedCard(card.emoji) }"
            :style="pokerBoxStyle(layout.pokerSlot)"
          >
            <text class="pnum pnum-top" :style="{ fontSize: layout.pokerSlot.num + 'rpx' }">{{ pointOf(card.emoji) }}</text>
            <text class="psuit" :style="{ fontSize: layout.pokerSlot.suit + 'rpx' }">{{ suitOf(card.emoji) }}</text>
            <text class="pnum pnum-bot" :style="{ fontSize: layout.pokerSlot.num + 'rpx' }">{{ pointOf(card.emoji) }}</text>
          </view>
          <text v-else class="tile-face">{{ card.emoji }}</text>
        </view>
      </view>
    </view>

    <!-- 飞行卡：页面坐标系里的绝对定位替身（小程序没有 DOM 克隆 / Web Animations API）。
         起点 / 终点都由布局算式给（rpx，与 .screen 同一坐标系）：
         外层只动 left/top（位移），内层只动 scale（缩到托盘卡大小），两个过渡互不干扰 -->
    <view
      v-for="f in flights"
      :key="'fly-' + f.uid"
      class="fly-card"
      :class="mode"
      :style="flyCardStyle(f)"
    >
      <view class="fly-inner" :style="flyInnerStyle(f)">
        <view
          v-if="isMahjong"
          class="mj-box"
          :style="{ width: f.face.w + 'rpx', height: f.face.h + 'rpx' }"
        >
          <MahjongTile :suit="faceOf(f.emoji).suit" :value="faceOf(f.emoji).value" />
        </view>
        <view
          v-else-if="isPoker"
          class="pcard"
          :class="{ red: isRedCard(f.emoji) }"
          :style="pokerBoxStyle(f.face)"
        >
          <text class="pnum pnum-top" :style="{ fontSize: f.face.num + 'rpx' }">{{ pointOf(f.emoji) }}</text>
          <text class="psuit" :style="{ fontSize: f.face.suit + 'rpx' }">{{ suitOf(f.emoji) }}</text>
          <text class="pnum pnum-bot" :style="{ fontSize: f.face.num + 'rpx' }">{{ pointOf(f.emoji) }}</text>
        </view>
        <text v-else class="tile-face" :style="{ fontSize: f.face.fs + 'rpx' }">{{ f.emoji }}</text>
      </view>
    </view>

    <!-- 胜利彩带（纯 CSS 版；只在真正赢下那一刻放，恢复存档的胜利态不放） -->
    <Confetti v-if="justWon" />

    <!-- 右下角悬浮按钮：模式在左、帮助在最右（FloatingActions 是横向排列），按钮上无文字 -->
    <FloatingActions>
      <view class="fab" @click="switchMode">
        <view v-if="mode === MODE_EMOJI" class="fab-ico i-mdi-emoticon-happy-outline" />
        <view v-else-if="mode === MODE_POKER" class="fab-ico i-mdi-cards-playing-outline" />
        <view v-else class="fab-ico i-dinkie-icons-three-of-circles-mahjong" />
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
          <button class="confirm-replay" hover-class="none" @click="replayLevel">{{ tt('confirmReplay') }}</button>
          <button class="confirm-ok" hover-class="none" @click="startNewGame">{{ tt('confirmOk') }}</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
// 消除大师 · 微信小程序版（web 的 src/games/master/MasterGame.vue 移植）
// 玩法逻辑与 board.js 完全一致（逐字节复制）：分层堆叠 + 遮挡判定（freeIds）+ 7 格收集槽三消 +
// 可解发牌 + 同一套关卡曲线。与 web 的差异只在平台能力：
// - 存档：localStorage → @/core/storage（key 与 web 一字不差：__emoji_master__mode /
//   __emoji_master__level|state / __emoji_master__poker_level|state / __emoji_master__mahjong_level|state）
// - 音效：Web Audio → @/core/sfx（消除 playElimination / 过关 playWin / 失败 playLose，落点同 web）
// - 飞牌：web 是 Teleport + getBoundingClientRect + Web Animations API；小程序用 fixed 替身 +
//   selectorQuery 量矩形（拿不到就按布局算式兜底）+ CSS transition on transform
// - 模式开关 + 帮助：web 在 TopHeader 里，小程序移到右下角悬浮按钮（模式在左、帮助在最右）
// - 卡片层数类 depth-N（web 里只作样式钩子、没有任何 CSS 用到）没有搬
// - **不是全局锁**：连点时每张牌各播一条独立飞行（flights 数组互不等待），只挡已被消费的那几张
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

import Confetti from '@/components/Confetti.vue';
import FloatingActions from '@/components/FloatingActions.vue';
import HelpSheet from '@/components/HelpSheet.vue';
import MahjongTile from '@/components/MahjongTile.vue';
import { setNavTitle } from '@/core/i18n';
import { face } from '@/core/settings';
import { playElimination, playLose, playWin } from '@/core/sfx';
import { getJSON, getRaw, setRaw } from '@/core/storage';
import { EMOJIS } from '@/shared/emojis';
import { MAHJONG_FACES, faceOf } from '@/shared/mahjongFaces';
import { TILE_RATIO } from '@/shared/mahjongTiles';
import {
  UNITS, TRAY_SIZE, FACE_RATIO,
  MODE_EMOJI, MODE_POKER, MODE_MAHJONG, MODE_ORDER,
  freeIds, generateTiles, insertIndex, levelConfig,
} from './board';
import { tt } from './i18n';
import ParticleBackground from '@/components/ParticleBackground.vue';

// 原生导航栏标题跟随语言（pages.json 里的标题是静态的）
setNavTitle(() => tt('gameTitle'));

const [PLAY, WON, OVER] = ['play', 'won', 'over'];
// 存档 key 与 web 完全一致；三种牌面的进度 / 局面各一套，切模式只换读写的那套 key
const KEY_PREFIX = '__emoji_master__';
const MODE_KEY = `${KEY_PREFIX}mode`;     // 上次用的牌面模式（三种模式共享这一个偏好）
const MODE_KEYS = {
  [MODE_EMOJI]: { level: `${KEY_PREFIX}level`, state: `${KEY_PREFIX}state` },
  [MODE_POKER]: { level: `${KEY_PREFIX}poker_level`, state: `${KEY_PREFIX}poker_state` },
  [MODE_MAHJONG]: { level: `${KEY_PREFIX}mahjong_level`, state: `${KEY_PREFIX}mahjong_state` },
};

// 扑克牌面的池子：52 张（'h7' = 红桃 7；h 红桃 / d 方块 / s 黑桃 / c 梅花），
// 渲染时用 pointOf / suitOf 拆成点数与花色文字（web 用 poker 的 CardItem 画牌，
// 小程序这边和对对碰 / 猎手 / 侦探一样自绘一张迷你牌，避免为了当「面」再移植一个翻牌组件）
const POKER_SUITS = { h: 'heart', d: 'diamond', s: 'spade', c: 'club' };
const POKER_FACES = Object.keys(POKER_SUITS).flatMap(t => Array.from({ length: 13 }, (_, i) => `${t}${i + 1}`));
const POKER_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_TEXT = { heart: '♥', diamond: '♦', spade: '♠', club: '♣' };
const POKER_INSET = 0.88;         // web 的 POKER_INSET：扑克牌比格子小一圈
const pointOf = key => POKER_RANKS[+String(key).slice(1) - 1] || '';
const suitOf = key => SUIT_TEXT[POKER_SUITS[String(key)[0]]] || '';
const isRedCard = key => ['h', 'd'].includes(String(key)[0]);

const FLY_MS = 260;      // 卡片从原位飞入收集槽
const CLEAR_MS = 560;    // 三消卡片：先闪烁再消失
const WIN_DELAY = 620;   // 最后一组三消闪烁完再弹结算层

// ---------- 尺寸口径（与 web 同一套 px 公式，落样式时换成 rpx） ----------
const BOARD_PAD = 8;        // web 的 BOARD_PAD = 8px
const TRAY_GAP = 6;         // web 的槽位间距 6px
const TRAY_PAD = 8;         // web 的 .tray padding 8px
const PAGE_TOP_RPX = 27 + 168 + 31 + 120 + 31;   // 盘面以上：页面 padding + 统计条 + 间距 + 操作区 + 间距
const PAGE_BOTTOM_RPX = 140;                     // 底部留白（让开右下角悬浮按钮）
const MIN_BOARD_RPX = 380;                       // 极端矮屏兜底

// 移动端没有 innerWidth 时也给个合理默认；H5 的 innerHeight 含 uni 自带导航栏，要扣掉
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

// 「牌面模式」必须在 level 之前初始化：loadLevel() 要按模式选 key（反过来是 TDZ）
function loadMode() {
  const m = getRaw(MODE_KEY);
  // 没改过 → 用首页设置里的牌面偏好；改过就完全按他自己的
  if (m === null) return MODE_ORDER.includes(face.value) ? face.value : MODE_EMOJI;
  return MODE_ORDER.includes(m) ? m : MODE_EMOJI;
}
const mode = ref(loadMode());
const isMahjong = computed(() => mode.value === MODE_MAHJONG);
const isPoker = computed(() => mode.value === MODE_POKER);
const levelKey = () => MODE_KEYS[mode.value].level;
const stateKey = () => MODE_KEYS[mode.value].state;

const level = ref(loadLevel());
const tiles = ref([]);
const tray = ref([]);
const phase = ref(PLAY);
// 连点保护：每次点击当场接受并各自播一条飞行（互不等待），同时把槽位预留出来
const flights = ref([]);
const confirming = ref(false);
const gameId = ref(0);
// 彩带 / 结算层动画只在「真正发生」的那一刻播：恢复存档的结算态不播（web 的老约定）
const justWon = ref(false);
const resultPop = ref(false);
let wonTimer = null;

// 卡片 id 全局自增：web 用 `${gameId}-${tile.id}` 拼 key 来强制重播入场动画，
// 小程序里 :key 走 wx:key，用「全局唯一的数字 id」更稳（重开一关 id 必变 → 节点重建 → 动画重播）
let tileSeq = 0;
let winTimer = null;

// 牌面池：emoji 用共享表，扑克 52 张，麻将 34 种
const pool = computed(() => {
  if (isMahjong.value) return MAHJONG_FACES;
  if (isPoker.value) return POKER_FACES;
  return EMOJIS;
});

// ---------- 布局：全部由内容反算（§零 第 2 条） ----------
function pokerSize(w, h) {
  // web 的 pokerSize：高取格子高的 0.88（并受 0.88 宽 × 1.5 约束），宽按 2:3 反算
  const hh = Math.max(15, Math.min(h * POKER_INSET, (w * POKER_INSET) * 1.5));
  const ww = Math.max(11, hh * 2 / 3);
  return { w: ww, h: hh };
}
// 迷你扑克牌的一组尺寸（宽高 / 圆角 / 角标字号 / 中央花色字号），rpx 口径
function pokerVars(w, h) {
  const { w: ww, h: hh } = pokerSize(w, h);
  return {
    w: ww,
    h: hh,
    r: Math.max(4, Math.round(ww * 0.07)),
    num: Math.max(11, Math.round(ww * 0.3)),
    suit: Math.max(15, Math.round(ww * 0.62)),
  };
}
function pokerBoxStyle(v) {
  return {
    width: +(+v.w).toFixed(2) + 'rpx',
    height: +(+v.h).toFixed(2) + 'rpx',
    borderRadius: +(+v.r).toFixed(2) + 'rpx',
  };
}

const conf = computed(() => levelConfig(level.value, mode.value));
const boardLabel = computed(() => {
  const c = conf.value;
  return `${tt('layersLabel').replace('{n}', c.layers)} · ${tt('kindsLabel').replace('{n}', c.kinds)}`;
});

const layout = computed(() => {
  const vw = viewport.value.w || 393;
  const vh = viewport.value.h || 780;
  const k = 750 / vw;                                  // rpx / px
  const pad = Math.round(BOARD_PAD * k);
  const gap = Math.round(TRAY_GAP * k);
  const trayPad = Math.round(TRAY_PAD * k);
  const border = Math.max(2, Math.round(k));           // web 的 1px 描边
  const avail = 690;                                   // 卡片宽（web 的 calc(100% - 32px)）
  // 收集槽：web 的 slot 公式（可用宽 − 托盘左右内边距 − 6 条缝）/ 7
  const slot = (avail - trayPad * 2 - gap * (TRAY_SIZE - 1)) / TRAY_SIZE;
  const trayH = slot + trayPad * 2;
  // 盘面 14×14 单位见方：宽吃满卡片，高还要能单屏放下（底部 140rpx + 31rpx 间距 + 托盘）
  // H5 的 innerHeight 含 uni 自带导航栏（head），要扣掉才是真正可用高（小程序 windowHeight 已扣过）
  const budgetH = (vh - (viewport.value.head || 0)) * k
    - (PAGE_TOP_RPX + 31 + trayH + PAGE_BOTTOM_RPX + 12);
  const boardSize = Math.max(MIN_BOARD_RPX, Math.min(avail, budgetH));
  const unit = (boardSize - pad * 2) / UNITS;
  const pitch = conf.value.pitch;
  const tileW = pitch.x * unit - border * 2;
  const tileH = pitch.y * unit - border * 2;
  const mj = mode.value === MODE_MAHJONG;
  const pk = mode.value === MODE_POKER;
  // 托盘卡的宽度跟着牌面比例走（emoji 方牌 / 扑克 2:3 / 麻将 131:168），在方形槽位里水平居中
  const slotW = slot * (mj ? FACE_RATIO : pk ? 2 / 3 : 1);
  // 牌面盒子：麻将「盒 − 2（描边）」，高按 131:168 反算 —— 两边都减会把长宽比拉偏
  const mjTile = { w: tileW - border * 2, h: 0 };
  mjTile.h = Math.min(mjTile.w * TILE_RATIO, tileH - border * 2);
  const mjSlot = { w: slotW - border * 2, h: 0 };
  mjSlot.h = Math.min(mjSlot.w * TILE_RATIO, slot - border * 2);
  // 槽位底板尺寸必须等于「真正显示出来的那张牌」（三种模式各不相同）
  const shape = pk
    ? pokerSize(slotW, slot)
    : mj
      ? (() => {
        const hh = Math.min((slotW - border * 2) * TILE_RATIO, slot - border * 2);
        return { w: hh / TILE_RATIO, h: hh };
      })()
      : { w: slotW, h: slot };
  return {
    k,
    pad,
    gap,
    border,
    avail,
    slot,
    slotW,
    trayH,
    boardSize,
    unit,
    tileW,
    tileH,
    faceFs: Math.round(unit),            // web 的 --tile-fs = round(2u × 0.5)
    trayFs: Math.round(slot * 0.52),
    mjTile,
    mjSlot,
    pokerTile: pokerVars(tileW, tileH),
    pokerSlot: pokerVars(slotW, slot),
    shape,
    shapeRadius: pk
      ? Math.max(4, Math.round(shape.w * 0.07))
      : mj
        ? shape.w * 0.09
        : 15,
    tileRadius: mj ? mjTile.w * 0.09 + border : 15,
    trayRadius: mj ? mjSlot.w * 0.09 + border : 15,
  };
});

const boardWrapStyle = computed(() => {
  const L = layout.value;
  return {
    width: +L.boardSize.toFixed(2) + 'rpx',
    height: +L.boardSize.toFixed(2) + 'rpx',
    padding: L.pad + 'rpx',
  };
});
const trayStyle = computed(() => {
  const L = layout.value;
  return {
    width: L.avail + 'rpx',
    height: +L.trayH.toFixed(2) + 'rpx',
  };
});

// 盘面卡片：位置 = 格坐标 × 单位 + 1px 描边（与 web 的 tileStyle 同一份数学）
function tileStyle(tile) {
  const L = layout.value;
  const style = {
    left: +(tile.x * L.unit + L.border).toFixed(2) + 'rpx',
    top: +(tile.y * L.unit + L.border).toFixed(2) + 'rpx',
    width: +L.tileW.toFixed(2) + 'rpx',
    height: +L.tileH.toFixed(2) + 'rpx',
    borderRadius: +L.tileRadius.toFixed(2) + 'rpx',
    zIndex: tile.layer + 1,
    fontSize: L.faceFs + 'rpx',
  };
  const d = revealDelay(tile);
  if (d) style.animationDelay = d + 'ms';
  return style;
}
function trayCardStyle(idx) {
  const L = layout.value;
  return {
    left: +(L.pad + idx * (L.slot + L.gap) + (L.slot - L.slotW) / 2).toFixed(2) + 'rpx',
    top: L.pad + 'rpx',
    width: +L.slotW.toFixed(2) + 'rpx',
    height: +L.slot.toFixed(2) + 'rpx',
    borderRadius: +L.trayRadius.toFixed(2) + 'rpx',
    fontSize: L.trayFs + 'rpx',
  };
}
function slotStyle(idx) {
  const L = layout.value;
  return {
    left: +(L.pad + idx * (L.slot + L.gap)).toFixed(2) + 'rpx',
    top: L.pad + 'rpx',
    width: +L.slot.toFixed(2) + 'rpx',
    height: +L.slot.toFixed(2) + 'rpx',
  };
}
const slotShapeStyle = computed(() => {
  const L = layout.value;
  return {
    width: +L.shape.w.toFixed(2) + 'rpx',
    height: +L.shape.h.toFixed(2) + 'rpx',
    borderRadius: +L.shapeRadius.toFixed(2) + 'rpx',
  };
});

// 当前可点击（亮色）的卡片
const freeSet = computed(() => freeIds(tiles.value, conf.value.pitch));
const activeTray = computed(() => tray.value.filter(c => !c.clearing).length);
// 本关进度：已消除 / 本关总卡片
const progress = computed(() => {
  const total = conf.value.tiles;
  if (!total) return 0;
  const left = tiles.value.length + tray.value.filter(c => !c.clearing).length;
  return Math.max(0, Math.min(100, Math.round(((total - left) / total) * 100)));
});

// ---------- 逐张入场（自下层向上层堆叠、同层按生成顺序） ----------
const REVEAL_STEP = 10;
const REVEAL_LAYER = 70;
const revealRank = new Map();     // 卡片 id -> 同层内的出场顺序
function revealBoard() {
  revealRank.clear();
  const perLayer = new Map();
  tiles.value.forEach((tile) => {
    const n = perLayer.get(tile.layer) || 0;
    perLayer.set(tile.layer, n + 1);
    revealRank.set(tile.id, n);
  });
}
function revealDelay(tile) {
  return tile.layer * REVEAL_LAYER + (revealRank.get(tile.id) || 0) * REVEAL_STEP;
}

// ---------- 关卡 / 新游戏 ----------
function loadLevel() {
  const saved = +(getRaw(levelKey()) || 1);
  return saved >= 1 ? saved : 1;
}
function persistLevel(lv) {
  setRaw(levelKey(), lv);
}

function initLevel(lv) {
  clearTimeout(winTimer);
  winTimer = null;
  level.value = Math.max(1, lv);
  persistLevel(level.value);
  const { tiles: list } = generateTiles(pool.value, level.value, mode.value);
  // id 全局唯一（见文件头注释）：存档里仍然只存这个数字，语义与 web 相同
  list.forEach((t) => { t.id = ++tileSeq; });
  tiles.value = list;
  tray.value = [];
  phase.value = PLAY;
  flights.value = [];
  confirming.value = false;
  justWon.value = false;
  resultPop.value = false;
  gameId.value += 1;
  revealBoard();
  saveState();
}

// 「新游戏」= 清除闯关记录、回到第 1 关（需二次确认）
function startNewGame() {
  confirming.value = false;
  setRaw(levelKey(), '');
  initLevel(1);
}
function nextLevel() {
  initLevel(level.value + 1);
}
function replayLevel() {
  confirming.value = false;
  initLevel(level.value);
}

// 切换牌面模式：三种模式的进度 / 盘面 / 收集槽各自独立（key 分开），另一个模式一个字都不动
function switchMode() {
  if (phase.value === PLAY) saveState();
  const at = MODE_ORDER.indexOf(mode.value);
  const next = MODE_ORDER[(at + 1) % MODE_ORDER.length];
  mode.value = next;
  setRaw(MODE_KEY, next);
  clearTimeout(winTimer);
  winTimer = null;
  tiles.value = [];
  tray.value = [];
  flights.value = [];
  phase.value = PLAY;
  justWon.value = false;
  resultPop.value = false;
  level.value = loadLevel();
  if (!restore()) initLevel(level.value);
}

// ---------- 点击卡片 ----------
function pick(tile) {
  if (phase.value !== PLAY) return;
  if (!freeSet.value.has(tile.id)) return;
  // 飞行中的牌也算占用，连点仍然不会冲过 7 格
  if (tray.value.length + flights.value.length >= TRAY_SIZE) return;
  if (flights.value.some(f => f.uid === tile.id)) return;
  const at = tiles.value.findIndex(t => t.id === tile.id);
  if (at < 0) return;
  const snap = { ...tiles.value[at] };
  // 立即从盘面移除：遮挡关系随之更新，其它卡片被点亮（filter 渐变）
  tiles.value.splice(at, 1);

  flights.value.push(makeFlight(snap));
  // ⚠️ 必须拿数组里的响应式代理去改字段（直接改 push 进去的原始对象不会触发重渲染）
  const flight = flights.value[flights.value.length - 1];
  fly(flight);
}

// 飞行卡的牌面尺寸（任意盒子 → 内层牌面），与 layout 里同一套式子
function faceVarsRpx(w, h) {
  if (isMahjong.value) {
    const b2 = layout.value.border * 2;
    const ww = w - b2;
    return { w: ww, h: Math.min(ww * TILE_RATIO, h - b2) };
  }
  if (isPoker.value) return pokerVars(w, h);
  return { fs: Math.round(h * 0.5) };
}

// 起点 = 盘面上这张牌自己的矩形（与 tileStyle 共用同一份 PAD / unit / border 数学）
function makeFlight(snap) {
  const L = layout.value;
  return {
    uid: snap.id,
    emoji: snap.emoji,
    gen: gameId.value,
    left: (750 - L.boardSize) / 2 + L.pad + snap.x * L.unit + L.border,
    top: PAGE_TOP_RPX + L.pad + snap.y * L.unit + L.border,
    w: L.tileW,
    h: L.tileH,
    scale: 1,
    face: faceVarsRpx(L.tileW, L.tileH),
    go: false,
  };
}

// 目标槽位中心（与 trayCardStyle 共用同一份数学：托盘卡就居中在槽位里）
function slotCenter(idx) {
  const L = layout.value;
  return {
    cx: (750 - L.avail) / 2 + L.pad + idx * (L.slot + L.gap) + L.slot / 2,
    cy: PAGE_TOP_RPX + L.boardSize + 31 + L.pad + L.slot / 2,
  };
}

function flyCardStyle(f) {
  return {
    left: +f.left.toFixed(2) + 'rpx',
    top: +f.top.toFixed(2) + 'rpx',
    width: +f.w.toFixed(2) + 'rpx',
    height: +f.h.toFixed(2) + 'rpx',
    transition: f.go
      ? `left ${FLY_MS}ms cubic-bezier(0.35, 0.75, 0.4, 1), top ${FLY_MS}ms cubic-bezier(0.35, 0.75, 0.4, 1)`
      : 'none',
  };
}
function flyInnerStyle(f) {
  return {
    transform: `scale(${f.scale})`,
    transition: f.go ? `transform ${FLY_MS}ms cubic-bezier(0.35, 0.75, 0.4, 1)` : 'none',
  };
}

// 单条飞行：先落原位、下一拍再改 transform（同一拍改不会触发过渡），结束即落格
async function fly(flight) {
  await nextTick();
  await sleep(20);
  const others = flights.value.filter(f => f.uid !== flight.uid);
  const virtualTray = [...tray.value, ...others.map(f => ({ emoji: f.emoji }))];
  const idx = insertIndex(virtualTray, flight.emoji);
  const to = slotCenter(idx);
  const L = layout.value;
  // 落点 = 槽位中心；缩放 = 托盘卡宽 / 盘面卡宽（三种模式都对齐托盘卡的真实宽度）
  flight.left = +(to.cx - flight.w / 2).toFixed(2);
  flight.top = +(to.cy - flight.h / 2).toFixed(2);
  flight.scale = +(L.slotW / flight.w).toFixed(4);
  flight.go = true;

  await sleep(FLY_MS);
  // 期间开了新局 / 恢复存档 / 已结算 → 这次落格作废，直接撤掉飞行卡
  if (flight.gen !== gameId.value || phase.value !== PLAY) {
    flights.value = flights.value.filter(f => f.uid !== flight.uid);
    return;
  }
  // 落格要「先插托盘卡、等它渲染出来，再撤飞行卡」，否则中间至少有一帧两张都不在（会闪）
  // fresh 让这张卡跳过 card-pop（它是飞进来的）
  tray.value.splice(insertIndex(tray.value, flight.emoji), 0, {
    uid: flight.uid, emoji: flight.emoji, clearing: false, fresh: true,
  });
  await nextTick();
  flights.value = flights.value.filter(f => f.uid !== flight.uid);
  saveState();
  settle();
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// ---------- 结算 ----------
// 三消自动消除；槽满且无消除则失败；盘面与收集槽都空则获胜。
// 多张牌可以同时在飞、各自落格，所以这里加重入保护：结算中来牌只置标记，跑完再补一轮
let settling = false;
let settleAgain = false;

async function settle() {
  if (settling) {
    settleAgain = true;
    return;
  }
  settling = true;
  try {
    do {
      settleAgain = false;
      await settlePass();
    } while (settleAgain && phase.value === PLAY);
  } finally {
    settling = false;
  }
}

async function settlePass() {
  // 只在「还没进入消除动画」的卡片里找三消：上一组正在闪时新落下的一组也能结算
  const counts = new Map();
  tray.value.filter(c => !c.clearing).forEach((c) => {
    counts.set(c.emoji, (counts.get(c.emoji) || 0) + 1);
  });
  const hit = [...counts.entries()].find(([, n]) => n >= 3);
  if (hit) {
    const emoji = hit[0];
    const picked = tray.value.filter(c => c.emoji === emoji && !c.clearing).slice(0, 3);
    picked.forEach((c) => { c.clearing = true; });
    playElimination();
    await sleep(CLEAR_MS);
    const uids = new Set(picked.map(c => c.uid));
    tray.value = tray.value.filter(c => !uids.has(c.uid));
    settleAgain = true;
    return;
  }
  if (activeTray.value >= TRAY_SIZE) {
    lose();
    return;
  }
  // 还有牌在飞的时候不能判定通关（盘面已空但牌还没落完）
  if (!tiles.value.length && !activeTray.value && !flights.value.length) win();
}

function win() {
  if (phase.value !== PLAY || winTimer) return;
  persistLevel(level.value + 1);
  // 彩带 + playWin 只在真正赢下这一刻（web 的 confetti() 内部就是 celebrate → playWin）
  justWon.value = true;
  clearTimeout(wonTimer);
  wonTimer = setTimeout(() => { justWon.value = false; }, 4000);
  playWin();
  // 等最后一组三消闪烁消失后再弹结算层；出现后再落盘，退出重进还是这个结算层
  winTimer = setTimeout(() => {
    winTimer = null;
    phase.value = WON;
    resultPop.value = true;
    saveWinState();
  }, WIN_DELAY);
}

function lose() {
  if (phase.value !== PLAY) return;
  removeState();
  phase.value = OVER;
  resultPop.value = true;
  playLose();
}

// ---------- 存档 ----------
function removeState() {
  setRaw(stateKey(), '');
}
function saveState() {
  if (phase.value !== PLAY) return;
  // 盘面与收集槽都空了 = 本局已结束（胜利结算层有延迟，期间不再落盘）
  if (!tiles.value.length && !tray.value.length) {
    removeState();
    return;
  }
  setRaw(stateKey(), JSON.stringify({
    level: level.value,
    tiles: tiles.value.map(t => [t.id, t.emoji, t.layer, t.x, t.y]),
    tray: tray.value.map(c => [c.uid, c.emoji]),
  }));
}
// 胜利结算局面：盘面与槽都空了，只记「第几关 + 已过关」；必须在 phase 切到 WON 之后写
function saveWinState() {
  if (phase.value !== WON) return;
  setRaw(stateKey(), JSON.stringify({
    level: level.value,
    phase: WON,
    tiles: [],
    tray: [],
  }));
}

function restore() {
  const saved = getJSON(stateKey());
  if (!saved || !Array.isArray(saved.tiles) || !Array.isArray(saved.tray)) return false;
  // 胜利结算局面：恢复关卡与结算层即可，由玩家自己决定点「下一关」还是回主页
  if (saved.phase === WON) {
    level.value = Math.max(1, Math.floor(+saved.level) || loadLevel());
    tiles.value = [];
    tray.value = [];
    flights.value = [];
    clearTimeout(winTimer);
    winTimer = null;
    justWon.value = false;
    resultPop.value = false;
    phase.value = WON;
    return true;
  }
  const list = saved.tiles.map(t => ({ id: +t[0], emoji: String(t[1]), layer: +t[2], x: +t[3], y: +t[4] }));
  const ok = list.length > 0
    && list.every(t => t.id > 0 && t.emoji && t.layer >= 0 && t.x >= 0 && t.y >= 0)
    && new Set(list.map(t => t.id)).size === list.length;
  if (!ok) return false;
  const cards = saved.tray.map(c => ({ uid: +c[0], emoji: String(c[1]), clearing: false }));
  if (cards.length > TRAY_SIZE) return false;
  tiles.value = list;
  tray.value = cards;
  // 恢复出来的 id 已经用掉，之后的关卡要接着往后编号
  list.forEach((t) => { tileSeq = Math.max(tileSeq, t.id); });
  cards.forEach((c) => { tileSeq = Math.max(tileSeq, c.uid); });
  phase.value = PLAY;
  clearTimeout(winTimer);
  winTimer = null;
  flights.value = [];
  justWon.value = false;
  resultPop.value = false;
  level.value = Math.max(1, Math.floor(+saved.level) || loadLevel());
  persistLevel(level.value);
  gameId.value += 1;
  revealBoard();      // 恢复存档也逐张堆叠出来（web 同行为）
  return true;
}

// 任何盘面 / 收集槽变化都实时落盘，退出回主页后可恢复
watch([tiles, tray], saveState, { deep: true });

onMounted(() => {
  if (!restore()) initLevel(level.value);
});

onUnmounted(() => {
  clearTimeout(winTimer);
  clearTimeout(wonTimer);
});

// ---------- 帮助 / 二次确认 ----------
const helpOpen = ref(false);
function showHelp() {
  helpOpen.value = true;
}
// 帮助文案 = web cn 段的 helpMsg + help1..N（\n\n 连接，HelpSheet 会拆成段落）
const helpText = computed(() => ['helpMsg', 'help1', 'help2', 'help3', 'help4']
  .map(k => tt(k))
  .filter(v => v && !['helpMsg', 'help1', 'help2', 'help3', 'help4'].includes(v))
  .join('\n\n'));
</script>

<style lang="scss" scoped>
/* ---------- keyframes（web 的逐条搬过来，duration 不变） ---------- */
@keyframes master-tile-in {
  from { opacity: 0; transform: scale(0.6); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes master-card-pop {
  from { opacity: 0; transform: scale(0.5); }
  to { opacity: 1; transform: scale(1); }
}
/* 三消：先闪两下，再旋转缩小消失（0.56s = CLEAR_MS） */
@keyframes master-card-clear {
  0% { opacity: 1; transform: scale(1); }
  15% { opacity: 0.12; transform: scale(1.14); }
  30% { opacity: 1; transform: scale(1); }
  45% { opacity: 0.12; transform: scale(1.14); }
  60% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(0.2) rotate(20deg); }
}
@keyframes master-result-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 一页只允许一处 min-height: 100vh（就在 .screen 上） */
.screen {
  position: relative;            /* 飞行卡的绝对定位坐标系（= 页面内容左上角） */
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
/* 本关进度条：贴在统计卡底边（web 的 .progress / .progress-bar） */
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

/* ---------- 操作区（高度由 App.vue 的全局 .opt-area 给） ---------- */
.opt-area {
  width: 690rpx;
  display: flex;
  align-items: center;
  padding: 0 19rpx;
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
/* 主按钮：web 的 .game-icon（8px 12px / 14px 粗体 / 8px 圆角） */
.game-icon {
  margin: 0;
  padding: 0 23rpx;
  height: 71rpx;
  line-height: 71rpx;
  border: 0;
  border-radius: 15rpx;
  background: #23804e;
  color: #fff;
  font-size: 25rpx;
  font-weight: bold;
  white-space: nowrap;
  box-sizing: border-box;
}

/* ---------- 游戏区：带底色 + 点阵的卡片（web 的 .board-wrap.dot-board） ---------- */
.board-wrap {
  position: relative;
  margin: 0 auto;
  box-sizing: border-box;
  border-radius: 27rpx;
  background-color: #bbada0;
  background-image: radial-gradient(circle, rgba(255, 255, 255, 0.18) 2rpx, transparent 2rpx);
  background-size: 19rpx 19rpx;  /* web 的 10px 一格 */
  background-position: 10rpx 10rpx;
  /* 卡片带 z-index（层数），用 isolation 把层叠限制在本区域内 */
  isolation: isolate;
  z-index: 0;
}
.board {
  position: relative;
  width: 100%;
  height: 100%;
}

/* ---------- 盘面卡片（扁平：底色 + 描边 + 一层柔和阴影） ---------- */
.tile {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 15rpx;          /* web 的 --radius-tile 8px */
  background: #fff;
  border: 2rpx solid #c9d0da;
  box-shadow: 0 4rpx 23rpx rgba(0, 0, 0, 0.08);
  line-height: 1;
  -webkit-tap-highlight-color: transparent;
  animation: master-tile-in 0.22s ease backwards;
  /* 亮色 ⇄ 被遮挡之间走渐变（被遮挡缓缓变暗、重新可点缓缓变亮） */
  transition: filter 0.32s ease, box-shadow 0.32s ease;
}
/* 按下反馈（hover-class；被压住的牌不给） */
.tile-press {
  transform: scale(0.93);
}
/* 被上层卡片遮挡：变暗、不可点（点不动由 pick() 里 freeSet 判定，不锁整盘） */
.tile.covered {
  filter: brightness(0.5) saturate(0.45);
}
/* 扑克模式：卡片盒让开（底色 / 描边 / 阴影全部不要），整张牌交给迷你牌自己画 */
.tile.poker,
.tray-card.poker:not(.clearing),
.fly-card.poker .fly-inner {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}
.tile-face {
  line-height: 1;
}
/* 麻将牌面盒子：圆角从卡片盒继承（MahjongTile 的 .mj-wrap 再 border-radius: inherit），
   中间不隔这一层的话 inherit 会拿到 0 → 雪碧图方角从卡片圆角里漏出来 */
.mj-box {
  display: flex;
  border-radius: inherit;
  overflow: hidden;              /* 雪碧图的方角在这里裁成卡片的圆角 */
}

/* ---------- 迷你扑克牌（web 用 poker 的 CardItem mini：白底 + 细边 + 角标点数 + 中央花色） ---------- */
.pcard {
  position: relative;
  box-sizing: border-box;
  overflow: hidden;              /* 裁的是牌自己的圆角 */
  background: #fafafa;
  border: 2rpx solid #dcdfe6;
  color: #111;
}
.pcard.red {
  color: #e00;
}
.pnum {
  position: absolute;
  font-weight: bold;
  line-height: 1;
}
.pnum-top {
  top: 8rpx;
  left: 8rpx;
}
.pnum-bot {
  bottom: 8rpx;
  right: 8rpx;
  transform: rotate(180deg);
}
.psuit {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-weight: bold;
  line-height: 1;
}

/* ---------- 收集槽 ---------- */
.tray {
  position: relative;
  box-sizing: border-box;
}
.slot {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
}
.slot-shape {
  box-sizing: border-box;
  background: rgba(238, 228, 218, 0.35);
  box-shadow: inset 0 0 0 2rpx #e1e1e1;
}
.tray-card {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 15rpx;
  background: #fff;
  border: 2rpx solid #c9d0da;
  box-shadow: 0 4rpx 23rpx rgba(0, 0, 0, 0.08);
  line-height: 1;
  z-index: 2;
  transition: left 0.22s ease;
  animation: master-card-pop 0.2s ease backwards;
}
/* 刚由飞行卡落格的：位置尺寸已对齐，不能再播一次 card-pop（否则交接处会闪） */
.tray-card.fresh {
  animation: none;
}
/* 凑满三张：闪烁两下后旋转缩小消失（时长与 CLEAR_MS 一致） */
.tray-card.clearing {
  z-index: 3;
  border-color: #23804e;
  box-shadow: 0 0 0 4rpx #23804e, 0 4rpx 23rpx rgba(0, 0, 0, 0.08);
  animation: master-card-clear 0.56s ease-in-out forwards;
}

/* ---------- 飞行卡：绝对定位在 .screen 的坐标系里（页面滚动也不会错位） ---------- */
.fly-card {
  position: absolute;
  z-index: 60;
  box-sizing: border-box;
  pointer-events: none;
}
/* 视觉卡片放在内层：缩放时底色 / 描边 / 阴影跟着一起缩（不是只缩内容） */
.fly-inner {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  border-radius: 15rpx;
  background: #fff;
  border: 2rpx solid #c9d0da;
  line-height: 1;
  box-shadow: 0 4rpx 23rpx rgba(0, 0, 0, 0.08);
  will-change: transform;
}

/* ---------- 结算层：与 .board-wrap 完全同矩形 ---------- */
.result {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  z-index: 30;                   /* 必须高于棋盘卡片（层数 1~8） */
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
}
.result.lose {
  color: #b11;
}
.result-note {
  color: #2c3e50;
  font-size: 27rpx;              /* 14px */
  font-weight: 600;
  opacity: 0.75;
}
/* 只有「真打完这一局」才播入场：恢复存档的结算态直接静态呈现 */
.result.pop {
  animation: master-result-in 0.28s ease both;
}
.result.pop .result-main,
.result.pop .result-note,
.result.pop .result-btns {
  animation: master-card-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
/* 棋盘可能比 web 窄（矮屏会被高度约束），两颗按钮放不下时换行而不是溢出 */
.result .result-btns {
  flex-wrap: wrap;
}
/* 结算按钮的基础规格（最终尺寸 / 配色由 App.vue 的全局 .result .btn 统一覆盖） */
.btn {
  margin: 0;
  padding: 0 24rpx;
  height: 64rpx;
  line-height: 64rpx;
  border: 0 none;
  border-radius: 14rpx;
  background: #23804e;
  color: #fff;
  font-size: 24rpx;
  font-weight: 700;
  white-space: nowrap;
}

/* ---------- 新游戏二次确认（与消消乐 / 侦探同一套本地弹窗） ---------- */
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
