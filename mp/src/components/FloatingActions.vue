<template>
  <!-- 游戏区右下角的悬浮按钮组：竖直排列，插槽里的顺序就是从上到下 -->
  <view class="float-actions">
    <slot />
  </view>
</template>

<script setup>
// 圆形悬浮按钮容器（无文字，只放图标）。右侧 + 底部都让开安全区。
</script>

<style lang="scss" scoped>
.float-actions {
  position: fixed;
  right: calc(24rpx + env(safe-area-inset-right));
  bottom: calc(16rpx + env(safe-area-inset-bottom));   /* 比原来再低一点（用户要求「稍微往下」） */
  z-index: 30;
  display: flex;
  flex-direction: row;      /* 横向排列：模式在左、帮助在最右（插槽顺序 = 左→右） */
  align-items: center;
  gap: 16rpx;
}
/* .fab 的样式在 App.vue（全局），因为插槽节点不带本组件的 scoped 标记 */
</style>
