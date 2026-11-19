// 游戏区上方的「鼓励条」（Emoji 下坠 / Emoji 消消乐共用）：
// 从屏幕顶部砸下来（越过落点 → 压扁 → 阻尼回弹）→ 停留 → 放大淡出。
// 只负责画、不注册任何按钮；底色是浅色半透明，压在画面上也不会糊成一块实心色。
const { W } = require('./canvas');
const theme = require('./theme');
const D = require('./draw');

const LIFE = 1500;      // 整条提示的存在时间
const DROP_MS = 460;    // 从屏幕顶部砸下来
const EXIT_MS = 360;    // 最后这段放大 + 淡出

// 「砸下来」的位移曲线：先慢慢出动、后段重力加速，越过落点 4.5% 再弹回来
function dropProgress(t) {
  const k = Math.max(0, Math.min(1, t));
  const IMPACT = 0.66;
  if (k < IMPACT) {
    const u = k / IMPACT;
    return 1.045 * u * u;
  }
  if (k < 0.8) return 1.045 + (0.985 - 1.045) * ((k - IMPACT) / (0.8 - IMPACT));
  if (k < 0.92) return 0.985 + (1.008 - 0.985) * ((k - 0.8) / (0.92 - 0.8));
  return 1.008 + (1 - 1.008) * ((k - 0.92) / (1 - 0.92));
}

// 挤压 / 拉伸：下落时纵向拉长，触底瞬间压扁，然后阻尼回正
function dropSquash(ageMs) {
  const IMPACT_MS = DROP_MS * 0.66;
  if (ageMs < IMPACT_MS) {
    const u = Math.max(0, Math.min(1, ageMs / IMPACT_MS));
    return { x: 1 - 0.05 * u, y: 1 + 0.1 * u };
  }
  const d = (ageMs - IMPACT_MS) / 300;
  const damp = Math.exp(-3.2 * d) * Math.cos(d * Math.PI * 2.6);
  return { x: 1 + 0.12 * damp, y: 1 - 0.17 * damp };
}

// 文字 / 描边颜色：随机取一条（同一档文案不会永远是同一个绿）
// 暗色主题要亮色（压在深色胶囊上），浅色主题要深色（压在白色胶囊上），两套不能混用
const PALETTE = {
  dark: ['#ffb08a', '#ffd166', '#7ee2b8', '#8ecbff', '#d3a6ff', '#ff9ec0'],
  light: ['#d9632c', '#b57908', '#1f7a4d', '#2268ab', '#7a4bbd', '#c23b6b'],
};

function paletteColor(index, dark) {
  const list = dark ? PALETTE.dark : PALETTE.light;
  const i = Math.abs(Math.floor(index || 0)) % list.length;
  return list[i];
}

// 没传 colorIndex 时按文案做一次小哈希，至少保证「不同句子不同颜色」
function textColor(text, dark) {
  let h = 0;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
  return paletteColor(h, dark);
}

// 画一帧；返回这一帧的矩形（场景自己存起来给冒烟 / 布局用）
// o = { text, age, topY, boardY, colorIndex }
function draw(c, o) {
  const dark = theme.dark;
  const age = Math.max(0, o.age);
  const fadeIn = Math.min(1, age / 100);
  // 最后一段：一边放大一边淡出（像被「吹」散掉）
  const outT = age > LIFE - EXIT_MS
    ? Math.max(0, Math.min(1, (age - (LIFE - EXIT_MS)) / EXIT_MS))
    : 0;
  const alpha = fadeIn * (1 - outT) * (1 - outT);
  const label = o.text;
  const maxTextW = W - 72;
  let size = 17;
  while (size > 10 && D.measure(c, label, size, 'bold') > maxTextW) size -= 1;
  const textW = D.measure(c, label, size, 'bold');
  const bw = Math.min(W - 40, textW + 30);
  const bh = Math.round(size + 17);
  // 从屏幕顶部（header 之上）掉下来，落点是「底边正好贴着游戏区顶部」
  const yStart = o.topY - bh;
  const yTarget = o.boardY - bh / 2;
  const k = age >= DROP_MS ? 1 : dropProgress(age / DROP_MS);
  const y = yStart + (yTarget - yStart) * k;
  const squash = dropSquash(age);
  const grow = 1 + 0.45 * outT * outT;
  const sx = squash.x * grow;
  const sy = squash.y * grow;
  const rect = { x: (W - bw) / 2, y: y - bh / 2, w: bw, h: bh };
  // 胶囊底色：暗色用「深底 + 亮字」（纯白半透明 + 白字在深色主题里会糊成一片灰白），浅色用白底 + 深字
  const fill = dark ? 'rgba(22,24,26,0.82)' : 'rgba(255,255,255,0.92)';
  const fg = o.colorIndex == null ? textColor(label, dark) : paletteColor(o.colorIndex, dark);
  c.save();
  c.globalAlpha = alpha;
  c.translate(W / 2, y);
  c.scale(sx, sy);
  c.shadowColor = dark ? 'rgba(0,0,0,0.42)' : 'rgba(0,0,0,0.18)';
  c.shadowBlur = 14;
  c.shadowOffsetY = 4;
  D.fillRoundRect(c, -bw / 2, -bh / 2, bw, bh, bh / 2, fill);
  // 同色细描边：深色主题里靠它把胶囊和背后画面分开
  c.globalAlpha = alpha * 0.55;
  c.strokeStyle = fg;
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(-bw / 2 + bh / 2, -bh / 2);
  c.arcTo(bw / 2, -bh / 2, bw / 2, bh / 2, bh / 2);
  c.arcTo(bw / 2, bh / 2, -bw / 2, bh / 2, bh / 2);
  c.arcTo(-bw / 2, bh / 2, -bw / 2, -bh / 2, bh / 2);
  c.arcTo(-bw / 2, -bh / 2, bw / 2, -bh / 2, bh / 2);
  c.closePath();
  c.stroke();
  c.restore();
  c.save();
  c.globalAlpha = alpha;
  c.translate(W / 2, y);
  c.scale(sx, sy);
  D.text(c, label, 0, 0, { size, weight: 'bold', color: fg, align: 'center' });
  c.restore();
  return rect;
}

module.exports = { LIFE, DROP_MS, EXIT_MS, PALETTE, paletteColor, textColor, dropProgress, dropSquash, draw };
