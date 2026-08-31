# Games Hub · 游戏合集

四个休闲小游戏的合集单页应用：首页选择游戏，游戏内点 🏠 随时返回。

| 游戏 | 玩法简介 |
| --- | --- |
| 👆 点击游戏 | 点击方块使自身与上下左右数字 +1（逢 3 归 0），在限定步数内把全部数字归零 |
| 🔢 猜数字 | 8 次机会猜一个不重复数字的 4 位数，根据 xAxB 提示逼近答案 |
| 🃏 德州扑克 | 单人视频扑克：下注 → 发牌 → 选牌保留 → 换牌，中牌型可继续猜大小翻倍 |
| 🧩 数字迷宫 | 经典数字华容道：点击或摇杆/方向键滑动，把数字按顺序排列 |

## 功能特性

- 🎨 深 / 浅色主题切换，全站共享
- 🌐 中 / 英双语切换，全站共享（帮助弹窗、界面文案全覆盖）
- 🏠 游戏标题栏一键返回主页
- 📱 移动端优先布局 + PWA，可安装到桌面 / 主屏幕，离线可玩
- 💾 各游戏的进度、最佳成绩、偏好设置独立存储，互不干扰
- 🥚 彩蛋：在点击游戏 / 数字迷宫中连点标题 5 次清除历史记录

## 技术栈

- Vue 3（Composition API + `<script setup>`）+ Vue Router
- Vite 5
- UnoCSS（attributify + icons：carbon / mdi）
- SCSS
- vite-plugin-pwa
- canvas-confetti

## 快速开始

```bash
yarn install   # 或 corepack yarn install
yarn dev       # 启动开发服务器
yarn build     # 构建到 dist/
yarn preview   # 本地预览构建产物
```

> 本目录的 `.yarnrc` 已将 registry 覆盖为 npm 官方源；若你的全局 yarn 指向内网镜像，无需修改即可正常安装。

## 目录结构

```
src/
├── App.vue          # 根组件 + 全局主题 CSS 变量（浅/深两套）
├── router.js        # hash 路由：/ /click /guess /poker /puzzle
├── shared/          # 共享模块：i18n（多语言）、theme（主题）、games（游戏注册表）
├── components/      # HomePage（首页）、TopHeader（标题栏）、HelpDialog（帮助弹窗）
└── games/           # 四个游戏源码，每游戏一个目录
    ├── click/  guess/  poker/  puzzle/
scripts/             # 图标源文件（SVG + 512px PNG）
public/              # favicon 与 PWA 图标
```

各游戏的完整说明与实现细节见 [AGENTS.md](./AGENTS.md)；本合集由同级的四个独立游戏项目（`click-game/`、`guess-number/`、`poker/`、`puzzle-game/`）合并而来。

## 浏览器支持

现代常青浏览器（Chrome / Edge / Safari / Firefox）及移动端浏览器。

## License

MIT
