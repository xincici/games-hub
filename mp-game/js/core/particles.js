// 全站背景：一层「会呼吸的浅景」。
// 目标：比原来的点 + 连线更耐看，但绝不能抢内容 —— 全部低透明度、慢速、无高频闪烁。
//
// 四层（从下往上）：
//   ① 光斑 orbs   —— 4 团巨大的径向渐变，缓慢漂移 + 呼吸，色相 50 秒一轮缓慢漂移
//   ② 蜂窝 hexes  —— 呼应首页的六边形，12~16 个空心小蜂窝缓慢上浮、轻微自转（少数填色）
//   ③ 微尘 motes  —— 十几到二十几颗小点慢慢飘，约 1/4 画成四芒小星，个别会缓慢「呼吸」变亮
//   ④ 偶尔一颗流星 —— 每 9~16 秒划一颗，约 2.2 秒穿屏，带渐隐拖尾（画面上唯一会「动一下」的东西）
//
// 性能：每帧固定预算 —— 3 个渐变 + ~14 个六边形路径 + 20 个圆点 + 偶尔一条拖尾，
// 不随分辨率增长，也不做离屏合成（背景是第一个画的，填充率最便宜）。

const { W, H } = require('./canvas');

const MOTE_PER_AREA = 12000;
const MOTE_MIN = 14;
const MOTE_MAX = 24;
const HEX_COUNT = Math.max(12, Math.min(20, Math.round(W / 24)));
const COMET_MIN_MS = 9000;
const COMET_MAX_MS = 16000;

// 光斑配色：绿（主色）/ 蓝 / 紫，和首页 accent 呼应；色相按 50 秒一轮缓慢漂移，
// 这样「同一个背景」在不同时间会偏绿、偏蓝、偏紫，但不闪、不跳。
const PALETTE_LIGHT = [[18, 92, 58], [30, 74, 140], [86, 52, 140]];
const PALETTE_DARK = [[96, 214, 150], [120, 172, 236], [176, 150, 232]];
const HUE_CYCLE_MS = 50000;

function hexPath(c, cx, cy, r, rot) {
  c.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const a = rot + (Math.PI / 3) * i;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
}

class ParticleField {
  constructor() {
    this.time = 0;
    this.dark = false;

    this.orbs = [0, 1, 2, 3].map((i) => ({
      seed: i / 4 + Math.random() * 0.08,
      x: W * (0.15 + 0.24 * i) + (Math.random() - 0.5) * 40,
      y: H * (0.18 + 0.22 * i) + (Math.random() - 0.5) * 40,
      r: Math.max(110, Math.min(190, W * 0.42)),
      vx: (Math.random() - 0.5) * 0.006,
      vy: (Math.random() - 0.5) * 0.006,
      phase: Math.random() * Math.PI * 2,
      speed: 0.00016 + Math.random() * 0.00012,
    }));

    this.hexes = Array.from({ length: HEX_COUNT }, () => {
      const size = 9 + Math.random() * 18;
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        size,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.00035,
        vy: -(0.004 + Math.random() * 0.012),
        vx: (Math.random() - 0.5) * 0.006,
        alpha: 0.5 + Math.random() * 0.5,
        filled: Math.random() < 0.22,
        sparkle: Math.random() < 0.22,
        hueIdx: Math.floor(Math.random() * PALETTE_LIGHT.length),
      };
    });

