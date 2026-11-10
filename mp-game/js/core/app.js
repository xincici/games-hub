const { ctx, W, H, DPR, canvas, SAFE_TOP, SAFE_BOTTOM } = require('./canvas');
const Input = require('./input');
const theme = require('./theme');
const audio = require('./audio');
const help = require('./help');
const achv = require('./achv');
const daily = require('./daily');
const confirm = require('./confirm');
const confetti = require('./confetti');
const D = require('./draw');
const icons = require('./icons');
const { t } = require('./i18n');
const fabKit = require('./fab');
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
    share.setCapture((c, x, y, w, h, opts) => this.paintSceneForPoster(c, x, y, w, h, opts));
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

    // 每日挑战：每天第一次进游戏时抽今天的题；完成时给一个不打断操作的提示 + 烟花
    daily.ensureToday();
    daily.setOnComplete((task) => this.notifyDaily(task));
    // 成就：任何一处新解锁都给同样的实时提示（提示条排队，一次只显一条）
    achv.setUnlockHook((names) => this.notifyAchievements(names));
    // 隐藏成就：失败计数（锲而不舍）；后台时把未落盘的时长写掉（我已沉迷）
    audio.setLoseHook(() => achv.markFail());
    wx.onHide(() => {
      achv.flushTime();
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

  // 完成每日挑战 / 解锁成就：烟花 + 顶部一条提示（排队，一次一条，不拦触摸）
  notifyDaily(task) {
    this.pushToast({
      kind: 'daily',
      title: i18n.t('dailyToast'),
      desc: task ? daily.descOf(task) : '',
    });
    this.startCelebration();
    try {
      audio.playSuccess();
    } catch (e) {
      // 音效失败不影响提示
    }
  }

  notifyAchievements(names) {
    if (!names || !names.length) return;
    const desc = names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0];
    this.pushToast({ kind: 'achv', title: i18n.t('achvToastTitle'), desc });
    this.startCelebration();
    try {
      audio.playSuccess();
    } catch (e) {
      // 音效失败不影响提示
    }
  }

  pushToast(toast) {
    if (!toast) return;
    if (!this.toasts) this.toasts = [];
    // 最多排 4 条，避免连解锁一堆时一直弹
    if (this.toasts.length >= 3 && !this.toast) {
      this.toast = null;
      this.toasts.length = 0;
    }
    this.toasts.push(toast);
  }

  drawToast(c) {
    const LIFE = 3200;
    if (!this.toast) {
      const next = this.toasts && this.toasts.length ? this.toasts.shift() : null;
      if (!next) return;
      next.at = Date.now();
      this.toast = next;
    }
    const toast = this.toast;
    const age = Date.now() - toast.at;
    if (age > LIFE) {
      this.toast = null;
      return;
    }
    // 前 260ms 滑入、最后 420ms 淡出
    const inK = Math.min(1, age / 260);
    const outK = age > LIFE - 420 ? (LIFE - age) / 420 : 1;
    const alpha = Math.max(0, Math.min(1, outK)) * inK;
    const T = theme.tokens;
    const dark = !!theme.dark;
    const isAchv = toast.kind === 'achv';
    const accent = isAchv ? T.primary : (T.god || '#c2410c');
    const icon = isAchv ? 'bolt' : 'check-all';
    const w = Math.min(W - 36, 340);
    const h = 84;
    const x = (W - w) / 2;
    const y = SAFE_TOP + 8 + (1 - inK) * -16;
    const r = 18;
    c.save();
    c.globalAlpha = alpha;
    c.shadowColor = 'rgba(0,0,0,0.22)';
    c.shadowBlur = 20;
    c.shadowOffsetY = 6;
    D.fillRoundRect(c, x, y, w, h, r, dark ? '#2f2f31' : '#ffffff');
    c.restore();
    c.save();
    c.globalAlpha = alpha;
    D.strokeRoundRect(c, x, y, w, h, r,
      isAchv
        ? (dark ? 'rgba(79,158,116,0.6)' : 'rgba(35,128,78,0.55)')
        : (dark ? 'rgba(224,150,80,0.55)' : 'rgba(216,138,66,0.55)'), 1.2);
    D.fillRoundRect(c, x + 11, y + 16, 4, h - 32, 2, accent);
    const ix = x + 36;
    const iy = y + h / 2;
    D.circle(c, ix, iy, 17, isAchv
      ? (dark ? 'rgba(79,158,116,0.22)' : 'rgba(35,128,78,0.12)')
      : (dark ? 'rgba(224,150,80,0.2)' : 'rgba(216,138,66,0.13)'));
    if (!icons.draw(c, icon, ix, iy, 19, accent)) {
      D.text(c, isAchv ? '★' : '✓', ix, iy, { size: 17, align: 'center', color: accent });
    }
    const tx = ix + 26;
    D.text(c, toast.title, tx, iy - 11, { size: 15, weight: 'bold', color: T.text });
    let desc = toast.desc || '';
    const maxW = x + w - 16 - tx;
    while (desc.length > 2 && D.measure(c, desc, 11.5) > maxW) desc = `${desc.slice(0, -2)}…`;
    D.text(c, desc, tx, iy + 12, { size: 11.5, color: T.muted });
    c.restore();
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
  // 边缘内滑：只吃左右各 20px，避免和游戏内滑动 / 按钮抢触摸；阈值 72px、竖直偏移 40px 内。
  // 首页在设置 / 成就面板打开时也生效（用来关面板），没面板就完全不拦。
  // ⚠️ 安卓全面屏手势的「边缘返回」由系统 / 微信在触摸到达 canvas 之前消费，JS 拦不到。
  startEdgeSwipe(p) {
    this.edgeSwipe = null;
    if (!p || this.transition) return false;
    // 首页：只有设置 / 成就面板打开时才拦边缘手势（用来关闭面板）；没面板就交给场景
    const onHome = this.sceneId === 'home';
    if (onHome && !(this.scene.overlayOpen && this.scene.overlayOpen())) return false;
    const edge = 20;
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
      // 首页：边缘内滑关掉设置 / 成就面板；游戏内：回首页
      if (this.scene.closeOverlay && this.scene.overlayOpen && this.scene.overlayOpen()) {
        this.scene.closeOverlay();
      } else {
        this.goHome();
      }
    } else if (Math.abs(dy) > 56 || inward < -20) {
      this.edgeSwipe = null;
    }
    return true;
  }

  // 唯一改 sceneId 的地方：同时告诉 audio 当前是哪个场景（静音按游戏独立）
  setSceneId(id) {
    this.sceneId = id || null;
    audio.setGame(this.sceneId);
    // 菜单分享的标题也要跟着当前场景走：以前只在 onShow / 切语言时同步，
    // 在游戏里分享出去的标题一直是首页统称「蜂窝益智二十五」
    share.syncMenu(this.sceneId);
  }

  // 把当前场景画进分享海报的指定矩形里（opts.cover = 铺满裁切，否则完整 contain）。
  // 渲染前临时把结算层（drawResult / drawWin）换成空函数，海报里只留真实的游戏画面。
  paintSceneForPoster(c, x, y, w, h, opts) {
    const scene = this.scene;
    if (!scene || typeof scene.render !== 'function') return false;
    if (!(w > 0) || !(h > 0)) return false;
    const cover = !!(opts && opts.cover);
    const live = !!(opts && opts.live);   // 实时分享：连结算遮罩一起截
    const scale = cover ? Math.max(w / W, h / H) : Math.min(w / W, h / H);
    const dw = W * scale;
    const dh = H * scale;
    const od = scene.drawResult;
    const ow = scene.drawWin;
    try {
      if (od && !live) scene.drawResult = () => {};
      if (ow && !live) scene.drawWin = () => {};
      scene.buttons = [];
      c.save();
      c.beginPath();
      c.rect(x, y, w, h);
      c.clip();
      c.translate(x + (w - dw) / 2, y + (h - dh) / 2);
      c.scale(scale, scale);
      scene.render(c);
      c.restore();
      return true;
    } catch (e) {
      try { c.restore(); } catch (e2) { /* ignore */ }
      return false;
    } finally {
      if (od) scene.drawResult = od;
      if (ow) scene.drawWin = ow;
      scene.buttons = [];
    }
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
  // 帮助 FAB 右上角的小红点：这个游戏的帮助还没看过时显示，看过一次永久消失。
  // 只画一次（App 层），25 个游戏不用各写一遍。
  drawHelpDot(c) {
    const scene = this.scene;
    if (!scene || this.sceneId === 'home' || !this.sceneId) return;
    if (scene.helpOpen || scene.confirming) return;
    if (achv.seenHelp(this.sceneId)) return;
    const helpBtn = scene.buttons.find((b) => b.id === 'help' || b.id === 'fab-help' || b.id === 'help-fab');
    if (!helpBtn) return;
    const T = theme.tokens;
    D.circle(c, helpBtn.x + helpBtn.w * 0.84, helpBtn.y + helpBtn.h * 0.16, 4.2, T.god || T.primary);
  }

  // 左下角统一的「分享」FAB：点是当前界面的实时截图 + 预览弹窗（和结算分享同一条链路）。
  // 边框（胭脂红）和按钮一起画，不再事后补圈。
  drawShareFab(c) {
    const scene = this.scene;
    if (!scene) return;
    if (scene.helpOpen || scene.confirming) return;
    if (typeof scene.overlayOpen === 'function' && scene.overlayOpen()) return;
    if (share.previewOpen() || this.transition) return;
    const size = fabKit.SIZE;
    const rect = { x: 16, y: H - SAFE_BOTTOM - 16 - size, w: size, h: size };
    // 和场景里已有的可点区域重叠时就不画（宁可少一个入口，也不能挡住操作）
    if (scene.buttons.some((b) => fabKit.overlaps(b, rect))) return;
    const app = this;
    fabKit.draw(scene, c, rect, {
      id: 'fab-share',
      kind: 'share',
      icon: false,
      onTap: () => share.openPreview(scene, app.sceneId, { live: true }),
    });
    share.drawShareIcon(c, rect.x + size / 2, rect.y + size / 2, 19, fabKit.ROSE);
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
      // 隐藏成就：游戏内时长累计（首页不算）
      if (this.sceneId && this.sceneId !== 'home') achv.addPlayMs(dt || 16);
      // 成就兜底：有的解锁不走 achv 写入口（场景直接写存档 / 隐藏成就计时），每秒补查一次
      if (now - (this.lastAchvSweep || 0) > 1000) {
        this.lastAchvSweep = now;
        achv.sweepUnlocks();
      }
      this.updateGlobalConfetti(dt);
      if (this.transition) {
        this.drawTransition(ctx);
        confetti.draw(ctx, this.globalConfetti);
        this.input.setButtons([]);
      } else {
        this.scene.buttons = [];
        // 帮助收起动画没播完时也要继续画，否则关闭时没有圆形收缩的效果
        const helpVisible = this.scene.helpOpen || help.animating(this.scene);
        // 隐藏成就：每个游戏的帮助弹窗看过一次就记一个（求知好学）
        if (this.scene.helpOpen && this.markedHelp !== this.sceneId) {
          this.markedHelp = this.sceneId;
          achv.markHelp(this.sceneId);
        }
        const drawHelp = helpVisible && typeof this.scene.drawHelp === 'function'
          ? this.scene.drawHelp : null;
        const drawConfirm = !drawHelp && confirm.canOverride(this.scene) && typeof this.scene.drawConfirm === 'function'
          ? this.scene.drawConfirm : null;
        if (drawHelp) this.scene.drawHelp = () => {};
        if (drawConfirm) this.scene.drawConfirm = () => {};
        this.scene.render(ctx);
        this.drawHelpDot(ctx);
        this.drawShareFab(ctx);
        // 结算态：右上角一枚「炫耀一下」（生成 5:4 海报，点一下发分享）
        if (share.shouldShowChip(this.scene, this.sceneId)) {
          try {
            share.buildPoster(this.scene, this.sceneId);
            // 结算遮罩自己带分享入口的游戏（比如侦探）就不再画兜底那一枚
            const hasOwn = this.scene.buttons.some((b) => b.id === 'share-result');
            if (!hasOwn) share.drawResultChip(ctx, this.scene);
          } catch (e) {
            // 分享出问题不能影响渲染
          }
        }
        this.drawToast(ctx);
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
        // 结算分享的预览弹窗：盖在最上层，点「去分享」才真的分享
        if (share.previewOpen()) {
          this.scene.buttons = [];
          share.drawPreview(ctx, this.scene);
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
