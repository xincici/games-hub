// 消消乐核心逻辑（纯函数，无框架依赖，便于 node 验证与关卡难度校准）
//
// board 为 cols×rows 的一维数组，元素含义：
//   0 ~ kinds-1 普通 emoji 种类
//   null        空格（待下落填充）
//   WALL        不可消除的墙：不参与消除、不参与交换、不下落，但 emoji 下落时可以穿过
//   BOMB        炸弹：可下落/可交换但自身不参与连线；相邻格被消除时引爆，炸掉自己周围的格子
//   WILD        万能元素：可当作任意一种 emoji 参与连线判定

export const WALL = -1;
export const BOMB = -2;
export const WILD = -3;

export const isWall = v => v === WALL;
export const isEmoji = v => typeof v === 'number' && v >= 0;
export const isSpecial = v => v === BOMB || v === WILD;
// 会随重力下落的实体（墙与空格除外）
export const isTile = v => v !== null && v !== WALL && v !== undefined;

// ---------- 关卡配置 ----------
// 面板随关卡从小到大，第 6 关起固定在 9×10；墙与特殊元素随关卡增多，步数逐步收紧。
// target 是过关分数线（与步数限制共同构成难度），数值由离线模拟校准。
const CURVE = [
  // level, cols, rows, kinds, moves, target, walls, bomb%, wild%
  [1, 7, 7, 5, 20, 700, 0, 2, 3],
  [2, 7, 8, 5, 20, 900, 0, 2, 3],
  [3, 7, 9, 6, 20, 1100, 2, 3, 3],
  [4, 8, 9, 6, 19, 1250, 3, 3, 3],
  [5, 8, 10, 6, 19, 1400, 4, 4, 4],
  [6, 9, 10, 7, 18, 1400, 5, 4, 4],
  [7, 9, 10, 7, 18, 1450, 6, 4, 4],
  [8, 9, 10, 7, 18, 1550, 7, 5, 4],
  [9, 9, 10, 7, 17, 1650, 8, 5, 4],
  [10, 9, 10, 7, 17, 1750, 9, 5, 5],
];
const LAST = CURVE[CURVE.length - 1];

export function levelConfig(level) {
  const lv = Math.max(1, Math.floor(level) || 1);
  const row = lv <= CURVE.length ? CURVE[lv - 1] : null;
  // 10 关之后：盘面与元素数固定，目标分每关 +70 但封顶 2100（难度靠「目标/步数」稳定下来）
  const extra = lv > CURVE.length ? Math.min(350, (lv - CURVE.length) * 70) : 0;
  return {
    level: lv,
    cols: row ? row[1] : LAST[1],
    rows: row ? row[2] : LAST[2],
    kinds: row ? row[3] : LAST[3],
    moves: row ? row[4] : LAST[4],
    target: row ? row[5] : LAST[5] + extra,
    walls: row ? row[6] : Math.min(12, LAST[6] + Math.floor((lv - CURVE.length) / 2)),
    bombChance: (row ? row[7] : LAST[7]) / 100,
    wildChance: (row ? row[8] : LAST[8]) / 100,
  };
}

// ---------- 工具 ----------

export function neighbors4(idx, cols, rows) {
  const r = ~~(idx / cols), c = idx % cols;
  const out = [];
  if (r > 0) out.push(idx - cols);
  if (r < rows - 1) out.push(idx + cols);
  if (c > 0) out.push(idx - 1);
  if (c < cols - 1) out.push(idx + 1);
  return out;
}

export function neighbors8(idx, cols, rows) {
  const r = ~~(idx / cols), c = idx % cols;
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push(nr * cols + nc);
    }
  }
  return out;
}

export function adjacent(a, b, cols) {
  const [r1, c1] = [~~(a / cols), a % cols];
  const [r2, c2] = [~~(b / cols), b % cols];
  return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
}

// 新牌取值：按概率产出炸弹 / 万能元素
function randomValue(kinds, opts, rand) {
  const r = rand();
  const bomb = opts.bombChance || 0;
  const wild = opts.wildChance || 0;
  if (r < bomb) return BOMB;
  if (r < bomb + wild) return WILD;
  return ~~(rand() * kinds);
}

// ---------- 盘面生成 ----------

