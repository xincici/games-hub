// 连连看核心逻辑（纯函数，无框架依赖）
//
// board 为 H×W 的二维数组，元素为 emoji 字符串或 null（已消除）。
// walls 为可选的 H×W 0/1 网格：1 表示不可穿过的墙壁（阻挡连线，
// 也不放牌），与已消除的空格是两种概念。
// 连线规则：两张同 emoji 牌之间最多 2 个转折（3 段直线），
// 路径可借用棋盘外一圈虚拟空格，路径上不能有其他牌或墙壁。

// ---------- 关卡配置 ----------
// 难度由「棋盘大小 + emoji 种类 + 牌数 + 墙数 + 限时」共同决定，第 30 关全部到顶，
// 之后关数继续增长但难度不再上升。各因素随关卡线性爬升：
//   列数 6 → 9（上限 9 列：10 列时手机上一格只有 30 多 px，emoji 太小）
//   行数 6 → 12（上限 12 行）
//   对数 9 → 30（牌 18 → 60 张）
//   种类 6 → 12
//   墙   0 → 18 面
//   限时 = 对数 × 每对秒数，每对 8s → 5s（靠盘面加难，不靠硬卡时间）
export const MAX_LEVEL = 30;

const CAP = { cols: 9, rows: 12, pairs: 30, kinds: 12, walls: 18, perPair: 5 };

export function levelConfig(level) {
  const lv = Math.max(1, Math.floor(level) || 1);
  const t = Math.min(1, (lv - 1) / (MAX_LEVEL - 1));
  const rows = Math.round(6 + (CAP.rows - 6) * t);
  const cols = Math.round(6 + (CAP.cols - 6) * t);
  const pairs = Math.round(9 + (CAP.pairs - 9) * t);
  const kinds = Math.round(6 + (CAP.kinds - 6) * t);
  const walls = Math.round(CAP.walls * t);
  const perPair = 8 - (8 - CAP.perPair) * t;
  return {
    level: lv,
    rows,
    cols,
    pairs,
    kinds,
    walls,
    time: Math.round(pairs * perPair),
  };
}

// 每种 emoji 都可以出现多对（偶数张即可）：先给每种至少一对，剩下的按对随机加到各种类上
export function buildPairPool(emojiPool, pairs, kinds, rand = Math.random) {
  const use = Math.max(2, Math.min(kinds || emojiPool.length, emojiPool.length, pairs));
  const picked = shuffled(emojiPool, rand).slice(0, use);
  const counts = new Array(use).fill(2);
  const extra = (pairs * 2 - use * 2) / 2;   // 还能再分出去的对数
  for (let i = 0; i < extra; i++) counts[~~(rand() * use)] += 2;
  const pool = [];
  counts.forEach((n, i) => { for (let k = 0; k < n / 2; k++) pool.push(picked[i]); });
  return shuffled(pool, rand);
}

// 严格位于 a、b 之间的格子是否全部为空（a、b 自身不参与判断）
function lineClear(board, H, W, r1, c1, r2, c2, walls) {
  if (r1 === r2) {
    const [from, to] = c1 < c2 ? [c1 + 1, c2 - 1] : [c2 + 1, c1 - 1];
    for (let c = from; c <= to; c++) {
      if (blocked(board, H, W, r1, c, walls)) return false;
    }
    return true;
  }
  if (c1 === c2) {
    const [from, to] = r1 < r2 ? [r1 + 1, r2 - 1] : [r2 + 1, r1 - 1];
    for (let r = from; r <= to; r++) {
      if (blocked(board, H, W, r, c1, walls)) return false;
    }
    return true;
  }
  return false;
}

// 棋盘外一圈视为空格，不阻挡
function blocked(board, H, W, r, c, walls) {
  if (r < 0 || r >= H || c < 0 || c >= W) return false;
  // walls 可能是空数组（无墙局）或行不完整的存档，逐级防御
  if (walls && walls[r] && walls[r][c]) return true;
  return board[r][c] != null;
}

function empty(board, H, W, r, c, walls) {
  return !blocked(board, H, W, r, c, walls);
}

