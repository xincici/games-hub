<template>
  <view class="screen">
    <!-- 全站背景（粒子连线 + 底部过山车，与 web 的 ParticleBackground 同款） -->
    <ParticleBackground />
    <view class="page">
      <!-- 分数区：最佳得分 / 剩余点击（web 的 .score-card，label 的 emoji 就在字典里） -->
      <view class="card score-area">
        <view class="stat">
          <text class="stat-label">{{ tt('bestScore') }}</text>
          <text class="stat-value">{{ bestScore || '--' }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('availableClicks') }}</text>
          <text class="stat-value">{{ maxClick - clickCount }}</text>
        </view>
      </view>

      <!-- 操作区：难度 −/+（web 的 opt-item flex:3）| 新游戏 | 上帝模式（各 flex:3.5） -->
      <view class="card opt-area">
        <view class="opt-item opt-diff">
          <view class="opt-hit" @click="changeDifficulty(-1)">
            <view class="opt-icon" :class="{ disable: difficulty === MIN_DIFFICULTY }">
              <view class="i-carbon-subtract-alt" />
            </view>
          </view>
          <text class="difficulty-num">{{ difficulty }}</text>
          <view class="opt-hit" @click="changeDifficulty(1)">
            <view class="opt-icon" :class="{ disable: difficulty === MAX_DIFFICULTY }">
              <view class="i-carbon-add-alt" />
            </view>
          </view>
        </view>
        <view class="divider" />
        <view class="opt-item opt-start">
          <button class="game-icon" @click="initGame">{{ tt('start') }}</button>
        </view>
        <view class="divider" />
        <view class="opt-item opt-god">
          <!-- 上帝模式：可用条件是「播放中」或「玩家的操作全部撤销回初始局」 -->
          <button class="game-icon god-btn" :disabled="!autoplaying && undoIndex !== -1" @click="autoplayGame">
            {{ autoplaying ? tt('godPause') : tt('godMode') }}
          </button>
        </view>
      </view>

        <!-- 图例：一行看完三档亮度 + 循环方向（灭 → 全亮 → 半亮 ↺）
             只占一行：375×667 上多一行就会把整页顶出滚动条 -->
        <view class="legend">
          <view class="legend-chip"><view class="lamp zero" /><text class="legend-text">{{ tt('lampOff') }}</text></view>
          <text class="legend-sep">→</text>
          <view class="legend-chip"><view class="lamp one" /><text class="legend-text">{{ tt('lampFull') }}</text></view>
          <text class="legend-sep">→</text>
          <view class="legend-chip"><view class="lamp two" /><text class="legend-text">{{ tt('lampHalf') }}</text></view>
          <text class="legend-sep">↺</text>
          <text class="legend-tip">{{ tt('lampTip') }}</text>
        </view>

        <!-- 游戏区：n×n 格，外框尺寸由格子反算（PAD*2 + n*(cell + 2*GAP)），格子全部绝对定位 -->
        <view class="game-area" :class="'cell-' + cellSize" :style="areaStyle">
        <view v-for="(v, idx) in cells" :key="idx" class="cell" :style="cellStyles[idx]">
          <!-- 开局逐格掀开的蒙层（web 的 .mask + rAF 波浪；这里用 setInterval，onHide 停 / onShow 续）
               只用一个「已掀开数量」计数，而不是 100 个布尔：小程序端每 tick 只 setData 一个数字 -->
          <view v-if="idx >= revealed" class="mask" />
          <view
            class="inner"
            :class="{ zero: v === 0, two: v === 2, clicked: isClicked(idx) }"
            @click="onCellClick(cellRow(idx), cellCol(idx))"
            ><view class="bulb" /></view>
        </view>

        <view v-if="gameResult >= WIN" class="win">
          <text>🎉🎉 {{ tt('tipWin') }} 🎉🎉</text>
          <text v-if="gameResult === NB">{{ tt('newBest') }}</text>
        </view>
        <view v-if="gameResult === LOSE" class="lose">👻👻 {{ tt('tipLost') }} 👻👻</view>
        <!-- 上帝模式播放中：透明层挡住棋盘输入 -->
        <view v-if="autoplaying" class="automask" />
      </view>

      <!-- 撤销 / 重做（web 的 .undo-card） -->
      <view class="card undo-card">
        <view class="undo-item">
          <button class="undo" :disabled="undoIndex < 0 || gameResult !== GAMING || autoplaying" @click="userUndo">
            <view class="i-carbon-undo" />
            <text>{{ tt('undo') }}</text>
          </button>
        </view>
        <view class="divider" />
        <view class="undo-item">
          <button class="undo" :disabled="undoIndex === userOpts.length - 1 || gameResult !== GAMING || autoplaying" @click="userRedo">
            <view class="i-carbon-redo" />
            <text>{{ tt('redo') }}</text>
          </button>
        </view>
      </view>
    </view>

    <!-- 胜利彩带（纯 CSS 降级版，web 是 confetti canvas）：只在真正赢下这一刻放 -->
    <Confetti v-if="justWon" />

    <FloatingActions>
      <!-- 本游戏没有模式切换，右下角只有帮助 -->
      <view class="fab" @click="showHelp"><view class="fab-ico i-carbon-help" /></view>
    </FloatingActions>
    <HelpSheet :open="helpOpen" :text="helpText" @close="helpOpen = false" />
  </view>
