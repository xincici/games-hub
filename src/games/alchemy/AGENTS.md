# 扑克炼金术（`src/games/alchemy/`）

> 这是根目录 [`AGENTS.md`](../../../AGENTS.md) 的**游戏分册**：只讲这个游戏自己的实现、
> 存档 key 和踩过的坑。**改这个游戏前先读这里**；跨游戏共用的约定（视觉语言、共享组件、
> 闯关游戏统一约定、新增游戏流程）看根目录。
>
> - 路由：`/#/alchemy`
> - i18n key 前缀：`__poker_alchemy__`
> - 共享组件：`src/shared/`（`i18n.js` / `theme.js` / `confetti.js` / `ConfirmDialog.vue` / `ParticleBackground.vue` 等）；
>   牌面复用 `src/games/poker/CardItem.vue`

> 玩法简介（面向玩家）见同目录的 [`README.md`](README.md)；本文档只讲实现、存档与踩过的坑。

## 玩法

两种**关卡模式**，顶栏帮助图标旁切换，各自独立记录。

### 炼金闯关（4×4）

4×4 棋盘（16 格）：手里一次只有一张牌（面板上还能看到接下来的两张），点空格放入、或把牌拖进空格。
**10 条消除线** = 4 行 + 4 列 + 2 条对角线；某条线放满 4 张牌、且这 4 张能组成牌型时，
该线计分并整条消除（先闪烁两下再消失）。

| 牌型 | 分数 | 说明 |
| --- | --- | --- |
| 四条 | 1000 | 4 张同点数 |
| 同花顺 | 1000 | 同花色且点数连续（A 可当 1，也可接在 J Q K 之后）|
| 三条 | 500 | 3 张同点数 + 任意第 4 张 |
| 顺子 | 300 | 点数连续、花色不同 |
| 同花 | 200 | 4 张同花色 |
| 两对 | 100 | 两个对子 |
| 一对 | 50 | 2 张同点数 + 任意两张 |

注意 **同花(200) 比顺子(300) 分低**：`COMBOS` 仍按分值降序排（顺序即优先级），
但四张牌不可能既是「非顺子的同花」又是顺子（两者都成立就一定是同花顺，而它排在前面先命中），
所以这条排序不会误判。凑不出牌型的线**不消除**、留在盘面上占格。
判定按分值从高到低取第一条成立的（`COMBOS` 数组的顺序就是优先级）。

**一次落子凑成多条线时只算分最高的那条**（横向 / 纵向 / 斜向都算）：先取所有成立线里的最高分，
再挑出分数等于最高分的那些 —— 只有**最高分并列**（两条、三条或全部一样）时才一起消除并累加分数，
否则分数低的那几条**原样留在盘上**。实现就是 `settle()` 里的
`const taken = hits.filter(h => h.combo.score === top)`（`top = Math.max(...)`）。
实测：横 300 / 竖 50 → 只消横线（竖线那几张留着）；横 300 / 竖 300 → 两条同消、+600；
横 300 / 竖 300 / 斜 四条 1000 → 只消斜线、+1000。

**Joker 是炼金模式的特殊牌**（发牌概率见 `board.js` 的 `RATE`，只占 8%），按德州扑克的规矩渲染
（`num=14` + 花色区色：黑 Joker 当 ♠、红 Joker 当 ♥，`CardItem` 自带 `card-joker` 样式与头像图标）：
黑色的只能当 ♠/♣、红色的只能当 ♥/♦，所以一黑一红永远凑不出同花；两种 Joker 各只有一张。
**棋盘上永远不会出现两张一模一样的牌**：`createDealer` 从一副 52 张的牌靴里抽，抽之前把
「棋盘 + 手牌 + 预览 + 还没翻到的牌堆」的 key 收进 `used`，牌靴抽空重洗时也排除这些 key。

### 炸金花闯关（3×3）

3×3 棋盘（9 格）、**8 条线** = 3 行 + 3 列 + 2 条对角线，每条 3 张。牌用标准 **52 张**（无 Joker），
所以不会重复；手里一次一张，面板上还能看到接下来的两张。

- 点空格放牌；**点已经有牌的格子，会用手上这张替换掉它**（原来那张弃掉，同样消耗一张手牌）——
  和麻将英雄一样，所以棋盘放满不是死局。