// 查找 p1→p2 的连线（≤2 转折），返回途径点序列（含端点与拐点，
// 拐点坐标可能落在棋盘外一圈 -1..H / -1..W），不可达返回 null
export function findPath(board, H, W, r1, c1, r2, c2, walls) {
  // 0 转折
  if ((r1 === r2 || c1 === c2) && lineClear(board, H, W, r1, c1, r2, c2, walls)) {
    return [[r1, c1], [r2, c2]];
  }
  // 1 转折：经由 (r1,c2) 或 (r2,c1)
  for (const [cr, cc] of [[r1, c2], [r2, c1]]) {
    if (empty(board, H, W, cr, cc, walls)
      && lineClear(board, H, W, r1, c1, cr, cc, walls)
      && lineClear(board, H, W, cr, cc, r2, c2, walls)) {
      return [[r1, c1], [cr, cc], [r2, c2]];
    }
  }
  // 2 转折：先沿 p1 所在行（或列）走出一步，再经一条平行的中线抵达 p2
  for (let cc = -1; cc <= W; cc++) {
    if (cc === c1 || cc === c2) continue;
    if (empty(board, H, W, r1, cc, walls) && empty(board, H, W, r2, cc, walls)
      && lineClear(board, H, W, r1, c1, r1, cc, walls)
      && lineClear(board, H, W, r1, cc, r2, cc, walls)
      && lineClear(board, H, W, r2, cc, r2, c2, walls)) {
      return [[r1, c1], [r1, cc], [r2, cc], [r2, c2]];
    }
  }
  for (let rr = -1; rr <= H; rr++) {
    if (rr === r1 || rr === r2) continue;
    if (empty(board, H, W, rr, c1, walls) && empty(board, H, W, rr, c2, walls)
      && lineClear(board, H, W, r1, c1, rr, c1, walls)
      && lineClear(board, H, W, rr, c1, rr, c2, walls)
      && lineClear(board, H, W, rr, c2, r2, c2, walls)) {
      return [[r1, c1], [rr, c1], [rr, c2], [r2, c2]];
    }
  }
  return null;
}

function shuffled(list, rand) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = ~~(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 随机生成牌局：从全部可用格子里随机挑 pairs 对位置放牌，不保证
// 逐对可解（难度更高，死局交给游戏内自动重排），只要求初盘有解。
// 放置时优先让牌与已放的牌互不相邻（上下左右），相邻对尽量少。
// walls（可选）先于牌放置：墙格既不放牌也阻挡连线。
// pool 为「每张牌占一个元素、同 emoji 出现偶数次」的牌池（长度即对数 ×2）。
// 返回 { board, solution }，solution 为按生成顺序加入的坐标对（调试用）。
export function generateWithPool(H, W, pool, walls, rand = Math.random) {
  const pairs = pool.length;
  for (let attempt = 0; attempt < 40; attempt++) {
    const board = Array.from({ length: H }, () => Array.from({ length: W }, () => null));
    const freeCells = [];
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (!(walls && walls[r] && walls[r][c])) freeCells.push([r, c]);
    }
    if (freeCells.length < pairs * 2) break;
    // 干净格池：当前与任何已放牌都不相邻的空位
    const cleanCells = freeCells.map(p => p);
    const solution = [];
    let placed = 0;
    let stuck = false;
    while (placed < pairs) {
      const picks = pickPair(freeCells, board, H, W, rand, cleanCells);
      if (!picks) { stuck = true; break; }
      const [p1, p2] = picks;
      board[p1[0]][p1[1]] = pool[placed];
      board[p2[0]][p2[1]] = pool[placed];
      solution.push([p1, p2]);
      placed++;
      removeFrom(freeCells, p1);
      removeFrom(freeCells, p2);
      removeFrom(cleanCells, p1);
      removeFrom(cleanCells, p2);
      dirtyNeighbors(cleanCells, p1[0], p1[1]);
      dirtyNeighbors(cleanCells, p2[0], p2[1]);
    }
    if (!stuck && hasMove(board, H, W, walls)) return { board, solution };
  }
  // 兜底：按阅读顺序把每对牌左右相邻摆放——0 转折互达必有解
  const board = Array.from({ length: H }, () => Array.from({ length: W }, () => null));
  const solution = [];
  const cells = [];
  for (let r = 0; r < H; r++) for (let c = 0; c + 1 < W; c++) {
    if (!blocked(board, H, W, r, c, walls) && !blocked(board, H, W, r, c + 1, walls)) cells.push([r, c]);
  }
  let placed = 0;
  for (const [r, c] of cells) {
    if (placed >= pairs) break;
    board[r][c] = pool[placed];
    board[r][c + 1] = pool[placed];
    solution.push([[r, c], [r, c + 1]]);
    placed++;
  }
  return { board, solution };
}

