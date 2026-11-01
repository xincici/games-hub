// 单人视频扑克 · 纯逻辑（不依赖 wx / canvas），可以直接用 Node require 做单测。
// 玩法与 web 的 src/games/poker/{rules,bet,constants}.js 对齐：
//   发 5 张 → 点牌保留 → 换掉未保留的牌 → 按牌型赔率结算 →（可选）猜大小翻倍 → 结算入账。
// 与 web 的差异：牌组是标准 52 张，不含大小王（web 用 54 张 + 万能牌替换，见 README 的简化说明）。

const LEN = 5;
const DEFAULT_TOTAL = 1000; // 初始资产
const INIT_BET = 10;
const MIN_BET = 1;
const MAX_BET = 100; // 下注 1-100

// 花色顺序与 core/cards.js 一致；牌面渲染统一交给 core/cards。
const TYPES = ['spade', 'club', 'heart', 'diamond'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// 赔率表（逐字来自 web rules.js），顺序 = 页面倍数表的显示顺序。
const rulesList = [
  { times: 250, key: 'straightflush' }, // 同花顺
  { times: 60, key: 'four' }, // 四条
  { times: 20, key: 'fullhouse' }, // 葫芦
  { times: 10, key: 'flush' }, // 同花
  { times: 7, key: 'straight' }, // 顺子
  { times: 5, key: 'three' }, // 三条
  { times: 2, key: 'twopairs' }, // 两对
  { times: 1, key: 'onepair' }, // 大于 8 一对
];

const NONE = { times: 0, key: '' };

function byKey(key) {
  for (let i = 0; i < rulesList.length; i++) {
    if (rulesList[i].key === key) return { times: rulesList[i].times, key: rulesList[i].key };
  }
  return { times: 0, key: '' };
}

function byTimes(times) {
  const n = Math.floor(+times || 0);
  for (let i = 0; i < rulesList.length; i++) {
    if (rulesList[i].times === n) return { times: n, key: rulesList[i].key };
  }
  return { times: 0, key: '' };
}

function numOf(card) {
  const n = card && Math.round(+card.num);
  return n >= 1 && n <= 13 ? n : 0;
}
function typeOf(card) {
  const t = card && String(card.type);
  return TYPES.indexOf(t) >= 0 ? t : '';
}
function isValid(card) { return !!numOf(card) && !!typeOf(card); }
function makeCard(num, type) {
  return { num: Math.max(1, Math.min(13, Math.round(+num || 1))), type: typeOf({ type }) || 'spade' };
}
function keyOf(card) {
  if (!card) return '';
  return `${(typeOf(card) || 'spade')[0]}${numOf(card)}`;
}

function deck() {
  const out = [];
  TYPES.forEach((type) => {
    for (let n = 1; n <= 13; n++) out.push({ num: n, type });
  });
  return out;
}

// 抽一张不在 taken（key 数组）里的牌；默认用 Math.random，方便单测替换。
function randomCard(taken, rand) {
  const r = typeof rand === 'function' ? rand : Math.random;
  const used = Array.isArray(taken) ? taken : [];
  for (let guard = 0; guard < 300; guard++) {
    const type = TYPES[Math.min(3, Math.max(0, Math.floor(r() * 4)))];
    const num = 1 + Math.min(12, Math.max(0, Math.floor(r() * 13)));
    const card = { num, type };
    if (used.indexOf(keyOf(card)) < 0) return card;
  }
  const left = deck().filter(c => used.indexOf(keyOf(c)) < 0);
  return left.length ? left[0] : { num: 13, type: 'spade' };
}

function isStraight(sortedNums) {
  // 顺子：5 个不同点数且连续；A 只允许接在 K 上面（10 J Q K A）。
  if (sortedNums.length !== LEN) return false;
  for (let i = 1; i < sortedNums.length; i++) {
    if (sortedNums[i] === sortedNums[i - 1]) return false;
  }
  if (sortedNums[4] - sortedNums[0] === 4) return true;
  return sortedNums[0] === 1 && sortedNums[1] === 10;
}

// 评牌：返回 { times, key }；times === 0 表示没有中奖。
function evaluate(hand) {
  if (!Array.isArray(hand) || hand.length !== LEN) return { times: 0, key: '' };
  if (!hand.every(isValid)) return { times: 0, key: '' };
  const ns = hand.map(numOf).sort((a, b) => a - b);
  const flush = hand.every(c => typeOf(c) === typeOf(hand[0]));
  const straight = isStraight(ns);
  if (flush) return byKey(straight ? 'straightflush' : 'flush');
  if (straight) return byKey('straight');
  const counts = {};
  ns.forEach((n) => { counts[n] = (counts[n] || 0) + 1; });
  const groups = Object.keys(counts)
    .map(n => ({ num: +n, count: counts[n] }))
    .sort((a, b) => b.count - a.count || b.num - a.num);
  const top = groups[0];
  if (top.count === 4) return byKey('four');
  if (top.count === 3) return groups[1] && groups[1].count === 2 ? byKey('fullhouse') : byKey('three');
  if (top.count === 2) {
    if (groups[1] && groups[1].count === 2) return byKey('twopairs');
    // 一对只有 A 或 8 以上（含 8）才赔 1 倍，和 web 一致。
    return top.num === 1 || top.num >= 8 ? byKey('onepair') : { times: 0, key: '' };
  }
  return { times: 0, key: '' };
}

// 猜大小：1 猜对、0 平（正好 7）、-1 猜错。A-6 小、8-K 大、7 平。
function guessResult(card, big) {
  const n = numOf(card);
  if (!n) return -1;
  if (n === 7) return 0;
  return (n > 7 && big) || (n < 7 && !big) ? 1 : -1;
}

module.exports = {
  LEN,
  DEFAULT_TOTAL,
  INIT_BET,
  MIN_BET,
  MAX_BET,
  TYPES,
  RANKS,
  rulesList,
  byKey,
  byTimes,
  numOf,
  typeOf,
  isValid,
  makeCard,
  keyOf,
  deck,
  randomCard,
  evaluate,
  guessResult,
};
