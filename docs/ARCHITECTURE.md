# 架构与目录（`docs/ARCHITECTURE.md`）

> 从根 [`AGENTS.md`](../AGENTS.md) 拆出来的**合集层面**说明：目录结构、共享组件、跨游戏机制。
> **改共享组件、路由、注册表、主题，或新增游戏前读这份。**
> 单个游戏的实现细节看它自己的分册（见根 AGENTS 的表格）。

## 目录结构

```
src/
├── main.js               # 入口，注册 i18n 插件与路由
├── App.vue               # 根组件：router-view + 横屏提示；定义全局 CSS 主题变量（浅/深两套，各游戏变量并集）
├── router.js             # hash 路由；afterEach 把 activeGame 切到对应游戏命名空间
├── shared/
│   ├── i18n.js           # 共享 i18n：language ref（key __games_hub__language）、按游戏注册字典、i18n()/helpItems()
│   ├── theme.js          # 共享主题（key __games_hub__theme），toggle body.dark
│   ├── emojis.js         # emoji 池（对对碰 / 连连看 / 排序共用；排序只取最前面的 8 个水果）
│   ├── confetti.js       # 各游戏共用的撒花动画（canvas-confetti 封装）：默认导出 `celebrate()` 是过关时左右两侧喷洒 1.2s 的大撒花；具名导出 `burstConfetti(intensity, { origin, count })` 是「一局之内」的即时小爆发（消消乐的大消 / 连锁、连连看的连击），`origin` 按视口比例给喷发点、`count` 可直接压小粒子数
│   ├── resumeCountdown.js # 各游戏共用的「继续前的倒数」（贪吃蛇 / Emoji 下坠在用）：`useResumeCountdown(onDone, stepMs = 800)` 返回 `{ count, begin, cancel }`，`begin()` 后先数 3 → 2 → 1（每个数字 800ms）再调 `onDone()` 真正恢复；**倒数期间调用方要继续保持暂停**（`count > 0` 就是还没恢复），组件卸载时自动 `cancel`
│   ├── resultDelay.js    # 各游戏共用的「结算前停留」（侦探 / 猎手在用）：`useResultDelay(stepMs = 500)` → `{ pending, later, cancel }`；`later(fn)` 先置 `pending`（调用方据此锁输入）再 500ms 后执行 `fn`，换关 `cancel()`、卸载自动清
│   ├── Hearts.vue        # 各游戏共用的「剩余生命」：一行 ❤️，失去的变 🤍（一开始 3 颗就 3 个 ❤️）；掉一颗时刚失去的那颗先播 `heart-pop`（scale 1 → 1.55 → 2.1 并淡到透明，0.45s），动画结束才换成 🤍，所以「放大淡出 → 变白」是两段看得到的动作。动画由组件内部的 `watch(left)` 触发，调用方只管把剩余数量传给 `:left`、总数给 `:max`（侦探 / 猎手 = 3，数独 = 难度 1~3），别的什么都不用做；`watch` 只在数量变少时播，恢复存档这种「一进来就少一颗」的情况也会顺势播一下
│   ├── CountTimer.vue    # 各游戏共用的计时器（挂载即计时、隐藏暂停、onTick 回调、reset/stop/restore；show=false 时只计时不显示数字，连连看用它驱动顶部倒计时）
│   ├── ConfirmDialog.vue # 各游戏共用的二次确认弹窗（Teleport 到 body；props: show/title/message/confirmText/replayText/cancelText/showReplay（showReplay=false 不渲染「重玩本关」，默认 true），留空用自带中英文案；emit: confirm/replay/cancel；点遮罩 = cancel；开场动画与帮助弹窗（`HelpDialog.vue`）完全同款——外层 `v-show` 的遮罩 + 内层 `<Transition name="inner">`，三条规则逐字一致：`.inner-enter-from { transform: scale(0.1) }`、`.inner-enter-active { transition: transform 0.16s ease-in-out }`、`.inner-enter-to { transform: scale(1) }`；遮罩不淡入、关闭也没有离场动画，两个弹窗的观感因此完全一致）
│   ├── ParticleBackground.vue  # 全站粒子连线背景（固定置底、跟随指针并轻微排斥、按主题实时换色、DPR ≤ 2）
│   └── games.js          # 游戏注册表：路由、首页图标、帮助弹窗 storage key、清记录彩蛋所需前缀/难度范围；同时向 i18n 注册各游戏字典（新增游戏要在表尾追加，首页末位正好接上）
├── components/
│   ├── HomePage.vue      # 首页：蜂窝排布的卡片网格（ROW_SIZES = 1/2/3/4/3/4/3/2 正好 22 个位置，与 22 个游戏一一对应；比 ROW_SIZES 多出来的卡片走兜底行，且与上一行同奇偶时加半格横向错位保持咬合），支持拖动排序（顺序存本地）。六边形宽度 `--hex-w` **同时受宽度与高度两个约束取小值，保证首页不出滚动条**：宽度约束 `(min(100vw, 480px) − 41px) / 4`（最宽一行 4 格 + 3×3px 缝隙 + 左右各 16px 内边距），高度约束 `(100dvh − 200.6px) / 7.217`（8 行蜂窝总高 = 7.217w + 18.55px = 1.1547w × (1 + 0.75×7) + 2.65×7，再扣掉顶栏 94 + 上下内边距 64/24）；实测 **320×568 → 51px**、**375×667 → 65px**、390×844 → 77px、414×896 → 82px、480×900 → 98px，五档文档高都等于视口高、无滚动条。
  卡片里的**图标与游戏名按 `--hex-w` 等比缩放**（`calc(var(--hex-w) * 0.31)` / `* 0.108`）：锚点是最小支持尺寸
  375×667，此时正好是用户指定的 **20px 图标 / 7px 游戏名**，大屏同比例放大（390 → 27/9.4px、480 → 30/10.5px，
  受 `--max-width: 480px` 封顶所以名字不会超过 11px）。**别再写死字号**：原来写死 30px / 12px 时，
  长名字（中英文都有）在窄屏会被 `nowrap + ellipsis` 截成省略号 —— 改成等比后实测 5 档视口 × 中英文
  共 10 种组合**一个都没有省略号**，且都不滚动。
│   ├── TopHeader.vue     # 共享标题栏：🏠 返回主页 + 帮助 + 游戏特色按钮插槽 + 标题（连点 5 次清记录彩蛋；首页位置不显示「游戏合集」文案，改为显示游戏图标——直接引用图标源文件 scripts/make-icon.svg；游戏标题 15px + margin-top 5px，与左右控件对齐）+ 主题/语言切换
│   └── HelpDialog.vue    # 共享帮助弹窗：帮助条目按字典 help1~help9 动态渲染，首次进入自动弹出
└── games/                # 每个游戏一个目录，utils 已扁平化到游戏目录内
    ├── click/            # 点击游戏 —— 见 src/games/click/AGENTS.md
    ├── guess/            # 1A2B（原猜数字） —— 见 src/games/guess/AGENTS.md
    ├── poker/            # 德州扑克 —— 见 src/games/poker/AGENTS.md
    ├── puzzle/           # 数字迷宫 —— 见 src/games/puzzle/AGENTS.md
    ├── g2048/            # 2048 —— 见 src/games/g2048/AGENTS.md
    ├── snake/            # 贪吃蛇 —— 见 src/games/snake/AGENTS.md
    ├── match/            # Emoji 对对碰 —— 见 src/games/match/AGENTS.md
    ├── link/             # Emoji 连连看 —— 见 src/games/link/AGENTS.md
    ├── detective/        # Emoji 侦探 —— 见 src/games/detective/AGENTS.md
    ├── hunter/           # Emoji 猎手 —— 见 src/games/hunter/AGENTS.md
    ├── three/            # Threes —— 见 src/games/three/AGENTS.md
    ├── crush/            # Emoji 消消乐 —— 见 src/games/crush/AGENTS.md
    ├── sudoku/           # 数独 —— 见 src/games/sudoku/AGENTS.md
    ├── master/           # Emoji 大师 —— 见 src/games/master/AGENTS.md
    ├── down/             # Emoji 下坠 —— 见 src/games/down/AGENTS.md
    ├── slide/            # Emoji 滑行 —— 见 src/games/slide/AGENTS.md
    ├── sort/             # Emoji 排序 —— 见 src/games/sort/AGENTS.md
    ├── alchemy/          # 扑克炼金术 —— 见 src/games/alchemy/AGENTS.md
    ├── mahjong/          # 麻将英雄 —— 见 src/games/mahjong/AGENTS.md
    ├── quesheng/         # 雀圣 —— 见 src/games/quesheng/AGENTS.md
    ├── legend/           # 麻将传奇 —— 见 src/games/legend/AGENTS.md
    └── mirror/           # Emoji 镜像 —— 见 src/games/mirror/AGENTS.md

scripts/                  # 图标源文件（make-icon.svg + icon-512.png），用其缩放生成 public/ 下各尺寸
public/                   # favicon、PWA 图标（已替换为 games hub 专属手柄图标）
```

