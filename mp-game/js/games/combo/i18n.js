// 「组牌闯关」：麻将闯关 + 扑克炼金术两种玩法合并后的 3 模式游戏。
// 各模式的具体规则仍写在自己的 help 里，这里只讲三模式入口。
module.exports = {
  cn: {
    gameTitle: '组牌闯关',
    modePoker: '普通',
    modeZjh: '炸金花',
    modeMahjong: '麻将',
    helpMsg: '## 怎么玩\n- 点静音左边的圆形按钮，循环切换普通炼金 / 炸金花 / 麻将闯关\n- 普通炼金：落牌凑出一行、列或斜线四张成牌型即消除\n- 炸金花：3×3 落牌，同行、列或斜线三张成牌型即消除\n- 麻将闯关：3×3 落牌，一行、列或斜线凑成三张成组即消除\n- 三个模式各自独立记关卡，失败或通关后可重玩本关',
  },
  en: {
    gameTitle: 'Tile Quest',
    modePoker: 'Poker',
    modeZjh: '3-Card',
    modeMahjong: 'Mahjong',
    helpMsg: '## How to play\n- Tap the round button beside Mute to cycle Poker / 3-Card / Mahjong\n- Poker: lay four cards in a line or diagonal to make a hand\n- 3-Card: lay cards on the 3x3; three in a line that forms a hand clears\n- Mahjong: lay tiles on the 3x3; a line of three that forms a set clears\n- Each mode keeps its own stage progress; replay or retry after a round',
  },
};
