// 赌神 · 微信小游戏 canvas 场景。
// 玩法 / 数值 / 存档 key 都与 web `src/games/gambler/` 对齐：纯逻辑在 ./board.js（可直接 require 做单测），
// 这里只负责布局、绘制、输入、动画与存档。牌面统一走 core/cards.js
// 的 MODE_MAHJONG（麻将雪碧图 + 8px 圆角裁切），本文件不写任何私有牌面绘制。
//
// 两种判断模式（与 web 一致）：
//   1 = 即时判断：点一张立刻判对错，选对飞进答案区、选错标红扣心；
//   2 = 提交判断：点什么都先飞进答案区，点「提交」才整组判卷（少选 / 多选 / 错选都算错），
//       点答案区的牌可以退回选择区。
// 两种模式的关卡 / 最高关卡 / 连胜 / 局面各自独立（模式 2 的 key 加 _2 后缀）。
const { W, H, SAFE_BOTTOM } = require('../../core/canvas');
const { Scene } = require('../../core/app');
const theme = require('../../core/theme');
const { t } = require('../../core/i18n');
const { getRaw, setRaw, clearPrefix } = require('../../core/storage');
const D = require('../../core/draw');
const ParticleField = require('../../core/particles');
const icons = require('../../core/icons');
const fabKit = require('../../core/fab');
const cards = require('../../core/cards');
const HEADER = require('../../core/header');
const confetti = require('../../core/confetti');
const fx = require('../../core/fx');
const achv = require('../../core/achv');
const logic = require('./board');
const i18nDict = require('./i18n');

const coreI18n = require('../../core/i18n');
if (!coreI18n.__gamblerRegistered) {
  coreI18n.register('gambler', i18nDict);
  coreI18n.__gamblerRegistered = true;
}

const MODE_INSTANT = 1;
const MODE_SUBMIT = 2;
const PLAY = 'play';
const WON = 'won';
const LOST = 'lost';

// 存档 key 严格沿用 web（赌神）：模式 1 用原 key，模式 2 全部加 _2 后缀
const KEYS = {
  mode: '__gambler__mode',
  level: ['__gambler__level', '__gambler__level_2'],
  best: ['__gambler__best', '__gambler__best_2'],
  streak: ['__gambler__streak', '__gambler__streak_2'],
  state: ['__gambler__state', '__gambler__state_2'],
};
const KEY_PREFIX = '__gambler__';
const HEARTS_MAX = 2;

const FLY_MS = 420;              // 选中的牌飞进答案区（与 web 的 420ms 一致）
const FLY_GAP = 120;            // 失败补答案：两张之间停 120ms
const DEAL_MS = 340;            // 单张入场
const DEAL_STEP_HAND = 26;      // 手牌 13 张逐张错峰（行优先 = 从左到右）
const DEAL_STEP_PICK = 16;      // 选择区 27 张逐张错峰（行优先 = 先左上后右下）
const SHAKE_MS = 620;           // 点错那张牌的一次性抖动 / 标红窗口
const SUBMIT_LOCK_MS = 520;     // 错误提交后 0.52s 内拒绝再次提交（web 同款）
const RESULT_DELAY_MS = 500;    // 扣完心 → 抖动播完再收尾（web 的 resultDelay）
const CONFETTI_MS = 1300;
const FAB_SIZE = 44;
const ANSWER_ROWS = 2;          // 答案区可见两行，再多就内部滚动
const ANSWER_GAP = 3;
const GRID_GAP = 3;
const GRID_ROW_GAP = 5;
const HEART_POP_MS = 450;

const TILE_RATIO = cards.ratio(cards.MODE_MAHJONG);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const easeOut = p => 1 - Math.pow(1 - p, 3);

function readInt(key, dflt) {
  const raw = getRaw(key, '');
  if (raw === '' || raw === null || raw === undefined) return dflt;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 0 ? n : dflt;
}
function writeInt(key, value) { setRaw(key, String(value)); }

function overlayColor() {
  return theme.dark ? 'rgba(38,38,38,0.94)' : 'rgba(250,248,239,0.94)';
}

// 生命图标单独画（文案里不写 ❤️ / 🤍，避免真机 VS16 变方块）
function heartPath(c, cx, cy, s) {
  c.beginPath();
  c.moveTo(cx, cy + s * 0.36);
  c.bezierCurveTo(cx - s * 0.63, cy + s * 0.02, cx - s * 0.45, cy - s * 0.57, cx, cy - s * 0.2);
  c.bezierCurveTo(cx + s * 0.45, cy - s * 0.57, cx + s * 0.63, cy + s * 0.02, cx, cy + s * 0.36);
  c.closePath();
}
function drawHeart(c, cx, cy, s, color, filled) {
  heartPath(c, cx, cy, s);
  if (filled) {
    c.fillStyle = color;
    c.fill();
  } else {
    c.strokeStyle = color;
    c.lineWidth = 1.2;
    c.stroke();
  }
}

// 文案放不下时逐 0.5px 缩字号（中文 / 英文都按字符测量）
function fitFont(c, value, maxW, size, weight, min) {
  let s = size;
  const floor = min == null ? 9 : min;
  while (s > floor && D.measure(c, value, s, weight) > maxW) s -= 0.5;
  return s;
}

class GamblerScene extends Scene {
  constructor(app) {
    super(app);
    this.bg = new ParticleField();
    // 所有动画 / 逻辑计时都用场景时钟：帮助 / 二次确认打开时冻结（PITFALLS #32）
    this.clock = 0;
    this.now = 0;

    // ---------- 状态：restore 会用到的字段必须先声明 ----------
    this.mode = this.loadMode();
    this.level = 1;
    this.best = 0;
    this.streak = 0;
    this.hearts = HEARTS_MAX;
    this.heartLostAt = -1;
    this.heartLostIndex = 0;
    this.hand = [];
    this.counts = {};
    this.jokers = 0;
    this.picks = [];
    this.blocked = [];
    this.picked = [];
    this.phase = PLAY;
    this.revealed = false;        // 是否已经「查看答案」
    this.revealing = false;       // 正在一张张补答案（期间不接受新的选牌）
    this.reason = '';             // '' | 'wrong' | 'reveal'
    this.missed = [];             // 即时判断点错的牌：标红 + 不能再选
    this.pickFailed = false;      // 选择区失败遮罩
    this.flights = [];
    this.landing = new Set();     // 正在飞的目标槽位（落地才现身）
    this.pops = new Map();        // key → 落地弹一下的起始时钟
    this.wrongAt = new Map();     // key → 失败复盘时错牌抖动的起始时钟
    this.shakeKey = null;
    this.shakeAt = -1;
    this.answerShakeAt = -1;      // 提交错误时整块答案区抖一下
    this.revealQueue = [];
    this.revealNextAt = 0;
    this.pendingLoss = false;     // 扣完心 → 等抖动播完再收尾
    this.answerScroll = 0;
    this.gridScroll = 0;
    this.drag = null;
    this.dealStart = 0;
    this.dealDur = 0;
    this.helpOpen = false;
    this.confirming = false;
    this.titleTaps = 0;
    this.titleTapAt = 0;
    this.confetti = [];
    this.confettiUntil = 0;
    this.lastConfettiAt = 0;
    this.timers = [];

    this.loadStats();
    this.layout();
    if (!this.restore()) this.deal(this.level);
  }

