// 单人视频扑克（德州扑克）· 小游戏 canvas 场景。
// 布局：标题栏（home + 标题）→ 资产卡（资产 / 奖金 / 下注，24px 分隔线）
//        → 倍数表（手数统计 + 猜大小开关 + 8 条牌型倍数）→ 5 张牌（保留标签 + 胜负浮层）
//        → 猜大小卡（历史 + 当前翻牌）→ 操作卡（发牌 / 换牌 / 大 / 小 / 结算 / 重置）→ 帮助 FAB。
// 牌面（正面 / 背面 / 边框 / 圆角 / 比例）统一走 core/cards 的 MODE_POKER，不在这里另画一套。
const { W, H, SAFE_BOTTOM } = require('../../core/canvas');
const HEADER = require('../../core/header');
const { Scene } = require('../../core/app');
const theme = require('../../core/theme');
const { t } = require('../../core/i18n');
const { getRaw, setRaw } = require('../../core/storage');
const D = require('../../core/draw');
const ParticleField = require('../../core/particles');
const icons = require('../../core/icons');
const cards = require('../../core/cards');
const confetti = require('../../core/confetti');
const fx = require('../../core/fx');
const logic = require('./rules');
const i18nDict = require('./i18n');

const coreI18n = require('../../core/i18n');
if (!coreI18n.__pokerRegistered) {
  coreI18n.register('poker', i18nDict);
  coreI18n.__pokerRegistered = true;
}

const MODE_POKER = cards.MODE_POKER;

// 阶段：0 等待下注 → 1 第一次发牌（可保留）→ 赢（可猜大小 / 结算）→ 输 / 猜大小输
const WAIT = 'wait';
const FIRST = 'first';
const GUESS = 'guess';
const LOSE = 'lose';
const GUESS_LOSE = 'guesslose';

// 存档 key 沿用 web 的 __poker_game_* 前缀（constants.js）；state 是本移植新增的局中续玩。
const KEYS = {
  total: '__poker_game_total',
  bet: '__poker_game_bet',
  dice: '__poker_game_dice',
  state: '__poker_game_state',
};

const DEAL_INTERVAL = 170; // 发牌 / 换牌逐张错峰（row-major，从左到右）
const FLIP_MS = 260; // 一张牌翻面 0 → 1 的时长
const ENTER_MS = 220; // 牌出现的 pop 时长
const GUESS_FLICKER = 100; // 猜大小：每秒换 10 张牌（web 同款）
const BET_DELAY = 320; // 长按下注：先走一步，停 320ms 再连发
const BET_REPEAT = 60; // 连发间隔 ≈ 16 步/秒
const HOLD_COLOR = '#e00000';
const BIG_COLOR = '#2c6aad'; // 猜大（web --poker-big-bg）
const SMALL_COLOR = '#7550ad'; // 猜小（web --poker-small-bg）
const SETTLE_COLOR = '#b45309'; // 结算 / 重置（web --poker-settle-bg）
const TOAST_MS = 1900;
const MAX_HISTORY = 24;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function easeOut(p) { return 1 - Math.pow(1 - p, 3); }

class PokerScene extends Scene {
  constructor(app) {
    super(app);
    this.bg = new ParticleField();
    this.now = Date.now();
    this.total = this.loadTotal();
    this.bet = this.loadBet();
    this.dice = this.loadDice();
    this.stage = WAIT;
    this.cards = this.freshCards();
    this.bonus = 0;
    this.result = { times: 0, key: '' };
    this.guesses = [];
    this.stats = { hands: 0, wins: 0, peak: 0 };
    this.anim = '';
    this.dealDoneAt = 0;
    this.drawDoneAt = 0;
    this.animStart = 0;
    this.guessCard = null;
    this.guessScroll = 0;
    this.guessDrag = null;
    this.nextGuessAt = 0;
    this.helpOpen = false;
    this.betPress = null;
    this.pressedDir = 0;
    this.betMinusHit = null;
    this.betPlusHit = null;
    this.toast = null;
    this.confetti = [];
    this.confettiUntil = 0;
    this.lastConfettiAt = 0;
    this.resultAt = 0;
    this.totalPulseAt = 0;
    this.bonusPulseAt = 0;
    this.cardId = 0;
    this.layout();
    this.restore();
    // 和 web 一致：进游戏就把当前资产 / 下注落档。dice 不写 —— 「从没动过」和「主动关掉」要能区分。
    this.saveTotal();
    setRaw(KEYS.bet, String(this.bet));
  }

  // ---------- storage ----------
  loadTotal() {
    const raw = getRaw(KEYS.total, '');
    const n = Number(raw);
    return raw !== '' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : logic.DEFAULT_TOTAL;
  }
  loadBet() {
    const raw = getRaw(KEYS.bet, '');
    const n = Number(raw);
    if (raw === '' || !Number.isFinite(n)) return logic.INIT_BET;
    return clamp(Math.round(n), logic.MIN_BET, logic.MAX_BET);
  }
  loadDice() {
    // 猜大小默认开启：没有 key（从没动过）→ 开；显式存 '0' 才是关。
    const raw = getRaw(KEYS.dice, '');
    return raw === '' ? true : String(raw) === '1';
  }
  saveTotal() {
    setRaw(KEYS.total, String(Math.max(0, Math.round(this.total))));
  }

