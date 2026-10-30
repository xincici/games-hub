<template>
  <view class="screen">
    <!-- 全站背景（粒子连线 + 底部过山车，与 web 的 ParticleBackground 同款） -->
    <ParticleBackground />
    <view class="page">
      <!-- 牌型倍数区（web 的 RuleArea）：8 个牌型两列；中牌型时整块盖一层「牌型 + 倍数 + 烟花」 -->
      <view class="card rule-area uptop1">
        <view
          v-for="(item, i) in rulesList"
          :key="item.key"
          class="rule"
          :class="i % 2 === 0 ? 'rule-odd' : 'rule-even'"
        >
          <text class="rule-name">{{ tt(item.key) }}</text>
          <text class="rule-times">{{ item.times }} {{ tt('times') }}</text>
        </view>
        <!-- 中牌型遮罩：与 web 的 .win-mask 一致（金色大字 + 5 组烟花） -->
        <view v-if="winRule" class="win-mask">
          <text class="win-title">{{ tt(winRule.key) }}</text>
          <text class="win-times">{{ winRule.times }} {{ tt('times') }}</text>
          <view
            v-for="(burst, bi) in BURSTS"
            :key="'b' + bi"
            class="firework"
            :style="{ left: burst.left, top: burst.top, '--burst-delay': burst.delay }"
          >
            <view
              v-for="(p, pi) in burst.particles"
              :key="'p' + bi + '-' + pi"
              class="particle"
              :style="{ '--dx': p.dx, '--dy': p.dy, '--p-color': p.color, '--p-delay': p.delay }"
            />
          </view>
        </view>
      </view>

      <!-- 金额区：资产 / 奖金 / 下注（±，按住连加连减） -->
      <view class="card money-area uptop2">
        <view class="money-item">
          <text class="title">{{ tt('total') }}</text>
          <text class="money" :class="{ zoom: game.zoomTotal }">{{ game.total }}</text>
        </view>
        <view class="money-divider" />
        <view class="money-item">
          <text class="title">{{ tt('bonus') }}</text>
          <text class="money" :class="{ zoom: game.zoomWin }">{{ game.bonus }}</text>
        </view>
        <view class="money-divider" />
        <view class="money-item money-bet">
          <text class="title">{{ tt('bet') }}</text>
          <view class="bet-line">
            <!-- 与 web 一致：赌注 ± 不能挂 @click（长按松手会补一次 tap，多走一步），只认 touch -->
            <button
              class="btn btn-bet"
              :disabled="bet === MIN_BET || game.stage !== WAIT || game.animating"
              @touchstart.stop="startBetPress(-1)"
              @touchend="stopBetPress"
              @touchcancel="stopBetPress"
            >
              <view class="btn-ico i-carbon-subtract-alt" />
            </button>
            <text class="money">{{ bet }}</text>
            <button
              class="btn btn-bet"
              :disabled="bet === MAX_BET || game.stage !== WAIT || game.animating"
              @touchstart.stop="startBetPress(1)"
              @touchend="stopBetPress"
              @touchcancel="stopBetPress"
            >
              <view class="btn-ico i-carbon-add-alt" />
            </button>
          </view>
        </view>
      </view>

      <!-- 手牌区：5 张；赢了 / 输了 / 猜大小失败时整块蒙一层字（web 的 .result-*） -->
      <view class="card card-area uptop3">
        <CardView
          v-for="(card, idx) in game.cards"
          :key="'c' + idx"
          :num="numOf(card)"
          :type="card[1]"
          :hold="game.holds[idx]"
          :animate="cardAnim[idx]"
          :quick="quickFlip"
          @pick="onCardClick(idx)"
        />
        <view v-if="game.stage === GUESS" class="result-win">🎉🎉 {{ tt('tipWin') }} 🎉🎉</view>
        <view v-if="game.stage === LOSE" class="result-lose">👻👻 {{ tt('tipLost') }} 👻👻</view>
        <view v-if="game.stage === GUESS_LOSE" class="result-guess-lose">😭😭 {{ tt('tipGuessLose') }} 😭😭</view>
      </view>

      <!-- 猜大小区：历史记录横向滚动 + 最右边正在闪烁的那张牌（web 的 .guess-area） -->
      <scroll-view
        v-if="dice"
        class="card guess-area uptop4"
        :class="{ uptop0: manualDice }"
        scroll-x
        :scroll-left="guessScroll"
        scroll-with-animation
      >
        <view class="guess-line">
          <view v-for="(g, idx) in game.guesses" :key="'g' + idx" class="guess-item">
            <CardView mini :num="numOf(g)" :type="g[1]" />
            <text
              class="guess-result"
              :class="g[3] > 0 ? 'guess-win' : g[3] < 0 ? 'guess-lose' : 'guess-tie'"
            >{{ tt(g[2] ? 'big' : 'small') }}</text>
          </view>
          <view class="guess-current">
            <CardView mini :num="numOf(randomCard)" :type="randomCard[1]" />
          </view>
        </view>
      </scroll-view>

      <!-- 操作区：猜大 / 猜小 / 结算 / 重来 / 发牌 / 换牌（web 的 .opt-area，按钮各一色） -->
      <view class="card opt-area uptop5">
        <template v-if="dice && game.stage === GUESS">
          <button class="btn btn-big" @click="guessBigOrSmall(true)">{{ tt('big') }}</button>
          <button class="btn btn-small" @click="guessBigOrSmall(false)">{{ tt('small') }}</button>
        </template>
        <button
          v-if="game.stage >= LOSE"
          class="btn btn-settle"
          :disabled="game.animating"
          @click="onResetClick"
        >{{ game.stage === GUESS ? tt('settle') : tt('reset') }}</button>
        <button
          v-if="game.stage <= SECOND"
          class="btn"
          :disabled="game.animating"
          @click="onPlayClick"
        >{{ game.stage === WAIT ? tt('roll') : tt('change') }}</button>
      </view>
    </view>

    <!-- 胜利彩带：只在「真的赢下这一手」那一刻放，恢复/结算都不放 -->
    <Confetti v-if="justWon" />

    <!-- 右下角悬浮按钮：猜大小开关（上）/ 帮助（下） -->
    <FloatingActions>
      <view class="fab" @click="onToggleDice">
        <view class="fab-ico" :class="dice ? 'i-mdi-dice-5' : 'i-mdi-dice-5-outline'" />
      </view>
      <view class="fab" @click="showHelp"><view class="fab-ico i-carbon-help" /></view>
    </FloatingActions>
    <HelpSheet :open="helpOpen" :text="helpText" @close="helpOpen = false" />
  </view>
