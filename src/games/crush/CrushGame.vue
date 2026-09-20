<template>
  <div class="wrapper">
    <TopHeader @onScoreReset="onScoreReset" />
    <div class="card score-area">
      <div class="stat">
        <span class="stat-label">{{ i18n('levelLabel') }}</span>
        <span class="stat-value">{{ level }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('movesLabel') }}</span>
        <span class="stat-value">{{ moves }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('score') }}</span>
        <span class="stat-value">{{ score }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('targetLabel') }}</span>
        <span class="stat-value">{{ conf.target }}</span>
      </div>
      <!-- 过关进度条 -->
      <div class="progress"><div class="progress-bar" :style="{ width: `${progress}%` }"></div></div>
    </div>
    <div class="card opt-area">
      <div class="opt-half">
        <span class="level-note">{{ boardLabel }}</span>
      </div>
      <div class="divider"></div>
      <div class="start-wrapper">
        <button @click="confirming = true" class="game-icon">{{ i18n('start') }}</button>
      </div>
    </div>
    <div class="game-area">
      <div class="board-frame dot-board" :class="{ shaking }" :style="boardStyle">
        <div class="board" :class="{ celebrating }" @touchstart.passive="onTouchStart" @touchmove.passive="onTouchMove" @touchend.passive="onTouchEnd">
          <div
            v-for="(cell, idx) in cells"
            :key="`bg-${idx}`"
            class="cell"
            :class="{ wall: isWall(cell) }"
            @click="onCellClick(idx)"
          ></div>
          <div
            v-for="gem in gems"
            :key="gem.id"
            class="gem"
            :class="gemClasses(gem)"
            :style="gemStyle(gem.idx, gem.dealIdx)"
            @click="onCellClick(gem.idx)"
          >
            <span class="face">{{ faceOf(gem.value) }}</span>
          </div>
        </div>
      </div>
      <!-- 大消 / 连锁的即时庆祝：中间弹一条文字 + 本次得分，配合棋盘闪光与撒花 -->
      <div
        v-if="celebration"
        :key="celebration.id"
        class="celebrate"
        :class="`tier-${celebration.tier}`"
      >
        <span class="celebrate-text">{{ celebration.text }}</span>
        <span class="celebrate-score">+{{ celebration.gained }}</span>
      </div>
      <div v-if="phase === WON" class="result win">
        <div>🎉🎉 {{ i18n('levelDone').replace('{n}', level) }} 🎉🎉</div>
        <div class="final-score">{{ score }}</div>
        <button class="game-icon" @click="nextLevel">{{ i18n('nextLevel') }}</button>
      </div>
      <div v-else-if="phase === OVER" class="result lose">
        <div>👻👻 {{ i18n('gameover') }} 👻👻</div>
        <div class="final-score">{{ score }} / {{ conf.target }}</div>
        <button class="game-icon" @click="replayLevel">{{ i18n('replayLevel') }}</button>
      </div>
    </div>
    <!-- 共用的二次确认弹窗（文案与样式都在 shared/ConfirmDialog.vue 里） -->
    <ConfirmDialog :show="confirming" @confirm="startNewGame" @cancel="confirming = false" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';

import TopHeader from '@/components/TopHeader.vue';
import { i18n } from '@/shared/i18n';
import ConfirmDialog from '@/shared/ConfirmDialog.vue';
import confetti, { burstConfetti } from '@/shared/confetti';
import { EMOJIS } from '@/shared/emojis';
import {
  WALL, BOMB, WILD, isWall, levelConfig, generateBoard, findMatches, explode,
  hasMatchAfterSwap, adjacent, hasAnyMove, applyGravity, isTile,
  scoreForMatches, scoreForBlast, reshuffle,
} from './board';

// 闯关制：每关在限定步数内达到目标分即可过关，面板从 7×7 长到 9×10 后固定
const [PLAY, WON, OVER] = ['play', 'won', 'over'];
const KEY_PREFIX = '__emoji_crush__';
const LEVEL_KEY = `${KEY_PREFIX}level`;          // 当前关卡
const BEST_KEY = `${KEY_PREFIX}best_1`;          // 历史最高关卡（沿用「前缀+难度数字」以便连点标题清记录）
const STATE_KEY = `${KEY_PREFIX}state`;
const BOMB_FACE = '💣';
const WILD_FACE = '💎';

function loadLevel() {
  return Math.max(1, Math.floor(+(localStorage.getItem(LEVEL_KEY) || 1)) || 1);
}

