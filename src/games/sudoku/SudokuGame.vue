<template>
  <div class="wrapper">
    <TopHeader @onScoreReset="onScoreReset" />
    <div class="card score-area">
      <div class="stat">
        <span class="stat-label">{{ i18n('bestScore') }}</span>
        <span class="stat-value">{{ bestTime ? fmt(bestTime) : '--:--' }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('hearts') }}</span>
        <span class="stat-value stat-hearts">
          <template v-for="h in heartsMax" :key="h">
            <span class="heart" :class="{ dead: h > hearts }">{{ h <= hearts ? '❤️' : '🤍' }}</span>
          </template>
        </span>
      </div>
    </div>
    <div class="card opt-area">
      <div class="difficulty-wrapper">
        <button @click="changeDifficulty(-1)" class="opt-icon" :class="{ disable: difficulty === MIN_DIFFICULTY }">
          <i i-carbon-subtract-alt />
        </button>
        <span class="difficulty-value">{{ diffName }}</span>
        <button @click="changeDifficulty(1)" class="opt-icon" :class="{ disable: difficulty === MAX_DIFFICULTY }">
          <i i-carbon-add-alt />
        </button>
      </div>
      <div class="divider"></div>
      <div class="opt-half">
        <CountTimer ref="timerRef" :enable="phase === PLAY" :on-tick="saveState" />
      </div>
      <div class="divider"></div>
      <div class="start-wrapper">
        <button @click="initGame" class="game-icon">{{ i18n('start') }}</button>
      </div>
    </div>
    <div class="game-area">
      <div class="board-frame" :style="frameStyle">
        <div class="board">
          <div
            v-for="(cell, i) in cells"
            :key="`${gameId}-${i}`"
            class="cell"
            :class="cellClass(i, cell)"
            :style="cellStyle(i)"
            @click="onCellClick(i)"
          >
            <span v-if="cell.v" class="num">{{ cell.v }}</span>
            <span v-else-if="cell.notes" class="notes">
              <span v-for="d in NUMS" :key="d" class="note" :class="{ has: cell.notes & (1 << d) }">{{ d }}</span>
            </span>
          </div>
        </div>
      </div>
      <Transition name="win-pop">
        <div v-if="phase === WON || phase === OVER" class="result" :class="phase === WON ? 'win' : 'lose'">
          <template v-if="phase === WON">
            <span>🎉🎉 {{ i18n('tipWin') }} 🎉🎉</span>
            <span v-if="newBest" class="new-best">🏅 {{ i18n('newBest') }}</span>
          </template>
          <span v-else>👻👻 {{ i18n('tipLost') }} 👻👻</span>
          <button @click="initGame" class="game-icon again">{{ i18n('playAgain') }}</button>
        </div>
      </Transition>
    </div>
    <div class="card pad">
      <div class="keys">
        <button
          v-for="d in NUMS"
          :key="d"
          class="key"
          :class="keyClass(d)"
          @click="onPad(d)"
        >
          {{ d }}
          <span v-if="digitLeft[d] > 0" class="badge">{{ digitLeft[d] }}</span>
        </button>
      </div>
      <div class="tools">
        <button class="tool" :class="{ active: notesMode }" @click="notesMode = !notesMode">
          <i i-mdi-pencil-outline />{{ i18n('notes') }}
        </button>
        <button class="tool" @click="onErase">
          <i i-mdi-backspace-outline />{{ i18n('erase') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';

import TopHeader from '@/components/TopHeader.vue';
import CountTimer from './CountTimer.vue';
import confetti from './confetti';
import { i18n } from '@/shared/i18n';
import { generatePuzzle } from './sudoku';

const NUMS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
// 简单 / 一般 / 困难：预填数字越少越难（挖空数递增）
const DIFFICULTIES = [
  { empties: 40 },
  { empties: 48 },
  { empties: 55 },
];
const DIFF_NAMES = ['diffEasy', 'diffMedium', 'diffHard'];
const [PLAY, WON, OVER] = ['play', 'won', 'over'];
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 3;
const KEY_PREFIX = '__sudoku_game__';
const DIFFICULTY_KEY = `${KEY_PREFIX}difficulty`;
const STATE_KEY = `${KEY_PREFIX}state`;

const difficulty = ref(initDifficulty());
const cells = ref([]);
const selected = ref(-1);
const notesMode = ref(false);
const phase = ref(PLAY);
const newBest = ref(false);
const bestTime = ref(0);
const gameId = ref(0);
const timerRef = ref(null);
let winTimer = null;

// 唯一解答案：与填数对比判定“填错”，也是爱心扣减与胜利判断的依据
const solution = ref([]);
// 剩余爱心：初始 = 难度档位（简单 1 / 一般 2 / 困难 3），填错扣 1 颗，
// 爱心为 0 后再填错即游戏失败
const hearts = ref(0);
const heartsMax = computed(() => difficulty.value);

const diffName = computed(() => i18n(DIFF_NAMES[difficulty.value - 1]));
const padDigit = computed(() => {
  const s = selected.value;
  return s >= 0 && !cells.value[s]?.fixed ? cells.value[s].v : 0;
});
// 每个数字（1~9）还剩几个可填 = 9 − 盘面上已出现的次数
const digitLeft = computed(() => {
  const leftArr = [0, 9, 9, 9, 9, 9, 9, 9, 9, 9];
  for (const c of cells.value) {
    if (c.v) leftArr[c.v]--;
  }
  return leftArr;
});
function keyClass(d) {
  return { on: padDigit.value === d, used: digitLeft.value[d] <= 0 };
}

// 棋盘按视口收缩：外框与数字键盘同宽，9×9 单元格等分
const frameStyle = computed(() => {
  const avail = Math.min(window.innerWidth || 420, 440) - 32;
  const cell = Math.floor((avail - 4) / 9);
  return {
    '--fs': `${Math.max(15, Math.floor(cell * 0.52))}px`,
    '--nfs': `${Math.max(9, Math.floor(cell * 0.24))}px`,
  };
});

onMounted(() => {
  if (!restore()) initGame();
  window.addEventListener('keyup', onKeyUp);
});

// 进行中的对局实时落盘：任何填数/笔记/难度变化都会触发保存，
// 计时器每秒走一格时也会带上最新秒数
watch(cells, saveState, { deep: true });

onUnmounted(() => {
  clearTimeout(winTimer);
  window.removeEventListener('keyup', onKeyUp);
});

function initDifficulty() {
  const saved = +(localStorage.getItem(DIFFICULTY_KEY) || 1);
  return saved >= MIN_DIFFICULTY && saved <= MAX_DIFFICULTY ? saved : 1;
}

function bestKey() {
  return KEY_PREFIX + difficulty.value;
}

function fmt(sec) {
  return ('00' + ~~(sec / 60)).slice(-2) + ':' + ('00' + sec % 60).slice(-2);
}

// ---------- 新游戏 ----------

function initGame() {
  clearTimeout(winTimer);
  const { puzzle, solution: sol } = generatePuzzle(DIFFICULTIES[difficulty.value - 1].empties);
  // 每个格子：v 数字（0 为空）、fixed 题面格、notes 候选数位掩码
  cells.value = puzzle.map(v => ({ v, fixed: v > 0, notes: 0 }));
  solution.value = sol;
  hearts.value = difficulty.value; // 简单 1 / 一般 2 / 困难 3
  selected.value = -1;
  notesMode.value = false;
  phase.value = PLAY;
  newBest.value = false;
  bestTime.value = +(localStorage.getItem(bestKey()) || 0);
  gameId.value++;
  timerRef.value?.reset();
}

function changeDifficulty(dir) {
  const next = difficulty.value + dir;
  if (next < MIN_DIFFICULTY || next > MAX_DIFFICULTY) return;
  difficulty.value = next;
  localStorage.setItem(DIFFICULTY_KEY, next);
  initGame();
}

function onScoreReset() {
  bestTime.value = 0;
}

// ---------- 存档（退出回主页后恢复） ----------

function removeState() {
  try { localStorage.removeItem(STATE_KEY); } catch { /* 忽略 */ }
}

// 整盘填满且完全正确 = 已完成的盘，不再落盘（胜利时清除进行中状态）
function isFinished() {
  for (let i = 0; i < 81; i++) {
    if (!cells.value[i].v || cells.value[i].v !== solution.value[i]) return false;
  }
  return true;
}

function saveState() {
  if (phase.value !== PLAY) return;
  if (isFinished()) {
    removeState();
    return;
  }
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({
      difficulty: difficulty.value,
      time: timerRef.value?.seconds() || 0,
      // 每格存 [数字, 是否题面格, 笔记位掩码]
      cells: cells.value.map(c => [c.v, c.fixed ? 1 : 0, c.notes]),
      solution: solution.value,
      hearts: hearts.value,
    }));
  } catch { /* 忽略 */ }
}

