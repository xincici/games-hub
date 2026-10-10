<script setup>
// 麻将传奇：8×6 的游戏区，底部一行行升起条牌；消掉牌就不会升行，没消掉就升一行并把整盘往上顶一格。
// 只用条牌（1条~9条），牌面复用共享雪碧图（MahjongTile 的 suit="s"）。
import { ref, computed, reactive, nextTick, onMounted, onUnmounted } from 'vue';
import TopHeader from '@/components/TopHeader.vue';
import MahjongTile from '@/games/mahjong/MahjongTile.vue';
import { i18n } from '@/shared/i18n';
import { burstConfetti } from '@/shared/confetti';
import { preloadTiles, TILE_RATIO } from '@/shared/mahjongTiles';
import {
  COLS, ROWS, PREVIEW, CELLS, CLEAR_MS, FALL_MS, SPAWN_MS,
  multiBonus, chainBonus, emptyGrid, settle, placeTile, replaceTile,
  findGroups, clearGroups, spawnRow, initialGrid, makeTile, resetUid, randomKind, randomRow,
  suitOf, faceOf, MAX_VALUE,
} from './board';

const PLAY = 'play';
const OVER = 'over';
const STATE_KEY = '__mahjong_legend__state';
const BEST_KEY = '__mahjong_legend__best_1';
const GAP = 4;
const randKind = () => randomKind();          // 条牌 + 少量字牌（见 board.js 的 HONOR_RATE）
const FLY_MS = 210;                  // 浮牌从候选区飞到目标格的时长（与麻将英雄一致）
const DEAL_MS = 340;                 // 单张牌入场动画时长（波浪）

// ---------- 状态 ----------
const phase = ref(PLAY);
const grid = ref(emptyGrid());
const queue = ref([]);                 // 当前待出的牌 + 后面两张
const score = ref(0);
const best = ref(+(localStorage.getItem(BEST_KEY) || 0));
const clearedCount = ref(0);
const busy = ref(false);               // 动画/结算期间不收操作
const clearing = ref(new Map());       // 消除浮影层：id → { id, v, row, col }
const popped = reactive(new Set());    // 替换时的小弹出动画
const fromRow = reactive(new Map());   // id → 动画起始行（落子从点击那一行落下 / 新一行从棋盘下方升起）
const dealing = ref(false);            // 开局 / 恢复时棋盘逐张铺开（左上 → 右下的波浪）
const dealSeq = ref(0);
const float = ref(null);               // 得分浮字（带 id：连击时元素重建，弹出动画才会重播）
const celebrating = ref(false);        // 外圈闪光
let floatId = 0;
let shakeTimer = 0;
let flashTimer = 0;
const flying = ref(null);              // 从候选区飞向目标格的那张浮牌
const incomingId = ref(-1);            // 刚落位的那张牌：飞行途中先隐身，落定才显形
let flyTimer = 0;
const shaking = ref(false);
const isNewBest = ref(false);
const moveMs = ref(FALL_MS);           // 位移过渡时长（升行那一下稍长）

const timers = [];
const wait = ms => new Promise(res => { timers.push(setTimeout(res, ms)); });
const nextFrame = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
function clearTimers() { timers.forEach(clearTimeout); timers.length = 0; }

