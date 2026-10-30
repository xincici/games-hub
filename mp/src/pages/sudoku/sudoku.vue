<template>
  <view class="screen">
    <!-- 全站背景（粒子连线 + 底部过山车，与 web 的 ParticleBackground 同款） -->
    <ParticleBackground />
    <view class="page">
      <!-- 分数区：最佳用时 / 生命（web 的 score-area；行高沿用 App.vue 的全局 token） -->
      <view class="card score-area">
        <view class="stat">
          <text class="stat-label">{{ tt('bestScore') }}</text>
          <text class="stat-value">{{ bestTime ? fmt(bestTime) : '--:--' }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('hearts') }}</text>
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

      <!-- 操作区：难度 −/+ 、计时、新游戏（web 的 4 : 2.5 : 3.5 分格） -->
      <view class="card opt-area">
        <view class="difficulty-wrapper">
          <view class="opt-icon" :class="{ disable: difficulty === MIN_DIFFICULTY }" @click="changeDifficulty(-1)">
            <view class="opt-ico i-carbon-subtract-alt" />
          </view>
          <text class="difficulty-value">{{ diffName }}</text>
          <view class="opt-icon" :class="{ disable: difficulty === MAX_DIFFICULTY }" @click="changeDifficulty(1)">
            <view class="opt-ico i-carbon-add-alt" />
          </view>
        </view>
        <view class="divider" />
        <view class="opt-half">
          <!-- web 的 shared/CountTimer：计时图标 + MM:SS，每秒把秒数写回存档 -->
          <view class="timer">
            <view class="timer-ico i-carbon-timer" />
            <text class="timer-txt">{{ timeText }}</text>
          </view>
        </view>
        <view class="divider" />
        <view class="start-wrapper">
          <button class="game-icon" @click="initGame">{{ tt('start') }}</button>
        </view>
      </view>

      <!-- 游戏区：9×9 棋盘；结算遮罩与棋盘同尺寸（absolute 覆盖，left/top/宽/高完全重合） -->
      <view class="game-area">
        <view class="board-frame">
          <view class="board" :class="{ revealing }">
            <view
              v-for="(cell, i) in cells"
              :key="gameId + '-' + i"
              class="cell"
              :class="cellClass(i, cell)"
              :style="cellStyle(i)"
              @click="onCellClick(i)"
            >
              <text
                v-if="cell.v"
                class="num"
                :style="revealing ? { animationDelay: revealDelay(i) + 'ms' } : null"
              >{{ cell.v }}</text>
              <view v-else-if="cell.notes" class="notes">
                <!-- has = 这一格标了这个候选；hl = 与盘面上点中的数字相同（同数字的笔记一起高亮） -->
                <view
                  v-for="d in NUMS"
                  :key="'note-' + d"
                  class="note"
                  :class="{ has: noteMask[i][d - 1], hl: hlDigit === d && noteMask[i][d - 1] }"
                >{{ d }}</view>
              </view>
            </view>
          </view>
        </view>

        <!-- 结算层：盖住棋盘（web 的 .result） -->
        <view v-if="phase === WON || phase === OVER" class="result" :class="phase === WON ? 'win' : 'lose'">
          <template v-if="phase === WON">
            <text class="result-main">🎉🎉 {{ tt('tipWin') }} 🎉🎉</text>
            <text v-if="newBest" class="new-best">🏅 {{ tt('newBest') }}</text>
          </template>
          <text v-if="phase === OVER" class="result-main">👻👻 {{ tt('tipLost') }} 👻👻</text>
          <button class="game-icon replay-btn" @click="initGame">{{ tt('replayLevel') }}</button>
        </view>
      </view>

      <!-- 数字键盘 + 候选 / 笔记 / 擦除（web 的 pad） -->
      <view class="card pad">
        <view class="keys">
          <button
            v-for="d in NUMS"
            :key="'key-' + d"
            class="key"
            :class="keyClass(d)"
            hover-class="key-down"
            @click="onPad(d)"
          >
            {{ d }}
            <text v-if="digitLeft[d] > 0" class="badge">{{ digitLeft[d] }}</text>
          </button>
        </view>
        <view class="tools">
          <button class="tool" hover-class="tool-down" @click="onCandButton">
            <view class="tool-ico i-mdi-format-list-numbered" />
            <text>{{ tt('candidates') }}</text>
          </button>
          <button class="tool" :class="{ active: notesMode }" hover-class="tool-down" @click="toggleNotesMode">
            <view class="tool-ico i-mdi-pencil-outline" />
            <text>{{ tt('notes') }}</text>
          </button>
          <button class="tool" hover-class="tool-down" @click="onErase">
            <view class="tool-ico i-mdi-backspace-outline" />
            <text>{{ tt('erase') }}</text>
          </button>
        </view>
      </view>
    </view>

    <!-- 胜利彩带（纯 CSS 降级版，web 是 confetti canvas） -->
    <Confetti v-if="justWon" />
    <FloatingActions>
      <view class="fab" @click="showHelp"><view class="fab-ico i-carbon-help" /></view>
    </FloatingActions>
    <HelpSheet :open="helpOpen" :text="helpText" @close="helpOpen = false" />
  </view>
