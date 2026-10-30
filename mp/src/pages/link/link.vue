<template>
  <view class="screen">
    <!-- 全站背景（粒子连线 + 底部过山车，与 web 的 ParticleBackground 同款） -->
    <ParticleBackground />
    <view class="page">
      <!-- 统计条：关卡 / 剩余时间 / 剩余对数（web 的 .card.score-area）+ 本关进度条 -->
      <view class="card score-area">
        <view class="stat">
          <text class="stat-label">{{ tt('levelLabel') }}</text>
          <text class="stat-value">{{ level }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('timeLeft') }}</text>
          <text class="stat-value" :class="{ urgent: timeLeft <= 15 }">{{ fmt(timeLeft) }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('leftPairs') }}</text>
          <text class="stat-value">{{ leftPairs }}</text>
        </view>
        <!-- 本关进度条（已消除对数 / 总对数），贴在统计卡底边（web 的 .progress） -->
        <view class="progress"><view class="progress-bar" :style="{ width: progress + '%' }" /></view>
      </view>

      <!-- 操作区：左侧盘面信息（行列 · 种类 · 墙数）+ 右侧「新游戏」（web 的 .opt-area，1.6 : 1.2） -->
      <view class="card opt-area">
        <view class="opt-half">
          <text class="level-note">{{ boardLabel }}</text>
        </view>
        <view class="divider" />
        <view class="start-wrapper">
          <button class="game-icon" hover-class="none" @click="confirming = true">{{ tt('start') }}</button>
        </view>
      </view>

      <!-- 游戏区：尺寸由「格子 × 行列」反算（web 的 .game-area，棋盘与它等大） -->
      <view class="game-area" :style="{ width: boardW + 'rpx', height: boardH + 'rpx' }">
        <view class="board">
          <!-- 逐格渲染：牌 / 墙 / 正在消失的幻影牌都落在同一份格子上 -->
          <view
            v-for="cell in cells"
            :key="'cell-' + cell.i"
            class="cell"
            :style="cellStyle(cell)"
          >
            <button
              v-if="cell.emoji"
              class="tile"
              :class="tileClass(cell)"
              :style="tileStyle(cell)"
              hover-class="none"
              @click="onTileClick(cell.r, cell.c)"
            ><text class="tile-face">{{ cell.emoji }}</text></button>
            <view v-else-if="cell.wall" class="wall-block" />
            <view
              v-if="ghostAt(cell.r, cell.c)"
              class="tile-ghost"
              :style="{ fontSize: fontRpx + 'rpx' }"
            >{{ ghostAt(cell.r, cell.c).emoji }}</view>
          </view>

          <!-- 连线：web 是 SVG polyline（stroke-dasharray 画出来再淡出）。
               小程序没有 SVG，这里把路径拆成逐段「圆头细条」，同样先「画」再淡出 -->
          <view v-if="linkSegments.length" class="link-layer">
            <view
              v-for="seg in linkSegments"
              :key="'halo-' + seg.key"
              class="link-halo"
              :class="seg.h ? 'h' : 'v'"
              :style="seg.halo"
            />
            <view
              v-for="seg in linkSegments"
              :key="'line-' + seg.key"
              class="link-line"
              :class="seg.h ? 'h' : 'v'"
              :style="seg.line"
            />
          </view>

          <!-- 连击提示：落在棋盘上方那条 31rpx 的空隙里（web 的 .combo-tip） -->
          <view
            v-if="comboTip"
            class="combo-tip"
            :class="[comboTipClass, comboTip.pop]"
          >{{ comboTipText }}</view>
          <view v-if="shuffleTip" class="shuffle-tip">{{ tt('shuffleTip') }}</view>

          <!-- 结算层：盖住棋盘（web 的 .result，按钮规格走 App.vue 全局） -->
          <view v-if="phase === WON" class="result win">
            <text>🎉🎉 {{ tt('levelDone').replace('{n}', level) }} 🎉🎉</text>
            <text class="final-time">{{ fmt(elapsed) }}</text>
            <view class="result-btns">
              <button class="btn ghost" hover-class="none" @click="replayLevel">{{ tt('replayLevel') }}</button>
              <button class="btn" hover-class="none" @click="nextLevel">{{ tt('nextLevel') }}</button>
            </view>
          </view>
          <view v-else-if="phase === OVER" class="result lose">
            <text>⏰ {{ tt('timeUp') }} ⏰</text>
            <text class="final-time">{{ leftPairs }} {{ tt('leftPairsShort') }}</text>
            <view class="result-btns">
              <button class="btn ghost" hover-class="none" @click="replayLevel">{{ tt('replayLevel') }}</button>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 胜利彩带（纯 CSS 降级版，web 是 confetti canvas） -->
    <Confetti v-if="justWon" />
    <FloatingActions>
      <view class="fab" @click="showHelp"><view class="fab-ico i-carbon-help" /></view>
    </FloatingActions>
    <!-- 连击烟花粒子层（共享实现：@/core/firework 的 burstAtElement → 这里渲染） -->
    <FireworkBurst />
    <!-- 新游戏二次确认：自绘三按钮弹窗（web 的 shared/ConfirmDialog 同款） -->
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
    <HelpSheet :open="helpOpen" :text="helpText" @close="helpOpen = false" />
  </view>
</template>

