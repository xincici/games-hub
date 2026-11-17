// 麻将传奇（Mahjong Legend）的纯逻辑：8×7 棋盘 + 重力 + 找组 + 计分 + 升行。
// 逐字移植 web `src/games/legend/board.js`（纯函数、不依赖 wx / canvas），
// 追加了「等级 = 分数进度」与「等级越高字牌略多」的小函数，供 scene.js 使用。
// 牌面三类：
//   1~9   条牌（点数就是点数，可凑顺子 / 刻子 / 杠）
//   10~16 字牌（東南西北中發白，只能靠刻子 / 杠消掉，凑不出顺子）
//   17~24 花牌（梅兰菊竹春夏秋冬，万能牌：判组时可以当任意一张牌）
const COLS = 7;
const ROWS = 8;
const KINDS = 9;                  // 条牌 1~9
const HONOR_BASE = 9;
const HONORS = 7;
// 每张牌出字牌的概率：1/14 ≈ 7.1%（与 web 一致；等级提升后再略微上调，见 honorRateAt）
const HONOR_RATE = 1 / 14;
const FLOWER_BASE = HONOR_BASE + HONORS;   // 16
const FLOWERS = 8;
// 出花牌的概率：8%（约每 12.5 张一张，web 用户要求「10% 以下」）
const FLOWER_RATE = 0.08;

const MAX_VALUE = FLOWER_BASE + FLOWERS;   // 24
const CELLS = ROWS * COLS;
const PREVIEW = 2;                // 候选区：当前要出的这张 + 后面两张

// 等级：本作是单局制（没有关卡），等级只由**本局得分**推进，用来展示进度与抬难度。
const LEVEL_STEP = 1200;
const levelOf = score => 1 + Math.floor(Math.max(0, score) / LEVEL_STEP);
// 等级越高字牌略多（1 级 7.1% → 13 级 19% 封顶），花牌概率保持不变。
const honorRateAt = level => Math.min(0.19, HONOR_RATE + Math.max(0, level - 1) * 0.01);

const isFlower = v => v > FLOWER_BASE;
const isHonor = v => v > HONOR_BASE && v <= FLOWER_BASE;
const suitOf = v => (isFlower(v) ? 'f' : v > HONOR_BASE ? 'z' : 's');
const faceOf = v => (isFlower(v) ? v - FLOWER_BASE : v > HONOR_BASE ? v - HONOR_BASE : v);

// 动画时长（scene.js 的过渡 / 闪烁与它对齐）
const CLEAR_MS = 520;             // 消除闪烁（与麻将英雄 / 扑克炼金术一致）
const FALL_MS = 200;              // 掉落与上顶的位移
const SPAWN_MS = 240;             // 新一行从棋盘下方升起

// 计分：顺子 100 / 刻子 200 / 杠 300
const SCORE = { run: 100, triplet: 200, kong: 300 };
const MULTI_BONUS = 100;          // 一次消多组：从第二组起每组 +100
const CHAIN_BONUS = 100;          // 连击：从第二连起每连 +100
const multiBonus = n => Math.max(0, n - 1) * MULTI_BONUS;
const chainBonus = chain => Math.max(0, chain - 1) * CHAIN_BONUS;

let uid = 0;
const resetUid = () => { uid = 0; };
const makeTile = v => ({ id: ++uid, v });
const sameTile = (a, b) => !!a && !!b && a.v === b.v;

const emptyGrid = () => Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
const cloneGrid = grid => grid.map(row => row.slice());

// 单张随机牌：先判花牌（花牌概率固定），再判字牌（等级越高略多），其余条牌。
function randomKind(rand = Math.random, honorRate = HONOR_RATE, flowerRate = FLOWER_RATE) {
  if (rand() < flowerRate) return FLOWER_BASE + 1 + Math.floor(rand() * FLOWERS);
  if (rand() < honorRate) return HONOR_BASE + 1 + Math.floor(rand() * HONORS);
  return 1 + Math.floor(rand() * KINDS);
}
const randomRow = (rand = Math.random, honorRate = HONOR_RATE, flowerRate = FLOWER_RATE) =>
  Array.from({ length: COLS }, () => randomKind(rand, honorRate, flowerRate));

