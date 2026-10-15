# Emoji 侦探（`src/games/detective/`）

> 这是根目录 [`AGENTS.md`](../../../AGENTS.md) 的**游戏分册**：只讲这个游戏自己的实现、
> 存档 key 和踩过的坑。**改这个游戏前先读这里**；跨游戏共用的约定（视觉语言、共享组件、
> 闯关游戏统一约定、新增游戏流程）看根目录。
>
> - 路由：`/#/detective`
> - i18n key 前缀：`__emoji_detective__`
> - 共享组件：`src/shared/`（`i18n.js` / `theme.js` / `confetti.js` / `CountTimer.vue` / `ConfirmDialog.vue` / `Hearts.vue` / `ParticleBackground.vue` 等）

> 玩法简介（面向玩家）见同目录的 [`README.md`](README.md)；本文档只讲实现、存档与踩过的坑。

## 实现

DetectiveGame.vue（emoji 找茬侦探：记忆→翻面→偷换→答题；掉一颗心扣 1 条命，生命行用 `shared/Hearts.vue`。**三种牌面**：顶栏帮助旁的模式开关按 emoji → 扑克 → 麻将 → emoji 循环（`mode` 1/2/3，存 `__emoji_detective__mode`；读到 1/2/3 以外的值一律当 1），玩法一样、只是牌面与排列不同。扑克牌面**直接复用 `games/poker/CardItem.vue`**（纯展示组件，无扑克那边的状态依赖），尺寸用 `cardVars` 内联 --width/--height/--text-size/--icon-size/--back-size（内联优先级最高，不用改扑克样式、也不受 scoped 影响）。牌是 2:3 长方形，所以 `metrics` 同时按宽和高反推格子：`byH = (availH - 2GAP - (rows-1)GAP) / rows` 再除 1.5 得宽度上限，行数一多就靠高度反推（不然 568 高的屏上四行牌会顶出屏幕），行高走 `--cell-h`（emoji = 边长、扑克 = 1.5 倍宽、麻将 = 1.282 倍宽）。扑克模式牌数更多（1×4 → 4×7 共十关；emoji 是 1×3 → 4×5 共九关 —— 有花色 + 点数两层线索更好记），`.board.poker .face` 把外框底色 / 描边 / 阴影让开、整张牌交给 CardItem，只留 3D 翻面与「答对高亮」（高亮那条选择器权重更高所以仍生效）。**结算前停留 0.5s**（`useResultDelay()`）：答对或扣掉最后一颗心后先停 0.5s 再弹浮层，期间点选直接返回；答对的**当场亮绿**（`rightIdx`）、扣心的当场标红抖动，停留里看得到结果。**选错**：抖动 + 扣心 + 进 `wrongIdxs` 常驻红标，`onCellClick` 忽略已标错的（否则同一张能反复点、反复扣心）。emoji 模式红标画在 `.front-face`（淡红底 + 红描边），扑克模式牌面透明、红标画成 `:deep(.card)` 外一圈；下标也写进存档（`wrong`）并随胜利结算层还原，回来能看到「红 = 自己点错的、绿 = 答案」。三种模式的关卡进度、最高关卡与局面**分开存**（emoji 用 `__emoji_detective__level` / `best`，扑克 `_2` 后缀、麻将 `_3` 后缀 —— `modeSuffix()` 按 `mode` 拼），`toggleMode` 先 `save()` 当前模式再切、然后 `bootMode()`（有存档接着玩、没有就开新局）；连点标题清记录会把三种牌面的最高关卡一起清）+ i18n.js（route /detective，key 前缀 __emoji_detective__）。顶部统计卡中间显示「当前第几关」，「新游戏」走共用的 `ConfirmDialog`（确认后清当前牌面的记录并回第 1 关）

## 第三种牌面：麻将（mode = 3）

**关卡曲线 / 玩法参数全部沿用 emoji 那一套**（用户明确要求，不为麻将另造曲线）：
`sizes` / `memories` 只在 `mode === MODE_CARDS` 时取扑克那两套，其余（含麻将）都走
`EMOJI_SIZES` / `EMOJI_MEMORIES`。所以麻将模式也是 1×3 → 4×5 共九关、观察 2~7 秒。
（**格子尺寸不沿用 emoji**：emoji 是正方形格子，麻将按下面那条竖牌比例排。）

三处跟着牌面变：

| | 数据形态 | 宽高比 | 宽度上限 | 渲染 |
| --- | --- | --- | --- | --- |
| emoji（1） | `'🎃'` 字符串 | 1 | `CELL_MAX` 96 | 直接插字符 |
| 扑克（2） | `{ num, type }` | `CARD_RATIO` 1.5 | `CARD_MAX_W` 64 | `<CardItem>` + `cardVars` |
| 麻将（3） | `{ suit, value }` | `MAHJONG_RATIO` = `TILE_RATIO` 168/131 | `MAHJONG_MAX_W` 60 | `<MahjongTile>` + `mahjongVars` |

