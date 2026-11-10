// 单人麻将 · 微信小游戏场景（canvas 2D）。
// 玩法与视觉基准是 web `src/games/solo/SoloGame.vue`；纯逻辑在 ./board.js，文案在 ./i18n.js。
// 存档 key 与 web / 小程序完全一致：__solo__state / __solo__streak / __solo__best_streak。
const { W, H, SAFE_BOTTOM } = require('../../core/canvas');
const share = require('../../core/share');
const { Scene } = require('../../core/app');
const theme = require('../../core/theme');
const { t } = require('../../core/i18n');
const { getRaw, setRaw } = require('../../core/storage');
const D = require('../../core/draw');
const ParticleField = require('../../core/particles');
const icons = require('../../core/icons');
const fabKit = require('../../core/fab');
const cards = require('../../core/cards');
const HEADER = require('../../core/header');
const confetti = require('../../core/confetti');
const achv = require('../../core/achv');
const board = require('./board');
const i18nDict = require('./i18n');

const coreI18n = require('../../core/i18n');
if (!coreI18n.__soloRegistered) {
  coreI18n.register('solo', i18nDict);
  coreI18n.__soloRegistered = true;
}

const PLAY = 'play';
const ENDING = 'ending';       // 最后一张摸完、等 350ms 判负（这段时间不接受出牌）
const CELEBRATE = 'celebrate'; // 胡牌收尾：先排序，再逐张跳，最后才出结算层
const WON = 'won';
const LOST = 'lost';

const STATE_KEY = '__solo__state';
const STREAK_KEY = '__solo__streak';
const BEST_KEY = '__solo__best_streak';

const HAND_COLS = 7;
const HAND_GAP = 5;
const DISCARD_W = 19;
const DISCARD_H = 24;
const DISCARD_GAP = 2;
const WALL_COLS = 10;
const WALL_BACK_W = 24;
const WALL_BACK_H = 31;
const WALL_STEP = WALL_BACK_W + 2;
const WALL_LAYER_DX = 2;
const WALL_LAYER_DY = 4;

const DEAL_STEP = 32;
const DEAL_MS = 300;
const DISCARD_FLY_MS = 320;
const DRAW_FLY_MS = 360;
const DRAW_DELAY_MS = DISCARD_FLY_MS + 20;
const CELEBRATE_STEP = 55;
const CELEBRATE_MS = 420;
const LOSE_DELAY = 350;
const FAB_SIZE = 48;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const easeOut = p => 1 - Math.pow(1 - p, 3);
const validTile = t => !!t && typeof t === 'object'
  && ['m', 's', 'p', 'z'].includes(t.suit)
  && Number.isInteger(t.value) && t.value >= 1 && t.value <= (t.suit === 'z' ? 7 : 9)
  && Number.isInteger(t.id) && t.id > 0;
const readInt = (key, dflt = 0) => {
  const v = Number(getRaw(key, dflt));
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : dflt;
};
const copyTile = t => ({ suit: t.suit, value: t.value, id: t.id });

// 胡牌时每张牌挨个跳一下：总时长 420ms，35% 到最高 -10px，70% 回到 0。
function bounceOffset(age) {
  if (!Number.isFinite(age) || age < 0 || age >= CELEBRATE_MS) return 0;
  const p = age / CELEBRATE_MS;
  if (p < 0.35) return -10 * (p / 0.35);
  if (p < 0.70) return -10 * (1 - (p - 0.35) / 0.35);
  return 0;
}