const level = ref(loadLevel());
const bestLevel = ref(Math.max(level.value, Math.floor(+(localStorage.getItem(BEST_KEY) || 1)) || 1));
const cells = ref([]);
const gems = ref([]);
let gemId = 0;

const phase = ref(PLAY);
const score = ref(0);
const moves = ref(0);
const selected = ref(-1);
const swapPair = ref([]);
const matchedSet = ref(new Set());
const blastSet = ref(new Set());
const hugeClear = ref(false);
const shaking = ref(false);
const confirming = ref(false);
// 大消 / 连锁庆祝：{ id, text, gained, tier }；tier 1 大消、2 连锁、3 两者同时
const celebration = ref(null);
const celebrating = ref(false);
let celebrationId = 0;
let celebrationTimer = null;
let celebrateFlashTimer = null;

const conf = computed(() => levelConfig(level.value));
// 盘面上的真实墙数（生成时按关卡配置随机撒，极少数情况下会少一两面，所以直接数盘面）
const wallCount = computed(() => cells.value.filter(isWall).length);
const boardLabel = computed(() => {
  const c = conf.value;
  return `${c.cols}×${c.rows} · ${i18n('kindsLabel').replace('{n}', c.kinds)}`
    + (wallCount.value ? ` · ${i18n('wallsLabel').replace('{n}', wallCount.value)}` : '');
});
const target = computed(() => conf.value.target);
const progress = computed(() => Math.min(100, Math.round((score.value / target.value) * 100)));

// 格子尺寸：宽度与高度都要放得下（9×10 时以宽度为准）
const GAP = 4;
const metrics = computed(() => {
  const { cols, rows } = conf.value;
  const availW = Math.min(window.innerWidth || 420, 440) - 32;
  const availH = Math.max(300, (window.innerHeight || 700) - 346);
  const cell = Math.min(
    96,
    Math.floor((availW - 16 - (cols - 1) * GAP) / cols),
    Math.floor((availH - 16 - (rows - 1) * GAP) / rows),
  );
  return { cols, rows, cell };
});
const boardStyle = computed(() => {
  const { cols, cell } = metrics.value;
  return {
    '--n': cols,
    '--cell': `${cell}px`,
    '--font': `${Math.floor(cell * 0.55)}px`,
  };
});

// ---------- 空闲提示 ----------
// 6s 没有任何操作 → 找一对能消的 emoji，让这两张牌的 emoji 大幅呼吸三下，
// 同时牌面底色的脉冲发光（暖黄底 + 品牌绿光晕）跟着一起闪；
// 呼吸完就收起，之后又静置 6s 还没动作，就换另一对提示
const IDLE_HINT_MS = 6000;
const HINT_MS = 2600;            // 三次呼吸（0.8s × 3，CSS 里同值）+ 一点余量
const hintSwap = ref(null);      // { a, b } 两个格子的下标
let lastHints = [];              // 最近提示过的几对（避免连着几次都是同一对）
let idleTimer = null;
let hintTimer = null;

// 任何玩家交互后调用：收起提示并重新起 6s 计时。
// keepLast=true 用在提示自然播完那一次——保留上一对，下一次好换一对
function pokeIdle(keepLast = false) {
  hintSwap.value = null;
  if (!keepLast) lastHints = [];
  clearTimeout(idleTimer);
  clearTimeout(hintTimer);
  if (phase.value !== PLAY) return;
  idleTimer = setTimeout(showHint, IDLE_HINT_MS);
}

const isHinted = idx => !!hintSwap.value && (hintSwap.value.a === idx || hintSwap.value.b === idx);

const samePair = (p, q) => !!q
  && ((p.a === q.a && p.b === q.b) || (p.a === q.b && p.b === q.a));

// 扫出所有能消的交换，取「消得最多」的那一档；同档里随机挑一个，
// 并排除最近提示过的那几对（都排除完了才退回到只排除上一次）
function pickHint() {
  const { cols, rows } = conf.value;
  const board = cells.value;
  const found = [];
  for (let i = 0; i < board.length; i++) {
    if (!isTile(board[i])) continue;
    const r = ~~(i / cols);
    const c = i % cols;
    const pairs = [];
    if (c + 1 < cols) pairs.push([i, i + 1]);
    if (r + 1 < rows) pairs.push([i, i + cols]);
    for (const [a, b] of pairs) {
      if (!hasMatchAfterSwap(board, cols, rows, a, b)) continue;
      const trial = [...board];
      [trial[a], trial[b]] = [trial[b], trial[a]];
      found.push({ a, b, size: findMatches(trial, cols, rows).size });
    }
  }
  if (!found.length) return null;
  found.sort((x, y) => y.size - x.size);
  const fresh = found.filter(p => !lastHints.some(h => samePair(p, h)));
  const list = fresh.length ? fresh : found.filter(p => !samePair(p, lastHints[0]));
  const pool = list.length ? list : found;
  const top = pool.filter(p => p.size === pool[0].size);
  return top[~~(Math.random() * top.length)];
}

