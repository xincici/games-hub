// Canvas 2D 绘制小工具：圆角卡片、居中文本、按钮、颜色混合、文字换行。
const { ctx } = require('./canvas');

function roundRect(c, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + radius, y);
  c.arcTo(x + w, y, x + w, y + h, radius);
  c.arcTo(x + w, y + h, x, y + h, radius);
  c.arcTo(x, y + h, x, y, radius);
  c.arcTo(x, y, x + w, y, radius);
  c.closePath();
}

function fillRoundRect(c, x, y, w, h, r, fill) {
  roundRect(c, x, y, w, h, r);
  c.fillStyle = fill;
  c.fill();
}

function strokeRoundRect(c, x, y, w, h, r, stroke, width) {
  roundRect(c, x, y, w, h, r);
  c.strokeStyle = stroke;
  c.lineWidth = width || 1;
  c.stroke();
}

function font(size, weight, family) {
  return `${weight || 'normal'} ${size}px ${family || '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif'}`;
}

function text(c, value, x, y, opts) {
  const o = opts || {};
  c.save();
  c.font = font(o.size || 14, o.weight || 'normal', o.family);
  c.fillStyle = o.color || '#2c3e50';
  c.textAlign = o.align || 'left';
  c.textBaseline = o.baseline || 'middle';
  c.fillText(String(value), x, y);
  c.restore();
}

// 游戏区下方的一句玩法提示：10px、弱色、水平居中 —— 2048 / Threes / 消除大师 / 贪吃蛇 / Emoji 下坠共用。
function hintLine(c, value, y, color) {
  if (!value) return;
  text(c, value, require('./canvas').W / 2, y, { size: 10, color: color || '#5f6b7a', align: 'center' });
}

function measure(c, value, size, weight, family) {
  c.save();
  c.font = font(size, weight, family);
  const w = c.measureText(String(value)).width;
  c.restore();
  return w;
}

// 统计卡底部的进度条：必须裁到卡片圆角里，否则两端会戳出圆角。
function progressBar(c, x, y, w, h, progress, track, fill, radius) {
  c.save();
  roundRect(c, x, y, w, h, radius == null ? 14 : radius);
  c.clip();
  c.fillStyle = track;
  c.fillRect(x, y + h - 3, w, 3);
  c.fillStyle = fill;
  c.fillRect(x, y + h - 3, w * Math.max(0, Math.min(1, progress)), 3);
  c.restore();
}

function card(c, x, y, w, h, tokens, radius) {
  c.save();
  c.shadowColor = tokens.cardShadow;
  c.shadowBlur = 12;
  c.shadowOffsetY = 2;
  fillRoundRect(c, x, y, w, h, radius || 14, tokens.card);
  c.restore();
}

function circle(c, x, y, r, fill) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
}

function divider(c, x, cy, h, color, width) {
  line(c, x, cy - h / 2, x, cy + h / 2, color, width == null ? 1 : width);
}

function line(c, x1, y1, x2, y2, color, width) {
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.strokeStyle = color;
  c.lineWidth = width || 1;
  c.stroke();
}

function rgba(arr) {
  return `rgba(${Math.round(arr[0])},${Math.round(arr[1])},${Math.round(arr[2])},${arr[3]})`;
}

function mix(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    a[3] + (b[3] - a[3]) * t,
  ];
}

function hit(rect, x, y) {
  return x >= rect.x && y >= rect.y && x <= rect.x + rect.w && y <= rect.y + rect.h;
}

function wrapText(c, value, maxWidth, size, weight) {
  c.save();
  c.font = font(size, weight);
  const paragraphs = String(value).split('\n');
  const lines = [];
  paragraphs.forEach((para) => {
    if (!para) { lines.push(''); return; }
    let line = '';
    for (let i = 0; i < para.length; i++) {
      const next = line + para[i];
      if (c.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = para[i];
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
  });
  c.restore();
  return lines;
}

// 结算数字滚动：从 0 滚到最终值（at = 结算出现时刻，dur 毫秒）
// 各游戏结算遮罩用 resultVisible() 的 _resultGateAt 当起点即可，一行接入。
function countUp(value, at, dur) {
  const v = Number(value) || 0;
  if (!at || !(dur > 0)) return v;
  const t = Math.min(1, Math.max(0, (Date.now() - at) / dur));
  const e = 1 - Math.pow(1 - t, 2.2);
  return Math.round(v * e);
}

module.exports = {
  countUp,
  hintLine,
  divider,
  progressBar,
  ctx,
  roundRect,
  fillRoundRect,
  strokeRoundRect,
  font,
  text,
  measure,
  card,
  circle,
  line,
  rgba,
  mix,
  hit,
  wrapText,
};
