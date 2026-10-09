<script setup>
// 牌面直接用雀圣那套雪碧图里的「筒」（与原 CSS 画的圆点相比，这套是实物牌的配色与质感）。
// --mj-w / --mj-h 仍由父级给（牌是 131:168 的竖牌），组件本身不再画厚度。
import { computed } from 'vue';
import sheet from '@/shared/mahjong-tiles.webp';
import { spriteVars } from '@/shared/mahjongTiles';

const props = defineProps({
  // 1 = 一筒 … 9 = 九筒
  value: { type: Number, required: true },
});

const vars = computed(() => ({
  backgroundImage: `url(${sheet})`,
  ...spriteVars(`p${props.value}`),
}));
</script>

<template>
  <span class="mj" :style="vars" />
</template>

<style scoped lang="scss">
.mj {
  position: relative;
  display: block;
  width: var(--mj-w, 44px);
  height: var(--mj-h, 59px);
  background-repeat: no-repeat;
  background-size: var(--bg-w, 735%) var(--bg-h, 525%);
  background-position: var(--bg-x, 0%) var(--bg-y, 0%);
  // 原图每张牌自己是圆角的，而雪碧图裁出来是直角矩形 —— 不给圆角四角会露出浅底
  border-radius: calc(var(--mj-w, 44px) * 0.09);
  user-select: none;
}
</style>