function showHint() {
  // 发牌 / 连锁结算中不打扰，等盘面稳定后再来
  if (phase.value !== PLAY || busy || dealing) {
    idleTimer = setTimeout(showHint, IDLE_HINT_MS);
    return;
  }
  const pick = pickHint();
  if (!pick) {
    idleTimer = setTimeout(showHint, IDLE_HINT_MS);
    return;
  }
  hintSwap.value = { a: pick.a, b: pick.b };
  lastHints = [hintSwap.value, ...lastHints].slice(0, 3);
  hintTimer = setTimeout(() => pokeIdle(true), HINT_MS);
}

let busy = false;
let dealing = false;
let dealTimer = null;
let stepTimer = null;
let resetTimer = null;
let shakeTimer = null;
let touchFrom = -1;
let touchHandled = false;

onMounted(() => {
  // restore() 成功时不会走 initLevel，那条路上的空闲计时要自己补上，
  // 否则「接着上次的局面玩」时永远不会有提示
  if (!restore()) initLevel(level.value);
  else pokeIdle();
  window.addEventListener('resize', onResize);
});

onUnmounted(() => {
  clearTimeout(stepTimer);
  clearTimeout(resetTimer);
  clearTimeout(dealTimer);
  clearTimeout(shakeTimer);
  clearTimeout(idleTimer);
  clearTimeout(hintTimer);
  clearTimeout(celebrationTimer);
  clearTimeout(celebrateFlashTimer);
  window.removeEventListener('resize', onResize);
});

function onResize() {
  // 旋转/改窗口后重算格子尺寸（boardStyle 依赖 window，触发一次重算）
  cells.value = [...cells.value];
}

// ---------- 布局 ----------

function faceOf(value) {
  if (value === BOMB) return BOMB_FACE;
  if (value === WILD) return WILD_FACE;
  return EMOJIS[value];
}

function gemClasses(gem) {
  const out = [`k-${gem.value}`];
  if (gem.value === BOMB) out.push('bomb');
  if (gem.value === WILD) out.push('wild');
  if (selected.value === gem.idx) out.push('selected');
  if (swapPair.value.includes(gem.idx)) out.push('swapping');
  if (matchedSet.value.has(gem.idx)) {
    out.push('matched');
    if (hugeClear.value) out.push('huge');
  }
  if (blastSet.value.has(gem.idx)) out.push('blasting');
  if (isHinted(gem.idx)) out.push('hinting');
  if (gem.fresh) out.push('fresh');
  if (gem.fall != null) out.push('falling');
  if (gem.dealIdx != null) out.push('dealt');
  return out;
}

function gemStyle(idx, dealIdx) {
  const cols = conf.value.cols;
  const r = ~~(idx / cols);
  const c = idx % cols;
  const pos = k => `calc(${k} * (var(--cell) + 4px))`;
  return {
    left: pos(c),
    top: pos(r),
    ...(dealIdx !== undefined ? { animationDelay: `${dealIdx * 16}ms` } : null),
  };
}

// cells → gems 同步：下落只沿列发生——复用仅限「同列更上方」的同值 gem。
// 关键：输出的顺序必须是「老 gem 保持原相对顺序 + 新 gem 追加在末尾」，
// 不能按格子顺序重排——Vue 的 keyed diff 会为了满足新顺序去搬动 DOM 节点，
// 而同一个父节点里被搬动的元素会丢掉正在跑的 left/top 过渡，下落就变成瞬移了。
function syncGems(prevGems, fresh = false) {
  const cols = conf.value.cols;
  const available = new Map();
  (prevGems || []).forEach(g => {
    const col = g.idx % cols;
    if (!available.has(col)) available.set(col, []);
    available.get(col).push(g);
  });
  for (const list of available.values()) list.sort((a, b) => b.idx - a.idx);
  const next = new Map();
  const created = [];
  for (let i = 0; i < cells.value.length; i++) {
    const v = cells.value[i];
    if (v === null || v === undefined || v === WALL) continue;
    const col = i % cols;
    const list = available.get(col) || [];
    const at = list.findIndex(g => g.idx === i && g.value === v);
    let pick;
    if (at >= 0) {
      pick = list[at];
      list.splice(at, 1);
    } else {
      const upper = list.findIndex(g => g.idx < i && g.value === v);
      if (upper >= 0) {
        pick = list[upper];
        list.splice(upper, 1);
      }
    }
    if (pick) next.set(pick.id, { ...pick, idx: i, fresh: false, fall: pick.idx !== i ? i : undefined });
    else created.push({ id: ++gemId, value: v, idx: i, fresh });
  }
  gems.value = [
    ...(prevGems || []).map(g => next.get(g.id)).filter(Boolean),
    ...created,
  ];
}

