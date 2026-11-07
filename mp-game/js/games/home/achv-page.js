// 成就页：整屏面板（圆形从右下角「成就」FAB 展开，和设置面板同一套节奏）。
// 内容 = 顶部总览 + 25 张游戏卡，每张卡最多 3 条成就（进度药丸）。
// 背景是「一直在放的庆祝烟花」：慢速上升的金色火花 + 时不时一朵小礼花，
// 全部压低透明度、放在卡片下方，看得见但不会抢字。

const { W, H } = require('../../core/canvas');
const theme = require('../../core/theme');
const D = require('../../core/draw');
const icons = require('../../core/icons');
const i18n = require('../../core/i18n');

const { t } = i18n;

const SIDE = 16;
const CARD_W = W - SIDE * 2;
const ROW_H = 22;
const CARD_PAD = 8;
const CARD_GAP = 9;
// 卡片左右 3:7：左边图标 + 名字，右边成就列表
const LEFT_W = Math.round(CARD_W * 0.3);
const RIGHT_W = CARD_W - LEFT_W;
const ROW_GAP = 12;
const HIDDEN_ROW_H = 34;   // 隐藏成就行更高：已达成时名字下面还有一句说明
const HEX_R = 22;          // 卡片左列六边形半径
const NAME_LH = 14;        // 游戏名行高   // 隐藏成就行更高：已达成时名字下面还有一句说明   // 分隔线到成就列表的间距（右边留 10）
// 卡片最小高度 = 放得下 3 条成就 —— 否则只有 2 条时卡片变矮，左侧图标会被顶出卡片外
const CARD_MIN_H = 3 * ROW_H + CARD_PAD * 2 + 6;

// ---------- 庆祝烟花 ----------

const FIRE_COLORS = [
  [255, 206, 120],
  [255, 146, 110],
  [126, 214, 168],
  [140, 184, 255],
  [255, 232, 160],
];

// 半透明卡片：背景的烟花要能透出来，所以不用不透明的 T.card。
// 阴影 + 细描边保证卡片边界依然清楚；文字对比度不受影响（只透 12%~16%）。
// 卡片配色：某个游戏的成就全部达成时换成浅橙底（暗色用暖橙半透明，避免整块发亮）
const CARD_FILL_DONE = { dark: 'rgba(150,86,32,0.5)', light: 'rgba(255,214,170,0.9)' };
const CARD_FILL = { dark: 'rgba(52,52,52,0.84)', light: 'rgba(255,255,255,0.86)' };
const CARD_STROKE_DONE = { dark: 'rgba(224,150,80,0.5)', light: 'rgba(216,138,66,0.5)' };
const CARD_STROKE = { dark: 'rgba(88,88,88,0.55)', light: 'rgba(210,218,228,0.75)' };

