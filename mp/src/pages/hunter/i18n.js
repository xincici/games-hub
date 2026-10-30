// 猎手 · 本页局部文案（不塞进 core/i18n.js，避免和其它页面的大文件冲突）。
// 文案逐字来自 web 的 src/games/hunter/i18n.js（cn / en 都照抄），
// 另补 4 条本页才有的二次确认文案（web 那份在 shared/ConfirmDialog.vue 里，同样逐字照抄）。
// ⚠️ cn 与 en 的 key 必须完全一致（缺一边就会把原始 key 显示出来）。
import { lang } from '@/core/settings';

const dict = {
  cn: {
    gameTitle: '猎手',
    bestScore: '🏆 最高关卡',
    levelLabel: '🏁 关卡',
    livesLabel: '❤️ 生命',
    start: '🎮 新游戏',
    nextLevel: '➡️ 下一关',
    replayLevel: '🔄 重玩本关',
    phaseMemory: '👀 快记住它们!',
    phaseFlip: '...',
    phaseAnswer: '🎯 把它们全部找出来!',
    tipWin: '全部捕获',
    tipLost: '生命耗尽',
    helpTip: '查看帮助',
    helpMsg: '记住上方 emoji，翻面后在候选区全部找出，顺序不限；点错扣心。',
    help1: '六关：3~8 个目标各 3 秒，候选区 3×3→4×5。',
    help2: '点对即翻正上方的牌。',
    help3: '点错扣心，扣满三颗失败。',
    help4: '全找出即胜；新游戏总是从第 1 关开始。',
    modeEmoji: 'emoji',
    modePoker: '扑克',
    modeTip: '切换牌面：emoji / 扑克牌 / 麻将牌（三种牌面的关卡与进度各自独立保存）',
    help6: '帮助旁的按钮切换牌面：emoji / 扑克牌 / 麻将牌。玩法相同；扑克目标更多、候选区更宽，麻将沿用 emoji 的关卡曲线。三种牌面的关卡与进度分开保存。',
    confirmText: '好的，明白',
    rotateTip: '请旋转设备至竖屏',
    // web 的 ConfirmDialog 自带这套文案（三处共用），这里逐字取来
    confirmTitle: '🔄 开始新游戏？',
    confirmMsg: '会清除闯关记录并从第 1 关重新开始；只想重玩当前这一关，就点「重玩本关」。',
    confirmRestart: '确定重来',
    confirmReplay: '重玩本关',
    cancel: '取消',
  },
  en: {
    gameTitle: 'Hunter',
    bestScore: '🏆 Best Level',
    levelLabel: '🏁 Level',
    livesLabel: '❤️ Lives',
    start: '🎮 New Game',
    nextLevel: '➡️ Next Level',
    replayLevel: '🔄 Replay Level',
    phaseMemory: '👀 Memorize!',
    phaseFlip: '...',
    phaseAnswer: '🎯 Hunt them all!',
    tipWin: 'You Got It',
    tipLost: 'Out of Hearts',
    helpTip: 'Click for help!',
    helpMsg: 'Memorize the emojis up top, then tap each one in the candidates below; any order. Wrong taps cost a heart.',
    help1: '6 levels: 3–8 targets, 3s each, grid 3×3 → 4×5.',
    help2: 'Correct pick flips its card above.',
    help3: 'Wrong pick costs a heart; 3 lost = fail.',
    help4: 'Find all to win; new games start at level 1.',
    modeEmoji: 'emoji',
    modePoker: 'cards',
    modeTip: 'Switch the card faces: emoji / poker cards / mahjong tiles (each keeps its own levels and progress)',
    help6: 'The button by Help cycles the faces: emoji / poker cards / mahjong tiles. Same rules; poker has more targets and a wider grid, mahjong keeps the emoji levels. Each face saves its own progress.',
    confirmText: 'OK, I See',
    rotateTip: 'Please rotate your device to portrait',
    confirmTitle: '🔄 Start a new game?',
    confirmMsg: 'This clears your level record and restarts from level 1. To retry just the level you are on, pick Replay Level.',
    confirmRestart: 'Yes, Restart',
    confirmReplay: 'Replay Level',
    cancel: 'Cancel',
  },
};

// lang 是 ref：模板里调用 tt() 会自动建立依赖，切换语言后整页重渲染（与其它页的 tt 同款）
export const tt = (k) => dict[lang.value]?.[k] ?? dict.cn[k] ?? k;
