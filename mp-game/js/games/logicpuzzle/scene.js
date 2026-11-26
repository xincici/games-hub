// 逻辑拼图：8×8 棋盘，用 8 个矩形拼块（可旋转）填满所有空格；固定块不可移动，共 88 关。
// 操作：托盘拼块直接拖到棋盘；长按 / 拖动棋盘上已放的拼块可直接换位；单击托盘旋转，单击棋盘收回。
const { W, H, SAFE_BOTTOM } = require('../../core/canvas');
const { Scene } = require('../../core/app');
const theme = require('../../core/theme');
const i18n = require('../../core/i18n');
const { t } = i18n;
const D = require('../../core/draw');
const icons = require('../../core/icons');
const fabKit = require('../../core/fab');
const actionLabel = require('../../core/action-label');
const { getRaw, setRaw, removeRaw } = require('../../core/storage');
const achv = require('../../core/achv');
const audio = require('../../core/audio');
const ParticleField = require('../../core/particles');
const share = require('../../core/share');
const resultButton = require('../../core/result-button');
const HEADER = require('../../core/header');
const logic = require('./board');
const logicI18n = require('./i18n');

if (!i18n.__logicPuzzleRegistered) {
  i18n.register('logicpuzzle', logicI18n);
  i18n.__logicPuzzleRegistered = true;
}

const LEVEL_KEY = '__logic_puzzle__level';
const BEST_KEY = '__logic_puzzle__best';
const MODE_KEY = '__logic_puzzle__mode';
const STREAK_KEY = '__logic_puzzle__streak';
const BEST_STREAK_KEY = '__logic_puzzle__best_streak';
const STATE_LEVEL_KEY = '__logic_puzzle__state_level';
const STATE_RANDOM_KEY = '__logic_puzzle__state_random';
const LEGACY_STATE_KEY = '__logic_puzzle__state';
const PLAY = 'play';
const WON = 'won';
const RESULT_DELAY_MS = 250;
const PAD = 6;
const CELL_GAP = 3;
const TAP_SLOP = 8;
const LONG_PRESS_MS = 260;   // 棋盘上按住这么久后，即使不动也可开始拖动
const REVEAL_STEP_MS = 500;
const REVEAL_MOVE_MS = 420;
const REVEAL_END_MS = 280;

class LogicPuzzleScene extends Scene {
  constructor(app) {
    super(app);
    this.bg = new ParticleField();
    this.now = Date.now();
    this.phase = PLAY;
    this.helpOpen = false;
    this.confirming = false;
    this.mode = getRaw(MODE_KEY, 'level') === 'random' ? 'random' : 'level';
    this.seqLevel = Math.max(1, Math.min(logic.LEVEL_COUNT, Math.floor(+(getRaw(LEVEL_KEY, 1) || 1)) || 1));
    this.level = this.seqLevel;
    this.best = Math.max(1, Math.floor(+(getRaw(BEST_KEY, 1) || 1)) || 1);
    this.streak = Math.max(0, Math.floor(+(getRaw(STREAK_KEY, 0) || 0)) || 0);
    this.bestStreak = Math.max(this.streak, Math.floor(+(getRaw(BEST_STREAK_KEY, 0) || 0)) || 0);
    this.resultAt = 0;
    this.shakeAt = 0;
    this.drag = null;
    this.touch = null;
    this.tapPiece = null;
    this.press = null;
    this.reveal = null;
    this.revealed = false;
    this.randomNewGameOpen = false;
    this.pickerOpen = false;
    this.pickerResetStreak = false;
    this.pickerOffset = [0, 1];
    this.pickerWheelRects = [];
    this.pickerWheelRows = 0;
    this.pickerDrag = null;
    this.pickerAnim = null;
    this.puzzle = logic.createLevel(this.level - 1);
    this.layout();
    if (!this.restore()) {
      if (this.mode === 'random') this.startRandomLevel();
      else this.startLevel(this.seqLevel);
    }
  }

  // ---------- 存档 ----------
  stateKeyFor(mode) {
    return mode === 'random' ? STATE_RANDOM_KEY : STATE_LEVEL_KEY;
  }

  save() {
    try {
      setRaw(LEVEL_KEY, String(this.seqLevel));
      setRaw(BEST_KEY, String(this.best));
      setRaw(MODE_KEY, this.mode);
      setRaw(STREAK_KEY, String(this.streak));
      setRaw(BEST_STREAK_KEY, String(this.bestStreak));
      if (!this.puzzle) return;
      setRaw(this.stateKeyFor(this.mode), JSON.stringify({
        v: 3,
        level: this.level,
        revealed: !!this.revealed,
        phase: this.phase,
        pieces: logic.exportPieces(this.puzzle),
      }));
    } catch (e) {
      // 存储失败不影响游戏
    }
  }

