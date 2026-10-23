// 背景音乐 + 游戏音效，全部走 **Web Audio API**。
//
// 为什么不用 <audio>：
// 1. <audio>（尤其带 play() 的同时）会向系统申请媒体会话，在 iOS/安卓上**抢音频焦点** ——
//    会打断用户正在听的播客 / 音乐，也会在锁屏出媒体控件。Web Audio 的 AudioBufferSourceNode
//    只在页面内部混音，不注册媒体会话，**不夺取音频焦点**（用户要求）。
// 2. 按场景切歌要交叉淡入淡出、音效要叠在音乐上，用一条 GainNode 图比切 <audio> 干净。
//
// 约束：
// - 浏览器（尤其 iOS Safari）要求 AudioContext 在**用户手势**里 resume，所以第一次 pointerdown/
//   keydown 时解锁；解锁前不报错、也不排队播放，解锁后如果用户已经开了音乐就自动开始。
// - 页面不可见（切后台 / 切标签）时 suspend 整个 context：音乐**自动暂停**，回来 resume。
import { ref, watch } from 'vue';

import { musicOn, sfxOn } from './settings';

// ---------- 场景 ↔ 曲目（一次性定死，用户要求「之后固定下来」）----------
// 首页固定《御剑江湖》；25 个游戏各一首；**26 个文件一一对应，互不重复**。
// 换曲目时：改这里 + 改 docs/ARCHITECTURE.md 里那张表，别动播放逻辑。
export const MUSIC_BY_SCENE = {
  home: 'xianjian-yu-jian-jiang-hu.mp3',        // 御剑江湖 —— 首页
  click: 'xianjian-yang-ming-bai-na.mp3',
  puzzle: 'xianjian-shu-shan-gu-dao.mp3',       // 蜀山故道 —— 迷宫
  guess: 'xianjian-ju-qing-2.mp3',
  poker: 'tou-gong.mp3',                        // 偷功
  three: 'shi-ji.mp3',                          // 四季
  g2048: 'xianjian-xin-xian-jie.mp3',
  snake: 'xianjian-zhan-dou-3.mp3',             // 战斗曲 —— 节奏最快
  match: 'xianjian-yu-man-tang.mp3',            // 雨满塘
  link: 'xianjian-yong-an-dang.mp3',
  detective: 'xianjian-wang-peng-xu.mp3',
  hunter: 'xianjian-tu-ling-zhu.mp3',
  crush: 'xianjian-zhan-dou-4.mp3',
  sudoku: 'xianjian-zi-xuan.mp3',
  master: 'xianjian-jing-tian.mp3',
  down: 'xianjian-wei-zhi-14.mp3',
  slide: 'xianjian-li-shu-shan.mp3',
  sort: 'xianjian-wei-zhi-7.mp3',
  alchemy: 'xianjian-shu-shan-jun-ying.mp3',
  mahjong: 'xianjian-shu-shan.mp3',
  quesheng: 'xianjian-hei-long-kui.mp3',
  legend: 'xianjian-zhu-ti-qu.mp3',             // 主题曲 —— 旗舰
  mirror: 'xianjian-hui-meng-you-xian.mp3',     // 回梦游仙
  point24: 'xianjian-wei-zhi-9.mp3',
  gambler: 'xianjian-zhan-dou-5.mp3',
  solo: 'xianjian-li-san-si.mp3',
};

const SFX_FILES = {
  success: 'sfx/success.mp3',
  lose: 'sfx/lose.mp3',
  elimination: 'sfx/elimination.mp3',
  fail: 'sfx/fail.mp3',
  firework: 'sfx/firework-success.mp3',
};

// 背景音乐音量：用户要求**比他自己设定的音量更小一些**，所以这里只给 0.22（音效是 0.9）
const MUSIC_GAIN = 0.22;
const SFX_GAIN = 0.9;
const MASTER_GAIN = 0.9;
const FADE_IN = 0.9;      // 新曲淡入
const FADE_OUT = 0.6;     // 旧曲淡出
const STOP_FADE = 0.4;    // 关闭音乐时的淡出

const audioUrl = rel => `${import.meta.env.BASE_URL}audio/${rel}`;

