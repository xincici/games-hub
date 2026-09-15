# AGENTS.md

## 项目概述

「游戏合集」(Games Hub) — 将四个独立小游戏（点击游戏、1A2B、德州扑克、数字迷宫）合并到一个 Vue 3 单页应用中，并新增了 2048、贪吃蛇、Emoji 对对碰、Emoji 连连看、Emoji 侦探、Emoji 猎手、Threes、Emoji 消消乐、数独 (Sudoku) 和 Emoji 大师 (Emoji Master)，现共十四个游戏。首页展示各游戏图标与名称，点击进入对应游戏；游戏内标题栏最左侧有 🏠 按钮返回主页。主题与语言全局共享，各游戏的 localStorage 记录相互独立（沿用原游戏的前缀）。

本目录是从同级的 `click-game/`、`guess-number/`、`poker/`、`puzzle-game/` 四个独立项目合并而来。**原目录保持只读，不要修改**；所有改动都在本目录进行。

## 技术栈

- **框架**：Vue 3（Composition API + `<script setup>`）+ Vue Router（hash 模式，懒加载/静态导入各游戏路由）
- **构建**：Vite 5（`@` 别名指向 `src/`）
- **样式**：SCSS + UnoCSS（presetUno / presetAttributify / presetIcons，图标用 carbon 和 mdi 集合）
- **PWA**：vite-plugin-pwa（autoUpdate，dev 下也启用）
- **依赖管理**：yarn 1.22.22（package.json `packageManager` 已固定；全局 yarn 已升级至 1.22.22，可直接 `yarn <cmd>`）

## 常用命令

```bash
yarn install   # 安装依赖（项目 .yarnrc 已覆盖为 npm 官方源，勿用全局内网镜像配置）
yarn dev       # 启动开发服务器
yarn build     # 构建到 dist/
yarn preview   # 预览构建产物
```

没有测试和 lint 配置。验证改动时用 `yarn build` + headless Chrome 打开各路由（`/`、`/#/click`、`/#/guess`、`/#/poker`、`/#/puzzle`、`/#/2048`、`/#/snake`、`/#/match`、`/#/link`、`/#/detective`、`/#/hunter`、`/#/three`、`/#/crush`、`/#/sudoku`、`/#/master`）做冒烟检查。

## 目录结构