</template>

<script setup>
// 点击游戏 · 微信小程序版
// 玩法逻辑逐行对照 web 的 src/games/click/ClickGame.vue（十字邻格各 +1 / 逢 3 归 0 / 全 0 胜利 /
// 次数用尽失败 / 撤销重做 / 上帝模式回放开局记录的解 / 难度与最佳分存档 key 都一致），平台差异只有这几处：
// - web 用 rAF 逐格掀蒙层 → setInterval（小程序逻辑层没有 rAF），onHide 停表、onShow 续，onUnmounted 清理；
// - localStorage → @/core/storage，Web Audio → @/core/sfx，页面可见性 → onHide；
// - 棋盘用一维数组（web 是二维），索引 row * n + col，判定 / 操作 / 撤销完全等价；
// - TopHeader 与「标题连点清记录」在原生导航栏下没有入口（与其它已迁移页面一致），故没有 onScoreReset。
import { computed, onUnmounted, ref, watch, watchEffect } from 'vue';
import { onHide, onShow } from '@dcloudio/uni-app';

import Confetti from '@/components/Confetti.vue';
import FloatingActions from '@/components/FloatingActions.vue';
import HelpSheet from '@/components/HelpSheet.vue';
import { setNavTitle } from '@/core/i18n';
import { playLose, playWin } from '@/core/sfx';
import { getRaw, setRaw } from '@/core/storage';
import { difficulty, changeDifficulty, MIN_DIFFICULTY, MAX_DIFFICULTY } from './difficulty';
import { tt } from './i18n';
import ParticleBackground from '@/components/ParticleBackground.vue';

// 原生导航栏标题跟随语言（pages.json 里的标题是静态的）
setNavTitle(() => tt('gameTitle'));

const BIG_VAL = 3;
const VIRTUAL_CLICK_EFFECT_DURATION = 220;
const VIRTUAL_CLICK_WAIT_DURATION = 300;
const REVEAL_STEP_MS = 16;                 // web 的 rAF 每帧掀一格（≈16.7ms）；小程序用 setInterval
const [GAMING, LOSE, WIN, NB] = [0, 1, 2, 3];
const [TINY, MINI, SMALL, MIDDLE, LARGE] = ['tiny', 'mini', 'small', 'middle', 'large'];

// 棋盘尺寸：web 的 .cell-* 在 ≤720px 媒体查询里是 50 / 44 / 38 / 33 / 30px，
// 外框 padding 10px、每格四周 2px 外边距 —— 按 390 宽折算成 rpx，外框尺寸由内容反算。
const CELL_RPX = { large: 96, middle: 85, small: 73, mini: 63, tiny: 58 };
const PAD_RPX = 19;                        // 10px
const GAP_RPX = 4;                         // 2px（每格单侧外边距）

const neighbours = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]];
const clickCount = ref(0);
const gameResult = ref(GAMING);
const autoplaying = ref(false);            // 上帝模式播放中；点一下「暂停」就退出、把操作权交回玩家
const autoRow = ref(-1);
const autoCol = ref(-1);
const userOpts = ref([]);
const undoIndex = ref(-1);
const cells = ref([]);                     // 0 / 1 / 2，索引 row * n + col
const revealed = ref(0);                   // 已经掀开蒙层的格数（按下标顺序，等价 web 的 maskData === 1）
const justWon = ref(false);
let wonTimer = null;

