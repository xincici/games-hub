const { ctx, W, H, DPR, canvas } = require('./canvas');
const Input = require('./input');
const theme = require('./theme');
const audio = require('./audio');
const help = require('./help');
const achv = require('./achv');
const confirm = require('./confirm');
const confetti = require('./confetti');
const D = require('./draw');
const { t } = require('./i18n');
const i18n = require('./i18n');
const share = require('./share');

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
  // 所有胜利 / 失败遮罩统一延迟 200ms 出现；恢复存档时场景首帧就是结算态，
  // 直接展示，不补这段延时。场景传入的 ms 只做兼容，不再允许拉长。
  resultVisible(ms, key) {
    const now = Date.now();
    const gateKey = key != null ? String(key) : String(this.phase);
    if (!this._hasRendered) {
      this._resultGateKey = gateKey;
      this._resultGateAt = now;
      return true;
    }
    if (this._resultGateKey !== gateKey) {
      this._resultGateKey = gateKey;
      this._resultGateAt = now + 200;
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
    this.edgeSwipe = null;
    this.globalConfetti = [];
    this.globalConfettiUntil = 0;
    this.lastGlobalConfettiAt = 0;
    this.last = Date.now();
    this.frame = this.frame.bind(this);
    this.resize = this.resize.bind(this);
    this.launchGame = share.getQueryGame(wx.getLaunchOptionsSync ? wx.getLaunchOptionsSync() : null);
    this.openScene(SceneClass, { id: 'home' });
    if (this.launchGame) this.openGame(this.launchGame);
    share.syncMenu(this.sceneId);
    this.input.onStart = p => {
      if (this.startEdgeSwipe(p)) return;
      if (this.scene.helpOpen && help.touch(this.scene, 'start', p)) return;
      if (this.scene.onTouchStart) this.scene.onTouchStart(p);
    };
    this.input.onMove = p => {
      if (this.moveEdgeSwipe(p)) return;
      if (this.scene.helpOpen && help.touch(this.scene, 'move', p)) return;
      if (this.scene.onTouchMove) this.scene.onTouchMove(p);
    };
    this.input.onEnd = p => {
      if (this.edgeSwipe) {
        this.edgeSwipe = null;
        return;
      }
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
      share.syncMenu(this.sceneId);
    });
    if (wx.onWindowResize) wx.onWindowResize(this.resize);
    theme.onChange(() => {
      if (this.scene && this.scene.onTheme) this.scene.onTheme();
    });
    i18n.onChange(() => {
      if (this.scene && this.scene.onTheme) this.scene.onTheme();
      share.syncMenu(this.sceneId);
    });
    requestAnimationFrame(this.frame);
  }

  // 胜利烟花统一由 App 持有：场景的 startConfetti 被接管后写全局数组，
  // 因此回首页 / 转场时仍然继续播放，不会随场景销毁。
  startCelebration() {
    this.globalConfetti = [];
    this.globalConfettiUntil = Date.now() + 1200;
    this.lastGlobalConfettiAt = 0;
  }

  wrapSceneConfetti(scene) {
    if (!scene || typeof scene.startConfetti !== 'function') return;
    const original = scene.startConfetti;
    const id = this.sceneId;
    scene.startConfetti = (full) => {
      // 德州扑克的 false / 无参是奖金区小连击，不是胜利烟花。
      if (id === 'poker' && full !== true) {
        original.call(scene, full);
        return;
      }
      this.startCelebration();
      scene.confetti = [];
      scene.confettiUntil = 0;
      scene.lastConfettiAt = 0;
    };
  }

  updateGlobalConfetti(dt) {
    const now = Date.now();
    if (now < this.globalConfettiUntil && now - this.lastGlobalConfettiAt >= 40) {
      this.lastGlobalConfettiAt = now;
      confetti.spawn(this.globalConfetti, { W, H, startY: H * 0.58 });
    }
    this.globalConfetti = confetti.update(this.globalConfetti, dt || 16, H);
  }

  // 模式切换会复用同一个场景实例：恢复到的胜利 / 失败记录要让 resultVisible
  // 走「首帧」分支立即显示，而不是把上一个模式的 gate 再延时 200ms。
  wrapSceneModeSwitch(scene) {
    if (!scene || typeof scene.toggleMode !== 'function') return;
    const original = scene.toggleMode;
    scene.toggleMode = (...args) => {
      const before = scene.mode;
      const result = original.apply(scene, args);
      if (scene.mode !== before) scene._hasRendered = false;
      return result;
    };
  }

  // 屏幕左右边缘向内滑动 = 返回首页（类似系统返回手势）。
  // 只吃边缘 12px，避免和游戏内滑动 / 按钮抢触摸；阈值 72px、竖直偏移 40px 内。
  startEdgeSwipe(p) {
    this.edgeSwipe = null;
    if (!p || this.transition || this.sceneId === 'home') return false;
    const edge = 12;
    if (p.x > edge && p.x < W - edge) return false;
    this.edgeSwipe = {
      side: p.x <= edge ? -1 : 1,
      x: p.x, y: p.y, at: Date.now(),
    };
    return true;
  }

  moveEdgeSwipe(p) {
    if (!this.edgeSwipe) return false;
    if (!p || Date.now() - this.edgeSwipe.at > 700) {
      this.edgeSwipe = null;
      return false;
    }
    const dx = p.x - this.edgeSwipe.x;
    const dy = p.y - this.edgeSwipe.y;
    const inward = this.edgeSwipe.side < 0 ? dx : -dx;
    if (inward >= 72 && Math.abs(dy) <= 40) {
      this.edgeSwipe = null;
      this.goHome();
    } else if (Math.abs(dy) > 56 || inward < -20) {
      this.edgeSwipe = null;
    }
    return true;
  }

  // 唯一改 sceneId 的地方：同时告诉 audio 当前是哪个场景（静音按游戏独立）
  setSceneId(id) {
    this.sceneId = id || null;
    audio.setGame(this.sceneId);
  }

  openScene(SceneClass, options) {
    if (!SceneClass) return;
    if (this.scene && this.scene.onHide) this.scene.onHide();
    this.scene = new SceneClass(this);
    this.setSceneId((options && options.id) || null);
    this.transition = null;
    this.last = Date.now();
    if (this.input) this.input.cancel();
  }

  // 游戏内 FAB 的彩色描边：帮助=橙、静音=绿、模式切换=浅蓝。
  // 统一在 scene.render 之后、帮助面板之前画 —— 面板打开时会自然盖住描边；
  // 不用每个场景各画一遍（25 个场景的 FAB 尺寸 40~48 不等，这里按命中区现算）。
  drawFabRings(c) {
    const scene = this.scene;
    const buttons = scene && scene.buttons;
    if (!buttons || !buttons.length) return;
    const T = theme.tokens;
    const dark = !!theme.dark;
    buttons.forEach((b) => {
      let color = null;
      const id = String(b.id || '');
      if (id === 'help' || id === 'fab-help' || id === 'help-fab') color = T.god;
      else if (id === 'fab-mute') color = T.primary;
      // 模式切换的 id 各场景不统一：mode / fab-mode / fab-mode-emoji / fab-mode-poker …
      else if (/^mode$/.test(id) || /^fab-mode/.test(id)) color = dark ? '#38bdf8' : '#0ea5e9';
      if (!color) return;
      const r = Math.min(b.w, b.h) / 2;
      if (r < 10) return;
      c.save();
      c.strokeStyle = color;
      c.lineWidth = 2;
      c.lineCap = 'round';
      c.beginPath();
      c.arc(b.x + b.w / 2, b.y + b.h / 2, r - 2, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    });
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
      if (this.sceneId !== 'home') this.drawHomeLabel(c, scene, false);
      return true;
    } catch (e) {
      return false;
    }
  }

  // 首页卡片 → 游戏：从卡片中心像 iOS App 一样放大展开
  openGame(id, origin) {
    const SceneClass = this.scenes[id];
    if (!SceneClass) return;
    achv.trackPlay(id);
    const old = this.scene;
    const o = origin || { x: W / 2, y: H / 2 };
    const ok = this.snapshotScene(old);
    if (old && old.onHide) old.onHide();
    this.transition = ok ? {
      direction: 'open', start: Date.now(), duration: 320, origin: o,
      oldSnapshot: this.snapshot, newScene: null,
    } : null;
    this.scene = new SceneClass(this);
    this.setSceneId(id);
    this.wrapSceneConfetti(this.scene);
    this.wrapSceneModeSwitch(this.scene);
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
    this.setSceneId('home');
    this.transition = ok ? {
      direction: 'close', start: Date.now(), duration: 320, origin: origin || { x: W / 2, y: H / 2 },
      oldSnapshot: this.snapshot, newScene: home,
    } : null;
    this.last = Date.now();
    if (this.input) this.input.cancel();
  }

  // 首页图标 + 文案作为一个整体热区；各游戏不用再各自重复实现。
  drawHomeLabel(c, scene, addButton) {
    const r = scene && scene.homeRect;
    if (!r) return;
    const T = theme.tokens;
    const label = t('backHome');
    const size = 11;
    const lw = D.measure(c, label, size, 'bold');
    // 文字紧挨图标可视边缘；homeRect 本身比 24px 图标宽，向右收 5px。
    D.text(c, label, r.x + r.w - 5, r.y + r.h / 2, {
      size, weight: 'bold', color: T.muted, align: 'left',
    });
    if (addButton) {
      scene.addButton('app-home', r.x - 2, r.y, r.w + lw + 2, r.h, () => this.goHome());
    }
  }

  drawHomeAffordance(c) {
    this.drawHomeLabel(c, this.scene, true);
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
      this.drawHomeLabel(c, tr.newScene, false);
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
      this.updateGlobalConfetti(dt);
      if (this.transition) {
        this.drawTransition(ctx);
        confetti.draw(ctx, this.globalConfetti);
        this.input.setButtons([]);
      } else {
        this.scene.buttons = [];
        // 帮助收起动画没播完时也要继续画，否则关闭时没有圆形收缩的效果
        const helpVisible = this.scene.helpOpen || help.animating(this.scene);
        const drawHelp = helpVisible && typeof this.scene.drawHelp === 'function'
          ? this.scene.drawHelp : null;
        const drawConfirm = !drawHelp && confirm.canOverride(this.scene) && typeof this.scene.drawConfirm === 'function'
          ? this.scene.drawConfirm : null;
        if (drawHelp) this.scene.drawHelp = () => {};
        if (drawConfirm) this.scene.drawConfirm = () => {};
        this.scene.render(ctx);
        this.drawFabRings(ctx);
        if (drawHelp) {
          this.scene.drawHelp = drawHelp;
          this.scene.buttons = [];
          help.draw(ctx, this.scene);
        } else if (drawConfirm) {
          this.scene.drawConfirm = drawConfirm;
          this.scene.buttons = [];
          confirm.draw(ctx, this.scene);
        } else {
          help.reset(this.scene);
        }
        if (!this.scene.helpOpen && !this.scene.confirming && this.sceneId !== 'home') this.drawHomeAffordance(ctx);
        confetti.draw(ctx, this.globalConfetti);
        this.scene._hasRendered = true;
        this.input.setButtons(this.scene.buttons);
      }
    }
    requestAnimationFrame(this.frame);
  }
}

module.exports = { App, Scene };
