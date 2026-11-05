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
- **牌组区上方提示（`tableHintLines()`，10.5px 弱色居中，最多两行）**：
  发牌前只有 `tableHintDeal`（点击发牌按钮发一组牌，单行垂直居中）；
  **发牌后、换牌前是两行**：`tableHintKeep`（点击选择你想保留的牌，然后换牌）+ `tableHintJoker`（大小王当红/黑牌，不可重复）；
  换牌后不显示文字，但 **28px 高度照留**（避免牌桌上下跳动）。两行基线是 `cardsY + 9 / + 22`，**行距 13**。
  布局里 `hintNeed = 28` 计入 `natural`；为了不把牌压小，牌型倍数区 caption 16→14、三处固定间距 14/12→10，
  一共还回 12px —— 375×667 仍是牌桌 133 / 牌 50×75；`maxCards < 110`（320×568）时 `tableHintH = 0` 不显示。
- **猜大小卡顶部两行**：第一行 `guessRule`（`7 平局，>=8 为大，<=6 为小`），第二行原来的 `guessTip`（猜对加倍…）。
  两行基线是 `guessY + 8.5` 与 `+ 21`（**行距 12.5**）。猜大小区比 web 的 200rpx **高 6px**（375 下 106px），头部高度 `clamp(guessH - miniH - 18, 20, 28)` ——
  那个 18 是「2px 顶距 + 12px 大/小标签 + 4px 底距」，保证标签不被卡片裁掉（踩过：头部按 32 算时标签下沿被切）。
  紧凑卡（320×568，`maxCards < 110`）用 28×42 的历史牌 + 36×54 的当前牌。
- **猜大小的飞牌动画**：点「大 / 小」后，右侧当前牌按 `GUESS_FLY = 320ms`（easeOut）从当前位飞进左侧历史位，
  尺寸同时缩到 `miniW×miniH`，落地才补「大 / 小」标签并换下一张牌；飞行期间右侧留空、`guess()` 忽略连点，
  闪烁循环用 `!this.guessFly` 挡住。实现状态是 `this.guessFly = { at, index, card, big, win }`。
- 中牌型只盖牌型区（透明度约 0.95），小烟花只在该遮罩内播放，不开全屏礼炮。

## 帮助弹窗（玩法介绍）

- **标题统一** `t('helpTitle')` =「玩法介绍」/「How to play」（`core/i18n.js` 全局字典）。
- **背景是毛玻璃**：`core/blur.js` 的**纯 JS 盒式模糊**（不依赖 canvas 平滑能力）：
  把画面缩到 **1/2**（`HALF = 2`）→ 对 `getImageData` 的像素做 **2 遍**可分离盒式模糊（`BLUR_R = 5`）
  → `putImageData` → 放大 2 倍画回，最后盖一层淡色（暗色 `rgba(18,18,18,0.45)`、亮色 `rgba(255,255,255,0.4)`）。
  **只在打开帮助的第一帧算一次**（`s.backdrop` 缓存，帮助打开时场景本来就冻结），之后每帧贴图；
  收起/重开时清缓存，主题变了也重算。
  ⚠️ 曾经的做法是「1/8 下采样 + `drawImage` 放大」，靠 `imageSmoothingEnabled` / `ctx.filter` 出模糊 ——
  这两个能力各家基础库默认值和支持度都不同，放大倍数一大就是**马赛克方块**（踩过两次）。
  现在模糊在像素层完成，平台差异只影响最后 2 倍放大（最多 2px 台阶，看不出来）。
  拿不到第二块画布或读不到像素时退回 `rgba(0,0,0,0.32)` 纯遮罩。
  ⚠️ 毛玻璃要画在**圆形裁剪之内**（先 `clip` 再铺底），否则一打开整屏就糊，看不出圆形扩张。
- **展开 / 收起是圆形**（和首页设置面板一致）：圆心 = 帮助 FAB 的中心
  （`help.fabCenter()` / `fabRect()`：`helpFab` / `helpRect` / `fabX+fabY+fabSize` 依次兜底），
  半径 0 → 最远屏幕角，**展开 600ms、收起 480ms**（与首页 `settingsAnim` 同参数）ease-in-out；
  内容整体 `clip` 在圆里，`help-ok` / 全屏遮罩**只在 `anim >= 1` 时注册**。
