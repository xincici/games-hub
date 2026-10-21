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
        // 音效（success / lose，各 25~32KB）跟着预缓存，第一次过关就有声；
        // **背景音乐（12 首 ≈ 10MB）不进预缓存** —— 那会让首次安装多下 10MB，
        // 改走 runtimeCaching：第一次播放时进 CacheFirst，之后长效缓存、不再请求网络。
        globPatterns: ['**/*.{js,css,html,webp,png,svg,ico,woff2,mp3}'],
        globIgnores: ['**/audio/music/**'],
        runtimeCaching: [
          {
            // 背景音乐：CacheFirst + 一年有效期；maxEntries 留足 12 首的余量
            urlPattern: /\/audio\/music\/.*\.mp3$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'games-hub-music',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
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
