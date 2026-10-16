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

// ---- 底部过山车 ----
// 一条闭合回路：4 个高低不同的山坡 + 一个竖直回环 + 两端半圆回转 + 底边回程。
// 小车按**能量守恒**跑：v = √(2g·落差 + vMin²)，爬坡自然减速、俯冲加速，到最高处最慢；
// 颜色沿用上面那套 --particle-line（低透明度），只做背景，不抢内容。
const COASTER = {
  g: 980,            // 重力加速度（px/s²），决定俯冲加速的快慢
  vMin: 44,          // 最低速（相当于链式提升段），保证回环顶部不会停住
  vMax: 430,         // 最高速上限，避免在底部嗖一下过去
  cars: 3,           // 车厢数
  carGap: 13,        // 车厢间距（沿轨道弧长）
  carW: 11,          // 车厢长
  carH: 6,           // 车厢高
  trail: 62,         // 车头拖尾长度（越是下坡越快、拖尾越长）
  trackAlpha: 0.23,   // 再浅一点：这是背景装饰，压过内容就不好了
  strutAlpha: 0.1,
  carAlpha: 0.38,
};
// 山坡：位置 c / 宽度 w / 高度 a（都按回路横向归一化）；最高那座在最左边，之后一座比一座矮
const HILLS = [
  { c: 0.145, w: 0.115, a: 1.0 },
  { c: 0.40, w: 0.085, a: 0.62 },
  { c: 0.585, w: 0.068, a: 0.44 },
  { c: 0.80, w: 0.10, a: 0.74 },
];
const LOOP_U = 0.285;   // 回环位置：正好落在第一、二座山之间的谷地，不和坡道交叠
let track = null;       // { pts, cum, total, topRef, bandTop, bandBottom }
let coasterS = 0;       // 车头沿轨道的弧长位置

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
  buildCoaster();     // 过山车轨道的尺寸跟着视口走
}

// ---------- 过山车 ----------

// 归一化位置 u → 山坡高度（0~1，几个高斯峰叠加）
function hillAt(u) {
  let h = 0;
  for (const b of HILLS) {
    const t = (u - b.c) / b.w;
    h += b.a * Math.exp(-t * t);
  }
  return Math.min(1.06, h);
}

// 生成闭合轨道：山坡（含回环）→ 右端回转 → 底边回程 → 左端回转，并算好弧长表
function buildCoaster() {
  const bandH = Math.min(178, Math.max(92, height * 0.17));
  if (bandH < 70 || width < 260) { track = null; return; }

  const hillH = bandH * 0.56;                     // 山坡相对基线的高度
  const dropD = bandH * 0.44;                     // 回程线在基线下方多少
  const bottomY = height - Math.max(16, bandH * 0.1);
  const baseY = bottomY - dropD;
  const topY = baseY - hillH;
  const padX = Math.max(16, Math.min(72, width * 0.05));
  const yOf = u => baseY - hillAt(u) * hillH;
  // 两端的回转半圆要往里让出半径，否则 xL - rL / xR + rR 会跑到画布外被裁掉
  const rR = Math.max(10, (bottomY - yOf(1)) / 2);
  const rL = Math.max(10, (bottomY - yOf(0)) / 2);
  const xL = padX + rL, xR = width - padX - rR;
  const span = Math.max(160, xR - xL);

  const pts = [];
  const push = (x, y) => {
    const last = pts[pts.length - 1];
    if (last && Math.hypot(x - last.x, y - last.y) < 0.5) return;
    pts.push({ x, y });
  };

  // ① 山坡段；在 LOOP_U 处插一个竖直回环（从最低点进、右侧上去、翻过头顶、左侧下来）
  const loopX = xL + span * LOOP_U;
  const loopBottomY = yOf(LOOP_U);
  const loopR = Math.min(hillH * 0.26, (loopBottomY - topY) / 2 - 5, span * 0.05);
  const N = 200;
  const stepX = span / N;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const x = xL + span * u;
    if (loopR > 8 && Math.abs(x - loopX) <= stepX * 0.5) {
      const cy = loopBottomY - loopR;
      const M = 40;
      for (let k = 0; k <= M; k++) {
        const th = (k / M) * Math.PI * 2;
        push(loopX + Math.sin(th) * loopR, cy + Math.cos(th) * loopR);
      }
      continue;
    }
    push(x, yOf(u));
  }

  // ② 右端回转：从山坡右端绕到底边（半圆鼓向右侧）
  for (let k = 1; k <= 20; k++) {
    const th = (k / 20) * Math.PI;
    push(xR + Math.sin(th) * rR, yOf(1) + (1 - Math.cos(th)) * rR);
  }
  // ③ 底边回程（右 → 左）
  push(xL, bottomY);
  // ④ 左端回转：从底边绕回山坡左端（半圆鼓向左侧）
  for (let k = 1; k <= 20; k++) {
    const th = (k / 20) * Math.PI;
    push(xL - Math.sin(th) * rL, bottomY - (1 - Math.cos(th)) * rL);
  }

  // 弧长表（闭合：最后一段接回起点）
  const cum = [0];
  let total = 0;
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i % pts.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
    cum.push(total);
  }
  let topRef = Infinity;
  for (const p of pts) topRef = Math.min(topRef, p.y);
  track = { pts, cum, total, topRef, baseY, bottomY };
}