</template>

<script setup>
// 数独 · 微信小程序版
// 纯逻辑来自 web 的 src/games/sudoku/sudoku.js（**原样复制**成 ./board.js：随机终盘 + 唯一解挖洞），
// 视图按 web 的 SudokuGame.vue 重写，只改平台相关的能力：
// - 存档：localStorage → @/core/storage（key 与 web 一字不差：__sudoku_game__*）
// - 音效：Web Audio → @/core/sfx（扣❤️ playFail / 失败 playLose / 过关 playWin，落点与 web 一致）
// - 键盘：小程序没有物理键盘，只用屏幕数字键盘（web 的 keyup 数字 / 方向键那套没有对应能力）
// - 棋盘几何：web 用 CSS grid + aspect-ratio + window.innerWidth 算字号；这里用 rpx 常量
//   （外框 630rpx、边框 4rpx = 2px、内盘 622rpx、单格 69.1111rpx、字号 35rpx / 笔记 15rpx）
//   ⚠️ 外框比 web 的 361px 小 8%（630rpx ≈ 330px）：web 的分数卡 / 操作区上方还有顶栏、
//   下方的右下角是两个悬浮按钮（96×2 + 24 + 40 = 256rpx），棋盘按 web 原尺寸时
//   「擦除」按钮的右下角会被悬浮按钮压住（实测 tools bottom 1309rpx > fab top 1286rpx）；
//   按 AGENTS 第十四节「底部就是按钮行 → 必须让开按钮组」把棋盘整体缩到 630rpx 后
//   tools bottom 1249rpx < fab top 1286rpx（393×852 与 390×844 都通过）。
// - 结算层：小程序没有 <Transition> 的离场过渡，改成进场 result-in 淡入
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { onHide, onShow } from '@dcloudio/uni-app';

import Confetti from '@/components/Confetti.vue';
import FloatingActions from '@/components/FloatingActions.vue';
import HelpSheet from '@/components/HelpSheet.vue';
import { getJSON, getRaw, setRaw } from '@/core/storage';
import { playFail, playLose, playWin } from '@/core/sfx';
import { generatePuzzle } from './board';
import { tt } from './i18n';
import { setNavTitle } from '@/core/i18n';
import ParticleBackground from '@/components/ParticleBackground.vue';

// 原生导航栏标题跟随语言（pages.json 里的标题是静态的）
setNavTitle(() => tt('gameTitle'));

const NUMS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
// 笔记用 1 << d 当位掩码（d = 1..9），所以数字 9 落在 bit 9 = 512 上：
// 掩码至少要 (1 << 10) - 1。web 踩过坑 —— 原来写 511（只盖 bit 0~8），
// 还原存档时会把 9 的笔记整位丢掉，只剩「候选=9」的格子会整格清空
const NOTES_MASK = (1 << (NUMS.length + 1)) - 1;
// 简单 / 中等 / 困难：预填数字越少越难（挖空数递增）
const DIFFICULTIES = [
  { empties: 40 },
  { empties: 48 },
  { empties: 55 },
];
const DIFF_NAMES = ['diffEasy', 'diffMedium', 'diffHard'];
const [PLAY, WON, OVER] = ['play', 'won', 'over'];
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 3;
const KEY_PREFIX = '__sudoku_game__';
const DIFFICULTY_KEY = `${KEY_PREFIX}difficulty`;
const STATE_KEY = `${KEY_PREFIX}state`;

// rpx 几何（750rpx = 屏宽；393 宽时 1px ≈ 1.908rpx）
const CELL = +(622 / 9).toFixed(4);   // 单格 69.1111rpx（外框 630rpx − 两侧边框 4rpx×2）
// 逐格入场动画的窗口（窗口结束后再落数字不再延迟）
const REVEAL_MS = 1000;