<script setup>
// Emoji 连连看 · 微信小程序版
// 玩法逻辑逐行对照 web 的 src/games/link/LinkGame.vue：关卡曲线 / 发牌 / ≤2 转折连线 /
// 死局重排 / 连击窗口 / 空闲提示 / 存档结构全部一致，纯逻辑来自 web 的 board.js（**逐字节复制**）。
// 平台差异（都已尽量就地还原，详见交付说明）：
// - 存档：localStorage → @/core/storage（key 与 web 一字不差：__emoji_link__*）
// - 音效：Web Audio → @/core/sfx（消除 playElimination / 失败 playLose / 过关 playWin，落点与 web 一致）
// - 计时：shared/CountTimer.vue → setInterval（1s，切后台暂停、回来自动续上，与 CountTimer 行为一致）
// - 连线：SVG polyline + dasharray → 逐段圆头条 + 逐段「画出来」再淡出（没有 SVG / 没有 dash 动画）
// - 连击烟花：canvas-confetti → @/core/firework 的 burstAtElement（喷发点 = 提示条中心往下 30px，与 web 的 comboOrigin 一致）
// - 二次确认：shared/ConfirmDialog（三按钮）→ uni.showModal（两按钮）
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { onHide, onShow } from '@dcloudio/uni-app';

import Confetti from '@/components/Confetti.vue';
import FireworkBurst from '@/components/FireworkBurst.vue';
import FloatingActions from '@/components/FloatingActions.vue';
import HelpSheet from '@/components/HelpSheet.vue';
import { burstAtElement } from '@/core/firework';
import { setNavTitle } from '@/core/i18n';
import { playElimination, playLose, playWin } from '@/core/sfx';
import { getJSON, getRaw, setJSON, setRaw } from '@/core/storage';
import { EMOJIS } from '@/shared/emojis';
import { findPath, generateBoard, generateLevelBoard, hasMove, levelConfig, shuffleBoard } from './board';
import { tt } from './i18n';
import ParticleBackground from '@/components/ParticleBackground.vue';

// 原生导航栏标题跟随语言（pages.json 里的标题是静态的）
setNavTitle(() => tt('gameTitle'));

// ---------- 存档 key：与 web 一字不差 ----------
const KEY_PREFIX = '__emoji_link__';
const LEVEL_KEY = `${KEY_PREFIX}level`;        // 当前关卡
const BEST_KEY = `${KEY_PREFIX}best_1`;        // 历史最高关卡（沿用「前缀+数字」以便连点标题清记录）
const STATE_KEY = `${KEY_PREFIX}state`;        // 局面（盘面 / 墙 / 关卡 / 已用秒数 / 胜负状态）

const [PLAY, WON, OVER] = ['play', 'won', 'over'];
// 连击：两次消除之间没有无效点击、且间隔在 COMBO_MS 内才算连上
const COMBO_MS = 2500;
const COMBO_TIP_MS = 1500;
// 空闲提示：6s 无操作时高亮一对可连的牌
const IDLE_HINT_MS = 6000;

// ---------- rpx 几何 ----------
// web：棋盘宽 = min(min(innerWidth, 440) − 32, (innerHeight − 340) × cols / rows)，格子 = 宽 / cols。
// 这里按同一口径换算成 rpx：内容宽上限 690rpx（= 361px，393 屏），高度按「视口 − 固定块 − 让开悬浮按钮」算。
const BOARD_MAX_W = 690;
// 页面里除棋盘外的固定高度（rpx）：上内边距 27 + 分数卡 168 + 间距 31 + 操作区 120 + 间距 31
const PAGE_FIXED_H = 27 + 168 + 31 + 120 + 31;
// 右下角悬浮按钮组从视口底部往上占的高度：96 + 24 + 96 = 216，再加 16 底距与一点呼吸 → 240
const FAB_BASE_H = 240;
const MIN_CELL = 46;            // 兜底：极端小屏也不至于小到点不中
const LANE_GAP = 0.14;          // 棋盘外那一圈虚拟通道（web 的 LANE_GAP）
const ENDPOINT_INSET = 0.42;    // 连线端点从牌中心沿路径内缩（web 的 ENDPOINT_INSET）
const LINK_W = 0.08;            // 线宽（web stroke-width 0.08 格）
const LINK_HALO_W = 0.18;       // 光晕宽（web 0.18 格）

// ---------- 响应式状态 ----------
const level = ref(loadLevel());
const bestLevel = ref(Math.max(level.value, Math.floor(+(getRaw(BEST_KEY) || 1)) || 1));
const board = ref([]);
// 当前局的墙壁网格（H×W 0/1），由关卡配置决定
const walls = ref([]);
const phase = ref(PLAY);
const selected = ref(null);
const mismatch = ref(null);
const vanishing = ref([]);
const linkPath = ref(null);
const linkKey = ref(0);
const shuffleTip = ref(false);
const comboTip = ref(null);
const combo = ref(0);
// 彩带只在真正赢下的那一刻放（恢复存档的胜利态不放，与 web 一致）
const justWon = ref(false);
const helpOpen = ref(false);
// 「新游戏」二次确认（三按钮：取消 / 重玩本关 / 确定重来，与 web 的 ConfirmDialog 一致）
const confirming = ref(false);

