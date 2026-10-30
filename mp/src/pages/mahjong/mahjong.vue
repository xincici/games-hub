<template>
  <view class="screen" @touchstart="unmuteHover">
    <!-- 全站背景（粒子连线 + 底部过山车，与 web 的 ParticleBackground 同款） -->
    <ParticleBackground />
    <view class="page">
      <!-- 分数区：闯关四格「关卡 / 剩余 / 得分 / 目标」，无尽三格「最高分 / 已用 / 得分」 -->
      <view class="card score-area" :class="{ four: mode === 1 }">
        <view v-if="mode === 1" class="stat">
          <text class="stat-label">{{ tt('level') }}</text>
          <text class="stat-value">{{ level }}</text>
        </view>
        <view v-else class="stat">
          <text class="stat-label">{{ tt('best') }}</text>
          <text class="stat-value">{{ bestScore }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt(mode === 1 ? 'left' : 'used') }}</text>
          <text class="stat-value">{{ mode === 1 ? cardsLeft : played }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('score') }}</text>
          <text class="stat-value">{{ score }}</text>
        </view>
        <template v-if="mode === 1">
          <view class="divider" />
          <view class="stat">
            <text class="stat-label">{{ tt('target') }}</text>
            <text class="stat-value">{{ cfg.target }}</text>
          </view>
          <!-- 本关进度条：宽度 = 得分 / 目标分，只在闯关模式显示 -->
          <view class="progress"><view class="progress-bar" :style="{ width: progress + '%' }" /></view>
        </template>
      </view>

      <!-- 操作区：左手牌（当前 + 下一张），右「新游戏」 -->
      <view class="card opt-area">
        <view class="opt-half hand">
          <view
            class="tile-slot current"
            :class="{ ghost: dragging }"
            :style="slotStyle(HAND_W)"
            @touchstart="onHandTouchStart"
            @touchmove.stop.prevent="onHandTouchMove"
            @touchend="onHandTouchEnd"
            @touchcancel="onHandTouchCancel"
          >
            <MahjongTile v-if="hand" :value="hand.value" class="mj" :style="tileStyle(HAND_W)" />
            <text v-else class="slot-hint">{{ tt('left') }}</text>
          </view>
          <view class="preview" :style="slotStyle(HAND_W)">
            <view
              v-for="t in preview"
              :key="t.id"
              class="tile-slot next"
              :style="{ transform: 'scale(' + PREVIEW_SCALE + ')' }"
            >
              <MahjongTile :value="t.value" class="mj" :style="tileStyle(HAND_W)" />
            </view>
          </view>
        </view>
        <view class="opt-half">
          <button class="game-icon" @click="confirming = true">{{ tt('start') }}</button>
        </view>
      </view>

      <!-- 游戏区：9 个常驻格位；结算层正好盖住这块 -->
      <view class="game-area" :style="{ width: boardW + 'rpx', height: boardH + 'rpx' }">
        <view
          id="board"
          class="board dot-board"
          :class="{ shaking, celebrating, 'hover-muted': hoverMuted }"
          :style="{ width: boardW + 'rpx', height: boardH + 'rpx', padding: PAD + 'rpx', gap: GAP + 'rpx' }"
        >
          <view
            v-for="idx in CELLS"
            :key="'cell-' + idx"
            :id="'cell-' + (idx - 1)"
            class="cell"
            :style="{ width: cw + 'rpx', height: ch + 'rpx' }"
            :class="{
              placeable: !board[idx - 1] && canPlace,
              actable: !!board[idx - 1] && canPlace,
              incoming: flyingTo === idx - 1,
              flash: flashCell === idx - 1,
            }"
            @click="onCellClick(idx - 1)"
          >
            <template v-if="board[idx - 1]">
              <MahjongTile
                :key="dealSeq + '-' + idx"
                :value="board[idx - 1].value"
                class="mj"
                :class="{ dealt: dealing }"
                :style="[
                  tileStyle(boardTileW),
                  { animationDelay: dealing ? dealDelay(idx - 1) + 'ms' : '0ms' },
                ]"
              />
            </template>
            <!-- 刚消掉的牌：浮影层播完「闪烁 → 消失」就走 -->
            <view v-else-if="clearing.has(idx - 1)" class="clearing">
              <MahjongTile :value="clearing.get(idx - 1).value" :style="tileStyle(boardTileW)" />
            </view>
          </view>
        </view>

        <!-- 得分浮字：棋盘正中弹出牌型名与本次得分 -->
        <view v-if="celebration" :key="celebration.id" class="celebrate" :class="'tier-' + celebration.tier">
          <text class="celebrate-text">{{ celebration.name }}</text>
          <text v-if="celebration.chain > 1" class="celebrate-chain">🔥 {{ tt('chainName').replace('{n}', celebration.chain) }}</text>
          <text class="celebrate-score">+{{ celebration.gained }}</text>
        </view>

        <!-- 结算层：盖在棋盘上（矩形与棋盘完全重合） -->
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
            <text class="result-main">💤💤 {{ tt(loseReason === 'stuck' ? 'overStuck' : 'tipLost') }} 💤💤</text>
            <text class="level-note">{{ tt('score') }} {{ score }}</text>
            <button class="game-icon replay-btn" @click="retryLevel">{{ tt('replayLevel') }}</button>
          </template>
        </view>
      </view>
    </view>

    <!-- 跟手浮层：拖着的那张牌 -->
    <view v-if="dragging && dragPos" class="drag-ghost" :style="{ left: dragPos.x + 'px', top: dragPos.y + 'px' }">
      <MahjongTile v-if="hand" :value="hand.value" />
    </view>

    <!-- 点击放置的飞行浮牌：从手牌位置飞到目标格，落定后才结算 -->
    <view v-if="flying" class="fly-tile" :style="flyStyle">
      <MahjongTile :value="flying.tile.value" />
    </view>

    <!-- 新游戏二次确认（web 的 shared/ConfirmDialog 三按钮版；小程序没有共享弹窗，这里本地实现） -->
    <view v-if="confirming" class="confirm-mask" @click="confirming = false">
      <view class="card confirm-box" @click.stop>
        <text class="confirm-title">{{ confirmTitle }}</text>
        <text class="confirm-msg">{{ confirmMsg }}</text>
        <view class="confirm-actions">
          <button class="confirm-cancel" @click="confirming = false">{{ tt('cancel') }}</button>
          <button v-if="mode === 1" class="confirm-replay" @click="retryLevel">{{ tt('confirmReplay') }}</button>
          <button class="confirm-ok" @click="startNewGame">{{ tt('confirmOk') }}</button>
        </view>
      </view>
    </view>

    <!-- 胜利彩带（纯 CSS 降级版，web 是 confetti canvas） -->
    <Confetti v-if="justWon" />
    <FloatingActions>
      <view class="fab" @click="toggleMode">
        <view class="fab-ico" :class="mode === 1 ? 'i-mdi-trophy-variant-outline' : 'i-mdi-infinity'" />
      </view>
      <view class="fab" @click="showHelp"><view class="fab-ico i-carbon-help" /></view>
    </FloatingActions>
    <!-- 连击 / 多消的小烟花：burstConfetti 的粒子层，页面里挂一次就接活 -->
    <FireworkBurst />
    <HelpSheet :open="helpOpen" :text="helpText" @close="helpOpen = false" />
  </view>
