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
      img.onload = () => resolve();
      img.onerror = () => resolve();     // 加载失败也不要卡住开局
      img.src = sheet;
    });
  }
  return sheetPromise;
}
//
// 取格子用百分比而不是像素：background-size 放大 ZOOM 倍之后，
// 「第 i 格的中心落在元素中心」解出来是 slotPos(i) = (k(i+0.5) − 0.5) / (n·k − 1)
// （k = ZOOM、n = 列/行数；k = 1 时退化成 i/(n−1)，也就是常见写法）。
// 与元素实际尺寸无关，所以牌随视口缩放都不用改样式。
export const COLS = 7;
export const ROWS = 5;

// 裁切时每格四周带了 1px 原图的列/行间隙，不放大的话牌贴着的那条边会出现一条白线
// （条牌最明显）。放大 5% 等于把牌画小一点，把这圈边缘推出元素之外；两轴同比，长宽比不变。
export const ZOOM = 1.05;
export const BG_W = COLS * ZOOM;
export const BG_H = ROWS * ZOOM;

export const SLOT_ORDER = [
  ...Array.from({ length: 9 }, (_, i) => `m${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `s${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `p${i + 1}`),
  'z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7',
];
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