- **关闭 ✕**：完全展开后，在帮助 FAB 那一格画一枚圆形 ✕（`T.card` 底 + 阴影 + `icons` 的 `close`，
  图标失败退回 `×` 文字），透明度随圆形 `(ease-0.45)/0.4` 淡入；`ease > 0.75` 就可点
  （`help-close`），和首页设置面板把齿轮变成 ✕ 是同一套做法。面板右下仍保留「好的，明白」。
  `App` 在 `helpOpen` 为假但 `help.animating()` 为真时仍会调用 `help.draw()`，收起动画才不会断。
  ⚠️ 动画推进别写成 `target > anim ? +dt : -dt` —— 相等时会持续减，anim 在 1 附近来回抖，
  按钮时有时无。要写成 `if (anim < target) … else if (anim > target) …`。
- **渲染只有一处**：`core/help.js`。各场景里那份 `drawHelp()` 是历史遗留，`App` 渲染时会把它临时替换成空函数
  再调用 `help.draw()`，所以改帮助样式**只改 core/help.js**，不要去改场景里的旧实现。
- **正文格式**（写在各游戏 `i18n.js` 的 `helpMsg`，可多行）：
  - `## 小标题` → 主色加粗 **15px** 小标题（比正文大一号），段前留 10px；
  - `- 文案` → 项目符号（圆点 + 12px 悬挂缩进）；
  - 空行 → 段间距；其余按普通段落。
  行高 20、正文 13px、折行宽 `W-104`（375 下约 20 个汉字/行）。
- **行尾不加句号**：每条项目符号、小标题都以短语收尾，不要写「。」「.」（读者扫的是要点，不是段落）。
- **内容规范**：只讲「怎么玩 + 得分/胜负」，3~5 条项目符号，中文 ≤ 约 260 字；
  **不要写关卡表、难度曲线、模式切换、存档说明**这类冗余信息（玩家只想知道怎么玩）。
- 每个游戏只保留一个 `helpMsg` 键（旧的 `help1..helpN` 已合并删除），冒烟会断言：
  `helpMsg` 以 `## ` 开头、至少 2 条 `- `、长度合理，并把 25 个游戏的帮助面板都画一遍确认不抛错。

## 背景浅景（`core/particles.js`）

- 每个场景构造时 `this.bg = new ParticleField()`，`update(dt)` + `draw(c, theme.dark)`，已覆盖 25 个场景；
  它只是「浅景」，**不能抢内容**：全部元素透明度都很低、运动很慢、没有高频闪烁。
- 四层（从下往上）：**光斑** 4 团巨大径向渐变（色相 50 秒一轮在绿/蓝/紫之间缓慢插值）、
  **蜂窝** 10~16 个空心六边形（呼应首页，少数填色，缓慢上浮 + 自转）、
  **微尘** 14~24 颗（约 1/4 画成四芒小星，个别呼吸）、**流星** 每 9~16 秒一颗、约 2.2 秒斜穿屏，
  带渐隐拖尾（全屏唯一「会动一下」的东西，是为了好玩，不是为了告示）。
- **对比度（重要）**：淡过两轮才调对。浅色主题要**单独一套**参数，别直接复用暗色的比例 ——
  浅底上同等的低透明度几乎看不出来，深色主题能看到的量级在浅色下等于没有。
  当前数值：光斑峰值 暗 0.21 / **亮 0.30**（第 4 团 0.13 / 0.17）、蜂窝描边 暗 0.20 / **亮 0.32**、
  微尘 暗 0.40 / **亮 0.52**（浅色用更深的水蓝灰 `52,70,96`）、流星尾 暗 0.28 / **亮 0.38**、
  流星头 0.62 / **亮 0.66**。浅色调色板也更深饱和（`18,92,58` / `30,74,140` / `86,52,140`）。
  **再淡就看不见了，别再往下调**；要更明显就调这几个数，不要加元素数量。
- **性能预算**：每帧固定 4 个渐变 + 12~20 个六边形路径 + 二十来个圆/十字，不随分辨率增长；
  背景是每帧第一个画的，填充率最便宜。**不要**给背景加离屏合成、文字或图片。
