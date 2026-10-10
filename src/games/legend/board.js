// 麻将传奇（Mahjong Legend）的纯逻辑：8×7 棋盘 + 重力 + 找组 + 计分 + 升行。
// 只使用**条牌**（1条 ~ 9条），所以判组比真麻将简单：同花色就意味着都是条。
export const COLS = 7;
export const ROWS = 8;
export const KINDS = 9;            // 条牌 1~9（点数就是 1~9 条）
// 字牌：東南西北中發白，取值 10~16（值 − 9 = 雪碧图里的 z1~z7）。
// 它们**只能靠刻子 / 杠消除**（点数不连续，凑不出顺子）—— 这是加难度的主要来源。
export const HONOR_BASE = 9;
export const HONORS = 7;
export const HONOR_RATE = 0.12;    // 每个格子出字牌的概率（用户要求「频率不要太高」）
export const suitOf = v => (v > HONOR_BASE ? 'z' : 's');
export const faceOf = v => (v > HONOR_BASE ? v - HONOR_BASE : v);
export const isHonor = v => v > HONOR_BASE;
export const MAX_VALUE = HONOR_BASE + HONORS;
export const CELLS = ROWS * COLS;
export const PREVIEW = 2;          // 候选区：当前要出的这张 + 后面两张

// 动画时长（组件里的过渡/闪烁与它对齐）
export const CLEAR_MS = 520;       // 消除闪烁（与麻将英雄 / 扑克炼金术一致）
export const FALL_MS = 200;        // 掉落与上顶的位移
export const SPAWN_MS = 240;       // 新一行从棋盘下方升起

// 计分：顺子 100 / 刻子 200 / 杠 300
export const SCORE = { run: 100, triplet: 200, kong: 300 };
export const MULTI_BONUS = 100;    // 一次消多组：从第二组起每组 +100（n 组 → (n-1)×100）
export const CHAIN_BONUS = 100;    // 连击：从第二连起每连 +100
export const multiBonus = n => Math.max(0, n - 1) * MULTI_BONUS;
export const chainBonus = chain => Math.max(0, chain - 1) * CHAIN_BONUS;

let uid = 0;
export const resetUid = () => { uid = 0; };
export const makeTile = v => ({ id: ++uid, v });
export const sameTile = (a, b) => !!a && !!b && a.v === b.v;

export const emptyGrid = () => Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
export const cloneGrid = grid => grid.map(row => row.slice());
// 单张随机牌：以 HONOR_RATE 的概率出字牌，否则出条牌（字牌只在 7 种里等概率挑）
export function randomKind(rand = Math.random, honorRate = HONOR_RATE) {
  if (rand() < honorRate) return HONOR_BASE + 1 + Math.floor(rand() * HONORS);
  return 1 + Math.floor(rand() * KINDS);
}
export const randomRow = (rand = Math.random, honorRate = HONOR_RATE) =>
  Array.from({ length: COLS }, () => randomKind(rand, honorRate));

// 重力：每一列的牌都落到底部（牌永远不会悬空）
export function settle(grid) {
  const next = emptyGrid();
  for (let c = 0; c < COLS; c++) {
    const col = [];
    for (let r = ROWS - 1; r >= 0; r--) if (grid[r][c]) col.push(grid[r][c]);
    col.forEach((t, k) => { next[ROWS - 1 - k][c] = t; });
  }
  return next;
}

// 某一列「从下往上」第一个空位的行号；满了返回 -1
export function dropRow(grid, col) {
  for (let r = ROWS - 1; r >= 0; r--) if (!grid[r][col]) return r;
  return -1;
}

// 放一张牌到某一列：它会落到那一列最上面（= 从下往上第一个空位）。
// **参数是点数（1~9），不是牌对象** —— 这里统一用 makeTile 包一下。
// （踩过：第一版直接把传进来的数字存进格子，于是刚落下的牌没有 id/v，
//   findGroups 读到的全是 undefined，刚落的牌永远不参与判组。）
export function placeTile(grid, col, value) {
  const row = dropRow(grid, col);
  if (row < 0) return null;
  const next = cloneGrid(grid);
  next[row][col] = makeTile(value);
  return { grid: next, row };
}

// 替换某一格已有的牌（被换掉的那张直接弃掉）；参数同样是点数
export function replaceTile(grid, row, col, value) {
  const next = cloneGrid(grid);
  next[row][col] = makeTile(value);
  return next;
}

