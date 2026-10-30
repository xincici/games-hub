<template>
  <view class="screen">
    <!-- 全站背景（粒子连线 + 底部过山车，与 web 的 ParticleBackground 同款） -->
    <ParticleBackground />
    <view class="page">
      <!-- 统计条：最高分 / 本局得分 / 速度（与 web 的 .score-area 三格一致） -->
      <view class="card score-area">
        <view class="stat">
          <text class="stat-label">{{ tt('best') }}</text>
          <text class="stat-value">{{ best || '--' }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('score') }}</text>
          <text class="stat-value">{{ score }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('speed') }}</text>
          <text class="stat-value">{{ speedLabel }}</text>
        </view>
      </view>

      <!-- 操作区：本局计时 | 新游戏 | 暂停/继续（web 的 .opt-area，比例 3 : 3.5 : 3.5） -->
      <view class="card opt-area">
        <view class="opt-half">
          <view class="timer">
            <view class="timer-ico i-carbon-timer" />
            <text class="timer-txt">{{ timeText }}</text>
          </view>
        </view>
        <view class="divider" />
        <view class="start-wrapper">
          <button class="game-icon" @click="startNewGame">{{ tt('start') }}</button>
        </view>
        <view class="divider" />
        <view class="start-wrapper">
          <button
            class="game-icon pause-btn"
            :class="{ on: phase === PLAY, off: phase !== PLAY }"
            :disabled="phase !== PLAY"
            @click="togglePause"
          >
            {{ paused ? tt('resume') : tt('pause') }}
          </button>
        </view>
      </view>

      <!-- 游戏区：8 行 × 6 列，整摞牌靠逐帧 transform 平移（与 web 一样不逐排改 top），
           里面的每一排只在自己下标变化（消除 / 补排）时才重排 -->
      <view class="game-area" :style="areaStyle">
        <!-- 点阵底纹：web 的全局 .dot-board（底色 + 圆点，10px 一格） -->
        <view class="board">
          <view class="stack" :style="{ transform: stackTf }">
            <view
              v-for="(row, j) in stack"
              :key="row.id"
              class="rise-row"
              :class="{ popping: row.popping }"
              :style="rowStyle(j)"
            >
              <view v-for="(g, c) in row.cells" :key="c" class="rise-cell" :style="cellStyle">
                <view class="tile" :style="tileStyle"><text class="tile-glyph">{{ g }}</text></view>
              </view>
            </view>
          </view>

          <!-- 玩家控制的 emoji：骑在整摞最上面那排的上方一格 -->
          <view class="player" :style="playerStyle">
            <view class="tile player-tile" :style="tileStyle"><text class="tile-glyph">{{ glyph }}</text></view>
          </view>

          <!-- 点击热区：整列可点，压在牌与玩家之上 -->
          <view
            v-for="c in COLS"
            :key="'hit-' + c"
            class="column-hit"
            :style="hitStyle(c - 1)"
            @click="pick(c - 1)"
          />
        </view>

        <!-- 暂停遮罩：点「继续」后先数 3 / 2 / 1，数完才真正恢复（数的时候整摞仍是冻结的） -->
        <view v-if="paused && phase === PLAY" class="pause-mask" @click="togglePause">
          <text v-if="resumeCount" class="resume-count" :class="resumeCount % 2 ? 'pop-a' : 'pop-b'">{{ resumeCount }}</text>
          <text v-else class="pause-icon">⏸️</text>
          <text class="pause-tip">{{ resumeCount ? tt('readyTip') : tt('resumeTip') }}</text>
        </view>

        <!-- 失败结算层：只留标题 + 得分（web 同款，重开走「新游戏」） -->
        <view v-if="phase === OVER" class="result lose">
          <text class="result-title">🏁 {{ tt('tipOver') }} 🏁</text>
          <text class="final-score">{{ score }}</text>
        </view>
      </view>
    </view>

    <!-- 彩带：web 的 Emoji 下坠只有「顶到天花板」的失败态、没有胜利态，
         所以 justWon 恒为 false（恢复存档也绝不置 true），结构与其它页面保持一致 -->
    <Confetti v-if="justWon" />

    <FloatingActions>
      <!-- 本游戏没有模式切换，右下角只有帮助 -->
      <view class="fab" @click="showHelp"><view class="fab-ico i-carbon-help" /></view>
    </FloatingActions>
    <HelpSheet :open="helpOpen" :text="helpText" @close="helpOpen = false" />
  </view>