const storageKey = computed(() => `__easy_click_game__${difficulty.value}`);
const maxClick = computed(() => Math.pow(difficulty.value, 2));
const cellSize = computed(() => (difficulty.value <= 4 ? LARGE : difficulty.value <= 6 ? MIDDLE : difficulty.value <= 8 ? SMALL : difficulty.value <= 9 ? MINI : TINY));
const bestScore = ref(getRaw(storageKey.value));

// ---------- 棋盘几何（格子与蒙层共用同一份坐标数学） ----------
const cellRpx = computed(() => CELL_RPX[cellSize.value]);
const pitchRpx = computed(() => cellRpx.value + GAP_RPX * 2);
const boardRpx = computed(() => PAD_RPX * 2 + difficulty.value * pitchRpx.value);
const areaStyle = computed(() => ({ width: `${boardRpx.value}rpx`, height: `${boardRpx.value}rpx` }));
// 每格的 left/top/宽高一次算好并缓存在 computed 里（换难度才重算）：
// 蒙层波浪每 16ms 触发一次重渲，格子若每次返回新对象，小程序端会当成 style 变了而重刷整盘
const cellStyles = computed(() => {
  const n = difficulty.value;
  const w = `${cellRpx.value}rpx`;
  const step = pitchRpx.value;
  const base = PAD_RPX + GAP_RPX;
  return Array.from({ length: n * n }, (_, idx) => ({
    left: `${base + (idx % n) * step}rpx`,
    top: `${base + Math.floor(idx / n) * step}rpx`,
    width: w,
    height: w,
  }));
});
const cellRow = idx => Math.floor(idx / difficulty.value);
const cellCol = idx => idx % difficulty.value;
const isClicked = idx => autoRow.value === cellRow(idx) && autoCol.value === cellCol(idx);

let autoGen = 0;
let revealTimer = null;

const historyOpts = {
  list: new Map(),
  add: function (opt) {
    if (!this.list.has(opt)) this.list.set(opt, 1);
    else if (this.list.get(opt) === 1) this.list.set(opt, 2);
    else this.list.delete(opt);
  },
};

const randomOnce = max => [Math.floor(Math.random() * max), Math.floor(Math.random() * max)];
const randomData = length => new Array(length * length).fill(0);
const sleep = ms => new Promise(res => setTimeout(res, ms));

// ---------- 开局：随机若干操作（记录成解），再把蒙层逐格掀开 ----------
function initGame() {
  stopReveal();
  stopAutoplay();
  cells.value = randomData(difficulty.value);
  revealed.value = 0;
  randomSomeOperations();
  gameResult.value = GAMING;
  clickCount.value = 0;
  userOpts.value = [];
  undoIndex.value = -1;
  startReveal();
}

function startReveal() {
  if (revealTimer) return;
  const total = maxClick.value;           // = n × n
  if (revealed.value >= total) return;
  revealed.value += 1;                    // 与 web 的 toggleMask(0) 一致：第一格在首帧前就掀开
  if (revealed.value >= total) return;
  revealTimer = setInterval(() => {
    revealed.value += 1;
    if (revealed.value >= maxClick.value) stopReveal();
  }, REVEAL_STEP_MS);
}
function stopReveal() {
  if (revealTimer) clearInterval(revealTimer);
  revealTimer = null;
}

// 播放中再点按钮 = 暂停：退出循环、把操作权交回玩家（之后可以手动点、也可以撤销）
function stopAutoplay() {
  autoGen += 1;
  autoplaying.value = false;
  autoRow.value = -1;                     // 清掉「正在点这一格」的高亮
  autoCol.value = -1;
}

