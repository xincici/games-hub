// 24 点（`src/games/point24/board.js`）
//
// 纯逻辑，**故意不 import 任何东西** —— 这样可以直接用 node 跑（`node -e "import('./src/games/point24/board.js')"`）
// 做离线验证：发出来的题一定有解、答案串能被独立解析回 24、难度分级确实递增。游戏界面不依赖这里的 DOM 假设。
//
// 全程用**精确分数**（{n, d}）而不是浮点：`8 / (3 - 8/3) = 24` 这类题在浮点下会差一点，
// 会把可解的题判成无解（或反过来）。

export const DIGIT_MIN = 1;
export const DIGIT_MAX = 9;
export const NUM_COUNT = 4;
export const TARGET = 24;
/** 难度档 0（最易）~ 4（最难），关卡每 3 关抬一档 */
export const MAX_HARDNESS = 4;

// ---------------- 精确有理数 ----------------

const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a || 1; };
const F = (n, d = 1) => { if (d < 0) { n = -n; d = -d; } const g = gcd(n, d); return { n: n / g, d: d / g }; };
const add = (a, b) => F(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a, b) => F(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a, b) => F(a.n * b.n, a.d * b.d);
const div = (a, b) => (b.n === 0 ? null : F(a.n * b.d, a.d * b.n));
const isInt = f => f.d === 1;
const isTarget = f => f.n === TARGET * f.d;
/** 分数转显示串（能整除就显示整数） */
export const fracText = f => (isInt(f) ? String(f.n) : `${f.n}/${f.d}`);

// ---------------- 表达式树与渲染 ----------------

const PREC = { '+': 1, '-': 1, '×': 2, '÷': 2 };

/**
 * 渲染成尽量少括号的串。
 * **判断「我要不要加括号」要看父节点的运算符，不是自己的**：
 * `a − (b + c)` 与 `a − b + c` 不等价，所以 `-` / `÷` 的**右**孩子只要同级就必须加括号。
 * （第一版看的是自己的 `op`，于是 `6 × (9 − (4 + 1))` 被渲染成 `6 × (9 - 4 + 1)` = 36 ——
 *   离线自检拿渲染出来的串重新解析求值，28 个断言当场失败。）
 */
function render(node, parentPrec = 0, wrapRight = false) {
  if (node.k === 'num') return String(node.v);
  const p = PREC[node.op];
  const left = render(node.a, p, false);
  const right = render(node.b, p, node.op === '-' || node.op === '÷');
  const need = p < parentPrec || (p === parentPrec && wrapRight);
  const s = `${left} ${node.op} ${right}`;
  return need ? `(${s})` : s;
}

/** 树求值（带值，分数精确） */
function evalNode(node) {
  if (node.k === 'num') return F(node.v);
  const a = evalNode(node.a), b = evalNode(node.b);
  if (node.op === '+') return add(a, b);
  if (node.op === '-') return sub(a, b);
  if (node.op === '×') return mul(a, b);
  return div(a, b);
}

// ---------------- 求解器 ----------------

/**
 * 枚举所有解。
 * @returns {{expr: string, usesFraction: boolean}[]} 按表达式长度升序（越短越好读）
 */
export function solveAll(nums) {
  const seen = new Map();
  const rec = items => {
    if (items.length === 1) {
      const it = items[0];
      if (isTarget(it.f)) {
        const expr = render(it.node);
        if (!seen.has(expr)) seen.set(expr, { expr, usesFraction: it.usesFraction, len: expr.length });
      }
      return;
    }
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const A = items[i], B = items[j];
        const rest = items.filter((_, k) => k !== i && k !== j);
        const combos = [
          ['+', add(A.f, B.f), A.node, B.node],
          ['×', mul(A.f, B.f), A.node, B.node],
          ['-', sub(A.f, B.f), A.node, B.node],
          ['-', sub(B.f, A.f), B.node, A.node],
          ['÷', div(A.f, B.f), A.node, B.node],
          ['÷', div(B.f, A.f), B.node, A.node],
        ];
        for (const [op, f, an, bn] of combos) {
          if (!f) continue;
          const fl = A.usesFraction || B.usesFraction || !isInt(f);
          rec([...rest, { f, usesFraction: fl, node: { k: 'op', op, a: an, b: bn } }]);
        }
      }
    }
  };
  rec(nums.map(n => ({ f: F(n), usesFraction: false, node: { k: 'num', v: n } })));
  return [...seen.values()].sort((a, b) => a.len - b.len);
}