// ---------- 尺寸 ----------
const vw = ref(window.innerWidth);
const vh = ref(window.innerHeight);
const onResize = () => { vw.value = window.innerWidth; vh.value = window.innerHeight; };
// 8 行很高：高度预算要扣掉顶栏/统计卡（262）与下方候选区那一行（96）
const metrics = computed(() => {
  const byW = (Math.min(vw.value, 480) - 32 - GAP * (COLS - 1)) / COLS;
  const byH = (vh.value - 262 - 96 - GAP * (ROWS - 1)) / ROWS / TILE_RATIO;
  const cw = Math.max(24, Math.min(byW, byH, 92));
  return { cw: Math.round(cw), ch: Math.round(cw * TILE_RATIO), gap: GAP };
});
const boardVars = computed(() => {
  const { cw, ch, gap } = metrics.value;
  return {
    '--cw': `${cw}px`,
    '--ch': `${ch}px`,
    '--gap': `${gap}px`,
    '--move-ms': `${moveMs.value}ms`,
    width: `${COLS * cw + (COLS - 1) * gap}px`,
    height: `${ROWS * ch + (ROWS - 1) * gap}px`,
  };
});
const tileVars = computed(() => ({ '--mj-w': `${metrics.value.cw}px`, '--mj-h': `${metrics.value.ch}px` }));
// 候选区（与麻将英雄逐字同一套）：槽位给布局尺寸、牌面给 CSS 变量，后面两张靠 scale(0.8) 缩小
const HAND_W = 44;
const PREVIEW_SCALES = [0.8, 0.6];   // 后两张：第二张 0.8、第三张 0.6（用户指定）
const slotVars = { width: `${HAND_W}px`, height: `${Math.round(HAND_W * TILE_RATIO)}px` };
const handTileVars = { '--mj-w': `${HAND_W}px`, '--mj-h': `${Math.round(HAND_W * TILE_RATIO)}px` };
const stepX = computed(() => metrics.value.cw + metrics.value.gap);
const stepY = computed(() => metrics.value.ch + metrics.value.gap);
const posOf = (row, col) => ({ left: `${col * stepX.value}px`, top: `${row * stepY.value}px` });
const cellStyle = i => ({ left: `${(i % COLS) * stepX.value}px`, top: `${Math.floor(i / COLS) * stepY.value}px` });

// 棋盘上的牌（带行列，供模板定位）
const tiles = computed(() => {
  const out = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = grid.value[r][c];
      if (t) out.push({ id: t.id, v: t.v, row: r, col: c, from: fromRow.has(t.id) ? fromRow.get(t.id) : r });
    }
  }
  return out;
});
const clearingTiles = computed(() => [...clearing.value.values()]);

// 波浪式铺牌（照麻将英雄）：每张牌延迟 (行 + 列) × 60ms，波前从左上方扫到右下角。
// `dealSeq` 拼进 `:key` —— 不拼的话 newRun()/restore() 里 uid 从 1 重来、key 撞上，
// Vue 会复用元素、入场动画根本不重播（雀圣那边踩过同一个坑）。
const dealDelay = (row, col) => (row + col) * 60;
function startDeal() {
  dealing.value = true;
  dealSeq.value += 1;
  const last = (ROWS - 1 + COLS - 1) * 60 + DEAL_MS;
  timers.push(setTimeout(() => { dealing.value = false; }, last));
}

// ---------- 浮牌飞行（照麻将英雄：left/top 定在候选牌中心，靠 transform 平移到目标格并缩放） ----------
function flyTo(value, row, col, done) {
  const from = document.querySelector('.opt-area .tile-slot.current')?.getBoundingClientRect();
  const cell = document.querySelectorAll('.board .grid-cell')[row * COLS + col]?.getBoundingClientRect();
  if (!from || !cell) { done(); return; }
  const x = from.left + from.width / 2;
  const y = from.top + from.height / 2;
  flying.value = {
    v: value,
    x,
    y,
    dx: cell.left + cell.width / 2 - x,
    dy: cell.top + cell.height / 2 - y,
    scale: cell.width / Math.max(1, from.width),
    go: false,
  };
  nextTick(() => requestAnimationFrame(() => { if (flying.value) flying.value.go = true; }));
  clearTimeout(flyTimer);
  flyTimer = setTimeout(() => { flying.value = null; done(); }, FLY_MS);
}

const flyStyle = computed(() => {
  const f = flying.value;
  if (!f) return {};
  return {
    left: `${f.x}px`,
    top: `${f.y}px`,
    transform: f.go
      ? `translate(-50%, -50%) translate(${f.dx}px, ${f.dy}px) scale(${f.scale})`
      : 'translate(-50%, -50%)',
  };
});

// ---------- 得分浮字 ----------
function showFloat(groups, gain, chain) {
  const title = groups.length > 1
    ? i18n('multiName').replace('{n}', groups.length)
    : i18n(`${groups[0].kind}Name`);
  float.value = { id: ++floatId, title, score: gain, chain };
  timers.push(setTimeout(() => { float.value = null; }, 950));
}