- **麻将模式的格子按牌的真实比例排**（用户硬要求，与扑克模式同一种做法）：`metrics` 里
  `ratio = TILE_RATIO`、`cap = MAHJONG_MAX_W`，格子宽 = `min(60, 按宽均分, 按高反推)`、
  格子高 = 宽 × 1.282 —— **不是「正方形格子中间摆一张竖牌」**。三条约束与扑克那条完全同构，
  只是比例从 1.5 换成 1.282、上限从 64 换成 60；比例常量直接
  `import { TILE_RATIO } from '@/shared/mahjongTiles'`（与雀圣 / 麻将英雄同一个来源），别手写数字。
- `--mj-w` / `--mj-h` 取「格子 − 2」（对齐外框那 1px 描边），牌面**正好填满格子**；
  `.board.mahjong .face` 把外面那层的底色 / 描边 / 阴影让开、整张牌交给 `MahjongTile` 那张图，
  所以不会出现「方形底色 + 中间一张小牌」的观感（与扑克模式同一条规则）。
- 实测（格子 / 牌面，牌面恒为格子 − 2）：

  | 视口 | 第 1 关（1×3） | 第 9 关（4×5） |
  | --- | --- | --- |
  | 375×667 | 格 60×77，牌 58×75 | 格 60×77，牌 58×75 |
  | 390×844 | 格 60×77，牌 58×75 | — |
  | 320×568 | 格 60×77，牌 58×75 | 格 48×62，牌 46×60 |

  三档都是「牌面不溢出自己的格子、盘面不溢出棋盘、页面无横纵向滚动」；320 的 4×5 靠
  `byH / ratio` 那条把格子压到 48×62（与扑克模式同一套反推逻辑）。
- 数据形态与扑克模式**同一种组织方式**：麻将盘面里存的就是 `faceOf(key)` 拆好的
  `{ suit, value }`（`drawTiles()` 从 `MAHJONG_FACES` 洗牌取前 n 张），模板直接吃 `cell.suit` /
  `cell.value`，不在渲染处临时解析；`keyOf()` 加了 `'num' in item` 这一支来区分两种对象。
- 牌背**不能直接画某张麻将牌面**（正面朝上时看着像没翻面）：麻将模式背面用共享组件
  **`shared/MahjongBack.vue`**（**绿色纹理牌背**：`#1f7a4d` 绿底 + 45° 亮纹叠 -45° 暗纹 + 内圈双线；
  铺满父元素、圆角继承，条纹用百分比，所以任意牌尺寸下纹理密度一致）。
  此前用的是图标 `i-dinkie-icons-three-of-circles-mahjong`（与顶栏模式图标同一个），
  主色底 + 白图标 —— 玩家反馈「不像牌背」，现统一换成绿色纹理牌背。
- 红标 / 答对高亮：麻将牌面是圆角图片，`.front-face` 的底色与描边已让开，所以改用
  **`outline`** 画（跟着圆角走，又不必去 `:deep()` 穿 `MahjongTile` 的 scoped 样式）。
  注意公共那条 `.revealed .front-face` 的方框 `box-shadow` 要显式 `box-shadow: none` 盖掉，
  否则格子外还会多一圈方环、和圆角圈重叠。
- 顶栏图标三个分支必须是**静态**的 `v-if` / `v-else-if` / `v-else`
  （`i-mdi-emoticon-happy-outline` / `i-mdi-cards-playing-outline` /
  `i-dinkie-icons-three-of-circles-mahjong`）：用变量拼 class 的话 UnoCSS 提取不到，
  上线就是一个空白方块（dinkie 那条已在 `uno.config.ts` 的 safelist 里）。

## 生命耗尽：先盖章指出正确答案，再出失败遮罩

错满 3 次时**不能立刻铺失败层**（玩家只看到自己点红的那张，不知道答案是哪张），
但也**不能马上开始提示** —— 点错那张的抖动动画（`.shaking` 的 `shake 0.4s`）还没放完，
提示一起冒出来画面很乱（用户先后提了这两点）。现在的顺序是**三段**：

```js
if (hearts.value <= 0) {
  timerRef.value?.stop();                 // 计时到失误那一刻为止
  stampThen(() => {                       // ① 等点错那张抖完（450ms）
    stampShown.value = true;              // ② 在正确答案上盖章 + 这张牌震一下
    loseThen(() => { phase.value = LOST; save(); });   // ③ 才失败结算
  });
}
```

