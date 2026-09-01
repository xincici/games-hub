<template>
  <span class="timer">
    <i i-carbon-timer />
    {{ timeStr }}
  </span>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';

defineExpose({
  reset,
  stop,
  start,
  restore,
  seconds: () => time.value,
});

const props = defineProps(['enable', 'onTick']);

const time = ref(0);
let intervalTimer = null;

const timeStr = computed(() => {
  const sec = time.value;
  return ('00' + ~~(sec / 60)).slice(-2) + ':' + ('00' + sec % 60).slice(-2);
});

onMounted(() => {
  onListener('add');
  start();
});

onUnmounted(() => {
  onListener('remove');
});

function reset() {
  stop();
  time.value = 0;
  start();
}
function stop() {
  if (intervalTimer) clearInterval(intervalTimer);
  intervalTimer = null;
}
function start() {
  if (intervalTimer) return;
  intervalTimer = setInterval(() => {
    time.value += 1;
    props.onTick?.(time.value);
  }, 1000);
}
function restore(sec) {
  stop();
  time.value = sec || 0;
  start();
}
function onListener(opt) {
  document[`${opt}EventListener`]('visibilitychange', listenerFn);
}
function listenerFn() {
  if (document.hidden) stop();
  else if (props.enable) start();
}
</script>

<style scoped lang="scss">
.timer {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
</style>
