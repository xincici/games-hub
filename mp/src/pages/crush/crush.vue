<template>
  <view class="screen">
    <!-- 全站背景（粒子连线 + 底部过山车，与 web 的 ParticleBackground 同款） -->
    <ParticleBackground />
    <view class="page">
      <!-- 分数区：关卡 / 剩余步数 / 得分 / 目标分（web 的 score-area，四格 + 底部过关进度条） -->
      <view class="card score-area">
        <view class="stat">
          <text class="stat-label">{{ tt('levelLabel') }}</text>
          <text class="stat-value">{{ level }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('movesLabel') }}</text>
          <text class="stat-value">{{ moves }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('score') }}</text>
          <text class="stat-value">{{ score }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('targetLabel') }}</text>
          <text class="stat-value">{{ conf.target }}</text>
        </view>
        <view class="progress"><view class="progress-bar" :style="{ width: progress + '%' }" /></view>
      </view>

      <!-- 操作区：盘面信息 + 新游戏（web 的 opt-area，1.6 : 1.2 分格） -->
      <view class="card opt-area">
        <view class="opt-half">
          <text class="level-note">{{ boardLabel }}</text>
        </view>
        <view class="divider" />
        <view class="start-wrapper">
          <button class="game-icon" @click="confirming = true">{{ tt('start') }}</button>
        </view>
      </view>

      <!-- 游戏区：棋盘外框（点阵底纹）+ 内容反算的棋盘；结算层与庆祝浮字都盖在这里 -->
      <view class="game-area" :style="gameAreaStyle">
        <view id="crush-frame" class="board-frame" :class="{ shaking }" :style="frameStyle">
          <view
            id="crush-board"
            class="board"
            :class="{ celebrating }"
            :style="boardStyle"
            @touchstart="onTouchStart"
            @touchmove.stop.prevent="onTouchMove"
            @touchend="onTouchEnd"
            @touchcancel="onTouchEnd"
          >
            <!-- 背景格：绝对定位，与 gem 共用同一份 cell/gap 数学 -->
            <view
              v-for="(cell, idx) in cells"
              :key="'bg-' + idx"
              class="cell"
              :class="{ wall: isWall(cell) }"
              :style="cellStyle(idx)"
              @click="onCellClick(idx)"
            />
            <view
              v-for="gem in gems"
              :key="gem.id"
              class="gem"
              :class="gemClasses(gem)"
              :style="gemStyle(gem.idx, gem.dealIdx)"
              @click="onCellClick(gem.idx)"
            >
              <text class="face">{{ faceOf(gem.value) }}</text>
              <!-- 冰块：半透明冰蓝玻璃盖在 emoji 上（下面那种 emoji 依然看得见） -->
              <view v-if="isFrozen(gem.value)" class="ice">
                <text class="ice-flake">❄</text>
              </view>
              <!-- 解冻那一瞬：冰层裂开、飞出一圈冰屑（只在 thawSet 期间存在） -->
              <view v-if="isThawing(gem.idx)" class="ice-shards">
                <view
                  v-for="(sh, si) in ICE_SHARDS"
                  :key="si"
                  class="shard"
                  :style="shardStyle(sh)"
                />
              </view>
            </view>
          </view>
        </view>

        <!-- 大消 / 连锁的即时庆祝：中间弹出文字（两者同时达成时分两行）+ 本次得分 -->
        <view
          v-for="c in celebrationList"
          :key="c.id"
          class="celebrate"
          :class="'tier-' + c.tier"
        >
          <text v-for="(line, i) in c.lines" :key="i" class="celebrate-text">{{ line }}</text>
          <text class="celebrate-score">+{{ c.gained }}</text>
        </view>

        <!-- 结算层：与游戏区矩形完全重合 -->
        <view v-if="phase === WON" class="result win">
          <text class="result-title">🎉🎉 {{ tt('levelDone').replace('{n}', level) }} 🎉🎉</text>
          <text class="final-score">{{ score }}</text>
          <view class="result-btns">
            <button class="btn ghost" @click="replayLevel">{{ tt('replayLevel') }}</button>
            <button class="btn" @click="nextLevel">{{ tt('nextLevel') }}</button>
          </view>
        </view>
        <view v-else-if="phase === OVER" class="result lose">
          <text class="result-title">👻👻 {{ tt('gameover') }} 👻👻</text>
          <text class="final-score">{{ score }} / {{ conf.target }}</text>
          <view class="result-btns">
            <button class="btn ghost" @click="replayLevel">{{ tt('replayLevel') }}</button>
          </view>
        </view>
      </view>
    </view>

    <!-- 胜利彩带（纯 CSS 降级版，web 是 canvas confetti；只在真正赢下那一刻放） -->
    <Confetti v-if="justWon" />
    <!-- 多消 / 连锁的小烟花：web 的 burstConfetti（默认喷发点 = 屏幕中间偏下） -->
    <FireworkBurst />
    <FloatingActions>
      <!-- 本游戏没有模式切换，右下角只有帮助 -->
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
// Emoji 消消乐 · 微信小程序版
// 玩法逻辑逐行对照 web 的 src/games/crush/CrushGame.vue（关卡曲线 / 盘面生成 / 交换 / 连锁结算 /
// 计分 / 空闲提示 / 庆祝浮字 / 存档字段都一致），平台差异只有这几处：
// - 指针事件（Pointer Events）→ touchstart / touchmove / touchend + click（小程序没有 pointer 事件）；
// - 棋盘不再用 CSS grid + CSS 变量定位 → 绝对定位 + rpx 内联尺寸（真机上 flex/grid 的 gap 不可靠，
//   背景格与 gem 共用同一份 PAD/step 数学）；
// - 尺寸仍按 web 同一口径算（可用宽 = 卡片宽 690rpx / 最大 440px、可用高 = 视口高-固定高度、96px 上限），
//   另外给右下角悬浮按钮留出底部 140rpx（页面 padding-bottom + 高度预留）；
// - localStorage → @/core/storage（key 与 web 一字不差：__emoji_crush__*）；
// - Web Audio → @/core/sfx；彩带 / 庆祝浮字照搬（彩带只在真正赢下那一刻放，恢复存档不放）；
// - 新游戏的二次确认用本地三按钮弹窗（web 的 shared/ConfirmDialog 三按钮版；小程序没有共享弹窗）。
// - **不是全局锁**：连锁结算期间玩家点别的牌照样能选中，交换会先记下来、等盘面稳定立刻执行；
//   真正挡住的只有「本轮已被消费（matched / blasting）的那几张牌」（见 onCellClick / trySwap）。
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';

