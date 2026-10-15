# Emoji 对对碰（`src/games/match/`）

> 这是根目录 [`AGENTS.md`](../../../AGENTS.md) 的**游戏分册**：只讲这个游戏自己的实现、
> 存档 key 和踩过的坑。**改这个游戏前先读这里**；跨游戏共用的约定（视觉语言、共享组件、
> 闯关游戏统一约定、新增游戏流程）看根目录。
>
> - 路由：`/#/match`
> - i18n key 前缀：`__emoji_match__`
> - 共享组件：`src/shared/`（`i18n.js` / `theme.js` / `confetti.js` / `CountTimer.vue` / `ConfirmDialog.vue` / `Hearts.vue` / `ParticleBackground.vue` 等）

> 玩法简介（面向玩家）见同目录的 [`README.md`](README.md)；本文档只讲实现、存档与踩过的坑。

## 实现

MatchGame.vue（emoji 对对碰 · 闯关制：每关一副新牌，分两段 —— PREVIEW 全体正面朝上供观察（不计时），观察结束翻面进 PLAY 并开始限时倒计时，限时内清空全部牌过关。**三种牌面**：顶栏帮助旁的模式开关按 emoji → 扑克牌 → 麻将 → emoji 循环（`mode` 1/2/3，存 `__emoji_match__mode`，只有 1/2/3 合法、读到别的值当 1），玩法一样；**麻将沿用 emoji 的关卡曲线与全部玩法参数，只换牌面**，扑克是唯一的另一条曲线。**关卡曲线**（match/board.js，第 1~11 关、11 关封顶、关数无限；`levelConfig` 只有 `mode === 2` 走 2 号表，1 与 3 都走 1 号）：emoji / 麻将 `2×3 → 2×4 → 2×5 → 3×4 → 4×4 → 4×5 → 4×6 → 5×6 → 6×6 → 6×7 → 6×8`，扑克 `2×3 → 2×4 → 2×5 → 3×4 → 4×4 → 3×6 → 4×5 → 4×6 → 5×6 → 6×6 → 6×7`；观察 4s → 14s（按牌数线性给，14s 记不住 48 张是有意的）；操作限时 = 对数 × 每对秒数 + 4s，每对 5.2s → 4.0s。**限时是离线标定的**：拿「有限记忆玩家」模型跑 500 局（观察期记住 `3 + preview*0.85` 张、每回合 3% 忘牌、翻牌 1.0s、翻错再锁 0.7s）—— 第 1 关中位 6s / 限时 20s（3.3 倍余量），第 11 关 p50 80s、p90 89s / 限时 100s（1.25 倍余量，慢一点会失败）；封顶后盘面不变，限时每关再收 2s、收到基准的 90% 就不再上升。**格子尺寸** `metrics` 同时按宽和高反推（`--tile-w` / `--tile-h` / `--gap`；emoji 封顶 96px、扑克 64px；emoji 是正方形、扑克 2:3、麻将 1.282（`shared/mahjongTiles.js` 的 `TILE_RATIO`），竖牌必须显式轨道、不能靠 `1fr` + `aspect-ratio: 1`），emoji 字号走 `--face-font = 格子 × 0.42`，缝隙按对数取 6 / 4 / 3px（**由对数决定、不由格子尺寸决定**，否则和 `metrics` 互相依赖成循环）。扑克牌面**复用 `games/poker/CardItem.vue`**（内联 `cardVars` 传尺寸），`.board.poker .face` 把外框底色 / 描边 / 阴影让开、整张牌交给 CardItem（外框**不能留 1px 边框**、`--width` 取「格子 − 2」、`.card-wrapper` 绝对定位到左上角，否则牌整体偏右 2px）；**麻将牌面复用 `games/mahjong/MahjongTile.vue`**（`MAHJONG_FACES` 的 key 直接当 `card.item` 存 —— 和 emoji 一样是字符串，所以 `keyOf` / 存档格式一个字没改），内联 `mahjongVars` 给 `--mj-w` / `--mj-h`（取「格子 − 2」，与 `.face` 的 1px 描边对齐；别改成格子原尺寸，否则牌面会顶出格子 2px），`.board.mahjong .face` 同样让开底色 / 阴影（雪碧图裁出来的那张牌自带底色与圆角）；进麻将模式前 `onMounted` 与 `toggleMode()` 都会 `await preloadTiles()` —— 牌是雪碧图，不预加载会先渲染空牌、图晚一步到（与麻将英雄 / 麻将传奇共用同一个缓存的 promise，第二次切进来是瞬时的）；配对成功的 `flash`（scale）/ `clear` / `blink`（opacity）都只动 transform / opacity，扑克与麻将模式下照旧生效；配对判定走 `keyOf(item)`（扑克是对象，不能比引用；emoji 与麻将的 key 都是字符串）。**连击**与连连看同一套：`COMBO_MS` 2500、配对成功时 `registerClear`、「翻错」时 `breakCombo`，`combo >= 2` 弹「N 连击」+ `burstConfetti`（喷发点 = 提示条中心往下 30px、粒子 `min(44, 12+n*4)`）；提示条是 `.board` 的**兄弟节点**（在 `.game-area` 里），`top: -15px` 落在操作区下方那条 16px 空隙内。**清空最后一对的瞬间就停表取成绩**（闪烁 + 撒花那 1.5s 不计入用时；期间 `finished` 置位免得切后台回来被重新拉起，`win()` 带 phase 守卫）；`CountTimer` 的 `enable` 只在 visibilitychange 时被读，所以**观察阶段要手动 `reset()` 之后再 `stop()`**（`reset()` 会顺带 start），观察结束再 `reset()` 从 0 起正式计时。顶部统计条「关卡 · 最高关 · 剩余对数」+ 本关进度条；观察 / 操作倒计时**放在操作区中间、也就是「新游戏」左边**（👀 = 观察、⏳ = 操作，不足 15 秒标红），操作区三格比例 1.3 / 1.3 / 1.5（320 宽实测 91 / 91 / 105px 不挤压）。**只有「分出胜负」的局面才落档**（`__emoji_match__state` / 扑克 `__emoji_match__state_2` / 麻将 `__emoji_match__state_3`，三种牌面各一份，写读都走 `stateKeyFor(mode)`）：存档含关卡、牌面、阶段、已用时间、本关用时与每张牌 `[内容, 是否已消]`，只在**胜利 / 失败结算**（以及清空最后一对后那 1.5s 演出期间）写一次 —— **局中不落档**；`restore()` 只接 `phase` 为 WON / OVER 的存档，**一关没打完就退出或切牌面就直接重开本关**（全新一关的 `initLevel` 会 `removeItem` 掉旧存档，所以上一关的结算浮层不会冒到下一关）；`toggleMode()` 走同一条路，所以**切到另一种牌面再切回来，胜利 / 失败结算都还在** —— 存档不分家时踩过这个坑。四个细节：①存档里「消完但阶段还是 PLAY」按胜利处理；②**时间到失败时把剩下的牌全翻正面**再落档（摊牌，重进也是这画面）；③还原时棋盘加 `.instant`（不重播发牌动画）；④已消掉的牌带 `settled`，CSS 让它们停在 `rotateY(180deg) scale(0)` 且 `animation: none` —— 否则 `.tile.matched` 的 `flash + clear` 会重播，重进看到「已消的卡片又闪一次再消失」。牌背：emoji 模式取本游戏在首页的图标（`gameConfig('match').icon`），麻将模式用共享组件 **`shared/MahjongBack.vue`**（绿色纹理，铺满整张牌）+ i18n.js（route /match，key 前缀 __emoji_match__）

