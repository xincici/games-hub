<template>
  <!-- 纯 CSS 画的麻将筒子牌：象牙白牌面 + 底部厚度做出立体感（正面偏下看过去的样子） -->
  <span class="mj">
    <span class="mj-face">
      <span
        v-for="(dot, i) in dots"
        :key="i"
        class="mj-dot"
        :class="{ 'is-red': dot.red }"
        :style="{
          left: `${dot.x}%`,
          top: `${dot.y}%`,
          width: `calc(var(--mj-w) * ${BASE_DOT * dotScale * (dot.s || 1)})`,
          height: `calc(var(--mj-w) * ${BASE_DOT * dotScale * (dot.s || 1)})`,
          '--dot': DOT_COLOR[dot.c || 'b'],
          '--dot-mid': DOT_COLOR[dot.cm || dot.c || 'b'],
          '--dot-core': DOT_COLOR[dot.cc || dot.c || 'b'],
        }"
      />
    </span>
  </span>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  // 1 = 一筒 … 9 = 九筒
  value: { type: Number, required: true },
});

// 圆点大小：整体占牌宽的比例，再乘下面是「按张数」的系数 ——
// 实物牌是张数越少点越大（一筒一颗大圆、二筒两颗大点…九筒九颗小点），不是所有牌一样大
const BASE_DOT = 0.24;
const DOT_SCALE = { 1: 2.0, 2: 1.6, 3: 1.35, 4: 1.15, 5: 1.08, 6: 1.02, 7: 0.98, 8: 0.98, 9: 0.98 };

// 筒子圆点的三种颜色（真实牌就是红绿蓝三色，蓝为主、绿次之、红做点缀）
const DOT_COLOR = { b: '#1b5aa8', g: '#1c7a45', r: '#bf3b2b' };

// 每种点数的圆点位置（x / y 都是牌面的百分比）与颜色（c：b 蓝 / g 绿 / r 红），
// 沿用麻将牌的传统排布与配色习惯：
// 一筒一颗大圆（蓝圈红心）、二筒竖排（上绿下蓝）、三筒斜排（蓝）、四筒四角（蓝绿交错）、
// 五筒四角加中心（中心红）、六筒两列三行（绿）、七筒斜三（绿）加方四（蓝）、
// 八筒两列四行（蓝，首尾两行红）、九筒三行三列（蓝）
const LAYOUT = {
  // 一筒：一颗大圆，三色 —— 红实心中心 + 绿中圈 + 蓝外圈
  1: [{ x: 50, y: 50, c: 'b', cm: 'g', cc: 'r' }],
  // 二筒：竖排，上蓝下绿
  2: [{ x: 50, y: 28, c: 'b' }, { x: 50, y: 72, c: 'g' }],
  // 三筒：斜排，蓝 / 红 / 绿
  3: [{ x: 27, y: 25, c: 'b' }, { x: 50, y: 50, c: 'r' }, { x: 73, y: 75, c: 'g' }],
  // 四筒：四角，绿在正对角线（左上、右下）
  4: [
    { x: 30, y: 30, c: 'g' }, { x: 70, y: 30, c: 'b' },
    { x: 30, y: 70, c: 'b' }, { x: 70, y: 70, c: 'g' },
  ],
  // 五筒：四角同四筒 + 红心
  5: [
    { x: 28, y: 28, c: 'g' }, { x: 72, y: 28, c: 'b' },
    { x: 50, y: 50, c: 'r' },
    { x: 28, y: 72, c: 'b' }, { x: 72, y: 72, c: 'g' },
  ],
  // 六筒：上面两颗绿 + 下面四颗红（2×2）—— 参考图用的是 2+4，不是常见的 2×3
  6: [
    { x: 33, y: 17, c: 'g' }, { x: 67, y: 17, c: 'g' },
    { x: 33, y: 62, c: 'r' }, { x: 67, y: 62, c: 'r' },
    { x: 33, y: 85, c: 'r' }, { x: 67, y: 85, c: 'r' },
  ],
  // 七筒：上面三颗绿成斜排 + 下面四颗红（2×2）
  7: [
    { x: 28, y: 15, c: 'g' }, { x: 50, y: 29, c: 'g' }, { x: 72, y: 43, c: 'g' },
    { x: 29, y: 66, c: 'r' }, { x: 71, y: 66, c: 'r' },
    { x: 29, y: 87, c: 'r' }, { x: 71, y: 87, c: 'r' },
  ],
  // 八筒：两列四行，全蓝
  8: [
    { x: 32, y: 15 }, { x: 68, y: 15 },
    { x: 32, y: 38 }, { x: 68, y: 38 },
    { x: 32, y: 62 }, { x: 68, y: 62 },
    { x: 32, y: 85 }, { x: 68, y: 85 },
  ],
  // 九筒：三行三列 —— 上排蓝、中排红、下排绿
  9: [
    { x: 23, y: 20 }, { x: 50, y: 20 }, { x: 77, y: 20 },
    { x: 23, y: 50, c: 'r' }, { x: 50, y: 50, c: 'r' }, { x: 77, y: 50, c: 'r' },
    { x: 23, y: 80, c: 'g' }, { x: 50, y: 80, c: 'g' }, { x: 77, y: 80, c: 'g' },
  ],
};

