// 每日挑战页：上方今日挑战，下方按月查看达成情况（可左右切换月份）
const { W, H, SAFE_TOP, SAFE_BOTTOM } = require('../../core/canvas');
const D = require('../../core/draw');
const theme = require('../../core/theme');
const i18n = require('../../core/i18n');
const { t } = i18n;
const icons = require('../../core/icons');

const SIDE = 16;
const CARD_W = W - 32;
const HEADER_H = 76;      // 标题 + 副标题 + 两个 chip
const TODAY_H = 128;
const CARD_R = 14;
const MONTH_HEAD = 40;
const WEEK_H = 22;   // 星期行
const ROW_H = 24;    // 日期行（紧凑：6 行固定高度，不再撑满剩余空间）

class DailyPage {
  constructor(safeTop) {
    this.safeTop = safeTop == null ? SAFE_TOP : safeTop;
    this.data = null;
    this.prevHit = null;
    this.nextHit = null;
    this.anim = 0;
    this.slide = null;      // 切月动画：{ from, dir, at, dur }
  }

  // opts.slideFrom：上一页的 month 数据；opts.dir：+1 看下个月 / -1 看上个月
  setData(data, opts) {
    const o = opts || {};
    if (o.slideFrom && o.dir) {
      this.slide = {
        from: o.slideFrom,
        dir: o.dir,
        at: Date.now(),
        dur: 260,
      };
    }
    this.data = data;
  }

  sliding() {
    return !!this.slide;
  }

  // 0→1 的进度（时间驱动；测试里可以直接传 now）
  slideProgress(now) {
    if (!this.slide) return 1;
    const p = Math.max(0, Math.min(1, ((now == null ? Date.now() : now) - this.slide.at) / this.slide.dur));
    if (p >= 1) this.slide = null;
    return p;
  }

  // 顶部三个区块的几何（月历用固定行高，紧凑不撑满屏幕）
  layout() {
    const top = this.safeTop + 8;
    const todayY = top + HEADER_H;
    const monthY = todayY + TODAY_H + 12;
    const maxH = H - SAFE_BOTTOM - 30 - monthY;
    // 桌面级高度下也能收紧：先按 24px 行高排，放不下再把行高压缩到 20
    const rowH = Math.max(18, Math.min(ROW_H, (maxH - MONTH_HEAD - WEEK_H - 8) / 6));
    const monthH = MONTH_HEAD + WEEK_H + rowH * 6 + 8;
    return {
      top,
      todayY,
      todayH: TODAY_H,
      monthY,
      monthH,
      monthHeadY: monthY + MONTH_HEAD,
      weekY: monthY + MONTH_HEAD + 8,
      gridY: monthY + MONTH_HEAD + WEEK_H + 8,
      rowH,
      gridH: rowH * 6,
    };
  }

