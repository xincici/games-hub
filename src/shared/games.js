import { registerGame } from './i18n';
import clickDict from '@/games/click/i18n';
import guessDict from '@/games/guess/i18n';
import pokerDict from '@/games/poker/i18n';
import puzzleDict from '@/games/puzzle/i18n';
import g2048Dict from '@/games/g2048/i18n';
import snakeDict from '@/games/snake/i18n';
import matchDict from '@/games/match/i18n';
import linkDict from '@/games/link/i18n';
import detectiveDict from '@/games/detective/i18n';

// 各游戏入口组件与字典的注册表
// recordsPrefix / minDifficulty / maxDifficulty 用于「连点标题 5 次清除记录」
export const games = [
  {
    id: 'click',
    path: '/click',
    icon: 'i-carbon-touch-1',
    helpKey: '__easy_click_game__help_showed',
    recordsPrefix: '__easy_click_game__',
    minDifficulty: 3,
    maxDifficulty: 10,
  },
  {
    id: 'puzzle',
    path: '/puzzle',
    icon: 'i-mdi-puzzle',
    helpKey: '__number_puzzle__help_showed',
    recordsPrefix: '__number_puzzle__',
    minDifficulty: 3,
    maxDifficulty: 6,
  },
  {
    id: 'guess',
    path: '/guess',
    icon: 'i-mdi-counter',
    helpKey: '__guess_number__help_showed',
  },
  {
    id: 'poker',
    path: '/poker',
    icon: 'i-mdi-cards-outline',
    helpKey: '__poker_game_helped',
  },
  {
    id: 'g2048',
    path: '/2048',
    icon: 'i-mdi-numeric',
    helpKey: '__game_2048__help_showed',
  },
  {
    id: 'snake',
    path: '/snake',
    icon: 'i-mdi-snake',
    helpKey: '__snake_game__help_showed',
  },
  {
    id: 'match',
    path: '/match',
    icon: 'i-mdi-emoticon-happy-outline',
    helpKey: '__emoji_match__help_showed',
    recordsPrefix: '__emoji_match__',
    minDifficulty: 1,
    maxDifficulty: 3,
  },
  {
    id: 'link',
    path: '/link',
    icon: 'i-mdi-link',
    helpKey: '__emoji_link__help_showed',
    recordsPrefix: '__emoji_link__',
    minDifficulty: 1,
    maxDifficulty: 5,
  },
  {
    id: 'detective',
    path: '/detective',
    icon: 'i-mdi-incognito',
    helpKey: '__emoji_detective__help_showed',
    recordsPrefix: '__emoji_detective__',
    minDifficulty: 1,
    maxDifficulty: 9,
  },
];

export const gameConfig = id => games.find(game => game.id === id);

[
  ['click', clickDict],
  ['guess', guessDict],
  ['poker', pokerDict],
  ['puzzle', puzzleDict],
  ['g2048', g2048Dict],
  ['snake', snakeDict],
  ['match', matchDict],
  ['link', linkDict],
  ['detective', detectiveDict],
].forEach(([id, dict]) => registerGame(id, dict));
