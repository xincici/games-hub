<template>
  <!-- 扑克牌面（严格照 web 的 src/games/poker/CardItem.vue）
       web 的翻面**不是**两面常驻的 3D，而是「一个节点 + <Transition name="rotate">」：
         旧内容 0.125s 转到 rotateY(90deg)（看不见了）→ 换内容 → 从 rotateY(-90deg) 0.125s 转回 0。
       小程序没有 <Transition>，这里用「一个节点 + 三个 class（out / snap / in）+ 定时器」复刻同一时序：
         .out  → rotateY(90deg)，transition .125s linear（旧面转出去）
         .snap → 无过渡，瞬间复位到 rotateY(-90deg)（同时换内容，此刻牌侧立看不见）
         .in   → rotateY(0deg)，transition .125s linear（新面转回来）
     花色用文字（♠♥♦♣）+ CSS 上色；牌背用同一套 UnoCSS 图标。 -->
  <view class="card-wrapper" :class="{ 'card-wrapper-mini': mini, quick }" @click="onTap">
    <view class="card" :class="[rot, { 'card-red': isRed, 'card-hold': hold, 'card-joker': isJoker }]">
      <template v-if="showFront">
        <text class="card-num card-num-top">{{ point }}</text>
        <text class="card-num card-num-bottom">{{ point }}</text>
        <view class="card-type">
          <view v-if="isJoker" class="card-ico i-mdi-account-cowboy-hat" />
          <text v-else class="card-suit">{{ suit }}</text>
        </view>
      </template>
      <template v-else>
        <PokerBack :icon-size="mini ? 50 : 80" />
      </template>
    </view>
  </view>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue';

import PokerBack from '@/components/PokerBack.vue';

// 牌点数对应的展示内容
const NUMS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'JOKER'];
// 花色直接用文字画（小程序不引图片，也不依赖 mdi 花色图标）
const SUITS = { spade: '♠', club: '♣', heart: '♥', diamond: '♦' };

// ⚠️ 小程序的自定义组件属性会按声明类型转换，所以类型要单一（web 里牌背的 num 是 ''，
// 这里统一成 0）：页面侧用 numOf() 把 '' 折成 0 再传进来。
const props = defineProps({
  num: { type: Number, default: 0 },
  type: { type: String, default: '' },
  hold: { type: Boolean, default: false },
  mini: { type: Boolean, default: false },
  // 换牌时「所有牌同一拍盖到背面」的那一下：把 0.125s 压到 0.09s（之后逐张翻回仍是 0.125s）
  quick: { type: Boolean, default: false },
  // 发牌计数器：每发一次 +1，变化时重播一次翻转（同一张牌值复用节点时也要播）
  animate: { type: Number, default: 0 },
});

const emit = defineEmits(['pick']);

const isBack = computed(() => !props.num || !props.type);
const isRed = computed(() => ['heart', 'diamond'].includes(props.type));
const isJoker = computed(() => props.num === 14);
const point = computed(() => (props.num ? NUMS[props.num - 1] : ''));
const suit = computed(() => SUITS[props.type] || '');

// showFront：当前画的是正面还是牌背；rot：rotate 过渡的阶段（与 web 的 <Transition> 等价）
const showFront = ref(!isBack.value);
const rot = ref('');

const FLIP_MS = 125;              // web: transition: transform .125s linear（进出各一半）
const QUICK_MS = 90;              // 换牌时整体盖背面用更快的一档
const SNAP_FRAMES = 34;           // 换内容后等两帧再转回来（约 2×16ms）

let t1 = null;
let t2 = null;
function clearTimers() {
  if (t1) { clearTimeout(t1); t1 = null; }
  if (t2) { clearTimeout(t2); t2 = null; }
}

// 复刻 web 的 rotate 过渡；mini 牌（猜大小历史）不翻面，直接按当前正/背面渲染
function playFlip(front) {
  if (props.mini) {
    // 猜大小的牌背也是真实牌背：不能无条件 showFront，否则 num=0 的牌背会渲染成空白正面
    showFront.value = front;
    rot.value = '';
    return;
  }
  clearTimers();
  const ms = props.quick ? QUICK_MS : FLIP_MS;
  rot.value = 'out';                                  // 旧面转出去
  t1 = setTimeout(() => {
    showFront.value = front;                          // 侧立时换内容（看不见）
    rot.value = 'snap';                               // 无过渡复位到 -90°
    t2 = setTimeout(() => { rot.value = 'in'; }, SNAP_FRAMES);   // 再转回来
  }, ms);
}

