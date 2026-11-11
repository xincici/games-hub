// 微信小游戏统一分享入口。
// 转发在右上角菜单 / open-type="share" 按钮均可用；朋友圈分享仅注册 query。

const { t } = require('./i18n');
const homeI18n = require('../games/home/i18n');
const i18nCore = require('./i18n');
const theme = require('./theme');
const D = require('./draw');
const icons = require('./icons');
const { W, H, SAFE_TOP } = require('./canvas');

if (!i18nCore.__shareHomeRegistered) {
  i18nCore.register('home', homeI18n);
  i18nCore.__shareHomeRegistered = true;
}

const GAME_IDS = [
  'click', 'match', 'point24', 'guess',
  'detective', 'hunter', 'master',
  'g2048', 'three', 'snake', 'link',
  'puzzle', 'mirror', 'down',
  'crush', 'sudoku', 'sort', 'slide',
  'poker', 'mahjong', 'solo',
  'alchemy', 'quesheng', 'legend', 'gambler',
];

let latestSceneId = 'home';

function normalizeGameId(value) {
  const id = typeof value === 'string' ? value : '';
  return GAME_IDS.includes(id) ? id : null;
}

function getQueryGame(options) {
  let query = options && options.query;
  if (query && typeof query === 'string') {
    query = {};
    String(options.query).split('&').forEach((pair) => {
      const [key, value = ''] = pair.split('=');
      if (key) query[decodeURIComponent(key)] = decodeURIComponent(value);
    });
  }
  const sources = [query, options && options.referrerInfo && options.referrerInfo.extraData];
  for (const source of sources) {
    if (!source) continue;
    const id = normalizeGameId(source.game || source.gameId);
    if (id) return id;
  }
  return null;
}

function timelineSupported() {
  if (typeof wx.onShareTimeline !== 'function') return false;
  return true;
}

function titleFor(sceneId) {
  const gameId = normalizeGameId(sceneId);
  return gameId ? `${t('app.shareGamePrefix')} ${t(`home.${gameId}Title`)}` : t('app.shareHomeTitle');
}

function syncMenu(sceneId) {
  if (!wx || typeof wx.showShareMenu !== 'function') return;
  latestSceneId = normalizeGameId(sceneId) || 'home';
  const menus = ['shareAppMessage'];
  if (timelineSupported()) menus.push('shareTimeline');
  wx.showShareMenu({ withShareTicket: false, menus });
  if (wx.__gamesShareRegistered) return;
  wx.__gamesShareRegistered = true;
  // 菜单分享也带上结算海报（否则分享卡片是微信默认截图，和预览里的图对不上）
  const menuPayload = () => {
    const out = {
      title: titleFor(latestSceneId),
      query: latestSceneId === 'home' ? '' : `game=${latestSceneId}`,
    };
    const id = normalizeGameId(latestSceneId);
    if (poster && poster.path && poster.gameId === id) out.imageUrl = poster.path;
    return out;
  };
  wx.onShareAppMessage(menuPayload);
  if (timelineSupported()) wx.onShareTimeline(menuPayload);
}

// ---------- 结算分享（5:4 海报 + 预览 + 入口） ----------
// 结果态：各游戏的 phase 都是这些字符串之一；1A2B / 贪吃蛇用数字 result（1 输 / 2 赢）
const RESULT_PHASES = ['won', 'over', 'lost', 'lose', 'win', 'draw', 'finished'];
const POSTER_W = 600;
const POSTER_H = 480;

let poster = null;          // { gameId, line, title, canvas, path }
let posterBuilding = false;
let preview = null;         // { gameId, at }：预览弹窗开着的时候
let captureFn = null;       // 由 App 注入：把当前场景画进海报
// 截图源尺寸（App 会裁掉顶部状态栏 / 底部空白，所以和 W×H 不一样）；
// 海报里的 contain 必须按这个比例算，否则圆角里会剩一条空白。
let srcSize = { w: W, h: H };

function setSource(w, h) {
  if (w > 0 && h > 0) srcSize = { w, h };
}
const CHIP = { w: 96, h: 26 };
// 「炫耀一下」专属的胭脂红（比主色更醒目，也不至于像警告色）
const ROSE = '#962832';

