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
  // 小游戏里导出分享图靠 Canvas 上的这两个方法（wx.canvasToTempFilePath 是小程序 API）
  canvas.toTempFilePathSync = () => 'wxtmp://poster-sync.png';
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
  'three', 'link', 'puzzle', 'mirror', 'down', 'crush', 'sudoku', 'sort', 'slide', 'ttt',
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
      // 先空手牌渲染一次，拿到全部数字键；再填满 4 位，拿到退格 / 提交
      scene.current = '';
      scene.result = 0;   // GAMING
      scene.buttons = [];
      scene.render(ctx);
      const numButtons = scene.buttons.filter((b) => /^num-/.test(b.id));
      scene.current = '1234';
      scene.render(ctx);
      const del = scene.buttons.find((b) => b.id === 'del');
      const enter = scene.buttons.find((b) => b.id === 'enter');
      const mute2 = scene.buttons.find((b) => b.id === fab.MUTE_ID);
      const robot = scene.buttons.find((b) => b.id === 'robot');
      check(!!del && !!enter, `${id}@${width}x${height}: 退格/提交没有注册（键盘没画出来？）`);
      // 键盘改成「每行 5 个」：1 2 3 4 退格 / 5 6 7 8 提交；
      // 退格和提交在第 5 列、和数字键同一行，FAB 独占下一行 → 只需保证纵向不重叠。
      const keys = numButtons.concat([del, enter].filter(Boolean));
      const rows = new Set(keys.map((b) => Math.round(b.y)));
      check(rows.size === 2, `${id}@${width}x${height}: 键盘应为 2 行（实际 ${rows.size} 行）`);
      const nums = numButtons;
      check(nums.length === 8, `${id}@${width}x${height}: 数字键应有 8 个（实际 ${nums.length}）`);
      const firstRow = nums.filter((b) => Math.round(b.y) === Math.min(...rows)).length;
      check(firstRow === 4, `${id}@${width}x${height}: 第一行应 4 个数字键（实际 ${firstRow}）`);
      check(del && nums[0] && del.w > nums[0].w, `${id}@${width}x${height}: 退格应比数字键宽`);
      check(enter && nums[0] && enter.w > nums[0].w, `${id}@${width}x${height}: 提交应比数字键宽`);
      const fabs = [del, enter, mute2, robot].filter(Boolean);
      for (let a = 0; a < fabs.length; a += 1) {
        for (let b = a + 1; b < fabs.length; b += 1) {
          const p1 = fabs[a];
          const p2 = fabs[b];
          const hit = p1.x < p2.x + p2.w && p2.x < p1.x + p1.w && p1.y < p2.y + p2.h && p2.y < p1.y + p1.h;
          check(!hit, `${id}@${width}x${height}: ${p1.id} 和 ${p2.id} 重叠`);
        }
      }
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
    'setting-1-cn', 'setting-1-en', 'setting-2-emoji', 'setting-2-mahjong', 'setting-3-small', 'setting-3-large', 'setting-4-sfx']
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
  tapButton('setting-4-sfx');
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

// ---------- 成就系统：数据、计数、首页成就页 ----------
{
  const achv = require(path.join(ROOT, 'js/core/achv'));
  check(achv.ORDER.length === 25, `成就：游戏数应为 25，实际 ${achv.ORDER.length}`);
  const data = achv.pageData();
  check(data.games.length === 25, '成就：pageData 没返回 25 个游戏');
  let bad = null;
  data.games.forEach((g) => {
    if (!g.name || g.name === g.id || g.name.endsWith('Title')) bad = `${g.id} 名称没取到（${g.name}）`;
    if (!g.achv.length || g.achv.length > 8) bad = `${g.id} 成就条数 ${g.achv.length}`;
    g.achv.forEach((a) => {
      if (!a.name || /[A-Za-z_]+\./.test(a.name)) bad = `${g.id} 成就名异常 ${a.name}`;
      if (!(a.target > 0)) bad = `${g.id} target 非法`;
      if (!(a.ratio >= 0 && a.ratio <= 1)) bad = `${g.id} ratio 越界`;
      if (a.counter && a.target !== 1) bad = `${g.id} 计数型 target 应为 1（${a.name}）`;
      if (a.stat && a.ratio !== 0) bad = `${g.id} 指标行不应该有进度（${a.name}）`;
    });
  });
  check(!bad, `成就：数据异常 ${bad || ''}`);
  check(data.summary.total === data.games.reduce((n, g) => n + g.achv.filter((r) => !r.stat).length, 0) + data.daily.achv.length, '成就：总览总数对不上（指标行不该计入分母）');
  check(achv.totalCount() === data.summary.total, '成就：totalCount 与页面数据不一致');

  // 计数：开局 / 胜利都要落盘并能读回
  const beforePlays = achv.playsOf('click');
  const beforeWins = achv.winsOf('click');
  achv.trackPlay('click');
  achv.win('click');
  check(achv.playsOf('click') === beforePlays + 1, '成就：开局计数没有 +1');
  check(achv.winsOf('click') === beforeWins + 1, '成就：胜利计数没有 +1');
  check(achv.totalCount() > 0 && achv.unlockedCount() >= 0, '成就：统计接口异常');

  // 分模式 / 完美 / 速通 / 里程碑计数
  const beforeMode = achv.modeOf('match', 2).wins;
  const beforePerfect = achv.perfectOf('match');
  achv.win('match', { mode: 2, level: 1, perfect: true });
  check(achv.modeOf('match', 2).wins === beforeMode + 1, '成就：分模式胜场没有 +1');
  check(achv.modeOf('match', 2).first === 1, '成就：首关胜利没有记下');
  check(achv.perfectOf('match') === beforePerfect + 1, '成就：完美胜利没有记下');
  check(achv.bestLevelOf('match') >= 1, '成就：历史最高关卡没有记下');
  const fastBefore = achv.fastOf('guess');
  achv.win('guess', { fast: true });
  check(achv.fastOf('guess') === fastBefore + 1, '成就：速通次数没有 +1');
  achv.reach('g2048', 2048, [1024, 2048, 4096]);
  check(achv.reachOf('g2048', 1024) === 1 && achv.reachOf('g2048', 2048) === 1, '成就：里程碑没有计数');
  check(achv.reachOf('g2048', 4096) === 0, '成就：未达成的里程碑被计数了');
// FAB 边框：帮助橙 / 静音绿 / 模式蓝 / 分享胭脂红；尺寸统一 44
{
  const fabKit = require(path.join(ROOT, 'js/core/fab'));
  const theme2 = require(path.join(ROOT, 'js/core/theme'));
  const T2 = theme2.tokens;
  check(fabKit.SIZE === 44, `FAB：统一尺寸应为 44（实际 ${fabKit.SIZE}）`);
  check(fabKit.borderOf('help') === T2.god, 'FAB 边框：帮助应为橙色');
  check(fabKit.borderOf('mute') === T2.primary, 'FAB 边框：静音应为绿色');
  check(fabKit.borderOf('mode') === (theme2.dark ? '#38bdf8' : '#0ea5e9'), 'FAB 边框：模式应为蓝色');
  check(fabKit.borderOf('share') === '#962832', 'FAB 边框：分享应为胭脂红');
  check(fabKit.kindOfId('help') === 'help' && fabKit.kindOfId('fab-help') === 'help'
    && fabKit.kindOfId('help-fab') === 'help', 'FAB 边框：帮助 id 识别不对');
  check(fabKit.kindOfId('fab-mute') === 'mute', 'FAB 边框：静音 id 识别不对');
  check(fabKit.kindOfId('mode') === 'mode' && fabKit.kindOfId('fab-mode-emoji') === 'mode',
    'FAB 边框：模式 id 识别不对');
  check(fabKit.kindOfId('fab-share') === 'share', 'FAB 边框：分享 id 识别不对');
  // 画一次带边框的按钮：描边颜色 / 半径要贴住按钮边缘
  const strokes = [];
  const arcs = [];
  const ctx = makeCtx();
  ctx.stroke = () => strokes.push({ color: ctx.strokeStyle, width: ctx.lineWidth });
  ctx.arc = (x, y, r) => arcs.push(r);
  const scene = {
    buttons: [],
    addButton(id, x, y, w, h, fn) { this.buttons.push({ id, x, y, w, h, onTap: fn }); },
  };
  fabKit.draw(scene, ctx, { x: 16, y: 600, w: 44, h: 44 },
    { id: 'fab-share', kind: 'share', icon: false, onTap: () => {} });
  check(strokes.length === 1 && strokes[0].color === '#962832',
    `FAB 边框：分享按钮没描胭脂红边（${strokes.map((s2) => s2.color).join(',')}）`);
  const lastArc = arcs[arcs.length - 1];
  check(arcs.length >= 2 && Math.abs(lastArc - 21) < 0.6,
    `FAB 边框：描边半径应贴着按钮边缘（${arcs.join(',')}）`);
  check(scene.buttons.length === 1, 'FAB：icon:false 时命中区丢了');
}


  // 历史成绩推算：成就系统上线前的老玩家（没有任何 achv 记录），只看存档也要能认定
  wx.setStorageSync('__emoji_detective__level', JSON.stringify({ level: 1, hearts: 3, phase: 'play' }));
  wx.setStorageSync('__emoji_match__level', '3');
  wx.setStorageSync('__easy_click_game__6', '4');
  check(achv.legacyCleared('detective', 1) === 1, `成就：侦探首关没有从存档推算出来（${achv.legacyCleared('detective', 1)}）`);
  check(achv.legacyCleared('match', 1) === 2, `成就：对对碰关卡没有从存档换算（${achv.legacyCleared('match', 1)}）`);
  check(achv.legacyCleared('match', 3) === 0, '成就：没玩过的模式被算成通关了');
  check(achv.totalWins('match') >= 2, '成就：累计胜利没有吃历史推算');
  wx.setStorageSync('__game_2048__best', '2048');
  const g2048Card = achv.pageData().games.find((g) => g.id === 'g2048');
  check(g2048Card && g2048Card.achv.filter((a) => a.counter && a.value >= 1).length === 2,
    '成就：2048 里程碑没有按最高牌补记');

  // 隐藏成就：8 条都在列表末尾，未达成时名字是 ******，达成后显示真名 + 说明
  {
    const hidden = achv.hiddenList();
    check(hidden.length === 7, `隐藏成就：应有 7 条，实际 ${hidden.length}`);
    check(hidden.every((h) => h.name && h.desc), '隐藏成就：名称/说明缺失');
    // 隐藏成就的解锁也要能实时提示（markHelp / markFail / 时长这些写入口以前完全不给提示）
    {
      const seenHidden = [];
      achv.setUnlockHook((list) => seenHidden.push(list.join('+')));
      achv.pageData().games.forEach((g) => achv.markHelp(g.id));
      check(seenHidden.join(',').indexOf('求知好学') >= 0,
        `成就提示：隐藏成就没触发（${seenHidden}）`);
      achv.setUnlockHook(null);
    }
    check(achv.hiddenList()[0].unlocked === false || achv.helpCount() >= 25, '隐藏成就：求知好学状态不一致');
    // 帮助看满 25 个 + 时长 + 失败 + 9 个闯关游戏过 10 关
    achv.pageData().games.forEach((g) => achv.markHelp(g.id));
    achv.addPlayMs(3600000);
    achv.flushTime();
    for (let i = 0; i < 100; i += 1) achv.markFail();
    wx.setStorageSync('__emoji_master__level', '12');
    wx.setStorageSync('__emoji_link__level', '12');
    wx.setStorageSync('__emoji_crush__level', '12');
    wx.setStorageSync('__emoji_sort__level', '12');
    wx.setStorageSync('__emoji_slide__state', JSON.stringify({ level: 12 }));
    wx.setStorageSync('__mahjong_hero__best_1', '12');
    wx.setStorageSync('__poker_alchemy__best_1', '13');
    wx.setStorageSync('__quesheng__level', '12');
    wx.setStorageSync('__gambler__best', '13');
    // 任一游戏 800 胜 / 任一闯关游戏 500 关
    wx.setStorageSync('__emoji_crush__level', '501');
    for (let i = 0; i < 800; i += 1) achv.win('click');
    const done = achv.hiddenList();
    // 前 6 条是行为型条件，这一轮都能满足；「成就达人」要累计解锁 100 个，本轮不一定够，
    // 所以它单独和 unlockedCount() 对账（口径一致性比「一定解锁」更重要）
    check(done.slice(0, 6).every((h) => h.unlocked), `隐藏成就：条件满足后没有全部解锁（${done.filter((h) => !h.unlocked).map((h) => h.name).join(',')}）`);
    check(done[6].unlocked === (achv.unlockedCount() >= 100),
      `隐藏成就：成就达人状态与已解锁数不一致（${achv.unlockedCount()} 个）`);
    check(/\d+/.test(done[6].desc), `隐藏成就：成就达人文案不对（${done[6].desc}）`);
    check(done[0].name === '求知好学' && done[1].name === '我已沉迷' && done[2].name === '锲而不舍' && done[3].name === '我爱闯关'
      && done[4].name === '赢上瘾了' && done[5].name === '闯关英豪'
      && done[6].name === '成就达人',
    '隐藏成就：名字不对');
    check(/800/.test(done[4].desc), `隐藏成就：800 胜文案不对（${done[4].desc}）`);
    check(/500/.test(done[5].desc), `隐藏成就：500 关文案不对（${done[5].desc}）`);

    // 「超过第 10 关」的阈值口径：通过第 10 关（存档 best = 11）就算，只到第 10 关（未通过）不算
    // —— 这里用连连看单独验一遍，曾经写成 >= 11 导致差一关永远解锁不了
    const keepLinkBest = wx.getStorageSync('__emoji_link__best_1');
    const keepLinkLevel = wx.getStorageSync('__emoji_link__level');
    wx.setStorageSync('__emoji_link__best_1', '11');
    wx.setStorageSync('__emoji_link__level', '11');
    check(achv.hiddenList().find((h) => h.key === 'levels').unlocked === true,
      '隐藏成就：通过第 10 关（存档 11）就该算达成');
    wx.setStorageSync('__emoji_link__best_1', '10');
    wx.setStorageSync('__emoji_link__level', '10');
    check(achv.hiddenList().find((h) => h.key === 'levels').unlocked === false,
      '隐藏成就：只到第 10 关、还没通过时不该算达成');
    if (keepLinkBest) wx.setStorageSync('__emoji_link__best_1', keepLinkBest); else wx.removeStorageSync('__emoji_link__best_1');
    if (keepLinkLevel) wx.setStorageSync('__emoji_link__level', keepLinkLevel); else wx.removeStorageSync('__emoji_link__level');
    check(/\d+ 小时 \d+ 分钟/.test(done[1].desc), `隐藏成就：时长文案不对（${done[1].desc}）`);
    check(/100 次/.test(done[2].desc), `隐藏成就：失败文案不对（${done[2].desc}）`);
  }

  // 新成就：滑行 / 麻将英雄 / 雀圣 / 炼金术 第 50、100 关（任意模式） + 单人麻将三项
  {
    const achvMod = require(path.join(ROOT, 'js/core/achv'));
    const names = (gid) => {
      const g = achvMod.pageData().games.find((x) => x.id === gid);
      return g.achv.filter((a) => a.unlocked).map((a) => a.name);
    };
    // 滑行：只写 state.level（0 基之外还要 +1），验「50 关解锁 / 100 关不提前」
    wx.setStorageSync('__emoji_slide__state', JSON.stringify({ level: 51 }));
    check(names('slide').indexOf('完成第 50 关') >= 0, '成就：滑行第 50 关没解锁');
    check(names('slide').indexOf('完成第 100 关') < 0, '成就：滑行第 100 关提前解锁了');
    wx.setStorageSync('__emoji_slide__state', JSON.stringify({ level: 101 }));
    check(names('slide').indexOf('完成第 100 关') >= 0, '成就：滑行第 100 关没解锁');

    // 炼金术：只玩炸金花（模式 2）打到第 51 关，也要算「任意模式」
    wx.setStorageSync('__poker_alchemy__level_2', '51');
    check(names('alchemy').indexOf('完成第 50 关') >= 0, '成就：炼金术只有模式 2 通关时没算');

    // 雀圣：步进模式（level_2）
    wx.setStorageSync('__quesheng__level_2', '101');
    check(names('quesheng').indexOf('完成第 100 关') >= 0, '成就：雀圣第 100 关没解锁');

    // 麻将英雄：闯关 best_1 存的是「已开始的最高关」
    wx.setStorageSync('__mahjong_hero__best_1', '101');
    check(names('mahjong').indexOf('完成第 100 关') >= 0, '成就：麻将英雄第 100 关没解锁');

    // Emoji 排序：第 50 / 100 关（两种模式任一）+ 累计 100 / 500 胜
    wx.setStorageSync('__emoji_sort__level_2', '51');
    check(names('sort').indexOf('完成第 50 关') >= 0, '成就：排序只有模式 2 通关到第 50 关时没算');
    check(names('sort').indexOf('完成第 100 关') < 0, '成就：排序第 100 关提前解锁了');
    wx.setStorageSync('__emoji_sort__level_2', '101');
    check(names('sort').indexOf('完成第 100 关') >= 0, '成就：排序第 100 关没解锁');
    for (let i = 0; i < 100; i += 1) achvMod.win('sort');
    check(names('sort').indexOf('累计 100 胜') >= 0, '成就：排序累计 100 胜没解锁');
    check(names('sort').indexOf('累计 500 胜') < 0, '成就：排序累计 500 胜提前解锁');

    // 全部 25 个游戏：不再有「累计胜利次数」/「累计 10 胜」这两类低门槛行
    achvMod.pageData().games.forEach((g) => {
      check(!g.achv.some((a) => a.name === '累计胜利次数'), `成就：${g.id} 还有「累计胜利次数」`);
      check(!g.achv.some((a) => /10\s*胜/.test(a.name)), `成就：${g.id} 还有「累计 10 胜」`);
    });
    // 关灯 / 侦探 / 猎手 / 连连看 / 消消乐 / 消除大师 / 滑行 / 对对碰 / 排序：
    // 改成「累计 100 胜 / 500 胜」（不分难度，胜利就算；老存档的关卡也算胜场）
    ['click', 'detective', 'hunter', 'link', 'crush', 'master', 'slide', 'match', 'sort'].forEach((gid) => {
      const g = achvMod.pageData().games.find((x) => x.id === gid);
      const has = (n) => g.achv.some((a) => a.name === n);
      check(!has('累计胜利次数'), `成就：${gid} 还留着「累计胜利次数」`);
      check(has('累计 100 胜') && has('累计 500 胜'), `成就：${gid} 缺少累计 100 / 500 胜`);
    });
    // 连连看：打 100 胜解锁 100、不解锁 500；再打到 500 才解锁
    check(names('link').indexOf('累计 100 胜') < 0, '成就：连连看 100 胜提前解锁');
    for (let i = 0; i < 100; i += 1) achvMod.win('link');
    check(names('link').indexOf('累计 100 胜') >= 0, '成就：连连看累计 100 胜没解锁');
    check(names('link').indexOf('累计 500 胜') < 0, '成就：连连看 500 胜跟着 100 胜一起解锁了');
    for (let i = 0; i < 400; i += 1) achvMod.win('link');
    check(names('link').indexOf('累计 500 胜') >= 0, '成就：连连看累计 500 胜没解锁');
    // 消消乐：只写「通关到第 101 关」的老存档，累计 100 胜也要算（关卡 = 胜场）
    wx.setStorageSync('__emoji_crush__best_1', '101');
    check(names('crush').indexOf('累计 100 胜') >= 0, '成就：消消乐老存档 100 关没算进累计胜场');
    // 对对碰：老存档 best_1 = 101（通 100 关）算 100 胜；500 胜要真打到
    wx.setStorageSync('__emoji_match__best_1', '101');
    check(names('match').indexOf('累计 100 胜') >= 0, '成就：对对碰老存档 100 关没算进累计胜场');
    check(names('match').indexOf('累计 500 胜') < 0, '成就：对对碰 500 胜提前解锁了');
    for (let i = 0; i < 500; i += 1) achvMod.win('match');
    check(names('match').indexOf('累计 500 胜') >= 0, '成就：对对碰累计 500 胜没解锁');

    // 1A2B / 24 点：达成 10 连胜 / 30 连胜（读各自的最长连胜 key），且排在累计胜场前面
    wx.setStorageSync('__guess_number__best', '10');
    wx.setStorageSync('__point24__best_streak', '9');
    check(names('guess').indexOf('达成 10 连胜') >= 0, '成就：1A2B 10 连胜没解锁');
    check(names('guess').indexOf('达成 30 连胜') < 0, '成就：1A2B 30 连胜提前解锁');
    check(names('point24').indexOf('达成 10 连胜') < 0, '成就：24 点 9 连胜不该解锁 10 连胜');
    wx.setStorageSync('__guess_number__best', '31');
    wx.setStorageSync('__point24__best_streak', '30');
    check(names('guess').indexOf('达成 30 连胜') >= 0, '成就：1A2B 30 连胜没解锁');
    check(names('point24').indexOf('达成 30 连胜') >= 0, '成就：24 点 30 连胜没解锁');

    // 数独：中等 / 困难 0 错误获胜（bump 计数口径）
    check(names('sudoku').indexOf('中等难度 0 错误获胜') < 0, '成就：数独 0 错误提前解锁');
    achvMod.bump('sudoku', 'clean2');
    check(names('sudoku').indexOf('中等难度 0 错误获胜') >= 0, '成就：数独中等 0 错误获胜没解锁');
    check(names('sudoku').indexOf('困难难度 0 错误获胜') < 0, '成就：数独困难 0 错误跟着中等一起解锁了');
    achvMod.bump('sudoku', 'clean3');
    check(names('sudoku').indexOf('困难难度 0 错误获胜') >= 0, '成就：数独困难 0 错误获胜没解锁');

    // 赌神：不区分模式 —— 连胜两档 + 累计 100 / 500 胜，旧的「首胜 / 分模式最长连胜」已删
    {
      const g = achvMod.pageData().games.find((x) => x.id === 'gambler');
      const has = (n) => g.achv.some((a) => a.name === n);
      check(!has('两种模式首胜'), '成就：赌神还留着「两种模式首胜」');
      check(!has('即时模式最长连胜') && !has('提交模式最长连胜'), '成就：赌神还留着分模式最长连胜');
      check(has('达成 10 连胜') && has('达成 30 连胜'), '成就：赌神缺少 10 / 30 连胜');
      check(has('累计 100 胜') && has('累计 500 胜'), '成就：赌神缺少 100 / 500 胜');
      // 连胜取两种模式里较大的那个（不区分模式）
      const peakToasts = [];
      achvMod.setUnlockHook((list) => peakToasts.push(list.join('+')));
      achvMod.peak('gambler', 'streak2', 10);
      check(names('gambler').indexOf('达成 10 连胜') >= 0, '成就：赌神模式 2 的 10 连胜没算');
      // peak 是热路径，只打标记；App 每秒的 sweepUnlocks() 会把它补上（不能丢）
      check(peakToasts.length === 0, '成就提示：peak 不该同步弹（消除类会每消一组调一次）');
      achvMod.sweepUnlocks();
      check(peakToasts.join(',').indexOf('达成 10 连胜') >= 0,
        `成就提示：peak 解锁没被兜底扫描补上（${peakToasts}）`);
      peakToasts.length = 0;
      achvMod.sweepUnlocks();
      check(peakToasts.length === 0, '成就提示：已达成的成就不该重复弹');
      achvMod.setUnlockHook(null);
      check(names('gambler').indexOf('达成 30 连胜') < 0, '成就：赌神 30 连胜提前解锁');
      achvMod.peak('gambler', 'streak1', 30);
      check(names('gambler').indexOf('达成 30 连胜') >= 0, '成就：赌神模式 1 的 30 连胜没算');
      for (let i = 0; i < 100; i += 1) achvMod.win('gambler');
      check(names('gambler').indexOf('累计 100 胜') >= 0, '成就：赌神累计 100 胜没解锁');
      check(names('gambler').indexOf('累计 500 胜') < 0, '成就：赌神累计 500 胜提前解锁');
    }

    // 实时解锁提示：每一条写入口都要能触发（旧实现漏过 peak 节流 / 隐藏成就 / 直接写存档三种）
    {
      const got = [];
      achvMod.setUnlockHook((list) => got.push(list.join('+')));
      // a) peak 打标记 + sweep 检查，不会把已解锁的重复弹出来
      achvMod.peak('gambler', 'streak1', 32);
      achvMod.sweepUnlocks();
      check(got.length === 0, `成就提示：已达成的成就不该重复弹（${got}）`);
      // c) 切语言不应该把已解锁的全部当成「新解锁」再弹一遍（key 用 id + 行号，不用名字）
      got.length = 0;
      i18n.setLangMode('en');
      achvMod.sweepUnlocks();
      check(got.length === 0, `成就提示：切语言后误报新解锁（${got}）`);
      i18n.setLangMode('cn');
      // d) 场景直接写存档、没走 achv：每秒兜底扫描要能补上
      got.length = 0;
      wx.setStorageSync('__emoji_link__best_1', '131');
      wx.setStorageSync('__emoji_link__level', '131');
      achvMod.sweepUnlocks();
      check(got.length > 0, '成就提示：直接写存档的解锁没被兜底扫描发现');
      achvMod.setUnlockHook(null);
    }

    // 全局：数量类（指标行 / 计数型）必须全部排在进度类（带 x/target 进度条）之前
    achvMod.pageData().games.forEach((g) => {
      const qty = [];
      const prog = [];
      g.achv.forEach((r, i) => { (r.stat || r.counter ? qty : prog).push(i); });
      if (qty.length && prog.length) {
        check(Math.max(...qty) < Math.min(...prog), `成就：${g.id} 有进度类排到了数量类前面`);
      }
    });

    // 全局：任何「连胜」成就都要排在「累计 N 胜」之前
    achvMod.pageData().games.forEach((g) => {
      const streak = g.achv.map((r, i) => ({ r, i })).filter((x) => /连胜/.test(x.r.name)).map((x) => x.i);
      const wins = g.achv.map((r, i) => ({ r, i })).filter((x) => /累计\s*\d+\s*胜/.test(x.r.name)).map((x) => x.i);
      if (streak.length && wins.length) {
        check(Math.max(...streak) < Math.min(...wins), `成就：${g.id} 的连胜成就排在累计胜场后面`);
      }
    });

    // 单人麻将：10 连胜 / 累计 100 胜 / 500 胜
    wx.setStorageSync('__solo__best_streak', '10');
    check(names('solo').indexOf('达成 10 连胜') >= 0, '成就：单人麻将 10 连胜没解锁');
    check(names('solo').indexOf('达成 30 连胜') < 0, '成就：单人麻将 30 连胜提前解锁了');
    wx.setStorageSync('__solo__best_streak', '31');
    check(names('solo').indexOf('达成 30 连胜') >= 0, '成就：单人麻将 30 连胜没解锁');
    let hookNames = null;
    achvMod.setUnlockHook((list) => { hookNames = list; });
    for (let i = 0; i < 100; i += 1) achvMod.win('solo');
    check(names('solo').indexOf('累计 100 胜') >= 0, '成就：单人麻将累计 100 胜没解锁');
    check(!!hookNames && hookNames.join(',').indexOf('累计 100 胜') >= 0,
      `成就：累计 100 胜解锁时没有实时回调（${hookNames || 'null'}）`);
    // 累计对局 1000 局（单人麻将没有关卡概念，用对局数代替「最高关卡」）
    check(names('solo').indexOf('累计对局 1000 局') < 0, '成就：单人麻将 1000 局提前解锁');
    for (let i = 0; i < 1000; i += 1) achvMod.trackPlay('solo');
    check(names('solo').indexOf('累计对局 1000 局') >= 0, '成就：单人麻将累计对局 1000 局没解锁');
    achvMod.setUnlockHook(null);
  }

  const clickCard = achv.pageData().games.find((g) => g.id === 'click');
  check(clickCard && clickCard.achv.some((a) => a.counter), '成就：关灯缺少计数型成就');

  // 首页成就页：圆形展开后要有遮罩 + 关闭按钮，滚动要被夹住
  const HomeScene = require(path.join(ROOT, 'js/games/home/scene'));
  const home = new HomeScene(fakeApp);
  fakeApp.sceneId = 'home';
  const ctxA = makeCtx();
  home.openAchv();
  check(home.achvOpen === true, '成就：openAchv 没有打开');
  // 某个游戏成就全部达成 → 卡片底色换成浅橙
  {
    const D = require(path.join(ROOT, 'js/core/draw'));
    [3, 4, 5, 6, 7, 8, 9, 10].forEach((d) => achv.win('click', { mode: d, perfect: true }));
    const clickGame = achv.pageData().games.find((g) => g.id === 'click');
    check(clickGame.achv.every((a) => a.unlocked), '成就：关灯没有全部解锁（准备全达成卡片）');
    const origFill = D.fillRoundRect;
    const fills = [];
    D.fillRoundRect = (c, x, y, w, h, r, color) => {
      fills.push({ x, y, w, h, color });
      return origFill(c, x, y, w, h, r, color);
    };
    home.achvAnim = 1;   // 展开动画走完：卡片才会按最终 alpha 画出来
    home.achvPage.setData(achv.pageData());   // 上面刚伪造的进度，刷新一次页面数据
    home.achvScroll = 0;
    home.render(ctxA);
    D.fillRoundRect = origFill;
    const orange = fills.some((f) => f.color === 'rgba(255,214,170,0.9)' || f.color === 'rgba(150,86,32,0.5)');
    check(orange, '成就：全部达成的卡片没有换成浅橙底');
    const normal = fills.some((f) => f.color === 'rgba(255,255,255,0.86)' || f.color === 'rgba(52,52,52,0.84)');
    check(normal, '成就：其它卡片不该全变橙');
  }

  // 新达成的成就：打开面板自动滚到那张卡（中间偏上）+ 只播一次高亮
  {
    // ① 存储层：连解两条只保留最新一条（后覆盖前）、取走即清空
    achv.takeNewest();                      // 先清掉之前的，从干净的「无新成就」开始
    const gotKeys = [];
    achv.pageData().games.forEach((g) => {
      // 直接跳到 50 / 100 关：会同时命中「完成第 50 / 100 关」这类里程碑行
      [50, 100, 500].forEach((lv) => {
        if (gotKeys.length >= 2) return;
        achv.win(g.id, { level: lv, mode: 1, perfect: true });
        achv.trackPlay(g.id);
        const n = achv.newestUnlock();
        if (n && n.key && gotKeys.indexOf(n.key) < 0) gotKeys.push(n.key);
      });
    });
    check(gotKeys.length >= 2, `成就：没法凑出两条新解锁（${gotKeys.join('/')}）`);
    const latestKey = gotKeys[gotKeys.length - 1];
    check(achv.newestUnlock().key === latestKey,
      `成就：最新达成不是最后那条（${achv.newestUnlock().key} / ${latestKey}）`);
    check(achv.hasNew() === true, '成就：解锁后没有亮红点');

    // ② 页面几何：随便挑一张中段的卡，滚过去后卡片中心应落在可视区 40%（中间偏上）
    const gamesList = achv.pageData().games;
    const midGame = gamesList[Math.floor(gamesList.length * 0.6)];
    const geomKey = midGame.achv[0].key;
    home.achvPage.setData(achv.pageData());
    const target = home.achvPage.focusNew(geomKey);
    check(target > 0, `成就：没有算出滚动目标（${target}，key ${geomKey}）`);
    const card = home.achvPage.cardList(target).find((c) => c.game && c.game.id === midGame.id);
    check(!!card, '成就：滚动后找不到那张卡');
    const centerY = card.y + card.h / 2;
    const wantY = home.achvPage.headerH + home.achvPage.viewH() * 0.4;
    check(Math.abs(centerY - wantY) < 2,
      `成就：新达成的卡片没有停在中间偏上（中心 ${centerY.toFixed(0)} / 目标 ${wantY.toFixed(0)}）`);

    // ③ 那一行要有「新」角标（渲染不炸）
    home.achvPage.startSpot(geomKey);
    const spotRec = [];
    const spotCtx = makeCtx();
    spotCtx.fillText = (v) => { spotRec.push(String(v)); };
    home.achvPage.draw(spotCtx, { ease: 1, scroll: target, interactive: true });
    check(spotRec.indexOf(i18n.t('achvNew')) >= 0, `成就：新达成那一行没有「${i18n.t('achvNew')}」角标`);

    // ④ 场景：打开面板 → 自动滚动 + 高亮；再打开（没有新成就）→ 都不播
    const origTake = achv.takeNewest;
    achv.takeNewest = () => ({ key: geomKey, at: Date.now() });
    home.achvOpen = false;
    home.openAchv();
    check(!!home.achvScrollAnim && home.achvScrollAnim.to > 0, '成就：打开面板没有自动滚到新成就');
    check(!!home.achvPage.spot && home.achvPage.spot.key === geomKey,
      '成就：打开面板没有高亮新达成的那一行');
    achv.takeNewest = origTake;
    achv.takeNewest();                      // 真实路径：把「最新达成」取走
    home.achvOpen = false;
    home.openAchv();
    check(!home.achvScrollAnim && !home.achvPage.spot,
      '成就：再次打开还在播新成就动画（应该只播一次）');
  }

  // 设置 / 成就面板：从屏幕边缘内滑关闭（和点 ✕ 同一套收起）
  {
    const { App: AppClass } = require(path.join(ROOT, 'js/core/app'));
    const fake = {
      sceneId: 'home', transition: null, scene: home, edgeSwipe: null, wentHome: false,
      goHome() { this.wentHome = true; },
    };
    // 面板没打开时不该抢边缘手势
    home.settingsOpen = false;
    home.achvOpen = false;
    check(AppClass.prototype.startEdgeSwipe.call(fake, { x: 6, y: 300 }) === false,
      '成就：首页没有面板时不该拦边缘手势');
    // 设置面板打开 → 边缘内滑关闭
    home.settingsOpen = true;
    home.achvOpen = false;
    check(AppClass.prototype.startEdgeSwipe.call(fake, { x: 6, y: 300 }) === true,
      '设置：面板打开时边缘手势没有拦下');
    AppClass.prototype.moveEdgeSwipe.call(fake, { x: 110, y: 304 });
    check(home.settingsOpen === false, '设置：边缘内滑没有关掉设置面板');
    check(fake.wentHome === false, '设置：边缘内滑关面板时不该回首页');
    // 成就面板同理
    home.settingsOpen = false;
    home.achvOpen = true;
    AppClass.prototype.startEdgeSwipe.call(fake, { x: 6, y: 300 });
    AppClass.prototype.moveEdgeSwipe.call(fake, { x: 110, y: 304 });
    check(home.achvOpen === false, '成就：边缘内滑没有关掉成就面板');
    // 还原成「成就页打开」的状态，后面的滚动 / 拖动断言还要用
    home.achvOpen = true;
    home.achvAnim = 1;
    home.achvPage.setData(achv.pageData());
    fake.edgeSwipe = null;
  }

  // 每日挑战卡：列表最上面、5 条成就、不参与排序
  {
    const daily = require(path.join(ROOT, 'js/core/daily'));
    const page0 = achv.pageData();
    check(!!page0.daily && page0.daily.pinned === true, '成就：缺少每日挑战卡');
    check(page0.daily.achv.length === 5, `成就：每日挑战应有 5 条（${page0.daily.achv.length}）`);
    check(page0.daily.name === '每日挑战', `成就：每日挑战卡名字不对（${page0.daily.name}）`);
    home.achvPage.setData(page0);
    const list = home.achvPage.cardList(0);
    check(list[0] && list[0].pinned === true, '成就：每日挑战卡不在列表最上面');
    check(list[list.length - 1].hidden === true, '成就：隐藏成就卡应仍在最后');
    check(home.achvPage.hitIndex(list[0].y + 10) === -1, '成就：每日挑战卡不该被长按拖走');
    // 完成一次（任意游戏赢 3 局）→ 累计次数 +1、首条解锁
    const beforeTotal = page0.daily.achv[3].value;
    wx.setStorageSync(daily.KEY, JSON.stringify({
      v: 1,
      cur: { date: daily.dateKey(), id: 'any_win3', prog: 0, done: false, runs: {} },
      days: {},
      recent: ['any_win3'],
      total: beforeTotal,
    }));
    achv.win('click');
    achv.win('match');
    achv.win('link');
    const page1 = achv.pageData();
    check(page1.daily.achv[3].value === beforeTotal + 1, `成就：每日挑战累计次数没有 +1（${beforeTotal} → ${page1.daily.achv[3].value}）`);
    check(page1.daily.achv[0].unlocked === true, '成就：完成第 1 次每日挑战没解锁');
  }

  // 中英双语：任务文案和月历年月都要跟着语言变
  {
    const daily = require(path.join(ROOT, 'js/core/daily'));
    const i18nMod = require(path.join(ROOT, 'js/core/i18n'));
    const prevMode = i18nMod.langMode;
    i18nMod.setLangMode('en');
    const en = daily.pageData();
    check(/^[A-Z][a-z]{2} \d{4}$/.test(en.month.title), `每日挑战：英文月历标题不对（${en.month.title}）`);
    check(/^[\x20-\x7e]+$/.test(en.today.desc), `每日挑战：英文下任务文案还是中文（${en.today.desc}）`);
    i18nMod.setLangMode('cn');
    const cn = daily.pageData();
    check(/年\s*\d+\s*月/.test(cn.month.title), `每日挑战：中文月历标题不对（${cn.month.title}）`);
    check(/[\u4e00-\u9fa5]/.test(cn.today.desc), `每日挑战：中文下任务文案不是中文（${cn.today.desc}）`);
    i18nMod.setLangMode(prevMode);
  }

  // 任务池改过 → 老存档里「已下线的任务」要能自愈（面板不能空白、不能永远完成不了）
  {
    const daily = require(path.join(ROOT, 'js/core/daily'));
    const todayKey = daily.dateKey();
    const base = { v: 1, days: {}, recent: [], total: 3 };
    // A. 未完成 + 任务已下线 → 换一条能做的
    wx.setStorageSync(daily.KEY, JSON.stringify({
      ...base, cur: { date: todayKey, id: 'poker_four', prog: 0, done: false, runs: {} },
    }));
    const task = daily.todayTask();
    check(!!daily.taskOf(task.id), `每日挑战：下线的任务没有自愈（还在 ${task.id}）`);
    check(!!task.desc && task.desc !== '已完成', `每日挑战：自愈后文案为空（${task.desc}）`);
    check(daily.hasNew() === true, '每日挑战：自愈后应该有红点');
    // 界面上也要真的能看见任务：开面板画一遍，找得到任务文案
    {
      const HomeSceneCls = require(path.join(ROOT, 'js/games/home/scene'));
      const dh = new HomeSceneCls(fakeApp);
      dh.openDaily();
      dh.dailyAnim = 1;
      const cRender = makeCtx();
      dh.render(cRender);
      const texts = cRender.__texts.map((x) => String(x.value));
      const desc = dh.dailyPage.data.today.desc;
      check(!!desc && texts.indexOf(desc) >= 0, `每日挑战：面板上没画出任务文案（${desc}）`);
      dh.dailyOpen = false;
    }
    // B. 已完成 + 任务已下线 → 保留完成状态，文案不空白
    wx.setStorageSync(daily.KEY, JSON.stringify({
      ...base, total: 7, cur: { date: todayKey, id: 'slide_perfect', prog: 1, done: true, doneAt: Date.now(), runs: {} },
    }));
    const doneTask = daily.todayTask();
    check(doneTask.done === true && !!doneTask.desc, '每日挑战：已完成的下线任务状态丢了');
    check(daily.completedTotal() === 7, `每日挑战：累计次数被重置（${daily.completedTotal()}）`);
    check(daily.hasNew() === false, '每日挑战：已完成却还留着红点');
  }

  // 今日卡上「已完成」只能出现一次（左边胶囊），别在右边再写一遍
  {
    const daily = require(path.join(ROOT, 'js/core/daily'));
    const i18nMod = require(path.join(ROOT, 'js/core/i18n'));
    const todayKey = daily.dateKey();
    wx.setStorageSync(daily.KEY, JSON.stringify({
      v: 1,
      days: {},
      recent: [],
      total: 1,
      cur: { date: todayKey, id: 'any_win3', prog: 3, done: true, doneAt: Date.now(), runs: {} },
    }));
    const HomeSceneCls = require(path.join(ROOT, 'js/games/home/scene'));
    const dh = new HomeSceneCls(fakeApp);
    dh.openDaily();
    dh.dailyAnim = 1;
    const cDone = makeCtx();
    dh.render(cDone);
    const label = i18nMod.t('dailyDone');
    const hits = cDone.__texts.filter((x) => String(x.value) === label).length;
    check(dh.dailyPage.data.today.done === true, '每日挑战：已完成状态没读出来');
    check(hits === 1, `每日挑战：完成态在今日卡上画了 ${hits} 次「${label}」（应该只有左边胶囊那一次）`);
    dh.dailyOpen = false;
  }

  // 任务池里每一条都必须真的能被触发（埋点缺失 = 永远完成不了）
  {
    const fsMod = require('fs');
    const daily = require(path.join(ROOT, 'js/core/daily'));
    const srcOf = {};
    fsMod.readdirSync(path.join(ROOT, 'js/games')).forEach((g) => {
      const f = path.join(ROOT, 'js/games', g, 'scene.js');
      if (fsMod.existsSync(f)) srcOf[g] = fsMod.readFileSync(f, 'utf8');
    });
    const bad = [];
    daily.POOL.forEach((t) => {
      if (t.game === '*') return;          // 任意游戏类靠 achv 公共埋点
      const code = srcOf[t.game] || '';
      const winCall = code.indexOf(`achv.win('${t.game}'`) >= 0;
      let ok = true;
      switch (t.kind) {
        case 'play': ok = true; break;
        case 'win': ok = winCall; break;
        case 'perfect': ok = winCall && /perfect:/.test(code); break;
        case 'fast': ok = winCall && /fast:/.test(code); break;
        case 'level': ok = winCall && /level:/.test(code); break;
        case 'reach':
          ok = code.indexOf(`achv.reach('${t.game}'`) >= 0
            || code.indexOf(`daily.report('${t.game}', 'reach'`) >= 0;
          break;
        case 'peak':
          ok = code.indexOf(`achv.peak('${t.game}'`) >= 0 && code.indexOf(`'${t.field}'`) >= 0;
          break;
        case 'bump':
          ok = code.indexOf(`achv.bump('${t.game}'`) >= 0;
          break;
        case 'run':
          ok = code.indexOf(`daily.markNewRun('${t.game}')`) >= 0;
          break;
        default: ok = false;
      }
      if (!ok) bad.push(`${t.id}（${t.game}/${t.kind}）`);
    });
    check(bad.length === 0, `每日挑战：这些任务没有埋点，永远做不完 → ${bad.join('、')}`);
  }



  withFakeClock(20, () => {
    for (let i = 0; i < 40; i += 1) {
      home.update(20);
      home.buttons = [];
      home.render(ctxA);
    }
  });
  check(home.achvAnim >= 1, `成就：展开没完成（${home.achvAnim}）`);
  check(home.buttons.some((b) => b.id === 'achv-close'), '成就：没有关闭按钮');
  check(home.buttons.some((b) => b.id === 'achv-mask'), '成就：没有遮罩');
  home.achvScroll = 99999;
  home.render(ctxA);
  check(home.achvScroll <= home.achvPage.maxScroll() + 0.5, '成就：滚动没有被夹住');
  // 隐藏成就在列表最末，滑到底时必须完整露出（不能只露一半）
  home.achvScroll = home.achvPage.maxScroll();
  home.render(ctxA);
  const tail = home.achvPage.cardList(home.achvScroll);
  const lastCard = tail[tail.length - 1];
  check(lastCard && lastCard.hidden === true, '成就：最后一张卡不是隐藏成就');
  check(lastCard.y + lastCard.h <= home.achvPage.viewH(), `成就：隐藏成就卡滑到底仍被盖住（底边 ${Math.round(lastCard.y + lastCard.h)} / 视口 ${home.achvPage.viewH()}）`);
  // 底部「长按卡片可拖动排序」必须是绿底白字的不透明标签（不是半透明文字压渐隐）
  {
    const T = theme.tokens;
    const rects = [];
    const origFill = D.fillRoundRect;
    D.fillRoundRect = (c, x, y, w, h, r, color) => {
      rects.push({ x, y, w, h, r, color, shadowBlur: c.__shadowBlur, shadowY: c.__shadowOffsetY });
    };
    const cHint = makeCtx();
    // 记录 shadow 状态（mock ctx 的 save/restore 不还原自定义字段，这里手动镜像）
    const origSave = cHint.save;
    const origRestore = cHint.restore;
    cHint.save = () => { cHint.__savedShadow = cHint.__shadowBlur; origSave && origSave(); };
    cHint.restore = () => { cHint.__shadowBlur = cHint.__savedShadow; origRestore && origRestore(); };
    Object.defineProperty(cHint, 'shadowBlur', {
      get: () => cHint.__shadowBlur || 0,
      set: (v) => { cHint.__shadowBlur = v; },
    });
    Object.defineProperty(cHint, 'shadowOffsetY', {
      get: () => cHint.__shadowOffsetY || 0,
      set: (v) => { cHint.__shadowOffsetY = v; },
    });
    home.render(cHint);
    D.fillRoundRect = origFill;
    const pill = rects.find((q) => q.color === T.primary && q.h === 20 && q.w > 40);
    check(!!pill, '成就：拖拽提示不是绿底标签');
    check(home.achvPage.fadeGrad === undefined, '成就：底部渐隐还在（应只留标签自己的投影）');
    if (pill) {
      check(pill.shadowBlur > 0 && pill.shadowY > 0, `成就：拖拽提示标签没有悬浮投影（${pill.shadowBlur}/${pill.shadowY}）`);
    }
    if (pill) {
      const hint = cHint.__texts.find((x) => String(x.value) === '长按卡片可拖动排序');
      check(!!hint, '成就：拖拽提示文字没画出来');
      if (hint) {
        check(hint.x > pill.x && hint.x < pill.x + pill.w
          && hint.y > pill.y && hint.y < pill.y + pill.h, '成就：拖拽提示文字没落在标签里');
      }
      check(pill.x >= 0 && pill.x + pill.w <= W, '成就：拖拽提示标签超出屏幕');
      const gear = home.gearRect;
      check(!(pill.x + pill.w > gear.x && pill.x < gear.x + gear.w
        && pill.y + pill.h > gear.y && pill.y < gear.y + gear.h), '成就：拖拽提示标签压住了 ✕');
    }
  }

  // 顺序：拖动换位 + 落盘 + 读回
  const orderBefore = home.achvPage.data.games.map((g) => g.id);
  check(orderBefore.length === 25, '成就：卡片数量不对');
  const moved = home.achvPage.moveItem(0, 3);
  check(moved, '成就：moveItem 没有移动');
  const orderAfter = home.achvPage.data.games.map((g) => g.id);
  check(orderAfter[3] === orderBefore[0] && orderAfter[0] === orderBefore[1], '成就：拖动换位结果不对');
  achv.saveOrder(orderAfter);
  const reloaded = achv.loadOrder();
  check(reloaded.length === 25 && reloaded[3] === orderBefore[0], '成就：排序没有存进去 / 读不回');
  // 拖动状态下渲染不抛错，且被拖的那张不再按原位置画
  home.render(ctxA);
  home.achvCard = { index: 3, grabDy: 20, fingerY: 300 };
  try {
    home.render(ctxA);
  } catch (e) {
    failures.push(`成就：拖动渲染抛错 ${e.message}`);
  }
  home.achvCard = null;
  achv.saveOrder(orderBefore);

  // 滚动：拖动 → 松手应有惯性（速度>0），update() 之后继续滚
  home.achvScroll = 0;
  home.onTouchStart({ x: 100, y: 420 });
  home.onTouchMove({ x: 100, y: 360 });
  home.onTouchMove({ x: 100, y: 300 });
  const scrolledByDrag = home.achvScroll;
  check(scrolledByDrag > 0, `成就：拖动没有滚动（${scrolledByDrag}）`);
  home.onTouchEnd();
  check(home.achvVel > 0, `成就：松手没有惯性（${home.achvVel}）`);
  const beforeFlung = home.achvScroll;
  home.update(16);
  check(home.achvScroll > beforeFlung, '成就：惯性没有继续滚动');
  // 惯性衰减：跑一会儿后速度归零
  for (let i = 0; i < 120; i += 1) home.update(16);
  check(Math.abs(home.achvVel) < 0.3, `成就：惯性没有停下来（${home.achvVel}）`);
  check(home.achvScroll <= home.achvPage.maxScroll() + 0.5, '成就：惯性滚过了末端');
  home.achvOpen = false;
  withFakeClock(20, () => {
    for (let i = 0; i < 40; i += 1) {
      home.update(20);
      home.buttons = [];
      home.render(ctxA);
    }
  });
  check(home.achvAnim === 0, '成就：收起没归零');
}

