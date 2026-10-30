import { createSSRApp } from 'vue';

import 'uno.css';
import App from './App.vue';

// uni-app（微信小程序 / H5）统一入口
export function createApp() {
  const app = createSSRApp(App);
  return { app };
}
