// 主题的**唯一真相**在 shared/settings.js（支持 system / light / dark 三档）。
// 这里保留 isDark 与 toggle 两个老接口，免得各处 import 全部改一遍。
import { computed } from 'vue';

import { resolvedTheme, setThemeMode } from './settings';

export const isDark = computed(() => resolvedTheme.value === 'dark');

export const toggle = () => {
  setThemeMode(resolvedTheme.value === 'dark' ? 'light' : 'dark');
};
