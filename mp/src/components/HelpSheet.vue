<template>
  <view v-if="shown" class="help-mask" :class="{ active }" @click="close">
    <view class="help-panel" @click.stop>
      <!-- 顶部问号图标（与 web 的 HelpDialog 一致） -->
      <view class="help-icon-wrap">
        <view class="help-icon i-carbon-help" />
      </view>
      <scroll-view scroll-y class="help-body">
        <text v-for="(p, i) in paras" :key="i" class="help-p">{{ p }}</text>
      </scroll-view>
      <button class="help-ok" @click="close">{{ okText }}</button>
    </view>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue';

import { lang } from '@/core/settings';

const props = defineProps({
  open: { type: Boolean, default: false },
  text: { type: String, default: '' },
});
const emit = defineEmits(['close']);

// 文案里的 \n\n 拆成真正的段落（uni.showModal 会把换行吃掉，所以自己画）
const paras = computed(() => String(props.text || '').split(/\n{2,}/).map(s => s.trim()).filter(Boolean));
const okText = computed(() => (lang.value === 'en' ? 'OK' : '好的，明白'));

const shown = ref(false);
const active = ref(false);
let timer = 0;
watch(
  () => props.open,
  (v) => {
    clearTimeout(timer);
    if (v) {
      shown.value = true;
      timer = setTimeout(() => { active.value = true; }, 20);
    } else {
      active.value = false;
      timer = setTimeout(() => { shown.value = false; }, 220);
    }
  },
);
const close = () => emit('close');
</script>

<style lang="scss" scoped>
.help-mask {
  position: fixed;
  inset: 0;
  z-index: 55;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 48rpx;
  box-sizing: border-box;
  background: rgba(0, 0, 0, 0.4);
  opacity: 0;
  transition: opacity 0.2s ease;
  &.active { opacity: 1; }
}
.help-panel {
  width: 100%;
  max-height: 76vh;
  display: flex;
  flex-direction: column;
  padding: 32rpx 32rpx 24rpx;
  box-sizing: border-box;
  border-radius: 28rpx;
  background: #fff;
  box-shadow: 0 16rpx 48rpx rgba(0, 0, 0, 0.18);
  transform: scale(0.94);
  transition: transform 0.2s cubic-bezier(0.22, 0.61, 0.36, 1);
  .help-mask.active & { transform: scale(1); }
}
.help-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  padding-bottom: 16rpx;
}
.help-icon {
  font-size: 68rpx;        /* 顶部问号图标 */
  color: #23804e;
}
.help-body {
  flex: 1;
  min-height: 0;
  max-height: 56vh;
}
.help-p {
  display: block;
  font-size: 23rpx;        /* 比系统弹窗小一号 */
  line-height: 1.62;
  color: #4a5462;
  & + & { margin-top: 14rpx; }
}
.help-ok {
  margin-top: 22rpx;
  height: 76rpx;
  line-height: 76rpx;
  border-radius: 16rpx;
  background: #23804e;
  color: #fff;
  font-size: 27rpx;
  font-weight: 700;
  border: 0;
}
</style>
