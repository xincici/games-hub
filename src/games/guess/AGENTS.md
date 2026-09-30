# 1A2B（原猜数字）（`src/games/guess/`）

> 这是根目录 [`AGENTS.md`](../../../AGENTS.md) 的**游戏分册**：只讲这个游戏自己的实现、
> 存档 key 和踩过的坑。**改这个游戏前先读这里**；跨游戏共用的约定（视觉语言、共享组件、
> 闯关游戏统一约定、新增游戏流程）看根目录。
>
> - 路由：`/#/guess`
> - i18n key 前缀：`__guess_number__`
> - 共享组件：`src/shared/`（`i18n.js` / `theme.js` / `confetti.js` / `CountTimer.vue` / `ConfirmDialog.vue` / `Hearts.vue` / `ParticleBackground.vue` 等）

## 实现

GuessNumber.vue + robot/i18n.js

## 存档（localStorage）

  - 1A2B（原猜数字）：`__guess_number__*`

## 界面约定

- 顶栏「游戏特色按钮」：机器人（`TopHeader` 默认插槽）
