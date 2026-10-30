// 全局设置（首页右下角齿轮）：key 与 web 的 shared/settings.js 完全一致，
// 这样同一个账号在 web 与小程序之间的偏好概念是对得上的。
import { ref } from 'vue';

import { getRaw, setRaw } from './storage';

const KEYS = {
  theme: '__games_hub__theme_mode',   // system / light / dark（小程序暂只支持亮色）
  lang: '__games_hub__lang_mode',     // system / cn / en
  face: '__games_hub__face',          // emoji / poker / mahjong（只作为「玩家没选过」时的默认牌面）
  music: '__games_hub__music',        // '1' / '0'（小程序暂不支持背景音乐）
  sfx: '__games_hub__sfx',            // '1' / '0'
};

// ---------- 语言 ----------
function systemLang() {
  try {
    const sys = uni.getSystemInfoSync();
    return String(sys.language || '').toLowerCase().startsWith('zh') ? 'cn' : 'en';
  } catch {
    return 'cn';
  }
}

function readLangMode() {
  const v = getRaw(KEYS.lang);
  return v === 'cn' || v === 'en' || v === 'system' ? v : 'system';
}

export const langMode = ref(readLangMode());
export const lang = ref(langMode.value === 'system' ? systemLang() : langMode.value);

export function setLangMode(mode) {
  langMode.value = mode;
  setRaw(KEYS.lang, mode);
  lang.value = mode === 'system' ? systemLang() : mode;
}

// ---------- 牌面默认值 ----------
function readFace() {
  const v = getRaw(KEYS.face);
  return v === 'poker' || v === 'mahjong' ? v : 'emoji';
}
export const face = ref(readFace());
export function setFace(v) {
  face.value = v;
  setRaw(KEYS.face, v);
}

// ---------- 音效 ----------
export const sfxOn = ref(getRaw(KEYS.sfx) !== '0');   // 默认开（与 web 一致）
export function setSfxOn(on) {
  sfxOn.value = !!on;
  setRaw(KEYS.sfx, on ? '1' : '0');
}

// ---------- 主题 / 背景音乐：只保留读写，UI 里标注暂不支持 ----------
export const themeMode = ref(getRaw(KEYS.theme) || 'system');
export const musicOn = ref(getRaw(KEYS.music) === '1');
