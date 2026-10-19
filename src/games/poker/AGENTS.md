# 德州扑克（`src/games/poker/`）

> 这是根目录 [`AGENTS.md`](../../../AGENTS.md) 的**游戏分册**：只讲这个游戏自己的实现、
> 存档 key 和踩过的坑。**改这个游戏前先读这里**；跨游戏共用的约定（视觉语言、共享组件、
> 闯关游戏统一约定、新增游戏流程）看根目录。
>
> - 路由：`/#/poker`
> - i18n key 前缀：`__poker_game_`
> - 共享组件：`src/shared/`（`i18n.js` / `theme.js` / `confetti.js` / `CountTimer.vue` / `ConfirmDialog.vue` / `Hearts.vue` / `ParticleBackground.vue` 等）

> 玩法简介（面向玩家）见同目录的 [`README.md`](README.md)；本文档只讲实现、存档与踩过的坑。

## 实现

MainGame.vue + CardItem/RuleArea + bet/constants/dice/rules/i18n.js

## 存档（localStorage）

  - 德州扑克：`__poker_game_*`（constants.js）
    - `__poker_game_total` 资产、`__poker_game_bet` 下注额、`__poker_game_dice` 猜大小开关
    - **猜大小默认开启**（用户要求）：`dice.js` 里 `localStorage.getItem(DICE_KEY)` 为 `null`（从没动过）时按开，
      显式存 `'1'` 开 / `'0'` 关。⚠️ 原来关掉是 `removeItem` —— 「从没动过」和「主动关掉」就分不出来，
      那样把默认改成开会把主动关掉的玩家又打开。实测：无 key → 开（图标 `i-mdi-dice-5`）→ 点一下存 `'0'`（图标
      `i-mdi-dice-5-outline`）→ 刷新仍是关 → 再点开存 `'1'` → 刷新仍是开 → 删 key 后回到开。
    - `dice` 与 `bet` 都是「偏好」，已加进 `src/shared/storage.js` 的 `KEEP_SUFFIXES`，连点标题清记录时不会被清掉

## 界面约定

- 顶栏「游戏特色按钮」：骰子/猜大小（`TopHeader` 默认插槽）
- **三颗操作按钮各一种颜色**（用户指定，`.btn` 上的修饰类）：猜大 `.btn-big` → `--poker-big-bg` `#2c6aad`（蓝）、
  猜小 `.btn-small` → `--poker-small-bg` `#7550ad`（紫）、结算/重来 `.btn-settle` → `--poker-settle-bg` `#b45309`（琥珀）。
  三个变量在 `App.vue` 的 `body{}` 与 `body.dark{}` 里**同值**（和 `--god-bg` / `--pause-bg` 一样：它们压在自己
  的底色上，与页面主题无关），白字对比度分别 5.51 / 6.06 / 7.08:1。三条规则都写成 `:not(:disabled)`，
  禁用时仍走 `.btn:disabled` 的灰。发牌/换牌保持主色绿。
- **赌注区 ± 支持长按连加连减**：按下先走一步 → 停 0.32s（防手抖连跳）→ 之后每 60ms 一步（约 16 步/秒），
  到 `MIN_BET` / `MAX_BET`、阶段离开 `WAIT` 或松手即停；`onUnmounted` 里也会清掉定时器。
  实现走 Pointer Events（`pointerdown` / `pointerup` / `pointercancel` / `pointerleave` / `lostpointercapture`
  + `setPointerCapture`），**这两个按钮不能再挂 `@click`** —— 长按松手时浏览器还会补一次 click，
  会凭空多走一步。实测：按住 + 师 1 秒赌注 10 → 23、松手停在 23；短按一次恰好 +1；按住 − 会停在 1 不会变负。
