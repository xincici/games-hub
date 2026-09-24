<template>
  <div class="wrapper">
    <TopHeader @onScoreReset="onScoreReset">
      <!-- 模式开关：emoji ↔ 扑克牌（玩法不变，只换牌面与排列；两种牌面的关卡进度各自独立） -->
      <span class="item-wrapper" :title="i18n('modeTip')" @click="toggleMode">
        <i v-if="mode === 1" i-mdi-emoticon-happy-outline />
        <i v-else i-mdi-cards-playing-outline />
      </span>
    </TopHeader>
    <div class="card score-area">
      <div class="stat">
        <span class="stat-label">{{ i18n('levelLabel') }}</span>
        <span class="stat-value">{{ level }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('bestLevel') }}</span>
        <span class="stat-value">{{ bestLevel }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('leftPairs') }}</span>
        <span class="stat-value">{{ leftPairs }}</span>
      </div>
      <!-- 本关进度条（已消除对数 / 总对数） -->
      <div class="progress"><div class="progress-bar" :style="{ width: `${progress}%` }"></div></div>
    </div>
    <div class="card opt-area">
      <div class="opt-half"><span class="level-note">{{ boardLabel }}</span></div>
      <div class="divider"></div>
      <!-- 观察倒计时 / 操作倒计时就在「新游戏」左边（👀 = 观察阶段，⏳ = 操作阶段） -->
      <div class="opt-half">
        <span class="time-note" :class="{ urgent: phase === PLAY && timeLeft <= 15 }">
          {{ phase === PREVIEW ? '👀' : '⏳' }} {{ fmt(phase === PREVIEW ? previewLeft : timeLeft) }}
        </span>
      </div>
      <div class="divider"></div>
      <div class="start-wrapper">
        <button @click="confirming = true" class="game-icon">{{ i18n('start') }}</button>
      </div>
      <!-- 只负责计时与每秒回调（时间已经显示在顶部统计条里，这里不显示数字） -->
      <CountTimer ref="timerRef" :enable="phase === PLAY && !finished" :on-tick="onTimerTick" :show="false" />
    </div>
    <div class="game-area">
      <div class="board dot-board" :class="{ poker: mode === 2, instant }" :style="boardStyle">
        <div
          v-for="(card, idx) in cards"
          :key="card.id"
          class="tile"
          :class="{ flipped: card.flipped, matched: card.matched, settled: card.settled }"
          :style="{ animationDelay: `${idx * 25}ms` }"
          @click="onCardClick(card)"
        >
          <div class="card-inner">
            <!-- 牌背 / 牌面：emoji 模式用游戏图标与 emoji，扑克模式整个交给 CardItem -->
            <div class="face back-face">
              <i v-if="mode === 1" :class="BACK_ICON" />
              <CardItem v-else mini :style="cardVars" />
            </div>
            <div class="face front-face">
              <template v-if="mode === 1">{{ card.item }}</template>
              <CardItem v-else mini :num="card.item.num" :type="card.item.type" :style="cardVars" />
            </div>
          </div>
        </div>
      </div>
      <!-- 连击提示：落在棋盘上方那条 16px 的空隙里（放在 .board 外层，与小游戏里的约定一致） -->
      <div
        v-if="comboTip"
        :key="comboTip.id"
        class="combo-tip"
        :class="`n-${Math.min(comboTip.n, 4)}`"
      >{{ i18n('comboTip').replace('{n}', comboTip.n) }}</div>
      <div v-if="phase === WON" class="result win">
        <div>🎉🎉 {{ i18n('levelDone').replace('{n}', level) }} 🎉🎉</div>
        <div class="final-time">{{ fmt(usedTime) }}</div>
        <button class="game-icon" @click="nextLevel">{{ i18n('nextLevel') }}</button>
      </div>
      <div v-else-if="phase === OVER" class="result lose">
        <div>⏰ {{ i18n('timeUp') }} ⏰</div>
        <div class="final-time">{{ leftPairs }} {{ i18n('leftPairsShort') }}</div>
        <button class="game-icon" @click="replayLevel">{{ i18n('replayLevel') }}</button>
      </div>
    </div>
    <!-- 共用的二次确认弹窗（文案与样式都在 shared/ConfirmDialog.vue 里） -->
    <ConfirmDialog :show="confirming" @confirm="startNewGame" @cancel="confirming = false" />
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';

