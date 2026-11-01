// Emoji 滑行 · 纯逻辑（CommonJS）：关卡曲线、发牌、相邻判定、整组滑动、消除与死局重排。
// 逐条对齐 web 的 src/games/slide/board.js；不依赖 wx / canvas，可以直接用 node require 跑测试。
//
// 坐标约定：grid[r][c] === 0 表示空格，1..kinds 表示 emoji 种类编号。

// 关卡曲线：第 1 关最低（6×6 · 5 种，18 对，99s），第 15 关到顶（11 行 × 8 列 · 7 种，44 对，176s），
// 行 / 列 / 种类都在第 1~15 关之间线性爬升（盘面走整数阶梯）。
// 限时按「对数 × 每对秒数」算：每对时间从 5.5s 平缓收到 4.0s，
// 所以限时跟着盘面平稳增长，每对时间（真正的难度）严格单调递减。
// 第 15 关之后盘面不再变，只把限时每关收 3s，160s 保底。
const MIN = { rows: 6, cols: 6, kinds: 5, secPerPair: 5.5 };
const MAX = { rows: 11, cols: 8, kinds: 7, secPerPair: 4.0 };
const CAP_LEVEL = 15;
const TIME_FLOOR = 160;

// 牌面 emoji：种类编号 1..7 依次取用（第 8 个留作以后扩种类，不影响存档）。
const GLYPHS = ['🍎', '🍋', '🍇', '🥝', '🫐', '🍑', '🥕', '🍄'];

// 判定邻居的顺序固定为 上 → 右 → 下 → 左，所以「消掉哪一个邻居」是可预期的。
const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];

// t = 0..1 时的盘面与「基准限时」（对数 × 每对秒数）
function rawAt(t) {
  const lerp = (a, b) => a + (b - a) * t;
  const rows = Math.round(lerp(MIN.rows, MAX.rows));
  const cols = Math.round(lerp(MIN.cols, MAX.cols));
  const kinds = Math.round(lerp(MIN.kinds, MAX.kinds));
  const pairs = Math.floor((rows * cols) / 2);
  return {
    rows,
    cols,
    kinds,
    pairs,
    base: Math.round(pairs * lerp(MIN.secPerPair, MAX.secPerPair)),
  };
}

function levelConfig(level) {
  const lv = Math.max(1, Math.floor(level) || 1);
  const at = l => rawAt(Math.min(1, (l - 1) / (CAP_LEVEL - 1)));
  const cur = at(lv);
  const extra = Math.max(0, lv - CAP_LEVEL);
  if (extra) {
    // 封顶之后：盘面不变，限时每关再收 3s，160s 保底
    return {
      level: lv,
      rows: cur.rows,
      cols: cur.cols,
      kinds: cur.kinds,
      pairs: cur.pairs,
      seconds: Math.max(TIME_FLOOR, cur.base - extra * 3),
    };
  }
  return { level: lv, rows: cur.rows, cols: cur.cols, kinds: cur.kinds, pairs: cur.pairs, seconds: cur.base };
}

// 种类编号 → 牌面 emoji（越界也钳在合法范围内，避免出现没有 emoji 的白卡片）
function glyphFor(kind) {
  const k = Math.max(1, Math.floor(kind) || 1);
  return GLYPHS[(k - 1) % GLYPHS.length];
}

// 本关总对数：面积是奇数时留一个空格，所以正好是 floor(rows × cols / 2)。
// 从关卡配置推导，不要数当前牌数 —— 恢复存档时数牌数会把「剩余」当成「总数」。
function totalPairs(conf) {
  const c = conf || {};
  return Math.floor(((c.rows || 0) * (c.cols || 0)) / 2);
}

function shuffle(list, rand = Math.random) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = ~~(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function clone(grid) {
  return grid.map(row => row.slice());
}

function inside(grid, r, c) {
  return r >= 0 && r < grid.length && c >= 0 && c < grid[0].length;
}

// 找 (r,c) 四周的同款邻居（没有就返回 null）
function findPartner(grid, r, c) {
  const k = grid[r] ? grid[r][c] : 0;
  if (!k) return null;
  for (const [dr, dc] of DIRS) {
    const nr = r + dr;
    const nc = c + dc;
    if (inside(grid, nr, nc) && grid[nr][nc] === k) return [nr, nc];
  }
  return null;
}

// 棋盘上还有没有「相邻同款」（开局必须有，否则第一步无从下手）
function hasAdjacentPair(grid) {
  if (!grid.length || !grid[0] || !grid[0].length) return false;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[0].length; c++) {
      if (grid[r][c] && findPartner(grid, r, c)) return true;
    }
  }
  return false;
}

