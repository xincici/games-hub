// 全局设置：主题 / 语言 / 背景音乐 / 游戏音效
//
// - 主题与语言都有「跟随系统」选项，**默认都是跟随系统**；
// - 语言在系统既不是中文也不是英文时**降级英文**；
// - 主题与语言的「应用」也集中在这里（往 body 挂 .dark、改 theme-color、改 <html lang>），
//   所以 theme.js / i18n.js 只需要从这里读 resolved 值，不再各自持有状态（避免两份真相）；
// - 旧的 __games_hub__theme / __games_hub__language 会被迁移成 light/dark、cn/en 的显式选择。
import { computed, ref, watch } from 'vue';

const KEY = {
  themeMode: '__games_hub__theme_mode',   // system | light | dark
  langMode: '__games_hub__lang_mode',     // system | cn | en
  music: '__games_hub__music',            // '1' | '0'
  sfx: '__games_hub__sfx',                // '1' | '0'
  legacyTheme: '__games_hub__theme',      // 旧的布尔开关
  legacyLang: '__games_hub__language',    // 旧的 'cn' | 'en'
};

const readStr = (key, fallback) => {
  const raw = localStorage.getItem(key);
  return raw === null ? fallback : raw;
};
const readBool = (key, fallback) => {
  const raw = localStorage.getItem(key);
  return raw === null ? fallback : raw === '1';
};

// 旧 key 迁移：只做一次，之后完全由新 key 决定
function migrateThemeMode() {
  const legacy = localStorage.getItem(KEY.legacyTheme);
  if (legacy === null || localStorage.getItem(KEY.themeMode) !== null) return null;
  return legacy === '1' ? 'dark' : 'light';
}
function migrateLangMode() {
  const legacy = localStorage.getItem(KEY.legacyLang);
  if (legacy === null || localStorage.getItem(KEY.langMode) !== null) return null;
  return legacy === 'en' ? 'en' : 'cn';
}

export const themeMode = ref(migrateThemeMode() || readStr(KEY.themeMode, 'system'));
export const langMode = ref(migrateLangMode() || readStr(KEY.langMode, 'system'));
export const musicOn = ref(readBool(KEY.music, false));   // 默认关：不请自来地放音乐很打扰
export const sfxOn = ref(readBool(KEY.sfx, true));       // 默认开：只有过关 / 失败两个音

// ---------- 系统偏好 ----------

const darkQuery = typeof matchMedia === 'function'
  ? matchMedia('(prefers-color-scheme: dark)')
  : null;
export const systemDark = ref(darkQuery ? darkQuery.matches : false);
darkQuery?.addEventListener?.('change', ev => { systemDark.value = ev.matches; });

// 只看**首选**语言：中文（zh / zh-Hans / zh-Hant / zh-HK…）→ cn，英文（en / en-US…）→ en，
// 其它一律降级 en。
export function detectSystemLang() {
  const nav = typeof navigator === 'undefined' ? null : navigator;
  if (!nav) return 'en';
  const primary = (nav.languages && nav.languages[0]) || nav.language || '';
  const tag = String(primary).toLowerCase();
  if (tag.startsWith('zh')) return 'cn';
  return 'en';
}
export const systemLang = ref(detectSystemLang());
window.addEventListener('languagechange', () => { systemLang.value = detectSystemLang(); });

export const resolvedTheme = computed(() => (
  themeMode.value === 'system' ? (systemDark.value ? 'dark' : 'light') : themeMode.value
));
export const resolvedLang = computed(() => (
  langMode.value === 'system' ? systemLang.value : langMode.value
));

// ---------- 应用 + 持久化 ----------

watch([themeMode, resolvedTheme], ([mode, theme]) => {
  localStorage.setItem(KEY.themeMode, mode);
  document.body.classList.toggle('dark', theme === 'dark');
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#262626' : '#f0f2f5');
}, { immediate: true });

watch([langMode, resolvedLang], ([mode, lang]) => {
  localStorage.setItem(KEY.langMode, mode);
  document.documentElement.lang = lang === 'cn' ? 'zh-CN' : 'en';
}, { immediate: true });

watch(musicOn, val => localStorage.setItem(KEY.music, val ? '1' : '0'), { immediate: true });
watch(sfxOn, val => localStorage.setItem(KEY.sfx, val ? '1' : '0'), { immediate: true });

export const setThemeMode = mode => { themeMode.value = mode; };
export const setLangMode = mode => { langMode.value = mode; };
export const THEME_MODES = ['system', 'light', 'dark'];
export const LANG_MODES = ['system', 'cn', 'en'];