```
src/
├── main.js               # 入口，注册 i18n 插件与路由
├── App.vue               # 根组件：router-view + 横屏提示；定义全局 CSS 主题变量（浅/深两套，各游戏变量并集）
├── router.js             # hash 路由；afterEach 把 activeGame 切到对应游戏命名空间
├── shared/
│   ├── i18n.js           # 共享 i18n：language ref（key __games_hub__language）、按游戏注册字典、i18n()/helpItems()
│   ├── theme.js          # 共享主题（key __games_hub__theme），toggle body.dark
│   ├── emojis.js         # 对对碰 / 连连看共用的 emoji 池
│   ├── confetti.js       # 各游戏共用的撒花动画（canvas-confetti 封装）
│   ├── CountTimer.vue    # 各游戏共用的计时器（挂载即计时、隐藏暂停、onTick 回调、reset/stop/restore；show=false 时只计时不显示数字，连连看用它驱动顶部倒计时）
│   ├── ParticleBackground.vue  # 全站粒子连线背景（固定置底、跟随指针并轻微排斥、按主题实时换色、DPR ≤ 2）
│   └── games.js          # 游戏注册表：路由、首页图标、帮助弹窗 storage key、清记录彩蛋所需前缀/难度范围；同时向 i18n 注册各游戏字典
├── components/
│   ├── HomePage.vue      # 首页：蜂窝排布的卡片网格（2/3/2/3/2/3 行），支持拖动排序（顺序存本地），末尾一张不可点击、不可拖动的「建设中」占位卡片（i-mdi-cogs）
│   ├── TopHeader.vue     # 共享标题栏：🏠 返回主页 + 帮助 + 游戏特色按钮插槽 + 标题（连点 5 次清记录彩蛋；首页位置不显示「游戏合集」文案，改为显示游戏图标——直接引用图标源文件 scripts/make-icon.svg；游戏标题 15px + margin-top 5px，与左右控件对齐）+ 主题/语言切换
│   └── HelpDialog.vue    # 共享帮助弹窗：帮助条目按字典 help1~help9 动态渲染，首次进入自动弹出
└── games/                # 每个游戏一个目录，utils 已扁平化到游戏目录内
    ├── click/            # ClickGame.vue + difficulty/i18n.js + assets/yzcw.mp3
    ├── guess/            # GuessNumber.vue + robot/i18n.js
    ├── poker/            # MainGame.vue + CardItem/RuleArea + bet/constants/dice/rules/i18n.js
    ├── puzzle/           # MainGame.vue + difficulty/rocker/i18n.js
    ├── g2048/            # Game2048.vue + i18n.js（route /2048，key 前缀 __game_2048__；新开局与恢复存档都按行列顺序逐张入场）
    ├── snake/            # SnakeGame.vue（canvas 渲染）+ wall.js（穿墙开关）+ i18n.js（route /snake，key 前缀 __snake_game__）
    ├── match/            # MatchGame.vue（emoji 对对碰）+ i18n.js（route /match，key 前缀 __emoji_match__）
    ├── link/             # LinkGame.vue（emoji 连连看 · 闯关制：限定时间内清空全盘过关，难度 = 列数 6→10 + 行数 6→12 + emoji 种类 6→12 + 对数 9→30 + 墙 0→18 + 限时，第 30 关全部封顶但关数无限；同一种 emoji 可出多对（偶数张即可）；顶部统计条底部有本关进度条（已消对数/总对数），操作区只有「新游戏」（点击弹二次确认、清记录回第 1 关），失败遮罩上给「重玩本关」；倒计时只显示在顶部统计条）+ board.js（纯逻辑：≤2 转弯路径查找、关卡曲线 CURVE 与 levelConfig、buildPairPool 多对发牌、generateLevelBoard/generateWalls、死局重排）+ i18n.js（route /link，key 前缀 __emoji_link__）
    ├── detective/        # DetectiveGame.vue（emoji 找茬侦探：记忆→翻面→偷换→答题）+ i18n.js（route /detective，key 前缀 __emoji_detective__）
    ├── hunter/           # HunterGame.vue（emoji 猎手：记忆→翻面→从候选区找回全部目标）+ i18n.js（route /hunter，key 前缀 __emoji_hunter__）
    ├── three/            # ThreeGame.vue（Threes：1+2=3 合成、牌堆预告、两阶段滑动合成动画；新牌一律从「滑动来源侧」边缘补进（该侧满则退到最近一条线）、盘面上 1 与 2 的个数差恒 ≤ 4（draw/balancedValue 两道校正，开局 9 张同样受约束）；失败局面同样存档恢复（计时停在最终用时，由玩家自己点「新游戏」开新局）；新开局与恢复存档都按行列顺序逐张入场）+ i18n.js（route /three，key 前缀 __threes_game__）
    ├── crush/            # CrushGame.vue（emoji 消消乐 · 闯关制：限定步数内达到目标分过关，各因素（面板 7×7→9×10、种类 5→7、步数 20→17、目标分 700→2100、墙 0→12、炸弹/万能概率）随关卡线性爬升、第 30 关到顶且列/行/种类到顶时点刻意错开避免难度断崖；顶部统计条底部有本关进度条（得分/目标分），操作区左侧显示本关盘面信息（列×行 · 种类 · 实际墙数，墙数为 0 时不显示），右侧只有「新游戏」（点击弹二次确认、清记录回第 1 关，无计时器），失败遮罩上给「重玩本关」；💣 炸弹（相邻格被消除即引爆，炸掉周围 3×3、每格 25 分并震动棋盘、可链式引爆）、💎 万能元素（连线判定时可充当任意种类）、🧱 墙（不可交换/消除，但 emoji 下落时穿过）；炸弹与万能元素持续 0.95~1.05 呼吸缩放；开局/恢复/过关都逐格入场；空闲提示：6s 没有任何操作就扫出所有能消的交换，取「消得最多」那一档随机挑一对（排除最近提示过的 3 对，保证连着几次都不一样），只让这两张牌的 emoji 呼吸两下——`.gem.hinting .face` → `breathe 0.8s ease-in-out 2`（关键帧 1 → 1.2 → 0.8 → 1，与连连看同款），牌面不加任何高亮（无边框 / 发光 / 箭头），`HINT_MS` = 1700ms 后收起；任何点击 / 触摸立刻收起并重新起 6s 计时（`IDLE_HINT_MS` 6000，发牌与连锁结算期间不提示，结算后不再提示）；**恢复存档这条路径不会走 `initLevel`，必须在 `onMounted` 里补一次 `pokeIdle()`**，否则「接着上次的局面玩」时永远不提示；**两条易踩的动画约束**：①`syncGems` 的输出顺序必须是「老 gem 保持原相对顺序 + 新 gem 追加末尾」，按格子顺序重排会让 Vue 的 keyed diff 去搬动 DOM 节点，而同父节点内被搬动的元素会丢掉正在跑的 left/top 过渡（下落就变瞬移）；②`matched` / `blasting` 这两条消除动画的 CSS 规则必须写在 `fresh` / `falling` / `dealt` 之后（选择器权重相同、靠后者胜出），并且 `resolveCascades` 在标记消除时先摘掉这些牌身上的 `fresh`/`fall`，否则连锁中刚落地（甚至刚生成）的牌只会沿用 drop-in / land-bounce，消除动画根本播不出来）+ board.js（纯逻辑：参数化关卡曲线 levelConfig（第 30 关到顶）+ 生成（无现成三连且有解）+ 按种类扩展的连线判定（某个种类的连续块 = 连续的同种 emoji 或钻石，块长 ≥3 且块内真有该种 emoji 时整块消除——钻石因此能跟着它左右任一侧真正成组的那一段走，两侧都不成组时它就不消；整块全是钻石不消） + explode 链式爆炸 + 穿墙重力 + 计分 + 离线校准用的 findBestSwap/resolveTurn）+ i18n.js（route /crush，key 前缀 __emoji_crush__）
    ├── sudoku/           # SudokuGame.vue（数独：唯一解挖洞生成、填错即标红、爱心生命（难度 1~3 = 初始 ❤️ 1~3，扣完再错即失败）、笔记候选、3 难度最佳用时；开局/恢复时格子与数字逐格入场）+ sudoku.js（纯逻辑）+ i18n.js（route /sudoku，key 前缀 __sudoku_game__）
    └── master/           # MasterGame.vue（Emoji 大师 / 羊了个羊闯关玩法：分层堆叠 + 遮挡判定、7 格收集槽三消、关卡难度曲线（组数 8→32（24→96 张）、emoji 种类 6→16、层数 2→8，第 50 关到顶，之后关数无限；同一种 emoji 可出多组，张数恒为 3 的倍数）、无计时器、无洗牌道具、顶部统计条底部有本关进度条（已消卡片/本关总卡片）、操作区左侧显示「层数 · 种类」、新游戏二次确认、开局/恢复时自下层向上逐张堆叠入场；游戏区本身是一张带底色的卡片（`--board-bg` + `--card-radius` + 8px 内边距，与连连看 / 消消乐的棋盘同款——卡片坐标按 `layout` 里的 `BOARD_PAD` 一起算，改内边距要同步改 `unit` 与 `--board-h`）；被压住的卡片按「压在上面的卡片数」分档变淡（depth-1/2/3/4+ → 透明度 0.82/0.66/0.52/0.4，第 50 关约有 33% 的卡片落在最深一档），层数只影响视觉，能不能点仍由 `freeIds` 判定；连点时每张牌各播一条独立飞行动画（互不等待，flights 数组），落格用 settling 标记做重入保护、通关判定要等 flights 清空）+ board.js（纯逻辑：难度曲线 + 错位分层摆放（禁止两张卡片完全重叠、不让任何卡片被彻底遮住）+ buildTripleBag/dealAlongOrder 保证可解的发牌）+ i18n.js（route /master，key 前缀 __emoji_master__）

scripts/                  # 图标源文件（make-icon.svg + icon-512.png），用其缩放生成 public/ 下各尺寸
public/                   # favicon、PWA 图标（已替换为 games hub 专属手柄图标）
```