import TopHeader from '@/components/TopHeader.vue';
import CountTimer from '@/shared/CountTimer.vue';
import ConfirmDialog from '@/shared/ConfirmDialog.vue';
import confetti, { burstConfetti } from '@/shared/confetti';
import { i18n } from '@/shared/i18n';
import { gameConfig } from '@/shared/games';
import { EMOJIS } from '@/shared/emojis';
// 扑克牌面直接复用扑克游戏的 CardItem（纯展示组件，没有扑克那边的状态依赖）
import CardItem from '@/games/poker/CardItem.vue';
import { levelConfig } from './board';

// 牌背用的是本游戏在首页的图标（同一个 id 在 games.js 里注册，改图标两处一起变）
const BACK_ICON = gameConfig('match').icon;

// 闯关制：每关一副新牌，难度由「棋盘大小 + 观察时间 + 操作限时」决定（曲线见 board.js），
// 第 11 关封顶、关数无限。一关分两段：PREVIEW 全体正面朝上供观察（不计时），
// 观察结束翻面进入 PLAY，开始限时倒计时；限时内清空全部牌即过关
const [PREVIEW, PLAY, WON, OVER] = ['preview', 'play', 'won', 'over'];
const KEY_PREFIX = '__emoji_match__';
const LEVEL_KEY = `${KEY_PREFIX}level`;   // 当前关卡（两种牌面各存一份）
const BEST_KEY = `${KEY_PREFIX}best_1`;   // 历史最高关卡（沿用「前缀+数字」以便连点标题清记录）
const MODE_KEY = `${KEY_PREFIX}mode`;
const STATE_KEY = `${KEY_PREFIX}state`;   // 局面 + 用时 + 胜负结算（两种牌面各存一份，_2 后缀）

const CARD_RATIO = 1.5;   // 与 CardItem 的 60×90 一致
const CARD_MAX_W = 64;    // 扑克牌再大就失真了
const EMOJI_MAX_W = 96;   // 2×3 这种小盘面别把牌撑得太夸张
const CARD_TYPES = ['spade', 'club', 'heart', 'diamond'];

const mode = ref(+(localStorage.getItem(MODE_KEY) || 1) === 2 ? 2 : 1);
const modeSuffix = (m) => (m === 2 ? '_2' : '');
const levelKeyFor = (m) => `${LEVEL_KEY}${modeSuffix(m)}`;
const bestKeyFor = (m) => `${BEST_KEY}${modeSuffix(m)}`;
const stateKeyFor = (m) => `${STATE_KEY}${modeSuffix(m)}`;
const loadLevel = (m) => Math.max(1, Math.floor(+(localStorage.getItem(levelKeyFor(m)) || 1)) || 1);

const level = ref(loadLevel(mode.value));
const bestLevel = ref(Math.max(level.value, Math.floor(+(localStorage.getItem(bestKeyFor(mode.value)) || 1)) || 1));
const cards = ref([]);
const phase = ref(PREVIEW);
const previewLeft = ref(0);
const elapsed = ref(0);
const usedTime = ref(0);
const confirming = ref(false);
const timerRef = ref(null);
// 还原存档时置位：棋盘不重播发牌动画（已消除的牌还会单独打 settled，见下）
const instant = ref(false);
// 已清空（等演出结束）：期间切后台再回来，计时器也不能被 visibilitychange 重新拉起
const finished = ref(false);

const conf = computed(() => levelConfig(level.value, mode.value));
const rows = computed(() => conf.value.rows);
const cols = computed(() => conf.value.cols);
const pairs = computed(() => conf.value.pairs);
// 牌越小缝越窄，保证大关卡也放得下（由对数决定，与格子尺寸无关，避免循环依赖）
const gap = computed(() => (pairs.value <= 6 ? 6 : pairs.value <= 12 ? 4 : 3));
const leftPairs = computed(() => cards.value.filter(c => !c.matched).length / 2);
const timeLeft = computed(() => Math.max(0, conf.value.time - elapsed.value));
const progress = computed(() => Math.min(100, Math.round(((pairs.value - leftPairs.value) / pairs.value) * 100)));
const boardLabel = computed(() => `${rows.value}×${cols.value} · ${i18n('pairsLabel').replace('{n}', pairs.value)}`);

