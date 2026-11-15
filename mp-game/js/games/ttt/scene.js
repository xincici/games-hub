// 井字棋（Tic-Tac-Toe）· 小游戏 canvas 场景
// 规则：3×3；每方最多留 3 子，下第 4 子时己方最旧子消失；棋子按落子顺序渐暗。
// 人机模式一局接一局记录连胜；双人模式一方三连即结束本局。
const { W, H, SAFE_BOTTOM } = require('../../core/canvas');
const share = require('../../core/share');
const HEADER = require('../../core/header');
const { Scene } = require('../../core/app');
const theme = require('../../core/theme');
const { t } = require('../../core/i18n');
const { getRaw, setRaw } = require('../../core/storage');
const D = require('../../core/draw');
const actionLabel = require('../../core/action-label');
const resultButton = require('../../core/result-button');
const ParticleField = require('../../core/particles');
const icons = require('../../core/icons');
const fabKit = require('../../core/fab');
const confetti = require('../../core/confetti');
const achv = require('../../core/achv');
const logic = require('./board');
const i18nDict = require('./i18n');

const coreI18n = require('../../core/i18n');
if (!coreI18n.__tttRegistered) {
  coreI18n.register('ttt', i18nDict);
  coreI18n.__tttRegistered = true;
}

const PLAY = 'play';
const WON = 'won';
const LOST = 'lost';
const MODE_BOT = 'bot';
const MODE_PVP = 'pvp';
const BEST_KEY = '__ttt__best';
const STREAK_KEY = '__ttt__streak';
const MODE_KEY = '__ttt__mode';
const STATE_KEY = '__ttt__state';   // 旧版单存档，保留迁移
function stateKey(mode) { return `__ttt__state_${mode}`; }
const BOT_DELAY = 420;
const LINE_MS = 650;

class TttScene extends Scene {
  constructor(app) {
    super(app);
    this.bg = new ParticleField();
    this.mode = getRaw(MODE_KEY, MODE_BOT) === MODE_PVP ? MODE_PVP : MODE_BOT;
    this.board = logic.emptyBoard();
    this.history = logic.emptyHistory();
    this.current = 'X';
    this.phase = PLAY;
    this.best = +(getRaw(BEST_KEY, 0) || 0);
    this.streak = +(getRaw(STREAK_KEY, 0) || 0);
    this.clicks = 0;
    this.winner = null;
    this.winLine = null;
    this.winLineStartAt = 0;
    this.resultShownAt = 0;
    this.confetti = [];
    this.confettiUntil = 0;
    this.lastConfettiAt = 0;
    this.botAt = 0;
    this.resultSerial = 0;
    this.pvpLast = null;
    this.pvpWins = { X: 0, O: 0 };
    this.confirming = false;
    this.helpOpen = false;
    this.helpRect = null;
    this.modeRect = null;
    this.scripted = true;
    this.layout();
    if (!this.restoreState(this.mode)) this.startRound(true);
  }

  layout() {
    this.cw = Math.min(W - 32, 440);
    this.cx = (W - this.cw) / 2;
    this.top = HEADER.TOP;
    this.headerH = HEADER.HEIGHT;
    this.homeRect = { ...HEADER.HOME_RECT };
    this.scoreY = this.top + this.headerH + 12;
    this.scoreH = 72;
    this.optY = this.scoreY + this.scoreH + 14;
    this.optH = 62;
    const boardTop = this.optY + this.optH + 14;
    const reserve = SAFE_BOTTOM + 92;
    const availH = Math.max(170, H - boardTop - reserve);
    this.boardSize = Math.min(this.cw, availH);
    this.boardX = (W - this.boardSize) / 2;
    this.boardY = boardTop;
    this.pad = 10;
    this.gap = 8;
    this.cell = (this.boardSize - this.pad * 2 - this.gap * 2) / 3;
    this.helpRect = { x: W - 16 - fabKit.SIZE, y: H - SAFE_BOTTOM - 16 - fabKit.SIZE, w: fabKit.SIZE, h: fabKit.SIZE };
    this.modeRect = fabKit.slotLeft(this.helpRect, 2);
  }

