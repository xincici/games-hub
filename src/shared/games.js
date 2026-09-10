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
import hunterDict from '@/games/hunter/i18n';
import threeDict from '@/games/three/i18n';
import crushDict from '@/games/crush/i18n';
import sudokuDict from '@/games/sudoku/i18n';
import masterDict from '@/games/master/i18n';

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
    icon: 'i-mdi-cards-playing-spade-multiple-outline',
    helpKey: '__poker_game_helped',
  },
  {
    id: 'three',
    path: '/three',
    icon: 'i-mdi-numeric-3',
    iconScale: 1.5,
    helpKey: '__threes_game__help_showed',
  },
  {
    id: 'g2048',
    path: '/2048',
    icon: 'i-mdi-numeric',
    iconScale: 1.2,
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
    icon: 'i-mdi-lightbulb-on-50',
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
  {
    id: 'hunter',
    path: '/hunter',
    icon: 'i-mdi-target',
    helpKey: '__emoji_hunter__help_showed',
    recordsPrefix: '__emoji_hunter__',
    minDifficulty: 1,
    maxDifficulty: 6,
  },
  {
    id: 'crush',
    path: '/crush',
    icon: 'i-mdi-star-four-points',
    helpKey: '__emoji_crush__help_showed',
    recordsPrefix: '__emoji_crush__best_',
    minDifficulty: 1,
    maxDifficulty: 3,
  },
  {
    id: 'sudoku',
    path: '/sudoku',
    icon: 'i-mdi-grid',
    helpKey: '__sudoku_game__help_showed',
    recordsPrefix: '__sudoku_game__',
    minDifficulty: 1,
    maxDifficulty: 3,
  },
  {
    id: 'master',
    path: '/master',
    icon: 'i-mdi-layers-triple',
    helpKey: '__emoji_master__help_showed',
    recordsPrefix: '__emoji_master__',
    minDifficulty: 1,
    maxDifficulty: 1,
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
  ['hunter', hunterDict],
  ['three', threeDict],
  ['crush', crushDict],
  ['sudoku', sudokuDict],
  ['master', masterDict],
].forEach(([id, dict]) => registerGame(id, dict));
