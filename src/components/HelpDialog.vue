<template>
  <span class="help" :title="i18n('helpTip')" @click="helpShow = true">
    <i pointer i-carbon-help text-inherit />
  </span>
  <Teleport to="body">
    <div class="help-wrapper" v-show="helpShow" @click.self="helpShow = false">
      <Transition name="inner">
        <div class="help-inner" v-if="helpShow">
          <p class="help-icon">
            <i pointer i-carbon-help text-inherit />
          </p>
          <div class="help-content">
            <p class="help-text">{{ i18n('helpMsg') }}</p>
            <ul class="help-list">
              <li v-for="(item, idx) in helpItems()" :key="idx">{{ idx + 1 }}. {{ item }}</li>
            </ul>
          </div>
          <div class="help-button">
            <button @click="helpShow = false">👍 {{ i18n('confirmText') }}</button>
          </div>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { i18n, helpItems } from '@/shared/i18n';

const props = defineProps({
  helpKey: {
    type: String,
    default: '',
  },
});

const helpShow = ref(Boolean(props.helpKey && !localStorage.getItem(props.helpKey)));

const metaThemeColorEl = document.querySelector('meta[name="theme-color"]');
let lastColor = metaThemeColorEl.getAttribute('content');

watch(helpShow, val => {
  if (val) {
    if (props.helpKey) localStorage.setItem(props.helpKey, 1);
    lastColor = metaThemeColorEl.getAttribute('content');
    metaThemeColorEl.setAttribute('content', 'rgba(0,0,0,0.85)');
  } else {
    metaThemeColorEl.setAttribute('content', lastColor);
  }
}, { immediate: true });
</script>

<style scoped lang="scss">
.help {
  font-size: 20px;
}
.inner-enter-from {
  transform: scale(0.1);
}
.inner-enter-active {
  transition: transform 0.16s ease-in-out;
}
.inner-enter-to {
  transform: scale(1);
}
.help-wrapper {
  position: fixed;
  z-index: 10;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
  box-sizing: border-box;
  background: rgba(0, 0, 0, .85);
  display: flex;
  align-items: center;
  justify-content: center;
  .help-inner {
    text-align: left;
    width: 720px;
    max-width: 90%;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    background: var(--card-bg-color);
    color: var(--text-color);
    border-radius: var(--card-radius);
    box-shadow: var(--card-shadow);
    display: flex;
    flex-direction: column;
    // 高度不超过屏幕 3/5，内容超出时仅内容区滚动，按钮常驻底部
    max-height: 60vh;
    max-height: 60dvh;
    .help-content {
      padding: 20px 24px 8px;
      overflow-y: auto;
      // 滚动条不挤占内容宽度，避免出现时文字跳动
      scrollbar-gutter: stable;
      -webkit-overflow-scrolling: touch;
    }
    // 图标固定在滚动区之外（与底部按钮区对称的固定头部）
    .help-icon {
      flex-shrink: 0;
      text-align: center;
      font-size: 28px;
      margin: 0;
      padding: 18px 24px 4px;
      color: rgba(60, 160, 60, 0.9);
    }
    .help-text {
      line-height: 1.7;
      margin: 0 0 8px;
    }
    .help-list {
      list-style: none;
      padding: 0;
      margin: 0;
      line-height: 1.7;
      li {
        padding: 6px 0 6px 4px;
        &:not(:last-child) {
          border-bottom: 1px dashed var(--border-color);
        }
      }
    }
    .help-button {
      flex-shrink: 0;
      text-align: right;
      padding: 12px 24px 16px;
      border-top: 1px solid var(--border-color);
      button {
        cursor: pointer;
        padding: 10px 24px;
        color: #fff;
        background: var(--primary-bg);
        border: 0 none;
        border-radius: 8px;
        font-weight: bold;
      }
    }
  }
}
@media only screen and (min-width: 320px) and (max-width: 720px) {
  .help-wrapper .help-inner {
    max-width: calc(100% - 32px);
  }
}
</style>
