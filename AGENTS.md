# AGENTS.md

## 项目概述

「游戏合集」(Games Hub) — 将四个独立小游戏（点击游戏、1A2B、德州扑克、数字迷宫）合并到一个 Vue 3 单页应用中，并新增了 2048、贪吃蛇、Emoji 对对碰、Emoji 连连看、Emoji 侦探、Emoji 猎手、Threes、Emoji 消消乐、数独 (Sudoku)、Emoji 大师 (Emoji Master)、Emoji 排序 (Emoji Sort)、Emoji 下坠 (Emoji Down)、Emoji 滑行 (Emoji Slide)、扑克炼金术 (Poker Alchemy) 、麻将英雄 (Mahjong Hero) 和雀圣 (Mahjong Master)，现共二十个游戏。首页以蜂窝网格展示各游戏图标与名称（一行最多 4 个，1/2/3/4/3/4/3 共 20 格，与游戏数一一对应），点击进入对应游戏；游戏内标题栏最左侧有 🏠 按钮返回主页。主题与语言全局共享，各游戏的 localStorage 记录相互独立（沿用原游戏的前缀）。

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

没有测试和 lint 配置。验证改动时用 `yarn build` + headless Chrome 打开各路由（`/`、`/#/click`、`/#/guess`、`/#/poker`、`/#/puzzle`、`/#/2048`、`/#/snake`、`/#/match`、`/#/link`、`/#/detective`、`/#/hunter`、`/#/three`、`/#/crush`、`/#/sudoku`、`/#/master`、`/#/sort`、`/#/down`、`/#/slide`、`/#/alchemy`、`/#/mahjong`、`/#/quesheng`）做冒烟检查。

## 各游戏分册（**改哪个游戏就先读哪个分册**）

每个游戏自己的实现细节、存档 key、踩过的坑都在它的目录下：`src/games/<id>/AGENTS.md`。
根目录这份只讲「合集」层面的东西（技术栈、共享组件、跨游戏约定、新增游戏流程）。

| 游戏 | 目录 | 分册 | 路由 |
| --- | --- | --- | --- |
| 点击游戏 | `src/games/click/` | [`AGENTS.md`](src/games/click/AGENTS.md) | `/#/click` |
| 1A2B（原猜数字） | `src/games/guess/` | [`AGENTS.md`](src/games/guess/AGENTS.md) | `/#/guess` |
| 德州扑克 | `src/games/poker/` | [`AGENTS.md`](src/games/poker/AGENTS.md) | `/#/poker` |
| 数字迷宫 | `src/games/puzzle/` | [`AGENTS.md`](src/games/puzzle/AGENTS.md) | `/#/puzzle` |
| 2048 | `src/games/g2048/` | [`AGENTS.md`](src/games/g2048/AGENTS.md) | `/#/2048` |
| 贪吃蛇 | `src/games/snake/` | [`AGENTS.md`](src/games/snake/AGENTS.md) | `/#/snake` |
| Emoji 对对碰 | `src/games/match/` | [`AGENTS.md`](src/games/match/AGENTS.md) | `/#/match` |
| Emoji 连连看 | `src/games/link/` | [`AGENTS.md`](src/games/link/AGENTS.md) | `/#/link` |
| Emoji 侦探 | `src/games/detective/` | [`AGENTS.md`](src/games/detective/AGENTS.md) | `/#/detective` |
| Emoji 猎手 | `src/games/hunter/` | [`AGENTS.md`](src/games/hunter/AGENTS.md) | `/#/hunter` |
| Threes | `src/games/three/` | [`AGENTS.md`](src/games/three/AGENTS.md) | `/#/three` |
| Emoji 消消乐 | `src/games/crush/` | [`AGENTS.md`](src/games/crush/AGENTS.md) | `/#/crush` |
| 数独 | `src/games/sudoku/` | [`AGENTS.md`](src/games/sudoku/AGENTS.md) | `/#/sudoku` |
| Emoji 大师 | `src/games/master/` | [`AGENTS.md`](src/games/master/AGENTS.md) | `/#/master` |
| Emoji 下坠 | `src/games/down/` | [`AGENTS.md`](src/games/down/AGENTS.md) | `/#/down` |
| Emoji 滑行 | `src/games/slide/` | [`AGENTS.md`](src/games/slide/AGENTS.md) | `/#/slide` |
| Emoji 排序 | `src/games/sort/` | [`AGENTS.md`](src/games/sort/AGENTS.md) | `/#/sort` |
| 扑克炼金术 | `src/games/alchemy/` | [`AGENTS.md`](src/games/alchemy/AGENTS.md) | `/#/alchemy` |
| 麻将英雄 | `src/games/mahjong/` | [`AGENTS.md`](src/games/mahjong/AGENTS.md) | `/#/mahjong` |
| 雀圣 | `src/games/quesheng/` | [`AGENTS.md`](src/games/quesheng/AGENTS.md) | `/#/quesheng` |

