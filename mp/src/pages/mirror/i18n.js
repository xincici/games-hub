// Emoji 镜像 · 本页局部文案（不塞进 core/i18n.js，避免和其它页面的大文件冲突）。
// 文案逐字来自 web 的 src/games/mirror/i18n.js（含 en），一个字都没改。
import { lang } from '@/core/settings';

const dict = {
  cn: {
    gameTitle: 'Emoji 镜像',
    time: '⏱ 用时',
    best: '🏆 最佳',
    match: '🎯 正确',
    difficulty: '难度',
    start: '🎮 新游戏',
    displayArea: '展示区',
    gameArea: '游戏区',
    checking: '计算中…',
    matchHint: '位置相同',
    tipWin: '全部对齐！',
    newBest: '新纪录',
    flipTip: '先点一张牌，再点另一张即可交换',
    confirmText: '好的，明白',
    rotateTip: '请旋转设备至竖屏',
    help1: '上方的展示区会先亮出这一局的 emoji，接着洗一下、翻面藏起来。下方游戏区放着同样这几个 emoji，但顺序不同 —— 开局时保证一个位置都不对。',
    help2: '点一张自己的牌、再点另一张，两张就互换位置。每次交换后，两个区中间的提示会告诉你游戏区现在有几个位置和展示区相同（位置和 emoji 都对上才算）。',
    help3: '不断交换直到每一张都和展示区一致即过关。展示区的顺序要自己靠提示推出来；游戏过程中计时，每种难度各自记录最佳时间。',
  },
  en: {
    gameTitle: 'Emoji Mirror',
    time: '⏱ Time',
    best: '🏆 Best',
    match: '🎯 Right',
    difficulty: 'Difficulty',
    start: '🎮 New Game',
    displayArea: 'Pattern',
    gameArea: 'Your Order',
    checking: 'Working it out…',
    matchHint: 'In the right spot',
    tipWin: 'All in order!',
    newBest: 'New record',
    flipTip: 'Tap a card, then tap another to swap them',
    confirmText: 'OK, I See',
    rotateTip: 'Please rotate your device to portrait',
    help1: 'The pattern at the top is shown to you, then shuffled and turned face down. Your row below holds the same emoji in a different order - to begin with, not one of them is in the right spot.',
    help2: 'Tap one of your cards and then another to swap the two. After each swap the hint between the two areas tells you how many cards now match the pattern, counting only cards that are in the right position with the right emoji.',
    help3: 'Keep swapping until every card matches the pattern and you win the round. Work out the pattern from the hints alone - the timer runs while you play, and each difficulty keeps its own best time.',
  },
};

// lang 是 ref：模板里调用 tt() 会自动建立依赖，切换语言后整页重渲染（与 core/i18n 的 t() 同款）
export const tt = (k) => dict[lang.value]?.[k] ?? dict.cn[k] ?? k;