</template>

<script setup>
// 德州扑克 · 微信小程序版
// 逻辑来自 web 的 board.js（本目录）：阶段机 / 取牌 / 牌型判定 / 猜大小 / 下注偏好全部原样，
// 只把 localStorage 换成 @/core/storage。视图照 web 的 MainGame.vue + CardItem.vue + RuleArea.vue 重写。
//
// 已知降级（详见交付说明）：
//   1. 扑克牌翻面：web 是 rotateY(90deg) 的 3D 过渡 → 这里改成 2D「横向压扁再展开」；
//   2. 花色：web 用 mdi 花色图标 → 按要求改成文字 ♠♥♦♣ + CSS 上色；
//   3. 猜大小历史：web 用 div + scrollTo → scroll-view + scroll-left。
import { computed, onUnmounted, reactive, ref, watch } from 'vue';

import CardView from './card.vue';
import Confetti from '@/components/Confetti.vue';
import FloatingActions from '@/components/FloatingActions.vue';
import HelpSheet from '@/components/HelpSheet.vue';
import { getRaw, setRaw } from '@/core/storage';
import { playLose, playWin } from '@/core/sfx';
import { tt } from './i18n';
import {
  ALL_CARDS,
  DEAL_INTERVAL,
  DEFAULT_TOTAL,
  FIRST,
  GUESS,
  GUESS_LOSE,
  GUESS_PER_SECOND,
  LEN,
  LOSE,
  MAX_BET,
  MIN_BET,
  SECOND,
  TOTAL_KEY,
  WAIT,
  bet,
  cardToNum,
  changeBet,
  dice,
  getInitData,
  judgeResult,
  numToCard,
  randomANum,
  randomOne,
  rulesList,
  sampleSize,
  toggleDice,
} from './board.js';

import { setNavTitle } from '@/core/i18n';
import ParticleBackground from '@/components/ParticleBackground.vue';

