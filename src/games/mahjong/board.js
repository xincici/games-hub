// 麻将英雄 纯逻辑：3×3 的 8 条消除线、顺子 / 刻子判定、连击奖励、牌墙与关卡曲线。
// 只有一筒 ~ 九筒这九种牌（点数 1~9），每种 4 张，共 36 张 —— 和真麻将的筒子一样，
// 所以这里**允许重复**（刻子本来就要三张一样的）。

export const SIZE = 3;
export const CELLS = SIZE * SIZE;   // 9 格
export const KINDS = 9;             // 一筒(1) … 九筒(9)
export const COPIES = 4;            // 每种 4 张
export const WALL_SIZE = KINDS * COPIES;

export const PREVIEW = 1;           // 提示区只有「当前要放的牌 + 下一张」
export const TILE_RATIO = 1.35;      // 麻将牌是 1 : 1.35 的竖牌（算尺寸时要用）

// 牌型：顺子（三张点数连续）100 分、刻子（三张相同）200 分
export const TRIO = {
  run: { id: 'run', score: 100 },
  triplet: { id: 'triplet', score: 200 },
};

// 一次消掉多组时的额外奖励：n = 组数 - 1，每组再加 100
export const COMBO_BONUS = 100;
export const comboBonus = groups => Math.max(0, groups - 1) * COMBO_BONUS;

const SUIT_IDS = ['yi', 'er', 'san', 'si', 'wu', 'liu', 'qi', 'ba', 'jiu'];
export const suitId = value => SUIT_IDS[value - 1] || 'yi';

let uid = 0;
export const resetUid = () => { uid = 0; };
export const makeTile = value => ({ id: ++uid, value });

// ---------- 消除线 ----------

// 8 条线：3 行 + 3 列 + 2 条对角线，每条 3 格
export function lineIndices() {
  const lines = [];
  for (let r = 0; r < SIZE; r++) lines.push(Array.from({ length: SIZE }, (_, c) => r * SIZE + c));
  for (let c = 0; c < SIZE; c++) lines.push(Array.from({ length: SIZE }, (_, r) => r * SIZE + c));
  lines.push(Array.from({ length: SIZE }, (_, i) => i * SIZE + i));
  lines.push(Array.from({ length: SIZE }, (_, i) => i * SIZE + (SIZE - 1 - i)));
  return lines;
}

export const LINES = lineIndices();

// ---------- 牌型判定 ----------

// 一条放满 3 张的线：刻子 > 顺子（不冲突，但按分值先判刻子），凑不出返回 null
export function evaluateLine(tiles) {
  if (!Array.isArray(tiles) || tiles.length !== SIZE) return null;
  if (tiles.some(t => !t)) return null;
  const values = tiles.map(t => t.value);
  if (values.every(v => v === values[0])) return { ...TRIO.triplet };
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted[0] + 1 === sorted[1] && sorted[1] + 1 === sorted[2]) return { ...TRIO.run };
  return null;
}

// 场上所有「已经放满且能得分」的线
export function scoringLines(board) {
  const out = [];
  LINES.forEach((line, i) => {
    const tiles = line.map(idx => board[idx]);
    if (tiles.some(t => !t)) return;
    const trio = evaluateLine(tiles);
    if (trio) out.push({ line: i, indices: [...line], trio });
  });
  return out;
}

// 满盘且再也消不掉 → 失败（能消的线在落子当次就已经结算掉了）
export function isStuck(board) {
  return board.every(Boolean);
}

// ---------- 牌墙 ----------

// 一副 36 张的筒子牌墙，洗好后发；抽空就重洗（无尽模式要能一直发）
export function createWall(rand = Math.random) {
  let wall = [];
  const shuffle = list => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  const refill = () => {
    wall = [];
    for (let v = 1; v <= KINDS; v++) for (let i = 0; i < COPIES; i++) wall.push(v);
    shuffle(wall);
  };
  return {
    draw() {
      if (!wall.length) refill();
      return makeTile(wall.shift());
    },
  };
}

// ---------- 关卡曲线 ----------
// 数值是离线标定的（见 AGENTS.md）：3×3 只有 9 格、三张一组，堵死得比扑克炼金术快得多，
// 所以牌堆加长几乎不涨分（贪心玩家各关中位数都是 300）—— 目标分只能压着它的 p70~p90 慢慢爬。
const DECK_BASE = 16;
const TARGET_BASE = 400;
const TARGET_STEP = 25;
const TENS_BONUS = 100;

export function levelConfig(level) {
  const lv = Math.max(1, Math.floor(level) || 1);
  return {
    level: lv,
    deck: DECK_BASE + (lv - 1),
    target: TARGET_BASE + (lv - 1) * TARGET_STEP + Math.floor(lv / 10) * TENS_BONUS,
  };
}