// 震动 / 外圈闪光：连击会连着触发，先摘类名再强制重排，否则第二次不会重播（照麻将英雄）
function shakeBoard() {
  clearTimeout(shakeTimer);
  shaking.value = false;
  void document.querySelector('.board')?.offsetWidth;
  shaking.value = true;
  shakeTimer = setTimeout(() => { shaking.value = false; }, 340);
}
function flashBoard() {
  clearTimeout(flashTimer);
  celebrating.value = false;
  void document.querySelector('.board')?.offsetWidth;
  celebrating.value = true;
  flashTimer = setTimeout(() => { celebrating.value = false; }, 900);
}

// ---------- 结算级联：消除 → 掉落 → 消除（连击） ----------
async function cascade(chain) {
  let did = false;
  for (;;) {
    const groups = findGroups(grid.value);
    if (!groups.length) break;
    chain += 1;
    const base = groups.reduce((s, g) => s + g.score, 0);
    const gain = base + multiBonus(groups.length) + chainBonus(chain);
    score.value += gain;
    clearedCount.value += groups.length;
    // 消除的牌立刻从 grid 里拿掉，单独渲染一层浮影播闪烁
    const map = new Map();
    for (const g of groups) {
      for (const [r, c] of g.cells) {
        const t = grid.value[r][c];
        if (t) map.set(t.id, { id: t.id, v: t.v, row: r, col: c });
      }
    }
    // **先**把牌从盘面拿掉，只留浮影层播闪烁 —— 如果先闪再删，闪烁期间底下还压着一张实牌，
    // 0.12 透明度那几帧会被实牌透出来，看着就不像闪烁了（麻将英雄就是这么做的，踩过）
    clearing.value = map;
    grid.value = clearGroups(grid.value, groups);
    did = true;
    // **浮字与特效必须和上面的闪烁同一帧触发**（麻将英雄就是这个顺序：先落位 / 拿掉，再 announce）。
    // 反过来（先弹提示、再开始闪烁）看起来就是「提示比动画早一步」，用户报过。
    showFloat(groups, gain, chain);
    if (groups.length > 1 || chain > 1) {   // 多消 / 连击：震动 + 外圈闪光 + 撒花
      shakeBoard();
      flashBoard();
      burstConfetti(groups.length > 1 ? 1 : 0.7);
    }
    await wait(CLEAR_MS);
    clearing.value = new Map();
    // 悬空的牌往下落
    grid.value = settle(grid.value);
    await wait(FALL_MS);
  }
  return { did, chain };
}

function gameOver() {
  phase.value = OVER;
  isNewBest.value = score.value > best.value;
  if (isNewBest.value) {
    best.value = score.value;
    try { localStorage.setItem(BEST_KEY, String(best.value)); } catch { /* 隐私模式 */ }
  }
  save();
}

// ---------- 玩家操作：落子 / 替换 ----------
async function onCellClick(row, col) {
  if (busy.value || phase.value !== PLAY || !queue.value.length) return;
  busy.value = true;
  const v = queue.value.shift();
  queue.value.push(randKind());

  // 先把牌落到盘面上（数据立刻更新），但落点先隐身 —— 由飞过去的浮牌「接手」，
  // 等它飞到位再显形，看起来就是牌从候选区飞过去落在那一格（与麻将英雄同一手法）
  if (grid.value[row][col]) {
    // 替换：点到的位置已经有牌，用手上这张换掉它（旧牌直接弃掉）
    const next = replaceTile(grid.value, row, col, v);
    incomingId.value = next[row][col].id;
    grid.value = next;
    popped.add(incomingId.value);
    timers.push(setTimeout(() => popped.delete(incomingId.value), 240));
  } else {
    const p = placeTile(grid.value, col, v);
    if (!p) { busy.value = false; return; }
    incomingId.value = p.grid[p.row][col].id;
    grid.value = p.grid;
  }
  await new Promise(res => flyTo(v, row, col, res));
  incomingId.value = -1;
  await wait(60);

  const first = await cascade(0);

  if (!first.did) {
    // 这次操作没消除 → 底部升一行新牌，整盘往上顶一格
    const sp = spawnRow(grid.value, randomRow());
    grid.value = sp.grid;
    const fresh = grid.value[ROWS - 1].filter(Boolean);
    if (fresh.length) {
      moveMs.value = SPAWN_MS;
      fresh.forEach(t => fromRow.set(t.id, ROWS));       // 从棋盘下方升起
      await nextFrame();
      fresh.forEach(t => fromRow.delete(t.id));
      await wait(SPAWN_MS);
      moveMs.value = FALL_MS;
    }
    if (sp.overflow) { gameOver(); busy.value = false; return; }
    // 新升上来的那一行本身也可能直接消除计分（继续同一串连击）
    await cascade(first.chain);
  }

  save();
  busy.value = false;
}