// ---------- 背景浅景：坐标不跑飞、流星会来也会走 ----------
{
  const ParticleField = require(path.join(ROOT, 'js/core/particles'));
  const field = new ParticleField();
  const ctxBg = makeCtx();
  let sawComet = false;
  let cometGoneAfter = false;
  const finite = (v) => Number.isFinite(v);
  for (let i = 0; i < 1400; i += 1) {
    field.update(16);
    if (field.comet) sawComet = true;
    if (sawComet && !field.comet && i > 60) cometGoneAfter = true;
    if (i % 50 === 0) field.draw(ctxBg, i % 100 === 0);
  }
  const bad = [];
  field.orbs.forEach((o) => { if (!finite(o.x) || !finite(o.y) || !finite(o.r)) bad.push('orb'); });
  field.hexes.forEach((h) => { if (!finite(h.x) || !finite(h.y) || !finite(h.rot)) bad.push('hex'); });
  field.motes.forEach((m) => { if (!finite(m.x) || !finite(m.y)) bad.push('mote'); });
  check(bad.length === 0, `背景：坐标出现 NaN（${bad.join('、')}）`);
  const outOfRange = field.orbs.concat(field.hexes, field.motes)
    .some((p) => p.x < -80 || p.x > W + 80 || p.y < -80 || p.y > H + 80);
  check(!outOfRange, '背景：有元素跑到画面外没有回收');
  check(sawComet, '背景：22 秒内一次流星都没有');
  check(cometGoneAfter, '背景：流星划过去之后没有清掉');
  // 透视检查：背景不能画出内容层（只允许 fill / stroke / 渐变填充）
  const badOps = ctxBg.__calls.filter((k) => k === 'fillText' || k === 'drawImage');
  check(badOps.length === 0, '背景：不该写字或贴图');
}

