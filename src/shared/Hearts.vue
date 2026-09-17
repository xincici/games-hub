<template>
  <span class="hearts" :style="{ '--pop-ms': `${ms}ms` }">
    <template v-for="h in max" :key="h">
      <!-- 正在播放大淡出的那颗仍旧画 ❤️：动画结束（popping 归零）才换回 🤍 -->
      <span
        class="heart"
        :class="{ full: h <= left || h === popping, dead: h > left && h !== popping, popping: h === popping }"
      >{{ h <= left || h === popping ? '❤️' : '🤍' }}</span>
    </template>
  </span>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue';

// 剩余生命：一行 ❤️（失去的变 🤍）。掉一颗时，刚失去的那颗先「放大淡出」，
// 动画播完才变成白色的 🤍 —— 谁家掉心都直接改 left，动画这里自己管
const props = defineProps({
  left: { type: Number, default: 0 },    // 还剩几颗
  max: { type: Number, default: 3 },     // 一共几颗
  ms: { type: Number, default: 450 },    // 放大淡出的时长（与 CSS 变量同步）
});

const popping = ref(0);
let timer = null;

watch(() => props.left, (now, was) => {
  clearTimeout(timer);
  popping.value = 0;
  if (!(now < was) || was < 1) return;   // 只有掉心才播
  popping.value = was;                   // 刚失去的是原来第 was 颗
  timer = setTimeout(() => { popping.value = 0; }, props.ms);
});

onUnmounted(() => clearTimeout(timer));
</script>

<style scoped lang="scss">
// 放大淡出：1 → 1.55 → 2.1 倍并淡到透明，之后露出来的就是白色的 🤍
@keyframes heart-pop {
  0% { transform: scale(1); opacity: 1; }
  40% { transform: scale(1.55); opacity: 1; }
  100% { transform: scale(2.1); opacity: 0; }
}

.hearts {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 20px;
  line-height: 1;
  .heart {
    display: inline-block;
    font-size: 19px;
    &.dead {
      opacity: 0.3;
    }
    &.popping {
      animation: heart-pop var(--pop-ms, 450ms) ease forwards;
    }
  }
}
</style>