</template>

<script setup>
// Emoji 下坠 · 微信小程序版
// 玩法逻辑逐行对照 web 的 src/games/down/DownGame.vue（整摞上升 / 点列横向插值 / 同款消整排 /
// 换 emoji 的 hazard 概率 / 速度曲线 / 暂停 + 3 2 1 倒数 / 存档字段都一致），
// 平台差异只有这几处：
// - web 的 rAF 逐帧循环 → setInterval（小程序逻辑层没有 rAF）；dt 仍按真实毫秒差算并钳到 0.05s，
//   每帧只写两个 transform 字符串（与 web 一样不逐排改 top），结构性重渲只在消除 / 补排时发生；
// - CountTimer → 本页内联的计时器（三种存档时机 / 表单格式与 web 一致）；
// - 本地存储 → @/core/storage，Web Audio → @/core/sfx，页面可见性 → onHide；
// - 棋盘格子不再用 CSS 变量，改成 rpx 内联尺寸；尺寸按视口换算，并给右下角悬浮按钮留出底部空间。
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { onHide } from '@dcloudio/uni-app';

import FloatingActions from '@/components/FloatingActions.vue';
import HelpSheet from '@/components/HelpSheet.vue';
import Confetti from '@/components/Confetti.vue';
import { getJSON, getRaw, setJSON, setRaw } from '@/core/storage';
import { playElimination, playLose } from '@/core/sfx';
import { tt } from './i18n';
import {
  ROWS, COLS, START_TOP, START_ROWS, SPEED_BASE,
  speedFor, makeRow, changeChance,
} from './board';

import { setNavTitle } from '@/core/i18n';
import ParticleBackground from '@/components/ParticleBackground.vue';

// 原生导航栏标题跟随语言（pages.json 里的标题是静态的）
setNavTitle(() => tt('gameTitle'));
// ---------- 存档 key：与 web 完全一致 ----------
const KEY_PREFIX = '__emoji_down__';
// 最高分沿用「前缀 + 数字」的存法（与 web 的 __emoji_down__best_1 一致）
const BEST_KEY = `${KEY_PREFIX}best_1`;
const STATE_KEY = `${KEY_PREFIX}state`;

const [PLAY, OVER] = ['play', 'over'];

const MAX_CELL_PX = 58;   // 格子边长上限（web 的 MAX_CELL）
const GAP_RPX = 6;        // 每格之间的缝（web 的 GAP = 3px）
const POP_MS = 180;       // 整排炸开动画时长（CSS 里的 rise-pop 要同步）
const FALL_K = 20;        // 落下一格的收敛速度（越大掉得越快）
const RECHECK_MS = 110;   // 落定后补判一次：炸开那段时间玩家可能已经滑到别的列了
const FRAME_MS = 16;      // 逐帧循环的间隔（≈ web 的 60fps）
const RESUME_STEP_MS = 800; // web 的 shared/resumeCountdown.js：每个数字停留 800ms

// ---------- 棋盘尺寸（rpx） ----------
const CARD_W = 690;                                     // 卡片宽 = web 的 calc(100% - 32px)（393 屏 361px）
const PAGE_FIXED_H = 36 + 138 + 36 + 138 + 36;          // 棋盘以上：上 padding + 统计条 + 间距 + 操作区 + 间距
const FAB_RESERVE = 96 + 24 + 96 + 40 + 20;             // 悬浮按钮组 + 呼吸（与贪吃蛇同一套算法）
const MIN_CELL = 40;

const phase = ref(PLAY);
// 暂停：主动点按钮、或切后台 / 离开页面时自动暂停；重进时也停在暂停态，等玩家点「继续」
const paused = ref(false);
const score = ref(0);
const best = ref(+(getRaw(BEST_KEY) || 0));
const stack = ref([]);          // [{ id, cells: [6 个 emoji], popping }]，下标 0 = 最上面那排
const glyph = ref('🍎');        // 玩家手里的 emoji
const colTarget = ref(~~(COLS / 2));
const clearedShown = ref(0);    // 只用于顶部「速度」倍率的展示
const resumeCount = ref(0);
// 彩带只在「真正赢下这一刻」为 true；本游戏只有失败态，恒为 false
const justWon = ref(false);

