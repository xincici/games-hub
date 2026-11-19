// 消消乐核心逻辑（纯函数，无框架依赖，便于 node 验证与关卡难度校准）。
// 与 web src/games/crush/board.js 同一套规则，只把 ESM 换成 CommonJS。
//
// board 为 cols×rows 的一维数组，元素含义：
//   0 ~ kinds-1 普通 emoji 种类
//   null        空格（待下落填充）
//   WALL        不可消除的墙：不参与消除、不参与交换、不下落，但 emoji 下落时可以穿过
//   BOMB        炸弹：可下落/可交换但自身不参与连线；相邻格被消除时引爆，炸掉自己周围的格子
//   WILD        万能元素：可当作任意一种 emoji 参与连线判定
//   BIG-kind    大 emoji（4 连以上合并而成，编码 BIG_BASE-kind）：可交换 / 可下落、
//               按自己的种类参与连线；被消除（连线或炸弹波及）时清掉整行 / 整列
//   FROZEN-kind 冰块：冻住的某种 emoji（kind = FROZEN - v）。
//               不参与连线、不能交换、不随重力下落（和墙一样会被穿过），
//               相邻格（含斜角）被消除时解冻变回普通 emoji。
//               把种类编码进同一个数字里，存档就不需要额外的字段

const WALL = -1;
const BOMB = -2;
const WILD = -3;
const FROZEN = -100;

// 4 连以上合并出来的「大 emoji」：把种类编码进负值（-10 - kind），
// 和普通 emoji 一样可交换 / 可下落 / 参与连线，但被消除时会清掉整行或整列。
const BIG_BASE = -10;
const isWall = v => v === WALL;
const isEmoji = v => typeof v === 'number' && v >= 0;
const isSpecial = v => v === BOMB || v === WILD;
const isFrozen = v => typeof v === 'number' && v <= FROZEN;
const isBig = v => typeof v === 'number' && v <= BIG_BASE && v > FROZEN;
const big = kind => BIG_BASE - kind;
const bigKind = v => BIG_BASE - v;
const frozenKind = v => FROZEN - v;
const freeze = kind => FROZEN - kind;
// 会随重力下落、可被交换的实体（墙、冰块与空格除外）
const isTile = v => v !== null && v !== WALL && v !== undefined && !isFrozen(v);
// 占着格子但不是可操作的牌（墙 / 冰块）——重力回填时跳过，牌从它们身上穿过
const isBlocker = v => v === WALL || isFrozen(v);

// ---------- 关卡配置 ----------
// 难度由「面板大小 + emoji 种类 + 步数 + 目标分 + 墙数 + 冰块 + 特殊元素概率」共同决定。
// 前 30 关各因素随关卡线性爬升，第 30 关结构到顶（步数在 22 → 20 之间反向收紧）：
//   列数 7 → 9、行数 7 → 10（面板 7×7 → 9×10）
//   种类 4 → 6
//   步数 22 → 20
//   目标分 1500 → 3000
//   墙   0 → 8、冰块 0 → 8
//   炸弹概率 3% → 6%、万能元素 4% → 7%
// 30 关之后面板 / 种类 / 墙 / 特殊元素都不再变，但步数与目标分继续线性上涨
// （每关 +1 步、目标分 +230），难度不会在第 30 关就固定下来。
const CAP_LEVEL = 30;

// 结构上限（列 / 种类 / 墙 / 特殊元素在第 30 关到顶）
const CAP = { cols: 9, rows: 10, kinds: 6, moves: 20, target: 3000, walls: 8, ice: 8, bomb: 0.06, wild: 0.07 };
const ICE_MAX = 14;
const ICE_GROW_STEP = 2;
const TARGET_MIN = 1500;
const EXTRA_MOVES = 1;
const EXTRA_TARGET = 230;