  // ---------- 存档 key / 统计 ----------

  modeIndex() { return this.mode === MODE_SUBMIT ? 1 : 0; }
  levelKey() { return KEYS.level[this.modeIndex()]; }
  bestKey() { return KEYS.best[this.modeIndex()]; }
  streakKey() { return KEYS.streak[this.modeIndex()]; }
  stateKey() { return KEYS.state[this.modeIndex()]; }

  loadMode() {
    return Math.floor(+getRaw(KEYS.mode, '1')) === MODE_SUBMIT ? MODE_SUBMIT : MODE_INSTANT;
  }

  loadStats() {
    this.level = Math.max(1, readInt(this.levelKey(), 1));
    this.best = readInt(this.bestKey(), 0);
    this.streak = readInt(this.streakKey(), 0);
  }

  // ---------- 存档 ----------

  save() {
    try {
      writeInt(this.levelKey(), this.level);
      writeInt(this.bestKey(), this.best);
      writeInt(this.streakKey(), this.streak);
      if (this.phase === PLAY && !this.hand.length) return;
      setRaw(this.stateKey(), JSON.stringify({
        mode: this.mode,
        level: this.level,
        hand: this.hand,
        picked: this.picked,
        hearts: this.hearts,
        phase: this.phase,
        // 'reveal' = 查看答案 / 'wrong' = 扣完心：回来都停在同一屏（答案区留着、选择区盖遮罩）
        reason: this.reason,
        missed: this.missed,
      }));
    } catch (e) { /* 存不下就算了 */ }
  }

  resetFx() {
    this.flushTimers();
    this.flights = [];
    this.landing = new Set();
    this.pops = new Map();
    this.wrongAt = new Map();
    this.shakeKey = null;
    this.shakeAt = -1;
    this.answerShakeAt = -1;
    this.revealing = false;
    this.revealQueue = [];
    this.revealNextAt = 0;
    this.pendingLoss = false;
    this.answerScroll = 0;
    this.gridScroll = 0;
    this.drag = null;
    this.heartLostAt = -1;
    this.helpOpen = false;
    this.confirming = false;
    this.confetti = [];
    this.confettiUntil = 0;
    this.lastConfettiAt = 0;
  }

