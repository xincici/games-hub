# 游戏合集 · 微信小程序版

> **独立工程**：不参与 `games/`（web 版）的构建，web 仓库里它被 `.gitignore` 排除。
> 目标是把 25 个游戏逐个迁到微信小程序，**现有 web 一行不改**。

## 目录

```
mp/
├── package.json          uni-app(Vue3) + mp-weixin + h5 依赖（版本锁定同一 tag）
├── vite.config.js        @dcloudio/vite-plugin-uni
├── index.html            H5 入口（方便在浏览器里先验一遍）
└── src/
    ├── main.js           createSSRApp 入口
    ├── App.vue           全局样式 / onLaunch
    ├── pages.json        路由（index 首页 / g2048）
    ├── manifest.json     小程序 appid（现在是 wx44d366fc7dc1dec1）
    ├── core/             跨游戏适配层（小程序侧）
    │   ├── storage.js      uni.*StorageSync  ↔  web 的 localStorage（**key 完全相同**）
    │   ├── i18n.js         极简中英文，跟随系统语言
    │   └── sfx.js          uni.createInnerAudioContext（web 是 Web Audio，音量/淡入淡出能力弱）
    ├── static/audio/      音效（从 web 的 public/audio/sfx 复制）
    └── pages/
        ├── index/         首页（目前只有 2048 一张卡）
        └── g2048/         已迁移：2048
```

## 命令

```bash
# 依赖（本机 ~/.npm 缓存有 root 文件权限问题，用临时缓存目录）
npm_config_cache=/tmp/npm-cache npm install

# 小程序：产物在 dist/dev/mp-weixin、dist/build/mp-weixin，
# 用微信开发者工具「导入项目」指向该目录即可
npm run dev:mp
npm run build:mp

# 先在浏览器验证（uni-app 的 H5 目标）
npm run dev:h5
```

## 迁移约定（每个游戏都照这套）

1. **逻辑优先复用**：web 的 `src/games/<id>/board.js`（纯逻辑）直接拷到 `src/pages/<id>/`，
   判胜/计分/难度曲线**不重写**；
2. **视图重写**：`<div>/<span>` → `<view>/<text>`，`@pointerdown` → `@touchstart`，
   `class` 保持，SCSS **可以照用**（含嵌套，uni-app 会编译）；
3. **尺寸用 rpx**：`750rpx = 屏幕宽`，不要用 `vw` / DOM 测量（`getBoundingClientRect` 在小程序里要异步查）；
4. **存档 key 与 web 一致**（`__game_2048__state` 等），读写走 `core/storage.js`；
5. **不要**引入 `vue-router` / `localStorage` / `window` / `document` / UnoCSS 图标类。

## 2048 的已知差异（v1）

- 合并时**没有** web 版「被吃掉的两张牌滑到目标格」的幽灵动画，合并牌直接在目标格弹出；
- 没有 confetti 彩带（胜利只播 success 音效 + 浮层）；
- 计时器用 `setInterval`，后台切走不会暂停（web 版用 CountTimer 有可见性处理）。

## 小程序上线前要做的

- `manifest.json` 的 `mp-weixin.appid` 已配好真实 appid（`wx44d366fc7dc1dec1`），重新 build 会写进产物；
- 微信开发者工具 → 详情 → 本地设置：勾选「不校验合法域名」（本地无后端时）；
- 新游戏加进 `src/pages.json` 的 `pages` 和首页的 `games` 数组。