class SoloScene extends Scene {
  constructor(app) {
    super(app);
    this.bg = new ParticleField();

    // ---------- 状态：恢复要用到的字段必须先声明 ----------
    this.hand = [];
    this.wall = [];
    this.discards = [];
    this.drawnId = null;
    this.omitSuit = null;
    this.phase = PLAY;
    this.helpOpen = false;
    this.confirming = false;
    this.flights = [];
    this.winPending = null;
    this.loseAt = 0;
    this.pausedAt = 0;
    this.pendingRestoreDraw = false;
    this.nextId = 1;

    this.now = Date.now();
    this.dealStart = 0;
    this.confetti = [];
    this.confettiUntil = 0;
    this.lastConfettiAt = 0;

    this.streak = readInt(STREAK_KEY, 0);
    this.best = readInt(BEST_KEY, 0);
    if (this.best < this.streak) this.best = this.streak;

    this.layout();
    const restored = this.restore();
    if (!restored) {
      this.dealRound();
    } else {
      // 恢复存档后必须重新布局（PITFALLS 第 9 条）；13 张的中间态补一次摸牌。
      this.layout();
      if (this.pendingRestoreDraw) this.resolvePendingDraw();
      if (this.phase === PLAY) this.startDealWave();
    }
  }

  // ---------- storage ----------
  save() {
    const phase = this.phase === WON ? WON : this.phase === LOST ? LOST : PLAY;
    try {
      setRaw(STATE_KEY, JSON.stringify({
        hand: this.hand,
        wall: this.wall,
        discards: this.discards,
        omit: this.omitSuit,
        drawnId: this.drawnId,
        phase,
      }));
    } catch (e) { /* 隐私模式 / 存储满时忽略 */ }
  }

