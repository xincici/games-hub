// 背景音乐 + 游戏音效，全部走 **Web Audio API**。
//
// 为什么不用 <audio>：
// 1. <audio>（尤其带 play() 的同时）会向系统申请媒体会话，在 iOS/安卓上**抢音频焦点** ——
//    会打断用户正在听的播客 / 音乐，也会在锁屏出媒体控件。Web Audio 的 AudioBufferSourceNode
//    只在页面内部混音，不注册媒体会话，**不夺取音频焦点**（用户要求）。
// 2. 12 首音乐随机循环 + 淡入淡出 + 音效叠在音乐上，用一条 GainNode 图比切 <audio> 干净。
//
// 约束：
// - 浏览器（尤其 iOS Safari）要求 AudioContext 在**用户手势**里 resume，所以第一次 pointerdown/
//   keydown 时解锁；解锁前不报错、也不排队播放，解锁后如果用户已经开了音乐就自动开始。
// - 页面不可见（切后台 / 切标签）时 suspend 整个 context：音乐**自动暂停**，回来 resume 从原位置继续。
import { ref, watch } from 'vue';

import { musicOn, sfxOn } from './settings';

// public/audio/music 下的 12 首（大小各 ~0.8MB）
const TRACKS = [
  'huan-le-dou-di-zhu.mp3',
  'scarborough-fair.mp3',
  'shi-ji.mp3',
  'tou-gong.mp3',
  'xi-yang-yang.mp3',
  'xianjian-hui-meng-you-xian.mp3',
  'xianjian-shu-shan-gu-dao.mp3',
  'xianjian-suo-yao-ta.mp3',
  'xianjian-yong-an-dang.mp3',
  'xianjian-yu-jian-jiang-hu.mp3',
  'xianjian-yu-man-tang.mp3',
  'yu-zhou-chang-wan.mp3',
];
const SFX_FILES = {
  success: 'sfx/success.mp3',
  lose: 'sfx/lose.mp3',
  elimination: 'sfx/elimination.mp3',
  fail: 'sfx/fail.mp3',
  firework: 'sfx/firework-success.mp3',
};

const MUSIC_GAIN = 0.3;
const SFX_GAIN = 0.9;
const MASTER_GAIN = 0.9;
const FADE_IN = 0.8;
const GAP_MS = 600;        // 两首之间的留白

const audioUrl = rel => `${import.meta.env.BASE_URL}audio/${rel}`;

let ctx = null;
let master = null;
let musicGain = null;
let sfxGain = null;
const buffers = new Map();      // url -> AudioBuffer（解码结果，长期复用）
let musicSource = null;
let nextTimer = 0;
let trackIndex = -1;
let unlocked = false;

export const musicPlaying = ref(false);   // 给设置面板显示状态用

function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(ctx.destination);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0;
  musicGain.connect(master);
  sfxGain = ctx.createGain();
  sfxGain.gain.value = SFX_GAIN;
  sfxGain.connect(master);
  return ctx;
}

async function load(url) {
  if (buffers.has(url)) return buffers.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`audio ${res.status}: ${url}`);
  const arr = await res.arrayBuffer();
  const buf = await ctx.decodeAudioData(arr);
  buffers.set(url, buf);
  return buf;
}

const visible = () => document.visibilityState === 'visible';
const shouldPlayMusic = () => musicOn.value && visible() && unlocked && !!ctx;

// 解锁：必须在用户手势里调用（iOS 的硬性要求）
function unlock() {
  const c = ensureCtx();
  if (!c || unlocked) return;
  unlocked = true;
  if (c.state === 'suspended') c.resume().catch(() => {});
  syncMusic();
}

// ---------- 背景音乐 ----------

function pickTrack() {
  if (TRACKS.length <= 1) return 0;
  let i = trackIndex;
  while (i === trackIndex) i = Math.floor(Math.random() * TRACKS.length);
  return i;
}

function scheduleNext() {
  clearTimeout(nextTimer);
  nextTimer = window.setTimeout(() => { if (shouldPlayMusic()) playNext(); }, GAP_MS);
}

