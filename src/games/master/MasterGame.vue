<template>
  <div class="wrapper" :style="layout.vars">
    <TopHeader />
    <div class="card score-area">
      <div class="stat">
        <span class="stat-label">{{ i18n('level') }}</span>
        <span class="stat-value">{{ level }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('remain') }}</span>
        <span class="stat-value">{{ tiles.length }}</span>
      </div>
      <!-- 本关进度条（已消除卡片 / 本关总卡片） -->
      <div class="progress"><div class="progress-bar" :style="{ width: `${progress}%` }"></div></div>
    </div>
    <div class="card opt-area">
      <div class="opt-half">
        <span class="level-note">{{ boardLabel }}</span>
      </div>
      <div class="divider"></div>
      <div class="start-wrapper">
        <button class="game-icon" @click="confirming = true">{{ i18n('start') }}</button>
      </div>
    </div>
    <div class="board-wrap dot-board">
      <div class="board">
        <div
          v-for="tile in tiles"
          :key="`${gameId}-${tile.id}`"
          class="tile"
          :class="[`depth-${coverDepth.get(tile.id) || 0}`, { covered: !freeSet.has(tile.id) }]"
          :style="tileStyle(tile)"
          @click="pick(tile, $event)"
        >{{ tile.emoji }}</div>
      </div>
      <Transition name="win-pop">
        <div v-if="phase === WON || phase === OVER" class="result" :class="phase === WON ? 'win' : 'lose'">
          <template v-if="phase === WON">
            <span>🎉🎉 {{ i18n('tipWin') }} 🎉🎉</span>
            <span class="level-note">{{ i18n('levelDone').replace('{n}', level) }}</span>
            <button @click="nextLevel" class="game-icon again">{{ i18n('nextLevel') }}</button>
          </template>
          <template v-else>
            <span>👻👻 {{ i18n('tipLost') }} 👻👻</span>
            <span class="level-note">{{ i18n('level') }} {{ level }}</span>
            <button @click="replayLevel" class="game-icon again">{{ i18n('replayLevel') }}</button>
          </template>
        </div>
      </Transition>
    </div>
    <div class="card tray">
      <div class="slots">
        <div v-for="i in TRAY_SIZE" :key="i" class="slot"></div>
      </div>
      <div
        v-for="(card, idx) in tray"
        :key="card.uid"
        class="tray-card"
        :class="{ clearing: card.clearing }"
        :style="trayCardStyle(idx)"
      >{{ card.emoji }}</div>
    </div>
    <Teleport to="body">
      <div
        v-for="f in flights"
        :key="f.uid"
        :ref="el => setFlyEl(f.uid, el)"
        class="fly-card"
        :style="flyStyleOf(f)"
      >{{ f.emoji }}</div>
    </Teleport>
    <!-- 共用的二次确认弹窗（文案与样式都在 shared/ConfirmDialog.vue 里） -->
    <ConfirmDialog :show="confirming" @confirm="startNewGame" @cancel="confirming = false" />
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';

import TopHeader from '@/components/TopHeader.vue';
import ConfirmDialog from '@/shared/ConfirmDialog.vue';
import confetti from '@/shared/confetti';
import { i18n } from '@/shared/i18n';
import { EMOJIS } from '@/shared/emojis';
import { TILE_UNITS, TRAY_SIZE, freeIds, generateTiles, insertIndex, levelConfig } from './board';

const [PLAY, WON, OVER] = ['play', 'won', 'over'];
const KEY_PREFIX = '__emoji_master__';
const LEVEL_KEY = `${KEY_PREFIX}level`;   // 闯关记录：当前第几关
const STATE_KEY = `${KEY_PREFIX}state`;
const FLY_MS = 260;      // 卡片从原位飞入暂存区
const CLEAR_MS = 560;    // 三消卡片：先闪烁再消失
const WIN_DELAY = 620;   // 最后一组三消闪烁完再弹结算层

