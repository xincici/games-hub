import { ref, computed, watchEffect } from 'vue';

import { resolvedLang, setLangMode } from './settings';


const home = {
  en: {
    gameTitle: 'Games Hub',
    rotateTip: 'Please rotate your device to portrait',
    backHome: 'Home',
    settings: 'Settings',
    settingsClose: 'Close settings',
    settingsTitle: 'Settings',
    theme: 'Theme',
    language: 'Language',
    music: 'Music',
    sfx: 'Sound effects',
    followSystem: 'System',
    light: 'Light',
    dark: 'Dark',
    chinese: '中文',
    english: 'English',
  },
  cn: {
    gameTitle: '游戏合集',
    rotateTip: '请旋转设备至竖屏',
    backHome: '首页',
    settings: '设置',
    settingsClose: '关闭设置',
    settingsTitle: '设置',
    theme: '主题',
    language: '语言',
    music: '背景音乐',
    sfx: '游戏音效',
    followSystem: '跟随系统',
    light: '浅色',
    dark: '深色',
    chinese: '中文',
    english: 'English',
  },
};

// 每个游戏一份 { en, cn } 字典，按当前路由的游戏命名空间解析
const dicts = { home };

export const registerGame = (id, dict) => {
  dicts[id] = dict;
};

export const activeGame = ref('home');

export const dictOf = id => dicts[id] || home;

// 语言的**唯一真相**在 shared/settings.js（system / cn / en 三档，系统语言非中英时降级 en）。
// 这里保留 language（'cn' | 'en'）与 toggle 两个老接口。
export const language = computed(() => resolvedLang.value);

export const toggle = () => {
  setLangMode(language.value === 'en' ? 'cn' : 'en');
};

const currentDict = computed(() => dicts[activeGame.value] || home);

export const i18n = fullKey => {
  const value = fullKey.split('.').reduce((obj, key) => {
    if (obj) return obj[key];
  }, currentDict.value[language.value]);
  if (value !== undefined) return value;
  return fullKey.split('.').reduce((obj, key) => {
    if (obj) return obj[key];
  }, home[language.value]);
};

// 帮助条目：help1 ~ help9 存在几个渲染几个
export const helpItems = () => {
  const items = [];
  for (let i = 1; i <= 9; i++) {
    const text = i18n(`help${i}`);
    if (text === undefined) break;
    items.push(text);
  }
  return items;
};

watchEffect(() => {
  document.title = i18n('gameTitle') || 'Games Hub';
});

export default {
  install: app => {
    app.config.globalProperties.i18n = i18n;
  }
}