async function autoplayGame() {
  if (autoplaying.value) { stopAutoplay(); return; }
  const gen = ++autoGen;
  autoplaying.value = true;
  const opts = [];
  Array.from(historyOpts.list.keys()).forEach((item) => {
    const one = item.split(',').map(v => +v);
    opts.push(one);
    if (historyOpts.list.get(item) === 1) opts.push(one);
  });
  opts.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
  for (let i = 0; i < opts.length; i += 1) {
    if (gen !== autoGen || !autoplaying.value || gameResult.value !== GAMING) break;   // 中途赢了 / 被暂停就收工
    const [row, col] = opts[i];
    onCellClick(row, col);
    await virtualClick(row, col, gen);
    await sleep(VIRTUAL_CLICK_WAIT_DURATION);
  }
  if (gen === autoGen) stopAutoplay();
}

async function virtualClick(row, col, gen) {
  autoRow.value = row;
  autoCol.value = col;
  await sleep(VIRTUAL_CLICK_EFFECT_DURATION);
  if (gen !== autoGen) return;            // 中途被暂停 / 重开 / 切后台：不要清掉之后的（新的）高亮
  autoRow.value = -1;
  autoCol.value = -1;
}

function randomSomeOperations() {
  historyOpts.list = new Map();
  for (let i = 0; i < (difficulty.value - 2) * 3; i++) {
    const [row, col] = randomOnce(difficulty.value);
    onCellClick(row, col, true);
    historyOpts.add(`${row},${col}`);
    if (Math.random() < 0.5) {
      onCellClick(row, col, true);
      historyOpts.add(`${row},${col}`);
    }
  }
}

function updateBestScore() {
  const score = maxClick.value - clickCount.value;
  if (!bestScore.value || bestScore.value < score) {
    setRaw(storageKey.value, String(score));
    bestScore.value = score;
    gameResult.value = NB;
  }
}

function operateCell(row, col, diff) {
  const n = difficulty.value;
  neighbours.forEach(([iRow, iCol]) => {
    iRow += row;
    iCol += col;
    if (iRow < 0 || iRow >= n) return;
    if (iCol < 0 || iCol >= n) return;
    const idx = iRow * n + iCol;
    cells.value[idx] = (cells.value[idx] + diff + BIG_VAL) % BIG_VAL;
  });
}

function onCellClick(row, col, isRandom) {
  clickCount.value++;
  if (!isRandom) {
    userOpts.value.length = undoIndex.value + 1;
    userOpts.value.push([row, col]);
    undoIndex.value++;
  }
  operateCell(row, col, 1);
  checkResult();
  if (clickCount.value === maxClick.value && gameResult.value !== WIN) {
    gameResult.value = LOSE;
    playLose();
  }
}

function checkResult() {
  for (let i = 0; i < cells.value.length; i++) {
    if (cells.value[i] !== 0) return;
  }
  gameResult.value = WIN;
}

function userUndo() {
  clickCount.value--;
  const [row, col] = userOpts.value[undoIndex.value];
  undoIndex.value--;
  operateCell(row, col, -1);
}

function userRedo() {
  clickCount.value++;
  const [row, col] = userOpts.value[undoIndex.value + 1];
  undoIndex.value++;
  operateCell(row, col, 1);
}

// ---------- 帮助 ----------
const helpOpen = ref(false);
const helpText = computed(() => {
  const parts = [];
  ['helpMsg', 'help1', 'help2', 'help3', 'help4'].forEach((k) => {
    const v = tt(k);
    if (v && v !== k) parts.push(v);
  });
  return parts.join('\n\n');
});
function showHelp() {
  helpOpen.value = true;
}

// ---------- 监听（顺序与 web 一致：先 bestScore，再立即开局，最后才挂 gameResult） ----------
watchEffect(() => {
  bestScore.value = getRaw(storageKey.value);
});
watch(difficulty, initGame, { immediate: true });
watch(gameResult, (val) => {
  if (val === WIN) {
    updateBestScore();
    // web 的 confetti() 同时播 success.mp3：彩带与音效同一个落点
    justWon.value = true;
    clearTimeout(wonTimer);
    wonTimer = setTimeout(() => { justWon.value = false; }, 4000);
    playWin();
  }
});

// ---------- 生命周期 ----------
// 切后台：蒙层波浪停在当前格、上帝模式不能在后台继续点（web 只清了 onUnmounted）
onHide(() => {
  stopReveal();
  if (autoplaying.value) stopAutoplay();
});

// 回到前台：从停下的那一格继续掀蒙层
onShow(() => {
  if (revealed.value < maxClick.value) startReveal();
});