// 逐帧推进的量放在普通变量里（不进响应式，避免每帧触发整棵树重渲）
let top = START_TOP;            // 整摞最上面那排所在的行（越小越靠上，上升 = 变小）
let colVis = colTarget.value;   // 玩家横向的连续位置（滑过去靠它插值）
let playerLag = 0;              // 消除后往下掉一格的落后量（-1 → 0）
let cleared = 0;                // 已消除排数（速度只跟它有关）
let changeStreak = 0;           // 连续消了几排还没换手里的 emoji（越大越容易换）
let arrived = true;             // 这一次滑动是否已经到位（到位才判定）
let busy = false;               // 正在播炸开 / 落下的动画
let rowId = 0;
let gen = 0;                    // 换局 / 卸载时 +1，异步动画据此收手

// 逐帧只改这两个字符串（等价 web 的 stackEl.style.transform / playerEl.style.transform）
const stackTf = ref('translate3d(0, 0, 0)');
const playerTf = ref('translate3d(0, 0, 0)');

// ---------- 视口 → 格子尺寸 ----------
const view = ref({ w: 393, h: 780 });
const cell = ref(110);          // 格子边长（rpx）
const pxToRpx = computed(() => 750 / view.value.w);
const cellPx = computed(() => cell.value / pxToRpx.value);   // 同尺寸的 px 值（transform 用）

const areaStyle = computed(() => ({
  width: `${cell.value * COLS}rpx`,
  height: `${cell.value * ROWS}rpx`,
}));
// 格子 / 牌 / 玩家外框：同一份尺寸，避免「格子与绝对定位内容各算一套」（AGENTS 第十八节）
const cellStyle = computed(() => ({ width: `${cell.value}rpx`, height: `${cell.value}rpx` }));
// 玩家外框：尺寸 + 逐帧 transform 合成一个对象（小程序对数组样式支持不稳，别用数组）
const playerStyle = computed(() => ({
  width: `${cell.value}rpx`,
  height: `${cell.value}rpx`,
  transform: playerTf.value,
}));
const tileStyle = computed(() => {
  const t = cell.value - GAP_RPX;                    // web 的 --tile
  return {
    width: `${t}rpx`,
    height: `${t}rpx`,
    fontSize: `${Math.round(t * 0.62)}rpx`,          // web 的 --font
  };
});
const rowStyle = (j) => ({ top: `${j * cell.value}rpx`, height: `${cell.value}rpx` });
const hitStyle = (c) => ({ left: `${c * cell.value}rpx`, width: `${cell.value}rpx` });

function readViewport() {
  // H5 的 innerHeight 含 uni 自带导航栏（44px），小程序 windowHeight 已扣掉原生导航栏
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

function computeCell() {
  const { w, h } = readViewport();
  view.value = { w, h };
  const k = 750 / w;
  const maxCell = Math.round(MAX_CELL_PX * k);        // web 的 58px 上限换成 rpx
  const byW = CARD_W / COLS;
  // 底部预留：棋盘最下面一格必须在右下角两颗悬浮按钮的上方
  const byH = (h * k - PAGE_FIXED_H - FAB_RESERVE) / ROWS;
  cell.value = Math.max(MIN_CELL, Math.round(Math.min(byW, byH, maxCell)));
}

// 速度只用来展示，倍数相对于起始速度
const speedLabel = computed(() => `${(speedFor(clearedShown.value) / SPEED_BASE).toFixed(1)}×`);

// ---------- 计时器（替代 web 的 shared/CountTimer.vue） ----------
const seconds = ref(0);
let tickTimer = null;
const timeText = computed(() => {
  const sec = seconds.value;
  return ('00' + ~~(sec / 60)).slice(-2) + ':' + ('00' + (sec % 60)).slice(-2);
});
function startTimer() {
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    seconds.value += 1;
    save();               // 每秒落一次档（= web 的 CountTimer onTick），退出重进用时不会退回去
  }, 1000);
}
function stopTimer() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
}
function resetTimer() {
  stopTimer();
  seconds.value = 0;
  startTimer();
}

