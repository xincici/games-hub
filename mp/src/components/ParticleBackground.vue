<template>
  <!--
    全站背景：粒子连线 + 底部过山车（小程序版）
    来源：web 的 src/shared/ParticleBackground.vue（478 行，逻辑 / 常量 / 绘制顺序逐行照搬）
    颜色：web src/App.vue 亮色 CSS 变量 —— --particle-dot: 90, 112, 140 / --particle-line: 118, 140, 172
          （mp 只做亮色，颜色写死成这两个值；不读 getComputedStyle，小程序里取不到自定义属性）

    ⚠️ 有意降级（web 有 / mp 没有）：**指针联动**
    小程序没有全局 pointermove（uni.onWindowResize 之类也拿不到触摸坐标），
    所以 web 里「指针附近 MOUSE_LINK_DIST 内的粒子与指针连线 + 被轻微排斥」这一段在 mp 恒不生效：
    pointer.active 恒为 false、pointer.alpha 恒为 0 → draw() 里那两个 if 分支永远进不去。
    变量与代码路径全部保留（pointer 对象、onPointerMove / onPointerDown / onPointerEnd、排斥与连线分支），
    以后真接上触摸层（例如页面级 touchmove 广播）只需把 POINTER_ENABLED 打开并绑定事件即可，
    视觉参数（MOUSE_LINK_DIST / MOUSE_LINE_ALPHA / REPEL）与 web 完全一致。

    其它适配：canvas 必须 type="2d"（原生组件同层渲染，才能被普通 view 覆盖并参与 z-index）；
    取节点用 selectorQuery fields({node:true,size:true})；循环优先 node.requestAnimationFrame，
    没有就 setInterval(draw, 16)；onHide / onUnmounted 停表；uni.onWindowResize 里重建粒子与轨道。
  -->
  <canvas type="2d" id="particle-bg" class="particle-bg" />
</template>

<script setup>
// 全站粒子连线背景：固定全屏、置于所有内容之下、不拦截任何交互。
// - 粒子之间距离小于 LINK_DIST 时连线，越近越明显
// - 指针（鼠标 / 触摸）附近 MOUSE_LINK_DIST 内的粒子会与指针连线，并被轻微排斥，形成跟随感（mp 暂无，见文件头「有意降级」）
// - 颜色按通道缓动（web 读主题 CSS 变量；mp 只有亮色，目标色恒定，结构保留）
// ⚠️ 底部过山车：**所有页面的默认行为都是关闭**（用户要求全站去掉）。
// web 里它是全站装饰，小程序里那块轨道在内容下方的空白处太抢眼；代码保留（`drawCoaster` 等一整套），
// 需要恢复时把下面的 `default` 改成 true，或在某个页面写 `<ParticleBackground coaster />`。
const props = defineProps({
  // 过山车**默认关闭**（用户要求所有页面都去掉）；要恢复把它改成 true 即可
  coaster: { type: Boolean, default: false },
});

import { getCurrentInstance, onMounted, onUnmounted } from 'vue';
import { onAppHide, onAppShow, onHide, onShow } from '@dcloudio/uni-app';

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

// ⚠️ 有意的降级开关（见文件头）：web 为 true，小程序恒 false（拿不到全局 pointermove）
const POINTER_ENABLED = false;

const instance = getCurrentInstance();   // selectorQuery 需要组件实例

let canvasNode = null;  // type="2d" 的 canvas 节点（H5 下是真实 <canvas>）
let ctx = null;
let rafId = 0;          // canvas 节点自带 requestAnimationFrame 的 id
let timer = 0;          // 没有 rAF 时的 setInterval id
let useRaf = false;
let running = false;    // 循环是否在跑（onHide 停 / onShow 起，draw 里再确认一次防止已排的帧续命）
let disposed = false;
let lastTime = 0;
let particles = [];
let width = 0;
let height = 0;
let dpr = 1;

