<template>
  <div class="wrapper">
    <TopHeader @onScoreReset="onScoreReset" />
    <!-- 隐藏的计时器：只用来驱动倒计时与每秒落档，数字显示在统计条里 -->
    <CountTimer
      ref="timerRef"
      :show="false"
      :enable="phase === PLAY"
      :onTick="onTick"
    />
    <div class="card score-area">
      <div class="stat">
        <span class="stat-label">{{ i18n('level') }}</span>
        <span class="stat-value">{{ level }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('time') }}</span>
        <span class="stat-value">{{ clock }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('left') }}</span>
        <span class="stat-value">{{ pairsLeft }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('best') }}</span>
        <span class="stat-value">{{ best || '--' }}</span>
      </div>
    </div>
    <div class="card opt-area">
      <div class="opt-half">
        <span class="board-info">{{ conf.rows }}×{{ conf.cols }} · {{ conf.kinds }} {{ i18n('kindsUnit') }}</span>
      </div>
      <div class="divider"></div>
      <div class="start-wrapper">
        <button @click="confirming = true" class="game-icon">{{ i18n('start') }}</button>
      </div>
    </div>
    <div class="game-area">
      <div ref="boardEl" class="board dot-board" :style="boardStyle" @pointerdown="onPointerDown">
        <div
          v-for="t in tiles"
          :key="t.id"
          class="tile"
          :class="{ dragging: isDragging(t), popping: t.popping, shaking: shakeKind === t.kind, shuffling }"
          :style="tileStyle(t)"
        >
          <span class="tile-body">{{ GLYPHS[(t.kind - 1) % GLYPHS.length] }}</span>
        </div>
        <div v-if="shuffling" class="shuffle-tip">{{ i18n('shuffled') }}</div>
      </div>
      <div v-if="phase === WON" class="result win">
        <div class="result-title">🎉 {{ i18n('tipWin') }} 🎉</div>
        <div class="result-line">{{ i18n('time') }} {{ clock }}</div>
        <div class="result-actions">
          <button class="game-icon" @click="startLevel(level)">{{ i18n('retry') }}</button>
          <button class="game-icon primary" @click="startLevel(level + 1)">{{ i18n('next') }}</button>
        </div>
      </div>
      <div v-else-if="phase === OVER" class="result lose">
        <div class="result-title">⏰ {{ i18n('tipOver') }} ⏰</div>
        <div class="result-line">{{ i18n('left') }} {{ pairsLeft }}</div>
        <button class="game-icon primary" @click="startLevel(level)">{{ i18n('retry') }}</button>
      </div>
    </div>
    <ConfirmDialog :show="confirming" @confirm="startNewGame" @cancel="confirming = false" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';

import TopHeader from '@/components/TopHeader.vue';
import CountTimer from '@/shared/CountTimer.vue';
import ConfirmDialog from '@/shared/ConfirmDialog.vue';
import confetti from '@/shared/confetti';
import { i18n } from '@/shared/i18n';
import {
  levelConfig, makeBoard, clone, findPartner, slideParams, shiftGroup,
  hasAnyMove, reshuffleBoard,
} from './board';

const [PLAY, WON, OVER] = ['play', 'won', 'over'];
const KEY_PREFIX = '__emoji_slide__';
const BEST_KEY = `${KEY_PREFIX}best_1`;
const STATE_KEY = `${KEY_PREFIX}state`;

// 与棋盘点阵底纹、格子尺寸相关的常量
const MAX_CELL = 56;    // 小棋盘（6×6）时别撑得太满
const GAP = 3;          // 每格之间的缝
const TAP_SLOP = 8;     // 位移小于它就当成「点击」而不是拖动
const POP_MS = 280;     // 炸开动画时长（CSS 里的 tile-pop 要同步）
const SHAKE_MS = 620;   // 同款晃动提示时长（CSS 里的 tile-shake 要同步）
const SHUFFLE_MS = 1000; // 死局重排的提示时长（CSS 里的 tile-reshuffle 要同步）
const GLYPHS = ['🍎', '🍋', '🍇', '🥝', '🫐', '🍑', '🥕', '🍄'];