export function generateBoard(cols, rows, kinds, opts = {}, rand = Math.random) {
  const walls = opts.walls || 0;
  const specials = opts.initials || 0;
  for (let attempt = 0; attempt < 60; attempt++) {
    const board = new Array(cols * rows).fill(null);
    // 随机撒墙（不重复）
    const wallSet = new Set();
    for (let i = 0; i < walls * 6 && wallSet.size < walls; i++) wallSet.add(~~(rand() * cols * rows));
    wallSet.forEach(i => { board[i] = WALL; });
    const free = [];
    for (let i = 0; i < board.length; i++) if (board[i] !== WALL) free.push(i);
    if (free.length < 12) continue;
    // 主体：逐个填空，避开与左二 / 上二相同（不产生现成三连）
    for (const idx of free) {
      const r = ~~(idx / cols), c = idx % cols;
      let v, guard = 0;
      do {
        v = ~~(rand() * kinds);
        guard++;
      } while (guard < 30 && (
        (c >= 2 && board[idx - 1] === v && board[idx - 2] === v)
        || (r >= 2 && board[idx - cols] === v && board[idx - cols * 2] === v)
      ));
      board[idx] = v;
    }
    // 撒特殊元素：只放在不会立刻凑成连线的格子上
    let placed = 0;
    for (let i = 0; i < specials * 10 && placed < specials; i++) {
      const idx = free[~~(rand() * free.length)];
      const save = board[idx];
      board[idx] = rand() < 0.5 ? BOMB : WILD;
      if (findMatches(board, cols, rows).size) board[idx] = save;
      else placed++;
    }
    if (!findMatches(board, cols, rows).size && hasAnyMove(board, cols, rows, kinds)) return board;
  }
  // 兜底：纯 emoji 盘面
  const board = new Array(cols * rows).fill(0);
  for (let i = 0; i < board.length; i++) board[i] = ~~(rand() * kinds);
  return board;
}

// ---------- 连线判定（万能元素可充当任意种类） ----------

function scanLine(board, line, matched) {
  let run = [];
  let kind = null;
  const flush = () => {
    if (run.length >= 3) run.forEach(i => matched.add(i));
    run = [];
    kind = null;
  };
  for (const idx of line) {
    const v = board[idx];
    if (v === WILD) {
      run.push(idx);          // 通配：可以接在任何一段里
      continue;
    }
    if (!isEmoji(v)) {
      flush();
      continue;
    }
    if (kind === null) {
      kind = v;
      run.push(idx);
    } else if (v === kind) {
      run.push(idx);
    } else {
      flush();
      kind = v;
      run = [idx];
    }
  }
  flush();
}

export function findMatches(board, cols, rows) {
  const matched = new Set();
  for (let r = 0; r < rows; r++) {
    const line = [];
    for (let c = 0; c < cols; c++) line.push(r * cols + c);
    scanLine(board, line, matched);
  }
  for (let c = 0; c < cols; c++) {
    const line = [];
    for (let r = 0; r < rows; r++) line.push(r * cols + c);
    scanLine(board, line, matched);
  }
  return matched;
}

// ---------- 爆炸 ----------

// 传入本轮被消除的格子，返回被炸弹波及的格子（含链式引爆）。
// 触发：某炸弹的四邻里有格子被消除；波及：该炸弹周围 8 格（3×3）内所有实体（墙除外）
export function explode(board, cols, rows, cleared) {
  const blast = new Set();
  const bombs = new Set();
  let frontier = [...cleared];
  let guard = 0;
  while (frontier.length && guard++ < 30) {
    const nextFrontier = [];
    for (const idx of frontier) {
      for (const nb of neighbors4(idx, cols, rows)) {
        if (board[nb] !== BOMB || bombs.has(nb)) continue;
        bombs.add(nb);
        for (const cell of [nb, ...neighbors8(nb, cols, rows)]) {
          const v = board[cell];
          if (v === null || v === WALL || blast.has(cell)) continue;
          blast.add(cell);
          nextFrontier.push(cell);
        }
      }
    }
    frontier = nextFrontier;
  }
  return { blast, bombs };
}

// ---------- 交换校验 ----------