  saveState() {
    try {
      setRaw(stateKey(this.mode), JSON.stringify({
        v: 1,
        mode: this.mode,
        board: this.board,
        history: this.history,
        current: this.current,
        phase: this.phase,
        winner: this.winner,
        winLine: this.winLine,
        clicks: this.clicks,
        streak: this.streak,
        pvpLast: this.pvpLast,
        pvpWins: this.pvpWins,
        resultSerial: this.resultSerial,
      }));
    } catch (e) { /* 存档失败不影响对局 */ }
  }

  // 退出 / 切后台后恢复：棋盘、落子顺序、轮到谁、点击数和连胜都要在。
  restoreState(mode) {
    let s;
    try {
      let raw = getRaw(stateKey(mode), '');
      if (!raw) raw = getRaw(STATE_KEY, '');
      if (!raw) return false;
      s = JSON.parse(raw);
    } catch (e) { return false; }
    if (!s || !Array.isArray(s.board) || s.board.length !== 9) return false;
    // 旧版单存档可能属于另一个模式；不能把 bot 的棋局恢复进双人。
    if (s.mode && s.mode !== mode) return false;
    const board = s.board.map((v) => (v === 'X' || v === 'O' ? v : null));
    const history = { X: [], O: [] };
    for (const player of ['X', 'O']) {
      const arr = s.history && Array.isArray(s.history[player]) ? s.history[player] : [];
      const seen = new Set();
      for (const idx of arr) {
        if (!Number.isInteger(idx) || idx < 0 || idx > 8 || seen.has(idx) || board[idx] !== player) return false;
        if (history[player].length >= 3) return false;
        seen.add(idx);
        history[player].push(idx);
      }
    }
    let occupied = 0;
    board.forEach((v) => { if (v) occupied += 1; });
    if (history.X.length + history.O.length !== occupied) return false;
    this.mode = mode;
    this.board = board;
    this.history = history;
    this.current = s.current === 'O' ? 'O' : 'X';
    this.clicks = Math.max(0, Number(s.clicks) || 0);
    this.streak = Math.max(0, Number(s.streak) || 0);
    this.pvpLast = s.pvpLast === 'X' || s.pvpLast === 'O' ? s.pvpLast : null;
    this.pvpWins = {
      X: Math.max(0, Number(s.pvpWins && s.pvpWins.X) || 0),
      O: Math.max(0, Number(s.pvpWins && s.pvpWins.O) || 0),
    };
    this.resultSerial = Math.max(0, Number(s.resultSerial) || 0);
    this.winner = s.winner === 'X' || s.winner === 'O' ? s.winner : null;
    this.winLine = Array.isArray(s.winLine) && s.winLine.length === 3 ? s.winLine.slice() : null;
    const phase = s.phase === WON || s.phase === LOST ? s.phase : PLAY;
    if (s.phase === 'round') {
      // 兼容上一版两局之间的过场存档。
      this.startRound(true);
      return true;
    }
    if ((phase === WON || phase === LOST) && this.winner) {
      this.phase = phase;
      // 恢复结算态：连线直接是完成态，遮罩也立即出现，不再重播动画。
      this.winLineStartAt = Date.now() - LINE_MS - 500;
      this.resultShownAt = 0;
      this._resultGateKey = 'ttt:' + this.resultSerial;
      this._resultGateAt = 0;
      this._resultVisibleAt = 0;
      if (this.resultSerial < 1) this.resultSerial = 1;
      return true;
    }
    this.phase = PLAY;
    if (this.mode === MODE_BOT && this.current === 'O') this.scheduleBot();
    return true;
  }

  startRound(randomFirst) {
    this.board = logic.emptyBoard();
    this.history = logic.emptyHistory();
    this.winner = null;
    this.winLine = null;
    this.winLineStartAt = 0;
    this.resultShownAt = 0;
    this.clicks = 0;
    this.phase = PLAY;
    this.current = randomFirst && Math.random() < 0.5 ? 'O' : 'X';
    this.botAt = 0;
    if (this.mode === MODE_BOT && this.current === 'O') this.scheduleBot();
    this.saveState();
  }

  startNewGame() {
    this.confirming = false;
    this.streak = 0;
    setRaw(STREAK_KEY, '0');
    this.clicks = 0;
    this.pvpLast = null;
    this.startRound(true);
  }

