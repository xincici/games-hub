# Emoji 滑行（`src/games/slide/`）

> 这是根目录 [`AGENTS.md`](../../../AGENTS.md) 的**游戏分册**：只讲这个游戏自己的实现、
> 存档 key 和踩过的坑。**改这个游戏前先读这里**；跨游戏共用的约定（视觉语言、共享组件、
> 闯关游戏统一约定、新增游戏流程）看根目录。
>
> - 路由：`/#/slide`
> - i18n key 前缀：`__emoji_slide__`
> - 共享组件：`src/shared/`（`i18n.js` / `theme.js` / `confetti.js` / `CountTimer.vue` / `ConfirmDialog.vue` / `Hearts.vue` / `ParticleBackground.vue` 等）

## 实现

SlideGame.vue（Emoji 滑行 · 腾挪消除：每种 emoji 都成对出现（`makeBoard` 把 total/2 个对子名额按种类轮着分，每种张数都是偶数、棋盘一定能清空），**点**一个有同款邻居（上下左右）的 emoji 就把这两个炸掉，周围没有同款则所有同款一起 `tile-shake` 晃动提示（`SHAKE_MS` 620ms）。**拖**是整组滑行：按住 (r,c) 沿某方向拖动时，跟着走的是「自己 + 该方向上**紧挨着的连续** emoji」（`slideParams` 撞到空格就中断，空格后面的不跟着走），能滑多远 = `maxShift`（这组最后一个 emoji 前面连续有几格空白）；松手时 `Math.round(shift)` 得格数 k，用 `shiftGroup` 试算落点看 `findPartner` —— 有同款才提交（整组落到新位置、消掉那一对），没有就什么都不做、`drag` 一清整组自动弹回（CSS `transition: transform` + 回弹 bezier，拖动中加 `.dragging` 关掉过渡做到 1:1 跟手）。**容易踩的点**：①`tileStyle` 的 transform 必须写「自己的格子坐标 + 拖动偏移」，只写偏移会让 36 张牌全堆在左上角；②判「炸着的牌」要算已消除（`grid` 里跳过 `popping`），否则空格不能当通道；③倒计时要真的渲染 `<CountTimer :show="false">` —— 只 import 拿 `timerRef` 而不写进模板的话它永远是 null，表现为时钟不动、时间到也不判负；④**提示条 / 浮层不能放进 `.board` 里**（棋盘 `overflow: hidden` 会把「往棋盘外探」的连击提示整条裁掉，只剩贴着顶边的 3px 绿条）—— 更坑的是 `getBoundingClientRect`、`z-index`、`elementFromPoint` 三条验证都看不出问题（rect 是未裁剪位置、提示条 `pointer-events: none` 又会被 `elementFromPoint` 跳过），**必须用 `Page.captureScreenshot` 带 `clip` + 高 `scale` 放大截图看像素**才能发现；现在两个提示都在 `.game-area` 层级（`.board` 的兄弟节点）。**死局兜底**：`hasAnyMove` 把「直接点能消」和「沿某方向滑 1..maxShift 格后落点四周有同款」两种走法都试一遍（只试 k=1 会漏掉「要滑两格才碰上」），false 就是死局 → `reshuffleBoard` 两层：①**先只换种类**（位置与空格都不动，随机试 25 次）②还不行就 `repairPair` **真的挪位置**，把一对同款摆到同一行或同一列（滑过去必定相邻、必定可消）。**第②层是必需的**：只剩最后一对时怎么换种类都一样、位置没动；两张既不同行也不同列时任何滑动都够不到彼此（滑完不满足消除就弹回、位置留不下来）→ 死局永远解不开。`repairPair` 试每个候选格都必须**基于 base 生成新盘面**（`moved()` 返回新 grid、失败不留痕），直接改 `base` 再判断会在试错中把牌数搅乱。组件侧同步分两种：洗完原来的格子还都有牌（只换种类）→ 原地换 `t.kind` 保留牌的身份；否则（挪了位置，只剩最后一对时就是这种）→ 按新盘面重建 tiles（`applyGrid`）。重排时所有牌错峰播 `tile-reshuffle`（`--shuffle-i` 错开）+ 棋盘正中浮一条提示。检查点：每次消除之后、还原存档之后（`requestAnimationFrame` 里补查一次，等牌先渲染）。实测：满盘无相邻同款 → 进游戏即重排；只剩一对在 (0,0)/(3,3) → 重排后相邻、点掉即过关；纯逻辑侧 400 次最坏位置 + 200 次残局验证可解且张数守恒。**有空格的中局几乎不会死局**（4 万盘没搜到），主要是兜底 + 防旧存档。**关卡曲线**（`levelConfig` 由 `MIN`/`MAX` 线性插值，`CAP_LEVEL = 15`）：第 1 关 6×6·**5 种**·99s（每对 5.50s）→ 第 15 关到顶 11 行 × 8 列·**7 种**·176s（每对 4.00s），行 6→11 / 列 6→8 / 种类 5→7 都在 1~15 关线性爬升（盘面走整数阶梯 6×6 → 7×6 → 7×7 → 8×7 → 9×7 → 10×7 → 10×8 → 11×8），限时 = 对数 × 每对秒数，所以每对时间（真正的难度）逐关严格单调下降；封顶后盘面不变、限时每关再收 3s、160s 保底。**奇数面积的关卡留一个空格子**（第 5 关 7×7、第 8~10 关 9×7）：`makeBoard` 用 `floor(rows*cols/2)` 发对子，再用 `splice` 把那个 0 **插在棋盘正中心**（奇数面积 ⇒ 行列都是奇数，中心一定是真格子）。**组件侧必须跳过 0 不建牌**（初始化路径 + 还原时 `filter(t => t.kind > 0)`）：给空位建一张 `kind = 0` 的牌会渲染成**没有 emoji 的白卡片**（`GLYPHS[-1]` 是 undefined），而 `findPartner` 对 0 返回 null → 幽灵牌永远消不掉 → 胜利判定 `!tiles.length` 永远不成立、**奇数关过不去**。**连击**与连连看同一套：`COMBO_MS` 2500、`registerClear` 在 `eliminate` 里登记、无效操作（滑动弹回 / 只晃动）走 `missCombo` 打断，`combo >= 2` 弹「N 连击」+ `burstConfetti`（喷发点 = 提示条中心往下 `FIRE_DROP_PX` 30px，粒子 `min(44, 12+n*4)`），提示条 `top: -15px` 落在棋盘上方那 16px 空隙里（实测 18px 高、文字完整可见）。顶部统计卡是「关卡 · 时间 · 剩余」三格（**没有「最高关」**，注册表不给 `recordsPrefix`）。局中与失败 / 胜利结算都存档）+ i18n.js（route /slide，key 前缀 __emoji_slide__）

## 存档（localStorage）

  - Emoji 滑行：`__emoji_slide__*`（只有局面存档 `__emoji_slide__state`（关卡、阶段、已用秒数、每张牌的 [种类, 行, 列]）；**不记「最高关卡」**，统计卡上也没有这一格，所以注册表里也就不给 `recordsPrefix`——连点标题的彩蛋对它不生效（与 Emoji 大师一致）；**局中与失败结算都保留**，重进接着玩）
