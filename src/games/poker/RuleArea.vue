<template>
  <div class="rule-area">
    <div v-for="item in rulesList" :key="item.times" class="rule">
      <span>{{ i18n(item.key) }}</span>
      <span>{{ item.times }} {{ i18n('times') }}</span>
    </div>
    <div v-if="winRule" class="win-mask">
      <div class="win-title">{{ i18n(winRule.key) }}</div>
      <div class="win-times">{{ winRule.times }} {{ i18n('times') }}</div>
      <div
        v-for="(burst, bi) in bursts"
        :key="bi"
        class="firework"
        :style="{ left: burst.left, top: burst.top, '--burst-delay': burst.delay }"
      >
        <span
          v-for="(p, pi) in burst.particles"
          :key="pi"
          class="particle"
          :style="{
            '--dx': p.dx,
            '--dy': p.dy,
            '--p-color': p.color,
            '--p-delay': p.delay,
          }"
        ></span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

import { rulesList } from './rules.js';

const props = defineProps(['result']);

const winRule = computed(() => rulesList.find(item => item.times === props.result));

const COLORS = ['#ffd700', '#ff5e5e', '#6ee7ff', '#7cff6e', '#ff9df6'];
const PARTICLE_COUNT = 14;

const bursts = [
  { left: '22%', top: '35%' },
  { left: '50%', top: '25%' },
  { left: '78%', top: '40%' },
  { left: '35%', top: '70%' },
  { left: '65%', top: '65%' },
].map((pos, i) => ({
  ...pos,
  delay: `${i * 0.3}s`,
  particles: Array.from({ length: PARTICLE_COUNT }, (_, j) => {
    const angle = (Math.PI * 2 * j) / PARTICLE_COUNT + Math.random() * 0.3;
    const dist = 35 + Math.random() * 20;
    return {
      dx: `${Math.cos(angle) * dist}px`,
      dy: `${Math.sin(angle) * dist}px`,
      color: COLORS[(i + j) % COLORS.length],
      delay: `${Math.random() * 0.15}s`,
    };
  }),
}));

</script>

<style scoped lang="scss">
@keyframes pop-in {
  from {
    transform: scale(0.3);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
@keyframes explode {
  0% {
    transform: translate(0, 0) scale(1);
    opacity: 0;
  }
  8% {
    opacity: 1;
  }
  70% {
    opacity: 1;
  }
  100% {
    transform: translate(var(--dx), var(--dy)) scale(0.2);
    opacity: 0;
  }
}

.rule-area {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  padding: 15px 0;
  overflow: hidden;
  .rule {
    flex: 1 0 50%;
    line-height: 1.8;
    display: flex;
    padding: 0;
    box-sizing: border-box;
    justify-content: space-between;
    padding: 0 10px;
    &:nth-child(odd) {
      padding-right: 15px;
    }
    &:nth-child(even) {
      padding-left: 15px;
    }
  }
  .win-mask {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: var(--mask-color);
    overflow: hidden;
    .win-title {
      font-size: 30px;
      font-weight: bold;
      color: #f5b52e;
      text-shadow: 0 0 8px rgba(245, 181, 46, 0.6);
      animation: 0.4s ease-out 0s 1 backwards pop-in;
    }
    .win-times {
      font-size: 16px;
      font-weight: bold;
      color: #f5b52e;
      animation: 0.4s ease-out 0.15s 1 backwards pop-in;
    }
    .firework {
      position: absolute;
      .particle {
        position: absolute;
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: var(--p-color);
        box-shadow: 0 0 6px var(--p-color);
        animation: 1.4s ease-out 0s infinite explode;
        animation-delay: calc(var(--burst-delay) + var(--p-delay));
      }
    }
  }
}
</style>
