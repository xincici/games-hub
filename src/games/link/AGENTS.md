# Emoji 连连看（`src/games/link/`）

> 这是根目录 [`AGENTS.md`](../../../AGENTS.md) 的**游戏分册**：只讲这个游戏自己的实现、
> 存档 key 和踩过的坑。**改这个游戏前先读这里**；跨游戏共用的约定（视觉语言、共享组件、
> 闯关游戏统一约定、新增游戏流程）看根目录。
>
> - 路由：`/#/link`
> - i18n key 前缀：`__emoji_link__`
> - 共享组件：`src/shared/`（`i18n.js` / `theme.js` / `confetti.js` / `CountTimer.vue` / `ConfirmDialog.vue` / `Hearts.vue` / `ParticleBackground.vue` 等）

## 实现

LinkGame.vue（emoji 连连看 · 闯关制：限定时间内清空全盘过关，难度 = 列 6→10 + 行 6→12 + 种类 6→12 + 对数 9→30 + 墙 0→18 + 限时，第 30 关全部封顶但关数无限；同一种 emoji 可出多对（偶数张即可）。顶部统计条底部有本关进度条（已消 / 总对数），操作区只有「新游戏」，失败遮罩给「重玩本关」，倒计时只在统计条。**连击**：两次消除之间没有无效点击、且间隔 < 2.5s 才算连上，棋盘上方弹「N 连击」+ `burstConfetti` —— 喷发点由 `comboOrigin()` 取「提示条中心往下 30px」（`FIRE_DROP_PX`），提示条贴在棋盘上方，所以落点在棋盘顶部内侧约 24px；`showCombo` 先 `await nextTick()` 再量提示条（高度随连击数变，量不到就退回「棋盘上边缘往上 5px」再 +30）。粒子数压到 `min(44, 12+n*4)`，连得越高字越大。间隔超 2.5s、或点到的牌没消掉（emoji 不同 / 连线不通 / 取消选择）就中断 —— `registerClear` 在 `removePair` 里数据一改就登记，`breakCombo` 挂在 `onTileClick` 那三条分支，另有 2.5s 窗口定时器兜底；提示条 `top: -15px` 落在 `.game-area` 上方那 16px 空隙里（`--row-gap`），高度压到约 18px 才既不压到上面的统计卡、也只微微盖住棋盘顶边。**连线层 `.link-layer` 必须就是棋盘那么大**：`viewBox` = `0 0 W H`、`left/top: 0`、格子中心 = `(c+0.5, r+0.5)`、棋盘外那一圈落在 `-LANE_GAP` / `W + LANE_GAP`（0.14 格）——早期按 `(W+2)/W` 放大再左上偏一格，那个**盒子**就比棋盘大整整一格（30px），而棋盘离屏幕边只有 16px，于是连线那 0.7s 里文档突然可滚动、线消失又恢复：桌面滚动条一进一出、手机橡皮筋回弹＝玩家看到的「连线时抖一下」（实测 360×640 第 1 关 scrollW 360→399）；现在只多出 `LANE_GAP` 那点墨迹，连线前后可滚动范围完全一致+ board.js（纯逻辑：≤2 转弯路径查找、关卡曲线 CURVE 与 levelConfig、buildPairPool 多对发牌、generateLevelBoard/generateWalls、死局重排）+ i18n.js（route /link，key 前缀 __emoji_link__）

## 存档（localStorage）

  - Emoji 连连看：`__emoji_link__*`（闯关进度 `__emoji_link__level`=当前关卡，历史最高关卡 `__emoji_link__best_1`（沿用「前缀+数字」以便连点标题清记录），局面存档 `__emoji_link__state`（盘面、墙、关卡、已用秒数、胜负状态；**胜利局面也保留**，退出重进还是那个结算层、由玩家自己点「下一关」，失败同样保留）；旧的 `__emoji_link__difficulty`、`__emoji_link__walls` 与 `__emoji_link__1..5` 已废弃）

## 界面约定

- 操作区左侧「盘面信息」：`行列 · 种类 · 墙数`
- 入场动画的错峰序号 = **`行 + 列`**（左上 → 右下的斜向波浪，同一斜线上的牌一起出现），每档 25ms，总时长 `(rows + cols) * 25 + 350`；原来是按阅读顺序编号，看起来是「一行一行往下刷」。