// ---------- 关卡流程 ----------

function newRow() {
  return { id: ++rowId, cells: makeRow(), popping: false };
}

// 整摞始终保持「从顶排一路铺到棋盘底边」，不够就在底部补新排。
// 这一步是必须的：玩家消得比上升快时，消除会把整摞整体往下推，
// 推过头就会把牌堆推出棋盘、甚至清空（stack[0] 变 undefined，后面全炸）；
// 顶排同时钳在棋盘最后一行，于是堆里永远至少留着一排，玩家最多退到棋盘底部
function fillPile() {
  while (top + stack.value.length < ROWS) stack.value.push(newRow());
}

function startNewGame() {
  gen += 1;
  stopLoop();
  cancelResume();
  paused.value = false;
  phase.value = PLAY;
  score.value = 0;
  cleared = 0;
  clearedShown.value = 0;
  changeStreak = 0;
  busy = false;
  top = START_TOP;
  playerLag = 0;
  stack.value = Array.from({ length: START_ROWS }, newRow);
  // 开局就找一个「当前列不是同款」的组合，玩家第一手就得动起来
  const startCol = ~~(COLS / 2);
  colTarget.value = startCol;
  colVis = startCol;
  const row = stack.value[0].cells;
  const other = row.findIndex((g, c) => c !== startCol && g !== row[startCol]);
  glyph.value = row[other >= 0 ? other : (startCol + 1) % COLS];
  arrived = true;
  best.value = +(getRaw(BEST_KEY) || 0);
  resetTimer();
  save();
  startLoop();
}

// 暂停 / 继续：暂停时停掉逐帧循环与计时（牌堆完全冻结），并把局面落档，
// 这样切后台被关掉也能接上；继续先数 3 2 1，数完才真正跑起来
function togglePause() {
  if (phase.value !== PLAY) return;
  if (paused.value) {
    if (!resumeCount.value) beginResume();
    return;
  }
  paused.value = true;
  cancelResume();
  stopLoop();
  stopTimer();
  save();
}

// 倒数结束：真正恢复（startLoop 会把 last 清 0，所以恢复那一帧不会被 dt 跳一下）
function onResume() {
  paused.value = false;
  startTimer();
  startLoop();
}

let resumeTimer = null;
function beginResume() {
  cancelResume();
  resumeCount.value = 3;
  resumeTimer = setInterval(() => {
    resumeCount.value -= 1;
    if (resumeCount.value > 0) return;
    cancelResume();
    onResume();
  }, RESUME_STEP_MS);
}
function cancelResume() {
  if (resumeTimer) clearInterval(resumeTimer);
  resumeTimer = null;
  resumeCount.value = 0;
}

// 点列就能滑过去：busy（正在炸开 / 落地）不挡这里，
// 只挡「再开一次消除」——不然玩家消完一排立刻点下一列会白点一下
function pick(c) {
  if (phase.value !== PLAY || paused.value) return;
  if (c === colTarget.value) {
    // 点自己所在的列：立刻判定一次（比如刚落下来就同款的情况）
    if (arrived) checkMatch();
    return;
  }
  colTarget.value = c;
  arrived = false;
}

// 到位后判定：顶排这一列跟自己同款 → 整排炸开
function checkMatch() {
  // arrived = 玩家此刻确实停在某一列上（还在滑动途中不算，判定留到到位时）
  if (phase.value !== PLAY || busy || !arrived) return;
  const row = stack.value[0];
  if (!row || row.popping) return;
  if (row.cells[colTarget.value] === glyph.value) clearTopRow();
}