// ---------- 开局 / 存档 ----------
// 新游戏：**没有二次确认**（用户要求，直接清当前得分重开；本作单局制，不受闯关那套约定约束）
function newRun() {
  clearTimers();
  resetUid();
  busy.value = false;
  phase.value = PLAY;
  isNewBest.value = false;
  score.value = 0;
  clearedCount.value = 0;
  clearing.value = new Map();
  popped.clear();
  fromRow.clear();
  float.value = null;
  shaking.value = false;
  queue.value = [];
  while (queue.value.length < 1 + PREVIEW) queue.value.push(randKind());
  // 开局底部摆**两行**，并保证这两行没有任何可消的组（见 board.js 的 initialGrid）
  grid.value = initialGrid().grid;
  startDeal();                         // 从左上角到右下角逐张铺开
  save();
}

function save() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({
      phase: phase.value,
      score: score.value,
      cleared: clearedCount.value,
      queue: queue.value,
      grid: grid.value.map(row => row.map(t => (t ? t.v : null))),
    }));
  } catch { /* 隐私模式写不进去就算了 */ }
}

function restore() {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY));
    if (!s || !Array.isArray(s.grid) || s.grid.length !== ROWS) return false;
    resetUid();
    grid.value = s.grid.map(row =>
      (Array.isArray(row) && row.length === COLS ? row.map(v => (v ? makeTile(v) : null)) : new Array(COLS).fill(null)));
    queue.value = (Array.isArray(s.queue) ? s.queue : []).filter(v => v >= 1 && v <= MAX_VALUE).slice(0, 1 + PREVIEW);
    while (queue.value.length < 1 + PREVIEW) queue.value.push(randKind());
    score.value = Math.max(0, +s.score || 0);
    clearedCount.value = Math.max(0, +s.cleared || 0);
    phase.value = s.phase === OVER ? OVER : PLAY;
    isNewBest.value = false;
    busy.value = false;
    // 恢复的局面同样按「左上 → 右下」的波浪逐张出现（与开新局一套）
    startDeal();
    return true;
  } catch {
    return false;
  }
}

onMounted(async () => {
  window.addEventListener('resize', onResize);
  onResize();
  await preloadTiles();          // 先读进缓存：不然牌元素先出现、图才慢慢加载
  if (!restore()) newRun();
});
onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  clearTimers();
});
</script>