读法：要看 / 改某个游戏，先打开上表里对应的分册；只改共享组件或全局约定时看本文件。
新增游戏时，除了在 `src/games/<id>/` 放组件与 `i18n.js`，也要按上面的格式补一份 `<id>/AGENTS.md`，
并在上表里加一行。

## 目录结构

```
src/
├── main.js               # 入口，注册 i18n 插件与路由
├── App.vue               # 根组件：router-view + 横屏提示；定义全局 CSS 主题变量（浅/深两套，各游戏变量并集）
├── router.js             # hash 路由；afterEach 把 activeGame 切到对应游戏命名空间
├── shared/
│   ├── i18n.js           # 共享 i18n：language ref（key __games_hub__language）、按游戏注册字典、i18n()/helpItems()
│   ├── theme.js          # 共享主题（key __games_hub__theme），toggle body.dark
│   ├── emojis.js         # emoji 池（对对碰 / 连连看 / 排序共用；排序只取最前面的 8 个水果）
│   ├── confetti.js       # 各游戏共用的撒花动画（canvas-confetti 封装）：默认导出 `celebrate()` 是过关时左右两侧喷洒 1.2s 的大撒花；具名导出 `burstConfetti(intensity, { origin, count })` 是「一局之内」的即时小爆发（消消乐的大消 / 连锁、连连看的连击），`origin` 按视口比例给喷发点、`count` 可直接压小粒子数
│   ├── resumeCountdown.js # 各游戏共用的「继续前的倒数」（贪吃蛇 / Emoji 下坠在用）：`useResumeCountdown(onDone, stepMs = 800)` 返回 `{ count, begin, cancel }`，`begin()` 后先数 3 → 2 → 1（每个数字 800ms）再调 `onDone()` 真正恢复；**倒数期间调用方要继续保持暂停**（`count > 0` 就是还没恢复），组件卸载时自动 `cancel`
│   ├── resultDelay.js    # 各游戏共用的「结算前停留」（侦探 / 猎手在用）：`useResultDelay(stepMs = 500)` → `{ pending, later, cancel }`；`later(fn)` 先置 `pending`（调用方据此锁输入）再 500ms 后执行 `fn`，换关 `cancel()`、卸载自动清
│   ├── Hearts.vue        # 各游戏共用的「剩余生命」：一行 ❤️，失去的变 🤍（一开始 3 颗就 3 个 ❤️）；掉一颗时刚失去的那颗先播 `heart-pop`（scale 1 → 1.55 → 2.1 并淡到透明，0.45s），动画结束才换成 🤍，所以「放大淡出 → 变白」是两段看得到的动作。动画由组件内部的 `watch(left)` 触发，调用方只管把剩余数量传给 `:left`、总数给 `:max`（侦探 / 猎手 = 3，数独 = 难度 1~3），别的什么都不用做；`watch` 只在数量变少时播，恢复存档这种「一进来就少一颗」的情况也会顺势播一下
│   ├── CountTimer.vue    # 各游戏共用的计时器（挂载即计时、隐藏暂停、onTick 回调、reset/stop/restore；show=false 时只计时不显示数字，连连看用它驱动顶部倒计时）
│   ├── ConfirmDialog.vue # 各游戏共用的二次确认弹窗（Teleport 到 body；props: show/title/message/confirmText/replayText/cancelText/showReplay（showReplay=false 不渲染「重玩本关」，默认 true），留空用自带中英文案；emit: confirm/replay/cancel；点遮罩 = cancel；开场动画与帮助弹窗（`HelpDialog.vue`）完全同款——外层 `v-show` 的遮罩 + 内层 `<Transition name="inner">`，三条规则逐字一致：`.inner-enter-from { transform: scale(0.1) }`、`.inner-enter-active { transition: transform 0.16s ease-in-out }`、`.inner-enter-to { transform: scale(1) }`；遮罩不淡入、关闭也没有离场动画，两个弹窗的观感因此完全一致）
│   ├── ParticleBackground.vue  # 全站粒子连线背景（固定置底、跟随指针并轻微排斥、按主题实时换色、DPR ≤ 2）
│   └── games.js          # 游戏注册表：路由、首页图标、帮助弹窗 storage key、清记录彩蛋所需前缀/难度范围；同时向 i18n 注册各游戏字典（新增游戏要在表尾追加，首页末位正好接上）
├── components/
│   ├── HomePage.vue      # 首页：蜂窝排布的卡片网格（ROW_SIZES = 1/2/3/4/3/4/3 正好 20 个位置，与 20 个游戏一一对应；比 ROW_SIZES 多出来的卡片走兜底行，且与上一行同奇偶时加半格横向错位保持咬合），支持拖动排序（顺序存本地）。六边形宽度 `--hex-w` **同时受宽度与高度两个约束取小值，保证首页不出滚动条**：宽度约束 `(min(100vw, 480px) − 41px) / 4`（最宽一行 4 格 + 3×3px 缝隙 + 左右各 16px 内边距），高度约束 `(100dvh − 195px) / 5.485`（6 行蜂窝总高 = 4.75h + 13.25px，h = 1.1547w，再扣掉顶栏 94 + 上下内边距 64/24）；实测 320×568 → 68px、375×667 → 84px、390×844 → 87px、414×896 → 93px、480×900 → 110px，五档文档高都等于视口高、无滚动条
│   ├── TopHeader.vue     # 共享标题栏：🏠 返回主页 + 帮助 + 游戏特色按钮插槽 + 标题（连点 5 次清记录彩蛋；首页位置不显示「游戏合集」文案，改为显示游戏图标——直接引用图标源文件 scripts/make-icon.svg；游戏标题 15px + margin-top 5px，与左右控件对齐）+ 主题/语言切换
│   └── HelpDialog.vue    # 共享帮助弹窗：帮助条目按字典 help1~help9 动态渲染，首次进入自动弹出
└── games/                # 每个游戏一个目录，utils 已扁平化到游戏目录内
    ├── click/            # 点击游戏 —— 见 src/games/click/AGENTS.md
    ├── guess/            # 1A2B（原猜数字） —— 见 src/games/guess/AGENTS.md
    ├── poker/            # 德州扑克 —— 见 src/games/poker/AGENTS.md
    ├── puzzle/           # 数字迷宫 —— 见 src/games/puzzle/AGENTS.md
    ├── g2048/            # 2048 —— 见 src/games/g2048/AGENTS.md
    ├── snake/            # 贪吃蛇 —— 见 src/games/snake/AGENTS.md
    ├── match/            # Emoji 对对碰 —— 见 src/games/match/AGENTS.md
    ├── link/             # Emoji 连连看 —— 见 src/games/link/AGENTS.md
    ├── detective/        # Emoji 侦探 —— 见 src/games/detective/AGENTS.md
    ├── hunter/           # Emoji 猎手 —— 见 src/games/hunter/AGENTS.md
    ├── three/            # Threes —— 见 src/games/three/AGENTS.md
    ├── crush/            # Emoji 消消乐 —— 见 src/games/crush/AGENTS.md
    ├── sudoku/           # 数独 —— 见 src/games/sudoku/AGENTS.md
    ├── master/           # Emoji 大师 —— 见 src/games/master/AGENTS.md
    ├── down/             # Emoji 下坠 —— 见 src/games/down/AGENTS.md
    ├── slide/            # Emoji 滑行 —— 见 src/games/slide/AGENTS.md
    ├── sort/             # Emoji 排序 —— 见 src/games/sort/AGENTS.md
    ├── alchemy/          # 扑克炼金术 —— 见 src/games/alchemy/AGENTS.md
    ├── mahjong/          # 麻将英雄 —— 见 src/games/mahjong/AGENTS.md
    └── quesheng/         # 雀圣 —— 见 src/games/quesheng/AGENTS.md

scripts/                  # 图标源文件（make-icon.svg + icon-512.png），用其缩放生成 public/ 下各尺寸
public/                   # favicon、PWA 图标（已替换为 games hub 专属手柄图标）
```

