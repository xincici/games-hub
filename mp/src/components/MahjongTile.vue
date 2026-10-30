<template>
  <!-- 牌面用 <image> + 绝对定位裁切（小程序里 CSS background 不能用本地图片路径） -->
  <view class="mj-wrap">
    <image class="mj-img" :src="src" :style="vars" mode="scaleToFill" />
  </view>
</template>

<script setup>
// 麻将牌雪碧图渲染：与 web 的 MahjongTile.vue 同一套算法，
// 但小程序不能用 background-image 引本地图，改成 <image> 缩放 + 负偏移裁切
import { computed } from 'vue';

import { TILE_SHEET, spriteImageVars } from '@/shared/mahjongTiles';

const props = defineProps({
  suit: { type: String, default: 'p' },
  value: { type: Number, default: 1 },
});

const src = TILE_SHEET;
const vars = computed(() => spriteImageVars(`${props.suit}${props.value}`));
</script>

<style lang="scss">
/* 小程序里自定义组件的宿主节点默认没有宽高，组件根节点的 100% 会退化成 0 →
   牌面整片空白（雀圣 / 麻将传奇 踩过）。
   ⚠️ 必须写在**非 scoped** 块里：scoped 会把它编译成 `.data-v-xxx:host`，小程序里永远匹配不上。 */
:host {
  display: block;
  width: 100%;
  height: 100%;
  /* ⚠️ 小程序里自定义组件的宿主节点会插在容器与 .mj-wrap 之间：
     宿主没圆角时 .mj-wrap 的 border-radius: inherit 会继承到 0 → 牌是直角（侦探报过）。
     让宿主继续继承外框圆角，链就通了。 */
  border-radius: inherit;
}
</style>

<style lang="scss" scoped>
.mj-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;         /* 裁掉图里多余的格子 */
  border-radius: inherit;   /* 跟着牌外框的圆角 */
}
.mj-img {
  position: absolute;
  display: block;
}
</style>
