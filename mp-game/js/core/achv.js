// 成就系统：数据层。
//
// 设计原则：
// 1) **不重复造轮子** —— 绝大多数成就直接读各游戏已经存好的战绩（最高关卡 / 最高分 / 最佳连胜 / 最少步数…），
//    这样成就页永远和游戏内的记录一致，也不会因为某个游戏改了存档逻辑就失真。
// 2) 只有「累计对局」「累计胜利」这类游戏本身不存的数字，才由这里自己记：
//    `__games_hub__achv` = { v:1, plays:{gameId:n}, wins:{gameId:n} }。
//    - 对局：App.openGame 里 trackPlay()
//    - 胜利：各游戏在判定胜利处调 win()
// 3) 每个游戏最多 3 条成就，够用就 2 条：一条「入门」、一条「进阶」、必要时再来一条「极限」。

const { getRaw, setRaw } = require('./storage');
const i18n = require('./i18n');
// 成就卡要显示游戏名：home.<id>Title。home 场景注册的是同一个 dict，
// 这里也注册一次，保证 achv 单独被 require 时标题也能取到。
i18n.register('home', require('../games/home/i18n'));

const KEY = '__games_hub__achv';

let cache = null;

function load() {
  if (cache) return cache;
  let data = null;
  try {
    const raw = getRaw(KEY, '');
    data = typeof raw === 'string' && raw ? JSON.parse(raw) : raw;
  } catch (e) {
    data = null;
  }
  if (!data || typeof data !== 'object') data = {};
  cache = {
    v: 2,
    plays: plain(data.plays),
    wins: plain(data.wins),
    bestLevel: plain(data.bestLevel),
    perfect: plain(data.perfect),
    fast: plain(data.fast),
    modes: nested(data.modes),
    reach: nested(data.reach),
    peak: nested(data.peak),
    counters: nested(data.counters),
    help: plain(data.help),
    timeMs: num(data.timeMs),
    fails: num(data.fails),
    seen: data.seen !== false,
  };
  return cache;
}

function save() {
  const data = load();
  try {
    setRaw(KEY, JSON.stringify({
      v: 2,
      plays: data.plays,
      wins: data.wins,
      bestLevel: data.bestLevel,
      perfect: data.perfect,
      fast: data.fast,
      modes: data.modes,
      reach: data.reach,
      peak: data.peak,
      counters: data.counters,
      help: data.help,
      timeMs: data.timeMs,
      fails: data.fails,
      seen: data.seen !== false,
    }));
  } catch (e) {
    // 存储异常不影响游玩
  }
}

// 老版本只有 plays/wins/bestLevel，缺的字段补空对象，读起来不会炸
function plain(obj) {
  return obj && typeof obj === 'object' ? Object.assign({}, obj) : {};
}

function nested(obj) {
  const out = {};
  if (obj && typeof obj === 'object') {
    Object.keys(obj).forEach((k) => {
      if (obj[k] && typeof obj[k] === 'object') out[k] = Object.assign({}, obj[k]);
    });
  }
  return out;
}

