<template>
  <view class="screen" @touchstart="onTouchStart" @touchend="onTouchEnd" @touchcancel="onTouchCancel">
    <!-- 全站背景（粒子连线 + 底部过山车，与 web 的 ParticleBackground 同款） -->
    <ParticleBackground />
    <view class="page">
      <!-- 分数区：最佳得分 / 当前得分（与 web 的 .score-area 一致） -->
      <view class="card score-area">
        <view class="stat">
          <text class="stat-label">{{ tt('bestScore') }}</text>
          <text class="stat-value">{{ bestScore }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('score') }}</text>
          <text class="stat-value">{{ score }}</text>
        </view>
      </view>

      <!-- 操作区：难度「− 值 +」| 新游戏 | 暂停/继续（web 的 .opt-area，分格 3 : 3.5 : 3.5） -->
      <view class="card opt-area">
        <view class="difficulty-wrapper">
          <view class="opt-icon" :class="{ disable: difficulty === MIN_DIFFICULTY }" @click="changeDifficulty(-1)">
            <view class="opt-ico i-carbon-subtract-alt" />
          </view>
          <text class="difficulty-value">{{ difficulty }}</text>
          <view class="opt-icon" :class="{ disable: difficulty === MAX_DIFFICULTY }" @click="changeDifficulty(1)">
            <view class="opt-ico i-carbon-add-alt" />
          </view>
        </view>
        <view class="divider" />
        <view class="start-wrapper">
          <button class="game-icon" @click="initGame">{{ tt('start') }}</button>
        </view>
        <view class="divider" />
        <view class="start-wrapper">
          <button class="game-icon pause-btn" :class="{ on: !pauseDisabled, off: pauseDisabled }" :disabled="pauseDisabled" @click="togglePause">
            {{ paused ? tt('resume') : tt('pause') }}
          </button>
        </view>
      </view>

      <!-- 游戏区：web 是一张 400×400 的 canvas 铺满卡片宽。小程序里 canvas 是原生组件，
           遮罩层压不住它（z-index 无效），所以这里用「CSS 棋盘格 + 绝对定位的蛇身/食物」
           按 web 的 draw() 同一套几何参数还原（pad 0.08 / 身体圆角 0.2 / 食物直径 0.72 格） -->
      <view class="game-area" :style="{ width: boardSize + 'rpx', height: boardSize + 'rpx' }">
        <view class="board" :style="boardStyle">
          <view
            v-for="(seg, i) in segments"
            :key="'seg-' + i"
            class="seg"
            :class="{ head: seg.head }"
            :style="seg.style"
          />
          <view v-if="foodStyle" class="food" :style="foodStyle" />
        </view>

        <!-- 暂停遮罩：点「继续」后先数 3 / 2 / 1，数完才真正恢复（数的时候仍然冻结） -->
        <view v-if="pauseShown" class="pause-mask" @click="togglePause">
          <text v-if="resumeCount" class="resume-count" :class="resumeCount % 2 ? 'pop-a' : 'pop-b'">{{ resumeCount }}</text>
          <text v-else class="pause-icon">⏸️</text>
          <text class="pause-tip">{{ resumeCount ? tt('readyTip') : tt('resumeTip') }}</text>
        </view>

        <!-- 失败遮罩：恢复「已失败」存档时也照样显示（与 web 一致） -->
        <view v-if="gameResult === LOSE" class="lose">
          <text>👻👻 {{ tt('tipLost') }} 👻👻</text>
          <text v-if="newBest">{{ tt('newBest') }}</text>
        </view>
      </view>
    </view>

    <!-- 胜利彩带：web 的贪吃蛇没有「赢」的判定（只有无尽撞死），justWon 恒为 false，
         这里保留与其它页面完全一致的结构，绝不拿 phase 直接判断 -->
    <Confetti v-if="justWon" />

    <FloatingActions>
      <!-- 穿墙开关（web 在 TopHeader 里；小程序没有页面内 header，按约定放右下角，模式在上、帮助在下） -->
      <view class="fab" @click="toggleWall">
        <view class="fab-ico" :class="throughWall ? 'i-mdi-wall-fire' : 'i-mdi-wall'" />
      </view>
      <view class="fab" @click="showHelp"><view class="fab-ico i-carbon-help" /></view>
    </FloatingActions>
    <HelpSheet :open="helpOpen" :text="helpText" @close="helpOpen = false" />
  </view>
</template>

