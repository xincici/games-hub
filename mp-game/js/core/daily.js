// 每日挑战：每天第一次进游戏时抽一条任务（5 天内不重复），当天完成就记一笔。
// 判定挂在成就系统的埋点上（core/achv.js 调 report），所以 25 个游戏不用各写一套。
const { getRaw, setRaw } = require('./storage');
const i18n = require('./i18n');

const KEY = '__games_hub__daily';
const VERSION = 1;
const KEEP_RECENT = 5;
const KEEP_DAYS = 400;

// ---- 任务池（42 条，覆盖 25 个游戏）----
// kind：play 开一局 / win 赢一局 / perfect 完美胜利 / fast 速通 / level 通关到第 N 关 /
//       reach 分数或里程碑到 N / bump 计数（四条、同花顺…）/ peak 峰值（连胜…）
const POOL = [
  { id: 'click_win1', game: 'click', kind: 'win', need: 1, cn: '赢一局关灯游戏', en: 'Win a Lights Out round' },
  { id: 'click_perfect', game: 'click', kind: 'perfect', need: 1, cn: '关灯：不撤销、不开上帝模式赢一局', en: 'Lights Out: win with no undo or god mode' },
  { id: 'guess_win1', game: 'guess', kind: 'win', need: 1, cn: '赢一局 1A2B', en: 'Win a 1A2B round' },
  { id: 'guess_fast', game: 'guess', kind: 'fast', need: 1, cn: '1A2B：4 次之内猜中', en: '1A2B: guess it within 4 tries' },
  { id: 'point24_win1', game: 'point24', kind: 'win', need: 1, cn: '赢一局 24 点', en: 'Win a 24 game round' },
  { id: 'click_win2', game: 'click', kind: 'win', need: 2, cn: '赢 2 局关灯游戏', en: 'Win 2 Lights Out rounds' },
  { id: 'point24_win3', game: 'point24', kind: 'win', need: 3, cn: '赢 3 局 24 点', en: 'Win 3 rounds of 24 game' },
  { id: 'puzzle_win1', game: 'puzzle', kind: 'win', need: 1, cn: '通关一次数字迷宫', en: 'Clear a Number Maze' },
  { id: 'puzzle_win2', game: 'puzzle', kind: 'win', need: 2, cn: '通关 2 次数字迷宫', en: 'Clear 2 Number Mazes' },
  { id: 'mirror_win1', game: 'mirror', kind: 'win', need: 1, cn: '赢一局 Emoji 镜像', en: 'Win an Emoji Mirror round' },
  { id: 'sudoku_win1', game: 'sudoku', kind: 'win', need: 1, cn: '完成一局数独', en: 'Finish a Sudoku' },
  { id: 'sudoku_win2', game: 'sudoku', kind: 'win', need: 2, cn: '完成 2 局数独', en: 'Finish 2 Sudokus' },
  { id: 'match_win1', game: 'match', kind: 'win', need: 1, cn: '赢一局对对碰', en: 'Win a Match round' },
  { id: 'match_win3', game: 'match', kind: 'win', need: 3, cn: '赢 3 局对对碰', en: 'Win 3 Match rounds' },
  { id: 'link_win1', game: 'link', kind: 'win', need: 1, cn: '赢一局 Emoji 连连看', en: 'Win a Link round' },
  { id: 'crush_win1', game: 'crush', kind: 'win', need: 1, cn: '赢一局 Emoji 消消乐', en: 'Win a Crush round' },
  { id: 'master_win1', game: 'master', kind: 'win', need: 1, cn: '赢一局消除大师', en: 'Win an Emoji Master round' },
  { id: 'sort_win1', game: 'sort', kind: 'win', need: 1, cn: '赢一局 Emoji 排序', en: 'Win a Sort round' },
  { id: 'slide_win1', game: 'slide', kind: 'win', need: 1, cn: '赢一局 Emoji 滑行', en: 'Win a Slide round' },
  { id: 'detective_win1', game: 'detective', kind: 'win', need: 1, cn: '赢一局侦探', en: 'Win a Detective round' },
  { id: 'hunter_win1', game: 'hunter', kind: 'win', need: 1, cn: '赢一局猎手', en: 'Win a Hunter round' },
  { id: 'mahjong_win1', game: 'mahjong', kind: 'win', need: 1, cn: '赢一局麻将英雄', en: 'Win a Mahjong Hero round' },
  { id: 'solo_win1', game: 'solo', kind: 'win', need: 1, cn: '赢一局单人麻将', en: 'Win a Solo Mahjong round' },
  { id: 'poker_win1', game: 'poker', kind: 'win', need: 1, cn: '扑克英雄：结算一次奖金', en: 'Poker: bank a win once' },
  { id: 'poker_win2', game: 'poker', kind: 'win', need: 2, cn: '扑克英雄：结算两次奖金', en: 'Poker: bank 2 wins' },
  { id: 'poker_gstreak3', game: 'poker', kind: 'peak', field: 'gstreak', need: 3, cn: '扑克英雄：猜大小连中 3 次', en: 'Poker: guess 3 in a row' },
  { id: 'alchemy_win1', game: 'alchemy', kind: 'win', need: 1, cn: '赢一局扑克炼金术', en: 'Win an Alchemy round' },
  { id: 'quesheng_win1', game: 'quesheng', kind: 'win', need: 1, cn: '赢一局雀圣', en: 'Win a Quesheng round' },
  { id: 'gambler_win1', game: 'gambler', kind: 'win', need: 1, cn: '赢一局赌神', en: 'Win a Gambler round' },
  { id: 'gambler_streak3', game: 'gambler', kind: 'peak', field: 'streak1', need: 3, cn: '赌神：即时模式连胜 3 场', en: 'Gambler: 3 wins in a row' },
  { id: 'g2048_run', game: 'g2048', kind: 'run', need: 1, cn: '开一局新的 2048', en: 'Start a new 2048 game' },
  { id: 'g2048_tile512', game: 'g2048', kind: 'reach', need: 512, cn: '开一局新的 2048，最高牌到 512', en: 'New 2048 run: reach the 512 tile' },
  { id: 'three_2000', game: 'three', kind: 'reach', need: 2000, cn: '开一局新的 Threes，打到 2000 分', en: 'New Threes run: score 2000' },
  { id: 'snake_100', game: 'snake', kind: 'reach', need: 100, cn: '开一局新的贪吃蛇，打到 100 分', en: 'New Snake run: score 100' },
  { id: 'down_50', game: 'down', kind: 'reach', need: 50, cn: '开一局新的 Emoji 下坠，打到 50 分', en: 'New Down run: score 50' },
  { id: 'legend_3000', game: 'legend', kind: 'reach', need: 3000, cn: '开一局新的麻将传奇，打到 3000 分', en: 'New Legend run: score 3000' },
  { id: 'any_win3', game: '*', kind: 'win', need: 3, cn: '任意游戏累计赢 3 局', en: 'Win 3 rounds in any games' },
  { id: 'any_win4', game: '*', kind: 'win', need: 4, cn: '任意游戏累计赢 4 局', en: 'Win 4 rounds in any games' },
  { id: 'any_play5', game: '*', kind: 'play', need: 5, cn: '任意游戏开 5 局', en: 'Start 5 rounds in any games' },
  { id: 'any_perfect', game: '*', kind: 'perfect', need: 1, cn: '任意游戏完美赢一局', en: 'Win any game perfectly' },
];