let lastClearAt = 0;
let comboBroken = false;
let comboSeq = 0;
let comboTimer = null;
let comboTipTimer = null;
let dealTimer = null;
let idleTimer = null;
let hintTimer = null;
let linkTimer = null;
let vanishId = 0;
let vanishTimers = [];
let shuffleTimer = null;
let shuffleTipTimer = null;
let mismatchTimer = null;
let winTimer = null;
let wonTimer = null;
const dealing = ref(false);
const hintPair = ref(null);
// 上一次提示的对（pokeIdle 清 hintPair 但保留它，用于连续提示时换一对）
let lastHintPair = null;

const elapsed = ref(0);
let tickTimer = null;

const viewport = ref({ w: 375, h: 667, safeBottom: 0 });

const conf = computed(() => levelConfig(level.value));
const size = computed(() => [conf.value.rows, conf.value.cols]);
const leftPairs = computed(() => board.value.flat().filter(Boolean).length / 2);
const timeLeft = computed(() => Math.max(0, conf.value.time - elapsed.value));
// 本关进度：已消除的对数占本关总对数的比例
const progress = computed(() => {
  const total = conf.value.pairs;
  return total ? Math.min(100, Math.round(((total - leftPairs.value) / total) * 100)) : 0;
});
const boardLabel = computed(() => {
  const c = conf.value;
  return `${c.rows}×${c.cols} · ${tt('kindsLabel').replace('{n}', c.kinds)}`
    + (c.walls ? ` · ${tt('wallsLabel').replace('{n}', c.walls)}` : '');
});

// 视口 → rpx：H5 的 innerHeight 含 uni 自带导航栏（44px），小程序 windowHeight 已扣掉原生导航栏
function readViewport() {
  let w = 375;
  let h = 667;
  let safeBottom = 0;
  try {
    const s = uni.getSystemInfoSync();
    w = s.windowWidth || w;
    h = s.windowHeight || h;
    const insets = s.safeAreaInsets;
    if (insets && insets.bottom != null) safeBottom = insets.bottom;
    else if (s.safeArea && s.screenHeight) safeBottom = Math.max(0, s.screenHeight - s.safeArea.bottom);
  } catch { /* 取不到就用默认值 */ }
  if (typeof window !== 'undefined' && window.innerWidth) {
    const head = typeof document !== 'undefined' ? document.querySelector('uni-page-head') : null;
    w = window.innerWidth;
    h = window.innerHeight - (head ? head.offsetHeight : 0);
    safeBottom = 0;   // H5 没有 home 指示条，悬浮按钮的 env(safe-area-inset-bottom) 为 0
  }
  return { w, h, safeBottom };
}

// 悬浮按钮让位：真机上 bottom 还要加 env(safe-area-inset-bottom)，所以高度里也带上
const fabReserve = computed(() => FAB_BASE_H + Math.round((viewport.value.safeBottom * 750) / (viewport.value.w || 375)));

// 格子尺寸：宽高都要放得下（10×12 的大关卡以高度为准）
const cellRpx = computed(() => {
  const { rows, cols } = conf.value;
  const pxToRpx = 750 / (viewport.value.w || 375);
  const availH = Math.max(300, viewport.value.h * pxToRpx - PAGE_FIXED_H - fabReserve.value);
  return Math.max(MIN_CELL, Math.min(BOARD_MAX_W / cols, availH / rows));
});
const boardW = computed(() => round1(cellRpx.value * conf.value.cols));
const boardH = computed(() => round1(cellRpx.value * conf.value.rows));
// web 的 --font = max(13, round(cell × 0.46))px
const fontRpx = computed(() => Math.max(25, Math.round(cellRpx.value * 0.46)));

function round1(n) {
  return Math.round(n * 10) / 10;
}
function rpx(n) {
  return `${round1(n)}rpx`;
}

// 逐格数据：牌面 / 墙都取同一份 (r, c) → 牌、墙、幻影三者的坐标数学只有一份
const cells = computed(() => {
  const b = board.value;
  const out = [];
  for (let r = 0; r < b.length; r++) {
    const row = b[r];
    for (let c = 0; c < row.length; c++) {
      out.push({ i: r * row.length + c, r, c, emoji: row[c] || '', wall: !!(walls.value[r] && walls.value[r][c]) });
    }
  }
  return out;
});

function cellStyle(cell) {
  return {
    left: rpx(cell.c * cellRpx.value),
    top: rpx(cell.r * cellRpx.value),
    width: rpx(cellRpx.value),
    height: rpx(cellRpx.value),
  };
}

// 发牌动画只在 dealing 期间生效；结束后规则彻底移除，避免 selected / shaking 切换时重播导致牌「消失重现」
function tileClass(cell) {
  const sel = isSelected(cell.r, cell.c);
  const shake = isShaking(cell.r, cell.c);
  return {
    selected: sel,
    shaking: shake,
    hinting: isHinting(cell.r, cell.c),
    dealing: dealing.value && !sel && !shake,
  };
}

// 入场错峰序号 = 行 + 列（左上 → 右下的斜向波浪，同一斜线上的牌一起出现）
function tileStyle(cell) {
  return {
    fontSize: `${fontRpx.value}rpx`,
    animationDelay: `${dealing.value ? (cell.r + cell.c) * 25 : 0}ms`,
  };
}

// ---------- 计时（web 的 shared/CountTimer.vue：每秒回调、页面隐藏时暂停） ----------
function fmt(sec) {
  return ('00' + ~~(sec / 60)).slice(-2) + ':' + ('00' + sec % 60).slice(-2);
}
function startTick() {
  if (tickTimer) return;
  tickTimer = setInterval(onTimerTick, 1000);
}
function stopTick() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
}
function resetTick() {
  stopTick();
  elapsed.value = 0;
  startTick();
}
function restoreTick(sec) {
  stopTick();
  elapsed.value = Math.max(0, +sec || 0);
  startTick();
}

