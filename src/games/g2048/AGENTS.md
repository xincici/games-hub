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

## 界面约定

- 滑动走 **Pointer Events** + `.wrapper { touch-action: none }`：原来只监听 `touchstart/touchend`，PC 上鼠标拖动完全不触发（装成桌面应用后更明显）。阈值 20px，方向取 |dx| / |dy| 较大者；方向键照旧。

## 动效（滑动 / 合并 / 新牌）

三段动画都是 CSS 过渡 + 动画，JS 只负责摆状态与计时（`MOVE_MS = 130` 必须与 `.tile` 的 `transition` 时长一致，`POP_MS = 190`）：

- **移动**：瓷砖有稳定 `id`（`:key`），`left`/`top` 由 `tileStyle` 按 `row`/`col` 算，靠 `transition: left/top 0.13s` 滑过去 —— 存活牌本来就会滑，这部分不用管。
- **合并**：合并牌是**新牌**（新 id，带 `merging: true` → 滑行期间 `opacity: 0`），被吃掉的两张各留一个**幽灵**（`ghosts` 数组）滑到目标格；`MOVE_MS` 后撤掉幽灵、摘掉 `merging`、给合并牌加 `popping`（`merge-pop`：0.5 → 1.16 → 1 且淡入）。**幽灵不能塞进 `tiles`** —— 那是局面状态，会被存档 watch 与 `emptyCells`/`checkLose` 读到，多出来的牌会让局面错乱。**幽灵必须走 FLIP 两步定位**：先按「自己原来在哪」渲染，`nextTick` + 强制重排之后再改到目标格；直接渲染在目标格的话，这一步 Vue 一旦重建节点就完全没有过渡起点，等于瞬移（实测过：第二张源牌会当场闪到目标格）。**`merging` 必须在弹出开始时摘掉**：它只是滑行期间的隐身标记，留着的话弹出动画一结束就回落到 `opacity: 0`，合并牌当场消失。
- **新牌**：`spawnTile(true)` 打 `isNew` → `.tile.is-new { animation: 0.18s ease-out 0.13s backwards deal-in }`，靠 `animation-delay` 等滑行结束再缩放淡入。开局那两张走 `playDeal()` 的逐张入场，不传 `fresh`，否则两个 `animation` 会互相顶掉。
- 动画中途再按方向键：`move()` 在确认这一步真的动了之后会先 `clearTimeout` + 清空 `ghosts`/`popping` 再重排（**必须在 `if (!moved) return` 之后**，否则往无效方向按一下会把正在进行的合并动画打断成「永远隐身」）。
