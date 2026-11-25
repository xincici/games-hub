// 逻辑拼图 - 88 关答案
// 数据来源：88-game.jpg（88 关答案图）
// 棋盘为 8 × 8 网格
// 每关答案 = 固定块（1/2/3）+ 8 个拼图块（a~h），铺满整个棋盘
// 1 = 1x1 固定块，2 = 1x2 固定块，3 = 1x3 固定块

// 8 个拼图块的常量定义（字母即块标识，尺寸固定不可更改，可旋转）
const a = 'a'; // 3*4
const b = 'b'; // 2*5
const c = 'c'; // 2*2
const d = 'd'; // 1*5
const e = 'e'; // 2*3
const f = 'f'; // 1*4
const g = 'g'; // 3*3
const h = 'h'; // 2*4

const QUESTIONS = [];

QUESTIONS[0] = [
  [b, b, h, h, h, h, e, e],
  [b, b, h, h, h, h, e, e],
  [b, b, 3, a, a, a, e, e],
  [b, b, 3, a, a, a, 2, 2],
  [b, b, 3, a, a, a, c, c],
  [g, g, g, a, a, a, c, c],
  [g, g, g, f, f, f, f, 1],
  [g, g, g, d, d, d, d, d],
];

QUESTIONS[1] = [
  [e, e, e, d, d, d, d, d],
  [e, e, e, 2, 2, a, a, a],
  [b, b, b, b, b, a, a, a],
  [b, b, b, b, b, a, a, a],
  [h, h, g, g, g, a, a, a],
  [h, h, g, g, g, 3, 3, 3],
  [h, h, g, g, g, 1, c, c],
  [h, h, f, f, f, f, c, c],
];

QUESTIONS[2] = [
  [h, h, h, h, d, a, a, a],
  [h, h, h, h, d, a, a, a],
  [g, g, g, f, d, a, a, a],
  [g, g, g, f, d, a, a, a],
  [g, g, g, f, d, 1, c, c],
  [e, e, 3, f, 2, 2, c, c],
  [e, e, 3, b, b, b, b, b],
  [e, e, 3, b, b, b, b, b],
];

QUESTIONS[3] = [
  [d, 1, g, g, g, e, e, e],
  [d, f, g, g, g, e, e, e],
  [d, f, g, g, g, 3, 3, 3],
  [d, f, c, c, b, b, h, h],
  [d, f, c, c, b, b, h, h],
  [a, a, a, a, b, b, h, h],
  [a, a, a, a, b, b, h, h],
  [a, a, a, a, b, b, 2, 2],
];

QUESTIONS[4] = [
  [h, h, h, h, f, f, f, f],
  [h, h, h, h, 1, g, g, g],
  [b, b, b, b, b, g, g, g],
  [b, b, b, b, b, g, g, g],
  [a, a, a, c, c, 2, e, e],
  [a, a, a, c, c, 2, e, e],
  [a, a, a, 3, 3, 3, e, e],
  [a, a, a, d, d, d, d, d],
];

QUESTIONS[5] = [
  [d, d, d, d, d, 3, b, b],
  [1, 2, e, e, e, 3, b, b],
  [f, 2, e, e, e, 3, b, b],
  [f, g, g, g, c, c, b, b],
  [f, g, g, g, c, c, b, b],
  [f, g, g, g, a, a, a, a],
  [h, h, h, h, a, a, a, a],
  [h, h, h, h, a, a, a, a],
];

QUESTIONS[6] = [
  [b, b, g, g, g, a, a, a],
  [b, b, g, g, g, a, a, a],
  [b, b, g, g, g, a, a, a],
  [b, b, c, c, f, a, a, a],
  [b, b, c, c, f, 3, h, h],
  [e, e, e, 2, f, 3, h, h],
  [e, e, e, 2, f, 3, h, h],
  [1, d, d, d, d, d, h, h],
];

QUESTIONS[7] = [
  [e, e, f, f, f, f, c, c],
  [e, e, 2, 3, 3, 3, c, c],
  [e, e, 2, b, b, b, b, b],
  [a, a, a, b, b, b, b, b],
  [a, a, a, g, g, g, h, h],
  [a, a, a, g, g, g, h, h],
  [a, a, a, g, g, g, h, h],
  [1, d, d, d, d, d, h, h],
];

QUESTIONS[8] = [
  [b, b, b, b, b, g, g, g],
  [b, b, b, b, b, g, g, g],
  [h, h, h, h, 1, g, g, g],
  [h, h, h, h, f, 2, c, c],
  [a, a, a, 3, f, 2, c, c],
  [a, a, a, 3, f, e, e, e],
  [a, a, a, 3, f, e, e, e],
  [a, a, a, d, d, d, d, d],
];

