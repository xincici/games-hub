<template>
  <router-view v-slot="{ Component, route }">
    <Transition :name="route.meta.game === 'home' ? 'app-close' : 'app-open'">
      <component :is="Component" :key="route.meta.game" />
    </Transition>
  </router-view>
  <div class="landscape-tip">
    <span>📱</span>
    <span>{{ i18n('rotateTip') }}</span>
  </div>
</template>

<script setup>
import { i18n } from '@/shared/i18n';
</script>

<style lang="scss">
* {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}
html, body, #app {
  height: 100vh;
  height: 100dvh;
  margin: 0;
  touch-action: manipulation;
  overscroll-behavior-y: none;
}
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
}
.landscape-tip {
  display: none;
}
// iOS 风格的 App 打开 / 关闭过渡：游戏页从点击的图标位置缩放展开 / 缩回
// 过渡期间进入的页面绝对定位覆盖在上层，避免与离开页面叠加撑高文档流
.app-open-enter-active {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  transform-origin: var(--launch-x, 50%) var(--launch-y, 50%);
  transition: transform 0.32s cubic-bezier(0.2, 0.8, 0.3, 1), opacity 0.32s ease-out;
}
.app-open-leave-active {
  transition: transform 0.32s ease-in, opacity 0.32s ease-in;
}
.app-open-enter-from {
  transform: scale(0.08);
  opacity: 0;
}
.app-open-leave-to {
  transform: scale(0.94);
  opacity: 0;
}
.app-close-enter-active {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  transition: transform 0.3s ease-out, opacity 0.3s ease-out;
}
.app-close-leave-active {
  transform-origin: var(--launch-x, 50%) var(--launch-y, 50%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.7, 0.2), opacity 0.3s ease-in;
}
.app-close-enter-from {
  transform: scale(0.94);
  opacity: 0;
}
.app-close-leave-to {
  transform: scale(0.08);
  opacity: 0;
}
@media only screen and (orientation: landscape) and (max-height: 500px) {
  .landscape-tip {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    z-index: 999;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    font-size: 18px;
    font-weight: bold;
    color: var(--text-color);
    background: var(--bg-color);
    span:first-child {
      font-size: 40px;
    }
  }
}
// 统一的浅色 / 深色主题变量（各游戏变量的并集，取值保持一致）
body {
  --border-color: #eee;
  --card-border-color: #dcdfe6;
  --text-color: #2c3e50;
  --bg-color: #f0f2f5;
  --page-bg: #f0f2f5;
  --card-bg: #fff;
  --card-bg-color: #fff;
  --card-color: #fff;
  --card-radius: 14px;
  --card-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  --mask-color: rgba(255, 255, 255, 0.8);
  --max-width: 480px;
  --primary-bg: #2ea464;
  --win-color: #1b1;
  --lose-color: #b11;
  --zero-bg-color: #d8f0e2;
  --one-bg-color: #f2f4f7;
  --two-bg-color: #e4e8ee;
  --even-bg-color: #f2f4f7;
  --odd-bg-color: #d8f0e2;
  --key-bg: #eef0f4;
  --key-active-bg: #dfe3ea;
  --enter-bg: #e5f6ec;
  --enter-color: #1e9e5a;
  --del-bg: #fdeeee;
  --del-color: #d2504a;
  --board-bg: #bbada0;
  --cell-bg: rgba(238, 228, 218, 0.35);
  background: var(--bg-color);
  &.dark {
    --border-color: #4a4a4a;
    --card-border-color: #4a4a4a;
    --text-color: #eee;
    --bg-color: #262626;
    --page-bg: #262626;
    --card-bg: #333;
    --card-bg-color: #333;
    --card-color: #333;
    --card-radius: 14px;
    --card-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
    --mask-color: rgba(51, 51, 51, 0.8);
    --max-width: 480px;
    --primary-bg: #2f9e63;
    --win-color: #4ec98a;
    --lose-color: #e57f79;
    --zero-bg-color: rgba(210, 210, 210, 0.90);
    --one-bg-color: rgba(160, 160, 160, 0.90);
    --two-bg-color: rgba(125, 125, 125, 0.90);
    --even-bg-color: rgba(210, 210, 210, 0.90);
    --odd-bg-color: rgba(125, 125, 125, 0.90);
    --key-bg: #454545;
    --key-active-bg: #505050;
    --enter-bg: rgba(78, 201, 138, 0.16);
    --enter-color: #4ec98a;
    --del-bg: rgba(229, 127, 121, 0.16);
    --del-color: #e57f79;
    --board-bg: #4a443e;
    --cell-bg: rgba(255, 255, 255, 0.08);
  }
}
</style>
