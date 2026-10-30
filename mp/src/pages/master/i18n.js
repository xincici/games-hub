// 消除大师 · 本页局部文案（不塞进 core/i18n.js，避免动到全局大文件）。
// 文案逐字来自 web 的 src/games/master/i18n.js（cn / en 两段都原样搬过来，key 集合完全一致），
// 另外补了 web 的 shared/ConfirmDialog.vue 自带的那五条（「新游戏」二次确认）：
// 小程序没有共享弹窗，本页用本地三按钮弹窗，需要 title / msg / ok / replay / cancel 五条。
// web 里未被本页用到的 helpTip / confirmText / rotateTip（title 属性、旧帮助按钮、横屏提示）没有搬。
// 约束：cn 与 en 的 key 集合必须完全一致（加 key 记得两边一起加）。
import { lang } from '@/core/settings';

const dict = {
  cn: {
    gameTitle: '消除大师',
    level: '🏁 关卡',
    remain: '🃏 剩余卡片',
    layersLabel: '{n} 层',
    kindsLabel: '{n} 种',
    start: '🎮 新游戏',
    tipWin: '过关',
    tipLost: '游戏失败',
    levelDone: '第 {n} 关完成!',
    nextLevel: '➡️ 下一关',
    replayLevel: '🔄 重玩本关',
    helpMsg: '卡片分层堆叠。点没遮挡的亮卡片落入 7 格收集槽，凑齐 3 张同款即消除（右上角图标可切换 emoji / 麻将牌两种牌面）。',
    help1: '只有未被遮挡的卡片可点，其余变暗。',
    help2: '凑齐 3 张同款 emoji 即消除、空出槽位；同款排在一起。',
    help3: '清空全部卡片即过关；7 格填满无消除即失败，可重玩本关。',
    help4: '层数、种类随关卡增长：2 层 7 种起，50 关封顶 8 层 18 种；麻将牌面种类更多（10~26 种）、同一种出现 6 张的情况更少。同种可出多组，张数是 3 的倍数，无计时。',
    // ---- 新游戏二次确认（web 的 shared/ConfirmDialog.vue）----
    confirmTitle: '🔄 开始新游戏？',
    confirmMsg: '会清除闯关记录并从第 1 关重新开始；只想重玩当前这一关，就点「重玩本关」。',
    confirmOk: '确定重来',
    confirmReplay: '重玩本关',
    cancel: '取消',
  },
  en: {
    gameTitle: 'Elimination Master',
    level: '🏁 Level',
    remain: '🃏 Tiles Left',
    layersLabel: '{n} layers',
    kindsLabel: '{n} kinds',
    start: '🎮 New Game',
    tipWin: 'Level Clear',
    tipLost: 'Game Over',
    levelDone: 'Level {n} cleared!',
    nextLevel: '➡️ Next Level',
    replayLevel: '🔄 Replay Level',
    helpMsg: 'Tiles stack in layers. Tap an uncovered tile to drop it into the 7-slot tray; three of a kind clear. The icon beside help switches between emoji and mahjong faces.',
    help1: 'Tap only uncovered tiles; others are dim.',
    help2: 'Collect 3 matching emojis to clear them; same emojis sit together.',
    help3: 'Clear every tile to pass; if all 7 slots fill with no match, the level fails.',
    help4: 'Layers and kinds grow with the level: 2 layers / 7 kinds first, 8 / 18 from level 50. Mahjong faces use more kinds (10 to 26) and rarely repeat one six times. A face may have several triples, so its tiles are a multiple of 3. No timer.',
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