const phase = ref(PLAY);
const level = ref(1);
const best = ref(+(localStorage.getItem(BEST_KEY) || 0));
const conf = ref(levelConfig(1));
const tiles = ref([]);          // [{ id, kind, r, c, popping }]
const elapsed = ref(0);
const shakeKind = ref(0);
const shuffling = ref(false);   // 死局重排中（所有牌播打乱动画 + 顶部提示）
const confirming = ref(false);

const boardEl = ref(null);
const timerRef = ref(null);
let tileId = 0;
let shakeTimer = null;
let shuffleTimer = null;
let generation = 0;             // 换局时 +1，异步动画据此收手

// 拖拽状态：用普通对象存（不进响应式），逐帧只改 shift 一个数
const drag = ref(null);

const cell = computed(() => {
  const availW = Math.min(window.innerWidth || 420, 440) - 32;
  const availH = Math.max(200, (window.innerHeight || 700) - 262);
  const { rows, cols } = conf.value;
  return Math.max(14, Math.floor(Math.min(availW / cols, availH / rows, MAX_CELL)));
});
const boardStyle = computed(() => {
  const c = cell.value;
  return {
    width: `${c * conf.value.cols}px`,
    height: `${c * conf.value.rows}px`,
    '--cell': `${c}px`,
    '--tile': `${c - GAP}px`,
    '--font': `${Math.round((c - GAP) * 0.64)}px`,
  };
});
const remaining = computed(() => Math.max(0, conf.value.seconds - elapsed.value));
const clock = computed(() => {
  const s = remaining.value;
  return ('00' + ~~(s / 60)).slice(-2) + ':' + ('00' + s % 60).slice(-2);
});
const pairsLeft = computed(() => tiles.value.filter(t => !t.popping).length / 2);

// 逻辑用棋盘：炸着的牌已经算消掉了（空格才能当通道）
const grid = computed(() => {
  const g = Array.from({ length: conf.value.rows }, () => Array(conf.value.cols).fill(0));
  for (const t of tiles.value) if (!t.popping) g[t.r][t.c] = t.kind;
  return g;
});

function tileAt(r, c, list = tiles.value) {
  return list.find(t => t.r === r && t.c === c && !t.popping) || null;
}

function tileStyle(t) {
  const c = cell.value;
  let dr = 0;
  let dc = 0;
  const d = drag.value;
  if (d && d.axis && d.groupIds.has(t.id)) {
    dr = d.dir.r * d.shift;
    dc = d.dir.c * d.shift;
  }
  return {
    width: `${c}px`,
    height: `${c}px`,
    // 自己的格子坐标 + 拖动偏移（两者都以格为单位）
    transform: `translate3d(${((t.c + dc) * c).toFixed(2)}px, ${((t.r + dr) * c).toFixed(2)}px, 0)`,
    // 重排动画的错峰序号（左上先动）
    '--shuffle-i': (t.r + t.c) % 10,
  };
}

// 拖动中的那一组要关掉过渡（1:1 跟手），松手后再打开（落位 / 弹回才有动画）
function isDragging(t) {
  const d = drag.value;
  return !!(d && d.axis && d.groupIds.has(t.id) && d.shift > 0);
}

// ---------- 关卡流程 ----------

function startLevel(lv, restored = null) {
  generation += 1;
  clearTimeout(shakeTimer);
  shakeKind.value = 0;
  drag.value = null;
  level.value = Math.max(1, lv);
  conf.value = levelConfig(level.value);
  if (restored) {
    tiles.value = restored.tiles;
    elapsed.value = restored.elapsed;
  } else {
    const g = makeBoard(conf.value.rows, conf.value.cols, conf.value.kinds);
    tiles.value = [];
    for (let r = 0; r < conf.value.rows; r++) {
      for (let c = 0; c < conf.value.cols; c++) {
        tiles.value.push({ id: ++tileId, kind: g[r][c], r, c, popping: false });
      }
    }
    elapsed.value = 0;
  }
  phase.value = PLAY;
  timerRef.value?.reset();
  if (elapsed.value) timerRef.value?.restore(elapsed.value);
  save();
  if (!restored) return;
  // 还原的局面可能是死局（比如存档正好停在卡死的一步上）→ 下一帧再查，等牌先渲染出来
  requestAnimationFrame(() => checkDeadlock());
}

