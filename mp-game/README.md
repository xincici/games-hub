# 游戏合集 · 微信小游戏版（`mp-game/`）

这是与 web 站点（`src/`）、微信小程序（`mp/`）**并列**的第三个平台：微信**小游戏**。
三者互不改动；web 是视觉与玩法的基准，小游戏只使用微信小游戏的运行时能力。

## 为什么是另一套工程

小游戏没有 WXML / WXSS / 页面栈，也不能使用 uni-app 的页面组件：

- 入口是根目录 `game.js`；
- 全部 UI 由 canvas 2D 绘制；
- 触摸用 `wx.onTouchStart` / `wx.onTouchEnd`；
- 存档用 `wx.*StorageSync`，音效用 `InnerAudioContext`。

因此它单独成目录，不与 `mp/` 的 uni-app 构建链混在一起。

## 迁移前先读

所有迁移过程中踩过的坑、根因和以后必须遵守的规则，集中在 [`PITFALLS.md`](PITFALLS.md)。迁移新游戏前先扫一遍；完成后再把新坑补进去。

## 当前进度

| 游戏 | 状态 | 路由 / 场景 |
| --- | --- | --- |
| 首页 | ✅ 已搭好（25 个游戏，4+3+4+3+4+3+4 蜂窝） | `HomeScene` |
| 关灯游戏（Lights Out） | ✅ 已移植 | `ClickScene` |
| 对对碰（Match） | ✅ 已移植（emoji / 扑克 / 麻将） | `MatchScene` |
| 24 点（24 Game） | ✅ 已移植 | `Point24Scene` |
| 1A2B | ✅ 已移植 | `GuessScene` |
| 侦探 | ✅ 已移植（emoji / 扑克 / 麻将） | `DetectiveScene` |
| 猎手 | ✅ 已移植（emoji / 扑克 / 麻将） | `HunterScene` |
| 消除大师 | ✅ 已移植（emoji / 扑克 / 麻将） | `MasterScene` |
| 2048 | ✅ 已移植 | `Game2048Scene` |
| Threes | ✅ 已移植 | `ThreeScene` |
| 贪吃蛇 | ✅ 已移植 | `SnakeScene` |
| Emoji 连连看 | ✅ 已移植 | `LinkScene` |
| 数字迷宫 | ✅ 已移植 | `PuzzleScene` |
| Emoji 镜像 | ✅ 已移植 | `MirrorScene` |
| Emoji 下坠 | ✅ 已移植 | `DownScene` |
| Emoji 消消乐 | ✅ 已移植 | `CrushScene` |
| 数独 | ✅ 已移植 | `SudokuScene` |
| Emoji 排序 | ✅ 已移植 | `SortScene` |
| Emoji 滑行 | ✅ 已移植 | `SlideScene` |
| 扑克英雄 | ✅ 已移植 | `PokerScene` |
| 麻将英雄 | ✅ 已移植 | `MahjongScene` |
| 单人麻将 | ✅ 已移植 | `SoloScene` |
| 扑克炼金术 | ✅ 已移植 | `AlchemyScene` |
| 雀圣 | ✅ 已移植 | `QueshengScene` |
| 麻将传奇 | ✅ 已移植 | `LegendScene` |
| 赌神 | ✅ 已移植 | `GamblerScene` |

## 目录

```
mp-game/
├── game.js                 入口
├── game.json               小游戏配置（竖屏）
├── project.config.json     compileType: "game"
├── audio/                  success / lose / elimination 音效
├── images/                 mahjong-tiles.png（与 web 共用麻将雪碧图）
├── fonts/                  games-hub-icons.ttf（由 Iconify 数据生成的 UI 图标字体）
├── scripts/                build-icons.py（从 @iconify-json 生成字体）
└── js/
    ├── core/               canvas / app / input / storage / i18n / theme / audio / draw / icons / motion
    └── games/
        ├── index.js        场景注册表
        ├── home/           首页（六边形入口）
        ├── click/          关灯游戏（logic + scene + i18n）
        ├── match/          对对碰（board + data + tiles + scene + i18n）
        ├── point24/        24 点（board + scene + i18n）
        ├── guess/          1A2B（scene + i18n）
        ├── detective/      侦探（scene + i18n）
        ├── hunter/         猎手（scene + i18n）
        ├── master/         消除大师（board + scene + i18n）
        ├── g2048/          2048（scene + i18n）
        ├── three/          Threes（scene + i18n）
        ├── snake/          贪吃蛇（scene + i18n）
        ├── link/           Emoji 连连看（board + scene + i18n）
        ├── puzzle/         数字迷宫（scene + i18n）
        ├── mirror/         Emoji 镜像（board + scene + i18n）
        ├── down/           Emoji 下坠（board + scene + i18n）
        ├── crush/          Emoji 消消乐（board + scene + i18n）
        ├── sudoku/         数独（sudoku + scene + i18n）
        ├── sort/           Emoji 排序（board + scene + i18n）
        ├── slide/          Emoji 滑行（board + scene + i18n）
        ├── poker/          扑克英雄（rules + scene + i18n）
        ├── mahjong/        麻将英雄（board + scene + i18n）
        ├── solo/           单人麻将（board + scene + i18n）
        ├── alchemy/        扑克炼金术（board + scene + i18n）
        ├── quesheng/       雀圣（board + scene + i18n）
        ├── legend/         麻将传奇（board + scene + i18n）
        └── gambler/        赌神（board + scene + i18n）
```