<script setup>
// 贪吃蛇 · 微信小程序版
// 玩法逻辑逐行对照 web 的 SnakeGame.vue（网格 / 难度 / 得分 / 穿墙 / 暂停 + 3 2 1 倒数 / 存档结构都一致）。
// 平台差异：localStorage → core/storage，Web Audio → core/sfx，canvas → CSS 棋盘 + 绝对定位，
// Pointer Events → touch 滑动，keydown → 滑动（手机没有键盘），visibilitychange → onHide。
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { onHide } from '@dcloudio/uni-app';

import FloatingActions from '@/components/FloatingActions.vue';
import HelpSheet from '@/components/HelpSheet.vue';
import Confetti from '@/components/Confetti.vue';
import { getJSON, getRaw, setJSON, setRaw } from '@/core/storage';
import { playElimination, playLose } from '@/core/sfx';
import { tt } from './i18n';
import { throughWall, toggle as toggleWall } from './wall';
import { setNavTitle } from '@/core/i18n';
import ParticleBackground from '@/components/ParticleBackground.vue';

// 原生导航栏标题跟随语言（pages.json 里的标题是静态的）
setNavTitle(() => tt('gameTitle'));

// ---------- 存档 key：与 web 完全一致 ----------
const DIFFICULTY_KEY = '__snake_game__difficulty';
const BEST_KEY = '__snake_game__best';
const STATE_KEY = '__snake_game__state';

// ---------- 玩法常量（与 web 一字不差） ----------
const GRID = 20;                       // 20×20 格
const [GAMING, LOSE] = [0, 1];
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 5;
// 难度 → 移动间隔 ms（难度越高越快）与每食得分
const SPEEDS = [400, 320, 250, 190, 140];
const SCORE_PER_FOOD = [1, 2, 3, 4, 6];
const RESUME_STEP_MS = 800;            // web 的 shared/resumeCountdown.js：每个数字停留 800ms

// ---------- rpx 尺寸 ----------
// web 的 canvas 是 400×400、CSS 宽度 = 卡片宽（393 屏上 361px ≈ 690rpx）。
// 棋盘上限 690rpx；矮屏上按「让开右下角两颗悬浮按钮」缩一点（96×2 + 24 间距 + 40 底距 ≈ 256rpx）。
const BOARD_MAX = 690;
const BOARD_MIN = 540;
// 页面里除棋盘外的固定高度（rpx）：上 padding 36 + 分数卡 138 + 间距 36 + 操作区 138 + 间距 36
const PAGE_FIXED_H = 36 + 138 + 36 + 138 + 36;
// 悬浮按钮组从视口底部往上占的高度 + 一点呼吸：96 + 24 + 96 + 40 + 20 = 276rpx
const FAB_RESERVE = 276;

// ---------- 响应式状态 ----------
const score = ref(0);
const gameResult = ref(GAMING);
const newBest = ref(false);
const started = ref(false);
const paused = ref(false);
const resumeCount = ref(0);
// 彩带：只有真正赢下的那一刻才置 true（4 秒复位）。web 的贪吃蛇没有「胜利」判定
// （只有无尽撞死），所以这里恒为 false；结构与其它页面保持一致，绝不拿 gameResult 直接判断。
const justWon = ref(false);
const boardSize = ref(BOARD_MAX);

const snake = ref([]);
const dir = ref([0, 1]);
const nextDir = ref([0, 1]);
const food = ref(null);

let timer = null;
let resumeTimer = null;

const difficulty = ref(initDifficulty());
const bestScore = ref(+(getRaw(BEST_KEY) || 0));

const moveInterval = computed(() => SPEEDS[difficulty.value - 1]);
const pauseDisabled = computed(() => gameResult.value === LOSE || !started.value);
const pauseShown = computed(() => paused.value && gameResult.value === GAMING && started.value);
const cellRpx = computed(() => boardSize.value / GRID);

const rpx = n => `${Math.round(n * 100) / 100}rpx`;

// 棋盘格底纹：web 每格 (r+c)%2 交替填 #e8ecef / #e2e7eb。
// WXSS 不能给 background 用本地图片（真机空白，见 mp/AGENTS.md 第十节），所以用两层 45° 线性渐变拼棋盘：
// 每层是一个「左下 + 右上」三角，错开一格叠起来就是棋盘；底色 = (0,0) 的 #e2e7eb。
const boardStyle = computed(() => {
  const c = cellRpx.value;
  return {
    backgroundSize: `${rpx(c * 2)} ${rpx(c * 2)}`,
    backgroundPosition: `0 0, ${rpx(c)} ${rpx(c)}`,
  };
});

