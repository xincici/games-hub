// 麻将英雄 · 小游戏 canvas 场景。
// 玩法 / 数值 / 存档 key 与 web `src/games/mahjong/` 对齐：纯逻辑在 board.js（可直接 require 做单测），
// 这里只负责布局、绘制、输入、动画与存档。牌面统一走 core/cards.js（麻将雪碧图 + 8px 圆角裁切），
// 本文件不写任何私有牌面绘制。
const { W, H, SAFE_BOTTOM } = require('../../core/canvas');
const { Scene } = require('../../core/app');
const theme = require('../../core/theme');
const { t } = require('../../core/i18n');
const { getRaw, setRaw, removeRaw } = require('../../core/storage');
const D = require('../../core/draw');
const ParticleField = require('../../core/particles');
const icons = require('../../core/icons');
const cards = require('../../core/cards');
const tiles = require('../../core/tiles');
const HEADER = require('../../core/header');
const confetti = require('../../core/confetti');
const logic = require('./board');
const i18nDict = require('./i18n');

const coreI18n = require('../../core/i18n');
if (!coreI18n.__mahjongRegistered) {
  coreI18n.register('mahjong', i18nDict);
  coreI18n.__mahjongRegistered = true;
}

// 存档 key 严格沿用 web（麻将英雄）：两种模式各一份局面
const MODE_KEY = '__mahjong_hero__mode';
const LEVEL_KEY = '__mahjong_hero__level';
const STATE_KEY = '__mahjong_hero__state';
const BEST_KEY = '__mahjong_hero__best_';

const MODE_LEVEL = 1;   // 闯关
const MODE_ENDLESS = 2; // 无尽
const PLAY = 'play';
const WON = 'won';
const OVER = 'over';

const HAND_W = 44;              // 手牌宽（高按牌的 131:168 走）
const PREVIEW_SCALE = 0.8;      // 「下一张」压到 0.8
const DROP_MS = 260;            // 落子：从手牌位置掉进格子
const LAND_MS = 220;            // 落地弹一下
const CLEAR_MS = 520;           // 成牌闪烁 → 消失（与 web blink-clear 0.52s 一致）
const FLASH_MS = 450;           // 刚点过的格子高亮
const DEAL_STEP = 45;           // 入场逐张错峰
const DEAL_MS = 340;
const SHAKE_MS = 340;
const GLOW_MS = 900;
const RESULT_DELAY_MS = 500;    // 中央得分浮字露一下脸再出结算层（同 web 的 resultDelay）
const FX_MIN = 300;             // 普通单次消除到这个分才震屏 / 闪光 / 撒花
const CONFETTI_MS = 1200;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const easeOut = p => 1 - Math.pow(1 - p, 3);
const scoreTier = gained => (gained >= 1000 ? 3 : gained >= 500 ? 2 : 1);

// 成牌闪烁：两次「亮 → 暗」再淡出（采样自 web 的 blink-clear 关键帧，最多两次明暗循环）
function blinkAlpha(p) {
  if (p < 0.16) return 1 - (0.88 * p) / 0.16;
  if (p < 0.32) return 0.12 + 0.88 * ((p - 0.16) / 0.16);
  if (p < 0.5) return 1 - 0.88 * ((p - 0.32) / 0.18);
  if (p < 0.66) return 0.12 + 0.88 * ((p - 0.5) / 0.16);
  if (p < 0.82) return 1;
  return Math.max(0, 1 - (p - 0.82) / 0.18);
}

class MahjongScene extends Scene {
  constructor(app) {
    super(app);
    this.bg = new ParticleField();
    // 所有动画 / 逻辑计时都用场景时钟：帮助 / 二次确认打开时冻结（PITFALLS #32）
    this.clock = 0;
    this.now = 0;
    this.mode = this.loadMode();
    this.level = this.loadLevel();
    this.best = this.loadBest(this.mode);
    this.conf = this.mode === MODE_LEVEL ? logic.levelConfig(this.level) : null;
    this.wall = logic.createWall();
    this.board = new Array(logic.CELLS).fill(null);
    this.pile = [];
    this.cursor = 0;
    this.score = 0;
    this.played = 0;
    this.combo = 0;
    this.phase = PLAY;
    this.busy = false;
    this.helpOpen = false;
    this.confirming = false;
    this.drop = null;          // 正在掉落的那张牌
    this.landing = null;       // 刚落地的格子（弹一下）
    this.clearing = null;      // 成牌浮影（board 已经置空）
    this.celebrate = null;     // 中央得分浮字
    this.dealStart = 0;
    this.dealDur = 0;
    this.dealOrder = new Map();
    this.shakeAt = -SHAKE_MS - 1;
    this.glowAt = -GLOW_MS - 1;
    this.flashCell = -1;
    this.flashAt = -FLASH_MS - 1;
    this.confetti = [];
    this.confettiUntil = 0;
    this.lastConfettiAt = 0;
    this.timers = [];
    this.drag = null;
    this.helpRect = null;
    this.layout();
    tiles.preload();
    this.boot();
  }

  // ---------- 存档 key ----------

  loadMode() {
    return +getRaw(MODE_KEY, '') === MODE_ENDLESS ? MODE_ENDLESS : MODE_LEVEL;
  }
  loadLevel() {
    return Math.max(1, Math.floor(+(getRaw(LEVEL_KEY, 1) || 1)) || 1);
  }
  loadBest(mode) {
    if (mode === MODE_LEVEL) return Math.max(1, Math.floor(+(getRaw(BEST_KEY + 1, 1) || 1)) || 1);
    return Math.max(0, Math.floor(+(getRaw(BEST_KEY + 2, 0) || 0)) || 0);
  }
  stateKey() {
    return this.mode === MODE_LEVEL ? STATE_KEY : `${STATE_KEY}_2`;
  }

  // ---------- 局面派生 ----------

  get hand() { return this.pile[this.cursor] || null; }
  get preview() { return this.pile[this.cursor + 1] || null; }
  get cardsLeft() { return Math.max(0, this.pile.length - this.cursor); }
  get deckEmpty() { return this.pile.length > 0 && this.cursor >= this.pile.length; }
  get canPlace() {
    return this.phase === PLAY
      && !this.busy
      && !this.helpOpen
      && !this.confirming
      && !!this.hand;
  }