  // 旧版只有一份 __logic_puzzle__state（v1/v2），升级后按里面的 mode 迁到对应模式槽位。
  migrateLegacy() {
    try {
      const raw = getRaw(LEGACY_STATE_KEY, '');
      if (!raw) return;
      const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!s || !Array.isArray(s.pieces)) { removeRaw(LEGACY_STATE_KEY); return; }
      const mode = s.mode === 'random' ? 'random' : 'level';
      const key = this.stateKeyFor(mode);
      if (!getRaw(key, '')) {
        setRaw(key, JSON.stringify({
          v: 3,
          level: Math.max(1, Math.min(logic.LEVEL_COUNT, Math.floor(+s.level) || 1)),
          revealed: !!s.revealed,
          phase: s.phase,
          pieces: s.pieces,
        }));
      }
      if (s.best) this.best = Math.max(this.best, Math.floor(+s.best) || 1);
      if (s.streak) this.streak = Math.max(this.streak, Math.floor(+s.streak) || 0);
      if (s.bestStreak) this.bestStreak = Math.max(this.bestStreak, Math.floor(+s.bestStreak) || 0);
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      removeRaw(LEGACY_STATE_KEY);
    } catch (e) {
      // 旧档坏了就丢掉，不影响新档
    }
  }

  restore() {
    this.migrateLegacy();
    const ok = this.restoreMode(this.mode);
    if (ok) this.save();
    return ok;
  }

  // 只恢复某一个模式自己的局面，不碰另一个模式的存档。
  restoreMode(mode) {
    try {
      const raw = getRaw(this.stateKeyFor(mode), '');
      if (!raw) return false;
      const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!s || (s.v !== 1 && s.v !== 2 && s.v !== 3)) return false;
      this.mode = mode;
      const lv = Math.max(1, Math.min(logic.LEVEL_COUNT,
        Math.floor(+s.level) || (this.mode === 'random' ? this.level : this.seqLevel) || 1));
      this.level = lv;
      if (s.best) this.best = Math.max(this.best, Math.floor(+s.best) || 1);
      if (s.streak) this.streak = Math.max(this.streak, Math.floor(+s.streak) || 0);
      if (s.bestStreak) this.bestStreak = Math.max(this.bestStreak, Math.floor(+s.bestStreak) || 0);
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      this.revealed = !!s.revealed;
      this.puzzle = logic.createLevel(lv - 1);
      logic.restorePieces(this.puzzle, s.pieces);
      this.drag = null;
      this.touch = null;
      this.tapPiece = null;
      this.press = null;
      this.confirming = false;
      this.helpOpen = false;
        this.shakeAt = 0;
      this.reveal = null;
      this.randomNewGameOpen = false;
      this.pickerOpen = false;
      this.pickerDrag = null;
      this.resultAt = 0;
      // 以盘面为准：只有真的铺满才算胜利态（损坏的 state 不能白送胜利）
      if (logic.isSolved(this.puzzle)) {
        this.phase = WON;
        if (this.mode === 'level') {
          this.best = Math.max(this.best, Math.min(logic.LEVEL_COUNT + 1, lv + 1));
        }
      } else {
        this.phase = PLAY;
        this.revealed = false;
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  // 真正切一局（不碰模式 / 连胜 / seqLevel）
  startPuzzle(lv) {
    const level = Math.max(1, Math.min(logic.LEVEL_COUNT, Math.floor(lv) || 1));
    this.level = level;
    this.puzzle = logic.createLevel(level - 1);
    this.phase = PLAY;
    this.resultAt = 0;
    this.helpOpen = false;
    this.confirming = false;
    this.shakeAt = 0;
    this.drag = null;
    this.touch = null;
    this.tapPiece = null;
    this.press = null;
    this.reveal = null;
    this.revealed = false;
    this.randomNewGameOpen = false;
    this.pickerOpen = false;
    this.pickerResetStreak = false;
    this.pickerOffset = [0, 1];
    this.pickerWheelRects = [];
    this.pickerWheelRows = 0;
    this.pickerDrag = null;
    this.pickerAnim = null;
    this.save();
    achv.beginRound('logicpuzzle');
  }

  // 闯关模式：当前关 = seqLevel，并把它写回闯关进度
  startLevel(lv) {
    const level = Math.max(1, Math.min(logic.LEVEL_COUNT, Math.floor(lv) || 1));
    this.mode = 'level';
    this.seqLevel = level;
    this.startPuzzle(level);
  }

  // 随机一局：从 88 关里抽，不改变闯关进度
  startRandomLevel() {
    let level = 1 + Math.floor(Math.random() * logic.LEVEL_COUNT);
    if (logic.LEVEL_COUNT > 1 && level === this.level) level = (level % logic.LEVEL_COUNT) + 1;
    this.mode = 'random';
    this.startPuzzle(level);
  }

  startNewGame() {
    this.confirming = false;
    this.randomNewGameOpen = false;
    this.pickerOpen = false;
    if (this.mode === 'random') this.streak = 0;
    removeRaw(this.stateKeyFor(this.mode));
    if (this.mode === 'random') this.startRandomLevel();
    else this.startLevel(1);
  }

  replayLevel() {
    this.confirming = false;
    if (this.mode === 'random') this.startPuzzle(this.level);
    else this.startLevel(this.level);
  }

  nextLevel() {
    if (this.mode !== 'level' || this.level >= logic.LEVEL_COUNT) return;
    this.startLevel(this.level + 1);
  }

  // 随机模式胜利后的「再来一局」：继续当前连胜
  again() {
    if (this.mode !== 'random') return;
    this.startRandomLevel();
  }

  toggleMode() {
    if (this.reveal || this.confirming || this.helpOpen || this.randomNewGameOpen || this.pickerOpen) return;
    this.save();                       // 先把手头这局的盘面存下来
    const target = this.mode === 'random' ? 'level' : 'random';
    this.mode = target;
    setRaw(MODE_KEY, target);
    if (!this.restoreMode(target)) {
      // 该模式还没有记录，才新开一局
      if (target === 'random') this.startRandomLevel();
      else this.startLevel(this.seqLevel);
    } else {
      this.save();
    }
  }

  // ---------- 布局 ----------
  layout() {
    this.cw = Math.min(W - 32, 440);
    this.cx = (W - this.cw) / 2;
    this.top = HEADER.TOP;
    this.headerH = HEADER.HEIGHT;
    this.homeRect = { ...HEADER.HOME_RECT };

    // 分数卡 + 新游戏/查看答案 + 两行候选区；320×568 用更紧凑的一档。
    // 棋盘主动缩一点，给两行候选块腾空间，也给 FAB 留更大的下边距。
    const compact = H < 650;
    const scoreH = compact ? 56 : 64;
    const optH = compact ? 48 : 56;
    const topGap = compact ? 8 : 10;
    const trayH = compact ? 100 : 110;
    const trayGap = compact ? 10 : 12;
    this.gapTop = topGap;
    this.scoreY = this.top + this.headerH + 12;
    this.scoreH = scoreH;
    this.optY = this.scoreY + this.scoreH + topGap;
    this.optH = optH;
    const boardTop = this.optY + this.optH + topGap;

    this.fabSize = fabKit.SIZE;
    this.helpFab = { x: W - 16 - fabKit.SIZE, y: H - SAFE_BOTTOM - 16 - fabKit.SIZE, w: fabKit.SIZE, h: fabKit.SIZE };

    this.cellGap = CELL_GAP;
    this.pad = PAD;
    const maxBottom = this.helpFab.y - 26 - trayH - trayGap;
    const byW = (this.cw - PAD * 2 - CELL_GAP * (logic.SIZE - 1)) / logic.SIZE;
    const byH = (maxBottom - boardTop - PAD * 2 - CELL_GAP * (logic.SIZE - 1)) / logic.SIZE;
    this.cell = Math.max(14, Math.min(36, Math.floor(Math.min(byW, byH))));
    this.boardW = PAD * 2 + this.cell * logic.SIZE + CELL_GAP * (logic.SIZE - 1);
    this.boardH = this.boardW;
    this.boardX = (W - this.boardW) / 2;
    this.boardY = boardTop;

    this.trayH = trayH;
    this.trayW = this.cw;
    this.trayX = this.cx;
    this.trayY = this.boardY + this.boardH + trayGap;
    this.trayPad = 4;
    this.trayColGap = 4;
    this.trayRowGap = 4;
    this.traySlotW = (this.trayW - this.trayPad * 2 - this.trayColGap * 3) / 4;
    this.trayRowH = (this.trayH - this.trayPad * 2 - this.trayRowGap) / 2;
    // 所有候选块共用同一个缩放：保留 a~h 的实际长宽比例，不再各自塞满槽位。
    this.trayUnit = Math.max(2, (Math.min(this.traySlotW, this.trayRowH) - 8) / 5);
    this.drag = null;
    this.touch = null;
    this.tapPiece = null;
    this.press = null;
  }

  cellRect(r, c) {
    return {
      x: this.boardX + this.pad + c * (this.cell + CELL_GAP),
      y: this.boardY + this.pad + r * (this.cell + CELL_GAP),
      w: this.cell,
      h: this.cell,
    };
  }

  // 一整块拼块（不是逐个小格）：跨过中间格间距，看起来是一个整体。
  spanRect(r, c, w, h) {
    return {
      x: this.boardX + this.pad + c * (this.cell + CELL_GAP),
      y: this.boardY + this.pad + r * (this.cell + CELL_GAP),
      w: w * this.cell + (w - 1) * CELL_GAP,
      h: h * this.cell + (h - 1) * CELL_GAP,
    };
  }

  traySlotRect(i) {
    const row = Math.floor(i / 4);
    const col = i % 4;
    return {
      x: this.trayX + this.trayPad + col * (this.traySlotW + this.trayColGap),
      y: this.trayY + this.trayPad + row * (this.trayRowH + this.trayRowGap),
      w: this.traySlotW,
      h: this.trayRowH,
    };
  }

  // 把一块画成一个整体圆角块（棋盘 / 托盘 / 拖动影子共用）
  drawBlock(c, x, y, w, h, color, label, opts) {
    const o = opts || {};
    const radius = Math.max(4, Math.min(10, Math.min(w, h) * 0.22));
    c.save();
    if (o.alpha != null) c.globalAlpha = o.alpha;
    D.fillRoundRect(c, x, y, w, h, radius, color);
    D.strokeRoundRect(c, x + 0.5, y + 0.5, w - 1, h - 1, radius, o.border || 'rgba(255,255,255,0.75)', o.lineWidth || 1.4);
    if (label && w >= 6 && h >= 6) {
      D.text(c, label, x + w / 2, y + h / 2, {
        size: o.labelSize || Math.max(7, Math.min(22, Math.min(w, h) * 0.58)),
        weight: 'bold',
        color: o.labelColor || '#ffffff',
        align: 'center',
      });
    }
    c.restore();
  }

  // ---------- 交互 ----------
  canPlay() {
    return this.phase === PLAY && !this.helpOpen && !this.confirming && !this.reveal
      && !this.randomNewGameOpen && !this.pickerOpen;
  }


  // 按整块的可视矩形命中，而不是按「点落在哪个格」再反查。
  // 长条块跨过格间距，点它的边缘/缝隙时 Math.round 很容易四舍五入到相邻块。
  pieceAtPoint(p) {
    if (!p) return null;
    for (let i = 0; i < this.puzzle.pieces.length; i += 1) {
      const piece = this.puzzle.pieces[i];
      if (!piece.placed) continue;
      const rr = this.spanRect(piece.r, piece.c, piece.w, piece.h);
      if (p.x >= rr.x && p.x <= rr.x + rr.w && p.y >= rr.y && p.y <= rr.y + rr.h) return piece;
    }
    return null;
  }

  traySlotAt(p) {
    if (!p) return null;
    if (p.y < this.trayY || p.y > this.trayY + this.trayH) return null;
    for (let i = 0; i < 8; i += 1) {
      const r = this.traySlotRect(i);
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
        return { index: i, rect: r, piece: this.puzzle.pieces[i] };
      }
    }
    return null;
  }

  // 长按棋盘上已放的拼块：不松手也能直接进入拖动；托盘块仍可直接拖。
  updateLongPress() {
    const press = this.press;
    if (!press || this.drag) return;
    if (!this.canPlay()) {
      this.press = null;
      this.tapPiece = null;
      return;
    }
    if (Date.now() - press.at < LONG_PRESS_MS) return;
    if (!press.piece || !press.piece.placed) {
      this.press = null;
      return;
    }
    press.active = true;
    this.tapPiece = null;
    this.drag = {
      piece: press.piece,
      offX: (press.piece.w * this.cell) / 2,
      offY: (press.piece.h * this.cell) / 2,
      x: press.x,
      y: press.y,
      moved: false,
      fromBoard: true,
      lifted: false,
      origin: { r: press.piece.r, c: press.piece.c },
    };
  }

  startBoardDrag(p) {
    const press = this.press;
    if (!press || !press.piece || !press.piece.placed) return;
    this.tapPiece = null;
    this.press = null;
    this.drag = {
      piece: press.piece,
      offX: (press.piece.w * this.cell) / 2,
      offY: (press.piece.h * this.cell) / 2,
      x: p.x,
      y: p.y,
      moved: true,
      fromBoard: true,
      lifted: false,
      origin: { r: press.piece.r, c: press.piece.c },
    };
    this.liftBoardDrag();
  }

  // 单击棋盘上的拼块：先尝试原地旋转；周围放不下时找最近的合法位置。
  // 放不下才晃动，绝不把拼块收回候选区（收回只能拖到托盘）。
  rotatePlaced(piece) {
    if (!piece || !piece.placed) return false;
    const oldR = piece.r;
    const oldC = piece.c;
    const centerR = oldR + piece.h / 2;
    const centerC = oldC + piece.w / 2;
    logic.lift(this.puzzle, piece);
    logic.rotate(piece);
    const seen = new Set();
    const candidates = [];
    const add = (r, c) => {
      const rr = Math.round(r);
      const cc = Math.round(c);
      if (rr < 0 || cc < 0 || rr > logic.SIZE - piece.h || cc > logic.SIZE - piece.w) return;
      const key = `${rr},${cc}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({ r: rr, c: cc });
    };
    // 只尝试「原位置 + 以原中心为锚点」的附近位置；转不下就晃动，不把块甩到棋盘另一头。
    for (let dr = -2; dr <= 2; dr += 1) {
      for (let dc = -2; dc <= 2; dc += 1) {
        add(oldR + dr, oldC + dc);
        add(centerR - piece.h / 2 + dr, centerC - piece.w / 2 + dc);
      }
    }
    let best = null;
    let bestD = Infinity;
    candidates.forEach(({ r, c }) => {
      if (!logic.canPlace(this.puzzle, piece, r, c)) return;
      const dd = (r - oldR) * (r - oldR) + (c - oldC) * (c - oldC);
      if (dd < bestD) { bestD = dd; best = { r, c }; }
    });
    if (best && logic.place(this.puzzle, piece, best.r, best.c)) {
      this.save();
      return true;
    }
    // 附近没有位置：转回原方向，放回原位并晃动提示。
    logic.rotate(piece);
    logic.place(this.puzzle, piece, oldR, oldC);
    this.shakeAt = Date.now();
    return false;
  }

  trayDropPoint(p) {
    return !!p && p.x >= this.trayX && p.x <= this.trayX + this.trayW
      && p.y >= this.trayY && p.y <= this.trayY + this.trayH;
  }

  liftBoardDrag() {
    const drag = this.drag;
    if (!drag || !drag.fromBoard || drag.lifted) return;
    logic.lift(this.puzzle, drag.piece);
    drag.lifted = true;
  }

  onTouchStart(p) {
    if (this.pickerOpen) { this.pickerTouchStart(p); return; }
    if (!this.canPlay()) return;
    this.touch = { x: p.x, y: p.y, moved: false };
    this.tapPiece = null;
    this.press = null;
    this.drag = null;
    const slot = this.traySlotAt(p);
    if (slot && slot.piece && !slot.piece.placed) {
      const piece = slot.piece;
      this.drag = {
        piece,
        offX: (piece.w * this.cell) / 2,
        offY: (piece.h * this.cell) / 2,
        x: p.x,
        y: p.y,
        moved: false,
      };
      return;
    }
    const piece = this.pieceAtPoint(p);
    if (piece) {
      this.tapPiece = piece;
      this.press = { piece, x: p.x, y: p.y, at: Date.now(), active: false };
    }
  }

  onTouchMove(p) {
    if (this.pickerOpen) { this.pickerTouchMove(p); return; }
    if (!this.touch) return;
    const dx = p.x - this.touch.x;
    const dy = p.y - this.touch.y;
    if (dx * dx + dy * dy > TAP_SLOP * TAP_SLOP) this.touch.moved = true;
    // 棋盘上的块一旦移动超过点击阈值，立刻转为拖动；长按不动则由 updateLongPress 接管。
    if (!this.drag && this.touch.moved && this.tapPiece && this.tapPiece.placed) {
      this.startBoardDrag(p);
    }
    if (this.drag) {
      this.drag.x = p.x;
      this.drag.y = p.y;
      this.drag.moved = this.drag.moved || this.touch.moved;
      if (this.drag.fromBoard && this.drag.moved) this.liftBoardDrag();
    }
  }

  onTouchEnd(p) {
    if (this.pickerOpen) { this.pickerTouchEnd(p); return; }
    const drag = this.drag;
    this.drag = null;
    const tapPiece = this.tapPiece;
    const touch = this.touch;
    const press = this.press;
    this.tapPiece = null;
    this.touch = null;
    this.press = null;

    if (drag) {
      if (drag.fromBoard) {
        // 长按但没移动：保持原位，不误触「收回托盘」。
        if (!drag.moved) {
          if (drag.lifted) {
            logic.place(this.puzzle, drag.piece, drag.origin.r, drag.origin.c);
            this.save();
          }
          return;
        }
        this.liftBoardDrag();
        if (this.trayDropPoint(p)) {
          // 拖到候选区松手：留在候选区；这是唯一的「收回」方式。
          this.save();
          return;
        }
        const target = this.dropTarget(drag, p);
        if (target) {
          logic.place(this.puzzle, drag.piece, target.r, target.c);
                this.save();
          if (logic.isSolved(this.puzzle)) this.win();
        } else {
          // 拖到无效位置：回到拿起前的位置，不要掉回候选区。
          logic.place(this.puzzle, drag.piece, drag.origin.r, drag.origin.c);
          this.shakeAt = Date.now();
          this.save();
        }
        return;
      }
      if (!drag.moved) {
        // 单击托盘里的拼块 = 旋转
        logic.rotate(drag.piece);
        this.save();
        return;
      }
      const target = this.dropTarget(drag, p);
      if (target) {
        logic.place(this.puzzle, drag.piece, target.r, target.c);
            this.save();
        if (logic.isSolved(this.puzzle)) this.win();
      } else {
        this.shakeAt = Date.now();
      }
      return;
    }

    // 快速点击棋盘上已放的拼块：原地/就近旋转，不收回托盘。
    if (tapPiece && touch && !touch.moved && tapPiece.placed) {
      this.rotatePlaced(tapPiece);
    }
  }

  // ---------- 查看答案：清空棋盘，再逐块旋转飞入答案位置 ----------
  startReveal() {
    if (!this.canPlay()) return;
    this.puzzle = logic.createLevel(this.level - 1);
    this.revealed = false;
    this.drag = null;
    this.touch = null;
    this.tapPiece = null;
    this.press = null;
    this.reveal = { t: 0, plans: this.buildRevealPlans(), hidden: new Set(), settled: 0 };
    if (this.reveal.plans[0]) {
      this.reveal.plans[0].started = true;
      this.reveal.hidden.add(this.reveal.plans[0].piece.id);
    }
  }

  solutionBox(id) {
    const out = [];
    this.puzzle.grid.forEach((row, r) => row.forEach((v, c) => {
      if (v === id) out.push([r, c]);
    }));
    return {
      r: Math.min(...out.map((x) => x[0])),
      c: Math.min(...out.map((x) => x[1])),
      h: Math.max(...out.map((x) => x[0])) - Math.min(...out.map((x) => x[0])) + 1,
      w: Math.max(...out.map((x) => x[1])) - Math.min(...out.map((x) => x[1])) + 1,
    };
  }

  buildRevealPlans() {
    const plans = [];
    this.puzzle.pieces.forEach((piece, i) => {
      const box = this.solutionBox(piece.id);
      const slot = this.traySlotRect(i);
      const target = this.spanRect(box.r, box.c, box.w, box.h);
      const scale = this.trayUnit;
      plans.push({
        piece, r: box.r, c: box.c, w: box.w, h: box.h,
        fromX: slot.x + slot.w / 2, fromY: slot.y + slot.h / 2,
        toX: target.x + target.w / 2, toY: target.y + target.h / 2,
        fromW: piece.w * scale, fromH: piece.h * scale, toW: target.w, toH: target.h,
        spin: true,
        dir: i % 2 ? 1 : -1,
        start: i * REVEAL_STEP_MS, dur: REVEAL_MOVE_MS,
        started: false, settled: false,
      });
    });
    return plans;
  }

  updateReveal(dt) {
    const rv = this.reveal;
    if (!rv) return;
    rv.t += Math.min(100, dt || 16);
    rv.plans.forEach((plan) => {
      if (!plan.started && rv.t >= plan.start) {
        plan.started = true;
        rv.hidden.add(plan.piece.id);
      }
      if (plan.started && !plan.settled && rv.t >= plan.start + plan.dur) {
        plan.piece.w = plan.w;
        plan.piece.h = plan.h;
        logic.place(this.puzzle, plan.piece, plan.r, plan.c);
        plan.settled = true;
        rv.settled += 1;
        rv.hidden.delete(plan.piece.id);
      }
    });
    const last = rv.plans[rv.plans.length - 1];
    if (last && rv.settled >= rv.plans.length && rv.t >= last.start + last.dur + REVEAL_END_MS) {
      this.finishReveal();
    }
  }

  finishReveal() {
    if (!this.reveal) return;
    this.reveal = null;
    this.revealed = true;
    if (this.mode === 'random') this.streak = 0; // 查看答案不计随机连胜
    else this.best = Math.max(this.best, Math.min(logic.LEVEL_COUNT + 1, this.level + 1));
    this.phase = WON;
    this.resultAt = Date.now();
    this.save();
    try { audio.playSuccess(); } catch (e) { /* 静音 / 失败忽略 */ }
    this.startConfetti();
  }

  // 拖动松手：在棋盘上找离影子左上角最近、且能放下的位置
  dropTarget(drag, p) {
    if (!p) return null;
    const ghostX = drag.x - drag.offX;
    const ghostY = drag.y - drag.offY;
    if (p.x < this.boardX - 10 || p.x > this.boardX + this.boardW + 10
      || p.y < this.boardY - 10 || p.y > this.boardY + this.boardH + 10) return null;
    const span = this.cell + CELL_GAP;
    let best = null;
    let bestD = Infinity;
    for (let r = 0; r <= logic.SIZE - drag.piece.h; r += 1) {
      for (let c = 0; c <= logic.SIZE - drag.piece.w; c += 1) {
        if (!logic.canPlace(this.puzzle, drag.piece, r, c)) continue;
        const x = this.boardX + this.pad + c * span;
        const y = this.boardY + this.pad + r * span;
        const dd = (x - ghostX) * (x - ghostX) + (y - ghostY) * (y - ghostY);
        if (dd < bestD) { bestD = dd; best = { r, c }; }
      }
    }
    // 离落点太远就不吸附（否则点在满格上会被吸到棋盘另一侧）
    if (bestD > (this.cell * 3) * (this.cell * 3)) return null;
    return best;
  }

  win() {
    if (this.phase === WON) return;
    this.phase = WON;
    this.revealed = false;
    this.resultAt = Date.now();
    this.drag = null;
    this.touch = null;
    this.tapPiece = null;
    this.press = null;
    if (this.mode === 'level') {
      this.best = Math.max(this.best, Math.min(logic.LEVEL_COUNT + 1, this.level + 1));
    } else {
      this.streak += 1;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
    }
    this.save();
    try { achv.win('logicpuzzle', { level: this.level }); } catch (e) { /* 成就不影响游戏 */ }
    try { audio.playSuccess(); } catch (e) { /* 静音 / 失败忽略 */ }
    this.startConfetti();
  }

  // 分享用的成绩行：本游戏的 level 是 1 基，不能走 share.resultLine 的 level + 1
  get shareLine() {
    if (this.phase !== WON) return '';
    return t('app.shareLineLevel').replace('{n}', String(this.level));
  }

  startConfetti() { /* App.wrapSceneConfetti 会接管成全屏烟花 */ }

  onHide() {
    // 演示动画中途不落盘，避免恢复出半张棋盘
    if (!this.reveal) this.save();
  }

  onResize() { this.layout(); }

  onTheme() { this.layout(); }

  resultVisible(ms, key) { return super.resultVisible(ms, key); }

  // ---------- 更新 ----------
  update(dt) {
    this.now = Date.now();
    if (this.bg) this.bg.update(dt || 16);
    if (this.pickerOpen) {
      this.updatePicker();
      return;
    }
    if (this.reveal) {
      if (!this.helpOpen && !this.confirming) this.updateReveal(dt);
      return;
    }
    if (!this.helpOpen && !this.confirming) this.updateLongPress();
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
    this.drawTray(c);
    this.drawDrag(c);
    this.drawReveal(c);
    // 帮助 / 静音和其它游戏一样常驻（胜利遮罩只盖棋盘，不挡右下角）
    if (!this.helpOpen && !this.confirming) this.drawFabs(c);
    if (this.phase === WON && this.resultVisible(RESULT_DELAY_MS, `logicpuzzle-win:${this.level}:${this.resultAt}`)) this.drawResult(c);
    if (this.randomNewGameOpen) this.drawRandomNewGame(c);
    if (this.pickerOpen) this.drawLevelPicker(c);
  }

  drawHeader(c) {
    const T = theme.tokens;
    D.text(c, t('logicpuzzle.gameTitle'), W / 2, this.top + this.headerH / 2, {
      size: 15, weight: 'bold', color: T.text, align: 'center',
    });
    const h = this.homeRect;
    if (!icons.draw(c, 'home', h.x + h.w / 2, h.y + h.h / 2, 24, T.text)) {
      D.text(c, '⌂', h.x + h.w / 2, h.y + h.h / 2, { size: 24, color: T.text, align: 'center' });
    }
    this.addButton('home', h.x, h.y, h.w, h.h, () => this.app.goHome());
  }

  drawScore(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.scoreY, this.cw, this.scoreH, T);
    const stats = this.mode === 'random'
      ? [
        [t('logicpuzzle.bestStreak'), String(this.bestStreak)],
        [t('logicpuzzle.currentStreak'), String(this.streak)],
      ]
      : [
        [t('logicpuzzle.highest'), this.best > 1 ? String(this.best - 1) : '—'],
        [t('logicpuzzle.level'), String(this.level)],
      ];
    const q = this.cw / 2;
    stats.forEach(([label, value], i) => {
      if (i) D.divider(c, this.cx + q, this.scoreY + this.scoreH / 2, 24, T.border, 1);
      const x = this.cx + q * (i + 0.5);
      D.text(c, label, x, this.scoreY + this.scoreH * 0.33, { size: 11, color: T.muted, align: 'center' });
      D.text(c, value, x, this.scoreY + this.scoreH * 0.69, {
        size: 21, weight: 'bold', color: i === 1 ? T.primary : T.text, align: 'center',
      });
    });
  }

  openRandomNewGame() {
    if (this.mode !== 'random' || !this.canPlay()) return;
    this.randomNewGameOpen = true;
    this.confirming = false;
    this.drag = null;
    this.touch = null;
    this.tapPiece = null;
    this.press = null;
  }

  openLevelPicker(resetStreak) {
    this.randomNewGameOpen = false;
    this.pickerOpen = true;
    this.pickerResetStreak = !!resetStreak;
    const level = Math.max(1, Math.min(logic.LEVEL_COUNT, this.level));
    this.pickerOffset = [Math.floor(level / 10), level % 10];
    this.pickerDrag = null;
    this.pickerAnim = null;
  }

  wheelBounds(which) {
    if (which === 0) return [0, 8];
    const first = Math.max(0, Math.min(8, Math.round(this.pickerOffset[0])));
    if (first === 8) return [0, 8];
    if (first === 0) return [1, 9];
    return [0, 9];
  }

  pickerLevel() {
    const first = Math.max(0, Math.min(8, Math.round(this.pickerOffset[0])));
    const second = Math.max(this.wheelBounds(1)[0], Math.min(this.wheelBounds(1)[1], Math.round(this.pickerOffset[1])));
    return Math.max(1, Math.min(logic.LEVEL_COUNT, first * 10 + second));
  }

  confirmLevelPick() {
    if (!this.pickerOpen) return;
    this.finishPickerAnim();
    const level = this.pickerLevel();
    this.pickerOpen = false;
    this.pickerDrag = null;
    if (this.pickerResetStreak) this.streak = 0;
    this.mode = 'random';
    setRaw(MODE_KEY, 'random');
    this.startPuzzle(level);
  }

  pickerWheelAt(p) {
    if (!p || !this.pickerOpen) return -1;
    for (let i = 0; i < this.pickerWheelRects.length; i += 1) {
      const r = this.pickerWheelRects[i];
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return i;
    }
    return -1;
  }

  finishPickerAnim() {
    const anim = this.pickerAnim;
    if (!anim) return;
    this.pickerOffset[anim.which] = anim.to;
    this.pickerAnim = null;
    if (anim.which === 0) {
      const bounds = this.wheelBounds(1);
      this.pickerOffset[1] = Math.max(bounds[0], Math.min(bounds[1], this.pickerOffset[1]));
    }
  }

  pickerTouchStart(p) {
    this.finishPickerAnim();
    const which = this.pickerWheelAt(p);
    if (which < 0) return;
    this.pickerAnim = null;
    this.pickerDrag = {
      which,
      startY: p.y,
      startOffset: this.pickerOffset[which],
      moved: false,
    };
  }

  pickerTouchMove(p) {
    const drag = this.pickerDrag;
    if (!drag) return;
    const rowH = this.pickerWheelRows || 1;
    const bounds = drag.which === 0 ? [0, 8] : this.wheelBounds(1);
    const value = Math.max(bounds[0], Math.min(bounds[1],
      drag.startOffset + (drag.startY - p.y) / rowH));
    this.pickerOffset[drag.which] = value;
    if (drag.which === 0) {
      const secondBounds = this.wheelBounds(1);
      this.pickerOffset[1] = Math.max(secondBounds[0], Math.min(secondBounds[1], this.pickerOffset[1]));
    }
    if (Math.abs(p.y - drag.startY) > 4) drag.moved = true;
  }

  pickerTouchEnd(p) {
    const drag = this.pickerDrag;
    if (!drag) return;
    const which = drag.which;
    const rowH = this.pickerWheelRows || 1;
    const bounds = which === 0 ? [0, 8] : this.wheelBounds(1);
    let target = this.pickerOffset[which];
    if (!drag.moved && p) {
      const rect = this.pickerWheelRects[which];
      if (rect) {
        const center = rect.y + rect.h / 2;
        target = this.pickerOffset[which] + (center - p.y) / rowH;
      }
    }
    target = Math.max(bounds[0], Math.min(bounds[1], Math.round(target)));
    this.pickerAnim = { which, from: this.pickerOffset[which], to: target, at: Date.now() };
    this.pickerDrag = null;
  }

  updatePicker() {
    const anim = this.pickerAnim;
    if (!anim) return;
    const p = Math.min(1, (Date.now() - anim.at) / 240);
    const e = 1 - Math.pow(1 - p, 3);
    this.pickerOffset[anim.which] = anim.from + (anim.to - anim.from) * e;
    if (p >= 1) {
      this.pickerOffset[anim.which] = anim.to;
      this.pickerAnim = null;
    }
    if (anim.which === 0) {
      const bounds = this.wheelBounds(1);
      this.pickerOffset[1] = Math.max(bounds[0], Math.min(bounds[1], this.pickerOffset[1]));
    }
  }


  drawModalButton(c, x, y, w, h, label, kind, id, onTap, enabled) {
    const T = theme.tokens;
    if (kind === 'primary') {
      D.fillRoundRect(c, x, y, w, h, 8, enabled === false ? T.disabled : T.primary);
    } else {
      D.fillRoundRect(c, x, y, w, h, 8, T.card);
      D.strokeRoundRect(c, x, y, w, h, 8, enabled === false ? T.border : T.god, 1);
    }
    D.text(c, label, x + w / 2, y + h / 2, {
      size: 12.5, weight: 'bold',
      color: kind === 'primary' ? '#fff' : enabled === false ? T.muted : T.god,
      align: 'center',
    });
    if (enabled !== false) this.addButton(id, x, y, w, h, onTap);
  }

  drawRandomNewGame(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.48)';
    c.fillRect(0, 0, W, H);
    const w = W - 52;
    const h = 196;
    const x = (W - w) / 2;
    const y = (H - h) / 2;
    D.card(c, x, y, w, h, T);
    this.addButton('random-new-mask', 0, 0, W, H, () => {});
    D.text(c, t('logicpuzzle.newGameTitle'), W / 2, y + 30, {
      size: 17, weight: 'bold', color: T.text, align: 'center',
    });
    D.text(c, t('logicpuzzle.newGameRandomMsg'), W / 2, y + 58, {
      size: 12, color: T.muted, align: 'center',
    });
    const gap = 8;
    const bw = (w - 40 - gap * 2) / 3;
    const by = y + h - 48;
    this.drawModalButton(c, x + 20, by, bw, 32, t('cancel'), 'secondary', 'random-new-cancel',
      () => { this.randomNewGameOpen = false; });
    // 与随机胜利遮罩保持同一套样式：选一关=橙色实心，随机一关=主色实心。
    this.drawCompactResultButton(c, x + 20 + bw + gap, by, bw, 32,
      t('logicpuzzle.pickLevelShort'), 'pick', 'random-new-pick', () => this.openLevelPicker(true));
    this.drawCompactResultButton(c, x + 20 + (bw + gap) * 2, by, bw, 32,
      t('logicpuzzle.randomLevelShort'), 'random', 'random-new-random',
      () => { this.randomNewGameOpen = false; this.startNewGame(); });
  }

  drawLevelPicker(c) {
    const T = theme.tokens;
    c.fillStyle = 'rgba(0,0,0,0.48)';
    c.fillRect(0, 0, W, H);
    const w = Math.min(W - 24, 360);
    const h = Math.min(H - 70, 360);
    const x = (W - w) / 2;
    const y = (H - h) / 2;
    D.card(c, x, y, w, h, T);
    this.addButton('picker-mask', 0, 0, W, H, () => {});
    D.text(c, t('logicpuzzle.chooseLevelTitle'), W / 2, y + 28, {
      size: 16, weight: 'bold', color: T.text, align: 'center',
    });
    D.text(c, t('logicpuzzle.levelPreview').replace('{n}', String(this.pickerLevel())),
      W / 2, y + 52, { size: 12, color: T.muted, align: 'center' });
    const wheelW = Math.min(112, (w - 80) / 2);
    const wheelH = 170;
    const wheelY = y + 70;
    const wheelGap = 16;
    const wheelStart = (W - (wheelW * 2 + wheelGap)) / 2;
    this.pickerWheelRects = [
      { x: wheelStart, y: wheelY, w: wheelW, h: wheelH },
      { x: wheelStart + wheelW + wheelGap, y: wheelY, w: wheelW, h: wheelH },
    ];
    this.drawPickerWheel(c, this.pickerWheelRects[0], 0);
    this.drawPickerWheel(c, this.pickerWheelRects[1], 1);
    const fw = (w - 40 - 8) / 2;
    const fy = y + h - 46;
    this.drawModalButton(c, x + 20, fy, fw, 32, t('cancel'), 'secondary',
      'picker-cancel', () => { this.pickerOpen = false; this.pickerDrag = null; this.pickerAnim = null; });
    this.drawModalButton(c, x + 28 + fw, fy, fw, 32, t('logicpuzzle.pickConfirm'), 'primary',
      'picker-confirm', () => this.confirmLevelPick());
  }

  drawPickerWheel(c, rect, which) {
    const T = theme.tokens;
    const rowH = rect.h / 5;
    this.pickerWheelRows = rowH;
    const centerY = rect.y + rect.h / 2;
    const bounds = this.wheelBounds(which);
    const offset = this.pickerOffset[which];
    D.fillRoundRect(c, rect.x, rect.y, rect.w, rect.h, 10, T.enter);
    c.save();
    D.roundRect(c, rect.x, rect.y, rect.w, rect.h, 10);
    c.clip();
    // 中间选中行
    D.fillRoundRect(c, rect.x + 4, centerY - rowH / 2, rect.w - 8, rowH, 8,
      theme.dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.72)');
    for (let index = bounds[0]; index <= bounds[1]; index += 1) {
      const d = index - offset;
      if (Math.abs(d) > 2.45) continue;
      const py = centerY + d * rowH;
      const active = Math.abs(d) < 0.5;
      const alpha = Math.max(0.15, 1 - Math.abs(d) * 0.36);
      c.save();
      c.globalAlpha = alpha;
      D.text(c, String(index), rect.x + rect.w / 2, py, {
        size: active ? 27 : 20,
        weight: 'bold',
        color: active ? T.primary : T.muted,
        align: 'center',
      });
      c.restore();
    }
    c.restore();
    D.strokeRoundRect(c, rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1, 10, T.border, 1);
  }

  drawCompactResultButton(c, x, y, w, h, label, kind, id, onTap) {
    const T = theme.tokens;
    if (kind === 'replay') {
      D.strokeRoundRect(c, x, y, w, h, 7, T.god, 1);
    } else {
      D.fillRoundRect(c, x, y, w, h, 7, kind === 'pick' ? T.god : T.primary);
    }
    D.text(c, label, x + w / 2, y + h / 2, {
      size: Math.max(9, Math.min(11.5, w / 4.4)), weight: 'bold',
      color: kind === 'replay' ? T.god : '#ffffff', align: 'center',
    });
    this.addButton(id, x, y, w, h, onTap);
  }

  drawOptions(c) {
    const T = theme.tokens;
    D.card(c, this.cx, this.optY, this.cw, this.optH, T);
    const cy = this.optY + this.optH / 2;
    // 左侧固定模式区：新游戏按钮不再独自占左半，模式文案始终可见。
    const modeW = Math.min(88, this.cw * 0.27);
    const modeX = this.cx + modeW / 2;
    D.text(c, this.mode === 'random' ? t('logicpuzzle.modeRandom') : t('logicpuzzle.modeLevel'),
      modeX, cy, {
        size: 11, weight: 'bold', color: this.mode === 'random' ? T.god : T.primary, align: 'center',
      });
    D.divider(c, this.cx + modeW, cy, 24, T.border, 1);
    const areaX = this.cx + modeW;
    const areaW = this.cw - modeW;
    D.divider(c, areaX + areaW / 2, cy, 20, T.border, 1);
    const enabled = this.canPlay();
    this.drawOptionButton(c, areaX + areaW * 0.25, cy, t('logicpuzzle.newGame'),
      enabled ? T.primary : T.disabled, enabled, 'gamepad', 'new-game',
      () => {
        if (this.mode === 'random') this.openRandomNewGame();
        else this.confirming = true;
      });
    this.drawOptionButton(c, areaX + areaW * 0.75, cy, t('logicpuzzle.answer'),
      enabled ? T.god : T.disabled, enabled, 'eye', 'answer',
      () => this.startReveal());
  }

  // 和 24 点同一套：实心圆角按钮（新游戏主色 / 查看答案橙色），宽按文案量、最高 132。
  drawOptionButton(c, cx, cy, label, color, enabled, iconKey, id, onTap) {
    const w = Math.min(132, D.measure(c, label, 13, 'bold') + 40);
    const h = 32;
    const x = cx - w / 2;
    const y = cy - h / 2;
    D.fillRoundRect(c, x, y, w, h, 8, color);
    actionLabel.draw(c, iconKey, label, cx, cy, { size: 13, color: '#ffffff' });
    if (enabled) this.addButton(id, x, y, w, h, onTap);
  }

  drawBoard(c) {
    const T = theme.tokens;
    const shake = this.shakeAt ? Math.max(0, 1 - (Date.now() - this.shakeAt) / 260) : 0;
    c.save();
    if (shake > 0) c.translate(Math.sin(Date.now() / 18) * 3 * shake, 0);
    D.fillRoundRect(c, this.boardX, this.boardY, this.boardW, this.boardH, 14, T.boardBg);
    const emptyFill = theme.dark ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.035)';

    // 空格
    for (let r = 0; r < logic.SIZE; r += 1) {
      for (let col = 0; col < logic.SIZE; col += 1) {
        if (this.puzzle.board[r][col] != null) continue;
        const rect = this.cellRect(r, col);
        D.fillRoundRect(c, rect.x, rect.y, rect.w, rect.h, 5, emptyFill);
      }
    }

    // 固定块：同一编号（1/2/3）是一整块，整体画
    const fixed = {};
    this.puzzle.grid.forEach((row, r) => row.forEach((v, col) => {
      if (!logic.IS_FIXED(v)) return;
      const key = String(v);
      if (!fixed[key]) fixed[key] = { minR: r, maxR: r, minC: col, maxC: col };
      fixed[key].minR = Math.min(fixed[key].minR, r);
      fixed[key].maxR = Math.max(fixed[key].maxR, r);
      fixed[key].minC = Math.min(fixed[key].minC, col);
      fixed[key].maxC = Math.max(fixed[key].maxC, col);
    }));
    const fixedColor = theme.dark ? 'rgba(150,164,180,0.38)' : 'rgba(91,107,122,0.26)';
    Object.keys(fixed).forEach((k) => {
      const g = fixed[k];
      const rr = this.spanRect(g.minR, g.minC, g.maxC - g.minC + 1, g.maxR - g.minR + 1);
      D.fillRoundRect(c, rr.x, rr.y, rr.w, rr.h, 6, fixedColor);
      D.strokeRoundRect(c, rr.x + 0.5, rr.y + 0.5, rr.w - 1, rr.h - 1, 6, 'rgba(120,136,150,0.45)', 1);
    });

    // 已放的拼块：整块一个圆角矩形 + 一个字母，不再逐格拆分
    this.puzzle.pieces.forEach((p) => {
      if (!p.placed) return;
      const rr = this.spanRect(p.r, p.c, p.w, p.h);
      this.drawBlock(c, rr.x, rr.y, rr.w, rr.h, p.color, p.id);
    });
    c.restore();
  }

  drawTray(c) {
    const T = theme.tokens;
    D.card(c, this.trayX, this.trayY, this.trayW, this.trayH, T);
    this.puzzle.pieces.forEach((p, i) => {
      const slot = this.traySlotRect(i);
      if (p.placed || (this.drag && this.drag.piece === p && this.drag.moved)
        || (this.reveal && this.reveal.hidden.has(p.id))) return;
      const w = p.w * this.trayUnit;
      const h = p.h * this.trayUnit;
      this.drawBlock(c, slot.x + (slot.w - w) / 2, slot.y + (slot.h - h) / 2, w, h, p.color, p.id, {
        labelSize: Math.max(8, Math.min(13, Math.min(w, h) * 0.55)),
      });
    });
  }

  drawDrag(c) {
    const drag = this.drag;
    if (!drag || !drag.moved) return;
    const T = theme.tokens;
    const ghostX = drag.x - drag.offX;
    const ghostY = drag.y - drag.offY;
    const target = this.dropTarget(drag, { x: drag.x, y: drag.y });
    if (target) {
      const rr = this.spanRect(target.r, target.c, drag.piece.w, drag.piece.h);
      D.fillRoundRect(c, rr.x, rr.y, rr.w, rr.h, 7, 'rgba(80,200,140,0.16)');
      D.strokeRoundRect(c, rr.x + 1, rr.y + 1, rr.w - 2, rr.h - 2, 7, T.primary, 2);
    }
    const w = drag.piece.w * this.cell + (drag.piece.w - 1) * CELL_GAP;
    const h = drag.piece.h * this.cell + (drag.piece.h - 1) * CELL_GAP;
    this.drawBlock(c, ghostX, ghostY, w, h, drag.piece.color, drag.piece.id, { alpha: 0.86 });
  }

  drawReveal(c) {
    const rv = this.reveal;
    if (!rv) return;
    const plan = rv.plans.find((x) => x.started && !x.settled);
    if (!plan) return;
    const p = Math.max(0, Math.min(1, (rv.t - plan.start) / plan.dur));
    const e = 1 - Math.pow(1 - p, 3);
    const cx = plan.fromX + (plan.toX - plan.fromX) * e;
    const cy = plan.fromY + (plan.toY - plan.fromY) * e;
    const w = plan.fromW + (plan.toW - plan.fromW) * e;
    const h = plan.fromH + (plan.toH - plan.fromH) * e;
    const angle = plan.spin ? plan.dir * (1 - e) * (Math.PI / 2) : 0;
    c.save();
    c.translate(cx, cy);
    c.rotate(angle);
    this.drawBlock(c, -w / 2, -h / 2, w, h, plan.piece.color, plan.piece.id);
    c.restore();
  }


  drawFabs(c) {
    const T = theme.tokens;
    fabKit.draw(this, c, this.helpFab, {
      id: 'help',
      kind: 'help',
      icon: 'help',
      fallback: '?',
      color: T.text,
      onTap: () => { this.helpOpen = true; },
    });
    const muteRect = fabKit.muteSlot(this.helpFab);
    if (muteRect) fabKit.drawMute(this, c, muteRect);
    const modeRect = fabKit.slotLeft(this.helpFab, muteRect ? 2 : 1);
    const random = this.mode === 'random';
    fabKit.draw(this, c, modeRect, {
      id: 'mode',
      kind: 'mode',
      icon: random ? 'dice-5' : 'list-numbered',
      fallback: random ? '🎲' : '1…',
      color: T.text,
      onTap: () => this.toggleMode(),
    });
  }

  // ---------- 结算 ----------
  drawResult(c) {
    const T = theme.tokens;
    const random = this.mode === 'random';
    const final = this.mode === 'level' && this.level >= logic.LEVEL_COUNT;
    // 和麻将 / 雀圣 / 赌神一样：只盖住游戏区域（棋盘），不铺满全屏；文案全部居中。
    const overlay = theme.dark ? 'rgba(38,38,38,0.94)' : 'rgba(250,248,239,0.94)';
    const rect = share.resultPanel(c, this, this.boardY, this.boardH, {
      radius: 14, color: overlay, w: this.boardW,
    });
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const titleSize = Math.max(14, Math.min(19, rect.w / 14));
    D.text(c, final && !this.revealed ? t('logicpuzzle.allDone') : t('logicpuzzle.winTitle'), cx, cy - 40, {
      size: titleSize, weight: 'bold', color: T.win || T.primary, align: 'center',
    });
    D.text(c, t('logicpuzzle.winSub'), cx, cy - 18, { size: 12, color: T.muted, align: 'center' });
    D.text(c, `${t('logicpuzzle.level')} ${this.level}`, cx, cy + 4, {
      size: 13, color: T.text, align: 'center',
    });

    if (random) {
      // 随机模式：重玩本关 / 选一关 / 随机一关
      const labels = [t('logicpuzzle.replay'), t('logicpuzzle.pickLevelShort'), t('logicpuzzle.randomLevelShort')];
      const gap = 4;
      const bw = (rect.w - 24 - gap * 2) / 3;
      const by = cy + 28;
      this.drawCompactResultButton(c, rect.x + 12, by, bw, 30, labels[0], 'replay',
        'result-replay', () => this.replayLevel());
      this.drawCompactResultButton(c, rect.x + 12 + bw + gap, by, bw, 30, labels[1], 'pick',
        'result-pick', () => this.openLevelPicker(false));
      this.drawCompactResultButton(c, rect.x + 12 + (bw + gap) * 2, by, bw, 30, labels[2],
        'random', 'result-again', () => this.again());
      return;
    }

    const finalLevel = this.level >= logic.LEVEL_COUNT;
    const primaryLabel = finalLevel ? t('logicpuzzle.newGame') : t('logicpuzzle.next');
    const primaryKind = finalLevel ? 'new' : 'next';
    const primaryId = finalLevel ? 'result-new' : 'result-next';
    const primaryTap = finalLevel ? (() => this.startNewGame()) : (() => this.nextLevel());
    const labels = [t('logicpuzzle.replay'), primaryLabel];
    const gap = 10;
    const widths = labels.map((label) => resultButton.width(c, label));
    const totalW = widths[0] + widths[1] + gap;
    if (totalW <= rect.w - 24) {
      const bx = cx - totalW / 2;
      resultButton.draw(c, this, labels[0], 'replay', bx, cy + 22, {
        id: 'result-replay', width: widths[0], onTap: () => this.replayLevel(),
      });
      resultButton.draw(c, this, labels[1], primaryKind, bx + widths[0] + gap, cy + 22, {
        id: primaryId, width: widths[1], onTap: primaryTap,
      });
    } else {
      // 320 的棋盘只有 ~185px，两枚按钮放不下一行：竖排，仍然居中。
      const by1 = cy + 22;
      resultButton.draw(c, this, labels[0], 'replay', cx - widths[0] / 2, by1, {
        id: 'result-replay', width: widths[0], onTap: () => this.replayLevel(),
      });
      resultButton.draw(c, this, labels[1], primaryKind, cx - widths[1] / 2, by1 + 34, {
        id: primaryId, width: widths[1], onTap: primaryTap,
      });
    }
  }

  // 帮助 / 二次确认都由 App 的统一面板画；这里必须有同名方法，App 才会接管
  drawHelp() {}
  drawConfirm() {}
}

LogicPuzzleScene.LEVEL_COUNT = logic.LEVEL_COUNT;
module.exports = LogicPuzzleScene;
