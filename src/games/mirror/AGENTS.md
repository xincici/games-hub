# Emoji 镜像（`src/games/mirror/`）

> 这是根目录 [`AGENTS.md`](../../../AGENTS.md) 的**游戏分册**：只讲这个游戏自己的实现、
> 存档 key 和踩过的坑。**改这个游戏前先读这里**；跨游戏共用的约定（视觉语言、共享组件）看根目录。
>
> - 路由：`/#/mirror`
> - i18n key 前缀：`__emoji_mirror__`
> - 共享组件：`TopHeader` / `CountTimer` / `confetti`；emoji 取自 `shared/emojis.js`
> - 单局制（没有关卡），5 档难度各自记一个最佳时间

> 玩法简介（面向玩家）见同目录的 [`README.md`](README.md)；本文档只讲实现、存档与踩过的坑。

## 玩法

展示区先亮出这一局的 n 个 emoji 让人看一眼，然后**逐张翻面**，再**打乱**：
所有牌先**叠到展示区中心**，再按随机顺序**飞回各自的格子**（洗牌全程牌背朝上，玩家看不到结果）。
下方游戏区是同样这 n 个 emoji 的另一种排列 —— **开局保证一个位置都不对**（错排，见 `derange`），
而且**开局也是背面**，等展示区洗牌结束才逐张翻开。
**这个「一处都不对」必须是在展示区打乱之后才算的**（见下面时序第 4 步）：`newRound` 里的错排是针对
「打乱前」的展示区算的，展示区随后还会被打乱一次，那个保证就失效了 —— 实测 n=4 时至少撞上一个位置
的概率约 63%（期望撞上约 1 个），用户报的「初始化时没有确保没有正确的」就是这个 bug。
玩家点一张再点另一张把两张换位，
两个区中间的提示区显示「游戏区有几个位置和展示区相同」，全部对上即过关。
**展示区的顺序要玩家自己靠提示推出来**。

`board.js` 的纯逻辑：

- `DIFFICULTIES = [4, 5, 6, 7, 8]` —— 5 档难度对应的 emoji 个数，默认最低档。
- `rowsOf(n)`：4 单排；**5 = 2+3（上 2 下 3，用户指定）**；6 = 3+3；**7 = 3+4（上 3 下 4）**；8 = 4+4。两个区用同一套行数。
- `sameCount(a, b)`：位置和值都相同才算一个。
- `derange(target)`：拒绝采样洗到「没有一个位置相同」；兜底用整体循环移位（错排的经典构造，n ≥ 2 一定没有不动点）。
- `newRound(difficulty)`：从 emoji 池里抽 n 个互不相同的当展示区，游戏区取它的错排。

## 时序与动画

开局一段**不可操作**的序列（`phase = 'deal'`），n=8 时约 4s：

1. 展示区**正面**亮 `REVEAL_MS = 1100ms`，游戏区此时是**背面**；
2. 展示区逐张**翻面**（`FLIP_STAGGER = 90ms` 间隔 + `FLIP_MS = 460ms`，与 CSS 的 `transition` 时长一致）；
   **洗牌必须在翻面之后** —— 先翻面，玩家才看不到打乱的结果（用户明确要求）；
3. `gathering = true`：`displayStyle()` 量出每张和区域中心的差值，给每张加
   `translate(dx, dy) scale(0.82)`，`GATHER_MS = 420ms` 里全部**叠到中心**；
4. 数据 `shuffle`（牌背朝上、看不见），**同时用打乱后的展示区重取一次游戏区错排**
   （`game.value = derange(display.value)` —— 此刻游戏区还是背面，改它看不见；漏掉这一步就会出现
   「开局已有位置相同」，因为 `newRound` 的错排是对打乱**前**的展示区算的）；
   再给每张随机一个 `transitionDelay = k × FLY_STEP(90ms)`，撤掉 transform → 一张张**飞回各自的格子**；
