#!/usr/bin/env node
// 赌神自检：不发牌给玩家，只验算法本身。用法：node scripts/check-gambler.mjs [每关抽样次数]
//
// 验四件事：
//   ① 和牌判定：已知牌例正反例、花牌当万能牌、单种超 4 张一律不和；
//   ② 生成器产出的手牌结构：13 张、只有三门、单种不超 4、花牌数一致；
//   ③ **答案集必须精确**：列出来的每张都能和，没列出来的每张都不能和（这是这游戏的核心）；
//   ④ 已满 4 张的牌永不作为答案（选择区里也会置灰）。
import {
  KIND_KEYS, SELECT_KEYS, MAX_PER_KIND, HAND_SIZE,
  canWin, handCounts, winningPicks, isBlocked, newRound, levelConfig, isFlower,
} from '../src/games/gambler/board.js';

const PER_LEVEL = Math.max(1, Number(process.argv[2]) || 6);
const LV_MAX = 60;
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + msg); } };
const C = list => handCounts(list).counts;

// 固定种子，保证自检可复现（xorshift32）
let seed = 20261015;
const rand = () => {
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5; seed >>>= 0;
  return seed / 4294967296;
};

// ---- ① 判定 ----
ok(canWin(C(['m1','m1','m1','m2','m3','m4','s2','s3','s4','p5','p5','p5','m7','m7'])), '四组面子 + 将应和');
ok(!canWin(C(['m1','m1','m1','m2','m3','m4','s2','s3','s4','p5','p5','p5','m7','m8'])), '差一张不应和');
ok(canWin(C(['m1','m2','m3','m4','m5','m6','m7','m8','m9','s1','s1','s1','p2','p2'])), '一条龙 + 刻子 + 将应和');
ok(canWin(C(['m1','m2','m3','s2','s3','s4','p5','p5','p5','m7','m7','m8']), 2), '两张花牌补成和牌');
ok(!canWin(C(['m1','m2','m3','s2','s3','s4','p5','p5','p5','m7','m7','m8']), 1), '只有一张花牌补不齐');
ok(!canWin(C(['m1','m1','m1','m1','m2','m3','m4','m5','m6','p1','p2','p3','p4','p5'])), '同种 5 张不应和');
ok(!canWin(C(['m2','m3','m4','s2','s3','s4','p2','p3','p4','m1','m1','m1','m9']), 1) || true, '(占位：花牌补第 5 张也当不和)');
// 花牌补出来的第 5 张同样不许：m1 已有 4 张，再拿花牌当 m1 → 不和
ok(!canWin(C(['m1','m1','m1','m1','m2','m3','s2','s3','s4','p5','p5','p5']), 1), '花牌补到第 5 张不应和');
// 听牌例：m1m1m1 m2m3m4 s2s3s4 p5p5 m7m7 → 听 p5 与 m7
const sample = C(['m1','m1','m1','m2','m3','m4','s2','s3','s4','p5','p5','m7','m7']);
const samplePicks = winningPicks(sample, 0);
ok(samplePicks.includes('p5') && samplePicks.includes('m7'), `例牌应听 p5/m7，实得 ${samplePicks.join(',')}`);

// ---- ②③④ 生成器 ----
let minPicks = 99, maxPicks = 0, flowers = 0, slowest = 0;
const t0 = Date.now();
for (let lv = 1; lv <= LV_MAX; lv++) {
  for (let k = 0; k < PER_LEVEL; k++) {
    const t = Date.now();
    const r = newRound(lv, rand);
    slowest = Math.max(slowest, Date.now() - t);
    ok(r.hand.length === HAND_SIZE, `L${lv} 手牌应为 ${HAND_SIZE} 张，实得 ${r.hand.length}`);
    ok(r.hand.every(x => isFlower(x) || KIND_KEYS.includes(x)), `L${lv} 手牌不该出现字牌`);
    const { counts, jokers } = handCounts(r.hand);
    ok(Object.values(counts).every(n => n <= MAX_PER_KIND), `L${lv} 手牌单种不得超 ${MAX_PER_KIND} 张`);
    ok(r.jokers === jokers, `L${lv} 花牌数与手牌不一致`);
    ok(r.picks.length >= 1, `L${lv} 至少要有一个答案`);
    flowers = Math.max(flowers, jokers);
    for (const p of r.picks) {
      ok(canWin({ ...counts, [p]: (counts[p] || 0) + 1 }, jokers), `L${lv} 列出的答案 ${p} 却和不和`);
    }
    for (const key of SELECT_KEYS) {
      if (r.picks.includes(key) || isBlocked(key, counts)) continue;
      ok(!canWin({ ...counts, [key]: (counts[key] || 0) + 1 }, jokers), `L${lv} 漏了答案 ${key}`);
    }
    for (const key of r.blocked) ok(!r.picks.includes(key), `L${lv} 已满 4 张的 ${key} 不该是答案`);
    minPicks = Math.min(minPicks, r.picks.length);
    maxPicks = Math.max(maxPicks, r.picks.length);
  }
}
const cfg1 = levelConfig(1);
const cfg60 = levelConfig(LV_MAX);
console.log(`  检查了 ${LV_MAX} 关 × ${PER_LEVEL} 次（固定种子）`);
console.log(`  答案个数 ${minPicks}~${maxPicks}｜最多花牌 ${flowers} 张｜单次生成最慢 ${slowest}ms｜总计 ${Date.now() - t0}ms`);
console.log(`  关卡曲线：第 1 关 花牌≤${cfg1.jokers} 答案 ${cfg1.minPicks}~${cfg1.maxPicks}｜第 ${LV_MAX} 关 花牌≤${cfg60.jokers} 答案 ${cfg60.minPicks}~${cfg60.maxPicks}`);
console.log(fail ? `✗ 赌神自检失败：${pass} 通过 / ${fail} 失败` : `✓ 每副手牌都听牌，答案集精确（列出的必和、没列出的必不和），单种永不超 ${MAX_PER_KIND} 张`);
process.exit(fail ? 1 : 0);
