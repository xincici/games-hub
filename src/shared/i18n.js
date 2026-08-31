import { ref, computed, watchEffect } from 'vue';

const LANG_KEY = '__games_hub__language';

const home = {
  en: {
    gameTitle: 'Games Hub',
    rotateTip: 'Please rotate your device to portrait',
  },
  cn: {
    gameTitle: '游戏合集',
    rotateTip: '请旋转设备至竖屏',
  },
};

// 每个游戏一份 { en, cn } 字典，按当前路由的游戏命名空间解析
const dicts = { home };

export const registerGame = (id, dict) => {
  dicts[id] = dict;
};

export const activeGame = ref('home');

export const dictOf = id => dicts[id] || home;

export const language = ref(localStorage.getItem(LANG_KEY) || 'cn');

export const toggle = () => {
  language.value = language.value === 'en' ? 'cn' : 'en';
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
  localStorage.setItem(LANG_KEY, language.value);
});

export default {
  install: app => {
    app.config.globalProperties.i18n = i18n;
  }
}