import Confetti from '@/components/Confetti.vue';
import FireworkBurst from '@/components/FireworkBurst.vue';
import FloatingActions from '@/components/FloatingActions.vue';
import HelpSheet from '@/components/HelpSheet.vue';
import { getJSON, getRaw, setRaw } from '@/core/storage';
import { playElimination, playLose, playWin } from '@/core/sfx';
import { burstConfetti } from '@/core/firework';
import { EMOJIS } from '@/shared/emojis';
import {
  WALL, BOMB, WILD, isWall, isFrozen, frozenKind, thawTargets, applyThaw,
  levelConfig, generateBoard, findMatches, explode,
  hasMatchAfterSwap, adjacent, hasAnyMove, applyGravity, isTile,
  scoreForMatches, scoreForBlast, reshuffle,
} from './board';
import { tt } from './i18n';
import { setNavTitle } from '@/core/i18n';
import ParticleBackground from '@/components/ParticleBackground.vue';

// 原生导航栏标题跟随语言（pages.json 里的标题是静态的）
setNavTitle(() => tt('gameTitle'));

// 闯关制：每关在限定步数内达到目标分即可过关，面板从 7×7 长到 9×10 后固定
const [PLAY, WON, OVER] = ['play', 'won', 'over'];
// 存档 key 与 web 完全一致（web 的 CrushGame.vue 里是 localStorage 同名 key）
const KEY_PREFIX = '__emoji_crush__';
const LEVEL_KEY = `${KEY_PREFIX}level`;          // 当前关卡
const BEST_KEY = `${KEY_PREFIX}best_1`;          // 历史最高关卡（沿用「前缀+难度数字」以便连点标题清记录）
const STATE_KEY = `${KEY_PREFIX}state`;
const BOMB_FACE = '💣';
const WILD_FACE = '💎';

// ---------- 尺寸（px 口径与 web 一致，落样式时换成 rpx） ----------
const GAP = 4;                 // web 的 GAP = 4px（格与格之间）
const FRAME_PAD = 8;           // web 的 .board-frame padding: 8px
const MAX_CELL = 96;           // web 的单格上限 96px
// 棋盘以上：上 padding 27 + 统计条 168 + 间距 31 + 操作区 120 + 间距 31（都是 rpx）
const PAGE_TOP_RPX = 27 + 168 + 31 + 120 + 31;
const PAGE_BOTTOM_RPX = 140;   // 页面底部留白，让开右下角悬浮按钮
const MIN_AVAIL_H = 240;       // 视口再矮也不把棋盘算成负数

const IDLE_HINT_MS = 6000;
const HINT_MS = 2600;          // 三次呼吸（0.8s × 3，CSS 里同值）+ 一点余量
// 解冻时飞散的冰屑：每条 [横向, 纵向, 自转角度, 缩放]，位移单位是「格」
const ICE_SHARDS = [
  [-0.74, -0.6, -150, 0.95],
  [0.68, -0.74, 130, 1.05],
  [-0.86, 0.22, -85, 0.7],
  [0.8, 0.52, 165, 0.85],
  [0.04, -0.94, -35, 0.6],
  [-0.26, 0.86, 65, 0.75],
];

function loadLevel() {
  return Math.max(1, Math.floor(+(getRaw(LEVEL_KEY) || 1)) || 1);
}

const level = ref(loadLevel());
const bestLevel = ref(Math.max(level.value, Math.floor(+(getRaw(BEST_KEY) || 1)) || 1));
const cells = ref([]);
const gems = ref([]);
let gemId = 0;

const phase = ref(PLAY);
const score = ref(0);
const moves = ref(0);
const selected = ref(-1);
const swapPair = ref([]);
const matchedSet = ref(new Set());
// 本轮刚解冻的格子（冰层裂开 + 冰屑飞散，用自己的定时器回收）
const thawSet = ref(new Set());
const blastSet = ref(new Set());
const hugeClear = ref(false);
const shaking = ref(false);
const celebrating = ref(false);
const confirming = ref(false);
// 彩带只在真正赢下的那一刻放：恢复存档的胜利态不放（与 web 一致）
const justWon = ref(false);
// 大消 / 连锁庆祝：{ id, tier, gained, lines }
const celebration = ref(null);
let celebrationId = 0;

const conf = computed(() => levelConfig(level.value));
// 盘面上的真实墙数（生成时按关卡配置随机撒，极少数情况下会少一两面，所以直接数盘面）
const wallCount = computed(() => cells.value.filter(isWall).length);
const boardLabel = computed(() => {
  const c = conf.value;
  const parts = [`${c.cols}×${c.rows}`, tt('kindsLabel').replace('{n}', c.kinds)];
  if (wallCount.value) parts.push(tt('wallsLabel').replace('{n}', wallCount.value));
  return parts.join(' · ');
});
const target = computed(() => conf.value.target);
const progress = computed(() => Math.min(100, Math.round((score.value / target.value) * 100)));
const celebrationList = computed(() => (celebration.value ? [celebration.value] : []));

// ---------- 视口 / 棋盘尺寸 ----------
// H5 的 innerHeight 含 uni 自带导航栏（44px），小程序 windowHeight 已扣掉原生导航栏
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

// 内容反算：先按 web 同一口径求单格 px（宽度、高度、96px 上限三者取最小），再换成 rpx。
// 棋盘 / 外框尺寸全部由它推出来，绝不写死大容器（§零 第 2 条）。
const layout = computed(() => {
  const vw = viewport.value.w || 393;
  const vh = viewport.value.h || 761;
  const k = 750 / vw;
  const { cols, rows } = conf.value;
  // 卡片宽 690rpx（= web 的 calc(100% - 32px)，最大 440px）；棋盘外框不能比卡片宽
  const availW = Math.min(690 / k, 440);
  // 视口高扣掉「棋盘以上」与「底部让开悬浮按钮」两段（rpx → px），另留 12rpx 余量消化取整
  const availH = Math.max(MIN_AVAIL_H, vh - (PAGE_TOP_RPX + PAGE_BOTTOM_RPX + 12) / k);
  const cell = Math.max(
    14,                             // 极端矮屏的兜底（正常 375×667 起都远大于它）
    Math.min(
      MAX_CELL,
      Math.floor((availW - FRAME_PAD * 2 - (cols - 1) * GAP) / cols),
      Math.floor((availH - FRAME_PAD * 2 - (rows - 1) * GAP) / rows),
    ),
  );
  const gapR = Math.round(GAP * k);
  const padR = Math.round(FRAME_PAD * k);
  // 换回 rpx 后再按「卡片宽」夹一次，保证取整后外框也不会超过 690rpx
  const maxCellR = Math.floor((690 - padR * 2 - (cols - 1) * gapR) / cols);
  const cellR = Math.max(20, Math.min(Math.round(cell * k), maxCellR));
  const boardW = cols * cellR + (cols - 1) * gapR;
  const boardH = rows * cellR + (rows - 1) * gapR;
  return {
    cols,
    rows,
    cell: cellR,
    gap: gapR,
    pad: padR,
    boardW,
    boardH,
    frameW: boardW + padR * 2,
    frameH: boardH + padR * 2,
    font: Math.round(cellR * 0.55),   // web 的 --font = cell * 0.55
  };
});

