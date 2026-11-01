// 三种牌面的共享 canvas 绘制：emoji / 扑克 / 麻将。
// 侦探、猎手、消除大帅共用，避免每个游戏各写一套牌背 / 牌面。
const theme = require('./theme');
const D = require('./draw');
const icons = require('./icons');
const tiles = require('./tiles');

const MODE_EMOJI = 1;
const MODE_POKER = 2;
const MODE_MAHJONG = 3;
const EMOJIS = [...new Set([
  '🍎', '🍌', '🍇', '🍉', '🥝', '🥭', '🫐', '🍒', '🍊', '🍓', '🍍', '🍑', '🍐', '🍋',
  '🍆', '🥕', '🥑', '🍅', '🍏', '🥒', '🥦', '🍈', '🥔', '🌶️', '🍄', '🫛',
  '🌺', '🌼', '🌸', '🌹', '🌷', '💐', '💮', '🥀', '🌱', '🌿', '🍃', '🌳', '🌻',
  '🍂', '🍀', '🌾', '🌵', '🪴', '🎴', '🌴', '🌲', '☘️', '🪷', '🍁', '🥠',
  '🚗', '🚙', '🚘', '🚓', '🚕', '🚌', '🏎️', '🚚', '🚛', '🛻', '🚑', '🚒', '🚔',
  '🏍️', '🚨', '🚖', '🚋', '🚃', '🛺', '🏁', '🚜', '🚐',
  '⚽', '🏀', '🏈', '⚾', '🎾', '🏐',
  '🛍️', '💰', '🤑', '🛒', '📦', '🛏️',
  '🎉', '🔥', '🎁', '🐉', '🏮', '🎊', '🧧', '🐲', '🧨',
  '🍜', '🥟', '🍚', '🍱', '🍵', '🥮', '🥗', '🍭', '🧁', '🍽️', '🍻',
  '🍕', '🍔', '🍣', '🌮', '🍪', '🍩', '🍝', '🍦', '🍗', '🥙',
  '🐶', '🐭', '🐹', '🐻', '🐼', '🐨', '🐯', '🦁', '🐸', '🐔',
  '🦤', '🦘', '🐒', '🦧', '🦔', '🦒', '🦌', '🐁',
  '🦆', '🐘', '🦄', '🐢', '🦮', '🦦', '🦓', '🐇', '🐬',
  '🪵', '🦜', '🐿️', '🎶', '🧸',
])];
const MAHJONG_FACES = [
  ...['m', 's', 'p'].flatMap(s => Array.from({ length: 9 }, (_, i) => `${s}${i + 1}`)),
  ...Array.from({ length: 7 }, (_, i) => `z${i + 1}`),
];
const CARD_TYPES = ['spade', 'club', 'heart', 'diamond'];
const POKER_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const POKER_SUITS = { spade: '♠', club: '♣', heart: '♥', diamond: '♦' };