QUESTIONS[9] = [
  [e, e, 3, g, g, g, b, b],
  [e, e, 3, g, g, g, b, b],
  [e, e, 3, g, g, g, b, b],
  [d, f, 2, 2, c, c, b, b],
  [d, f, h, h, c, c, b, b],
  [d, f, h, h, a, a, a, a],
  [d, f, h, h, a, a, a, a],
  [d, 1, h, h, a, a, a, a],
];

QUESTIONS[10] = [
  [e, e, e, f, f, f, f, 1],
  [e, e, e, d, d, d, d, d],
  [h, h, a, a, a, a, 2, 2],
  [h, h, a, a, a, a, c, c],
  [h, h, a, a, a, a, c, c],
  [h, h, 3, 3, 3, g, g, g],
  [b, b, b, b, b, g, g, g],
  [b, b, b, b, b, g, g, g],
];

QUESTIONS[11] = [
  [g, g, g, 3, a, a, a, a],
  [g, g, g, 3, a, a, a, a],
  [g, g, g, 3, a, a, a, a],
  [c, c, e, e, h, h, b, b],
  [c, c, e, e, h, h, b, b],
  [2, 2, e, e, h, h, b, b],
  [f, f, f, f, h, h, b, b],
  [1, d, d, d, d, d, b, b],
];

QUESTIONS[12] = [
  [a, a, a, g, g, g, c, c],
  [a, a, a, g, g, g, c, c],
  [a, a, a, g, g, g, 1, d],
  [a, a, a, b, b, h, h, d],
  [f, e, e, b, b, h, h, d],
  [f, e, e, b, b, h, h, d],
  [f, e, e, b, b, h, h, d],
  [f, 2, 2, b, b, 3, 3, 3],
];

QUESTIONS[13] = [
  [f, f, f, f, h, h, h, h],
  [g, g, g, 1, h, h, h, h],
  [g, g, g, b, b, b, b, b],
  [g, g, g, b, b, b, b, b],
  [e, e, c, c, a, a, a, a],
  [e, e, c, c, a, a, a, a],
  [e, e, 2, 2, a, a, a, a],
  [d, d, d, d, d, 3, 3, 3],
];

QUESTIONS[14] = [
  [d, d, d, d, d, 3, 3, 3],
  [h, h, e, e, f, f, f, f],
  [h, h, e, e, c, c, 2, 2],
  [h, h, e, e, c, c, b, b],
  [h, h, 1, a, a, a, b, b],
  [g, g, g, a, a, a, b, b],
  [g, g, g, a, a, a, b, b],
  [g, g, g, a, a, a, b, b],
];

QUESTIONS[15] = [
  [d, d, d, d, d, e, e, 3],
  [h, h, h, h, 2, e, e, 3],
  [h, h, h, h, 2, e, e, 3],
  [a, a, a, g, g, g, b, b],
  [a, a, a, g, g, g, b, b],
  [a, a, a, g, g, g, b, b],
  [a, a, a, 1, c, c, b, b],
  [f, f, f, f, c, c, b, b],
];

QUESTIONS[16] = [
  [b, b, b, b, b, a, a, a],
  [b, b, b, b, b, a, a, a],
  [g, g, g, c, c, a, a, a],
  [g, g, g, c, c, a, a, a],
  [g, g, g, 2, h, h, h, h],
  [3, e, e, 2, h, h, h, h],
  [3, e, e, d, d, d, d, d],
  [3, e, e, 1, f, f, f, f],
];

QUESTIONS[17] = [
  [b, b, h, h, f, f, f, f],
  [b, b, h, h, g, g, g, 3],
  [b, b, h, h, g, g, g, 3],
  [b, b, h, h, g, g, g, 3],
  [b, b, 1, c, c, a, a, a],
  [e, e, e, c, c, a, a, a],
  [e, e, e, 2, 2, a, a, a],
  [d, d, d, d, d, a, a, a],
];

QUESTIONS[18] = [
  [f, f, f, f, h, h, h, h],
  [e, e, e, 2, h, h, h, h],
  [e, e, e, 2, 1, a, a, a],
  [b, b, b, b, b, a, a, a],
  [b, b, b, b, b, a, a, a],
  [g, g, g, c, c, a, a, a],
  [g, g, g, c, c, 3, 3, 3],
  [g, g, g, d, d, d, d, d],
];

QUESTIONS[19] = [
  [1, d, 3, 3, 3, g, g, g],
  [f, d, e, e, e, g, g, g],
  [f, d, e, e, e, g, g, g],
  [f, d, c, c, 2, 2, b, b],
  [f, d, c, c, h, h, b, b],
  [a, a, a, a, h, h, b, b],
  [a, a, a, a, h, h, b, b],
  [a, a, a, a, h, h, b, b],
];

QUESTIONS[20] = [
  [b, b, 3, 3, 3, g, g, g],
  [b, b, e, e, e, g, g, g],
  [b, b, e, e, e, g, g, g],
  [b, b, c, c, 2, 2, d, 1],
  [b, b, c, c, h, h, d, f],
  [a, a, a, a, h, h, d, f],
  [a, a, a, a, h, h, d, f],
  [a, a, a, a, h, h, d, f],
];

