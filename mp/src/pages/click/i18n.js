// 点击游戏 · 本页局部文案（不塞进 core/i18n.js，避免和其它页面的大文件冲突）。
// 文案逐字来自 web 的 src/games/click/i18n.js（连 emoji 前缀都保留，统计条 label 与按钮文案与 web 一致）。
// 只保留本页真正用到的 key；cn / en 的 key 集合必须完全一致（少一个就会在某种语言下露出原始 key）。
import { lang } from '@/core/settings';

const dict = {
  cn: {
    gameTitle: '关灯游戏',
    bestScore: '🏆 最佳得分',
    availableClicks: '👆 剩余点击',
    start: '🎮 新游戏',
    godMode: '⚡ 上帝模式',
    godPause: '⏸ 暂停',
    lampOff: '灭',
    lampFull: '全亮',
    lampHalf: '半亮',
    lampTip: '四邻一起变',
    helpMsg: `灯有三档：灭、全亮、半亮。点一盏灯，它和上下左右的邻灯都变到下一档 —— 全亮变半亮、半亮熄灭、熄灭的直接全亮。
把所有灯都熄灭即获胜；点击次数用尽仍未获胜则失败。`,
    help1: '难度 3~10',
    help2: '每局保证有解',
    help3: '剩余次数 = 难度的平方',
    help4: '上帝模式自动完成最优解；播放中再点一下按钮就是暂停，之后由你自己操作；把所有操作撤销回初始局后可以再点一次',
    newBest: '新纪录诞生',
    tipWin: '你赢了',
    tipLost: '你输了',
    undo: '撤销',
    redo: '重做',
  },
  en: {
    gameTitle: 'Lights Out',
    bestScore: '🏆 Best Score',
    availableClicks: '👆 Available Clicks',
    start: '🎮 New Game',
    godMode: '⚡ God Mode',
    godPause: '⏸ Pause',
    lampOff: 'Off',
    lampFull: 'Full',
    lampHalf: 'Dim',
    lampTip: 'neighbours too',
    helpMsg: `Lamps have three levels: off, full and dim. Tapping a lamp changes it and its four neighbours to the next level - full becomes dim, dim goes off, off becomes full.
Switch every lamp off to win. If your taps run out first, you lose.`,
    help1: 'Difficulty 3~10.',
    help2: 'Every new game is solvable.',
    help3: 'Available clicks equal the difficulty squared.',
    help4: 'God mode plays the optimal solution for you. Tap it again while it runs to pause - then it is your turn again. Undo all of your moves back to the starting board and you can run it once more.',
    newBest: 'New Best Score',
    tipWin: 'You Win',
    tipLost: 'You Lose',
    undo: 'Undo',
    redo: 'Redo',
  },
};

// lang 是 ref：模板里调用 tt() 会自动建立依赖，切换语言后整页重渲染（与 core/i18n 的 t() 同款）
export function tt(k) {
  return dict[lang.value]?.[k] ?? dict.cn[k] ?? k;
}
