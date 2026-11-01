// 场景注册表：后续每移植一个游戏，在这里加一行即可。
const HomeScene = require('./home/scene');
const ClickScene = require('./click/scene');
const MatchScene = require('./match/scene');
const Point24Scene = require('./point24/scene');
const GuessScene = require('./guess/scene');
const DetectiveScene = require('./detective/scene');
const HunterScene = require('./hunter/scene');
const MasterScene = require('./master/scene');
const G2048Scene = require('./g2048/scene');
const SnakeScene = require('./snake/scene');
const ThreeScene = require('./three/scene');
const LinkScene = require('./link/scene');
const PuzzleScene = require('./puzzle/scene');
const MirrorScene = require('./mirror/scene');
const DownScene = require('./down/scene');
const CrushScene = require('./crush/scene');
const SudokuScene = require('./sudoku/scene');
const SortScene = require('./sort/scene');
const SlideScene = require('./slide/scene');
const PokerScene = require('./poker/scene');
const MahjongScene = require('./mahjong/scene');
const SoloScene = require('./solo/scene');
const AlchemyScene = require('./alchemy/scene');
const QueshengScene = require('./quesheng/scene');
const LegendScene = require('./legend/scene');
const GamblerScene = require('./gambler/scene');

const games = {
  home: { title: 'home.homeTitle', Scene: HomeScene },
  click: { title: 'click.gameTitle', Scene: ClickScene },
  match: { title: 'match.gameTitle', Scene: MatchScene },
  point24: { title: 'point24.gameTitle', Scene: Point24Scene },
  guess: { title: 'guess.gameTitle', Scene: GuessScene },
  detective: { title: 'detective.gameTitle', Scene: DetectiveScene },
  hunter: { title: 'hunter.gameTitle', Scene: HunterScene },
  master: { title: 'master.gameTitle', Scene: MasterScene },
  g2048: { title: 'g2048.gameTitle', Scene: G2048Scene },
  snake: { title: 'snake.gameTitle', Scene: SnakeScene },
  three: { title: 'three.gameTitle', Scene: ThreeScene },
  link: { title: 'link.gameTitle', Scene: LinkScene },
  puzzle: { title: 'puzzle.gameTitle', Scene: PuzzleScene },
  mirror: { title: 'mirror.gameTitle', Scene: MirrorScene },
  down: { title: 'down.gameTitle', Scene: DownScene },
  crush: { title: 'crush.gameTitle', Scene: CrushScene },
  sudoku: { title: 'sudoku.gameTitle', Scene: SudokuScene },
  sort: { title: 'sort.gameTitle', Scene: SortScene },
  slide: { title: 'slide.gameTitle', Scene: SlideScene },
  poker: { title: 'poker.gameTitle', Scene: PokerScene },
  mahjong: { title: 'mahjong.gameTitle', Scene: MahjongScene },
  solo: { title: 'solo.gameTitle', Scene: SoloScene },
  alchemy: { title: 'alchemy.gameTitle', Scene: AlchemyScene },
  quesheng: { title: 'quesheng.gameTitle', Scene: QueshengScene },
  legend: { title: 'legend.gameTitle', Scene: LegendScene },
  gambler: { title: 'gambler.gameTitle', Scene: GamblerScene },
};

module.exports = { games };
