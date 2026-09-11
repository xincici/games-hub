<template>
  <canvas ref="canvasRef" class="particle-bg" aria-hidden="true" />
</template>

<script setup>
// 全站粒子连线背景：固定全屏、置于所有内容之下、不拦截任何交互。
// - 粒子之间距离小于 LINK_DIST 时连线，越近越明显
// - 指针（鼠标 / 触摸）附近 MOUSE_LINK_DIST 内的粒子会与指针连线，并被轻微排斥，形成跟随感
// - 颜色按当前主题实时读取（App.vue 里的 --particle-dot / --particle-line），切换主题时平滑过渡
import { ref, watch, onMounted, onUnmounted } from 'vue';

import { isDark } from '@/shared/theme';

const LINK_DIST = 130;          // 粒子间连线距离
const MOUSE_LINK_DIST = 180;    // 指针影响半径
const MAX_PARTICLES = 70;       // 粒子数上限
const AREA_PER_PARTICLE = 9000; // 每个粒子覆盖的面积（按视口面积缩放数量）
const MIN_PARTICLES = 18;
const MAX_DPR = 2;              // 设备像素比上限
const COLOR_EASE_MS = 250;      // 主题换色过渡（0.2~0.3s）

const DOT_ALPHA = 0.36;
const LINE_ALPHA = 0.2;
const MOUSE_LINE_ALPHA = 0.26;
const REPEL = 0.32;             // 指针附近粒子的排斥强度（每帧最多位移的像素量）

const canvasRef = ref(null);

let ctx = null;
let raf = 0;
let stopThemeWatch = null;
let lastTime = 0;
let particles = [];
let width = 0;
let height = 0;
let dpr = 1;

// 指针状态：x0/y0 是原始位置，x/y 做平滑跟随；alpha 控制连线的淡入淡出
const pointer = { x0: -1e4, y0: -1e4, x: -1e4, y: -1e4, target: 0, alpha: 0, active: false };
// 颜色按通道做缓动，实现 0.2~0.3s ease 的主题过渡
const dotColor = { r: 90, g: 112, b: 140, tr: 90, tg: 112, tb: 140 };
const lineColor = { r: 118, g: 140, b: 172, tr: 118, tg: 140, tb: 172 };

// 从主题 CSS 变量里读当前颜色（light 灰蓝 / dark 淡蓝白）
function readThemeColors() {
  const styles = getComputedStyle(document.body);
  const read = (name, fallback) => {
    const raw = styles.getPropertyValue(name).trim();
    const m = raw.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    return m ? [+m[1], +m[2], +m[3]] : fallback;
  };
  const dot = read('--particle-dot', [90, 112, 140]);
  const line = read('--particle-line', [118, 140, 172]);
  [dotColor.tr, dotColor.tg, dotColor.tb] = dot;
  [lineColor.tr, lineColor.tg, lineColor.tb] = line;
}

function buildParticles() {
  const count = Math.min(
    MAX_PARTICLES,
    Math.max(MIN_PARTICLES, Math.round((width * height) / AREA_PER_PARTICLE)),
  );
  particles = Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
    r: 1.1 + Math.random() * 1.2,
  }));
}

function resize() {
  if (!canvasRef.value || !ctx) return;
  dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
  width = window.innerWidth;
  height = window.innerHeight;
  canvasRef.value.width = Math.round(width * dpr);
  canvasRef.value.height = Math.round(height * dpr);
  canvasRef.value.style.width = `${width}px`;
  canvasRef.value.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  readThemeColors();
  buildParticles();   // 尺寸变化时重建粒子
}

function easeChannel(current, target, k) {
  return current + (target - current) * k;
}

