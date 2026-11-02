// 扑克炼金术 · 微信小游戏 canvas 场景。
// 两种关卡模式共用一套 UI：
//   mode 1 = 炼金闯关（4×4、16 格、10 条线）
//   mode 2 = 炸金花闯关（3×3、9 格、8 条线，点已有牌格可以替换）
// 纯逻辑在 ./board.js；本文件只负责布局、绘制、触摸、动画与存档。
//
// 存档 key 严格沿用 web / 小程序（两种模式各自独立）：
//   __poker_alchemy__mode
//   __poker_alchemy__level      / __poker_alchemy__level_2
//   __poker_alchemy__best_1     / __poker_alchemy__best_2
//   __poker_alchemy__state      / __poker_alchemy__state_2
const { W, H, SAFE_BOTTOM } = require('../../core/canvas');
const { Scene } = require('../../core/app');
const theme = require('../../core/theme');
const i18n = require('../../core/i18n');
const { getRaw, setRaw, removeRaw } = require('../../core/storage');
const D = require('../../core/draw');
const ParticleField = require('../../core/particles');
const icons = require('../../core/icons');
const cards = require('../../core/cards');
const HEADER = require('../../core/header');
const confetti = require('../../core/confetti');
const { matchedMotion, TOTAL_MS: CLEAR_TOTAL_MS } = require('../../core/motion');
const board = require('./board');
const i18nDict = require('./i18n');

const { t } = i18n;
if (!i18n.__alchemyRegistered) {
  i18n.register('alchemy', i18nDict);
  i18n.__alchemyRegistered = true;
}

const PREFIX = '__poker_alchemy__';
const MODE_KEY = `${PREFIX}mode`;
const LEVEL_KEY = `${PREFIX}level`;
const LEVEL_KEY_2 = `${PREFIX}level_2`;
const STATE_KEY = `${PREFIX}state`;
const STATE_KEY_2 = `${PREFIX}state_2`;
const BEST_KEY_1 = `${PREFIX}best_1`;
const BEST_KEY_2 = `${PREFIX}best_2`;

const PLAY = 'play';
const WON = 'won';
const OVER = 'over';
const MODE_POKER = cards.MODE_POKER;

// 本游戏牌背图案用首页同款图标（flask / 炼金术）；字体未加载时 core/cards 会退化成语义文字。
const BACK_ICON = 'alchemy';
const BACK_FALLBACK = '⚗';

// 一次得分 ≥ 300 才震盘 / 闪外圈 / 撒小烟花；否则只有中央浮字（照 web 消消乐那套）。
const FX_MIN = 300;
// 得分浮字先露一下脸，再铺结算层（web 共用 RESULT_DELAY_MS）。
const RESULT_DELAY_MS = 500;
const CELEBRATE_MS = 950;
const FLIGHT_MS = 210;
const FLASH_MS = 450;
const HAND_IN_MS = 260;
const DEAL_MS = 300;
const DEAL_STEP = 25;
const SHAKE_MS = 340;
const GLOW_MS = 900;

class AlchemyScene extends Scene {
  constructor(app) {
    super(app);
    this.bg = new ParticleField();
    this.mode = this.loadMode();
    this.size = this.mode === 2 ? board.SIZE3 : board.SIZE;
    this.cellCount = this.size * this.size;
    this.now = Date.now();

    this.level = 1;
    this.best = 0;
    this.score = 0;
    this.chain = 0;
    this.phase = PLAY;
    this.grid = new Array(this.cellCount).fill(null);
    this.pile = [];
    this.cursor = 0;
    this.cfg = this.configFor(1);

    this.clears = [];
    this.celebrate = null;
    this.confetti = [];
    this.bursts = [];
    this.confettiUntil = 0;
    this.lastConfettiAt = 0;
    this.shakeAt = 0;
    this.glowAt = 0;
    this.flashCell = -1;
    this.flashAt = 0;
    this.dealStart = 0;
    this.handAt = 0;
    this.endAt = 0;
    this.flying = null;
    this.drag = null;
    this.busy = false;
    this.helpOpen = false;
    this.confirming = false;

    this.layout();
    this.boot();
  }

  // ---------- keys / mode ----------

  loadMode() {
    const raw = Math.floor(+(getRaw(MODE_KEY, 1) || 1));
    return raw === 2 ? 2 : 1;
  }
  levelKey() { return this.mode === 2 ? LEVEL_KEY_2 : LEVEL_KEY; }
  bestKey() { return this.mode === 2 ? BEST_KEY_2 : BEST_KEY_1; }
  stateKey() { return this.mode === 2 ? STATE_KEY_2 : STATE_KEY; }
  configFor(level) { return this.mode === 2 ? board.zjhLevelConfig(level) : board.levelConfig(level); }

  // 旧版 web 模式 2 是「无尽」，best_2 存的是最高分；没有 level_2 时丢弃旧记录，
  // 避免把几万分的最高分当成最高关卡（与 web 的 migrateEndlessStorage 一致）。
  migrateEndlessStorage() {
    if (!getRaw(LEVEL_KEY_2, '')) {
      removeRaw(BEST_KEY_2);
      removeRaw(STATE_KEY_2);
    }
  }

  boot() {
    if (this.mode === 2) this.migrateEndlessStorage();
    this.level = Math.max(1, Math.floor(+(getRaw(this.levelKey(), 1) || 1)) || 1);
    this.best = Math.max(0, Math.floor(+(getRaw(this.bestKey(), 0) || 0)) || 0);
    if (!this.restore()) this.startLevel(this.level);
    else this.checkEnd(true);
  }

