// 音效适配层：web 是 Web Audio（可精确调增益），小程序只有 InnerAudioContext。
// 这里只保留「播一下」的能力，音量靠 volume 一次性设定（没有淡入淡出 —— 已知差异）。
import { sfxOn } from './settings';

const playing = new Set();

function play(file, volume) {
  if (!sfxOn.value) return;          // 设置里关掉音效就静音
  try {
    const a = uni.createInnerAudioContext();
    a.src = `/static/audio/${file}`;
    a.volume = volume;
    a.onEnded(() => { try { a.destroy(); } catch { /* noop */ } playing.delete(a); });
    a.onError(() => { try { a.destroy(); } catch { /* noop */ } playing.delete(a); });
    playing.add(a);
    a.play();
  } catch { /* 静音失败不影响玩 */ }
}

// 连击 / 多消的小烟花（web 的 playFirework）；240ms 内不再叠 elimination —— 与 web 的
// ELIM_REPLACE_MS 同一套规则：「连击 = 烟花音」「单次消除 = elimination」，两者不同时响。
let lastFireworkAt = 0;
const ELIM_REPLACE_MS = 240;

export const playWin = () => play('success.mp3', 0.9);
export const playLose = () => play('lose.mp3', 0.9);
export const playFirework = () => {
  lastFireworkAt = Date.now();
  play('firework-success.mp3', 0.9);
};
export const playElimination = () => {
  if (Date.now() - lastFireworkAt < ELIM_REPLACE_MS) return;
  play('elimination.mp3', 0.8);
};
export const playFail = () => play('fail.mp3', 0.8);
export const stopAll = () => { playing.forEach(a => { try { a.stop(); a.destroy(); } catch { /* noop */ } }); playing.clear(); };