5. 游戏区逐张翻到正面，`phase = 'play'`，计时器开始走，存档。

**胜利的时序**（用户要求）：先 `timerRef.stop()` **停表**、`phase = WON`（立刻锁输入），
展示区逐张翻回正面，**等全部翻完**（`(n-1) × 90 + FLIP_MS`）才 `showResult = true` 并放烟花。
所以遮罩的渲染条件是 `phase === WON && showResult` —— 否则遮罩和烟花会盖在还在翻面的展示区上。
实测判胜瞬间遮罩不在、展示区还有 3 张背面，翻完后遮罩才出现、时间从 00:37 起**不再变化**。
`onTimerTick` 里也加了守卫（`WON` / `DEAL` 期间不更新 `elapsed`），避免残留 tick 把时间改掉。

`flyDelay` 只在飞出的那一段用，飞完立刻复位（否则之后的交换动画也会被它拖慢）。

**翻面**用 emoji 游戏那套：`.mirror-card > .flip`（`transform-style: preserve-3d`）里放 `.front` / `.back`
两个 `.face`（`backface-visibility: hidden`，`.back` 自带 `rotateY(180deg)`），加 `.face-down` 时
`.flip` 转 `rotateY(180deg)`。背面是 `--primary-bg` + 本作首页图标（`i-mdi-mirror-variant`，与注册表里的一致）。

**交换**（用户要求「要有合适的动画效果」）用 FLIP 做法：点击第二张时先量两张卡的
`getBoundingClientRect()` 差值，给它们各加一个方向相反的 `translate`（`transition: transform 0.3s`），
`SWAP_MS = 300ms` 后**先换数据、再撤掉位移** —— 两者相抵，画面不会跳。

**坑：每局必须换一批 `:key`，否则复用的卡片入场表现不一致。**
`v-for` 的 key 原来只用了下标（`` `dc${i}` ``），同一难度再点「新游戏」时 key 完全一样 ——
Vue 会**复用**那几张卡的 DOM：复用的卡不会重播入场翻面过渡、而新建的卡会按 CSS 的初始态多翻一次，
用户看到的正是「展示区有几张直接正面展示、另几张却从反面翻过来」。现在 key 里拼了开局序号
（`dealSeq`，`startRound` 里 `+= 1`，形如 `` `dc${dealSeq}-${i}` ``），每局所有卡片一律重建。
**这与麻将英雄 / 麻将传奇分册里记的是同一个坑**（那边是 `resetUid()` 让牌 id 从 1 重来、key 撞上）。
实测（逐帧监听 `transitionstart`，按卡统计次数）：同难度新开局四张各 **3** 次、切换难度五张各 **6** 次，
**逐卡完全一致**；修前复用的卡与新建的卡次数不同。

**坑：撤掉位移的那一帧必须禁用过渡**。`.mirror-card` 上有 `transition: transform 0.3s`，
直接清掉内联 transform 会让它**再按 0.3s 滑回去一次**（用户报的「感觉多跳动了一次，结果却是对的」）。
现在的做法是 `settling = true`（`.settling { transition: none }`）→ 清 transform → 强制重排 →
30ms 后再放开。

交换提交后进入 `phase = 'checking'`，提示区变成「计算中…」+ 转圈图标、停 **`CHECK_MS = 500ms`**
（用户指定 0.5 秒），然后才把 `sameCount` 的结果写进提示区；全对则 `finishWin()`。
**计算期间锁输入**（`onCardClick` 里判 `phase !== PLAY || swap`）。

胜利后结算浮层的内容是：用时 + 新纪录 + 新游戏，并把 `phase: 'won'` 存档 ——
重进时两个区都是正面、提示显示 n/n、结算浮层照旧在（恢复态不重播翻面与烟花）。

## 尺寸

`--card`（卡片边长）取宽度约束与高度约束的较小值，`CARD_MIN = 34 / CARD_MAX = 72`：