  // ---------- deck / hand ----------

  handCard() { return this.pile[this.cursor] || null; }
  previewCards() { return this.pile.slice(this.cursor + 1, this.cursor + 1 + board.PREVIEW); }
  cardsLeft() { return Math.max(0, this.pile.length - this.cursor); }
  deckEmpty() { return this.pile.length > 0 && this.cursor >= this.pile.length; }
  canPlace() { return this.phase === PLAY && !!this.handCard() && !this.helpOpen && !this.confirming; }

  // 牌面 item 统一交给 core/cards.js：普通牌 {num,type}，Joker {num:14,type}。
  cardItem(card) {
    if (board.isJoker(card)) {
      return { num: 14, type: board.JOKER_SUIT[card.color] || 'spade' };
    }
    return { num: card.rank, type: card.suit };
  }

  // 存档压缩：普通牌 {k:'c',r,s}，黑色 Joker {k:'jb'}、红色 Joker {k:'jr'}。
  packCard(card) {
    if (board.isJoker(card)) return { k: card.color === board.BLACK ? 'jb' : 'jr' };
    return { k: 'c', r: card.rank, s: card.suit };
  }

  unpackCard(o) {
    if (!o) return null;
    if (o.k === 'c' && Number.isInteger(o.r) && o.r >= 1 && o.r <= board.RANKS
      && board.SUITS.indexOf(o.s) >= 0) return board.createCard(o.r, o.s);
    if (o.k === 'jb') return board.createJoker(board.BLACK);
    if (o.k === 'jr') return board.createJoker(board.RED);
    return null;
  }

  // 复制一张牌（保留 Joker 的 kind；不能只取值 rank/suit，否则牌型判定会失效）。
  cloneCard(card) {
    if (board.isJoker(card)) return board.createJoker(card.color);
    return board.createCard(card.rank, card.suit);
  }

  // 两种模式各自发牌：炼金用 createDealer（含 Joker、整副牌不重复），
  // 炸金花用一副标准 52 张（无 Joker）洗好后截取本关可用牌数。
  buildPile() {
    const count = this.cfg.deck;
    if (this.mode === 2) return board.createDeck().slice(0, count);
    const dealer = board.createDealer();
    const used = new Set();
    const pile = [];
    for (let i = 0; i < count; i++) {
      const card = dealer.draw(used);
      pile.push(card);
      used.add(board.cardKey(card));
    }
    return pile;
  }

  // ---------- level lifecycle ----------

  startLevel(lv) {
    this.level = Math.max(1, Math.floor(lv) || 1);
    this.cfg = this.configFor(this.level);
    this.score = 0;
    this.chain = 0;
    this.phase = PLAY;
    this.grid = new Array(this.cellCount).fill(null);
    this.pile = this.buildPile();
    this.cursor = 0;
    this.clearTransient();
    this.confirming = false;
    this.handAt = Date.now();
    this.layout();
    this.save();
  }

  retryLevel() {
    this.confirming = false;
    this.startLevel(this.level);
  }
  nextLevel() {
    this.confirming = false;
    this.startLevel(this.level + 1);
  }
  startNewGame() {
    this.confirming = false;
    removeRaw(this.bestKey());
    removeRaw(this.levelKey());
    this.best = 0;
    this.startLevel(1);
  }

  clearTransient() {
    this.clears = [];
    this.celebrate = null;
    this.confetti = [];
    this.bursts = [];
    this.confettiUntil = 0;
    this.lastConfettiAt = 0;
    this.shakeAt = 0;
    this.glowAt = 0;
    this.flashCell = -1;
    this.flashAt = 0;
    this.dealStart = 0;
    this.endAt = 0;
    this.flying = null;
    this.drag = null;
    this.busy = false;
  }

  toggleMode() {
    if (this.helpOpen || this.confirming) return;
    this.save();
    this.mode = this.mode === 1 ? 2 : 1;
    this.size = this.mode === 2 ? board.SIZE3 : board.SIZE;
    this.cellCount = this.size * this.size;
    setRaw(MODE_KEY, String(this.mode));
    this.clearTransient();
    if (this.mode === 2) this.migrateEndlessStorage();
    this.level = Math.max(1, Math.floor(+(getRaw(this.levelKey(), 1) || 1)) || 1);
    this.best = Math.max(0, Math.floor(+(getRaw(this.bestKey(), 0) || 0)) || 0);
    this.layout();
    if (!this.restore()) this.startLevel(this.level);
    else this.checkEnd(true);
  }

  // ---------- persistence ----------

  save() {
    if (!this.pile) return;
    setRaw(this.levelKey(), String(this.level));
    const stored = Math.max(0, Math.floor(+(getRaw(this.bestKey(), 0) || 0)) || 0);
    this.best = Math.max(this.best || 0, stored, this.level);
    if (this.level > stored) setRaw(this.bestKey(), String(this.level));
    try {
      setRaw(this.stateKey(), JSON.stringify({
        mode: this.mode,
        level: this.level,
        score: this.score,
        chain: this.chain,
        phase: this.phase,
        board: this.grid.map(c => (c ? this.packCard(c) : null)),
        pile: this.pile.map(c => this.packCard(c)),
        cursor: this.cursor,
      }));
    } catch (e) { /* 存储异常不影响游玩 */ }
  }

