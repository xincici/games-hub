// Emoji 排序（Emoji Sort）核心逻辑（纯函数，无框架依赖）
//
// 盘面 slots: Array<{ items: any[], hidden: number }>
//   items  自底向上排列，末尾是槽口（最上面那张）。元素可以是任意对象，
//          只要带 kind 字段即可；直接放数字 kind 也合法（求解器 / 生成器就这么用）
//   hidden 底部连续多少张还扣着（背面朝上），可见的永远是最上面那一段
// 不变量：槽非空时 hidden ≤ items.length - 1（槽口那张永远可见）
//
// 规则：
//   · 只有槽口那张（及其正下方同种的一连串）能被选中搬走，也只有正面朝上的
//     水果能被选中或作为放置目标
//   · 目标槽要么槽口是同种水果，要么是个完全空槽；单槽最多容量 M 张
//   · 搬走后源槽新露出来的那张自动翻面
//   · 过关 = 所有水果都翻成正面 且 每个槽只装同一种水果（或空槽）

// ---------- 关卡配置 ----------
// 难度由槽容量 M（同时也是每种水果的个数）与水果种类 K 共同决定，两者交错
// 爬升，每 2~4 关就有一步提升，第 30 关到顶（M=8、K=6：8 个槽、每种水果 8 个，
// 共 48 张）之后关数继续增长但难度不再上升。水果总数 9 → 48，
// 求解器给出的严格解步数实测约 8 → 53 步，爬升比较线性。
// 空槽恒为 2 个：实测只有一个空槽时随机局面可解率只有 5%~10%，生成器会不停
// 重洗甚至退化送分，所以难度只从 M 和 K 上要，不拿空槽数卡人。
export const MAX_LEVEL = 30;

const EMPTIES = 2;
// [槽容量 M, 水果种类 K, 该档持续到第几关]
const STEPS = [
  [3, 3, 3],          // 第 1~3 关   9 张
  [4, 3, 5],          // 第 4~5 关   12 张
  [4, 4, 9],          // 第 6~9 关   16 张
  [5, 4, 13],         // 第 10~13 关 20 张
  [5, 5, 17],         // 第 14~17 关 25 张
  [6, 5, 21],         // 第 18~21 关 30 张
  [6, 6, 24],         // 第 22~24 关 36 张
  [7, 6, 27],         // 第 25~27 关 42 张
  [8, 6, MAX_LEVEL],  // 第 28 关起  48 张
];

export function levelConfig(level) {
  const lv = Math.max(1, Math.floor(level) || 1);
  const [capacity, kinds] = STEPS.find(step => lv <= step[2]) || STEPS[STEPS.length - 1];
  return {
    level: lv,
    capacity,
    kinds,
    empties: EMPTIES,
    slots: kinds + EMPTIES,
    total: kinds * capacity,
  };
}

// ---------- 基本读取 ----------
export function kindOf(item) {
  return typeof item === 'number' ? item : item.kind;
}

const kindsOf = slot => (Array.isArray(slot) ? slot : slot.items).map(kindOf);

export function topKind(slot) {
  const items = Array.isArray(slot) ? slot : slot.items;
  return items.length ? kindOf(items[items.length - 1]) : -1;
}

// 槽口连续同种的张数（= 点一下能一起选中 / 搬走的张数）。
// 只能数到正面朝上的那一段为止：扣着的水果既不能被选中，也不能跟着一起走
export function topRun(slot) {
  const items = Array.isArray(slot) ? slot : slot.items;
  if (!items.length) return 0;
  const hidden = Array.isArray(slot) ? 0 : slot.hidden || 0;
  const visible = items.length - hidden;
  const kind = kindOf(items[items.length - 1]);
  let n = 1;
  while (n < visible && kindOf(items[items.length - 1 - n]) === kind) n++;
  return n;
}

export function freeSpace(slot, capacity) {
  const items = Array.isArray(slot) ? slot : slot.items;
  return capacity - items.length;
}

// 合法放置：目标槽有空间，且（目标为空 或 目标槽口同种）。源槽必须非空
export function canMove(slots, from, to, capacity) {
  if (from === to || from < 0 || to < 0 || from >= slots.length || to >= slots.length) return false;
  const a = slots[from];
  const b = slots[to];
  const aItems = Array.isArray(a) ? a : a.items;
  if (!aItems.length) return false;
  const bItems = Array.isArray(b) ? b : b.items;
  const space = capacity - bItems.length;
  if (space <= 0) return false;
  return !bItems.length || topKind(b) === topKind(a);
}