  save() {
    try {
      setRaw(KEYS.state, JSON.stringify({
        v: 1,
        stage: this.stage,
        cards: this.cards.map(c => (c.item ? [c.item.num, c.item.type] : null)),
        holds: this.cards.map(c => !!c.hold),
        bonus: this.bonus,
        result: this.result && this.result.times ? this.result.times : 0,
        guesses: this.guesses.slice(-MAX_HISTORY).map(g => [g.num, g.type, g.big ? 1 : 0, g.win]),
        stats: { hands: this.stats.hands, wins: this.stats.wins, peak: this.stats.peak },
      }));
      this.saveTotal();
      setRaw(KEYS.bet, String(this.bet));
    } catch (e) { /* ignore */ }
  }

  restore() {
    try {
      const raw = getRaw(KEYS.state, '');
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || s.v !== 1) return false;
      if ([FIRST, GUESS, LOSE, GUESS_LOSE].indexOf(s.stage) < 0) return false;
      if (!Array.isArray(s.cards) || s.cards.length !== logic.LEN) return false;
      if (!Array.isArray(s.holds) || s.holds.length !== logic.LEN) return false;
      const parsed = [];
      for (let i = 0; i < logic.LEN; i++) {
        const c = s.cards[i];
        if (!Array.isArray(c) || c.length !== 2) return false;
        const card = { num: Math.round(+c[0]), type: String(c[1]) };
        if (!logic.isValid(card)) return false;
        parsed.push({ num: card.num, type: card.type, hold: !!s.holds[i] });
      }
      const bonus = Math.max(0, Math.floor(+s.bonus || 0));
      const times = Math.max(0, Math.floor(+s.result || 0));
      const rule = logic.byTimes(times);
      if (s.stage === GUESS && (bonus <= 0 || !rule.key)) return false;

      this.stage = s.stage;
      this.bonus = s.stage === GUESS ? bonus : 0;
      this.result = s.stage === GUESS ? rule : { times: 0, key: '' };
      this.cards = parsed.map(c => ({
        item: { num: c.num, type: c.type },
        hold: c.hold,
        flip: 1,
        flipTarget: 1,
        pending: null,
        flipBack: false,
        entered: true,
        enterAt: 0,
        at: 0,
        popAt: 0,
        id: ++this.cardId,
      }));
      this.guesses = (Array.isArray(s.guesses) ? s.guesses : [])
        .filter(g => Array.isArray(g) && g.length === 4
          && logic.isValid({ num: g[0], type: g[1] })
          && [1, 0, -1].indexOf(+g[3]) >= 0)
        .slice(-MAX_HISTORY)
        .map(g => ({ num: Math.round(+g[0]), type: String(g[1]), big: !!+g[2], win: +g[3] }));
      const st = s.stats || {};
      this.stats = {
        hands: Math.max(0, Math.floor(+st.hands || 0)),
        wins: Math.max(0, Math.floor(+st.wins || 0)),
        peak: Math.max(0, Math.floor(+st.peak || 0)),
      };
      this.anim = '';
      this.resultAt = this.stage === GUESS ? Date.now() : 0;
      this.dealDoneAt = 0;
      this.drawDoneAt = 0;
      if (this.stage === GUESS && this.dice) {
        this.guessCard = logic.randomCard();
        this.nextGuessAt = Date.now() + GUESS_FLICKER;
      }
      // 恢复后必须重新布局（PITFALLS #9）：本场景布局只看 dice / 画布尺寸。
      this.layout();
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- 布局 ----------
  layout() {
    this.cw = Math.min(W - 32, 440);
    this.cx = (W - this.cw) / 2;
    this.top = HEADER.TOP;
    this.headerH = HEADER.HEIGHT;
    this.homeRect = { ...HEADER.HOME_RECT };

    // 严格按小程序顺序：牌型倍数区在上，金额区其次，然后手牌 / 猜大小 / 操作区。
    this.rulesY = this.top + this.headerH + 6;
    this.rulesCaption = 14;
    this.ruleRowH = 21;
    this.rulesH = this.rulesCaption + 4 * this.ruleRowH + 12;
    this.scoreY = this.rulesY + this.rulesH + 14;
    this.scoreH = 74;
    this.cardsY = this.scoreY + this.scoreH + 14;

    this.fabSize = 48;
    this.fabX = W - 16 - this.fabSize;
    this.fabY = H - SAFE_BOTTOM - 16 - this.fabSize;

    this.actionH = 54;
    this.holdH = 18;
    this.cardGap = 6;
    const padX = 14;
    // 5 张牌先按宽度取自然尺寸（2:3），屏幕矮的时候再按高度缩。
    this.cardW = Math.max(24, Math.min(76, Math.floor((this.cw - padX * 2 - this.cardGap * 4) / logic.LEN)));
    this.cardH = Math.round(this.cardW * 1.5);
    // 小程序 .guess-area = 200rpx，高 100~104px；历史/当前都使用 mini CardView 比例 76:114rpx。
    this.guessH = Math.round(W * 200 / 750);
    this.miniW = Math.max(30, Math.round(W * 76 / 750));
    this.miniH = Math.round(this.miniW * 114 / 76);
    this.curW = this.miniW;
    this.curH = this.miniH;

    const natural = this.cardH + this.holdH + 18;
    const extra = clamp((H - 667) * 0.35, 0, 60);
    let maxCards = this.maxCardsFor(this.guessH);
    // 带刘海 / 底部安全区的矮屏：猜大小卡换成紧凑尺寸，把高度让给牌桌。
    if (this.dice && maxCards < 120) {
      this.guessH = 78;
      this.miniW = 30;
      this.miniH = 45;
      this.curW = 38;
      this.curH = 57;
      maxCards = this.maxCardsFor(this.guessH);
    }
    // 关掉猜大小时把空出来的高度给牌桌（像一张更大的牌桌，而不是留一片空白）。
    const want = natural + extra + (this.dice ? 0 : 96);
    this.cardsH = Math.max(60, Math.min(maxCards, want));
    if (this.cardsH < natural) {
      const roomH = Math.max(24, this.cardsH - this.holdH - 12);
      this.cardW = Math.max(22, Math.min(this.cardW, Math.floor(roomH / 1.5)));
      this.cardH = Math.round(this.cardW * 1.5);
    }
    this.cardsH = Math.max(this.cardsH, this.cardH + this.holdH + 12);
    this.cardX = this.cx + (this.cw - (this.cardW * logic.LEN + this.cardGap * (logic.LEN - 1))) / 2;

    this.guessY = this.cardsY + this.cardsH + 12;
    this.actionY = this.cardsY + this.cardsH + 12 + (this.dice ? this.guessH + 12 : 0);
  }

  maxCardsFor(guessH) {
    const below = this.dice ? guessH + 12 : 0;
    return this.fabY - 8 - 12 - below - this.actionH - this.cardsY;
  }

  freshCards() {
    // 空白牌桌：5 张牌背（item 为空时 cards.draw 画的是牌背）。
    return Array.from({ length: logic.LEN }, () => ({
      item: null,
      hold: false,
      flip: 0,
      flipTarget: 0,
      pending: null,
      flipBack: false,
      entered: true,
      enterAt: 0,
      at: 0,
      popAt: 0,
      id: ++this.cardId,
    }));
  }

  // ---------- 回合流程 ----------
  roll() {
    if (this.helpOpen || this.anim) return;
    if (this.stage === WAIT) this.dealNewHand();
    else if (this.stage === FIRST) this.drawNewCards();
  }

  dealNewHand() {
    const now = Date.now();
    if (this.total <= 0) {
      // web 用 alert，这里改成卡片上方的 toast，不打断节奏
      this.showToast(t('poker.bankrupt'));
      this.total = logic.DEFAULT_TOTAL;
      this.saveTotal();
    }
    if (this.total >= this.bet) {
      this.total -= this.bet;
    } else {
      this.bet = Math.max(logic.MIN_BET, this.total);
      this.total = 0;
      setRaw(KEYS.bet, String(this.bet));
    }
    this.saveTotal();
    this.stats.hands += 1;
    this.bonus = 0;
    this.result = { times: 0, key: '' };
    this.guesses = [];
    this.guessCard = null;
    this.guessScroll = 0;
    this.guessDrag = null;
    this.nextGuessAt = 0;

    const taken = [];
    this.cards = Array.from({ length: logic.LEN }, (_, i) => {
      const item = logic.randomCard(taken);
      taken.push(logic.keyOf(item));
      return {
        item,
        hold: false,
        flip: 0,
        flipTarget: 0,
        pending: null,
        flipBack: false,
        entered: false, // 到点才出现：行优先、从左到右逐张
        enterAt: 0,
        at: now + 120 + i * DEAL_INTERVAL,
        popAt: 0,
        id: ++this.cardId,
      };
    });
    this.anim = 'deal';
    this.animStart = now;
    this.dealDoneAt = now + 120 + (logic.LEN - 1) * DEAL_INTERVAL + FLIP_MS + 150;
  }

  drawNewCards() {
    const now = Date.now();
    const taken = this.cards.map(c => logic.keyOf(c.item)).filter(Boolean);
    let k = 0;
    this.cards.forEach((card) => {
      if (card.hold) { card.popAt = 0; return; }
      const item = logic.randomCard(taken);
      taken.push(logic.keyOf(item));
      card.pending = item;
      card.flipBack = false;
      card.at = now + 90 + k * DEAL_INTERVAL;
      k += 1;
    });
    this.anim = 'draw';
    this.animStart = now;
    this.drawDoneAt = now + 90 + Math.max(0, k - 1) * DEAL_INTERVAL + FLIP_MS * 2 + 120;
  }

  finishDeal() {
    this.cards.forEach((card) => {
      card.entered = true;
      if (!card.enterAt) card.enterAt = this.now;
      card.flip = 1;
      card.flipTarget = 1;
    });
    this.anim = '';
    this.stage = FIRST;
    this.save();
  }

  finishDraw(silent) {
    this.cards.forEach((card) => {
      if (card.pending) { card.item = card.pending; card.pending = null; }
      card.flipBack = false;
      card.flip = 1;
      card.flipTarget = 1;
      card.entered = true;
      if (!card.enterAt) card.enterAt = this.now;
    });
    this.resolveHand(!!silent);
  }

  // 评牌 → 中奖进 GUESS（可猜大小 / 结算），没中直接 LOSE
  resolveHand(silent) {
    this.anim = '';
    const res = logic.evaluate(this.cards.map(c => c.item));
    const now = Date.now();
    if (!res.times) {
      this.stage = LOSE;
      this.result = { times: 0, key: '' };
      this.bonus = 0;
      this.guessCard = null;
      this.nextGuessAt = 0;
      if (!silent) this.app.audio.playLose();
      this.save();
      return;
    }
    this.stage = GUESS;
    this.result = res;
    this.bonus = this.bet * res.times;
    this.resultAt = now;
    this.bonusPulseAt = now;
    this.stats.wins += 1;
    this.stats.peak = Math.max(this.stats.peak, this.bonus);
    if (this.dice) {
      this.guessCard = logic.randomCard();
      this.nextGuessAt = now + GUESS_FLICKER;
    }
    if (!silent) {
      this.app.audio.playSuccess();
    }
    this.save();
  }

  onCardTap(index) {
    // 只有「第一次发牌后、没有动画」时才能保留；动画期间的输入锁只针对牌本身，
    // home / 帮助 / 倍数表开关始终可点。
    if (this.stage !== FIRST || this.anim || this.helpOpen) return;
    const card = this.cards[index];
    if (!card || !card.entered || !card.item) return;
    card.hold = !card.hold;
    card.popAt = Date.now();
    this.save();
  }

  guess(big) {
    if (this.stage !== GUESS || this.helpOpen || !this.dice) return;
    const card = this.guessCard || logic.randomCard();
    const win = logic.guessResult(card, !!big);
    this.guesses = this.guesses.concat([{ num: card.num, type: card.type, big: !!big, win }]).slice(-MAX_HISTORY);
    this.guessScroll = 99999;
    if (win > 0) {
      this.bonus *= 2;
      this.bonusPulseAt = Date.now();
      this.stats.peak = Math.max(this.stats.peak, this.bonus);
      this.app.audio.playElimination();
      this.guessCard = logic.randomCard();
      this.nextGuessAt = Date.now() + GUESS_FLICKER;
      this.resultAt = Date.now();
    } else if (win < 0) {
      this.stage = GUESS_LOSE;
      this.bonus = 0;
      this.result = { times: 0, key: '' };
      this.guessCard = null;
      this.nextGuessAt = 0;
      this.app.audio.playLose();
    }
    // win === 0（正好 7）：平局，不输不赢，接着猜
    this.save();
  }

  settle() {
    if (this.stage !== GUESS || this.helpOpen) return;
    this.total += this.bonus;
    this.totalPulseAt = Date.now();
    this.stats.peak = Math.max(this.stats.peak, this.bonus);
    this.bonus = 0;
    this.result = { times: 0, key: '' };
    this.stage = WAIT;
    this.clearTable();
    this.save();
  }

  reset() {
    if ((this.stage !== LOSE && this.stage !== GUESS_LOSE) || this.helpOpen) return;
    this.stage = WAIT;
    this.bonus = 0;
    this.result = { times: 0, key: '' };
    this.clearTable();
    this.save();
  }

  clearTable() {
    this.cards = this.freshCards();
    this.guesses = [];
    this.guessCard = null;
    this.nextGuessAt = 0;
    this.resultAt = 0;
  }

  toggleDice() {
    if (this.helpOpen) return;
    this.dice = !this.dice;
    setRaw(KEYS.dice, this.dice ? '1' : '0');
    if (this.dice && this.stage === GUESS && !this.guessCard) {
      this.guessCard = logic.randomCard();
      this.nextGuessAt = Date.now() + GUESS_FLICKER;
    }
    // 开关会改变牌桌 / 操作卡的高度，必须重新布局
    this.layout();
  }

  showToast(text) {
    this.toast = { text: String(text), until: Date.now() + TOAST_MS };
  }

  // ---------- 下注 ± （长按连加连减） ----------
  canStepBet(dir) {
    if (this.stage !== WAIT || this.anim || this.helpOpen) return false;
    return dir > 0 ? this.bet < logic.MAX_BET : this.bet > logic.MIN_BET;
  }
  stepBet(dir) {
    if (!this.canStepBet(dir)) return false;
    this.bet = clamp(this.bet + dir, logic.MIN_BET, logic.MAX_BET);
    setRaw(KEYS.bet, String(this.bet));
    return true;
  }
  betHit(p) {
    if (!p || (!this.canStepBet(1) && !this.canStepBet(-1))) return 0;
    if (this.betMinusHit && D.hit(this.betMinusHit, p.x, p.y)) return -1;
    if (this.betPlusHit && D.hit(this.betPlusHit, p.x, p.y)) return 1;
    return 0;
  }
  startBetPress(dir) {
    if (!this.stepBet(dir)) return;
    this.betPress = { dir, nextAt: Date.now() + BET_DELAY };
    this.pressedDir = dir;
  }
  stopBetPress() {
    this.betPress = null;
    this.pressedDir = 0;
  }
  updateBetPress() {
    if (!this.betPress) return;
    if (this.now < this.betPress.nextAt) return;
    if (!this.canStepBet(this.betPress.dir)) { this.stopBetPress(); return; }
    this.stepBet(this.betPress.dir);
    this.betPress.nextAt = this.now + BET_REPEAT;
  }

  // 下注按钮不是普通 tap 按钮：inpust 的 onTap 会在长按松手时多补一次，
  // 所以和 web 一样只走「按下先一步 + 长按连发」。
  onTouchStart(p) {
    if (!p) return;
    const dir = this.betHit(p);
    if (dir) { this.startBetPress(dir); return; }
    if (this.dice && p.y >= this.guessY && p.y <= this.guessY + this.guessH) {
      this.guessDrag = { x: p.x, scroll: this.guessScroll };
    }
  }
  onTouchMove(p) {
    if (this.guessDrag && p) {
      this.guessScroll = this.guessDrag.scroll - (p.x - this.guessDrag.x);
      return;
    }
    if (!this.betPress) return;
    const rect = this.betPress.dir > 0 ? this.betPlusHit : this.betMinusHit;
    if (!rect || !p || !D.hit(rect, p.x, p.y)) this.stopBetPress();
  }
  onTouchEnd() {
    this.guessDrag = null;
    this.stopBetPress();
  }

  // ---------- 生命周期 ----------
  onHide() {
    // 动画中途切后台 / 回首页：先把这一手落定，避免少发牌或把下注吃掉。
    if (this.anim === 'deal') this.finishDeal();
    else if (this.anim === 'draw') this.finishDraw(true);
    this.stopBetPress();
    this.save();
  }
  onShow() {}
  onTheme() { this.layout(); }

  // ---------- 动画 / 帧更新 ----------
  update(dt) {
    this.now = Date.now();
    const delta = Math.min(50, dt || 16);
    if (this.bg) this.bg.update(delta);
    // 帮助弹窗打开时冻结牌局（PITFALLS #32）：不发牌、不翻牌、不闪牌、不落档。
    if (this.helpOpen) return;
    this.updateBetPress();
    this.updateCards(delta);
    if (this.toast && this.now >= this.toast.until) this.toast = null;
    if (this.stage === GUESS && this.dice && this.now >= this.nextGuessAt) {
      this.guessCard = logic.randomCard();
      this.nextGuessAt = this.now + GUESS_FLICKER;
    }
    if (this.now < this.confettiUntil && this.now - this.lastConfettiAt >= 40) {
      this.lastConfettiAt = this.now;
      this.emitConfetti();
    }
    this.confetti = confetti.update(this.confetti, delta, H);
  }

  updateCards(delta) {
    const now = this.now;
    this.cards.forEach((card) => {
      if (!card) return;
      if (this.anim === 'deal' && !card.entered && now >= card.at) {
        card.entered = true;
        card.enterAt = now;
        card.flipTarget = 1;
      }
      if (this.anim === 'draw' && card.pending) {
        if (!card.flipBack && now >= card.at) {
          card.flipBack = true;
          card.flipTarget = 0;
        } else if (card.flipBack && card.flip <= 0.001) {
          // 翻到背面才换牌，再翻回正面 —— 这就是「换牌」的翻面动画
          card.item = card.pending;
          card.pending = null;
          card.flipBack = false;
          card.flipTarget = 1;
          card.enterAt = now;
        }
      }
      if (card.flip < card.flipTarget) card.flip = Math.min(card.flipTarget, card.flip + delta / FLIP_MS);
      else if (card.flip > card.flipTarget) card.flip = Math.max(card.flipTarget, card.flip - delta / FLIP_MS);
    });
    if (this.anim === 'deal' && now >= this.dealDoneAt) this.finishDeal();
    else if (this.anim === 'draw' && now >= this.drawDoneAt) this.finishDraw();
  }

  startConfetti() {
    this.confetti = [];
    this.confettiUntil = Date.now() + 1200;
    this.lastConfettiAt = 0;
  }
  emitConfetti() {
    confetti.spawn(this.confetti, { W, H, startY: H * 0.58, scoreY: this.scoreY });
  }

  // ---------- 渲染 ----------
  render(c) {
    this.buttons = [];
    this.now = Date.now();
    const T = theme.tokens;
    c.fillStyle = T.bg;
    c.fillRect(0, 0, W, H);
    this.bg.draw(c, theme.dark);
    this.drawHeader(c);
    this.drawRules(c);
    this.drawScore(c);
    this.drawTable(c);
    if (this.dice) this.drawGuessCard(c);
    this.drawActions(c);
    this.drawHelpFab(c);
    this.drawConfetti(c);
    this.drawToast(c);
    if (this.helpOpen) this.drawHelp(c);
  }

  drawHeader(c) {
    const T = theme.tokens;
    D.text(c, t('poker.gameTitle'), W / 2, this.top + this.headerH / 2, {
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
    const w1 = this.cw * 0.33;
    const w2 = this.cw * 0.33;
    const w3 = this.cw - w1 - w2;
    const midY = this.scoreY + this.scoreH / 2;
    D.divider(c, this.cx + w1, midY, 24, T.border, 1);
    D.divider(c, this.cx + w1 + w2, midY, 24, T.border, 1);
    this.drawStat(c, this.cx + w1 / 2, w1 - 12, t('poker.total'), this.fmtMoney(this.total), this.totalPulseAt);
    this.drawStat(c, this.cx + w1 + w2 / 2, w2 - 12, t('poker.bonus'), this.fmtMoney(this.bonus), this.bonusPulseAt);
    this.drawBet(c, this.cx + w1 + w2, w3);
  }

  drawStat(c, centerX, maxW, label, value, pulseAt) {
    const T = theme.tokens;
    D.text(c, label, centerX, this.scoreY + 23, { size: 12, color: T.muted, align: 'center' });
    const scale = fx.popScale(this.now - (pulseAt || 0));
    const size = this.fitSize(c, value, maxW, 22, 'bold');
    c.save();
    c.translate(centerX, this.scoreY + 50);
    c.scale(scale, scale);
    D.text(c, value, 0, 0, { size, weight: 'bold', color: T.text, align: 'center' });
    c.restore();
  }

  drawBet(c, x, w) {
    const T = theme.tokens;
    D.text(c, t('poker.bet'), x + w / 2, this.scoreY + 23, { size: 12, color: T.muted, align: 'center' });
    const betText = String(this.bet);
    const betW = Math.max(20, D.measure(c, betText, 18, 'bold'));
    const size = 28;
    const groupW = size + 6 + betW + 6 + size;
    const gx = x + (w - groupW) / 2;
    const gy = this.scoreY + 50 - size / 2;
    D.text(c, betText, gx + size + 6 + betW / 2, this.scoreY + 50, {
      size: 18, weight: 'bold', color: T.text, align: 'center',
    });
    this.drawStepButton(c, gx, gy, -1);
    this.drawStepButton(c, gx + size + 6 + betW + 6, gy, 1);
  }

  drawStepButton(c, x, y, dir) {
    const T = theme.tokens;
    const enabled = this.canStepBet(dir);
    const pressed = this.pressedDir === dir;
    D.fillRoundRect(c, x, y, 28, 28, 8, pressed ? T.keyActive : T.card);
    D.strokeRoundRect(c, x, y, 28, 28, 8, T.border, 1);
    const color = enabled ? T.text : T.disabled;
    const glyph = dir > 0 ? 'add' : 'subtract';
    if (!icons.draw(c, glyph, x + 14, y + 14, 16, color)) {
      D.text(c, dir > 0 ? '+' : '−', x + 14, y + 14, { size: 18, weight: 'bold', color, align: 'center' });
    }
    // 热区外扩 8px（28 → 40 见方）
    const rect = { x: x - 6, y: y - 6, w: 40, h: 40 };
    if (dir > 0) this.betPlusHit = rect;
    else this.betMinusHit = rect;
  }

  drawRules(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.rulesY, this.cw, this.rulesH, T);

    const colGap = 10;
    const colW = (this.cw - 24 - colGap) / 2;
    const top = this.rulesY + this.rulesCaption;
    logic.rulesList.forEach((rule, i) => {
      const col = i % 2;
      const row = (i - col) / 2;
      const x = this.cx + 12 + col * (colW + colGap);
      const cy = top + row * this.ruleRowH + this.ruleRowH / 2;
      const win = !!(this.result && this.result.times && this.result.times === rule.times);
      if (win) {
        D.fillRoundRect(c, x - 6, cy - this.ruleRowH / 2 + 1, colW + 12, this.ruleRowH - 2, 6, T.enter);
      }
      // 英文牌型名（Straight flush / Three of a kind）比中文长，按剩余宽度缩字号，避免和倍数撞上。
      const name = t('poker.' + rule.key);
      const timesText = `${rule.times} ${t('poker.times')}`;
      const timesW = D.measure(c, timesText, 12, 'bold');
      D.text(c, name, x, cy, {
        size: this.fitSize(c, name, Math.max(40, colW - timesW - 8), 12, 'bold'),
        weight: win ? 'bold' : 'normal', color: win ? T.enterColor : T.muted,
      });
      const scale = win ? fx.popScale(this.now - (this.resultAt || 0)) : 1;
      c.save();
      c.translate(x + colW, cy);
      c.scale(scale, scale);
      D.text(c, timesText, 0, 0, {
        size: 12, weight: 'bold', color: win ? T.enterColor : T.text, align: 'right',
      });
      c.restore();
    });
    if (this.stage === GUESS && this.result && this.result.times) this.drawRuleWin(c);
  }

  drawRuleWin(c) {
    if (!this.resultVisible(250, 'poker-win:' + this.resultAt)) return;
    const T = theme.tokens;
    const x = this.cx;
    const y = this.rulesY;
    const w = this.cw;
    const h = this.rulesH;
    c.save();
    D.fillRoundRect(c, x, y, w, h, 14, 'rgba(20,20,20,0.72)');
    D.strokeRoundRect(c, x + 1, y + 1, w - 2, h - 2, 13, T.god, 2);
    const cx = x + w / 2;
    const cy = y + h / 2;
    D.text(c, t('poker.' + this.result.key), cx, cy - 18, {
      size: 24, weight: 'bold', color: '#f5c96b', align: 'center',
    });
    D.text(c, `${this.result.times} ${t('poker.times')}`, cx, cy + 10, {
      size: 13, color: '#f5c96b', align: 'center',
    });
    // 简单的五处小烟花：在牌型卡内部扩散，不另铺全屏粒子。
    const age = Math.max(0, this.now - (this.resultAt || this.now));
    const p = Math.max(0, Math.min(1, age / 900));
    const bursts = [[0.18, 0.32], [0.38, 0.72], [0.62, 0.28], [0.8, 0.68], [0.5, 0.48]];
    bursts.forEach(([bx, by], bi) => {
      const ex = x + w * bx;
      const ey = y + h * by;
      const radius = 8 + p * (18 + bi * 2);
      c.globalAlpha = Math.max(0, 1 - p) * 0.9;
      for (let k = 0; k < 8; k++) {
        const a = (Math.PI * 2 * k) / 8 + bi * 0.5;
        D.circle(c, ex + Math.cos(a) * radius, ey + Math.sin(a) * radius, 2.2, k % 2 ? '#f2d091' : '#e88a62');
      }
    });
    c.globalAlpha = 1;
    c.restore();
  }

  drawDiceSwitch(c) {
    const T = theme.tokens;
    const label = t('poker.guessSwitch');
    const labelW = D.measure(c, label, 10.5);
    const tw = 30;
    const th = 16;
    const total = labelW + 6 + tw;
    const x = this.cx + this.cw - 12 - total;
    const y = this.rulesY + 17;
    D.text(c, label, x, y, { size: 10.5, color: this.dice ? T.enterColor : T.muted, weight: 'bold' });
    const trackX = x + labelW + 6;
    D.fillRoundRect(c, trackX, y - th / 2, tw, th, th / 2, this.dice ? T.primary : T.border);
    const knobX = this.dice ? trackX + tw - th / 2 : trackX + th / 2;
    D.circle(c, knobX, y, th / 2 - 2, '#ffffff');
    this.addButton('dice-toggle', x - 6, y - 12, total + 12, 24, () => this.toggleDice());
  }

  drawTable(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.cardsY, this.cw, this.cardsH, T);
    const blockH = this.cardH + this.holdH;
    const top = this.cardsY + Math.max(10, (this.cardsH - blockH) / 2);
    const canHold = this.stage === FIRST && !this.anim;
    this.cards.forEach((card, i) => {
      const x = this.cardX + i * (this.cardW + this.cardGap);
      this.drawCardFace(c, card, x, top);
      this.drawHoldLabel(c, card, x, top + this.cardH + 2);
      if (canHold) {
        this.addButton('card-' + i, x, top - 2, this.cardW, blockH + 6, () => this.onCardTap(i));
      }
    });
    this.drawTableOverlay(c);
  }

  drawCardFace(c, card, x, y) {
    if (!card || !card.entered) return;
    const p = clamp((this.now - (card.enterAt || 0)) / ENTER_MS, 0, 1);
    let scale = 0.72 + 0.28 * easeOut(p);
    const alpha = 0.4 + 0.6 * p;
    if (card.popAt) scale *= fx.popScale(this.now - card.popAt);
    const flipScale = Math.max(0.04, Math.abs(Math.cos(Math.PI * card.flip)));
    const faceUp = !!card.item && card.flip > 0.5;
    c.save();
    c.globalAlpha = alpha;
    c.translate(x + this.cardW / 2, y + this.cardH / 2);
    c.scale(flipScale * scale, scale);
    // 全部牌面 / 牌背 / 边框 / 圆角走 core/cards；牌背图案是本游戏的首页 icon（扑克）。
    cards.draw(c, card.item, MODE_POKER, -this.cardW / 2, -this.cardH / 2, this.cardW, this.cardH,
      faceUp, 'mode-poker', '🃏');
    c.restore();
    if (card.hold) {
      D.strokeRoundRect(c, x - 2, y - 2, this.cardW + 4, this.cardH + 4, 10, HOLD_COLOR, 2);
    }
  }

  drawHoldLabel(c, card, x, y) {
    if (!card) return;
    const T = theme.tokens;
    const showDim = this.stage === FIRST && !this.anim;
    if (!card.hold && !showDim) return;
    const w = this.cardW;
    const h = this.holdH - 2;
    if (card.hold) {
      D.fillRoundRect(c, x, y, w, h, 6, HOLD_COLOR);
      D.text(c, t('poker.hold'), x + w / 2, y + h / 2, {
        size: 10.5, weight: 'bold', color: '#ffffff', align: 'center',
      });
    } else {
      D.strokeRoundRect(c, x, y, w, h, 6, T.border, 1);
      D.text(c, t('poker.hold'), x + w / 2, y + h / 2, { size: 10.5, color: T.muted, align: 'center' });
    }
  }

  drawTableOverlay(c) {
    if (this.stage !== GUESS && this.stage !== LOSE && this.stage !== GUESS_LOSE) return;
    const T = theme.tokens;
    c.save();
    D.roundRect(c, this.cx, this.cardsY, this.cw, this.cardsH, 14);
    c.clip();
    c.fillStyle = T.overlay;
    c.fillRect(this.cx, this.cardsY, this.cw, this.cardsH);
    c.restore();
    const cx = W / 2;
    const cy = this.cardsY + this.cardsH / 2;
    if (this.stage === GUESS) {
      const scale = fx.popScale(this.now - (this.resultAt || 0));
      c.save();
      c.translate(cx, cy - 14);
      c.scale(scale, scale);
      D.text(c, `🎉🎉 ${t('poker.tipWin')} 🎉🎉`, 0, 0, {
        size: 17, weight: 'bold', color: T.win, align: 'center',
      });
      c.restore();
      if (this.result && this.result.key) {
        D.text(c, `${t('poker.' + this.result.key)} × ${this.result.times}`, cx, cy + 12, {
          size: 15, weight: 'bold', color: T.win, align: 'center',
        });
      }
      if (this.bonus > 0) {
        D.text(c, `+${this.fmtMoney(this.bonus)}`, cx, cy + 36, {
          size: 13, weight: 'bold', color: T.primary, align: 'center',
        });
      }
      return;
    }
    const losing = this.stage === LOSE;
    D.text(c, losing ? `👻👻 ${t('poker.tipLost')} 👻👻` : `😭😭 ${t('poker.tipGuessLose')} 😭😭`, cx, cy - 10, {
      size: 16, weight: 'bold', color: losing ? T.lose : T.god, align: 'center',
    });
    D.text(c, t('poker.tipReset'), cx, cy + 18, { size: 12, color: T.muted, align: 'center' });
  }

  drawGuessCard(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.guessY, this.cw, this.guessH, T);
    const padX = 12;
    const cy = this.guessY + this.guessH / 2;
    const showCurrent = this.stage === GUESS && !!this.guessCard;
    const curX = this.cx + this.cw - padX - this.curW;
    const curY = this.guessY + (this.guessH - this.curH) / 2;
    if (showCurrent) {
      cards.draw(c, this.guessCard, MODE_POKER, curX, curY, this.curW, this.curH, true, 'mode-poker', '🃏');
    }
    const histLeft = this.cx + padX;
    // 没有当前牌时，历史区一直用到右边；不再保留问号占位卡。
    const histRight = showCurrent ? curX - 12 : this.cx + this.cw - padX;
    const room = Math.max(0, histRight - histLeft);
    const totalW = this.guesses.length * (this.miniW + 6);
    const maxScroll = Math.max(0, totalW - room);
    this.guessScroll = Math.max(0, Math.min(maxScroll, this.guessScroll));
    if (!this.guesses.length) {
      if (this.stage === GUESS) {
        D.text(c, t('poker.guessHint'), histLeft, cy, { size: 11, color: T.muted });
      }
      return;
    }
    const topY = this.guessY + 10;
    c.save();
    D.roundRect(c, histLeft - 2, this.guessY + 2, room + 4, this.guessH - 4, 8);
    c.clip();
    this.guesses.forEach((g, i) => {
      const x = histLeft + i * (this.miniW + 6) - this.guessScroll;
      if (x + this.miniW < histLeft || x > histRight) return;
      cards.draw(c, { num: g.num, type: g.type }, MODE_POKER, x, topY, this.miniW, this.miniH, true, 'mode-poker', '🃏');
      const color = g.win > 0 ? T.win : g.win < 0 ? T.lose : T.muted;
      D.text(c, g.big ? t('poker.bigShort') : t('poker.smallShort'),
        x + this.miniW / 2, topY + this.miniH + 7, { size: 10.5, weight: 'bold', color, align: 'center' });
    });
    c.restore();
  }