## 架构要点

- **i18n 命名空间**：`shared/i18n.js` 按路由 meta（`activeGame`）解析当前游戏的字典；`gameTitle` 决定 `document.title`。新增 UI 文案要加到对应游戏 `games/<id>/i18n.js`（或首页的 `shared/i18n.js` 里的 `home` 字典），且中英双语都要加；跨游戏共用的组件（如 `ConfirmDialog.vue`）自带字典、不再占各游戏的 key。
- **共享状态**：主题（`body.dark` + `meta[name=theme-color]`）与语言是全局单例，任何页面切换对所有游戏生效；各游戏其余状态（难度、开关、记录）沿用各自原有的 localStorage key。
- **localStorage 约定**（各游戏互不干扰，前缀与原独立项目一致）：**每个游戏的 key 清单、含义与
  「哪些局面会存档」都写在它自己的分册里**（见上方索引），根目录只保留共享 key。
  - 共享：`__games_hub__theme` / `__games_hub__language` / `__games_hub__home_order`（首页卡片排序，新游戏按注册顺序排在已排序结果之后）
- **闯关游戏的统一约定**（对对碰 / 连连看 / 消消乐 / Emoji 大师 / Emoji 排序 / Emoji 侦探 / Emoji 猎手 / 扑克炼金术 / 麻将英雄 / 雀圣）：操作区分两半（对对碰在两者之间还有一格观察 / 操作倒计时）——左边是本关盘面信息（各游戏显示什么见该游戏分册），右边只放「🎮 新游戏」按钮（四者 `.opt-half` / `.start-wrapper` 的 flex 比例统一为 1.6 : 1.2），点击弹同一个二次确认弹窗——各处共用 `src/shared/ConfirmDialog.vue`（模板、`.confirm-*` 样式、中英文案都只有这一份，弹窗三个按钮：**取消 / 重玩本关 / 确定重来**（没有「本关」概念的模式传 `:show-replay="false"` 去掉中间那个按钮，扑克炼金术与麻将英雄的无尽模式都用）。调用方 `<ConfirmDialog :show="confirming" @confirm="startNewGame" @replay="retryLevel" @cancel="confirming = false" />`；`@replay` 只重开当前这一关、**保留闯关进度**（`retryLevel()` 里要顺手 `confirming = false`——五关走 `replayLevel()` → `initLevel()` 的那几个已经关））；失败结算浮层只放「🔄 重玩本关」；**进度条**（3px、贴统计卡底部、主色填充，样式以连连看那份为准）现有七个游戏有：连连看（已消对数 / 总对数）、消消乐、Emoji 大师（已消卡片 / 本关总卡片）、排序、**Emoji 滑行**（已消对数 / 本关总对数）、**扑克炼金术与麻将英雄**（得分 / 目标分，**只在本关模式显示**，无尽模式没有目标分所以不渲染）——后两个的数值是「离过关还有多远」，前几个是「盘面清了多少」。**侦探 / 猎手没有进度条**（它们是单关制、没有「本关总共多少」的概念），但同样：顶部统计卡**中间**一格显示「当前第几关」（`levelLabel` + `level + 1`，两边都是 0 基下标），「新游戏」也走同一个二次确认弹窗（`startNewGame` 里清掉当前牌面的 `bestKey()` 记录再回第 1 关；另一种牌面的记录不动，标题连点彩蛋才两边一起清）；除连连看（限定时间内清盘）外都不带计时器；闭环曲线：连连看 / 排序 / 大师在第 30 / 30 / 50 关封顶，消消乐第 30 关只是结构到顶，之后步数与目标分仍逐关上涨。
- **游戏特色按钮**：各游戏通过 `TopHeader` 的默认插槽注入自己的开关。每个游戏具体挂什么开关写在它自己的分册里。插槽样式由 TopHeader 的 `:slotted(.item-wrapper)` 提供——注意 TopHeader 自己的帮助 / 主题 / 语言按钮也用 `.item-wrapper`，所以**页面上会有多个同名的 wrapper**，测试脚本要按里面的图标（`[i-mdi-xxx]` 属性）去定位，别直接 `querySelector('.item-wrapper')`。
- **玩法保持不变**：迁移自原项目的游戏逻辑（棋盘操作、发牌状态机、判牌、1A2B 判定等）一律不改行为；只允许改导入路径、CSS 变量引用和生命周期清理。

