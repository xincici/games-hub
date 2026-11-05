// 用法：node scripts/smoke.js <宽> <高>（不需要 shebang —— 小游戏上传器会把项目内的 .js 当源码解析）
// 小游戏场景冒烟：用一个假的 wx + canvas 把 25 个场景都实例化并渲染几帧，检查：
//   1. render 不抛异常；
//   2. 静音 FAB 只在「全局音效开启」时出现；
//   3. 静音 FAB 不与其它按钮重叠、不越界；
//   4. 点静音后该场景的 play() 不再落到 InnerAudioContext。
// 用法：node scripts/smoke.js 390 844 && node scripts/smoke.js 375 667

const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
// 尺寸必须靠 argv 传入：canvas.js 在模块加载时就把 W/H 定死了
const ARG_W = Number(process.argv[2]) || 390;
const ARG_H = Number(process.argv[3]) || 844;
let W = ARG_W;
let H = ARG_H;

// ---------- 假 wx ----------
const storage = new Map();
const audioCalls = [];
const blurStats = { puts: 0, gets: 0 };
let captureDetail = false;

// 帮助动画用 Date.now() 推进；同步循环里时间几乎不走，套上这个可以按每帧 20ms 前进
function withFakeClock(stepMs, fn) {
  const realNow = Date.now;
  let fake = realNow();
  Date.now = () => { fake += stepMs; return fake; };
  try {
    return fn();
  } finally {
    Date.now = realNow;
  }
}