- 宽度：`(min(100vw, 480) − 32 − 24 − (最宽行 − 1) × 10) / 最宽行`；
- 高度：按固定的上半部分（统计卡 64 上边距 + 72、操作卡上下 12 + 72、提示条 34、游戏区内边距与缝隙）估一版。

**两个坑（都踩过）**：

1. **首张卡片的 64px 间距必须写成 `.wrapper` 的 `padding-top`，不能写 `.score-area` 的 `margin-top`。**
   `.wrapper` 只有左右 padding、没有上 padding，于是那个外边距会**塌陷到 `#app` 之外**，而 `#app` 有
   `min-height: 100dvh` —— 结果 html 恒比视口高 64px，**整页真的能滚 64px**（用户报的「垂直方向还是有滚动条」）。
   实测：改前 5 档视口下 `scrollY` 都能到 64；改成 padding 后 **5 档视口 × 4/5/8 3 档难度共 15 种组合全部为 0**。
2. **判断「能不能滚」只能用 `window.scrollTo(0, 9999)` 再看 `scrollY`**，别用
   `document.body.scrollHeight`（body 恰好等于视口、看不出问题）也别用
   `document.documentElement.scrollHeight`（它会把塌陷出去的那 64px 也算进来，恒比视口大、会误导你一路缩卡片）。
   顺带一记：**首页与数独** 用同一把尺子量过 —— 首页五档全 0，数独在 375×667 能滚 60px、320×568 能滚 104px
   （既有情况，与本次改动无关）。

**区域标签（「展示区」/「游戏区」）按用户要求整条去掉了**，腾出的高度正好抵消了一部分预算；
`--card` 取宽度与高度两个约束的较小值（`CARD_MIN = 34 / CARD_MAX = 72`）。

上面这些实测里含 320×568。按根目录的约定，**最小验收尺寸是 375×667（iPhone SE）**：
375×667 与 390×844 下 5 档难度 + 首页的横向/纵向溢出实测都是 0（卡宽均 72px），320 的数据只作参考。

## 存档（localStorage）

- `__emoji_mirror__state`：`{ difficulty, display, game, elapsed, phase }`（`phase` 只存 `play` / `won`；
  存的是**完整顺序**，恢复时校验两个数组长度都等于该难度的 emoji 数，不符就当没有存档、重开）
- `__emoji_mirror__best_1` ~ `__emoji_mirror__best_5`：5 档难度各自的**最佳用时（秒，越小越好）**
  （注册表里 `recordsPrefix: '__emoji_mirror__best_'` + 1~5，正好被标题连点 5 次的清记录彩蛋命中）
- `__emoji_mirror__help_showed`：帮助弹窗是否已弹过

**恢复界面时一律不放任何动画**（用户要求）：直接摆成该有的样子 —— 展示区背面（胜利时正面）、
游戏区正面、不铺牌不洗牌不翻面，`elapsed` 交给 `timerRef.restore()` 接着走，`won` 态直接铺结算浮层。

做法是**在 `setup` 阶段就把存档读进状态**（`const restored = restoreState()`，返回值给 `onMounted` 用），
而不是等 `onMounted` 再补 —— 只靠 `onMounted` 时，首帧可能已经被浏览器画成「空盘正面」，
补状态那一下就会触发一次翻面过渡（用户报的「恢复时展示区还会有翻面效果」）。
`onMounted` 里只补计时器（`timerRef.restore(elapsed)`）与尺寸计算。另外 `silent` 标记在前两帧给
所有卡片挂上 `transition: none`（`.silent`），放开后新开局的铺牌 / 翻面动画照常。

开局不变式也实测过：5 档难度连开 **16 局**，每局开局后立刻读存档算 `sameCount(game, display)`
与提示区文字，**16/16 都是 0**（修前 n=4 约有 63% 的局会撞上至少一个位置）。

实测（监听 `transitionstart`）：SPA 返回与整页重载恢复时**过渡事件 0 次**、
5 张展示区直接是背面、游戏区正面、用时接着 00:34；新开一局 1.5s 内仍有 **16 次**过渡（动画没被误关）。

