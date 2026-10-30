<template>
  <view class="screen">
    <!-- 全站背景（粒子连线 + 底部过山车，与 web 的 ParticleBackground 同款） -->
    <ParticleBackground />
    <view class="page">
      <!-- 操作区（web 的 opt-area）：计时 | 新游戏，中间一条竖分隔线 -->
      <view class="card opt-area">
        <view class="opt-half">
          <view class="timer">
            <view class="timer-ico i-carbon-timer" />
            <text class="timer-num">{{ timeStr }}</text>
          </view>
        </view>
        <view class="divider" />
        <view class="opt-half">
          <button class="game-icon" @click="initGame">{{ tt('start') }}</button>
        </view>
      </view>

      <!-- 游戏区（web 的 game-area）：历史行 + 当前输入行；胜利/失败遮罩正好盖住这张卡 -->
      <view class="card game-area">
        <view v-for="(oneGuess, idx) in guessHistory" :key="idx" class="answer-line">
          <view v-for="(number, index) in oneGuess.nums" :key="index" class="number-card">
            <text>{{ number }}</text>
          </view>
          <view class="result-tip"><text>{{ oneGuess.res }}</text></view>
        </view>

        <view v-if="gameResult === GAMING" class="answer-line">
          <view
            v-for="n in GAME_SIZE"
            :key="n"
            class="number-card"
            :class="{ 'current-input': n - 1 === currentGuess.length }"
          >
            <text>{{ cellText(n - 1) }}</text>
            <view v-if="n - 1 === currentGuess.length" class="caret" />
          </view>
          <view class="result-tip"><text>_A_B</text></view>
        </view>

        <view v-if="gameResult === WIN" class="win">
          <text>🎉🎉 {{ tt('tipWin') }} 🎉🎉</text>
        </view>
        <view v-if="gameResult === LOSE" class="lose">
          <text>👻👻 {{ tt('tipLost') }} 👻👻</text>
          <text>{{ tt('anwserIs') + anwser }}</text>
        </view>
      </view>

      <!-- 数字键盘：照 web 的 input-area 搬成 view 按钮（小程序不用 <input> 弹系统键盘） -->
      <view v-if="gameResult === GAMING" class="input-area">
        <view
          v-for="num in NUMBERS"
          :key="num"
          class="number-button"
          :class="{ disabled: isNumDisabled(num) }"
          :hover-class="isNumDisabled(num) ? 'none' : 'key-hover'"
          @click="addNumber(num)"
        ><text>{{ num }}</text></view>
        <view
          class="number-button opt-button del-button"
          :class="{ disabled: !canDel }"
          :hover-class="canDel ? 'key-dim' : 'none'"
          @click="delNumber"
        ><text>{{ tt('optDel') }}</text></view>
        <view
          class="number-button opt-button enter-button"
          :class="{ disabled: !canEnter }"
          :hover-class="canEnter ? 'key-dim' : 'none'"
          @click="guessOnce"
        ><text>{{ tt('optEnter') }}</text></view>
      </view>
    </view>

    <!-- 胜利彩带：只在真正赢下这一刻放（恢复存档的胜利态不放，与 web 约定一致） -->
    <Confetti v-if="justWon" />

    <!-- 右下角悬浮按钮：机器人（web 顶栏那颗）在上、帮助在下 -->
    <FloatingActions>
      <view class="fab" @click="toggleRobot">
        <view class="fab-ico" :class="robot ? 'i-mdi-robot-outline' : 'i-mdi-robot-off-outline'" />
      </view>
      <view class="fab" @click="showHelp"><view class="fab-ico i-carbon-help" /></view>
    </FloatingActions>
    <HelpSheet :open="helpOpen" :text="helpText" @close="helpOpen = false" />
  </view>
</template>

<script setup>
// 1A2B · 微信小程序版
// 玩法与 web 的 src/games/guess/GuessNumber.vue 完全一致：8 次机会猜 4 位不重复数字，xAxB 提示。
// 平台替换：
// - web 顶栏的机器人开关 → 右下角悬浮按钮（偏好仍存 __guess_number__robot，与 web 同 key）
// - web 固定底部的数字键盘 → 页面流内的自绘 view 键盘（小程序里 <input> 会弹系统键盘、视觉跑偏）
// - web 的 lodash.samplesize → 本地洗牌取前 4 位（分布等价，少一个依赖）
// - 彩带 → components/Confetti.vue（纯 CSS 版）；音效 → core/sfx
import { computed, onMounted, onUnmounted, ref } from 'vue';

import Confetti from '@/components/Confetti.vue';
import FloatingActions from '@/components/FloatingActions.vue';
import HelpSheet from '@/components/HelpSheet.vue';
import { getRaw, setRaw } from '@/core/storage';
import { playLose, playWin } from '@/core/sfx';
import { tt } from './i18n';
import { setNavTitle } from '@/core/i18n';
import ParticleBackground from '@/components/ParticleBackground.vue';

// 原生导航栏标题跟随语言（pages.json 里的标题是静态的）
setNavTitle(() => tt('gameTitle'));

