// 微信小游戏统一分享入口。
// 转发在右上角菜单 / open-type="share" 按钮均可用；朋友圈分享仅注册 query。

const { t } = require('./i18n');
const homeI18n = require('../games/home/i18n');
const i18nCore = require('./i18n');

if (!i18nCore.__shareHomeRegistered) {
  i18nCore.register('home', homeI18n);
  i18nCore.__shareHomeRegistered = true;
}

const GAME_IDS = [
  'click', 'match', 'point24', 'guess',
  'detective', 'hunter', 'master',
  'g2048', 'three', 'snake', 'link',
  'puzzle', 'mirror', 'down',
  'crush', 'sudoku', 'sort', 'slide',
  'poker', 'mahjong', 'solo',
  'alchemy', 'quesheng', 'legend', 'gambler',
];

let latestSceneId = 'home';

function normalizeGameId(value) {
  const id = typeof value === 'string' ? value : '';
  return GAME_IDS.includes(id) ? id : null;
}

function getQueryGame(options) {
  let query = options && options.query;
  if (query && typeof query === 'string') {
    query = {};
    String(options.query).split('&').forEach((pair) => {
      const [key, value = ''] = pair.split('=');
      if (key) query[decodeURIComponent(key)] = decodeURIComponent(value);
    });
  }
  const sources = [query, options && options.referrerInfo && options.referrerInfo.extraData];
  for (const source of sources) {
    if (!source) continue;
    const id = normalizeGameId(source.game || source.gameId);
    if (id) return id;
  }
  return null;
}

function timelineSupported() {
  if (typeof wx.onShareTimeline !== 'function') return false;
  return true;
}

function titleFor(sceneId) {
  const gameId = normalizeGameId(sceneId);
  return gameId ? `${t('app.shareGamePrefix')} ${t(`home.${gameId}Title`)}` : t('app.shareHomeTitle');
}

function syncMenu(sceneId) {
  if (!wx || typeof wx.showShareMenu !== 'function') return;
  latestSceneId = normalizeGameId(sceneId) || 'home';
  const menus = ['shareAppMessage'];
  if (timelineSupported()) menus.push('shareTimeline');
  wx.showShareMenu({ withShareTicket: false, menus });
  if (wx.__gamesShareRegistered) return;
  wx.__gamesShareRegistered = true;
  wx.onShareAppMessage(() => ({
    title: titleFor(latestSceneId),
    query: latestSceneId === 'home' ? '' : `game=${latestSceneId}`,
  }));
  if (timelineSupported()) {
    wx.onShareTimeline(() => ({
      title: titleFor(latestSceneId),
      query: latestSceneId === 'home' ? '' : `game=${latestSceneId}`,
    }));
  }
}

module.exports = {
  GAME_IDS,
  getQueryGame,
  normalizeGameId,
  timelineSupported,
  titleFor,
  syncMenu,
};