- 旧版是「点 + 连线」，单调且连线在某些分辨率下会显得杂乱；换掉了就别再往回改。
- 冒烟断言：跑 22 秒不出现 NaN 坐标、元素不出界、流星出现后会被清掉、背景不写文字/不贴图。

## 结算与文案

- 新打出的胜负遮罩至少延迟 250ms（`Scene.resultVisible()`）；恢复存档的首帧结算态要立即展示，不补延时。
- 生命标签不写 `❤️`；图标单独画。退格等 icon+文字必须整组居中。
- **结算遮罩必须跟随主题**：一律 `T.overlay`（亮 `rgba(255,255,255,0.8)` / 暗 `rgba(51,51,51,0.8)`），
  或者 `theme.dark ? 'rgba(38,38,38,0.9x)' : 'rgba(250,248,239,0.9x)'` 这种显式分支；
  **不允许写死浅色**（`rgba(250,248,239,…)` 之类）—— 暗黑模式下会变成一块白板，
  而 `T.win` / `T.lose` 在暗色主题里是亮色，文字几乎看不见。
  参考实现：猎手 / 侦探 / 消除大师 / 连连看（`T.overlay`）。
- 结算里的按钮：主按钮 `T.primary` + `#fff` 文字；次按钮描边 `T.god`；说明文字 `T.muted`，
  不要在结算层里写死 `#2c3e50` 这类正文色。

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

## 静音（每游戏独立）

- 每个游戏的帮助 FAB **左边**固定有一枚静音 FAB（`core/fab.js` 的 `drawMute` + `leftSlot`）：
  开启 = 喇叭图标（`volume`，主色）；静音 = 划掉喇叭（`volume-off`，`T.muted`）。
- **全局音效关闭时（`__games_hub__sfx = '0'`）静音 FAB 不展示**，也不注册命中区；各游戏自己的静音选择仍然保留。
  此时它**不能占位**：原本在它左边的模式 / 机器人 / 穿墙 / 骰子按钮要右移一格顶上来，中间不留空。
  实现：坐标不要在 `layout()` 里算死，绘制时用 `fabKit.muteSlot(helpRect)`（关闭时返回 null）
  与 `fabKit.slotLeft(helpRect, muteRect ? 2 : 1)` 现算。
- 声音拦截只在 `core/audio.js`：`play()` 先判全局开关，再判当前场景的 `__games_hub__mute__<sceneId>`。
  「当前场景」由 `App.setSceneId()`（`openScene` / `openGame` / `goHome` 共用）同步给 audio ——
  别只在 `openScene` 里同步，进游戏走的是 `openGame`（踩过：全都写到 `mute__home`，一处静音处处静音）。
  场景里**不要**再写 `if (muted) return`。
- `App.openScene` 负责 `audio.setGame(sceneId)`；新增游戏只要在 FAB 组里调用 `fabKit.drawMute`，
  并把原有左侧 FAB 用 `fabKit.leftSlot` 串起来（顺序：最左 → … → 静音 → 帮助）。
- 共享模块统一以 `fabKit` 导入（场景里已有局部 `fab()` 辅助函数，别撞名）。
- 冒烟脚本 `scripts/smoke.js` 是**开发机脚本**：`project.config.json` 的 `packOptions.ignore` 排除了
  `scripts/` 整个目录，且脚本内不写 shebang —— 小游戏上传器会把项目内所有 `.js` 当源码解析，
  `#!` 会直接导致「上传失败 / invalid file」。新增开发脚本一律放 `scripts/`。
- 新增 / 修改提示文案后跑冒烟：`node scripts/smoke.js 390 844` 与 `node scripts/smoke.js 375 667`
  （会顺带断言各游戏 `playHint` 在中英两种语言下都存在、且没有串段）
- 改完 FAB 相关代码跑冒烟：`node scripts/smoke.js 390 844` 与 `node scripts/smoke.js 375 667`
  （375 是支持下限；320 宽时 24 点的操作键会铺到右下角，`drawMute` 会**自动隐藏**静音 FAB 而不是压住按键）
  （假 wx + canvas 渲染全部场景，检查渲染异常 / 静音 FAB 位置 / 重叠 / 静音是否真的拦住音效）。

## 底部控件与 FAB

- 1A2B 的机器人/帮助 FAB 与退格/提交行垂直居中；键盘底部留 10px，不贴底。