QUESTIONS[21] = [
  [b, b, f, f, f, f, c, c],
  [b, b, a, a, a, 1, c, c],
  [b, b, a, a, a, e, e, 3],
  [b, b, a, a, a, e, e, 3],
  [b, b, a, a, a, e, e, 3],
  [g, g, g, 2, h, h, h, h],
  [g, g, g, 2, h, h, h, h],
  [g, g, g, d, d, d, d, d],
];

QUESTIONS[22] = [
  [a, a, a, a, f, f, f, f],
  [a, a, a, a, e, e, e, d],
  [a, a, a, a, e, e, e, d],
  [c, c, 2, h, h, h, h, d],
  [c, c, 2, h, h, h, h, d],
  [g, g, g, 1, 3, 3, 3, d],
  [g, g, g, b, b, b, b, b],
  [g, g, g, b, b, b, b, b],
];

QUESTIONS[23] = [
  [a, a, a, a, d, e, e, e],
  [a, a, a, a, d, e, e, e],
  [a, a, a, a, d, 3, 3, 3],
  [b, b, h, h, d, g, g, g],
  [b, b, h, h, d, g, g, g],
  [b, b, h, h, 2, g, g, g],
  [b, b, h, h, 2, 1, c, c],
  [b, b, f, f, f, f, c, c],
];

QUESTIONS[24] = [
  [d, d, d, d, d, a, a, a],
  [2, h, h, h, h, a, a, a],
  [2, h, h, h, h, a, a, a],
  [b, b, b, b, b, a, a, a],
  [b, b, b, b, b, c, c, f],
  [3, g, g, g, 1, c, c, f],
  [3, g, g, g, e, e, e, f],
  [3, g, g, g, e, e, e, f],
];

QUESTIONS[25] = [
  [a, a, a, a, h, h, b, b],
  [a, a, a, a, h, h, b, b],
  [a, a, a, a, h, h, b, b],
  [d, 1, c, c, h, h, b, b],
  [d, f, c, c, 2, 2, b, b],
  [d, f, g, g, g, e, e, e],
  [d, f, g, g, g, e, e, e],
  [d, f, g, g, g, 3, 3, 3],
];

QUESTIONS[26] = [
  [d, d, d, d, d, 1, b, b],
  [3, g, g, g, h, h, b, b],
  [3, g, g, g, h, h, b, b],
  [3, g, g, g, h, h, b, b],
  [e, e, 2, 2, h, h, b, b],
  [e, e, c, c, a, a, a, a],
  [e, e, c, c, a, a, a, a],
  [f, f, f, f, a, a, a, a],
];

QUESTIONS[27] = [
  [2, c, c, 3, a, a, a, a],
  [2, c, c, 3, a, a, a, a],
  [g, g, g, 3, a, a, a, a],
  [g, g, g, h, h, h, h, d],
  [g, g, g, h, h, h, h, d],
  [1, f, f, f, f, e, e, d],
  [b, b, b, b, b, e, e, d],
  [b, b, b, b, b, e, e, d],
];

QUESTIONS[28] = [
  [g, g, g, b, b, b, b, b],
  [g, g, g, b, b, b, b, b],
  [g, g, g, h, h, h, h, f],
  [d, c, c, h, h, h, h, f],
  [d, c, c, 1, a, a, a, f],
  [d, 3, 3, 3, a, a, a, f],
  [d, e, e, e, a, a, a, 2],
  [d, e, e, e, a, a, a, 2],
];

QUESTIONS[29] = [
  [f, f, f, f, a, a, a, d],
  [b, b, h, h, a, a, a, d],
  [b, b, h, h, a, a, a, d],
  [b, b, h, h, a, a, a, d],
  [b, b, h, h, 3, 3, 3, d],
  [b, b, 1, c, c, g, g, g],
  [e, e, e, c, c, g, g, g],
  [e, e, e, 2, 2, g, g, g],
];

QUESTIONS[30] = [
  [b, b, h, h, g, g, g, d],
  [b, b, h, h, g, g, g, d],
  [b, b, h, h, g, g, g, d],
  [b, b, h, h, 1, c, c, d],
  [b, b, 3, 3, 3, c, c, d],
  [a, a, a, a, e, e, e, 2],
  [a, a, a, a, e, e, e, 2],
  [a, a, a, a, f, f, f, f],
];

QUESTIONS[31] = [
  [g, g, g, 3, a, a, a, a],
  [g, g, g, 3, a, a, a, a],
  [g, g, g, 3, a, a, a, a],
  [b, b, 1, d, d, d, d, d],
  [b, b, f, f, f, f, h, h],
  [b, b, c, c, e, e, h, h],
  [b, b, c, c, e, e, h, h],
  [b, b, 2, 2, e, e, h, h],
];

