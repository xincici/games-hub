<template>
  <div class="wrapper">
    <TopHeader @onScoreReset="onScoreReset">
      <!-- 模式开关：emoji ↔ 扑克牌（玩法不变，只换牌面与排列） -->
      <span class="item-wrapper" :title="i18n('modeTip')" @click="toggleMode">
        <i v-if="mode === 1" i-mdi-emoticon-happy-outline />
        <i v-else i-mdi-cards-playing-outline />
      </span>
    </TopHeader>
    <div class="card score-area">
      <div class="stat">
        <span class="stat-label">{{ i18n('bestScore') }}</span>
        <span class="stat-value">{{ bestLevel || '--' }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('livesLabel') }}</span>
        <span class="stat-value stat-hearts"><Hearts :left="hearts" :max="HEARTS_MAX" /></span>
      </div>
    </div>
    <div class="card opt-area">
      <div class="difficulty-wrapper">
        <span class="difficulty-value">{{ rows }}×{{ cols }} · {{ mode === 2 ? i18n('modePoker') : i18n('modeEmoji') }}</span>
      </div>
      <div class="divider"></div>
      <div class="opt-half">
        <CountTimer ref="timerRef" :enable="timerRunning" />
      </div>
      <div class="divider"></div>
      <div class="start-wrapper">
        <button @click="initGame" class="game-icon">{{ i18n('start') }}</button>
      </div>
    </div>
    <div class="game-area" :style="{ '--tip-band': `${TIP_BAND}px` }">
      <div class="board-frame dot-board" :style="boardStyle">
        <div class="board" :class="{ poker: mode === 2 }">
          <div v-for="(cell, idx) in board" :key="idx" class="cell">
            <div
              class="card-flip"
              :class="{ flipped: isFaceDown(idx), shaking: shakeIdx === idx, revealed: phase === WON && idx === swappedIdx, wrong: wrongIdxs.includes(idx) }"
              @click="onCellClick(idx)"
            >
              <!-- 牌背：emoji 模式用游戏图标，扑克模式复用扑克那边的迷你牌背 -->
              <div class="face back-face">
                <i v-if="mode === 1" :class="BACK_ICON" />
                <CardItem v-else mini :style="cardVars" />
              </div>
              <div class="face front-face">
                <template v-if="mode === 1">{{ cell }}</template>
                <CardItem v-else mini :num="cell.num" :type="cell.type" :style="cardVars" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-if="phase === MEMORY" class="phase-tip floating">{{ i18n('phaseMemory') }}</div>
      <div v-else-if="phase === FLIP" class="phase-tip floating">{{ i18n('phaseFlip') }}</div>
      <div v-else-if="phase === ANSWER" class="phase-tip floating">{{ i18n(mode === 2 ? 'phaseAnswerCard' : 'phaseAnswer') }}</div>
      <div v-if="phase === WON" class="result win">
        <span>🎉🎉 {{ i18n('tipWin') }} 🎉🎉</span>
        <div class="result-actions">
          <button class="game-icon" @click="retryLevel">{{ i18n('retry') }}</button>
          <button class="game-icon primary" @click="nextLevel">{{ i18n('nextLevel') }}</button>
        </div>
      </div>
      <div v-else-if="phase === LOST" class="result lose">
        <span>👻👻 {{ i18n('tipLost') }} 👻👻</span>
        <div class="result-actions">
          <button class="game-icon primary" @click="retryLevel">{{ i18n('retry') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';

import TopHeader from '@/components/TopHeader.vue';
import CountTimer from '@/shared/CountTimer.vue';
import Hearts from '@/shared/Hearts.vue';
import confetti from '@/shared/confetti';
import { i18n } from '@/shared/i18n';
import { gameConfig } from '@/shared/games';
import { EMOJIS } from '@/shared/emojis';
// 扑克牌面直接复用扑克游戏的 CardItem（纯展示组件：只吃 num/type/hold/mini
// 与几个 CSS 变量，没有扑克那边的状态依赖），换牌面不换玩法
import CardItem from '@/games/poker/CardItem.vue';

// 1×3 / 2×2 / 2×3 / 2×4 / 3×3 / 3×4 / 3×5 / 4×4 / 4×5 共 9 关；观察时长随棋盘增大递增
// 牌背用的是本游戏在首页的图标（与 games.js 里注册的是同一个，改图标两处一起变）
const BACK_ICON = gameConfig('detective').icon;

// emoji 模式：1×3 → 4×5 共九关
const EMOJI_SIZES = [[1, 3], [2, 2], [2, 3], [2, 4], [3, 3], [3, 4], [3, 5], [4, 4], [4, 5]];
const EMOJI_MEMORIES = [2000, 2500, 3000, 3500, 4000, 4500, 5000, 6000, 7000];
// 扑克模式：牌面有花色 + 点数两层线索，比 emoji 好记，所以同一关的牌数更多、
// 关卡也多一关；牌是 2:3 的长方形，列数放得下就多排一列、行数尽量压住高度
const CARD_SIZES = [[1, 4], [2, 3], [2, 4], [2, 5], [3, 4], [3, 5], [3, 6], [4, 5], [4, 6], [4, 7]];
const CARD_MEMORIES = [2000, 2600, 3000, 3400, 3800, 4500, 5000, 5500, 6500, 7500];
// 扑克牌的宽高比（与 CardItem 的 60×90 一致）
const CARD_RATIO = 1.5;
// 阶段提示条独占的空白带：棋盘整体下移这么多，提示落在带子里、不再压住第一行牌
const TIP_BAND = 28;
// 一副牌：4 花色 × A~K（CardItem 的 num 1~13，type 见下）
const CARD_TYPES = ['spade', 'club', 'heart', 'diamond'];
const FLIP_MS = 1000;
const [MEMORY, FLIP, ANSWER, WON, LOST] = ['memory', 'flip', 'answer', 'won', 'lost'];
const KEY_PREFIX = '__emoji_detective__';
const LEVEL_KEY = `${KEY_PREFIX}level`;
const BEST_KEY = `${KEY_PREFIX}best`;
// 模式与关卡进度、最高关卡、当前局面都分开存：emoji 沿用不带后缀的老 key
// （已经玩过的进度不丢），扑克用 _2 后缀
const MODE_KEY = `${KEY_PREFIX}mode`;
const mode = ref(+(localStorage.getItem(MODE_KEY) || 1) === 2 ? 2 : 1);
const modeSuffix = () => (mode.value === 2 ? '_2' : '');
const levelKey = () => `${LEVEL_KEY}${modeSuffix()}`;
const bestKey = () => `${BEST_KEY}${modeSuffix()}`;
const sizes = computed(() => (mode.value === 2 ? CARD_SIZES : EMOJI_SIZES));
const memories = computed(() => (mode.value === 2 ? CARD_MEMORIES : EMOJI_MEMORIES));

const level = ref(0);
const phase = ref(MEMORY);
const board = ref([]);
const swappedIdx = ref(-1);
const shakeIdx = ref(-1);
// 选错的牌：常驻红色标记，并且不能再点（否则同一张能被反复点、反复扣心）
const wrongIdxs = ref([]);
const memoryLeft = ref(0);
const HEARTS_MAX = 3;      // 每局 3 颗心
const hearts = ref(HEARTS_MAX);
const bestLevel = ref(+(localStorage.getItem(bestKey()) || 0));
const timerRef = ref(null);

const size = computed(() => sizes.value[level.value]);
const rows = computed(() => size.value[0]);
const cols = computed(() => size.value[1]);

// 格子边长：96px 封顶，窄屏按视口可用宽均分。
// CSS 自定义属性里的 % 是惰性求值、无法可靠用于 grid 列宽，故由 JS 计算
const CELL_MAX = 96;      // emoji（正方形）的边长上限
const CARD_MAX_W = 64;    // 扑克牌（2:3）的宽度上限，贴近扑克那边的 60×90
const GAP = 6;
// 格子尺寸同时受宽与高约束：扑克牌高是宽的 1.5 倍，行数一多就得靠高度反推宽度，
// 否则小屏（568 高）上四行牌会顶出屏幕
const metrics = computed(() => {
  const availW = Math.min(window.innerWidth || 420, 440) - 32;   // game-area 宽
  // 标题栏 + 统计条 + 操作区 + 提示带
  const availH = Math.max(200, (window.innerHeight || 700) - 262 - TIP_BAND);
  const c = cols.value;
  const r = rows.value;
  const byW = Math.floor((availW - 2 * GAP - (c - 1) * GAP) / c);
  const byH = Math.floor((availH - 2 * GAP - (r - 1) * GAP) / r);
  const ratio = mode.value === 2 ? CARD_RATIO : 1;
  const cap = mode.value === 2 ? CARD_MAX_W : CELL_MAX;
  const cell = Math.max(14, Math.min(cap, byW, Math.floor(byH / ratio)));
  return { cell, cellH: Math.round(cell * ratio) };
});
const boardStyle = computed(() => ({
  '--cols': cols.value,
  '--rows': rows.value,
  '--gap': `${GAP}px`,
  '--cell': `${metrics.value.cell}px`,
  '--cell-h': `${metrics.value.cellH}px`,
}));
// 交给 CardItem 的尺寸：它是靠这几个 CSS 变量定尺寸与字号的，内联进来最省事
// （不用改扑克那边的样式，也不受 scoped 样式的影响）
const cardVars = computed(() => {
  const w = metrics.value.cell;
  return {
    // -2 是 CardItem 那张牌自己的左右 / 上下 1px 描边（content-box）
    '--width': `${Math.max(8, w - 2)}px`,
    '--height': `${Math.max(8, metrics.value.cellH - 2)}px`,
    '--margin': '0px',
    '--radius': `${Math.max(2, Math.round(w * 0.07))}px`,
    '--pos': `${Math.max(1, Math.round(w * 0.07))}px`,
    '--text-size': `${Math.max(7, Math.round(w * 0.26))}px`,
    '--icon-size': `${Math.max(10, Math.round(w * 0.56))}px`,
    '--back-size': `${Math.max(12, Math.round(w * 0.68))}px`,
  };
});
// 全程计时（观察/翻面/作答都在走），仅结算后暂停
const timerRunning = computed(() => phase.value !== WON && phase.value !== LOST);

let memoryTimer = null;
let memoryTicker = null;
let flipTimer = null;

onMounted(bootMode);

onUnmounted(clearTimers);

function clearTimers() {
  clearTimeout(memoryTimer);
  clearInterval(memoryTicker);
  clearTimeout(flipTimer);
}

// ---------- 关卡流程 ----------

function pickEmojis(n) {
  const pool = [...EMOJIS];
  const out = [];
  for (let i = 0; i < n; i++) {
    const j = ~~(Math.random() * pool.length);
    out.push(pool.splice(j, 1)[0]);
  }
  return out;
}

// 一副牌（52 张，四花色 × A~K），洗好后取前 n 张
function drawCards(n) {
  const deck = [];
  CARD_TYPES.forEach(type => {
    for (let num = 1; num <= 13; num++) deck.push({ num, type });
  });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = ~~(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, n);
}

// 盘面内容：emoji 模式是 emoji 字符串，扑克模式是 { num, type }
const keyOf = item => (typeof item === 'string' ? item : `${item.num}-${item.type}`);
const newBoard = n => (mode.value === 2 ? drawCards(n) : pickEmojis(n));

// 偷换成一张盘面上还没有的牌（emoji / 扑克都一样）
function pickReplacement() {
  const used = new Set(board.value.map(keyOf));
  for (let t = 0; t < 200; t++) {
    const cand = mode.value === 2
      ? { num: 1 + ~~(Math.random() * 13), type: CARD_TYPES[~~(Math.random() * CARD_TYPES.length)] }
      : EMOJIS[~~(Math.random() * EMOJIS.length)];
    if (!used.has(keyOf(cand))) return cand;
  }
  return null;
}

// 某格当前是否背面朝上：仅翻面阶段全部背面，其余阶段全部正面
function isFaceDown(idx) {
  return phase.value === FLIP;
}

// 开始某一关：随机盘面 + 观察倒计时 → 全部翻面 → 偷换 → 翻回 → 作答
function startLevel() {
  clearTimers();
  swappedIdx.value = -1;
  wrongIdxs.value = [];
  hearts.value = HEARTS_MAX;
  const n = rows.value * cols.value;
  board.value = newBoard(n);
  phase.value = MEMORY;
  const ms = memories.value[level.value];
  memoryLeft.value = Math.ceil(ms / 1000);
  memoryTicker = setInterval(() => {
    memoryLeft.value = Math.max(0, memoryLeft.value - 1);
  }, 1000);
  memoryTimer = setTimeout(() => {
    clearInterval(memoryTicker);
    flipPhase();
  }, ms);
  timerRef.value?.reset();
  save();
}

// 全部翻面；翻面动画进行中偷换一个 emoji，停 1s 后翻回（被换的牌保持背面）
function flipPhase() {
  phase.value = FLIP;
  const swapAt = 250; // 翻面动画（0.45s）过半时偷换，玩家看不清替换瞬间
  setTimeout(() => {
    if (phase.value !== FLIP) return;
    const idx = ~~(Math.random() * board.value.length);
    const replacement = pickReplacement();
    if (replacement == null) { startLevel(); return; } // 极端兜底
    swappedIdx.value = idx;
    board.value[idx] = replacement;
  }, swapAt);
  flipTimer = setTimeout(() => {
    if (phase.value !== FLIP) return;
    phase.value = ANSWER;
    save();
  }, FLIP_MS);
}

// 点击盘面卡片作答：翻回后全部正面朝上（含被换的），
// 玩家凭记忆点出被换的那张；点其它牌 → 短暂抖动
function onCellClick(idx) {
  if (phase.value !== ANSWER) return;
  if (wrongIdxs.value.includes(idx)) return;   // 已经标错的牌不再响应
  if (idx === swappedIdx.value) {
    phase.value = WON;
    timerRef.value?.stop();
    if (level.value + 1 > bestLevel.value) {
      bestLevel.value = level.value + 1;
      localStorage.setItem(bestKey(), bestLevel.value);
    }
    confetti();
    save();
  } else {
    wrongIdxs.value = [...wrongIdxs.value, idx];
    shakeIdx.value = idx;
    hearts.value = Math.max(0, hearts.value - 1);
    if (hearts.value <= 0) {
      // 生命耗尽：失败结算，计时器停止
      setTimeout(() => {
        phase.value = LOST;
        timerRef.value?.stop();
        save();
      }, 600);
    }
    setTimeout(() => {
      if (shakeIdx.value === idx) shakeIdx.value = -1;
    }, 600);
    save();
  }
}

function nextLevel() {
  if (level.value < sizes.value.length - 1) level.value++;
  startLevel();
}

function retryLevel() {
  startLevel();
}

function initGame() {
  level.value = 0;
  startLevel();
}

// 切换牌面：先把当前模式的局面落档，再按另一种模式自己的存档接着玩
function toggleMode() {
  save();
  clearTimers();
  mode.value = mode.value === 1 ? 2 : 1;
  localStorage.setItem(MODE_KEY, String(mode.value));
  bestLevel.value = +(localStorage.getItem(bestKey()) || 0);
  bootMode();
}

// 进入当前模式的局面：有存档就接着玩（restore 内部会处理），没有就开新的一局
function bootMode() {
  if (!restore()) initGame();
}

// ---------- 存档 ----------

function save() {
  localStorage.setItem(levelKey(), JSON.stringify({
    level: level.value,
    hearts: hearts.value,
    phase: phase.value,
    time: timerRef.value?.seconds() || 0,
    // 这一局的盘面与「被偷换的那张」：胜利结算层要连牌一起还原，
    // 回来时才是同一张盘、同一个答案
    board: board.value,
    swapped: swappedIdx.value,
    wrong: wrongIdxs.value,
  }));
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(levelKey()));
    if (!saved || typeof saved.level !== 'number') return false;
    level.value = Math.min(sizes.value.length - 1, Math.max(0, saved.level));
    // 胜利结算局面：原样还原那一盘并亮出答案，由玩家自己决定点「重玩本关」还是「下一关」
    if (saved.phase === WON && Array.isArray(saved.board)
      && saved.board.length === rows.value * cols.value) {
      board.value = saved.board;
      swappedIdx.value = Number.isInteger(+saved.swapped) ? +saved.swapped : -1;
      wrongIdxs.value = Array.isArray(saved.wrong) ? saved.wrong.filter(i => Number.isInteger(+i)).map(Number) : [];
      shakeIdx.value = -1;
      hearts.value = typeof saved.hearts === 'number' ? saved.hearts : HEARTS_MAX;
      phase.value = WON;
      // 结算层的钟停在过关那一刻（restore 会顺带把表起起来，随即再停掉）
      timerRef.value?.restore(+saved.time || 0);
      timerRef.value?.stop();
      return true;
    }
    hearts.value = HEARTS_MAX;
    // 不恢复记忆中途：直接重开当前关（棋盘随机，公平）
    startLevel();
    return true;
  } catch {
    return false;
  }
}

