# 开发约定（`docs/CONVENTIONS.md`）

> 从根 [`AGENTS.md`](../AGENTS.md) 拆出来的**跨游戏硬约定**。**动任何游戏的代码之前先扫一遍**；
> 下面的「开工前逐条核对」是从正文提炼的勾选清单，正文里有每条的原因与实测数据。

## 开工前逐条核对（新游戏 / 改旧游戏都过一遍）

- [ ] **图标**：attributify 写法 `<i i-carbon-sun />`；**首页图标必须同步加 `uno.config.ts` 的 `safelist`**（运行时数据 UnoCSS 提取不到）。
- [ ] **颜色**：走 `App.vue` 的 CSS 变量，不硬编码需要随主题变的颜色；**按钮上文字的对比度要算**（项目要求 ≥4.5:1，白字压橙 5.18:1、深字压黄 9.89:1，黄底白字只有 1.61:1 不行）。
- [ ] **布局**：最小兼容 **375×667**；首张卡片 `margin-top: 64px`（**镜像例外**：写成 `.wrapper` 的 `padding-top`，否则外边距塌陷出 `#app`、整页恒多 64px 可滚动）；判「能不能滚」只认 `window.scrollTo(0, 9999)` + `scrollY`。
- [ ] **切页过渡**：`.app-open/close-enter-active` 必须 `box-sizing: border-box`（否则过渡期间整页宽 100%+32px）。
- [ ] **emoji 游戏视觉语言**：`.card` / `.game-icon` / `.dot-board` / `.divider` / `.stat-*` / `.result` 的写法与尺寸（含 `.game-icon` 的两个配色特例、结算浮层必须 `box-sizing: border-box`）。
- [ ] **共享逻辑**：`src/shared/` 已有的一律复用（`confetti` / `CountTimer` / `ConfirmDialog` / `Hearts` / `resumeCountdown` / `resultDelay`），不复制第二份。
- [ ] **手势**：一律 Pointer Events + 手势区 `touch-action: none`（`touchstart` 只认触摸）；加之前先量这一页会不会溢出。
- [ ] **存档**：沿用该游戏原有前缀；**每个 key 都要写进它自己的分册**；清记录彩蛋靠注册表的 `recordsPrefix` + 难度范围。
- [ ] **帮助文案**：只写玩法 / 分数 / 胜负条件，**不写实现细节**，也不写彩蛋。
- [ ] **文案**：中英双语都要加（`games/<id>/i18n.js`）。
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
- **全站粒子背景**：`shared/ParticleBackground.vue` 由 `App.vue` 挂在内容层（`.app-content`，z-index 1）之下，canvas 为 `fixed + z-index 0 + pointer-events: none`。各页面根容器 `.wrapper` 的不透明底色被 `App.vue` 里的 `#app .wrapper { background: transparent }` 统一置空，改由 `body` 的 `--bg-color` 兜底，粒子才透得上来——**新增游戏不要给根容器或全屏元素加大面积不透明背景**（会挡住粒子）。粒子颜色走 `body` / `body.dark` 的 `--particle-dot`、`--particle-line` 变量（light 灰蓝、dark 淡蓝白），canvas 每帧读取并做 0.25s 缓动过渡。
- **页面滑动手势一律用 Pointer Events**（`pointerdown` / `pointermove` / `pointerup`）+ 手势区域内 `touch-action: none`。`touchstart/move/end` 是**只认触摸**的：PC 上拿鼠标怎么拖都不触发（装成桌面应用后更明显 —— 浏览器 / 窗口层会把整段手势当成滚页面或拖窗口收走，再补一个 `touchcancel`）。Threes、Emoji 消消乐、2048、贪吃蛇（转向）、数字迷宫（空白格跟手）都已按这套实现，并且都保留了原有的兜底操作（消消乐点两下换位、2048 / 数字迷宫方向键、数字迷宫摇杆按钮）。`touch-action: none` 只加在「真正拥有这个手势」的元素上：**先量这一页会不会溢出**——不溢出就加在整页 `.wrapper`（Threes / 2048 / 贪吃蛇），会溢出就加在棋盘那层（消消乐 `.board-frame`；数字迷宫 `.game-area`，最高难度 6 在 320×568 下 scrollH 590 > 568，整页 none 会把「滚下去看棋盘」一起吃掉）。
- **整副牌面优先裁图，并且拼成一张雪碧图**：需要成套牌面（麻将 / 扑克 / 塔罗之类）时，
  如果手上有现成的整副图，直接按网格裁下来用比 CSS 画省事得多。做法（三个麻将游戏都在用）：
  - 裁图：按网格切、每格往里收 2px 去掉相邻牌的边线，**直接从原图拼成一张**再存 webp
    （只压一次，别拿裁好的小图再拼）。裁完**先拼一张联络表截图肉眼核对**：网格顺序不一定按直觉
    （那张图的第 4 行是「北白南中發東西…」而不是东南西北中發白），原图还可能有水印格。
  - 现在的成品：`src/shared/mahjong-tiles.webp`（7 列 × 5 行、每格 131×168，一张 181KB）
    + `src/shared/mahjongTiles.js`（格子表、`spriteVars()`、长宽比 `TILE_RATIO = 1.282`）。
    麻将英雄只用筒、雀圣用整副、麻将传奇只用条，**三个游戏共用这一份**（`MahjongTile` 的 `suit` 属性选花色）。
  - **取格子用百分比**：`background-size: 735% 525%`（= 列/行数 ×1.05）
    + `background-position: slotPos(i) = (k(i+0.5) − 0.5)/(n·k − 1)`。`ZOOM = 1.05` 是为了把裁切时
    带进来的那圈原图边缘（条牌下面会出现一条白线）推出元素之外；百分比写法与元素尺寸无关，
    牌随视口缩放不用改样式。**分母别写错**（漏了分子里的 `k` 会每格偏位、露出一半邻居，实测踩过）。
  - **开局/恢复前 `await` 预加载这张图**（`preloadTiles()` 就放在共享模块里，三个游戏共用同一个
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
