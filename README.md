# Games Hub · 游戏合集

23 个休闲小游戏的合集单页应用：首页选择游戏，游戏内点 🏠 随时返回。

| 游戏 | 玩法简介 |
| --- | --- |
| 👆 [点击游戏](src/games/click/README.md) | 点击方块把全盘数字归零 |
| 🧩 [数字迷宫](src/games/puzzle/README.md) | 数字华容道，按顺序排好 |
| 🔢 [1A2B](src/games/guess/README.md) | 8 次机会猜出 4 位数 |
| 🃏 [德州扑克](src/games/poker/README.md) | 单人视频扑克，选牌换牌 |
| 3️⃣ [Threes](src/games/three/README.md) | 1 + 2 = 3 的合成消除 |
| 🔢 [2048](src/games/g2048/README.md) | 经典 2048，凑出 2048 |
| 🐍 [贪吃蛇](src/games/snake/README.md) | 控制蛇吃食物，别撞到自己 |
| 😊 [Emoji 对对碰](src/games/match/README.md) | 记忆翻牌闯关，限时清空全盘 |
| 🔗 [Emoji 连连看](src/games/link/README.md) | 连连看闯关，限定时间内清盘 |
| 🕵️ [Emoji 侦探](src/games/detective/README.md) | 记住牌面，找出被偷换的那张 |
| 🎯 [Emoji 猎手](src/games/hunter/README.md) | 记住目标 emoji，从候选区全部找回 |
| ⭐ [Emoji 消消乐](src/games/crush/README.md) | 三消闯关，限定步数内达成目标分 |
| 🗾 [数独](src/games/sudoku/README.md) | 唯一解数独，填错扣命 |
| ⬇️ [Emoji 下坠](src/games/down/README.md) | 反应街机：让顶层 emoji 对上同款炸一排 |
| 🧩 [Emoji 滑行](src/games/slide/README.md) | 棋盘腾挪消除，计时结束前清盘 |
| 🔬 [Emoji 排序](src/games/sort/README.md) | 水排序：把每个槽理成同一种水果 |
| 🧱 [Emoji 大师](src/games/master/README.md) | 羊了个羊式堆叠消除 |
| 🧪 [扑克炼金术](src/games/alchemy/README.md) | 4×4 扑克炼金，凑牌型消线得分 |
| 🀄 [麻将英雄](src/games/mahjong/README.md) | 3×3 麻将消除，凑顺子 / 刻子 |
| 🀄 [雀圣](src/games/quesheng/README.md) | 5×5 麻将滑牌，消完整副可赢的牌 |
| 🀄 [麻将传奇](src/games/legend/README.md) | 条牌 + 少量字牌，升行顶出即结束 |
| 🪞 [Emoji 镜像](src/games/mirror/README.md) | 猜出被打乱后藏起来的 emoji 顺序 |
| 🧮 [24 点](src/games/point24/README.md) | 用 4 个数字和加减乘除凑出 24 |

## 功能特性

- 🎨 深 / 浅色主题切换，全站共享
- 🌐 中 / 英双语切换，全站共享（帮助弹窗、界面文案全覆盖）
- 🏠 游戏标题栏一键返回主页
- 🎮 首页标题栏居中显示游戏图标（favicon 同款图案的矢量源文件），不再显示「游戏合集」文案；游戏内标题栏照旧显示各游戏名称
- 📱 移动端优先布局 + PWA，可安装到桌面 / 主屏幕，离线可玩（`workbox.globPatterns` 已带上图片类型，
  麻将牌雪碧图与各图标都进预缓存，断网时牌面也照常显示）