function onTimerTick() {
  elapsed.value += 1;
  if (phase.value !== PLAY) return;
  // 限时到：时间用尽即失败（剩余牌没消完）
  if (timeLeft.value <= 0) {
    loseLevel();
    return;
  }
  patchSavedTime();
}

// 每秒把已用秒数写回存档（web 的 onTimerTick 也是「读旧档 → 只改 time → 写回」）
function patchSavedTime() {
  const saved = getJSON(STATE_KEY);
  if (!saved) return;
  saved.time = elapsed.value;
  setJSON(STATE_KEY, saved);
}

// ---------- 存档 ----------
function save() {
  if (!board.value.length) return;
  setJSON(STATE_KEY, {
    board: board.value,
    walls: walls.value,
    level: level.value,
    time: elapsed.value,
    phase: phase.value,
  });
}

function loadLevel() {
  return Math.max(1, Math.floor(+(getRaw(LEVEL_KEY) || 1)) || 1);
}

// 恢复退出前的局面：棋盘 + 关卡 + 墙壁 + 用时 + 胜负状态
let shuffledOnRestore = false;
function restore() {
  try {
    const saved = getJSON(STATE_KEY);
    if (!saved || !Array.isArray(saved.board) || !saved.board.length) return null;
    const c = levelConfig(+(saved.level || 1));
    const [H, W] = [c.rows, c.cols];
    if (saved.board.length !== H || !Array.isArray(saved.board[0]) || saved.board[0].length !== W) return null;
    let restoredWalls = [];
    if (Array.isArray(saved.walls) && saved.walls.length === H
      && Array.isArray(saved.walls[0]) && saved.walls[0].length === W) {
      restoredWalls = saved.walls.map(row => row.slice());
    }
    let restored = saved.board.map(row => row.slice());
    const remaining = restored.flat().filter(Boolean).length;
    level.value = c.level;
    if (level.value > bestLevel.value) bestLevel.value = level.value;
    if (saved.phase === WON && !remaining) {
      phase.value = WON;
    } else if (saved.phase === OVER && remaining) {
      phase.value = OVER;
      playLose();
    } else if (remaining) {
      phase.value = PLAY;
      // 存档时正处于死局重排的间隙：恢复后立即重排（同样带发牌动画）
      if (!hasMove(restored, H, W, restoredWalls)) {
        const rest = restored.flat().filter(Boolean);
        restored = shuffleBoard(restored, H, W, Math.random, restoredWalls);
        if (!hasMove(restored, H, W, restoredWalls)) {
          restored = generateBoard(H, W, rest, Math.random, rest.length / 2, restoredWalls);
        }
        shuffledOnRestore = true;
      }
    } else {
      return null;
    }
    board.value = restored;
    walls.value = restoredWalls;
    if (phase.value === PLAY) startDealing();
    if (shuffledOnRestore) shuffleTip.value = true;
    shuffledOnRestore = false;
    return saved.time || 0;
  } catch {
    return null;
  }
}

// ---------- 发牌 ----------
// 触发逐个入场动画；totalDelay 后结束（动画本身 0.35s）
function startDealing() {
  clearTimeout(dealTimer);
  dealing.value = true;
  // 最长延迟 = (行数 + 列数 - 2) × 25ms，再加动画本身的 0.35s
  dealTimer = setTimeout(() => {
    dealing.value = false;
  }, (conf.value.rows + conf.value.cols) * 25 + 350);
}

// ---------- 空闲提示 ----------
// 任何玩家交互后调用：清掉提示并重新起 6s 计时
function pokeIdle() {
  hintPair.value = null;
  clearTimeout(hintTimer);
  clearTimeout(idleTimer);
  if (phase.value !== PLAY) return;
  idleTimer = setTimeout(showHint, IDLE_HINT_MS);
}

// 找一对可连的牌播放呼吸缩放；播完（2 次循环 ≈ 1.6s）后重新计时。
// 连续提示时换一对不同的（排除上一次提示过的那对，随机挑选）
function showHint() {
  if (phase.value !== PLAY) return;
  const [H, W] = size.value;
  const byEmoji = new Map();
  board.value.forEach((row, r) => row.forEach((v, c) => {
    if (!v) return;
    if (!byEmoji.has(v)) byEmoji.set(v, []);
    byEmoji.get(v).push([r, c]);
  }));
  const connectable = [];
  for (const positions of byEmoji.values()) {
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const [r1, c1] = positions[i];
        const [r2, c2] = positions[j];
        if (findPath(board.value, H, W, r1, c1, r2, c2, walls.value)) {
          connectable.push([[r1, c1], [r2, c2]]);
        }
      }
    }
  }
  if (connectable.length) {
    let pool = connectable;
    if (lastHintPair && connectable.length > 1) {
      const [pr1, pc1] = lastHintPair[0];
      const [pr2, pc2] = lastHintPair[1];
      const same = ([[a], [b]]) => a[0] === pr1 && a[1] === pc1 && b[0] === pr2 && b[1] === pc2;
      pool = connectable.filter(p => !same(p));
    }
    const pick = pool[~~(Math.random() * pool.length)];
    hintPair.value = pick;
    lastHintPair = pick;
    hintTimer = setTimeout(pokeIdle, 1700);
    return;
  }
  // 无可连对（死局重排即将触发）时不提示
  hintTimer = setTimeout(pokeIdle, IDLE_HINT_MS);
}

