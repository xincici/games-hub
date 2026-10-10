// 雀圣 纯逻辑：发一副「能赢的手牌」（4 组 + 1 将）、随机铺到 5×5 棋盘、按方向滑动、
// 找出所有可消除的牌组、以及关卡曲线。
//
// 牌：{ suit: 'm' 万 | 'p' 筒 | 's' 条 | 'z' 字, num }
//   万 / 筒 / 条：num 1~9（顺子要求同一花色、三张点数连续）
//   字牌：num 1东 2南 3西 4北 5中 6發 7白（只有刻子，没有顺子）

export const SIZE = 5;
export const CELLS = SIZE * SIZE;
export const MELD_COUNT = 4;                 // 4 组（顺子或刻子）
export const HAND_TILES = MELD_COUNT * 3 + 2; // 14 张
export const COPIES_MAX = 4;                 // 单张牌一局最多 4 张

export const SUITS = ['m', 'p', 's', 'z'];
export const NUM_MAX = { m: 9, p: 9, s: 9, z: 7 };
export const DRAGONS = [5, 6, 7];            // 中 / 發 / 白
export const WINDS = [1, 2, 3, 4];           // 东 / 南 / 西 / 北

export const DIRS = {
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
};

let uid = 0;
export const resetUid = () => { uid = 0; };
export const makeTile = (suit, num) => ({ id: ++uid, suit, num });
export const kindKey = t => `${t.suit}${t.num}`;
export const sameKind = (a, b) => !!a && !!b && a.suit === b.suit && a.num === b.num;
export const isHonor = t => t.suit === 'z';

// 牌名（给 i18n / 调试用；牌面上的字是画出来的，不依赖这里）
const CN_DIGITS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const HONOR_CN = ['东', '南', '西', '北', '中', '发', '白'];
const HONOR_EN = ['East', 'South', 'West', 'North', 'Red', 'Green', 'White'];
export function tileName(t, lang = 'cn') {
  if (t.suit === 'z') return lang === 'cn' ? HONOR_CN[t.num - 1] : HONOR_EN[t.num - 1];
  const suitCn = { m: '万', p: '筒', s: '条' }[t.suit];
  const suitEn = { m: 'characters', p: 'dots', s: 'bamboo' }[t.suit];
  return lang === 'cn' ? `${CN_DIGITS[t.num - 1]}${suitCn}` : `${t.num} ${suitEn}`;
}

// ---------- 判牌 ----------

// 三张能组成一组：刻子（三张相同）或顺子（同花色、点数连续、不含字牌）
export function isMeld(tiles) {
  if (!Array.isArray(tiles) || tiles.length !== 3 || tiles.some(t => !t)) return null;
  const [a, b, c] = tiles;
  if (a.suit === b.suit && b.suit === c.suit && a.num === b.num && b.num === c.num) {
    return { type: 'triplet' };
  }
  if (a.suit === 'z') return null;
  if (a.suit !== b.suit || b.suit !== c.suit) return null;
  const ns = [a.num, b.num, c.num].sort((x, y) => x - y);
  if (ns[0] + 1 === ns[1] && ns[1] + 1 === ns[2]) return { type: 'run' };
  return null;
}

// 两张组成将（对子）
export const isPair = tiles => (Array.isArray(tiles) && tiles.length === 2
  && tiles.every(Boolean) && sameKind(tiles[0], tiles[1]) ? { type: 'pair' } : null);

// ---------- 发牌 ----------

// 所有可能的「组」：34 种刻子 + 3 个花色各 7 个顺子
function allMelds() {
  const out = [];
  for (const suit of SUITS) {
    for (let n = 1; n <= NUM_MAX[suit]; n++) out.push([[suit, n], [suit, n], [suit, n]]);
    if (suit === 'z') continue;
    for (let n = 1; n + 2 <= 9; n++) out.push([[suit, n], [suit, n + 1], [suit, n + 2]]);
  }
  return out;
}
const MELD_POOL = allMelds();

const countOf = (counts, suit, num) => counts.get(`${suit}${num}`) || 0;

// 一组牌每种牌各需要几张（刻子三张、顺子每张各一）
function meldNeed(group) {
  const need = new Map();
  group.forEach(([s, n]) => {
    const k = `${s}${n}`;
    need.set(k, (need.get(k) || 0) + 1);
  });
  return need;
}

// 这组牌能否加进当前已发的牌（每种不超过 4 张）
const meldFits = (group, counts) => [...meldNeed(group).entries()]
  .every(([k, v]) => (counts.get(k) || 0) + v <= COPIES_MAX);

