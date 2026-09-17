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
        <span class="stat-label">{{ i18n('timeLeft') }}</span>
        <span class="stat-value" :class="{ urgent: timeLeft <= 15 }">{{ fmt(timeLeft) }}</span>
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
      <div class="opt-half">
        <span class="level-note">{{ boardLabel }}</span>
      </div>
      <div class="divider"></div>
      <div class="start-wrapper">
        <button @click="confirming = true" class="game-icon">{{ i18n('start') }}</button>
      </div>
      <!-- 只负责计时与每秒回调（剩余时间已经显示在顶部统计条里，这里不显示数字） -->
      <CountTimer ref="timerRef" :enable="timerRunning" :on-tick="onTimerTick" :show="false" />
    </div>
    <div class="game-area">
      <div class="board dot-board" :style="boardStyle">
        <template v-for="(row, r) in board" :key="r">
          <div v-for="(cell, c) in row" :key="`${r}-${c}`" class="cell">
            <button
              v-if="cell"
              class="tile"
              :class="{ selected: isSelected(r, c), shaking: isShaking(r, c), hinting: isHinting(r, c), dealing }"
              :style="{ animationDelay: `${dealing ? tileIndex(r, c) * 25 : 0}ms` }"
              @click="onTileClick(r, c)"
            ><span class="tile-face">{{ cell }}</span></button>
            <div v-else-if="ghostAt(r, c)" class="tile vanishing">{{ ghostAt(r, c).emoji }}</div>
            <div v-else-if="walls[r] && walls[r][c]" class="wall-block"></div>
          </div>
        </template>
        <svg
          v-if="linkPath"
          :key="linkKey"
          class="link-layer"
          :style="linkLayerStyle"
          :viewBox="linkViewBox"
          preserveAspectRatio="none"
        >
          <polyline class="link-halo" :points="linkPoints" pathLength="1" />
          <polyline class="link-line" :points="linkPoints" pathLength="1" />
          <polyline class="link-comet" :points="linkPoints" pathLength="1" />
        </svg>
      </div>
      <div v-if="shuffleTip" class="shuffle-tip">{{ i18n('shuffleTip') }}</div>
      <div v-if="phase === WON" class="result win">
        <div>🎉🎉 {{ i18n('levelDone').replace('{n}', level) }} 🎉🎉</div>
        <div class="final-time">{{ fmt(elapsed) }}</div>
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
import confetti from '@/shared/confetti';
import { i18n } from '@/shared/i18n';
import { EMOJIS } from '@/shared/emojis';
import { findPath, generateBoard, generateLevelBoard, hasMove, shuffleBoard, levelConfig } from './board';

// 闯关制：难度由「棋盘大小 + emoji 种类 + 牌数 + 墙数 + 限时」共同决定，
// 前 11 关逐关变难，第 11 关起全部封顶（关数无限，难度不再上升）
const [PLAY, WON, OVER] = ['play', 'won', 'over'];
const KEY_PREFIX = '__emoji_link__';
const LEVEL_KEY = `${KEY_PREFIX}level`;          // 当前关卡
const BEST_KEY = `${KEY_PREFIX}best_1`;          // 历史最高关卡（沿用「前缀+数字」以便连点标题清记录）
const STATE_KEY = `${KEY_PREFIX}state`;

function loadLevel() {
  return Math.max(1, Math.floor(+(localStorage.getItem(LEVEL_KEY) || 1)) || 1);
}

const level = ref(loadLevel());
const bestLevel = ref(Math.max(level.value, Math.floor(+(localStorage.getItem(BEST_KEY) || 1)) || 1));
const board = ref([]);
// 当前局的墙壁网格（H×W 0/1），由关卡配置决定
const walls = ref([]);
const phase = ref(PLAY);
const selected = ref(null);
const mismatch = ref(null);
const vanishing = ref([]);
const linkPath = ref(null);
const linkKey = ref(0);
const shuffleTip = ref(false);
// 发牌动画中：牌按序号逐个入场（与对对碰一致），结束后恢复无延迟
const dealing = ref(false);
let dealTimer = null;
// 空闲提示：6s 无操作时高亮一对可连的牌
const IDLE_HINT_MS = 6000;
const hintPair = ref(null);
// 上一次提示的对（pokeIdle 清 hintPair 但保留它，用于连续提示时换一对）
let lastHintPair = null;
let idleTimer = null;
let hintTimer = null;
const confirming = ref(false);
const elapsed = ref(0);
const timerRef = ref(null);