// 恢复到退出前的对局（含计时秒数），恢复失败则开新局
function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY));
    if (!saved || !Array.isArray(saved.cells) || saved.cells.length !== 81) return false;
    const d = +saved.difficulty;
    if (!(d >= MIN_DIFFICULTY && d <= MAX_DIFFICULTY)) return false;
    const sol = saved.solution;
    if (!Array.isArray(sol) || sol.length !== 81 || sol.some(v => !(v >= 1 && v <= 9 && v === (v | 0)))) return false;
    const arr = saved.cells.map(t => {
      const v = Math.min(9, Math.max(0, +t[0] || 0));
      const fixed = Boolean(t[1]) && v > 0;
      const notes = fixed ? 0 : (+t[2] || 0) & 511;
      return { v, fixed, notes };
    });
    difficulty.value = d;
    localStorage.setItem(DIFFICULTY_KEY, d);
    cells.value = arr;
    solution.value = sol;
    const hv = +saved.hearts;
    hearts.value = hv >= 0 && hv <= d ? hv : d;
    selected.value = -1;
    notesMode.value = false;
    phase.value = PLAY;
    newBest.value = false;
    bestTime.value = +(localStorage.getItem(bestKey()) || 0);
    gameId.value++;
    timerRef.value?.restore(Math.max(0, +saved.time || 0));
    return true;
  } catch {
    return false;
  }
}