  restore() {
    try {
      const raw = getRaw(this.stateKey(), '');
      if (!raw) return false;
      const saved = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!saved || !Array.isArray(saved.board) || saved.board.length !== this.cellCount) return false;
      if (+saved.mode !== this.mode) return false;
      if ([PLAY, WON, OVER].indexOf(saved.phase) < 0) return false;
      if (!Array.isArray(saved.pile) || !saved.pile.length || saved.pile.length > 400) return false;
      const grid = saved.board.map(c => (c ? this.unpackCard(c) : null));
      if (saved.board.some((c, i) => c && !grid[i])) return false;
      const pile = saved.pile.map(c => this.unpackCard(c));
      if (pile.some(c => !c)) return false;
      // 炸金花是标准 52 张、无 Joker；把带 Joker 的异常存档挡在外面。
      if (this.mode === 2 && grid.concat(pile).some(c => c && board.isJoker(c))) return false;

      this.grid = grid;
      this.pile = pile;
      this.cursor = Math.min(Math.max(0, Math.floor(+saved.cursor || 0)), pile.length);
      this.level = Math.max(1, Math.floor(+saved.level || 1));
      this.score = Math.max(0, Math.floor(+saved.score || 0));
      this.chain = Math.max(0, Math.floor(+saved.chain || 0));
      this.phase = saved.phase;
      this.cfg = this.configFor(this.level);
      this.clearTransient();
      this.handAt = 0;
      // 恢复局面按行优先逐张铺开：延迟用真实的 cols / rows，不能出现 NaN。
      this.dealStart = Date.now();
      this.layout();
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- score / end ----------

  sfx(name) {
    const audio = this.app && this.app.audio;
    if (audio && typeof audio[name] === 'function') audio[name]();
  }

  startConfetti() {
    this.confetti = [];
    this.confettiUntil = Date.now() + 1200;
    this.lastConfettiAt = 0;
  }

  checkEnd(silent) {
    if (this.phase !== PLAY || !this.cfg) return;
    if (this.score >= this.cfg.target) {
      this.phase = WON;
      if (!silent) {
        this.sfx('playSuccess');
        this.startConfetti();
      }
      this.save();
      return;
    }
    if (this.cursor >= this.pile.length) {
      this.phase = OVER;
      if (!silent) this.sfx('playLose');
      this.save();
    }
  }

  // 一次落子后的统一收尾：结算 → 中央浮字 → 判结束 → 落档。
  settle(silent) {
    const now = Date.now();
    const zjh = this.mode === 2;
    const hits = zjh ? board.scoringLines3(this.grid) : board.scoringLines(this.grid);
    let scored = false;

    if (hits.length) {
      scored = true;
      let taken;
      let bestCombo;
      let gained;
      if (zjh) {
        // 炸金花：所有成立的线全部计分，再叠加多消 / 连击奖励。
        taken = hits;
        bestCombo = taken.reduce((a, b) => (b.combo.score > a.combo.score ? b : a), taken[0]).combo;
        this.chain += 1;
        gained = taken.reduce((sum, h) => sum + h.combo.score, 0)
          + board.zjhComboBonus(taken.length) + board.zjhChainBonus(this.chain);
      } else {
        // 炼金：只取分数最高的线；最高分并列才一起消。
        const top = Math.max(...hits.map(h => h.combo.score));
        taken = hits.filter(h => h.combo.score === top);
        bestCombo = taken[0].combo;
        gained = taken.reduce((sum, h) => sum + h.combo.score, 0);
      }
      this.score += gained;
      if (!silent) {
        if (gained >= FX_MIN) this.app.audio.playFirework();
        else this.sfx('playElimination');
      }

      // 局面**立刻**清空，消除动画交给 clears 浮影层；否则动画期间再落一子会把同一条线重复计分。
      const cleared = new Set();
      taken.forEach(h => h.indices.forEach(i => cleared.add(i)));
      const ghosts = [];
      cleared.forEach((idx) => {
        if (this.grid[idx]) ghosts.push({ idx, card: this.grid[idx], start: now });
      });
      this.clears = ghosts;
      this.grid = this.grid.map((c, i) => (cleared.has(i) ? null : c));

      this.celebrate = {
        start: now,
        gained,
        tier: gained >= 1000 ? 3 : gained >= 500 ? 2 : 1,
        name: t(`alchemy.combo${bestCombo.id.charAt(0).toUpperCase()}${bestCombo.id.slice(1)}`),
        groups: zjh ? taken.length : 0,
        chain: zjh ? this.chain : 0,
      };
      if (!silent && gained >= FX_MIN) {
        this.shakeAt = now;
        this.glowAt = now;
        confetti.spawn(this.bursts, { W, H, count: 8 });
      }
      // 浮字露脸 0.5s 后再结算，避免结算层直接糊在浮字上。
      this.endAt = now + RESULT_DELAY_MS;
    } else {
      if (zjh) this.chain = 0;
      this.endAt = 0;
    }

    this.save();
    if (!scored) this.checkEnd(silent);
  }

  // ---------- placement ----------

  place(idx, byDrag) {
    if (this.phase !== PLAY || this.helpOpen || this.confirming || this.busy) return false;
    if (!(idx >= 0 && idx < this.cellCount)) return false;
    const card = this.handCard();
    if (!card) return false;
    if (this.mode === 1 && this.grid[idx]) return false;   // 炼金只能放空格

    const now = Date.now();
    const placed = this.cloneCard(card);
    this.grid[idx] = placed;
    this.cursor += 1;
    this.handAt = now;

    if (byDrag) {
      // 手指已经把牌带过去了，不再飞，直接结算。
      this.settle();
      return true;
    }
    this.flying = {
      card: this.cloneCard(card),
      idx,
      from: { x: this.handRect.x, y: this.handRect.y, w: this.handRect.w, h: this.handRect.h },
      to: this.cellRect(idx),
      start: now,
      duration: FLIGHT_MS,
    };
    this.busy = true;
    return true;
  }

  finishFlight(silent) {
    const had = !!this.flying;
    this.flying = null;
    this.busy = false;
    if (had) this.settle(silent);
  }

  onCellTap(idx) {
    if (this.phase !== PLAY || this.helpOpen || this.confirming || this.busy) return;
    if (!this.handCard()) return;
    if (this.mode === 1 && this.grid[idx]) return;
    this.flashCell = idx;
    this.flashAt = Date.now();
    this.place(idx, false);
  }

  // ---------- touch (drag-to-place) ----------

  onTouchStart(p) {
    if (!p) return;
    if (this.phase !== PLAY || this.helpOpen || this.confirming || this.busy || !this.handCard()) return;
    const r = this.handRect;
    if (p.x >= r.x - 8 && p.x <= r.x + r.w + 8 && p.y >= r.y - 8 && p.y <= r.y + r.h + 8) {
      this.drag = { startX: p.x, startY: p.y, x: p.x, y: p.y, active: false };
    }
  }

  onTouchMove(p) {
    const d = this.drag;
    if (!d || !p) return;
    const dx = p.x - d.startX;
    const dy = p.y - d.startY;
    if (!d.active && dx * dx + dy * dy > 100) d.active = true;   // 10px 方向锁定
    if (d.active) { d.x = p.x; d.y = p.y; }
  }

  onTouchEnd(p) {
    const d = this.drag;
    this.drag = null;
    if (!d || !d.active) return;
    if (!p) return;
    const idx = this.cellAt(p.x, p.y);
    if (idx >= 0) this.place(idx, true);
  }

  onHide() {
    if (this.flying) this.finishFlight(true);
    this.drag = null;
    this.save();
  }
  onShow() { this.now = Date.now(); }
  onTheme() { this.layout(); }

  // ---------- layout ----------

  layout() {
    this.cw = Math.min(W - 32, 440);
    this.cx = (W - this.cw) / 2;
    this.top = HEADER.TOP;
    this.headerH = HEADER.HEIGHT;
    this.homeRect = { ...HEADER.HOME_RECT };

    this.scoreY = this.top + this.headerH + 12;
    this.scoreH = 64;

    this.fabSize = 40;
    this.helpFab = { x: W - 16 - 40, y: H - SAFE_BOTTOM - 16 - 40, w: 40, h: 40 };
    this.modeFab = { x: this.helpFab.x - 48, y: this.helpFab.y, w: 40, h: 40 };

    this.rowH = 66;
    const n = this.size;
    const pad = 8;
    const gap = 8;
    const availTop = this.scoreY + this.scoreH + 10;
    const availBottom = this.helpFab.y - 12;
    const maxGroupH = Math.max(150, availBottom - availTop);
    const maxBoardH = Math.max(120, maxGroupH - 12 - this.rowH);
    const byW = (this.cw - pad * 2 - gap * (n - 1)) / n;
    const byH = (maxBoardH - pad * 2 - gap * (n - 1)) / n / 1.5;
    const cap = n === 3 ? 104 : 84;
    const cw = Math.max(28, Math.min(byW, byH, cap));
    this.cellW = Math.floor(cw);
    this.cellH = Math.round(this.cellW * 1.5);
    this.pad = pad;
    this.gap = gap;
    this.boardW = pad * 2 + this.cellW * n + gap * (n - 1);
    this.boardH = pad * 2 + this.cellH * n + gap * (n - 1);

    // board + hand row 作为一个整体在剩余空间里居中（4×4 几乎占满，3×3 上下留白）
    const groupH = this.boardH + 12 + this.rowH;
    const groupY = availTop + Math.max(0, (maxGroupH - groupH) / 2);
    // 候选牌 + 新游戏卡片在游戏区上方（与麻将英雄一致）。
    this.rowY = groupY;
    this.boardX = (W - this.boardW) / 2;
    this.boardY = this.rowY + this.rowH + 12;
    this.handW = 36;
    this.handH = 54;
    // 卡片左右平分：候选牌整组在左半区居中，新游戏按钮在右半区居中。
    const previewGroupW = this.handW + 8 + 38 + 28;
    this.rowX = this.cx + this.cw / 4 - previewGroupW / 2;
    this.handRect = {
      x: this.rowX,
      y: this.rowY + (this.rowH - this.handH) / 2,
      w: this.handW,
      h: this.handH,
    };
    this.previewScale = [0.8, 0.6];
  }

  cellRect(idx) {
    const row = Math.floor(idx / this.size);
    const col = idx % this.size;
    return {
      x: this.boardX + this.pad + col * (this.cellW + this.gap),
      y: this.boardY + this.pad + row * (this.cellH + this.gap),
      w: this.cellW,
      h: this.cellH,
    };
  }

  cellAt(x, y) {
    for (let idx = 0; idx < this.cellCount; idx++) {
      const r = this.cellRect(idx);
      if (x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h) return idx;
    }
    return -1;
  }

  previewRect(i) {
    const s = this.previewScale[i] || this.previewScale[this.previewScale.length - 1];
    const w = Math.round(this.handW * s);
    const h = Math.round(this.handH * s);
    const slot = i === 0 ? 36 : 28;
    const off = i === 0 ? 0 : 38;
    return {
      x: this.rowX + this.handW + 8 + off + (slot - w) / 2,
      y: this.handRect.y + (this.handH - h) / 2,
      w,
      h,
    };
  }

  // ---------- update ----------

  update(dt) {
    const step = Math.min(50, dt || 16);
    this.now = Date.now();
    if (this.bg) this.bg.update(step);

    if (this.flying && this.now >= this.flying.start + this.flying.duration) this.finishFlight();
    if (this.endAt && this.now >= this.endAt) {
      this.endAt = 0;
      this.checkEnd();
    }
    if (this.clears.length) this.clears = this.clears.filter(g => this.now - g.start < CLEAR_TOTAL_MS);
    if (this.celebrate && this.now - this.celebrate.start >= CELEBRATE_MS) this.celebrate = null;
    if (this.dealStart && this.now - this.dealStart > this.cellCount * DEAL_STEP + DEAL_MS) this.dealStart = 0;

    if (this.now < this.confettiUntil && this.now - this.lastConfettiAt >= 40) {
      this.lastConfettiAt = this.now;
      confetti.spawn(this.confetti, { W, H });
    }
    this.confetti = confetti.update(this.confetti, step, H);
    this.bursts = confetti.update(this.bursts, step, H);
  }

  // ---------- render ----------

  render(c) {
    this.buttons = [];
    const T = theme.tokens;
    c.fillStyle = T.bg;
    c.fillRect(0, 0, W, H);
    this.bg.draw(c, theme.dark);
    this.drawHeader(c);
    this.drawScore(c);
    this.drawRow(c);
    this.drawBoard(c);
    if (!this.helpOpen && !this.confirming) this.drawFabs(c);
    this.drawConfetti(c);
    if (this.drag && this.drag.active) this.drawDragGhost(c);
    if (this.helpOpen) this.drawHelp(c);
    if (this.confirming) this.drawConfirm(c);
  }

  drawHeader(c) {
    const T = theme.tokens;
    D.text(c, t('alchemy.gameTitle'), W / 2, this.top + this.headerH / 2, {
      size: 15, weight: 'bold', color: T.text, align: 'center',
    });
    const h = this.homeRect;
    const hx = h.x + h.w / 2;
    const hy = h.y + h.h / 2;
    if (!icons.draw(c, 'home', hx, hy, 24, T.text)) {
      D.text(c, '⌂', hx, hy, { size: 24, color: T.text, align: 'center' });
    }
    this.addButton('home', h.x, h.y, h.w, h.h, () => this.app.goHome());
  }

  drawScore(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.scoreY, this.cw, this.scoreH, T);
    const cols = 4;
    const colW = this.cw / cols;
    const labels = [t('alchemy.level'), t('alchemy.left'), t('alchemy.score'), t('alchemy.target')];
    const values = [String(this.level), String(this.cardsLeft()), String(this.score), String(this.cfg ? this.cfg.target : 0)];
    for (let i = 0; i < cols; i++) {
      const ccx = this.cx + colW * (i + 0.5);
      D.text(c, labels[i], ccx, this.scoreY + 21, { size: 11, color: T.muted, align: 'center' });
      D.text(c, values[i], ccx, this.scoreY + 44, {
        size: 18, weight: 'bold', color: i === 2 ? T.primary : T.text, align: 'center',
      });
    }
    for (let i = 1; i < cols; i++) {
      D.divider(c, this.cx + colW * i, this.scoreY + this.scoreH / 2, 24, T.border, 1);
    }
    const progress = this.cfg && this.cfg.target ? this.score / this.cfg.target : 0;
    D.progressBar(c, this.cx, this.scoreY, this.cw, this.scoreH, progress, T.border, T.primary);
  }

