# 1A2B（原猜数字）（`src/games/guess/`）

> 这是根目录 [`AGENTS.md`](../../../AGENTS.md) 的**游戏分册**：只讲这个游戏自己的实现、
> 存档 key 和踩过的坑。**改这个游戏前先读这里**；跨游戏共用的约定（视觉语言、共享组件、
> 闯关游戏统一约定、新增游戏流程）看根目录。
>
> - 路由：`/#/guess`
> - i18n key 前缀：`__guess_number__`
> - 共享组件：`src/shared/`（`i18n.js` / `theme.js` / `confetti.js` / `CountTimer.vue` / `ConfirmDialog.vue` / `Hearts.vue` / `ParticleBackground.vue` 等）

> 玩法简介（面向玩家）见同目录的 [`README.md`](README.md)；本文档只讲实现、存档与踩过的坑。

## 实现

GuessNumber.vue + robot/i18n.js

## 存档（localStorage）

  - 1A2B（原猜数字）：`__guess_number__*`

## 界面约定

- 顶栏「游戏特色按钮」：机器人（`TopHeader` 默认插槽）
- 存档 key：`__guess_number__robot`（是否与机器人对战）、`__guess_number__state`（局面存档）、`__guess_number__best`（最佳成绩）

## 布局（底部数字输入区）

- `.input-area` 是 `position: fixed` 的底部数字键盘，宽度必须和顶部 `TopHeader` 用同一口径：
  `width: 100%; max-width: var(--max-width)` + `left: 50%; transform: translateX(-50%)`。
  原来宽屏写死 `width: 600px`，比标题栏（480）和上面的卡片（440）都宽出一截（用户报过
  「宽屏上输入区比其他的宽」）。
- **不要再用**原来的 `@media (max-width: 720px) { .input-area { max-width: inherit } }`：
  那会在 480~720 宽的屏上把 max-width 清掉、又拉回整屏宽；现在基础规则在手机上本来就是整屏宽，
  只有超过 480 才封顶，和标题栏逐档一致。
- 实测（2026-10-17）：1280 / 800 / 600 宽下标题栏与输入区都是 **480**；390 / 375 下都是整屏宽。
  键盘仍是 3 行（8 个数字两行 + 退格/提交一行）、最右按钮不超出输入区、横向/纵向滚动都是 0。