// 发一副能赢的手牌：4 组（顺子/刻子）+ 1 将，且每种牌不超过 4 张
export function dealHand(rand = Math.random) {
  const pick = arr => arr[Math.floor(rand() * arr.length)];
  for (let attempt = 0; attempt < 300; attempt++) {
    const counts = new Map();
    const hand = [];
    let ok = true;
    for (let i = 0; i < MELD_COUNT && ok; i++) {
      // 只挑「加上去也不会超过 4 张」的组
      const fit = MELD_POOL.filter(g => meldFits(g, counts));
      if (!fit.length) { ok = false; break; }
      const g = pick(fit);
      g.forEach(([s, n]) => {
        counts.set(`${s}${n}`, countOf(counts, s, n) + 1);
        hand.push([s, n]);
      });
    }
    if (!ok) continue;
    // 将：随便挑一种还没到 4 张的
    const pairPool = [];
    for (const suit of SUITS) {
      for (let n = 1; n <= NUM_MAX[suit]; n++) if (countOf(counts, suit, n) + 2 <= COPIES_MAX) pairPool.push([suit, n]);
    }
    if (!pairPool.length) continue;
    const p = pick(pairPool);
    hand.push(p, p);
    return hand.map(([s, n]) => makeTile(s, n));
  }
  // 兜底（几乎不可能走到）：一副固定的可赢手牌
  const fixed = [['m', 1], ['m', 2], ['m', 3], ['p', 5], ['p', 5], ['p', 5], ['s', 7], ['s', 7], ['s', 7],
    ['z', 5], ['z', 5], ['z', 5], ['z', 1], ['z', 1]];
  return fixed.map(([s, n]) => makeTile(s, n));
}

// ---------- 铺盘 ----------

// 从剩下的牌里取出一组真正成立的组（刻子或顺子），取不到返回 null
function takeMeld(tiles, rand) {
  const counts = new Map();
  tiles.forEach(t => counts.set(kindKey(t), (counts.get(kindKey(t)) || 0) + 1));
  const options = MELD_POOL.filter(g => [...meldNeed(g).entries()]
    .every(([k, v]) => (counts.get(k) || 0) >= v));
  if (!options.length) return null;
  const group = options[Math.floor(rand() * options.length)];
  const out = [];
  for (const [s, n] of group) {
    const at = tiles.findIndex(t => t.suit === s && t.num === n && !out.includes(t));
    if (at < 0) return null;
    out.push(tiles[at]);
  }
  out.forEach(t => tiles.splice(tiles.indexOf(t), 1));
  return out;
}

const emptyBoard = () => new Array(CELLS).fill(null);
const idx = (r, c) => r * SIZE + c;
const inBoard = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

// 把 14 张牌铺到 5×5 棋盘上。ease 越高越简单：
// 直接按「已经相邻成组」摆好的组数 = round(ease × 4)，其余散着放。
export function placeHand(tiles, rand = Math.random, ease = 0) {
  const pick = arr => arr[Math.floor(rand() * arr.length)];
  const grouped = Math.max(0, Math.min(MELD_COUNT, Math.round(ease * MELD_COUNT)));
  const shuffled = [...tiles];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  for (let attempt = 0; attempt < 200; attempt++) {
    const board = emptyBoard();
    const take = [...shuffled];
    let failed = false;
    // 先摆「成组」的：每组三张放成横排或竖排
    for (let g = 0; g < grouped && !failed; g++) {
      const trio = takeMeld(take, rand);
      if (!trio) { failed = true; break; }
      const spots = [];
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          for (const [dr, dc] of [[0, 1], [1, 0]]) {
            const cells = [0, 1, 2].map(k => [r + dr * k, c + dc * k]);
            if (cells.every(([rr, cc]) => inBoard(rr, cc) && !board[idx(rr, cc)])) {
              spots.push({ cells: cells.map(([rr, cc]) => idx(rr, cc)), flip: rand() < 0.5 });
            }
          }
        }
      }
      if (!spots.length) { failed = true; break; }
      const s = pick(spots);
      const order = s.flip ? [...trio].reverse() : trio;
      s.cells.forEach((cell, k) => { board[cell] = order[k]; });
    }
    if (failed) continue;
    // 剩下的散着放
    const free = [];
    for (let i = 0; i < CELLS; i++) if (!board[i]) free.push(i);
    if (free.length < take.length) continue;
    for (let i = free.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [free[i], free[j]] = [free[j], free[i]];
    }
    take.forEach((t, k) => { board[free[k]] = t; });
    return board;
  }
  // 兜底：随便铺
  const board = emptyBoard();
  const free = [];
  for (let i = 0; i < CELLS; i++) free.push(i);
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [free[i], free[j]] = [free[j], free[i]];
  }
  tiles.forEach((t, k) => { board[free[k]] = t; });
  return board;
}

// ---------- 滑动 ----------