// 原生导航栏标题跟随语言（pages.json 里的标题是静态的）
setNavTitle(() => tt('gameTitle'));
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// 牌背在 web 里是 ['', '']（num 为空串）；小程序组件属性按声明类型转换，数字属性传空串会变 NaN，
// 所以统一折成 0 再传（0 也代表牌背）。
const numOf = (card) => (+card[0]) || 0;

// 猜大小历史记录最多滚到最后一张（web 是 scrollTo(1000, 0)；scroll-view 用递增的 scroll-left）
const guessScroll = ref(0);

// 是否手动操作过打开猜大小：手动打开时入场动画不延迟（与 web 的 uptop0 一致）
const manualDice = ref(false);
watch(dice, () => { manualDice.value = true; });

// 游戏状态数据（资产从存档恢复，其余同 web 的 getInitData）
const game = reactive({
  total: +getRaw(TOTAL_KEY) || DEFAULT_TOTAL,
  ...getInitData(),
});

// 当前牌型转换为包含 1-54 数字的数组，用于避免随机时重复
const curCards = computed(() => game.cards.map(cardToNum));
// 猜大小随机出来的牌
const randomCard = computed(() => numToCard(game.randomNum));
// 中了的牌型（web 的 RuleArea 里是 rulesList.find）
const winRule = computed(() => rulesList.find((item) => item.times === game.result) || null);

// 让「这一张牌」在值变化后播一次翻牌动画（首帧牌背不播，与 web 一致）
const cardAnim = ref(new Array(LEN).fill(0));
// 换牌第一拍：所有被换的牌**同时快速翻到背面**（web 是一次性清空），这一拍用 0.24s 快翻；
// 之后逐张翻回新牌时恢复 0.46s。
const quickFlip = ref(false);
const QUICK_FLIP_MS = 260;
function bumpCard(idx) {
  cardAnim.value[idx] += 1;
}

// 胜利彩带只在真正赢下这一刻放（4 秒后自动复位）
const justWon = ref(false);
let wonTimer = 0;

// 猜大小定时器 / 金额 zoom 提示定时器 / 下注长按定时器
let guessTimer = null;
let zoomTotalTimer = 0;
let zoomWinTimer = 0;
let alive = true;

// 赌注区 ±：按住连续加减 —— 按下先走一步，停 0.32s（避免手抖连跳）后开始连发，每 60ms 一步（约 16 步/秒）。
// 注意：这两个按钮**不能**再挂 @click —— 长按松手时浏览器/小程序还会补一次 tap，会多走一步。
const betPress = { timer: 0, delay: 320 };
const BET_REPEAT_MS = 60;

function canStepBet(dir) {
  if (game.stage !== WAIT || game.animating) return false;
  return dir > 0 ? bet.value < MAX_BET : bet.value > MIN_BET;
}

function stopBetPress() {
  clearTimeout(betPress.timer);
  betPress.timer = 0;
}

function startBetPress(dir) {
  if (!canStepBet(dir)) return;
  stopBetPress();
  changeBet(dir);
  const repeat = () => {
    if (!canStepBet(dir)) { stopBetPress(); return; }   // 到上下限 / 阶段变了就停
    changeBet(dir);
    betPress.timer = setTimeout(repeat, BET_REPEAT_MS);
  };
  betPress.timer = setTimeout(repeat, betPress.delay);
}

// 金额变化：zoom 提示 + 资产落存档（与 web 的 watchEffect + watch 合并成一条）
watch(() => game.total, (val) => {
  setRaw(TOTAL_KEY, String(val));
  game.zoomTotal = true;
  clearTimeout(zoomTotalTimer);
  zoomTotalTimer = setTimeout(() => { game.zoomTotal = false; }, 600);
});
watch(() => game.bonus, () => {
  game.zoomWin = true;
  clearTimeout(zoomWinTimer);
  zoomWinTimer = setTimeout(() => { game.zoomWin = false; }, 600);
});

watch(() => game.stage, (val) => {
  if (val === GUESS) {
    // 真正赢下这一手（中牌型）→ 彩带 + 胜利音效，之后才进猜大小
    justWon.value = true;
    playWin();
    clearTimeout(wonTimer);
    wonTimer = setTimeout(() => { justWon.value = false; }, 4000);
    startGuessTimer();
    return;
  }
  if (val === GUESS_LOSE) {
    stopGuessTimer();
    game.bonus = 0;
    game.result = 0;
    game.randomNum = 0;
  }
});