const difficulty = ref(initDifficulty());
const cells = ref([]);
const selected = ref(-1);
const notesMode = ref(false);
const phase = ref(PLAY);
const newBest = ref(false);
const bestTime = ref(0);
const gameId = ref(0);
// 开局/恢复时的逐格入场动画窗口
const revealing = ref(false);
// 彩带只在真正赢下的这一刻放（恢复存档的胜利态不放，与 web 一致）
const justWon = ref(false);

// 唯一解答案：与填数对比判定「填错」，也是爱心扣减与胜利判断的依据
const solution = ref([]);
// 剩余爱心：初始 = 难度档位（简单 1 / 中等 2 / 困难 3），填错扣 1 颗，
// 扣掉最后一颗心的那次就失败
const hearts = ref(0);
const heartsMax = computed(() => difficulty.value);

let revealTimer = null;
let winTimer = null;
let wonTimer = null;

// ---------- 计时（web 的 shared/CountTimer.vue：图标 + MM:SS，每秒把秒数写回存档） ----------
const seconds = ref(0);
let tickTimer = null;
const timeText = computed(() => fmt(seconds.value));

function startTick() {
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    seconds.value += 1;
    saveState();
  }, 1000);
}
function stopTick() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
}
function resetTick() {
  stopTick();
  seconds.value = 0;
  startTick();
}
function restoreTick(sec) {
  stopTick();
  seconds.value = Math.max(0, +sec || 0);
  startTick();
}

const diffName = computed(() => tt(DIFF_NAMES[difficulty.value - 1]));
const padDigit = computed(() => {
  const s = selected.value;
  return s >= 0 && !cells.value[s]?.fixed ? cells.value[s].v : 0;
});
// 每个数字（1~9）还剩几个可填 = 9 − 盘面上已出现的次数
const digitLeft = computed(() => {
  const leftArr = [0, 9, 9, 9, 9, 9, 9, 9, 9, 9];
  for (const c of cells.value) {
    if (c.v) leftArr[c.v]--;
  }
  return leftArr;
});
function keyClass(d) {
  return { on: padDigit.value === d, used: digitLeft.value[d] <= 0 };
}
// 盘面上点中的那个数字（题面格与自己填的都算）：同数字的格子 + 其它空格里相同的笔记一起高亮
const hlDigit = computed(() => {
  const s = selected.value;
  return s >= 0 ? cells.value[s]?.v || 0 : 0;
});
// 候选的位掩码矩阵：小程序 WXML 里不写位运算（模板表达式能力有限），在这里一次算好
const noteMask = computed(() => cells.value.map(c => NUMS.map(d => !!(c.notes & (1 << d)))));

// 剩余生命逐颗状态（❤️ / 🤍 + 掉心时的放大淡出），对应 web 的 shared/Hearts.vue
const popping = ref(0);
let popTimer = null;
const heartList = computed(() => {
  const out = [];
  for (let h = 1; h <= heartsMax.value; h++) {
    const pop = popping.value === h;
    const full = h <= hearts.value || pop;
    out.push({ h, full, popping: pop, dead: !full, text: full ? '❤️' : '🤍' });
  }
  return out;
});

// 掉一颗❤️ 时，刚失去的那颗先「放大淡出」，动画播完才变成 🤍
// （web 的 shared/Hearts.vue 就是这个行为，谁扣心都只改 hearts，动画在这里自己管）
watch(hearts, (now, was) => {
  clearTimeout(popTimer);
  popping.value = 0;
  if (!(now < was) || was < 1) return;   // 只有掉心才播
  popping.value = was;                   // 刚失去的是原来第 was 颗
  popTimer = setTimeout(() => { popping.value = 0; }, 450);
});

// 某一格的可用候选：排除同行、同列、同宫已经出现的数字（题面与自己填的都算）
function candidatesFor(i) {
  const r = (i / 9) | 0;
  const c = i % 9;
  const br = ((r / 3) | 0) * 3;
  const bc = ((c / 3) | 0) * 3;
  const used = new Set();
  for (let k = 0; k < 9; k++) {
    used.add(cells.value[r * 9 + k].v);
    used.add(cells.value[k * 9 + c].v);
    used.add(cells.value[(br + ((k / 3) | 0)) * 9 + (bc + (k % 3))].v);
  }
  let mask = 0;
  for (const d of NUMS) {
    if (used.has(d) || digitLeft.value[d] <= 0) continue;
    mask |= 1 << d;
  }
  return mask;
}

  // 按下「候选」：永远一次把全盘空白格都补上候选（没有「逐个点格填」那种模式）
  function onCandButton() {
    fillAllCandidates();
  }