const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8];
const [GAMING, LOSE, WIN] = [0, 1, 2];
const GAME_SIZE = 4; // 永远是 4 位数
const MAX_GUESS = 8; // 最多猜 8 次
const ROBOT_KEY = '__guess_number__robot'; // 与 web 的 src/games/guess/robot.js 完全一致
const FIRST_GUESS_DURATION = 200;

// 机器人偏好：web 里是「存 1 / 关掉时 removeItem」，这里保持同样的读写语义
const robot = ref(Boolean(getRaw(ROBOT_KEY)));

const anwser = ref('');
const gameResult = ref(GAMING);
const guessHistory = ref([]);
const currentGuess = ref('');
const seconds = ref(0);
// 彩带只在真正赢下的那一刻放：进入页面/恢复时一律是 false
const justWon = ref(false);

let firstGuessTimer = null;
let tickTimer = null;
let wonTimer = null;

const timeStr = computed(() => {
  const sec = seconds.value;
  return ('00' + ~~(sec / 60)).slice(-2) + ':' + ('00' + sec % 60).slice(-2);
});

// 与 web 的 disabled 口径一致：数字用过 / 已满 4 位 / 不在游戏中
const isNumDisabled = (num) =>
  gameResult.value !== GAMING || currentGuess.value.includes(num) || currentGuess.value.length >= GAME_SIZE;
const canDel = computed(() => gameResult.value === GAMING && currentGuess.value.length > 0);
const canEnter = computed(() => gameResult.value === GAMING && currentGuess.value.length === GAME_SIZE);

// 空格子用两个不换行空格占位（web 写的是 '&nbsp;&nbsp;'），否则空卡只剩 padding、高度会塌
const cellText = (i) => currentGuess.value[i] || '\u00a0\u00a0';

function pickAnswer() {
  const pool = NUMBERS.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, GAME_SIZE).join('');
}

// ---------- 计时（web 用 shared/CountTimer.vue：挂载即走、resetGame 归零） ----------
function stopTick() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
}
function startTick() {
  stopTick();
  tickTimer = setInterval(() => {
    seconds.value += 1;
  }, 1000);
}
function resetTick() {
  stopTick();
  seconds.value = 0;
  startTick();
}

// ---------- 局面 ----------
function initGame() {
  if (firstGuessTimer) {
    clearTimeout(firstGuessTimer);
    firstGuessTimer = null;
  }
  clearTimeout(wonTimer);
  wonTimer = null;
  justWon.value = false;

  anwser.value = pickAnswer();
  guessHistory.value = [];
  currentGuess.value = '';
  gameResult.value = GAMING;
  resetTick();
  if (robot.value) initWithFirstGuess(1);
}

// 机器人：开局每 200ms 自动填一位，填满 4 位自动提交（与 web 逐字一致，只作用于第一猜）
function initWithFirstGuess(num) {
  firstGuessTimer = setTimeout(() => {
    currentGuess.value += String(num);
    if (currentGuess.value.length === GAME_SIZE) {
      firstGuessTimer = null;
      guessOnce();
      return;
    }
    initWithFirstGuess(num + 1);
  }, FIRST_GUESS_DURATION);
}

function addNumber(num) {
  if (firstGuessTimer) return;
  if (gameResult.value !== GAMING) return;
  if (currentGuess.value.includes(num)) return;
  if (currentGuess.value.length >= GAME_SIZE) return;
  currentGuess.value += num;
}

function delNumber() {
  if (firstGuessTimer) return;
  if (gameResult.value !== GAMING) return;
  if (currentGuess.value.length === 0) return;
  currentGuess.value = currentGuess.value.slice(0, -1);
}

function guessOnce() {
  if (gameResult.value !== GAMING) return;
  if (currentGuess.value.length !== GAME_SIZE) return;

  let [A, B] = [0, 0];
  for (let i = 0; i < GAME_SIZE; i++) {
    const one = currentGuess.value[i];
    const idx = anwser.value.indexOf(one);
    if (idx === i) A++;
    else if (idx >= 0) B++;
  }
  // 用新数组替换（小程序端对数组 push 的依赖追踪不如整体替换稳）
  guessHistory.value = [
    ...guessHistory.value,
    { nums: currentGuess.value.split('').map((v) => +v), res: `${A}A${B}B` },
  ];

  if (A === GAME_SIZE) {
    currentGuess.value = '';
    winGame();
    return;
  }
  if (guessHistory.value.length >= MAX_GUESS) {
    currentGuess.value = '';
    gameResult.value = LOSE;
    stopTick();
    playLose();
    return;
  }
  currentGuess.value = '';
}

// 真正赢下：停表 + 胜利音效 + 彩带（justWon 只在这一次置 true，4 秒后复位）
function winGame() {
  gameResult.value = WIN;
  stopTick();
  playWin();
  justWon.value = true;
  clearTimeout(wonTimer);
  wonTimer = setTimeout(() => {
    justWon.value = false;
  }, 4000);
}

function toggleRobot() {
  robot.value = !robot.value;
  // 与 web 的 robot.js 同语义：开着写 '1'，关掉后 key 读到空（web 是 removeItem；
  // 这里走 core/storage 写空串，getRaw 把空串归一成 null，读出来同样是 false）
  setRaw(ROBOT_KEY, robot.value ? '1' : '');
}

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

