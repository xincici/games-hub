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
        <span class="difficulty-value">{{ targetCount }} · {{ gridLabel }}</span>
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
    <div class="game-area">
      <div class="stage-frame dot-board" :class="{ poker: mode === 2 }" :style="stageStyle">
        <div class="stage">
          <div v-for="(cell, idx) in stage" :key="idx" class="stage-cell">
            <div class="card-flip" :class="{ flipped: isStageFaceDown(idx), 'no-anim': snapping }">
              <!-- 牌背 / 牌面：emoji 模式用游戏图标与 emoji，扑克模式整个交给 CardItem -->
              <div class="face back-face">
                <i v-if="mode === 1" :class="BACK_ICON" />
                <CardItem v-else mini :style="stageCardVars" />
              </div>
              <div class="face front-face">
                <template v-if="mode === 1">{{ cell }}</template>
                <CardItem v-else mini :num="cell.num" :type="cell.type" :style="stageCardVars" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="candidate-area dot-board" :class="{ poker: mode === 2 }" :style="candidateStyle">
        <div
          v-for="(opt, idx) in candidates"
          :key="idx"
          class="candidate-tile"
          @click="pick(idx)"
        >
          <div
            class="cand-flip"
            :class="{ flipped: isCandFaceDown(opt), found: foundSet.has(keyOf(opt)), wrong: wrongSet.has(keyOf(opt)), 'no-anim': snapping }"
          >
            <div class="face cand-back">
              <i v-if="mode === 1" :class="BACK_ICON" />
              <CardItem v-else mini :style="candCardVars" />
            </div>
            <div class="face cand-front">
              <template v-if="mode === 1">{{ opt }}</template>
              <CardItem v-else mini :num="opt.num" :type="opt.type" :style="candCardVars" />
            </div>
          </div>
        </div>
        <div v-if="phase === WON || phase === LOST" class="result" :class="phase === WON ? 'win' : 'lose'">
          <span v-if="phase === WON">🎉🎉 {{ i18n('tipWin') }} 🎉🎉</span>
          <span v-else>👻👻 {{ i18n('tipLost') }} 👻👻</span>
          <div class="result-actions">
            <button class="game-icon" @click="retryLevel">{{ i18n('retry') }}</button>
            <button v-if="phase === WON" class="game-icon primary" @click="nextLevel">{{ i18n('nextLevel') }}</button>
          </div>
        </div>
      </div>
      <div v-if="phase === MEMORY" class="phase-tip">{{ i18n('phaseMemory') }}</div>
      <div v-else-if="phase === FLIP" class="phase-tip">{{ i18n('phaseFlip') }}</div>
      <div v-else-if="phase === ANSWER" class="phase-tip">{{ i18n('phaseAnswer') }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';

import TopHeader from '@/components/TopHeader.vue';
import CountTimer from '@/shared/CountTimer.vue';
import Hearts from '@/shared/Hearts.vue';
import confetti from '@/shared/confetti';
import { i18n } from '@/shared/i18n';
import { gameConfig } from '@/shared/games';
import { EMOJIS } from '@/shared/emojis';
// 扑克牌面直接复用扑克游戏的 CardItem（纯展示组件，没有扑克那边的状态依赖）
import CardItem from '@/games/poker/CardItem.vue';

// 6 关：展示 3~8 个 emoji；候选区依次 3×3 / 3×4 / 3×4 / 4×4 / 4×4 / 4×5
// 牌背用的是本游戏在首页的图标（与 games.js 里注册的是同一个，改图标两处一起变）
const BACK_ICON = gameConfig('hunter').icon;

// emoji 模式：6 关，展示 3~8 个目标，候选区 3×3 → 4×5
const LEVELS = [
  { show: 3, grid: [3, 3] },
  { show: 4, grid: [3, 4] },
  { show: 5, grid: [3, 4] },
  { show: 6, grid: [4, 4] },
  { show: 7, grid: [4, 4] },
  { show: 8, grid: [4, 5] },
];
// 扑克模式：牌 2:3 的长方形、牌面比 emoji 好记，所以目标更多、候选区改成横向排布
// （列多行少），格数也更多
const CARD_LEVELS = [
  { show: 4, grid: [3, 4] },
  { show: 5, grid: [3, 5] },
  { show: 6, grid: [3, 6] },
  { show: 7, grid: [4, 6] },
  { show: 8, grid: [4, 7] },
  { show: 9, grid: [4, 8] },
];
const CARD_RATIO = 1.5;   // 与 CardItem 的 60×90 一致
const CARD_TYPES = ['spade', 'club', 'heart', 'diamond'];
const MEMORIES = 3000;
const [MEMORY, FLIP, ANSWER, WON, LOST] = ['memory', 'flip', 'answer', 'won', 'lost'];
const KEY_PREFIX = '__emoji_hunter__';
const LEVEL_KEY = `${KEY_PREFIX}level`;
const BEST_KEY = `${KEY_PREFIX}best`;
// 模式与进度、最高关卡、局面分开存：emoji 沿用不带后缀的老 key，扑克用 _2 后缀
const MODE_KEY = `${KEY_PREFIX}mode`;
const mode = ref(+(localStorage.getItem(MODE_KEY) || 1) === 2 ? 2 : 1);
const modeSuffix = () => (mode.value === 2 ? '_2' : '');
const levelKey = () => `${LEVEL_KEY}${modeSuffix()}`;
const bestKey = () => `${BEST_KEY}${modeSuffix()}`;
const levels = computed(() => (mode.value === 2 ? CARD_LEVELS : LEVELS));

const level = ref(0);
const phase = ref(MEMORY);
// 换一关的瞬间：全体先瞬移到背面（关掉过渡），画一帧之后再开过渡翻正面。
// 不这么做的话，「加上 flipped 再两帧内摘掉」会把过渡反向取消，复用的旧节点
// 等于没翻、只是把 emoji 换了，只有新建的节点（关卡牌数变多时）才看得到翻转
const snapping = ref(false);
const stage = ref([]);
const candidates = ref([]);
const foundSet = ref(new Set());
const wrongSet = ref(new Set());
const HEARTS_MAX = 3;      // 每局 3 颗心
const hearts = ref(HEARTS_MAX);
const bestLevel = ref(+(localStorage.getItem(bestKey()) || 0));
const timerRef = ref(null);

const targetCount = computed(() => levels.value[level.value].show);
const grid = computed(() => levels.value[level.value].grid);
const gridLabel = computed(() => `${grid.value[0]}×${grid.value[1]}`);
const timerRunning = computed(() => phase.value !== WON && phase.value !== LOST);
// 目标的键集合（判定「这张候选是不是目标」用，见 pick）
const stageKeySet = computed(() => new Set(stage.value.map(keyOf)));

// 展示区：单行 flex 布局。可用宽 = 视口(≤440) − 32；扣除 frame 上下 padding 16 与格间 gap，
// 5 个以上目标时按剩余宽度均分（此前只减了单侧 padding，7~8 个时右侧溢出）
const STAGE_CELL_MAX = 64;    // emoji 模式：展示牌边长上限
const CAND_CELL_MAX = 96;     // emoji 模式：候选牌边长上限
const CARD_STAGE_MAX_W = 48;  // 扑克模式：展示牌宽度上限（一行最多 9 张，宽度本来就紧张）
const CARD_CAND_MAX_W = 64;   // 扑克模式：候选牌宽度上限
// 两区的格子尺寸：emoji 是正方形、只受宽度限制（与原实现一致）；
// 扑克牌是 2:3，舞台一行 + 候选 rows 行必须一起塞进可用高度，所以再按高度反推一次宽度
const metrics = computed(() => {
  const availW = Math.min(window.innerWidth || 420, 440) - 32;
  const layout = levels.value[level.value];
  const n = stage.value.length || 1;
  const [rows, cols] = layout.grid;
  const stageByW = Math.floor((availW - 16 - (n - 1) * 8) / n);
  const candByW = Math.floor((availW - 16 - (cols - 1) * 8) / cols);
  if (mode.value === 1) {
    const stageCell = Math.max(14, Math.min(STAGE_CELL_MAX, stageByW));
    const candCell = Math.max(14, Math.min(CAND_CELL_MAX, candByW));
    return { stageW: stageCell, stageH: stageCell, candW: candCell, candH: candCell };
  }
  const availH = Math.max(200, (window.innerHeight || 700) - 262);
  const stageW = Math.max(12, Math.min(CARD_STAGE_MAX_W, stageByW));
  const fixedH = 48 + (rows - 1) * 8;   // 两个 8px 内边距 + 16px 区间距 + 候选区行间距
  const candBudget = Math.max(0, availH - fixedH - stageW * CARD_RATIO);
  const candByH = Math.floor((candBudget - (rows - 1) * 8) / rows / CARD_RATIO);
  const candW = Math.max(10, Math.min(CARD_CAND_MAX_W, candByW, candByH));
  return { stageW, stageH: Math.round(stageW * CARD_RATIO), candW, candH: Math.round(candW * CARD_RATIO) };
});

const stageStyle = computed(() => ({
  '--stage-cell': `${metrics.value.stageW}px`,
  '--stage-cell-h': `${metrics.value.stageH}px`,
}));

// 交给 poker 的 CardItem 的尺寸变量（内联传进去最省事：不用改扑克那边的样式，
// 也不受 scoped 样式影响）
function cardVarsFor(w, h) {
  return {
    // -2 是 CardItem 那张牌自己的左右 / 上下 1px 描边（content-box）
    '--width': `${Math.max(8, w - 2)}px`,
    '--height': `${Math.max(8, h - 2)}px`,
    '--margin': '0px',
    '--radius': `${Math.max(2, Math.round(w * 0.07))}px`,
    '--pos': `${Math.max(1, Math.round(w * 0.07))}px`,
    '--text-size': `${Math.max(6, Math.round(w * 0.26))}px`,
    '--icon-size': `${Math.max(8, Math.round(w * 0.56))}px`,
    '--back-size': `${Math.max(10, Math.round(w * 0.68))}px`,
  };
}
const stageCardVars = computed(() => cardVarsFor(metrics.value.stageW, metrics.value.stageH));
const candCardVars = computed(() => cardVarsFor(metrics.value.candW, metrics.value.candH));

const candidateStyle = computed(() => ({
  '--c-cols': grid.value[1],
  '--cand-cell': `${metrics.value.candW}px`,
  '--cand-cell-h': `${metrics.value.candH}px`,
  '--cand-font': `${Math.floor(metrics.value.candW * 0.5)}px`,
}));

let memoryTimer = null;
// 换局 +1：上一次 startLevel 还停在 await 里时，这次换局作废旧流程
let levelToken = 0;

onMounted(bootMode);

onUnmounted(() => {
  levelToken += 1;
  clearTimeout(memoryTimer);
});

function clearTimers() {
  clearTimeout(memoryTimer);
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

// 盘面内容：emoji 模式是 emoji 字符串，扑克模式是 { num, type }。
// 判定一律走 keyOf，这样扑克对象即使不是同一个引用（存档还原后必然不是）也能比对
const keyOf = item => (typeof item === 'string' ? item : `${item.num}-${item.type}`);
const newItems = n => (mode.value === 2 ? drawCards(n) : pickEmojis(n));

// 展示牌是否背面：记忆结束后未被找回的；结算（胜负）后全部翻正供复盘
function isStageFaceDown(idx) {
  if (snapping.value) return true;
  if (phase.value === MEMORY || phase.value === WON || phase.value === LOST) return false;
  return !foundSet.value.has(keyOf(stage.value[idx]));
}

// 候选牌是否背面：记忆阶段候选区整体背面（盖住内容防偷看），
// 进入答题后翻正；胜负结算后全部翻正（含漏选的）供玩家复盘
function isCandFaceDown(opt) {
  if (snapping.value || phase.value === MEMORY || phase.value === FLIP) return true;
  return false;
}

async function startLevel() {
  clearTimers();
  const token = ++levelToken;
  foundSet.value = new Set();
  wrongSet.value = new Set();
  hearts.value = HEARTS_MAX;
  const lv = levels.value[level.value];
  // 展示牌 + 候选牌（含展示牌）互不重复
  const all = newItems(lv.show + lv.grid[0] * lv.grid[1] - lv.show);
  // 新内容先在「全体背面 + 关掉过渡」的状态下渲染（snapping）：新 emoji 不会
  // 先在正面闪一下，而且下一帧翻正面时，每一张（复用的旧节点也算）都有干净的起点
  snapping.value = true;
  stage.value = all.slice(0, lv.show);
  const rest = all.slice(lv.show);
  // 候选区：展示牌 + 干扰项打乱
  candidates.value = [...stage.value, ...rest].sort(() => Math.random() - 0.5);
  await nextTick();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  if (token !== levelToken) return;
  snapping.value = false;                        // 打开过渡（此时还都是背面，位置不变）
  await nextTick();
  await new Promise(r => requestAnimationFrame(r));
  if (token !== levelToken) return;
  phase.value = MEMORY;                          // 全体从背面翻到正面
  timerRef.value?.reset();
  memoryTimer = setTimeout(() => {
    phase.value = FLIP;
    setTimeout(() => {
      if (phase.value === FLIP) {
        phase.value = ANSWER;
        save();
      }
    }, 500);
  }, MEMORIES);
  save();
}

// 点候选：是展示过的 → 标记找回（对应展示牌翻回）；
// 不是 → 红色高亮标错且不可再选，扣心
function pick(idx) {
  if (phase.value !== ANSWER) return;
  const item = candidates.value[idx];
  const key = keyOf(item);
  if (foundSet.value.has(key) || wrongSet.value.has(key)) return;
  if (stageKeySet.value.has(key)) {
    foundSet.value = new Set([...foundSet.value, key]);
    if (foundSet.value.size === stage.value.length) {
      phase.value = WON;
      timerRef.value?.stop();
      if (level.value + 1 > bestLevel.value) {
        bestLevel.value = level.value + 1;
        localStorage.setItem(bestKey(), bestLevel.value);
      }
      confetti();
      save();
    }
  } else {
    wrongSet.value = new Set([...wrongSet.value, key]);
    hearts.value = Math.max(0, hearts.value - 1);
    if (hearts.value <= 0) {
      setTimeout(() => {
        phase.value = LOST;
        timerRef.value?.stop();
        save();
      }, 600);
    }
    save();
  }
}

function nextLevel() {
  if (level.value < levels.value.length - 1) level.value++;
  startLevel();
}

function retryLevel() {
  startLevel();
}

function initGame() {
  level.value = 0;
  startLevel();
}

// 切换牌面：先落档当前模式，再按另一种模式自己的存档接着玩
function toggleMode() {
  save();
  clearTimers();
  mode.value = mode.value === 1 ? 2 : 1;
  localStorage.setItem(MODE_KEY, String(mode.value));
  bestLevel.value = +(localStorage.getItem(bestKey()) || 0);
  bootMode();
}

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
    // 这一局的盘面：胜利结算层要连牌一起还原，回来时看到的才是同一张盘
    stage: stage.value,
    candidates: candidates.value,
    found: [...foundSet.value],
    wrong: [...wrongSet.value],
  }));
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(levelKey()));
    if (!saved || typeof saved.level !== 'number') return false;
    level.value = Math.min(levels.value.length - 1, Math.max(0, saved.level));
    // 胜利结算局面：原样还原那一盘（展示牌与候选牌都翻正、标出找回 / 标错），
    // 由玩家自己决定点「重玩本关」还是「下一关」
    if (saved.phase === WON && Array.isArray(saved.stage) && saved.stage.length
      && Array.isArray(saved.candidates) && saved.candidates.length) {
      stage.value = saved.stage;
      candidates.value = saved.candidates;
      foundSet.value = new Set(Array.isArray(saved.found) ? saved.found : []);
      wrongSet.value = new Set(Array.isArray(saved.wrong) ? saved.wrong : []);
      hearts.value = typeof saved.hearts === 'number' ? saved.hearts : HEARTS_MAX;
      phase.value = WON;
      // 结算层的钟停在过关那一刻（restore 会顺带把表起起来，随即再停掉）
      timerRef.value?.restore(+saved.time || 0);
      timerRef.value?.stop();
      return true;
    }
    // 玩到一半退出：重开当前关（棋盘随机，公平）
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
  .game-area {
    position: relative;
    width: calc(100% - 32px);
    max-width: 440px;
    box-sizing: border-box;
  }
  // 展示区：单行居中，卡片 64px 上限
  .stage-frame {
    width: fit-content;
    margin: 0 auto 16px;
    padding: 8px;
    border-radius: var(--card-radius);
  }
  .stage {
    display: flex;
    gap: 8px;
    .stage-cell {
      width: var(--stage-cell);
      // emoji 是正方形，扑克是 2:3（--stage-cell-h = 1.5 × 宽度）
      height: var(--stage-cell-h, var(--stage-cell));
      perspective: 500px;
    }
  }
  .card-flip {
    position: relative;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
    transition: transform 0.45s ease-in-out;
    &.flipped {
      transform: rotateY(180deg);
    }
    // 换局那一下：瞬移到背面，不播过渡（见 startLevel）
    &.no-anim {
      transition: none;
    }
  }
  // 通用翻牌面样式（两区共用基础部分）
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
    font-size: calc(var(--stage-cell) * 0.4);
    transform: rotateY(180deg);
  }
  .front-face {
    background: var(--card-bg-color);
    font-size: calc(var(--stage-cell) * 0.52);
  }
  // 候选区：记忆阶段即显示（牌面朝下），答案区翻回后随之翻正。
  // 宽度收缩到内容并居中，格子边长与字号由 JS 按 --cand-cell 计算
  .candidate-area {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--c-cols), var(--cand-cell));
    // 行高必须用 --cand-cell-h：扑克牌是宽度的 1.5 倍，沿用宽度当行高会让每行
    // 只留一半高度 → 行与行重叠、整块候选区还从底部溢出
    grid-auto-rows: var(--cand-cell-h, var(--cand-cell));
    gap: 8px;
    width: fit-content;
    margin: 0 auto;
    padding: 8px;
    border-radius: var(--card-radius);
  }
  // 扑克模式（舞台与候选区共用）：牌面（含牌背）整个由 poker 的 CardItem 渲染，
  // 外面这层只留 3D 翻面，所以底色 / 描边 / 阴影全部让开。
  // CardItem 的 .card 是「1px 描边 + content-box」，实际比 wrapper 宽 2px；wrapper 又会被
  // 外框的 1px 边框挤窄再居中，牌按 left: 0 贴左边 → 多出的 2px 全跑到右侧，看着就偏右。
  // 所以宽度按「格子 - 2」传、牌绝对定位到左上角，牌的外框正好等于格子
  .poker .face {
    border: 0 none;
    background: transparent;
    box-shadow: none;
  }
  .poker .face .card-wrapper {
    position: absolute;
    left: 0;
    top: 0;
  }
  // 「找回 / 标错」的提示改画成牌外面的一圈。
  // 必须画在 .card（真正可见、正好等于格子大小）上，不能画在 .card-wrapper 上：
  // wrapper 比牌窄 2px（牌的 1px 描边是 content-box），光环会左边露 3px、右边被牌盖掉 1px，
  // 看着既偏又像被压在牌底下（而且 .card 在 wrapper 之后绘制，本来就会盖住 wrapper 的光环）
  .poker .cand-flip.found :deep(.card) {
    box-shadow: 0 0 0 3px var(--primary-bg);
    border-radius: var(--radius-tile);
  }
  .poker .cand-flip.wrong :deep(.card) {
    box-shadow: 0 0 0 3px var(--lose-color);
    border-radius: var(--radius-tile);
  }
  .candidate-tile {
    width: var(--cand-cell);
    height: var(--cand-cell-h, var(--cand-cell));
    perspective: 500px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    .cand-flip {
      position: relative;
      width: 100%;
      height: 100%;
      transform-style: preserve-3d;
      transition: transform 0.45s ease-in-out;
      &.flipped {
        transform: rotateY(180deg);
      }
      &.no-anim {
        transition: none;
      }
    }
    .cand-back {
      background: var(--primary-bg);
      color: #fff;
      font-size: calc(var(--cand-cell) * 0.4);
      transform: rotateY(180deg);
    }
    .cand-front {
      background: var(--card-bg-color);
      font-size: var(--cand-font);
      line-height: 1;
    }
    // 找回的目标：绿色标记并缩小
    .cand-flip.found .cand-front {
      background: var(--enter-bg);
      border-color: var(--primary-bg);
      box-shadow: inset 0 0 0 1px var(--primary-bg);
    }
    // 选错：红色高亮且不可再选
    .cand-flip.wrong {
      .cand-front {
        background: var(--del-bg);
        border-color: var(--lose-color);
        color: var(--lose-color);
      }
      cursor: not-allowed;
    }
    .cand-flip.wrong {
      cursor: not-allowed;
    }
  }
  .phase-tip {
    position: absolute;
    top: -14px;
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
  // 结算遮罩覆盖在候选区上（候选区 position:relative）
  .result {
    position: absolute;
    inset: 0;
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
    &.lose {
      color: var(--lose-color);
    }
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
