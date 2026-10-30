// 数字迷宫 · 本页局部文案（不塞进 core/i18n.js，避免和其它页面的大文件冲突）。
// 文案逐字来自 web 的 src/games/puzzle/i18n.js（en + cn 两段，一个字都没改）。
// 帮助文案 = helpMsg + help1..N（用 \n\n 连接，HelpSheet 会拆成段落）。
import { lang } from '@/core/settings';

const dict = {
  en: {
    gameTitle: 'Puzzle',
    bestScore: '🏆 Best Score',
    availableClicks: '👆 Click Count',
    start: '🎮 New Game',
    helpTip: 'Click for help!',
    helpMsg: 'Click a number beside a space to move it. Order all numbers to win.',
    help1: 'Difficulty 3~6.',
    help2: 'Or play with the joystick in the upper left.',
    confirmText: 'OK, I See',
    newBest: 'New Best Score',
    tipWin: 'You Win',
    tipLost: 'You Lose',
    rotateTip: 'Please rotate your device to portrait',
  },
  cn: {
    gameTitle: '数字迷宫',
    bestScore: '🏆 最佳得分',
    availableClicks: '👆 点击次数',
    start: '🎮 新游戏',
    helpTip: '查看帮助',
    helpMsg: '点击数字，旁边有空格就能移过去。数字按顺序排好即获胜。',
    help1: '难度 3~6',
    help2: '也可用摇杆操作，在左上角开关',
    confirmText: '好的，明白',
    newBest: '新纪录诞生',
    tipWin: '你赢了',
    tipLost: '你输了',
    rotateTip: '请旋转设备至竖屏',
  },
};

// lang 是 ref：模板里调用 tt() 会自动建立依赖，切换语言后整页重渲染（与 core/i18n 的 t() 同款）
export function tt(k) {
  return dict[lang.value]?.[k] ?? dict.cn[k] ?? k;
}