// 朝某个方向滑动：所有牌沿该方向移动，直到碰边或被别的牌挡住（不合并）
export function slide(board, dir) {
  const { dr, dc } = DIRS[dir];
  const next = emptyBoard();
  const vertical = dc === 0;
  for (let line = 0; line < SIZE; line++) {
    const cells = [];
    for (let k = 0; k < SIZE; k++) {
      cells.push(vertical ? idx(k, line) : idx(line, k));
    }
    // 按滑动方向决定「先落谁」
    const ordered = (dr + dc > 0) ? [...cells].reverse() : cells;
    const tiles = ordered.map(i => board[i]).filter(Boolean);
    const target = (dr + dc > 0) ? [...cells].reverse() : cells;
    tiles.forEach((t, k) => { next[target[k]] = t; });
  }
  return next;
}

export const sameBoard = (a, b) => a.every((t, i) => (t && b[i] ? t.id === b[i].id : t === b[i]));

// ---------- 找可消除的牌组 ----------

// 棋盘上所有「横/竖紧挨着」且能成组的三张（刻子 / 顺子）或两张（将）
export function findGroups(board) {
  const out = [];
  const scan = cells => {
    // cells：一条线上按顺序的 5 个格子下标
    const tiles = cells.map(i => board[i]);
    let start = 0;
    while (start < cells.length) {
      if (!tiles[start]) { start++; continue; }
      let end = start;
      while (end + 1 < cells.length && tiles[end + 1]) end++;
      // [start, end] 是一段连续有牌的区间，检查其中长度 2 / 3 的窗口
      for (let s = start; s <= end; s++) {
        for (const len of [2, 3]) {
          if (s + len - 1 > end) continue;
          const win = [];
          for (let k = 0; k < len; k++) win.push(cells[s + k]);
          const group = len === 2
            ? isPair(win.map(i => board[i]))
            : isMeld(win.map(i => board[i]));
          if (group) out.push({ cells: win, type: group.type });
        }
      }
      start = end + 1;
    }
  };
  for (let r = 0; r < SIZE; r++) scan(Array.from({ length: SIZE }, (_, c) => idx(r, c)));
  for (let c = 0; c < SIZE; c++) scan(Array.from({ length: SIZE }, (_, r) => idx(r, c)));
  return out;
}

// ---------- 关卡曲线 ----------
// 两条难度轴：①「组合简易程度」= 初始摆盘里已经摆好的组数（ease），
// ② 滑动步数上限（moves）。第 20 关到顶，之后无限重复第 20 关的数值。
// 数值是离线标定的（见该游戏的 AGENTS.md）：用一个「清组前先确认残局仍能拆完」的
// 基础玩家跑 200 局/档，ease=1 / 0.75 / 0.5 / 0.25 / 0 的通关率是 91 / 46 / 17 / 10 / 3%，
// 通一关需要的步数 p80 是 3 / 4 / 4 / 6 / 7 步 —— 步数上限按「比 p80 宽一点」定，
// 于是第 1 关 14 步、第 20 关 9 步。
export const MAX_LEVEL = 20;
const MOVES_EASY = 14;
const MOVES_HARD = 9;
const EASE_EASY = 1;      // 第 1 关：4 组全都已经摆好
const EASE_HARD = 0;      // 第 20 关：全散着放

export function levelConfig(level) {
  const lv = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level) || 1));
  const t = MAX_LEVEL === 1 ? 1 : (lv - 1) / (MAX_LEVEL - 1);
  return {
    level: lv,
    // 步数：14 → 7（第 1 关很宽松，第 20 关要精打细算）
    moves: Math.round(MOVES_EASY + (MOVES_HARD - MOVES_EASY) * t),
    // 简易程度：1 → 0（已经摆好的组数 4 → 0）
    ease: EASE_EASY + (EASE_HARD - EASE_EASY) * t,
  };
}


// ---------- 上帝模式求解器 ----------
// 规则回顾：滑动算一步（有步数上限）、消除不花步数。所以「先清掉能清的组、再滑动」，
// 用「迭代加深（先找步数最少的解）+ 记忆化失败状态」搜出一条必胜路线。
//
// 状态只按「每格是哪种牌」规范化：同种类的牌彼此可换，可消组的判定只看种类，
// 不看每张牌的 id（id 只在动画与存档里有用）。
const boardKey = b => b.map(t => (t ? kindKey(t) : '.')).join('|');
const kindOrder = k => SUITS.indexOf(k[0]) * 10 + +k.slice(1);