  // ---------- 启动 / 关卡流程 ----------

  boot() {
    if (!this.restore()) {
      if (this.mode === MODE_LEVEL) this.startLevel(this.level);
      else this.startEndless();
    } else {
      // 存档可能正好停在最后一手 / 已达标的那一步；重进不重播撒花与音效（PITFALLS #20）
      this.checkEnd(true);
    }
  }

  resetRound() {
    this.phase = PLAY;
    this.board = new Array(logic.CELLS).fill(null);
    this.score = 0;
    this.played = 0;
    this.combo = 0;
    this.cursor = 0;
    this.busy = false;
    this.helpOpen = false;
    this.confirming = false;
    this.drop = null;
    this.landing = null;
    this.clearing = null;
    this.celebrate = null;
    this.shakeAt = -SHAKE_MS - 1;
    this.glowAt = -GLOW_MS - 1;
    this.flashCell = -1;
    this.flashAt = -FLASH_MS - 1;
    this.confetti = [];
    this.confettiUntil = 0;
    this.lastConfettiAt = 0;
    this.drag = null;
  }

  startLevel(level) {
    this.flushTimers();
    this.level = Math.max(1, Math.floor(level) || 1);
    this.conf = logic.levelConfig(this.level);
    setRaw(LEVEL_KEY, String(this.level));
    if (this.level > this.best) {
      this.best = this.level;
      setRaw(BEST_KEY + 1, String(this.best));
    }
    this.resetRound();
    this.pile = [];
    // 逐张发、逐张进牌堆（发牌只从牌墙取，抽空时牌墙自己重洗）
    for (let i = 0; i < this.conf.deck; i++) this.pile.push(this.wall.draw());
    this.ensurePile(this.cursor + 1 + logic.PREVIEW);
    this.startDeal();
    this.save();
  }

  startEndless() {
    this.flushTimers();
    this.resetRound();
    this.best = this.loadBest(MODE_ENDLESS);
    this.conf = null;
    this.pile = [];
    this.ensurePile(this.cursor + 1 + logic.PREVIEW);
    this.startDeal();
    this.save();
  }

  replayLevel() {
    this.confirming = false;
    if (this.mode === MODE_LEVEL) this.startLevel(this.level);
    else this.startEndless();
  }
  nextLevel() {
    this.startLevel(this.level + 1);
  }
  startNewGame() {
    this.confirming = false;
    if (this.mode === MODE_LEVEL) {
      removeRaw(LEVEL_KEY);
      removeRaw(BEST_KEY + 1);
      this.best = 1;
      this.startLevel(1);
    } else {
      // 无尽：只清已用牌数与当前得分，最高分保留
      this.best = this.loadBest(MODE_ENDLESS);
      this.startEndless();
    }
  }

  toggleMode() {
    if (this.helpOpen || this.confirming) return;
    this.save();
    this.mode = this.mode === MODE_LEVEL ? MODE_ENDLESS : MODE_LEVEL;
    setRaw(MODE_KEY, String(this.mode));
    this.flushTimers();
    this.drag = null;
    this.best = this.loadBest(this.mode);
    this.level = this.loadLevel();
    this.conf = this.mode === MODE_LEVEL ? logic.levelConfig(this.level) : null;
    this.resetRound();
    this.layout();     // 两种模式的存档可能对应不同局面，恢复前先按当前尺寸布局
    if (!this.restore()) {
      if (this.mode === MODE_LEVEL) this.startLevel(this.level);
      else this.startEndless();
    } else {
      this.checkEnd(true);
    }
  }

  // ---------- 存档 ----------

  save() {
    try {
      setRaw(this.stateKey(), JSON.stringify({
        mode: this.mode,
        level: this.level,
        score: this.score,
        played: this.played,
        combo: this.combo,
        phase: this.phase,
        board: this.board.map(item => (item ? { v: item.value } : null)),
        pile: this.pile.map(item => ({ v: item.value })),
        cursor: this.cursor,
      }));
      if (this.mode === MODE_LEVEL) {
        setRaw(LEVEL_KEY, String(this.level));
        const best = Math.max(1, Math.floor(+(getRaw(BEST_KEY + 1, 1) || 1)) || 1);
        if (this.level >= best) {
          this.best = this.level;
          setRaw(BEST_KEY + 1, String(this.best));
        }
      } else if (this.score > this.best) {
        this.best = this.score;
        setRaw(BEST_KEY + 2, String(this.best));
      }
    } catch (e) { /* 存储异常不影响游玩 */ }
  }

