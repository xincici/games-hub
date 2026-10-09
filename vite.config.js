import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from '@unocss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler'
      }
    }
  },
  plugins: [
    vue(),
    UnoCSS(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: {
        enabled: true
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      // 默认 globPatterns 只有 js/css/html，图片不会进预缓存 ——
      // 麻将牌雪碧图（以及各图标）就会只依赖浏览器 HTTP 缓存，首次访问要联网、离线时牌面是空白。
      workbox: {
        globPatterns: ['**/*.{js,css,html,webp,png,svg,ico,woff2}'],
        // 单张图最大 2MiB 是 workbox 默认值，181KB 的雪碧图远没到上限，无需调
      },
      manifest: {
        name: 'Games Hub',
        short_name: 'Games',
        description: 'A collection of mini games',
        theme_color: '#f0f2f5',
        background_color: '#f0f2f5',
        icons: [
          {
            src: 'android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          }
        ]
      }
    }),
  ],
})