// 给所有空白格写入各自可用候选（已填数字的格跳过；重复按按当前盘面刷新）
function fillAllCandidates() {
  if (phase.value !== PLAY) return;
  let touched = 0;
  cells.value.forEach((c, i) => {
    if (c.fixed || c.v) return;
    c.notes = candidatesFor(i);
    touched++;
  });
  if (touched) saveState();
}


function saveState() {
  if (phase.value !== PLAY) return;
  if (isFinished()) {
    removeState();
    return;
  }
  try {
    setRaw(STATE_KEY, JSON.stringify({
      difficulty: difficulty.value,
      time: seconds.value,
      // 每格存 [数字, 是否题面格, 笔记位掩码]
      cells: cells.value.map(c => [c.v, c.fixed ? 1 : 0, c.notes]),
      solution: solution.value,
      hearts: hearts.value,
    }));
  } catch { /* 忽略 */ }
}

// 恢复到退出前的对局（含计时秒数），恢复失败则开新局
function restore() {
  try {
    const saved = getJSON(STATE_KEY);
    if (!saved || !Array.isArray(saved.cells) || saved.cells.length !== 81) return false;
    const d = +saved.difficulty;
    if (!(d >= MIN_DIFFICULTY && d <= MAX_DIFFICULTY)) return false;
    const sol = saved.solution;
    if (!Array.isArray(sol) || sol.length !== 81 || sol.some(v => !(v >= 1 && v <= 9 && v === (v | 0)))) return false;
    const arr = saved.cells.map((t) => {
      const v = Math.min(9, Math.max(0, +t[0] || 0));
      const fixed = Boolean(t[1]) && v > 0;
      const notes = fixed ? 0 : (+t[2] || 0) & NOTES_MASK;
      return { v, fixed, notes };
    });
    difficulty.value = d;
    setRaw(DIFFICULTY_KEY, d);
    cells.value = arr;
    solution.value = sol;
    const hv = +saved.hearts;
    hearts.value = hv >= 0 && hv <= d ? hv : d;
    selected.value = -1;
    notesMode.value = false;
    phase.value = PLAY;
    newBest.value = false;
    justWon.value = false;
    bestTime.value = +(getRaw(bestKey()) || 0);
    gameId.value++;
    revealBoard();   // 恢复存档也逐格渲染
    restoreTick(Math.max(0, +saved.time || 0));
    return true;
  } catch {
    return false;
  }
}

// ---------- 渲染辅助 ----------

function sameUnit(a, b) {
  const ra = (a / 9) | 0;
  const ca = a % 9;
  const rb = (b / 9) | 0;
  const cb = b % 9;
  return ra === rb || ca === cb
    || (((ra / 3) | 0) === ((rb / 3) | 0) && ((ca / 3) | 0) === ((cb / 3) | 0));
}

// 该格当前数字是否与唯一解不符（题面格与答案一致，不会判错）
function isWrong(i) {
  const v = cells.value[i].v;
  return v > 0 && v !== solution.value[i];
}

function cellClass(i, cell) {
  const s = selected.value;
  const out = [];
  if (cell.fixed) out.push('fixed');
  if (s >= 0 && s !== i && sameUnit(s, i)) out.push('hl');
  if (s >= 0 && s !== i && cells.value[s].v && cells.value[s].v === cell.v) out.push('same');
  if (!cell.fixed && isWrong(i)) out.push('err');
  if (i === s) out.push('sel');
  return out;
}

