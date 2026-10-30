# 关灯游戏（`src/games/click/`）—— 原「点击游戏」

> 这是根目录 [`AGENTS.md`](../../../AGENTS.md) 的**游戏分册**：只讲这个游戏自己的实现、
> 存档 key 和踩过的坑。**改这个游戏前先读这里**；跨游戏共用的约定（视觉语言、共享组件、
> 闯关游戏统一约定、新增游戏流程）看根目录。
>
> - 路由：`/#/click`
> - i18n key 前缀：`__easy_click_game__`
> - 共享组件：`src/shared/`（`i18n.js` / `theme.js` / `confetti.js` / `CountTimer.vue` / `ConfirmDialog.vue` / `Hearts.vue` / `ParticleBackground.vue` 等）

> 玩法简介（面向玩家）见同目录的 [`README.md`](README.md)；本文档只讲实现、存档与踩过的坑。

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

## 按钮配色（上帝模式）

「⚡ 上帝模式」按钮**可点击时是橙色** `var(--god-bg)`（`#c2410c`，白字 5.18:1），禁用时仍是原有的灰
（`#aaa`）——规则写成 `.game-icon.god-btn:not(:disabled)`，`:not(:disabled)` 保证禁用态不回落到橙色。
挑色时要算白字对比度：更亮的橙（`#ea580c` 3.56:1、`#f59e0b` 2.15:1）都不达标。
- 存档 key：`__easy_click_game__difficulty`（当前难度）、`__easy_click_game__state`（局面存档）、`__easy_click_game__best_*`（各难度最佳成绩）、`__easy_click_game__help_showed`（帮助弹窗是否已弹过）

## 视觉：数字 → 灯（2026-10 改造，玩法完全没变）

用户要求：「把点击游戏修改为关灯游戏，规则玩法全都不变，0 代表关闭的灯，1 带边亮度最高的灯，
2 代表亮度降低一半的灯。用玩家一眼就能理解的方式表达灯的呈现方式，灯亮度的改变有动画渐变效果。」

**只改呈现，不动规则**：数值仍是 0/1/2 + 点击自身与四邻 `+1 mod 3`，存档 key / 难度 / 上帝模式全不变。
所以**没有改任何逻辑代码**，只动了模板（数字 → 灯珠）、样式、文案与名字。

### 三档亮度怎么画

每格 `.inner` 是灯座，里面一个 `.bulb` 圆形灯珠：

| 值 | 含义 | 灯珠 `.bulb` | 灯座 `.inner` | 灯圈（border） |
| --- | --- | --- | --- | --- |
| 0 | 熄 | `--lamp-bulb-off` 暗灰蓝 + 内阴影 | `--lamp-housing-off` 最暗 | 透明（不亮） |
| 1 | 全亮 | `--lamp-bulb-full` 近白 + 三层辉光 | `--lamp-housing-on` 暖色溢光 | `--lamp-rim-on`（**1 带灯圈**，用户明确要求） |
| 2 | 半亮 | `--lamp-bulb-half` 琥珀 + 约 1/3 辉光 | `--lamp-housing-half` | `--lamp-rim-half`（半透） |

- 灯的 6 个 token 在 `App.vue` 的 `--lamp-*`（浅色 / 深色主题各一套，深色下灯座更暗、辉光更强）。
- **渐变**：`.inner` 与 `.bulb` 都写了 `transition: background-color .32s, box-shadow .32s, border-color .32s`，
  所以切换亮度是「渐变」，不是跳变。实测（点一格、90ms 采样灯珠底色）：
  全亮 `rgb(255,249,220)` → 中间值 `rgb(251,223,163)` → 半亮 `rgb(246,189,88)` ✓ 中间值与两端都不同 = 真的在渐变。
- ⚠️ `.inner` 那条 `transition` 带了 `!important`：`App.vue` 里 `#app button:not(:disabled):hover` 有一条
  只含 `filter/opacity` 的全局 transition（ID 选择器优先级高于组件内的类），不加 `!important` 会在桌面端把
  亮度过渡整条覆盖掉 → 又变成跳变。