## 架构要点

- **i18n 命名空间**：`shared/i18n.js` 按路由 meta（`activeGame`）解析当前游戏的字典；`gameTitle` 决定 `document.title`。新增 UI 文案要加到对应游戏 `games/<id>/i18n.js`（或首页的 `shared/i18n.js` 里的 `home` 字典），且中英双语都要加。
- **共享状态**：主题（`body.dark` + `meta[name=theme-color]`）与语言是全局单例，任何页面切换对所有游戏生效；各游戏其余状态（难度、开关、记录）沿用各自原有的 localStorage key。
- **localStorage 约定**（各游戏互不干扰，前缀与原独立项目一致）：
  - 共享：`__games_hub__theme` / `__games_hub__language` / `__games_hub__home_order`（首页卡片排序，新游戏按注册顺序排在已排序结果之后）
  - 点击游戏：`__easy_click_game__*`（难度记录为前缀+难度数字，帮助为 `__easy_click_game__help_showed`）
  - 1A2B（原猜数字）：`__guess_number__*`
  - 德州扑克：`__poker_game_*`（constants.js）
  - 数字迷宫：`__number_puzzle__*`
  - 2048：`__game_2048__*`
  - 贪吃蛇：`__snake_game__*`（难度 `__snake_game__difficulty`，跨难度共享最佳分 `__snake_game__best`，穿墙开关 `__snake_game__through_wall`）
  - Emoji 对对碰：`__emoji_match__*`（难度 `__emoji_match__difficulty`，各难度最佳用时存为前缀+难度数字，如 `__emoji_match__1`）
  - Emoji 连连看：`__emoji_link__*`（闯关进度 `__emoji_link__level`=当前关卡，历史最高关卡 `__emoji_link__best_1`（沿用「前缀+数字」以便连点标题清记录），局面存档 `__emoji_link__state`（盘面、墙、关卡、已用秒数、胜负状态，过关后清除、失败后保留）；旧的 `__emoji_link__difficulty`、`__emoji_link__walls` 与 `__emoji_link__1..5` 已废弃）
  - Emoji 侦探：`__emoji_detective__*`（关卡进度 `__emoji_detective__level`，最高关卡 `__emoji_detective__best`）
  - Emoji 猎手：`__emoji_hunter__*`（关卡进度 `__emoji_hunter__level`，最高关卡 `__emoji_hunter__best`）
  - Threes：`__threes_game__*`（局面存档 `__threes_game__state`，最高分 `__threes_game__best`）
  - Emoji 消消乐：`__emoji_crush__*`（闯关进度 `__emoji_crush__level`=当前关卡，历史最高关卡 `__emoji_crush__best_1`（沿用「前缀+数字」以便连点标题清记录），局面存档 `__emoji_crush__state`（关卡、盘面（含墙/炸弹/万能元素的负值标记）、得分、剩余步数、胜负状态，过关或失败后清除）；旧的 `__emoji_crush__difficulty`、`__emoji_crush__best_2/3` 已废弃）
  - 数独：`__sudoku_game__*`（难度 `__sudoku_game__difficulty`，局面存档 `__sudoku_game__state`（含计时秒数、唯一解答案、剩余❤️，胜利或失败后清除），各难度最佳用时存为前缀+难度数字，如 `__sudoku_game__1`）
  - Emoji 大师：`__emoji_master__*`（`__emoji_master__help_showed`，闯关进度 `__emoji_master__level`（当前第几关，「新游戏」二次确认后清除），局面存档 `__emoji_master__state`（关卡、盘面分层卡片、收集槽，过关或失败后清除））