function latestGameId() {
  return normalizeGameId(latestSceneId);
}

// 每个游戏一句话玩法（分享海报右侧用；中英各一行，不写进 25 个 i18n 文件）
const INTRO = {
  // 每个游戏一句玩法（≤30 字，中英各一行）：只讲「怎么操作 + 怎么赢」，别写数值细节
  click: ['点灯会连带上下左右一起变档，把所有灯关掉即过关', 'Each tap flips a lamp and its neighbours; switch them all off'],
  guess: ['猜 4 位不重复数字，8 次机会；A 位置对、B 数字对', 'Guess 4 unique digits in 8 tries: A right place, B wrong place'],
  poker: ['发牌、留牌、换牌凑牌型，中奖还能猜大小翻倍', 'Draw, hold and swap to make a hand, then call high or low'],
  puzzle: ['点空格旁的数字滑动，把 1、2、3… 按顺序排好', 'Slide the tiles beside the gap back into 1, 2, 3 order'],
  g2048: ['滑动合并相同数字，凑出 2048 即获胜', 'Swipe to merge equal tiles and reach 2048'],
  snake: ['吃食物变长，别撞墙也别咬自己', 'Eat, grow, and avoid walls and your own tail'],
  match: ['翻两张找相同图案，限时内清空全部牌', 'Flip two cards for a pair, clear the board before time'],
  link: ['两个拐点内连起相同图案，限时清空全场', 'Link identical tiles with at most two turns, clear in time'],
  detective: ['记住牌面，找出被偷换的那一张', 'Memorise the cards, spot the one that changed'],
  hunter: ['记住上方目标牌，再从网格里把它们全找出来', 'Memorise the targets, then find them all in the grid'],
  three: ['滑动合并：1+2=3，3 以上只有相同数字能合成', 'Slide to merge: 1+2=3, above 3 only equal tiles combine'],
  crush: ['交换相邻图案凑成三连，步数用完前达标', 'Swap neighbouring tiles into rows of three before moves end'],
  sudoku: ['每行每列每宫填 1-9 不重复', 'Fill 1-9 once per row, column and box'],
  master: ['点露出的牌收进下方托盘，三张相同自动消除', 'Tap exposed tiles into the tray; three of a kind clear'],
  sort: ['把槽顶相同水果整叠搬到空槽或同种上，每槽一种', 'Move stacked fruit onto the same kind or an empty slot'],
  down: ['点一列让落下的图案滑过去，落在同类正上方即消除', 'Tap a column to slide the drop; land it on its twin to pop'],
  slide: ['拖动整排图案，让相同的挨到旁边就一起消除', 'Drag a run so matching tiles touch and pop together'],
  alchemy: ['落牌凑成一行、列或斜线四张成牌型即消除', 'Lay four in a line or diagonal to make a poker hand'],
  mahjong: ['在 3×3 落牌，一行、列或斜线凑成三张成组即消除', 'Lay tiles on the 3x3; a line of three that forms a set clears'],
  quesheng: ['滑动让成组牌挨在一起，再点掉三张一组或一对', 'Slide sets together, then tap the three of a set or the pair'],
  legend: ['往空格落牌或点牌换掉，凑成顺子、刻子、杠得分', 'Drop or swap tiles to form runs, triplets and kongs'],
  mirror: ['记住上方图案，点两张交换位置，复原即过关', 'Memorise the pattern, swap two tiles at a time to restore it'],
  point24: ['四个数字各用一次，加减乘除凑出 24', 'Use all four numbers once with + - x / to make 24'],
  solo: ['凑齐四组顺子或刻子加一对即胡牌', 'Make four sets plus one pair to win'],
  gambler: ['从 13 张里挑出能凑成胡牌的那几张，错两张即失败', 'Pick the tiles that complete the hand; two misses end it'],
};
function introFor(gameId) {
  const pair = INTRO[gameId];
  if (!pair) return '';
  return pair[i18nCore.lang === 'en' ? 1 : 0];
}

