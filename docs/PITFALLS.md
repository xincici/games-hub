# 反复踩的坑（`docs/PITFALLS.md`）

按**症状**查。每条给「原因 → 定位手段」。这些坑在不同游戏里反复出现过，
所以在动手之前先扫一眼：**它很可能已经有一个固定的解法了**。

## 布局 / CSS

| 症状 | 原因 | 定位手段 |
| --- | --- | --- |
| 窄屏上文字被截成省略号 | 字号写死 + `nowrap/ellipsis`，容器缩放后装不下 | 逐个比 `scrollWidth > clientWidth`；字号应随容器尺寸 `calc()` 缩放 |
| 整页恒多出 64px 能滚 | 首张卡的 `margin-top` 从没有上 padding 的容器**塌陷**出去（`#app` 有 `min-height: 100dvh`）。**顶栏是 fixed 时，首张卡就是这个页面第一个在流内的元素，必然触发**（内容明明只有 480px 高，`scrollY` 却也有 64） | 量「内容总高 vs 视口」再看 `scrollY`：总高没超却仍能滚，就是塌陷；改成容器的 `padding-top` |
| 切页时先横向超出、再缩回 | `.app-open/close-enter-active` 是 `position:absolute; width:100%`，缺 `box-sizing` → 100% + 32px 内边距 | 逐帧记 `documentElement.scrollWidth` vs `innerWidth`，把超宽元素连同 `offsetWidth` 打出来 |
| 结算浮层比棋盘大一圈 | 浮层用 `width/height:100%` + 内边距却缺 `box-sizing: border-box` | 量浮层与父盒的 `getBoundingClientRect()` 差值 |
| 行与行重叠、整块从容器底部溢出 | grid 的 `grid-auto-rows` 还按宽度算，竖向卡片（比例 >1）每行只占一部分 | 量「行高 vs 牌高」，写 `grid-auto-rows: var(--cell-h, var(--cell))` |
| 写了样式却没生效 | SCSS 嵌套把 `.hex.wip` 编成 `.hex .hex.wip`；或选择器特异性被外层压掉 | 遍历 `document.styleSheets` 找出命中的规则 |
| 牌的**光环/高亮**偏一边、像被压住 | `CardItem` 的 `.card` 有 1px 描边却无 `box-sizing`，比 wrapper 宽 2px 且绘制在上层 | 画到 `:deep(.card)` 上，或按分册做法偏移 `left/top` |
| 新游戏卡片没背景、按钮变浏览器默认样式、统计条没有分隔线 | `.card` / `.divider` / `.game-icon` 都是**各游戏 scoped 里的重复约定**，不是全局类（全局只有 `--card-*` 之类变量） | **直接抄 [`NEW-GAME.md`](NEW-GAME.md) 的样式骨架**；量 `getComputedStyle`：`.card` 底色须非透明、`.game-icon` 须 `rgb(35,128,78)`、`.divider` 须 `1px×24px` |
| 所有卡片**贴到屏幕两边**（游戏区被拉伸） | `.wrapper` 只写了 `padding-top: 64px`，把左右内边距**清零**了（其它游戏写的是完整简写 `64px 16px 24px`） | 量第一张卡与视口左右的距离（应为 16px）；容器 padding 用简写一次写完 |
| 卡片有白底、**数字却看不见** | `.card` 里写了 `color: var(--card-color)` —— 那个变量是 **`#fff`**（给深色卡片用的），浅色主题下就是白底白字 | 量 `getComputedStyle('.stat-value').color`（会是 `rgb(255,255,255)`）；文字颜色交给 `.wrapper` 的 `color: var(--text-color)` |
| 圆角/阴影写了却**完全没效果** | `var(--radius-card)` 这个变量**根本不存在**（只有 `--radius-tile` / `--card-radius`）→ `var()` 解析为空 = 直角 | 改任何 `var()` 之前先在 `App.vue` 里 `grep` 确认名字；症状是"没生效"而不是报错 |
| 一个容器里的东西**塌成几像素宽** | 容器宽度由内容决定，里面却用 `calc((100% - …) / 7)` 算子项宽度 —— `%` 按**这个容器自身**解析，循环依赖 → 塌掉（实测杠组 7×51） | 量外层真实宽度后以 **px** 写回去（`ResizeObserver` 跟随）；或让子项用 `aspect-ratio` 定高 |
| flex 行里的元素**被纵向拉满**（26px 宽变成 26×71） | 元素**本身**就是 flex item，却给它 `--h: 100%`（循环依赖）；且 flex 行默认 `align-items: stretch` | 尺寸给**具体像素**；容器加 `align-items: flex-start`（或 `center`） |

## 动画 / Vue

| 症状 | 原因 | 定位手段 |
| --- | --- | --- |
| 同一局里有的卡片播入场动画、有的不播 | `v-for` 的 `:key` 只有下标，新一局 key 撞上 → Vue 复用 DOM | 把「开局序号」拼进 key（`dealSeq`），逐卡统计 `transitionstart` 次数 |
| 恢复存档时还会翻一下 | 状态在 `onMounted` 才补 → 首帧已按初始态画过 | 在 `setup` 里就恢复；另用 `silent` 前两帧禁过渡 |
| 交换/移动「多跳一下」 | 清内联 transform 时过渡还开着，元素按过渡滑回原处 | 清之前先加一帧 `transition: none`，强制重排后再放开 |
| 恢复时动画全没了 / 新开局也不动 | 禁过渡的标记没及时放开 | 分别统计「恢复」与「新开局」的过渡事件数 |