  // 恢复局面：答案（picks）不进存档，按手牌重算；失败局面照样恢复（复盘用）
  restore() {
    try {
      const raw = getRaw(this.stateKey(), '');
      if (!raw) return false;
      const st = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!st || !Array.isArray(st.hand) || st.hand.length !== logic.HAND_SIZE) return false;
      if (st.mode !== undefined && st.mode !== this.mode) return false;
      // 手牌只接受三门 27 种 + 花牌（字牌 / 乱码都不合法）
      if (!st.hand.every(key => logic.KIND_KEYS.indexOf(key) >= 0 || logic.isFlower(key))) return false;
      const hc = logic.handCounts(st.hand);
      const recomputed = logic.winningPicks(hc.counts, hc.jokers);
      // 边界：手牌被改过 / 存档损坏成「一个答案都没有」时是死局 → 当作没有存档，重开一关
      if (!recomputed.length) return false;

      this.level = Math.max(1, Math.floor(+st.level) || 1);
      this.hand = st.hand.slice();
      this.counts = hc.counts;
      this.jokers = hc.jokers;
      this.picks = recomputed;
      this.blocked = logic.SELECT_KEYS.filter(k => logic.isBlocked(k, hc.counts));
      // ⚠️ 已选的是**答案**（手牌之外的牌），所以只能按「合法牌面」校验 + 去重，
      // 不能要求它在手牌里（web 分册踩过：写成 filter(hand.includes) 会把答案区清空）
      const picked = Array.isArray(st.picked) ? st.picked : [];
      this.picked = [...new Set(picked.filter(key => logic.KIND_KEYS.indexOf(key) >= 0))];
      this.hearts = clamp(Math.floor(Number.isFinite(+st.hearts) ? +st.hearts : HEARTS_MAX), 0, HEARTS_MAX);
      this.phase = st.phase === WON ? WON : st.phase === LOST ? LOST : PLAY;
      // 「查看答案」最后才把 phase 改成 lost，之前有 1~3s 的补答案飞行期：
      // 这期间退到后台再进来会读到 0 心 + play，直接按失败处理（零心不能继续抢答）
      if (this.phase === PLAY && this.hearts <= 0) this.phase = LOST;
      this.reason = st.reason === 'reveal' || st.reason === 'wrong' ? st.reason : '';
      this.revealed = st.reason === 'reveal';
      const missed = Array.isArray(st.missed) ? st.missed : [];
      this.missed = [...new Set(missed.filter(key => logic.KIND_KEYS.indexOf(key) >= 0))];
      this.pickFailed = this.phase === LOST;
      if (this.best < this.level) this.best = this.level;
      this.resetFx();
      this.startDeal();      // 恢复局面同样播一次入场动画（行优先）
      this.layout();         // 恢复后必须重新布局（PITFALLS #9）
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- 开局 / 换关 ----------

  deal(level) {
    this.flushTimers();
    this.resetFx();
    const round = logic.newRound(level);
    this.level = round.level;
    this.hand = round.hand.slice();
    this.counts = round.counts;
    this.jokers = round.jokers;
    this.picks = round.picks.slice();
    this.blocked = round.blocked.slice();
    this.picked = [];
    this.hearts = HEARTS_MAX;
    this.phase = PLAY;
    this.revealed = false;
    this.reason = '';
    this.missed = [];
    this.pickFailed = false;
    this.best = Math.max(this.best, this.level);
    this.level = round.level;
    this.startDeal();
    this.save();
  }

  // 入场动画：手牌 13 张 + 选择区 27 张，都按行优先（index 本身就是左上 → 右下）
  startDeal() {
    // 场景时钟从 0 起步，而 0 是「没有入场动画」的哨兵值
    this.dealStart = Math.max(1, this.clock);
    this.dealDur = Math.max(
      this.hand.length * DEAL_STEP_HAND,
      logic.SELECT_KEYS.length * DEAL_STEP_PICK,
    ) + DEAL_MS + 80;
  }

  replayLevel() {
    this.confirming = false;
    this.deal(this.level);
  }
  nextLevel() { this.deal(this.level + 1); }
  startNewGame() {
    this.confirming = false;
    this.streak = 0;
    writeInt(this.streakKey(), 0);
    this.deal(1);
  }

  onNewGameClick() {
    if (this.helpOpen) return;
    this.confirming = true;
  }

  // 切换模式：先落档当前模式，再恢复另一种模式自己的关卡 / 最高关卡 / 连胜 / 局面。
  // 补答案、飞牌、结算延迟期间不允许切，否则上一模式的异步收尾会写进新模式。
  toggleMode() {
    if (this.helpOpen || this.confirming) return;
    if (this.revealing || this.flights.length || this.pendingLoss) return;
    this.save();
    this.mode = this.mode === MODE_INSTANT ? MODE_SUBMIT : MODE_INSTANT;
    setRaw(KEYS.mode, String(this.mode));
    this.resetFx();
    this.loadStats();
    this.layout();
    if (!this.restore()) this.deal(this.level);
  }

  // 连点标题 5 次：清掉两种模式的记录（只保留模式偏好），回到第 1 关（web 的 onScoreReset）
  tapTitle() {
    if (this.helpOpen || this.confirming) return;
    if (this.clock - this.titleTapAt > 1800) this.titleTaps = 0;
    this.titleTapAt = this.clock;
    this.titleTaps += 1;
    if (this.titleTaps < 5) return;
    this.titleTaps = 0;
    clearPrefix(KEY_PREFIX);
    setRaw(KEYS.mode, String(this.mode));
    this.streak = 0;
    this.best = 0;
    this.level = 1;
    this.deal(1);
  }

  // ---------- 选牌 / 判卷 ----------

  isPick(key) { return this.picks.indexOf(key) >= 0; }
  isPicked(key) { return this.picked.indexOf(key) >= 0; }
  isMissed(key) { return this.missed.indexOf(key) >= 0; }
  isBlockedKey(key) { return this.blocked.indexOf(key) >= 0; }

  canPick() {
    return this.phase === PLAY && !this.revealing && !this.pendingLoss
      && !this.helpOpen && !this.confirming && !this.pickFailed;
  }

  canSubmit() {
    return this.mode === MODE_SUBMIT && this.phase === PLAY && !this.revealing
      && !this.pendingLoss && !this.helpOpen && !this.confirming && this.picked.length > 0;
  }

  // 一张牌从选择区飞进答案区：逻辑上立刻算「已选」（原位置灰），
  // 目标槽位飞行期间先隐身，落地才现身。飞行**不锁整盘**：其它牌随时可点。
  startFlight(key) {
    if (this.isPicked(key)) return;
    this.picked.push(key);
    const index = this.picked.length - 1;
    if (!this.flights.length) this.ensureAnswerVisible(index);
    const from = this.pickSlotRect(key);
    const to = this.answerSlotRect(index);
    this.landing.add(key);
    this.pops.delete(key);
    this.flights.push({ key, from, to, start: this.clock, dur: FLY_MS });
  }

  pick(key) {
    if (!this.canPick()) return;
    if (this.isBlockedKey(key) || this.isPicked(key) || this.isMissed(key)) return;
    if (this.mode === MODE_SUBMIT) {
      // 提交判断：选哪张都先飞进答案区，不即时判对错、不扣心
      this.startFlight(key);
      this.save();          // 一开飞就落档：中途退出也算已选
      return;
    }
    if (this.isPick(key)) {
      this.startFlight(key);
      this.save();
      return;
    }
    this.markWrong(key);
  }

  // 即时判断点错：标红 + 抖一下 + 扣一颗心；这张以后不能再选
  markWrong(key) {
    this.missed.push(key);
    this.shakeKey = key;
    this.shakeAt = this.clock;
    this.hearts = Math.max(0, this.hearts - 1);
    this.heartLostAt = this.clock;
    this.heartLostIndex = this.hearts;
    this.app.audio.playFail();     // 扣 ❤️ = 单次操作错误
    if (this.hearts <= 0) {
      // 先把这一下抖动播完，再一张张补答案
      this.pendingLoss = true;
      this.schedule(RESULT_DELAY_MS, () => {
        this.pendingLoss = false;
        this.finishRound('wrong');
      });
    } else {
      this.save();
    }
  }

  // 提交判断：点答案区的牌退回选择区（可反复调整，提交前不判对错）
  unpick(key) {
    if (this.mode !== MODE_SUBMIT || this.phase !== PLAY || this.revealing || this.pendingLoss) return;
    const index = this.picked.indexOf(key);
    if (index < 0) return;
    this.picked.splice(index, 1);
    this.landing.delete(key);
    this.pops.delete(key);
    this.wrongAt.delete(key);
    this.save();
  }

  // 提交判断的判卷：集合完全相等才算过；否则扣一颗心、抖整块答案区，不指出是哪张错
  submitPicks() {
    if (!this.canSubmit()) return;
    // 错误提交后 0.52s 内拒绝再次提交（避免手快连点把两颗心一次扣光）
    if (this.answerShakeAt >= 0 && this.clock - this.answerShakeAt < SUBMIT_LOCK_MS) return;
    const exact = this.picked.length === this.picks.length
      && this.picked.every(key => this.isPick(key));
    if (exact) { this.win(); return; }
    this.hearts = Math.max(0, this.hearts - 1);
    this.heartLostAt = this.clock;
    this.heartLostIndex = this.hearts;
    this.app.audio.playFail();
    this.answerShakeAt = this.clock;
    if (this.hearts <= 0) {
      this.pendingLoss = true;
      this.schedule(SUBMIT_LOCK_MS, () => {
        this.pendingLoss = false;
        this.finishRound('wrong');
      });
    } else {
      this.save();
    }
  }

  // 查看答案 = 放弃：立刻清零心 + 落盘，再走和「扣完心」完全一样的收尾
  revealAnswers() {
    if (this.phase !== PLAY || this.revealing || this.pendingLoss) return;
    this.hearts = 0;
    this.heartLostAt = this.clock;
    this.heartLostIndex = 0;
    this.save();                    // 这一瞬间就算放弃了
    this.finishRound('reveal');
  }

  // 一局失败：把玩家还没选出来的正确答案一张张飞进答案区，全部落地后再盖失败遮罩
  finishRound(kind) {
    if (this.revealing || this.phase !== PLAY) return;
    this.revealing = true;
    this.pendingLoss = false;
    this.revealed = kind === 'reveal';
    this.reason = kind;
    this.save();
    this.revealQueue = this.picks.filter(key => !this.isPicked(key));
    this.revealNextAt = this.clock;
    this.tickReveal();
  }

  tickReveal() {
    if (!this.revealing) return;
    if (this.flights.length) return;
    if (this.clock < this.revealNextAt) return;
    if (!this.revealQueue.length) { this.finishReveal(); return; }
    const key = this.revealQueue.shift();
    this.startFlight(key);
    this.revealNextAt = this.clock + FLY_MS + FLY_GAP;
  }

  finishReveal() {
    if (!this.revealing) return;
    this.revealing = false;
    this.revealQueue = [];
    this.pickFailed = true;
    this.phase = LOST;
    // 失败复盘：答案区里**玩家自己选错的牌**盖红叉并抖一下（真答案不打标签）
    this.picked.forEach((key) => {
      if (!this.isPick(key)) this.wrongAt.set(key, this.clock);
    });
    this.answerScroll = this.answerMaxScroll();
    this.streak = 0;
    writeInt(this.streakKey(), 0);
    this.save();
    this.app.audio.playLose();      // 整局失败才播 lose
  }

  win() {
    if (this.phase !== PLAY) return;
    this.phase = WON;
    this.reason = '';
    achv.win('gambler', { mode: this.mode, level: this.level + 1 });
    achv.peak('gambler', this.mode === 2 ? 'streak2' : 'streak1', this.streak + 1);
    this.streak += 1;
    this.best = Math.max(this.best, this.level + 1);     // 解锁下一关
    if (!this.flights.length) this.picked = this.picks.slice();
    writeInt(this.levelKey(), this.level);
    writeInt(this.bestKey(), this.best);
    writeInt(this.streakKey(), this.streak);
    this.save();
    this.startConfetti();
    this.app.audio.playSuccess();
  }

  startConfetti() {
    this.confetti = [];
    this.confettiUntil = this.clock + CONFETTI_MS;
    this.lastConfettiAt = this.clock - 1000;   // 立刻喷一次
  }

  // ---------- 答案区几何 ----------

  answerMetrics() {
    const pad = 8;
    const bodyX = this.cx + pad;
    const submitW = this.mode === MODE_SUBMIT ? this.submitW : 0;
    const bodyW = this.cw - pad * 2 - (submitW ? submitW + 8 : 0);
    const bodyY = this.answerY + pad + this.answerTipH + 4;
    const perRow = Math.max(1, Math.floor((bodyW + ANSWER_GAP) / (this.ansW + ANSWER_GAP)));
    const viewH = this.ansH * ANSWER_ROWS + ANSWER_GAP * (ANSWER_ROWS - 1);
    return { bodyX, bodyY, bodyW, perRow, viewH, submitW };
  }

  answerContentH(count) {
    const m = this.answerMetrics();
    const rows = Math.ceil(Math.max(0, count == null ? this.picked.length : count) / m.perRow);
    if (!rows) return 0;
    return rows * this.ansH + (rows - 1) * ANSWER_GAP;
  }

  answerMaxScroll() {
    return Math.max(0, this.answerContentH() - this.answerMetrics().viewH);
  }

  answerSlotRect(index) {
    const m = this.answerMetrics();
    const row = Math.floor(index / m.perRow);
    const col = index % m.perRow;
    return {
      x: m.bodyX + col * (this.ansW + ANSWER_GAP),
      y: m.bodyY + row * (this.ansH + ANSWER_GAP) - this.answerScroll,
      w: this.ansW,
      h: this.ansH,
    };
  }

  // 新落地的那张如果超出可见的两行，先把答案区滚到能看见它（量飞行目标前调用）
  ensureAnswerVisible(index) {
    const m = this.answerMetrics();
    const top = Math.floor(index / m.perRow) * (this.ansH + ANSWER_GAP);
    const bottom = top + this.ansH;
    if (bottom > this.answerScroll + m.viewH) {
      this.answerScroll = clamp(bottom - m.viewH, 0, this.answerMaxScroll());
    } else if (top < this.answerScroll) {
      this.answerScroll = clamp(top, 0, this.answerMaxScroll());
    }
  }

  // ---------- 场景计时器 ----------

  schedule(delay, fn) {
    this.timers.push({ at: this.clock + Math.max(0, delay), fn });
  }
  flushTimers() { this.timers.length = 0; }
  tickTimers() {
    let guard = 0;
    while (this.timers.length && guard++ < 40) {
      this.timers.sort((a, b) => a.at - b.at);
      if (this.timers[0].at > this.clock) break;
      const job = this.timers.shift();
      job.fn();
    }
  }

  // ---------- 帧循环 ----------

  update(dt) {
    const delta = Math.min(50, dt || 16);
    if (this.bg) this.bg.update(delta);
    // 帮助 / 二次确认打开时冻结游戏时钟：飞牌、补答案、撒花全部暂停
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
    const landed = [];
    this.flights = this.flights.filter((flight) => {
      if (now - flight.start < flight.dur) return true;
      landed.push(flight);
      return false;
    });
    landed.forEach((flight) => {
      this.landing.delete(flight.key);
      this.pops.set(flight.key, now);          // 落地弹一下（选对 / 答案落位）
    });
    if (landed.length) this.afterLanding();
    if (this.dealStart && now - this.dealStart > this.dealDur) this.dealStart = 0;
    if (this.heartLostAt >= 0 && now - this.heartLostAt > HEART_POP_MS) this.heartLostAt = -1;
    if (this.shakeAt >= 0 && now - this.shakeAt > SHAKE_MS) {
      this.shakeAt = -1;
      this.shakeKey = null;
    }
    if (this.answerShakeAt >= 0 && now - this.answerShakeAt > SUBMIT_LOCK_MS) this.answerShakeAt = -1;
    if (this.revealing) this.tickReveal();
  }

  // 即时判断：最后一张落位后立刻判胜（web 明确要求胜利遮罩不额外等待）
  afterLanding() {
    if (this.phase !== PLAY || this.revealing) return;
    if (this.mode !== MODE_INSTANT) return;
    if (!this.picks.length) return;
    if (this.picked.length !== this.picks.length) return;
    if (!this.picked.every(key => this.isPick(key))) return;
    this.win();
  }

  // ---------- 布局 ----------

  layout() {
    this.cw = Math.min(W - 32, 440);
    this.cx = (W - this.cw) / 2;
    this.top = HEADER.TOP;
    this.headerH = HEADER.HEIGHT;
    this.homeRect = { ...HEADER.HOME_RECT };

    // 统计条：最高关卡 / 关卡 / 连胜 / 生命（生命在最右，图标单独画）
    this.scoreY = this.top + this.headerH + 12;
    this.scoreH = 64;
    // 操作区：新游戏在左、查看答案（橙）在右，两格各 50%
    this.optY = this.scoreY + this.scoreH + 10;
    this.optH = 44;

    // 底部两个 FAB：帮助 + 模式切换（结算时也保持显示）
    this.fabSize = FAB_SIZE;
    this.fabY = H - SAFE_BOTTOM - 16 - this.fabSize;
    this.helpX = W - 16 - this.fabSize;

    // 手牌 13 张排一行；选择区每行 9 张。宽度定高（高 = 宽 × 168/131，不能被「两边减 2」拉偏）
    const pad = 8;
    this.handGap = 2;
    this.handW = Math.max(16, Math.floor((this.cw - pad * 2 - this.handGap * (logic.HAND_SIZE - 1)) / logic.HAND_SIZE));
    this.handH = Math.round(this.handW * TILE_RATIO);
    this.gridGap = GRID_GAP;
    this.pickW = Math.max(18, Math.floor((this.cw - pad * 2 - this.gridGap * 8) / 9));
    this.pickH = Math.round(this.pickW * TILE_RATIO);
    // 答案区的牌比选择区略小，两行才放得下（宽度定高）
    this.ansW = Math.max(16, Math.round(this.pickW * 0.86));
    this.ansH = Math.round(this.ansW * TILE_RATIO);
    this.submitW = 58;
    this.answerTipH = 30;          // 常驻提示语最多两行（中英文都放得下）

    this.handCardH = 8 + this.handH + 6 + 30 + 8;
    this.answerCardH = 8 + this.answerTipH + 4
      + (this.ansH * ANSWER_ROWS + ANSWER_GAP * (ANSWER_ROWS - 1)) + 8;
    this.gridRowH = this.pickH * 3 + GRID_ROW_GAP * 2;
    let gridCardH = 8 + this.gridRowH + 8;

    const gap = 12;
    this.gameTop = this.optY + this.optH + 12;
    this.limit = Math.min(H - SAFE_BOTTOM - 10, this.fabY - 10);
    let blockH = this.handCardH + this.answerCardH + gridCardH + gap * 2;
    let topPad = 0;
    if (this.gameTop + blockH <= this.limit) {
      topPad = clamp(Math.floor((this.limit - this.gameTop - blockH) / 2), 0, 24);
    } else {
      // 极矮的屏幕：只缩选择区（内部滚动），不要挤掉手牌 / 答案区
      const gridMax = this.limit - this.gameTop - this.handCardH - this.answerCardH - gap * 2;
      gridCardH = Math.max(64, Math.min(gridCardH, gridMax));
      blockH = this.handCardH + this.answerCardH + gridCardH + gap * 2;
      topPad = Math.max(0, Math.floor((this.limit - this.gameTop - Math.min(blockH, this.limit - this.gameTop)) / 2));
    }

    this.handY = this.gameTop + topPad;
    this.answerY = this.handY + this.handCardH + gap;
    this.gridY = this.answerY + this.answerCardH + gap;
    this.gridCardH = gridCardH;
    this.gridViewH = Math.max(40, gridCardH - 16);
    this.gridScrollMax = Math.max(0, this.gridRowH - this.gridViewH);
    this.gridScroll = clamp(this.gridScroll, 0, this.gridScrollMax);
    this.gameBottom = this.gridY + gridCardH;
    this.answerScroll = clamp(this.answerScroll, 0, this.answerMaxScroll());
    this.drag = null;
  }

  handSlotRect(index) {
    const gap = this.handGap;
    const total = this.hand.length * this.handW + Math.max(0, this.hand.length - 1) * gap;
    const x0 = this.cx + (this.cw - total) / 2;
    return {
      x: x0 + index * (this.handW + gap),
      y: this.handY + 8,
      w: this.handW,
      h: this.handH,
    };
  }

  pickSlotRect(key) {
    const index = logic.SELECT_KEYS.indexOf(key);
    const col = index % 9;
    const row = Math.floor(index / 9);
    const total = 9 * this.pickW + 8 * this.gridGap;
    const x0 = this.cx + (this.cw - total) / 2;      // 三行都居中（不能只靠左）
    return {
      x: x0 + col * (this.pickW + this.gridGap),
      y: this.gridY + 8 + row * (this.pickH + GRID_ROW_GAP) - this.gridScroll,
      w: this.pickW,
      h: this.pickH,
    };
  }

  handDealP(index) {
    if (!this.dealStart) return 1;
    return clamp((this.now - this.dealStart - index * DEAL_STEP_HAND) / DEAL_MS, 0, 1);
  }

  pickDealP(index) {
    if (!this.dealStart) return 1;
    return clamp((this.now - this.dealStart - index * DEAL_STEP_PICK) / DEAL_MS, 0, 1);
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
    this.drawHand(c);
    this.drawAnswer(c);
    this.drawGrid(c);
    this.drawFlights(c);
    if (this.phase === WON) this.drawWin(c);
    if (!this.helpOpen && !this.confirming) this.drawFabs(c);
    this.drawConfetti(c);
    if (this.helpOpen) this.drawHelp(c);
    else if (this.confirming) this.drawConfirm(c);
  }

  drawHeader(c) {
    const T = theme.tokens;
    const label = t('gambler.gameTitle');
    D.text(c, label, W / 2, this.top + this.headerH / 2, {
      size: 15, weight: 'bold', color: T.text, align: 'center',
    });
    const h = this.homeRect;
    const hx = h.x + h.w / 2;
    const hy = h.y + h.h / 2;
    if (!icons.draw(c, 'home', hx, hy, 24, T.text)) {
      D.text(c, '⌂', hx, hy, { size: 24, color: T.text, align: 'center' });
    }
    this.addButton('home', h.x, h.y, h.w, h.h, () => this.app.goHome());
    // 连点标题 5 次清记录（web 的 onScoreReset）：标题本身是一条独立命中区
    const tw = Math.max(88, D.measure(c, label, 15, 'bold') + 40);
    this.addButton('title', W / 2 - tw / 2, this.top, tw, this.headerH, () => this.tapTitle());
  }

  drawScore(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.scoreY, this.cw, this.scoreH, T);
    const q = this.cw / 4;
    const stats = [
      [t('gambler.best'), this.best ? String(this.best) : '--'],
      [t('gambler.level'), String(this.level)],
      [t('gambler.streak'), String(this.streak)],
      [t('gambler.lives'), ''],
    ];
    stats.forEach(([label, value], i) => {
      if (i) D.divider(c, this.cx + q * i, this.scoreY + this.scoreH / 2, 24, T.border, 1);
      const x = this.cx + q * (i + 0.5);
      D.text(c, label, x, this.scoreY + 21, {
        size: fitFont(c, label, q - 8, 10.5, 'normal'), color: T.muted, align: 'center',
      });
      if (i === 3) {
        this.drawHearts(c, x, this.scoreY + 45);
      } else {
        D.text(c, value, x, this.scoreY + 44, { size: 20, weight: 'bold', color: T.text, align: 'center' });
      }
    });
  }