function shuffle(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pokerPool() {
  const out = [];
  CARD_TYPES.forEach((type, ti) => {
    for (let n = 1; n <= 13; n++) out.push(`${'schd'[ti]}${n}`);
  });
  return out;
}
function pokerItem(key) {
  if (key && typeof key === 'object') return key;
  const s = String(key);
  const type = { s: 'spade', c: 'club', h: 'heart', d: 'diamond' }[s[0]] || 'spade';
  return { num: +s.slice(1) || 1, type };
}
function pokerKey(item) {
  if (typeof item === 'string') return item;
  const t = { spade: 's', club: 'c', heart: 'h', diamond: 'd' }[item.type] || 's';
  return `${t}${item.num}`;
}
function keyOf(item) {
  return typeof item === 'string' ? item : pokerKey(item);
}
function poolFor(mode) {
  if (mode === MODE_POKER) return pokerPool();
  if (mode === MODE_MAHJONG) return MAHJONG_FACES.slice();
  return EMOJIS.slice();
}
function ratio(mode) {
  return mode === MODE_POKER ? 1.5 : mode === MODE_MAHJONG ? tiles.TILE_RATIO : 1;
}

function drawBack(c, mode, x, y, w, h, backIcon, backFallback) {
  const T = theme.tokens;
  if (mode === MODE_POKER) {
    D.fillRoundRect(c, x, y, w, h, 8, '#fafafa');
    D.strokeRoundRect(c, x, y, w, h, 8, '#c9d0da', 1);
    c.save();
    if (c.setLineDash) {
      c.setLineDash([2, 2]);
      D.strokeRoundRect(c, x + 3, y + 3, w - 6, h - 6, 5, '#bbbbbb', 1);
      c.setLineDash([]);
    }
    c.restore();
    if (!icons.draw(c, 'mode-poker', x + w / 2, y + h / 2, Math.max(16, w * 0.60), '#777')) {
      D.text(c, '♠', x + w / 2, y + h / 2, { size: Math.max(14, w * 0.50), color: '#777', align: 'center' });
    }
    return;
  }
  if (mode === MODE_MAHJONG) {
    D.fillRoundRect(c, x, y, w, h, 8, '#1f7a4d');
    c.save();
    D.roundRect(c, x, y, w, h, 8);
    c.clip();
    c.strokeStyle = 'rgba(255,255,255,0.13)';
    c.lineWidth = 2;
    for (let i = -h; i < w + h; i += 10) {
      c.beginPath();
      c.moveTo(x + i, y);
      c.lineTo(x + i + h, y + h);
      c.stroke();
    }
    c.restore();
    D.strokeRoundRect(c, x + 4, y + 4, w - 8, h - 8, 6, 'rgba(255,255,255,0.24)', 1);
    return;
  }
  D.fillRoundRect(c, x, y, w, h, 8, T.primary);
  const iconKey = backIcon || 'bulb';
  if (!icons.draw(c, iconKey, x + w / 2, y + h / 2, Math.max(10, w * 0.42), '#ffffff')) {
    D.text(c, backFallback || '💡', x + w / 2, y + h / 2, {
      size: Math.max(10, w * 0.38), color: '#fff', align: 'center',
      family: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif',
    });
  }
}

function pokerRadius(w) {
  return Math.max(3, Math.min(8, w * 0.22));
}

function drawPoker(c, item, x, y, w, h) {
  const card = pokerItem(item);
  const joker = card.num === 14;
  const red = card.type === 'heart' || card.type === 'diamond';
  const color = red ? '#e00000' : '#111111';
  const radius = pokerRadius(w);
  D.fillRoundRect(c, x, y, w, h, radius, '#fafafa');
  D.strokeRoundRect(c, x, y, w, h, radius, '#c9d0da', 1);
  const pad = Math.max(2, w * 0.07);
  const jokerRs = Math.max(5, Math.round(w * 0.19));
  const rankRs = Math.max(7, Math.round(w * 0.30));
  if (joker) {
    // web 同款：左上 / 右下的竖排 JOKER + 中央牛仔帽；小王黑、大王红。
    const step = jokerRs * 0.94;
    c.save();
    c.fillStyle = color;
    c.font = `bold ${jokerRs}px "PingFang SC","Microsoft YaHei",sans-serif`;
    c.textAlign = 'left';
    c.textBaseline = 'top';
    for (let i = 0; i < 5; i++) {
      c.fillText('JOKER'[i], x + pad, y + pad + i * step);
    }
    c.translate(x + w - pad, y + h - pad);
    c.rotate(Math.PI);
    for (let i = 0; i < 5; i++) {
      c.fillText('JOKER'[i], 0, i * step);
    }
    c.restore();
    const iw = Math.max(12, w * 0.48);
    if (!icons.draw(c, 'cowboy', x + w / 2, y + h / 2, iw, color)) {
      // 字体未加载时的兜底：一顶牛仔帽（帽檐 + 帽冠）
      const cx = x + w / 2;
      const cy = y + h / 2;
      c.save();
      c.fillStyle = color;
      D.fillRoundRect(c, cx - iw / 2, cy + iw * 0.10, iw, iw * 0.20, iw * 0.08, color);
      D.fillRoundRect(c, cx - iw * 0.26, cy - iw * 0.30, iw * 0.52, iw * 0.42, iw * 0.10, color);
      c.restore();
    }
    return;
  }
  const corner = POKER_RANKS[card.num - 1];
  c.save();
  c.fillStyle = color;
  c.font = `bold ${rankRs}px "PingFang SC","Microsoft YaHei",sans-serif`;
  c.textAlign = 'left';
  c.textBaseline = 'top';
  c.fillText(corner, x + pad, y + pad);
  c.translate(x + w - pad, y + h - pad);
  c.rotate(Math.PI);
  c.fillText(corner, 0, 0);
  c.restore();
  D.text(c, POKER_SUITS[card.type], x + w / 2, y + h / 2, {
    size: Math.max(9, Math.round(w * 0.56)), color, align: 'center',
  });
}

function drawEmoji(c, item, cx, cy, size) {
  const family = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  c.save();
  c.font = `${size}px ${family}`;
  c.fillStyle = '#222';
  c.textAlign = 'center';
  const m = c.measureText(String(item));
  // 用真实墨迹框把 emoji 垂直居中；没有 actualBoundingBox 的端退回 middle 基线。
  // 真机上 emoji 墨迹本身略偏下；0.30em 补偿会过度，这里收到 0.18em。
  const optical = size * 0.18;
  let y = cy + optical;
  if (Number.isFinite(m.actualBoundingBoxAscent) && Number.isFinite(m.actualBoundingBoxDescent)
    && (m.actualBoundingBoxAscent > 0 || m.actualBoundingBoxDescent > 0)) {
    c.textBaseline = 'alphabetic';
    y = cy + optical + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  } else {
    c.textBaseline = 'middle';
  }
  c.fillText(String(item), cx, y);
  c.restore();
}

function mahjongRadius(w) {
  return Math.max(3, Math.min(8, w * 0.18));
}

function drawMahjong(c, item, x, y, w, h) {
  const key = typeof item === 'string' ? item : `${item.suit}${item.value}`;
  // 雪碧图本身没有透明圆角，直接 drawImage 会带出方形底角。
  // 先按统一 8px 圆角裁切，再直接画牌面；不再额外套米色底和 1px 边框。
  const radius = mahjongRadius(w);
  c.save();
  D.roundRect(c, x, y, w, h, radius);
  c.clip();
  const drawn = tiles.drawFace(c, key, x, y, w, h);
  c.restore();
  if (drawn) return;
  D.fillRoundRect(c, x, y, w, h, radius, '#f7f4ee');
  D.strokeRoundRect(c, x, y, w, h, radius, theme.tokens.tileBorder, 1);
  D.text(c, String(key).toUpperCase(), x + w / 2, y + h / 2, {
    size: Math.max(8, w * 0.3), weight: 'bold', color: '#1f7a4d', align: 'center',
  });
}

function draw(c, item, mode, x, y, w, h, faceUp, backIcon, backFallback) {
  const T = theme.tokens;
  if (!faceUp) {
    drawBack(c, mode, x, y, w, h, backIcon, backFallback);
    return;
  }
  if (mode === MODE_POKER) {
    drawPoker(c, item, x, y, w, h);
  } else if (mode === MODE_MAHJONG) {
    drawMahjong(c, item, x, y, w, h);
  } else {
    D.fillRoundRect(c, x, y, w, h, 8, '#fffdf7');
    D.strokeRoundRect(c, x, y, w, h, 8, T.tileBorder, 1);
    drawEmoji(c, item, x + w / 2, y + h / 2, Math.max(10, Math.round(w * 0.42)));
  }
}

module.exports = {
  MODE_EMOJI, MODE_POKER, MODE_MAHJONG,
  EMOJIS, MAHJONG_FACES, CARD_TYPES, POKER_RANKS, POKER_SUITS,
  shuffle, poolFor, ratio, keyOf, pokerItem, pokerKey,
  draw, drawBack, drawEmoji, pokerRadius, mahjongRadius };
