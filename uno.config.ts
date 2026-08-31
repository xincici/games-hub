// uno.config.ts
import {
  defineConfig,
  presetUno,
  presetAttributify,
  presetIcons
} from 'unocss';

export default defineConfig({
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      extraProperties: {
        display: 'inline-block',
        'vertical-align': 'middle',
      },
      collections: {
        carbon: () => import('@iconify-json/carbon/icons.json').then(i => i.default),
        mdi: () => import('@iconify-json/mdi/icons.json').then(i => i.default),
      }
    }),
  ],
  // 首页图标 class 来自 games.js 的运行时数据，静态提取不到，需 safelist
  safelist: [
    'i-carbon-touch-1',
    'i-mdi-counter',
    'i-mdi-cards-outline',
    'i-mdi-puzzle',
  ],
});