export function hasMatchAfterSwap(board, cols, rows, a, b) {
  if (!isTile(board[a]) || !isTile(board[b])) return false;
  const next = [...board];
  [next[a], next[b]] = [next[b], next[a]];
  return findMatches(next, cols, rows).size > 0;
}

export function hasAnyMove(board, cols, rows, kinds) {
  for (let i = 0; i < board.length; i++) {
    if (!isTile(board[i])) continue;
    const r = ~~(i / cols), c = i % cols;
    if (c + 1 < cols && hasMatchAfterSwap(board, cols, rows, i, i + 1)) return true;
    if (r + 1 < rows && hasMatchAfterSwap(board, cols, rows, i, i + cols)) return true;
  }
  return false;
}

// ---------- 重力（墙不挡下落，emoji 可以穿过墙） ----------

export function applyGravity(board, cols, rows, kinds, opts = {}, rand = Math.random) {
  const next = [...board];
  for (let c = 0; c < cols; c++) {
    const rowsOk = [];
    for (let r = 0; r < rows; r++) if (next[r * cols + c] !== WALL) rowsOk.push(r);
    // 自下而上收集现有实体（顺序保持）
    const stack = [];
    for (let i = rowsOk.length - 1; i >= 0; i--) {
      const v = next[rowsOk[i] * cols + c];
      if (isTile(v)) stack.push(v);
    }
    // 自下而上回填，靠上的剩余空位补新牌
    for (let i = rowsOk.length - 1, k = 0; i >= 0; i--, k++) {
      const r = rowsOk[i];
      next[r * cols + c] = k < stack.length ? stack[k] : randomValue(kinds, opts, rand);
    }
  }
  return next;
}

// ---------- 计分 ----------

// 3 连 30 分，每多 1 个 +20；cascade 从 1 开始，每层 ×1.5
export function scoreForMatches(count, cascade) {
  const base = 30 + Math.max(0, count - 3) * 20;
  return Math.round(base * Math.pow(1.5, cascade - 1));
}

// 被炸掉的格子按个计分（含炸弹自身）
export const SCORE_PER_BLAST = 25;

export function scoreForBlast(count, cascade) {
  return Math.round(count * SCORE_PER_BLAST * Math.pow(1.5, cascade - 1));
}

// 无解时重洗：保持墙与特殊元素位置，只重排普通 emoji
export function reshuffle(board, cols, rows, kinds, rand = Math.random) {
  for (let t = 0; t < 100; t++) {
    const next = board.map(v => (isSpecial(v) || isWall(v) ? v : ~~(rand() * kinds)));
    if (!findMatches(next, cols, rows).size && hasAnyMove(next, cols, rows, kinds)) return next;
  }
  return board;
}

// ---------- 供离线校准用：走一步 ----------

export function findBestSwap(board, cols, rows) {
  let best = null;
  for (let i = 0; i < board.length; i++) {
    if (!isTile(board[i])) continue;
    const r = ~~(i / cols), c = i % cols;
    const pairs = [];
    if (c + 1 < cols) pairs.push([i, i + 1]);
    if (r + 1 < rows) pairs.push([i, i + cols]);
    for (const [a, b] of pairs) {
      if (!hasMatchAfterSwap(board, cols, rows, a, b)) continue;
      const trial = [...board];
      [trial[a], trial[b]] = [trial[b], trial[a]];
      const size = findMatches(trial, cols, rows).size;
      if (!best || size > best.size) best = { a, b, size };
    }
  }
  return best;
}

// 模拟一次完整回合（交换 → 连锁结算），返回 { board, gained, cascades }
export function resolveTurn(board, cols, rows, kinds, a, b, opts = {}, rand = Math.random) {
  let cur = [...board];
  [cur[a], cur[b]] = [cur[b], cur[a]];
  let gained = 0;
  let cascade = 0;
  for (;;) {
    const matched = findMatches(cur, cols, rows);
    if (!matched.size) break;
    cascade++;
    const { blast } = explode(cur, cols, rows, matched);
    const all = new Set([...matched, ...blast]);
    gained += scoreForMatches(matched.size, cascade) + scoreForBlast(blast.size, cascade);
    cur = cur.map((v, i) => (all.has(i) ? null : v));
    cur = applyGravity(cur, cols, rows, kinds, opts, rand);
  }
  return { board: cur, gained, cascades: cascade };
}
