# AGENTS.md

## 先读什么（**顺序很重要**）

| 你要做的事 | 必读 |
| --- | --- |
| **任何改动之前** | [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) —— 跨游戏硬约定（含「开工前逐条核对」清单）<br>其中 **「交互与结算的统一规范」**（按钮文案/配色/位置、统计条顺序、结算层内容、二次确认、清记录）是 25 个游戏普查后的**唯一标准**，改交互前必须先看，别照抄隔壁游戏 |
| 了解某个游戏怎么玩 | `src/games/<id>/README.md` —— **面向玩家**的玩法简介（根 README 只留一句话 + 链接） |
| 改某个游戏 | 上表里那个游戏的**分册** `src/games/<id>/AGENTS.md` |
| 新增游戏 | [`docs/NEW-GAME.md`](docs/NEW-GAME.md) —— 分步清单 + 骨架；同时过一遍约定 |
| 改共享组件 / 路由 / 注册表 / 主题 | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| 验证改动 | [`docs/VERIFY.md`](docs/VERIFY.md) + `node scripts/smoke.mjs` |
| 遇到「看着像 bug」的怪现象 | [`docs/PITFALLS.md`](docs/PITFALLS.md) —— 按症状查原因与定位手段 |
| 想知道某游戏的存档 key / 有哪些开关 | [`docs/GAMES.md`](docs/GAMES.md)（**由 `scripts/check-conventions.mjs` 自动生成，别手改**） |
| 动彩蛋、或新增帮助条目 | [`docs/EASTER-EGGS.md`](docs/EASTER-EGGS.md) —— 哪些东西**不许写进帮助** |

开工前跑一次 `node scripts/check-conventions.mjs`：它会检查注册表 ↔ safelist ↔ README ↔ 分册 ↔ 存档 key
是否对得上（改动完成后**再跑一次**，仍要全绿）。

**改到按钮 / 统计条 / 结算层 / 二次确认 / 清记录**时，另外跑一次 `node scripts/check-ui.mjs`：
它按上面那份「交互与结算的统一规范」检查 25 个游戏（历史别名的 i18n key、`.game-icon` 空类、
按钮文案的 emoji 前缀、连点清记录是否真的接上并清扫了存档前缀），必须全绿。

## 项目概述

「游戏合集」(Games Hub) — 将 4 个独立小游戏（点击游戏、1A2B、德州扑克、数字迷宫）合并到一个 Vue 3 单页应用中，并新增了 2048、贪吃蛇、Emoji 对对碰、Emoji 连连看、Emoji 侦探、Emoji 猎手、Threes、Emoji 消消乐、数独 (Sudoku)、Emoji 大师 (Emoji Master)、Emoji 排序 (Emoji Sort)、Emoji 下坠 (Emoji Down)、Emoji 滑行 (Emoji Slide)、扑克炼金术 (Poker Alchemy) 、麻将英雄 (Mahjong Hero) 、雀圣 (Mahjong Master) 、麻将传奇 (Mahjong Legend) 、Emoji 镜像 (Emoji Mirror) 、24 点 (24 Game) 、单人麻将 (Solo Mahjong) 和赌神 (God of Gamblers)，现共 25 个游戏。首页以蜂窝网格展示各游戏图标与名称（一行最多 4 个，**4/3/4/3/4/3/4 共 25 格**，与游戏数一一对应；每行格数奇偶交替，蜂巢自然咬合、不需要半格错位），点击进入对应游戏；游戏内标题栏最左侧有 🏠 按钮返回主页。主题与语言全局共享，各游戏的 localStorage 记录相互独立（沿用原游戏的前缀）。

本目录是从同级的 `click-game/`、`guess-number/`、`poker/`、`puzzle-game/` 四个独立项目合并而来。**原目录保持只读，不要修改**；所有改动都在本目录进行。

## 全局设置（主题 / 语言 / 音乐 / 音效）

首页顶栏右上角的 ⚙️（`i-mdi-cogs`）打开 `shared/SettingsSheet.vue`：从点击处**圆形扩张**铺满全屏，
图标变成 ✕。四项设置都存在 `__games_hub__*`：

