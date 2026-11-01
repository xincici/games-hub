// 与 web App.vue 的 --lamp-* / --card-* / --god-bg 等 token 对齐。
// 颜色在 canvas 里要参与插值，所以灯色统一用 [r,g,b,a]；其余颜色保持字符串。
const { getRaw } = require('./storage');

const LIGHT = {
  bg: '#f0f2f5',
  card: '#ffffff',
  text: '#2c3e50',
  muted: '#5f6b7a',
  border: '#e1e1e1',
  primary: '#23804e',
  god: '#c2410c',
  disabled: '#aaaaaa',
  win: '#12833f',
  lose: '#b11b1b',
  cellMask: '#c9ced6',
  enter: '#e5f6ec',
  enterColor: '#12833f',
  keyBg: '#f0f2f5',
  keyActive: '#e3e6ea',
  delBg: '#f3e8e8',
  delColor: '#b8433d',
  boardBg: '#bbada0',
  boardDot: 'rgba(255,255,255,0.18)',
  tileBorder: '#c9d0da',
  del: '#b8433d',
  overlay: 'rgba(255,255,255,0.8)',
  cardShadow: 'rgba(0,0,0,0.08)',
  lamp: {
    housingOff: [28, 35, 45, 1],
    housingHalf: [35, 32, 25, 1],
    housingOn: [58, 49, 25, 1],
    bulbOff: [57, 65, 79, 1],
    bulbHalf: [217, 148, 51, 1],
    bulbFull: [255, 246, 207, 1],
    glowHalf: [217, 148, 51, 0.34],
    glowFull: [255, 205, 90, 0.85],
    rimHalf: [255, 214, 102, 0.4],
    rimOn: [255, 214, 102, 0.95],
  },
};

const DARK = {
  bg: '#262626',
  card: '#333333',
  text: '#eeeeee',
  muted: '#a3adba',
  border: '#4a4a4a',
  primary: '#23804e',
  god: '#c2410c',
  disabled: '#777777',
  win: '#4ec98a',
  lose: '#e57f79',
  cellMask: '#454545',
  enter: 'rgba(78,201,138,0.16)',
  enterColor: '#4ec98a',
  keyBg: '#3a3a3a',
  keyActive: '#454545',
  delBg: 'rgba(229,127,121,0.14)',
  delColor: '#e57f79',
  boardBg: '#4a443e',
  boardDot: 'rgba(255,255,255,0.08)',
  tileBorder: '#5a5a5a',
  del: '#f5a49e',
  overlay: 'rgba(51,51,51,0.8)',
  cardShadow: 'rgba(0,0,0,0.4)',
  lamp: {
    housingOff: [21, 27, 35, 1],
    housingHalf: [31, 29, 24, 1],
    housingOn: [51, 43, 22, 1],
    bulbOff: [51, 59, 71, 1],
    bulbHalf: [227, 166, 72, 1],
    bulbFull: [255, 249, 220, 1],
    glowHalf: [227, 166, 72, 0.38],
    glowFull: [255, 210, 96, 0.9],
    rimHalf: [255, 214, 102, 0.42],
    rimOn: [255, 214, 102, 0.98],
  },
};

function systemDark() {
  try {
    const info = wx.getSystemInfoSync();
    return info.theme === 'dark';
  } catch (e) {
    return false;
  }
}

const modeKey = '__games_hub__theme_mode';
let mode = getRaw(modeKey, 'system');
let dark = mode === 'dark' || (mode !== 'light' && systemDark());
let tokens = dark ? DARK : LIGHT;
const listeners = [];

function refresh() {
  const nextDark = mode === 'dark' || (mode !== 'light' && systemDark());
  if (nextDark === dark) return;
  dark = nextDark;
  tokens = dark ? DARK : LIGHT;
  listeners.forEach((fn) => fn(tokens));
}

function setMode(next) {
  mode = next;
  try { wx.setStorageSync(modeKey, next); } catch (e) { /* ignore */ }
  refresh();
}

function onChange(fn) {
  listeners.push(fn);
}

// 系统主题变化（基础库支持时）
if (wx.onThemeChange) {
  wx.onThemeChange(() => refresh());
}

module.exports = {
  get tokens() { return tokens; },
  get dark() { return dark; },
  get mode() { return mode; },
  setMode,
  onChange,
  refresh,
};
