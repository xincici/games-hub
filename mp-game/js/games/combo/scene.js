// 组牌闯关：把「麻将英雄·闯关」和「扑克炼金术」的两个模式并成一个三模式游戏。
// 三个模式的规则 / 存档 / 成就统计都沿用各自原实现，这里只做外壳：
// - 用 mode 决定当前交给哪个内嵌场景（AlchemyScene 1/2，MahjongScene 闯关）
// - 顶部标题统一成「组牌闯关」，底部用三格标签替换原来的模式 FAB
// - 帮助 / 结算 / 分享 / 首页返回都代理给内嵌场景
const { Scene } = require('../../core/app');
const theme = require('../../core/theme');
const i18n = require('../../core/i18n');
const { t } = i18n;
const D = require('../../core/draw');
const fabKit = require('../../core/fab');
const icons = require('../../core/icons');
const { getRaw, setRaw } = require('../../core/storage');
const AlchemyScene = require('../alchemy/scene');
const MahjongScene = require('../mahjong/scene');
const comboI18n = require('./i18n');

const MODE_KEY = '__combo__mode';
const MODES = 3;

if (!i18n.__comboRegistered) {
  i18n.register('combo', comboI18n);
  i18n.__comboRegistered = true;
}

class ComboScene extends Scene {
  constructor(app) {
    super(app);
    this.mode = this.loadMode();
    this.inner = null;
    this.buttons = [];
    this.now = Date.now();
    // App 的烟花包装会写这三个字段；内嵌场景的烟花统一走全屏
    this.confetti = [];
    this.confettiUntil = 0;
    this.lastConfettiAt = 0;
    this.createInner();
  }

  loadMode() {
    const raw = Math.floor(+(getRaw(MODE_KEY, 0) || 0));
    return raw >= 0 && raw < MODES ? raw : 0;
  }

  createInner() {
    if (this.inner && this.inner.onHide) {
      try { this.inner.onHide(); } catch (e) { /* 旧场景存档失败不影响切换 */ }
    }
    let inner;
    if (this.mode === 2) {
      inner = new MahjongScene(this.app, { gameId: 'combo', achvMode: 3 });
    } else {
      inner = new AlchemyScene(this.app, { gameId: 'combo', mode: this.mode + 1, achvMode: this.mode + 1 });
    }
    inner.titleText = t('combo.gameTitle');
    // 帮助统一由 App 的全局帮助面板画（文案用 combo.helpMsg），内嵌场景不再画自己那份
    inner.drawHelp = () => {};
    // 胜利烟花走外层，App 会包成整屏礼炮 + 成功音
    inner.startConfetti = (full) => this.startConfetti(full);
    this.inner = inner;
    this.buttons = [];
  }

  setMode(mode) {
    const next = Math.max(0, Math.min(MODES - 1, Math.floor(mode)));
    if (next === this.mode) return;
    this.mode = next;
    setRaw(MODE_KEY, String(next));
    this.createInner();
    this._hasRendered = false;
  }

  toggleMode() { this.setMode((this.mode + 1) % MODES); }

  startConfetti() { /* App.wrapSceneConfetti 会接管成全屏烟花 */ }

  // 帮助由 App 的全局面板统一画（combo.helpMsg）；内嵌场景的 drawHelp 已置空
  drawHelp() {}

  // ---- 代理给内嵌场景（App / 分享 / 返回用到的字段与方法） ----
  get helpOpen() { return this.inner.helpOpen; }
  set helpOpen(v) { this.inner.helpOpen = v; }
  get confirming() { return this.inner.confirming; }
  set confirming(v) { this.inner.confirming = v; }
  get phase() { return this.inner.phase; }
  set phase(v) { this.inner.phase = v; }
  get result() { return this.inner.result; }
  set result(v) { this.inner.result = v; }
  get stage() { return this.inner.stage; }
  set stage(v) { this.inner.stage = v; }
  get score() { return this.inner.score; }
  get level() { return this.inner.level; }
  get best() { return this.inner.best; }
  get shareLine() { return this.inner.shareLine; }
  get points() { return this.inner.points; }
  get cash() { return this.inner.cash; }
  get moves() { return this.inner.moves; }
  get clicks() { return this.inner.clicks; }
  get streak() { return this.inner.streak; }
  get homeRect() { return this.inner.homeRect; }
  get helpFab() { return this.inner.helpFab || null; }
  get helpRect() {
    const r = this.inner.helpFab || this.inner.helpRect;
    if (r && Number.isFinite(r.x)) return r;
    if (this.inner.helpX != null) {
      return { x: this.inner.helpX, y: this.inner.fabY, w: this.inner.fabSize, h: this.inner.fabSize };
    }
    return null;
  }
  get cw() { return this.inner.cw; }
  get boardW() { return this.inner.boardW; }
  get boardH() { return this.inner.boardH; }
  get boardY() { return this.inner.boardY; }

  update(dt) {
    this.now = Date.now();
    if (this.inner.update) this.inner.update(dt);
  }

  onTouchStart(p) { if (this.inner.onTouchStart) this.inner.onTouchStart(p); }
  onTouchMove(p) { if (this.inner.onTouchMove) this.inner.onTouchMove(p); }
  onTouchEnd(p) { if (this.inner.onTouchEnd) this.inner.onTouchEnd(p); }
  onHide() { if (this.inner.onHide) this.inner.onHide(); }
  onShow() { if (this.inner.onShow) this.inner.onShow(); }
  onTheme() { if (this.inner.onTheme) this.inner.onTheme(); }
  onResize() { if (this.inner.onResize) this.inner.onResize(); }
  resultVisible() {
    return this.inner.resultVisible ? this.inner.resultVisible() : true;
  }

  // 模式切换 = 静音左边那颗圆形 FAB（和猎手的三牌面切换同一套），点一下循环 0→1→2
  modeFabRect() {
    const hr = this.helpRect;
    if (!hr) return null;
    const mute = fabKit.muteSlot(hr);
    return fabKit.slotLeft(hr, mute ? 2 : 1);
  }

  drawModeFab(c) {
    if (this.inner.helpOpen || this.inner.confirming) return;
    const T = theme.tokens;
    const r = this.modeFabRect();
    if (!r) return;
    const key = this.mode === 2 ? 'mode-mahjong' : this.mode === 1 ? 'mode-poker' : 'alchemy';
    const fallback = this.mode === 2 ? 'M' : this.mode === 1 ? 'P' : 'A';
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.12)';
    c.shadowBlur = 10;
    c.shadowOffsetY = 2;
    D.circle(c, cx, cy, r.w / 2, T.card);
    c.restore();
    fabKit.stroke(c, cx, cy, r.w / 2, fabKit.borderOf('mode'));
    if (!icons.draw(c, key, cx, cy, 20, T.primary)) {
      D.text(c, fallback, cx, cy, { size: 18, weight: 'bold', color: T.primary, align: 'center' });
    }
    this.addButton('mode', r.x, r.y, r.w, r.h, () => this.toggleMode());
  }

  render(c) {
    this.buttons = [];
    this.inner.render(c);
    this.buttons = this.inner.buttons.filter((b) => b.id !== 'mode');
    this.drawModeFab(c);
    // 内嵌场景的帮助 / 二次确认 / 结算按钮仍然有效（帮助面板由 App 统一接管）
  }
}

ComboScene.MODES = MODES;
module.exports = ComboScene;
