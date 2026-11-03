# 微信小游戏版（`mp-game/`）—— 架构与移植守则

## 先读

- 玩法 / 视觉基准永远是 web：`src/games/<id>/ClickGame.vue` 等；
- 小程序版 `mp/` 只能作为「已经验证过的平台降级实现」参考，**不要把 uni-app 组件搬进来**；
- 小游戏没有 WXML / WXSS / 页面栈，所有 UI 由 canvas 2D 绘制。

## 踩坑记录（迁移前先读）

所有已经踩过、并且以后不能再犯的坑统一记录在 [`PITFALLS.md`](PITFALLS.md)：图标字体居中、首页蜂窝咬合、麻将 PNG / 圆角、牌面统一、转场、结算恢复、计时常量、模式独立存档等。

**每个迁移任务结束时，必须把新踩到的坑追加到 `PITFALLS.md` 对应章节，再更新本文件的规则。** 不要只在对话里修掉。

## 架构

```
game.js
  └─ js/core/app.js          场景生命周期 + requestAnimationFrame + 输入
      ├─ js/games/home/      首页：25 个游戏，4+3+4+3+4+3+4 蜂窝入口
      ├─ js/games/click/     关灯游戏
      ├─ js/games/match/     对对碰（三种牌面）
      ├─ js/games/point24/   24 点（精确分数 / 连胜）
      ├─ js/games/guess/     1A2B（机器人 / 连胜 / 记录滚动）
      ├─ js/games/detective/ 侦探（记忆 + 偷换）
      ├─ js/games/hunter/    猎手（目标 + 候选）
      ├─ js/games/master/    消除大师（分层堆叠三消）
      ├─ js/games/g2048/     2048
      ├─ js/games/three/     Threes
      ├─ js/games/snake/     贪吃蛇
      ├─ js/games/link/      Emoji 连连看（board + scene）
      ├─ js/games/puzzle/    数字迷宫
      ├─ js/games/mirror/    Emoji 镜像（board + scene）
      ├─ js/games/down/      Emoji 下坠（board + scene）
      ├─ js/games/crush/     Emoji 消消乐（board + scene）
      ├─ js/games/sudoku/    数独（sudoku + scene）
      ├─ js/games/sort/      Emoji 排序（board + scene）
      ├─ js/games/slide/     Emoji 滑行（board + scene）
      ├─ js/games/poker/     德州扑克（rules + scene）
      ├─ js/games/mahjong/   麻将英雄（board + scene）
      ├─ js/games/solo/      单人麻将（board + scene）
      ├─ js/games/alchemy/   扑克炼金术（board + scene）
      ├─ js/games/quesheng/  雀圣（board + scene）
      ├─ js/games/legend/    麻将传奇（board + scene）
      └─ js/games/gambler/   赌神（board + scene）
      ├─ core/canvas.js      全屏 canvas / DPR / safeArea
      ├─ core/input.js       每帧重建按钮命中区，touchstart/end 配对
      ├─ core/draw.js        圆角卡片 / 文本 / 颜色插值 / 换行
      ├─ core/storage.js     wx.*StorageSync，key 与 web 一致
      ├─ core/i18n.js        cn / en，跟随系统语言；按 namespace 注册
      ├─ core/theme.js       亮 / 暗 token，灯色用 [r,g,b,a] 方便插值
      └─ core/audio.js       InnerAudioContext：success / lose
```

- 场景继承 `Scene`，实现 `update(dt)` / `render(ctx)`；`this.buttons` 在 render 中重建。
- `App` 持有 `scenes` 注册表；场景里用 `this.app.openScene(this.app.scenes.<id>)` 跳转，不要互相 require。
- 绘制坐标是逻辑像素；`canvas.js` 已按 DPR scale，场景里不要再乘 DPR。
- `safeArea` 顶部 / 底部已导出 `SAFE_TOP` / `SAFE_BOTTOM`；标题、FAB 必须避开。

## Emoji 牌背

