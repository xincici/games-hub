// 扑克炼金术 · 纯逻辑（CommonJS，可直接被 Node require 做单元测试）。
// 移植自 web `src/games/alchemy/board.js`：
//   - 炼金 4×4：16 格、10 条线（4 行 + 4 列 + 2 斜），四条 / 同花顺 1000、三条 500、
//     顺子 300、同花 200、两对 100、一对 50；Joker 万能但受颜色约束。
//   - 炸金花 3×3：9 格、8 条线（3 行 + 3 列 + 2 斜），豹子 1000、同花顺 800、同花 500、
//     顺子 400、一对 200；散牌不计分；标准 52 张、无 Joker。
//
// 牌面渲染统一走 core/cards.js：普通牌 item = { num: rank, type: suit }，
// Joker item = { num: 14, type: color === 'black' ? 'spade' : 'heart' }（与 web JOKER_SUIT 一致）。

const SIZE = 4;
const CELLS = SIZE * SIZE;       // 16
const SIZE3 = 3;
const CELLS3 = SIZE3 * SIZE3;    // 9
const PREVIEW = 2;               // 除当前手牌外，还能看到下两张

const SUITS = ['heart', 'diamond', 'spade', 'club'];
const BLACK_SUITS = ['spade', 'club'];
const RED_SUITS = ['heart', 'diamond'];
const RANKS = 13;                // A(1) … K(13)
const MAX_DECK = 52;             // 炸金花一副牌的上限

const JOKER = 'joker';
const BLACK = 'black';
const RED = 'red';
// 与德州扑克一致：黑色 Joker 用 ♠ 渲染、红色 Joker 用 ♥ 渲染。
const JOKER_SUIT = { [BLACK]: 'spade', [RED]: 'heart' };
const colorOf = suit => (BLACK_SUITS.indexOf(suit) >= 0 ? BLACK : RED);
const suitsForColor = color => (color === BLACK ? BLACK_SUITS : RED_SUITS);

// 牌型表：**按分值从高到低**排列，评估时取第一条成立的（顺序即优先级）。
// fx 是庆祝档位（3 最强 / 2 次强 / 没有 fx 只弹基础浮字）。
const COMBOS = [
  { id: 'four', score: 1000, fx: 3 },          // 四条
  { id: 'straightFlush', score: 1000, fx: 3 }, // 同花顺
  { id: 'three', score: 500, fx: 2 },          // 三条
  { id: 'straight', score: 300 },              // 顺子
  { id: 'flush', score: 200 },                 // 同花
  { id: 'twoPair', score: 100 },               // 两对
  { id: 'pair', score: 50 },                   // 一对
];

const ZJH_COMBOS = [
  { id: 'baozi', score: 1000, fx: 3 },          // 豹子
  { id: 'straightFlush', score: 800, fx: 3 },   // 同花顺
  { id: 'flush', score: 500, fx: 2 },           // 同花
  { id: 'straight', score: 400, fx: 2 },        // 顺子
  { id: 'pair', score: 200, fx: 1 },            // 一对
];

const ZJH_COMBO_BONUS = 200;   // 一次消多组：从第 2 组起每组再加 200
const ZJH_CHAIN_STEP = 100;    // 连击：从第 2 连起每连再加 100

const comboById = id => COMBOS.find(c => c.id === id) || ZJH_COMBOS.find(c => c.id === id) || null;
const zjhComboBonus = groups => Math.max(0, groups - 1) * ZJH_COMBO_BONUS;
const zjhChainBonus = chain => Math.max(0, chain - 1) * ZJH_CHAIN_STEP;

// ---------- 牌的表示 ----------
// 普通牌 { kind:'card', rank, suit }；Joker { kind:'joker', color:'black'|'red' }。
const isNormal = c => !!c && c.kind === 'card';
const isJoker = c => !!c && c.kind === JOKER;
const isCard = c => isNormal(c) && Number.isInteger(c.rank) && c.rank >= 1 && c.rank <= RANKS
  && SUITS.indexOf(c.suit) >= 0;
const isPlainCard = isCard;
const isAnyCard = c => isCard(c) || isJoker(c);

// 一张牌在「不重复」判定里的身份
function cardKey(card) {
  if (!card) return null;
  if (isNormal(card)) return isCard(card) ? `${card.rank}-${card.suit}` : null;
  if (isJoker(card)) return `joker-${card.color}`;
  return null;
}

function createCard(rank, suit) { return { kind: 'card', rank, suit }; }
function createJoker(color) { return { kind: JOKER, color: color === RED ? RED : BLACK }; }

function shuffle(list, rand) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// 一副标准 52 张（无 Joker），炸金花用。
function createDeck(rand = Math.random) {
  const deck = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= RANKS; rank++) deck.push(createCard(rank, suit));
  }
  return shuffle(deck, rand);
}