function levelConfig(level) {
  const lv = Math.max(1, Math.floor(level) || 1);
  const t = Math.min(1, (lv - 1) / (CAP_LEVEL - 1));
  const extra = Math.max(0, lv - CAP_LEVEL);
  // 各因素到顶的时点刻意错开（列 ~23 关、冰块 ~24 关、墙 ~27 关、种类 ~27 关、行 30 关），
  // 否则几条曲线会在同一关同时跳档，难度出现明显的断崖
  const ramp = span => Math.min(1, t / span);
  return {
    level: lv,
    cols: Math.round(7 + (CAP.cols - 7) * ramp(0.75)),
    rows: Math.round(7 + (CAP.rows - 7) * ramp(1)),
    kinds: Math.round(4 + (CAP.kinds - 4) * ramp(0.90)),
    moves: Math.round(22 + (CAP.moves - 22) * t) + extra * EXTRA_MOVES,
    target: Math.round(TARGET_MIN + (CAP.target - TARGET_MIN) * t) + extra * EXTRA_TARGET,
    walls: Math.round(CAP.walls * ramp(0.95)),
    // 冰块 0 → 8（30 关到顶），之后每 2 关再 +1、14 块封顶
    ice: Math.min(ICE_MAX, Math.round(CAP.ice * ramp(1)) + Math.floor(Math.max(0, lv - CAP_LEVEL) / ICE_GROW_STEP)),
    bombChance: 0.03 + (CAP.bomb - 0.03) * t,
    wildChance: 0.04 + (CAP.wild - 0.04) * t,
  };
}

// ---------- 工具 ----------

function neighbors4(idx, cols, rows) {
  const r = ~~(idx / cols), c = idx % cols;
  const out = [];
  if (r > 0) out.push(idx - cols);
  if (r < rows - 1) out.push(idx + cols);
  if (c > 0) out.push(idx - 1);
  if (c < cols - 1) out.push(idx + 1);
  return out;
}

