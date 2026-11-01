// 简化版全站粒子连线背景（web / 小程序是完整粒子 + 过山车；小游戏首版保留粒子连线，
// 不抢占内容层，也不拦截触摸）。
const { W, H } = require('./canvas');

const LINK_DIST = 120;
const AREA_PER_PARTICLE = 9000;
const MIN = 18;
const MAX = 54;

class ParticleField {
  constructor() {
    const count = Math.min(MAX, Math.max(MIN, Math.round((W * H) / AREA_PER_PARTICLE)));
    this.particles = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: 1.1 + Math.random() * 1.1,
    }));
  }

  update(dt) {
    const step = Math.min(32, dt) / 16.67;
    this.particles.forEach((p) => {
      p.x += p.vx * step;
      p.y += p.vy * step;
      if (p.x < -10) p.x = W + 10;
      if (p.x > W + 10) p.x = -10;
      if (p.y < -10) p.y = H + 10;
      if (p.y > H + 10) p.y = -10;
    });
  }

  draw(c, dark) {
    const dot = dark ? 'rgba(190,205,225,0.34)' : 'rgba(90,112,140,0.36)';
    const line = dark ? 'rgba(170,195,225,0.18)' : 'rgba(118,140,172,0.2)';
    for (let i = 0; i < this.particles.length; i++) {
      const a = this.particles[i];
      for (let j = i + 1; j < this.particles.length; j++) {
        const b = this.particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > LINK_DIST * LINK_DIST) continue;
        const alpha = 1 - Math.sqrt(d2) / LINK_DIST;
        c.strokeStyle = line;
        c.globalAlpha = alpha;
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
        c.stroke();
      }
    }
    c.globalAlpha = 1;
    c.fillStyle = dot;
    this.particles.forEach((p) => {
      c.beginPath();
      c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      c.fill();
    });
  }
}

module.exports = ParticleField;