onUnmounted(() => {
  stopReveal();
  stopAutoplay();
  clearTimeout(wonTimer);
});
</script>

<style lang="scss" scoped>
/* 整页只允许一处 100vh 最小高度（就是下面这条，别再给 .page 写） */
.screen {
  min-height: 100vh;
  background: transparent;  /* 背景交给 ParticleBackground（canvas 自己铺底色） */
}
.page {
  padding: 27rpx 24rpx 128rpx;   /* 底部留出悬浮按钮的位置（图例占了 ~20px，这里收 12rpx 抵消） */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 31rpx;                    /* web 的 --row-gap: 16px */
  background: #f0f2f5;
  color: #2c3e50;
}

/* ---------- 分数区 / 操作区（高度由 App.vue 的全局 .score-area / .opt-area 统一给） ---------- */
.score-area,
.opt-area {
  width: 690rpx;                 /* web 的 calc(100% - 32px) ≈ 361px */
  display: flex;
  align-items: center;
  box-sizing: border-box;
}
.score-area { padding: 0 23rpx; }
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

/* ---------- 操作区：难度 3 | 新游戏 3.5 | 上帝模式 3.5（web 的 opt-item flex 比例） ---------- */
.opt-item {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 19rpx 8rpx;           /* web 的 padding: 10px 4px */
  box-sizing: border-box;
  gap: 8rpx;                     /* web 的 gap: 4px */
}
.opt-diff { flex: 3; }
.opt-start { flex: 3.5; }
.opt-god { flex: 3.5; }
/* 视觉上仍是 28px 小方块；web 用 ::after 把热区扩到 44×44，
   小程序不用伪元素，改成上下各加 7rpx（横向会挤爆难度格，故不扩宽） */
