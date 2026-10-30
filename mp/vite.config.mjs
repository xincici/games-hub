// 小程序 / H5 都走 uni-app 的 Vite 插件
// 注意：这份配置必须是 .mjs —— package.json 没有 "type": "module"，
// 而 unocss/vite 是纯 ESM 包，用 .js 配置会被 esbuild 转成 CJS 后 require 失败。
import { defineConfig } from 'vite';
// @dcloudio/vite-plugin-uni 是 CJS（exports.default），ESM 下要多取一层 default
import uniModule from '@dcloudio/vite-plugin-uni';
import UnoCSS from 'unocss/vite';

const uni = uniModule.default ?? uniModule;

export default defineConfig({
  plugins: [uni(), UnoCSS()],
});