const byId = {};
POOL.forEach((t) => { byId[t.id] = t; });

function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

function dateKey(d) {
  const t = d || new Date();
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function blank() {
  return { v: VERSION, cur: null, days: {}, recent: [], total: 0 };
}

function plain(obj) {
  return obj && typeof obj === 'object' ? obj : {};
}

function load() {
  const raw = getRaw(KEY, '');
  if (!raw) return blank();
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return blank();
    }
  }
  if (!data || typeof data !== 'object') return blank();
  const cur = data.cur && data.cur.date
    ? {
      date: data.cur.date,
      id: data.cur.id,
      prog: num(data.cur.prog),
      done: !!data.cur.done,
      doneAt: num(data.cur.doneAt),
      runs: plain(data.cur.runs),
      // 任务已下线但当天已完成的标记：必须存住，否则每帧都会判定「需要修复」并写一次存档
      retired: data.cur.retired ? 1 : 0,
    }
    : null;
  return {
    v: VERSION,
    cur,
    days: plain(data.days),
    recent: Array.isArray(data.recent) ? data.recent.filter((id) => byId[id]) : [],
    total: num(data.total),
  };
}

function save(data) {
  setRaw(KEY, JSON.stringify(data));
}

// 从池子里随机抽一条：最近 5 天出现过的不参与
function pick(recent) {
  const recentSet = {};
  (recent || []).slice(-KEEP_RECENT).forEach((id) => { recentSet[id] = 1; });
  const pool = POOL.filter((t) => !recentSet[t.id]);
  const list = pool.length ? pool : POOL;
  return list[Math.floor(Math.random() * list.length)];
}

function taskOf(id) {
  return byId[id] || null;
}

