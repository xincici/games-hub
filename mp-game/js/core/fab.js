// 右下角圆形 FAB（帮助 / 模式 / 静音）的统一绘制。
// 之前每个场景各写一份「阴影 + 圆 + 图标 + 兜底文字 + addButton」，静音 FAB 又要加到 25 个场景里，
// 复制 25 遍必然走样，所以收敛到这里。
const theme = require('./theme');
const D = require('./draw');
const icons = require('./icons');
const audio = require('./audio');

const GAP = 8;            // 相邻 FAB 之间的间距
const MUTE_ID = 'fab-mute';
const SHARE_ID = 'fab-share';
// 所有 FAB 统一这一个尺寸（首页的设置/成就/每日挑战 + 游戏内的帮助/静音/模式/分享）
const SIZE = 44;
// 「炫耀一下」的胭脂红（和 share.js 的 ROSE 同值，这里不 require 它，避免循环依赖）
const ROSE = '#962832';

// 边框颜色：帮助=橙、静音=绿、模式/开关=蓝、分享=胭脂红。
// 边框在**画按钮的同时**描上去（不再由 App 事后补一圈）。
function borderOf(kind) {
  const T = theme.tokens;
  if (kind === 'help') return T.god;
  if (kind === 'mute') return T.primary;
  if (kind === 'mode') return theme.dark ? '#38bdf8' : '#0ea5e9';
  if (kind === 'share') return ROSE;
  return null;
}

function kindOfId(id) {
  const s2 = String(id || '');
  if (s2 === 'help' || s2 === 'fab-help' || s2 === 'help-fab') return 'help';
  if (s2 === MUTE_ID) return 'mute';
  if (s2 === SHARE_ID) return 'share';
  if (s2 === 'mode' || /^fab-mode/.test(s2)) return 'mode';
  return null;
}

// 画一个圆形 FAB：底色 + **边框** + 图标，一次画完。rect = { x, y, w, h }
function draw(scene, c, rect, opts) {
  const T = theme.tokens;
  const o = opts || {};
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const r = rect.w / 2;
  const color = o.color || T.primary;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.12)';
  c.shadowBlur = 10;
  c.shadowOffsetY = 2;
  D.circle(c, cx, cy, r, T.card);
  c.restore();
  // 边框贴着按钮边缘（线宽 2 → 覆盖 r-2..r），看起来是按钮自己的边，不是外加的一圈
  const border = o.border || borderOf(o.kind || kindOfId(o.id));
  if (border) {
    c.save();
    c.strokeStyle = border;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(cx, cy, r - 1, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }
  const iconSize = o.iconSize || Math.round(rect.w * 0.52);
  // icon: false → 由调用方自己画图标（例如分享按钮要画向量图标）
  if (o.icon !== false && (!o.icon || !icons.draw(c, o.icon, cx, cy, iconSize, color))) {
    D.text(c, o.fallback || '?', cx, cy, {
      size: o.fallbackSize || Math.round(rect.w * 0.48), weight: 'bold', color, align: 'center',
    });
  }
  if (o.id && o.onTap) scene.addButton(o.id, rect.x, rect.y, rect.w, rect.h, o.onTap);
}

// 给「自己画圆」的 FAB 描边（和 draw() 里的边框完全一致：贴着边缘、线宽 2）。
// kind: 'help' / 'mute' / 'mode' / 'share'，也可以直接传颜色。
function stroke(c, cx, cy, r, kindOrColor) {
  const color = kindOrColor && kindOrColor.indexOf('#') === 0 ? kindOrColor : borderOf(kindOrColor);
  if (!color) return;
  c.save();
  c.strokeStyle = color;
  c.lineWidth = 2;
  c.beginPath();
  c.arc(cx, cy, r - 1, 0, Math.PI * 2);
  c.stroke();
  c.restore();
}

// 「帮助 FAB 左边一格」——静音 FAB 的统一位置
function leftSlot(helpRect, gap) {
  return {
    x: helpRect.x - helpRect.w - (gap == null ? GAP : gap),
    y: helpRect.y,
    w: helpRect.w,
    h: helpRect.h,
  };
}

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

// 「帮助左边第 index 格」的矩形（index 从 1 开始，1 = 紧挨帮助）
function slotLeft(helpRect, index, gap) {
  const g = gap == null ? GAP : gap;
  return {
    x: helpRect.x - index * (helpRect.w + g),
    y: helpRect.y,
    w: helpRect.w,
    h: helpRect.h,
  };
}

// 静音 FAB 的槽位：全局音效开着时占「帮助左边第一格」，关闭时返回 null —— **不占位**，
// 让原本在它左边的模式 / 机器人 / 骰子等按钮整体右移一格顶上，中间不留空。
function muteSlot(helpRect) {
  return audio.globalOn() ? leftSlot(helpRect) : null;
}

// 静音 FAB：**全局音效关闭时不展示**（产品要求），开启时每局可独立静音。
// 声音本身由 core/audio 统一拦截，这里只负责画 + 点击切换。
//
// 窄屏兜底：这个位置若已经被别的可点区域占住（320 宽时 24 点的操作键会铺到右下角），
// 就不再画静音 FAB —— 宁可少一个开关，也不能让操作键点不到。375 及以上不会触发。
function drawMute(scene, c, rect, opts) {
  if (!audio.globalOn()) return false;
  if (scene.buttons.some((b) => b.id !== MUTE_ID && overlaps(b, rect))) return false;
  const o = opts || {};
  const muted = audio.muted();
  const T = theme.tokens;
  draw(scene, c, rect, {
    id: MUTE_ID,
    icon: muted ? 'volume-off' : 'volume',
    fallback: muted ? '×' : '♪',
    color: muted ? T.muted : T.primary,
    iconSize: o.iconSize,
    onTap: () => audio.toggleMute(),
  });
  return true;
}

module.exports = {
  GAP, SIZE, MUTE_ID, SHARE_ID, ROSE,
  draw, drawMute, stroke, leftSlot, slotLeft, muteSlot, overlaps, borderOf, kindOfId,
};
