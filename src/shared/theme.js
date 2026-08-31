import { ref, computed, watchEffect } from 'vue';

const THEME_KEY = '__games_hub__theme';

export const isDark = ref(Boolean(localStorage.getItem(THEME_KEY)));

const color = computed(() => isDark.value ? '#262626' : '#f0f2f5');

export const toggle = () => {
  isDark.value = !isDark.value;
};

watchEffect(() => {
  if (isDark.value) localStorage.setItem(THEME_KEY, 1);
  else localStorage.removeItem(THEME_KEY);
  document.body.classList[isDark.value ? 'add' : 'remove']('dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color.value);
});