function clearTopRow() {
  const row = stack.value[0];
  busy = true;
  row.popping = true;            // 炸开动画
  const g = gen;
  setTimeout(() => {
    if (g !== gen || phase.value !== PLAY) return;
    stack.value.shift();
    // 「顶」下移一排（其余排的绝对位置不变），但最多落到棋盘最后一行
    top = Math.min(top + 1, ROWS - 1);
    fillPile();                  // 立刻把底边补齐，堆里不会出现空档
    playerLag = -1;              // 玩家往下掉一格（渲染上先从上一格开始，逐帧落到位）
    // 同一拍就把整摞 / 玩家挪到位：否则「排下移」与「整摞补偿」之间会差一帧，
    // 整摞会先向上跳一格（web 靠 rAF 紧跟着补上，这里主动补）。
    // 注意 playerLag 必须先置 -1 再 render，否则玩家会先跳下去再跳回来
    render();
    score.value += 1;
    cleared += 1;
    playElimination();
    clearedShown.value = cleared;
    if (score.value > best.value) {
      best.value = score.value;
      setRaw(BEST_KEY, String(best.value));
    }
    // 每消掉一排掷一次：连续没换的次数越多，这次换的概率越大
    // （p(0) = 25%，均值约 3.4 排换一次）。换的时候从当前顶排里挑一个
    // 「跟手里这个不一样」的列，保证玩家看到的变化是实打实的
    if (Math.random() < changeChance(changeStreak)) {
      const next = stack.value[0];
      const others = next.cells.map((g2, c) => c).filter(c => next.cells[c] !== glyph.value);
      const pickCol = others.length ? others[~~(Math.random() * others.length)] : ~~(Math.random() * COLS);
      glyph.value = next.cells[pickCol];
      changeStreak = 0;
    } else {
      changeStreak += 1;
    }
    busy = false;
    save();
    // 落定之后补判一次：新顶排要是也同款就接着消（连锁），
    // 或者玩家在炸开那会儿已经滑到同款上了，这一下也补上
    setTimeout(() => {
      if (g === gen && phase.value === PLAY) checkMatch();
    }, RECHECK_MS);
  }, POP_MS);
}

function lose() {
  if (phase.value !== PLAY) return;
  phase.value = OVER;
  playLose();
  stopLoop();
  stopTimer();
  save();
}

// ---------- 逐帧循环（setInterval 等价 web 的 rAF） ----------

function render() {
  const c = cellPx.value;
  stackTf.value = `translate3d(0, ${(top * c).toFixed(2)}px, 0)`;
  playerTf.value = `translate3d(${(colVis * c).toFixed(2)}px, ${((top - 1 + playerLag) * c).toFixed(2)}px, 0)`;
}

let loopTimer = null;
let last = 0;

function frame() {
  if (phase.value !== PLAY || paused.value) return;
  const now = Date.now();
  // 切后台再回来时 dt 会很大，钳一下，免得牌堆瞬间窜到顶
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
  last = now;
  top -= speedFor(cleared) * dt;
  fillPile();
  // 滑动：向目标列插值，到位后判定一次
  if (Math.abs(colTarget.value - colVis) > 0.004) {
    colVis += (colTarget.value - colVis) * Math.min(1, dt * 14);
  } else if (!arrived) {
    colVis = colTarget.value;
    arrived = true;
    checkMatch();
  }
  // 落下一格的动画
  if (playerLag !== 0) {
    playerLag += (0 - playerLag) * Math.min(1, dt * FALL_K);
    if (Math.abs(playerLag) < 0.02) playerLag = 0;
  }
  // 玩家（贴在整摞最上面那排的上方一格）顶到棋盘顶部 → 失败
  if (top - 1 <= 0) {
    render();
    lose();
    return;
  }
  render();
}

function startLoop() {
  stopLoop();
  last = 0;
  render();
  loopTimer = setInterval(frame, FRAME_MS);
}

function stopLoop() {
  if (loopTimer) clearInterval(loopTimer);
  loopTimer = null;
}

// ---------- 存档 ----------

function save() {
  setJSON(STATE_KEY, {
    phase: phase.value,
    score: score.value,
    time: seconds.value,
    top,
    col: colTarget.value,
    glyph: glyph.value,
    cleared,
    changeStreak,
    stack: stack.value.map(r => r.cells),
  });
}

