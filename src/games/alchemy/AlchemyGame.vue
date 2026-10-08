<template>
  <div class="wrapper" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp">
    <TopHeader @onScoreReset="onScoreReset">
      <!-- 模式开关（放在帮助图标旁边）：闯关 = 奖杯；无尽 = 无限符号 -->
      <span class="item-wrapper" :title="i18n('modeTip')" @click="toggleMode">
        <i i-mdi-trophy-variant-outline v-if="mode === 1" />
        <i i-mdi-infinity v-else />
      </span>
    </TopHeader>

    <!-- 统计条：闯关「关卡 / 剩余 / 得分 / 目标」四格，无尽「最高分 / 剩余 ♾️ / 得分」三格 -->
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
          class="card-slot current"
          :class="{ ghost: dragging }"
          :style="handVars"
          @pointerdown="onPointerDown"
        >
          <CardItem v-if="hand" mini v-bind="cardProps(hand)" :style="cardVars(handW)" />
          <span v-else class="slot-hint">{{ i18n('next') }}</span>
        </div>
        <div class="preview" :style="previewVars">
          <div class="card-slot next" v-for="(c, i) in preview" :key="c.id">
            <CardItem mini v-bind="cardProps(c)" :style="[{ ...cardVars(handW), transform: `scale(${previewScale(i)})` }]" />
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
          :class="{ filled: !!board[idx - 1], placeable: !board[idx - 1] && canPlace, incoming: flyingTo === idx - 1 }"
          @click="onCellClick(idx - 1)"
        >
          <template v-if="board[idx - 1]">
            <CardItem mini v-bind="cardProps(board[idx - 1])" :style="cardVars(cellW, cellH)" />
          </template>
          <!-- 刚消掉的牌：浮影层播完 pop-out 就走 -->
          <span v-else-if="clearing.has(idx - 1)" class="clearing">
            <CardItem mini v-bind="cardProps(clearing.get(idx - 1))" :style="cardVars(cellW, cellH)" />
          </span>
        </div>
      </div>
      <!-- 大牌型的即时庆祝：中央弹出牌型名与本次得分（照消消乐的做法，连击/大消同一套） -->
      <div v-if="celebration" :key="celebration.id" class="celebrate" :class="`tier-${celebration.tier}`">
        <span class="celebrate-text">{{ celebration.name }}</span>
        <span class="celebrate-score">+{{ celebration.gained }}</span>
      </div>
      <div v-if="phase !== 'play'" class="result" :class="phase === 'won' ? 'win' : 'lose'">
        <template v-if="phase === 'won'">
          <span>🎉🎉 {{ i18n('tipWin') }} 🎉🎉</span>
          <span class="level-note">{{ i18n('levelDone').replace('{n}', level) }}</span>
          <!-- 左「重玩本关」右「下一关」，两个都是主色绿按钮 -->
          <div class="result-btns">
            <button class="game-icon" @click="retryLevel">{{ i18n('replayLevel') }}</button>
            <button class="game-icon" @click="nextLevel">{{ i18n('nextLevel') }}</button>
          </div>
        </template>
        <template v-else>
          <span>💤💤 {{ i18n(mode === 1 ? 'tipLost' : 'endlessOver') }} 💤💤</span>
          <span class="level-note">{{ i18n('score') }} {{ score }}</span>
          <button class="game-icon" @click="retryLevel">{{ i18n('replayLevel') }}</button>
        </template>
      </div>
    </div>

    <!-- 跟手浮层：拖着的那张牌 -->
    <div v-if="dragging && dragPos" class="drag-ghost" :style="{ left: `${dragPos.x}px`, top: `${dragPos.y}px`, ...cardVars(handW) }">
      <CardItem v-if="hand" mini v-bind="cardProps(hand)" :style="cardVars(handW)" />
    </div>

    <!-- 点击放置的飞行浮牌：从手牌位置飞到目标格，落定后才结算 -->
    <div v-if="flying" class="fly-card" :style="flyStyle">
      <CardItem mini v-bind="cardProps(flying.card)" :style="cardVars(flying.w)" />
    </div>

    <!-- 无尽模式没有「关卡」概念：用自己的文案，并隐藏「重玩本关」按钮；
         闯关模式留空 → 用共享弹窗的默认文案（含「从第 1 关重新开始」提示与重玩本关） -->
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
import CardItem from '@/games/poker/CardItem.vue';
import confetti, { burstConfetti } from '@/shared/confetti';
import { i18n } from '@/shared/i18n';
import {
  SIZE, CELLS, PREVIEW,
  JOKER, BLACK, RED, JOKER_SUIT,
  createDealer, cardKey, resetUid, scoringLines, isStuck,
  levelConfig,
} from './board';