  openConfirm() {
    if (this.helpOpen) return;
    this.confirming = true;
  }

  toggleMode() {
    if (this.confirming || this.helpOpen) return;
    // 先把当前模式的棋局落档，再切到另一个模式；两边各自恢复自己的状态。
    this.saveState();
    this.mode = this.mode === MODE_BOT ? MODE_PVP : MODE_BOT;
    setRaw(MODE_KEY, this.mode);
    this.streak = 0;
    this.clicks = 0;
    this.pvpLast = null;
    this.pvpWins = { X: 0, O: 0 };
    this.winner = null;
    this.winLine = null;
    this.resultSerial = 0;
    if (!this.restoreState(this.mode)) {
      setRaw(STREAK_KEY, '0');
      this.startRound(true);
    }
    setRaw(STREAK_KEY, String(this.streak));
  }

  startConfetti() {
    this.confetti = [];
    this.confettiUntil = Date.now() + 1200;
    this.lastConfettiAt = 0;
  }

  scheduleBot() {
    this.botAt = Date.now() + BOT_DELAY;
  }

  onCell(idx) {
    if (this.phase !== PLAY || this.confirming || this.helpOpen) return;
    if (this.mode === MODE_BOT && this.current === 'O') return;
    this.move(idx, false);
  }

  move(idx, byBot) {
    if (this.phase !== PLAY || this.board[idx]) return;
    const player = this.current;
    if (!logic.place(this.board, this.history, player, idx)) return;
    if (!byBot) this.clicks += 1;
    const line = logic.winner(this.board, player);
    if (line) {
      this.finish(player, line);
      return;
    }
    this.current = player === 'X' ? 'O' : 'X';
    if (this.mode === MODE_BOT && this.current === 'O') this.scheduleBot();
    this.saveState();
  }

  botMove() {
    if (this.phase !== PLAY || this.mode !== MODE_BOT || this.current !== 'O') return;
    const idx = logic.bestMove({ board: this.board, history: this.history }, 'O', 'X');
    if (idx >= 0) this.move(idx, true);
  }

  finish(player, line) {
    this.winner = player;
    this.winLine = line;
    this.winLineStartAt = Date.now();
    this.resultSerial += 1;
    // 先让连线在棋盘上播完，再让结算面板盖住它。
    this.resultShownAt = this.winLineStartAt + LINE_MS;
    this._resultGateKey = 'ttt:' + this.resultSerial;
    this._resultGateAt = this.resultShownAt;
    this._resultVisibleAt = 0;
    if (this.mode === MODE_PVP) {
      this.streak = this.pvpLast === player ? this.streak + 1 : 1;
      this.pvpLast = player;
      this.pvpWins[player] = (this.pvpWins[player] || 0) + 1;
      this.phase = WON;
      this.winAt = Date.now();
      this.app.audio.playSuccess();
      this.startConfetti();
      achv.win('ttt');
      achv.peak('ttt', 'streak', this.streak);
    } else if (player === 'X') {
      this.streak += 1;
      achv.win('ttt');
      achv.peak('ttt', 'streak', this.streak);
      this.app.audio.playSuccess();
      this.startConfetti();
      this.phase = WON;
    } else {
      this.streak = 0;
      this.app.audio.playLose();
      this.phase = LOST;
    }
    setRaw(STREAK_KEY, String(this.streak));
    if (this.streak > this.best) {
      this.best = this.streak;
      setRaw(BEST_KEY, String(this.best));
    }
    this.saveState();
  }

  onHide() {
    this.saveState();
  }

  update(dt) {
    if (this.bg) this.bg.update(dt || 16);
    // 帮助 / 二次确认打开时暂停机器人，避免弹窗底下偷偷落子。
    if (this.helpOpen || this.confirming) return;
    const now = Date.now();
    if (this.confettiUntil && now < this.confettiUntil && now - this.lastConfettiAt >= 40) {
      this.lastConfettiAt = now;
      confetti.spawn(this.confetti, { W, H, startY: H * 0.58 });
    }
    if (this.confetti.length) this.confetti = confetti.update(this.confetti, dt || 16, H);
    if (this.phase === PLAY && this.mode === MODE_BOT && this.current === 'O' && this.botAt && Date.now() >= this.botAt) {
      this.botAt = 0;
      this.botMove();
    }
  }