- 原来的 `.inner.clicked { opacity: 0.1 }`（上帝模式「正在点这一格」）**改成亮一圈主色环**
  （web `outline`、小程序 `inset box-shadow`）—— 灯被调成 10% 透明就看不见了。

### 「一眼就能理解」：一行图例 + 循环方向

棋盘上方**一行**：`灭 → 全亮 → 半亮 ↺`（三个迷你灯 + 文字）+ 一句短提示「四邻一起变」。
三档亮度差得够开（暗灰 / 琥珀 / 近白 + 灯圈），加上这一行图例，第一次玩也能明白点击是**循环升一档**。

⚠️ 图例**必须只占一行**：375×667 上本来就没有余量（难度 6 的 6×6 盘面已经把页面顶出 19px），
多一行就会让滚动再多 ~20px。现在图例用 11px 文字 / 12px 迷你灯 / 上边距 6px，并把 `.game-area`
的上外边距从 12px 收到 0（留白交给图例）——实测整页只比改造前多 **4px** 滚动。

### 名字与图标

- `gameTitle`：`关灯游戏` / `Lights Out`（首页卡片与顶栏标题都取自它）；`README` / 根 `README` /
  根 `AGENTS` 表格 / `docs/GAMES.md`（跑 `node scripts/check-conventions.mjs --write` 刷新，
  脚本里的 `names.click` 也要改）一起改。
- 首页图标：`i-carbon-touch-1`（手指）→ **`i-carbon-idea`（灯泡）**，并加进 `uno.config.ts` 的 `safelist`。

### 实测（390×844 与 375×667）

- 36 格（难度 6），三档数量 15 / 12 / 9；`.bulb` 24×24 落在 44×44 格子里（难度 10 时 30px 格子仍居中）。
- 三档实测：全亮 灯座 `rgb(51,43,22)` / 灯圈 `rgba(255,214,102,.98)` / 灯珠 `rgb(255,249,220)`；
  半亮 `rgb(36,33,28)` / `.42` / `rgb(246,189,88)`；熄灭 `rgb(21,27,35)` / 透明 / `rgb(51,59,71)` ✓
- 375×667：难度 3 → `scrollHeight - innerHeight = 0` ✓；难度 6 → **23px**（改造前是 19px，图例只多 4px）；
  难度 10 → 99px（改造前 95px；10×10 盘面 420px，本来就要滚）。390×844 全部 0 ✓
- 深浅两套主题各截一张：灯座深色、辉光明显，暗色主题下灯光更亮 ✓

## 撤销 / 重做按钮宽度：与小程序一致（屏宽的 75%）

web 原来 `.undo-card` 是普通 `.card`（`width: calc(100% - 32px)`，390 宽时 358px），
两颗 `.undo` 又各限 `max-width: 160px` → 按钮合计 **320px = 屏宽的 82%**，比小程序宽一截。

小程序那边（关灯/点击页）是 `.undo-card { width: 622rpx }`（= 屏宽的 82.93%），
两颗按钮各占一半、`padding: 15rpx` → **合计 562rpx = 屏宽的 75%**。

现在 web 照抄这个口径：

```scss
.undo-card {
  width: calc(100vw * 622 / 750);   // 622rpx = 屏宽的 82.93%
  max-width: 398px;                 // 480 宽屏时的 622rpx
  box-sizing: border-box;
}
.undo { width: 100%; }            // 去掉 max-width: 160px →
```

**实测**（两颗按钮宽度合计 / 占屏宽）：

| 视口 | 改造前 | 现在（web） | 小程序 |
| --- | --- | --- | --- |
| 390×844 | 320px（82%） | **290px（74.5%）** | **292px（74.9%）** ✓ |
| 375×667 | ~314px（84%） | **278px（74.1%）** | **280px（74.7%）** ✓ |

卡片与按钮都仍然是居中（390 下卡片 left 33 / 宽 323，中心 194.5 vs 195 ✓）。
