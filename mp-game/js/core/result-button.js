// 统一结算按钮：重玩本关 = 橙色描边 + undo 图标；下一关 = 主色实心 + arrow-right。
// 宽度按文案实际测量，固定 padding，不再写死 100/110。
const theme = require('./theme');
const D = require('./draw');
const icons = require('./icons');

const H = 32;
const PAD_X = 14;
const ICON = 14;
const GAP = 6;
const SIZE = 13;
const FONT_WEIGHT = 'bold';

function cleanLabel(label) {
  return String(label == null ? '' : label)
    .replace(/^[\s🔄➡↻↺▶🎮↪👍🔁⏭⏩]+/u, '')
    .replace(/\uFE0F/g, '')
    .trim();
}

function kindOf(kind) {
  return kind === 'next' || kind === 'new' || kind === 'continue' ? kind : 'replay';
}

function width(c, label) {
  const text = cleanLabel(label);
  return Math.ceil(PAD_X * 2 + ICON + GAP + D.measure(c, text, SIZE, FONT_WEIGHT));
}

function draw(c, scene, label, kind, x, y, opts) {
  const o = opts || {};
  const k = kindOf(kind);
  const T = theme.tokens;
  const text = cleanLabel(label);
  const w = o.width || width(c, label);
  const h = o.h || H;
  const primary = k !== 'replay';
  const iconKey = k === 'new' ? 'gamepad' : k === 'continue' ? 'play' : primary ? 'arrow-right' : 'undo';
  if (primary) {
    D.fillRoundRect(c, x, y, w, h, 8, T.primary);
  } else {
    D.strokeRoundRect(c, x, y, w, h, 8, T.god, 1);
  }
  const fg = primary ? '#ffffff' : T.god;
  const iconSize = Math.min(ICON, h - 10);
  const textW = D.measure(c, text, SIZE, FONT_WEIGHT);
  const groupW = iconSize + GAP + textW;
  const gx = x + (w - groupW) / 2;
  const cy = y + h / 2;
  if (!icons.draw(c, iconKey, gx + iconSize / 2, cy, iconSize, fg)) {
    D.text(c, primary ? (k === 'new' ? '▣' : k === 'continue' ? '▶' : '→') : '↺', gx + iconSize / 2, cy, {
      size: iconSize, weight: 'bold', color: fg, align: 'center',
    });
  }
  D.text(c, text, gx + iconSize + GAP, cy, {
    size: SIZE, weight: FONT_WEIGHT, color: fg,
  });
  if (scene && typeof scene.addButton === 'function') {
    scene.addButton(o.id || ('result-' + k), x, y, w, h, o.onTap || (() => {}));
  }
  return { x, y, w, h, id: o.id || ('result-' + k) };
}

module.exports = { H, PAD_X, ICON, GAP, SIZE, cleanLabel, width, draw };
