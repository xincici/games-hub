# 游戏合集 · 微信小程序版（`mp/`）—— 迁移守则与踩坑清单

> 这是一份**独立工程**的说明：`mp/` 不在 web 仓库的构建链里（根 `.gitignore` 已排除 `mp/`），
> 目标是把它做成可单独抽走的仓库。**改 web（`src/`）永远不要为了让小程序好做而妥协** ——
> 反过来，小程序这边一切以 **web 的实际效果为准**（用户会拿 web 截图逐项对比）。
>
> 用户对还原度的要求是**逐像素级**的：布局、间距、颜色、圆角、按钮比例、动画、文案，都要对得上 web；
> 实在做不到的（3D 翻面、DOM 克隆飞牌等）**必须主动说明降级**，不能默默改掉。

## 零、开工前必读：本次会话的 29 条返工点（每条都真实踩过）

> 放在最前面，因为 **`AGENTS.md` 会被工具截断（只保留前 60 多 KB）**，写在末尾的教训可能会被裁掉。
> 详细案例在后面各节（§二十三 是这一轮的完整记录）。**开工前逐条对照，别重复踩。**

### A. 尺寸 / 布局（11 条）

1. **flex 容器宽度小于子项总宽 → 子项被压扁** ✗（麻将传奇的「下一张」预览两张牌）
   → 容器**不要给固定宽**，让内容撑开；子项写 `flex: 0 0 auto`。
2. **容器尺寸写死，内容缩小后留一大片空底色** ✗（对对碰 3 列时棋盘还是 690rpx）
   → 「内容有上限」时，容器尺寸必须**由内容反算**（`pad*2 + n*size + gap*(n-1)`），并 `margin: 0 auto` 居中。
3. **同一个东西两套坐标数学** ✗（传奇消牌浮影比盘面牌偏左上 12rpx = 少了 `PAD`）
   → 「盘面上的牌」和「浮影 / 替身 / 高亮框」**必须共用同一份 left/top 计算**。
4. **照抄 web 的尺寸上限**：web 有 `EMOJI_MAX_W = 96px` 这类上限，mp 漏了就会「第一关的牌特别大」✗
   → 尺寸类常量去 web 源码里找同名上限，别自己拍。
5. **用 flex gap 排格子，但牌是绝对定位** → 真机上 gap 不支持时整盘错位 ✗
   → 一律两边都用绝对定位 + 同一份 `PAD/step`。
6. **`margin` 在全局 `width: 100%` 的元素上不生效** ✗（雀圣撤销卡想左右内缩）
   → 补 `width: auto`。
7. **外框 padding + 内部元素自己偏移 PAD = 双份内边距** ✗（侦探的牌整体偏右下、右/下内距变 0）
   → 二者只能留一个：要么外框 `padding: PAD` 且内部从 0 起算，**要么**外框 `padding: 0` 且内部 `left = PAD + …`。
   我统一用后者（和雀圣/传奇/消消乐一致）。**量法**：牌 bbox 到外框的四边内距必须相等（±1px）。
8. **照抄 web 的 `dot-board` 这类「底纹类」**：web 的棋盘点阵是全局 `.dot-board`（`#bbada0` + 10px 白点），
   mp 里没有全局那份 → 漏了就**整块棋盘没有背景** ✗（连连看）。→ 写进 `.board`：底色 + `radial-gradient` 点阵，
   或和别的页面一样本地定义 `.dot-board`。
9. **自定义组件的「宿主节点」会吃掉 `border-radius: inherit`** ✗（侦探的麻将牌是直角）
   → 小程序在「容器 → 组件根」之间多插一层宿主：`.mj-wrap { border-radius: inherit }` 继承到的是**宿主**，
   宿主没圆角就是 0。修法：`MahjongTile.vue` 的非 scoped `:host { … border-radius: inherit }`，
   并在页面里给 `<MahjongTile class="mj-face">` 显式圆角（双保险）。
   **凡是「组件根用了 `border-radius: inherit`」都要检查这条**。
10. **在 `.page` 里写 `width: 75%` ≠ 屏幕宽度的 75%** ✗（雀圣/点击游戏的「撤销 / 重做」想占屏宽 75%）
    → `.page` 自身只有 690rpx（含左右 24rpx 内边距），百分比是**相对页面内容宽**算的：
    实测写成 `75%` 只得到屏宽的 **61.8%** ✗。要么用 `vw`，要么直接写 rpx：
    目标「两颗按钮合计 562rpx（750×0.75）」+ `.undo-item` 的 4 个 15rpx 内边距 → **卡片 `width: 622rpx`** ✓
    实测按钮合计 **293px / 74.6%**（393 宽）、280px / 74.7%（375 宽），居中偏差 1px，不与 FAB 重叠 ✓。
    **凡是「占屏宽 N%」的需求，先确认父级宽度是不是 750rpx。**

11. **结算遮罩会被很窄的棋盘挤到按钮换行** ✗（侦探麻将 2×2 只有 176px，两颗按钮要 ≈221px）
    → `.result` 不能只有 `left:0; width:100%`，要给 **`min-width`** + 水平居中：
    ```css
    .result { left: 50%; transform: translateX(-50%); width: 100%; min-width: 480rpx; max-width: 702rpx; }
    ```
    实测：2×2 棋盘 176px → 遮罩 **252px**、居中偏差 **0**、按钮 **1 行**；1×3 遮罩 = 棋盘 261px 同样单行 ✓。

### B. 动画 / 时序（8 条）

12. **「等动画」用全局锁 → 玩家快速点击时「点了没反应」** ✗（对对碰闪烁期间）
   → 只挡「已经被消费的那几张牌」（它们本来就是 `flipped`），**不要锁整个棋盘**。
13. **同时性要求要数准时间**：配对成功要等第二张翻完（0.46s）再一起闪 ✓，但别顺手加锁 ✗。
14. **结算层抢在动画前面出现** ✗（赌神最后一张还在落位就弹出胡了）
   → `setTimeout(win, 落位时长)`，等「飞牌 + answer-in」都结束。
15. **动画回调里用布尔开关驱动重播不灵** ✗（扑克 `animate: Boolean` 第二次发牌不重播）
    → 用**计数器**（`cardAnim[idx] += 1`）或把 `seq` 拼进 `:key`。
16. **`watch` 只处理一个方向** ✗（扑克 `watch(isBack)` 只在「变回牌背」时处理，发牌后一直牌背）
    → 两个方向都要写。
17. **一条关键帧画抛物线 → 观感是「滑」不是「落」** ✗（彩带）
    → 拆两层：外层水平匀速、内层竖直「减速上升 + 加速下落」，两段不同的 `animation-timing-function`。
18. **96 个粒子共用同一条轨迹 → 挤成一坨** ✗
    → 每个粒子独立随机（射程 / 顶点比例 / 高度 / 时长 / 延迟），参数区间放开。
19. **web 的动效参数要先去读源码**：`celebrate()` 是左右两侧各一门礼炮（angle 60/120），不是从顶上往下飘 ✗。

### C. i18n / 文案（3 条）

20. **加 key 只加 en、漏了 cn → 中文直接显示原始 key** ✗（赌神中间文案、2048/24点/对对碰的帮助）
    → 加 key **两边同时加**；并跑「cn 与 en 的 key 集合 diff，必须相等」。
21. **key 被别处复用，却把 emoji 写进字典** → 结算行也冒出 emoji ✗
    → 只用在 label 的 key 改字典；复用的 key **只在模板 label 上加前缀**。
22. **判断「字符串是否已有 emoji」范围不全 → 重复加前缀** ✗（`🀄 U+1F004`、`⏱ U+23F1`、`⏭ U+23ED`）
    → 用完整范围（`1F000~1FAFF / 2300~27BF / 2B00~2BFF`）或字符类别，**并且改完渲染抽查**。

### D. 交互 / 逻辑（3 条）

23. **跟手拖动只改位移、不改层级 → 会动的牌钻到不动的那张下面** ✗
    → `z-index` 一起改（会动的 1→2）。
24. **跟手时「所有牌一起动」→ 突破边界** ✗
    → 只让 `computeMove(dir)` 里**真的会动**的牌跟手（web 的 `dragMovers`），其余纹丝不动。
25. **飞牌替身加了透明度 / 缩放比例自创** ✗（赌神飞牌「变小还变透明」）
    → web 的替身 `opacity: 1` 全程不变，缩放用 `b.width / a.width`（缩到目标槽位大小）。

### E. 全局样式 / 平台（2 条）

26. **每个游戏各写一套结算按钮** → 高度 64/68/72、内边距 20/26/28 三种 ✗
    → `App.vue` 一份全局规格（主操作绿底、次操作橙描边），用 `!important` 压 scoped；
      **别碰**语义不同的按钮（poker 的下注 `.btn`、`.god-btn`、`.pause-btn`）。
27. **原生导航栏用主色绿 → 和页面底色割裂** ✗
    → `navigationBarBackgroundColor` = 页面底色、`navigationBarTextStyle: 'black'`，
      **逐页的同名字段要一起改**（11 处），否则个别页面还是绿的。

### F. 工作方式（2 条，最容易再犯）

28. **只跑 `build:h5` 就去汇报** ✗（用户看开发者工具还是旧包）
    → **两个目标都 build**：`build:mp` + `build:h5`，并 grep 产物确认规则/结构真的进去了。
29. **用脚本改文件不校验 → 静默失败 / 断括号 / 误删** ✗✗（这一轮出现过 5 次以上）
    → 每次替换前 `assert 目标串存在`、优先**按行号区间**改、改完立刻跑
      `@vue/compiler-sfc` 编译 + 全量 build；**「grep 到了」≠「生效了」**——
      样式要用 `getComputedStyle`、文案要看渲染结果，才算验证过。

## 一、这个工程的构成

```
mp/
├── package.json        uni-app(Vue3) + mp-weixin + h5；@dcloudio/* 必须锁同一个 tag，
│                       vite 必须是被它 peer 要求的精确版本（否则 npm install ERESOLVE）
├── vite.config.mjs     uni() + UnoCSS()（必须是 .mjs，见第八节）
├── uno.config.js       UnoCSS 配置（presetWeapp + presetIcons，与 web 同一套图标）
├── index.html          H5 入口（先在浏览器验证功能，再去开发者工具看真机）
├── src/
│   ├── main.js         createSSRApp
│   ├── App.vue         全局样式：.card（web 的卡片 token）、.fab（右下角悬浮按钮）
│   ├── uni.scss        web 视觉 token 的 rpx 版（圆角/阴影/行高/主色）
│   ├── pages.json     5 个页面；**navigationStyle 用默认值**（保留小程序原生导航栏）
│   ├── manifest.json  appid（现在是 wx44d366fc7dc1dec1，真机预览/上传用它）
│   ├── core/          平台适配层：storage / i18n / sfx
│   ├── components/    FloatingActions（右下角悬浮按钮容器）/ MahjongTile（雪碧图牌面）
│   ├── shared/        mahjongTiles / mahjongFaces / emojis（从 web 复制，只改图片导入路径）
│   ├── static/        音效 + 麻将雪碧图
│   └── pages/         g2048 / point24 / match / gambler（已迁移 4 个）+ index 首页
└── sync-core.sh       从 web 复制纯逻辑/音效（只读复制，绝不改 web）
```

**迁移顺序建议**：先复制 web 的 `board.js`（纯逻辑，通常一行不用改 ✓），再重写视图，
最后 `npm run build:mp` + `npm run build:h5` 两个目标一起构建并核对产物。

## 二、必须遵守的约定（用户明确要求过的）

1. **卡片效果照原样**：不要自己定圆角/阴影/间距。用 `App.vue` 里的全局 `.card`（14px 圆角 /
   `0 2px 12px rgba(0,0,0,.08)` / `#fff`），行高用 web 的 `--row-height: 72px`（= 138rpx）。
2. **不要页面内 header**：标题交给**小程序原生导航栏**（`pages.json` 的 `navigationBarTitleText`）。
3. **帮助 / 模式切换 = 右下角悬浮圆按钮**：竖直排列，**模式在上、帮助在下**，圆形 + 2rpx 边框 + 阴影，
   **按钮上不要文字**（只用 **UnoCSS 图标**，见第八节；不要用 emoji）。当前 96rpx（≈50px）。
4. **帮助文案必须是 web 的真实中文原文**（`src/games/<id>/i18n.js` 的 `help1..N`），不要写简版提示；
   弹窗 `title: ''`（否则第一段会重复出现两次）。
5. **保存键与 web 完全一致**（`__game_2048__state` / `__point24__state` / `__emoji_match__state` /
   `__gambler__state` 等），一律走 `core/storage.js`，不要另起 key。
6. **顶部首卡到顶栏的距离全游戏统一**：`.page` 的 `padding` 统一 `27rpx 24rpx 40rpx`。
7. **页面间距统一** `31rpx`（= web 的 `--row-gap: 16px`）。
8. **不加 web 没有的东西**：比如不要在 2048 下面加「滑动屏幕操作」提示（web 没有，用户会要求删掉）。
9. **所有翻面动画只用一套写法**（用户 2026-10 明确要求「以后翻面的动画全都按照这个来」）：
   见 **第二十一节「翻面动画唯一标准」**。别再自己发明 —— 不要 `v-if` 换面 + 单面转进来、
   不要 `scaleX` 压扁、不要 `preserve-3d` / `backface-visibility`、不要在没有 `.face` 的场景里手搓。

## 三、踩过的坑（每一条都是真实返工）

### A. 构建 / 产物类

1. **改完必须两个目标一起构建** ✗✗（重复犯过 3 次）：
   ```bash
   npm_config_cache=/tmp/npm-cache npm run build:mp   # 小程序产物
   npm_config_cache=/tmp/npm-cache npm run build:h5   # 浏览器验证
   ```
   只跑 H5 时，用户看开发者工具还是**旧包** → 「都没变啊」「还是居中」「还是文字」。
   构建完**一定要 grep 产物**确认规则真的进去了（`app.wxss` / `pages/<x>/<x>.wxss` / `*.wxml`）。
   开发者工具对 `dist` 有缓存：**点「编译」**，还不行就重新导入项目。
2. **npm 缓存权限问题**：本机 `~/.npm` 有 root 残留 → `EPERM`。所有命令都带
   `npm_config_cache=/tmp/npm-cache`。
3. **`@dcloudio/*` 必须同 tag，vite 用 peer 要求的精确版本**（现在 `3.0.0-5030320261023001` +
   `vite 5.2.8`），否则 `ERESOLVE`。

### B. 样式类

4. **scoped 样式管不到插槽内容**：`.fab` 的样式写在 `FloatingActions.vue` 的 `<style scoped>` 里，
   而 `.fab` 是页面通过插槽传进来的节点（带的是页面的 `data-v`）→ 小程序里**边框/阴影全丢**。
   → 插槽节点的样式写在 **`App.vue` 全局**。
5. **CSS 里既有单行规则也有多行规则**：`.card { border-radius: 18rpx; ... }` 是单行，
   我按多行写的正则漏掉了它 → 圆角/阴影没清掉。改样式前先 `grep` 出真实文本，别凭记忆写匹配串。
6. **用「区间替换」大段样式会误删中间规则**：我在 24 点里从 `.opt {` 替换到 `.result {`，
   把中间的 **`.game-area`** 一起删了 → 数字区/符号区挤在一起（没有 `gap`）。替换区间后要
   **列出该区间内的选择器**再确认。
7. **类名冲突**：对对碰的棋盘牌也叫 `.card`，和全局 `.card`（白卡）冲突 → 分数区/操作区被
   `position: absolute` + 染成绿色。棋牌类游戏的牌统一叫 `.tile`（与 web 同名）。
8. **`.page` 和 `.screen` 都写 `min-height: 100vh`** → 200vh → 页面能白滚 50px。一页只留一处。
9. **父级 `display:flex; align-items:center` 会把 header 居中**：给 header 写 `width:100%` /
   `margin-left:auto` 在真机上仍会被居中 → 唯一可靠做法是**把 header 移出 flex 的 `.page`**，
   放进普通 block 的 `.screen`。（后来用户直接要求去掉 header，改右下角悬浮按钮。）
10. **不要关小程序原生导航栏**：曾用 `navigationStyle: custom` 把 header 顶到系统状态栏/胶囊那一层，
    结果**无法操作**。现在 `pages.json` 全部用默认导航栏；页面内不再有 header。
11. **`env(safe-area-inset-top)` 之类只在需要时加**：现在只用在悬浮按钮的 `right`/`bottom`，
    页面内不要再留重复的 `padding-top`（会被后面的 `padding` 简写覆盖，成为死代码）。
12. **rpx 换算**：web 用 px，小程序用 rpx（750rpx = 屏宽；390 宽时 1px ≈ 1.923rpx）。
    照 web 的数值换算，别自己另调：行高 72px→138rpx、圆角 14px→27rpx、间距 16px→31rpx、
    数字键 56px→108rpx、运算符高 44px→85rpx、退格 30px→58rpx、`--radius-tile` 8px→15rpx。

### C. 逻辑 / 组件类

13. **「名字出现过」≠「已经 import」**（重复犯过 4 次）：`facePref` / `playElimination` /
    `playFail` / `isFlower` 都出现过「用了却没 import」，运行时 `ReferenceError`，重则**整页空白**。
    改完单独看一眼 import 行，别靠脚本判断。
14. **小程序没有 Pointer Events**：2048 的滑动用 `@touchstart` / `@touchend`（`changedTouches`）。
15. **小程序没有 DOM 测量 / 克隆**：赌神（飞牌）这类 `getBoundingClientRect` + `cloneNode` +
    `element.animate` 的动画要降级（直接出现 / 纯 CSS），并在交付时说明。
16. **3D 翻面（`rotateY`）没有验证过**，对对碰先用淡入淡出替代 —— 属于**明确的降级**。
17. **牌面比例**：emoji 是正方形（字号 = 格子宽 × 0.42）；麻将牌是雪碧图 131:168（≈1.282），
    压成正方形会变形 —— 行高要按比例算（`tileH`）。
18. **`uni.showModal` 内容过长会滚动**（帮助 6 段也可以），但 `title` 留空，避免文案重复。
19. **`uni.*StorageSync` 存字符串**：JSON 自己 `JSON.stringify`，读出来再 parse（`core/storage.js` 已封装）。
20. **音频能力差异**：web 是 Web Audio（精确增益 + 交叉淡入淡出），小程序只有 `InnerAudioContext`
    （能设 `volume` / `loop`，做不了真正交叉淡化）→ 音效用「播一下」即可。

### D. 验证方法类（不验证就等于没做）

21. **H5 先验功能**：`npm run build:h5` 后 `python3 -m http.server`（**不要用 `npx http-server`**，
    本机 npx 缓存可能直接失败，而且它会静默起不来）→ headless Chrome 里点/滑/切模式，读 DOM 断言。
22. **同一个 tick 里读 DOM 会读到旧值**：点完按钮等 80~300ms 再查（Vue 是异步渲染）。
23. **hash 跳转不会重新加载页面**：`location.hash = '#/pages/x/x'` 复用旧实例，模块级状态不会重算 ——
    要验证「冷启动」必须 `Page.reload` 或直接 `Page.navigate` 到完整 URL。
24. **对象字面量的 key 不能带空格/特殊字符**：写探针时 `{ 算式↔数字间距: … }` 直接 SyntaxError。
25. **macOS 没有 `timeout` 命令**：限时要自己 `cmd & sleep N; kill`（或后台 job）。
26. **量「是否居中」要量矩形**：`中心x` vs `视口宽/2`；量「按钮是否太长」要量宽度并和 web 的
    实测值比（例如 24 点按钮 79/92px、赌神 78/90px）。
27. **遮罩覆盖率**：遮罩矩形必须与容器矩形**完全重合**（左/上/宽/高都差 < 1px），不能只看「看见了」。

## 四、每个游戏的迁移清单（照做即可）

- [ ] 复制 web 的 `board.js`（纯逻辑）到 `src/pages/<id>/`
- [ ] 复制用到的资源（雪碧图 / 音效），改 import 路径为 `@/static/...`
- [ ] 页面结构对齐 web：**分数区 → 操作区 → 游戏区**（顺序不要自己调）
- [ ] 卡片一律 `class="card"`（吃全局 token）；区间内的子卡（数字/符号/手牌/答案/选择）也要有 `.card`
- [ ] 操作区按 web 的比例分格（如 1.3 / 1.3 / 1.5、24 点三等分），格与格之间加 `.divider`
- [ ] 按钮用**自然宽度**（不要 `flex: 1` 拉满）
- [ ] 帮助 / 模式切换放在**右下角悬浮按钮**（模式在上、帮助在下、无文字）
- [ ] 帮助文案用 web 的 `help1..N` 中文原文
- [ ] 存档 key 与 web 一致，`onMounted` 先 restore 再 deal
- [ ] `pages.json` 注册页面 + 首页加卡片（图标 + 中英名）
- [ ] `npm run build:mp` + `npm run build:h5` 都通过，并 grep 产物确认样式/结构
- [ ] headless Chrome 跑一遍：进入 → 核心操作 → 胜负/失败态 → 刷新恢复 → 量矩形
- [ ] 降级项写进本文件与交付说明

## 五、已知降级（对用户要主动说明）

| 项 | web | 小程序 | 原因 |
| --- | --- | --- | --- |
| 对对碰牌面 | emoji / 扑克 / 麻将 | emoji / 麻将 | 扑克牌面（`CardItem`）未移植 |
| 图标 | UnoCSS presetIcons（mask 渲染）| 同左，但小程序侧只 H5 验证过 mask | 需真机确认 `-webkit-mask` |
| 赌神飞牌 | 克隆牌 `element.animate` 飞入 | fixed 替身 + `selectorQuery` 测量 + transition（拿不到位置时退化成 CSS 入场）| 已实现，非 DOM 克隆 |
| 音频 | Web Audio 精确增益 + 淡入淡出 | `InnerAudioContext` 设音量 | 平台能力差异 |
| 帮助弹窗 | 分条富文本弹层 | `uni.showModal` 纯文本 | 小程序没有 DOM 弹层 |
| 主题 | 亮/暗两套 CSS 变量 | 仅亮色 | 还没做 |
| 清记录彩蛋 | 标题连点 5 次 | 无（原生导航栏无标题点击） | 未实现 |

## 六、项目类型必须是「小程序」，不能是「小游戏」

微信开发者工具报下面两条错，说明**项目被当成了小游戏**，不是代码坏了：

```
Uncaught SyntaxError: Unexpected end of JSON input
[ app.json 文件内容错误 ] game.json: 未找到 game.json 文件，或者文件读取失败
```

小游戏（`game.json` + `game.js` + canvas）和小程序（`app.json` + WXML/WXSS + 页面）是**两套运行时**：
本工程是 uni-app 编出来的**小程序**，在「小游戏」模式下**跑不了**，也无法通过改代码适配。

排查/修复顺序：

1. 确认产物是**小程序**结构（`dist/build/mp-weixin/` 下应有 `app.js` / `app.json` / `app.wxss`，
   **没有** `game.json`），且 `project.config.json` 里 `"compileType": "miniprogram"`：
   ```bash
   npm_config_cache=/tmp/npm-cache npm run build:mp
   grep -o '"compileType":[^,]*' dist/build/mp-weixin/project.config.json
   ```
2. 开发者工具里**重新导入项目**，导入类型选「**小程序**」（不要选「小游戏」）。
3. appid 必须是**小程序**的 appid：小游戏 appid 与小程序 appid 是**注册时定死**的两种类型，
   拿小游戏 appid 永远会被工具按小游戏打开。真机预览就把 `src/manifest.json` 的
   `mp-weixin.appid` 换成你自己的**小程序** appid；本工程已配好真实 appid `wx44d366fc7dc1dec1`（在 `src/manifest.json`）。
4. 工具会把它自己的 appid 写回 `dist/build/mp-weixin/project.config.json` —— **重新 build 会重置**，
   所以「构建后 appid 变了」是正常的，以 `manifest.json` 为准。

> **交付约定**：只改 `mp/` 目录时，**结尾不要提醒用户 commit / push**（用户已明确说明）。
> 只有改动到 web 仓库（`src/`、`docs/`、根配置）时才提。

## 七、彩带与遮罩按钮（用户报过两次）

1. **彩带只在「真正赢下这一刻」放**：恢复存档的胜利态**不能**放（web 的老约定：恢复界面不播任何动画）。
   实现：每个游戏一个 `justWon` ref，只在 `win()` / `gameResult = WIN` 里置 true，4 秒后自动复位；
   模板写 `<Confetti v-if="justWon" />`，**不要**直接拿 `phase === WON` 判断 —— 恢复的胜利态 phase 也是 WON。
3. **「恢复动画」也算动画**：只挡彩带（`justWon`）不够 ✗。用户报过 —— **对对碰赢了以后退出重进，
   游戏区会先渲染出卡背再消失**。原因不是彩带，而是两个 CSS 动画在恢复时重播了：
   - `.tile { animation: card-in … }`（发牌）→ 牌从 0 缩放出现；
   - `.tile.matched { animation: match-blink … forwards }`（消除）→ 已消掉的牌**再闪一遍才缩没**，
     这才是「卡背闪一下然后消失」的真凶。
   **修法**（`pages/match/match.vue`）：加 `const silentRestore = ref(false)`，
   `initLevel(lv, restored)` 里 **restored 分支置 true、新开一局置 false**；
   - `cardStyle()` 里 `silentRestore` 为真时不写 `animationDelay`；
   - 模板 `<view class="board" :class="{ 'no-deal': silentRestore }">`；
   - CSS：`.board.no-deal .tile { animation: none }`、`.board.no-deal .tile.matched { animation: none; opacity: 0; transform: none }`（直接终态）。
   **验收**（注入一个 `phase: 'won'`、cards 全 matched 的 `__emoji_match__state` 再 reload）：
   `.board` 有 `no-deal` ✓、12 张牌 `animationName` 全为 **none**、`animationDelay` 全 `0s`、
   可见牌 **0** 张、600ms 后仍 0 张、结算层在 ✓、0 异常。
   > 以后凡是「恢复存档要看起来像一开始就停在那」的页面，都照这个做：**状态标志 + 关掉 CSS 动画**，
   > 而不是只靠 `v-if` 挡住某个元素。

