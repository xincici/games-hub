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

export const playWin = () => play('success.mp3', 0.9);
export const playLose = () => play('lose.mp3', 0.9);
export const playElimination = () => play('elimination.mp3', 0.8);
export const playFail = () => play('fail.mp3', 0.8);
export const stopAll = () => { playing.forEach(a => { try { a.stop(); a.destroy(); } catch { /* noop */ } }); playing.clear(); };