// 海报右侧文案：实时分享给「游戏名 + 一句玩法」，结算分享给「游戏名 + 这局成绩」
function posterBody(gameId, scene, live, extra) {
  if (!live) return { title: gameTitleOf(gameId), big: resultLine(scene), lines: [], extra: [] };
  if (gameId === 'home') {
    const panel = scene && scene.dailyOpen ? 'daily'
      : scene && scene.achvOpen ? 'achv'
        : scene && scene.settingsOpen ? 'settings' : 'home';
    const keys = {
      daily: ['app.sharePanelDaily', 'app.shareIntroDaily'],
      achv: ['app.sharePanelAchv', 'app.shareIntroAchv'],
      settings: ['app.sharePanelSettings', 'app.shareIntroSettings'],
      home: ['app.sharePanelHome', 'app.shareIntroHome'],
    }[panel];
    return { title: t(keys[0]), big: null, lines: [t(keys[1])], extra: extra || [] };
  }
  return { title: gameTitleOf(gameId), big: null, lines: [introFor(gameId)], extra: extra || [] };
}

function gameTitleOf(gameId) {
  return gameId ? t(`home.${gameId}Title`) : t('app.shareHomeTitle');
}

// 分享标题就用这款游戏的名字（再带上这局的成绩），不要用合集的统称
function resultTitle(gameId, line) {
  const name = gameTitleOf(gameId);
  return line ? `${name} · ${line}` : name;
}

function setCapture(fn) {
  captureFn = typeof fn === 'function' ? fn : null;
}

function isResultScene(scene, gameId) {
  if (!scene) return false;
  const phase = scene.phase;
  if (typeof phase === 'string' && RESULT_PHASES.indexOf(phase) >= 0) return true;
  const result = scene.result;
  if (typeof result === 'string' && RESULT_PHASES.indexOf(result) >= 0) return true;
  if ((result === 1 || result === 2) && normalizeGameId(gameId || latestSceneId)) return true;
  return false;
}

// 从场景里挑一句「这局怎么样」，没有就退回通用文案
function resultLine(scene) {
  if (!scene) return t('app.shareResultLine');
  if (typeof scene.shareLine === 'string' && scene.shareLine) return scene.shareLine;
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  const score = num(scene.score) != null ? num(scene.score)
    : (num(scene.points) != null ? num(scene.points) : num(scene.cash));
  const level = num(scene.level);
  if (score != null && score > 0) return t('app.shareLineScore').replace('{n}', String(Math.round(score)));
  if (level != null) return t('app.shareLineLevel').replace('{n}', String(level + 1));
  const moves = num(scene.moves) != null ? num(scene.moves) : num(scene.clicks);
  if (moves != null) return t('app.shareLineMoves').replace('{n}', String(moves));
  const streak = num(scene.streak);
  if (streak != null && streak > 1) return t('app.shareLineStreak').replace('{n}', String(streak));
  return t('app.shareResultLine');
}

// 什么时候显示入口：结算态、且没有被帮助 / 二次确认面板挡住
function shouldShowChip(scene, gameId) {
  if (!scene) return false;
  if (scene.helpOpen || scene.confirming) return false;
  return isResultScene(scene, gameId);
}

// 兜底位置：右上角、但要让开微信胶囊（大约 SAFE_TOP+2 ~ +34），所以压在 +44
function chipRect() {
  return { x: W - 16 - CHIP.w, y: SAFE_TOP + 44, w: CHIP.w, h: CHIP.h };
}

// 分享图标（图标字体里没有 share）：一个「从盒子里往上的箭头」
// 分享图标：优先用图标字体里的 mdi:share-variant-outline（和 web / 其他图标同一套语言），
// 字体没加载出来时退回手绘「盒子 + 向上箭头」，保证任何机型都有图标。
function drawIconFontShare(c, cx, cy, size, color) {
  if (!icons.draw(c, 'share', cx, cy, size, color)) return false;
  return true;
}