const MODE_KEY = '__poker_alchemy__mode';
const LEVEL_KEY = '__poker_alchemy__level';
const STATE_KEY = '__poker_alchemy__state';
const BEST_KEY = '__poker_alchemy__best_';
const [PLAY, WON, OVER] = ['play', 'won', 'over'];
// 中央得分浮字的档位（按分数大小放大）：≥1000 最强、≥500 次之、其余基础档
const TIER_BY_SCORE = score => (score >= 1000 ? 3 : score >= 500 ? 2 : 1);
// 低于这个分数的得分只弹浮字，不震屏、不闪光、不撒花
const FX_MIN = 300;

const mode = ref(+(localStorage.getItem(MODE_KEY) || 1));   // 1 闯关 / 2 无尽
const level = ref(1);
const score = ref(0);
// 已用牌数（无尽模式用）：无尽牌堆会被裁剪（见 advanceHand），「还剩几张」没有意义；
// 单独计数并写进存档，跟着局面一起走
const played = ref(0);
const bestScore = ref(0);
const phase = ref(PLAY);
const board = ref(new Array(CELLS).fill(null));
const pile = ref([]);        // 已知的牌堆（闯关：整副；无尽：按需追加）
const cursor = ref(0);       // pile 里当前手牌的下标
const confirming = ref(false);
const shaking = ref(false);
// 大牌型的庆祝浮字（同消消乐：按档位放大、中央弹出、自动消失）
const celebration = ref(null);
const celebrating = ref(false);
// 刚被消除的牌：局面里立刻清空（否则动画期间再落一子会把同一条线**重复计分**），
// 但保留一层浮影把「闪烁 → 消失」播完
const clearing = ref(new Map());
// 点击放置：牌从手牌位置飞到目标格；落点那一格先隐身，等飞到了再显形
const flying = ref(null);
const flyingTo = ref(-1);
const busy = ref(false);

const cfg = computed(() => levelConfig(level.value));
// 第二格：闯关显示还剩多少张牌，无尽显示已经用掉多少张（都是「牌数」）
const cardsLeft = computed(() => Math.max(0, pile.value.length - cursor.value));
const hand = computed(() => pile.value[cursor.value] || null);
const preview = computed(() => pile.value.slice(cursor.value + 1, cursor.value + 1 + PREVIEW));
const canPlace = computed(() => phase.value === PLAY && !!hand.value);

// ---------- 尺寸 ----------
// 手牌固定宽度，高度等比（2:3）；下两张不另设尺寸，直接对同一张牌做 transform scale
const HAND_W = 44;
const PREVIEW_SCALE = [0.8, 0.6];
const metrics = ref({ cw: 62, ch: 93, gap: 8, handW: HAND_W });
// 棋盘里的牌比格位内缩 3px（四周各 3px），这样格位那条网格线不会被牌盖掉
const CARD_INSET = 6;
const cellW = computed(() => metrics.value.cw - CARD_INSET);
const cellH = computed(() => metrics.value.ch - CARD_INSET);
const handW = computed(() => metrics.value.handW);
const previewScale = i => PREVIEW_SCALE[i] ?? PREVIEW_SCALE[PREVIEW_SCALE.length - 1];
const boardVars = computed(() => ({
  '--cw': `${metrics.value.cw}px`,
  '--ch': `${metrics.value.ch}px`,
  '--gap': `${metrics.value.gap}px`,
  '--pad': '8px',
}));
const handVars = computed(() => ({ width: `${metrics.value.handW}px`, height: `${Math.round(metrics.value.handW * 1.5)}px` }));
const previewVars = computed(() => ({ height: `${Math.round(metrics.value.handW * 1.5)}px` }));