// ---------- 渲染辅助 ----------

function sameUnit(a, b) {
  const ra = (a / 9) | 0;
  const ca = a % 9;
  const rb = (b / 9) | 0;
  const cb = b % 9;
  return ra === rb || ca === cb
    || (((ra / 3) | 0) === ((rb / 3) | 0) && ((ca / 3) | 0) === ((cb / 3) | 0));
}

// 该格当前数字是否与唯一解不符（题面格与答案一致，不会判错）
function isWrong(i) {
  const v = cells.value[i].v;
  return v > 0 && v !== solution.value[i];
}

function cellClass(i, cell) {
  const s = selected.value;
  const out = [];
  if (cell.fixed) out.push('fixed');
  if (s >= 0 && s !== i && sameUnit(s, i)) out.push('hl');
  if (s >= 0 && s !== i && cells.value[s].v && cells.value[s].v === cell.v) out.push('same');
  if (!cell.fixed && isWrong(i)) out.push('err');
  if (i === s) out.push('sel');
  return out;
}

// 宫分隔线：格与格之间细线，每 3 行/列（3×3 宫边界）用略深的线区分各宫
const SUDOKU_LINE = 'var(--sudoku-line)';
const SUDOKU_STRONG = 'var(--sudoku-strong)';
function cellStyle(i) {
  const r = (i / 9) | 0;
  const c = i % 9;
  return {
    borderTopWidth: r > 0 ? (r % 3 === 0 ? '2px' : '1px') : '0',
    borderLeftWidth: c > 0 ? (c % 3 === 0 ? '2px' : '1px') : '0',
    borderTopColor: r > 0 ? (r % 3 === 0 ? SUDOKU_STRONG : SUDOKU_LINE) : 'transparent',
    borderLeftColor: c > 0 ? (c % 3 === 0 ? SUDOKU_STRONG : SUDOKU_LINE) : 'transparent',
  };
}

// ---------- 交互 ----------

function onCellClick(i) {
  if (phase.value !== PLAY) return;
  selected.value = selected.value === i ? -1 : i;
}

function onPad(d) {
  if (phase.value !== PLAY) return;
  const s = selected.value;
  if (s < 0) return;
  const cell = cells.value[s];
  if (cell.fixed) return;
  // 再点一次当前格已填的数字 = 清除该格（即使该数字已放满，也可借此纠错）
  if (cell.v === d) {
    cell.v = 0;
    cell.notes = 0;
    return;
  }
  // 该数字 9 个已全部放完：置灰不可再选（含新增笔记候选）
  if (digitLeft.value[d] <= 0) return;
  // 笔记模式下空格点数字 = 添加/移除候选；其余情况为填写
  if (notesMode.value && !cell.v) {
    cell.notes ^= 1 << d;
    return;
  }
  cell.v = d;
  cell.notes = 0;
  checkMistake(s);
  afterEdit();
}