  draw(c, opts) {
    const o = opts || {};
    const ease = o.ease == null ? 1 : o.ease;
    const interactive = !!o.interactive;
    const T = theme.tokens;
    const dark = !!theme.dark;
    const L = this.layout();
    const data = this.data || {};
    const today = data.today || {};
    const month = (data.month && data.month.cells) ? data.month : { cells: [], title: '', doneCount: 0, canNext: false, canPrev: true };

    c.save();
    c.globalAlpha = Math.min(1, Math.max(0, (ease - 0.2) / 0.6));

    // 底：页面底色（不透明，否则首页蜂窝会透上来，字看不清）+ 顶部一层淡淡暖色
    c.fillStyle = T.bg;
    c.fillRect(0, 0, W, H);
    if (!this.topGrad || this.topGradDark !== dark) {
      this.topGrad = c.createLinearGradient(0, 0, 0, H * 0.55);
      this.topGrad.addColorStop(0, dark ? 'rgba(224,150,80,0.14)' : 'rgba(255,214,170,0.5)');
      this.topGrad.addColorStop(1, 'rgba(255,214,170,0)');
      this.topGradDark = dark;
    }
    c.fillStyle = this.topGrad;
    c.fillRect(0, 0, W, H * 0.55);

    // ---- 标题 ----
    D.text(c, t('dailyTitle'), W / 2, L.top + 16, {
      size: 20, weight: 'bold', color: T.text, align: 'center',
    });
    D.text(c, t('dailySubtitle'), W / 2, L.top + 40, {
      size: 10.5, color: T.muted, align: 'center',
    });
    // 两个 chip：连续达成 / 本月达成
    const monthDone = data.thisMonthDone == null ? (month.doneCount || 0) : data.thisMonthDone;
    const chips = [
      `${t('dailyStreak')} ${data.streak || 0} ${t('dailyDays')}`,
      `${t('dailyMonthDone')} ${monthDone} ${t('dailyDays')}`,
    ];
    const chipH = 22;
    const widths = chips.map((s) => D.measure(c, s, 10) + 22);
    let cx = W / 2 - (widths[0] + widths[1] + 8) / 2;
    chips.forEach((s, i) => {
      const w = widths[i];
      D.fillRoundRect(c, cx, L.top + 54, w, chipH, chipH / 2, dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.045)');
      D.text(c, s, cx + w / 2, L.top + 54 + chipH / 2, {
        size: 10, color: i === 0 ? (T.god || T.primary) : T.muted, align: 'center',
      });
      cx += w + 8;
    });

    // ---- 今日挑战卡 ----
    this.drawTodayCard(c, L, today, dark);

    // ---- 月历卡 ----
    this.drawMonth(c, L, month, dark);

    // 底部提示：紧贴月历卡下方（页面不再撑满，留给它自然的位置）
    const hintY = Math.min(H - SAFE_BOTTOM - 16, L.monthY + L.monthH + 18);
    D.text(c, t('dailyHint'), W / 2, hintY, {
      size: 9.5, color: T.muted, align: 'center',
    });
    c.restore();

    // 月份切换按钮（只在完全展开时可点）
    this.prevHit = null;
    this.nextHit = null;
    if (interactive) {
      const headW = 30;
      const y = L.monthY + 6;
      this.prevHit = { x: SIDE + 8, y, w: headW, h: MONTH_HEAD - 8 };
      this.nextHit = { x: SIDE + CARD_W - 8 - headW, y, w: headW, h: MONTH_HEAD - 8 };
    }
    this.drawMonthArrows(c, L, month, dark, interactive);
  }