// 手绘日历（icon font 里没有日历图标）——和首页每日挑战 FAB 同一个造型
function drawCalendar(c, cx, cy, size, color) {
  const w = size * 0.82;
  const h = size * 0.74;
  c.save();
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineWidth = Math.max(1, size * 0.075);
  D.roundRect(c, cx - w / 2, cy - h / 2 + size * 0.06, w, h, size * 0.15);
  c.stroke();
  c.beginPath();
  c.moveTo(cx - w * 0.28, cy - h / 2);
  c.lineTo(cx - w * 0.28, cy - h / 2 + size * 0.15);
  c.moveTo(cx + w * 0.28, cy - h / 2);
  c.lineTo(cx + w * 0.28, cy - h / 2 + size * 0.15);
  c.stroke();
  c.beginPath();
  c.moveTo(cx - w / 2, cy - h * 0.08);
  c.lineTo(cx + w / 2, cy - h * 0.08);
  c.stroke();
  c.beginPath();
  c.arc(cx - w * 0.22, cy + h * 0.2, size * 0.05, 0, Math.PI * 2);
  c.arc(cx, cy + h * 0.2, size * 0.05, 0, Math.PI * 2);
  c.arc(cx + w * 0.22, cy + h * 0.2, size * 0.05, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

// 游戏名一行放不下时按空格折行（最多两行；单个单词太长就只能那样放着）
function wrapName(name, maxW) {
  const text = String(name || '');
  if (!text) return [''];
  const probe = nameProbeCtx();
  const fits = (t) => !probe || probe.measureText(t).width <= maxW;
  if (!probe || fits(text)) return [text];
  const words = text.split(' ');
  if (words.length < 2) return [text];
  const lines = [];
  let cur = '';
  words.forEach((w) => {
    const next = cur ? `${cur} ${w}` : w;
    if (lines.length === 0 && fits(next)) {
      cur = next;
      return;
    }
    if (fits(next) && lines.length === 1) {
      cur = next;
      return;
    }
    if (cur) lines.push(cur);
    cur = w;
  });
  if (cur) lines.push(cur);
  return lines.slice(0, 2);
}

// 折行用的离屏量尺（拿不到画布时直接返回 null，按单行画）
let nameProbe = null;
function nameProbeCtx() {
  if (nameProbe !== undefined && nameProbe !== null) return nameProbe;
  try {
    const cv = typeof wx !== 'undefined' && wx.createCanvas ? wx.createCanvas() : null;
    nameProbe = cv ? cv.getContext('2d') : null;
    if (nameProbe) nameProbe.font = 'bold 12px sans-serif';
  } catch (e) {
    nameProbe = null;
  }
  return nameProbe;
}

function cardColors(dark, allDone) {
  const k = dark ? 'dark' : 'light';
  return allDone
    ? { fill: CARD_FILL_DONE[k], stroke: CARD_STROKE_DONE[k] }
    : { fill: CARD_FILL[k], stroke: CARD_STROKE[k] };
}

function glassCard(c, x, y, w, h, radius, dark, lifted, flat, allDone) {
  const T = theme.tokens;
  c.save();
  if (!flat) {
    // 拖动中的卡阴影更重，看起来是「离开桌面」的
    c.shadowColor = lifted ? 'rgba(0,0,0,0.3)' : T.cardShadow;
    c.shadowBlur = lifted ? 18 : 12;
    c.shadowOffsetY = lifted ? 6 : 2;
  }
  // 全部达成：卡片底色换成浅橙（仍然半透明，烟花能透出来）
  const colors = cardColors(dark, allDone);
  D.fillRoundRect(c, x, y, w, h, radius, colors.fill);
  c.restore();
  D.strokeRoundRect(c, x, y, w, h, radius, colors.stroke, 1);
}

class Celebration {
  constructor(safeTop) {
    this.safeTop = safeTop;
    this.time = 0;
    this.sparks = Array.from({ length: 22 }, () => this.newSpark(Math.random() * H));
    this.bursts = [];
    this.nextBurst = 300 + Math.random() * 500;
  }

  newSpark(y) {
    return {
      x: Math.random() * W,
      y: y == null ? H + 6 : y,
      r: 0.8 + Math.random() * 1.3,
      vy: -(0.006 + Math.random() * 0.012),
      vx: (Math.random() - 0.5) * 0.004,
      phase: Math.random() * Math.PI * 2,
      speed: 0.0011 + Math.random() * 0.0012,
      color: FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)],
    };
  }

  spawnBurst() {
    const x = 40 + Math.random() * (W - 80);
    const y = this.safeTop + 90 + Math.random() * (H * 0.55);
    const count = 12 + Math.floor(Math.random() * 6);
    const color = FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)];
    const parts = [];
    for (let i = 0; i < count; i += 1) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const sp = 0.028 + Math.random() * 0.03;
      parts.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 0.004,
        r: 1.1 + Math.random() * 1.2,
        life: 900 + Math.random() * 500,
        t: 0,
      });
    }
    this.bursts.push({ x, y, t: 0, life: 520, color, parts });
  }

  update(dt) {
    const d = Math.min(48, Math.max(0, dt || 16));
    this.time += d;

    this.sparks.forEach((s) => {
      s.x += s.vx * d;
      s.y += s.vy * d;
      if (s.y < this.safeTop - 10) Object.assign(s, this.newSpark());
    });

    // 烟花频率：每 0.7~1.5s 一朵，最多 4 朵同屏（原来 1.5~3.1s / 3 朵，太安静）
    if (this.bursts.length < 4) {
      this.nextBurst -= d;
      if (this.nextBurst <= 0) {
        this.spawnBurst();
        this.nextBurst = 700 + Math.random() * 800;
      }
    }

    this.bursts.forEach((b) => {
      b.t += d;
      b.parts.forEach((p) => {
        p.t += d;
        p.vy += 0.000045 * d;
        p.x += p.vx * d;
        p.y += p.vy * d;
      });
    });
    this.bursts = this.bursts.filter((b) => b.t < b.life && b.parts.some((p) => p.t < p.life));
  }

  draw(c, dark) {
    const dim = dark ? 1 : 0.82;
    c.save();
    // 上升的碎金
    this.sparks.forEach((s) => {
      const tw = 0.45 + 0.55 * Math.sin(this.time * s.speed + s.phase);
      const a = (dark ? 0.46 : 0.38) * tw * dim;
      c.fillStyle = `rgba(${s.color.join(',')},${Math.max(0, a)})`;
      c.beginPath();
      c.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      c.fill();
    });

    this.bursts.forEach((b) => {
      // 炸开的瞬间给一团柔光
      if (b.t < b.life) {
        const p = b.t / b.life;
        const r = 14 + p * 46;
        const g = c.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
        g.addColorStop(0, `rgba(${b.color.join(',')},${(dark ? 0.4 : 0.32) * (1 - p)})`);
        g.addColorStop(1, `rgba(${b.color.join(',')},0)`);
        c.fillStyle = g;
        c.fillRect(b.x - r, b.y - r, r * 2, r * 2);
      }
      b.parts.forEach((p) => {
        const k = 1 - p.t / p.life;
        if (k <= 0) return;
        c.fillStyle = `rgba(${b.color.join(',')},${(dark ? 0.72 : 0.58) * k * dim})`;
        c.beginPath();
        c.arc(p.x, p.y, p.r * (0.6 + k * 0.6), 0, Math.PI * 2);
        c.fill();
      });
    });
    c.restore();
  }
}