function restore() {
  try {
    const saved = getJSON(STATE_KEY);
    if (!saved || !Array.isArray(saved.stack) || !saved.stack.length) return false;
    if (saved.phase !== PLAY && saved.phase !== OVER) return false;
    stack.value = saved.stack.map(cells => ({ id: ++rowId, cells, popping: false }));
    score.value = Math.max(0, +saved.score || 0);
    glyph.value = typeof saved.glyph === 'string' ? saved.glyph : stack.value[0].cells[0];
    colTarget.value = Math.min(COLS - 1, Math.max(0, +saved.col || 0));
    colVis = colTarget.value;
    cleared = Math.max(0, +saved.cleared || 0);
    clearedShown.value = cleared;
    changeStreak = Math.max(0, +saved.changeStreak || 0);   // 旧存档没有这个字段 → 从 0 开始
    top = typeof saved.top === 'number' ? saved.top : START_TOP;
    playerLag = 0;
    arrived = true;
    busy = false;
    phase.value = saved.phase === OVER ? OVER : PLAY;
    // 表停在存档那一刻：局中要保持暂停、结算层也不再往前走
    stopTimer();
    seconds.value = Math.max(0, +saved.time || 0);
    if (phase.value === PLAY) {
      // 局中：渲染出退出那一刻的画面并**保持暂停**，等玩家自己点「继续」
      paused.value = true;
    } else {
      // 结算层：等玩家点「新游戏」
      paused.value = false;
    }
    render();
    return true;
  } catch {
    return false;
  }
}

// ---------- 帮助 ----------
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

// ---------- 生命周期 ----------
function onResize() {
  computeCell();
  render();
}

onMounted(() => {
  computeCell();
  if (typeof uni.onWindowResize === 'function') uni.onWindowResize(onResize);
  if (!restore()) startNewGame();
});

// 切后台（离开游戏界面）时自动暂停并存档，回来自己点「继续」；
// 顺带把逐帧循环 / 计时 / 倒数全部停掉，切后台不能继续跑
onHide(() => {
  if (phase.value === PLAY && !paused.value) togglePause();
  stopLoop();
  cancelResume();
  stopTimer();
  save();
});

onUnmounted(() => {
  if (typeof uni.offWindowResize === 'function') uni.offWindowResize(onResize);
  gen += 1;
  stopLoop();
  cancelResume();
  stopTimer();
  save();   // 退出即暂停：把这一刻的局面落档，重进停在暂停态
});
</script>

