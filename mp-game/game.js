// 游戏合集 · 微信小游戏版入口。
// 小游戏没有页面栈 / WXML / WXSS，所有内容由 canvas 2D 绘制；场景管理器见 js/core/app.js。
const { App } = require('./js/core/app');
const icons = require('./js/core/icons');
const tiles = require('./js/core/tiles');
const HomeScene = require('./js/games/home/scene');
const ClickScene = require('./js/games/click/scene');
const MatchScene = require('./js/games/match/scene');
const Point24Scene = require('./js/games/point24/scene');
const GuessScene = require('./js/games/guess/scene');
const DetectiveScene = require('./js/games/detective/scene');
const HunterScene = require('./js/games/hunter/scene');
const MasterScene = require('./js/games/master/scene');
const G2048Scene = require('./js/games/g2048/scene');
const SnakeScene = require('./js/games/snake/scene');
const ThreeScene = require('./js/games/three/scene');
const LinkScene = require('./js/games/link/scene');
const PuzzleScene = require('./js/games/puzzle/scene');
const MirrorScene = require('./js/games/mirror/scene');
const DownScene = require('./js/games/down/scene');
const CrushScene = require('./js/games/crush/scene');
const SudokuScene = require('./js/games/sudoku/scene');
const SortScene = require('./js/games/sort/scene');
const SlideScene = require('./js/games/slide/scene');
const PokerScene = require('./js/games/poker/scene');
const MahjongScene = require('./js/games/mahjong/scene');
const SoloScene = require('./js/games/solo/scene');
const AlchemyScene = require('./js/games/alchemy/scene');
const QueshengScene = require('./js/games/quesheng/scene');
const LegendScene = require('./js/games/legend/scene');
const GamblerScene = require('./js/games/gambler/scene');

if (wx.setPreferredFramesPerSecond) wx.setPreferredFramesPerSecond(60);
icons.init();
tiles.preload();

new App(HomeScene, { home: HomeScene, click: ClickScene, match: MatchScene, point24: Point24Scene, guess: GuessScene, detective: DetectiveScene, hunter: HunterScene, master: MasterScene, g2048: G2048Scene, snake: SnakeScene, three: ThreeScene, link: LinkScene, puzzle: PuzzleScene, mirror: MirrorScene, down: DownScene, crush: CrushScene, sudoku: SudokuScene, sort: SortScene, slide: SlideScene, poker: PokerScene, mahjong: MahjongScene, solo: SoloScene, alchemy: AlchemyScene, quesheng: QueshengScene, legend: LegendScene, gambler: GamblerScene });