// 正反两个方向都要处理（web 的 Transition 也是双向的）
watch(isBack, (back) => { playFlip(!back); }, { immediate: false });
// 同一张牌值复用节点时（换牌抽到同点数），靠 animate 计数器强制再翻一次
watch(() => props.animate, (v) => { if (v) playFlip(!isBack.value); });

onUnmounted(clearTimers);

function onTap() {
  emit('pick');
}
</script>

<style lang="scss" scoped>
/* 尺寸按 web 的 px × 1.908 折成 rpx（393 宽）：大牌 60×90 → 104×156，mini 40×60 → 76×114。
   ⚠️ mini 牌**必须用小尺寸**（不是「大尺寸 + scale」）：猜大小区高度只有 200rpx，
   扣掉上下内边距后留给牌的只有 ~129rpx，大尺寸牌的布局盒 156rpx 会被 scroll-view 裁掉 ✗
   —— 这就是「猜大小的牌展示不全」的真正原因（web 也是用小尺寸 + 小号 CSS 变量）。 */
.card-wrapper {
  display: inline-block;
  position: relative;
  width: 104rpx;
  height: 156rpx;
  margin: 9rpx;
  --pos: 6rpx;
  --text-size: 31rpx;
  --icon-size: 69rpx;
  --back-size: 80rpx;
  --radius: 8rpx;
}
.card-wrapper-mini {
  width: 76rpx;
  height: 114rpx;
  margin: 6rpx;
  --pos: 2rpx;
  --text-size: 23rpx;
  --icon-size: 38rpx;
  --back-size: 50rpx;
  --radius: 6rpx;
}

/* 翻面：单节点 + 三段 class，与 web 的 .rotate-* 过渡逐条对应
   （web：enter-active 是 .125s linear .125s、leave-active 是 .125s linear 0s、
    进出端点都是 rotateY(±90deg) → 0） */
.card {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  border: 2rpx solid #dcdfe6;
  border-radius: var(--radius);
  background: #fafafa;
  color: #111;
  overflow: hidden;
  box-shadow: none;          /* 全局 .card 是白卡 token，扑克牌不是 */
  font-size: var(--text-size);
  transform: rotateY(0deg);
  transition: transform 0.125s linear;
  backface-visibility: visible;
}
.card-wrapper.quick .card {
  transition-duration: 0.09s;
}
.card.out {
  transform: rotateY(90deg);
}
/* 换内容的瞬间：无过渡地摆到另一侧，下一帧再靠 .in 转回 0 */
.card.snap {
  transition: none;
  transform: rotateY(-90deg);
}
.card.in {
  transform: rotateY(0deg);
}
.card-red {
  color: #e00;
}
/* web 是 outline: 3px solid #e00；小程序 outline 不稳，用同宽的 box-shadow 环 */
.card-hold {
  box-shadow: 0 0 0 6rpx #e00;
}
.card-num {
  position: absolute;
  font-size: var(--text-size);
  font-weight: bold;
  line-height: 1;
  &-top {
    top: var(--pos);
    left: var(--pos);
  }
  &-bottom {
    bottom: var(--pos);
    right: var(--pos);
    transform: rotate(180deg);
  }
}
.card-joker {
  .card-num {
    width: 1em;
    font-size: 21rpx;
    word-break: break-all;
    line-height: 0.85;
    &-top { left: 2rpx; }
    &-bottom { right: 2rpx; }
  }
}
.card-type {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: var(--icon-size);
  font-weight: bold;
}
.card-suit {
  display: block;
  font-size: var(--icon-size);
  line-height: 1;
  font-weight: bold;
}
.card-ico {
  display: inline-block;
}
</style>

<style>
/* 小程序里自定义组件的宿主节点默认没有宽高 / 是 block：
   牌要横排（card-area 是 flex，猜大小历史是 inline-block 行内），宿主必须是 inline-block。
   ⚠️ 必须是非 scoped 块（scoped 会被编译成 .data-v-xxx:host，小程序永远匹配不上）。 */
:host {
  display: inline-block;
  vertical-align: top;
}
</style>