function isHinting(r, c) {
  return !!hintPair.value && hintPair.value.some(([hr, hc]) => hr === r && hc === c);
}
function isSelected(r, c) {
  return !!selected.value && selected.value[0] === r && selected.value[1] === c;
}
function isShaking(r, c) {
  return !!mismatch.value && mismatch.value.some(([mr, mc]) => mr === r && mc === c);
}

// 幻影牌（消除动画的替身）：位置与盘面上的牌共用同一份 cell 坐标
const ghostMap = computed(() => {
  const map = {};
  for (const g of vanishing.value) map[g.r * 1000 + g.c] = g;
  return map;
});
function ghostAt(r, c) {
  return ghostMap.value[r * 1000 + c] || null;
}

// ---------- 连线层 ----------
// 连线层就是棋盘本身那么大：格子中心 = (c + 0.5, r + 0.5) 格，
// 棋盘外那一圈落在 -LANE_GAP / W + LANE_GAP（web 的 linkLayerStyle / linkViewBox 同口径）
const linkSegments = computed(() => {
  const pts = linkPath.value || [];
  if (pts.length < 2) return [];
  const [H, W] = size.value;
  const seq = linkKey.value;
  const cell = cellRpx.value;
  const lineT = LINK_W * cell;
  const haloT = LINK_HALO_W * cell;
  const xy = pts.map(([r, c]) => {
    let x = c + 0.5;
    let y = r + 0.5;
    if (c === -1) x = -LANE_GAP;
    else if (c === W) x = W + LANE_GAP;
    if (r === -1) y = -LANE_GAP;
    else if (r === H) y = H + LANE_GAP;
    return [x * cell, y * cell];
  });
  // 端点沿路径方向内缩，让线贴近牌的边缘起止
  const inset = (idx, towards) => {
    const [x1, y1] = xy[idx];
    const [x2, y2] = xy[towards];
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    xy[idx] = [
      x1 + ((x2 - x1) / len) * ENDPOINT_INSET * cell,
      y1 + ((y2 - y1) / len) * ENDPOINT_INSET * cell,
    ];
  };
  inset(0, 1);
  inset(xy.length - 1, xy.length - 2);

  const out = [];
  for (let i = 0; i < xy.length - 1; i++) {
    const [x1, y1] = xy[i];
    const [x2, y2] = xy[i + 1];
    const h = Math.abs(y2 - y1) < 0.001;
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    if (dx < 0.001 && dy < 0.001) continue;
    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    // 圆头线段：两端各多出半个线宽，看起来与 SVG 的 stroke-linecap: round 一致
    const box = (t) => (h
      ? { left: rpx(minX - t / 2), top: rpx(y1 - t / 2), width: rpx(dx + t), height: rpx(t) }
      : { left: rpx(x1 - t / 2), top: rpx(minY - t / 2), width: rpx(t), height: rpx(dy + t) });
    const origin = h
      ? (x2 >= x1 ? 'left center' : 'right center')
      : (y2 >= y1 ? 'center top' : 'center bottom');
    out.push({
      key: `${seq}-${i}`,
      h,
      halo: { ...box(haloT), transformOrigin: origin },
      line: { ...box(lineT), transformOrigin: origin },
    });
  }
  return out;
});

// ---------- 关卡控制 ----------
function clearTransient() {
  clearTimeout(linkTimer);
  linkTimer = null;
  clearTimeout(dealTimer);
  dealTimer = null;
  dealing.value = false;
  clearTimeout(idleTimer);
  idleTimer = null;
  clearTimeout(hintTimer);
  hintTimer = null;
  hintPair.value = null;
  lastHintPair = null;
  vanishTimers.forEach(clearTimeout);
  vanishTimers = [];
  clearTimeout(shuffleTimer);
  shuffleTimer = null;
  clearTimeout(shuffleTipTimer);
  shuffleTipTimer = null;
  clearTimeout(comboTimer);
  comboTimer = null;
  clearTimeout(comboTipTimer);
  comboTipTimer = null;
  comboTip.value = null;
  combo.value = 0;
  lastClearAt = 0;
  comboBroken = false;
  clearTimeout(winTimer);
  winTimer = null;
  clearTimeout(wonTimer);
  wonTimer = null;
  justWon.value = false;
  clearTimeout(mismatchTimer);
  mismatchTimer = null;
  mismatch.value = null;
  vanishing.value = [];
  linkPath.value = null;
  shuffleTip.value = false;
}

async function initLevel(lv) {
  clearTransient();
  level.value = Math.max(1, lv);
  setRaw(LEVEL_KEY, String(level.value));
  if (level.value > bestLevel.value) {
    bestLevel.value = level.value;
    setRaw(BEST_KEY, String(bestLevel.value));
  }
  const c = conf.value;
  const [H, W] = [c.rows, c.cols];
  // 先渲染空矩阵销毁全部旧牌元素再填充：牌按坐标 :key 复用，
  // 若直接换盘，同坐标的旧元素不会重播发牌动画、旧 emoji 会瞬间可见
  board.value = Array.from({ length: H }, () => Array.from({ length: W }, () => null));
  walls.value = [];
  await nextTick();
  const { board: next, walls: nextWalls } = generateLevelBoard(H, W, EMOJIS, c);
  board.value = next;
  walls.value = nextWalls;
  phase.value = PLAY;
  selected.value = null;
  resetTick();
  startDealing();
  pokeIdle();
  save();
}

