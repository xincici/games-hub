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
| 新游戏卡片没背景、按钮变浏览器默认样式 | `.card` / `.game-icon` 是**各游戏 scoped 里的重复约定**，不是全局类 | 对照同类游戏把这两条抄上 |

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

## 给改代码的 AI 自己

| 症状 | 原因 | 做法 |
| --- | --- | --- |
| 「补丁脚本说改好了，文件却没变」 | 脚本把**写文件放在末尾**，中途 `assert` 失败 → 前面的编辑全丢 | **每次替换后立即落盘**；改完 `grep` 回读关键行 |
| 按钮/元素**按下时位置跳一下**再归位 | 元素用 `transform` 做定位（`translate(-50%)` 之类），而 `App.vue` 有一条**全局**规则 `#app button:not(:disabled):active { transform: … }`，按下的瞬间把定位的 transform 顶掉了 | 量「按下 / 松开」两态的 `getBoundingClientRect()`；**定位不要用 transform**（用 `top/left` 或 flex） |
| 用「不同解个数」评估难度时，重复数字的题被**高估** | 解按字符串去重，`6 6 6 6` 的排列全折叠成少数算式，看起来"解很少" | 简单信号要**单独减分**（纯加减、数字全同、含 1），别指望解个数自己压下去（24 点分册有完整公式） |
| 「构建失败了」，但日志里明明写着 ✓ built | 一串 `&&` 里前面某个 `grep` 没命中就短路了，**后面的 `vite build` 根本没跑**，`$?` 读到的是那个 grep 的返回码 | 用 `;` 分隔、或每步单独看；**看日志内容，别只看 `$?`** |
| 「测试说全坏了，其实是脚本错」 | 正则/选择器写错、监听器重复安装、用了会自欺的判据 | 打印**原始数据**再看；每场景用全新页面；判据按上表选 |
| 「文档说的和代码不一致」 | 改了行为没同步分册/README | 跑 `node scripts/check-conventions.mjs` |