<style lang="scss" scoped>
/* web 的 resume-pop（两个同内容的名字是为了让 3→2→1 每一跳都重播动画） */
@keyframes resume-pop-a {
  0% { transform: scale(0.4); opacity: 0; }
  35% { transform: scale(1.12); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes resume-pop-b {
  0% { transform: scale(0.4); opacity: 0; }
  35% { transform: scale(1.12); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
/* 整排炸开（与 POP_MS = 180ms 同步） */
@keyframes rise-pop {
  0% { transform: scale(1); opacity: 1; }
  45% { transform: scale(1.07); opacity: 1; }
  100% { transform: scale(1.3); opacity: 0; }
}
/* 玩家那个 emoji 的呼吸 */
@keyframes player-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.07); }
}

/* 整页只允许一处 100vh 最小高度（就是下面这条，别再给 .page 写） */
.screen {
  min-height: 100vh;
  background: transparent;  /* 背景交给 ParticleBackground（canvas 自己铺底色） */
}
.page {
  padding: 36rpx 24rpx 140rpx;   /* 底部 140 让开右下角悬浮按钮 */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 36rpx;
  background: #f0f2f5;
  color: #2c3e50;
}

/* ---------- 统计条（web 的 --row-height: 72px = 138rpx） ---------- */
.score-area {
  width: 690rpx;
  height: 138rpx;
  display: flex;
  align-items: center;
  padding: 0 23rpx;
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
  font-size: 23rpx;          /* 12px */
  color: #5f6b7a;
  line-height: 1.2;
  white-space: nowrap;
}
.stat-value {
  font-size: 42rpx;          /* 22px */
  font-weight: bold;
  line-height: 1.2;
  color: #2c3e50;
  font-variant-numeric: tabular-nums;
}
.divider {
  width: 2rpx;
  height: 46rpx;             /* 1 × 24px */
  align-self: center;
  background: #e1e1e1;
  opacity: 0.6;
}

/* ---------- 操作区：计时 3 | 新游戏 3.5 | 暂停 3.5 ---------- */
.opt-area {
  width: 690rpx;
  height: 138rpx;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}
.opt-half {
  flex: 3;
  display: flex;
  align-items: center;
  justify-content: center;
}
.start-wrapper {
  flex: 3.5;
  display: flex;
  align-items: center;
  justify-content: center;
}
.timer {
  display: flex;
  align-items: center;
  gap: 11rpx;                /* 6px */
  font-size: 27rpx;          /* 14px */
  font-weight: 600;
}
.timer-ico { pointer-events: none; }
.timer-txt { font-variant-numeric: tabular-nums; }

/* web 的 .game-icon：8px 12px 内边距 / 13px 字 / 8px 圆角 / 品牌绿 */
.game-icon {
  margin: 0;
  padding: 0 23rpx;
  height: 59rpx;
  line-height: 59rpx;
  border: 0 none;
  border-radius: 15rpx;
  background: #23804e;
  color: #fff;
  font-size: 25rpx;
  font-weight: bold;
  white-space: nowrap;
  box-sizing: border-box;
}
.game-icon::after { border: none; }
/* 暂停 / 继续可点击时是黄色 + 深字（白字压 #ffc300 只有 1.65:1），禁用时灰底白字 */
.game-icon.pause-btn.on { background-color: #ffc300; color: #222; }
.game-icon.off { background-color: #aaa; color: #fff; }

/* ---------- 游戏区 ---------- */
.game-area {
  position: relative;
  border-radius: 27rpx;
}
/* web 的 .board.dot-board：点阵底纹（10px 一格、5px 偏移）+ #bbada0 底 */
.board {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 27rpx;
  background-color: #bbada0;
  background-image: radial-gradient(circle, rgba(255, 255, 255, 0.18) 2rpx, transparent 2rpx);
  background-size: 19rpx 19rpx;
  background-position: 10rpx 10rpx;
}
/* 整摞牌：位置由逐帧循环改 transform（见 render()） */
.stack {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  will-change: transform;
}
.rise-row {
  position: absolute;
  left: 0;
  width: 100%;
  display: flex;
  transform-origin: center center;
}
.rise-row.popping {
  animation: rise-pop 0.18s ease-out forwards;   /* 与 POP_MS 同步 */
}
.rise-cell {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* 牌：尺寸 / 字号走 tileStyle（同一份坐标数学），这里只管外观 */
.tile {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 15rpx;       /* web 的 --radius-tile: 8px */
  border: 2rpx solid #c9d0da;
  background: #fff;
  box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.12);
  line-height: 1;
}
.tile-glyph { line-height: 1; }
/* 玩家控制的那个：加一圈主色描边 + 呼吸，跟牌堆区分开 */
.player {
  position: absolute;
  left: 0;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  will-change: transform;
}
.player-tile {
  box-shadow: 0 0 0 6rpx #23804e, 0 2rpx 6rpx rgba(0, 0, 0, 0.12);
  animation: player-pulse 1.6s ease-in-out infinite;
}
.column-hit {
  position: absolute;
  top: 0;
  height: 100%;
  z-index: 3;
  -webkit-tap-highlight-color: transparent;
}

/* 暂停遮罩：与游戏区矩形完全重合（z-index 压住列热区，点了继续） */
.pause-mask {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  z-index: 5;
  border-radius: 27rpx;
  background: rgba(255, 255, 255, 0.8);
  color: #2c3e50;
  font-weight: bold;
  font-size: 32rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 19rpx;
}
/* web 的 .pause-mask span:first-child { font-size: 34px } */
.pause-icon { font-size: 65rpx; line-height: 1.2; }
.pause-tip { font-size: 32rpx; }
/* web 的 span.resume-count { font-size: 72px }，倒数每个数字弹一下 */
.resume-count {
  font-size: 137rpx;
  line-height: 1;
  color: #23804e;
  font-variant-numeric: tabular-nums;
}
.resume-count.pop-a { animation: resume-pop-a 0.8s ease; }
.resume-count.pop-b { animation: resume-pop-b 0.8s ease; }

/* 失败结算层：与游戏区完全重合 */
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
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 23rpx;                /* 12px */
  padding: 23rpx;
}
.result.lose {
  color: #b11;
  font-weight: bold;
  font-size: 34rpx;          /* 18px */
}
.result-title { text-align: center; }
.final-score {
  font-size: 53rpx;          /* 28px */
  font-variant-numeric: tabular-nums;
}
</style>