## 打开方式

1. 微信开发者工具选择「导入项目」；
2. 项目目录选 **`mp-game/`**（不是 web 的 `dist/`，也不是 `mp/`）；
3. 项目类型选「**小游戏**」；
4. `project.config.json` 里的 `appid` 是 `touristappid`（测试号）；真机预览/上传时换成你自己的**小游戏** appid
   （小游戏 appid 与小程序 appid 是两种类型，不能混用）。

## 已实现：关灯游戏

玩法与 web `src/games/click/ClickGame.vue` 一致：

- 3~10 档难度，默认 6；难度存 `__easy_click_game__difficulty`；
- 灯三档 `0 / 1 / 2`，点自身与上下左右各 `+1 mod 3`；
- 每局保证有解（开局随机操作记录成解）；
- 全灭胜利，点击次数用尽失败；
- 最佳成绩按难度存 `__easy_click_game__${难度}`；
- 撤销 / 重做；
- 上帝模式：回放开局的解，播放中再点暂停；玩家操作全部撤销回初始局后可用；
- 中文 / English 跟随系统语言；
- 亮 / 暗主题跟随系统；
- 胜利音效 / 失败音效沿用小程序同一对 mp3。

视觉照 web 的卡片、三档灯、图例、撤销卡和右下角帮助按钮重画；canvas 没有 CSS transition，所以灯的亮度变化由渲染循环对颜色做 0.32s 插值。

## 已实现：数字迷宫 / Emoji 镜像 / Emoji 下坠

- **数字迷宫**：3~6 阶滑块，点击空格相邻数字移动；从完成态随机走合法步保证有解；按难度记录最少点击次数。
- **Emoji 镜像**：展示区先亮出 4~8 个 emoji，翻面后游戏区用同一批 emoji 的错排；点两张交换，提示位置正确数；按难度记录最佳时间。
- **Emoji 下坠**：8×6 棋盘，牌堆持续上升；点列滑到顶排同款上方消掉整排，速度随消除加快，顶到顶部失败。

## 已实现：2048 / Threes / 贪吃蛇 / Emoji 连连看

- **2048**：4×4，滑动移动/合并；分数取盘面最大牌，最高分与 2/4 发牌、130ms 滑动、合并弹跳、胜负结算；存档 `__game_2048__best` / `__game_2048__state`。
- **Threes**：4×4，1+2=3、3 以上同数翻倍，每张牌每次最多走一格；1/2 牌堆平衡、下一张预告、拖动/滑动；存档 `__threes_game__best` / `__threes_game__state`。
- **贪吃蛇**：20×20，1~5 难度、每档速度/得分不同；默认穿墙，帮助旁 FAB 可切换；暂停/继续；最高分与局面存档 `__snake_game__*`。
- **Emoji 连连看**：6×6 到 12×10 的关卡曲线、最多 2 个转折的连线、墙、自动重排、限时；emoji 保留卡片底、空白格不画卡片底，墙是斜纹块，连线带外圈光晕，消除时先闪烁再和连线一起消失；连击小烟花与胜利礼炮都有；存档 `__emoji_link__level|best_1|state`。

## 已实现：侦探 / 猎手 / 消除大师