// 兼容旧签名：从一个 emoji 池里取 pairs 对（每种至多一对）
export function generateSolvable(H, W, emojis, rand = Math.random, pairs = (H * W) / 2, walls) {
  const pool = shuffled(emojis, rand).slice(0, pairs);
  return generateWithPool(H, W, pool, walls, rand);
}

// 随机布墙：count 面墙随机撒在盘面上（墙格不放牌、阻挡连线）
export function generateWalls(H, W, count, rand = Math.random) {
  const grid = Array.from({ length: H }, () => new Array(W).fill(0));
  if (!count) return grid;
  const cells = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) cells.push([r, c]);
  shuffled(cells, rand).slice(0, Math.min(count, cells.length)).forEach(([r, c]) => { grid[r][c] = 1; });
  return grid;
}

// 关卡发牌：按关卡配置生成牌池（同 emoji 可出现多对）与墙，再摆盘
export function generateLevelBoard(H, W, emojiPool, cfg, rand = Math.random) {
  const pool = buildPairPool(emojiPool, cfg.pairs, cfg.kinds, rand);
  const walls = generateWalls(H, W, cfg.walls, rand);
  return { ...generateWithPool(H, W, pool, walls, rand), walls };
}

function keyOf(p) {
  return p[0] * 1000 + p[1];
}

function removeFrom(list, p) {
  const idx = list.findIndex(q => keyOf(q) === keyOf(p));
  if (idx >= 0) list.splice(idx, 1);
}

// (r,c) 四邻格上有多少张已放的牌
function neighborCount(board, H, W, r, c) {
  let n = 0;
  if (r > 0 && board[r - 1][c]) n++;
  if (r < H - 1 && board[r + 1][c]) n++;
  if (c > 0 && board[r][c - 1]) n++;
  if (c < W - 1 && board[r][c + 1]) n++;
  return n;
}

// 随机挑一对位置：维护「无相邻牌」的干净格池，优先从中取对；
// 干净格不足 2 个时才退回一般随机对（牌多时难免出现少量相邻）
function pickPair(freeCells, board, H, W, rand, cleanCells) {
  const pool = cleanCells.length >= 2 ? cleanCells : freeCells;
  if (pool.length < 2) return null;
  const i = ~~(rand() * pool.length);
  let j = ~~(rand() * pool.length);
  if (j === i) j = (j + 1) % pool.length;
  return [pool[i], pool[j]];
}

// 放一张牌后，把它的四邻格从干净池中移除（它们不再无邻）
function dirtyNeighbors(cleanCells, r, c) {
  const toRemove = new Set([[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(keyOf));
  for (let i = cleanCells.length - 1; i >= 0; i--) {
    if (toRemove.has(keyOf(cleanCells[i]))) cleanCells.splice(i, 1);
  }
}

export function generateBoard(H, W, emojis, rand, pairs, walls) {
  return generateSolvable(H, W, emojis, rand, pairs, walls).board;
}

// 死局检测：盘面上是否还存在一对可连通的同 emoji 牌
export function hasMove(board, H, W, walls) {
  const byEmoji = new Map();
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const e = board[r][c];
      if (e == null) continue;
      if (walls && walls[r] && walls[r][c]) continue;
      if (!byEmoji.has(e)) byEmoji.set(e, []);
      byEmoji.get(e).push([r, c]);
    }
  }
  for (const positions of byEmoji.values()) {
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const [r1, c1] = positions[i];
        const [r2, c2] = positions[j];
        if (findPath(board, H, W, r1, c1, r2, c2, walls)) return true;
      }
    }
  }
  return false;
}

// 死局重排：保持剩余牌的 emoji 多重集与位置集合不变，随机重摆，
// 直到存在可消除对（重试上限后原样返回，理论上极少发生）。
// 墙壁格不在 board 内（组件中单独存放），重排自然不影响墙。
export function shuffleBoard(board, H, W, rand = Math.random, walls) {
  const positions = [];
  const emojis = [];
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if (board[r][c] != null) {
        positions.push([r, c]);
        emojis.push(board[r][c]);
      }
    }
  }
  if (!emojis.length) return board;
  for (let attempt = 0; attempt < 200; attempt++) {
    const next = board.map(row => [...row]);
    const perm = shuffled(emojis, rand);
    positions.forEach(([r, c], idx) => { next[r][c] = perm[idx]; });
    if (hasMove(next, H, W, walls)) return next;
  }
  return board;
}
