import { createRouter, createWebHashHistory } from 'vue-router';

import { activeGame } from './shared/i18n';
import HomePage from './components/HomePage.vue';
import ClickGame from './games/click/ClickGame.vue';
import GuessNumber from './games/guess/GuessNumber.vue';
import PokerGame from './games/poker/MainGame.vue';
import PuzzleGame from './games/puzzle/MainGame.vue';
import Game2048 from './games/g2048/Game2048.vue';
import SnakeGame from './games/snake/SnakeGame.vue';
import MatchGame from './games/match/MatchGame.vue';
import LinkGame from './games/link/LinkGame.vue';

const routes = [
  { path: '/', component: HomePage, meta: { game: 'home' } },
  { path: '/click', component: ClickGame, meta: { game: 'click' } },
  { path: '/guess', component: GuessNumber, meta: { game: 'guess' } },
  { path: '/poker', component: PokerGame, meta: { game: 'poker' } },
  { path: '/puzzle', component: PuzzleGame, meta: { game: 'puzzle' } },
  { path: '/2048', component: Game2048, meta: { game: 'g2048' } },
  { path: '/snake', component: SnakeGame, meta: { game: 'snake' } },
  { path: '/match', component: MatchGame, meta: { game: 'match' } },
  { path: '/link', component: LinkGame, meta: { game: 'link' } },
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
