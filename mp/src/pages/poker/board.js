// 德州扑克 · 纯逻辑（微信小程序版）
// 内容来自 web 的四个文件，逻辑一行没改，只把 localStorage 换成 @/core/storage：
//   src/games/poker/constants.js  → PREFIX / *_KEY
//   src/games/poker/bet.js        → bet / changeBet / MIN_BET / MAX_BET
//   src/games/poker/dice.js       → dice / toggleDice（猜大小默认开启）
//   src/games/poker/rules.js      → rulesList
//   src/games/poker/MainGame.vue  → 阶段常量、numToCard / cardToNum / judgeResult / getResult / 随机取牌
// 例外：web 用 lodash.samplesize 取 5 张不重复牌，mp 没装这个包 → 这里用 Fisher-Yates 现写一个
//       sampleSize()，行为与 lodash 一致（从数组里随机取 n 个不重复元素）。
// 存档 key 与 web 完全一致（__poker_game_total / _bet / _dice），两端数据可以互认。
import { ref, watch } from 'vue';

import { getRaw, setRaw } from '@/core/storage';

// ---------- 存档 key（constants.js） ----------
export const PREFIX = '__poker_game';
export const HELPED_KEY = `${PREFIX}_helped`;
export const TOTAL_KEY = `${PREFIX}_total`;
export const BET_KEY = `${PREFIX}_bet`;
export const DICE_KEY = `${PREFIX}_dice`;

// ---------- 下注（bet.js） ----------
export const INIT_BET = 10;
export const MIN_BET = 1;
export const MAX_BET = 100;

export const bet = ref(+getRaw(BET_KEY) || INIT_BET);
watch(bet, (val) => setRaw(BET_KEY, String(val)));

export function changeBet(diff) {
  if (bet.value === MIN_BET && diff < 0 || bet.value === MAX_BET && diff > 0) return;
  bet.value += diff;
}

// ---------- 猜大小开关（dice.js） ----------
// 猜大小**默认开启**（用户要求）。关掉时必须显式存 '0' —— 「从没动过」和「主动关掉」必须能分开。
const storedDice = getRaw(DICE_KEY);   // '1' 开 / '0' 关 / null = 没动过 → 默认开
export const dice = ref(storedDice === null ? true : storedDice === '1');
watch(dice, (val) => setRaw(DICE_KEY, val ? '1' : '0'));
export const toggleDice = () => { dice.value = !dice.value; };

// ---------- 牌型倍数（rules.js） ----------
export const rulesList = [
  { times: 250, key: 'straightflush' }, // 同花顺
  { times: 60, key: 'four' },           // 四条
  { times: 20, key: 'fullhouse' },      // 葫芦
  { times: 10, key: 'flush' },          // 同花
  { times: 7, key: 'straight' },        // 顺子
  { times: 5, key: 'three' },           // 三条
  { times: 2, key: 'twopairs' },        // 两对
  { times: 1, key: 'onepair' },         // 一对
];

// ---------- 牌桌常量（MainGame.vue） ----------
export const LEN = 5;                 // 一组牌 5 张
export const CARDS_COUNT = 13 * 4;    // 总共可用 52 张牌
export const JOKER_1 = CARDS_COUNT + 1; // 小王 53
export const JOKER_2 = CARDS_COUNT + 2; // 大王 54
export const DEFAULT_TOTAL = 1000;    // 初始默认资产
export const DEAL_INTERVAL = 250;     // 发牌动画时间间隔
export const GUESS_PER_SECOND = 10;   // 猜大小 1 秒闪烁几张牌

/*
 * 游戏阶段：0:初始、1:第一轮发牌、2:第二轮发牌、3:直接输、4:赢猜大小、5:猜大小猜错
 * 0 -> 1 -> 2 -> 3 -[重置]-> 0
 *           ╰-> 4 -[结算]-> 0
 *                ╰-> 5 -[重置]-> 0
 */
export const [WAIT, FIRST, SECOND, LOSE, GUESS, GUESS_LOSE] = [0, 1, 2, 3, 4, 5];

// 所有牌的数字，1-54，用于把随机数映射到具体的牌，53 小王、54 大王
export const ALL_CARDS = new Array(CARDS_COUNT + 2).fill(1).map((_, i) => i + 1);

// 大小王可替换为哪些牌的数字，小王 1 -> 26，大王 27 -> 52
export const CARDS_JOKER1 = new Array(CARDS_COUNT / 2).fill(1).map((_, i) => i + 1);
export const CARDS_JOKER2 = new Array(CARDS_COUNT / 2).fill(1).map((_, i) => i + 27);

// 牌的花色：黑桃、梅花、红桃、方片
export const TYPES = ['spade', 'club', 'heart', 'diamond'];

export const getInitData = () => ({
  bonus: 0,            // 奖金金额
  result: 0,           // 牌型赔率
  randomNum: 0,        // 随机数，1 - 52，0 为牌背
  stage: WAIT,         // 游戏处于哪个阶段
  animating: false,    // 是否在进行发牌动画
  cards: Array.from({ length: LEN }, () => (['', ''])), // 当前牌型，初始 5 张牌背
  holds: new Array(LEN).fill(false),  // 第一次发牌后选择保留的牌下标
  guesses: [],         // 猜大小历史记录
  zoomTotal: false,    // 总资产金额变化时候 zoom 提示
  zoomWin: false,      // 奖金金额变化时 zoom 提示
});

export function numToCard(val) {
  if (!val) return ['', ''];
  if (val === JOKER_1) return [14, 'spade']; // 小王花色 黑桃
  if (val === JOKER_2) return [14, 'heart']; // 大王花色 红桃
  const num = val % 13 || 13;
  const type = TYPES[~~(val / 13.01)];
  return [num, type];
}

export function cardToNum(card) {
  const [num, type] = card;
  if (!num || !type) return -1;
  if (num === 14) return type === 'spade' ? JOKER_1 : JOKER_2;
  return TYPES.indexOf(type) * 13 + num;
}

export function randomANum(maxNumber = CARDS_COUNT) {
  return Math.ceil(Math.random() * maxNumber);
}

// curNums：当前牌面转成的 1-54 数组（web 里是 computed 的 curCards，这里改成传参）
export function randomOne(curNums) {
  while (true) {
    const val = randomANum(CARDS_COUNT + 2);
    if (!curNums.includes(val)) return val;
  }
}

// 从 arr 里随机取 n 个不重复元素（等价于 web 的 lodash.samplesize，不引入依赖）
export function sampleSize(arr, n) {
  const pool = arr.slice();
  const out = [];
  const count = Math.min(n, pool.length);
  for (let i = 0; i < count; i++) {
    const j = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(j, 1)[0]);
  }
  return out;
}

// cardsNum：5 张牌转成的 1-54 数组（web 里读的是 curCards.value）
export function judgeResult(cardsNum) {
  if (cardsNum.every(num => num <= CARDS_COUNT)) {
    return getResult(cardsNum);
  }
  let result = 0;
  const arr1 = cardsNum.includes(JOKER_1) ? CARDS_JOKER1 : [0];
  const arr2 = cardsNum.includes(JOKER_2) ? CARDS_JOKER2 : [0];
  const leftCards = cardsNum.filter(num => num <= CARDS_COUNT);
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

export function getResult(cardsNum) {
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
      if (n1 === n3 || n2 === n4 || n3 === n5) return rulesList[5].times; // 三条
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
