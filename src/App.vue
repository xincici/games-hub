<template>
  <!-- 全站粒子连线背景：固定全屏、z-index 0、不拦截交互；内容层 z-index 1 盖在其上 -->
  <ParticleBackground />
  <div class="app-content">
    <router-view v-slot="{ Component, route }">
      <Transition :name="route.meta.game === 'home' ? 'app-close' : 'app-open'">
        <component :is="Component" :key="route.meta.game" />
      </Transition>
    </router-view>
  </div>
  <div class="landscape-tip">
    <span>📱</span>
    <span>{{ i18n('rotateTip') }}</span>
  </div>
</template>

<script setup>
import ParticleBackground from '@/shared/ParticleBackground.vue';
import { i18n } from '@/shared/i18n';
</script>

<style lang="scss">
// 棋盘点阵底纹：六个 emoji 游戏（对对碰 / 连连看 / 侦探 / 猎手 / 消消乐 / 大师）的游戏区共用这一份定义。
// 用了这个类就不要再写 `background: var(--board-bg)`——简写会把 background-image 清掉。
.dot-board {
  background-color: var(--board-bg);
  background-image: radial-gradient(circle, var(--board-dot) 1.1px, transparent 1.1px);
  background-size: 10px 10px;
  background-position: 5px 5px;
}