</template>

<script setup>
// 麻将英雄 · 微信小程序版
// 纯逻辑来自 web 的 board.js（**原样复制**：8 条消除线 / 顺子刻子 / 连击 / 牌墙 / 关卡曲线），
// 这里只重写视图，并把 localStorage → core/storage、Web Audio → core/sfx、
// Pointer Events → touch、getBoundingClientRect/flyTo → selectorQuery + fixed 替身。
import { computed, getCurrentInstance, onMounted, onUnmounted, ref } from 'vue';

import MahjongTile from '@/components/MahjongTile.vue';
import FloatingActions from '@/components/FloatingActions.vue';
import HelpSheet from '@/components/HelpSheet.vue';
import Confetti from '@/components/Confetti.vue';
import FireworkBurst from '@/components/FireworkBurst.vue';
import { burstConfetti } from '@/core/firework';
import { getJSON, getRaw, setRaw } from '@/core/storage';
import { playElimination, playLose, playWin } from '@/core/sfx';
import { preloadTiles } from '@/shared/mahjongTiles';
import { tt } from './i18n';
import {
  SIZE, CELLS, PREVIEW, TILE_RATIO,
  createWall, resetUid, scoringLines, comboBonus, chainBonus, levelConfig,
} from './board';

import { setNavTitle } from '@/core/i18n';
import ParticleBackground from '@/components/ParticleBackground.vue';

// 原生导航栏标题跟随语言（pages.json 里的标题是静态的）
setNavTitle(() => tt('gameTitle'));
// ---------- 存档 key：与 web 完全一致 ----------
const MODE_KEY = '__mahjong_hero__mode';
const LEVEL_KEY = '__mahjong_hero__level';
const STATE_KEY = '__mahjong_hero__state';
const BEST_KEY = '__mahjong_hero__best_';

const [PLAY, WON, OVER] = ['play', 'won', 'over'];

// 中央得分浮字的档位（按本次得分放大）与「有特效」的门槛（与 web 一致）
const TIER_BY_SCORE = gained => (gained >= 1000 ? 3 : gained >= 500 ? 2 : 1);
const FX_MIN = 300;
const PREVIEW_SCALE = 0.8;
// web 的 RESULT_DELAY_MS（shared/resultDelay.js）= 0.5s
const RESULT_DELAY_MS = 500;