// 宫分隔线：格与格之间细线，每 3 行/列（3×3 宫边界）用略深的线区分各宫
// （web 用 CSS grid 排 9×9；小程序侧改成绝对定位，位置与边框全部由这里给）
const SUDOKU_LINE = '#d3d8df';
const SUDOKU_STRONG = '#5f7086';
function cellStyle(i) {
  const r = (i / 9) | 0;
  const c = i % 9;
  const style = {
    left: `${c * CELL}rpx`,
    top: `${r * CELL}rpx`,
    width: `${CELL}rpx`,
    height: `${CELL}rpx`,
    borderTopWidth: r > 0 ? (r % 3 === 0 ? '4rpx' : '2rpx') : '0',
    borderLeftWidth: c > 0 ? (c % 3 === 0 ? '4rpx' : '2rpx') : '0',
    borderTopColor: r > 0 ? (r % 3 === 0 ? SUDOKU_STRONG : SUDOKU_LINE) : 'transparent',
    borderLeftColor: c > 0 ? (c % 3 === 0 ? SUDOKU_STRONG : SUDOKU_LINE) : 'transparent',
  };
  if (revealing.value) style.animationDelay = `${revealDelay(i)}ms`;
  return style;
}

// 正确填入 d 之后，同行 / 同列 / 同宫里其它空格的候选里不该再留着 d
function pruneNotes(i, d) {
  const r = (i / 9) | 0;
  const c = i % 9;
  const br = ((r / 3) | 0) * 3;
  const bc = ((c / 3) | 0) * 3;
  const bit = 1 << d;
  let touched = false;
  const clear = (j) => {
    const cell = cells.value[j];
    if (!cell || cell.fixed || cell.v || !(cell.notes & bit)) return;
    cell.notes &= ~bit;
    touched = true;
  };
  for (let k = 0; k < 9; k++) {
    clear(r * 9 + k);                                  // 行
    clear(k * 9 + c);                                  // 列
    clear((br + ((k / 3) | 0)) * 9 + (bc + (k % 3)));  // 宫
  }
  return touched;
}

// ---------- 交互 ----------

function onCellClick(i) {
  if (phase.value !== PLAY) return;
  const cell = cells.value[i];
  selected.value = selected.value === i ? -1 : i;
}

function onPad(d) {
  if (phase.value !== PLAY) return;
  const s = selected.value;
  if (s < 0) return;
  const cell = cells.value[s];
  if (cell.fixed) return;
  // 再点一次当前格已填的数字 = 清除该格（即使该数字已放满，也可借此纠错）
  if (cell.v === d) {
    cell.v = 0;
    cell.notes = 0;
    saveState();
    return;
  }
  // 该数字 9 个已全部放完：置灰不可再选（含新增笔记候选）
  if (digitLeft.value[d] <= 0) return;
  // 笔记模式下空格点数字 = 添加/移除候选；其余情况为填写
  if (notesMode.value && !cell.v) {
    cell.notes ^= 1 << d;
    saveState();
    return;
  }
  cell.v = d;
  cell.notes = 0;
  checkMistake(s);
  // 填对了才顺手清候选（填错时那个数字其实没落位，留着候选是对的）
  if (phase.value === PLAY && !isWrong(s) && pruneNotes(s, d)) saveState();
  afterEdit();
}

function onErase() {
  if (phase.value !== PLAY) return;
  const s = selected.value;
  if (s < 0) return;
  const cell = cells.value[s];
  if (cell.fixed || (!cell.v && !cell.notes)) return;
  cell.v = 0;
  cell.notes = 0;
  saveState();
}

// ---------- 判定 ----------

function afterEdit() {
  for (let i = 0; i < cells.value.length; i++) {
    if (cells.value[i].v !== solution.value[i]) return;
  }
  win();
}

// 刚填入的数字若与答案不符：扣一颗心，扣掉最后一颗心的那次就失败。
// 于是 简单（1 颗）错一次就结束、中等（2 颗）两次、困难（3 颗）三次
function checkMistake(i) {
  if (!isWrong(i)) return;
  hearts.value = Math.max(0, hearts.value - 1);
  playFail();   // 填错，扣❤️
  if (hearts.value <= 0) lose();
}

function lose() {
  if (phase.value !== PLAY) return;
  stopTick();
  removeState(); // 失败的对局不再恢复，下次进入开新局
  phase.value = OVER;
  playLose();
}

function win() {
  if (phase.value !== PLAY) return;
  const elapsed = seconds.value;
  stopTick();
  newBest.value = !bestTime.value || elapsed < bestTime.value;
  if (newBest.value) {
    setRaw(bestKey(), elapsed);
    bestTime.value = elapsed;
  }
  removeState(); // 已完成的对局不再恢复，下次进入开新局
  // 彩带只在真正赢下的这一刻放；恢复存档的胜利态不放（与 web 一致）
  justWon.value = true;
  playWin();
  clearTimeout(wonTimer);
  wonTimer = setTimeout(() => { justWon.value = false; }, 4000);
  // web：先撒花，450ms 后才把 phase 置成 WON（让彩带先露一下脸）
  clearTimeout(winTimer);
  winTimer = setTimeout(() => { phase.value = WON; }, 450);
}