const gameAreaStyle = computed(() => ({
  width: '690rpx',                        // web 的 .game-area = 卡片宽（遮罩也盖这么宽）
  height: layout.value.frameH + 'rpx',
}));
const frameStyle = computed(() => ({
  width: layout.value.frameW + 'rpx',
  height: layout.value.frameH + 'rpx',
  padding: layout.value.pad + 'rpx',
}));
const boardStyle = computed(() => ({
  width: layout.value.boardW + 'rpx',
  height: layout.value.boardH + 'rpx',
}));

function cellStyle(idx) {
  const l = layout.value;
  const c = idx % l.cols;
  const r = ~~(idx / l.cols);
  return {
    width: l.cell + 'rpx',
    height: l.cell + 'rpx',
    left: c * (l.cell + l.gap) + 'rpx',
    top: r * (l.cell + l.gap) + 'rpx',
  };
}

function gemStyle(idx, dealIdx) {
  const l = layout.value;
  const c = idx % l.cols;
  const r = ~~(idx / l.cols);
  const style = {
    width: l.cell + 'rpx',
    height: l.cell + 'rpx',
    left: c * (l.cell + l.gap) + 'rpx',
    top: r * (l.cell + l.gap) + 'rpx',
    fontSize: l.font + 'rpx',      // 字号内联给，不依赖 CSS 变量（--cell/--font）
  };
  // 发牌：错峰序号 = 行 + 列（左上 → 右下的斜向波浪，每档 16ms）
  if (dealIdx !== undefined) style.animationDelay = dealIdx * 16 + 'ms';
  return style;
}

function shardStyle(sh) {
  // 自定义属性一律给字符串：部分小程序运行时会按「长度」给数字补 px，那会破坏 keyframes 里的 calc
  return { '--sx': String(sh[0]), '--sy': String(sh[1]), '--sr': sh[2] + 'deg', '--ss': String(sh[3]) };
}

// ---------- 空闲提示 ----------
// 6s 没有任何操作 → 找一对能消的交换，让这两张牌的 emoji 大幅呼吸三下，
// 同时牌面底色脉冲发光；呼吸完收起，之后又静置 6s 还没动作就换另一对提示
const hintSwap = ref(null);      // { a, b } 两个格子的下标
let lastHints = [];              // 最近提示过的几对（避免连着几次都是同一对）
let idleTimer = null;
let hintTimer = null;

// 任何玩家交互后调用：收起提示并重新起 6s 计时。
// keepLast=true 用在提示自然播完那一次——保留上一对，下一次好换一对
function pokeIdle(keepLast = false) {
  hintSwap.value = null;
  if (!keepLast) lastHints = [];
  clearTimeout(idleTimer);
  clearTimeout(hintTimer);
  if (phase.value !== PLAY) return;
  idleTimer = setTimeout(showHint, IDLE_HINT_MS);
}

const isHinted = idx => !!hintSwap.value && (hintSwap.value.a === idx || hintSwap.value.b === idx);

const samePair = (p, q) => !!q
  && ((p.a === q.a && p.b === q.b) || (p.a === q.b && p.b === q.a));

// 扫出所有能消的交换，取「消得最多」的那一档；同档里随机挑一个，
// 并排除最近提示过的那几对（都排除完了才退回到只排除上一次）
function pickHint() {
  const { cols, rows } = conf.value;
  const board = cells.value;
  const found = [];
  for (let i = 0; i < board.length; i++) {
    if (!isTile(board[i])) continue;
    const r = ~~(i / cols);
    const c = i % cols;
    const pairs = [];
    if (c + 1 < cols) pairs.push([i, i + 1]);
    if (r + 1 < rows) pairs.push([i, i + cols]);
    for (const [a, b] of pairs) {
      if (!hasMatchAfterSwap(board, cols, rows, a, b)) continue;
      const trial = [...board];
      [trial[a], trial[b]] = [trial[b], trial[a]];
      found.push({ a, b, size: findMatches(trial, cols, rows).size });
    }
  }
  if (!found.length) return null;
  found.sort((x, y) => y.size - x.size);
  const fresh = found.filter(p => !lastHints.some(h => samePair(p, h)));
  const list = fresh.length ? fresh : found.filter(p => !samePair(p, lastHints[0]));
  const pool = list.length ? list : found;
  const top = pool.filter(p => p.size === pool[0].size);
  return top[~~(Math.random() * top.length)];
}

function showHint() {
  // 发牌 / 连锁结算中不打扰，等盘面稳定后再来
  if (phase.value !== PLAY || busy || dealing) {
    idleTimer = setTimeout(showHint, IDLE_HINT_MS);
    return;
  }
  const pick = pickHint();
  if (!pick) {
    idleTimer = setTimeout(showHint, IDLE_HINT_MS);
    return;
  }
  hintSwap.value = { a: pick.a, b: pick.b };
  lastHints = [hintSwap.value, ...lastHints].slice(0, 3);
  hintTimer = setTimeout(() => pokeIdle(true), HINT_MS);
}

// ---------- 时间 / 标记 ----------
let busy = false;          // 交换 / 连锁结算中（只影响交换，选择照常 —— 不是输入锁）
let dealing = false;       // 发牌入场动画中（只用来压住空闲提示）
let dealTimer = null;
let stepTimer = null;
let resetTimer = null;
let shakeTimer = null;
let shakeResetTimer = null;
let thawTimer = null;
let celebrationTimer = null;
let celebrateFlashTimer = null;
let wonTimer = null;
let pendingSwap = null;    // 连锁期间玩家点的交换，盘面稳定后补执行

// ---------- 布局辅助 ----------
function faceOf(value) {
  if (value === BOMB) return BOMB_FACE;
  if (value === WILD) return WILD_FACE;
  if (isFrozen(value)) return EMOJIS[frozenKind(value)];   // 冰下那种 emoji 照常显示
  return EMOJIS[value];
}

function gemClasses(gem) {
  const out = [];
  if (gem.value === BOMB) out.push('bomb');
  if (gem.value === WILD) out.push('wild');
  if (isFrozen(gem.value)) out.push('frozen');
  if (thawSet.value.has(gem.idx)) out.push('thawing');
  if (selected.value === gem.idx) out.push('selected');
  if (swapPair.value.includes(gem.idx)) out.push('swapping');
  if (matchedSet.value.has(gem.idx)) {
    out.push('matched');
    if (hugeClear.value) out.push('huge');
  }
  if (blastSet.value.has(gem.idx)) out.push('blasting');
  if (isHinted(gem.idx)) out.push('hinting');
  if (gem.fresh) out.push('fresh');
  if (gem.fall != null) out.push('falling');
  if (gem.dealIdx != null) out.push('dealt');
  return out;
}

// 冰屑动画 0.36s；元素多留一点（0.56s）再回收 ——
// 否则它会被「落定清标记」那一步抢在前面删掉，最后几帧放不完
function showThaw(set) {
  thawSet.value = set;
  clearTimeout(thawTimer);
  thawTimer = setTimeout(() => { thawSet.value = new Set(); }, 560);
}