// modes[id][slot] = { wins, first, max }：按模式（对对碰/侦探/猎手/消除大师，或关灯的难度）分别记
function modeRec(id, slot) {
  const data = load();
  const key = String(slot);
  data.modes[id] = data.modes[id] || {};
  data.modes[id][key] = data.modes[id][key] || { wins: 0, first: 0, max: 0 };
  return data.modes[id][key];
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function read(key) {
  try {
    return num(getRaw(key, 0));
  } catch (e) {
    return 0;
  }
}

function maxOf(keys) {
  return keys.reduce((acc, k) => Math.max(acc, read(k)), 0);
}

// 越小越好的指标（用时 / 步数）：只统计已存在的记录
function minPositiveOf(keys) {
  const values = keys.map((k) => read(k)).filter((v) => v > 0);
  return values.length ? Math.min(...values) : 0;
}

function trackPlay(id) {
  if (!id) return;
  const data = load();
  data.plays[id] = (data.plays[id] || 0) + 1;
  save();
}

// level：本局所在关卡（可选）。很多游戏把「当前关」写回自己的 key，开新游戏会重置，
// 直接用它会让人拿到的成就倒退 —— 这里额外记一份历史最高关卡兜底。
// extra 全部可选：
//   level   本局关卡（1 基）—— 记历史最高关卡，并用于「首关 / 最高关」判断
//   mode    模式号 / 难度号 —— 按模式分别统计胜场
//   perfect 是否完美操作（各游戏自己判定）
//   fast    是否「速通」（1A2B ≤4 次猜中）
function win(id, extra) {
  if (!id) return;
  const data = load();
  const before = unlockedCount();
  const e = extra || {};
  const level = Number.isFinite(+e.level) ? Math.floor(+e.level) : 0;
  data.wins[id] = (data.wins[id] || 0) + 1;
  data.plays[id] = Math.max(data.plays[id] || 0, 1);
  if (level > 0) data.bestLevel[id] = Math.max(data.bestLevel[id] || 0, level);
  if (e.mode != null) {
    const rec = modeRec(id, e.mode);
    rec.wins += 1;
    if (level === 1) rec.first = 1;
    if (level > 0) rec.max = Math.max(rec.max, level);
  }
  if (e.perfect) data.perfect[id] = (data.perfect[id] || 0) + 1;
  if (e.fast) data.fast[id] = (data.fast[id] || 0) + 1;
  // 有新解锁就在首页成就 FAB 上点个小红点（打开成就页后消失）
  if (unlockedCount() > before) data.seen = false;
  save();
}

// 一局结束时上报本局指标（2048 最大牌 / Threes 得分）：跨过哪一档就给那一档 +1 次。
// 只在「一局结束」调用一次，否则同一局会重复计数。
function reach(id, value, thresholds) {
  const v = num(value);
  if (!id || !v || !thresholds) return;
  const data = load();
  const before = unlockedCount();
  data.reach[id] = data.reach[id] || {};
  thresholds.forEach((t) => {
    if (v >= t) data.reach[id][t] = (data.reach[id][t] || 0) + 1;
  });
  if (unlockedCount() > before) data.seen = false;
  save();
}

// 任意「历史最大值」指标（最高资产 / 单次最高奖金 / 最大单次得分 …）
function peak(id, field, value) {
  const v = num(value);
  if (!id || !field || v <= 0) return;
  const data = load();
  data.peak[id] = data.peak[id] || {};
  if (v <= (data.peak[id][field] || 0)) return;
  data.peak[id][field] = v;
  save();
}

function peakOf(id, field) {
  const p = load().peak[id];
  return (p && p[field]) || 0;
}

// 任意「累计次数」指标（四条 / 同花顺 / 字牌消除 / 5 次摸牌内获胜 …）
function bump(id, field, n) {
  const v = num(n == null ? 1 : n);
  if (!id || !field || !v) return;
  const data = load();
  data.counters[id] = data.counters[id] || {};
  data.counters[id][field] = (data.counters[id][field] || 0) + v;
  save();
}

function countOf(id, field) {
  const c = load().counters[id];
  return (c && c[field]) || 0;
}

// ---- 隐藏成就的埋点 ----
// 帮助弹窗：每个游戏看过一次就记 1，集齐 25 个解锁「求知好学」
function markHelp(id) {
  if (!id || id === 'home') return;
  const data = load();
  data.help[id] = 1;
  save();
}

function helpCount() {
  return Object.keys(load().help).length;
}

// 游戏时长：App 每帧累加，攒够 3 秒或切场景时落盘（别每帧写存储）
let pendingMs = 0;

function addPlayMs(ms) {
  const v = num(ms);
  if (v <= 0) return;
  pendingMs += v;
  if (pendingMs >= 3000) flushTime();
}

function flushTime() {
  if (pendingMs <= 0) return;
  const data = load();
  data.timeMs += pendingMs;
  pendingMs = 0;
  save();
}

function timeMsOf() {
  return load().timeMs + pendingMs;
}

function failsOf() {
  return load().fails || 0;
}

function markFail() {
  const data = load();
  data.fails = (data.fails || 0) + 1;
  save();
}

function hasNew() {
  return load().seen === false;
}

function markSeen() {
  const data = load();
  if (data.seen === false) {
    data.seen = true;
    save();
  }
}

function playsOf(id) {
  return load().plays[id] || 0;
}

function winsOf(id) {
  return load().wins[id] || 0;
}

function bestLevelOf(id) {
  return load().bestLevel[id] || 0;
}

function perfectOf(id) {
  return load().perfect[id] || 0;
}

function fastOf(id) {
  return load().fast[id] || 0;
}

function reachOf(id, threshold) {
  const r = load().reach[id];
  return (r && r[threshold]) || 0;
}

function modeOf(id, slot) {
  const m = load().modes[id];
  const rec = m && m[String(slot)];
  return rec || { wins: 0, first: 0, max: 0 };
}

function modeWins(id, slot) {
  return modeOf(id, slot).wins;
}

function totalPlays() {
  const data = load();
  return Object.keys(data.plays).reduce((sum, k) => sum + num(data.plays[k]), 0);
}

// ---------- 成就定义 ----------
// a(nameCn, nameEn, fn) —— fn() 返回 { value, target }，默认 value >= target 视为达成；
// 传 { lte: true } 表示「越小越好」（步数 / 用时）。

// 传 { counter: true } 表示「计数型」成就：解锁条件是 value >= 1，右侧显示「x 次」而不是 x/target。
// { counter: true } 计数型；{ stat: true, unit } 纯指标行（只显示数值，没有进度、不算成就）
const A = (cn, en, fn, opts) => ({
  cn,
  en,
  fn,
  lte: !!(opts && opts.lte),
  counter: !!(opts && opts.counter),
  stat: !!(opts && opts.stat),
  unit: (opts && opts.unit) || '',
});

const CLICK_DIFFS = [3, 4, 5, 6, 7, 8, 9, 10];
const MATCH_BEST = ['__emoji_match__best_1', '__emoji_match__best_1_2', '__emoji_match__best_1_3'];
const MIRROR_BEST = [1, 2, 3, 4, 5].map((d) => `__emoji_mirror__best_${d}`);
const DET_BEST = ['__emoji_detective__best', '__emoji_detective__best_2', '__emoji_detective__best_3'];
const HUNT_BEST = ['__emoji_hunter__best', '__emoji_hunter__best_2', '__emoji_hunter__best_3'];
const MASTER_LV = ['__emoji_master__level', '__emoji_master__poker_level', '__emoji_master__mahjong_level'];
const SORT_BEST = ['__emoji_sort__best_1', '__emoji_sort__best_2'];
const ALCH_BEST = ['__poker_alchemy__best_1', '__poker_alchemy__best_2'];

// 读 JSON 存档里的一个字段（少数游戏只把关卡写进 state）
function readJsonField(key, field) {
  try {
    const raw = getRaw(key, '');
    const obj = typeof raw === 'string' && raw ? JSON.parse(raw) : raw;
    if (!obj) return 0;
    if (field === 'phase') return obj.phase || '';
    return Number.isFinite(+obj[field]) ? +obj[field] : 0;
  } catch (e) {
    return 0;
  }
}

// ---- 历史存档推算（成就上线前就玩过的老玩家）----
// 成就系统是后来加的，老玩家的 `modes` / `wins` 是空的，但存档里有成绩：
//   best  = 已通关数 + 1（赢一次就会写）
//   level = 当前关卡（1 基的游戏 → 当前关 = 已通关 + 1；0 基的游戏 → 当前关 = 已通关）
// 只要这些记录能证明「打过第 N 关」，就当作已达成 —— 这样新加成就也不吃亏。
// master 的 level 写的是「刚通关的那一关」，但默认值也是 1，分不清「没玩过」和「通了第 1 关」，
// 所以额外看 state 里的 phase === 'won'。
const LEGACY = {
  match: {
    caps: [11, 11, 11], levelBase: 1,
    best: ['__emoji_match__best_1', '__emoji_match__best_1_2', '__emoji_match__best_1_3'],
    level: ['__emoji_match__level', '__emoji_match__level_2', '__emoji_match__level_3'],
  },
  detective: {
    caps: [9, 10, 9], levelBase: 0, jsonLevel: true,
    best: ['__emoji_detective__best', '__emoji_detective__best_2', '__emoji_detective__best_3'],
    level: ['__emoji_detective__level', '__emoji_detective__level_2', '__emoji_detective__level_3'],
  },
  hunter: {
    caps: [6, 6, 6], levelBase: 0, jsonLevel: true,
    best: ['__emoji_hunter__best', '__emoji_hunter__best_2', '__emoji_hunter__best_3'],
    level: ['__emoji_hunter__level', '__emoji_hunter__level_2', '__emoji_hunter__level_3'],
  },
  master: {
    caps: [0, 0, 0], levelBase: 0,
    level: ['__emoji_master__level', '__emoji_master__poker_level', '__emoji_master__mahjong_level'],
    phase: ['__emoji_master__state', '__emoji_master__poker_state', '__emoji_master__mahjong_state'],
  },
  sort: {
    caps: [0, 0], levelBase: 1,
    best: ['__emoji_sort__best_1', '__emoji_sort__best_2'],
    level: ['__emoji_sort__level', '__emoji_sort__level_2'],
  },
  alchemy: {
    caps: [0, 0], levelBase: 1,
    best: ['__poker_alchemy__best_1', '__poker_alchemy__best_2'],
    level: ['__poker_alchemy__level', '__poker_alchemy__level_2'],
  },
  quesheng: {
    caps: [0, 0], levelBase: 1,
    level: ['__quesheng__level', '__quesheng__level_2'],
  },
  gambler: {
    caps: [0, 0], levelBase: 1,
    best: ['__gambler__best', '__gambler__best_2'],
    level: ['__gambler__level', '__gambler__level_2'],
  },
  // 麻将英雄：闯关最高关存在 best_1（已开始的最高关，比已通关多 1）
  mahjong: { caps: [0], levelBase: 1, best: ['__mahjong_hero__best_1'] },
  link: { caps: [0], levelBase: 1, best: ['__emoji_link__best_1'], level: ['__emoji_link__level'] },
  crush: { caps: [0], levelBase: 1, best: ['__emoji_crush__best_1'], level: ['__emoji_crush__level'] },
  slide: { caps: [0], levelBase: 1, level: [], stateLevel: '__emoji_slide__state' },
};

// 某一模式「能证明通关过几关」——best / 当前关卡 / 自己记的 max 取最大
function legacyCleared(id, slot) {
  const cfg = LEGACY[id];
  if (!cfg) return modeOf(id, slot).max;
  const i = slot - 1;
  let best = 0;
  if (cfg.best && cfg.best[i]) best = Math.max(0, read(cfg.best[i]) - 1);
  let lv = 0;
  if (cfg.level && cfg.level[i]) {
    lv = cfg.jsonLevel ? readJsonField(cfg.level[i], 'level') : read(cfg.level[i]);
    if (cfg.phase && cfg.phase[i] && readJsonField(cfg.phase[i], 'phase') === 'won') {
      lv = Math.max(lv, read(cfg.level[i]));
    } else {
      lv = Math.max(0, lv - cfg.levelBase);
    }
  }
  if (cfg.stateLevel) lv = Math.max(lv, Math.max(0, readJsonField(cfg.stateLevel, 'level') - cfg.levelBase));
  return Math.max(best, lv, modeOf(id, slot).max);
}

// 该游戏各模式加起来「至少赢过多少局」
function legacyWins(id) {
  const cfg = LEGACY[id];
  if (!cfg) return 0;
  return (cfg.caps || [0]).reduce((sum, _c, i) => sum + legacyCleared(id, i + 1), 0);
}

// 成就里的「累计胜利次数」：自己记的胜场与历史推算取大
function totalWins(id) {
  return Math.max(winsOf(id), legacyWins(id));
}

function modeFirstCount(id) {
  const cfg = LEGACY[id] || { caps: [0] };
  return cfg.caps.reduce((acc, _c, i) => acc + (legacyCleared(id, i + 1) >= 1 ? 1 : 0), 0);
}

function modeTopCount(id) {
  const cfg = LEGACY[id] || { caps: [0] };
  return cfg.caps.reduce((acc, cap, i) => (
    acc + (cap > 0 && legacyCleared(id, i + 1) >= cap ? 1 : 0)
  ), 0);
}

function modeLevelCount(id, target) {
  const cfg = LEGACY[id] || { caps: [0] };
  return cfg.caps.reduce((acc, _c, i) => acc + (legacyCleared(id, i + 1) >= target ? 1 : 0), 0);
}

// 难度列表（数字迷宫 3~6、镜像 1~5、数独 1~3）：该难度赢过（或存档里有记录）就算通关过
const PUZZLE_DIFFS = [3, 4, 5, 6];
const MIRROR_DIFFS = [1, 2, 3, 4, 5];
const SUDOKU_DIFFS = [1, 2, 3];

function diffDoneCount(id, diffs, keyOf) {
  return diffs.reduce((acc, d) => (
    acc + (modeWins(id, d) > 0 || read(keyOf(d)) > 0 ? 1 : 0)
  ), 0);
}

const linkBest = () => legacyCleared('link', 1);
const crushBest = () => legacyCleared('crush', 1);
const sortBest = (mode) => legacyCleared('sort', mode);

// 单模式的最高关卡（兼容旧调用）
function modeLevel(id, slot) {
  return legacyCleared(id, slot);
}

// 达成次数：自己记的次数与「最高分/最大牌已经到过这一档」取大
function reachCount(id, threshold, bestKey) {
  return Math.max(reachOf(id, threshold), bestKey && read(bestKey) >= threshold ? 1 : 0);
}

const clickClearedDiffs = () => CLICK_DIFFS.filter(
  (n) => modeWins('click', n) > 0 || read(`__easy_click_game__${n}`) > 0,
).length;

// click：有 best 记录的最高难度（best 只在「破纪录且剩余步数 > 0」时才写）
const clickMaxCleared = () => CLICK_DIFFS.filter((n) => read(`__easy_click_game__${n}`) > 0).pop() || 0;
const clickMaxScore = () => CLICK_DIFFS.reduce((acc, n) => Math.max(acc, read(`__easy_click_game__${n}`)), 0);
// 0 / 空数据显示成「—」，避免「最佳 0 关」这种像 bug 的文案
const V = (v) => (Number(v) > 0 ? v : '—');
const lv = (n) => `${n} ${i18n.t('achvLv')}`;
const lvOf = (n) => (Number(n) > 0 ? `${n} ${i18n.t('achvLv')}` : '—');
// 带单位的值：0 时整段显示成「—」，不要出现「— 连胜」这种别扭文案
const withUnit = (v, unit) => (Number(v) > 0 ? `${v} ${unit}` : '—');
const winTag = (id) => (totalWins(id) > 0 ? ` · ${i18n.t('achvWins')} ${totalWins(id)}` : '');
// link / crush / detective / hunter / gambler 的 best = 通关关数 + 1
const cleared = (n) => Math.max(0, n - 1);

const SPEC = {
  click: {
    icon: 'idea', accent: '#23804e',
    stats: () => `${i18n.t('achvBest')} ${withUnit(clickMaxScore(), i18n.t('achvSteps'))}${winTag('click')}`,
    achv: [
      A('累计胜利次数', 'Total wins', () => ({ value: winsOf('click'), target: 1 }), { counter: true }),
      A('所有难度通关', 'All difficulties cleared', () => ({ value: clickClearedDiffs(), target: CLICK_DIFFS.length })),
      A('完美操作胜利', 'Flawless wins', () => ({ value: perfectOf('click'), target: 1 }), { counter: true }),
    ],
  },
  guess: {
    icon: 'counter', accent: '#2c6aad',
    stats: () => `${i18n.t('achvWins')} ${V(winsOf('guess'))}`,
    achv: [
      A('最长连胜', 'Best streak', () => ({ value: read('__guess_number__best'), target: 1 }), { stat: true, unit: 'achvStreak' }),
      A('累计 10 胜', 'Win 10 games', () => ({ value: winsOf('guess'), target: 10 })),
      A('累计 100 胜', 'Win 100 games', () => ({ value: winsOf('guess'), target: 100 })),
      A('累计 500 胜', 'Win 500 games', () => ({ value: winsOf('guess'), target: 500 })),
      A('天选之子（4 次内猜中）', 'Lucky guess (≤4 tries)', () => ({ value: fastOf('guess'), target: 1 }), { counter: true }),
    ],
  },
  poker: {
    icon: 'mode-poker', accent: '#8f6419',
    stats: () => `${i18n.t('achvWins')} ${V(totalWins('poker'))}`,
    achv: [
      A('最高资产', 'Top chips', () => ({ value: read('__poker_game_total'), target: 1 }), { stat: true }),
      A('单次最高奖金', 'Best single payout', () => ({ value: peakOf('poker', 'payout'), target: 1 }), { stat: true }),
      A('猜大小最长连胜', 'Best high-low streak', () => ({ value: peakOf('poker', 'gstreak'), target: 1 }), { stat: true, unit: 'achvStreak' }),
      A('四条达成次数', 'Four of a kind', () => ({ value: countOf('poker', 'four'), target: 1 }), { counter: true }),
      A('同花顺达成次数', 'Straight flush', () => ({ value: countOf('poker', 'flush'), target: 1 }), { counter: true }),
    ],
  },
  puzzle: {
    icon: 'puzzle', accent: '#2c6aad',
    stats: () => `${i18n.t('achvBest')} ${withUnit(minPositiveOf(['__number_puzzle__6', '__number_puzzle__5', '__number_puzzle__4', '__number_puzzle__3']), i18n.t('achvSteps'))}`,
    achv: [
      A('所有难度通关', 'All difficulties cleared', () => ({
        value: diffDoneCount('puzzle', PUZZLE_DIFFS, (d) => `__number_puzzle__${d}`),
        target: PUZZLE_DIFFS.length,
      })),
      A('累计 10 胜', 'Win 10 games', () => ({ value: winsOf('puzzle'), target: 10 })),
      A('累计 100 胜', 'Win 100 games', () => ({ value: winsOf('puzzle'), target: 100 })),
      A('累计 500 胜', 'Win 500 games', () => ({ value: winsOf('puzzle'), target: 500 })),
    ],
  },
  g2048: {
    icon: 'numeric-3', accent: '#2c6aad',
    stats: () => `${i18n.t('achvTopScore')} ${V(read('__game_2048__best'))}`,
    achv: [
      A('达成 1024', 'Reach 1024', () => ({ value: reachCount('g2048', 1024, '__game_2048__best'), target: 1 }), { counter: true }),
      A('达成 2048', 'Reach 2048', () => ({ value: reachCount('g2048', 2048, '__game_2048__best'), target: 1 }), { counter: true }),
      A('达成 4096', 'Reach 4096', () => ({ value: reachCount('g2048', 4096, '__game_2048__best'), target: 1 }), { counter: true }),
    ],
  },
  snake: {
    icon: 'snake', accent: '#23804e',
    stats: () => `${i18n.t('achvTopScore')} ${V(read('__snake_game__best'))}${playsOf('snake') ? ` · ${playsOf('snake')} ${i18n.t('achvPlaysUnit')}` : ''}`,
    achv: [
      A('达成 100 分', 'Score 100', () => ({ value: reachCount('snake', 100, '__snake_game__best'), target: 1 }), { counter: true }),
      A('达成 500 分', 'Score 500', () => ({ value: reachCount('snake', 500, '__snake_game__best'), target: 1 }), { counter: true }),
      A('达成 1000 分', 'Score 1000', () => ({ value: reachCount('snake', 1000, '__snake_game__best'), target: 1 }), { counter: true }),
    ],
  },
  match: {
    icon: 'layers', accent: '#7550ad',
    stats: () => `${i18n.t('achvHigh')} ${lvOf(Math.max(maxOf(MATCH_BEST), bestLevelOf('match')))}${winTag('match')}`,
    achv: [
      A('三模式首关通关', 'First level · all modes', () => ({ value: modeFirstCount('match'), target: 3 })),
      A('三模式最高关通关', 'Top level · all modes', () => ({ value: modeTopCount('match'), target: 3 })),
      A('累计胜利次数', 'Total wins', () => ({ value: totalWins('match'), target: 1 }), { counter: true }),
      A('完美操作胜利', 'Flawless wins', () => ({ value: perfectOf('match'), target: 1 }), { counter: true }),
    ],
  },
  link: {
    icon: 'link', accent: '#23804e',
    stats: () => `${i18n.t('achvHigh')} ${lvOf(linkBest())}${winTag('link')}`,
    achv: [
      A('完成第 10 关', 'Clear level 10', () => ({ value: linkBest(), target: 10 })),
      A('完成第 50 关', 'Clear level 50', () => ({ value: linkBest(), target: 50 })),
      A('完成第 100 关', 'Clear level 100', () => ({ value: linkBest(), target: 100 })),
      A('累计胜利次数', 'Total wins', () => ({ value: totalWins('link'), target: 1 }), { counter: true }),
    ],
  },
  detective: {
    icon: 'incognito', accent: '#7550ad',
    stats: () => `${i18n.t('achvHigh')} ${lvOf(Math.max(cleared(maxOf(DET_BEST)), bestLevelOf('detective')))}${winTag('detective')}`,
    achv: [
      A('三模式首关通关', 'First level · all modes', () => ({ value: modeFirstCount('detective'), target: 3 })),
      A('三模式最高关通关', 'Top level · all modes', () => ({ value: modeTopCount('detective'), target: 3 })),
      A('累计胜利次数', 'Total wins', () => ({ value: totalWins('detective'), target: 1 }), { counter: true }),
    ],
  },
  hunter: {
    icon: 'target', accent: '#7550ad',
    stats: () => `${i18n.t('achvHigh')} ${V(Math.max(cleared(maxOf(HUNT_BEST)), bestLevelOf('hunter')))}/6 ${i18n.t('achvLv')}${winTag('hunter')}`,
    achv: [
      A('三模式首关通关', 'First level · all modes', () => ({ value: modeFirstCount('hunter'), target: 3 })),
      A('三模式最高关通关', 'Top level · all modes', () => ({ value: modeTopCount('hunter'), target: 3 })),
      A('累计胜利次数', 'Total wins', () => ({ value: totalWins('hunter'), target: 1 }), { counter: true }),
    ],
  },
  three: {
    icon: 'numeric-3', accent: '#2c6aad',
    stats: () => `${i18n.t('achvTopScore')} ${V(read('__threes_game__best'))}`,
    achv: [
      A('达成 2000 分', 'Score 2000', () => ({ value: reachCount('three', 2000, '__threes_game__best'), target: 1 }), { counter: true }),
      A('达成 10000 分', 'Score 10000', () => ({ value: reachCount('three', 10000, '__threes_game__best'), target: 1 }), { counter: true }),
      A('达成 30000 分', 'Score 30000', () => ({ value: reachCount('three', 30000, '__threes_game__best'), target: 1 }), { counter: true }),
    ],
  },
  crush: {
    icon: 'crush', accent: '#bd5420',
    stats: () => `${i18n.t('achvHigh')} ${lvOf(crushBest())}${winTag('crush')}`,
    achv: [
      A('完成第 10 关', 'Clear level 10', () => ({ value: crushBest(), target: 10 })),
      A('完成第 50 关', 'Clear level 50', () => ({ value: crushBest(), target: 50 })),
      A('完成第 100 关', 'Clear level 100', () => ({ value: crushBest(), target: 100 })),
      A('累计胜利次数', 'Total wins', () => ({ value: totalWins('crush'), target: 1 }), { counter: true }),
    ],
  },
  sudoku: {
    icon: 'sudoku', accent: '#2c6aad',
    stats: () => `${i18n.t('achvFastest')} ${withUnit(minPositiveOf(['__sudoku_game__1', '__sudoku_game__2', '__sudoku_game__3']), i18n.t('achvSeconds'))}`,
    achv: [
      A('所有难度通关', 'All difficulties cleared', () => ({
        value: diffDoneCount('sudoku', SUDOKU_DIFFS, (d) => `__sudoku_game__${d}`),
        target: SUDOKU_DIFFS.length,
      })),
      A('累计 10 胜', 'Win 10 games', () => ({ value: winsOf('sudoku'), target: 10 })),
      A('累计 50 胜', 'Win 50 games', () => ({ value: winsOf('sudoku'), target: 50 })),
      A('累计 100 胜', 'Win 100 games', () => ({ value: winsOf('sudoku'), target: 100 })),
    ],
  },
  master: {
    icon: 'layers', accent: '#7550ad',
    stats: () => `${i18n.t('achvHigh')} ${lvOf(Math.max(maxOf(MASTER_LV), bestLevelOf('master')))}${winTag('master')}`,
    achv: [
      A('三模式首关通关', 'First level · all modes', () => ({ value: modeFirstCount('master'), target: 3 })),
      A('三模式达成 10 关', 'Reach level 10 · all modes', () => ({ value: modeLevelCount('master', 10), target: 3 })),
      A('三模式达成 100 关', 'Reach level 100 · all modes', () => ({ value: modeLevelCount('master', 100), target: 3 })),
      A('累计胜利次数', 'Total wins', () => ({ value: totalWins('master'), target: 1 }), { counter: true }),
    ],
  },
  sort: {
    icon: 'sort', accent: '#23804e',
    stats: () => `${i18n.t('achvOneSlot')} ${lvOf(sortBest(1))} · ${i18n.t('achvTwoSlot')} ${lvOf(sortBest(2))}`,
    achv: [
      A('两种模式首胜', 'First win · both modes', () => ({ value: modeFirstCount('sort'), target: 2 })),
      A('累计胜利次数', 'Total wins', () => ({ value: totalWins('sort'), target: 1 }), { counter: true }),
    ],
  },
  down: {
    icon: 'down', accent: '#bd5420',
    stats: () => `${i18n.t('achvTopScore')} ${V(read('__emoji_down__best_1'))}`,
    achv: [
      A('达成 50 分', 'Score 50', () => ({ value: reachCount('down', 50, '__emoji_down__best_1'), target: 1 }), { counter: true }),
      A('达成 100 分', 'Score 100', () => ({ value: reachCount('down', 100, '__emoji_down__best_1'), target: 1 }), { counter: true }),
      A('达成 1000 分', 'Score 1000', () => ({ value: reachCount('down', 1000, '__emoji_down__best_1'), target: 1 }), { counter: true }),
    ],
  },
  slide: {
    icon: 'slide', accent: '#bd5420',
    stats: () => `${i18n.t('achvHigh')} ${lvOf(Math.max(readJsonField('__emoji_slide__state', 'level'), bestLevelOf('slide'), 1))}${winTag('slide')}`,
    achv: [
      A('无重排获胜', 'Win without reshuffle', () => ({ value: perfectOf('slide'), target: 1 })),
      A('累计胜利次数', 'Total wins', () => ({ value: totalWins('slide'), target: 1 }), { counter: true }),
    ],
  },
  alchemy: {
    icon: 'alchemy', accent: '#8f6419',
    stats: () => `${i18n.t('achvWins')} ${V(totalWins('alchemy'))}`,
    achv: [
      A('两种模式首胜', 'First win · both modes', () => ({ value: modeFirstCount('alchemy'), target: 2 })),
      A('普通模式最高关卡', 'Poker · top level', () => ({ value: modeLevel('alchemy', 1), target: 1 }), { stat: true, unit: 'achvLv' }),
      A('普通模式最大单次得分', 'Poker · best single', () => ({ value: peakOf('alchemy', 'gain1'), target: 1 }), { stat: true, unit: 'achvScore' }),
      A('炸金花最高关卡', '3-card · top level', () => ({ value: modeLevel('alchemy', 2), target: 1 }), { stat: true, unit: 'achvLv' }),
      A('炸金花最大单次得分', '3-card · best single', () => ({ value: peakOf('alchemy', 'gain2'), target: 1 }), { stat: true, unit: 'achvScore' }),
    ],
  },
  mahjong: {
    icon: 'mode-mahjong', accent: '#8f6419',
    stats: () => `${i18n.t('achvWins')} ${V(totalWins('mahjong'))}`,
    achv: [
      A('最高关卡', 'Top stage', () => ({ value: read('__mahjong_hero__best_1'), target: 1 }), { stat: true, unit: 'achvLv' }),
      A('无尽模式最高分', 'Endless top score', () => ({ value: read('__mahjong_hero__best_2'), target: 1 }), { stat: true, unit: 'achvScore' }),
      A('最大单次得分', 'Best single clear', () => ({ value: peakOf('mahjong', 'gained'), target: 1 }), { stat: true, unit: 'achvScore' }),
    ],
  },
  quesheng: {
    icon: 'quesheng', accent: '#8f6419',
    stats: () => `${i18n.t('achvWins')} ${V(totalWins('quesheng'))}`,
    achv: [
      A('两种模式首胜', 'First win · both modes', () => ({ value: modeFirstCount('quesheng'), target: 2 })),
      A('滑底模式最高关卡', 'Slide mode · top level', () => ({ value: modeLevel('quesheng', 1), target: 1 }), { stat: true, unit: 'achvLv' }),
      A('步进模式最高关卡', 'Step mode · top level', () => ({ value: modeLevel('quesheng', 2), target: 1 }), { stat: true, unit: 'achvLv' }),
    ],
  },
  legend: {
    icon: 'legend', accent: '#8f6419',
    stats: () => `${i18n.t('achvPlays')} ${V(playsOf('legend'))}`,
    achv: [
      A('最高得分', 'Top score', () => ({ value: read('__mahjong_legend__best_1'), target: 1 }), { stat: true, unit: 'achvScore' }),
      A('达成 1000 分', 'Score 1000', () => ({ value: reachCount('legend', 1000, '__mahjong_legend__best_1'), target: 1 }), { counter: true }),
      A('达成 5000 分', 'Score 5000', () => ({ value: reachCount('legend', 5000, '__mahjong_legend__best_1'), target: 1 }), { counter: true }),
      A('达成 10000 分', 'Score 10000', () => ({ value: reachCount('legend', 10000, '__mahjong_legend__best_1'), target: 1 }), { counter: true }),
      A('字牌消除', 'Honor tiles cleared', () => ({ value: countOf('legend', 'honor'), target: 1 }), { counter: true }),
    ],
  },
  mirror: {
    icon: 'mirror', accent: '#7550ad',
    stats: () => `${i18n.t('achvFastest')} ${withUnit(minPositiveOf(MIRROR_BEST), i18n.t('achvSeconds'))}${winTag('mirror')}`,
    achv: [
      A('所有难度通关', 'All difficulties cleared', () => ({
        value: diffDoneCount('mirror', MIRROR_DIFFS, (d) => `__emoji_mirror__best_${d}`),
        target: MIRROR_DIFFS.length,
      })),
      A('累计 10 胜', 'Win 10 games', () => ({ value: winsOf('mirror'), target: 10 })),
      A('累计 100 胜', 'Win 100 games', () => ({ value: winsOf('mirror'), target: 100 })),
      A('累计 500 胜', 'Win 500 games', () => ({ value: winsOf('mirror'), target: 500 })),
    ],
  },
  point24: {
    icon: 'calculator', accent: '#2c6aad',
    stats: () => `${i18n.t('achvWins')} ${V(winsOf('point24'))}`,
    achv: [
      A('最长连胜', 'Best streak', () => ({ value: read('__point24__best_streak'), target: 1 }), { stat: true, unit: 'achvStreak' }),
      A('累计 10 胜', 'Win 10 games', () => ({ value: winsOf('point24'), target: 10 })),
      A('累计 100 胜', 'Win 100 games', () => ({ value: winsOf('point24'), target: 100 })),
      A('累计 500 胜', 'Win 500 games', () => ({ value: winsOf('point24'), target: 500 })),
    ],
  },
  solo: {
    icon: 'mode-mahjong', accent: '#8f6419',
    stats: () => `${i18n.t('achvWins')} ${V(totalWins('solo'))}`,
    achv: [
      A('最长连胜', 'Best streak', () => ({ value: read('__solo__best_streak'), target: 1 }), { stat: true, unit: 'achvStreak' }),
      A('5 次摸牌内获胜', 'Win within 5 draws', () => ({ value: fastOf('solo'), target: 1 }), { counter: true }),
    ],
  },
  gambler: {
    icon: 'gambler', accent: '#8f6419',
    stats: () => `${i18n.t('achvWins')} ${V(totalWins('gambler'))}`,
    achv: [
      A('最长连胜', 'Best streak', () => ({
        value: Math.max(
          peakOf('gambler', 'streak1'), peakOf('gambler', 'streak2'),
          read('__gambler__streak'), read('__gambler__streak_2'),
        ),
        target: 1,
      }), { stat: true, unit: 'achvStreak' }),
      A('两种模式首胜', 'First win · both modes', () => ({ value: modeFirstCount('gambler'), target: 2 })),
      A('即时模式最高关卡', 'Instant · top level', () => ({ value: modeLevel('gambler', 1), target: 1 }), { stat: true, unit: 'achvLv' }),
      A('即时模式最长连胜', 'Instant · best streak', () => ({ value: peakOf('gambler', 'streak1'), target: 1 }), { stat: true, unit: 'achvStreak' }),
      A('提交模式最高关卡', 'Submit · top level', () => ({ value: modeLevel('gambler', 2), target: 1 }), { stat: true, unit: 'achvLv' }),
      A('提交模式最长连胜', 'Submit · best streak', () => ({ value: peakOf('gambler', 'streak2'), target: 1 }), { stat: true, unit: 'achvStreak' }),
    ],
  },
};

const ORDER = ['click', 'guess', 'poker', 'puzzle', 'g2048', 'snake', 'match', 'link', 'detective', 'hunter',
  'three', 'crush', 'sudoku', 'master', 'sort', 'down', 'slide', 'alchemy', 'mahjong', 'quesheng',
  'legend', 'mirror', 'point24', 'solo', 'gambler'];

const ORDER_KEY = '__games_hub__achv_order';

// 成就卡顺序：玩家长按拖动后存一份；损坏 / 缺项时用默认顺序补齐
function loadOrder() {
  let saved = [];
  try {
    const raw = getRaw(ORDER_KEY, '');
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(arr)) saved = arr.filter((id) => typeof id === 'string' && ORDER.includes(id));
  } catch (e) {
    saved = [];
  }
  const out = [];
  saved.forEach((id) => { if (!out.includes(id)) out.push(id); });
  ORDER.forEach((id) => { if (!out.includes(id)) out.push(id); });
  return out;
}