- **侦探**：先记住盘面，翻面时偷换一张，翻回后找出被换的牌；3 条命，点错扣心并标红；emoji / 扑克 / 麻将三种牌面、各自关卡与局面存档。
- **猎手**：记住展示区目标，翻面后从候选区全部找回；点错扣心；三种牌面各自关卡与局面存档。
- **消除大师**：羊了个羊式分层堆叠，点未被遮挡的牌进入 7 格槽，三张同款消除；清空过关，槽满失败；三种牌面各自记录。暂存槽按牌面比例显示（emoji 1:1、扑克 2:3、麻将 131:168），不再统一为正方形。

三者都使用 [`js/core/cards.js`](mp-game/js/core/cards.js) 的共享牌面绘制；发色 / 牌背 / 麻将雪碧图与对对碰一致。

## 已实现：1A2B

玩法与 web `src/games/guess/GuessNumber.vue` 一致：

- 8 次猜 4 位不重复数字，返回 `nAmB`；
- 8 次内猜中 4A0B 即胜，猜满 8 次失败并公布答案；
- 最长连胜 / 当前连胜；胜利下一局保留连胜，新游戏 / 输局清当前连胜；
- 机器人开关：新局自动填 1234；
- 底部 3 行数字键盘、记录区内部滚动、计时；
- 存档：`__guess_number__state` / `streak` / `best` / `robot`；
- 恢复局面不播动画，只有真正获胜才撒花。

## 已实现：Emoji 消消乐 / 数独 / Emoji 排序 / Emoji 滑行

- **Emoji 消消乐**：三消闯关，步数内达到目标分；支持墙、炸弹、万能、冰块、连锁与关卡曲线；棋盘从 7×7 长到 9×10，存档 `__emoji_crush__*`。
- **数独**：唯一解挖洞、三档难度与 1/2/3 颗心；数字键盘、笔记候选、候选一键填空、同数字/行列宫高亮、最佳用时；存档 `__sudoku_game__*`。
- **Emoji 排序**：水排序，经典/紧凑两种模式；抬起整摞同种水果、自动搬运、暗牌翻面、死局判定；存档按模式独立 `__emoji_sort__*`。
- **Emoji 滑行**：棋盘成对消除，点按找同款 / 拖动整段滑行；限时、连击、自动重排、胜利礼炮；存档 `__emoji_slide__state`。

## 已实现：扑克英雄 / 麻将英雄 / 单人麻将

- **扑克英雄**：单人视频扑克，下注 → 发牌 → 选牌保留 → 换牌 → 结算，支持加成/猜大小与资金记录；存档 `__poker__*`。
- **麻将英雄**：3×3 麻将落子，一行/列/对角线凑顺子或刻子消除，支持闯关/无尽、连击与关卡曲线；存档 `__mahjong__*`。
- **单人麻将**：14 张手牌摸打，四组+将或七对子胡牌；有限牌墙、缺一门、连胜难度与最佳连胜；存档 `__solo__*`。

## 已实现：扑克炼金术 / 雀圣 / 麻将传奇 / 赌神

- **扑克炼金术**：4×4 扑克炼金 / 3×3 炸金花，两种模式独立关卡与存档，凑牌型消线得分。
- **雀圣**：5×5 麻将滑牌，滑动不合并，点齐顺子/刻子/将消除，清完整副牌过关。
- **麻将传奇**：8×7 条牌 + 字牌 + 花牌，升行顶出即结束，刻子/杠消除。
- **赌神**：13 张听牌手牌，从全牌面中找出所有能胡的牌，全对才过关。

## 已实现：24 点

玩法与 web `src/games/point24/Point24Game.vue` 一致：

- 4 个 1~9 数字，保证有解；用 `+ - × ÷` 和括号凑 24；
- 精确分数运算，支持 `8 ÷ (3 − 8 ÷ 3)` 这类题；
- 难度评分 1~100、关卡趋势递增、最近 10 题去重；
- 查看答案 = 放弃，当前连胜清零；最长连胜保留；
- 新游戏在当前连胜 > 0 时二次确认；
- 算式 token、退格、胜利浮层、下一关、帮助；状态按 `__point24__*` 恢复。

## 已实现：对对碰

玩法与 web `src/games/match/MatchGame.vue` 一致：

- 每关先亮牌观察 4~14 秒，翻面后限时清空全盘；
- 关卡曲线、观察时间、操作时间逐条来自 `src/games/match/board.js`；
- 三种牌面 emoji → 扑克 → 麻将循环，三种牌面的关卡 / 最高关 / 结算局面各自保存；
- 连击、翻错中断、阶段提示、进度条、二次确认、胜负结算；
- 发牌斜向波浪、翻牌、配对闪烁、消除缩小、胜利撒花；
- 麻将牌复用 `src/shared/mahjong-tiles.webp`，构建时转成真机兼容的 `images/mahjong-tiles.png`；文字降级只用于图片加载前。