- 底部有键盘/按钮行时，FAB 必须独占 action row 或放标题栏，不能覆盖可点区域（数独已按此布局）。

## 真机居中

- 自定义 icon font 用离屏 alpha 墨迹探针居中（缓存 glyph+size），不要只依赖 actualBoundingBox/textAlign。
- **emoji 居中（2026-11 起）**：分流条件是「**Android 且拿不到 `actualBoundingBox`**」，其余一律走老逻辑
  （老逻辑 = 墨迹中心 + `0.18em` 光学下移，iOS 真机已调好）。
  ⚠️ 两次踩坑：
  ① 一开始写成「非 iOS 就用新逻辑」→ iOS 上 `platform` 取不到、被判成非 iOS，`0.18em` 被去掉，整盘上移 5px；
  ② 第二次写成「确认 Android 就用新逻辑」→ 开发者工具的 Nexus 等 Android Profile 宿主仍是 **Apple Emoji**
     （`measureText` 有 metrics），于是同样上移 5px。
  **结论：能不能拿到 metrics 才是可靠信号，平台名不是。** 开发者工具 / Android Profile / iOS 都有 metrics，
  只有微信自绘 canvas 的真机 Android 没有。
- Android 无 metrics 时的实现：纵向用 **em 盒中线**（`textBaseline='middle'`，不再叠 0.18em —— 那个补偿是给
  Apple Emoji 的，在 Noto Color Emoji 上会整体偏下），横向按 `core/emoji-box.js` 量到的墨迹偏移修正。
  这个模块用离屏画布 `getImageData` 逐字量一次（按「字号|字形」缓存，96×96 canvas 仅 36KB），拿不到就退回
  `middle` + 不修正。

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

## 游戏区下方的玩法提示

- 2048 / Threes / 消除大师 / 贪吃蛇 / Emoji 下坠 / 扑克炼金术 / 麻将传奇 在游戏区下方各有一句很短的中文说明（英文同步），
  统一走 `core/draw.js` 的 `D.hintLine(c, text, y, color)`：10px、`T.muted`、水平居中。
- 文案 key：`<gameId>.playHint`（cn + en 都要有）。y 取「游戏区底部 + 16」；消除大师的游戏区是
  「棋盘 + 暂存槽」，所以提示在槽下面（`trayY + trayH + 16`）。
- 底部要**真的留出这一行**：炼金术把 `availBottom` 再减 16；麻将传奇把底部 `reserve` 从 `+8` 提到 `+26`
  （棋盘会小一点：375 宽下格 33×42 → 31×40，这是给常驻提示付的代价）。
  消除大师不做额外预留（棋盘已经贴着底部，加预留会小 30px），它的提示靠「比 FAB 高 12px」避让。
- 提示宽度必须一行装得下：中文约 22 字以内、英文 58 字符以内（375 宽可用 343px）；
  冒烟会按 10px/汉字、5.5px/拉丁估算并断言。
- 提示是居中短句，判「会不会撞右下 FAB」看**横向**：文字右沿必须小于 FAB 左沿，
  不要为了避开 FAB 往底部加预留（那会把棋盘压小）。冒烟脚本有对应探针（`HINT2_PROBE=1`）。

## 文案里的控制图标

- 按钮 / 标题里的 `➡`、`⏭`、`▶`、`⏸` 使用**不带 variation selector（U+FE0F）**的字符：`➡️` 在部分真机 canvas 上会在图标和文字之间画出一个小方框。
- 牌面 emoji（🌶️ / 🐿️ 等）保留自己的 VS，不要无差别全局清除。
- 新增 i18n 时先搜 `\uFE0F`，只处理控制类字符。

## 牌面渲染统一（硬约定，后续迁移游戏都遵守）