// 指针状态：x0/y0 是原始位置，x/y 做平滑跟随；alpha 控制连线的淡入淡出
// （小程序里 active 恒 false / alpha 恒 0，保留是为了与 web 同一份代码路径）
const pointer = { x0: -1e4, y0: -1e4, x: -1e4, y: -1e4, target: 0, alpha: 0, active: false };
// 颜色按通道做缓动；mp 只有亮色，目标色恒定（web 是在 readThemeColors 里按主题改 tr/tg/tb）
const dotColor = { r: 90, g: 112, b: 140, tr: 90, tg: 112, tb: 140 };
const lineColor = { r: 118, g: 140, b: 172, tr: 118, tg: 140, tb: 172 };

// 目标色（web 读 --particle-dot / --particle-line，mp 写死亮色这一套）。
// 保留函数名与缓动结构：以后要接暗色，只要在这里改 tr/tg/tb 即可。
function readThemeColors() {
  const DOT = [90, 112, 140];
  const LINE = [118, 140, 172];
  [dotColor.tr, dotColor.tg, dotColor.tb] = DOT;
  [lineColor.tr, lineColor.tg, lineColor.tb] = LINE;
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

// 设备像素比（web 的 window.devicePixelRatio）：uni.getWindowInfo 优先，老版本退回 getSystemInfoSync
function getDpr() {
  let ratio = 1;
  try {
    const info = typeof uni.getWindowInfo === 'function' ? uni.getWindowInfo() : null;
    ratio = (info && info.pixelRatio) || (uni.getSystemInfoSync && uni.getSystemInfoSync().pixelRatio) || 1;
  } catch (e) {
    ratio = 1;
  }
  return Math.min(MAX_DPR, ratio);
}

// 窗口尺寸兜底（拿不到 canvas 自身尺寸时用）
function getWindowSize() {
  try {
    const info = (typeof uni.getWindowInfo === 'function' && uni.getWindowInfo()) ||
      (uni.getSystemInfoSync && uni.getSystemInfoSync()) || {};
    return { w: info.windowWidth || 0, h: info.windowHeight || 0 };
  } catch (e) {
    return { w: 0, h: 0 };
  }
}

function resize(size) {
  if (!canvasNode || !ctx) return;
  dpr = getDpr();
  const win = getWindowSize();
  let w = Math.round((size && size.width) || 0);
  let h = Math.round((size && size.height) || 0);
  if (!w || !h) {
    // H5 兜底：直接量 DOM（小程序里 canvas 节点没有这些属性，会走到 win）
    const rect = (canvasNode.getBoundingClientRect && canvasNode.getBoundingClientRect()) || null;
    w = Math.round((rect && rect.width) || canvasNode.clientWidth || win.w || 0);
    h = Math.round((rect && rect.height) || canvasNode.clientHeight || win.h || 0);
  }
  if (!w || !h) return;
  width = w;
  height = h;
  canvasNode.width = Math.round(width * dpr);
  canvasNode.height = Math.round(height * dpr);
  // H5 / uni-canvas 下 canvas 是 DOM 元素，CSS 尺寸也要写上，否则只显示默认的 300×150；
  // 小程序 canvas 节点没有 style 属性，跳过。
  if (canvasNode.style && typeof canvasNode.style === 'object') {
    canvasNode.style.width = `${width}px`;
    canvasNode.style.height = `${height}px`;
  }
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
  // 停表后即使还有一帧排在队列里（某些平台 cancelAnimationFrame 不放行），也不再续命
  if (!running) return;

  // 先排下一帧（与 web 的 `raf = requestAnimationFrame(draw)` 同位置）；
  // 没有 node.requestAnimationFrame 的平台走 startLoop 里的 setInterval。
  if (useRaf && canvasNode) rafId = canvasNode.requestAnimationFrame(draw);

  if (!ctx) return;
  // 小程序的 setInterval 路径没有时间戳，用 Date.now() 顶上
  const t = typeof now === 'number' ? now : Date.now();
  const dt = Math.min(64, t - lastTime || 16);
  lastTime = t;

  // 颜色平滑过渡（主题切换时 0.2~0.3s 内完成，动画本身不重启；mp 目标色恒定 = 无感）
  const k = Math.min(1, dt / COLOR_EASE_MS);
  dotColor.r = easeChannel(dotColor.r, dotColor.tr, k);
  dotColor.g = easeChannel(dotColor.g, dotColor.tg, k);
  dotColor.b = easeChannel(dotColor.b, dotColor.tb, k);
  lineColor.r = easeChannel(lineColor.r, lineColor.tr, k);
  lineColor.g = easeChannel(lineColor.g, lineColor.tg, k);
  lineColor.b = easeChannel(lineColor.b, lineColor.tb, k);

  // 指针平滑跟随 + 与指针连线的透明度缓动（mp 恒 false / 0，见文件头「有意降级」）
  if (pointer.active) {
    pointer.x += (pointer.x0 - pointer.x) * Math.min(1, dt / 110);
    pointer.y += (pointer.y0 - pointer.y) * Math.min(1, dt / 110);
  }
  pointer.alpha = easeChannel(pointer.alpha, pointer.target, Math.min(1, dt / 180));

  // 画布**必须是透明的**：小程序的 canvas 是原生组件，一旦层级降级（没走同层渲染）它会盖在所有
  // 内容之上，不透明的底色会让整页内容消失（首页蜂窝就是这样集体不见的 ✗）。
  // 底色交给页面根元素（App.vue 的 page { background }）与 pages.json 的 window.backgroundColor。
  ctx.clearRect(0, 0, width, height);

  const dot = `${Math.round(dotColor.r)}, ${Math.round(dotColor.g)}, ${Math.round(dotColor.b)}`;
  const line = `${Math.round(lineColor.r)}, ${Math.round(lineColor.g)}, ${Math.round(lineColor.b)}`;

  // 底部过山车先画：它在所有元素之下，粒子连线叠在它上面
  if (props.coaster) drawCoaster(line, dt);

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

  // 与指针的连线（mp 恒不进入：pointer.alpha 恒 0）
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

// ---------- 指针（web 有 / mp 没有：保留代码路径，当前不绑定） ----------
// 小程序没有全局 pointermove；将来接上触摸层（页面级 touchmove 广播）时，
// 把 POINTER_ENABLED 改成 true 并把这些 handler 挂到事件源上即可，逻辑与 web 一致。
function onPointerMove(e) {
  if (!POINTER_ENABLED) return;
  pointer.x0 = e.clientX;
  pointer.y0 = e.clientY;
  if (pointer.x < -1e3) { pointer.x = e.clientX; pointer.y = e.clientY; }
  pointer.active = true;
  pointer.target = 1;
}

function onPointerDown(e) {
  if (!POINTER_ENABLED) return;
  onPointerMove(e);
}

function onPointerEnd(e) {
  if (!POINTER_ENABLED) return;
  // 鼠标离开窗口 / 触摸抬手：连线淡出
  if (e && e.pointerType === 'touch') {
    pointer.target = 0;
    return;
  }
  pointer.target = 0;
  pointer.active = false;
}

// ---------- canvas 节点 / 生命周期 ----------

// 只有真 canvas 才有 getContext；H5 下 #particle-bg 可能是 <uni-canvas> 外壳，要往里找一层
function toDrawable(el) {
  if (!el) return null;
  if (typeof el.getContext === 'function') return el;
  const inner = typeof el.querySelector === 'function' ? el.querySelector('canvas') : null;
  return inner && typeof inner.getContext === 'function' ? inner : null;
}

function queryCanvas() {
  return new Promise(resolve => {
    let q = uni.createSelectorQuery();
    if (instance && instance.proxy) q = q.in(instance.proxy);
    q.select('#particle-bg')
      .fields({ node: true, size: true }, res => resolve(res || null))
      .exec();
  });
}

// H5 兜底：小程序里没有 document，这段会被 typeof 短路掉
function h5Node() {
  if (typeof document === 'undefined') return null;
  return toDrawable(document.querySelector('#particle-bg canvas')) ||
    toDrawable(document.querySelector('#particle-bg'));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 节点可能比 mounted 晚一拍才就绪（小程序常见），失败重试几次就放弃
async function acquireNode(retries = 3) {
  for (let i = 0; i <= retries; i++) {
    const res = await queryCanvas();
    if (disposed) return null;
    const node = toDrawable(res && res.node) || h5Node();
    if (node) return { node, res };
    if (i < retries) await sleep(60);
  }
  return null;
}

function startLoop() {
  if (disposed || !ctx || !canvasNode) return;
  if (running) return;          // 已经在跑（onShow / visibilitychange 可能重复触发）
  running = true;
  lastTime = 0;
  useRaf = typeof canvasNode.requestAnimationFrame === 'function';
  if (useRaf) rafId = canvasNode.requestAnimationFrame(draw);
  else timer = setInterval(() => draw(Date.now()), 16);
}

function stopLoop() {
  running = false;
  if (rafId) {
    if (canvasNode && typeof canvasNode.cancelAnimationFrame === 'function') {
      canvasNode.cancelAnimationFrame(rafId);
    }
    rafId = 0;
  }
  if (timer) {
    clearInterval(timer);
    timer = 0;
  }
  lastTime = 0;
}

function handleResize(e) {
  const size = e && e.size ? { width: e.size.windowWidth, height: e.size.windowHeight } : undefined;
  resize(size);
}

// H5 下 uni 的页面级 onHide 不一定会派发到子组件，补一个浏览器的 visibilitychange
// （等价 web 里那段 document.visibilitychange；小程序没有 document，自动跳过）
function handleVisibility() {
  if (typeof document === 'undefined') return;
  if (document.hidden) stopLoop();
  else startLoop();
}

async function init() {
  const found = await acquireNode();
  if (disposed || !found) return;
  canvasNode = found.node;
  ctx = canvasNode.getContext('2d');
  if (!ctx) { canvasNode = null; return; }
  resize(found.res);
  if (typeof uni.onWindowResize === 'function') uni.onWindowResize(handleResize);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', handleVisibility);
  startLoop();
}

onMounted(() => {
  init().catch(() => { /* 拿不到 canvas 就静默退出，页面本身照常可用 */ });
});

// 页面隐藏 / 组件卸载：停表并清理（web 对应 visibilitychange + onUnmounted）
onHide(() => stopLoop());
onShow(() => startLoop());
// ⚠️ 小程序的页面级 onHide/onShow 只派发到**页面 vm**，写在子组件里的那份很可能不触发；
// app 级钩子（uni.onAppHide / onAppShow，或这里的 onAppHide/onAppShow）才是可靠的后台停表信号。
onAppHide(() => stopLoop());
onAppShow(() => startLoop());

onUnmounted(() => {
  disposed = true;
  stopLoop();
  if (typeof uni.offWindowResize === 'function') uni.offWindowResize(handleResize);
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', handleVisibility);
  canvasNode = null;
  ctx = null;
  particles = [];
  track = null;
  coasterS = 0;
});
</script>

<style scoped lang="scss">
// 固定全屏、置于内容之下、不拦截交互
.particle-bg {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  /* z-index: 0 —— 照 web 的同名规则与本次任务的规格（web 里 .app-content 是 z-index:1，内容天然压在画布上）。
     ⚠️ 小程序侧 24/26 个页面的 .page 有不透明 background:#f0f2f5、且没有 z-index，于是浏览器里：
       · 保持 0（当前）：canvas 是「定位元素」，会画在**非定位**内容之上 → 粒子浮在卡片上；
         但因为画布是透明的（每帧 clearRect，不铺底色），内容不会被遮住，也不会拦截点击。
       · 改成 -1：负层会被 .page 的不透明背景整个挡住 → 整层看不见（1A2B / 2048 / 麻将… 全部失效）。
     要和 web 完全同一层次，只能由页面侧给 .screen / .page 补 position:relative + z-index:1（本文件不允许改页面）。 */
  /* z-index: -1 —— 页面侧已把所有 .screen / .page 的 background 改成 transparent（26 页），
     所以负值能正确落在「page 根底色之上、所有内容之下」。
     用 0 的话 canvas 是定位元素，会画在所有**非定位**内容（卡片 / 蜂窝 / 棋盘格）之上 →
     粒子浮在内容表面，观感就错了（虽然画布透明、不遮内容）。
     前提：.screen / .page 不能创建层叠上下文（别给它们 z-index / transform / filter）。 */
  z-index: -1;
  pointer-events: none;
}
</style>
