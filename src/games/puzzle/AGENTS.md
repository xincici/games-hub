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
- 空白格跟手的滑动走 **Pointer Events**（阈值 10px，小于阈值视为点击忽略），`touch-action: none` 加在 **`.game-area`** 上而**不是整页**：最高难度 6 × 320×568 时本页会溢出（实测 scrollH 590 > innerH 568），整页 none 会把「滚下去看棋盘」一起吃掉。原来只监听 touch 事件，PC 上鼠标拖动不动格子；摇杆按钮与方向键照旧可用。
- 统计条第二格是**点击次数**（`clickCount` 从 0 往上加，不是「剩余可用」），它同时就是存进 `__number_puzzle__<难度>` 的分数（越少越好）。