// cells → gems 同步：下落只沿列发生——复用仅限「同列更上方」的同值 gem。
// 关键：输出的顺序必须是「老 gem 保持原相对顺序 + 新 gem 追加在末尾」，
// 不能按格子顺序重排——keyed diff 会为了满足新顺序去搬动节点，
// 同一个父节点里被搬动的元素会丢掉正在跑的 left/top 过渡，下落就变成瞬移了。
function syncGems(prevGems, fresh = false) {
  const cols = conf.value.cols;
  const available = new Map();
  (prevGems || []).forEach(g => {
    const col = g.idx % cols;
    if (!available.has(col)) available.set(col, []);
    available.get(col).push(g);
  });
  for (const list of available.values()) list.sort((a, b) => b.idx - a.idx);
  const next = new Map();
  const created = [];
  for (let i = 0; i < cells.value.length; i++) {
    const v = cells.value[i];
    if (v === null || v === undefined || v === WALL) continue;
    const col = i % cols;
    const list = available.get(col) || [];
    const at = list.findIndex(g => g.idx === i && g.value === v);
    let pick;
    if (at >= 0) {
      pick = list[at];
      list.splice(at, 1);
    } else {
      const upper = list.findIndex(g => g.idx < i && g.value === v);
      if (upper >= 0) {
        pick = list[upper];
        list.splice(upper, 1);
      }
    }
    if (pick) next.set(pick.id, { ...pick, idx: i, fresh: false, fall: pick.idx !== i ? i : undefined });
    else created.push({ id: ++gemId, value: v, idx: i, fresh });
  }
  gems.value = [
    ...(prevGems || []).map(g => next.get(g.id)).filter(Boolean),
    ...created,
  ];
}

// ---------- 关卡流程 ----------

function spawnOpts() {
  const c = conf.value;
  return {
    walls: c.walls,
    ice: c.ice,
    bombChance: c.bombChance,
    wildChance: c.wildChance,
  };
}

function initLevel(lv) {
  clearTimeout(stepTimer);
  clearTimeout(resetTimer);
  busy = false;
  pendingSwap = null;
  selected.value = -1;
  swapPair.value = [];
  matchedSet.value = new Set();
  clearTimeout(thawTimer);
  thawSet.value = new Set();
  blastSet.value = new Set();
  confirming.value = false;
  hugeClear.value = false;
  clearTimeout(shakeTimer);
  clearTimeout(shakeResetTimer);
  shaking.value = false;
  clearCelebration();
  level.value = Math.max(1, lv);
  setRaw(LEVEL_KEY, level.value);
  if (level.value > bestLevel.value) {
    bestLevel.value = level.value;
    setRaw(BEST_KEY, bestLevel.value);
  }
  const c = conf.value;
  // 初始盘面：无现成三连 + 至少一个有效交换；关数高了会带墙和少量特殊元素
  cells.value = generateBoard(c.cols, c.rows, c.kinds, {
    ...spawnOpts(),
    initials: Math.min(3, Math.floor(c.level / 3)),
  });
  gemId = 0;
  gems.value = [];
  score.value = 0;
  moves.value = c.moves;
  phase.value = PLAY;
  dealBoard();
  save();
  pokeIdle();       // 新的一局重新起 6s 空闲计时
  nextTick(measureBoard);
}

function nextLevel() { initLevel(level.value + 1); }
function replayLevel() { initLevel(level.value); }

// 新游戏：清除闯关记录（历史最高关卡）并从第 1 关重新开始
function startNewGame() {
  confirming.value = false;
  setRaw(BEST_KEY, '');
  bestLevel.value = 1;
  initLevel(1);
}

// 发牌：全部 gem 一次性渲染，靠 CSS animationDelay 从第一格逐个弹入
function dealBoard() {
  const all = [];
  for (let i = 0; i < cells.value.length; i++) {
    const v = cells.value[i];
    if (v === null || v === undefined || v === WALL) continue;
    all.push({ id: ++gemId, value: v, idx: i });
  }
  gems.value = all;
  playDeal();
}

function playDeal() {
  if (!gems.value.length) return;
  clearTimeout(dealTimer);
  dealing = true;
  const { cols, rows } = conf.value;
  // 错峰序号 = 行 + 列：左上 → 右下的斜向波浪（同一条斜线上的牌一起出现）
  gems.value = gems.value.map(g => ({ ...g, dealIdx: ~~(g.idx / cols) + (g.idx % cols) }));
  dealTimer = setTimeout(() => {
    dealing = false;
    // 剥掉 dealIdx（.dealt 类随之消失）：不用 destructuring，免得小程序编译出多余的临时对象
    gems.value = gems.value.map(g => ({ ...g, dealIdx: undefined }));
  }, (rows + cols) * 16 + 400);
}

// ---------- 交互 ----------

// 本轮已经被消费（正在消失）的牌：唯一要挡住的一类点击（§零 第 7 条）
const consumedAt = idx => matchedSet.value.has(idx) || blastSet.value.has(idx);
// 模板里用函数而不是直接 thawSet.has(...)：避免不同运行时对 ref 解包 .has 的差异
const isThawing = idx => thawSet.value.has(idx);

function onCellClick(idx) {
  pokeIdle();                       // 玩家有动作 → 收起提示并重新计时
  if (phase.value !== PLAY) return;
  if (!isTileAt(idx)) return;                 // 墙 / 空格不可选
  if (consumedAt(idx)) return;                // 已被消费的那几张牌：点它们没反应
  if (touchHandled) { touchHandled = false; return; }   // 拖完补发的 click 吃掉
  pendingSwap = null;                                 // 新的点击作废上一次排队等待的交换
  if (selected.value < 0) {
    selected.value = idx;
    return;
  }
  if (selected.value === idx) {
    selected.value = -1;
    return;
  }
  if (adjacent(selected.value, idx, conf.value.cols)) {
    trySwap(selected.value, idx);
  } else {
    selected.value = idx;
  }
}

function isTileAt(idx) {
  // isTile 已排除墙与冰块：冰块不能交换，只能靠消掉相邻格来解冻
  return isTile(cells.value[idx]);
}

// 棋盘位置：拖拽判定要用（小程序没有 getBoundingClientRect，走 selectorQuery）。
// 拿不到就退化成「只能点两下换位」，不影响主流程。
let boardRect = { left: 0, top: 0, width: 0, height: 0 };
function measureBoard(cb) {
  try {
    uni.createSelectorQuery()
      .select('#crush-board')
      .boundingClientRect((r) => {
        if (r && r.width) boardRect = { left: r.left, top: r.top, width: r.width, height: r.height };
        if (cb) cb(boardRect);
      })
      .exec();
  } catch {
    if (cb) cb(boardRect);
  }
}

function cellAtPoint(x, y) {
  const rect = boardRect;
  if (!rect.width || !rect.height) return -1;
  const { cols, rows } = conf.value;
  const stepX = rect.width / cols;
  const stepY = rect.height / rows;
  const c = ~~((x - rect.left) / stepX);
  const r = ~~((y - rect.top) / stepY);
  if (r < 0 || r >= rows || c < 0 || c >= cols) return -1;
  return r * cols + c;
}