- 有背面的 emoji 游戏，牌背图案必须用本游戏首页 icon；调用 `cards.draw(..., faceUp, backIcon, backFallback)`。已覆盖对对碰/侦探/猎手/消除大师/镜像/排序。

## 德州扑克

- 区域顺序严格按小程序：牌型倍数 → 金额 → 手牌 → 猜大小 → 操作；猜大小开关在右下角帮助 FAB 左侧。
- 中牌型只盖牌型区（透明度约 0.95），小烟花只在该遮罩内播放，不开全屏礼炮。

## 结算与文案

- 新打出的胜负遮罩至少延迟 250ms（`Scene.resultVisible()`）；恢复存档的首帧结算态要立即展示，不补延时。
- 生命标签不写 `❤️`；图标单独画。退格等 icon+文字必须整组居中。

## 正确 / 错误反馈

- 单次选错（扣❤️）播 `playFail()`（`audio/fail.mp3`）；整局失败 / 结算失败才播 `playLose()`。不要把两者混用。

- 选错：`core/fx.js` 的 `wrongShake()`，350ms 水平晃动；选对：`popScale()`，450ms 一次性 1 → 1.18 → 0.96 → 1.04 → 1，播放一次就恢复，不能循环呼吸。边框颜色只是一种静态状态，不能代替动作反馈。

## 初始化 / 恢复动画顺序

- 难度步进器整组居中：`−`、数字、`+` 之间固定 12px，整组在左半区居中；不要两端对齐。
- restore 入场动画只能使用当前场景真实存在的 `SIZE / rows / cols`，避免 `this.n` 这类 undefined 导致 NaN。

- 所有需要入场动画的卡片 / 数字按行优先 `row * cols + col` 错峰，先左上后右下；不要用 `row + col` 斜线，也不要按 shuffle 后的数组顺序。
- 双栏操作卡（难度 + 新游戏）默认 50/50 等分。

## 数独专属

- 棋盘外框与内层都用圆角；内层不能 `fillRect` 盖外框角。
- 候选按钮一次填满全盘空格，不保留单格候选模式；操作卡保持全宽，键盘下方预留 56px 放帮助 FAB。
- 工具图标用小程序同款 list-numbered / pencil / backspace，图标和文字整体居中挨着。
- 难度名显示在 `−` / `+` 中间，不再单独写难度 caption。

## 底部控件与 FAB

- 1A2B 的机器人/帮助 FAB 与退格/提交行垂直居中；键盘底部留 10px，不贴底。

- 底部有键盘/按钮行时，FAB 必须独占 action row 或放标题栏，不能覆盖可点区域（数独已按此布局）。

## 真机居中

- 自定义 icon font 用离屏 alpha 墨迹探针居中（缓存 glyph+size），不要只依赖 actualBoundingBox/textAlign。
- emoji 光学下移固定 `0.18em`，0.30em 在真机会偏下。

## 镜像洗牌

- 聚拢/飞出用阶段时间 easeOut，缩放与位移同步；STACK 精确重叠，FLY 每张 90ms 错峰，结束显式归零/归 1。不要逐帧指数插值。

## 胜利烟花

- 统一 `core/confetti.js`：落点全屏随机、起点/速度/重力/旋转随机，形状 rect/circle/ribbon/triangle 随机，尺寸 3~10px。不要在各场景复制固定粒子模板。

## 卡片分隔线与进度条

- 分数卡进度条统一走 `D.progressBar()`，先裁卡片 14px 圆角，不能直接 `fillRect` 满宽。

## 卡片分隔线

- 游戏卡片内的竖分隔线统一 `D.divider(c, x, centerY, 24, T.border, 1)`：24px 高、垂直居中；不要用卡片高减上下边距的写法。

## 计时器与难度步进器

- 所有计时显示统一走 [`js/core/timer.js`](js/core/timer.js) 的 `drawTimer()`：
  - **正计时**用 `stopwatch`（秒表）；
  - **倒计时**用 `hourglass`（沙漏）。
  2048 / Threes / 1A2B 的已用时间用秒表；Match / Link 的限时、侦探 / 猎手的观察倒计时用沙漏；侦探 / 猎手进入作答后的已用时间切回秒表。不要再用 `⏳` / `⏱` 文本当计时图标。
