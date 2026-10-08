<template>
  <div class="wrapper" @pointerdown="onPointerDown" @pointerup="onPointerUp" @pointercancel="onPointerUp">
    <TopHeader @onScoreReset="bestScore = 0">
      <span class="item-wrapper" @click="toggleWall">
        <i i-mdi-wall-fire v-if="throughWall" />
        <i i-mdi-wall v-else />
      </span>
    </TopHeader>
    <div class="card score-area">
      <div class="stat">
        <span class="stat-label">{{ i18n('bestScore') }}</span>
        <span class="stat-value">{{ bestScore }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('score') }}</span>
        <span class="stat-value">{{ score }}</span>
      </div>
    </div>
    <div class="card opt-area">
      <div class="difficulty-wrapper">
        <button @click="changeDifficulty(-1)" class="opt-icon" :class="{disable: difficulty === MIN_DIFFICULTY}">
          <i i-carbon-subtract-alt />
        </button>
        <span class="difficulty-value">{{ difficulty }}</span>
        <button @click="changeDifficulty(1)" class="opt-icon" :class="{disable: difficulty === MAX_DIFFICULTY}">
          <i i-carbon-add-alt />
        </button>
      </div>
      <div class="divider"></div>
      <div class="start-wrapper">
        <button @click="initGame" class="game-icon">{{ i18n('start') }}</button>
      </div>
      <div class="divider"></div>
      <div class="start-wrapper">
        <button @click="togglePause" class="game-icon" :disabled="gameResult === LOSE || !started">
          {{ paused ? i18n('resume') : i18n('pause') }}
        </button>
      </div>
    </div>
    <div class="game-area">
      <canvas ref="canvasRef" :width="canvasSize" :height="canvasSize"></canvas>
      <div v-if="paused && gameResult === GAMING && started" class="pause-mask" @click="togglePause">
        <!-- 点继续后先数 3 / 2 / 1，数完才真正恢复（数的时候仍然冻结） -->
        <span v-if="resumeCount" :key="resumeCount" class="resume-count">{{ resumeCount }}</span>
        <span v-else>⏸️</span>
        <span>{{ resumeCount ? i18n('readyTip') : i18n('resumeTip') }}</span>
      </div>
      <div v-if="gameResult === LOSE" class="lose">
        <span>👻👻 {{ i18n('tipLost') }} 👻👻</span>
        <span v-if="newBest">{{ i18n('newBest') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';

import TopHeader from '@/components/TopHeader.vue';
import { useResumeCountdown } from '@/shared/resumeCountdown';
import { throughWall, toggle as toggleWall } from './wall';

const GRID = 20;                 // 20x20 格
const [GAMING, LOSE] = [0, 1];
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 5;
const DIFFICULTY_KEY = '__snake_game__difficulty';
const BEST_KEY = '__snake_game__best';
const STATE_KEY = '__snake_game__state';
// 难度 → 移动间隔 ms（难度越高越快）与每食得分
const SPEEDS = [400, 320, 250, 190, 140];
const SCORE_PER_FOOD = [1, 2, 3, 4, 6];

const canvasRef = ref(null);
const score = ref(0);
const gameResult = ref(GAMING);
const newBest = ref(false);
const started = ref(false);
const paused = ref(false);

function initDifficulty() {
  const saved = +(localStorage.getItem(DIFFICULTY_KEY) || 1);
  return saved >= MIN_DIFFICULTY && saved <= MAX_DIFFICULTY ? saved : 1;
}
const difficulty = ref(initDifficulty());
const bestScore = ref(+(localStorage.getItem(BEST_KEY) || 0));

const interval = computed(() => SPEEDS[difficulty.value - 1]);
const canvasSize = 400;

let snake = [];
let dir = [0, 1];
let nextDir = [0, 1];
let food = null;
let timer = null;
let ctx = null;

watch(difficulty, val => {
  localStorage.setItem(DIFFICULTY_KEY, val);
  // 游戏进行中改难度：立即以新速度重启定时器
  if (timer && !paused.value && gameResult.value === GAMING) {
    stopTimer();
    timer = setInterval(tick, interval.value);
  }
  draw();
});

onMounted(() => {
  ctx = canvasRef.value.getContext('2d');
  if (!restore()) initGame();
  window.addEventListener('keyup', onKeyUp);
  document.addEventListener('visibilitychange', onVisibility);
});

// 退出时保存进行中的局面（已结束或未开始的不存）
onUnmounted(() => {
  stopTimer();
  cancelResume();
  saveState();
  window.removeEventListener('keyup', onKeyUp);
  document.removeEventListener('visibilitychange', onVisibility);
});

function saveState() {
  // 进行中与「已失败」两种局面都要落档：失败也存下来，退出重进才是同一个失败状态，
  // 由玩家自己点「新游戏」，而不是一进来就自动重开
  if (!started.value || !food) return;
  if (gameResult.value !== GAMING && gameResult.value !== LOSE) return;
  localStorage.setItem(STATE_KEY, JSON.stringify({
    snake, dir, nextDir, food,
    score: score.value,
    difficulty: difficulty.value,
    result: gameResult.value === LOSE ? 'lose' : 'gaming',
    newBest: newBest.value,
  }));
}

// 恢复存档：盘面照旧渲染但保持暂停，等玩家点「继续」
function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY));
    if (!saved || !Array.isArray(saved.snake) || !saved.snake.length
      || !Array.isArray(saved.food) || saved.food.length !== 2) return false;
    const d = +saved.difficulty;
    if (d < MIN_DIFFICULTY || d > MAX_DIFFICULTY) return false;
    difficulty.value = d;
    snake = saved.snake;
    dir = saved.dir || [0, 1];
    nextDir = saved.nextDir || dir;
    food = saved.food;
    score.value = +saved.score || 0;
    newBest.value = !!saved.newBest;
    started.value = true;
    // 失败局面：还原成「已结束」的静止画面（不进暂停态、不起倒数），
    // 等玩家自己点「新游戏」；进行中的局面仍照旧暂停 + 数 3 2 1
    if (saved.result === 'lose') {
      gameResult.value = LOSE;
      paused.value = false;
      stopTimer();
      draw();
      return true;
    }
    gameResult.value = GAMING;
    paused.value = true;
    draw();
    return true;
  } catch {
    return false;
  }
}

