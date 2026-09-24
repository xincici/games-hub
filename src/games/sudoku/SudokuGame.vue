<template>
  <div class="wrapper">
    <TopHeader @onScoreReset="onScoreReset">
      <!-- 候选按钮的行为开关：关 = 逐个点格填（按钮是开关）；开 = 按一下填满全盘 -->
      <span class="item-wrapper" :title="i18n('candAllTip')" @click="toggleCandAll">
        <i v-if="candAll" i-mdi-select-all />
        <i v-else i-mdi-gesture-tap />
      </span>
    </TopHeader>
    <div class="card score-area">
      <div class="stat">
        <span class="stat-label">{{ i18n('bestScore') }}</span>
        <span class="stat-value">{{ bestTime ? fmt(bestTime) : '--:--' }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('hearts') }}</span>
        <span class="stat-value stat-hearts"><Hearts :left="hearts" :max="heartsMax" /></span>
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
        <div class="board" :class="{ revealing }">
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
              <!-- has = 这一格标了这个候选；hl = 与盘面上点中的数字相同（任何空格里的同数字笔记都一起高亮） -->
              <span
                v-for="d in NUMS"
                :key="d"
                class="note"
                :class="{ has: cell.notes & (1 << d), hl: (cell.notes & (1 << d)) !== 0 && hlDigit === d }"
              >{{ d }}</span>
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
        <button class="tool" :class="{ active: candMode }" @click="onCandButton">
          <i i-mdi-format-list-numbered />{{ i18n('candidates') }}
        </button>
        <button class="tool" :class="{ active: notesMode }" @click="toggleNotesMode">
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
import CountTimer from '@/shared/CountTimer.vue';
import Hearts from '@/shared/Hearts.vue';
import confetti from '@/shared/confetti';
import { i18n } from '@/shared/i18n';
import { generatePuzzle } from './sudoku';

const NUMS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
// 笔记用 1 << d 当位掩码（d = 1..9），所以数字 9 落在 bit 9 = 512 上：
// 掩码至少要 (1 << 10) - 1。这里踩过坑 —— 原来写 511（只盖 bit 0~8），
// 还原存档时会把 9 的笔记整位丢掉，只剩「候选=9」的格子会整格清空
const NOTES_MASK = (1 << (NUMS.length + 1)) - 1;
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
const CAND_ALL_KEY = `${KEY_PREFIX}cand_all`;   // 候选按钮的行为：1 = 一键填全盘

const difficulty = ref(initDifficulty());
const cells = ref([]);
const selected = ref(-1);
const notesMode = ref(false);
const candMode = ref(false);   // 候选模式：点空白格一次性填入该格所有可用候选
const candAll = ref(localStorage.getItem(CAND_ALL_KEY) === '1');   // 按下候选按钮就填满全盘
const phase = ref(PLAY);
const newBest = ref(false);
const bestTime = ref(0);
const gameId = ref(0);
const timerRef = ref(null);
// 开局/恢复时的逐格入场动画窗口（窗口结束后再落数字不再延迟）
const revealing = ref(false);
let revealTimer = null;
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
// 盘面上点中的那个数字（题面格与自己填的都算）：同数字的格子 + 其它空格里相同的笔记一起高亮
const hlDigit = computed(() => {
  const s = selected.value;
  return s >= 0 ? cells.value[s]?.v || 0 : 0;
});
// 某一格的可用候选：排除同行、同列、同宫已经出现的数字（题面与自己填的都算）
function candidatesFor(i) {
  const r = (i / 9) | 0;
  const c = i % 9;
  const br = ((r / 3) | 0) * 3;
  const bc = ((c / 3) | 0) * 3;
  const used = new Set();
  for (let k = 0; k < 9; k++) {
    used.add(cells.value[r * 9 + k].v);
    used.add(cells.value[k * 9 + c].v);
    used.add(cells.value[(br + ((k / 3) | 0)) * 9 + (bc + (k % 3))].v);
  }
  let mask = 0;
  for (const d of NUMS) {
    if (used.has(d) || digitLeft.value[d] <= 0) continue;
    mask |= 1 << d;
  }
  return mask;
}
// 按下「候选」：开关关着当模式用（再点格子逐个填），开着就直接把全盘空格填满
function onCandButton() {
  if (candAll.value) {
    fillAllCandidates();
    return;
  }
  toggleCandMode();
}

// 给所有空白格写入各自可用候选（已填数字的格跳过；重复按按当前盘面刷新）
function fillAllCandidates() {
  if (phase.value !== PLAY) return;
  let touched = 0;
  cells.value.forEach((c, i) => {
    if (c.fixed || c.v) return;
    c.notes = candidatesFor(i);
    touched++;
  });
  if (touched) saveState();
}

function toggleCandAll() {
  candAll.value = !candAll.value;
  localStorage.setItem(CAND_ALL_KEY, candAll.value ? '1' : '0');
  // 切到「一键填全盘」时把逐个填的模式收掉，免得两种语义叠着
  if (candAll.value) candMode.value = false;
}

// 候选与笔记是同一块地盘上的两种输入方式，同时开着容易混，所以互斥
function toggleCandMode() {
  candMode.value = !candMode.value;
  if (candMode.value) notesMode.value = false;
}
function toggleNotesMode() {
  notesMode.value = !notesMode.value;
  if (notesMode.value) candMode.value = false;
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
  clearTimeout(revealTimer);
  clearTimeout(winTimer);
  window.removeEventListener('keyup', onKeyUp);
});