QUESTIONS[32] = [
  [b, b, h, h, a, a, a, a],
  [b, b, h, h, a, a, a, a],
  [b, b, h, h, a, a, a, a],
  [b, b, h, h, c, c, d, 1],
  [b, b, 2, 2, c, c, d, f],
  [g, g, g, 3, 3, 3, d, f],
  [g, g, g, e, e, e, d, f],
  [g, g, g, e, e, e, d, f],
];

QUESTIONS[33] = [
  [a, a, a, g, g, g, b, b],
  [a, a, a, g, g, g, b, b],
  [a, a, a, g, g, g, b, b],
  [a, a, a, 3, 3, 3, b, b],
  [c, c, f, f, f, f, b, b],
  [c, c, 1, h, h, h, h, 2],
  [e, e, e, h, h, h, h, 2],
  [e, e, e, d, d, d, d, d],
];

QUESTIONS[34] = [
  [h, h, g, g, g, e, e, e],
  [h, h, g, g, g, e, e, e],
  [h, h, g, g, g, 3, 3, 3],
  [h, h, f, f, f, f, b, b],
  [d, d, d, d, d, 1, b, b],
  [2, 2, a, a, a, a, b, b],
  [c, c, a, a, a, a, b, b],
  [c, c, a, a, a, a, b, b],
];

QUESTIONS[35] = [
  [h, h, 2, 2, a, a, a, a],
  [h, h, c, c, a, a, a, a],
  [h, h, c, c, a, a, a, a],
  [h, h, 3, 3, 3, e, e, e],
  [d, d, d, d, d, e, e, e],
  [g, g, g, 1, f, f, f, f],
  [g, g, g, b, b, b, b, b],
  [g, g, g, b, b, b, b, b],
];

QUESTIONS[36] = [
  [c, c, g, g, g, 1, b, b],
  [c, c, g, g, g, f, b, b],
  [2, 2, g, g, g, f, b, b],
  [3, 3, 3, h, h, f, b, b],
  [a, a, a, h, h, f, b, b],
  [a, a, a, h, h, e, e, e],
  [a, a, a, h, h, e, e, e],
  [a, a, a, d, d, d, d, d],
];

QUESTIONS[37] = [
  [g, g, g, d, d, d, d, d],
  [g, g, g, b, b, a, a, a],
  [g, g, g, b, b, a, a, a],
  [2, c, c, b, b, a, a, a],
  [2, c, c, b, b, a, a, a],
  [e, e, e, b, b, 3, 3, 3],
  [e, e, e, 1, h, h, h, h],
  [f, f, f, f, h, h, h, h],
];

QUESTIONS[38] = [
  [h, h, 2, 2, a, a, a, a],
  [h, h, c, c, a, a, a, a],
  [h, h, c, c, a, a, a, a],
  [h, h, 3, 3, 3, e, e, e],
  [d, d, d, d, d, e, e, e],
  [g, g, g, f, f, f, f, 1],
  [g, g, g, b, b, b, b, b],
  [g, g, g, b, b, b, b, b],
];

QUESTIONS[39] = [
  [a, a, a, a, f, g, g, g],
  [a, a, a, a, f, g, g, g],
  [a, a, a, a, f, g, g, g],
  [b, b, 2, 2, f, c, c, d],
  [b, b, h, h, 1, c, c, d],
  [b, b, h, h, 3, 3, 3, d],
  [b, b, h, h, e, e, e, d],
  [b, b, h, h, e, e, e, d],
];

QUESTIONS[40] = [
  [b, b, c, c, f, f, f, f],
  [b, b, c, c, 1, e, e, e],
  [b, b, g, g, g, e, e, e],
  [b, b, g, g, g, d, 2, 2],
  [b, b, g, g, g, d, h, h],
  [a, a, a, a, 3, d, h, h],
  [a, a, a, a, 3, d, h, h],
  [a, a, a, a, 3, d, h, h],
];

QUESTIONS[41] = [
  [d, e, e, 3, f, f, f, f],
  [d, e, e, 3, h, h, h, h],
  [d, e, e, 3, h, h, h, h],
  [d, a, a, a, a, g, g, g],
  [d, a, a, a, a, g, g, g],
  [1, a, a, a, a, g, g, g],
  [c, c, 2, b, b, b, b, b],
  [c, c, 2, b, b, b, b, b],
];

QUESTIONS[42] = [
  [a, a, a, g, g, g, b, b],
  [a, a, a, g, g, g, b, b],
  [a, a, a, g, g, g, b, b],
  [a, a, a, 1, c, c, b, b],
  [h, h, h, h, c, c, b, b],
  [h, h, h, h, f, f, f, f],
  [e, e, e, 2, 2, 3, 3, 3],
  [e, e, e, d, d, d, d, d],
];