- 三条牌型（`ZJH_COMBOS`，按分值从高到低）：

| 牌型 | 分数 | 说明 |
| --- | --- | --- |
| 豹子 | 1000 | 三张同点数 |
| 同花顺 | 800 | 同花色且点数连续（A23 / QKA 都算）|
| 同花 | 500 | 三张同花色、不连续 |
| 顺子 | 400 | 点数连续、花色不同 |
| 一对 | 200 | 两张同点数 + 任意第三张 |
| 散牌 | 0 | 不计分、不消除 |

- **多消加分**：一次落子凑成的**所有**线全部计分（不是只算最高那条），再从第 2 组起每组加
  `zjhComboBonus = 200`；三组就是 +400。
- **连击加分**：连续每次消除算一连，从第 2 连起每连加 `zjhChainBonus = 100`；有一手没消掉就归零。
  连击数存进存档（`chain`），浮字会显示「🔥 连击 ×N」。
- 失败条件只有「牌用完了、分数还没到目标」；棋盘满可以继续替换。

**两种模式都是关卡制**：在牌用完前达到目标分即过关（不必用完牌堆）；牌用尽还没达标就失败。
「新游戏」会清掉**当前模式**的关卡与最高关卡记录，另一种模式不受影响。

**得分庆祝照抄消消乐**：**每一次得分**都在棋盘中央弹出「牌型名 + 本次得分」的浮字（`.celebrate`，
`celebrate-pop` 0.95s 播完即消失）；**得分 ≥ 300** 时再加三样 —— 棋盘**震一下**（`.board.shaking` 播
`board-shake`）+ 外圈**闪一圈光**（`.board.celebrating` 播 `board-celebrate`，与震动一个动 transform、
一个动 box-shadow，同时发生不互相顶掉）+ `burstConfetti(tier)` 撒一把花。**低于 300 分只有浮字**，
不震屏、不闪光、不撒花。档位按**本次得分**分：≥1000 → `tier-3`、≥500 → `tier-2`、其余 `tier-1`。
**过关仍是 `confetti()`**（共用的大撒花，与消消乐同一份实现）。

**结算层只等得分浮字露一下脸（0.5s），不等它整条生命周期**：`settle()` 末尾不直接 `checkEnd()`，而是延迟
`RESULT_DELAY_MS`（来自共用 `src/shared/resultDelay.js`）后再结算，`checkEnd()` 开头有 `phase !== PLAY`
提前返回防止重复撒花。**这里参照的是消消乐**：它的 `winLevel()` 是直接 `phase.value = WON` + `confetti()`、
根本不等待浮字，所以浮字还没飞完结算层就铺上来了。早先版本等的是浮字存活时长 `celebrateLife(tier)`
（1.32~1.76s），玩家能明显感觉到停顿；实测现在从落子到结算层约 0.72s（0.5s 停留 + 落子动画）。
没有得分浮字时立即结算。

## 关卡曲线与难度标定

### 炼金（4×4）

`board.js` 的 `levelConfig(level)`：**第 1 关 24 张牌、800 分过关；每关 +1 张牌、过关分 +50；
每 10 的倍数关再多 +100**（即 `deck = 24 + (lv-1)`、`target = 800 + (lv-1)×50 + ⌊lv/10⌋×100`）。
牌堆**不封顶**：棋盘只有 16 格，牌堆继续变长本身就是难度。实测第 10 关 33 张 / 1350 分、
第 20 关 43 张 / 1950 分。

数值是**离线标定**的：写了个「贪心模拟玩家」（只看一步 + 潜力启发，会优先吃立刻能得分的格子，
没得分时选「同行列同花/同点最多的格子」），每关跑 400 局取分布。当前曲线下它的表现：

| 关卡 | 牌数 | 目标分 | 贪心通过率 | p50 | p90 | 最高 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 24 | 800 | 20% | 500 | 1000 | 1900 |
| 5 | 28 | 1000 | 15% | 700 | 1100 | 1950 |
| 10 | 33 | 1350 | 7% | 800 | 1250 | 2050 |
| 20 | 43 | 1950 | 5% | 1000 | 1650 | 3100 |

