// PWA 更新（用户报过「装完之后几乎更新不了」）。
//
// 病根有两条：
// 1. **安装版的 PWA 不会自己检查 SW 更新** —— 浏览器只在导航时按浏览器自己的节奏查，
//    而安装版常年「不导航」，用户看到的一直是老页面；
// 2. 老的 SW 要等**所有**页面关光才让位，用户装完打开一次，新版本就已经生米煮成熟饭。
//
// 对策（两处配合）：
// - **SW 内**：`vite.config.js` 里 `workbox.skipWaiting: true` + `clientsClaim: true`
//   —— 新 SW 一装好就接管，不用「关掉再开一次」；
// - **客户端**（本文件）：
//   - 回到前台（`visibilitychange` → visible）主动 `registration.update()` 查一次；
//     另外每 30 分钟兜底查一次（防止一直挂着不切前后台）；
//   - 新 SW 接管（`controllerchange`）时整页刷新一次 —— 用户无感换到新版本。
//
// 离线与首屏速度都不受影响：
// - 预缓存清单一个没少（vite.config 的 workbox 段），断网照常打开；
// - 注册是 `immediate`（模块一跑就注册，但不阻塞首屏渲染），`update()` 是后台请求。
import { registerSW } from 'virtual:pwa-register';

const CHECK_INTERVAL = 30 * 60 * 1000;

export function initSwUpdate() {
  if (!('serviceWorker' in navigator)) return;

  // 新 SW 接管 → 刷新一次。两个守卫：
  // ① 首次访问**没有旧 controller**，装好即接管本来跑的就是最新版，不必白刷一次；
  // ② 加锁避免「刷新 → 又 controllerchange → 再刷新」的循环。
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });

  registerSW({
    immediate: true,
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      const check = () => registration.update().catch(() => { /* 断网 / 离线时忽略 */ });
      // 装成 PWA 后最有效的触发点：每次从后台切回来就查一次
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      // 兜底：一直停在前台也定时查（半小时，足够便宜）
      setInterval(check, CHECK_INTERVAL);
    },
  });
}