let touchFrom = -1;
let touchHandled = false;

function touchPoint(e) {
  return (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || null;
}

// 拖到相邻格就换位（小程序没有 Pointer Events，用 touchstart / touchmove / touchend）。
// 页面滚动后 rect 会变：按下时先按缓存值判一次起点，同时异步校准，校准回来再纠正起点。
function onTouchStart(e) {
  pokeIdle();
  touchHandled = false;
  touchFrom = -1;
  if (phase.value !== PLAY) return;
  const t = touchPoint(e);
  if (!t) return;
  const x = t.clientX;
  const y = t.clientY;
  touchFrom = cellAtPoint(x, y);
  measureBoard(() => {
    if (phase.value !== PLAY || touchHandled) return;
    const v = cellAtPoint(x, y);
    if (v >= 0) touchFrom = v;
  });
}

function onTouchMove(e) {
  pokeIdle();
  if (touchFrom < 0 || phase.value !== PLAY) return;
  const t = touchPoint(e);
  if (!t) return;
  const cell = cellAtPoint(t.clientX, t.clientY);
  if (cell >= 0 && cell !== touchFrom && adjacent(touchFrom, cell, conf.value.cols)) {
    if (!isTileAt(touchFrom) || !isTileAt(cell)
      || consumedAt(touchFrom) || consumedAt(cell)) { touchFrom = -1; return; }
    touchHandled = true;        // 拖完补发的 click 别让它再当成「选中」
    trySwap(touchFrom, cell);
    touchFrom = -1;
  }
}

function onTouchEnd() {
  touchFrom = -1;
}

// ---------- 交换与结算链 ----------

function trySwap(a, b) {
  // 已被消费（正在消失）的两张牌不能参与交换（唯一要挡的一类）
  if (consumedAt(a) || consumedAt(b)) return;
  // 连锁结算中：不锁死输入，先记下这次交换，等盘面稳定（finishTurn）立刻执行
  if (busy) {
    pendingSwap = [a, b];
    selected.value = -1;
    return;
  }
  const { cols, rows } = conf.value;
  if (!hasMatchAfterSwap(cells.value, cols, rows, a, b)) {
    // 无效交换：两 gem 换位再换回（走完整过渡），不消耗步数
    selected.value = -1;
    const ga = gems.value.find(g => g.idx === a);
    const gb = gems.value.find(g => g.idx === b);
    if (ga && gb) {
      gems.value = gems.value.map(g =>
        g.id === ga.id ? { ...g, idx: b } : g.id === gb.id ? { ...g, idx: a } : g
      );
      resetTimer = setTimeout(() => {
        gems.value = gems.value.map(g =>
          g.id === ga.id ? { ...g, idx: a } : g.id === gb.id ? { ...g, idx: b } : g
        );
      }, 220);
    }
    swapPair.value = [a, b];
    resetTimer = setTimeout(() => { swapPair.value = []; }, 460);
    return;
  }
  selected.value = -1;
  busy = true;
  const ga = gems.value.find(g => g.idx === a);
  const gb = gems.value.find(g => g.idx === b);
  if (ga && gb) {
    gems.value = gems.value.map(g =>
      g.id === ga.id ? { ...g, idx: b } : g.id === gb.id ? { ...g, idx: a } : g
    );
  }
  const next = [...cells.value];
  [next[a], next[b]] = [next[b], next[a]];
  cells.value = next;
  stepTimer = setTimeout(() => {
    moves.value--;
    resolveCascades(1);
  }, 240);
}

// 级联结算：连线消除 + 炸弹爆炸 → 重力下落 → 再检测，直到无命中
function resolveCascades(chain) {
  const { cols, rows, kinds } = conf.value;
  const matched = findMatches(cells.value, cols, rows);
  if (!matched.size) {
    gems.value = gems.value.map(g => ({ ...g, fresh: false, fall: undefined }));
    finishTurn();
    return;
  }
  // 炸弹：四邻有格子被消除就引爆，炸掉自己周围 3×3（可链式引爆其它炸弹）
  const { blast } = explode(cells.value, cols, rows, matched);
  const all = new Set([...matched, ...blast]);
  // 解冻：这一轮被消除的格子四邻（含斜角）里的冰块开始融化 ——
  // 化掉之后原地变回普通 emoji，可能顺势凑出新的一组，下一轮 findMatches 会接上（连锁）
  const thawed = thawTargets(cells.value, cols, rows, all);
  if (thawed.size) showThaw(thawed);
  const gained = scoreForMatches(matched.size, chain) + scoreForBlast(blast.size, chain);
  score.value += gained;
  matchedSet.value = matched;
  // 一轮消掉 4 个以上 → 消除动画也升一档（爆得更大 + 轻微旋转）
  hugeClear.value = matched.size > 3;
  blastSet.value = blast;
  announceCelebration(matched.size, chain, gained);
  playElimination();   // 完成一次（连锁也算一次）消除
  // 这一轮要消除的牌先摘掉「掉落中 / 刚落格」标记：
  // 连锁时它们往往是上一轮刚落地（甚至刚生成）的牌，带着 fresh/falling 时
  // 只会沿用 drop-in / land-bounce，pop-out 与 blast-out 根本播不出来
  gems.value = gems.value.map(g => (matched.has(g.idx) || blast.has(g.idx))
    ? { ...g, fresh: false, fall: undefined }
    : g);
  if (blast.size) shakeBoard();
  stepTimer = setTimeout(() => {
    const cleared = cells.value.map((v, i) => (all.has(i) ? null : v));
    matchedSet.value = new Set();
    hugeClear.value = false;
    blastSet.value = new Set();
    // 冰下那颗 gem 保留自己的身份（不换节点），只把值换成普通 emoji，
    // 这样 syncGems 还能复用同列上方的它，冰层是「化掉」而不是「换了一张牌」
    const survivors = gems.value
      .filter(g => !all.has(g.idx))
      .map(g => (thawed.has(g.idx) ? { ...g, value: frozenKind(g.value) } : g));
    cells.value = applyThaw(cleared, thawed);
    cells.value = applyGravity(cells.value, cols, rows, kinds, spawnOpts());
    syncGems(survivors, true);
    stepTimer = setTimeout(() => resolveCascades(chain + 1), 300);
  }, 360);
}

// 小程序没有 offsetWidth 强制重排：先摘类名，下一拍再挂上，保证短时间内的连锁都能重播
function shakeBoard() {
  clearTimeout(shakeTimer);
  clearTimeout(shakeResetTimer);
  shaking.value = false;
  shakeResetTimer = setTimeout(() => {
    shaking.value = true;
    shakeTimer = setTimeout(() => { shaking.value = false; }, 340);
  }, 20);
}

// ---------- 大消 / 连锁庆祝 ----------
// 一轮消掉 4 个以上（大消）或连锁 ≥2 层时，给一次「看得见」的庆祝：
// 棋盘外圈闪光 + 中央弹出文字与本次得分（两者同时达成时分两行）
function announceCelebration(count, chain, gained) {
  const big = count > 3;
  const combo = chain > 1;
  if (!big && !combo) return;
  const tier = big && combo ? 3 : combo ? 2 : 1;
  const lines = [];
  if (combo) lines.push(tt('niceCombo').replace('{n}', chain));
  if (big) lines.push(tt('niceBig').replace('{n}', count));
  celebration.value = { id: ++celebrationId, tier, gained, lines };
  clearTimeout(celebrationTimer);
  celebrationTimer = setTimeout(() => { celebration.value = null; }, 1100 + tier * 220);
  // 棋盘闪光：与炸弹的 shaking 是两套独立样式，同时发生也不会互相顶掉
  clearTimeout(celebrateFlashTimer);
  celebrating.value = false;
  celebrateFlashTimer = setTimeout(() => {
    celebrating.value = true;
    celebrateFlashTimer = setTimeout(() => { celebrating.value = false; }, 900);
  }, 20);
  // 撒一把小烟花（web 的 announceCelebration 尾部同款）+ 烟花音：
  // 强度 = tier，连锁 > 3 再加 1；喷发点 / 粒子数用 burstConfetti 的默认值
  // （默认喷发点 = 屏幕中间偏下；sfx 规则是烟花后 240ms 内不再叠 elimination）
  burstConfetti(tier + (chain > 3 ? 1 : 0));
}

function clearCelebration() {
  clearTimeout(celebrationTimer);
  clearTimeout(celebrateFlashTimer);
  celebration.value = null;
  celebrating.value = false;
}

function finishTurn() {
  busy = false;
  if (phase.value !== PLAY) { pendingSwap = null; pokeIdle(); return; }
  if (score.value >= target.value) { pendingSwap = null; winLevel(); return; }
  if (moves.value <= 0) { pendingSwap = null; loseLevel(); return; }
  if (!hasAnyMove(cells.value, conf.value.cols, conf.value.rows, conf.value.kinds)) {
    cells.value = reshuffle(cells.value, conf.value.cols, conf.value.rows, conf.value.kinds);
    syncGems(gems.value);
    selected.value = -1;
  }
  save();
  pokeIdle();       // 盘面稳定了，重新起 6s 空闲计时
  flushPendingSwap();
}

// 连锁期间玩家点的交换：盘面一稳定就补上（不再锁住整块棋盘）
function flushPendingSwap() {
  if (!pendingSwap) return;
  const [a, b] = pendingSwap;
  pendingSwap = null;
  if (phase.value !== PLAY || busy || dealing) return;
  if (!isTileAt(a) || !isTileAt(b) || !adjacent(a, b, conf.value.cols)) return;
  trySwap(a, b);
}

function winLevel() {
  if (phase.value !== PLAY) return;
  justWon.value = true;
  clearTimeout(wonTimer);
  wonTimer = setTimeout(() => { justWon.value = false; }, 4000);
  playWin();
  if (level.value + 1 > bestLevel.value) {
    bestLevel.value = level.value + 1;
    setRaw(BEST_KEY, bestLevel.value);
  }
  phase.value = WON;
  // 胜利局面也落盘：退出重进还是这个结算层，
  // 由玩家自己决定点「下一关」还是回主页
  save();
}

function loseLevel() {
  if (phase.value !== PLAY) return;
  phase.value = OVER;
  playLose();
  // 失败局面同样落盘：退出重进还是这个结算层
  save();
}

// ---------- 存档（key 与 web 一字不差） ----------

function save() {
  setRaw(STATE_KEY, JSON.stringify({
    cells: cells.value,
    level: level.value,
    score: score.value,
    moves: moves.value,
    phase: phase.value,
  }));
}

function restore() {
  try {
    const saved = getJSON(STATE_KEY);
    if (!saved || !Array.isArray(saved.cells) || !saved.cells.length) return false;
    // 玩到一半、已过关、已失败三种局面都还原
    if (saved.phase !== PLAY && saved.phase !== WON && saved.phase !== OVER) return false;
    const c = levelConfig(+saved.level || 1);
    if (saved.cells.length !== c.cols * c.rows) return false;
    level.value = c.level;
    if (level.value > bestLevel.value) bestLevel.value = level.value;
    cells.value = saved.cells;
    syncGems([]);
    score.value = +saved.score || 0;
    moves.value = Math.min(c.moves, Math.max(0, +saved.moves));
    phase.value = saved.phase === WON ? WON : saved.phase === OVER ? OVER : PLAY;
    // 玩到一半才逐张发牌；恢复的是胜利结算层，盘面直接落定、不再播入场
    if (phase.value === PLAY) playDeal();
    return true;
  } catch {
    return false;
  }
}

// ---------- 生命周期 / 视口变化 ----------
function onResize() {
  viewport.value = readViewport();
  nextTick(measureBoard);
}

onMounted(() => {
  // H5 的导航栏（uni-page-head）在 setup 时可能还没挂上，这里再量一次视口
  viewport.value = readViewport();
  // restore() 成功时不会走 initLevel，那条路上的空闲计时要自己补上，
  // 否则「接着上次的局面玩」时永远不会有提示
  if (!restore()) initLevel(level.value);
  else pokeIdle();
  if (typeof uni.onWindowResize === 'function') uni.onWindowResize(onResize);
  nextTick(measureBoard);
});

onUnmounted(() => {
  clearTimeout(stepTimer);
  clearTimeout(resetTimer);
  clearTimeout(dealTimer);
  clearTimeout(shakeTimer);
  clearTimeout(shakeResetTimer);
  clearTimeout(idleTimer);
  clearTimeout(hintTimer);
  clearTimeout(celebrationTimer);
  clearTimeout(celebrateFlashTimer);
  clearTimeout(thawTimer);
  clearTimeout(wonTimer);
  if (typeof uni.offWindowResize === 'function') uni.offWindowResize(onResize);
});

// ---------- 帮助 ----------
const helpOpen = ref(false);
// 帮助文案：导语 + 各条（用空行分段，HelpSheet 会拆成段落）
const helpText = computed(() => {
  const parts = [];
  const keys = ['helpMsg'];
  for (let i = 1; i <= 9; i += 1) keys.push(`help${i}`);
  keys.forEach((k) => { const v = tt(k); if (v && v !== k) parts.push(v); });
  return parts.join('\n\n');
});
function showHelp() {
  helpOpen.value = true;
}
</script>

<style lang="scss" scoped>
/* ---------- keyframes（web 的逐条搬过来，px → rpx 按 1.908 折算；duration 不变） ---------- */
@keyframes pop-out {
  0% { transform: scale(1); }
  40% { transform: scale(1.2); }
  100% { transform: scale(0); opacity: 0; }
}
@keyframes blast-out {
  0% { transform: scale(1); filter: brightness(1); }
  35% { transform: scale(1.35); filter: brightness(1.9); }
  100% { transform: scale(1.7); opacity: 0; }
}
@keyframes drop-in {
  from { transform: translateY(-100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes land-bounce {
  0% { transform: translateY(-12%) scaleY(1.06); }
  60% { transform: translateY(0) scaleY(0.92); }
  100% { transform: translateY(0) scaleY(1); }
}
@keyframes deal-in {
  from { transform: scale(0.2); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
/* 提示时牌面呼吸：幅度比原来（1 → 1.2 → 0.8）大得多，还带一点摆动 */
@keyframes breathe {
  0%, 100% { transform: scale(1) rotate(0deg); }
  22% { transform: scale(1.42) rotate(-7deg); }
  62% { transform: scale(0.66) rotate(7deg); }
  82% { transform: scale(1.08) rotate(-2deg); }
}
/* 提示时牌面底色 / 描边 / 光晕一起脉冲；只动颜色，避免和交换、下落的 left/top 过渡打架 */
@keyframes hint-card {
  0%, 100% {
    background-color: #fff;
    border-color: #c9d0da;
    box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.12);
  }
  50% {
    background-color: #fff1c2;
    border-color: #23804e;
    box-shadow: 0 0 0 4rpx rgba(35, 128, 78, 0.55), 0 0 27rpx 6rpx rgba(35, 128, 78, 0.55);
  }
}
/* 大消（一轮 ≥4 个）的爆开：比普通 pop-out 更大、带旋转高光 */
@keyframes pop-out-big {
  0% { transform: scale(1) rotate(0deg); filter: brightness(1); }
  35% { transform: scale(1.55) rotate(-12deg); filter: brightness(1.7); }
  70% { transform: scale(1.3) rotate(10deg); filter: brightness(1.4); }
  100% { transform: scale(0) rotate(0deg); opacity: 0; }
}
/* 大消 / 连锁时棋盘外圈的一圈闪光（只动 box-shadow，不改变可滚动范围） */
@keyframes board-celebrate {
  0% { box-shadow: 0 0 0 0 transparent; }
  25% { box-shadow: 0 0 0 8rpx rgba(35, 128, 78, 0.5), 0 0 50rpx 15rpx rgba(35, 128, 78, 0.5); }
  100% { box-shadow: 0 0 0 0 transparent; }
}
/* 庆祝文字：弹出 → 顿一下 → 上飘淡出 */
@keyframes celebrate-pop {
  0% { opacity: 0; transform: translate(-50%, -30%) scale(0.4) rotate(-6deg); }
  28% { opacity: 1; transform: translate(-50%, -50%) scale(1.16) rotate(3deg); }
  44% { opacity: 1; transform: translate(-50%, -50%) scale(1) rotate(0deg); }
  78% { opacity: 1; transform: translate(-50%, -62%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -100%) scale(0.92); }
}
/* 冰面流光：只动亮度，不动尺寸 */
@keyframes ice-sheen {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.12); }
}
/* 解冻：冰层闪一下、裂开并淡出 */
@keyframes ice-melt {
  0% { opacity: 1; filter: brightness(1); }
  30% { opacity: 1; filter: brightness(1.6); }
  100% { opacity: 0; filter: brightness(1.4); }
}
/* 碎冰飞散：从牌心往外抛，边飞边转、逐渐变小消失 */
@keyframes ice-shard {
  0% { opacity: 1; transform: translate(0, 0) scale(var(--ss, 1)) rotate(0deg); }
  15% { opacity: 1; transform: translate(calc(var(--sx) * 1.82em * 0.18), calc(var(--sy) * 1.82em * 0.18)) scale(var(--ss, 1)) rotate(calc(var(--sr, 0deg) * 0.15)); }
  100% { opacity: 0; transform: translate(calc(var(--sx) * 1.82em), calc(var(--sy) * 1.82em)) scale(calc(var(--ss, 1) * 0.45)) rotate(var(--sr, 0deg)); }
}
@keyframes swap-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-8%); }
  75% { transform: translateX(8%); }
}
/* 炸弹 / 万能元素：持续的呼吸缩放（挂在内部 face 上，避免与其它 transform 动画冲突） */
@keyframes breath {
  0%, 100% { transform: scale(0.95); }
  50% { transform: scale(1.05); }
}
/* 炸弹引爆时的棋盘震动 */
@keyframes board-shake {
  0%, 100% { transform: translate(0, 0); }
  15% { transform: translate(-10rpx, 4rpx); }
  30% { transform: translate(8rpx, -6rpx); }
  45% { transform: translate(-6rpx, -4rpx); }
  60% { transform: translate(6rpx, 4rpx); }
  80% { transform: translate(-4rpx, 2rpx); }
}
@keyframes result-in {
  from { opacity: 0; }
  to { opacity: 1; }
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

/* ---------- 分数区 / 操作区（高度由 App.vue 的全局 .score-area / .opt-area 统一给） ---------- */
.score-area {
  position: relative;
  width: 690rpx;                 /* web 的 calc(100% - 32px) = 361px */
  display: flex;
  align-items: center;
  padding: 0 19rpx;
  overflow: hidden;
  box-sizing: border-box;
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
.progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 6rpx;                  /* 3px */
  background: #e1e1e1;
}
.progress-bar {
  height: 100%;
  background: #23804e;
  transition: width 0.3s ease;
}

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
.level-note {
  font-size: 27rpx;              /* 14px */
  color: #5f6b7a;
  white-space: nowrap;
}
/* 主按钮：web 的 .game-icon（padding 8px 16px / 14px 字 / 8px 圆角） */
.game-icon {
  margin: 0;
  padding: 0 31rpx;
  height: 71rpx;
  line-height: 71rpx;
  border: 0;
  border-radius: 15rpx;
  background: #23804e;
  color: #fff;
  font-size: 27rpx;
  font-weight: bold;
  white-space: nowrap;
  box-sizing: border-box;
}

/* ---------- 游戏区：外框尺寸由棋盘反算（板宽 + 两边 8px 内边距） ---------- */
.game-area {
  position: relative;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}
.board-frame {
  box-sizing: border-box;
  background-color: #bbada0;
  background-image: radial-gradient(circle, rgba(255, 255, 255, 0.18) 2rpx, transparent 2rpx);
  background-size: 19rpx 19rpx;
  background-position: 10rpx 10rpx;
  border-radius: 27rpx;
  touch-action: none;
}
/* 炸弹引爆时整块棋盘震动一下 */
.board-frame.shaking { animation: board-shake 0.34s ease; }
.board {
  position: relative;
  border-radius: 15rpx;
}
/* 大消 / 连锁时外圈闪一圈（动 box-shadow 不动 transform：不改变文档可滚动范围） */
.board.celebrating { animation: board-celebrate 0.9s ease-out; }

/* 背景格：位置 / 宽高由 cellStyle() 给；与 gem 共用同一份 cell/gap 数学 */
.cell {
  position: absolute;
  border-radius: 15rpx;          /* 8px */
  background: rgba(238, 228, 218, 0.35);
}
/* 不可消除的墙：emoji 下落时可以穿过，但不能交换 / 消除 */
.cell.wall {
  background: #e4e8ee;
  background-image: repeating-linear-gradient(45deg,
    transparent 0 11rpx,
    rgba(0, 0, 0, 0.14) 11rpx 17rpx);
  border: 2rpx solid #c9d0da;
  box-sizing: border-box;
}

/* ---------- 牌 ---------- */
.gem {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 必须 border-box：否则 2rpx 边框会画在 --cell 之外，整块牌比下面的格子大一圈 */
  box-sizing: border-box;
  border-radius: 15rpx;
  background: #fff;
  border: 2rpx solid #c9d0da;
  box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.12);
  font-size: 28rpx;              /* 兜底；真实字号由 gemStyle 内联给（= cell × 0.55） */
  line-height: 1;
  -webkit-tap-highlight-color: transparent;
  /* 位置过渡 = 掉落 / 交换动画的载体 */
  transition: left 0.24s ease, top 0.24s ease;
}
.gem .face {
  display: inline-block;
  line-height: 1;
}
.gem.selected {
  border-color: #23804e;
  box-shadow: 0 0 0 4rpx #23804e;
  transform: scale(1.06);
}
.gem.bomb .face,
.gem.wild .face {
  animation: breath 1.6s ease-in-out infinite;
}
.gem.bomb { background: #fdeeee; }
.gem.wild { background: #e5f6ec; }
.gem.swapping { animation: swap-shake 0.4s ease; }

/* 冰块：冻住的 emoji 不参与消除。一层半透明冰蓝玻璃盖在牌上 ——
   冰下的 emoji 若隐若现（褪色 + 压暗），右上角一枚雪花，冰面缓慢流光 */
.gem.frozen .face {
  filter: saturate(0.62) brightness(0.98);
}
.ice {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  border-radius: 15rpx;
  background: linear-gradient(135deg,
    rgba(255, 255, 255, 0.60) 0%,
    rgba(150, 208, 242, 0.40) 48%,
    rgba(214, 240, 253, 0.48) 100%);
  border: 2rpx solid rgba(255, 255, 255, 0.92);
  box-shadow: inset 0 0 15rpx rgba(255, 255, 255, 0.92), inset 0 0 6rpx rgba(96, 160, 205, 0.55);
  pointer-events: none;
  animation: ice-sheen 3.2s ease-in-out infinite;
}
.ice-flake {
  position: absolute;
  right: 10%;
  bottom: 2%;
  font-size: 0.54em;             /* ≈ cell × 0.30（gem 字号 = cell × 0.55） */
  line-height: 1;
  color: #fff;
  text-shadow: 0 0 6rpx rgba(96, 160, 205, 0.55);
  opacity: 0.95;
}
/* 解冻：冰层先亮一下再裂开淡出（0.22s） */
.gem.thawing .ice {
  animation: ice-melt 0.22s ease forwards;
}
.ice-shards {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
}
.shard {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0.55em;                 /* ≈ cell × 0.30（em 相对 gem 字号 = cell × 0.55） */
  height: 0.55em;
  /* 用 margin 把碎片中心对到牌中心（不能用 translate，transform 要留给飞行动画） */
  margin: -0.275em 0 0 -0.275em;
  background: linear-gradient(135deg, #fff 0%, #7cc0e8 100%);
  /* 菱形冰块（四边不等长，看起来像碎渣而不是整齐的方块） */
  clip-path: polygon(50% 0%, 100% 55%, 50% 100%, 0% 45%);
  box-shadow: 0 0 8rpx rgba(96, 160, 205, 0.55);
  animation: ice-shard 0.36s cubic-bezier(0.2, 0.9, 0.3, 1) forwards;
}

/* 提示到的那两张牌：emoji 大幅呼吸 + 牌面底色脉冲发光（写在消除 / 掉落之前） */
.gem.hinting {
  z-index: 2;
  animation: hint-card 0.8s ease-in-out 3;
}
.gem.hinting .face {
  display: inline-block;
  animation: breathe 0.8s ease-in-out 3;
}
.gem.fresh { animation: drop-in 0.3s ease-out; }
.gem.falling { animation: land-bounce 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); }
.gem.dealt { animation: deal-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) backwards; }
/* 消除类动画写在最后：同一元素同时带 fresh/falling 与 matched/blasting 时，
   靠后的规则胜出（选择器权重相同），否则消除动画会被掉落 / 落格动画顶掉 */
.gem.matched {
  animation: pop-out 0.35s ease forwards;
  pointer-events: none;
}
/* 一轮消掉 4 个以上：这批牌爆得更大（权重更高，写在 matched 后面且多一个类） */
.gem.matched.huge {
  animation: pop-out-big 0.35s ease forwards;
}
/* 被炸弹波及：放大 + 闪白后消失 */
.gem.blasting {
  animation: blast-out 0.34s ease forwards;
  pointer-events: none;
}

/* ---------- 大消 / 连锁的庆祝浮字 ---------- */
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
  /* 不 nowrap：窄屏上长文案会顶出视口，这里让它最多占满游戏区、必要时折行 */
  max-width: calc(100% - 15rpx);
  pointer-events: none;
  box-shadow: 0 11rpx 34rpx rgba(35, 128, 78, 0.5);
  transform: translate(-50%, -50%);
  animation: celebrate-pop 0.95s cubic-bezier(0.22, 1.2, 0.36, 1) forwards;
}
.celebrate-text {
  font-size: 34rpx;
  line-height: 1.2;
}
.celebrate-score {
  font-size: 27rpx;
  line-height: 1.2;
  margin-top: 6rpx;
  opacity: 0.92;
  font-variant-numeric: tabular-nums;
}
/* 连锁越深、消得越多，浮字越大、光圈越亮 */
.celebrate.tier-2 {
  box-shadow: 0 11rpx 38rpx rgba(35, 128, 78, 0.5), 0 0 0 6rpx rgba(35, 128, 78, 0.5);
}
.celebrate.tier-2 .celebrate-text { font-size: 40rpx; }
.celebrate.tier-3 {
  padding: 23rpx 42rpx;
  box-shadow: 0 15rpx 50rpx rgba(35, 128, 78, 0.5), 0 0 0 8rpx rgba(35, 128, 78, 0.5);
}
.celebrate.tier-3 .celebrate-text { font-size: 46rpx; }

/* ---------- 结算层：与游戏区（game-area）矩形完全重合 ---------- */
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
  color: #b11;
  font-weight: bold;
  font-size: 34rpx;              /* 18px */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 23rpx;                    /* web 的 gap: 12px */
  text-align: center;
  padding: 23rpx;
  animation: result-in 0.28s ease;
}
.result.win { color: #12833f; }
.result-title { font-size: 34rpx; line-height: 1.35; }
.final-score {
  font-size: 53rpx;              /* 28px */
  margin-top: 8rpx;
}

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