// ---------- 页面 ----------

class AchvPage {
  constructor(safeTop, safeBottom) {
    this.safeTop = safeTop || 0;
    this.safeBottom = safeBottom || 0;
    this.celebration = new Celebration(this.safeTop);
    this.data = { summary: { unlocked: 0, total: 1, cleared: 0, plays: 0 }, games: [] };
    this.headerH = this.safeTop + 106;
  }

  setData(data) {
    this.data = data;
  }

  update(dt) {
    this.celebration.update(dt);
  }

  cardHeight(game) {
    if (game.hidden) return HIDDEN_ROW_H * game.achv.length + CARD_PAD * 2 + 6;
    if (game.pinned) return Math.max(CARD_MIN_H, game.achv.length * ROW_H + CARD_PAD * 2 + 6);
    const rows = Math.max(1, game.achv.length);
    return Math.max(CARD_MIN_H, rows * ROW_H + CARD_PAD * 2 + 6);
  }

  contentHeight() {
    let h = this.headerH - this.safeTop + 8;
    if (this.data.daily && this.data.daily.achv && this.data.daily.achv.length) {
      h += this.cardHeight(this.data.daily) + CARD_GAP;
    }
    this.data.games.forEach((g) => { h += this.cardHeight(g) + CARD_GAP; });
    // 列表末尾还有一张「隐藏成就」卡，高度必须算进去，否则滑到底会被渐隐盖住一半
    if (this.data.hidden && this.data.hidden.length) h += this.cardHeight(this.hiddenCard()) + CARD_GAP;
    return h + 84 + this.safeBottom;   // 底部留出 ✕ 与渐隐的空间
  }

  viewH() {
    return H - this.safeBottom - 20;
  }

  maxScroll() {
    return Math.max(0, this.contentHeight() - this.viewH());
  }

  // 当前顺序下每张卡的几何：{ index, game, y, h }（y 已含滚动偏移）
  cardList(scroll) {
    const out = [];
    let y = this.headerH + 6 - (scroll || 0);
    // 最上面固定一张「每日挑战」卡（不参与长按排序）
    if (this.data.daily && this.data.daily.achv && this.data.daily.achv.length) {
      const h = this.cardHeight(this.data.daily);
      out.push({ index: -1, game: this.data.daily, y, h, pinned: true });
      y += h + CARD_GAP;
    }
    this.data.games.forEach((game, index) => {
      const h = this.cardHeight(game);
      out.push({ index, game, y, h });
      y += h + CARD_GAP;
    });
    // 最后一张是「隐藏成就」卡（不参与拖动排序）
    if (this.data.hidden && this.data.hidden.length) {
      const hiddenGame = this.hiddenCard();
      const h = this.cardHeight(hiddenGame);
      out.push({ index: -1, game: hiddenGame, y, h, hidden: true });
    }
    return out;
  }

  hiddenCard() {
    return {
      id: '__hidden__',
      name: t('achvHiddenTitle'),
      hidden: true,
      accent: theme.tokens.god,
      icon: 'incognito',
      achv: this.data.hidden || [],
    };
  }