const level = ref(loadLevel());
const tiles = ref([]);
const tray = ref([]);
const phase = ref(PLAY);
// 连点保护：每次点击立刻"接受"并独立播自己的飞行（互不等待），
// 同时也把槽位预留出来，避免连点冲过 7 格上限
const flights = ref([]);
const flyEls = new Map();
const confirming = ref(false); // 「新游戏」二次确认弹窗
const gameId = ref(0);
// 开局/恢复时的逐张入场动画窗口（窗口结束后重挂载的卡片不再延迟）
const revealing = ref(false);
const revealRank = new Map();   // 卡片 id -> 同层内的出场顺序
let revealTimer = null;
let winTimer = null;

// 当前可点击（亮色）的卡片
const freeSet = computed(() => freeIds(tiles.value));
const activeTray = computed(() => tray.value.filter(c => !c.clearing).length);

// 覆盖层级：压在这张牌上面的卡片数（0 张 = 亮色可点）。只用于视觉——
// 压得越深越透明，堆叠的层次感就出来了；判定可点击与否仍走 freeIds
const MAX_COVER_DEPTH = 4;   // 更深的一律按最深一档算（层级只影响视觉）
const coverDepth = computed(() => {
  const list = tiles.value;
  const map = new Map();
  for (const tile of list) {
    let n = 0;
    for (const other of list) {
      if (other.layer <= tile.layer) continue;
      if (Math.abs(other.x - tile.x) < TILE_UNITS && Math.abs(other.y - tile.y) < TILE_UNITS) n++;
    }
    map.set(tile.id, Math.min(n, MAX_COVER_DEPTH));
  }
  return map;
});

// 本关的层级与 emoji 种类（写在操作区，和连连看 / 消消乐的盘面信息一致）
const conf = computed(() => levelConfig(level.value));
const boardLabel = computed(() => {
  const c = conf.value;
  return `${i18n('layersLabel').replace('{n}', c.layers)} · ${i18n('kindsLabel').replace('{n}', c.kinds)}`;
});

// 本关进度：已消除的卡片占本关总卡片的比例（入场动画期间按满盘算 0%）
const progress = computed(() => {
  const total = conf.value.tiles;
  if (!total) return 0;
  const left = tiles.value.length + tray.value.filter(c => !c.clearing).length;
  return Math.max(0, Math.min(100, Math.round(((total - left) / total) * 100)));
});
// 盘面 7×7 格（坐标半格制），卡片与收集槽尺寸都按视口收缩
// 游戏区做成一张带底色的卡片（和连连看 / 消消乐的棋盘一样），内缩 BOARD_PAD 留出边框
const BOARD_PAD = 8;
const layout = computed(() => {
  const avail = Math.min(window.innerWidth || 420, 440) - 32;
  const unit = +(((avail - BOARD_PAD * 2) / 14)).toFixed(2);
  const tile = +(unit * 2).toFixed(2);
  const gap = 6;
  const slot = +(((avail - 16) - gap * (TRAY_SIZE - 1)) / TRAY_SIZE).toFixed(2);
  return {
    avail,
    unit,
    tile,
    slot,
    gap,
    vars: {
      '--tile': `${tile}px`,
      '--tile-fs': `${Math.round(tile * 0.5)}px`,
      '--slot': `${slot}px`,
      '--slot-gap': `${gap}px`,
      '--tray-fs': `${Math.round(slot * 0.52)}px`,
      '--board-h': `${(unit * 14 + BOARD_PAD * 2).toFixed(2)}px`,
      '--board-pad': `${BOARD_PAD}px`,
    },
  };
});

// 飞行卡片只负责定位/尺寸，位移与缩放交给 Web Animations API（更可靠，不会被样式批处理吞掉）
function flyStyleOf(f) {
  if (!f) return null;
  return {
    left: `${f.left}px`,
    top: `${f.top}px`,
    width: `${f.w}px`,
    height: `${f.h}px`,
    fontSize: `${Math.round(f.h * 0.5)}px`,
  };
}