// 重力：每一列的牌都落到底部（牌永远不会悬空）
function settle(grid) {
  const next = emptyGrid();
  for (let c = 0; c < COLS; c++) {
    const col = [];
    for (let r = ROWS - 1; r >= 0; r--) if (grid[r][c]) col.push(grid[r][c]);
    col.forEach((tile, k) => { next[ROWS - 1 - k][c] = tile; });
  }
  return next;
}

// 某一列「从下往上」第一个空位的行号；满了返回 -1
function dropRow(grid, col) {
  for (let r = ROWS - 1; r >= 0; r--) if (!grid[r][col]) return r;
  return -1;
}

// 放一张牌到某一列：它会落到那一列最上面（= 从下往上第一个空位）。
// **参数是点数（1~24），不是牌对象** —— 这里统一用 makeTile 包一下。
function placeTile(grid, col, value) {
  const row = dropRow(grid, col);
  if (row < 0) return null;
  const next = cloneGrid(grid);
  next[row][col] = makeTile(value);
  return { grid: next, row };
}

// 替换某一格已有的牌（被换掉的那张直接弃掉）；参数同样是点数
function replaceTile(grid, row, col, value) {
  const next = cloneGrid(grid);
  next[row][col] = makeTile(value);
  return next;
}

// ---------- 找组 ----------
// 只在**相邻**的牌之间找：一行/一列里被空格隔开就当两段。
// 每段用一个小 DP 求「分数最高的拆法」，避免贪心漏掉更好的组合
// （例如 1,2,3,3,3：先拿顺子只剩 100，先拿刻子能拿 200）。
// 一段（行 / 列里被空格隔开的连续牌）里**所有成立**的牌组。
//
// 规则（2026-11 玩家要求，取代原来「不重叠的最高分拆法」）：
// - 花牌是万能牌，可当**任意**一张牌；同一张花牌能同时被多个组借去当不同点数
//   （例：南 南 梅 4 4 → 「南南梅」刻子 + 「梅 4 4」刻子都成立 → 五张一起消）；
// - 组与组之间**允许重叠**：只要窗口能组成牌组就算，最后取所有组成员的并集一起消
//   （例：2 3 4 4 4 → 顺子 234 + 刻子 444 → 五张一起消，而不是只消刻子）；
// - 顺子只能是条牌（1~9），非花牌互不相同、跨度 ≤ 2；字牌只能刻子 / 杠。
// 返回 [{ kind, from, len }]（from / len 是段内下标，棋盘坐标由 findGroups 换算）。
function groupsInSegment(values) {
  const n = values.length;
  const found = [];
  const push = (kind, from, len) => {
    if (!found.some(g => g.kind === kind && g.from === from && g.len === len)) found.push({ kind, from, len });
  };
  for (let i = 0; i < n; i++) {
    for (const len of [3, 4]) {
      if (i + len > n) continue;
      const win = values.slice(i, i + len);
      const real = win.filter(v => !isFlower(v));
      // 刻子 / 杠：非花牌必须全同（全花牌也算，可当任意 len 张相同）
      if (real.length === 0 || real.every(v => v === real[0])) {
        push(len === 4 ? 'kong' : 'triplet', i, len);
      }
      if (len !== 3) continue;
      // 顺子：非花牌只能是条牌、互不相同、跨度 ≤ 2（花牌补空缺）
      const suitOk = real.every(v => v <= HONOR_BASE);
      const distinct = new Set(real).size === real.length;
      const spanOk = real.length === 0 || Math.max.apply(null, real) - Math.min.apply(null, real) <= 2;
      if (suitOk && distinct && spanOk) push('run', i, 3);
    }
  }
  // 同一段牌只能算一次最大分：同一窗口既是顺子又是刻子（例如「花 花 5」）时保留分高的那个
  const bestByRange = new Map();
  found.forEach((g) => {
    const key = `${g.from}:${g.len}`;
    const prev = bestByRange.get(key);
    if (!prev || SCORE[g.kind] > SCORE[prev.kind]) bestByRange.set(key, g);
  });
  const uniq = Array.from(bestByRange.values());
  // 去掉被其它组**完全包含**的组：四张同点只算一个杠，不再额外算两个刻子
  return uniq.filter(g => !uniq.some(h => h !== g && h.from <= g.from
    && h.from + h.len >= g.from + g.len && h.len > g.len));
}