/**
 * 难度档 0~4：解越少越难；所有解都必须用分数（中间出现非整数）再 +1。
 * 只是启发式，但足以让「关卡越高越难」可测。
 */
export function hardness(sols) {
  const s = sols.length;
  let h = s >= 20 ? 0 : s >= 8 ? 1 : s >= 3 ? 2 : 3;
  if (s && sols.every(x => x.usesFraction)) h = Math.min(MAX_HARDNESS, h + 1);
  return h;
}

/**
 * 该关要求的难度档（**趋势向上，不是逐关递增**）。
 * 用户要求「难度不一定一直增加，有上升的趋势即可」：先按关卡算一条连续的水平线，
 * 再在它附近随机取整 —— 多数落在 ±1 档内，于是相邻几关会有起伏，整体仍然往上走。
 * 第 1 关固定 0 档（最简单），保证「点新游戏从简单的题开始」。
 */
export function targetHardness(level, rand = Math.random) {
  const lv = Math.max(1, level);
  if (lv <= 1) return 0;
  const base = Math.min(MAX_HARDNESS, (lv - 1) / 4);      // 每 4 关抬一档左右
  const roll = rand();
  const jitter = roll < 0.30 ? -1 : roll < 0.45 ? 1 : 0;  // 30% 更简单、15% 更难、其余贴着水平线
  return Math.max(0, Math.min(MAX_HARDNESS, Math.round(base + jitter)));
}

/**
 * 难度评分 **1~100**：完全按这道题的实际情况算 —— 加难度的加分、一眼能看出来的减分，最后截断。
 *
 * | 项 | 取值 | 理由 |
 * | --- | --- | --- |
 * | 基础分 | 30 | |
 * | 解的个数 | 0~40（越多解越低） | 不同**算式**的个数，重复数字的题会把排列折叠掉，所以它单独用不可靠 |
 * | 必须用分数 | 0 / 8 / 20 | 所有解都要经过非整数最烦人，`8 ÷ (3 − 8/3)` 那种 |
 * | 每个解都要除法 | 0 / 12 | 一条不用除法就不加 |
 * | 数字互不相同 | +8 / +3 / −6 / −14 | 四个都一样最省事，四个都不同最难凑 |
 * | 纯加减就能成 | −25 | 一眼就看出来 |
 * | 只有一次乘除 | −8 | 也很直白 |
 * | 数字里有 1 | −8 | ×1 / ÷1 的凑法太多 |
 *
 * 例：`3 3 8 8`（唯一解 + 必须分数 + 必须除法）≈ 96；`6 6 6 6`（纯加减即可 + 四个一样）≈ 17。
 * **减分项是故意做重的**：第一次实现只把「纯加减」扣 10 分，于是 `6 6 6 6` 拿到 40 分 ——
 * 重复数字会把「不同算式数」压得很低，看起来像难题，实际一眼就会。
 */
export function scorePuzzle(nums, sols = solveAll(nums)) {
  if (!sols.length) return 1;                       // 无解不该出现，真出现给最低分
  const s = sols.length;
  const solPts = s >= 30 ? 0 : s >= 20 ? 5 : s >= 10 ? 10 : s >= 5 ? 18 : s >= 3 ? 26 : s === 2 ? 34 : 40;
  const fracPts = sols.every(x => x.usesFraction) ? 20 : sols.some(x => x.usesFraction) ? 8 : 0;
  const divPts = sols.every(x => x.expr.includes('÷')) ? 12 : 0;
  const distinct = new Set(nums).size;
  const disPts = distinct === 4 ? 8 : distinct === 3 ? 3 : distinct === 2 ? -6 : -14;
  const plain = sols.some(x => !/[×÷()]/.test(x.expr));                        // 纯加减就能成
  const fewOps = sols.some(x => (x.expr.match(/[×÷]/g) || []).length <= 1);    // 只用一次乘除
  const hasOne = nums.includes(1);
  const raw = 30 + solPts + fracPts + divPts + disPts
    - (plain ? 25 : 0) - (fewOps ? 8 : 0) - (hasOne ? 8 : 0);
  return Math.max(1, Math.min(100, Math.round(raw)));
}