- 难度 `− 数字 +` 统一参考关灯游戏：28×28 描边小按钮、8px 圆角、点击热区外扩 8px、数字 18px 加粗；三格布局用 30% / 65% 分隔。Snake 已改为同款，后续有难度步进器的游戏不要另画。
- 新增计时器 / 难度控件先复用上述 helper 和参数，再考虑局部差异。

## 文案里的控制图标

- 按钮 / 标题里的 `➡`、`⏭`、`▶`、`⏸` 使用**不带 variation selector（U+FE0F）**的字符：`➡️` 在部分真机 canvas 上会在图标和文字之间画出一个小方框。
- 牌面 emoji（🌶️ / 🐿️ 等）保留自己的 VS，不要无差别全局清除。
- 新增 i18n 时先搜 `\uFE0F`，只处理控制类字符。

## 牌面渲染统一（硬约定，后续迁移游戏都遵守）

- **所有** emoji / 扑克 / 麻将的**正面、背面、边框、圆角、牌面高度比例**统一走 [`js/core/cards.js`](js/core/cards.js) 的 `cards.draw()`；emoji 统一由 `drawEmoji()` 按卡片宽 0.42 渲染，真实墨迹居中后再补 0.30em 视觉上浮补偿。游戏里不允许再写 `drawPoker` / `drawBack` / `drawMahjong` 或自定 emoji 字号。
- 圆角统一为 `8`；扑克正面白底 + 左上/右下 rank + 中央花色；扑克背面白底 + 内虚线 + `mode-poker` 图标；emoji 背面统一主色 + 灯泡；三者尺寸比例统一由 `cards.ratio(mode)` 给出。
- 麻将**正面直接画 PNG 雪碧图**（`images/mahjong-tiles.png`），但雪碧图本身没有透明圆角：必须先用 8px 圆角 `clip()` 裁切再 `drawImage`，否则会露出灰色方角。图片自带底色和描边，**绝不能**在外层再套米色圆角底或 1px 边框；只有图片未加载时才走 `#f7f4ee` + 8px 圆角降级。
- 麻将背面统一绿色斜纹 + 8px 圆角 + 内描边；不要每个游戏另画一套。
- 新增牌面类型（如新的麻将牌/扑克牌）先扩展 `core/cards.js`，各游戏只传 item + mode，不直接碰 canvas 牌面细节。
- 改完至少检查：对对碰、侦探、猎手、消除大师四种场景的 emoji / 扑克 / 麻将正反面，以及 2x2 / 3x3 / 4x4 尺寸下圆角和边框是否一致。

## 场景切换动画（iOS 放大 / 收缩）

- `App.openGame(id, origin)` / `App.goHome()` 会先用离屏 canvas 给旧场景拍一张快照，再在 320ms 内做：
  - 进游戏：旧首页作为底图，新游戏从首页卡片中心 `scale(0.08) → 1`、`opacity 0 → 1`；
  - 回首页：新首页铺底，旧游戏从 `scale(1) → 0.08`、`opacity 1 → 0` 收缩到对应卡片中心。
- 快照画布由 `wx.createCanvas()` 创建；拿不到第二块画布时自动退回无动画切换，不能崩。
- 过渡期间 `input` 按钮数组清空，不能误触；动画结束下一帧恢复正常输入。
- 首页卡片通过 `HomeScene.getGameOrigin(id)` 提供卡片中心，游戏内 home 按钮统一调用 `app.goHome()`，不要直接 `openScene(home)`。

## 微信分享 / 转发

- 右上角菜单统一接 `js/core/share.js`：好友转发走 `onShareAppMessage`，朋友圈分享走 `onShareTimeline`；
  回到前台、切换语言、冷启动后都由 `App` 重新同步，不要在单个游戏场景里重复注册。
