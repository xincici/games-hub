// 语言：沿用 __games_hub__lang_mode；没有设置时跟随系统（中文 → cn，其余 → en）。
const { getRaw, setRaw } = require('./storage');

const globalDict = {
  cn: {
    backHome: '首页',
    help: '帮助',
    close: '关闭',
    confirm: '好的，明白',
    rotateTip: '请旋转设备至竖屏',
  },
  en: {
    backHome: 'Home',
    help: 'Help',
    close: 'Close',
    confirm: 'OK, I See',
    rotateTip: 'Please rotate your device to portrait',
  },
};

const dicts = {};

function systemLang() {
  try {
    const info = wx.getSystemInfoSync();
    return /^zh/i.test(info.language || '') ? 'cn' : 'en';
  } catch (e) {
    return 'cn';
  }
}

const saved = getRaw('__games_hub__lang_mode', 'system');
let langMode = saved === 'cn' || saved === 'en' || saved === 'system' ? saved : 'system';
let lang = langMode === 'system' ? systemLang() : langMode;
const listeners = [];

function register(namespace, dict) {
  dicts[namespace] = dict;
}

function t(key) {
  const parts = String(key).split('.');
  const ns = parts.length > 1 ? parts.shift() : '';
  const k = parts.join('.');
  const dict = ns ? dicts[ns] : null;
  return (dict && (dict[lang] || {})[k]) || (dict && (dict.cn || {})[k])
    || (globalDict[lang] || {})[key] || globalDict.cn[key] || key;
}

function setLangMode(next) {
  langMode = next === 'cn' || next === 'en' ? next : 'system';
  lang = langMode === 'system' ? systemLang() : langMode;
  setRaw('__games_hub__lang_mode', langMode);
  listeners.forEach((fn) => fn(lang));
}

// 兼容旧调用：明确传 cn / en 时等同于 setLangMode
function setLang(next) { setLangMode(next); }

function onChange(fn) {
  listeners.push(fn);
}

module.exports = {
  register,
  t,
  get lang() { return lang; },
  get langMode() { return langMode; },
  get systemLang() { return systemLang(); },
  setLang,
  setLangMode,
  onChange,
};