2. **遮罩按钮必须居中**：全局 `.result-btns`（`App.vue`）= `justify-content: center` + `width: 100%` +
   `.btn { flex: 0 0 auto }`（按钮自然宽度）。**不要在页面里再写 `width: 70%` 之类的局部规则**（会被
   scoped 覆盖、按钮整组偏左）。只有一个按钮的遮罩（2048 / 24 点胜利）靠 `.result` 的
   `align-items: center` 居中即可。验证方式：量「按钮组中心」与「遮罩中心」，偏差必须 ≤ 1px。

## 八、图标一律用 UnoCSS（与 web 同一套），不要拿 emoji 顶替

web 用 UnoCSS + `presetIcons`（carbon / mdi / dinkie-icons）。小程序这边**同样接 UnoCSS**，
类名与 web **完全一致**：`i-carbon-help`（帮助）、`i-mdi-emoticon-happy-outline` /
`i-dinkie-icons-three-of-circles-mahjong`（对对碰模式）、`i-mdi-lightning-bolt` / `i-mdi-check-all`
（赌神模式）、`i-mdi-lightbulb-on-50`（对对碰牌背）、首页图标见 `src/shared/games.js`。

### 接法（已配好，别重复折腾）

- `uno.config.js`：`presetWeapp({ platform: 'uniapp', whRpx: true })` + `presetIcons({ scale: 1.2,
  extraProperties: { display: 'inline-block', 'vertical-align': 'middle' }, collections })` +
  `transformerClass()`；三个集合（carbon / mdi / dinkie-icons）与 web 一致。
- `vite.config.mjs`：`plugins: [uni(), UnoCSS()]`。
  **必须是 `.mjs`** —— `package.json` 没有 `"type":"module"`，`.js` 配置会被 esbuild 转成 CJS，
  而 `unocss/vite` 是纯 ESM，`require` 直接报 "ESM file cannot be loaded by require"。
- `@dcloudio/vite-plugin-uni` 是 CJS（`exports.default`），ESM 下要 `uniModule.default ?? uniModule`，
  否则报 `uni is not a function`。
- `src/main.js` 里 `import 'uno.css'`。
- 运行时才决定的类名（首页卡片图标、模式切换图标）**必须写进 `safelist`**，静态扫不到就不会生成。

### 坑（都是实测过的）

1. **图标类不能写在圆形按钮本体上**：`i-xxx` 会给自己加 `mask` + `background-color: currentColor` +
   `width/height: 1.2em`。如果和 `.fab` 同一个节点，`mask` 会把整个圆形按钮**裁成图标形状**
   （截图里就是一圈幽灵轮廓、没有白色圆形）。正确写法是图标放**内层**：
   ```html
   <view class="fab" @click="showHelp"><view class="fab-ico i-carbon-help" /></view>
   ```
   `.fab` 只负责圆形 + 边框 + 阴影 + `color`（图标上色靠 `currentColor`，现在是 `#333`）；
   图标大小 = `.fab` 的 `font-size` × 1.2。
2. **图标颜色就是 `color`**：对对碰牌背要白图标 → `.back { color: #fff }`（web 的
   `.back-face { background: var(--primary-bg); color: #fff }` 同款）；首页卡片图标 `#333`。
3. 生成的 WXSS 长这样（`mask` + `-webkit-mask` 双写，`data:image/svg+xml` 内联，无外链）：
   ```css
   .i-carbon-help{--un-icon:url("data:image/svg+xml;utf8,...");-webkit-mask:var(--un-icon) no-repeat center/100% 100%;
                  mask:var(--un-icon) no-repeat center/100% 100%;background-color:currentColor;width:1.2em;height:1.2em}
   ```
   H5 实测渲染正常；小程序侧要确认 WebView 的 `-webkit-mask`（WeChat 的 XWeb / WKWebView 支持）。
   万一某些机型不认（图标空白、只剩色块），退化方案：给 `presetIcons` 加 `mode: 'bg'`
   （改用 `background-image` 渲染，代价是失去颜色继承，需要单独给彩色图标定色）。
4. **不要再写 emoji 当图标**（`❓` / `💡` / `⚡` 之类）—— 用户明确要求与 web 用同一套图标。

## 九、首页蜂窝（`src/pages/index/index.vue`）

照 web 的 `HomePage.vue` 做：**尖顶六边形 + 逐行交替咬合**，没有标题/副标题（用户要求删掉 hero 文案）。

- 六边形：外层 `clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)` 当描边色，
  内层再缩进 4~5rpx、同形状铺白底（web 的双层实现）；尺寸 `$hex-w:160rpx` / `$hex-h:185rpx`
  （比例 1.156 ≈ web 的 1.1547）。
- 行间咬合：`.hex-row:not(:first-child) { margin-top:-40rpx }`；与上一行同奇偶时
  `translateX(半格 + 缝隙/2)`。
- 图标仍走 UnoCSS 类名（与 web 的 `shared/games.js` 一致），名字 20rpx。
- **行宽策略是临时的**（用户：先随意排列，等 25 个游戏都迁移完自然就和 web 一样）：
  `games.length <= 4 ? [3,1] : [4,3,4,3,4,3,4]`。迁移到 5 个以上就会走 web 的 4/3 交替，
  等全部迁完把这段特判删掉即可（直接用 `[4,3,4,3,4,3,4]`）。

## 十、真机图片空白：包内图片在真机可能根本加载不出来

**症状**：开发者工具 / H5 里麻将牌正常，**真机调试时牌面全白**（只剩白底或边框）。

踩过两次，两个不同的原因，所以现在**两层都绕开了**：

| 尝试 | 做法 | 真机结果 |
| --- | --- | --- |
| ① 最初 | `background-image: url('/static/mahjong-tiles.webp')` + `background-position` 裁切 | ✗ 空白（WXSS 不允许本地图片路径做背景）|
| ② 然后 | `<image src="/static/mahjong-tiles.webp">` + 负 `left/top` 裁切 | ✗ 仍空白（包内图片路径 / WEBP 解码兼容性）|
| ③ 现在 | `<image>` + **JPEG base64 data URI** | ✅ 不依赖包内文件、不依赖 WEBP 解码 |

### 现在的实现

- `src/static/mahjong-tiles.jpg`（917×1176，q90，281KB）→ `node scripts/gen-sprite-data.mjs`
  → `src/shared/spriteData.js`（`TILE_SHEET_DATA = 'data:image/jpeg;base64,...'`，约 366KB）。
  **换图只改 jpg，然后重跑这个脚本，别手改 spriteData.js。**
- `MahjongTile.vue`：`<view class="mj-wrap"><image class="mj-img" :src="src" :style="vars" mode="scaleToFill" /></view>`
  —— `.mj-wrap` 是 `position:relative; overflow:hidden; border-radius:inherit`，
  图放大到 `735%`（7 列 × ZOOM 1.05）后用负 `left/top` 把目标格推到可视区中心。
  百分比换算：`background-position: P%` 等价于 `left = −P/100 × (S−1) × W`，化简后
  `left = −(ZOOM*(col+0.5) − 0.5) × 100%`（与元素尺寸无关）。
- 为什么用 JPEG 不用 WEBP：雪碧图本身没有透明通道（RGB），转 JPEG 只损失一点点；
  而 WEBP 在真机的解码支持不稳（基础库/系统版本），是最可能的坑之一。q90 全分辨率 281KB，
  和原 webp（256KB）几乎一样大。

### 以后加图片资源照这个来

1. 能内联就内联成 base64（几十~几百 KB 的图）→ 最稳；
2. 必须走文件的话，<image> 组件比 CSS `background-image` 靠谱，但**仍然要真机验一次**；
3. 排查：`grep -o 'url([^)]*' dist/build/mp-weixin/*.wxss` 只应出现 `data:` 开头的；
   音频 `innerAudioContext.src = '/static/audio/x.mp3'` 属于 API 资源，不受这些限制。

## 十二、对对碰「不会翻面」：`v-else` 让牌面常显

**症状**：麻将模式下（emoji 模式正常）牌一直是正面，观察期结束也不翻面 —— 看起来像翻面逻辑坏了。

**原因**：模板里牌背写成了
```html
<view v-if="!card.flipped && phase !== PREVIEW && mode !== MODE_MAHJONG" class="back" />
<template v-else>   <!-- ✗ 麻将模式也走这里 -->
  <MahjongTile ... />
</template>
```
麻将模式下 `v-if` 恒为 false（因为有 `mode !== MODE_MAHJONG`），于是 `v-else` 的**正面牌面永远渲染** ✗。

**正确写法**：牌背和牌面**各自独立判断**，麻将模式的牌背只用 `.tile.mjback` 的绿底表示：
```html
<view v-if="!card.flipped && phase !== PREVIEW && mode !== MODE_MAHJONG" class="back i-mdi-lightbulb-on-50" />
<template v-if="card.flipped || phase === PREVIEW">   <!-- ✅ 只有翻开或观察期才画牌面 -->
  <text v-if="mode === 1" class="emoji">…</text>
  <MahjongTile v-else … />
</template>
```

**验证**（H5 探针，等 2s 观察期结束再点一张）：
- 麻将：观察期 `up:6 / face:6`（正面）→ 翻面后 `face:0 / mjback:6`（绿背）→ 点一张 `face:1 / mjback:5` ✓
- emoji：观察期 `up:6 / face:6` → 翻面后 `bulb:6` → 点一张 `face:1 / bulb:5` ✓

教训：**`v-if` / `v-else` 里带模式判断时，要确认每个模式都落到了预期的分支**；
牌面/牌背这种「二选一」的结构，用两个独立 `v-if` 比 `v-else` 安全。

## 十三、动画清单（每处实现在哪、怎么验）

小程序的动画**只能用 CSS transition / animation**（没有 Web Animations API、没有 DOM 克隆）。
下面这些都已在 H5 用 `getComputedStyle(...).animationName` 逐个验过：

| 位置 | 动画 | 实现 |
| --- | --- | --- |
| 首页蜂窝 | 逐格弹入 `hex-pop` 0.4s，每格错开 40ms | `.hex` + `:style="{ animationDelay: hexDelay(ri,gi)+'ms' }"` |
| 2048 | 牌移动滑动 0.12s | `.tile { transition: left .12s, top .12s }`（之前**完全没有**滑动）|
| 2048 | 新牌 `deal-in`、合并 `merge-pop` | `.tile.is-new` / `.tile.popping` |
| 24 点 | token 弹入 `tok-in` 0.16s | `.tok { animation: tok-in … }`（每加一个 token 都重播）|
| 24 点 | 结算遮罩 `result-in` 0.22s | `.result { animation: result-in … }` |
| 对对碰 | 发牌 `card-in` 0.28s、配对 `match-blink` | `.tile` / `.tile.matched` |
| 对对碰 | 翻面 **3D** | 父级 `.tile { perspective: 700rpx }` + 新翻上来的一面 `@keyframes flip3d-in`（`rotateY(-88deg) → 0`，0.26s）|
| 赌神 | 发牌 `deal-in` 0.34s，**逐张错开 26ms**（开局 / 新一局 / 恢复记录都重播）| `.hand-tile` + `:style="{ animationDelay: i*26+'ms' }"` + **`:key="roundSeq + '-h' + i"`**（`roundSeq` 在 `deal()` 与 `restore()` 里自增，否则 key 不变 → Vue 复用节点 → 动画不重播）|
| 赌神 | 飞牌：小牌飞进答案区 | `flyThenCommit()`：`uni.createSelectorQuery()` 量 `#pick-<key>` 与 `#answer-row`（先组件作用域、再页面作用域），用 fixed 的 `.fly-ghost` + `transition: left/top/opacity .26s` 飞过去，**落地后**才 `commitPick()` |
| 赌神 | 答案区牌入场 `answer-in` 0.26s | `.answer-tile`（拿不到位置时的兜底，保证永远有动画）|
| 德州扑克 | 牌翻面 **3D** | `.card-wrapper { perspective: 700rpx }` + `@keyframes card-flip-in`（`rotateY(-88deg) → 0`）|
| 四个游戏 | 胜利彩带 | `Confetti.vue`（纯 CSS 40 片，见第七节）|

**飞牌的关键点**（下次做同类动画照抄）：
```js
// 1) 起点/终点用 id 选择器（mp 的 selectorQuery 不支持属性选择器）
<view :id="'pick-' + k" …>            <view id="answer-row" …>
// 2) 量两次：组件作用域拿不到就退回页面作用域
const rect = (await queryRect(sel, true)) || (await queryRect(sel, false));
// 3) 替身先「落原位」，下一拍再改 left/top 才会触发过渡（同一拍改没有动画）
flyGhost.value = { left: from.left, top: from.top, … };
await sleep(30);
flyGhost.value = { …flyGhost.value, left: to.left, top: to.top };
// 4) 过渡结束（260~280ms）后再真正把牌放进答案区
```

## 十四、麻将三兄弟（英雄 / 雀圣 / 传奇）迁移记录

三个都是「雪碧图牌面 + 5~8 行棋盘 + 统计条/操作区」的同一族，页面结构一致：

| 游戏 | 页面 | board.js | 存档 key |
| --- | --- | --- | --- |
| 麻将英雄 | `pages/mahjong/mahjong.vue` | 126 行（原样复制）| `__mahjong_hero__state` / `_level` / `_best_` / `_mode` |
| 雀圣 | `pages/quesheng/quesheng.vue` | 537 行（逐字节相同）| `__quesheng__mode` / `_level[_2]` / `_state[_2]` |
| 麻将传奇 | `pages/legend/legend.vue` | 203 行（逐字节相同）| `__mahjong_legend__state` / `_best_1` / `__legend__suit` |

每个目录都是三件套：`<id>.vue` + `board.js`（从 web 原样复制，只允许改 import）+ `i18n.js`（局部字典 + `tt()`）。
首页图标：`i-dinkie-icons-five-of-circles-mahjong` / `-white-dragon-mahjong` / `-seven-of-bamboos-mahjong`（都在 safelist 里）。

### 这三个的关键实现点

- **棋盘尺寸**用「视口 → rpx」按 web 的 `byW / byH` 同口径算（`PAGE_FIXED_H` 里列清固定高度），
  并且 `Math.max(46, …)` 兜底；牌是 131:168 竖牌，`<MahjongTile :suit :value>` 自己填满父级槽位。
- **波浪铺牌**：`animationDelay = (行+列) × 60ms`；`dealSeq` 拼进 `:key`，否则重开一局 key 撞车、
  Vue 复用旧元素 → 波浪不重播。
- **滑动**（雀圣）：`@touchstart/@touchend` + `changedTouches`，阈值 ~24px，滑完 320ms 内屏蔽补发的 tap。
- **点组消除**（雀圣）：橙框高亮 `#ffa63d`、提示气泡用 `--tip-tx/--tip-ty` 定位、消除走「浮影层 + 闪烁」。
- **撤销/重做**（雀圣）：整盘 + 步数一起回滚，上帝模式播放中禁用。
- **上帝模式**（雀圣）：`applySlide(dir, true)` 放行位、`.automask` 挡输入、再点停止、
  `solveBeam → solvePuzzle` 兜底。
- **飞牌**（传奇落子、英雄拖拽）：`uni.createSelectorQuery()` 量 `#hand-current` / `#cell-N` +
  fixed 替身 + `transition`，量不到就直接落位（绝不卡住）。

### 教训：**棋盘高度要给右下角悬浮按钮让位**

红框踩过：8×7 的传奇、5×5 的雀圣，棋盘/撤销卡一直铺到屏幕底部，右下角两个 `.fab`
（96rpx ×2 + 24rpx gap + 40rpx 底距 ≈ 256rpx）会**压住最右列的格子或「重做」按钮** ✗。

处理办法（按优先级）：

1. 底部有**整行按钮**（雀圣的撤销/重做）→ 给那一行加 `padding-right: 130rpx`，让按钮右端让开按钮组，
   棋盘尺寸保持不变（雀圣 361×450rpx ≈ web 的 355×445 ✓）；
2. 底部**就是棋盘**（传奇）→ 必须把棋盘整体缩小：`PAGE_FIXED_H` 加大 ~130rpx
   （实测从 536 → 666，棋盘 361 → 317 宽，**必然比 web 小一点**，这是为「所有格子都能点到」付的代价）；
3. 页面底部 padding 统一 `140rpx`（原来是 48rpx），避免内容贴底。

**验收方式**：量「页面内最靠下的可交互元素 bottom」与「`.fab` 的 top」，前者必须小于后者；
再逐页确认 `document.documentElement.scrollHeight - innerHeight` 只有 H5 导航栏那 44px。

### 用子任务（subagent）移植的经验

- 大文件移植适合丢给子任务（各自独立上下文），但**必须写清楚**：读 `mp/AGENTS.md`、照已迁移页面写、
  只写自己目录、**不要 build**（并发 build 会互相覆盖 `dist/build/*`）、不要碰 pages.json / index / core / components / uno.config。
- 子任务交付后**我一定自己 build + 跑探针**：出现过「`:key` 编译成 `wx:key` 是否生效」「棋盘压到悬浮按钮」
  这类只有构建后才发现的问题。
- 子任务报告里的「风险点」要逐条复核，别直接采信。

## 十五、牌面「整片空白」的第三个原因：自定义组件的宿主节点没有宽高

**症状**：雀圣 / 麻将传奇的游戏区里牌全都不见了（棋盘格子还在，牌面空白）；赌神 / 英雄正常。
H5 完全正常，只有小程序里空。

**原因**：小程序里自定义组件（`<mahjong-tile>`）的**宿主节点默认没有宽高**。
`MahjongTile.vue` 的根 `.mj-wrap` 是 `width:100%; height:100%`，而它的 100% 是相对宿主算的 →
宿主高度 auto → `.mj-wrap` 高度 0 → 里面的 `<image>` 再大也看不见 ✗。
赌神/英雄没事，是因为它们的牌外框把尺寸直接给了组件（`.answer-tile` / `.hand-tile` 是普通 view，
组件宿主没被要求 100%），而雀圣/传奇把 `<MahjongTile>` 放进了一个**同样是 100% 的容器**里。

**修法**（`src/components/MahjongTile.vue`）：
```html
<style lang="scss">          <!-- ⚠️ 必须是非 scoped 块 -->
:host { display: block; width: 100%; height: 100%; }
</style>
```
- `scoped` 会把 `:host` 编译成 `.data-v-xxx:host`（小程序里永远匹配不上）→ 一定要单独开一个非 scoped 块；
- H5 下 `:host` 不生效但也无害；
- 改完用 `grep -o ':host{[^}]*}' dist/build/mp-weixin/components/MahjongTile.wxss` 确认产物里是**裸的** `:host{...}`。

另外顺手加固：雀圣的 `tileStyle()` 原来返回**样式数组** `[pos, size, delay]`，小程序对数组样式支持不稳，
已改成合并成一个对象（H5 正常不代表 mp 正常）。

### 棋盘内边距 / 牌面在格子里居中（用户报过）

- **传奇**：棋盘原来没有内边距，牌直接贴棋盘左右边 ✗。修法：加 `const PAD = 12`（rpx），
  `boardW/boardH` 各加 `PAD*2`、`byW` 里扣掉 `PAD*2`，`cellStyle` 与 `tileStyle` 的 `left/top`
  都加 `PAD`。实测左右内边距 **7px / 7px** ✓，格子与牌同步偏移（只改牌不改格子会错位）。
- **雀圣**：牌面铺满整个格子，看起来「牌挤在格子左上、图案贴边」✗。web 的牌与格子之间有一圈呼吸空间 →
  给 `.tile .mj { width: 93%; height: 93% }`（flex 居中），实测牌面 59×76 在 64×82 的格子里，
  四边偏移 **2 / 2 / 3 / 3 px** ✓ 居中。
- 验证方式：量 `.tile`/`.tile-slot` 与 `.mj`（或 `.tile-slot` 与 `.grid-cell`）的矩形，
  左/右、上/下偏移应各自相等（±1px）。

## 十六、第二批迁移（贪吃蛇 / 德州扑克 / 1A2B / Threes / 数独）

| 游戏 | 页面 | 逻辑文件 | 存档 key |
| --- | --- | --- | --- |
| 贪吃蛇 | `pages/snake/snake.vue` | `wall.js`（穿墙偏好，改成 `@/core/storage`）| `__snake_game__difficulty/_best/_state` |
| 德州扑克 | `pages/poker/poker.vue` + `card.vue`（本地牌面组件）| `board.js`（web 的 rules/bet/dice 合并）| `__poker_game_total/_bet/_dice` |
| 1A2B | `pages/guess/guess.vue` | 无 | `__guess_number__robot` |
| Threes | `pages/three/three.vue` | 无（逻辑在 web 组件里）| `__threes_game__state/_best` |
| 数独 | `pages/sudoku/sudoku.vue` | `board.js`（= web `sudoku.js` 逐字节）| `__sudoku_game__state/_difficulty/_cand_all/_<难度>` |

要点与小坑：

- **贪吃蛇用 CSS 棋盘替 canvas**：小程序 `<canvas>` 是原生组件，暂停/失败遮罩压不住它（z-index 无效）→
  棋盘用两层 45° 渐变画格、蛇身/食物用绝对定位 view + rpx 几何（参数照 web 的 `draw()`）。
  本页也是工程里**第一次用页面生命周期**（`import { onHide } from '@dcloudio/uni-app'`）——产物里已确认编译出 `onHide` ✓。
- **德州扑克的牌面**用局部组件 `card.vue`：花色是**文字 ♠♥♦♣ + CSS 上色**（不引图片），
  牌背/Joker 走 UnoCSS 图标；`num` 属性**必须声明成 Number**，页面用 `numOf()` 把牌背的 `''` 折成 0
  （小程序自定义组件会强制类型转换，传 `''` 可能变 NaN，牌背判定就坏了）。
- **1A2B 没有局面存档**：web 的 `GuessNumber.vue` 实际只写 `__guess_number__robot`，
  AGENTS.md 里提到的 `_state/_best` 在 web 代码里从未写入 —— 别照文档补一个假的恢复逻辑。
- **Threes / 2048 的滑动**都是 `touchstart/touchend + changedTouches`、阈值 20px；
  牌移动靠 `transition: left/top`，新牌 `appear`、合并 `bump` 关键帧（名字全工程唯一）。
- **数独棋盘缩到 630rpx**（web 361px）：按 web 原尺寸时「擦除」按钮会被右下角悬浮按钮压住，
  缩 8% 后 tools bottom 1249rpx < fab top 1286rpx。想还原 web 尺寸要用「给 tools 加 padding-right:130rpx」的办法。
- **可滚动页面（poker / sudoku / guess）不要加 `disableScroll`** —— 长列页面禁滚动会切掉底部操作区；
  只有贪吃蛇（滑动转向）加了。悬浮按钮让位办法：底部 `padding-bottom:140rpx` + 关键行 `padding-right`/`margin-bottom`。

### 批量移植（5 个并行子任务）的经验

- 5 个任务**只写各自目录、不 build**，因此可以并行 —— 构建由我一个人做，最后统一 `build:h5` + `build:mp` + 逐页探针。
- 每个子任务的自检只能到 `@vue/compiler-sfc` + 逻辑仿真；**以下问题只有我构建后才发现**：
  `pages.json` 注册与 `disableScroll` 取舍、UnoCSS safelist（动态 class）、`:key → wx:key`、
  右下角悬浮按钮压住底部按钮（guess 的「提交」、sudoku 的「擦除」、legend 的「重做」都踩过）。
- 验收清单固定为：13 个页面逐页进 → `Runtime.exceptionThrown` 计数 → 关键元素计数 → 核心交互
  （滑动/点击/提交）真的改变状态 → 截图看一眼 → 首页蜂窝数量与名字。

## 十七、3D 翻转（rotateY）的标准做法 —— WXSS 是支持的（⚠️ 单面写法已被第二十一节取代）

以前把「3D 未验证」当降级，其实小程序 WebView 里 `transform: rotateY()` **是支持的**，
只是**不要依赖 `preserve-3d` / `backface-visibility`**（不同基础库表现不一致）。可行做法：

> **⚠️ 本节保留作历史参考。翻面一律改用第二十一节的「两面常驻」标准；**
> **只有确实无法两面常驻（内容是新节点、旧节点必须消失）时，才退回下面的单面写法。**

1. **父级加透视**：`.tile { perspective: 700rpx }`（扑克是 `.card-wrapper`）；
2. **牌面/牌背用 `v-if` 交替**（本来就是为了换内容），只给**新翻上来**的那一面加动画：
   ```css
   @keyframes flip3d-in {
     0%   { transform: rotateY(-88deg); opacity: .35; }
     55%  { opacity: 1; }
     100% { transform: rotateY(0deg); opacity: 1; }
   }
   .tile .back, .tile .emoji, .tile .mj { animation: flip3d-in .26s cubic-bezier(.2,.8,.3,1) both; }
   ```
   因为节点是新建的，动画每次翻面都会重播，不需要 `:key`。
3. 验收（H5 探针，点一张牌后在 **+90ms** 读 `getComputedStyle(face).transform`）：
   应拿到 `matrix3d(0.95…, 0, 0.289…, …)` 这种**带 Y 轴分量**的矩阵（即真的在绕 Y 旋转），
   而不是 `matrix(a,b,c,d,…)` 那种 2D 压扁。

已实现：**对对碰**（emoji / 麻将两种牌面，用的是**两面常驻 + 同时旋转**，见第十八节第 10 条）、
**德州扑克**（发牌时 5 张依次翻，用的是「新面转进来」的 `card-flip-in`）。