function onErase() {
  if (phase.value !== PLAY) return;
  const s = selected.value;
  if (s < 0) return;
  const cell = cells.value[s];
  if (cell.fixed || (!cell.v && !cell.notes)) return;
  cell.v = 0;
  cell.notes = 0;
}

function onKeyUp(e) {
  if (phase.value !== PLAY || e.metaKey || e.ctrlKey || e.altKey) return;
  const code = e.key;
  if (code >= '1' && code <= '9') {
    onPad(+code);
    return;
  }
  if (code === '0' || code === 'Backspace' || code === 'Delete') {
    e.preventDefault();
    onErase();
    return;
  }
  const move = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
  }[code];
  if (move) {
    e.preventDefault();
    const s = selected.value < 0 ? 40 : selected.value;
    const r = Math.min(8, Math.max(0, ((s / 9) | 0) + move[0]));
    const c = Math.min(8, Math.max(0, (s % 9) + move[1]));
    selected.value = r * 9 + c;
  }
}

// ---------- 判定 ----------

function afterEdit() {
  for (let i = 0; i < cells.value.length; i++) {
    if (cells.value[i].v !== solution.value[i]) return;
  }
  win();
}

// 刚填入的数字若与答案不符：还有爱心则扣一颗，爱心已为 0 则游戏失败
function checkMistake(i) {
  if (!isWrong(i)) return;
  if (hearts.value > 0) {
    hearts.value--;
  } else {
    lose();
  }
}

function lose() {
  if (phase.value !== PLAY) return;
  timerRef.value?.stop();
  removeState(); // 失败的对局不再恢复，下次进入开新局
  phase.value = OVER;
}

function win() {
  if (phase.value !== PLAY) return;
  const elapsed = timerRef.value?.seconds() || 0;
  timerRef.value?.stop();
  newBest.value = !bestTime.value || elapsed < bestTime.value;
  if (newBest.value) {
    localStorage.setItem(bestKey(), elapsed);
    bestTime.value = elapsed;
  }
  removeState(); // 已完成的对局不再恢复，下次进入开新局
  confetti();
  winTimer = setTimeout(() => {
    phase.value = WON;
  }, 450);
}
</script>

