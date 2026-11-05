// 纯像素模糊工具（不依赖 canvas API，方便 Node 里直接测）。
// 可分离盒式模糊：横向 + 纵向各扫一遍，滑窗求和；多遍叠加近似高斯。
// 只处理 RGB，alpha 原样保留（毛玻璃底图是整屏不透明，不需要模糊透明度）。

function pass(src, dst, w, h, r, horizontal) {
  const win = r * 2 + 1;
  if (horizontal) {
    for (let y = 0; y < h; y += 1) {
      const row = y * w * 4;
      let sr = 0; let sg = 0; let sb = 0;
      for (let i = -r; i <= r; i += 1) {
        const x = Math.min(w - 1, Math.max(0, i)) * 4;
        sr += src[row + x]; sg += src[row + x + 1]; sb += src[row + x + 2];
      }
      for (let x = 0; x < w; x += 1) {
        const o = row + x * 4;
        dst[o] = sr / win; dst[o + 1] = sg / win; dst[o + 2] = sb / win; dst[o + 3] = src[o + 3];
        const add = Math.min(w - 1, Math.max(0, x + r + 1)) * 4;
        const sub = Math.min(w - 1, Math.max(0, x - r)) * 4;
        sr += src[row + add] - src[row + sub];
        sg += src[row + add + 1] - src[row + sub + 1];
        sb += src[row + add + 2] - src[row + sub + 2];
      }
    }
    return;
  }
  const stride = w * 4;
  for (let x = 0; x < w; x += 1) {
    let sr = 0; let sg = 0; let sb = 0;
    for (let i = -r; i <= r; i += 1) {
      const y = Math.min(h - 1, Math.max(0, i)) * stride + x * 4;
      sr += src[y]; sg += src[y + 1]; sb += src[y + 2];
    }
    for (let y = 0; y < h; y += 1) {
      const o = y * stride + x * 4;
      dst[o] = sr / win; dst[o + 1] = sg / win; dst[o + 2] = sb / win; dst[o + 3] = src[o + 3];
      const add = Math.min(h - 1, Math.max(0, y + r + 1)) * stride + x * 4;
      const sub = Math.min(h - 1, Math.max(0, y - r)) * stride + x * 4;
      sr += src[add] - src[sub];
      sg += src[add + 1] - src[sub + 1];
      sb += src[add + 2] - src[sub + 2];
    }
  }
}

// 原地模糊 RGBA 像素数组；passes 遍盒式（2 遍已接近高斯）
function boxBlurRGBA(data, w, h, r, passes) {
  if (!data || w < 1 || h < 1 || r < 1) return data;
  const tmp = new Uint8ClampedArray(data.length);
  const times = Math.max(1, passes || 1);
  for (let i = 0; i < times; i += 1) {
    pass(data, tmp, w, h, r, true);
    pass(tmp, data, w, h, r, false);
  }
  return data;
}

module.exports = { boxBlurRGBA };
