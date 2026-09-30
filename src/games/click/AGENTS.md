# 点击游戏（`src/games/click/`）

> 这是根目录 [`AGENTS.md`](../../../AGENTS.md) 的**游戏分册**：只讲这个游戏自己的实现、
> 存档 key 和踩过的坑。**改这个游戏前先读这里**；跨游戏共用的约定（视觉语言、共享组件、
> 闯关游戏统一约定、新增游戏流程）看根目录。
>
> - 路由：`/#/click`
> - i18n key 前缀：`__easy_click_game__`
> - 共享组件：`src/shared/`（`i18n.js` / `theme.js` / `confetti.js` / `CountTimer.vue` / `ConfirmDialog.vue` / `Hearts.vue` / `ParticleBackground.vue` 等）

## 实现

ClickGame.vue + difficulty/i18n.js + assets/yzcw.mp3

## 存档（localStorage）

  - 点击游戏：`__easy_click_game__*`（难度记录为前缀+难度数字，帮助为 `__easy_click_game__help_showed`）

## 界面约定

- 顶栏「游戏特色按钮」：背景音乐（`TopHeader` 默认插槽）