const conf = computed(() => levelConfig(level.value));
const size = computed(() => [conf.value.rows, conf.value.cols]);
const leftPairs = computed(() => board.value.flat().filter(Boolean).length / 2);
const timerRunning = computed(() => phase.value === PLAY);
const timeLeft = computed(() => Math.max(0, conf.value.time - elapsed.value));
// 本关进度：已消除的对数占本关总对数的比例
const progress = computed(() => {
  const total = conf.value.pairs;
  return total ? Math.min(100, Math.round(((total - leftPairs.value) / total) * 100)) : 0;
});
const boardLabel = computed(() => {
  const c = conf.value;
  return `${c.rows}×${c.cols} · ${i18n('kindsLabel').replace('{n}', c.kinds)}`
    + (c.walls ? ` · ${i18n('wallsLabel').replace('{n}', c.walls)}` : '');
});

// 棋盘尺寸：宽高都要放得下（大关卡的 10×11 以高度为准）
const boardStyle = computed(() => {
  const { rows, cols } = conf.value;
  const availW = Math.min(window.innerWidth || 420, 440) - 32;
  const availH = Math.max(280, (window.innerHeight || 700) - 340);
  const width = Math.min(availW, (availH * cols) / rows);
  const cell = width / cols;
  return {
    '--rows': rows,
    '--cols': cols,
    '--font': `${Math.max(13, Math.round(cell * 0.46))}px`,
  };
});

// 发牌序号：按阅读顺序只数有牌的格子，空白格不占号，让入场节奏均匀
const tileOrder = computed(() => {
  const order = new Map();
  let idx = 0;
  board.value.forEach((row, r) => row.forEach((cell, c) => {
    if (cell) order.set(`${r},${c}`, idx++);
  }));
  return order;
});
function tileIndex(r, c) {
  return tileOrder.value.get(`${r},${c}`) || 0;
}

// 触发逐个入场动画；totalDelay 后结束（动画本身 0.35s）
function startDealing() {
  clearTimeout(dealTimer);
  dealing.value = true;
  const count = tileOrder.value.size;
  dealTimer = setTimeout(() => {
    dealing.value = false;
  }, count * 25 + 350);
}

// ---------- 空闲提示 ----------
// 任何玩家交互后调用：清掉提示并重新起 6s 计时
function pokeIdle() {
  hintPair.value = null;
  clearTimeout(hintTimer);
  clearTimeout(idleTimer);
  if (phase.value !== PLAY) return;
  idleTimer = setTimeout(showHint, IDLE_HINT_MS);
}

// 找一对可连的牌播放呼吸缩放；播完（2 次循环 ≈ 1.6s）后重新计时。
// 连续提示时换一对不同的（排除上一次提示过的那对，随机挑选）
function showHint() {
  if (phase.value !== PLAY) return;
  const [H, W] = size.value;
  const byEmoji = new Map();
  board.value.forEach((row, r) => row.forEach((v, c) => {
    if (!v) return;
    if (!byEmoji.has(v)) byEmoji.set(v, []);
    byEmoji.get(v).push([r, c]);
  }));
  const connectable = [];
  for (const positions of byEmoji.values()) {
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const [r1, c1] = positions[i];
        const [r2, c2] = positions[j];
        if (findPath(board.value, H, W, r1, c1, r2, c2, walls.value)) {
          connectable.push([[r1, c1], [r2, c2]]);
        }
      }
    }
  }
  if (connectable.length) {
    let pool = connectable;
    if (lastHintPair && connectable.length > 1) {
      const [pr1, pc1] = lastHintPair[0];
      const [pr2, pc2] = lastHintPair[1];
      const same = ([[a], [b]]) => a[0] === pr1 && a[1] === pc1 && b[0] === pr2 && b[1] === pc2;
      pool = connectable.filter(p => !same(p));
    }
    const pick = pool[~~(Math.random() * pool.length)];
    hintPair.value = pick;
    lastHintPair = pick;
    hintTimer = setTimeout(pokeIdle, 1700);
    return;
  }
  // 无可连对（死局重排即将触发）时不提示
  hintTimer = setTimeout(pokeIdle, IDLE_HINT_MS);
}

function isHinting(r, c) {
  return !!hintPair.value && hintPair.value.some(([hr, hc]) => hr === r && hc === c);
}