// ---------- 找组 ----------
// 只在**相邻**的牌之间找：一行/一列里被空格隔开就当两段。
// 每段用一个小 DP 求「分数最高的拆法」，避免贪心漏掉更好的组合
// （例如 1,2,3,3,3：先拿顺子只剩 100，先拿刻子能拿 200）。
function bestInSegment(values) {
  const n = values.length;
  const memo = new Array(n + 1).fill(null);
  const go = i => {
    if (i >= n) return { score: 0, picks: [] };
    if (memo[i]) return memo[i];
    let best = { score: go(i + 1).score, picks: go(i + 1).picks };
    // 连着 k 张**全都**相同 —— 只比首尾会把 [5,7,5] 当成刻子（踩过：
    // 当初写成 values[i+k] === values[i]，中间那张根本没查）
    const same = (k) => {
      for (let j = 1; j < k; j++) if (i + j >= n || values[i + j] !== values[i]) return false;
      return true;
    };
    if (same(4)) {                       // 杠：连着四张相同
      const rest = go(i + 4);
      const cand = { score: SCORE.kong + rest.score, picks: [{ kind: 'kong', from: i, len: 4 }, ...rest.picks] };
      if (cand.score > best.score) best = cand;
    }
    if (same(3)) {                       // 刻子：连着三张相同
      const rest = go(i + 3);
      const cand = { score: SCORE.triplet + rest.score, picks: [{ kind: 'triplet', from: i, len: 3 }, ...rest.picks] };
      if (cand.score > best.score) best = cand;
    }
    // 顺子：连着三张、点数正好是连续三个数 —— **与顺序无关**（和真麻将一致）：
    // 玩家从下往上码成 1,2,3，从上往下扫就是 [3,2,1]；排好序再判连续才是对的
    if (i + 2 < n && values[i] <= HONOR_BASE && values[i + 1] <= HONOR_BASE && values[i + 2] <= HONOR_BASE) {
      // 顺子只能是条牌（值 ≤ 9）：不卡这一点的话「9条 + 東 + 南」会被算成连续三张
      const tri = [values[i], values[i + 1], values[i + 2]].sort((a, b) => a - b);
      if (tri[1] === tri[0] + 1 && tri[2] === tri[1] + 1) {
        const rest = go(i + 3);
        const cand = { score: SCORE.run + rest.score, picks: [{ kind: 'run', from: i, len: 3 }, ...rest.picks] };
        if (cand.score > best.score) best = cand;
      }
    }
    memo[i] = best;
    return best;
  };
  return go(0).picks;
}

// 找出棋盘上所有能消的组（同时扫 8 行 + 6 列）
export function findGroups(grid) {
  const groups = [];
  const scan = (cells) => {              // cells: [[r,c], ...] 按顺序
    const segs = [];
    let seg = [];
    for (const [r, c] of cells) {
      if (grid[r][c]) seg.push({ r, c, v: grid[r][c].v });
      else if (seg.length) { segs.push(seg); seg = []; }
    }
    if (seg.length) segs.push(seg);
    for (const s of segs) {
      for (const pick of bestInSegment(s.map(x => x.v))) {
        const part = s.slice(pick.from, pick.from + pick.len);
        groups.push({ kind: pick.kind, score: SCORE[pick.kind], cells: part.map(x => [x.r, x.c]) });
      }
    }
  };
  for (let r = 0; r < ROWS; r++) scan(Array.from({ length: COLS }, (_, c) => [r, c]));
  for (let c = 0; c < COLS; c++) scan(Array.from({ length: ROWS }, (_, r) => [r, c]));
  return groups;
}

// 把组里的牌消掉
export function clearGroups(grid, groups) {
  const next = cloneGrid(grid);
  for (const g of groups) for (const [r, c] of g.cells) next[r][c] = null;
  return next;
}

// 开局：底部**两行**，并且保证这两行里**没有任何可消的组**（重发到干净为止）。
// 这两行只有 2 张高，所以纵向凑不出组（组至少 3 张），只需要横向的三个窗口都不成组；
// 随机一行「干净」的概率约 7 成，实测平均重发 1.4 次（见分册的标定）。
export function initialGrid(rand = Math.random, maxTries = 200) {
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    const grid = emptyGrid();
    for (let r = ROWS - 2; r < ROWS; r++) {
      const row = randomRow(rand);
      for (let c = 0; c < COLS; c++) grid[r][c] = makeTile(row[c]);
    }
    if (!findGroups(grid).length) return { grid, tries: attempt };
  }
  // 理论上到不了这里（每次都失败的概率小到可以忽略）；兜底给一个没有组的空盘
  return { grid: emptyGrid(), tries: maxTries };
}

// 底部新增一行：所有牌上顶一格、底部放一行新牌。
// 顶格（第 0 行）已经有牌的话，上顶会把它挤出棋盘 —— 这就是失败条件（调用方据此判负）。
export function spawnRow(grid, row) {
  const overflow = grid[0].some(Boolean);
  const next = emptyGrid();
  for (let r = 0; r < ROWS - 1; r++) next[r] = grid[r + 1].slice();
  next[ROWS - 1] = row.map(v => makeTile(v));
  return { grid: next, overflow };
}