- 朋友圈分享注册只判断 `wx.onShareTimeline` 是否存在，不做 iOS / Android 平台分支；
  客户端不支持时由微信置灰入口，不要主动隐藏可升级平台的能力。
- 分享标题从 `home.<id>Title` 派生；首页不带 `query`，游戏场景带 `game=<sceneId>`。
  `App` 冷启动会校验白名单并直接打开对应场景；`referrerInfo.extraData.game` 供将来消息卡片 / 群场景复用。
- 朋友圈分享的落地参数由微信折叠成启动 `query`；分享卡片当前使用小游戏默认截图，如以后加自定义 `imageUrl`，
  必须确认该图已进包内且不显著增加包体。

## 首页（`js/games/home/`）

- 当前二十五个入口，按 4+3+4+3+4+3+4 蜂窝；长按 260ms 可拖动排序，顺序存 `__games_hub__home_order`（与 web 同一个 key）。水平间距按小程序 6rpx 口径缩小，行间用负 overlap 咬合。
- 每个入口按 accent 上色：logic `#23804e`、number `#2c6aad`、memory `#7550ad`、action `#bd5420`、card `#8f6419`；六边形外层用 18% 混色边框，图标用完整 accent。
- 右下角齿轮（参考小程序 FloatingActions）打开底部抽屉：主题（system/light/dark）、语言（system/cn/en）、默认牌面（emoji/poker/mahjong）、音效；选项按钮组靠右、即时生效，无保存按钮；展开 / 收起用 280/220ms 的 easeOut 位移。没有背景音乐资源，因此不展示音乐开关。
- 六边形用 `hexPath` 双层（外主色、内白卡），卡片区域整个可点。
- 首页构造时 `tiles.preload()` 预加载麻将雪碧图，进对对碰麻将模式不再先闪空白。
- 二十五个游戏场景左上角自绘 home 图标返回首页；小游戏没有原生导航栏。

## Threes 拖拽

- 松手提交时 `move(dir, startDist)` 必须从当前拖动偏移（小数行列）开始补间，不能先回原格。

- 10px 锁定方向，只给本步会移动的牌加跟手偏移；松手 ≥50% 或拖动 ≥95% 提交，<50% 弹回；提交后再走 130ms 落定与合并。

## 24 点（`js/games/point24/`）

- 算式按卡片中心居中，最大宽度对称扣除右侧退格；不可用操作符用灰底，可用操作符用白底 + 主色描边。

- `board.js` 原样移植 web 的纯逻辑（精确分数、`solveAll`、`evalTokens`、难度评分、去重发牌），不依赖 wx/canvas；`scene.js` 负责全部 canvas UI。
- 存档沿用：`__point24__state`、`__point24__streak`、`__point24__best_streak`；恢复时重算答案和评分，恢复胜利局面不放烟花。
- 界面顺序固定：分数区（最长/当前连胜）→ 评分 + 新游戏 + 查看答案 → 算式卡（右侧退格）→ 数字卡 → 符号卡；胜利浮层盖住后三块。
- 「查看答案」= 放弃：橙色按钮、当前连胜清零、数字/符号禁用；`gaveUpNote` 放在算式下方。
- 算式卡固定 104px，提示绝对定位底部，不参与布局；退格在卡片右中，避免整行跳动。
- 新游戏只有当前连胜 > 0 才弹二次确认；最长连胜不清。
- 24 点也使用图标字体（home/help/backspace），退格和帮助都有文字/矢量兜底。

## 侦探 / 猎手 / 消除大师

- 三者共用 `js/core/cards.js`（emoji / 扑克 / 麻将牌面、牌背）；关卡数据、存档 key 与 web / 小程序对齐。
- **侦探**：`__emoji_detective__mode`、`level[_2|_3]`、`best[_2|_3]`；记忆 → 翻面偷换 → 作答；3 心；只保存胜负结算。
- **猎手**：`__emoji_hunter__mode`、`level[_2|_3]`、`best[_2|_3]`；目标区 + 候选区；3 心；只保存胜负结算。
  目标区先正面记忆，进入 ANSWER 时目标牌先翻回背面、候选区同时翻正；找回一个目标后，上方对应目标牌再翻正。
