<template>
  <div class="wrapper" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp">
    <TopHeader @onScoreReset="onScoreReset">
      <!-- 模式开关（放在帮助图标旁边）：闯关 = 奖杯；无尽 = 无限符号 -->
      <span class="item-wrapper" :title="i18n('modeTip')" @click="toggleMode">
        <i i-mdi-trophy-variant-outline v-if="mode === 1" />
        <i i-mdi-infinity v-else />
      </span>
    </TopHeader>

    <div class="card score-area" :class="{ four: mode === 1 }">
      <template v-if="mode === 1">
        <div class="stat">
          <span class="stat-label">{{ i18n('level') }}</span>
          <span class="stat-value">{{ level }}</span>
        </div>
        <div class="divider"></div>
      </template>
      <template v-else>
        <div class="stat">
          <span class="stat-label">{{ i18n('best') }}</span>
          <span class="stat-value">{{ bestScore }}</span>
        </div>
        <div class="divider"></div>
      </template>
      <div class="stat">
        <span class="stat-label">{{ i18n(mode === 1 ? 'left' : 'used') }}</span>
        <span class="stat-value">{{ mode === 1 ? cardsLeft : played }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('score') }}</span>
        <span class="stat-value">{{ score }}</span>
      </div>
      <template v-if="mode === 1">
        <div class="divider"></div>
        <div class="stat">
          <span class="stat-label">{{ i18n('target') }}</span>
          <span class="stat-value">{{ cfg.target }}</span>
        </div>
      </template>
    </div>

    <div class="card opt-area">
      <div class="opt-half hand">
        <div
          class="tile-slot current"
          :class="{ ghost: dragging }"
          :style="slotVars(HAND_W)"
          @pointerdown="onPointerDown"
        >
          <MahjongTile v-if="hand" :value="hand.value" :style="tileVars(HAND_W)" />
          <span v-else class="slot-hint">{{ i18n('left') }}</span>
        </div>
        <div class="preview" :style="slotVars(HAND_W)">
          <div class="tile-slot next" v-for="t in preview" :key="t.id" :style="{ transform: `scale(${PREVIEW_SCALE})` }">
            <MahjongTile :value="t.value" :style="tileVars(HAND_W)" />
          </div>
        </div>
      </div>
      <div class="opt-half">
        <button class="game-icon" @click="confirming = true">{{ i18n('start') }}</button>
      </div>
    </div>

    <div class="game-area">
      <div class="board dot-board" :class="{ shaking, celebrating }" :style="boardVars">
        <div
          v-for="idx in CELLS"
          :key="`cell-${idx}`"
          class="cell"
          :class="{ placeable: !board[idx - 1] && canPlace, actable: board[idx - 1] && canPlace, incoming: flyingTo === idx - 1 }"
          @click="onCellClick(idx - 1)"
        >
          <template v-if="board[idx - 1]">
            <MahjongTile :value="board[idx - 1].value" :style="tileVars(boardTileW)" />
          </template>
          <!-- 刚消掉的牌：浮影层播完「闪烁 → 消失」就走 -->
          <span v-else-if="clearing.has(idx - 1)" class="clearing">
            <MahjongTile :value="clearing.get(idx - 1).value" :style="tileVars(boardTileW)" />
          </span>
        </div>
      </div>
      <!-- 得分浮字：棋盘正中弹出牌型名与本次得分（照消消乐那一套） -->
      <div v-if="celebration" :key="celebration.id" class="celebrate" :class="`tier-${celebration.tier}`">
        <span class="celebrate-text">{{ celebration.name }}</span>
        <span v-if="celebration.chain > 1" class="celebrate-chain">🔥 {{ i18n('chainName').replace('{n}', celebration.chain) }}</span>
        <span class="celebrate-score">+{{ celebration.gained }}</span>
      </div>
      <div v-if="phase !== 'play'" class="result" :class="phase === 'won' ? 'win' : 'lose'">
        <template v-if="phase === 'won'">
          <span>🎉🎉 {{ i18n('tipWin') }} 🎉🎉</span>
          <span class="level-note">{{ i18n('levelDone').replace('{n}', level) }}</span>
          <div class="result-btns">
            <button class="game-icon" @click="retryLevel">{{ i18n('replayLevel') }}</button>
            <button class="game-icon" @click="nextLevel">{{ i18n('nextLevel') }}</button>
          </div>
        </template>
        <template v-else>
          <span>💤💤 {{ i18n(loseReason === 'stuck' ? 'overStuck' : 'tipLost') }} 💤💤</span>
          <span class="level-note">{{ i18n('score') }} {{ score }}</span>
          <button class="game-icon" @click="retryLevel">{{ i18n('replayLevel') }}</button>
        </template>
      </div>
    </div>

    <!-- 跟手浮层：拖着的那张牌 -->
    <div v-if="dragging && dragPos" class="drag-ghost" :style="{ left: `${dragPos.x}px`, top: `${dragPos.y}px`, ...tileVars(HAND_W) }">
      <MahjongTile v-if="hand" :value="hand.value" />
    </div>

    <!-- 点击放置的飞行浮牌：从手牌位置飞到目标格，落定后才结算 -->
    <div v-if="flying" class="fly-tile" :style="flyStyle">
      <MahjongTile :value="flying.tile.value" :style="tileVars(flying.w)" />
    </div>

    <ConfirmDialog
      :show="confirming"
      :title="mode === 2 ? i18n('endlessTitle') : ''"
      :message="mode === 2 ? i18n('endlessMsg') : ''"
      :show-replay="mode === 1"
      @confirm="startNewGame"
      @replay="retryLevel"
      @cancel="confirming = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';