QUESTIONS[43] = [
  [g, g, g, e, e, e, c, c],
  [g, g, g, e, e, e, c, c],
  [g, g, g, a, a, a, h, h],
  [b, b, 1, a, a, a, h, h],
  [b, b, f, a, a, a, h, h],
  [b, b, f, a, a, a, h, h],
  [b, b, f, 2, 2, 3, 3, 3],
  [b, b, f, d, d, d, d, d],
];

QUESTIONS[44] = [
  [e, e, e, a, a, a, a, 3],
  [e, e, e, a, a, a, a, 3],
  [c, c, 2, a, a, a, a, 3],
  [c, c, 2, d, d, d, d, d],
  [b, b, b, b, b, g, g, g],
  [b, b, b, b, b, g, g, g],
  [h, h, h, h, 1, g, g, g],
  [h, h, h, h, f, f, f, f],
];

QUESTIONS[45] = [
  [h, h, b, b, b, b, b, d],
  [h, h, b, b, b, b, b, d],
  [h, h, 1, f, f, f, f, d],
  [h, h, 3, 3, 3, c, c, d],
  [2, 2, a, a, a, c, c, d],
  [e, e, a, a, a, g, g, g],
  [e, e, a, a, a, g, g, g],
  [e, e, a, a, a, g, g, g],
];

QUESTIONS[46] = [
  [b, b, b, b, b, a, a, a],
  [b, b, b, b, b, a, a, a],
  [2, h, h, h, h, a, a, a],
  [2, h, h, h, h, a, a, a],
  [g, g, g, 1, f, f, f, f],
  [g, g, g, c, c, 3, 3, 3],
  [g, g, g, c, c, e, e, e],
  [d, d, d, d, d, e, e, e],
];

QUESTIONS[47] = [
  [b, b, b, b, b, g, g, g],
  [b, b, b, b, b, g, g, g],
  [3, f, f, f, f, g, g, g],
  [3, d, d, d, d, d, c, c],
  [3, 1, h, h, 2, 2, c, c],
  [e, e, h, h, a, a, a, a],
  [e, e, h, h, a, a, a, a],
  [e, e, h, h, a, a, a, a],
];

QUESTIONS[48] = [
  [b, b, b, b, b, f, e, e],
  [b, b, b, b, b, f, e, e],
  [g, g, g, c, c, f, e, e],
  [g, g, g, c, c, f, 2, 2],
  [g, g, g, 1, a, a, a, a],
  [h, h, h, h, a, a, a, a],
  [h, h, h, h, a, a, a, a],
  [d, d, d, d, d, 3, 3, 3],
];

QUESTIONS[49] = [
  [e, e, e, d, d, d, d, d],
  [e, e, e, g, g, g, b, b],
  [3, c, c, g, g, g, b, b],
  [3, c, c, g, g, g, b, b],
  [3, 1, f, f, f, f, b, b],
  [a, a, a, a, 2, 2, b, b],
  [a, a, a, a, h, h, h, h],
  [a, a, a, a, h, h, h, h],
];

QUESTIONS[50] = [
  [a, a, a, a, 2, 2, e, e],
  [a, a, a, a, c, c, e, e],
  [a, a, a, a, c, c, e, e],
  [f, b, b, d, d, d, d, d],
  [f, b, b, h, h, 3, 3, 3],
  [f, b, b, h, h, g, g, g],
  [f, b, b, h, h, g, g, g],
  [1, b, b, h, h, g, g, g],
];

QUESTIONS[51] = [
  [a, a, a, d, h, h, h, h],
  [a, a, a, d, h, h, h, h],
  [a, a, a, d, g, g, g, 3],
  [a, a, a, d, g, g, g, 3],
  [f, c, c, d, g, g, g, 3],
  [f, c, c, 1, 2, 2, e, e],
  [f, b, b, b, b, b, e, e],
  [f, b, b, b, b, b, e, e],
];

QUESTIONS[52] = [
  [b, b, f, 3, 3, 3, h, h],
  [b, b, f, g, g, g, h, h],
  [b, b, f, g, g, g, h, h],
  [b, b, f, g, g, g, h, h],
  [b, b, 1, d, d, d, d, d],
  [a, a, a, a, c, c, e, e],
  [a, a, a, a, c, c, e, e],
  [a, a, a, a, 2, 2, e, e],
];

QUESTIONS[53] = [
  [b, b, b, b, b, g, g, g],
  [b, b, b, b, b, g, g, g],
  [3, e, e, c, c, g, g, g],
  [3, e, e, c, c, d, 2, 2],
  [3, e, e, 1, f, d, h, h],
  [a, a, a, a, f, d, h, h],
  [a, a, a, a, f, d, h, h],
  [a, a, a, a, f, d, h, h],
];

QUESTIONS[54] = [
  [b, b, h, h, d, a, a, a],
  [b, b, h, h, d, a, a, a],
  [b, b, h, h, d, a, a, a],
  [b, b, h, h, d, a, a, a],
  [b, b, 2, 2, d, c, c, f],
  [g, g, g, 3, 1, c, c, f],
  [g, g, g, 3, e, e, e, f],
  [g, g, g, 3, e, e, e, f],
];

