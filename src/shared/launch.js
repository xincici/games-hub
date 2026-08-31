// 记录启动/返回动画的缩放原点（点击的卡片图标在视口中的位置）
export function setLaunchOrigin(el) {
  const rect = el?.getBoundingClientRect();
  if (!rect) return;
  const root = document.documentElement.style;
  root.setProperty('--launch-x', `${rect.left + rect.width / 2}px`);
  root.setProperty('--launch-y', `${rect.top + rect.height / 2}px`);
}
