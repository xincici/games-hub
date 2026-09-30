# Emoji 大师（`src/games/master/`）

> 这是根目录 [`AGENTS.md`](../../../AGENTS.md) 的**游戏分册**：只讲这个游戏自己的实现、
> 存档 key 和踩过的坑。**改这个游戏前先读这里**；跨游戏共用的约定（视觉语言、共享组件、
> 闯关游戏统一约定、新增游戏流程）看根目录。
>
> - 路由：`/#/master`
> - i18n key 前缀：`__emoji_master__`
> - 共享组件：`src/shared/`（`i18n.js` / `theme.js` / `confetti.js` / `CountTimer.vue` / `ConfirmDialog.vue` / `Hearts.vue` / `ParticleBackground.vue` 等）

## 实现

MasterGame.vue（Emoji 大师 / 羊了个羊闯关玩法：分层堆叠 + 遮挡判定、7 格收集槽三消、关卡难度曲线（组数 8→32（24→96 张，已是布局容量上限）、种类 **7→18**、层数 2→8，第 50 关到顶，之后关数无限；同一种可出多组，张数恒为 3 的倍数）、无计时器、无洗牌道具、顶部统计条底部有进度条（已消卡片/本关总卡片）、操作区左侧显示「层数 · 种类」、新游戏二次确认、开局/恢复时自下层向上逐张堆叠入场；游戏区本身是一张带底色的卡片（`--board-bg` + `--card-radius` + 8px 内边距，与连连看 / 消消乐同款——卡片坐标按 `layout` 的 `BOARD_PAD` 一起算，改内边距要同步改 `unit` 与 `--board-h`）；被压住的卡片**一律不透明**（depth-N 仅作样式钩子），只靠 `filter: brightness(0.5)` 变暗表示不可点；层数只影响视觉，能不能点仍由 `freeIds` 判定；连点时每张牌各播一条独立飞行动画（互不等待，flights 数组），落格用 settling 做重入保护、通关判定要等 flights 清空）+ board.js（纯逻辑：难度曲线 + 错位分层摆放（禁止两张卡片完全重叠、不让任何卡片被彻底遮住）+ buildTripleBag/dealAlongOrder 保证可解的发牌）+ i18n.js（route /master，key 前缀 __emoji_master__）

## 存档（localStorage）

  - Emoji 大师：`__emoji_master__*`（`__emoji_master__help_showed`，闯关进度 `__emoji_master__level`（当前第几关，「新游戏」二次确认后清除），局面存档 `__emoji_master__state`（关卡、盘面分层卡片、收集槽；**胜利时改写成一笔「第几关 + 已过关」的结算记录**（盘面与槽为空）并保留，退出重进仍是结算层、由玩家自己点「下一关」；失败清除））

## 界面约定

- 操作区左侧「盘面信息」：`层数 · 种类`
