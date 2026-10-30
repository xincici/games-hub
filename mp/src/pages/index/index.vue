<template>
  <view class="page">
    <!-- 全站背景（粒子连线；底部过山车已全局关闭） -->
    <ParticleBackground />

      <!-- 顶栏：照 web 的 TopHeader —— 首页标题位置放的是游戏图标（scripts/make-icon.svg 导出的 PNG）-->
      <view class="home-header">
        <image class="home-logo" src="/static/icon-512.png" mode="aspectFit" />
      </view>
    <!-- 蜂窝：与 web 首页同一套布局（4/3/4/3… 逐行交替咬合，尖顶六边形） -->
    <view class="honeycomb">
      <view v-for="(row, ri) in rows" :key="ri" class="hex-row" :class="{ offset: row.offset }">
        <view
          v-for="g in row.list"
          :key="g.id"
          class="hex"
          :class="['acc-' + g.accent, { 'no-intro': introDone }]"
          :style="enterStyle(g.id)"
          @click="open(g)"
        >
          <view class="hex-body">
            <view class="hex-icon" :class="g.icon" />
            <text class="game-name">{{ g.name || t(g.nameKey) }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 与游戏页帮助按钮同位置同款的设置按钮（web 用 i-mdi-cogs） -->
    <FloatingActions>
      <view class="fab" @click="settingsOpen = true">
        <view class="fab-ico i-mdi-cogs" />
      </view>
    </FloatingActions>

    <SettingsSheet :open="settingsOpen" @close="settingsOpen = false" />
  </view>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';


import FloatingActions from '@/components/FloatingActions.vue';
import SettingsSheet from '@/components/SettingsSheet.vue';
import { setNavTitle, t } from '@/core/i18n';
import ParticleBackground from '@/components/ParticleBackground.vue';

const settingsOpen = ref(false);

// 首页标题「游戏合集 / Game Hub」也要跟随语言
setNavTitle(() => t('title'));

// 图标与 web 的 src/shared/games.js 完全一致；
// accent 也逐个照抄 web（logic 消除益智 / number 逻辑数字 / memory 记忆 / action 动作 / card 卡牌），
// 对应 web src/App.vue 里的 --accent-*（首页只用它给图标与六边形描边上色）。
const games = [
  { id: 'g2048', icon: 'i-mdi-numeric', accent: 'number', nameKey: 'g2048', url: '/pages/g2048/g2048' },
  { id: 'point24', icon: 'i-mdi-calculator', accent: 'number', nameKey: 'p24Title', url: '/pages/point24/point24' },
  { id: 'match', icon: 'i-mdi-lightbulb-on-50', accent: 'memory', nameKey: 'mName', url: '/pages/match/match' },
  { id: 'gambler', icon: 'i-dinkie-icons-eight-of-bamboos-mahjong', accent: 'card', nameKey: 'gName', url: '/pages/gambler/gambler' },
  { id: 'mahjong', icon: 'i-dinkie-icons-five-of-circles-mahjong', accent: 'card', nameKey: 'game.mahjong', url: '/pages/mahjong/mahjong' },
  { id: 'quesheng', icon: 'i-dinkie-icons-white-dragon-mahjong', accent: 'card', nameKey: 'game.quesheng', url: '/pages/quesheng/quesheng' },
  { id: 'legend', icon: 'i-dinkie-icons-seven-of-bamboos-mahjong', accent: 'card', nameKey: 'game.legend', url: '/pages/legend/legend' },
  { id: 'snake', icon: 'i-mdi-snake', accent: 'action', nameKey: 'game.snake', url: '/pages/snake/snake' },
  { id: 'poker', icon: 'i-mdi-cards-playing-spade-multiple-outline', accent: 'card', nameKey: 'game.poker', url: '/pages/poker/poker' },
  { id: 'guess', icon: 'i-mdi-counter', accent: 'number', nameKey: 'game.guess', url: '/pages/guess/guess' },
  { id: 'three', icon: 'i-mdi-numeric-3', accent: 'number', nameKey: 'game.three', url: '/pages/three/three' },
  { id: 'sudoku', icon: 'i-mdi-grid', accent: 'number', nameKey: 'game.sudoku', url: '/pages/sudoku/sudoku' },
  { id: 'down', icon: 'i-mdi-format-vertical-align-bottom', accent: 'action', nameKey: 'game.down', url: '/pages/down/down' },
  { id: 'mirror', icon: 'i-mdi-mirror-variant', accent: 'memory', nameKey: 'game.mirror', url: '/pages/mirror/mirror' },
  { id: 'link', icon: 'i-mdi-link', accent: 'logic', nameKey: 'game.link', url: '/pages/link/link' },
  { id: 'crush', icon: 'i-mdi-star-four-points', accent: 'logic', nameKey: 'game.crush', url: '/pages/crush/crush' },
  { id: 'detective', icon: 'i-mdi-incognito', accent: 'memory', nameKey: 'game.detective', url: '/pages/detective/detective' },
  { id: 'hunter', icon: 'i-mdi-target', accent: 'memory', nameKey: 'game.hunter', url: '/pages/hunter/hunter' },
  { id: 'puzzle', icon: 'i-mdi-puzzle', accent: 'logic', nameKey: 'game.puzzle', url: '/pages/puzzle/puzzle' },
  { id: 'click', icon: 'i-carbon-idea', accent: 'logic', nameKey: 'game.click', url: '/pages/click/click' },
  { id: 'master', icon: 'i-mdi-layers-triple', accent: 'memory', nameKey: 'game.master', url: '/pages/master/master' },
  { id: 'slide', icon: 'i-mdi-arrow-all', accent: 'logic', nameKey: 'game.slide', url: '/pages/slide/slide' },
  { id: 'sort', icon: 'i-mdi-test-tube', accent: 'logic', nameKey: 'game.sort', url: '/pages/sort/sort' },
  { id: 'alchemy', icon: 'i-mdi-flask-outline', accent: 'card', nameKey: 'game.alchemy', url: '/pages/alchemy/alchemy' },
  { id: 'solo', icon: 'i-dinkie-icons-red-dragon-mahjong', accent: 'card', nameKey: 'game.solo', url: '/pages/solo/solo' },
];

// 每行格数：web 是 4/3/4/3…（25 个游戏正好铺满）。
// 目前只迁移了 4 个游戏，若照 4/3 排就是「一排 4 个」，看不出蜂窝咬合 →
// 游戏数 ≤ 4 时用 3 + 1（第二行半格错位），能直接看出蜂窝；超过 4 个自动回到 web 的 4/3/4/3…
const ROW_SIZES = games.length <= 4 ? [3, 1] : [4, 3, 4, 3, 4, 3, 4];
const rows = computed(() => {
  const groups = [];
  let i = 0;
  for (const size of ROW_SIZES) {
    groups.push(games.slice(i, i + size));
    i += size;
  }
  if (i < games.length) groups.push(games.slice(i));
  return groups
    .filter(group => group.length)
    .map((group, idx, arr) => ({
      list: group,
      offset: idx > 0 && group.length % 2 === arr[idx - 1].length % 2,
    }));
});

// ---------- 入场动画（逐字节照抄 web 的 HomePage.vue） ----------
// 延迟由 id 哈希派生（同一局内确定、不同格子互不相同），
// 整体延迟 350ms 起跳（等页面级过渡先完成），~1.5s 内先后稳定
const ENTER_BASE = 350;  // 整体起跳基础延迟（页面过渡 300ms 完成后）
const ENTER_SPREAD = 400; // 各格起跳延迟的最大散布（ms）

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function enterStyle(id) {
  const h = hash(id);
  const delay = ENTER_BASE + (h % ENTER_SPREAD);
  const duration = 520 + (h % 160); // 520~680ms，各格时长略不同
  return {
    animationDelay: `${delay}ms`,
    animationDuration: `${duration}ms`,
  };
}

// 入场跳动**只在首次进入时播一次**：播完（最长延迟 749ms + 时长 679ms ≈ 1.5s）就把动画永久关掉。
// 为什么必须这样：页面被切走再回来时，浏览器会把 CSS 动画**从头重放**（元素 display:none 再显示时
// 动画时钟归零）→ 从游戏返回首页会又跳一遍 ✗（H5 实测返回到 60ms 时 opacity 还是 0）。
// 把 animation 置 none（`.hex.no-intro`）之后，返回时就是静态的 ✓。
const introDone = ref(false);
let introTimer = null;
onMounted(() => {
  introTimer = setTimeout(() => { introDone.value = true; }, 1600);
});
onUnmounted(() => { if (introTimer) clearTimeout(introTimer); });

function open(g) {
  uni.navigateTo({ url: g.url });
}
</script>

<style lang="scss" scoped>
/* 尺寸全部用 rpx：一行 4 格 = 750 - 左右 32×2 - 缝隙 6×3 = 640 → 每格 160rpx
   （高度 = 宽 × 1.1547 ≈ 185rpx，与 web 的正六边形比例一致） */
$hex-w: 160rpx;
$hex-h: 185rpx;
$gap: 6rpx;

/* ---------- 分类强调色（照 web 的 src/App.vue，body 上的亮色一套） ----------
   web 首页把每个游戏的 accent 映射成 --accent-<分类>，实际用在三处：
     .hex          background: color-mix(in srgb, var(--accent, var(--tile-border-color)) 18%, var(--tile-border-color));
     .hex-body i   color: var(--accent, var(--primary-bg));      ← 图标
     .hex:active   background: var(--accent)（内层 .hex-body 换 --enter-bg）
   小程序只做亮色，色值与 web 一字不差（#23804e / #2c6aad / #7550ad / #bd5420 / #8f6419）。
   WXSS 不支持 color-mix，所以六边形描边那层 18% 混合按同一份 sRGB 通道预先算好
   （结果与浏览器 color-mix(in srgb, ... 18%, ...) 的渲染值一致，见下面的 acc-* 规则）。 */
$accent-logic: #23804e;   /* web: --accent-logic  */
$accent-number: #2c6aad;  /* web: --accent-number */
$accent-memory: #7550ad;  /* web: --accent-memory */
$accent-action: #bd5420;  /* web: --accent-action */
$accent-card: #8f6419;    /* web: --accent-card   */
$tile-border: #c9d0da;    /* web: --tile-border-color */

/* 六边形描边 = web 的 color-mix(in srgb, var(--accent) 18%, var(--tile-border-color))。
   WXSS 不支持 color-mix，这里按同一份 sRGB 通道混合预计算（18% accent + 82% #c9d0da，四舍五入）：
     logic #abc2c1 / number #adbed2 / memory #bab9d2 / action #c7bab9 / card #bfbdb7
   图标本身吃完整的 --accent（web: .hex-body i { color: var(--accent, var(--primary-bg)) }）。 */
.hex.acc-logic {
  --accent: #{$accent-logic};
  background: #abc2c1;
}
.hex.acc-number {
  --accent: #{$accent-number};
  background: #adbed2;
}
.hex.acc-memory {
  --accent: #{$accent-memory};
  background: #bab9d2;
}
.hex.acc-action {
  --accent: #{$accent-action};
  background: #c7bab9;
}
.hex.acc-card {
  --accent: #{$accent-card};
  background: #bfbdb7;
}

/* 自定义导航栏（pages.json 里首页 navigationStyle: custom）→ 自己垫安全区、居中放图标 */
.home-header {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  margin-top: env(safe-area-inset-top);
}
/* web 的 .logo 是 28px；56rpx = 28px */
.home-logo {
  display: block;
  width: 56rpx;
  height: 56rpx;
  border-radius: 14rpx;
}

.page {
  min-height: 100vh;
  /* 顶栏已经有游戏图标了 → 蜂窝**整体居中**（与屏幕中心对齐）。
     底部内边距 = 顶部 40rpx + 顶栏高度 88rpx：把顶栏占掉的那段在下方补回来，
     这样居中的是「蜂窝本身」，而不是「顶栏 + 蜂窝」这一块。 */
  padding: 40rpx 32rpx 128rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
  background: transparent;  /* 背景交给 ParticleBackground（画布透明，页面根铺底色） */
}
.honeycomb {
  display: flex;
  flex-direction: column;
  align-items: center;
}
/* 首次入场动画播完后永久关闭：从游戏返回首页不再重播 */
.hex.no-intro {
  animation: none;
}
.hex-row {
  display: flex;
  gap: $gap;
}
/* 行间垂直重叠 1/4 高 + 一点余量，让斜边之间留出与水平缝隙一致的间隙 */
.hex-row:not(:first-child) {
  margin-top: -40rpx;
}
.hex-row.offset {
  transform: translateX(calc(#{$hex-w} / 2 + #{$gap} / 2));
}

/* 尖顶六边形：外层描边色，内层缩进后铺白底（web 的双层实现） */
.hex {
  /* 入场逐格跳动：名字 / 曲线 / fill-mode 固定，延迟与时长由 JS 按 id 哈希内联下发（web 的 enterStyle）。
     fill-mode: backwards = 延迟期间停在 0%（透明 + scale .82），到点才弹出来（与 web 一致）。
     时长 / 延迟这里各给一个兜底值，真实值走 :style，不要用 animation 简写（会被内联值覆盖、看不清哪层生效）。 */
  animation-name: hex-pop;
  animation-duration: 400ms;
  animation-delay: 0ms;
  animation-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
  animation-fill-mode: backwards;
  position: relative;
  width: $hex-w;
  height: $hex-h;
  /* 没有 accent 时的兜底 = web 的 var(--tile-border-color) */
  background: $tile-border;
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
}
/* 逐格弹入（web 的 hex-pop 同款关键帧，比例不要改） */
@keyframes hex-pop {
  0% { transform: scale(0.82); opacity: 0; }
  55% { transform: scale(1.09); opacity: 1; }
  78% { transform: scale(0.97); }
  100% { transform: scale(1); }
}
.hex-body {
  position: absolute;
  top: 4rpx;
  bottom: 4rpx;
  left: 5rpx;
  right: 5rpx;
  box-sizing: border-box;
  padding: 30rpx 0 18rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  background: #fff;
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
}
/* web: .hex-body i { color: var(--accent, var(--primary-bg)) } —— 图标本体吃分类强调色 */
.hex-icon {
  font-size: 56rpx;
  color: var(--accent, #23804e);
  line-height: 1;
}
.game-name {
  font-size: 20rpx;
  font-weight: 600;
  color: #333;
  line-height: 1.2;
  text-align: center;
  white-space: nowrap;
}
</style>