// 格子尺寸：emoji 模式是正方形，只受宽度限制；扑克模式是 2:3 的长方形，
// 还要把 rows 行塞进可用高度，所以再按高度反推一次宽度
const metrics = computed(() => {
  const boardW = Math.min(window.innerWidth || 420, 440) - 32;   // game-area 宽
  const availH = Math.max(200, (window.innerHeight || 700) - 262);
  const ratio = mode.value === 2 ? CARD_RATIO : 1;
  const byW = Math.floor((boardW - 12 - (cols.value - 1) * gap.value) / cols.value);
  const byH = Math.floor(((availH - 12 - (rows.value - 1) * gap.value) / rows.value) / ratio);
  const cap = mode.value === 2 ? CARD_MAX_W : EMOJI_MAX_W;
  const w = Math.max(12, Math.min(cap, byW, byH));
  return { w, h: Math.round(w * ratio) };
});
const boardStyle = computed(() => ({
  '--n': cols.value,
  '--tile-w': `${metrics.value.w}px`,
  '--tile-h': `${metrics.value.h}px`,
  '--gap': `${gap.value}px`,
  // emoji 字号跟着格子走（旧实现是每档写死 28/19/14px）
  '--face-font': `${Math.max(11, Math.round(metrics.value.w * 0.42))}px`,
}));
// 交给 poker 的 CardItem 的尺寸变量（内联传进去：不用改扑克那边的样式，也不受 scoped 影响）
const cardVars = computed(() => {
  const w = metrics.value.w;
  return {
    // -2 是 CardItem 那张牌自己的左右 / 上下 1px 描边（content-box）
    '--width': `${Math.max(8, w - 2)}px`,
    '--height': `${Math.max(8, metrics.value.h - 2)}px`,
    '--margin': '0px',
    '--radius': `${Math.max(2, Math.round(w * 0.07))}px`,
    '--pos': `${Math.max(1, Math.round(w * 0.07))}px`,
    '--text-size': `${Math.max(7, Math.round(w * 0.26))}px`,
    '--icon-size': `${Math.max(10, Math.round(w * 0.56))}px`,
    '--back-size': `${Math.max(12, Math.round(w * 0.68))}px`,
  };
});

// 连击：两次消除之间没有翻错、且间隔在 COMBO_MS 内才算连上（与连连看同款规则）
const COMBO_MS = 2500;        // 连击窗口
const COMBO_TIP_MS = 1500;    // 提示条停留时长（比窗口短一点，收得干净）
const FIRE_DROP_PX = 30;      // 烟花喷发点 = 提示条中心再往下这么多
const comboTip = ref(null);   // { id, n }
const combo = ref(0);
let lastClearAt = 0;
let comboBroken = false;
let comboTimer = null;
let comboTipTimer = null;
let comboSeq = 0;

let cardId = 0;
let firstCard = null;
let lock = false;
let previewTimer = null;
let previewTick = null;
let mismatchTimer = null;
let winTimer = null;

onMounted(() => {
  // 先看有没有退出前的局面：局中接着打、胜负结算就停在浮层上等玩家点按钮
  const saved = restore();
  if (saved) initLevel(saved.level, saved);
  else initLevel(level.value);
});
onUnmounted(clearTransient);

function fmt(sec) {
  return ('00' + ~~(sec / 60)).slice(-2) + ':' + ('00' + sec % 60).slice(-2);
}