## 约定

- 图标用 attributify 写法：`<i i-carbon-sun />`（不是 class）。首页图标来自运行时数据，UnoCSS 静态提取不到，已列入 `uno.config.ts` 的 `safelist`——**新增首页图标必须同步加 safelist**。
- 主题色一律走 `src/App.vue` 里 `body` / `body.dark` 的 CSS 变量（`--bg-color`、`--card-bg-color`、`--primary-bg`、`--win-color`、`--lose-color` 等，为四个原项目变量名的并集），不要硬编码需要响应深色模式的颜色。
- 布局 mobile-first，内容最大宽度 480px（`--max-width`）。各游戏首张卡片（`.score-area`，点击游戏叫 `.score-card`、1A2B 是 `.opt-area`）的 `margin-top` 统一为 **64px**（内容区因此从 240px 开始，改这个值要连带留意各游戏 JS 里算棋盘尺寸用的视口留白常量，它们按 262 留的余量，偏保守不会溢出）。
- 公共逻辑放 `src/shared/`（如 `confetti.js` 撒花动画、`CountTimer.vue` 计时器），各游戏直接 `import ... from '@/shared/xxx'`，不要再复制一份。
- **棋盘点阵底纹**：`App.vue` 里的全局类 `.dot-board`（`background-color: var(--board-bg)` + 10px 间距的 `radial-gradient` 点阵，点色 `--board-dot` 浅色 0.18 / 深色 0.08 透明度，对比约 1.17:1，很淡不抢牌）。**各 emoji 游戏的游戏区都套它**——对对碰 `.board`、连连看 `.board`、侦探 `.board-frame`、猎手 `.stage-frame` 与 `.candidate-area`、大师 `.board-wrap`、消消乐 `.board-frame`、排序 `.board`、下坠 `.board`、滑行 `.board`；数字类游戏（2048 / Threes）不用。用了这个类**不要再写 `background: var(--board-bg)`**：简写会把 `background-image` 清掉。
- **emoji 游戏的统一视觉语言**（对对碰 / 连连看 / 侦探 / 猎手 / 消消乐 / 大师 / 排序，新增 emoji 游戏请照抄）：
  - 棋子 / 牌面：圆角 `var(--radius-tile)` + `1px solid var(--tile-border-color)` 描边 + `var(--shadow-soft)` 软阴影 + `box-sizing: border-box`；**Emoji 大师例外**：它的卡片是立体的（正面 + 底部厚度 + 落地阴影，用本地的 `card-3d` mixin，见大师分册的「立体卡片」一节），翻牌类另加 `transform-style: preserve-3d` + `backface-visibility: hidden`，翻面 `transition: transform 0.45s ease-in-out`
  - 牌背：底色 `var(--primary-bg)` + `#fff` 图标，图标统一取本游戏在首页的图标（`gameConfig(id).icon`，对对碰 / 侦探 / 猎手都是这么做的），图标字号随格子走
  - 面板 `.card`：`--card-bg-color` + `--card-radius` + `--card-shadow`；统计条高 `var(--row-height)`、操作区 `margin: var(--row-gap) 0` + `height: var(--row-height)`；`.stat-label` 12px、`.stat-value` 22px 粗体
  - 主按钮 `.game-icon`：粗体、`--primary-bg` 底 + 白字、圆角 `var(--radius-tile)`。尺寸默认 `padding: 8px 16px` + 14px，但**贪吃蛇 / 点击 / 数独 / 侦探 / 猎手 / 对对碰 / 下坠 这七个是 `padding: 8px 12px` + 13px**（按钮更窄，320 宽下三格操作区也放得下），其余游戏仍按默认值 —— 改尺寸时这两组要分别对待
  - 操作区左侧那格「盘面信息 / 难度」文字（`difficulty-value` / `level-note` / `board-info`）统一 **14px + `--muted-color` + `font-weight: 400`**（10 个游戏一致：贪吃蛇 / 数独 / 侦探 / 猎手 / 滑行 / 消消乐 / 连连看 / 大师 / 对对碰 / 排序；浅色主题对白卡 5.43:1、深色对深卡 5.56:1）。唯一例外是大师结算浮层里那个同名 `.level-note`（`.result` 内、跟随浮层自己的 `--text-color` + 0.75 透明）
  - **「选对了」的反馈动画**（侦探 `revealed` / 猎手 `found`）：除高亮外再播 `pick-right-pop`（弹一下 1 → 1.18 → 0.96 → 1.04 → 1）+ `pick-right-ring`（绿色光环扩散淡出），关键帧在 `App.vue`。两个坑：**只能挂正面那层 `.face`**（外层 `.card-flip` / `.cand-flip` 的 `transform` 是翻面状态，动画会顶掉它、牌翻回背面）；**只能由「本次点击」的瞬时标记驱动**（侦探 `rightIdx` / 猎手 `justFound`，`clearTimers` 与还原存档时复位），挂在会存档的 `revealed` / `found` 上重进或切模式会重播
  - 计时 / 倒计时文字统一 **14px**：共用 `CountTimer` 的 `.timer`（数独 / 侦探 / 猎手 / 下坠显示它，连连看 / 滑行 `show=false` 不显示）与对对碰操作区里的 `.time-note`（观察倒计时 / 操作倒计时）
  - 难度加减区（点击 / 数字迷宫 / 贪吃蛇 / 数独）的 **`gap: 4px`**，且间距只由这一条负责 —— 数值那一格与 `.opt-icon` 的左右 `margin` 都要归零，否则会叠加（数字迷宫原来靠 `.opt-icon` 的 `margin: 0 4px` 撑间距）。其中**数字迷宫的结构与样式与点击游戏完全一致**：`.card.opt-card > .opt-item + .divider + .opt-item`、难度格 `flex: 3` 其余 `3.5`、数值类名 `.difficulty-num`（`min-width: 22px` / 18px 粗体）、`.opt-icon` 28×28 + `::after` 44×44 点击热区；贪吃蛇 / 数独仍用各自的 `.difficulty-wrapper` + `.difficulty-value`（贪吃蛇那个数值格已对齐点击游戏：`min-width: 22px` + `text-align: center`，数字位数变化时 +/− 按钮不会左右挪——实测难度 1→5 按钮 left 恒为 26 / 84）
  - 竖分隔线 `.divider`：`width: 1px; height: 24px; align-self: center; background: var(--border-color); opacity: 0.6`，**必须定义在 `.wrapper` 层级**（统计条与操作区共用同一个类）——嵌进 `.score-area` 里的话操作区那条就完全没有样式（下坠踩过：操作区的分隔线是 0 高、统计条那条又变成 60% 高且不透明）
  - 结算浮层 `.result`：`--mask-color` 底 + `--win-color` 字（失败态 `--lose-color`）、18px 粗体、`gap: 12px` + `padding: 12px`，大数字（`.final-time` / `.final-score`）28px。**浮层一定要写 `box-sizing: border-box`**：它靠「`width/height: 100%`（或 `inset: 0`）+ 内边距」贴合父容器，默认 content-box 会连内边距一起撑出去，比棋盘大一圈（12px × 2）——对对碰 / 侦探 / 猎手 / 大师都踩过这个坑（都已修）。另外浮层的尺寸完全跟父容器走，所以**父容器必须就是棋盘**：棋盘比 `.game-area` 窄的游戏（侦探的 `.board-frame` 是 `width: fit-content` 居中）要让 `.game-area` 一起收缩（`width: fit-content; margin: 0 auto`），否则浮层会比棋盘宽出左右各 23px
  - 这几项**别再写裸值**（72px / 16px / 8px 之类），改一处要七处一起改