// 发牌：把 total/2 个「对子名额」按种类轮着分，每种出现偶数次，因此一定能两两消完。
// 0 = 空格，1..kinds = 种类编号。
function makeBoard(rows, cols, kinds, rand = Math.random) {
  const pairCount = Math.floor((rows * cols) / 2);
  const cells = [];
  for (let i = 0; i < pairCount; i++) {
    const k = (i % kinds) + 1;
    cells.push(k, k);
  }
  const flat = shuffle(cells, rand);
  // 面积为奇数（如 7×7=49 / 9×7=63）时留一个空格子：棋盘本来就允许空洞，
  // 这样行 / 列不必凑偶数，曲线才能逐关平滑爬升。
  // 面积是奇数 ⇒ 行列都是奇数，所以棋盘有个真正的正中心，空位就固定插在那里。
  if (flat.length < rows * cols) flat.splice((rows >> 1) * cols + (cols >> 1), 0, 0);
  const grid = [];
  for (let r = 0; r < rows; r++) grid.push(flat.slice(r * cols, r * cols + cols));
  ensureAdjacentPair(grid);
  return grid;
}

// 兜底：万一一开局就没有相邻同款，就把某一对中的一个换到另一个旁边。
function ensureAdjacentPair(grid) {
  if (hasAdjacentPair(grid)) return grid;
  const rows = grid.length;
  const cols = grid[0] ? grid[0].length : 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = grid[r][c];
      if (!k) continue;
      // 找一个同款的远处伙伴，把它挪到 (r,c) 旁边
      for (let r2 = 0; r2 < rows; r2++) {
        for (let c2 = 0; c2 < cols; c2++) {
          if ((r2 === r && c2 === c) || grid[r2][c2] !== k) continue;
          for (const [dr, dc] of DIRS) {
            const nr = r + dr;
            const nc = c + dc;
            if (!inside(grid, nr, nc) || grid[nr][nc] === k) continue;
            const tmp = grid[nr][nc];
            grid[nr][nc] = k;
            grid[r2][c2] = tmp;
            if (hasAdjacentPair(grid)) return grid;
            // 没成（换走的那格把同款又拆开了）就换回来继续找
            grid[r2][c2] = k;
            grid[nr][nc] = tmp;
          }
        }
      }
    }
  }
  return grid;
}

// 按住 (r,c) 沿 (dr,dc) 拖动时，跟着一起走的一组 = 自己 + 该方向上「紧挨着」的连续 emoji。
// 撞到空格就停：空格后面的 emoji 不跟着走（想动它们，就得直接按住它们拖）。
// 能滑多远 = 这一组最后一个 emoji 前面连续有几格空白（它后面一定是空格或棋盘边缘）。
function slideParams(grid, r, c, dr, dc) {
  const cells = [];
  for (let i = 0; ; i++) {
    const nr = r + dr * i;
    const nc = c + dc * i;
    if (!inside(grid, nr, nc)) break;
    if (!grid[nr][nc]) break; // 遇到空格中断，空格之后的不跟着走
    cells.push([nr, nc]);
  }
  if (!cells.length) return null;
  const last = cells[cells.length - 1];
  const lr = last[0];
  const lc = last[1];
  let maxShift = 0;
  for (let s = 1; ; s++) {
    const nr = lr + dr * s;
    const nc = lc + dc * s;
    if (!inside(grid, nr, nc) || grid[nr][nc]) break;
    maxShift += 1;
  }
  return { cells, maxShift };
}

// 把一组的每个成员沿 (dr,dc) 平移 k 格（k 由调用方保证不超过 maxShift）
function shiftGroup(grid, cells, dr, dc, k) {
  const next = clone(grid);
  for (const cell of cells) next[cell[0]][cell[1]] = 0;
  for (const cell of cells) next[cell[0] + dr * k][cell[1] + dc * k] = grid[cell[0]][cell[1]];
  return next;
}

// 消除 (r,c) 与它的同款邻居，(r,c) 优先；返回 [两个格子] 或 null
function matchPair(grid, r, c) {
  const partner = findPartner(grid, r, c);
  return partner ? [[r, c], partner] : null;
}

// 把一对从盘面抹掉（返回新盘面；不是相邻同款时返回 null，方便校验）
function clearPair(grid, a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return null;
  const [r1, c1] = a;
  const [r2, c2] = b;
  if (!inside(grid, r1, c1) || !inside(grid, r2, c2)) return null;
  const kind = grid[r1][c1];
  if (!kind || grid[r2][c2] !== kind) return null;
  if (Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1) return null;
  const next = clone(grid);
  next[r1][c1] = 0;
  next[r2][c2] = 0;
  return next;
}

