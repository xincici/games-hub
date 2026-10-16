# 开发约定（`docs/CONVENTIONS.md`）

> 从根 [`AGENTS.md`](../AGENTS.md) 拆出来的**跨游戏硬约定**。**动任何游戏的代码之前先扫一遍**；
> 下面的「开工前逐条核对」是从正文提炼的勾选清单，正文里有每条的原因与实测数据。

## 开工前逐条核对（新游戏 / 改旧游戏都过一遍）

- [ ] **交互与结算**：按钮文案 key / 配色 / 位置顺序、统计条项目顺序、结算层内容与按钮、二次确认、清记录 —— 一律按
  **[「交互与结算的统一规范」](#交互与结算的统一规范按钮--统计条--结算层--二次确认)** 那一节来，别照抄隔壁游戏（它是几代改动的叠加，坑都在那节里）。自检：`node scripts/check-ui.mjs`。
- [ ] **图标**：attributify 写法 `<i i-carbon-sun />`；**首页图标必须同步加 `uno.config.ts` 的 `safelist`**（运行时数据 UnoCSS 提取不到）。
- [ ] **颜色**：走 `App.vue` 的 CSS 变量，不硬编码需要随主题变的颜色；**按钮上文字的对比度要算**（项目要求 ≥4.5:1，白字压橙 5.18:1、深字压黄 9.89:1，黄底白字只有 1.61:1 不行）。
- [ ] **尺寸写法**：**嵌套容器里不要用 `%` 算尺寸** —— 一个把 4 张牌包起来的 div，里面 `calc(100% / 7)` 的 `%` 是按**这个 div 自身宽度**解析的，会塌成几像素（单人麻将杠组实测 7px 宽）；要量出像素值写回去（`ResizeObserver`）或用 `aspect-ratio`。**本身就是 flex item 的元素别用 `--h: 100%`**（循环依赖 + 行默认 `stretch`，会被纵向拉满，实测 26px 宽被拉成 26×71）。
- [ ] **布局**：最小兼容 **375×667**；首张卡片 `margin-top: 64px`。**但如果页面第一个「在流内」的元素就是它**（顶栏是 fixed、不在流内，所以多数游戏都是这种情况），这个 margin 会**塌陷出 `#app`**、整页恒多 64px 可滚动 —— 此时写成 `.wrapper` 的 `padding-top`（**Emoji 镜像、24 点**都是这么办的）。判「能不能滚」只认 `window.scrollTo(0, 9999)` + `scrollY`。
- [ ] **切页过渡**：`.app-open/close-enter-active` 必须 `box-sizing: border-box`（否则过渡期间整页宽 100%+32px）。
- [ ] **emoji 游戏视觉语言**：`.card` / `.game-icon` / `.dot-board` / `.divider` / `.stat-*` / `.result` 的写法与尺寸（含 `.game-icon` 的两个配色特例、结算浮层必须 `box-sizing: border-box`）。
- [ ] **`.card` / `.divider` / `.game-icon` 必须在本游戏 scoped 块里各写一份**（全局只有变量、没有这三个类规则）。新游戏**直接抄 [`NEW-GAME.md`](NEW-GAME.md) 的样式骨架**，别凭记忆写；写完量一次 `getComputedStyle`：`.card` 的底色不能是 `rgba(0,0,0,0)`、`.game-icon` 应是 `rgb(35,128,78)`、`.divider` 应是 `1px × 24px`。漏写的表现是「分数区/按钮区像裸文本」「按钮是浏览器默认灰」「统计条上看不到分隔线」。
- [ ] **每个游戏的 `.wrapper` 必须有 `max-width: var(--max-width)` + `margin: 0 auto` + `box-sizing: border-box`**：
  少前两条 → 宽屏上整页被拉满（Emoji 镜像漏了，玩家报「所有区域长度都拉长了」）；少第三条 →
  `max-width` 限的是内容盒，再加左右 16px 内边距就变成 512 而不是 480（同一次修复里踩到）。
- [ ] **`.wrapper` 的内边距写完整简写**（`padding: 64px 16px 24px`）：只写 `padding-top` 会把左右清零 → **所有卡片贴到屏幕两边**。容器同时要 `box-sizing: border-box` 与 `color: var(--text-color)`；**别写 `color: var(--card-color)`**（它是 `#fff`，浅色主题下就是白底白字，数字直接看不见）。
- [ ] **用 `var(--x)` 之前确认这个变量真的存在**（`App.vue` 里 `grep` 一下）：写错名字 `var()` 解析为**空**，表现为「圆角/阴影/颜色没生效」而不是报错 —— 例如 `--radius-card` 根本不存在，圆角要用 `--card-radius`。
- [ ] **共享逻辑**：`src/shared/` 已有的一律复用（`confetti` / `CountTimer` / `ConfirmDialog` / `Hearts` / `resumeCountdown` / `resultDelay`），不复制第二份。
- [ ] **手势**：一律 Pointer Events + 手势区 `touch-action: none`（`touchstart` 只认触摸）；加之前先量这一页会不会溢出。
- [ ] **存档**：沿用该游戏原有前缀；**每个 key 都要写进它自己的分册**；清记录彩蛋靠注册表的 `recordsPrefix` + 难度范围。
- [ ] **帮助文案**：只写玩法 / 分数 / 胜负条件，**不写实现细节**，也不写彩蛋。
- [ ] **文案**：中英双语都要加（`games/<id>/i18n.js`）。
- [ ] **数字**：文档里的计数一律用**阿拉伯数字**（「22 个游戏」「5 个闯关游戏」），别写「二十二」这类汉字数字 —— 改起来麻烦、脚本还得转换，自检会拦。
- [ ] **玩法文案的位置**：玩法的完整介绍只写在 `src/games/<id>/README.md`（面向玩家）；根 `README.md` 只留「名字 + 一句话 + 链接」；实现细节写在分册 `AGENTS.md`。三处不要互相复制。
- [ ] **改完必做**：`yarn build` + `scripts/smoke.mjs`（375×667 与 390×844 两档）；同步 README 与相关分册。
- [ ] **收尾**：按路径 `git add`（别 `git add -A`），只在用户说「commit & push」时提交。

---

## 约定

- 图标用 attributify 写法：`<i i-carbon-sun />`（不是 class）。首页图标来自运行时数据，UnoCSS 静态提取不到，已列入 `uno.config.ts` 的 `safelist`——**新增首页图标必须同步加 safelist**。
- 主题色一律走 `src/App.vue` 里 `body` / `body.dark` 的 CSS 变量（`--bg-color`、`--card-bg-color`、`--primary-bg`、`--win-color`、`--lose-color` 等，为四个原项目变量名的并集），不要硬编码需要响应深色模式的颜色。
- 布局 mobile-first，内容最大宽度 480px（`--max-width`）。**最小兼容尺寸是 375×667（iPhone SE）**，
  更小的屏幕（320×568 之类）不再作为验收标准 —— 历史上在 320 下量到的溢出/滚动数据只作参考，
  不必为它牺牲 375 以上的排版（用户明确过这一点）。新增页面与改动布局时，验收看 **375×667 与 390×844**
  两档：不出现横向滚动条、纵向不滚动（能滚的游戏除外，见各分册的「已知情况」）。各游戏首张卡片（`.score-area`，点击游戏叫 `.score-card`、1A2B 是 `.opt-area`）的 `margin-top` 统一为 **64px**（**Emoji 镜像例外**：它把这 64px 写成 `.wrapper` 的 `padding-top` —— `.wrapper` 没有上 padding 时，这个 margin 会塌陷到 `#app` 之外，而 `#app` 有 `min-height: 100dvh`，整页就会恒多出 64px 可滚动高度；判断能否滚动要用 `window.scrollTo(0, 9999)` 看 `scrollY`，`body.scrollHeight` 看不出来）（内容区因此从 240px 开始，改这个值要连带留意各游戏 JS 里算棋盘尺寸用的视口留白常量，它们按 262 留的余量，偏保守不会溢出）。
- 公共逻辑放 `src/shared/`（如 `confetti.js` 撒花动画、`CountTimer.vue` 计时器），各游戏直接 `import ... from '@/shared/xxx'`，不要再复制一份。
- **切页过渡的 `.app-open-enter-active` / `.app-close-enter-active` 必须带 `box-sizing: border-box`**（`App.vue`）。
  这两条给了 `position: absolute; width: 100%`，而各游戏的 `.wrapper` 都带左右各 16px 内边距 ——
  默认 content-box 会算成「100% + 32px」：切页的那 0.3s 里整页比视口宽 32px（横向滚动条闪现），
  而且内宽是「视口宽」、过渡一结束变回「视口宽 − 32」，看起来就是**「先横向超出视窗、再缩短恢复」的跳动**。
  实测 320×568 下超宽 12 帧、最多 32px，**每个游戏都一样**（数独与 Emoji 镜像数字完全相同），
  补上 `box-sizing` 后同样的脚本跑 200 帧、溢出 0 帧。排查这类问题的办法：`Page.addScriptToEvaluateOnNewDocument`
  里逐帧记 `documentElement.scrollWidth` 与 `innerWidth`，超宽帧顺手把 `getBoundingClientRect().right > innerWidth`
  的元素及其 `offsetWidth` / `transform` 打出来 —— 一眼就能看出是布局宽度问题还是过渡的 transform 问题。
- **棋盘点阵底纹**：`App.vue` 里的全局类 `.dot-board`（`background-color: var(--board-bg)` + 10px 间距的 `radial-gradient` 点阵，点色 `--board-dot` 浅色 0.18 / 深色 0.08 透明度，对比约 1.17:1，很淡不抢牌）。**各 emoji 游戏的游戏区都套它**——对对碰 `.board`、连连看 `.board`、侦探 `.board-frame`、猎手 `.stage-frame` 与 `.candidate-area`、大师 `.board-wrap`、消消乐 `.board-frame`、排序 `.board`、下坠 `.board`、滑行 `.board`；数字类游戏（2048 / Threes）不用。用了这个类**不要再写 `background: var(--board-bg)`**：简写会把 `background-image` 清掉。
- **emoji 游戏的统一视觉语言**（对对碰 / 连连看 / 侦探 / 猎手 / 消消乐 / 大师 / 排序 / 镜像，新增 emoji 游戏请照抄）：
  - 棋子 / 牌面：圆角 `var(--radius-tile)` + `1px solid var(--tile-border-color)` 描边 + `var(--shadow-soft)` 软阴影 + `box-sizing: border-box`；**Emoji 大师例外**：它的卡片是立体的（正面 + 底部厚度 + 落地阴影，用本地的 `card-3d` mixin，见大师分册的「立体卡片」一节），翻牌类另加 `transform-style: preserve-3d` + `backface-visibility: hidden`，翻面 `transition: transform 0.45s ease-in-out`
  - 牌背：底色 `var(--primary-bg)` + `#fff` 图标，图标统一取本游戏在首页的图标（`gameConfig(id).icon`，对对碰 / 侦探 / 猎手都是这么做的），图标字号随格子走
  - 面板 `.card`：`--card-bg-color` + `--card-radius` + `--card-shadow`；统计条高 `var(--row-height)`、操作区 `margin: var(--row-gap) 0` + `height: var(--row-height)`；`.stat-label` 12px、`.stat-value` 22px 粗体
  - 主按钮 `.game-icon`：粗体、`--primary-bg` 底 + 白字、圆角 `--radius-tile`。**两个特例**（都写成
    `.game-icon.xxx:not(:disabled)`，禁用时仍走各自 `&:disabled` 的灰，实测 `#aaa`）：**上帝模式按钮**
    （点击游戏 / 雀圣）可点击时用 `--god-bg`（橙 `#c2410c`，白字 5.18:1）、**暂停按钮**（贪吃蛇 / Emoji 下坠）
    可点击时用 `--pause-bg`（黄 `#ffc300`）**配深色字 `--pause-fg`（`#222`，9.89:1）** ——
    **黄底不能配白字**（只有 1.61:1），所以这两个按钮的文字色也一起覆盖。这些变量在 `App.vue` 的两套主题里同值
    （和 `--primary-bg` 一样），因为它们压在按钮自己的底色上、与页面主题无关；**挑这类颜色必须算对比度** ——
    更亮的橙 `#ea580c` 只有 3.56:1、`#f59e0b` 只有 2.15:1，黄底白字 1.61:1，都不达标。
    尺寸默认 `padding: 8px 16px` + 14px，但**贪吃蛇 / 点击 / 数独 / 侦探 / 猎手 / 对对碰 / 下坠 这七个是 `padding: 8px 12px` + 13px**（按钮更窄，320 宽下三格操作区也放得下），其余游戏仍按默认值 —— 改尺寸时这两组要分别对待
  - 操作区左侧那格「盘面信息 / 难度」文字（`difficulty-value` / `level-note` / `board-info`）统一 **14px + `--muted-color` + `font-weight: 400`**（10 个游戏一致：贪吃蛇 / 数独 / 侦探 / 猎手 / 滑行 / 消消乐 / 连连看 / 大师 / 对对碰 / 排序；浅色主题对白卡 5.43:1、深色对深卡 5.56:1）。唯一例外是大师结算浮层里那个同名 `.level-note`（`.result` 内、跟随浮层自己的 `--text-color` + 0.75 透明）
  - **「选对了」的反馈动画**（侦探 `revealed` / 猎手 `found`）：除高亮外再播 `pick-right-pop`（弹一下 1 → 1.18 → 0.96 → 1.04 → 1）+ `pick-right-ring`（绿色光环扩散淡出），关键帧在 `App.vue`。两个坑：**只能挂正面那层 `.face`**（外层 `.card-flip` / `.cand-flip` 的 `transform` 是翻面状态，动画会顶掉它、牌翻回背面）；**只能由「本次点击」的瞬时标记驱动**（侦探 `rightIdx` / 猎手 `justFound`，`clearTimers` 与还原存档时复位），挂在会存档的 `revealed` / `found` 上重进或切模式会重播
  - 计时 / 倒计时文字统一 **14px**：共用 `CountTimer` 的 `.timer`（数独 / 侦探 / 猎手 / 下坠显示它，连连看 / 滑行 `show=false` 不显示）与对对碰操作区里的 `.time-note`（观察倒计时 / 操作倒计时）
  - 难度加减区（点击 / 数字迷宫 / 贪吃蛇 / 数独）的 **`gap: 4px`**，且间距只由这一条负责 —— 数值那一格与 `.opt-icon` 的左右 `margin` 都要归零，否则会叠加（数字迷宫原来靠 `.opt-icon` 的 `margin: 0 4px` 撑间距）。其中**数字迷宫的结构与样式与点击游戏完全一致**：`.card.opt-card > .opt-item + .divider + .opt-item`、难度格 `flex: 3` 其余 `3.5`、数值类名 `.difficulty-num`（`min-width: 22px` / 18px 粗体）、`.opt-icon` 28×28 + `::after` 44×44 点击热区；贪吃蛇 / 数独仍用各自的 `.difficulty-wrapper` + `.difficulty-value`（贪吃蛇那个数值格已对齐点击游戏：`min-width: 22px` + `text-align: center`，数字位数变化时 +/− 按钮不会左右挪——实测难度 1→5 按钮 left 恒为 26 / 84）
  - 竖分隔线 `.divider`：`width: 1px; height: 24px; align-self: center; background: var(--border-color); opacity: 0.6`，**必须定义在 `.wrapper` 层级**（统计条与操作区共用同一个类）——嵌进 `.score-area` 里的话操作区那条就完全没有样式（下坠踩过：操作区的分隔线是 0 高、统计条那条又变成 60% 高且不透明）
  - 结算浮层 `.result`：`--mask-color` 底 + `--win-color` 字（失败态 `--lose-color`）、18px 粗体、`gap: 12px` + `padding: 12px`，大数字（`.final-time` / `.final-score`）28px。**浮层一定要写 `box-sizing: border-box`**：它靠「`width/height: 100%`（或 `inset: 0`）+ 内边距」贴合父容器，默认 content-box 会连内边距一起撑出去，比棋盘大一圈（12px × 2）——对对碰 / 侦探 / 猎手 / 大师都踩过这个坑（都已修）。另外浮层的尺寸完全跟父容器走，所以**父容器必须就是棋盘**：棋盘比 `.game-area` 窄的游戏（侦探的 `.board-frame` 是 `width: fit-content` 居中）要让 `.game-area` 一起收缩（`width: fit-content; margin: 0 auto`），否则浮层会比棋盘宽出左右各 23px
  - 这几项**别再写裸值**（72px / 16px / 8px 之类），改一处要七处一起改
- **复用扑克牌面（`games/poker/CardItem.vue`）的两个坑**（侦探 / 猎手 / 对对碰的扑克模式共用同一套做法）：
  ① `CardItem` 的 `.card` 是 `width: var(--width)` + **1px 描边且没写 `box-sizing: border-box`**，渲染出来比它自己的 `.card-wrapper` 宽 2px、高 2px；而 wrapper 又会被外层 `.face` 的 1px 边框挤窄并居中，牌按 `left: 0` 贴住 wrapper 左边 —— 多出来的那 2px 全跑到右侧，看起来就是「牌在格子 / 容器里偏右、没居中」。做法是：扑克模式的外框写 `border: 0 none`（不是只把 `border-color` 弄透明，那样 1px 的位置还占着）+ 传进去的 `--width` / `--height` 取「格子 − 2」+ 把 `.card-wrapper` 绝对定位到外框左上角（`position: absolute; left: 0; top: 0`），这样牌的外框正好等于格子、四边严丝合缝（实测牌的 `left/top` 偏移归零、容器四边留白相同）。**同一个坑还会咬高亮**：猎手把「找回 / 标错」画成牌外一圈时，第一版画在 `.card-wrapper` 上，结果光环左边露 3px、右边被牌盖掉 1px（wrapper 比牌窄 2px，而且 `.card` 在 wrapper 之后绘制，本来就会盖住它的光环），看着既偏又像被压在牌底下；改画在 `:deep(.card)`（正好等于格子大小、且是这一格里最上层）后才四边等宽、完整可见。
  ② 同一个坑在**扑克炼金术**里的表现不同：它是把牌放进棋盘格子并用 flex 居中，于是牌在格内偏右下
  （实测「左 3px / 右 1px、上 3px / 下 1px」），修法是给 `.board .cell :deep(.card)` 补
  `left: -1px; top: -1px`（候选区的槽位牌与槽等宽，不能一起挪）。
  ③ 给格子加「点击高亮」这类覆盖基础边框的样式时注意**特异性**：格子基础规则通常嵌在多层里
    （编译成 `.wrapper .game-area .board .cell[data-v]`，0,5,0），只写 `.board .cell.flash` 会被它压掉，
    且症状是「box-shadow 生效、边框色没变」——排查手段是页内遍历 `document.styleSheets` 列出命中的 border 规则。
  ④ 用 grid 摆牌时**行高必须跟着牌高走**（`grid-auto-rows: var(--cell-h, var(--cell))`）：漏掉这一条，行高还是按宽度算，2:3 的扑克牌每行只占 2/3 高度，表现是「行与行重叠 + 整块从容器底部溢出」（猎手候选区踩过，实测行高 50 而牌高 75）。
- **阶段提示条要占自己的空白带**（侦探 / 猎手共用同一套做法）：提示条原来是 `position: absolute; top: -14px` 贴在棋盘上边缘，棋盘一大（侦探 4×5、猎手 4×8）第一行牌就被压住。现在 `.game-area` 用 `padding-top: var(--tip-band)`（28px）留出带子、提示条落在带子内（`top: 2px`），牌区从带子下面开始 —— 实测提示条底边与牌顶间隙 3~5px、六种组合（两游戏 × 两种牌面 × 390/320 两档宽度）都不重叠、不滚动。这 28px 必须同时从 `metrics` 的高度预算里扣掉（`(innerHeight - 262 - TIP_BAND)`），否则最高难度会顶出屏幕。侦探的结算浮层也在 `.game-area` 里，所以它得写 `top: var(--tip-band); height: calc(100% - var(--tip-band))` 才能正好盖住棋盘（猎手的浮层在 `.candidate-area` 内，不受影响）。
- **全站粒子背景**：`shared/ParticleBackground.vue` 由 `App.vue` 挂在内容层（`.app-content`，z-index 1）之下，canvas 为 `fixed + z-index 0 + pointer-events: none`。
  它底部还有一条**装饰性过山车**（闭合回路：4 个高低不同的山坡 + 一个竖直回环 + 两端半圆回转 + 底边回程 + 支撑柱，
  小车按能量守恒 `v = √(2g·落差 + vMin²)` 跑，爬坡自然减速、俯冲加速，再封顶到 `vMax`）；
  颜色沿用同一套 `--particle-line`（轨道 α0.3 / 支撑柱 0.13 / 车厢 0.5），
  所以**改主题色时它会一起变**，不需要单独维护第二套颜色。它纯粹是背景，不参与任何交互。各页面根容器 `.wrapper` 的不透明底色被 `App.vue` 里的 `#app .wrapper { background: transparent }` 统一置空，改由 `body` 的 `--bg-color` 兜底，粒子才透得上来——**新增游戏不要给根容器或全屏元素加大面积不透明背景**（会挡住粒子）。粒子颜色走 `body` / `body.dark` 的 `--particle-dot`、`--particle-line` 变量（light 灰蓝、dark 淡蓝白），canvas 每帧读取并做 0.25s 缓动过渡。
- **页面滑动手势一律用 Pointer Events**（`pointerdown` / `pointermove` / `pointerup`）+ 手势区域内 `touch-action: none`。`touchstart/move/end` 是**只认触摸**的：PC 上拿鼠标怎么拖都不触发（装成桌面应用后更明显 —— 浏览器 / 窗口层会把整段手势当成滚页面或拖窗口收走，再补一个 `touchcancel`）。Threes、Emoji 消消乐、2048、贪吃蛇（转向）、数字迷宫（空白格跟手）都已按这套实现，并且都保留了原有的兜底操作（消消乐点两下换位、2048 / 数字迷宫方向键、数字迷宫摇杆按钮）。`touch-action: none` 只加在「真正拥有这个手势」的元素上：**先量这一页会不会溢出**——不溢出就加在整页 `.wrapper`（Threes / 2048 / 贪吃蛇），会溢出就加在棋盘那层（消消乐 `.board-frame`；数字迷宫 `.game-area`，最高难度 6 在 320×568 下 scrollH 590 > 568，整页 none 会把「滚下去看棋盘」一起吃掉）。
- **整副牌面优先裁图，并且拼成一张雪碧图**：需要成套牌面（麻将 / 扑克 / 塔罗之类）时，
  如果手上有现成的整副图，直接按网格裁下来用比 CSS 画省事得多。做法（3 个麻将游戏都在用）：
  - 裁图：按网格切、每格往里收 2px 去掉相邻牌的边线，**直接从原图拼成一张**再存 webp
    （只压一次，别拿裁好的小图再拼）。裁完**先拼一张联络表截图肉眼核对**：网格顺序不一定按直觉
    （那张图的第 4 行是「北白南中發東西…」而不是东南西北中發白），原图还可能有水印格。
  - 现在的成品：`src/shared/mahjong-tiles.webp`（7 列 × **7** 行、每格 131×168，一张约 256KB）
    + `src/shared/mahjongTiles.js`（格子表、`spriteVars()`、长宽比 `TILE_RATIO = 1.282`）。
    前 5 行是 34 张牌面（与原图逐像素一致），**第 6~7 行是 8 张花牌**（赌神用的万能牌，
    索引 **34~41** —— 34 张牌面占 0~33，所以 `f1` 就是 34，别再写成 35 起）。
    麻将英雄只用筒、雀圣用整副、麻将传奇只用条、赌神用三门 + 花牌，
    **5 个游戏共用这一份**（`MahjongTile` 的 `suit` 属性选花色）。
  - **取格子用百分比**：`background-size: 735% 735%`（= 列/行数 ×1.05；7 列 7 行都是 735%）
    + `background-position: slotPos(i) = (k(i+0.5) − 0.5)/(n·k − 1)`。`ZOOM = 1.05` 是为了把裁切时
    带进来的那圈原图边缘（条牌下面会出现一条白线）推出元素之外；百分比写法与元素尺寸无关，
    牌随视口缩放不用改样式。**分母别写错**（漏了分子里的 `k` 会每格偏位、露出一半邻居，实测踩过）。
    ⚠️ **`ZOOM` 不许改成 1**：可见区间 = `[r + 0.5 − 0.5/k, r + 0.5 + 0.5/k]`，只跟 `k` 有关、
    与行数 `n` 无关 —— 所以行数从 5 扩到 7 不影响原有牌面（固定随机种子做整屏 A/B：差异
    0.03%~0.08% 像素，全是 WebP 重编码噪声），但把 `k` 改成 1 会立刻在牌边露出**毛边**
    （每格四周那 1px 邻居像素；曾误判成「牌自己的暗边」而改成 1，被玩家发现后回退）。
  - **开局/恢复前 `await` 预加载这张图**（`preloadTiles()` 就放在共享模块里，3 个游戏共用同一个
    promise）：不预加载的话，牌元素会先渲染、图要等下载完才出现 —— 冷启动有肉眼可见的延迟
    （实测预加载后图 69ms 就绪、第一张牌 191ms 才出现），雀圣那边还会连带把入场波浪的顺序盖掉。另外牌面要自带 `border-radius`（约 9% 牌宽），
    否则雪碧图裁出来的直角会漏出原图的浅底。
  - 换牌面记得同步长宽比：现在是 **1.282**（雪碧图 131:168），不是当年 CSS 画的 1.35 + 底部厚度。
  - **雪碧图要进 PWA 预缓存**：见上面技术栈里的 `workbox.globPatterns` —— 默认配置不含图片，
    漏掉的话预加载只能指望浏览器 HTTP 缓存，离线或缓存被清时牌面空白。
- 新增游戏：在 `src/games/<id>/` 放组件与 `i18n.js`，在 `shared/games.js` 注册（id/path/icon/helpKey，可选 recordsPrefix + 难度范围），在 `router.js` 加路由，首页图标加进 uno safelist。
- **首页「建设中」占位卡（registry 里 `wip: true`）的硬性规矩：永远排在最后、不可点击、不可拖动、也不能被别的卡片换走。**
  **当前首页没有这类卡**（22 个位置正好被 22 个游戏占满，所以暂时把 registry 条目去掉了；`HomePage` 里的整套 `wip` 机制、
  `.hex.wip` 样式和 `uno.config.ts` 里 `i-mdi-hammer-wrench` 的 safelist 都原样留着，恢复时照下面加一条 registry 条目即可）。
  以后要补位（比如首页还差一格、或某游戏临时下线）就照它加一条 registry 条目，实现要点：
  - `path` 指向 `'/'`；`HomePage` 的 `mergeOrder()` 末尾用 `games.filter(g => g.wip)` 把这类卡**强制移到队尾**，
    所以无论本地保存的拖动顺序是什么，它都在最后；
  - 卡片上挂 `.wip` 类，CSS 写 `pointer-events: none`（连拖拽与点击都收不到），并加个 🚧 角标、文字用 `--muted-color`；
  - JS 侧再兜三层：`onPointerDown` 里 `if (card.wip) return`（不能作为拖动源）、`swapCards()` 里 `isWip()` 直接返回
    （不能作为交换目标）、`onCardClick` 里 `preventDefault + stopPropagation`（点了什么都不做，也不跳转）。
  - **注意 SCSS 嵌套**：这条样式要写成 `.hex` 规则里的 `&.wip { ... }` —— 直接写 `.hex.wip` 会被编译成
    `.hex .hex.wip`（要求有 `.hex` 祖先），选择器永远匹配不上，表现是「写了样式却没生效」。
- **文字色要有全局兜底**：`App.vue` 的 `body` 上写了 `color: var(--text-color)`。各游戏页仍会在自己的 `.wrapper` 里
  再写一次（历史习惯），但**新增页面忘了写也不会出问题** —— 麻将英雄第一版就漏了这句，深色主题下整页文字
  继承浏览器默认的黑色（标题对深灰卡片只有 1.39:1、数字 1.66:1），是**穷举式对比度审计**才抓出来的。
- **帮助文案只写玩法**：`help1..helpN` 讲清规则、分数和过关 / 失败条件就够了，**不要写特效细节**
  （「得分满多少会闪烁 / 震动 / 撒花」「结算浮层等提示消失后再出现」这类都属于实现细节，玩家不需要在帮助里看到）。
  能合并的合并（比如把「怎么操作」和「提示区显示什么」并成一条）—— 已按这条约定精简过一轮：
  扑克炼金术 / 麻将英雄 / 雀圣各 **3 条**、麻将传奇 **4 条**（关卡数值曲线、undo/redo 与上帝模式
  这类说明都删掉了，只留玩法与胜负条件）。
- 变更时同步检查 README.md：凡改动影响到 README 中描述的内容（游戏列表、路由、目录结构、localStorage key、功能特性等），必须同步修改 README.md，不许 README 落后于实际。

---

## 交互与结算的统一规范（按钮 / 统计条 / 结算层 / 二次确认）

> 这一节是**普查 25 个游戏之后**归纳出来的（普查发现 20+ 处不一致，已按本节修正）。改动任何游戏的
> 交互之前先对照本节，不要再从别的游戏里「照抄」—— 它们是几代改动的叠加，抄到哪一代全凭运气。
> 机械可查的部分由 `node scripts/check-ui.mjs` 兜底。

### 1. 按钮：文案与 i18n key

同一件事在各游戏里**必须用同一个 key**（中文文案也已统一，带 emoji 前缀）：

| 语义 | i18n key | 中文 | 英文 | 用在哪 |
| --- | --- | --- | --- | --- |
| 新游戏 | `start` | `🎮 新游戏` | `🎮 New Game` | 操作区左侧 |
| 重玩本关 | `replayLevel` | `🔄 重玩本关` | `🔄 Replay Level` | 结算层最左 |
| 下一关 | `nextLevel` | `➡️ 下一关` | `➡️ Next Level` | 获胜层最右 |
| 查看答案 | `reveal` | `🔍 查看答案` | `🔍 Show Answer` | 操作区右侧 |
| 上帝模式 | `godMode` | `⚡ 上帝模式` | `⚡ God Mode` | 操作区 |
| 暂停 | `pause` | `⏸ 暂停` | `⏸ Pause` | 操作区 |

- **历史别名要改掉**（普查时抓到 4 种写法）：重玩本关曾叫 `retry` / `playAgain` / `nextGame`、下一关曾叫 `next`、
  查看答案曾叫 `answer`。新代码只用上表这一套；改到旧名字时顺手统一。
- 无「关卡」概念的游戏（单人麻将 / 数独 / 麻将传奇）用「再来一局」是**合理变体**，但 key 仍用 `replayLevel`
  （`nextGame` / `playAgain` 这类旧名已全部改名）。2048 结算层的「👍 继续游戏」用 `keepGoing`，是**已登记的
  变体**（它既不是重玩也不是下一关，而是「接着玩下去」）。

### 2. 按钮：配色（谁绿、谁橙、谁灰）

- **主按钮一律 `.game-icon`**：`--primary-bg` 实心 + 白字 + `border-radius: var(--radius-tile)`。
  **结算层里的按钮全部是主按钮**（重玩本关 / 下一关 / 新游戏 / 再来一局）—— 白底描边的「次要按钮」
  在结算层已经全部取消（玩家明确要求过两次：「获胜后的重玩本关也是绿色」「查看答案失败遮罩上的新游戏也是绿色」）。
- **只有三种特例**，且都必须写成 `.game-icon.xxx:not(:disabled)`（禁用时仍走灰）：
  `god-btn` → `--god-bg`（橙 `#c2410c`，白字 5.18:1）、`pause-btn` → `--pause-bg` + `--pause-fg`（黄底深字，9.89:1）、
  `answer-btn` → `--god-bg`（「查看答案 = 放弃」，与上帝模式同一个橙）。全站 `.game-icon` 特例类**只有这三个**，
  普查后已删掉 `primary` / `keep` / `again` / `ghost` 这些**没有任何 CSS 规则的空类**和用不到的 `.ghost`。
- **禁用态** `&:disabled` → `background: #aaa`（不要只降低透明度）。
- **橙色只有一个来源** `var(--god-bg)`：不要再硬编码 `#d4691e` 这类橙（扑克原来有一处，已改）。

### 3. 按钮：位置与顺序

- **操作区** `.card.opt-area`：左格信息 / `.divider` / 按钮。两个按钮时（例如 24 点与赌神）
  顺序恒为**「新游戏」在左、「查看答案」在右**（破坏性更强的放弃动作放右边，且用橙）。
- **结算层**（见第 5 节）按钮顺序恒为：
  - 获胜：**左「重玩本关」→ 右「下一关」**
  - 失败：**左「重玩本关」→ 右「新游戏」**
  顺序在普查里被写反过（麻将英雄 / 大师 / 雀圣的获胜层原来是「下一关」在前），已统一；
  有些游戏获胜层原来只剩一个「下一关」（消消乐 / 连连看 / 对对碰 / 排序 / 雀圣 / 大师），已补齐「重玩本关」。
  **24 点是有意的例外**：它的「下一关」就是换一道新题，没有「重玩本关」这个概念（`replayLevel` 在该游戏里
  连 key 都没有）；单人麻将 / 数独用「🔄 再来一局」也是同一类例外（key 统一叫 `replayLevel`）。
  自动检查会把这类游戏列在「提示」里而不判失败。
  按钮之间 **`gap: 12px`**，并且这个按钮行要定义在**顶层**（嵌进 `.result` 里的话，
  选择区遮罩里的那颗就没有 gap，两颗会挤在一起——赌神踩过）。
  类名历史上分两种：`.result-actions`（侦探 / 猎手 / 滑行 / 赌神 / 麻将英雄 / 炼金术）与
  `.result-btns`（麻将英雄 / 炼金术也用过）；**两边都必须是 12px**（炼金术与麻将英雄原来是 10px，已统一）。
  消消乐 / 连连看那两条用不到的 `.result-btns` 死样式已删。
- **尺寸**：默认 `padding: 8px 16px` + `font-size: 14px`；贪吃蛇 / 点击 / 数独 / 侦探 / 猎手 / 对对碰 / 下坠 /
  **Emoji 镜像**这八个用 `padding: 8px 12px` + 13px；**单行要放两颗按钮**的赌神 / 24 点 / 单人麻将用
  `padding: 8px 10px` + 13px。圆角一律 `var(--radius-tile)`（贪吃蛇 / 数独 / Threes 原来硬编码 8px，已改）。
  禁用态一律 `background: #aaa` + `cursor: not-allowed`；**新增会 disabled 的 `.game-icon` 时必须补这条**。

### 4. 统计条（分数区）

- 结构：`.card.score-area`（点击游戏是 `.score-card`，扑克是 `.money-area`，属历史例外）+
  若干 `.stat`（`<span class="stat-label">` 12px + `<span class="stat-value">` 22px 粗体）+ 各 `.stat` 之间
  一个独立 `.divider` 元素；高度 `var(--row-height)`（72px）；首张卡片 `margin-top: 64px`。
- **顺序有两条硬规则**（普查 25 个游戏后确认，唯一违反者「对对碰」已修）：
  1. **「最高 / 最长 / 最佳」永远排在它对应的「当前」之前**（🏆最高关卡 → 🏁关卡、🏆最长连胜 → 🔥当前连胜、
     🏆最高分 → ✨得分）。**不要**写成「关卡 → 最高关卡」。
  2. **生命 / 心永远排在最后一项**（侦探 / 猎手 / 赌神 / 数独四个游戏无一例外）。
  3. 之后的「局内状态」（剩余对数 / 步数 / 时间）排在记录与关卡之后。
- 值的写法：纯数字；空值占位 `--`（点击 / 侦探 / 下坠 / 赌神 / 猎手 / 数字迷宫）。生命用 `shared/Hearts.vue`，
  **不要自己画爱心**，也不要给 `.stat-hearts` 写字号（`Hearts` 自己的 `.heart` 是 19px，父级字号不生效，
  多写的 `line-height` 只会让统计条比别的游戏高一点——赌神踩过，已删）。
- `.divider` 写法固定：`width: 1px; height: 24px; align-self: center; background: var(--border-color); opacity: 0.6`，
  **定义在 `.wrapper` 层级**（统计条与操作区共用）。单人麻将原来用 `--card-border-color` 且缺 `align-self`/`opacity`，已修。
- 进度条（`.progress`）可以放进统计条（9 个游戏这么做），但它 `position: absolute` 贴底，需要父级
  `position: relative` + `overflow: hidden`。

### 5. 结算层（胜利 / 失败）

- **默认形态**：覆盖整个棋盘/游戏区的居中浮层 `.result.win` / `.result.lose` —— `--mask-color` 底、
  `--win-color` / `--lose-color` 字、18px 粗体、`gap: 12px` + `padding: 12px`、**必须 `box-sizing: border-box`**。
- **什么时候用「子区域遮罩」**：只有当失败需要玩家**看清盘面**时才盖子区域，让被揭示的信息留在视野里 ——
  赌神 `.pick-mask`（只盖选择区，答案区仍在）、猎手（只盖候选区）、扑克（只盖公共牌区）。
  这是**显式变体**，用之前必须想清楚「玩家要看什么」。
- **内容三行**：① 标题（`tipWin` / `levelDone` / `tipLost` / `timeUp` 之类，带 🎉 / 👻 前缀）；
  ② 动态值（分数 / 用时 / 剩余 / 连胜；g2048 / Threes / 贪吃蛇原来只有标题，已补上分数行）；
  ③ 按钮（见第 3 节）。**不要**在结算层里放「返回首页」（返回一律走顶栏 🏠）。
- **出现时机**：需要玩家看清最后一步时用 `shared/resultDelay.js` 的 `useResultDelay()`（默认 **500ms**）——
  点错抖动、答对高亮、最后一张牌飞入这类都要先播完再铺结算层。散布的裸 `setTimeout` 应尽量收敛到这个工具；
  动画驱动的情况（等动画结束）可以自己 await，但要在分册里写清楚。
- **输入拦截**：浮层/遮罩覆盖范围内的点击由它自己挡住（绝对定位 + 底色）；**覆盖范围外**的按钮
  （操作区的新游戏 / 暂停、选择区的查看答案、撤销重做）必须由 `phase !== PLAY` 或 `:disabled` 挡住，
  两层都要有，不要只靠其中一个。
- **结算层里的破坏性动作也要二次确认**：结算层的「新游戏」会清记录 + 回第 1 关，必须和操作区的「新游戏」
  走同一个 `ConfirmDialog`（赌神与麻将传奇原来是直调，已修）。

### 6. 二次确认（ConfirmDialog）

- 一律用 `src/shared/ConfirmDialog.vue`，**不要自建弹窗**；文案默认写在组件里（`TEXT.cn/en`），
  各游戏的 `confirmText` 是**帮助弹窗**的「知道了」，别混用。
- 主流写法（13 个游戏）：
  ```vue
  <ConfirmDialog :show="confirming" @confirm="startNewGame" @replay="replayLevel" @cancel="confirming = false" />
  ```
  `startNewGame()` 第一行 `confirming.value = false`，然后清当前模式的 level + best 并回第 1 关。
- 变体：**无尽 / 无关卡模式**（扑克炼金术、麻将英雄的无尽、24 点、单人麻将）传
  `:show-replay="false"`（去掉中间那颗），需要时再覆盖 `title` / `message`（用游戏自己的 i18n key）。
- 反例：扑克的破产原来用原生 `alert('破产了请重新来过!')`（全仓唯一硬编码中文），已改成 `i18n('bankrupt')`。
- 不确认的操作：重玩本关 / 下一关 / 切模式 / 切难度 / 返回首页 / 查看答案（查看答案是明确的「放弃」动作，
  点一下即生效，代价写在按钮颜色和结算文案里）。
- **单局制 / 无闯关记录的游戏不强制确认**（点击游戏 / 1A2B / 数字迷宫 / 贪吃蛇 / Threes / 2048 / 下坠 /
  Emoji 镜像 / 德州扑克）：它们的「新游戏」只是重开当前这一局，没有「闯关记录」可清，弹窗文案
  （「会清除闯关记录并从第 1 关重新开始」）对它们也不成立。有闯关/连胜记录的 15 个游戏必须确认。

### 7. 连点标题清记录

- 入口在 `src/components/TopHeader.vue`：**标题连点 5 次**触发。它现在**总是** emit `onScoreReset`
  （历史实现要求注册表有 `recordsPrefix`，否则直接 return —— 于是 three / 2048 / 贪吃蛇 / 大师 / 麻将传奇
  的彩蛋**永远不会触发**，雀圣的处理器还是个空箭头 `() => {}`，全部已修）。
- 注册表里的 `recordsPrefix` + `minDifficulty..maxDifficulty` 只负责**按难度索引**的旧式记录
  （`__emoji_crush__best_1` 这类），它拼出来的 key **必须真实存在**；拼不出真实 key 的条目应该清掉这段配置。
- 各游戏在 `onScoreReset()` 里用共享助手清扫自己的前缀：
  ```js
  import { clearGameStorage } from '@/shared/storage';
  function onScoreReset() {
    clearGameStorage('__emoji_master__');   // 清掉该前缀下全部 key，但保留 mode / difficulty 这类偏好
    bestScore.value = 0;                    // 再复位内存里的值（各游戏自己写）
    startNewGame();
  }
  ```
  **别再逐 key `removeItem`**：key 名不一致（带难度下标、带模式后缀），逐条写一定会漏。
- 清除范围 = 「记录 + 进度 + 局面」，**保留偏好**（`mode` / `difficulty` / `theme` / `speed` / `lang` /
  `help_showed` —— 帮助弹窗的「已看过」标记也是偏好，清掉会让帮助重新弹一遍）。
- 自检：每个有存档的游戏都必须同时满足「`<TopHeader>` 绑了 `@onScoreReset`」且「处理器里清了前缀」，
  由 `scripts/check-ui.mjs` 检查。
