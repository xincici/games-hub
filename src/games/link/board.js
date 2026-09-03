// 连连看核心逻辑（纯函数，无框架依赖）
//
// board 为 H×W 的二维数组，元素为 emoji 字符串或 null（已消除）。
// walls 为可选的 H×W 0/1 网格：1 表示不可穿过的墙壁（阻挡连线，
// 也不放牌），与已消除的空格是两种概念。
// 连线规则：两张同 emoji 牌之间最多 2 个转折（3 段直线），
// 路径可借用棋盘外一圈虚拟空格，路径上不能有其他牌或墙壁。

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

// 逆向生成保证可解：从空盘开始，每一步在「当前盘面上互相连通」的
// 两个空位上放一对相同 emoji。正向游玩时按加入的相反顺序消除即可通关
// （消除第 k 对时盘面恰好等于生成时放入第 k 对的盘面）。
// pairs 可小于 H*W/2：未用到的格子保持空白，emoji 随机散布在扩大的矩阵里。
// walls（可选）先于牌放置：墙格既不放牌也阻挡连线，连通性判断含墙。
// 返回 { board, solution }，solution 为按生成顺序加入的坐标对。
export function generateSolvable(H, W, emojis, rand = Math.random, pairs = (H * W) / 2, walls) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const board = Array.from({ length: H }, () => Array.from({ length: W }, () => null));
    const emptyCells = [];
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (!(walls && walls[r] && walls[r][c])) emptyCells.push([r, c]);
    }
    const pool = shuffled(emojis, rand).slice(0, pairs);
    const solution = [];
    let placed = 0;
    let stuck = false;
    while (placed < pairs) {
      // 随机顺序扫描空位对，攒够少量可连通候选即随机取一，
      // 避免每步全量枚举（留白越多越容易命中）
      const order = shuffled(emptyCells.map((_, i) => i), rand);
      const candidates = [];
      scan:
      for (let a = 0; a < order.length; a++) {
        const [r1, c1] = emptyCells[order[a]];
        for (let b = a + 1; b < order.length; b++) {
          const [r2, c2] = emptyCells[order[b]];
          if (findPath(board, H, W, r1, c1, r2, c2, walls)) {
            candidates.push([order[a], order[b]]);
            if (candidates.length >= 6) break scan;
          }
        }
      }
      if (!candidates.length) { stuck = true; break; }
      const [i, j] = candidates[~~(rand() * candidates.length)];
      const p1 = emptyCells[i];
      const p2 = emptyCells[j];
      // order 乱序，i/j 大小不定，必须先删较大的索引
      const [lo, hi] = i < j ? [i, j] : [j, i];
      emptyCells.splice(hi, 1);
      emptyCells.splice(lo, 1);
      board[p1[0]][p1[1]] = pool[placed];
      board[p2[0]][p2[1]] = pool[placed];
      solution.push([p1, p2]);
      placed++;
    }
    if (!stuck) return { board, solution };
  }
  // 兜底：按阅读顺序把每对牌左右相邻摆放——任意顺序都可通过（0 转折互达）
  const board = Array.from({ length: H }, () => Array.from({ length: W }, () => null));
  const pool = shuffled(emojis, rand).slice(0, pairs);
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