  drawTodayCard(c, L, today, dark) {
    const T = theme.tokens;
    const y = L.todayY;
    const x = SIDE;
    const w = CARD_W;
    const h = L.todayH;
    // 卡片底：待完成淡青，已达成淡橙（呼应成就页的全达成配色）
    const fill = today.done
      ? (dark ? 'rgba(150,86,32,0.5)' : 'rgba(255,214,170,0.9)')
      : (dark ? 'rgba(52,52,52,0.84)' : 'rgba(255,255,255,0.9)');
    const stroke = today.done
      ? (dark ? 'rgba(224,150,80,0.5)' : 'rgba(216,138,66,0.5)')
      : (dark ? 'rgba(88,88,88,0.55)' : 'rgba(210,218,228,0.75)');
    c.save();
    c.shadowColor = T.cardShadow;
    c.shadowBlur = 12;
    c.shadowOffsetY = 2;
    D.fillRoundRect(c, x, y, w, h, CARD_R, fill);
    c.restore();
    D.strokeRoundRect(c, x, y, w, h, CARD_R, stroke, 1);

    // 标题行：今天的挑战 + 日期
    D.text(c, t('dailyToday'), x + 16, y + 20, { size: 11, color: T.muted });
    D.text(c, today.date || '', x + w - 16, y + 20, { size: 10, color: T.muted, align: 'right' });

    // 任务文案：最多两行
    const desc = today.desc || '';
    const lines = wrapText(c, desc, w - 32, 15);
    lines.slice(0, 2).forEach((line, i) => {
      D.text(c, line, x + 16, y + 46 + i * 21, {
        size: 15, weight: 'bold', color: T.text,
      });
    });

    // 底部：状态胶囊 + 进度
    const pillH = 22;
    const pillY = y + h - 30;
    const ok = !!today.done;
    const label = ok
      ? `${t('dailyDone')}`
      : `${today.prog || 0}/${today.need || 1}`;
    const pw = D.measure(c, label, 10.5) + 24;
    D.fillRoundRect(c, x + 16, pillY, pw, pillH, pillH / 2, ok
      ? (dark ? 'rgba(79,158,116,0.88)' : 'rgba(143,211,175,0.92)')
      : (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'));
    if (ok && !icons.draw(c, 'check-all', x + 16 + 11, pillY + pillH / 2, 10, dark ? '#ffffff' : T.primary)) {
      D.circle(c, x + 16 + 11, pillY + pillH / 2, 3, dark ? '#ffffff' : T.primary);
    }
    D.text(c, label, x + 16 + (ok ? 20 : 12), pillY + pillH / 2, {
      size: 10.5, weight: ok ? 'bold' : 'normal',
      color: ok ? (dark ? '#ffffff' : T.primary) : T.muted,
    });
    // 右侧只在「未完成」时给进度条；已完成状态由左边那颗胶囊表达，不要重复写第二遍「已完成」
    if (!ok) {
      const barW = Math.min(120, w - 32 - pw - 30);
      const bx = x + w - 16 - barW;
      const ratio = Math.min(1, (today.prog || 0) / Math.max(1, today.need || 1));
      D.fillRoundRect(c, bx, pillY + 6, barW, 10, 5, dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)');
      if (ratio > 0) {
        D.fillRoundRect(c, bx, pillY + 6, Math.max(10, barW * ratio), 10, 5,
          dark ? 'rgba(79,158,116,0.88)' : 'rgba(143,211,175,0.95)');
      }
    }
  }

  drawMonth(c, L, month, dark) {
    const T = theme.tokens;
    const x = SIDE;
    const y = L.monthY;
    const w = CARD_W;
    const h = L.monthH;
    D.fillRoundRect(c, x, y, w, h, CARD_R, dark ? 'rgba(52,52,52,0.7)' : 'rgba(255,255,255,0.86)');
    D.strokeRoundRect(c, x, y, w, h, CARD_R, dark ? 'rgba(88,88,88,0.5)' : 'rgba(210,218,228,0.7)', 1);

    // 切月：旧月向左/右滑出、新月从另一侧滑进来（裁在卡片内，卡片本身不动）
    const p = this.slideProgress();
    if (p < 1 && this.slide) {
      const slide = this.slide;
      const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const shift = w * ease;
      c.save();
      D.roundRect(c, x, y, w, h, CARD_R);
      c.clip();
      this.drawMonthBody(c, L, slide.from, dark, -slide.dir * shift, 1 - ease);
      this.drawMonthBody(c, L, month, dark, slide.dir * (w - shift), ease);
      c.restore();
      return;
    }
    this.drawMonthBody(c, L, month, dark, 0, 1);
  }

  // 月历卡内容（标题 + 星期行 + 日期格）；dx 是整体横向偏移，alpha 用于切换时淡入淡出
  drawMonthBody(c, L, month, dark, dx, alpha) {
    const T = theme.tokens;
    const w = CARD_W;
    const y = L.monthY;
    const off = dx || 0;
    if (alpha != null && alpha < 1) {
      c.save();
      c.globalAlpha = Math.max(0, Math.min(1, alpha));
    }

    // 月份标题（两侧箭头由 drawMonthArrows 画，保证在按钮后）
    D.text(c, month.title || '', W / 2 + off, y + 20, {
      size: 13, weight: 'bold', color: T.text, align: 'center',
    });

    // 星期行（周一起）
    const week = (t('dailyWeek') || '一二三四五六日').split('');
    const gridW = w - 24;
    const cellW = gridW / 7;
    const gx = SIDE + 12 + off;
    const wy = L.weekY;
    week.forEach((wd, i) => {
      D.text(c, wd, gx + cellW * (i + 0.5), wy, { size: 9.5, color: T.muted, align: 'center' });
    });

    // 6 × 7 日期格（行高由 layout() 统一给，保证紧凑）
    const gTop = L.gridY;
    const rowH = L.rowH;
    const r = Math.min(cellW, rowH) * 0.33;
    (month.cells || []).forEach((cell, idx) => {
      if (!cell) return;
      const col = idx % 7;
      const row = Math.floor(idx / 7);
      const cx = gx + cellW * (col + 0.5);
      const cy = gTop + rowH * (row + 0.5);
      if (cell.done) {
        D.circle(c, cx, cy, r, dark ? 'rgba(79,158,116,0.9)' : '#8fd3af');
        D.text(c, String(cell.day), cx, cy, {
          size: 10, weight: 'bold', color: dark ? '#ffffff' : '#0f3d28', align: 'center',
        });
        return;
      }
      if (cell.isToday) {
        c.save();
        c.strokeStyle = T.god || T.primary;
        c.lineWidth = 1.4;
        c.beginPath();
        c.arc(cx, cy, r + 1.5, 0, Math.PI * 2);
        c.stroke();
        c.restore();
      }
      if (cell.tried) {
        D.circle(c, cx, cy, r, dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)');
      }
      D.text(c, String(cell.day), cx, cy, {
        size: 10,
        color: cell.isFuture ? (dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)') : T.text,
        align: 'center',
      });
    });
    if (alpha != null && alpha < 1) c.restore();
  }

  drawMonthArrows(c, L, month, dark, interactive) {
    const T = theme.tokens;
    const drawArrow = (rect, dir) => {
      if (!rect) return;
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      const enabled = dir < 0 ? month.canPrev !== false : !!month.canNext;
      const color = enabled ? T.text : (dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)');
      c.save();
      c.globalAlpha = interactive ? 1 : 0.6;
      if (enabled) {
        D.fillRoundRect(c, rect.x, rect.y, rect.w, rect.h, 9,
          dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.045)');
      }
      c.strokeStyle = color;
      c.lineWidth = 1.8;
      c.lineCap = 'round';
      c.beginPath();
      const d = 4.5;
      if (dir < 0) {
        c.moveTo(cx + d / 2, cy - d);
        c.lineTo(cx - d / 2, cy);
        c.lineTo(cx + d / 2, cy + d);
      } else {
        c.moveTo(cx - d / 2, cy - d);
        c.lineTo(cx + d / 2, cy);
        c.lineTo(cx - d / 2, cy + d);
      }
      c.stroke();
      c.restore();
    };
    drawArrow(this.prevHit, -1);
    drawArrow(this.nextHit, 1);
  }

  // 手指在月历卡片里横向滑动时由场景调用：返回 -1 / 0 / 1
  swipeDir(dx, dy) {
    if (Math.abs(dx) < 46 || Math.abs(dy) > 46) return 0;
    return dx > 0 ? -1 : 1;
  }
}

// 按宽度折行（中文逐字，英文按空格），最多返回 maxLines 行
function wrapText(c, text, maxW, size) {
  const s = String(text || '');
  if (!s) return [''];
  const out = [];
  let line = '';
  for (const ch of s) {
    const next = line + ch;
    if (D.measure(c, next, size) > maxW && line) {
      out.push(line);
      line = ch === ' ' ? '' : ch;
    } else {
      line = next;
    }
  }
  if (line) out.push(line);
  return out;
}

module.exports = DailyPage;