- **消除大师**：`__emoji_master__mode`、`level` / `poker_level` / `mahjong_level`、`state` / `poker_state` / `mahjong_state`；`board.js` 纯逻辑分层摆放 + 可解发牌；7 格槽三消；无计时。
  三种牌面的关卡、盘面、暂存槽、胜负状态各存一套；开局 / 恢复统一 `layer → y → x` 逐层入场（`prepareDeal()`）；局中/胜利/失败都会落档，切模式前先保存当前状态，恢复时继续。
  暂存槽形状跟着牌面走：emoji 1:1、扑克 2:3、麻将 131:168，槽位底板与卡片使用同一宽高比。
- 三个游戏都从 `HomeScene` 进入，右下角 help / 模式 FAB，顶部 home 与胶囊对齐；后续动画差异继续以小程序为准。

## 2048 / Threes / 贪吃蛇 / Emoji 连连看

- **2048**：`__game_2048__best` / `state`；分数 = 盘面最大牌；130ms 两阶段滑动（先换格，130ms 后落定合并 + 新牌），合并弹跳 190ms；胜利后可继续，失败重开。
- **Threes**：`__threes_game__best` / `state`；1+2=3、3 以上同数翻倍；每张牌一次最多移动一格；1/2 平衡牌堆与 `next` 预告；`deck` 一并存档。
- **贪吃蛇**：`__snake_game__difficulty|best|state|through_wall`；20×20、1~5 档速度、默认穿墙；暂停/恢复、吃食物得分；恢复进行中局面默认暂停，失败局面静默恢复。
- **Emoji 连连看**：`__emoji_link__level|best_1|state`；`board.js` 原样移植 web；最多 2 转折、外圈虚拟格、墙、死局重排；限时、关卡 1~30 封顶、进度条、胜负结算。
  盘面 emoji **保留卡片底/描边，空白格和墙格不画卡片底**；墙用斜纹块，连线用 halo + 细线（外圈在棋盘边缘外 0.14 格）；消除时牌先闪烁再和连线一起消失。棋盘起始 y / 28px 提示带 / 连击 chip 位置对齐对对碰；连击小烟花和胜利礼炮复用同一套粒子数据。
- 四个游戏都使用 `app.goHome()` 返回，共享 iOS 场景过渡；新游戏不引入私有牌面渲染（连连看是 emoji 牌，不涉及扑克/麻将背面）。

## 数字迷宫 / Emoji 镜像 / Emoji 下坠

- **数字迷宫**：`__number_puzzle__difficulty` + `__number_puzzle__<n>`（按难度记最少点击）；从完成态随机走合法步生成，保证有解；难度 3~6，新游戏不确认。
- **Emoji 镜像**：`__emoji_mirror__state`、`__emoji_mirror__best_<d>`；阶段：展示 1.2s → 逐张翻背 → 聚中 → 重叠停留 240ms → 随机延迟散射回位 → 游戏区逐张翻正 → PLAY；操作区难度 / 新游戏各 50%；每局 `startRound()` 必须按 `round.display.length` 重建 flips / offsets 数组；点两张先做 300ms 对向交换动画，再 CHECK 450ms 统计位置正确数；计时用秒表。
- **Emoji 下坠**：`__emoji_down__best_1`、`__emoji_down__state`；8×6，牌堆上升，点列滑到同款上方消排；`fillPile()` 必须保证堆始终铺到棋盘底；暂停/恢复、失败结算、状态恢复。
- 三者都从首页进入、`app.goHome()` 返回；文字 / 按钮遵循统一约定。

## 消除动画期间的输入

- 配对成功立即标记 `matched` 并开始闪烁；**不能用全局 lock 拦住整盘**，只让不匹配的翻回动画锁输入。其它未翻牌在闪烁期间必须可以点。
- 连连看同理：消除时逻辑上立即置空两张牌，用 `clears` ghost 保留闪烁和连线；不要用 `pendingClear` 拦住整个 `onCell`。

