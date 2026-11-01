// 单人麻将的纯逻辑（CommonJS 版，逐行移植自 web `src/games/solo/board.js`）。
// 故意不 require 任何东西：可以直接 `node -e "require('./mp-game/js/games/solo/board.js')"` 跑离线自检，
// 保证「每种牌不超过 4 张」「每局缺一门」「起手离胡牌只差两步、把 odds 换回 spares 就成胡」「胡牌判断」这些事。
const SUITS = ['m', 's', 'p'];        // 万 / 条 / 筒
const HONOR_COUNT = 7;                // 東南西北中發白
const COPIES = 4;                     // 每种牌 4 张 —— 整副 136 张，一局里任何牌都不会超过 4 张
const HAND_SIZE = 14;                 // 手牌 14 张 = 4 组 + 1 将
const MELD_SIZE = 3;
const WALL_SIZE = 40;                 // 牌墙最多 40 张：牌堆 10 列 × 4 层，每张都画得出来
// 每局必然缺一门；整局（手牌 + 牌墙）都不会出现这个花色，字牌照旧。
const SPARES = 2;                     // 从能胡的 14 张里拿走 2 张换掉 → 起手离胡牌两步，不是一步

// 34 个位置统一编号：m1-9 = 0-8、s1-9 = 9-17、p1-9 = 18-26、z1-7 = 27-33
const indexOf = t => (t.suit === 'm' ? 0 : t.suit === 's' ? 9 : t.suit === 'p' ? 18 : 27) + t.value - 1;
const tileOf = i => (i < 27
  ? { suit: SUITS[Math.floor(i / 9)], value: (i % 9) + 1 }
  : { suit: 'z', value: i - 26 });
const tileKey = t => `${t.suit}${t.value}`;
const sameTile = (a, b) => a.suit === b.suit && a.value === b.value;
const isHonor = t => t.suit === 'z';

/** 洗牌（Fisher-Yates，用传入的 rand，方便离线复现） */
function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 一副牌：给定花色（不含则没有那个花色）+ 字牌，每种 4 张 */
function buildPool(suits = SUITS) {
  const pool = [];
  for (const suit of suits) for (let v = 1; v <= 9; v++) for (let k = 0; k < COPIES; k++) pool.push({ suit, value: v });
  for (let v = 1; v <= HONOR_COUNT; v++) for (let k = 0; k < COPIES; k++) pool.push({ suit: 'z', value: v });
  return pool;
}

const countsOf = tiles => {
  const c = new Array(34).fill(0);
  for (const t of tiles) c[indexOf(t)]++;
  return c;
};

/**
 * 剩下的牌能不能拆成**恰好 n 组**（刻子或顺子）—— 从最小的那张开始拆是唯一正确的贪心。
 * 拆将之后调用时 n = 4。
 */
function canMeldN(c, n) {
  let i = 0;
  while (i < 34 && c[i] === 0) i++;
  if (n === 0) return i === 34;
  if (i === 34) return false;
  if (c[i] >= MELD_SIZE) {                       // 刻子
    c[i] -= MELD_SIZE;
    const ok = canMeldN(c, n - 1);
    c[i] += MELD_SIZE;
    if (ok) return true;
  }
  if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {   // 顺子（字牌不能连）
    c[i]--; c[i + 1]--; c[i + 2]--;
    const ok = canMeldN(c, n - 1);
    c[i]++; c[i + 1]++; c[i + 2]++;
    if (ok) return true;
  }
  return false;
}

/** 七对子 */
const isSevenPairs = c => c.reduce((n, x) => n + (x === 2 ? 1 : 0), 0) === 7 && c.every(x => x % 2 === 0);

/** 胡牌：4 组 + 1 将，或者七对子。手牌必须是 14 张。 */
function isWin(tiles) {
  if (tiles.length !== HAND_SIZE) return false;
  const c = countsOf(tiles);
  if (c.some(n => n > COPIES || n < 0)) return false;
  if (isSevenPairs(c)) return true;
  for (let i = 0; i < 34; i++) {
    if (c[i] < 2) continue;
    c[i] -= 2;                                   // 试着把这一对当将
    const ok = canMeldN(c, 4);
    c[i] += 2;
    if (ok) return true;
  }
  return false;
}

/** 13 张听哪些牌（返回能胡的牌数组）—— 发牌自检与「只差一张」的保证都靠它 */
function waits(tiles13) {
  if (tiles13.length !== HAND_SIZE - 1) return [];
  const c = countsOf(tiles13);
  const out = [];
  for (let i = 0; i < 34; i++) {
    if (c[i] >= COPIES) continue;                 // 手上已经有 4 张，摸不到第 5 张
    const next = [...tiles13, tileOf(i)];
    if (isWin(next)) out.push(tileOf(i));
  }
  return out;
}

/** 手牌排序：万 → 条 → 筒 → 字，同花色按点数 */
const sortTiles = tiles => tiles.slice().sort((a, b) => indexOf(a) - indexOf(b));

