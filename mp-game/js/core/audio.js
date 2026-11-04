// 小游戏没有 Web Audio；成功 / 失败音效沿用小程序用的同一对 mp3。
//
// 两级开关：
//   1. 全局音效 `__games_hub__sfx`（首页设置里的开关）—— 关掉就全站静音；
//   2. 每个游戏自己的静音 `__games_hub__mute__<sceneId>`（游戏内帮助按钮旁边的静音 FAB）。
//      全局音效关掉时静音 FAB 不展示，但仍保留各自的选择。
const { getRaw, setRaw } = require('./storage');

const MUTE_PREFIX = '__games_hub__mute__';
let gameId = null;          // 当前场景 id（App.openScene 设置），为空时只受全局开关控制

const sources = {
  success: '/audio/success.mp3',
  lose: '/audio/lose.mp3',
  fail: '/audio/fail.mp3',
  elimination: '/audio/elimination.mp3',
  firework: '/audio/firework-success.mp3',
};
const cache = {};

// 全局音效开关（首页设置）
function enabled() {
  return getRaw('__games_hub__sfx', '1') !== '0';
}

// 统一用 globalOn 表达「全局音效开着」，避免各处混用 enabled / globalOn
function globalOn() {
  return enabled();
}

// App.openScene 调一次：之后 play() 只受当前场景的静音影响
function setGame(id) {
  gameId = id || null;
}

function gameOf(id) {
  return id || gameId;
}

// 单个游戏是否静音（默认查当前场景）
function gameMuted(id) {
  const key = gameOf(id);
  if (!key) return false;
  return getRaw(MUTE_PREFIX + key, '0') === '1';
}

// 当前场景是否静音
function muted() {
  return gameMuted();
}

// 切换当前（或指定）场景的静音，返回切换后的状态（true = 已静音）
function toggleMute(id) {
  const key = gameOf(id);
  if (!key) return false;
  const next = !gameMuted(key);
  setRaw(MUTE_PREFIX + key, next ? '1' : '0');
  return next;
}

function get(name) {
  if (!cache[name] && wx.createInnerAudioContext) {
    const audio = wx.createInnerAudioContext();
    audio.src = sources[name];
    audio.onError(() => {});
    cache[name] = audio;
  }
  return cache[name];
}

let lastFireworkAt = 0;
const ELIM_REPLACE_MS = 240;

function play(name) {
  if (!enabled()) return;
  if (muted()) return;          // 本游戏静音：连音效资源都不碰
  const audio = get(name);
  if (!audio) return;
  try {
    audio.stop();
    audio.play();
  } catch (e) {
    // 自动播放限制 / 资源异常不影响游戏
  }
}

function setEnabled(value) {
  setRaw('__games_hub__sfx', value ? '1' : '0');
}

module.exports = {
  get enabled() { return enabled(); },
  globalOn,
  setGame,
  muted,
  gameMuted,
  toggleMute,
  playSuccess: () => play('success'),
  playLose: () => play('lose'),
  playFail: () => play('fail'),
  playFirework: () => { lastFireworkAt = Date.now(); play('firework'); },
  playElimination: () => {
    if (Date.now() - lastFireworkAt < ELIM_REPLACE_MS) return;
    play('elimination');
  },
  setEnabled,
};
