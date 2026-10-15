// 赌神（God of Gamblers）纯逻辑：**不 import 任何东西**，方便离线脚本直接跑。
//
// 玩法：展示区给一副 13 张、已听牌的手牌（不含东南西北中发白，可含花牌），
// 玩家要从下方全牌面里挑出**所有**能让它胡牌的牌，必须全中、不能遗漏。
//
// 牌面 key：'m1'~'m9' 万 / 's1'~'s9' 条 / 'p1'~'p9' 筒 / 'z1'~'z7' 字（本作不用）/ 'f1'~'f8' 花牌。
// - 手牌与选择区都只用 m/s/p（三门 27 种）；字牌既不进手牌也不进选择区（玩家要求去掉）。
// - 花牌是**万能牌**：参与组合时能当任意一张 m/s/p 用，但不能让某一种牌超过 4 张。
// - 单张牌总数上限 4：手牌里已有 4 张同种 → 选择区里那张置灰不可选，胡牌判定同样卡这个上限。

export const SUITS = ['m', 's', 'p'];
export const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const MAX_PER_KIND = 4;
export const HAND_SIZE = 13;

// 三门 27 种（手牌只能用这些）
export const KIND_KEYS = SUITS.flatMap(s => NUMBERS.map(n => `${s}${n}`));
// 字牌：本作**不再展示**（玩家要求选择区去掉字牌），保留常量仅供脚本/未来参考
export const HONOR_KEYS = Array.from({ length: 7 }, (_, i) => `z${i + 1}`);
// 选择区展示的全牌面：三门 27 张（不含字牌、不含花牌）
export const SELECT_KEYS = [...KIND_KEYS];
// 花牌（万能牌）
export const FLOWER_KEYS = Array.from({ length: 8 }, (_, i) => `f${i + 1}`);

export const isFlower = key => typeof key === 'string' && key[0] === 'f';
export const isHonor = key => typeof key === 'string' && key[0] === 'z';

// 'm5' → { suit, value }（MahjongTile 用；花牌是 'f1' → suit 'f' / value 1）
export function faceOf(key) {
  return { suit: key[0], value: +key.slice(1) };
}

// 手牌 → { counts: {kind: n}, jokers: n }（花牌单独计数）
export function handCounts(hand) {
  const counts = {};
  let jokers = 0;
  for (const key of hand) {
    if (isFlower(key)) jokers += 1;
    else counts[key] = (counts[key] || 0) + 1;
  }
  return { counts, jokers };
}

// 展示顺序：三门按 m/s/p、点数从小到大，花牌排最后
export function sortHand(hand) {
  const order = k => (isFlower(k) ? 100 + +k.slice(1) : KIND_KEYS.indexOf(k));
  return hand.slice().sort((a, b) => order(a) - order(b));
}

export function isBlocked(kind, counts) {
  return (counts[kind] || 0) >= MAX_PER_KIND;
}

// ---------- 和牌判定（花牌当万能牌） ----------
//
// 统一用「数拆法」实现：canWin 就是「拆法数 ≥ 1」，生成器挑复杂度时复用同一个函数（带上限省时间）。
// jokers 张花牌当万能牌；subs 记录「已经用花牌顶替了哪种牌几张」——
// 顶替也要计入该种牌的总数，保证任何一种都不会超过 4 张。

function dec(counts, key, n) {
  const next = { ...counts };
  next[key] = (next[key] || 0) - n;
  if (next[key] <= 0) delete next[key];
  return next;
}