**这个贪心是本作人类玩家的「下界」，不是上界**：它只看一步、不会为了同花顺主动铺线，
而人类会规划整条线，实际分数高得多。所以标定时**不能**把目标分放在贪心的低分位上。

### 炸金花（3×3）

`board.js` 的 `zjhLevelConfig(level)`：**第 1 关 18 张牌、1200 分过关；每关 +1 张牌、过关分 +100；
逢 5 的整数关那一档多 +2 张牌**（`deck = 18 + (lv-1) + ⌊lv/5⌋`，封顶 **52**；`target = 1200 + (lv-1)×100`）。
第 5 关 23 张 / 1600 分、第 10 关 29 张 / 2100 分、第 20 关 41 张 / 3100 分、第 30 关 52 张 / 4100 分；
之后牌数封顶 52，只有目标分继续涨。

同一个贪心（会把替换也纳入候选，选立刻得分最高的格子；每关 300 局）的分布：

| 关卡 | 牌数 | 目标分 | 贪心通过率 | p50 |
| --- | --- | --- | --- | --- |
| 1 | 18 | 1200 | 88% | 1300 |
| 5 | 23 | 1600 | 90% | 1700 |
| 10 | 29 | 2100 | 90% | 2200 |
| 20 | 41 | 3100 | 94% | 3200 |
| 30 | 52 | 4100 | 92% | 4200 |
| 40 | 52 | 5100 | 52% | 5100 |

前 30 关偏宽松（会规划的人类更稳），30 关之后牌数封顶、目标继续涨，才开始明显变难。
模拟脚本只做临时标定，不入库；改分值 / 奖励 / 目标分时应重新跑一遍。

## 实现要点

- 纯逻辑全在 `board.js`，按模式分两套：
  - 炼金：`SIZE=4`、`CELLS=16`、`COMBOS`、`scoringLines`、`createDealer`、`isStuck`、`levelConfig`。
  - 炸金花：`SIZE3=3`、`CELLS3=9`、`LINES3`（8 条线）、`ZJH_COMBOS`、`evaluateTrio`、`scoringLines3`、
    `createZjhDeck`（标准 52 张、无 Joker）、`zjhComboBonus` / `zjhChainBonus`、`zjhLevelConfig`。
  - `evaluateTrio` 的三张判定顺序：豹子 > 同花顺 > 同花 > 顺子 > 一对；散牌返回 `null`（不计分、不消除）。
    A 可当 1（A23）也可接 K（QKA）。
- 组件用 `size` / `cells` 两个 computed 同时支持 4×4 与 3×3：棋盘格数、`grid-template-columns: repeat(var(--size), …)`、
  `cellAt()`、`computeMetrics()`、`dealDelay()`、`startDeal()` 都跟着它们走。切换模式必须重算一次 `computeMetrics()`。
- 发牌：`pile` + `cursor`，手牌 = `pile[cursor]`、预览 = 后两张。两种模式都在 `startLevel()` 里**一次性发完整副牌**：
  - 炼金用 `createDealer()` 逐张抽并累计 `used`，避免重复牌 / 双 Joker；
  - 炸金花用 `createZjhDeck()` 一副 52 张洗好后截取 `deck` 张（牌数在 `zjhLevelConfig` 里封顶 52）。
  - 两种模式都是牌用完还没到目标分就失败；炸金花棋盘满不是死局（可以替换）。
- **炸金花计分**在 `settle()` 里分支：炼金仍「只取最高分线，并列才一起消」；炸金花取**所有**成立的线，
  基础分相加后再加 `zjhComboBonus(组数)` 与 `zjhChainBonus(chain)`。连击 `chain` 是局面的一部分：
  消除时 +1、没消掉归零，写进 `state.chain`；浮字多显示「连消 n 组」「🔥 连击 ×N」两行。
- **替换**：`onCellClick` / `placeByClick` / `placeByDrag` 只拦炼金模式的非空格；炸金花允许覆盖已有牌，
  `commitPlacement()` 直接写该格并 `advanceHand()`，所以替换同样消耗一张手牌。已填格子加 `.actable` 提示可点。
- 统计条两种模式都是四格「🏁 关卡 / 🃏 剩余 / ✨ 得分 / 🎯 目标」，底部一直是 `score/config.target` 进度条。
  `bestLevel` 是当前模式的最高关卡记录（`best_1` / `best_2`），不占统计格。
