const { W, H, SAFE_BOTTOM } = require('../../core/canvas');
const { Scene } = require('../../core/app');
const theme = require('../../core/theme');
const { t } = require('../../core/i18n');
const { getRaw, setRaw, removeRaw } = require('../../core/storage');
const D = require('../../core/draw');
const ParticleField = require('../../core/particles');
const icons = require('../../core/icons');
const HEADER = require('../../core/header');
const { drawTimer } = require('../../core/timer');
const i18nDict = require('./i18n');

const coreI18n = require('../../core/i18n');
if (!coreI18n.__g2048Registered) {
  coreI18n.register('g2048', i18nDict);
  coreI18n.__g2048Registered = true;
}

const BEST_KEY = '__game_2048__best';
const STATE_KEY = '__game_2048__state';
const SIZE = 4;
const WIN_VAL = 2048;
const PLAY = 'play', WON = 'won', OVER = 'over';
const COLORS = {
  2: ['#eee4da', '#776e65'], 4: ['#ede0c8', '#776e65'],
  8: ['#f2b179', '#f9f6f2'], 16: ['#f59563', '#f9f6f2'],
  32: ['#f67c5f', '#f9f6f2'], 64: ['#f65e3b', '#f9f6f2'],
  128: ['#edcf72', '#f9f6f2'], 256: ['#edcc61', '#f9f6f2'],
  512: ['#edc850', '#f9f6f2'], 1024: ['#edc53f', '#f9f6f2'],
  2048: ['#edc22e', '#f9f6f2'],
};