function drawShareIcon(c, cx, cy, size, color) {
  if (drawIconFontShare(c, cx, cy, size, color)) return true;
  const h = size * 0.5;
  c.save();
  c.strokeStyle = color;
  c.lineWidth = Math.max(1.2, size * 0.1);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(cx - h, cy - h * 0.18);
  c.lineTo(cx - h, cy + h);
  c.lineTo(cx + h, cy + h);
  c.lineTo(cx + h, cy - h * 0.18);
  c.stroke();
  c.beginPath();
  c.moveTo(cx, cy + h * 0.42);
  c.lineTo(cx, cy - h * 1.05);
  c.stroke();
  c.beginPath();
  c.moveTo(cx - h * 0.52, cy - h * 0.52);
  c.lineTo(cx, cy - h * 1.05);
  c.lineTo(cx + h * 0.52, cy - h * 0.52);
  c.stroke();
  c.restore();
  return false;
}

// 把海报画布导出成本地图片。
// ⚠️ 小游戏里 **没有** `wx.canvasToTempFilePath`（那是小程序的页面 canvas API），
// 官方文档给的做法是在 Canvas 上调用 `toTempFilePathSync()` / `toTempFilePath()`。
// 用错 API 的结果就是：预览里画布是对的，但 shareAppMessage 拿不到 imageUrl，
// 分享卡片退回微信默认图（看起来「还是旧图」）。
function exportPoster(cv, payload) {
  const opts = {
    x: 0, y: 0,
    width: POSTER_W, height: POSTER_H,
    destWidth: POSTER_W, destHeight: POSTER_H,
    fileType: 'jpg',       // 5:4 的游戏画面用 jpg 体积小很多，卡片加载更快
    quality: 0.92,
  };
  // 1) 官方推荐：Canvas 上的同步方法，直接拿到路径
  if (typeof cv.toTempFilePathSync === 'function') {
    try {
      const path = cv.toTempFilePathSync(opts);
      if (path) { payload.path = path; payload.exported = 'sync'; return; }
    } catch (e) {
      payload.exportError = e;
    }
  }
  // 2) Canvas 上的异步方法
  if (typeof cv.toTempFilePath === 'function') {
    payload.exported = 'async';
    try {
      cv.toTempFilePath(Object.assign({}, opts, {
        success: (res) => { payload.path = (res && res.tempFilePath) || null; },
        fail: (err) => { payload.path = null; payload.exportError = err; },
      }));
      return;
    } catch (e) {
      payload.exportError = e;
    }
  }
  // 3) 兜底：部分基础库 / 开发者工具里才有 wx.canvasToTempFilePath
  if (typeof wx !== 'undefined' && typeof wx.canvasToTempFilePath === 'function') {
    payload.exported = 'wx';
    try {
      wx.canvasToTempFilePath(Object.assign({ canvas: cv }, opts, {
        success: (res) => { payload.path = (res && res.tempFilePath) || null; },
        fail: (err) => { payload.path = null; payload.exportError = err; },
      }));
      return;
    } catch (e) {
      payload.exportError = e;
    }
  }
  payload.exported = 'none';
  if (!payload.exportError) payload.exportError = new Error('no canvas export api');
}