// ---------- 关卡流程 ----------

function spawnOpts() {
  const c = conf.value;
  return {
    walls: c.walls,
    bombChance: c.bombChance,
    wildChance: c.wildChance,
  };
}

function initLevel(lv) {
  clearTimeout(stepTimer);
  clearTimeout(resetTimer);
  busy = false;
  selected.value = -1;
  swapPair.value = [];
  matchedSet.value = new Set();
  blastSet.value = new Set();
  confirming.value = false;
  hugeClear.value = false;
  clearCelebration();
  level.value = Math.max(1, lv);
  localStorage.setItem(LEVEL_KEY, level.value);
  if (level.value > bestLevel.value) {
    bestLevel.value = level.value;
    localStorage.setItem(BEST_KEY, bestLevel.value);
  }
  const c = conf.value;
  // 初始盘面：无现成三连 + 至少一个有效交换；关数高了会带墙和少量特殊元素
  cells.value = generateBoard(c.cols, c.rows, c.kinds, {
    ...spawnOpts(),
    initials: Math.min(3, Math.floor(c.level / 3)),
  });
  gemId = 0;
  gems.value = [];
  score.value = 0;
  moves.value = c.moves;
  phase.value = PLAY;
  dealBoard();
  save();
  pokeIdle();       // 新的一局重新起 6s 空闲计时
}

function nextLevel() {
  initLevel(level.value + 1);
}

function replayLevel() {
  initLevel(level.value);
}

// 新游戏：清除闯关记录（历史最高关卡）并从第 1 关重新开始，任何时候点都要二次确认
function startNewGame() {
  confirming.value = false;
  localStorage.removeItem(BEST_KEY);
  bestLevel.value = 1;
  initLevel(1);
}

// 发牌：全部 gem 一次性渲染，靠 CSS animationDelay 从第一格逐个弹入
function dealBoard() {
  const all = [];
  for (let i = 0; i < cells.value.length; i++) {
    const v = cells.value[i];
    if (v === null || v === undefined || v === WALL) continue;
    all.push({ id: ++gemId, value: v, idx: i });
  }
  gems.value = all;
  playDeal();
}

function playDeal() {
  if (!gems.value.length) return;
  clearTimeout(dealTimer);
  dealing = true;
  const rank = new Map();
  [...gems.value].sort((a, b) => a.idx - b.idx).forEach((g, i) => rank.set(g.id, i));
  gems.value = gems.value.map(g => ({ ...g, dealIdx: rank.get(g.id) }));
  dealTimer = setTimeout(() => {
    dealing = false;
    gems.value = gems.value.map(({ dealIdx, ...g }) => g);
  }, gems.value.length * 16 + 400);
}

// ---------- 交互 ----------

function onCellClick(idx) {
  pokeIdle();                       // 玩家有动作 → 收起提示并重新计时
  if (phase.value !== PLAY || busy || dealing) return;
  if (!isTileAt(idx)) return;                 // 墙 / 空格不可选
  if (touchHandled) { touchHandled = false; return; }
  if (selected.value < 0) {
    selected.value = idx;
    return;
  }
  if (selected.value === idx) {
    selected.value = -1;
    return;
  }
  if (adjacent(selected.value, idx, conf.value.cols)) {
    trySwap(selected.value, idx);
  } else {
    selected.value = idx;
  }
}

function isTileAt(idx) {
  const v = cells.value[idx];
  return v !== null && v !== undefined && v !== WALL;
}

function onTouchStart(e) {
  pokeIdle();
  const cell = touchTargetCell(e.touches[0]);
  touchFrom = cell;
}

function onTouchMove(e) {
  pokeIdle();
  if (touchFrom < 0 || phase.value !== PLAY || busy) return;
  const cell = touchTargetCell(e.touches[0]);
  if (cell >= 0 && cell !== touchFrom && adjacent(touchFrom, cell, conf.value.cols)) {
    if (!isTileAt(touchFrom) || !isTileAt(cell)) { touchFrom = -1; return; }
    touchHandled = true;
    trySwap(touchFrom, cell);
    touchFrom = -1;
  }
}