- **复用扑克牌面（`games/poker/CardItem.vue`）的两个坑**（侦探 / 猎手 / 对对碰的扑克模式共用同一套做法）：
  ① `CardItem` 的 `.card` 是 `width: var(--width)` + **1px 描边且没写 `box-sizing: border-box`**，渲染出来比它自己的 `.card-wrapper` 宽 2px、高 2px；而 wrapper 又会被外层 `.face` 的 1px 边框挤窄并居中，牌按 `left: 0` 贴住 wrapper 左边 —— 多出来的那 2px 全跑到右侧，看起来就是「牌在格子 / 容器里偏右、没居中」。做法是：扑克模式的外框写 `border: 0 none`（不是只把 `border-color` 弄透明，那样 1px 的位置还占着）+ 传进去的 `--width` / `--height` 取「格子 − 2」+ 把 `.card-wrapper` 绝对定位到外框左上角（`position: absolute; left: 0; top: 0`），这样牌的外框正好等于格子、四边严丝合缝（实测牌的 `left/top` 偏移归零、容器四边留白相同）。**同一个坑还会咬高亮**：猎手把「找回 / 标错」画成牌外一圈时，第一版画在 `.card-wrapper` 上，结果光环左边露 3px、右边被牌盖掉 1px（wrapper 比牌窄 2px，而且 `.card` 在 wrapper 之后绘制，本来就会盖住它的光环），看着既偏又像被压在牌底下；改画在 `:deep(.card)`（正好等于格子大小、且是这一格里最上层）后才四边等宽、完整可见。
  ② 同一个坑在**扑克炼金术**里的表现不同：它是把牌放进棋盘格子并用 flex 居中，于是牌在格内偏右下
  （实测「左 3px / 右 1px、上 3px / 下 1px」），修法是给 `.board .cell :deep(.card)` 补
  `left: -1px; top: -1px`（候选区的槽位牌与槽等宽，不能一起挪）。
  ③ 给格子加「点击高亮」这类覆盖基础边框的样式时注意**特异性**：格子基础规则通常嵌在多层里
    （编译成 `.wrapper .game-area .board .cell[data-v]`，0,5,0），只写 `.board .cell.flash` 会被它压掉，
    且症状是「box-shadow 生效、边框色没变」——排查手段是页内遍历 `document.styleSheets` 列出命中的 border 规则。
  ④ 用 grid 摆牌时**行高必须跟着牌高走**（`grid-auto-rows: var(--cell-h, var(--cell))`）：漏掉这一条，行高还是按宽度算，2:3 的扑克牌每行只占 2/3 高度，表现是「行与行重叠 + 整块从容器底部溢出」（猎手候选区踩过，实测行高 50 而牌高 75）。
