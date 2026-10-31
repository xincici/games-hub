<template>
  <!-- 扑克牌背面：所有扑克牌游戏共用这一份。
       图案 = 浅色点阵 + 中央 cards-playing 图标，与德州扑克原来的牌背一致。 -->
  <view class="pback">
    <view class="pback-fill" />
    <view class="pback-ico i-mdi-cards-playing" :style="{ fontSize: iconSize + 'rpx' }" />
  </view>
</template>

<script setup>
defineProps({
  // 图标字号（rpx）；大牌 80、迷你牌 50，由调用方按牌尺寸传
  iconSize: { type: Number, default: 50 },
});
</script>

<style lang="scss" scoped>
.pback {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  border-radius: 8rpx;
  color: #111;
  pointer-events: none;
}
.pback-fill {
  position: absolute;
  left: 2%;
  top: 2%;
  width: 96%;
  height: 96%;
  box-sizing: border-box;
  border: 2rpx dotted #eee;
  border-radius: 8rpx;
  /* 与德州扑克原来的牌背一致；用百分比铺点，小牌 / 大牌密度相同 */
  background: radial-gradient(circle, rgba(154, 154, 154, 0.55) 0.4rpx, transparent 0.9rpx) repeat;
  background-size: 5% 5%;
}
.pback-ico {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  color: currentColor;
}
</style>

<style>
/* 自定义组件的宿主节点要撑满牌面，否则绝对定位的 .pback 找不到正确的包含块 */
:host {
  display: block;
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
