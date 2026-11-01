const D = require('./draw');
const icons = require('./icons');

// 计时显示统一入口：
// - kind='stopwatch'：正计时（秒表）
// - kind='hourglass'：倒计时（沙漏）
// 图标和数字作为一个整体居中，避免各游戏各写一套 emoji。
function drawTimer(c, kind, cx, cy, text, opts = {}) {
  const size = opts.size || 15;
  const color = opts.color || '#2c3e50';
  const bold = opts.weight || 'bold';
  const iconSize = opts.iconSize || Math.max(12, size + 1);
  const gap = opts.gap == null ? 4 : opts.gap;
  const tw = D.measure(c, text, size, bold);
  const total = iconSize + gap + tw;
  const start = cx - total / 2;
  const fallback = kind === 'hourglass' ? '⌛' : '⏱';
  if (!icons.draw(c, kind, start + iconSize / 2, cy, iconSize, color)) {
    D.text(c, fallback, start + iconSize / 2, cy, { size: iconSize, color, align: 'center' });
  }
  D.text(c, text, start + iconSize + gap + tw / 2, cy, { size, weight: bold, color, align: 'center' });
}

module.exports = { drawTimer };
