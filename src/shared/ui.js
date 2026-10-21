// 一点点全局 UI 状态（目前只有「设置浮层开没开」）。
// 单独放一个文件，是为了不让 settings.js（纯配置）掺进界面状态。
import { ref } from 'vue';

export const settingsOpen = ref(false);
// 「正把圆心无过渡地挪到位」——此时浮层临时关掉 transition（否则改圆心本身就会触发一次过渡）
export const settingsSnapping = ref(false);
let openRaf = 0;
// 点击时那颗设置按钮的**视口矩形**：
// - x / y 当圆形扩张的圆心
// - left / top / width / height 让浮层里的关闭按钮**落在完全相同的位置**（不靠 hard-code 的 top/right 去猜）
export const settingsOrigin = ref({
  x: 0, y: 0, left: 0, top: 0, width: 34, height: 34,
});

export function openSettings(el) {
  if (el && typeof el.getBoundingClientRect === 'function') {
    const r = el.getBoundingClientRect();
    settingsOrigin.value = {
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
    };
  }
  // ⚠️ 这里分三步，缺一步第一次打开就会「从左上角滚过来」（用户报过）：
  // ① 先收拢，并**临时关掉 transition** —— 否则光改圆心（clip-path 的值变了）就会触发一次过渡，
  //    圆心从 (0,0) 缓动到按钮，看起来就是从屏幕左上角飞过来；
  // ② 双 rAF：让浏览器把「无过渡 + 圆心已在按钮」这一帧真的画出来；
  // ③ 再恢复过渡并打开 —— 于是过渡的起点就是那颗按钮。
  cancelAnimationFrame(openRaf);
  settingsSnapping.value = true;
  settingsOpen.value = false;
  openRaf = requestAnimationFrame(() => {
    openRaf = requestAnimationFrame(() => {
      openRaf = 0;
      settingsSnapping.value = false;
      settingsOpen.value = true;
    });
  });
}

export function closeSettings() {
  cancelAnimationFrame(openRaf);
  openRaf = 0;
  settingsSnapping.value = false;
  settingsOpen.value = false;
}