  drawBoard(c) {
    const T = theme.tokens;
    const now = this.now;
    let ox = 0;
    let oy = 0;
    if (this.shakeAt) {
      const age = now - this.shakeAt;
      if (age >= 0 && age < SHAKE_MS) {
        const decay = 1 - age / SHAKE_MS;
        ox = Math.sin(age / 16) * 4 * decay;
        oy = Math.cos(age / 13) * 2 * decay;
      }
    }
    c.save();
    c.translate(ox, oy);

    D.fillRoundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 14, T.boardBg);
    if (this.glowAt) {
      const gAge = now - this.glowAt;
      if (gAge >= 0 && gAge < GLOW_MS) {
        const a = 0.55 * (1 - gAge / GLOW_MS);
        D.strokeRoundRect(c, this.boardX - 2, this.boardY - 2, this.boardW + 4, this.boardH + 4, 16,
          `rgba(35,128,78,${a.toFixed(3)})`, 3);
      }
    }

    const place = this.canPlace();
    for (let idx = 0; idx < this.cellCount; idx++) {
      const r = this.cellRect(idx);
      const occupied = !!this.grid[idx];
      D.fillRoundRect(c, r.x, r.y, r.w, r.h, 8, 'rgba(255,255,255,0.10)');
      if (!occupied && place) {
        c.save();
        if (c.setLineDash) c.setLineDash([4, 3]);
        D.strokeRoundRect(c, r.x, r.y, r.w, r.h, 8, T.primary, 1.2);
        c.restore();
      } else if (occupied && place && this.mode === 2) {
        D.strokeRoundRect(c, r.x, r.y, r.w, r.h, 8, 'rgba(35,128,78,0.55)', 1.2);
      } else {
        D.strokeRoundRect(c, r.x, r.y, r.w, r.h, 8, T.tileBorder, 1);
      }
      this.addButton('cell-' + idx, r.x, r.y, r.w, r.h, () => this.onCellTap(idx));
    }