.opt-hit { padding: 7rpx 0; }
.opt-icon {
  position: relative;
  width: 54rpx;                  /* 28px */
  height: 54rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border: 2rpx solid #e1e1e1;
  border-radius: 15rpx;
  background: #fff;
  color: #2c3e50;
  font-size: 29rpx;              /* 15px → 图标 1.2em ≈ 35rpx */
}
.opt-icon.disable { color: #e1e1e1; }
.difficulty-num {
  min-width: 42rpx;              /* 22px */
  font-size: 35rpx;              /* 18px */
  font-weight: bold;
  text-align: center;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
/* web 的 .game-icon：8px 12px 内边距 / 13px 字 / 8px 圆角 / 品牌绿 */
.game-icon {
  margin: 0;
  padding: 0 23rpx;
  height: 71rpx;
  line-height: 71rpx;
  border: 0 none;
  border-radius: 15rpx;
  background: #23804e;
  color: #fff;
  font-size: 25rpx;
  font-weight: bold;
  white-space: nowrap;
  box-sizing: border-box;
}
.game-icon[disabled] { background-color: #aaa; }
/* 上帝模式按钮：可点击时是橙色（web 的 --god-bg），禁用时仍是灰 */
.god-btn { background-color: #c2410c; }
.god-btn[disabled] { background-color: #aaa; }

/* ---------- 游戏区（尺寸由 areaStyle 反算，格子全部绝对定位） ---------- */
.game-area {
  position: relative;
}
.cell {
  position: absolute;
}
.mask {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  background: #c9ced6;           /* web 的 --cell-mask */
  border-radius: 15rpx;
}
/* ---------- 关灯：每一格就是一盏灯 ----------
   0 = 熄（灯珠暗灰、灯圈不亮）、1 = 全亮（近白灯珠 + 强辉光 + 亮灯圈）、2 = 半亮（琥珀、辉光约三分之一）。
   亮度变化全部走 transition（背景 / 灯圈 / 辉光）→ 切换时是渐变，不是跳变。 */
.inner {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  margin: 0;
  box-sizing: border-box;
  border: 2rpx solid rgba(255, 214, 102, 0.95);
  border-radius: 15rpx;
  background: #3a3119;
  transition: background-color 0.32s ease, border-color 0.32s ease, box-shadow 0.32s ease;
}
.bulb {
  position: absolute;
  left: 22%;
  top: 22%;
  width: 56%;
  height: 56%;
  border-radius: 50%;
  background: #fff6cf;
  box-shadow: inset 0 2rpx 4rpx rgba(0, 0, 0, 0.18), 0 0 23rpx 8rpx rgba(255, 205, 90, 0.85);
  transition: background-color 0.32s ease, box-shadow 0.32s ease;
}
/* 0 = 熄 */
.inner.zero {
  border-color: transparent;
  background: #1c232d;
}
.inner.zero .bulb {
  background: #39414f;
  box-shadow: inset 0 4rpx 8rpx rgba(0, 0, 0, 0.55);
}
/* 2 = 半亮 */
.inner.two {
  border-color: rgba(255, 214, 102, 0.4);
  background: #232019;
}
.inner.two .bulb {
  background: #d99433;
  box-shadow: inset 0 2rpx 6rpx rgba(0, 0, 0, 0.22), 0 0 13rpx 4rpx rgba(217, 148, 51, 0.34);
}
/* 上帝模式「正在点这一格」：亮一圈主色环（原来整格调到 10% 透明，灯就看不见了） */
.inner.clicked {
  box-shadow: inset 0 0 0 6rpx #12833f;
}

/* ---------- 图例（灭 → 全亮 → 半亮 ↺） ---------- */
.legend {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: nowrap;
  margin: 0;
}
.legend-chip {
  display: flex;
  align-items: center;
}
.legend-text {
  margin-left: 6rpx;
  font-size: 21rpx;
  color: #8b93a0;
}
.legend-sep {
  margin: 0 10rpx;
  font-size: 21rpx;
  color: #8b93a0;
}
.lamp {
  width: 23rpx;
  height: 23rpx;
  border-radius: 50%;
}
.lamp.zero { background: #39414f; box-shadow: inset 0 2rpx 4rpx rgba(0, 0, 0, 0.5); }
.lamp.two { background: #d99433; box-shadow: 0 0 11rpx 2rpx rgba(217, 148, 51, 0.34); }
.lamp.one { background: #fff6cf; box-shadow: 0 0 15rpx 4rpx rgba(255, 205, 90, 0.85); }
.legend-tip {
  margin-left: 12rpx;
  font-size: 20rpx;
  line-height: 1.3;
  color: #8b93a0;
}
.game-area.cell-tiny .inner { font-size: 25rpx; }   /* web 的 .cell-tiny .inner { font-size: 13px } */

/* 胜负层 / 播放遮罩：与游戏区矩形完全重合（web 的 .win / .lose / .automask） */
.win,
.lose,
.automask {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.8);   /* web 的 --mask-color */
  color: #12833f;                          /* web 的 --win-color */
  font-size: 35rpx;                        /* 18px */
  font-weight: bold;
}
.win { z-index: 2; }
.lose { z-index: 2; color: #b11; }         /* web 的 --lose-color */
.automask { z-index: 3; background: rgba(255, 255, 255, 0); }

/* ---------- 撤销 / 重做 ---------- */
.undo-card {
  /* 两颗按钮加起来 = 屏宽 75%（750 × 0.75 = 562rpx）。
     卡片在 .page（690rpx）里，`width: 75%` 只是页面宽的 75% ✗ → 直接写 rpx：
     562 + 4×15（两个 .undo-item 的左右内边距）= 622rpx */
  width: 622rpx;
  margin: 0 auto;
  display: flex;
  align-items: stretch;
  box-sizing: border-box;
}
.undo-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 15rpx;                /* web 的 padding: 8px */
}
.undo {
  margin: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 15rpx;                    /* web 的 gap: 8px */
  width: 100%;                   /* 不再限 max-width：两格各占一半 → 合计屏宽 75% */
  height: 71rpx;
  padding: 0 31rpx;
  font-size: 27rpx;              /* 14px */
  font-weight: bold;
  line-height: 1;
  color: #23804e;
  background: transparent;
  border: 2rpx solid #23804e;
  border-radius: 15rpx;
  box-sizing: border-box;
  transition: background-color 0.15s, border-color 0.15s, color 0.15s;
}
/* 不可用时 50% 透明（background 显式写一遍，压过微信 button[disabled] 自带底色） */
.undo[disabled] {
  opacity: 0.5;
  color: #2c3e50;
  border-color: #2c3e50;
  background: transparent;
}
</style>
