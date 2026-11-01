// Canvas icon font generated from the same Iconify JSON that UnoCSS uses.
// Mini games have no CSS/DOM, so we don't use `i-carbon-*` classes; we load
// the generated TTF once and draw private-use glyphs with fillText.
const CODES = require('./icon-glyphs');

let family = null;
let initialized = false;
let probe = null;
let probeCtx = null;
const centerCache = new Map();

function init() {
  if (initialized) return family;
  initialized = true;
  if (wx.loadFont) {
    try {
      family = wx.loadFont('fonts/games-hub-icons.ttf');
    } catch (e) {
      family = null;
    }
  }
  return family;
}

function glyph(key) {
  const code = CODES[key];
  return code ? String.fromCharCode(code) : '';
}

// 真机 canvas 的 actualBoundingBox / textAlign 组合并不可靠：直接离屏画一次，
// 扫描 alpha 墨迹边界，得到“把墨迹中心移到绘制点”需要的水平偏移。
function pixelCenterOffset(ch, size) {
  const cacheKey = `${ch}:${size}`;
  if (centerCache.has(cacheKey)) return centerCache.get(cacheKey);
  let offset = null;
  try {
    if (!probe && wx.createCanvas) {
      probe = wx.createCanvas();
      probeCtx = probe.getContext('2d');
    }
    if (probe && probeCtx) {
      const dim = Math.ceil(size * 3 + 12);
      probe.width = dim;
      probe.height = dim;
      const pc = probe.getContext('2d');
      pc.clearRect(0, 0, dim, dim);
      pc.font = `${size}px "${family}"`;
      pc.fillStyle = '#fff';
      pc.textAlign = 'left';
      pc.textBaseline = 'middle';
      const ax = dim / 2;
      const ay = dim / 2;
      pc.fillText(ch, ax, ay);
      const data = pc.getImageData(0, 0, dim, dim).data;
      let minX = dim, maxX = -1;
      for (let yy = 0; yy < dim; yy++) {
        for (let xx = 0; xx < dim; xx++) {
          if (data[(yy * dim + xx) * 4 + 3] > 8) {
            if (xx < minX) minX = xx;
            if (xx > maxX) maxX = xx;
          }
        }
      }
      if (maxX >= minX) offset = ax - (minX + maxX + 1) / 2;
    }
  } catch (e) { offset = null; }
  centerCache.set(cacheKey, offset);
  return offset;
}

function draw(c, key, x, y, size, color, align) {
  if (!family) return false;
  const ch = glyph(key);
  if (!ch) return false;
  c.save();
  c.font = `${size}px "${family}"`;
  c.fillStyle = color;
  c.textBaseline = 'middle';
  // 自定义字体的 advance 中心不一定等于墨迹中心（不同端还可能忽略 textAlign）。
  // 优先用 actualBoundingBox 把真实墨迹框居中；没有该 API 时退回 advance 宽度。
  const m = c.measureText(ch);
  const width = m.width || 0;
  const a = align || 'center';
  let tx;
  if (a === 'center') {
    const pixel = pixelCenterOffset(ch, size);
    if (pixel != null) {
      tx = x + pixel;
    } else {
      // 离屏探针不可用时，退回「中心对齐 + 墨迹框偏移」，至少不依赖 textAlign=left 的端差异。
      const left = Number.isFinite(m.actualBoundingBoxLeft) ? m.actualBoundingBoxLeft : width / 2;
      const right = Number.isFinite(m.actualBoundingBoxRight) ? m.actualBoundingBoxRight : width / 2;
      c.textAlign = 'center';
      c.fillText(ch, x - (right - left) / 2, y);
      c.restore();
      return true;
    }
  } else if (a === 'right') {
    tx = x - width;
  } else {
    tx = x;
  }
  c.textAlign = 'left';
  c.fillText(ch, tx, y);
  c.restore();
  return true;
}

module.exports = {
  init,
  glyph,
  draw,
  get family() { return family; },
  get ready() { return !!family; },
};
