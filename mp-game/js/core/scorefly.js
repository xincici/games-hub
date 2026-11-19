// 得分反馈（消消乐 / 麻将英雄 / 扑克炼金术 / 麻将传奇共用）：
//   1) 从「被消除的位置」扔彩色圆点飞向得分格：先冒出来悬停一拍，再加速飞过去；
//   2) 得分数字滚动（从旧值滚到新值，420ms easeOut）。
// 圆点的坐标 / 颜色 / 时长都放在这里，各游戏只负责给出「起点」和「得分格的位置」。
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const easeOut = p => 1 - Math.pow(1 - p, 3);

// 飞向得分区的圆点颜色（纯庆祝色，不跟主题走）
const DOT_COLORS = ['#ff8a6b', '#ffd166', '#6bd0a3', '#6bb6ff', '#c48cff', '#ff9ec7'];

// 悬停 110~200ms，再飞 330~460ms（起步慢、越来越快）
const FLY_HOLD = [110, 200];
const FLY_TRAVEL = [330, 460];
const SCORE_ANIM_MS = 420;

// 圆点数量：每颗被消除的牌至少 DOTS_PER_POINT 颗、总数不低于 DOTS_MIN（少了玩家看不见），
// 上限 DOTS_MAX 防止大盘面一次刷出几百颗。
const DOTS_PER_POINT = 3;
const DOTS_MIN = 10;
const DOTS_MAX = 42;

// 二次贝塞尔的取点：控制点贴近起点、只往上抬一点，
// 这样「悬停 → 加速」和 p^2.1 的缓动对得上（控制点放在中点正上方会变成「先快后慢」）。
function flyPoint(d, e) {
  const dx = d.tx - d.x0;
  const dy = d.ty - d.y0;
  const lift = Math.min(46, Math.max(16, Math.hypot(dx, dy) * 0.18));
  const cx = d.x0 + dx * 0.12;
  const cy = d.y0 - lift;
  const u = 1 - e;
  return {
    x: u * u * d.x0 + 2 * u * e * cx + e * e * d.tx,
    y: u * u * d.y0 + 2 * u * e * cy + e * e * d.ty,
  };
}

// 圆点状态：先悬停（几乎不动、只轻微上浮 + 弹出来），再按 p^2.1 加速
function flyState(d, now) {
  const age = now - d.at - d.delay;
  if (age < 0 || age > d.hold + d.dur) return null;
  if (age < d.hold) {
    const hover = age / d.hold;
    return {
      x: d.x0,
      y: d.y0 - Math.sin(hover * Math.PI) * Math.min(3, (d.size || 3) * 1.6),
      r: d.size * (0.55 + 0.55 * Math.sin(Math.min(1, hover * 1.4) * Math.PI / 2)),
      alpha: Math.min(1, age / 60),
      tail: null,
    };
  }
  const p = (age - d.hold) / d.dur;
  const e = Math.pow(p, 2.1);
  const head = flyPoint(d, e);
  const back = flyPoint(d, Math.pow(Math.max(0, p - 0.07), 2.1));
  return {
    x: head.x,
    y: head.y,
    r: Math.max(1.4, d.size * (1 - 0.32 * e)),
    alpha: p > 0.9 ? Math.max(0, (1 - p) / 0.1) : 1,
    tail: back,
  };
}

// 从若干「消除位置」各扔几颗；o = { points:[{x,y}], tx, ty, at, size }
function spawn(list, o) {
  const points = (o.points || []).filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!points.length) return;
  const size = o.size || 3;
  const count = Math.min(DOTS_MAX, Math.max(DOTS_MIN, points.length * DOTS_PER_POINT));
  for (let k = 0; k < count; k++) {
    // 轮转取点：保证每一颗被消除的牌都至少吐出 1 颗（随机取点会漏掉大半，看着就稀疏）
    const p = points[k % points.length];
    // 飞得越远、圆点画得越大（麻将传奇那种「底行 → 顶部得分卡」的长距离，
    // 用跟消消乐一样的尺寸会显得很小、像没出现过）
    const dist = Math.hypot(o.tx - p.x, o.ty - p.y);
    const far = 1 + Math.min(0.7, dist / 700);
    list.push({
      x0: p.x + (Math.random() - 0.5) * size * 3,
      y0: p.y + (Math.random() - 0.5) * size * 3,
      tx: o.tx,
      ty: o.ty,
      at: o.at,
      delay: Math.random() * 130,
      hold: FLY_HOLD[0] + Math.random() * (FLY_HOLD[1] - FLY_HOLD[0]),
      dur: FLY_TRAVEL[0] + Math.random() * (FLY_TRAVEL[1] - FLY_TRAVEL[0]),
      size: size * far * (1.0 + Math.random() * 1.0),
      color: DOT_COLORS[k % DOT_COLORS.length],
    });
  }
}

function draw(c, list, now) {
  if (!list || !list.length) return;
  c.save();
  list.forEach((d) => {
    const s = flyState(d, now);
    if (!s) return;
    c.globalAlpha = s.alpha;
    c.fillStyle = d.color;
    if (s.tail) {
      c.globalAlpha *= 0.28;
      c.beginPath();
      c.arc(s.tail.x, s.tail.y, Math.max(1, s.r * 0.6), 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = s.alpha;
    }
    c.beginPath();
    c.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    c.fill();
  });
  c.restore();
}

// 推进一帧后清掉飞完的
function prune(list, now) {
  if (!list || !list.length) return list;
  return list.filter(d => now - d.at - d.delay <= d.hold + d.dur);
}

// ---------- 得分数字滚动 ----------
function roller(value = 0) {
  return { from: value, to: value, at: -1, dur: SCORE_ANIM_MS };
}

function shown(r, now) {
  if (!r) return 0;
  if (r.at < 0) return r.to;
  const p = clamp((now - r.at) / r.dur, 0, 1);
  const v = r.from + (r.to - r.from) * easeOut(p);
  if (p >= 1) {
    r.from = r.to;
    r.at = -1;
    return r.to;
  }
  return v;
}

function roll(r, to, now) {
  if (!r) return;
  r.from = shown(r, now);
  r.to = to;
  r.at = now;
}

// 直接跳到某个值（恢复存档 / 开新局）
function reset(r, value) {
  if (!r) return;
  r.from = value;
  r.to = value;
  r.at = -1;
}

module.exports = {
  DOT_COLORS, FLY_HOLD, FLY_TRAVEL, SCORE_ANIM_MS,
  DOTS_PER_POINT, DOTS_MIN, DOTS_MAX,
  flyPoint, flyState, spawn, draw, prune,
  roller, shown, roll, reset,
};