// CardItem 的 --width/--height 要各减 2（它那张牌是 content-box + 1px 描边）
function cardVars(w, h) {
  return {
    '--width': `${Math.max(8, w - 2)}px`,
    '--height': `${Math.max(8, (h || Math.round(w * 1.5)) - 2)}px`,
    '--margin': '0px',
    '--radius': `${Math.max(2, Math.round(w * 0.07))}px`,
    '--pos': `${Math.max(1, Math.round(w * 0.07))}px`,
    '--text-size': `${Math.max(7, Math.round(w * 0.26))}px`,
    '--icon-size': `${Math.max(10, Math.round(w * 0.56))}px`,
    '--back-size': `${Math.max(12, Math.round(w * 0.68))}px`,
  };
}

function computeMetrics() {
  const vw = Math.min(window.innerWidth, 480);
  const availW = vw - 32 - 16;                      // 页面左右各 16 + 棋盘内边距 8×2
  const byW = (availW - metrics.value.gap * (SIZE - 1)) / SIZE;
  // 高度：视口扣掉首卡 64 + 统计条 + 操作区 + 各处间隙。手牌固定 50×75、比 var(--row-height) 略高，
  // 多出来的那一点已经在 262 这个通用留白里了
  const byH = (window.innerHeight - 262 - 16 - metrics.value.gap * (SIZE - 1)) / SIZE / 1.5;
  const cw = Math.max(30, Math.min(byW, byH, 84));
  metrics.value = {
    cw: Math.round(cw),
    ch: Math.round(cw * 1.5),
    gap: metrics.value.gap,
    handW: HAND_W,
  };
}

// ---------- 牌堆 ----------
const pack = c => (c.kind === 'card' ? { k: 'c', r: c.rank, s: c.suit }
  : { k: c.color === BLACK ? 'jb' : 'jr' });
const unpack = o => (o.k === 'c'
  ? { id: ++uidCounter, kind: 'card', rank: o.r, suit: o.s }
  : { id: ++uidCounter, kind: JOKER, color: o.k === 'jb' ? BLACK : RED });
let uidCounter = 0;
const dealer = createDealer();

// 当前「已经在场」的牌（棋盘 + 整个牌堆）：发牌器据此保证不会发出重复的牌
function usedKeys() {
  const out = new Set();
  for (const c of board.value) { const k = cardKey(c); if (k) out.add(k); }
  for (const c of pile.value) { const k = cardKey(c); if (k) out.add(k); }
  return out;
}
const freshCard = (used) => dealer.draw(used || usedKeys());

// 无尽模式：牌堆要几张给几张
function ensurePile(need) {
  if (mode.value !== 1) while (pile.value.length < need) pile.value.push(freshCard());
}
// 普通牌与 Joker 都交给 CardItem 渲染（Joker 用 num=14 + 花色区色，与德州扑克同一套）
const isPoker = c => !!c && (c.kind === 'card' || c.kind === JOKER);
function cardProps(c) {
  return c.kind === 'card' ? { num: c.rank, type: c.suit } : { num: 14, type: JOKER_SUIT[c.color] };
}

