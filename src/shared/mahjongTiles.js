// 麻将牌面雪碧图：一整副 34 张牌拼成 7×5 的一张 webp（每格 131×168），
// 麻将英雄（只用筒）和雀圣（用整副）共用这一份。
import sheet from './mahjong-tiles.webp';

export const TILE_SHEET = sheet;

// 开局/恢复前先 await 一次，把这张图读进缓存：
// 不预加载的话，牌元素先渲染出来、图却要等下载完才出现 —— 冷启动会看到明显的空白与延迟
// （雀圣那边还会连带把入场波浪的顺序盖掉）。两个游戏共用这份缓存，先到先加载。
let sheetPromise = null;
export function preloadTiles() {
  if (!sheetPromise) {
    sheetPromise = new Promise(resolve => {
      const img = new Image();
      // decode() 才是真正把图变成可绘制的位图；只等 onload 的话，进游戏第一帧仍可能空白
      img.onload = () => (img.decode ? img.decode().then(resolve, resolve) : resolve());
      img.onerror = () => resolve();     // 加载失败也不要卡住开局
      img.src = sheet;
    });
  }
  return sheetPromise;
}

// 首页空闲时预热这张雪碧图（181KB）：进「麻将英雄 / 雀圣 / 麻将传奇 / 赌神 / 对对碰（麻将牌面）」
// 时就不会先空白一下。挂到 requestIdleCallback（首屏空闲之后）跑，绝不抢首屏带宽；
// 浏览器不支持就退化成 1.2s 后的 setTimeout。重复调用无副作用（sheetPromise 记住结果）。
let idleScheduled = false;
export function idlePreloadTiles() {
  if (idleScheduled) return;
  idleScheduled = true;
  const run = () => { preloadTiles().catch(() => {}); };
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 3000 });
  } else {
    setTimeout(run, 1200);
  }
}

//
// 取格子用百分比而不是像素：background-size 放大 ZOOM 倍之后，
// 「第 i 格的中心落在元素中心」解出来是 slotPos(i) = (k(i+0.5) − 0.5) / (n·k − 1)
// （k = ZOOM、n = 列/行数；k = 1 时退化成 i/(n−1)，也就是常见写法）。
// 与元素实际尺寸无关，所以牌随视口缩放都不用改样式。
export const COLS = 7;
// 第 1~5 行是 34 张牌面（与原图逐像素一致），第 6~7 行是 8 张花牌（赌神用的万能牌）
export const ROWS = 7;

// ⚠️ 必须 ≥ 1.05：雪碧图**每格四周都带了 1px 原图相邻行列的像素**（当年裁图时留下的），
// 这个放大等于把牌画大 5%、把那圈邻居边缘推到元素之外；不放大就会在牌贴着的那条边
// 看到一条毛边/白线（玩家反馈「新版本的麻将牌似乎有边框毛边」，回退 ZOOM 后视觉立刻正常）。
// 代价是每边裁掉约 2.4%（≈3px 的原图边缘），这是这套雪碧图既定的取舍。
// 两轴同比，长宽比不变；这里写 1.05 时 --bg-w/--bg-h 都是 735%（7 列 / 7 行 × 1.05）。
export const ZOOM = 1.05;
export const BG_W = COLS * ZOOM;
export const BG_H = ROWS * ZOOM;

export const SLOT_ORDER = [
  ...Array.from({ length: 9 }, (_, i) => `m${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `s${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `p${i + 1}`),
  'z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7',
  // 花牌：f1 將 / f2 兰 / f3 菊 / f4 竹 / f5 春 / f6 夏 / f7 秋 / f8 冬
  ...Array.from({ length: 8 }, (_, i) => `f${i + 1}`),
];

// 花牌 = 万能牌（赌神用）。'f1'..'f8' 都是花牌，牌面 key 见 SLOT_ORDER。
export const FLOWER_KEYS = SLOT_ORDER.slice(SLOT_ORDER.indexOf('f1'));
export const isFlower = key => typeof key === 'string' && key[0] === 'f';
export const TILE_SLOT = Object.fromEntries(SLOT_ORDER.map((k, i) => [k, [Math.floor(i / COLS), i % COLS]]));

// 牌的长宽比（131 : 168）
export const TILE_RATIO = 168 / 131;

const slotPos = (i, n, k) => (((k * (i + 0.5) - 0.5) / (n * k - 1)) * 100);

// 给一个 { suit, num }（或直接给键 'p3'）返回 CSS 变量
export function spriteVars(tile) {
  const key = typeof tile === 'string' ? tile : `${tile.suit}${tile.num}`;
  const [r, c] = TILE_SLOT[key] || [0, 0];
  return {
    '--bg-x': `${slotPos(c, COLS, ZOOM)}%`,
    '--bg-y': `${slotPos(r, ROWS, ZOOM)}%`,
    '--bg-w': `${BG_W * 100}%`,
    '--bg-h': `${BG_H * 100}%`,
  };
}
