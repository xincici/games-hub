<template>
  <!-- 连击 / 多消的小型烟花（web 的 burstConfetti / canvas-confetti）。
       小程序没有 canvas-confetti：这里用「一层固定定位的粒子层 + CSS 三段关键帧」复刻 ——
       粒子从喷发点向上炸开（spread 76°）、到顶点后按重力下落、最后淡出；
       配色 / 粒子数 / 喷发点全部来自 core/firework.js（照 web 的参数算）。 -->
  <view v-if="bursts.length" class="firework-layer">
    <view
      v-for="b in bursts"
      :key="'fw-' + b.id"
      class="firework"
      :style="{ left: b.x * 100 + '%', top: b.y * 100 + '%' }"
    >
      <view
        v-for="p in b.parts"
        :key="'fw-' + b.id + '-' + p.id"
        class="firework-dot"
        :class="'shape-' + p.shape"
        :style="{
          background: p.color,
          width: p.w + 'rpx',
          height: p.h + 'rpx',
          marginLeft: -p.w / 2 + 'rpx',
          marginTop: -p.h / 2 + 'rpx',
          animationDelay: p.delay + 'ms',
          animationDuration: p.duration + 'ms',
          '--dx': p.dx + 'rpx',
          '--dy': p.dy + 'rpx',
          '--drop': p.drop + 'rpx',
          '--rot': p.rot + 'deg',
          '--spin': p.spin + 'deg',
        }"
      />
    </view>
  </view>
</template>

<script setup>
import { onUnmounted, ref } from 'vue';

import { makeBurstParticles, registerFireworkSink } from '@/core/firework';

// 同时最多保留几束（连击很快、每束活 ~2.3s；给到 6 束够用，再多就吃掉内存）
const MAX_BURSTS = 6;

const bursts = ref([]);
let seq = 0;
const timers = new Set();

const unregister = registerFireworkSink(({ count, x, y }) => {
  const id = ++seq;
  const parts = makeBurstParticles(count);
  const life = Math.max(...parts.map(p => p.delay + p.duration)) + 120;
  bursts.value = [...bursts.value, { id, x, y, parts }].slice(-MAX_BURSTS);
  // 动画跑完就把这束摘掉（不摘的话 DOM 会越积越多、也永远不会重播同名的动画）
  const timer = setTimeout(() => {
    timers.delete(timer);
    bursts.value = bursts.value.filter(b => b.id !== id);
  }, life);
  timers.add(timer);
});

onUnmounted(() => {
  unregister();
  timers.forEach(clearTimeout);
  timers.clear();
  bursts.value = [];
});
</script>

<style scoped lang="scss">
.firework-layer {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 45;              /* 在棋盘 / 结算层（30~40）之上、帮助弹窗（55）之下 */
  pointer-events: none;
  overflow: hidden;
}

/* 喷发点：left/top 是视口比例（web 的 origin.x / origin.y） */
.firework {
  position: absolute;
  width: 0;
  height: 0;
}

/* 碎纸片：不是圆点。方块 / 宽条 / 竖条 / 细丝各自带一点圆角，
   叠加逐片随机的初始角度与自转（--rot / --spin），炸开时是「一堆翻着飞的纸屑」 */
.firework-dot {
  position: absolute;
  left: 0;
  top: 0;
  opacity: 0;
  will-change: transform, opacity;
  box-shadow: 0 1rpx 2rpx rgba(0, 0, 0, 0.08);
  animation-name: firework-fly;
  animation-timing-function: cubic-bezier(0.22, 0.68, 0.32, 1);
  animation-fill-mode: both;
}
.firework-dot.shape-square { border-radius: 2rpx; }
.firework-dot.shape-wide { border-radius: 4rpx; }
.firework-dot.shape-tall { border-radius: 2rpx; }
.firework-dot.shape-ribbon { border-radius: 6rpx; }

/* 三段：向上炸开（减速）→ 顶点 → 重力下落（加速），落点再往两侧飘一点、缩到 0 并淡出 */
@keyframes firework-fly {
  0% {
    opacity: 0;
    transform: translate(0, 0) rotate(var(--rot)) scale(0.7);
    animation-timing-function: cubic-bezier(0.16, 0.72, 0.3, 1);   /* 上升：减速 */
  }
  8% { opacity: 1; }
  55% {
    opacity: 1;
    transform: translate(calc(var(--dx) * 0.92), var(--dy)) rotate(calc(var(--rot) + var(--spin) * 0.55)) scale(1);
    animation-timing-function: cubic-bezier(0.42, 0, 0.88, 0.56);  /* 下落：加速（≈ 重力 0.9） */
  }
  88% { opacity: 0.7; }
  100% {
    opacity: 0;
    transform: translate(calc(var(--dx) * 1.05), calc(var(--dy) + var(--drop))) rotate(calc(var(--rot) + var(--spin))) scale(0.4);
  }
}
</style>
