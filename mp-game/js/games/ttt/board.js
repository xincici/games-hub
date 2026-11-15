// 井字棋核心逻辑：3×3、每人最多 3 子，下第 4 子时自己的最旧子消失。
const SIZE = 3;
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function emptyBoard() {
  return new Array(SIZE * SIZE).fill(null);
}

function emptyHistory() {
  return { X: [], O: [] };
}

function cloneState(state) {
  return {
    board: state.board.slice(),
    history: { X: state.history.X.slice(), O: state.history.O.slice() },
  };
}

function place(board, history, player, idx) {
  if (idx < 0 || idx >= board.length || board[idx]) return false;
  const own = history[player];
  // 第 4 颗落子前，移走己方最早的一颗；因此棋盘上每方最多 3 颗。
  if (own.length >= SIZE) {
    const oldest = own.shift();
    board[oldest] = null;
  }
  board[idx] = player;
  own.push(idx);
  return true;
}

function winner(board, player) {
  for (let i = 0; i < LINES.length; i += 1) {
    const [a, b, c] = LINES[i];
    if (board[a] === player && board[b] === player && board[c] === player) {
      return LINES[i].slice();
    }
  }
  return null;
}

function winnerLine(board) {
  for (let i = 0; i < LINES.length; i += 1) {
    const [a, b, c] = LINES[i];
    const v = board[a];
    if (v && v === board[b] && v === board[c]) return LINES[i].slice();
  }
  return null;
}

function empties(board) {
  return board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
}

// 先找自己的胜点，再堵对手的胜点；否则中宫 → 角 → 边。
function bestMove(state, me, foe) {
  const open = empties(state.board);
  if (!open.length) return -1;
  const wins = (player, idx) => {
    const next = cloneState(state);
    place(next.board, next.history, player, idx);
    return !!winner(next.board, player);
  };
  for (const idx of open) if (wins(me, idx)) return idx;
  for (const idx of open) if (wins(foe, idx)) return idx;
  if (open.includes(4)) return 4;
  const corners = [0, 2, 6, 8].filter((i) => open.includes(i));
  if (corners.length) return corners[Math.floor(Math.random() * corners.length)];
  const edges = [1, 3, 5, 7].filter((i) => open.includes(i));
  return edges.length ? edges[Math.floor(Math.random() * edges.length)] : open[0];
}

module.exports = {
  SIZE, LINES, emptyBoard, emptyHistory, cloneState, place, winner, winnerLine, empties, bestMove,
};