// ---------- 帮助 ----------
const helpOpen = ref(false);
// 帮助文案：导语 + 各条（用空行分段，HelpSheet 会拆成段落）
const helpText = computed(() => {
  const parts = [];
  const keys = ['helpMsg'];
  for (let i = 1; i <= 10; i += 1) keys.push(`help${i}`);
  keys.forEach((k) => { const v = tt(k); if (v && v !== k) parts.push(v); });
  return parts.join('\n\n');
});
function toggleNotesMode() {
  notesMode.value = !notesMode.value;
}

// ---------- 存档 key / 难度 / 开局（这几段之前被误删，已按 web 的实现补回）----------
function initDifficulty() {
  const saved = +(getRaw(DIFFICULTY_KEY) || 1);
  return saved >= MIN_DIFFICULTY && saved <= MAX_DIFFICULTY ? saved : 1;
}

function changeDifficulty(dir) {
  const next = difficulty.value + dir;
  if (next < MIN_DIFFICULTY || next > MAX_DIFFICULTY) return;
  difficulty.value = next;
  setRaw(DIFFICULTY_KEY, next);
  initGame();
}

function bestKey() {
  return KEY_PREFIX + difficulty.value;
}

function fmt(sec) {
  return ('00' + ~~(sec / 60)).slice(-2) + ':' + ('00' + sec % 60).slice(-2);
}

function initGame() {
  clearTimeout(winTimer);
  const { puzzle, solution: sol } = generatePuzzle(DIFFICULTIES[difficulty.value - 1].empties);
  // 每个格子：v 数字（0 为空）、fixed 题面格、notes 候选数位掩码
  cells.value = puzzle.map(v => ({ v, fixed: v > 0, notes: 0 }));
  solution.value = sol;
  hearts.value = difficulty.value;      // 简单 1 / 一般 2 / 困难 3
  selected.value = -1;
  notesMode.value = false;
  phase.value = PLAY;
  newBest.value = false;
  bestTime.value = +(getRaw(bestKey()) || 0);
  gameId.value += 1;
  revealBoard();
  resetTick();
}

function isFinished() {
  for (let i = 0; i < 81; i += 1) {
    if (!cells.value[i].v || cells.value[i].v !== solution.value[i]) return false;
  }
  return true;
}

function removeState() {
  setRaw(STATE_KEY, '');
}

function revealBoard() {
  clearTimeout(revealTimer);
  revealing.value = true;
  revealTimer = setTimeout(() => { revealing.value = false; }, REVEAL_MS);
}

function revealDelay(i) {
  const r = (i / 9) | 0;
  const c = i % 9;
  return r * 26 + c * 14;
}

// ---------- 生命周期（这段之前也被误删，已补回）----------
onMounted(() => {
  if (!restore()) initGame();
});

onUnmounted(() => {
  stopTick();
  clearTimeout(winTimer);
  clearTimeout(revealTimer);
});

// 切后台暂停计时（与 web 的 visibilitychange 一致），回来继续
onHide(() => { stopTick(); });
onShow(() => { if (phase.value === PLAY) startTick(); });

function showHelp() {
  helpOpen.value = true;
}
</script>

<style lang="scss" scoped>
/* web 的 keyframes 逐条搬过来（px → rpx 按 1.908 折算） */
@keyframes cell-pop {
  from { opacity: 0; transform: scale(0.86); }
  to { opacity: 1; transform: scale(1); }
}
/* 数字（题面格与已填格）随格子逐一弹出，而不是整盘同时出现 */
@keyframes num-pop {
  from { opacity: 0; transform: scale(0.3); }
  60% { opacity: 1; transform: scale(1.12); }
  to { opacity: 1; transform: scale(1); }
}
/* 结算层进场（web 的 <Transition name="win-pop"> 只保留进场这一段） */
@keyframes result-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
/* 掉一颗❤️：放大淡出（web 的 shared/Hearts.vue） */
@keyframes heart-pop {
  0% { transform: scale(1); opacity: 1; }
  40% { transform: scale(1.55); opacity: 1; }
  100% { transform: scale(2.1); opacity: 0; }
}