function onKeyUp(e) {
  const keyMap = {
    ArrowUp: [-1, 0], w: [-1, 0], W: [-1, 0],
    ArrowDown: [1, 0], s: [1, 0], S: [1, 0],
    ArrowLeft: [0, -1], a: [0, -1], A: [0, -1],
    ArrowRight: [0, 1], d: [0, 1], D: [0, 1],
  };
  const d = keyMap[e.key];
  if (!d) return;
  e.preventDefault();
  turn(d);
}

function turn(d) {
  // 不能 180 度掉头
  if (d[0] === -dir[0] && d[1] === -dir[1]) return;
  nextDir = d;
}

// 切后台（离开游戏界面）时自动暂停，回来自己点「继续」
function onVisibility() {
  if (document.hidden && started.value && gameResult.value === GAMING && !paused.value) togglePause();
}

function initGame() {
  cancelResume();
  localStorage.removeItem(STATE_KEY);
  snake = [[10, 10], [10, 9], [10, 8]];
  dir = nextDir = [0, 1];
  score.value = 0;
  gameResult.value = GAMING;
  newBest.value = false;
  started.value = true;
  paused.value = false;
  spawnFood();
  stopTimer();
  timer = setInterval(tick, interval.value);
  draw();
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
  timer = setInterval(tick, interval.value);
}

const { count: resumeCount, begin: beginResume, cancel: cancelResume } = useResumeCountdown(onResume);

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

function spawnFood() {
  const occupied = new Set(snake.map(([r, c]) => `${r},${c}`));
  const cells = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (!occupied.has(`${r},${c}`)) cells.push([r, c]);
    }
  }
  food = cells[~~(Math.random() * cells.length)];
}