onMounted(() => {
  initGame();
});

onUnmounted(() => {
  if (firstGuessTimer) clearTimeout(firstGuessTimer);
  clearTimeout(wonTimer);
  stopTick();
});
</script>

<style lang="scss" scoped>
/* 一页只允许一处 min-height: 100vh（就在 .screen 上） */
.screen {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: transparent;  /* 背景交给 ParticleBackground（canvas 自己铺底色） */
}
.page {
  --kb-h: 600rpx;          /* 键盘高度 + 下沿偏移（页面底部内边距用它） */
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 36rpx;
  /* 底部留出吸底键盘的高度 + 悬浮按钮让位，内容不会被挡住 */
  padding: 36rpx 24rpx calc(var(--kb-h, 600rpx) + 24rpx);
  background: #f0f2f5;
  color: #2c3e50;
}

/* ---------- 操作区（web --row-height: 72px；mp 全局 .opt-area 统一 120rpx） ---------- */
.opt-area {
  display: flex;
  align-items: stretch;
}
.opt-half {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.divider {
  width: 2rpx;
  height: 46rpx;
  align-self: center;
  background: #e1e1e1;
  opacity: 0.6;
}
/* web 的 CountTimer：14px / 600 / gap 6px */
.timer {
  display: flex;
  align-items: center;
  gap: 11rpx;
  font-size: 27rpx;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: #2c3e50;
}
/* web 的 .game-icon：min-width 125px / padding 8px 16px / 14px 粗体 / 主色底 */
.game-icon {
  min-width: 239rpx;
  margin: 0;
  padding: 15rpx 31rpx;
  line-height: 1.4;
  font-size: 27rpx;
  font-weight: bold;
  color: #fff;
  text-align: center;
  background: #23804e;
  border: 0 none;
  border-radius: 15rpx;
}

/* ---------- 游戏区（web padding 16px 12px） ---------- */
.game-area {
  position: relative;
  overflow: hidden;
  padding: 31rpx 23rpx;
}
.answer-line {
  margin: 11rpx 0;
  text-align: center;          /* 猜测答案整行居中 */
}
.number-card {
  position: relative;
  display: inline-block;
  padding: 15rpx 34rpx;
  margin: 2rpx 6rpx;
  font-size: 31rpx;
  font-weight: bold;
  line-height: 1.2;
  color: #2c3e50;
  text-align: center;
  background: #eef0f4;
  border-radius: 15rpx;
}
.result-tip {
  display: inline-block;
  width: 153rpx;
  padding: 15rpx 0;
  margin: 2rpx 6rpx;
  font-size: 31rpx;
  font-weight: bold;
  line-height: 1.2;
  color: #2c3e50;
  text-align: center;
  vertical-align: bottom;
  background: #dfe3ea;
  border-radius: 15rpx;
}
/* 当前输入格的下划线（web 的 .current-input:after） */
.caret {
  position: absolute;
  left: 30%;
  bottom: 20%;
  width: 40%;
  height: 4rpx;
  background: rgba(140, 140, 140, 0.6);
}
/* 胜负遮罩：盖住整张 game-area（与 web 的 .win / .lose 同款） */
.win,
.lose {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 34rpx;
  font-weight: bold;
  line-height: 1.5;
  text-align: center;
  color: #12833f;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 27rpx;
}
.lose {
  color: #b11;
}

/* ---------- 数字键盘（web 的 input-area 固定底部 + 4 列数字 + 退格/提交） ---------- */
.input-area {
  /* 键盘不再贴屏幕底：下沿正好落在帮助按钮上方（按钮 84rpx + 底距 16rpx = 100rpx，取 108rpx）；
     页面底部留 --kb-h 的内边距，内容不会被挡。 */
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(108rpx + env(safe-area-inset-bottom));
  z-index: 20;
  box-sizing: border-box;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  padding: 23rpx;               /* 四边等距（原来底部 280rpx 是给悬浮按钮让位的空白，已改到 bottom） */
  background: #fff;
  border-radius: 27rpx;         /* 不再贴屏幕边，四角都圆 */
  box-shadow: 0 -8rpx 38rpx rgba(0, 0, 0, 0.08);
}
.number-button {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 calc(25% - 16rpx);
  height: 92rpx;
  margin: 8rpx;
  font-size: 34rpx;
  font-weight: 600;
  color: #2c3e50;
  background: #eef0f4;
  border-radius: 15rpx;
  transition: background 0.15s ease;
}
/* 按压缩放反馈：web 是 :active 改底色（数字）/ 改透明度（退格、提交） */
.key-hover {
  background: #dfe3ea;
}
.key-dim {
  opacity: 0.8;
}
.number-button.disabled {
  opacity: 0.35;
}
.number-button.opt-button {
  flex-grow: 1;
  flex-basis: calc(50% - 16rpx);
}
.number-button.enter-button {
  background: #e5f6ec;
  color: #157a45;
}
.number-button.del-button {
  background: #fdeeee;
  color: #b8433d;
}
</style>