| 设置 | key | 取值 | 默认 |
| --- | --- | --- | --- |
| 主题 | `__games_hub__theme_mode` | `system` / `light` / `dark` | **system** |
| 语言 | `__games_hub__lang_mode` | `system` / `cn` / `en` | **system**（系统语言非中英文 → en） |
| 背景音乐 | `__games_hub__music` | `'1'` / `'0'` | 关 |
| 游戏音效 | `__games_hub__sfx` | `'1'` / `'0'` | 开 |

- 状态的**唯一真相**在 `shared/settings.js`；`theme.js` / `i18n.js` 只保留 `isDark` / `language` / `toggle`
  这些老接口做派生（别再往它们里面加状态）。旧 key `__games_hub__theme` / `__games_hub__language` 会自动迁移。
- **状态栏 / 标题栏颜色**（装成 PWA 后最明显）由 `shared/settings.js` 的 `syncThemeColor()` 统一负责：
  它读 `body` 计算后的背景色写进 `<meta name="theme-color">`，所以永远和 `--bg-color` 一致。
  ⚠️ **别在别处「记住旧值再恢复」** —— 那样在弹窗开着期间切主题，关闭时会把状态栏颜色回滚成旧主题
  （`HelpDialog` 踩过；它现在关闭时改成调用 `syncThemeColor()`）。
- 音频全部走 **Web Audio API**（`shared/audio.js`）：`AudioBufferSourceNode` + `GainNode`，
  **不用 `<audio>`、不注册 mediaSession** —— 这样不会夺取音频焦点、打断用户正在听的音乐。
  首次 `pointerdown`/`keydown` 里 `resume()` 解锁（iOS 硬性要求）；页面不可见时 `suspend()`、回来 resume。
- 12 首背景音乐在 `public/audio/music/`（**不进预缓存**，走 runtimeCaching 的 CacheFirst，一年有效期）；
  五个音效在 `public/audio/sfx/`（进预缓存，6~32KB）：`success.mp3`（5.07s）/ `lose.mp3`（4.08s）/
  `elimination.mp3`（0.76s）/ `fail.mp3`（1.02s）/ `firework-success.mp3`（1.67s）—— 时长各不相同，
  实测时可以直接靠 `AudioBuffer.duration` 分辨。
- **连击 / 多消的短促烟花**统一由 `shared/confetti.js` 的 `burstConfetti()` 发声（`playFirework()`）：
  这个函数就是「短促烟花」本身，7 个调用点（crush / match / link / slide / mahjong / alchemy / legend）都走它。
  `playElimination()` 里带一条**替换**规则 —— 同一瞬间刚放过烟花（240ms 内）就不再叠 elimination，
  所以「连击 = 烟花音」「单次消除 = elimination」两者不会同时响。
- 音效接入点（**语义**优先，不要只看游戏分类）：
  - **胜利**：`shared/confetti.js` 的 `celebrate()` 统一 `playWin()`（19 个有胜利烟花的游戏都走这里）；
  - **失败 / 放弃**：各游戏把 phase 置为 `OVER`/`LOSE`/`LOST` 处 `playLose()`（18 个游戏）；
    `playLose()` 也用于「查看答案」这种等于认输的操作 —— 赌神的 `finishRound()`、24 点的 `revealAnswer()`；
  - **消除一次**：消除类游戏的「消掉」落点 `playElimination()`（crush 的 `resolveCascades`、link / match / slide
    的 `registerClear()`、quesheng 的 `clearGroup()`、mahjong / alchemy 的 `score += gained`、
    legend 的 `clearedCount += groups.length`）；猎手 / 侦探「选对」时也算一次消除，同样播它；
  - **扣❤️**：猎手 / 侦探选错、数独填错、赌神点错或提交错 —— 一律 `playFail()`（`hearts` 减少的那一行）。

- **「重玩本关」是橙色描边按钮**（透明底 + `var(--god-bg)` 橙字 + 1px 橙边）：胜利/失败遮罩里那颗与
  「新游戏」二次确认弹窗里那颗同款；其余结算按钮仍是主色绿。全局规则在 `App.vue`，类名写两遍
  `.game-icon.replay-btn.replay-btn` 以压过各游戏 scoped 的 `.game-icon[data-v-x]`（同权重时 scoped 会赢）。