// 连线层就是棋盘本身那么大：**不要**再往外放大一圈。之前它按 (W+2)/W 放大、
// 再左上各偏一格，好让「棋盘外一圈」的虚拟通道落在 SVG 里——线本身画在小一圈
// 的位置（LANE_GAP），可 SVG 这个**盒子**会伸到视口外（棋盘离屏幕边只有 16px，
// 放大一圈就是 30px 上下），于是连线的那 0.7 秒里文档突然可滚动、线一消失又恢复，
// 滚动条一进一出 / 手机端橡皮筋回弹，看起来就是「连线时界面抖一下」。
// 现在盒子 = 棋盘，超出的部分只有 LANE_GAP 那一丁点（十几 px，落在 16px 页边距 /
// 棋盘下方的留白里），文档可滚动范围在连线前后完全不变
const linkLayerStyle = { width: '100%', height: '100%', left: 0, top: 0 };
const linkViewBox = computed(() => {
  const [H, W] = size.value;
  return `0 0 ${W} ${H}`;
});
// 连线端点从牌中心沿路径方向内缩，让线贴近牌的边缘起止
const ENDPOINT_INSET = 0.42;
// 棋盘外一圈的虚拟通道渲染时贴着棋盘边缘（而非半格之外）：
// 棋盘几乎占满屏宽（左右页边距仅 16px），绕左右两侧的线跑到半格外就会出屏
const LANE_GAP = 0.14;
const linkPoints = computed(() => {
  const pts = linkPath.value || [];
  if (pts.length < 2) return '';
  const [H, W] = size.value;
  // 坐标系与格子 1:1（viewBox 就是 W×H）：格子中心 = (c + 0.5, r + 0.5)，
  // 棋盘外那一圈落在 -LANE_GAP / W + LANE_GAP 上
  const svg = pts.map(([r, c]) => {
    let x = c + 0.5;
    let y = r + 0.5;
    if (c === -1) x = -LANE_GAP;
    else if (c === W) x = W + LANE_GAP;
    if (r === -1) y = -LANE_GAP;
    else if (r === H) y = H + LANE_GAP;
    return [x, y];
  });
  const inset = (idx, towards) => {
    const [x1, y1] = svg[idx];
    const [x2, y2] = svg[towards];
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    svg[idx] = [x1 + ((x2 - x1) / len) * ENDPOINT_INSET, y1 + ((y2 - y1) / len) * ENDPOINT_INSET];
  };
  inset(0, 1);
  inset(svg.length - 1, svg.length - 2);
  return svg.map(([x, y]) => `${x},${y}`).join(' ');
});

let vanishId = 0;
let linkTimer = null;
let vanishTimers = [];
let shuffleTimer = null;
let shuffleTipTimer = null;
let winTimer = null;

onMounted(() => {
  const savedTime = restore();
  if (savedTime == null) {
    initLevel(level.value);
  } else {
    elapsed.value = savedTime;
    timerRef.value.restore(savedTime);
    // 恢复的是结算局面：计时停住，等玩家自己点「重玩本关 / 下一关」
    if (phase.value !== PLAY) timerRef.value.stop();
    else pokeIdle();
  }
});

onUnmounted(clearTransient);

function fmt(sec) {
  return ('00' + ~~(sec / 60)).slice(-2) + ':' + ('00' + sec % 60).slice(-2);
}

// 恢复退出前的局面：棋盘 + 关卡 + 墙壁 + 用时 + 胜负状态
let shuffledOnRestore = false;
function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY));
    if (!saved || !Array.isArray(saved.board) || !saved.board.length) return null;
    const c = levelConfig(+(saved.level || 1));
    const [H, W] = [c.rows, c.cols];
    if (saved.board.length !== H || !Array.isArray(saved.board[0]) || saved.board[0].length !== W) return null;
    let restoredWalls = [];
    if (Array.isArray(saved.walls) && saved.walls.length === H
      && Array.isArray(saved.walls[0]) && saved.walls[0].length === W) {
      restoredWalls = saved.walls.map(row => row.slice());
    }
    let restored = saved.board.map(row => row.slice());
    const remaining = restored.flat().filter(Boolean).length;
    level.value = c.level;
    if (level.value > bestLevel.value) bestLevel.value = level.value;
    if (saved.phase === WON && !remaining) {
      phase.value = WON;
    } else if (saved.phase === OVER && remaining) {
      phase.value = OVER;
    } else if (remaining) {
      phase.value = PLAY;
      // 存档时正处于死局重排的间隙：恢复后立即重排（同样带发牌动画）
      if (!hasMove(restored, H, W, restoredWalls)) {
        const rest = restored.flat().filter(Boolean);
        restored = shuffleBoard(restored, H, W, Math.random, restoredWalls);
        if (!hasMove(restored, H, W, restoredWalls)) {
          restored = generateBoard(H, W, rest, Math.random, rest.length / 2, restoredWalls);
        }
        shuffledOnRestore = true;
      }
    } else {
      return null;
    }
    board.value = restored;
    walls.value = restoredWalls;
    if (phase.value === PLAY) startDealing();
    if (shuffledOnRestore) shuffleTip.value = true;
    shuffledOnRestore = false;
    return saved.time || 0;
  } catch {
    return null;
  }
}