// 弧长 → 位置 + 切线方向（二分找段，线性插值）
function posAt(s) {
  const { pts, cum, total } = track;
  let d = s % total;
  if (d < 0) d += total;
  let lo = 0;
  let hi = pts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(1, lo);
  const a = pts[(i - 1) % pts.length];
  const b = pts[i % pts.length];
  const segLen = cum[i] - cum[i - 1] || 1;
  const t = (d - cum[i - 1]) / segLen;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    a: Math.atan2(b.y - a.y, b.x - a.x),
  };
}

function roundRectPath(c, x, y, w, h, r) {
  if (c.roundRect) {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    return;
  }
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function drawCoaster(line, dt) {
  if (!track) return;
  const { pts, total, topRef } = track;

  // 物理：能量守恒（爬坡减速、俯冲加速），加最低速兜底与最高速封顶
  const here = posAt(coasterS);
  const drop = Math.max(0, here.y - topRef);
  const v = Math.min(COASTER.vMax, Math.sqrt(2 * COASTER.g * drop + COASTER.vMin * COASTER.vMin));
  coasterS = (coasterS + (v * dt) / 1000) % total;

  // 支撑柱：沿山坡每隔一段往回落一根（先画，压在轨道下面）
  ctx.lineWidth = 1;
  ctx.strokeStyle = `rgba(${line}, ${COASTER.strutAlpha})`;
  let nextStrut = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.y > track.baseY + 3) continue;
    if (cum(i) < nextStrut) continue;
    nextStrut = cum(i) + 30;
    ctx.beginPath();
    ctx.moveTo(p.x + 0.5, p.y + 1);
    ctx.lineTo(p.x + 0.5, track.bottomY - 2);
    ctx.stroke();
  }

  // 轨道
  ctx.lineWidth = 1.4;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = `rgba(${line}, ${COASTER.trackAlpha})`;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.stroke();

  // 拖尾：沿轨道回退一段，越靠车头越亮（下坡越快、拖尾拉得越长）
  const speedK = Math.min(1, v / COASTER.vMax);
  const trailLen = COASTER.trail * (0.45 + 0.75 * speedK);
  const SEG = 7;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  for (let k = 0; k < SEG; k++) {
    const a = posAt(coasterS - (trailLen * (k + 1)) / SEG);
    const b = posAt(coasterS - (trailLen * k) / SEG);
    ctx.strokeStyle = `rgba(${line}, ${(0.15 * ((SEG - k) / SEG) ** 2).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';

  // 车厢（3 节，沿轨道依次后退）
  ctx.fillStyle = `rgba(${line}, ${COASTER.carAlpha})`;
  for (let i = 0; i < COASTER.cars; i++) {
    const c = posAt(coasterS - i * COASTER.carGap);
    ctx.save();
    ctx.translate(c.x, c.y - 1.2);
    ctx.rotate(c.a);
    roundRectPath(ctx, -COASTER.carW / 2, -COASTER.carH / 2, COASTER.carW, COASTER.carH, 2.2);
    ctx.fill();
    ctx.restore();
  }
}

// cum 的取值助手（越界回绕），给支撑柱用
function cum(i) {
  return track.cum[Math.min(i, track.cum.length - 1)];
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

  // 底部过山车先画：它在所有元素之下，粒子连线叠在它上面
  drawCoaster(line, dt);

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
