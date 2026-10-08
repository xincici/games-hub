# Emoji 下坠（`src/games/down/`）

> 这是根目录 [`AGENTS.md`](../../../AGENTS.md) 的**游戏分册**：只讲这个游戏自己的实现、
> 存档 key 和踩过的坑。**改这个游戏前先读这里**；跨游戏共用的约定（视觉语言、共享组件、
> 闯关游戏统一约定、新增游戏流程）看根目录。
>
> - 路由：`/#/down`
> - i18n key 前缀：`__emoji_down__`
> - 共享组件：`src/shared/`（`i18n.js` / `theme.js` / `confetti.js` / `CountTimer.vue` / `ConfirmDialog.vue` / `Hearts.vue` / `ParticleBackground.vue` 等）

## 实现

DownGame.vue（Emoji 下坠 · 反应类街机：8 行 × 6 列，整排 emoji 从底部升起把上面的排往上顶，玩家骑在整摞最上方那一个，点列即滑过去（横向插值不是 CSS 过渡），停在「顶排同列同款」处整排炸开、落到下一排上方，消一排 1 分。**每排保证 5 种齐全**（`makeRow` 先放满 5 种再补第 6 格）→ 目标永远存在、不会出现「顶排没有我的 emoji」的软锁，换 emoji 后新的也一定在顶排里。**速度**只跟 `cleared` 走：0.35 行/秒 起、每消一排 +0.03，**到基础速度的 3 倍封顶**（`SPEED_MAX = SPEED_BASE * SPEED_MAX_RATIO` = 1.05 行/秒，消 24 排到顶，顶部倍率最高停在 3.0×；实测 0 / 30 / 100 排 20.29 / 60.89 / 61.39 px/s，到顶不再加快）。**换 emoji**：每消掉一排掷一次骰子，`changeChance(streak) = 1 − 0.75 × 0.97^streak`（`streak` = 连续没换过几排）—— 第一次就有 **25%**、连续越久越容易换；**均值 3.40 排换一次、中位数 3 排**（100 万次蒙特卡洛 3.3992 / 3），换的时候从当前顶排里挑一个**跟手里不同**的列（变化一定看得见、新 emoji 一定可达）；存档字段由 `changeIn`（绝对排数）改成 `changeStreak`（旧存档没有这个字段就从 0 起算）。**两个必须记住的坑**：①消得比上升快时，消除会把整摞往下推、推过头就整摞推出棋盘甚至清空（`stack[0]` 变 undefined 会让存档作废）—— 所以 `top` 钳在最后一行、消除后立刻 `fillPile()` 补底边，堆里永远至少留一排；②`frame` 里的 `dt` 要钳到 0.05s（切后台回来 `performance.now()` 跳很大，不钳牌堆会瞬间窜到顶判负）。逐帧只改两个 `transform`（整摞、玩家，直接在 rAF 里写 DOM），结构性重渲只在消除 / 补排时发生。局中与失败结算都存档（`phase` play/over，两种都还原），`:onTick` 每秒落一次档、所以中途退出重进用时不会退回去。操作区是「本局**计时**（`CountTimer`）｜新游戏｜暂停」三格（比例 3 : 3.5 : 3.5）：`enable` 只在 play 且未暂停时为真、失败即 `stop()`；失败浮层只留标题 + 得分，重开走「新游戏」。**暂停与贪吃蛇同款**（`paused` + `.pause-mask` 点击继续）：点「暂停」或 `visibilitychange` 变隐藏即自动暂停 —— `stopLoop()` 停 rAF、`timerRef.stop()` 停表并 `save()`，整摞冻住；**继续前先用 `useResumeCountdown` 数 3 2 1**（每个数字 800ms，期间 `paused` 仍为 true、`pick()` 直接返回），数完才 `timerRef.start()` + `startLoop()`（`startLoop` 把 `last` 清 0，恢复那帧不会被 dt 跳一下）；`restore()` 还原局中局面时**停在暂停态**等玩家点继续，`onUnmounted` 再补一次 `save()`。**暂停按钮**与贪吃蛇同款：`:disabled="phase !== PLAY"`（失败 / 过关即禁用），并且 `.game-icon` 要带 `&:disabled { background-color: #aaa; cursor: not-allowed; }` —— 光有 disabled 属性不够，没这条样式按钮看起来仍是亮绿的可点状态（这次才补上）。**节奏**：炸开 `POP_MS` 180ms（CSS `rise-pop` 同步）、落下一格 `FALL_K` 20 插值收敛（约 150ms）、落地后 110ms 补判一次（连锁 / 补上炸开期间玩家的移动）；`busy` 只挡「再开一次消除」**不挡 `pick`**，判定靠 `arrived` + 非 busy 守）+ i18n.js（route /down，key 前缀 __emoji_down__）

## 存档（localStorage）

  - Emoji 下坠：`__emoji_down__*`（局面存档 `__emoji_down__state`（阶段、得分、**本局用时**、整摞各排的 emoji、堆顶行、玩家所在列与手里的 emoji、已消排数、下次换 emoji 的阈值），最高分存成前缀+数字 `__emoji_down__best_1`（沿用连点标题清记录的机制）；**局中与失败结算都保留**，重进接着玩；失败结算层不带按钮，重开点「新游戏」）