function save() {
  localStorage.setItem(STATE_KEY, JSON.stringify({
    board: board.value,
    walls: walls.value,
    level: level.value,
    time: elapsed.value,
    phase: phase.value,
  }));
}

function onTimerTick() {
  elapsed.value = timerRef.value?.seconds() || 0;
  if (phase.value !== PLAY) return;
  // 限时到：时间用尽即失败（剩余牌没消完）
  if (timeLeft.value <= 0) {
    loseLevel();
    return;
  }
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
    saved.time = elapsed.value;
    localStorage.setItem(STATE_KEY, JSON.stringify(saved));
  } catch { /* 存档损坏时静默跳过，下一次 save() 会整体重写 */ }
}

function clearTransient() {
  clearTimeout(linkTimer);
  linkTimer = null;
  clearTimeout(dealTimer);
  dealTimer = null;
  dealing.value = false;
  clearTimeout(idleTimer);
  idleTimer = null;
  clearTimeout(hintTimer);
  hintTimer = null;
  hintPair.value = null;
  lastHintPair = null;
  vanishTimers.forEach(clearTimeout);
  vanishTimers = [];
  clearTimeout(shuffleTimer);
  shuffleTimer = null;
  clearTimeout(shuffleTipTimer);
  shuffleTipTimer = null;
  clearTimeout(winTimer);
  winTimer = null;
  vanishing.value = [];
  linkPath.value = null;
  shuffleTip.value = false;
}

async function initLevel(lv) {
  clearTransient();
  confirming.value = false;
  level.value = Math.max(1, lv);
  localStorage.setItem(LEVEL_KEY, level.value);
  if (level.value > bestLevel.value) {
    bestLevel.value = level.value;
    localStorage.setItem(BEST_KEY, bestLevel.value);
  }
  const c = conf.value;
  const [H, W] = [c.rows, c.cols];
  // 先渲染空矩阵销毁全部旧牌元素再填充：牌按坐标 :key 复用，
  // 若直接换盘，同坐标的旧元素不会重播发牌动画、旧 emoji 会瞬间可见
  board.value = Array.from({ length: H }, () => Array.from({ length: W }, () => null));
  walls.value = [];
  await nextTick();
  const { board: next, walls: nextWalls } = generateLevelBoard(H, W, EMOJIS, c);
  board.value = next;
  walls.value = nextWalls;
  phase.value = PLAY;
  selected.value = null;
  mismatch.value = null;
  elapsed.value = 0;
  timerRef.value?.reset();
  startDealing();
  pokeIdle();
  save();
}

function nextLevel() {
  initLevel(level.value + 1);
}

function replayLevel() {
  initLevel(level.value);
}

// 新游戏：清除闯关记录（最高关卡）并从第 1 关重新开始，任何时候点都要二次确认
function startNewGame() {
  confirming.value = false;
  localStorage.removeItem(BEST_KEY);
  bestLevel.value = 1;
  initLevel(1);
}

function onScoreReset() {
  localStorage.removeItem(BEST_KEY);
  bestLevel.value = level.value;
}

function isSelected(r, c) {
  return selected.value && selected.value[0] === r && selected.value[1] === c;
}

function isShaking(r, c) {
  return mismatch.value && mismatch.value.some(([mr, mc]) => mr === r && mc === c);
}

function ghostAt(r, c) {
  return vanishing.value.find(g => g.r === r && g.c === c);
}

