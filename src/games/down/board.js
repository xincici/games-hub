// Emoji 下坠 · 纯逻辑：发排、速度曲线、变化节奏、判定。
// 时间推进（rAF）与渲染在 DownGame.vue 里，这里只放能离线校准的部分。

// 棋盘 8 行 × 6 列
export const ROWS = 8;
export const COLS = 6;

// 只用这 5 种：颜色区分度高，一屏里能一眼扫出目标
export const GLYPHS = ['🍎', '🍋', '🍇', '🍏', '🫐'];
export const KINDS = GLYPHS.length;

export const START_ROWS = 2;              // 开局底部先摆几排
// 开局时最上面那排所在的行（0 = 棋盘顶）：底部摆满 START_ROWS 排，玩家就在它上面那一格
export const START_TOP = ROWS - START_ROWS;
export const SPEED_BASE = 0.35;  // 上升速度（行 / 秒）
export const SPEED_STEP = 0.03;  // 每消除一排加快多少
// 速度上限 = 基础速度的 3 倍（顶部统计条显示的倍率因此最高正好停在 3.0×），
// 到顶之后消再多排也不再加快
export const SPEED_MAX_RATIO = 3;
export const SPEED_MAX = SPEED_BASE * SPEED_MAX_RATIO;   // 1.05 行 / 秒
// 换 emoji 的判定：每消掉一排就掷一次，换不换由「当前连续没换过几排」决定。
// 第一次（连续 0 次没换）就有 CHANGE_P0 = 25% 的概率换；每多连续一次没换，
// 「这次也不换」的概率就乘 CHANGE_DECAY —— 也就是连续越久越容易换。
// 这套 hazard 下「多少排换一次」的期望 = 1 + Σ (0.75·0.97^k 的前缀积) ≈ 3.40 排、
// 中位数 3 排（蒙特卡洛 100 万次实测 3.400 / 3），分布主要落在 1~8 排
export const CHANGE_P0 = 0.25;      // 连续没换过时，这次换掉的概率
export const CHANGE_DECAY = 0.97;   // 每多一次连续没换，「这次不换」的概率乘这个数

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

// 连续 streak 次没换之后，这一次换掉手里 emoji 的概率（随 streak 单调递增、趋向 1）
export function changeChance(streak) {
  return 1 - (1 - CHANGE_P0) * Math.pow(CHANGE_DECAY, Math.max(0, streak | 0));
}

// 顶排里跟手里 emoji 相同的列（空数组 = 这排没法消）
export function matchingCols(row, glyph) {
  const out = [];
  row.forEach((g, c) => { if (g === glyph) out.push(c); });
  return out;
}
