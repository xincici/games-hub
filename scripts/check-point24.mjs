#!/usr/bin/env node
// 24 点出题器自检（纯逻辑，不开浏览器）：node scripts/check-point24.mjs [每关样本数]
// 断言：每道题都**有解**、答案串能被**独立解析**回 24、数字都在 1~9、难度随关卡递增、生成不卡住。
import {
  solveAll, newPuzzle, verifyAnswer, targetHardness, appendable, evalTokens, FALLBACK_NUMS, scorePuzzle,
} from '../src/games/point24/board.js';

const PER_LEVEL = Number(process.argv[2]) || 200;
const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 15, 20];
const problems = [];
const fail = m => problems.push(m);

// 固定牌组：一定可解（用来证明兜底不会发出死题）
for (const nums of [FALLBACK_NUMS, [3, 3, 8, 8], [8, 3, 8, 3], [1, 5, 5, 5], [4, 4, 10, 10], [5, 5, 5, 5]]) {
  const sols = solveAll(nums);
  if (!sols.length) fail(`固定牌组 ${nums.join(' ')} 竟然无解`);
  else if (!verifyAnswer(sols[0].expr, nums).ok) fail(`固定牌组 ${nums.join(' ')} 的答案「${sols[0].expr}」复算不是 24`);
}
// 无解的牌组必须求不出解（否则说明求解器在瞎报）
// 注意 5 5 5 5 **是有解的**（5×5−5÷5=24）—— 第一版把它错列进「本该无解」，是样例写错了不是求解器错了
for (const nums of [[1, 1, 1, 1], [9, 9, 9, 9], [1, 1, 1, 2]]) {
  if (solveAll(nums).length) fail(`${nums.join(' ')} 本该无解，求解器却给出了解`);
}

console.log(`每个关卡 ${PER_LEVEL} 题\n  关卡  平均难度  平均解数  最慢一题  无解/答案错`);
let total = 0, bad = 0;
for (const level of LEVELS) {
  let hSum = 0, sSum = 0, worst = 0, badHere = 0;
  for (let i = 0; i < PER_LEVEL; i++) {
    const t0 = performance.now();
    const p = newPuzzle(level, Math.random, null);
    const ms = performance.now() - t0;
    worst = Math.max(worst, ms);
    total++;
    if (!p.nums.every(n => Number.isInteger(n) && n >= 1 && n <= 9)) { fail(`关卡 ${level} 发出越界数字 ${p.nums}`); badHere++; }
    if (!solveAll(p.nums).length) { fail(`关卡 ${level} 发出了**无解**的题 ${p.nums}`); badHere++; }
    const v = verifyAnswer(p.answer, p.nums);
    if (!v.ok) { fail(`关卡 ${level} 的答案「${p.answer}」（题 ${p.nums.join(' ')}）复算失败：${JSON.stringify(v)}`); badHere++; }
    if (p.answerCount < 1) { fail(`关卡 ${level} 的 answerCount 是 0`); badHere++; }
    hSum += p.hardness; sSum += p.answerCount;
  }
  bad += badHere;
  console.log(`  ${String(level).padStart(4)}  ${(hSum / PER_LEVEL).toFixed(2).padStart(8)}  ${(sSum / PER_LEVEL).toFixed(1).padStart(8)}  ${worst.toFixed(0).padStart(6)}ms  ${badHere}`);
}

// token 规则（界面置灰的依据）不能退化
const num = (i, v) => ({ t: 'num', i, v });
const op = o => ({ t: 'op', op: o });
if (appendable([], { t: 'rp' })) fail('空算式竟然允许右括号');
if (appendable([], op('+'))) fail('空算式竟然允许运算符');
if (!appendable([], { t: 'lp' }) || !appendable([], num(0, 3))) fail('空算式应允许左括号与数字');
if (appendable([num(0, 3), num(1, 4)], num(1, 4))) fail('连着的两个数字不该都能加');
if (appendable([num(0, 3), op('+')], { t: 'rp' })) fail('「3 +」之后不该允许右括号');
if (evalTokens([{ t: 'lp' }, num(0, 3), op('+'), num(1, 3), { t: 'rp' }, op('×'), { t: 'lp' }, num(2, 5), op('-'), num(3, 1), { t: 'rp' }]).is24 !== true)
  fail('(3+3)×(5−1) 应判为 24');

// 难度评分：区间必须是 1~100，极端牌组要落在两头，且大体随难度档递增
const sEasy = scorePuzzle([6, 6, 6, 6]), sHard = scorePuzzle([3, 3, 8, 8]);
if (!(sEasy >= 1 && sEasy <= 100)) fail(`6 6 6 6 的评分越界：${sEasy}`);
if (!(sHard >= 1 && sHard <= 100)) fail(`3 3 8 8 的评分越界：${sHard}`);
if (!(sHard > sEasy + 50)) fail(`难度评分没区分开：3 3 8 8 = ${sHard}，6 6 6 6 = ${sEasy}`);
if (sEasy > 30) fail(`一眼就会的 6 6 6 6 评分过高：${sEasy}`);
if (sHard < 85) fail(`唯一解又必须分数的 3 3 8 8 评分过低：${sHard}`);
if (scorePuzzle([1, 2, 3, 4]) > 60) fail(`1 2 3 4 只是乘法，评分不该偏高：${scorePuzzle([1, 2, 3, 4])}`);
if (scorePuzzle([1, 1, 1, 1]) !== 1) fail(`无解牌组应给最低分，实得 ${scorePuzzle([1, 1, 1, 1])}`);
let scoreTotal = 0, scoreCount = 0, scoreMin = 101, scoreMax = 0;
const byLevel = [];
for (const level of LEVELS) {
  let sum = 0, n = 0;
  for (let i = 0; i < 40; i++) {
    const p = newPuzzle(level, Math.random, null);
    if (!(p.score >= 1 && p.score <= 100)) { fail(`关卡 ${level} 的评分越界：${p.score}`); }
    if (p.score !== scorePuzzle(p.nums)) { fail(`关卡 ${level} 的评分与重算不一致：${p.score} vs ${scorePuzzle(p.nums)}`); }
    sum += p.score; n++; scoreTotal += p.score; scoreCount++; scoreMin = Math.min(scoreMin, p.score); scoreMax = Math.max(scoreMax, p.score);
  }
  byLevel.push(`${level}:${Math.round(sum / n)}`);
}
if (scoreCount && !(scoreMin >= 1 && scoreMax <= 100)) fail(`评分区间异常：${scoreMin}~${scoreMax}`);
const early = Number(byLevel[0].split(':')[1]), late = Number(byLevel[byLevel.length - 1].split(':')[1]);
if (!(late > early)) fail(`评分没有随关卡递增：关卡 ${LEVELS[0]} 平均 ${early}，关卡 ${LEVELS[LEVELS.length - 1]} 平均 ${late}`);

console.log(`\n难度评分：6 6 6 6 = ${sEasy}，3 3 8 8 = ${sHard}；${scoreCount} 题评分区间 ${scoreMin}~${scoreMax}（平均 ${(scoreTotal / scoreCount).toFixed(0)}）`);
console.log(`  逐关平均：${byLevel.join('  ')}`);
console.log(`\n共 ${total} 题，问题 ${problems.length} 条`);
for (const p of problems.slice(0, 10)) console.log('  ✗ ' + p);
if (problems.length) process.exit(1);
console.log('✓ 每道题都有解，答案都能独立复算回 24');
