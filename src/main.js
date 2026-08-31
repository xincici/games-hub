import { createApp } from 'vue';

import i18n from '@/shared/i18n';
import router from './router';
import App from './App.vue';

import 'virtual:uno.css';

createApp(App)
  .use(i18n)
  .use(router)
  .mount('#app');

// iOS Safari 的滑动返回是系统手势，CSS 无法拦截。用历史哨兵使其失效：
// 每次导航后压入一条与当前地址相同的记录，popstate（滑动返回/返回键）时再压回去，
// 返回动作最多弹到哨兵上（URL 不变，router 不动），净效果为无操作。
// 页面内导航（router-link / 🏠）都是 push 新记录，不受影响。
if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
  const pushGuard = () => history.pushState(null, '', location.href);
  pushGuard();
  router.afterEach(pushGuard);
  window.addEventListener('popstate', () => {
    pushGuard();
  });

  // 双保险：边缘划入时 preventDefault，阻止手势进入系统导航阶段。
  // 对系统级侧滑的拦截在真机上不完全可靠（Safari 可能已消费触摸），
  // 历史哨兵仍是最终兜底。
  const EDGE_THRESHOLD = 25;
  window.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    const touchX = e.touches[0].clientX;
    if (touchX < EDGE_THRESHOLD || touchX > window.innerWidth - EDGE_THRESHOLD) {
      e.preventDefault();
    }
  }, { passive: false });
}