// 剩下的牌能不能拆成「若干组（刻子 / 顺子）+ 至多一个将」——这是**能不能赢的必要条件**
// （滑动只换位置、不改牌面，最终所有牌都得这么被消掉）。用它剪枝能砍掉绝大多数
// 「清错一组、残局再也拆不完」的废分支，这也是本作最要紧的一条经验。
export function canSplit(tiles) {
  const cnt = {};
  for (const t of tiles) { const k = kindKey(t); cnt[k] = (cnt[k] || 0) + 1; }
  const failed = new Set();
  const stateKey = pairUsed => Object.keys(cnt).filter(k => cnt[k] > 0).sort()
    .map(k => k + cnt[k]).join(',') + '#' + (pairUsed ? 1 : 0);
  const take = (keys, fn) => {
    keys.forEach(k => { cnt[k] -= 1; });
    const r = fn();
    keys.forEach(k => { cnt[k] += 1; });
    return r;
  };
  function go(pairUsed) {
    const ks = Object.keys(cnt).filter(k => cnt[k] > 0).sort((a, b) => kindOrder(a) - kindOrder(b));
    if (!ks.length) return true;
    const sk = stateKey(pairUsed);
    if (failed.has(sk)) return false;
    // **从最小的那张开始拆**：随便取第一张会在「最小张属于顺子」时误判（实测踩过）
    const k0 = ks[0];
    const suit = k0[0];
    const num = +k0.slice(1);
    if (cnt[k0] >= 3 && take([k0, k0, k0], () => go(pairUsed))) return true;
    if (suit !== 'z' && num <= NUM_MAX[suit] - 2) {
      const k1 = `${suit}${num + 1}`;
      const k2 = `${suit}${num + 2}`;
      if (cnt[k1] > 0 && cnt[k2] > 0 && take([k0, k1, k2], () => go(pairUsed))) return true;
    }
    if (!pairUsed && cnt[k0] >= 2 && take([k0, k0], () => go(true))) return true;
    failed.add(sk);
    return false;
  }
  return go(false);
}

export function solvePuzzle(board, maxMoves, budget = 2000000) {
  const memo = new Set();
  let nodes = 0;
  // 同一局里可能有等价的可消组（同 cell 集合），去重后再分支；先清三张组（将留到最后）
  const groupsOf = b => {
    const seen = new Set();
    const out = [];
    for (const g of findGroups(b)) {
      const cells = [...g.cells].sort((x, y) => x - y);
      const k = cells.join(',');
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(cells);
    }
    out.sort((a, c) => c.length - a.length);
    return out;
  };
  function dfs(b, moves, path) {
    if (nodes++ > budget) return null;
    const left = b.filter(Boolean);
    if (!left.length) return path;
    const k = `${boardKey(b)}#${moves}`;
    if (memo.has(k)) return null;
    // ① 消除是免费的：把每个可消组都试一遍（清完还得拆得完才继续）
    for (const cells of groupsOf(b)) {
      const nb = b.map((t, i) => (cells.includes(i) ? null : t));
      if (!canSplit(nb.filter(Boolean))) continue;
      const r = dfs(nb, moves, [...path, { type: 'clear', cells }]);
      if (r) return r;
    }
    // ② 还有步数再试四个方向
    if (moves > 0) {
      for (const dir of ['up', 'down', 'left', 'right']) {
        const nb = slide(b, dir);
        if (b.every((t, i) => t === nb[i])) continue;   // 滑不动
        const r = dfs(nb, moves - 1, [...path, { type: 'slide', dir }]);
        if (r) return r;
      }
    }
    memo.add(k);
    return null;
  }
  for (let m = 0; m <= maxMoves; m++) {     // 迭代加深：m 步能赢就不试 m+1 步
    const r = dfs(board.map(t => t), m, []);
    if (r) return r;
    if (nodes > budget) return null;        // 超预算就别硬撑（调用方会兜底）
  }
  return null;
}

export function newGame(level, rand = Math.random) {
  const cfg = levelConfig(level);
  // 发牌时就把「步数上限内解不开」的开局扔掉重发：
  // placeHand 是「预先摆好几组 + 剩下随机撒点」，随机撒出来的局面在高关卡有相当比例
  // 是 9 步内无解的（实测第 20 关 300 局里 103 局如此）——那种局玩家再厉害也过不去。
  // 重发到可解为止，顺便把解缓存下来给上帝模式直接用（一次搜索 ~10ms，重发平均 1.5 次）。
  let board = null;
  let solution = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    resetUid();
    board = placeHand(dealHand(rand), rand, cfg.ease);
    solution = solvePuzzle(board, cfg.moves);
    if (solution) break;
  }
  if (!solution) {
    // 极端兜底（40 次都没发到可解的，几乎不可能）：把步数放宽到刚好够用，
    // 宁可这一关比标定多几步，也不给玩家一个解不开的局
    for (let m = cfg.moves + 1; m <= cfg.moves + 8 && !solution; m++) solution = solvePuzzle(board, m);
    if (solution) return { board, cfg: { ...cfg, moves: solution.filter(x => x.type === 'slide').length + 1 }, moves: solution.filter(x => x.type === 'slide').length + 1, solution };
  }
  return { board, cfg, moves: cfg.moves, solution };
}