> 选型建议：**能两面常驻就两面常驻**（整张牌翻过去更自然）；
> 只有「内容是新节点、旧节点必须消失」时才用 `flip3d-in` 那种单面方案。
还没迁移的三个 web 游戏里有 3D 翻转：`hunter`（猎手）、`detective`（侦探）、`mirror`（Emoji 镜像）——
等它们迁移时照上面这套写，不要再降级成 2D。

## 十八、第三轮修复（帮助弹窗 / 对对碰发牌 / 雀圣网格 / 1A2B 键盘）

### 1. 帮助弹窗改成自绘的 `HelpSheet.vue`（12 个页面统一）

`uni.showModal` 的三个硬伤：**没有图标**、**字号偏大**、**内容里的 `\n\n` 会被吃掉**（看起来完全没分段）。
现在统一用 `src/components/HelpSheet.vue`：

- 顶部 **`i-carbon-help` 问号图标**（68rpx，主色绿）；
- 内容按 `\n\n` 拆成段落（`<text class="help-p">`，23rpx / 行高 1.62），段间 14rpx；
- 底部「好的，明白」按钮（英文 `OK`）；
- 淡入 + 面板轻微缩放，点遮罩关闭。

接入方式（12 个页面都一样）：`const helpOpen = ref(false)` → `function showHelp() { helpOpen.value = true; }`，
模板末尾 `<HelpSheet :open="helpOpen" :text="…" @close="helpOpen = false" />`。
文案来源两种：全局 i18n 的 `t('helpG2048')`（本身已带 `\n\n`），或本地字典的
`computed(() => ['helpMsg','help1'…'help10'].map(tt).filter(v => v && v !== k).join('\n\n'))`。

### 2. 对对碰：发牌要「逐张铺开」

`.tile` 本来就有 `card-in` 动画，但没有延迟 → 整盘同时出现 ✗。
给 `cardStyle(i)` 加 `animationDelay: (行 + 列) × 55 + 'ms'`（与麻将/扑克同一套波浪节奏）。
注意：**不要在延迟里用会变化的 flag**（例如 `dealing`），动画属性一变就会整盘重播 ✗；
牌是按 `card.id` 重建的，所以重开一局 / 恢复记录自然会重播 ✓。

### 3. 雀圣：牌与背景格子错位

原来格子的排法是 **flex + `padding` + `gap`**，而牌是**绝对定位**（`PAD + col*step`）。
小程序里 flex 的 `gap` 支持不稳（H5 正常、真机可能不支持）→ 格子紧排、牌仍按 gap 走，整盘错位 ✗。

修法：**格子也改成绝对定位**，和牌共用同一份 `PAD / stepX / stepY` 数学：
```js
const cellPos = (c) => ({
  left: `${PAD + (c % SIZE) * stepX.value}rpx`,
  top:  `${PAD + Math.floor(c / SIZE) * stepY.value}rpx`,
  width: `${cell.value}rpx`, height: `${cellH.value}rpx`,
});
```
`.board` 去掉 `display:flex` / `padding` / `gap`，`.grid-cell` 加 `position: absolute`。
**验收**：量每张牌与其对应格子的中心距离（实测 **0**）、格子与牌尺寸同值（64×82）；
牌面在格子内四边偏移 2/2/3/3（93% 居中）。

### 4. 1A2B：猜测答案居中 + 键盘吸底

- `.answer-line { text-align: center }` → 历史行 / 当前输入行整行居中；
- 键盘改成 **`position: fixed`**（`z-index: 20`），`.page` 底部内边距用 `calc(var(--kb-h) + 24rpx)`
  留出键盘高度（`--kb-h` 必须声明在 `.page` 上，否则 `var()` 取不到值）。
  **键盘的最终形态（2026-10 第三次调整，用户口径就是现在这样，别再改回去）**：
  - **贴屏幕底**：`bottom: 0`，底部内边距自己吃安全区 `padding: 23rpx 23rpx calc(16rpx + env(safe-area-inset-bottom))`，
    只圆上面两个角（`border-radius: 27rpx 27rpx 0 0`）。
  - **「退格 / 提交」单独一行、只占 70% 宽、靠左** —— 因为右下角那两颗悬浮按钮（模式 / 帮助）就压在这一行的右边：
    ```html
    <view class="opt-row"> …退格… …提交… </view>
    ```
    ```css
    .opt-row { display: flex; justify-content: space-between; width: 70%; }
    .opt-row .number-button { flex: 0 0 calc(50% - 8rpx); margin: 8rpx 0; height: 88rpx; }
    ```
    ⚠️ `width: 70%` 是**相对面板内容盒**（面板左右各有 23rpx 内边距），所以量到的是屏宽的 **65.6%**；
    这正是「留出 30% 给悬浮按钮」想要的效果，**不要**为了凑「屏宽 70%」写成 `calc(70% + 46rpx)` ——
    那样提交按钮右沿会正好压到第一颗悬浮按钮上（实测 285 vs 282）。
  - `.page` 的 `--kb-h` = **360rpx**（键盘实测高 191px / 390 宽 ≈ 367rpx）。
  - 历史（别再犯）：② 曾用 `bottom: calc(108rpx + safe-area)` 让键盘悬在按钮上方 → 视觉上「悬空、下面一大条空白」✗；
    ① 更早用 `bottom: 0` + 面板 `padding-bottom: 280rpx` → 同样一大条空白 ✗。

  **实测（贴底版，H5）**

  | 视口 | 键盘 | 贴底差 | 退格/提交行 | 行占面板宽 | 与悬浮按钮重叠 | 内容被挡 |
  | --- | --- | --- | --- | --- | --- | --- |
  | 390×844 | 0..390 × 653..844（高 191） | **0** | 12..268（宽 256） | 65.6% | **否**（提交右沿 268 vs 按钮左沿 282，留 14px） | **0** |
  | 375×667 | 0..375 × 484..667（高 184） | **0** | 12..258（宽 246） | 65.6% | **否**（258 vs 271，留 13px） | **0** |

### 教训汇总

- **凡是「格子 + 绝对定位的内容」，两边必须用同一份坐标数学**，不要一边 flex 一边 absolute。
- **动画延迟不要依赖会变化的响应式 flag**，否则任何重渲染都会重启动画。
- **系统弹窗承载不了富文本需求**（图标 / 分段 / 字号），需要自绘组件。

### 5. 网格底纹「全部叠在一起」的坑（雀圣背景框消失）

把格子改成绝对定位时，**模板那一行没换成功**（`:style="cellStyle"` 还留着，而 `cellStyle` 只有宽高、没有 `left/top`）
→ 25 个格子全叠在棋盘左上角，视觉上「背景框全没了」，而每张牌和它自己那个格子仍然重合，所以中心偏差量出来还是 0 ✗✗。

**教训 / 排查手段**：
- `document.elementsFromPoint(空格中心)` 返回 **25 个 `.grid-cell`** 就是全部重叠的铁证（正常应是 1 个）；
- 再看 `getAttribute('style')`：只有 `width/height`、没有 `left/top` → 用错了 style 函数；
- **改完模板行一定要 `grep` 确认那一行真的变了**（这次是缩进不同导致 replace 静默失败）；
- 顺手删掉只给宽高的旧函数，避免以后又有人用错。

### 6. 麻将传奇：牌是方的、格子是圆的

`cellStyle` 里有 `borderRadius: cw × 0.09`，但 **`tileStyle` 里没有** → 牌是直角 ✗。
给 `tileStyle` 补同一份 `borderRadius`，并给 `.tile-slot` 加 `overflow: hidden`（把 `<image>` 裁出圆角）。
实测：牌圆角 = 格圆角 = **3.668px**，牌面（`.mj-wrap`）也是 3.668px ✓。

### 7. 赌神：恢复记录后「答案判断是错的」

**症状**：刷新/重进后，点明显该胡的牌被扣心，该扣心的反而进答案区 —— 判定和手牌完全对不上。

**原因**：`restore()` 里用 `newRound(level)` 取 `picks`（正确解）与 `blocked`，
但 `newRound` 是**重新随机生成的另一副手牌**，它的 `picks` 和存档里的手牌毫无关系 ✗，
而界面显示的却是存档里的手牌 → 判卷必然错 ✗✗。

**修法**：答案必须**由存档手牌推导**（与 web 一致，答案本身不进存档，防止改存档看答案）：
```js
hand.value = sortHand(s.hand);
const { counts, jokers } = handCounts(hand.value);
picks.value = winningPicks(counts, jokers);
blocked.value = SELECT_KEYS.filter(k => isBlocked(k, counts));
if (!picks.value.length) return false;     // 死局 / 坏存档 → 重开一关
```
**验收**（用固定存档 `m5 m5 s7 s7 s7 s8 s9 p4 p4 p4 p7 p7 p7`，答案是 `m5` / `s7`）：
恢复后点 `m5` → 心仍是 2、已选 `[m5]`；再点 `s7` → 已选 `[m5,s7]`、phase = **won** ✓；
点错牌（`m1`）→ 心 1 + 打「✗ 错误」章。
（H5 里那几条 `NotAllowedError: play() failed` 是无用户手势时的音频自动播放限制，**不是 bug**。）

### 8. 雀圣：撤销/重做没有居中

`.undo-card` 原来只有 `padding-right: 130rpx`（让开悬浮按钮）→ 按钮组整体偏左 ✗。
改成**左右等距内缩**：`margin-left/right: 130rpx` + **`width: auto`**。
⚠️ 必须补 `width: auto` —— 全局 `.card` 是 `width: 100%`，只写 margin 时宽度不变、margin 不生效 ✗。
实测：按钮组中心 **196** vs 视口中心 **197**（差 1px）✓，卡片 93..300 与悬浮按钮（x≥322）无重叠 ✓。

## 十九、第三批迁移（Emoji 下坠 / Emoji 镜像）

| 游戏 | 页面 | 逻辑文件 | 存档 key |
| --- | --- | --- | --- |
| Emoji 下坠 | `pages/down/down.vue` | `board.js`（= web 逐字节相同）| `__emoji_down__state` / `__emoji_down__best_1` |
| Emoji 镜像 | `pages/mirror/mirror.vue` | `board.js`（= web 逐字节相同）| `__emoji_mirror__state` / `__emoji_mirror__best_1..5` |

要点：

- **下坠是实时循环游戏**：web 用 `requestAnimationFrame`，小程序换成 `setInterval(16ms)`（`dt` 按毫秒差算、钳 0.05s），
  每帧只写两个 `transform` 字符串；`onHide` 里把循环 + 计时 + 3-2-1 倒数全部停掉，`onUnmounted` 也清。
  棋盘尺寸按 web 同口径算，但**为右下角 `.fab` 预留 276rpx**（与贪吃蛇同算法）→ 393×852 约 314×419px（web 348×464），
  375×667 会明显更小（0.62 倍），这是「最靠下可交互元素底 < fab 顶」的代价。
- **镜像用「两面常驻 + transition」实现 3D 翻面**（与对对碰的 `v-if + flip3d-in` 不同，观感更接近 web 的整张牌翻过去）：
  ```css
  .mirror-card { perspective: 700rpx; }
  .face { transition: transform .46s, opacity .01s .225s; }
  .face.front { transform: rotateY(0deg); }
  .face.back  { transform: rotateY(180deg); opacity: 0; }
  .face-down .face.front { transform: rotateY(180deg); opacity: 0; }
  .face-down .face.back  { transform: rotateY(0deg);   opacity: 1; }
  ```
  透明度用 `0.01s` 时长 + `0.225s` 延迟 —— 正好在牌侧立 90° 那一刻切换，所以**不需要 `preserve-3d` / `backface-visibility`**。
- **验收方法**（这次真用上了）：游戏开局展示区会「亮出来 → 逐张翻面」，每 120ms 采一次
  `getComputedStyle(face).transform`，应看到 `matrix(1,0,0,1,…)` → `matrix3d(0.95,0,-0.30,…)`（≈-17°）
  → `matrix3d(0.16,0,-0.99,…)`（≈-81°）→ `matrix3d(-1,0,0,…)`（180°），耗时约 460ms ✓。
- **镜像的长按偷看**用 `touchstart/touchend/touchcancel`（桌面 H5 用鼠标不会触发，移动端才有效）。
- 两页都在 `pages.json` 里加了 `disableScroll: true`（单屏游戏，棋盘已按视口算好）。

### 这一批的经验

- 两个页面的 `board.js` 都是**逐字节复制**，迁移时最容易错的不是逻辑而是**数据绑定**：
  下坠的 `playerTf` 一开始没绑到模板（玩家卡在左上角），镜像的两面初始状态如果写错就会「一进游戏就全翻过去」。
- **实时循环类游戏必须先想清楚 `onHide`/`onUnmounted` 的清理**，否则切后台还在跑（下坠、贪吃蛇都这样）。

### 9. 数独：去掉「候选模式开关」+ 悬浮按钮整体下移

- **候选只有一种语义**：按一下「候选」= 一次把全盘空白格的候选都补齐（`fillAllCandidates()`），
  删掉了 `candMode`（点格子逐个填）与 `candAll`（行为开关）两个 ref、顶上那颗 `i-mdi-select-all` /
  `i-mdi-gesture-tap` 悬浮按钮、以及 `onCellClick` 里的「单格候选」分支。现在数独只剩 **1 颗**帮助按钮。
- **悬浮按钮组统一下移**：`FloatingActions.vue` 的 `bottom: calc(40rpx + safe-area)` → **`16rpx`**
  （下移 24rpx ≈ 12.5px）。首页设置按钮实测底边距屏幕底 **8px**。
- ⚠️ **血的教训**：删这几个 ref 时用 `
 *function X\(\) \{.*?
  \}` 这种正则，`.*?` 跨过了相邻函数，
  **连带删掉了 9 个函数（initDifficulty / changeDifficulty / bestKey / fmt / initGame / isFinished /
  removeState / revealBoard / revealDelay）和整段 `onMounted/onUnmounted/onHide/onShow`** ✗✗。
  症状：页面能打开但棋盘 0 格、点格子没反应、按数字没反应。
  → **删函数请按行号/整块删，或删完立刻 `grep "function "` 对比 web 的函数清单**；
  这次就是用「web 与 mp 的函数名集合 diff」才定位到缺了哪 9 个。

## 二十、多语言（中文 / English）审查：切英文后仍有中文的 5 个来源

用户报「切英文后首页部分游戏名还是中文」，于是做了一次全量审查。**5 类遗漏**：

1. **首页游戏名硬编码**（10 个新迁移的游戏写成了 `name: '麻将英雄'`）✗ → 全改成 `nameKey: 'game.<id>'`，
   并在 `core/i18n.js` 的 **cn 和 en 两个字典**里各补一套 `'game.mahjong': '麻将英雄' / 'Mahjong Hero'` 等。
2. **只补了 en、漏了 cn** ✗✗：`game.*` 一开始只加进 en 字典 → 中文模式下直接显示原始 key（`game.mahjong`）。
   教训：**加 key 必须两边同时加**，并跑一次「中文模式回归」。
3. **原生导航栏标题是静态的**（`pages.json` 的 `navigationBarTitleText`）→ 切语言后标题栏还是中文 ✗。
   新增 `core/i18n.js` 的 `setNavTitle(getTitle)`（内部 `watchEffect` + `onMounted`，跟随 `lang`），
   首页与 14 个游戏页各加一行：`setNavTitle(() => tt('gameTitle'))` / `t('mName')` 等。
   → H5 实测：英文 `Games Hub / Sudoku / Gambler / Emoji Mirror`，切回中文 `数独` ✓。
4. **core 字典 en 缺 key**：`helpG2048 / helpP24 / helpM / helpG / gHandTip / gPickTip / gAnswerTipSubmit`
   在 cn 有、en 没有 → 英文模式下 2048/24 点/对对碰/赌神的**帮助文案**和赌神的**提示气泡**仍是中文 ✗。
   从 web 的 `src/games/<id>/i18n.js`（en 段，`helpMsg + help1..N` 用 `\n\n` 连接）抄过来补齐。
   ⚠️ web 的 i18n 文件是 **`en` 在前、`cn` 在后** —— 直接正则扫全文件会被 cn 覆盖，必须**只取 en 段**。
5. **模板里的硬编码中文**：对对碰 `{{ conf.pairs }} 对` ✗ → `t('mPairs')`（cn 对 / en pairs）。

### 审查方法（以后改文案就照这个跑）

- **静态**：扫所有 `.vue`/`.js`（排除 `i18n.js`）去掉注释后的中文，只应剩 `HelpSheet` 的 `'好的，明白'`
  这类**按语言分支**的常量。
- **动态（关键）**：headless Chrome 里先写 `localStorage.__games_hub__lang_mode = 'en'`，
  再 `Page.reload`（**必须 reload**，模块初始化时才读语言），逐页读 `document.body.innerText`
  并用 `/[\u4e00-\u9fa5]+/` 找残留；帮助弹窗单独点开再扫一遍。
- **双向**：切回 `cn` 再跑一次，确认没有出现 `xxx.yyy` 这种**原始 key**。
- 目前结果：英文下 **15 个页面 + 帮助弹窗 0 处中文**，导航栏标题也已是英文；中文回归正常。

### 10. 对对碰翻面：改用「正反两面常驻 + 同时旋转」（照 Emoji 镜像）

之前用 `v-if` 交替 + 只给新面加 `flip3d-in` ✗ —— 旧面瞬间消失、新面自己转进来，
观感更像「淡入」而不是「翻过去」，在 emoji / 麻将两种牌面上都不明显。

**现在与 Emoji 镜像完全同一套做法**：两面常驻，靠 `.tile.up` 同时转：

```css
.tile { perspective: 700rpx; }        /* 翻转舞台 */
.face { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
        border-radius:12rpx; overflow:hidden;
        transition: transform .46s cubic-bezier(.2,.8,.3,1), opacity .01s linear .225s; }
.face-front { transform: rotateY(0deg);   opacity: 1; background:#f7f4ee; }
.face-back  { transform: rotateY(180deg); opacity: 0; background:#23804e; color:#fff; }
.tile.up .face-front { transform: rotateY(180deg); opacity: 0; }
.tile.up .face-back  { transform: rotateY(0deg);   opacity: 1; }
.tile.mjback .face-back { background: linear-gradient(145deg,#2f8f5b,#1d6b3f); }
```

要点：
- **底色要挂在两个面上**（不是挂在 `.tile`）—— 否则会「先变色再翻」✗；
- 透明度 `0.01s` + `0.225s` 延迟，正好在牌侧立 90° 时切换，所以看不到镜像背面，**不需要** `preserve-3d`；
- 模板里两面都常驻（麻将模式背面只靠 `.mjback` 的绿底，正面放 `<MahjongTile>`）；
- `.tile.mjback` 只加在**朝下**时（`:class` 里已有条件），翻上来后回到象牙底。

**验收**（每 80ms 读一次 `getComputedStyle(.face-front).transform`）：
emoji / 麻将两种模式都能看到 `matrix3d(0.28,0,-0.96,…)` → `(0.89,0,-0.46,…)` → `(-0.99,0,-0.16,…)` → `(-1,0,0,…)`，
即 0° → 180° 连续绕 Y 轴旋转，约 460ms 完成；同一时刻 `face-front` 的 opacity 由 1 变 0、`face-back` 由 0 变 1 ✓。

#### 10b. 两面常驻的两个「后遗症」（都是这次改完才发现）

1. **正反写反了** ✗：`up` 是「翻开」的意思，所以**默认状态必须是背面朝上**。
   第一次写成了 `.face-front` 默认可见 → 观察期变成背面、游戏期反而正面，正好反了 ✗。
   正确映射（默认背 → `.up` 正面）：
   ```css
   .face-back  { transform: rotateY(0deg);   opacity: 1; }
   .face-front { transform: rotateY(180deg); opacity: 0; }
   .tile.up .face-back  { transform: rotateY(180deg); opacity: 0; }
   .tile.up .face-front { transform: rotateY(0deg);   opacity: 1; }
   ```
   验收：观察期 `.up=true` → 正面可见；游戏期 `.up=false` → 背面可见；点开一张 → 正面可见。
2. **图标类不能直接写在 `.face-back` 上** ✗✗：`i-mdi-*` 会给元素加 `mask` + `background-color: currentColor`，
   写在整块牌背上会把**整个牌背裁成灯泡形状**（截图里就是一片深色 + 一个大灯泡），
   和第八节 `.fab` 那个坑一模一样。正确做法是图标放**内层**：
   ```html
   <view class="face face-back">
     <view v-if="mode !== MODE_MAHJONG" class="back-ico i-mdi-lightbulb-on-50" :style="{ fontSize }" />
   </view>
   ```
   `.back-ico { color: #fff }`；实测牌背 114×114、`mask-image: none`、内层图标 77×77 白色 ✓。

#### 10c. 「翻面时另一面会闪现」的两个真凶

用户反馈「翻面过程中另一面会闪现，想要和 Emoji 镜像一模一样」。把 CSS 和 Emoji 镜像**逐条对齐**后找到两处差异：

1. **`.face` 上不该有 `overflow: hidden`** ✗：旋转中的圆角 + `overflow:hidden` 会让合成层在**斜角**时透出另一面的像素
   （看起来就是「另一面闪一下」）。Emoji 镜像的 `.face` **没有** `overflow` —— 需要裁剪的是**内层**内容：
   麻将牌面靠 `MahjongTile` 自己的 `.mj-wrap { overflow: hidden }` 裁，牌体圆角靠 `border-radius` ✓。
2. **`perspective` 不能放在带发牌动画的元素上** ✗：之前 `perspective` 和 `animation: card-in` 都在 `.tile` 上，
   动画的 `transform` 会把这个 3D 上下文搅乱。改成结构分层（和镜像一致）：
   ```html
   <view class="tile" :class="{ up, mjback, matched }" :style="cardStyle(i)">   <!-- 定位 + 发牌动画 -->
     <view class="flip">                                                        <!-- 只有 perspective -->
       <view class="face face-back">…</view>
       <view class="face face-front">…</view>
     </view>
   </view>
   ```
   `.flip { position:absolute; inset:0; perspective: 700rpx }`；`.tile { animation: card-in …; position:absolute }`。

另外把过渡写成镜像同款 longhand，便于逐条对比：
```css
.face {
  position:absolute; top:0; left:0; width:100%; height:100%;
  display:flex; align-items:center; justify-content:center; box-sizing:border-box;
  border-radius:12rpx; transform: rotateY(0deg);
  transition-property: transform, opacity;
  transition-duration: 0.46s, 0.01s;
  transition-timing-function: ease-in-out, linear;
  transition-delay: 0s, 0.225s;   /* 透明度在 90° 那一刻瞬切 */
}
```

**验收（每帧采样，rAF 时间戳）**：39 帧里**只有 1 帧**两面同时可见，且那一帧**角度正好 88°**（侧立、几乎看不见）✓；
换面时刻 233ms（= 90°）✓；角度轨迹 0° → 12° → 49° → 77° →（换面）→ 28° → 3° → 0°，即 front 0°→180° 连续旋转 ✓。
麻将模式另测：6 张牌 / 12 个面、牌背 `linear-gradient(145deg,…)` + `mjback` ✓、牌面 114×147 ✓、0 异常 ✓。

## 二十一、翻面动画唯一标准（用户指定：以后全部照这个做）

> 用户原话：「这就对了，把这条规则记下来。以后翻面的动画全都按照这个来。」
> 参考实现：`pages/mirror/mirror.vue`（Emoji 镜像）与 `pages/match/match.vue`（对对碰，已按此改造）。
> 任何新的「牌 / 卡 / 格子翻面」都**必须**用这套，不得再换别的写法。

### 1. 结构（三层，缺一不可）

```html
<!-- ① 定位层：只管位置/尺寸/发牌动画；不要在这里写 perspective -->
<view class="tile" :class="{ up: isFaceUp }" :style="cardStyle(i)">
  <!-- ② 3D 舞台：只放 perspective，不放动画 -->
  <view class="flip">
    <!-- ③ 两个面常驻 DOM，永不 v-if 卸载 -->
    <view class="face face-back">
      <view class="back-ico i-mdi-xxx" :style="{ fontSize }" />   <!-- 图标放内层！ -->
    </view>
    <view class="face face-front">
      <text class="emoji">{{ item }}</text>
      <MahjongTile v-else … class="mj" />
    </view>
  </view>
</view>
```

- **两个面必须常驻**：`v-if` 换面会导致「旧面瞬间消失、新面自己转进来」，观感是淡入而不是翻面 ✗。
- **`perspective` 只放在 `.flip` 上**：放在带 `animation`（发牌动画）的 `.tile` 上会搅乱 3D 上下文 ✗。
- **图标类（`i-mdi-*`）只能放内层元素**：它会加 `mask` + `background-color: currentColor`，
  写在整块面上会把整个面**裁成图标形状** ✗（见第八节同名坑）。

### 2. CSS（可直接抄）

```css
.tile {
  position: absolute;              /* 或 relative，按页面布局 */
  animation: card-in 0.28s ease both;   /* 发牌动画留在这一层 */
  border-radius: 12rpx;
}
.flip {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  perspective: 700rpx;             /* 唯一的 3D 舞台 */
}
.face {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  box-sizing: border-box;
  border-radius: 12rpx;
  transform: rotateY(0deg);
  /* 真 3D 翻转：两面各自绕 Y 轴转 180°（0.46s）；透明度 0.01s + 0.225s 延迟，
     正好在牌侧立 90° 那一刻瞬切 → 永远看不到镜像的背面 */
  transition-property: transform, opacity;
  transition-duration: 0.46s, 0.01s;
  transition-timing-function: ease-in-out, linear;
  transition-delay: 0s, 0.225s;
}
/* 默认必须「背面朝上」—— up 表示翻开 */
.face-back  { transform: rotateY(0deg);   opacity: 1; background: #23804e; color: #fff; }
.face-front { transform: rotateY(180deg); opacity: 0; background: #f7f4ee; }
.tile.up .face-back  { transform: rotateY(180deg); opacity: 0; }
.tile.up .face-front { transform: rotateY(0deg);   opacity: 1; }
```