function countMelds(counts, jokers, subs, cap) {
  let first = -1;
  for (let i = 0; i < KIND_KEYS.length; i++) {
    if ((counts[KIND_KEYS[i]] || 0) > 0) { first = i; break; }
  }
  if (first === -1) return jokers === 0 ? 1 : 0;      // 牌用完，且万能牌必须全部参与组合
  const k = KIND_KEYS[first];
  const n = counts[k];
  const own = n + (subs[k] || 0);
  let total = 0;

  // ① 刻子：3 张同种（缺的用万能牌补；补进去也算该种牌，不能超过 4 张）
  for (let use = 0; use <= 2; use++) {
    const fromHand = 3 - use;
    if (n < fromHand || jokers < use) continue;
    if (own + use > MAX_PER_KIND) continue;
    const nextSubs = use > 0 ? { ...subs, [k]: (subs[k] || 0) + use } : subs;
    total += countMelds(dec(counts, k, fromHand), jokers - use, nextSubs, cap);
    if (total >= cap) return total;
  }

  // ② 顺子：同门连续三张，缺的用万能牌补（同样累计到该种牌的头上）
  const suit = k[0];
  const num = +k.slice(1);
  for (let start = Math.max(1, num - 2); start <= Math.min(7, num); start++) {
    const keys = [start, start + 1, start + 2].map(v => `${suit}${v}`);
    let need = 0;
    let ok = true;
    let next = { ...counts };
    let nextSubs = subs;
    for (const key of keys) {
      if ((next[key] || 0) > 0) {
        next = dec(next, key, 1);
      } else {
        // 这张靠花牌顶替：顶替后该种牌的总数是「手里有的 + 已经顶替的 + 这一张」
        if ((counts[key] || 0) + (subs[key] || 0) + 1 > MAX_PER_KIND) { ok = false; break; }
        nextSubs = nextSubs === subs ? { ...subs } : nextSubs;
        nextSubs[key] = (nextSubs[key] || 0) + 1;
        need += 1;
      }
    }
    if (!ok || need > jokers) continue;
    total += countMelds(next, jokers - need, nextSubs, cap);
    if (total >= cap) return total;
  }
  return total;
}

// counts（非花牌）+ jokers（花牌张数）能不能和牌（4 组面子 + 1 对将）；cap 用来提前收手
export function countWins(counts, jokers = 0, cap = 1) {
  // 玩家要求「胡牌判定同样要求单张牌不能超过 4 张」——超限的输入直接判不和，
  // 不去依赖调用方「手里每种种都 ≤4」这个隐含前提
  for (const key of KIND_KEYS) {
    if ((counts[key] || 0) > MAX_PER_KIND) return 0;
  }
  if (jokers > MAX_PER_KIND) return 0;
  let total = 0;
  for (const k of KIND_KEYS) {
    const n = counts[k] || 0;
    // 将：两张同种
    if (n >= 2) {
      total += countMelds(dec(counts, k, 2), jokers, {}, cap - total);
      if (total >= cap) return total;
    }
    // 将：一张 + 一张花牌
    if (n === 1 && jokers >= 1 && n + 1 <= MAX_PER_KIND) {
      total += countMelds(dec(counts, k, 1), jokers - 1, { [k]: 1 }, cap - total);
      if (total >= cap) return total;
    }
    // 将：两张都是花牌
    if (n === 0 && jokers >= 2 && jokers <= MAX_PER_KIND) {
      total += countMelds({ ...counts }, jokers - 2, { [k]: 2 }, cap - total);
      if (total >= cap) return total;
    }
  }
  return total;
}

export const canWin = (counts, jokers = 0) => countWins(counts, jokers, 1) > 0;

// 所有能让这副手牌和牌的牌（只从三门里挑）：单种已满 4 张的既不是答案也不能选
export function winningPicks(counts, jokers = 0) {
  const picks = [];
  for (const key of KIND_KEYS) {
    if (isBlocked(key, counts)) continue;
    if (canWin({ ...counts, [key]: (counts[key] || 0) + 1 }, jokers)) picks.push(key);
  }
  return picks;
}

// ---------- 关卡难度 ----------
//
// 三样一起爬：① 花牌（万能牌）张数；② 答案个数（玩家必须找全，越多越难）；
// ③ 形状复杂度（生成时按「拆法数量」挑，见 newRound）。
export const MAX_LEVEL = 99;
const RAMP = [[1, 1], [3, 1], [4, 2], [7, 2], [8, 3], [12, 4], [18, 5], [26, 6]];
export function levelConfig(level) {
  const lv = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level) || 1));
  let jokers = 0;
  if (lv >= 12) jokers = 2;
  else if (lv >= 5) jokers = 1;
  let minPicks = 1;
  let maxPicks = 1;
  for (const [from, n] of RAMP) {
    if (lv >= from) { minPicks = n; maxPicks = n; }
  }
  maxPicks = Math.min(8, maxPicks + 1);      // 留一点弹性，免得同一关永远同一个答案数
  return { level: lv, jokers, minPicks, maxPicks, candidates: 40 };
}