let ctx = null;
let master = null;
let musicBus = null;      // 所有背景音乐的总线
let sfxGain = null;
const buffers = new Map();      // url -> AudioBuffer（解码结果，长期复用）
let current = null;             // { scene, source, gain }
let scene = 'home';             // 当前场景（首页 / 某个游戏）
let loadToken = 0;              // 切歌竞态保护：只让最后一次生效
let unlocked = false;

export const musicPlaying = ref(false);
export const musicScene = ref('home');

function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(ctx.destination);
  musicBus = ctx.createGain();
  musicBus.gain.value = MUSIC_GAIN;
  musicBus.connect(master);
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

// ---------- 背景音乐（按场景切换 + 循环 + 交叉淡入淡出）----------

function fadeTo(param, target, seconds) {
  if (!ctx) return;
  const now = ctx.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(Math.max(0.0001, param.value), now);
  param.exponentialRampToValueAtTime(Math.max(0.0001, target), now + seconds);
}

function stopCurrent(fade = FADE_OUT) {
  const old = current;
  current = null;
  musicPlaying.value = false;
  if (!old || !ctx) return;
  fadeTo(old.gain.gain, 0.0001, fade);
  try { old.source.stop(ctx.currentTime + fade + 0.05); } catch { /* 已停过 */ }
}

// 切到某场景的曲目：旧曲淡出、新曲淡入（同一场景重复调用不会重播）
async function playScene(nextScene) {
  if (!shouldPlayMusic()) return;
  if (current && current.scene === nextScene) return;
  const file = MUSIC_BY_SCENE[nextScene] || MUSIC_BY_SCENE.home;
  const token = ++loadToken;
  let buf;
  try {
    buf = await load(audioUrl(`music/${file}`));
  } catch {
    return;   // 单曲加载失败就保持静音，别把整个流程卡死
  }
  if (token !== loadToken || !shouldPlayMusic()) return;
  const c = ctx;
  const gain = c.createGain();
  gain.gain.value = 0.0001;
  gain.connect(musicBus);
  const source = c.createBufferSource();
  source.buffer = buf;
  source.loop = true;                 // 每场景一首，循环播放
  source.connect(gain);
  source.start();
  fadeTo(gain.gain, 1, FADE_IN);
  stopCurrent(FADE_OUT);
  current = { scene: nextScene, source, gain };
  musicPlaying.value = true;
  musicScene.value = nextScene;
}

function stopAllMusic(fade = STOP_FADE) {
  loadToken += 1;
  stopCurrent(fade);
}

// 场景切换（首页 / 进入某个游戏）—— App.vue 跟着路由调它
export function setMusicScene(next) {
  scene = next || 'home';
  musicScene.value = scene;
  if (current && current.scene === scene) return;
  if (shouldPlayMusic()) playScene(scene);
}

function syncMusic() {
  if (shouldPlayMusic()) {
    if (!current) playScene(scene);
  } else {
    stopAllMusic();
  }
}

// 后台 / 回到前台：suspend 让整条音频图暂停（回来 resume 会从原位置继续）
function onVisibility() {
  if (!ctx) return;
  if (visible()) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    syncMusic();
  } else {
    stopAllMusic();
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

// 刚放过「连击烟花」的时间点：同一次消除里不要再叠一声消除音（用户要求「替换」而不是叠加）
let lastFireworkAt = 0;
const ELIM_REPLACE_MS = 240;

// 语义化入口：胜利 / 失败 / 消除一次 / 连击烟花 / 扣心
export const playWin = () => playSfx('success');
export const playLose = () => playSfx('lose');
export const playFirework = () => {
  lastFireworkAt = performance.now();
  playSfx('firework');
};
export const playElimination = () => {
  // 连击 / 多消已经在同一瞬间播了烟花，这里直接跳过 —— 单个消除没有烟花，照常播 elimination
  if (performance.now() - lastFireworkAt < ELIM_REPLACE_MS) return;
  playSfx('elimination');
};
export const playFail = () => playSfx('fail');

// ---------- 启动 ----------

export function initAudio() {
  ensureCtx();
  const onFirstGesture = () => {
    unlock();
    // 解锁后顺手把音效解码好（各几十 KB，已在 SW 预缓存里），第一次过关零延迟
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