function tick() {
  if (paused.value || gameResult.value !== GAMING) return;
  dir = nextDir;
  const head = [snake[0][0] + dir[0], snake[0][1] + dir[1]];
  // 穿墙模式：越界的头从对面钻出
  if (throughWall.value) {
    head[0] = (head[0] + GRID) % GRID;
    head[1] = (head[1] + GRID) % GRID;
  }
  // 撞墙（非穿墙模式）或撞身体
  if (head[0] < 0 || head[0] >= GRID || head[1] < 0 || head[1] >= GRID
    || snake.some(([r, c]) => r === head[0] && c === head[1])) {
    gameResult.value = LOSE;
    stopTimer();
    saveState();          // 失败也落档（见 saveState 的注释）
    draw();
    return;
  }
  snake.unshift(head);
  if (head[0] === food[0] && head[1] === food[1]) {
    score.value += SCORE_PER_FOOD[difficulty.value - 1];
    // 一超过历史最佳就实时更新并持久化
    if (score.value > bestScore.value) {
      bestScore.value = score.value;
      localStorage.setItem(BEST_KEY, score.value);
      newBest.value = true;
    }
    spawnFood();
  } else {
    snake.pop();
  }
  draw();
}

function draw() {
  if (!ctx) return;
  const cell = canvasSize / GRID;
  const dark = document.body.classList.contains('dark');
  ctx.clearRect(0, 0, canvasSize, canvasSize);
  // 棋盘（棋盘格微差色便于辨识）
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      ctx.fillStyle = (r + c) % 2
        ? (dark ? '#3f3f3f' : '#e8ecef')
        : (dark ? '#383838' : '#e2e7eb');
      ctx.fillRect(c * cell, r * cell, cell, cell);
    }
  }
  // 食物
  if (food) {
    ctx.fillStyle = '#e05d4b';
    ctx.beginPath();
    ctx.arc((food[1] + 0.5) * cell, (food[0] + 0.5) * cell, cell * 0.36, 0, Math.PI * 2);
    ctx.fill();
  }
  // 蛇身
  snake.forEach(([r, c], idx) => {
    const pad = cell * 0.08;
    const x = c * cell + pad;
    const y = r * cell + pad;
    const size = cell - pad * 2;
    if (idx === 0) {
      // 蛇头：朝前进方向的一侧用大圆角，呈圆头；其余角小圆角与身体衔接
      ctx.fillStyle = '#2ea464';
      const big = size * 0.5;
      const small = size * 0.18;
      let radii;
      if (dir[1] === 1) radii = [small, big, big, small];       // 右
      else if (dir[1] === -1) radii = [big, small, small, big];  // 左
      else if (dir[0] === 1) radii = [small, small, big, big];   // 下
      else radii = [big, big, small, small];                     // 上
      roundRect(ctx, x, y, size, size, radii);
    } else {
      ctx.fillStyle = `rgba(46, 164, 100, ${Math.max(0.35, 1 - idx * 0.03)})`;
      roundRect(ctx, x, y, size, size, size * 0.2);
    }
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function changeDifficulty(delta) {
  const next = difficulty.value + delta;
  if (next < MIN_DIFFICULTY || next > MAX_DIFFICULTY) return;
  difficulty.value = next;
}

// 转向的滑动走 **Pointer Events**：鼠标 / 触摸 / 笔一套事件。原来只监听 touch 事件，
// 于是 PC 上拿鼠标怎么拖都不转向（只有方向键能用）
let dragStartX = 0;
let dragStartY = 0;
let dragId = -1;
function onPointerDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;   // 右键 / 中键不参与
  dragId = e.pointerId;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
}
function onPointerUp(e) {
  if (e.pointerId !== dragId) return;
  dragId = -1;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
  if (Math.abs(dx) > Math.abs(dy)) turn([0, dx > 0 ? 1 : -1]);
  else turn([dy > 0 ? 1 : -1, 0]);
}
</script>

<style scoped lang="scss">

@keyframes resume-pop {
  0% { transform: scale(0.4); opacity: 0; }
  35% { transform: scale(1.12); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

.wrapper {
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  box-sizing: border-box;
  background: var(--bg-color);
  color: var(--text-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  // 转向手势归本页所有：没有这条，浏览器（尤其装成桌面应用后）会把滑动当成滚页面 /
  // 拖窗口收走，中途补一个 pointercancel，蛇就不转向了（此页纵向不溢出，整页加安全）
  touch-action: none;
  button {
    touch-action: manipulation;
  }
  .card {
    width: calc(100% - 32px);
    max-width: 440px;
    box-sizing: border-box;
    background: var(--card-bg-color);
    border-radius: var(--card-radius);
    box-shadow: var(--card-shadow);
  }
  .divider {
    width: 1px;
    height: 24px;
    align-self: center;
    background: var(--border-color);
    opacity: 0.6;
  }
  .score-area {
    margin-top: 64px;
    display: flex;
    align-items: center;
    height: var(--row-height);
    .stat {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      .stat-label {
        font-size: 12px;
        color: var(--muted-color);
      }
      .stat-value {
        font-size: 22px;
        font-weight: bold;
        line-height: 1.3;
      }
    }
  }
  .opt-area {
    margin: var(--row-gap) 0;
    height: var(--row-height);
    display: flex;
    align-items: center;
    // 难度区:两个按钮区 = 3:3.5:3.5
    .difficulty-wrapper,
    .start-wrapper {
      flex: 3.5;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
    }
    .difficulty-wrapper {
      flex: 3;
    }
    .difficulty-value {
      margin: 0;   // 间距统一交给上面的 gap: 4px
      // 与点击游戏 .difficulty-num 一致：预留 22px，数字位数变化时 +/- 按钮不会左右挪
      min-width: 22px;
      text-align: center;
      font-size: 14px;
      color: var(--muted-color);
      font-weight: 400;
    }
  }
  .opt-icon {
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border-color);
    padding: 2px;
    position: relative;
    width: 28px;
    height: 28px;
    // 视觉上仍是 28px 小方块，用伪元素把点击热区扩到 44×44（不占布局）
    &::after {
      content: "";
      position: absolute;
      inset: -8px;
    }
    color: var(--text-color);
    font-size: 15px;
    border-radius: 8px;
    background: var(--card-bg-color);
    &.disable {
      color: var(--border-color);
      cursor: not-allowed;
    }
  }
  .game-icon {
    cursor: pointer;
    padding: 8px 12px;
    font-size: 13px;
    font-weight: bold;
    background: var(--primary-bg);
    color: #fff;
    border: 0 none;
    border-radius: 8px;
    &:disabled {
      background-color: #aaa;
      cursor: not-allowed;
    }
  }
  .game-area {
    position: relative;
    width: calc(100% - 32px);
    max-width: 440px;
    canvas {
      width: 100%;
      border-radius: var(--card-radius);
      box-shadow: var(--card-shadow);
      display: block;
    }
  }
  .pause-mask {
    position: absolute;
    width: 100%;
    height: 100%;
    left: 0;
    top: 0;
    border-radius: var(--card-radius);
    background: var(--mask-color);
    color: var(--text-color);
    font-weight: bold;
    font-size: 17px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    cursor: pointer;
    span:first-child {
      font-size: 34px;
    }
    // 继续前的大号倒数数字（span. 前缀是为了压过上面的 span:first-child）
    span.resume-count {
      font-size: 72px;
      line-height: 1;
      color: var(--primary-bg);
      font-variant-numeric: tabular-nums;
      animation: resume-pop 0.8s ease;
    }
  }
  .lose {
    position: absolute;
    width: 100%;
    height: 100%;
    left: 0;
    top: 0;
    border-radius: var(--card-radius);
    background: var(--mask-color);
    color: var(--lose-color);
    font-weight: bold;
    font-size: 18px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
}
</style>