function onScoreReset() {
  // 连点标题清记录时，两种牌面的最高关卡一起清
  localStorage.removeItem(BEST_KEY);
  localStorage.removeItem(`${BEST_KEY}_2`);
  bestLevel.value = 0;
}
</script>

<style scoped lang="scss">
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
      }
    }
  }
  .opt-area {
    display: flex;
    align-items: center;
    margin: var(--row-gap) 0;
    height: var(--row-height);
    .difficulty-wrapper {
      flex: 3.5;
      display: flex;
      align-items: center;
      justify-content: center;
      .difficulty-value {
        min-width: 48px;
        text-align: center;
        font-size: 16px;
        font-weight: bold;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
    }
    .opt-half {
      flex: 2.5;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .start-wrapper {
      flex: 4;
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
  // 外框是 fit-content 居中的，这里就让 game-area 收缩到外框大小，
  // 结算浮层（100% × 100%）才会严丝合缝地盖在棋盘上而不是整条内容宽度
  .game-area {
    position: relative;
    width: fit-content;
    max-width: calc(100% - 32px);
    margin: 0 auto;
    box-sizing: border-box;
    // 顶部留出提示带：提示条落在带子里，棋盘从带子下面开始，两者永不重叠
    --tip-band: 28px;
    padding-top: var(--tip-band);
  }
  // 棋盘外框：宽度收缩到内容并居中，背景即棋盘底色；
  // --cell（格子边长）由 JS 按视口宽度计算，96px 封顶
  .board-frame {
    width: fit-content;
    margin: 0 auto;
    padding: var(--gap);
    border-radius: var(--card-radius);
  }
  .board {
    display: grid;
    grid-template-columns: repeat(var(--cols), var(--cell));
    // emoji 是正方形（--cell-h == --cell），扑克牌是 2:3（--cell-h = 1.5 × --cell）
    grid-auto-rows: var(--cell-h, var(--cell));
    gap: var(--gap);
    font-size: calc(46px - var(--cols) * 5px);
    .face { font-size: inherit; }
  }
  .cell {
    perspective: 500px;
  }
  .card-flip {
    position: relative;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
    transition: transform 0.45s ease-in-out;
    cursor: pointer;
    &.flipped {
      transform: rotateY(180deg);
    }
    &.shaking {
      animation: shake 0.4s ease;
    }
    // 答对后被换的牌高亮标识
    // 选错：常驻红色标记，且不再响应点击（与猎手同款观感）
    &.wrong {
      cursor: not-allowed;
      .front-face {
        background: var(--del-bg);
        border-color: var(--lose-color);
        box-shadow: inset 0 0 0 1px var(--lose-color);
      }
    }
    &.revealed {
      .front-face {
        background: var(--enter-bg);
        box-shadow: 0 0 0 2px var(--primary-bg);
      }
    }
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
  // 正面（emoji）默认朝向玩家；背面图案转到 180°，
  // 卡片 .flipped 时整体旋转 180° 露出背面
  .back-face {
    background: var(--primary-bg);
    color: #fff;
    font-size: inherit;
    transform: rotateY(180deg);
  }
  .front-face {
    background: var(--card-bg-color);
  }
  // 扑克模式：牌面（含牌背）整个由 poker 的 CardItem 渲染，外面这层只留
  // 3D 翻面与「答对高亮」，所以把底色 / 描边 / 阴影都让开
  // CardItem 的 .card 是「1px 描边 + content-box」，实际比 wrapper 宽 2px；wrapper 又会被
  // 外框的 1px 边框挤窄再居中，牌按 left: 0 贴左边 → 多出的 2px 全跑到右侧，看着就偏右。
  // 所以外框不要边框、宽度按「格子 - 2」传、牌绝对定位到左上角，牌的外框正好等于格子
  .board.poker .face {
    border: 0 none;
    background: transparent;
    box-shadow: none;
  }
  .board.poker .face .card-wrapper {
    position: absolute;
    left: 0;
    top: 0;
  }
  // 扑克模式的牌面是透明的，红色标记改画成牌外面一圈（画在 .card 上，正好等于格子大小）
  .board.poker .card-flip.wrong :deep(.card) {
    box-shadow: 0 0 0 3px var(--lose-color);
    border-radius: var(--radius-tile);
  }
  .board.poker .card-flip.revealed .front-face {
    box-shadow: 0 0 0 3px var(--primary-bg);
  }
  // 阶段提示浮在棋盘上方
  .phase-tip {
    position: absolute;
    // 带子内（原来贴棋盘上边缘 -14px，高难度时会压住第一行牌）
    top: 2px;
    left: 50%;
    transform: translateX(-50%);
    padding: 2px 14px;
    border-radius: var(--radius-tile);
    background: var(--card-bg-color);
    color: var(--text-color);
    border: 1px solid var(--border-color);
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    z-index: 3;
  }
  .result {
    position: absolute;
    width: 100%;
    // 跳过顶部的提示带，正好盖住棋盘
    height: calc(100% - var(--tip-band, 28px));
    left: 0;
    top: var(--tip-band, 28px);
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
    padding: 12px;
    box-sizing: border-box;
    .result-actions {
      display: flex;
      gap: 12px;
    }
  }
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-4px); }
    75% { transform: translateX(4px); }
  }
}
</style>
