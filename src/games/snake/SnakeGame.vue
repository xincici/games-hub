<template>
  <div class="wrapper" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
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
import { throughWall, toggle as toggleWall } from './wall';

const GRID = 20;                 // 20x20 格
const [GAMING, LOSE] = [0, 1];
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 5;
const DIFFICULTY_KEY = '__snake_game__difficulty';
const BEST_KEY = '__snake_game__best';
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
  initGame();
  window.addEventListener('keyup', onKeyUp);
});

onUnmounted(() => {
  stopTimer();
  window.removeEventListener('keyup', onKeyUp);
});

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

function initGame() {
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

function togglePause() {
  if (gameResult.value === LOSE || !started.value) return;
  paused.value = !paused.value;
  if (paused.value) stopTimer();
  else timer = setInterval(tick, interval.value);
}

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
    ctx.fillStyle = idx === 0 ? '#2ea464' : `rgba(46, 164, 100, ${Math.max(0.35, 1 - idx * 0.03)})`;
    const pad = cell * 0.08;
    roundRect(ctx, c * cell + pad, r * cell + pad, cell - pad * 2, cell - pad * 2, cell * 0.2);
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

let touchStartX = 0;
let touchStartY = 0;
function onTouchStart(e) {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}
function onTouchEnd(e) {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
  if (Math.abs(dx) > Math.abs(dy)) turn([0, dx > 0 ? 1 : -1]);
  else turn([dy > 0 ? 1 : -1, 0]);
}
</script>

<style scoped lang="scss">
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
    margin-top: 70px;
    display: flex;
    .stat {
      flex: 1;
      padding: 14px 28px;
      display: flex;
      flex-direction: column;
      align-items: center;
      .stat-label {
        font-size: 12px;
        opacity: 0.6;
      }
      .stat-value {
        font-size: 22px;
        font-weight: bold;
        line-height: 1.3;
      }
    }
  }
  .opt-area {
    margin: 16px 0;
    padding: 12px 0;
    display: flex;
    align-items: center;
    .difficulty-wrapper,
    .start-wrapper {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
    }
    .difficulty-value {
      margin: 0 8px;
      font-weight: bold;
    }
  }
  .opt-icon {
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border-color);
    padding: 2px;
    width: 28px;
    height: 28px;
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
    padding: 8px 16px;
    font-size: 14px;
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