// ---------- rpx 尺寸（web px × 750/393 ≈ 1.908） ----------
const HAND_W = 84;                 // 手牌 44px（web 固定 44×56）
const GAP = 15;                    // 棋盘缝 8px
const PAD = 15;                    // 棋盘内边距 8px
const CW_MAX = 210;                // 棋子格上限 110px（web 的 56~132px 上下限，这里是 rpx 版）
// 棋盘总宽上限：屏宽的 80%（750 × 0.8 = 600rpx，≈ 对对碰一行 3 个元素时的宽度）
const BOARD_MAX_W = 600;
const CW_MIN = 96;                 // 下限放宽，保证 80% 宽能命中（原 107 会把棋盘撑到 625rpx）
// 页面里除棋盘外的固定高度（rpx）：上下 padding 36+48、分数卡 138、操作区 138、两处 gap 36×2
const PAGE_FIXED_H = 36 + 138 + 36 + 138 + 36 + 48;

const instance = getCurrentInstance();   // selectorQuery 需要组件实例

const mode = ref(+(getRaw(MODE_KEY) || 1));   // 1 闯关 / 2 无尽
const level = ref(1);
const score = ref(0);
const played = ref(0);
const bestScore = ref(0);
const phase = ref(PLAY);
const board = ref(new Array(CELLS).fill(null));
const pile = ref([]);
const cursor = ref(0);
const confirming = ref(false);
const shaking = ref(false);
const celebrating = ref(false);
const celebration = ref(null);
const clearing = ref(new Map());
const loseReason = ref('deck');
const combo = ref(0);
const flying = ref(null);
const flyingTo = ref(-1);
const busy = ref(false);
const dealing = ref(false);
const dealSeq = ref(0);
const flashCell = ref(-1);
// 恢复存档后先屏蔽「已有牌」格子的悬停光环（web 的 hoverMuted）：
// 手机上没有 hover，这里只是保留同款类名与状态，玩家一碰屏幕就解除。
const hoverMuted = ref(false);
const dragging = ref(false);
const dragPos = ref(null);
const justWon = ref(false);

let cellFlashTimer = 0;
let shakeTimer = 0;
let celebrateTimer = 0;
let flashTimer = 0;
let dealTimer = 0;
let clearTimer = 0;
let flyTimer = 0;
let endTimer = 0;
let wonTimer = 0;
let suppressClickUntil = 0;
let celebrationId = 0;
let uidCounter = 0;

const cfg = computed(() => levelConfig(level.value));
// 本关进度：得分占目标分的比例（无尽模式没有目标分，条也不显示）
const progress = computed(() => {
  const total = cfg.value.target;
  return total ? Math.min(100, Math.round((score.value / total) * 100)) : 0;
});
const cardsLeft = computed(() => Math.max(0, pile.value.length - cursor.value));
const hand = computed(() => pile.value[cursor.value] || null);
const preview = computed(() => pile.value.slice(cursor.value + 1, cursor.value + 1 + PREVIEW));
const canPlace = computed(() => phase.value === PLAY && !!hand.value);

const confirmTitle = computed(() => (mode.value === 2 ? tt('endlessTitle') : tt('confirmTitle')));
const confirmMsg = computed(() => (mode.value === 2 ? tt('endlessMsg') : tt('confirmMsg')));

// 槽位 / 牌面的 rpx 尺寸（小程序里 MahjongTile 是 100%×100%，尺寸必须由父级给）
const slotStyle = w => ({ width: `${w}rpx`, height: `${Math.round(w * TILE_RATIO)}rpx` });
// 牌面圆角：与 web 的『牌宽 × 0.09』同口径（web 的 MahjongTile 自带圆角），
// 顺手把宿主节点的圆角也带上 —— 小程序的组件宿主插了一层，不给它圆角的话 .mj-wrap 的
// border-radius: inherit 会继承到 0（§零 第 9 条），候选牌就是直角。
const tileStyle = w => ({
  width: `${w}rpx`,
  height: `${Math.round(w * TILE_RATIO)}rpx`,
  borderRadius: `${Math.round(w * 0.09)}rpx`,
  overflow: 'hidden',
});

// 尺寸完全照 web 的 computeMetrics()：宽度优先，屏太矮时按高度缩格子（否则真机上棋盘会被裁掉）。
// 393×852 下算出来就是 cw=210rpx / ch=269rpx（= web 的 110×141px），与网页逐像素一致。
const metrics = ref({ cw: CW_MAX, ch: Math.round(CW_MAX * TILE_RATIO) });
const cw = computed(() => metrics.value.cw);
const ch = computed(() => metrics.value.ch);
const boardW = computed(() => cw.value * SIZE + GAP * (SIZE - 1) + PAD * 2);
const boardH = computed(() => ch.value * SIZE + GAP * (SIZE - 1) + PAD * 2);
// 格子里那张牌：格子四周各留 3px（≈6rpx）
const boardTileW = computed(() => Math.round(Math.min(cw.value - 11, (ch.value - 11) / TILE_RATIO)));

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
  // 宽：按「屏宽 80%（600rpx）」反算格子；byH 仍按剩余高度算，两者取小
  const byW = Math.floor((BOARD_MAX_W - PAD * 2 - GAP * (SIZE - 1)) / SIZE);
  const byH = ((h * pxToRpx - PAGE_FIXED_H - PAD * 2 - GAP * 2) / SIZE) / TILE_RATIO;
  const size = Math.round(Math.max(CW_MIN, Math.min(byW, byH)));
  metrics.value = { cw: size, ch: Math.round(size * TILE_RATIO) };
}

