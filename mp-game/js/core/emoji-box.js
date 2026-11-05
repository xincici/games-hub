// emoji 墨迹框测量（逐字、带缓存）。
//
// 为什么需要它：卡片里的 emoji 是用 fillText 画的，想「真正居中」必须知道**墨迹**的
// 包围盒，而不是字体给的 advance / 行高。iOS 的 measureText 会给 actualBoundingBox*，
// 但不少 Android 机型（微信自绘 canvas）不返回这些字段，于是只能退回 textBaseline='middle'，
// 再叠一个写死的 0.18em 光学补偿 —— 在 Noto Color Emoji 上就会整体偏下，甚至顶出卡片边框；
// 个别 emoji 的字形左右留白还不一样，于是横向也偏。
//
// 这里用一块离屏画布逐字画出 emoji，再用 getImageData 找真实墨迹框，算出「墨迹中心相对
// 绘制原点的偏移」，调用方按偏移反推坐标即可。结果按「字号 + 字形」缓存，同一张牌只量一次。
// 拿不到第二块画布 / 没有 getImageData 时返回 null，由调用方退回旧行为（不会抛错）。

const BOX = 96;            // 测量画布边长（要能装下最大的 emoji 字号 + 墨迹）
let surface = null;        // { canvas, ctx } | false（false = 不可用）
const cache = new Map();   // `${size}|${glyph}` → { dx, dy } | null

function getSurface() {
  if (surface !== null) return surface;
  try {
    if (!wx.createCanvas) { surface = false; return surface; }
    const canvas = wx.createCanvas();
    // 第一次调用 wx.createCanvas() 拿到的是主画布，不能用来做离屏测量
    const main = require('./canvas').canvas;
    if (!canvas || canvas === main || typeof canvas.getContext !== 'function') {
      surface = false;
      return surface;
    }
    canvas.width = BOX;
    canvas.height = BOX;
    const ctx = canvas.getContext('2d');
    surface = ctx ? { canvas, ctx } : false;
  } catch (e) {
    surface = false;
  }
  return surface;
}

// 返回 { dx, dy }：调用方应画在 (cx - dx, cy - dy)，墨迹中心才落在 (cx, cy)；
// 量不出来返回 null。
function measure(glyph, size, family) {
  const key = `${Math.round(size)}|${glyph}`;
  if (cache.has(key)) return cache.get(key);

  const s = getSurface();
  if (!s) { cache.set(key, null); return null; }
  const { ctx } = s;
  const orgX = BOX / 2;
  const orgY = BOX / 2 + size * 0.45;    // 基线压低一点，避免偏高的 emoji 被裁顶

  ctx.clearRect(0, 0, BOX, BOX);
  ctx.font = `${size}px ${family}`;
  // 与绘制时保持同一对齐方式：这样 dx 就是「相对 textAlign 锚点」的横向偏移
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#000';
  ctx.fillText(glyph, orgX, orgY);

  let data;
  try {
    data = ctx.getImageData(0, 0, BOX, BOX).data;
  } catch (e) {
    cache.set(key, null);
    return null;
  }
  let minX = BOX;
  let minY = BOX;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < BOX; y += 1) {
    const row = y * BOX;
    for (let x = 0; x < BOX; x += 1) {
      if (data[(row + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) { cache.set(key, null); return null; }

  const box = {
    dx: (minX + maxX) / 2 - orgX,
    dy: (minY + maxY) / 2 - orgY,
  };
  cache.set(key, box);
  return box;
}

module.exports = { measure, BOX };