class Game2048Scene extends Scene {
  constructor(app) {
    super(app);
    this.bg = new ParticleField();
    this.tiles = [];
    this.score = 0;
    this.best = +(getRaw(BEST_KEY, 0) || 0);
    this.seconds = 0;
    this.phase = PLAY;
    this.winShown = false;
    this.newBest = false;
    this.helpOpen = false;
    this.confirming = false;
    this.busy = false;
    this.pending = null;
    this.tileId = 0;
    this.dealStart = 0;
    this.touch = null;
    this.layout();
    this.boot();
  }
  boot() {
    if (!this.restore()) this.startGame();
  }
  startGame() {
    this.tiles = [];
    this.score = 0;
    this.seconds = 0;
    this.phase = PLAY;
    this.winShown = false;
    this.newBest = false;
    this.busy = false;
    this.pending = null;
    this.confirming = false;
    this.tileId = 0;
    this.spawnTile();
    this.spawnTile();
    this.score = Math.max(...this.tiles.map(t => t.value));
    this.dealStart = Date.now();
    this.dealTiles();
    removeRaw(STATE_KEY);
    this.save();
  }
  spawnTile() {
    const occupied = new Set(this.tiles.map(t => `${t.row},${t.col}`));
    const cells = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!occupied.has(`${r},${c}`)) cells.push([r, c]);
    if (!cells.length) return;
    const [row, col] = cells[Math.floor(Math.random() * cells.length)];
    this.tiles.push({ id: ++this.tileId, row, col, value: Math.random() < 0.9 ? 2 : 4, spawnAt: Date.now() });
  }
  dealTiles() {
    const at = Date.now();
    const order = this.tiles.slice().sort((a, b) => a.row - b.row || a.col - b.col);
    const rank = new Map(order.map((t, i) => [t.id, i]));
    this.tiles = this.tiles.map(t => ({ ...t, dealAt: at + (rank.get(t.id) || 0) * 45 }));
  }
  restore() {
    try {
      const raw = getRaw(STATE_KEY, '');
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.tiles) || !s.tiles.length) return false;
      this.tiles = s.tiles.map(x => ({ ...x, id: ++this.tileId, spawnAt: 0 }));
      this.score = Math.max(...this.tiles.map(t => t.value));
      this.seconds = +s.time || 0;
      this.winShown = !!s.winShown;
      this.phase = s.result === 'over' ? OVER : PLAY;
      this.dealStart = Date.now();
      this.dealTiles();
      return true;
    } catch (e) { return false; }
  }
  save() {
    setRaw(STATE_KEY, JSON.stringify({
      tiles: this.tiles.map(({ row, col, value }) => ({ row, col, value })),
      score: this.score, time: this.seconds, result: this.phase, winShown: this.winShown,
    }));
  }
  update(dt) {
    if (this.bg) this.bg.update(dt || 16);
    if (this.phase === PLAY && !this.helpOpen) this.seconds += Math.min(50, dt || 16) / 1000;
    if (this.pending && Date.now() >= this.pending.at) this.finishMove();
  }
  lines(dir) {
    const out = [];
    for (let i = 0; i < SIZE; i++) {
      const line = [];
      for (let j = 0; j < SIZE; j++) {
        if (dir === 'left') line.push([i, j]);
        else if (dir === 'right') line.push([i, SIZE - 1 - j]);
        else if (dir === 'up') line.push([j, i]);
        else line.push([SIZE - 1 - j, i]);
      }
      out.push(line);
    }
    return out;
  }
  move(dir) {
    if (this.phase !== PLAY || this.busy || this.helpOpen || this.confirming) return;
    const map = new Map(this.tiles.map(t => [`${t.row},${t.col}`, t]));
    const placements = new Map();
    const merges = [];
    let moved = false;
    this.lines(dir).forEach((line) => {
      const existing = line.map(([r, c]) => map.get(`${r},${c}`)).filter(Boolean);
      const groups = [];
      for (let i = 0; i < existing.length; i++) {
        if (i + 1 < existing.length && existing[i].value === existing[i + 1].value) {
          groups.push([existing[i], existing[i + 1]]); i++;
        } else groups.push([existing[i]]);
      }
      groups.forEach((group, idx) => {
        const [row, col] = line[idx];
        const [first, second] = group;
        if (first.row !== row || first.col !== col) moved = true;
        placements.set(first.id, { row, col });
        if (second) {
          moved = true;
          placements.set(second.id, { row, col });
          merges.push({ ids: [first.id, second.id], value: first.value * 2, row, col });
        }
      });
    });
    if (!moved) return;
    const now = Date.now();
    this.tiles = this.tiles.map((tile) => {
      const pos = placements.get(tile.id);
      return pos ? { ...tile, fromRow: tile.row, fromCol: tile.col, row: pos.row, col: pos.col, moveAt: now, popAt: 0 } : tile;
    });
    this.busy = true;
    this.pending = { merges, at: now + 130 };
  }
  finishMove() {
    const { merges } = this.pending;
    this.pending = null;
    const eaten = new Set();
    merges.forEach(m => m.ids.forEach(id => eaten.add(id)));
    let next = this.tiles.filter(t => !eaten.has(t.id));
    merges.forEach((m) => {
      next.push({ id: ++this.tileId, row: m.row, col: m.col, value: m.value, popAt: Date.now(), fromRow: m.row, fromCol: m.col, moveAt: 0 });
    });
    this.tiles = next;
    this.spawnTile();
    this.busy = false;
    this.score = Math.max(...this.tiles.map(t => t.value));
    if (this.score > this.best) {
      this.best = this.score;
      this.newBest = true;
      setRaw(BEST_KEY, String(this.best));
    }
    if (!this.winShown && this.tiles.some(t => t.value >= WIN_VAL)) {
      this.winShown = true;
      this.phase = WON;
      this.app.audio.playSuccess();
    } else if (this.isDead()) {
      this.phase = OVER;
      this.app.audio.playLose();
    }
    this.save();
  }
  isDead() {
    if (this.tiles.length < SIZE * SIZE) return false;
    const map = new Map(this.tiles.map(t => [`${t.row},${t.col}`, t.value]));
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      const v = map.get(`${r},${c}`);
      if (v === map.get(`${r},${c + 1}`) || v === map.get(`${r + 1},${c}`)) return false;
    }
    return true;
  }
  keepGoing() { this.phase = PLAY; }
  onTouchStart(p) { this.touch = p; }
  onTouchEnd(p) {
    if (!this.touch) return;
    const dx = p.x - this.touch.x;
    const dy = p.y - this.touch.y;
    this.touch = null;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
    if (Math.abs(dx) > Math.abs(dy)) this.move(dx > 0 ? 'right' : 'left');
    else this.move(dy > 0 ? 'down' : 'up');
  }
  layout() {
    this.cw = Math.min(W - 32, 440);
    this.cx = (W - this.cw) / 2;
    this.top = HEADER.TOP;
    this.headerH = HEADER.HEIGHT;
    this.homeRect = { ...HEADER.HOME_RECT };
    this.scoreY = this.top + this.headerH + 6;
    this.scoreH = 72;
    this.optY = this.scoreY + this.scoreH + 16;
    this.optH = 72;
    this.boardY = this.optY + this.optH + 16;
    const reserve = SAFE_BOTTOM + 92;
    const availH = Math.max(160, H - this.boardY - reserve);
    this.boardSize = Math.min(this.cw, availH);
    this.boardX = (W - this.boardSize) / 2;
    this.pad = this.boardSize * 0.025;
    this.gap = this.boardSize * 0.025;
    this.cell = (this.boardSize - this.pad * 2 - this.gap * 3) / 4;
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
    if (!this.helpOpen && !this.confirming) this.drawFab(c);
    if (this.helpOpen) this.drawHelp(c);
    if (this.confirming) this.drawConfirm(c);
  }
  drawHeader(c) {
    const T = theme.tokens;
    D.text(c, t('g2048.gameTitle'), W / 2, this.top + this.headerH / 2, { size: 15, weight: 'bold', color: T.text, align: 'center' });
    if (!icons.draw(c, 'home', this.homeRect.x + 20, this.homeRect.y + 20, 24, T.text)) D.text(c, '⌂', this.homeRect.x + 20, this.homeRect.y + 20, { size: 24, color: T.text, align: 'center' });
    this.addButton('home', this.homeRect.x, this.homeRect.y, this.homeRect.w, this.homeRect.h, () => this.app.goHome());
  }
  drawScore(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.scoreY, this.cw, this.scoreH, T);
    const half = this.cw / 2;
    D.divider(c, this.cx + half, this.scoreY + this.scoreH / 2, 24, T.border, 1);
    D.text(c, t('g2048.bestScore'), this.cx + half / 2, this.scoreY + 24, { size: 12, color: T.muted, align: 'center' });
    D.text(c, String(this.best), this.cx + half / 2, this.scoreY + 48, { size: 22, weight: 'bold', color: T.text, align: 'center' });
    D.text(c, t('g2048.score'), this.cx + half + half / 2, this.scoreY + 24, { size: 12, color: T.muted, align: 'center' });
    D.text(c, String(this.score), this.cx + half + half / 2, this.scoreY + 48, { size: 22, weight: 'bold', color: T.primary, align: 'center' });
  }
  drawOptions(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.optY, this.cw, this.optH, T);
    const half = this.cw / 2;
    D.divider(c, this.cx + half, this.optY + this.optH / 2, 24, T.border, 1);
    const secs = Math.floor(this.seconds);
    const time = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    drawTimer(c, 'stopwatch', this.cx + half / 2, this.optY + this.optH / 2, time, { size: 15, color: T.text });
    const label = t('g2048.start');
    const bw = Math.min(112, D.measure(c, label, 13, 'bold') + 24);
    const bx = this.cx + half + (half - bw) / 2;
    D.fillRoundRect(c, bx, this.optY + 20, bw, 32, 8, T.primary);
    D.text(c, label, bx + bw / 2, this.optY + 36, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('new', bx, this.optY + 20, bw, 32, () => this.startGame());
  }
  tileRect(tile, p) {
    const row = tile.fromRow != null && tile.moveAt ? tile.fromRow + (tile.row - tile.fromRow) * p : tile.row;
    const col = tile.fromCol != null && tile.moveAt ? tile.fromCol + (tile.col - tile.fromCol) * p : tile.col;
    return {
      x: this.boardX + this.pad + col * (this.cell + this.gap),
      y: this.boardY + this.pad + row * (this.cell + this.gap),
      w: this.cell, h: this.cell,
    };
  }
  drawBoard(c) {
    const T = theme.tokens;
    D.fillRoundRect(c, this.boardX, this.boardY, this.boardSize, this.boardSize, 14, '#bbada0');
    for (let r = 0; r < SIZE; r++) for (let col = 0; col < SIZE; col++) {
      D.fillRoundRect(c, this.boardX + this.pad + col * (this.cell + this.gap), this.boardY + this.pad + r * (this.cell + this.gap), this.cell, this.cell, 6, 'rgba(238,228,218,0.35)');
    }
    const now = Date.now();
    this.tiles.forEach((tile) => {
      const p = tile.moveAt ? Math.min(1, (now - tile.moveAt) / 130) : 1;
      const r = this.tileRect(tile, p);
      let scale = 1;
      if (tile.popAt) { const age = now - tile.popAt; scale = age < 190 ? 0.5 + 0.66 * (age / 190) : 1; }
      if (tile.spawnAt) scale = Math.min(1, (now - tile.spawnAt) / 180) * 0.8 + 0.2;
      if (tile.dealAt) scale = Math.max(0, Math.min(1, (now - tile.dealAt) / 280));
      if (scale <= 0) return;
      c.save();
      c.translate(r.x + r.w / 2, r.y + r.h / 2);
      c.scale(scale, scale);
      const [bg, fg] = COLORS[Math.min(2048, tile.value)] || COLORS[2048];
      D.fillRoundRect(c, -r.w / 2, -r.h / 2, r.w, r.h, 6, bg);
      const len = String(tile.value).length;
      const size = len <= 2 ? r.w * 0.42 : len === 3 ? r.w * 0.34 : r.w * 0.27;
      D.text(c, String(tile.value), 0, 0, { size, weight: 'bold', color: fg, align: 'center' });
      c.restore();
    });
    if (this.phase === WON || this.phase === OVER) this.drawResult(c);
  }
  drawResult(c) {
    if (!this.resultVisible()) return;
    const T = theme.tokens;
    D.fillRoundRect(c, this.boardX, this.boardY, this.boardSize, this.boardSize, 14, 'rgba(250,248,239,0.88)');
    const cx = W / 2, cy = this.boardY + this.boardSize / 2;
    if (this.phase === WON) {
      D.text(c, `🎉🎉 ${t('g2048.tipWin')} 🎉🎉`, cx, cy - 38, { size: 20, weight: 'bold', color: T.win, align: 'center' });
      if (this.newBest) D.text(c, t('g2048.newBest'), cx, cy - 8, { size: 13, color: T.muted, align: 'center' });
      const bw = 120;
      D.fillRoundRect(c, cx - bw / 2, cy + 22, bw, 34, 8, T.primary);
      D.text(c, t('g2048.keepGoing'), cx, cy + 39, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
      this.addButton('keep-going', cx - bw / 2, cy + 22, bw, 34, () => this.keepGoing());
    } else {
      D.text(c, `👻👻 ${t('g2048.tipLost')} 👻👻`, cx, cy - 26, { size: 20, weight: 'bold', color: T.lose, align: 'center' });
      D.text(c, `${t('g2048.score')} ${this.score}`, cx, cy + 4, { size: 14, color: T.muted, align: 'center' });
      const bw = 104;
      D.fillRoundRect(c, cx - bw / 2, cy + 26, bw, 32, 8, T.primary);
      D.text(c, t('g2048.start'), cx, cy + 42, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
      this.addButton('retry', cx - bw / 2, cy + 26, bw, 32, () => this.startGame());
    }
  }
  drawFab(c) {
    const T = theme.tokens;
    const r = this.helpFab;
    c.save(); c.shadowColor = 'rgba(0,0,0,0.12)'; c.shadowBlur = 10; c.shadowOffsetY = 2;
    D.circle(c, r.x + r.w / 2, r.y + r.h / 2, r.w / 2, T.card); c.restore();
    if (!icons.draw(c, 'help', r.x + r.w / 2, r.y + r.h / 2, 20, T.text)) D.text(c, '?', r.x + r.w / 2, r.y + r.h / 2, { size: 18, color: T.text, align: 'center' });
    this.addButton('help', r.x, r.y, r.w, r.h, () => { this.helpOpen = true; });
  }
  drawHelp(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(0, 0, W, H);
    const x = 20, w = W - 40;
    const lines = [];
    ['helpMsg', 'help1', 'help2', 'help3'].forEach((k) => {
      const v = t('g2048.' + k);
      if (v !== 'g2048.' + k) { lines.push(...D.wrapText(c, v, w - 40, 14)); lines.push(''); }
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
    D.text(c, t('g2048.confirmText'), bx + bw / 2, by + 15, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('help-ok', bx, by, bw, 30, () => { this.helpOpen = false; });
  }
  drawConfirm(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(0, 0, W, H);
    const w = W - 56, h = 190, x = (W - w) / 2, y = (H - h) / 2;
    D.card(c, x, y, w, h, T);
    D.text(c, t('g2048.start'), x + 20, y + 34, { size: 17, weight: 'bold', color: T.text });
    D.text(c, t('g2048.start'), x + 20, y + 64, { size: 14, color: T.muted });
    const gap = 12, bw = (w - 40 - gap) / 2, by = y + h - 48;
    this.addButton('confirm-mask', 0, 0, W, H, () => { this.confirming = false; });
    D.fillRoundRect(c, x + 20, by, bw, 32, 8, T.enter);
    D.text(c, '取消', x + 20 + bw / 2, by + 16, { size: 13, weight: 'bold', color: T.text, align: 'center' });
    this.addButton('confirm-cancel', x + 20, by, bw, 32, () => { this.confirming = false; });
    D.fillRoundRect(c, x + 20 + bw + gap, by, bw, 32, 8, T.primary);
    D.text(c, '确定', x + 20 + bw + gap + bw / 2, by + 16, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('confirm-ok', x + 20 + bw + gap, by, bw, 32, () => this.startGame());
  }
  onTheme() { this.layout(); }
  onHide() { this.save(); }
  onShow() {}
}
module.exports = Game2048Scene;
