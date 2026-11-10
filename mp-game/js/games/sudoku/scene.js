// 数独（Sudoku）· 小游戏 canvas 场景。
// 玩法 / 视觉基准：web `src/games/sudoku/SudokuGame.vue` + `sudoku.js`。
// 纯逻辑（唯一解挖洞生成 / 解法计数）在 ./sudoku.js，这里只负责布局、绘制、触摸与存档。
//
// 存档 key 与 web / 小程序一字不差：
//   __sudoku_game__difficulty   当前难度 1~3
//   __sudoku_game__state        进行中的局面（难度 / 计时秒数 / 每格 [数字, 题面格, 笔记掩码] / 唯一解 / 剩余❤️）
//   __sudoku_game__cand_all     候选按钮行为：1 = 一键填满全盘
//   __sudoku_game__<1..3>       各难度最佳用时（秒）
const { W, H, SAFE_BOTTOM } = require('../../core/canvas');
const share = require('../../core/share');
const HEADER = require('../../core/header');
const { drawTimer } = require('../../core/timer');
const { Scene } = require('../../core/app');
const theme = require('../../core/theme');
const { t } = require('../../core/i18n');
const { getRaw, setRaw, removeRaw } = require('../../core/storage');
const D = require('../../core/draw');
const ParticleField = require('../../core/particles');
const icons = require('../../core/icons');
const fabKit = require('../../core/fab');
const confetti = require('../../core/confetti');
const { wrongShake, popScale } = require('../../core/fx');
const achv = require('../../core/achv');
const logic = require('./sudoku');
const i18nDict = require('./i18n');

const coreI18n = require('../../core/i18n');
if (!coreI18n.__sudokuRegistered) {
  coreI18n.register('sudoku', i18nDict);
  coreI18n.__sudokuRegistered = true;
}

const N = 9;
const CELLS = 81;
const NUMS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
// 笔记用 1 << d（d = 1..9），数字 9 落在 bit 9 = 512，掩码至少要 (1 << 10) - 1；
// 写 511 会把「只剩 9」的笔记整格抹掉（web 分册里记过这个坑）
const NOTES_MASK = (1 << (NUMS.length + 1)) - 1;
const PLAY = 'play';
const WON = 'won';
const OVER = 'over';
const PREFIX = '__sudoku_game__';
const DIFFICULTY_KEY = `${PREFIX}difficulty`;
const STATE_KEY = `${PREFIX}state`;
// 简单 / 中等 / 困难：预填越少越难（挖空数递增）
const DIFFICULTIES = [{ empties: 40 }, { empties: 48 }, { empties: 55 }];
const DIFF_NAMES = ['diffEasy', 'diffMedium', 'diffHard'];
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 3;
// 入场：行优先（row * 9 + col 就是扁平下标），先左上后右下，单格 240ms
const REVEAL_STEP = 9;
const REVEAL_MS = 240;
const WIN_DELAY = 450;
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji",sans-serif';

// 数独专属色（对齐 web App.vue 的 --sudoku-*）：三档高亮 同行列宫 < 同数字 < 选中格
const SUDOKU = {
  light: { line: '#d3d8df', strong: '#5f7086', hl: '#c9d6e8', same: '#8fdcb2', note: '#9fe3bf', sel: '#7ad0a4' },
  dark: { line: '#545d6b', strong: '#92a3ba', hl: '#4a5462', same: 'rgba(78,201,138,0.42)', note: 'rgba(78,201,138,0.38)', sel: 'rgba(78,201,138,0.62)' },
};
function palette() { return SUDOKU[theme.dark ? 'dark' : 'light']; }