// ---------- 牌墙 ----------
const wall = createWall();
const freshTile = () => wall.draw();
function ensurePile(need) {
  if (mode.value !== 1) while (pile.value.length < need) pile.value.push(freshTile());
}

const pack = t => ({ v: t.value });
const unpack = o => (o && typeof o.v === 'number' ? { id: ++uidCounter, value: o.v } : null);

// ---------- 计时器 ----------
function clearTimers() {
  clearTimeout(dealTimer);
  clearTimeout(cellFlashTimer);
  clearTimeout(shakeTimer);
  clearTimeout(celebrateTimer);
  clearTimeout(flashTimer);
  clearTimeout(clearTimer);
  clearTimeout(flyTimer);
  clearTimeout(endTimer);
  clearTimeout(wonTimer);
}

// ---------- 开局 ----------
function startLevel(lv) {
  clearTimers();
  level.value = Math.max(1, lv);
  score.value = 0;
  played.value = 0;
  combo.value = 0;
  phase.value = PLAY;
  board.value = new Array(CELLS).fill(null);
  clearing.value = new Map();
  celebration.value = null;
  shaking.value = false;
  celebrating.value = false;
  dealing.value = false;
  justWon.value = false;
  cursor.value = 0;
  resetUid();
  uidCounter = 0;
  const { deck } = cfg.value;
  const built = [];
  for (let i = 0; i < deck; i++) built.push(freshTile());
  pile.value = built;
  ensurePile(cursor.value + 1 + PREVIEW);
  save();
}

function startEndless() {
  clearTimers();
  score.value = 0;
  played.value = 0;
  combo.value = 0;
  phase.value = PLAY;
  board.value = new Array(CELLS).fill(null);
  clearing.value = new Map();
  celebration.value = null;
  shaking.value = false;
  celebrating.value = false;
  dealing.value = false;
  justWon.value = false;
  cursor.value = 0;
  uidCounter = 0;
  pile.value = [];
  ensurePile(cursor.value + 1 + PREVIEW);
  save();
}

function startNewGame() {
  confirming.value = false;
  if (mode.value === 1) {
    // 与 web 一致：新游戏要清掉闯关最高关卡与当前关卡
    setRaw(BEST_KEY + 1, '');
    setRaw(LEVEL_KEY, '');
    bestScore.value = 0;
    startLevel(1);
  } else {
    // 无尽：只清已用牌数与当前得分，最高分保留
    bestScore.value = +(getRaw(BEST_KEY + 2) || 0);
    startEndless();
  }
}

function retryLevel() {
  confirming.value = false;
  if (mode.value === 1) startLevel(level.value);
  else startEndless();
}

function nextLevel() {
  startLevel(level.value + 1);
}

function toggleMode() {
  save();
  mode.value = mode.value === 1 ? 2 : 1;
  setRaw(MODE_KEY, String(mode.value));
  bestScore.value = +(getRaw(BEST_KEY + mode.value) || 0);
  if (mode.value === 1) {
    level.value = Math.max(1, +(getRaw(LEVEL_KEY) || 1));
    if (!restore()) startLevel(level.value);
    else checkEnd(true);
  } else {
    if (!restore()) startEndless();
    else checkEnd(true);
  }
}

// ---------- 存档 ----------
const stateKey = () => (mode.value === 1 ? STATE_KEY : `${STATE_KEY}_2`);

// 棋盘逐张铺开的波浪：延迟按「行 + 列」递增，波前从左上角扫到右下角
const DEAL_MS = 340;
function startDeal() {
  dealing.value = true;
  dealSeq.value += 1;
  clearTimeout(dealTimer);
  dealTimer = setTimeout(() => { dealing.value = false; }, (SIZE - 1) * 2 * 60 + DEAL_MS);
}
const dealDelay = cell => (Math.floor(cell / SIZE) + (cell % SIZE)) * 60;

function save() {
  try {
    setRaw(stateKey(), JSON.stringify({
      mode: mode.value,
      level: level.value,
      score: score.value,
      played: played.value,
      combo: combo.value,
      phase: phase.value,
      board: board.value.map(t => (t ? pack(t) : null)),
      pile: pile.value.map(pack),
      cursor: cursor.value,
    }));
    if (mode.value === 1) {
      setRaw(LEVEL_KEY, String(level.value));
      const best = +(getRaw(BEST_KEY + 1) || 0);
      if (level.value > best) setRaw(BEST_KEY + 1, String(level.value));
    } else if (score.value > bestScore.value) {
      bestScore.value = score.value;
      setRaw(BEST_KEY + 2, String(score.value));
    }
  } catch { /* 存储写不进去也不影响玩 */ }
}