/**
 * 生成一道题：**保证有解**，并按关卡挑难度（找不到就逐步放宽，最后兜底只要有解）。
 * @returns {{nums:number[], answer:string, answerCount:number, hardness:number}}
 */
/** 是不是「同一道题」的判据：数字相同、**顺序不同也算同一题**（排序后比较） */
export const numsKey = nums => nums.slice().sort((a, b) => a - b).join(',');

export function newPuzzle(level = 1, rand = Math.random, prev = null) {
  const want = targetHardness(level, rand);
  // prev 既可以是「上一题的四个数字」，也可以是**一组**近期题目（同一连胜内最近 10 题）——
  // 用户要求：一次连胜里最近 10 道题不能一模一样（数字一样、顺序不同也算一样）。
  const recent = (Array.isArray(prev) && Array.isArray(prev[0])) ? prev : (prev ? [prev] : []);
  const banned = new Set(recent.map(numsKey));
  const pick = () => Array.from({ length: NUM_COUNT }, () => DIGIT_MIN + Math.floor(rand() * (DIGIT_MAX - DIGIT_MIN + 1)));
  const pack = (nums, sols) => ({
    nums, answer: sols[0].expr, answerCount: sols.length, hardness: hardness(sols),
    score: scorePuzzle(nums, sols),
  });
  for (let attempt = 0; attempt < 600; attempt++) {
    const nums = pick();
    if (banned.has(numsKey(nums))) continue;                      // 别和近 10 题里任何一题一样
    const sols = solveAll(nums);
    if (!sols.length) continue;
    const need = attempt < 300 ? want : Math.max(0, want - 1);    // 实在挑不到就放宽一档
    const h = hardness(sols);
    if (h < need) continue;
    // **也要挡住比目标难太多的题**：原来只有下界，于是 want=0 时第 1 关照样会发出 4 档的难题
    //（用户报的「点新游戏不是从简单的题开始」）。前 300 次严格贴合，之后才放宽一档。
    if (attempt < 300 && h > need) continue;
    if (attempt >= 300 && h > need + 1) continue;
    return pack(nums, sols);
  }
  // 第二段：**放宽难度，但仍然不重复近期题目**（去重是用户明确要求，优先级高于难度贴合）。
  // 495 种数字组合里只排除近 10 种，随机试几次就能撞到，这一段基本用不上。
  for (let attempt = 0; attempt < 400; attempt++) {
    const nums = pick();
    if (banned.has(numsKey(nums))) continue;
    const sols = solveAll(nums);
    if (sols.length) return pack(nums, sols);
  }
  // 最后才彻底兜底：只要求有解。理论上随机牌组里可解的占多数（1~9 四张约有 78%），
  // 但不写死循环 —— 试够次数就直接用一道**已知可解**的固定牌组（6 6 6 6 → 6×6−6−6）。
  for (let attempt = 0; attempt < 200; attempt++) {
    const nums = pick();
    const sols = solveAll(nums);
    if (sols.length) return pack(nums, sols);
  }
  const safe = solveAll(FALLBACK_NUMS);
  return pack(FALLBACK_NUMS.slice(), safe);
}

/** 生成器的最后兜底牌组：一定凑得出 24（6 × 6 − 6 − 6） */
export const FALLBACK_NUMS = [6, 6, 6, 6];

// ---------------- 玩家拼的算式（token 序列） ----------------

// token: {t:'num', i, v} | {t:'op', op} | {t:'lp'} | {t:'rp'}
export const openCount = tokens => tokens.reduce((a, t) => a + (t.t === 'lp' ? 1 : t.t === 'rp' ? -1 : 0), 0);
export const usedIndexes = tokens => tokens.filter(t => t.t === 'num').map(t => t.i);
const expectValue = tokens => {
  const last = tokens[tokens.length - 1];
  return !last || last.t === 'op' || last.t === 'lp';
};
const valueEnd = tokens => {
  const last = tokens[tokens.length - 1];
  return !!last && (last.t === 'num' || last.t === 'rp');
};

