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
        // 麻将模式图标的来源（dinkie-icons 的 three-of-circles-mahjong）
        'dinkie-icons': () => import('@iconify-json/dinkie-icons/icons.json').then(i => i.default),
      }
    }),
  ],
  // 首页图标 class 来自 games.js 的运行时数据，静态提取不到，需 safelist
  safelist: [
    // 模式切换图标（三个游戏的麻将模式都用它）
    'i-dinkie-icons-three-of-circles-mahjong',
    'i-dinkie-icons-five-of-circles-mahjong',
    'i-dinkie-icons-white-dragon-mahjong',
    'i-dinkie-icons-seven-of-bamboos-mahjong',
    'i-dinkie-icons-red-dragon-mahjong',
    'i-carbon-touch-1',
    'i-mdi-counter',
    'i-mdi-cards-playing-spade-multiple-outline',
    'i-mdi-puzzle',
    'i-mdi-numeric',
    'i-mdi-snake',
    'i-mdi-lightbulb-on-50',
    'i-mdi-link',
    'i-mdi-incognito',
    'i-mdi-target',
    'i-mdi-numeric-3',
    'i-mdi-star-four-points',
    'i-mdi-grid',
    'i-mdi-layers-triple',
    'i-mdi-test-tube',
    'i-mdi-format-vertical-align-bottom',
    'i-mdi-arrow-all',
    'i-mdi-flask-outline',
    'i-mdi-cards-playing-outline',
    'i-mdi-cards',
    // 赌神的首页图标
    'i-dinkie-icons-eight-of-bamboos-mahjong',
    'i-mdi-cards-playing',
    'i-mdi-undo-variant',
    'i-mdi-redo-variant',
    'i-mdi-hammer-wrench',
  
    'i-carbon-touch-1',
    'i-mdi-counter',
    'i-mdi-cards-playing-spade-multiple-outline',
    'i-mdi-puzzle',
    'i-mdi-numeric',
    'i-mdi-snake',
    'i-mdi-lightbulb-on-50',
    'i-mdi-link',
    'i-mdi-incognito',
    'i-mdi-target',
    'i-mdi-numeric-3',
    'i-mdi-star-four-points',
    'i-mdi-grid',
    'i-mdi-layers-triple',
    'i-mdi-test-tube',
    'i-mdi-format-vertical-align-bottom',
    'i-mdi-arrow-all',
    'i-mdi-flask-outline',
    'i-mdi-cards-playing-outline',
    'i-mdi-cards-playing-club-multiple-outline',
    'i-mdi-cards-playing',
    'i-mdi-undo-variant',
    'i-mdi-redo-variant',
    'i-mdi-hammer-wrench',
    'i-mdi-mirror-variant',
    'i-mdi-calculator',
    'i-mdi-cards-playing-outline',
  ],
});