## 交互

| 症状 | 原因 | 定位手段 |
| --- | --- | --- |
| 桌面端拖不动、滑动被浏览器吃掉 | 用了 `touchstart/move/end`（只认触摸） | 换 Pointer Events；手势区加 `touch-action: none`，但先量这页会不会溢出 |
| 长按变成选中文字 / 弹出系统菜单 | 没关默认行为 | `user-select: none` + `touch-action: none` + `-webkit-touch-callout: none` |
| 合成事件（测试脚本 dispatch 的）一调用就抛 | `setPointerCapture` 需要真实 `pointerId` | 包 `try/catch` |

## 存档

| 症状 | 原因 | 定位手段 |
| --- | --- | --- |
| 重进后某些数据丢了 | 存档掩码写小了（例：笔记按 `1<<d` 存，d=9 落在 bit 9，`& 511` 会整位抹掉） | 直接读 `localStorage`，和内存里的状态比 |
| 「清除记录重头再来」后盘面空白 | 生成器丢数据后还通过了弱自检（空盘是「平凡通过」） | 自检要**显式断言产物形状**（张数/格数），不能只自洽 |
| 恢复出来的局面不该有动画却有 | 见上面「恢复存档时还会翻一下」 | — |
| **退出重进永远恢复不了**，每次都在重发 | `restoreState()` 里用到的 ref 声明**在它后面** → TDZ 抛错 → 被 `try/catch` 静默吞掉 → 恒返回 false（24 点、单人麻将都踩过） | 恢复函数用到的状态**一律先声明再用**；`catch` 里必须 `console.warn`，不要静默返回 false |
| 亲手种进 `localStorage` 的局面没生效、悄悄重开了一局 | 校验函数（如 `validTile`）要求整数，脚本却写成了字符串 `'1'` → 整份存档被判非法丢弃 | 种完先读回来打印一遍再导航；校验函数要**断言产物形状**而不是只看自洽 |

## 给改代码的 AI 自己

| 症状 | 原因 | 做法 |
| --- | --- | --- |
| 「补丁脚本说改好了，文件却没变」 | 脚本把**写文件放在末尾**，中途 `assert` 失败 → 前面的编辑全丢 | **每次替换后立即落盘**；改完 `grep` 回读关键行 |
| 按钮/元素**按下时位置跳一下**再归位 | 元素用 `transform` 做定位（`translate(-50%)` 之类），而 `App.vue` 有一条**全局**规则 `#app button:not(:disabled):active { transform: … }`，按下的瞬间把定位的 transform 顶掉了 | 量「按下 / 松开」两态的 `getBoundingClientRect()`；**定位不要用 transform**（用 `top/left` 或 flex） |
| 用「不同解个数」评估难度时，重复数字的题被**高估** | 解按字符串去重，`6 6 6 6` 的排列全折叠成少数算式，看起来"解很少" | 简单信号要**单独减分**（纯加减、数字全同、含 1），别指望解个数自己压下去（24 点分册有完整公式） |
| 用 `querySelector('.xxx')` 判断弹窗/遮罩**是否可见**永远为真 | 共用 `ConfirmDialog` 的外层是 `v-show`（遮罩始终在 DOM 里，只是 `display: none`） | 判 `getComputedStyle(el).display !== 'none'`；同理别用「元素存在」代表「显示中」 |
| 「构建失败了」，但日志里明明写着 ✓ built | 一串 `&&` 里前面某个 `grep` 没命中就短路了，**后面的 `vite build` 根本没跑**，`$?` 读到的是那个 grep 的返回码 | 用 `;` 分隔、或每步单独看；**看日志内容，别只看 `$?`** |
| 「测试说全坏了，其实是脚本错」 | 正则/选择器写错、监听器重复安装、用了会自欺的判据 | 打印**原始数据**再看；每场景用全新页面；判据按上表选 |
| 「文档说的和代码不一致」 | 改了行为没同步分册/README | 跑 `node scripts/check-conventions.mjs` |
| **构建失败**，而我在预览里量到的「什么都没变」 | `vite build` 挂了，`vite preview` 还在端**上一次的 dist** —— 量的全是旧产物（我因此白改了一轮） | 每次预览前确认 `build exit = 0`；Sass 报 `expected "}"` 多半是替换脚本吃掉了闭合括号 |
| 「按存档里的下标点界面元素」点错了牌，看着像功能坏了 | 界面顺序是**排序后 + 新牌在最后**，存档里的 `hand` 是原始顺序，两者下标不对应（单人麻将踩过） | 先按 `data-*` 读出**界面顺序**，再用 id 去数据里取；别用数据下标直接点 DOM |
| 用 `querySelector` 判断「元素是否可见」永远为真 | 见上表 `v-show` 那条 | 判 `computedStyle.display` / 量 `getBoundingClientRect()`，别用「存在」代表「可见」 |