function restore() {
  try {
    const saved = getJSON(stateKey());
    if (!saved || !Array.isArray(saved.board) || saved.board.length !== CELLS) return false;
    if (saved.mode !== mode.value) return false;
    if ([PLAY, WON, OVER].indexOf(saved.phase) < 0) return false;
    if (!Array.isArray(saved.pile) || !saved.pile.length) return false;
    uidCounter = 0;
    board.value = saved.board.map(t => (t ? unpack(t) : null));
    pile.value = saved.pile.map(unpack).filter(Boolean);
    cursor.value = Math.min(Math.max(0, +saved.cursor || 0), Math.max(0, pile.value.length - 1));
    level.value = Math.max(1, +saved.level || 1);
    score.value = Math.max(0, +saved.score || 0);
    played.value = Math.max(0, +saved.played || 0);
    combo.value = Math.max(0, +saved.combo || 0);
    phase.value = saved.phase;
    ensurePile(cursor.value + 1 + PREVIEW);
    // 恢复的局面也按「从左上到右下」的波浪逐张出现（不然一进来牌是整块冒出来的）
    startDeal();
    muteHover();
    return true;
  } catch {
    return false;
  }
}

// ---------- 放置 ----------
function commitPlacement(idx, tile) {
  board.value = board.value.map((t, i) => (i === idx ? { ...tile } : t));
  advanceHand();
}

function advanceHand() {
  cursor.value += 1;
  played.value += 1;
  // 无尽模式的牌墙是无限的：丢掉已经翻过去的牌，否则存档会越存越大
  if (mode.value === 2 && cursor.value > 6) {
    pile.value = pile.value.slice(cursor.value - 1);
    cursor.value = 1;
  }
  ensurePile(cursor.value + 1 + PREVIEW);
}

// idx 上已经有牌时就是「替换」：手上的牌盖掉原来那张（原来那张直接弃掉，同样消耗一张手牌）
function placeByClick(idx) {
  const tile = hand.value;
  if (!tile) return;
  busy.value = true;
  commitPlacement(idx, tile);
  flyingTo.value = idx;
  flyTo(tile, idx, () => {
    flyingTo.value = -1;
    busy.value = false;
    settle();
  });
}

function placeByDrag(idx) {
  const tile = hand.value;
  if (!tile) return;
  commitPlacement(idx, tile);
  settle();
}

// 浮牌飞行（web 用 getBoundingClientRect + 固定定位）：小程序改成 selectorQuery 量位置，
// fixed 替身靠 transform 过渡飞过去；量不到就退化成「直接出现在目标格」（仍然会结算）。
function flyTo(tile, idx, done) {
  Promise.all([queryRect('.current'), queryRect('#cell-' + idx)]).then(([from, cell]) => {
    if (!from || !cell || !from.width || !cell.width) { done(); return; }
    const x = from.left + from.width / 2;
    const y = from.top + from.height / 2;
    flying.value = {
      tile,
      x,
      y,
      dx: cell.left + cell.width / 2 - x,
      dy: cell.top + cell.height / 2 - y,
      w: from.width,
      scale: cell.width / from.width,
      go: false,
    };
    // 先「落原位」，下一拍再改 transform 才会触发过渡（同一拍改没有动画）
    setTimeout(() => { if (flying.value) flying.value = { ...flying.value, go: true }; }, 30);
    clearTimeout(flyTimer);
    flyTimer = setTimeout(() => {
      flying.value = null;
      done();
    }, 230);
  });
}

const flyStyle = computed(() => {
  const f = flying.value;
  if (!f) return {};
  return {
    left: `${f.x}px`,
    top: `${f.y}px`,
    width: `${f.w}px`,
    height: `${Math.round(f.w * TILE_RATIO)}px`,
    transform: f.go
      ? `translate(-50%, -50%) translate(${f.dx}px, ${f.dy}px) scale(${f.scale})`
      : 'translate(-50%, -50%)',
  };
});

function onCellClick(idx) {
  if (Date.now() < suppressClickUntil) return;
  if (phase.value !== PLAY || busy.value || !hand.value) return;
  // 点击立刻给这个格子一个实线高亮反馈（450ms 后自动消失）
  flashCell.value = idx;
  clearTimeout(cellFlashTimer);
  cellFlashTimer = setTimeout(() => { flashCell.value = -1; }, 450);
  placeByClick(idx);
}

// ---------- 结算 ----------
const celebrateLife = tier => 1100 + tier * 220;

function settle() {
  const hits = scoringLines(board.value);
  if (hits.length) {
    // 连击：连续每次消除算一连，从第二连起每连一次多 50（中间没消掉就归零）
    combo.value += 1;
    // 一次落子可能同时成好几组：全部计分，并从第二组起每组再加 100，再叠加连击奖励
    const gained = hits.reduce((sum, h) => sum + h.trio.score, 0)
      + comboBonus(hits.length) + chainBonus(combo.value);
    const best = hits.reduce((a, b) => (b.trio.score > a.trio.score ? b : a));
    score.value += gained;
    playElimination();   // 落子凑成一组
    const cleared = new Set(hits.reduce((arr, h) => arr.concat(h.indices), []));
    const gone = new Map();
    cleared.forEach(i => { if (board.value[i]) gone.set(i, board.value[i]); });
    board.value = board.value.map((t, i) => (cleared.has(i) ? null : t));
    clearing.value = gone;
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => { clearing.value = new Map(); save(); }, 520);
    announceCelebration(best.trio.id, gained, hits.length, combo.value);
  } else {
    combo.value = 0;      // 这一手没消掉，连击断
  }
  // 结算层等得分浮字露一下脸（0.5s）再出现；没有得分就立即结算
  const wait = celebration.value ? RESULT_DELAY_MS : 0;
  clearTimeout(endTimer);
  if (wait) endTimer = setTimeout(() => { checkEnd(); save(); }, wait);
  else { checkEnd(); save(); }
}