onMounted(() => {
  if (!restore()) initLevel(level.value);
});

onUnmounted(() => {
  clearTimeout(revealTimer);
  clearTimeout(winTimer);
});

// 逐张入场：自下层向上层堆叠，同层内按生成顺序依次出现。
// 窗口结束后清掉标记，之后重挂载（如撤回卡片）不再走延迟
const REVEAL_STEP = 10;      // 同层内每张间隔
const REVEAL_LAYER = 70;     // 每高一层整体延后
const REVEAL_MS = 1400;
function revealBoard() {
  clearTimeout(revealTimer);
  revealRank.clear();
  const perLayer = new Map();
  tiles.value.forEach(tile => {
    const n = perLayer.get(tile.layer) || 0;
    perLayer.set(tile.layer, n + 1);
    revealRank.set(tile.id, n);
  });
  revealing.value = true;
  revealTimer = setTimeout(() => { revealing.value = false; }, REVEAL_MS);
}

function revealDelay(tile) {
  return tile.layer * REVEAL_LAYER + (revealRank.get(tile.id) || 0) * REVEAL_STEP;
}

// 任何盘面/收集槽变化都实时落盘，退出回主页后可恢复
watch([tiles, tray], saveState, { deep: true });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function tileStyle(tile) {
  const { unit, tile: size } = layout.value;
  return {
    left: `${(tile.x * unit + 1).toFixed(2)}px`,
    top: `${(tile.y * unit + 1).toFixed(2)}px`,
    width: `${(size - 2).toFixed(2)}px`,
    height: `${(size - 2).toFixed(2)}px`,
    zIndex: tile.layer + 1,
    ...(revealing.value ? { animationDelay: `${revealDelay(tile)}ms` } : null),
  };
}

function trayCardStyle(idx) {
  const { slot, gap } = layout.value;
  return {
    left: `${8 + idx * (slot + gap)}px`,
    top: '8px',
    width: `${slot}px`,
    height: `${slot}px`,
  };
}

// ---------- 关卡 / 新游戏 ----------

function loadLevel() {
  const saved = +(localStorage.getItem(LEVEL_KEY) || 1);
  return saved >= 1 ? saved : 1;
}

function persistLevel(lv) {
  try { localStorage.setItem(LEVEL_KEY, lv); } catch { /* 忽略 */ }
}

// 开始第 lv 关：重新生成盘面并清空收集槽
function initLevel(lv) {
  clearTimeout(winTimer);
  winTimer = null;
  level.value = Math.max(1, lv);
  persistLevel(level.value);
  const { tiles: list } = generateTiles(EMOJIS, level.value);
  tiles.value = list;
  tray.value = [];
  phase.value = PLAY;
  flights.value = [];
  flyEls.clear();
  confirming.value = false;
  gameId.value++;
  revealBoard();
  saveState();
}

// 「新游戏」= 清除闯关记录，回到第 1 关（需二次确认）
function startNewGame() {
  confirming.value = false;
  try { localStorage.removeItem(LEVEL_KEY); } catch { /* 忽略 */ }
  initLevel(1);
}

function nextLevel() {
  initLevel(level.value + 1);
}

function replayLevel() {
  initLevel(level.value);
}

// ---------- 点击卡片 ----------