// 发牌概率：Joker 只占少量（与 web 一致）。
const RATE = { joker: 0.08 };

// 炼金发牌器：从一副 52 张的牌靴里抽，**保证抽出来的牌和场上已有的不重复**
// （棋盘上永远不能出现两张一模一样的牌）；牌靴抽空就重洗，并把场上的牌排除在外。
// 两种 Joker 各只有一张，场上已有同色 Joker 时就不再抽。
function createDealer(rand = Math.random) {
  let shoe = [];
  const refill = (taken) => {
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
    draw(used) {
      const taken = used instanceof Set ? used : new Set(used || []);
      const r = rand();
      if (r < RATE.joker) {
        const color = rand() < 0.5 ? BLACK : RED;
        if (!taken.has(`joker-${color}`)) return createJoker(color);
      }
      if (!shoe.length) refill(taken);
      while (shoe.length) {
        const c = shoe.shift();
        if (!taken.has(`${c.rank}-${c.suit}`)) return createCard(c.rank, c.suit);
      }
      // 54 张唯一牌全被占用（理论上只会在超长牌堆出现）：兜底随便给一张
      return createCard(1 + Math.floor(rand() * RANKS), SUITS[0]);
    },
  };
}

// ---------- 消除线 ----------

function lineIndices(size) {
  const lines = [];
  for (let r = 0; r < size; r++) lines.push(Array.from({ length: size }, (_, c) => r * size + c));
  for (let c = 0; c < size; c++) lines.push(Array.from({ length: size }, (_, r) => r * size + c));
  lines.push(Array.from({ length: size }, (_, i) => i * size + i));
  lines.push(Array.from({ length: size }, (_, i) => i * size + (size - 1 - i)));
  return lines;
}

const LINES = lineIndices(SIZE);
const LINES3 = lineIndices(SIZE3);

// ---------- 四张牌（炼金，含 Joker） ----------

// 四张普通点数能否凑成顺子（Joker 补缺；A 可当 1，也可当 14 接在 J Q K 之后）。
function fitsStraight(ranks, jokers) {
  if (new Set(ranks).size !== ranks.length) return false;   // 点数重复 → Joker 也救不回来
  if (!ranks.length) return jokers >= 4;
  const windows = [];
  for (let s = 1; s <= 10; s++) windows.push([s, s + 1, s + 2, s + 3]);   // 1..13
  windows.push([11, 12, 13, 14]);                                          // J Q K A（A 记 14）
  for (const win of windows) {
    const eff = ranks.map(r => (r === 1 && win.indexOf(14) >= 0 ? 14 : r));
    if (eff.some(r => win.indexOf(r) < 0)) continue;
    const missing = win.filter(r => eff.indexOf(r) < 0).length;
    if (missing <= jokers) return true;
  }
  return false;
}

// 四张牌能否凑成两对（Joker 既能补单张成对，也能自己两两成对）
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

// 四张牌能不能同花：Joker 只能染成自己那一色的花色（黑只能 ♠/♣、红只能 ♥/♦），
// 所以「黑 Joker + 红 Joker」这种组合永远凑不出同花；已经确定的花色也必须在允许集合里。
function fitsFlush(suits, jokerColors) {
  let allowed = new Set(SUITS);
  for (const color of jokerColors) {
    const ok = suitsForColor(color);
    allowed = new Set([...allowed].filter(s => ok.indexOf(s) >= 0));
  }
  if (!allowed.size) return false;
  if (!suits.length) return true;
  const only = suits[0];
  return suits.every(s => s === only) && allowed.has(only);
}

function countRanks(cards) {
  const counts = new Map();
  for (const c of cards) {
    if (!isNormal(c)) continue;
    counts.set(c.rank, (counts.get(c.rank) || 0) + 1);
  }
  return counts;
}

// 评估一条放满 4 张牌的线：返回 { id, score, fx } 或 null（凑不出任何牌型）。
// Joker 按「能凑出的最高分值牌型」算 —— 逐个牌型做可满足性判断，不做穷举。
function evaluateLine(cards) {
  if (!Array.isArray(cards) || cards.length !== SIZE) return null;
  if (cards.some(c => !isAnyCard(c))) return null;
  const normals = cards.filter(isNormal);
  const jokers = cards.filter(isJoker);
  const ranks = normals.map(c => c.rank);
  const suits = normals.map(c => c.suit);
  const jokerColors = jokers.map(c => c.color);
  const counts = countRanks(cards);
  const maxSame = counts.size ? Math.max(...counts.values()) : 0;

  const hit = [];
  if (new Set(ranks).size <= 1) hit.push('four');                     // 四条（只看点数，与颜色无关）
  if (fitsFlush(suits, jokerColors) && fitsStraight(ranks, jokers.length)) hit.push('straightFlush');
  if (maxSame + jokers.length >= 3) hit.push('three');                // 三条
  if (fitsFlush(suits, jokerColors)) hit.push('flush');               // 同花
  if (fitsStraight(ranks, jokers.length)) hit.push('straight');       // 顺子（花色随意）
  if (fitsTwoPair(counts, jokers.length)) hit.push('twoPair');        // 两对
  if (maxSame + jokers.length >= 2) hit.push('pair');                 // 一对

  for (const combo of COMBOS) if (hit.indexOf(combo.id) >= 0) return { ...combo };
  return null;
}