function onCardClick(idx) {
  if (game.stage !== FIRST) return;
  if (game.animating) return;
  game.holds[idx] = !game.holds[idx];
}

async function onPlayClick() {
  if (game.animating) return;
  if (game.stage > SECOND) return;
  game.animating = true;
  if (game.stage === WAIT) {
    if (game.total <= 0) {
      game.total = DEFAULT_TOTAL;
      uni.showModal({ title: '', content: tt('bankrupt'), showCancel: false, confirmText: 'OK' });
    }
    if (game.total >= bet.value) {
      game.total -= bet.value;
    } else {
      bet.value = game.total;
      game.total = 0;
    }
    game.cards = Array.from({ length: LEN }, () => (['', '']));
    const cards = sampleSize(ALL_CARDS, LEN);
    for (let i = 0; i < LEN; i++) {
      if (!alive) return;
      await sleep(DEAL_INTERVAL);
      if (!alive) return;
      game.cards[i] = numToCard(cards[i]);
      bumpCard(i);
    }
  } else if (game.stage === FIRST) {
    // ① 所有「没保留」的牌**同一拍**翻到背面（web 是一次性清空），这一拍用 0.24s 快翻
    quickFlip.value = true;
    game.holds.forEach((val, idx) => {
      if (!val) game.cards[idx] = ['', ''];
    });
    await sleep(QUICK_FLIP_MS);
    if (!alive) return;
    quickFlip.value = false;
    // ② 再逐张翻回新牌（间隔 DEAL_INTERVAL，与 web 的 await sleep 同节奏）
    for (let i = 0; i < LEN; i++) {
      if (game.holds[i]) continue;
      if (!alive) return;
      await sleep(DEAL_INTERVAL);
      if (!alive) return;
      game.cards[i] = numToCard(randomOne(curCards.value));
      bumpCard(i);
    }
    await sleep(DEAL_INTERVAL);
    if (!alive) return;
  }
  game.animating = false;
  game.stage++;
  if (game.stage === SECOND) {
    const res = judgeResult(curCards.value);
    if (!res) { game.stage = LOSE; playLose(); return; }
    game.stage = GUESS;
    game.result = res;
    game.bonus = bet.value * res;
  }
}

function onResetClick() {
  if (game.stage === GUESS) {
    game.total += game.bonus;
    stopGuessTimer();
  }
  Object.assign(game, getInitData());
  guessScroll.value = 0;
}

function startGuessTimer() {
  game.randomNum = randomANum();
  stopGuessTimer();
  guessTimer = setInterval(() => {
    game.randomNum = randomANum();
  }, 1000 / GUESS_PER_SECOND);
}

function stopGuessTimer() {
  if (guessTimer) clearInterval(guessTimer);
  guessTimer = null;
}

function guessBigOrSmall(isBig) {
  if (game.stage !== GUESS) return;
  const [num, type] = numToCard(game.randomNum);
  let isWin = 0;
  if (num > 7 && isBig || num < 7 && !isBig) {
    game.bonus <<= 1;
    isWin = 1;
  } else if (num !== 7) {
    game.stage = GUESS_LOSE;
    playLose();
    isWin = -1;
  }
  game.guesses.push([num, type, isBig, isWin]);
  // 滚到最右（历史随猜测变长，给一个始终大于 scrollWidth 的值，scroll-view 会自己夹到最右）
  guessScroll.value = 100000 + game.guesses.length;
}

function onToggleDice() {
  toggleDice();
}

// 帮助：web 的 HelpDialog = helpMsg + 1..5 条原文；小程序用 uni.showModal 纯文本（title 留空）
const HELP_KEYS = ['help1', 'help2', 'help3', 'help4', 'help5'];
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

onUnmounted(() => {
  alive = false;
  stopGuessTimer();
  stopBetPress();
  clearTimeout(zoomTotalTimer);
  clearTimeout(zoomWinTimer);
  clearTimeout(wonTimer);
});