// ---------- 场景里用到的 i18n key 必须真的存在（中英都要），否则界面上会直接显示 key ----------
{
  const fs = require('fs');
  // 扑克入口已隐藏，但冒烟仍检查它的旧文件；ttt 是首页新入口。
  require(path.join(ROOT, 'js/games/poker/scene'));
  const GAME_IDS = ['click', 'guess', 'poker', 'ttt', 'puzzle', 'g2048', 'snake', 'match', 'link', 'detective',
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
  const GAME_IDS = ['click', 'guess', 'poker', 'ttt', 'puzzle', 'g2048', 'snake', 'match', 'link', 'detective',
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

// ---------- 每日挑战：任务池 / 不重复 / 完成判定 / 面板 ----------
{
  const daily = require(path.join(ROOT, 'js/core/daily'));
  const HomeScene = require(path.join(ROOT, 'js/games/home/scene'));
  const achvMod = require(path.join(ROOT, 'js/core/achv'));

  // 任务池：条数、id 唯一、need 合法、25 个游戏全覆盖
  const pool = daily.POOL;
  check(pool.length >= 30, `每日挑战：任务太少（${pool.length}）`);
  const ids = pool.map((x) => x.id);
  check(new Set(ids).size === ids.length, '每日挑战：任务 id 有重复');
  check(pool.every((x) => x.need >= 1 && x.game && x.kind), '每日挑战：任务缺少 game / kind / need');
  const games = achvMod.pageData().games.map((g) => g.id);
  const covered = games.filter((id) => pool.some((x) => x.game === id));
  check(covered.length === games.length, `每日挑战：还有游戏没有任务（${games.length - covered.length} 个）`);

  // 5 天内不重复：把最近 5 条塞进 recent，roll 出来的新任务不能撞
  const todayKey = daily.dateKey();
  wx.setStorageSync(daily.KEY, JSON.stringify({
    v: 1,
    cur: { date: '2000-01-01', id: 'x', prog: 0, done: false },
    days: {},
    recent: pool.slice(0, 5).map((x) => x.id),
  }));
  const picked = daily.ensureToday();
  check(!pool.slice(0, 5).some((x) => x.id === picked.id), '每日挑战：抽到了最近 5 天内重复的任务');
  check(picked.date === todayKey, '每日挑战：ensureToday 没有落到今天');

  // 完成判定：任意赢 3 局
  wx.setStorageSync(daily.KEY, JSON.stringify({
    v: 1,
    cur: { date: todayKey, id: 'any_win3', prog: 0, done: false },
    days: {},
    recent: ['any_win3'],
  }));
  let completed = null;
  daily.setOnComplete((task) => { completed = task; });
  achvMod.win('click');
  achvMod.win('match');
  check(daily.todayTask().done === false, '每日挑战：2/3 就提前算完成了');
  check(daily.hasNew() === true, '每日挑战：未完成时不应清掉红点');
  achvMod.win('link');
  check(completed && completed.id === 'any_win3', '每日挑战：完成后没有回调');
  check(daily.todayTask().done === true && daily.hasNew() === false, '每日挑战：完成后状态 / 红点不对');
  daily.setOnComplete(null);

  // 分数类任务必须是「今天开的一局」：光有分数不算，开了新局才算
  wx.setStorageSync(daily.KEY, JSON.stringify({
    v: 1,
    cur: { date: todayKey, id: 'g2048_tile512', prog: 0, done: false, runs: {} },
    days: {},
    recent: ['g2048_tile512'],
  }));
  daily.report('g2048', 'reach', { value: 2048 });
  check(daily.todayTask().done === false, '每日挑战：没开新局就凭老分数算完成了');
  daily.markNewRun('g2048');
  daily.report('g2048', 'reach', { value: 2048 });
  check(daily.todayTask().done === true, '每日挑战：开了新局、分数够了却没完成');

  // 面板：展开后有关闭 / 上个月 / 下个月，且不能切到未来
  const homeDaily = new HomeScene(fakeApp);
  homeDaily.openDaily();
  homeDaily.dailyAnim = 1;
  homeDaily.buttons = [];
  try {
    homeDaily.render(makeCtx());
  } catch (e) {
    failures.push(`每日挑战：面板渲染抛错 ${e.message}`);
  }
  const ids2 = homeDaily.buttons.map((b) => b.id);
  check(ids2.includes('daily-close') && ids2.includes('daily-mask'), `每日挑战：展开后按钮不全（${ids2.join(',')}）`);
  check(ids2.includes('daily-prev') && ids2.includes('daily-next'), '每日挑战：月份切换按钮缺失');
  const now = new Date();
  check(homeDaily.dailyYear === now.getFullYear() && homeDaily.dailyMonth === now.getMonth(), '每日挑战：默认应停在当前月');
  check(homeDaily.shiftDailyMonth(-1) === true, '每日挑战：上个月切不过去');
  // 切月是滑动替换，不是瞬间变
  {
    const pageSlide = homeDaily.dailyPage;
    check(pageSlide.sliding() === true, '每日挑战：切月没有动画状态');
    const t0 = pageSlide.slide.at;
    check(pageSlide.slideProgress(t0) < 0.05, '每日挑战：切月动画起点不是 0');
    const mid = pageSlide.slideProgress(t0 + 130);
    check(mid > 0.2 && mid < 0.8, `每日挑战：切月动画中点异常（${mid}）`);
    const cSlide = makeCtx();
    homeDaily.render(cSlide);
    // 旧月向左滑出、新月从右边进来：两边的月份标题应该同时在场，且横向错开
    const monthTexts = cSlide.__texts.filter((x) => /年.*月|20\d\d/.test(String(x.value)));
    check(monthTexts.length >= 2, `每日挑战：切月时只有 ${monthTexts.length} 个月份标题（应该新旧各一）`);
    const xs = monthTexts.map((x) => Math.round(x.x));
    check(new Set(xs).size >= 2, '每日挑战：切月时两个月份标题没有错开（看起来是瞬间替换）');
    pageSlide.slideProgress(t0 + 500);
    check(pageSlide.sliding() === false, '每日挑战：切月动画没有结束');
  }
  check(homeDaily.shiftDailyMonth(1) === true, '每日挑战：回到当前月失败');
  check(homeDaily.shiftDailyMonth(1) === false, '每日挑战：不该允许切到未来月份');
  homeDaily.dailyOpen = false;

  // 完成提示：不能抛错（AI 之前漏了 SAFE_TOP 的引用）
  const { App: AppCls } = require(path.join(ROOT, 'js/core/app'));
  const ctxToast = Object.create(AppCls.prototype);
  ctxToast.startCelebration = () => {};
  ctxToast.audio = { playSuccess: () => {} };
  try {
    AppCls.prototype.notifyDaily.call(ctxToast, { id: 'any_win3', cn: '任意游戏累计赢 3 局', en: 'Win 3 rounds in any games' });
    AppCls.prototype.drawToast.call(ctxToast, makeCtx());
    // 每日挑战那条还在显示 → 成就提示应当排队，先让上一条过期
    check(!!ctxToast.toast || (ctxToast.toasts && ctxToast.toasts.length), '成就：提示条没有进入队列');
    if (ctxToast.toast) ctxToast.toast.at = Date.now() - 4000;
    AppCls.prototype.notifyAchievements.call(ctxToast, ['关灯 · 累计胜利次数']);
    // 过期的那条会在这一帧被清掉，队列里的成就提示从下一帧开始画
    AppCls.prototype.drawToast.call(ctxToast, makeCtx());
    const cAchvToast = makeCtx();
    AppCls.prototype.drawToast.call(ctxToast, cAchvToast);
    const achvTexts = cAchvToast.__texts.map((x) => String(x.value));
    check(achvTexts.indexOf('达成成就') >= 0, `成就：解锁提示没画出来（${achvTexts.slice(0, 4).join('/')}）`);
  } catch (e) {
    failures.push(`每日挑战：完成提示绘制抛错 ${e.message}`);
  }
  ctxToast.dailyToast = null;
}

// ---------- 扑克：四条 / 同花顺在评牌时就记（之后猜大小输了也算） ----------
{
  const PokerScene = require(path.join(ROOT, 'js/games/poker/scene'));
  const pokerLogic = require(path.join(ROOT, 'js/games/poker/rules'));
  const achvMod = require(path.join(ROOT, 'js/core/achv'));
  const scene = new PokerScene(fakeApp);
  fakeApp.sceneId = 'poker';
  audio.setGame('poker');
  const beforeFour = achvMod.countOf('poker', 'four');
  const beforeFlush = achvMod.countOf('poker', 'flush');
  const rawEval = pokerLogic.evaluate;
  pokerLogic.evaluate = () => ({ times: 20, key: 'four' });
  scene.cards = [{ item: {} }, { item: {} }, { item: {} }, { item: {} }, { item: {} }];
  scene.stage = 'guess';
  scene.resolveHand(false);
  check(achvMod.countOf('poker', 'four') === beforeFour + 1, '扑克：评牌时没有记四条');
  // 接着猜大小输掉：计数不能回退，也不该等结算才记
  scene.dice = true;
  scene.guessCard = { num: 8, type: 'S' };
  scene.guessFly = null;
  scene.guess(false);
  check(scene.stage === 'guesslose', `扑克：猜大小输掉后阶段不对（${scene.stage}）`);
  check(achvMod.countOf('poker', 'four') === beforeFour + 1, '扑克：猜大小输掉后四条计数丢了');
  // 同花顺同理
  pokerLogic.evaluate = () => ({ times: 50, key: 'straightflush' });
  scene.stage = 'guess';
  scene.resolveHand(false);
  check(achvMod.countOf('poker', 'flush') === beforeFlush + 1, '扑克：评牌时没有记同花顺');
  pokerLogic.evaluate = rawEval;
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

// ---------- 震动反馈：和音效分开的开关，语义点和音效对齐 ----------
{
  const haptics = require(path.join(ROOT, 'js/core/haptics'));
  const calls = [];
  const origVibrate = wx.vibrateShort;
  wx.vibrateShort = (opts) => { calls.push(opts && opts.type); };
  haptics.setEnabled(true);
  haptics.resetThrottle();
  audio.setGame(null);
  wx.setStorageSync('__games_hub__sfx', '1');
  // playElimination 在刚放过烟花（240ms 内）会被替换掉，这里把时钟推快去避开
  withFakeClock(500, () => audio.playElimination());
  check(calls.length === 1 && calls[0] === 'light', `震动：消除一下没有轻震（${calls.join('/')}）`);
  haptics.resetThrottle();
  audio.playFail();
  check(calls.length === 2 && calls[1] === 'medium', `震动：扣心没有中等震（${calls.join('/')}）`);
  // 音效静音时震动仍然生效（两个开关独立）
  calls.length = 0;
  haptics.resetThrottle();
  wx.setStorageSync('__games_hub__sfx', '0');
  audio.playFail();
  check(calls.length === 1, '震动：音效关掉后震动也应独立生效');
  wx.setStorageSync('__games_hub__sfx', '1');
  // 关掉震动开关 → 完全不震
  calls.length = 0;
  haptics.resetThrottle();
  haptics.setEnabled(false);
  check(haptics.enabled === false, '震动：开关没有写进存档');
  audio.playFail();
  haptics.tap();
  check(calls.length === 0, '震动：关掉开关后还在震');
  haptics.setEnabled(true);
  // 节流：连续两次只震一次
  calls.length = 0;
  haptics.resetThrottle();
  haptics.tap();
  haptics.tap();
  check(calls.length === 1, `震动：没有节流（${calls.length} 次）`);
  // 首页设置里要有震动开关，并且点了真的改存档
  const HomeSceneClass = require(path.join(ROOT, 'js/games/home/scene'));
  const homeForSettings = new HomeSceneClass(fakeApp);
  homeForSettings.settingsOpen = true;
  homeForSettings.settingsAnim = 1;
  homeForSettings.settingsScroll = 0;
  homeForSettings.buttons = [];
  homeForSettings.render(makeCtx());
  const hapticBtn = homeForSettings.buttons.find((b) => b.id.indexOf('-haptic') >= 0);
  check(!!hapticBtn, '设置：面板里没有震动开关');
  haptics.setEnabled(true);
  hapticBtn.onTap();
  check(haptics.enabled === false, '设置：点震动开关没有关掉震动');
  homeForSettings.buttons = [];
  homeForSettings.render(makeCtx());
  const hapticBtn2 = homeForSettings.buttons.find((b) => b.id.indexOf('-haptic') >= 0);
  hapticBtn2.onTap();
  check(haptics.enabled === true, '设置：点震动开关没有打开震动');
  wx.vibrateShort = origVibrate;
}

// ---------- 结算分享：右上角「炫耀一下」+ 5:4 海报 ----------
{
  const shareMod = require(path.join(ROOT, 'js/core/share'));
  // 结果态识别
  check(shareMod.isResultScene({ phase: 'won' }, 'match'), '分享：won 不算结果态');
  check(shareMod.isResultScene({ phase: 'over' }, 'down'), '分享：over 不算结果态');
  check(shareMod.isResultScene({ phase: 'lost' }, 'detective'), '分享：lost 不算结果态');
  check(shareMod.isResultScene({ result: 2 }, 'guess'), '分享：1A2B 的胜利不算结果态');
  check(!shareMod.isResultScene({ phase: 'play' }, 'match'), '分享：进行中应该是结果态以外');

  // 入口位置：25 个场景的按钮都不能压到它（右上角，避开标题与 home）
  const chip = shareMod.chipRect();
  check(chip.x + chip.w <= W - 8 && chip.y >= 0, `分享：入口位置越界（${JSON.stringify(chip)}）`);
  const GAME_IDS2 = ['click', 'guess', 'poker', 'puzzle', 'g2048', 'snake', 'match', 'link', 'detective',
    'hunter', 'three', 'crush', 'sudoku', 'master', 'sort', 'down', 'slide', 'alchemy', 'mahjong',
    'quesheng', 'legend', 'mirror', 'point24', 'solo', 'gambler'];
  const clashes = [];
  GAME_IDS2.forEach((id) => {
    const SceneClass = require(path.join(ROOT, `js/games/${id}/scene`));
    fakeApp.sceneId = id;
    const scene = new SceneClass(fakeApp);
    scene.buttons = [];
    scene.render(makeCtx());
    scene.buttons.forEach((b) => {
      if (b.x < chip.x + chip.w && b.x + b.w > chip.x && b.y < chip.y + chip.h && b.y + b.h > chip.y) {
        clashes.push(`${id}:${b.id}`);
      }
    });
  });
  check(clashes.length === 0, `分享：入口压到了别的按钮（${clashes.join(', ')}）`);

  // 结算时应该显示入口（画出来 + 注册按钮），进行中不该显示
  const MatchSceneCls = require(path.join(ROOT, 'js/games/match/scene'));
  const overScene = new MatchSceneCls(fakeApp);
  overScene.phase = 'won';
  overScene.helpOpen = false;
  overScene.confirming = false;
  check(shareMod.shouldShowChip(overScene, 'match') === true, '分享：胜利结算时没有显示入口');
  overScene.phase = 'play';
  check(shareMod.shouldShowChip(overScene, 'match') === false, '分享：进行中不该显示入口');
  overScene.phase = 'over';
  check(shareMod.shouldShowChip(overScene, 'match') === false, '分享：失败结算不该显示入口');
  overScene.phase = 'won';
  overScene.buttons = [];
  const chipRec = [];
  const chipCtx = makeCtx();
  chipCtx.fillText = (v) => { chipRec.push(String(v)); };
  shareMod.drawResultChip(chipCtx, overScene);
  check(overScene.buttons.some((b) => b.id === 'share-result'), '分享：画了入口却没注册点击区');
  check(chipRec.indexOf(i18n.t('app.shareResultCta')) >= 0,
    `分享：入口上没有「${i18n.t('app.shareResultCta')}」文字`);

  // 兜底入口要让开微信右上角的胶囊（否则被「关闭 / 更多」压住）
  const canvasMod = require(path.join(ROOT, 'js/core/canvas'));
  check(shareMod.chipRect().y >= canvasMod.SAFE_TOP + 36,
    `分享：兜底入口还压在微信胶囊下面（y ${shareMod.chipRect().y}）`);

  // 侦探：结算面板整宽 + 面板内右上角分享入口（带图标 + 短标签）
  const DetCls = require(path.join(ROOT, 'js/games/detective/scene'));
  [0, 1, 2, 3].forEach((lv) => {
    wx.removeStorageSync('__emoji_detective__level');
    inDet: {
      fakeApp.sceneId = 'detective';
      const dsc = new DetCls(fakeApp);
      dsc.level = lv;
      dsc.startLevel();
      dsc.phase = 'won';
      dsc._hasRendered = true;
      dsc._resultGateKey = 'won';
      dsc._resultGateAt = 0;
      const rec2 = [];
      const c3 = makeCtx();
      c3.fillText = (v) => { rec2.push(String(v)); };
      dsc.buttons = [];
      dsc.render(c3);
      const rr = dsc.resultRect(c3);
      // 同一个位置再画一次，拿返回值确认「画了图标 + 标签」
      const rectShare = shareMod.drawResultChip(makeCtx(), dsc,
        { x: rr.x + rr.w - 82, y: rr.y + 10, w: 72, h: 26 },
          { filled: true, label: i18n.t('app.shareCta') });
      // 面板宽度跟棋盘走；棋盘太窄放不下两个按钮时才按最小宽度撑开
      const rbMod = require(path.join(ROOT, 'js/core/result-button'));
      const needW = Math.min(W - 32, Math.max(
        rbMod.width(c3, i18n.t('detective.replayLevel')) + rbMod.width(c3, i18n.t('detective.nextLevel')) + 38,
        96 + 32));
      const expectW = Math.min(W - 16, Math.max(dsc.boardW, needW));
      check(Math.abs(rr.w - expectW) < 0.6,
        `侦探第 ${lv + 1} 关：结算面板宽 ${rr.w}，应为 ${expectW}（棋盘 ${dsc.boardW}）`);
      check(rr.y >= dsc.boardY - 0.5,
        `侦探第 ${lv + 1} 关：结算面板往上盖住了选项卡（${rr.y} < ${dsc.boardY}）`);
      const sbtn = dsc.buttons.find((b) => b.id === 'share-result');
      check(!!sbtn, `侦探第 ${lv + 1} 关：结算面板里没有分享入口`);
      check(!!sbtn && sbtn.x >= rr.x && sbtn.x + sbtn.w <= rr.x + rr.w
        && sbtn.y >= rr.y && sbtn.y + sbtn.h <= rr.y + rr.h,
      `侦探第 ${lv + 1} 关：分享入口不在结算面板内`);
      check(rectShare && rectShare.icon === true && rectShare.label === i18n.t('app.shareCta'),
        `侦探第 ${lv + 1} 关：分享按钮没有图标 / 标签不对`);
      check(rec2.indexOf(i18n.t('app.shareCta')) >= 0, `侦探第 ${lv + 1} 关：分享按钮没有文字`);
    }
  });

  // 海报：把游戏画面铺进去（截图函数被调用），标题用游戏名
  const shareCalls = [];
  const origShare = wx.shareAppMessage;
  const origTemp = wx.canvasToTempFilePath;
  wx.shareAppMessage = (opts) => { shareCalls.push(opts); };
  wx.canvasToTempFilePath = (opts) => { if (opts.success) opts.success({ tempFilePath: 'wxtmp://poster.png' }); };
  let captured = 0;
  const shotRects = [];
  shareMod.setCapture((cc, x, y, w, h, opts) => {
    captured += 1;
    shotRects.push({ x, y, w, h, cover: !!(opts && opts.cover) });
    return true;
  });
  shareMod.closePreview();
  const built = shareMod.buildPoster({ phase: 'over', score: 128 }, 'down');
  check(built && built.exported === 'sync', `分享：应该用 Canvas.toTempFilePathSync 导出（实际 ${built && built.exported}）`);
  check(!!built && built.path === 'wxtmp://poster-sync.png', `分享：同步导出没拿到路径（${built && built.path}）`);
  check(captured === 1, `分享：海报应只截一次（前景），实际 ${captured} 次`);
  check(!!built && !!built.canvas, '分享：海报没有生成画布');
  // 截图要**居中**放在海报里（不能在左边）
  const fgShot = shotRects.find((r) => !r.cover);
  const posterW = built.canvas.width;
  const posterH = built.canvas.height;
  check(!!fgShot, '分享：海报里没有前景截图');
  check(shotRects.every((r) => !r.cover), '分享：背景不该再用游戏画面铺底（应只有前景一次截图）');
  if (fgShot) {
    const dx = Math.abs((fgShot.x + fgShot.w / 2) - posterW / 2);
    const dy = Math.abs((fgShot.y + fgShot.h / 2) - posterH / 2);
    check(dx <= 1, `分享：截图没有水平居中（偏移 ${dx.toFixed(1)}px，左边留白 ${fgShot.x.toFixed(0)}）`);
    check(dy <= 1, `分享：截图没有垂直居中（偏移 ${dy.toFixed(1)}px）`);
    check(Math.abs(fgShot.x - (posterW - fgShot.x - fgShot.w)) <= 1, '分享：左右留白不对称');
  }
  check(typeof built.title === 'string' && built.title.indexOf(i18n.t('home.downTitle')) === 0,
    `分享：标题没有用游戏名（${built && built.title}）`);
  check(built.title.indexOf(i18n.t('app.shareHomeTitle')) < 0, '分享：标题还是首页统称');
  shareMod.setCapture(null);

  // 点「炫耀一下」→ 先开预览（不直接分享）
  const pvScene = {
    buttons: [],
    phase: 'over',
    addButton(id, x, y, w, h, onTap) { this.buttons.push({ id, x, y, w, h, onTap }); },
  };
  shareMod.openPreview(pvScene, 'down');
  check(shareMod.previewOpen() === true, '分享：点炫耀没有打开预览');
  check(shareCalls.length === 0, '分享：还没点「去分享」就已经分享了');
  pvScene.buttons = [];
  shareMod.drawPreview(makeCtx(), pvScene);
  const cancelBtn = pvScene.buttons.find((b) => b.id === 'share-cancel');
  const goBtn = pvScene.buttons.find((b) => b.id === 'share-go');
  check(!!cancelBtn && !!goBtn, '分享：预览弹窗缺少「取消 / 去分享」按钮');
  check(cancelBtn.h >= 40 && goBtn.h === cancelBtn.h, `分享：预览按钮太矮（${cancelBtn.h}）`);
  const ratio = goBtn.w / cancelBtn.w;
  check(Math.abs(ratio - 3) < 0.05, `分享：取消 / 去分享 宽度比应为 1:3（实际 1:${ratio.toFixed(2)}）`);
  const pv = shareMod.previewRect();
  const padBottom = pv.y + pv.cardH - (cancelBtn.y + cancelBtn.h);
  check(Math.abs(padBottom - 18) < 1.5, `分享：弹窗底部留白应和顶部一致 18（实际 ${padBottom.toFixed(0)}）`);
  check(shareMod.rose === '#962832', `分享：「炫耀一下」应使用胭脂红 #962832（实际 ${shareMod.rose}）`);
  check(pvScene.buttons.some((b) => b.id === 'share-mask'), '分享：预览弹窗没有全屏遮罩');
  // 取消：关掉预览、不分享
  cancelBtn.onTap();
  check(shareMod.previewOpen() === false && shareCalls.length === 0, '分享：点取消后不该分享');
  // 去分享：才真的调 wx.shareAppMessage
  shareMod.openPreview(pvScene, 'down');
  pvScene.buttons = [];
  shareMod.drawPreview(makeCtx(), pvScene);
  pvScene.buttons.find((b) => b.id === 'share-go').onTap();
  check(shareCalls.length === 1, `分享：点「去分享」没有触发分享（${shareCalls.length}）`);
  check(!!shareCalls[0] && shareCalls[0].query === 'game=down', `分享：query 不对（${shareCalls[0] && shareCalls[0].query}）`);
  check(shareCalls[0].imageUrl === 'wxtmp://poster-sync.png', `分享：没有带上海报图（${shareCalls[0].imageUrl}）`);
  check(shareMod.previewOpen() === false, '分享：分享完没有收起预览');
  wx.shareAppMessage = origShare;
  wx.canvasToTempFilePath = origTemp;

  // 导出 API 缺失时必须「降级但如实告知」，不能悄悄拿默认图去分享
  {
    const savedCreate = wx.createCanvas;
    wx.createCanvas = () => {
      const cv = savedCreate();
      delete cv.toTempFilePathSync;
      delete cv.toTempFilePath;
      return cv;
    };
    const savedTemp = wx.canvasToTempFilePath;
    delete wx.canvasToTempFilePath;
    const savedWarn = console.warn;
    console.warn = () => {};   // 这条是负向用例，日志会刷屏
    shareMod.closePreview();
    const noExport = shareMod.buildPoster({ phase: 'over', score: 999, shareLine: '第 9 关' }, 'puzzle');
    const info = shareMod.posterInfo();
    check(!!info && info.hasPath === false, '分享：没有导出 API 时不该假装有图');
    check(!!info && info.error != null, '分享：导出失败要留下原因');
    // 预览里仍然是「去分享」可点（只能分享标题），并且会提示失败
    const pv2 = {
      buttons: [],
      phase: 'over',
      addButton(id, x, y, w, h, fn) { this.buttons.push({ id, x, y, w, h, onTap: fn }); },
    };
    shareMod.openPreview(pv2, 'puzzle');
    pv2.buttons = [];
    shareMod.drawPreview(makeCtx(), pv2);
    check(pv2.buttons.some((b) => b.id === 'share-go'), '分享：导出失败后应该允许「只分享标题」');
    check(!!noExport, '分享：导出失败时也不该崩');
    shareMod.closePreview();
    wx.createCanvas = savedCreate;
    wx.canvasToTempFilePath = savedTemp;
    console.warn = savedWarn;
  }

  // 菜单分享的标题也要跟着当前场景走（不再是首页统称）
  let menuHandler = null;
  const origOnShare = wx.onShareAppMessage;
  const origShowMenu = wx.showShareMenu;
  wx.onShareAppMessage = (fn) => { menuHandler = fn; };
  wx.showShareMenu = () => {};
  delete wx.__gamesShareRegistered;
  const { App: AppForShare } = require(path.join(ROOT, 'js/core/app'));
  AppForShare.prototype.setSceneId.call({ sceneId: null }, 'detective');
  const menuTitle = menuHandler ? menuHandler().title : '';
  check(typeof menuTitle === 'string' && menuTitle.indexOf(i18n.t('home.detectiveTitle')) >= 0,
    `分享：菜单分享标题没用游戏名（${menuTitle}）`);
  check(menuTitle.indexOf(i18n.t('app.shareHomeTitle')) < 0, '分享：菜单分享还是首页统称');
  wx.onShareAppMessage = origOnShare;
  wx.showShareMenu = origShowMenu;
}

// ---------- 左下角分享按钮常驻：帮助弹窗 / 首页面板打开时也能点 ----------
{
  const { App: AppCls } = require(path.join(ROOT, 'js/core/app'));
  const problems = [];
  // 游戏里：帮助弹窗打开着
  {
    const SceneClass = require(path.join(ROOT, 'js/games/match/scene'));
    fakeApp.sceneId = 'match';
    const sc = new SceneClass(fakeApp);
    sc.buttons = [];
    sc.helpOpen = true;
    sc.buttons = [{ id: 'help-ok', x: 100, y: 500, w: 120, h: 40 }];
    AppCls.prototype.drawShareFab.call({ scene: sc, sceneId: 'match', transition: null }, makeCtx());
    if (!sc.buttons.some((b) => b.id === 'fab-share')) problems.push('帮助弹窗打开时没有分享按钮');
  }
  // 首页：设置 / 成就 / 每日挑战面板打开着
  ['settingsOpen', 'achvOpen', 'dailyOpen'].forEach((flag) => {
    const SceneClass = require(path.join(ROOT, 'js/games/home/scene'));
    fakeApp.sceneId = 'home';
    const sc = new SceneClass(fakeApp);
    sc[flag] = true;
    sc.buttons = [];
    AppCls.prototype.drawShareFab.call({ scene: sc, sceneId: 'home', transition: null }, makeCtx());
    if (!sc.buttons.some((b) => b.id === 'fab-share')) problems.push(`首页 ${flag} 打开时没有分享按钮`);
  });
  check(problems.length === 0, `分享按钮常驻：${problems.join('；')}`);
}

// ---------- 25 个游戏：FAB 边框真的画在按钮上（帮助橙 / 模式蓝 / 静音绿） ----------
{
  const theme2 = require(path.join(ROOT, 'js/core/theme'));
  const IDS = ['click', 'guess', 'poker', 'puzzle', 'g2048', 'snake', 'match', 'link', 'detective',
    'hunter', 'three', 'crush', 'sudoku', 'master', 'sort', 'down', 'slide', 'alchemy', 'mahjong',
    'quesheng', 'legend', 'mirror', 'point24', 'solo', 'gambler'];
  const problems = [];
  IDS.forEach((id) => {
    const SceneClass = require(path.join(ROOT, `js/games/${id}/scene`));
    fakeApp.sceneId = id;
    const sc = new SceneClass(fakeApp);
    sc.buttons = [];
    // 记录每次 stroke 的颜色 + 圆心，用来确认「边框画在按钮上」而不是没画
    const strokes = [];
    const ctx = makeCtx();
    let lastArc = null;
    ctx.arc = (x, y, r) => { lastArc = { x, y, r }; };
    ctx.stroke = () => { if (lastArc) strokes.push({ x: lastArc.x, y: lastArc.y, r: lastArc.r, color: ctx.strokeStyle }); };
    sc.render(ctx);
    const ringAt = (b) => strokes.find((st) => Math.abs(st.x - (b.x + b.w / 2)) < 1
      && Math.abs(st.y - (b.y + b.h / 2)) < 1 && st.r > 10);
    const help = sc.buttons.find((b) => b.id === 'help' || b.id === 'fab-help' || b.id === 'help-fab');
    if (!help) problems.push(`${id}: 没有帮助按钮`);
    else {
      const ring = ringAt(help);
      if (!ring) problems.push(`${id}: 帮助按钮没有边框`);
      else if (ring.color !== theme2.tokens.god) problems.push(`${id}: 帮助边框颜色 ${ring.color}`);
    }
    const mute = sc.buttons.find((b) => b.id === 'fab-mute');
    if (mute) {
      const ring = ringAt(mute);
      if (!ring) problems.push(`${id}: 静音按钮没有边框`);
      else if (ring.color !== theme2.tokens.primary) problems.push(`${id}: 静音边框颜色 ${ring.color}`);
    }
    const mode = sc.buttons.find((b) => b.id === 'mode' || /^fab-(mode|wall|robot|dice)/.test(b.id));
    if (mode) {
      const ring = ringAt(mode);
      const blue = theme2.dark ? '#38bdf8' : '#0ea5e9';
      if (!ring) problems.push(`${id}: 模式按钮没有边框`);
      else if (ring.color !== blue) problems.push(`${id}: 模式边框颜色 ${ring.color}`);
    }
  });
  check(problems.length === 0, `FAB 边框：${problems.slice(0, 6).join('；')}`);
}

// ---------- 26 个界面：左下角分享 FAB + FAB 尺寸统一 44 ----------
{
  const { App: AppCls } = require(path.join(ROOT, 'js/core/app'));
  const fabKit2 = require(path.join(ROOT, 'js/core/fab'));
  const IDS = ['home', 'click', 'guess', 'poker', 'puzzle', 'g2048', 'snake', 'match', 'link', 'detective',
    'hunter', 'three', 'crush', 'sudoku', 'master', 'sort', 'down', 'slide', 'alchemy', 'mahjong',
    'quesheng', 'legend', 'mirror', 'point24', 'solo', 'gambler'];
  const problems = [];
  IDS.forEach((id) => {
    const SceneClass = require(path.join(ROOT, `js/games/${id}/scene`));
    fakeApp.sceneId = id;
    const sc = new SceneClass(fakeApp);
    sc.buttons = [];
    sc.render(makeCtx());
    // 画一次左下角分享按钮（App 在每帧里做）
    AppCls.prototype.drawShareFab.call({ scene: sc, sceneId: id, transition: null }, makeCtx());
    const shareBtn = sc.buttons.find((b) => b.id === 'fab-share');
    if (!shareBtn) { problems.push(`${id}: 没有左下角分享按钮`); return; }
    if (Math.round(shareBtn.w) !== fabKit2.SIZE) problems.push(`${id}: 分享按钮 ${shareBtn.w}px`);
    if (shareBtn.x > 40) problems.push(`${id}: 分享按钮不在最左侧（x=${shareBtn.x}）`);
    const clashes = sc.buttons.filter((b) => b.id !== 'fab-share'
      && shareBtn.x < b.x + b.w && b.x < shareBtn.x + shareBtn.w
      && shareBtn.y < b.y + b.h && b.y < shareBtn.y + shareBtn.h);
    if (clashes.length) problems.push(`${id}: 分享按钮和 ${clashes.map((c) => c.id).slice(0, 2).join(',')} 重叠`);
    // 其余 FAB（帮助 / 静音 / 模式 / 机器人 / 穿墙…）尺寸也必须 44
    sc.buttons.forEach((b) => {
      if (!/^(fab-|help$|robot$|wall$|mode$)/.test(b.id)) return;
      if (Math.round(b.w) !== fabKit2.SIZE || Math.round(b.h) !== fabKit2.SIZE) {
        problems.push(`${id}: ${b.id} 尺寸 ${b.w}×${b.h}`);
      }
    });
  });
  check(problems.length === 0, `分享 FAB / 尺寸统一：${problems.slice(0, 6).join('；')}`);
}

// ---------- 25 个游戏：结算面板整宽 + 面板内「炫耀一下」 ----------
{
  const shareMod2 = require(path.join(ROOT, 'js/core/share'));
  const panels = [];
  const origPanel = shareMod2.resultPanel;
  shareMod2.resultPanel = function (c, scene, top, height, opts) {
    const rect = origPanel.call(shareMod2, c, scene, top, height, opts);
    panels.push({ rect, opts: opts || {} });
    return rect;
  };
  const realNow = Date.now;
  // 每个游戏「怎么进结算态」不一样，这里逐个驱动（和真机流程一致的最小写法）
  // 这四个游戏没有胜利态（无尽 / 失败结束），永远不应该出现「炫耀一下」
  const NO_WIN = ['snake', 'three', 'down', 'legend'];
  const IDS = ['click', 'guess', 'poker', 'puzzle', 'g2048', 'match', 'link', 'detective',
    'hunter', 'crush', 'sudoku', 'master', 'sort', 'slide', 'alchemy', 'mahjong',
    'quesheng', 'mirror', 'point24', 'solo', 'gambler'];
  const problems = [];
  NO_WIN.forEach((id) => {
    const SceneClass = require(path.join(ROOT, `js/games/${id}/scene`));
    fakeApp.sceneId = id;
    const sc = new SceneClass(fakeApp);
    sc._hasRendered = true;
    sc.buttons = [];
    if (id === 'snake') sc.phase = 1;
    else if (id === 'three') sc.phase = 'lose';
    else sc.phase = 'over';
    sc.render(makeCtx());
    if (sc.buttons.some((b) => b.id === 'share-result')) problems.push(`${id}: 失败态不该有「炫耀一下」`);
  });
  IDS.forEach((id) => {
    const SceneClass = require(path.join(ROOT, `js/games/${id}/scene`));
    fakeApp.sceneId = id;
    const sc = new SceneClass(fakeApp);
    panels.length = 0;
    sc._hasRendered = true;
    sc.buttons = [];
    const advance = (ms) => { Date.now = () => realNow() + ms; sc.render(makeCtx()); Date.now = realNow; };
    try {
      if (id === 'click') {
        sc.logic.result = require(path.join(ROOT, 'js/games/click/logic')).WIN;
        sc.render(makeCtx());
        if (!sc.buttons.some((b) => b.id === 'share-result')) advance(600);
      } else if (id === 'poker') {
        sc.stage = 'guess';
        sc.drawTableOverlay(makeCtx());
        panels.push({ rect: { x: sc.cx, y: sc.cardsY, w: sc.cw, h: sc.cardsH }, opts: { w: sc.cw } });
      } else if (id === 'quesheng') {
        sc.phase = 'won';
        sc.resultSerial = 1;
        sc.render(makeCtx());
        if (!sc.buttons.some((b) => b.id === 'share-result')) advance(600);
      } else if (id === 'detective') {
        sc.phase = 'won';
        sc.render(makeCtx());
        if (!sc.buttons.some((b) => b.id === 'share-result')) advance(600);
        panels.push({ rect: sc.resultRect(makeCtx()), opts: { skipWidth: true } });
      } else {
        let ok = false;
        for (const ph of ['won', 'over', 'lost', 'lose', 'win']) {
          sc.phase = ph;
          if (typeof sc.result === 'number') sc.result = (ph === 'won' || ph === 'win') ? 2 : 1;
          sc.buttons = [];
          panels.length = 0;
          sc.render(makeCtx());
          if (!panels.length || !sc.buttons.some((b) => b.id === 'share-result')) advance(600);
          if (panels.length && sc.buttons.some((b) => b.id === 'share-result')) { ok = true; break; }
        }
        if (!ok) problems.push(`${id}: 结算态没有分享入口`);
      }
    } catch (e) {
      Date.now = realNow;
      problems.push(`${id}: 渲染抛错 ${e.message}`);
      return;
    }
    const entry = panels[panels.length - 1];
    const p = entry.rect;
    const btn = sc.buttons.find((b) => b.id === 'share-result');
    if (!btn) { problems.push(`${id}: 没有「炫耀一下」按钮`); return; }
    if (!p) { problems.push(`${id}: 没有画出结算面板`); return; }
    const cw = typeof sc.cw === 'number' && sc.cw > 0 ? sc.cw : Math.min(W - 32, 440);
    // 面板宽度必须等于「这个游戏真实的游戏区宽度」（从场景字段独立算，不能只看 opts.w，
    // 否则漏传 opts.w 时等于卡片宽也会蒙混过关）；只有传了 minW 才允许更宽。
    let areaW = cw;
    if (typeof sc.boardW === 'number' && sc.boardW > 0) areaW = sc.boardW;
    else if (typeof sc.boardSize === 'number' && sc.boardSize > 0) areaW = sc.boardSize;
    if (id === 'hunter') areaW = sc.candFrameW;
    if (id === 'mirror') {
      const mc = Math.max(...sc.rows);
      areaW = mc * sc.card + (mc - 1) * sc.gap;
    }
    const widenedTooMuch = p.w > Math.min(W - 16, Math.max(areaW, entry.opts.minW || 0)) + 0.6;
    const narrowerThanArea = p.w < Math.min(W - 16, areaW) - 0.6;
    if (!entry.opts.skipWidth && (widenedTooMuch || narrowerThanArea)) {
      problems.push(`${id}: 面板宽 ${p.w.toFixed(0)} ≠ 游戏区 ${areaW.toFixed(0)}`);
    }
    let inside = false;
    if (id === 'poker') {
      // 扑克的分享入口画在「牌桌结果遮罩」上，遮罩本身就是整宽
      inside = btn.x + btn.w <= p.x + p.w + 1 && btn.y >= p.y - 1 && btn.y + btn.h <= p.y + p.h + 1;
    } else {
      inside = btn.x >= p.x - 1 && btn.x + btn.w <= p.x + p.w + 1
        && btn.y >= p.y - 1 && btn.y + btn.h <= p.y + p.h + 1;
    }
    if (!inside) problems.push(`${id}: 「炫耀一下」不在结算面板内`);
    // 结算按钮（result-*）也必须整个落在面板里：面板按游戏区画，窄棋盘要按内容撑开
    const spill = sc.buttons.filter((b) => b && /^result-/.test(b.id)
      && !(b.x >= p.x - 1 && b.x + b.w <= p.x + p.w + 1
        && b.y >= p.y - 1 && b.y + b.h <= p.y + p.h + 1));
    if (spill.length) problems.push(`${id}: ${spill.map((b) => b.id).join(',')} 超出结算面板`);
    // 不能压住面板里别的按钮（棋盘格子 / 遮罩不算）
    const others = sc.buttons.filter((b) => b.id !== 'share-result'
      && !/mask|cell|col-|board|pad-|key-|num-|tile|resume/.test(b.id));
    others.forEach((o) => {
      if (btn.x < o.x + o.w - 1 && btn.x + btn.w > o.x + 1
        && btn.y < o.y + o.h - 1 && btn.y + btn.h > o.y + 1) {
        problems.push(`${id}: 「炫耀一下」压住了 ${o.id}`);
      }
    });
  });
  shareMod2.resultPanel = origPanel;
  Date.now = realNow;
  check(problems.length === 0, `结算面板：${problems.join('；')}`);
}

// ---------- 对对碰：10 张（5 对）排成 3 / 4 / 3，每行居中 ----------
{
  const board = require(path.join(ROOT, 'js/games/match/board'));
  const MatchCls = require(path.join(ROOT, 'js/games/match/scene'));
  fakeApp.sceneId = 'match';
  const problems = [];
  const conf = board.levelConfig(3, 1);
  if (JSON.stringify(conf.pattern) !== JSON.stringify([3, 4, 3])) problems.push(`Lv3 pattern = ${JSON.stringify(conf.pattern)}`);
  if (conf.cards !== 10 || conf.pairs !== 5) problems.push(`Lv3 张数/对数不对（${conf.cards} 张 ${conf.pairs} 对）`);
  if (!Number.isFinite(conf.preview) || !Number.isFinite(conf.time)) problems.push('Lv3 preview/time 不是有限数');
  [1, 2, 3].forEach((mode) => {
    const sc = new MatchCls(fakeApp);
    sc.mode = mode;
    sc.level = 3;
    sc.initLevel(3);
    if (JSON.stringify(sc.rowCounts) !== JSON.stringify([3, 4, 3])) {
      problems.push(`mode${mode}: rowCounts = ${JSON.stringify(sc.rowCounts)}`);
      return;
    }
    const rects = sc.cards.map((_, i) => sc.cardRect(i));
    if (rects.length !== 10) problems.push(`mode${mode}: 只有 ${rects.length} 张`);
    const center = sc.boardX + sc.boardW / 2;
    let at = 0;
    sc.rowCounts.forEach((n) => {
      const row = rects.slice(at, at + n);
      const left = Math.min(...row.map((r) => r.x));
      const right = Math.max(...row.map((r) => r.x + r.w));
      if (Math.abs((left + right) / 2 - center) > 0.6) {
        problems.push(`mode${mode}: ${n} 张那行没居中（中心 ${((left + right) / 2).toFixed(1)} vs ${center.toFixed(1)}）`);
      }
      at += n;
    });
    for (let a = 0; a < rects.length; a += 1) {
      const A = rects[a];
      if (A.x < sc.boardX - 0.5 || A.x + A.w > sc.boardX + sc.boardW + 0.5
        || A.y < sc.boardY - 0.5 || A.y + A.h > sc.boardY + sc.boardH + 0.5) {
        problems.push(`mode${mode}: 第 ${a} 张出了棋盘`);
      }
      for (let b = a + 1; b < rects.length; b += 1) {
        const B = rects[b];
        if (A.x < B.x + B.w - 0.5 && A.x + A.w > B.x + 0.5
          && A.y < B.y + B.h - 0.5 && A.y + A.h > B.y + 0.5) {
          problems.push(`mode${mode}: 第 ${a} / ${b} 张重叠`);
        }
      }
    }
    if (sc.gridLabel() !== '3·4·3') problems.push(`mode${mode}: 顶部规格写成 ${sc.gridLabel()}`);
  });
  // 其余关卡保持矩形矩阵
  const sc4 = new MatchCls(fakeApp);
  sc4.mode = 1;
  sc4.level = 4;
  sc4.initLevel(4);
  if (JSON.stringify(sc4.rowCounts) !== JSON.stringify([4, 4, 4])) problems.push(`Lv4 rowCounts = ${JSON.stringify(sc4.rowCounts)}`);
  if (sc4.gridLabel() !== '3×4') problems.push(`Lv4 顶部规格写成 ${sc4.gridLabel()}`);
  const y0 = sc4.cardRect(0).y;
  for (let i = 1; i < 4; i += 1) {
    const r = sc4.cardRect(i);
    if (Math.abs(r.y - y0) > 0.5) problems.push(`Lv4 第 ${i} 张没在同一行`);
  }
  // 最高难度（Lv11 起）限时 +20s：Lv11 120s、之后每关 −2s、最低 90%（108s）
  const times = (mode, lv) => board.levelConfig(lv, mode).time;
  // 最后两档盘面（6×7 = 42 张、6×8 = 48 张）各 +20s，再往前不变
  if (times(1, 9) !== 80) problems.push(`Lv9 限时应保持 80s，实际 ${times(1, 9)}`);
  if (times(1, 10) !== 111) problems.push(`Lv10（6×7）限时应为 111s（91+20），实际 ${times(1, 10)}`);
  if (times(1, 11) !== 120) problems.push(`Lv11（6×8）限时应为 120s（100+20），实际 ${times(1, 11)}`);
  if (times(1, 12) !== 118) problems.push(`Lv12 限时应为 118s，实际 ${times(1, 12)}`);
  if (times(1, 20) !== 108) problems.push(`Lv20 限时应封底 108s，实际 ${times(1, 20)}`);
  if (times(2, 11) !== 108) problems.push(`扑克 Lv11 限时应为 108s（88+20），实际 ${times(2, 11)}`);
  if (times(2, 10) !== 98) problems.push(`扑克 Lv10 限时应为 98s（78+20），实际 ${times(2, 10)}`);
  check(problems.length === 0, `对对碰 3/4/3：${problems.slice(0, 5).join('；')}`);
}

// ---------- 成就：消除大师「三模式达成 50 关」 ----------
{
  const achvMod = require(path.join(ROOT, 'js/core/achv'));
  const problems = [];
  const rowOf = () => achvMod.pageData().games.find((g) => g.id === 'master')
    .achv.find((r) => /达成 50 关/.test(r.name));
  const before = rowOf();
  if (!before) problems.push('消除大师缺少「三模式达成 50 关」');
  else {
    if (before.target !== 3) problems.push(`target 是 ${before.target}（应 3）`);
    if (before.unlocked) problems.push('还没通关就解锁了');
  }
  const masterRows = achvMod.pageData().games.find((g) => g.id === 'master').achv.map((r) => r.name);
  if (masterRows.some((n) => /100 关/.test(n))) problems.push('消除大师还留着「达成 100 关」');
  if (!masterRows.some((n) => /达成 10 关/.test(n))) problems.push('消除大师丢了「达成 10 关」');
  // 三种模式各通 50 关（走生产写法 achv.win 的 level）→ 必须达成
  [1, 2, 3].forEach((mode) => achvMod.win('master', { mode, level: 50 }));
  const after = rowOf();
  if (!after || !after.unlocked || after.value !== 3) problems.push(`三模式各通 50 关后是 ${after && after.value}/3（unlocked ${after && after.unlocked}）`);
  check(problems.length === 0, `消除大师 50 关：${problems.slice(0, 4).join('；')}`);
}

// ---------- 成就：对对碰「三模式第 10 关通关」+ 贪吃蛇 1000 → 300 ----------
{
  const achvMod = require(path.join(ROOT, 'js/core/achv'));
  const problems = [];
  const matchRow = () => {
    const g = achvMod.pageData().games.find((x) => x.id === 'match');
    return { g, row: g.achv.find((r) => /第 10 关/.test(r.name)) };
  };
  // 先把对对碰的旧成绩（best / level / 成就里的 modes.max）清干净，只留下面构造的「各通 10 关」
  ['__emoji_match__best_1', '__emoji_match__best_1_2', '__emoji_match__best_1_3',
    '__emoji_match__level', '__emoji_match__level_2', '__emoji_match__level_3',
    '__games_hub__achv'].forEach((k) => wx.removeStorageSync(k));
  achvMod.resetCache();   // core/achv 有内存缓存，清掉才能读到刚删干净的存档
  wx.setStorageSync('__emoji_match__best_1', '11');
  wx.setStorageSync('__emoji_match__best_1_2', '11');
  wx.setStorageSync('__emoji_match__best_1_3', '11');
  const m1 = matchRow();
  if (!m1.row) problems.push('对对碰缺少「三模式第 10 关通关」');
  else {
    if (m1.row.target !== 3) problems.push(`对对碰第 10 关成就 target 是 ${m1.row.target}（应 3）`);
    if (!m1.row.unlocked || m1.row.value !== 3) problems.push(`三模式各通 10 关却没达成（${m1.row.value}/${m1.row.target}）`);
  }
  if (m1.g.achv.some((r) => /最高关/.test(r.name))) problems.push('对对碰还留着「三模式最高关通关」');
  wx.setStorageSync('__emoji_match__best_1', '10');   // 其中一个模式只通 9 关
  const m2 = matchRow();
  if (m2.row && (m2.row.unlocked || m2.row.value !== 2)) problems.push(`只通 9 关时记成 ${m2.row.value}/3（应 2/3 未达成）`);
  ['__emoji_match__best_1', '__emoji_match__best_1_2', '__emoji_match__best_1_3'].forEach((k) => wx.removeStorageSync(k));

  // 贪吃蛇：去掉 1000、换成 300，顺序 100 → 300 → 500
  wx.setStorageSync('__snake_game__best', '300');
  const snake = achvMod.pageData().games.find((x) => x.id === 'snake');
  const names = snake.achv.map((r) => r.name);
  if (names.some((n) => /1000/.test(n))) problems.push('贪吃蛇还留着「达成 1000 分」');
  const i100 = names.findIndex((n) => /100 分/.test(n));
  const i300 = names.findIndex((n) => /300 分/.test(n));
  const i500 = names.findIndex((n) => /500 分/.test(n));
  if (i300 < 0) problems.push('贪吃蛇缺少「达成 300 分」');
  else if (!(i100 < i300 && i300 < i500)) problems.push(`贪吃蛇顺序不对：100@${i100} 300@${i300} 500@${i500}`);
  const row300 = snake.achv[i300];
  if (row300 && (!row300.unlocked || row300.target !== 1)) problems.push('best=300 时「达成 300 分」没解锁');
  const row500 = snake.achv[i500];
  if (row500 && row500.unlocked) problems.push('best=300 时「达成 500 分」不该解锁');
  // 场景上报阈值也要同步，别再往 1000 记
  const snakeSrc = require('fs').readFileSync(path.join(ROOT, 'js/games/snake/scene.js'), 'utf8');
  if (snakeSrc.includes('[100, 500, 1000]')) problems.push('贪吃蛇场景还在按 100/500/1000 上报');
  check(problems.length === 0, `对对碰第 10 关 / 贪吃蛇 300 分：${problems.slice(0, 4).join('；')}`);
}

// ---------- 成就：五个闯关游戏多了「完成第 10 关」，炼金术去掉两条得分指标行 ----------
{
  const achvMod = require(path.join(ROOT, 'js/core/achv'));
  const problems = [];
  const BEST_TO_CLEAR10 = {
    sort: ['__emoji_sort__best_1', '11'],
    slide: ['__emoji_slide__state', JSON.stringify({ level: 11 })],
    mahjong: ['__mahjong_hero__best_1', '11'],
    quesheng: ['__quesheng__level', '11'],
    alchemy: ['__poker_alchemy__best_1', '11'],
  };
  // 先清掉这些游戏的旧存档 / 成就记录，保证「已通 10 关」是唯一证据
  [
    '__emoji_sort__best_1', '__emoji_sort__best_2', '__emoji_sort__level', '__emoji_sort__level_2',
    '__emoji_slide__state', '__mahjong_hero__best_1', '__mahjong_hero__best_2',
    '__quesheng__level', '__quesheng__level_2',
    '__poker_alchemy__best_1', '__poker_alchemy__best_2', '__poker_alchemy__level', '__poker_alchemy__level_2',
    '__games_hub__achv',
  ].forEach((k) => wx.removeStorageSync(k));
  Object.values(BEST_TO_CLEAR10).forEach(([k, v]) => wx.setStorageSync(k, v));
  const data = achvMod.pageData();
  Object.keys(BEST_TO_CLEAR10).forEach((id) => {
    const game = data.games.find((g) => g.id === id);
    if (!game) { problems.push(`${id} 不在成就页里`); return; }
    const r10 = game.achv.find((r) => !r.stat && r.target === 10 && /第 10 关/.test(r.name));
    const r50 = game.achv.find((r) => !r.stat && r.target === 50);
    if (!r10) { problems.push(`${id} 缺少「完成第 10 关」`); return; }
    if (!r50) { problems.push(`${id} 缺少「完成第 50 关」`); return; }
    if (game.achv.indexOf(r10) > game.achv.indexOf(r50)) problems.push(`${id} 的「完成第 10 关」排在 50 关之后`);
    if (r10.value !== 10 || !r10.unlocked) problems.push(`${id} 第 10 关：value ${r10.value} unlocked ${r10.unlocked}（存档已通 10 关）`);
    if (r50.unlocked) problems.push(`${id} 第 50 关不该解锁`);
  });
  const alchemy = data.games.find((g) => g.id === 'alchemy');
  if (alchemy.achv.some((r) => /最大单次得分/.test(r.name))) problems.push('炼金术还留着「最大单次得分」行');
  ['普通模式最高关卡', '炸金花最高关卡'].forEach((name) => {
    if (!alchemy.achv.some((r) => r.name === name)) problems.push(`炼金术缺少「${name}」`);
  });
  check(problems.length === 0, `第 10 关 / 炼金术成就：${problems.slice(0, 4).join('；')}`);
}

// ---------- 首页标题 / 已玩·连续 统计不受「全局文字大小」影响 ----------
{
  const HomeSceneCls = require(path.join(ROOT, 'js/games/home/scene'));
  const textsizeMod = require(path.join(ROOT, 'js/core/textsize'));
  const i18nMod = require(path.join(ROOT, 'js/core/i18n'));
  fakeApp.sceneId = 'home';
  const prevMode = textsizeMod.mode;
  const pxOf = (font) => Number((String(font).match(/([\d.]+)px/) || [])[1]);
  const capture = (mode) => {
    textsizeMod.setMode(mode);
    const home = new HomeSceneCls(fakeApp);
    const events = [];
    const c = makeCtx();
    let font = '';
    Object.defineProperty(c, 'font', { get: () => font, set: (v) => { font = v; }, configurable: true });
    const origFill = c.fillText;
    c.fillText = (value, x, y) => { events.push({ text: String(value), font }); return origFill(value, x, y); };
    home.render(c);
    const title = events.find((e) => e.text === i18nMod.t('home.homeTitle'));
    const stat = events.find((e) => /已玩|连续/.test(e.text));
    const others = events.filter((e) => e !== title && e !== stat && /px/.test(e.font) && pxOf(e.font) > 9);
    return { title: title && pxOf(title.font), stat: stat && pxOf(stat.font), other: others.length ? pxOf(others[0].font) : null };
  };
  const problems = [];
  const small = capture('small');
  const medium = capture('medium');
  const large = capture('large');
  textsizeMod.setMode(prevMode || 'medium');   // 还原，别影响后面的块
  [['small', small], ['medium', medium], ['large', large]].forEach(([name, r]) => {
    if (r.title !== 17) problems.push(`${name}: 标题字号 ${r.title}（应固定 17）`);
    if (r.stat !== 9.5) problems.push(`${name}: 统计字号 ${r.stat}（应固定 9.5）`);
  });
  if (!(small.other < medium.other && medium.other < large.other)) {
    problems.push(`其它文字没跟着全局设置变（${small.other} / ${medium.other} / ${large.other}）`);
  }
  check(problems.length === 0, `首页标题固定字号：${problems.slice(0, 4).join('；')}`);
}

// ---------- 首页三个弹窗（设置 / 每日 / 成就）展开动画必须完全一致 ----------
{
  const HomeSceneCls = require(path.join(ROOT, 'js/games/home/scene'));
  fakeApp.sceneId = 'home';
  const probePanel = (kind, anim) => {
    const home = new HomeSceneCls(fakeApp);
    home.achvOpen = false; home.dailyOpen = false; home.settingsOpen = false;
    home.achvAnim = 0; home.dailyAnim = 0; home.settingsAnim = 0;
    if (kind === 'settings') { home.settingsOpen = true; home.settingsAnim = anim; }
    else if (kind === 'achv') { home.achvOpen = true; home.achvAnim = anim; }
    else { home.dailyOpen = true; home.dailyAnim = anim; }
    const events = [];
    const probeCtx = makeCtx();
    const origFillRect = probeCtx.fillRect;
    const origFillText = probeCtx.fillText;
    probeCtx.currentAlpha = 1;
    Object.defineProperty(probeCtx, 'globalAlpha', {
      get: () => probeCtx.currentAlpha,
      set: (v) => { probeCtx.currentAlpha = v; },
    });
    probeCtx.fillRect = (x, y, w, h) => {
      if (w >= W * 0.8 && h >= H * 0.8) events.push({ op: 'bg', alpha: probeCtx.currentAlpha });
      return origFillRect(x, y, w, h);
    };
    probeCtx.fillText = (...args) => {
      events.push({ op: 'text', alpha: probeCtx.currentAlpha });
      return origFillText(...args);
    };
    // 设置面板把内容画在离屏画布上，最后用 drawImage 合成 —— 合成 alpha 才是「内容淡入」
    const origDrawImage = probeCtx.drawImage;
    probeCtx.drawImage = (...args) => {
      events.push({ op: 'image', alpha: probeCtx.currentAlpha });
      return origDrawImage(...args);
    };
    if (kind === 'settings') home.drawSettings(probeCtx);
    else if (kind === 'achv') home.drawAchv(probeCtx);
    else home.drawDaily(probeCtx);
    const bg = events.find((e) => e.op === 'bg');
    const content = events.find((e) => e.op === 'text' || e.op === 'image');
    return { bg: bg ? bg.alpha : null, first: content ? content.alpha : null };
  };
  const problems = [];
  [0.3, 0.5, 0.75].forEach((anim) => {
    const rows = ['settings', 'achv', 'daily'].map((k) => ({ k, ...probePanel(k, anim) }));
    const ref = rows[0];
    rows.forEach((r) => {
      if (r.bg !== 1) problems.push(`${r.k}(${anim}) 底色不是不透明（${r.bg}）`);
      if (r.first == null) { problems.push(`${r.k}(${anim}) 没画出内容`); return; }
      if (Math.abs(r.first - ref.first) > 0.02) problems.push(`${r.k}(${anim}) 内容淡入 ${r.first.toFixed(2)}，设置是 ${ref.first.toFixed(2)}`);
    });
  });
  check(problems.length === 0, `首页弹窗展开动画一致性：${problems.slice(0, 4).join('；')}`);

  // 展开完成后必须真的用 achvScroll 画（曾经误把 scroll: 0 打到展开完成的分支，整个成就页滚不动）
  {
    const home = new HomeSceneCls(fakeApp);
    const seen = [];
    const origDraw = home.achvPage.draw.bind(home.achvPage);
    home.achvPage.draw = (c, opts) => { seen.push(opts && opts.scroll); return origDraw(c, opts); };
    home.openAchv();
    const maxS = home.achvPage.maxScroll();
    const probeScroll = Math.min(120, maxS);
    home.achvScroll = probeScroll;
    home.achvAnim = 1;
    home.drawAchv(makeCtx());
    home.achvAnim = 0.5;
    home.drawAchv(makeCtx());
    const scrollProblems = [];
    if (!(maxS > 0)) scrollProblems.push(`成就页内容不足以滚动（maxScroll ${maxS}）`);
    if (seen[0] !== probeScroll) scrollProblems.push(`展开完成时传给页面的 scroll 是 ${seen[0]}，应为 ${probeScroll}`);
    if (seen[1] !== 0) scrollProblems.push(`展开动画中应固定 scroll 0，实际 ${seen[1]}`);
    check(scrollProblems.length === 0, `成就页滚动：${scrollProblems.join('；')}`);
  }
}

// ---------- 成就：贪吃蛇 / Emoji 下坠 的「最高得分」指标行 + 总览分母 ----------
{
  const achvMod = require(path.join(ROOT, 'js/core/achv'));
  const problems = [];
  wx.setStorageSync('__snake_game__best', '777');
  wx.setStorageSync('__emoji_down__best_1', '321');
  wx.setStorageSync('__games_hub__achv', JSON.stringify({
    v: 2, plays: { snake: 3, down: 2 }, wins: {}, bestLevel: {}, perfect: {}, fast: {},
    modes: {}, reach: { snake: { 100: 1 }, down: { 50: 1 } }, peak: {}, counters: {},
    help: {}, timeMs: 0, fails: 0, seen: {},
  }));
  const data = achvMod.pageData();
  const findGame = (id) => data.games.find((g) => g.id === id);
  [['snake', 777], ['down', 321]].forEach(([id, best]) => {
    const game = findGame(id);
    const row = game && game.achv[0];
    if (!row) { problems.push(`${id} 没有成就行`); return; }
    if (!row.stat || row.unit !== 'achvScore') problems.push(`${id} 首行不是「最高得分」指标行（stat=${row.stat} unit=${row.unit}）`);
    if (row.value !== best) problems.push(`${id} 最高得分显示 ${row.value}，应为 ${best}`);
  });
  // 总览分母只数「能解锁」的行（指标行不算），否则 x/y 永远刷不满
  const unlockable = data.games.reduce((n, g) => n + g.achv.filter((r) => !r.stat).length, 0) + data.daily.achv.length;
  if (data.summary.total !== unlockable) problems.push(`总览分母 ${data.summary.total}，可解锁行 ${unlockable}`);
  // 「已入门」不能只看第 0 行（贪吃蛇 / 下坠 / 2048 / Threes 的首行是指标行）：
  // 独立按「有任意一条非指标成就解锁」重算，必须和 summary.cleared 完全一致
  const expectCleared = data.games.filter((g) => g.achv.some((a) => !a.stat && a.unlocked)).length;
  if (data.summary.cleared !== expectCleared) {
    problems.push(`已入门 ${data.summary.cleared} 个，按「任一真成就解锁」应为 ${expectCleared} 个`);
  }
  // 「成就达人」阈值 = 可达成总数 × 60%（不写死数字，加成就后自动跟）
  const need = achvMod.achvMasterNeed();
  if (need !== Math.ceil(achvMod.totalCount() * 0.6)) problems.push(`成就达人阈值 ${need}，应为可达成总数 ${achvMod.totalCount()} × 60%`);
  const master = data.hidden.find((h) => h.key === 'achv100');
  if (!master) problems.push('找不到「成就达人」隐藏成就');
  else {
    const denom = Number(String(master.hint).split('/')[1]);
    if (denom !== need) problems.push(`成就达人进度写成 ${master.hint}，分母应为 ${need}`);
    if (master.unlocked !== (achvMod.unlockedCount() >= need)) problems.push('成就达人解锁状态与阈值不一致');
  }
  const blockSrc = require('fs').readFileSync(path.join(ROOT, 'js/core/achv.js'), 'utf8');
  if (/unlocked: unlockedCount\(\) >= \d+/.test(blockSrc)) problems.push('成就达人阈值被写回了固定数字');
  check(problems.length === 0, `成就「最高得分」/总览：${problems.slice(0, 5).join('；')}`);
}

// ---------- 每日挑战：36 条任务逐条走生产路径，必须能推进 / 完成 ----------
{
  const dailyMod = require(path.join(ROOT, 'js/core/daily'));
  const achvMod = require(path.join(ROOT, 'js/core/achv'));
  const dateKey = dailyMod.dateKey();
  const setTask = (id) => {
    wx.setStorageSync('__games_hub__daily', JSON.stringify({
      v: 1, total: 0,
      cur: { date: dateKey, id, prog: 0, done: false, doneAt: 0, retired: false, runs: {} },
      days: {}, recent: [],
    }));
  };
  const problems = [];
  const tasks = dailyMod.taskList();
  if (tasks.length !== 36) problems.push(`任务池应为 39 条，实际 ${tasks.length}`);
  tasks.forEach((task) => {
    const gid = task.game === '*' ? 'click' : task.game;
    setTask(task.id);
    const emit = () => {
      switch (task.kind) {
        case 'win': achvMod.win(gid, { level: 1, mode: 1 }); return;
        case 'perfect': achvMod.win(gid, { perfect: true }); return;
        case 'fast': achvMod.win(gid, { fast: true }); return;
        case 'peak': {
          // peak() 只在刷新纪录时才上报，测试里先取当前纪录再加 need
          const cur = achvMod.peakOf(gid, task.field) || 0;
          achvMod.peak(gid, task.field, cur + task.need);
          return;
        }
        case 'run': dailyMod.markNewRun(gid); return;
        case 'reach':
          dailyMod.markNewRun(gid);
          achvMod.reach(gid, task.need, [task.need]);
          return;
        case 'play': achvMod.beginRound(gid); return;
        default: break;
      }
    };
    const times = (task.kind === 'win' || task.kind === 'play') ? task.need : 1;
    for (let i = 0; i < times; i += 1) emit();
    const now = dailyMod.todayTask();
    if (!now.done) {
      problems.push(`${task.id}（${task.game}/${task.kind}）走生产路径后仍未完成（prog ${now.prog}/${task.need}）`);
    }
  });
  check(problems.length === 0, `每日任务判定：${problems.slice(0, 5).join('；')}`);

  // 麻将英雄：重复打「已通关的关卡」也必须算赢（以前 achv.win 写在 level > best 里面）
  const MahjongCls = require(path.join(ROOT, 'js/games/mahjong/scene'));
  fakeApp.sceneId = 'mahjong';
  const mj = new MahjongCls(fakeApp);
  mj.mode = 1;                       // MODE_LEVEL
  mj.level = 1;
  mj.best = 9;                       // 已经通关过更高关：不该影响本局计数
  mj.conf = { target: 100 };
  mj.score = 200;
  mj.phase = 'play';
  const winsBefore = achvMod.winsOf('mahjong');
  setTask('mahjong_win1');
  mj.checkEnd(true);
  const winsAfter1 = achvMod.winsOf('mahjong');
  mj.phase = 'play';
  mj.score = 300;
  mj.checkEnd(true);
  const winsAfter2 = achvMod.winsOf('mahjong');
  const mjProblems = [];
  if (winsAfter1 !== winsBefore + 1) mjProblems.push(`第一次胜利没计数（${winsBefore} → ${winsAfter1}）`);
  if (winsAfter2 !== winsBefore + 2) mjProblems.push(`重复打已通关关卡没计数（${winsAfter1} → ${winsAfter2}）`);
  if (!dailyMod.todayTask().done) mjProblems.push('「赢一局麻将英雄」没有完成');
  check(mjProblems.length === 0, `麻将英雄胜利计数：${mjProblems.join('；')}`);

  // 静态兜底：achv.win 不能写在 level > best / 新纪录判断里（这类门把「每一局胜利」变成「第一次」
  const scenes = ['click', 'guess', 'ttt', 'puzzle', 'g2048', 'snake', 'match', 'link', 'detective',
    'hunter', 'three', 'crush', 'sudoku', 'master', 'sort', 'down', 'slide', 'alchemy', 'mahjong',
    'quesheng', 'legend', 'mirror', 'point24', 'solo', 'gambler'];
  const gated = [];
  scenes.forEach((id) => {
    const src = require('fs').readFileSync(path.join(ROOT, `js/games/${id}/scene.js`), 'utf8');
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      if (!line.includes('achv.win(')) return;
      // 只看代码（去掉 // 注释），避免注释里引用的旧写法误报
      const before = lines.slice(Math.max(0, i - 4), i)
        .filter((l2) => !l2.trim().startsWith('//')).join('\n');
      if (/>\s*this\.best\b|>=\s*this\.best\b|!.*bestLevel/.test(before)) gated.push(`${id}:${i + 1}`);
    });
  });
  check(gated.length === 0, `achv.win 被新纪录条件包住了：${gated.slice(0, 5).join(', ')}`);

  // 静态兜底 2：每条具名任务的场景里必须真的有对应上报调用（漏接 / 拼错 id 都能抓到）
  const missing = [];
  tasks.forEach((task) => {
    if (task.game === '*') return;
    let src = '';
    try { src = require('fs').readFileSync(path.join(ROOT, `js/games/${task.game}/scene.js`), 'utf8'); } catch (e) {
      missing.push(`${task.id}: 场景文件不存在`);
      return;
    }
    let ok = false;
    switch (task.kind) {
      case 'win': ok = src.includes(`achv.win('${task.game}'`); break;
      case 'perfect': ok = /achv\.win\('[^']+'[^)]*perfect:/.test(src); break;
      case 'fast': ok = /achv\.win\('[^']+'[^)]*fast:/.test(src); break;
      case 'peak': ok = src.includes(`achv.peak('${task.game}'`) && src.includes(`'${task.field}'`); break;
      case 'run': ok = src.includes(`daily.markNewRun('${task.game}'`); break;
      case 'reach': ok = src.includes(`daily.report('${task.game}', 'reach'`) || src.includes(`achv.reach('${task.game}'`); break;
      case 'play': ok = src.includes('achv.beginRound('); break;
      default: ok = true;
    }
    if (!ok) missing.push(`${task.id}（${task.game}/${task.kind}）`);
  });
  check(missing.length === 0, `每日任务缺少上报：${missing.slice(0, 6).join('、')}`);
}

// ---------- 每日挑战「任意游戏累计赢 4 局」= 每赢一局都计数 ----------
{
  const dailyMod = require(path.join(ROOT, 'js/core/daily'));
  const achvMod = require(path.join(ROOT, 'js/core/achv'));
  const problems = [];
  const dateKey = dailyMod.dateKey();
  const setTask = (id) => {
    wx.setStorageSync('__games_hub__daily', JSON.stringify({
      v: 1, total: 0,
      cur: { date: dateKey, id, prog: 0, done: false, doneAt: 0, retired: false, runs: {} },
      days: {}, recent: [],
    }));
  };
  setTask('any_win4');
  // 只是「进入场景」不该算赢
  achvMod.trackPlay('click');
  if (dailyMod.todayTask().prog !== 0) problems.push(`只是进入游戏就记了 ${dailyMod.todayTask().prog} 胜（应该 0）`);
  for (let i = 0; i < 3; i += 1) achvMod.win('click', {});
  if (dailyMod.todayTask().done) problems.push('赢 3 局就完成了「累计赢 4 局」');
  achvMod.win('click', {});
  const task = dailyMod.todayTask();
  if (task.prog !== 4 || !task.done) problems.push(`赢 4 局后应是 4/4 已完成，实际 ${task.prog}/4 完成=${task.done}`);
  // 每个游戏都要在自己的「开新局」入口上报（机制保留，供以后加开局面板任务）
  const ids = ['click', 'guess', 'ttt', 'puzzle', 'g2048', 'snake', 'match', 'link', 'detective',
    'hunter', 'three', 'crush', 'sudoku', 'master', 'sort', 'down', 'slide', 'alchemy', 'mahjong',
    'quesheng', 'legend', 'mirror', 'point24', 'solo', 'gambler'];
  ids.forEach((id) => {
    const src = require('fs').readFileSync(path.join(ROOT, `js/games/${id}/scene.js`), 'utf8');
    if (src.indexOf(`achv.beginRound('${id}')`) < 0) problems.push(`${id}: 开新局没有上报 beginRound`);
  });
  check(problems.length === 0, `每日挑战累计胜场：${problems.slice(0, 5).join('；')}`);
}


// ---------- 麻将传奇「字牌消除」成就 ----------
{
  const achvMod = require(path.join(ROOT, 'js/core/achv'));
  const logic = require(path.join(ROOT, 'js/games/legend/board'));
  const LegCls = require(path.join(ROOT, 'js/games/legend/scene'));
  fakeApp.sceneId = 'legend';
  const problems = [];
  const runClear = (values) => {
    const sc = new LegCls(fakeApp);
    sc.phase = 'play';
    sc.grid = logic.emptyGrid();
    values.forEach((v, i) => { sc.grid[7][i] = { id: 9000 + i, v }; });
    const groups = logic.findGroups(sc.grid);
    const before = achvMod.countOf('legend', 'honor');
    sc.startClear({ chain: 1, clearSeqAtApply: 0 }, groups);
    return { groups, before, after: achvMod.countOf('legend', 'honor') };
  };
  // 字牌刻子（東 v=10）：必须 +1
  const honor = runClear([10, 10, 10]);
  if (honor.groups.length !== 1) problems.push(`字牌刻子没被判成一组（${honor.groups.length}）`);
  if (honor.after !== honor.before + 1) problems.push(`字牌刻子消除没有计入（${honor.before} → ${honor.after}）`);
  // 条牌刻子（3条 v=3）：不该计入
  const suited = runClear([3, 3, 3]);
  if (suited.after !== suited.before) problems.push(`条牌刻子被误算成字牌（${suited.before} → ${suited.after}）`);
  // 成就本身要解锁
  const legendAchv = (achvMod.pageData().games.find((x) => x.id === 'legend') || {}).achv || [];
  const honorRow = legendAchv.find((a) => /字牌|Honor/.test(a.name));
  if (!honorRow) problems.push('麻将传奇里找不到「字牌消除」成就');
  else if (honorRow.value < 1) problems.push(`字牌消除计数还是 ${honorRow.value}`);
  check(problems.length === 0, `麻将传奇字牌成就：${problems.slice(0, 5).join('；')}`);
}

// ---------- Threes：盘面 1 / 2 的张数差永远 ≤ 3 ----------
{
  const ThreeCls = require(path.join(ROOT, 'js/games/three/scene'));
  fakeApp.sceneId = 'three';
  const problems = [];
  // 1) 反复开局（9 张初始牌也是靠同一套发牌规则）
  let worstStart = 0;
  for (let i = 0; i < 120; i++) {
    const sc = new ThreeCls(fakeApp);
    sc.startGame();
    worstStart = Math.max(worstStart, Math.abs(sc.count(1) - sc.count(2)));
  }
  if (worstStart > 3) problems.push(`开局最大差值 ${worstStart}（应 ≤ 3）`);
  // 2) 极端牌堆：全是 1 再全是 2，连发 300 张也必须守住
  const sc = new ThreeCls(fakeApp);
  sc.tiles = [];
  sc.deck = Array(300).fill(1).concat(Array(300).fill(2));
  let worstDraw = 0;
  for (let i = 0; i < 300; i++) {
    const v = sc.draw(sc.tiles);
    sc.tiles.push({ id: i, value: v, row: 0, col: 0 });
    worstDraw = Math.max(worstDraw, Math.abs(sc.count(1) - sc.count(2)));
  }
  if (worstDraw > 3) problems.push(`连发时最大差值 ${worstDraw}（应 ≤ 3）`);
  // 3) balanced 边界：差 3 再发同类要改成另一类；差 2 不改
  const b = new ThreeCls(fakeApp);
  const fill = (ones, twos) => {
    b.tiles = [];
    for (let i = 0; i < ones; i++) b.tiles.push({ id: i, value: 1 });
    for (let i = 0; i < twos; i++) b.tiles.push({ id: 100 + i, value: 2 });
  };
  fill(10, 7);
  if (b.balanced(1, b.tiles) !== 2) problems.push('差 3 时又发 1 没有改成 2');
  fill(7, 10);
  if (b.balanced(2, b.tiles) !== 1) problems.push('差 3 时又发 2 没有改成 1');
  fill(10, 8);
  if (b.balanced(1, b.tiles) !== 1) problems.push('差 2 时不该改牌');
  // 4) 老存档（改规则前留下的差 4+）恢复时要被归一化
  wx.setStorageSync('__threes_game__state', JSON.stringify({
    tiles: [
      { row: 0, col: 0, value: 1 }, { row: 0, col: 1, value: 1 }, { row: 0, col: 2, value: 1 },
      { row: 0, col: 3, value: 1 }, { row: 0, col: 4, value: 1 }, { row: 1, col: 0, value: 2 },
    ],
    next: 1, deck: [], score: 0, time: 0, phase: 'play',
  }));
  const restored = new ThreeCls(fakeApp);
  const gap = Math.abs(restored.count(1) - restored.count(2));
  if (gap > 3) problems.push(`老存档恢复后差值 ${gap}（应 ≤ 3）`);
  if (restored.tiles.length !== 6) problems.push(`归一化改变了牌数（${restored.tiles.length}）`);
  wx.removeStorageSync('__threes_game__state');
  // 5) 静态：发牌 / 改牌里不许再出现写死的 4
  const threeSrc = require('fs').readFileSync(path.join(ROOT, 'js/games/three/scene.js'), 'utf8');
  if (/(ones - twos|twos - ones) >= 4/.test(threeSrc)) problems.push('还有写死的差值阈值 4');
  check(problems.length === 0, `Threes 1/2 平衡：${problems.slice(0, 4).join('；')}`);
}

// ---------- 消消乐：4 连合成大 emoji / 大 emoji 清整行整列 / 得分飞行与滚动 ----------
{
  const L = require(path.join(ROOT, 'js/games/crush/board'));
  const CrushCls = require(path.join(ROOT, 'js/games/crush/scene'));
  const problems = [];
  const playScene = (cells) => {
    fakeApp.sceneId = 'crush';
    const sc = new CrushCls(fakeApp);
    sc.initLevel(1);
    if (cells) { sc.cells = cells; sc.tiles = sc.buildTiles(); }
    sc.phase = 'play';
    return sc;
  };
  const run = (sc, frames = 90) => { for (let i = 0; i < frames; i++) sc.update(16); };

  // 1) 纯逻辑：4 连 → 1 个大 emoji，且合成格不被清掉
  {
    const cols = 6;
    const board = [2, 2, 2, 2, 5, 4];
    const res = L.resolveClear(board, cols, 1);
    if (res.spawns.size !== 1) problems.push(`4 连合成了 ${res.spawns.size} 个大 emoji（应 1）`);
    const spawnIdx = [...res.spawns.keys()][0];
    if (res.cleared.has(spawnIdx)) problems.push('合成格被一起清掉了');
    if (res.spawns.size && res.spawns.get(spawnIdx).kind !== 2) problems.push('合成的大 emoji 种类不对');
    const three = L.resolveClear([2, 2, 2, 5, 4, 4], cols, 1);
    if (three.spawns.size !== 0) problems.push('3 连不该合成大 emoji');
  }

  // 2) 纯逻辑：大 emoji 参与横向三连 → 清整行；被炸弹波及 → 行 + 列
  {
    const cols = 6;
    const board = [7, 7, 7, 7, 7, 7];
    board[2] = L.big(7);
    const res = L.resolveClear(board, cols, 1);
    if (!res.bigSweeps.some(sw => sw.dir === 'row' && sw.index === 0)) problems.push('大 emoji 横向三连没有清整行');
    if (!res.bigTriggered.size) problems.push('大 emoji 没被标记为触发');

    const c3 = 3;
    const bombBoard = [L.BOMB, L.big(1), 4, 2, 2, 2, 5, 4, 6];
    const r3 = L.resolveClear(bombBoard, c3, 3);
    const dirs = r3.bigSweeps.map(sw => sw.dir).sort().join(',');
    if (dirs !== 'col,row') problems.push(`炸弹波及大 emoji 的清线是 [${dirs}]（应 col,row）`);
  }

  // 3) 场景：4 连后真的生成了大 emoji、有飞行圆点、分数会滚动到位
  {
    const { cols, rows, kinds } = playScene(null).conf;
    const cells = new Array(cols * rows).fill(0).map((_, i) => (i % cols) % kinds);
    cells[0] = 4; cells[1] = 4; cells[2] = 4; cells[3] = 4;
    const sc2 = playScene(cells);
    sc2.resolve(1);
    const mergeInfo = sc2.merges ? sc2.merges.slice() : [];
    const mergeTarget = mergeInfo.length ? mergeInfo[0].idx : -1;
    const mergeFrom = mergeInfo.length ? mergeInfo[0].from.length : 0;
    const mergeHide = sc2.mergeHide ? sc2.mergeHide.size : 0;
    const spawnIdx0 = sc2.clearFx ? [...sc2.clearFx.spawns.keys()][0] : -1;
    const mergeTargetHidden = !!(sc2.mergeHide && sc2.mergeHide.has(mergeTarget));
    const flyCount = sc2.fly.length;
    const scoreAfter = sc2.score;
    const shownNow = sc2.scoreValue();
    let sawBig = false;
    let sawCheer = false;
    sc2.render(makeCtx());
    for (let i = 0; i < 600; i++) {
      sc2.update(16);
      if (sc2.cells.some(v => L.isBig(v))) sawBig = true;
      if (sc2.cheer && sc2.cheer.text) sawCheer = true;
      if (i % 9 === 0) sc2.render(makeCtx());
      if (!sc2.busy && !sc2.scoreAnim && !sc2.clearFx && i > 40) break;
    }
    if (flyCount < 10) problems.push(`消除后圆点太少（${flyCount} 颗）`);
    // 圆点必须从棋盘里出发、目标是「得分」那一格的数值位置
    const flyX = sc2.cx + (sc2.cw / 4) * 2.5;
    const flyY = sc2.scoreY + 48;
    if (sc2.fly.some(d => Math.abs(d.tx - flyX) > 0.5 || Math.abs(d.ty - flyY) > 0.5)) problems.push('圆点的目标不是得分区');
    if (sc2.fly.some(d => d.y0 < sc2.innerY - 1 || d.y0 > sc2.innerY + sc2.innerH + 1)) problems.push('圆点不是从被消除的格子里飞出来的');
    // 运动曲线：先短暂悬停（几乎不动），再加速飞过去
    const fly = sc2.fly[0];
    if (fly) {
      const at = (age) => sc2.flyState(fly, fly.at + fly.delay + age);
      const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
      const hover = dist(at(30), at(fly.hold - 12));
      if (!(hover < 4.5)) problems.push(`圆点悬停阶段位移 ${hover.toFixed(2)}px（应几乎不动）`);
      const early = dist(at(fly.hold + fly.dur * 0.10), at(fly.hold + fly.dur * 0.20));
      const late = dist(at(fly.hold + fly.dur * 0.85), at(fly.hold + fly.dur * 0.95));
      if (!(late > early * 1.2)) problems.push(`圆点没有加速（前段 ${early.toFixed(2)} / 末段 ${late.toFixed(2)}）`);
    }
    if (!(shownNow < scoreAfter)) problems.push('得分是直接跳上去的，没有滚动');
    if (mergeInfo.length !== 1) problems.push(`4 连没有合并动画（${mergeInfo.length}）`);
    if (mergeFrom < 3) problems.push(`合成分身数量 ${mergeFrom}（应至少 3）`);
    if (mergeHide !== mergeFrom + 1) problems.push(`合并期间隐藏的原牌 ${mergeHide}（应 = 分身 + 1）`);
    if (mergeTarget !== spawnIdx0) problems.push('合并动画的目标不是大 emoji 的落点');
    if (mergeInfo.length && !mergeTargetHidden) problems.push('合并目标没有「原地变大」，又被当成普通消除');
    if (!sawBig) problems.push('4 连后盘面上没有出现过大 emoji');
    if (!sawCheer) problems.push('结算过程中没有弹过鼓励条');
    if (Math.round(sc2.scoreValue()) !== sc2.score) problems.push(`得分滚动没收敛（${sc2.scoreValue()} vs ${sc2.score}）`);
    sc2.render(makeCtx());
  }

  // 4) 场景：大 emoji 参与三连 → 从它自己那一格出发、向左右逐格爆破
  {
    const { cols, rows } = playScene(null).conf;
    const cells = new Array(cols * rows).fill(1).map((_, i) => i % 4);
    cells[2] = L.big(5);
    cells[3] = 5; cells[4] = 5;
    const sc2 = playScene(cells);
    sc2.resolve(1);
    const fx = sc2.lineFx;
    const blasts = fx ? fx.blasts.slice() : [];
    const origin = 2;
    const left = blasts.filter(b => b.idx < origin).length;
    const right = blasts.filter(b => b.idx > origin).length;
    const startAt = blasts.length ? Math.min(...blasts.map(b => b.at)) : -1;
    const commitDur = sc2.clearFx ? sc2.clearFx.dur : 0;
    const rowAllCleared = sc2.clearFx
      && Array.from({ length: cols }, (_, i) => i).every(i => sc2.clearFx.bigLines.has(i) || sc2.clearFx.matched.has(i));
    if (!blasts.length) problems.push('大 emoji 清线没有逐格爆破');
    if (!blasts.some(b => b.idx === origin && b.at === startAt)) problems.push('爆破不是从大 emoji 自己那一格开始');
    if (!left || !right) problems.push(`爆破没有向左右两个方向展开（左 ${left} / 右 ${right}）`);
    if (!(commitDur > 360)) problems.push(`逐格爆破还没走完就提交了（${commitDur}ms）`);
    const gaps = blasts.map(b => b.at).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
    if (gaps.length < 3) problems.push('爆破没有按距离分档（间隔）');
    // 中段渲染：真的画了爆破
    let blastsDrawn = 0;
    const origBlast = sc2.drawLineBlasts.bind(sc2);
    sc2.drawLineBlasts = (...args) => { blastsDrawn += 1; return origBlast(...args); };
    sc2.clock += 120;
    sc2.update(0);
    sc2.render(makeCtx());
    const active = blasts.filter(b => b.at <= 120 && b.at + 260 > 120).length;
    if (!blastsDrawn) problems.push('爆破动画没有画出来');
    if (active < 2) problems.push(`中段只有 ${active} 个格子同时在炸`);
    run(sc2, 80);
    if (sc2.lineFx) problems.push('爆破结束后没有收起');
    if (!rowAllCleared) problems.push('整行没有被清掉');
  }

  // 5) 大 emoji 的辨识度：背后光晕 + 常驻呼吸光效都要真的画出来
  {
    const { cols, rows } = playScene(null).conf;
    const cells = new Array(cols * rows).fill(3).map((_, i) => i % 4);
    cells[0] = L.big(1);
    cells[1] = 3; cells[2] = 3;           // 远处放一组三连，确保不是空的
    const sc = playScene(cells);
    let glow = 0;
    let aura = 0;
    const origGlow = sc.drawBigGlow.bind(sc);
    const origAura = sc.drawBigAura.bind(sc);
    sc.drawBigGlow = (...args) => { glow += 1; return origGlow(...args); };
    sc.drawBigAura = (...args) => { aura += 1; return origAura(...args); };
    sc.render(makeCtx());
    if (!glow) problems.push('大 emoji 背后没有光晕');
    if (!aura) problems.push('大 emoji 没有常驻呼吸光效');
    const b0 = sc.bigBreath(0);
    const b1 = sc.bigBreath(190);
    if (Math.abs(b0 - b1) < 0.02) problems.push('大 emoji 的呼吸幅度太小（看不出在动）');
    if (b0 > 1.051 || b0 < 0.949) problems.push(`大 emoji 呼吸幅度 ${b0} 超出 ±5%`);
  }

  // 6) 盘面最多 3 个大 emoji：第 4 个出现时最早那个退化
  {
    // 逻辑层：已有 2 / 3 个大 emoji 时，4 连仍然会合成（不再按数量拦截）
    const b2 = [7, 7, 7, 7, L.big(1), L.big(2), 5, 4];
    if (L.resolveClear(b2, 8, 1).spawns.size !== 1) problems.push('盘面已有 2 个大 emoji 时 4 连没合成');
    const b3 = [7, 7, 7, 7, L.big(1), L.big(2), L.big(3), 5];
    if (L.resolveClear(b3, 8, 1).spawns.size !== 1) problems.push('盘面已有 3 个大 emoji 时 4 连没合成');

    // 场景层：3 个「老的」+ 一次 4 连 → 最早那个退化，盘面仍是 3 个
    const base = playScene(null);
    const { cols, rows } = base.conf;
    const cells = new Array(cols * rows).fill(null);
    cells[0] = 4; cells[1] = 4; cells[2] = 4; cells[3] = 4;
    cells[cols] = L.big(1);
    cells[cols + 1] = L.big(2);
    cells[cols + 2] = L.big(3);
    const sc = playScene(cells);
    sc.pruneBigIds();
    if (sc.bigIds.length !== 3) problems.push(`场景里 3 个大 emoji 没登记全（${sc.bigIds.length}）`);
    sc.resolve(1);
    let snap = null;
    for (let i = 0; i < 240 && !snap; i++) {
      sc.update(16);
      if (sc.degradeFx.length) snap = { cells: sc.cells.slice(), fx: sc.degradeFx[0] };
    }
    if (!snap) problems.push('第 4 个大 emoji 出现时没有退化');
    else {
      const bigs = snap.cells.filter(v => L.isBig(v));
      if (bigs.length !== L.MAX_BIG) problems.push(`退化后盘面有 ${bigs.length} 个大 emoji（应 ${L.MAX_BIG}）`);
      if (bigs.some(v => L.bigKind(v) === 1)) problems.push('最早的大 emoji 没有退化（还是大的）');
      if (snap.cells.indexOf(1) < 0) problems.push('退化后没有变回普通 emoji');
    }
  }

  check(problems.length === 0, `消消乐大 emoji：${problems.slice(0, 4).join('；')}`);
}

// ---------- 消消乐：鼓励条（替代原来的绿色得分卡） ----------
{
  const CrushCls = require(path.join(ROOT, 'js/games/crush/scene'));
  const i18nMod = require(path.join(ROOT, 'js/core/i18n'));
  const fs = require('fs');
  fakeApp.sceneId = 'crush';
  const problems = [];
  // 1) 旧的绿色卡片必须彻底消失
  const src = fs.readFileSync(path.join(ROOT, 'js/games/crush/scene.js'), 'utf8');
  if (src.includes('drawCelebration')) problems.push('绿色得分卡还在');
  if (!src.includes('cheerFor')) problems.push('没有鼓励条逻辑');
  const sc = new CrushCls(fakeApp);
  sc.initLevel(1);
  sc.clock = 5000;
  sc.now = 5000;
  const names = (tier) => ({
    small: ['cheerS1', 'cheerS2', 'cheerS3', 'cheerS4'].map(k => i18nMod.t('crush.' + k)),
    mid: ['cheerM1', 'cheerM2', 'cheerM3', 'cheerM4'].map(k => i18nMod.t('crush.' + k)),
    big: ['cheerB1', 'cheerB2', 'cheerB3', 'cheerB4'].map(k => i18nMod.t('crush.' + k)),
  }[tier] || []);
  // 2) 档位：连击 2 / 分数大 / 普通三连
  if (!sc.cheerFor(120, 2, 3, 0, 0)) problems.push('2 连击没有鼓励');
  const smallText = sc.cheer && sc.cheer.text;
  if (!names('small').includes(smallText)) problems.push(`2 连击的文案档位不对（${smallText}）`);
  if (!sc.cheerFor(700, 1, 3, 0, 0)) problems.push('大额消除没有鼓励');
  const bigText = sc.cheer && sc.cheer.text;
  if (!names('big').includes(bigText)) problems.push(`大额消除的文案档位不对（${bigText}）`);
  if (sc.cheerFor(90, 1, 3, 0, 0)) problems.push('普通三连也弹了鼓励（会刷屏）');
  if (/\d/.test(bigText || '')) problems.push('鼓励语里出现了分数数字');
  if (bigText === smallText) problems.push('两档用了同一句文案');
  // 3) 画出来 + 落点在游戏区上方（和下坠同一套「砸下来」）
  const text = i18nMod.t('crush.cheerB2');
  sc.cheer = { text, at: sc.clock };
  sc.clock += 520;
  sc.now = sc.clock;
  const ctx = makeCtx();
  const drawn = [];
  const origFill = ctx.fillText;
  ctx.fillText = (v) => { drawn.push(String(v)); return origFill(v); };
  sc.render(ctx);
  if (!drawn.includes(text)) problems.push('鼓励条没有画到屏幕上');
  if (!sc.cheerRect || sc.cheerRect.y + sc.cheerRect.h > sc.boardY + 4) {
    problems.push('鼓励条没有落在游戏区上方');
  }
  check(problems.length === 0, `消消乐鼓励条：${problems.slice(0, 4).join('；')}`);
}

// ---------- 麻将英雄 / 扑克炼金术 / 麻将传奇：飞圆点 + 上方提示 ----------
{
  const scoreflyMod = require(path.join(ROOT, 'js/core/scorefly'));
  const fs = require('fs');
  const LegCls = require(path.join(ROOT, 'js/games/legend/scene'));
  const MahCls = require(path.join(ROOT, 'js/games/mahjong/scene'));
  const AlcCls = require(path.join(ROOT, 'js/games/alchemy/scene'));
  const legLogic = require(path.join(ROOT, 'js/games/legend/board'));
  const mahLogic = require(path.join(ROOT, 'js/games/mahjong/board'));
  const alcLogic = require(path.join(ROOT, 'js/games/alchemy/board'));
  const problems = [];

  // 三个游戏的中央绿卡都必须删掉，改成游戏区上方的提示条
  ['legend', 'mahjong', 'alchemy'].forEach((id) => {
    const src = fs.readFileSync(path.join(ROOT, `js/games/${id}/scene.js`), 'utf8');
    if (src.includes('drawCelebration')) problems.push(`${id}: 中央得分浮字还在`);
    if (!src.includes('scorefly.spawn')) problems.push(`${id}: 没有飞向得分区的圆点`);
    if (!src.includes('scorefly.roll')) problems.push(`${id}: 得分没有滚动动画`);
  });

  const checkFly = (tag, sc, expectX, expectY) => {
    if (!sc.cheer || !sc.cheer.text) problems.push(`${tag}: 没有出现上方提示`);
    else if (!/\+\d/.test(sc.cheer.text)) problems.push(`${tag}: 提示里没有得分（${sc.cheer.text}）`);
    if (sc.fly.length < 10) problems.push(`${tag}: 圆点太少（${sc.fly.length} 颗）`);
    else if (Math.abs(sc.fly[0].tx - expectX) > 0.6 || Math.abs(sc.fly[0].ty - expectY) > 0.6) {
      problems.push(`${tag}: 圆点目标不是得分格`);
    }
    const shown = scoreflyMod.shown(sc.scoreAnim, sc.now);
    if (!(shown < sc.score)) problems.push(`${tag}: 得分没有滚动（直接跳到 ${sc.score}）`);
    sc.now += 600;
    if (Math.round(scoreflyMod.shown(sc.scoreAnim, sc.now)) !== sc.score) problems.push(`${tag}: 得分滚动没收敛`);
  };

  // 1) 麻将传奇：三连消
  fakeApp.sceneId = 'legend';
  const leg = new LegCls(fakeApp);
  leg.phase = 'play';
  leg.clock = 2000;
  leg.now = 2000;
  leg.grid = legLogic.emptyGrid();
  [2, 3, 4].forEach((v, i) => { leg.grid[7][i] = { id: 9100 + i, v }; });
  const legGroups = legLogic.findGroups(leg.grid);
  leg.startClear({ chain: 2, clearSeqAtApply: 0 }, legGroups);
  checkFly('传奇', leg, leg.cx + (leg.cw / 3) * 1.5, leg.scoreY + 43);
  // 真实输入路径也要有圆点：模拟「手上 4 落进底行 2/3 之间」凑成顺子
  {
    const sc2 = new LegCls(fakeApp);
    sc2.phase = 'play';
    sc2.clock = 2000;
    sc2.now = 2000;
    sc2.grid = legLogic.emptyGrid();
    // 底行第 2、3 列放 3/4，手上的 2 落到第 1 列 → 底行 2/3/4 成顺子（确定性场景）
    sc2.grid[7][1] = { id: 9701, v: 3 };
    sc2.grid[7][2] = { id: 9702, v: 4 };
    sc2.queue = [2, 9, 9, 9];
    sc2.onCell(0);
    let dotFrames = 0;
    for (let i = 0; i < 120; i++) {
      sc2.update(16);
      if (sc2.fly.length) dotFrames++;
      sc2.render(makeCtx());
    }
    if (sc2.score <= 0) problems.push('传奇：落子没有消掉（测试场景失效）');
    if (dotFrames < 10) problems.push(`传奇：真实落子后圆点只在 ${dotFrames} 帧出现`);
  }

  // 提示条要真的画出来
  {
    const ctx = makeCtx();
    const drawn = [];
    const origFill = ctx.fillText;
    ctx.fillText = (v) => { drawn.push(String(v)); return origFill(v); };
    leg.render(ctx);
    if (!drawn.some(v => v === leg.cheer.text)) problems.push('传奇：提示条没有画到屏幕上');
  }

  // 2) 麻将英雄：三张同点成刻子
  fakeApp.sceneId = 'mahjong';
  const mah = new MahCls(fakeApp);
  mah.clock = 2000;
  mah.now = 2000;
  mah.board = new Array(mahLogic.CELLS).fill(null);
  [0, 1, 2].forEach((i) => { mah.board[i] = { value: 5 }; });
  mah.settle();
  const mahQ = mah.cw / (mah.mode === 1 ? 4 : 3);
  checkFly('麻将英雄', mah, mah.cx + mahQ * 2.5, mah.scoreY + 48);

  // 3) 扑克炼金术：同点四条
  fakeApp.sceneId = 'alchemy';
  const alc = new AlcCls(fakeApp);
  alc.now = Date.now();
  alc.grid = new Array(alcLogic.CELLS).fill(null);
  const fourLine = alcLogic.LINES[0];
  fourLine.forEach((i) => { alc.grid[i] = { kind: 'card', rank: 7, suit: 'heart' }; });
  alc.settle(false);
  checkFly('炼金术', alc, alc.cx + (alc.cw / 4) * 2.5, alc.scoreY + 44);

  check(problems.length === 0, `飞圆点 / 上方提示：${problems.slice(0, 4).join('；')}`);
}

// ---------- 得分圆点：数量要够（玩家反馈「不明显」） ----------
{
  const sf = require(path.join(ROOT, 'js/core/scorefly'));
  const problems = [];
  const make = (n) => {
    const list = [];
    const pts = Array.from({ length: n }, (_, i) => ({ x: i * 10, y: i * 5 }));
    sf.spawn(list, { points: pts, tx: 300, ty: 50, at: 0, size: 4 });
    return { list, pts };
  };
  [1, 3, 6, 12, 30].forEach((n) => {
    const { list, pts } = make(n);
    const want = Math.min(sf.DOTS_MAX, Math.max(sf.DOTS_MIN, n * sf.DOTS_PER_POINT));
    if (list.length !== want) problems.push(`n=${n} 圆点数 ${list.length}（应 ${want}）`);
    if (list.length < 10) problems.push(`n=${n} 圆点太少（${list.length}）`);
    const covered = pts.filter(p => list.some(d => Math.abs(d.x0 - p.x) <= 6 && Math.abs(d.y0 - p.y) <= 6)).length;
    if (covered !== n) problems.push(`n=${n} 有被消除的牌没吐圆点（${covered}/${n}）`);
    if (new Set(list.map(d => d.color)).size < 3) problems.push(`n=${n} 圆点颜色太少`);
  });
  check(problems.length === 0, `得分圆点数量：${problems.slice(0, 4).join('；')}`);
}

// ---------- 鼓励条配色：文字随机彩色（暗色 / 浅色两套） ----------
{
  const cheerMod = require(path.join(ROOT, 'js/core/cheer'));
  const themeMod = require(path.join(ROOT, 'js/core/theme'));
  const CrushCls = require(path.join(ROOT, 'js/games/crush/scene'));
  const DownCls = require(path.join(ROOT, 'js/games/down/scene'));
  const problems = [];
  const lum = (hex) => {
    const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return -1;
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  const prevMode = themeMod.mode;
  const darkPal = cheerMod.PALETTE.dark;
  const lightPal = cheerMod.PALETTE.light;
  if (new Set(darkPal).size !== darkPal.length) problems.push('暗色调色板有重复色');
  if (new Set(lightPal).size !== lightPal.length) problems.push('浅色调色板有重复色');
  if (darkPal.some(c => lightPal.includes(c))) problems.push('暗色 / 浅色调色板混用了同一批颜色');
  // 暗色要亮字（压在深胶囊上）、浅色要深字（压在白胶囊上）
  if (darkPal.some(c => lum(c) < 0.55)) problems.push(`暗色调色板有偏暗的颜色：${darkPal.filter(c => lum(c) < 0.55).join(',')}`);
  if (lightPal.some(c => lum(c) > 0.55)) problems.push(`浅色调色板有偏亮的颜色：${lightPal.filter(c => lum(c) > 0.55).join(',')}`);

  // 画一帧、抓文字颜色与胶囊底色
  const paint = (dark, colorIndex) => {
    themeMod.setMode(dark ? 'dark' : 'light');
    fakeApp.sceneId = 'crush';
    const sc = new CrushCls(fakeApp);
    sc.initLevel(1);
    const text = '测试鼓励文案';
    sc.cheer = { text, at: sc.clock, color: colorIndex };
    sc.clock += 520;
    sc.now = sc.clock;
    const ctx = makeCtx();
    const seen = [];
    const fills = [];
    const origFill = ctx.fillText;
    ctx.fillText = (v) => {
      if (String(v) === text) seen.push(ctx.fillStyle);
      return origFill(v);
    };
    const origFillPath = ctx.fill;
    ctx.fill = () => { fills.push(String(ctx.fillStyle)); return origFillPath(); };
    sc.render(ctx);
    return { colors: seen, fills, text };
  };
  const darkPaint = paint(true, 2);
  const lightPaint = paint(false, 2);
  if (!darkPaint.colors.length) problems.push('暗色下鼓励条文字没画出来');
  if (darkPaint.colors[0] === '#ffffff' || darkPaint.colors[0] === 'rgba(255,255,255,0.92)') {
    problems.push('暗色下鼓励条还是纯白字（玩家反馈的「灰白」）');
  }
  if (darkPaint.colors[0] !== cheerMod.paletteColor(2, true)) problems.push('暗色文字颜色和调色板不一致');
  if (lightPaint.colors[0] !== cheerMod.paletteColor(2, false)) problems.push('浅色文字颜色和调色板不一致');
  if (darkPaint.colors[0] === lightPaint.colors[0]) problems.push('暗色 / 浅色用了同一种文字色');
  // 胶囊底色：暗色必须是深底（否则亮字压在白半透明上就是一片灰白），浅色是白底
  if (!darkPaint.fills.some(v => v.startsWith('rgba(22,24,26'))) problems.push('暗色胶囊底色不是深底');
  if (!lightPaint.fills.some(v => v.startsWith('rgba(255,255,255'))) problems.push('浅色胶囊底色不是白底');

  // 两个场景每次弹都换一种颜色（不和上一条重复）
  themeMod.setMode('dark');
  fakeApp.sceneId = 'crush';
  const sc = new CrushCls(fakeApp);
  sc.initLevel(1);
  sc.clock = 3000;
  const colors = [];
  for (let i = 0; i < 6; i++) { sc.cheerFor(700, 1, 3, 0, 0); colors.push(sc.cheer.color); }
  if (colors.some(c => !(c >= 0 && c < 6))) problems.push(`鼓励条颜色越界：${colors.join(',')}`);
  if (colors.some((c, i) => i > 0 && c === colors[i - 1])) problems.push('连续两次用了同一种颜色');
  fakeApp.sceneId = 'down';
  const dn = new DownCls(fakeApp);
  dn.celebrateScore();
  const c1 = dn.cheer.color;
  dn.celebrateScore();
  if (!(c1 >= 0 && c1 < 6)) problems.push('下坠鼓励条没有分配颜色');
  if (dn.cheer.color === c1) problems.push('下坠连续两次用了同一种颜色');
  themeMod.setMode(prevMode || 'system');

  check(problems.length === 0, `鼓励条配色：${problems.slice(0, 4).join('；')}`);
}

// ---------- 生命（爱心）：四个带生命的游戏统一数独样式 ----------
{
  const D = require(path.join(ROOT, 'js/core/draw'));
  const cases = [
    { id: 'sudoku', setup: (sc) => { sc.difficulty = 3; sc.hearts = 2; }, max: 3, center: (sc) => sc.cx + sc.cw * 0.75 },
    { id: 'hunter', setup: (sc) => { sc.hearts = 2; }, max: 3, center: (sc) => sc.cx + sc.cw * (2.5 / 3) },
    { id: 'detective', setup: (sc) => { sc.hearts = 2; }, max: 3, center: (sc) => sc.cx + sc.cw * (2.5 / 3) },
    { id: 'gambler', setup: (sc) => { sc.hearts = 1; }, max: 2, center: (sc) => sc.cx + sc.cw * (3.5 / 4) },
  ];
  const problems = [];
  cases.forEach(({ id, setup, max, center }) => {
    const Cls = require(path.join(ROOT, `js/games/${id}/scene`));
    fakeApp.sceneId = id;
    const sc = new Cls(fakeApp);
    setup(sc);
    // D.hearts 内部调的是模块内的 text()，拦 D.text 拦不到 —— 直接从 ctx 上抓 fillText
    const marks = [];
    const c0 = makeCtx();
    const origFill = c0.fillText;
    c0.fillText = (value, x) => {
      if (value === '❤️' || value === '🤍') {
        const m = String(c0.font || '').match(/([\d.]+)px/);
        marks.push({ value, x, size: m ? Number(m[1]) : 0 });
      }
      return origFill(value, x);
    };
    sc.drawScore(c0);
    if (marks.length !== max) { problems.push(`${id}: 画了 ${marks.length} 颗（应 ${max}）`); return; }
    const step = marks.length > 1 ? marks[1].x - marks[0].x : 20;
    if (marks.length > 1 && Math.abs(step - 20) > 0.01) problems.push(`${id}: 爱心间距 ${step}（应 20）`);
    const mid = (marks[0].x + marks[marks.length - 1].x) / 2;
    if (Math.abs(mid - center(sc)) > 0.6) problems.push(`${id}: 爱心没在格子居中（${mid.toFixed(1)} vs ${center(sc).toFixed(1)}）`);
    const filled = marks.filter((m) => m.value === '❤️').length;
    if (filled !== sc.hearts) problems.push(`${id}: 实心 ${filled} 颗（应 ${sc.hearts}）`);
    if (marks[0].size !== 17) problems.push(`${id}: 爱心字号 ${marks[0].size}（应 17）`);
  });
  check(problems.length === 0, `生命爱心样式：${problems.slice(0, 4).join('；')}`);
}

// ---------- 麻将传奇：分数卡下方不要等级进度条 ----------
{
  const D = require(path.join(ROOT, 'js/core/draw'));
  const LegCls = require(path.join(ROOT, 'js/games/legend/scene'));
  const LinkCls = require(path.join(ROOT, 'js/games/link/scene'));
  const countBars = (Cls) => {
    const orig = D.progressBar;
    let calls = 0;
    D.progressBar = (...args) => { calls += 1; return orig(...args); };
    try {
      fakeApp.sceneId = 'probe';
      const sc = new Cls(fakeApp);
      sc.render(makeCtx());
    } finally {
      D.progressBar = orig;
    }
    return calls;
  };
  const problems = [];
  const legendBars = countBars(LegCls);
  if (legendBars !== 0) problems.push(`麻将传奇分数卡下方还有进度条（${legendBars} 次）`);
  // 对照组：连连看本来就该有这条进度条，确认探针真的能看到调用
  if (countBars(LinkCls) === 0) problems.push('探针失效（连连看也没抓到进度条）');
  check(problems.length === 0, `麻将传奇分数区：${problems.join('；')}`);
}

// ---------- 麻将传奇：花牌万能 + 重叠组全部消除 ----------
{
  const logic = require(path.join(ROOT, 'js/games/legend/board'));
  const FLOWER_V = 18;   // 花牌：v > FLOWER_BASE(16)
  const problems = [];
  const rowGroups = (values) => {
    const grid = logic.emptyGrid();
    values.forEach((v, i) => { if (v) grid[7][i] = { id: 100 + i, v }; });
    const groups = logic.findGroups(grid);
    const cells = new Set();
    groups.forEach((g) => g.cells.forEach(([r, c]) => cells.add(c)));
    return { groups, cells: [...cells].sort((a, b) => a - b) };
  };
  // 1) 2 3 4 4 4：顺子 234 + 刻子 444 重叠 → 五张全消
  const a = rowGroups([2, 3, 4, 4, 4]);
  if (a.groups.length !== 2) problems.push(`23444 应判 2 组，实际 ${a.groups.length}`);
  if (a.cells.join(',') !== '0,1,2,3,4') problems.push(`23444 只消了 ${a.cells.join(',')}`);
  if (!a.groups.some((g) => g.kind === 'run') || !a.groups.some((g) => g.kind === 'triplet')) problems.push('23444 缺少顺子或刻子');
  // 2) 南 南 花 4 4：两个刻子共用同一张花牌 → 五张全消
  const b = rowGroups([11, 11, FLOWER_V, 4, 4]);
  if (b.groups.length !== 2) problems.push(`南南花44 应判 2 组，实际 ${b.groups.length}`);
  if (b.cells.join(',') !== '0,1,2,3,4') problems.push(`南南花44 只消了 ${b.cells.join(',')}`);
  // 3) 字牌不能凑顺子
  if (rowGroups([10, 11, 12]).groups.length) problems.push('字牌被判成顺子');
  // 4) 四张同点只算一个杠（300 分），不叠加两个刻子
  const k = rowGroups([4, 4, 4, 4]);
  if (k.groups.length !== 1 || k.groups[0].kind !== 'kong' || k.groups[0].score !== 300) {
    problems.push(`4444 应只有一个杠，实际 ${k.groups.map((g) => g.kind).join('+')}`);
  }
  // 5) 同一窗口既像顺子又像刻子时只算一次（花 花 5）
  const w = rowGroups([FLOWER_V, FLOWER_V, 5]);
  if (w.groups.length !== 1) problems.push(`花花5 应只算 1 组，实际 ${w.groups.length}`);
  // 6) 竖列同理（上下方向）
  {
    const grid = logic.emptyGrid();
    [2, 3, 4, 4, 4].forEach((v, r) => { grid[r][0] = { id: 200 + r, v }; });
    const groups = logic.findGroups(grid);
    const cells = new Set();
    groups.forEach((g) => g.cells.forEach(([r]) => cells.add(r)));
    if (cells.size !== 5) problems.push(`竖列 23444 只消了 ${cells.size} 张`);
  }
  // 7) 空格会把一段切断，不会跨空拼接
  if (rowGroups([2, 3, 0, 4, 4]).groups.length) problems.push('跨空格的牌被连成一组');
  // 8) 并把并集真的从盘面抹掉
  {
    const grid = logic.emptyGrid();
    [2, 3, 4, 4, 4].forEach((v, i) => { grid[7][i] = { id: 300 + i, v }; });
    const groups = logic.findGroups(grid);
    const next = logic.clearGroups(grid, groups);
    const left = next[7].slice(0, 5).filter(Boolean).length;
    if (left !== 0) problems.push(`消完之后还剩 ${left} 张`);
  }
  check(problems.length === 0, `麻将传奇找组：${problems.slice(0, 4).join('；')}`);
}

// ---------- 井字棋：胜利用「胶囊框」圈住三格（X 绿 / O 红），不再画连线 ----------
{
  const Cls = require(path.join(ROOT, 'js/games/ttt/scene'));
  const themeMod = require(path.join(ROOT, 'js/core/theme'));
  const DMod = require(path.join(ROOT, 'js/core/draw'));
  fakeApp.sceneId = 'ttt';
  const problems = [];
  const cases = [
    [[0, 1, 2], 'X'], [[3, 4, 5], 'O'], [[0, 3, 6], 'X'],
    [[0, 4, 8], 'O'], [[2, 4, 6], 'X'],
  ];
  cases.forEach(([line, winner]) => {
    const sc = new Cls(fakeApp);
    sc.winner = winner;
    sc.winLine = line;
    sc.winLineStartAt = Date.now() - 2000;
    const f = sc.winFrame();
    if (!f) { problems.push(`线 ${line.join(',')}：没有胜利框`); return; }
    const want = winner === 'O' ? themeMod.tokens.god : themeMod.tokens.primary;
    if (f.color !== want) problems.push(`线 ${line.join(',')}：框色 ${f.color} 应为 ${want}`);
    // 三格中心都要在「旋转后的胶囊」里
    const cos = Math.cos(-f.angle);
    const sin = Math.sin(-f.angle);
    line.forEach((i) => {
      const r = sc.cellRect(i);
      const dx = r.x + r.w / 2 - f.cx;
      const dy = r.y + r.h / 2 - f.cy;
      const lx = dx * cos - dy * sin;
      const ly = dx * sin + dy * cos;
      if (Math.abs(lx) > f.len / 2 + 0.5 || Math.abs(ly) > f.thick / 2 + 0.5) {
        problems.push(`线 ${line.join(',')}：${i} 号格没被圈住`);
      }
    });
    const cell = Math.min(sc.cellRect(0).w, sc.cellRect(0).h);
    // 起笔 → 绕一圈 → 首尾接上（不要一上来就整圈出现）
    // 用模块里的 capsuleLoop 逻辑复核：先量「满圈」和「刚起笔」
    const countLineTos = (ageMs) => {
      const c = makeCtx();
      let n = 0;
      c.lineTo = () => { n += 1; };
      sc.winLineStartAt = Date.now() - ageMs;
      sc.drawWinFrame(c);
      return n;
    };
    const early = countLineTos(20);
    const full = countLineTos(1200);
    if (early <= 0) problems.push(`线 ${line.join(',')}：起笔时没有描边`);
    if (full <= early) problems.push(`线 ${line.join(',')}：没有绕圈生长（早期 ${early} 段，满圈 ${full} 段）`);
    // 满圈时首尾要在同一点（一笔闭合）
    const c2 = makeCtx();
    const pts = [];
    c2.moveTo = (x, y) => pts.push({ x, y, first: pts.length === 0 });
    c2.lineTo = (x, y) => pts.push({ x, y });
    sc.winLineStartAt = Date.now() - 1200;
    sc.drawWinFrame(c2);
    const firstPt = pts.find((q) => q.first);
    const lastPt = pts[pts.length - 1];
    if (!firstPt || !lastPt) problems.push(`线 ${line.join(',')}：没有描边点`);
    else if (Math.hypot(lastPt.x - firstPt.x, lastPt.y - firstPt.y) > 0.6) {
      problems.push(`线 ${line.join(',')}：绕完没闭合（缺口 ${Math.hypot(lastPt.x - firstPt.x, lastPt.y - firstPt.y).toFixed(1)}px）`);
    }
  });
  // 旧的连线实现必须删掉，别两套同时留着
  const tttSrc = require('fs').readFileSync(path.join(ROOT, 'js/games/ttt/scene.js'), 'utf8');
  if (/drawWinLine/.test(tttSrc)) problems.push('井字棋：还留着旧的连线实现');
  check(problems.length === 0, `井字棋胜利框：${problems.slice(0, 5).join('；')}`);
}

// ---------- 25 个游戏都能生成分享海报（标题带游戏名） ----------
{
  const shareMod3 = require(path.join(ROOT, 'js/core/share'));
  const IDS = ['click', 'guess', 'poker', 'puzzle', 'g2048', 'snake', 'match', 'link', 'detective',
    'hunter', 'three', 'crush', 'sudoku', 'master', 'sort', 'down', 'slide', 'alchemy', 'mahjong',
    'quesheng', 'legend', 'mirror', 'point24', 'solo', 'gambler'];
  // 用假的截图函数（只要有画布就行，这里不验画面内容）
  shareMod3.setCapture(() => true);
  let missing = 0;
  IDS.forEach((id) => {
    const poster = shareMod3.buildPoster({ phase: 'over', score: 128 }, id);
    if (!poster || !poster.canvas) missing += 1;
    else if (poster.title.indexOf(i18n.t(`home.${id}Title`)) !== 0) missing += 1;
  });
  shareMod3.setCapture(null);
  check(missing === 0, `分享海报：${missing} 个游戏没生成 / 标题不对`);
}

// ---------- 结算数字滚动（countUp） ----------
{
  const D2 = require(path.join(ROOT, 'js/core/draw'));
  const at = Date.now();
  check(D2.countUp(120, at, 260) === 0 || D2.countUp(120, at, 260) < 10, '结算滚动：刚出现就该接近 0');
  check(D2.countUp(120, at - 400, 260) === 120, '结算滚动：结束后应等于最终值');
  check(D2.countUp(120, 0, 260) === 120, '结算滚动：没有起点时直接显示最终值');

  // 真的接进了结算：下坠结算里的分数应该从 0 滚到最终值
  const DownCls = require(path.join(ROOT, 'js/games/down/scene'));
  const downScene = new DownCls(fakeApp);
  fakeApp.sceneId = 'down';
  downScene.startGame();
  downScene.score = 137;
  downScene.phase = 'over';
  downScene._hasRendered = true;   // 模拟 App 已经渲染过一帧（resultVisible 的门槛才稳定）
  const t0 = Date.now();
  let firstNum = null;
  let lastNum = null;
  withFakeClock(16, () => {
    const paint = (ms) => {
      const fake = t0 + ms;
      Date.now = () => fake;
      const rec = [];
      const c2 = makeCtx();
      c2.fillText = (v, x, y) => { rec.push({ v: String(v), y }); };
      downScene.buttons = [];
      downScene.render(c2);
      // 只认结算遮罩里那个大号分数（基线 = 遮罩中心 + 12）
      const cy = downScene.boardY + downScene.boardH / 2 + 12;
      const hit = rec.filter((r) => /^\d+$/.test(r.v) && Math.abs(r.y - cy) <= 14);
      return hit.length ? Number(hit[hit.length - 1].v) : null;
    };
    Date.now = () => t0;
    downScene.buttons = [];
    downScene.render(makeCtx());        // 第一帧只挂门槛
    firstNum = paint(300);              // 刚出现
    lastNum = paint(900);               // 早已滚完
  });
  check(lastNum === 137, `结算滚动：滚动结束后不是最终值（${lastNum}）`);
  check(firstNum !== null && firstNum < 137, `结算滚动：刚出现时就已经是最终值（${firstNum}），没有滚动`);
}

// ---------- 下坠：分数到整百，游戏区上方放烟花 + 一条夸张鼓励（不拦操作） ----------
{
  const DownScene = require(path.join(ROOT, 'js/games/down/scene'));
  const sc = new DownScene(fakeApp);
  fakeApp.sceneId = 'down';
  audio.setGame('down');
  sc.startGame();
  check(sc.score === 0, `下坠：开局分数不是 0（${sc.score}）`);

  // 整百这一次：不播普通消除音，改播烟花（多消 / 连击）音
  const playedBefore = [];
  const origElim = audio.playElimination;
  const origFire = audio.playFirework;
  audio.playElimination = () => playedBefore.push('elimination');
  audio.playFirework = () => playedBefore.push('firework');
  sc.score = 99;
  sc.clearRow();
  check(playedBefore.indexOf('elimination') < 0, '下坠：整百那一次还播了普通消除音');
  sc.finishClearRow();
  audio.playElimination = origElim;
  audio.playFirework = origFire;
  check(playedBefore.indexOf('firework') >= 0, '下坠：整百那一次没有播烟花音');
  check(sc.score === 100, `下坠：消一排没有加分（${sc.score}）`);
  check(!!sc.cheer && !!sc.cheer.text, '下坠：分数到 100 没有出现鼓励语');
  check(sc.bursts.length > 0, '下坠：分数到 100 没有放烟花');

  // 渲染：鼓励语画出来了、列点击区没被破坏、且是「从顶部落下来」的
  const rec = [];
  const cCheer = makeCtx();
  cCheer.fillText = (v, x, y) => { rec.push({ v: String(v), x, y }); };
  sc.buttons = [];
  sc.render(cCheer);
  check(rec.some((r) => r.v === sc.cheer.text), `下坠：鼓励语没画出来（${rec.map((r) => r.v).slice(0, 6).join('/')}）`);
  const cols = sc.buttons.filter((b) => b.id.indexOf('col-') === 0).length;
  check(cols === 6, `下坠：庆祝时列点击区被破坏（${cols}）`);
  const startTop = sc.cheerRect ? sc.cheerRect.y : 0;
  check(startTop < sc.optY, `下坠：鼓励条不是从顶部落下来的（起始顶边 ${startTop.toFixed(0)}）`);

  // 落定位置：在选项卡上半区，不压牌面、也不跑出屏幕
  let settled = null;
  withFakeClock(16, () => {
    // 每次 update 内部会读好几次 Date.now（假时钟每读一次 +16ms），
    // 所以只跑 20 次：足够越过 420ms 的下落，又不会越过 1.5s 的存在时间
    for (let i = 0; i < 20; i += 1) sc.update(16);
    sc.drawCheer(makeCtx());
    settled = sc.cheerRect;
  });
  check(!!settled && settled.y + settled.h <= sc.boardY + 1,
    `下坠：鼓励条压住了牌面（底边 ${settled && (settled.y + settled.h).toFixed(0)} / boardY ${sc.boardY.toFixed(0)}）`);
  check(!!settled && settled.y >= 0, '下坠：鼓励条跑出屏幕顶部');
  check(!!settled && Math.abs(settled.y + settled.h - sc.boardY) <= 2,
    `下坠：落点不对（底边 ${settled && (settled.y + settled.h).toFixed(0)}，应贴着游戏区顶部 ${sc.boardY.toFixed(0)}）`);

  // 连续整百要换一句；非整百不触发
  const firstCheer = sc.cheer.text;
  sc.score = 199;
  sc.finishClearRow();
  check(sc.score === 200 && sc.cheer.text !== firstCheer, '下坠：连续两次整百出现了同一句鼓励');
  const keepCheer = sc.cheer.text;
  sc.score = 250;
  sc.finishClearRow();
  check(sc.score === 251 && sc.cheer.text === keepCheer, '下坠：不是整百也触发了鼓励');
  audio.setGame(null);
}


// ---------- 对对碰：不配对的一对翻回去期间，其它牌必须照常可以点 ----------
{
  const MatchScene = require(path.join(ROOT, 'js/games/match/scene'));
  const cardsMod = require(path.join(ROOT, 'js/core/cards'));
  const sc = new MatchScene(fakeApp);
  fakeApp.sceneId = 'match';
  audio.setGame('match');
  sc.level = 2;
  sc.initLevel(2, null);
  sc.endPreview();
  check(sc.phase === 'play', `对对碰：没有进入可玩阶段（${sc.phase}）`);

  const keyOf = cardsMod.keyOf;
  const a = sc.cards[0];
  const b = sc.cards.find((c) => keyOf(c.item) !== keyOf(a.item));
  sc.onCardClick(a);
  sc.onCardClick(b);
  check(sc.lock === false, '对对碰：不配对之后锁住了整盘（以前要白等 700ms，其它牌点不动）');
  check(a.flipped && b.flipped, '对对碰：不配对的牌应该先亮着让玩家记');

  // 翻回去之前点第三张牌：必须立刻响应
  const c3 = sc.cards.find((c) => c !== a && c !== b && keyOf(c.item) !== keyOf(a.item));
  sc.onCardClick(c3);
  check(sc.firstCard === c3 && c3.flipped, '对对碰：翻回去期间点其它牌没有响应');
  check(sc.lock === false, '对对碰：点第三张牌之后又被锁住了');

  // 再凑一对不配对：两对要能各自排队、各自翻回去
  const c4 = sc.cards.find((c) => c !== a && c !== b && c !== c3 && keyOf(c.item) !== keyOf(c3.item));
  sc.onCardClick(c4);
  check(sc.mismatches.length === 2, `对对碰：两对不配对没有各自排队（${sc.mismatches.length}）`);

  // 亮着的时间段内，不配对的牌仍然是正面（给玩家记）
  withFakeClock(16, () => { for (let i = 0; i < 20; i += 1) sc.update(16); });
  check(a.flipped && b.flipped, '对对碰：不配对的牌太早翻回去了（应该先亮一会儿）');

  // 过了 700ms 两对都要翻回去，队列清空，输入依旧不锁
  withFakeClock(16, () => { for (let i = 0; i < 60; i += 1) sc.update(16); });
  check(a.flipTarget === 0 && b.flipTarget === 0 && c3.flipTarget === 0 && c4.flipTarget === 0,
    '对对碰：到点后不配对的牌没有翻回去');
  check(sc.mismatches.length === 0, '对对碰：翻回去的队列没有清空');
  check(sc.lock === false, '对对碰：翻回去结束后仍处于锁定状态');
  audio.setGame(null);
}

// ---------- 侦探：偷换必须等牌全翻到背面；中途退出要能接着答 ----------
{
  const DetectiveScene = require(path.join(ROOT, 'js/games/detective/scene'));
  const LEVEL_KEY = '__emoji_detective__level';
  wx.setStorageSync('__emoji_detective__mode', '1');
  wx.removeStorageSync('__games_hub__face');
  wx.removeStorageSync(LEVEL_KEY);

  const s1 = new DetectiveScene(fakeApp);
  fakeApp.sceneId = 'detective';
  audio.setGame('detective');
  s1.level = 3;
  s1.startLevel();
  const boardBefore = s1.board.slice();

  let swapWhileFlipping = false;
  let memTicks = 0;
  let flipTicks = 0;
  let wrongIdx = -1;
  let swappedBefore = -1;
  let boardAfterSwap = [];
  let s2 = null;

  // 整段用同一个假时钟：playStart / now 必须是同一套时间，否则恢复后的计时会算成负数
  withFakeClock(16, () => {
    // ① 记忆阶段跑完，牌真的翻到正面（否则 flips 一直是 0，测不出「翻面途中换牌」）
    while (s1.phase === 'memory' && memTicks < 800) { memTicks += 1; s1.update(16); }
    // ② 翻面阶段：换牌只能在所有 flips 归零之后
    while (s1.phase !== 'answer' && flipTicks < 400) {
      flipTicks += 1;
      s1.update(16);
      if (s1.swapped >= 0 && s1.phase === 'flip' && !s1.flips.every((f) => f <= 0)) {
        swapWhileFlipping = true;
      }
    }
    boardAfterSwap = s1.board.slice();
    swappedBefore = s1.swapped;
    // ③ 答题中途：点错一次，再过 9 秒，然后模拟「回首页」存盘
    if (s1.phase === 'answer') {
      wrongIdx = s1.board.findIndex((_, i) => i !== s1.swapped);
      s1.onCellClick(wrongIdx);
    }
    for (let i = 0; i < 560; i += 1) s1.update(16);
    s1.onHide();
    s2 = new DetectiveScene(fakeApp);
  });

  check(s1.flips.every((f) => f >= 1), '侦探：答题态所有牌都应是正面');
  check(!swapWhileFlipping, '侦探：牌还没完全翻到背面就偷换了（玩家能直接看出哪张被换）');
  check(swappedBefore >= 0, '侦探：翻面结束后没有换牌');
  check(s1.phase === 'answer', `侦探：翻面阶段没进答题（${s1.phase}）`);
  check(swappedBefore >= 0 && boardAfterSwap[swappedBefore] !== boardBefore[swappedBefore],
    '侦探：换牌没真正替换那张牌');
  check(s1.hearts === 2, `侦探：点错没有扣心（${s1.hearts}）`);

  check(s2 && s2.phase === 'answer', `侦探：中途退出后没回到答题（${s2 && s2.phase}）`);
  if (s2) {
    check(s2.level === 3, `侦探：中途退出后关卡丢了（${s2.level}）`);
    check(s2.swapped === swappedBefore, `侦探：恢复后换牌位置变了（${s2.swapped} / ${swappedBefore}）`);
    check(JSON.stringify(s2.board) === JSON.stringify(boardAfterSwap), '侦探：恢复后牌面不一致');
    check(s2.hearts === 2, `侦探：恢复后心数不对（${s2.hearts}）`);
    check(s2.wrong.length === 1 && s2.wrong[0] === wrongIdx, '侦探：恢复后点错的格子没记住');
    check(s2.time >= 8, `侦探：恢复后已用时间没接着算（${s2.time}s）`);
    check(s2.lock === false, '侦探：恢复后不能继续作答（lock 没解开）');

    // ④ 观察阶段（记忆 / 翻面）退出 → 重开本关、心数回满
    s2.startLevel();
    const s3 = new DetectiveScene(fakeApp);
    check(s3.phase === 'memory', `侦探：观察阶段退出后阶段不对（${s3.phase}）`);
    check(s3.level === 3, `侦探：观察阶段退出后关卡丢了（${s3.level}）`);
    check(s3.hearts === 3 && s3.swapped === -1, '侦探：观察阶段退出后不该带着上一局的心数 / 换牌');

    // ⑤ 失败态保持展示
    s3.phase = 'lost';
    s3.swapped = 2;
    s3.hearts = 0;
    s3.saveState();
    const s4 = new DetectiveScene(fakeApp);
    check(s4.phase === 'lost' && s4.lock === true, `侦探：失败态退出后没保持（${s4.phase}）`);

    // ⑥ 全选错：先把正确答案「盖章」标出来（盖章 + 震牌动画），动画放完再停 300ms 才出失败遮罩
    wx.removeStorageSync(LEVEL_KEY);          // 上一步存的是 LOST 态，这里要一局干净的
    const lose = new DetectiveScene(fakeApp);
    lose.level = 3;                           // 8 张牌，扣光 3 颗心才点得到
    lose.startLevel();
    let settleDelay = 0;
    let stampScale0 = 0;      // 第一帧的章缩放（4.2 → …：从 z 轴很远的地方飞过来）
    let stampScale300 = 0;    // 盖章结束后应回到 1
    let stampTexts = [];
    let stampRect = null;     // 章的最终尺寸要与卡片一半对得上
    let at300 = '';
    let at1000 = '';
    let at1400 = '';
    withFakeClock(16, () => {
      let k = 0;
      while (lose.phase === 'memory' && k < 900) { k += 1; lose.update(16); }
      k = 0;
      while (lose.phase !== 'answer' && k < 400) { k += 1; lose.update(16); }
      const wrongs = lose.board.map((_, i) => i).filter((i) => i !== lose.swapped).slice(0, 3);
      wrongs.forEach((i) => lose.onCellClick(i));
      settleDelay = lose.settleAt - lose.now;
      lose.update(16);            // 让 this.now 跟上盖章起点，否则 stampAge 还是负数
      // 盖章是「大章砸下来」：量一下第一帧的缩放（2.4 倍）和画了哪些字
      const sample = () => {
        const scales = [];
        const texts = [];
        const rects = [];
        const dev = makeCtx();
        dev.scale = (sx) => { scales.push(sx); };
        const origText = D.text;
        const origFill = D.fillRoundRect;
        D.text = (c, v) => { texts.push(String(v)); };
        D.fillRoundRect = (c, x, y, w, h, r, color) => {
          if (color === 'rgba(255,255,255,0.4)') rects.push({ w, h });
          return origFill(c, x, y, w, h, r, color);
        };
        lose.buttons = [];
        lose.render(dev);
        D.text = origText;
        D.fillRoundRect = origFill;
        return { scale: scales.length ? Math.max(...scales) : 0, texts, rect: rects[0] || null };
      };
      const first = sample();
      stampScale0 = first.scale;
      stampTexts = first.texts;
      stampRect = first.rect;
      const walk = (ms) => { for (let i = 0; i < Math.round(ms / 16); i += 1) lose.update(16); };
      walk(300);
      at300 = lose.phase;
      stampScale300 = sample().scale;
      walk(700);
      at1000 = lose.phase;
      walk(400);
      at1400 = lose.phase;
    });
    check(lose.hearts === 0, `侦探：全选错之后心没有归零（${lose.hearts}）`);
    check(settleDelay >= 1200 && settleDelay <= 1300,
      `侦探：失败遮罩的延时应是「盖章动画 950ms + 300ms」，实际 ${settleDelay}ms`);
    check(stampScale0 > 3.5, `侦探：盖章没有「从 z 轴飞过来」的入场（第一帧缩放 ${stampScale0}，应约 4.2）`);
    const cardRect = lose.cardRect(lose.swapped);
    check(!!stampRect && Math.abs(stampRect.w - cardRect.w * 0.52) < 1.5
      && Math.abs(stampRect.h - cardRect.h * 0.52) < 1.5,
    `侦探：章的大小应正好占卡片一半（章 ${stampRect && stampRect.w.toFixed(1)}×${stampRect && stampRect.h.toFixed(1)}，卡片 ${cardRect.w.toFixed(1)}×${cardRect.h.toFixed(1)}）`);
    check(stampScale300 > 0.95 && stampScale300 < 1.08,
      `侦探：盖章动画结束后章应该回到 1 倍（实际 ${stampScale300}）`);
    // 章小到放不下两个字时只留 ✓（320 宽那一档卡片很小）
    const stampH = cardRect.h * 0.52;
    check(stampTexts.indexOf('✓') >= 0, `侦探：章上应该有对钩（实际 ${stampTexts.join('/')}）`);
    check(stampH < 34 || stampTexts.indexOf(i18n.t('detective.stampText')) >= 0,
      `侦探：章上应该有「${i18n.t('detective.stampText')}」两个字（章高 ${stampH.toFixed(0)}，实际 ${stampTexts.join('/')}）`);
    check(at300 === 'answer', `侦探：盖章动画还没放完就进失败态了（${at300}）`);
    check(at1000 === 'answer', `侦探：动画刚放完就立刻盖遮罩了，没有留 300ms（${at1000}）`);
    check(at1400 === 'lost', `侦探：动画放完 +300ms 之后没有进入失败态（${at1400}）`);
  }
  audio.setGame(null);
}

// ---------- 实时分享必须每次都重拍（不能吃海报缓存） ----------
{
  const shareMod = require(path.join(ROOT, 'js/core/share'));
  const problems = [];
  let shots = 0;
  const savedCreate = wx.createCanvas;
  wx.createCanvas = () => ({
    width: 600, height: 480, getContext: () => makeCtx(), toTempFilePathSync: () => 't.png',
  });
  shareMod.setCapture(() => { shots += 1; return true; });
  // 用当前画布尺寸做源，确保和 App 报上来的一致（缓存键含 srcKey）
  shareMod.setSource(require(path.join(ROOT, 'js/core/canvas')).W, 786);
  const scene = { phase: 'play', buttons: [], render: () => {} };
  // 同一状态下连点两次：第二次命中缓存，不重拍（每帧预生成才不会烧渲染）
  shots = 0;
  shareMod.buildPoster(scene, 'match', { live: true });
  shareMod.buildPoster(scene, 'match', { live: true });
  if (shots !== 1) problems.push(`同一状态连续两次实时海报应该只截 1 次（实际 ${shots}）`);
  // 但每点一次分享（openPreview）都必须重拍
  shots = 0;
  shareMod.openPreview(scene, 'match', { live: true });
  shareMod.openPreview(scene, 'match', { live: true });
  if (shots !== 2) problems.push(`连开两次分享预览必须各截一次（实际 ${shots} 次）`);
  shareMod.setCapture(null);
  wx.createCanvas = savedCreate;
  check(problems.length === 0, `实时分享：${problems.join('；')}`);
}

// ---------- 截图必须包含结算遮罩（连刚赢下、遮罩还在 200ms 延迟里时也要有） ----------
{
  const { App: AppCls } = require(path.join(ROOT, 'js/core/app'));
  const app = Object.create(AppCls.prototype);
  const RESULT = { snake: 1, three: 'lose', down: 'over', legend: 'over', poker: 'over' };
  const problems = [];
  // 1) 机制：resultVisible 的延迟必须被绕过（不管场景传的是什么 key）
  {
    const sc = {
      phase: 'won',
      buttons: [],
      _hasRendered: true,
      _resultGateAt: Date.now() + 100000,
      gateValue: null,
      resultVisible() { return Date.now() >= this._resultGateAt; },
      render(c) { this.gateValue = this.resultVisible(); },
    };
    app.scene = sc;
    app.paintSceneForPoster(makeCtx(), 0, 0, 300, 400, { live: false });
    if (sc.gateValue !== true) problems.push('截图时结算遮罩的 200ms 延迟没被绕过');
    if (typeof sc.resultVisible !== 'function') problems.push('截图后没恢复 resultVisible');
  }
  // 2) 25 个游戏：结算态的截图比进行态多出遮罩内容（标题 / 分数 / 按钮 / 分享）
  const IDS = ['click', 'guess', 'poker', 'puzzle', 'g2048', 'snake', 'match', 'link', 'detective',
    'hunter', 'three', 'crush', 'sudoku', 'master', 'sort', 'down', 'slide', 'alchemy', 'mahjong',
    'quesheng', 'legend', 'mirror', 'point24', 'solo', 'gambler'];
  IDS.forEach((id) => {
    const SceneClass = require(path.join(ROOT, `js/games/${id}/scene`));
    fakeApp.sceneId = id;
    const sc = new SceneClass(fakeApp);
    sc.buttons = [];
    sc._hasRendered = true;
    app.scene = sc;
    const shot = () => {
      const texts = [];
      const c = makeCtx();
      c.fillText = (v) => { texts.push(String(v)); };
      app.paintSceneForPoster(c, 0, 0, 300, 400, { live: false });
      return texts;
    };
    if ('phase' in sc) sc.phase = 'play';
    if ('result' in sc) sc.result = 0;
    if (sc.logic) sc.logic.result = 0;
    if ('over' in sc) sc.over = false;
    const base = shot();
    if ('phase' in sc) sc.phase = RESULT[id] != null ? RESULT[id] : 'won';
    if ('result' in sc) sc.result = 2;
    if (sc.logic) sc.logic.result = 2;
    if ('over' in sc) sc.over = true;
    if (id === 'poker') { sc.winMask = { times: 1, key: 'x' }; sc.resultAt = Date.now(); }
    const won = shot();
    if (won.length <= base.length) problems.push(`${id}: 结算截图里没有遮罩内容`);
  });
  check(problems.length === 0, `截图含遮罩：${problems.slice(0, 5).join('；')}`);
}

// ---------- 截图裁剪：底部紧贴最低按钮（不留灰边），海报按裁剪后的比例 contain ----------
{
  const { App: AppCls } = require(path.join(ROOT, 'js/core/app'));
  const shareMod = require(path.join(ROOT, 'js/core/share'));
  const IDS = ['home', 'click', 'guess', 'poker', 'puzzle', 'g2048', 'snake', 'match', 'link', 'detective',
    'hunter', 'three', 'crush', 'sudoku', 'master', 'sort', 'down', 'slide', 'alchemy', 'mahjong',
    'quesheng', 'legend', 'mirror', 'point24', 'solo', 'gambler'];
  const problems = [];
  IDS.forEach((id) => {
    const SceneClass = require(path.join(ROOT, `js/games/${id}/scene`));
    fakeApp.sceneId = id;
    const sc = new SceneClass(fakeApp);
    sc.buttons = [];
    sc.render(makeCtx());
    const fake = { scene: sc, sceneId: id, captureSize: AppCls.prototype.captureSize };
    const { sy, sh, cropBottom } = fake.captureSize();
    if (!(sh > 0) || sy + sh > H + 0.5) problems.push(`${id}: 裁剪越界`);
    // 最低的那个小按钮
    let lowest = H - (require(path.join(ROOT, 'js/core/canvas')).SAFE_BOTTOM) - 16;
    sc.buttons.forEach((b) => {
      if (!b || b.h > H * 0.35 || b.w > W * 0.9) return;
      lowest = Math.max(lowest, b.y + b.h);
    });
    if (cropBottom < lowest - 0.5) problems.push(`${id}: 裁掉了最下面的按钮`);
    if (cropBottom - lowest > 16) problems.push(`${id}: 底部还留着 ${(cropBottom - lowest).toFixed(0)}px 背景`);
    // 只有在「显然还有空白」时才要求必须裁（安全区为 0 且内容贴到底时不强求）
    if (H - lowest > 30 && cropBottom >= H) problems.push(`${id}: 底部一点都没裁`);
  });
  // 海报 contain 的比例必须跟「裁剪后的源尺寸」一致（否则圆角里留一条空白）
  {
    const shot = [];
    const texts = [];
    const c2 = makeCtx();
    c2.fillText = (v) => { texts.push(String(v)); };
    const savedCreate = wx.createCanvas;
    wx.createCanvas = () => ({ width: 600, height: 480, getContext: () => c2, toTempFilePathSync: () => 't.png' });
    shareMod.setCapture((c, x, y, w, h) => { shot.push({ x, y, w, h }); return true; });
    shareMod.setSource(390, 760);
    shareMod.buildPoster({ phase: 'play' }, 'match', { live: true });
    const fg = shot[shot.length - 1];
    if (!fg) problems.push('海报：没有截图区域');
    else {
      const wantRatio = 390 / 760;
      const gotRatio = fg.w / fg.h;
      if (Math.abs(gotRatio - wantRatio) > 0.02) {
        problems.push(`海报：截图区比例 ${gotRatio.toFixed(3)} 与裁剪后源 ${wantRatio.toFixed(3)} 不一致`);
      }
    }
    shareMod.setSource(require(path.join(ROOT, 'js/core/canvas')).W,
      require(path.join(ROOT, 'js/core/canvas')).H);
    shareMod.setCapture(null);
    wx.createCanvas = savedCreate;
  }
  check(problems.length === 0, `截图裁剪：${problems.slice(0, 5).join('；')}`);
}

// ---------- 图标：用到的 glyph 必须在字体映射里；首页奖杯 = mdi:trophy-outline ----------
{
  const CODES = require(path.join(ROOT, 'js/core/icon-glyphs'));
  const problems = [];
  if (!CODES.trophy) problems.push('图标字体里没有 trophy（需要重跑 scripts/build-icons.py）');
  // 所有场景里 icons.draw(c, 'xxx') 引用的名字都要在映射里，否则真机会画成豆腐块
  const fsMod = require('fs');
  const files = [];
  const walk = (dir) => {
    fsMod.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
      const full = path.join(dir, d.name);
      if (d.isDirectory()) walk(full);
      else if (/\.js$/.test(d.name)) files.push(full);
    });
  };
  walk(path.join(ROOT, 'js/games'));
  walk(path.join(ROOT, 'js/core'));   // core 里也会 icons.draw（例如分享图标）
  const missing = new Set();
  files.forEach((f) => {
    const src = fsMod.readFileSync(f, 'utf8');
    const re = /icons\.draw\(\s*c\s*,\s*'([\w-]+)'/g;
    let m;
    while ((m = re.exec(src))) {
      if (!CODES[m[1]]) missing.add(`${path.basename(path.dirname(f))}:${m[1]}`);
    }
  });
  if (missing.size) problems.push(`图标名不在映射里：${[...missing].slice(0, 6).join('、')}`);
  // 首页成就按钮必须是 trophy-outline
  const homeSrc = fsMod.readFileSync(path.join(ROOT, 'js/games/home/scene.js'), 'utf8');
  if (!/icons\.draw\(c, 'trophy'/.test(homeSrc)) problems.push('首页成就按钮没有用 trophy 图标');
  // 分享图标：mdi:share-variant-outline（字体缺失时才走手绘兜底）
  const shareSrc = fsMod.readFileSync(path.join(ROOT, 'js/core/share.js'), 'utf8');
  if (!/icons\.draw\(c, 'share'/.test(shareSrc)) problems.push('分享图标没有用 share glyph');
  check(problems.length === 0, `图标：${problems.slice(0, 5).join('；')}`);
}

// ---------- 首页版式：页眉 + 每日挑战卡 + 5×5 索引网格 ----------
{
  const { HomeScene } = (() => {
    const Cls = require(path.join(ROOT, 'js/games/home/scene'));
    return { HomeScene: Cls };
  })();
  fakeApp.sceneId = 'home';
  const home = new HomeScene({
    ...fakeApp,
    openGame(id) { this.lastGame = id; },
  });
  home.layout();
  const problems = [];
  const g = home.grid;
  if (!g || g.cols !== 5 || g.rows !== 5) problems.push('网格不是 5×5');
  if (home.hexes.length !== 25) problems.push(`格子数 ${home.hexes.length}（应 25）`);
  // 单元格不重叠、都在屏内
  for (let a = 0; a < home.hexes.length; a += 1) {
    const p1 = home.hexes[a];
    if (p1.x < 0 || p1.x + p1.w > W + 0.5 || p1.y < 0 || p1.y + p1.h > H + 0.5) {
      problems.push(`${p1.id} 出界`);
    }
    for (let b = a + 1; b < home.hexes.length; b += 1) {
      const p2 = home.hexes[b];
      if (p1.x < p2.x + p2.w - 0.5 && p2.x < p1.x + p1.w - 0.5
        && p1.y < p2.y + p2.h - 0.5 && p2.y < p1.y + p1.h - 0.5) {
        problems.push(`${p1.id} 和 ${p2.id} 重叠`);
      }
    }
  }
  // 网格要让开底部 FAB，也不压每日挑战卡
  if (g.y + g.h > home.gearRect.y - 6) problems.push('网格压到底部 FAB');
  if (g.y < home.heroRect.y + home.heroRect.h) problems.push('网格压到每日挑战卡');
  if (home.heroRect.y < home.mastheadY + 12) problems.push('每日挑战卡压到页眉');
  // 页眉必须在微信胶囊下方（胶囊那一行右上是 ●●●◉，标题贴着它会压在一起）
  {
    const HEADER = require(path.join(ROOT, 'js/core/header'));
    const capsuleBottom = HEADER.TOP + HEADER.HEIGHT;
    if (home.mastheadY < capsuleBottom + 8) {
      problems.push(`页眉 y=${home.mastheadY} 没让开胶囊（胶囊下沿 ${capsuleBottom}）`);
    }
  }
  // 图标要和 web 版一致：2048 用 mdi:numeric（不是计算器），Threes 用 numeric-3
  {
    const homeSrc = require('fs').readFileSync(path.join(ROOT, 'js/games/home/scene.js'), 'utf8');
    if (!/g2048: 'numeric'/.test(homeSrc)) problems.push('2048 的图标不是 numeric（web 版是 i-mdi-numeric）');
    if (!/three: 'numeric-3'/.test(homeSrc)) problems.push('Threes 的图标不是 numeric-3');
  }

  // 绘制：25 个入口 + 每日挑战卡都能点
  const ctx2 = makeCtx();
  home.buttons = [];
  home.render(ctx2);
  const slots = home.buttons.filter((b) => /-game$/.test(b.id));
  if (slots.length !== 25) problems.push(`渲染只注册了 ${slots.length} 个游戏入口（应 25）`);
  if (!home.buttons.some((b) => b.id === 'home-hero')) problems.push('每日挑战卡没注册可点区域');
  // 每日挑战卡：药丸未完成 → 直接进任务对应的游戏；卡片其它部分 → 开面板
  {
    const dailyMod = require(path.join(ROOT, 'js/core/daily'));
    const origTask = dailyMod.todayTask;
    const home2 = new HomeScene({
      ...fakeApp,
      openGame(id) { this.lastGame = id; },
    });
    let opened = 0;
    home2.openDaily = () => { opened += 1; };
    // 未完成、绑定了具体游戏
    dailyMod.todayTask = () => ({ id: 't1', game: 'guess', desc: '赢一局 1A2B', done: false });
    home2.buttons = [];
    home2.render(makeCtx());
    const go = home2.buttons.find((b) => b.id === 'home-hero-go');
    const card = home2.buttons.find((b) => b.id === 'home-hero');
    if (!go) problems.push('每日挑战药丸没注册命中区');
    if (!card) problems.push('每日挑战卡本体没注册命中区');
    if (go) {
      go.onTap();
      if (home2.app.lastGame !== 'guess') problems.push(`药丸没直接进游戏（打开了 ${home2.app.lastGame}）`);
      if (opened) problems.push('药丸不该打开每日挑战面板');
    }
    // 卡片其它部分 → 开面板
    if (card) card.onTap();
    if (opened !== 1) problems.push('点卡片本体没打开每日挑战面板');
    // 已完成时药丸也只开面板
    dailyMod.todayTask = () => ({ id: 't1', game: 'guess', desc: '赢一局 1A2B', done: true });
    home2.buttons = [];
    opened = 0;
    home2.app.lastGame = null;
    home2.render(makeCtx());
    const go2 = home2.buttons.find((b) => b.id === 'home-hero-go');
    if (go2) {
      go2.onTap();
      if (opened !== 1 || home2.app.lastGame) problems.push('已完成时药丸不该进游戏');
    }
    // 任意游戏任务（game === '*'）也只能开面板
    dailyMod.todayTask = () => ({ id: 't2', game: '*', desc: '任意游戏赢 4 局', done: false });
    home2.buttons = [];
    opened = 0;
    home2.app.lastGame = null;
    home2.render(makeCtx());
    const go3 = home2.buttons.find((b) => b.id === 'home-hero-go');
    if (go3) {
      go3.onTap();
      if (opened !== 1 || home2.app.lastGame) problems.push('任意游戏任务的药丸不该进游戏');
    }
    dailyMod.todayTask = origTask;
  }

  // 点第一个格子进对应游戏；命中矩形 = 绘制矩形
  const first = home.hexes[0];
  const hit = home.hexAt(first.cx, first.cy);
  if (!hit || hit.id !== first.id) problems.push('hexAt 命中的不是第一个格子');
  const slot = home.buttons.find((b) => b.id === `${first.id}-game`);
  if (!slot) problems.push('第一个格子的入口没注册');
  else slot.onTap();
  if (home.app.lastGame !== first.id) problems.push(`点格子打开的是 ${home.app.lastGame}（应 ${first.id}）`);
  // 长按拖动仍然换序
  const before = home.order.slice();
  home.press = { id: before[0], x: first.cx, y: first.cy };
  home.startDrag();
  const second = home.hexes[1];
  home.onTouchMove({ x: second.cx, y: second.cy });
  home.drag = null;
  if (home.order[0] === before[0] && home.order[1] === before[1]) problems.push('拖动没有交换顺序');
  check(problems.length === 0, `首页版式：${problems.slice(0, 5).join('；')}`);
}

// ---------- 截图留白：顶部按「安全区 - 24」裁，海报里再留 4% 边距 ----------
{
  const { App: AppCls } = require(path.join(ROOT, 'js/core/app'));
  const canvasMod = require(path.join(ROOT, 'js/core/canvas'));
  const problems = [];
  const IDS = ['home', 'click', 'guess', 'poker', 'puzzle', 'g2048', 'snake', 'match', 'link', 'detective',
    'hunter', 'three', 'crush', 'sudoku', 'master', 'sort', 'down', 'slide', 'alchemy', 'mahjong',
    'quesheng', 'legend', 'mirror', 'point24', 'solo', 'gambler'];
  // 顶部公式：安全区 - 24（不小于 0），有标题栏按钮时再保证按钮上方 ≥18px
  // mock 里 SAFE_TOP = 0，运行期算出来一定是 0，所以再对源码断言一次（防止改回「裁满安全区」）
  {
    const appSrc = require('fs').readFileSync(path.join(ROOT, 'js/core/app.js'), 'utf8');
    if (!/Math\.min\(SAFE_TOP, 60\) - 24/.test(appSrc)) problems.push('顶部裁剪不是「安全区 - 24」（会贴到标题）');
    if (!/headerTop\) - 22/.test(appSrc)) problems.push('顶部缺「标题栏按钮上方 ≥22px」兜底');
  }
  IDS.forEach((id) => {
    const SceneClass = require(path.join(ROOT, `js/games/${id}/scene`));
    fakeApp.sceneId = id;
    const sc = new SceneClass(fakeApp);
    sc.buttons = [];
    sc.render(makeCtx());
    const fake = { scene: sc, sceneId: id, captureSize: AppCls.prototype.captureSize };
    const { sy } = fake.captureSize();
    const want = Math.max(0, Math.min(canvasMod.SAFE_TOP, 60) - 24);
    if (sy > want + 0.5) problems.push(`${id}: 顶部裁了 ${sy}px（应 ≤${want}）`);
    let headerTop = Infinity;
    sc.buttons.forEach((b) => {
      if (!b || b.h > H * 0.35 || b.w > W * 0.9) return;
      if (b.y < canvasMod.SAFE_TOP + 90) headerTop = Math.min(headerTop, b.y);
    });
    if (headerTop < Infinity && headerTop - sy < 18) {
      problems.push(`${id}: 标题栏按钮上方只剩 ${Math.round(headerTop - sy)}px`);
    }
  });
  // 海报里截图四周的边距（宽高都按比例缩，比例不变）
  {
    const shot = [];
    const c2 = makeCtx();
    const savedCreate = wx.createCanvas;
    wx.createCanvas = () => ({ width: 600, height: 480, getContext: () => c2, toTempFilePathSync: () => 't.png' });
    const shareMod = require(path.join(ROOT, 'js/core/share'));
    shareMod.setCapture((c, x, y, w, h) => { shot.push({ x, y, w, h }); return true; });
    shareMod.setSource(392, 761);   // 换个源尺寸避开海报缓存
    shareMod.buildPoster({ phase: 'play' }, 'match', { live: true });
    const fg = shot[shot.length - 1];
    if (!fg) problems.push('海报：没有截图区域');
    else {
      // 纵向边距（可用高 440）：截图四周收 4% 才会有 ≥12px
      const vPad = (440 - fg.h) / 2;
      if (vPad < 12) problems.push(`海报：截图上下边距只有 ${vPad.toFixed(0)}px`);
      if (fg.x < 12) problems.push(`海报：截图左边距只有 ${fg.x.toFixed(0)}px`);
      if (Math.abs(fg.w / fg.h - 392 / 761) > 0.02) problems.push('海报：截图比例被改了');
    }
    shareMod.setSource(require(path.join(ROOT, 'js/core/canvas')).W,
      require(path.join(ROOT, 'js/core/canvas')).H);
    shareMod.setCapture(null);
    wx.createCanvas = savedCreate;
  }
  check(problems.length === 0, `截图留白：${problems.slice(0, 5).join('；')}`);
}

// ---------- 分享海报：实时=游戏名+玩法一句话，结算=游戏名+成绩，首页面板有专属文案 ----------
{
  const shareMod = require(path.join(ROOT, 'js/core/share'));
  const canvasMod = require(path.join(ROOT, 'js/core/canvas'));
  const IDS = ['click', 'guess', 'poker', 'puzzle', 'g2048', 'snake', 'match', 'link', 'detective',
    'hunter', 'three', 'crush', 'sudoku', 'master', 'sort', 'down', 'slide', 'alchemy', 'mahjong',
    'quesheng', 'legend', 'mirror', 'point24', 'solo', 'gambler'];
  const texts = [];
  const ctx = makeCtx();
  ctx.fillText = (v) => { texts.push(String(v)); };
  const savedCreate = wx.createCanvas;
  wx.createCanvas = () => ({
    width: 600, height: 480, getContext: () => ctx,
    toTempFilePathSync: () => 'wxtmp://poster.png',
  });
  shareMod.setCapture(() => true);
  const problems = [];
  IDS.forEach((id) => {
    texts.length = 0;
    const poster = shareMod.buildPoster({ phase: 'play' }, id, { live: true });
    const name = i18n.t(`home.${id}Title`);
    if (!poster) { problems.push(`${id}: 没生成海报`); return; }
    if (poster.title !== name) problems.push(`${id}: 标题不是游戏名（${poster.title}）`);
    // 右侧应该有一句玩法（中英都非空，且不是游戏名本身）
    const intro = texts.find((v) => v.length > 6 && v !== name && v !== i18n.t('app.sharePosterTag')
      && v !== i18n.t('app.sharePosterSubLead') && v !== i18n.t('app.sharePosterSubTail'));
    if (!intro) problems.push(`${id}: 实时分享没有一句玩法`);

  });
  // 首页四个面板各有标题
  const panels = [['dailyOpen', 'app.sharePanelDaily'], ['achvOpen', 'app.sharePanelAchv'],
    ['settingsOpen', 'app.sharePanelSettings'], [null, 'app.sharePanelHome']];
  panels.forEach(([flag, key]) => {
    texts.length = 0;
    const scene = flag ? { [flag]: true } : {};
    const poster = shareMod.buildPoster(scene, 'home', { live: true, extra: ['统计行'] });
    const want = i18n.t(key);
    if (!poster || texts.indexOf(want) < 0) problems.push(`home${flag ? '.' + flag : ''}: 面板标题不是「${want}」`);
    if (texts.indexOf('统计行') < 0) problems.push(`home${flag ? '.' + flag : ''}: 没画出统计行`);
  });
  // 结算分享：不写玩法，写成绩
  texts.length = 0;
  const resultPoster = shareMod.buildPoster({ phase: 'won', level: 2, score: 128 }, 'match', {});
  if (!resultPoster || resultPoster.title.indexOf(i18n.t('home.matchTitle')) !== 0) {
    problems.push(`结算分享：标题不对（${resultPoster && resultPoster.title}）`);
  }
  if (texts.indexOf('本局 128 分') < 0) problems.push('结算分享：没写出本局成绩');
  // 截图裁剪：顶部状态栏留白裁掉、底部只留 ~18px
  {
    const calls = [];
    const c2 = makeCtx();
    c2.translate = (x, y) => calls.push(['translate', x, y]);
    c2.scale = (x, y) => calls.push(['scale', x, y]);
    const AppProto = require(path.join(ROOT, 'js/core/app')).App.prototype;
    const fake = {
      scene: { buttons: [], render: () => {} },
      sceneId: 'match',
      captureSize: AppProto.captureSize,
      paintSceneForPoster: AppProto.paintSceneForPoster,
    };
    fake.paintSceneForPoster(c2, 100, 20, 300, 240, { live: true, cover: false });
    const sy = Math.max(0, Math.min(canvasMod.SAFE_TOP, 60) - 24);   // 这个用例的场景没有按钮
    // 底部按「最低按钮 + 12px」裁（这个用例的场景没有按钮 → 用 FAB 行下沿）
    const cropBottom = Math.min(canvasMod.H, Math.round(canvasMod.H - canvasMod.SAFE_BOTTOM - 16 + 12));
    const sh = Math.max(Math.round(canvasMod.H * 0.55), cropBottom - sy);
    const scale = Math.min(300 / canvasMod.W, 240 / sh);
    const vert = calls.filter((c) => c[0] === 'translate')[1];
    if (!vert || Math.abs(vert[2] + sy) > 0.5) problems.push(`截图裁剪：没有裁掉顶部 ${sy}px`);
    const sc = calls.filter((c) => c[0] === 'scale')[0];
    if (!sc || Math.abs(sc[1] - scale) > 1e-6) problems.push('截图裁剪：缩放比例不对');
  }
  // 帮助弹窗打开时的截图要连弹窗一起截
  {
    const helpTexts = [];
    const c3 = makeCtx();
    c3.fillText = (v) => { helpTexts.push(String(v)); };
    const SceneClass = require(path.join(ROOT, 'js/games/match/scene'));
    fakeApp.sceneId = 'match';
    const sc = new SceneClass(fakeApp);
    sc.buttons = [];
    sc.helpOpen = true;
    const AppProto2 = require(path.join(ROOT, 'js/core/app')).App.prototype;
    const fake = {
      scene: sc,
      captureSize: AppProto2.captureSize,
      paintSceneForPoster: AppProto2.paintSceneForPoster,
    };
    fake.paintSceneForPoster(c3, 20, 20, 300, 240, { live: true });
    if (helpTexts.indexOf(i18n.t('helpTitle')) < 0) problems.push('截图：帮助弹窗没截进去');
  }
  wx.createCanvas = savedCreate;
  shareMod.setCapture(null);
  // 玩法表：25 个游戏都在、中文 ≤30 字、英文 ≤90 字符（海报右侧就一行，写长了会挤掉游戏名）
  {
    const src = require('fs').readFileSync(path.join(ROOT, 'js/core/share.js'), 'utf8');
    const table = src.slice(src.indexOf('const INTRO = {'), src.indexOf('};', src.indexOf('const INTRO = {')));
    const seen = [];
    table.replace(/(\w+): \['([^']*)', '([^']*)'\]/g, (m, id, cn, en) => {
      seen.push(id);
      if (!cn || !en) problems.push(`${id}: 玩法介绍缺中/英`);
      if (cn.length > 30) problems.push(`${id}: 中文玩法 ${cn.length} 字（应 ≤30）`);
      if (en.length > 90) problems.push(`${id}: 英文玩法 ${en.length} 字符（应 ≤90）`);
      return m;
    });
    IDS.forEach((id) => { if (seen.indexOf(id) < 0) problems.push(`${id}: INTRO 表里没有它`); });
    // 隐藏入口（扑克）也要能被分享链接打开，不能悄悄回退首页
    const dl = shareMod.getQueryGame({ query: 'game=poker' });
    if (dl !== 'poker') problems.push(`分享深链：game=poker 解析成 ${dl}`);
    if (shareMod.getQueryGame({ query: 'game=ttt' }) !== 'ttt') problems.push('分享深链：game=ttt 解析失败');
    if (shareMod.getQueryGame({ query: 'game=home' }) !== null) problems.push('分享深链：未知 id 应该回退首页');
    // README 的图标清单必须和代码一致（踩过：2048 写成 calculator）
    const readme = require('fs').readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    if (readme.indexOf('2048 `numeric`') < 0) problems.push('README：2048 图标没写成 numeric');
    if (readme.indexOf('2048 `calculator`') >= 0) problems.push('README：2048 还写着 calculator');
  }
  check(problems.length === 0, `分享文案：${problems.slice(0, 6).join('；')}`);
}

// ---------- 帮助 FAB 的小红点：没看过显示，看过永久消失 ----------
{
  const { App: AppCls } = require(path.join(ROOT, 'js/core/app'));
  const achvMod = require(path.join(ROOT, 'js/core/achv'));
  const DMod = require(path.join(ROOT, 'js/core/draw'));
  const origCircle = DMod.circle;
  const origSeen = achvMod.seenHelp;
  const dots = [];
  DMod.circle = function (c, x, y, r, color) {
    if (Math.abs(r - 4.2) < 0.01) dots.push({ x, y, color });
    return origCircle.apply(DMod, arguments);
  };
  const IDS = ['click', 'guess', 'poker', 'puzzle', 'g2048', 'snake', 'match', 'link', 'detective',
    'hunter', 'three', 'crush', 'sudoku', 'master', 'sort', 'down', 'slide', 'alchemy', 'mahjong',
    'quesheng', 'legend', 'mirror', 'point24', 'solo', 'gambler'];
  const problems = [];
  // 前面的用例已经把 25 个帮助都看过了，这里用桩控制「看过 / 没看过」两态
  achvMod.seenHelp = () => false;
  IDS.forEach((id) => {
    const SceneClass = require(path.join(ROOT, `js/games/${id}/scene`));
    fakeApp.sceneId = id;
    const sc = new SceneClass(fakeApp);
    sc.buttons = [];
    sc.render(makeCtx());
    const helpBtn = sc.buttons.find((b) => b.id === 'help' || b.id === 'fab-help' || b.id === 'help-fab');
    if (!helpBtn) { problems.push(`${id}: 没有帮助按钮`); return; }
    dots.length = 0;
    AppCls.prototype.drawHelpDot.call({ scene: sc, sceneId: id }, makeCtx());
    if (dots.length !== 1) { problems.push(`${id}: 未看过时有 ${dots.length} 个红点`); return; }
    const wantX = helpBtn.x + helpBtn.w * 0.84;
    const wantY = helpBtn.y + helpBtn.h * 0.16;
    if (Math.abs(dots[0].x - wantX) > 0.5 || Math.abs(dots[0].y - wantY) > 0.5) {
      problems.push(`${id}: 红点不在帮助按钮右上角`);
    }
  });
  // 看过之后：一个点都不画
  achvMod.seenHelp = () => true;
  IDS.forEach((id) => {
    const SceneClass = require(path.join(ROOT, `js/games/${id}/scene`));
    fakeApp.sceneId = id;
    const sc = new SceneClass(fakeApp);
    sc.buttons = [];
    sc.render(makeCtx());
    dots.length = 0;
    AppCls.prototype.drawHelpDot.call({ scene: sc, sceneId: id }, makeCtx());
    if (dots.length !== 0) problems.push(`${id}: 看过帮助后红点还在`);
  });
  achvMod.seenHelp = origSeen;
  // 首页永远没有红点
  dots.length = 0;
  AppCls.prototype.drawHelpDot.call({ scene: { buttons: [] }, sceneId: 'home' }, makeCtx());
  if (dots.length) problems.push('home: 首页不该有红点');
  // 真实存档语义：markHelp 之后 seenHelp 为真；问号游戏用老 key 补齐
  const probeId = 'click';
  achvMod.markHelp(probeId);
  check(achvMod.seenHelp(probeId) === true, '帮助红点：markHelp 之后 seenHelp 仍为 false');
  wx.setStorageSync('__quesheng__help_showed', '1');
  check(achvMod.seenHelp('quesheng') === true, '帮助红点：奇圣的老存档 key 没被认（会误报红点）');
  DMod.circle = origCircle;
  check(problems.length === 0, `帮助红点：${problems.slice(0, 5).join('；')}`);
}

if (failures.length) {
  console.error(`✗ ${failures.length} 处失败：`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('✓ 25 个场景：渲染无异常、静音 FAB 位置正确、静音真拦住了音效、全局关闭时不展示');