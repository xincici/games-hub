// 贪吃蛇 · 本页局部文案（不塞进 core/i18n.js，避免和其它页面的大文件冲突）。
// 文案逐字来自 web 的 src/games/snake/i18n.js（连 emoji 前缀都保留，按钮文案与 web 一致）。
import { lang } from '@/core/settings';

const dict = {
  cn: {
    gameTitle: '贪吃蛇',
    bestScore: '🏆 最佳得分',
    score: '✨ 当前得分',
    start: '🎮 新游戏',
    pause: '⏸ 暂停',
    resume: '▶️ 继续',
    resumeTip: '已暂停，点击继续',
    readyTip: '准备开始…',
    helpTip: '查看帮助',
    helpMsg: '控制蛇吃食物：变长并得分，撞墙或撞自己结束。',
    help1: '方向键 / WASD 或滑动屏幕',
    help2: '难度 1~5，越高越快',
    help3: '难度越高，得分越高',
    help4: '帮助旁按钮可切换穿墙，撞墙从对面钻出',
    confirmText: '好的，明白',
    newBest: '新纪录诞生',
    tipWin: '你赢了',
    tipLost: '游戏结束',
    rotateTip: '请旋转设备至竖屏',
  },
  en: {
    gameTitle: 'Snake',
    bestScore: '🏆 Best Score',
    score: '✨ Score',
    start: '🎮 New Game',
    pause: '⏸ Pause',
    resume: '▶️ Resume',
    resumeTip: 'Paused — tap to continue',
    readyTip: 'Get ready…',
    helpTip: 'Click for help!',
    helpMsg: 'Eat food to grow longer and score. Hitting a wall or yourself ends the game.',
    help1: 'Arrow keys / WASD or swipe.',
    help2: 'Difficulty 1~5: higher means faster.',
    help3: 'Harder: more points.',
    help4: 'The help-icon button toggles through-wall: walls wrap you around.',
    confirmText: 'OK, I See',
    newBest: 'New Best Score',
    tipWin: 'You Win',
    tipLost: 'Game Over',
    rotateTip: 'Please rotate your device to portrait',
  },
};

// lang 是 ref：模板里调用 tt() 会自动建立依赖，切换语言后整页重渲染（与 core/i18n 的 t() 同款）
export const tt = (k) => dict[lang.value]?.[k] ?? dict.cn[k] ?? k;