- **阶段提示条要占自己的空白带**（侦探 / 猎手共用同一套做法）：提示条原来是 `position: absolute; top: -14px` 贴在棋盘上边缘，棋盘一大（侦探 4×5、猎手 4×8）第一行牌就被压住。现在 `.game-area` 用 `padding-top: var(--tip-band)`（28px）留出带子、提示条落在带子内（`top: 2px`），牌区从带子下面开始 —— 实测提示条底边与牌顶间隙 3~5px、六种组合（两游戏 × 两种牌面 × 390/320 两档宽度）都不重叠、不滚动。这 28px 必须同时从 `metrics` 的高度预算里扣掉（`(innerHeight - 262 - TIP_BAND)`），否则最高难度会顶出屏幕。侦探的结算浮层也在 `.game-area` 里，所以它得写 `top: var(--tip-band); height: calc(100% - var(--tip-band))` 才能正好盖住棋盘（猎手的浮层在 `.candidate-area` 内，不受影响）。
- **全站粒子背景**：`shared/ParticleBackground.vue` 由 `App.vue` 挂在内容层（`.app-content`，z-index 1）之下，canvas 为 `fixed + z-index 0 + pointer-events: none`。各页面根容器 `.wrapper` 的不透明底色被 `App.vue` 里的 `#app .wrapper { background: transparent }` 统一置空，改由 `body` 的 `--bg-color` 兜底，粒子才透得上来——**新增游戏不要给根容器或全屏元素加大面积不透明背景**（会挡住粒子）。粒子颜色走 `body` / `body.dark` 的 `--particle-dot`、`--particle-line` 变量（light 灰蓝、dark 淡蓝白），canvas 每帧读取并做 0.25s 缓动过渡。
- **页面滑动手势一律用 Pointer Events**（`pointerdown` / `pointermove` / `pointerup`）+ 手势区域内 `touch-action: none`。`touchstart/move/end` 是**只认触摸**的：PC 上拿鼠标怎么拖都不触发（装成桌面应用后更明显 —— 浏览器 / 窗口层会把整段手势当成滚页面或拖窗口收走，再补一个 `touchcancel`）。Threes、Emoji 消消乐、2048、贪吃蛇（转向）、数字迷宫（空白格跟手）都已按这套实现，并且都保留了原有的兜底操作（消消乐点两下换位、2048 / 数字迷宫方向键、数字迷宫摇杆按钮）。`touch-action: none` 只加在「真正拥有这个手势」的元素上：**先量这一页会不会溢出**——不溢出就加在整页 `.wrapper`（Threes / 2048 / 贪吃蛇），会溢出就加在棋盘那层（消消乐 `.board-frame`；数字迷宫 `.game-area`，最高难度 6 在 320×568 下 scrollH 590 > 568，整页 none 会把「滚下去看棋盘」一起吃掉）。
- **整副牌面优先裁图**：需要成套牌面（麻将 / 扑克 / 塔罗之类）时，如果手上有现成的整副图，
  直接按网格裁下来用比 CSS 画省事得多 —— 雀圣就是这么做的（`src/games/quesheng/tiles/*.webp`，
  34 张 131×168 的 webp 共约 220KB，用 `import.meta.glob('./tiles/*.webp', { eager: true, query: '?url',
  import: 'default' })` 取，键是 `m1` / `s8` / `z5`）。裁完要**先拼一张联络表截图肉眼核对**：
  网格顺序不一定按你的直觉（那份图的第 4 行是「北白南中發東西…」而不是东南西北中发白），
  而且原图可能有水印格。**拼成一张雪碧图**更省请求：雀圣把 34 张拼成 7×5 的一张 webp
  （917×840，181KB），运行时用 `background-size: 700% 500%` + `background-position: c/6, r/4`
  的百分比取格子（与元素尺寸无关，缩放不用改），并把这张图在开局前 `await` 预加载好 ——
  **不预加载的话，牌的入场波浪会被图片加载顺序盖掉，看起来就是「顺序不对」**。
  CSS 画法（麻将英雄的筒牌）仍保留给单套小牌面用。
