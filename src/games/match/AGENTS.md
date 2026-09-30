# Emoji 对对碰（`src/games/match/`）

> 这是根目录 [`AGENTS.md`](../../../AGENTS.md) 的**游戏分册**：只讲这个游戏自己的实现、
> 存档 key 和踩过的坑。**改这个游戏前先读这里**；跨游戏共用的约定（视觉语言、共享组件、
> 闯关游戏统一约定、新增游戏流程）看根目录。
>
> - 路由：`/#/match`
> - i18n key 前缀：`__emoji_match__`
> - 共享组件：`src/shared/`（`i18n.js` / `theme.js` / `confetti.js` / `CountTimer.vue` / `ConfirmDialog.vue` / `Hearts.vue` / `ParticleBackground.vue` 等）

## 实现

MatchGame.vue（emoji 对对碰 · 闯关制：每关一副新牌，分两段 —— PREVIEW 全体正面朝上供观察（不计时），观察结束翻面进 PLAY 并开始限时倒计时，限时内清空全部牌过关。**两种牌面**：顶栏帮助旁的模式开关在 emoji ↔ 扑克牌之间切（`mode` 1/2，存 `__emoji_match__mode`），玩法一样、关卡曲线各一条。**关卡曲线**（match/board.js，第 1~11 关、11 关封顶、关数无限）：emoji `2×3 → 2×4 → 2×5 → 3×4 → 4×4 → 4×5 → 4×6 → 5×6 → 6×6 → 6×7 → 6×8`，扑克 `2×3 → 2×4 → 2×5 → 3×4 → 4×4 → 3×6 → 4×5 → 4×6 → 5×6 → 6×6 → 6×7`；观察 4s → 14s（按牌数线性给，14s 记不住 48 张是有意的）；操作限时 = 对数 × 每对秒数 + 4s，每对 5.2s → 4.0s。**限时是离线标定的**：拿「有限记忆玩家」模型跑 500 局（观察期记住 `3 + preview*0.85` 张、每回合 3% 忘牌、翻牌 1.0s、翻错再锁 0.7s）—— 第 1 关中位 6s / 限时 20s（3.3 倍余量），第 11 关 p50 80s、p90 89s / 限时 100s（1.25 倍余量，慢一点会失败）；封顶后盘面不变，限时每关再收 2s、收到基准的 90% 就不再上升。**格子尺寸** `metrics` 同时按宽和高反推（`--tile-w` / `--tile-h` / `--gap`；emoji 封顶 96px、扑克 64px，2:3 的长方形牌必须显式轨道、不能靠 `1fr` + `aspect-ratio: 1`），emoji 字号走 `--face-font = 格子 × 0.42`，缝隙按对数取 6 / 4 / 3px（**由对数决定、不由格子尺寸决定**，否则和 `metrics` 互相依赖成循环）。扑克牌面**复用 `games/poker/CardItem.vue`**（内联 `cardVars` 传尺寸），`.board.poker .face` 把外框底色 / 描边 / 阴影让开、整张牌交给 CardItem（外框**不能留 1px 边框**、`--width` 取「格子 − 2」、`.card-wrapper` 绝对定位到左上角，否则牌整体偏右 2px）；配对成功的 `flash`（scale）/ `clear` / `blink`（opacity）都只动 transform / opacity，扑克模式下照旧生效；配对判定走 `keyOf(item)`（扑克是对象，不能比引用）。**连击**与连连看同一套：`COMBO_MS` 2500、配对成功时 `registerClear`、「翻错」时 `breakCombo`，`combo >= 2` 弹「N 连击」+ `burstConfetti`（喷发点 = 提示条中心往下 30px、粒子 `min(44, 12+n*4)`）；提示条是 `.board` 的**兄弟节点**（在 `.game-area` 里），`top: -15px` 落在操作区下方那条 16px 空隙内。**清空最后一对的瞬间就停表取成绩**（闪烁 + 撒花那 1.5s 不计入用时；期间 `finished` 置位免得切后台回来被重新拉起，`win()` 带 phase 守卫）；`CountTimer` 的 `enable` 只在 visibilitychange 时被读，所以**观察阶段要手动 `reset()` 之后再 `stop()`**（`reset()` 会顺带 start），观察结束再 `reset()` 从 0 起正式计时。顶部统计条「关卡 · 最高关 · 剩余对数」+ 本关进度条；观察 / 操作倒计时**放在操作区中间、也就是「新游戏」左边**（👀 = 观察、⏳ = 操作，不足 15 秒标红），操作区三格比例 1.3 / 1.3 / 1.5（320 宽实测 91 / 91 / 105px 不挤压）。**只有「分出胜负」的局面才落档**（`__emoji_match__state` / 扑克 `state_2`，两种牌面各一份）：存档含关卡、牌面、阶段、已用时间、本关用时与每张牌 `[内容, 是否已消]`，只在**胜利 / 失败结算**（以及清空最后一对后那 1.5s 演出期间）写一次 —— **局中不落档**；`restore()` 只接 `phase` 为 WON / OVER 的存档，**一关没打完就退出或切牌面就直接重开本关**（全新一关的 `initLevel` 会 `removeItem` 掉旧存档，所以上一关的结算浮层不会冒到下一关）；`toggleMode()` 走同一条路，所以**切到另一种牌面再切回来，胜利 / 失败结算都还在** —— 存档不分家时踩过这个坑。四个细节：①存档里「消完但阶段还是 PLAY」按胜利处理；②**时间到失败时把剩下的牌全翻正面**再落档（摊牌，重进也是这画面）；③还原时棋盘加 `.instant`（不重播发牌动画）；④已消掉的牌带 `settled`，CSS 让它们停在 `rotateY(180deg) scale(0)` 且 `animation: none` —— 否则 `.tile.matched` 的 `flash + clear` 会重播，重进看到「已消的卡片又闪一次再消失」。牌背图标取本游戏在首页的图标（`gameConfig('match').icon`）+ i18n.js（route /match，key 前缀 __emoji_match__）

## 存档（localStorage）

  - Emoji 对对碰：`__emoji_match__*`（牌面 `__emoji_match__mode`=1 emoji / 2 扑克；闯关制后只有「当前关卡」`__emoji_match__level` 与「历史最高关卡」`__emoji_match__best_1`（沿用「前缀+数字」以便连点标题清记录），扑克用 `_2` 后缀（`level_2` / `best_2`），两种牌面各自独立 —— 切换牌面接着它自己的关卡进度继续；局面与胜负结算存档 `__emoji_match__state`（扑克是 `state_2`，**两种牌面各一份**：关卡、牌面 mode、阶段、已用时间、本关用时、每张牌的 [内容, 是否已消]；**只记胜负结算**，重进 / 切牌面若停在结算就还原、**没打完则重开本关**）；旧的 `__emoji_match__difficulty`、`__emoji_match__1|2|3`（最佳用时）与 `difficulty_2` / `1_2`~`3_2` 已废弃；**「新游戏」二次确认后只清当前牌面的记录并回第 1 关**，另一种牌面完全不动，连点标题才两边一起清）

## 界面约定

- 顶栏「游戏特色按钮」：牌面玩法切换（`TopHeader` 默认插槽）
- 操作区左侧「盘面信息」：`行×列 · N 对`
- 入场动画的错峰延迟是 **`(行 + 列) * 25ms`**（左上 → 右下的斜向波浪），由模板里算出来（`idx` 按行优先，所以 `行 = floor(idx/cols)`、`列 = idx % cols`）。`.instant .tile { animation: none }` 让**恢复存档**保持不重播入场（只有新开局才播）。