- **候选牌不画外部容器**：手牌与下两张都只是「占位 + 居中」的 44×66 槽位，没有底色也没有描边
  （牌直接立在面板上）。手牌**固定 44px 宽、高度等比 66**；下两张用**同一张牌**做 `transform: scale(0.8)` / `scale(0.6)`
  （不是改 `--width`），槽位仍是 44×66 以便排版；`.preview` 的 `gap` 只有 2px。
- **棋盘画出网格**：格位宽高就是牌的尺寸（2:3），每格常驻 `1px solid var(--tile-border-color)` 描边 +
  一层 `rgb(255 255 255 / 8%)` 半透明白底；里面的牌四周各内缩 3px（`cardVars(cw - 6, ch - 6)`）。
  手上有牌可放时空格换主色虚线（`.placeable`）；炸金花的已有牌格加 `.actable`（hover 实线主色 + 光环）。
- 牌面复用 `CardItem`：内联 `cardVars(w)` 传尺寸变量，**宽高都取「格子 − 2」**。Joker 的 `.card-num` 需要时单独覆盖。
- **点击放置 = 飞行动画**：`placeByClick` 先把牌落进目标格、给那一格加 `.incoming`（整层隐身），
  再渲染 `.fly-card` 浮牌飞过去，落地后才 `settle()`；拖拽直接落子。飞行期间 `busy` 锁输入。
- 跟手拖动：`pointerdown` 在手牌上 → 窗口级 `pointermove/pointerup` → `cellAt(x, y)` 反推格子。
  `.wrapper { touch-action: none }`（此页纵向不溢出）。
- 结算时**局面立刻清空**、被消的牌进 `clearing` 浮影层播 `blink-clear`；`settle()` 末尾统一
  `checkEnd()` + `save()`。
- 尺寸 `metrics`：宽度按 `min(innerWidth, 480) − 32 − 16` 反推，高度按 `innerHeight − 262` 再按 2:3 回算；
  格宽上限 **4×4 为 84、3×3 为 104**。实测 375×667 的 3×3 格位 83×125，390×844 的 4×4 格位 80×119。
- **操作区不能写死 `height: var(--row-height)`**：左边是 2:3 的扑克牌，写死行高会让手牌上下溢出、
  盖住统计卡。这里用 `height: auto; min-height: var(--row-height)`。

## 坑

1. **消除必须先清局面、再播动画**：被消掉的 4 格要**立刻**从 `board` 里清掉，动画交给单独一层
   `clearing`（浮影 + `blink-clear`：透明度和亮度的两轮明暗后再消失）。第一版先播动画、260ms 后才清格子，
   那段窗口里手牌已经前进、玩家可以再落一子 —— `scoringLines` 会把**同 1 条线再算一遍**，直接重复计分。
2. **`nextTick` 忘了 import**（本轮踩的）：`flyTo` 里用了 `nextTick` 但 `vue` 的 import 没带上它，
   `vite build` 不报错（运行时的全局查找），而 `flyTo` 会在 `flying.value = {...}` **之后**抛 ReferenceError
   整段中断 —— 表现是「浮牌出现了但一动不动、落点永远隐身、结算和存档永远不发生」，而且异常被 Vue 的
   事件处理器吞掉，CDP 的 `Runtime.exceptionThrown` / `Log` 里什么都看不到（脚本里表现为「点了没反应」）。
   **排查手段**：逐时间点探测 DOM 状态（`.fly-card` 的内联 transform、`.incoming` 是否复位、存档是否更新），
   能直接定位到「执行到哪一行断了」。
3. **建牌堆时 `used` 集合不能用 `Array.from(() => freshCard())`**：`pile.value` 要等整个数组建完才赋值，
   于是每一张牌看到的都是**空的** used 集合 —— 两个黑 Joker（或任何重复牌）都可能同时进牌堆，
   违反「棋盘上不能出现两张一模一样的牌」。改成用局部数组**逐张抽、逐张把 `cardKey` 记进 used**，
   最后再整体赋给 `pile.value`。
