// Emoji 下坠 · 纯逻辑：发排、速度曲线、变化节奏、判定。
// 时间推进（rAF）与渲染在 DownGame.vue 里，这里只放能离线校准的部分。

// 棋盘 8 行 × 6 列
export const ROWS = 8;
export const COLS = 6;

// 只用这 5 种：颜色区分度高，一屏里能一眼扫出目标
export const GLYPHS = ['🍎', '🍋', '🍇', '🥝', '🫐'];
export const KINDS = GLYPHS.length;

export const START_ROWS = 2;              // 开局底部先摆几排
// 开局时最上面那排所在的行（0 = 棋盘顶）：底部摆满 START_ROWS 排，玩家就在它上面那一格
export const START_TOP = ROWS - START_ROWS;
export const SPEED_BASE = 0.35;  // 上升速度（行 / 秒）
export const SPEED_STEP = 0.03;  // 每消除一排加快多少
export const SPEED_MAX = 1.3;    // 速度上限
export const CHANGE_MIN = 3;     // 玩家手里的 emoji 每 3~5 排换一次
export const CHANGE_MAX = 5;

// 上升速度只跟「已消除排数」有关：越消越快，到上限为止
export function speedFor(cleared) {
  return Math.min(SPEED_MAX, SPEED_BASE + SPEED_STEP * Math.max(0, cleared));
}

export function shuffle(list, rand = Math.random) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = ~~(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 发一排：保证 5 种里每一种都出现（6 列 > 5 种，多出来那一格随机重复）。
// 这样玩家手里的 emoji 永远能在当前顶排找到目标，不会出现「整排都没有、只能干等」的软锁；
// 也顺带满足了「换 emoji 时新 emoji 一定在顶排里」这条要求
export function makeRow(rand = Math.random) {
  const cells = [...GLYPHS];
  while (cells.length < COLS) cells.push(GLYPHS[~~(rand() * KINDS)]);
  return shuffle(cells, rand);
}

// 这一排还有几排换一次手里的 emoji（3~5）
export function nextChangeIn(rand = Math.random) {
  return CHANGE_MIN + ~~(rand() * (CHANGE_MAX - CHANGE_MIN + 1));
}

// 顶排里跟手里 emoji 相同的列（空数组 = 这排没法消）
export function matchingCols(row, glyph) {
  const out = [];
  row.forEach((g, c) => { if (g === glyph) out.push(c); });
  return out;
}
