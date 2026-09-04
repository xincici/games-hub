/*
 * @Author      : linye
 * @Created At  : 2023-05-06 17:58:13
 * @Description : 
 */

import confetti from 'canvas-confetti';

const colors = [
  '#5D8C7B',
  '#F2D091',
  '#F2A679',
  '#D9695F',
  '#8C4646',
];

export default function() {
  const end = Date.now() + 1200;
  (function frame() {
    confetti({
      colors,
      particleCount: 5,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
    });
    confetti({
      colors,
      particleCount: 5,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
    });
  
    if (Date.now() < end) {
      setTimeout(frame, 40);
    }
  }());
}