function onTileClick(r, c) {
  if (phase.value !== PLAY || !board.value[r][c] || mismatch.value) return;
  pokeIdle();
  if (!selected.value) {
    selected.value = [r, c];
    return;
  }
  const [sr, sc] = selected.value;
  if (sr === r && sc === c) {
    selected.value = null;
    return;
  }
  const [H, W] = size.value;
  if (board.value[sr][sc] !== board.value[r][c]) {
    // emoji 不同：静默把焦点切换到刚点的牌
    selected.value = [r, c];
    return;
  }
  const path = findPath(board.value, H, W, sr, sc, r, c, walls.value);
  if (!path) {
    // 相同但路径不通：双牌抖动提示
    onMismatch([sr, sc], [r, c]);
    return;
  }
  removePair(path, [sr, sc], [r, c]);
}

function onMismatch(a, b) {
  mismatch.value = [a, b];
  selected.value = null;
  setTimeout(() => {
    if (mismatch.value) mismatch.value = null;
  }, 400);
}

function removePair(path, a, b) {
  const [ar, ac] = a;
  const [br, bc] = b;
  const ghosts = [
    { id: ++vanishId, r: ar, c: ac, emoji: board.value[ar][ac] },
    { id: ++vanishId, r: br, c: bc, emoji: board.value[br][bc] },
  ];
  // 数据立即消除（后续连通判断基于新盘面），动画交给幻影牌独立播放
  board.value[ar][ac] = null;
  board.value[br][bc] = null;
  selected.value = null;

  clearTimeout(linkTimer);
  linkKey.value++;
  linkPath.value = path;
  linkTimer = setTimeout(() => {
    linkPath.value = null;
  }, 800);

  vanishing.value.push(...ghosts);
  vanishTimers.push(setTimeout(() => {
    vanishing.value = vanishing.value.filter(g => !ghosts.some(x => x.id === g.id));
  }, 600));

  const [H, W] = size.value;
  if (!board.value.flat().some(Boolean)) {
    win();
    return;
  }
  if (!hasMove(board.value, H, W, walls.value)) {
    // 等连线动画播完再重排；重排本身带逐个入场的 deal 动画
    shuffleTimer = setTimeout(async () => {
      if (phase.value !== PLAY || hasMove(board.value, H, W, walls.value)) return;
      const before = board.value;
      const rest = before.flat().filter(Boolean);
      // 先在原位置集合上重排；若救不活（如仅剩的一对被墙围死，
      // 任何排列都无解），退而重新生成一局等对数的新盘面
      let next = shuffleBoard(before, H, W, Math.random, walls.value);
      if (!hasMove(next, H, W, walls.value)) {
        next = generateBoard(H, W, rest, Math.random, rest.length / 2, walls.value);
      }
      // 先清空渲染（销毁旧牌元素）再填充，让重排重播发牌动画
      board.value = Array.from({ length: H }, () => Array.from({ length: W }, () => null));
      await nextTick();
      board.value = next;
      selected.value = null;
      shuffleTip.value = true;
      startDealing();
      pokeIdle();
      shuffleTipTimer = setTimeout(() => {
        shuffleTip.value = false;
      }, 1600);
      save();
    }, 650);
  }
  save();
}

function win() {
  elapsed.value = timerRef.value?.seconds() || 0;
  timerRef.value?.stop();
  phase.value = WON;
  // 过关：闯关进度推进到下一关（本次局面作废，下次进入直接开新关）
  localStorage.setItem(LEVEL_KEY, level.value + 1);
  if (level.value + 1 > bestLevel.value) {
    bestLevel.value = level.value + 1;
    localStorage.setItem(BEST_KEY, bestLevel.value);
  }
  localStorage.removeItem(STATE_KEY);   // 结算局面不留在存档里
  // 结算遮罩等最后一对的消除动画播完再出现
  winTimer = setTimeout(confetti, 600);
}

function loseLevel() {
  elapsed.value = timerRef.value?.seconds() || 0;
  timerRef.value?.stop();
  phase.value = OVER;
  clearTimeout(idleTimer);
  clearTimeout(hintTimer);
  hintPair.value = null;
  save();                                // 失败局面也存档：退出重进还是这一关，等玩家自己重玩
}
</script>

<style scoped lang="scss">
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

// 空闲提示：只缩放 emoji 本身（.tile-face），背景卡片不动；
// 0.8 ↔ 1.2 缓慢呼吸两个来回（约 1.6s，播两次循环）
@keyframes breathe {
  0%, 100% { transform: scale(1); }
  25% { transform: scale(1.2); }
  75% { transform: scale(0.8); }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}

