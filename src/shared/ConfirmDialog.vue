<template>
  <Teleport to="body">
    <!-- 结构与动画跟帮助弹窗一致：外层 v-show 的遮罩 + 内层 <Transition name="inner">
         （盒子从 scale(0.1) 在 0.16s 内弹到 1；遮罩不淡入，关闭也是瞬时的） -->
    <div v-show="show" class="confirm-mask" @click.self="emit('cancel')">
      <Transition name="inner">
        <div v-if="show" class="confirm-box">
          <p class="confirm-title">{{ titleText }}</p>
          <p class="confirm-msg">{{ msgText }}</p>
          <div class="confirm-actions">
            <button class="confirm-cancel" @click="emit('cancel')">{{ cancelLabel }}</button>
            <button class="confirm-ok" @click="emit('confirm')">{{ okLabel }}</button>
          </div>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<script setup>
// 各游戏共用的二次确认弹窗（闯关三件套的「新游戏」用它，文案与样式都只有这一份）。
// 用法：<ConfirmDialog :show="confirming" @confirm="startNewGame" @cancel="confirming = false" />
// 需要换文案时传 title / message / confirmText / cancelText 覆盖即可。
import { computed } from 'vue';

import { language } from '@/shared/i18n';

const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  confirmText: { type: String, default: '' },
  cancelText: { type: String, default: '' },
});

const emit = defineEmits(['confirm', 'cancel']);

// 弹窗自带一套中英文案（三处共用，所以不再各游戏各写一份 i18n key）
const TEXT = {
  cn: {
    title: '🔄 开始新游戏？',
    message: '会清除闯关记录并从第 1 关重新开始。如果只是想重玩本关，请点结算浮层上的「重玩本关」。',
    confirm: '确定重来',
    cancel: '取消',
  },
  en: {
    title: '🔄 Start a new game?',
    message: 'This clears your level record and restarts from level 1. To retry the level you are on, use Replay Level on the result screen.',
    confirm: 'Yes, Restart',
    cancel: 'Cancel',
  },
};

const text = computed(() => TEXT[language.value] || TEXT.cn);
const titleText = computed(() => props.title || text.value.title);
const msgText = computed(() => props.message || text.value.message);
const okLabel = computed(() => props.confirmText || text.value.confirm);
const cancelLabel = computed(() => props.cancelText || text.value.cancel);
</script>

<style scoped lang="scss">
// 与帮助弹窗（HelpDialog.vue）完全同款的开场动画
.inner-enter-from {
  transform: scale(0.1);
}

.inner-enter-active {
  transition: transform 0.16s ease-in-out;
}

.inner-enter-to {
  transform: scale(1);
}

.confirm-mask {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
}

.confirm-box {
  width: calc(100% - 64px);
  max-width: 320px;
  padding: 20px 20px 16px;
  box-sizing: border-box;
  border-radius: var(--card-radius);
  background: var(--card-bg-color);
  color: var(--text-color);
  box-shadow: var(--card-shadow);
  .confirm-title {
    margin: 0 0 8px;
    font-size: 17px;
    font-weight: bold;
  }
  .confirm-msg {
    margin: 0 0 16px;
    font-size: 14px;
    opacity: 0.8;
    line-height: 1.5;
  }
  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    button {
      cursor: pointer;
      padding: 8px 16px;
      font-size: 14px;
      border-radius: var(--radius-tile);
      border: 0 none;
      -webkit-tap-highlight-color: transparent;
    }
    .confirm-cancel {
      background: var(--key-bg);
      color: var(--text-color);
    }
    .confirm-ok {
      background: var(--primary-bg);
      color: #fff;
      font-weight: bold;
    }
  }
}
</style>
