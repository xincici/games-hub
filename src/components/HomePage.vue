<template>
  <div class="wrapper">
    <TopHeader :show-help="false" />
    <div class="game-list">
      <div class="honeycomb" :class="{ entering }">
        <div v-for="row in rows" :key="row[0].id" class="hex-row">
          <router-link
            v-for="game in row"
            :key="game.id"
            :to="game.path"
            class="hex"
            :style="entering ? enterStyle(game.id) : null"
            @click="setLaunchOrigin($event.currentTarget)"
          >
            <span class="hex-body">
              <i :class="game.icon" :style="game.iconScale ? { transform: `scale(${game.iconScale})` } : null" />
              <span class="game-name">{{ dictOf(game.id)[language].gameTitle }}</span>
            </span>
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue';

import TopHeader from './TopHeader.vue';
import { games } from '@/shared/games';
import { language, dictOf } from '@/shared/i18n';
import { setLaunchOrigin } from '@/shared/launch';

// 蜂窝布局：按行分组，2/3/2/3 交替让每行都咬合
const ROW_SIZES = [2, 3, 2, 3, 2];
const rows = computed(() => {
  const out = [];
  let i = 0;
  for (const size of ROW_SIZES) {
    out.push(games.slice(i, i + size));
    i += size;
  }
  if (i < games.length) out.push(games.slice(i));
  return out.filter(r => r.length);
});

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
  document.addEventListener('visibilitychange', onVisibility);
});

onUnmounted(() => {
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
  background: var(--tile-border-color);
  transition: background-color 0.15s ease;
  -webkit-tap-highlight-color: transparent;
  &:active {
    background: var(--primary-bg);
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
      font-size: 34px;
      color: var(--primary-bg);
    }
    .game-name {
      font-size: 13.5px;
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
