// 连击 / 多消的「小型烟花」——小程序侧的 `burstConfetti`。
//
// web（src/shared/confetti.js）用 canvas-confetti 在视口坐标里原地炸一次：
//   burstConfetti(intensity = 1, { origin, count })
//     count 默认 min(110, round(22 + 26 * intensity))
//     spread 76°（向上 ±38°）、startVelocity 34、gravity 0.9、scalar 0.9、ticks 140（≈2.3s）
//     配色固定 5 色、喷发点默认 { x: 0.5, y: 0.64 }
//     同时播 firework-success.mp3，并让 elimination 在 240ms 内不再叠响
//
// 小程序没有 canvas-confetti，也没有 DOM 画布（原生 canvas 会挡住点击、层级也压不住），
// 所以改成「一层固定定位的粒子层 + CSS 动画」：配色、喷射角度照 web 的参数算，
// 动画用「上升 → 重力下落 → 淡出」三段关键帧复刻。
//
// ⚠️ 两条**小程序侧的有意差异**（用户 2026-10 指名要的，别按 web 改回去）：
//   1. **粒子数更少**：`count = min(28, round(10 + 12 * intensity))`（web 是 22 + 26×intensity、上限 110），
//      连击那几处再压一档：`min(24, 8 + n * 3)`；
//   2. **喷发点统一在「游戏区顶部中间」**：量 `.game-area` 的矩形，取 `x = 中心`、`y = 顶部 + 24px`，
//      不再跟着连击提示条 / 棋盘中心走（web 是元素中心或 {0.5, 0.64}）。
//      坐标是**页面内容空间里的 px**（和 selectorQuery 量的 rect 同一个空间），粒子层用
//      `position: absolute` 铺在页面内容上 —— 这样页面被滚动时喷发点仍然贴着游戏区，
//      不需要在「视口 / 内容」两套坐标之间换算（实测 fixed 层 + 百分比会差 29px）。
//
// 用法（页面侧）：
//   import { burstConfetti } from '@/core/firework';
//   import FireworkBurst from '@/components/FireworkBurst.vue';   // 模板里挂一次
//   burstConfetti(tier);                     // 粒子数按强度算
//   burstConfetti(1, { count: 18 });         // 自己指定粒子数
import { playFirework } from './sfx';

// 与 web 完全一致的 5 色（绿 / 米黄 / 橙 / 红 / 深红）
export const BURST_COLORS = ['#5D8C7B', '#F2D091', '#F2A679', '#D9695F', '#8C4646'];

// 粒子层的挂载点：每个页面挂一个 <FireworkBurst />，最后挂载（= 当前页面）的那个接活
let sinks = [];

export function registerFireworkSink(fn) {
  sinks.push(fn);
  return () => { sinks = sinks.filter(s => s !== fn); };
}

// 喷发点：游戏区顶部中间（再往里 24px，不然粒子会贴着卡片上沿飞出去）
export const GAME_AREA_SELECTOR = '.game-area';
export const TOP_INSET_PX = 24;
// 量不到游戏区时的兜底：视口水平居中、偏上（内容空间 ≈ 视口，页面顶部时二者相同）
export const fallbackOrigin = () => {
  let info = { windowWidth: 375, windowHeight: 800 };
  try { info = uni.getSystemInfoSync() || info; } catch { /* noop */ }
  return { x: (info.windowWidth || 375) / 2, y: (info.windowHeight || 800) * 0.22 };
};

// 粒子数：比 web 少（难度 / 连击强度只做温和加成，上限 28）
export const countForIntensity = (intensity) => Math.min(28, Math.round(10 + 12 * intensity));

export function burstConfetti(intensity = 1, { count } = {}) {
  // 音效：web 的 burstConfetti 里第一件事就是 playFirework()
  playFirework();
  const n = count ?? countForIntensity(intensity);
  const sink = sinks[sinks.length - 1];
  if (!sink) return;              // 页面还没挂载粒子层（极少见）→ 只出声，不炸
  emitAtGameTop(sink, n);
}

// 量游戏区 → 换算成视口比例 → 交给粒子层
function emitAtGameTop(sink, count) {
  if (typeof uni === 'undefined' || typeof uni.createSelectorQuery !== 'function') {
    sink({ count, ...fallbackOrigin() });
    return;
  }
  const q = uni.createSelectorQuery();
  q.select(GAME_AREA_SELECTOR).boundingClientRect();
  q.exec((res) => {
    const rect = res && res[0];
    const target = sinks[sinks.length - 1];
    if (!target) return;
    if (!rect || !rect.width) {
      // 量不到（页面还没渲染出 .game-area）→ 用兜底位置，宁可位置差一点也不能不炸
      target({ count, ...fallbackOrigin() });
      return;
    }
    target({
      count,
      x: rect.left + rect.width / 2,
      y: rect.top + TOP_INSET_PX,
    });
  });
}

// 生成一次爆发的粒子参数（纯函数，方便仿真/自测）。
// **不是圆点**：canvas-confetti 的粒子本身是「带旋转的小纸片」（矩形），所以这里也做成长短不一的
// 方块 / 宽条 / 细丝，各自带初始角度和自转速度 —— 一起炸开时是「碎纸块」而不是一圈圆点。
const SHAPES = ['square', 'wide', 'tall', 'ribbon'];

export function makeBurstParticles(count) {
  const n = Math.max(1, Math.round(count));
  const parts = [];
  for (let i = 0; i < n; i += 1) {
    // spread 76°：以「正上方」为中轴 ±38°
    const angle = ((-90 + (Math.random() * 76 - 38)) * Math.PI) / 180;
    // canvas-confetti 的 startVelocity 34（px/帧）≈ 视觉上一两百 px 的射程；这里按 rpx 取 150~330
    const speed = 150 + Math.random() * 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // 重力 0.9：上升段结束后继续往落方向走约 1.15~1.65 倍射程
    const drop = speed * (1.15 + Math.random() * 0.5);
    // 形状：一半是方块，其余是宽条 / 竖条 / 细丝；边长 10~22rpx（scalar 0.9 ≈ 8~10px 的量级）
    const shape = SHAPES[i % SHAPES.length];
    const base = 11 + Math.random() * 8;
    let w = base;
    let h = base;
    if (shape === 'wide') { w = base * 1.7; h = base * 0.85; }
    else if (shape === 'tall') { w = base * 0.8; h = base * 1.6; }
    else if (shape === 'ribbon') { w = base * 0.55; h = base * 2.2; }
    parts.push({
      id: i,
      shape,
      w: Math.round(w),
      h: Math.round(h),
      dx: cos * speed,
      dy: sin * speed,
      drop,
      // 初始朝向 + 整段自转（随机方向、1.2~3.6 圈）：碎纸片翻着飞才不假
      rot: Math.round(Math.random() * 360),
      spin: Math.round((Math.random() < 0.5 ? -1 : 1) * (430 + Math.random() * 860)),
      // 同一瞬间炸开，但给一点点错峰，看起来更像真实烟花而不是一个圆环
      delay: Math.round(Math.random() * 60),
      duration: 1700 + Math.round(Math.random() * 600),   // web ticks 140 ≈ 2.3s
      color: BURST_COLORS[i % BURST_COLORS.length],
    });
  }
  return parts;
}