4. **旧版本的模式 2 是「无尽」，`best_2` 存的是最高分**：直接换成炸金花关卡模式后，旧的高分会被
   误当成「最高关卡」。`migrateEndlessStorage()` 用「`level_2` 是否存在」区分新旧：没有 `level_2` 就
   删掉旧的 `best_2` 与 `state_2`（老无尽局面是 16 格，本来也过不了 `restore()` 的 9 格校验），
   从第 1 关重新开始；之后 `level_2` 一旦写入就不再迁移。
5. **恢复存档 / 切模式时要补判一次结束**：`checkEnd()` 平时只在落子后跑，存档若正好停在「满盘」或
   「已达标」的一步上，玩家回来后永远等不到结算层。`onMounted` 的 restore 分支与 `toggleMode` 里都补了一次，
   并且传 `checkEnd(true)` **静默**执行 —— 否则每次退出再进入都会重播一次过关撒花。
   验证手法：`document.querySelectorAll('canvas').length`，1 = 只有全站粒子背景、2 = canvas-confetti 又建了一块，
   据此可区分「真的又撒花了」和「只是把结算层补出来」。
6. **改文案/样式后必须确认构建真的过了**：验证脚本里写成 `vite build | tail -1 && vite preview` 时，
   管道让退出码变成 `tail` 的（恒为 0），构建失败也照样启动 preview —— 于是会拿着**上一版 dist** 验证，
   得到一组看起来「符合预期」的旧数据。本轮就踩了：脚本删 `@keyframes toast-in` 时多留了一个 `}`，
   Sass 报 `unmatched "}"` 构建失败，而验证结果全是旧行为。改成 `vite build > /tmp/b.log 2>&1; echo $?`
   并检查日志，才定位到。

## 恢复记录时的铺牌波浪

`restore()` 末尾调 `startDeal()`：棋盘上的牌加 `:class="{ dealt: dealing }"` 与
`animation-delay = (行 + 列) × 60ms`，由 `card-wave` 关键帧（从左上方滑入 + 放大）逐张出现；
`:key` 里带上 `dealSeq` 保证元素重建、动画能重播；`onUnmounted` 里清掉 `dealTimer`。
延迟公式用 `size.value`，所以 4×4 最大 360ms、3×3 最大 240ms。**只影响恢复**：新开一局棋盘本来是空的。

实测恢复一份 4 张牌的 4×4 存档：`5@205ms(delay .12s) → 6@271ms(.18s) = 9@271ms → 10@321ms(.24s)`，
跨度 116ms，延迟与 `(行+列)×60` 完全吻合。

坑：把 `:class` 传给 `CardItem` 时它是**落在组件根元素上**的（`.card-wrapper`），
所以样式要写成 `.cell .dealt`（父组件的 scoped 属性会同时打在子组件根节点上）；
实测类名最终是 `card-wrapper dealt`、动画名 `card-wave-*`。

## 存档（localStorage）

- `__poker_alchemy__mode`：1 炼金（4×4）/ 2 炸金花（3×3）；切模式时保留为偏好
- `__poker_alchemy__state` / `__poker_alchemy__state_2`：两种模式各一份局面
  `{ mode, level, score, chain, phase, board, pile, cursor }`；
  炼金棋盘 16 格、炸金花 9 格，牌用 `{k:'c',r,s}` 或 `{k:'jb'|'jr'}` 紧凑编码，恢复时重新分配 id。
  炸金花没有 Joker，`chain` 是连击数；老存档没有 `chain` 时按 0。
- `__poker_alchemy__level` / `__poker_alchemy__level_2`：两种模式各自的当前关卡
- `__poker_alchemy__best_1` / `__poker_alchemy__best_2`：两种模式各自**最高关卡**（都是关卡模式，不再有最高分）
- `__poker_alchemy__help_showed`：帮助弹窗是否弹过（注册表 `helpKey`）
- 连点标题 5 次：`clearGameStorage('__poker_alchemy__')` 清掉两种模式的关卡 / 最高关卡 / 局面，
  只保留 `mode` 与 help 偏好，然后按当前模式回第 1 关。
- **旧存档迁移**：旧版 `best_2` 是无尽模式的最高分，且没有 `level_2`。加载到模式 2 / 切到模式 2 时，
  若 `level_2` 不存在，就删除 `best_2` 与 `state_2`、从第 1 关重开（见「坑」第 4 条）。

## 界面约定