## 计时器与难度控件

正计时统一用秒表图标，倒计时统一用沙漏图标，均走 `core/timer.js` 的 `drawTimer()`。难度步进器统一参考关灯游戏：28×28 描边小按钮、数字居中、点击热区外扩 8px。

## 配对闪烁

对对碰配对成功后的闪烁复用 `js/core/motion.js`：0~450ms 两下缩放脉冲，450~1050ms 闪烁两次，随后缩到 0。以后同类消除动画不要按固定间隔硬切 opacity。

## 牌面渲染统一

所有 emoji / 扑克 / 麻将牌的正面、背面、边框和圆角统一由 [`js/core/cards.js`](mp-game/js/core/cards.js) 绘制，各游戏不再自己实现牌面。麻将正面使用带边框的 PNG 雪碧图，绘制前按统一 8px 圆角裁切，避免方角，也不额外加圆角底和描边；麻将背面统一绿色斜纹。后续迁移新游戏也必须复用这套渲染。

## 场景切换

进入游戏时用离屏快照 + canvas 变换模拟 iOS App 的展开：从首页卡片中心放大；返回首页时向对应卡片中心收缩，320ms，并用透明度过渡。过渡期间屏蔽输入。拿不到第二块画布时退回即时切换。

## 分享 / 转发

微信右上角菜单支持好友转发与朋友圈分享。分享内容跟随当前场景：首页展示合集名，游戏内展示「一起来玩 + 游戏名」；通过分享进入时自动打开对应游戏。朋友圈分享是微信 Beta 能力；注册时只检测基础库 API，客户端不支持时微信会自行置灰入口，普通好友转发仍保持可用。

## 图标方案

小游戏没有 DOM/CSS，不能直接使用 UnoCSS 的 `i-carbon-*` class。这里把同一套 Iconify 数据在构建期转成 TTF：

```bash
# 需要 Python 的 fontTools（本项目构建机已有）
python3 mp-game/scripts/build-icons.py
```

生成：

- `fonts/games-hub-icons.ttf`
- `js/core/icon-glyphs.js`

`game.js` 启动时 `icons.init()` 调 `wx.loadFont()`；场景用 `icons.draw(ctx, name, x, y, size, color)` 绘制。首页 25 个游戏图标也全部来自这套 Iconify 字体：关灯 `idea`、对对碰 `bulb`、24 点 `calculator`、1A2B `counter`、侦探 `incognito`、猎手 `target`、消除大师 `layers`、2048 `calculator`、Threes `numeric-3`、贪吃蛇 `snake`、连连看 `link`、数字迷宫 `puzzle`、镜像 `mirror`、下坠 `down`、消消乐 `crush`、数独 `sudoku`、排序 `sort`、滑行 `slide`、扑克 `mode-poker`、麻将英雄/单人麻将 `mode-mahjong`、炼金 `alchemy`、雀圣 `quesheng`、传奇 `legend`、赌神 `gambler`。没加载成功时保留文字 / emoji 兜底。彩色牌面（麻将）仍走图片雪碧图，因为 icon font 只能单色。

## 后续移植约定

- 新增游戏只加 `js/games/<id>/`，在 `js/games/index.js` 注册；
- 游戏的纯逻辑尽量独立于 canvas（如 `click/logic.js`），方便单元自测；
- 共享 UI 只走 `js/core/draw.js`，不要在场景里重复造圆角 / 阴影 / 文本；
- 存档 key、i18n 文案、玩法参数必须和 web 对得上；
- UI 图标走生成的 icon font；彩色牌面走图片雪碧图，运行时不需要 UnoCSS。

## 当前未做

- 首页目前是 25 个入口，按 4+3+4+3+4+3+4 蜂窝排列；每个游戏使用自己的 accent 强调色（logic / number / memory / action / card），六边形边框和图标不同色。
- 首页右下角设置（参考小程序）：主题（跟随系统 / 浅色 / 深色）、语言（跟随系统 / 中文 / English）、默认牌面、音效；底部抽屉动画，选项按钮组靠右。
- 背景音乐（暂未接入；主题 / 语言 / 音效 / 默认牌面已有设置面板）；
- 横屏适配（首版锁竖屏）；
- 375×667 的 10×10 关灯棋盘会缩小灯珠（没有滚动画布），390×844 与 web 尺寸一致。