function startNewGame() {
  confirming.value = false;
  best.value = +(localStorage.getItem(BEST_KEY) || 0);
  startLevel(1);
}

function onTick(sec) {
  if (phase.value !== PLAY) return;
  elapsed.value = sec;
  if (remaining.value <= 0) lose();
  else save();
}

function win() {
  if (phase.value !== PLAY) return;
  phase.value = WON;
  timerRef.value?.stop();
  if (level.value + 1 > best.value) {
    best.value = level.value + 1;
    localStorage.setItem(BEST_KEY, best.value);
  }
  confetti();
  save();
}

function lose() {
  if (phase.value !== PLAY) return;
  phase.value = OVER;
  timerRef.value?.stop();
  save();
}

// ---------- 消除 ----------

function eliminate(a, b) {
  const list = [tileAt(a[0], a[1]), tileAt(b[0], b[1])];
  if (list.some(t => !t)) return;
  const g = generation;
  list.forEach(t => { t.popping = true; });
  setTimeout(() => {
    if (g !== generation) return;
    const ids = new Set(list.map(t => t.id));
    tiles.value = tiles.value.filter(t => !ids.has(t.id));
    if (!tiles.value.length) win();
    else {
      save();
      checkDeadlock();   // 消完这一对之后没得走了就重排
    }
  }, POP_MS);
}

// 把一份盘面同步到 tiles 上：
// - 洗完之后每张牌原来的格子还都有牌（只换了种类）→ 原地换 emoji，保留牌的身份，动画最自然
// - 否则说明兜底那层挪了位置（只剩最后一对时就是这种情况）→ 按新盘面重建
function applyGrid(next) {
  const alive = tiles.value.filter(t => !t.popping);
  const inPlace = alive.length > 0 && alive.every(t => next[t.r][t.c]);
  if (inPlace) {
    alive.forEach(t => { t.kind = next[t.r][t.c]; });
    return;
  }
  const list = [];
  for (let r = 0; r < conf.value.rows; r++) {
    for (let c = 0; c < conf.value.cols; c++) {
      if (next[r][c]) list.push({ id: ++tileId, kind: next[r][c], r, c, popping: false });
    }
  }
  tiles.value = list;
}

// 死局检测：一点能消的对、一步能凑成对的滑动都没有 → 重排剩下的 emoji
// （先只换种类，不行再挪位置；reshuffleBoard 保证洗完一定有解）
function checkDeadlock() {
  if (phase.value !== PLAY || !tiles.value.length) return;
  if (hasAnyMove(grid.value)) return;
  applyGrid(reshuffleBoard(grid.value));
  save();
  shuffling.value = true;
  clearTimeout(shuffleTimer);
  shuffleTimer = setTimeout(() => { shuffling.value = false; }, SHUFFLE_MS);
}

// 点一下：上下左右有同款就消这一对，没有就让所有同款晃一下
function tapTile(r, c) {
  const t = tileAt(r, c);
  if (!t || phase.value !== PLAY) return;
  const partner = findPartner(grid.value, r, c);
  if (partner) {
    eliminate([r, c], partner);
    return;
  }
  shakeKind.value = t.kind;
  clearTimeout(shakeTimer);
  shakeTimer = setTimeout(() => { shakeKind.value = 0; }, SHAKE_MS);
}

// ---------- 拖拽 ----------

function cellAt(clientX, clientY) {
  const rect = boardEl.value?.getBoundingClientRect();
  if (!rect) return null;
  const c = Math.floor((clientX - rect.left) / cell.value);
  const r = Math.floor((clientY - rect.top) / cell.value);
  if (r < 0 || r >= conf.value.rows || c < 0 || c >= conf.value.cols) return null;
  return { r, c };
}

function onPointerDown(e) {
  if (phase.value !== PLAY) return;
  const at = cellAt(e.clientX, e.clientY);
  if (!at) return;
  const t = tileAt(at.r, at.c);
  if (!t) return;
  e.preventDefault();
  drag.value = {
    id: t.id, r: at.r, c: at.c,
    startX: e.clientX, startY: e.clientY,
    axis: null, sign: 1, dir: null, shift: 0, maxShift: 0,
    groupIds: new Set([t.id]), groupCells: [[at.r, at.c]],
  };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
}

