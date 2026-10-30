<template>
  <!-- 胜利彩带（web 用 canvas-confetti；小程序没有 DOM 画布，这里是纯 CSS 复刻）：
       照 web 的 celebrate() —— **左右两侧中点各一个礼炮**（angle 60 / 120），
       先往屏幕中上方喷（斜向内上），到顶点后再散落下坠，最后淡出。
       不是从顶部往下飘（那是旧实现，用户明确要求改掉）。 -->
  <view class="confetti-layer">
    <view
      v-for="p in pieces"
      :key="p.id"
      class="confetti-piece"
      :class="p.side"
      :style="{
        animationDelay: Math.round(p.delay) + 'ms',
        animationDuration: Math.round(p.dur) + 'ms',
        '--ix': p.ix + 'vw',
        '--iy': p.iy + 'vh',
        '--apex': p.apex,
      }"
    >
      <!-- 外层只管「水平匀速」，内层只管「竖直：减速上升 → 自由落体加速下落」
           两个元素各管一个轴，才能做出真实的抛物线；一个元素只能动一次 transform -->
      <view class="confetti-fly" :style="{ animationDelay: Math.round(p.delay) + 'ms', animationDuration: Math.round(p.dur) + 'ms' }">
        <view
          class="confetti-shape"
          :class="p.shape"
          :style="{ background: p.color, width: p.w + 'rpx', height: p.h + 'rpx', animationDuration: Math.round(p.spin) + 'ms' }"
        />
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue';

// 与 web 一致的喜庆配色（主色绿 + 黄 + 橙红 + 蓝 + 粉）
const COLORS = ['#23804e', '#34a86a', '#ffc300', '#ffd95e', '#c2410c', '#e8590c', '#3b82f6', '#ec4899', '#f9fafb'];
const SHAPES = ['dot', 'ribbon', 'ribbon', 'wide'];
const PER_SIDE = 48;   // 每侧 48 片（共 96）

// 让每片都有独立的「射程 / 高度 / 顶点时机 / 旋转」，否则 96 片会挤成一坨
const rnd = (a, b) => a + Math.random() * (b - a);

const pieces = ref(
  Array.from({ length: PER_SIDE * 2 }, (_, i) => {
    const side = i % 2 === 0 ? 'left' : 'right';
    const shape = SHAPES[Math.floor(i / 2) % SHAPES.length];
    const base = shape === 'dot' ? 14 : shape === 'wide' ? 18 : 10;
    return {
      id: i,
      side,
      shape,
      color: COLORS[i % COLORS.length],
      w: base,
      h: shape === 'wide' ? base * 1.5 : shape === 'ribbon' ? base * 2.6 : base,
      // 射程 30~92vw：顶点横坐标 ≈ 0.75~0.95 倍射程 → 从「还没到中线」到「越过中线」都有，
      // 形成一片扇形而不是一条中线
      ix: rnd(30, 92),
      // 每片自己的「顶点时走了多少射程」，越小越靠外、越大越靠内 → 横向再散开一层
      apex: rnd(0.72, 0.98),
      iy: rnd(24, 58),                                   // 24~58vh：顶点高度也参差
      delay: rnd(0, 900) + (i % 6) * 90,                 // 错开成几波
      dur: rnd(1900, 2900),
      spin: rnd(700, 1700),
    };
  }),
);
</script>

<style scoped lang="scss">
.confetti-layer {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;          /* 压在结算层（z-index 30）之上，与 web 的 canvas 同层意图 */
  pointer-events: none;
  overflow: hidden;
}

/* 两门礼炮的炮口：屏幕左右边缘、垂直方向偏中（web 的 celebrate: origin x:0 / x:1） */
.confetti-piece {
  position: absolute;
  top: 52%;
  will-change: transform, opacity;
  animation-name: confetti-horizontal-left;
  animation-timing-function: cubic-bezier(0.12, 0.72, 0.3, 1);
  animation-fill-mode: both;
}
.confetti-piece.left { left: -2vw; }
.confetti-piece.right {
  right: -2vw;
  animation-name: confetti-horizontal-right;   /* 右炮水平方向镜像 */
}

.confetti-fly {
  will-change: transform;
  animation-name: confetti-vertical;
  animation-fill-mode: both;
}

/* 水平：整段匀速往外飞（真实抛物线里水平方向本来就是匀速） */
@keyframes confetti-horizontal-left {
  0%   { opacity: 1; transform: translate3d(0, 0, 0); animation-timing-function: cubic-bezier(0.12, 0.72, 0.3, 1); }
  /* 顶点（42%）时已经走完 86% 的射程 → 落在中线附近；之后只慢慢前移 */
  42%  { opacity: 1; transform: translate3d(calc(var(--ix) * var(--apex)), 0, 0); animation-timing-function: cubic-bezier(0.3, 0.6, 0.7, 1); }
  100% { opacity: 0.9; transform: translate3d(var(--ix), 0, 0); }
}
@keyframes confetti-horizontal-right {
  0%   { opacity: 1; transform: translate3d(0, 0, 0); animation-timing-function: cubic-bezier(0.12, 0.72, 0.3, 1); }
  42%  { opacity: 1; transform: translate3d(calc(var(--ix) * -0.86), 0, 0); animation-timing-function: cubic-bezier(0.3, 0.6, 0.7, 1); }
  100% { opacity: 0.9; transform: translate3d(calc(var(--ix) * -1), 0, 0); }
}

/* 竖直：0 → 42% 减速上升（擦出顶点），42% → 100% 自由落体加速下落（重力）
   两段用不同的 timing-function —— 这就是「喷上去 → 自由落体」的关键 */
@keyframes confetti-vertical {
  0% {
    opacity: 0;
    transform: translate3d(0, 0, 0);
    animation-timing-function: cubic-bezier(0.18, 0.72, 0.32, 1);   /* 上升：减速 */
  }
  6% { opacity: 1; }
  42% {
    opacity: 1;
    transform: translate3d(0, calc(var(--iy) * -1), 0);            /* 顶点：屏幕中上方 */
    animation-timing-function: cubic-bezier(0.42, 0, 0.86, 0.62);  /* 下落：加速（≈ 自由落体） */
  }
  96% { opacity: 0.75; }
  100% {
    opacity: 0;
    transform: translate3d(0, 96vh, 0);                            /* 落到底部 */
  }
}

.confetti-shape {
  animation-name: confetti-spin;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  border-radius: 2rpx;
}
.confetti-shape.dot { border-radius: 50%; }
.confetti-shape.wide { border-radius: 4rpx; }

@keyframes confetti-spin {
  0%   { transform: rotate3d(1, 1, 0, 0deg); }
  100% { transform: rotate3d(1, 1, 0, 360deg); }
}
</style>