<template>
  <div class="wrapper">
    <TopHeader />

    <div class="score-area card">
      <div class="stat">
        <span class="stat-label">{{ i18n('best') }}</span>
        <span class="stat-value">{{ best }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('score') }}</span>
        <span class="stat-value">{{ score }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('cleared') }}</span>
        <span class="stat-value">{{ clearedCount }}</span>
      </div>
    </div>

    <!-- 候选区与新游戏这一行照麻将英雄的实现：左半是「当前牌 + 后面两张」（不画外部容器），
         右半只放新游戏按钮，没有分隔线也没有文字标签 -->
    <div class="card opt-area">
      <div class="opt-half hand">
        <div class="tile-slot current" :style="slotVars">
          <MahjongTile v-if="queue.length" :value="faceOf(queue[0])" :suit="suitOf(queue[0])" :style="handTileVars" />
        </div>
        <div class="preview" :style="slotVars">
          <div
            v-for="(v, i) in queue.slice(1)" :key="`q-${i}`"
            class="tile-slot next" :style="{ transform: `scale(${PREVIEW_SCALES[i] ?? 0.6})` }"
          >
            <MahjongTile :value="faceOf(v)" :suit="suitOf(v)" :style="handTileVars" />
          </div>
        </div>
      </div>
      <div class="opt-half">
        <button class="game-icon" @click="newRun">{{ i18n('start') }}</button>
      </div>
    </div>

    <div class="game-area">
      <div class="board dot-board" :class="{ shake: shaking, celebrating }" :style="boardVars">
        <div
          v-for="i in CELLS" :key="`cell-${i}`"
          class="grid-cell" :style="cellStyle(i - 1)"
          @click="onCellClick(Math.floor((i - 1) / COLS), (i - 1) % COLS)"
        />
        <span
          v-for="t in tiles" :key="`${dealSeq}-${t.id}`"
          class="tile-slot" :class="{ placed: popped.has(t.id), incoming: t.id === incomingId, dealt: dealing }"
          :data-v="t.v"
          :style="{ ...posOf(t.from, t.col), animationDelay: dealing ? `${dealDelay(t.row, t.col)}ms` : '0ms' }"
        >
          <MahjongTile :value="faceOf(t.v)" :suit="suitOf(t.v)" :style="tileVars" />
        </span>
        <span
          v-for="t in clearingTiles" :key="`clear-${t.id}`"
          class="tile-slot clearing" :style="posOf(t.row, t.col)"
        >
          <MahjongTile :value="faceOf(t.v)" :suit="suitOf(t.v)" :style="tileVars" />
        </span>
        <div v-if="float" :key="float.id" class="celebrate">
          <span class="celebrate-title">{{ float.title }}</span>
          <span class="celebrate-score">+{{ float.score }}</span>
          <span v-if="float.chain > 1" class="celebrate-chain">{{ i18n('chainName').replace('{n}', float.chain) }}</span>
        </div>
        <div v-if="phase === OVER" class="result lose">
          <span>💤💤 {{ i18n('tipLost') }} 💤💤</span>
          <span class="final-score">{{ i18n('finalScore') }} {{ score }}</span>
          <span v-if="isNewBest" class="result-note">{{ i18n('newBest') }}</span>
          <button class="game-icon" @click="newRun">{{ i18n('start') }}</button>
        </div>
      </div>
    </div>

    <!-- 从候选区飞向目标格的浮牌（position: fixed，不受棋盘 overflow: hidden 影响） -->
    <div v-if="flying" class="fly-tile" :style="flyStyle">
      <MahjongTile :value="faceOf(flying.v)" :suit="suitOf(flying.v)" :style="handTileVars" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.wrapper {
  position: relative;
  color: var(--text-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-bottom: 16px;

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
    .stat {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      .stat-label { font-size: 12px; color: var(--muted-color); }
      .stat-value { font-size: 22px; font-weight: bold; line-height: 1.3; }
    }
  }

  .game-area {
    position: relative;
    margin-top: var(--row-gap);
    display: flex;
    justify-content: center;
  }

  // 8×6 棋盘：格子与牌都用绝对定位（自己算 left/top），行高就不会被格宽带偏
  .board {
    position: relative;
    overflow: hidden;                 // 新一行从下方升起、顶出去的牌都被裁掉
    border-radius: var(--card-radius);
    border: 1px solid var(--border-color);
    &.shake { animation: board-shake 0.34s ease; }
    &.celebrating { animation: board-celebrate 0.9s ease-out; }
    .grid-cell {
      position: absolute;
      width: var(--cw);
      height: var(--ch);
      box-sizing: border-box;
      border-radius: calc(var(--cw) * 0.09);
      border: 1px solid var(--tile-border-color);
      background: rgb(255 255 255 / 6%);
      cursor: pointer;
    }
    .tile-slot {
      position: absolute;
      width: var(--cw);
      height: var(--ch);
      pointer-events: none;           // 点击都交给下面的格子
      transition: top var(--move-ms, 200ms) ease-out, left var(--move-ms, 200ms) ease-out;
      &.placed { animation: tile-pop 0.22s ease; }
      &.clearing { animation: blink-clear 0.52s ease-in-out forwards; }
    }
    .celebrate {
      position: absolute;
      left: 50%;
      top: 50%;
      z-index: 6;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 6px 12px;
      border-radius: var(--radius-tile);
      background: var(--primary-bg);
      color: #fff;
      font-weight: bold;
      text-align: center;
      pointer-events: none;
      animation: celebrate-pop 0.95s ease forwards;
      .celebrate-title { font-size: 15px; }
      .celebrate-score { font-size: 20px; }
      .celebrate-chain { font-size: 13px; opacity: 0.92; }
    }
    // 结算浮层：尺寸跟父容器走，一定要 border-box（否则连内边距一起撑出去）
    .result {
      position: absolute;
      inset: 0;
      z-index: 8;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 12px;
      background: var(--mask-color);
      font-size: 18px;
      font-weight: bold;
      text-align: center;
      &.lose { color: var(--lose-color); }
      .result-note { font-size: 14px; font-weight: 400; color: var(--muted-color); }
      .final-score { font-size: 28px; }
    }
  }

  // 主按钮（照麻将英雄那份）
  .game-icon {
    cursor: pointer;
    padding: 8px 16px;
    border: 0;
    border-radius: var(--radius-tile);
    background: var(--primary-bg);
    color: #fff;
    font-size: 14px;
    font-weight: bold;
  }

  .opt-area {
    display: flex;
    align-items: center;
    margin: var(--row-gap) 0;
    // 与麻将英雄一致：左边是竖牌（约 1:1.28），比 var(--row-height) 高，写死行高会盖住统计卡
    height: auto;
    min-height: var(--row-height);
    .opt-half {
      display: flex;
      align-items: center;
      justify-content: center;
      &:first-child { flex: 1.6; }
      &:last-child { flex: 1.2; }
    }
    .hand {
      gap: 8px;
      // 候选牌不画外部容器：只占位、居中，牌直接立在面板上
      .tile-slot {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
      }
      .current {
        cursor: pointer;
        animation: tile-in 0.26s cubic-bezier(0.34, 1.56, 0.64, 1) both;
      }
      .preview {
        display: flex;
        align-items: center;
        gap: 2px;
      }
      .slot-hint { font-size: 12px; color: var(--muted-color); }
    }
  }

  // 候选区主次：当前牌高亮描边，下一张压暗（缩放 0.8 见 PREVIEW_SCALE）—— 与麻将英雄逐字一致。
  // 写在根层级是为了让选择器能命中子组件 MahjongTile 的根元素（它的 .mj 上带着两个 scope 属性）
  .hand .tile-slot.current .mj {
    outline: 2px solid var(--primary-bg);
    outline-offset: 1px;
  }
  .hand .preview {
    opacity: 0.55;
  }
}