  drawHearts(c, cx, cy) {
    const T = theme.tokens;
    const s = 13;
    const gap = 5;
    const total = HEARTS_MAX * s + (HEARTS_MAX - 1) * gap;
    let x = cx - total / 2 + s / 2;
    for (let i = 0; i < HEARTS_MAX; i++) {
      const alive = i < this.hearts;
      drawHeart(c, x, cy, s, alive ? '#e2555a' : T.border, alive);
      // 刚失去的那颗：放大淡出，播完才只剩描边（同 web 的 heart-pop）
      if (!alive && this.heartLostAt >= 0 && i === this.heartLostIndex) {
        const age = this.now - this.heartLostAt;
        if (age >= 0 && age < HEART_POP_MS) {
          const p = age / HEART_POP_MS;
          const scale = p < 0.4 ? 1 + 0.55 * (p / 0.4) : 1.55 + 0.55 * ((p - 0.4) / 0.6);
          c.save();
          c.globalAlpha = p < 0.4 ? 1 : Math.max(0, 1 - (p - 0.4) / 0.6);
          c.translate(x, cy);
          c.scale(scale, scale);
          drawHeart(c, 0, 0, s, '#e2555a', true);
          c.restore();
        }
      }
      x += s + gap;
    }
  }

  drawOptions(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.optY, this.cw, this.optH, T);
    const midX = this.cx + this.cw / 2;
    D.divider(c, midX, this.optY + this.optH / 2, 24, T.border, 1);
    const midY = this.optY + this.optH / 2;
    const enabled = this.phase === PLAY && !this.revealing && !this.pendingLoss;