// 先摘类名再重排，连续触发也能重播动画
function shakeBoard() {
  clearTimeout(shakeTimer);
  shaking.value = false;
  shakeTimer = setTimeout(() => {
    shaking.value = true;
    shakeTimer = setTimeout(() => { shaking.value = false; }, 340);
  }, 20);
}

function announceCelebration(trioId, gained, groups, chain = 1) {
  const tier = TIER_BY_SCORE(gained);
  celebration.value = {
    id: ++celebrationId,
    tier,
    gained,
    chain,
    name: groups > 1
      ? tt('comboName').replace('{n}', groups)
      : tt(trioId === 'triplet' ? 'tripletName' : 'runName'),
  };
  clearTimeout(celebrateTimer);
  celebrateTimer = setTimeout(() => { celebration.value = null; }, celebrateLife(tier));
  // 连击 / 多消：即使本次总分不到 300 也照 web 的处理震屏 + 外圈闪光；
  // 普通单次消除仍然低于 300 只有浮字。
  const special = groups > 1 || chain > 1;
  if (gained < FX_MIN && !special) return;
  shakeBoard();
  clearTimeout(flashTimer);
  celebrating.value = false;
  flashTimer = setTimeout(() => {
    celebrating.value = true;
    flashTimer = setTimeout(() => { celebrating.value = false; }, 900);
  }, 20);
  // 与 web 同表达式：多消 1、连击 0.7、普通单次按档位
  burstConfetti(groups > 1 ? 1 : (special ? 0.7 : tier));
}

// silent = true 时只补结算层、不播撒花（退出再进入时不该再放一次烟花）
function checkEnd(silent = false) {
  if (phase.value !== PLAY) return;
  if (mode.value === 1) {
    if (score.value >= cfg.value.target) {
      phase.value = WON;
      if (!silent) winEffect();
      if (level.value > bestScore.value) bestScore.value = level.value;
      return;
    }
    // 棋盘满不再是死局（点已有牌的格子可以替换），所以只有「牌用完还没达标」才算输
    if (cursor.value >= pile.value.length) {
      loseReason.value = 'deck';
      phase.value = OVER;
      playLose();
    }
    return;
  }
  // 无尽模式牌墙无限、又能替换，因此没有判负条件
}

// 彩带只在真正赢下的这一刻放；恢复存档的胜利态不放（与 web 一致）
function winEffect() {
  justWon.value = true;
  clearTimeout(wonTimer);
  wonTimer = setTimeout(() => { justWon.value = false; }, 4000);
  playWin();
}