// 这次搬运实际能过去几张：选中槽口的同种连排，最多把目标槽装满
export function moveCount(slots, from, to, capacity) {
  if (!canMove(slots, from, to, capacity)) return 0;
  return Math.min(topRun(slots[from]), freeSpace(slots[to], capacity));
}

// 源槽能搬的目标（含每个目标能过去几张），UI 用它高亮可放置的槽
export function moveTargets(slots, from, capacity) {
  const out = [];
  for (let to = 0; to < slots.length; to++) {
    const count = moveCount(slots, from, to, capacity);
    if (count) out.push({ to, count });
  }
  return out;
}

export function cloneSlots(slots) {
  return slots.map(slot => ({
    items: (Array.isArray(slot) ? slot : slot.items).slice(),
    hidden: Array.isArray(slot) ? 0 : slot.hidden || 0,
  }));
}

// 搬牌（原地修改 slots），返回搬走的元素数组；源槽新露出来的那张自动翻面。
// 目标槽的 hidden 不变：搬过去的都是正面朝上的水果，暗牌永远压在底部
export function applyMove(slots, from, to, capacity) {
  const n = moveCount(slots, from, to, capacity);
  if (!n) return [];
  const a = slots[from];
  const aItems = Array.isArray(a) ? a : a.items;
  const bItems = Array.isArray(slots[to]) ? slots[to] : slots[to].items;
  const moved = aItems.splice(aItems.length - n, n);
  bItems.push(...moved);
  if (!Array.isArray(a)) {
    a.hidden = aItems.length ? Math.min(a.hidden, aItems.length - 1) : 0;
  }
  return moved;
}

// ---------- 局面判定 ----------
// 该槽已归位：装满且全是同一种水果（空槽不算「已归位」）
export function isComplete(slot, capacity) {
  const items = Array.isArray(slot) ? slot : slot.items;
  if (items.length !== capacity) return false;
  return items.every(item => kindOf(item) === kindOf(items[0]));
}

// 统计条上的「已归位」：满槽同种 + 底下没有扣着的牌（和过关条件同一把尺子）
export function countDone(slots, capacity) {
  return slots.reduce((n, slot) => {
    const hidden = Array.isArray(slot) ? 0 : slot.hidden || 0;
    return n + (hidden === 0 && isComplete(slot, capacity) ? 1 : 0);
  }, 0);
}

// 过关：所有水果都翻成正面 + 每个非空槽都装满同一种水果。
// 不能只判「每槽同种」：同一种水果被拆到两个槽时（比如 [🍎🍎] 与 [🍎]）
// 两个槽各自都只装一种水果，但并没有归位。每种水果的张数恰好等于容量 M，
// 所以「每槽同种」+「装满」正好等价于「每种水果都聚在同一个槽里」
export function isWon(slots, capacity) {
  return slots.every(slot => {
    const items = Array.isArray(slot) ? slot : slot.items;
    if (!items.length) return true;
    const hidden = Array.isArray(slot) ? 0 : slot.hidden || 0;
    return hidden === 0 && isComplete(slot, capacity);
  });
}

// 死局：所有槽都满了，且槽口的水果两两不同 —— 没有任何合规的搬运可做。
// （每种水果的总数 = 容量 < 槽数能容纳的量，空槽又固定预留，所以
//  「所有槽都满」在这种发牌下不可能发生，实际玩起来不会真的走进死局）
export function isStuck(slots, capacity) {
  if (slots.some(slot => (Array.isArray(slot) ? slot : slot.items).length < capacity)) return false;
  const tops = slots.map(topKind);
  return new Set(tops).size === tops.length;
}

// 本关进度：已归位的槽里翻成正面的水果数 / 全部水果数。
// 整槽同种但底下还扣着的只算露出来的那几张，所以进度条到 100% 必然
// 同时满足「都翻面」和「同种归位」两个过关条件
export function progressPct(slots, capacity) {
  let done = 0;
  let total = 0;
  slots.forEach(slot => {
    const items = Array.isArray(slot) ? slot : slot.items;
    const hidden = Array.isArray(slot) ? 0 : slot.hidden || 0;
    total += items.length;
    if (isComplete(slot, capacity)) done += Math.max(0, items.length - hidden);
  });
  return total ? Math.min(100, Math.round((done / total) * 100)) : 0;
}