@keyframes vanish {
  0% { transform: scale(1); opacity: 1; }
  40% { transform: scale(1.12); opacity: 1; }
  100% { transform: scale(0); opacity: 0; }
}

// 连线先描边画出（dashoffset 1→0），停留片刻后淡出
@keyframes link-draw {
  to { stroke-dashoffset: 0; }
}

@keyframes link-fade {
  to { opacity: 0; }
}

// 一小段亮线沿路径从头扫到尾（dashoffset 从 1 递减到 0.18）
@keyframes link-sweep {
  to { stroke-dashoffset: 0.18; }
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
    margin-top: 70px;
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
  .board {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--cols), 1fr);
    grid-auto-rows: 1fr;
    aspect-ratio: var(--cols) / var(--rows);
    border-radius: var(--card-radius);
    .tile { font-size: var(--font); }
  }
  // 连线层比棋盘四周各大一格（虚拟外圈），viewBox 与格子等比例，
  // 格子中心严格落在 (col+1.5, row+1.5)，端点不会偏移
  .link-layer {
    position: absolute;
    pointer-events: none;
    z-index: 2;
    overflow: visible;
  }
  .link-line {
    fill: none;
    stroke: var(--win-color);
    stroke-width: 0.08;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: link-draw 0.12s ease-out forwards, link-fade 0.18s ease-in 0.55s forwards;
  }
  .link-halo {
    fill: none;
    stroke: var(--win-color);
    stroke-width: 0.18;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.25;
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: link-draw 0.12s ease-out forwards, link-fade 0.18s ease-in 0.55s forwards;
  }
  // 一段短亮线沿线扫过，营造流动感
  .link-comet {
    fill: none;
    stroke: var(--win-color);
    stroke-width: 0.11;
    stroke-linecap: round;
    opacity: 0.9;
    stroke-dasharray: 0.18 0.82;
    stroke-dashoffset: 1;
    animation: link-sweep 0.45s cubic-bezier(0.3, 0, 0.4, 1) forwards, link-fade 0.18s ease-in 0.55s forwards;
  }
  .cell {
    position: relative;
  }
  .tile {
    position: absolute;
    inset: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    box-sizing: border-box;
    // 与消消乐 / 大师的棋子同款：圆角令牌 + 描边 + 软阴影
    border: 1px solid var(--tile-border-color);
    box-shadow: var(--shadow-soft);
    border-radius: var(--radius-tile);
    background: var(--card-bg-color);
    color: var(--text-color);
    -webkit-tap-highlight-color: transparent;
    transition: transform 0.12s ease, box-shadow 0.12s ease;
    // 发牌动画只在 dealing 期间生效：结束后规则彻底移除，
    // 避免 selected/shaking 切换时 deal 规则重新应用导致牌「消失重现」
    &.dealing:not(.selected):not(.shaking):not(.vanishing) {
      animation: 0.35s ease backwards deal;
    }
    &.selected {
      transform: scale(1.12);
      background: var(--enter-bg);
      box-shadow: 0 0 0 2px var(--primary-bg);
      z-index: 1;
    }
    &.shaking {
      animation: shake 0.35s ease !important;
    }
    // 空闲提示的呼吸缩放只作用于 emoji 文本层，卡片背景保持静止
    &.hinting {
      z-index: 1;
      .tile-face {
        display: inline-block;
        animation: breathe 0.8s ease-in-out 2;
      }
    }
    &.vanishing {
      pointer-events: none;
      background: var(--enter-bg);
      box-shadow: 0 0 0 2px var(--win-color);
      animation: vanish 0.55s ease forwards !important;
    }
  }
  // 墙壁：比牌更暗的斜纹块，不可点击、不参与消除
  .wall-block {
    position: absolute;
    inset: 3px;
    border-radius: var(--radius-tile);
    background: var(--wall-bg);
    background-image: repeating-linear-gradient(45deg,
      transparent 0 6px,
      var(--wall-stripe) 6px 9px);
    border: 1px solid var(--tile-border-color);
    box-sizing: border-box;
  }
  .shuffle-tip {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 3;
    padding: 10px 18px;
    border-radius: var(--radius-tile);
    background: var(--mask-color);
    color: var(--text-color);
    font-size: 15px;
    font-weight: bold;
    white-space: nowrap;
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