## 1A2B（`js/games/guess/`）

- 存档：`__guess_number__state`（answer/history/result/time/streak）、`__guess_number__streak`、`__guess_number__best`、`__guess_number__robot`。
- 恢复只接有历史记录的存档；恢复时不自动落子、不放烟花；答案必须匹配 `^[1-8]{4}$`。
- 键盘 3 行（8 个数字两行 + 退格/提交），底部固定；历史区可上下拖动滚动，记录区内部滚动。
- 计时用 `startAt` + 基准秒数，每秒写一次 `state`；胜利/失败后冻结。
- 机器人只在新局生效，逐位每 200ms 填 1234；恢复局面时关闭自动落子。
- 机器人 / 帮助按小程序 FloatingActions 放右下角；键盘第三行只占 68% 宽，给 FAB 让位。
- 胜负：4A 赢，8 次失败；胜利下一局保留连胜；新游戏/失败清当前连胜，最长连胜保留。
- 新游戏在失败态直接重开；其它状态弹确认框。

## 配对闪烁动画

- 统一用 `js/core/motion.js` 的 `matchedMotion(age)`：0~450ms 两下缩放脉冲，450~1050ms **闪烁两次**，
  1050~1400ms 缩到 0。
- 不要再用 `Math.floor(age / 80) % 2` 这类硬切：80ms 一翻会闪 7 次以上，玩家会明显觉得“闪太多”。
- 以后任何“配对/消除闪烁”类动画都复用这份节奏，最多两次明暗循环；新游戏不要各写一套。

## 图标字体

- 构建：`python3 mp-game/scripts/build-icons.py`；数据来自 `@iconify-json/{carbon,mdi,dinkie-icons}`，与 web UnoCSS 同源。
- 输出 `fonts/games-hub-icons.ttf` + `js/core/icon-glyphs.js`；`game.js` 中 `icons.init()` 调 `wx.loadFont('fonts/games-hub-icons.ttf')`。
- 单色 UI 图标走 `icons.draw`；首页 25 个游戏图标全部来自 icon font（idea / bulb / calculator / counter / incognito / target / layers / calculator / numeric-3 / snake / link / puzzle / mirror / down / crush / sudoku / sort / slide / mode-poker / mode-mahjong / alchemy / quesheng / legend / gambler），不要再手绘首页图标。彩色牌面仍用 `images/mahjong-tiles.png`，icon font 不能保留多色。
- `wx.loadFont` 失败必须回退：场景里的 home/help/backspace 都保留了文字/矢量兜底。

## 对对碰（`js/games/match/`）

- `board.js`：关卡曲线（emoji/麻将 1 号、扑克 2 号，第 11 关封顶）；`data.js`：emoji 池 / 34 种麻将 / 扑克牌；`tiles.js`：麻将雪碧图加载与裁剪；`scene.js`：全部 canvas UI。
- 存档 key 严格沿用 web / 小程序：`__emoji_match__mode`、`__emoji_match__level[_2|_3]`、`__emoji_match__best_1[_2|_3]`、`__emoji_match__state[_2|_3]`。只有 WON / OVER 结算落档，局中退出重开本关。
- 三种牌面循环：emoji → 扑克 → 麻将；切换后各自接着自己的关卡 / 结算。新游戏二次确认只清当前牌面。
- 动画时间：发牌 `(row + col) * 25ms`，翻牌 450ms，配对等 470ms 再闪，消除 1.4s，错误翻回 700ms；操作限时结束立即摊牌。
- 麻将牌面：`images/mahjong-tiles.png` 由 `src/shared/mahjong-tiles.webp` 转成 PNG（真机 canvas 对 WebP 支持不稳），7 列 × 131×168 格；用 `wx.createImage()` 本地加载，失败时退化为文字牌面。
- 连击窗口 2500ms；配对成功 `playElimination()`；连击提示条和烟花落在棋盘上方提示带。胜利撒花与关灯游戏同一套左右礼炮，最高点按分数区反算。
- 右下：mode FAB 循环牌面，help FAB 打开帮助；模式图标走 icon font（emoji / 扑克 / 麻将）。

