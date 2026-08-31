import { createRouter, createWebHashHistory } from 'vue-router';

import { activeGame } from './shared/i18n';
import HomePage from './components/HomePage.vue';
import ClickGame from './games/click/ClickGame.vue';
import GuessNumber from './games/guess/GuessNumber.vue';
import PokerGame from './games/poker/MainGame.vue';
import PuzzleGame from './games/puzzle/MainGame.vue';

const routes = [
  { path: '/', component: HomePage, meta: { game: 'home' } },
  { path: '/click', component: ClickGame, meta: { game: 'click' } },
  { path: '/guess', component: GuessNumber, meta: { game: 'guess' } },
  { path: '/poker', component: PokerGame, meta: { game: 'poker' } },
  { path: '/puzzle', component: PuzzleGame, meta: { game: 'puzzle' } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.afterEach(to => {
  activeGame.value = to.meta.game || 'home';
});

export default router;
