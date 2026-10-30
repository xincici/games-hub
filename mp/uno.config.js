// UnoCSS 配置（小程序版）
// 目标：和 web（/uno.config.ts）用**同一套**图标类名，不再自己拿 emoji 顶替。
// - presetWeapp：小程序适配（类名转义 + w/h 默认 rpx），替代 presetUno
// - presetIcons：carbon / mdi / dinkie-icons 三个集合，与 web 完全一致（scale 1.2）
// - transformerClass：把 `hover:bg-red` 这类带转义的类名改写成小程序能用的 `hover-bg-red`
import { defineConfig, presetIcons } from 'unocss';
import presetWeapp from 'unocss-preset-weapp';
import { transformerClass } from 'unocss-preset-weapp/transformer';

export default defineConfig({
  presets: [
    presetWeapp({ platform: 'uniapp', whRpx: true }),
    presetIcons({
      scale: 1.2,
      extraProperties: {
        display: 'inline-block',
        'vertical-align': 'middle',
      },
      collections: {
        carbon: () => import('@iconify-json/carbon/icons.json').then(i => i.default),
        mdi: () => import('@iconify-json/mdi/icons.json').then(i => i.default),
        'dinkie-icons': () => import('@iconify-json/dinkie-icons/icons.json').then(i => i.default),
      },
    }),
  ],
  transformers: [transformerClass()],
  // 运行时才决定的类名（首页卡片图标 / 模式切换图标）静态扫不到，必须 safelist
  safelist: [
    'i-mdi-test-tube-empty',
    'i-mdi-arrow-all', 'i-mdi-test-tube', 'i-mdi-flask-outline', 'i-dinkie-icons-red-dragon-mahjong',
    'i-mdi-arrow-down-bold-circle', 'i-mdi-arrow-left-bold-circle', 'i-mdi-arrow-right-bold-circle', 'i-mdi-arrow-up-bold-circle', 'i-mdi-cursor-move', 'i-mdi-power-socket-fr',
    'i-mdi-puzzle', 'i-carbon-touch-1', 'i-mdi-layers-triple',
    'i-mdi-link', 'i-mdi-star-four-points', 'i-mdi-incognito', 'i-mdi-target',
    'i-carbon-help',
    'i-mdi-format-vertical-align-bottom',
    'i-mdi-mirror-variant',
    'i-mdi-progress-clock',
    'i-mdi-robot-outline',
    'i-mdi-robot-off-outline',
    'i-mdi-dice-5',
    'i-mdi-dice-5-outline',
    'i-mdi-cards-playing',
    'i-mdi-account-cowboy-hat',
    'i-mdi-gesture-tap',
    'i-mdi-select-all',
    'i-mdi-format-list-numbered',
    'i-mdi-pencil-outline',
    'i-mdi-backspace-outline',
    'i-carbon-timer',
    'i-mdi-wall',
    'i-mdi-wall-fire',
    'i-carbon-subtract-alt',
    'i-carbon-add-alt',
    'i-mdi-snake',
    'i-mdi-counter',
    'i-mdi-numeric-3',
    'i-mdi-grid',
    'i-mdi-cards-playing-spade-multiple-outline',
    'i-dinkie-icons-three-of-bamboos-mahjong',
    'i-mdi-arrow-right-bold',
    'i-mdi-arrow-right-bold-outline',
    'i-carbon-undo',
    'i-carbon-redo',
    'i-dinkie-icons-five-of-circles-mahjong',
    'i-dinkie-icons-white-dragon-mahjong',
    'i-dinkie-icons-seven-of-bamboos-mahjong',
    'i-mdi-trophy-variant-outline',
    'i-mdi-infinity',
    'i-mdi-cogs',
    'i-carbon-close',
    'i-mdi-numeric',
    'i-mdi-calculator',
    'i-mdi-lightbulb-on-50',
    'i-dinkie-icons-eight-of-bamboos-mahjong',
    'i-mdi-emoticon-happy-outline',
    'i-mdi-cards-playing-outline',
    'i-dinkie-icons-three-of-circles-mahjong',
    'i-mdi-lightning-bolt',
    'i-mdi-check-all',
  ],
});
