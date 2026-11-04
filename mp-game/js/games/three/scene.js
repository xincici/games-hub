const { W, H, SAFE_BOTTOM } = require('../../core/canvas');
const { Scene } = require('../../core/app');
const theme = require('../../core/theme');
const { t } = require('../../core/i18n');
const { getRaw, setRaw, removeRaw } = require('../../core/storage');
const D = require('../../core/draw');
const ParticleField = require('../../core/particles');
const icons = require('../../core/icons');
const fabKit = require('../../core/fab');
const HEADER = require('../../core/header');
const { drawTimer } = require('../../core/timer');
const i18nDict = require('./i18n');

const coreI18n = require('../../core/i18n');
if (!coreI18n.__threeRegistered) {
  coreI18n.register('three', i18nDict);
  coreI18n.__threeRegistered = true;
}

const BEST_KEY = '__threes_game__best';
const STATE_KEY = '__threes_game__state';
const SIZE = 4;
const PLAY = 'play', LOSE = 'lose';
const DRAG_SLOP = 10;
const DRAG_MIN = 0.5;
const DRAG_COMMIT = 0.95;
const DIRS = { left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] };
const COLORS = {
  1: ['#5694d1', '#fff'], 2: ['#e0564e', '#fff'], 3: ['#efe9dc', '#4a4238'],
  6: ['#8fbe4e', '#4a4238'], 12: ['#e7c24f', '#4a4238'], 24: ['#e1903d', '#4a4238'],
  48: ['#d65c3b', '#fff'], 96: ['#a65c9e', '#fff'], 192: ['#5c68b5', '#fff'],
  384: ['#4e9aa8', '#fff'], 768: ['#6f54a8', '#fff'], 1536: ['#3a4a9e', '#fff'],
  3072: ['#303e7a', '#fff'], 6144: ['#232323', '#fff'],
};
function shuffle(a) { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; }
function compat(a, b) { return (a === 1 && b === 2) || (a === 2 && b === 1) || (a === b && a >= 3); }
function mergeValue(a) { return a >= 3 ? a * 2 : 3; }
function tileScore(v) { return v < 3 ? 0 : 3 ** (Math.log2(v / 3) + 1); }

