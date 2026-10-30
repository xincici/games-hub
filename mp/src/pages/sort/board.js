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
// 难度由每种水果的张数 C 与水果种类 K 共同决定，两者交错爬升，每 2~4 关就有
// 一步提升，第 30 关到顶（C=8、K=6：每种 8 张、共 48 张）之后关数继续增长但
// 难度不再上升。求解器给出的严格解步数实测约 8 → 53 步，爬升比较线性。
//
// 两套玩法（mode）共用同一条曲线，区别只在空槽与槽容量：
//   mode = 1「经典」：K 个槽每种刚好装满 C 张，另外预留 2 个完全空的槽，
//                     槽容量 = C
//   mode = 2「紧凑」：只预留 1 个完全空的槽，但每个槽都空出最上面一格当
//                     腾挪空间（开局装 C 张、还能再放 1 张），槽容量 = C + 1
// 两种玩法的可腾挪格数接近（经典 2C；紧凑 K + C + 1），但结构完全不同：
// 经典是两根空管，紧凑是每根管子各留一格 + 一根空管。
export const MAX_LEVEL = 30;
export const MODES = [1, 2];

// [每种水果张数 C, 水果种类 K, 该档持续到第几关]
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

export function levelConfig(level, mode = 1) {
  const lv = Math.max(1, Math.floor(level) || 1);
  const m = mode === 2 ? 2 : 1;
  const [copies, kinds] = STEPS.find(step => lv <= step[2]) || STEPS[STEPS.length - 1];
  const compact = m === 2;                       // 紧凑：1 个空槽 + 每槽顶部留一格
  const empties = compact ? 1 : 2;
  const capacity = copies + (compact ? 1 : 0);   // 槽容量（单槽最多装几张）
  return {
    level: lv,
    mode: m,
    copies,                                      // 每种水果的张数
    kinds,
    empties,
    capacity,
    slots: kinds + empties,
    total: kinds * copies,
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
// 该槽已归位：正好装了这种水果的全部 copies 张，且都是同一种（空槽不算）
export function isComplete(slot, copies) {
  const items = Array.isArray(slot) ? slot : slot.items;
  if (items.length !== copies) return false;
  return items.every(item => kindOf(item) === kindOf(items[0]));
}

// 统计条上的「已归位」：归位 + 底下没有扣着的牌（和过关条件同一把尺子）
export function countDone(slots, copies) {
  return slots.reduce((n, slot) => {
    const hidden = Array.isArray(slot) ? 0 : slot.hidden || 0;
    return n + (hidden === 0 && isComplete(slot, copies) ? 1 : 0);
  }, 0);
}

const allSame = items => !items.length || items.every(item => kindOf(item) === kindOf(items[0]));

// 过关：所有水果都翻成正面 + 每个非空槽只装同一种 + 非空槽数正好等于水果种类数。
// 最后一条是必须的：同一种水果被拆到两个槽时（比如 [🍎🍎] 与 [🍎]）两个槽各自
// 都只装一种水果，但并没有归位；每种水果的张数固定为 copies，所以「K 个非空槽
// 且每槽同种」正好等价于「每种水果都聚在同一个槽里」
export function isWon(slots, copies, kinds) {
  let filled = 0;
  for (const slot of slots) {
    const items = Array.isArray(slot) ? slot : slot.items;
    if (!items.length) continue;
    filled++;
    const hidden = Array.isArray(slot) ? 0 : slot.hidden || 0;
    if (hidden !== 0 || !allSame(items)) return false;
  }
  return filled === kinds;
}

export function hasHiddenCards(slots) {
  return slots.some(slot => !Array.isArray(slot) && (slot.hidden || 0) > 0);
}

// 有没有一步能翻开新的暗牌：得把某个槽口「可见的那一整排」一次搬空，
// 搬空后紧挨着下面的那张扣着的牌才会翻过来。搬不完全排（目标装不下）
// 时下面那张不会翻，所以那种搬运不算
export function canReveal(slots, capacity) {
  for (let from = 0; from < slots.length; from++) {
    const slot = slots[from];
    const items = Array.isArray(slot) ? slot : slot.items;
    const hidden = Array.isArray(slot) ? 0 : slot.hidden || 0;
    if (!hidden) continue;                       // 这个槽没有扣着的牌，翻了也没新牌
    const run = topRun(slot);
    if (!run || items.length <= run) continue;   // 空槽 / 整摞都可见
    if (hidden <= items.length - run - 1) continue;  // 排下面那张本来就是正面
    for (let to = 0; to < slots.length; to++) {
      if (to === from) continue;
      if (moveCount(slots, from, to, capacity) === run) return true;
    }
  }
  return false;
}

// ---------- 玩家视角的搜索（失败判定用）----------
// 状态 = 「每槽的种类序列 + 底部扣着几张」，走法就是玩家点两下真能做的搬运
// （槽口可见的那一串，目标装不下就只搬放得下的），搬走后源槽新露出的那张翻面。
// 一套通用的深度优先搜索，命中 goal 就返回 'found'，走遍可达状态都没有返回
// 'exhausted'，预算用尽返回 'unknown'（调用方一律按「没死局」处理，宁可不判）
function stateKeyOf(slots) {
  return slots.map(s => s.items.join(',') + '#' + s.hidden).join('|');
}

function toPlayerState(slots) {
  return slots.map(slot => ({
    items: (Array.isArray(slot) ? slot : slot.items).map(kindOf),
    hidden: Array.isArray(slot) ? 0 : Math.max(0, slot.hidden || 0),
  }));
}

function visibleCount(slots) {
  return slots.reduce((n, s) => n + s.items.length - s.hidden, 0);
}

function applyPlayerMove(slots, mv) {
  const next = slots.map(s => ({ items: s.items.slice(), hidden: s.hidden }));
  next[mv.to].items.push(...next[mv.from].items.splice(next[mv.from].items.length - mv.count, mv.count));
  const len = next[mv.from].items.length;
  next[mv.from].hidden = len ? Math.min(next[mv.from].hidden, len - 1) : 0;
  return next;
}

function searchPlayerStates(start, cfg, budget, goal) {
  if (goal(start)) return 'found';
  const seen = new Set();
  const stack = [start];
  let nodes = 0;
  while (stack.length) {
    if (nodes++ > budget) return 'unknown';
    const st = stack.pop();
    const key = stateKeyOf(st);
    if (seen.has(key)) continue;
    seen.add(key);
    for (const mv of playerMoves(st, cfg.capacity, cfg.copies)) {
      const next = applyPlayerMove(st, mv);
      if (goal(next)) return 'found';
      stack.push(next);
    }
  }
  return 'exhausted';
}

// 玩家能做的走法：每个合法目标一条，张数由规则定死（min(可见连排, 目标空位)）。
// 启发式排序只影响搜索快慢，不影响结论
function playerMoves(slots, capacity, copies) {
  const out = [];
  for (let from = 0; from < slots.length; from++) {
    const a = slots[from];
    if (!a.items.length) continue;
    const run = topRun(a);
    const kind = a.items[a.items.length - 1];
    const uniform = run === a.items.length;
    if (uniform && a.items.length === copies) continue;   // 已归位的槽不用动
    for (let to = 0; to < slots.length; to++) {
      if (to === from) continue;
      const b = slots[to];
      const space = capacity - b.items.length;
      if (space <= 0) continue;
      if (b.items.length && b.items[b.items.length - 1] !== kind) continue;
      const count = Math.min(run, space);
      if (!count) continue;
      let score = 0;
      if (b.items.length && b.items.length + count === copies) score += 4;     // 目标正好凑齐一种
      if (a.items.length - count === 0) score += 3;                            // 把源槽清空
      if (count === run && a.hidden > 0 && a.items.length > run) score += 2;    // 能翻开新牌
      if (!b.items.length) score += 1;                                         // 用上空槽
      out.push({ from, to, count, score });
    }
  }
  out.sort((x, y) => y.score - x.score);
  return out;
}

// 还能不能「再翻开新的牌」：从当前局面出发，有没有任何一条走法序列能让翻开的
// 牌变多。翻开是单调的（只会变多不会变少），所以一旦再也翻不开新的，
// 「全部翻面」就永远凑不齐 —— 这才是可以判负的充分条件
export function canRevealMore(slots, cfg, budget = 20000) {
  const start = toPlayerState(slots);
  const base = visibleCount(start);
  const r = searchPlayerStates(start, cfg, budget, st => visibleCount(st) > base);
  return r === 'found' ? true : r === 'exhausted' ? false : null;
}

// 牌全翻开之后还能不能赢（这时玩家能做的走法和状态都完全可见，搜索是准的）
export function canStillWin(slots, cfg, budget = 20000) {
  const start = toPlayerState(slots);
  const r = searchPlayerStates(start, cfg, budget, st => isWon(st, cfg.copies, cfg.kinds));
  return r === 'found' ? true : r === 'exhausted' ? false : null;
}

// 失败判定（两个分支都是「一定赢不了」的充分条件，不会误判）：
// ① 还有牌扣着，却再也翻不开新的 —— 「全部翻面」凑不齐，必输。
//    注意判据是「以后也翻不开」而不是「这一步翻不开」：先搬走半排让槽口那一串
//    变短，下一步就可能翻开，所以这里跑的是可达状态搜索
// ② 牌全翻开之后已经排不出来 —— 同样必输（这时玩家能做的走法和状态完全一致，
//    搜索的结论是准的）
export function isDeadEnd(slots, cfg, budget = 20000) {
  if (hasHiddenCards(slots)) return canRevealMore(slots, cfg, budget) === false;
  return canStillWin(slots, cfg, budget) === false;
}

// 本关进度：已归位的槽里翻成正面的水果数 / 全部水果数。
// 整槽同种但底下还扣着的只算露出来的那几张，所以进度条到 100% 必然
// 同时满足「都翻面」和「同种归位」两个过关条件
export function progressPct(slots, copies) {
  let done = 0;
  let total = 0;
  slots.forEach(slot => {
    const items = Array.isArray(slot) ? slot : slot.items;
    const hidden = Array.isArray(slot) ? 0 : slot.hidden || 0;
    total += items.length;
    if (isComplete(slot, copies)) done += Math.max(0, items.length - hidden);
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

// 求解器的终局判定：每个非空槽只装一种 + 非空槽数等于种类数（不看正反面，
// 隐藏牌不影响可解性，见文件头）
export function isSolvedKinds(slots, copies, kinds) {
  let filled = 0;
  for (const slot of slots) {
    if (!slot.length) continue;
    filled++;
    if (slot.length > copies || !slot.every(k => k === slot[0])) return false;
  }
  return filled === kinds;
}

// 候选走法：只考虑「一次搬到搬不动为止」（和玩家点一下的搬运量完全一致）。
// 剪枝：已归位的槽不动；整槽同种搬进空槽是纯搬家；多个空槽互为等价，只用第一个
function candidateMoves(slots, capacity, copies) {
  const out = [];
  for (let from = 0; from < slots.length; from++) {
    const a = slots[from];
    if (!a.length) continue;
    const run = runLen(a);
    const kind = a[a.length - 1];
    const uniform = run === a.length;
    if (uniform && a.length === copies) continue;
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

// 是否有解：带访问集的深度优先搜索（预算用尽返回 null 表示「没算出来」）。
// plain 是待判定的盘面（每槽一个种类数组），cfg 提供 capacity / copies / kinds
export function hasSolution(plain, cfg, budget = 40000) {
  const { capacity, copies, kinds } = cfg;
  const start = plain.map(kindsOf);
  if (isSolvedKinds(start, copies, kinds)) return true;
  const seen = new Set();
  const stack = [start];
  let nodes = 0;
  while (stack.length) {
    if (nodes++ > budget) return null;
    const st = stack.pop();
    const key = stateKey(st);
    if (seen.has(key)) continue;
    seen.add(key);
    for (const mv of candidateMoves(st, capacity, copies)) {
      const next = st.map(slot => slot.slice());
      next[mv.to].push(...next[mv.from].splice(next[mv.from].length - mv.count, mv.count));
      if (isSolvedKinds(next, copies, kinds)) return true;
      stack.push(next);
    }
  }
  return false;
}

// 发牌：每种水果 copies 张，洗匀后按 copies 张一槽铺开，空槽留空
function dealShuffled(cfg, rand) {
  const pool = [];
  for (let kind = 0; kind < cfg.kinds; kind++) {
    for (let i = 0; i < cfg.copies; i++) pool.push(kind);
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = ~~(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return layout(pool, cfg);
}

// 摆槽：各种类占中间，空槽分到两侧 —— 两个空槽时左右各一个（经典玩法），
// 一个空槽时留在最右侧（紧凑玩法）。空槽在规则里完全等价，这里只管观感
function layout(pool, cfg) {
  const left = cfg.empties >= 2 ? 1 : 0;
  const slots = [];
  for (let i = 0; i < left; i++) slots.push([]);
  for (let i = 0; i < cfg.kinds; i++) slots.push(pool.slice(i * cfg.copies, (i + 1) * cfg.copies));
  for (let i = left; i < cfg.empties; i++) slots.push([]);
  return slots;
}

// 关卡发牌：随机洗牌 + 求解器验证，保证发出来的局面一定能过（含翻面要求，
// 见文件头的说明）。每槽只留槽口一张正面朝上，下面全部扣着。
// 返回 { items, hidden } 形态的盘面（items 是种类序号，组件再包成水果对象）
export function generateSolvable(cfg, rand = Math.random, budget = 40000) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const plain = dealShuffled(cfg, rand);
    // 已经整整齐齐（洗完还是每槽同种）的局面对玩家没意义，重洗
    if (isSolvedKinds(plain, cfg.copies, cfg.kinds)) continue;
    if (hasSolution(plain, cfg, budget)) return wrap(plain, cfg.capacity);
  }
  // 兜底：每槽同种（必能过关，只是要先自己把牌翻出来）
  const pool = [];
  for (let kind = 0; kind < cfg.kinds; kind++) {
    for (let i = 0; i < cfg.copies; i++) pool.push(kind);
  }
  return wrap(layout(pool, cfg), cfg.capacity);
}

function wrap(plain, capacity) {
  return plain.map(kinds => ({
    items: kinds.slice(),
    // 开局只有槽口那张是正面，其余全扣着
    hidden: kinds.length ? Math.min(kinds.length - 1, capacity - 1) : 0,
  }));
}