// 逐格入场：按「行优先 + 列错开」的节奏给出延迟（最多约 0.3s），
// 窗口结束后清掉标记，之后手动填数不再走这套延迟
const REVEAL_MS = 1000;
function revealBoard() {
  clearTimeout(revealTimer);
  revealing.value = true;
  revealTimer = setTimeout(() => { revealing.value = false; }, REVEAL_MS);
}

function revealDelay(i) {
  const r = (i / 9) | 0;
  const c = i % 9;
  return r * 26 + c * 14;
}

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
  candMode.value = false;
  phase.value = PLAY;
  newBest.value = false;
  bestTime.value = +(localStorage.getItem(bestKey()) || 0);
  gameId.value++;
  revealBoard();
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
      const notes = fixed ? 0 : (+t[2] || 0) & NOTES_MASK;
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
    candMode.value = false;
    phase.value = PLAY;
    newBest.value = false;
    bestTime.value = +(localStorage.getItem(bestKey()) || 0);
    gameId.value++;
    revealBoard();   // 恢复存档也逐格渲染
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
    ...(revealing.value ? { '--reveal-delay': `${revealDelay(i)}ms` } : null),
  };
}

// 正确填入 d 之后，同行 / 同列 / 同宫里其它空格的候选里不该再留着 d
function pruneNotes(i, d) {
  const r = (i / 9) | 0;
  const c = i % 9;
  const br = ((r / 3) | 0) * 3;
  const bc = ((c / 3) | 0) * 3;
  const bit = 1 << d;
  let touched = false;
  const clear = j => {
    const cell = cells.value[j];
    if (!cell || cell.fixed || cell.v || !(cell.notes & bit)) return;
    cell.notes &= ~bit;
    touched = true;
  };
  for (let k = 0; k < 9; k++) {
    clear(r * 9 + k);                                  // 行
    clear(k * 9 + c);                                  // 列
    clear((br + ((k / 3) | 0)) * 9 + (bc + (k % 3)));  // 宫
  }
  return touched;
}

// ---------- 交互 ----------

function onCellClick(i) {
  if (phase.value !== PLAY) return;
  const cell = cells.value[i];
  // 候选模式：点空白格就填入该格全部可用候选（重复点按当前盘面刷新，不是叠加）
  if (candMode.value && !cell.fixed && !cell.v) {
    cell.notes = candidatesFor(i);
    selected.value = i;
    saveState();
    return;
  }
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
  // 填对了才顺手清候选（填错时那个数字其实没落位，留着候选是对的）
  if (phase.value === PLAY && !isWrong(s) && pruneNotes(s, d)) saveState();
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

// 刚填入的数字若与答案不符：扣一颗心，扣掉最后一颗心的那次就失败。
// 于是 简单（1 颗）错一次就结束、一般（2 颗）两次、困难（3 颗）三次
function checkMistake(i) {
  if (!isWrong(i)) return;
  hearts.value = Math.max(0, hearts.value - 1);
  if (hearts.value <= 0) lose();
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

// 数字（题面格与已填格）随格子逐一弹出，而不是整盘同时出现
@keyframes num-pop {
  from {
    opacity: 0;
    transform: scale(0.3);
  }
  60% {
    opacity: 1;
    transform: scale(1.12);
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
    margin-top: 64px;
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
        color: var(--muted-color);
      }
      .stat-value {
        font-size: 22px;
        font-weight: bold;
        line-height: 1.2;
        font-variant-numeric: tabular-nums;
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
      position: relative;
      width: 28px;
      height: 28px;
      padding: 0;
      // 视觉上仍是 28px 小方块，用伪元素把点击热区扩到 44×44（不占布局）
      &::after {
        content: "";
        position: absolute;
        inset: -8px;
      }
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
    border-radius: var(--radius-tile);
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
      // 与盘面上点中的数字相同的候选：底色块 + 白字，一眼看出这个数字还能放哪
      .note.has.hl {
        opacity: 1;
        color: #fff;
        font-weight: 700;
        background: var(--primary-bg);
        border-radius: 2px;
        padding: 0 2px;
        // 让色块比字号略高一点，数字不至于贴边
        line-height: 1.35;
      }
    }
    &.fixed {
      cursor: default;
      .num {
        font-weight: 700;
        color: var(--text-color);
      }
    }
    // 同行 / 同列 / 同宫：最淡的一档
    &.hl {
      background: var(--sudoku-hl-bg);
      // 高亮底上的数字一律用实心字色：主色绿压在浅绿 / 浅蓝底上只有 3:1 出头，
      // 和底色太接近。换成 --text-color 后浅色主题 7.4:1、深色主题也够看
      .num {
        color: var(--text-color);
        font-weight: 700;
      }
    }
    // 与点中的数字相同：更实的一档，数字也加粗 + 实心字色（原来绿压绿只有 3.1:1）
    &.same {
      background: var(--sudoku-same-bg);
      .num {
        color: var(--text-color);
        font-weight: 700;
      }
    }
    // 选中格：最深的一档 + 主色描边，主角位
    &.sel {
      background: var(--sudoku-sel-bg);
      box-shadow: inset 0 0 0 2px var(--primary-bg);
      // 底色加深后不能再用主色绿写字（绿压绿发闷），改用实心字色：浅色主题是深字、深色主题是白字
      .num {
        color: var(--text-color);
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
  // 开局/恢复的逐格入场：格子与数字都按 --reveal-delay（由 cellStyle 内联给出）依次出现
  .board.revealing .cell {
    animation-delay: var(--reveal-delay, 0ms);
  }
  .board.revealing .cell .num {
    animation: num-pop 0.26s ease backwards;
    animation-delay: var(--reveal-delay, 0ms);
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
          font-size: 10px;
          font-weight: 700;
          line-height: 1;
          color: var(--text-color);
          opacity: 0.75;
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
            opacity: 1;
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
