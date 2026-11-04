// 右下角圆形 FAB（帮助 / 模式 / 静音）的统一绘制。
// 之前每个场景各写一份「阴影 + 圆 + 图标 + 兜底文字 + addButton」，静音 FAB 又要加到 25 个场景里，
// 复制 25 遍必然走样，所以收敛到这里。
const theme = require('./theme');
const D = require('./draw');
const icons = require('./icons');
const audio = require('./audio');

const GAP = 8;            // 相邻 FAB 之间的间距
const MUTE_ID = 'fab-mute';

// 画一个圆形 FAB。rect = { x, y, w, h }（命中区与视觉同尺寸，必要时调用方自己外扩）
function draw(scene, c, rect, opts) {
  const T = theme.tokens;
  const o = opts || {};
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const color = o.color || T.primary;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.12)';
  c.shadowBlur = 10;
  c.shadowOffsetY = 2;
  D.circle(c, cx, cy, rect.w / 2, T.card);
  c.restore();
  const iconSize = o.iconSize || Math.round(rect.w * 0.52);
  if (!o.icon || !icons.draw(c, o.icon, cx, cy, iconSize, color)) {
    D.text(c, o.fallback || '?', cx, cy, {
      size: o.fallbackSize || Math.round(rect.w * 0.48), weight: 'bold', color, align: 'center',
    });
  }
  if (o.id && o.onTap) scene.addButton(o.id, rect.x, rect.y, rect.w, rect.h, o.onTap);
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

module.exports = { GAP, MUTE_ID, draw, drawMute, leftSlot, slotLeft, muteSlot, overlaps };
