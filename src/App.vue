<template>
  <router-view />
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
// 统一的浅色 / 深色主题变量（四个游戏变量的并集，取值保持一致）
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
  --zero-bg-color: #ddffdd;
  --one-bg-color: #f5f5f5;
  --two-bg-color: #e5e5e5;
  --even-bg-color: #e9edf2;
  --odd-bg-color: #d8f3dc;
  --key-bg: #eef0f4;
  --key-active-bg: #dfe3ea;
  --enter-bg: #e5f6ec;
  --enter-color: #1e9e5a;
  --del-bg: #fdeeee;
  --del-color: #d2504a;
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
  }
}
</style>