// 牌池：emoji 模式取 pairs 个不同 emoji；扑克模式取 pairs 张不同的牌
//（一副 52 张，最高关 24 对也够），再各复制一份凑成对
function drawPool(pairs) {
  if (mode.value === 1) return shuffle(EMOJIS).slice(0, pairs);
  const deck = [];
  CARD_TYPES.forEach(type => {
    for (let num = 1; num <= 13; num++) deck.push({ num, type });
  });
  return shuffle(deck).slice(0, pairs);
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = ~~(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function clearTransient() {
  clearTimeout(previewTimer);
  clearInterval(previewTick);
  clearTimeout(mismatchTimer);
  clearTimeout(winTimer);
  clearTimeout(comboTimer);
  clearTimeout(comboTipTimer);
  previewTimer = null;
  previewTick = null;
  comboTimer = null;
  comboTipTimer = null;
  comboTip.value = null;
  combo.value = 0;
  lastClearAt = 0;
  comboBroken = false;
  lock = false;
  firstCard = null;
}

// 存档：**只在分出胜负时落档**（胜利 / 失败都保留结算局面，重进仍停在浮层上
// 由玩家自己点「下一关 / 重玩本关」）。局中（观察 / 操作阶段）不落档 ——
// 没打完的一关退出或切牌面都直接重开本关，见 restore()
function save() {
  try {
    localStorage.setItem(stateKeyFor(mode.value), JSON.stringify({
      level: level.value,
      mode: mode.value,
      phase: phase.value,
      elapsed: elapsed.value,
      usedTime: usedTime.value,
      cards: cards.value.map(c => [c.item, c.matched ? 1 : 0]),
    }));
  } catch { /* 隐私模式等写不进去的场景忽略 */ }
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(stateKeyFor(mode.value)));
    if (!saved || !Array.isArray(saved.cards) || !saved.cards.length) return null;
    if (saved.mode !== mode.value) return null;                        // 牌面换过了，这份存档不接
    const lv = Math.max(1, +saved.level || 1);
    const c = levelConfig(lv, mode.value);
    if (saved.cards.length !== c.pairs * 2) return null;               // 牌数和这一关对不上
    // 全部消完却还停在 PLAY：退出时正好卡在 1.5s 过关演出里，按胜利结算
    const allMatched = saved.cards.every(([, matched]) => matched);
    const phase = allMatched ? WON : saved.phase;
    // 只有分出胜负的局面才续上；局中（观察 / 操作中）退出或切牌面一律重开本关
    if (phase !== WON && phase !== OVER) return null;
    return {
      level: lv,
      phase,
      elapsed: Math.max(0, +saved.elapsed || 0),
      usedTime: Math.max(0, +saved.usedTime || 0),
      cards: saved.cards.map(([item, matched]) => ({ item, matched: !!matched })),
    };
  } catch {
    return null;
  }
}

// 开始一关：先全体正面朝上供观察，观察结束才翻面并开始计时。
// 传了 restored 就是接着退出前的局面（局中续打，或停在胜负结算层）
function initLevel(lv, restored = null) {
  clearTransient();
  confirming.value = false;
  level.value = Math.max(1, lv);
  localStorage.setItem(levelKeyFor(mode.value), level.value);
  if (level.value > bestLevel.value) {
    bestLevel.value = level.value;
    localStorage.setItem(bestKeyFor(mode.value), bestLevel.value);
  }
  finished.value = false;
  if (restored) {
    // 只有 WON / OVER 会走到这里（restore 已经把局中的存档挡掉了）
    instant.value = true;
    elapsed.value = restored.elapsed;
    usedTime.value = restored.usedTime;
    phase.value = restored.phase;
    // 失败结算要把没消掉的牌亮着（时间到就摊牌）；胜利时已经全消完
    const faceUp = phase.value === OVER;
    cards.value = restored.cards.map(c => ({
      id: ++cardId,
      item: c.item,
      matched: c.matched,
      // settled：这张牌在存档里就已经消掉了 → 直接画成「已消失」，不重播闪烁 + 消除动画
      settled: c.matched,
      flipped: !c.matched && faceUp,
    }));
    // 计时停住，等玩家自己点「下一关 / 重玩本关」
    finished.value = true;
    timerRef.value?.reset();
    timerRef.value?.stop();
    return;
  }
  // 全新一关：清掉上一关留下的存档（否则重进会拿旧的结算浮层）
  localStorage.removeItem(stateKeyFor(mode.value));
  instant.value = false;   // 全新一关：正常播发牌动画
  elapsed.value = 0;
  usedTime.value = 0;
  const c = conf.value;
  const pool = drawPool(c.pairs);
  cards.value = shuffle([...pool, ...pool]).map(item => ({
    id: ++cardId,
    item,
    flipped: true,
    matched: false,
    settled: false,
  }));
  phase.value = PREVIEW;
  previewLeft.value = c.preview;
  // 观察期间计时器必须停着：reset() 会顺带 start()，所以再 stop 一次
  timerRef.value?.reset();
  timerRef.value?.stop();
  startPreviewCountdown();
}

