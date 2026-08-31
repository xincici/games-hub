<template>
  <span
    :class="{
      'card-wrapper': true,
      'card-wrapper-mini': mini,
    }"
  >
    <Transition name="rotate">
      <span
        v-if="isBack && !mini"
        class="card"
      >
        <span class="card-back"></span>
        <span class="card-type">
          <i i-mdi-cards-playing class="card-type-back" />
        </span>
      </span>
      <span
        v-else
        :class="{
          card: true,
          'card-red': isRed,
          'card-hold': hold,
          'card-joker': isJoker,
        }"
      >
        <span class="card-num card-num-top" v-if="!isBack">{{ point }}</span>
        <span class="card-num card-num-bottom" v-if="!isBack">{{ point }}</span>
        <span class="card-back" v-if="isBack"></span>
        <span class="card-type">
          <i i-mdi-account-cowboy-hat v-if="isJoker" />
          <i i-mdi-cards-playing v-else-if="isBack" class="card-type-back" />
          <i i-mdi-cards-heart v-else-if="type === 'heart'" />
          <i i-mdi-cards-diamond v-else-if="type === 'diamond'" />
          <i i-mdi-cards-spade v-else-if="type === 'spade'" />
          <i i-mdi-cards-club v-else-if="type === 'club'" />
        </span>
      </span>
    </Transition>
  </span>
</template>

<script setup>
import { computed } from 'vue';

// 牌点数对应的展示内容
const NUMS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'JOKER'];

const props = defineProps(['num', 'type', 'hold', 'mini']);

const isBack = computed(() => !props.num || !props.type);

const isRed = computed(() => ['heart', 'diamond'].includes(props.type));

const isJoker = computed(() => props.num === 14);

const point = computed(() => props.num ? NUMS[props.num - 1] : '');

</script>

<style scoped lang="scss">
.card-wrapper {
  --width: 60px;
  --height: 90px;
  --margin: 5px;
  --radius: 4px;
  --pos: 3px;
  --text-size: 16px;
  --icon-size: 36px;
  --back-size: 42px;
  &-mini {
    --width: 40px;
    --height: 60px;
    --margin: 3px;
    --radius: 3px;
    --pos: 1px;
    --text-size: 12px;
    --icon-size: 20px;
    --back-size: 26px;
  }
}

.rotate-enter-active {
  transition: transform .125s linear .125s;
}
.rotate-leave-active {
  transition: transform .125s linear 0s;
}
.rotate-enter-from,
.rotate-leave-to{
  transform: rotateY(90deg);
}
.rotate-enter-to,
.rotate-leave-from {
  transform: rotateY(0deg);
}

.card-wrapper {
  display: inline-block;
  position: relative;
  width: var(--width);
  height: var(--height);
  margin: var(--margin);
}
.card {
  display: inline-block;
  position: absolute;
  top: 0;
  left: 0;
  width: var(--width);
  height: var(--height);
  border: 1px solid var(--card-border-color, var(--border-color));
  border-radius: var(--radius);
  margin: 0;
  background: #fafafa;
  color: #111;
  cursor: pointer;
  overflow: hidden;
  &-red {
    color: #e00;
  }
  &-joker {
    .card-num {
      width: 1em;
      font-size: 11px;
      word-break: break-all;
      line-height: 0.85;
      &-top {
        left: 1px;;
      }
      &-bottom {
        right: 1px;
      }
    }
  }
  &-hold {
    outline: 3px solid #e00;
  }
  &-num {
    position: absolute;
    font-size: var(--text-size);
    font-weight: bold;
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
  &-type {
    position: absolute;
    top: 50%;
    left: 50%;
    font-size: var(--icon-size);
    font-weight: bold;
    transform: translate(-50%, -50%);
    &-back {
      font-size: var(--back-size);
    }
  }
  &-back {
    position: absolute;
    width: 96%;
    height: 96%;
    left: 2%;
    top: 2%;
    box-sizing: border-box;
    border: 1px dotted #eee;
    border-radius: var(--radius);
    background: radial-gradient(circle, #9a9a9a .2px, transparent .5px);
    background-repeat: repeat;
    background-size: 5% 5%;
  }
}
</style>