  restore() {
    try {
      const raw = getRaw(this.stateKey(), '');
      if (!raw) return false;
      const saved = JSON.parse(raw);
      if (!saved || !Array.isArray(saved.board) || saved.board.length !== logic.CELLS) return false;
      if (saved.mode !== this.mode) return false;
      if (saved.phase !== PLAY && saved.phase !== WON && saved.phase !== OVER) return false;
      if (!Array.isArray(saved.pile) || !saved.pile.length) return false;
      const readTile = (value) => {
        if (value == null) return null;
        const n = value && typeof value === 'object' ? +value.v : +value;
        if (!Number.isFinite(n) || n < 1 || n > logic.KINDS) return undefined;
        return { value: Math.floor(n) };
      };
      const board = saved.board.map(readTile);
      if (board.some(cell => cell === undefined)) return false;
      const pile = saved.pile.map(readTile);
      if (pile.some(cell => !cell)) return false;
      this.level = Math.max(1, Math.floor(+saved.level) || 1);
      this.conf = this.mode === MODE_LEVEL ? logic.levelConfig(this.level) : null;
      this.board = board;
      this.pile = pile;
      // ⚠️ cursor 可以等于 pile.length（最后一张已经打出去），不能钳到 length - 1，
      // 否则退出重进会把最后一张牌又显示在手上（web 分册的存档坑）。
      this.cursor = clamp(Math.floor(+saved.cursor) || 0, 0, this.pile.length);
      this.score = Math.max(0, Math.floor(+saved.score) || 0);
      this.played = Math.max(0, Math.floor(+saved.played) || 0);
      this.combo = Math.max(0, Math.floor(+saved.combo) || 0);
      this.phase = saved.phase;
      this.drop = null;
      this.landing = null;
      this.clearing = null;
      this.celebrate = null;
      this.busy = false;
      this.helpOpen = false;
      this.confirming = false;
      this.drag = null;
      if (this.level > this.best) this.best = this.level;
      this.ensurePile(this.cursor + 1 + logic.PREVIEW);
      this.layout();      // 恢复后必须重新布局（PITFALLS #9）
      this.startDeal();   // 恢复的局面也按左上 → 右下逐张铺开
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- 牌墙 / 手牌 ----------

  ensurePile(need) {
    if (this.mode !== MODE_ENDLESS) return;
    while (this.pile.length < need) this.pile.push(this.wall.draw());
  }

  advanceHand() {
    this.cursor += 1;
    this.played += 1;
    // 无尽模式牌墙无限：丢掉已经翻过去的牌，否则存档会越存越大
    if (this.mode === MODE_ENDLESS && this.cursor > 6) {
      this.pile = this.pile.slice(this.cursor - 1);
      this.cursor = 1;
    }
    this.ensurePile(this.cursor + 1 + logic.PREVIEW);
  }

  // ---------- 落子 ----------

  // idx 上已经有牌时就是「替换」：手上的牌盖掉原来那张（原来那张直接弃掉，同样消耗一张手牌）
  place(idx) {
    if (!this.canPlace || idx < 0 || idx >= logic.CELLS) return;
    const item = this.hand;
    if (!item) return;
    const now = this.clock;
    const from = this.handTileRect();
    const to = this.cellTileRect(idx);
    this.busy = true;
    this.flashCell = idx;
    this.flashAt = now;
    // 棋盘立刻落子（存档永远是一致局面）；落点这一格在飞牌落地前先不画，
    // 看起来就是牌从手上掉进格子里（web 的 .incoming 同款处理）。
    this.board = this.board.slice();
    this.board[idx] = { value: item.value };
    this.drop = {
      value: item.value,
      idx,
      at: now,
      dur: DROP_MS,
      from: { x: from.x + from.w / 2, y: from.y + from.h / 2, w: from.w },
      to: { x: to.x + to.w / 2, y: to.y + to.h / 2, w: to.w },
    };
    this.advanceHand();
    this.save();
  }

  // ---------- 结算 ----------

  settle() {
    const hits = logic.scoringLines(this.board);
    if (hits.length) {
      // 连击：连续每次消除算一连，从第二连起每连一次多 50（中间没消掉就归零）
      this.combo += 1;
      // 一次落子可能同时成好几组：全部计分，并从第二组起每组再加 100，再叠加连击奖励
      const gained = hits.reduce((sum, hit) => sum + hit.trio.score, 0)
        + logic.comboBonus(hits.length)
        + logic.chainBonus(this.combo);
      const top = hits.reduce((a, b) => (b.trio.score > a.trio.score ? b : a));
      this.score += gained;
      this.app.audio.playElimination();
      const cleared = new Set();
      hits.forEach(hit => hit.indices.forEach(i => cleared.add(i)));
      const ghost = [];
      cleared.forEach((i) => {
        if (this.board[i]) ghost.push({ idx: i, value: this.board[i].value });
      });
      this.board = this.board.map((cell, i) => (cleared.has(i) ? null : cell));
      this.clearing = { tiles: ghost, at: this.clock };
      this.announce(top.trio.id, gained, hits.length, this.combo);
    } else if (this.combo) {
      this.combo = 0;   // 这一手没消掉，连击断
    }
    this.save();
    // 结算层等得分浮字露一下脸再出现；没有浮字立即结算
    const delay = this.celebrate ? RESULT_DELAY_MS : 0;
    this.schedule(delay, () => this.checkEnd(false));
  }

  announce(trioId, gained, groups, chain) {
    const tier = scoreTier(gained);
    this.celebrate = {
      name: groups > 1
        ? t('mahjong.comboName').replace('{n}', groups)
        : t(trioId === 'triplet' ? 'mahjong.tripletName' : 'mahjong.runName'),
      chain,
      gained,
      tier,
      at: this.clock,
      dur: 1100 + tier * 220,
    };
    // 连击 / 多消不看分数门槛；普通单次消除要到 300 分才有震屏 + 闪光 + 撒花
    const special = groups > 1 || chain > 1;
    if (gained < FX_MIN && !special) return;
    this.shakeAt = this.clock;
    this.glowAt = this.clock;
    // 小庆祝复用统一 confetti，不另写一套粒子模板（PITFALLS #46）
    confetti.spawn(this.confetti, {
      W,
      H,
      count: Math.min(14, 6 + tier * 3),
      startY: this.boardY + this.boardH * 0.5,
    });
  }

  // silent = true 时只补结算层，不播撒花 / 音效（退出重进不重放）
  checkEnd(silent) {
    if (this.phase !== PLAY) return;
    if (this.mode !== MODE_LEVEL) return;   // 无尽模式牌墙无限、又能替换，没有判负条件
    if (this.score >= this.conf.target) {
      this.phase = WON;
      if (this.level > this.best) {
        this.best = this.level;
        setRaw(BEST_KEY + 1, String(this.best));
      }
      if (!silent) {
        this.startConfetti();
        this.app.audio.playSuccess();
      }
      this.save();
      return;
    }
    // 棋盘满不是死局（点已有牌的格子可以替换），只有「牌用完还没达标」才算输
    if (this.cursor >= this.pile.length) {
      this.phase = OVER;
      if (!silent) this.app.audio.playLose();
      this.save();
    }
  }

  // ---------- 计时器（场景时钟） ----------

  schedule(delay, fn) {
    this.timers.push({ at: this.clock + Math.max(0, delay), fn });
  }
  flushTimers() {
    this.timers.length = 0;
  }
  tickTimers() {
    let guard = 0;
    while (this.timers.length && guard++ < 40) {
      this.timers.sort((a, b) => a.at - b.at);
      if (this.timers[0].at > this.clock) break;
      const job = this.timers.shift();
      job.fn();
    }
  }

  // ---------- 入场 / 撒花 ----------

  startDeal() {
    // 场景时钟从 0 起步，而 0 是「没有入场动画」的哨兵值：
    // 直接写 this.clock 会让首局 / 首次恢复的入场动画永远不播（dealStart === 0）。
    this.dealStart = Math.max(1, this.clock);
    this.dealOrder = new Map();
    let rank = 0;
    // 棋盘下标本身就是行优先（r * SIZE + c），所以这个顺序天然是左上 → 右下
    for (let i = 0; i < logic.CELLS; i++) {
      if (this.board[i]) this.dealOrder.set(i, rank++);
    }
    this.dealDur = Math.max(
      logic.CELLS * 26 + 240,
      rank * DEAL_STEP + DEAL_MS,
    ) + 60;
  }

  startConfetti() {
    this.confetti = [];
    this.confettiUntil = this.clock + CONFETTI_MS;
    this.lastConfettiAt = this.clock - 1000;   // 立刻喷一次
  }

  // ---------- 帧循环 ----------

  update(dt) {
    const delta = Math.min(50, dt || 16);
    if (this.bg) this.bg.update(delta);
    // 帮助 / 二次确认打开时冻结游戏时钟：落子、闪烁、浮字、撒花全部暂停
    if (!this.helpOpen && !this.confirming) {
      this.clock += delta;
      this.now = this.clock;
      this.tickTimers();
      this.advanceFx();
      if (this.now < this.confettiUntil && this.now - this.lastConfettiAt >= 80) {
        this.lastConfettiAt = this.now;
        confetti.spawn(this.confetti, { W, H, startY: H * 0.58, scoreY: this.scoreY });
      }
      this.confetti = confetti.update(this.confetti, delta, H);
    }
    this.now = this.clock;
  }

  // 所有动画都有明确的结束态，不能只在 render 里读时间（PITFALLS #31 / #25）
  advanceFx() {
    const now = this.clock;
    if (this.drop && now >= this.drop.at + this.drop.dur) {
      const idx = this.drop.idx;
      this.drop = null;
      this.busy = false;
      this.landing = { idx, at: now };
      this.settle();
    }
    if (this.clearing && now - this.clearing.at > CLEAR_MS) this.clearing = null;
    if (this.celebrate && now - this.celebrate.at > this.celebrate.dur) this.celebrate = null;
    if (this.landing && now - this.landing.at > LAND_MS) this.landing = null;
    if (this.flashCell >= 0 && now - this.flashAt > FLASH_MS) this.flashCell = -1;
    if (this.dealStart && now - this.dealStart > this.dealDur) {
      this.dealStart = 0;
      this.dealOrder = new Map();
    }
  }

  // ---------- 布局 ----------

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
    const boardTop = this.optY + this.optH + 16;

    this.fabSize = 40;
    this.helpX = W - 16 - this.fabSize;
    this.modeX = this.helpX - this.fabSize - 10;
    this.fabY = H - SAFE_BOTTOM - 16 - this.fabSize;

    // 底部给 FAB 留一条：棋盘底边不能压到 FAB 行
    const reserve = Math.max(SAFE_BOTTOM + 66, H - this.fabY + 8);
    const availH = Math.max(200, H - boardTop - reserve);

    this.pad = 8;
    this.gap = 8;
    // 棋盘宽 ≈ 屏宽 80%（与 web / 小程序一致）；高度方向按 131:168 的牌反算，两者取小
    const capW = Math.min(this.cw, Math.round(W * 0.8));
    const byW = (capW - this.pad * 2 - this.gap * (logic.SIZE - 1)) / logic.SIZE;
    const byH = ((availH - this.pad * 2 - this.gap * (logic.SIZE - 1)) / logic.SIZE) / logic.TILE_RATIO;
    this.cellW = Math.max(36, Math.floor(Math.min(byW, byH)));
    this.cellH = Math.round(this.cellW * logic.TILE_RATIO);
    this.boardW = this.cellW * logic.SIZE + this.gap * (logic.SIZE - 1) + this.pad * 2;
    this.boardH = this.cellH * logic.SIZE + this.gap * (logic.SIZE - 1) + this.pad * 2;
    this.boardX = (W - this.boardW) / 2;
    this.boardY = boardTop;
    this.tileW = this.cellW - 6;
    this.tileH = Math.round(this.tileW * logic.TILE_RATIO);

    this.handW = HAND_W;
    this.handH = Math.round(HAND_W * logic.TILE_RATIO);
    this.nextW = Math.round(HAND_W * PREVIEW_SCALE);
    this.nextH = Math.round(this.nextW * logic.TILE_RATIO);
    this.helpRect = null;
  }

  cellRect(idx) {
    const row = Math.floor(idx / logic.SIZE);
    const col = idx % logic.SIZE;
    return {
      x: this.boardX + this.pad + col * (this.cellW + this.gap),
      y: this.boardY + this.pad + row * (this.cellH + this.gap),
      w: this.cellW,
      h: this.cellH,
    };
  }

  cellTileRect(idx) {
    const r = this.cellRect(idx);
    return {
      x: r.x + (r.w - this.tileW) / 2,
      y: r.y + (r.h - this.tileH) / 2,
      w: this.tileW,
      h: this.tileH,
    };
  }

  // 手牌 + 下一张整组在操作卡左半区居中：手牌占主位、'→' 分隔、下一张 0.8 倍
  handGroup() {
    const leftC = this.cx + this.cw / 4;
    const total = this.handW + 22 + this.nextW;
    return { x: leftC - total / 2, cy: this.optY + this.optH / 2, total };
  }
  handTileRect() {
    const g = this.handGroup();
    return { x: g.x, y: g.cy - this.handH / 2, w: this.handW, h: this.handH };
  }
  nextTileRect() {
    const g = this.handGroup();
    return { x: g.x + this.handW + 22, y: g.cy - this.nextH / 2, w: this.nextW, h: this.nextH };
  }

  cellAt(x, y) {
    for (let i = 0; i < logic.CELLS; i++) {
      const r = this.cellRect(i);
      if (x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h) return i;
    }
    return -1;
  }

  // ---------- 渲染 ----------

  render(c) {
    this.buttons = [];
    this.now = this.clock;
    const T = theme.tokens;
    c.fillStyle = T.bg;
    c.fillRect(0, 0, W, H);
    if (this.bg) this.bg.draw(c, theme.dark);
    this.drawHeader(c);
    this.drawScore(c);
    this.drawOptions(c);
    this.drawBoard(c);
    // 结算层先画、得分浮字后画：过关那一手 0.5s 后出结算层，而浮字还要再飞一会儿，
    // 浮字必须压在结算层上面（与 web 的 .celebrate z-index:3 一致）。
    if (this.phase === WON || this.phase === OVER) this.drawResult(c);
    this.drawDrop(c);
    this.drawCelebration(c);
    this.drawConfetti(c);
    if (!this.helpOpen && !this.confirming) this.drawFabs(c);
    this.drawDragGhost(c);
    if (this.helpOpen) this.drawHelp(c);
    else if (this.confirming) this.drawConfirm(c);
  }

  drawHeader(c) {
    const T = theme.tokens;
    D.text(c, t('mahjong.gameTitle'), W / 2, this.top + this.headerH / 2, {
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
    const levelMode = this.mode === MODE_LEVEL;
    const stats = levelMode
      ? [
        [t('mahjong.level'), String(this.level), T.text],
        [t('mahjong.left'), String(this.cardsLeft), T.text],
        [t('mahjong.score'), String(this.score), T.primary],
        [t('mahjong.target'), String(this.conf ? this.conf.target : 0), T.text],
      ]
      : [
        [t('mahjong.best'), String(this.best), T.text],
        [t('mahjong.used'), String(this.played), T.text],
        [t('mahjong.score'), String(this.score), T.primary],
      ];
    const q = this.cw / stats.length;
    stats.forEach(([label, value, color], i) => {
      // 卡片内竖分隔线统一 24px、垂直居中（PITFALLS #37）
      if (i) D.divider(c, this.cx + q * i, this.scoreY + this.scoreH / 2, 24, T.border, 1);
      D.text(c, label, this.cx + q * (i + 0.5), this.scoreY + 23, {
        size: stats.length > 3 ? 10.5 : 11, color: T.muted, align: 'center',
      });
      D.text(c, value, this.cx + q * (i + 0.5), this.scoreY + 48, {
        size: stats.length > 3 ? 20 : 22, weight: 'bold', color, align: 'center',
      });
    });
    if (levelMode) {
      const total = this.conf ? this.conf.target : 0;
      const progress = total ? this.score / total : 0;
      D.progressBar(c, this.cx, this.scoreY, this.cw, this.scoreH,
        Math.min(1, Math.max(0, progress)), T.border, T.primary);
    }
  }

  drawOptions(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.optY, this.cw, this.optH, T);
    const split = this.cx + this.cw / 2;
    D.divider(c, split, this.optY + this.optH / 2, 24, T.border, 1);
    this.drawHand(c);
    const label = t('mahjong.start');
    const bw = Math.min(112, D.measure(c, label, 13, 'bold') + 24);
    const bx = split + (this.cx + this.cw - split) / 2 - bw / 2;
    const by = this.optY + (this.optH - 32) / 2;
    D.fillRoundRect(c, bx, by, bw, 32, 8, T.primary);
    D.text(c, label, bx + bw / 2, by + 16, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('new', bx, by, bw, 32, () => this.openConfirm());
  }

  drawHand(c) {
    const T = theme.tokens;
    const item = this.hand;
    if (!item) {
      D.text(c, this.deckEmpty ? t('mahjong.deckEmpty') : '—',
        this.cx + this.cw / 4, this.optY + this.optH / 2,
        { size: 12, color: T.muted, align: 'center' });
      return;
    }
    const cur = this.handTileRect();
    const next = this.nextTileRect();
    const dragging = this.drag && this.drag.active;
    c.save();
    c.globalAlpha = dragging ? 0.35 : 1;
    cards.draw(c, logic.tileFace(item.value), cards.MODE_MAHJONG, cur.x, cur.y, cur.w, cur.h, true);
    c.restore();
    // 当前牌：主色描边（下一张压暗 + 0.8 倍）
    D.strokeRoundRect(c, cur.x - 1, cur.y - 1, cur.w + 2, cur.h + 2, 9, T.primary, 2);
    const pv = this.preview;
    if (pv) {
      c.save();
      c.globalAlpha = 0.55;
      cards.draw(c, logic.tileFace(pv.value), cards.MODE_MAHJONG, next.x, next.y, next.w, next.h, true);
      c.restore();
    } else {
      c.save();
      if (c.setLineDash) c.setLineDash([4, 3]);
      D.strokeRoundRect(c, next.x, next.y, next.w, next.h, 8, T.tileBorder, 1);
      c.restore();
    }
  }

  drawBoard(c) {
    const T = theme.tokens;
    const now = this.now;
    let sx = 0;
    let sy = 0;
    if (now - this.shakeAt < SHAKE_MS) {
      const p = clamp((now - this.shakeAt) / SHAKE_MS, 0, 1);
      const amp = (1 - p) * 5;
      sx = Math.sin((now - this.shakeAt) / 22) * amp;
      sy = Math.cos((now - this.shakeAt) / 26) * amp * 0.5;
    }
    c.save();
    c.translate(sx, sy);
    D.fillRoundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 14, T.boardBg);
    // 点阵底纹，裁在棋盘圆角里
    c.save();
    D.roundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 14);
    c.clip();
    c.fillStyle = T.boardDot;
    for (let x = this.boardX + 5; x < this.boardX + this.boardW; x += 10) {
      for (let y = this.boardY + 5; y < this.boardY + this.boardH; y += 10) {
        c.beginPath();
        c.arc(x, y, 1.1, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();

    const can = this.canPlace;
    const hover = this.drag && this.drag.active ? this.drag.cell : -1;
    // 9 个常驻格位：空格用虚线（可放）、有牌用实线（点它 = 替换）
    for (let i = 0; i < logic.CELLS; i++) {
      const r = this.cellRect(i);
      const p = this.cellDealProgress(i);
      if (p <= 0) continue;
      c.save();
      c.globalAlpha = Math.min(1, p);
      if (this.board[i]) {
        D.fillRoundRect(c, r.x, r.y, r.w, r.h, 8, 'rgba(255,255,255,0.08)');
        D.strokeRoundRect(c, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 8, T.tileBorder, 1);
      } else if (can) {
        c.save();
        if (c.setLineDash) c.setLineDash([4, 3]);
        D.strokeRoundRect(c, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 8, T.primary, 1);
        c.restore();
      } else {
        D.strokeRoundRect(c, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 8, T.tileBorder, 1);
      }
      if (hover === i) D.strokeRoundRect(c, r.x + 1, r.y + 1, r.w - 2, r.h - 2, 8, T.primary, 2);
      c.restore();
    }

    for (let i = 0; i < logic.CELLS; i++) {
      if (!this.board[i]) continue;
      if (this.drop && this.drop.idx === i) continue;   // 落点先隐身，等飞牌落地
      this.drawBoardTile(c, i);
    }
    this.drawClearing(c);

    // 刚点过的格子：实线主色高亮，450ms 内淡出
    if (this.flashCell >= 0 && now - this.flashAt <= FLASH_MS) {
      const r = this.cellRect(this.flashCell);
      const p = clamp((now - this.flashAt) / FLASH_MS, 0, 1);
      c.save();
      c.globalAlpha = 1 - p * 0.7;
      D.strokeRoundRect(c, r.x - 1, r.y - 1, r.w + 2, r.h + 2, 9, T.primary, 2);
      c.restore();
    }

    // 300+ / 连击 / 多消：棋盘外圈闪光
    if (now - this.glowAt < GLOW_MS) {
      const p = clamp((now - this.glowAt) / GLOW_MS, 0, 1);
      c.save();
      c.globalAlpha = (1 - p) * 0.85;
      c.strokeStyle = T.primary;
      c.lineWidth = 3 + 5 * Math.sin(p * Math.PI);
      D.roundRect(c, this.boardX - 2, this.boardY - 2, this.boardW + 4, this.boardH + 4, 16);
      c.stroke();
      c.restore();
    }

    if (this.phase === PLAY && can) {
      for (let i = 0; i < logic.CELLS; i++) {
        const r = this.cellRect(i);
        this.addButton(`cell-${i}`, r.x, r.y, r.w, r.h, () => this.place(i));
      }
    }
    c.restore();
  }

  cellDealProgress(idx) {
    if (!this.dealStart) return 1;
    return clamp((this.now - this.dealStart - idx * 26) / 200, 0, 1);
  }

  drawBoardTile(c, idx) {
    const item = this.board[idx];
    if (!item) return;
    const now = this.now;
    let p = 1;
    if (this.dealStart) {
      const rank = this.dealOrder.has(idx) ? this.dealOrder.get(idx) : idx;
      p = clamp((now - this.dealStart - rank * DEAL_STEP) / DEAL_MS, 0, 1);
    }
    if (p <= 0) return;
    let scale = 0.45 + 0.55 * easeOut(p);
    if (this.landing && this.landing.idx === idx) {
      const lp = clamp((now - this.landing.at) / LAND_MS, 0, 1);
      scale *= 1 + 0.1 * Math.sin(Math.PI * lp);
    }
    const r = this.cellTileRect(idx);
    c.save();
    c.globalAlpha = p;
    c.translate(r.x + r.w / 2, r.y + r.h / 2);
    c.scale(scale, scale);
    cards.draw(c, logic.tileFace(item.value), cards.MODE_MAHJONG, -r.w / 2, -r.h / 2, r.w, r.h, true);
    c.restore();
  }

  // 被消掉的牌：棋盘上已经置空，这里用浮影播「闪烁 → 缩小消失」
  drawClearing(c) {
    const fx = this.clearing;
    if (!fx) return;
    const p = clamp((this.now - fx.at) / CLEAR_MS, 0, 1);
    const alpha = blinkAlpha(p);
    const scale = p > 0.66 ? 1 - 0.3 * ((p - 0.66) / 0.34) : 1;
    fx.tiles.forEach(({ idx, value }) => {
      const r = this.cellTileRect(idx);
      c.save();
      c.globalAlpha = alpha;
      c.translate(r.x + r.w / 2, r.y + r.h / 2);
      c.scale(scale, scale);
      cards.draw(c, logic.tileFace(value), cards.MODE_MAHJONG, -r.w / 2, -r.h / 2, r.w, r.h, true);
      c.restore();
    });
  }

  drawDrop(c) {
    const d = this.drop;
    if (!d) return;
    const p = clamp((this.now - d.at) / d.dur, 0, 1);
    const ex = easeOut(p);
    const ey = p * p;   // 垂直加速：从手牌位置「落」进格子
    const w = d.from.w + (d.to.w - d.from.w) * ex;
    const h = w * logic.TILE_RATIO;
    const cx = d.from.x + (d.to.x - d.from.x) * ex;
    const cy = d.from.y + (d.to.y - d.from.y) * ey;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.22)';
    c.shadowBlur = 10;
    c.shadowOffsetY = 4;
    cards.draw(c, logic.tileFace(d.value), cards.MODE_MAHJONG, cx - w / 2, cy - h / 2, w, h, true);
    c.restore();
  }

  drawDragGhost(c) {
    if (!this.drag || !this.drag.active) return;
    const item = this.hand;
    if (!item) return;
    const w = this.handW;
    const h = this.handH;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.28)';
    c.shadowBlur = 12;
    c.shadowOffsetY = 4;
    cards.draw(c, logic.tileFace(item.value), cards.MODE_MAHJONG,
      this.drag.x - w / 2, this.drag.y - h / 2, w, h, true);
    c.restore();
  }

  drawCelebration(c) {
    const e = this.celebrate;
    if (!e) return;
    const T = theme.tokens;
    const p = clamp((this.now - e.at) / e.dur, 0, 1);
    const scale = p < 0.28 ? 0.4 + 0.76 * (p / 0.28)
      : p < 0.44 ? 1.16 - 0.16 * ((p - 0.28) / 0.16) : 1;
    const alpha = p > 0.78 ? 1 - (p - 0.78) / 0.22 : 1;
    const rise = p > 0.44 ? ((p - 0.44) / 0.56) * 26 : 0;
    const size = e.tier === 3 ? 24 : e.tier === 2 ? 21 : 18;
    const chainSize = 13;
    const scoreSize = 14;
    const chainText = e.chain > 1 ? t('mahjong.chainName').replace('{n}', e.chain) : '';
    const cx = this.boardX + this.boardW / 2;
    const cy = this.boardY + this.boardH * 0.5 - rise;
    c.save();
    c.globalAlpha = alpha;
    c.translate(cx, cy);
    c.scale(scale, scale);
    const widest = Math.max(
      D.measure(c, e.name, size, 'bold'),
      chainText ? D.measure(c, chainText, chainSize, 'bold') : 0,
      D.measure(c, `+${e.gained}`, scoreSize, 'bold'),
    );
    const w = Math.min(this.boardW - 8, widest + 36);
    const h = (chainText ? size * 1.22 + chainSize * 1.3 : size * 1.22) + scoreSize * 1.5 + 16;
    c.save();
    c.shadowColor = 'rgba(35,128,78,0.5)';
    c.shadowBlur = e.tier * 8;
    D.fillRoundRect(c, -w / 2, -h / 2, w, h, 8, T.primary);
    c.restore();
    let ly = -h / 2 + 8 + size * 0.6;
    D.text(c, e.name, 0, ly, { size, weight: 'bold', color: '#ffffff', align: 'center' });
    if (chainText) {
      ly += size * 0.6 + chainSize * 0.6 + 2;
      D.text(c, chainText, 0, ly, {
        size: chainSize, weight: 'bold', color: 'rgba(255,255,255,0.95)', align: 'center',
      });
    }
    D.text(c, `+${e.gained}`, 0, h / 2 - 6 - scoreSize * 0.65, {
      size: scoreSize, weight: 'bold', color: 'rgba(255,255,255,0.92)', align: 'center',
    });
    c.restore();
  }

  // 结算层只盖棋盘（不挡上方分数卡）；帮助 / 模式 FAB 仍然显示（PITFALLS #10）
  drawResult(c) {
    if (!this.resultVisible()) return;
    const T = theme.tokens;
    const win = this.phase === WON;
    const overlay = theme.dark ? 'rgba(38,38,38,0.94)' : 'rgba(250,248,239,0.94)';
    D.fillRoundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 14, overlay);
    const cx = this.boardX + this.boardW / 2;
    const cy = this.boardY + this.boardH / 2;
    if (win) {
      D.text(c, `🎉🎉 ${t('mahjong.tipWin')} 🎉🎉`, cx, cy - 64, {
        size: Math.min(18, this.boardW / 17), weight: 'bold', color: T.win, align: 'center',
      });
      D.text(c, t('mahjong.levelDone').replace('{n}', this.level), cx, cy - 36, {
        size: 13, color: T.muted, align: 'center',
      });
      D.text(c, String(this.score), cx, cy - 8, {
        size: 26, weight: 'bold', color: T.text, align: 'center',
      });
      const gap = 10;
      const l1 = t('mahjong.replayLevel');
      const l2 = t('mahjong.nextLevel');
      const w1 = Math.min(122, D.measure(c, l1, 12, 'bold') + 24);
      const w2 = Math.min(112, D.measure(c, l2, 12, 'bold') + 24);
      const bx = cx - (w1 + w2 + gap) / 2;
      const by = cy + 30;
      // 「重玩本关」= 橙色描边按钮（与全局约定一致）
      D.strokeRoundRect(c, bx, by, w1, 32, 8, T.god, 1);
      D.text(c, l1, bx + w1 / 2, by + 16, { size: 12, weight: 'bold', color: T.god, align: 'center' });
      this.addButton('result-replay', bx, by, w1, 32, () => this.replayLevel());
      D.fillRoundRect(c, bx + w1 + gap, by, w2, 32, 8, T.primary);
      D.text(c, l2, bx + w1 + gap + w2 / 2, by + 16, {
        size: 12, weight: 'bold', color: '#ffffff', align: 'center',
      });
      this.addButton('result-next', bx + w1 + gap, by, w2, 32, () => this.nextLevel());
    } else {
      D.text(c, `💤💤 ${t('mahjong.tipLost')} 💤💤`, cx, cy - 56, {
        size: Math.min(17, this.boardW / 18), weight: 'bold', color: T.lose, align: 'center',
      });
      D.text(c, `${this.score} / ${this.conf ? this.conf.target : 0}`, cx, cy - 14, {
        size: 24, weight: 'bold', color: T.text, align: 'center',
      });
      const label = t('mahjong.replayLevel');
      const bw = Math.min(128, D.measure(c, label, 12, 'bold') + 24);
      const bx = cx - bw / 2;
      const by = cy + 28;
      D.strokeRoundRect(c, bx, by, bw, 32, 8, T.god, 1);
      D.text(c, label, cx, by + 16, { size: 12, weight: 'bold', color: T.god, align: 'center' });
      this.addButton('result-replay', bx, by, bw, 32, () => this.replayLevel());
    }
  }

  drawConfetti(c) {
    if (this.confetti.length) confetti.draw(c, this.confetti);
  }

  drawFabs(c) {
    this.drawRoundFab(c, this.helpX, this.fabY, 'help', '?', () => this.openHelp(), 'help');
    const levelMode = this.mode === MODE_LEVEL;
    // 闯关 = 奖杯、无尽 = 无限（web 顶栏同款语义）。图标字体里暂时没有这两个 glyph，
    // 字体是共享资源、不在本游戏改动范围内，所以先用文字兜底；以后补 glyph 会自动走图标。
    this.drawRoundFab(c, this.modeX, this.fabY, levelMode ? 'trophy' : 'infinity',
      levelMode ? '🏆' : '∞', () => this.toggleMode(), 'mode');
  }

  drawRoundFab(c, x, y, iconKey, fallback, onTap, id) {
    const T = theme.tokens;
    const size = this.fabSize;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.12)';
    c.shadowBlur = 10;
    c.shadowOffsetY = 2;
    D.circle(c, x + size / 2, y + size / 2, size / 2, T.card);
    c.restore();
    if (!icons.glyph(iconKey) || !icons.draw(c, iconKey, x + size / 2, y + size / 2, 20, T.primary)) {
      const emoji = fallback === '🏆';
      D.text(c, fallback, x + size / 2, y + size / 2 + (emoji ? 1 : 0), {
        size: emoji ? 19 : 24,
        weight: 'bold',
        color: T.primary,
        align: 'center',
        family: emoji ? '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif' : undefined,
      });
    }
    this.addButton(`fab-${id}`, x, y, size, size, onTap);
  }