function neighbors8(idx, cols, rows) {
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

function adjacent(a, b, cols) {
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

// 随机撒墙（不重复）
function placeWalls(board, cols, rows, count, rand) {
  const wallSet = new Set();
  for (let i = 0; i < count * 6 && wallSet.size < count; i++) wallSet.add(~~(rand() * cols * rows));
  wallSet.forEach(i => { board[i] = WALL; });
  return wallSet;
}

// 冰块：从随机种子格往四邻扩散成一「片」连通簇（不会四散），
// 且只冻普通 emoji——正好落在炸弹 / 万能元素上时换成一个随机普通种类
function placeIce(board, cols, rows, kinds, count, rand) {
  if (count <= 0) return 0;
  const freeIdx = [];
  for (let i = 0; i < board.length; i++) if (board[i] !== WALL) freeIdx.push(i);
  if (freeIdx.length < count) return 0;
  // 种子格可能正好被墙围住、簇长不到目标大小 —— 换种子重试几次
  for (let attempt = 0; attempt < 40; attempt++) {
    const seed = freeIdx[~~(rand() * freeIdx.length)];
    const clump = [seed];
    const taken = new Set([seed]);
    while (clump.length < count) {
      const frontier = [];
      for (const i of clump) {
        for (const nb of neighbors4(i, cols, rows)) {
          if (taken.has(nb) || board[nb] === WALL) continue;
          frontier.push(nb);
        }
      }
      if (!frontier.length) break;
      const pick = frontier[~~(rand() * frontier.length)];
      taken.add(pick);
      clump.push(pick);
    }
    if (clump.length < count) continue;
    for (const i of clump) {
      const v = board[i];
      board[i] = freeze(isEmoji(v) ? v : ~~(rand() * kinds));
    }
    return clump.length;
  }
  return 0;
}

function generateBoard(cols, rows, kinds, opts = {}, rand = Math.random) {
  const walls = opts.walls || 0;
  const specials = opts.initials || 0;
  const ice = opts.ice || 0;
  for (let attempt = 0; attempt < 60; attempt++) {
    const board = new Array(cols * rows).fill(null);
    placeWalls(board, cols, rows, walls, rand);
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
    if (placeIce(board, cols, rows, kinds, ice, rand) < ice) continue;
    if (!findMatches(board, cols, rows).size && hasAnyMove(board, cols, rows, kinds)) return board;
  }
  // 兜底：随机纯 emoji 盘面，但仍把墙与冰块照配置放上，免得难度元素整个消失
  const board = new Array(cols * rows).fill(0);
  for (let i = 0; i < board.length; i++) board[i] = ~~(rand() * kinds);
  placeWalls(board, cols, rows, walls, rand);
  placeIce(board, cols, rows, kinds, ice, rand);
  return board;
}

// ---------- 连线判定（万能元素可充当任意种类；大 emoji 按自己的种类参与） ----------
// 一条线（行 / 列）上，某个种类的连续块 = 连续的「该种 emoji / 该种大 emoji / 钻石」，
// 块长度 ≥ 3 且块里真的有该种 emoji，整块（含钻石）一起消。
// 大 emoji 算「真的该种」：它自己能凑成三连，也会在触发时清整行 / 整列。
// 整块全是钻石时不消（钻石不能自己凑一组把自己消掉）。

function scanLineRuns(board, line, dir, out) {
  const kinds = new Set();
  for (const idx of line) {
    const v = board[idx];
    if (isEmoji(v)) kinds.add(v);
    else if (isBig(v)) kinds.add(bigKind(v));
  }
  for (const kind of kinds) {
    let run = [];
    let real = 0;
    const flush = () => {
      if (run.length >= 3 && real) out.push({ cells: run.slice(), kind, dir });
      run = [];
      real = 0;
    };
    for (const idx of line) {
      const v = board[idx];
      if (v === kind || (isBig(v) && bigKind(v) === kind)) {
        run.push(idx);
        real += 1;
      } else if (v === WILD) {
        run.push(idx);
      } else {
        flush();
      }
    }
    flush();
  }
}

function findRuns(board, cols, rows) {
  const out = [];
  for (let r = 0; r < rows; r++) {
    const line = [];
    for (let c = 0; c < cols; c++) line.push(r * cols + c);
    scanLineRuns(board, line, 'row', out);
  }
  for (let c = 0; c < cols; c++) {
    const line = [];
    for (let r = 0; r < rows; r++) line.push(r * cols + c);
    scanLineRuns(board, line, 'col', out);
  }
  return out;
}

function findMatches(board, cols, rows) {
  const matched = new Set();
  for (const run of findRuns(board, cols, rows)) for (const idx of run.cells) matched.add(idx);
  return matched;
}

// ---------- 4 连以上合并成大 emoji ----------
// 一段 4+ 的连线合并成 1 个大 emoji，落在这一段的中间格（不被清掉，留下来继续玩）。
// 已经含大 emoji 的连线不再合并（否则会滚雪球）。
const MERGE_MIN = 4;

function pickSpawnCell(run, board) {
  const n = run.cells.length;
  const mid = Math.floor((n - 1) / 2);
  const order = [mid, mid - 1, mid + 1, 0, n - 1];
  for (const k of order) {
    const idx = run.cells[k];
    if (idx !== undefined && board[idx] !== WILD) return idx;
  }
  return run.cells[mid];
}

// 一轮结算最多只给 1 个大 emoji（取最长的那条连线）：不设上限的话连锁里到处是 4 连，
// 盘面会被整行清除刷爆，难度直接塌掉（实测每局会合出 15 个）。
function mergeSpawns(runs, board) {
  const spawns = new Map();
  const sorted = runs
    .filter(run => run.cells.length >= MERGE_MIN && !run.cells.some(i => isBig(board[i])))
    .sort((a, b) => b.cells.length - a.cells.length);
  if (!sorted.length) return spawns;
  const run = sorted[0];
  spawns.set(pickSpawnCell(run, board), { kind: run.kind, dir: run.dir, len: run.cells.length });
  return spawns;
}

// ---------- 爆炸 ----------

// 传入本轮被消除的格子，返回被炸弹波及的格子（含链式引爆）。
// 触发：某炸弹的四邻里有格子被消除；波及：该炸弹周围 8 格（3×3）内所有实体（墙除外）
function explode(board, cols, rows, cleared) {
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

// ---------- 解冻 ----------
// 冰块的四邻（含斜角）里有格子被消除 → 这块冰化掉。返回要解冻的格子集合
function thawTargets(board, cols, rows, cleared) {
  const out = new Set();
  for (let i = 0; i < board.length; i++) {
    if (!isFrozen(board[i])) continue;
    for (const nb of neighbors8(i, cols, rows)) {
      if (cleared.has(nb)) { out.add(i); break; }
    }
  }
  return out;
}

// 把要解冻的格子写回它下面那种 emoji（保留在原来的位置，不参与本轮消除）。
// **只化「还在盘面上的冰块」**：同一轮里已经被消除的格子是 null，不能在这里复活。
function applyThaw(board, thawed) {
  if (!thawed.size) return board;
  return board.map((v, i) => (thawed.has(i) && isFrozen(v) ? frozenKind(v) : v));
}

// ---------- 大 emoji 的整行 / 整列清除 ----------
// 触发条件：大 emoji 自己进了某条连线（按连线方向清该行 / 该列），
// 或者被炸弹波及（行 + 列一起清）。墙与冰块不清（冰块会被邻近消除化掉）。
function bigLineCells(board, cols, rows, runs, blast) {
  const dirs = new Map();
  for (const run of runs) {
    for (const idx of run.cells) {
      if (!isBig(board[idx])) continue;
      if (!dirs.has(idx)) dirs.set(idx, new Set());
      dirs.get(idx).add(run.dir);
    }
  }
  const cells = new Set();
  const sweeps = [];
  const triggered = new Set();
  for (let i = 0; i < board.length; i++) {
    if (!isBig(board[i])) continue;
    const byMatch = dirs.has(i);
    const byBlast = blast.has(i);
    if (!byMatch && !byBlast) continue;
    triggered.add(i);
    const lines = byMatch ? [...dirs.get(i)] : ['row', 'col'];
    for (const dir of lines) {
      if (dir === 'row') {
        const r = ~~(i / cols);
        sweeps.push({ dir, index: r });
        for (let c = 0; c < cols; c++) cells.add(r * cols + c);
      } else {
        const c = i % cols;
        sweeps.push({ dir, index: c });
        for (let r = 0; r < rows; r++) cells.add(r * cols + c);
      }
    }
  }
  for (const idx of [...cells]) {
    const v = board[idx];
    if (v === WALL || isFrozen(v)) cells.delete(idx);
  }
  return { cells, sweeps, triggered };
}

// 一轮结算的统一入口（在线 / 离线共用）：
//   1) 找连线 → 2) 4+ 合并成大 emoji → 3) 炸弹连锁炸 → 4) 大 emoji 清整行 / 整列
//   5) 新清掉的格子可能再波及炸弹 / 大 emoji，循环到稳定
// 返回 { runs, matched, blast, bigLines, bigSweeps, bigTriggered, cleared, spawns }
// opts.spawn === false：这一轮不合成大 emoji（场景里只在玩家自己那一步允许），
// opts.maxBig：盘面上同时最多几个大 emoji（默认 2，防止整盘都是大 emoji）
// 注意：spawns 里的格子不会进 cleared（它们要留下来变成大 emoji）。
function resolveClear(board, cols, rows, opts = {}) {
  const runs = findRuns(board, cols, rows);
  const matched = new Set();
  for (const run of runs) for (const idx of run.cells) matched.add(idx);
  if (!matched.size) {
    return {
      runs: [], matched: new Set(), blast: new Set(), bigLines: new Set(),
      bigSweeps: [], bigTriggered: new Set(), cleared: new Set(), spawns: new Map(),
    };
  }
  // 4 连在这套 emoji 种类下很常见：盘面同时最多留 2 个大 emoji，
  // 否则整盘都是大 emoji、每两步清一次整行，观感和难度都会失控
  const bigOnBoard = board.reduce((n, v) => n + (isBig(v) ? 1 : 0), 0);
  const maxBig = opts.maxBig == null ? 2 : opts.maxBig;
  const spawns = opts.spawn === false || bigOnBoard >= maxBig ? new Map() : mergeSpawns(runs, board);
  const blast = new Set();
  const bigLines = new Set();
  const bigSweeps = [];
  const bigTriggered = new Set();
  let frontier = new Set(matched);
  for (let guard = 0; guard < 8; guard++) {
    const ex = explode(board, cols, rows, frontier);
    let grew = false;
    ex.blast.forEach((idx) => {
      if (!blast.has(idx)) { blast.add(idx); grew = true; }
    });
    const big = bigLineCells(board, cols, rows, runs, blast);
    big.cells.forEach((idx) => {
      if (!matched.has(idx) && !bigLines.has(idx)) { bigLines.add(idx); grew = true; }
    });
    big.sweeps.forEach((sw) => {
      if (!bigSweeps.some(o => o.dir === sw.dir && o.index === sw.index)) bigSweeps.push(sw);
    });
    big.triggered.forEach(idx => bigTriggered.add(idx));
    if (!grew) break;
    frontier = new Set([...blast, ...bigLines]);
  }
  const cleared = new Set();
  const add = (idx) => { if (!spawns.has(idx)) cleared.add(idx); };
  matched.forEach(add);
  blast.forEach(add);
  bigLines.forEach(add);
  return { runs, matched, blast, bigLines, bigSweeps, bigTriggered, cleared, spawns };
}

// ---------- 交换校验 ----------

function hasMatchAfterSwap(board, cols, rows, a, b) {
  if (!isTile(board[a]) || !isTile(board[b])) return false;
  const next = [...board];
  [next[a], next[b]] = [next[b], next[a]];
  return findMatches(next, cols, rows).size > 0;
}

function hasAnyMove(board, cols, rows, kinds) {
  for (let i = 0; i < board.length; i++) {
    if (!isTile(board[i])) continue;
    const r = ~~(i / cols), c = i % cols;
    if (c + 1 < cols && hasMatchAfterSwap(board, cols, rows, i, i + 1)) return true;
    if (r + 1 < rows && hasMatchAfterSwap(board, cols, rows, i, i + cols)) return true;
  }
  return false;
}

// ---------- 重力（墙不挡下落，emoji 可以穿过墙） ----------

function applyGravity(board, cols, rows, kinds, opts = {}, rand = Math.random) {
  const next = [...board];
  for (let c = 0; c < cols; c++) {
    const rowsOk = [];
    // 墙与冰块都不参与本列的堆叠 / 回填：上方的牌直接从它们身上落过去
    for (let r = 0; r < rows; r++) if (!isBlocker(next[r * cols + c])) rowsOk.push(r);
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
// 基础分给足 + 连锁加成线性封顶 + 炸弹每格分值减半：
// 过关主要靠稳稳地消，连锁与炸弹只是加分项。
const MATCH_BASE = 60;
const MATCH_EXTRA = 35;
const CHAIN_STEP = 0.3;
const CHAIN_MAX = 2;
const SCORE_PER_BLAST = 12;
const SCORE_PER_LINE = 12;      // 整行 / 整列清掉的格子（整行本身格数多，单价要低）
const BIG_TRIGGER_BONUS = 80;   // 每触发一次大 emoji

// 连锁倍率：1 → 1.3 → 1.6 → 1.9 → 2（第 5 层起封顶）
function chainMultiplier(cascade) {
  return Math.min(CHAIN_MAX, 1 + CHAIN_STEP * Math.max(0, cascade - 1));
}

function scoreForMatches(count, cascade) {
  const base = MATCH_BASE + Math.max(0, count - 3) * MATCH_EXTRA;
  return Math.round(base * chainMultiplier(cascade));
}

function scoreForBlast(count, cascade) {
  return Math.round(count * SCORE_PER_BLAST * chainMultiplier(cascade));
}

function scoreForBigLines(count, cascade, triggers = 1) {
  if (!count && !triggers) return 0;
  return Math.round((count * SCORE_PER_LINE + triggers * BIG_TRIGGER_BONUS) * chainMultiplier(cascade));
}

// 无解时重洗：保持墙与特殊元素 / 冰块位置，只重排普通 emoji
function reshuffle(board, cols, rows, kinds, rand = Math.random) {
  for (let t = 0; t < 100; t++) {
    const next = board.map(v => (isSpecial(v) || isBig(v) || isWall(v) || isFrozen(v) ? v : ~~(rand() * kinds)));
    if (!findMatches(next, cols, rows).size && hasAnyMove(next, cols, rows, kinds)) return next;
  }
  return board;
}

// ---------- 供离线校准 / 空闲提示用：走一步 ----------

function findBestSwap(board, cols, rows) {
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

// 模拟一次完整回合（交换 → 连锁结算），返回 { board, gained, cascades, merges, lineClears }
// 用 resolveClear 保证「4 连合并 / 大 emoji 清行清列」在离线校准里也算得分毫不差
function resolveTurn(board, cols, rows, kinds, a, b, opts = {}, rand = Math.random) {
  let cur = [...board];
  [cur[a], cur[b]] = [cur[b], cur[a]];
  let gained = 0;
  let cascade = 0;
  let merges = 0;
  let lineClears = 0;
  for (let guard = 0; guard < 40; guard++) {
    const res = resolveClear(cur, cols, rows, { spawn: cascade === 0 });
    if (!res.cleared.size && !res.spawns.size) break;
    cascade++;
    merges += res.spawns.size;
    lineClears += res.bigSweeps.length;
    // 先记下这轮被消除的格子四邻有哪些冰块要化
    const thawed = thawTargets(cur, cols, rows, res.cleared);
    gained += scoreForMatches(res.matched.size, cascade)
      + scoreForBlast(res.blast.size, cascade)
      + scoreForBigLines(res.bigLines.size, cascade, res.bigTriggered.size);
    cur = cur.map((v, i) => (res.cleared.has(i) ? null : v));
    res.spawns.forEach((info, idx) => { cur[idx] = big(info.kind); });
    cur = applyThaw(cur, thawed);
    cur = applyGravity(cur, cols, rows, kinds, opts, rand);
  }
  return { board: cur, gained, cascades: cascade, merges, lineClears };
}

module.exports = {
  WALL, BOMB, WILD, FROZEN, BIG_BASE,
  isWall, isEmoji, isSpecial, isFrozen, frozenKind, freeze, isTile,
  isBig, big, bigKind,
  CAP_LEVEL, levelConfig,
  neighbors4, neighbors8, adjacent,
  generateBoard, findMatches, findRuns, explode, thawTargets, applyThaw,
  bigLineCells, resolveClear, MERGE_MIN,
  hasMatchAfterSwap, hasAnyMove, applyGravity,
  MATCH_BASE, MATCH_EXTRA, CHAIN_STEP, CHAIN_MAX, SCORE_PER_BLAST,
  SCORE_PER_LINE, BIG_TRIGGER_BONUS,
  chainMultiplier, scoreForMatches, scoreForBlast, scoreForBigLines, reshuffle,
  findBestSwap, resolveTurn,
};