// 观察倒计时（每秒减 1，到点翻面开始正式计时）
function startPreviewCountdown() {
  previewTick = setInterval(() => {
    previewLeft.value = Math.max(0, previewLeft.value - 1);
  }, 1000);
  previewTimer = setTimeout(endPreview, Math.max(0, previewLeft.value) * 1000);
}

function endPreview() {
  clearTimeout(previewTimer);
  clearInterval(previewTick);
  previewTimer = null;
  previewTick = null;
  cards.value.forEach(card => { card.flipped = false; });
  phase.value = PLAY;
  timerRef.value?.reset();   // 从 0 开始正式计时
}

// 每秒回调：同步已用时间，时间用尽即失败
function onTimerTick() {
  elapsed.value = timerRef.value?.seconds() || 0;
  if (phase.value !== PLAY) return;
  if (timeLeft.value <= 0) loseLevel();
}

function nextLevel() {
  initLevel(level.value + 1);
}

function replayLevel() {
  initLevel(level.value);
}

// 新游戏：二次确认后清掉当前牌面的记录，从第 1 关重新开始（另一种牌面完全不动）
function startNewGame() {
  confirming.value = false;
  localStorage.removeItem(bestKeyFor(mode.value));
  localStorage.removeItem(levelKeyFor(mode.value));
  bestLevel.value = 1;
  initLevel(1);
}

// 连点标题清记录：两种牌面的最高关卡一起清
function onScoreReset() {
  localStorage.removeItem(bestKeyFor(1));
  localStorage.removeItem(bestKeyFor(2));
  bestLevel.value = Math.max(1, level.value);
}

// 切换牌面：接着另一种牌面自己的进度 —— 有存档就先还原（局中接着打 / 停在胜负结算），
// 没有才重新发它自己那一关。存档是按牌面分开的，所以切走再切回来不会丢
function toggleMode() {
  clearTransient();
  mode.value = mode.value === 1 ? 2 : 1;
  localStorage.setItem(MODE_KEY, String(mode.value));
  const lv = loadLevel(mode.value);
  level.value = lv;
  bestLevel.value = Math.max(lv, Math.floor(+(localStorage.getItem(bestKeyFor(mode.value)) || 1)) || 1);
  const saved = restore();
  if (saved) initLevel(saved.level, saved);
  else initLevel(lv);
}

// 牌面内容的键：emoji 就是它自己，扑克是「点数-花色」
const keyOf = item => (typeof item === 'string' ? item : `${item.num}-${item.type}`);

function onCardClick(card) {
  if (phase.value !== PLAY || lock || card.matched || card.flipped) return;
  card.flipped = true;
  if (!firstCard) {
    firstCard = card;
    return;
  }
  if (keyOf(firstCard.item) === keyOf(card.item)) {
    firstCard.matched = card.matched = true;
    firstCard = null;
    registerClear();
    if (cards.value.every(c => c.matched)) {
      // 清空最后一对的瞬间就停表取成绩，闪烁 + 撒花只是演出，不能算进用时
      usedTime.value = timerRef.value?.seconds() || 0;
      timerRef.value?.stop();
      finished.value = true;
      save();                      // 结算先落档：演出这 1.5s 里退出也能接上胜利局面
      winTimer = setTimeout(win, 1500);
    }
  } else {
    breakCombo();
    lock = true;
    const prev = firstCard;
    firstCard = null;
    mismatchTimer = setTimeout(() => {
      prev.flipped = card.flipped = false;
      lock = false;
    }, 700);
  }
}

function win() {
  if (phase.value !== PLAY) return;   // 期间开了新局 → 这次结算作废
  phase.value = WON;
  timerRef.value?.stop();
  breakCombo();
  save();
  confetti();
}

function loseLevel() {
  if (phase.value !== PLAY) return;
  phase.value = OVER;
  timerRef.value?.stop();
  breakCombo();
  // 时间到：把没消掉的牌全部翻到正面（摊牌），并落档，重进也保持这个画面
  cards.value.forEach(card => { if (!card.matched) card.flipped = true; });
  save();
}