// ---------- 中牌型遮罩的烟花（与 web 的 RuleArea 一致：5 组 × 14 颗粒子，模块级只算一次） ----------
const COLORS = ['#ffd700', '#ff5e5e', '#6ee7ff', '#7cff6e', '#ff9df6'];
const PARTICLE_COUNT = 14;

const BURSTS = [
  { left: '22%', top: '35%' },
  { left: '50%', top: '25%' },
  { left: '78%', top: '40%' },
  { left: '35%', top: '70%' },
  { left: '65%', top: '65%' },
].map((pos, i) => ({
  ...pos,
  delay: `${i * 0.3}s`,
  particles: Array.from({ length: PARTICLE_COUNT }, (_, j) => {
    const angle = (Math.PI * 2 * j) / PARTICLE_COUNT + Math.random() * 0.3;
    const dist = 35 + Math.random() * 20;
    return {
      dx: `${(Math.cos(angle) * dist).toFixed(1)}rpx`,
      dy: `${(Math.sin(angle) * dist).toFixed(1)}rpx`,
      color: COLORS[(i + j) % COLORS.length],
      delay: `${(Math.random() * 0.15).toFixed(2)}s`,
    };
  }),
}));
</script>

<style lang="scss" scoped>
/* 全页只有这里一处 min-height: 100vh */
.screen {
  min-height: 100vh;
  background: transparent;  /* 背景交给 ParticleBackground（canvas 自己铺底色） */
}
.page {
  padding: 36rpx 24rpx 140rpx;   /* 底部让开右下角悬浮按钮 */
  display: flex;
  flex-direction: column;
  gap: 36rpx;
  background: #f0f2f5;
  color: #2c3e50;
}

