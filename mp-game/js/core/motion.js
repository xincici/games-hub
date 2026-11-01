// 配对消除动画的统一节奏（与 web 对对碰的 flash / blink / clear 对齐）：
//   0    ~ 450ms 缩放脉冲两下（1 → 1.08 → 1 → 1.08 → 1）
//   450  ~ 1050ms 闪烁两次（每次亮 → 暗 → 亮）
//   1050 ~ 1400ms 缩到 0
// 以后同类「配对闪烁消失」必须复用这个函数，不要每帧按固定间隔硬切 opacity：
// 80ms 一翻会产生 7 次以上明暗变化，视觉上就是“疯狂闪”。
const FLASH_MS = 450;
const BLINK_MS = 600;
const CLEAR_MS = 350;
const TOTAL_MS = FLASH_MS + BLINK_MS + CLEAR_MS;

function matchedMotion(age) {
  if (age >= TOTAL_MS) return { scale: 0, alpha: 0, done: true };
  if (age < FLASH_MS) {
    // abs(sin) 在一个周期内有两个峰；两个峰之间回 1，恰好是两下缩放
    return { scale: 1 + 0.08 * Math.abs(Math.sin((age / FLASH_MS) * Math.PI * 2)), alpha: 1, done: false };
  }
  if (age < FLASH_MS + BLINK_MS) {
    const p = (age - FLASH_MS) / BLINK_MS;
    // 两暗两亮：p=0 / .5 / 1 为亮，.25 / .75 为暗
    const alpha = 0.15 + 0.85 * Math.abs(Math.cos(p * Math.PI * 2));
    return { scale: 1, alpha, done: false };
  }
  const p = (age - FLASH_MS - BLINK_MS) / CLEAR_MS;
  return { scale: Math.max(0, 1 - p), alpha: 1, done: false };
}

module.exports = { matchedMotion, FLASH_MS, BLINK_MS, CLEAR_MS, TOTAL_MS };
