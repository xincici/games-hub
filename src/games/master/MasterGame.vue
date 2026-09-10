<template>
  <div class="wrapper" :style="layout.vars">
    <TopHeader @onScoreReset="onScoreReset" />
    <div class="card score-area">
      <div class="stat">
        <span class="stat-label">{{ i18n('bestScore') }}</span>
        <span class="stat-value">{{ bestTime ? fmt(bestTime) : '--:--' }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('remain') }}</span>
        <span class="stat-value">{{ tiles.length }}</span>
      </div>
    </div>
    <div class="card opt-area">
      <div class="opt-half">
        <button class="game-icon tool" :disabled="!canShuffle" :title="shuffleUsed ? i18n('shuffleUsed') : ''" @click="shuffleBoard">
          <i i-mdi-shuffle-variant />{{ i18n('shuffle') }}
        </button>
      </div>
      <div class="divider"></div>
      <div class="opt-half">
        <CountTimer ref="timerRef" :enable="phase === PLAY" :on-tick="saveState" />
      </div>
      <div class="divider"></div>
      <div class="start-wrapper">
        <button class="game-icon" @click="initGame">{{ i18n('start') }}</button>
      </div>
    </div>
    <div class="board-wrap">
      <div class="board" :class="{ shuffling }">
        <div
          v-for="tile in tiles"
          :key="`${gameId}-${tile.id}`"
          class="tile"
          :class="{ covered: !freeSet.has(tile.id) }"
          :style="tileStyle(tile)"
          @click="pick(tile, $event)"
        >{{ tile.emoji }}</div>
      </div>
      <Transition name="win-pop">
        <div v-if="phase === WON || phase === OVER" class="result" :class="phase === WON ? 'win' : 'lose'">
          <span v-if="phase === WON">🎉🎉 {{ i18n('tipWin') }} 🎉🎉</span>
          <span v-else>👻👻 {{ i18n('tipLost') }} 👻👻</span>
          <button @click="initGame" class="game-icon again">{{ i18n('playAgain') }}</button>
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
      <div v-if="flying" ref="flyRef" class="fly-card" :style="flyStyle">{{ flying.emoji }}</div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';

import TopHeader from '@/components/TopHeader.vue';
import CountTimer from '@/shared/CountTimer.vue';
import confetti from '@/shared/confetti';
import { i18n } from '@/shared/i18n';
import { EMOJIS } from '@/shared/emojis';
import { TRAY_SIZE, generateTiles, freeIds, insertIndex, shuffleEmojis } from './board';

const [PLAY, WON, OVER] = ['play', 'won', 'over'];
const KEY_PREFIX = '__emoji_master__';
// 单关卡游戏：最佳用时按「前缀 + 难度数字」约定存放，兼容标题连点 5 次清记录
const BEST_KEY = `${KEY_PREFIX}1`;
const STATE_KEY = `${KEY_PREFIX}state`;
const FLY_MS = 260;      // 卡片从原位飞入暂存区
const CLEAR_MS = 560;    // 三消卡片：先闪烁再消失
const WIN_DELAY = 620;   // 最后一组三消闪烁完再弹结算层

const tiles = ref([]);
const tray = ref([]);
const phase = ref(PLAY);
// 只有「飞行中」会挡住新的点击；消除中的卡片不挡，保证连点手感
const flightBusy = ref(false);
const shuffling = ref(false);
const shuffleUsed = ref(false); // 洗牌每局限用一次
const flying = ref(null);
const flyRef = ref(null);
const timerRef = ref(null);
const bestTime = ref(0);
const gameId = ref(0);
let winTimer = null;
let shakeTimer = null;

// 当前可点击（亮色）的卡片
const freeSet = computed(() => freeIds(tiles.value));
// 正在闪烁消失的卡片：不占「有效槽位」，也不影响胜负判定
const clearingTray = computed(() => tray.value.some(c => c.clearing));
const activeTray = computed(() => tray.value.filter(c => !c.clearing).length);
const canShuffle = computed(() =>
  phase.value === PLAY && !flightBusy.value && !clearingTray.value && !shuffleUsed.value && tiles.value.length > 1);