function nextLevel() {
  initLevel(level.value + 1);
}
function replayLevel() {
  confirming.value = false;
  initLevel(level.value);
}

// 新游戏：清除闯关记录（最高关卡）并从第 1 关重新开始，任何时候点都要二次确认
function startNewGame() {
  confirming.value = false;
  setRaw(BEST_KEY, '');        // 空串在 core/storage 里读出来就是 null，等同 web 的 removeItem
  bestLevel.value = 1;
  initLevel(1);
}

// ---------- 点击 ----------
function onTileClick(r, c) {
  if (phase.value !== PLAY || !board.value[r][c]) return;
  // §零.7：绝不写「等动画」的全局锁 —— 只挡正在抖动的那两张牌（它们刚被消费），
  // 其它牌照常响应，玩家点得快也必须有反应
  if (isShaking(r, c)) return;
  pokeIdle();
  if (!selected.value) {
    selected.value = [r, c];
    return;
  }
  const [sr, sc] = selected.value;
  if (sr === r && sc === c) {
    selected.value = null;
    breakCombo();                  // 取消选择：这一下没有消掉任何牌
    return;
  }
  const [H, W] = size.value;
  if (board.value[sr][sc] !== board.value[r][c]) {
    // emoji 不同：静默把焦点切换到刚点的牌
    selected.value = [r, c];
    breakCombo();                  // 点到的牌没被消掉 → 连击中断
    return;
  }
  const path = findPath(board.value, H, W, sr, sc, r, c, walls.value);
  if (!path) {
    // 相同但路径不通：双牌抖动提示
    onMismatch([sr, sc], [r, c]);
    breakCombo();                  // 连线不通 → 连击中断
    return;
  }
  removePair(path, [sr, sc], [r, c]);
}

// ---------- 连击 ----------
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

// 连击提示条是「同一条」元素，靠切换两条同内容的关键帧名重播动画（§零.10 的做法）
const comboTipText = computed(() => (comboTip.value ? tt('comboTip').replace('{n}', comboTip.value.n) : ''));
const comboTipClass = computed(() => `n-${Math.min(comboTip.value ? comboTip.value.n : 1, 4)}`);

