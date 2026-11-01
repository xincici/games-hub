// 统一帮助弹窗：固定半屏高、顶部问号+标题居中、内容可滚动。
const { W, H } = require('./canvas');
const theme = require('./theme');
const D = require('./draw');
const i18n = require('./i18n');

const { t } = i18n;
const states = new WeakMap();

function stateOf(scene) {
  let s = states.get(scene);
  if (!s) {
    s = { scroll: 0, max: 0, drag: null, open: false };
    states.set(scene, s);
  }
  return s;
}

function helpText(c, scene) {
  const id = scene && scene.app && scene.app.sceneId;
  if (!id) return [];
  const keys = ['helpMsg'];
  for (let i = 1; i <= 20; i++) keys.push(`help${i}`);
  const lines = [];
  keys.forEach((key) => {
    const value = t(`${id}.${key}`);
    if (value === `${id}.${key}`) return;
    String(value).split('\n').forEach((line) => {
      const text = line.trim();
      if (text) lines.push(...D.wrapText(c, text, W - 72, 13));
    });
  });
  return lines;
}

function draw(c, scene) {
  const s = stateOf(scene);
  if (!s.open) {
    s.open = true;
    s.scroll = 0;
  }
  const T = theme.tokens;
  const x = 16;
  const w = W - 32;
  const h = Math.round(H * 0.5);
  const y = Math.round((H - h) / 2);
  c.fillStyle = 'rgba(0,0,0,0.48)';
  c.fillRect(0, 0, W, H);
  D.card(c, x, y, w, h, T);

  // 顶部问号 + 「帮助」作为一个整体居中。
  const title = t('help');
  const tw = D.measure(c, title, 16, 'bold');
  const groupW = 20 + 8 + tw;
  const gx = W / 2 - groupW / 2;
  D.text(c, '?', gx + 10, y + 28, { size: 22, weight: 'bold', color: T.primary, align: 'center' });
  D.text(c, title, gx + 28 + tw / 2, y + 28, { size: 16, weight: 'bold', color: T.text, align: 'center' });
  D.line(c, x + 20, y + 50, x + w - 20, y + 50, T.border, 1);

  const contentTop = y + 66;
  const contentBottom = y + h - 62;
  const viewH = contentBottom - contentTop;
  const lines = helpText(c, scene);
  const lineH = 19;
  const total = lines.length * lineH;
  s.max = Math.max(0, total - viewH);
  s.scroll = Math.max(0, Math.min(s.max, s.scroll));

  c.save();
  D.roundRect(c, x + 1, contentTop, w - 2, viewH, 12);
  c.clip();
  let ly = contentTop + lineH / 2 - s.scroll;
  lines.forEach((line) => {
    if (ly > contentTop - lineH && ly < contentBottom + lineH) {
      D.text(c, line, x + 20, ly, { size: 13, color: T.text });
    }
    ly += lineH;
  });
  c.restore();

  if (s.max > 0) {
    const railH = Math.max(22, viewH * viewH / Math.max(viewH, total));
    const railY = contentTop + (viewH - railH) * (s.scroll / s.max);
    D.fillRoundRect(c, x + w - 5, railY, 2, railH, 1, T.border);
  }

  scene.addButton('help-mask', 0, 0, W, H, () => { scene.helpOpen = false; });
  const closeText = (() => {
    const id = scene && scene.app && scene.app.sceneId;
    const key = id ? t(`${id}.confirmText`) : '';
    if (key && key !== `${id}.confirmText`) return key;
    return i18n.lang === 'cn' ? '知道了' : 'OK';
  })();
  const bw = Math.min(140, Math.max(96, D.measure(c, closeText, 13, 'bold') + 28));
  const bx = W / 2 - bw / 2;
  const by = y + h - 42;
  D.fillRoundRect(c, bx, by, bw, 30, 8, T.primary);
  D.text(c, closeText, bx + bw / 2, by + 15, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
  scene.addButton('help-ok', bx, by, bw, 30, () => { scene.helpOpen = false; });
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
}

module.exports = { draw, touch, reset };