**四条铁律**：

1. **默认 = 背面朝上**（`up`/`face-down` 才翻到正面）。写反了就是「观察期背面、游戏期正面」✗（踩过）。
2. **底色挂在两个面上**，不要挂在 `.tile` 上 —— 否则会「先变色再翻」✗。
3. **`.face` 上禁止 `overflow: hidden`** —— 圆角 + 裁切 + 旋转会在斜角透出另一面的像素（=「另一面闪现」）✗；
   需要裁的内容（雪碧图牌面等）在**内层**自己裁（如 `MahjongTile` 的 `.mj-wrap`）。
4. **不要 `preserve-3d` / `backface-visibility`** —— 小程序里表现不一致；透明度瞬切方案已完全替代它们。

### 3. 验收（必须跑，否则等于没做）

用 `requestAnimationFrame` 每帧采样两个面的 `opacity` 与 `transform`：

```js
new Promise((resolve) => {
  const f = tile.querySelector('.face-front'), b = tile.querySelector('.face-back');
  const out = []; let t0 = 0; tile.click();
  requestAnimationFrame(function step(ts) {
    if (!t0) t0 = ts;
    out.push([Math.round(ts - t0), +getComputedStyle(f).opacity, +getComputedStyle(b).opacity,
              getComputedStyle(f).transform, getComputedStyle(b).transform]);
    if (ts - t0 < 620) requestAnimationFrame(step); else resolve(out);
  });
});
```

**合格标准**（对对碰 / 镜像实测值，照这个对）：

| 指标 | 期望 |
| --- | --- |
| 两面同时可见的帧 | **≤ 1 帧**，且该帧角度 ≈ **88°**（侧立、几乎看不见）|
| 换面时刻 | ≈ **230ms**（= 90°）|
| 角度轨迹 | 0° → 12° → 49° → 77° →（换面）→ 28° → 3° → 0°，即连续 0°→180° |
| 总时长 | ≈ 460ms |
| 默认状态 | 背面可见、正面不可见 |
| 翻到正面后 | 正面可见、背面不可见 |

另外量一次**状态正确性**：观察期 / 点开一张 → 正面可见；游戏进行中 → 背面可见。

### 4. 已按此实现的页面

| 页面 | 状态 |
| --- | --- |
| `pages/mirror/mirror.vue`（Emoji 镜像）| ✅ 参考实现（`.face.front/.back` + `.face-down`）|
| `pages/match/match.vue`（对对碰，emoji + 麻将两种牌面）| ✅ 已改造（`.face-front/.face-back` + `.up`）|
| `pages/poker/card.vue`（德州扑克发牌翻牌）| ✅ 已改造（`.flip` + 两面常驻；`animate` 改成**计数器**，每发一次重播）|

**全部翻面都已统一到本规范** ✓。扑克实测：两面同现 1 帧（88°）、换面 533ms（发牌延迟 300ms + 233ms ✓）、
0→17→70→45→6→0 连续旋转、最终 `up=true` ✓。

## 二十二、第四轮修复（配对消除时序 / Threes 跟手 / 扑克翻面）

### 1. 对对碰：配对成功要**等第二张翻完**再一起闪

原来第二张刚点下就立刻 `matched = true` → 第一张已经在闪、第二张还在翻 ✗。
现在配对成功先进 `lock`，用 `MATCH_FLIP_MS = 470`（翻面过渡 0.46s）延时后再同时：
```js
const prev = firstCard; firstCard = null; lock = true;
matchTimer = setTimeout(() => {
  prev.matched = true; card.matched = true; lock = false;
  registerClear(); playElimination(); /* 胜利/存档 */
}, MATCH_FLIP_MS);
```
- `matchTimer` 要在重开一局时 `clearTimeout`（已加进 `deal()` 的清理里）；
- 延时期间 `lock` 挡住连点，避免点第三张。

**验收**：点第二张后 150ms / 350ms `.tile.matched` 都是 **0**，750ms 时是 **2** ✓（两张同时开始闪）。

### 2. Threes：跟手拖动（**严格照 web 的 dragMovers**）

用户第一版反馈两件事：① 牌不跟手；② 跟手时**突破边界**（不该动的牌也跟着动）。
web 的做法是「**只有这一步真的会动的牌**才跟手」，小程序照抄：

- `dragDir`（**方向一旦认定就锁死**，手指抖不会来回跳）+ `dragDist`（沿锁定方向的净位移，`0..pitch`）；
- `dragMovers = computed(...)`：`computeMove(dir)` 里位置发生变化的牌 id 集合；**`moved=false` 时是空集**；
- `tileStyle()` 里 `dragOffset(tile)`：只有 movers 里的牌加 `dist * dc / dr`，其余牌**原地不动** ✓
  → 于是可合并的牌会**压在目标牌上**（覆盖效果），被边界挡住的牌纹丝不动 ✓；
- 阈值与 web 一致：`DRAG_SLOP = 10`（认定方向）、`DRAG_MIN = 0.5`（松手需覆盖半格）、
  `DRAG_COMMIT = 0.95`（覆盖到 95% 不等松手当场结算）；
- `@touchcancel` → 只弹回不移动；拖动期间 `.board.dragging .tile { transition: none !important }`；
- `px → rpx` 用 **ref**（`750 / windowWidth`）—— 用普通变量会让 `pitchPx` 这个 computed 缓存到 mount 前的值 ✗。

**验收**（9 张牌向左拖）：**5 张位移 / 4 张原地不动** ✓、`transitionDuration: 0s` ✓、
`touchcancel` 后完全复位 ✓、拖过 95% 当场结算 ✓、短拖不提交 ✓。

### 3. 扑克翻面

按第二十一节改造（见那里的表格）。要点：
- `animate` 从布尔改成**计数器**（`cardAnim[idx] += 1`），否则第二次发牌 `animate` 不变、翻牌不重播 ✗；
- `shown` 状态：`watch(isBack, back => { shown.value = !back })` —— **别只处理“变回牌背”那一半** ✗
  （踩过：发牌后一直是牌背）；`animate` 变化时先 `shown=false`，20ms 后再 `true` 重播翻转；
- mini 牌（猜大小历史）不翻面：只渲染正面那层，用 `.card-wrapper-mini .face-front` 强制可见。

### 4. 真机翻面「收尾闪一下」（模拟器复现不了）

用户反馈：真机上翻面**结束**时会闪一下，模拟器正常。翻面本身（角度/换面时刻）模拟器里完全合法，
所以这是**合成层**的问题：两面都在 3D 里转，过渡结束那一帧重新栅格化时可能把「背面」多画一帧。

兜底四条（三处翻面都加了：`match` / `mirror` / `poker`）：
```css
.face {
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;      /* 背朝观众的那一面永远不画（即使透明度切换晚一帧也看不到镜像） */
  -webkit-transform: translateZ(0);
  will-change: transform, opacity;  /* 两面常驻合成层，过渡结束不再重新栅格化 */
}
```
保留原来的「透明度 0.01s + 0.225s 延迟」方案（两层保险：CSS 透明度管换面，`backface` 管漏画）。

⚠️ **踩坑**：这段 CSS 第一次插进了 mirror 的 `.settling, .silent { .face {…} }` 嵌套里 ✗
→ 只有「settling 状态」才生效（`getComputedStyle` 平时拿到 `visible/auto`）。
**插样式后一定要 `getComputedStyle` 复查目标元素**，别只看源码里「有这几行」。

**验收**：`match` / `poker` 的 `.face` 计算值 `backface-visibility: hidden`、`will-change: transform, opacity` ✓；
`mirror` 修好后同样 ✓；翻面轨迹不变（0→180°、两面对现 ≤1 帧）✓。

## 二十三、第五轮修复（传奇预览/消除、赌神飞牌、对对碰牌宽）

### 1. 麻将传奇：预览区第 2、3 张被压扁

`.preview` 的容器是 `slotStyle(HAND_W)` = **84rpx 宽**，里面塞两张各 **84rpx** 的子项 ✗ → flex 把子项压成 35×45 / 26×34
（宽被压、高不变 → 比例失真 ✗）。修法：
- 容器**不要固定宽度**（去掉 inline `slotStyle`），交给内容撑开；
- `.preview .next { flex: 0 0 auto; }` 禁止压缩。

实测两张预览：**35×45（0.778）** 与 **26×34（0.765）** ✓ 比例 = 1/1.285 ≈ 牌的真实比例 ✓
（0.778 = 131/168 ✓）。

### 2. 麻将传奇：消牌浮影位置偏左上

`posStyle(row, col)` 少了棋盘内边距 ✗：`left: col*stepX`，而盘面上的牌用 `tileStyle` = `PAD + col*stepX` ✓
→ 浮影整体往左上偏 **PAD = 12rpx**（正是用户看到的现象）。
修法：`posStyle` 的 `left/top` 都加 `PAD` ✓（**凡是「板上的东西 + 浮影/替身」，两边必须用同一份坐标数学**）。

### 3. 赌神：补上「选择区 → 答案区」的飞牌

`pick()` 之前直接 `picked.push` ✗，`flyGhost` 的模板/样式都在但**没人用** ✗。现在：
```js
async function flyThenCommit(key) {
  const [from, to] = await Promise.all([queryRect(`#pick-${key}`), queryRect('#answer-row')]);
  if (!from || !to) { commitPick(key); return; }            // 量不到 → 直接落位（绝不卡住）
  flyGhost.value = { left: from.left, top: from.top, w: from.width, h: from.height, op: 1, key };
  setTimeout(() => { /* 下一拍改目标位置，触发过渡 */ }, 30);
  setTimeout(() => { flyGhost.value = null; commitPick(key); }, 300);   // 落地后才真正入答案区
}
```
- 判对错的逻辑抽成 `commitPick(key)`，`pick()` 只负责「能不能点 + 起飞行」；
- `flying` 标志挡住飞行中的连点。
**实测**：点一张后 `.fly-ghost` 真的出现（位置 = 那张牌的位置）✓，300ms 后消失并入答案区 ✓。

答案区高度：`.answer-row` 的 `min-height` 从 62rpx → **66rpx**，与 `.answer-tile` 的 `height: 66rpx` 一致
→ 有牌 / 没牌高度都是 **35px** ✓（空 35 / 有牌 35）。

### 4. 对对碰：第一关 3 列时牌太大

mp 的 `tileSize = (690 - 10*(cols-1) - 16) / cols` **没有上限** ✗ → 3 列时 218rpx（≈114px），
而 web 有 `EMOJI_MAX_W = 96px` 的上限 ✓。
修法：`const MAX_TILE = 183;`（96 × 1.908 ≈ 183rpx）→ `Math.min(MAX_TILE, byW)`。
实测 3 列：**218rpx → 183rpx** ✓；4 列及以上本来就是 (690-30-16)/4 = 161 ✓ 不受影响。

### 5. Threes：跟手时「会动的牌要压在不动的那张上面」

第一版只做了位移（`dragOffset`），没管层级 ✗ —— DOM 顺序决定 z-index，于是滑到一半时
会动的牌**被不动的牌挡住**（看起来像钻到下面去了）✗。

照 web 补一条：拖动中给「会动的牌」加 `.dragging` 类，**z-index 1 → 2**：

```js
// tileClass()
dragging: dragging.value && !!dragMovers.value && dragMovers.value.has(tile.id),
```
```css
.tile { z-index: 1; }
.tile.dragging { z-index: 2 !important; box-shadow: 0 6rpx 14rpx rgba(0, 0, 0, 0.22); }
```

**验收**（9 张牌向左拖）：拖动中 `.tile.dragging` 有 7 张、`getComputedStyle` 的 z-index
分别是 **2 / 1** ✓（会动的都在上层），松手后回到 1…1 ✓。

教训：**「跟手 + 覆盖」这类交互，位移和层级必须一起改** —— 只改 `left/top` 不改 `z-index`，
在 DOM 顺序不利时就会「钻到下面」✗。

### 6. 对对碰：牌变小时棋盘也要跟着缩、并居中

上一轮给牌宽加了 183rpx 上限（3 列时 218 → 183rpx），但 `boardW` 还**固定 690rpx** ✗
→ 3 列时棋盘右侧一大片空底色，看起来「牌缩了、板子没缩」✗。

修法：棋盘宽度**由牌宽反算**，并 `margin: 0 auto` 居中：
```js
const BOARD_MAX_W = 690, BOARD_GAP = 10, BOARD_PAD = 8;
const tileSize = computed(() => {                       // 先按上限反推牌宽（含 183 上限）
  const c = conf.value;
  return Math.min(MAX_TILE, Math.floor((BOARD_MAX_W - BOARD_GAP*(c.cols-1) - BOARD_PAD*2) / c.cols));
});
const boardW = computed(() => BOARD_PAD*2 + conf.value.cols*tileSize.value + BOARD_GAP*(conf.value.cols-1));
const boardH = computed(() => BOARD_PAD*2 + conf.value.rows*tileH.value + BOARD_GAP*(conf.value.rows-1));
```
`.board { margin: 0 auto; }`；`cardStyle` 的 `left/top` 也用 `BOARD_PAD / BOARD_GAP`（别再写死 8 / 10 ✗）。

**实测**（3 列，emoji / 麻将两种模式都一样）：棋盘 **690 → 585rpx** ✓、左右各 8rpx 内边距 ✓、
棋盘中心与视口中心偏差 **0px** ✓；4 列及以上仍是 690rpx（161rpx 牌）✓。

> 通用教训：**「牌尺寸有上限」时，容器尺寸必须是算出来的，不能写死** —— 否则小棋盘会出现大片空底色。

### 7. 顶栏 / 状态栏不要绿色，跟页面底色一致

原来 `pages.json` 的每个页面都写了
`"navigationBarBackgroundColor": "#23804e"`（主色绿）+ `"navigationBarTextStyle": "white"` ✗ ——
小程序原生导航栏是绿色，和页面背景（`#f0f2f5`）拼在一起很割裂。

现在统一改成**和页面底色同色**：
```json
"globalStyle": {
  "navigationBarBackgroundColor": "#f0f2f5",   // = page 的 background
  "navigationBarTextStyle": "black",           // 浅底必须黑字（含 iOS 状态栏时间/信号）
  "backgroundColor": "#f0f2f5"
}
```
⚠️ 逐页也写了同样的字段（11 处）—— **一起改**，否则个别页面还是绿的；
值全部与 globalStyle 相同时 uni-app 会把页面级样式合并掉，产物 `app.json` 里只剩一份 ✓。

**验收**：`dist/build/mp-weixin/app.json` 里
`navigationBarBackgroundColor` / `navigationBarTextStyle` / `backgroundColor` 各只出现 **1 次**，
分别是 `#f0f2f5` / `black` / `#f0f2f5` ✓；没有页面残留 `#23804e` ✓。

> 提醒：`navigationBarTextStyle` 只有 `black` / `white` 两个值 —— 浅色底必须用 `black`，
> 它同时决定 iOS 状态栏的时间/电量颜色。

### 8. 赌神中间文案渲染成 key（cn 字典缺 key）

用户报：赌神中部的提示行显示 `gHandTip gPickTip …` 这种**原始 key** ✗。
原因：模板用 `t('gHandTip')` / `t('gPickTip')` / `t('gAnswerTipSubmit')` / `t('helpG')`，
但这 4 个 key **只加进了 en 字典，cn 里没有** ✗ → 中文模式查不到就原样返回 key。

修法（照 web 的 `src/games/gambler/i18n.js` 中文段抄）：
```js
gHandTip: '这副 13 张手牌已经听牌，还差一张就能胡',
gPickTip: '把能让它胡的牌全部选出来',
gAnswerTipSubmit: '选择所有可以胡的牌，然后提交来判断',
helpG: '这 13 张手牌正在听牌：…\n\n点下面的牌就能选中它。…',   // helpMsg + help1..6 用 \n\n 连接
```
同一轮还发现 **2048 / 24 点 / 对对碰**的帮助 key（`helpG2048` / `helpP24` / `helpM`）**也只在 en 里** ✗
（这三个页面打开帮助就是 key）→ 一并从 web 的 cn 段补齐。现在 core 字典 **cn 78 / en 78，完全对齐** ✓。

**踩坑（改 i18n 时必看）**：
- web 的帮助文案是**多段**，抄过来必须把换行转成 `\n\n` **转义序列**再写进单行字符串 ✗
  直接把真实换行写进去会变成「Unterminated string constant」，整个构建失败 ✗；
- 往 `cn` 段末尾追加时，`rfind('  },')` 这种锚点很容易切到字符串内部 ✗ ——
  更稳的做法是**定位 `\n  },\n  en: {` 这个 cn 段结尾**再插入；
- 改完必须跑 `node -e` 检查「每行单引号成对」+ 构建，再核对 `cn` 与 `en` 的 key 集合是否相等。

**核查手段（以后改文案就跑这个）**：
1. 静态：脚本 diff「页面用到的 key」vs「core cn + 该页本地字典」，必须为空；
2. 静态：diff core 字典 **cn 与 en 的 key 集合**，必须相等（这次 `en - cn = [helpG2048, helpM, helpP24]` 就是这么发现的）；
3. 动态：H5 里中文/英文各跑 15 个页面 + 逐个打开帮助弹窗，用正则
   `/\b[a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*\b|\b[a-z]+_[a-z_]+\b/` 找裸 key —— 结果 **0 处** ✓、异常 0 ✓。

### 9. 赌神飞牌：不要淡出；胜利提示等最后一张落位

用户报「牌似乎缩小了且有透明度」+「胜利提示要等最后一张飞完再出现」。

- **透明度**：web 的替身 `opacity: '1'` 全程不变 ✓，我之前写了 `op: 0.15` ✗ → 一律 **opacity 恒 1**；
- **缩小**：web 是 `scale(b.width / a.width)`（飞进答案槽位就变成槽位大小）✓ 这个保留 ——
  mp 改成 `transform: scale(rpx(52) / from.width)`，目标点 = `答案行 left + 4 + index*(52rpx+6rpx)`；
- **胜利时机**：`commitPick` 里「答案齐了」之后 **`setTimeout(winRound, 300)`** ——
  等答案牌自己的 `answer-in`（0.26s）播完再出结算层。

**实测**：飞牌全程 `opacity = 1` ✓（宽度 35 → 27px 平滑收进槽位）；点最后一张后
**替身消失 317ms / 胜利遮罩 621ms** ✓（= 飞行 300 + 落位 300），结论「胜利在飞牌结束之后」✓。

### 10. 彩带：两侧礼炮「喷到中上方 → 自由落体」

旧实现是「从顶部往下飘」✗；第一版改成两侧礼炮后，下落段是**匀速斜着飘**，看起来像滑翔 ✗
（用户：「落下的效果太蠢了，应该喷到屏幕中上方之后自由落体落下」）。

**关键技巧：一个元素只能动一次 `transform`，所以把两个轴拆到两层**：

```html
<view class="confetti-piece" :class="side">           <!-- 只管水平：整段 linear 匀速 -->
  <view class="confetti-fly">                          <!-- 只管竖直：减速上升 + 加速下落 -->
    <view class="confetti-shape" />                     <!-- 自转 -->
  </view>
</view>
```
```css
.confetti-piece { top: 52%; animation: confetti-horizontal-* <dur> linear both; }   /* left:-2vw / right:-2vw */
@keyframes confetti-vertical {
  0%   { transform: translate3d(0,0,0);            animation-timing-function: cubic-bezier(.18,.72,.32,1); } /* 上升减速 */
  42%  { transform: translate3d(0, calc(var(--iy)*-1), 0); animation-timing-function: cubic-bezier(.42,0,.86,.62); } /* 顶点 → 自由落体加速 */
  100% { transform: translate3d(0, 96vh, 0); opacity: 0; }
}
```
- `--ix`（26~48vw）/`--iy`（26~50vh）每片随机，与旧版相同的「两波错开」节奏；
- 顶点定在 `top:52% - iy` ≈ 屏幕上部（实测 852 高的屏上 y≈222）✓。

**实测轨迹**（采样最早起飞的一片，每 90ms 一次 y）：
`443 → 298 → 246 → 227 → 222(顶点 731ms) → 235 → 304 → 425 → 595 → 818 → 1148 → 1261`
→ **上升每步 28px / 下落每步 80px** ✓「先减速上升、到顶后加速自由落体」✓；两侧各 32 片共 64 片 ✓。

> 教训：**要做真实抛物线，别用一条关键帧硬画路径**（那样只有中点速度对了，观感是「滑」）。
> 拆成「水平匀速层 + 竖直重力层」两层，用两段不同的 `animation-timing-function`，
> 就得到物理上正确的运动 —— 而且不需要 JS 逐帧算。

### 11. 对对碰：闪烁消除期间**不能锁输入**（玩家手很快）

第 1 条为了「等第二张翻完再一起闪」用了全局 `lock = true` ✗ —— 结果那 470ms 里点别的卡片完全没反应 ✗
（用户：「玩家的操作就是会很快」）。

**正确做法**：配对成功时**不要加全局锁**，直接 `firstCard = null`，让下一张点击照常开始新的一对；
那两张已经 `flipped = true`，`onCardClick` 开头本来就 `if (… || card.flipped) return` ✓ 挡住重复点同一张 ✗ 不会出问题。

只有**配对失败**（翻回）才需要 `lock`（否则玩家会在 700ms 里点到刚翻回的两张）✓ —— 那条保持原样。

**验收**（点一对 → 120ms 内点第三张）：
`第三张 up=true`（点击立刻生效 ✓）、`140ms 时消除数 0`（还在等翻面）、`840ms 时 2`（两张一起闪）✓。

> 通用教训：**「等动画」不要用会吞掉输入的全局锁**。要挡就挡「已经被消费的那几张牌」，
> 而不是挡整个棋盘 —— 这类锁在快速操作的游戏里会直接变成「点了没反应」。

### 12. 彩带调参：角度更平、顶点收到中线、量加到 96 片

用户要求「喷的角度再大一点，到顶部时接近中线再抛物线落下，量多一点」。三处调整：

| 参数 | 旧 | 新 |
| --- | --- | --- |
| 每侧片数 | 32（共 64）| **48（共 96）** |
| 水平射程 `--ix` | 26~48vw | **58~72vw** |
| 上升高度 `--iy` | 26~50vh | **34~48vh** |
| 水平层节奏 | 整段 linear | **42%（顶点）时已走完 90%**，之后缓慢前移 |

关键点：**水平层也要给关键帧**。只把射程调大是没用的 —— 水平是整段 linear 的话，
到顶点（42% 时间）才走完 42% 的射程，顶点会落在屏幕偏外侧 ✗。
写成「0% →（快）42% 走 90% →（慢）100% 走满」，顶点才会落在中线附近 ✓。

**实测**（393 宽屏，采样最早起飞的一片）：
`起点 x=-8,v=443 → 顶点 x=197,y=154（734ms）→ 落到 y=948`
→ 顶点**离中线 0.5px** ✓、在屏幕上部 ✓、上升减速/下落加速 ✓、共 96 片 ✓。

### 13. 彩带「挤成一坨」→ 改成宽扇形

上一版把顶点收到中线后，96 片**全部**落在中线附近 ✗ —— 用户：「挤得太紧了，你没有审美吗」。

问题不在数量，而在**所有片走同一条轨迹**：`ix` 区间太窄、顶点系数固定 0.9、高度区间太窄
→ 96 片重合在一条线上，看着像一坨 ✗。

改法（每片独立随机，用 `Math.random()` 而不是取模，避免出现规律条纹）：
| 参数 | 旧 | 新 |
| --- | --- | --- |
| `ix` 水平射程 | 58~72vw | **30~92vw** |
| 顶点系数 `--apex` | 固定 0.9 | **每片 0.72~0.98**（`calc(var(--ix) * var(--apex))`）|
| `iy` 上升高度 | 34~48vh | **24~58vh** |
| 时长 | 1.9~2.7s | **1.9~2.9s** |
| 延迟 | 按波次 60ms | **随机 0~900ms + 波次 90ms** |

**实测**（顶点后 750ms 采样 96 片的 x 分布）：
`x_min=-8 / p25=56 / median=224 / p75=391 / x_max=396`、`x 跨度 404px`（≈整屏宽）、`y 跨度 435px`
→ 铺满整屏的扇形 ✓（修改前几乎全在 197 ± 20 的窄条里 ✗）。

> 教训：**「散开」= 让每个粒子有独立的随机参数**（射程 / 顶点比例 / 高度 / 时长 / 延迟），
> 而不是整体调大一个数。参数区间太窄时，粒子再多也只会叠成一条线。

### 14. 结算按钮统一（重玩本关 / 下一关）

之前各游戏各写一套：`game-icon replay-btn`（麻将三兄弟 + 数独，橙色描边）、`btn ghost`（赌神 / 对对碰，灰色）、
高度 64rpx / 68rpx / 72rpx 三种、内边距 20 / 26 / 28rpx 三种 ✗。

现在**只在 `App.vue` 定义一份**，所有页面共用（scoped 规则用 `!important` 压过）：

```css
/* 尺寸统一 */
.result .btn, .result-btns .btn, .result .game-icon, .result-btns .game-icon {
  height: 72rpx !important; line-height: 68rpx !important; padding: 0 28rpx !important;
  border-radius: 14rpx !important; font-size: 24rpx !important; font-weight: 700 !important;
  border: 2rpx solid transparent !important; margin: 0 !important;
}
/* 主操作（新游戏 / 下一关 / 继续）：绿底白字 */
.result .btn:not(.ghost):not(.replay-btn), … { background: #23804e !important; color: #fff !important; }
/* 次操作（重玩本关 / 再来一局）：橙色描边、透明底（web 的 .replay-btn 约定） */
.result .ghost, .result .replay-btn, …, .game-icon.replay-btn {
  background: transparent !important; color: #c2410c !important; border: 2rpx solid #c2410c !important;
}
```