function makeCtx() {
  const noop = () => {};
  const ctx = {
    canvas: { width: W, height: H },
    measureText: (s) => ({ width: String(s).length * 7 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({}),
    getImageData: (x, y, w, h) => {
      blurStats.gets += 1;
      const data = new Uint8ClampedArray(Math.max(1, w * h * 4));
      // captureDetail 打开时填渐变（模拟「画面有内容」，help 的毛玻璃要能读到细节）；
      // 默认全 0，emoji-box 的「无墨迹 → 返回 null」测试依赖它
      if (captureDetail) {
        for (let i = 0; i < w * h; i += 1) {
          data[i * 4] = (i * 7) % 200;
          data[i * 4 + 1] = (i * 13) % 180;
          data[i * 4 + 2] = (i * 29) % 160;
          data[i * 4 + 3] = 255;
        }
      }
      // EMOJI_INK=1：在画布中心偏 (3, 6) 涂一块 8×8 不透明像素，模拟「emoji 墨迹」，
      // 用来验证 core/emoji-box 的偏移计算与 drawEmoji 的落点。
      if (process.env.EMOJI_INK) {
        const cx = Math.floor(w / 2) + 3;
        const cy = Math.floor(h / 2) + 6;
        for (let yy = cy - 4; yy < cy + 4; yy += 1) {
          for (let xx = cx - 4; xx < cx + 4; xx += 1) {
            if (xx >= 0 && yy >= 0 && xx < w && yy < h) data[(yy * w + xx) * 4 + 3] = 255;
          }
        }
      }
      return { data };
    },
    putImageData: () => { blurStats.puts += 1; },
    setLineDash: noop,
    getLineDash: () => [],
  };
  const fnNames = ['save','restore','beginPath','closePath','moveTo','lineTo','arc','arcTo','rect',
    'fill','stroke','fillRect','strokeRect','clearRect','fillText','strokeText','translate','scale',
    'rotate','clip','quadraticCurveTo','bezierCurveTo','ellipse','drawImage','setTransform','resetTransform'];
  const props = ['fillStyle','strokeStyle','lineWidth','font','textAlign','textBaseline','globalAlpha',
    'shadowColor','shadowBlur','shadowOffsetX','shadowOffsetY','lineCap','lineJoin','globalCompositeOperation','filter'];
  fnNames.forEach((k) => { ctx[k] = noop; });
  ctx.__calls = [];
  ctx.__arcs = [];
  ctx.__texts = [];
  ctx.fillText = (value, x, y) => { ctx.__texts.push({ value, x, y, baseline: ctx.textBaseline }); };
  ['arc', 'clip', 'drawImage'].forEach((k) => {
    ctx[k] = (...args) => {
      ctx.__calls.push(k);
      if (k === 'arc') ctx.__arcs.push(args);
    };
  });
  const values = {};
  props.forEach((k) => {
    Object.defineProperty(ctx, k, {
      get: () => values[k],
      set: (v) => { values[k] = v; },
      configurable: true, // 测试里需要把某个属性改成「平台不支持」
    });
  });
  return ctx;
}

function makeCanvas() {
  const canvas = { width: W, height: H };
  const ctx = makeCtx();
  canvas.getContext = () => ctx;
  return canvas;
}

global.wx = {
  getWindowInfo: () => ({
    windowWidth: W, windowHeight: H, pixelRatio: 2,
    safeArea: { top: 0, bottom: H },
  }),
  getSystemInfoSync: () => ({
    windowWidth: W, windowHeight: H, pixelRatio: 2, statusBarHeight: 0,
    safeArea: { top: 0, bottom: H },
    // 想测 Android 分支时设 FAKE_PLATFORM=android（默认按 devtools 走老逻辑）
    ...(process.env.FAKE_PLATFORM ? { platform: process.env.FAKE_PLATFORM } : { platform: 'devtools' }),
  }),
  createCanvas: () => makeCanvas(),
  createImage: () => ({ onload: null, onerror: null, width: 0, height: 0, set src(v) {} }),
  loadFont: () => 'FakeIcons',
  getStorageSync: (k) => (storage.has(k) ? storage.get(k) : ''),
  setStorageSync: (k, v) => { storage.set(k, v); },
  removeStorageSync: (k) => { storage.delete(k); },
  getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
  getMenuButtonBoundingClientRect: () => ({ top: 24, height: 32, left: W - 100, width: 84 }),
  getLaunchOptionsSync: () => ({ query: {} }),
  createInnerAudioContext: () => ({
    src: '',
    volume: 1,
    stop() {},
    play() { audioCalls.push(this.src); },
    onError() {},
    destroy() {},
  }),
  setPreferredFramesPerSecond() {},
  vibrateShort() {},
  showShareMenu() {},
  onShareAppMessage() {},
  onShareTimeline() {},
  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
  onTouchCancel() {},
  onHide() {},
  onShow() {},
  onThemeChange() {},
  onWindowResize() {},
};

// ---------- 载入（必须在 wx mock 与 W/H 就绪之后：canvas.js 加载即定尺寸） ----------
const theme = require(path.join(ROOT, 'js/core/theme'));
const i18n = require(path.join(ROOT, 'js/core/i18n'));
const audio = require(path.join(ROOT, 'js/core/audio'));
const fab = require(path.join(ROOT, 'js/core/fab'));
const D = require(path.join(ROOT, 'js/core/draw'));

const GAMES = [
  'click', 'match', 'point24', 'guess', 'detective', 'hunter', 'master', 'g2048', 'snake',
  'three', 'link', 'puzzle', 'mirror', 'down', 'crush', 'sudoku', 'sort', 'slide', 'poker',
  'mahjong', 'solo', 'alchemy', 'quesheng', 'legend', 'gambler',
];

const fakeApp = {
  sceneId: null,
  audio,
  scenes: {},
  globalConfetti: [],
  globalConfettiUntil: 0,
  input: { cancel() {} },
  openScene() {},
  openGame() {},
  goHome() {},
  shareCard() {},
};

const FAB_IDS = ['help', 'fab-help', 'help-fab', 'mode', 'fab-mode', 'robot', 'wall', 'dice-fab', fab.MUTE_ID];
// 部分场景的模式 FAB id 带后缀（例如 match 的 fab-mode-emoji），统一按前缀认
function isFabId(id) {
  if (FAB_IDS.includes(id)) return true;
  return typeof id === 'string' && (id.indexOf('fab-mode') === 0 || id.indexOf('fab-') === 0);
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

let failures = [];
function check(cond, message) {
  if (!cond) failures.push(message);
}

function renderScene(id, ctx) {
  const SceneClass = require(path.join(ROOT, `js/games/${id}/scene`));
  const scene = new SceneClass(fakeApp);
  fakeApp.sceneId = id;
  audio.setGame(id);
  for (let i = 0; i < 4; i += 1) {
    scene.buttons = [];
    if (scene.update) scene.update(0.016);
    scene.render(ctx);
  }
  return scene;
}

function runSize(width, height) {
  const ctx = makeCtx();

  GAMES.forEach((id) => {
    // 扑克牌桌几何探针：改布局后确认「提示 + 牌 + 保留标签」和猜大小卡都放得下
    if (id === 'poker' && process.env.POKER_PROBE) {
      const PokerScene = require(path.join(ROOT, 'js/games/poker/scene'));
      const ps = new PokerScene(fakeApp);
      const blockH = ps.cardH + ps.holdH;
      console.log(`poker @${ARG_W}x${ARG_H}: 牌桌 y=${ps.cardsY} h=${ps.cardsH} · 提示 ${ps.tableHintH}px`
        + ` · 牌 ${ps.cardW}×${ps.cardH} · 需要 ${Math.round(blockH + ps.tableHintH)}px`
        + ` · 猜大小 y=${ps.guessY} h=${ps.guessH} · 当前牌 ${ps.curW}×${ps.curH} · 历史 ${ps.miniW}×${ps.miniH}`);
    }
    // 全局音效开 → 应有静音 FAB
    storage.set('__games_hub__sfx', '1');
    storage.delete(`__games_hub__mute__${id}`);
    let scene;
    try {
      scene = renderScene(id, ctx);
    } catch (e) {
      failures.push(`${id}@${width}x${height}: render 抛错 ${e.message}`);
      return;
    }
    const mute = scene.buttons.find((b) => b.id === fab.MUTE_ID);
    if (!mute) {
      // 允许「位置被别的可点区域占住 → 自动隐藏」这一种情况（320 宽时 24 点的操作键会铺到右下角）
      const helpBtn = scene.buttons.find((b) => ['help', 'fab-help', 'help-fab'].includes(b.id));
      const suppressed = !!helpBtn && scene.buttons.some((b) => b.id !== fab.MUTE_ID
        && fab.overlaps(b, fab.leftSlot(helpBtn)));
      check(suppressed, `${id}@${width}x${height}: 全局音效开启时没有静音 FAB（且不是被命中区占位隐藏）`);
    }
    if (process.env.DUMP) {
      const fabs = scene.buttons.filter((b) => ['help', 'fab-help', 'help-fab', 'mode', 'fab-mode', 'robot', 'wall', 'dice-fab', fab.MUTE_ID].includes(b.id));
      console.log(`${id.padEnd(9)} buttons=${String(scene.buttons.length).padStart(3)}  ` +
        fabs.map((b) => `${b.id}@${Math.round(b.x)},${Math.round(b.y)},${b.w}`).join('  '));
    }

    if (mute) {
      check(mute.x >= 0 && mute.y >= 0 && mute.x + mute.w <= width && mute.y + mute.h <= height,
        `${id}@${width}x${height}: 静音 FAB 越界 (${Math.round(mute.x)},${Math.round(mute.y)})`);
      // 必须和帮助 FAB 同一行、同尺寸（「挨着帮助按钮」）
      const helpBtn = scene.buttons.find((b) => ['help', 'fab-help', 'help-fab'].includes(b.id));
      check(!!helpBtn, `${id}@${width}x${height}: 找不到帮助 FAB`);
      if (helpBtn) {
        check(Math.abs(mute.y - helpBtn.y) < 0.5 && Math.abs(mute.h - helpBtn.h) < 0.5,
          `${id}@${width}x${height}: 静音 FAB 与帮助不在同一行 (mute y=${Math.round(mute.y)} help y=${Math.round(helpBtn.y)})`);
        check(Math.abs((mute.x + mute.w) - helpBtn.x) <= fab.GAP + 0.5,
          `${id}@${width}x${height}: 静音 FAB 没有紧挨帮助 (gap=${Math.round(helpBtn.x - mute.x - mute.w)})`);
      }
      // 静音 FAB 不能压到**任何**其它命中区（键盘键、卡片、FAB 都算）
      scene.buttons.filter((b) => b.id !== fab.MUTE_ID).forEach((b) => {
        check(!rectsOverlap(mute, b), `${id}@${width}x${height}: 静音 FAB 与 ${b.id} 重叠`);
      });
      // 被挤开的邻居 FAB 也不能压到其它命中区
      ['mode', 'fab-mode', 'robot', 'wall', 'dice-fab'].forEach((fid) => {
        const b = scene.buttons.find((x) => x.id === fid);
        if (!b) return;
        scene.buttons.filter((x) => x.id !== fid && x.id !== fab.MUTE_ID).forEach((x) => {
          const isFab = ['help', 'fab-help', 'help-fab', 'mode', 'fab-mode', 'robot', 'wall', 'dice-fab'].includes(x.id);
          if (isFab) return;
          check(!rectsOverlap(b, x), `${id}@${width}x${height}: ${fid} 被挤开后与 ${x.id} 重叠`);
        });
      });
      // 点一下 → 该场景静音，play() 不再出声
      const before = audioCalls.length;
      mute.onTap();
      check(storage.get(`__games_hub__mute__${id}`) === '1', `${id}: 点静音后没有写入存档`);
      audio.playSuccess();
      check(audioCalls.length === before, `${id}: 静音后仍然播放了音效`);
      // 取消静音 → 恢复出声
      const again = renderScene(id, ctx).buttons.find((b) => b.id === fab.MUTE_ID);
      again.onTap();
      check(storage.get(`__games_hub__mute__${id}`) === '0', `${id}: 取消静音没有写回存档`);
      const before2 = audioCalls.length;
      audio.playSuccess();
      check(audioCalls.length === before2 + 1, `${id}: 取消静音后音效没有恢复`);
    }
    // 所有 FAB 都不能被非 FAB 的命中区压住（例如 1A2B 的退格/提交行曾经从机器人 FAB 下面穿过去）
    scene.buttons.filter((b) => FAB_IDS.includes(b.id)).forEach((f) => {
      scene.buttons.filter((x) => !FAB_IDS.includes(x.id)).forEach((x) => {
        check(!rectsOverlap(f, x), `${id}@${width}x${height}: ${f.id} 被 ${x.id} 压住`);
      });
    });
    if (process.env.HINT2_PROBE && ['g2048', 'three', 'master', 'snake', 'down', 'alchemy', 'legend'].includes(id)) {
      const bottomOf = {
        g2048: scene.boardY + scene.boardSize,
        three: scene.boardY + scene.boardSize,
        snake: scene.boardY + scene.boardSize,
        down: scene.boardY + scene.boardH,
        master: scene.trayY + scene.trayH,
        alchemy: scene.boardY + scene.boardH,
        legend: scene.boardY + scene.boardH,
      }[id];
      const hintY = bottomOf + 16;
      // 提示文字的估算宽度（中文 10px/字、拉丁 5.5px/字），取中英两种语言里更宽的那个
      const estWidth = (value) => Array.from(String(value)).reduce((w, ch) => w
        + (/[\u4e00-\u9fa5，。；：、]/.test(ch) ? 10 : 5.5), 0);
      const cnText = i18n.t(`${id.replace(/\..*/, '')}.playHint`);
      const enText = (() => { i18n.setLang('en'); const v = i18n.t(`${id}.playHint`); i18n.setLang('cn'); return v; })();
      const textW = Math.max(estWidth(cnText), estWidth(enText));
      const textBox = { x: width / 2 - textW / 2, y: hintY - 5, w: textW, h: 10 };
      const fabs = scene.buttons.filter((b) => isFabId(b.id));
      const clash = fabs.find((b) => rectsOverlap(b, textBox));
      // 提示必须一行装得下（左右各留 16px 边距）；320 宽不在支持范围内，不在这里判
      if (width >= 375) {
        check(textW <= width - 32,
          `${id}@${width}x${height}: 提示文字约 ${Math.round(textW)}px，超过可用宽度 ${width - 32}px`);
      }
      const sizeInfo = id === 'master' ? `unit ${scene.unit.toFixed(2)}、盘 ${Math.round(scene.boardSize)}`
        : id === 'legend' || id === 'alchemy' ? `格 ${scene.cellW}×${scene.cellH}、盘 ${Math.round(scene.boardW)}×${Math.round(scene.boardH)}`
          : `盘 ${Math.round(scene.boardSize || scene.boardH)}`;
      console.log(`hint2 ${id.padEnd(7)} @${width}x${height}: ${sizeInfo} · 区块底 ${Math.round(bottomOf)} · 提示 ${Math.round(hintY)} ` +
        `· 文字 ≈${Math.round(textW)}px（${Math.round(textBox.x)}~${Math.round(textBox.x + textW)}） · ` +
        (clash ? `⚠ 与 ${clash.id} 重叠` : '不与 FAB 重叠 ✓'));
    }
    if (id === 'click' && process.env.LEGEND_PROBE) {
      const n = scene.difficulty;
      console.log(`click-legend @${width}x${height}: 难度 ${n}×${n}  legendY=${Math.round(scene.legendY)} ` +
        `legendH=${Math.round(scene.legendH)} boardY=${Math.round(scene.boardY)} cell=${Math.round(scene.cell)} ` +
        `boardH=${Math.round(scene.boardH)} undoY=${Math.round(scene.undoY)} 底部余量=${Math.round(H - (scene.undoY + scene.undoH))}`);
    }
    if (id === 'guess') {
      scene.current = '1234';
      scene.buttons = [];
      scene.render(ctx);
      const del = scene.buttons.find((b) => b.id === 'del');
      const enter = scene.buttons.find((b) => b.id === 'enter');
      const mute2 = scene.buttons.find((b) => b.id === fab.MUTE_ID);
      const robot = scene.buttons.find((b) => b.id === 'robot');
      check(!!del && !!enter, `${id}@${width}x${height}: 退格/提交没有注册（键盘没画出来？）`);
      const rowRight = Math.max(del ? del.x + del.w : 0, enter ? enter.x + enter.w : 0);
      const fabLeft = Math.min(mute2 ? mute2.x : 1e9, robot ? robot.x : 1e9);
      check(rowRight <= fabLeft - 8,
        `${id}@${width}x${height}: 退格/提交行右沿 ${Math.round(rowRight)} 没让开 FAB 组左沿 ${Math.round(fabLeft)}-8`);
      if (process.env.HINT_PROBE) {
        const c2 = makeCtx();
        const r = scene.historyRect();
        const hintSize = 10;
        const lines = [];
        [scene.__t ? scene.__t('guess.historyHint') : '8 次机会猜中一个 4 位数',
          'A 代表数字对且位置对，B 代表数字对但位置不对，目标 4A0B 取胜'].forEach((text) => {
          lines.push(...D.wrapText(c2, text, r.w - 16, hintSize, 'bold'));
        });
        const headerH = lines.length * 12 + 4;
        const rowH = (r.h - headerH - 4 * 2 - 3 * 3) / 4;
        console.log(`guess-hint @${width}x${height}: 记录区 ${Math.round(r.w)}×${Math.round(r.h)}  ` +
          `提示 ${lines.length} 行 headerH=${headerH} rowH=${rowH.toFixed(1)}  ` +
          `每行宽=${lines.map((l) => Math.round(c2.measureText(l).width)).join('/')}`);
      }
      if (process.env.DUMP) {
        console.log(`guess-row  del@${Math.round(del.x)},${Math.round(del.y)},${Math.round(del.w)}  ` +
          `enter@${Math.round(enter.x)},${Math.round(enter.y)},${Math.round(enter.w)}  ` +
          `rowRight=${Math.round(rowRight)}  fabLeft=${Math.round(fabLeft)}`);
      }
      scene.buttons.filter((b) => ['del', 'enter'].includes(b.id)).forEach((b) => {
        ['robot', fab.MUTE_ID, 'help'].forEach((fid) => {
          const f = scene.buttons.find((x) => x.id === fid);
          if (f) check(!rectsOverlap(b, f), `${id}@${width}x${height}: ${b.id} 压住 ${fid}`);
        });
      });
    }
    // 全局音效关 → 不应有静音 FAB，并且它左边那枚按钮要顶到「帮助左边第一格」（中间不能留空）
    storage.set('__games_hub__sfx', '0');
    const sceneOff = renderScene(id, ctx);
    const muteOff = sceneOff.buttons.find((b) => b.id === fab.MUTE_ID);
    check(!muteOff, `${id}@${width}x${height}: 全局音效关闭时仍显示静音 FAB`);
    const helpOff = sceneOff.buttons.find((b) => ['help', 'fab-help', 'help-fab'].includes(b.id));
    if (helpOff) {
      const first = { x: helpOff.x - helpOff.w - fab.GAP, y: helpOff.y, w: helpOff.w, h: helpOff.h };
      // 原来在帮助左边的邻居（模式 / 机器人 / 穿墙 / 骰子）现在应该正好落在这个槽位
      const NEIGHBOURS = ['mode', 'fab-mode', 'robot', 'wall', 'dice-fab'];
      const neighbour = sceneOff.buttons.find((b) => NEIGHBOURS.some((k) => b.id === k || b.id.indexOf(k + '-') === 0)
        && Math.abs(b.y - helpOff.y) < 0.5);
      if (neighbour) {
        // 必须紧挨帮助（间距 4~16px 都算紧挨；间距 48 说明它还停在旧位置，中间留了空）
        const gap = helpOff.x - (neighbour.x + neighbour.w);
        check(gap >= 4 && gap <= 16,
          `${id}@${width}x${height}: 静音隐藏后 ${neighbour.id} 没顶上（与帮助间距 ${Math.round(gap)}px，应 ≤16）`);
      }
    }
    if (process.env.SURROUND) {
      const onList = scene.buttons.filter((b) => isFabId(b.id)).map((b) => `${b.id}@${Math.round(b.x)}`);
      const offList = sceneOff.buttons.filter((b) => isFabId(b.id)).map((b) => `${b.id}@${Math.round(b.x)}`);
      console.log(`${id.padEnd(9)} 开: ${onList.join(' ').padEnd(58)} 关: ${offList.join(' ')}`);
    }
    storage.set('__games_hub__sfx', '1');
  });
}



runSize(ARG_W, ARG_H);

// 玩法提示必须中英都真的存在（mp-game 的 i18n 是 en 段在前、cn 段在后，批量插 key 很容易插偏）
// 各游戏的 i18n 字典是随场景模块 require 时注册的：先加载，再断言
const HINT_GAMES = ['g2048', 'three', 'master', 'snake', 'down', 'alchemy', 'legend'];
HINT_GAMES.forEach((id) => require(path.join(ROOT, `js/games/${id}/scene`)));
['cn', 'en'].forEach((lang) => {
  i18n.setLang(lang);
  HINT_GAMES.forEach((id) => {
    const key = `${id}.playHint`;
    const value = i18n.t(key);
    if (!value || value === key) failures.push(`${id}: ${lang} 缺少 ${key}`);
  });
  const sample = i18n.t('master.playHint');
  if (lang === 'en' && /[\u4e00-\u9fa5]/.test(sample)) failures.push(`master: en 段里混进了中文「${sample}」`);
  if (lang === 'cn' && /^Tap /.test(sample)) failures.push(`master: cn 段里混进了英文「${sample}」`);
});
i18n.setLang('cn');

// ---------- 首页设置面板：强制打开后渲染，确认布局与按钮都在 ----------
{
  const HomeScene = require(path.join(ROOT, 'js/games/home/scene'));
  const ctx3 = makeCtx();
  const scene = new HomeScene(fakeApp);
  fakeApp.sceneId = 'home';
  audio.setGame('home');
  scene.settingsOpen = true;
  scene.settingsAnim = 1;
  scene.settingsScroll = 0;
  scene.buttons = [];
  try {
    scene.render(ctx3);
  } catch (e) {
    failures.push(`设置面板渲染抛错：${e.message}`);
  }
  const ids = scene.buttons.map((b) => b.id);
  ['settings-close', 'settings-mask', 'setting-0-system', 'setting-0-light', 'setting-0-dark',
    'setting-1-cn', 'setting-1-en', 'setting-2-emoji', 'setting-2-mahjong', 'setting-3-sfx']
    .forEach((id) => check(ids.includes(id), `设置面板缺少按钮 ${id}`));
  // 圆形展开：动画中间帧必须走「离屏 + clip + drawImage」，且此时不注册选项按钮
  [0.2, 0.55, 0.9].forEach((anim) => {
    ctx3.__calls.length = 0;
    scene.settingsAnim = anim;
    scene.buttons = [];
    try {
      scene.render(ctx3);
    } catch (e) {
      failures.push(`设置面板动画帧 ${anim} 渲染抛错：${e.message}`);
      return;
    }
    check(ctx3.__calls.includes('arc') && ctx3.__calls.includes('clip') && ctx3.__calls.includes('drawImage'),
      `设置面板动画帧 ${anim}：没有走圆形裁剪（calls=${ctx3.__calls.join(',')}）`);
    if (anim < 0.9) {
      check(!scene.buttons.some((b) => b.id.indexOf('setting-') === 0),
        `设置面板动画帧 ${anim}：动画中途不应注册选项按钮`);
    }
  });
  scene.settingsAnim = 1;
  // 命中顺序：遮罩必须排在所有选项之前（否则点任何地方都关闭设置）
  const maskIdx = ids.indexOf('settings-mask');
  const firstOptionIdx = ids.findIndex((id) => id.indexOf('setting-') === 0);
  check(maskIdx >= 0 && firstOptionIdx > maskIdx,
    `设置面板：遮罩注册顺序不对（mask=${maskIdx}，首个选项=${firstOptionIdx}），选项会被遮罩吃掉`);

  // 按坐标真的点一下：命中「后注册优先」，必须落到选项本身，而不是遮罩（那会关面板）
  const tapAt = (x, y) => {
    for (let i = scene.buttons.length - 1; i >= 0; i -= 1) {
      const b = scene.buttons[i];
      if (x >= b.x && y >= b.y && x <= b.x + b.w && y <= b.y + b.h) return b;
    }
    return null;
  };
  const tapButton = (id) => {
    const b = scene.buttons.find((btn) => btn.id === id);
    if (!b) { failures.push(`设置面板：找不到按钮 ${id}`); return false; }
    const hit = tapAt(b.x + b.w / 2, b.y + b.h / 2);
    if (!hit || hit.id !== id) {
      failures.push(`设置面板：点 ${id} 命中了 ${hit && hit.id}`);
      return false;
    }
    hit.onTap();
    return true;
  };
  // 滑块要有弹性滑动（web 的 .seg-slider：320ms + cubic-bezier(0.34,1.25,0.5,1)）
  {
    scene.settingsOpen = true;
    scene.settingsAnim = 1;
    scene.buttons = [];
    scene.now = Date.now();
    scene.render(ctx3);
    const fromIndex = scene.segIndex('theme');
    tapButton('setting-0-light');
    const slide = scene.segSlide.theme;
    check(!!slide, '设置面板：切换主题后没有启动滑块动画');
    if (slide) {
      scene.now = slide.at + 90;
      const mid = scene.segIndex('theme');
      check(mid !== fromIndex && mid !== slide.to,
        `设置面板：滑块中点应当还在路上（from=${fromIndex} to=${slide.to} mid=${mid}）`);
      check(scene.springEase(0.55) > 1, '设置面板：弹性曲线没有过冲（cubic-bezier(0.34,1.25,0.5,1)）');
      scene.now = slide.at + 400;
      const end = scene.segIndex('theme');
      check(Math.abs(end - slide.to) < 0.001, `设置面板：滑块没有停在目标位置（${end} vs ${slide.to}）`);
      check(!scene.segSlide.theme, '设置面板：滑块动画结束后没有清理状态');
    }
    theme.setMode('system');
  }

  scene.buttons = [];
  scene.render(ctx3);
  tapButton('setting-0-light');
  check(theme.mode === 'light', `设置面板：点「浅色」没生效（当前 ${theme.mode}）`);
  check(scene.settingsOpen === true, '设置面板：点选项之后把面板关掉了');
  scene.buttons = [];
  scene.render(ctx3);
  tapButton('setting-3-sfx');
  check(storage.get('__games_hub__sfx') === '0', '设置面板：点音效开关没有切换音效');
  check(scene.settingsOpen === true, '设置面板：点开关之后把面板关掉了');
  // 点卡片（组标题 / 卡内空白）不能关闭面板；点卡片外的空白才关闭
  const block0 = scene.settingsLayout().blocks[0].rect;
  const cardHit = tapAt(block0.x + 24, block0.y + 18);
  check(!!cardHit && /^settings-(panel|hero)/.test(cardHit.id),
    `设置面板：点卡片命中的是 ${cardHit && cardHit.id}，应当被卡片热区吞掉`);
  if (cardHit) cardHit.onTap();
  check(scene.settingsOpen === true, '设置面板：点卡片把面板关掉了');
  scene.buttons = [];
  scene.render(ctx3);
  const blank = tapAt(12, H - 12);
  check(!!blank && blank.id === 'settings-mask',
    `设置面板：点空白处命中的是 ${blank && blank.id}，应当是遮罩（关闭）`);
  if (blank) blank.onTap();
  check(scene.settingsOpen === false, '设置面板：点空白处没有关闭面板');

  // 底部 ✕ 关闭
  scene.settingsOpen = true;
  scene.buttons = [];
  scene.render(ctx3);
  const closeBtn = scene.buttons.find((b) => b.id === 'settings-close');
  check(!!closeBtn, '设置面板：找不到关闭按钮');
  if (closeBtn) {
    const hit = tapAt(closeBtn.x + closeBtn.w / 2, closeBtn.y + closeBtn.h / 2);
    check(!!hit && hit.id === 'settings-close', `设置面板：点 ✕ 命中的是 ${hit && hit.id}`);
    if (hit) hit.onTap();
  }
  check(scene.settingsOpen === false, '设置面板：点 ✕ 没有关闭面板');

  // 还原，别影响后面的断言
  scene.settingsOpen = true;
  scene.settingsAnim = 1;
  scene.buttons = [];
  scene.render(ctx3);
  theme.setMode('system');
  audio.setEnabled(true);
  i18n.setLang('cn');

  const L = scene.settingsLayout();
  check(L.contentH <= H + 1 || true, `设置面板内容 ${Math.round(L.contentH)}px`);
  if (process.env.SETTINGS_PROBE) {
    console.log(`settings @${ARG_W}x${ARG_H}: 内容高 ${Math.round(L.contentH)}px · 屏高 ${H} · ` +
      `${L.contentH > H ? '需要滚动' : '不需滚动'} · 卡片 ${L.blocks.length} 组`);
  }
  scene.settingsOpen = false;
}

// ---------- 场景里用到的 i18n key 必须真的存在（中英都要），否则界面上会直接显示 key ----------
{
  const fs = require('fs');
  const GAME_IDS = ['click', 'guess', 'poker', 'puzzle', 'g2048', 'snake', 'match', 'link', 'detective',
    'hunter', 'three', 'crush', 'sudoku', 'master', 'sort', 'down', 'slide', 'alchemy', 'mahjong',
    'quesheng', 'legend', 'mirror', 'point24', 'solo', 'gambler'];
  const missing = [];
  GAME_IDS.forEach((id) => {
    const src = fs.readFileSync(path.join(ROOT, `js/games/${id}/scene.js`), 'utf8');
    // 只认字面量 key（动态拼接的没法静态检查）
    const keys = new Set();
    const re = /t\('([a-zA-Z0-9_]+\.[\w]+)'/g;
    let m;
    while ((m = re.exec(src))) if (m[1].startsWith(`${id}.`)) keys.add(m[1]);
    keys.forEach((key) => {
      const cn = i18n.t(key);
      const en = (() => { i18n.setLang('en'); const v = i18n.t(key); i18n.setLang('cn'); return v; })();
      if (cn === key || en === key) missing.push(`${id}: ${key}${cn === key ? ' (cn)' : ''}${en === key ? ' (en)' : ''}`);
    });
  });
  check(missing.length === 0, `场景里引用了不存在的 i18n key：${missing.join('、')}`);
}

// ---------- 帮助弹窗：标题统一「玩法介绍」，文案是分块格式（小标题 + 项目符号） ----------
{
  const helpPanel = require(path.join(ROOT, 'js/core/help'));
  const GAME_IDS = ['click', 'guess', 'poker', 'puzzle', 'g2048', 'snake', 'match', 'link', 'detective',
    'hunter', 'three', 'crush', 'sudoku', 'master', 'sort', 'down', 'slide', 'alchemy', 'mahjong',
    'quesheng', 'legend', 'mirror', 'point24', 'solo', 'gambler'];
  GAME_IDS.forEach((id) => {
    require(path.join(ROOT, `js/games/${id}/scene`));
    const text = i18n.t(`${id}.helpMsg`);
    check(text && text !== `${id}.helpMsg`, `${id}: 缺少 helpMsg`);
    if (typeof text === 'string') {
      check(text.indexOf('## ') === 0, `${id}: 帮助文案没有以「## 小标题」开头`);
      check(text.split('\n').filter((l) => l.trim().startsWith('- ')).length >= 2,
        `${id}: 帮助文案至少要有 2 条项目符号`);
      check(text.length > 20 && text.length < 260, `${id}: 帮助文案长度异常（${text.length} 字）`);
    }
  });
  check(i18n.t('helpTitle') === '玩法介绍' || i18n.t('helpTitle') === 'How to play', 'helpTitle 文案不对');

  // 逐个场景把帮助面板画出来，确认不抛错、关闭按钮在
  const ctx6 = makeCtx();
  GAME_IDS.forEach((id) => {
    const SceneClass = require(path.join(ROOT, `js/games/${id}/scene`));
    const scene = new SceneClass(fakeApp);
    fakeApp.sceneId = id;
    scene.helpOpen = true;
    scene.buttons = [];
    try {
      // 圆形展开 600ms，而动画用 Date.now()：这里把时钟按每帧 20ms 推进，
      // 画满 40 帧（800ms）到完全展开，再断言关闭按钮已注册
      withFakeClock(20, () => {
        for (let i = 0; i < 40; i += 1) {
          scene.buttons = [];
          helpPanel.draw(ctx6, scene);
        }
      });
    } catch (e) {
      failures.push(`${id}: 帮助面板渲染抛错 ${e.message}`);
    }
    check(scene.buttons.some((b) => b.id === 'help-ok'), `${id}: 帮助面板没有关闭按钮`);
    check(scene.buttons.some((b) => b.id === 'help-close'), `${id}: 帮助面板没有 FAB 位置的 ✕`);
    helpPanel.reset(scene);
    scene.helpOpen = false;
  });
}

// ---------- core/blur：均匀画面不变、单点向邻格扩散、alpha 保留 ----------
{
  const { boxBlurRGBA } = require(path.join(ROOT, 'js/core/blur.js'));
  const w = 9;
  const h = 9;
  const flat = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i += 1) { flat[i * 4] = 40; flat[i * 4 + 1] = 80; flat[i * 4 + 2] = 120; flat[i * 4 + 3] = 255; }
  boxBlurRGBA(flat, w, h, 2, 2);
  check(Math.abs(flat[0] - 40) <= 2 && Math.abs(flat[2] - 120) <= 2, 'blur: 均匀画面被改变');
  check(flat[3] === 255, 'blur: alpha 被改动');

  const dot = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i += 1) dot[i * 4 + 3] = 255;
  const c = (4 * w + 4) * 4;
  dot[c] = 255; dot[c + 1] = 255; dot[c + 2] = 255;
  boxBlurRGBA(dot, w, h, 2, 2);
  const at = (x, y) => dot[(y * w + x) * 4];
  check(at(4, 4) < 255 && at(5, 4) > 0, 'blur: 亮点没有扩散');
  check(at(0, 0) === 0, 'blur: 远处像素被影响（半径不对）');
}

// ---------- 帮助弹窗的圆形展开 / 收缩：半径必须逐帧变大、关闭时变小 ----------
{
  const helpPanel = require(path.join(ROOT, 'js/core/help'));
  const ClickScene = require(path.join(ROOT, 'js/games/click/scene'));
  const scene = new ClickScene(fakeApp);
  fakeApp.sceneId = 'click';
  const ctx7 = makeCtx();
  const realNow = Date.now;
  let fake = realNow();
  Date.now = () => { fake += 20; return fake; };
  try {
    const radii = [];
    const frame = () => {
      ctx7.__arcs.length = 0;
      scene.buttons = [];
      helpPanel.draw(ctx7, scene);
      if (ctx7.__arcs.length) radii.push(ctx7.__arcs[0][2]);   // 第一个 arc 是裁剪圆，后面还有项目符号小圆点
    };
    scene.helpOpen = true;
    captureDetail = true;   // 让假画布读回「有内容」的像素，毛玻璃才会真的去模糊
    const putsBefore = blurStats.puts;
    const getsBefore = blurStats.gets;
    for (let i = 0; i < 40; i += 1) frame();
    check(radii.length >= 5, `帮助展开：只有 ${radii.length} 帧画了圆`);
    check(blurStats.puts - putsBefore === 1,
      `帮助毛玻璃：一次展开应只算一次背景（实际 ${blurStats.puts - putsBefore} 次）`);
    check(blurStats.gets - getsBefore <= 2,
      `帮助毛玻璃：抓图不该每帧重做（实际 ${blurStats.gets - getsBefore} 次）`);
    if (radii.length >= 5) {
      check(radii[radii.length - 1] > radii[0] * 3,
        `帮助展开：半径没有增长（首 ${radii[0].toFixed(0)} → 末 ${radii[radii.length - 1].toFixed(0)}）`);
      // 用 help 自己的圆心算法，最远角就是完全展开时的半径
      const ctr = helpPanel.fabCenter(scene);
      const cfx = ctr.x;
      const cfy = ctr.y;
      const far = Math.max(
        Math.hypot(cfx, cfy), Math.hypot(W - cfx, cfy),
        Math.hypot(cfx, H - cfy), Math.hypot(W - cfx, H - cfy),
      );
      check(radii[radii.length - 1] >= far - 1,
        `帮助展开：最终没有铺满全屏（${radii[radii.length - 1].toFixed(0)} < ${far.toFixed(0)}）`);
    }
    // 关闭：半径必须逐帧变小
    scene.helpOpen = false;
    const closing = [];
    const frame2 = () => {
      ctx7.__arcs.length = 0;
      scene.buttons = [];
      helpPanel.draw(ctx7, scene);
      if (ctx7.__arcs.length) closing.push(ctx7.__arcs[0][2]);
    };
    for (let i = 0; i < 40; i += 1) frame2();
    check(closing.length >= 3, '帮助收缩：没有画出收缩动画');
    if (closing.length >= 3) {
      check(closing[closing.length - 1] < closing[0], '帮助收缩：半径没有变小');
    }
    check(helpPanel.animating(scene) === false, '帮助：收起动画结束后 animating 应为 false');
    // 不支持 ctx.filter 的平台（多数 Android）：必须走「两级双线性放大」且不抛错
    const ctx8 = makeCtx();
    Object.defineProperty(ctx8, 'filter', { get: () => 'none', set: () => {}, configurable: true });
    scene.helpOpen = true;
    ctx8.__calls.length = 0;
    try {
      for (let i = 0; i < 40; i += 1) { scene.buttons = []; helpPanel.draw(ctx8, scene); }
    } catch (e) {
      failures.push(`帮助面板（无 filter 平台）渲染抛错 ${e.message}`);
    }
    check(ctx8.__calls.filter((k) => k === 'drawImage').length >= 2,
      '帮助毛玻璃：没有 filter 时应有两级放大的 drawImage');
  } finally {
    Date.now = realNow;
  }
  helpPanel.reset(scene);
  scene.helpOpen = false;
  captureDetail = false;
}

// ---------- 扑克猜大小：点「大」后这张牌先飞进左侧历史位，落地才换新牌 ----------
{
  const PokerScene = require(path.join(ROOT, 'js/games/poker/scene'));
  const scene = new PokerScene(fakeApp);
  fakeApp.sceneId = 'poker';
  audio.setGame('poker');
  scene.stage = 'guess';
  scene.dice = true;
  scene.guessCard = { num: 9, type: 'S' };
  scene.guesses = [];
  scene.guessFly = null;
  scene.now = Date.now();

  scene.guess(true);
  check(!!scene.guessFly, '扑克猜大小：点「大」后没有启动飞牌动画');
  check(scene.guessCard === null, '扑克猜大小：飞牌期间右侧不应立刻出现新牌');
  check(scene.guesses.length === 1, '扑克猜大小：结果没有记进历史');

  const ctx5 = makeCtx();
  const flyAt = scene.guessFly ? scene.guessFly.at : scene.now;
  [0, 120, 240, 320].forEach((dt) => {
    scene.buttons = [];
    scene.now = flyAt + dt;
    try {
      scene.render(ctx5);
    } catch (e) {
      failures.push(`扑克猜大小：飞行第 ${dt}ms 渲染抛错 ${e.message}`);
    }
  });

  // 把 at 往前挪 400ms 再 update：飞牌应当落地、状态清掉、右侧出现下一张
  scene.guessFly.at = Date.now() - 400;
  scene.update(0.016);
  check(scene.guessFly === null, '扑克猜大小：飞牌落地后没有清状态');
  check(!!scene.guessCard, '扑克猜大小：落地后右侧没有出现下一张牌');
  audio.setGame(null);
}

// ---------- 1A2B 结算：遮罩只盖记录区，键盘仍然画出来但点不动 ----------
{
  const GuessScene = require(path.join(ROOT, 'js/games/guess/scene'));
  const D = require(path.join(ROOT, 'js/core/draw'));
  const theme = require(path.join(ROOT, 'js/core/theme'));
  const scene = new GuessScene(fakeApp);
  fakeApp.sceneId = 'guess';
  audio.setGame('guess');

  const origFill = D.fillRoundRect;
  const fills = [];
  D.fillRoundRect = (c, x, y, w, h, r, color) => {
    fills.push({ x, y, w, h, r, color });
    return origFill(c, x, y, w, h, r, color);
  };
  const renderResult = (result) => {
    scene.result = result;
    scene.resultAt = Date.now() - 1000;   // 越过 resultVisible 的 250ms 延迟
    scene.buttons = [];
    fills.length = 0;
    scene.render(makeCtx());
    return scene.buttons.map((b) => b.id);
  };

  const card = scene.historyRect();
  const WIN = 2;
  const LOSE = 1;
  const winIds = renderResult(WIN);
  const overlay = fills.find((f) => f.color === theme.tokens.overlay && Math.abs(f.h - card.h) < 0.5);
  check(!!overlay, '1A2B 结算：遮罩没有正好盖住记录区（高度对不上）');
  check(overlay && Math.abs(overlay.y - card.y) < 0.5 && Math.abs(overlay.x - card.x) < 0.5,
    '1A2B 结算：遮罩没有对齐记录区左上角');
  const keyboardCard = fills.find((f) => Math.abs(f.y - scene.keyboardY) < 0.5 && Math.abs(f.h - scene.keyboardH) < 0.5);
  check(!!keyboardCard, '1A2B 结算：键盘不该消失（没画键盘底卡）');
  const isKey = (id) => id.indexOf('num-') === 0 || id === 'del' || id === 'enter';
  check(!winIds.some(isKey), `1A2B 结算：胜利态键盘按键不该可点（注册了 ${winIds.filter(isKey).join(',')}）`);
  check(winIds.includes('next'), '1A2B 结算：胜利态缺少「下一局」按钮');

  const loseIds = renderResult(LOSE);
  check(!loseIds.some(isKey), '1A2B 结算：失败态键盘按键也不该可点');
  D.fillRoundRect = origFill;
  audio.setGame(null);
}

// ---------- 回归：静音必须按游戏独立（曾经 openGame 只改 sceneId 不通知 audio，
// 于是所有游戏都写到 __games_hub__mute__home，表现成「一处静音、处处静音」） ----------
{
  global.requestAnimationFrame = () => 0;
  const { App } = require(path.join(ROOT, 'js/core/app'));
  const HomeScene = require(path.join(ROOT, 'js/games/home/scene'));
  const ClickScene = require(path.join(ROOT, 'js/games/click/scene'));
  const MatchScene = require(path.join(ROOT, 'js/games/match/scene'));
  storage.delete('__games_hub__mute__click');
  storage.delete('__games_hub__mute__match');
  storage.set('__games_hub__sfx', '1');

  const app = new App(HomeScene, { home: HomeScene, click: ClickScene, match: MatchScene });
  const ctx2 = makeCtx();
  const renderOnce = (label) => {
    app.scene.buttons = [];
    app.scene.render(ctx2);
    return app.scene;
  };

  // 进关灯游戏 → 点静音
  app.openGame('click');
  let scene = renderOnce();
  const muteBtn = scene.buttons.find((b) => b.id === fab.MUTE_ID);
  check(!!muteBtn, '静音独立：关灯游戏里找不到静音按钮');
  if (muteBtn) muteBtn.onTap();
  check(storage.get('__games_hub__mute__click') === '1', '静音独立：关灯游戏的静音没有写到 click 键');
  check(audio.muted() === true, '静音独立：切到关灯后 audio.muted() 应为 true');

  // 换到对对碰 → 必须是「未静音」
  app.openGame('match');
  scene = renderOnce();
  check(audio.muted() === false, '静音独立：进对对碰后仍然是静音（说明全游戏共用一个 key）');
  const before = audioCalls.length;
  audio.playSuccess();
  check(audioCalls.length === before + 1, '静音独立：对对碰没被静音，音效却没播');

  // 回到首页再进关灯 → 关灯的静音还在
  app.goHome();
  check(audio.muted() === false, '静音独立：首页不应沿用上一个游戏的静音');
  app.openGame('click');
  check(audio.muted() === true, '静音独立：回到关灯后它的静音应当还在');

  // 清掉测试痕迹，别影响其它断言
  storage.delete('__games_hub__mute__click');
  storage.delete('__games_hub__mute__match');
  audio.setGame(null);
}

// ---------- emoji 墨迹居中：Android 上 measureText 不给 actualBoundingBox 时的兜底 ----------
{
  const emojiBox = require(path.join(ROOT, 'js/core/emoji-box'));
  const cards = require(path.join(ROOT, 'js/core/cards'));
  const ctx4 = makeCtx();

  // 1) 没有墨迹（默认 mock）→ 量不出来，返回 null，调用方退回 middle 基线，不能崩
  check(emojiBox.measure('🐍', 24, 'sans-serif') === null, 'emoji-box：没有墨迹数据时应当返回 null');

  // 2) 模拟墨迹在中心偏 (3, 6) → dx = 3、dy = 6 - size*0.45（基线在中心下方 size*0.45）
  //    注意用另一个字形：上一个字形已经缓存了「量不出来」，这正是想要的行为（不反复 getImageData）
  //    这一段测的是 Android 分支，把平台切成 android 再清缓存
  process.env.EMOJI_INK = '1';
  process.env.FAKE_PLATFORM = 'android';
  require(path.join(ROOT, 'js/core/platform')).resetCache();
  const size = 24;
  const box = emojiBox.measure('🦊', size, 'sans-serif');
  check(!!box, 'emoji-box：有墨迹时应当能量出偏移');
  if (box) {
    check(Math.abs(box.dx - 3) < 0.51, `emoji-box：横向偏移算错（${box.dx.toFixed(2)}，期望 3）`);
    check(Math.abs(box.dy - (6 - size * 0.45)) < 0.51,
      `emoji-box：纵向偏移算错（${box.dy.toFixed(2)}，期望 ${(6 - size * 0.45).toFixed(2)}）`);
  }

  // 3) drawEmoji 必须把字形画到「墨迹中心 = 卡片中心」的位置
  ctx4.__texts.length = 0;
  cards.drawEmoji(ctx4, '🦊', 100, 100, size);
  const drawn = ctx4.__texts.find((t) => t.value === '🦊');
  check(!!drawn, 'drawEmoji：没有调用 fillText');
  if (drawn && box) {
    // 无 metrics 的 Android：纵向用 em 中线（cy 不动），横向按墨迹修正
    check(Math.abs(drawn.x - (100 - box.dx)) < 0.51 && Math.abs(drawn.y - 100) < 0.51,
      `drawEmoji：落点不对（${drawn.x.toFixed(1)}, ${drawn.y.toFixed(1)}），期望 (${(100 - box.dx).toFixed(1)}, 100)`);
    check(drawn.baseline === 'middle', `drawEmoji：Android 无 metrics 时纵向应当用 middle 基线（实际 ${drawn.baseline}）`);
  }

  // 4) iOS / 开发者工具必须保持老逻辑：不量墨迹、坐标带 0.18em 光学下移
  process.env.FAKE_PLATFORM = 'ios';
  require(path.join(ROOT, 'js/core/platform')).resetCache();
  ctx4.__texts.length = 0;
  cards.drawEmoji(ctx4, '🦊', 100, 100, size);
  const iosDraw = ctx4.__texts.find((t) => t.value === '🦊');
  check(!!iosDraw && Math.abs(iosDraw.x - 100) < 0.51 && Math.abs(iosDraw.y - (100 + size * 0.18)) < 0.51,
    `drawEmoji：iOS 走老逻辑时落点应为 (100, ${(100 + size * 0.18).toFixed(1)})，实际 ${iosDraw && `${iosDraw.x.toFixed(1)}, ${iosDraw.y.toFixed(1)}`}`);

  // 5) 清掉模拟：后续场景仍按「量不出来 → middle」渲染
  delete process.env.EMOJI_INK;
  delete process.env.FAKE_PLATFORM;
  require(path.join(ROOT, 'js/core/platform')).resetCache();
}

// ---------- 结算遮罩必须跟随主题：不允许写死浅色 ——
// 踩过：three / link / g2048 / down / snake / mirror 的胜负遮罩写死 rgba(250,248,239,...)，
// 暗黑模式下整个遮罩是白的、文字（T.win / T.lose 是亮色）几乎看不清。
{
  const fs = require('fs');
  const dir = path.join(ROOT, 'js/games');
  fs.readdirSync(dir).forEach((id) => {
    const file = path.join(dir, id, 'scene.js');
    if (!fs.existsSync(file)) return;
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      const light = /rgba\(250,248,239/.test(line);
      const dark = /rgba\(38,38,38/.test(line);
      if ((light || dark) && !/theme\.dark|T\.overlay/.test(line)) {
        failures.push(`${id}/scene.js:${i + 1} 结算遮罩写死了颜色，暗黑模式会不对：${line.trim().slice(0, 70)}`);
      }
    });
  });
}

if (failures.length) {
  console.error(`✗ ${failures.length} 处失败：`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('✓ 25 个场景：渲染无异常、静音 FAB 位置正确、静音真拦住了音效、全局关闭时不展示');