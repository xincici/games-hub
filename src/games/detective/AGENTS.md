# Emoji 侦探（`src/games/detective/`）

> 这是根目录 [`AGENTS.md`](../../../AGENTS.md) 的**游戏分册**：只讲这个游戏自己的实现、
> 存档 key 和踩过的坑。**改这个游戏前先读这里**；跨游戏共用的约定（视觉语言、共享组件、
> 闯关游戏统一约定、新增游戏流程）看根目录。
>
> - 路由：`/#/detective`
> - i18n key 前缀：`__emoji_detective__`
> - 共享组件：`src/shared/`（`i18n.js` / `theme.js` / `confetti.js` / `CountTimer.vue` / `ConfirmDialog.vue` / `Hearts.vue` / `ParticleBackground.vue` 等）

## 实现

DetectiveGame.vue（emoji 找茬侦探：记忆→翻面→偷换→答题；掉一颗心扣 1 条命，生命行用 `shared/Hearts.vue`。**两种牌面**：顶栏帮助旁的模式开关切 emoji ↔ 扑克（`mode` 1/2，存 `__emoji_detective__mode`），玩法一样、只是牌面与排列不同。扑克牌面**直接复用 `games/poker/CardItem.vue`**（纯展示组件，无扑克那边的状态依赖），尺寸用 `cardVars` 内联 --width/--height/--text-size/--icon-size/--back-size（内联优先级最高，不用改扑克样式、也不受 scoped 影响）。牌是 2:3 长方形，所以 `metrics` 同时按宽和高反推格子：`byH = (availH - 2GAP - (rows-1)GAP) / rows` 再除 1.5 得宽度上限，行数一多就靠高度反推（不然 568 高的屏上四行牌会顶出屏幕），行高走 `--cell-h`（emoji = 边长、扑克 = 1.5 倍宽）。扑克模式牌数更多（1×4 → 4×7 共十关；emoji 是 1×3 → 4×5 共九关 —— 有花色 + 点数两层线索更好记），`.board.poker .face` 把外框底色 / 描边 / 阴影让开、整张牌交给 CardItem，只留 3D 翻面与「答对高亮」（高亮那条选择器权重更高所以仍生效）。**结算前停留 0.5s**（`useResultDelay()`）：答对或扣掉最后一颗心后先停 0.5s 再弹浮层，期间点选直接返回；答对的**当场亮绿**（`rightIdx`）、扣心的当场标红抖动，停留里看得到结果。**选错**：抖动 + 扣心 + 进 `wrongIdxs` 常驻红标，`onCellClick` 忽略已标错的（否则同一张能反复点、反复扣心）。emoji 模式红标画在 `.front-face`（淡红底 + 红描边），扑克模式牌面透明、红标画成 `:deep(.card)` 外一圈；下标也写进存档（`wrong`）并随胜利结算层还原，回来能看到「红 = 自己点错的、绿 = 答案」。两种模式的关卡进度、最高关卡与局面**分开存**（emoji 用 `__emoji_detective__level` / `best`，扑克 `_2` 后缀），`toggleMode` 先 `save()` 当前模式再切、然后 `bootMode()`（有存档接着玩、没有就开新局）；连点标题清记录会把两边最高关卡一起清）+ i18n.js（route /detective，key 前缀 __emoji_detective__）。顶部统计卡中间显示「当前第几关」，「新游戏」走共用的 `ConfirmDialog`（确认后清当前牌面的记录并回第 1 关）

## 存档（localStorage）

  - Emoji 侦探：`__emoji_detective__*`（牌面 `__emoji_detective__mode`=1 emoji / 2 扑克；两种牌面各存一份——emoji 沿用 `__emoji_detective__level` / `best`，扑克用 `level_2` / `best_2`（关卡进度与局面同一个 key，JSON：关卡、剩余❤️、阶段、用时、盘面、被偷换的下标、已标错的下标，扑克的盘面是 `{num, type}`），最高关卡分别 `__emoji_detective__best` / `best_2`；**胜利与失败局面都会连盘面带答案一起保留**（失败时 `hearts` 为 0、并亮出被偷换的那张与所有标错的下标），重进仍是结算层，玩家自己选「重玩本关 / 下一关」；只有中途退出（记忆 / 翻面 / 作答）不还原，直接重开当前关）

## 界面约定

- 顶栏「游戏特色按钮」：牌面玩法切换（`TopHeader` 默认插槽）
