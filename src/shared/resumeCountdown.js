// 各游戏共用的「继续前的倒数」（贪吃蛇 / Emoji 下坠在用）：
// 点「继续」之后先保持冻结、在盘面中央数 3 → 2 → 1，数完才真正恢复游戏，
// 免得玩家一点继续就被已经在跑的节奏打个措手不及。
//
// 用法：
//   const { count, begin, cancel } = useResumeCountdown(() => { 真正恢复游戏 });
//   count 为 0 表示没在倒数，3 / 2 / 1 表示当前正在显示的数字，
//   调用方在 count > 0 期间要继续保持冻结（暂停状态不要提前解除）。
import { ref, onUnmounted } from 'vue';

export const RESUME_STEP_MS = 800;   // 每个数字停留多久

export function useResumeCountdown(onDone, stepMs = RESUME_STEP_MS) {
  const count = ref(0);
  let timer = null;

  function cancel() {
    if (timer) clearInterval(timer);
    timer = null;
    count.value = 0;
  }

  function begin(from = 3) {
    cancel();
    count.value = from;
    timer = setInterval(() => {
      count.value -= 1;
      if (count.value > 0) return;
      cancel();
      onDone();
    }, stepMs);
  }

  onUnmounted(cancel);

  return { count, begin, cancel };
}