import TopHeader from '@/components/TopHeader.vue';
import ConfirmDialog from '@/shared/ConfirmDialog.vue';
import MahjongTile from './MahjongTile.vue';
import { RESULT_DELAY_MS } from '@/shared/resultDelay';
import confetti, { burstConfetti } from '@/shared/confetti';
import { i18n } from '@/shared/i18n';
import {
  SIZE, CELLS, PREVIEW, TILE_RATIO,
  createWall, resetUid, scoringLines, comboBonus, chainBonus, levelConfig,
  TILE_LIP_RATIO,
} from './board';

const MODE_KEY = '__mahjong_hero__mode';
const LEVEL_KEY = '__mahjong_hero__level';
const STATE_KEY = '__mahjong_hero__state';
const BEST_KEY = '__mahjong_hero__best_';
const [PLAY, WON, OVER] = ['play', 'won', 'over'];

// 中央得分浮字的档位（按本次得分放大）与「有特效」的门槛
const TIER_BY_SCORE = gained => (gained >= 1000 ? 3 : gained >= 500 ? 2 : 1);
const FX_MIN = 300;
const PREVIEW_SCALE = 0.8;
const HAND_W = 44;

const mode = ref(+(localStorage.getItem(MODE_KEY) || 1));   // 1 闯关 / 2 无尽
const level = ref(1);
const score = ref(0);
const played = ref(0);
const bestScore = ref(0);
const phase = ref(PLAY);
const board = ref(new Array(CELLS).fill(null));
const pile = ref([]);
const cursor = ref(0);
const confirming = ref(false);
const shaking = ref(false);
const celebrating = ref(false);
const celebration = ref(null);
const clearing = ref(new Map());
const loseReason = ref('deck');
const combo = ref(0);             // 连击数：连续每次消除 +1，断一次归零   // 'stuck' = 满盘无处可放；'deck' = 牌用完了
const flying = ref(null);
const flyingTo = ref(-1);
const busy = ref(false);

const cfg = computed(() => levelConfig(level.value));
const cardsLeft = computed(() => Math.max(0, pile.value.length - cursor.value));
const hand = computed(() => pile.value[cursor.value] || null);
const preview = computed(() => pile.value.slice(cursor.value + 1, cursor.value + 1 + PREVIEW));
const canPlace = computed(() => phase.value === PLAY && !!hand.value);

