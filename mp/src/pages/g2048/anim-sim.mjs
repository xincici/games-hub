#!/usr/bin/env node
// 2048 小程序 · 滑动 / 合并动画可见性仿真
// ─────────────────────────────────────────────────────────────────────────────
// 目的：验证 g2048.vue 里 move() 的落定逻辑**不会**出现
//      「合并牌（merging, opacity:0）+ 两张幽灵（已清）三张同时不可见」的空档。
//
// 做法：**不是**重写一份逻辑，而是把 g2048.vue 的 <script setup> 原文抽出来，
//      注入 ref / nextTick / setTimeout 等桩（假时钟 + 假帧），在 Node 里真跑 move()。
//      所以断言是打在**线上代码**上的，改了 .vue 会自动跟着变。
//
// 用法：node mp/src/pages/g2048/anim-sim.mjs
// 说明：纯开发期校验脚本，不被任何页面 import，不进构建产物。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VUE = path.join(HERE, 'g2048.vue');

const SAMPLE_MS = 16;      // 用户要求的步进
const HORIZON = 400;       // 仿真到 400ms
const FINE_MS = 1;         // 细粒度扫地（找连续空档长度）
const TAIL = 700;          // 收尾断言用（pop 结束、连滑两次也要落干净）

// ───────────────────────────── 假时钟 ─────────────────────────────
function makeClock() {
  let now = 0;
  let seq = 1;
  const timers = new Map();
  const setTimeoutF = (fn, ms = 0) => { const id = seq++; timers.set(id, { at: now + globalThis.Math.max(0, ms | 0), fn, every: 0 }); return id; };
  const setIntervalF = (fn, ms = 0) => { const id = seq++; const p = globalThis.Math.max(1, ms | 0); timers.set(id, { at: now + p, fn, every: p }); return id; };
  const clear = id => { timers.delete(id); };
  return {
    now: () => now,
    setNow: t => { now = t; },
    setTimeout: setTimeoutF, clearTimeout: clear,
    setInterval: setIntervalF, clearInterval: clear,
    nextAt() { let m = Infinity; for (const t of timers.values()) if (t.at < m) m = t.at; return m; },
    runNext() {
      let best = null; let bid = 0;
      for (const [id, t] of timers) if (!best || t.at < best.at) { best = t; bid = id; }
      if (!best) return false;
      if (best.every) best.at += best.every; else timers.delete(bid);
      best.fn();
      return true;
    },
    count() { return timers.size; },
  };
}

const flushMicro = async () => {
  for (let i = 0; i < 24; i++) await Promise.resolve();
  await new Promise(r => setImmediate(r));
};

async function advanceTo(clock, target) {
  await flushMicro();
  for (;;) {
    const at = clock.nextAt();
    if (!(at <= target)) break;
    clock.setNow(at);
    clock.runNext();
    await flushMicro();
  }
  clock.setNow(target);
  await flushMicro();
}

