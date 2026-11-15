// 操作按钮里的「图标 + 文案」统一渲染：不再靠 emoji 当前缀。
const D = require('./draw');
const icons = require('./icons');

const EMOJI = /^[\s🎮⏸▶⚡🔍🔄➡↻↺👍🔁⏭⏩]+/u;
const PAD_X = 12;

function clean(label) {
  return String(label == null ? '' : label).replace(EMOJI, '').replace(/\uFE0F/g, '').trim();
}

function groupWidth(c, label, iconSize, gap, size, weight) {
  return iconSize + gap + D.measure(c, clean(label), size || 13, weight || 'bold');
}

function width(c, label, opts) {
  const o = opts || {};
  const iconSize = o.iconSize || 14;
  const gap = o.gap == null ? 5 : o.gap;
  return groupWidth(c, label, iconSize, gap, o.size || 13, o.weight || 'bold') + PAD_X * 2;
}

// 以 cx 为中心画 icon + text；返回整组宽度，方便调用方按需布局。
function draw(c, iconKey, label, cx, cy, opts) {
  const o = opts || {};
  const size = o.size || 13;
  const weight = o.weight || 'bold';
  const color = o.color || '#ffffff';
  const iconSize = o.iconSize || 14;
  const gap = o.gap == null ? 5 : o.gap;
  const text = clean(label);
  const tw = D.measure(c, text, size, weight);
  const total = iconSize + gap + tw;
  const left = cx - total / 2;
  if (iconKey) {
    if (!icons.draw(c, iconKey, left + iconSize / 2, cy, iconSize, color)) {
      D.text(c, o.fallback || '', left + iconSize / 2, cy, {
        size: iconSize, weight, color, align: 'center',
      });
    }
  }
  D.text(c, text, left + iconSize + gap, cy, {
    size, weight, color, align: 'left',
  });
  return total;
}

module.exports = { PAD_X, EMOJI, clean, groupWidth, width, draw };