function onPointerMove(e) {
  const d = drag.value;
  if (!d) return;
  const dx = e.clientX - d.startX;
  const dy = e.clientY - d.startY;
  if (!d.axis) {
    if (Math.hypot(dx, dy) < TAP_SLOP) return;
    d.axis = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
    d.sign = (d.axis === 'h' ? dx : dy) >= 0 ? 1 : -1;
    d.dir = d.axis === 'h' ? { r: 0, c: d.sign } : { r: d.sign, c: 0 };
    // 方向一旦定下来就锁住：这一组 = 自己 + 该方向上所有 emoji，能滑多远看前面的空格
    const info = slideParams(grid.value, d.r, d.c, d.dir.r, d.dir.c);
    d.maxShift = info?.maxShift ?? 0;
    d.groupCells = info?.cells ?? [[d.r, d.c]];
    d.groupIds = new Set(
      d.groupCells.map(([r, c]) => tileAt(r, c)?.id).filter(id => id !== undefined),
    );
  }
  const along = (d.axis === 'h' ? dx : dy) * d.sign;
  d.shift = Math.min(d.maxShift, Math.max(0, along / cell.value));   // 跟手（可以是小数）
}

function onPointerUp() {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerUp);
  const d = drag.value;
  drag.value = null;                 // 先把整组还原成格子坐标：没提交就是弹回原位
  if (!d || phase.value !== PLAY) return;
  if (!d.axis) { tapTile(d.r, d.c); return; }
  const k = Math.round(d.shift);
  if (k < 1) return;                 // 没滑出去一整格，什么都不做
  const nr = d.r + d.dir.r * k;
  const nc = d.c + d.dir.c * k;
  const next = shiftGroup(grid.value, d.groupCells, d.dir.r, d.dir.c, k);
  const partner = findPartner(next, nr, nc);
  // 落点四周没有同款 → 不提交（上面已经把 drag 清掉，就是弹回原位）
  if (!partner) return;
  // 提交：这一组落到滑过去的位置，其余 emoji 留在原地
  const snapshot = d.groupCells.map(([r, c]) => tileAt(r, c)).filter(Boolean);
  snapshot.forEach(t => {
    t.r += d.dir.r * k;
    t.c += d.dir.c * k;
  });
  eliminate([nr, nc], partner);
}

onMounted(() => {
  if (!restore()) startLevel(1);
});

onUnmounted(() => {
  generation += 1;
  clearTimeout(shakeTimer);
  clearTimeout(shuffleTimer);
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerUp);
});

// ---------- 存档 ----------

function save() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({
      level: level.value,
      phase: phase.value,
      elapsed: elapsed.value,
      tiles: tiles.value.filter(t => !t.popping).map(t => [t.kind, t.r, t.c]),
    }));
  } catch { /* 隐私模式等写不进去的场景忽略 */ }
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY));
    if (!saved || !Array.isArray(saved.tiles) || !saved.tiles.length) return false;
    if (saved.phase !== PLAY && saved.phase !== WON && saved.phase !== OVER) return false;
    const lv = Math.max(1, +saved.level || 1);
    const cfg = levelConfig(lv);
    if (saved.tiles.length > cfg.rows * cfg.cols) return false;
    // 只还原「本关还没打完」的局面；已过关的存档直接推进到下一关重开
    if (saved.phase === WON) {
      level.value = lv;
      best.value = +(localStorage.getItem(BEST_KEY) || 0);
      startLevel(lv + 1);
      return true;
    }
    startLevel(lv, {
      tiles: saved.tiles.map(([kind, r, c]) => ({ id: ++tileId, kind, r, c, popping: false })),
      elapsed: Math.max(0, +saved.elapsed || 0),
    });
    phase.value = saved.phase === OVER ? OVER : PLAY;
    if (phase.value === OVER) timerRef.value?.stop();
    return true;
  } catch {
    return false;
  }
}

function onScoreReset() {
  localStorage.removeItem(BEST_KEY);
  localStorage.removeItem(STATE_KEY);
  best.value = 0;
  startLevel(1);
}
</script>