QUESTIONS[55] = [
  [g, g, g, b, b, b, b, b],
  [g, g, g, b, b, b, b, b],
  [g, g, g, h, h, h, h, 2],
  [3, 3, 3, h, h, h, h, 2],
  [d, d, d, d, d, 1, e, e],
  [a, a, a, a, c, c, e, e],
  [a, a, a, a, c, c, e, e],
  [a, a, a, a, f, f, f, f],
];

QUESTIONS[56] = [
  [f, g, g, g, 2, 2, e, e],
  [f, g, g, g, c, c, e, e],
  [f, g, g, g, c, c, e, e],
  [f, d, d, d, d, d, 1, 3],
  [a, a, a, h, h, h, h, 3],
  [a, a, a, h, h, h, h, 3],
  [a, a, a, b, b, b, b, b],
  [a, a, a, b, b, b, b, b],
];

QUESTIONS[57] = [
  [a, a, a, a, h, h, h, h],
  [a, a, a, a, h, h, h, h],
  [a, a, a, a, g, g, g, 3],
  [b, b, 1, d, g, g, g, 3],
  [b, b, f, d, g, g, g, 3],
  [b, b, f, d, c, c, e, e],
  [b, b, f, d, c, c, e, e],
  [b, b, f, d, 2, 2, e, e],
];

QUESTIONS[58] = [
  [b, b, a, a, a, e, e, e],
  [b, b, a, a, a, e, e, e],
  [b, b, a, a, a, c, c, 3],
  [b, b, a, a, a, c, c, 3],
  [b, b, f, f, f, f, 1, 3],
  [g, g, g, d, d, d, d, d],
  [g, g, g, 2, h, h, h, h],
  [g, g, g, 2, h, h, h, h],
];

QUESTIONS[59] = [
  [e, e, c, c, a, a, a, d],
  [e, e, c, c, a, a, a, d],
  [e, e, 1, f, a, a, a, d],
  [g, g, g, f, a, a, a, d],
  [g, g, g, f, 2, h, h, d],
  [g, g, g, f, 2, h, h, 3],
  [b, b, b, b, b, h, h, 3],
  [b, b, b, b, b, h, h, 3],
];

QUESTIONS[60] = [
  [g, g, g, b, b, b, b, b],
  [g, g, g, b, b, b, b, b],
  [g, g, g, 1, f, f, f, f],
  [a, a, a, a, 3, e, e, d],
  [a, a, a, a, 3, e, e, d],
  [a, a, a, a, 3, e, e, d],
  [c, c, 2, h, h, h, h, d],
  [c, c, 2, h, h, h, h, d],
];

QUESTIONS[61] = [
  [g, g, g, 3, a, a, a, a],
  [g, g, g, 3, a, a, a, a],
  [g, g, g, 3, a, a, a, a],
  [e, e, b, b, b, b, b, d],
  [e, e, b, b, b, b, b, d],
  [e, e, 1, f, f, f, f, d],
  [h, h, h, h, 2, c, c, d],
  [h, h, h, h, 2, c, c, d],
];

QUESTIONS[62] = [
  [b, b, h, h, f, f, f, f],
  [b, b, h, h, d, e, e, e],
  [b, b, h, h, d, e, e, e],
  [b, b, h, h, d, 3, 3, 3],
  [b, b, 2, 2, d, a, a, a],
  [g, g, g, 1, d, a, a, a],
  [g, g, g, c, c, a, a, a],
  [g, g, g, c, c, a, a, a],
];

QUESTIONS[63] = [
  [g, g, g, b, b, b, b, b],
  [g, g, g, b, b, b, b, b],
  [g, g, g, 1, f, f, f, f],
  [c, c, 2, h, h, h, h, d],
  [c, c, 2, h, h, h, h, d],
  [a, a, a, a, 3, e, e, d],
  [a, a, a, a, 3, e, e, d],
  [a, a, a, a, 3, e, e, d],
];

QUESTIONS[64] = [
  [b, b, b, b, b, f, e, e],
  [b, b, b, b, b, f, e, e],
  [a, a, a, c, c, f, e, e],
  [a, a, a, c, c, f, 1, d],
  [a, a, a, 2, 3, 3, 3, d],
  [a, a, a, 2, g, g, g, d],
  [h, h, h, h, g, g, g, d],
  [h, h, h, h, g, g, g, d],
];

QUESTIONS[65] = [
  [h, h, h, h, d, g, g, g],
  [h, h, h, h, d, g, g, g],
  [2, e, e, e, d, g, g, g],
  [2, e, e, e, d, c, c, 3],
  [a, a, a, 1, d, c, c, 3],
  [a, a, a, f, f, f, f, 3],
  [a, a, a, b, b, b, b, b],
  [a, a, a, b, b, b, b, b],
];