function draw(now) {
  raf = requestAnimationFrame(draw);
  const dt = Math.min(64, now - lastTime || 16);
  lastTime = now;

  // 颜色平滑过渡（主题切换时 0.2~0.3s 内完成，动画本身不重启）
  const k = Math.min(1, dt / COLOR_EASE_MS);
  dotColor.r = easeChannel(dotColor.r, dotColor.tr, k);
  dotColor.g = easeChannel(dotColor.g, dotColor.tg, k);
  dotColor.b = easeChannel(dotColor.b, dotColor.tb, k);
  lineColor.r = easeChannel(lineColor.r, lineColor.tr, k);
  lineColor.g = easeChannel(lineColor.g, lineColor.tg, k);
  lineColor.b = easeChannel(lineColor.b, lineColor.tb, k);

  // 指针平滑跟随 + 与指针连线的透明度缓动
  if (pointer.active) {
    pointer.x += (pointer.x0 - pointer.x) * Math.min(1, dt / 110);
    pointer.y += (pointer.y0 - pointer.y) * Math.min(1, dt / 110);
  }
  pointer.alpha = easeChannel(pointer.alpha, pointer.target, Math.min(1, dt / 180));

  ctx.clearRect(0, 0, width, height);

  const dot = `${Math.round(dotColor.r)}, ${Math.round(dotColor.g)}, ${Math.round(dotColor.b)}`;
  const line = `${Math.round(lineColor.r)}, ${Math.round(lineColor.g)}, ${Math.round(lineColor.b)}`;

  // 运动、边界回弹、指针附近的轻微排斥
  for (const p of particles) {
    p.x += p.vx * (dt / 16);
    p.y += p.vy * (dt / 16);
    if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx); }
    if (p.x > width) { p.x = width; p.vx = -Math.abs(p.vx); }
    if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy); }
    if (p.y > height) { p.y = height; p.vy = -Math.abs(p.vy); }

    if (pointer.alpha > 0.02) {
      const dx = p.x - pointer.x;
      const dy = p.y - pointer.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.01 && dist < MOUSE_LINK_DIST) {
        const push = (1 - dist / MOUSE_LINK_DIST) * REPEL;
        p.x += (dx / dist) * push;
        p.y += (dy / dist) * push;
      }
    }
  }

  // 粒子之间的连线：越近越明显
  ctx.lineWidth = 1;
  for (let i = 0; i < particles.length; i++) {
    const a = particles[i];
    for (let j = i + 1; j < particles.length; j++) {
      const b = particles[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= LINK_DIST) continue;
      ctx.strokeStyle = `rgba(${line}, ${((1 - dist / LINK_DIST) * LINE_ALPHA).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  // 与指针的连线
  if (pointer.alpha > 0.02) {
    for (const p of particles) {
      const dist = Math.hypot(p.x - pointer.x, p.y - pointer.y);
      if (dist >= MOUSE_LINK_DIST) continue;
      const alpha = (1 - dist / MOUSE_LINK_DIST) * MOUSE_LINE_ALPHA * pointer.alpha;
      ctx.strokeStyle = `rgba(${line}, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(pointer.x, pointer.y);
      ctx.stroke();
    }
  }

  // 粒子本体
  ctx.fillStyle = `rgba(${dot}, ${DOT_ALPHA})`;
  for (const p of particles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function onPointerMove(e) {
  pointer.x0 = e.clientX;
  pointer.y0 = e.clientY;
  if (pointer.x < -1e3) { pointer.x = e.clientX; pointer.y = e.clientY; }
  pointer.active = true;
  pointer.target = 1;
}

function onPointerDown(e) {
  onPointerMove(e);
}

function onPointerEnd(e) {
  // 鼠标离开窗口 / 触摸抬手：连线淡出
  if (e && e.pointerType === 'touch') {
    pointer.target = 0;
    return;
  }
  pointer.target = 0;
  pointer.active = false;
}

function onVisibility() {
  if (document.hidden) {
    cancelAnimationFrame(raf);
    raf = 0;
  } else if (!raf) {
    lastTime = 0;
    raf = requestAnimationFrame(draw);
  }
}

onMounted(() => {
  ctx = canvasRef.value.getContext('2d');
  resize();
  // 主题切换：只重新读取目标色，粒子与动画继续跑（逐帧缓动过渡到新颜色）
  stopThemeWatch = watch(isDark, () => {
    readThemeColors();
    requestAnimationFrame(readThemeColors);   // body.dark 应用后再读一次，确保拿到新颜色
  });
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerdown', onPointerDown, { passive: true });
  window.addEventListener('pointerup', onPointerEnd, { passive: true });
  window.addEventListener('pointercancel', onPointerEnd, { passive: true });
  window.addEventListener('blur', onPointerEnd);
  document.addEventListener('visibilitychange', onVisibility);
  raf = requestAnimationFrame(draw);
});

onUnmounted(() => {
  stopThemeWatch?.();
  cancelAnimationFrame(raf);
  raf = 0;
  window.removeEventListener('resize', resize);
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerdown', onPointerDown);
  window.removeEventListener('pointerup', onPointerEnd);
  window.removeEventListener('pointercancel', onPointerEnd);
  window.removeEventListener('blur', onPointerEnd);
  document.removeEventListener('visibilitychange', onVisibility);
});
</script>

<style scoped lang="scss">
// 固定全屏、置于内容之下、不拦截交互
.particle-bg {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 0;
  display: block;
  pointer-events: none;
}
</style>