// 找出棋盘上所有能消的组（同时扫 8 行 + 7 列）
function findGroups(grid) {
  const groups = [];
  const scan = (cells) => {
    const segs = [];
    let seg = [];
    for (const [r, c] of cells) {
      if (grid[r][c]) seg.push({ r, c, v: grid[r][c].v });
      else if (seg.length) { segs.push(seg); seg = []; }
    }
    if (seg.length) segs.push(seg);
    for (const s of segs) {
      for (const g of groupsInSegment(s.map(x => x.v))) {
        const part = s.slice(g.from, g.from + g.len);
        groups.push({ kind: g.kind, score: SCORE[g.kind], cells: part.map(x => [x.r, x.c]) });
      }
    }
  };
  for (let r = 0; r < ROWS; r++) scan(Array.from({ length: COLS }, (_, c) => [r, c]));
  for (let c = 0; c < COLS; c++) scan(Array.from({ length: ROWS }, (_, r) => [r, c]));
  return groups;
}

// 把组里的牌消掉
function clearGroups(grid, groups) {
  const next = cloneGrid(grid);
  for (const g of groups) for (const [r, c] of g.cells) next[r][c] = null;
  return next;
}

// 开局：底部**两行**，并且保证这两行里**没有任何可消的组**（重发到干净为止）。
function initialGrid(rand = Math.random, maxTries = 200) {
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    const grid = emptyGrid();
    for (let r = ROWS - 2; r < ROWS; r++) {
      const row = randomRow(rand);
      for (let c = 0; c < COLS; c++) grid[r][c] = makeTile(row[c]);
    }
    if (!findGroups(grid).length) return { grid, tries: attempt };
  }
  return { grid: emptyGrid(), tries: maxTries };
}

// 底部新增一行：所有牌上顶一格、底部放一行新牌。
// 顶格（第 0 行）已经有牌的话，上顶会把它挤出棋盘 —— 这就是失败条件（调用方据此判负）。
function spawnRow(grid, row) {
  const overflow = grid[0].some(Boolean);
  const next = emptyGrid();
  for (let r = 0; r < ROWS - 1; r++) next[r] = grid[r + 1].slice();
  next[ROWS - 1] = row.map(v => makeTile(v));
  return { grid: next, overflow };
}

module.exports = {
  COLS,
  ROWS,
  KINDS,
  HONOR_BASE,
  HONORS,
  HONOR_RATE,
  FLOWER_BASE,
  FLOWERS,
  FLOWER_RATE,
  MAX_VALUE,
  CELLS,
  PREVIEW,
  LEVEL_STEP,
  CLEAR_MS,
  FALL_MS,
  SPAWN_MS,
  SCORE,
  MULTI_BONUS,
  CHAIN_BONUS,
  levelOf,
  honorRateAt,
  isFlower,
  isHonor,
  suitOf,
  faceOf,
  multiBonus,
  chainBonus,
  resetUid,
  makeTile,
  sameTile,
  emptyGrid,
  cloneGrid,
  randomKind,
  randomRow,
  settle,
  dropRow,
  placeTile,
  replaceTile,
  groupsInSegment,
  findGroups,
  clearGroups,
  initialGrid,
  spawnRow,
};