// 盘面 7×7 格（坐标半格制），卡片与收集槽尺寸都按视口收缩
const layout = computed(() => {
  const avail = Math.min(window.innerWidth || 420, 440) - 32;
  const unit = +(avail / 14).toFixed(2);
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
      '--board-h': `${(unit * 14).toFixed(2)}px`,
    },
  };
});

// 飞行卡片只负责定位/尺寸，位移与缩放交给 Web Animations API（更可靠，不会被样式批处理吞掉）
const flyStyle = computed(() => {
  const f = flying.value;
  if (!f) return null;
  return {
    left: `${f.left}px`,
    top: `${f.top}px`,
    width: `${f.w}px`,
    height: `${f.h}px`,
    fontSize: `${Math.round(f.h * 0.5)}px`,
  };
});

onMounted(() => {
  if (!restore()) initGame();
});

onUnmounted(() => {
  clearTimeout(winTimer);
  clearTimeout(shakeTimer);
});

// 任何盘面/收集槽变化都实时落盘，退出回主页后可恢复（计时器每秒也会落盘）
watch([tiles, tray, shuffleUsed], saveState, { deep: true });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function fmt(sec) {
  return ('00' + ~~(sec / 60)).slice(-2) + ':' + ('00' + sec % 60).slice(-2);
}

