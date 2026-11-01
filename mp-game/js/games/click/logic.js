// 关灯游戏纯逻辑：0/1/2 三档，点自身与四邻 +1 mod 3；全 0 胜，点击次数用尽负。
// 与 web 的 ClickGame.vue 逐条对应（随机开局 / 历史解 / 撤销重做 / 最佳分）。
const BIG_VAL = 3;
const GAMING = 0;
const LOSE = 1;
const WIN = 2;
const NB = 3;

class ClickLogic {
  constructor(difficulty) {
    this.n = difficulty;
    this.reset();
  }

  reset() {
    this.cells = new Array(this.n * this.n).fill(0);
    this.clickCount = 0;
    this.result = GAMING;
    this.userOpts = [];
    this.undoIndex = -1;
    this.history = new Map();
    this.randomSomeOperations();
    // 与 web 的 initGame 一致：开局随机操作产生的点击数不计入本局
    this.clickCount = 0;
    this.result = GAMING;
    this.userOpts = [];
    this.undoIndex = -1;
  }

  get maxClick() { return this.n * this.n; }

  addHistory(row, col) {
    const key = `${row},${col}`;
    if (!this.history.has(key)) this.history.set(key, 1);
    else if (this.history.get(key) === 1) this.history.set(key, 2);
    else this.history.delete(key);
  }

  randomSomeOperations() {
    for (let i = 0; i < (this.n - 2) * 3; i++) {
      const row = Math.floor(Math.random() * this.n);
      const col = Math.floor(Math.random() * this.n);
      this.apply(row, col, 1);
      this.addHistory(row, col);
      if (Math.random() < 0.5) {
        this.apply(row, col, 1);
        this.addHistory(row, col);
      }
    }
  }

  operate(row, col, diff) {
    const n = this.n;
    [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dr, dc]) => {
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || r >= n || c < 0 || c >= n) return;
      const idx = r * n + c;
      this.cells[idx] = (this.cells[idx] + diff + BIG_VAL) % BIG_VAL;
    });
  }

  apply(row, col, diff) {
    this.operate(row, col, diff);
  }

  checkResult() {
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i] !== 0) return;
    }
    this.result = WIN;
  }

  click(row, col, isRandom) {
    if (this.result !== GAMING) return false;
    this.clickCount += 1;
    if (!isRandom) {
      this.userOpts.length = this.undoIndex + 1;
      this.userOpts.push([row, col]);
      this.undoIndex += 1;
    }
    this.operate(row, col, 1);
    this.checkResult();
    if (this.clickCount === this.maxClick && this.result !== WIN) this.result = LOSE;
    return true;
  }

  undo() {
    if (this.result !== GAMING || this.undoIndex < 0) return;
    this.clickCount -= 1;
    const [row, col] = this.userOpts[this.undoIndex];
    this.undoIndex -= 1;
    this.operate(row, col, -1);
  }

  redo() {
    if (this.result !== GAMING || this.undoIndex >= this.userOpts.length - 1) return;
    this.clickCount += 1;
    const [row, col] = this.userOpts[this.undoIndex + 1];
    this.undoIndex += 1;
    this.operate(row, col, 1);
  }

  // 上帝模式回放开局时的解；同一格出现两次等于抵消，不点。
  solutionOps() {
    const opts = [];
    this.history.forEach((count, key) => {
      const one = key.split(',').map(Number);
      opts.push(one);
      if (count === 1) opts.push(one);
    });
    opts.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
    return opts;
  }
}

module.exports = { ClickLogic, BIG_VAL, GAMING, LOSE, WIN, NB };
