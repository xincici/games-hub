# Games Hub · 游戏合集

十四个休闲小游戏的合集单页应用：首页选择游戏，游戏内点 🏠 随时返回。

| 游戏 | 玩法简介 |
| --- | --- |
| 👆 点击游戏 | 点击方块使自身与上下左右数字 +1（逢 3 归 0），在限定步数内把全部数字归零 |
| 🧩 数字迷宫 | 经典数字华容道：点击或摇杆/方向键滑动，把数字按顺序排列 |
| 🔢 1A2B | 8 次机会猜一个不重复数字的 4 位数，根据 xAxB 提示逼近答案 |
| 🃏 德州扑克 | 单人视频扑克：下注 → 发牌 → 选牌保留 → 换牌，中牌型可继续猜大小翻倍 |
| 3️⃣ Threes | 1 + 2 = 3 的经典合成：滑动合并相同数字，牌堆预告下一张牌 |
| 🔢 2048 | 经典 2048：滑动合并相同数字，凑出 2048 获胜，之后可继续冲击高分 |
| 🐍 贪吃蛇 | 方向键 / 滑屏控制蛇吃食物，1-5 级难度，难度越高速度越快、单食物得分越高 |
| 😊 Emoji 对对碰 | 记忆翻牌配对：预览后翻面，翻开两张相同的 emoji 即消除，清空棋盘获胜 |
| 🔗 Emoji 连连看 | 经典连连看：连接两张相同 emoji（路径不超过 2 个转弯）即可消除 |
| 🕵️ Emoji 侦探 | 找茬记忆挑战：记住一组 emoji，翻面后找出被偷换的那一个，关卡逐步加难 |
| 🎯 Emoji 猎手 | 记忆收集挑战：记住目标 emoji，翻面后从候选区把它们全部找回 |
| ⭐ Emoji 消消乐 | 交换相邻 emoji 三消：连锁消除计分，支持局面存档与续玩 |
| 🗾 数独 | 唯一解挖洞生成，填错即标红并扣 ❤️ 生命，支持笔记候选，记录各难度最佳用时 |
| 🧱 Emoji 大师 | 羊了个羊闯关玩法：点击未被遮挡的顶层卡片落入 7 格收集槽，凑齐 3 张相同 emoji 自动消除；关卡越高 emoji 种类与层数越多，洗牌每关限一次，失败可重玩本关 |

## 功能特性

- 🎨 深 / 浅色主题切换，全站共享
- 🌐 中 / 英双语切换，全站共享（帮助弹窗、界面文案全覆盖）
- 🏠 游戏标题栏一键返回主页
- 🎮 首页标题栏居中显示游戏图标（favicon 同款图案的矢量源文件），不再显示「游戏合集」文案；游戏内标题栏照旧显示各游戏名称
- 📱 移动端优先布局 + PWA，可安装到桌面 / 主屏幕，离线可玩
- 💾 各游戏的进度、局面存档、最佳成绩、偏好设置独立存储，互不干扰
- 🎇 全站粒子连线动态背景：固定置底、跟随鼠标 / 触摸（粒子轻微被排斥），按浅 / 深主题自动换色
- ✨ 开局与恢复存档时棋盘逐张入场：2048 / Threes / 消消乐逐张弹出、数独逐格浮现、Emoji 大师自下层向上堆叠
- 🖐️ 首页卡片支持拖动排序，顺序记在本地；「建设中...」占位卡片固定排在最后且不可拖动，新增游戏自动接在已排序结果之后
- 🏗️ 首页末尾有一张「建设中...」占位卡片，点击不跳转，留给后续新增的游戏
- 🥚 彩蛋：在有成绩记录的游戏（点击 / 迷宫 / 对对碰 / 连连看 / 侦探 / 猎手 / 消消乐 / 数独）中连点标题 5 次清除历史记录

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
├── router.js        # hash 路由：/ /click /puzzle /guess /poker /three /2048 /snake /match /link /detective /hunter /crush /sudoku /master
├── shared/          # 共享模块：i18n（多语言）、theme（主题）、games（游戏注册表）、emojis（emoji 池）
├── components/      # HomePage（首页）、TopHeader（标题栏）、HelpDialog（帮助弹窗）
└── games/           # 十四个游戏源码，每游戏一个目录
    ├── click/  puzzle/  guess/  poker/  three/  g2048/  snake/
    └── match/  link/  detective/  hunter/  crush/  sudoku/  master/
scripts/             # 图标源文件（SVG + 512px PNG）
public/              # favicon 与 PWA 图标
```

各游戏的完整说明与实现细节见 [AGENTS.md](./AGENTS.md)；本合集由同级的四个独立游戏项目（`click-game/`、`guess-number/`、`poker/`、`puzzle-game/`）合并而来。

## 浏览器支持

现代常青浏览器（Chrome / Edge / Safari / Firefox）及移动端浏览器。

## License

MIT
