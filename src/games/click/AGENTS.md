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

## 上帝模式（可暂停，暂停即交还操作权）

按钮在难度条右边（`.opt-item` 里的第二个 `.game-icon`），文案走 i18n 的 `godMode`。

- **可用的条件**：`!autoplaying && undoIndex !== -1` —— 也就是**玩家的操作全部撤销回初始局**
  才可用（初始的随机盘面是 `randomSomeOperations()` 用 `onCellClick(..., isRandom = true)` 做的，
  **不进撤销栈**；而上帝模式自己点的是普通点击、**会进栈**，所以暂停后能一路撤销回去再重跑）。
  这和雀圣的判据（`history.length === 0`）是一套思路。
- **播放期间挡输入**：`.game-area` 里盖一层透明 `.automask`（`autoplaying` 为真时渲染），
  撤销 / 重做按钮也一并禁用。
- **暂停 = 把操作权交回玩家**（用户要求，参考雀圣的做法）：播放中再点按钮调 `stopAutoplay()`，
  直接退出循环并清掉「正在点这一格」的高亮 —— **不是**原地冻住：
  遮罩撤掉、撤销 / 重做恢复可用，玩家可以接着手动点、也可以一路撤销回初始局。
  所以按钮文案只有两种：`godMode`（⚡ 上帝模式）与播放中的 `godPause`（⏸ 暂停），
  **没有「继续」**（想重跑就撤销回初始局）——`godResume` 这个 key 已经删掉。
- 循环里还判了 `gameResult.value !== GAMING` —— 中途赢了就立刻收工，不会把剩下的步骤空点完。
- 节奏常量：`VIRTUAL_CLICK_EFFECT_DURATION = 220ms`（「正在点这一格」的高亮）、
  `VIRTUAL_CLICK_WAIT_DURATION = 300ms`（两步之间）。`stopAutoplay()` 也由 `initGame()`
  与 `onUnmounted` 调用（离开页面时别让循环继续跑）。

实测（390 宽，默认难度）：初始可用 → 点开始变「⏸ 暂停」且遮罩在、撤销禁用 → 再点即暂停：
文案回到「⚡ 上帝模式」、按钮**禁用**、遮罩消失、撤销可用 → 手动点一格棋盘确实变了、
停手后不再自动推进 → 连点 4 次撤销回到初始局（撤销变灰、重做可用）→ 上帝模式**恢复可用** →
再点一次一路跑到 `win`。

