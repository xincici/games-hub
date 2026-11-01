// 数独（Sudoku）纯逻辑：随机终盘生成、唯一解挖洞、解法计数。
// 棋盘用扁平数组表示，共 81 格，值 0 表示空格，1 ~ 9 为已填数字。
// 逐字移植 web 的 src/games/sudoku/sudoku.js，只把 ESM 换成 CommonJS：
// 不依赖 wx / canvas，可以直接用 Node require 跑随机局测试。

const CELLS = 81;
const NUMS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

// 预计算每格的同行/同列/同宫伙伴索引（不含自身）
const PEERS = [];
// 预计算每格所在的行 / 列 / 宫（0 ~ 8）
const ROW_OF = [];
const COL_OF = [];
const BOX_OF = [];
for (let i = 0; i < CELLS; i++) {
  const r = (i / 9) | 0;
  const c = i % 9;
  ROW_OF.push(r);
  COL_OF.push(c);
  BOX_OF.push(((r / 3) | 0) * 3 + ((c / 3) | 0));
}
for (let i = 0; i < CELLS; i++) {
  const list = [];
  for (let j = 0; j < CELLS; j++) {
    if (i !== j && (ROW_OF[i] === ROW_OF[j] || COL_OF[i] === COL_OF[j] || BOX_OF[i] === BOX_OF[j])) {
      list.push(j);
    }
  }
  PEERS.push(list);
}

function shuffle(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function canPlace(grid, idx, value) {
  const peers = PEERS[idx];
  for (let k = 0; k < peers.length; k++) {
    if (grid[peers[k]] === value) return false;
  }
  return true;
}

// 随机回溯填出一个完整终盘，成功返回 true
function fillGrid(grid) {
  const idx = grid.indexOf(0);
  if (idx === -1) return true;
  const order = shuffle(NUMS);
  for (let k = 0; k < order.length; k++) {
    const value = order[k];
    if (canPlace(grid, idx, value)) {
      grid[idx] = value;
      if (fillGrid(grid)) return true;
      grid[idx] = 0;
    }
  }
  return false;
}

// 统计解的数量，最多统计到 limit 就提前返回（默认 2，用于唯一解校验）
function countSolutions(grid, limit = 2) {
  // 每次挑候选数最少的空格（MRV）可大幅加速
  let bestIdx = -1;
  let bestCands = null;
  for (let i = 0; i < CELLS; i++) {
    if (grid[i] !== 0) continue;
    const cands = [];
    for (let v = 1; v <= 9; v++) {
      if (canPlace(grid, i, v)) cands.push(v);
    }
    if (!cands.length) return 0;
    if (!bestCands || cands.length < bestCands.length) {
      bestIdx = i;
      bestCands = cands;
      if (cands.length === 1) break;
    }
  }
  if (bestIdx === -1) return 1; // 已填满且无冲突 = 1 个解

  let count = 0;
  for (let k = 0; k < bestCands.length; k++) {
    const v = bestCands[k];
    grid[bestIdx] = v;
    count += countSolutions(grid, limit - count);
    grid[bestIdx] = 0;
    if (count >= limit) break;
  }
  return count;
}

// 在完整终盘上随机挖洞，始终保持唯一解，直到挖够 empties 个空格（或挖不动）
// 多次尝试取挖空最多的一次，返回 { puzzle, solution, empties }
function generatePuzzle(emptiesTarget, attempts = 3) {
  const target = Math.max(0, Math.min(CELLS, (emptiesTarget | 0) || 0));
  let best = null;
  for (let a = 0; a < Math.max(1, attempts); a++) {
    const solution = new Array(CELLS).fill(0);
    fillGrid(solution);
    const puzzle = solution.slice();
    const order = shuffle(Array.from({ length: CELLS }, (_, i) => i));
    let removed = 0;
    let progressed = true;
    // 内层多轮扫：单轮内随机顺序逐个尝试删除，某轮一个都没删成即停
    while (progressed && removed < target) {
      progressed = false;
      let passRemoved = 0;
      for (let k = 0; k < order.length; k++) {
        if (removed >= target) break;
        const idx = order[k];
        if (puzzle[idx] === 0) continue;
        const saved = puzzle[idx];
        puzzle[idx] = 0;
        if (countSolutions(puzzle, 2) === 1) {
          removed++;
          progressed = true;
          passRemoved++;
        } else {
          puzzle[idx] = saved;
        }
      }
      // 一轮几乎挖不动时尽早放弃本轮尝试，避免无效耗时
      if (passRemoved === 0) break;
    }
    if (!best || removed > best.empties) {
      best = { puzzle, solution, empties: removed };
    }
    if (removed >= target) break;
  }
  return best || { puzzle: new Array(CELLS).fill(0), solution: new Array(CELLS).fill(0), empties: 0 };
}

// 终盘是否完全正确（用于校验，实际胜利判定走唯一解对比即可）
function isSolved(grid) {
  if (!grid || grid.length !== CELLS) return false;
  for (let i = 0; i < CELLS; i++) if (!grid[i]) return false;
  for (let i = 0; i < CELLS; i++) {
    const peers = PEERS[i];
    for (let k = 0; k < peers.length; k++) {
      if (grid[peers[k]] === grid[i]) return false;
    }
  }
  return true;
}

module.exports = {
  CELLS,
  NUMS,
  PEERS,
  ROW_OF,
  COL_OF,
  BOX_OF,
  shuffle,
  canPlace,
  fillGrid,
  countSolutions,
  generatePuzzle,
  isSolved,
};
