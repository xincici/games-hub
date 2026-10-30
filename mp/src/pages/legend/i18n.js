// 麻将传奇 · 本页局部文案（不塞进 core/i18n.js，避免和其它页面的大文件冲突）。
// 文案逐字来自 web 的 src/games/legend/i18n.js（含 en），一个字都没改。
import { lang } from '@/core/settings';

const dict = {
  cn: {
    suitTip: '切换条牌 / 筒牌',
    gameTitle: '麻将传奇',
    best: '🏆 最高分',
    score: '✨ 得分',
    cleared: '🀄 消除',
    start: '🎮 新游戏',
    tipLost: '顶出去了',
    finalScore: '本局得分',
    newBest: '新纪录诞生',
    runName: '顺子',
    tripletName: '刻子',
    kongName: '杠',
    multiName: '连消 {n} 组',
    chainName: '🔥 连击 ×{n}',
    hintText: '点空格落子，点已有的牌把它替换成手上这张',
    confirmText: '知道了',
    rotateTip: '请旋转设备至竖屏',
    help1: '8 行 × 7 列的游戏区。候选区显示当前要出的牌和后两张：点空格就把牌落到那一列（它会顺着这一列往下掉、落在已有的牌上面），点已经放着牌的位置就用手上这张把它替换掉（旧牌弃掉）。',
    help2: '牌组：三张点数连续的顺子 100 分、三张相同的刻子 200 分、四张相同的杠 300 分；牌必须紧挨着（同一行或同一列）。一次消除超过一组时，从第二组起每组再加 100 分。字牌（東南西北中發白）只能靠刻子或杠消掉，凑不出顺子。',
    help3: '消除掉牌的话，这一回合底部不升新牌；没有消除时，底部升上一行随机新牌并把整盘往上顶一格 —— 新行本身也可能直接消除计分。牌不会悬空：消除后的悬空牌会自动落下，落下又消除会形成连击，每连一次额外加 100 分。',
    help4: '有牌升到最顶行就是最后机会：要么消掉它，要么下一次升行就会把它挤出棋盘，游戏结束。',
  },
  en: {
    suitTip: 'Switch bamboo / circle tiles',
    gameTitle: 'Mahjong Legend',
    best: '🏆 Best',
    score: '✨ Score',
    cleared: '🀄 Cleared',
    start: '🎮 New Game',
    tipLost: 'Pushed Out',
    finalScore: 'Score',
    newBest: 'New record',
    runName: 'Run',
    tripletName: 'Triplet',
    kongName: 'Kong',
    multiName: 'Clear x{n}',
    chainName: 'Combo streak x{n}',
    hintText: 'Tap a cell to drop your tile, or tap a tile already on the board to swap it out',
    confirmText: 'OK, I See',
    rotateTip: 'Please rotate your device to portrait',
    help1: 'An 8-row by 7-column board. The tray shows the tile you are about to play and the next two. Tap an empty cell to drop your tile into that column - it falls onto the stack below. Tap a tile that is already on the board to swap it out for yours (the old tile is discarded).',
    help2: 'Sets: a run of three consecutive numbers pays 100, a triplet of three identical tiles pays 200, a kong of four identical tiles pays 300. Sets must be touching, in the same row or column. Every set beyond the first in one clear pays another 100. Honour tiles (east, south, west, north, red, green, white) can only be cleared as a triplet or a kong, never as a run.',
    help3: 'Clearing tiles means no new row this turn. If your move clears nothing, a new random row rises at the bottom and pushes everything up one row - and that new row may clear and score as well. Tiles never float: anything left hanging drops down, and drops that clear again build a combo streak worth 100 extra per clear.',
    help4: 'A tile that reaches the top row is on its last chance: clear it, or the next row that rises pushes it off the board and the game is over.',
  },
};

// lang 是 ref：模板里调用 tt() 会自动建立依赖，切换语言后整页重渲染（与 core/i18n 的 t() 同款）
export const tt = (k) => dict[lang.value]?.[k] ?? dict.cn[k] ?? k;