- 新增游戏：在 `src/games/<id>/` 放组件与 `i18n.js`，在 `shared/games.js` 注册（id/path/icon/helpKey，可选 recordsPrefix + 难度范围），在 `router.js` 加路由，首页图标加进 uno safelist。
- **首页「建设中」占位卡（registry 里 `wip: true`）的硬性规矩：永远排在最后、不可点击、不可拖动、也不能被别的卡片换走。**
  **当前首页没有这类卡**（20 个位置正好被 20 个游戏占满，所以暂时把 registry 条目去掉了；`HomePage` 里的整套 `wip` 机制、
  `.hex.wip` 样式和 `uno.config.ts` 里 `i-mdi-hammer-wrench` 的 safelist 都原样留着，恢复时照下面加一条 registry 条目即可）。
  以后要补位（比如首页还差一格、或某游戏临时下线）就照它加一条 registry 条目，实现要点：
  - `path` 指向 `'/'`；`HomePage` 的 `mergeOrder()` 末尾用 `games.filter(g => g.wip)` 把这类卡**强制移到队尾**，
    所以无论本地保存的拖动顺序是什么，它都在最后；
  - 卡片上挂 `.wip` 类，CSS 写 `pointer-events: none`（连拖拽与点击都收不到），并加个 🚧 角标、文字用 `--muted-color`；
  - JS 侧再兜三层：`onPointerDown` 里 `if (card.wip) return`（不能作为拖动源）、`swapCards()` 里 `isWip()` 直接返回
    （不能作为交换目标）、`onCardClick` 里 `preventDefault + stopPropagation`（点了什么都不做，也不跳转）。
  - **注意 SCSS 嵌套**：这条样式要写成 `.hex` 规则里的 `&.wip { ... }` —— 直接写 `.hex.wip` 会被编译成
    `.hex .hex.wip`（要求有 `.hex` 祖先），选择器永远匹配不上，表现是「写了样式却没生效」。
- **文字色要有全局兜底**：`App.vue` 的 `body` 上写了 `color: var(--text-color)`。各游戏页仍会在自己的 `.wrapper` 里
  再写一次（历史习惯），但**新增页面忘了写也不会出问题** —— 麻将英雄第一版就漏了这句，深色主题下整页文字
  继承浏览器默认的黑色（标题对深灰卡片只有 1.39:1、数字 1.66:1），是**穷举式对比度审计**才抓出来的。
- **帮助文案只写玩法**：`help1..helpN` 讲清规则、分数和过关 / 失败条件就够了，**不要写特效细节**
  （「得分满多少会闪烁 / 震动 / 撒花」「结算浮层等提示消失后再出现」这类都属于实现细节，玩家不需要在帮助里看到）。
  能合并的合并（比如把「怎么操作」和「提示区显示什么」并成一条），目前扑克炼金术与麻将英雄各精简到 4 条。
- 变更时同步检查 README.md：凡改动影响到 README 中描述的内容（游戏列表、路由、目录结构、localStorage key、功能特性等），必须同步修改 README.md，不许 README 落后于实际。