  // ---------- 弹层 ----------

  openHelp() {
    if (this.confirming) return;
    this.helpOpen = true;
  }

  openConfirm() {
    if (this.helpOpen) return;
    this.confirming = true;
    this.drag = null;
  }

  drawHelp(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillRect(0, 0, W, H);
    const x = 18;
    const w = W - 36;
    const innerW = w - 36;
    const headerH = 54;
    const footerH = 52;
    const maxH = H - SAFE_BOTTOM - 24;
    const keys = ['helpMsg', 'help1', 'help2', 'help3'];
    let size = 12.5;
    let lineH = 17;
    let blocks = [];
    let contentH = 0;
    // 英文文案比中文长：从 12.5 一路缩到 10.5，挑第一个放得下的字号
    for (let step = 0; step < 5; step++) {
      size = 12.5 - step * 0.5;
      lineH = size + 4.5;
      blocks = [];
      contentH = 0;
      keys.forEach((key) => {
        const value = t(`mahjong.${key}`);
        if (value === `mahjong.${key}`) return;
        const lines = D.wrapText(c, value, innerW, size);
        blocks.push({ lines, gap: 7 });
        contentH += lines.length * lineH + 7;
      });
      if (headerH + contentH + 10 + footerH <= maxH) break;
    }
    const boxH = contentH + 4;
    const h = Math.min(maxH, headerH + boxH + footerH);
    const y = Math.max(12, (H - h) / 2);
    this.helpRect = { x, y, w, h };
    D.card(c, x, y, w, h, T);
    D.text(c, '?', x + 24, y + 28, { size: 23, weight: 'bold', color: T.primary });
    D.text(c, t('help'), x + 50, y + 28, { size: 16, weight: 'bold', color: T.text });
    const viewTop = y + headerH;
    const viewH = Math.max(20, h - headerH - footerH);
    c.save();
    D.roundRect(c, x + 1, viewTop, w - 2, viewH, 8);
    c.clip();
    let ly = viewTop + 4;
    blocks.forEach((block) => {
      block.lines.forEach((line) => {
        if (line) D.text(c, line, x + 18, ly, { size, color: T.text });
        ly += lineH;
      });
      ly += block.gap;
    });
    c.restore();
    // 全屏遮罩先加，面板按钮后加（PITFALLS #12）
    this.addButton('help-mask', 0, 0, W, H, () => { this.helpOpen = false; });
    const bw = 110;
    const bx = x + (w - bw) / 2;
    const by = y + h - 42;
    D.fillRoundRect(c, bx, by, bw, 30, 8, T.primary);
    D.text(c, t('mahjong.confirmText'), bx + bw / 2, by + 15, {
      size: 12, weight: 'bold', color: '#ffffff', align: 'center',
    });
    this.addButton('help-ok', bx, by, bw, 30, () => { this.helpOpen = false; });
  }

