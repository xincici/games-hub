// 语言：沿用 __games_hub__lang_mode；没有设置时跟随系统（中文 → cn，其余 → en）。
const { getRaw, setRaw } = require('./storage');

const globalDict = {
  cn: {
    backHome: '首页',
    cancel: '取消',
    confirmOk: '确定重来',
    confirmReplay: '重玩本关',
    confirmNewTitle: '开始新游戏？',
    confirmNewMsg: '确定重来 会清除当前模式的关卡记录，并从第 1 关重新开始。只想重玩当前关卡，请点「重玩本关」。',
    confirmNewMsgKeepBest: '确定重来 当前关卡会回到第 1 关，最高关卡记录会保留。只想重玩当前关卡，请点「重玩本关」。',
    help: '帮助',
    helpTitle: '玩法介绍',
    achvTitle: '成就殿堂',
    achvSubtitle: '每一局都在刷新记录',
    achvChipAchv: '成就',
    achvChipCleared: '已入门',
    achvChipPlays: '累计对局',
    achvDone: '已达成',
    achvBest: '最佳',
    achvWins: '胜',
    achvPlays: '局',
    achvLocked: '尚未解锁',
    achvNotDone: '未达成',
    achvLv: '关',
    achvStreak: '连胜',
    achvPlaysUnit: '局',
    achvSteps: '步',
    achvScore: '分',
    achvSeconds: '秒',
    achvRows: '排',
    achvMaxTile: '最大牌',
    achvTopScore: '最高分',
    achvTopRows: '最高',
    achvFastest: '最快',
    achvChips: '资产',
    achvCur: '当前',
    achvHigh: '最高',
    achvStage: '闯关',
    achvEndless: '无尽',
    achvDragHint: '长按卡片可拖动排序',
    achvTimes: '次',
    achvLongest: '最长',
    achvOneSlot: '单槽',
    achvTwoSlot: '双槽',
    achvHiddenTitle: '隐藏成就',
    achvHiddenLocked: '******',
    achvHiddenHelp: '求知好学',
    achvHiddenHelpDesc: '查看了所有游戏的玩法规则',
    achvHiddenTime: '我已沉迷',
    achvHiddenTimeDesc: '累计时长超 1 小时，共',
    achvHiddenFail: '锲而不舍',
    achvHiddenFailDesc: '累计失败超 100 次，共',
    achvHiddenLevel: '我爱闯关',
    achvHiddenLevelDesc: '闯关类游戏全部超过 10 关',
    achvHours: '小时',
    achvMinutes: '分钟',
    close: '关闭',
    confirm: '好的，明白',
    rotateTip: '请旋转设备至竖屏',
    shareHomeTitle: '蜂窝益智二十五',
    shareGamePrefix: '一起来玩',
  },
  en: {
    backHome: 'Home',
    cancel: 'Cancel',
    confirmOk: 'Start Over',
    confirmReplay: 'Replay Level',
    confirmNewTitle: 'Start a new game?',
    confirmNewMsg: 'Start over - this clears the current mode\'s level records and restarts from level 1. To retry only this level, choose Replay Level.',
    confirmNewMsgKeepBest: 'Start over - the current level goes back to level 1, while your best level is kept. To retry only this level, choose Replay Level.',
    help: 'Help',
    helpTitle: 'How to play',
    achvTitle: 'Hall of Achievements',
    achvSubtitle: 'Every round sets a new record',
    achvChipAchv: 'Badges',
    achvChipCleared: 'Started',
    achvChipPlays: 'Rounds played',
    achvDone: 'Done',
    achvBest: 'Best',
    achvWins: 'wins',
    achvPlays: 'rounds',
    achvLocked: 'Locked',
    achvNotDone: 'Not yet',
    achvLv: 'lv',
    achvStreak: 'streak',
    achvPlaysUnit: 'rounds',
    achvSteps: 'steps',
    achvScore: 'pts',
    achvSeconds: 's',
    achvRows: 'rows',
    achvMaxTile: 'best tile',
    achvTopScore: 'top score',
    achvTopRows: 'best',
    achvFastest: 'fastest',
    achvChips: 'chips',
    achvCur: 'now',
    achvHigh: 'best',
    achvStage: 'stage',
    achvEndless: 'endless',
    achvDragHint: 'Long-press a card to reorder',
    achvTimes: 'times',
    achvLongest: 'best',
    achvOneSlot: '1-slot',
    achvTwoSlot: '2-slot',
    achvHiddenTitle: 'Hidden achievements',
    achvHiddenLocked: '******',
    achvHiddenHelp: 'Curious mind',
    achvHiddenHelpDesc: 'Read every game\'s rules',
    achvHiddenTime: 'Hooked',
    achvHiddenTimeDesc: 'Played over 1 hour, total',
    achvHiddenFail: 'Never give up',
    achvHiddenFailDesc: 'Lost over 100 times, total',
    achvHiddenLevel: 'Level hunter',
    achvHiddenLevelDesc: 'Cleared level 10+ in every stage game',
    achvHours: 'h',
    achvMinutes: 'min',
    close: 'Close',
    confirm: 'OK, I See',
    rotateTip: 'Please rotate your device to portrait',
    shareHomeTitle: 'Hex Puzzle 25',
    shareGamePrefix: 'Play',
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

register('app', globalDict);

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
