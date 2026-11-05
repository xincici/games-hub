// 统一帮助弹窗：固定半屏高、顶部问号+标题居中、内容可滚动。
const { W, H } = require('./canvas');
const theme = require('./theme');
const D = require('./draw');
const i18n = require('./i18n');
const blur = require('./blur');
const icons = require('./icons');

const { t } = i18n;
const states = new WeakMap();

// 毛玻璃：把画面缩到 1/2，再在像素上做两遍可分离盒式模糊（≈ 高斯），最后放大 2 倍画回来。
// 为什么不再靠 drawImage 平滑 / ctx.filter：这些能力各家基础库默认值和支持度都不一样，
// 放大倍数一高就会露出硬边（马赛克）。自己算模糊只依赖 getImageData/putImageData，
// 而且只在「打开帮助的那一帧」算一次 —— 帮助打开时场景本来就冻结，之后每帧贴缓存即可。
const HALF = 2;          // 采样分辨率 1/2：放大只有 2 倍，即使最近邻也只有 2px 台阶
const BLUR_R = 5;        // 以 1/2 分辨率计，≈ 逻辑像素 10
const BLUR_PASSES = 2;   // 两遍盒式 ≈ 高斯
let blurSurface = null;

function getBlurSurface() {
  if (blurSurface !== null) return blurSurface;
  try {
    const main = require('./canvas').canvas;
    if (!wx.createCanvas) { blurSurface = false; return blurSurface; }
    const off = wx.createCanvas();
    if (!off || off === main || typeof off.getContext !== 'function') { blurSurface = false; return blurSurface; }
    const w = Math.max(16, Math.ceil(W / HALF));
    const h = Math.max(16, Math.ceil(H / HALF));
    off.width = w;
    off.height = h;
    const ctx = off.getContext('2d');
    if (!ctx) { blurSurface = false; return blurSurface; }
    blurSurface = { canvas: off, ctx, w, h };
  } catch (e) {
    blurSurface = false;
  }
  return blurSurface;
}

// 显式打开双线性插值（各家默认值不一致，不设就可能放大成硬像素）
function smooth(ctx, on) {
  try {
    ctx.imageSmoothingEnabled = on;
    ctx.imageSmoothingQuality = on ? 'high' : 'low';
  } catch (e) { /* 老基础库没有这两个属性，忽略 */ }
}

// 整屏纯色 / 读回全 0 说明抓图失败（或画面本来就一片平），此时模糊也无意义
function hasDetail(data) {
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4 * 97) {
    const v = data[i];
    if (v < min) min = v;
    if (v > max) max = v;
    if (max - min > 2) return true;
  }
  return max - min > 2;
}

// 打开帮助的第一帧拍一张、模糊一次，存进 s.backdrop 复用
function buildBackdrop() {
  const main = require('./canvas').canvas;
  const surf = getBlurSurface();
  if (!surf) return null;
  try {
    surf.ctx.clearRect(0, 0, surf.w, surf.h);
    smooth(surf.ctx, true);
    surf.ctx.drawImage(main, 0, 0, surf.w, surf.h);
    const img = surf.ctx.getImageData(0, 0, surf.w, surf.h);
    if (!hasDetail(img.data)) return null;
    blur.boxBlurRGBA(img.data, surf.w, surf.h, BLUR_R, BLUR_PASSES);
    surf.ctx.putImageData(img, 0, 0);
    return surf.canvas;
  } catch (e) {
    return null;
  }
}

function drawFrostedBackdrop(c, s) {
  if (s.backdrop === undefined || s.backdropDark !== theme.dark) {
    s.backdrop = buildBackdrop() || false;   // 失败也记下来，别每帧重算
    s.backdropDark = theme.dark;
  }
  if (!s.backdrop) {
    // 连像素都读不到（极老基础库）：退回纯半透明遮罩，至少不是马赛克
    c.fillStyle = 'rgba(0,0,0,0.32)';
    c.fillRect(0, 0, W, H);
    return;
  }
  c.save();
  smooth(c, true);
  c.drawImage(s.backdrop, 0, 0, W, H);
  c.fillStyle = theme.dark ? 'rgba(18,18,18,0.45)' : 'rgba(255,255,255,0.4)';
  c.fillRect(0, 0, W, H);
  c.restore();
}

function stateOf(scene) {
  let s = states.get(scene);
  if (!s) {
    // anim：0 完全收起、1 完全展开；at 是上一帧时间
    s = { scroll: 0, max: 0, drag: null, open: false, anim: 0, at: 0 };
    states.set(scene, s);
  }
  return s;
}