// ---------- 拖拽（小程序没有 Pointer Events，用 touch） ----------
function touchPoint(e, changed) {
  const list = changed ? e.changedTouches : e.touches;
  const t = (list && list[0]) || (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
  if (!t) return null;
  return { x: t.clientX != null ? t.clientX : t.pageX, y: t.clientY != null ? t.clientY : t.pageY };
}

function onHandTouchStart(e) {
  if (phase.value !== PLAY || !hand.value) return;
  const p = touchPoint(e, false);
  if (!p) return;
  dragging.value = true;
  dragPos.value = p;
}

function onHandTouchMove(e) {
  if (!dragging.value) return;
  const p = touchPoint(e, false);
  if (p) dragPos.value = p;
}

function onHandTouchCancel() {
  dragging.value = false;
  dragPos.value = null;
}

function onHandTouchEnd(e) {
  if (!dragging.value) return;
  const p = touchPoint(e, true);
  dragging.value = false;
  dragPos.value = null;
  if (!p) return;
  cellAt(p.x, p.y).then(idx => {
    if (idx < 0) return;
    if (phase.value !== PLAY || !hand.value) return;
    // 拖拽落子后，浏览器可能再补一个 click：短时间内屏蔽掉，避免落两张
    suppressClickUntil = Date.now() + 400;
    placeByDrag(idx);
  });
}

// 屏幕坐标 → 格子下标（棋盘内边距 / 格子 / 缝都按量到的棋盘矩形等比换算）
function cellAt(x, y) {
  return queryRect('#board').then(rect => {
    if (!rect || !rect.width) return -1;
    // 棋盘矩形 → 当前 rpx 的口径（屏幕旋转 / 窗口变化后也能对上）
    const k = rect.width / boardW.value;
    const pad = PAD * k;
    const gap = GAP * k;
    const cellW = cw.value * k;
    const cellH = ch.value * k;
    const c = Math.floor((x - rect.left - pad) / (cellW + gap));
    const r = Math.floor((y - rect.top - pad) / (cellH + gap));
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return -1;
    return r * SIZE + c;
  });
}

// selectorQuery：先按组件作用域量，拿不到再退回页面作用域（与 web 的「量不到就退化成 CSS」一致）
function queryRect(selector) {
  return new Promise(resolve => {
    const run = (scoped) => {
      let q = uni.createSelectorQuery();
      if (scoped && instance && instance.proxy) q = q.in(instance.proxy);
      q.select(selector).boundingClientRect(rect => {
        if (rect && rect.width) resolve(rect);
        else if (scoped) run(false);
        else resolve(null);
      }).exec();
    };
    run(true);
  });
}

// ---------- 悬停光环静音 ----------
function muteHover() { hoverMuted.value = true; }
function unmuteHover() { hoverMuted.value = false; }

// ---------- 帮助 / 模式 ----------
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
  const savedMode = +(getRaw(MODE_KEY) || 1);
  mode.value = savedMode === 2 ? 2 : 1;
  bestScore.value = +(getRaw(BEST_KEY + mode.value) || 0);
  if (mode.value === 1) level.value = Math.max(1, +(getRaw(LEVEL_KEY) || 1));
  // 先把牌面图读进缓存再铺盘（H5 下有效；小程序没有 Image 全局，直接跳过 —— 牌面是内联 data URI）
  if (typeof Image !== 'undefined') {
    try { await preloadTiles(); } catch { /* 加载失败也不影响开局 */ }
  }
  if (!restore()) {
    if (mode.value === 1) startLevel(level.value);
    else startEndless();
  } else {
    // 恢复存档要补判一次；传 true：重进不重播撒花
    checkEnd(true);
  }
});

onUnmounted(() => {
  if (typeof uni.offWindowResize === 'function') uni.offWindowResize(onResize);
  clearTimers();
  save();
});
</script>