    // 棋盘上的牌（恢复存档时按行优先逐张铺开）
    this.grid.forEach((card, idx) => {
      if (!card) return;
      if (this.flying && this.flying.idx === idx) return;   // 飞行中的落点先隐身
      const r = this.cellRect(idx);
      let scale = 1;
      let alpha = 1;
      let dx = 0;
      let dy = 0;
      if (this.dealStart) {
        const p = Math.max(0, Math.min(1, (now - this.dealStart - idx * DEAL_STEP) / DEAL_MS));
        if (p <= 0) return;
        const e = 1 - Math.pow(1 - p, 3);
        scale = 0.45 + 0.55 * e;
        alpha = p;
        dx = -12 * (1 - e);
        dy = -12 * (1 - e);
      }
      c.save();
      c.globalAlpha = alpha;
      c.translate(r.x + r.w / 2 + dx, r.y + r.h / 2 + dy);
      c.scale(scale, scale);
      cards.draw(c, this.cardItem(card), MODE_POKER,
        -r.w / 2 + 3, -r.h / 2 + 3, r.w - 6, r.h - 6, true, BACK_ICON, BACK_FALLBACK);
      c.restore();
    });

    // 消除浮影：复用 core/motion 的两下闪烁 + 缩小（不锁其它格子）
    this.clears.forEach((ghost) => {
      const age = now - ghost.start;
      if (age < 0) return;
      const m = matchedMotion(age);
      if (m.done || m.alpha <= 0) return;
      const r = this.cellRect(ghost.idx);
      c.save();
      c.globalAlpha = m.alpha;
      c.translate(r.x + r.w / 2, r.y + r.h / 2);
      c.scale(m.scale, m.scale);
      cards.draw(c, this.cardItem(ghost.card), MODE_POKER,
        -r.w / 2 + 3, -r.h / 2 + 3, r.w - 6, r.h - 6, true, BACK_ICON, BACK_FALLBACK);
      c.restore();
    });