// ---------- 关卡 / 开局 ----------
function startLevel(lv) {
  clearTimeout(endTimer);   // 上一局延后待出的结算层作废
  level.value = Math.max(1, lv);
  score.value = 0;
  played.value = 0;
  phase.value = PLAY;
  board.value = new Array(CELLS).fill(null);
  clearing.value = new Map();
  cursor.value = 0;
  shaking.value = false;
  resetUid();
  uidCounter = 0;
  const { deck } = cfg.value;
  // 逐张抽、逐张把 key 记进 used：不能写成 Array.from(() => freshCard()) ——
  // 那样 pile.value 要等整个数组建完才赋值，每一张看到的都是**空的** used 集合，
  // 两个黑 Joker（或任何重复牌）就都可能同时进牌堆
  const built = [];
  const used = new Set();
  for (let i = 0; i < deck; i++) {
    const c = freshCard(used);
    built.push(c);
    used.add(cardKey(c));
  }
  pile.value = built;
  ensurePile(PREVIEW + 1);
  save();
}

function startEndless() {
  clearTimeout(endTimer);   // 上一局延后待出的结算层作废
  score.value = 0;
  played.value = 0;
  phase.value = PLAY;
  board.value = new Array(CELLS).fill(null);
  clearing.value = new Map();
  cursor.value = 0;
  shaking.value = false;
  uidCounter = 0;
  pile.value = [];
  ensurePile(PREVIEW + 1);
  save();
}

function startNewGame() {
  confirming.value = false;
  if (mode.value === 1) {
    // 闯关：清闯关记录，从第 1 关重开
    localStorage.removeItem(BEST_KEY + 1);
    localStorage.removeItem(LEVEL_KEY);
    bestScore.value = 0;
    startLevel(1);
  } else {
    // 无尽：只清已用牌数与当前得分（startEndless 会重置这两项），**最高分保留**
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
  } else {
    bestScore.value = +(localStorage.getItem(BEST_KEY + 2) || 0);
    if (!restore()) startEndless();
    else checkEnd(true);
  }
}

function onScoreReset() {
  localStorage.removeItem(BEST_KEY + 1);
  localStorage.removeItem(BEST_KEY + 2);
  bestScore.value = score.value;
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
      phase: phase.value,
      board: board.value.map(c => (c ? pack(c) : null)),
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
    board.value = saved.board.map(c => (c ? unpack(c) : null));
    pile.value = saved.pile.map(unpack);
    cursor.value = Math.min(Math.max(0, +saved.cursor || 0), Math.max(0, pile.value.length - 1));
    level.value = Math.max(1, +saved.level || 1);
    score.value = Math.max(0, +saved.score || 0);
    played.value = Math.max(0, +saved.played || 0);
    phase.value = saved.phase;
    ensurePile(cursor.value + 1 + PREVIEW);
    return true;
  } catch {
    return false;
  }
}

// ---------- 放置 / 转换 ----------
// 落子：只改局面、手牌前进，不做结算（结算交给 settle）
function commitPlacement(idx, card) {
  board.value = board.value.map((c, i) => (i === idx ? { ...card } : c));
  advanceHand();
}

function advanceHand() {
  cursor.value += 1;
  played.value += 1;
  // 无尽模式的牌堆是无限的：丢掉已经翻过去的牌，否则存档会越存越大
  if (mode.value === 2 && cursor.value > 8) {
    pile.value = pile.value.slice(cursor.value - 1);
    cursor.value = 1;
  }
  ensurePile(cursor.value + 1 + PREVIEW);
}

// 点击空格：牌先落进目标格（那一格用 .incoming 隐身），再让一张浮牌从手牌位置飞过去，
// 落地后才结算 —— 于是「点空白」也能看到牌从候选位置移到目标位置
function placeByClick(idx) {
  const card = hand.value;
  if (!card || board.value[idx]) return;
  busy.value = true;
  commitPlacement(idx, card);
  flyingTo.value = idx;
  flyTo(card, idx, () => {
    flyingTo.value = -1;
    busy.value = false;
    settle();
  });
}