function saveOrder(order) {
  try {
    setRaw(ORDER_KEY, JSON.stringify(order));
  } catch (e) {
    // 存储异常忽略
  }
}

// ---- 隐藏成就 ----
// 四条的解锁条件都跨游戏；未解锁时名字显示成 ******。
const HIDDEN_GAMES = ['master', 'link', 'crush', 'sort', 'slide', 'mahjong', 'alchemy', 'quesheng', 'gambler'];

// 某个游戏「最好的那个模式」通关到第几关
function bestClearedOf(id) {
  const cfg = LEGACY[id];
  const slots = cfg ? cfg.caps.length : 1;
  let best = 0;
  for (let i = 1; i <= slots; i += 1) best = Math.max(best, legacyCleared(id, i));
  return best;
}

function hiddenList() {
  const T = i18n.t;
  const helpN = helpCount();
  const ms = timeMsOf();
  const fails = failsOf();
  const clearedGames = HIDDEN_GAMES.filter((id) => bestClearedOf(id) >= 11).length;
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  return [
    {
      key: 'help',
      name: T('achvHiddenHelp'),
      desc: T('achvHiddenHelpDesc'),
      unlocked: helpN >= 25,
      hint: `${Math.min(helpN, 25)}/25`,
    },
    {
      key: 'time',
      name: T('achvHiddenTime'),
      desc: `${T('achvHiddenTimeDesc')} ${hours} ${T('achvHours')} ${mins % 60} ${T('achvMinutes')}`,
      unlocked: ms >= 3600000,
      hint: `${hours}h${mins % 60}m`,
    },
    {
      key: 'fails',
      name: T('achvHiddenFail'),
      desc: `${T('achvHiddenFailDesc')} ${fails} ${T('achvTimes')}`,
      unlocked: fails >= 100,
      hint: `${Math.min(fails, 100)}/100`,
    },
    {
      key: 'levels',
      name: T('achvHiddenLevel'),
      desc: T('achvHiddenLevelDesc'),
      unlocked: clearedGames >= HIDDEN_GAMES.length,
      hint: `${clearedGames}/${HIDDEN_GAMES.length}`,
    },
  ];
}