- 三个页面里重复的 `.game-icon.replay-btn { … }` 局部规则**已删除** ✓；
- 标记沿用两种既有写法：`.btn.ghost`（赌神 / 对对碰）与 `.game-icon.replay-btn`（麻将三兄弟 / 数独），
  都映射到同一套橙色描边 ✓ —— **不需要改模板**，省掉一轮回归风险；
- **不碰** poker 的 `.btn`（那是下注按钮，语义不同）✓，也不碰 `.game-icon.god-btn` / `.pause-btn`（在工具栏里）✓。

**实测**（赌神胜利层）：
`重玩本关` → `bg: transparent / color: #c2410c / border: 1px #c2410c` ✓、`下一关` → `bg: #23804e / #fff` ✓；
两颗按钮**同为 38px 高、7.3px 圆角** ✓（= 72rpx / 14rpx）。

### 15. 分数区标题统一带 emoji（照 web 的 i18n 原文）

用户报「有几个游戏的分数区标题缺少 emoji」→ 普查 13 个页面，**core 字典那一批全缺** ✗：

| 页面 | 缺失的 label | 现在 |
| --- | --- | --- |
| 2048 | best / score | `🏆 最高分` / `✨ 分数` |
| 对对碰 | mBest / mLevel / mLeft | `🏆 最高关` / `🏁 关卡` / `🃏 剩余对数` |
| 赌神 | gBest / gLevel / gStreak / gLives | `🏆 最高关` / `🏁 关卡` / `🔥 连胜` / `❤️ 生命` |

**emoji 一律照 web 的 `src/games/<id>/i18n.js` 抄**（那张表是唯一的真相）：
`🏆 最高分/最佳`、`✨ 得分/分数`、`🏁 关卡`、`🔥 连胜`、`❤️ 生命`、`🀄 剩余`、`🃏 剩余对数`、
`👣 步数`、`🎯 目标`、`⏱ 用时`、`⏩ 速度`、`⏭️ 下一张`、`💰 资产`、`🎲 下注`。

**两种落地方式，按 key 是否被别处复用来选**：
- key **只用在 label 里** → 直接把 emoji 写进该页 `i18n.js` 的 cn / en 两条（如 snake / sudoku / three / down / mirror / poker）；
- key **别处也在用**（如 core 的 `score` 还会出现在结算行「分数 12」）→ **只在模板的 label 上加 emoji 前缀** ✗ 别改字典 ✗，
  否则结算文案也会冒出 emoji。

⚠️ **踩坑**：批量给字典加 emoji 时，我的「是否已有 emoji」判断只覆盖了 `1F300~1FAFF / 2B00~2BFF`，
漏了 `🀄 U+1F004`、`⏱ U+23F1`、`⏭ U+23ED` → **把已有 emoji 的条目前缀又加了一遍**（`🀄 🀄 剩余`）✗。
判断 emoji 要用完整范围（`1F000~1FAFF / 2300~27BF / 2B00~2BFF`）或直接看字符类别；
改完必须**渲染出来抽查**，不能只看脚本报告。

**验收**（H5，中英各 13 页）：扫 `.label / .stat-label / .title` 全部文本，首字符必须是 emoji → **0 处缺失** ✓
抽查结果：`🏆 最高分`、`🏁 关卡`、`🔥 连胜`、`❤️ 生命`、`🀄 剩余`、`🎯 目标`、`⏭️ 下一张`、`⏱ 用时` ✓

## 二十四、第六批迁移（Emoji 连连看 / Emoji 消消乐 / 侦探 / 猎手）

> 这一批是 4 个子任务并行写的（各自只写 `src/pages/<id>/`，不 build），我统一注册 + 构建 + 逐页探针。
> 现在小程序共 **19 个页面 / 18 张首页卡片**。

| 游戏 | 页面 | 逻辑文件 | 存档 key | 首页图标 |
| --- | --- | --- | --- | --- |
| Emoji 连连看 | `link/link.vue`（1330 行）| `board.js`（297 行，**md5 与 web 一致**）| `__emoji_link__level` / `_best_1` / `_state` | `i-mdi-link` |
| Emoji 消消乐 | `crush/crush.vue`（1488 行）| `board.js`（439 行，**cmp 逐字节相同**）| `__emoji_crush__level` / `_best_1` / `_state` | `i-mdi-star-four-points` |
| 侦探 | `detective/detective.vue`（1219 行）| 无（逻辑在组件内，与 web 一致）| `__emoji_detective__mode` / `_level[_2/_3]` / `_best[_2/_3]` | `i-mdi-incognito` |
| 猎手 | `hunter/hunter.vue`（1268 行）| 无（同上）| `__emoji_hunter__mode` / `_level[_2/_3]` / `_best[_2/_3]` | `i-mdi-target` |

**新增 UnoCSS safelist**：`i-mdi-link` / `i-mdi-star-four-points` / `i-mdi-incognito` / `i-mdi-target`
（模式图标复用已有的 `i-mdi-emoticon-happy-outline` / `i-mdi-cards-playing(-outline)` /
`i-dinkie-icons-three-of-circles-mahjong` / `i-carbon-timer` / `i-carbon-help`）。

### 1. 三个游戏有翻面，两个没有

- **侦探 / 猎手有 3D 翻面** → 严格照 §二十一：`.tile > .flip(perspective) > 两个常驻 .face`。
  猎手实测（rAF 逐帧，254 帧）：**换面时刻 2442ms、两面同现 1 帧且角度 88°**、
  轨迹 81° → 55° → 21° → 3° → 0° ✓；`backface-visibility: hidden` / `will-change: transform, opacity` ✓。
  侦探（80ms 采样）：换面在 1803ms / 2786ms 两个阶段切换点，**两面同现 0 帧** ✓。
  ⚠️ 这两个页面都把正反面写成**双类**选择器（`.face.face-back` / `.face.face-front`）——
  否则会被兜底那条 `.face { -webkit-transform: translateZ(0) }` 同权重后写压掉，**正面只淡入不旋转** ✗。
- **连连看 / 消消乐没有翻面**（web 也没有），§二十一 不适用。

### 2. 四页共用的做法（照已有的约定，不再重复解释）

`.screen > .page`（唯一 `min-height:100vh`）→ `.card.score-area`（`.stat`/`.stat-label`(带 emoji)/`.stat-value`/`.divider`）
→ `.card.opt-area` → 游戏区；帮助在右下角 `.fab`（侦探/猎手是「模式在上、帮助在下」两颗）；
帮助文案取 web `i18n.js` cn 段的 `helpMsg + help1..N`（`\n\n` 连接）；统计 label 的 emoji 全照 web 原文
（`🏁 关卡` `⏳ 剩余时间` `🧩 剩余对数` `🔄 剩余步数` `✨ 得分` `🎯 目标分` `🏆 最高关卡` `❤️ 生命`）。

### 3. 验证（我在构建后跑的，不是子任务自述）

| 项 | 结果 |
| --- | --- |
| 两目标构建 | `build:h5` + `build:mp` 均 DONE ✓，产物有 `pages/{link,crush,detective,hunter}/*` ✓，包体 **1.3M** |
| 页面加载 | 4 页全部渲染：link 18 张牌 / crush 49 格 49 颗宝石 / detective 1×3 牌 / hunter 12 张牌 ✓ |
| 交互 | crush 点 3 次找到有效交换 → **步数 22→21、得分 60** ✓；hunter 点候选牌 → **朝上 3→9** ✓；link 点两张牌 → 剩余对数仍 9（配对失败不回退）✓ |
| 翻面 | hunter 两面同现 **1 帧 / 88°** ✓；detective **0 帧** ✓ |
| 悬浮按钮让位 | link 余量 190rpx / crush 196 / detective 352 / hunter **24rpx**（都为正值 ✓）|
| 语言 | 4 页 × 中英：**裸 key 0、英文页中文残留 0**、帮助弹窗同样干净 ✓ |
| 首页 | **18 张卡片**，名字依次 …「Emoji 连连看 / Emoji 消消乐 / 侦探 / 猎手」✓ |
| 运行时异常 | 0（只有 H5 无手势时的 `NotAllowedError: play()` 音频自动播放限制，**不是 bug**）|

### 4. 这一批的降级（对用户已说明）

| 游戏 | 降级 |
| --- | --- |
| 连连看 | 连线用逐段圆头条代替 SVG（无 `link-comet` 扫光）；连击烟花用 CSS 粒子（`@/core/sfx` 无 `playFirework`，不发声）；「新游戏」确认框从三按钮变 `uni.showModal` 两按钮（少了「重玩本关」入口）；抖动期只挡那两张牌（**故意不写全局锁**）|
| 消消乐 | 拖动只能用触摸（无 Pointer Events）；连击的 `burstConfetti` + 烟花音未做；庆祝/震屏用「摘类名 → 20ms 再挂」重播（替代 `offsetWidth`）|
| 侦探 / 猎手 | 扑克牌面自绘（web 复用 `poker/CardItem`）；麻将牌背用 CSS 斜纹近似 `MahjongBack`；小屏为让开 FAB 会把牌缩小（375×667 上比 web 小 6~17%）；`disableScroll: true` |
| 四页共同 | 标题连点清记录彩蛋不可移植（原生导航栏）；仅亮色主题 |

### 5. 子任务交付后我改的东西（清单式，避免「谁改了什么」说不清）

1. `pages.json`：注册 4 页（`navigationBarTitleText` 用中文，**逐页**写 `#f0f2f5` 底 + black 文字；
   侦探/猎手加 `disableScroll: true`，连连看/消消乐不加 —— 它们 320 宽的极短屏可能轻微滚动，
   加了反而裁掉底部）；
2. `core/i18n.js`：**cn 和 en 各补 4 个** `game.link/crush/detective/hunter`；
3. `pages/index/index.vue`：末尾加 4 张卡片（`nameKey` + `icon` + `url`），首页从 14 张变 18 张；
4. `uno.config.js`：safelist 补 4 个首页图标。

> 教训（第 25 条，补进 §零 的同类问题）：**子任务会「只写页面目录」**，所以每次批量移植后必须自己补齐
> `pages.json` / 首页卡片 / `core/i18n`（**cn+en**）/ `uno safelist` 这四处，否则路由 404 或图标空白 ✗。

### 6. 侦探：麻将 3 列时牌太小、结算按钮被挤到换行

用户报「切到麻将元素、一行 3 个的时候牌要适当大一点，现在宽度会让胜利遮罩的按钮换行」。
**根因**：麻将模式的上限照抄 web 的 `60px`（115rpx），3 列时棋盘只有 **393rpx ≈ 206px**，
而两颗结算按钮实测占 **101 + 88 + 间距 ≈ 197px** → 正好放不下 ✗。

**修法**：
- `MAHJONG_MAX_W` **115 → 150rpx**（3 列时棋盘 261px、牌 79×101，比原来的 60×77 明显大一档）；
- `.result-btns` 保持 `flex-wrap: wrap`（**不要改成 nowrap**：2×2 这种 176px 的极窄局面会溢出圆角 ✗）。

**实测（9 个麻将关卡全扫）**：棋盘宽 176~362px、牌 65~101px、棋盘底到 `.fab` 顶最小余量 **96px** ✓；
- 3 列：棋盘 **261px**、按钮 **1 行**、无溢出 ✓；375×667 小屏：棋盘 249px、按钮仍 **1 行** ✓；
- 2×2 极窄：按钮 **2 行但无溢出** ✓（优雅降级）。

## 二十五、第七批迁移（数字迷宫 / 点击游戏 / 消除大师）

> 3 个子任务并行写页面（只写各自目录、不 build），我统一注册 + 构建 + 逐页探针。
> 现在小程序共 **22 个页面 / 21 张首页卡片**（web 25 个游戏，还差 4 个）。

| 游戏 | 页面 | 逻辑文件 | 存档 key | 首页图标 |
| --- | --- | --- | --- | --- |
| 数字迷宫 | `puzzle/puzzle.vue`（688 行）| 无（`difficulty.js` / `rocker.js` 只有 20 行存 `localStorage`，按规则在页面内用 `@/core/storage` 重写）| `__number_puzzle__difficulty` / `__number_puzzle__<3..6>` / `__number_puzzle_rocker`（**单下划线**）| `i-mdi-puzzle` |
| 点击游戏 | `click/click.vue`（601 行）| `difficulty.js`（只把 `localStorage` 换成 `getRaw/setRaw`）| `__easy_click_game__difficulty` / `__easy_click_game__<3..10>` | `i-carbon-touch-1` |
| 消除大师 | `master/master.vue`（1284 行）| `board.js`（**逐字节复制**）| `__emoji_master__` 系列 | `i-mdi-layers-triple` |

新增 safelist（都是页面里实际用到的静态类，双保险）：`i-mdi-puzzle` / `i-carbon-touch-1` /
`i-mdi-layers-triple` / `i-mdi-power-socket-fr` / `i-mdi-cursor-move` /
`i-mdi-arrow-{up,down,left,right}-bold-circle`。

### 1. 三页共同点

- `.screen > .page`（唯一 `min-height:100vh`）→ `.card.score-area`（label 带 emoji，如 `🏆 最佳得分` /
  `👆 点击次数` / `👆 剩余点击` / `🏁 关卡` / `🃏 剩余卡片`）→ `.card.opt-area` → 游戏区；
  帮助在右下角单颗 `.fab`（数字迷宫还有一颗**摇杆开关**，图标 `i-mdi-power-socket-fr` / `i-mdi-cursor-move`）。
- 棋盘/容器尺寸**由内容反算**（`2*PAD + n*cell`），格子与内容**共用同一份 PAD/step**、全绝对定位。
- 页面**都可滚动**（没有加 `disableScroll`）：数字迷宫 5/6 难度、点击游戏难度 10、消除大师托盘都会超屏。
  底部统一 140rpx 让开 FAB —— 实测最下元素到 `.fab` 顶的余量：迷宫 **287px**、点击 **177px**、消除大师 **128px** ✓。

### 2. 只有一处需要留意的降级

- **数字迷宫的摇杆开关**从 web 顶栏挪到了右下角 FAB，但 web 的 `help2` 文案写的是「在左上角开关」→
  为了不篡改 web 文案保持了原文（**这是已知的不一致，用户若提出来就改文案**）。
- 点击游戏的「蒙层波浪」用 `setInterval(16ms)`（web 是 rAF），`onHide` 停表 / `onShow` 续 / `onUnmounted` 清。

### 3. 验收（构建后实测）

| 项 | 结果 |
| --- | --- |
| 两目标构建 | `build:h5` + `build:mp` 均 DONE ✓，产物有 `pages/{puzzle,click,master}/*` ✓，包体 **1.4M** |
| 页面加载 | 迷宫 16 格 / 点击 36 格 / 消除大师 24 张牌 + 7 个托盘槽 ✓ |
| 交互 | 迷宫点邻居 → 点击次数 **0→1** ✓；点击游戏点一格 → 剩余点击 **36→35** ✓；消除大师点一张牌 ✓ |
| 语言 | 3 页 × 中英：**裸 key 0、英文页中文残留 0**、帮助弹窗同样干净 ✓ |
| 首页 | **21 张卡片**，末尾正是「数字迷宫 / 点击游戏 / 消除大师」✓ |
| 运行时异常 | 0 ✓ |

> 教训（第 27 条）：**子任务仍会「只写页面目录」**，所以每次批量移植后我必须自己补齐
> `pages.json` / 首页卡片 / `core/i18n`（**cn+en**）/ `uno safelist` 这四处 —— 这次子任务的报告里
> 甚至以为「en 段缺 game.*」（其实我已经补了），说明**它的静态检查是过期的，必须我自己复核**。

### 7. 侦探：麻将牌没有圆角 + 结算遮罩被窄棋盘挤爆

用户报的两条，根因都在「小程序比 web 多一层」：

1. **麻将牌直角**：`.mj { border-radius: 10rpx }` → `MahjongTile` 的 `.mj-wrap { border-radius: inherit }`
   在 H5 里继承的是 `.mj` ✓，但**小程序把宿主节点插在中间** ✗ → 继承到 0。
   修法：`MahjongTile.vue` 的非 scoped `:host` 补 `border-radius: inherit`，并给
   `<MahjongTile class="mj-face">` 显式 `border-radius: 10rpx; overflow: hidden`（双保险）。
   实测 `.mj` / `.mj-wrap` 计算值都是 **5.24px**（= 10rpx）✓，产物里 `:host{…border-radius:inherit}` ✓。
2. **结算遮罩宽度**：`.result` 原来 `left:0; width:100%`，窄棋盘（麻将 2×2 = 176px）容不下
   两颗按钮（≈221px）→ 换行。改成 `left:50%; transform:translateX(-50%); min-width:480rpx; max-width:702rpx`。
   实测：2×2 遮罩 **252px**（覆盖棋盘 ✓、居中偏差 0、按钮 1 行）；1×3 遮罩 = 棋盘 **261px**（同 1 行）；
   1×4/4×5 等更宽的棋盘走 `width:100%`，不受影响 ✓。

## 二十六、第八批（最后 4 个）：Emoji 滑行 / Emoji 排序 / 扑克炼金术 / 单人麻将

> **web 的 25 个游戏已全部迁移完** —— 小程序现在 **26 个页面 / 25 张首页卡片**，首页蜂窝正好铺满
> web 的 4/3/4/3/4/3/4 布局。包体 **1.6M**（2M 上限，还有余量）。

| 游戏 | 页面 | 逻辑文件 | 存档 key | 首页图标 |
| --- | --- | --- | --- | --- |
| Emoji 滑行 | `slide/slide.vue` 1164 行 | `board.js` 258 行（**逐字节**）| `__emoji_slide__state` | `i-mdi-arrow-all` |
| Emoji 排序 | `sort/sort.vue` 1157 行 | `board.js` 455 行（**逐字节**）| `__emoji_sort__mode/level/state/level_2/state_2/best_1/best_2` | `i-mdi-test-tube` / 模式第二态 `i-mdi-test-tube-empty` |
| 扑克炼金术 | `alchemy/alchemy.vue` 1411 行 | `board.js` 317 行（**逐字节**）| `__poker_alchemy__mode/level[_2]/state[_2]/best_1/best_2` | `i-mdi-flask-outline` |
| 单人麻将 | `solo/solo.vue` 1248 行 | `board.js` 246 行（**逐字节**）| `__solo__state/streak/best_streak` | `i-dinkie-icons-red-dragon-mahjong` |

4 个 `board.js` 全部用 md5 与 web 对过，**逐字节一致** ✓。

### 1. 这一批的两个新经验

1. **`sort` 把 web 的 `scaleX` 压扁翻面改成了 §二十一 标准**（两面常驻 + `.flip` perspective），
   `FLIP_MS` 同步 340 → 460ms。这是「web 有翻面但不标准」时**必须主动改造**的例子。
2. **`solo` 的麻将牌宿主圆角**：`<MahjongTile class="mj-face">` + `.mj-face{…border-radius:9% / 7%;overflow:hidden}`
   —— 正好用上 §零 第 9 条（宿主节点吃掉 `border-radius: inherit`）。

### 2. 降级（都已对用户说明）

| 游戏 | 降级 |
| --- | --- |
| Emoji 滑行 | 连击烟花 canvas-confetti → CSS 粒子；**没有 firework 音效**（`core/sfx` 只有 4 个导出，不许改）；牌位 `translate3d` → `absolute+left/top`；指针事件 → touch |
| Emoji 排序 | 翻面按 §二十一 重写（见上）；模式按钮从顶栏移到右下角 FAB |
| 扑克炼金术 | 得分 ≥300 的短促烟花 → 震屏 + 光圈 + 浮字；飞牌改为「预量棋盘 + 同步算落点」，量不到直接落位 |
| 单人麻将 | 手牌宽度用 rpx 现算（不用 `clientWidth`）；杠 tooltip 方向按行号判定；飞牌用 fixed 替身 + transition |
| 四页共同 | 连点标题清记录彩蛋不可移植；仅亮色主题 |

### 3. 验收（我自己构建后实测，不是子任务自述）

| 项 | 结果 |
| --- | --- |
| 两目标构建 | 均 DONE ✓，包体 **1.6M** |
| 页面加载 | 滑行 36 张牌 / 排序 5 槽 + 卡片 / 炼金术 16 格 / 单人麻将 14 张手牌 ✓ |
| 真交互 | 滑行点击 ✓；排序「选卡 → 点槽」→ **步数 0→1** ✓；炼金术放牌 → **剩余 24→23** ✓；单人麻将出牌 → **剩余 40→39** ✓ |
| 占位 | 最下元素到 FAB 顶余量：滑行 222px / 排序 327 / 炼金术 30 / 单人麻将 188 ✓ |
| 中英 | 4 页 × 中英：**裸 key 0、英文页中文残留 0** ✓ |
| 首页 | **25 张卡片**；英文 0 个裸 key、0 个中文名；中文 25 个名字全对 ✓ |
| 异常 | 0 ✓ |

### 4. 最后补的 i18n 坑（第 30 条，已进 §零）

补 `game.*` 时我以为 cn/en 都加了，实测 **en 段少了 7 个**（`game.puzzle/click/master/slide/sort/alchemy/solo`）——
因为两次插入用的锚点在 en 段里不存在（缩进/邻居不同）✗，而**中文模式完全看不出问题**。
→ **审 key 必须做「cn 与 en 的 `game.*` 集合 diff」**，并**在 en 模式下打开首页**看有没有裸 key。
这次是「首页 25 张卡片、en 模式 0 裸 key」才算收工。

### 5. 首页「默认牌面」漏了「扑克」这一项

用户报「设置里的默认牌面漏了一个扑克」。`SettingsSheet.vue` 的 `faceOpts` 只有
`Emoji` / `麻将` 两项 ✗ —— 但 `core/settings.js` 的 `readFace()` **是认 `'poker'` 的**，
各页的 `FACE_TO_MODE` 也都有 `poker` 分支 ✓，所以只是**选择器少了一项**，改一行即可。

**修法**：`faceOpts` 补 `{ value: 'poker', label: t('setPoker') }`（顺序 Emoji / 扑克 / 麻将），
`core/i18n.js` 的 **cn / en 各补 `setPoker`**（`'扑克'` / `'Poker'`）。

**验收**：
- 设置面板按钮变成 **Emoji / 扑克 / 麻将**（en：**Emoji / Poker / Mahjong**）✓；
- 点「扑克」→ `localStorage.__games_hub__face = 'poker'` ✓；
- 进**侦探**（没自己选过牌面）→ 模式显示 **扑克** ✓，说明默认牌面链路是通的。

> 教训：**「选项少了」和「逻辑没接」是两回事** —— 改这类问题先 grep 数据源（`settings.js` 认哪些值）
> 与消费端（各页 `FACE_TO_MODE`），确认只缺 UI 一项再动，别去重写映射。

### 6. 单人麻将：飞牌「先闪一下」的真正原因（坐标空间），以及个别手牌不可见

用户报过两次：「摸牌 / 打牌时牌会闪烁」「牌从手牌区飞出之前会闪烁」+「偶发手牌里个别牌不可见」。

#### 6a. 闪烁 = 坐标空间混用（这次终于量出来了）

旧实现：`.flying` 替身是 `position: fixed`（**视口空间**），而 `left/top` 来自 `uni.createSelectorQuery().boundingClientRect`
（**页面内容空间**，H5 里比视口少一个 44px 导航栏）。实测打出一张牌的第一帧：

| | 手牌那张牌 | 替身 |
| --- | --- | --- |
| 位置 | (23, **482**) | (23, **438**) |

→ 替身**凭空出现在比源牌高 44px 的地方**，看起来就是「牌先跳一下再飞」；再叠上旧顺序
（先 `hiddenTileId` 藏起来 + `commit()`，再 `await nextTick()`、再异步 `queryRect`，之后才创建替身），
前后有 2~4 帧「源牌没了、替身还没出来」→ 玩家看到的就是闪烁。

**现在的做法**（`pages/solo/solo.vue`，摸牌 / 出牌 / 杠牌三条路径统一）：

1. `.flying` 改 **`position: absolute`** —— 和 `boundingClientRect` 同一个空间（内容空间），
   页面滚动时替身也跟着走；
2. **顺序反过来**：① 替身先在**源位置**立住（`dx/dy = 0`、`scale = 1`）→ ② `await nextTick()`（让替身先画出来）
   → ③ 才 `hiddenTileId` + `commit()`（源牌消失时替身已经在原地顶着，**没有空帧**）
   → ④ 量落点、置 `go: true` 飞过去 → ⑤ `finally` 里先清隐形标记、再撤替身；
3. 杠牌（一整组 4 张）同样处理（`doKong` 里内联，不再走单独的 `flyGroup`）；
4. 整段 `try/finally`：任何一步抛错都不会留下「隐形牌」或「不走的替身」。

**实测（H5，390×844，逐帧采样）**：替身起点偏差 **dx=0 / dy=0 / 宽差 0**、**空帧 0**、
落定后 `替身残留 false`；杠牌组起点偏差同样 **dx=0 / dy=0**、杠行最后 `visibility: visible` ✓

#### 6b. 个别手牌不可见：三个可能原因都封掉了

H5 里 20 次连续出牌**复现不出来**（0 异常、手牌恒 14 张、`fly-hidden` 残留 0），
所以按「真机合成层 + 状态残留」两类原因各封一层：