<style scoped lang="scss">
@keyframes cell-pop {
  from {
    opacity: 0;
    transform: scale(0.86);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.wrapper {
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  box-sizing: border-box;
  background: var(--bg-color);
  color: var(--text-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  button {
    touch-action: manipulation;
  }
  .card {
    width: calc(100% - 32px);
    max-width: 440px;
    box-sizing: border-box;
    background: var(--card-bg-color);
    border-radius: var(--card-radius);
    box-shadow: var(--card-shadow);
  }
  .divider {
    width: 1px;
    height: 24px;
    align-self: center;
    background: var(--border-color);
    opacity: 0.6;
  }
  .score-area {
    margin-top: 70px;
    display: flex;
    align-items: center;
    height: 72px;
    .stat {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      .stat-label {
        font-size: 12px;
        opacity: 0.6;
      }
      .stat-value {
        font-size: 22px;
        font-weight: bold;
        line-height: 1.2;
        font-variant-numeric: tabular-nums;
      }
      .stat-value.stat-hearts {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 20px;
        line-height: 1;
        .heart {
          font-size: 19px;
          &.dead {
            opacity: 0.3;
          }
        }
      }
    }
  }
  .opt-area {
    display: flex;
    align-items: center;
    margin: 16px 0;
    height: 72px;
    .difficulty-wrapper {
      flex: 4;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      .difficulty-value {
        min-width: 40px;
        padding: 0 2px;
        box-sizing: border-box;
        text-align: center;
        font-size: 14px;
        font-weight: bold;
        white-space: nowrap;
      }
    }
    .opt-half {
      flex: 2.5;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .start-wrapper {
      flex: 3.5;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .opt-icon {
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      background: var(--card-bg-color);
      color: var(--text-color);
      font-size: 15px;
      &.disable {
        color: var(--border-color);
        cursor: not-allowed;
      }
    }
  }
  .game-icon {
    cursor: pointer;
    padding: 8px 16px;
    font-size: 14px;
    font-weight: bold;
    white-space: nowrap;
    background: var(--primary-bg);
    color: #fff;
    border: 0 none;
    border-radius: 8px;
    &.again {
      margin-top: 6px;
    }
  }
  .game-area {
    position: relative;
    width: calc(100% - 32px);
    max-width: 440px;
    box-sizing: border-box;
  }
  .board-frame {
    box-sizing: border-box;
    border: 2px solid var(--sudoku-strong);
    border-radius: 10px;
    background: var(--sudoku-strong);
    overflow: hidden;
  }
  .board {
    display: grid;
    grid-template-columns: repeat(9, 1fr);
    grid-auto-rows: 1fr;
    aspect-ratio: 1;
    background: var(--card-bg-color);
  }
  .cell {
    box-sizing: border-box;
    border-style: solid;
    border-color: var(--sudoku-line);
    background: var(--card-bg-color);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    position: relative;
    user-select: none;
    // 新局整盘重挂载（key 带 gameId），借入场动画逐格弹出
    animation: cell-pop 0.28s ease backwards;
    .num {
      font-size: var(--fs);
      line-height: 1;
      font-weight: 500;
      color: var(--primary-bg);
      font-variant-numeric: tabular-nums;
    }
    .notes {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      grid-template-rows: repeat(3, 1fr);
      width: 100%;
      height: 100%;
      align-items: center;
      justify-items: center;
      .note {
        font-size: var(--nfs);
        line-height: 1;
        color: var(--text-color);
        opacity: 0;
      }
      .note.has {
        opacity: 0.62;
      }
    }
    &.fixed {
      cursor: default;
      .num {
        font-weight: 700;
        color: var(--text-color);
      }
    }
    &.hl {
      background: var(--key-bg);
    }
    &.same {
      background: var(--enter-bg);
    }
    &.sel {
      background: var(--enter-bg);
      box-shadow: inset 0 0 0 2px var(--primary-bg);
      .num {
        color: var(--primary-bg);
        font-weight: 700;
      }
    }
    // 填错的格子要红：置于 .sel/.same 之后，选中态也不能被绿色覆盖
    &.err {
      background: var(--del-bg);
      .num {
        color: var(--del-color);
        font-weight: 700;
      }
      &.sel {
        box-shadow: inset 0 0 0 2px var(--del-color);
      }
    }
  }
  .pad {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 16px 0 20px;
    padding: 10px;
    .keys {
      display: flex;
      gap: 6px;
      .key {
        position: relative;
        flex: 1;
        height: 42px;
        box-sizing: border-box;
        padding: 0;
        font-size: 18px;
        font-weight: bold;
        border: 0 none;
        border-radius: 8px;
        background: var(--key-bg);
        color: var(--text-color);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        font-variant-numeric: tabular-nums;
        .badge {
          position: absolute;
          top: 1px;
          right: 3px;
          font-size: 9px;
          font-weight: 700;
          line-height: 1;
          color: var(--text-color);
          opacity: 0.5;
        }
        &:active {
          background: var(--key-active-bg);
        }
        // 数字放满 9 个后置灰：仍允许“再点一次已填数字 = 清格”
        &.used:not(.on) {
          opacity: 0.35;
          cursor: not-allowed;
          &:active {
            background: var(--key-bg);
          }
        }
        &.on {
          background: var(--primary-bg);
          color: #fff;
          .badge {
            color: #fff;
            opacity: 0.9;
          }
        }
      }
    }
    .tools {
      display: flex;
      gap: 6px;
      .tool {
        flex: 1;
        height: 38px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        padding: 0;
        font-size: 14px;
        font-weight: 600;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        background: var(--card-bg-color);
        color: var(--text-color);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        i {
          font-size: 17px;
        }
        &:active {
          background: var(--key-active-bg);
        }
        &.active {
          background: var(--enter-bg);
          border-color: var(--primary-bg);
          color: var(--primary-bg);
        }
      }
    }
  }
  .result {
    position: absolute;
    width: 100%;
    height: 100%;
    left: 0;
    top: 0;
    z-index: 2;
    border-radius: var(--card-radius);
    background: var(--mask-color);
    color: var(--win-color);
    font-weight: bold;
    font-size: 18px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    &.lose {
      color: var(--lose-color);
    }
    .new-best {
      color: var(--primary-bg);
      font-size: 15px;
    }
  }
  .win-pop-enter-active {
    transition: opacity 0.28s ease;
    > * {
      animation: cell-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
  }
  .win-pop-leave-active {
    transition: opacity 0.2s ease;
  }
  .win-pop-enter-from,
  .win-pop-leave-to {
    opacity: 0;
  }
}
</style>
