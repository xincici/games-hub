// 单人视频扑克 · 纯逻辑（不依赖 wx / canvas），可以直接用 Node require 做单测。
// 玩法与 web 的 src/games/poker/{rules,bet,constants}.js 对齐：
//   发 5 张 → 点牌保留 → 换掉未保留的牌 → 按牌型赔率结算 →（可选）猜大小翻倍 → 结算入账。
// 与 web 一致：54 张牌，小王/大王分别可替代任意黑色/红色牌。

const LEN = 5;
const DEFAULT_TOTAL = 1000; // 初始资产
const INIT_BET = 10;
const MIN_BET = 1;
const MAX_BET = 100; // 下注 1-100

// 花色顺序与 core/cards.js 一致；牌面渲染统一交给 core/cards。
const TYPES = ['spade', 'club', 'heart', 'diamond'];
const CARD_COUNT = 52;
const JOKER_SMALL = { num: 14, type: 'spade' }; // 小王：黑色万能牌
const JOKER_BIG = { num: 14, type: 'heart' };   // 大王：红色万能牌
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
function isJoker(card) {
  return !!card && Math.round(+card.num) === 14
    && (card.type === 'spade' || card.type === 'heart');
}
function typeOf(card) {
  const t = card && String(card.type);
  return TYPES.indexOf(t) >= 0 ? t : '';
}
function isValid(card) { return isJoker(card) || (!!numOf(card) && !!typeOf(card)); }
function makeCard(num, type) {
  return { num: Math.max(1, Math.min(13, Math.round(+num || 1))), type: typeOf({ type }) || 'spade' };
}
function keyOf(card) {
  if (!card) return '';
  if (isJoker(card)) return card.type === 'spade' ? 'js' : 'jh';
  return `${(typeOf(card) || 'spade')[0]}${numOf(card)}`;
}

function deck(includeJokers) {
  const out = [];
  TYPES.forEach((type) => {
    for (let n = 1; n <= 13; n++) out.push({ num: n, type });
  });
  if (includeJokers !== false) out.push({ ...JOKER_SMALL }, { ...JOKER_BIG });
  return out;
}
function normalDeck() { return deck(false); }

// 抽一张不在 taken（key 数组）里的牌；默认用 Math.random，方便单测替换。
function randomCard(taken, rand) {
  const r = typeof rand === 'function' ? rand : Math.random;
  const used = Array.isArray(taken) ? taken : [];
  const pool = deck(true).filter(c => used.indexOf(keyOf(c)) < 0);
  if (pool.length) return { ...pool[Math.min(pool.length - 1, Math.floor(r() * pool.length))] };
  return { num: 13, type: 'spade' };
}

// 猜大小只翻普通牌，避免大小王把 7 的边界搅乱。
function randomGuessCard(taken, rand) {
  const r = typeof rand === 'function' ? rand : Math.random;
  const used = Array.isArray(taken) ? taken : [];
  const pool = normalDeck().filter(c => used.indexOf(keyOf(c)) < 0);
  if (pool.length) return { ...pool[Math.min(pool.length - 1, Math.floor(r() * pool.length))] };
  return { num: 13, type: 'spade' };
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

// 普通牌评牌：返回 { times, key }；times === 0 表示没有中奖。
function evaluateNormal(hand) {
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

// 大小王万能：小王可替任意黑牌（♠/♣），大王可替任意红牌（♥/♦）。
// 5 张里最多两张王，直接枚举 52×52 种替换取最高牌型。
function evaluate(hand) {
  if (!Array.isArray(hand) || hand.length !== LEN) return { times: 0, key: '' };
  if (!hand.every(isValid)) return { times: 0, key: '' };
  const jokers = hand.filter(isJoker);
  if (!jokers.length) return evaluateNormal(hand);
  const base = hand.filter(card => !isJoker(card));
  const used = new Set(base.map(keyOf));
  const candidates = normalDeck().filter(card => !used.has(keyOf(card)));
  const colors = jokers.map(card => (card.type === 'spade' ? 'black' : 'red'));
  let best = { times: 0, key: '' };
  const pick = (index, chosen) => {
    if (index === colors.length) {
      const result = evaluateNormal(base.concat(chosen));
      if (result.times > best.times) best = result;
      return;
    }
    const color = colors[index];
    candidates.forEach((card) => {
      const black = card.type === 'spade' || card.type === 'club';
      if ((color === 'black') !== black) return;
      const key = keyOf(card);
      if (chosen.some(c => keyOf(c) === key)) return;
      pick(index + 1, chosen.concat([card]));
    });
  };
  pick(0, []);
  return best;
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
  isJoker,
  keyOf,
  deck,
  normalDeck,
  randomCard,
  randomGuessCard,
  evaluate,
  guessResult,
};