// 帮助 FAB 的中心（圆形展开的圆心）；各游戏的 FAB 字段名不统一，逐个兜底
function fabRect(scene) {
  const r = (scene && (scene.helpFab || scene.helpRect)) || null;
  if (r && Number.isFinite(r.x) && Number.isFinite(r.w)) {
    const h = Number.isFinite(r.h) ? r.h : r.w;
    return { x: r.x, y: r.y, w: r.w, h };
  }
  // 有些场景只存 fabX / fabY / fabSize（关灯游戏等）
  if (scene && Number.isFinite(scene.fabX) && Number.isFinite(scene.fabY)) {
    const size = Number.isFinite(scene.fabSize) ? scene.fabSize : 40;
    return { x: scene.fabX, y: scene.fabY, w: size, h: size };
  }
  return { x: W - 56, y: H - 92, w: 40, h: 40 };
}

function fabCenter(scene) {
  const r = fabRect(scene);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

// 关闭动画还在播时，App 需要继续调用 draw()
function animating(scene) {
  const s = states.get(scene);
  return !!s && s.anim > 0;
}

// 帮助正文支持三种行首标记（写在各游戏 i18n 的 helpMsg 里）：
//   `## ` 小标题    `- ` 项目符号    空行 → 段间距
// 其余按普通段落处理；统一在这里折行，场景侧只写文案。
function helpBlocks(c, scene) {
  const id = scene && scene.app && scene.app.sceneId;
  if (!id) return [];
  const keys = ['helpMsg'];
  for (let i = 1; i <= 20; i++) keys.push(`help${i}`);
  const blocks = [];
  let gap = false;
  keys.forEach((key) => {
    const value = t(`${id}.${key}`);
    if (value === `${id}.${key}`) return;
    String(value).split('\n').forEach((line) => {
      const raw = line.trim();
      if (!raw) { gap = true; return; }
      const kind = raw.startsWith('## ') ? 'head' : raw.startsWith('- ') ? 'bullet' : 'para';
      const text = kind === 'head' ? raw.slice(3).trim() : kind === 'bullet' ? raw.slice(2).trim() : raw;
      const indent = kind === 'bullet' ? 12 : 0;
      const lines = D.wrapText(c, text, W - 72 - 20 - indent, kind === 'head' ? 15 : 13);
      blocks.push({ kind, lines, gap: gap || (kind === 'head' && blocks.length > 0), indent });
      gap = false;
    });
  });
  return blocks;
}

// 与首页设置面板一致：展开 600ms、收起 480ms
const OPEN_MS = 600;
const CLOSE_MS = 480;

function draw(c, scene) {
  const s = stateOf(scene);
  const now = Date.now();
  const dt = s.at ? Math.min(64, Math.max(0, now - s.at)) : 0;   // 首帧不推进，否则一步到满
  s.at = now;
  const target = scene.helpOpen ? 1 : 0;
  if (target > 0 && s.anim === 0) {
    s.scroll = 0;
    s.backdrop = undefined;   // 重新打开：重拍一张背景
  }
  // 注意：等于目标时不能再加减，否则会在 1 附近来回抖（按钮只在 anim>=1 时注册，会闪）
  if (s.anim < target) s.anim = Math.min(target, s.anim + dt / OPEN_MS);
  else if (s.anim > target) s.anim = Math.max(target, s.anim - dt / CLOSE_MS);
  if (s.anim <= 0) {
    s.backdrop = undefined;
    return;
  }
  s.open = target > 0;

  const T = theme.tokens;
  const x = 16;
  const w = W - 32;
  const h = Math.round(H * 0.5);
  const y = Math.round((H - h) / 2);

  // 以帮助 FAB 为圆心、半径 0 → 最远屏幕角的圆形裁剪。
  // 毛玻璃底也画在圆里 —— 圆外保持原始画面，圆形扩张才看得出来。
  const ease = s.anim < 0.5 ? 2 * s.anim * s.anim : 1 - Math.pow(-2 * s.anim + 2, 2) / 2;
  const center = fabCenter(scene);
  const maxR = Math.max(
    Math.hypot(center.x, center.y), Math.hypot(W - center.x, center.y),
    Math.hypot(center.x, H - center.y), Math.hypot(W - center.x, H - center.y),
  );
  c.save();
  c.beginPath();
  c.arc(center.x, center.y, Math.max(0.1, maxR * ease), 0, Math.PI * 2);
  c.clip();
  // 圆内先铺毛玻璃（下采样再放大 = 模糊），再盖上面板
  drawFrostedBackdrop(c, s);
  c.globalAlpha = Math.min(1, Math.max(0, (ease - 0.15) / 0.6));
  D.card(c, x, y, w, h, T);

  // 顶部问号 + 「帮助」作为一个整体居中。
  const title = t('helpTitle');
  const tw = D.measure(c, title, 16, 'bold');
  const groupW = 20 + 8 + tw;
  const gx = W / 2 - groupW / 2;
  D.text(c, '?', gx + 10, y + 28, { size: 22, weight: 'bold', color: T.primary, align: 'center' });
  D.text(c, title, gx + 28 + tw / 2, y + 28, { size: 16, weight: 'bold', color: T.text, align: 'center' });
  D.line(c, x + 20, y + 50, x + w - 20, y + 50, T.border, 1);

  const contentTop = y + 66;
  const contentBottom = y + h - 62;
  const viewH = contentBottom - contentTop;
  const blocks = helpBlocks(c, scene);
  const lineH = 20;
  const headGap = 10;
  let total = 6;
  blocks.forEach((b, i) => {
    total += (b.gap && i > 0 ? headGap : 0) + b.lines.length * lineH;
  });
  s.max = Math.max(0, total - viewH);
  s.scroll = Math.max(0, Math.min(s.max, s.scroll));

  c.save();
  D.roundRect(c, x + 1, contentTop, w - 2, viewH, 12);
  c.clip();
  let ly = contentTop + lineH / 2 - s.scroll;
  blocks.forEach((b, i) => {
    if (b.gap && i > 0) ly += headGap;
    b.lines.forEach((line, k) => {
      if (ly > contentTop - lineH && ly < contentBottom + lineH) {
        if (b.kind === 'head') {
          D.text(c, line, x + 20, ly, { size: 15, weight: 'bold', color: T.primary });
        } else if (b.kind === 'bullet') {
          if (k === 0) D.circle(c, x + 24, ly, 2, T.primary);
          D.text(c, line, x + 20 + b.indent, ly, { size: 13, color: T.text });
        } else {
          D.text(c, line, x + 20, ly, { size: 13, color: T.text });
        }
      }
      ly += lineH;
    });
  });
  c.restore();

  if (s.max > 0) {
    const railH = Math.max(22, viewH * viewH / Math.max(viewH, total));
    const railY = contentTop + (viewH - railH) * (s.scroll / s.max);
    D.fillRoundRect(c, x + w - 5, railY, 2, railH, 1, T.border);
  }

  const closeText = i18n.lang === 'cn' ? '好的，明白' : 'OK, Got it';
  const bw = Math.min(148, Math.max(104, D.measure(c, closeText, 13, 'bold') + 30));
  // 统一右对齐到面板内边距（20px）。
  const bx = x + w - 20 - bw;
  const by = y + h - 42;
  D.fillRoundRect(c, bx, by, bw, 30, 8, T.primary);
  D.text(c, closeText, bx + bw / 2, by + 15, { size: 13, weight: 'bold', color: '#fff', align: 'center' });

  // 关闭 ✕：画在帮助 FAB 那一格（和首页设置面板同款：圆形底 + 阴影 + 图标，随圆形淡入）
  const fr = fabRect(scene);
  const fcx = fr.x + fr.w / 2;
  const fcy = fr.y + fr.h / 2;
  const closeAlpha = Math.min(1, Math.max(0, (ease - 0.45) / 0.4));
  c.save();
  c.globalAlpha = closeAlpha;
  c.shadowColor = 'rgba(0,0,0,0.12)';
  c.shadowBlur = 10;
  c.shadowOffsetY = 2;
  D.circle(c, fcx, fcy, fr.w / 2, T.card);
  c.restore();
  c.save();
  c.globalAlpha = closeAlpha;
  if (!icons.draw(c, 'close', fcx, fcy, Math.round(fr.w * 0.42), T.text)) {
    D.text(c, '×', fcx, fcy, { size: Math.round(fr.w * 0.5), color: T.text, align: 'center' });
  }
  c.restore();
  c.restore();   // 结束圆形裁剪

  // 和设置面板一致：✕ 在展开过半后可点，其余按钮完全展开后才注册
  if (ease > 0.75) {
    scene.addButton('help-close', fr.x, fr.y, fr.w, fr.h, () => { scene.helpOpen = false; });
  }
  if (s.anim >= 1) {
    scene.addButton('help-mask', 0, 0, W, H, () => { scene.helpOpen = false; });
    scene.addButton('help-ok', bx, by, bw, 30, () => { scene.helpOpen = false; });
  }
}

function touch(scene, type, p) {
  if (!scene || !scene.helpOpen) return false;
  const s = stateOf(scene);
  if (type === 'start') {
    s.drag = p ? { y: p.y, scroll: s.scroll } : null;
    return true;
  }
  if (type === 'move' && s.drag && p) {
    s.scroll = Math.max(0, Math.min(s.max, s.drag.scroll - (p.y - s.drag.y)));
    return true;
  }
  if (type === 'end') {
    s.drag = null;
    return true;
  }
  return false;
}

function reset(scene) {
  const s = stateOf(scene);
  s.open = false;
  s.drag = null;
  s.anim = 0;
  s.at = 0;
}

module.exports = { draw, touch, reset, animating, fabCenter };
