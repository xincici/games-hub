const { ctx, W, H, DPR, canvas } = require('./canvas');
const Input = require('./input');
const theme = require('./theme');
const audio = require('./audio');
const help = require('./help');

// 场景基类：一个游戏一个 Scene；app 负责输入、帧循环、前后台生命周期。
class Scene {
  constructor(app) {
    this.app = app;
    this.buttons = [];
    this._hasRendered = false;
  }
  addButton(id, x, y, w, h, onTap) {
    this.buttons.push({ id, x, y, w, h, onTap });
  }
  // 结算遮罩至少等 250ms 再出现；若场景已经把 phase 推迟到动画结束，
  // 这里只再补一个短延时，避免“最后一帧突然糊脸”。
  resultVisible(ms, key) {
    const now = Date.now();
    const gateKey = key != null ? String(key) : String(this.phase);
    // 恢复存档时场景首帧就是结算态：直接展示，不再补 250ms 延时。
    if (!this._hasRendered) {
      this._resultGateKey = gateKey;
      this._resultGateAt = now;
      return true;
    }
    if (this._resultGateKey !== gateKey) {
      this._resultGateKey = gateKey;
      this._resultGateAt = now + (ms == null ? 250 : ms);
      return false;
    }
    return now >= this._resultGateAt;
  }
  update() {}
  render() {}
  onHide() {}
  onShow() {}
  onTheme() {}
}

class App {
  constructor(SceneClass, scenes) {
    this.input = new Input();
    this.audio = audio;
    this.scenes = scenes || {};
    this.sceneId = null;
    this.transition = null;
    this.snapshot = null;
    this.snapshotCtx = null;
    this.paused = false;
    this.last = Date.now();
    this.frame = this.frame.bind(this);
    this.resize = this.resize.bind(this);
    this.openScene(SceneClass, { id: 'home' });
    this.input.onStart = p => {
      if (this.scene.helpOpen && help.touch(this.scene, 'start', p)) return;
      if (this.scene.onTouchStart) this.scene.onTouchStart(p);
    };
    this.input.onMove = p => {
      if (this.scene.helpOpen && help.touch(this.scene, 'move', p)) return;
      if (this.scene.onTouchMove) this.scene.onTouchMove(p);
    };
    this.input.onEnd = p => {
      if (this.scene.helpOpen && help.touch(this.scene, 'end', p)) return;
      if (this.scene.onTouchEnd) this.scene.onTouchEnd(p);
    };

    wx.onHide(() => {
      this.paused = true;
      if (this.scene.onHide) this.scene.onHide();
    });
    wx.onShow(() => {
      this.paused = false;
      this.last = Date.now();
      if (this.scene.onShow) this.scene.onShow();
    });
    if (wx.onWindowResize) wx.onWindowResize(this.resize);
    if (wx.onThemeChange) {
      wx.onThemeChange(() => {
        if (this.scene.onTheme) this.scene.onTheme();
      });
    }
    requestAnimationFrame(this.frame);
  }

  openScene(SceneClass, options) {
    if (!SceneClass) return;
    if (this.scene && this.scene.onHide) this.scene.onHide();
    this.scene = new SceneClass(this);
    this.sceneId = (options && options.id) || null;
    this.transition = null;
    this.last = Date.now();
    if (this.input) this.input.cancel();
  }

  ensureSnapshot() {
    if (this.snapshot) return true;
    try {
      if (!wx.createCanvas) return false;
      const snap = wx.createCanvas();
      if (!snap || snap === canvas) return false;
      snap.width = Math.round(W * DPR);
      snap.height = Math.round(H * DPR);
      const sctx = snap.getContext('2d');
      sctx.scale(DPR, DPR);
      this.snapshot = snap;
      this.snapshotCtx = sctx;
      return true;
    } catch (e) {
      return false;
    }
  }

  snapshotScene(scene) {
    if (!scene || !this.ensureSnapshot()) return false;
    try {
      const c = this.snapshotCtx;
      c.clearRect(0, 0, W, H);
      scene.render(c);
      return true;
    } catch (e) {
      return false;
    }
  }