function countTiles(grid) {
  let n = 0;
  for (const row of grid) for (const v of row) if (v) n += 1;
  return n;
}

// 还有没有可走的棋：① 直接点就能消（相邻同款）；② 沿某个方向滑 1..maxShift 格后，
// 落点四周有同款（滑行的判定只认「按住的那张」的落点）。
// 两种情况都没有 = 死局，游戏会重排棋盘（见 reshuffleBoard）。
function hasAnyMove(grid) {
  if (!grid.length || !grid[0] || !grid[0].length) return false;
  const rows = grid.length;
  const cols = grid[0].length;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!grid[r][c]) continue;
      if (findPartner(grid, r, c)) return true;
      for (const [dr, dc] of DIRS) {
        const info = slideParams(grid, r, c, dr, dc);
        if (!info) continue;
        // maxShift 最多也就 10，逐格试，别漏掉「滑两格才碰上」的走法
        for (let k = 1; k <= info.maxShift; k++) {
          const next = shiftGroup(grid, info.cells, dr, dc, k);
          if (findPartner(next, r + dr * k, c + dc * k)) return true;
        }
      }
    }
  }
  return false;
}

// 死局重排：先试「位置与空格都不动、只把剩下的 emoji 重新分配一遍」（最不破坏局面），
// 不行再真的挪位置（见 repairPair）。剩下的同款张数恒为偶数（每次消除都成对拿走），
// 所以一定有某种类至少两张，修得出来。
function reshuffleBoard(grid, rand = Math.random) {
  const cells = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[0].length; c++) if (grid[r][c]) cells.push([r, c]);
  }
  const kinds = cells.map(cell => grid[cell[0]][cell[1]]);
  for (let attempt = 0; attempt < 25; attempt++) {
    const next = clone(grid);
    const shuffled = shuffle(kinds, rand);
    cells.forEach((cell, i) => { next[cell[0]][cell[1]] = shuffled[i]; });
    if (hasAnyMove(next)) return next;
  }
  return repairPair(grid, cells, kinds, rand);
}

// 兜底：把某一对同款挪到同一行或同一列 —— 滑过去一定能让它们相邻，所以必定可消。
// 必须真的挪位置：只剩最后一对时怎么换种类都一样、位置也没变，
// 而两张既不同行也不同列时，任何一次滑动都够不到彼此（滑完不满足消除就会弹回，位置留不下来）。
function repairPair(grid, cells, kinds, rand) {
  const base = clone(grid);
  const shuffled = shuffle(kinds, rand);
  cells.forEach((cell, i) => { base[cell[0]][cell[1]] = shuffled[i]; });
  let checked = 0;
  for (const [r, c] of cells) {
    const k = base[r][c];
    for (const [r2, c2] of cells) {
      if ((r2 === r && c2 === c) || base[r2][c2] !== k) continue;
      // 把 (r2,c2) 这张挪到「和 (r,c) 同行」或「同列」的每个格子上试一遍。
      // 每次都基于 base 生成一份新盘面（试不成不留痕，别把张数搅乱）。
      for (let i = 0; i < grid[0].length; i++) {
        const cand = moved(base, r2, c2, r, i, k);
        if (cand && hasAnyMove(cand)) return cand;
      }
      for (let i = 0; i < grid.length; i++) {
        const cand = moved(base, r2, c2, i, c, k);
        if (cand && hasAnyMove(cand)) return cand;
      }
      if (++checked > 40) return base; // 兜到一定次数就收手，别在极端盘面上卡太久
    }
  }
  return base;
}

// 把 (r2,c2) 的牌挪到 (r,c)；目标格上原来的东西（空格或别的牌）换到 (r2,c2)。
// 挪不动（目标是自己、或目标已经是同款那张）返回 null。base 本身不动。
function moved(base, r2, c2, r, c, k) {
  if (r2 === r && c2 === c) return null;
  if (base[r][c] === k) return null;
  const next = clone(base);
  next[r][c] = k;
  next[r2][c2] = base[r][c];
  return next;
}

module.exports = {
  MIN,
  MAX,
  CAP_LEVEL,
  TIME_FLOOR,
  GLYPHS,
  DIRS,
  levelConfig,
  glyphFor,
  totalPairs,
  shuffle,
  clone,
  inside,
  findPartner,
  hasAdjacentPair,
  makeBoard,
  ensureAdjacentPair,
  slideParams,
  shiftGroup,
  matchPair,
  clearPair,
  countTiles,
  hasAnyMove,
  reshuffleBoard,
};