// ---------- 尺寸 ----------
const metrics = ref({ cw: 90, ch: 122, gap: 8 });
const cellW = computed(() => metrics.value.cw - 6);
const cellH = computed(() => metrics.value.ch - 6);
// 格子里那张牌的宽：牌是「正面 + 底部厚度」的一块整体，格子又是居中排版，所以
// 上面的富余与下面的厚度各占一半 —— 整体高度 1.35w + 0.075w 要连上下各留 0.075w 才不顶出去，
// 即 w ≤ 格高 / (1.35 + 2 × 0.075) = 格高 / 1.5。高度仍按 1:1.35 走，保住实物牌的形状。
const boardTileW = computed(() => Math.min(
  cellW.value,
  cellH.value / (TILE_RATIO + TILE_LIP_RATIO * 2),
));
const boardVars = computed(() => ({
  '--cw': `${metrics.value.cw}px`,
  '--ch': `${metrics.value.ch}px`,
  '--gap': `${metrics.value.gap}px`,
}));
const slotVars = w => ({ width: `${w}px`, height: `${Math.round(w * TILE_RATIO)}px` });
const tileVars = (w, h) => ({ '--mj-w': `${w}px`, '--mj-h': `${h || Math.round(w * TILE_RATIO)}px` });

// 牌是立体的：底部一条厚度（0.075w）+ 落地阴影（偏移 0.1w、模糊 0.15w）会伸到格子外面，
// 所以棋盘下方要多留 0.22 × 格子宽，否则最下面一排的影子会溢到棋盘外面（实测过）
const LIP_RATIO = 0.22;

function computeMetrics() {
  const vw = Math.min(window.innerWidth, 480);
  const availW = vw - 32 - 16;                       // 页面左右 16 + 棋盘内边距 8×2
  const byW = (availW - metrics.value.gap * (SIZE - 1)) / SIZE;
  // 先用宽度估一个格子宽，据此算出底部要预留的立体高度（用真实 cw 会循环依赖）
  const lip = Math.min(byW, 132) * LIP_RATIO;
  const byH = (window.innerHeight - 262 - 16 - lip - metrics.value.gap * (SIZE - 1)) / SIZE / TILE_RATIO;
  const cw = Math.max(56, Math.min(byW, byH, 132));
  metrics.value = { cw: Math.round(cw), ch: Math.round(cw * TILE_RATIO), gap: metrics.value.gap };
}

// ---------- 牌墙 ----------
const wall = createWall();
const freshTile = () => wall.draw();
function ensurePile(need) {
  if (mode.value !== 1) while (pile.value.length < need) pile.value.push(freshTile());
}

const pack = t => ({ v: t.value });
const unpack = o => (o && typeof o.v === 'number' ? { id: ++uidCounter, value: o.v } : null);
let uidCounter = 0;

// ---------- 开局 ----------
function clearTimers() {
  clearTimeout(shakeTimer);
  clearTimeout(celebrateTimer);
  clearTimeout(flashTimer);
  clearTimeout(clearTimer);
  clearTimeout(flyTimer);
  clearTimeout(endTimer);
}

function startLevel(lv) {
  clearTimers();
  level.value = Math.max(1, lv);
  score.value = 0;
  played.value = 0;
  combo.value = 0;
  phase.value = PLAY;
  board.value = new Array(CELLS).fill(null);
  clearing.value = new Map();
  celebration.value = null;
  shaking.value = false;
  celebrating.value = false;
  cursor.value = 0;
  resetUid();
  uidCounter = 0;
  const { deck } = cfg.value;
  // 逐张发、逐张进牌堆（发牌只从牌墙取，重洗时整墙重来）
  const built = [];
  for (let i = 0; i < deck; i++) built.push(freshTile());
  pile.value = built;
  ensurePile(cursor.value + 1 + PREVIEW);
  save();
}

function startEndless() {
  clearTimers();
  score.value = 0;
  played.value = 0;
  combo.value = 0;
  phase.value = PLAY;
  board.value = new Array(CELLS).fill(null);
  clearing.value = new Map();
  celebration.value = null;
  shaking.value = false;
  celebrating.value = false;
  cursor.value = 0;
  uidCounter = 0;
  pile.value = [];
  ensurePile(cursor.value + 1 + PREVIEW);
  save();
}

function startNewGame() {
  confirming.value = false;
  if (mode.value === 1) {
    localStorage.removeItem(BEST_KEY + 1);
    localStorage.removeItem(LEVEL_KEY);
    bestScore.value = 0;
    startLevel(1);
  } else {
    // 无尽：只清已用牌数与当前得分，最高分保留
    bestScore.value = +(localStorage.getItem(BEST_KEY + 2) || 0);
    startEndless();
  }
}

function retryLevel() {
  confirming.value = false;
  if (mode.value === 1) startLevel(level.value);
  else startEndless();
}