  // 首页卡片 → 游戏：从卡片中心像 iOS App 一样放大展开
  openGame(id, origin) {
    const SceneClass = this.scenes[id];
    if (!SceneClass) return;
    const old = this.scene;
    const o = origin || { x: W / 2, y: H / 2 };
    const ok = this.snapshotScene(old);
    if (old && old.onHide) old.onHide();
    this.transition = ok ? {
      direction: 'open', start: Date.now(), duration: 320, origin: o,
      oldSnapshot: this.snapshot, newScene: null,
    } : null;
    this.scene = new SceneClass(this);
    this.sceneId = id;
    if (this.transition) this.transition.newScene = this.scene;
    this.last = Date.now();
    if (this.input) this.input.cancel();
  }

  // 游戏 → 首页：旧游戏向首页对应卡片收缩
  goHome() {
    const Home = this.scenes.home;
    if (!Home) return;
    const old = this.scene;
    const oldId = this.sceneId;
    const ok = this.snapshotScene(old);
    const home = new Home(this);
    const origin = home.getGameOrigin ? home.getGameOrigin(oldId) : { x: W / 2, y: H / 2 };
    if (old && old.onHide) old.onHide();
    this.scene = home;
    this.sceneId = 'home';
    this.transition = ok ? {
      direction: 'close', start: Date.now(), duration: 320, origin: origin || { x: W / 2, y: H / 2 },
      oldSnapshot: this.snapshot, newScene: home,
    } : null;
    this.last = Date.now();
    if (this.input) this.input.cancel();
  }

  drawTransition(c) {
    const tr = this.transition;
    const p = Math.max(0, Math.min(1, (Date.now() - tr.start) / tr.duration));
    const ease = tr.direction === 'open'
      ? 1 - Math.pow(1 - p, 3)
      : p * p;
    c.fillStyle = theme.tokens.bg;
    c.fillRect(0, 0, W, H);
    if (tr.direction === 'open') {
      if (tr.oldSnapshot) c.drawImage(tr.oldSnapshot, 0, 0, W, H);
      const scale = 0.08 + 0.92 * ease;
      c.save();
      c.globalAlpha = ease;
      c.translate(tr.origin.x, tr.origin.y);
      c.scale(scale, scale);
      c.translate(-tr.origin.x, -tr.origin.y);
      tr.newScene.buttons = [];
      tr.newScene.render(c);
      c.restore();
    } else {
      if (tr.newScene) {
        tr.newScene.buttons = [];
        tr.newScene.render(c);
      }
      if (tr.oldSnapshot) {
        const scale = 1 - 0.92 * ease;
        c.save();
        c.globalAlpha = 1 - ease;
        c.translate(tr.origin.x, tr.origin.y);
        c.scale(scale, scale);
        c.translate(-tr.origin.x, -tr.origin.y);
        c.drawImage(tr.oldSnapshot, 0, 0, W, H);
        c.restore();
      }
    }
    if (p >= 1) this.transition = null;
  }

  resize() {
    // 首版锁竖屏；保留入口给后续多场景做重排。
    if (this.scene.onResize) this.scene.onResize();
  }

  frame() {
    if (!this.paused) {
      const now = Date.now();
      const dt = Math.min(50, now - this.last);
      this.last = now;
      if (this.scene.update) this.scene.update(dt);
      if (this.transition) {
        this.drawTransition(ctx);
        this.input.setButtons([]);
      } else {
        this.scene.buttons = [];
        const drawHelp = this.scene.helpOpen && typeof this.scene.drawHelp === 'function'
          ? this.scene.drawHelp : null;
        if (drawHelp) this.scene.drawHelp = () => {};
        this.scene.render(ctx);
        if (drawHelp) {
          this.scene.drawHelp = drawHelp;
          this.scene.buttons = [];
          help.draw(ctx, this.scene);
        } else {
          help.reset(this.scene);
        }
        this.scene._hasRendered = true;
        this.input.setButtons(this.scene.buttons);
      }
    }
    requestAnimationFrame(this.frame);
  }
}

module.exports = { App, Scene };
