# Emoji 排序（`src/games/sort/`）

> 这是根目录 [`AGENTS.md`](../../../AGENTS.md) 的**游戏分册**：只讲这个游戏自己的实现、
> 存档 key 和踩过的坑。**改这个游戏前先读这里**；跨游戏共用的约定（视觉语言、共享组件、
> 闯关游戏统一约定、新增游戏流程）看根目录。
>
> - 路由：`/#/sort`
> - i18n key 前缀：`__emoji_sort__`
> - 共享组件：`src/shared/`（`i18n.js` / `theme.js` / `confetti.js` / `CountTimer.vue` / `ConfirmDialog.vue` / `Hearts.vue` / `ParticleBackground.vue` 等）

## 实现

SortGame.vue（Emoji 排序 · 闯关制：槽里自下而上堆着水果，开局只有槽口那张正面朝上；点槽位把槽口那一摞同种水果（`topRun` 只数正面朝上的）整摞抬到槽口上方，再点同一槽位放回、点别的槽位搬运 —— 目标槽要么槽口同种、要么全空，装不下就只搬得下的张数。过关 = 全部翻正 + 每个非空槽只装一种 + 非空槽数 = 水果种类数（只判「每槽同种」会把 [🍎🍎]+[🍎] 误判过关；也不能拿「槽装满」当判据：紧凑玩法归位的槽是 C 张、顶上还空一格）。难度只由每种的张数 C 与种类 K 决定、交错爬升（3 种×3 张 → 第 30 关 6 种×8 张 48 张，求解器实测约 8→53 步），第 30 关封顶、关数无限。**两套玩法共用曲线**：经典（`mode=1`）每种刚好装满一槽 + 2 个空槽（容量 = C，第 30 关 8 槽）；紧凑（`mode=2`）只留 1 个空槽、但每槽开局空出最上一格（容量 = C+1，7 槽）。空槽规则完全等价，`layout()` 把空槽分到两侧纯为观感；两者可腾挪格数接近（2C / K+C+1），实测 100% 可解、发牌 ≤1ms。水果取 `shared/emojis.js` 最前面 8 个，牌背用本游戏首页图标。**玩法开关**：顶栏 `.item-wrapper`（`i-mdi-test-tube` ↔ `i-mdi-test-tube-empty`），`toggleMode()` 先 `save()` 再切，两种玩法的关卡 / 存档 / 最高关卡分开存（经典 `__emoji_sort__level` / `state` + `best_1`，紧凑 `_2` 后缀），`mode` 存 `__emoji_sort__mode`；局面换代时 `generation++`，`performMove` 每个 `await` 后比对它收手（切玩法 / 中途开新局都靠这个）。**几何**：抬起的一摞按牌堆叠放（`LIFT_OVERLAP = 0.85`：每多一张只往上错开 0.15 格、`z-index: 30+depth`），所以槽口上方那条空白带只需「一张 + (cap−1)×0.15 格 + 缝 + 余量」，`metrics` 把「槽 cap 行 + 空白带」折算成 `rowUnits = 1 + cap + (cap−1)×0.15` 行来解高度约束 —— 这是紧凑第 30 关（容量 9）不滚动的关键，实测四档（390×844 / 375×667 / 360×640 / 320×568）格子 44 / 31 / 29 / 22px、棋盘底 784 / 638 / 616 / 537px。**只有一个目标就自动走完**：抬起后用 `moveTargets()` 数一遍，恰好一个就直接 `performMove`（它自己会等抬到位），不必再点第二下（搬运途中目标槽高亮照旧亮着：靠瞬时 `autoTarget`，`selected` 一开头就被清掉）；多目标照旧等玩家点。**搬运编排四段**（两条 CSS 过渡 + 内联 `--move-dur`/`--move-delay` 错峰，不是 WAAPI）：①点槽位 → 整摞纯竖向抬到槽口之上（`lift` 记序号）；②点目标槽 → 只改 `slot`/`depth`（`lift` 不动所以 `top` 不变 → 纯横向平移；装不下就只搬得下的几张、源槽其余几张 `dropRun` 竖向落回）；③等 `TRAVEL_MS` 清 `lift` → 纯竖向落进目标槽（x 已是目标列）；④落定后才把源槽新露出那张翻面（`hidden` 在第②段落定、界面用 `pending` 继续画牌背，落定后 `flipping` 播 0.34s 压扁）。搬运期间**不锁输入**（随时能抬别的槽、两摞可同时动），只有「一手搬运」串行：动画中点的目标槽进 `deferred` 等落定补做、点到的槽口摞里有正飞的牌（`transit`）也挂 `deferred`，手快时 `performMove` 先等 `liftUntil`；玩家途中抓起源槽槽口那张（`pending`）时 `reveal()` 当场翻正。**失败判定**：每手落定跑一次 `isDeadEnd`，两个分支都是「一定赢不了」的充分条件 —— ①还有牌扣着却「以后也翻不开新牌」（`canRevealMore` 在玩家视角可达状态里搜索，翻开是单调的、找不到才判负）；②牌全翻开后已经排不出来（`canStillWin` 这时才准）。搜索返回 'found'/'exhausted'/'unknown'，预算用尽按「没死局」处理、宁可不判。**判据是「还能不能翻牌」而不是「还能不能赢」**：把已翻开的搬走就能露出暗牌，那种局面判负是错的（玩家反馈过）。**失败演出** `failSequence`：等刚翻开那张翻完（`reveal` 记 `lastFlipAt`）→ 停 0.5s（`FAIL_PAUSE_MS`）→ 六个槽整摞抬起一格再落下（`slot-wave` 只动 transform、按槽错峰 `WAVE_STEP_MS` 75ms）→ 全部落定才 `phase = OVER` + `save()`；期间 `failing` 挡点击，`clearTransient` 要复位 `failing`/`waving`。恢复存档时补判一次死局 + board.js（纯逻辑：分档曲线 STEPS、可见连段 `topRun`/`moveCount`/`applyMove`、判定 `isComplete`/`isWon`/`countDone`/`progressPct`、失败判定三件套、带访问集与剪枝的求解器 `hasSolution`（发牌验有解）+ `generateSolvable`）+ i18n.js（route /sort，key 前缀 __emoji_sort__）

## 存档（localStorage）

  - Emoji 排序：`__emoji_sort__*`（玩法 `__emoji_sort__mode`=1 经典 / 2 紧凑；两种玩法的关卡与局面各存一份——经典沿用 `__emoji_sort__level` / `__emoji_sort__state`，紧凑用 `__emoji_sort__level_2` / `__emoji_sort__state_2`（内容都是关卡、玩法、步数、每槽暗牌张数、水果的 [种类, 槽位, 层数]、胜负状态；每走一步落一次档，过关/失败后保留结算局面，新游戏或重玩本关整体重写）；历史最高关卡 `__emoji_sort__best_1` / `__emoji_sort__best_2` 分别对应两种玩法，沿用「前缀+数字」正好让连点标题的彩蛋把两套记录一起清掉）

## 界面约定

- 顶栏「游戏特色按钮」：牌面玩法切换（`TopHeader` 默认插槽）
- 操作区左侧「盘面信息」：`槽位 · 每槽层数 · 种类`