    this.drawButton(c, this.cx + this.cw / 4, midY, t('gambler.start'),
      T.primary, '#ffffff', enabled, () => this.onNewGameClick(), 'new-game');
    // 查看答案 = 放弃（橙色，和 24 点的「查看答案」同款）
    this.drawButton(c, midX + this.cw / 4, midY, t('gambler.reveal'),
      enabled ? T.god : T.disabled, '#ffffff', enabled, () => this.revealAnswers(), 'reveal');
  }

  drawButton(c, cx, cy, label, bg, color, enabled, onTap, id, outline) {
    const T = theme.tokens;
    const w = Math.min(132, D.measure(c, label, 12.5, 'bold') + 24);
    const h = 30;
    const x = cx - w / 2;
    const y = cy - h / 2;
    if (outline) {
      // 「重玩本关」= 橙色描边按钮（透明底 + 橙色字 + 1px 橙边，与全局约定一致）
      D.strokeRoundRect(c, x + 0.5, y + 0.5, w - 1, h - 1, 8, T.god, 1);
      D.text(c, label, cx, cy, { size: 12.5, weight: 'bold', color: T.god, align: 'center' });
    } else {
      D.fillRoundRect(c, x, y, w, h, 8, bg || T.primary);
      D.text(c, label, cx, cy, { size: 12.5, weight: 'bold', color: color || '#ffffff', align: 'center' });
    }
    if (enabled && onTap) this.addButton(id, x, y, w, h, onTap);
    return { x, y, w, h };
  }

  drawHand(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.handY, this.cw, this.handCardH, T);
    this.hand.forEach((key, i) => {
      const p = this.handDealP(i);
      if (p <= 0) return;
      const r = this.handSlotRect(i);
      const e = easeOut(p);
      c.save();
      c.globalAlpha = p;
      c.translate(r.x + r.w / 2, r.y + r.h / 2 - (1 - e) * 10);
      c.scale(0.4 + 0.6 * e, 0.4 + 0.6 * e);
      cards.draw(c, key, cards.MODE_MAHJONG, -r.w / 2, -r.h / 2, r.w, r.h, true);
      c.restore();
    });
    const tipY = this.handY + 8 + this.handH + 6;
    const main = t('gambler.handTip');
    D.text(c, main, this.cx + this.cw / 2, tipY + 8, {
      size: fitFont(c, main, this.cw - 20, 12.5, 'bold'), weight: 'bold', color: T.text, align: 'center',
    });
    const sub = t('gambler.pickTip');
    D.text(c, sub, this.cx + this.cw / 2, tipY + 24, {
      size: fitFont(c, sub, this.cw - 20, 11), color: T.muted, align: 'center',
    });
  }

  drawAnswer(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.answerY, this.cw, this.answerCardH, T);
    const shake = this.answerShakeAt >= 0
      ? fx.wrongShake(this.now - this.answerShakeAt, SUBMIT_LOCK_MS, 5) : 0;
    c.save();
    c.translate(shake, 0);

    // 答案区文案常驻在卡片上部居中（不随已选数量消失）
    const tip = t(this.mode === MODE_SUBMIT ? 'gambler.answerTipSubmit' : 'gambler.answerTip');
    let size = 11.5;
    let lines = D.wrapText(c, tip, this.cw - 16, size);
    while (lines.length > 2 && size > 8.5) {
      size -= 0.5;
      lines = D.wrapText(c, tip, this.cw - 16, size);
    }
    lines.slice(0, 2).forEach((line, i) => {
      D.text(c, line, this.cx + this.cw / 2, this.answerY + 8 + 7 + i * 15, {
        size, color: T.muted, align: 'center',
      });
    });

    const m = this.answerMetrics();
    c.save();
    D.roundRect(c, m.bodyX - 1, m.bodyY - 1, m.bodyW + 2, m.viewH + 2, 8);
    c.clip();
    this.picked.forEach((key, i) => {
      if (this.landing.has(key)) return;      // 还在飞：目标槽位先隐身
      this.drawAnswerTile(c, key, i);
    });
    c.restore();

    if (this.mode === MODE_SUBMIT) this.drawSubmit(c, m);
    c.restore();

    if (this.answerMaxScroll() > 0) {
      this.drawScrollRail(c, m.bodyX + m.bodyW - 2, m.bodyY, m.viewH, this.answerScroll, this.answerMaxScroll());
    }
  }

  answerSettled() {
    return this.reason !== '' || this.pickFailed || this.phase === LOST || this.phase === WON;
  }

  drawAnswerTile(c, key, index) {
    const T = theme.tokens;
    const r = this.answerSlotRect(index);
    let scale = 1;
    const popAt = this.pops.get(key);
    if (popAt != null) {
      const age = this.now - popAt;
      if (age >= 0 && age < 450) scale = fx.popScale(age);
    }
    let dx = 0;
    const wrongAt = this.wrongAt.get(key);
    if (wrongAt != null) dx = fx.wrongShake(this.now - wrongAt, 500, 3);
    const wrong = this.answerSettled() && !this.isPick(key);
    c.save();
    c.translate(r.x + r.w / 2 + dx, r.y + r.h / 2);
    c.scale(scale, scale);
    cards.draw(c, key, cards.MODE_MAHJONG, -r.w / 2, -r.h / 2, r.w, r.h, true);
    if (wrong) {
      D.strokeRoundRect(c, -r.w / 2 - 1, -r.h / 2 - 1, r.w + 2, r.h + 2, 9, T.lose, 2);
      D.text(c, '✗', 0, 0, {
        size: Math.max(12, Math.round(r.w * 0.55)), weight: 'bold', color: T.lose, align: 'center',
      });
    }
    c.restore();
    if (this.mode === MODE_SUBMIT && this.phase === PLAY && !this.revealing
      && !this.pendingLoss && !this.helpOpen && !this.confirming) {
      this.addButton(`answer-${key}`, r.x, r.y, r.w, r.h, () => this.unpick(key));
    }
  }

  drawSubmit(c, m) {
    const T = theme.tokens;
    const enabled = this.canSubmit();
    const w = m.submitW;
    const h = 30;
    const x = this.cx + this.cw - 8 - w;
    const y = m.bodyY + (m.viewH - h) / 2;
    D.fillRoundRect(c, x, y, w, h, 8, enabled ? T.primary : T.disabled);
    D.text(c, t('gambler.submit'), x + w / 2, y + h / 2, {
      size: 12, weight: 'bold', color: '#ffffff', align: 'center',
    });
    // 按钮常驻不消失：不可点时只是灰态
    if (enabled) this.addButton('submit', x, y, w, h, () => this.submitPicks());
  }

  drawScrollRail(c, x, y, h, scroll, max) {
    const T = theme.tokens;
    if (max <= 0) return;
    c.save();
    c.globalAlpha = 0.35;
    D.fillRoundRect(c, x, y, 2, h, 1, T.border);
    c.restore();
    const thumbH = Math.max(16, h * (h / (h + max)));
    const t = scroll / max;
    D.fillRoundRect(c, x, y + (h - thumbH) * t, 2, thumbH, 1, T.muted);
  }

  drawGrid(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.gridY, this.cw, this.gridCardH, T);
    const viewTop = this.gridY + 8;
    c.save();
    D.roundRect(c, this.cx + 1, viewTop, this.cw - 2, this.gridViewH, 8);
    c.clip();
    logic.SELECT_KEYS.forEach((key, i) => {
      const p = this.pickDealP(i);
      if (p <= 0) return;
      const r = this.pickSlotRect(key);
      if (r.y + r.h < viewTop || r.y > viewTop + this.gridViewH) return;
      const blocked = this.isBlockedKey(key);
      const used = this.isPicked(key);
      const missed = this.isMissed(key);
      let alpha = 1;
      if (blocked) alpha = 0.34;
      else if (used) alpha = 0.42;
      if (missed) alpha = 0.58;
      const e = easeOut(p);
      const scale = 0.45 + 0.55 * e;
      const shake = this.shakeKey === key && this.shakeAt >= 0
        ? fx.wrongShake(this.now - this.shakeAt, SHAKE_MS, 4) : 0;
      c.save();
      c.globalAlpha = Math.min(1, alpha) * p;
      c.translate(r.x + r.w / 2 + shake, r.y + r.h / 2 - (1 - e) * 8);
      c.scale(scale, scale);
      cards.draw(c, key, cards.MODE_MAHJONG, -r.w / 2, -r.h / 2, r.w, r.h, true);
      c.restore();

      // 即时判断选对：原位留一圈绿环（web 的 .picked；不再放大 / 闪烁）
      if (this.mode === MODE_INSTANT && used && !blocked && !missed) {
        D.strokeRoundRect(c, r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3, 9, T.primary, 2);
      }
      // 查看答案标出来的：绿色光晕（和玩家自己选的区分开）
      if (this.revealed && used && this.isPick(key)) {
        c.save();
        c.shadowColor = 'rgba(18,131,63,0.55)';
        c.shadowBlur = 8;
        D.strokeRoundRect(c, r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3, 9, T.win, 2);
        c.restore();
      }
      // 点错过的牌：红圈 + 大号 ✗，常驻不消失（不能只靠颜色，抖动由 shake 负责）
      if (missed) {
        D.strokeRoundRect(c, r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3, 9, T.lose, 2);
        D.text(c, '✗', r.x + r.w / 2, r.y + r.h / 2, {
          size: Math.max(13, Math.round(r.w * 0.6)), weight: 'bold', color: T.lose, align: 'center',
        });
      }
      if (!blocked && !used && !missed && this.canPick()) {
        this.addButton(`pick-${key}`, r.x, r.y, r.w, r.h, () => this.pick(key));
      }
    });
    c.restore();

    if (this.gridScrollMax > 0) {
      this.drawScrollRail(c, this.cx + this.cw - 6, viewTop, this.gridViewH,
        this.gridScroll, this.gridScrollMax);
    }
    if (this.pickFailed) this.drawLostMask(c);
  }

  drawFlights(c) {
    this.flights.forEach((flight) => {
      const p = clamp((this.now - flight.start) / flight.dur, 0, 1);
      if (p <= 0) return;
      const e = easeOut(p);
      const x = flight.from.x + (flight.to.x - flight.from.x) * e;
      const y = flight.from.y + (flight.to.y - flight.from.y) * e;
      const w = flight.from.w + (flight.to.w - flight.from.w) * e;
      const h = flight.from.h + (flight.to.h - flight.from.h) * e;
      c.save();
      c.globalAlpha = 0.97;
      c.shadowColor = 'rgba(0,0,0,0.18)';
      c.shadowBlur = 8;
      c.shadowOffsetY = 3;
      cards.draw(c, flight.key, cards.MODE_MAHJONG, x, y, w, h, true);
      c.restore();
    });
  }

  // 失败遮罩只盖选择区：答案区仍然看得见，方便复盘（web 同款）
  drawLostMask(c) {
    if (!this.resultVisible(250, 'lost')) return;
    const T = theme.tokens;
    c.save();
    D.roundRect(c, this.cx, this.gridY, this.cw, this.gridCardH, 14);
    c.clip();
    D.fillRoundRect(c, this.cx, this.gridY, this.cw, this.gridCardH, 14, overlayColor());
    const lines = D.wrapText(c, `👻 ${t('gambler.revealFailed')}`, this.cw - 36, 12.5);
    const lineH = 18;
    const legendH = 16;
    const contentH = lines.length * lineH + 4 + legendH + 10 + 30;
    let y = this.gridY + Math.max(8, (this.gridCardH - contentH) / 2);
    lines.forEach((line) => {
      D.text(c, line, this.cx + this.cw / 2, y + lineH / 2, {
        size: 12.5, weight: 'bold', color: T.lose, align: 'center',
      });
      y += lineH;
    });
    D.text(c, `✗ ${t('gambler.stampWrong')}`, this.cx + this.cw / 2, y + 4 + legendH / 2, {
      size: 11, color: T.lose, align: 'center',
    });
    y += 4 + legendH + 10;
    const gap = 10;
    const l1 = t('gambler.replayLevel');
    const l2 = t('gambler.start');
    const w1 = Math.min(126, D.measure(c, l1, 12, 'bold') + 24);
    const w2 = Math.min(112, D.measure(c, l2, 12, 'bold') + 24);
    const total = w1 + w2 + gap;
    let bx = this.cx + (this.cw - total) / 2;
    c.restore();
    // 遮罩本身不是按钮；两颗按钮后加，命中优先于下面已经被遮住的牌
    const b1 = this.drawButton(c, bx + w1 / 2, y + 15, l1, null, null, true,
      () => this.replayLevel(), 'lost-replay', true);
    const b2 = this.drawButton(c, b1.x + b1.w + gap + w2 / 2, y + 15, l2, T.primary, '#ffffff', true,
      () => this.startNewGame(), 'lost-new');
    void b2;
  }

  // 胜利浮层盖住游戏区（手牌 / 答案区 / 选择区），FAB 仍然显示
  drawWin(c) {
    if (!this.resultVisible(250, 'won')) return;
    const T = theme.tokens;
    const top = this.handY;
    const height = this.gameBottom - top;
    D.fillRoundRect(c, this.cx, top, this.cw, height, 14, overlayColor());
    const cx = this.cx + this.cw / 2;
    const cy = top + height / 2;
    D.text(c, `🎉🎉 ${t('gambler.tipWin')} 🎉🎉`, cx, cy - 52, {
      size: Math.min(19, this.cw / 18), weight: 'bold', color: T.win, align: 'center',
    });
    const note = `${t('gambler.winNote').replace('{n}', this.level)} · ${t('gambler.streakNow').replace('{n}', this.streak)}`;
    D.text(c, note, cx, cy - 22, {
      size: fitFont(c, note, this.cw - 24, 12.5), color: T.muted, align: 'center',
    });
    const gap = 10;
    const l1 = t('gambler.replayLevel');
    const l2 = t('gambler.nextLevel');
    const w1 = Math.min(126, D.measure(c, l1, 12, 'bold') + 24);
    const w2 = Math.min(120, D.measure(c, l2, 12, 'bold') + 24);
    const bx = cx - (w1 + w2 + gap) / 2;
    const by = cy + 6;
    this.drawButton(c, bx + w1 / 2, by + 15, l1, null, null, true,
      () => this.replayLevel(), 'win-replay', true);
    this.drawButton(c, bx + w1 + gap + w2 / 2, by + 15, l2, T.primary, '#ffffff', true,
      () => this.nextLevel(), 'win-next');
  }

  drawFabs(c) {
    const T = theme.tokens;
    const size = this.fabSize;
    this.drawFab(c, this.helpX, this.fabY, 'help', '?', T.text, true, () => this.openHelp(), 'help');
    const helpRect = { x: this.helpX, y: this.fabY, w: this.fabSize, h: this.fabSize };
    const muteRect = fabKit.muteSlot(helpRect);
    if (muteRect) fabKit.drawMute(this, c, muteRect);
    // 模式切换：即时判断 = 闪电、提交判断 = 双勾（与小程序一致）。
    const busy = this.revealing || this.flights.length > 0 || this.pendingLoss;
    const isEmoji = this.mode === MODE_INSTANT;
    this.drawFab(c, fabKit.slotLeft(helpRect, muteRect ? 2 : 1).x, this.fabY, 'mode', isEmoji ? '⚡' : '✓', T.primary,
      !busy, () => this.toggleMode(), isEmoji ? 'bolt' : 'check-all', isEmoji ? 17 : 22);
  }

  drawFab(c, x, y, id, fallback, color, enabled, onTap, name, fallbackSize) {
    const T = theme.tokens;
    const size = this.fabSize;
    c.save();
    c.globalAlpha = enabled ? 1 : 0.35;
    c.shadowColor = 'rgba(0,0,0,0.12)';
    c.shadowBlur = 10;
    c.shadowOffsetY = 2;
    D.circle(c, x + size / 2, y + size / 2, size / 2, T.card);
    c.restore();
    c.save();
    c.globalAlpha = enabled ? 1 : 0.35;
    if (!icons.draw(c, name, x + size / 2, y + size / 2, 22, color)) {
      const emoji = fallback === '⚡';
      D.text(c, fallback, x + size / 2, y + size / 2 + (emoji ? 1 : 0), {
        size: fallbackSize || 22,
        weight: 'bold',
        color,
        align: 'center',
        family: emoji ? '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif' : undefined,
      });
    }
    c.restore();
    if (enabled) this.addButton(`fab-${id}`, x, y, size, size, onTap);
  }

  drawConfetti(c) {
    if (this.confetti.length) confetti.draw(c, this.confetti);
  }

  // ---------- 弹层 ----------

  openHelp() {
    if (this.confirming) return;
    this.helpOpen = true;
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
    const keys = ['helpMsg', 'modeTip', 'help1', 'help2', 'help3', 'help4', 'help5'];
    let size = 12.5;
    let lineH = 17;
    let blocks = [];
    let contentH = 0;
    // 英文文案比中文长：从 12.5 一路缩到 10，挑第一个放得下的字号
    for (let step = 0; step < 6; step++) {
      size = 12.5 - step * 0.5;
      lineH = size + 4.5;
      blocks = [];
      contentH = 0;
      keys.forEach((key) => {
        const value = t(`gambler.${key}`);
        if (value === `gambler.${key}`) return;
        const lines = D.wrapText(c, value, innerW, size);
        blocks.push({ lines, gap: 7 });
        contentH += lines.length * lineH + 7;
      });
      if (headerH + contentH + 10 + footerH <= maxH) break;
    }
    const h = Math.min(maxH, headerH + contentH + 4 + footerH);
    const y = Math.max(12, (H - h) / 2);
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
    // 全屏遮罩先加，面板按钮后加（Input 从后往前找）
    this.addButton('help-mask', 0, 0, W, H, () => { this.helpOpen = false; });
    const bw = 110;
    const bx = x + (w - bw) / 2;
    const by = y + h - 42;
    D.fillRoundRect(c, bx, by, bw, 30, 8, T.primary);
    D.text(c, t('gambler.confirmText'), bx + bw / 2, by + 15, {
      size: 12, weight: 'bold', color: '#ffffff', align: 'center',
    });
    this.addButton('help-ok', bx, by, bw, 30, () => { this.helpOpen = false; });
  }

  drawConfirm(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(0, 0, W, H);
    const w = Math.min(W - 40, 336);
    const h = 208;
    const x = (W - w) / 2;
    const y = (H - h) / 2;
    D.card(c, x, y, w, h, T);
    D.text(c, t('gambler.start'), x + 20, y + 32, { size: 16, weight: 'bold', color: T.text });
    const msg = t('gambler.newGameConfirm');
    D.wrapText(c, msg, w - 40, 12.5).slice(0, 4).forEach((line, i) => {
      D.text(c, line, x + 20, y + 62 + i * 19, { size: 12.5, color: T.muted });
    });
    this.addButton('confirm-mask', 0, 0, W, H, () => { this.confirming = false; });
    const gap = 8;
    const count = 3;
    const bw = (w - 40 - gap * (count - 1)) / count;
    const by = y + h - 48;
    // 取消（灰描边）/ 重玩本关（橙描边）/ 新游戏（主色实心）
    let bx = x + 20;
    D.strokeRoundRect(c, bx + 0.5, by + 0.5, bw - 1, 31, 8, T.border, 1);
    D.text(c, t('gambler.cancel'), bx + bw / 2, by + 16, {
      size: 11.5, weight: 'bold', color: T.text, align: 'center',
    });
    this.addButton('confirm-cancel', bx, by, bw, 32, () => { this.confirming = false; });
    bx = x + 20 + bw + gap;
    D.strokeRoundRect(c, bx + 0.5, by + 0.5, bw - 1, 31, 8, T.god, 1);
    D.text(c, t('gambler.replayLevel'), bx + bw / 2, by + 16, {
      size: fitFont(c, t('gambler.replayLevel'), bw - 8, 11.5, 'bold'), weight: 'bold',
      color: T.god, align: 'center',
    });
    // 「重玩本关」必须先把弹窗收掉（web 踩过：弹窗不关）
    this.addButton('confirm-replay', bx, by, bw, 32, () => this.replayLevel());
    bx = x + 20 + (bw + gap) * (count - 1);
    D.fillRoundRect(c, bx, by, bw, 32, 8, T.primary);
    D.text(c, t('gambler.confirmNew'), bx + bw / 2, by + 16, {
      size: 11.5, weight: 'bold', color: '#ffffff', align: 'center',
    });
    this.addButton('confirm-new', bx, by, bw, 32, () => this.startNewGame());
  }

  // ---------- 输入（滚动：选择区 / 答案区内部拖动，不占整盘锁） ----------

  onTouchStart(p) {
    if (!p || this.helpOpen || this.confirming) return;
    this.drag = null;
    const viewTop = this.gridY + 8;
    if (this.gridScrollMax > 0 && D.hit({
      x: this.cx, y: viewTop, w: this.cw, h: this.gridViewH,
    }, p.x, p.y)) {
      this.drag = { kind: 'grid', y: p.y, scroll: this.gridScroll };
      return;
    }
    const m = this.answerMetrics();
    if (this.answerMaxScroll() > 0 && D.hit({
      x: m.bodyX, y: m.bodyY, w: m.bodyW, h: m.viewH,
    }, p.x, p.y)) {
      this.drag = { kind: 'answer', y: p.y, scroll: this.answerScroll };
    }
  }

  onTouchMove(p) {
    if (!this.drag || !p) return;
    const dy = p.y - this.drag.y;
    if (this.drag.kind === 'grid') {
      this.gridScroll = clamp(this.drag.scroll - dy, 0, this.gridScrollMax);
    } else {
      this.answerScroll = clamp(this.drag.scroll - dy, 0, this.answerMaxScroll());
    }
  }

  onTouchEnd() {
    this.drag = null;
  }

  // ---------- 生命周期 ----------

  onTheme() { this.layout(); }
  onResize() { this.layout(); }
  onHide() { this.save(); }
  onShow() { this.now = this.clock; }
}

module.exports = GamblerScene;