  actionItems() {
    const T = theme.tokens;
    const busy = !!this.anim;
    if (this.stage === WAIT) {
      return [{ id: 'roll', label: t('poker.roll'), color: T.primary, enabled: !busy, onTap: () => this.roll() }];
    }
    if (this.stage === FIRST) {
      return [{ id: 'change', label: t('poker.change'), color: T.primary, enabled: !busy, onTap: () => this.roll() }];
    }
    if (this.stage === GUESS) {
      const out = [];
      if (this.dice) {
        out.push({ id: 'big', label: t('poker.big'), color: BIG_COLOR, onTap: () => this.guess(true) });
        out.push({ id: 'small', label: t('poker.small'), color: SMALL_COLOR, onTap: () => this.guess(false) });
      }
      out.push({ id: 'settle', label: t('poker.settle'), color: SETTLE_COLOR, onTap: () => this.settle() });
      return out;
    }
    return [{ id: 'reset', label: t('poker.reset'), color: SETTLE_COLOR, onTap: () => this.reset() }];
  }

  drawActions(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.actionY, this.cw, this.actionH, T);
    const list = this.actionItems();
    if (!list.length) return;
    const pad = 8;
    const gap = 8;
    const bw = (this.cw - pad * 2 - gap * (list.length - 1)) / list.length;
    const bh = this.actionH - pad * 2;
    const by = this.actionY + pad;
    list.forEach((item, i) => {
      const bx = this.cx + pad + i * (bw + gap);
      const enabled = item.enabled !== false;
      D.fillRoundRect(c, bx, by, bw, bh, 8, enabled ? item.color : T.disabled);
      D.text(c, item.label, bx + bw / 2, by + bh / 2, {
        size: this.fitSize(c, item.label, bw - 8, 13, 'bold'),
        weight: 'bold', color: enabled ? '#ffffff' : '#f3f3f3', align: 'center',
      });
      if (enabled) this.addButton(item.id, bx, by, bw, bh, item.onTap);
    });
  }

  drawHelpFab(c) {
    const T = theme.tokens;
    const drawOne = (x, icon, fallback, color, id, onTap) => {
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.12)';
      c.shadowBlur = 10;
      c.shadowOffsetY = 2;
      D.circle(c, x + this.fabSize / 2, this.fabY + this.fabSize / 2, this.fabSize / 2, T.card);
      c.restore();
      if (!icons.draw(c, icon, x + this.fabSize / 2, this.fabY + this.fabSize / 2, 21, color)) {
        D.text(c, fallback, x + this.fabSize / 2, this.fabY + this.fabSize / 2, {
          size: 20, weight: 'bold', color, align: 'center',
        });
      }
      this.addButton(id, x, this.fabY, this.fabSize, this.fabSize, onTap);
    };
    // 猜大小开关放在帮助左侧，均贴底。
    drawOne(this.fabX - this.fabSize - 12, this.dice ? 'dice-5' : 'dice-5-off', '🎲',
      this.dice ? T.primary : T.muted, 'dice-fab', () => this.toggleDice());
    drawOne(this.fabX, 'help', '?', T.primary, 'help', () => { this.helpOpen = true; });
  }

  drawConfetti(c) {
    confetti.draw(c, this.confetti);
  }

  drawToast(c) {
    if (!this.toast) return;
    const T = theme.tokens;
    const text = this.toast.text;
    const w = Math.min(this.cw - 24, D.measure(c, text, 12, 'bold') + 24);
    const h = 28;
    const x = (W - w) / 2;
    const y = this.cardsY + 12;
    D.fillRoundRect(c, x, y, w, h, 8, T.god);
    D.text(c, text, W / 2, y + h / 2, { size: 12, weight: 'bold', color: '#ffffff', align: 'center' });
  }

  drawHelp(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fillRect(0, 0, W, H);
    const x = 20;
    const w = W - 40;
    const lines = [];
    ['helpMsg', 'help1', 'help2', 'help3', 'help4', 'help5', 'help6'].forEach((k) => {
      const value = t('poker.' + k);
      if (value !== 'poker.' + k) {
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
    const bw = 110;
    const bx = x + (w - bw) / 2;
    const by = y + h - 44;
    // 顺序：先全屏遮罩，再面板按钮（Input 从后往前找）
    this.addButton('help-close', 0, 0, W, H, () => { this.helpOpen = false; });
    D.fillRoundRect(c, bx, by, bw, 30, 8, T.primary);
    D.text(c, t('poker.confirmText'), bx + bw / 2, by + 15, {
      size: 13, weight: 'bold', color: '#ffffff', align: 'center',
    });
    this.addButton('help-ok', bx, by, bw, 30, () => { this.helpOpen = false; });
  }

  // ---------- 小工具 ----------
  fmtMoney(value) {
    const n = Math.max(0, Math.round(+value || 0));
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  fitSize(c, text, maxW, size, weight) {
    let s = size;
    while (s > 10 && D.measure(c, text, s, weight) > maxW) s -= 1;
    return s;
  }
}

module.exports = PokerScene;
