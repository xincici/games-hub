// 全局文字大小：首页游戏名称 / 分数区 / 提示信息等统一缩放。
// 只做温和的 0.9 / 1 / 1.1 三档，避免大字号把固定卡片挤坏。
const { getRaw, setRaw } = require('./storage');

const KEY = '__games_hub__text_size';
const FACTORS = { small: 0.9, medium: 1, large: 1.2 };
const ORDER = ['small', 'medium', 'large'];
const listeners = [];

function normalize(value) {
  return FACTORS[value] ? value : 'medium';
}

function factorOf(value) {
  return FACTORS[normalize(value)];
}

let mode = normalize(getRaw(KEY, 'medium'));

function scale(size) {
  return Math.max(1, (size || 0) * factorOf(mode));
}

function setMode(next) {
  const value = normalize(next);
  if (value === mode) return;
  mode = value;
  setRaw(KEY, value);
  listeners.forEach((fn) => {
    try { fn(value); } catch (e) { /* ignore */ }
  });
}

module.exports = {
  KEY,
  ORDER,
  FACTORS,
  get mode() { return mode; },
  get factor() { return factorOf(mode); },
  normalize,
  factorOf,
  scale,
  setMode,
  onChange(fn) { if (typeof fn === 'function') listeners.push(fn); },
};
