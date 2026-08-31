<template>
  <div class="wrapper">
    <TopHeader>
      <span class="item-wrapper" @click="toggleDice">
        <i i-mdi-dice-5 v-if="dice" />
        <i i-mdi-dice-5-outline v-else />
      </span>
    </TopHeader>
    <div class="game-area">
      <RuleArea class="uptop1 card" :result="game.result" />
      <div class="money-area uptop2 card">
        <div class="money-item">
          <span class="title">{{ i18n('total') }}</span>
          <span class="money" :class="{zoom: game.zoomTotal}">{{ game.total }}</span>
        </div>
        <div class="money-item">
          <span class="title">{{ i18n('bonus') }}</span>
          <span class="money" :class="{zoom: game.zoomWin}">{{ game.bonus }}</span>
        </div>
        <div class="money-item">
          <span class="title">{{ i18n('bet') }}</span>
          <div class="bet-line">
            <button
              @click="changeBet(-1)"
              class="btn btn-bet"
              :disabled="bet === MIN_BET || game.stage !== WAIT || game.animating"
            >
              <i i-carbon-subtract-alt />
            </button>
            <span class="money">{{ bet }}</span>
            <button
              @click="changeBet(1)"
              class="btn btn-bet"
              :disabled="bet === MAX_BET || game.stage !== WAIT || game.animating"
            >
              <i i-carbon-add-alt />
            </button>
          </div>
        </div>
      </div>
      <div class="card-area uptop3 card">
        <CardItem
          v-for="(card, idx) in game.cards"
          :key="idx"
          :num="card[0]"
          :type="card[1]"
          :hold="game.holds[idx]"
          @click="onCardClick(idx)"
        />
        <div class="result-win" v-if="game.stage === GUESS">
          🎉🎉 {{ i18n('tipWin') }} 🎉🎉
        </div>
        <div class="result-lose" v-if="game.stage === LOSE">
          👻👻 {{ i18n('tipLost') }} 👻👻
        </div>
        <div class="result-guess-lose" v-if="game.stage === GUESS_LOSE">
          😭😭 {{ i18n('tipGuessLose') }} 😭😭
        </div>
      </div>
      <div
        v-if="dice"
        class="guess-area uptop4 card"
        :class="`${manualDice ? 'uptop0' : ''}`"
        ref="guessArea"
      >
        <div class="guess-list">
          <div
            v-for="([num, type, isBig, isWin], idx) in game.guesses"
            :key="idx"
            class="guess-item"
          >
            <CardItem
              :mini="true"
              :num="num"
              :type="type"
            />
            <span
              :class="{
                'guess-result': true,
                'guess-win': isWin > 0,
                'guess-tie': isWin === 0,
                'guess-lose': isWin < 0,
              }"
            >
              {{ i18n(isBig ? 'big' : 'small') }}
            </span>
          </div>
        </div>
        <div class="card-wrapper">
          <CardItem
            :mini="true"
            :num="randomCard[0]"
            :type="randomCard[1]"
          />
        </div>
      </div>
      <div class="opt-area uptop5 card">
        <template v-if="dice && game.stage === GUESS">
          <button class="btn" @click="guessBigOrSmall(true)">
            {{ i18n('big') }}
          </button>
          <button class="btn" @click="guessBigOrSmall(false)">
            {{ i18n('small') }}
          </button>
        </template>
        <button
          v-if="game.stage >= LOSE"
          class="btn"
          :disabled="game.animating"
          @click="onResetClick"
        >
          {{ game.stage === GUESS ? i18n('settle') : i18n('reset') }}
        </button>
        <button
          v-if="game.stage <= SECOND"
          class="btn"
          :disabled="game.animating"
          @click="onPlayClick"
        >
          {{ game.stage === WAIT ? i18n('roll') : i18n('change') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, watchEffect } from 'vue';
import sampleSize from 'lodash.samplesize';

import TopHeader from '@/components/TopHeader.vue';
import RuleArea from './RuleArea.vue';
import CardItem from './CardItem.vue';
import { rulesList } from './rules.js';
import { bet, changeBet, MIN_BET, MAX_BET } from './bet.js';
import { dice, toggle as toggleDice } from './dice.js';

import { TOTAL_KEY } from './constants.js';
const LEN = 5; // 一组牌 5 张
const CARDS_COUNT = 13 * 4; // 总共可用 52 张牌
const JOKER_1 = CARDS_COUNT + 1; // 小王 53
const JOKER_2 = CARDS_COUNT + 2; // 大王 54
const DEFAULT_TOTAL = 1000; // 初始默认资产
const DEAL_INTERVAL = 250; // 发牌动画时间间隔
const GUESS_PER_SECOND = 10; // 猜大小 1 秒闪烁几张牌

/*
 * 游戏阶段：0:初始、1:第一轮发牌、2:第二轮发牌、3:直接输、4:赢猜大小、5:猜大小猜错
 * 状态机
 * 0 -> 1 -> 2 -> 3 -[重置]-> 0
 *           ╰-> 4 -[结算]-> 0
 *                ╰-> 5 -[重置]-> 0
 */
const [WAIT, FIRST, SECOND, LOSE, GUESS, GUESS_LOSE] = [0, 1, 2, 3, 4, 5];
// 所有牌的数字，1-54，用于把随机数映射到具体的牌，53 小王、54 大王
const ALL_CARDS = new Array(CARDS_COUNT + 2).fill(1).map((_, i) => i + 1);

// 大小王可替换为哪些牌的数字，小王 1 -> 26，大王 27 -> 52
const CARDS_JOKER1 = new Array(CARDS_COUNT / 2).fill(1).map((_, i) => i + 1);
const CARDS_JOKER2 = new Array(CARDS_COUNT / 2).fill(1).map((_, i) => i + 27);

// 牌的花色：黑桃、梅花、红桃、方片
const TYPES = ['spade', 'club', 'heart', 'diamond'];

const sleep = ms => new Promise(res => setTimeout(res, ms));

// 部分初始游戏数据
const getInitData = () => ({
  bonus: 0, // 奖金金额
  result: 0, // 牌型赔率
  randomNum: 0, // 随机数，1 - 52，0 为牌背
  stage: WAIT, // 游戏处于哪个阶段
  animating: false, // 是否在进行发牌动画
  cards: Array.from({ length: LEN }, () => (['', ''])), // 当前牌型，初始 5 张牌背
  holds: new Array(LEN).fill(false), // 第一次发牌后选择保留的牌下标
  guesses: [], // 猜大小历史记录
  zoomTotal: false, // 总资产金额变化时候 zoom 提示
  zoomWin: false, // 奖金金额变化时 zoom 提示
});

const guessArea = ref(null);

// 是否手动操作过打开猜大小，手动打开动画无延迟
const manualDice = ref(false);
watch(dice, val => {
  manualDice.value = true;
});

// 游戏状态数据
const game = reactive({
  total: +localStorage.getItem(TOTAL_KEY) || DEFAULT_TOTAL,
  ...getInitData(),
});

// 当前牌型转换为包含 1-54 数字的数组，用于避免随机时重复
const curCards = computed(() => game.cards.map(cardToNum));
// 猜大小随机出来的牌
const randomCard = computed(() => numToCard(game.randomNum));

// 猜大小定时器
let guessTimer = null;

watch(() => game.bonus, async () => {
  game.zoomWin = true;
  await sleep(600);
  game.zoomWin = false;
});
watch(() => game.total, async () => {
  game.zoomTotal = true;
  await sleep(600);
  game.zoomTotal = false;
});
watch(() => game.stage, val => {
  if (val === GUESS) return startGuessTimer();
  if (val === GUESS_LOSE) {
    stopGuessTimer();
    game.bonus = 0;
    game.result = 0;
    game.randomNum = 0;
  }
});

watchEffect(() => {
  localStorage.setItem(TOTAL_KEY, game.total);
});

function numToCard(val) {
  if (!val) return ['', ''];
  if (val === JOKER_1) return [14, 'spade']; // 小王花色 黑桃
  if (val === JOKER_2) return [14, 'heart']; // 大王花色 红桃
  const num = val % 13 || 13;
  const type = TYPES[~~(val / 13.01)];
  return [num, type];
}

function cardToNum(card) {
  const [num, type] = card;
  if (!num || !type) return -1;
  if (num === 14) return type === 'spade' ? JOKER_1 : JOKER_2;
  return TYPES.indexOf(type) * 13 + num;
}

function randomANum(maxNumber = CARDS_COUNT) {
  return Math.ceil(Math.random() * maxNumber);
}

function randomOne() {
  while (true) {
    const val = randomANum(CARDS_COUNT + 2);
    if (!curCards.value.includes(val)) return val;
  }
}

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
      alert('破产了请重新来过！');
      game.total = DEFAULT_TOTAL;
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
      await sleep(DEAL_INTERVAL);
      game.cards[i] = numToCard(cards[i]);
    }
  } else if (game.stage === FIRST) {
    game.holds.forEach((val, idx) => {
      if (!val) game.cards[idx] = ['', ''];
    });
    for (let i = 0; i < LEN; i++) {
      if (game.holds[i]) continue;
      await sleep(DEAL_INTERVAL);
      game.cards[i] = numToCard(randomOne());
    }
    await sleep(DEAL_INTERVAL);
  }
  game.animating = false;
  game.stage++;
  if (game.stage === SECOND) {
    const res = judgeResult();
    if (!res) return game.stage = LOSE;
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
}