QUESTIONS[66] = [
  [e, e, e, 2, h, h, h, h],
  [e, e, e, 2, h, h, h, h],
  [b, b, a, a, a, g, g, g],
  [b, b, a, a, a, g, g, g],
  [b, b, a, a, a, g, g, g],
  [b, b, a, a, a, 1, c, c],
  [b, b, f, f, f, f, c, c],
  [3, 3, 3, d, d, d, d, d],
];

QUESTIONS[67] = [
  [a, a, a, a, c, c, b, b],
  [a, a, a, a, c, c, b, b],
  [a, a, a, a, 1, f, b, b],
  [d, d, d, d, d, f, b, b],
  [h, h, g, g, g, f, b, b],
  [h, h, g, g, g, f, 2, 2],
  [h, h, g, g, g, e, e, e],
  [h, h, 3, 3, 3, e, e, e],
];

QUESTIONS[68] = [
  [a, a, a, g, g, g, b, b],
  [a, a, a, g, g, g, b, b],
  [a, a, a, g, g, g, b, b],
  [a, a, a, 1, f, d, b, b],
  [h, h, e, e, f, d, b, b],
  [h, h, e, e, f, d, 2, 2],
  [h, h, e, e, f, d, c, c],
  [h, h, 3, 3, 3, d, c, c],
];

QUESTIONS[69] = [
  [b, b, a, a, a, g, g, g],
  [b, b, a, a, a, g, g, g],
  [b, b, a, a, a, g, g, g],
  [b, b, a, a, a, 1, h, h],
  [b, b, c, c, e, e, h, h],
  [2, 2, c, c, e, e, h, h],
  [f, f, f, f, e, e, h, h],
  [d, d, d, d, d, 3, 3, 3],
];

QUESTIONS[70] = [
  [h, h, h, h, a, a, a, a],
  [h, h, h, h, a, a, a, a],
  [b, b, 2, 2, a, a, a, a],
  [b, b, f, f, f, f, c, c],
  [b, b, g, g, g, 1, c, c],
  [b, b, g, g, g, e, e, e],
  [b, b, g, g, g, e, e, e],
  [d, d, d, d, d, 3, 3, 3],
];

QUESTIONS[71] = [
  [b, b, b, b, b, a, a, a],
  [b, b, b, b, b, a, a, a],
  [g, g, g, c, c, a, a, a],
  [g, g, g, c, c, a, a, a],
  [g, g, g, 1, e, e, e, 2],
  [h, h, h, h, e, e, e, 2],
  [h, h, h, h, f, f, f, f],
  [3, 3, 3, d, d, d, d, d],
];

QUESTIONS[72] = [
  [a, a, a, d, d, d, d, d],
  [a, a, a, g, g, g, h, h],
  [a, a, a, g, g, g, h, h],
  [a, a, a, g, g, g, h, h],
  [c, c, f, f, f, f, h, h],
  [c, c, 2, 2, 1, e, e, 3],
  [b, b, b, b, b, e, e, 3],
  [b, b, b, b, b, e, e, 3],
];

QUESTIONS[73] = [
  [h, h, f, f, f, f, b, b],
  [h, h, g, g, g, d, b, b],
  [h, h, g, g, g, d, b, b],
  [h, h, g, g, g, d, b, b],
  [a, a, a, 2, 2, d, b, b],
  [a, a, a, e, e, d, 1, 3],
  [a, a, a, e, e, c, c, 3],
  [a, a, a, e, e, c, c, 3],
];

QUESTIONS[74] = [
  [3, h, h, h, h, a, a, a],
  [3, h, h, h, h, a, a, a],
  [3, 1, e, e, e, a, a, a],
  [b, b, e, e, e, a, a, a],
  [b, b, f, d, d, d, d, d],
  [b, b, f, c, c, g, g, g],
  [b, b, f, c, c, g, g, g],
  [b, b, f, 2, 2, g, g, g],
];

QUESTIONS[75] = [
  [c, c, d, b, b, b, b, b],
  [c, c, d, b, b, b, b, b],
  [2, 2, d, f, g, g, g, 3],
  [e, e, d, f, g, g, g, 3],
  [e, e, d, f, g, g, g, 3],
  [e, e, 1, f, a, a, a, a],
  [h, h, h, h, a, a, a, a],
  [h, h, h, h, a, a, a, a],
];

QUESTIONS[76] = [
  [b, b, b, b, b, a, a, a],
  [b, b, b, b, b, a, a, a],
  [g, g, g, c, c, a, a, a],
  [g, g, g, c, c, a, a, a],
  [g, g, g, 1, f, f, f, f],
  [d, d, d, d, d, e, e, e],
  [h, h, h, h, 2, e, e, e],
  [h, h, h, h, 2, 3, 3, 3],
];

