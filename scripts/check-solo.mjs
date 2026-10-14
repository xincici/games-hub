// 单人麻将的离线自检（纯逻辑、不开浏览器）：node scripts/check-solo.mjs [局数]
// 断言：每种牌不超过 4 张、少花色的比例、手牌一定是「只差一步就听牌」、胡牌判断的正反例。
const B = await import('../src/games/solo/board.js');
const { isWin, waits, newRoundSafe, discardAt, sameTile, buildPool, sortTiles,
  SUITS, HAND_SIZE, WALL_SIZE, COPIES, roundPlan } = B;
const N = Number(process.argv[2]) || 1000;
const problems = [];
const fail = m => problems.push(m);
const T = (suit, value) => ({ suit, value });

// ① 胡牌判断：正例 / 反例（改判断逻辑先看这里）
const wins = [
  [T('m',1),T('m',2),T('m',3), T('m',4),T('m',5),T('m',6), T('s',2),T('s',2),T('s',2), T('p',7),T('p',8),T('p',9), T('z',1),T('z',1)],
  [T('m',1),T('m',1),T('m',1), T('s',9),T('s',9),T('s',9), T('p',5),T('p',5),T('p',5), T('z',7),T('z',7),T('z',7), T('z',3),T('z',3)],
  [T('m',1),T('m',1),T('s',3),T('s',3),T('p',5),T('p',5),T('z',1),T('z',1),T('z',2),T('z',2),T('z',5),T('z',5),T('z',6),T('z',6)],  // 七对子
];
const notWins = [
  [T('m',1),T('m',2),T('m',4), T('m',4),T('m',5),T('m',6), T('s',2),T('s',2),T('s',2), T('p',7),T('p',8),T('p',9), T('z',1),T('z',1)],
  [T('m',1),T('m',2),T('m',3), T('m',4),T('m',5),T('m',6), T('s',2),T('s',2),T('s',2), T('p',7),T('p',8),T('p',9), T('z',1),T('z',2)],
  [T('z',1),T('z',2),T('z',3), T('z',4),T('z',5),T('z',6), T('z',7),T('z',7),T('z',7), T('m',1),T('m',1),T('m',1), T('s',1),T('s',2)],
];
for (const h of wins) if (!isWin(h)) fail('这副应当能胡：' + h.map(t => t.suit + t.value).join(' '));
for (const h of notWins) if (isWin(h)) fail('这副不该能胡：' + h.map(t => t.suit + t.value).join(' '));
if (isWin(wins[0].slice(0, 13))) fail('13 张不该判胡');

// ② 发牌：牌张、少花色、「打掉 odd 就听 need」
let omit = 0, maxCopy = 0, bad = 0, handWins = 0, wallBad = 0, needInWall = 0, needEarly = 0;
for (let i = 0; i < N; i++) {
  const r = newRoundSafe();
  if (r.hand.length !== HAND_SIZE) fail(`手牌 ${r.hand.length} 张（应为 14）`);
  if (r.wall.length > WALL_SIZE) wallBad++;
  if (r.omitted) omit++;
  const c = new Map();
  for (const t of [...r.hand, ...r.wall]) { const k = t.suit + t.value; c.set(k, (c.get(k) || 0) + 1); maxCopy = Math.max(maxCopy, c.get(k)); }
  if (r.omitted) for (const t of [...r.hand, ...r.wall]) if (t.suit === r.omitted) fail(`少的花色 ${r.omitted} 仍出现`);
  if (isWin(r.hand)) handWins++;
  if (r.wall.some(t => sameTile(t, r.need))) needInWall++;
  if (r.wall.findIndex(t => sameTile(t, r.need)) > 7) needEarly++;
  const oddIdx = r.hand.findIndex(t => sameTile(t, r.odd));
  if (oddIdx < 0) { bad++; continue; }
  if (!waits(discardAt(r.hand, oddIdx)).some(t => sameTile(t, r.need))) bad++;
}
if (maxCopy > COPIES) fail(`出现了 ${maxCopy} 张相同的牌（应 ≤ 4）`);
if (wallBad) fail(`${wallBad} 局的牌墙超过 ${WALL_SIZE} 张`);
if (handWins) fail(`${handWins} 局发出来的手牌本身就是胡牌（应重发）`);
if (bad) fail(`${bad} 局没有做到「打掉 odd 就听 need」`);
if (needInWall !== N) fail(`${N - needInWall} 局的 need 不在牌墙里`);
if (needEarly) fail(`${needEarly} 局的 need 不在前 8 张内（正确的打法会等太久）`);
if (!(omit > N * 0.25 && omit < N * 0.65)) fail(`少花色的比例异常：${(omit / N * 100).toFixed(0)}%`);