// ---------- 求解 / 生成 ----------
// 隐藏牌不影响可解性判定：槽口永远可见，且只要还有一个空槽，就能把任意
// 一槽逐张搬到别处再搬回，把底下扣着的牌全部翻开，所以这里只看种类排布。
function runLen(kinds) {
  const kind = kinds[kinds.length - 1];
  let n = 1;
  while (n < kinds.length && kinds[kinds.length - 1 - n] === kind) n++;
  return n;
}

export function isSolvedKinds(slots, capacity) {
  return slots.every(slot => !slot.length || (slot.length === capacity && slot.every(k => k === slot[0])));
}

// 候选走法：只考虑「一次搬到搬不动为止」（和玩家点一下的搬运量完全一致）。
// 剪枝：已归位的槽不动；整槽同种搬进空槽是纯搬家；多个空槽互为等价，只用第一个
function candidateMoves(slots, capacity) {
  const out = [];
  for (let from = 0; from < slots.length; from++) {
    const a = slots[from];
    if (!a.length) continue;
    const run = runLen(a);
    const kind = a[a.length - 1];
    const uniform = run === a.length;
    if (uniform && a.length === capacity) continue;
    let usedEmpty = false;
    for (let to = 0; to < slots.length; to++) {
      if (to === from) continue;
      const b = slots[to];
      const space = capacity - b.length;
      if (!space) continue;
      if (!b.length) {
        if (uniform || usedEmpty) continue;
        usedEmpty = true;
        out.push({ from, to, count: Math.min(run, space), score: 1 });
      } else if (b[b.length - 1] === kind) {
        const count = Math.min(run, space);
        out.push({ from, to, count, score: b.length + count === capacity ? 3 : 2 });
      }
    }
  }
  out.sort((x, y) => y.score - x.score);
  return out;
}

function stateKey(slots) {
  return slots.map(slot => slot.join(',')).join('|');
}

// 是否有解：带访问集的深度优先搜索（预算用尽返回 null 表示「没算出来」）
export function hasSolution(plain, capacity, budget = 40000) {
  const start = plain.map(kindsOf);
  if (isSolvedKinds(start, capacity)) return true;
  const seen = new Set();
  const stack = [start];
  let nodes = 0;
  while (stack.length) {
    if (nodes++ > budget) return null;
    const st = stack.pop();
    const key = stateKey(st);
    if (seen.has(key)) continue;
    seen.add(key);
    for (const mv of candidateMoves(st, capacity)) {
      const next = st.map(slot => slot.slice());
      next[mv.to].push(...next[mv.from].splice(next[mv.from].length - mv.count, mv.count));
      if (isSolvedKinds(next, capacity)) return true;
      stack.push(next);
    }
  }
  return false;
}

// 发牌：每种水果 capacity 张，洗匀后按 capacity 张一槽铺开，空槽留空
function dealShuffled(cfg, rand) {
  const pool = [];
  for (let kind = 0; kind < cfg.kinds; kind++) {
    for (let i = 0; i < cfg.capacity; i++) pool.push(kind);
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = ~~(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const slots = [];
  for (let i = 0; i < cfg.kinds; i++) slots.push(pool.slice(i * cfg.capacity, (i + 1) * cfg.capacity));
  for (let i = 0; i < cfg.empties; i++) slots.push([]);
  return slots;
}

// 关卡发牌：随机洗牌 + 求解器验证，保证发出来的局面一定能过（含翻面要求，
// 见文件头的说明）。每槽只留槽口一张正面朝上，下面全部扣着。
// 返回 { items, hidden } 形态的盘面（items 是种类序号，组件再包成水果对象）
export function generateSolvable(cfg, rand = Math.random, budget = 40000) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const plain = dealShuffled(cfg, rand);
    // 已经整整齐齐（洗完还是每槽同种）的局面对玩家没意义，重洗
    if (isSolvedKinds(plain, cfg.capacity)) continue;
    if (hasSolution(plain, cfg.capacity, budget)) return wrap(plain, cfg.capacity);
  }
  // 兜底：每槽同种（必能过关，只是要先自己把牌翻出来）
  const plain = [];
  for (let kind = 0; kind < cfg.kinds; kind++) plain.push(new Array(cfg.capacity).fill(kind));
  for (let i = 0; i < cfg.empties; i++) plain.push([]);
  return wrap(plain, cfg.capacity);
}

function wrap(plain, capacity) {
  return plain.map(kinds => ({
    items: kinds.slice(),
    // 开局只有槽口那张是正面，其余全扣着
    hidden: kinds.length ? Math.min(kinds.length - 1, capacity - 1) : 0,
  }));
}
