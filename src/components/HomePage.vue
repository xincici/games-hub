<template>
  <div class="wrapper">
    <TopHeader :show-help="false" />
    <div class="game-list">
      <div class="honeycomb" :class="{ entering }">
        <div v-for="row in rows" :key="row.list[0].id" class="hex-row" :class="{ offset: row.offset }">
          <router-link
            v-for="card in row.list"
            :key="card.id"
            :to="card.path"
            class="hex"
            :class="{ dragging: dragId === card.id }"
            :data-id="card.id"
            draggable="false"
            :style="hexStyle(card)"
            @dragstart.prevent
            @pointerdown="onPointerDown(card, $event)"
            @click="onCardClick($event, card)"
          >
            <span class="hex-body">
              <i :class="card.icon" :style="card.iconScale ? { transform: `scale(${card.iconScale})` } : null" />
              <span class="game-name">{{ card.name }}</span>
            </span>
          </router-link>
        </div>
      </div>
    </div>
    <!-- 拖动时跟随指针的浮层：用 fixed 定位，避免任何布局换算带来的跳动 -->
    <Teleport to="body">
      <div
        v-if="ghost"
        class="hex ghost"
        :style="{ left: `${ghost.left}px`, top: `${ghost.top}px`, width: `${ghost.w}px`, height: `${ghost.h}px`, ...(ghost.card.accent ? { '--accent': `var(--accent-${ghost.card.accent})` } : null) }"
      >
        <span class="hex-body">
          <i :class="ghost.card.icon" :style="ghost.card.iconScale ? { transform: `scale(${ghost.card.iconScale})` } : null" />
          <span class="game-name">{{ ghost.card.name }}</span>
        </span>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue';

import TopHeader from './TopHeader.vue';
import { games } from '@/shared/games';
import { i18n, language, dictOf } from '@/shared/i18n';
import { setLaunchOrigin } from '@/shared/launch';

// 首页排序：用户拖动后按 id 顺序存本地；存档里没有的游戏（后续新增）
// 按注册顺序接在已排序结果之后
const ORDER_KEY = '__games_hub__home_order';

function readOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem(ORDER_KEY));
    return Array.isArray(saved) ? saved.filter(id => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

// 存档顺序（去重、丢弃已下线的游戏）+ 新游戏按注册顺序追加
function mergeOrder() {
  const ids = games.map(game => game.id);
  const ordered = [];
  readOrder().forEach(id => {
    if (ids.includes(id) && !ordered.includes(id)) ordered.push(id);
  });
  ids.forEach(id => {
    if (!ordered.includes(id)) ordered.push(id);
  });
  return ordered;
}

const order = ref(mergeOrder());

function saveOrder() {
  try { localStorage.setItem(ORDER_KEY, JSON.stringify(order.value)); } catch { /* 忽略 */ }
}

// 首页卡片：按排序结果排列的各游戏
const cards = computed(() => order.value.map(id => {
  const game = games.find(g => g.id === id);
  return {
    id: game.id,
    path: game.path,
    icon: game.icon,
    iconScale: game.iconScale,
    accent: game.accent || 'logic',
    name: dictOf(game.id)[language.value].gameTitle,
  };
}));

// 蜂窝布局：按行分组，2/3/2/3/2/3 交替让每行都咬合。
// 兜底：若某行与上一行同奇偶（同为奇数/偶数个），六个尖角会上下对顶，
// 此时给该行加半格横向错位，保持蜂窝咬合
const ROW_SIZES = [2, 3, 2, 3, 2, 3];
const rows = computed(() => {
  const list = cards.value;
  const groups = [];
  let i = 0;
  for (const size of ROW_SIZES) {
    groups.push(list.slice(i, i + size));
    i += size;
  }
  if (i < list.length) groups.push(list.slice(i));
  return groups
    .filter(group => group.length)
    .map((group, idx, arr) => ({
      list: group,
      offset: idx > 0 && group.length % 2 === arr[idx - 1].length % 2,
    }));
});

// ---------- 拖动排序 ----------
// 交互约定：鼠标/触控笔拖动超过 8px 即进入拖拽；触摸端需长按 260ms（避免和页面滚动冲突）。
// 拖到另一张卡片上就与它交换位置，松开即把顺序写入本地存储。
const dragId = ref('');
const ghost = ref(null);   // 跟随指针的卡片浮层 { card, w, h, left, top }
let press = null;          // 按下但还没判定成拖拽
let dragGrab = null;       // { grabX, grabY } 按下点相对卡片左上角的偏移
let pressTimer = null;
let suppressClick = false;

function cardEl(id) {
  return document.querySelector(`.hex[data-id="${id}"]`);
}

function onPointerDown(card, e) {
  if (e.button > 0) return;
  suppressClick = false;
  press = { id: card.id, card, x: e.clientX, y: e.clientY, type: e.pointerType };
  clearTimeout(pressTimer);
  if (e.pointerType === 'touch') pressTimer = setTimeout(startDrag, 260);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
}

function startDrag() {
  if (!press || dragId.value) return;
  const el = cardEl(press.id);
  if (!el) return;
  const rect = el.getBoundingClientRect();
  // 记住按下点相对卡片左上角的偏移：浮层从卡片当前位置起步、并始终跟住手指/鼠标
  dragGrab = { grabX: press.x - rect.left, grabY: press.y - rect.top };
  ghost.value = { card: press.card, w: rect.width, h: rect.height, left: rect.left, top: rect.top };
  dragId.value = press.id;
  suppressClick = true;               // 拖拽结束后不要触发跳转
  document.body.classList.add('card-dragging');
}

function onPointerMove(e) {
  if (!press) return;
  if (!dragId.value) {
    const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    if (moved < 8) return;
    // 触摸端一旦先移动就当作滚动，取消长按
    if (press.type === 'touch') { endPress(); return; }
    startDrag();
  }
  if (!dragId.value || !ghost.value) return;
  // 浮层用 fixed 坐标直接跟随指针（保持按下时的相对偏移），不受重排影响
  ghost.value.left = e.clientX - dragGrab.grabX;
  ghost.value.top = e.clientY - dragGrab.grabY;
  // 拖到别的卡片上：交换两者位置
  const overEl = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.hex');
  const overId = overEl?.dataset?.id;
  if (overId && overId !== dragId.value) swapCards(dragId.value, overId);
}

function swapCards(a, b) {
  const arr = order.value.slice();
  const ia = arr.indexOf(a);
  const ib = arr.indexOf(b);
  if (ia < 0 || ib < 0) return;
  [arr[ia], arr[ib]] = [arr[ib], arr[ia]];
  order.value = arr;
}

function onPointerUp() {
  if (dragId.value) {
    ghost.value = null;
    dragId.value = '';
    saveOrder();
  }
  endPress();
}

function endPress() {
  clearTimeout(pressTimer);
  press = null;
  dragGrab = null;
  document.body.classList.remove('card-dragging');
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerUp);
}