- **闯关三件套的统一约定**（连连看 / 消消乐 / Emoji 大师）：顶部统计卡底部用 `.progress` + `.progress-bar` 显示本关进度；操作区分两半——左边是本关盘面信息（连连看 `行列 · 种类 · 墙数`、消消乐 `列×行 · 种类 · 实际墙数`（0 面墙不显示）、大师 `层数 · 种类`），右边只放「🎮 新游戏」按钮（三者 `.opt-half` / `.start-wrapper` 的 flex 比例统一为 1.6 : 1.2），点击弹同一个二次确认弹窗（文案由各游戏 i18n 的 `confirmTitle/confirmMsg/confirmOk/cancel` 提供，三处完全一致：清记录 + 回第 1 关，并提示重玩本关请用结算浮层；`.confirm-mask` / `.confirm-box` / `.confirm-title` / `.confirm-msg` / `.confirm-actions` / `.confirm-cancel` / `.confirm-ok` 这七段样式也逐字一致——遮罩无内边距、盒子 `calc(100% - 64px)`（≤320px）+ 左对齐、按钮 `justify-content: flex-end` 的描边胶囊，改一处就要三处一起改）；失败结算浮层只放「🔄 重玩本关」；除连连看（限定时间内清盘）外都不带计时器，连连看与消消乐 / 大师的关卡曲线分别在第 30 / 50 关封顶。
- **游戏特色按钮**：各游戏通过 `TopHeader` 的默认插槽注入自己的开关（click：背景音乐；guess：机器人；poker：骰子/猜大小；puzzle：摇杆）。插槽样式由 TopHeader 的 `:slotted(.item-wrapper)` 提供。
- **玩法保持不变**：迁移自原项目的游戏逻辑（棋盘操作、发牌状态机、判牌、1A2B 判定等）一律不改行为；只允许改导入路径、CSS 变量引用和生命周期清理。

