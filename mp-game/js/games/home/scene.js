const { W, H, SAFE_TOP, SAFE_BOTTOM } = require('../../core/canvas');
const { Scene } = require('../../core/app');
const theme = require('../../core/theme');
const i18n = require('../../core/i18n');
const { t } = i18n;
const { getRaw, setRaw } = require('../../core/storage');
const audio = require('../../core/audio');
const icons = require('../../core/icons');
const D = require('../../core/draw');
const ParticleField = require('../../core/particles');
const homeI18n = require('./i18n');
const tiles = require('../../core/tiles');

const ORDER_KEY = '__games_hub__home_order';
const ROW_SIZES = [4, 3, 4, 3, 4, 3, 4];
let homeIntroPlayed = false;
function entryHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const DEFAULT_ORDER = [
  'click', 'match', 'point24', 'guess',
  'detective', 'hunter', 'master',
  'g2048', 'three', 'snake', 'link',
  'puzzle', 'mirror', 'down',
  'crush', 'sudoku', 'sort', 'slide',
  'poker', 'mahjong', 'solo',
  'alchemy', 'quesheng', 'legend', 'gambler',
];

const coreI18n = require('../../core/i18n');
if (!coreI18n.__homeRegistered) {
  coreI18n.register('home', homeI18n);
  coreI18n.__homeRegistered = true;
}

function hexPath(c, cx, cy, r) {
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 3;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.closePath();
}

class HomeScene extends Scene {
  constructor(app) {
    super(app);
    this.bg = new ParticleField();
    tiles.preload();
    this.settingsOpen = false;
    this.settingsAnim = 0;
    this.order = this.loadOrder();
    this.drag = null;
    this.press = null;
    this.pressTimer = null;
    this.suppressOpen = false;
    this.now = Date.now();
    // 与小程序一致：首次进入首页播一次逐格跳动，返回首页不重播。
    this.enterStart = homeIntroPlayed ? 0 : Date.now();
    homeIntroPlayed = true;
    this.layout();
  }