// 拖拽落子：手指已经把牌带过去了，不必再飞，直接结算
function placeByDrag(idx) {
  const card = hand.value;
  if (!card || board.value[idx]) return;
  commitPlacement(idx, card);
  settle();
}

// 浮牌飞行：left/top 固定在手牌中心，靠 transform 平移到目标格并缩放到格子大小
function flyTo(card, idx, done) {
  const from = document.querySelector('.current')?.getBoundingClientRect();
  const cell = document.querySelectorAll('.cell')[idx]?.getBoundingClientRect();
  if (!from || !cell) { done(); return; }
  const x = from.left + from.width / 2;
  const y = from.top + from.height / 2;
  flying.value = {
    card,
    x,
    y,
    dx: cell.left + cell.width / 2 - x,
    dy: cell.top + cell.height / 2 - y,
    w: from.width,
    scale: (cell.width - CARD_INSET) / from.width,
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
  if (board.value[idx]) return;
  placeByClick(idx);
}

// 一次操作（放牌 / 转换）之后的统一收尾：结算 → 判结束 → 落档
function settle() {
  const hits = scoringLines(board.value);
  if (hits.length) {
    // 一次落子可能同时凑成横 / 竖 / 斜好几条线：只按**分数最高**的那条算；
    // 最高分并列（两条或全部一样）时，把并列的这些一起消除并累加分数
    const top = Math.max(...hits.map(h => h.combo.score));
    const taken = hits.filter(h => h.combo.score === top);
    const gained = taken.reduce((sum, h) => sum + h.combo.score, 0);
    const best = taken[0];
    score.value += gained;
    const cleared = new Set(taken.flatMap(h => h.indices));
    // 局面立刻清空（不留重复计分的窗口），被消掉的牌进浮影层播动画
    const gone = new Map();
    cleared.forEach(i => { if (board.value[i]) gone.set(i, board.value[i]); });
    board.value = board.value.map((c, i) => (cleared.has(i) ? null : c));
    clearing.value = gone;
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => { clearing.value = new Map(); save(); }, 520);
    announceCelebration(best.combo.id, gained);
  }
  // 结算层要等中央得分浮字消失之后再出现（没有浮字就立即结算）
  const wait = celebration.value ? celebrateLife(celebration.value.tier) : 0;
  clearTimeout(endTimer);
  if (wait) endTimer = setTimeout(() => { checkEnd(); save(); }, wait);
  else { checkEnd(); save(); }
}

// ---------- 得分庆祝（照消消乐那一套）----------
// 每一次得分都在棋盘中央弹出「牌型名 + 本次得分」的浮字（按分数分档放大）；
// 得分 ≥ 300 时再加：棋盘震一下 + 外圈闪一圈光 + 撒一把花；低于 300 只有浮字。
// 返回浮字的存活时长，结算层要等它消失后再出现。
function shakeBoard() {
  clearTimeout(shakeTimer);
  shaking.value = false;
  // 先摘类名再重排，保证连续触发也能重播同一条动画
  void document.querySelector('.board')?.offsetWidth;
  shaking.value = true;
  shakeTimer = setTimeout(() => { shaking.value = false; }, 340);
}

const celebrateLife = tier => 1100 + tier * 220;

function announceCelebration(id, gained) {
  const tier = TIER_BY_SCORE(gained);
  celebration.value = {
    id: ++celebrationId,
    tier,
    gained,
    name: i18n(`combo${id[0].toUpperCase()}${id.slice(1)}`),
  };
  clearTimeout(celebrateTimer);
  celebrateTimer = setTimeout(() => { celebration.value = null; }, celebrateLife(tier));
  // 低于 300 分：只有浮字，不震屏、不闪光、不撒花
  if (gained < FX_MIN) return;
  shakeBoard();
  // 棋盘外圈闪光：与震动的 shaking 是两套独立样式（一个动 box-shadow、一个动 transform）
  clearTimeout(flashTimer);
  celebrating.value = false;
  void document.querySelector('.board')?.offsetWidth;
  celebrating.value = true;
  flashTimer = setTimeout(() => { celebrating.value = false; }, 900);
  burstConfetti(tier);
}

