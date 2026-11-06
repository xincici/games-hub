const { W, H, SAFE_TOP, SAFE_BOTTOM } = require('../../core/canvas');
const { Scene } = require('../../core/app');
const theme = require('../../core/theme');
const { t } = require('../../core/i18n');
const { getRaw, setRaw, removeRaw } = require('../../core/storage');
const D = require('../../core/draw');
const ParticleField = require('../../core/particles');
const icons = require('../../core/icons');
const fabKit = require('../../core/fab');
const cards = require('../../core/cards');
const HEADER = require('../../core/header');
const board = require('./board');
const i18nDict = require('./i18n');

const coreI18n = require('../../core/i18n');
const confetti = require('../../core/confetti');
const achv = require('../../core/achv');
if (!coreI18n.__masterRegistered) {
  coreI18n.register('master', i18nDict);
  coreI18n.__masterRegistered = true;
}

const MODE_KEY = '__emoji_master__mode';
const MODE_KEYS = {
  emoji: { level: '__emoji_master__level', state: '__emoji_master__state' },
  poker: { level: '__emoji_master__poker_level', state: '__emoji_master__poker_state' },
  mahjong: { level: '__emoji_master__mahjong_level', state: '__emoji_master__mahjong_state' },
};
const MODE_NUM = { emoji: cards.MODE_EMOJI, poker: cards.MODE_POKER, mahjong: cards.MODE_MAHJONG };
// 成就按 1/2/3 记模式（emoji / poker / mahjong）
const MASTER_MODE_NUM = { emoji: 1, poker: 2, mahjong: 3 };

