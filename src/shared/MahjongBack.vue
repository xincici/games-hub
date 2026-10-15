<template>
  <span class="mj-back" :class="{ fill }" />
</template>

<script setup>
// 麻将牌背（玩家要求：**有绿色纹理的背面**）。多家游戏共用这一份，别再各画各的
//（此前侦探 / 猎手 / 对对碰的麻将模式拿的是「本游戏首页那个图标」，压根不像牌背）。
//
// 两种用法：
//  ① 默认（不传 fill）：按 `--mj-w` / `--mj-h` 定尺寸并居中 —— 调用方把和 `<MahjongTile>` **同一份
//     style 传进来**，于是背牌与牌面同心同尺寸（翻面时不会「长大 2px」）。
//  ② `fill`：铺满父元素、圆角继承（单人麻将的牌墙是固定 26×33 的小牌背，由父级那层给尺寸）。
// 条纹与内圈都用**百分比**，所以小到 26×33 的牌墙、大到 96 宽的棋盘，纹理和边框都成比例。
defineProps({
  fill: { type: Boolean, default: false },
});
</script>

<style scoped lang="scss">
.mj-back {
  position: absolute;
  left: 50%;
  top: 50%;
  // 尺寸**直接吃牌面那套变量**（调用方把同一个 style 也传给本组件），所以在任何游戏里
  // 都与牌面同心同尺寸 —— 固定写 inset 是不行的：对对碰的 .face 自带 1px 描边（内容盒比格子小 2px），
  // 而猎手/侦探的麻将外框描边是去掉的，写死 inset 总有一边会差 2px，翻面时牌会「长大」。
  width: var(--mj-w, 44px);
  height: var(--mj-h, 59px);
  translate: -50% -50%;
  // 圆角跟牌面同一套算式：MahjongTile 是 `--mj-w × 0.09`，而麻将格子恒为 131:168，
  // 于是 `9% / 7%`（横向 9% 宽、纵向 7% 高）解出来的像素值与它完全相等。
  border-radius: 9% / 7%;
  // 绿色底 + 双向斜纹（45° 亮纹叠 -45° 暗纹），织出牌背那种斜格纹理
  background-color: #1f7a4d;
  background-image:
    repeating-linear-gradient(45deg, rgb(255 255 255 / 18%) 0 5%, rgb(255 255 255 / 0%) 5% 12%),
    repeating-linear-gradient(-45deg, rgb(0 0 0 / 12%) 0 5%, rgb(0 0 0 / 0%) 5% 12%);

  // 内圈压边：伪元素按**百分比**内缩 + 1px 细线 —— 牌大牌小都成比例
  //（原来用 `inset 0 0 0 5px` 这种固定像素，套在单人麻将 26×33 的小牌背上会糊成一圈）
  &::after {
    content: '';
    position: absolute;
    inset: 7% 6%;
    border-radius: 6% / 5%;
    border: 1px solid rgb(255 255 255 / 24%);
    box-shadow: 0 0 0 1px rgb(0 0 0 / 12%);
  }

  // 铺满父元素（父级自己给尺寸与圆角）
  &.fill {
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    translate: none;
    border-radius: inherit;
  }
}
</style>