function descOf(task) {
  if (!task) return '';
  // i18n 暴露的是 lang（'cn' / 'en'）；写 i18n.language 会永远取到 undefined → 一直显示中文
  return i18n.lang === 'en' && task.en ? task.en : task.cn;
}

// 把昨天的战果归档，然后抽今天的新任务
function roll(data, today) {
  if (data.cur && data.cur.date && data.cur.date !== today) {
    const prev = data.cur;
    const hist = data.days[prev.date] || {};
    hist.id = prev.id;
    hist.done = !!prev.done;
    hist.prog = num(prev.prog);
    if (prev.doneAt) hist.at = prev.doneAt;
    data.days[prev.date] = hist;
    // 只有还在池子里的题才占「最近 5 天」的名额，已下线的 id 不占位（否则会挤掉一条真实记录）
    if (byId[prev.id]) data.recent = data.recent.concat([prev.id]).slice(-KEEP_RECENT);
  }
  const task = pick(data.recent);
  data.cur = {
    date: today, id: task.id, prog: 0, done: false, doneAt: 0, runs: {},
  };
  return data;
}

// 任务池是会变的（下线太难的题、改 id）：今天这条如果已经不在池子里，
// 没完成就悄悄换一条，已完成则保留完成状态（不然面板空白、永远完成不了）。
function healToday(data, todayKey) {
  if (!data.cur || data.cur.date !== todayKey) return false;
  if (byId[data.cur.id]) return false;
  if (data.cur.done) {
    if (data.cur.retired) return false;
    data.cur.retired = 1;
    return true;
  }
  roll(data, todayKey);
  return true;
}

// 每天第一次进游戏时调用；同一天重复调用不会换题
function ensureToday() {
  const today = dateKey();
  const data = load();
  if (data.cur && data.cur.date === today) {
    if (healToday(data, today)) save(data);
    return data.cur;
  }
  roll(data, today);
  save(data);
  return data.cur;
}

// 历史归档里最多留 KEEP_DAYS 天
function trimDays(days) {
  const keys = Object.keys(days).sort();
  const drop = keys.length - KEEP_DAYS;
  if (drop <= 0) return;
  keys.slice(0, drop).forEach((k) => { delete days[k]; });
}

let onComplete = null;

function setOnComplete(fn) {
  onComplete = typeof fn === 'function' ? fn : null;
}

// 成就埋点过来：gameId + 事件类型 + 载荷。任务刚好完成时回调（烟花 + 提示）
function report(gameId, kind, payload) {
  const today = dateKey();
  const data = load();
  if (!data.cur || data.cur.date !== today) {
    // 跨天还没 roll：先把题换成今天的，再判定（避免「昨天没做完的任务今天被算完成」）
    roll(data, today);
    save(data);
  }
  if (healToday(data, today)) save(data);
  const cur = data.cur;
  if (!cur || cur.done) return false;
  const task = byId[cur.id];
  if (!task) return false;
  if (task.game !== '*' && task.game !== gameId) return false;
  if (task.kind !== kind) return false;
  if (task.field && payload && payload.field && task.field !== payload.field) return false;
  // 分数 / 里程碑类：必须是「今天开的一局」才算 —— 否则老存档里已有的分数会直接白送
  if (kind === 'reach' && task.game !== '*' && !(cur.runs && cur.runs[gameId])) return false;
  let next = num(cur.prog);
  switch (kind) {
    case 'level':
    case 'reach':
    case 'peak':
      if (num(payload && payload.value) < task.need) return false;
      next = Math.max(next, task.need);
      break;
    default:
      next += 1;
      break;
  }
  cur.prog = next;
  if (next >= task.need) return finish(data, cur, task, today);
  save(data);
  return false;
}

// 达成：写历史 + 通知
function finish(data, cur, task, todayKey) {
  // 老存档没有 total 字段：先用历史条数垫底，再 +1，避免累计从 1 重新数
  const doneBefore = Object.keys(data.days).filter((k) => (data.days[k] || {}).done).length;
  const base = Math.max(num(data.total), doneBefore);
  cur.done = true;
  cur.doneAt = Date.now();
  data.days[todayKey] = { id: task.id, done: true, prog: task.need, at: cur.doneAt };
  // 累计完成次数单独存一份：days 只保留最近 KEEP_DAYS 天，不能靠它数总数
  data.total = base + 1;
  trimDays(data.days);
  save(data);
  if (onComplete) {
    try {
      onComplete(task);
    } catch (e) {
      // 回调失败不能影响游戏
    }
  }
  return true;
}