    const motes = Math.min(MOTE_MAX, Math.max(MOTE_MIN, Math.round((W * H) / MOTE_PER_AREA)));
    this.motes = Array.from({ length: motes }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 0.8 + Math.random() * 1.4,
      vx: (Math.random() - 0.5) * 0.05,
      vy: (Math.random() - 0.5) * 0.05,
      phase: Math.random() * Math.PI * 2,
      speed: 0.0006 + Math.random() * 0.0009,
      base: 0.5 + Math.random() * 0.5,
      sparkle: Math.random() < 0.28,
    }));

    this.comet = null;
    this.cometIn = COMET_MIN_MS * (0.4 + Math.random());
  }

  update(dt) {
    const d = Math.min(32, Math.max(0, dt || 16));
    this.time += d;

    this.orbs.forEach((o) => {
      o.x += o.vx * d;
      o.y += o.vy * d;
      const pad = 40;
      if (o.x < -pad) o.x = W + pad;
      if (o.x > W + pad) o.x = -pad;
      if (o.y < -pad) o.y = H + pad;
      if (o.y > H + pad) o.y = -pad;
    });

    this.hexes.forEach((h) => {
      h.x += h.vx * d;
      h.y += h.vy * d;
      h.rot += h.spin * d;
      if (h.y < -h.size * 2) {
        h.y = H + h.size * 2;
        h.x = Math.random() * W;
      }
      if (h.x < -h.size * 2) h.x = W + h.size * 2;
      if (h.x > W + h.size * 2) h.x = -h.size * 2;
    });

    this.motes.forEach((m) => {
      m.x += m.vx * d;
      m.y += m.vy * d;
      if (m.x < -6) m.x = W + 6;
      if (m.x > W + 6) m.x = -6;
      if (m.y < -6) m.y = H + 6;
      if (m.y > H + 6) m.y = -6;
    });

    if (this.comet) {
      this.comet.t += d;
      if (this.comet.t >= this.comet.dur) this.comet = null;
    } else {
      this.cometIn -= d;
      if (this.cometIn <= 0) {
        // 从左上或右上斜穿出去，落点保证在屏外，避免停在中途
        const fromLeft = Math.random() < 0.5;
        const len = 220 + Math.random() * 120;
        const sx = fromLeft ? -40 : W + 40;
        const sy = -30 - Math.random() * 40;
        const ex = sx + (fromLeft ? len : -len);
        const ey = sy + len * (0.7 + Math.random() * 0.3);
        this.comet = { t: 0, dur: 2100 + Math.random() * 700, sx, sy, ex, ey };
        this.cometIn = COMET_MIN_MS + Math.random() * (COMET_MAX_MS - COMET_MIN_MS);
      }
    }
  }

  // 光斑当前颜色：沿调色板缓慢插值（50 秒一轮）
  orbRGB(o, dark) {
    const palette = dark ? PALETTE_DARK : PALETTE_LIGHT;
    const n = palette.length;
    const p = (this.time / HUE_CYCLE_MS + o.seed) % 1;
    const f = p * n;
    const a = palette[Math.floor(f) % n];
    const b = palette[(Math.floor(f) + 1) % n];
    const k = f - Math.floor(f);
    return [
      Math.round(a[0] + (b[0] - a[0]) * k),
      Math.round(a[1] + (b[1] - a[1]) * k),
      Math.round(a[2] + (b[2] - a[2]) * k),
    ];
  }

  // 光斑：几团巨大的径向渐变（每帧创建 4 个渐变，成本可以接受）
  drawOrbs(c, dark) {
    const breathe = 0.92 + 0.1 * Math.sin(this.time * 0.00045);
    this.orbs.forEach((o, i) => {
      const rgb = this.orbRGB(o, dark).join(',');
      const r = o.r * breathe * (1 + 0.06 * Math.sin(this.time * o.speed * 6 + o.phase));
      const peak = dark ? (i === 3 ? 0.13 : 0.21) : (i === 3 ? 0.17 : 0.3);
      const g = c.createRadialGradient(o.x, o.y, 0, o.x, o.y, r);
      g.addColorStop(0, `rgba(${rgb},${peak})`);
      g.addColorStop(0.5, `rgba(${rgb},${peak * 0.42})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      c.fillStyle = g;
      c.fillRect(o.x - r, o.y - r, r * 2, r * 2);
    });
  }

  drawHexes(c, dark) {
    this.hexes.forEach((h) => {
      const rgb = (dark ? PALETTE_DARK : PALETTE_LIGHT)[h.hueIdx].join(',');
      const pulse = 0.7 + 0.3 * Math.sin(this.time * 0.0008 + h.x * 0.01);
      const a = (dark ? 0.2 : 0.32) * h.alpha * pulse;
      hexPath(c, h.x, h.y, h.size, h.rot);
      if (h.filled) {
        c.fillStyle = `rgba(${rgb},${a * 0.8})`;
        c.fill();
      }
      c.strokeStyle = `rgba(${rgb},${a})`;
      c.lineWidth = 1;
      c.stroke();
    });
  }

  drawMotes(c, dark) {
    const rgb = dark ? '208,220,236' : '52,70,96';
    this.motes.forEach((m) => {
      const tw = 0.6 + 0.4 * Math.sin(this.time * m.speed * 6 + m.phase);
      const alpha = (dark ? 0.4 : 0.52) * m.base * tw;
      c.fillStyle = `rgba(${rgb},${alpha})`;
      if (m.sparkle) {
        // 四芒小星：两条细线 + 中心点，比圆点更有「活气」，但亮度同样很低
        const s = m.r * 2.6;
        c.strokeStyle = `rgba(${rgb},${alpha * 0.75})`;
        c.lineWidth = 0.8;
        c.beginPath();
        c.moveTo(m.x - s, m.y);
        c.lineTo(m.x + s, m.y);
        c.moveTo(m.x, m.y - s);
        c.lineTo(m.x, m.y + s);
        c.stroke();
      }
      c.beginPath();
      c.arc(m.x, m.y, m.r * (m.sparkle ? 0.8 : 1), 0, Math.PI * 2);
      c.fill();
    });
  }

  drawComet(c, dark) {
    if (!this.comet) return;
    const p = Math.min(1, this.comet.t / this.comet.dur);
    // 前 15% 淡入、后 35% 淡出，防止「凭空出现 / 突然消失」
    const fade = p < 0.15 ? p / 0.15 : p > 0.65 ? Math.max(0, (1 - p) / 0.35) : 1;
    const x = this.comet.sx + (this.comet.ex - this.comet.sx) * p;
    const y = this.comet.sy + (this.comet.ey - this.comet.sy) * p;
    const dx = (this.comet.ex - this.comet.sx) * 0.06;
    const dy = (this.comet.ey - this.comet.sy) * 0.06;
    const rgb = dark ? '206,226,255' : '48,70,100';
    const segs = 7;
    for (let i = segs; i >= 1; i -= 1) {
      const t = i / segs;
      c.strokeStyle = `rgba(${rgb},${(dark ? 0.28 : 0.38) * fade * (1 - t)})`;
      c.lineWidth = 2 * (1 - t * 0.7);
      c.beginPath();
      c.moveTo(x - dx * (t - 0.1), y - dy * (t - 0.1));
      c.lineTo(x - dx * t, y - dy * t);
      c.stroke();
    }
    c.fillStyle = `rgba(${rgb},${(dark ? 0.62 : 0.66) * fade})`;
    c.beginPath();
    c.arc(x, y, 1.8, 0, Math.PI * 2);
    c.fill();
  }

  draw(c, dark) {
    this.dark = !!dark;
    c.save();
    this.drawOrbs(c, dark);
    this.drawHexes(c, dark);
    this.drawMotes(c, dark);
    this.drawComet(c, dark);
    c.restore();
  }
}

module.exports = ParticleField;