// 场上所有「已经放满且能得分」的线。
function scoringLines(grid) {
  const out = [];
  if (!Array.isArray(grid)) return out;
  LINES.forEach((line, i) => {
    const cards = line.map(idx => grid[idx]);
    if (cards.some(c => !c)) return;
    const combo = evaluateLine(cards);
    if (combo) out.push({ line: i, indices: [...line], combo });
  });
  return out;
}

// ---------- 三张牌（炸金花） ----------

// 豹子 > 同花顺 > 同花 > 顺子 > 一对；散牌返回 null。A 可当 1（A23）也可接 K（QKA）。
function evaluateTrio(cards) {
  if (!Array.isArray(cards) || cards.length !== SIZE3 || cards.some(c => !isPlainCard(c))) return null;
  const ranks = cards.map(c => c.rank).sort((a, b) => a - b);
  const suits = cards.map(c => c.suit);
  const counts = new Map();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  const maxSame = Math.max(...counts.values());
  const flush = suits.every(s => s === suits[0]);

  let straight = false;
  if (counts.size === 3) {
    if (ranks[1] === ranks[0] + 1 && ranks[2] === ranks[1] + 1) straight = true;
    // Q K A：点数记成 1 / 12 / 13
    if (ranks[0] === 1 && ranks[1] === 12 && ranks[2] === 13) straight = true;
  }

  const hit = [];
  if (maxSame === 3) hit.push('baozi');
  if (flush && straight) hit.push('straightFlush');
  if (flush) hit.push('flush');
  if (straight) hit.push('straight');
  if (maxSame === 2) hit.push('pair');

  for (const combo of ZJH_COMBOS) if (hit.indexOf(combo.id) >= 0) return { ...combo };
  return null;
}

function scoringLines3(grid) {
  const out = [];
  if (!Array.isArray(grid)) return out;
  LINES3.forEach((line, i) => {
    const cards = line.map(idx => grid[idx]);
    if (cards.some(c => !c)) return;
    const combo = evaluateTrio(cards);
    if (combo) out.push({ line: i, indices: [...line], combo });
  });
  return out;
}

// ---------- 关卡曲线 ----------
// 炼金：第 1 关 24 张 / 800 分；每关 +1 张、过关分 +50；每 10 的倍数关再多 +100。
// 牌数不封顶：棋盘只有 16 格，牌堆继续变长本身就是难度（与 web 一致）。
function levelConfig(level) {
  const lv = Math.max(1, Math.floor(level) || 1);
  return {
    level: lv,
    deck: 24 + (lv - 1),
    target: 800 + (lv - 1) * 50 + Math.floor(lv / 10) * 100,
  };
}

// 炸金花：第 1 关 18 张 / 1200 分；每关 +1 张、过关分 +100；逢 5 的整数关 +2 张，封顶 52。
function zjhLevelConfig(level) {
  const lv = Math.max(1, Math.floor(level) || 1);
  return {
    level: lv,
    deck: Math.min(MAX_DECK, 18 + (lv - 1) + Math.floor(lv / 5)),
    target: 1200 + (lv - 1) * 100,
  };
}

module.exports = {
  SIZE, CELLS, SIZE3, CELLS3, PREVIEW, SUITS, BLACK_SUITS, RED_SUITS, RANKS, MAX_DECK,
  JOKER, BLACK, RED, JOKER_SUIT, colorOf, suitsForColor,
  COMBOS, ZJH_COMBOS, comboById,
  ZJH_COMBO_BONUS, ZJH_CHAIN_STEP, zjhComboBonus, zjhChainBonus,
  isNormal, isJoker, isCard, isPlainCard, isAnyCard, cardKey,
  createCard, createJoker, createDeck, createDealer,
  LINES, LINES3, lineIndices,
  fitsStraight, fitsTwoPair, fitsFlush, evaluateLine, scoringLines,
  evaluateTrio, scoringLines3,
  levelConfig, zjhLevelConfig,
};
