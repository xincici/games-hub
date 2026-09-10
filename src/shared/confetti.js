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
