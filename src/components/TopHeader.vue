<template>
  <div class="header-wrapper">
    <div class="side left">
      <router-link v-if="!isHome" to="/" class="item-wrapper home-btn">
        <i i-carbon-home />
        <span class="home-text">{{ i18n('backHome') }}</span>
      </router-link>
    </div>
    <span class="title" @click.stop="onTitleClick">{{ i18n('gameTitle') }}</span>
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
  padding: 10px 8px;
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
  border-bottom: 1px solid var(--border-color);
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
    font-size: 18px;
    font-weight: bold;
    text-align: center;
    white-space: nowrap;
  }
  .home-btn {
    gap: 2px;
    .home-text {
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
    &:active {
      opacity: 0.5;
    }
  }
}
</style>