function startGuessTimer() {
  game.randomNum = randomANum();
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
    isWin = -1;
  }
  game.guesses.push([num, type, isBig, isWin]);
  guessArea.value?.scrollTo(1000, 0);
}

function judgeResult() {
  if (curCards.value.every(num => num <= CARDS_COUNT)) {
    return getResult(curCards.value);
  }
  let result = 0;
  const arr1 = curCards.value.includes(JOKER_1) ? CARDS_JOKER1 : [0];
  const arr2 = curCards.value.includes(JOKER_2) ? CARDS_JOKER2 : [0];
  const leftCards = curCards.value.filter(num => num <= CARDS_COUNT);
  for (let i = 0; i < arr1.length; i++) {
    const n1 = arr1[i];
    if (leftCards.includes(n1)) continue;
    for (let j = 0; j < arr2.length; j++) {
      const n2 = arr2[j];
      if (leftCards.includes(n2)) continue;
      const tmp = getResult([...leftCards, n1, n2].filter(Boolean));
      result = Math.max(tmp, result);
    }
  }
  return result;
}

function getResult(cardsNum) {
  const ns = cardsNum.map(num => num % 13 || 13);
  const ts = new Set(cardsNum.map(num => ~~(num / 13.01)));
  ns.sort((a, b) => a - b);
  const [n1, n2, n3, n4, n5] = ns;
  if (ts.size === 1) {
    if (n5 - n1 === 4 || n1 === 1 && n2 === 10) return rulesList[0].times; // 同花顺
    return rulesList[3].times; // 同花
  }
  switch (new Set(ns).size) {
    case 5:
      if (n5 - n1 === 4 || n1 === 1 && n2 === 10) return rulesList[4].times; // 顺子
      return 0; // 什么也不是
    case 2:
      if (n1 === n4 || n2 === n5) return rulesList[1].times; // 四条
      return rulesList[2].times; // 葫芦
    case 3:
      if (n1 === n3 || n2 === n4 || n3 === n5) return rulesList[5].times // 三条
      return rulesList[6].times; // 两对
    case 4:
      for (let i = 1; i < LEN; i++) {
        if (ns[i] === ns[i - 1] && (ns[i] === 1 || ns[i] >= 8)) return rulesList[7].times; // 大于 8 一对
      }
      return 0;
    default:
      return 0;
  }
}

