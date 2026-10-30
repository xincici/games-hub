// 扑克炼金术 · 本页局部文案（不塞进 core/i18n.js，避免动到全局大文件）。
// 文案逐字来自 web 的 src/games/alchemy/i18n.js（cn / en 两段都原样搬过来，key 集合完全一致），
// 另外补了 web 的 shared/ConfirmDialog.vue 自带的那五条（「新游戏」二次确认）：
// 小程序没有共享弹窗，本页用本地三按钮弹窗，需要 confirmTitle / confirmMsg / confirmOk /
// confirmReplay / cancel 五条。
// web 里本页没直接用到的 helpTip（模式按钮的 title 提示）/ confirmText（旧帮助按钮）/ rotateTip
// （横屏提示）也留着 —— 文案是 web 原文，将来要用不必再翻 web 仓库。
// 约束：cn 与 en 的 key 集合必须完全一致（加 key 记得两边一起加）。
import { lang } from '@/core/settings';

const dict = {
  cn: {
    gameTitle: '扑克炼金术',
    target: '🎯 目标',
    best: '🏆 最高关卡',
    score: '✨ 得分',
    level: '🏁 关卡',
    left: '🃏 剩余',
    next: '下两张',
    start: '🎮 新游戏',
    tipWin: '过关',
    tipLost: '牌堆用尽',
    levelDone: '第 {n} 关通过！',
    nextLevel: '➡️ 下一关',
    replayLevel: '🔄 重玩本关',
    modeTip: '切换模式：炼金闯关 / 炸金花闯关（两种模式记录各自独立）',
    comboFour: '四条',
    comboStraightFlush: '同花顺',
    comboThree: '三条',
    comboFlush: '同花',
    comboStraight: '顺子',
    comboTwoPair: '两对',
    comboPair: '一对',
    comboBaozi: '豹子',
    comboGroups: '连消 {n} 组',
    comboChain: '🔥 连击 ×{n}',
    helpTip: '查看帮助',
    helpMsg: '两种关卡：4×4 扑克炼金，或 3×3 炸金花。点标题栏帮助图标旁的按钮切换，两种模式的记录各自独立。',
    help1: '炼金：4×4 棋盘上把手上这张放进空格（也可以拖进去），凑满一整行 / 一整列 / 一整条对角线（共 10 条线）且 4 张成牌型时计分并消除。一次落子同时凑成多条线时只算分最高的那条，并列才一起消。',
    help2: '炼金牌型：四条 / 同花顺 1000、三条 500、顺子 300、同花 200、两对 100、一对 50。Joker 是万能牌但有颜色限制：黑的只能当 ♠/♣、红的只能当 ♥/♦。',
    help3: '炸金花：3×3 棋盘、8 条线（3 行 + 3 列 + 2 条对角线），每线 3 张。点已经有牌的格子会用手上这张替换掉它。牌型分数：豹子 1000、同花顺 800、同花 500、顺子 400、一对 200；散牌不计分。',
    help4: '炸金花奖励：一次消多组时从第 2 组起每组再加 200；连续消除从第 2 连起每连再加 100。在牌用完前达到目标分即过关，否则失败。',
    confirmText: '好的，明白',
    rotateTip: '请旋转设备至竖屏',
    // ---- 新游戏二次确认（web 的 shared/ConfirmDialog.vue 默认文案）----
    confirmTitle: '🔄 开始新游戏？',
    confirmMsg: '会清除闯关记录并从第 1 关重新开始；只想重玩当前这一关，就点「重玩本关」。',
    confirmOk: '确定重来',
    confirmReplay: '重玩本关',
    cancel: '取消',
  },
  en: {
    gameTitle: 'Poker Alchemy',
    target: '🎯 Target',
    best: '🏆 Best Level',
    score: '✨ Score',
    level: '🏁 Level',
    left: '🃏 Left',
    next: 'Next',
    start: '🎮 New Game',
    tipWin: 'Level Clear',
    tipLost: 'Out of Cards',
    levelDone: 'Level {n} cleared!',
    nextLevel: '➡️ Next Level',
    replayLevel: '🔄 Replay Level',
    modeTip: 'Switch mode: Alchemy / Three-card poker levels (separate records)',
    comboFour: 'FOUR OF A KIND',
    comboStraightFlush: 'STRAIGHT FLUSH',
    comboThree: 'THREE OF A KIND',
    comboFlush: 'FLUSH',
    comboStraight: 'STRAIGHT',
    comboTwoPair: 'TWO PAIRS',
    comboPair: 'PAIR',
    comboBaozi: 'THREE OF A KIND',
    comboGroups: '{n} groups cleared',
    comboChain: '🔥 Chain ×{n}',
    helpTip: 'Click for help!',
    helpMsg: 'Two level modes: 4x4 Poker Alchemy, or 3x3 three-card poker. Switch with the button beside help; each mode keeps its own records.',
    help1: 'Alchemy: place the card in your hand into an empty cell (or drag it). Fill a whole row, column or diagonal (10 lines) with 4 cards that make a poker hand to score and clear it. If one placement completes several lines, only the highest-scoring one counts - ties clear together.',
    help2: 'Alchemy hands: four of a kind 1000, straight flush 1000, three of a kind 500, straight 300, flush 200, two pairs 100, pair 50. Jokers are wild but colour-bound: black stands for a spade or club only, red for a heart or diamond only.',
    help3: 'Three-card poker: a 3x3 board with 8 lines of 3 cards. Tap a filled cell to replace its card with the one in your hand. Hands: three of a kind 1000, straight flush 800, flush 500, straight 400, pair 200; high card does not score.',
    help4: 'Three-card poker bonuses: each extra group cleared together adds 200, and from the second consecutive scoring placement each chain adds 100. Reach the target score before the cards run out to clear the level.',
    confirmText: 'OK, I See',
    rotateTip: 'Please rotate your device to portrait',
    // ---- new-game confirmation (web shared/ConfirmDialog.vue defaults) ----
    confirmTitle: '🔄 Start a new game?',
    confirmMsg: 'This clears your level record and restarts from level 1. To retry just the level you are on, pick Replay Level.',
    confirmOk: 'Yes, Restart',
    confirmReplay: 'Replay Level',
    cancel: 'Cancel',
  },
};

// lang 是 ref：模板里调用 tt() 会自动建立依赖，切换语言后整页重渲染（与 core/i18n 的 t() 同款）
export function tt(k) {
  return dict[lang.value]?.[k] ?? dict.cn[k] ?? k;
}
