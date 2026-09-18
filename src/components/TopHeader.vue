<template>
  <div class="header-wrapper">
    <div class="side left">
      <router-link v-if="!isHome" to="/" class="item-wrapper home-btn">
        <i i-carbon-home />
        <span class="home-text">{{ i18n('backHome') }}</span>
      </router-link>
    </div>
    <!-- 首页只显示游戏图标（favicon 同款图案），不再显示「游戏合集」文案 -->
    <img v-if="isHome" class="logo" :src="logoUrl" :alt="i18n('gameTitle')" draggable="false" />
    <span v-else class="title" @click.stop="onTitleClick">{{ i18n('gameTitle') }}</span>
    <div class="side right">
      <template v-if="isHome">
        <span class="item-wrapper" @click="toggleTheme">
          <i i-carbon-moon v-if="isDark" />
          <i i-carbon-sun v-else />
        </span>
        <span class="item-wrapper" @click="toggleLanguage">
          <i i-carbon-ibm-watson-language-translator />
        </span>
      </template>
      <slot />
      <span v-if="showHelp" class="item-wrapper">
        <HelpDialog :help-key="config.helpKey" />
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import HelpDialog from './HelpDialog.vue';
// 首页标题位置显示游戏图标：直接引用图标源文件 scripts/make-icon.svg
// （public/ 下的 favicon 与 PWA 图标都由它缩放而来）。
// 用矢量源文件是因为任意 DPR 都清晰，且它四角是透明的——位图 PNG 四角是白底，
// 深色模式下即使裁圆角也会在标题栏中间残留白边
import logoUrl from '../../scripts/make-icon.svg';

import { toggle as toggleLanguage } from '@/shared/i18n';
import { isDark, toggle as toggleTheme } from '@/shared/theme';
import { activeGame } from '@/shared/i18n';
import { gameConfig } from '@/shared/games';

const isHome = computed(() => activeGame.value === 'home');

defineProps({
  showHelp: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(['onScoreReset']);

const config = computed(() => gameConfig(activeGame.value) || {});

const titleClicks = ref(0);

function onTitleClick() {
  const { recordsPrefix, minDifficulty, maxDifficulty } = config.value;
  if (!recordsPrefix) return;
  titleClicks.value++;
  if (titleClicks.value === 5) {
    for (let i = minDifficulty; i <= maxDifficulty; i++) {
      localStorage.removeItem(`${recordsPrefix}${i}`);
    }
    emit('onScoreReset');
  }
}

function onBodyClick() {
  titleClicks.value = 0;
}

onMounted(() => {
  document.body.addEventListener('click', onBodyClick);
});

onUnmounted(() => {
  document.body.removeEventListener('click', onBodyClick);
});
</script>

<style scoped lang="scss">
.header-wrapper {
  background: var(--bg-color);
  max-width: var(--max-width);
  // 上下不留内边距：内容盒就是整条 50px，图标（min-height 44px）与标题才能在这条里真正居中
  padding: 0 8px;
  box-sizing: border-box;
  // 两侧操作区等宽（1fr auto 1fr），标题列不受两侧内容影响，始终水平居中
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  height: 50px;
  border: 0 none;
  z-index: 1;
  .side {
    display: flex;
    align-items: center;
    min-width: 0;
    &.left {
      justify-content: flex-start;
    }
    &.right {
      justify-content: flex-end;
    }
  }
  .title {
    font-size: 15px;
    font-weight: bold;
    text-align: center;
    white-space: nowrap;
    // 字形基线本身偏上，下移一点视觉上才居中（grid 居中会吃掉一半 margin，净下移 2.5px）
    margin-top: 5px;
  }
  .logo {
    display: block;
    width: 28px;
    height: 28px;
    user-select: none;
    -webkit-user-drag: none;
  }
  .home-btn {
    gap: 2px;
    .home-text {
      display: inline-block;
      transform: translate(2px, 2px);
      font-size: 15px;
      font-weight: 500;
    }
  }
  .item-wrapper {
    flex-grow: 0;
    cursor: pointer;
    padding: 0 8px;
    font-size: 20px;
    color: var(--text-color);
    text-decoration: none;
    // 关闭 iOS 系统 tap 高亮，让 :active 反馈成为唯一视觉反馈
    -webkit-tap-highlight-color: transparent;
    // 图标本身只有 27px 高，把真实盒子撑到 44px 再居中（不要用伪元素盖一层——
    // 帮助弹窗的 @click 挂在子元素上，浮层会把它的点击吞掉）
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    box-sizing: border-box;
    &:active {
      opacity: 0.5;
    }
  }
  :slotted(.item-wrapper) {
    flex-grow: 0;
    cursor: pointer;
    padding: 0 8px;
    font-size: 20px;
    color: var(--text-color);
    -webkit-tap-highlight-color: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    box-sizing: border-box;
    &:active {
      opacity: 0.5;
    }
  }
}
</style>
