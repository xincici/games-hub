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

function previewSeconds(rows, cols) {
  const cards = rows * cols;
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
  return {
    level: lv,
    rows,
    cols,
    pairs,
    preview: previewSeconds(rows, cols),
    time: extra ? Math.max(Math.round(base * TIME_FLOOR_RATIO), base - extra * TIME_STEP) : base,
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
