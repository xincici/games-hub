# 数字迷宫（`src/games/puzzle/`）

> 这是根目录 [`AGENTS.md`](../../../AGENTS.md) 的**游戏分册**：只讲这个游戏自己的实现、
> 存档 key 和踩过的坑。**改这个游戏前先读这里**；跨游戏共用的约定（视觉语言、共享组件、
> 闯关游戏统一约定、新增游戏流程）看根目录。
>
> - 路由：`/#/puzzle`
> - i18n key 前缀：`__number_puzzle__`
> - 共享组件：`src/shared/`（`i18n.js` / `theme.js` / `confetti.js` / `CountTimer.vue` / `ConfirmDialog.vue` / `Hearts.vue` / `ParticleBackground.vue` 等）

## 实现

MainGame.vue + difficulty/rocker/i18n.js

## 存档（localStorage）

  - 数字迷宫：`__number_puzzle__*`

## 界面约定

- 顶栏「游戏特色按钮」：摇杆（`TopHeader` 默认插槽）