## 关灯游戏（`js/games/click/`）

- `logic.js`：纯逻辑，可直接用 Node `require` 做单元测试；不依赖 wx / canvas。
- `scene.js`：布局、绘制、触摸、动画、上帝模式、帮助。
- `i18n.js`：逐字来自 web `src/games/click/i18n.js`。

### 关键实现

- **灯的三档亮度**：数值 0/1/2；渲染层用 `display` 浮点值，点击时记录 from/to，按 0.32s easeOut 插值
  housing / bulb / glow / rim；不能直接跳色。
- **开局蒙层**：按 16ms 一格的节奏掀开；`onHide` 停、`onShow` 续；未掀开的格子不响应点击。
- **上帝模式**：`logic.solutionOps()` 从开局随机操作的 `history` 取解；播放中再点只 `stopAutoplay()`，
  清高亮、交还操作权；不提供「继续」。
- **撤销 / 重做**：只回滚玩家操作，`undoIndex` 与 `clickCount` 同步；上帝模式播放中禁用。
- **最佳成绩**：胜利时 `maxClick - clickCount`，按难度存 `__easy_click_game__${n}`；破纪录时 `NB`。
- **按钮命中**：全屏 help 的关闭遮罩必须最后加入 buttons，面板按钮要比它更晚加入，否则会被遮罩吞掉。
- **操作区横向居中**：`x1/x2` 是绝对坐标，算新游戏 / 上帝模式中心时不能再加一次 `cx`；
  图例要先量总宽，再用 `(W - total) / 2` 整体居中。
- **烟花**：胜利从左右两侧各 5 粒/40ms 持续 1.2s 喷出；初速度按 `v = sqrt(2gh)` 反算，最高点落在分数区，越过中线后自由落体；不能只在棋盘中心爆一下。
- **游戏首页**：四个游戏都要从 `HomeScene` 进入，左上角 home 图标返回；不要直接启动到游戏页。

### 视觉尺寸

- 卡片宽 `min(W - 32, 480)`；分数 / 操作行高 72；圆角 14；按钮圆角 8。
- 灯格基础 50/44/38/33/30（按难度）；同时受宽度和剩余高度约束，最低 20。
- 撤销卡宽 `cw * 622 / 750`（与 web / 小程序一致），两颗按钮各占一半。
- 帮助 FAB 48，右下角 `16 + SAFE_BOTTOM`。

## 踩过的坑

- **不要把 `tokens` 解构成常量**：`theme.tokens` 是 getter，解构会固定初始主题；每个 render 重新取。
- **按钮顺序决定命中优先级**：Input 从后往前找；全屏遮罩要最后加，弹层按钮要在遮罩之后加。
- **重绘频率**：场景 update 每帧都跑，灯色插值 / 蒙层 / 彩带都依赖帧循环；不要用 setInterval 做动画。
- **文字换行**：中文按字符测量，英文按字符也可；帮助内容可能超屏，面板要 clip。
- **requestAnimationFrame** 在小游戏里是全局的，不要当成浏览器 window API。
- **主题切换**：`theme.setMode()` 是唯一入口；改 token 后只通知当前场景 `onTheme()` 重排 / 重绘，不要在各场景另建全局监听。
- **音效路径**：小游戏本地文件用 `/audio/xxx.mp3`；不要写 `../`。

## 验收

- `node --check` 所有 JS；
- 用 Node require `js/games/click/logic.js` 跑随机局：每局保证有解、点击全灭、撤销重做可回滚；
- 开发者工具打开 `mp-game/`（compileType 必须是 game），检查 3/6/10 难度、375×667 与 390×844；
- 检查玩法：三档灯、四邻一起变、步数用尽失败、上帝模式暂停/撤销回初始局、帮助弹窗、语言/主题。