// ---------- 连击 ----------
// 消掉一对就登记；两次消除之间出现过翻错、或间隔超过窗口，就断开
function registerClear() {
  const now = performance.now();
  const chained = lastClearAt > 0 && !comboBroken && now - lastClearAt < COMBO_MS;
  combo.value = chained ? combo.value + 1 : 1;
  lastClearAt = now;
  comboBroken = false;
  clearTimeout(comboTimer);
  comboTimer = setTimeout(breakCombo, COMBO_MS);
  if (combo.value >= 2) showCombo(combo.value);
}

// 烟花喷发点：连击提示条的中心再往下 30px（提示条贴在棋盘上方，所以落点在棋盘顶部内侧）
function comboOrigin() {
  const board = document.querySelector('.board')?.getBoundingClientRect();
  if (!board || !window.innerWidth || !window.innerHeight) return null;
  const tip = document.querySelector('.combo-tip')?.getBoundingClientRect();
  const cy = tip ? tip.top + tip.height / 2 : board.top - 5;
  return {
    x: (board.left + board.width / 2) / window.innerWidth,
    y: (cy + FIRE_DROP_PX) / window.innerHeight,
  };
}

async function showCombo(n) {
  comboTip.value = { id: ++comboSeq, n };
  clearTimeout(comboTipTimer);
  comboTipTimer = setTimeout(() => { comboTip.value = null; }, COMBO_TIP_MS);
  // 等提示条真的渲染出来再量它的位置，喷发点才是「文案下方 30px」
  await nextTick();
  const origin = comboOrigin();
  if (!origin) return;
  burstConfetti(Math.min(3, 1 + (n - 2) * 0.6), {
    origin,
    count: Math.min(44, 12 + n * 4),
  });
}

function breakCombo() {
  combo.value = 0;
  lastClearAt = 0;
  comboBroken = false;
  clearTimeout(comboTimer);
  clearTimeout(comboTipTimer);
  comboTimer = null;
  comboTipTimer = null;
  comboTip.value = null;
}
</script>

<style scoped lang="scss">
@keyframes combo-pop {
  0% { opacity: 0; transform: translate(-50%, 8px) scale(0.6); }
  14% { opacity: 1; transform: translate(-50%, 0) scale(1.12); }
  26%, 78% { opacity: 1; transform: translate(-50%, 0) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -8px) scale(0.96); }
}