<style scoped lang="scss">
@keyframes tile-pop {
  0% { transform: scale(1); opacity: 1; }
  35% { transform: scale(1.16); opacity: 1; }
  100% { transform: scale(0.12) rotate(30deg); opacity: 0; }
}

@keyframes tile-shake {
  0%, 100% { transform: translateX(0) rotate(0); }
  18% { transform: translateX(-14%) rotate(-7deg); }
  38% { transform: translateX(14%) rotate(7deg); }
  58% { transform: translateX(-10%) rotate(-5deg); }
  78% { transform: translateX(8%) rotate(4deg); }
}

@keyframes tile-reshuffle {
  0% { transform: scale(1) rotate(0); opacity: 1; }
  35% { transform: scale(0.7) rotate(-14deg); opacity: 0.3; }
  70% { transform: scale(1.14) rotate(9deg); opacity: 1; }
  100% { transform: scale(1) rotate(0); }
}

@keyframes pop-ring {
  0% { transform: scale(0.6); opacity: 0.9; }
  100% { transform: scale(2.1); opacity: 0; }
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
    height: var(--row-height);
    padding: 0 8px;
    .stat {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      .stat-label { font-size: 12px; opacity: 0.75; white-space: nowrap; }
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
    margin: var(--row-gap) 0;
    height: var(--row-height);
    .opt-half {
      flex: 1.6;
      display: flex;
      align-items: center;
      justify-content: center;
      .board-info {
        font-size: 16px;
        font-weight: bold;
        white-space: nowrap;
      }
    }
    .start-wrapper {
      flex: 1.2;
      display: flex;
      align-items: center;
      justify-content: center;
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
    border-radius: var(--radius-tile);
  }
  .game-area {
    position: relative;
    width: fit-content;
    max-width: calc(100% - 32px);
    margin: 0 auto;
    box-sizing: border-box;
  }
  .board {
    position: relative;
    border-radius: var(--card-radius);
    // 拖动是主要操作，禁掉棋盘上的滚动 / 缩放手势
    touch-action: none;
    overflow: hidden;
  }
  // 每张牌绝对定位，位置全靠 transform 走：拖动时关掉过渡（1:1 跟手），
  // 松手后再打开，落位与弹回都带一点回弹
  .tile {
    position: absolute;
    left: 0;
    top: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.26s cubic-bezier(0.34, 1.4, 0.64, 1);
    will-change: transform;
    &.dragging {
      transition: none;
      z-index: 3;
    }
    &.popping {
      z-index: 2;
      pointer-events: none;
    }
    &.shaking .tile-body {
      animation: tile-shake 0.62s ease-in-out;
    }
    // 死局重排：所有牌错峰播一遍翻转动画（延迟按格子位置错开，看起来像洗牌）
    &.shuffling .tile-body {
      animation: tile-reshuffle 0.55s ease-in-out both;
      animation-delay: calc(var(--shuffle-i, 0) * 22ms);
    }
  }
  .tile-body {
    width: var(--tile);
    height: var(--tile);
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-tile);
    border: 1px solid var(--tile-border-color);
    background: var(--card-bg-color);
    box-shadow: var(--shadow-soft);
    font-size: var(--font);
    line-height: 1;
    .popping & {
      animation: tile-pop 0.28s ease-in forwards;
    }
  }
  .tile.popping .tile-body::after {
    content: '';
    position: absolute;
    width: var(--tile);
    height: var(--tile);
    border-radius: 50%;
    background: var(--win-color);
    animation: pop-ring 0.28s ease-out forwards;
  }
  // 死局重排的提示：棋盘正中浮一下
  .shuffle-tip {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 3;
    padding: 6px 14px;
    border-radius: var(--radius-tile);
    background: var(--card-bg-color);
    color: var(--text-color);
    border: 1px solid var(--border-color);
    box-shadow: var(--card-shadow);
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    pointer-events: none;
  }
  .result {
    position: absolute;
    inset: 0;
    z-index: 4;
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
    padding: 12px;
    box-sizing: border-box;
    &.lose { color: var(--lose-color); }
    .result-line {
      font-size: 15px;
      font-variant-numeric: tabular-nums;
    }
    .result-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      justify-content: center;
    }
  }
}
</style>