- 💾 各游戏的进度、局面存档、最佳成绩、偏好设置独立存储，互不干扰
- 🏁 五个闯关 emoji 游戏（连连看 / 消消乐 / Emoji 大师 / Emoji 猎手 / Emoji 侦探）、**贪吃蛇**以及**雀圣**连**结算层**也会存档：过关**或失败**后退出重进还是那个结算层（盘面、得分与用时都停在结算那一刻），由玩家自己决定点「下一关」还是「重玩本关 / 新游戏」，既不会一进来就被自动推进到下一关，也不会莫名丢掉刚打完的那一局
- 🎇 全站粒子连线动态背景：固定置底、跟随鼠标 / 触摸（粒子轻微被排斥），按浅 / 深主题自动换色
- ✨ 开局与恢复存档时棋盘逐张入场：2048 / Threes / 消消乐逐张弹出、数独逐格浮现、Emoji 大师自下层向上堆叠、Emoji 排序按槽自下而上堆起来
- 🎉 消消乐的即时庆祝：一轮消掉 4 个以上、或连成连锁（≥2 层）时棋盘外圈闪光、中央弹出「N 连消 / N 连锁」与本次得分（两者同时达成时分成上下两行）、并撒一把花，两者同时达成时浮字与光圈最大（`shared/confetti.js` 新增的 `burstConfetti`，与过关撒花同一套配色，只是原地炸一次）
- 📊 8 个闯关游戏（连连看 / 消消乐 / Emoji 大师 / Emoji 排序 / Emoji 滑行 / 扑克炼金术 / 麻将英雄 / 雀圣）顶部卡片底部有本关进度条，操作区另一半显示本关盘面信息（连连看 / 消消乐：尺寸 · 种类 · 墙数，Emoji 大师：层数 · 种类，Emoji 排序：槽位 · 每槽层数 · 种类），并且只放「新游戏」按钮（点开的是这几个游戏共用的同一个二次确认弹窗，弹窗里除了「确定重来」还有「重玩本关」——只重开当前这一关、保留闯关进度 `shared/ConfirmDialog.vue`，确认后清记录、从第 1 关重来），失败时在结算浮层上「重玩本关」
- 🔹 各 emoji 游戏（对对碰 / 连连看 / 侦探 / 猎手 / 消消乐 / 大师 / 排序）的游戏区都带一层很淡的点阵底纹，牌消掉后不至于一片空白
- 🎨 这 7个 emoji 游戏共用一套视觉参数：棋子/牌面圆角与描边、软阴影、牌背用各自在首页的图标、面板与统计条尺寸、按钮样式、结算浮层的间距与字号（浮层用 box-sizing: border-box，尺寸正好贴合棋盘）
- 🖐️ 首页卡片支持拖动排序，顺序记在本地；新增游戏自动接在已排序结果之后
- 🥚 彩蛋：在有成绩记录的游戏（点击 / 迷宫 / 对对碰 / 连连看 / 侦探 / 猎手 / 消消乐 / 数独 / 排序）中连点标题 5 次清除历史记录

## 开发者看这里

本仓库的开发规范**不在 README 里**，统一收在：

- [`AGENTS.md`](./AGENTS.md) —— 短入口：先读什么、游戏分册索引、常用命令
- [`docs/CONVENTIONS.md`](./docs/CONVENTIONS.md) —— 跨游戏硬约定 + 「开工前逐条核对」清单
- [`docs/NEW-GAME.md`](./docs/NEW-GAME.md)、[`ARCHITECTURE.md`](./docs/ARCHITECTURE.md)、[`VERIFY.md`](./docs/VERIFY.md)、[`PITFALLS.md`](./docs/PITFALLS.md)、[`EASTER-EGGS.md`](./docs/EASTER-EGGS.md)、[`GAMES.md`](./docs/GAMES.md)
- 每个游戏自己的文档：`src/games/<id>/README.md`（怎么玩）/ `src/games/<id>/AGENTS.md`（怎么改）
- 两个脚本：`node scripts/check-conventions.mjs`（约定自检）/ `node scripts/smoke.mjs`（冒烟）

## 技术栈

- Vue 3（Composition API + `<script setup>`）+ Vue Router
- Vite 5
- UnoCSS（attributify + icons：carbon / mdi）
- SCSS
- vite-plugin-pwa
- canvas-confetti

## 快速开始

```bash
yarn install
yarn dev       # 启动开发服务器
yarn build     # 构建到 dist/
yarn preview   # 本地预览构建产物
```

> 本目录的 `.yarnrc` 已将 registry 覆盖为 npm 官方源；若你的全局 yarn 指向内网镜像，无需修改即可正常安装。

## 目录结构

```
src/
├── App.vue          # 根组件 + 全局主题 CSS 变量（浅/深两套）
├── router.js        # hash 路由：/ /click /puzzle /guess /poker /three /2048 /snake /match /link /detective /hunter /crush /sudoku /master /sort /down /slide /alchemy /mahjong /quesheng
├── shared/          # 共享模块：i18n（多语言）、theme（主题）、games（游戏注册表）、emojis（emoji 池）
├── components/      # HomePage（首页）、TopHeader（标题栏）、HelpDialog（帮助弹窗）
└── games/           # 23 个游戏源码，每游戏一个目录
    ├── click/  puzzle/  guess/  poker/  three/  g2048/  snake/
    └── match/  link/  detective/  hunter/  crush/  sudoku/  master/  sort/  down/  slide/  alchemy/  mahjong/  quesheng/
scripts/             # 图标源文件（SVG + 512px PNG）
public/              # favicon 与 PWA 图标
```

各游戏的完整说明与实现细节见 [AGENTS.md](./AGENTS.md)；本合集由同级的 4 个独立游戏项目（`click-game/`、`guess-number/`、`poker/`、`puzzle-game/`）合并而来。

## 浏览器支持

现代常青浏览器（Chrome / Edge / Safari / Firefox）及移动端浏览器。

**屏幕最小兼容到 375×667（iPhone SE）**：更小的屏幕（320×568 一类）不再做适配与验收，布局在 375 宽以上保证不出现横向滚动条、纵向也不滚动（少数游戏在最小屏下会略微纵向滚动，见各游戏分册的「已知情况」）。

## License

MIT
