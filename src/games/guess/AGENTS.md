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

## 猜测记录区：动态 max-height + 只在本地滚动

**原来**：`.game-area` 写死 `margin-bottom: 185px` 给底部固定键盘让位，记录一多就**整页滚动**（用户要求改成「记录区内部滚动」）。

**现在（web）**

- `.game-area` 去掉 `margin-bottom`，改成 `overflow-y: auto` + `overscroll-behavior: contain` + `-webkit-overflow-scrolling: touch`，
  并显式画一条细滚动条（`scrollbar-width: thin` + `::-webkit-scrollbar 6px`，否则 macOS 的 overlay 滚动条平时看不见）。
- `max-height` 由 `measureGameArea()` 算：`innerHeight − el.getBoundingClientRect().top − 输入区高度 − 16`（下限 96）。
  - 输入区是 `position: fixed`，隐藏（`.hide`，`bottom: -100%`）时用 `.input-area:not(.hide)` 取不到 → 高度按 0 算，记录区自然铺到底。
  - `ResizeObserver` 观察输入区 + `window.resize` + 进页面后 60/200/480ms 补量（键盘有 0.5s 滑入过渡，一次量不准）。
  - **改高度前先记 `wasAtBottom`**：容器变矮时 `scrollTop` 不会自己跟着变，改完再判断会误判成「玩家往上翻了」。
- 每添一行记录 / 结算层出现都 `nextTick` 里贴底（`scrollTop = scrollHeight`），玩家正在往上翻时不打扰。

**实测（web，H5）**

| 视口 | 记录区 | 输入区 | 间隙 | 可滚 | 滚动量 | 整页可滚 |
| --- | --- | --- | --- | --- | --- | --- |
| 390×844，9 行 | 240..626（386） | 642 起（高 202） | **16px** | 是 | 66 | **0** |
| 375×667，9 行 | 240..449（209） | 465 起（高 202） | **16px** | 是 | 243 | **0** |
| 390×844，3 行 | 240..416（176） | 642 起 | 226 | 否 | 0 | **0** |

> 坑：`maxHeight` 用了「卡片 top」算 → 记录的底部会跟输入区差 18px（键盘高度在首帧还没量全）；
> 一定要用 `ResizeObserver` + 补量，别只量一次。

## 胜利层：加「下一局」才能连胜

用户：「1A2B 胜利遮罩上应该出现下一局的按钮，这样才能连胜」。

**原来**胜利层只有一行 `🎉🎉 你赢了`，没有任何按钮 —— 想继续只能点操作区的「新游戏」，
而那个动作会**清零当前连胜**，所以连胜永远停在 1。

**现在**

- `.win` 里三行（约定第 5 节）：标题 → `🔥 当前连胜 N`（`.win-note`，14px / 0.85 透明度）→ `➡️ 下一局` 按钮（`.game-icon`）。
- `nextRound()` = **只调 `initGame()`**（换答案、清历史、重置计时），**连胜不清**；
  清连胜只在 `startNewGame()`（「新游戏」二次确认后）和输一局时发生。
- i18n 新增 `nextRound`（`➡️ 下一局` / `➡️ Next Round`，与单人麻将同名 key 一致）。
- `.win, .lose` 加了 `gap: 12px`（约定第 5 节的结算层间距）。
- 注意：`curStreak` 字典里的文案**自带 🔥**，模板里不要再写一个（第一版写成 `🔥 {{ i18n('curStreak') }}`，
  渲染成「🔥 🔥 当前连胜 3」）。

**实测（web，390×844）**
- 用「答案 1234 + 1 条历史 + streak 2 / best 4」的存档 → 输入 1234 提交：胜利层出现、
  文案 `🔥 当前连胜 3`、按钮 `["➡️ 下一局"]` ✓，`streak: 3 / best: 4` ✓，键盘隐藏 ✓
- 点「下一局」：胜利层消失、换新答案（存档 `answer: 3475`）、历史清空、`streak` 仍 **3**、统计 `["4","3"]`、键盘回来 ✓