// 点击盘面卡片：当场接受并立刻开一条独立的飞行动画。
// 连点不再排队等待——每张牌各飞各的（互不阻塞），动画结束各自落格
function pick(tile, event) {
  if (phase.value !== PLAY) return;
  if (!freeSet.value.has(tile.id)) return;
  // 把飞行中的牌也算进占用，连点仍然不会冲过 7 格
  if (tray.value.length + flights.value.length >= TRAY_SIZE) return;
  // 同一张牌连点两次只算一次
  if (flights.value.some(f => f.uid === tile.id)) return;
  const at = tiles.value.findIndex(t => t.id === tile.id);
  if (at < 0) return;
  // currentTarget 只在事件派发期间有效，必须先取出坐标
  const from = event.currentTarget.getBoundingClientRect();
  const snap = { ...tiles.value[at] };
  // 立即从盘面移除：遮挡关系随之更新，其它卡片会被点亮（渐亮动画）
  tiles.value.splice(at, 1);

  const flight = {
    uid: snap.id,
    emoji: snap.emoji,
    from,
    left: from.left,
    top: from.top,
    w: from.width,
    h: from.height,
    gen: gameId.value,
  };
  flights.value.push(flight);
  fly(flight);
}

// 单条飞行：等飞行卡挂到 DOM 后播放 WAAPI 动画，结束即落格。
// 整个过程不 await 给别人，所以多张牌可以同时在飞
async function fly(flight) {
  await nextTick();
  const el = flyEls.get(flight.uid);
  // 目标槽位：按「当前暂存区 + 其它在飞的牌」算（要排掉自己，否则会多算一格，
  // 看起来就像新牌和前一间隔了一个槽），避免两条飞行盯同一个空槽
  const others = flights.value.filter(f => f.uid !== flight.uid);
  const virtualTray = [...tray.value, ...others.map(f => ({ emoji: f.emoji, clearing: false }))];
  const idx0 = insertIndex(virtualTray, flight.emoji);
  const slotEl = document.querySelectorAll('.tray .slot')[idx0];
  const to = slotEl ? slotEl.getBoundingClientRect() : flight.from;
  const from = flight.from;

  if (el) {
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const scale = to.width / from.width;
    try {
      await el.animate(
        [
          { transform: 'translate(0, 0) scale(1)', offset: 0 },
          { transform: `translate(${dx * 0.55}px, ${dy * 0.42}px) scale(${(1 + scale) / 2})`, offset: 0.55 },
          { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, offset: 1 },
        ],
        { duration: FLY_MS, easing: 'cubic-bezier(0.35, 0.75, 0.4, 1)', fill: 'forwards' },
      ).finished;
    } catch {
      await sleep(FLY_MS); // 动画被取消时兜底
    }
  } else {
    await sleep(FLY_MS);
  }

  flights.value = flights.value.filter(f => f.uid !== flight.uid);
  // 期间开了新局 / 恢复存档（或已结算）→ 这次落格作废
  if (flight.gen !== gameId.value || phase.value !== PLAY) return;
  tray.value.splice(insertIndex(tray.value, flight.emoji), 0, { uid: flight.uid, emoji: flight.emoji, clearing: false });
  saveState();
  settle();
}

function setFlyEl(uid, el) {
  if (el) flyEls.set(uid, el);
  else flyEls.delete(uid);
}

// 结算：三消自动消除；槽满且无消除则失败；盘面与收集槽都空则获胜。
// 多张牌现在可以同时飞行、各自落格，所以这里加一道重入保护：
// 结算进行中又有牌落下时，只置一个标记，等这一轮跑完再补一轮
let settling = false;
let settleAgain = false;

async function settle() {
  if (settling) {
    settleAgain = true;
    return;
  }
  settling = true;
  try {
    do {
      settleAgain = false;
      await settlePass();
    } while (settleAgain && phase.value === PLAY);
  } finally {
    settling = false;
  }
}

async function settlePass() {
  // 只在「还没进入消除动画」的卡片里找三消：
  // 上一组正在闪烁消失时，新落下的一组同样要能结算（否则最后一组永远消不掉、本局无法结束）
  const counts = new Map();
  tray.value.filter(c => !c.clearing).forEach(c => counts.set(c.emoji, (counts.get(c.emoji) || 0) + 1));
  const hit = [...counts.entries()].find(([, n]) => n >= 3);
  if (hit) {
    const emoji = hit[0];
    const picked = tray.value.filter(c => c.emoji === emoji && !c.clearing).slice(0, 3);
    picked.forEach(c => { c.clearing = true; });
    await sleep(CLEAR_MS);
    const uids = new Set(picked.map(c => c.uid));
    tray.value = tray.value.filter(c => !uids.has(c.uid));
    // 消除完继续结算：可能又凑出一组，或本局刚好结束
    settleAgain = true;
    return;
  }
  if (activeTray.value >= TRAY_SIZE) {
    lose();
    return;
  }
  // 还有牌在飞的时候不能判定通关（盘面已空但牌还没落完）
  if (!tiles.value.length && !activeTray.value && !flights.value.length) win();
}