## 架构要点

- **i18n 命名空间**：`shared/i18n.js` 按路由 meta（`activeGame`）解析当前游戏的字典；`gameTitle` 决定 `document.title`。新增 UI 文案要加到对应游戏 `games/<id>/i18n.js`（或首页的 `shared/i18n.js` 里的 `home` 字典），且中英双语都要加；跨游戏共用的组件（如 `ConfirmDialog.vue`）自带字典、不再占各游戏的 key。
- **共享状态**：主题（`body.dark` + `meta[name=theme-color]`）与语言是全局单例，任何页面切换对所有游戏生效；各游戏其余状态（难度、开关、记录）沿用各自原有的 localStorage key。
- **localStorage 约定**（各游戏互不干扰，前缀与原独立项目一致）：**每个游戏的 key 清单、含义与
  「哪些局面会存档」都写在它自己的分册里**（见上方索引），根目录只保留共享 key。
  - 共享：`__games_hub__theme` / `__games_hub__language` / `__games_hub__home_order`（首页卡片排序，新游戏按注册顺序排在已排序结果之后）
- **闯关游戏的统一约定**（对对碰 / 连连看 / 消消乐 / Emoji 大师 / Emoji 排序 / Emoji 侦探 / Emoji 猎手 / 扑克炼金术 / 麻将英雄 / 雀圣）：操作区分两半（对对碰在两者之间还有一格观察 / 操作倒计时）——左边是本关盘面信息（各游戏显示什么见该游戏分册；**雀圣例外**：那一半是它的 ⚡ 上帝模式按钮，说明文案已去掉），右边只放「🎮 新游戏」按钮（四者 `.opt-half` / `.start-wrapper` 的 flex 比例统一为 1.6 : 1.2），点击弹同一个二次确认弹窗——各处共用 `src/shared/ConfirmDialog.vue`（模板、`.confirm-*` 样式、中英文案都只有这一份，弹窗三个按钮：**取消 / 重玩本关 / 确定重来**（没有「本关」概念的模式传 `:show-replay="false"` 去掉中间那个按钮，扑克炼金术与麻将英雄的无尽模式都用）。调用方 `<ConfirmDialog :show="confirming" @confirm="startNewGame" @replay="retryLevel" @cancel="confirming = false" />`；`@replay` 只重开当前这一关、**保留闯关进度**（`retryLevel()` 里要顺手 `confirming = false`——五关走 `replayLevel()` → `initLevel()` 的那几个已经关））；失败结算浮层只放「🔄 重玩本关」；**进度条**（3px、贴统计卡底部、主色填充，样式以连连看那份为准）现有 7 个游戏有：连连看（已消对数 / 总对数）、消消乐、Emoji 大师（已消卡片 / 本关总卡片）、排序、**Emoji 滑行**（已消对数 / 本关总对数）、**扑克炼金术与麻将英雄**（得分 / 目标分，**只在本关模式显示**，无尽模式没有目标分所以不渲染）——后两个的数值是「离过关还有多远」，前几个是「盘面清了多少」。**侦探 / 猎手没有进度条**（它们是单关制、没有「本关总共多少」的概念），但同样：顶部统计卡**中间**一格显示「当前第几关」（`levelLabel` + `level + 1`，两边都是 0 基下标），「新游戏」也走同一个二次确认弹窗（`startNewGame` 里清掉当前牌面的 `bestKey()` 记录再回第 1 关；另一种牌面的记录不动，标题连点彩蛋才两边一起清）；除连连看（限定时间内清盘）外都不带计时器；闭环曲线：连连看 / 排序 / 大师在第 30 / 30 / 50 关封顶，消消乐第 30 关只是结构到顶，之后步数与目标分仍逐关上涨。
- **游戏特色按钮**：各游戏通过 `TopHeader` 的默认插槽注入自己的开关。每个游戏具体挂什么开关写在它自己的分册里。插槽样式由 TopHeader 的 `:slotted(.item-wrapper)` 提供——注意 TopHeader 自己的帮助 / 主题 / 语言按钮也用 `.item-wrapper`，所以**页面上会有多个同名的 wrapper**，测试脚本要按里面的图标（`[i-mdi-xxx]` 属性）去定位，别直接 `querySelector('.item-wrapper')`。
- **玩法保持不变**：迁移自原项目的游戏逻辑（棋盘操作、发牌状态机、判牌、1A2B 判定等）一律不改行为；只允许改导入路径、CSS 变量引用和生命周期清理。
