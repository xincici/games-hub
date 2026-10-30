// 单人麻将 · 本页局部文案（不塞进 core/i18n.js，避免和其它页面的大文件冲突）。
// 文案逐字来自 web 的 src/games/solo/i18n.js（cn / en 两段一个字都没改），
// 只把 web 里嵌套的 `suits: { m, s, p }` 摊平成 `suits.m / suits.s / suits.p`
// —— 本工程的 tt() 是单层查找，模板里拼的是 `tt('suits.' + omitSuit)`。
// ⚠️ cn 与 en 的 key 集合必须完全一致（漏一边就会直接显示原始 key）。
import { lang } from '@/core/settings';

const dict = {
  cn: {
    gameTitle: '单人麻将',
    bestStreak: '🏆 最长连胜',
    streak: '🔥 当前连胜',
    wall: '🀄 剩余牌数',
    start: '🎮 新游戏',
    win: '胡了！',
    lose: '牌摸完了',
    replayLevel: '🔄 再来一局',
    nextRound: '➡️ 下一局',
    newGameConfirm: '开启新游戏会清除当前连胜并重新开始，确认吗？',
    confirmOk: '确认',
    cancel: '取消',
    hint: '点一张手牌打出去，会自动摸一张新的。',
    omit: '本局没有',
    'suits.m': '万子',
    'suits.s': '条子',
    'suits.p': '筒子',
    help1: '手上 14 张牌，目标是把它们凑成能胡的牌型：四组三张 + 一对将（或者七对子）。',
    help2: '点一张手牌就打出去，然后自动从牌墙摸一张。刚摸到的牌先停在最右侧，等你打出一张后手牌会按顺序重新排好。',
    help3: '右上角的数字是牌墙里还剩多少张，摸完还没胡就本局结束、当前连胜归零。',
  },
  en: {
    gameTitle: 'Solo Mahjong',
    bestStreak: '🏆 Best Streak',
    streak: '🔥 Streak',
    wall: '🀄 Tiles Left',
    start: '🎮 New Game',
    win: 'You won!',
    lose: 'Out of tiles',
    replayLevel: '🔄 New Round',
    nextRound: '➡️ Next round',
    newGameConfirm: 'Starting a new game clears your current streak and begins again. Continue?',
    confirmOk: 'Confirm',
    cancel: 'Cancel',
    hint: 'Tap a tile to discard it, then you draw one automatically.',
    omit: 'No ',
    'suits.m': 'characters',
    'suits.s': 'bamboo',
    'suits.p': 'dots',
    help1: 'You hold 14 tiles and the goal is a winning hand: four sets of three plus a pair (or seven pairs).',
    help2: 'Tap a tile to discard it, then you draw one from the wall automatically. A drawn tile waits at the far right until you discard, then the hand sorts itself again.',
    help3: 'The number on the right is how many tiles are left in the wall. Run out without winning and the streak goes back to zero.',
  },
};

// lang 是 ref：模板里调用 tt() 会自动建立依赖，切换语言后整页重渲染（与 core/i18n 的 t() 同款）
export const tt = (k) => dict[lang.value]?.[k] ?? dict.cn[k] ?? k;