async function playNext() {
  if (!shouldPlayMusic()) return;
  const c = ctx;
  const index = pickTrack();
  trackIndex = index;
  let buf;
  try {
    buf = await load(audioUrl(`music/${TRACKS[index]}`));
  } catch {
    // 单曲加载失败就跳过，别把整个循环卡死
    scheduleNext();
    return;
  }
  if (!shouldPlayMusic()) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(musicGain);
  // 淡入，避免两句中间"啪"地一声
  const now = c.currentTime;
  musicGain.gain.cancelScheduledValues(now);
  musicGain.gain.setValueAtTime(0.0001, now);
  musicGain.gain.exponentialRampToValueAtTime(MUSIC_GAIN, now + FADE_IN);
  musicSource = src;
  musicPlaying.value = true;
  src.onended = () => {
    if (musicSource !== src) return;
    musicSource = null;
    musicPlaying.value = false;
    scheduleNext();
  };
  src.start(now);
}

function stopMusic() {
  clearTimeout(nextTimer);
  nextTimer = 0;
  const gain = musicGain;
  const src = musicSource;
  musicSource = null;
  musicPlaying.value = false;
  if (!src || !gain || !ctx) return;
  // 0.35s 淡出后再停，避免硬切
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  try { src.stop(now + 0.4); } catch { /* 已停过 */ }
}

function syncMusic() {
  if (shouldPlayMusic()) {
    if (!musicSource) playNext();
  } else {
    stopMusic();
  }
}

// 后台 / 回到前台：suspend 让整条音频图暂停（回来 resume 会从原位置继续），
// 同时停掉音乐源，回前台重新挑一首接着放（比"回到原曲半截"更自然）。
function onVisibility() {
  if (!ctx) return;
  if (visible()) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    syncMusic();
  } else {
    stopMusic();
    if (ctx.state === 'running') ctx.suspend().catch(() => {});
  }
}

// ---------- 音效 ----------

export async function playSfx(name) {
  if (!sfxOn.value) return;
  const file = SFX_FILES[name];
  if (!file) return;
  const c = ensureCtx();
  if (!c) return;
  if (!unlocked) return;                 // 还没被用户激活过，浏览器不会允许出声
  if (c.state === 'suspended') {
    try { await c.resume(); } catch { return; }
  }
  let buf;
  try {
    buf = await load(audioUrl(file));
  } catch {
    return;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(sfxGain);
  src.start();
}

// 三个语义化入口：胜利 / 失败 / 消除一次
export const playWin = () => playSfx('success');
export const playLose = () => playSfx('lose');
// 刚放过「连击烟花」的时间点：同一次消除里不要再叠一声消除音（用户要求「替换」而不是叠加）
let lastFireworkAt = 0;
const ELIM_REPLACE_MS = 240;

export const playFirework = () => {
  lastFireworkAt = performance.now();
  playSfx('firework');
};
export const playElimination = () => {
  // 连击 / 多消已经在同一瞬间播了烟花，这里直接跳过 —— 单个消除没有烟花，照常播 elimination
  if (performance.now() - lastFireworkAt < ELIM_REPLACE_MS) return;
  playSfx('elimination');
};
export const playFail = () => playSfx('fail');   // 扣❤️（选错 / 填错 / 提交错）

// ---------- 启动 ----------

export function initAudio() {
  ensureCtx();
  const onFirstGesture = () => {
    unlock();
    // 解锁后顺手把两个音效解码好（各 25~32KB，已在 SW 预缓存里），第一次过关零延迟
    if (ctx) Object.keys(SFX_FILES).forEach(name => {
      load(audioUrl(SFX_FILES[name])).catch(() => {});
    });
  };
  ['pointerdown', 'keydown', 'touchend'].forEach(ev => {
    window.addEventListener(ev, onFirstGesture, { once: true, passive: true });
  });
  document.addEventListener('visibilitychange', onVisibility);
  // 设置里的开关：一开就放、一关就停（暂停状态由 visibility 管）
  watch(musicOn, () => syncMusic());
}
