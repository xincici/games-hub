# 贪吃蛇（`src/games/snake/`）

> 这是根目录 [`AGENTS.md`](../../../AGENTS.md) 的**游戏分册**：只讲这个游戏自己的实现、
> 存档 key 和踩过的坑。**改这个游戏前先读这里**；跨游戏共用的约定（视觉语言、共享组件、
> 闯关游戏统一约定、新增游戏流程）看根目录。
>
> - 路由：`/#/snake`
> - i18n key 前缀：`__snake_game__`
> - 共享组件：`src/shared/`（`i18n.js` / `theme.js` / `confetti.js` / `CountTimer.vue` / `ConfirmDialog.vue` / `Hearts.vue` / `ParticleBackground.vue` 等）

## 实现

SnakeGame.vue（canvas 渲染；**暂停**：操作区「难度 | 新游戏 | 暂停」三格的暂停按钮、或 `visibilitychange` 变隐藏时自动暂停 —— 暂停即 `stopTimer()` 并 `saveState()` 落档，`restore()` 还原后停在暂停态等玩家点「继续」；**继续前先数 3 2 1**（共用 `shared/resumeCountdown.js`，倒数期间 `paused` 仍为 true、`tick()` 直接返回，数完才重启定时器）+ wall.js（穿墙开关：**默认开启**，只有显式存过 `'0'` 才算关；两种状态都显式落档，否则「关掉」会变成删 key、下次进来又落回默认的开）+ i18n.js（route /snake，key 前缀 __snake_game__）

## 存档（localStorage）

  - 贪吃蛇：`__snake_game__*`（难度 `__snake_game__difficulty`，跨难度共享最佳分 `__snake_game__best`，穿墙开关 `__snake_game__through_wall`（`'1'` / `'0'`，**没有这个 key 时按「开」处理**））
  - **进行中与「已失败」两种局面都落档**：`state` 里多存一个 `result`（`gaming` / `lose`，旧存档没有就按进行中）。撞墙/撞身体判负时**不再删存档**而是 `saveState()`，重进时 `restore()` 直接把局面还原成「已结束」的静止画面（不进暂停态、不起倒数、表不跑），由玩家自己点「新游戏」重开 —— 不会一进来就自动重开。暂停按钮本来就有 `:disabled="gameResult === LOSE || !started"`，配合 `.game-icon:disabled` 的灰底 + `not-allowed`。

## 界面约定

- 转向手势走 **Pointer Events**（`pointerdown` / `pointerup` / `pointercancel`，阈值 20px，方向取 |dx| / |dy| 较大者），`.wrapper` 上加 `touch-action: none`（此页纵向不溢出，整页加安全）。原来只监听 touch 事件，PC 上鼠标拖动不转向。
- 方向键同样可用；暂停时 `saveState()` 会把 `dir` / `nextDir` 一起落档（所以验证转向时可以先滑一下再暂停，读 `__snake_game__state` 里的 `nextDir`）。