/* ---------- 入场动画（web 的 @for uptop1..5：0.3s，每块错开 0.2s） ---------- */
@keyframes uptop {
  from { transform: translateY(250%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.uptop1 { animation: uptop 0.3s ease-in-out 0s 1 backwards; }
.uptop2 { animation: uptop 0.3s ease-in-out 0.2s 1 backwards; }
.uptop3 { animation: uptop 0.3s ease-in-out 0.4s 1 backwards; }
.uptop4 { animation: uptop 0.3s ease-in-out 0.6s 1 backwards; }
.uptop5 { animation: uptop 0.3s ease-in-out 0.8s 1 backwards; }
/* 手动开关猜大小时新出现的那块不要延迟（web 的 .uptop0） */
.uptop0 { animation-delay: 0s; }

/* ---------- 牌型倍数区 ---------- */
.rule-area {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  padding: 29rpx 0;
  overflow: hidden;
}
.rule {
  flex: 1 0 50%;
  display: flex;
  justify-content: space-between;
  box-sizing: border-box;
  padding: 0 19rpx;
  line-height: 1.8;
  font-size: 31rpx;
  color: #2c3e50;
}
.rule-odd { padding-right: 29rpx; }
.rule-even { padding-left: 29rpx; }

@keyframes pop-in {
  from { transform: scale(0.3); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.win-mask {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.8);
  overflow: hidden;
}
.win-title {
  font-size: 57rpx;
  font-weight: bold;
  color: #f5b52e;
  text-shadow: 0 0 15rpx rgba(245, 181, 46, 0.6);
  animation: pop-in 0.4s ease-out 0s 1 backwards;
}
.win-times {
  font-size: 31rpx;
  font-weight: bold;
  color: #f5b52e;
  animation: pop-in 0.4s ease-out 0.15s 1 backwards;
}
.firework { position: absolute; }
@keyframes explode {
  0% { transform: translate(0, 0) scale(1); opacity: 0; }
  8% { opacity: 1; }
  70% { opacity: 1; }
  100% { transform: translate(var(--dx), var(--dy)) scale(0.2); opacity: 0; }
}
.particle {
  position: absolute;
  width: 8rpx;
  height: 8rpx;
  border-radius: 50%;
  background: var(--p-color);
  box-shadow: 0 0 11rpx var(--p-color);
  animation: explode 1.4s ease-out 0s infinite;
  animation-delay: calc(var(--burst-delay) + var(--p-delay));
}

/* ---------- 金额区 ---------- */
.money-area {
  display: flex;
  align-items: center;
  padding: 23rpx 0;
}
.money-item {
  flex: 1 0 32%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1.8;
  font-size: 29rpx;
  font-weight: bold;
}
.money-bet { flex: 1 0 33%; }
.money-divider {
  width: 2rpx;
  height: 46rpx;
  background: #e1e1e1;
  opacity: 0.6;
}
.title {
  font-size: 23rpx;
  font-weight: normal;
  color: #5f6b7a;
}
.money {
  display: inline-block;
  margin: 0 10rpx;
}
@keyframes zoom {
  from { transform: scale(1); }
  50% { transform: scale(2.1); }
  to { transform: scale(1); }
}
.money.zoom { animation: zoom 0.6s ease-in-out 0s; }
.bet-line {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 11rpx;
  min-height: 57rpx;
}

/* ---------- 手牌区 ---------- */
.card-area {
  position: relative;
  display: flex;
  justify-content: center;
  padding: 48rpx 0;
  overflow: hidden;
}
.result-win,
.result-lose,
.result-guess-lose {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.8);
  color: #12833f;
  font-weight: bold;
  font-size: 34rpx;
}
.result-lose { color: #b11; }
.result-guess-lose { color: #c2410c; }

/* ---------- 猜大小区（横向滚动） ---------- */
.guess-area {
  /* 高度 = 上内边距 19 + 牌高 126 + 下内边距 52（猜大/猜小的文字标签挂在这 52rpx 里），
     再留 3rpx 余量：scroll-view 竖向要定高，否则内容可能撑不开 */
  height: 200rpx;
  white-space: nowrap;
}
.guess-line {
  /* inline-flex：宽度跟着内容长（横向可滚动），且不依赖行内盒基线对齐 */
  display: inline-flex;
  align-items: flex-start;
  padding: 19rpx 23rpx 52rpx;
  font-size: 0;
  line-height: 0;
  white-space: nowrap;
  vertical-align: top;
}
.guess-item {
  position: relative;
  /* inline-flex：小程序里自定义组件的宿主节点 display 不可控，包一层 inline-flex 保证牌是横排的 */
  display: inline-flex;
  vertical-align: top;
  font-size: 0;
}
.guess-current {
  display: inline-flex;
  vertical-align: top;
}
.guess-result {
  position: absolute;
  bottom: -38rpx;
  left: 50%;
  transform: translateX(-50%);
  font-size: 23rpx;
  line-height: 1.2;
  font-weight: bold;
  white-space: nowrap;
}
.guess-win { color: #12833f; }
.guess-lose { color: #b11; }
.guess-tie { color: #2c3e50; }

/* ---------- 操作区 ---------- */
.opt-area {
  display: flex;
  align-items: center;
  gap: 19rpx;
  padding: 18rpx 19rpx;
  /* 最后一排按钮要让开右下角的两个悬浮按钮（96×2 + 24 间距 + 40 底距 = 256rpx）：
     页面 padding-bottom 只有 140rpx，这里再补 120rpx（+ 安全区），滚到底时按钮整体高过 .fab 顶。
     用外边距而不是 padding-right，是为了让三颗按钮保持 web 的整宽（不被压窄）。 */
  margin-bottom: 120rpx;
  margin-bottom: calc(120rpx + env(safe-area-inset-bottom));
}
.opt-area .btn {
  flex: 1 0 25%;
  height: 84rpx;
  font-size: 27rpx;
}

/* ---------- 按钮（web 的 .btn：白字 + 主色底 + 圆角 8px） ---------- */
.btn {
  margin: 0;
  padding: 0;
  border: 2rpx solid #e1e1e1;
  border-radius: 15rpx;
  background: #23804e;
  color: #fff;
  font-size: 27rpx;
  font-weight: bold;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.12);
}
/* 三颗操作按钮各一种颜色（用户指定）：猜大蓝 / 猜小紫 / 结算琥珀；禁用时仍走灰色 */
.btn-big { background: #2c6aad; }
.btn-small { background: #7550ad; }
.btn-settle { background: #b45309; }
.btn[disabled] {
  background: #aaa;
  box-shadow: none;
}
.btn-bet {
  width: 53rpx;
  height: 53rpx;
  flex: 0 0 auto;
  border-radius: 50%;
}
.btn-ico {
  font-size: 27rpx;
  line-height: 1;
}
</style>
