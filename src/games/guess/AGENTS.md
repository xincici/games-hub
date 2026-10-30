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

| key | 内容 | 说明 |
| --- | --- | --- |
| `__guess_number__robot` | `'1'` / 空 | 是否与机器人对战（开局自动填 1234） |
| `__guess_number__state` | JSON `{ answer, history, result, time, streak }` | **整局局面**：答案、已猜历史（含 xAxB）、结果（0 进行 / 1 输 / 2 赢）、用时、当时的当前连胜 |
| `__guess_number__streak` | 数字 | 当前连胜 |
| `__guess_number__best` | 数字 | **最长连胜**（只增不减） |

- 写入时机：开局、每次提交、赢/输、清记录、**每秒计时回调**（用时刷新后接着走）。
- 恢复时机：`onMounted` 先 `loadRecords()` 再 `restoreState()`；**恢复成功就不开新局、也不帮玩家落子**
  （`robot` 只对「新一局」生效，不然重进会突然冒出一注 1234）。
- 恢复的判定：`answer` 必须匹配 `^[1-8]{4}$` 且 `history` 非空；否则当作坏存档、直接开新局。
- 恢复后**不播任何动画**（彩带只在真正赢下那一瞬间放，`watch(gameResult)` 里 `confetti()`）。

### 连胜规则（与其它有连胜的游戏一致）

- 赢一局：`streak += 1`，`bestStreak = max(bestStreak, streak)`，两个都落档。
- 输一局（猜满 8 次）：`streak = 0`（**最长连胜保留**）。
- 「新游戏」：`streak = 0`（最长连胜保留）。
- 连点标题 5 次清记录：`clearGameStorage('__guess_number__')` 之后连胜 / 最长连胜 / 局面全清（机器人偏好也一起清）。

## 界面约定

- 顶栏「游戏特色按钮」：机器人（`TopHeader` 默认插槽）；`<TopHeader @onScoreReset="onScoreReset">` 接清记录。
- **统计条**（`.card.score-area`）：`🏆 最长连胜` → `🔥 当前连胜`（记录在前、当前在后，约定第 4 节；空值占位 `--`）。
- **新游戏按钮**：非失败态 → `ConfirmDialog`（`:show-replay="false"`，只有「取消 / 确定重来」，文案自带
  「会清空当前连胜（🔥 {n}）；最长连胜记录会保留」）；**失败态直接重开、不弹窗**（与赌神失败遮罩同一例外）。
- 清记录后统计条回到 `--` / `0`。

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