function win() {
  if (phase.value !== PLAY || winTimer) return;
  // 过关：闯关进度推进到下一关（本次的盘面存档作废，下次进入直接开新关）
  persistLevel(level.value + 1);
  removeState();
  confetti();
  // 等最后一组三消闪烁消失后再弹结算层
  winTimer = setTimeout(() => { phase.value = WON; }, WIN_DELAY);
}

function lose() {
  if (phase.value !== PLAY) return;
  removeState();
  phase.value = OVER;
}

// ---------- 存档（退出回主页后恢复） ----------

function removeState() {
  try { localStorage.removeItem(STATE_KEY); } catch { /* 忽略 */ }
}

function saveState() {
  if (phase.value !== PLAY) return;
  // 盘面与收集槽都空了 = 本局已结束（胜利结算层有延迟，期间不再落盘）
  if (!tiles.value.length && !tray.value.length) {
    removeState();
    return;
  }
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({
      level: level.value,
      // 卡片：[id, emoji, 层, x, y]
      tiles: tiles.value.map(t => [t.id, t.emoji, t.layer, t.x, t.y]),
      tray: tray.value.map(c => [c.uid, c.emoji]),
    }));
  } catch { /* 忽略 */ }
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY));
    if (!saved || !Array.isArray(saved.tiles) || !Array.isArray(saved.tray)) return false;
    const list = saved.tiles.map(t => ({ id: +t[0], emoji: String(t[1]), layer: +t[2], x: +t[3], y: +t[4] }));
    const ok = list.length > 0
      && list.every(t => t.id > 0 && t.emoji && t.layer >= 0 && t.x >= 0 && t.y >= 0)
      && new Set(list.map(t => t.id)).size === list.length;
    if (!ok) return false;
    const cards = saved.tray.map(c => ({ uid: +c[0], emoji: String(c[1]), clearing: false }));
    if (cards.length > TRAY_SIZE) return false;
    tiles.value = list;
    tray.value = cards;
    phase.value = PLAY;
    clearTimeout(winTimer);
    winTimer = null;
    flights.value = [];
    flyEls.clear();
    // 关卡进度以存档为准（与闯关记录同步）
    level.value = Math.max(1, Math.floor(+saved.level) || loadLevel());
    persistLevel(level.value);
    gameId.value++;
    revealBoard();   // 恢复存档也逐张堆叠出来
    return true;
  } catch {
    return false;
  }
}
</script>

<style scoped lang="scss">
// 「新游戏」二次确认弹窗（Teleport 到 body，层级要盖住帮助弹窗与飞行卡片）