// silent = true 时只补结算层、不播撒花（退出再进入时不该再放一次烟花）。
// 只有还在 PLAY 才结算：结算层是延后出现的，重复触发不能重复撒花
function checkEnd(silent = false) {
  if (phase.value !== PLAY) return;
  if (mode.value === 1) {
    if (score.value >= cfg.value.target) {
      phase.value = WON;
      if (!silent) confetti();
      if (level.value > bestScore.value) bestScore.value = level.value;
      return;
    }
    if (cursor.value >= pile.value.length) phase.value = OVER;
    return;
  }
  // 无尽：满盘且再也无法消除（转换牌还能救的话不算结束）
  if (isStuck(board.value)) {
    phase.value = OVER;
    if (score.value > bestScore.value) bestScore.value = score.value;
  }
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
let clearTimer = 0;
let flyTimer = 0;
let celebrateTimer = 0;
let flashTimer = 0;
let endTimer = 0;
let celebrationId = 0;

function onResize() {
  const keep = metrics.value.gap;
  computeMetrics();
  if (metrics.value.gap !== keep) metrics.value = { ...metrics.value, gap: keep };
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
    // 恢复存档要补判一次：存档可能正好停在「满盘且再也消不掉」或「已达标」的一步上，
    // 那时玩家已经没地方落子 / 结算层不会自己再出现。传 true：重进不重播撒花
    checkEnd(true);
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  clearTimeout(shakeTimer);
  clearTimeout(clearTimer);
  clearTimeout(flyTimer);
  clearTimeout(celebrateTimer);
  clearTimeout(flashTimer);
  clearTimeout(endTimer);
  save();
});
</script>

