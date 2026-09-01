# AGENTS.md

## 项目概述

「游戏合集」(Games Hub) — 将四个独立小游戏（点击游戏、猜数字、德州扑克、数字迷宫）合并到一个 Vue 3 单页应用中，并新增了 2048 和贪吃蛇，现共六个游戏。首页展示各游戏图标与名称，点击进入对应游戏；游戏内标题栏最左侧有 🏠 按钮返回主页。主题与语言全局共享，各游戏的 localStorage 记录相互独立（沿用原游戏的前缀）。

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

没有测试和 lint 配置。验证改动时用 `yarn build` + headless Chrome 打开各路由（`/`、`/#/click`、`/#/guess`、`/#/poker`、`/#/puzzle`、`/#/2048`、`/#/snake`）做冒烟检查。

## 目录结构

```
src/
├── main.js               # 入口，注册 i18n 插件与路由
├── App.vue               # 根组件：router-view + 横屏提示；定义全局 CSS 主题变量（浅/深两套，六游戏变量并集）
├── router.js             # hash 路由；afterEach 把 activeGame 切到对应游戏命名空间
├── shared/
│   ├── i18n.js           # 共享 i18n：language ref（key __games_hub__language）、按游戏注册字典、i18n()/helpItems()
│   ├── theme.js          # 共享主题（key __games_hub__theme），toggle body.dark
│   └── games.js          # 游戏注册表：路由、首页图标、帮助弹窗 storage key、清记录彩蛋所需前缀/难度范围；同时向 i18n 注册各游戏字典
├── components/
│   ├── HomePage.vue      # 首页：游戏卡片网格，垂直居中
│   ├── TopHeader.vue     # 共享标题栏：🏠 返回主页 + 帮助 + 游戏特色按钮插槽 + 标题（连点 5 次清记录彩蛋）+ 主题/语言切换
│   └── HelpDialog.vue    # 共享帮助弹窗：帮助条目按字典 help1~help9 动态渲染，首次进入自动弹出
└── games/                # 每个游戏一个目录，utils 已扁平化到游戏目录内
    ├── click/            # ClickGame.vue + confetti/difficulty/i18n.js + assets/yzcw.mp3
    ├── guess/            # GuessNumber.vue + CountTimer.vue + confetti/robot/i18n.js
    ├── poker/            # MainGame.vue + CardItem/RuleArea + bet/constants/dice/rules/i18n.js
    ├── puzzle/           # MainGame.vue + confetti/difficulty/rocker/i18n.js
    ├── g2048/            # Game2048.vue + confetti/i18n.js（route /2048，key 前缀 __game_2048__）
    └── snake/            # SnakeGame.vue（canvas 渲染）+ wall.js（穿墙开关）+ i18n.js（route /snake，key 前缀 __snake_game__）

scripts/                  # 图标源文件（make-icon.svg + icon-512.png），用其缩放生成 public/ 下各尺寸
public/                   # favicon、PWA 图标（已替换为 games hub 专属手柄图标）
```

## 架构要点

- **i18n 命名空间**：`shared/i18n.js` 按路由 meta（`activeGame`）解析当前游戏的字典；`gameTitle` 决定 `document.title`。新增 UI 文案要加到对应游戏 `games/<id>/i18n.js`（或首页的 `shared/i18n.js` 里的 `home` 字典），且中英双语都要加。
- **共享状态**：主题（`body.dark` + `meta[name=theme-color]`）与语言是全局单例，任何页面切换对所有游戏生效；各游戏其余状态（难度、开关、记录）沿用各自原有的 localStorage key。
- **localStorage 约定**（各游戏互不干扰，前缀与原独立项目一致）：
  - 共享：`__games_hub__theme` / `__games_hub__language`
  - 点击游戏：`__easy_click_game__*`（难度记录为前缀+难度数字，帮助为 `__easy_click_game__help_showed`）
  - 猜数字：`__guess_number__*`
  - 德州扑克：`__poker_game_*`（constants.js）
  - 数字迷宫：`__number_puzzle__*`
  - 2048：`__game_2048__*`
  - 贪吃蛇：`__snake_game__*`（难度 `__snake_game__difficulty`，跨难度共享最佳分 `__snake_game__best`，穿墙开关 `__snake_game__through_wall`）
- **游戏特色按钮**：各游戏通过 `TopHeader` 的默认插槽注入自己的开关（click：背景音乐；guess：机器人；poker：骰子/猜大小；puzzle：摇杆）。插槽样式由 TopHeader 的 `:slotted(.item-wrapper)` 提供。
- **玩法保持不变**：迁移自原项目的游戏逻辑（棋盘操作、发牌状态机、判牌、猜数字判定等）一律不改行为；只允许改导入路径、CSS 变量引用和生命周期清理。

## 约定

- 图标用 attributify 写法：`<i i-carbon-sun />`（不是 class）。首页图标来自 `shared/games.js` 的运行时数据，UnoCSS 静态提取不到，已列入 `uno.config.ts` 的 `safelist`——**新增首页图标必须同步加 safelist**。
- 主题色一律走 `src/App.vue` 里 `body` / `body.dark` 的 CSS 变量（`--bg-color`、`--card-bg-color`、`--primary-bg`、`--win-color`、`--lose-color` 等，为四个原项目变量名的并集），不要硬编码需要响应深色模式的颜色。
- 布局 mobile-first，内容最大宽度 480px（`--max-width`）。
- 新增游戏：在 `src/games/<id>/` 放组件与 `i18n.js`，在 `shared/games.js` 注册（id/path/icon/helpKey，可选 recordsPrefix + 难度范围），在 `router.js` 加路由，首页图标加进 uno safelist。