// 场景里「开了一局新游戏」时调用：分数类任务从这一局开始才计数（kind: 'run' 直接达成）
function markNewRun(gameId) {
  if (!gameId) return false;
  const todayKey = dateKey();
  const data = load();
  if (!data.cur || data.cur.date !== todayKey) {
    roll(data, todayKey);
    save(data);
  }
  if (healToday(data, todayKey)) save(data);
  const cur = data.cur;
  if (!cur || cur.done) return false;
  const task = byId[cur.id];
  if (!task || (task.game !== '*' && task.game !== gameId)) return false;
  cur.runs = cur.runs || {};
  cur.runs[gameId] = 1;
  if (task.kind === 'run') return finish(data, cur, task, todayKey);
  save(data);
  return false;
}

function today() {
  // 走 ensureToday：顺手把「已下线的任务」换成新的，避免面板空白、永远完成不了
  const cur = ensureToday();
  return cur && cur.date === dateKey() ? cur : null;
}

// 红点：今天还没完成
function hasNew() {
  const cur = today();
  return !!cur && !cur.done;
}

function todayTask() {
  const cur = ensureToday();
  const task = byId[cur.id];
  // 已下线的任务（池子改过）且已经完成：保留完成状态，文案退化成「已完成」
  const desc = task ? descOf(task) : i18n.t('dailyDone');
  return {
    id: cur.id,
    date: cur.date,
    done: !!cur.done,
    prog: Math.min(num(cur.prog), task ? task.need : 0),
    need: task ? task.need : 1,
    desc,
  };
}

// 连续达成天数（从今天往前数，今天没完成则从昨天开始数）
function streakDays() {
  const data = load();
  const d = new Date();
  if (!(data.days[dateKey(d)] || {}).done) d.setDate(d.getDate() - 1);
  let n = 0;
  for (let i = 0; i < KEEP_DAYS; i += 1) {
    const rec = data.days[dateKey(d)];
    if (!rec || !rec.done) break;
    n += 1;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

// 累计完成次数（成就用）
function completedTotal() {
  const data = load();
  const inDays = Object.keys(data.days).filter((k) => (data.days[k] || {}).done).length;
  return Math.max(num(data.total), inDays);
}

// 历史最长连续完成天数（不是「当前连续」——成就达成过就不会掉）
function bestStreak() {
  const data = load();
  const keys = Object.keys(data.days)
    .filter((k) => (data.days[k] || {}).done)
    .sort();
  if (!keys.length) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < keys.length; i += 1) {
    const prev = new Date(`${keys[i - 1]}T00:00:00`);
    const cur = new Date(`${keys[i]}T00:00:00`);
    const gap = Math.round((cur - prev) / 86400000);
    run = gap === 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

function monthKey(y, m) {
  return `${y}-${pad2(m + 1)}`;
}

// 月历数据：每周从周一开始，返回 6 行 × 7 天
function monthData(year, month) {
  const data = load();
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;      // 周一 = 0
  const cells = [];
  const todayKey = dateKey(now);
  for (let i = 0; i < 42; i += 1) {
    const day = i - offset + 1;
    if (day < 1 || day > daysInMonth) {
      cells.push(null);
      continue;
    }
    const key = `${year}-${pad2(month + 1)}-${pad2(day)}`;
    const rec = data.days[key];
    const isFuture = year > curY || (year === curY && (month > curM || (month === curM && day > now.getDate())));
    cells.push({
      day,
      key,
      isToday: key === todayKey,
      isFuture,
      done: !!(rec && rec.done),
      tried: !!(rec && !rec.done),
      curDone: key === todayKey && !!(data.cur && data.cur.done),
    });
  }
  const doneCount = cells.filter((c) => c && c.done).length;
  return {
    year, month, cells, doneCount,
    canPrev: true,
    canNext: year < curY || (year === curY && month < curM),
    title: i18n.lang === 'en'
      ? `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month]} ${year}`
      : `${year} 年 ${month + 1} 月`,
  };
}

function pageData(year, month) {
  ensureToday();
  const now = new Date();
  const y = year == null ? now.getFullYear() : year;
  const m = month == null ? now.getMonth() : month;
  return {
    today: todayTask(),
    streak: streakDays(),
    month: monthData(y, m),
    // 顶部「本月达成」永远指当前自然月，翻看历史月份时不会跟着跳
    thisMonthDone: monthData(now.getFullYear(), now.getMonth()).doneCount,
  };
}

module.exports = {
  KEY,
  POOL,
  ensureToday,
  report,
  markNewRun,
  hasNew,
  todayTask,
  pageData,
  monthData,
  monthKey,
  dateKey,
  setOnComplete,
  descOf,
  taskOf,
  streakDays,
  completedTotal,
  bestStreak,
};
