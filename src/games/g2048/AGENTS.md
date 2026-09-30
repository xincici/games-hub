# 2048（`src/games/g2048/`）

> 这是根目录 [`AGENTS.md`](../../../AGENTS.md) 的**游戏分册**：只讲这个游戏自己的实现、
> 存档 key 和踩过的坑。**改这个游戏前先读这里**；跨游戏共用的约定（视觉语言、共享组件、
> 闯关游戏统一约定、新增游戏流程）看根目录。
>
> - 路由：`/#/2048`
> - i18n key 前缀：`__game_2048__`
> - 共享组件：`src/shared/`（`i18n.js` / `theme.js` / `confetti.js` / `CountTimer.vue` / `ConfirmDialog.vue` / `Hearts.vue` / `ParticleBackground.vue` 等）

## 实现

Game2048.vue + i18n.js（route /2048，key 前缀 __game_2048__；新开局与恢复存档都按行列顺序逐张入场）

## 存档（localStorage）

  - 2048：`__game_2048__*`
