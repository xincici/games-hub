// 雀圣 · 本页局部文案（不塞进 core/i18n.js，避免和其它页面的大文件冲突）。
// 文案逐字来自 web 的 src/games/quesheng/i18n.js；只额外补了 ConfirmDialog 的三颗按钮文案
// （web 那份文案在 shared/ConfirmDialog.vue 里，不在游戏的 i18n 里）。
import { lang } from '@/core/settings';

const dict = {
  cn: {
    gameTitle: '雀圣',
    level: '🏁 关卡',
    left: '🀄 剩余',
    moves: '👣 步数',
    godMode: '⚡ 上帝模式',
    modeTip: '切换模式',
    godStop: '⏹ 停止',
    undo: '撤销',
    redo: '重做',
    start: '🎮 新游戏',
    tipWin: '全部消除',
    tipLost: '步数用完了',
    levelDone: '第 {n} 关通过！',
    nextLevel: '➡️ 下一关',
    replayLevel: '🔄 重玩本关',
    clearPair: '消除这一对',
    helpMsg: '雀圣：5×5 棋盘上发的 14 张牌，一定是一副能赢的麻将牌。滑动把它们凑到一起，再点牌组消掉。',
    help1: '5×5 棋盘上的 14 张牌一定拆得成 4 组（顺子或刻子）+ 1 个将。朝上下左右滑动，所有牌朝该方向移动直到碰边或被别的牌挡住，牌与牌之间不会合并。顶栏的按钮可以切换两种滑动方式：一路滑到底，或每次只移动一格。',
    help2: '横排或竖排里紧挨着的牌若凑成一组（三张相同或同花色三张连续）或一个将（两张对子），会被高亮圈住。点这一组的牌：点齐三张消掉这一组，一对点满两张消掉这一对。点满两张相同的牌、且还能和旁边第三张凑成刻子时，才会浮出提示确认消这一对；想消刻子就直接点第三张。',
    help3: '判牌与顺序无关，不需要把点数排好。全部消完即过关；步数用完还没消完就失败。',
    confirmText: '好的，明白',
    rotateTip: '请旋转设备至竖屏',
    // web 的 ConfirmDialog（shared/ConfirmDialog.vue）里的文案，原样搬过来
    confirmTitle: '🔄 开始新游戏？',
    confirmMsg: '会清除闯关记录并从第 1 关重新开始；只想重玩当前这一关，就点「重玩本关」。',
    confirmOk: '确定重来',
    confirmReplay: '重玩本关',
    cancel: '取消',
  },
  en: {
    gameTitle: 'Mahjong Master',
    level: '🏁 Level',
    left: '🀄 Left',
    moves: '👣 Moves',
    godMode: '⚡ God Mode',
    modeTip: 'Switch mode',
    godStop: '⏹ Stop',
    undo: 'Undo',
    redo: 'Redo',
    start: '🎮 New Game',
    tipWin: 'Cleared',
    tipLost: 'Out of Moves',
    levelDone: 'Level {n} cleared!',
    nextLevel: '➡️ Next Level',
    replayLevel: '🔄 Replay Level',
    clearPair: 'Clear the pair',
    helpMsg: 'Mahjong Master: 14 tiles that make a winning hand are dealt onto a 5x5 board. Slide to gather them, then tap a set to clear it.',
    help1: 'The 14 tiles on the 5x5 board can always be split into 4 sets (a run or a triplet) plus one pair. Swipe up, down, left or right: every tile slides that way until it hits the edge or another tile, and tiles never merge. The button in the title bar switches between sliding all the way and moving just one cell per swipe.',
    help2: 'Tiles that sit next to each other in a row or column and make a set (three tiles) or the pair (two of a kind) are ringed with a highlight. Tap the tiles of a ringed group: tap all three to clear a set, or tap the two tiles of a pair to clear the pair. A prompt only appears when the two tapped tiles are a pair that could also grow into a set of three - it offers just the pair, so tap the third tile to clear the set instead.',
    help3: 'Order does not matter: three tiles of a kind, or three consecutive numbers of one suit, count as a set. Clear all 14 tiles to win the level; run out of slides with tiles left and you lose.',
    confirmText: 'OK, I See',
    rotateTip: 'Please rotate your device to portrait',
    confirmTitle: '🔄 Start a new game?',
    confirmMsg: 'This clears your level record and restarts from level 1. To retry just the level you are on, pick Replay Level.',
    confirmOk: 'Yes, Restart',
    confirmReplay: 'Replay Level',
    cancel: 'Cancel',
  },
};

// lang 是 ref：模板里调用 tt() 会自动建立依赖，切换语言后整页重渲染（与 core/i18n 的 t() 同款）
export const tt = (k) => dict[lang.value]?.[k] ?? dict.cn[k] ?? k;