## 约定

- 图标用 attributify 写法：`<i i-carbon-sun />`（不是 class）。首页图标（含 HomePage 里「建设中」占位卡片的 `i-mdi-cogs`）来自运行时数据，UnoCSS 静态提取不到，已列入 `uno.config.ts` 的 `safelist`——**新增首页图标必须同步加 safelist**。
- 主题色一律走 `src/App.vue` 里 `body` / `body.dark` 的 CSS 变量（`--bg-color`、`--card-bg-color`、`--primary-bg`、`--win-color`、`--lose-color` 等，为四个原项目变量名的并集），不要硬编码需要响应深色模式的颜色。
- 布局 mobile-first，内容最大宽度 480px（`--max-width`）。
- 公共逻辑放 `src/shared/`（如 `confetti.js` 撒花动画、`CountTimer.vue` 计时器），各游戏直接 `import ... from '@/shared/xxx'`，不要再复制一份。
- **全站粒子背景**：`shared/ParticleBackground.vue` 由 `App.vue` 挂在内容层（`.app-content`，z-index 1）之下，canvas 为 `fixed + z-index 0 + pointer-events: none`。各页面根容器 `.wrapper` 的不透明底色被 `App.vue` 里的 `#app .wrapper { background: transparent }` 统一置空，改由 `body` 的 `--bg-color` 兜底，粒子才透得上来——**新增游戏不要给根容器或全屏元素加大面积不透明背景**（会挡住粒子）。粒子颜色走 `body` / `body.dark` 的 `--particle-dot`、`--particle-line` 变量（light 灰蓝、dark 淡蓝白），canvas 每帧读取并做 0.25s 缓动过渡。
- 新增游戏：在 `src/games/<id>/` 放组件与 `i18n.js`，在 `shared/games.js` 注册（id/path/icon/helpKey，可选 recordsPrefix + 难度范围），在 `router.js` 加路由，首页图标加进 uno safelist。
- 变更时同步检查 README.md：凡改动影响到 README 中描述的内容（游戏列表、路由、目录结构、localStorage key、功能特性等），必须同步修改 README.md，不许 README 落后于实际。