  drawConfirm(c) {
    const T = theme.tokens;
    const endless = this.mode === MODE_ENDLESS;
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(0, 0, W, H);
    const w = Math.min(W - 48, 330);
    const h = 214;
    const x = (W - w) / 2;
    const y = (H - h) / 2;
    D.card(c, x, y, w, h, T);
    D.text(c, t('mahjong.confirmTitle'), x + 20, y + 32, {
      size: 16, weight: 'bold', color: T.text,
    });
    const msg = endless ? t('mahjong.confirmMsgEndless') : t('mahjong.confirmMsgLevel');
    D.wrapText(c, msg, w - 40, 12.5).slice(0, 4).forEach((line, i) => {
      D.text(c, line, x + 20, y + 60 + i * 19, { size: 12.5, color: T.muted });
    });
    this.addButton('confirm-mask', 0, 0, W, H, () => { this.confirming = false; });
    const gap = 8;
    const count = endless ? 2 : 3;
    const bw = (w - 40 - gap * (count - 1)) / count;
    const by = y + h - 48;
    let bx = x + 20;
    D.strokeRoundRect(c, bx, by, bw, 32, 8, T.border, 1);
    D.text(c, t('mahjong.cancel'), bx + bw / 2, by + 16, {
      size: 11, weight: 'bold', color: T.text, align: 'center',
    });
    this.addButton('confirm-cancel', bx, by, bw, 32, () => { this.confirming = false; });
    if (!endless) {
      bx = x + 20 + bw + gap;
      D.strokeRoundRect(c, bx, by, bw, 32, 8, T.god, 1);
      D.text(c, t('mahjong.replayLevel'), bx + bw / 2, by + 16, {
        size: 11, weight: 'bold', color: T.god, align: 'center',
      });
      this.addButton('confirm-replay', bx, by, bw, 32, () => this.replayLevel());
    }
    bx = x + 20 + (bw + gap) * (count - 1);
    D.fillRoundRect(c, bx, by, bw, 32, 8, T.primary);
    D.text(c, t('mahjong.confirmNew'), bx + bw / 2, by + 16, {
      size: 11, weight: 'bold', color: '#ffffff', align: 'center',
    });
    this.addButton('confirm-new', bx, by, bw, 32, () => this.startNewGame());
  }

