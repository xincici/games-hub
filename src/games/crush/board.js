// 消消乐核心逻辑（纯函数，无框架依赖，便于 node 验证）
//
// board 为 n×n 一维数组，元素为 emoji 种类索引（0 ~ kinds-1），null 表示空格。

// 初始盘面：随机填充且不产生现成三连（每格避开与左二/上二相同）
export function generateBoard(n, kinds, rand = Math.random) {
  const board = Array(n * n).fill(0);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      let v;
      do {
        v = ~~(rand() * kinds);
      } while (
        (c >= 2 && board[r * n + c - 1] === v && board[r * n + c - 2] === v)
        || (r >= 2 && board[(r - 1) * n + c] === v && board[(r - 2) * n + c] === v)
      );
      board[r * n + c] = v;
    }
  }
  return board;
}

// 找出所有 ≥3 连（横竖），返回命中格索引集合
export function findMatches(board, n) {
  const matched = new Set();
  // 横向
  for (let r = 0; r < n; r++) {
    let run = 1;
    for (let c = 1; c <= n; c++) {
      const cur = c < n ? board[r * n + c] : null;
      const prev = board[r * n + c - 1];
      if (cur !== null && cur === prev) {
        run++;
      } else {
        if (run >= 3 && prev !== null) {
          for (let k = c - run; k < c; k++) matched.add(r * n + k);
        }
        run = 1;
      }
    }
  }
  // 纵向
  for (let c = 0; c < n; c++) {
    let run = 1;
    for (let r = 1; r <= n; r++) {
      const cur = r < n ? board[r * n + c] : null;
      const prev = board[(r - 1) * n + c];
      if (cur !== null && cur === prev) {
        run++;
      } else {
        if (run >= 3 && prev !== null) {
          for (let k = r - run; k < r; k++) matched.add(k * n + c);
        }
        run = 1;
      }
    }
  }
  return matched;
}

// 交换后是否会形成至少一个三连（用于有效性判断 / 无解检测）
export function hasMatchAfterSwap(board, n, a, b) {
  const next = [...board];
  [next[a], next[b]] = [next[b], next[a]];
  return findMatches(next, n).size > 0;
}

// 两格是否相邻（正交）
export function adjacent(a, b, n) {
  const [r1, c1] = [~~(a / n), a % n];
  const [r2, c2] = [~~(b / n), b % n];
  return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
}

// 盘面是否存在任何有效交换
export function hasAnyMove(board, n, kinds) {
  for (let a = 0; a < board.length; a++) {
    const r = ~~(a / n), c = a % n;
    if (c + 1 < n && hasMatchAfterSwap(board, n, a, a + 1)) return true;
    if (r + 1 < n && hasMatchAfterSwap(board, n, a, a + n)) return true;
  }
  return false;
}

// 重力下落 + 顶部补充：返回 { board（含空格状态不变时的下落后数组）, drops }
// drops 为每个非空格的新位置记录：[{ from: 原索引|'spawn', to: 新索引 }]
// 注意调用前盘面中待消除格应为 null（由调用方先清除）
export function applyGravity(board, n, kinds, rand = Math.random) {
  const next = [...board];
  const drops = [];
  for (let c = 0; c < n; c++) {
    let write = n - 1; // 从底往上写
    for (let r = n - 1; r >= 0; r--) {
      const v = next[r * n + c];
      if (v !== null) {
        if (r !== write) {
          next[write * n + c] = v;
          next[r * n + c] = null;
        }
        write--;
      }
    }
    // write 以上全部补新
    for (let r = write; r >= 0; r--) {
      const v = ~~(rand() * kinds);
      next[r * n + c] = v;
      drops.push({ from: `spawn-${r}`, to: r * n + c });
    }
  }
  return { board: next, drops };
}

// 一次消除结算：清除命中格并计算得分
// 基础：3 连 30 分，每多 1 个 +20；cascade 层级从 1 开始，每层 ×1.5
export function scoreForMatches(count, cascade) {
  const base = 30 + Math.max(0, count - 3) * 20;
  return Math.round(base * Math.pow(1.5, cascade - 1));
}

// 无解时重洗（保持无现成三连），最多重试若干次
export function reshuffle(board, n, kinds, rand = Math.random) {
  for (let t = 0; t < 100; t++) {
    const next = generateBoard(n, kinds, rand);
    if (hasAnyMove(next, n, kinds)) return next;
  }
  return generateBoard(n, kinds, rand);
}