// 拖拽时禁止页面滚动/选中（触摸端）
function onTouchMove(e) {
  if (dragId.value) e.preventDefault();
}

function onCardClick(e, card) {
  if (suppressClick) {          // 刚拖拽过：吞掉这次 click，避免误跳转
    suppressClick = false;
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  setLaunchOrigin(e.currentTarget);
}

// 入场动画：每个六边形以各自的延迟/幅度跳动后稳定。
// 延迟由 id 哈希派生（同一局内确定、不同格子互不相同），
// 整体延迟 350ms 起跳（等页面级过渡先完成），~1.5s 内先后稳定
const entering = ref(true);
let enterTimer = null;
const ENTER_BASE = 350;  // 整体起跳基础延迟（页面过渡 300ms 完成后）
const ENTER_SPREAD = 400; // 各格起跳延迟的最大散布（ms）

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function enterStyle(id) {
  const h = hash(id);
  const delay = ENTER_BASE + (h % ENTER_SPREAD);
  const duration = 520 + (h % 160); // 520~680ms，各格时长略不同
  return {
    animationDelay: `${delay}ms`,
    animationDuration: `${duration}ms`,
  };
}

// 卡片样式：分类强调色（CSS 变量，供图标与六边形描边取用）+ 入场动画延迟
function hexStyle(card) {
  const accent = card.accent ? { '--accent': `var(--accent-${card.accent})` } : null;
  return { ...accent, ...(entering.value ? enterStyle(card.id) : null) };
}

function playEnter() {
  clearTimeout(enterTimer);
  entering.value = false;
  // 强制样式重排后重新置起，否则 class 不变不会重启动画
  void document.querySelector('.honeycomb')?.offsetWidth;
  entering.value = true;
  // 总时长 = 基础延迟 + 最大散布 + 最长动画 + 余量
  enterTimer = setTimeout(() => {
    entering.value = false;
  }, ENTER_BASE + ENTER_SPREAD + 680 + 80);
}

onMounted(() => {
  playEnter();
  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('visibilitychange', onVisibility);
});

onUnmounted(() => {
  endPress();
  document.removeEventListener('touchmove', onTouchMove);
  clearTimeout(enterTimer);
  document.removeEventListener('visibilitychange', onVisibility);
});

// 页面失焦后重新可见时重播动画
function onVisibility() {
  if (!document.hidden) playEnter();
}
</script>

<style scoped lang="scss">
// 正六边形（尖顶朝上）：宽 = --hex-w，高 = 宽 × 1.1547，
// 相邻水平重叠 1/4 宽（边贴合），行间垂直重叠 1/4 高形成蜂窝咬合。
// --hex-w 用 CSS 变量驱动，窄屏媒体查询可整体缩放
.wrapper {
  --hex-w: 126px;
  --hex-h: calc(var(--hex-w) * 1.1547);
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  box-sizing: border-box;
  background: var(--bg-color);
  color: var(--text-color);
}
.game-list {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 84px 16px 24px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: calc(100vh - 94px);
  min-height: calc(100dvh - 94px);
}
.honeycomb {
  display: flex;
  flex-direction: column;
  align-items: center;
}

// 入场动画在 .hex.entering 上逐格播放：轻微缩放弹性跳动后稳定。
// 延迟与时长由 JS 按 id 哈希注入（animationDelay / animationDuration）
@keyframes hex-pop {
  0% {
    transform: scale(0.82);
    opacity: 0;
  }
  55% {
    transform: scale(1.09);
    opacity: 1;
  }
  78% {
    transform: scale(0.97);
  }
  100% {
    transform: scale(1);
  }
}
.hex-row {
  display: flex;
  // 六边形之间水平留 3px 缝隙，避免相邻块描边叠成粗线
  gap: 3px;
  // 行间垂直重叠：贴合时（-h/4）斜边法向间隙为 0，
  // 追加 +2.65px（数值求解：dy 从 0.75h 增加 2.65 时斜边法向间隙 = 3px，与水平缝隙一致）
  &:not(:first-child) {
    margin-top: calc(var(--hex-h) / -4 + 2.65px);
  }
  // 与上一行同奇偶的收尾行：横移半格（一格宽 + 缝隙）形成错位咬合
  &.offset {
    transform: translateX(calc((var(--hex-w) + 3px) / 2));
  }
}
// 拖动时跟随指针的浮层（Teleport 到 body）：fixed 定位、不吃事件、不参与入场动画
.hex.ghost {
  position: fixed;
  z-index: 60;
  pointer-events: none;
  animation: none !important;
  cursor: grabbing;
  filter: drop-shadow(0 12px 20px rgba(0, 0, 0, 0.32));
  .hex-body {
    background: var(--enter-bg);
  }
}
// 双层六边形实现描边：外层渲染边框色，内层缩进 --hex-border 渲染底色
.hex {
  position: relative;
  width: var(--hex-w);
  height: var(--hex-h);
  text-decoration: none;
  color: var(--text-color);
  display: block;
  // 入场逐格跳动动画（entering 时由 JS 加 style 注入延迟/时长）
  .honeycomb.entering & {
    animation-name: hex-pop;
    animation-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
    animation-fill-mode: backwards;
  }
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
  // 六边形描边取分类强调色的一点点（18% 与边框色混合），只有很淡的一层色相
  background: color-mix(in srgb, var(--accent, var(--tile-border-color)) 18%, var(--tile-border-color));
  transition: background-color 0.15s ease;
  -webkit-tap-highlight-color: transparent;
  // 触摸端允许页面纵向滚动；横向手势留给拖动排序
  touch-action: pan-y;
  // 正在被拖动的卡片：原位压暗（跟随指针的是下面 .hex.ghost 浮层）
  &.dragging {
    animation: none !important;
    pointer-events: none;
    opacity: 0.3;
    .hex-body {
      background: var(--enter-bg);
    }
  }
  &:active {
    background: var(--accent, var(--primary-bg));
    .hex-body {
      background: var(--enter-bg);
    }
  }
  .hex-body {
    position: absolute;
    // 与外层同形状，四周缩进 --hex-border 形成 2px 描边
    --hex-border: 2px;
    top: var(--hex-border);
    bottom: var(--hex-border);
    left: calc(var(--hex-border) * 1.155);
    right: calc(var(--hex-border) * 1.155);
    clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
    background: var(--card-bg-color);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    // 避开上下尖角
    padding: 14% 0 10%;
    box-sizing: border-box;
    transition: background-color 0.15s ease;
    i {
      font-size: 30px;
      color: var(--accent, var(--primary-bg));
    }
    .game-name {
      font-size: 12px;
      font-weight: bold;
      white-space: nowrap;
      max-width: 94%;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
}
// 窄屏：六边形整体缩小，保证 3 格行（3w）不超出可用宽（视口 − 32px 边距）
@media only screen and (max-width: 375px) {
  .wrapper {
    --hex-w: 92px;
  }
}
@media only screen and (min-width: 376px) and (max-width: 412px) {
  .wrapper {
    --hex-w: 106px;
  }
}
@media only screen and (min-width: 413px) and (max-width: 430px) {
  .wrapper {
    --hex-w: 116px;
  }
}
</style>