</script>

<style scoped lang="scss">
@keyframes uptop {
  from {
    transform: translateY(250%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
@keyframes zoom {
  from {
    transform: scale(1);
  }
  50% {
    transform: scale(2.1);
  }
  to {
    transform: scale(1);
  }
}

@for $i from 1 through 5 {
  .uptop#{$i} {
    animation: 0.3s ease-in-out ($i - 1) * 0.2s 1 backwards uptop;
  }
}
.uptop0 {
  animation-delay: 0s;
}
.btn {
  text-align: center;
  border: 1px solid var(--border-color);
  color: #fff;
  font-weight: bold;
  padding: 0;
  margin: 0;
  border-radius: 8px;
  background: var(--primary-bg);
  box-shadow: 0 2px 4px rgba(0, 0, 0, .15);
  cursor: pointer;
  transition: transform .1s ease, box-shadow .1s ease;
  &:active {
    transform: translateY(1px);
    box-shadow: 0 1px 2px rgba(0, 0, 0, .15);
  }
  &:disabled {
    background: #aaa;
    box-shadow: none;
    cursor: not-allowed;
    transform: none;
  }
}
.wrapper {
  width: 100vw;
  min-width: 360px;
  min-height: 100vh;
  box-sizing: border-box;
  color: var(--text-color);
  background: var(--bg-color);
  overflow-y: auto;
  .game-area {
    max-width: var(--max-width);
    margin: 0 auto 50px;
    box-sizing: border-box;
    padding: 62px 12px 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    .card {
      background: var(--card-color);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      box-sizing: border-box;
      box-shadow: 0 1px 3px rgba(0, 0, 0, .06);
    }
    .money-area {
      display: flex;
      padding: 12px 0;
      .money-item {
        flex: 1 0 33%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        line-height: 1.8;
        box-sizing: border-box;
        border-right: 1px solid var(--border-color);
        font-size: 15px;
        font-weight: bold;
        &:last-child {
          flex: 1 0 34%;
          border-right: 0 none;
        }
        .title {
          font-size: 13px;
          font-weight: normal;
          opacity: .6;
        }
        .money {
          display: inline-block;
          margin: 0 5px;
          &.zoom {
            animation: 0.6s ease-in-out 0s zoom;
          }
        }
        .bet-line {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          min-height: 30px;
        }
        .btn-bet {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          line-height: 1;
        }
      }
    }
    .card-area {
      padding: 25px 0;
      position: relative;
      font-size: 0;
      overflow: hidden;
      .result-win,.result-lose,.result-guess-lose {
        background: var(--mask-color);
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        color: var(--win-color);
        font-weight: bold;
        font-size: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .result-lose {
        color: var(--lose-color);
      }
      .result-guess-lose {
        color: #d4691e;
      }
    }
    .guess-area {
      padding: 10px 12px 25px;
      text-align: left;
      overflow-x: auto;
      font-size: 0;
      white-space: nowrap;
      .guess-list {
        display: inline-block;
        white-space: nowrap;
        .guess-item {
          position: relative;
          display: inline-block;
          font-size: 0;
          .guess-result {
            position: absolute;
            bottom: -20px;
            left: 50%;
            font-size: 12px;
            font-weight: bold;
            transform: translateX(-50%);
            &.guess-win {
              color: var(--win-color);
            }
            &.guess-lose {
              color: var(--lose-color);
            }
            &.guess-tie {
              color: var(--text-color);
            }
          }
        }
      }
      .card-wrapper {
        display: inline-block;
      }
    }
    .opt-area {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 64px;
      padding: 10px;
      .btn {
        flex: 1 0 25%;
        height: 44px;
        font-size: 16px;
      }
    }
  }
}
</style>