function nextLevel() {
  startLevel(level.value + 1);
}

function toggleMode() {
  save();
  mode.value = mode.value === 1 ? 2 : 1;
  localStorage.setItem(MODE_KEY, String(mode.value));
  if (mode.value === 1) {
    level.value = Math.max(1, +(localStorage.getItem(LEVEL_KEY) || 1));
    bestScore.value = +(localStorage.getItem(BEST_KEY + 1) || 0);
    if (!restore()) startLevel(level.value);
    else checkEnd(true);
  } else {
    bestScore.value = +(localStorage.getItem(BEST_KEY + 2) || 0);
    if (!restore()) startEndless();
    else checkEnd(true);
  }
}

function onScoreReset() {
  localStorage.removeItem(BEST_KEY + 1);
  localStorage.removeItem(BEST_KEY + 2);
  bestScore.value = mode.value === 1 ? level.value : score.value;
}

// ---------- 存档 ----------
const stateKey = () => (mode.value === 1 ? STATE_KEY : `${STATE_KEY}_2`);

function save() {
  try {
    localStorage.setItem(stateKey(), JSON.stringify({
      mode: mode.value,
      level: level.value,
      score: score.value,
      played: played.value,
      combo: combo.value,
      phase: phase.value,
      board: board.value.map(t => (t ? pack(t) : null)),
      pile: pile.value.map(pack),
      cursor: cursor.value,
    }));
    if (mode.value === 1) {
      localStorage.setItem(LEVEL_KEY, String(level.value));
      const best = +(localStorage.getItem(BEST_KEY + 1) || 0);
      if (level.value > best) localStorage.setItem(BEST_KEY + 1, String(level.value));
    } else if (score.value > bestScore.value) {
      bestScore.value = score.value;
      localStorage.setItem(BEST_KEY + 2, String(score.value));
    }
  } catch { /* 隐私模式下写不进去就算了 */ }
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(stateKey()));
    if (!saved || !Array.isArray(saved.board) || saved.board.length !== CELLS) return false;
    if (saved.mode !== mode.value) return false;
    if (![PLAY, WON, OVER].includes(saved.phase)) return false;
    if (!Array.isArray(saved.pile) || !saved.pile.length) return false;
    uidCounter = 0;
    board.value = saved.board.map(t => (t ? unpack(t) : null));
    pile.value = saved.pile.map(unpack).filter(Boolean);
    cursor.value = Math.min(Math.max(0, +saved.cursor || 0), Math.max(0, pile.value.length - 1));
    level.value = Math.max(1, +saved.level || 1);
    score.value = Math.max(0, +saved.score || 0);
    played.value = Math.max(0, +saved.played || 0);
    combo.value = Math.max(0, +saved.combo || 0);
    phase.value = saved.phase;
    ensurePile(cursor.value + 1 + PREVIEW);
    return true;
  } catch {
    return false;
  }
}

// ---------- 放置 ----------
function commitPlacement(idx, tile) {
  board.value = board.value.map((t, i) => (i === idx ? { ...tile } : t));
  advanceHand();
}

function advanceHand() {
  cursor.value += 1;
  played.value += 1;
  // 无尽模式的牌墙是无限的：丢掉已经翻过去的牌，否则存档会越存越大
  if (mode.value === 2 && cursor.value > 6) {
    pile.value = pile.value.slice(cursor.value - 1);
    cursor.value = 1;
  }
  ensurePile(cursor.value + 1 + PREVIEW);
}

// idx 上已经有牌时就是「替换」：手上的牌盖掉原来那张（原来那张直接弃掉，同样消耗一张手牌）
function placeByClick(idx) {
  const tile = hand.value;
  if (!tile) return;
  busy.value = true;
  commitPlacement(idx, tile);
  flyingTo.value = idx;
  flyTo(tile, idx, () => {
    flyingTo.value = -1;
    busy.value = false;
    settle();
  });
}

function placeByDrag(idx) {
  const tile = hand.value;
  if (!tile) return;
  commitPlacement(idx, tile);
  settle();
}