切换难度 = 立刻开新的一局（难度按钮就是 `startRound(next)`），**不做二次确认**。

## 隐藏彩蛋：长按计时器偷看展示区

**在「⏱ 用时」那一格上按住 1.5 秒，展示区会整片翻回正面**，松手立刻翻回去（用户要的「作弊手段」）。
**刻意不写进帮助文案**（`help1..help3` 里不含「长按 / 偷看 / 按住」任何字眼，实测 0 处）——
这是有意留的彩蛋，新增帮助条目时别顺手写进去。

实现：`PEEK_MS = 1500`（用户从 4s 改成 1.5s），`pointerdown` 起一个定时器、`pointerup` / `pointercancel` / `pointerleave` 收掉；
到点把 `peeking = true`，展示区的 `face-down` 类改成 `hidden[i] && !peeking`。

- **只改这一个独立标记**：不碰 `hidden`、不碰 `display` / `game`、**也不写存档**，所以游戏逻辑与进度
  完全不受影响（实测偷看前后存档里 `display` / `game` / `phase` / `difficulty` 逐字相同，只有计时器的
  `elapsed` 会随时间走）。
- 只在 `PLAY` / `CHECKING` 阶段生效；`WON` 时展示区本来就正面，按了也没有变化。
- `startPeek` 里用 `setPointerCapture` 保证松手一定能收到 `pointerup`，**但要包 try/catch** ——
  合成事件（测试脚本 dispatch 的）没有真实 `pointerId`，不捕获会抛。
- 换局 / 恢复存档 / 卸载都会清掉定时器并把 `peeking` 复位（`clearTimers` 里一并清）。
- 那一格加了 `user-select: none` + `touch-action: none` + `-webkit-touch-callout: none`，
  免得长按变成选中文字 / 滚动 / 系统长按菜单。

实测：按 1.2s 不翻开（4/4 仍背面）✓；按满 1.75s → 0/4 背面（翻开）✓、继续按住保持翻开 ✓、
松手 → 回到 4/4 ✓；偷看期间计时器照常走 ✓；交换一次之后再偷看同样有效 ✓。

## 界面

- 统计条**两格**：「🏆 最佳 / ⏱ 用时」（用户要求交换位置、并去掉原来的「🎯 正确」——
  正确个数提示区里本来就有「位置相同 N / n」），中间用 `.divider` 分隔（分隔线写在 `.wrapper` 层级）。
- **`.card` 与 `.game-icon` 必须自己写一份**（它们是各游戏 scoped 样式里的重复约定，不是全局类）：
  漏掉的表现就是「分数区和难度 / 新游戏卡片的背景没了、按钮是浏览器默认样式」（用户报过）。
  `.card` = `background: var(--card-bg-color)` + `var(--card-radius)` + `var(--card-shadow)` + `box-sizing: border-box`；
  `.game-icon` = `--primary-bg` 底 + `#fff` 字 + `padding: 8px 12px` / `13px` 粗体 + `var(--radius-tile)`。
- 操作卡左侧是难度加减（抄数独那套 `.difficulty-wrapper` + `.opt-icon` + `.difficulty-value`，
  `gap: 4px`、数值 `min-width: 22px`），显示的是**当前 emoji 个数**；右侧只有「🎮 新游戏」。
- 提示区是游戏区中间的一条胶囊（`.hint-bar`）：平时显示「位置相同 N / n」，计算中换成
  「🤔 计算中…」+ `spin` 转圈；数字用主色。
- **不写区域标签**（用户要求去掉）：两个区靠 `.game-area` 的 `gap: 12px` 与卡片自身的排布区分，
  卡片按 `rowsOf(n)` 每行居中。
- 结算浮层 `.result` 盖在 `.game-area` 上（`box-sizing: border-box`，与其它 emoji 游戏一致）。
