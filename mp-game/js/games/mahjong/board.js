// 麻将英雄 · 纯逻辑（无 wx / canvas 依赖，可直接 require 做单元测试）。
// 逐条对齐 web `src/games/mahjong/board.js`：3×3 的 8 条消除线、顺子 / 刻子判定、
// 一次多组的奖励、连击奖励、36 张牌墙、闯关曲线。
// 牌只有一筒 ~ 九筒这九种（点数 1~9），每种 4 张共 36 张 —— 和真麻将的筒子一样，
// 所以这里**允许重复**（刻子本来就要三张一样的）。

const SIZE = 3;
const CELLS = SIZE * SIZE;      // 9 格
const KINDS = 9;                // 一筒(1) … 九筒(9)
const COPIES = 4;               // 每种 4 张
const WALL_SIZE = KINDS * COPIES; // 36

const PREVIEW = 1;              // 提示区只有「当前要放的牌 + 下一张」
const TILE_RATIO = 1.282;       // 麻将牌长宽比（= 雪碧图每格 131:168）

// 牌型：顺子（三张点数连续）100 分、刻子（三张相同）200 分
const TRIO = {
  run: { id: 'run', score: 100 },
  triplet: { id: 'triplet', score: 200 },
};

// 一次落子消掉多组时的额外奖励：每组从第二组起 +100
const COMBO_BONUS = 100;
const comboBonus = groups => Math.max(0, groups - 1) * COMBO_BONUS;

// 连击奖励：连续每次消除算一连，从第二连起每连一次 +50（中间有一手没消掉就归零）
const CHAIN_STEP = 50;
const chainBonus = chain => Math.max(0, chain - 1) * CHAIN_STEP;

// ---------- 牌 ----------

let uid = 0;
const resetUid = () => { uid = 0; };
const makeTile = value => ({ id: ++uid, value });

// 雪碧图 key：筒子 = p1 … p9（与 core/tiles 的 SLOT 表一致）
const tileFace = value => `p${value}`;

// ---------- 消除线 ----------

// 8 条线：3 行 + 3 列 + 2 条对角线，每条正好 3 格
function lineIndices() {
  const lines = [];
  for (let r = 0; r < SIZE; r++) lines.push(Array.from({ length: SIZE }, (_, c) => r * SIZE + c));
  for (let c = 0; c < SIZE; c++) lines.push(Array.from({ length: SIZE }, (_, r) => r * SIZE + c));
  lines.push(Array.from({ length: SIZE }, (_, i) => i * SIZE + i));
  lines.push(Array.from({ length: SIZE }, (_, i) => i * SIZE + (SIZE - 1 - i)));
  return lines;
}

const LINES = lineIndices();

// ---------- 牌型判定 ----------

// 一条放满 3 张的线：刻子 > 顺子（按分值先判刻子），凑不出返回 null
function evaluateLine(tiles) {
  if (!Array.isArray(tiles) || tiles.length !== SIZE) return null;
  if (tiles.some(t => !t)) return null;
  const values = tiles.map(t => t.value);
  if (values.every(v => v === values[0])) return { ...TRIO.triplet };
  const sorted = values.slice().sort((a, b) => a - b);
  if (sorted[0] + 1 === sorted[1] && sorted[1] + 1 === sorted[2]) return { ...TRIO.run };
  return null;
}

// 场上所有「已经放满且能得分」的线
function scoringLines(board) {
  const out = [];
  LINES.forEach((line, i) => {
    const tiles = line.map(idx => board[idx]);
    if (tiles.some(t => !t)) return;
    const trio = evaluateLine(tiles);
    if (trio) out.push({ line: i, indices: line.slice(), trio });
  });
  return out;
}

// 满盘检测。加入「替换」机制后它不再用于判负（点已有牌的格子可以用手上的牌替换掉），
// 保留这个纯函数供测试 / 以后做数值分析。
function isStuck(board) {
  return board.every(Boolean);
}

// ---------- 牌墙 ----------

// 一副 36 张的筒子牌墙，洗好后发；抽空就重洗（无尽模式要能一直发）
function createWall(rand) {
  const random = rand || Math.random;
  let wall = [];
  const shuffle = (list) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
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
// 第 1 关 20 张牌 / 400 分过关；之后每关 +1 张牌（逢 5 的整数关那一档再 +1 张，
// 即 +2 张）、过关分每关 +50。与 web 完全一致，改数值要和 docs 的标定一起改。
const DECK_BASE = 20;
const TARGET_BASE = 400;
const TARGET_STEP = 50;

function levelConfig(level) {
  const lv = Math.max(1, Math.floor(level) || 1);
  return {
    level: lv,
    deck: DECK_BASE + (lv - 1) + Math.floor(lv / 5),
    target: TARGET_BASE + (lv - 1) * TARGET_STEP,
  };
}

module.exports = {
  SIZE,
  CELLS,
  KINDS,
  COPIES,
  WALL_SIZE,
  PREVIEW,
  TILE_RATIO,
  TRIO,
  COMBO_BONUS,
  CHAIN_STEP,
  comboBonus,
  chainBonus,
  makeTile,
  resetUid,
  tileFace,
  lineIndices,
  LINES,
  evaluateLine,
  scoringLines,
  isStuck,
  createWall,
  levelConfig,
};