  // 手指落在哪张卡上（返回 index，落空返回 -1）
  hitIndex(py, scroll) {
    const list = this.cardList(scroll);
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const c = list[i];
      if (py >= c.y && py <= c.y + c.h) return (c.hidden || c.pinned) ? -1 : c.index;
    }
    return -1;
  }

  // 拖动时把「拿着的那张」插到落点位置；返回是否真的换了位置
  moveItem(from, to) {
    const games = this.data.games;
    if (from === to || from < 0 || to < 0 || from >= games.length || to >= games.length) return false;
    const [item] = games.splice(from, 1);
    games.splice(to, 0, item);
    return true;
  }

  // ease: 0~1 圆形展开进度；scroll: 列表滚动距离；drag: { index, top } 拖动中的卡
  draw(c, options) {
    const o = options || {};
    const ease = o.ease == null ? 1 : o.ease;
    const scroll = o.scroll || 0;
    const interactive = !!o.interactive;
    const T = theme.tokens;
    const dark = !!theme.dark;

    // 底：页面底色 + 一点点主色渐变，让喜庆感从背景透出来（渐变对象缓存，别每帧新建）
    c.fillStyle = T.bg;
    c.fillRect(0, 0, W, H);
    if (!this.topGrad || this.topGradDark !== dark) {
      this.topGrad = c.createLinearGradient(0, 0, 0, H * 0.6);
      this.topGrad.addColorStop(0, dark ? 'rgba(35,128,78,0.16)' : 'rgba(35,128,78,0.10)');
      this.topGrad.addColorStop(1, 'rgba(35,128,78,0)');
      this.topGradDark = dark;
    }
    c.fillStyle = this.topGrad;
    c.fillRect(0, 0, W, H * 0.6);

    this.drawHeader(c, ease);

    // 列表：裁剪 + 滚动
    const top = this.headerH;
    const viewH = this.viewH() - top;
    const drag = o.drag || null;
    c.save();
    c.beginPath();
    c.rect(0, top, W, viewH + 10);
    c.clip();
    // 滚动 / 拖动过程中省掉卡片阴影：canvas 的 shadowBlur 在真机上很贵，
    // 这是「滚动卡顿」的主要来源；停下后下一帧自动恢复阴影。
    const scrolling = !!o.scrolling;
    this.cardList(scroll).forEach((item) => {
      if (drag && drag.index === item.index) return;   // 拖动中的那张最后单独画
      if (item.y + item.h > top - 20 && item.y < top + viewH + 40) {
        this.drawCard(c, item.game, item.y, item.h, ease, false, scrolling);
      }
    });
    // 被拖动的那张：跟手 + 抬起效果
    if (drag) {
      const game = this.data.games[drag.index];
      if (game) {
        const h = this.cardHeight(game);
        this.drawCard(c, game, drag.top, h, Math.max(ease, 1), true, false);
      }
    }
    c.restore();

    // 烟花画在卡片之上（不然全被卡片挡住），只是装饰、不注册命中区，滚动 / 拖动照旧
    this.celebration.draw(c, dark);

    // 底部常驻提示：绿底白字小标签（不透明 + 轻投影，自己浮在列表之上；不再铺底部渐隐）
    const hint = t('achvDragHint');
    const hintSize = 10;
    const pillH = 20;
    const pillW = Math.min(W - 24, D.measure(c, hint, hintSize, 'bold') + 22);
    const pillX = (W - pillW) / 2;
    const pillY = H - this.safeBottom - 20 - pillH / 2;
    c.save();
    c.shadowColor = dark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.2)';
    c.shadowBlur = 8;
    c.shadowOffsetY = 2;
    D.fillRoundRect(c, pillX, pillY, pillW, pillH, pillH / 2, T.primary);
    c.restore();
    D.text(c, hint, W / 2, pillY + pillH / 2, {
      size: hintSize, weight: 'bold', color: '#ffffff', align: 'center',
    });

    // 滚动条
    const max = this.maxScroll();
    if (max > 0 && viewH > 0) {
      const railH = Math.max(30, (viewH * viewH) / Math.max(viewH, this.contentHeight()));
      const railY = top + ((viewH - railH) * scroll) / max;
      D.fillRoundRect(c, W - 5, railY, 2.5, railH, 1.25, T.border);
    }

    if (interactive && ease > 0.75) {
      // 关闭按钮画在「成就」FAB 那一格（由 scene 提供矩形）
    }
  }

  drawHeader(c, ease) {
    const T = theme.tokens;
    const s = this.data.summary;
    const alpha = Math.min(1, Math.max(0, (ease - 0.2) / 0.5));
    c.save();
    c.globalAlpha = alpha;

    const top = this.safeTop + 18;
    D.text(c, t('achvTitle'), W / 2, top, {
      size: 19, weight: 'bold', color: T.text, align: 'center',
    });
    D.text(c, t('achvSubtitle'), W / 2, top + 20, {
      size: 10, color: T.muted, align: 'center',
    });

    // 三个总览小卡
    const gap = 8;
    const chipW = (CARD_W - gap * 2) / 3;
    const chipH = 46;
    const chipY = top + 32;
    const chips = [
      { value: `${s.unlocked}/${s.total}`, label: t('achvChipAchv'), accent: T.primary },
      { value: `${s.cleared}/25`, label: t('achvChipCleared'), accent: T.god || T.primary },
      { value: String(s.plays), label: t('achvChipPlays'), accent: T.info || T.primary },
    ];
    chips.forEach((chip, i) => {
      const x = SIDE + i * (chipW + gap);
      glassCard(c, x, chipY, chipW, chipH, 12, theme.dark);
      D.text(c, chip.value, x + chipW / 2, chipY + 18, {
        size: 17, weight: 'bold', color: chip.accent, align: 'center',
      });
      D.text(c, chip.label, x + chipW / 2, chipY + 35, {
        size: 9, color: T.muted, align: 'center',
      });
    });
    c.restore();
  }

  drawCard(c, game, y, h, ease, lifted, flat) {
    const T = theme.tokens;
    const dark = !!theme.dark;
    const alpha = Math.min(1, Math.max(0, (ease - 0.25) / 0.5));
    c.save();
    c.globalAlpha = lifted ? 1 : alpha;
    if (lifted) {
      // 抬起来：略放大，阴影由 glassCard 加重
      c.translate(W / 2, y + h / 2);
      c.scale(1.02, 1.02);
      c.translate(-W / 2, -(y + h / 2));
    }
    // 某个游戏的成就全部达成：整张卡换成浅橙底
    const allDone = !game.hidden && game.achv.length > 0 && game.achv.every((a) => a.unlocked);
    glassCard(c, SIDE, y, CARD_W, h, 14, dark, lifted, flat, allDone);

    // 左 3：只有图标 + 游戏名，整组垂直居中（成绩行留给右侧的指标行，这里不放）
    const cx = SIDE + LEFT_W / 2;
    // 名字放不下一行时按空格折成两行（英文 "Hidden achievements" 这种），整组仍居中
    const nameLines = wrapName(game.name, LEFT_W - 16);
    const nameH = nameLines.length * NAME_LH;
    const blockH = HEX_R * 2 + 8 + nameH;
    const blockTop = y + (h - blockH) / 2;
    // 图标 44px（半径 22），与名字之间留 ~8px 空隙
    this.drawHexIcon(c, cx, blockTop + HEX_R, HEX_R, game);
    nameLines.forEach((line, i) => {
      D.text(c, line, cx, blockTop + HEX_R * 2 + 8 + NAME_LH * (i + 0.5), {
        size: 12, weight: 'bold', color: T.text, align: 'center',
      });
    });

    // 左 3 / 右 7 之间的极淡分隔线
    // 分隔线只占卡片内高的 75%，短一点更像「分栏」而不是贯穿卡片的竖线
    const divH = Math.round((h - CARD_PAD * 2 - 6) * 0.75);
    D.divider(c, SIDE + LEFT_W, y + h / 2, divH, T.border, 1);

    // 右 7：成就列表，垂直居中
    const rows = game.achv.length;
    const rowW = RIGHT_W - ROW_GAP - 10;
    if (game.hidden) {
      const listH = rows * HIDDEN_ROW_H;
      let rowY = y + (h - listH) / 2;
      game.achv.forEach((item) => {
        this.drawHiddenRow(c, SIDE + LEFT_W + ROW_GAP, rowY, rowW, HIDDEN_ROW_H, item, dark);
        rowY += HIDDEN_ROW_H;
      });
    } else {
      const listH = rows * ROW_H;
      let rowY = y + (h - listH) / 2;
      game.achv.forEach((a) => {
        this.drawAchvRow(c, SIDE + LEFT_W + ROW_GAP, rowY, rowW, ROW_H - 6, a, dark);
        rowY += ROW_H;
      });
    }
    c.restore();
  }

  drawHexIcon(c, cx, cy, r, game) {
    const T = theme.tokens;
    const accent = game.accent || T.primary;
    c.save();
    c.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const a = Math.PI / 6 + (Math.PI / 3) * i;
      const x = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) c.moveTo(x, py);
      else c.lineTo(x, py);
    }
    c.closePath();
    c.fillStyle = D.mix(accent, theme.tokens.card, 0.82);
    c.fill();
    c.strokeStyle = D.mix(accent, theme.tokens.card, 0.45);
    c.lineWidth = 1;
    c.stroke();
    c.restore();
    if (game.icon === 'daily') {
      drawCalendar(c, cx, cy, Math.round(r * 1.05), accent);
      return;
    }
    if (game.icon) icons.draw(c, game.icon, cx, cy, Math.round(r * 0.92), accent);
  }

  // 隐藏成就行：未达成只有 ****** + 未达成；达成后显示橙色名字 + 一句说明
  drawHiddenRow(c, x, y, w, h, item, dark) {
    const T = theme.tokens;
    if (!item || !item.unlocked) {
      D.text(c, t('achvHiddenLocked'), x + 12, y + h / 2, { size: 11.5, weight: 'bold', color: T.muted });
      D.text(c, t('achvNotDone'), x + w - 12, y + h / 2, { size: 10, color: T.muted, align: 'right' });
      return;
    }
    D.text(c, item.name, x + 12, y + 11, { size: 11.5, weight: 'bold', color: T.god });
    D.text(c, item.desc, x + 12, y + 24, { size: 9, color: T.muted });
    // 暗色主题下成功态用白色，绿字绿底看不清
    D.text(c, t('achvDone'), x + w - 12, y + 11, {
      size: 10, weight: 'bold', color: dark ? '#ffffff' : T.primary, align: 'right',
    });
  }

  drawAchvRow(c, x, y, w, h, a, dark) {
    const T = theme.tokens;
    if (a.stat) {
      // 纯指标行（最高资产 / 最大单次得分…）：没有进度条，只显示数值
      D.text(c, a.name, x + 12, y + h / 2, { size: 11.5, color: T.muted });
      const val = a.value > 0 ? `${a.value}${a.unit ? ` ${t(a.unit)}` : ''}` : '—';
      D.text(c, val, x + w - 12, y + h / 2, { size: 10.5, weight: 'bold', color: T.text, align: 'right' });
      return;
    }
    const done = !!a.unlocked;
    // ratio 在数据层算好（「越小越好」的成就不能直接用 value/target）
    const ratio = Math.max(0, Math.min(1, a.ratio == null ? (a.value / a.target) : a.ratio));
    // 药丸底保持原来的中性色（只是衬托），真正的「进展」用浅绿色填充
    D.fillRoundRect(c, x, y, w, h, h / 2, dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.035)');
    if (ratio > 0) {
      c.save();
      D.roundRect(c, x, y, w, h, h / 2);
      c.clip();
      // 浅绿：暗色主题用 #4f9e74（浅色文字仍可读），亮色主题用 #8fd3af（深色文字仍可读）
      c.fillStyle = dark ? 'rgba(79,158,116,0.88)' : 'rgba(143,211,175,0.92)';
      c.fillRect(x, y, w * (done ? 1 : ratio), h);
      c.restore();
    }
    // 暗色主题里成功态的绿压在浅绿填充上几乎看不见，统一改白色（亮色主题仍用主色绿）
    const okColor = dark ? '#ffffff' : T.primary;
    // 左侧标记
    const markX = x + h / 2 + 1;
    if (done) {
      if (!icons.draw(c, 'check-all', markX, y + h / 2, 10, okColor)) {
        D.circle(c, markX, y + h / 2, 3, okColor);
      }
    } else {
      D.circle(c, markX, y + h / 2, 2.2, D.mix(T.muted, T.card, 0.45));
    }
    D.text(c, a.name, x + h + 4, y + h / 2, {
      size: 11.5, color: done ? T.text : T.muted,
    });
    // 计数型成就（累计胜利 / 达成 N 次）显示「x 次」，不是 x/target
    let label;
    if (a.counter) label = `${a.value} ${t('achvTimes')}`;
    else if (done) label = t('achvDone');
    else label = `${Math.min(a.value, a.target)}/${a.target}`;
    D.text(c, label, x + w - 12, y + h / 2, {
      size: 10, weight: done ? 'bold' : 'normal', color: done ? okColor : T.muted, align: 'right',
    });
  }
}

module.exports = AchvPage;