@keyframes tile-in {
  from {
    opacity: 0;
    transform: scale(0.6);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes card-pop {
  from {
    opacity: 0;
    transform: scale(0.5);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

// 三消卡片：先闪烁两下，再旋转缩小消失
@keyframes card-clear {
  0% {
    opacity: 1;
    transform: scale(1);
  }
  15% {
    opacity: 0.12;
    transform: scale(1.14);
  }
  30% {
    opacity: 1;
    transform: scale(1);
  }
  45% {
    opacity: 0.12;
    transform: scale(1.14);
  }
  60% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(0.2) rotate(20deg);
  }
}

// 飞行中的卡片被 Teleport 到 body，样式需定义在顶层（scoped 会带上 data-v）
// 位移/缩放由 Web Animations API 驱动，这里不再声明 transition
.fly-card {
  position: fixed;
  z-index: 60;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-tile);
  background: var(--card-bg-color);
  border: 1px solid var(--tile-border-color);
  box-shadow: var(--shadow-float);
  line-height: 1;
  pointer-events: none;
  will-change: transform;
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
      }
    }
  }
  // 顶部卡片底部的本关进度条
  .score-area .progress {
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
    &.again {
      margin-top: 6px;
    }
  }
  .board-wrap {
    position: relative;
    width: calc(100% - 32px);
    max-width: 440px;
    height: var(--board-h);
    box-sizing: border-box;
    // 游戏区本身是一张带底色的卡片（和连连看 / 消消乐的棋盘同色），
    // 浅色主题下卡片才有依托，不然白底白牌糊成一片
    padding: var(--board-pad);
    border-radius: var(--card-radius);
    // 卡片带 z-index（层数），用 isolation 把它们的层叠限制在本区域内，
    // 否则会盖住 Teleport 到 body 的帮助弹窗（z-index 10）
    isolation: isolate;
    z-index: 0;
  }
  .board {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .tile {
    position: absolute;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-tile);
    background: var(--card-bg-color);
    border: 1px solid var(--tile-border-color);
    box-shadow: var(--shadow-soft);
    font-size: var(--tile-fs);
    line-height: 1;
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    animation: tile-in 0.22s ease backwards;
    // 亮色 ⇄ 被遮挡之间的明暗变化走渐变（被遮挡时缓缓变暗，重新可点时缓缓变亮）
    transition: filter 0.32s ease, opacity 0.32s ease, box-shadow 0.32s ease;
    &:not(.covered):active {
      transform: scale(0.93);
    }
    // 被上层卡片遮挡：变暗且不可点击
    &.covered {
      filter: brightness(0.5) saturate(0.45);
      box-shadow: none;
      cursor: default;
      pointer-events: none;
    }
    // 压在上面的卡片越多越透明，堆叠的层次感靠这一步拉开
    // （层数分布：第 50 关约 14% 不被压、22% 压 1 层、17% 压 2 层、14% 压 3 层、33% 压 4 层以上）
    &.depth-1 { opacity: 0.82; }
    &.depth-2 { opacity: 0.66; }
    &.depth-3 { opacity: 0.52; }
    &.depth-4 { opacity: 0.4; }
  }
  .tray {
    position: relative;
    margin: 16px 0 20px;
    padding: 8px;
    height: calc(var(--slot) + 16px);
    .slots {
      display: flex;
      gap: var(--slot-gap);
    }
    .slot {
      width: var(--slot);
      height: var(--slot);
      box-sizing: border-box;
      border-radius: var(--radius-tile);
      background: var(--cell-bg);
      box-shadow: inset 0 0 0 1px var(--border-color);
    }
    .tray-card {
      position: absolute;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-tile);
      background: var(--card-bg-color);
      border: 1px solid var(--tile-border-color);
      box-shadow: var(--card-shadow);
      font-size: var(--tray-fs);
      line-height: 1;
      z-index: 2;
      transition: left 0.22s ease;
      animation: card-pop 0.2s ease backwards;
      // 凑满三张：闪烁两下后旋转缩小消失（时长与 CLEAR_MS 一致）
      &.clearing {
        z-index: 3;
        border-color: var(--primary-bg);
        box-shadow: 0 0 0 2px var(--primary-bg), var(--card-shadow);
        animation: card-clear 0.56s ease-in-out forwards;
      }
    }
  }
  .result {
    position: absolute;
    inset: 0;
    // 必须高于棋盘卡片（层数 1~6）
    z-index: 30;
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
    .level-note {
      color: var(--text-color);
      font-size: 14px;
      font-weight: 600;
      opacity: 0.75;
    }
  }
  .win-pop-enter-active {
    transition: opacity 0.28s ease;
    > * {
      animation: card-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
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
