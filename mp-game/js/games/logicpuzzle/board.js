// 逻辑拼图 · 纯逻辑层：8×8 棋盘 + 8 个矩形拼块（可旋转）+ 固定块。
// 关卡答案是 8×8 的字符矩阵：a~h = 拼块，1/2/3 = 固定块（玩家不能移动）。
const LEVELS = require('./levels');
const SIZE = 8;

// 拼块的基准尺寸（w × h）；旋转就是交换两者。
const PIECES = [
  { id: 'a', w: 3, h: 4, color: '#d97a5f' },
  { id: 'b', w: 2, h: 5, color: '#3f8f95' },
  { id: 'c', w: 2, h: 2, color: '#8a6cc0' },
  { id: 'd', w: 1, h: 5, color: '#c98a2f' },
  { id: 'e', w: 2, h: 3, color: '#4d915f' },
  { id: 'f', w: 1, h: 4, color: '#bd5a8d' },
  { id: 'g', w: 3, h: 3, color: '#5a78c0' },
  { id: 'h', w: 2, h: 4, color: '#a39a38' },
];
const FIXED_COLOR = '#5b6b7a';
const LEVEL_COUNT = LEVELS.length;

function levelGrid(index) {
  const arr = LEVELS[index] || LEVELS[LEVELS.length - 1];
  return arr.map((row) => row.slice());
}

// 固定块占位：数字 1/2/3
function isFixedValue(v) {
  return v === 1 || v === '1' || v === 2 || v === '2' || v === 3 || v === '3';
}

// 新建一关：board 上固定块填 '#'，用户拼块尚未放置。
function createLevel(index) {
  const grid = levelGrid(index);
  const board = [];
  for (let r = 0; r < SIZE; r += 1) {
    const row = [];
    for (let c = 0; c < SIZE; c += 1) row.push(isFixedValue(grid[r][c]) ? '#' : null);
    board.push(row);
  }
  return {
    index,
    grid,
    board,
    pieces: PIECES.map((p) => ({ id: p.id, w: p.w, h: p.h, color: p.color, placed: false, r: -1, c: -1 })),
    steps: 0,
  };
}

function pieceDef(id) {
  return PIECES.find((p) => p.id === id) || null;
}

// 以 (r,c) 为左上角能否放下该拼块
function canPlace(puzzle, piece, r, c) {
  if (!piece || r < 0 || c < 0 || r + piece.h > SIZE || c + piece.w > SIZE) return false;
  for (let y = 0; y < piece.h; y += 1) {
    for (let x = 0; x < piece.w; x += 1) {
      if (puzzle.board[r + y][c + x] != null) return false;
    }
  }
  return true;
}

// 手指点在 (r,c) 时，依次尝试几个「落点」：点中的格子当左上角 → 拼块中心对准它 → 右下角对准它。
// 手机上不用精确拖拽，点哪附近都能放下。
function placeCandidates(piece, r, c) {
  const out = [
    [r, c],
    [r - Math.floor((piece.h - 1) / 2), c - Math.floor((piece.w - 1) / 2)],
    [r - (piece.h - 1), c - (piece.w - 1)],
  ];
  const seen = new Set();
  return out.filter(([y, x]) => {
    const k = `${y},${x}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function place(puzzle, piece, r, c) {
  if (!canPlace(puzzle, piece, r, c)) return false;
  for (let y = 0; y < piece.h; y += 1) {
    for (let x = 0; x < piece.w; x += 1) puzzle.board[r + y][c + x] = piece.id;
  }
  piece.placed = true;
  piece.r = r;
  piece.c = c;
  return true;
}

// 拿起已放下的拼块（清空它占的格子）
function lift(puzzle, piece) {
  if (!piece || !piece.placed) return false;
  for (let y = 0; y < piece.h; y += 1) {
    for (let x = 0; x < piece.w; x += 1) {
      const r = piece.r + y;
      const c = piece.c + x;
      if (puzzle.board[r] && puzzle.board[r][c] === piece.id) puzzle.board[r][c] = null;
    }
  }
  piece.placed = false;
  piece.r = -1;
  piece.c = -1;
  return true;
}

function rotate(piece) {
  if (!piece) return;
  const w = piece.w;
  piece.w = piece.h;
  piece.h = w;
}

function pieceAt(puzzle, r, c) {
  if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return null;
  const id = puzzle.board[r][c];
  if (!id || id === '#') return null;
  return puzzle.pieces.find((p) => p.id === id) || null;
}

function filledCount(puzzle) {
  let n = 0;
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) if (puzzle.board[r][c] != null) n += 1;
  }
  return n;
}

function placedCount(puzzle) {
  return puzzle.pieces.filter((p) => p.placed).length;
}

function isSolved(puzzle) {
  return filledCount(puzzle) === SIZE * SIZE;
}

// 存档恢复：pieces 是 [{ id, rot, placed, r, c }]（rot 用 0/1 或直接 w/h 都兼容）
function restorePieces(puzzle, saved) {
  if (!Array.isArray(saved)) return;
  puzzle.pieces = PIECES.map((base) => {
    const s = saved.find((x) => x && x.id === base.id) || {};
    const rot = +(s.rot || 0) & 1;
    return {
      id: base.id,
      w: rot ? base.h : base.w,
      h: rot ? base.w : base.h,
      color: base.color,
      placed: false,
      r: -1,
      c: -1,
    };
  });
  puzzle.board = puzzle.grid.map((row) => row.map((v) => (isFixedValue(v) ? '#' : null)));
  saved.forEach((s) => {
    if (!s || !s.placed) return;
    const p = puzzle.pieces.find((x) => x.id === s.id);
    if (p) place(puzzle, p, Math.floor(s.r), Math.floor(s.c));
  });
}

function exportPieces(puzzle) {
  return puzzle.pieces.map((p) => {
    const base = pieceDef(p.id);
    // 正方形块（c / g）旋转没有意义，统一记 0
    const rot = (p.w === base.w && p.h === base.h) ? 0 : 1;
    return { id: p.id, rot, placed: p.placed, r: p.r, c: p.c };
  });
}

module.exports = {
  SIZE, LEVELS, LEVEL_COUNT, PIECES, FIXED_COLOR,
  IS_FIXED: isFixedValue, levelGrid, createLevel, pieceDef, canPlace, placeCandidates, place, lift, rotate,
  pieceAt, filledCount, placedCount, isSolved, restorePieces, exportPieces,
};
