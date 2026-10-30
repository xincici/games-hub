// Emoji 滑行 · 本页局部文案（不塞进 core/i18n.js，避免和其它页面的大文件冲突）。
// 文案逐字来自 web 的 src/games/slide/i18n.js（cn + en 的 key 集合完全一致）。
// 额外补了 5 个「新游戏」二次确认的 key（confirmTitle / confirmMsg / confirmOk / confirmReplay / cancel）：
// web 那边用的是 shared/ConfirmDialog.vue 自带的文案，小程序没有这个共享弹窗，本地三按钮弹窗要用。
import { lang } from '@/core/settings';

const dict = {
  cn: {
    gameTitle: 'Emoji 滑行',
    level: '🏁 关卡',
    time: '⏱ 时间',
    left: '🧩 剩余',
    kindsUnit: '种',
    start: '🎮 新游戏',
    nextLevel: '➡️ 下一关',
    replayLevel: '🔄 重玩本关',
    tipWin: '过关!',
    tipOver: '时间到',
    shuffled: '没有可消的对，已重新打乱',
    comboTip: '{n} 连击!',
    helpTip: '查看帮助',
    helpMsg: '消掉棋盘所有 emoji。点一个有相邻同款的，两张一起炸掉，没同款则所有同款一起晃动提示。拖动整组滑：带着该方向上紧挨着的连续 emoji 一起滑，松手时落点旁有同款就消这一对、其余留在滑过去的位置，否则整组弹回。限时清空即过关。',
    help1: '点一个有同款邻居的 emoji，两张一起消除；没有则所有同款一起晃动。',
    help2: '往任意方向拖：它带着紧挨着的连续 emoji 一起滑，直到边缘、空格或别的牌前停下。',
    help3: '空格会断开：只有紧挨着按住那张的连续几张跟着走。松手时落点旁有同款就消掉这一对、其余留在滑过去的位置，没有则整组弹回。',
    help4: '消掉的地方空出来，空格就是通道：前面有空间，整排才滑得动。',
    help5: '限时内清空整个棋盘即过关；关卡越高棋盘越大、种类越多、时间越紧。',
    confirmText: '好的，明白',
    rotateTip: '请旋转设备至竖屏',
    // 新游戏二次确认（web 的 shared/ConfirmDialog 三按钮版文案）
    confirmTitle: '🔄 开始新游戏？',
    confirmMsg: '会清除闯关记录并从第 1 关重新开始；只想重玩当前这一关，就点「重玩本关」。',
    confirmOk: '确定重来',
    confirmReplay: '重玩本关',
    cancel: '取消',
  },
  en: {
    gameTitle: 'Emoji Slide',
    level: '🏁 Level',
    time: '⏱ Time',
    left: '🧩 Left',
    kindsUnit: 'kinds',
    start: '🎮 New Game',
    nextLevel: '➡️ Next Level',
    replayLevel: '🔄 Replay Level',
    tipWin: 'Level Cleared!',
    tipOver: "Time's Up",
    shuffled: 'No moves left — board reshuffled!',
    comboTip: '{n} Combo!',
    helpTip: 'Click for help!',
    helpMsg: 'Clear the whole board. Tap an emoji next to a same kind and both pop; with no match, all of that kind wobble. Drag to slide a run as far as the gaps allow — land beside a same kind and the pair pops, the rest staying put; otherwise it springs back. Popped emojis leave the gaps you slide through. Beat the clock.',
    help1: 'Tap an emoji next to a same kind and both pop. No match? That whole kind wobbles.',
    help2: 'Drag any direction: it takes the run right next to it, stopping at the edge or a gap.',
    help3: 'Gaps break the run: only the ones touching it come along. Land beside a same kind and the pair pops; otherwise it springs back.',
    help4: 'Popped emojis leave gaps; those gaps let rows slide.',
    help5: 'Clear the board before time runs out; levels grow bigger and tighter.',
    confirmText: 'OK, I See',
    rotateTip: 'Please rotate your device to portrait',
    // New-game confirmation (same copy as web's shared/ConfirmDialog.vue)
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