// 浮牌飞行：left/top 固定在手牌中心，靠 transform 平移到目标格并缩放到格子大小
function flyTo(tile, idx, done) {
  const from = document.querySelector('.current')?.getBoundingClientRect();
  const cell = document.querySelectorAll('.cell')[idx]?.getBoundingClientRect();
  if (!from || !cell) { done(); return; }
  const x = from.left + from.width / 2;
  const y = from.top + from.height / 2;
  flying.value = {
    tile,
    x,
    y,
    dx: cell.left + cell.width / 2 - x,
    dy: cell.top + cell.height / 2 - y,
    w: from.width,
    scale: cell.width / from.width,
    go: false,
  };
  nextTick(() => requestAnimationFrame(() => { if (flying.value) flying.value.go = true; }));
  clearTimeout(flyTimer);
  flyTimer = setTimeout(() => {
    flying.value = null;
    done();
  }, 210);
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

function onCellClick(idx) {
  if (phase.value !== PLAY || busy.value || !hand.value) return;
  placeByClick(idx);
}

// ---------- 结算 ----------
const celebrateLife = tier => 1100 + tier * 220;

function settle() {
  const hits = scoringLines(board.value);
  if (hits.length) {
    // 连击：连续每次消除算一连，从第二连起每连一次多 50（中间没消掉就归零）
    combo.value += 1;
    // 一次落子可能同时成好几组：全部计分，并从第二组起每组再加 100，再叠加连击奖励
    const gained = hits.reduce((sum, h) => sum + h.trio.score, 0)
      + comboBonus(hits.length) + chainBonus(combo.value);
    const best = hits.reduce((a, b) => (b.trio.score > a.trio.score ? b : a));
    score.value += gained;
    const cleared = new Set(hits.flatMap(h => h.indices));
    const gone = new Map();
    cleared.forEach(i => { if (board.value[i]) gone.set(i, board.value[i]); });
    board.value = board.value.map((t, i) => (cleared.has(i) ? null : t));
    clearing.value = gone;
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => { clearing.value = new Map(); save(); }, 520);
    announceCelebration(best.trio.id, gained, hits.length, combo.value);
  } else {
    combo.value = 0;      // 这一手没消掉，连击断
  }
  // 结算层等得分浮字消失之后再出现；没有得分就立即结算
  // 同扑克炼金术：不等浮字整条生命周期（1.32~1.76s），只按共用组件里 0.5s 的约定停一下
  const wait = celebration.value ? RESULT_DELAY_MS : 0;
  clearTimeout(endTimer);
  if (wait) endTimer = setTimeout(() => { checkEnd(); save(); }, wait);
  else { checkEnd(); save(); }
}

function shakeBoard() {
  clearTimeout(shakeTimer);
  shaking.value = false;
  void document.querySelector('.board')?.offsetWidth;   // 先摘类名再重排，连续触发也能重播
  shaking.value = true;
  shakeTimer = setTimeout(() => { shaking.value = false; }, 340);
}

function announceCelebration(trioId, gained, groups, chain = 1) {
  const tier = TIER_BY_SCORE(gained);
  celebration.value = {
    id: ++celebrationId,
    tier,
    gained,
    chain,
    name: groups > 1
      ? i18n('comboName').replace('{n}', groups)
      : i18n(trioId === 'triplet' ? 'tripletName' : 'runName'),
  };
  clearTimeout(celebrateTimer);
  celebrateTimer = setTimeout(() => { celebration.value = null; }, celebrateLife(tier));
  // 低于 300 分只有浮字，不震屏、不闪光、不撒花
  if (gained < FX_MIN) return;
  shakeBoard();
  clearTimeout(flashTimer);
  celebrating.value = false;
  void document.querySelector('.board')?.offsetWidth;
  celebrating.value = true;
  flashTimer = setTimeout(() => { celebrating.value = false; }, 900);
  burstConfetti(tier);
}

// silent = true 时只补结算层、不播撒花（退出再进入时不该再放一次烟花）
function checkEnd(silent = false) {
  if (phase.value !== PLAY) return;
  if (mode.value === 1) {
    if (score.value >= cfg.value.target) {
      phase.value = WON;
      if (!silent) confetti();
      if (level.value > bestScore.value) bestScore.value = level.value;
      return;
    }
    // 棋盘满不再是死局（点已有牌的格子可以替换），所以只有「牌用完还没达标」才算输
    if (cursor.value >= pile.value.length) { loseReason.value = 'deck'; phase.value = OVER; }
    return;
  }
  // 无尽模式牌墙无限、又能替换，因此没有判负条件，一直玩到玩家自己点「新游戏」
}