## 存档（localStorage）

  - Emoji 对对碰：`__emoji_match__*`（牌面 `__emoji_match__mode` = 1 emoji / 2 扑克 / 3 麻将，只接受这三个值、别的当 1）
    - 三种牌面**各存一套进度与局面**，后缀由 `modeSuffix(m)` 给：emoji **无后缀**（沿用老 key）、扑克 `_2`、麻将 `_3`。
      代码里一律走 `levelKeyFor(m)` / `bestKeyFor(m)` / `stateKeyFor(m)`，不要写死 key。
    - 当前关卡：`__emoji_match__level`（emoji）/ `__emoji_match__level_2`（扑克）/ **`__emoji_match__level_3`（麻将）**
    - 历史最高关卡：`__emoji_match__best_1`（emoji）/ `__emoji_match__best_1_2`（扑克）/
      **`__emoji_match__best_1_3`（麻将）** —— 基础 key 本身就是 `best_1`（沿用「前缀+数字」以便连点标题清记录），
      所以扑克 / 麻将是在它后面**再接**后缀；`onScoreReset()` 把三个模式的 best key 一起清
    - 局面 + 胜负结算：`__emoji_match__state`（emoji）/ `__emoji_match__state_2`（扑克）/
      **`__emoji_match__state_3`（麻将）** —— 存关卡、牌面 mode、阶段、已用时间、本关用时、每张牌的
      [内容, 是否已消]（麻将的内容就是 `'m5'` / `'z1'` 这种 key）；**只记胜负结算**，
      重进 / 切牌面若停在结算就还原、**没打完则重开本关**
    - 切换牌面接着它自己的关卡进度继续（切走再切回来结算也还在）；**「新游戏」二次确认后只清当前牌面的记录并回第 1 关**，另外两种牌面完全不动，连点标题才三种一起清
  - 旧的 `__emoji_match__difficulty`、`__emoji_match__1|2|3`（最佳用时）与 `difficulty_2` / `1_2`~`3_2` 已废弃

## 界面约定

- 顶栏「游戏特色按钮」：牌面玩法切换（`TopHeader` 默认插槽）。三个分支**静态写在模板里**
  （`v-if="mode === 1"` → `i-mdi-emoticon-happy-outline`、`v-else-if="mode === 2"` →
  `i-mdi-cards-playing-outline`、`v-else` → `i-dinkie-icons-three-of-circles-mahjong`），
  别用变量拼 class —— UnoCSS 提取不到，图标会是空白方块（麻将那个已在 `uno.config.ts` 的 safelist 里）。
- 操作区左侧「盘面信息」：`行×列 · N 对`
- 入场动画的错峰延迟是 **`(行 + 列) * 25ms`**（左上 → 右下的斜向波浪），由模板里算出来（`idx` 按行优先，所以 `行 = floor(idx/cols)`、`列 = idx % cols`）。`.instant .tile { animation: none }` 让**恢复存档**保持不重播入场（只有新开局才播）。
