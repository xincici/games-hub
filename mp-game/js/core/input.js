const { W, H, DPR } = require('./canvas');

function norm(v, max) {
  // 某些基础库的 touch 坐标是物理像素；超过逻辑宽度 1.2 倍时按 DPR 折回。
  return v > max * 1.2 ? v / DPR : v;
}

class Input {
  constructor() {
    this.buttons = [];
    this.activeId = null;
    this.startPoint = null;
    this.onStart = null;
    this.onMove = null;
    this.onEnd = null;
    wx.onTouchStart((event) => this.onTouchStart(event));
    wx.onTouchEnd((event) => this.onTouchEnd(event));
    if (wx.onTouchCancel) wx.onTouchCancel(() => this.cancel());
    if (wx.onTouchMove) wx.onTouchMove((event) => this.onTouchMove(event));
  }

  setButtons(buttons) {
    this.buttons = buttons || [];
  }

  point(event) {
    const t = (event.touches && event.touches[0]) || (event.changedTouches && event.changedTouches[0]);
    if (!t) return null;
    const x = t.clientX !== undefined ? t.clientX : t.pageX !== undefined ? t.pageX : t.x;
    const y = t.clientY !== undefined ? t.clientY : t.pageY !== undefined ? t.pageY : t.y;
    return { x: norm(x, W), y: norm(y, H) };
  }

  find(x, y) {
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (x >= b.x && y >= b.y && x <= b.x + b.w && y <= b.y + b.h) return b;
    }
    return null;
  }

  onTouchStart(event) {
    const p = this.point(event);
    if (!p) return;
    this.startPoint = p;
    const b = this.find(p.x, p.y);
    this.activeId = b ? b.id : null;
    if (this.onStart) this.onStart(p);
  }

  onTouchMove(event) {
    const p = this.point(event);
    if (!p) return;
    if (this.startPoint) {
      const dx = p.x - this.startPoint.x;
      const dy = p.y - this.startPoint.y;
      if (this.activeId && dx * dx + dy * dy > 100) this.activeId = null;
    }
    if (this.onMove) this.onMove(p);
  }

  onTouchEnd(event) {
    const p = this.point(event);
    const id = this.activeId;
    this.activeId = null;
    this.startPoint = null;
    if (this.onEnd) this.onEnd(p);
    if (!p || !id) return;
    const b = this.find(p.x, p.y);
    if (b && b.id === id && b.onTap) b.onTap();
  }

  cancel() {
    this.activeId = null;
    this.startPoint = null;
    if (this.onEnd) this.onEnd(null);
  }
}

module.exports = Input;