// ---------- 拖拽 ----------
const dragging = ref(false);
const dragPos = ref(null);
let dragId = -1;

function onPointerDown(e) {
  if (phase.value !== PLAY || !hand.value) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  dragId = e.pointerId;
  dragging.value = true;
  dragPos.value = { x: e.clientX, y: e.clientY };
}

function onPointerMove(e) {
  if (!dragging.value || e.pointerId !== dragId) return;
  dragPos.value = { x: e.clientX, y: e.clientY };
}

function onPointerUp(e) {
  if (!dragging.value || e.pointerId !== dragId) return;
  dragId = -1;
  dragging.value = false;
  const idx = cellAt(e.clientX, e.clientY);
  dragPos.value = null;
  if (idx >= 0) placeByDrag(idx);
}

// 屏幕坐标 → 格子下标（棋盘内边距 8，格子之间 gap）
function cellAt(x, y) {
  const el = document.querySelector('.board');
  if (!el) return -1;
  const rect = el.getBoundingClientRect();
  const pad = 8;
  const { cw, ch, gap } = metrics.value;
  const c = Math.floor((x - rect.left - pad) / (cw + gap));
  const r = Math.floor((y - rect.top - pad) / (ch + gap));
  if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return -1;
  return r * SIZE + c;
}

// ---------- 生命周期 ----------
let shakeTimer = 0;
let celebrateTimer = 0;
let flashTimer = 0;
let clearTimer = 0;
let flyTimer = 0;
let endTimer = 0;
let celebrationId = 0;

function onResize() {
  computeMetrics();
}

