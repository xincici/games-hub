// 小游戏只有一块全屏 canvas，没有 DOM。所有布局都用逻辑像素（pt），
// 物理像素 = 逻辑像素 × devicePixelRatio；绘制前统一 scale，之后坐标不再乘 DPR。
const system = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()) || {};
const screenWidth = system.windowWidth || 375;
const screenHeight = system.windowHeight || 667;
const pixelRatio = system.pixelRatio || 1;
const safeArea = system.safeArea || { top: 0, bottom: screenHeight };
const safeTop = safeArea.top || system.statusBarHeight || 0;
const safeBottom = Math.max(0, screenHeight - (safeArea.bottom || screenHeight));

const canvas = wx.createCanvas();
canvas.width = Math.round(screenWidth * pixelRatio);
canvas.height = Math.round(screenHeight * pixelRatio);

const ctx = canvas.getContext('2d');
ctx.scale(pixelRatio, pixelRatio);
ctx.textBaseline = 'middle';

module.exports = {
  canvas,
  ctx,
  W: screenWidth,
  H: screenHeight,
  DPR: pixelRatio,
  SAFE_TOP: safeTop,
  SAFE_BOTTOM: safeBottom,
};