function tileStyle(tile) {
  const { unit, tile: size } = layout.value;
  return {
    left: `${(tile.x * unit + 1).toFixed(2)}px`,
    top: `${(tile.y * unit + 1).toFixed(2)}px`,
    width: `${(size - 2).toFixed(2)}px`,
    height: `${(size - 2).toFixed(2)}px`,
    zIndex: tile.layer + 1,
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

// ---------- 新游戏 / 道具 ----------

function initGame() {
  clearTimeout(winTimer);
  clearTimeout(shakeTimer);
  const list = generateTiles(EMOJIS);
  tiles.value = list;
  tray.value = [];
  phase.value = PLAY;
  flightBusy.value = false;
  shuffling.value = false;
  shuffleUsed.value = false;
  flying.value = null;
  bestTime.value = +(localStorage.getItem(BEST_KEY) || 0);
  gameId.value++;
  timerRef.value?.reset();
  saveState();
}

function onScoreReset() {
  bestTime.value = 0;
}

function shuffleBoard() {
  if (!canShuffle.value) return;
  if (!shuffleEmojis(tiles.value)) return;
  shuffleUsed.value = true;
  shuffling.value = true;
  clearTimeout(shakeTimer);
  shakeTimer = setTimeout(() => { shuffling.value = false; }, 420);
  saveState();
}

// ---------- 点击卡片 ----------

async function pick(tile, event) {
  if (phase.value !== PLAY || flightBusy.value) return;
  if (tray.value.length >= TRAY_SIZE || !freeSet.value.has(tile.id)) return;
  flightBusy.value = true;

  const from = event.currentTarget.getBoundingClientRect();
  // 目标格：先按当前分组算出落点，落格时再按最新槽位重新计算插入位置
  const idx0 = insertIndex(tray.value, tile.emoji);
  const slotEl = document.querySelectorAll('.tray .slot')[idx0];
  const at = tiles.value.findIndex(t => t.id === tile.id);
  const snap = { ...tiles.value[at] };
  // 立即从盘面移除：遮挡关系随之更新，其它卡片会被点亮（渐亮动画）
  tiles.value.splice(at, 1);

  const to = slotEl ? slotEl.getBoundingClientRect() : from;
  flying.value = {
    emoji: snap.emoji,
    left: from.left,
    top: from.top,
    w: from.width,
    h: from.height,
  };
  await nextTick();

  // 从卡片原位飞向暂存区槽位（边飞边缩到槽位大小）
  const el = flyRef.value;
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

  flying.value = null;
  tray.value.splice(insertIndex(tray.value, snap.emoji), 0, { uid: snap.id, emoji: snap.emoji, clearing: false });
  flightBusy.value = false;
  saveState();
  settle();
}

// 结算：三消自动消除；槽满且无消除则失败；盘面与收集槽都空则获胜
async function settle() {
  const counts = new Map();
  tray.value.forEach(c => counts.set(c.emoji, (counts.get(c.emoji) || 0) + 1));
  const hit = [...counts.entries()].find(([, n]) => n >= 3);
  if (hit) {
    const emoji = hit[0];
    const picked = tray.value.filter(c => c.emoji === emoji).slice(0, 3);
    picked.forEach(c => { c.clearing = true; });
    await sleep(CLEAR_MS);
    const uids = new Set(picked.map(c => c.uid));
    tray.value = tray.value.filter(c => !uids.has(c.uid));
  } else if (activeTray.value >= TRAY_SIZE) {
    lose();
    return;
  }
  if (!tiles.value.length && !activeTray.value) win();
}

function win() {
  if (phase.value !== PLAY) return;
  const elapsed = timerRef.value?.seconds() || 0;
  timerRef.value?.stop();
  // 记录最快通关用时（0 秒视作无效，避免异常值）
  if (elapsed > 0 && (!bestTime.value || elapsed < bestTime.value)) {
    localStorage.setItem(BEST_KEY, elapsed);
    bestTime.value = elapsed;
  }
  removeState();
  confetti();
  // 等最后一组三消闪烁消失后再弹结算层
  winTimer = setTimeout(() => { phase.value = WON; }, WIN_DELAY);
}

function lose() {
  if (phase.value !== PLAY) return;
  timerRef.value?.stop();
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
      // 卡片：[id, emoji, 层, x, y]
      tiles: tiles.value.map(t => [t.id, t.emoji, t.layer, t.x, t.y]),
      tray: tray.value.map(c => [c.uid, c.emoji]),
      shuffled: shuffleUsed.value ? 1 : 0,
      time: timerRef.value?.seconds() || 0,
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
    shuffleUsed.value = Boolean(saved.shuffled);
    phase.value = PLAY;
    flightBusy.value = false;
    flying.value = null;
    bestTime.value = +(localStorage.getItem(BEST_KEY) || 0);
    gameId.value++;
    // 恢复退出前的计时秒数并继续计时
    timerRef.value?.restore(Math.max(0, +saved.time || 0));
    return true;
  } catch {
    return false;
  }
}
</script>

<style scoped lang="scss">
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

@keyframes shake {
  0%, 100% {
    transform: translateX(0) rotate(0);
  }
  25% {
    transform: translateX(-3px) rotate(-4deg);
  }
  75% {
    transform: translateX(3px) rotate(4deg);
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
  border-radius: 9px;
  background: var(--card-bg-color);
  border: 1px solid var(--tile-border-color);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.26);
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
    margin-top: 70px;
    display: flex;
    align-items: center;
    height: 72px;
    .stat {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      .stat-label {
        font-size: 12px;
        opacity: 0.6;
      }
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
    margin: 16px 0;
    height: 72px;
    .opt-half {
      flex: 2.8;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .start-wrapper {
      flex: 4.4;
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
    border-radius: 8px;
    &.again {
      margin-top: 6px;
    }
    // 道具按钮：描边样式，禁用时变淡
    &.tool {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 8px 12px;
      background: var(--card-bg-color);
      color: var(--text-color);
      border: 1px solid var(--border-color);
      i {
        font-size: 17px;
      }
      &:active:not(:disabled) {
        background: var(--key-active-bg);
      }
      &:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
    }
  }
  .board-wrap {
    position: relative;
    width: calc(100% - 32px);
    max-width: 440px;
    height: var(--board-h);
    box-sizing: border-box;
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
    border-radius: 9px;
    background: var(--card-bg-color);
    border: 1px solid var(--tile-border-color);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
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
      opacity: 0.75;
      box-shadow: none;
      cursor: default;
      pointer-events: none;
    }
  }
  .board.shuffling .tile {
    animation: shake 0.4s ease;
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
      border-radius: 9px;
      background: var(--cell-bg);
      box-shadow: inset 0 0 0 1px var(--border-color);
    }
    .tray-card {
      position: absolute;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 9px;
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
    &.lose {
      color: var(--lose-color);
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