onMounted(() => {
  computeMetrics();
  const saved = +(localStorage.getItem(MODE_KEY) || 1);
  mode.value = saved === 2 ? 2 : 1;
  bestScore.value = +(localStorage.getItem(BEST_KEY + mode.value) || 0);
  if (mode.value === 1) level.value = Math.max(1, +(localStorage.getItem(LEVEL_KEY) || 1));
  window.addEventListener('resize', onResize);
  if (!restore()) {
    if (mode.value === 1) startLevel(level.value);
    else startEndless();
  } else {
    // 恢复存档要补判一次：存档可能正好停在满盘 / 已达标的一步上。传 true：重进不重播撒花
    checkEnd(true);
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  clearTimers();
  save();
});
</script>

<style scoped lang="scss">
@keyframes board-shake {
  0%, 100% { transform: translate(0, 0); }
  15% { transform: translate(-5px, 2px); }
  30% { transform: translate(4px, -3px); }
  45% { transform: translate(-3px, -2px); }
  60% { transform: translate(3px, 2px); }
}
@keyframes board-celebrate {
  0% { box-shadow: 0 0 0 0 transparent; }
  25% { box-shadow: 0 0 0 4px var(--celebrate-glow), 0 0 26px 8px var(--celebrate-glow); }
  100% { box-shadow: 0 0 0 0 transparent; }
}
@keyframes celebrate-pop {
  0% { opacity: 0; transform: translate(-50%, -30%) scale(0.4) rotate(-6deg); }
  28% { opacity: 1; transform: translate(-50%, -50%) scale(1.16) rotate(3deg); }
  44% { opacity: 1; transform: translate(-50%, -50%) scale(1) rotate(0deg); }
  78% { opacity: 1; transform: translate(-50%, -62%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -100%) scale(0.92); }
}
@keyframes tile-in {
  from { transform: scale(0.24); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
@keyframes blink-clear {
  0% { opacity: 1; filter: none; transform: scale(1); }
  16% { opacity: 0.12; }
  32% { opacity: 1; }
  50% { opacity: 0.12; }
  66% { opacity: 1; filter: brightness(1.9); }
  100% { opacity: 0; filter: brightness(2.6); transform: scale(0.72); }
}

.wrapper {
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  // 与其它 18 个游戏一致：整页文字走主题色（漏了这句 dark 下标题与数字会是浏览器默认的黑色）
  color: var(--text-color);
  touch-action: none;
  button { touch-action: manipulation; }

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
  .score-area.four .stat-value { font-size: 18px; }

  .opt-area {
    display: flex;
    align-items: center;
    margin: var(--row-gap) 0;
    // 本作偏离共享约定：左边是 1:1.35 的麻将牌，比 var(--row-height) 高，写死行高会盖住统计卡
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
        cursor: grab;
        animation: tile-in 0.26s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        &.ghost { opacity: 0.35; }
      }
      .preview {
        display: flex;
        align-items: center;
        gap: 2px;
      }
      .slot-hint { font-size: 12px; color: var(--muted-color); }
    }
  }

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

  .game-area {
    position: relative;
    width: fit-content;
    margin: 0 auto;
    .board {
      display: grid;
      grid-template-columns: repeat(3, var(--cw));
      grid-auto-rows: var(--ch);
      gap: var(--gap);
      // 底部多留一条：牌的厚度与落地阴影要伸到这里面，不然会溢出棋盘
      --lip: calc(var(--cw) * 0.22);
      padding: 8px 8px calc(8px + var(--lip));
      border-radius: var(--card-radius);
      box-sizing: content-box;
      &.shaking { animation: board-shake 0.34s ease; }
      &.celebrating { animation: board-celebrate 0.9s ease-out; }
      // 9 个格位画成常驻网格：格子就是牌的尺寸，牌四周各内缩 3px 让网格线露出来
      .cell {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--radius-tile);
        border: 1px solid var(--tile-border-color);
        background-color: rgb(255 255 255 / 8%);
        box-sizing: border-box;
        &.placeable {
          border-color: var(--primary-bg);
          border-style: dashed;
          cursor: pointer;
        }
        // 已经放了牌、但手上还有牌：点一下会用当前牌替换掉这张
        &.actable {
          cursor: pointer;
          &:hover { box-shadow: 0 0 0 2px var(--primary-bg); }
        }
        &.incoming > * { opacity: 0; }
      }
    }
    .clearing {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      animation: blink-clear 0.52s ease-in-out forwards;
    }
    // 得分浮字：棋盘正中弹出，不挡操作
    .celebrate {
      position: absolute;
      left: 50%;
      top: 50%;
      z-index: 3;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 10px 18px;
      box-sizing: border-box;
      border-radius: var(--radius-tile);
      background: var(--primary-bg);
      color: #fff;
      font-weight: bold;
      text-align: center;
      max-width: calc(100% - 8px);
      pointer-events: none;
      box-shadow: 0 6px 18px var(--celebrate-glow);
      animation: celebrate-pop 0.95s cubic-bezier(0.22, 1.2, 0.36, 1) forwards;
      .celebrate-text { font-size: 18px; line-height: 1.2; }
      .celebrate-chain { font-size: 13px; line-height: 1.2; margin-top: 2px; opacity: 0.95; }
      .celebrate-score {
        font-size: 14px;
        line-height: 1.2;
        margin-top: 3px;
        opacity: 0.92;
        font-variant-numeric: tabular-nums;
      }
      &.tier-2 {
        box-shadow: 0 6px 20px var(--celebrate-glow), 0 0 0 3px var(--celebrate-glow);
        .celebrate-text { font-size: 21px; }
      }
      &.tier-3 {
        padding: 12px 22px;
        box-shadow: 0 8px 26px var(--celebrate-glow), 0 0 0 4px var(--celebrate-glow);
        .celebrate-text { font-size: 24px; }
      }
    }
    .result {
      position: absolute;
      inset: 0;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 12px;
      border-radius: var(--card-radius);
      background: var(--mask-color);
      font-size: 18px;
      font-weight: bold;
      color: var(--win-color);
      &.lose { color: var(--lose-color); }
      .level-note { font-size: 14px; color: var(--text-color); opacity: 0.75; font-weight: 400; }
      .result-btns { display: flex; gap: 10px; }
    }
  }

  .drag-ghost {
    position: fixed;
    z-index: 50;
    pointer-events: none;
    transform: translate(-50%, -50%) scale(1.06);
    filter: drop-shadow(0 6px 12px rgb(0 0 0 / 25%));
  }
  .fly-tile {
    position: fixed;
    z-index: 60;
    pointer-events: none;
    transition: transform 0.2s ease-out;
    filter: drop-shadow(0 4px 10px rgb(0 0 0 / 22%));
  }
}
</style>
