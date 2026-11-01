// 胜利烟花：从屏幕两侧底部喷出，落点分散、大小/形状/速度/重力都随机。
// 不再固定飞向屏幕中线附近，避免所有碎片挤成一团。
const COLORS = ['#5D8C7B', '#F2D091', '#F2A679', '#D9695F', '#8C4646', '#4F7EA8', '#B78AC7'];
const SHAPES = ['rect', 'circle', 'ribbon', 'triangle'];

function spawn(list, opts) {
  const o = opts || {};
  const W = o.W || 375;
  const H = o.H || 667;
  const startY = o.startY == null ? H * 0.58 : o.startY;
  const count = o.count || 9;
  for (let i = 0; i < count; i++) {
    const side = i % 2;
    const gravity = 0.24 + Math.random() * 0.2;
    const rise = 150 + Math.random() * 330;
    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const base = 3 + Math.random() * 7;
    const w = shape === 'ribbon' ? base * (1.3 + Math.random() * 0.8) : base;
    const h = shape === 'ribbon' ? 2 + Math.random() * 2.5 : 2 + Math.random() * 6;
    list.push({
      x: side ? W + 8 + Math.random() * 20 : -8 - Math.random() * 20,
      y: startY + (Math.random() - 0.5) * H * 0.24,
      side,
      targetX: W * (0.1 + Math.random() * 0.8),
      vx: (side ? -1 : 1) * (2.2 + Math.random() * 4.8),
      vy: -Math.sqrt(2 * gravity * rise) - Math.random() * 1.6,
      gravity,
      vr: (Math.random() - 0.5) * 0.42,
      rot: Math.random() * Math.PI * 2,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      shape, w, h,
      age: 0,
      life: 1500 + Math.random() * 900,
    });
  }
}

function update(list, dt, H) {
  const step = Math.min(50, dt || 16) / 16.67;
  list.forEach((p) => {
    const target = p.targetX != null ? p.targetX : 187.5;
    if (p.side === 0 && p.x >= target) { p.x = target; p.vx = (Math.random() - 0.5) * 0.35; }
    if (p.side === 1 && p.x <= target) { p.x = target; p.vx = (Math.random() - 0.5) * 0.35; }
    p.x += p.vx * step;
    p.y += p.vy * step;
    p.vy += (p.gravity || 0.32) * step;
    p.rot += p.vr * step;
    p.age += dt || 16;
  });
  return list.filter(p => p.y < H + 40 && p.age < (p.life || 2400));
}

function draw(c, list) {
  list.forEach((p) => {
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.rot);
    c.fillStyle = p.color;
    const w = p.w || 4;
    const h = p.h || 3;
    if (p.shape === 'circle') {
      c.beginPath();
      c.arc(0, 0, Math.max(1.2, w * 0.42), 0, Math.PI * 2);
      c.fill();
    } else if (p.shape === 'triangle') {
      c.beginPath();
      c.moveTo(0, -h / 2);
      c.lineTo(w / 2, h / 2);
      c.lineTo(-w / 2, h / 2);
      c.closePath();
      c.fill();
    } else {
      c.fillRect(-w / 2, -h / 2, w, h);
    }
    c.restore();
  });
}

module.exports = { spawn, update, draw, COLORS };