- **所有** emoji / 扑克 / 麻将的**正面、背面、边框、圆角、牌面高度比例**统一走 [`js/core/cards.js`](js/core/cards.js) 的 `cards.draw()`；emoji 统一由 `drawEmoji()` 按卡片宽渲染（当前 `0.58w`），居中规则见上面「真机居中」（有 `actualBoundingBox` 的平台走老逻辑；只有拿不到 metrics 的 Android 真机走「em 中线 + 墨迹横向修正」）。游戏里不允许再写 `drawPoker` / `drawBack` / `drawMahjong` 或自定 emoji 字号。
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
- 右下角齿轮打开**整屏设置面板**（照 web `src/shared/SettingsSheet.vue` 的排版）：
  顶部绿色渐变徽章 + 「设置」标题；三张分组卡（主题 / 语言 / 偏好设置），卡内是「h3 + 分段控件」，
  选中态是一块**绿色滑块**（`(宽 − 8 − 两处 gap)/3`，圆角 11），切换时像 web 的 `.seg-slider` 一样
  **弹性滑过去**（320ms、`cubic-bezier(0.34, 1.25, 0.5, 1)`，约 2% 过冲；实现见 `springEase()` /
  `slideSeg()`，位置按小数索引绘制，过冲钳在 ±0.12 格），主题的三个选项带图标
  （`monitor` / `sun` / `moon`）；最后一张卡是开关行（iOS 风格轨道 + 白色圆钮，选中绿色渐变图标块）。
  展开 / 收起照 web 的 `clip-path: circle()`：**以右下角齿轮中心为圆心、半径 0 → 到最远屏幕角**（600/480ms，ease-in-out），
  做法是把面板内容画到离屏画布，再 `arc + clip + drawImage` 到主画布（内容比圆形晚一点显形）；完全展开后直接画主画布、不再走离屏。内容比屏高时可拖动滚动。关闭按钮就画在齿轮那一格（圆形 ✕）。
  没有背景音乐资源，因此**不画「背景音乐」开关**（web 有）；音效开关即时生效，无保存按钮。
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
- **Emoji 镜像**：`__emoji_mirror__difficulty`、`__emoji_mirror__state`、`__emoji_mirror__best_<d>`；每次进入清掉局面并开新局，但回读上次所选难度；阶段：展示 1.2s → 逐张翻背 → 聚中 → 重叠停留 240ms → 随机延迟散射回位 → 游戏区逐张翻正 → PLAY；操作区难度 / 新游戏各 50%；每局 `startRound()` 必须按 `round.display.length` 重建 flips / offsets 数组；点两张先做 300ms 对向交换动画，再 CHECK 450ms 统计位置正确数；计时用秒表。
- **Emoji 下坠**：`__emoji_down__best_1`、`__emoji_down__state`；8×6，牌堆上升，点列滑到同款上方消排；`fillPile()` 必须保证堆始终铺到棋盘底；暂停/恢复、失败结算、状态恢复。
- 三者都从首页进入、`app.goHome()` 返回；文字 / 按钮遵循统一约定。

## 消除动画期间的输入

- 配对成功立即标记 `matched` 并开始闪烁；**不能用全局 lock 拦住整盘**，只让不匹配的翻回动画锁输入。其它未翻牌在闪烁期间必须可以点。
- 连连看同理：消除时逻辑上立即置空两张牌，用 `clears` ghost 保留闪烁和连线；不要用 `pendingClear` 拦住整个 `onCell`。

## 1A2B（`js/games/guess/`）

- 存档：`__guess_number__state`（answer/history/result/time/streak）、`__guess_number__streak`、`__guess_number__best`、`__guess_number__robot`。
- 恢复只接有历史记录的存档；恢复时不自动落子、不放烟花；答案必须匹配 `^[1-8]{4}$`。
- 键盘 3 行（8 个数字两行 + 退格/提交），底部固定；历史区可上下拖动滚动，记录区内部滚动。
- **胜负结算只盖记录卡**：遮罩矩形 = `historyRect()`（14 圆角），不再一铺到底；下方键盘**始终绘制**
  （结算时各键文字 35% alpha、且不注册热区 → 看得见、点不动），右下 FAB 仍可点。
  胜利态的「下一局」按钮贴记录卡底部 `min(cy + 32, card.y + card.h - 44)` ——
  320×568 下记录卡只有 126px 高，写死 `cy + 32` 会溢出。
- 记录区顶部固定两行规则提示：`8 次机会猜中一个 4 位数` + `A 代表数字对且位置对，B 代表数字对但位置不对，目标 4A0B 取胜`
  （`guess.historyHint` / `guess.historyHint2`，10px、行高 12、超宽自动折行，`headerH` 随行数增长）。
  375×667 下记录区 225px，两行提示后每行 45px —— 刚好容下「数字格 28 + 结果行 16」，不要再加大行高。