  loadOrder() {
    let saved = [];
    try {
      const raw = getRaw(ORDER_KEY, '');
      const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(arr)) saved = arr.filter(id => typeof id === 'string');
    } catch (e) { saved = []; }
    const out = [];
    saved.forEach((id) => { if (DEFAULT_ORDER.includes(id) && !out.includes(id)) out.push(id); });
    DEFAULT_ORDER.forEach((id) => { if (!out.includes(id)) out.push(id); });
    return out;
  }

  saveOrder() {
    setRaw(ORDER_KEY, JSON.stringify(this.order));
  }

  layout() {
    this.titleY = SAFE_TOP + 32;
    this.gearRect = { x: W - 16 - 48, y: H - SAFE_BOTTOM - 16 - 48, w: 48, h: 48 };
    const gap = Math.max(2, W * 0.008);
    const avail = W - 32;
    const hexW = (avail - gap * 3) / 4;
    // 小程序蜂窝用 -40rpx 的负 margin 让两行咬合；折算到当前屏宽，
    // 让斜边间的视觉缝隙与水平 gap 一致，而不是把两行完全分开。
    const overlap = W * 40 / 750;
    const rows = [];
    let oi = 0;
    ROW_SIZES.forEach((size) => {
      const ids = this.order.slice(oi, oi + size);
      if (ids.length) rows.push(ids);
      oi += size;
    });
    if (oi < this.order.length) rows.push(this.order.slice(oi));
    // 25 格七行：水平宽度和「标题下沿 → 齿轮上沿」的竖向预算同时约束六边形半径。
    const topLimit = this.titleY + 42;
    const verticalRoom = Math.max(300, this.gearRect.y - 16 - topLimit);
    const maxByHeight = (verticalRoom + (rows.length - 1) * overlap) / (2 * rows.length);
    this.hexR = Math.min(52, hexW / 1.732, maxByHeight);
    this.hexCy = Math.min(H * 0.51, H - 190);
    const step = this.hexR * 2 - overlap;
    const names = {
      click: ['home.clickTitle', 'click'], match: ['home.matchTitle', 'match'],
      point24: ['home.point24Title', 'point24'], guess: ['home.guessTitle', 'guess'],
      detective: ['home.detectiveTitle', 'detective'], hunter: ['home.hunterTitle', 'hunter'],
      master: ['home.masterTitle', 'master'],
      g2048: ['home.g2048Title', 'g2048'], three: ['home.threeTitle', 'three'],
      snake: ['home.snakeTitle', 'snake'], link: ['home.linkTitle', 'link'],
      puzzle: ['home.puzzleTitle', 'puzzle'], mirror: ['home.mirrorTitle', 'mirror'], down: ['home.downTitle', 'down'],
      crush: ['home.crushTitle', 'crush'], sudoku: ['home.sudokuTitle', 'sudoku'],
      sort: ['home.sortTitle', 'sort'], slide: ['home.slideTitle', 'slide'],
      poker: ['home.pokerTitle', 'poker'], mahjong: ['home.mahjongTitle', 'mahjong'],
      solo: ['home.soloTitle', 'solo'],
      alchemy: ['home.alchemyTitle', 'alchemy'], quesheng: ['home.queshengTitle', 'quesheng'],
      legend: ['home.legendTitle', 'legend'], gambler: ['home.gamblerTitle', 'gambler'],
    };
    const accents = {
      click: 'logic', match: 'memory', point24: 'number', guess: 'number',
      detective: 'memory', hunter: 'memory', master: 'memory',
      g2048: 'number', three: 'number', snake: 'action', link: 'logic',
      puzzle: 'logic', mirror: 'memory', down: 'action',
      crush: 'memory', sudoku: 'number', sort: 'logic', slide: 'action',
      poker: 'card', mahjong: 'card', solo: 'card',
      alchemy: 'card', quesheng: 'card', legend: 'card', gambler: 'card',
    };
    this.hexes = [];
    const top = this.hexCy - (rows.length - 1) * step / 2;
    rows.forEach((ids, ri) => {
      const total = ids.length * hexW + (ids.length - 1) * gap;
      const start = (W - total) / 2 + hexW / 2;
      ids.forEach((id, i) => {
        this.hexes.push({ id, cx: start + i * (hexW + gap), cy: top + ri * step, title: t(names[id][0]), kind: names[id][1], accent: accents[id] || 'logic' });
      });
    });
  }

  update(dt) {
    this.now = Date.now();
    this.bg.update(dt);
    const step = Math.min(50, dt || 16);
    if (this.settingsOpen) this.settingsAnim = Math.min(1, this.settingsAnim + step / 280);
    else if (this.settingsAnim > 0) this.settingsAnim = Math.max(0, this.settingsAnim - step / 220);
  }

  render(c) {
    const T = theme.tokens;
    c.fillStyle = T.bg;
    c.fillRect(0, 0, W, H);
    this.bg.draw(c, theme.dark);

    this.hexes.forEach((item) => {
      if (this.drag && this.drag.id === item.id) return;
      this.drawHex(c, item, item.cx, item.cy, false);
    });
    if (this.drag) {
      const item = this.hexes.find(h => h.id === this.drag.id);
      if (item) this.drawHex(c, item, this.drag.x, this.drag.y, true);
    }
    if (this.settingsAnim > 0) this.drawSettings(c);
    else if (!this.settingsOpen) this.drawSettingsButton(c);
  }

  // ---------- 长按拖动排序 ----------
  hexAt(x, y) {
    const w = this.hexR * 1.55;
    const h = this.hexR * 1.8;
    for (let i = this.hexes.length - 1; i >= 0; i--) {
      const item = this.hexes[i];
      if (Math.abs(x - item.cx) <= w / 2 && Math.abs(y - item.cy) <= h / 2) return item;
    }
    return null;
  }

  startDrag() {
    if (!this.press) return;
    this.drag = { id: this.press.id, x: this.press.x, y: this.press.y };
    this.suppressOpen = true;
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
  }

  onTouchStart(p) {
    if (!p || this.settingsOpen) return;
    const item = this.hexAt(p.x, p.y);
    if (!item) return;
    this.suppressOpen = false;
    this.press = { id: item.id, x: p.x, y: p.y };
    if (this.pressTimer) clearTimeout(this.pressTimer);
    this.pressTimer = setTimeout(() => { this.pressTimer = null; this.startDrag(); }, 260);
  }

  onTouchMove(p) {
    if (!p) return;
    if (!this.drag) {
      if (this.press) {
        const dx = p.x - this.press.x;
        const dy = p.y - this.press.y;
        if (dx * dx + dy * dy > 144) {
          if (this.pressTimer) clearTimeout(this.pressTimer);
          this.pressTimer = null;
          this.press = null;
        }
      }
      return;
    }
    this.drag.x = p.x;
    this.drag.y = p.y;
    const target = this.hexAt(p.x, p.y);
    if (!target || target.id === this.drag.id) return;
    const from = this.order.indexOf(this.drag.id);
    const to = this.order.indexOf(target.id);
    if (from < 0 || to < 0) return;
    const arr = this.order.slice();
    [arr[from], arr[to]] = [arr[to], arr[from]];
    this.order = arr;
    this.saveOrder();
    this.layout();
  }

  onTouchEnd() {
    if (this.pressTimer) clearTimeout(this.pressTimer);
    this.pressTimer = null;
    this.press = null;
    if (this.drag) {
      this.drag = null;
      this.saveOrder();
      setTimeout(() => { this.suppressOpen = false; }, 400);
    }
  }

  onTouchCancel() {
    if (this.pressTimer) clearTimeout(this.pressTimer);
    this.pressTimer = null;
    this.press = null;
    this.drag = null;
  }

  onHide() {
    if (this.pressTimer) clearTimeout(this.pressTimer);
    this.pressTimer = null;
    this.press = null;
    this.drag = null;
  }

  entryAnim(id) {
    if (!this.enterStart) return null;
    const elapsed = this.now - this.enterStart;
    const h = entryHash(id);
    const delay = 350 + (h % 400);
    const dur = 520 + (h % 160);
    const p = (elapsed - delay) / dur;
    if (p <= 0) return { scale: 0.82, alpha: 0, skip: true };
    if (p >= 1) return null;
    let scale;
    let alpha = 1;
    if (p < 0.55) {
      const t = p / 0.55;
      const e = 1 - Math.pow(1 - t, 2);
      scale = 0.82 + 0.27 * e;
      alpha = t;
    } else if (p < 0.78) {
      const t = (p - 0.55) / 0.23;
      scale = 1.09 - 0.12 * t;
    } else {
      const t = (p - 0.78) / 0.22;
      scale = 0.97 + 0.03 * t;
    }
    return { scale, alpha };
  }

  drawHex(c, item, cx, cy, ghost) {
    const T = theme.tokens;
    const anim = ghost ? null : this.entryAnim(item.id);
    if (anim && anim.skip) {
      // 小程序入场延迟期间虽然透明，卡片仍然可点；按钮也照常存在。
      const bw = this.hexR * 1.55;
      const bh = this.hexR * 1.8;
      this.addButton(item.id + '-game', cx - bw / 2, cy - bh / 2, bw, bh, () => {
        if (this.suppressOpen) { this.suppressOpen = false; return; }
        this.app.openGame(item.id, { x: cx, y: cy });
      });
      return;
    }
    c.save();
    if (anim) {
      c.globalAlpha = anim.alpha;
      c.translate(cx, cy);
      c.scale(anim.scale, anim.scale);
      c.translate(-cx, -cy);
    }
    const accents = {
      logic: ['#23804e', '#abc2c1'], number: ['#2c6aad', '#adbed2'],
      memory: ['#7550ad', '#bab9d2'], action: ['#bd5420', '#c7bab9'],
      card: ['#8f6419', '#bfbdb7'],
    };
    const [accent, border] = accents[item.accent] || accents.logic;
    c.save();
    if (ghost) {
      c.globalAlpha = 0.95;
      c.shadowColor = 'rgba(0,0,0,0.22)';
      c.shadowBlur = 24;
      c.shadowOffsetY = 8;
    } else {
      c.shadowColor = T.cardShadow;
      c.shadowBlur = 15;
      c.shadowOffsetY = 5;
    }
    hexPath(c, cx, cy, this.hexR);
    c.fillStyle = border;
    c.fill();
    c.restore();
    hexPath(c, cx, cy, this.hexR - 4);
    c.fillStyle = T.card;
    c.fill();

    const iconW = 30;
    const iy = cy - this.hexR * 0.44;
    const glyphs = {
      click: 'idea', match: 'bulb', point24: 'calculator', guess: 'counter',
      detective: 'incognito', hunter: 'target', master: 'layers',
      g2048: 'calculator', three: 'numeric-3', snake: 'snake', link: 'link',
      puzzle: 'puzzle', mirror: 'mirror', down: 'down',
      crush: 'crush', sudoku: 'sudoku', sort: 'sort', slide: 'slide',
      poker: 'mode-poker', mahjong: 'mode-mahjong', solo: 'mode-mahjong',
      alchemy: 'alchemy', quesheng: 'quesheng', legend: 'legend', gambler: 'gambler',
    };
    const fallbacks = {
      click: '💡', match: '💡', point24: '🧮', guess: '1A2B',
      detective: '🕵', hunter: '🎯', master: '🧩',
      g2048: '2048', three: '3', snake: '🐍', link: '🔗',
      puzzle: '🧩', mirror: '🪞', down: '⬇️',
      crush: '😄', sudoku: '数', sort: '🧃', slide: '↔',
      poker: '🃏', mahjong: '🀄', solo: '🀄',
      alchemy: '⚗', quesheng: '🀄', legend: '🀄', gambler: '🀄',
    };
    if (!icons.draw(c, glyphs[item.kind], cx, iy + iconW / 2, 25, accent)) {
      D.text(c, fallbacks[item.kind], cx, iy + iconW / 2, {
        size: fallbacks[item.kind] === '1A2B' ? 10 : 19,
        weight: 'bold', color: accent, align: 'center',
        family: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif',
      });
    }
    D.text(c, item.title, cx, cy + this.hexR * 0.38, {
      size: this.hexes.length >= 4 ? 12 : 14, weight: 'bold', color: T.text, align: 'center',
    });
    c.restore();
    if (ghost) return;
    const w = this.hexR * 1.55;
    const h = this.hexR * 1.8;
    this.addButton(item.id + '-game', cx - w / 2, cy - h / 2, w, h, () => {
      if (this.suppressOpen) { this.suppressOpen = false; return; }
      this.app.openGame(item.id, { x: cx, y: cy });
    });
  }

  getGameOrigin(id) {
    const item = this.hexes.find(h => h.id === id);
    return item ? { x: item.cx, y: item.cy } : { x: W / 2, y: H / 2 };
  }

  refreshLabels() {
    this.hexes.forEach((item) => {
      if (item.id === 'click') item.title = t('home.clickTitle');
      if (item.id === 'match') item.title = t('home.matchTitle');
      if (item.id === 'point24') item.title = t('home.point24Title');
      if (item.id === 'guess') item.title = t('home.guessTitle');
      if (item.id === 'detective') item.title = t('home.detectiveTitle');
      if (item.id === 'hunter') item.title = t('home.hunterTitle');
      if (item.id === 'master') item.title = t('home.masterTitle');
      if (item.id === 'g2048') item.title = t('home.g2048Title');
      if (item.id === 'three') item.title = t('home.threeTitle');
      if (item.id === 'snake') item.title = t('home.snakeTitle');
      if (item.id === 'link') item.title = t('home.linkTitle');
      if (item.id === 'puzzle') item.title = t('home.puzzleTitle');
      if (item.id === 'mirror') item.title = t('home.mirrorTitle');
      if (item.id === 'down') item.title = t('home.downTitle');
      if (item.id === 'crush') item.title = t('home.crushTitle');
      if (item.id === 'sudoku') item.title = t('home.sudokuTitle');
      if (item.id === 'sort') item.title = t('home.sortTitle');
      if (item.id === 'slide') item.title = t('home.slideTitle');
      if (item.id === 'poker') item.title = t('home.pokerTitle');
      if (item.id === 'mahjong') item.title = t('home.mahjongTitle');
      if (item.id === 'solo') item.title = t('home.soloTitle');
      if (item.id === 'alchemy') item.title = t('home.alchemyTitle');
      if (item.id === 'quesheng') item.title = t('home.queshengTitle');
      if (item.id === 'legend') item.title = t('home.legendTitle');
      if (item.id === 'gambler') item.title = t('home.gamblerTitle');
    });
  }

  drawSettingsButton(c) {
    const T = theme.tokens;
    const r = this.gearRect;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.12)';
    c.shadowBlur = 10;
    c.shadowOffsetY = 2;
    D.circle(c, cx, cy, r.w / 2, T.card);
    c.restore();
    if (!icons.draw(c, 'settings', cx, cy, 22, T.text)) {
      D.text(c, '⚙', cx, cy, { size: 20, color: T.text, align: 'center' });
    }
    this.addButton('settings', r.x, r.y, r.w, r.h, () => { this.settingsOpen = true; this.settingsAnim = 0; });
  }

  drawSettings(c) {
    const T = theme.tokens;
    const anim = this.settingsAnim;
    const ease = 1 - Math.pow(1 - anim, 3);
    c.fillStyle = `rgba(0,0,0,${0.45 * ease})`;
    c.fillRect(0, 0, W, H);
    const x = 0;
    const w = W;
    const h = 280 + SAFE_BOTTOM;
    const y = H - h + h * (1 - ease);
    D.card(c, x, y, w, h, T);
    this.addButton('settings-mask', 0, 0, W, H, () => { this.settingsOpen = false; });
    D.text(c, t('home.settings'), x + 32, y + 30, { size: 20, weight: 'bold', color: T.text });
    const close = { x: x + w - 48, y: y + 14, w: 32, h: 32 };
    D.fillRoundRect(c, close.x, close.y, close.w, close.h, 8, T.enter);
    if (!icons.draw(c, 'close', close.x + 16, close.y + 16, 17, T.text)) {
      D.text(c, '×', close.x + 16, close.y + 16, { size: 18, color: T.text, align: 'center' });
    }
    this.addButton('settings-close', close.x, close.y, close.w, close.h, () => { this.settingsOpen = false; });

    const face = getRaw('__games_hub__face', 'emoji');
    const rows = [
      {
        label: t('home.language'),
        current: i18n.langMode,
        options: [
          ['system', t('home.followSystem')],
          ['cn', t('home.chinese')],
          ['en', t('home.english')],
        ],
        onPick: value => { i18n.setLangMode(value); this.refreshLabels(); },
      },
      {
        label: t('home.face'),
        current: face,
        options: [
          ['emoji', t('home.faceEmoji')],
          ['poker', t('home.facePoker')],
          ['mahjong', t('home.faceMahjong')],
        ],
        onPick: value => setRaw('__games_hub__face', value),
      },
      {
        label: t('home.sfx'),
        current: audio.enabled ? 'on' : 'off',
        options: [['on', t('home.on')], ['off', t('home.off')]],
        onPick: value => audio.setEnabled(value === 'on'),
      },
    ];

    const rowH = 58;
    let ry = y + 62;
    rows.forEach((row, ri) => {
      D.text(c, row.label, x + 32, ry + 18, { size: 14, color: T.muted });
      const gap = 6;
      const widths = row.options.map(([, label]) => Math.max(44, D.measure(c, label, 12) + 20));
      const total = widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1);
      let bx = x + w - 32 - total;
      row.options.forEach(([value, label], oi) => {
        const on = row.current === value;
        const bw = widths[oi];
        D.fillRoundRect(c, bx, ry, bw, 36, 8, on ? T.primary : T.enter);
        D.text(c, label, bx + bw / 2, ry + 18, {
          size: 12, weight: on ? 'bold' : 'normal', color: on ? '#fff' : T.text, align: 'center',
        });
        this.addButton(`setting-${ri}-${value}`, bx, ry, bw, 36, () => row.onPick(value));
        bx += bw + gap;
      });
      if (ri < rows.length - 1) D.line(c, x + 32, ry + 50, x + w - 32, ry + 50, T.border, 1);
      ry += rowH;
    });

    // 比照小程序设置面板：拖动提示 + 轻松的话同一行（安全区之上）。
    const footText = `${t('home.dragTip')} · ${t('home.footer')}`;
    let footSize = 11;
    while (footSize > 8 && D.measure(c, footText, footSize) > this.cw - 16) footSize -= 0.5;
    D.text(c, footText, W / 2, y + h - SAFE_BOTTOM - 20, {
      size: footSize, color: T.muted, align: 'center',
    });
  }

}

module.exports = HomeScene;