<style lang="scss" scoped>
/* web 的 keyframes 逐条搬过来（px → rpx 按 1.908 折算） */
@keyframes board-shake {
  0%, 100% { transform: translate(0, 0); }
  15% { transform: translate(-10rpx, 4rpx); }
  30% { transform: translate(8rpx, -6rpx); }
  45% { transform: translate(-6rpx, -4rpx); }
  60% { transform: translate(6rpx, 4rpx); }
}
@keyframes board-celebrate {
  0% { box-shadow: 0 0 0 0 transparent; }
  25% { box-shadow: 0 0 0 8rpx rgba(35, 128, 78, 0.5), 0 0 50rpx 15rpx rgba(35, 128, 78, 0.5); }
  100% { box-shadow: 0 0 0 0 transparent; }
}
@keyframes celebrate-pop {
  0% { opacity: 0; transform: translate(-50%, -30%) scale(0.4) rotate(-6deg); }
  28% { opacity: 1; transform: translate(-50%, -50%) scale(1.16) rotate(3deg); }
  44% { opacity: 1; transform: translate(-50%, -50%) scale(1) rotate(0deg); }
  78% { opacity: 1; transform: translate(-50%, -62%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -100%) scale(0.92); }
}
@keyframes tile-wave {
  from { opacity: 0; transform: translate(-34rpx, -34rpx) scale(0.45); }
  to { opacity: 1; transform: translate(0, 0) scale(1); }
}
@keyframes tile-in {
  from { transform: scale(0.24); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
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
  padding: 36rpx 24rpx 140rpx;   /* 底部让开右下角悬浮按钮 */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 36rpx;
  background: #f0f2f5;
  color: #2c3e50;
}

/* ---------- 分数区（web --row-height: 72px） ---------- */
.score-area {
  position: relative;
  overflow: hidden;
  width: 690rpx;
  height: 138rpx;
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
.stat-label { font-size: 23rpx; color: #5f6b7a; line-height: 1.2; }
.stat-value { font-size: 42rpx; font-weight: bold; line-height: 1.3; color: #2c3e50; }
.score-area.four .stat-value { font-size: 34rpx; }
.divider {
  width: 2rpx;
  height: 46rpx;
  align-self: center;
  background: #e1e1e1;
  opacity: 0.6;
}
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
  width: 690rpx;
  height: auto;              /* 牌比行高高，写死行高会盖住手牌 */
  min-height: 138rpx;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}
.opt-half {
  display: flex;
  align-items: center;
  justify-content: center;
}
.opt-half:first-child { flex: 1.6; }
.opt-half:last-child { flex: 1.2; }
.hand { gap: 15rpx; }
.tile-slot {
  overflow: hidden;          /* 裁出圆角（配合 tileStyle 内联的 borderRadius） */
  border-radius: 8rpx;       /* 与牌面圆角同口径，高亮环也沿它走 */
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}
.current {
  animation: tile-in 0.26s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  /* 高亮环画在槽位上（不是牌上）：box-shadow 会沿元素圆角铺开，
     画在牌上时那 4rpx 的 spread 会把四个角「补方」，看起来就是候选牌没有圆角 ✗ */
  border-radius: 8rpx;
  box-shadow: 0 0 0 4rpx #23804e;
}
.current.ghost { opacity: 0.35; }
/* 候选区主次：当前牌描边高亮（web 的 outline 2px + offset 1px，这里用 box-shadow 兼容 WXSS） */
/* 高亮环已移到 .current（槽位）上，牌这里不再画，避免把圆角遮成直角 */
.preview {
  display: flex;
  align-items: center;
  gap: 4rpx;
  opacity: 0.55;
}
.slot-hint { font-size: 23rpx; color: #5f6b7a; }

/* 操作按钮：web 的 .game-icon（8px 16px / 8px 圆角 / 14px 字号） */
.game-icon {
  margin: 0;
  padding: 0 31rpx;
  height: 74rpx;              /* web 实测 39px（14px 字 + 上下各 8px 内边距） */
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

/* ---------- 游戏区 ---------- */
.game-area {
  position: relative;
  margin: 0 auto;
}
.board {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-wrap: wrap;
  border-radius: 27rpx;
}
/* 点阵底纹（web App.vue 的 .dot-board；小程序没有全局那份，这里本地定义） */
.dot-board {
  background-color: #bbada0;
  background-image: radial-gradient(circle, rgba(255, 255, 255, 0.18) 2rpx, transparent 2rpx);
  background-size: 19rpx 19rpx;
  background-position: 9rpx 9rpx;
}
.board.shaking { animation: board-shake 0.34s ease; }
.board.celebrating { animation: board-celebrate 0.9s ease-out; }
/* 静音期间不画「已有牌」的悬停光环 */
.board.hover-muted .cell.actable:hover { box-shadow: none; }

.cell {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border-radius: 15rpx;
  border: 2rpx solid #c9d0da;
  background-color: rgba(255, 255, 255, 0.08);
}
.cell.placeable {
  border-color: #23804e;
  border-style: dashed;
}
.cell.actable { /* 手机上靠点击反馈（.flash），悬停光环只在 H5 生效 */ }
.cell.actable:hover { box-shadow: 0 0 0 4rpx #23804e; }
.cell.incoming .mj { opacity: 0; }
.cell.flash {
  border-style: solid;
  border-color: #23804e;
  box-shadow: 0 0 0 4rpx #23804e;
}
/* 恢复存档时棋盘逐张铺开（延迟由 dealDelay() 按行列注入） */
.mj.dealt { animation: tile-wave 0.34s cubic-bezier(0.34, 1.4, 0.64, 1) both; }

/* 刚消掉的牌：同格浮影层播「闪烁 → 消失」 */
.clearing {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  animation: blink-clear 0.52s ease-in-out forwards;
}

/* 得分浮字：棋盘正中弹出 */
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
  max-width: calc(100% - 16rpx);
  pointer-events: none;
  box-shadow: 0 11rpx 34rpx rgba(35, 128, 78, 0.5);
  animation: celebrate-pop 0.95s cubic-bezier(0.22, 1.2, 0.36, 1) forwards;
}
.celebrate-text { font-size: 34rpx; line-height: 1.2; }
.celebrate-chain { font-size: 25rpx; line-height: 1.2; margin-top: 4rpx; opacity: 0.95; }
.celebrate-score {
  font-size: 27rpx;
  line-height: 1.2;
  margin-top: 6rpx;
  opacity: 0.92;
  font-variant-numeric: tabular-nums;
}
.celebrate.tier-2 {
  box-shadow: 0 11rpx 38rpx rgba(35, 128, 78, 0.5), 0 0 0 6rpx rgba(35, 128, 78, 0.5);
}
.celebrate.tier-2 .celebrate-text { font-size: 40rpx; }
.celebrate.tier-3 {
  padding: 23rpx 42rpx;
  box-shadow: 0 15rpx 50rpx rgba(35, 128, 78, 0.5), 0 0 0 8rpx rgba(35, 128, 78, 0.5);
}
.celebrate.tier-3 .celebrate-text { font-size: 46rpx; }

/* 结算层：与棋盘矩形完全重合（left/top/width/height 由父级 690×867 决定） */
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
.result-btns {
  display: flex;
  align-items: center;
  justify-content: center;   /* 按钮组整体居中 */
  gap: 23rpx;
  width: 100%;
}
.result-btns .game-icon { flex: 0 0 auto; }

/* ---------- 拖拽 / 飞行替身 ---------- */
.drag-ghost {
  position: fixed;
  z-index: 50;
  width: 84rpx;
  height: 108rpx;
  pointer-events: none;
  transform: translate(-50%, -50%) scale(1.06);
  filter: drop-shadow(0 11rpx 23rpx rgba(0, 0, 0, 0.25));
}
.fly-tile {
  position: fixed;
  z-index: 60;
  pointer-events: none;
  transition: transform 0.2s ease-out;
  filter: drop-shadow(0 8rpx 19rpx rgba(0, 0, 0, 0.22));
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
