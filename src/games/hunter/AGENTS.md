# Emoji 猎手（`src/games/hunter/`）

> 这是根目录 [`AGENTS.md`](../../../AGENTS.md) 的**游戏分册**：只讲这个游戏自己的实现、
> 存档 key 和踩过的坑。**改这个游戏前先读这里**；跨游戏共用的约定（视觉语言、共享组件、
> 闯关游戏统一约定、新增游戏流程）看根目录。
>
> - 路由：`/#/hunter`
> - i18n key 前缀：`__emoji_hunter__`
> - 共享组件：`src/shared/`（`i18n.js` / `theme.js` / `confetti.js` / `CountTimer.vue` / `ConfirmDialog.vue` / `Hearts.vue` / `ParticleBackground.vue` 等）

> 玩法简介（面向玩家）见同目录的 [`README.md`](README.md)；本文档只讲实现、存档与踩过的坑。

## 实现

HunterGame.vue（emoji 猎手：记忆→翻面→从候选区找回全部目标；选错候选扣 1 条命，生命行用 `shared/Hearts.vue`。**换关的翻牌**：`startLevel` 先把新内容渲染在「全体背面 + `no-anim`（transition: none）」下（`snapping` 标志同时让两个 `isXFaceDown` 返回 true）、跨两帧画出背面，再摘掉 `no-anim`、过一帧进 MEMORY —— 这样展示区每一张（**包括复用的旧节点**）都从背面翻到正面。早先的写法「先画正面、隔两帧再翻背面」不行：`flipped` 加上又在两帧内摘掉，过渡刚起步就被反向取消，复用的旧节点等于没翻、只换了 emoji —— 表现就是「只有新加入的才有翻转动画」。`levelToken` 给换关的异步流程收手（卸载时 +1），避免连点「下一关」时两次 `startLevel` 交错。**三种牌面**：顶栏帮助旁的模式开关按 emoji → 扑克牌 → 麻将牌 → emoji 循环（`mode` 1/2/3，存 `__emoji_hunter__mode`；读到的值只接受 1/2/3，其它一律当 emoji），玩法一样；emoji 6 关（3~8 个目标、候选 3×3 → 4×5），扑克因为 2:3 更好记改成 9 个目标封顶、候选排到 4×8，**麻将只换牌面** —— 关卡表沿用 emoji 的 `LEVELS`，cell 是麻将 key（`'m5'`，与 emoji 一样是字符串，`keyOf` 原样返回），牌面用 `games/mahjong/MahjongTile.vue`；**格子按麻将牌的真实比例排**（`metrics` 里与扑克同一条「竖牌」分支，只是比例换成 `TILE_RATIO` = 168/131 ≈ 1.282、上限 `MJ_STAGE_MAX_W` / `MJ_CAND_MAX_W`，舞台一行 + 候选 rows 行一起按可用高度反推），`--mj-w` 取「格子 − 2」、`--mj-h` **由宽按 168/131 反算**（两边都减 2 会把长宽比拉偏，雪碧图被拉伸、取景偏），`.mahjong .face` 再把外框的底色/描边/阴影让开 —— 卡片本身就是一张麻将牌，**不是「正方形格子中间放一张竖牌」**（用户明确要求，扑克模式早就是按 2:3 这么做的）；「找回 / 标错」的提示环也改画在 `:deep(.mj)` 上。实测 375×667 / 390×844 / 320×568 三档：舞台 44×57、候选 58×75（320 下 34×44），宽高比都是 **0.77**，页面零溢出；麻将模式的牌背换成共享组件 **`shared/MahjongBack.vue`**（绿色纹理，铺满整张牌；emoji 模式仍用 `BACK_ICON`）；切到麻将前先 `await preloadTiles()` 把雪碧图读进缓存（共享 promise），`bootToken` 给这段 await 收手，免得连点开关时两次 bootMode 交错。观察时长 `memoriesFor(level)` = 3.0s 起、**第 3 关起每关 +0.4s（第 6 关 4.2s）**，高关卡适当放宽；`metrics` 一次算出舞台与候选两区的格子：emoji 是正方形、只受宽度限制；扑克（2:3）与麻将（168:131）走同一条「竖牌」分支 —— 按「舞台一行 + 候选 rows 行」的总高反推宽度，行高走 `--stage-cell-h` / `--cand-cell-h`；扑克牌面复用 `games/poker/CardItem.vue`（内联 `stageCardVars` / `candCardVars`），两个容器加 `.poker` 让外框把底色 / 描边 / 阴影让开，「找回」标绿、**「选错」当场抖一下**（`.shaking` + `@keyframes shake`，600ms 后摘掉）并常驻红标（emoji 画在正面、扑克画成牌外一圈），与侦探同款。目标判定走 `keyOf`（扑克是对象，`includes` 在存档还原后必然失效）。关卡进度、最高关卡与局面按模式分开存（emoji 用 `__emoji_hunter__level` / `best`，扑克 `_2`、麻将 `_3` 后缀），连点标题清记录会把三边一起清）+ i18n.js（route /hunter，key 前缀 __emoji_hunter__）。顶部统计卡中间显示「当前第几关」，「新游戏」走共用的 `ConfirmDialog`（确认后清当前牌面的记录并回第 1 关）

## 存档（localStorage）

  - Emoji 猎手：`__emoji_hunter__*`（牌面 `__emoji_hunter__mode`=1 emoji / 2 扑克 / 3 麻将，读到 1/2/3 之外的值一律当 1；三种牌面各存一份——emoji 沿用 `__emoji_hunter__level` / `__emoji_hunter__best`，扑克用 `_2` 后缀（`__emoji_hunter__level_2` / `__emoji_hunter__best_2`），麻将用 `_3` 后缀（`__emoji_hunter__level_3` / `__emoji_hunter__best_3`）；关卡进度与局面同一个 key（JSON：关卡、剩余❤️、阶段、用时、展示牌、候选牌、已找回与标错的键，扑克牌面是 `{num, type}`、麻将牌面是 `'m5'` 这类 key），最高关卡 `__emoji_hunter__best`；**胜利与失败局面都连牌一起保留**（失败时展示牌与候选牌都翻正面、标出找回与标错），重进仍是结算层，玩家自己选「重玩本关 / 下一关」；只有中途退出直接重开当前关）

## 界面约定

- 顶栏「游戏特色按钮」：牌面玩法切换（`TopHeader` 默认插槽）。三个图标都用静态 `v-if` / `v-else-if` / `v-else` 写死类名 —— emoji `i-mdi-emoticon-happy-outline`、扑克 `i-mdi-cards-playing-outline`、麻将 `i-dinkie-icons-three-of-circles-mahjong`（最后这个在 `uno.config.ts` 的 safelist 里），用变量拼 class 的话 UnoCSS 扫不到、会变空白方块
