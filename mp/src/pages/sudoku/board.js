// 数独（Sudoku）纯逻辑：随机终盘生成、唯一解挖洞、解法计数
// 棋盘用扁平数组表示，共 81 格，值 0 表示空格，1 ~ 9 为已填数字

const CELLS = 81;

// 预计算每格的同行/同列/同宫伙伴索引（不含自身）
export const PEERS = [];
// 预计算每格所在的行 / 列 / 宫（0 ~ 8）
export const ROW_OF = [];
export const COL_OF = [];
export const BOX_OF = [];
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

export function shuffle(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function canPlace(grid, idx, value) {
  for (const p of PEERS[idx]) {
    if (grid[p] === value) return false;
  }
  return true;
}

// 随机回溯填出一个完整终盘，成功返回 true
export function fillGrid(grid) {
  const idx = grid.indexOf(0);
  if (idx === -1) return true;
  for (const value of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
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
  for (const v of bestCands) {
    grid[bestIdx] = v;
    count += countSolutions(grid, limit - count);
    grid[bestIdx] = 0;
    if (count >= limit) break;
  }
  return count;
}

// 在完整终盘上随机挖洞，始终保持唯一解，直到挖够 empties 个空格（或挖不动）
// 多次尝试取挖空最多的一次，返回 { puzzle, solution, empties }
export function generatePuzzle(emptiesTarget, attempts = 3) {
  let best = null;
  for (let a = 0; a < attempts; a++) {
    const solution = new Array(CELLS).fill(0);
    fillGrid(solution);
    const puzzle = solution.slice();
    const order = shuffle([...Array(CELLS).keys()]);
    let removed = 0;
    let progressed = true;
    // 内层多轮扫：单轮内随机顺序逐个尝试删除，某轮一个都没删成即停
    while (progressed && removed < emptiesTarget) {
      progressed = false;
      let passRemoved = 0;
      for (const idx of order) {
        if (removed >= emptiesTarget) break;
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
    if (removed >= emptiesTarget) break;
  }
  return best || generatePuzzle(0, 1);
}

// 终盘是否完全正确（用于校验，实际胜利判定走冲突检测即可）
export function isSolved(grid) {
  if (grid.some(v => !v)) return false;
  for (let i = 0; i < CELLS; i++) {
    for (const p of PEERS[i]) {
      if (grid[p] === grid[i]) return false;
    }
  }
  return true;
}