class ThreeScene extends Scene {
  constructor(app) {
    super(app);
    this.bg = new ParticleField();
    this.tiles = [];
    this.deck = [];
    this.next = 1;
    this.score = 0;
    this.best = +(getRaw(BEST_KEY, 0) || 0);
    this.seconds = 0;
    this.phase = PLAY;
    this.helpOpen = false;
    this.busy = false;
    this.dealing = false;
    this.dealEnd = 0;
    this.pending = null;
    this.tileId = 0;
    this.touch = null;
    this.drag = null;
    this.layout();
    this.boot();
  }
  boot() { if (!this.restore()) this.startGame(); }
  newDeck() { return shuffle([...Array(12).fill(1), ...Array(12).fill(2), ...Array(4).fill(3)]); }
  count(value, board = this.tiles) { return board.reduce((n, t) => n + (t.value === value ? 1 : 0), 0); }
  draw(board = this.tiles) {
    if (!this.deck.length) this.deck = this.newDeck();
    let want = 0;
    const ones = this.count(1, board), twos = this.count(2, board);
    if (ones - twos >= 4) want = 2; else if (twos - ones >= 4) want = 1;
    if (!want) return this.deck.pop();
    let idx = this.deck.lastIndexOf(want);
    if (idx < 0) { this.deck.push(want); idx = this.deck.length - 1; }
    return this.deck.splice(idx, 1)[0];
  }
  balanced(value, board) {
    if (value !== 1 && value !== 2) return value;
    const ones = this.count(1, board), twos = this.count(2, board);
    if (value === 1 && ones - twos >= 4) { this.deck.push(1); return 2; }
    if (value === 2 && twos - ones >= 4) { this.deck.push(2); return 1; }
    return value;
  }
  startGame() {
    this.deck = [];
    this.tiles = [];
    this.tileId = 0;
    this.busy = false;
    this.dealing = false;
    this.dealEnd = 0;
    this.pending = null;
    this.drag = null;
    this.helpOpen = false;
    this.phase = PLAY;
    this.seconds = 0;
    const cells = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) cells.push([r, c]);
    const board = [];
    for (let i = 0; i < 9; i++) {
      const [r, c] = cells.splice(Math.floor(Math.random() * cells.length), 1)[0];
      const value = this.draw(board);
      const tile = { id: ++this.tileId, value, row: r, col: c, dealAt: Date.now() + i * 35 };
      board.push(tile);
    }
    this.tiles = board;
    this.next = this.draw(board);
    this.score = 0;
    this.dealTiles();
    this.dealing = true;
    this.dealEnd = Date.now() + 450;
    removeRaw(STATE_KEY);
    this.save();
  }
  dealTiles() {
    const sorted = [...this.tiles].sort((a, b) => a.row - b.row || a.col - b.col);
    const at = Date.now();
    sorted.forEach((tile, i) => { tile.dealAt = at + i * 40; });
  }
  restore() {
    try {
      const raw = getRaw(STATE_KEY, '');
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.tiles) || !s.tiles.length) return false;
      this.tiles = s.tiles.map(x => ({ ...x, id: ++this.tileId, dealAt: 0 }));
      this.deck = Array.isArray(s.deck) ? s.deck.slice() : [];
      this.next = +s.next || 1;
      this.score = +s.score || 0;
      this.seconds = +s.time || 0;
      this.phase = s.phase === LOSE ? LOSE : PLAY;
      this.dealTiles();
      this.dealing = true;
      this.dealEnd = Date.now() + SIZE * SIZE * 40 + 350;
      return true;
    } catch (e) { return false; }
  }
  save() {
    setRaw(STATE_KEY, JSON.stringify({
      tiles: this.tiles.map(({ row, col, value }) => ({ row, col, value })),
      next: this.next, deck: this.deck, score: this.score, time: this.seconds, phase: this.phase,
    }));
  }
  update(dt) {
    if (this.bg) this.bg.update(dt || 16);
    if (this.dealing && Date.now() >= this.dealEnd) this.dealing = false;
    if (this.phase === PLAY && !this.helpOpen) this.seconds += Math.min(50, dt || 16) / 1000;
    if (this.pending && Date.now() >= this.pending.at) this.finishMove();
  }
  computeMove(dir) {
    const Dirs = { left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] };
    const [dr, dc] = Dirs[dir];
    const key = (r, c) => `${r},${c}`;
    const board = new Map();
    const live = this.tiles.map(t => ({ ...t }));
    live.forEach(t => board.set(key(t.row, t.col), t));
    const placements = [];
    const merges = [];
    let moved = false;
    const order = [...live].sort((a, b) => {
      const da = (b.row * dr + b.col * dc) - (a.row * dr + a.col * dc);
      return da !== 0 ? da : a.id - b.id;
    });
    for (const tile of order) {
      const nr = tile.row + dr, nc = tile.col + dc;
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) { placements.push({ ...tile }); continue; }
      const ahead = board.get(key(nr, nc));
      if (!ahead) {
        board.delete(key(tile.row, tile.col));
        board.set(key(nr, nc), tile);
        tile.row = nr; tile.col = nc; moved = true;
        placements.push({ ...tile });
      } else if (compat(ahead.value, tile.value) && !ahead.mergedThisStep) {
        board.delete(key(tile.row, tile.col));
        tile.row = nr; tile.col = nc;
        ahead.mergedThisStep = true; moved = true;
        placements.push({ ...tile });
        merges.push({ aId: ahead.id, bId: tile.id, row: nr, col: nc, value: mergeValue(ahead.value) });
      } else placements.push({ ...tile });
    }
    return { placements, merges, moved };
  }
  move(dir, startDist) {
    if (this.phase !== PLAY || this.busy || this.dealing || this.helpOpen || !this.tiles.length) return;
    const { placements, merges, moved } = this.computeMove(dir);
    if (!moved) return;
    const now = Date.now();
    this.busy = true;
    this.pending = { placements, merges, dir, at: now + 130 };
    const old = new Map(this.tiles.map(t => [t.id, t]));
    const [dr, dc] = DIRS[dir];
    const fraction = startDist ? Math.max(0, Math.min(1, startDist / (this.cell + this.gap))) : 0;
    this.tiles = placements.map(t => {
      const before = old.get(t.id) || t;
      const moved = before.row !== t.row || before.col !== t.col;
      return {
        ...t,
        fromRow: moved ? before.row + dr * fraction : before.row,
        fromCol: moved ? before.col + dc * fraction : before.col,
        moveAt: now, popAt: 0,
      };
    });
  }
  spawnCell(dir, board) {
    const empty = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!board.some(t => t.row === r && t.col === c)) empty.push([r, c]);
    if (!empty.length) return null;
    const depth = ([r, c]) => dir === 'right' ? c : dir === 'left' ? SIZE - 1 - c : dir === 'down' ? r : SIZE - 1 - r;
    const min = Math.min(...empty.map(depth));
    const pool = empty.filter(p => depth(p) === min);
    return pool[Math.floor(Math.random() * pool.length)];
  }
  finishMove() {
    const { placements, merges, dir } = this.pending;
    this.pending = null;
    const eaten = new Set();
    merges.forEach(m => { eaten.add(m.aId); eaten.add(m.bId); });
    let next = placements.filter(t => !eaten.has(t.id)).map(t => ({ ...t, fromRow: null, fromCol: null, moveAt: 0 }));
    merges.forEach(m => next.push({ id: ++this.tileId, value: m.value, row: m.row, col: m.col, popAt: Date.now(), fromRow: null, fromCol: null, moveAt: 0 }));
    const spot = this.spawnCell(dir, next);
    if (spot) {
      const value = this.balanced(this.next, next);
      next.push({ id: ++this.tileId, value, row: spot[0], col: spot[1], spawnAt: Date.now(), fromRow: null, fromCol: null, moveAt: 0 });
      this.next = this.draw(next);
    }
    this.tiles = next;
    this.score = next.reduce((s, t) => s + tileScore(t.value), 0);
    if (this.score > this.best) { this.best = this.score; setRaw(BEST_KEY, String(this.best)); }
    this.busy = false;
    if (!this.canMove()) {
      this.phase = LOSE;
      this.app.audio.playLose();
    }
    this.save();
  }
  canMove() {
    return ['up', 'down', 'left', 'right'].some(d => this.computeMove(d).moved);
  }
  onTouchStart(p) {
    if (this.phase !== PLAY || this.busy || this.dealing || this.helpOpen) return;
    this.touch = p;
    this.drag = null;
  }
  onTouchMove(p) {
    if (!this.touch || !p || this.phase !== PLAY || this.busy || this.dealing || this.helpOpen) return;
    const dx = p.x - this.touch.x;
    const dy = p.y - this.touch.y;
    if (!this.drag) {
      if (Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      const preview = this.computeMove(dir);
      const movers = new Set();
      const old = new Map(this.tiles.map(t => [t.id, t]));
      preview.placements.forEach((t) => {
        const b = old.get(t.id);
        if (b && (b.row !== t.row || b.col !== t.col)) movers.add(t.id);
      });
      this.drag = { dir, movers, dist: 0 };
    }
    const [dr, dc] = DIRS[this.drag.dir];
    const pitch = this.cell + this.gap;
    let along;
    if (dc) along = dx * dc;
    else along = dy * dr;
    this.drag.dist = Math.max(0, Math.min(pitch, along));
    if (this.drag.dist >= pitch * DRAG_COMMIT) {
      const dir = this.drag.dir;
      const dist = this.drag.dist;
      this.drag = null;
      this.touch = null;
      this.move(dir, dist);
    }
  }
  onTouchEnd(p) {
    if (!this.touch) { this.drag = null; return; }
    const drag = this.drag;
    this.touch = null;
    this.drag = null;
    if (!drag) return;
    const pitch = this.cell + this.gap;
    if (drag.dist >= pitch * DRAG_MIN) this.move(drag.dir, drag.dist);
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
    this.drawPlayHint(c);
    if (!this.helpOpen) this.drawFab(c);
    if (this.helpOpen) this.drawHelp(c);
  }
  // 游戏区下方的一句玩法提示（统一样式见 core/draw.js 的 hintLine）
  drawPlayHint(c) {
    D.hintLine(c, t('three.playHint'), this.boardY + this.boardSize + 16, theme.tokens.muted);
  }

  drawHeader(c) {
    const T = theme.tokens;
    D.text(c, t('three.gameTitle'), W / 2, this.top + this.headerH / 2, { size: 15, weight: 'bold', color: T.text, align: 'center' });
    if (!icons.draw(c, 'home', this.homeRect.x + 20, this.homeRect.y + 20, 24, T.text)) D.text(c, '⌂', this.homeRect.x + 20, this.homeRect.y + 20, { size: 24, color: T.text, align: 'center' });
    this.addButton('home', this.homeRect.x, this.homeRect.y, this.homeRect.w, this.homeRect.h, () => this.app.goHome());
  }
  drawScore(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.scoreY, this.cw, this.scoreH, T);
    const third = this.cw / 3;
    [['three.bestScore', String(this.best)], ['three.nextLabel', String(this.next)], ['three.score', String(this.score)]].forEach(([k, v], i) => {
      if (i) D.divider(c, this.cx + third * i, this.scoreY + this.scoreH / 2, 24, T.border, 1);
      D.text(c, t(k), this.cx + third * (i + 0.5), this.scoreY + 24, { size: 11, color: T.muted, align: 'center' });
      if (i === 1) {
        const nx = this.cx + third * 1.5, ny = this.scoreY + 48;
        const [bg, fg] = COLORS[Math.min(6144, this.next)] || COLORS[6144];
        D.fillRoundRect(c, nx - 16, ny - 16, 32, 32, 7, bg);
        D.text(c, String(this.next), nx, ny, { size: 16, weight: 'bold', color: fg, align: 'center' });
      } else {
        D.text(c, v, this.cx + third * (i + 0.5), this.scoreY + 48, { size: 22, weight: 'bold', color: i === 2 ? T.primary : T.text, align: 'center' });
      }
    });
  }
  drawOptions(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.optY, this.cw, this.optH, T);
    const half = this.cw / 2;
    D.divider(c, this.cx + half, this.optY + this.optH / 2, 24, T.border, 1);
    const secs = Math.floor(this.seconds);
    const time = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    drawTimer(c, 'stopwatch', this.cx + half / 2, this.optY + this.optH / 2, time, { size: 15, color: T.text });
    const label = t('three.start');
    const bw = Math.min(112, D.measure(c, label, 13, 'bold') + 24);
    const bx = this.cx + half + (half - bw) / 2;
    D.fillRoundRect(c, bx, this.optY + 20, bw, 32, 8, T.primary);
    D.text(c, label, bx + bw / 2, this.optY + 36, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('new', bx, this.optY + 20, bw, 32, () => this.startGame());
  }
  tileRect(tile) {
    const now = Date.now();
    const p = tile.moveAt ? Math.min(1, (now - tile.moveAt) / 130) : 1;
    const r = (tile.fromRow != null && tile.moveAt) ? tile.fromRow + (tile.row - tile.fromRow) * p : tile.row;
    const c = (tile.fromCol != null && tile.moveAt) ? tile.fromCol + (tile.col - tile.fromCol) * p : tile.col;
    let x = this.boardX + this.pad + c * (this.cell + this.gap);
    let y = this.boardY + this.pad + r * (this.cell + this.gap);
    if (this.drag && this.drag.movers.has(tile.id)) {
      const [dr, dc] = DIRS[this.drag.dir];
      x += dc * this.drag.dist;
      y += dr * this.drag.dist;
    }
    return { x, y };
  }
  drawBoard(c) {
    const T = theme.tokens;
    D.fillRoundRect(c, this.boardX, this.boardY, this.boardSize, this.boardSize, 14, '#d8d2c5');
    for (let r = 0; r < SIZE; r++) for (let col = 0; col < SIZE; col++) {
      D.fillRoundRect(c, this.boardX + this.pad + col * (this.cell + this.gap), this.boardY + this.pad + r * (this.cell + this.gap), this.cell, this.cell, 7, 'rgba(255,255,255,0.28)');
    }
    const now = Date.now();
    this.tiles.slice().sort((a, b) => {
      const am = this.drag && this.drag.movers.has(a.id) ? 1 : 0;
      const bm = this.drag && this.drag.movers.has(b.id) ? 1 : 0;
      return am - bm;
    }).forEach((tile) => {
      const p = this.tileRect(tile);
      let scale = 1;
      if (tile.popAt) { const age = now - tile.popAt; scale = age < 200 ? 0.6 + 0.5 * (age / 200) : 1; }
      if (tile.spawnAt) scale = Math.min(1, (now - tile.spawnAt) / 160) * 0.8 + 0.2;
      if (tile.dealAt) scale = Math.max(0, Math.min(1, (now - tile.dealAt) / 280));
      if (scale <= 0) return;
      const [bg, fg] = COLORS[Math.min(6144, tile.value)] || COLORS[6144];
      c.save();
      c.translate(p.x + this.cell / 2, p.y + this.cell / 2);
      c.scale(scale, scale);
      D.fillRoundRect(c, -this.cell / 2, -this.cell / 2, this.cell, this.cell, 7, bg);
      const len = String(tile.value).length;
      const size = len >= 4 ? this.cell * 0.24 : len === 3 ? this.cell * 0.28 : this.cell * 0.34;
      D.text(c, String(tile.value), 0, 0, { size, weight: 'bold', color: fg, align: 'center' });
      if (tile.value >= 3) D.text(c, String(tileScore(tile.value)), this.cell / 2 - 5, -this.cell / 2 + 6, { size: this.cell * 0.14, color: fg, align: 'right' });
      c.restore();
    });
    if (this.phase === LOSE) this.drawResult(c);
  }
  drawResult(c) {
    if (!this.resultVisible()) return;
    const T = theme.tokens;
    D.fillRoundRect(c, this.boardX, this.boardY, this.boardSize, this.boardSize, 14, 'rgba(250,248,239,0.9)');
    const cx = W / 2, cy = this.boardY + this.boardSize / 2;
    D.text(c, `👻👻 ${t('three.tipLost')} 👻👻`, cx, cy - 22, { size: 19, weight: 'bold', color: T.lose, align: 'center' });
    D.text(c, `${t('three.score')} ${this.score}`, cx, cy + 8, { size: 14, color: T.muted, align: 'center' });
    const bw = 110;
    D.fillRoundRect(c, cx - bw / 2, cy + 30, bw, 32, 8, T.primary);
    D.text(c, t('three.start'), cx, cy + 46, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('retry', cx - bw / 2, cy + 30, bw, 32, () => this.startGame());
  }
  drawFab(c) {
    const T = theme.tokens, r = this.helpFab;
    c.save(); c.shadowColor = 'rgba(0,0,0,0.12)'; c.shadowBlur = 10; c.shadowOffsetY = 2;
    D.circle(c, r.x + r.w / 2, r.y + r.h / 2, r.w / 2, T.card); c.restore();
    if (!icons.draw(c, 'help', r.x + r.w / 2, r.y + r.h / 2, 20, T.text)) D.text(c, '?', r.x + r.w / 2, r.y + r.h / 2, { size: 18, color: T.text, align: 'center' });
    this.addButton('help', r.x, r.y, r.w, r.h, () => { this.helpOpen = true; });
    fabKit.drawMute(this, c, fabKit.leftSlot(r));
  }
  drawHelp(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(0, 0, W, H);
    const x = 20, w = W - 40;
    const lines = [];
    ['helpMsg', 'help1', 'help2', 'help3', 'help4', 'help5', 'help6'].forEach((k) => {
      const v = t('three.' + k);
      if (v !== 'three.' + k) { lines.push(...D.wrapText(c, v, w - 40, 14)); lines.push(''); }
    });
    const lineH = 19;
    const h = Math.min(H - 70, 74 + lines.length * lineH + 58);
    const y = (H - h) / 2;
    D.card(c, x, y, w, h, T);
    D.text(c, '?', x + 24, y + 30, { size: 24, weight: 'bold', color: T.primary });
    D.text(c, t('help'), x + 50, y + 30, { size: 16, weight: 'bold', color: T.text });
    c.save(); D.roundRect(c, x + 1, y + 1, w - 2, h - 2, 14); c.clip();
    let ly = y + 56;
    lines.forEach((line) => { if (line) D.text(c, line, x + 20, ly, { size: 13, color: T.text }); ly += lineH; });
    c.restore();
    this.addButton('help-mask', 0, 0, W, H, () => { this.helpOpen = false; });
    const bw = 110, bx = x + (w - bw) / 2, by = y + h - 42;
    D.fillRoundRect(c, bx, by, bw, 30, 8, T.primary);
    D.text(c, t('three.confirmText'), bx + bw / 2, by + 15, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('help-ok', bx, by, bw, 30, () => { this.helpOpen = false; });
  }
  onTheme() { this.layout(); }
  onHide() { this.save(); }
  onShow() {}
}
module.exports = ThreeScene;
