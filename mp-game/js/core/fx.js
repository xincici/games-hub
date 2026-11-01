// 选错 / 选对的统一反馈：
// - 选错：约 350ms 水平晃动，幅度逐渐衰减；
// - 选对：约 450ms 的一次性弹一下（放大 → 回弹 → 复位），不循环。
function wrongShake(age, duration = 350, amplitude = 4) {
  if (!Number.isFinite(age) || age < 0 || age >= duration) return 0;
  return Math.sin(age / 22) * amplitude * (1 - age / duration);
}

function popScale(age, duration = 450) {
  if (!Number.isFinite(age) || age < 0 || age >= duration) return 1;
  const p = age / duration;
  // 参考小程序 pick-right-pop：1 → 1.18 → 0.96 → 1.04 → 1
  if (p < 0.30) return 1 + 0.18 * (p / 0.30);
  if (p < 0.58) return 1.18 - 0.22 * ((p - 0.30) / 0.28);
  if (p < 0.78) return 0.96 + 0.08 * ((p - 0.58) / 0.20);
  return 1.04 - 0.04 * ((p - 0.78) / 0.22);
}

module.exports = { wrongShake, popScale };
