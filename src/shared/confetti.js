// 各游戏共用的撒花动画：左右两侧持续喷洒 1.2 秒（canvas-confetti 封装）
import confetti from 'canvas-confetti';

const COLORS = [
  '#5D8C7B',
  '#F2D091',
  '#F2A679',
  '#D9695F',
  '#8C4646',
];
const DURATION = 1200;
const FRAME_MS = 40;

export default function celebrate() {
  const end = Date.now() + DURATION;
  (function frame() {
    confetti({
      colors: COLORS,
      particleCount: 5,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
    });
    confetti({
      colors: COLORS,
      particleCount: 5,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
    });

    if (Date.now() < end) {
      setTimeout(frame, FRAME_MS);
    }
  }());
}

// 原地小爆发：用在「一局之内」的即时庆祝（消消乐的大连消 / 连锁），
// 与 celebrate 同一套配色，但只朝上方炸一次、不铺满全屏。
// intensity 越大粒子越多（调用方按消除规模传 1~3）
export function burstConfetti(intensity = 1) {
  confetti({
    colors: COLORS,
    particleCount: Math.min(110, Math.round(22 + 26 * intensity)),
    spread: 76,
    startVelocity: 34,
    gravity: 0.9,
    scalar: 0.9,
    ticks: 140,
    origin: { x: 0.5, y: 0.64 },
  });
}