- 顶栏「游戏特色按钮」：模式切换（`i-mdi-trophy-variant-outline` ↔ `i-mdi-cards-playing-outline`，
  `TopHeader` 默认插槽，`title` 用 `modeTip`）。
- **统计卡两种模式都是四格**：从左到右 **🏁 关卡 / 🃏 剩余 / ✨ 得分 / 🎯 目标**；
  `.score-area.four .stat-value` 降到 18px，避免后期四位数目标分被挤出去。最高关卡只是记录，不占统计格。
- 统计卡底部一直有本关进度条（3px、贴底、主色填充，抄连连看那份）：宽度 = `score / cfg.target`；
  `.score-area` 要 `position: relative; overflow: hidden`。
- 操作区左侧是手牌（44×66）+ 接下来两张（同款牌 `scale(0.8)` / `scale(0.6)`），三者都没有外部底色容器；
  `.opt-half` 比例 `1.6 : 1.2`，右侧只有「🎮 新游戏」（走共用 `ConfirmDialog` 的默认文案与三个按钮）。
- 得分浮字 `.celebrate` 绝对定位在 `.game-area` 正中：主色底 + 白字 + `--celebrate-glow`，
  `celebrate-pop` 0.95s 播完即消失，`pointer-events: none`。炸金花多消 / 连击时额外显示
  `.celebrate-groups`（连消 n 组）与 `.celebrate-chain`（🔥 连击 ×N）两行。
- 结算浮层：胜利是「🔄 重玩本关（左）/ ➡️ 下一关（右）」，失败只有「🔄 重玩本关」；
  **两个按钮都用主色绿 `--primary-bg`**。
- 棋盘是常驻网格格位（描边 + 半透明底），牌嵌在格位里四周各留 3px；4×4 / 3×3 的列数由 `--size` 控制。
  空格在有手牌时可落子（`.placeable` 虚线）；炸金花的已有牌格加 `.actable`，鼠标悬停显示实线主色 + 光环。
- 棋盘套 `.dot-board`（点阵底纹来自 `App.vue` 的全局类，别再写 `background: var(--board-bg)`）。

## 候选区与格子高亮（本轮补充）

- **候选区主次**：当前牌 `.card-slot.current` 套一圈主色描边（`outline: 2px solid var(--primary-bg)`，
  `outline-offset: 1px`），后面两张 `.card-slot.next` 压到 `opacity: 0.55`；缩放 `PREVIEW_SCALE = [0.8, 0.6]`
  （实测渲染宽 44 → 35 → 26，相对 0.8 / 0.6）。
- **格内那张牌要真正居中**：`CardItem` 的 `.card` 是「content-box + 1px 描边」且 `position: absolute;
  left/top: 0`，外框比它自己的 wrapper 大 2px、多出来的全落在右下 —— 实测格内是「左 3px / 右 1px、
  上 3px / 下 1px」。补一条 `.board .cell :deep(.card) { left: -1px; top: -1px }` 往左上各挪 1px 之后是
  3 / 3 / 3 / 3，完全居中（候选区的槽位牌与槽等宽，**不能**跟着挪，所以规则只写在 `.board .cell` 下）。
- **点击格子给实线高亮**：`onCellClick` 里记 `flashCell` + 450ms 后自动清掉，`.cell.flash` 把虚线/无边框
  换成实线主色 + `box-shadow: 0 0 0 2px`（实测点击后 `solid rgb(35,128,78)`，450ms 后回到常态）。
- **踩到的特异性坑**：那条 `.flash` 规则**不能**只写 `.board .cell.flash`。格子基础规则嵌在
  `.wrapper > .game-area > .board > .cell` 里，编译出来是 `.wrapper .game-area .board .cell[data-v]`
  （0,5,0），而 `.board .cell.flash[data-v]` 只有 0,4,0 —— 特异性更低，基础规则里那句
  `border: 1px solid var(--tile-border-color)`（简写，连颜色一起覆盖）直接赢下来。
  症状很有迷惑性：`box-shadow` 生效了（基础规则没设它）、`border-style: solid` 看着也"对"
  （基础本来就是 solid），**只有边框色没变**。排查手法是在页内遍历 `document.styleSheets`、
  把命中该元素且声明里带 `border` 的规则全列出来对比特异性。修法是把选择器提到同级：
  `.wrapper .game-area .board .cell.flash`。