/** 造一副能胡的 14 张（从池子里取，保证不超过 4 张） */
function makeWinningHand(pool, rand) {
  const avail = countsOf(pool);
  const used = new Array(34).fill(0);
  const take = i => { if (avail[i] - used[i] <= 0) return false; used[i]++; return true; };
  for (let attempt = 0; attempt < 200; attempt++) {
    used.fill(0);
    let ok = true;
    for (let m = 0; m < 4 && ok; m++) {
      const triple = rand() < 0.55;
      const cands = [];
      for (let i = 0; i < 34; i++) {
        if (triple) { if (avail[i] - used[i] >= 3) cands.push({ i, kind: 't' }); }
        else if (i < 27 && i % 9 <= 6 && [0, 1, 2].every(k => avail[i + k] - used[i + k] > 0)) cands.push({ i, kind: 'r' });
      }
      if (!cands.length) { ok = false; break; }
      const pick = cands[Math.floor(rand() * cands.length)];
      if (pick.kind === 't') { if (!take(pick.i) || !take(pick.i) || !take(pick.i)) ok = false; }
      else if (![0, 1, 2].every(k => take(pick.i + k))) ok = false;
    }
    if (!ok) continue;
    const pairs = [];
    for (let i = 0; i < 34; i++) if (avail[i] - used[i] >= 2) pairs.push(i);
    if (!pairs.length) continue;
    const p = pairs[Math.floor(rand() * pairs.length)];
    if (!take(p) || !take(p)) continue;
    return Array.from({ length: 34 }, (_, i) => Array.from({ length: used[i] }, () => tileOf(i))).flat();
  }
  return null;
}

/**
 * 发一局。先造一副能胡的 14 张，再拿走 SPARES 张换成池子里不相干的 odds ——
 * 于是「把 odds 换回 spares 就成胡」，两张 spare 都埋在牌墙前 needBy 张内。
 * @returns {{hand:object[], wall:object[], wallCount:number, omitted:string|null,
 *   need:object|null, odd:object|null, spares:object[], odds:object[], plan:object}}
 */
function newRound(rand = Math.random, streak = 0) {
  const plan = roundPlan(streak);
  const omitSuit = SUITS[Math.floor(rand() * SUITS.length)];   // 每局必然缺一个花色
  const suits = SUITS.filter(s => s !== omitSuit);
  const pool = buildPool(suits);

  const winning = makeWinningHand(pool, rand);
  if (!winning) {                                 // 理论上不会发生，兜底给一副整副重来
    return newRound(() => 0.5, streak);
  }
  const hand = winning.slice();
  const spares = [];
  for (let i = 0; i < SPARES && hand.length > 1; i++) {
    spares.push(hand.splice(Math.floor(rand() * hand.length), 1)[0]);
  }
  const left = pool.slice();
  for (const t of hand) {
    const at = left.findIndex(x => sameTile(x, t));
    if (at >= 0) left.splice(at, 1);
  }
  const odds = [];
  for (let i = 0; i < spares.length; i++) {
    // 优先挑手牌与已选 odds 里都没有的，逼玩家必须打掉它
    const cands = left.filter(t => !hand.some(h => sameTile(h, t)) && !odds.some(o => sameTile(o, t)));
    const pickFrom = cands.length ? cands : left;
    if (!pickFrom.length) break;
    const odd = pickFrom[Math.floor(rand() * pickFrom.length)];
    odds.push(odd);
    const at = left.findIndex(x => sameTile(x, odd));
    if (at >= 0) left.splice(at, 1);
  }
  hand.push(...odds);

  // 牌墙：把 spares 都埋进去（都在前 plan.needBy 张之内），再补到 plan.wallSize 张
  const wallPool = left.filter(t => !spares.some(sp => sameTile(sp, t)));
  const wall = shuffle(wallPool, rand).slice(0, Math.max(0, plan.wallSize - spares.length));
  spares.forEach((sp, i) => {
    const at = Math.min(1 + Math.floor(rand() * Math.max(1, plan.needBy - 1)) + i, Math.max(1, wall.length));
    wall.splice(Math.min(at, wall.length), 0, sp);
  });

  return {
    hand: sortTiles(hand), wall, wallCount: wall.length, omitted: omitSuit,
    need: spares[0], odd: odds[0], spares, odds, plan,
  };
}

/** 发出来的手牌本身不能已经是胡牌（否则一开局就赢了）；真撞上就重发 */
function newRoundSafe(rand = Math.random, streak = 0) {
  for (let i = 0; i < 50; i++) {
    const r = newRound(rand, streak);
    if (!isWin(r.hand)) return r;
  }
  return newRound(rand, streak);
}

/**
 * 按当前连胜给出本局难度：牌墙越来越短、需要的那张牌埋得越来越深。
 * 连胜 12 之后不再加难；无论哪一档，「把 odds 换回 spares 就成胡」都成立。
 */
const RAMP = [
  { streak: 0, wallSize: 40, needBy: 8 },
  { streak: 2, wallSize: 36, needBy: 10 },
  { streak: 4, wallSize: 32, needBy: 12 },
  { streak: 7, wallSize: 28, needBy: 15 },
  { streak: 10, wallSize: 24, needBy: 18 },
];
function roundPlan(streak = 0) {
  const s = Math.max(0, Math.floor(streak) || 0);
  let plan = RAMP[0];
  for (const r of RAMP) if (s >= r.streak) plan = r;
  return plan;
}

/** 打出第 index 张（纯函数） */
const discardAt = (hand, index) => hand.filter((_, i) => i !== index);

module.exports = {
  SUITS,
  HONOR_COUNT,
  COPIES,
  HAND_SIZE,
  MELD_SIZE,
  WALL_SIZE,
  SPARES,
  indexOf,
  tileOf,
  tileKey,
  sameTile,
  isHonor,
  shuffle,
  buildPool,
  isWin,
  waits,
  sortTiles,
  newRound,
  newRoundSafe,
  RAMP,
  roundPlan,
  discardAt,
};
