// 麻将牌雪碧图：与 web / 小程序同一张 7×7 图（每格 131×168），从 shared 复制到小游戏包内。
// 小游戏没有 DOM Image；用 wx.createImage() 加载本地图片，加载完成前画文字降级牌面。
const COLS = 7;
const ROWS = 7;
const SW = 131;
const SH = 168;
const TILE_RATIO = SH / SW;

const SLOT_ORDER = [
  ...Array.from({ length: 9 }, (_, i) => `m${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `s${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `p${i + 1}`),
  'z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7',
  'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8',
];
const SLOT = {};
SLOT_ORDER.forEach((key, i) => { SLOT[key] = [Math.floor(i / COLS), i % COLS]; });

let image = null;
let ready = false;

function preload() {
  if (image || !wx.createImage) return;
  image = wx.createImage();
  image.onload = () => { ready = true; };
  image.onerror = () => { ready = false; };
  image.src = 'images/mahjong-tiles.png';
}

function drawFace(c, key, x, y, w, h) {
  if (!ready || !image) return false;
  const slot = SLOT[key] || SLOT.m1;
  const [row, col] = slot;
  // 内缩 1px，避免雪碧图邻格边缘毛边
  c.drawImage(image, col * SW + 1, row * SH + 1, SW - 2, SH - 2, x, y, w, h);
  return true;
}

module.exports = { preload, drawFace, TILE_RATIO, ready: () => ready };