// ---------- 生成一副听牌手牌 ----------

const pickOne = (list, rand) => list[Math.floor(rand() * list.length)];
function shuffle(list, rand) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// 随机攒一副「4 组面子 + 1 对将」的 14 张（同种不超 4 张）
function buildWinningHand(rand) {
  const counts = {};
  const add = (key, n) => {
    if ((counts[key] || 0) + n > MAX_PER_KIND) return false;
    counts[key] = (counts[key] || 0) + n;
    return true;
  };
  if (!add(pickOne(KIND_KEYS, rand), 2)) return null;
  for (let m = 0; m < 4; m++) {
    let done = false;
    for (let attempt = 0; attempt < 40 && !done; attempt++) {
      if (rand() < 0.45) {
        if (add(pickOne(KIND_KEYS, rand), 3)) done = true;
      } else {
        const suit = pickOne(SUITS, rand);
        const start = 1 + Math.floor(rand() * 7);
        const keys = [start, start + 1, start + 2].map(v => `${suit}${v}`);
        if (keys.every(k => (counts[k] || 0) < MAX_PER_KIND)) {
          for (const k of keys) add(k, 1);
          done = true;
        }
      }
    }
    if (!done) return null;
  }
  const tiles = [];
  for (const key of KIND_KEYS) for (let i = 0; i < (counts[key] || 0); i++) tiles.push(key);
  return tiles;
}

// 生成一关：{ level, hand, counts, jokers, picks, blocked }
// rand 可注入（离线脚本用固定种子，浏览器传 Math.random）
export function newRound(level, rand = Math.random) {
  const cfg = levelConfig(level);
  let best = null;
  for (let attempt = 0; attempt < cfg.candidates; attempt++) {
    const fourteen = buildWinningHand(rand);
    if (!fourteen) continue;
    const tiles = fourteen.slice();
    // 花牌：从这 14 张里挑 jokerCount 张换成花牌（每关最多 cfg.jokers 张）
    const jokerCount = cfg.jokers > 0 ? Math.floor(rand() * (cfg.jokers + 1)) : 0;
    if (jokerCount > 0) {
      const flowers = shuffle(FLOWER_KEYS, rand).slice(0, jokerCount);
      const idxs = shuffle(tiles.map((_, i) => i), rand).slice(0, jokerCount);
      idxs.forEach((idx, i) => { tiles[idx] = flowers[i]; });
    }
    // 去掉一张 → 13 张听牌（去掉的这张就是「答案之一」）
    tiles.splice(Math.floor(rand() * tiles.length), 1);
    const { counts, jokers } = handCounts(tiles);
    const picks = winningPicks(counts, jokers);
    if (!picks.length) continue;
    // 复杂度：把这张手牌补成和牌后有多少种拆法（越多越难看穿）
    const shape = countWins({ ...counts, [picks[0]]: (counts[picks[0]] || 0) + 1 }, jokers, 24);
    const score = picks.length * 2 + shape + jokers * 1.5 + (13 - Object.keys(counts).length) * 0.2;
    const inRange = picks.length >= cfg.minPicks && picks.length <= cfg.maxPicks;
    const cand = { hand: sortHand(tiles), counts, jokers, picks, level: cfg.level, score, inRange };
    if (!best || (inRange && !best.inRange) || (inRange === best.inRange && score > best.score)) best = cand;
    if (best.inRange && best.score > 26) break;
  }
  if (!best) {
    // 兜底：一副必然成立的简单听牌（4 组面子 + 对将，去掉一张万子）
    const hand = ['m1', 'm1', 'm1', 'm3', 'm4', 'm5', 's2', 's3', 's4', 'p5', 'p5', 'p5', 'm7'];
    const { counts, jokers } = handCounts(hand);
    best = { hand: sortHand(hand), counts, jokers, level: levelConfig(level).level,
      picks: winningPicks(counts, jokers), score: 0, inRange: true };
  }
  return {
    level: best.level,
    hand: best.hand,
    counts: best.counts,
    jokers: best.jokers,
    picks: best.picks,
    blocked: SELECT_KEYS.filter(k => isBlocked(k, best.counts)),
  };
}