function titleOf(id) {
  const key = `home.${id}Title`;
  const v = i18n.t(key);
  return v === key ? id : v;
}

function progressOf(def) {
  let raw;
  try {
    raw = def.fn() || {};
  } catch (e) {
    raw = {};
  }
  const value = Math.max(0, num(raw.value));
  const target = def.counter || def.stat ? 1 : Math.max(1, num(raw.target));
  const unlocked = def.stat
    ? false
    : (def.lte ? value > 0 && value <= target : value >= target);
  return { value, target, unlocked, counter: !!def.counter, stat: !!def.stat };
}

// 单条成就的进度（0~1），给成就页画进度药丸用
function ratioOf(a) {
  if (a.unlocked) return 1;
  if (a.lte) return a.value > 0 ? Math.min(1, a.target / a.value) : 0;
  return Math.min(1, a.value / a.target);
}

function gamesData() {
  return loadOrder().map((id) => {
    const spec = SPEC[id];
    const rows = spec.achv.map((def) => {
      const p = progressOf(def);
      return {
        name: i18n.lang === 'cn' ? def.cn : def.en,
        value: p.value,
        target: p.target,
        unlocked: p.unlocked,
        lte: def.lte,
        counter: !!def.counter,
        stat: !!def.stat,
        unit: def.unit || '',
        ratio: 0,
      };
    });
    rows.forEach((r) => {
      if (r.stat) { r.ratio = 0; return; }
      r.ratio = r.unlocked ? 1 : (r.lte ? (r.value > 0 ? Math.min(1, r.target / r.value) : 0) : Math.min(1, r.value / r.target));
    });
    return {
      id,
      name: titleOf(id),
      icon: spec.icon,
      accent: spec.accent,
      statsLine: spec.stats ? spec.stats() : '',
      achv: rows,
    };
  });
}