<style scoped lang="scss">
// 大牌型消除时的棋盘震动（与消消乐同一个关键帧）
@keyframes board-shake {
  0%, 100% { transform: translate(0, 0); }
  15% { transform: translate(-5px, 2px); }
  30% { transform: translate(4px, -3px); }
  45% { transform: translate(-3px, -2px); }
  60% { transform: translate(3px, 2px); }
}
// 棋盘外圈的一圈闪光（与震动是两套独立样式：一个动 box-shadow、一个动 transform）
@keyframes board-celebrate {
  0% { box-shadow: 0 0 0 0 transparent; }
  25% { box-shadow: 0 0 0 4px var(--celebrate-glow), 0 0 26px 8px var(--celebrate-glow); }
  100% { box-shadow: 0 0 0 0 transparent; }
}
// 庆祝浮字：弹出 → 顿一下 → 上飘淡出
@keyframes celebrate-pop {
  0% { opacity: 0; transform: translate(-50%, -30%) scale(0.4) rotate(-6deg); }
  28% { opacity: 1; transform: translate(-50%, -50%) scale(1.16) rotate(3deg); }
  44% { opacity: 1; transform: translate(-50%, -50%) scale(1) rotate(0deg); }
  78% { opacity: 1; transform: translate(-50%, -62%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -100%) scale(0.92); }
}
@keyframes card-in {
  from { transform: scale(0.24); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
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
  // 拖牌的手势归本页所有（此页纵向不溢出）
  touch-action: none;
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
    .stat {
      flex: 1;
      min-width: 0;
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
        line-height: 1.3;
      }
    }
  }
  // 闯关模式有四格（关卡 / 剩余 / 得分 / 目标），320 宽下每格只有 ~65px，
  // 数字缩到 18px 才不会把「目标分」的四位数挤出去
  .score-area.four {
    .stat-value { font-size: 18px; }
  }
  .opt-area {
    display: flex;
    align-items: center;
    margin: var(--row-gap) 0;
    // **本作偏离共享约定**：操作区左边是 2:3 的扑克牌，比 var(--row-height) 高，
    // 写死行高会让手牌上下溢出、盖住上面的统计卡（截图里踩过）。改成内容驱动。
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
      // 候选牌（手牌 + 下两张）只占位，不画外部容器：不要底色、也不要描边，
      // 牌直接立在面板上（槽位本身仍保留 50×75 的尺寸，负责排版与跟手拖拽的定位）
      .card-slot {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
      }
      .current {
        cursor: grab;
        animation: card-in 0.26s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        &.ghost { opacity: 0.35; }
      }
      .preview {
        display: flex;
        align-items: center;
        // 牌本体用 transform scale 缩小，槽位仍是 50×75，所以视觉间距靠这个小 gap 收
        gap: 2px;
      }
      .slot-hint {
        font-size: 12px;
        color: var(--muted-color);
      }
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
      &.shaking { animation: board-shake 0.34s ease; }
      &.celebrating { animation: board-celebrate 0.9s ease-out; }
      display: grid;
      grid-template-columns: repeat(4, var(--cw));
      grid-auto-rows: var(--ch);
      gap: var(--gap);
      padding: var(--pad);
      border-radius: var(--card-radius);
      box-sizing: content-box;
      // 16 个格位画成常驻网格：格子宽高就是牌的尺寸（2:3），牌正好嵌进去，
      // 所以牌与牌之间、牌与棋盘边之间都是这条 1px 网格线
      .cell {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--radius-tile);
        // 深色主题下 --border-color(#4a4a4a) 与棋盘底(#4a443e) 几乎同色，网格会看不见；
        // --tile-border-color(#5a5a5a) 才是各 emoji 游戏的格子描边色
        border: 1px solid var(--tile-border-color);
        // 半透明白：浅色主题下把米色棋盘提亮一点、深色下提亮更深，两种主题都能读出「槽位」
        background-color: rgb(255 255 255 / 8%);
        box-sizing: border-box;
        // 手上有牌可放时，空格子换成主色虚线，明确「这里能落子」
        &.placeable {
          border-color: var(--primary-bg);
          border-style: dashed;
          cursor: pointer;
        }
        // 点击放置：目标格的牌先隐身，等外面的浮牌飞到了再显形
        &.incoming > * { opacity: 0; }
      }
    }
    // 大牌型的庆祝浮字：棋盘正中弹出，不挡操作
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
      .celebrate-text {
        font-size: 18px;
        line-height: 1.2;
      }
      .celebrate-score {
        font-size: 14px;
        line-height: 1.2;
        margin-top: 3px;
        opacity: 0.92;
        font-variant-numeric: tabular-nums;
      }
      // 三条是 tier-2、四条 / 同花顺是 tier-3，越高浮字越大、光圈越亮
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
  // 消除：先闪两下（每下暗下去一半）再整体消失 —— 「闪烁然后消除」
  .clearing {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    animation: blink-clear 0.52s ease-in-out forwards;
  }
  @keyframes blink-clear {
    0% { opacity: 1; filter: none; transform: scale(1); }
    16% { opacity: 0.12; }
    32% { opacity: 1; }
    50% { opacity: 0.12; }
    66% { opacity: 1; filter: brightness(1.9); }
    100% { opacity: 0; filter: brightness(2.6); transform: scale(0.72); }
  }
  .drag-ghost {
    position: fixed;
    z-index: 50;
    pointer-events: none;
    transform: translate(-50%, -50%) scale(1.06);
    filter: drop-shadow(0 6px 12px rgb(0 0 0 / 25%));
  }
  // 点击放置的浮牌：靠 transform 从手牌位置平移到目标格并缩小到格子大小
  .fly-card {
    position: fixed;
    z-index: 60;
    pointer-events: none;
    transition: transform 0.2s ease-out;
    filter: drop-shadow(0 4px 10px rgb(0 0 0 / 22%));
  }
}
</style>
