const { W, H, DPR, SAFE_TOP, SAFE_BOTTOM } = require('../../core/canvas');
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

// 分段控件滑块动画时长（web 的 .seg-slider 是 0.32s）
const SEG_SLIDE_MS = 320;
const HEADER = require('../../core/header');

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
    this.settingsSurface = null;   // 圆形展开用的离屏画布（懒创建）
    this.segSlide = {};            // 分段控件滑块的弹性动画：key → { from, to, at }
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
    // 与微信右上角胶囊按钮同一水平线。
    this.titleY = HEADER.TITLE_Y;
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
    const topLimit = this.titleY + 32;
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
    // 与 web 的 clip-path 0.6s 对齐：展开 600ms、收拢 480ms
    if (this.settingsOpen) this.settingsAnim = Math.min(1, this.settingsAnim + step / 600);
    else if (this.settingsAnim > 0) this.settingsAnim = Math.max(0, this.settingsAnim - step / 480);
  }

  render(c) {
    const T = theme.tokens;
    c.fillStyle = T.bg;
    c.fillRect(0, 0, W, H);
    this.bg.draw(c, theme.dark);
    // 首页顶部固定展示小游戏名称；中英文使用同一个名字。
    D.text(c, t('home.homeTitle'), W / 2, this.titleY, {
      size: 16, weight: 'bold', color: T.muted, align: 'center',
    });

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

  onTheme() {
    this.layout();
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
    const item = this.hexes.find(h => h.id === this.press.id);
    if (!item) return;
    this.drag = {
      id: this.press.id,
      x: item.cx, y: item.cy,
      ox: item.cx, oy: item.cy,
      startX: this.press.x, startY: this.press.y,
    };
    this.suppressOpen = true;
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
  }

  onTouchStart(p) {
    if (!p) return;
    if (this.settingsOpen) {
      // 设置面板内容比屏幕高时可以拖动滚动；拖过 6px 就不再触发点击
      this.settingsDrag = { y: p.y, scroll: this.settingsScroll || 0 };
      return;
    }
    const item = this.hexAt(p.x, p.y);
    if (!item) return;
    this.suppressOpen = false;
    this.press = { id: item.id, x: p.x, y: p.y };
    if (this.pressTimer) clearTimeout(this.pressTimer);
    this.pressTimer = setTimeout(() => { this.pressTimer = null; this.startDrag(); }, 260);
  }

  onTouchMove(p) {
    if (!p) return;
    if (this.settingsDrag) {
      const L = this.settingsLayout();
      const maxScroll = Math.max(0, L.contentH - H);
      this.settingsScroll = Math.min(maxScroll, Math.max(0, this.settingsDrag.scroll - (p.y - this.settingsDrag.y)));
      return;
    }
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
    this.drag.x = this.drag.ox + (p.x - this.drag.startX);
    this.drag.y = this.drag.oy + (p.y - this.drag.startY);
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
    if (this.settingsDrag) {
      this.settingsDrag = null;
      return;
    }
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
      logic: '#23804e', number: '#2c6aad', memory: '#7550ad',
      action: '#bd5420', card: '#8f6419',
    };
    const accent = accents[item.accent] || accents.logic;
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
    c.fillStyle = accent;
    c.fill();
    c.restore();
    hexPath(c, cx, cy, this.hexR - 2.5);
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
    this.addButton('settings', r.x, r.y, r.w, r.h, () => {
      this.settingsOpen = true;
      this.settingsAnim = 0;
      this.settingsScroll = 0;
      this.segSlide = {};
    });
  }

  // 设置面板：整屏、标题徽章 + 每组一张卡、卡内是「分段控件 + 绿色滑块」、
  // 开关行用 iOS 风格开关 —— 与 web 的 shared/SettingsSheet.vue 同一套观感。
  // （web 是点击处圆形扩张；canvas 里改成淡入 + 轻微上移，内容布局保持一致。）
  settingsLayout() {
    const pad = 16;
    const blockGap = 14;
    const segPad = 4;
    const segItemH = 40;
    const segH = segItemH + segPad * 2;
    const blockHeadH = 24;        // h3（14px）+ 间距
    const blockPadY = 12;
    const switchRowH = 56;
    const heroH = 38;
    const top = SAFE_TOP + 18;
    const blocks = [
      { kind: 'seg', title: t('home.theme'), key: 'theme' },
      { kind: 'seg', title: t('home.language'), key: 'lang' },
      { kind: 'seg', title: t('home.face'), key: 'face' },
      { kind: 'switch', title: '', key: 'switch' },
    ];
    let y = top;
    const hero = { x: pad, y, w: heroH, h: heroH };
    y += heroH + 20;
    const laid = blocks.map((b) => {
      const h = b.kind === 'seg'
        ? blockPadY * 2 + blockHeadH + segH
        : blockPadY * 2 + switchRowH;
      const rect = { x: pad, y, w: W - pad * 2, h };
      y += h + blockGap;
      return Object.assign({}, b, { rect });
    });
    const footY = y + 6;
    const contentH = footY + 18 + SAFE_BOTTOM + 12;
    return { pad, segPad, segItemH, segH, blockPadY, blockHeadH, switchRowH, hero, blocks: laid, footY, contentH };
  }

  // 与 web 的 .seg-slider 同一节奏：320ms，cubic-bezier(0.34, 1.25, 0.5, 1)（会轻微过冲，有弹性）

  // 三次贝塞尔求值：给定 x 反解 t，再算 y（浏览器就是这么做 easing 的）
  bezier(t, p1, p2) {
    const u = 1 - t;
    return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t;
  }

  springEase(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    // 二分找 x(t) = t 的参数
    let lo = 0;
    let hi = 1;
    let mid = t;
    for (let i = 0; i < 12; i += 1) {
      mid = (lo + hi) / 2;
      const x = this.bezier(mid, 0.34, 0.5);
      if (x < t) lo = mid; else hi = mid;
    }
    return this.bezier(mid, 1.25, 1);
  }

  // 当前视觉上的滑块位置（可能是小数，正在滑动）
  segIndexFloat(key) {
    const slide = this.segSlide[key];
    const now = this.now || Date.now();
    if (!slide) return null;
    const t = Math.min(1, Math.max(0, (now - slide.at) / SEG_SLIDE_MS));
    if (t >= 1) {
      delete this.segSlide[key];
      return slide.to;
    }
    return slide.from + (slide.to - slide.from) * this.springEase(t);
  }

  segIndex(key, itemW, gap) {
    const sliding = this.segIndexFloat(key);
    if (sliding != null) return sliding;
    const meta = this.settingSegOptions(key);
    return Math.max(0, meta.options.findIndex(o => o[0] === meta.current));
  }

  slideSeg(key, value) {
    const meta = this.settingSegOptions(key);
    const to = Math.max(0, meta.options.findIndex(o => o[0] === value));
    if (to < 0) return;
    const sliding = this.segIndexFloat(key);
    const from = sliding != null ? sliding : Math.max(0, meta.options.findIndex(o => o[0] === meta.current));
    if (Math.abs(to - from) < 0.001) return;
    this.segSlide[key] = { from, to, at: Date.now() };
    this.now = this.now || Date.now();
  }

  settingSegOptions(key) {
    if (key === 'theme') {
      return {
        current: theme.mode,
        options: [
          ['system', t('home.followSystem'), 'monitor'],
          ['light', t('home.light'), 'sun'],
          ['dark', t('home.dark'), 'moon'],
        ],
        onPick: (value) => { this.slideSeg('theme', value); theme.setMode(value); },
      };
    }
    if (key === 'lang') {
      return {
        current: i18n.langMode,
        options: [
          ['system', t('home.followSystem'), 'monitor'],
          ['cn', t('home.chinese'), null],
          ['en', t('home.english'), null],
        ],
        onPick: (value) => { this.slideSeg('lang', value); i18n.setLangMode(value); this.refreshLabels(); },
      };
    }
    return {
      current: getRaw('__games_hub__face', 'emoji'),
      options: [
        ['emoji', t('home.faceEmoji'), null],
        ['poker', t('home.facePoker'), null],
        ['mahjong', t('home.faceMahjong'), null],
      ],
      onPick: (value) => { this.slideSeg('face', value); setRaw('__games_hub__face', value); },
    };
  }

  // 设置面板的内容：只画内容（不含展开动画 / 遮罩 / 关闭按钮）。
  // drawSettings 决定直接画到主画布（完全展开）还是画到离屏画布再按圆形裁剪。
  // interactive 为真时才注册按钮 —— 动画过程中不响应点击（和 web 一致）。
  drawSettingsContent(c, opts) {
    const T = theme.tokens;
    const L = opts.L;
    const scroll = opts.scroll || 0;
    const interactive = !!opts.interactive;
    const addBtn = (id, x, y, w, h, onTap) => {
      if (!interactive) return;
      this.addButton(id, x, y - scroll, w, h, onTap);
    };

    // 标题：绿色徽章 + 「设置」
    const hero = L.hero;
    const hg = c.createLinearGradient(hero.x, hero.y, hero.x + hero.w, hero.y + hero.h);
    hg.addColorStop(0, T.primary);
    hg.addColorStop(1, '#37a06a');
    c.fillStyle = hg;
    D.fillRoundRect(c, hero.x, hero.y, hero.w, hero.h, 12);
    if (!icons.draw(c, 'settings', hero.x + hero.w / 2, hero.y + hero.h / 2, 21, '#fff')) {
      D.text(c, '⚙', hero.x + hero.w / 2, hero.y + hero.h / 2, { size: 20, color: '#fff', align: 'center' });
    }
    D.text(c, t('home.settings'), hero.x + hero.w + 12, hero.y + hero.h / 2 + 1, {
      size: 21, weight: 'bold', color: T.text,
    });

    // 卡片（含组标题、卡内空白）先注册一个空热区：点它不关闭面板；
    // 只有点卡片之外的空白处才会落到遮罩（关闭）。选项按钮随后注册，仍优先于这里。
    if (interactive) {
      const titleW = D.measure(c, t('home.settings'), 21, 'bold');
      addBtn('settings-hero', hero.x - 6, hero.y - 6, hero.w + 12 + titleW + 12, hero.h + 12, () => {});
      L.blocks.forEach((blk, bi2) => {
        addBtn(`settings-panel-${bi2}`, blk.rect.x, blk.rect.y, blk.rect.w, blk.rect.h, () => {});
      });
    }

    L.blocks.forEach((block, bi) => {
      const r = block.rect;
      D.card(c, r.x, r.y, r.w, r.h, T);
      if (block.kind === 'seg') {
        D.text(c, block.title, r.x + 16, r.y + 12 + 7, { size: 14, weight: 'bold', color: T.muted });
        const seg = { x: r.x + 12, y: r.y + 12 + L.blockHeadH, w: r.w - 24, h: L.segH };
        // 分段容器用页面底色（web 的 .seg 也是 --bg-color）
        D.fillRoundRect(c, seg.x, seg.y, seg.w, seg.h, 14, T.bg);
        const meta = this.settingSegOptions(block.key);
        const n = meta.options.length;
        const gap = 6;
        const itemW = (seg.w - L.segPad * 2 - gap * (n - 1)) / n;
        // 选中态是一块绿色滑块（web 的 .seg-slider）：切换时带弹性滑过去，而不是瞬移
        // 过冲时最多溢出 0.12 个格子，避免滑块顶出分段容器
        const index = Math.min(n - 1 + 0.12, Math.max(-0.12, this.segIndex(block.key, itemW, gap)));
        D.fillRoundRect(c, seg.x + L.segPad + index * (itemW + gap), seg.y + L.segPad, itemW, L.segItemH, 11, T.primary);
        meta.options.forEach((opt, oi) => {
          const value = opt[0];
          const label = opt[1];
          const icon = opt[2];
          const cx = seg.x + L.segPad + oi * (itemW + gap);
          const cy = seg.y + L.segPad + L.segItemH / 2;
          const on = meta.current === value;
          const color = on ? '#fff' : T.text;
          const iconSize = 16;
          const textW = D.measure(c, label, 13, 'bold');
          const groupW = icon ? iconSize + 6 + textW : textW;
          let gx = cx + (itemW - groupW) / 2;
          if (icon) {
            if (!icons.draw(c, icon, gx + iconSize / 2, cy, iconSize, color)) {
              D.text(c, '▫', gx + iconSize / 2, cy, { size: 14, color, align: 'center' });
            }
            gx += iconSize + 6;
          }
          D.text(c, label, gx, cy, { size: 13, weight: 'bold', color });
          addBtn(`setting-${bi}-${value}`, cx, seg.y + L.segPad, itemW, L.segItemH,
            () => meta.onPick(value));
        });
      } else {
        // 开关卡：小游戏没有背景音乐资源，只画「游戏音效」（与 web 同样的行样式）
        const row = { x: r.x + 12, y: r.y + 12, w: r.w - 24, h: L.switchRowH };
        D.fillRoundRect(c, row.x, row.y, row.w, row.h, 14, T.bg);
        const on = audio.enabled;
        const tile = { x: row.x + 12, y: row.y + (row.h - 34) / 2, w: 34, h: 34 };
        if (on) {
          const tg = c.createLinearGradient(tile.x, tile.y, tile.x + tile.w, tile.y + tile.h);
          tg.addColorStop(0, T.primary);
          tg.addColorStop(1, '#37a06a');
          c.fillStyle = tg;
          D.fillRoundRect(c, tile.x, tile.y, tile.w, tile.h, 11);
        } else {
          D.fillRoundRect(c, tile.x, tile.y, tile.w, tile.h, 11, T.card);
        }
        const iconColor = on ? '#fff' : T.muted;
        if (!icons.draw(c, on ? 'volume' : 'volume-off', tile.x + tile.w / 2, tile.y + tile.h / 2, 19, iconColor)) {
          D.text(c, on ? '♪' : '×', tile.x + tile.w / 2, tile.y + tile.h / 2, { size: 17, color: iconColor, align: 'center' });
        }
        D.text(c, t('home.sfx'), tile.x + tile.w + 12, row.y + row.h / 2, { size: 14, weight: 'bold', color: T.text });
        const sw = { x: row.x + row.w - 12 - 46, y: row.y + (row.h - 28) / 2, w: 46, h: 28 };
        D.fillRoundRect(c, sw.x, sw.y, sw.w, sw.h, 14, on ? T.primary : T.border);
        D.circle(c, sw.x + (on ? 33 : 14), sw.y + 14, 11, '#fff');
        addBtn(`setting-${bi}-sfx`, row.x, row.y, row.w, row.h, () => audio.setEnabled(!audio.enabled));
      }
    });

    // 底部提示（web 的 .sheet-foot）
    const footText = `${t('home.dragTip')} · ${t('home.footer')}`;
    let footSize = 11.5;
    while (footSize > 9 && D.measure(c, footText, footSize) > W - L.pad * 2) footSize -= 0.5;
    D.text(c, footText, W / 2, L.footY, { size: footSize, color: T.muted, align: 'center' });
  }

  // 离屏画布：拿不到第二块画布时返回 null，调用方退化成「直接显示」
  ensureSettingsSurface() {
    if (this.settingsSurface) return this.settingsSurface;
    try {
      if (!wx.createCanvas) return null;
      const surface = wx.createCanvas();
      if (!surface) return null;
      // DPR 封顶 2：这块画布只在 0.6s 展开动画里用，没必要按 3x 占内存
      const dpr = Math.min(DPR, 2);
      surface.width = Math.round(W * dpr);
      surface.height = Math.round(H * dpr);
      const ctx = surface.getContext('2d');
      ctx.scale(dpr, dpr);
      this.settingsSurface = { canvas: surface, ctx, dpr };
      return this.settingsSurface;
    } catch (e) {
      return null;
    }
  }

  drawSettings(c) {
    const anim = this.settingsAnim;
    // 与 web 的 clip-path 0.6s ease-in-out 同一节奏
    const ease = anim < 0.5 ? 2 * anim * anim : 1 - Math.pow(-2 * anim + 2, 2) / 2;
    const L = this.settingsLayout();
    const maxScroll = Math.max(0, L.contentH - H);
    const scroll = Math.min(Math.max(0, this.settingsScroll || 0), maxScroll);
    const open = ease >= 0.995;

    // 圆心 = 右下角齿轮的中心；半径 = 到最远屏幕角
    const gear = this.gearRect;
    const cx = gear.x + gear.w / 2;
    const cy = gear.y + gear.h / 2;
    const maxR = Math.max(
      Math.hypot(cx, cy), Math.hypot(W - cx, cy),
      Math.hypot(cx, H - cy), Math.hypot(W - cx, H - cy),
    );

    if (open) {
      // ⚠️ 遮罩必须**先注册**：命中判定是「后注册优先」，晚注册会把所有选项按钮全压掉
      //（踩过：点任何地方都变成关闭设置）
      this.addButton('settings-mask', 0, 0, W, H, () => { this.settingsOpen = false; });
      c.save();
      c.fillStyle = theme.tokens.bg;
      c.fillRect(0, 0, W, H);
      c.translate(0, -scroll);
      this.drawSettingsContent(c, { L, scroll, interactive: true });
      c.restore();
    } else {
      const surface = this.ensureSettingsSurface();
      if (!surface) {
        c.save();
        c.fillStyle = theme.tokens.bg;
        c.fillRect(0, 0, W, H);
        c.translate(0, -scroll);
        this.drawSettingsContent(c, { L, scroll, interactive: false });
        c.restore();
      } else {
        const off = surface.ctx;
        off.save();
        off.setTransform(surface.dpr, 0, 0, surface.dpr, 0, 0);
        off.clearRect(0, 0, W, H);
        off.translate(0, -scroll);
        this.drawSettingsContent(off, { L, scroll: 0, interactive: false });
        off.restore();
        c.save();
        c.beginPath();
        c.arc(cx, cy, Math.max(0.1, maxR * ease), 0, Math.PI * 2);
        c.clip();
        // 圆形里先铺**不透明**面板底色：离屏画布只装内容（透明底），
        // 底色跟着圆形一起长出来，否则展开过程中会透出首页蜂窝。
        c.fillStyle = theme.tokens.bg;
        c.fillRect(0, 0, W, H);
        // 只有「内容」比圆形晚一点显形（web：opacity .28s delay .16s）
        c.globalAlpha = Math.min(1, Math.max(0, (ease - 0.18) / 0.5));
        c.drawImage(surface.canvas, 0, 0, W, H);
        c.restore();
      }
    }

    // 关闭按钮：画在齿轮那一格，展开过半后才可点
    const closeAlpha = Math.min(1, Math.max(0, (ease - 0.45) / 0.4));
    c.save();
    c.globalAlpha = closeAlpha;
    c.shadowColor = 'rgba(0,0,0,0.12)';
    c.shadowBlur = 10;
    c.shadowOffsetY = 2;
    D.circle(c, gear.x + gear.w / 2, gear.y + gear.h / 2, gear.w / 2, theme.tokens.card);
    c.restore();
    c.save();
    c.globalAlpha = closeAlpha;
    if (!icons.draw(c, 'close', gear.x + gear.w / 2, gear.y + gear.h / 2, 20, theme.tokens.text)) {
      D.text(c, '×', gear.x + gear.w / 2, gear.y + gear.h / 2, { size: 20, color: theme.tokens.text, align: 'center' });
    }
    c.restore();
    if (ease > 0.75) {
      this.addButton('settings-close', gear.x, gear.y, gear.w, gear.h, () => { this.settingsOpen = false; });
    }
  }


}

module.exports = HomeScene;