## 技术栈

- **框架**：Vue 3（Composition API + `<script setup>`）+ Vue Router（hash 模式，懒加载/静态导入各游戏路由）
- **构建**：Vite 5（`@` 别名指向 `src/`）
- **样式**：SCSS + UnoCSS（presetUno / presetAttributify / presetIcons，图标用 carbon 和 mdi 集合）
- **PWA**：vite-plugin-pwa（autoUpdate，dev 下也启用）。**`workbox.globPatterns` 必须显式带上图片类型**
  （现在是 `**/*.{js,css,html,webp,png,svg,ico,woff2,mp3}`，其中 `**/audio/music/**` 用 `globIgnores` 排除）——插件默认只预缓存 `js/css/html`，
  图片（麻将牌雪碧图、各图标）不进预缓存，离线时牌面就是空白（实测默认下预缓存只有 9 个文件、
  加上图片类型后 12 个；禁掉 HTTP 缓存 + 断网时 3 个用到雪碧图的游戏仍能画全牌面）
- **依赖管理**：yarn 1.22.22（package.json `packageManager` 已固定；全局 yarn 已升级至 1.22.22，可直接 `yarn <cmd>`）

## 常用命令

```bash
yarn install   # 安装依赖（项目 .yarnrc 已覆盖为 npm 官方源，勿用全局内网镜像配置）
yarn dev       # 启动开发服务器
yarn build     # 构建到 dist/
yarn preview   # 预览构建产物
```

没有测试和 lint 配置。验证改动时用 `yarn build` + headless Chrome 打开各路由（`/`、`/#/click`、`/#/guess`、`/#/poker`、`/#/puzzle`、`/#/2048`、`/#/snake`、`/#/match`、`/#/link`、`/#/detective`、`/#/hunter`、`/#/three`、`/#/crush`、`/#/sudoku`、`/#/master`、`/#/sort`、`/#/down`、`/#/slide`、`/#/alchemy`、`/#/mahjong`、`/#/quesheng`、`/#/legend`、`/#/mirror`、`/#/point24`、`/#/solo`、`/#/gambler`）做冒烟检查。**冒烟至少跑 375×667（最低支持尺寸）与 390×844 两档**。

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
| 麻将传奇 | `src/games/legend/` | [`AGENTS.md`](src/games/legend/AGENTS.md) | `/#/legend` |
| Emoji 镜像 | `src/games/mirror/` | [`AGENTS.md`](src/games/mirror/AGENTS.md) | `/#/mirror` |
| 24 点 | `src/games/point24/` | [`AGENTS.md`](src/games/point24/AGENTS.md) | `/#/point24` |
| 单人麻将 | `src/games/solo/` | [`AGENTS.md`](src/games/solo/AGENTS.md) | `/#/solo` |
| 赌神 | `src/games/gambler/` | [`AGENTS.md`](src/games/gambler/AGENTS.md) | `/#/gambler` |

读法：要看 / 改某个游戏，先打开上表里对应的分册；只改共享组件或全局约定时看本文件。
每个游戏目录下有两份文档，**分工不要混**：`README.md` 讲**怎么玩**（面向玩家，规则、操作、胜负条件），
`AGENTS.md` 讲**怎么改**（实现、存档 key、踩过的坑）。**玩法文案只写在 `src/games/<id>/README.md`**，
根 `README.md` 只保留「游戏名 + 一句话 + 链接」。
新增游戏时，除了在 `src/games/<id>/` 放组件与 `i18n.js`，也要按上面的格式补一份 `<id>/AGENTS.md`，
并在上表里加一行。

**新增游戏时**：`src/games/<id>/` 下要同时有 `README.md`（玩法）与 `AGENTS.md`（实现），
自检脚本会检查这两份都在、且根 README 的那一行链到了 `README.md`。

改完必须同步的还有：本文件（如果约定变了）、游戏自己的分册、`README.md`（用户可见的行为变了）、
以及 `docs/GAMES.md`（它是生成的，跑一次自检脚本即可）。