// 海报：整屏截图 **contain 居中完整显示**，背景用和页面同色系的底色 + 柔光（不用游戏画面铺底），
// 文字放在左右两侧的留白里。这样主体内容不被裁掉、又是 5:4。
function buildPoster(scene, gameId, buildOpts) {
  const bo = buildOpts || {};
  const live = !!bo.live;
  const extra = Array.isArray(bo.extra) ? bo.extra : [];
  // force：强制重新截图（实时分享每次点都必须重拍，否则会拿到上一次的缓存图）
  const force = !!bo.force;
  const body = posterBody(gameId, scene, live, extra);
  // 实时分享（左下角那颗分享按钮）：用当前界面的截图，不再叠「本局成绩」那一行
  const line = live ? '' : resultLine(scene);
  if (!force && poster && poster.gameId === gameId && poster.line === line && poster.live === live
    && poster.dark === !!theme.dark && poster.srcKey === `${srcSize.w}x${srcSize.h}`
    && poster.bodyKey === `${body.title}|${body.big || ''}|${(body.lines || []).join('|')}|${(body.extra || []).join('|')}`) return poster;
  if (posterBuilding) return poster;
  if (typeof wx === 'undefined' || !wx.createCanvas) return null;
  posterBuilding = true;
  try {
    const cv = wx.createCanvas();
    if (!cv) { posterBuilding = false; return null; }
    cv.width = POSTER_W;
    cv.height = POSTER_H;
    const c = cv.getContext('2d');
    // 1) 背景：和页面同色系的底色 + 一团柔光（**不再拿游戏画面当背景**，避免与中间的截图重复）
    const dark = !!theme.dark;
    const grad = c.createLinearGradient(0, 0, POSTER_W, POSTER_H);
    if (dark) {
      grad.addColorStop(0, '#18211e');
      grad.addColorStop(0.55, '#131a18');
      grad.addColorStop(1, '#0e1413');
    } else {
      grad.addColorStop(0, '#fbf8ef');
      grad.addColorStop(0.55, '#f1ecdd');
      grad.addColorStop(1, '#e4ddc9');
    }
    c.fillStyle = grad;
    c.fillRect(0, 0, POSTER_W, POSTER_H);
    // 中间一团柔光，把视线引到截图
    const glow = c.createRadialGradient(POSTER_W / 2, POSTER_H / 2, 20, POSTER_W / 2, POSTER_H / 2, POSTER_W * 0.62);
    glow.addColorStop(0, dark ? 'rgba(84,170,126,0.20)' : 'rgba(58,150,104,0.16)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, POSTER_W, POSTER_H);
    const canCapture = typeof captureFn === 'function';

      // 3) 前景：整屏 contain，**水平垂直都居中**；文字放在左右两侧的留白里（对称，不压图片）
      const top = 20;
      const fgH = POSTER_H - top * 2;
      const ratio = (srcSize.w > 0 && srcSize.h > 0) ? srcSize.w / srcSize.h : W / H;
      let fgW = fgH * ratio;
      let fg = null;
      if (canCapture) {
        if (fgW > POSTER_W * 0.56) fgW = POSTER_W * 0.56;   // 两侧至少各留 ~22% 放文字
        // 四周再收 4%：不依赖机型安全区（有些机型 SAFE_TOP = 0），图永远有一圈看得出来的边距
        fgW *= 0.92;
        const fgFit = fgW / ratio;
        fg = { x: (POSTER_W - fgW) / 2, y: top + (fgH - fgFit) / 2, w: fgW, h: fgFit };
      }
      if (fg) {
        c.save();
        c.shadowColor = 'rgba(0,0,0,0.45)';
        c.shadowBlur = 18;
        c.shadowOffsetY = 6;
        D.fillRoundRect(c, fg.x, fg.y, fg.w, fg.h, 16, 'rgba(0,0,0,0.24)');
        c.restore();
        c.save();
        D.roundRect(c, fg.x, fg.y, fg.w, fg.h, 16);
        c.clip();
        try { captureFn(c, fg.x, fg.y, fg.w, fg.h, { live }); } catch (e) { /* 画不出来就留底色 */ }
        c.restore();
        D.strokeRoundRect(c, fg.x, fg.y, fg.w, fg.h, 16, dark ? 'rgba(255,255,255,0.26)' : 'rgba(0,0,0,0.16)', 1.5);
      }
      // 4) 两侧文字：左边「标签 + 来挑战」，右边「游戏名 + 大字成绩」
      const marginW = (fg ? fg.x - 20 : 24);
      const gameTitle = gameTitleOf(gameId);
      const tag = t('app.sharePosterTag');
      const tagW = Math.min(marginW, D.measure(c, tag, 12) + 26);
      D.fillRoundRect(c, 20, top + 8, tagW, 26, 13, dark ? 'rgba(84,170,126,0.28)' : 'rgba(35,128,78,0.14)');
      D.text(c, tag, 20 + tagW / 2, top + 21,
        { size: 12, weight: 'bold', color: dark ? '#bfe6d0' : '#23804e', align: 'center' });
      const subColor = dark ? 'rgba(255,255,255,0.6)' : 'rgba(44,62,80,0.62)';
      const subLines = [t('app.sharePosterSubLead'), t('app.sharePosterSubTail')];
      subLines.forEach((s, i) => {
        D.text(c, s, 20, POSTER_H - top - 26 + i * 20, { size: 12, color: subColor });
      });
      const rx = (fg ? fg.x + fg.w + 20 : 40);
      const rw = Math.max(80, POSTER_W - rx - 20);
      // 游戏名：一行放不下就缩字号
      let nameSize = 22;
      while (nameSize > 13 && D.measure(c, body.title, nameSize, 'bold') > rw) nameSize -= 1;
      D.text(c, body.title, rx, top + 34,
        { size: nameSize, weight: 'bold', color: dark ? '#ffffff' : '#1f2a24' });
      if (body.big) {
        // 结算：大字成绩
        let bigSize = 28;
        while (bigSize > 15 && D.measure(c, body.big, bigSize, 'bold') > rw) bigSize -= 1;
        D.text(c, body.big, rx, top + 74,
          { size: bigSize, weight: 'bold', color: dark ? '#ff9aa8' : ROSE });
      } else {
        // 实时：一句玩法（自动折行，最多 4 行）
        let y = top + 66;
        const introLines = [];
        (body.lines || []).forEach((txt2) => {
          D.wrapText(c, txt2, rw, 15, 'bold').forEach((l) => introLines.push(l));
        });
        introLines.slice(0, 4).forEach((l) => {
          D.text(c, l, rx, y, { size: 15, weight: 'bold', color: dark ? '#e8f2ec' : '#243b2f' });
          y += 20;
        });
        (body.extra || []).slice(0, 3).forEach((l) => {
          D.text(c, l, rx, y + 4, { size: 12.5, color: dark ? 'rgba(255,255,255,0.62)' : 'rgba(44,62,80,0.6)' });
          y += 18;
        });
      }

    const payload = {
      gameId, line, live, dark, body,
      bodyKey: `${body.title}|${body.big || ''}|${(body.lines || []).join('|')}|${(body.extra || []).join('|')}`,
      srcKey: `${srcSize.w}x${srcSize.h}`,
      // 实时分享用面板 / 游戏名当标题；结算分享才带「第 N 关 / 本局 N 分」
      title: live ? body.title : resultTitle(gameId, line), canvas: cv,
      path: null, exported: null, exportError: null,
    };
    poster = payload;
    exportPoster(cv, payload);
    if (!payload.path && typeof console !== 'undefined' && console.warn) {
      console.warn('[share] 海报导出失败：', payload.exported, payload.exportError && payload.exportError.message);
    }
    posterBuilding = false;
    return poster;
  } catch (e) {
    posterBuilding = false;
    return null;
  }
}

// 点「炫耀一下」→ 先开预览（图片 + 取消 / 去分享），玩家点「去分享」才真的分享
function openPreview(scene, gameId, opts) {
  const id = gameId || latestGameId();
  const o = opts || {};
  // 每次打开预览都重拍：实时分享要的是「此刻」的画面，用缓存会看到点开前的界面
  buildPoster(scene, id, { live: !!o.live, extra: o.extra, force: true });
  preview = { gameId: id, at: Date.now(), live: !!o.live };
  return true;
}

// 海报导出状态（冒烟 / 真机排查用）
function posterInfo() {
  if (!poster) return null;
  return {
    gameId: poster.gameId,
    line: poster.line,
    dark: poster.dark,
    exported: poster.exported,
    hasPath: !!poster.path,
    error: poster.exportError ? String(poster.exportError && poster.exportError.message || poster.exportError) : null,
  };
}

function previewOpen() {
  return !!preview;
}

function closePreview() {
  preview = null;
}

// 发送：此时是「去分享」的点击回调，属于用户手势，微信允许
function sendResult() {
  if (typeof wx === 'undefined' || !wx.shareAppMessage) { closePreview(); return false; }
  const gameId = (poster && poster.gameId) || latestGameId();
  const opts = {
    title: poster ? poster.title : resultTitle(gameId, ''),
    query: gameId ? `game=${gameId}` : '',
  };
  if (poster && poster.path) opts.imageUrl = poster.path;
  try {
    wx.shareAppMessage(opts);
    closePreview();
    return true;
  } catch (e) {
    closePreview();
    return false;
  }
}

const PV = {
  padTop: 18,      // 卡片顶 → 标题（底部留白与之相同）
  titleH: 18,
  titleGap: 8,     // 标题 → 图片
  btnGap: 16,      // 图片 → 按钮
  btnH: 42,        // 按钮高度（34 太矮，不好点）
  btnSplit: 0.25,  // 取消 : 去分享 = 1 : 3
  gap: 12,
};

function previewRect() {
  const w = Math.min(W - 48, 336);
  const h = Math.round(w * (POSTER_H / POSTER_W));
  const imgY = PV.padTop + PV.titleH + PV.titleGap;
  const cardH = imgY + h + PV.btnGap + PV.btnH + PV.padTop;
  const x = (W - w) / 2;
  const y = Math.max(SAFE_TOP + 18, (H - cardH) / 2);
  return { x, y, w, h, cardH, imgY, btnY: imgY + h + PV.btnGap };
}

// 预览弹窗：海报图 + 「取消 / 去分享」
function drawPreview(c, scene) {
  const T = theme.tokens;
  const r = previewRect();
  const cardX = r.x - 12;
  const cardY = r.y;
  const cardW = r.w + 24;
  // 全屏遮罩（点空白关闭）
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.55)';
  c.fillRect(0, 0, W, H);
  c.restore();
  // 卡片
  D.fillRoundRect(c, cardX, cardY, cardW, r.cardH, 18, theme.dark ? '#2f2f31' : '#ffffff');
  const title = (poster && poster.title) || gameTitleOf(preview && preview.gameId);
  D.text(c, title, cardX + cardW / 2, cardY + PV.padTop + PV.titleH / 2,
    { size: 14, weight: 'bold', color: T.text, align: 'center' });
  // 图片
  const imgY = cardY + r.imgY;
  if (poster && poster.canvas) {
    try {
      c.drawImage(poster.canvas, r.x, imgY, r.w, r.h);
    } catch (e) {
      D.fillRoundRect(c, r.x, imgY, r.w, r.h, 10, T.bg);
      D.text(c, t('app.sharePreviewFail'), r.x + r.w / 2, imgY + r.h / 2,
        { size: 12, color: T.muted, align: 'center' });
    }
  } else {
    D.fillRoundRect(c, r.x, imgY, r.w, r.h, 10, T.bg);
    D.text(c, t('app.sharePreviewBuilding'), r.x + r.w / 2, imgY + r.h / 2,
      { size: 12, color: T.muted, align: 'center' });
  }
  // 按钮行：取消 : 去分享 = 1 : 3
  const by = cardY + r.btnY;
  const bh = PV.btnH;
  const cancelW = Math.round((r.w - PV.gap) * PV.btnSplit);
  const goW = r.w - PV.gap - cancelW;
  const goX = r.x + cancelW + PV.gap;
  const waited = Date.now() - ((preview && preview.at) || 0);
  const ready = !!(poster && poster.path);
  const failed = !!(poster && !poster.path && poster.exportError);
  const canShare = ready || failed || waited > 2500;
  D.fillRoundRect(c, r.x, by, cancelW, bh, 11, T.bg);
  D.strokeRoundRect(c, r.x, by, cancelW, bh, 11, T.border, 1);
  D.text(c, t('app.shareCancel'), r.x + cancelW / 2, by + bh / 2,
    { size: 14, weight: 'bold', color: T.text, align: 'center' });
  D.fillRoundRect(c, goX, by, goW, bh, 11, canShare ? ROSE : T.border);
  D.text(c, t('app.shareGo'), goX + goW / 2, by + bh / 2,
    { size: 14, weight: 'bold', color: canShare ? '#ffffff' : T.muted, align: 'center' });
  if (!ready) {
    D.text(c, failed || canShare ? t('app.sharePreviewFail') : t('app.sharePreviewBuilding'),
      r.x + r.w / 2, by - 10, { size: 11, color: T.muted, align: 'center' });
  }
  // 命中区（最后注册，压住场景自己的按钮）
  if (!scene || typeof scene.addButton !== 'function') return;
  scene.addButton('share-mask', 0, 0, W, H, () => closePreview());
  scene.addButton('share-cancel', r.x, by, cancelW, bh, () => closePreview());
  if (canShare) scene.addButton('share-go', goX, by, goW, bh, () => sendResult());
}