function onTouchEnd() {
  touchFrom = -1;
}

function touchTargetCell(touch) {
  const board = document.querySelector('.board');
  if (!board) return -1;
  const rect = board.getBoundingClientRect();
  const { cols, rows } = conf.value;
  const stepX = rect.width / cols;
  const stepY = rect.height / rows;
  const c = ~~((touch.clientX - rect.left) / stepX);
  const r = ~~((touch.clientY - rect.top) / stepY);
  if (r < 0 || r >= rows || c < 0 || c >= cols) return -1;
  return r * cols + c;
}

// ---------- 交换与结算链 ----------

function trySwap(a, b) {
  const { cols, rows } = conf.value;
  if (!hasMatchAfterSwap(cells.value, cols, rows, a, b)) {
    // 无效交换：两 gem 换位再换回（走完整过渡），不消耗步数
    selected.value = -1;
    const ga = gems.value.find(g => g.idx === a);
    const gb = gems.value.find(g => g.idx === b);
    if (ga && gb) {
      gems.value = gems.value.map(g =>
        g.id === ga.id ? { ...g, idx: b } : g.id === gb.id ? { ...g, idx: a } : g
      );
      resetTimer = setTimeout(() => {
        gems.value = gems.value.map(g =>
          g.id === ga.id ? { ...g, idx: a } : g.id === gb.id ? { ...g, idx: b } : g
        );
      }, 220);
    }
    swapPair.value = [a, b];
    resetTimer = setTimeout(() => { swapPair.value = []; }, 460);
    return;
  }
  selected.value = -1;
  busy = true;
  const ga = gems.value.find(g => g.idx === a);
  const gb = gems.value.find(g => g.idx === b);
  if (ga && gb) {
    gems.value = gems.value.map(g =>
      g.id === ga.id ? { ...g, idx: b } : g.id === gb.id ? { ...g, idx: a } : g
    );
  }
  const next = [...cells.value];
  [next[a], next[b]] = [next[b], next[a]];
  cells.value = next;
  stepTimer = setTimeout(() => {
    moves.value--;
    resolveCascades(1);
  }, 240);
}

// 级联结算：连线消除 + 炸弹爆炸 → 重力下落 → 再检测，直到无命中
function resolveCascades(chain) {
  const { cols, rows, kinds } = conf.value;
  const matched = findMatches(cells.value, cols, rows);
  if (!matched.size) {
    gems.value = gems.value.map(g => ({ ...g, fresh: false, fall: undefined }));
    finishTurn();
    return;
  }
  // 炸弹：四邻有格子被消除就引爆，炸掉自己周围 3×3（可链式引爆其它炸弹）
  const { blast } = explode(cells.value, cols, rows, matched);
  const gained = scoreForMatches(matched.size, chain) + scoreForBlast(blast.size, chain);
  score.value += gained;
  matchedSet.value = matched;
  // 一轮消掉 4 个以上 → 消除动画也升一档（爆得更大 + 轻微旋转）
  hugeClear.value = matched.size > 3;
  blastSet.value = blast;
  announceCelebration(matched.size, chain, gained);
  // 这一轮要消除的牌先摘掉「掉落中 / 刚落格」标记：
  // 连锁时它们往往是上一轮刚落地（甚至刚生成）的牌，带着 fresh/falling 时
  // 浏览器只会沿用 drop-in / land-bounce，pop-out 与 blast-out 根本播不出来
  gems.value = gems.value.map(g => (matched.has(g.idx) || blast.has(g.idx))
    ? { ...g, fresh: false, fall: undefined }
    : g);
  if (blast.size) shakeBoard();
  stepTimer = setTimeout(() => {
    const cleared = cells.value.map((v, i) => (matched.has(i) || blast.has(i) ? null : v));
    matchedSet.value = new Set();
    hugeClear.value = false;
    blastSet.value = new Set();
    const survivors = gems.value.filter(g => !matched.has(g.idx) && !blast.has(g.idx));
    cells.value = applyGravity(cleared, cols, rows, kinds, spawnOpts());
    syncGems(survivors, true);
    stepTimer = setTimeout(() => resolveCascades(chain + 1), 300);
  }, 360);
}