* {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  // 关掉 iOS 系统 tap 高亮，让下面统一的 :active 反馈成为唯一视觉反馈
  -webkit-tap-highlight-color: transparent;
}
html, body, #app {
  height: 100vh;
  height: 100dvh;
  margin: 0;
  touch-action: manipulation;
  overscroll-behavior-y: none;
}
#app {
  // 之前只有 Avenir（仅 macOS 有）→ Windows 落 Arial、Android 落 Roboto，数字字形差异很大；
  // 中文也完全靠系统回退，这里显式补上各平台的中文字体与 emoji 字体
  font-family: Avenir, "Avenir Next", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei",
    "Noto Sans SC", "Source Han Sans SC", "Helvetica Neue", Helvetica, Arial,
    "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
}
// ---- 全站统一的按压 / 悬停反馈 ----
// 之前只有 guess（opacity）和 poker（位移）两个游戏的主按钮有按压反馈，
// 其余 12 个游戏点了没有任何回应；这里用一条 #app 前缀的全局规则补齐，
// 优先级高于各游戏 scoped 样式（#app 前缀 = 1,0,0）
// 桌面端（真有指针、能悬停的设备才启用，避免触屏上出现"粘住"的高亮）
@media (hover: hover) and (pointer: fine) {
  #app button:not(:disabled):not(.disable),
  #app .item-wrapper,
  #app a.hex:not(.placeholder) {
    transition: filter 0.15s ease, opacity 0.15s ease;
  }
  #app button:not(:disabled):not(.disable):hover {
    filter: brightness(1.06);
  }
  #app .item-wrapper:hover {
    opacity: 0.7;
  }
  #app a.hex:not(.placeholder):hover {
    filter: brightness(1.04);
  }
}
// 按压规则必须写在 hover 之后：同优先级时后写的生效，
// 否则「悬停 + 按下」会取到 hover 的变亮，按下反而没有下沉反馈
#app button:not(:disabled):not(.disable):active,
#app .item-wrapper:active,
#app a.hex:not(.placeholder):active {
  filter: brightness(0.9);
  transform: translateY(1px);
}
.landscape-tip {
  display: none;
}
// 内容层抬到画布之上（粒子 canvas 为 fixed + z-index 0）
.app-content {
  position: relative;
  z-index: 1;
}
// 各页面根容器原本用 --bg-color 打底，这里改为透明，
// 让 body 底色 + 粒子画布透上来（#app 前缀提高优先级压过各游戏的 scoped 样式）
#app .wrapper {
  background: transparent;
}
// iOS 风格的 App 打开 / 关闭过渡：游戏页从点击的图标位置缩放展开 / 缩回
// 过渡期间进入的页面绝对定位覆盖在上层，避免与离开页面叠加撑高文档流
.app-open-enter-active {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  transform-origin: var(--launch-x, 50%) var(--launch-y, 50%);
  transition: transform 0.32s cubic-bezier(0.2, 0.8, 0.3, 1), opacity 0.32s ease-out;
}
.app-open-leave-active {
  transition: transform 0.32s ease-in, opacity 0.32s ease-in;
}
.app-open-enter-from {
  transform: scale(0.08);
  opacity: 0;
}
.app-open-leave-to {
  transform: scale(0.94);
  opacity: 0;
}
.app-close-enter-active {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  transition: transform 0.3s ease-out, opacity 0.3s ease-out;
}
.app-close-leave-active {
  transform-origin: var(--launch-x, 50%) var(--launch-y, 50%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.7, 0.2), opacity 0.3s ease-in;
}
.app-close-enter-from {
  transform: scale(0.94);
  opacity: 0;
}
.app-close-leave-to {
  transform: scale(0.08);
  opacity: 0;
}
@media only screen and (orientation: landscape) and (max-height: 500px) {
  .landscape-tip {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    z-index: 999;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    font-size: 18px;
    font-weight: bold;
    color: var(--text-color);
    background: var(--bg-color);
    span:first-child {
      font-size: 40px;
    }
  }
}
// 统一的浅色 / 深色主题变量（各游戏变量的并集，取值保持一致）
body.card-dragging {
  cursor: grabbing;
}
body {
  --border-color: #e1e1e1;
  --card-border-color: #dcdfe6;
  --text-color: #2c3e50;
  --bg-color: #f0f2f5;
  --page-bg: #f0f2f5;
  --card-bg: #fff;
  --card-bg-color: #fff;
  --card-color: #fff;
  --card-radius: 14px;
  --card-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  // 统一的卡片宽度 / 行高 / 牌格圆角 / 阴影档位：14 个游戏一律走这几个值
  --card-max-width: 440px;
  --row-height: 72px;
  --row-gap: 16px;
  --radius-tile: 8px;
  --shadow-soft: 0 1px 3px rgba(0, 0, 0, 0.12);
  --shadow-sheet: 0 -4px 20px rgba(0, 0, 0, 0.08);
  --shadow-float: 0 6px 18px rgba(0, 0, 0, 0.26);
  --mask-color: rgba(255, 255, 255, 0.8);
  --max-width: 480px;
  // 首页卡片的分类强调色（只用于首页图标与六边形描边，游戏内部一律用品牌绿）
  --accent-logic: #23804e;
  --accent-number: #2c6aad;
  --accent-memory: #7550ad;
  --accent-action: #bd5420;
  --accent-card: #8f6419;
  // 主色：白字压在上面需 ≥4.5:1，#2ea464 只有 3.18:1，故压深一档（4.92:1）
  --primary-bg: #23804e;
  // 结果色：浅色下压在近白遮罩上，胜利色同样要压深（#1b1 只有 2.58:1）
  --win-color: #12833f;
  --lose-color: #b11;
  // 次要文字（统计标签等）：不再靠 opacity: .6 变淡（那样只有 3.46:1）
  --muted-color: #5f6b7a;
  // 棋盘格：格子数字与「遮住」蒙层的颜色，深色主题下换成浅字深底
  --cell-text-color: #222;
  --cell-mask: #c9ced6;
  // 连连看墙块斜纹（深色下需要浅纹才看得见）
  --wall-stripe: rgba(0, 0, 0, 0.14);
  // 点击游戏的三态：0 = 已完成（贴近主题绿、不用再点）、1 = 最需要处理（最深）、
  // 2 = 再点一次就归零（中间档）；三者的色相/明度都拉开了，一眼能分
  --zero-bg-color: #dcf0e4;
  --zero-color: #2c6b4a;
  --one-bg-color: #f6c489;
  --one-color: #6f3603;
  --two-bg-color: #fbe4c4;
  --two-color: #8a5312;
  // 连连看墙块底色（原来借用 --two-bg-color，现已拆开）
  --wall-bg: #e4e8ee;
  --even-bg-color: #f2f4f7;
  --odd-bg-color: #d8f0e2;
  --tile-border-color: #c9d0da;
  --sudoku-line: #d3d8df;
  --sudoku-strong: #5f7086;
  // 数独三档高亮：同行列宫（最淡）< 同数字 < 选中格（最深）。
  // 不要复用 --key-bg / --enter-bg，那两个还被数字键盘和工具按钮共用
  --sudoku-hl-bg: #c9d6e8;
  --sudoku-same-bg: #8fdcb2;
  --sudoku-sel-bg: #7ad0a4;
  --particle-dot: 90, 112, 140;
  --particle-line: 118, 140, 172;
  --key-bg: #eef0f4;
  --key-active-bg: #dfe3ea;
  --enter-bg: #e5f6ec;
  --enter-color: #157a45;
  --del-bg: #fdeeee;
  --del-color: #b8433d;
  --board-bg: #bbada0;
  // 棋盘点阵底纹的点色（各 emoji 游戏的游戏区共用，很淡，空盘时不至于一片空白）
  --board-dot: rgba(255, 255, 255, 0.18);
  --cell-bg: rgba(238, 228, 218, 0.35);
  // 消消乐空闲提示：被提示的牌背景脉冲色 + 外发光（要一眼看得见，故取暖黄 + 品牌绿）
  --hint-bg: #fff1c2;
  --hint-glow: rgba(35, 128, 78, 0.55);
  // 消消乐大消 / 连锁庆祝：棋盘闪光与庆祝文字底色
  --celebrate-glow: rgba(35, 128, 78, 0.5);
  background: var(--bg-color);
  &.dark {
    --border-color: #4a4a4a;
    --card-border-color: #4a4a4a;
    --text-color: #eee;
    --bg-color: #262626;
    --page-bg: #262626;
    --card-bg: #333;
    --card-bg-color: #333;
    --card-color: #333;
    --card-radius: 14px;
    --card-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
    --shadow-soft: 0 1px 3px rgba(0, 0, 0, 0.4);
    --shadow-sheet: 0 -4px 20px rgba(0, 0, 0, 0.4);
    --shadow-float: 0 6px 18px rgba(0, 0, 0, 0.5);
    --mask-color: rgba(51, 51, 51, 0.8);
    --max-width: 480px;
    --accent-logic: #4eb87f;
    --accent-number: #6aa5e6;
    --accent-memory: #b295e6;
    --accent-action: #e59356;
    --accent-card: #e0b158;
    --primary-bg: #23804e;
    --win-color: #4ec98a;
    --lose-color: #e57f79;
    --muted-color: #a3adba;
    --cell-text-color: #ececec;
    --cell-mask: #454545;
    --wall-stripe: rgba(255, 255, 255, 0.16);
    // 点击游戏三态（深色版）：绿=已完成、琥珀越深=越需要处理
    --zero-bg-color: rgba(78, 201, 138, 0.22);
    --zero-color: #8adfb2;
    --one-bg-color: rgba(235, 150, 60, 0.38);
    --one-color: #f8d0a0;
    --two-bg-color: rgba(235, 170, 80, 0.22);
    --two-color: #efc489;
    --wall-bg: rgba(255, 255, 255, 0.14);
    --even-bg-color: rgba(255, 255, 255, 0.06);
    --odd-bg-color: rgba(78, 201, 138, 0.22);
    --tile-border-color: #5a5a5a;
    --sudoku-line: #545d6b;
    --sudoku-strong: #92a3ba;
    --sudoku-hl-bg: #4a5462;
    --sudoku-same-bg: rgba(78, 201, 138, 0.42);
    --sudoku-sel-bg: rgba(78, 201, 138, 0.62);
    --particle-dot: 178, 204, 238;
    --particle-line: 150, 188, 232;
    --key-bg: #454545;
    --key-active-bg: #505050;
    --enter-bg: rgba(78, 201, 138, 0.16);
    --enter-color: #5ad396;
    --del-bg: rgba(229, 127, 121, 0.16);
    --del-color: #f5a49e;
    --board-bg: #4a443e;
    --board-dot: rgba(255, 255, 255, 0.08);
    --cell-bg: rgba(255, 255, 255, 0.08);
    // 消消乐空闲提示（深色版）：暖黄转成半透明，外发光提亮一档
    --hint-bg: rgba(242, 208, 145, 0.34);
    --hint-glow: rgba(78, 201, 138, 0.6);
    --celebrate-glow: rgba(78, 201, 138, 0.55);
  }
}
</style>
