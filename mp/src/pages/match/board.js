// 对对碰 · 纯逻辑：关卡曲线与发牌。
// 计时、翻牌判定与动画在 MatchGame.vue 里，这里只放能离线校准的部分。

// 每关的 [行, 列]。**emoji 与麻将共用 1 号曲线**（麻将只换牌面、不动关卡参数），
// 扑克牌单独一条；第 11 关到顶（关数无限）：
// emoji / 麻将牌能摆到 6×8；扑克牌是 2:3 的长方形，同格数会高出 50%，
// 所以封顶在 6×7（横向多一列、总张数略少才看得清点数与花色）。
const LAYOUTS = {
  1: [[2, 3], [2, 4], [2, 5], [3, 4], [4, 4], [4, 5], [4, 6], [5, 6], [6, 6], [6, 7], [6, 8]],
  2: [[2, 3], [2, 4], [2, 5], [3, 4], [4, 4], [3, 6], [4, 5], [4, 6], [5, 6], [6, 6], [6, 7]],
};
export const CAP_LEVEL = 11;

// 观察时间：牌越多给得越久，4s → 14s 封顶（14s 也记不住 48 张，这是有意的）
const PREVIEW_MIN = 4;
const PREVIEW_MAX = 14;
// 操作限时 = 对数 × 每对秒数 + 4s 基础。每对 5.2s 收到 4.0s；
// 这个曲线是拿「有限记忆玩家」模型跑 500 局标定的：每关中位用时都留有余量，
// 第一关约 3.3 倍余量（新手也能过），最后一关约 1.25 倍（慢一点的玩家会失败，符合预期）
const PER_PAIR_FROM = 5.2;
const PER_PAIR_TO = 4.0;
const TIME_BASE = 4;
// 封顶之后盘面不再变，限时每关再收 2s，收到基准的 90% 为止（≈ 每对 3.75s，到此难度不再上升）
const TIME_STEP = 2;
const TIME_FLOOR_RATIO = 0.9;

export function previewSeconds(rows, cols) {
  const cards = rows * cols;
  return Math.min(PREVIEW_MAX, Math.max(PREVIEW_MIN, Math.round(PREVIEW_MIN + (cards - 6) * 0.24)));
}

export function levelConfig(level, mode = 1) {
  // 只有扑克（mode 2）走 2 号曲线；emoji（1）与麻将（3）都走 1 号 —— 麻将只换牌面，关卡参数完全沿用 emoji
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