function shakeBoard() {
  clearTimeout(shakeTimer);
  shaking.value = false;
  void document.querySelector('.board-frame')?.offsetWidth;
  shaking.value = true;
  shakeTimer = setTimeout(() => { shaking.value = false; }, 340);
}

// ---------- 大消 / 连锁庆祝 ----------
// 一轮消掉 4 个以上（大消）或连锁 ≥2 层时，给一次「看得见」的庆祝：
// 棋盘外圈闪光 + 中央弹出文字与本次得分 + 撒一把花。两者同时达成时强度最高。
function announceCelebration(count, chain, gained) {
  const big = count > 3;
  const combo = chain > 1;
  if (!big && !combo) return;
  const tier = big && combo ? 3 : combo ? 2 : 1;
  celebration.value = {
    id: ++celebrationId,
    tier,
    gained,
    text: big && combo
      ? i18n('niceBoth').replace('{n}', chain).replace('{m}', count)
      : combo
        ? i18n('niceCombo').replace('{n}', chain)
        : i18n('niceBig').replace('{n}', count),
  };
  clearTimeout(celebrationTimer);
  celebrationTimer = setTimeout(() => { celebration.value = null; }, 1100 + tier * 220);
  // 棋盘闪光：与炸弹的 shaking 是两套独立样式（一个动 box-shadow、一个动 transform），
  // 同时发生也不会互相顶掉；重入前先摘一次类名，保证短时间内的连锁都能重播
  clearTimeout(celebrateFlashTimer);
  celebrating.value = false;
  void document.querySelector('.board')?.offsetWidth;
  celebrating.value = true;
  celebrateFlashTimer = setTimeout(() => { celebrating.value = false; }, 900);
  burstConfetti(tier + (chain > 3 ? 1 : 0));
}

function clearCelebration() {
  clearTimeout(celebrationTimer);
  clearTimeout(celebrateFlashTimer);
  celebration.value = null;
  celebrating.value = false;
}

function finishTurn() {
  busy = false;
  if (phase.value !== PLAY) { pokeIdle(); return; }
  if (score.value >= target.value) { winLevel(); return; }
  if (moves.value <= 0) { loseLevel(); return; }
  if (!hasAnyMove(cells.value, conf.value.cols, conf.value.rows, conf.value.kinds)) {
    cells.value = reshuffle(cells.value, conf.value.cols, conf.value.rows, conf.value.kinds);
    syncGems(gems.value);
    selected.value = -1;
  }
  save();
  pokeIdle();       // 盘面稳定了，重新起 6s 空闲计时
}

function winLevel() {
  if (phase.value !== PLAY) return;
  removeState();
  confetti();
  if (level.value + 1 > bestLevel.value) {
    bestLevel.value = level.value + 1;
    localStorage.setItem(BEST_KEY, bestLevel.value);
  }
  phase.value = WON;
}

function loseLevel() {
  if (phase.value !== PLAY) return;
  removeState();
  phase.value = OVER;
}

// ---------- 存档 ----------

function removeState() {
  try { localStorage.removeItem(STATE_KEY); } catch { /* 忽略 */ }
}

function save() {
  localStorage.setItem(STATE_KEY, JSON.stringify({
    cells: cells.value,
    level: level.value,
    score: score.value,
    moves: moves.value,
    phase: phase.value,
  }));
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY));
    if (!saved || !Array.isArray(saved.cells) || !saved.cells.length) return false;
    if (saved.phase !== PLAY) return false;
    const c = levelConfig(+saved.level || 1);
    if (saved.cells.length !== c.cols * c.rows) return false;
    level.value = c.level;
    if (level.value > bestLevel.value) bestLevel.value = level.value;
    cells.value = saved.cells;
    syncGems([]);
    playDeal();
    score.value = +saved.score || 0;
    moves.value = Math.min(c.moves, Math.max(0, +saved.moves));
    phase.value = PLAY;
    return true;
  } catch {
    return false;
  }
}

function onScoreReset() {
  localStorage.removeItem(BEST_KEY);
  bestLevel.value = level.value;
}
</script>

<style scoped lang="scss">
@keyframes pop-out {
  0% { transform: scale(1); }
  40% { transform: scale(1.2); }
  100% { transform: scale(0); opacity: 0; }
}

@keyframes blast-out {
  0% { transform: scale(1); filter: brightness(1); }
  35% { transform: scale(1.35); filter: brightness(1.9); }
  100% { transform: scale(1.7); opacity: 0; }
}

