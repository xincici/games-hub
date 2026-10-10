// 麻将英雄 纯逻辑：3×3 的 8 条消除线、顺子 / 刻子判定、连击奖励、牌墙与关卡曲线。
// 只有一筒 ~ 九筒这九种牌（点数 1~9），每种 4 张，共 36 张 —— 和真麻将的筒子一样，
// 所以这里**允许重复**（刻子本来就要三张一样的）。

export const SIZE = 3;
export const CELLS = SIZE * SIZE;   // 9 格
export const KINDS = 9;             // 一筒(1) … 九筒(9)
export const COPIES = 4;            // 每种 4 张
export const WALL_SIZE = KINDS * COPIES;

export const PREVIEW = 1;           // 提示区只有「当前要放的牌 + 下一张」
export const TILE_RATIO = 1.282;     // 麻将牌的长宽比（= 雪碧图每格 131:168）
// 牌是立体的：正面往下还画了一条「厚度」（MahjongTile.vue 里 box-shadow 的纵向偏移），
// 它是画在元素外面的，所以排版时必须把它算进高度，否则最下面一排会顶出格子。
// 改 MahjongTile.vue 的 box-shadow 纵向偏移时要同步这个值。
export const TILE_LIP_RATIO = 0;     // 牌面换成雪碧图后，厚度已经画在图里了

// 牌型：顺子（三张点数连续）100 分、刻子（三张相同）200 分
export const TRIO = {
  run: { id: 'run', score: 100 },
  triplet: { id: 'triplet', score: 200 },
};

// 一次消掉多组时的额外奖励：n = 组数 - 1，每组再加 100
export const COMBO_BONUS = 100;
export const comboBonus = groups => Math.max(0, groups - 1) * COMBO_BONUS;

// 连击奖励：连续每次消除算一连，从第二连起每连一次多 50（中间有一次没消掉就归零）
export const CHAIN_STEP = 50;
export const chainBonus = chain => Math.max(0, chain - 1) * CHAIN_STEP;

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

// 满盘检测。**加入「替换」机制后它不再用于判负**（点已有牌的格子可以用手上的牌替换掉它，
// 所以满盘也能继续玩）；保留这个纯函数给测试和以后可能的数值分析用。
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
// 第 1 关 20 张牌 / 400 分过关；之后每关 +2 张牌、过关分 +50，
// 逢 10 的整数关那一档的增量按 100 算（即在这些关上再多 50）。
// 有了「替换」机制之后棋盘满不再是死局（可以一直换牌），所以牌堆长度重新成了主要变量。
const DECK_BASE = 20;         // 第 1 关 20 张
const TARGET_BASE = 400;      // 第 1 关 400 分
const TARGET_STEP = 50;       // 每关过关分 +50（逢 10 加 100 那条早已去掉）

export function levelConfig(level) {
  const lv = Math.max(1, Math.floor(level) || 1);
  // 牌数：第 1 关 **20 张**；之后**每关 +1 张**，逢 5 的整数关那一档 **+2 张**。
  // 也就是「2..lv 每关 +1」再加上「2..lv 里 5 的倍数各多 +1」= Math.floor(lv / 5) 张。
  return {
    level: lv,
    deck: DECK_BASE + (lv - 1) + Math.floor(lv / 5),
    target: TARGET_BASE + (lv - 1) * TARGET_STEP,
  };
}