1. **去掉每张手牌各自的合成层提示**：旧版本给 `.hand-tile` 加了
   `backface-visibility: hidden; translateZ(0); will-change: transform, opacity; overflow: hidden`（14 张牌各自提升一层）。
   牌面是 **735% 放大的雪碧图 + 圆角裁切**，部分机型上会出现「个别牌整张不参与绘制」。
   → 现在这些属性全部去掉（**别再按旧笔记加回来**），圆角与裁切由内层 `MahjongTile` 的
   `.mj-wrap { overflow: hidden; border-radius: inherit }` 负责；实测手牌外观不变（截图核对过圆角与牌面）✓
2. **隐形标记的残留**：`hiddenTileId` / `hiddenKongIndex` 只表示「这张牌正在飞、先藏起来」，
   一旦某条 `await` 链提前 `return`（`seq !== roundSeq`、量不到落点、异常）就可能永远留着 → 那张牌永久不可见 ✗。
   现在三条飞行路径都包在 `try/finally` 里强制清理，并加了一条**空闲态兜底 watch**：
   `!busy && !flying && !dealing` 时若还有隐形标记，立刻清掉。
3. **杠行那一组**：旧的 `doKong` 在「量完落点发现换局了」时直接 `return`，**没清 `hiddenKongIndex`**
   → 杠行里那一组永久隐形（和用户描述吻合）。现在也走 `try/finally`。

> 真机上如果再看到「个别牌不可见」，先查三件事：① 那张牌的 `visibility/opacity`；
> ② 它父级（`.hand-card`）有没有被 `overflow: hidden` 裁掉（槽位 `left/top` 超界）；
> ③ 是不是 `hiddenTileId` 残留（现在有兜底 watch，理论上不该再有）。

### 7. 扑克炼金术：游戏区改成屏宽 75%

`CONTENT_W_RPX`（棋盘宽度基准）从 **690 → 562rpx**（= 750 × 0.75），`computeMetrics()` 里的
`availW = CONTENT_W_RPX - pad*2` 自然把格子重算小：4×4 时格子 **153 → 121rpx**、牌 64×96px（原 79×118）。

**实测**（393×852）：棋盘 **295px = 75.1%** 屏宽、居中偏差 **0**、格子 64×96、棋盘底距 `.fab` 顶 **120px** ✓。
375×667 上只有 **64.5%** —— 那里是**高度预算先到顶**（`byH` 比 `byW` 小），不是宽度没生效：
这种矮屏本来就被高度约束（改之前同样是 242px 左右），棋盘整体等比缩小、不溢出 ✓。

> 别在这里写 `width: 75%` —— 页面在 `.page`（690rpx）里，百分比会变成「页面宽的 75%」（§零 第 10 条）。

## 二十七、第六轮修复（扑克翻面/小牌、首页配色与跳动、2048、滚动锁、候选牌圆角、炼金术宽度）

### 1. 德州扑克：翻面动画「压扁 + 忽远忽近」

**根因**：`.card-wrapper` 和 `.flip` **各写了一份 `perspective: 700rpx`** ✗ —— 双重透视，翻面时透视中心变了，
观感就是「牌在推近/拉远」。§二十一 铁律 2 写得很清楚：**perspective 只放 `.flip`**。
**修法**：删掉 `.card-wrapper` 里的那份，只留 `.flip`。
**实测**：`包装透视 none / flip透视 366.8px` ✓；点「发牌」后逐帧采样：**两面同现 1 帧、角度 88°**、
轨迹 0° → 4° → 81° →（换面）→ 10° → 0° ✓（与 match / mirror 完全一致）。

### 2. 德州扑克：猜大小的小牌「数字被遮挡」

**根因**：mini 牌走的是「把尺寸缩小 + 另给一套更小的 `--pos/--text-size/--suit`」✗ ——
点数被小尺寸和 3D 合成层挤掉/糊掉。
**修法（按用户要求「正常渲染 + 缩放」）**：内部**按大字牌的尺寸渲染**，只把 `.flip` 等比缩放：
```css
.card-wrapper-mini { width: 76rpx; height: 114rpx; margin: 6rpx; }
.card-wrapper-mini .flip {
  width: 104rpx; height: 156rpx;
  transform: scale(0.7308); transform-origin: 0 0;
  perspective: none;                 /* 小牌不翻面，不要 3D 上下文 */
}
.card-wrapper-mini .face { transform: none !important; opacity: 1 !important; transition: none !important; }
```
同时删掉 `.card-wrapper-mini .card-suit { font-size: 54rpx }` 这类「另立一套字号」的覆盖 ——
缩放后字号/角标比例自然正确。

### 3. 首页（蜂窝）：图标配色 + 跳动方式照 web

- **配色**：web 的 accent 落在三处 —— `.hex-body i { color: var(--accent) }`（图标本体）、
  `.hex { background: color-mix(accent 18%, #c9d0da) }`（六边形描边）、`:active`（按下态）。
  小程序落地：`.hex-icon { color: var(--accent) }` + `.hex.acc-<分类>` 给 `--accent` 与**预混好**的描边色
  （WXSS 没有 `color-mix`，按 sRGB 18% 算好：logic `#23804e`/`#abc2c1`、number `#2c6aad`/`#adbed2`、
  memory `#7550ad`/`#bab9d2`、card `#8f6419`/`#bfbdb7`、action `#bd5420`/`#c7bab9`）。
- **跳动**：web 的 `hex-pop` 延迟/时长**不是**按行序 40ms，而是 `hash(id)` 决定：
  `delay = 350 + hash%400`、`duration = 520 + hash%160`、`fill-mode: backwards`、
  曲线 `cubic-bezier(.34,1.56,.64,1)`，关键帧 0/55/78/100%。
  小程序的 `hash/enterStyle` 与 web **字符串全等**，模板内联下发。
- **实测**（H5）：25 格里 `2048/24 点` 图标 `rgb(44,106,173)`、`对对碰` `rgb(117,80,173)`、
  `赌神/麻将英雄/雀圣` `rgb(143,100,25)`；描边 `rgb(173,190,210)/(186,185,210)/(191,189,183)`；
  `animationDelay 0.359s / 0.428s / 0.515s …`、`animationDuration 0.529s / 0.598s …`、
  `fill-mode backwards` ✓。
- **代价**：`backwards` 意味着首屏前 350ms 全部透明（web 用 300ms 路由过渡遮住）。冷启动若觉得空，
  只能调小 `ENTER_BASE`，但那就不与 web 一致了。

### 4. 2048：滑动不自然 + 「数字不显示 / 停在半路」

子任务做的（详细报告见对话），要点：
- 动画层与局面 state **彻底分离**：`ghosts`（独立数组，只渲染）/ `popping`（独立 Set，按 id）✗ 不再写进 `tiles`；
  删掉「每个合并两个定时器各对整个 tiles 表 map 一次」✗ —— 那会让 `wx:for` 整表重建、打断正在跑的 `left/top` 过渡，
  **这才是「牌停在半路 / 数字不显示」的真凶**（算法本身与 web 逐行一致，差分对拍 0 失败）。
- 时长/曲线照 web：位移 `0.13s ease-in-out`、合并 `0.19s ease-out merge-pop`、
  新牌 `0.18s ease-out 0.15s backwards deal-in`、合并牌滑行期间 `opacity: 0`、源牌变 ghost 滑到目标格。
- **实测**（H5）：`.tile` 计算值 `transition: left, top 0.13s ease-in-out` ✓；合成滑动后
  2 张 → 3 张（+1 新牌 ✓）、`is-new` 状态持续可见（27 次采样）✓、0 异常。
- 未验证：真机 `GHOST_LAG=20ms`（幽灵 FLIP 的第二拍）。若真机上幽灵瞬移，调 30 并把 `.is-new` 的 0.15s 改 0.16s。

### 5. 数字迷宫 / 点击游戏 / 德州扑克：禁止垂直滚动

`pages.json` 三页补 `disableScroll: true` ✓（都是单屏 / 拖拽类页面；德州扑克拖拽依赖缓存的棋盘矩形，
禁滚动更稳）。H5 侧无法真正验证（H5 的 44px 是自带的 uni 导航栏），以开发者工具 / 真机为准。

### 6. 麻将英雄 / 麻将传奇：候选牌圆角

- **麻将英雄**：`tileStyle()` 原来只有宽高 ✗ → 补 `borderRadius: w * 0.09` + `overflow: hidden`，
  `.tile-slot` 也加 `overflow: hidden`；顺便去掉 `.current .mj { border-radius: 18rpx }` 的覆盖（高亮只留 box-shadow）。
- **麻将传奇**：`slotStyle()`（手牌/预览）同样补 `borderRadius` + `overflow: hidden`，去掉同一条 18rpx 覆盖。
- **实测**：两页候选牌的**宿主节点 / 牌面** `border-radius` 都是 **4.192px**（= 84rpx × 0.09，与棋盘牌同口径）✓。
> 又是 §零 第 9 条：把小程序的「组件宿主」漏掉，圆角就断链；这次是**宿主 + 牌面都量到同一值**才算过。

### 7. 扑克炼金术：棋盘改成屏宽 75%

见 §二十六 第 7 节（`CONTENT_W_RPX 690 → 562`）。

### 8. 麻将英雄的候选牌「还是没有圆角」—— 真凶是高亮环，不是圆角

上一轮已经给 `tileStyle()` 补了 `borderRadius` + `overflow: hidden`，H5 里量 `.mj-wrap` 确实是 **4.192px** ✓，
但用户看候选牌还是**直角**。截图放大后原因很清楚：

> 候选牌那张有 **`.current .mj { box-shadow: 0 0 0 4rpx #23804e }`** 的绿色高亮环 ——
> `box-shadow` 的 **spread** 会从元素边缘**向外铺满 4rpx**，把四个圆角外侧的缝隙**填成方的** ✗。
> 牌本身是圆的，但「牌 + 环」的外轮廓在视觉上就是直角（环越亮越明显）。

**修法**：把高亮环从**牌**移到**槽位**（槽位自己给同样的圆角，环就沿圆角走）：
```css
.tile-slot { overflow: hidden; border-radius: 8rpx; }
.current   { border-radius: 8rpx; box-shadow: 0 0 0 4rpx #23804e; }
/* 牌上不再画环 */
```
**实测**（H5）：槽 / 包裹都是 **4.192px**、`box-shadow: rgb(35,128,78) 0 0 0 2.096px`（跟着槽位的圆角走）；
把候选区截图放大后，**六个点那张的四个角与绿环都是圆的** ✓，与右侧预览牌一致。

> **教训（第 31 条）**：用户说「圆角没生效」时，**先把那块区域截图放大** ——
> 很可能是别的东西（高亮环、边框、外发光、父级白底）把圆角**盖住了**，
> 而不是 `border-radius` 没写。只测 `getComputedStyle().borderRadius` 会漏掉这类问题。

## 二十八、全站背景（粒子连线 + 过山车）与首页上移

### 1. 首页蜂窝的位置（最终版：**整体居中**）

这个位置调了四轮，记下来免得再绕：
1. 原始：`justify-content: center` → 上下余量 **141 / 158px**（基本居中）；
2. 改成「顶部对齐 + `7vh`」→ 顶部 104px，用户反馈**太靠上** ✗；
3. 改成「居中 + 140rpx 上偏」→ 网格中心比屏幕中心高 **14px**，用户反馈**可以再往下、现在该居中了**
   （因为顶栏已经放了游戏图标）；
4. **最终版：蜂窝整体居中** —— 底部内边距 = 顶部 40rpx + 顶栏高度 88rpx，
   把顶栏占掉的那段在下方补回来，这样对齐的是**蜂窝本身**而不是「顶栏 + 蜂窝」这一整块：
   ```css
   .page { padding: 40rpx 32rpx 128rpx; justify-content: center; }
   ```
   **实测**：393×852 → 余量 **150 / 150**、网格中心与屏幕中心差 **0**；
   375×667 → **70 / 70**、差 **0**；两档都无滚动 ✓。

### 2. 全站背景：`components/ParticleBackground.vue`（629 行）

从 web `src/shared/ParticleBackground.vue` 逐行移植，**常量与公式逐项相等**（34 项常量 + 31 条关键表达式 +
HILLS 逐字符、draw() 顺序一致；轨道 282 点 / 总弧长 1033.28 / 首尾闭合 0 误差，与 web 同视口计算**最大差 0**）：
- 粒子：`LINK_DIST 130 / MAX_PARTICLES 70 / AREA_PER_PARTICLE 9000 / DOT_ALPHA .36 / LINE_ALPHA .2 …`
- 过山车：`g 980 / vMin 44 / vMax 430 / cars 3 / carGap 13 / carW 11 / carH 6 / trail 62 /
  trackAlpha .23 / strutAlpha .1 / carAlpha .38`、4 座高斯山 + `LOOP_U .285` 竖直回环 + 两端半圆回转 + 底边回程，
  能量守恒 `v = min(vMax, √(2g·落差 + vMin²))`、7 段拖尾、3 节车厢。

**小程序适配（4 条要点，以后再做 canvas 背景照抄）**
1. `canvas type="2d"` + `uni.createSelectorQuery().in(proxy).select('#id').fields({node:true,size:true})`
   （`type="2d"` 才同层渲染，普通 view 才能压在它上面）。节点 60ms×3 重试，拿不到就静默退出（页面照常可用）。
2. 循环优先 **`canvasNode.requestAnimationFrame`**，没有才 `setInterval(draw, 16)`；`onUnmounted` 里
   `cancelAnimationFrame` + `clearInterval` 都要收，另加 `running` 闸门防止残留帧续命。
3. **停表信号**：小程序页面级 `onHide/onShow` **只派发到页面 vm**，写在子组件里很可能不触发 ✗ →
   补 `onAppHide/onAppShow`（app 级）兜底，`onUnmounted` 再兜一层。
4. **指针联动降级**（web 有 / mp 没有）：小程序没有全局 pointermove → `POINTER_ENABLED=false`，
   `pointer.active` 恒 false，变量 / handler / 两个 `if` 分支全部保留，参数与 web 相同，以后接上 touchmove 广播即可打开。

**层级与底色（这次踩的坑，和 web 完全不同的部分）**
- 画布必须 **`z-index: -1`**：canvas 是定位元素，`z-index: 0` 会画在所有**非定位**内容（卡片 / 蜂窝 / 棋盘格）之上
  → 粒子浮在内容表面 ✗。负值才能落在「页面根底色之上、内容之下」。
- 负值的前提是**页面根元素不能有不透明底色** ✗：26 个页面的 `.screen` / `.page` 原来都有
  `background: #f0f2f5` → 会把整层画布盖住（第一版就是这样，画布在画、屏幕上什么都没有）。
  已全部改成 `background: transparent`。
- 页面根 `page {}`（`App.vue`）也改成 **transparent**，否则同样盖住 ✗；**底色改由画布自己铺**
  （每帧 `ctx.fillRect` 填 `#f0f2f5` = `PAGE_BG`），窗口层（下拉回弹 / 导航栏周围）由
  `pages.json` 的 `window.backgroundColor: #f0f2f5` 兜住。
- ⚠️ **不要给 `.screen` / `.page` 加 `z-index` / `transform` / `filter`**：会创建层叠上下文，
  负 z-index 的画布立刻沉到最底下看不见。

**实测（H5，393×852 @2x）**
| 项 | 值 |
| --- | --- |
| 画布存在 / 尺寸 | ✓ / 786×1704（= 393×852 × dpr 2）|
| 每帧在动 | 两次 `toDataURL` 长度 145874 → 142470 ✓ |
| 画布自身像素 | 非底色行从 y≈80 到 1700 都有（粒子全程 + 过山车在 y 1460~1680）✓ |
| 层级 | `z-index:-1`、`position:fixed`；点六边形中心命中 `hex-icon` ✓、数独格命中 `cell` ✓、对对碰牌命中 `face` ✓ |
| 页面根底色 | `.page` / `.screen` 计算值 `rgba(0,0,0,0)` ✓ |
| 26 页挂载 | `particle-background` 出现在 26 个页面的 WXML 里 ✓ |

> **真机待确认**（H5 验不了）：canvas 同层渲染时「内容能否稳定压在画布上」「页面滚动时 fixed 画布是否跟滚」
> 「26 个页面各挂一个 60fps 循环的开销」。若某机型出现画布盖住内容，最省事的回退是把该页的
> `<ParticleBackground />` 删掉（组件独立，不影响其它逻辑）。

### 9. 三个后续修复（传奇高亮环 / 扑克换牌翻面 / 猜大小小牌与牌背）

**① 麻将传奇候选牌第一张也加绿色高亮环** —— 照麻将英雄那套，**环画在槽位上**：
```css
.current { border-radius: 8rpx; box-shadow: 0 0 0 4rpx #23804e; }
/* 牌上不再画环（画在牌上时 spread 会把四个圆角补成直角） */
```
实测：槽 / 牌面圆角都是 **4.192px**、槽 `box-shadow: rgb(35,128,78) 0 0 0 2.096px`、牌面 `none` ✓；
截图里绿色环是**圆角**的，贴着牌的四角 ✓。

**② 德州扑克「换牌」= 先整体快翻到背面 → 再逐张翻回**
web 的做法是一次性把所有未保留的牌清成牌背（同一拍），再用 `await sleep(DEAL_INTERVAL)` 逐张填新牌。
小程序之前少了「快」和「整批」这两点：`isBack` 的 watcher 会把 `shown` 立刻置 true，把 `animate` 的
20ms 延迟打断 → 看起来是「瞬间跳成正面」而不是翻回来 ✗。
改法：
- `card.vue` 加 `quick` prop → `.card-wrapper.quick .face { transition-duration: .24s, .01s; transition-delay: 0s, .12s }`
  （盖背面那一拍用快翻，翻回来恢复 0.46s）；
- `card.vue` 加 `flipping` 守卫：动画在飞时 `watch(isBack)` **不要**改 `shown`（否则看不到翻面）；
- `poker.vue` 换牌：先 `quickFlip = true` + 一次性把所有未保留的牌清成 `['','']` → `await sleep(QUICK_FLIP_MS=260)`
  → `quickFlip = false` → 再按 `DEAL_INTERVAL` 逐张填新牌 + `bumpCard(i)`。

**实测（H5，40ms 采样 2.6s）**：`quick` 出现 **13 帧**、那一拍 `transition-duration = 0.24s` ✓、
之后恢复 **0.46s** ✓；正面数时序 **5 → 0（t≈22ms，一起翻到背面）→ 1@582 → 2@822 → 3@1063 → 4@1304 → 5@1622**
（每张间隔 ≈ 240ms = `DEAL_INTERVAL`）✓，即「先快速翻面、再挨个翻回来」✓。

**③ 猜大小的小牌：数字被裁成一条 —— 缩放加在了错误的那一层**

用户要求「正常大小渲染 + 缩放」。第一版把 `transform: scale(.7308)` 加在**内层 `.flip`** 上 ✗，
结果点数 `<text>` 的盒子被压成 **7×0px**、字形被裁成一条竖线 ✗（截图里就是「数字展示不全」）。
**正解：缩放加在「外层包装」上**，内部完全按大字牌渲染：
```css
.card-wrapper-mini {
  width: 104rpx; height: 156rpx;      /* 与大字牌一致（正常尺寸渲染） */
  margin: -21rpx -14rpx;              /* 负 margin 收回多出的占位，行内排版不变 */
  transform: scale(0.7308);           /* 视觉 76×114 */
  transform-origin: center center;
}
.card-wrapper-mini .flip { width: 100%; height: 100%; perspective: none; transform: none; }
.card-wrapper-mini .face { transform: none !important; opacity: 1 !important; transition: none !important; }
```
**实测**：小牌视觉 **40×60px** ✓，点数 `9` / `8` 完整渲染、相对位置 3,3 与 29,57 ✓、在框内 ✓、
花色 ♥/♦ 完整 ✓；截图确认四角数字齐全（底部那个是 `rotate(180deg)` 的镜像 ✓ 与 web 一致）。

**④ 牌背点阵更淡**：`#9a9a9a` → `rgba(154,154,154,.55)`，点半径 0.4rpx（原 0.5rpx）。
实测计算值 `radial-gradient(circle, rgba(154,154,154,0.55) 0.2096px, …)` ✓。

> **教训（第 32 条）**：`transform: scale()` 要加在**最外层**（那个已经有了完整布局盒的元素）上。
> 加在内层容器上时，内层里的**行内文本**（uni 的 `<text>`）盒子会被压成 0 高、字形被裁 ✗，
> 而且 `getBoundingClientRect` 量出来是 `7×0` 这种反直觉值 —— **这时候要截图看，而不是继续调字号**。

### 10. 首页三件事：canvas 盖住蜂窝 / 顶栏换成图标 / 小程序图标

**① 画布把 26 个页面的内容盖住了（首页蜂窝集体消失）**

上一版让画布**自己铺底色**（`ctx.fillRect('#f0f2f5')`）来绕开「页面根元素不透明会挡住负 z-index 画布」。
在 H5 里没问题，但小程序 **canvas 是原生组件**：一旦没走同层渲染（基础库/开发者工具版本差异），
它会盖在**所有** WebView 内容之上，而且 `z-index` 完全无效 ✗ —— 于是整页内容被那块不透明画布挡死 ✗✗。

**修法（两层保险）**：
- 画布改回**透明**：`ctx.clearRect()`（与 web 一致，不铺底色）；
- 底色交回页面根元素：`App.vue` 的 `page { background: #f0f2f5 }`（＋ `pages.json` 的
  `window.backgroundColor` 兜窗口层），26 个页面的 `.screen` / `.page` 仍然保持 `transparent`（画布才能透出来）。

这样两种层级都安全：同层渲染生效时画布在负 z-index（内容之下）✓；降级到原生层时画布在最上面，
但它**全透明**，内容照样可见 ✓（只有粒子/轨道会浮在内容表面，这是可接受的降级）。

> **教训（第 33 条）**：给小程序 canvas 做全站背景时，**画布一定不要铺底色**。
> 「透明画布 + 页面根底色」是唯一在两种层级下都安全的结构；
> 一旦画布自己填色，只要层级降级就会把整页内容盖掉。

**② 首页顶栏：不要「游戏合集」文案，改成 web 的同款图标**

web 的 `TopHeader.vue` 首页分支是：标题位置放 `<img class="logo" src="scripts/make-icon.svg">`（**28×28px**），
不显示文字。小程序原生导航栏放不下图片 ✗ → 首页改成 **自定义导航栏**：
- `pages.json` 首页 `style: { navigationStyle: "custom", navigationBarTitleText: "" }`
  （uni 会把这两项写进产物 `pages/index/index.json` ✓）；
- 页面里加顶栏：`.home-header { height: 88rpx; margin-top: env(safe-area-inset-top); 居中 }`
  + `<image class="home-logo" src="/static/icon-512.png" mode="aspectFit" />`，`56rpx`（= web 的 28px）圆角 14rpx。

只给**首页**用 custom，其它 25 页仍是原生导航栏（自定义栏曾经因为盖住胶囊导致不可操作，这次顶栏里
只有一张居中的图标、不占胶囊位置，所以安全）。

**③ 小程序图标：直接用 web 的图标源**

`scripts/make-icon.svg`（绿渐变 + 白色手柄）是 web 的 favicon / PWA 图标源。用 headless Chrome 把它渲染成
**满幅 512×512 PNG**（去掉 SVG 里的 `rx="112"` 圆角，微信会自己裁圆角），存成
`mp/src/static/icon-512.png` ✓，同一张图也当首页顶栏的 logo 用（视觉完全一致 ✓）。
**上传**：小程序头像要在微信公众平台手动上传这个文件（代码里改不了）。

### 11. 首页去掉底部过山车

`ParticleBackground` 加了 `coaster` prop（**默认 `true`**），首页显式关掉：

```html
<ParticleBackground :coaster="false" />     <!-- 首页：只画粒子连线 -->
<ParticleBackground />                       <!-- 其它 25 页：仍与 web 一致（含过山车） -->
```
```js
const props = defineProps({ coaster: { type: Boolean, default: true } });
// draw(): if (props.coaster) drawCoaster(line, dt);
```
**实测**（H5，393×852）：首页底部区域已经没有轨道/车厢（截图确认，只剩粒子和右下角设置按钮）✓；
数独页画布仍照常绘制 ✓；0 异常 ✓。

> 之所以用 prop 而不是直接删：过山车是 web 的全站背景元素，游戏页底部被卡片压着不显眼；
> 首页底部是空白，那条轨道太抢眼。若以后要全站去掉，把 `drawCoaster` 的调用删掉即可。

### 12. 首页入场跳动只播一次 + 过山车全站去掉

**① 从游戏返回首页不再重播**

原本 web 的语义是「回首页重播入场」，小程序这边用 `onShow` + `playSeq` 拼进 `:key` 重建节点来复刻 ——
但用户要求**只有首次进入才跳**。把 `onShow` / `playSeq` 删掉后仍然会重播 ✗：
**页面被切走再回来时，浏览器会把 CSS 动画从头重放**（元素变成 `display:none` 再显示，动画时钟归零），
实测返回到 60ms 时那条最长延迟的格子 `opacity` 还是 **0** ✗。

**正解：播完一次就把动画永久关掉**（不是靠 `:key` 拦）：
```js
const introDone = ref(false);
onMounted(() => { introTimer = setTimeout(() => { introDone.value = true; }, 1600); });  // 749ms 延迟 + 679ms 时长
// 模板：:class="['acc-' + g.accent, { 'no-intro': introDone }]"
// CSS ：.hex.no-intro { animation: none; }
```
**实测**（H5）：首屏动画照常播（首屏结束后 opacity 1）✓；进游戏再返回 → **返回后 60ms opacity 就是 1** ✓
（改之前是 0）、960ms 仍 1 ✓，DOM 节点复用、没有重建 ✓。

> **教训（第 34 条）**：想让 CSS 动画「只播一次」，**光删重播的触发逻辑不够** ——
> 页面被隐藏/显示时动画会自己重播。必须**在播完后把 `animation` 置 `none`**（加个 `no-intro` 类），
> 否则用户从子页面回来就会再看到一次。