// 结算面板：**宽度跟游戏卡片一致**的遮罩 + 右上角分享入口。
// 场景只要把原来那块「棋盘大小」的遮罩换成它，内容照旧按 cx / cy 居中画即可。
function resultPanel(c, scene, top, height, opts) {
  const o = opts || {};
  const panelW = (typeof scene.cw === 'number' && scene.cw > 0) ? scene.cw : Math.min(W - 32, 440);
  const x = (W - panelW) / 2;
  const radius = o.radius != null ? o.radius : 14;
  const h = Math.max(height, o.minH || 0);
  D.fillRoundRect(c, x, top, panelW, h, radius, o.color || theme.tokens.overlay);
  if (o.stroke) D.strokeRoundRect(c, x, top, panelW, h, radius, theme.tokens.border, 1);
  const rect = { x, y: top, w: panelW, h };
  if (o.share !== false) {
    drawResultChip(c, scene, { x: x + panelW - 10 - 96, y: top + 10, w: 96, h: 28 },
      { filled: true, label: t('app.shareCta') });
  }
  return rect;
}

// 画「分享」入口：默认落在兜底位置（胶囊下方）；结算遮罩自己做样式的游戏传 rect 进来，
// 就画在它自己的右上角（filled = 主色实心，压在遮罩上更醒目）。
function drawResultChip(c, scene, rect, opts) {
  const T = theme.tokens;
  const o = opts || {};
  const r = rect || chipRect();
  const filled = !!o.filled;
  const label = o.label != null ? o.label : t('app.shareResultCta');
  if (filled) {
    D.fillRoundRect(c, r.x, r.y, r.w, r.h, r.h / 2, ROSE);
  } else {
    c.save();
    c.globalAlpha = 0.95;
    c.shadowColor = 'rgba(0,0,0,0.25)';
    c.shadowBlur = 10;
    c.shadowOffsetY = 2;
    D.fillRoundRect(c, r.x, r.y, r.w, r.h, r.h / 2, theme.dark ? 'rgba(38,38,38,0.72)' : 'rgba(255,255,255,0.92)');
    c.restore();
    D.strokeRoundRect(c, r.x, r.y, r.w, r.h, r.h / 2, ROSE, 1.4);
  }
  const fg = filled ? '#ffffff' : (theme.dark ? '#ffffff' : ROSE);
  const iconSize = Math.min(15, r.h - 8);
  const textW = D.measure(c, label, 11.5, 'bold');
  const groupW = iconSize + 5 + textW;
  const gx = r.x + (r.w - groupW) / 2;
  drawShareIcon(c, gx + iconSize / 2, r.y + r.h / 2, iconSize, fg);
  D.text(c, label, gx + iconSize + 5, r.y + r.h / 2, { size: 11.5, weight: 'bold', color: fg });
  if (!scene.buttons.some((b) => b.id === 'share-result')) {
    const gameId = normalizeGameId(latestSceneId);
    scene.addButton('share-result', r.x, r.y, r.w, r.h, () => openPreview(scene, gameId));
  }
  return { icon: true, label, rect: r };
}

module.exports = {
  GAME_IDS,
  getQueryGame,
  normalizeGameId,
  isResultScene,
  shouldShowChip,
  buildPoster,
    setCapture,
    openPreview,
    previewOpen,
    closePreview,
    drawPreview,
    previewRect,
    setSource,
    resultPanel,
    posterInfo,
    rose: ROSE,
  sendResult,
  drawResultChip,
  drawShareIcon,
  chipRect,
  timelineSupported,
  titleFor,
  syncMenu,
};