QUESTIONS[77] = [
  [a, a, a, a, h, h, h, h],
  [a, a, a, a, h, h, h, h],
  [a, a, a, a, 2, e, e, e],
  [b, b, f, 1, 2, e, e, e],
  [b, b, f, d, d, d, d, d],
  [b, b, f, c, c, g, g, g],
  [b, b, f, c, c, g, g, g],
  [b, b, 3, 3, 3, g, g, g],
];

QUESTIONS[78] = [
  [b, b, 3, 3, 3, a, a, a],
  [b, b, f, c, c, a, a, a],
  [b, b, f, c, c, a, a, a],
  [b, b, f, d, 2, a, a, a],
  [b, b, f, d, 2, 1, h, h],
  [g, g, g, d, e, e, h, h],
  [g, g, g, d, e, e, h, h],
  [g, g, g, d, e, e, h, h],
];

QUESTIONS[79] = [
  [3, g, g, g, e, e, e, f],
  [3, g, g, g, e, e, e, f],
  [3, g, g, g, 1, c, c, f],
  [b, b, 2, 2, d, c, c, f],
  [b, b, h, h, d, a, a, a],
  [b, b, h, h, d, a, a, a],
  [b, b, h, h, d, a, a, a],
  [b, b, h, h, d, a, a, a],
];

QUESTIONS[80] = [
  [c, c, d, b, b, b, b, b],
  [c, c, d, b, b, b, b, b],
  [2, 2, d, f, a, a, a, a],
  [e, e, d, f, a, a, a, a],
  [e, e, d, f, a, a, a, a],
  [e, e, 1, f, g, g, g, 3],
  [h, h, h, h, g, g, g, 3],
  [h, h, h, h, g, g, g, 3],
];

QUESTIONS[81] = [
  [h, h, 3, 3, 3, g, g, g],
  [h, h, e, e, d, g, g, g],
  [h, h, e, e, d, g, g, g],
  [h, h, e, e, d, 1, b, b],
  [a, a, a, 2, d, f, b, b],
  [a, a, a, 2, d, f, b, b],
  [a, a, a, c, c, f, b, b],
  [a, a, a, c, c, f, b, b],
];

QUESTIONS[82] = [
  [c, c, d, f, a, a, a, a],
  [c, c, d, f, a, a, a, a],
  [2, 2, d, f, a, a, a, a],
  [b, b, d, f, g, g, g, 3],
  [b, b, d, 1, g, g, g, 3],
  [b, b, e, e, g, g, g, 3],
  [b, b, e, e, h, h, h, h],
  [b, b, e, e, h, h, h, h],
];

QUESTIONS[83] = [
  [h, h, h, h, a, a, a, a],
  [h, h, h, h, a, a, a, a],
  [2, 3, 3, 3, a, a, a, a],
  [2, d, d, d, d, d, b, b],
  [c, c, f, f, f, f, b, b],
  [c, c, 1, g, g, g, b, b],
  [e, e, e, g, g, g, b, b],
  [e, e, e, g, g, g, b, b],
];

QUESTIONS[84] = [
  [e, e, e, h, h, g, g, g],
  [e, e, e, h, h, g, g, g],
  [b, b, 1, h, h, g, g, g],
  [b, b, f, h, h, 3, 3, 3],
  [b, b, f, 2, 2, a, a, a],
  [b, b, f, c, c, a, a, a],
  [b, b, f, c, c, a, a, a],
  [d, d, d, d, d, a, a, a],
];

QUESTIONS[85] = [
  [e, e, e, d, f, g, g, g],
  [e, e, e, d, f, g, g, g],
  [3, 3, 3, d, f, g, g, g],
  [2, c, c, d, f, 1, b, b],
  [2, c, c, d, h, h, b, b],
  [a, a, a, a, h, h, b, b],
  [a, a, a, a, h, h, b, b],
  [a, a, a, a, h, h, b, b],
];

QUESTIONS[86] = [
  [f, f, f, f, 3, g, g, g],
  [a, a, a, d, 3, g, g, g],
  [a, a, a, d, 3, g, g, g],
  [a, a, a, d, b, b, h, h],
  [a, a, a, d, b, b, h, h],
  [e, e, 1, d, b, b, h, h],
  [e, e, c, c, b, b, h, h],
  [e, e, c, c, b, b, 2, 2],
];

QUESTIONS[87] = [
  [h, h, f, f, f, f, b, b],
  [h, h, g, g, g, d, b, b],
  [h, h, g, g, g, d, b, b],
  [h, h, g, g, g, d, b, b],
  [a, a, a, e, e, d, b, b],
  [a, a, a, e, e, d, 1, 3],
  [a, a, a, e, e, c, c, 3],
  [a, a, a, 2, 2, c, c, 3],
];

// 导出（Node/CommonJS 环境下可用），浏览器脚本中直接使用 QUESTIONS 即可
if (typeof module !== 'undefined') module.exports = QUESTIONS;