**② 过山车：所有页面都去掉**

`ParticleBackground` 的 `coaster` prop 默认值改成 **`false`**，首页那条 `:coaster="false"` 也删掉了
（现在不传就是关）。代码（`buildCoaster` / `posAt` / `drawCoaster` 一整套，约 120 行）保留，
要恢复只要把 `default` 改回 `true`，或某页写 `<ParticleBackground coaster />`。

### 13. 德州扑克：翻面改成 web 的「单节点 rotate」+ 猜大小小牌终于不裁了

**① 翻面：web 不是两面常驻的 3D**

web 的 `CardItem.vue` 用的是 `<Transition name="rotate">` —— **一个节点**换内容：
- 旧内容 `.125s linear` 转到 `rotateY(90deg)`（侧立、看不见）；
- 换内容；
- 新内容从 `rotateY(-90deg)` `.125s linear` 转回 `0`。

小程序没有 `<Transition>`，用「单节点 + 三段 class + 定时器」复刻：
```css
.card { transform: rotateY(0deg); transition: transform .125s linear; }
.card-wrapper.quick .card { transition-duration: .09s; }   /* 换牌时整体盖背面用更快一档 */
.card.out  { transform: rotateY(90deg); }
.card.snap { transition: none; transform: rotateY(-90deg); }  /* 换内容那一瞬 */
.card.in   { transform: rotateY(0deg); }
```
```js
function playFlip(front) {
  if (props.mini) { showFront.value = true; return; }
  rot.value = 'out';
  t1 = setTimeout(() => { showFront.value = front; rot.value = 'snap';
    t2 = setTimeout(() => { rot.value = 'in'; }, 34); }, props.quick ? 90 : 125);
}
watch(isBack, back => playFlip(!back));                       // 两个方向都要
watch(() => props.animate, v => { if (v) playFlip(!isBack.value); });  // 同点数复用节点也重播
```
**实测**（H5，25ms 采样）：`card out → card snap → card in` 三段齐全，`cos` 角度
**1 → 0.4 → 0 → 0.55 → 0.99 → 1** ✓ 即 0° → 90° →（换面）→ −90° → 0° ✓ 与 web 时序一致。

**② 猜大小的牌「展示不全」的真正原因（第三次才找准）**

前两次都在调字号 / 缩放，都是错的方向。真正原因是**布局盒高度超了容器**：
`.guess-area` 固定 `height: 200rpx`，扣掉 `.guess-line` 的上下内边距（19 + 52）只剩 **129rpx**；
而我把小牌做成「大尺寸(156rpx) + `transform: scale()`」—— **transform 不改变布局盒** ✗ →
牌框仍是 156rpx，比可用高度高 27rpx，`scroll-view` 直接**裁掉底部**（正好是 `rotate(180deg)` 的那个点数）✗。

**正解：小牌就用小尺寸**（web 也是这么做的：`--width 40px / --text-size 12px / --pos 1px`）：
```css
.card-wrapper-mini { width: 76rpx; height: 114rpx; margin: 6rpx;
  --pos: 2rpx; --text-size: 23rpx; --icon-size: 38rpx; --back-size: 50rpx; --radius: 6rpx; }
```
**实测**：牌框 **40×60px**、区域高 **105px**、`牌在区域内: true`、
两个点数（`10` / `Q`）字号 12.05px、尺寸 14×12 与 9×12、`在牌内: true`、`在区域内: true`，
花色在牌内 ✓；截图四个角的点数齐全 ✓。

> **教训（第 35 条）**：`transform: scale()` **不改变布局盒**。
> 想「缩小的元素」放进定高容器，必须用**小尺寸 + 小号变量**（web 的做法），
> 或者给容器 `overflow: visible`。只加 scale 会被裁 —— 而且表现为「文字被切掉一半」，
> 很容易误判成字号/行高问题。**先量容器可用高度和元素布局盒高度，再看字号。**

### 14. 2048 重新移植（严格照 web）+ 扑克翻面/小牌（同批）

**2048：真凶是「等一帧」的余量只有 3.3ms**

旧版用 `nextTick + setTimeout(20)` 等幽灵上屏。`nextTick` 只保证**数据提交**、不保证**视图层画完**；
20ms 相对一帧（16.7ms）只有 **3.3ms** 余量 —— 视图层稍慢，两次 setData 落进同一次 flush，
幽灵就**没有过渡起点**（直接出现在目标格，原格两张「当场消失」），而合并牌此刻还是 `merging: opacity 0`
→ 目标格要等 MOVE_MS 才 pop = 「卡片消失再出现」，且因为只差 3ms 所以**偶发** ✗。

**修法（照 web 的 `void offsetWidth` 强制重排的等价物）**：
1. `await nextTick()`；
2. **再等两帧**（有 rAF 用 rAF+3 帧兜底，小程序 `setTimeout(16)`×2）；
3. 才把 ghost 挪到目标格 —— 起跳那一刻**一定已经画过原位**；
4. **落定计时锚在「幽灵开始滑」那一刻**（web 从 `move()` 算，因为它强制重排是同 tick，等价）；
5. `撤幽灵 / 摘 merging / 加 popping` 必须是**同一个同步块**（= web `moveTimer` 那三行），
   状态机里不存在 `merging && ghosts空 && !popping`。

其余逐项照 web：`MOVE_MS 130 / POP_MS 190 / DEAL_STEP 45 / DEAL_STEP_FEW 140 / DEAL_MS 280 / DEAL_TAIL 120`、
`.is-new{animation:.18s ease-out .13s backwards deal-in}`、`.dealt{...}`、`merge-pop` 关键帧
（0% `scale(.5) opacity 0` → 60% `scale(1.16)` → 100%），并补上了 web 的 `playDeal()`（开局/恢复逐张入场）。

**仿真**：7 场景 × 16ms × 400ms + 1ms 细化 = **0 空帧**（每个合并的每个采样点目标格都至少 1 张可见牌）；
`@vue/compiler-sfc` 0 error；H5 打开后 0 异常。
> 代价：合并落定比 web 晚 **32ms**（买「两帧可靠起点」）；若真机仍偶发，把 `GHOST_FRAMES` 3 即可。

**扑克翻面 & 猜大小小牌**：见第 13 节（单节点 rotate；小牌用小尺寸而不是 scale）。

### 15. 2048「数字有时候会消失」+ 猜大小失败后最后一张牌没有牌背

**① 2048：残留的 `merging` 会把数字永久藏起来**

`merging: true` 代表「合并牌滑行期间`opacity: 0`」，本来由 `settle()` 在 130ms 后摘掉。
但**快速连滑**时：新一步开始会 `clearTimers()` 把上一手的 `moveTimer` 掐掉 ✗ → 那张牌的
`merging` 永远是 `true` ✗ → **数字永久消失**（牌格子还在、就是没数字）✓ 这正是「有时候会消失」。

**修法（两道保险）**：
1. 新一步提交状态时，**只保留本手新合并的那几张**，其余一律摘掉：
   ```js
   tiles.value = next.map(x => (mergedIds.includes(x.id) ? x : (x.merging ? { ...x, merging: false } : x)));
   ```
2. `settle()` 里**无条件**摘 `merging`（不再只在 `mergedIds.length` 时），兜住历史残留。

**实测（H5 压力测试）**：连按 20 次快速滑动（120ms 间隔，故意打断动画），全程 16ms 采样 196 帧，
结束时 **10 张牌 / 不可见 0 / 残留 merging 0 / 空数字 0**，收尾后没有任何一帧还有不可见的牌 ✓。
（动画过程中最多同时 2 张「不可见」= `merge-pop` 的 0% 关键帧那 1 帧，web 同款。）

**② 扑克：猜大小的最后一张牌没有牌背图案**

我在 mini 分支里把 `showFront` 写成了**恒 true** ✗ —— mini 牌不翻面，但**必须按 `isBack` 决定画正面还是牌背**；
猜大小失败后最后那张是「牌背」（`num = 0`），被画成了**空正面** → 没有点阵、没有扑克图标 ✗。
修法：
```js
if (props.mini) { showFront.value = !isBack.value; rot.value = ''; return; }
```
**实测**（H5，猜大小失败后）：`.guess-current` 牌 **40×60px**、牌背层在 ✓、
点阵 `radial-gradient(circle, rgba(154,154,154,0.55) …)` ✓、扑克图标 **31×31** 且 mask 用 data URI ✓、
数字个数 **0**（正确，牌背不该有点数）✓；截图确认牌背有圆点底纹 + 扑克图标 ✓。

### 16. 2048 那张「有格子没数字」的牌——不能再靠常驻 `opacity: 0` 隐身

用户截图里有一个格子**有底色、没有数字**（连牌底色也没有）。这类「永久隐身」只有一个来源：
`.tile.merging { opacity: 0 }` 是**常驻样式** —— 只要 `merging` 标记因为任何原因没被摘掉
（定时器被掐、快速连滑、恢复存档、未来某条新路径忘了清），那张牌就**永远看不见** ✗。

上一轮我加了两处「清标记」（新一步归一化 + settle 无条件清 + 700ms 看门狗），但那是**在跟所有可能漏掉的路径赛跑** ✗
—— 只要还有一条路径没想到，症状就会复现（用户这次又碰到了）。

**根治：把「隐身」从常驻样式改成一次性动画**：
```css
.tile.merging { animation: merge-slot 0.13s linear both; }   /* 0.13s = MOVE_MS */
@keyframes merge-slot { 0%, 99.9% { opacity: 0; } 100% { opacity: 1; } }
```
动画只跑一次；**结束后元素回到自身 `opacity`（1）**，即使 `merging` 标记一直挂着也一定看得见 ✓。
视觉与 web 的「滑行期间隐身」完全等价（130ms 内不可见、落定即出现）。

**实测（H5）**：手动给一张牌打上 `merging` 并**故意不摘**，读 `opacity`：
`1 → 0@40ms → 0@100ms → 1@220ms → 1@1200ms` ✓，且 `stillHasClass: true`（标记一直在）✓
—— 也就是「标记残留」再也不可能造成永久隐身 ✓。
压力测试（连按 20 次快速滑动、16ms 采样 202 帧）：结束时 9 张牌 / 不可见 0 / 残留 merging 0 ✓。

> **教训（第 36 条）**：用 `opacity/visibility/display` 做「临时隐藏」时，**不要写成常驻样式 + 数据标记**，
> 要用**一次性动画**（`animation: hide-then-show`）。常驻样式的正确性完全依赖「标记一定被清掉」这个前提，
> 而任何一次时序竞争都会让它变成永久 bug —— 这次就是先修了 3 处清标记仍然复现，最后靠改 CSS 解决。

### 17. 2048 彻底改成 threes 的两阶段模型（不再有「隐身」这回事）

用户原话：「你就不能参考 threes 的实现吗，除了滑动到底的差异，threes 的实现效果就非常好。」
于是把 2048 的滑动/合并整体换成 **threes 的模型**，把 web 那套 `ghost + merging + popping` 全删掉：

**threes 的模型（现在 2048 也用这套）**：
1. **第一阶段（同步）**：所有牌按目标格换 `row/col`（**id 不变** → 复用节点 → `transition: left/top`
   一定有起点）✓ 该被合并的两张也滑到**同一个目标格**叠在一起 ✓（threes 就是这样）
2. **第二阶段（`MOVE_MS = 130ms` 后一次 setData）**：被吃掉的两张从数组里删掉 → 生成**一张新 id** 的合并牌
   （`.merged` → `merge-pop` 弹一下）→ `spawnTile()` 补一张（`.fresh` → `deal-in`）✓

**关键收益**：**整份代码里不再有任何「隐身」**——
没有 `ghost` 数组、没有 `merging` 标记、没有 `opacity: 0` 的常驻样式、没有 `popping` 集合、
没有幽灵 FLIP、没有「等两帧」。静态检查确认 `.tile` 上**只有** `.merged / .fresh / .dealt` 三个动画类，
**没有任何 opacity / visibility / display 隐藏规则** ✓
→ 「标记残留 → 牌永久看不见」这一整类 bug 从结构上消失了（前 4 轮就是在这个类里打转）。

**实测（H5，CDP 真实触摸事件）**：
- 单次左滑（两张 2 合并）：盘面 2 → 4 + 新牌 ✓，全程 **0 张不可见** ✓；
- 压力测试 22 次快速滑动（90ms 间隔，故意打断落定）：16ms 采样 **327 帧**，
  `maxBad = 0`、收尾后坏帧 0、无空数字 ✓。

**顺带修的两个隐患**：
- 第二阶段回调里先 `busy = false`（被打断时不会再卡住输入）；
- `busy` 看门狗 **`MOVE_MS + 120ms`**（不能更长：玩家 ~200ms 就滑下一次，太长会「点了没反应」）；
- 第一阶段就 `save()`（中途刷新看到的盘面 = 已滑到位的状态，不会和屏幕不一致）。

> **教训（第 37 条）**：同一类视觉 bug 修到第 4 次还复现时，**不要再打补丁，换实现模型**。
> 2048 前 4 轮都在 web 的「幽灵 + 隐身标记 + 强制重排」模型里修时序；换成 threes 的
> 「两阶段：先换格、再换数据」之后，隐身这个概念根本不存在了，bug 也就无处可生。
> 工程里已有可复用的正确实现时，**优先对齐它**而不是继续理解旧实现。

### 18. `ReferenceError: busy is not defined`（重写 move() 时把声明连带删了）

换成 threes 模型重写 `move()` 时，我用正则删掉 `flipGhosts / settle / waitFrame` 三个旧函数，
**`let busy = false;` 正好夹在被删的区间里被一起删掉了** ✗ → 真机一滑就
`ReferenceError: busy is not defined`（用户截图）。

**修法**：把 `let busy = false;` 补回 `let dealing = false;` 下面 ✓。
**验证**：H5 打开 → 0 异常；6 次滑动 → 6 张牌、出现合并出来的 4、`invisible 0 / empty 0` ✓；
20 次快速滑动（110ms 间隔）→ 10 张牌（含 4/8）、`invisible 0 / empty 0`、0 异常 ✓。

> **教训（第 38 条，和 §零 第 29 条同一类但更狠）**：**用正则删函数时，必须检查删除区间里有没有「夹在中间的变量声明」**。
> 这次 `waitFrame → flipGhosts → settle` 三个函数是连着的，中间的 `let busy` 被当成函数体一起删了，
> 而 `compileScript` **不会**报「未定义变量」（模板/脚本的静态检查查不出运行时 ReferenceError）✗。
> 删完一定要跑一次「**列出所有 `let/const` 声明并与引用对照**」的检查（这次就是这么定位的），
> 或者干脆**按行号精确删除**并立刻在 H5 里把核心操作点一遍。

### 19. 点击游戏 → 「关灯游戏」：数字换成灯（玩法不变）

用户要求把点击游戏改成关灯游戏，规则不变，只把 0/1/2 画成三档亮度的灯，并且亮度变化要渐变。

**只改呈现**：数值仍是 0/1/2、点击自身与四邻 `+1 mod 3`，难度 / 存档 key / 上帝模式一行没动。

| 值 | 灯珠 | 灯座 | 灯圈 |
| --- | --- | --- | --- |
| 0 | `#39414f` 暗灰 + 内阴影 | `#1c232d` 最暗 | 透明 |
| 1（全亮） | `#fff6cf` 近白 + `0 0 23rpx 8rpx rgba(255,205,90,.85)` | `#3a3119` 暖色溢光 | `rgba(255,214,102,.95)` |
| 2（半亮） | `#d99433` 琥珀 + `0 0 13rpx 4rpx rgba(217,148,51,.34)` | `#232019` | `rgba(255,214,102,.4)` |

- `.inner`（灯座）/ `.bulb`（灯珠，`left/top 22%` + `56%` 见方）都带
  `transition: background-color .32s, border-color .32s, box-shadow .32s` → 换档时渐变 ✓
  （小程序没有 `inset` 简写，灯珠用 `left/top/width/height` 百分比，别写 `inset`）。
- 图例：**一行** `灭 → 全亮 → 半亮 ↺` 三个迷你灯（`.lamp`，23rpx）+ 短提示「四邻一起变」内联在后面，
  和 web 完全同一行排版（先前是「灯一行 + 提示一行」，在小屏上多占 ~20px）。
- 上帝模式「正在点这一格」原来 `opacity: .1`（灯会看不见）→ 改成 `inset 0 0 0 6rpx #12833f` 主色环。
- 名字：`pages.json` 标题 / 首页 `game.click`（cn 关灯游戏、en Lights Out）/ 本地 `i18n.js` 的 `gameTitle`
  一起改；首页图标 `i-carbon-touch-1` → **`i-carbon-idea`**，并加进 `uno.config.js` 的 safelist。
- ⚠️ **mp 的局部 i18n 缩进是 4 空格**（不是 web 的 6）。我第一次照着 web 的缩进做 replace，
  静默失败 → 页面上直接露出 `lampOff` / `lampTip` 原始 key ✗。**改 mp 字典必须带 assert**
  （这次第二次就加了 `assert old in s`）。

**实测（mp 的 H5 构建，390×844）**：36 格、`.bulb` 24×24 / 格子 44×44、
图例文字 `灭 → 全亮 → 半亮 ↺`（一行）+「四邻一起变」✓、提示文案正常（不再是 key）✓、
`scrollHeight - innerHeight = 44`（= H5 壳的顶部导航条，改造前也是这个数，**不是图例撑出来的**）✓、
产物 `pages/click/click.wxss` 里有 `.inner.zero{…}` 与 `.inner.zero .bulb{…}` ✓、`click.js` 里 `lampOff/lampTip` 各 1 处 ✓。

### 20. 连击 / 多消的「小型烟花」：一个共享粒子层，7 处触发点

用户要求：「在小程序里复刻 web 里多消、连击时的小型烟花效果，参考 web 侧的为所有符合要求的触发点加上。」

**web 的实现**（`src/shared/confetti.js` 的 `burstConfetti`，底层是 canvas-confetti）：

```js
burstConfetti(intensity = 1, { origin, count } = {})
  → playFirework()                                            // firework-success.mp3
  → count ?? min(110, round(22 + 26 * intensity))
  → spread 76°（向上 ±38°）、startVelocity 34、gravity 0.9、scalar 0.9、ticks 140（≈2.3s）
  → 5 色固定： #5D8C7B #F2D091 #F2A679 #D9695F #8C4646
  → origin 默认 { x: 0.5, y: 0.64 }（视口比例）
```
另外 `playElimination()` 有一条**替换**规则：`playFirework()` 之后 240ms 内不再响 elimination
（「连击 = 烟花音」「单次消除 = elimination」，两者不同时响）。

**小程序没有 canvas-confetti**（原生 canvas 会挡点击、层级也压不住），所以改成
「**固定定位的粒子层 + CSS 三段关键帧**」，参数全部照 web 算：

| 文件 | 作用 |
| --- | --- |
| `src/core/firework.js` | `burstConfetti(intensity, { count })`：**喷发点统一在「游戏区顶部中间」**（量 `.game-area`，取 `x = 中心`、`y = 顶部 + 24px`），粒子数 `min(28, round(10 + 12×intensity))`；`countForIntensity()` / `fallbackOrigin()` / `makeBurstParticles(count)` / `registerFireworkSink()` |
| `src/components/FireworkBurst.vue` | 页面里挂一次就接活（`onMounted` 注册、`onUnmounted` 注销；多页面栈里**最后挂载的**那个生效）。**`position: absolute; inset: 0; z-index: 45; pointer-events: none`**（不是 fixed，原因见下），粒子 `animation: firework-fly` 三段：0→55% 减速上升（`--dx/--dy`）、55→100% 重力下落（`--drop`）并淡出，跑完自动从数组里摘掉（最多同时 6 束） |
| `src/core/sfx.js` | 新增 `playFirework()`；`playElimination()` 加 240ms 抑制（同 web 的 `ELIM_REPLACE_MS`） |

粒子参数：射程 150~330rpx、寿命 1.7~2.3s、5 色轮转、`delay` 0~60ms 错峰。

**粒子不是圆点**（用户要求「不要全部都用圆形，改成不规则的块」；canvas-confetti 的粒子本来也是矩形纸片）：
每片从 4 种形状里轮转 —— `square`（方块）/ `wide`（宽条 1.7×0.85）/ `tall`（竖条 0.8×1.6）/
`ribbon`（细丝 0.55×2.2），基准边长 11~19rpx，各自带**初始角度 `--rot`** 与**整段自转 `--spin`**
（±430~1290°，1.2~3.6 圈，随机方向），关键帧里 `rotate(calc(var(--rot) + var(--spin) * 0.55))` →
落定时转满。圆角按形状给 2 / 4 / 2 / 6rpx（不是 50%）。

实测 `makeBurstParticles(24)`：形状 6/6/6/6、尺寸如 `18×18 / 20×10 / 13×27 / 9×35`（rpx）、
自转 −1221~1137°、初始角度 1~352° ✓；H5 里读 `getComputedStyle` 得到
`border-radius: 1.04 / 2.08 / 1.04 / 3.12px`、尺寸 `7.8×7.8 / 16.1×8.3 / 5.7×11.4 / 3.1×13px`、
`transform: matrix(旋转+位移)` ✓ —— 截图里就是一撮翻着飞的碎纸片，不再是圆点。

**7 处触发点（与 web 一一对应，参数一字不差）**：

| 页面 | web 位置 | 小程序 |
| --- | --- | --- |
| 连连看 `link` | `showCombo` | `burstConfetti(min(3, 1+(n-2)*0.6), { count: min(24, 8+n*3) })` |
| Emoji 滑行 `slide` | `showCombo` | 同上 |
| 对对碰 `match` | `showCombo` | 同上（**顺手补了 web 有、mp 缺的「N 连击」提示条**：`.game-area` 里、`.board` 的兄弟节点，`top: -30rpx`，36rpx ≈ 18px 胶囊） |
| Emoji 消消乐 `crush` | `announceCelebration` 尾部 | `burstConfetti(tier + (chain > 3 ? 1 : 0))`（门槛是 web 原有的「大消 / 连锁」判定，**没有**另加 300 分门槛 —— web 的 crush 也没有） |
| 麻将英雄 `mahjong` | `announceCelebration` 尾部 | `burstConfetti(groups > 1 ? 1 : (special ? 0.7 : tier))`，`special = groups > 1 \|\| chain > 1` |
| 扑克炼金术 `alchemy` | `announceCelebration` 尾部 | `burstConfetti(tier)`（`gained >= FX_MIN` 门禁沿用原来的） |
| 麻将传奇 `legend` | `cascade` 的多消/连击分支 | `burstConfetti(groups.length > 1 ? 1 : 0.7)` |

> 连连看 / 滑行 / 对对碰原本各自在页面里写了一份局部粒子（`.combo-burst` / `.burst-dot` / `makeBurst()`），
> 这次**全部删掉、统一走共享实现**（两份实现 = 两份参数，早晚会不一致）。

### 20b. 2026-10 追加：**粒子更少 + 喷发点统一到「游戏区顶部中间」**

用户：「多消和连击的烟花效果，烟花数量再少一点，并且喷出位置都统一出现在游戏区的顶部中间。」

- **粒子数**：`count = min(28, round(10 + 12×intensity))`（web 是 `22 + 26×intensity`、上限 110）；
  连击那三处再压一档 `min(24, 8 + n×3)`。实测：强度 `0.7 / 1 / 1.5+` → `18 / 22 / 28`；
  连击 `n=2..6` → `14 / 17 / 20 / 23 / 24`。
- **喷发点**：不再跟着「连击提示条 / 棋盘中心」，统一量 `.game-area`，取 `x = 中心`、`y = 顶部 + 24px`。
  原来的 `burstAtElement(selector, …)` **整个删掉**了（7 处调用全改成 `burstConfetti`）。
- **坐标空间必须对齐**（这轮踩的坑）：`uni.createSelectorQuery()` 的 `boundingClientRect` 给的是
  **页面内容空间**（H5 里比视口少一个 44px 导航栏），而粒子层原来是 `position: fixed`（视口空间）+
  百分比定位 → 实测喷发点偏 **29px**（页面滚过之后更歪）。现在：
  - 粒子层 `position: absolute; inset: 0`（内容空间，页面滚动时跟着游戏区一起走）；
  - 容器坐标直接用**测出来的 px**（`left: ${x}px; top: ${y}px`），不再换算成百分比。
  实测：`.game-area` top=298 → 喷发容器实际落在 **(195, 322)** = 中心 x 195、顶部 +24 ✓ 分毫不差。

**实测（mp 的 H5 构建，390×844，对对碰连按 2 对）**：
- 第 1 对**不炸**（combo=1，与 web 一致）；第 2 对弹出「2 连击」+ `.firework-dot` × **14** ✓
- 粒子样式：`background: rgb(93,140,123)`（web 第一色）、`width: 6~10px ≈ 12~20rpx`、
  `animation: firework-fly … 1.9s`、`transform: matrix(…, -38…)`（向上飞）✓
- 喷发容器 `left: 195px; top: 277.7px`（层原点 44px）→ 视口 (195, 322) = 游戏区顶 298 + 24 ✓
- 截图：一小撮 14 片碎纸从**棋盘正中偏上**喷出，正好在「2 连击」提示条上方 ✓

**实测（旧的默认参数，留作对照）**：
- 对对碰连按 3 对：第 1、2 对**不炸**（combo=1，与 web 一致），第 3 对弹出「2 连击」+
  `.firework-layer` × 1、`.firework-dot` × 20 ✓；粒子样式 `background: rgb(93,140,123)`（= web 第一色 `#5D8C7B`）、
  `width: 7.27px ≈ 14rpx`、`animation: firework-fly … 1.88s`、`transform: matrix(…, -87.5)`（向上飞）✓
