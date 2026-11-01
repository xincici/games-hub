// 顶部自绘导航栏：和微信右上角胶囊按钮（菜单键）垂直对齐。
// 小游戏没有原生导航栏，但胶囊是系统绘制的；home 图标必须落在同一条水平线上，
// 否则会看起来比右侧系统图标低一截。
const { SAFE_TOP } = require('./canvas');

let menu = null;
try {
  if (wx.getMenuButtonBoundingClientRect) menu = wx.getMenuButtonBoundingClientRect();
} catch (e) {
  menu = null;
}

const TOP = menu && menu.height ? menu.top : SAFE_TOP + 6;
const HEIGHT = menu && menu.height ? menu.height : 34;
const HOME_SIZE = 40;
const HOME_RECT = {
  x: 16,
  y: TOP + (HEIGHT - HOME_SIZE) / 2,
  w: HOME_SIZE,
  h: HOME_SIZE,
};
const TITLE_Y = TOP + HEIGHT / 2;

module.exports = { TOP, HEIGHT, HOME_SIZE, HOME_RECT, TITLE_Y, menu };