/* 一页只允许一处 min-height: 100vh（就在 .screen 上） */
.screen {
  min-height: 100vh;
  background: transparent;  /* 背景交给 ParticleBackground（canvas 自己铺底色） */
}
.page {
  padding: 36rpx 24rpx 140rpx;   /* 底部 140rpx 让开右下角悬浮按钮 */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 36rpx;                    /* 块间距 */
  background: #f0f2f5;
  color: #2c3e50;
}

/* ---------- 分数区 / 操作区（高度由 App.vue 的全局 .score-area / .opt-area 统一给） ---------- */
.score-area,
.opt-area {
  width: 690rpx;                 /* web 的 calc(100% - 32px) = 361px */
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

/* 生命：逐颗 ❤️ / 🤍 + 掉心动画 */
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

/* 难度 −/+：28px 小方块（点选热区用 ::after 扩到 44px，不占布局） */
.difficulty-wrapper {
  flex: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;                     /* web 的 gap: 4px */
}
.difficulty-value {
  min-width: 76rpx;              /* 40px */
  padding: 0 4rpx;
  box-sizing: border-box;
  text-align: center;
  font-size: 27rpx;              /* 14px */
  color: #5f6b7a;
  font-weight: 400;
  white-space: nowrap;
}
.opt-icon {
  position: relative;
  width: 53rpx;                  /* 28px */
  height: 53rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2rpx solid #e1e1e1;
  border-radius: 15rpx;          /* 8px */
  background: #fff;
  color: #2c3e50;
  font-size: 29rpx;              /* 15px → 图标 1.2em ≈ 35rpx */
}
.opt-icon::after {
  content: '';
  position: absolute;
  top: -15rpx;
  right: -15rpx;
  bottom: -15rpx;
  left: -15rpx;
}
.opt-icon.disable { color: #e1e1e1; }
.opt-ico { pointer-events: none; }

.opt-half {
  flex: 2.5;
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
/* 计时（web 的 CountTimer：图标 + MM:SS，14px / 600） */
.timer {
  display: flex;
  align-items: center;
  gap: 11rpx;                    /* 6px */
  font-size: 27rpx;              /* 14px */
  font-weight: 600;
}
.timer-ico { pointer-events: none; }
.timer-txt { font-variant-numeric: tabular-nums; }

/* 主按钮：web 的 .game-icon（padding 8px 12px / 13px 字 / 8px 圆角） */
.game-icon {
  margin: 0;
  padding: 0 23rpx;
  height: 71rpx;                 /* web 实测 37px */
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
/* 「再来一局」是橙色描边按钮（与 web 全局的 .replay-btn 一致） */

/* ---------- 游戏区：630rpx 外框（边框 4rpx）+ 622rpx 棋盘 ---------- */
.game-area {
  position: relative;
  width: 630rpx;
  height: 630rpx;
  margin: 0 auto;
}
.board-frame {
  box-sizing: border-box;
  width: 630rpx;
  height: 630rpx;
  border: 4rpx solid #5f7086;    /* 2px */
  border-radius: 15rpx;          /* 8px */
  background: #5f7086;
  overflow: hidden;
}
.board {
  position: relative;
  width: 622rpx;
  height: 622rpx;
  background: #fff;
}
/* 单格：位置 / 宽高 / 上左边框由 cellStyle() 给；右边框与下边框固定 3px 浅线（同 web） */
.cell {
  position: absolute;
  box-sizing: border-box;
  border-style: solid;
  border-color: #d3d8df;
  border-right-width: 6rpx;      /* 3px */
  border-bottom-width: 6rpx;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-tap-highlight-color: transparent;
  /* 新局整盘重挂载（key 带 gameId），借入场动画逐格弹出 */
  animation: cell-pop 0.28s ease backwards;
}
.num {
  font-size: 35rpx;              /* web 20px，随棋盘等比缩到 630/690 */
  line-height: 1;
  font-weight: 500;
  color: #23804e;
  font-variant-numeric: tabular-nums;
}
/* 笔记：3×3 网格用 flex-wrap 复刻（小程序里不依赖 CSS grid） */
.notes {
  display: flex;
  flex-wrap: wrap;
  width: 100%;
  height: 100%;
  align-items: center;
}
.note {
  width: 33.3333%;
  height: 33.3333%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  font-size: 15rpx;              /* web 9px，随棋盘等比缩小 */
  line-height: 1;
  color: #2c3e50;
  opacity: 0;
}
.note.has { opacity: 0.62; }
/* 与盘面上点中的数字相同的候选：底色块 + 白字（色块撑满自己那一格，不能靠 line-height 撑高） */
.note.has.hl {
  opacity: 1;
  color: #fff;
  font-weight: 700;
  background: #23804e;
  border-radius: 4rpx;
}
.cell.fixed .num {
  font-weight: 700;
  color: #2c3e50;
}
/* 同行 / 同列 / 同宫：最淡的一档 */
.cell.hl { background: #c9d6e8; }
.cell.hl .num {
  color: #2c3e50;
  font-weight: 700;
}
/* 与点中的数字相同：更实的一档 */
.cell.same { background: #8fdcb2; }
.cell.same .num {
  color: #2c3e50;
  font-weight: 700;
}
/* 选中格：最深的一档 + 主色描边 */
.cell.sel {
  background: #7ad0a4;
  box-shadow: inset 0 0 0 4rpx #23804e;
}
.cell.sel .num {
  color: #2c3e50;
  font-weight: 700;
}
/* 填错的格子要红：置于 .sel / .same 之后，选中态也不能被绿色覆盖 */
.cell.err { background: #fdeeee; }
.cell.err .num {
  color: #b8433d;
  font-weight: 700;
}
.cell.err.sel { box-shadow: inset 0 0 0 4rpx #b8433d; }
/* 开局 / 恢复的逐格入场：格子与数字都按 cellStyle() 给的 animationDelay 依次出现 */
.board.revealing .cell .num {
  animation: num-pop 0.26s ease backwards;
}

/* 结算层：与游戏区（棋盘外框）矩形完全重合 */
.result {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  z-index: 2;
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
  animation: result-in 0.28s ease;
}
.result.lose { color: #b11; }
.result-main {
  font-size: 34rpx;
  font-weight: bold;
  animation: cell-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.result .new-best {
  color: #23804e;
  font-size: 29rpx;              /* 15px */
  animation: cell-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.result .game-icon { animation: cell-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); }

/* ---------- 数字键盘 / 工具（web 的 pad：padding 10px、行间距 8px） ---------- */
.pad {
  width: 690rpx;
  display: flex;
  flex-direction: column;
  gap: 15rpx;                    /* web 的 gap: 8px */
  padding: 19rpx;                /* web 的 padding: 10px */
  box-sizing: border-box;
}
.keys {
  display: flex;
  gap: 11rpx;                    /* web 的 gap: 6px */
}
.key {
  position: relative;
  flex: 1;
  height: 80rpx;                 /* 42px */
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  font-size: 34rpx;              /* 18px */
  font-weight: bold;
  border: 0;
  border-radius: 15rpx;          /* 8px */
  background: #eef0f4;
  color: #2c3e50;
  line-height: 80rpx;            /* 与高度同值：数字垂直居中 */
  text-align: center;
  -webkit-tap-highlight-color: transparent;
  font-variant-numeric: tabular-nums;
}
.key .badge {
  position: absolute;
  top: 2rpx;
  right: 6rpx;
  font-size: 19rpx;              /* 10px */
  font-weight: 700;
  line-height: 1;
  color: #2c3e50;
  opacity: 0.75;
}
/* 按下反馈：web 是 :active { background: var(--key-active-bg) }，小程序用 hover-class */
.key-down { background: #dfe3ea; }
/* 数字放满 9 个后置灰：仍允许「再点一次已填数字 = 清格」 */
.key.used { opacity: 0.35; }
.key.on {
  background: #23804e;
  color: #fff;
  opacity: 1;
}
.key.on .badge {
  color: #fff;
  opacity: 1;
}
.tools {
  display: flex;
  gap: 11rpx;                    /* web 的 gap: 6px */
}
.tool {
  flex: 1;
  height: 73rpx;                 /* 38px */
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;                    /* web 的 gap: 5px */
  margin: 0;
  padding: 0;
  font-size: 27rpx;              /* 14px */
  font-weight: 600;
  border: 2rpx solid #e1e1e1;
  border-radius: 15rpx;
  background: #fff;
  color: #2c3e50;
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}
.tool-ico {
  font-size: 32rpx;              /* web 的 i { font-size: 17px } → 图标 1.2em ≈ 20px */
  pointer-events: none;
}
.tool-down { background: #dfe3ea; }
.tool.active {
  background: #e5f6ec;
  border-color: #23804e;
  color: #23804e;
}
</style>