// ③ 整副张数与排序
if (buildPool().length !== 136) fail(`整副应为 136 张，实为 ${buildPool().length}`);
if (buildPool(['m', 's']).length !== 100) fail(`少一个花色应为 100 张，实为 ${buildPool(['m', 's']).length}`);
const sorted = sortTiles([T('z',3), T('p',2), T('m',9), T('s',1), T('m',1)]).map(t => t.suit + t.value).join(' ');
if (sorted !== 'm1 m9 s1 p2 z3') fail('排序应为 万→条→筒→字：' + sorted);
if (SUITS.length !== 3) fail('花色应为万/条/筒三种');

// ④ 难度阶梯：连胜越高牌墙越短、need 埋得越深，而且**每一档都遵守本档计划**
let prevWall = Infinity, prevNeed = -1;
for (let s = 0; s <= 15; s++) {
  const plan = roundPlan(s);
  if (plan.wallSize > prevWall) fail(`连胜 ${s} 的牌墙反而变长了：${plan.wallSize} > ${prevWall}`);
  if (plan.needBy < prevNeed) fail(`连胜 ${s} 的 need 深度反而变浅了：${plan.needBy} < ${prevNeed}`);
  prevWall = plan.wallSize; prevNeed = plan.needBy;
  for (let i = 0; i < 25; i++) {
    const r = newRoundSafe(Math.random, s);
    if (r.wall.length > plan.wallSize) fail(`连胜 ${s} 的牌墙 ${r.wall.length} 张 > 计划 ${plan.wallSize}`);
    const at = r.wall.findIndex(t => sameTile(t, r.need));
    if (at < 0) fail(`连胜 ${s}：need 不在牌墙里`);
    else if (at > plan.needBy) fail(`连胜 ${s}：need 埋在第 ${at} 张，超出计划 ${plan.needBy}`);
    const oddIdx = r.hand.findIndex(t => sameTile(t, r.odd));
    if (oddIdx < 0 || !waits(discardAt(r.hand, oddIdx)).some(t => sameTile(t, r.need))) {
      fail(`连胜 ${s}：没有做到「打掉 odd 就听 need」`);
    }
  }
}
if (roundPlan(0).wallSize !== WALL_SIZE) fail(`连胜 0 应给满额 ${WALL_SIZE} 张牌墙，实为 ${roundPlan(0).wallSize}`);
if (roundPlan(99).wallSize !== 18) fail(`高连胜应封顶在 18 张，实为 ${roundPlan(99).wallSize}`);

console.log(`${N} 局：每种牌最多 ${maxCopy} 张 · 少花色 ${(omit / N * 100).toFixed(0)}% · 牌墙 ${WALL_SIZE} 张以内 · 保证率 ${(100 - bad / N * 100).toFixed(1)}%`);
console.log(problems.length ? `✗ 问题 ${problems.length} 条` : '✓ 每局都只差一步就听牌，胡牌判断正反例都对');
for (const p of problems.slice(0, 10)) console.log('  · ' + p);
process.exit(problems.length ? 1 : 0);