// 蛇身：web 的 draw() 里 pad = cell*0.08、size = cell - pad*2；蛇头朝前进方向的一侧大圆角（0.5），
// 其余角小圆角（0.18）；身体圆角 0.2，透明度从 1 按 0.03 递减、最低 0.35。
const segments = computed(() => {
  const cell = cellRpx.value;
  const pad = cell * 0.08;
  const size = cell - pad * 2;
  const d = dir.value;
  return snake.value.map(([r, c], idx) => {
    const box = {
      left: rpx(c * cell + pad),
      top: rpx(r * cell + pad),
      width: rpx(size),
      height: rpx(size),
    };
    if (idx === 0) {
      const big = size * 0.5;
      const small = size * 0.18;
      let radii;
      if (d[1] === 1) radii = [small, big, big, small];        // 右
      else if (d[1] === -1) radii = [big, small, small, big];  // 左
      else if (d[0] === 1) radii = [small, small, big, big];   // 下
      else radii = [big, big, small, small];                   // 上
      return {
        head: true,
        style: {
          ...box,
          background: '#2ea464',
          borderRadius: radii.map(v => rpx(v)).join(' '),
        },
      };
    }
    return {
      head: false,
      style: {
        ...box,
        background: `rgba(46, 164, 100, ${Math.round(Math.max(0.35, 1 - idx * 0.03) * 100) / 100})`,
        borderRadius: rpx(size * 0.2),
      },
    };
  });
});

// 食物：web 画的是圆心在格心、半径 cell*0.36 的圆（即直径 cell*0.72）
const foodStyle = computed(() => {
  if (!food.value) return null;
  const cell = cellRpx.value;
  const d = cell * 0.72;
  return {
    left: rpx((food.value[1] + 0.5) * cell),
    top: rpx((food.value[0] + 0.5) * cell),
    width: rpx(d),
    height: rpx(d),
    marginLeft: rpx(-d / 2),
    marginTop: rpx(-d / 2),
  };
});

function initDifficulty() {
  const saved = +(getRaw(DIFFICULTY_KEY) || 1);
  return saved >= MIN_DIFFICULTY && saved <= MAX_DIFFICULTY ? saved : 1;
}

// 改难度：立即以新速度重启定时器（游戏进行中才需要）
watch(difficulty, val => {
  setRaw(DIFFICULTY_KEY, String(val));
  if (timer && !paused.value && gameResult.value === GAMING) {
    stopTimer();
    timer = setInterval(tick, moveInterval.value);
  }
});

// ---------- 视口 → 棋盘尺寸 ----------
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

function computeBoardSize() {
  const { w, h } = readViewport();
  const pxToRpx = 750 / w;
  const byH = h * pxToRpx - PAGE_FIXED_H - FAB_RESERVE;
  boardSize.value = Math.round(Math.max(BOARD_MIN, Math.min(BOARD_MAX, byH)));
}

// ---------- 存档 ----------
function saveState() {
  // 进行中与「已失败」两种局面都要落档：失败也存下来，退出重进才是同一个失败状态，
  // 由玩家自己点「新游戏」，而不是一进来就自动重开
  if (!started.value || !food.value) return;
  if (gameResult.value !== GAMING && gameResult.value !== LOSE) return;
  setJSON(STATE_KEY, {
    snake: snake.value,
    dir: dir.value,
    nextDir: nextDir.value,
    food: food.value,
    score: score.value,
    difficulty: difficulty.value,
    result: gameResult.value === LOSE ? 'lose' : 'gaming',
    newBest: newBest.value,
  });
}

// 恢复存档：盘面照旧渲染但保持暂停，等玩家点「继续」
function restore() {
  try {
    const saved = getJSON(STATE_KEY);
    if (!saved || !Array.isArray(saved.snake) || !saved.snake.length
      || !Array.isArray(saved.food) || saved.food.length !== 2) return false;
    const d = +saved.difficulty;
    if (d < MIN_DIFFICULTY || d > MAX_DIFFICULTY) return false;
    difficulty.value = d;
    snake.value = saved.snake;
    dir.value = saved.dir || [0, 1];
    nextDir.value = saved.nextDir || dir.value;
    food.value = saved.food;
    score.value = +saved.score || 0;
    newBest.value = !!saved.newBest;
    started.value = true;
    // 失败局面：还原成「已结束」的静止画面（不进暂停态、不起倒数），等玩家点「新游戏」；
    // 这里**不播** playLose：失败音只在真正撞死那一刻响，重进恢复是静音的
    if (saved.result === 'lose') {
      gameResult.value = LOSE;
      paused.value = false;
      stopTimer();
      return true;
    }
    gameResult.value = GAMING;
    paused.value = true;
    return true;
  } catch {
    return false;
  }
}

