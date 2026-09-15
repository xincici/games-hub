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
// 难度由「面板大小 + emoji 种类 + 步数 + 目标分 + 墙数 + 特殊元素概率」共同决定，
// 第 30 关全部到顶，之后关数继续增长但难度不再上升。各因素随关卡线性爬升：
//   列数 7 → 9、行数 7 → 10（面板 7×7 → 9×10）
//   种类 5 → 7
//   步数 20 → 17
//   目标分 700 → 2100（由离线模拟校准：见下）
//   墙   0 → 12
//   炸弹概率 2% → 5%、万能元素 3% → 5%
export const MAX_LEVEL = 30;

// 目标分的上限：模拟显示 9×10、7 种、17 步的一局得分中位数约 2000，取 2100 作为最高门槛
const CAP = { cols: 9, rows: 10, kinds: 7, moves: 17, target: 2100, walls: 12, bomb: 0.05, wild: 0.05 };

export function levelConfig(level) {
  const lv = Math.max(1, Math.floor(level) || 1);
  const t = Math.min(1, (lv - 1) / (MAX_LEVEL - 1));
  // 各因素到顶的时点刻意错开（列 21 关、种类 27 关、行 30 关），
  // 否则两条曲线会在同一关同时跳档，难度出现明显的断崖
  const ramp = span => Math.min(1, t / span);
  return {
    level: lv,
    cols: Math.round(7 + (CAP.cols - 7) * ramp(0.70)),
    rows: Math.round(7 + (CAP.rows - 7) * ramp(1)),
    kinds: Math.round(5 + (CAP.kinds - 5) * ramp(0.90)),
    moves: Math.round(20 + (CAP.moves - 20) * t),
    target: Math.round(700 + (CAP.target - 700) * t),
    walls: Math.round(CAP.walls * t),
    bombChance: 0.02 + (CAP.bomb - 0.02) * t,
    wildChance: 0.03 + (CAP.wild - 0.03) * t,
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
// 规则：一条线（行 / 列）上，某个种类的连续块 = 连续的「该种 emoji 或钻石」，
// 块长度 ≥ 3 且块里真的有该种 emoji，整块（含钻石）一起消。
// 按种类分别扩展，钻石就能跟着它旁边真正成组的那一边走——
// 老的「从左到右一次扫描」写法会把钻石判给左边那一组，
// 于是 🍎💎🍌🍌🍌 里紧挨着三连香蕉的钻石反而不会被消掉。
// 整块全是钻石时不消（钻石不能自己凑一组把自己消掉）
function scanLine(board, line, matched) {
  const kinds = new Set();
  for (const idx of line) {
    const v = board[idx];
    if (isEmoji(v)) kinds.add(v);
  }
  for (const kind of kinds) {
    let run = [];
    let real = 0;
    const flush = () => {
      if (run.length >= 3 && real) run.forEach(i => matched.add(i));
      run = [];
      real = 0;
    };
    for (const idx of line) {
      const v = board[idx];
      if (v === kind) {
        run.push(idx);
        real++;
      } else if (v === WILD) {
        run.push(idx);
      } else {
        flush();
      }
    }
    flush();
  }
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