    // 刚点过的格子：实线主色高亮 450ms
    if (this.flashCell >= 0 && now - this.flashAt < FLASH_MS) {
      const r = this.cellRect(this.flashCell);
      D.strokeRoundRect(c, r.x, r.y, r.w, r.h, 8, T.primary, 2);
    }
    c.restore();

    this.drawCelebrate(c);
    this.drawResult(c);
  }

  // 中央得分浮字：牌型名 + 本次得分（炸金花再带连消 / 连击两行）。
  drawCelebrate(c) {
    const cel = this.celebrate;
    if (!cel) return;
    const age = this.now - cel.start;
    if (age < 0 || age > CELEBRATE_MS) return;
    const T = theme.tokens;
    const p = age / CELEBRATE_MS;
    const pop = p < 0.28 ? 0.4 + 0.76 * (p / 0.28)
      : p < 0.44 ? 1.16 - 0.16 * ((p - 0.28) / 0.16) : 1;
    const alpha = p < 0.78 ? 1 : Math.max(0, 1 - (p - 0.78) / 0.22);
    const rise = p < 0.78 ? 0 : ((p - 0.78) / 0.22) * 48;

    const lines = [{ text: cel.name, size: cel.tier === 3 ? 24 : cel.tier === 2 ? 21 : 18, weight: 'bold' }];
    if (cel.groups > 1) {
      lines.push({ text: t('alchemy.comboGroups').replace('{n}', cel.groups), size: 13, weight: 'normal' });
    }
    if (cel.chain > 1) {
      lines.push({ text: t('alchemy.comboChain').replace('{n}', cel.chain), size: 13, weight: 'normal' });
    }
    lines.push({ text: `+${cel.gained}`, size: 14, weight: 'bold' });

    const padX = 14;
    const padY = 10;
    const gap = 3;
    let textW = 0;
    let textH = 0;
    lines.forEach((l) => {
      textW = Math.max(textW, D.measure(c, l.text, l.size, l.weight));
      textH += l.size + 2;
    });
    const boxW = Math.min(this.boardW - 12, textW + padX * 2);
    const boxH = textH + padY * 2 + gap * (lines.length - 1);
    const cx = W / 2;
    const cy = this.boardY + this.boardH / 2 - 24 - rise;

    c.save();
    c.globalAlpha = alpha;
    c.translate(cx, cy);
    c.scale(pop, pop);
    D.fillRoundRect(c, -boxW / 2, -boxH / 2, boxW, boxH, 10, T.primary);
    if (cel.tier > 1) {
      D.strokeRoundRect(c, -boxW / 2 - 2, -boxH / 2 - 2, boxW + 4, boxH + 4, 12, 'rgba(255,255,255,0.55)', 2);
    }
    let ly = -boxH / 2 + padY;
    lines.forEach((l, i) => {
      ly += l.size / 2;
      D.text(c, l.text, 0, ly, {
        size: l.size, weight: l.weight, color: '#fff', align: 'center',
      });
      ly += l.size / 2 + 2 + (i < lines.length - 1 ? gap : 0);
    });
    c.restore();
  }

  drawResult(c) {
    if (this.phase !== WON && this.phase !== OVER) return;
    if (!this.resultVisible(420)) return;
    const T = theme.tokens;
    D.fillRoundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 14, T.overlay);
    const cx = W / 2;
    const cy = this.boardY + this.boardH / 2;
    const titleSize = Math.min(20, Math.max(15, this.boardW / 15));
    if (this.phase === WON) {
      D.text(c, `🎉🎉 ${t('alchemy.tipWin')} 🎉🎉`, cx, cy - 46, {
        size: titleSize, weight: 'bold', color: T.win, align: 'center',
      });
      D.text(c, t('alchemy.levelDone').replace('{n}', this.level), cx, cy - 16, {
        size: 14, color: T.text, align: 'center',
      });
      const labelA = t('alchemy.replayLevel');
      const labelB = t('alchemy.nextLevel');
      const wA = Math.max(84, D.measure(c, labelA, 12, 'bold') + 20);
      const wB = Math.max(84, D.measure(c, labelB, 12, 'bold') + 20);
      const gap = 8;
      const bx = cx - (wA + wB + gap) / 2;
      const by = cy + 18;
      this.drawResultButton(c, bx, by, wA, 32, labelA, false, () => this.retryLevel());
      this.drawResultButton(c, bx + wA + gap, by, wB, 32, labelB, true, () => this.nextLevel());
    } else {
      D.text(c, `💤💤 ${t('alchemy.tipLost')} 💤💤`, cx, cy - 30, {
        size: titleSize, weight: 'bold', color: T.lose, align: 'center',
      });
      D.text(c, `${t('alchemy.score')} ${this.score}`, cx, cy + 2, {
        size: 14, color: T.text, align: 'center',
      });
      const label = t('alchemy.replayLevel');
      const bw = Math.max(96, D.measure(c, label, 12, 'bold') + 24);
      this.drawResultButton(c, cx - bw / 2, cy + 30, bw, 32, label, false, () => this.retryLevel());
    }
  }

  drawResultButton(c, x, y, w, h, label, primary, onTap) {
    const T = theme.tokens;
    if (primary) {
      D.fillRoundRect(c, x, y, w, h, 8, T.primary);
      D.text(c, label, x + w / 2, y + h / 2, { size: 12, weight: 'bold', color: '#fff', align: 'center' });
    } else {
      // 「重玩本关」是橙色描边按钮（全局约定）
      D.fillRoundRect(c, x, y, w, h, 8, 'rgba(0,0,0,0)');
      D.strokeRoundRect(c, x, y, w, h, 8, T.god, 1);
      D.text(c, label, x + w / 2, y + h / 2, { size: 12, weight: 'bold', color: T.god, align: 'center' });
    }
    this.addButton('result-' + label, x, y, w, h, onTap);
  }

  drawRow(c) {
    const T = theme.tokens;
    const now = this.now;
    D.card(c, this.cx, this.rowY, this.cw, this.rowH, T);
    D.divider(c, this.cx + this.cw / 2, this.rowY + this.rowH / 2, 24, T.border, 1);
    const r = this.handRect;
    const hand = this.handCard();

    if (hand) {
      // 候选牌不画外部容器；牌堆背面作为「下一张从牌堆来」的暗示压在下面。
      cards.draw(c, null, MODE_POKER, r.x + 1, r.y + 1, r.w - 2, r.h - 2, false, BACK_ICON, BACK_FALLBACK);
      const p = this.handAt ? Math.max(0, Math.min(1, (now - this.handAt) / HAND_IN_MS)) : 1;
      const scale = 0.24 + 0.76 * (1 - Math.pow(1 - p, 3));
      c.save();
      c.globalAlpha = this.drag && this.drag.active ? 0.35 : 1;
      c.translate(r.x + r.w / 2, r.y + r.h / 2);
      c.scale(scale, scale);
      cards.draw(c, this.cardItem(hand), MODE_POKER, -r.w / 2, -r.h / 2, r.w, r.h, true, BACK_ICON, BACK_FALLBACK);
      // 边框跟着牌一起缩放，手牌入场动画期间也不会错位。
      D.strokeRoundRect(c, -r.w / 2, -r.h / 2, r.w, r.h, cards.pokerRadius(r.w), T.primary, 2);
      c.restore();
    } else {
      const msg = this.deckEmpty() ? t('alchemy.deckEmpty') : t('alchemy.next');
      D.text(c, msg, r.x + r.w / 2, r.y + r.h / 2, { size: 12, color: T.muted, align: 'center' });
    }

    this.previewCards().forEach((card, i) => {
      const pr = this.previewRect(i);
      c.save();
      c.globalAlpha = 0.55;
      cards.draw(c, this.cardItem(card), MODE_POKER, pr.x, pr.y, pr.w, pr.h, true, BACK_ICON, BACK_FALLBACK);
      c.restore();
    });

    const label = t('alchemy.start');
    const bw = Math.min(this.cw / 2 - 16, Math.max(96, D.measure(c, label, 13, 'bold') + 24));
    const bx = this.cx + this.cw * 0.75 - bw / 2;
    const by = this.rowY + (this.rowH - 32) / 2;
    D.fillRoundRect(c, bx, by, bw, 32, 8, T.primary);
    D.text(c, label, bx + bw / 2, by + 16, {
      size: 13, weight: 'bold', color: '#ffffff', align: 'center',
    });
    this.addButton('new-game', bx, by, bw, 32, () => {
      if (!this.helpOpen && !this.confirming) this.confirming = true;
    });
  }

  drawFabs(c) {
    const T = theme.tokens;
    const fab = (rect, key, fallback, color, onTap, id) => {
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.12)';
      c.shadowBlur = 10;
      c.shadowOffsetY = 2;
      D.circle(c, rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, T.card);
      c.restore();
      if (!icons.draw(c, key, rect.x + rect.w / 2, rect.y + rect.h / 2, 20, color)) {
        D.text(c, fallback, rect.x + rect.w / 2, rect.y + rect.h / 2, { size: 18, color, align: 'center' });
      }
      this.addButton(id, rect.x, rect.y, rect.w, rect.h, onTap);
    };
    const modeKey = this.mode === 2 ? 'mode-poker' : 'alchemy';
    const modeFallback = this.mode === 2 ? '🃏' : '⚗';
    fab(this.helpFab, 'help', '?', T.text, () => { this.helpOpen = true; }, 'help');
    fab(this.modeFab, modeKey, modeFallback, T.primary, () => this.toggleMode(), 'mode');
  }

  drawConfetti(c) {
    confetti.draw(c, this.confetti.concat(this.bursts));
  }

  drawDragGhost(c) {
    const d = this.drag;
    const hand = this.handCard();
    if (!d || !hand) return;
    const r = this.handRect;
    c.save();
    c.globalAlpha = 0.95;
    c.translate(d.x, d.y);
    c.scale(1.06, 1.06);
    cards.draw(c, this.cardItem(hand), MODE_POKER, -r.w / 2, -r.h / 2, r.w, r.h, true, BACK_ICON, BACK_FALLBACK);
    c.restore();
  }

  drawHelp(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fillRect(0, 0, W, H);
    const x = 20;
    const w = W - 40;
    const lines = [];
    ['helpMsg', 'help1', 'help2', 'help3', 'help4'].forEach((k) => {
      const value = t('alchemy.' + k);
      if (value !== 'alchemy.' + k) {
        lines.push(...D.wrapText(c, value, w - 40, 14));
        lines.push('');
      }
    });
    const lineH = 20;
    const h = Math.min(H - 80, 74 + lines.length * lineH + 62);
    const y = (H - h) / 2;
    D.card(c, x, y, w, h, T);
    if (!icons.draw(c, 'help', x + 34, y + 30, 20, T.primary)) {
      D.text(c, '?', x + 34, y + 30, { size: 22, weight: 'bold', color: T.primary, align: 'center' });
    }
    D.text(c, t('help'), x + 50, y + 30, { size: 16, weight: 'bold', color: T.text });
    c.save();
    D.roundRect(c, x + 1, y + 1, w - 2, h - 2, 14);
    c.clip();
    let ly = y + 58;
    lines.forEach((line) => {
      if (line && ly < y + h - 54) D.text(c, line, x + 20, ly, { size: 14, color: T.text });
      ly += lineH;
    });
    c.restore();
    // 遮罩必须先加入，面板按钮后加入，否则会被遮罩吞掉。
    this.addButton('help-mask', 0, 0, W, H, () => { this.helpOpen = false; });
    const bw = 110;
    const bx = x + (w - bw) / 2;
    const by = y + h - 44;
    D.fillRoundRect(c, bx, by, bw, 30, 8, T.primary);
    D.text(c, t('alchemy.confirmText'), bx + bw / 2, by + 15, {
      size: 13, weight: 'bold', color: '#fff', align: 'center',
    });
    this.addButton('help-ok', bx, by, bw, 30, () => { this.helpOpen = false; });
  }

  drawConfirm(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fillRect(0, 0, W, H);
    const w = W - 56;
    const h = 208;
    const x = (W - w) / 2;
    const y = (H - h) / 2;
    D.card(c, x, y, w, h, T);
    D.text(c, t('alchemy.confirmTitle'), x + 20, y + 34, { size: 17, weight: 'bold', color: T.text });
    const lines = D.wrapText(c, t('alchemy.confirmMsg'), w - 40, 14);
    lines.slice(0, 4).forEach((line, i) => {
      D.text(c, line, x + 20, y + 64 + i * 21, { size: 14, color: T.muted });
    });
    const gap = 8;
    const bw = (w - 40 - gap * 2) / 3;
    const by = y + h - 48;
    this.addButton('confirm-mask', 0, 0, W, H, () => { this.confirming = false; });
    this.drawConfirmButton(c, x + 20, by, bw, 32, t('alchemy.cancel'), false, T.text,
      () => { this.confirming = false; }, 'cancel');
    this.drawConfirmButton(c, x + 20 + bw + gap, by, bw, 32, t('alchemy.confirmReplay'), false, T.god,
      () => this.retryLevel(), 'replay');
    this.drawConfirmButton(c, x + 20 + (bw + gap) * 2, by, bw, 32, t('alchemy.confirmOk'), true, '#fff',
      () => this.startNewGame(), 'ok');
  }

  drawConfirmButton(c, x, y, w, h, label, primary, color, onTap, id) {
    const T = theme.tokens;
    if (primary) {
      D.fillRoundRect(c, x, y, w, h, 8, T.primary);
    } else {
      D.fillRoundRect(c, x, y, w, h, 8, 'rgba(0,0,0,0)');
      D.strokeRoundRect(c, x, y, w, h, 8, color === T.god ? T.god : T.border, 1);
    }
    D.text(c, label, x + w / 2, y + h / 2, { size: 12, weight: 'bold', color, align: 'center' });
    this.addButton('confirm-' + id, x, y, w, h, onTap);
  }
}

module.exports = AlchemyScene;
