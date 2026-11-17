// 对对碰 · 纯逻辑：关卡曲线与发牌（与原 web 的 board.js 一致）。
const LAYOUTS = {
  1: [[2, 3], [2, 4], [2, 5], [3, 4], [4, 4], [4, 5], [4, 6], [5, 6], [6, 6], [6, 7], [6, 8]],
  2: [[2, 3], [2, 4], [2, 5], [3, 4], [4, 4], [3, 6], [4, 5], [4, 6], [5, 6], [6, 6], [6, 7]],
};
const CAP_LEVEL = 11;
const PREVIEW_MIN = 4;
const PREVIEW_MAX = 14;
const PER_PAIR_FROM = 5.2;
const PER_PAIR_TO = 4.0;
const TIME_BASE = 4;
const TIME_STEP = 2;
const TIME_FLOOR_RATIO = 0.9;
// 最高难度两档（6×7 = 42 张 / 6×8 = 48 张）实在吃紧：限时各放宽 20s（玩家反馈「过不去」）
// 6×7 是 Lv10、6×8 是 Lv11 及以后（盘面封顶，关数仍无限）
const TOP_TIME_BONUS = 20;
const TOP_BONUS_FROM = CAP_LEVEL - 1;

// 10 张（5 对）：不用 2×5 的长条，改成 3 / 4 / 3 三行、逐行居中
// （2 行 5 列在手机上又扁又宽，翻牌时视线要横跨整屏）
const ROW_PATTERN_10 = [3, 4, 3];

function previewSeconds(cards) {
  return Math.min(PREVIEW_MAX, Math.max(PREVIEW_MIN, Math.round(PREVIEW_MIN + (cards - 6) * 0.24)));
}

function levelConfig(level, mode) {
  const list = LAYOUTS[mode === 2 ? 2 : 1];
  const lv = Math.max(1, Math.floor(level) || 1);
  const capped = Math.min(lv, CAP_LEVEL);
  const [rows, cols] = list[capped - 1];
  const pairs = (rows * cols) / 2;
  const t = (capped - 1) / (CAP_LEVEL - 1);
  const perPair = PER_PAIR_FROM - (PER_PAIR_FROM - PER_PAIR_TO) * t;
  const base = Math.round(pairs * perPair + TIME_BASE);
  const extra = Math.max(0, lv - CAP_LEVEL);
  // 最高难度两档（42 张 / 48 张）统一 +20s，封顶之后的续关同样享受
  const topBonus = lv >= TOP_BONUS_FROM ? TOP_TIME_BONUS : 0;
  const limitBase = base + topBonus;
  // 10 张时按 3 / 4 / 3 排：rows / cols 变成外接的 3 行 4 列，pairs 仍按总张数算
  const pattern = rows * cols === 10 ? ROW_PATTERN_10.slice() : null;
  return {
    level: lv,
    rows: pattern ? pattern.length : rows,
    cols: pattern ? Math.max(...pattern) : cols,
    cards: rows * cols,
    pattern,
    pairs,
    preview: previewSeconds(rows * cols),
    time: extra ? Math.max(Math.round(limitBase * TIME_FLOOR_RATIO), limitBase - extra * TIME_STEP) : limitBase,
  };
}

function shuffle(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = { levelConfig, shuffle, CAP_LEVEL };