function fmt(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function easeOut(p) { return 1 - Math.pow(1 - p, 3); }
function revealScale(p) {
  if (p >= 1) return 1;
  if (p < 0.6) return 0.3 + (1.12 - 0.3) * (p / 0.6);
  return 1.12 - 0.12 * ((p - 0.6) / 0.4);
}

class SudokuScene extends Scene {
  constructor(app) {
    super(app);
    this.bg = new ParticleField();
    this.difficulty = this.initDifficulty();
    this.cells = [];
    this.solution = [];
    this.hearts = this.difficulty;
    this.selected = -1;
    this.notesMode = false;
    this.phase = PLAY;
    this.best = this.loadBest();
    this.newBest = false;
    this.time = 0;
    this.baseTime = 0;
    this.startAt = 0;
    this.winAt = 0;
    this.revealing = false;
    this.revealStart = 0;
    this.cellFx = new Map();
    this.confirming = false;
    this.helpOpen = false;
    this.confetti = [];
    this.confettiUntil = 0;
    this.lastConfettiAt = 0;
    this.now = Date.now();
    this.layout();
    if (!this.restore()) this.newGame();
  }

  // ---------- 存档 key / 读写 ----------
  initDifficulty() {
    const n = +(getRaw(DIFFICULTY_KEY, '1') || 1);
    return n >= MIN_DIFFICULTY && n <= MAX_DIFFICULTY ? n : 1;
  }
  bestKey() { return `${PREFIX}${this.difficulty}`; }
  loadBest() { return +(getRaw(this.bestKey(), 0) || 0); }

  // ---------- 计时（暂停时 startAt = 0） ----------
  seconds() {
    if (!this.startAt) return this.baseTime;
    return this.baseTime + Math.floor((Date.now() - this.startAt) / 1000);
  }
  pauseTimer() {
    if (this.startAt) {
      this.baseTime += Math.floor((Date.now() - this.startAt) / 1000);
      this.startAt = 0;
    }
    this.time = this.baseTime;
  }
  resumeTimer() {
    if (this.phase !== PLAY || this.startAt || this.helpOpen || this.confirming || this.winAt) return;
    this.startAt = Date.now();
  }

  // ---------- 新游戏 ----------
  newGame() {
    const puzzle = logic.generatePuzzle(DIFFICULTIES[this.difficulty - 1].empties);
    this.cells = puzzle.puzzle.map(v => ({ v, fixed: v > 0, notes: 0 }));
    this.solution = puzzle.solution;
    this.hearts = this.difficulty; // 简单 1 / 中等 2 / 困难 3
    this.selected = -1;
    this.notesMode = false;
    this.phase = PLAY;
    this.newBest = false;
    this.winAt = 0;
    this.cellFx.clear();
    this.confirming = false;
    this.helpOpen = false;
    this.baseTime = 0;
    this.time = 0;
    this.startAt = Date.now();
    this.best = this.loadBest();
    this.reveal();
    this.layout();
    this.saveState();
  }

  onNewGame() {
    const untouched = this.cells.every(c => c.fixed || (!c.v && !c.notes));
    if (this.phase !== PLAY || untouched) {
      this.startNewGame();
      return;
    }
    this.confirming = true;
    this.pauseTimer();
  }
  startNewGame() {
    this.confirming = false;
    this.newGame();
  }
  cancelConfirm() {
    this.confirming = false;
    this.resumeTimer();
  }

  changeDifficulty(dir) {
    const next = this.difficulty + dir;
    if (next < MIN_DIFFICULTY || next > MAX_DIFFICULTY) return;
    this.difficulty = next;
    setRaw(DIFFICULTY_KEY, String(next));
    this.newGame();
  }

  // ---------- 入场（行优先，新局与恢复都走这里） ----------
  reveal() {
    this.revealStart = Date.now();
    this.revealing = true;
  }
  revealP(i) {
    if (!this.revealing) return 1;
    const p = (this.now - this.revealStart - i * REVEAL_STEP) / REVEAL_MS;
    return p <= 0 ? 0 : p >= 1 ? 1 : p;
  }

  // ---------- 存档 ----------
  saveState() {
    if (this.phase !== PLAY || this.winAt) return;
    if (this.isFinished()) { removeRaw(STATE_KEY); return; }
    const payload = {
      difficulty: this.difficulty,
      phase: this.phase,
      time: this.seconds(),
      cells: this.cells.map(c => [c.v, c.fixed ? 1 : 0, c.notes]),
      solution: this.solution,
      hearts: this.hearts,
    };
    try {
      setRaw(STATE_KEY, JSON.stringify(payload));
    } catch (e) { /* 存储满 / 隐私限制时不影响游玩 */ }
  }

  restore() {
    try {
      const raw = getRaw(STATE_KEY, '');
      if (!raw) return false;
      const saved = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!saved || !Array.isArray(saved.cells) || saved.cells.length !== CELLS) return false;
      const d = +saved.difficulty;
      if (!(d >= MIN_DIFFICULTY && d <= MAX_DIFFICULTY)) return false;
      const sol = saved.solution;
      if (!Array.isArray(sol) || sol.length !== CELLS) return false;
      for (let i = 0; i < CELLS; i++) {
        const v = sol[i];
        if (!(v >= 1 && v <= 9 && v === (v | 0))) return false;
      }
      const cells = saved.cells.map((entry) => {
        const arr = Array.isArray(entry) ? entry : [0, 0, 0];
        const v = Math.min(9, Math.max(0, +arr[0] || 0));
        const fixed = Boolean(arr[1]) && v > 0;
        const notes = fixed ? 0 : (+arr[2] || 0) & NOTES_MASK;
        return { v, fixed, notes };
      });
      // 已完成的盘不再恢复（胜利时已 removeState，这里只是兜底）
      let done = true;
      for (let i = 0; i < CELLS; i++) {
        if (cells[i].v !== sol[i]) { done = false; break; }
      }
      if (done) return false;

      this.difficulty = d;
      setRaw(DIFFICULTY_KEY, String(d));
      this.cells = cells;
      this.solution = sol.slice();
      const hv = +saved.hearts;
      this.hearts = hv >= 0 && hv <= d ? hv : d;
      this.selected = -1;
      this.notesMode = false;
      this.phase = PLAY;
      this.newBest = false;
      this.winAt = 0;
      this.cellFx.clear();
      this.best = this.loadBest();
      this.baseTime = Math.max(0, Math.floor(+saved.time || 0));
      this.startAt = Date.now();
      this.time = this.baseTime;
      this.confirming = false;
      this.helpOpen = false;
      this.reveal();          // 恢复也按行优先逐格入场
      this.layout();          // PITFALLS #9：恢复后必须重新布局
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- 纸面计算 ----------
  isFinished() {
    for (let i = 0; i < CELLS; i++) {
      if (!this.cells[i] || !this.cells[i].v || this.cells[i].v !== this.solution[i]) return false;
    }
    return true;
  }
  isWrong(i) {
    const cell = this.cells[i];
    return Boolean(cell && cell.v && cell.v !== this.solution[i]);
  }
  digitLeft(d) {
    let used = 0;
    for (let i = 0; i < CELLS; i++) if (this.cells[i].v === d) used++;
    return 9 - used;
  }
  get hlDigit() {
    const s = this.selected;
    return s >= 0 && this.cells[s] ? this.cells[s].v || 0 : 0;
  }
  padDigit() {
    const s = this.selected;
    if (s < 0) return 0;
    const cell = this.cells[s];
    return cell && !cell.fixed ? cell.v : 0;
  }
  // 该格可用候选：排除同行 / 同列 / 同宫已出现的数字，以及全盘已经放满的数字
  candidatesFor(i) {
    const used = new Set();
    const peers = logic.PEERS[i];
    for (let k = 0; k < peers.length; k++) {
      const v = this.cells[peers[k]].v;
      if (v) used.add(v);
    }
    let mask = 0;
    for (let k = 0; k < NUMS.length; k++) {
      const d = NUMS[k];
      if (!used.has(d) && this.digitLeft(d) > 0) mask |= 1 << d;
    }
    return mask;
  }
  // 正确填入 d 后，把同行 / 同列 / 同宫里其它空格候选中的 d 划掉
  pruneNotes(i, d) {
    const bit = 1 << d;
    let touched = false;
    const peers = logic.PEERS[i];
    for (let k = 0; k < peers.length; k++) {
      const cell = this.cells[peers[k]];
      if (!cell || cell.fixed || cell.v || !(cell.notes & bit)) continue;
      cell.notes &= ~bit;
      touched = true;
    }
    return touched;
  }

  // ---------- 布局 ----------
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

    // 底部数字键盘卡：数字行 40 + 工具行 34 + 6 间距 + 上下 6
    this.padPad = 6;
    this.keyGap = 6;
    this.keyH = 40;
    this.toolGap = 6;
    this.toolH = 34;
    this.padH = this.padPad * 2 + this.keyH + 6 + this.toolH;

    // 操作区比内容窄 56px，右下角帮助按钮放在它外侧，不侵入操作卡。
    this.padX = this.cx;
    this.padW = this.cw;
    this.fabSize = fabKit.SIZE;
    this.helpFab = { x: W - 16 - this.fabSize, y: H - SAFE_BOTTOM - 16 - this.fabSize, w: this.fabSize, h: this.fabSize };

    // 棋盘顶边、棋盘底边到操作区、操作区顶边都保持固定 12px；
    // 空间不够时只缩棋盘，不把棋盘或键盘居中。
    const bandTop = this.optY + this.optH + 12;
    // 键盘下方再留 56px：40px 帮助按钮 + 8px 间隙，操作卡全宽且不与帮助重叠。
    const maxByHeight = H - SAFE_BOTTOM - 8 - this.padH - 56 - bandTop - 12;
    this.boardSize = Math.max(150, Math.min(this.cw, maxByHeight));
    this.boardX = (W - this.boardSize) / 2;
    this.boardY = bandTop;
    this.padY = this.boardY + this.boardSize + 12;
    this.boardR = 12;
    this.frame = 2;
    this.cellSize = (this.boardSize - this.frame * 2) / N;
    this.numSize = Math.max(15, Math.floor(this.cellSize * 0.52));
    this.noteSize = Math.max(9, Math.floor(this.cellSize * 0.28));
  }

  cellRect(i) {
    const r = (i / 9) | 0;
    const c = i % 9;
    return {
      x: this.boardX + this.frame + c * this.cellSize,
      y: this.boardY + this.frame + r * this.cellSize,
      w: this.cellSize,
      h: this.cellSize,
    };
  }

  // ---------- 帧循环 ----------
  update(dt) {
    this.now = Date.now();
    if (this.bg) this.bg.update(dt || 16);
    if (this.phase === PLAY && this.startAt && !this.helpOpen && !this.confirming) {
      const sec = this.baseTime + Math.floor((this.now - this.startAt) / 1000);
      if (sec !== this.time) {
        this.time = sec;
        this.saveState();
      }
    } else if (!this.startAt) {
      this.time = this.baseTime;
    }
    if (this.phase === PLAY && this.winAt && this.now >= this.winAt) {
      this.winAt = 0;
      this.phase = WON;
      // 只在「刚通关」这一帧记一次（以前写在这一行外面，每帧都会 +1）
      achv.win('sudoku', { mode: this.difficulty });
      // 0 错误通关（一颗心都没掉）：中等 / 困难各记一次，给成就用
      if (this.hearts === this.difficulty) {
        if (this.difficulty === 2) achv.bump('sudoku', 'clean2');
        else if (this.difficulty === 3) achv.bump('sudoku', 'clean3');
      }
    }
    if (this.revealing && this.now - this.revealStart >= CELLS * REVEAL_STEP + REVEAL_MS + 40) {
      this.revealing = false;
    }
    this.cellFx.forEach((fx, i) => {
      const age = this.now - fx.at;
      if ((fx.type === 'correct' && age >= 450) || (fx.type === 'wrong' && age >= 350)) this.cellFx.delete(i);
    });
    if (this.now < this.confettiUntil && this.now - this.lastConfettiAt >= 40) {
      this.lastConfettiAt = this.now;
      this.emitConfetti();
    }
    this.confetti = confetti.update(this.confetti, dt || 16, H);
  }

  // ---------- 渲染 ----------
  render(c) {
    this.buttons = [];
    const T = theme.tokens;
    c.fillStyle = T.bg;
    c.fillRect(0, 0, W, H);
    this.bg.draw(c, theme.dark);
    this.drawHeader(c);
    this.drawScore(c);
    this.drawOptions(c);
    this.drawBoard(c);
    this.drawPad(c);
    if (!this.helpOpen && !this.confirming) this.drawFabs(c);
    this.drawConfetti(c);
    if (this.helpOpen) this.drawHelp(c);
    if (this.confirming) this.drawConfirm(c);
  }


  drawHeader(c) {
    const T = theme.tokens;
    D.text(c, t('sudoku.gameTitle'), W / 2, this.top + this.headerH / 2, {
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
    // 最佳用时（空值占位 --:--）
    D.text(c, t('sudoku.bestScore'), this.cx + half / 2, this.scoreY + 24, { size: 12, color: T.muted, align: 'center' });
    D.text(c, this.best ? fmt(this.best) : '--:--', this.cx + half / 2, this.scoreY + 48, {
      size: 22, weight: 'bold', color: T.text, align: 'center',
    });
    // 生命永远排最后一项
    const hx0 = this.cx + half + half / 2;
    D.text(c, t('sudoku.hearts'), hx0, this.scoreY + 24, { size: 12, color: T.muted, align: 'center' });
    const max = Math.max(1, this.difficulty);
    const step = 20;
    const start = hx0 - ((max - 1) * step) / 2;
    for (let i = 0; i < max; i++) {
      D.text(c, i < this.hearts ? '❤️' : '🤍', start + i * step, this.scoreY + 48, {
        size: 17, color: T.text, align: 'center', family: EMOJI_FONT,
      });
    }
  }

  drawOptions(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.optY, this.cw, this.optH, T);
    const x1 = this.cx + this.cw / 3;
    const x2 = this.cx + this.cw * 2 / 3;
    const mid = this.optY + this.optH / 2;
    D.divider(c, x1, mid, 24, T.border, 1);
    D.divider(c, x2, mid, 24, T.border, 1);

    // 难度：− 难度名 + 作为一组紧挨，在左半区居中
    const diffName = t('sudoku.' + DIFF_NAMES[this.difficulty - 1]);
    const numW = Math.max(26, D.measure(c, diffName, 13, 'bold'));
    const gap = 6;
    const groupW = 24 + gap + numW + gap + 24;
    const gx = this.cx + (x1 - this.cx - groupW) / 2;
    const minus = { x: gx, y: mid - 12, w: 24, h: 24 };
    const plus = { x: gx + groupW - 24, y: mid - 12, w: 24, h: 24 };
    this.drawMiniButton(c, minus, '−', this.difficulty > MIN_DIFFICULTY, () => this.changeDifficulty(-1));
    this.drawMiniButton(c, plus, '+', this.difficulty < MAX_DIFFICULTY, () => this.changeDifficulty(1));
    D.text(c, diffName, gx + 24 + gap + numW / 2, mid, {
      size: 13, weight: 'bold', color: T.text, align: 'center',
    });

    // 秒表：只在 PLAY 时走字，帮助 / 确认打开时暂停
    drawTimer(c, 'stopwatch', (x1 + x2) / 2, mid, fmt(this.time), { size: 15, color: T.text });

    // 新游戏
    const label = t('sudoku.start');
    const bw = Math.min(118, D.measure(c, label, 13, 'bold') + 24);
    const bx = x2 + (this.cx + this.cw - x2 - bw) / 2;
    const by = mid - 16;
    D.fillRoundRect(c, bx, by, bw, 32, 8, T.primary);
    D.text(c, label, bx + bw / 2, by + 16, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('new', bx, by, bw, 32, () => this.onNewGame());
  }

  drawMiniButton(c, r, label, enabled, onTap) {
    const T = theme.tokens;
    D.fillRoundRect(c, r.x, r.y, r.w, r.h, 8, T.card);
    D.strokeRoundRect(c, r.x, r.y, r.w, r.h, 8, T.border, 1);
    D.text(c, label, r.x + r.w / 2, r.y + r.h / 2, {
      size: 15, weight: 'bold', color: enabled ? T.text : T.border, align: 'center',
    });
    if (enabled) this.addButton('diff-' + label, r.x - 8, r.y - 8, r.w + 16, r.h + 16, onTap);
  }
  cellLevel(i) {
    const cell = this.cells[i];
    if (!cell) return '';
    if (!cell.fixed && this.isWrong(i)) return 'wrong';
    if (i === this.selected) return 'sel';
    const s = this.selected;
    if (s >= 0 && this.cells[s] && this.cells[s].v) {
      if (cell.v === this.cells[s].v) return 'same';
      // 带同数字候选的格子只高亮那个候选数字本身，不再给整格 peer 底色。
      if (cell.notes && (cell.notes & (1 << this.cells[s].v))) return '';
      if (logic.PEERS[s].indexOf(i) >= 0) return 'hl';
    }
    return '';
  }

  drawBoard(c) {
    const T = theme.tokens;
    const S = palette();
    const x = this.boardX, y = this.boardY, size = this.boardSize;
    const f = this.frame, cs = this.cellSize;
    const now = this.now;
    c.save();
    D.roundRect(c, x, y, size, size, this.boardR);
    c.clip();
    // 外框 + 内层都走圆角，内层不能再用 fillRect 盖掉外框四角。
    D.fillRoundRect(c, x, y, size, size, this.boardR, S.strong);
    D.fillRoundRect(c, x + f, y + f, size - f * 2, size - f * 2, Math.max(0, this.boardR - f), T.card);

    for (let i = 0; i < CELLS; i++) {
      const q = this.cellRect(i);
      const level = this.cellLevel(i);
      if (level) {
        c.fillStyle = level === 'wrong' ? T.delBg
          : level === 'sel' ? S.sel
            : level === 'same' ? S.same : S.hl;
        c.fillRect(q.x, q.y, q.w, q.h);
      }
      if (this.revealing) {
        const p = this.revealP(i);
        if (p < 1) {
          c.globalAlpha = (1 - p) * 0.55;
          c.fillStyle = T.keyBg;
          c.fillRect(q.x, q.y, q.w, q.h);
          c.globalAlpha = 1;
        }
      }
    }

    for (let i = 1; i < N; i++) {
      const thick = i % 3 === 0;
      c.strokeStyle = thick ? S.strong : S.line;
      c.lineWidth = thick ? 2 : 1;
      const lx = x + f + i * cs;
      c.beginPath(); c.moveTo(lx, y + f); c.lineTo(lx, y + f + size - f * 2); c.stroke();
      const ly = y + f + i * cs;
      c.beginPath(); c.moveTo(x + f, ly); c.lineTo(x + f + size - f * 2, ly); c.stroke();
    }

    for (let i = 0; i < CELLS; i++) this.drawCellContent(c, i, now);
    c.restore();

    if (this.selected >= 0 && this.cells[this.selected]) {
      const q = this.cellRect(this.selected);
      const wrong = this.cellLevel(this.selected) === 'wrong';
      D.strokeRoundRect(c, q.x + 1.5, q.y + 1.5, q.w - 3, q.h - 3, 3, wrong ? T.delColor : T.primary, 2);
    }
    if (this.phase === WON || this.phase === OVER) this.drawResult(c);
    if (this.phase === PLAY && !this.winAt) {
      for (let i = 0; i < CELLS; i++) {
        const q = this.cellRect(i);
        this.addButton('cell-' + i, q.x, q.y, q.w, q.h, () => this.onCell(i));
      }
    }
  }

  drawCellContent(c, i, now) {
    const cell = this.cells[i];
    if (!cell) return;
    const p = this.revealing ? this.revealP(i) : 1;
    if (p <= 0) return;
    const q = this.cellRect(i);
    let scale = revealScale(p);
    let dx = 0;
    const fx = this.cellFx.get(i);
    if (fx && fx.type === 'wrong') dx = wrongShake(now - fx.at);
    if (fx && fx.type === 'correct') scale *= popScale(now - fx.at);
    c.save();
    c.globalAlpha = p;
    c.translate(q.x + q.w / 2 + dx, q.y + q.h / 2);
    c.scale(scale, scale);
    if (cell.v) {
      const wrong = !cell.fixed && this.isWrong(i);
      D.text(c, String(cell.v), 0, 0, {
        size: this.numSize,
        weight: cell.fixed ? 'bold' : 'normal',
        color: wrong ? theme.tokens.delColor : cell.fixed ? palette().strong : theme.tokens.text,
        align: 'center',
      });
    } else if (cell.notes) {
      const s = this.noteSize;
      const highlight = this.hlDigit;
      for (let d = 1; d <= 9; d++) {
        if (!(cell.notes & (1 << d))) continue;
        const nr = Math.floor((d - 1) / 3), nc = (d - 1) % 3;
        const nx = (nc - 1) * q.w * 0.27;
        const ny = (nr - 1) * q.h * 0.27;
        // 只给与当前数字相同的候选数字本身铺背景，不整格高亮。
        if (d === highlight) {
          D.fillRoundRect(c, nx - s * 0.62, ny - s * 0.62, s * 1.24, s * 1.24, 3, palette().note);
        }
        D.text(c, String(d), nx, ny, {
          size: s, color: theme.tokens.muted, align: 'center',
        });
      }
    }
    c.restore();
  }

  drawPad(c) {
    const T = theme.tokens;
    const x = this.padX, y = this.padY, w = this.padW, h = this.padH;
    const playable = this.phase === PLAY && !this.winAt;
    c.save();
    c.shadowColor = T.cardShadow; c.shadowBlur = 12; c.shadowOffsetY = -2;
    D.fillRoundRect(c, x, y, w, h, 14, T.card);
    c.restore();
    const pad = this.padPad;
    const innerX = x + pad, innerW = w - pad * 2;
    const kw = (innerW - this.keyGap * (N - 1)) / N;
    const keyY = y + pad;
    const padDigit = this.padDigit();
    for (let d = 1; d <= 9; d++) {
      const kx = innerX + (d - 1) * (kw + this.keyGap);
      const left = this.digitLeft(d);
      const on = padDigit === d;
      const used = left <= 0 && !on;
      D.fillRoundRect(c, kx, keyY, kw, this.keyH, 8, on ? T.primary : T.keyBg);
      c.save();
      c.globalAlpha = used ? 0.35 : 1;
      D.text(c, String(d), kx + kw / 2, keyY + this.keyH / 2, {
        size: 18, weight: 'bold', color: on ? '#fff' : T.text, align: 'center',
      });
      if (left > 0) D.text(c, String(left), kx + kw - 5, keyY + 9, {
        size: 10, weight: 'bold', color: on ? '#fff' : T.text, align: 'right',
      });
      c.restore();
      if (playable) this.addButton('pad-' + d, kx, keyY, kw, this.keyH, () => this.onPad(d));
    }

    // 工具行：候选 / 笔记 / 擦除，三色图标 + 文字。
    const toolsY = keyY + this.keyH + 6;
    const tw = (innerW - this.toolGap * 2) / 3;
    const tools = [
      ['tool-cand', t('sudoku.candidates'), 'list-numbered', T.primary, false, () => this.fillAllCandidates()],
      ['tool-notes', t('sudoku.notes'), 'pencil', '#5b6fb5', this.notesMode, () => this.toggleNotesMode()],
      ['tool-erase', t('sudoku.erase'), 'backspace', T.delColor, false, () => this.onErase()],
    ];
    tools.forEach(([id, label, iconKey, color, active, onTap], idx) => {
      const tx = innerX + idx * (tw + this.toolGap);
      const cy = toolsY + this.toolH / 2;
      D.fillRoundRect(c, tx, toolsY, tw, this.toolH, 8, active ? T.enter : T.card);
      D.strokeRoundRect(c, tx, toolsY, tw, this.toolH, 8, active ? color : T.border, 1);
      // 图标与文字作为一个整体居中，间距 5px；不像之前图标靠左、文字单独居中。
      const labelW = D.measure(c, label, 12, 'bold');
      const groupW = 15 + 5 + labelW;
      const gx = tx + (tw - groupW) / 2;
      const iconX = gx + 7.5;
      if (!icons.draw(c, iconKey, iconX, cy, 15, color)) {
        D.text(c, iconKey === 'backspace' ? '⌫' : iconKey === 'pencil' ? '✎' : '≡', iconX, cy, {
          size: 13, color, align: 'center',
        });
      }
      D.text(c, label, gx + 15 + 5 + labelW / 2, cy, { size: 12, weight: 'bold', color: active ? color : T.text, align: 'center' });
      if (playable) this.addButton(id, tx, toolsY, tw, this.toolH, onTap);
    });
  }

  drawFabs(c) {
    const T = theme.tokens;
    const r = this.helpFab;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.12)'; c.shadowBlur = 10; c.shadowOffsetY = 2;
    D.circle(c, r.x + r.w / 2, r.y + r.h / 2, r.w / 2, T.card);
    fabKit.stroke(c, r.x + r.w / 2, r.y + r.h / 2, r.w / 2, fabKit.borderOf('help'));
    c.restore();
    if (!icons.draw(c, 'help', r.x + r.w / 2, r.y + r.h / 2, 21, T.text)) {
      D.text(c, '?', r.x + r.w / 2, r.y + r.h / 2, { size: 18, color: T.text, align: 'center' });
    }
    this.addButton('fab-help', r.x, r.y, r.w, r.h, () => this.openHelp());
    fabKit.drawMute(this, c, fabKit.leftSlot(r));
  }

  drawResult(c) {
    if (!this.resultVisible()) return;
    const T = theme.tokens;
    const x = this.boardX, y = this.boardY, size = this.boardSize;
    share.resultPanel(c, this, y, size, { radius: this.boardR });
    const cx = W / 2, cy = y + size / 2;
    const won = this.phase === WON;
    if (won) {
      D.text(c, `🎉🎉 ${t('sudoku.tipWin')} 🎉🎉`, cx, cy - 32, { size: 20, weight: 'bold', color: T.win, align: 'center' });
      D.text(c, fmt(this.time), cx, cy + 2, { size: 28, weight: 'bold', color: T.win, align: 'center' });
      if (this.newBest) D.text(c, t('sudoku.newBest'), cx, cy + 30, { size: 13, color: T.muted, align: 'center' });
      const label = t('sudoku.replayLevel');
      const bw = Math.min(150, D.measure(c, label, 13, 'bold') + 24);
      D.fillRoundRect(c, cx - bw / 2, cy + 52, bw, 32, 8, T.primary);
      D.text(c, label, cx, cy + 68, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
      this.addButton('result-replay', cx - bw / 2, cy + 52, bw, 32, () => this.newGame());
    } else {
      D.text(c, `💥 ${t('sudoku.tipLost')} 💥`, cx, cy - 26, { size: 20, weight: 'bold', color: T.lose, align: 'center' });
      D.text(c, `${this.hearts} ${t('sudoku.hearts')}`, cx, cy + 10, { size: 16, color: T.lose, align: 'center' });
      const label = t('sudoku.replayLevel');
      const bw = Math.min(150, D.measure(c, label, 13, 'bold') + 24);
      D.fillRoundRect(c, cx - bw / 2, cy + 42, bw, 32, 8, T.primary);
      D.text(c, label, cx, cy + 58, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
      this.addButton('result-replay', cx - bw / 2, cy + 42, bw, 32, () => this.newGame());
    }
  }

  startConfetti() {
    this.confetti = [];
    this.confettiUntil = Date.now() + 1200;
    this.lastConfettiAt = 0;
  }
  emitConfetti() {
    confetti.spawn(this.confetti, { W, H, startY: this.scoreY + 40 });
  }
  drawConfetti(c) {
    confetti.draw(c, this.confetti);
  }

  drawHelp(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(0, 0, W, H);
    const x = 20, w = W - 40;
    const lines = [];
    ['helpMsg', 'help1', 'help2', 'help3', 'help4'].forEach((k) => {
      const value = t('sudoku.' + k);
      if (value !== 'sudoku.' + k) {
        lines.push(...D.wrapText(c, value, w - 40, 13));
        lines.push('');
      }
    });
    const lineH = 18;
    const h = Math.min(H - 60, 66 + lines.length * lineH + 54);
    const y = (H - h) / 2;
    D.card(c, x, y, w, h, T);
    D.text(c, '?', x + 22, y + 28, { size: 22, weight: 'bold', color: T.primary });
    D.text(c, t('help'), x + 46, y + 28, { size: 15, weight: 'bold', color: T.text });
    c.save();
    D.roundRect(c, x + 1, y + 1, w - 2, h - 2, 14); c.clip();
    let ly = y + 52;
    lines.forEach((line) => { if (line) D.text(c, line, x + 18, ly, { size: 12, color: T.text }); ly += lineH; });
    c.restore();
    this.addButton('help-mask', 0, 0, W, H, () => this.closeHelp());
    const bw = 100, bx = x + (w - bw) / 2, by = y + h - 38;
    D.fillRoundRect(c, bx, by, bw, 28, 8, T.primary);
    D.text(c, t('sudoku.confirmText'), bx + bw / 2, by + 14, { size: 12, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('help-ok', bx, by, bw, 28, () => this.closeHelp());
  }

  drawConfirm(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(0, 0, W, H);
    const w = W - 56, h = 200, x = (W - w) / 2, y = (H - h) / 2;
    D.card(c, x, y, w, h, T);
    D.text(c, t('sudoku.confirmTitle'), x + 20, y + 34, { size: 17, weight: 'bold', color: T.text });
    const lines = D.wrapText(c, t('sudoku.confirmMsg').replace('{d}', t('sudoku.' + DIFF_NAMES[this.difficulty - 1])), w - 40, 14);
    lines.forEach((line, i) => D.text(c, line, x + 20, y + 66 + i * 21, { size: 14, color: T.muted }));
    const gap = 12, bw = (w - 40 - gap) / 2, by = y + h - 48;
    this.addButton('confirm-mask', 0, 0, W, H, () => this.cancelConfirm());
    D.fillRoundRect(c, x + 20, by, bw, 32, 8, T.enter);
    D.text(c, t('sudoku.cancel'), x + 20 + bw / 2, by + 16, { size: 13, weight: 'bold', color: T.text, align: 'center' });
    this.addButton('confirm-cancel', x + 20, by, bw, 32, () => this.cancelConfirm());
    D.fillRoundRect(c, x + 20 + bw + gap, by, bw, 32, 8, T.primary);
    D.text(c, t('sudoku.confirmOk'), x + 20 + bw + gap + bw / 2, by + 16, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('confirm-ok', x + 20 + bw + gap, by, bw, 32, () => this.startNewGame());
  }

  openHelp() { this.helpOpen = true; this.pauseTimer(); }
  closeHelp() { this.helpOpen = false; this.resumeTimer(); }

  onCell(i) {
    if (this.phase !== PLAY || this.winAt) return;
    const cell = this.cells[i];
    if (!cell) return;
    this.selected = this.selected === i ? -1 : i;
  }

  onPad(d) {
    if (this.phase !== PLAY || this.winAt) return;
    const s = this.selected;
    if (s < 0) return;
    const cell = this.cells[s];
    if (!cell || cell.fixed) return;
    if (cell.v === d) { cell.v = 0; cell.notes = 0; this.saveState(); return; }
    if (this.digitLeft(d) <= 0) return;
    if (this.notesMode && !cell.v) { cell.notes ^= 1 << d; this.saveState(); return; }
    cell.v = d;
    cell.notes = 0;
    if (this.isWrong(s)) {
      this.cellFx.set(s, { type: 'wrong', at: Date.now() });
      this.hearts = Math.max(0, this.hearts - 1);
      this.app.audio.playFail();
      if (this.hearts <= 0) { this.lose(); return; }
      this.saveState();
      return;
    }
    this.cellFx.set(s, { type: 'correct', at: Date.now() });
    this.app.audio.playElimination();
    this.pruneNotes(s, d);
    if (this.isFinished()) { this.win(); return; }
    this.saveState();
  }

  onErase() {
    if (this.phase !== PLAY || this.winAt) return;
    const s = this.selected;
    if (s < 0) return;
    const cell = this.cells[s];
    if (!cell || cell.fixed || (!cell.v && !cell.notes)) return;
    cell.v = 0; cell.notes = 0;
    this.saveState();
  }

  toggleNotesMode() {
    if (this.phase !== PLAY || this.winAt) return;
    this.notesMode = !this.notesMode;
  }

  fillAllCandidates() {
    if (this.phase !== PLAY || this.winAt) return;
    let touched = false;
    for (let i = 0; i < CELLS; i++) {
      const cell = this.cells[i];
      if (!cell || cell.fixed || cell.v) continue;
      const mask = this.candidatesFor(i);
      if (cell.notes !== mask) { cell.notes = mask; touched = true; }
    }
    if (touched) this.saveState();
  }

  win() {
    if (this.phase !== PLAY) return;
    const elapsed = this.seconds();
    this.baseTime = elapsed; this.startAt = 0; this.time = elapsed;
    this.newBest = !this.best || elapsed < this.best;
    if (this.newBest) { this.best = elapsed; setRaw(this.bestKey(), String(elapsed)); }
    removeRaw(STATE_KEY);
    this.selected = -1;
    this.winAt = Date.now() + WIN_DELAY;
    this.startConfetti();
    this.app.audio.playSuccess();
  }

  lose() {
    if (this.phase !== PLAY) return;
    this.baseTime = this.seconds(); this.startAt = 0; this.time = this.baseTime;
    this.phase = OVER;
    this.selected = -1;
    this.app.audio.playLose();
  }
}

module.exports = SudokuScene;