// 入场的波浪（照麻将英雄那份：从左上方滑入 + 放大）
.tile-slot.dealt { animation: tile-wave 0.34s cubic-bezier(0.34, 1.4, 0.64, 1) both; }

// 落点隐身：飞行途中那一格先不画牌，等浮牌飞到位再显形
.tile-slot.incoming { opacity: 0; }

// 飞行中的浮牌（照麻将英雄那份）
.fly-tile {
  position: fixed;
  z-index: 60;
  pointer-events: none;
  transition: transform 0.2s ease-out;
  filter: drop-shadow(0 4px 10px rgb(0 0 0 / 22%));
}

@keyframes tile-wave {
  from { opacity: 0; transform: translate(-18px, -18px) scale(0.45); }
  to { opacity: 1; transform: translate(0, 0) scale(1); }
}
@keyframes tile-in {
  0% { transform: scale(0.6); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes tile-pop {
  0% { transform: scale(0.7); opacity: 0.4; }
  60% { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); }
}
@keyframes blink-clear {
  0% { opacity: 1; filter: none; transform: scale(1); }
  16% { opacity: 0.12; }
  32% { opacity: 1; }
  50% { opacity: 0.12; }
  66% { opacity: 1; filter: brightness(1.9); }
  100% { opacity: 0; filter: brightness(2.6); transform: scale(0.72); }
}
@keyframes celebrate-pop {
  0% { opacity: 0; transform: translate(-50%, -30%) scale(0.4) rotate(-6deg); }
  28% { opacity: 1; transform: translate(-50%, -50%) scale(1.16) rotate(3deg); }
  44% { opacity: 1; transform: translate(-50%, -50%) scale(1) rotate(0deg); }
  78% { opacity: 1; transform: translate(-50%, -62%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -100%) scale(0.92); }
}
@keyframes board-celebrate {
  0% { box-shadow: 0 0 0 0 transparent; }
  25% { box-shadow: 0 0 0 4px var(--celebrate-glow), 0 0 26px 8px var(--celebrate-glow); }
  100% { box-shadow: 0 0 0 0 transparent; }
}
@keyframes board-shake {
  0%, 100% { transform: translate(0, 0); }
  15% { transform: translate(-5px, 2px); }
  30% { transform: translate(4px, -3px); }
  45% { transform: translate(-3px, -2px); }
  60% { transform: translate(3px, 2px); }
}
</style>