@keyframes deal {
  from {
    opacity: 0;
    transform: scale(0.4);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

// card-inner 上的 opacity < 1 会强制 3D 扁平化（preserve-3d 失效），
// 翻面被中断会露出背面，因此明暗闪烁只放在正面 .front-face 上
@keyframes flash {
  0%, 50%, 100% {
    transform: rotateY(180deg) scale(1);
  }
  25%, 75% {
    transform: rotateY(180deg) scale(1.08);
  }
}

@keyframes blink {
  0%, 50%, 100% {
    opacity: 1;
  }
  25%, 75% {
    opacity: 0.15;
  }
}

@keyframes clear {
  to {
    transform: rotateY(180deg) scale(0);
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
    position: relative;
    overflow: hidden;
    margin-top: 64px;
    display: flex;
    align-items: center;
    height: var(--row-height);
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
        // 剩余时间不足 15 秒时标红提醒
        &.urgent {
          color: var(--del-color);
        }
      }
    }
    .progress {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 3px;
      background: var(--border-color);
      .progress-bar {
        height: 100%;
        background: var(--primary-bg);
        transition: width 0.3s ease;
      }
    }
  }
  .opt-area {
    display: flex;
    align-items: center;
    margin: var(--row-gap) 0;
    height: var(--row-height);
    .opt-half {
      flex: 1.3;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .level-note {
      font-size: 13px;
      color: var(--muted-color);
      white-space: nowrap;
    }
    .time-note {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 17px;
      font-weight: 600;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
      // 剩余时间不足 15 秒时标红提醒
      &.urgent {
        color: var(--del-color);
      }
    }
    .start-wrapper {
      flex: 1.5;
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
    width: calc(100% - 32px);
    max-width: 440px;
    box-sizing: border-box;
  }
  // 轨道与格子尺寸都由 JS 算好（--tile-w / --tile-h / --gap）：
  // emoji 模式是正方形，扑克模式是 2:3 的长方形，没法再用 1fr + aspect-ratio: 1
  .board {
    display: grid;
    grid-template-columns: repeat(var(--n), var(--tile-w));
    grid-auto-rows: var(--tile-h);
    gap: var(--gap);
    padding: 6px;
    width: fit-content;
    margin: 0 auto;
    box-sizing: border-box;
    border-radius: var(--card-radius);
    // 还原存档：牌已经摆好了，不重播逐张入场的发牌动画
    &.instant .tile {
      animation: none;
    }
    // emoji 字号由 JS 按格子尺寸算好（--face-font）
    .face { font-size: var(--face-font); }
    // 扑克模式：牌面（含牌背）整个由 poker 的 CardItem 渲染，
    // 外面这层只留 3D 翻面与「配对成功」的闪烁
    // CardItem 的 .card 是「1px 描边 + content-box」，实际比 wrapper 宽 2px；wrapper 又会被
    // 外框的 1px 边框挤窄再居中，牌按 left: 0 贴左边 → 多出的 2px 全跑到右侧，看着就偏右。
    // 所以外框不要边框、宽度按「格子 - 2」传、牌绝对定位到左上角，牌的外框正好等于格子
    &.poker .face {
      border: 0 none;
      background: transparent;
      box-shadow: none;
    }
    &.poker .face .card-wrapper {
      position: absolute;
      left: 0;
      top: 0;
    }
  }
  // 棋盘卡片用 .tile 而非 .card：避免命中上方 .wrapper .card 的
  // width: calc(100% - 32px) 等面板样式，导致卡片变窄且非正方形
  .tile {
    perspective: 600px;
    cursor: pointer;
    animation: 0.35s ease backwards deal;
    -webkit-tap-highlight-color: transparent;
    &.matched {
      pointer-events: none;
      // 翻面 transition 0.45s → 先闪烁再消除，动画串行衔接
      .card-inner {
        animation: flash 0.6s ease 0.45s, clear 0.35s ease 1.05s forwards;
        .front-face {
          animation: blink 0.6s ease 0.45s;
        }
      }
    }
    // 还原存档时「早就消掉的牌」直接停在消除完成的状态：
    // 否则重进游戏会看到它们又闪一次再消失（玩家反馈的 bug）
    &.matched.settled .card-inner {
      animation: none;
      transform: rotateY(180deg) scale(0);
      .front-face {
        animation: none;
      }
    }
    .card-inner {
      position: relative;
      width: 100%;
      height: 100%;
      transform-style: preserve-3d;
      transition: transform 0.45s ease-in-out;
    }
    &.flipped .card-inner {
      transform: rotateY(180deg);
    }
    .face {
      position: absolute;
      inset: 0;
      box-sizing: border-box;
      border-radius: var(--radius-tile);
      border: 1px solid var(--tile-border-color);
      box-shadow: var(--shadow-soft);
      display: flex;
      align-items: center;
      justify-content: center;
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
    }
    .back-face {
      background: var(--primary-bg);
      color: #fff;
    }
    .front-face {
      background: var(--card-bg-color);
      transform: rotateY(180deg);
    }
  }
  .result {
    position: absolute;
    width: 100%;
    height: 100%;
    left: 0;
    top: 0;
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
    text-align: center;
    &.lose {
      color: var(--lose-color);
    }
    .final-time {
      font-size: 28px;
    }
  }
  // 连击提示：贴在棋盘上方那 16px 空隙里（与连连看 / 消消乐同款位置与动画）
  .combo-tip {
    position: absolute;
    left: 50%;
    top: -15px;
    z-index: 5;
    padding: 2px 10px;
    border-radius: var(--radius-tile);
    background: var(--primary-bg);
    color: #fff;
    font-size: 12.5px;
    font-weight: bold;
    line-height: 1.1;
    white-space: nowrap;
    box-shadow: var(--card-shadow);
    pointer-events: none;
    animation: combo-pop 1.5s ease forwards;
    // 连得越高字越大
    &.n-3 { font-size: 14px; }
    &.n-4 { font-size: 16px; }
  }
}
</style>