  // ---------- 输入 ----------

  onTouchStart(p) {
    if (!p || !this.canPlace) return;
    const r = this.handTileRect();
    if (p.x < r.x - 10 || p.x > r.x + r.w + 10) return;
    if (p.y < r.y - 10 || p.y > r.y + r.h + 10) return;
    this.drag = { x: p.x, y: p.y, active: false, cell: -1 };
  }

  onTouchMove(p) {
    if (!this.drag || !p) return;
    if (!this.drag.active) {
      const dx = p.x - this.drag.x;
      const dy = p.y - this.drag.y;
      if (dx * dx + dy * dy < 36) return;   // 6px 死区：轻点不会被当成拖动
      this.drag.active = true;
    }
    this.drag.x = p.x;
    this.drag.y = p.y;
    this.drag.cell = this.cellAt(p.x, p.y);
  }

  onTouchEnd(p) {
    const drag = this.drag;
    this.drag = null;
    if (!drag || !drag.active || !p) return;
    const idx = this.cellAt(p.x, p.y);
    if (idx >= 0) this.place(idx);
  }

  // ---------- 生命周期 ----------

  onTheme() { this.layout(); }
  onResize() { this.layout(); }
  onHide() { this.save(); }
  onShow() {}
}

module.exports = MahjongScene;
