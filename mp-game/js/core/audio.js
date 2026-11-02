// 小游戏没有 Web Audio；成功 / 失败音效沿用小程序用的同一对 mp3。
const { getRaw, setRaw } = require('./storage');

const sources = {
  success: '/audio/success.mp3',
  lose: '/audio/lose.mp3',
  fail: '/audio/fail.mp3',
  elimination: '/audio/elimination.mp3',
  firework: '/audio/firework-success.mp3',
};
const cache = {};

function enabled() {
  return getRaw('__games_hub__sfx', '1') !== '0';
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
