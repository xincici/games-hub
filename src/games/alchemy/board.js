// 扑克炼金术 纯逻辑：牌堆（不重复发牌）、4×4 的 10 条消除线、4 张牌的牌型判定
// （含黑/红 Joker 的颜色约束）。组件只管交互与动画。

export const SIZE = 4;
export const CELLS = SIZE * SIZE;    // 16 格
export const PREVIEW = 2;            // 除当前牌外，还能看到下两张

export const SUITS = ['heart', 'diamond', 'spade', 'club'];
export const BLACK_SUITS = ['spade', 'club'];
export const RED_SUITS = ['heart', 'diamond'];
export const RANKS = 13;             // A(1) … K(13)

// 唯一的特殊牌（普通牌 kind = 'card'）
export const JOKER = 'joker';         // 万能：黑色的只能当黑牌（♠/♣），红色的只能当红牌（♥/♦）

export const BLACK = 'black';
export const RED = 'red';
// 与德州扑克一致：小王（黑）当黑桃、大王（红）当红桃 —— 交给 CardItem 渲染时用
export const JOKER_SUIT = { [BLACK]: 'spade', [RED]: 'heart' };
export const colorOf = suit => (BLACK_SUITS.includes(suit) ? BLACK : RED);
export const suitsForColor = color => (color === BLACK ? BLACK_SUITS : RED_SUITS);

// 牌型表：**按分值从高到低**排列，评估时取第一条成立的。
// 注意顺序即优先级 —— 同花(200) 现在比顺子(300) 分低，但四张牌不可能既「非同花顺的同花」
// 又「是顺子」（两者都成立就一定是同花顺，而它在前面已经命中），所以按分值排序是安全的。
// fx 是庆祝档位（与消消乐一致：3 = 最强、2 = 次强、没有 fx = 不弹庆祝浮字）
export const COMBOS = [
  { id: 'four', score: 1000, fx: 3 },          // 四条
  { id: 'straightFlush', score: 1000, fx: 3 }, // 同花顺
  { id: 'three', score: 500, fx: 2 },          // 三条
  { id: 'straight', score: 300 },              // 顺子
  { id: 'flush', score: 200 },                 // 同花
  { id: 'twoPair', score: 100 },               // 两对
  { id: 'pair', score: 50 },                   // 一对
];

export const comboById = id => COMBOS.find(c => c.id === id) || null;

// 发牌概率：Joker 只占少量
const RATE = { joker: 0.08 };

let uid = 0;
export const resetUid = () => { uid = 0; };

export const isNormal = c => !!c && c.kind === 'card';
export const isJoker = c => !!c && c.kind === JOKER;

// 一张牌在「不重复」判定里的身份
export function cardKey(card) {
  if (!card) return null;
  if (card.kind === 'card') return `${card.rank}-${card.suit}`;
  if (card.kind === JOKER) return `joker-${card.color}`;
  return null;
}

