import { createApp } from 'vue';

import i18n from '@/shared/i18n';
import router from './router';
import App from './App.vue';

import 'virtual:uno.css';

createApp(App)
  .use(i18n)
  .use(router)
  .mount('#app');