function summaryOf(games) {
  let unlocked = 0;
  let total = 0;
  let cleared = 0;
  games.forEach((g) => {
    g.achv.forEach((a) => {
      total += 1;
      if (a.unlocked) unlocked += 1;
    });
    if (g.achv[0] && g.achv[0].unlocked) cleared += 1;
  });
  return { unlocked, total, cleared, plays: totalPlays() };
}

function pageData() {
  const games = gamesData();
  return { games, hidden: hiddenList(), summary: summaryOf(games) };
}

function unlockedCount() {
  const games = gamesData();
  return games.reduce((sum, g) => sum + g.achv.filter((a) => a.unlocked).length, 0);
}

function totalCount() {
  return ORDER.reduce((sum, id) => sum + (SPEC[id] ? SPEC[id].achv.length : 0), 0);
}

module.exports = {
  trackPlay,
  hasNew,
  markSeen,
  win,
  playsOf,
  winsOf,
  bestLevelOf,
  perfectOf,
  fastOf,
  reachOf,
  modeOf,
  modeWins,
  reach,
  peak,
  peakOf,
  bump,
  countOf,
  legacyCleared,
  legacyWins,
  totalWins,
  markHelp,
  helpCount,
  addPlayMs,
  flushTime,
  timeMsOf,
  failsOf,
  markFail,
  hiddenList,
  HIDDEN_GAMES,
  totalPlays,
  pageData,
  unlockedCount,
  totalCount,
  SPEC,
  ORDER,
  loadOrder,
  saveOrder,
};