// ---------- 开局 / 暂停 ----------
function initGame() {
  cancelResume();
  setRaw(STATE_KEY, '');            // 空串在 core/storage 里读出来就是 null，等同 web 的 removeItem
  snake.value = [[10, 10], [10, 9], [10, 8]];
  dir.value = [0, 1];
  nextDir.value = [0, 1];
  score.value = 0;
  gameResult.value = GAMING;
  newBest.value = false;
  started.value = true;
  paused.value = false;
  spawnFood();
  stopTimer();
  timer = setInterval(tick, moveInterval.value);
}

// 暂停：立即冻结（并把局面落档，切后台后被关掉也接得上）。
// 继续：先数 3 2 1 再真正恢复 —— 倒数期间 paused 仍是 true，tick 照旧直接返回
function togglePause() {
  if (gameResult.value === LOSE || !started.value) return;
  if (paused.value) {
    if (!resumeCount.value) beginResume();
    return;
  }
  paused.value = true;
  cancelResume();
  stopTimer();
  saveState();
}

// 倒数结束：真正恢复
function onResume() {
  paused.value = false;
  stopTimer();
  timer = setInterval(tick, moveInterval.value);
}

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

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

function spawnFood() {
  const occupied = new Set(snake.value.map(([r, c]) => `${r},${c}`));
  const cells = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (!occupied.has(`${r},${c}`)) cells.push([r, c]);
    }
  }
  // 铺满整盘（理论上的极端情况）时没有空格可放，就不再生成
  food.value = cells.length ? cells[~~(Math.random() * cells.length)] : null;
}

function tick() {
  if (paused.value || gameResult.value !== GAMING) return;
  dir.value = nextDir.value;
  const head = [snake.value[0][0] + dir.value[0], snake.value[0][1] + dir.value[1]];
  // 穿墙模式：越界的头从对面钻出
  if (throughWall.value) {
    head[0] = (head[0] + GRID) % GRID;
    head[1] = (head[1] + GRID) % GRID;
  }
  // 撞墙（非穿墙模式）或撞身体
  if (head[0] < 0 || head[0] >= GRID || head[1] < 0 || head[1] >= GRID
    || snake.value.some(([r, c]) => r === head[0] && c === head[1])) {
    gameResult.value = LOSE;
    playLose();
    stopTimer();
    saveState();          // 失败也落档（见 saveState 的注释）
    return;
  }
  snake.value.unshift(head);
  if (food.value && head[0] === food.value[0] && head[1] === food.value[1]) {
    score.value += SCORE_PER_FOOD[difficulty.value - 1];
    playElimination();   // 吃到一个食物（与其它游戏的「消除一次」同一个音）
    // 一超过历史最佳就实时更新并持久化
    if (score.value > bestScore.value) {
      bestScore.value = score.value;
      setRaw(BEST_KEY, String(score.value));
      newBest.value = true;
    }
    spawnFood();
  } else {
    snake.value.pop();
  }
}

function turn(d) {
  // 不能 180 度掉头
  if (d[0] === -dir.value[0] && d[1] === -dir.value[1]) return;
  nextDir.value = d;
}

function changeDifficulty(delta) {
  const next = difficulty.value + delta;
  if (next < MIN_DIFFICULTY || next > MAX_DIFFICULTY) return;
  difficulty.value = next;
}

// ---------- 滑动转向（小程序没有 Pointer Events，用 touch；阈值与 web 一样 20px） ----------
let dragStartX = 0;
let dragStartY = 0;
let dragging = false;