  restore() {
    try {
      const raw = getRaw(STATE_KEY, '');
      if (!raw) return false;
      const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!s || !Array.isArray(s.hand) || !Array.isArray(s.wall)) return false;
      // 14 张，或 13 张（刚打出一张、自动补摸还没落盘的那一瞬间）。
      if (s.hand.length !== board.HAND_SIZE && s.hand.length !== board.HAND_SIZE - 1) return false;
      const discards = Array.isArray(s.discards) ? s.discards.filter(validTile) : [];
      const all = [...s.hand, ...s.wall, ...discards];
      if (!all.every(validTile)) return false;
      const seen = new Set();
      for (const tile of all) {
        if (seen.has(tile.id)) return false;
        seen.add(tile.id);
      }
      this.hand = s.hand.map(copyTile);
      this.wall = s.wall.map(copyTile);
      this.discards = discards.map(copyTile);
      this.drawnId = Number.isInteger(s.drawnId) ? s.drawnId : null;
      this.phase = s.phase === WON ? WON : s.phase === LOST ? LOST : PLAY;
      this.omitSuit = ['m', 's', 'p'].includes(s.omit) ? s.omit : null;
      this.nextId = Math.max(1, ...all.map(tile => tile.id)) + 1;
      this.pendingRestoreDraw = this.phase === PLAY && this.hand.length === board.HAND_SIZE - 1;
      return true;
    } catch (e) {
      return false;
    }
  }

  resolvePendingDraw() {
    this.pendingRestoreDraw = false;
    if (!this.wall.length) {
      this.lose(true);
      return;
    }
    const next = this.wall.shift();
    this.hand.push(next);
    this.drawnId = next.id;
    this.draws = (this.draws || 0) + 1;
    if (board.isWin(this.hand)) {
      this.beginWin();
      return;
    }
    this.save();
  }

  // ---------- 新一局 ----------
  takeTile(tile) {
    return { suit: tile.suit, value: tile.value, id: this.nextId++ };
  }

  dealRound() {
    const r = board.newRoundSafe(Math.random, this.streak);
    this.hand = board.sortTiles(r.hand.map(tile => this.takeTile(tile)));
    this.wall = r.wall.map(tile => this.takeTile(tile));
    this.discards = [];
    this.drawnId = null;
    this.omitSuit = r.omitted;
    this.phase = PLAY;
    this.helpOpen = false;
    this.confirming = false;
    this.flights = [];
    this.winPending = null;
    this.loseAt = 0;
    this.pausedAt = 0;
    this.confetti = [];
    this.confettiUntil = 0;
    this.lastConfettiAt = 0;
    this.layout();
    this.save();
    this.startDealWave();
  }

  startDealWave() {
    this.dealStart = this.now;
  }

  onNewGame() {
    if (this.streak > 0) this.confirming = true;
    else this.dealRound();
  }

  startNewGame() {
    this.confirming = false;
    this.streak = 0;
    setRaw(STREAK_KEY, '0');
    this.dealRound();
  }

  // ---------- 出牌 → 自动摸牌 ----------
  displayItems() {
    const drawn = this.hand.find(tile => tile.id === this.drawnId);
    const rest = board.sortTiles(this.hand.filter(tile => tile.id !== this.drawnId));
    return drawn ? rest.concat([drawn]) : rest;
  }

  isDrawFlying(id) {
    return this.flights.some(f => f.kind === 'draw' && f.tileId === id);
  }

  isDiscardFlying(id) {
    return this.flights.some(f => f.kind === 'discard' && f.tileId === id);
  }

  onTileTap(tile) {
    if (this.phase !== PLAY || this.helpOpen || this.confirming) return;
    if (!tile || this.isDrawFlying(tile.id)) return;
    const display = this.displayItems();
    const index = display.findIndex(item => item.id === tile.id);
    if (index < 0) return;

    // 上一次摸牌的飞行替身：新操作优先，直接把旧替身收掉，手牌立刻显示正确顺序。
    // 这就是「不要锁整盘」的实现：只让正在飞的那一张暂时点不到，其余 13 张随时可打。
    this.flights = this.flights.filter(f => f.kind !== 'draw');

    const from = this.handSlotRect(index);
    const to = this.discardSlotRect(this.discards.length);
    this.hand = this.hand.filter(item => item.id !== tile.id);
    this.discards = this.discards.concat([tile]);
    this.drawnId = null;
    this.flights.push({
      kind: 'discard', tileId: tile.id, tile, from, to, start: this.now, dur: DISCARD_FLY_MS,
    });

    if (!this.wall.length) {
      this.save();
      this.queueLose();
      return;
    }

    // 摸牌起点用**一张牌背**，不是整摞牌墙：否则飞出来的牌会看起来被放大。
    const anchor = this.wallBackRect(this.wall.length - 1);
    const next = this.wall[0];
    this.wall = this.wall.slice(1);
    this.hand = this.hand.concat([next]);
    this.drawnId = next.id;
    this.draws = (this.draws || 0) + 1;
    const targetIndex = this.displayItems().findIndex(item => item.id === next.id);
    const target = this.handSlotRect(targetIndex);
    this.flights.push({
      kind: 'draw', tileId: next.id, tile: next, from: anchor, to: target,
      start: this.now + DRAW_DELAY_MS, dur: DRAW_FLY_MS,
    });
    this.save();

    if (board.isWin(this.hand)) {
      this.beginWin();
      return;
    }
    if (!this.wall.length) this.queueLose();
  }

  beginWin() {
    this.phase = CELEBRATE;
    this.loseAt = 0;
    const drawEnd = this.flights.reduce(
      (max, f) => (f.kind === 'draw' ? Math.max(max, f.start + f.dur) : max),
      this.now,
    );
    // 先等摸牌落位，再排序 → 逐张跳 → 结算层。
    this.winPending = { at: drawEnd + 40, sorted: false, bounceStart: 0 };
    this.save();
  }

  queueLose() {
    if (this.phase !== PLAY) return;
    this.phase = ENDING;
    this.loseAt = this.now + LOSE_DELAY;
  }

  lose(silent) {
    if (this.phase === LOST || this.phase === WON) return;
    this.phase = LOST;
    this.streak = 0;
    setRaw(STREAK_KEY, '0');
    this.save();
    if (!silent) this.app.audio.playLose();
  }

  finishWin(playSound) {
    if (this.phase !== CELEBRATE) return;
    this.phase = WON;
    this.streak += 1;
    // 5 次摸牌内自摸：手气好，单独计一次
    achv.win('solo', { fast: this.draws > 0 && this.draws <= 5 });
    achv.peak('solo', 'streak', this.streak);
    if (this.streak > this.best) this.best = this.streak;
    setRaw(STREAK_KEY, String(this.streak));
    setRaw(BEST_KEY, String(this.best));
    this.save();
    this.startConfetti();
    if (playSound !== false) this.app.audio.playSuccess();
  }

  startConfetti() {
    this.confetti = [];
    this.confettiUntil = this.now + 1100;
    this.lastConfettiAt = 0;
  }

  emitConfetti() {
    confetti.spawn(this.confetti, { W, H, startY: H * 0.58, scoreY: this.scoreY });
  }

  // ---------- 动画时间线 ----------
  shiftTime(ms) {
    if (!ms) return;
    this.flights.forEach((f) => { f.start += ms; });
    if (this.winPending) {
      this.winPending.at += ms;
      if (this.winPending.bounceStart) this.winPending.bounceStart += ms;
    }
    if (this.loseAt) this.loseAt += ms;
    if (this.dealStart) this.dealStart += ms;
    if (this.confettiUntil) this.confettiUntil += ms;
    if (this.lastConfettiAt) this.lastConfettiAt += ms;
  }

  update(dt) {
    this.now = Date.now();
    if (this.bg) this.bg.update(dt || 16);

    // modal 打开期间冻结游戏逻辑（PITFALLS 第 32 条）；关闭时把动画时间整体后移。
    if (this.helpOpen || this.confirming) {
      this.pausedAt = this.now;
      return;
    }
    if (this.pausedAt) {
      this.shiftTime(this.now - this.pausedAt);
      this.pausedAt = 0;
    }

    this.flights = this.flights.filter(f => this.now - f.start < f.dur);

    if (this.loseAt && this.now >= this.loseAt) {
      this.loseAt = 0;
      this.lose();
    }

    if (this.winPending) {
      const wp = this.winPending;
      if (!wp.sorted && this.now >= wp.at) {
        this.drawnId = null;      // 手牌排整齐，刚摸的那张归位
        wp.sorted = true;
        wp.bounceStart = this.now;
        this.save();
      }
      if (wp.sorted && this.now >= wp.bounceStart
        + CELEBRATE_STEP * Math.max(0, this.hand.length - 1) + CELEBRATE_MS) {
        this.winPending = null;
        this.finishWin();
      }
    }

    if (this.now < this.confettiUntil && this.now - this.lastConfettiAt >= 40) {
      this.lastConfettiAt = this.now;
      this.emitConfetti();
    }
    this.confetti = confetti.update(this.confetti, dt || 16, H);
  }

  // ---------- layout ----------
  layout() {
    this.cw = Math.min(W - 32, 440);
    this.cx = (W - this.cw) / 2;
    this.top = HEADER.TOP;
    this.headerH = HEADER.HEIGHT;
    this.homeRect = { ...HEADER.HOME_RECT };
    this.scoreY = this.top + this.headerH + 12;
    this.scoreH = 72;
    this.optY = this.scoreY + this.scoreH + 12;
    this.optH = 64;

    this.fabSize = FAB_SIZE;
    this.helpFab = {
      x: W - 16 - FAB_SIZE,
      y: H - SAFE_BOTTOM - 16 - FAB_SIZE,
      w: FAB_SIZE,
      h: FAB_SIZE,
    };

    this.handTileW = Math.max(32, Math.floor(
      (this.cw - 16 - (HAND_COLS - 1) * HAND_GAP) / HAND_COLS,
    ));
    this.handTileH = Math.round(this.handTileW * cards.ratio(cards.MODE_MAHJONG));
    this.handH = this.handTileH * 2 + HAND_GAP + 16;

    let wallH = 88;
    let discardH = 100;
    let gap = 12;
    const gameTop = this.optY + this.optH + 12;
    const contentBottom = H - SAFE_BOTTOM - 72;   // 给右下 FAB 留一行
    const totalHeight = () => wallH + gap + discardH + gap + this.handH;
    if (gameTop + totalHeight() > contentBottom) {
      wallH = 80;
      discardH = 96;
      gap = 10;
    }
    // 极窄 / 极矮的机器：只缩手牌，不挤掉卡片。
    while (gameTop + totalHeight() > contentBottom && this.handTileW > 32) {
      this.handTileW -= 2;
      this.handTileH = Math.round(this.handTileW * cards.ratio(cards.MODE_MAHJONG));
      this.handH = this.handTileH * 2 + HAND_GAP + 16;
    }

    this.wallH = wallH;
    this.discardH = discardH;
    this.gap = gap;
    this.wallY = gameTop;
    this.discardY = this.wallY + wallH + gap;
    this.handY = this.discardY + discardH + gap;
    this.handBottom = this.handY + this.handH;
    this.discardPerRow = Math.max(1, Math.floor(
      (this.cw - 16 + DISCARD_GAP) / (DISCARD_W + DISCARD_GAP),
    ));
  }

  handSlotRect(index) {
    const col = index % HAND_COLS;
    const row = Math.floor(index / HAND_COLS);
    return {
      x: this.cx + 8 + col * (this.handTileW + HAND_GAP),
      y: this.handY + 8 + row * (this.handTileH + HAND_GAP),
      w: this.handTileW,
      h: this.handTileH,
    };
  }

  discardSlotRect(index) {
    const col = index % this.discardPerRow;
    const row = Math.floor(index / this.discardPerRow);
    return {
      x: this.cx + 8 + col * (DISCARD_W + DISCARD_GAP),
      y: this.discardY + 18 + row * (DISCARD_H + DISCARD_GAP),
      w: DISCARD_W,
      h: DISCARD_H,
    };
  }

  wallStackRect() {
    const count = this.wall.length;
    const layers = Math.max(1, Math.ceil(count / WALL_COLS));
    const w = Math.min(count, WALL_COLS) * WALL_STEP + (layers - 1) * WALL_LAYER_DX;
    const h = WALL_BACK_H + (layers - 1) * WALL_LAYER_DY + 3;
    return {
      x: this.cx + 10,
      y: this.wallY + (this.wallH - h) / 2,
      w,
      h,
      layers,
    };
  }

  wallBackRect(index) {
    const stack = this.wallStackRect();
    const col = index % WALL_COLS;
    const layer = Math.floor(index / WALL_COLS);
    return {
      x: stack.x + col * WALL_STEP + layer * WALL_LAYER_DX,
      y: stack.y + (stack.layers - 1 - layer) * WALL_LAYER_DY,
      w: WALL_BACK_W,
      h: WALL_BACK_H,
    };
  }

  dealProgress(rank) {
    if (!this.dealStart) return 1;
    return clamp((this.now - this.dealStart - rank * DEAL_STEP) / DEAL_MS, 0, 1);
  }

  omitLabel() {
    if (!this.omitSuit) return '';
    return t('solo.omit') + t(`solo.suit${this.omitSuit.toUpperCase()}`);
  }

  // ---------- render ----------
  render(c) {
    this.buttons = [];
    const T = theme.tokens;
    c.fillStyle = T.bg;
    c.fillRect(0, 0, W, H);
    if (this.bg) this.bg.draw(c, theme.dark);

    this.drawHeader(c, T);
    this.drawScore(c, T);
    this.drawOptions(c, T);
    this.drawWall(c, T);
    this.drawDiscards(c, T);
    this.drawHand(c, T);
    this.drawFlights(c);
    if (this.phase === WON || this.phase === LOST) this.drawResult(c, T);
    if (!this.helpOpen && !this.confirming) this.drawFabs(c, T);
    this.drawConfetti(c);
    if (this.helpOpen) this.drawHelp(c, T);
    if (this.confirming) this.drawConfirm(c, T);
  }

  drawHeader(c, T) {
    D.text(c, t('solo.gameTitle'), W / 2, this.top + this.headerH / 2, {
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

  drawScore(c, T) {
    D.card(c, this.cx, this.scoreY, this.cw, this.scoreH, T);
    const statW = this.cw / 3;
    const stats = [
      [t('solo.bestStreak'), this.best],
      [t('solo.streak'), this.streak],
      [t('solo.wall'), this.wall.length],
    ];
    stats.forEach(([label, value], i) => {
      if (i) D.divider(c, this.cx + statW * i, this.scoreY + this.scoreH / 2, 24, T.border, 1);
      const x = this.cx + statW * (i + 0.5);
      D.text(c, label, x, this.scoreY + 25, { size: 12, color: T.muted, align: 'center' });
      D.text(c, String(value), x, this.scoreY + 49, { size: 22, weight: 'bold', color: T.text, align: 'center' });
    });
  }

  drawOptions(c, T) {
    D.card(c, this.cx, this.optY, this.cw, this.optH, T);
    const midX = this.cx + this.cw / 2;
    D.divider(c, midX, this.optY + this.optH / 2, 24, T.border, 1);

    const omit = this.omitLabel();
    if (omit) {
      D.text(c, omit, this.cx + this.cw / 4, this.optY + this.optH / 2, {
        size: 13, color: T.muted, align: 'center',
      });
    }

    const label = t('solo.start');
    const bw = Math.min(140, D.measure(c, label, 13, 'bold') + 26);
    const bx = midX + (this.cw / 2 - bw) / 2;
    const by = this.optY + (this.optH - 32) / 2;
    D.fillRoundRect(c, bx, by, bw, 32, 8, T.primary);
    D.text(c, label, bx + bw / 2, by + 16, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('new', bx, by, bw, 32, () => this.onNewGame());
  }

  drawWall(c, T) {
    D.card(c, this.cx, this.wallY, this.cw, this.wallH, T);
    const stack = this.wallStackRect();
    const count = this.wall.length;
    for (let i = 0; i < count; i++) {
      const p = this.dealProgress(Math.min(i, 18));
      if (p <= 0) continue;
      const col = i % WALL_COLS;
      const layer = Math.floor(i / WALL_COLS);
      const x = stack.x + col * WALL_STEP + layer * WALL_LAYER_DX;
      const y = stack.y + (stack.layers - 1 - layer) * WALL_LAYER_DY;
      const e = easeOut(p);
      c.save();
      c.globalAlpha = p;
      c.translate(x + WALL_BACK_W / 2, y + WALL_BACK_H / 2);
      c.scale(0.75 + 0.25 * e, 0.75 + 0.25 * e);
      cards.draw(c, null, cards.MODE_MAHJONG, -WALL_BACK_W / 2, -WALL_BACK_H / 2, WALL_BACK_W, WALL_BACK_H, false);
      c.restore();
    }

  }

  drawDiscards(c, T) {
    D.card(c, this.cx, this.discardY, this.cw, this.discardH, T);
    // 文案在出牌区内部顶部常驻。
    D.text(c, t('solo.hint'), W / 2, this.discardY + 11, {
      size: 10.5, color: T.muted, align: 'center',
    });
    this.discards.forEach((tile, i) => {
      if (this.isDiscardFlying(tile.id)) return;
      const r = this.discardSlotRect(i);
      cards.draw(c, tile, cards.MODE_MAHJONG, r.x, r.y, r.w, r.h, true);
    });
  }

  drawHand(c, T) {
    D.card(c, this.cx, this.handY, this.cw, this.handH, T);
    const items = this.displayItems();
    const celebrating = this.phase === CELEBRATE && this.winPending && this.winPending.sorted;
    items.forEach((tile, i) => {
      if (this.isDrawFlying(tile.id)) return;   // 摸牌飞行期间由替身顶着，落点实体先藏起来
      const r = this.handSlotRect(i);
      const row = Math.floor(i / HAND_COLS);
      const col = i % HAND_COLS;
      const p = this.dealProgress(row * HAND_COLS + col);   // 行优先：先左上后右下
      if (p <= 0) return;
      let dy = -(1 - easeOut(p)) * 10;
      let scale = 0.4 + 0.6 * easeOut(p);
      let alpha = p;
      if (p >= 1) { dy = 0; scale = 1; alpha = 1; }
      if (celebrating) {
        const age = this.now - this.winPending.bounceStart - i * CELEBRATE_STEP;
        dy += bounceOffset(age);
      }

      c.save();
      c.globalAlpha = alpha;
      c.translate(r.x + r.w / 2, r.y + r.h / 2 + dy);
      c.scale(scale, scale);
      cards.draw(c, tile, cards.MODE_MAHJONG, -r.w / 2, -r.h / 2, r.w, r.h, true);
      c.restore();

      // 刚摸到的那张先停在最右：给一圈主色描边，打出一张后自动归位。
      if (tile.id === this.drawnId && this.phase === PLAY && p >= 1) {
        D.strokeRoundRect(c, r.x - 1.5, r.y - 1.5 + dy, r.w + 3, r.h + 3, 10, T.primary, 1.5);
      }

      if (this.phase === PLAY && p >= 0.92 && !this.helpOpen && !this.confirming) {
        this.addButton('hand-' + tile.id, r.x, r.y, r.w, r.h, () => this.onTileTap(tile));
      }
    });
  }

  drawFlights(c) {
    this.flights.forEach((f) => {
      const p = clamp((this.now - f.start) / f.dur, 0, 1);
      if (p <= 0) return;
      const e = easeOut(p);
      const x = f.from.x + (f.to.x - f.from.x) * e;
      const y = f.from.y + (f.to.y - f.from.y) * e;
      const w = f.from.w + (f.to.w - f.from.w) * e;
      const h = f.from.h + (f.to.h - f.from.h) * e;
      c.save();
      c.globalAlpha = 0.96;
      cards.draw(c, f.tile, cards.MODE_MAHJONG, x, y, w, h, true);
      c.restore();
    });
  }

  drawResult(c, T) {
    if (!this.resultVisible()) return;
    const win = this.phase === WON;
    const top = this.wallY;
    const height = this.handBottom - top;
    share.resultPanel(c, this, top, height);
    const cy = top + height / 2;
    D.text(c, (win ? '🎉 ' : '🀄 ') + t(win ? 'solo.win' : 'solo.lose'), W / 2, cy - 38, {
      size: 20, weight: 'bold', color: win ? T.win : T.lose, align: 'center',
    });
    D.text(c, `${t('solo.streak')} ${this.streak}`, W / 2, cy - 6, {
      size: 14, color: win ? T.win : T.lose, align: 'center',
    });
    const label = t('solo.nextRound');
    const bw = Math.min(176, D.measure(c, label, 13, 'bold') + 30);
    const bx = W / 2 - bw / 2;
    const by = cy + 24;
    D.fillRoundRect(c, bx, by, bw, 34, 8, T.primary);
    D.text(c, label, bx + bw / 2, by + 17, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    // 保留连胜继续打：按当前连胜给更难的档，不清连胜。
    this.addButton('result-next', bx, by, bw, 34, () => this.dealRound());
  }

  drawFabs(c, T) {
    const r = this.helpFab;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.12)';
    c.shadowBlur = 10;
    c.shadowOffsetY = 2;
    D.circle(c, r.x + r.w / 2, r.y + r.h / 2, r.w / 2, T.card);
    c.restore();
    if (!icons.draw(c, 'help', r.x + r.w / 2, r.y + r.h / 2, 22, T.text)) {
      D.text(c, '?', r.x + r.w / 2, r.y + r.h / 2, { size: 22, weight: 'bold', color: T.text, align: 'center' });
    }
    this.addButton('fab-help', r.x, r.y, r.w, r.h, () => { this.helpOpen = true; });
    fabKit.drawMute(this, c, fabKit.leftSlot(r));
  }

  drawConfetti(c) {
    confetti.draw(c, this.confetti);
  }

  drawHelp(c, T) {
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fillRect(0, 0, W, H);
    const x = 20;
    const w = W - 40;
    const lines = [];
    ['help1', 'help2', 'help3'].forEach((key) => {
      const value = t('solo.' + key);
      if (value !== 'solo.' + key) {
        lines.push(...D.wrapText(c, value, w - 40, 14));
        lines.push('');
      }
    });
    const lineH = 20;
    const h = Math.min(H - 80, 74 + lines.length * lineH + 62);
    const y = (H - h) / 2;
    D.card(c, x, y, w, h, T);
    D.text(c, '?', x + 24, y + 30, { size: 24, weight: 'bold', color: T.primary });
    D.text(c, t('help'), x + 50, y + 30, { size: 16, weight: 'bold', color: T.text });
    c.save();
    D.roundRect(c, x + 1, y + 1, w - 2, h - 2, 14);
    c.clip();
    let ly = y + 58;
    lines.forEach((line) => {
      if (line) D.text(c, line, x + 20, ly, { size: 14, color: T.text });
      ly += lineH;
    });
    c.restore();
    // 全屏遮罩必须在面板按钮之前加入（Input 从后往前找）。
    this.addButton('help-mask', 0, 0, W, H, () => { this.helpOpen = false; });
    const bw = 110;
    const bx = x + (w - bw) / 2;
    const by = y + h - 44;
    D.fillRoundRect(c, bx, by, bw, 30, 8, T.primary);
    D.text(c, t('solo.confirmText'), bx + bw / 2, by + 15, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('help-ok', bx, by, bw, 30, () => { this.helpOpen = false; });
  }

  drawConfirm(c, T) {
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fillRect(0, 0, W, H);
    const w = W - 56;
    const h = 214;
    const x = (W - w) / 2;
    const y = (H - h) / 2;
    D.card(c, x, y, w, h, T);
    D.text(c, t('solo.start'), x + 20, y + 34, { size: 17, weight: 'bold', color: T.text });
    const lines = D.wrapText(c, t('solo.newGameConfirm'), w - 40, 14);
    lines.forEach((line, i) => D.text(c, line, x + 20, y + 64 + i * 21, { size: 14, color: T.muted }));
    const gap = 12;
    const bw = (w - 40 - gap) / 2;
    const by = y + h - 48;
    // mask 先加，面板按钮后加，保证点得到按钮。
    this.addButton('confirm-mask', 0, 0, W, H, () => { this.confirming = false; });
    D.fillRoundRect(c, x + 20, by, bw, 32, 8, T.enter);
    D.text(c, t('solo.cancel'), x + 20 + bw / 2, by + 16, { size: 13, weight: 'bold', color: T.text, align: 'center' });
    this.addButton('confirm-cancel', x + 20, by, bw, 32, () => { this.confirming = false; });
    D.fillRoundRect(c, x + 20 + bw + gap, by, bw, 32, 8, T.primary);
    D.text(c, t('solo.confirmOk'), x + 20 + bw + gap + bw / 2, by + 16, {
      size: 13, weight: 'bold', color: '#fff', align: 'center',
    });
    this.addButton('confirm-ok', x + 20 + bw + gap, by, bw, 32, () => this.startNewGame());
  }

  // ---------- lifecycle ----------
  onTheme() { this.layout(); }
  onResize() { this.layout(); }
  onHide() {
    if (this.phase === CELEBRATE) {
      // 提前落档：切后台回来直接看到结算，不把已经胡的局丢掉，也不重复播声音。
      this.drawnId = null;
      this.winPending = null;
      this.finishWin(false);
      return;
    }
    this.save();
  }
  onShow() { this.now = Date.now(); }
}

module.exports = SoloScene;