- 计时用 `startAt` + 基准秒数，每秒写一次 `state`；胜利/失败后冻结。
- 机器人只在新局生效，逐位每 200ms 填 1234；恢复局面时关闭自动落子。
- 机器人 / 帮助 / 静音按小程序 FloatingActions 放右下角；键盘第三行按「FAB 组**最左那枚**的左沿」让位（`optW = min(kw * 0.68, fabRowLeft - kx - pad - 8)`，`fabRowLeft` = 组内最左 FAB 的 x），不要写死屏宽百分比。
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

## 雀圣（`js/games/quesheng/`）

- 上帝模式用 `board.solveBeam()` / `solvePuzzle()` 求整条解，再用 `setTimeout` 链逐步执行；
  每一步的停留由常数量决定，**不要复用操作动画的时长**（`SLIDE_MS + 110` 只有 260ms，太快）：
  `GOD_SLIDE_MS = 640`、`GOD_CLEAR_MS = 700`、`GOD_LEAD_MS = 420`（点下去到第一步的准备时间）。
- 对照 web：`src/games/quesheng/QueshengGame.vue` 的 `GOD_SLIDE_MS = 620` / `GOD_CLEAR_MS = 600`。
  小游戏版故意再慢一点（640 / 700）；改速度时两边一起想一想，别只改一边。
- 上帝模式播放期间禁用拖拽 / 帮助 / 模式切换；`stopGod()` 会清掉全部 `godTimers`。

## 关灯游戏（`js/games/click/`）

- `logic.js`：纯逻辑，可直接用 Node `require` 做单元测试；不依赖 wx / canvas。
- `scene.js`：布局、绘制、触摸、动画、上帝模式、帮助。
- `i18n.js`：逐字来自 web `src/games/click/i18n.js`。

### 关键实现

- **灯的三档亮度**：数值 0/1/2；渲染层用 `display` 浮点值，点击时记录 from/to，按 0.32s easeOut 插值
  housing / bulb / glow / rim；不能直接跳色。
- **开局蒙层**：按 16ms 一格的节奏掀开；`onHide` 停、`onShow` 续；未掀开的格子不响应点击。
- **上帝模式**：`logic.solutionOps()` 从开局随机操作的 `history` 取解；播放中再点只 `stopAutoplay()`，
  清高亮、交还操作权；不提供「继续」。节奏是
  `VIRTUAL_CLICK_EFFECT_DURATION = 320`（高亮）+ `VIRTUAL_CLICK_WAIT_DURATION = 420`（停顿）= 每步 740ms；
  原来是 220/300（520ms），看着太快、看不清这一步改了哪几个灯。
- **撤销 / 重做**：只回滚玩家操作，`undoIndex` 与 `clickCount` 同步；上帝模式播放中禁用。
- **最佳成绩**：胜利时 `maxClick - clickCount`，按难度存 `__easy_click_game__${n}`；破纪录时 `NB`。
- **棋盘上方两行提示**（`drawLegend`，`legendH = 46`，其中 12px 是给棋盘的净空）：
  第一行 `● 灭 → ● 全亮 → ● 半亮`，上方再画一条**圆角拱桥**（竖→圆角→横→圆角→竖，1.3px、圆头）：
  右端起笔在「半亮」文字的中点正上方、左端收在「灭」小圆圆心，末端接一个 6.5px 朝下箭头指向「灭」，
  末端接一个 6.5px 的朝下箭头指向「灭」；不要再用扁平二次曲线（跨度 120px、高 6px 会像一条歪掉的横线），
  表示三档循环回到关灯；第二行 `点击一个灯，灯本身和它四周的灯全部都会切换状态`（`click.lampHint2`）。
  第一行不再带末尾的「四邻一起变」（旧 `lampTip` 已删）。给提示加行时记得同步 `legendH`，
  否则棋盘会被压小（375×667、6×6 时 cell 只有 32px）。
  ⚠️ 第二行文字下沿（`line2Y + 5`）与 `boardY` 至少留 10px：胜利 / 失败遮罩正好铺满棋盘，
  贴太近会把文字下半截盖住（踩过：`legendH = 34` 时文字下沿 272、棋盘顶 270，遮罩压住半行）。
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