- 两个停留钩子：`useResultDelay(450)` → `stampThen` / `stamping`，
  `useResultDelay(1000)` → `loseThen` / `losing`；答对那条仍是默认的 0.5s（`settleThen`）。
  锁输入用 `locked = settling || stamping || losing`，换关 / 重开时三个 `cancel` 一起调。
- **盖章的观感**：`.stamp`（绝对定位盖在牌上，`pointer-events: none`）里是一个歪 12° 的
  方章（`--primary-bg` 描边 + 「✓」+ 本地化文字 `stampText`），进场 `stamp-in 0.42s`：
  **底色取 `rgb(255 255 255 / 40%)`**（调过两轮：第一版 84% 的白底几乎把牌面图案整个盖住
  （用户报「完全挡住原来的图案」），改成 20% 又太透（用户反馈），最后定在 40% —— emoji / 扑克
  牌面透得出来，章也还压得住）；阴影同时减淡到 `0 1px 2px rgb(0 0 0 / 12%)`。
  从 `scale(2.4)` 落到 `scale(0.94)` 再回弹到 1（像按下去的章）。随后这张牌
  `stamp-shake 0.5s ease 0.45s` 震一下（幅度比点错的 shake 小）。
  **震动的类必须挂在正面那层 `.front-face`** —— `.card-flip` 的 transform 是翻面状态，
  动它会顶掉翻面（和答对高亮、猎手是同一个坑）。
- 章要**静态保留**：`v-if="idx === swappedIdx && (stampShown || phase === LOST)"` ——
  失败结算后（包括重进存档）章还在，但 `stampShown` 由 `restore()` 置回 false，
  所以不重播盖章动画（沿用「动画只能由本次点击的瞬时标记驱动」那条经验）。
- 存档守卫同前：`over = WON || LOST || (phase === ANSWER && hearts === 0)`，
  停在「正在盖章」的 1s 里重进也按失败恢复。

实测（emoji 3×3，答案在索引 8，点错 0/1/2）：

| 时刻 | 遮罩 | 章 | 震牌动画 |
| --- | --- | --- | --- |
| 150ms | 无 ✓ | **还没有** ✓（在等抖动放完）| — |
| 600ms | 无 ✓ | ✓正确（`stamp-in`）| `stamp-shake @0.45s` |
| 1100ms | 无 ✓ | 还亮着 | 同上 |
| 1700ms | **`result lose`** ✓ | 仍亮着 ✓ | 同上 |

扑克牌面（12 张、答案在第 6 格）同样验过：700ms 时章已在、遮罩还没出；1700ms 出 `result lose`。

## 存档（localStorage）

  - Emoji 侦探：`__emoji_detective__*`（牌面模式 `__emoji_detective__mode` = 1 emoji / 2 扑克 / 3 麻将。
    **三种牌面各自一套 key**，后缀由 `modeSuffix()` 拼：emoji 不留后缀（老存档无缝）、扑克 `_2`、麻将 `_3`）

| 牌面 | 牌面模式 | 进度 + 局面（同一个 key） | 最高关卡 |
| --- | --- | --- | --- |
| emoji | `__emoji_detective__mode` = 1 | `__emoji_detective__level` | `__emoji_detective__best` |
| 扑克 | `__emoji_detective__mode` = 2 | `__emoji_detective__level_2` | `__emoji_detective__best_2` |
| 麻将 | `__emoji_detective__mode` = 3 | `__emoji_detective__level_3` | `__emoji_detective__best_3` |

  - `level` / `level_2` / `level_3` 存的是**关卡进度与当前局面**（同一个 key，JSON：关卡、剩余❤️、阶段、
    用时、盘面、被偷换的下标、已标错的下标；盘面形态 —— emoji 是字符串、扑克 `{num, type}`、麻将 `{suit, value}`）。
  - **胜利与失败局面都会连盘面带答案一起保留**（失败时 `hearts` 为 0、并亮出被偷换的那张与所有标错的下标），
    重进仍是结算层，玩家自己选「重玩本关 / 下一关」；只有中途退出（记忆 / 翻面 / 作答）不还原，直接重开当前关。
  - 连点标题清记录（`onScoreReset`）会把 `best` / `best_2` / `best_3` 三份一起清掉 ——
    新增牌面时这里也要跟着补一条 `removeItem`。
  - 代码里一律用 `levelKey()` / `bestKey()`（按 `mode` 拼后缀），**不要直接写死 key**；
    `mode` 必须在 `bestLevel` **之前**初始化（`bestLevel` 要按模式选 key，反了就是 TDZ）。

## 界面约定

- 顶栏「游戏特色按钮」：牌面玩法切换（`TopHeader` 默认插槽），点一下按 **emoji → 扑克 → 麻将 → emoji** 循环。
- 操作区那格显示的牌面名走 `modeName`（`modeEmoji` / `modePoker` / `modeMahjong`）。