  // ---------- render ----------
  render(c) {
    this.buttons = [];
    const T = theme.tokens;
    c.fillStyle = T.bg;
    c.fillRect(0, 0, W, H);
    this.bg.draw(c, theme.dark);
    this.drawHeader(c, T);
    this.drawScore(c, T);
    this.drawOptions(c, T);
    this.drawBoard(c, T);
    if (this.phase === WON || this.phase === LOST) this.drawWinLine(c);
    if (!this.helpOpen && !this.confirming) this.drawFabs(c, T);
    if (this.phase === WON || this.phase === LOST) this.drawResult(c, T);
    confetti.draw(c, this.confetti);
    if (this.helpOpen) this.drawHelp(c, T);
    if (this.confirming) this.drawConfirm(c, T);
  }

  drawHeader(c, T) {
    D.text(c, t('ttt.gameTitle'), W / 2, this.top + this.headerH / 2, {
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

  drawScore(c, T) {
    D.card(c, this.cx, this.scoreY, this.cw, this.scoreH, T);
    const q = this.cw / 3;
    const pvp = this.mode === MODE_PVP;
    const stats = pvp
      ? [
        [t('ttt.xWins'), this.pvpWins.X],
        [t('ttt.oWins'), this.pvpWins.O],
        [t('ttt.clicks'), this.clicks],
      ]
      : [
        [t('ttt.bestStreak'), this.best],
        [t('ttt.curStreak'), this.streak],
        [t('ttt.clicks'), this.clicks],
      ];
    stats.forEach(([label, value], i) => {
      if (i) D.divider(c, this.cx + q * i, this.scoreY + this.scoreH / 2, 24, T.border, 1);
      D.text(c, label, this.cx + q * (i + 0.5), this.scoreY + 23, {
        size: 10.5, color: T.muted, align: 'center',
      });
      let color = T.text;
      if (pvp) color = i === 0 ? T.primary : i === 1 ? T.god : T.text;
      else if (i === 1 && value > 0) color = T.primary;
      D.text(c, String(value), this.cx + q * (i + 0.5), this.scoreY + 48, {
        size: 22, weight: 'bold', color, align: 'center',
      });
    });
  }

  drawOptions(c, T) {
    D.card(c, this.cx, this.optY, this.cw, this.optH, T);
    const half = this.cw / 2;
    D.divider(c, this.cx + half, this.optY + this.optH / 2, 24, T.border, 1);
    const side = this.current === 'X' ? 'X' : 'O';
    let text;
    if (this.mode === MODE_BOT) text = (side === 'X' ? t('ttt.yourTurn') : t('ttt.botTurn')) + ` · ${side}`;
    else text = side === 'X' ? t('ttt.turnX') : t('ttt.turnO');
    D.text(c, text, this.cx + half / 2, this.optY + this.optH / 2 - 8, {
      size: 13, weight: 'bold', color: T.text, align: 'center',
    });
    D.text(c, this.mode === MODE_BOT ? t('ttt.modeBot') : t('ttt.modePvp'),
      this.cx + half / 2, this.optY + this.optH / 2 + 11, {
        size: 10, color: T.muted, align: 'center',
      });
    const label = t('ttt.newGame');
    const bw = Math.min(112, actionLabel.width(c, label, { size: 13 }));
    const bx = this.cx + half + (half - bw) / 2;
    const by = this.optY + (this.optH - 32) / 2;
    D.fillRoundRect(c, bx, by, bw, 32, 8, T.primary);
    actionLabel.draw(c, 'gamepad', label, bx + bw / 2, by + 16, { size: 13, color: '#fff' });
    this.addButton('ttt-new', bx, by, bw, 32, () => this.openConfirm());
  }

  cellRect(i) {
    const r = Math.floor(i / 3);
    const col = i % 3;
    return {
      x: this.boardX + this.pad + col * (this.cell + this.gap),
      y: this.boardY + this.pad + r * (this.cell + this.gap),
      w: this.cell,
      h: this.cell,
    };
  }

  drawBoard(c, T) {
    D.fillRoundRect(c, this.boardX, this.boardY, this.boardSize, this.boardSize, 16, T.boardBg);
    D.strokeRoundRect(c, this.boardX, this.boardY, this.boardSize, this.boardSize, 16, T.border, 1);
    for (let i = 0; i < 9; i += 1) {
      const r = this.cellRect(i);
      D.fillRoundRect(c, r.x, r.y, r.w, r.h, 9, theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.55)');
      D.strokeRoundRect(c, r.x, r.y, r.w, r.h, 9, T.tileBorder, 1);
      if (this.board[i]) this.drawPiece(c, i, r);
      if (this.phase === PLAY && !this.board[i] && !(this.mode === MODE_BOT && this.current === 'O') && !this.confirming && !this.helpOpen) {
        this.addButton('ttt-cell-' + i, r.x, r.y, r.w, r.h, () => this.onCell(i));
      }
    }
    // 胜利连线在 render 里、结算面板之前画，面板出现后会把它盖住。
  }

  drawPiece(c, idx, r) {
    const player = this.board[idx];
    const hist = this.history[player] || [];
    const pos = hist.indexOf(idx);
    const n = hist.length;
    let alpha = 1;
    // 亮度档位拉开：最旧的最暗，最新的一定是满亮度。
    if (n >= 3) alpha = pos === 0 ? 0.16 : pos === 1 ? 0.42 : 1;
    else if (n === 2) alpha = pos === 0 ? 0.3 : 1;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const size = r.w * 0.32;
    c.save();
    c.globalAlpha = alpha;
    c.strokeStyle = player === 'X' ? theme.tokens.primary : theme.tokens.god;
    c.lineWidth = Math.max(3, r.w * 0.09);
    c.lineCap = 'round';
    if (player === 'X') {
      c.beginPath();
      c.moveTo(cx - size, cy - size); c.lineTo(cx + size, cy + size);
      c.moveTo(cx + size, cy - size); c.lineTo(cx - size, cy + size);
      c.stroke();
    } else {
      c.beginPath();
      c.arc(cx, cy, size * 0.9, 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();
  }

  drawFabs(c, T) {
    fabKit.draw(this, c, this.helpRect, {
      id: 'fab-help', kind: 'help', icon: 'help', fallback: '?', color: T.text,
      onTap: () => { this.helpOpen = true; },
    });
    fabKit.drawMute(this, c, fabKit.leftSlot(this.helpRect));
    const bot = this.mode === MODE_BOT;
    fabKit.draw(this, c, this.modeRect, {
      id: 'ttt-mode', kind: 'mode', icon: bot ? 'robot' : 'mode-emoji',
      fallback: bot ? 'R' : '2', color: T.primary,
      onTap: () => this.toggleMode(),
    });
  }

  drawConfirm(c, T) {
    c.fillStyle = 'rgba(0,0,0,0.48)';
    c.fillRect(0, 0, W, H);
    const w = W - 56;
    const h = 196;
    const x = (W - w) / 2;
    const y = (H - h) / 2;
    D.card(c, x, y, w, h, T);
    D.text(c, t('ttt.confirmTitle'), x + 20, y + 34, { size: 17, weight: 'bold', color: T.text });
    D.wrapText(c, t('ttt.confirmMsg'), w - 40, 13).slice(0, 3).forEach((line, i) => {
      D.text(c, line, x + 20, y + 62 + i * 18, { size: 13, color: T.muted });
    });
    this.addButton('ttt-confirm-mask', 0, 0, W, H, () => { this.confirming = false; });
    const gap = 12;
    const bw = (w - 40 - gap) / 2;
    const by = y + h - 48;
    D.fillRoundRect(c, x + 20, by, bw, 32, 8, T.enter);
    D.text(c, t('ttt.cancel'), x + 20 + bw / 2, by + 16, { size: 13, weight: 'bold', color: T.enterColor, align: 'center' });
    this.addButton('ttt-confirm-cancel', x + 20, by, bw, 32, () => { this.confirming = false; });
    D.fillRoundRect(c, x + 20 + bw + gap, by, bw, 32, 8, T.primary);
    D.text(c, t('ttt.confirmOk'), x + 20 + bw + gap + bw / 2, by + 16, { size: 13, weight: 'bold', color: '#fff', align: 'center' });
    this.addButton('ttt-confirm-ok', x + 20 + bw + gap, by, bw, 32, () => this.startNewGame());
  }

  // 胜利连线：只播一次生长动画，随后停成一条静态线。
  drawWinLine(c) {
    if (!this.winLine || !this.winLineStartAt) return;
    const a = this.cellRect(this.winLine[0]);
    const b = this.cellRect(this.winLine[2]);
    const x0 = a.x + a.w / 2;
    const y0 = a.y + a.h / 2;
    const x1 = b.x + b.w / 2;
    const y1 = b.y + b.h / 2;
    const now = Date.now();
    const age = Math.max(0, now - this.winLineStartAt);
    const growP = Math.min(1, age / 360);
    const grow = 1 - Math.pow(1 - growP, 3);
    const ex = x0 + (x1 - x0) * grow;
    const ey = y0 + (y1 - y0) * grow;
    // 只在开头短暂收光，约 650ms 后完全静止。
    const flash = Math.max(0, 1 - age / 650);
    const T = theme.tokens;
    const color = this.phase === LOST ? T.lose : T.win;
    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = color;
    // 柔光底：比之前更窄、更淡，并且不再随时间循环呼吸。
    c.globalAlpha = 0.14 + 0.10 * flash;
    c.shadowColor = color;
    c.shadowBlur = 8 + 5 * flash;
    c.lineWidth = Math.max(7, this.cell * 0.15);
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(ex, ey);
    c.stroke();
    // 亮芯。
    c.globalAlpha = 0.88;
    c.shadowBlur = 4 + 3 * flash;
    c.lineWidth = Math.max(2.5, this.cell * 0.055);
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(ex, ey);
    c.stroke();
    // 生长过程中的一个前导光点，线画完就消失。
    if (growP < 1) {
      c.globalAlpha = 0.85 * (1 - growP);
      c.fillStyle = '#ffffff';
      c.shadowBlur = 8;
      c.beginPath();
      c.arc(ex, ey, Math.max(2, this.cell * 0.038), 0, Math.PI * 2);
      c.fill();
    }
    // 两端只扩散一次，不循环。
    if (age < 520) {
      const ring = Math.min(1, age / 520);
      c.globalAlpha = (1 - ring) * 0.30;
      c.strokeStyle = color;
      c.shadowBlur = 0;
      c.lineWidth = 1.5;
      [[x0, y0], [x1, y1]].forEach(([x, y]) => {
        c.beginPath();
        c.arc(x, y, 4 + ring * this.cell * 0.12, 0, Math.PI * 2);
        c.stroke();
      });
    }
    c.restore();
  }

  drawResult(c, T) {
    if (this.phase !== WON && this.phase !== LOST) return;
    if (Date.now() < this.resultShownAt) return;
    if (!this.resultVisible(200, 'ttt:' + this.resultSerial)) return;
    share.resultPanel(c, this, this.boardY, this.boardSize);
    const cx = W / 2;
    const cy = this.boardY + this.boardSize / 2;
    let title;
    let color = T.win;
    if (this.mode === MODE_PVP) title = this.winner === 'X' ? t('ttt.xWin') : t('ttt.oWin');
    else if (this.phase === LOST) { title = t('ttt.youLost'); color = T.lose; }
    else title = t('ttt.youWin');
    D.text(c, `${this.phase === LOST ? '💥' : '🎉'} ${title}`, cx, cy - 20, {
      size: 20, weight: 'bold', color, align: 'center',
    });
    const label = this.mode === MODE_BOT ? t('ttt.nextRoundCta') : t('ttt.replay');
    const kind = this.mode === MODE_BOT ? 'next' : 'replay';
    const bw = resultButton.width(c, label);
    resultButton.draw(c, this, label, kind, cx - bw / 2, cy + 18, {
      id: 'ttt-replay', onTap: () => { this.startRound(true); },
    });
  }

  // App 的统一帮助弹窗需要这个方法存在；实际面板由 core/help.js 绘制。
  drawHelp() {}
}

module.exports = TttScene;