@keyframes drop-in {
  from { transform: translateY(-100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

@keyframes land-bounce {
  0% { transform: translateY(-12%) scaleY(1.06); }
  60% { transform: translateY(0) scaleY(0.92); }
  100% { transform: translateY(0) scaleY(1); }
}

@keyframes deal-in {
  from { transform: scale(0.2); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

// 提示时牌面呼吸：幅度比原来（1 → 1.2 → 0.8）大得多，还带一点摆动，
// 否则在满盘 emoji 里不够显眼
@keyframes breathe {
  0%, 100% { transform: scale(1) rotate(0deg); }
  22% { transform: scale(1.42) rotate(-7deg); }
  62% { transform: scale(0.66) rotate(7deg); }
  82% { transform: scale(1.08) rotate(-2deg); }
}

// 提示时牌面本体的底色 / 描边 / 光晕一起脉冲，和 emoji 的呼吸同节拍；
// 用颜色而不是位置，避免和交换、下落的 left/top 过渡打架
@keyframes hint-card {
  0%, 100% {
    background-color: var(--card-bg-color);
    border-color: var(--tile-border-color);
    box-shadow: var(--shadow-soft);
  }
  50% {
    background-color: var(--hint-bg);
    border-color: var(--primary-bg);
    box-shadow: 0 0 0 2px var(--hint-glow), 0 0 14px 3px var(--hint-glow);
  }
}

// 大消（一轮 ≥4 个）的爆开：比普通 pop-out 更大、带旋转高光
@keyframes pop-out-big {
  0% { transform: scale(1) rotate(0deg); filter: brightness(1); }
  35% { transform: scale(1.55) rotate(-12deg); filter: brightness(1.7); }
  70% { transform: scale(1.3) rotate(10deg); filter: brightness(1.4); }
  100% { transform: scale(0) rotate(0deg); opacity: 0; }
}

// 大消 / 连锁时棋盘外圈的一圈闪光
@keyframes board-celebrate {
  0% { box-shadow: 0 0 0 0 transparent; }
  25% { box-shadow: 0 0 0 4px var(--celebrate-glow), 0 0 26px 8px var(--celebrate-glow); }
  100% { box-shadow: 0 0 0 0 transparent; }
}

// 庆祝文字：弹出 → 顿一下 → 上飘淡出
@keyframes celebrate-pop {
  0% { opacity: 0; transform: translate(-50%, -30%) scale(0.4) rotate(-6deg); }
  28% { opacity: 1; transform: translate(-50%, -50%) scale(1.16) rotate(3deg); }
  44% { opacity: 1; transform: translate(-50%, -50%) scale(1) rotate(0deg); }
  78% { opacity: 1; transform: translate(-50%, -62%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -100%) scale(0.92); }
}

@keyframes swap-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-8%); }
  75% { transform: translateX(8%); }
}

// 炸弹 / 万能元素：持续的呼吸缩放
@keyframes breath {
  0%, 100% { transform: scale(0.95); }
  50% { transform: scale(1.05); }
}

// 炸弹引爆时的棋盘震动
@keyframes board-shake {
  0%, 100% { transform: translate(0, 0); }
  15% { transform: translate(-5px, 2px); }
  30% { transform: translate(4px, -3px); }
  45% { transform: translate(-3px, -2px); }
  60% { transform: translate(3px, 2px); }
  80% { transform: translate(-2px, 1px); }
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
    // 操作区只剩「盘面信息 + 新游戏」，比例与连连看 / 大师一致
    .opt-half {
      flex: 1.6;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .level-note {
      font-size: 13px;
      color: var(--muted-color);
      white-space: nowrap;
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
    &.ghost {
      background: var(--card-bg-color);
      color: var(--text-color);
      border: 1px solid var(--border-color);
    }
  }
  .game-area {
    position: relative;
    width: calc(100% - 32px);
    max-width: 440px;
    box-sizing: border-box;
  }
  .board-frame {
    width: fit-content;
    margin: 0 auto;
    padding: 8px;
    border-radius: var(--card-radius);
    touch-action: none;
    // 炸弹引爆时整块棋盘震动一下
    &.shaking {
      animation: board-shake 0.34s ease;
    }
  }
  .board {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--n), var(--cell));
    grid-auto-rows: var(--cell);
    gap: 4px;
    // 大消 / 连锁时外圈闪一圈（动 box-shadow 不动 transform：不改变文档可滚动范围）
    &.celebrating {
      border-radius: var(--radius-tile);
      animation: board-celebrate 0.9s ease-out;
    }
    .cell {
      border-radius: var(--radius-tile);
      background: var(--cell-bg);
      // 不可消除的墙：emoji 下落时可以穿过，但不能交换/消除
      &.wall {
        background: var(--wall-bg);
        background-image: repeating-linear-gradient(45deg,
          transparent 0 6px,
          var(--wall-stripe) 6px 9px);
        border: 1px solid var(--tile-border-color);
        box-sizing: border-box;
      }
    }
  }
  .gem {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--cell);
    height: var(--cell);
    // 必须 border-box：否则 1px 边框会画在 --cell 之外，整块牌变成 34+2px，
    // 底色（炸弹/万能元素是有色的）就会比下面的格子大一圈、往右下溢出 1px，
    // 看起来像「背景色和边框错位、没有重合」
    box-sizing: border-box;
    border-radius: var(--radius-tile);
    background: var(--card-bg-color);
    // 与其它 emoji 游戏的棋子同款：描边 + 软阴影
    border: 1px solid var(--tile-border-color);
    box-shadow: var(--shadow-soft);
    font-size: var(--font);
    line-height: 1;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    // 位置过渡 = 掉落/交换动画的载体（ease 平滑启停，交换/下落都丝滑）
    transition: left 0.24s ease, top 0.24s ease;
    .face {
      display: inline-block;
      line-height: 1;
    }
    &.selected {
      border-color: var(--primary-bg);
      box-shadow: 0 0 0 2px var(--primary-bg);
      transform: scale(1.06);
    }
    // 炸弹 / 万能元素：持续呼吸（挂在内部 face 上，避免与其它 transform 动画冲突）
    &.bomb .face,
    &.wild .face {
      animation: breath 1.6s ease-in-out infinite;
    }
    &.bomb {
      background: var(--del-bg);
    }
    &.wild {
      background: var(--enter-bg);
    }
    &.swapping {
      animation: swap-shake 0.4s ease;
    }
    // 提示到的那两张牌：emoji 大幅呼吸 + 牌面底色脉冲发光（不加箭头 / 数字）。
    // 这两条写在 fresh / falling / dealt / matched / blasting 之前：提示只在静置时出现，
    // 那几条动画类此时都不在牌上，不会互相顶掉；真撞上时也以消除 / 掉落动画优先
    &.hinting {
      z-index: 2;
      animation: hint-card 0.8s ease-in-out 3;
    }
    &.hinting .face {
      display: inline-block;
      animation: breathe 0.8s ease-in-out 3;
    }
    &.fresh {
      animation: drop-in 0.3s ease-out;
    }
    &.falling {
      animation: land-bounce 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    &.dealt {
      animation: deal-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
    }
    // 消除类动画写在最后：同一元素同时带 fresh/falling 与 matched/blasting 时，
    // 靠后的规则胜出（选择器权重相同），否则消除动画会被掉落/落格动画顶掉
    &.matched {
      animation: pop-out 0.35s ease forwards;
      pointer-events: none;
    }
    // 一轮消掉 4 个以上：这批牌爆得更大（权重更高，写在 matched 后面且多一个类）
    &.matched.huge {
      animation: pop-out-big 0.35s ease forwards;
    }
    // 被炸弹波及：放大 + 闪白后消失
    &.blasting {
      animation: blast-out 0.34s ease forwards;
      pointer-events: none;
    }
  }
  // 大消 / 连锁的庆祝浮字：棋盘正中弹出，不挡操作
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
    // 不 nowrap：320px 宽的窄屏上 tier-3 的长文案（×4 连锁 · 6 连消！+304）
    // 会顶出视口、把文档撑出横向滚动条，这里让它最多占满游戏区、必要时折行
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
      opacity: 0.92;
      font-variant-numeric: tabular-nums;
    }
    // 连锁越深、消得越多，浮字越大、光圈越亮
    &.tier-2 {
      box-shadow: 0 6px 20px var(--celebrate-glow), 0 0 0 3px var(--celebrate-glow);
      .celebrate-text {
        font-size: 21px;
      }
    }
    &.tier-3 {
      padding: 12px 22px;
      box-shadow: 0 8px 26px var(--celebrate-glow), 0 0 0 4px var(--celebrate-glow);
      .celebrate-text {
        font-size: 24px;
      }
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
    color: var(--lose-color);
    font-weight: bold;
    font-size: 18px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    text-align: center;
    padding: 12px;
    box-sizing: border-box;
    &.win {
      color: var(--win-color);
    }
    .final-score {
      font-size: 28px;
      margin-top: 4px;
    }
    .result-btns {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: center;
      margin-top: 6px;
    }
  }
}

</style>