const dots = computed(() => (LAYOUT[props.value] || LAYOUT[1]).map(d => ({ ...d })));
const dotScale = computed(() => DOT_SCALE[props.value] || 1);
</script>

<style scoped lang="scss">
// 尺寸由父级给：--mj-w / --mj-h（牌是 1 : 1.35 的竖牌）
.mj {
  position: relative;
  display: inline-block;
  width: var(--mj-w, 44px);
  height: var(--mj-h, 59px);
  border-radius: calc(var(--mj-w, 44px) * 0.13);
  background: linear-gradient(178deg, #fffdf8 0%, #f8f2e6 60%, #ece1cb 100%);
  // 立体感：面上一层高光 + 底部一条厚度（正面偏下看过去露出的侧面）+ 落地阴影
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 92%),
    inset 0 -2px 4px rgb(120 100 70 / 15%),
    inset 0 0 0 1px rgb(160 140 105 / 28%),
    0 calc(var(--mj-w, 44px) * 0.075) 0 #c9b596,
    0 calc(var(--mj-w, 44px) * 0.1) calc(var(--mj-w, 44px) * 0.15) rgb(60 45 25 / 26%);

  .mj-face {
    position: absolute;
    inset: 8%;
  }

  // 筒子上的圆点：真实牌是「中心一个实心圆点 + 内外两个同心圆线」，
  // 内圈的线细、外圈的线粗 —— 用三层 radial-gradient 硬断点画出来
  .mj-dot {
    position: absolute;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    // 中心实心点 + 中圈细线 + 外圈粗线；三层颜色可分别给（一筒就是红心 / 绿中圈 / 蓝外圈），
    // 不给 --dot-mid / --dot-core 时回落到 --dot，即单色点
    // 必须写 closest-side：radial-gradient 默认按 farthest-corner（圆心到**角**）算，
    // 那是半径的 1.41 倍，百分比全被拉大 → 最外那道 68%~100% 落到圆周上只剩 4% 半径宽，
    // 外圈反而比中圈细（实测外圈 1.3 CSS px、中圈 4.7 CSS px，正好和实物相反）
    background: radial-gradient(circle closest-side at 50% 50%,
      var(--dot-core, #1b5aa8) 0 24%,
      transparent 24% 40%,
      var(--dot-mid, #1b5aa8) 40% 52%,
      transparent 52% 68%,
      var(--dot, #1b5aa8) 68% 100%);
    filter: drop-shadow(0 0.5px 0.5px rgb(0 0 0 / 25%));
  }
}
</style>