const shuffle = (list, rand) => {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

// 发牌器：从一副 52 张的牌靴里抽，**保证抽出来的牌和场上已有的不重复**
// （棋盘上永远不能出现两张一模一样的牌）；牌靴抽空就重洗，并把场上的牌排除在外。
// 两种 Joker 各只有一张，场上已有同色 Joker 时就不再抽。
export function createDealer(rand = Math.random) {
  let shoe = [];
  const refill = taken => {
    shoe = [];
    for (const suit of SUITS) {
      for (let rank = 1; rank <= RANKS; rank++) {
        if (!taken.has(`${rank}-${suit}`)) shoe.push({ rank, suit });
      }
    }
    shuffle(shoe, rand);
  };
  return {
    // used: 当前在场的牌的 cardKey 集合（棋盘 + 手牌 + 预览 + 还没翻到的牌堆）
    draw(used = new Set()) {
      const taken = used instanceof Set ? used : new Set(used);
      const r = rand();
      if (r < RATE.joker) {
        const color = rand() < 0.5 ? BLACK : RED;
        if (!taken.has(`joker-${color}`)) return { id: ++uid, kind: JOKER, color };
      }
      if (!shoe.length) refill(taken);
      while (shoe.length) {
        const c = shoe.shift();
        if (!taken.has(`${c.rank}-${c.suit}`)) return { id: ++uid, kind: 'card', rank: c.rank, suit: c.suit };
      }
      // 52 张全被占用（理论上到不了）：兜底随便给一张
      return { id: ++uid, kind: 'card', rank: 1 + Math.floor(rand() * RANKS), suit: SUITS[0] };
    },
  };
}

// ---------- 消除线 ----------

// 10 条线：4 行 + 4 列 + 2 条对角线。每条线按顺序给出格子下标
export function lineIndices() {
  const lines = [];
  for (let r = 0; r < SIZE; r++) lines.push(Array.from({ length: SIZE }, (_, c) => r * SIZE + c));
  for (let c = 0; c < SIZE; c++) lines.push(Array.from({ length: SIZE }, (_, r) => r * SIZE + c));
  lines.push(Array.from({ length: SIZE }, (_, i) => i * SIZE + i));
  lines.push(Array.from({ length: SIZE }, (_, i) => i * SIZE + (SIZE - 1 - i)));
  return lines;
}

export const LINES = lineIndices();

export function linesThrough(idx) {
  return LINES.filter(line => line.includes(idx));
}

// ---------- 牌型判定 ----------

// 4 张牌能否凑成顺子（Joker 补缺；A 可以当 1，也可以当 14 接在 J Q K 之后）
function fitsStraight(ranks, jokers) {
  if (new Set(ranks).size !== ranks.length) return false;   // 点数重复 → Joker 也救不回来
  const windows = [];
  for (let s = 1; s <= 10; s++) windows.push([s, s + 1, s + 2, s + 3]);   // 1..13
  windows.push([11, 12, 13, 14]);                                          // J Q K A（A 记 14）
  for (const win of windows) {
    const eff = ranks.map(r => (r === 1 && win.includes(14) ? 14 : r));
    if (eff.some(r => !win.includes(r))) continue;
    const missing = win.filter(r => !eff.includes(r)).length;
    if (missing <= jokers) return true;
  }
  return false;
}

// 4 张牌能否凑成两对（Joker 既能补单张成对，也能自己两两成对）
function fitsTwoPair(counts, jokers) {
  let pairs = 0;
  let singles = 0;
  for (const n of counts.values()) {
    pairs += n >> 1;
    singles += n & 1;
  }
  const useSingle = Math.min(singles, jokers);
  pairs += useSingle;
  jokers -= useSingle;
  pairs += jokers >> 1;
  return pairs >= 2;
}

// 4 张牌能不能同花：Joker 只能染成自己那一色的花色（黑只能 ♠/♣、红只能 ♥/♦），
// 所以「黑 Joker + 红 Joker」这种组合永远凑不出同花；已经确定的花色也必须在允许集合里
function fitsFlush(suits, jokerColors) {
  let allowed = new Set(SUITS);
  for (const color of jokerColors) {
    allowed = new Set([...allowed].filter(s => suitsForColor(color).includes(s)));
  }
  if (!allowed.size) return false;
  if (!suits.length) return true;
  const only = suits[0];
  return suits.every(s => s === only) && allowed.has(only);
}

// 评估一条已经放满 4 张牌的线：返回 { id, score, fx } 或 null（凑不出任何牌型）
// Joker 按「能凑出的最高分值牌型」算 —— 逐个牌型做可满足性判断，不做穷举
export function evaluateLine(cards) {
  if (!Array.isArray(cards) || cards.length !== SIZE) return null;
  if (cards.some(c => !c || (c.kind !== 'card' && c.kind !== JOKER))) return null;
  const normals = cards.filter(isNormal);
  const jokers = cards.filter(isJoker);
  const ranks = normals.map(c => c.rank);
  const suits = normals.map(c => c.suit);
  const jokerColors = jokers.map(c => c.color);
  const counts = new Map();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  const maxSame = counts.size ? Math.max(...counts.values()) : 0;

  const hit = [];
  if (new Set(ranks).size <= 1) hit.push('four');                     // 四条（只看点数，与颜色无关）
  if (fitsFlush(suits, jokerColors) && fitsStraight(ranks, jokers.length)) hit.push('straightFlush');
  if (maxSame + jokers.length >= 3) hit.push('three');                // 三条
  if (fitsFlush(suits, jokerColors)) hit.push('flush');               // 同花
  if (fitsStraight(ranks, jokers.length)) hit.push('straight');       // 顺子（花色随意）
  if (fitsTwoPair(counts, jokers.length)) hit.push('twoPair');        // 两对
  if (maxSame + jokers.length >= 2) hit.push('pair');                 // 一对

  // COMBOS 已按分值降序，取命中的第一个
  for (const combo of COMBOS) if (hit.includes(combo.id)) return { ...combo };
  return null;
}

// 场上是否还有「已经放满且能得分」的线
export function scoringLines(board) {
  const out = [];
  LINES.forEach((line, i) => {
    const cards = line.map(idx => board[idx]);
    if (cards.some(c => !c)) return;
    const combo = evaluateLine(cards);
    if (combo) out.push({ line: i, indices: [...line], combo });
  });
  return out;
}

// 局面是否已经走投无路：16 格全满、再也放不下任何牌（无尽模式的结束条件）
export function isStuck(board) {
  return board.every(Boolean);
}

// ---------- 关卡曲线 ----------
// 第 1 关 24 张牌、800 分过关；每关 +1 张牌、过关分 +50；每 10 的倍数关再多 +100。
// 牌堆不封顶：棋盘只有 16 格，牌堆继续变长本身就是难度（必须先消出空位才放得下）。
const DECK_BASE = 24;
const TARGET_BASE = 800;
const TARGET_STEP = 50;
const TENS_BONUS = 100;

export function levelConfig(level) {
  const lv = Math.max(1, Math.floor(level) || 1);
  return {
    level: lv,
    deck: DECK_BASE + (lv - 1),
    target: TARGET_BASE + (lv - 1) * TARGET_STEP + Math.floor(lv / 10) * TENS_BONUS,
  };
}
