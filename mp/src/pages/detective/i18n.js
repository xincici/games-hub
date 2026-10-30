// 侦探 · 本页局部文案（不塞进 core/i18n.js，避免和其它页面的大文件冲突）。
// 文案逐字来自 web 的 src/games/detective/i18n.js（cn / en 两份都原样搬过来），
// 另外补了 web 的 shared/ConfirmDialog.vue 自带的那五条（新游戏二次确认）。
// 约束：cn 与 en 的 key 集合必须完全一致（加 key 记得两边一起加）。
import { lang } from '@/core/settings';

const dict = {
  cn: {
    gameTitle: '侦探',
    bestScore: '🏆 最高关卡',
    levelLabel: '🏁 关卡',
    livesLabel: '❤️ 生命',
    start: '🎮 新游戏',
    nextLevel: '➡️ 下一关',
    replayLevel: '🔄 重玩本关',
    phaseMemory: '👀 快记住它们!',
    phaseFlip: '🃏 偷偷调包中…',
    phaseAnswer: '🔍 哪个 emoji 被偷换了？',
    phaseAnswerCard: '🔍 哪张牌被偷换了？',
    modeEmoji: 'emoji',
    modePoker: '扑克',
    modeMahjong: '麻将',
    modeTip: '切换牌面：emoji / 扑克牌 / 麻将牌（三种牌面的关卡与进度各自独立保存）',
    tipWin: '找出来了',
    tipLost: '生命耗尽',
    stampText: '正确',
    helpTip: '查看帮助',
    helpMsg: '展示阶段记住所有 emoji。翻面时其中一个被偷偷替换，翻回正面后找出冒牌货！',
    help1: 'emoji 模式 1×3 到 4×5 共九关（观察 2~7 秒）；扑克牌面 1×4 到 4×7 共十关；麻将牌面沿用 emoji 九关，只是换成麻将牌。',
    help2: '观察后卡片翻面 1 秒，趁翻面偷换再翻回。',
    help3: '点中被替换的 emoji 即胜利。点错会抖动、扣心并标红，标红后不能再点。',
    help4: '过关可选重玩或下一关，新游戏回第 1 关。',
    help5: '帮助旁的按钮在 emoji / 扑克 / 麻将三种牌面间循环：玩法相同，关卡与局面各自保存，切回接着玩。',
    confirmText: '好的，明白',
    rotateTip: '请旋转设备至竖屏',
    // ---- 新游戏二次确认（web 的 shared/ConfirmDialog.vue）----
    confirmTitle: '🔄 开始新游戏？',
    confirmMsg: '会清除闯关记录并从第 1 关重新开始；只想重玩当前这一关，就点「重玩本关」。',
    confirmOk: '确定重来',
    confirmReplay: '重玩本关',
    cancel: '取消',
  },
  en: {
    gameTitle: 'Detective',
    bestScore: '🏆 Best Level',
    levelLabel: '🏁 Level',
    livesLabel: '❤️ Lives',
    start: '🎮 New Game',
    nextLevel: '➡️ Next Level',
    replayLevel: '🔄 Replay Level',
    phaseMemory: '👀 Memorize!',
    phaseFlip: '🃏 Shuffling...',
    phaseAnswer: '🔍 Which one was swapped?',
    phaseAnswerCard: '🔍 Which card was swapped?',
    modeEmoji: 'emoji',
    modePoker: 'cards',
    modeMahjong: 'mahjong',
    modeTip: 'Switch the card faces: emoji / poker cards / mahjong tiles (levels and progress are kept separately)',
    tipWin: 'You Got It',
    tipLost: 'Out of Hearts',
    stampText: 'Correct',
    helpTip: 'Click for help!',
    helpMsg: 'Memorize every emoji in the preview. One is swapped during the flip — spot it when they flip back!',
    help1: 'Emoji mode runs nine levels from 1×3 to 4×5 (2–7s preview); poker mode runs ten levels from 1×4 to 4×7; mahjong mode reuses the emoji levels with tile faces.',
    help2: 'Cards flip 1s; the swap happens mid-flip, then they flip back.',
    help3: 'Tap the swapped emoji to win. Wrong taps cost a heart and turn red — red cards are locked.',
    help4: 'Win: Replay or Next Level. New games start at level 1.',
    help5: 'The button beside help cycles emoji / poker / mahjong faces. Rules are the same, but each mode keeps its own level and save.',
    confirmText: 'OK, I See',
    rotateTip: 'Please rotate your device to portrait',
    // ---- new-game confirmation (web shared/ConfirmDialog.vue) ----
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
