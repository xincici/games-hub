// 一点点全局 UI 状态（目前只有「设置浮层开没开」）。
// 单独放一个文件，是为了不让 settings.js（纯配置）掺进界面状态。
import { ref } from 'vue';

export const settingsOpen = ref(false);
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
  settingsOpen.value = true;
}

export function closeSettings() {
  settingsOpen.value = false;
}