async function showCombo(n) {
  comboSeq += 1;
  // §零.10：同一条提示条靠「切换两条同内容的关键帧名」重播动画（不能靠布尔 flag）
  comboTip.value = { id: comboSeq, n, pop: comboSeq % 2 ? 'pop-a' : 'pop-b' };
  clearTimeout(comboTipTimer);
  comboTipTimer = setTimeout(() => { comboTip.value = null; }, COMBO_TIP_MS);
  // 与 web 一致：喷发点 = 提示条中心往下 30px（提示条刚渲染出来才量得到，所以放 nextTick）
  await nextTick();
  burstAtElement('.combo-tip', Math.min(3, 1 + (n - 2) * 0.6), { count: Math.min(44, 12 + n * 4) });
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

function onMismatch(a, b) {
  mismatch.value = [a, b];
  selected.value = null;
  clearTimeout(mismatchTimer);
  mismatchTimer = setTimeout(() => {
    if (mismatch.value) mismatch.value = null;
  }, 400);
}

function removePair(path, a, b) {
  const [ar, ac] = a;
  const [br, bc] = b;
  const ghosts = [
    { id: ++vanishId, r: ar, c: ac, emoji: board.value[ar][ac] },
    { id: ++vanishId, r: br, c: bc, emoji: board.value[br][bc] },
  ];
  // 数据立即消除（后续连通判断基于新盘面），动画交给幻影牌独立播放
  board.value[ar][ac] = null;
  board.value[br][bc] = null;
  selected.value = null;
  registerClear();          // 消掉一对了：结算连击
  playElimination();

  clearTimeout(linkTimer);
  linkKey.value += 1;
  linkPath.value = path;
  linkTimer = setTimeout(() => {
    linkPath.value = null;
  }, 800);

  vanishing.value.push(...ghosts);
  vanishTimers.push(setTimeout(() => {
    vanishing.value = vanishing.value.filter(g => !ghosts.some(x => x.id === g.id));
  }, 600));

  const [H, W] = size.value;
  if (!board.value.flat().some(Boolean)) {
    win();
    return;
  }
  if (!hasMove(board.value, H, W, walls.value)) {
    // 等连线动画播完再重排；重排本身带逐个入场的 deal 动画
    shuffleTimer = setTimeout(async () => {
      if (phase.value !== PLAY || hasMove(board.value, H, W, walls.value)) return;
      const before = board.value;
      const rest = before.flat().filter(Boolean);
      // 先在原位置集合上重排；若救不活（如仅剩的一对被墙围死，任何排列都无解），
      // 退而重新生成一局等对数的新盘面
      let next = shuffleBoard(before, H, W, Math.random, walls.value);
      if (!hasMove(next, H, W, walls.value)) {
        next = generateBoard(H, W, rest, Math.random, rest.length / 2, walls.value);
      }
      // 先清空渲染（销毁旧牌元素）再填充，让重排重播发牌动画
      board.value = Array.from({ length: H }, () => Array.from({ length: W }, () => null));
      await nextTick();
      board.value = next;
      selected.value = null;
      shuffleTip.value = true;
      startDealing();
      pokeIdle();
      clearTimeout(shuffleTipTimer);
      shuffleTipTimer = setTimeout(() => {
        shuffleTip.value = false;
      }, 1600);
      save();
    }, 650);
  }
  save();
}

function win() {
  stopTick();
  phase.value = WON;
  // 过关：闯关进度推进到下一关（万一没有结算存档，下次进入直接开新关）
  setRaw(LEVEL_KEY, String(level.value + 1));
  if (level.value + 1 > bestLevel.value) {
    bestLevel.value = level.value + 1;
    setRaw(BEST_KEY, String(bestLevel.value));
  }
  // 胜利局面也落盘：退出重进还是这个结算层（计时钟停着），
  // 由玩家自己决定点「下一关」还是回主页
  save();
  // 结算遮罩等最后一对的消除动画播完再出现（web 是 600ms 后 confetti，celebrate 里播 playWin）
  clearTimeout(winTimer);
  winTimer = setTimeout(() => {
    justWon.value = true;
    playWin();
    clearTimeout(wonTimer);
    wonTimer = setTimeout(() => { justWon.value = false; }, 4000);
  }, 600);
}

function loseLevel() {
  stopTick();
  phase.value = OVER;
  playLose();
  clearTimeout(idleTimer);
  clearTimeout(hintTimer);
  hintPair.value = null;
  save();                                // 失败局面也存档：退出重进还是这一关，等玩家自己重玩
}

// ---------- 帮助 ----------
// web 的 HelpDialog：helpMsg + help1..N 用空行分段（HelpSheet 按 \n\n 拆段）
const helpText = computed(() => {
  const parts = [tt('helpMsg')];
  for (let i = 1; i <= 10; i += 1) {
    const k = `help${i}`;
    const v = tt(k);
    if (v && v !== k) parts.push(v);
  }
  return parts.join('\n\n');
});

function showHelp() {
  helpOpen.value = true;
}

// ---------- 生命周期 ----------
function onResize() {
  viewport.value = readViewport();
}

onMounted(async () => {
  onResize();
  if (typeof uni.onWindowResize === 'function') uni.onWindowResize(onResize);
  const savedTime = restore();
  if (savedTime == null) {
    await initLevel(level.value);
  } else {
    // 恢复的是结算局面：计时停住，等玩家自己点「重玩本关 / 下一关」
    if (phase.value !== PLAY) stopTick();
    else restoreTick(savedTime);
    if (phase.value === PLAY) pokeIdle();
  }
});

// 切后台（离开游戏界面）时暂停计时并存档；回来按 CountTimer 的行为自动续上
onHide(() => {
  stopTick();
  save();
});
onShow(() => {
  // 回到前台接着计时（CountTimer 的 listenerFn：document.hidden 时停、恢复可见且 enable 时继续）
  if (phase.value === PLAY && board.value.length) startTick();
});

onUnmounted(() => {
  if (typeof uni.offWindowResize === 'function') uni.offWindowResize(onResize);
  stopTick();
  clearTransient();
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

/* ---------- 统计条（web 的 .score-area：三个 .stat + 分隔线 + 底部进度条） ---------- */
.score-area {
  position: relative;
  width: 690rpx;
  display: flex;
  align-items: center;
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
  color: #2c3e50;
  font-variant-numeric: tabular-nums;
}
/* 剩余时间不足 15 秒时标红提醒（web 的 .stat-value.urgent） */
.stat-value.urgent { color: #b8433d; }
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

/* ---------- 操作区：盘面信息 1.6 / 新游戏 1.2（web 的 .opt-area） ---------- */
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
}
.level-note {
  font-size: 27rpx;              /* 14px */
  color: #5f6b7a;
  white-space: nowrap;
}
.start-wrapper {
  flex: 1.2;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* web 的 .game-icon：padding 8px 16px / 14px 字 / 8px 圆角 / 品牌绿 */
.game-icon {
  margin: 0;
  padding: 0 30rpx;
  height: 71rpx;                 /* web 实测 ~37px */
  line-height: 71rpx;
  border: 0 none;
  border-radius: 15rpx;
  background: #23804e;
  color: #fff;
  font-size: 27rpx;              /* 14px */
  font-weight: bold;
  white-space: nowrap;
  box-sizing: border-box;
}

/* ---------- 游戏区 / 棋盘 ---------- */
.game-area {
  position: relative;
  margin: 0 auto;
}
.board {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 27rpx;
  /* web 的 .board.dot-board：点阵底纹（#bbada0 + 10px 一格的白点，透明度 .18） */
  background-color: #bbada0;
  background-image: radial-gradient(circle, rgba(255, 255, 255, 0.18) 2rpx, transparent 2rpx);
  background-size: 19rpx 19rpx;
  background-position: 10rpx 10rpx;
}
/* 格子只负责坐标（left/top/宽/高都由 cellStyle 给），与牌、墙、幻影共用同一份数学 */
.cell {
  position: absolute;
}
/* 牌：与消消乐 / 大师的棋子同款 —— 圆角令牌 + 描边 + 软阴影（web 的 .tile，inset: 3px） */
.tile {
  position: absolute;
  left: 6rpx;
  top: 6rpx;
  right: 6rpx;
  bottom: 6rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  border: 2rpx solid #c9d0da;
  box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.12);
  border-radius: 15rpx;
  background: #fff;
  color: #2c3e50;
  line-height: 1;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
/* 发牌动画只在 dealing 期间生效（0.35s，逐张错开 25ms × (行+列)） */
.tile.dealing {
  animation: deal 0.35s ease backwards;
}
.tile.selected {
  transform: scale(1.12);
  background: #e5f6ec;
  box-shadow: 0 0 0 4rpx #23804e;
  z-index: 1;
}
.tile.shaking {
  animation: shake 0.35s ease;
}
/* 空闲提示的呼吸缩放只作用于 emoji 文本层，卡片背景保持静止 */
.tile.hinting {
  z-index: 1;
}
.tile.hinting .tile-face {
  display: inline-block;
  animation: breathe 0.8s ease-in-out 2;
}
.tile-face {
  line-height: 1;
}
/* 正在消失的幻影牌：与牌同一套盒模型，放大一点再缩没 */
.tile-ghost {
  position: absolute;
  left: 6rpx;
  top: 6rpx;
  right: 6rpx;
  bottom: 6rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border: 2rpx solid #c9d0da;
  border-radius: 15rpx;
  background: #e5f6ec;
  box-shadow: 0 0 0 4rpx #12833f;
  color: #2c3e50;
  line-height: 1;
  pointer-events: none;
  animation: vanish 0.55s ease forwards;
}
/* 墙壁：比牌更暗的斜纹块（web 的 .wall-block） */
.wall-block {
  position: absolute;
  left: 6rpx;
  top: 6rpx;
  right: 6rpx;
  bottom: 6rpx;
  box-sizing: border-box;
  border-radius: 15rpx;
  border: 2rpx solid #c9d0da;
  background-color: #e4e8ee;
  background-image: repeating-linear-gradient(
    45deg,
    transparent 0,
    transparent 11rpx,
    rgba(0, 0, 0, 0.14) 11rpx,
    rgba(0, 0, 0, 0.14) 17rpx
  );
}

/* ---------- 连线层（web 的 .link-layer + 三条 polyline） ---------- */
.link-layer {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 2;
}
.link-halo,
.link-line {
  position: absolute;
  border-radius: 999rpx;
  pointer-events: none;
}
.link-halo {
  background: #12833f;
  opacity: 0.25;
}
.link-line {
  background: #12833f;
}
/* 先「画」出来（0.12s 展开）、停一下、再淡出（0.18s，0.55s 后开始）—— 对应 web 的
   link-draw / link-fade 两段 animation；小程序没有 stroke-dasharray，用 scale 展开代替 */
.link-line.h {
  animation: link-draw-x 0.12s ease-out forwards, link-fade 0.18s ease-in 0.55s forwards;
}
.link-line.v {
  animation: link-draw-y 0.12s ease-out forwards, link-fade 0.18s ease-in 0.55s forwards;
}
.link-halo.h {
  animation: link-draw-x 0.12s ease-out forwards, link-fade 0.18s ease-in 0.55s forwards;
}
.link-halo.v {
  animation: link-draw-y 0.12s ease-out forwards, link-fade 0.18s ease-in 0.55s forwards;
}

/* ---------- 连击提示 / 烟花 / 重排提示 ---------- */
.combo-tip {
  position: absolute;
  left: 50%;
  top: -30rpx;                   /* web 的 top: -15px：落在棋盘上方那条空隙里 */
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
/* 同一条提示条靠切换两条同内容的关键帧名来重播（§零.10） */
.combo-tip.pop-b { animation-name: combo-pop-b; }
.shuffle-tip {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 3;
  padding: 19rpx 34rpx;          /* web 的 10px 18px */
  border-radius: 15rpx;
  background: rgba(255, 255, 255, 0.8);
  color: #2c3e50;
  font-size: 29rpx;              /* 15px */
  font-weight: bold;
  white-space: nowrap;
}

/* ---------- 结算层（web 的 .result；按钮走 App.vue 的全局规格） ---------- */
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
  animation: result-in 0.28s ease;
}
.result.lose {
  color: #b11;
}
.final-time {
  font-size: 53rpx;              /* 28px */
}
/* 结算按钮的基础规格（.result .btn 的最终尺寸由 App.vue 统一覆盖） */
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
  box-sizing: border-box;
}

/* ---------- 动画 ---------- */
@keyframes deal {
  from { opacity: 0; transform: scale(0.4); }
  to { opacity: 1; transform: scale(1); }
}
/* 空闲提示：0.8 ↔ 1.2 缓慢呼吸两个来回（约 1.6s，播两次循环） */
@keyframes breathe {
  0%, 100% { transform: scale(1); }
  25% { transform: scale(1.2); }
  75% { transform: scale(0.8); }
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-8rpx); }   /* web 的 ±4px */
  75% { transform: translateX(8rpx); }
}
@keyframes vanish {
  0% { transform: scale(1); opacity: 1; }
  40% { transform: scale(1.12); opacity: 1; }
  100% { transform: scale(0); opacity: 0; }
}
@keyframes link-draw-x {
  from { transform: scaleX(0.001); }
  to { transform: scaleX(1); }
}
@keyframes link-draw-y {
  from { transform: scaleY(0.001); }
  to { transform: scaleY(1); }
}
@keyframes link-fade {
  to { opacity: 0; }
}
/* 连击提示：弹入 → 停顿 → 上飘淡出（web 的 combo-pop，两条同内容用于重播） */
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
@keyframes result-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
/* ---------- 新游戏二次确认（本地版 ConfirmDialog，与其它页面同一套） ---------- */
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