function touchPoint(e, changed) {
  const list = changed ? e.changedTouches : e.touches;
  const t = (list && list[0]) || (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
  if (!t) return null;
  return { x: t.clientX != null ? t.clientX : t.pageX, y: t.clientY != null ? t.clientY : t.pageY };
}

function onTouchStart(e) {
  const p = touchPoint(e, false);
  if (!p) return;
  dragging = true;
  dragStartX = p.x;
  dragStartY = p.y;
}

function onTouchEnd(e) {
  if (!dragging) return;
  dragging = false;
  const p = touchPoint(e, true);
  if (!p) return;
  const dx = p.x - dragStartX;
  const dy = p.y - dragStartY;
  if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
  if (Math.abs(dx) > Math.abs(dy)) turn([0, dx > 0 ? 1 : -1]);
  else turn([dy > 0 ? 1 : -1, 0]);
}

function onTouchCancel() {
  dragging = false;
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
function showHelp() {
  helpOpen.value = true;
}

// ---------- 生命周期 ----------
function onResize() {
  computeBoardSize();
}

onMounted(() => {
  computeBoardSize();
  if (typeof uni.onWindowResize === 'function') uni.onWindowResize(onResize);
  if (!restore()) initGame();
});

// 切后台（离开游戏界面）时自动暂停并存档，回来自己点「继续」；顺带停掉定时器，不让它在后台跑
onHide(() => {
  if (started.value && gameResult.value === GAMING && !paused.value) togglePause();
  stopTimer();
  cancelResume();
});

// 退出时保存进行中的局面（已结束或未开始的不存）
onUnmounted(() => {
  if (typeof uni.offWindowResize === 'function') uni.offWindowResize(onResize);
  stopTimer();
  cancelResume();
  saveState();
});
</script>

<style lang="scss" scoped>
/* web 的 resume-pop 逐条搬过来。两个同内容的名字是为了让 3→2→1 每一跳都重播动画
   （animation-name 不变的话，只改文字不会重新触发动画；小程序里给单个节点写 :key 不可靠） */
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

/* 一页只允许一处 min-height: 100vh（就在 .screen 上） */
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

/* ---------- 分数区（web 的 --row-height: 72px = 138rpx） ---------- */
.score-area {
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
.divider {
  width: 2rpx;
  height: 46rpx;
  align-self: center;
  background: #e1e1e1;
  opacity: 0.6;
}

/* ---------- 操作区：难度 3 / 新游戏 3.5 / 暂停 3.5 ---------- */
.opt-area {
  width: 690rpx;
  height: 138rpx;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}
.difficulty-wrapper,
.start-wrapper {
  flex: 3.5;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
}
.difficulty-wrapper { flex: 3; }
.difficulty-value {
  min-width: 42rpx;            /* web 的 22px：数字位数变化时 +/- 不左右挪 */
  text-align: center;
  font-size: 27rpx;
  color: #5f6b7a;
  font-weight: 400;
}
/* web 的 .opt-icon：28px 小方块 + 1px 边框 + 8px 圆角 + 15px 图标 */
.opt-icon {
  position: relative;
  width: 53rpx;
  height: 53rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2rpx solid #e1e1e1;
  border-radius: 15rpx;
  background: #fff;
  color: #2c3e50;
  font-size: 29rpx;            /* 图标 = 1.2em */
}
/* 视觉上仍是 28px 小方块，点击热区扩到 ~44×44（不占布局） */
.opt-icon::after {
  content: '';
  position: absolute;
  left: -15rpx;
  right: -15rpx;
  top: -15rpx;
  bottom: -15rpx;
}
.opt-icon.disable { color: #e1e1e1; }
.opt-ico { pointer-events: none; }

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

/* ---------- 游戏区（web 的 canvas：卡片宽的正方形 + 卡片圆角 + 卡片阴影） ---------- */
.game-area {
  position: relative;
  border-radius: 27rpx;
}
.board {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 27rpx;
  box-shadow: 0 4rpx 23rpx rgba(0, 0, 0, 0.08);
  background-color: #e2e7eb;
  /* 两层 45° 渐变拼棋盘：尺寸/位移由 boardStyle 按 cell 注入（棋盘会随屏高变）。
     下面这两行是满尺寸（690rpx / 20 格 → 34.5rpx）的兜底：万一某个端不认行内的多值写法，
     棋盘格仍然是正的，只是矮屏上格子尺度跟蛇身略有偏差。 */
  background-size: 69rpx 69rpx;
  background-position: 0 0, 34.5rpx 34.5rpx;
  background-image:
    linear-gradient(45deg, #e8ecef 25%, transparent 25%, transparent 75%, #e8ecef 75%, #e8ecef),
    linear-gradient(45deg, #e8ecef 25%, transparent 25%, transparent 75%, #e8ecef 75%, #e8ecef);
}
.seg { position: absolute; }
.food {
  position: absolute;
  border-radius: 50%;
  background: #e05d4b;
}

/* 暂停遮罩：与游戏区矩形完全重合 */
.pause-mask {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
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

/* 失败遮罩：同样与游戏区完全重合 */
.lose {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  border-radius: 27rpx;
  background: rgba(255, 255, 255, 0.8);
  color: #b11;
  font-weight: bold;
  font-size: 34rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 11rpx;
}
</style>