class MasterScene extends Scene {
  constructor(app) {
    super(app);
    this.bg = new ParticleField();
    this.mode = this.loadMode();
    this.level = 1;
    this.tiles = [];
    this.tray = [];
    this.flights = [];
    this.clearFx = [];
    this.dealStart = 0;
    this.cfg = null;
    this.free = new Set();
    this.phase = 'play';
    this.confirming = false;
    this.helpOpen = false;
    this.confetti = [];
    this.confettiUntil = 0;
    this.lastConfettiAt = 0;
    this.now = Date.now();
    this.tileId = 0;
    this.layout();
    this.boot();
  }
  loadMode() {
    const raw = getRaw(MODE_KEY, '');
    if (board.MODE_ORDER.includes(raw)) return raw;
    const face = getRaw('__games_hub__face', 'emoji');
    return board.MODE_ORDER.includes(face) ? face : 'emoji';
  }
  levelKey() { return MODE_KEYS[this.mode].level; }
  stateKey() { return MODE_KEYS[this.mode].state; }
  get modeNum() { return MODE_NUM[this.mode] || cards.MODE_EMOJI; }
  get pitch() { return this.cfg ? this.cfg.pitch : { x: 2, y: 2 }; }
  loadLevel() { return Math.max(1, Math.floor(+(getRaw(this.levelKey(), 1) || 1)) || 1); }
  boot() {
    this.level = this.loadLevel();
    if (!this.restore()) this.startLevel(this.level);
  }
  restore() {
    try {
      const raw = getRaw(this.stateKey(), '');
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.tiles) || !Array.isArray(s.tray)) return false;
      this.level = Math.max(1, +s.level || 1);
      this.cfg = board.levelConfig(this.level, this.mode);
      if (s.phase === 'won') {
        this.tiles = [];
        this.tray = [];
        this.phase = 'won';
        this.flights = [];
        this.clearFx = [];
        this.layout();
        return true;
      }
      const tiles = s.tiles.map(t => ({ id: +t[0], emoji: String(t[1]), layer: +t[2], x: +t[3], y: +t[4] }));
      if (!tiles.length) return false;
      const ids = new Set();
      for (const t of tiles) {
        if (!(t.id > 0) || !t.emoji || t.layer < 0 || t.x < 0 || t.y < 0 || ids.has(t.id)) return false;
        ids.add(t.id);
      }
      const tray = s.tray.map(t => ({ id: +t[0], emoji: String(t[1]), arrived: true }));
      if (tray.length > 7) return false;
      this.tiles = tiles;
      this.tray = tray;
      this.tileId = Math.max(0, ...tiles.map(t => t.id), ...tray.map(t => t.id));
      this.phase = s.phase === 'over' ? 'over' : 'play';
      this.flights = [];
      this.clearFx = [];
      this.layout();
      this.updateFree();
      this.prepareDeal();
      return true;
    } catch (e) { return false; }
  }
  startLevel(level) {
    this.level = Math.max(1, level || 1);
    setRaw(this.levelKey(), String(this.level));
    const pool = cards.poolFor(this.modeNum);
    const generated = board.generateTiles(pool, this.level, this.mode);
    this.tiles = generated.tiles;
    this.tileId = this.tiles.reduce((m, t) => Math.max(m, +t.id || 0), 0);
    this.cfg = generated.cfg;
    this.tray = [];
    this.flights = [];
    this.clearFx = [];
    this.dealStart = Date.now();
    this.phase = 'play';
    this.confirming = false;
    this.layout();
    this.updateFree();
    this.prepareDeal();
    removeRaw(this.stateKey());
  }
  prepareDeal() {
    // 底层先出现，再逐层向上；同层内按 y/x（左上到右下）排序。
    const order = this.tiles.slice().sort((a, b) => a.layer - b.layer || a.y - b.y || a.x - b.x);
    const rank = new Map(order.map((t, i) => [t.id, i]));
    this.tiles.forEach(t => { t.dealOrder = rank.get(t.id) || 0; });
    this.dealStart = Date.now();
  }
  updateFree() {
    if (!this.cfg) return;
    this.free = new Set(board.freeIds(this.tiles, this.cfg.pitch));
  }
  saveState() {
    if (this.phase !== 'play' && this.phase !== 'over') return;
    if (!this.tiles.length && !this.tray.length) {
      removeRaw(this.stateKey());
      return;
    }
    setRaw(this.stateKey(), JSON.stringify({
      level: this.level,
      phase: this.phase,
      tiles: this.tiles.map(t => [t.id, t.emoji, t.layer, t.x, t.y]),
      tray: this.tray.map(t => [t.id, t.emoji]),
    }));
  }
  saveWin() {
    setRaw(this.levelKey(), String(this.level));
    setRaw(this.stateKey(), JSON.stringify({ level: this.level, phase: 'won', tiles: [], tray: [] }));
  }
  pick(tile) {
    if (this.phase !== 'play' || !this.free.has(tile.id)) return;
    const key = cards.keyOf(tile.emoji);
    const source = this.tileRect(tile);
    this.tiles = this.tiles.filter(t => t.id !== tile.id);
    this.tray = this.tray.slice();
    const idx = board.insertIndex(this.tray, key);
    const trayItem = { ...tile, arrived: false };
    this.tray.splice(idx, 0, trayItem);
    const target = this.slotRect(idx);
    this.flights.push({
      item: tile.emoji, from: source, to: target, start: Date.now(), duration: 260, trayItem,
    });
    const count = board.countInTray(this.tray, key);
    if (count >= 3) {
      const slots = [];
      this.tray.forEach((t, i) => { if (cards.keyOf(t.emoji) === key) slots.push({ tile: t, slot: i }); });
      this.tray = this.tray.filter(t => cards.keyOf(t.emoji) !== key);
      this.clearFx.push({ key, slots, start: Date.now() });
      this.app.audio.playElimination();
    }
    this.updateFree();
    this.saveState();
    if (!this.tiles.length) {
      this.phase = 'won';
      this.saveWin();
      achv.win('master', { mode: MASTER_MODE_NUM[this.mode], level: this.level });
      this.startConfetti();
      this.app.audio.playSuccess();
    } else if (this.tray.length >= 7) {
      this.phase = 'over';
      this.saveState();
      this.app.audio.playLose();
    }
  }
  nextLevel() { this.startLevel(this.level + 1); }
  retryLevel() { this.startLevel(this.level); }
  startNewGame() { this.confirming = false; removeRaw(this.levelKey()); this.startLevel(1); }
  toggleMode() {
    this.saveState();
    const at = board.MODE_ORDER.indexOf(this.mode);
    this.mode = board.MODE_ORDER[(at + 1) % board.MODE_ORDER.length];
    setRaw(MODE_KEY, this.mode);
    this.level = this.loadLevel();
    this.boot();
  }
  startConfetti() { this.confetti = []; this.confettiUntil = Date.now() + 1200; this.lastConfettiAt = 0; }
  emitConfetti() {
    confetti.spawn(this.confetti, { W, H, startY: H * 0.58, scoreY: this.scoreY });
  }
  update(dt) {
    this.now = Date.now();
    if (this.bg) this.bg.update(dt || 16);
    this.flights = this.flights.filter((f) => {
      if (this.now - f.start >= f.duration) {
        if (f.trayItem) f.trayItem.arrived = true;
        return false;
      }
      return true;
    });
    this.clearFx = this.clearFx.filter(fx => this.now - fx.start < 420);
    if (this.now < this.confettiUntil && this.now - this.lastConfettiAt >= 40) {
      this.lastConfettiAt = this.now;
      this.emitConfetti();
    }
    this.confetti = confetti.update(this.confetti, dt || 16, H);
  }
  layout() {
    this.cw = Math.min(W - 32, 440);
    this.cx = (W - this.cw) / 2;
    this.top = HEADER.TOP;
    this.headerH = HEADER.HEIGHT;
    this.homeRect = { ...HEADER.HOME_RECT };
    this.scoreY = this.top + this.headerH + 12;
    this.scoreH = 72;
    this.optY = this.scoreY + this.scoreH + 16;
    this.optH = 72;
    this.boardY = this.optY + this.optH + 16;
    const trayH = 60;
    this.trayH = trayH;
    // 暂存槽下方还要放一句玩法提示；提示是居中的短句，和右下 FAB 只在**横向**上分开，
    // 所以底部预留维持 90 即可（加大会把棋盘压小 30px，不值得）。
    const bottom = SAFE_BOTTOM + 96;   // 暂存槽 + 玩法提示 + 右下 FAB
    // 棋盘尺寸 = unit × UNITS + 16（内边距），所以可用高度要先扣掉这 16，否则盘底会比预留区多出 16px
    const availH = Math.max(160, H - this.boardY - trayH - bottom);
    const usableH = availH - 16;
    this.unit = Math.min((this.cw - 16) / board.UNITS, usableH / board.UNITS);
    this.boardSize = this.unit * board.UNITS + 16;
    this.boardX = (W - this.boardSize) / 2;
    this.trayY = this.boardY + this.boardSize + 12;
    this.trayW = Math.min(this.cw, 7 * 44 + 6 * 6 + 16);
    this.trayX = (W - this.trayW) / 2;
    this.fabSize = 40;
    this.helpFab = { x: W - 16 - 40, y: H - SAFE_BOTTOM - 16 - 40, w: 40, h: 40 };
  }
  render(c) {
    this.buttons = [];
    const T = theme.tokens;
    c.fillStyle = T.bg; c.fillRect(0, 0, W, H);
    this.bg.draw(c, theme.dark);
    this.drawHeader(c);
    this.drawScore(c);
    this.drawOptions(c);
    this.drawBoard(c);
    this.drawTray(c);
    this.drawFlights(c);
    this.drawPlayHint(c);
    if (!this.helpOpen && !this.confirming) this.drawFabs(c);
    this.drawConfetti(c);
    if (this.helpOpen) this.drawHelp(c);
    if (this.confirming) this.drawConfirm(c);
  }

  // 游戏区下方的一句玩法提示（统一样式见 core/draw.js 的 hintLine）
  drawPlayHint(c) {
    D.hintLine(c, t('master.playHint'), this.trayY + this.trayH + 16, theme.tokens.muted);
  }

  drawHeader(c) {
    const T = theme.tokens;
    D.text(c, t('master.gameTitle'), W / 2, this.top + this.headerH / 2, {
      size: 15, weight: 'bold', color: T.text, align: 'center',
    });
    const h = this.homeRect;
    const cx = h.x + h.w / 2;
    const cy = h.y + h.h / 2;
    if (!icons.draw(c, 'home', cx, cy, 24, T.text)) {
      D.text(c, '⌂', cx, cy, { size: 24, color: T.text, align: 'center' });
    }
    this.addButton('home', h.x, h.y, h.w, h.h, () => this.app.goHome());
  }

  drawScore(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.scoreY, this.cw, this.scoreH, T);
    const half = this.cw / 2;
    D.divider(c, this.cx + half, this.scoreY + this.scoreH / 2, 24, T.border, 1);
    D.text(c, t('master.level'), this.cx + half / 2, this.scoreY + 24, { size: 12, color: T.muted, align: 'center' });
    D.text(c, String(this.level), this.cx + half / 2, this.scoreY + 48, { size: 22, weight: 'bold', color: T.text, align: 'center' });
    D.text(c, t('master.remain'), this.cx + half + half / 2, this.scoreY + 24, { size: 12, color: T.muted, align: 'center' });
    D.text(c, String(this.tiles.length), this.cx + half + half / 2, this.scoreY + 48, { size: 22, weight: 'bold', color: T.text, align: 'center' });
    const total = this.cfg ? this.cfg.tiles : 1;
    const progress = this.cfg ? (total - this.tiles.length) / total : 0;
    D.progressBar(c, this.cx, this.scoreY, this.cw, this.scoreH, progress, T.border, T.primary);
  }
  drawOptions(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.optY, this.cw, this.optH, T);
    const half = this.cw / 2;
    D.divider(c, this.cx + half, this.optY + this.optH / 2, 24, T.border, 1);
    const info = this.cfg
      ? `${t('master.layersLabel').replace('{n}', this.cfg.layers)} · ${t('master.kindsLabel').replace('{n}', this.cfg.kinds)}`
      : '';
    D.text(c, info, this.cx + half / 2, this.optY + this.optH / 2, { size: 13, color: T.muted, align: 'center' });
    const label = t('master.start');
    const bw = Math.min(112, D.measure(c, label, 13, 'bold') + 24);
    const bx = this.cx + half + (half - bw) / 2;
    const by = this.optY + (this.optH - 32) / 2;
    D.fillRoundRect(c, bx, by, bw, 32, 8, T.primary);
    D.text(c, label, bx + bw / 2, by + 16, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('new', bx, by, bw, 32, () => { this.confirming = true; });
  }
  tileSize() {
    if (!this.cfg) return { w: 0, h: 0 };
    return { w: this.pitch.x * this.unit, h: this.pitch.y * this.unit };
  }
  tileRect(tile) {
    const s = this.tileSize();
    return { x: this.boardX + 8 + tile.x * this.unit, y: this.boardY + 8 + tile.y * this.unit, w: s.w, h: s.h };
  }
  slotRect(i) {
    const cellW = (this.trayW - 16) / 7;
    const x = this.trayX + 8 + i * cellW;
    const h = 36;
    // 暂存槽位跟牌面走：emoji 方牌、扑克 2:3、麻将 131:168；不再统一画正方形。
    const ratio = this.mode === 'emoji' ? 1 : cards.ratio(this.modeNum);
    const w = Math.min(cellW - 4, h / ratio);
    return { x: x + (cellW - w) / 2, y: this.trayY + 8 + (36 - h) / 2, w, h };
  }
  drawBoard(c) {
    const T = theme.tokens;
    D.fillRoundRect(c, this.boardX, this.boardY, this.boardSize, this.boardSize, 14, T.boardBg);
    const size = this.tileSize();
    const tiles = this.tiles.slice().sort((a, b) => a.layer - b.layer);
    tiles.forEach((tile, idx) => {
      const x = this.boardX + 8 + tile.x * this.unit;
      const y = this.boardY + 8 + tile.y * this.unit;
      const free = this.free.has(tile.id);
      const delay = (tile.dealOrder != null ? tile.dealOrder : idx) * 25;
      const p = this.dealStart ? Math.max(0, Math.min(1, (this.now - this.dealStart - delay) / 300)) : 1;
      if (p <= 0) return;
      const scale = 0.4 + 0.6 * (1 - Math.pow(1 - p, 3));
      c.save();
      c.globalAlpha = p;
      c.translate(x + size.w / 2, y + size.h / 2);
      c.scale(scale, scale);
      cards.draw(c, tile.emoji, this.modeNum, -size.w / 2, -size.h / 2, size.w, size.h, true, 'layers', '🧩');
      c.restore();
      if (!free) {
        D.fillRoundRect(c, x, y, size.w, size.h, 7, 'rgba(20,20,20,0.48)');
      } else if (this.phase === 'play') {
        this.addButton('tile-' + tile.id, x, y, size.w, size.h, () => this.pick(tile));
      }
    });
    if (this.phase === 'won' || this.phase === 'over') this.drawResult(c);
  }
  drawTray(c) {
    const T = theme.tokens;
    D.card(c, this.trayX, this.trayY, this.trayW, 52, T);
    const size = this.mode === 'emoji' ? 36 : this.mode === 'poker' ? 24 : 28;
    for (let i = 0; i < 7; i++) {
      const r = this.slotRect(i);
      D.fillRoundRect(c, r.x, r.y, r.w, r.h, 6, T.enter);
    }
    this.tray.forEach((tile) => {
      if (tile.arrived === false) return;
      const i = this.tray.indexOf(tile);
      const r = this.slotRect(i);
      cards.draw(c, tile.emoji, this.modeNum, r.x, r.y, r.w, r.h, true);
    });
    this.clearFx.forEach((fx) => {
      const age = this.now - fx.start;
      const p = Math.max(0, Math.min(1, age / 420));
      const alpha = 0.15 + 0.85 * Math.abs(Math.cos(p * Math.PI * 2));
      fx.slots.forEach(({ tile, slot }) => {
        const r = this.slotRect(slot);
        c.save();
        c.globalAlpha = alpha;
        cards.draw(c, tile.emoji, this.modeNum, r.x, r.y, r.w, r.h, true);
        c.restore();
      });
    });
    void size;
  }
  drawFlights(c) {
    this.flights.forEach((f) => {
      const p = Math.max(0, Math.min(1, (this.now - f.start) / f.duration));
      const e = 1 - Math.pow(1 - p, 3);
      const x = f.from.x + (f.to.x - f.from.x) * e;
      const y = f.from.y + (f.to.y - f.from.y) * e;
      const w = f.from.w + (f.to.w - f.from.w) * e;
      const h = f.from.h + (f.to.h - f.from.h) * e;
      c.save();
      c.globalAlpha = 0.9;
      cards.draw(c, f.item, this.modeNum, x, y, w, h, true);
      c.restore();
    });
  }
  drawResult(c) {
    if (!this.resultVisible()) return;
    const T = theme.tokens;
    D.fillRoundRect(c, this.boardX, this.boardY, this.boardSize, this.boardSize, 14, T.overlay);
    const cx = W / 2, cy = this.boardY + this.boardSize / 2;
    if (this.phase === 'won') {
      D.text(c, `🎉🎉 ${t('master.tipWin')} 🎉🎉`, cx, cy - 24, { size: 18, weight: 'bold', color: T.win, align: 'center' });
      const labels = [t('master.replayLevel'), t('master.nextLevel')];
      const bw = 100, gap = 10, bx = cx - (bw * 2 + gap) / 2;
      this.button(c, bx, cy + 18, bw, 32, labels[0], false, () => this.retryLevel());
      this.button(c, bx + bw + gap, cy + 18, bw, 32, labels[1], true, () => this.nextLevel());
    } else {
      D.text(c, `👻👻 ${t('master.tipLost')} 👻👻`, cx, cy - 18, { size: 18, weight: 'bold', color: T.lose, align: 'center' });
      this.button(c, cx - 55, cy + 20, 110, 32, t('master.replayLevel'), false, () => this.retryLevel());
    }
  }
  button(c, x, y, w, h, label, primary, onTap) {
    const T = theme.tokens;
    if (primary) { D.fillRoundRect(c, x, y, w, h, 8, T.primary); D.text(c, label, x + w / 2, y + h / 2, { size: 13, weight: 'bold', color: '#fff', align: 'center' }); }
    else { D.strokeRoundRect(c, x, y, w, h, 8, T.god, 1); D.text(c, label, x + w / 2, y + h / 2, { size: 13, weight: 'bold', color: T.god, align: 'center' }); }
    this.addButton('result-' + label, x, y, w, h, onTap);
  }
  drawConfetti(c) {
    confetti.draw(c, this.confetti.concat(this.bursts || []));
  }
  drawFabs(c) {
    const T = theme.tokens;
    const drawOne = (rect, key, fallback, color, onTap, id) => {
      c.save(); c.shadowColor = 'rgba(0,0,0,0.12)'; c.shadowBlur = 10; c.shadowOffsetY = 2;
      D.circle(c, rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, T.card); c.restore();
      if (!icons.draw(c, key, rect.x + rect.w / 2, rect.y + rect.h / 2, 20, color)) D.text(c, fallback, rect.x + rect.w / 2, rect.y + rect.h / 2, { size: 18, color, align: 'center' });
      this.addButton(id, rect.x, rect.y, rect.w, rect.h, onTap);
    };
    drawOne(this.helpFab, 'help', '?', T.text, () => { this.helpOpen = true; }, 'help');
    const muteRect = fabKit.muteSlot(this.helpFab);
    if (muteRect) fabKit.drawMute(this, c, muteRect);
    const key = this.mode === 'poker' ? 'mode-poker' : this.mode === 'mahjong' ? 'mode-mahjong' : 'mode-emoji';
    const fallback = this.mode === 'poker' ? '🃏' : this.mode === 'mahjong' ? '🀄' : '😀';
    drawOne(fabKit.slotLeft(this.helpFab, muteRect ? 2 : 1), key, fallback, T.primary, () => this.toggleMode(), 'mode');
  }
  drawHelp(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(0, 0, W, H);
    const x = 20, w = W - 40;
    const lines = [];
    ['helpMsg', 'help1', 'help2', 'help3', 'help4'].forEach((k) => {
      const v = t('master.' + k);
      if (v !== 'master.' + k) { lines.push(...D.wrapText(c, v, w - 40, 14)); lines.push(''); }
    });
    const lineH = 20;
    const h = Math.min(H - 80, 74 + lines.length * lineH + 62);
    const y = (H - h) / 2;
    D.card(c, x, y, w, h, T);
    D.text(c, '?', x + 24, y + 30, { size: 24, weight: 'bold', color: T.primary });
    D.text(c, t('help'), x + 50, y + 30, { size: 16, weight: 'bold', color: T.text });
    c.save(); D.roundRect(c, x + 1, y + 1, w - 2, h - 2, 14); c.clip();
    let ly = y + 58;
    lines.forEach((line) => { if (line) D.text(c, line, x + 20, ly, { size: 14, color: T.text }); ly += lineH; });
    c.restore();
    this.addButton('help-mask', 0, 0, W, H, () => { this.helpOpen = false; });
    const bw = 110, bx = x + (w - bw) / 2, by = y + h - 44;
    D.fillRoundRect(c, bx, by, bw, 30, 8, T.primary);
    D.text(c, t('master.confirmText'), bx + bw / 2, by + 15, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('help-ok', bx, by, bw, 30, () => { this.helpOpen = false; });
  }
  drawConfirm(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fillRect(0, 0, W, H);
    const w = W - 56;
    const h = 200;
    const x = (W - w) / 2;
    const y = (H - h) / 2;
    D.card(c, x, y, w, h, T);
    D.text(c, t('master.start'), x + 20, y + 34, { size: 17, weight: 'bold', color: T.text });
    D.text(c, t('master.start'), x + 20, y + 66, { size: 14, color: T.muted });
    const gap = 10;
    const bw = (w - 40 - gap * 2) / 3;
    const by = y + h - 48;
    this.addButton('confirm-mask', 0, 0, W, H, () => { this.confirming = false; });
    const button = (bx, label, kind, onTap) => {
      if (kind === 'primary') D.fillRoundRect(c, bx, by, bw, 32, 8, T.primary);
      else if (kind === 'replay') {
        D.fillRoundRect(c, bx, by, bw, 32, 8, T.card);
        D.strokeRoundRect(c, bx, by, bw, 32, 8, T.god, 1);
      } else D.fillRoundRect(c, bx, by, bw, 32, 8, T.enter);
      D.text(c, label, bx + bw / 2, by + 16, {
        size: label.length > 8 ? 11 : 12.5, weight: 'bold',
        color: kind === 'primary' ? '#fff' : kind === 'replay' ? T.god : T.enterColor,
        align: 'center',
      });
      this.addButton(`confirm-${kind}`, bx, by, bw, 32, onTap);
    };
    button(x + 20, t('cancel'), 'cancel', () => { this.confirming = false; });
    button(x + 20 + bw + gap, t('master.replayLevel'), 'replay', () => this.retryLevel());
    button(x + 20 + (bw + gap) * 2, t('confirmOk'), 'ok', () => this.startNewGame());
  }

  onTheme() { this.layout(); }
  onHide() { this.saveState(); }
  onShow() {}
}
module.exports = MasterScene;