/**
 * 这个 token 现在能不能加？—— 界面据此置灰。
 * 规则：数字只在「该出现值」时加、且没用过；运算符只在值之后加；
 * 左括号只在「该出现值」时加（最多 3 层）；右括号只在值之后加、且必须还有未闭合的左括号。
 */
export function appendable(tokens, tok) {
  if (tok.t === 'num') return expectValue(tokens) && !usedIndexes(tokens).includes(tok.i);
  if (tok.t === 'op') return valueEnd(tokens);
  if (tok.t === 'lp') return expectValue(tokens) && openCount(tokens) < 3;
  if (tok.t === 'rp') return valueEnd(tokens) && openCount(tokens) > 0;
  return false;
}

/** 算式是否语法完整（括号配平、以值结尾） */
export const isComplete = tokens => tokens.length > 0 && valueEnd(tokens) && openCount(tokens) === 0;

/**
 * 用递归下降解析 token 序列并精确求值。
 * @returns {{ok:boolean, value?:string, is24?:boolean, error?:string}}
 */
export function evalTokens(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const parseExpr = () => {
    let left = parseTerm();
    if (left === null) return null;
    for (;;) {
      const t = peek();
      if (!t || t.t !== 'op' || (t.op !== '+' && t.op !== '-')) break;
      pos++;
      const right = parseTerm();
      if (right === null) return null;
      left = t.op === '+' ? add(left, right) : sub(left, right);
    }
    return left;
  };
  const parseTerm = () => {
    let left = parseFactor();
    if (left === null) return null;
    for (;;) {
      const t = peek();
      if (!t || t.t !== 'op' || (t.op !== '×' && t.op !== '÷')) break;
      pos++;
      const right = parseFactor();
      if (right === null) return null;
      const v = t.op === '×' ? mul(left, right) : div(left, right);
      if (!v) return null;
      left = v;
    }
    return left;
  };
  const parseFactor = () => {
    const t = peek();
    if (!t) return null;
    if (t.t === 'num') { pos++; return F(t.v); }
    if (t.t === 'lp') {
      pos++;
      const inner = parseExpr();
      const close = peek();
      if (inner === null || !close || close.t !== 'rp') return null;
      pos++;
      return inner;
    }
    return null;
  };
  if (!isComplete(tokens)) return { ok: false, error: 'incomplete' };
  const v = parseExpr();
  if (v === null || pos !== tokens.length) return { ok: false, error: 'syntax' };
  return { ok: true, value: fracText(v), is24: isTarget(v) };
}

// ---------------- 答案串 → token（离线自检用：确认渲染出来的答案真的等于 24） ----------------

/** 把 `(3 + 3) × (5 - 1)` 这类串解析成 token（只支持 × ÷ + - 与括号、整数） */
export function parseExprText(text) {
  const tokens = [];
  for (const raw of String(text).split(/\s+/)) {
    const s = raw.replace(/−/g, '-').replace(/([()+×÷-])/g, ' $1 ').trim();   // 排版用的 − 也认
    for (const piece of (s ? s.split(/\s+/) : [])) {
      if (piece === '(') tokens.push({ t: 'lp' });
      else if (piece === ')') tokens.push({ t: 'rp' });
      else if ('+-×÷'.includes(piece) && piece.length === 1) tokens.push({ t: 'op', op: piece });
      else if (/^\d+$/.test(piece)) tokens.push({ t: 'num', i: -1, v: Number(piece) });
      else return null;
    }
  }
  return tokens;
}

/** 校验一个答案串：语法可用、只用了给定的数字、结果恰好 24 */
export function verifyAnswer(text, nums) {
  const tokens = parseExprText(text);
  if (!tokens) return { ok: false, error: 'parse' };
  const pool = [...nums];
  for (const t of tokens) {
    if (t.t !== 'num') continue;
    const at = pool.indexOf(t.v);
    if (at < 0) return { ok: false, error: 'number-mismatch' };
    pool.splice(at, 1);
  }
  if (pool.length) return { ok: false, error: 'number-mismatch' };
  const r = evalTokens(tokens);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: !!r.is24, value: r.value, error: r.is24 ? undefined : 'not-24' };
}