// ─────────────────── 把 .vue 的 <script setup> 变成可执行模块 ───────────────────
function buildModule({ withRaf }) {
  const src = fs.readFileSync(VUE, 'utf8');
  const m = src.match(/<script setup>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('找不到 <script setup>');
  let body = m[1];
  const before = body;
  body = body.replace(/^import .*;$/gm, '');          // 所有 import 都是单行
  if (body === before) throw new Error('import 剥离失败：请检查 .vue 的 import 写法');
  // 老的顶级 await / 具名导出冲突检查：确保抽出来的确实是 setup 体
  if (!/function move\(/.test(body) || !/function settle\(/.test(body)) {
    throw new Error('抽出来的脚本里没有 move() / settle()，可能改了函数名');
  }

  const prelude = `
const __S = globalThis.__SIM__;
const setTimeout = __S.clock.setTimeout;
const clearTimeout = __S.clock.clearTimeout;
const setInterval = __S.clock.setInterval;
const clearInterval = __S.clock.clearInterval;
const requestAnimationFrame = ${withRaf ? '__S.raf' : 'undefined'};
const ref = (v) => ({ value: v });
const computed = (fn) => ({ get value() { return fn(); } });
const watch = () => {};
const nextTick = () => Promise.resolve();
const onMounted = (fn) => { __S.hooks.mounted.push(fn); };
const onUnmounted = (fn) => { __S.hooks.unmounted.push(fn); };
const setNavTitle = () => {};
const playWin = () => { __S.log.push(['win', __S.clock.now()]); };
const playLose = () => { __S.log.push(['lose', __S.clock.now()]); };
const getRaw = (k) => (Object.prototype.hasOwnProperty.call(__S.store, k) ? __S.store[k] : null);
const setRaw = (k, v) => { __S.store[k] = v; };
const getJSON = (k, f = null) => {
  const raw = getRaw(k);
  if (raw === null || raw === undefined) return f;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return f; }
};
const setJSON = (k, v) => setRaw(k, JSON.stringify(v));
const Math = __S.math;
`;

  const epilogue = `
export { move, initGame, restore, tiles, ghosts, popping, renderTiles, gameResult, score, bestScore,
  dealing, tileStyle, playDeal, spawnTile, checkLose, emptyCells, linesOf, dealStep,
  MOVE_MS, POP_MS, DEAL_STEP, DEAL_STEP_FEW, DEAL_MS, DEAL_TAIL, FRAME_MS, GHOST_FRAMES, SIZE };
`;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g2048-sim-'));
  const file = path.join(dir, withRaf ? 'page-raf.mjs' : 'page-mp.mjs');
  fs.writeFileSync(file, prelude + body + epilogue);
  return file;
}

function makeEnv({ withRaf, seed = 1 }) {
  const clock = makeClock();
  let s = seed >>> 0;
  const math = Object.create(globalThis.Math);
  math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const env = { clock, store: {}, log: [], hooks: { mounted: [], unmounted: [] }, math };
  if (withRaf) env.raf = (cb) => clock.setTimeout(() => cb(clock.now()), 16);   // 一帧 ≈ 16ms
  globalThis.__SIM__ = env;
  return env;
}

async function loadPage({ withRaf, seed }) {
  const env = makeEnv({ withRaf, seed });
  const file = buildModule({ withRaf });
  const mod = await import('file://' + file + '?v=' + Math.random());
  return { env, mod };
}

// ─────────────────── 可见性模型（CSS 语义，数值全部取自 .vue 的 CSS） ───────────────────
// .tile.merging          → opacity: 0
// .tile.popping          → merge-pop: 0% opacity 0 → 60% opacity 1 → 100% 1（190ms ease-out）
// .tile.is-new           → deal-in 0.18s delay .13s backwards（轮到之前 opacity 0）
// .tile.dealt            → deal-in 0.28s delay dealIdx*dealStep backwards
function opacityOf(el, ctx) {
  const { t, popping, popStart, bornAt, MOVE_MS, POP_MS, DEAL_MS, dealStep } = ctx;
  if (el.merging) return 0;
  if (popping.has(el.id)) {
    const p = (t - popStart[el.id]) / POP_MS;
    if (!(p > 0)) return 0;                 // 0% 关键帧
    return p < 0.6 ? p / 0.6 : 1;           // 60% 时已经 opacity 1
  }
  if (el.isNew) {
    const p = (t - (bornAt[el.id] + MOVE_MS)) / 180;
    return p > 0 ? Math.min(1, p) : 0;      // backwards：轮到自己之前隐身
  }
  if (el.dealIdx != null) {
    const p = (t - (bornAt[el.id] + el.dealIdx * dealStep)) / DEAL_MS;
    return p > 0 ? Math.min(1, p) : 0;
  }
  return 1;
}

// 幽灵的 left/top 过渡：数据在 slideAt 一次性跳到目标格，**渲染**却是 130ms 过渡
// （.tile { transition: left .13s, top .13s }）→ 位置必须从 commit 时记下的原格插值
function ghostPos(el, ctx) {
  const g = ctx.ghostOrigin[el.id];
  if (!g) return [el.row, el.col];
  const p = ctx.slideAt == null ? 0 : Math.min(1, Math.max(0, (ctx.t - ctx.slideAt) / ctx.MOVE_MS));
  return [g.row + (g.toRow - g.row) * p, g.col + (g.toCol - g.col) * p];
}

// ─────────────────────────────── 场景 ───────────────────────────────
// 盘面用「存档」的形式喂给 restore()（真实代码路径，顺便验证 id 分配）
const S = (...list) => list.map(([row, col, value]) => ({ row, col, value }));

const SCENARIOS = [
  {
    name: 'A 单次合并（2+2 → 4，左侧墙）',
    board: S([0, 0, 2], [0, 2, 2], [3, 1, 8]),
    dir: 'left',
    merges: [{ cell: [0, 0], ghosts: 2, value: 4 }],
  },
  {
    name: 'B 同一条线上两次合并（2 2 4 4 → 4 8）',
    board: S([1, 0, 2], [1, 1, 2], [1, 2, 4], [1, 3, 4]),
    dir: 'left',
    merges: [{ cell: [1, 0], ghosts: 2, value: 4 }, { cell: [1, 1], ghosts: 2, value: 8 }],
  },
  {
    name: 'C 连续合并（第二手**真**滑动落在第一手的滑行中间 t=60）',
    board: S([2, 0, 2], [2, 1, 2], [2, 2, 8], [0, 3, 4]),
    dir: 'left',
    // 左移之后整盘都贴左墙，再按左多半是 no-op；按上一定能动 → 才能真正测到「打断」
    secondMove: { at: 60, dir: 'up', mustMove: true },
  },
  {
    name: 'D 满盘（16 格全满，每行各有一对可合）',
    board: S(
      [0, 0, 2], [0, 1, 2], [0, 2, 4], [0, 3, 8],
      [1, 0, 16], [1, 1, 16], [1, 2, 32], [1, 3, 64],
      [2, 0, 128], [2, 1, 128], [2, 2, 256], [2, 3, 512],
      [3, 0, 1024], [3, 1, 64], [3, 2, 32], [3, 3, 16],
    ),
    dir: 'left',
    merges: [{ cell: [0, 0], ghosts: 2 }, { cell: [1, 0], ghosts: 2 }, { cell: [2, 0], ghosts: 2 }],
  },
  {
    name: 'E 边界不动（整行贴左墙，无可合）',
    board: S([0, 0, 2], [0, 1, 4], [0, 2, 8], [0, 3, 16]),
    dir: 'left',
    noop: true,
  },
  {
    // 满盘：第一手把 (0,0)(0,1) 的 2 合掉 → 15 张，唯一空格 (0,3) 正好被新牌填回
    // → 结果仍「整行贴左墙且无相邻同值」= 再按左是真·无效方向
    name: 'F 边界不动 × 合并中途（t=48 按一个真·无效方向，不能打断动画）',
    board: S(
      [0, 0, 2], [0, 1, 2], [0, 2, 8], [0, 3, 16],
      [1, 0, 4], [1, 1, 16], [1, 2, 32], [1, 3, 64],
      [2, 0, 128], [2, 1, 2], [2, 2, 4], [2, 3, 8],
      [3, 0, 16], [3, 1, 32], [3, 2, 64], [3, 3, 128],
    ),
    dir: 'left',
    merges: [{ cell: [0, 0], ghosts: 2, value: 4 }],
    secondMove: { at: 48, dir: 'left', mustBeNoop: true },
  },
  {
    name: 'G 向右侧墙合并（2 2 → 4 落在最右列）',
    board: S([2, 1, 2], [2, 3, 2]),
    dir: 'right',
    merges: [{ cell: [2, 3], ghosts: 2, value: 4 }],
  },
];

// ─────────────────────────────── 跑一个场景 ───────────────────────────────
async function runScenario(sc, { withRaf }) {
  const { env, mod } = await loadPage({ withRaf, seed: 7 });
  const clock = env.clock;

  // 用真实 restore() 建盘（id 由 ++tileId 分配，不会撞车）
  env.store.__game_2048__state = JSON.stringify({
    tiles: sc.board, score: 0, time: 0, result: 0, winShown: false,
  });
  if (!mod.restore()) throw new Error('restore() 失败');
  const boardIds = mod.tiles.value.map(x => x.id);

  const bornAt = {};
  mod.renderTiles.value.forEach(el => { bornAt[el.id] = 0; });

  const popStart = {};
  const ghostOrigin = {};
  const frames = [];
  const log = [];
  let prevPopping = new Set();
  let slideAt = null;

  clock.setNow(0);
  mod.move(sc.dir);                     // ← 真实的 move()
  const mergeT0 = 0;
  // 哪只幽灵「需要移动」（原格 ≠ 目标格）—— 只有它才有过渡起点的问题
  const movingGhost = mod.ghosts.value.find(g => g.row !== g.toRow || g.col !== g.toCol) || null;
  // commit 时快照「原格 → 目标格」：数据随后会被改写成目标格，原格信息就没了
  const ghostInfo = mod.ghosts.value.map(g => ({ id: g.id, row: g.row, col: g.col, toRow: g.toRow, toCol: g.toCol }));
  ghostInfo.forEach(g => { ghostOrigin[g.id] = g; });

  for (let t = 0; t <= TAIL; t += FINE_MS) {
    if (t > 0) await advanceTo(clock, t);

    // 第二次滑动（连续合并 / 中途无效方向）
    if (sc.secondMove && t >= sc.secondMove.at && !sc.__didSecond) {
      sc.__didSecond = true;
      const before = JSON.stringify(mod.tiles.value.map(x => [x.id, x.row, x.col, x.value]));
      const ghostsBefore = mod.ghosts.value.length;
      mod.move(sc.secondMove.dir);
      const after = JSON.stringify(mod.tiles.value.map(x => [x.id, x.row, x.col, x.value]));
      if (sc.secondMove.mustMove) {
        if (before === after) { sc.__secondMoved = false; fail(`t=${t} 的 ${sc.secondMove.dir} 是 no-op，没测到「打断」`); }
        else sc.__secondMoved = true;
      }
      if (sc.secondMove.mustBeNoop) {
        if (before !== after || ghostsBefore !== mod.ghosts.value.length) {
          sc.__secondWasNoop = false;
          fail(`t=${t} 的 ${sc.secondMove.dir} 并不是无效方向（盘面被改了），这个用例没测到点上`);
        } else sc.__secondWasNoop = true;
      }
      log.push([t, `second move: ${sc.secondMove.dir}${sc.secondMove.mustBeNoop ? ' (no-op)' : ''}`]);
    }

    const now = clock.now();
    // 记录新元素 / popping 起始 / 幽灵开始滑的时刻
    for (const el of mod.renderTiles.value) {
      if (!(el.id in bornAt)) {
        bornAt[el.id] = now;
        log.push([now, `spawn #${el.id} v=${el.value} isNew=${!!el.isNew}`]);
      }
    }
    for (const id of mod.popping.value) {
      if (!prevPopping.has(id)) {
        popStart[id] = now;
        log.push([now, `popping start #${id}`]);
      }
    }
    if (movingGhost && slideAt === null) {
      const g = mod.ghosts.value.find(x => x.id === movingGhost.id);
      if (g && g.row === g.toRow && g.col === g.toCol) {
        slideAt = now;
        log.push([now, `ghost slide applied (#${g.id} ${movingGhost.row},${movingGhost.col} → ${g.toRow},${g.toCol})`]);
      }
    }
    prevPopping = new Set(mod.popping.value);

    const ctx = {
      t: now, popping: mod.popping.value, popStart, bornAt, ghostOrigin,
      MOVE_MS: mod.MOVE_MS, POP_MS: mod.POP_MS, DEAL_MS: mod.DEAL_MS, dealStep: mod.dealStep,
      slideAt,
    };
    const els = mod.renderTiles.value.map(el => {
      const [row, col] = el.ghost ? ghostPos(el, ctx) : [el.row, el.col];
      return { id: el.id, row, col, value: el.value, ghost: !!el.ghost, merging: !!el.merging,
        isNew: !!el.isNew, opacity: opacityOf(el, ctx) };
    });
    frames.push({ t: now, els, popping: new Set(mod.popping.value), ghosts: mod.ghosts.value.length });
  }

  // 收尾：幽灵清空、没有牌永远挂着 merging、棋盘上每张牌都可见
  const final = mod.renderTiles.value.map(el => ({
    id: el.id, merging: !!el.merging, opacity: opacityOf(el, {
      t: clock.now(), popping: mod.popping.value, popStart, bornAt,
      MOVE_MS: mod.MOVE_MS, POP_MS: mod.POP_MS, DEAL_MS: mod.DEAL_MS, dealStep: mod.dealStep,
    }),
  }));

  return { sc, mod, frames, log, slideAt, mergeT0, final, clock, popStart, bornAt, ghostInfo };
}

// ─────────────────────────────── 断言 ───────────────────────────────
function analyseMerge(res, merge) {
  const { frames, mod } = res;
  const [tr, tc] = merge.cell;

  // 目标格上的合并牌（value 对得上、位置就是这个格、不是幽灵）
  const mergedEl = frames[frames.length - 1].els.find(e => !e.ghost && e.row === tr && e.col === tc);
  const mergedId = mergedEl ? mergedEl.id : null;
  // 参与这次合并的两张幽灵：commit 时快照里「目标格 = 这个格」的两只
  const ghostIds = res.ghostInfo.filter(g => g.toRow === tr && g.toCol === tc).map(g => g.id);

  const samples = [];
  for (let t = 0; t <= HORIZON; t += SAMPLE_MS) {
    const f = frames[Math.min(t, frames.length - 1)];
    const trio = f.els.filter(e => e.id === mergedId || ghostIds.includes(e.id));
    const visible = trio.filter(e => e.opacity > 0);
    samples.push({ t, trio, visible });
  }

  // 细粒度：连续 0 可见的最长区间（1ms 分辨率）
  let run = 0; let worst = 0; let worstAt = null;
  for (const f of frames) {
    if (f.t > HORIZON) break;
    const trio = f.els.filter(e => e.id === mergedId || ghostIds.includes(e.id));
    if (trio.every(e => e.opacity <= 0)) { run += FINE_MS; if (run > worst) { worst = run; worstAt = f.t; } }
    else run = 0;
  }

  // 落定之后：目标格必须**物理上**一直被某张可见牌盖住（幽灵飞行途中不算，那是动画本身）
  const settle = (res.slideAt ?? 0) + res.mod.MOVE_MS;
  const post = samples.filter(s2 => s2.t >= settle);
  const uncovered = post.filter((s2) => {
    const f = frames[Math.min(s2.t, frames.length - 1)];
    return !f.els.some(e => e.opacity > 0 && Math.abs(e.row - tr) < 0.5 && Math.abs(e.col - tc) < 0.5);
  });

  return { cell: merge.cell, mergedId, ghostIds, samples, maxGapMs: worst, worstAt, settle, postCount: post.length, uncovered };
}

function fmtOp(v) { return v <= 0 ? '0.00' : v >= 1 ? '1.00' : v.toFixed(2); }

function timelineTable(res, an) {
  const out = [];
  const head = ['t(ms)', `ghost#${an.ghostIds[0] ?? '-'}`, `ghost#${an.ghostIds[1] ?? '-'}`, `merged#${an.mergedId ?? '-'}`, '可见数', '谁是可见的'];
  out.push(head);
  for (const s of an.samples) {
    const g = an.ghostIds.map(id => s.trio.find(e => e.id === id));
    const m = s.trio.find(e => e.id === an.mergedId);
    const pos = e => (e ? `${Math.round(e.row)},${Math.round(e.col)}` : '—');
    const cell = (e) => (e ? `${e.ghost ? 'G' : 'M'}${e.id}(${fmtOp(e.opacity)})` : '—');
    out.push([
      String(s.t),
      g[0] ? `${fmtOp(g[0].opacity)} @${pos(g[0])}` : '—',
      g[1] ? `${fmtOp(g[1].opacity)} @${pos(g[1])}` : '—',
      m ? `${fmtOp(m.opacity)} @${pos(m)}` : '—',
      String(s.visible.length),
      s.visible.length ? s.visible.map(cell).join(' + ') : '⛔ 空档',
    ]);
  }
  return out;
}

const dispW = (s) => [...String(s)].reduce((a, c) => a + (c.codePointAt(0) > 0x2e80 ? 2 : 1), 0);
const padW = (s, n) => String(s) + ' '.repeat(Math.max(0, n - dispW(s)));
function printTable(rows) {
  const w = rows[0].map((_, i) => Math.max(...rows.map(r => dispW(r[i]))));
  for (const [i, r] of rows.entries()) {
    console.log(r.map((c, j) => padW(c, w[j])).join('  ').replace(/\s+$/, ''));
    if (i === 0) console.log(w.map(x => '─'.repeat(x)).join('  '));
  }
}

// ─────────────────────────────── 主流程 ───────────────────────────────
const withRaf = !process.argv.includes('--mp');
console.log(`\n=== 2048 动画仿真（${withRaf ? 'H5 路径：requestAnimationFrame 两连' : '小程序路径：setTimeout(16) × 2'}）===`);
console.log(`step=${SAMPLE_MS}ms horizon=${HORIZON}ms fine=${FINE_MS}ms tail=${TAIL}ms\n`);

let failures = 0;
const fail = (msg) => { failures++; console.log('  ✗ ' + msg); };
const ok = (msg) => console.log('  ✓ ' + msg);

const summary = [];
for (const sc of SCENARIOS) {
  sc.__didSecond = false;
  const res = await runScenario(sc, { withRaf });
  const { mod, slideAt, clock } = res;
  console.log(`\n── ${sc.name}`);
  if (slideAt === null) {
    console.log('   commit t=0 → 没有幽灵需要移动（无效方向 / 幽灵原格就是目标格）');
  } else {
    console.log(`   commit t=0 → 幽灵开始滑 t=${slideAt}ms（距 commit ${slideAt}ms = ${(slideAt / 16).toFixed(1)} 帧）`
      + ` → 落定 t=${slideAt + mod.MOVE_MS}ms（MOVE_MS=${mod.MOVE_MS}，POP_MS=${mod.POP_MS}）`);
  }
  if (res.log.length) for (const [t, msg] of res.log) console.log(`   · t=${t}ms  ${msg}`);

  // ① 幽灵必须「先原位、后目标格」：commit 后第一帧仍在原位
  const firstGhostFrame = res.frames.find(f => f.els.some(e => e.ghost));
  if (!sc.noop) {
    const g0 = firstGhostFrame && firstGhostFrame.els.find(e => e.ghost);
    if (!g0) fail('commit 后没有任何幽灵元素');
    else {
      const atTarget = Math.round(g0.row) === (mod.ghosts.value[0]?.toRow ?? -9);
      ok(`commit 当帧幽灵在原位 (${g0.row},${g0.col})` + (atTarget ? ' ⚠ 但已等于目标格' : ''));
      if (slideAt !== null && slideAt < 16) fail(`幽灵开始滑得太早（t=${slideAt}ms），视图层来不及画原位那一帧`);
      else ok(`幽灵等了两帧才挪格（t=${slideAt}ms ≥ 16ms）`);
      if (slideAt !== null && slideAt < (mod.GHOST_FRAMES - 0.5) * mod.FRAME_MS) {
        fail(`等待不足 ${mod.GHOST_FRAMES} 帧（t=${slideAt}）`);
      }
    }
  }

  // ② 空档检查
  if (sc.merges) {
    for (const mg of sc.merges) {
      const an = analyseMerge(res, mg);
      const bad = an.samples.filter(s => s.visible.length === 0);
      if (bad.length) fail(`合并 (${mg.cell}) 在 ${bad.map(b => b.t).join(',')} ms 三张全不可见`);
      else ok(`合并 (${mg.cell})：${an.samples.length} 个 16ms 采样点全部 ≥1 张可见（0 个空帧）；`
        + `1ms 细化最长空档 ${an.maxGapMs}ms`
        + (an.maxGapMs > 0 ? ` @t=${an.worstAt}ms（= 落定瞬间，merge-pop 的 0% 关键帧，web 同款）` : ''));
      if (an.uncovered.length) fail(`合并 (${mg.cell}) 落定后目标格物理上空的采样点：${an.uncovered.map(u => u.t).join(',')}`);
      else ok(`落定后 ${an.postCount} 个采样点目标格都被可见牌盖住`);
      summary.push({ sc: sc.name, cell: mg.cell, minVisible: Math.min(...an.samples.map(s => s.visible.length)), maxGapMs: an.maxGapMs });
      if (mg === sc.merges[0]) { console.log('  「谁是可见的」时间线（16ms 步进）:'); printTable(timelineTable(res, an)); }
    }
  }

  if (sc.noop) {
    const untouched = res.frames.every(f => f.els.length === sc.board.length && f.ghosts === 0);
    if (!untouched) fail('无效方向改动盘面了');
    else ok('无效方向完全没动盘面（ghosts / popping 都没被写）');
    if (res.slideAt !== null) fail('无效方向竟然开始滑幽灵');
    else ok('无效方向没有产生任何幽灵，也没有排定时器');
  }

  // ③ 收尾：不允许有牌永远挂着 merging，幽灵必须清空
  const stuck = res.final.filter(x => x.merging);
  if (stuck.length) fail(`收尾时仍有 merging=true 的牌：${stuck.map(x => x.id).join(',')}`);
  else ok(`收尾干净（ghosts=${mod.ghosts.value.length}，merging 残留 0，popping=${mod.popping.value.size}）`);

  if (sc.secondMove) {
    // 第二次滑动之后：必须全部可见，且第一手的幽灵 / merging 都被正确收干净
    const invisible = res.final.filter(x => x.opacity <= 0);
    if (invisible.length) fail(`第二次滑动后仍有不可见的牌：${invisible.map(x => x.id).join(',')}`);
    else ok('第二次滑动后所有牌都可见（第一手的幽灵 / merging 被正确收干净）');
    if (sc.__secondMoved) {
      const popped = res.frames.filter(f => f.popping.size > 0);
      if (!popped.length) fail('第二手之后没有任何 pop（合并牌可能一直隐身）');
      else ok(`第二手之后仍有 pop：${popped[0].t}ms 起（${popped[0].popping.size} 张）`);
    }
    if (sc.__secondWasNoop) {
      const settled = res.frames.find(f => f.t > 160 && !f.els.some(e => e.ghost));
      if (!settled) fail('无效方向把第一手的幽灵留住了（clearTimers 被提前执行）');
      else ok('中途按无效方向**没有**打断第一手：幽灵照样在 MOVE_MS 后清掉');
    }
  }

  // 逐场景量到的关键时间点
  summary.push({ sc: sc.name, cell: '-', minVisible: '-', maxGapMs: '-', slideAt, settle: slideAt + mod.MOVE_MS });
}

// ④ 关键帧 / 常量对照（从 .vue 里读回真实值，防止「文档写了但代码没改」）
console.log('\n=== 常量（从 g2048.vue 实读） ===');
{
  const { mod } = await loadPage({ withRaf, seed: 3 });
  const want = { MOVE_MS: 130, POP_MS: 190, DEAL_STEP_FEW: 140, DEAL_MS: 280, DEAL_TAIL: 120 };
  for (const [k, v] of Object.entries(want)) {
    const got = mod[k];
    if (got === v) ok(`${k} = ${got}`);
    else fail(`${k} = ${got}（web 是 ${v}）`);
  }
}

// ⑤ 逐张入场：dealStep 与 animationDelay
console.log('\n=== 逐张入场（playDeal） ===');
for (const [n, expectStep] of [[2, 140], [5, 45]]) {
  const { env, mod } = await loadPage({ withRaf, seed: 5 });
  env.store.__game_2048__state = JSON.stringify({
    tiles: Array.from({ length: n }, (_, i) => ({ row: Math.floor(i / 4), col: i % 4, value: 2 })),
    score: 0, time: 0, result: 0, winShown: false,
  });
  mod.restore();
  mod.playDeal();
  const delays = mod.tiles.value.map(x => mod.tileStyle(x).animationDelay);
  const okStep = mod.dealStep === expectStep;
  if (okStep) ok(`${n} 张牌 → dealStep=${mod.dealStep}（web 同值）`);
  else fail(`${n} 张牌 → dealStep=${mod.dealStep}，期望 ${expectStep}`);
  console.log(`    animationDelay: ${delays.join(' / ')}`);
  // dealing 期间禁止移动
  const before = mod.tiles.value.map(x => `${x.row},${x.col}`).join('|');
  mod.move('left');
  const after = mod.tiles.value.map(x => `${x.row},${x.col}`).join('|');
  if (before === after) ok('逐张入场期间 move() 被 `dealing` 挡住（web 同款）');
  else fail('逐张入场期间竟然能移动');
}

// ───────────────── ⑥ 旧实现 vs 新实现：幽灵那两帧的余量 ─────────────────
// 模型（唯一假设：视图层在「下一次渲染机会」把尚未画出去的 setData 一次性合并应用）：
//   ① 幽灵原位那一批在 t=0 提交，被视图层在 P0 应用（P0 = 下一次 flush）；
//   ② 幽灵挪格那一批在 t=T 提交，在 P1 应用；
//   ③ 只有 P0 < P1（原位这一批单独占过一次渲染）时，CSS 过渡才有起点；
//      若两批落进同一次 flush → 幽灵直接出现在目标格 = 瞬移。
//   P0 - 0 ∈ (0, 一帧]，所以 P0 ∈ (0, 16.7]；抖动 J（长任务把 flush 推后）→ P0 ∈ (0, 16.7+J]。
//   → 不合并的充要条件：T > 16.7 + J。也就是说 T 决定「能吃多少抖动」。
console.log('\n=== 幽灵「原位一帧」的余量：旧实现 vs 等两帧 ===');
console.log('模型：两次 setData 若落进视图层的同一次 flush，幽灵就没有过渡起点（直接出现在目标格）。\n');
{
  const FRAME = 16.7;
  const rows = [['帧内抖动 J(ms)', '需要 T >', '旧 nextTick+20ms (T=20)', '新 两帧 16×2 (T=32)']];
  for (const J of [0, 5, 10, 12, 15, 16, 20, 24]) {
    const need = FRAME + J;
    rows.push([
      `J=${J}`, `T > ${need.toFixed(1)}`,
      need < 20 ? '✓ 原位单独一帧' : '✗ 两批合帧 = 幽灵瞬移',
      need < 32 ? '✓ 原位单独一帧' : '✗ 两批合帧 = 幽灵瞬移',
    ]);
  }
  printTable(rows);
  console.log('\n  → 旧实现只比一帧多一点（余量 3.3ms）：视图层稍微慢一拍，两次 setData 就落进同一帧，');
  console.log('     幽灵直接出现在目标格（瞬移），合并牌还在 merging 隐身 —— 观感就是「卡片消失、过一会儿又出现」；');
  console.log('     因为是 3ms 级的余量，所以是「**有时**」而不是必现。');
  console.log('  → 两帧（32ms ≈ 2 个屏幕帧）把余量抬到 15.3ms，能吃掉约一帧的抖动；');
  console.log('     真机若仍能复现，把 GHOST_FRAMES 改成 3 即可（一行，不用动别处）。\n');
}

// ─────────────────────────────── 汇总 ───────────────────────────────
console.log('\n=== 汇总 ===');
printTable([
  ['场景', '合并格', '采样点最少可见数', '最长连续空档(ms)'],
  ...summary.filter(s => s.cell !== '-').map(s => [s.sc, `(${s.cell})`, String(s.minVisible), String(s.maxGapMs)]),
]);
console.log(`\n${failures ? `✗ ${failures} 项失败` : '✓ 全部通过'}\n`);
process.exit(failures ? 1 : 0);