- 7 个页面逐个进：`.board` 都在、**0 异常**；`FireworkBurst` 只在真的触发时才渲染（`hasFw: false` 是正常的）
- 产物：`components/FireworkBurst.wxss` 有 `.firework-layer / .firework-dot / @keyframes firework-fly`；
  7 个页面的 `.wxml` 里各有一处 `firework-burst` 节点；`core/sfx.js` 里能找到 `firework-success`；
  `static/audio/firework-success.mp3` 在包里 ✓

**踩点提醒**：
- 粒子层是 `position: absolute; inset: 0` 且 `pointer-events: none` —— 千万别给它背景色，否则会盖住棋盘的点击。
- 喷发点量的是 `.game-area`（不是提示条），**不要再换算成百分比**：坐标必须和 `boundingClientRect` 同一个空间（页面内容空间）。
- 连击只在 `combo >= 2` 时才炸（web 同款），单次消除不炸 —— 否则「每消一次都放烟花」就不叫连击了。

### 21. 猎手 / 侦探：观察阶段红色倒计时，操作从 0 开始（照对对碰）

用户要求与 web 一致：观察阶段显示**红色倒计时**，玩家开始操作后计时器**从 0 重新开始**。

web 侧改法（两页一样，见各游戏分册）：操作区中间那格从 `<CountTimer :enable="timerRunning" />`
换成 `.time-note`（`👀 mm:ss` / `⏳ mm:ss`）+ 一个隐藏的 `<CountTimer :enable="phase === ANSWER" :show="false" :on-tick>`；
`MEMORY` 开始只 `stop()` 并启动观察倒计时，`ANSWER` 开始时 `reset()` 从 0 起。

小程序侧（`pages/hunter/hunter.vue`、`pages/detective/detective.vue`，两页同一套）：

- 本页原本自己实现计时（`seconds` / `elapsed` + `startTick/stopTick/resetTick`），**没有** CountTimer 组件，
  所以直接在这些函数上加一层：
  ```js
  const memoryLeft = ref(0);           // 观察倒计时剩余秒数
  const observing = computed(() => phase.value === MEMORY || phase.value === FLIP);
  const noteText = computed(() => fmtSec(Math.max(0, observing.value ? memoryLeft.value : seconds.value)));
  function startMemoryCountdown(ms) { stopMemoryCountdown(); memoryLeft.value = Math.ceil(ms / 1000);
    memoryTicker = setInterval(() => { memoryLeft.value = Math.max(0, memoryLeft.value - 1); }, 1000); }
  ```
- `startLevel()` 进入 `MEMORY`：`stopTick(); seconds.value = 0; startMemoryCountdown(memories.length)` ——
  **不要**再 `resetTick()`（那是「观察就开始计时」的老行为）。
- `FLIP → ANSWER`：`stopMemoryCountdown(); memoryLeft.value = 0; seconds.value = 0; startTick();` —— 从 0 开始。
- 模板：`.timer`（图标 + MM:SS）→
  ```html
  <view class="time-note" :class="{ observe: observing }">
    <text class="time-note-txt">{{ observing ? '👀' : '⏳' }} {{ noteText }}</text>
  </view>
  ```
  样式：`.time-note-txt { font-size: 27rpx; font-weight: 600; font-variant-numeric: tabular-nums; color: #2c3e50 }`，
  `.time-note.observe .time-note-txt { color: #b8433d }`（web 的 `--del-color`，浅色主题 `#b8433d`）。
- 清理：`onHide` / `onUnmounted` 都要 `stopMemoryCountdown()`（否则观察倒计时的 interval 会在后台一直跑）。

**实测（mp 的 H5 构建，390×844）**：
猎手 `👀 00:03`（`rgb(184,67,61)` 红）→ 1.2s 后 `👀 00:02` → 4.2s 后 `⏳ 00:01`（`rgb(44,62,80)` 正常色）；
侦探 `👀 00:02` → `👀 00:00` → `⏳ 00:02` ✓ 0 异常。
产物：两页 `wxml` 各有 1 处 `time-note`、`wxss` 里有 `#b8433d`、`js` 里有 `👀` 字面量（表情在 data 里，不在 wxml 里）✓

> ⚠️ 这轮踩了两个纯编辑事故，都值得记：
> 1. **多行替换前先 `repr()` 确认缩进**：mp 的 `<script setup>` 顶层声明是**0 缩进**、模板是 8/10 缩进，
>    我照 web（2/10/12）写替换串 → 三次 `assert` 失败；`grep`/`sed` 输出带的 2 空格前缀会骗人。
> 2. **在嵌套 SCSS 里插规则要看它落在哪一层**：插到 `.difficulty-wrapper` 里面，编译成
>    `.wrapper .opt-area .difficulty-wrapper .time-note.observe` ✗ 红色整段不生效（web 那次）；
>    删块时还容易连带吃掉 `.difficulty-wrapper` 的收尾 `}` → `unmatched "}"`。

### 22. 连连看 / 对对碰：「新游戏」二次确认统一成三按钮自绘弹窗

用户报：「连连看的新游戏二次确认弹窗不对…应该包含取消、重玩本关、确定重开 3 个选项」「对对碰的新游戏按钮缺少二次确认」。

**问题**
- **连连看**：用的是 `uni.showModal` —— 系统弹窗**只有两个按钮**（确定 / 取消），
  「重玩本关」那个选项根本放不下 ✗（web 的 `shared/ConfirmDialog` 是自绘三按钮）。
- **对对碰**：`新游戏` 直接 `initLevel(1)`，**连二次确认都没有** ✗（web 有 `ConfirmDialog`）。

**修法**：两页都改成自绘三按钮弹窗，样式与其它 9 个页面**完全同一套**（照 `pages/mahjong/mahjong.vue` 抄）：

```html
<view v-if="confirming" class="confirm-mask" @click="confirming = false">
  <view class="card confirm-box" @click.stop>
    <text class="confirm-title">{{ …confirmTitle }}</text>
    <text class="confirm-msg">{{ …confirmMsg }}</text>
    <view class="confirm-actions">
      <button class="confirm-cancel" @click="confirming = false">取消</button>
      <button class="confirm-replay" @click="replayLevel">重玩本关</button>
      <button class="confirm-ok" @click="startNewGame">确定重来</button>
    </view>
  </view>
</view>
```
CSS 也是照抄：`.confirm-mask`（fixed / `z-index: 120` / 半透明黑）、`.confirm-box`（`width: calc(100% - 122rpx)`、
`max-width: 610rpx`、27rpx 圆角）、`.confirm-cancel` 灰底、`.confirm-replay` 橙描边、`.confirm-ok` 主色绿。

- **连连看**：删掉 `onNewGame()`（整个 `uni.showModal` 包装），按钮改 `@click="confirming = true"`；
  `replayLevel()` / `startNewGame()` 进来先 `confirming.value = false`。
  文案加在**本页** `i18n.js`（`confirmTitle` / `confirmMsg` / `confirmOk` / `confirmReplay` / `cancel`，cn + en），
  沿用 web `ConfirmDialog` 的原文（旧 `newGameTitle/newGameMsg/...` 5 个 key 已被替换掉）。
- **对对碰**：这页没有本地 `i18n.js`（一直用 `core/i18n.js` 的 `t()`），所以这 5 个 key 加进 **core 字典**（cn + en）；
  新增 `startNewGame()`（清**当前牌面**的最高关记录 + 回第 1 关，另两种牌面不动）、`replayLevel()` 顺手关弹窗，
  并把原来直接 `initLevel(1)` 的 `startNewRun()` 删掉（结算层那颗「新游戏」也改走 `confirming = true`，
  否则会引用已删除的函数 → `ReferenceError`）。

**验收（mp 的 H5 构建，390×844）**
- 连连看：点「新游戏」→ 弹窗标题 `🔄 开始新游戏？`、按钮依次 `取消 / 重玩本关 / 确定重来` ✓；
  点「重玩本关」→ 弹窗关闭、本关重开（计时 01:10 → 01:12）✓
- 对对碰：点「新游戏」→ 同样的三按钮弹窗 ✓；点「重玩本关」→ 弹窗关闭 ✓
- 0 异常；产物 `pages/link/link.wxml`、`pages/match/match.wxml` 各有 `confirm-box` × 1 与
  `confirm-cancel / confirm-replay / confirm-ok` 三个类名 ✓；`core/i18n.js` 里能找到「开始新游戏」✓

> **教训（第 39 条）**：**`uni.showModal` 只能二选一**。凡是 web 用 `shared/ConfirmDialog`（取消 / 重玩本关 /
> 确定重来）的地方，小程序都**不能**用系统弹窗凑合 —— 少一个「重玩本关」玩家就必须「确定重来 → 掉回第 1 关」，
> 属于功能缺失。以后新增页面时，只要 web 那边 import 了 `ConfirmDialog`，这里就照 `mahjong.vue` 抄一份自绘弹窗。

### 23. 赌神：「新游戏」补二次确认（但**失败遮罩上那颗例外，不弹**）

用户：「赌神游戏也少了新游戏二次确认，补上。注意参考 web 的修改，失败遮罩上的新游戏没有二次确认。」

web（`src/games/gambler/GamblerGame.vue`）就是这个分工，两个「新游戏」入口**行为不同**：

| 入口 | web | 说明 |
| --- | --- | --- |
| 操作区那颗 `新游戏` | `@click="confirming = true"` → `ConfirmDialog`（取消 / 重玩本关 / 确定重来）| 会清连胜记录，必须先确认 |
| 选择区**失败遮罩**里的 `新游戏` | `@click="startNewGame"` **直连** | web 源码里有一行注释写明：**「失败遮罩上的『新游戏』是用户指定的例外：不弹二次确认，直接清当前连胜、回第 1 关」** |

小程序原先两颗都直连 `startNewRun()` ✗；现在照 web 拆开：

- 操作区按钮 → `@click="confirming = true"`；
- 新增 `confirming` + `startNewGame()`（`confirming = false` 后调 `startNewRun()` = 清连胜 + `deal(1)`，语义同 web）；
- `replayLevel()` 先 `confirming.value = false`（web 踩过「点了重玩本关弹窗不关」）；
- **失败遮罩那颗保持 `@click="startNewRun"` 不动** —— 这是刻意的，不是漏改；
- 文案用 `core/i18n.js` 里已有的 `confirmTitle / confirmMsg / confirmOk / confirmReplay / cancel`
  （赌神没有本地 `i18n.js`，一直用 core 的 `t()`）。

**实测（mp 的 H5 构建，390×844）**
- 操作区「新游戏」→ 弹窗标题 `🔄 开始新游戏？`、按钮 `["取消","重玩本关","确定重来"]` ✓；点「取消」→ 弹窗关闭 ✓
- 点「查看答案」进失败态 → 失败遮罩按钮是 `["🔄 重玩本关","🎮 新游戏"]`；点遮罩上的「新游戏」→
  **没有出现确认弹窗**（`弹确认了吗: false`）、遮罩消失、新一局开始 ✓
- 0 异常；产物 `pages/gambler/gambler.wxml` 里有 1 处 `confirm-box` 与三个 `confirm-*` 按钮类名 ✓

> **教训（第 40 条）**：同一页里两个同名按钮**可能是有意不同的行为**。改「xxx 少了确认」这类需求前，
> 先去 web 里把**每一个**同名入口的点击处理都看一遍（`grep -n "@click="startNewGame"\|@click="confirming = true""`），
> 别图省事把 `startNewRun` 全部替换成 `confirming = true` —— 那会把「失败后直接重开」变成「失败后还得多点一次确认」。

### 24. 赌神：飞牌动画重做（照 web 的 `flyToAnswer` 时序，落点/起点都要「严丝合缝」）

用户报：「牌从答案区飞到选择区的动画效果不对，不连贯」。
实测（H5，390×844，抓 `.fly-ghost` 的逐帧矩形）确认了**四个**真问题，全在旧实现里：

| 现象（实测） | 原因 |
| --- | --- |
| 替身起点在 (34, **400**)，而点的那张牌在 (34, **444**) —— 偏 **44px**，看起来像从答案区那一带冒出来 | `position: fixed` 的替身在这个页面里**包含块不是视口**（嵌套/平台差异），直接写 `left/top = rect` 会偏 |
| 替身终点 (22, 385)、真实答案槽位 (19, 381) —— 离线 3~4px，落位时跳一下 | 终点用「槽位宽 52rpx + 间距 6rpx」**算出来**的，而不是量真实元素；且 `transform: scale()` 默认以**中心**为原点，缩小时整体往右下偏 (w差/2, h差/2) |
| 替身落地后，答案牌**自己又从下方弹一下**（`answer-in`）| web 的 `.answer-tile` **没有**入场动画（只有错牌的印章抖动）；小程序这边多加了 0.26s 的 `answer-in`，于是「飞过去 → 再弹一次」= 用户说的不连贯 |
| 动的是 `left/top/opacity/transform` 四个属性（0.26s ease）| `left/top` 每帧触发布局，且和 web 的 `element.animate`（420ms + `cubic-bezier(.3,.7,.35,1)`）不同步 |

**现在的实现（与 web 一一对应）**

1. **先落档、再量真实目标**：`picked` 立刻加上这张牌 → `.answer-tile.landing { visibility: hidden }`（`visibility` 不影响布局，量位置照样准）→
   `await nextTick()` 后用 `#answer-<key>` 量**真实**槽位矩形。
2. **起点也要量准**：替身先以 `opacity: 0` 渲染在 `#pick-<key>` 的矩形上 → 等一帧 → **量替身自己的矩形**，
   用 `fixX/fixY` 校正 `left/top`（这次实测校正量正好 44px）→ 隔一帧再 `show: true`。
   **必须分两拍**：显形和起飞写在同一拍时，玩家看到的是「牌在半空中冒出来」。
3. **只动 `transform`**：`translate(dx, dy) scale(to.width / from.width)`，
   `transition: transform .42s cubic-bezier(.3, .7, .35, 1)`（= web 的 `FLY_MS = 420` + 同一条曲线）。
   并且 **`transform-origin: 0 0`** —— 否则 scale 以中心为原点，落点会偏 (w差/2, h差/2)。
4. **落位即交接**：`FLY_MS + 20` 后移除替身 + 去掉 `landing` → 槽位在原地现身（此时替身正压在它上面，肉眼看不出切换）。
5. **删掉 `.answer-tile` 的 `answer-in` 入场动画**（连 `@keyframes` 一起删，与 web 对齐）。
6. **支持多张并发**：`flyGhosts` 改成数组（提交模式允许边飞边点），`flyingCount` 只用于「即时判断模式一次一张」。
7. **失败收尾也飞**：`finishRound()` 改成 `for (const k of missing) { await flyToAnswer(k); await sleep(120) }`，
   全部落地后才 `phase='lost'` + 盖遮罩（web 注释：不这样的话遮罩先出来、牌从遮罩上穿过去）。

**实测（H5，390×844）**

- 起点：替身 `(34, 444)` = 被点的那张牌 ✓（隐形两帧 → 显形在起点 → 才起飞）
- 轨迹：`444 → 438 → 426 → 414 → 404 → 397 → 391 → 387 → 385 → 383 → 382 → 381`，宽度 `34 → 27` ✓
- 终点：替身 `(19, 381)` = 真实答案槽位 `(19, 381)`，**误差 0** ✓；替身消失后槽位 `visibility: visible`、`animation-name: none`（不再补弹）✓
- 查看答案：41 帧有替身，遮罩在 `t=708ms` **替身全部落地之后**才出现，`landing` 残留 0 ✓，0 异常
- 产物：`pages/gambler/gambler.wxss` 里有 `transform-origin:0 0`、`cubic-bezier(.3,.7,.35,1)`、`.answer-tile.landing`，
  `answer-in` 残留 0 ✓

> **教训（第 41 条）**：「飞牌」这类动画要做到**连贯**，本质是三件事：**起点用实测、终点用实测、交接零位移**。
> 只要有一点是「算出来的」，落位那一刻就会看到跳一下；再加上一条入场动画，就变成「飞过去又弹一次」。
> 另外：`transform: scale()` 默认以中心缩放 —— 除非你就是要中心缩放，否则记得 `transform-origin: 0 0`。

> **教训（第 42 条）**：这轮修改**又踩了一次「按行号区间批量改缩进」的坑** ✗——
> 我用「找到 `setTimeout(() => {` 那行、把到下一个 `});` 之前的所有行统一加缩进」的循环，
> 结果把**后面 `onMounted(...)` 的收尾 `});`** 也改成了 `}, FLY_MS + 20);`，
> 于是 `onMounted` 变成了「带第二个参数 440 的生命周期钩子」→ `TypeError: Cannot create property 'm' on number '440'`
> （`injectHook` 拿 440 当实例），整页白屏 ✗。
> **教训**：缩进/格式化**不要用「找下一个 }」的循环**；宁可用编辑器式的最小替换，或者改完立刻编译 + 打开页面看一眼。
> 定位手段：`git diff` + 在 dev server 下看**未压缩**的堆栈（`vite` 的 HMR 会给出真实行号，压缩产物只能看到 `injectHook`）。

### 25. 1A2B：局面存档 + 连胜记录 + 新游戏二次确认（web 与小程序同步）

用户要求：①「游戏状态也要记录下来，重进恢复」②「增加最长连胜和当前连胜的记录，规则参考其它类似闯关游戏」
③「非失败状态下点击新游戏按钮，增加要清空当前连胜记录的提示二次确认」。

**存档 key（与 web 一字不差）**

| key | 内容 |
| --- | --- |
| `__guess_number__robot` | 机器人开关（原有） |
| `__guess_number__state` | JSON `{ answer, history, result, time, streak }` |
| `__guess_number__streak` | 当前连胜 |
| `__guess_number__best` | 最长连胜 |

mp 用 `@/core/storage` 的 `getJSON/setJSON` 读写 state、`getRaw/setRaw` 读写两个数字。
**每秒计时也要 `saveState()`**（与 web 的 `on-tick` 一致），否则重进时用时归零。

**连胜规则**：赢 `streak += 1` + `best = max(best, streak)`；输（8 次用尽）`streak = 0`；
「新游戏」`streak = 0`（最长连胜保留）；清记录时一并清零。

**界面**：统计条 `.card.score-area`（`🏆 最长连胜` → `🔥 当前连胜`，记录在前、当前在后，空值 `--`）；
mp 的尺寸照 web 换算：统计条 `min-height: 138rpx`、`.stat-label` 23rpx（12px）、`.stat-value` 42rpx（22px 粗体）。

**新游戏确认**：`onNewGame()` —— `gameResult === LOSE` 时直接 `startNewGame()`（**不弹窗**，与赌神失败遮罩同一例外），
其它情况 `confirming = true` → 自绘两按钮弹窗（取消 / 确定重来），文案
「会清空当前连胜（🔥 {n}）；最长连胜记录会保留」，`{n}` 用 `String(streak)` 替换。

**恢复要点**：`onMounted` 先 `loadRecords()` 再 `restoreState()`；恢复成功就**不开新局、不帮玩家落子**
（`robot` 只对新局生效，否则重进会突然冒出一注 1234）；`result !== GAMING` 时 `stopTick()`，否则 `startTick()` 接着走表。

**实测（mp 的 H5 构建，390×844）**
- 首次进入：`["--","0"]`（最长 / 当前）✓
- 构造「差一步赢 + streak 3 / best 5」的存档 → reload：`["5","3"]`、历史 2 行 ✓
- 输入 1234 提交 → 胜利层出现、`streak: 3→4`、`best` 仍 5、存档 `result: 2` ✓；reload 后仍是 `["5","4"]`、时间 `00:10` 接着 ✓
- 游戏中点「新游戏」→ 弹窗按钮 `["取消","确定重来"]`、正文含「🔥 3」；确定后 `streak: 0`、`best: 5`、统计 `["5","0"]` ✓
- 失败态（8 次用尽）点「新游戏」→ **无弹窗**、直接重开、`streak: 0` ✓
- 0 异常；产物 `pages/guess/guess.wxml` 有 1 处 `score-area`、1 处 `confirm-box`，`i18n.js` 有「最长连胜」✓

> **降级**：小程序没有「标题连点 5 次清记录」（原生导航栏没有标题点击），所以 mp 侧只有 web 能清记录。
> mp 的 `recordsPrefix` 只用于文档一致性（`__guess_number__`），页面里没有对应入口。

### 26. 1A2B：猜测记录区动态高度 + 只在记录区内滚动（web 与小程序同步）

用户：「优化中间猜测记录区域的高度，动态计算 max-height，当底部即将接触到输入区的时候出现垂直滚动条，
滚动条仅在猜测记录区滚动。」

**web**：`.game-area { overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin }`（+ `::-webkit-scrollbar` 细滚动条），
`max-height` 由 JS 量：`innerHeight − 卡片 top − 输入区高 − 16`；`ResizeObserver` 观察输入区 + 补量 60/200/480ms。

**mp（不一样，必须用这套）**：

1. 记录行包进 `<view id="history" class="history">`，高度写死 `historyHeight = min(内容高, 可用高)`：
   - 可用高 = **`windowHeight − #history.top − 输入区高 − 12 − 卡片 padding-bottom`**；
   - **量 `#history` 自己的 top，不要量卡片 top** —— 卡片上下各有 31rpx 内边距，会重复算进去；
   - **还必须再扣掉卡片的 `padding-bottom`**（`select('#game-area').fields({ computedStyle: ['paddingBottom'] })`，
     ≈16px）：只扣到「记录区」底部时，卡片自己那圈内边距仍会伸到数字键盘下面
     —— 实测「卡片底边 − 键盘顶 = **−4 / −3px**」，视觉上就是用户报的「记录区和数字键盘区重叠」；
     扣掉之后卡片底边距键盘 **12 / 13px** ✓。
2. **行高用「相邻两行的间距」**（`selectAll('.answer-line')` 后 `|top[i+1] − top[i]|`）：
   单行的 `rect.height` **不含 `.answer-line` 的上下 margin**，直接乘行数会算少（3 行时少 21px，
   于是明明放得下也出现一截多余滚动量）。只有 1 行时用 `height + 12` 补 margin。
3. **滚动别用 `scroll-view`**：实测 uni 的 H5 实现里 `.uni-scroll-view` 不是原生滚动容器
   （`scrollTop` 恒 0、`scroll-into-view` 只在首次生效，换 `:scroll-top` 也纹丝不动），
   而 `view { overflow-y: auto }` 是原生滚动、两端都稳。所以用普通 `view`：
   ```css
   .history {
     display: flex; flex-direction: column-reverse;   /* 关键 */
     overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain;
   }
   ```
   配合**DOM 里「最新的在最前」**（`reversedHistory = [...guessHistory].reverse()`）：
   视觉顺序仍是旧的在上、新的在下，而 `column-reverse` 让**滚动锚点天然在底部** ——
   新加的行一定在视野里，**不需要任何 JS 去设 scrollTop**（这是 `scroll-view` 做不到而普通 view 能做到的一点）。
4. 每次加行 / 赢 / 输 都 `measureHistory()`（结算时键盘不渲染 → 可用高度变大）；`onWindowResize` / `offWindowResize` 记得成对。

**实测（mp 的 H5 构建）**

| 视口 | 卡片 | 记录区高 | 卡片底边 → 键盘顶 | 可滚 | 滚动量 |
| --- | --- | --- | --- | --- | --- |
| 390×844，9 行 | 250..641 | 359 | **12px** | 是 | 77 |
| 375×667，9 行 | 242..471 | 198 | **13px** | 是 | 221 |
| 390×844，3 行 | 250..432（内容 150 → 刚好装下） | 150 | 221 | **否** | 0 |

> 这张表是**修完 padding 之后**的数；修之前卡片底边比键盘顶还低 3~4px（就是「重叠」的来源），
> 而「记录区底边 → 键盘顶」当时是 12px —— 所以只看记录区的间隙会以为没问题，**必须量卡片的底边**。

页整页可滚始终只有 H5 导航栏那 44px ✓；产物 `pages/guess/guess.wxml` 有 1 处 `history`、`wxss` 有 `column-reverse` / `overflow-y` ✓

### 26b. 1A2B 胜利层的「下一局」（才能连胜）

胜利层原来只有一行「🎉🎉 你赢了」，没有按钮 —— 想继续只能点操作区的「新游戏」，而它**会清零当前连胜**，
所以连胜永远停在 1。现在 `.win` 里加三样：`🔥 当前连胜 N`（`.win-note`，27rpx / normal）+
`➡️ 下一局` 按钮（`.game-icon`），`gap: 23rpx` 与 web 的 12px 对齐。

- `nextRound()` = **只调 `initGame()`**（换答案 / 清历史 / 重置计时），**连胜保留**；
  清连胜只在 `startNewGame()`（新游戏确认后）和输一局时发生 —— 别把 `nextRound` 写成 `startNewGame`。
- i18n 加 `nextRound`（`➡️ 下一局` / `➡️ Next Round`，与单人麻将同名 key）。
- ⚠️ `curStreak` 文案**自带 🔥**，模板不要再加，否则渲染成「🔥 🔥 当前连胜 3」。

**实测（mp 的 H5 构建，390×844）**：存档 streak 2 / best 4 → 提交 1234 → 胜利层 `🔥 当前连胜 3` + 按钮 `["➡️ 下一局"]` ✓；
点「下一局」→ 胜利层消失、换新答案（`answer: 2461`）、历史清空、`streak` 仍 **3**、统计 `["4","3"]` ✓

> **教训（第 43 条）**：**先验证「这个滚动方案在当前运行时真的能滚」，再谈细节。**
> 这轮在 `scroll-view` 上耗了好几轮：`scroll-into-view` 无效 → 换 `:scroll-top` 仍无效 →
> 最后发现它压根不是原生滚动容器。判断手段很土但有效：量 `scrollHeight / clientHeight / scrollTop`，
> 以及内容容器的 `getBoundingClientRect()` 有没有位移。
> 换成 `view + overflow` 之后一次就对了，而且 3 行/9 行两种极端都能覆盖。
