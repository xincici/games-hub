// Emoji 排序 · 本页局部文案（不塞进 core/i18n.js，避免和其它页面的大文件冲突）。
// 文案逐字来自 web 的 src/games/sort/i18n.js（连 emoji 前缀都保留，按钮文案与 web 一致）；
// 新游戏二次确认的三个按钮来自 web 的 shared/ConfirmDialog.vue。
// cn / en 的 key 集合必须完全一致（缺一个中文就会直接显示原始 key）。
import { lang } from '@/core/settings';

const dict = {
  cn: {
    gameTitle: 'Emoji 排序',
    levelLabel: '🏁 关卡',
    doneLabel: '✅ 已归位',
    movesLabel: '👣 步数',
    start: '🎮 新游戏',
    replayLevel: '🔄 重玩本关',
    nextLevel: '➡️ 下一关',
    levelDone: '第 {n} 关完成!',
    movesDone: '{n} 步',
    stuckTitle: '这局赢不了了',
    stuckNote: '已归位 {n} 槽',
    boardLabel: '{slots} 槽 · 每槽 {capacity} 层 · {kinds} 种',
    helpTip: '查看帮助',
    helpMsg: '点一个槽位抬起槽口那一摞同种水果，再点另一个槽位放下——只能放到同种或空槽上。每个槽只剩同一种、水果全翻正即过关。',
    help1: '难度只由每种水果的张数 M 和种类数 K 决定，两者交错爬升、每 2~4 关抬一档：从 3 种 × 3 张到第 30 关的 6 种 × 8 张；第 30 关封顶，关数无限。',
    help2: '开局每个槽只有槽口那张朝上，其余扣着；扣着的不能拿起，也不能当放置目标。',
    help3: '点一个槽位，槽口那一摞同种水果（只算正面朝上的）整摞抬起；再点同一个槽位放回，点另一个槽位则先平移过去、再从正上方落下。装不下时只搬放得下的张数，其余落回原槽。',
    help4: '放置时目标槽槽口必须同种，或完全空着；每槽最多装 M 张。',
    help5: '槽口的水果搬走后，下面那张扣着的会自动翻正，但要等这一摞落定才翻。想翻到槽底就得一层层搬。',
    help6: '水果全翻正、每槽一种（空槽也算）即过关。',
    help7: '每走一步判一次：还有牌扣着却再也翻不开新的，或全翻开后怎么都排不出来，就判负，可从结算遮罩重玩本关；只要还能翻牌就不判负。「新游戏」二次确认后清记录、回第 1 关。',
    help8: '每局经求解器验证有解才发牌，每关都能过。',
    help9: '帮助图标旁可切换玩法。经典：每种刚好装满一槽 + 2 个空槽；紧凑：1 个空槽，但每槽顶格留空。两种玩法进度与存档独立，「新游戏」只清当前玩法。',
    modeTip: '切换玩法：经典（2 个空槽）/ 紧凑（1 个空槽 + 每槽顶部留一格）',
    confirmText: '好的，明白',
    rotateTip: '请旋转设备至竖屏',
    // 新游戏二次确认（与 web 的 shared/ConfirmDialog.vue 同款文案）
    confirmTitle: '🔄 开始新游戏？',
    confirmMsg: '会清除闯关记录并从第 1 关重新开始；只想重玩当前这一关，就点「重玩本关」。',
    confirmOk: '确定重来',
    confirmReplay: '重玩本关',
    cancel: '取消',
  },
  en: {
    gameTitle: 'Emoji Sort',
    levelLabel: '🏁 Level',
    doneLabel: '✅ Sorted',
    movesLabel: '👣 Moves',
    start: '🎮 New Game',
    replayLevel: '🔄 Replay Level',
    nextLevel: '➡️ Next Level',
    levelDone: 'Level {n} cleared!',
    movesDone: '{n} moves',
    stuckTitle: 'No Way to Win',
    stuckNote: '{n} sorted',
    boardLabel: '{slots} slots · {capacity} deep · {kinds} kinds',
    helpTip: 'Click for help!',
    helpMsg: 'Tap a slot to lift its top run of same fruits, then tap another to drop them in — only onto the same kind or an empty slot. Get each slot to one kind and every fruit face up.',
    help1: 'Difficulty comes only from the fruit copies M and the kind count K. They climb in turn every 2~4 levels: from 3 kinds × 3 copies to 6 kinds × 8 at level 30, the hardest setting. Levels never end.',
    help2: 'Only the top fruit of each slot starts face up; face-down fruit cannot be picked up or dropped on.',
    help3: 'Tapping a slot lifts its top run of identical face-up fruits. Tap the same slot to put them back; tap another and they slide across, then drop straight in. If the target cannot take them all, only what fits moves and the rest settle back.',
    help4: 'Drop only on the same kind or an empty slot, and never past capacity M.',
    help5: 'Move the top fruit away and the one below flips up once the moved fruits land. To reach the bottom, move layer by layer.',
    help6: 'All fruit face up; every slot one kind (empty slots are fine).',
    help7: 'Fail only if fruit stays face down with no move that can flip one, or all is face up but unsortable — replay from the result screen. A reachable flip keeps you safe. New Game clears records and restarts at level 1.',
    help8: 'Boards are solver-checked, so every level can be won.',
    help9: 'Mode switch by help. Classic: each kind fills a slot + 2 empty ones. Compact: 1 empty slot, but each slot keeps its top cell free. Progress is per mode; New Game clears the current one.',
    modeTip: 'Switch mode: Classic (2 empty slots) / Compact (1 empty slot + a free top cell in every slot)',
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
