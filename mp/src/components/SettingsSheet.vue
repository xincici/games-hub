<template>
  <view v-if="shown" class="mask" :class="{ active }" @click="close">
    <view class="sheet" @click.stop>
      <view class="sheet-head">
        <text class="sheet-title">{{ t('setTitle') }}</text>
        <view class="sheet-close" @click="close"><view class="ico i-carbon-close" /></view>
      </view>

      <view class="row">
        <text class="row-label">{{ t('setLang') }}</text>
        <view class="seg">
          <view
            v-for="opt in langOpts"
            :key="opt.value"
            class="seg-item"
            :class="{ on: langMode === opt.value }"
            @click="setLangMode(opt.value)"
          >{{ opt.label }}</view>
        </view>
      </view>

      <view class="row">
        <text class="row-label">{{ t('setFace') }}</text>
        <view class="seg">
          <view
            v-for="opt in faceOpts"
            :key="opt.value"
            class="seg-item"
            :class="{ on: face === opt.value }"
            @click="setFace(opt.value)"
          >{{ opt.label }}</view>
        </view>
      </view>

      <view class="row">
        <text class="row-label">{{ t('setSfx') }}</text>
        <view class="seg">
          <view class="seg-item" :class="{ on: sfxOn }" @click="setSfxOn(true)">{{ t('setOn') }}</view>
          <view class="seg-item" :class="{ on: !sfxOn }" @click="setSfxOn(false)">{{ t('setOff') }}</view>
        </view>
      </view>

      <view class="sheet-footer">
        <text class="footer-text">{{ t('setFooter') }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue';

import { t } from '@/core/i18n';
import { face, langMode, setFace, setLangMode, setSfxOn, sfxOn } from '@/core/settings';

const props = defineProps({ open: { type: Boolean, default: false } });
const emit = defineEmits(['close']);

// 抽屉动画：shown 控制 DOM 是否存在，active 控制「展开 / 收起」两个 CSS 状态。
// 小程序不支持 Vue 的 <transition>，所以用 class + transition 手动驱动。
const shown = ref(false);
const active = ref(false);
let timer = 0;

watch(
  () => props.open,
  (val) => {
    clearTimeout(timer);
    if (val) {
      shown.value = true;
      timer = setTimeout(() => { active.value = true; }, 20);   // 先插入 DOM，再触发过渡
    } else {
      active.value = false;
      timer = setTimeout(() => { shown.value = false; }, 300);  // 等缩回去再移除
    }
  },
  { immediate: true },
);

const close = () => emit('close');

const langOpts = computed(() => [
  { value: 'system', label: t('setFollow') },
  { value: 'cn', label: t('setCn') },
  { value: 'en', label: t('setEn') },
]);
const faceOpts = computed(() => [
  { value: 'emoji', label: 'Emoji' },
  { value: 'poker', label: t('setPoker') },     /* 之前漏了这一项（只有 Emoji / 麻将） */
  { value: 'mahjong', label: t('setMahjong') },
]);
</script>

<style lang="scss" scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: flex-end;
  opacity: 0;
  transition: opacity 0.26s ease;
  &.active { opacity: 1; }
}
.sheet {
  width: 100%;
  box-sizing: border-box;
  padding: 28rpx 32rpx calc(40rpx + env(safe-area-inset-bottom));
  background: #fff;
  border-radius: 28rpx 28rpx 0 0;
  box-shadow: 0 -8rpx 32rpx rgba(0, 0, 0, 0.12);
  transform: translateY(100%);                                  /* 收起：整体缩到屏幕外 */
  transition: transform 0.3s cubic-bezier(0.22, 0.61, 0.36, 1);
  .mask.active & { transform: translateY(0); }                   /* 展开：滑上来 */
}
.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12rpx;
}
.sheet-title {
  font-size: 32rpx;
  font-weight: 800;
  color: #222;
}
.sheet-close {
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #f0f2f5;
}
.ico { font-size: 32rpx; color: #333; }
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 22rpx 0;
  border-top: 2rpx solid #f0f2f5;
}
.row-label {
  font-size: 26rpx;
  color: #333;
  flex: 0 0 auto;
}
.seg {
  display: flex;
  gap: 6rpx;
  padding: 4rpx;
  border-radius: 14rpx;
  background: #f0f2f5;
}
.seg-item {
  padding: 0 20rpx;
  height: 56rpx;
  line-height: 56rpx;
  border-radius: 10rpx;
  font-size: 24rpx;
  color: #5f6b7a;
  &.on {
    background: #23804e;
    color: #fff;
    font-weight: 700;
  }
}
.sheet-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 26rpx;
}
.footer-text {
  font-size: 22rpx;
  letter-spacing: 1rpx;
  color: #b6bcc6;
}
</style>
