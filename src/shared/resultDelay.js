// 各游戏共用的「结算前停留」（Emoji 侦探 / Emoji 猎手在用）：
// 最后一次选择之后先停一下，让玩家看清结果（答对的高亮 / 答错的红标与抖动）再弹结算浮层。
//
// 用法：
//   const { pending, later, cancel } = useResultDelay();       // pending = 正在停留
//   点选处理开头：if (phase.value !== ANSWER || pending.value) return;   // 停留期间不可操作
//   要结算时：    later(() => { phase.value = WON; ... });
//   换关 / 卸载时：cancel()（组件卸载已自动 cancel 一次）
//
// 停留期间由调用方自己锁输入 —— pending 只是个标志，它不碰 phase，
// 所以画面停在上一次选择的结果上，不会被别的分支顺手改成结算态。

import { onUnmounted, ref } from 'vue';

// 停留时长：0.5s
export const RESULT_DELAY_MS = 500;

export function useResultDelay(stepMs = RESULT_DELAY_MS) {
  const pending = ref(false);
  let timer = 0;

  const cancel = () => {
    clearTimeout(timer);
    timer = 0;
    pending.value = false;
  };

  // 先进入停留态（锁输入），stepMs 之后再执行结算
  const later = fn => {
    pending.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = 0;
      pending.value = false;
      fn();
    }, stepMs);
  };

  onUnmounted(cancel);
  return { pending, later, cancel };
}
