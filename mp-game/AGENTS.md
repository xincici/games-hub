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

## 成就系统（`core/achv.js` + `home/achv-page.js`）

- **入口**：首页齿轮**左边**一枚奖杯 FAB（`achvRect`，48px，间距 12）。外圈是一道进度环（已解锁比例），
  有新解锁时右上角一个暖色小圆点（`achv.hasNew()`，打开页面即清除）。
- **顶部固定一张「每日挑战」卡**（`dailyCard()`）：列表**最上面**、**不参与长按排序**
  （`hitIndex` 命中 `pinned` 返回 -1），左侧是手绘日历（icon font 没有日历图标），右侧 5 条：
  完成第 1 次 / 连续 3 天 / 连续 10 天 / 累计 50 次 / 累计 100 次。
  数据来自 `daily.completedTotal()`（`total` 字段，永久累计，不受 days 裁剪影响）和 `daily.bestStreak()`
  （历史最长连续，不是当前连续）。这 5 条**计入**总览 x/y 和奖杯进度环，但「已入门 n/25」仍只数游戏。
- **页面**：整屏面板，圆形从奖杯 FAB 展开（600/480ms，和设置面板同一套）；顶部标题（`achvTitle`，
  中文「成就殿堂」/ 英文只写 `Achievements`，不要写 `Hall of Achievements` 那种长标题）+ 三个总览
  （成就 x/y、已入门 n/25、累计对局），下面是 25 张游戏卡。列表可拖动滚动。
- **长按卡片可拖动排序**（和首页蜂窝同一套 260ms 长按节奏）：长按时 `wx.vibrateShort` 一下、卡片抬起
  （放大 1.02 + 更重阴影），跟手移动；手指进入别的卡的槽位就即时交换（`AchvPage.moveItem`），
  拖到列表上下边缘 52px 内会自动滚动，松手落位并写 `__games_hub__achv_order`。
  - 手势冲突：手指移动超过 8px 就取消长按定时器（那是滚动），`achvCard` 存在时**不再**处理滚动。
  - 顺序损坏 / 缺项时 `loadOrder()` 用默认 25 个 id 补齐，不会丢卡。
- **底部常驻提示**：列表下沿居中的一枚 **绿底白字小标签**（`achvDragHint`，10px 加粗白字、
  `T.primary` 不透明底、胶囊圆角 `h/2`、高 20、左右内边距 11），靠**自身轻投影**（暗 `rgba(0,0,0,0.5)` /
  亮 `rgba(0,0,0,0.2)`、blur 8、offsetY 2）浮在列表之上。
  **底部渐隐已删掉**（`fadeGrad` 整个移除）—— 不要再用半透明文字或整条渐变压内容，标签自己就能读清；
  居中摆放，375 下与右下 ✕ 不重叠（冒烟断言：标签在屏内、不压 ✕、有投影、`fadeGrad` 不再存在）。
- **新达成的成就 = 打开面板自动滚过去 + 播一次高亮**：
  - `achv.js` 在 `collectUnlocks()` 里记 `data.newest = { key, at }`，**同一次检测到多条时只保留最后一条**
    （后覆盖前），所以一次面板最多只追一个；
  - 打开面板（`openAchv()`）先 `achv.takeNewest()` —— **取走即清空 + 标记已看过**，
    所以这个动画每次解锁**只播一次**，再打开不会重播（`newestUnlock()` 只读、`takeNewest()` 取走）；
  - 滚动位置 `AchvPage.focusNew(key)`：让那张卡的**中心**落在可视区 **40%** 处（中间偏上），
    由 `HomeScene` 的 `achvScrollAnim = { from, to, at: now+280, dur: 520 }` 缓动过去（easeOutCubic）；
    用户一碰列表就 `achvScrollAnim = null`，不跟手抢；
  - 高亮 `AchvPage.withSpot()`：那一行套一层**橙色呼吸描边 + 浅橙底 + 右上角「新 / NEW」胶囊**，
    外加 `1 + 0.06·sin` 的一次轻微放大，持续 `SPOT_MS = 1600ms` 后自动收起（最后 420ms 淡出）。
  - 游戏行 key 是 `<gameId>#<行号>`，隐藏成就是 `hidden#<key>`；冒烟断言：同批多条只留最后一条、
    卡片中心停在 40%、行上有「新」角标、打开时自动滚 + 高亮、再打开两者都不出现。
- **关闭 ✕**：画在**设置齿轮那一格**（`gearRect`，右下角），不是成就 FAB 的位置 ——
  和设置面板「齿轮变 ✕」的习惯一致。圆形展开的圆心仍然是被点的奖杯 FAB。
  透明度随圆形 `(ease-0.45)/0.4` 淡入，`ease > 0.75` 时注册 `achv-close` 命中区。
- **滚动要跟手 + 有惯性**：拖动时 1:1 跟手（记录最近 6 次采样），松手按
  `v = Δs/Δt`（换算到 px/帧、钳 ±45）继续滑，每帧 ×0.94 衰减，撞到两端立刻归零；
  触摸开始会先清零惯性。`achvVel` 是这份状态。
- **滚动流畅度的三个关键**（真机卡顿都出在这）：
  1. **卡片阴影 `shadowBlur` 非常贵** —— 滚动 / 拖动中给 `glassCard(..., flat=true)` 关掉阴影，
     停下后的下一帧自动恢复（视觉上几乎看不出来，帧率差别很大）；
  2. 顶部渐变、底部渐隐的 `createLinearGradient` **缓存起来**（按主题失效），不要每帧新建；
  3. 列表只画视口附近的卡（`item.y + item.h > top - 20 && item.y < top + viewH + 40`）。
- **卡片是左右 3 : 7**：左边（`LEFT_W = CARD_W*0.3`）**只有六边形图标 + 游戏名**，整组垂直居中，
  右侧一条极淡分隔线；右边 7 是**成就列表**，按行数垂直居中。
  左侧**不再放成绩行**（最高资产 / 最长连胜这类都做成右侧的「指标行」，见下）；
  六边形图标半径 22（44px），与名字间距 ~8px；整组（图标 + 名字）按卡片中线垂直居中，
  单行时名字中心 `h/2 + 26`、图标中心 `h/2 - 10`。
  **名字一行放不下时按空格折成两行**（`wrapName()`，宽度 `LEFT_W - 16`，行高 `NAME_LH = 14`）——
  英文 `Hidden achievements` / `God of Gamblers` 就是靠这个不溢出；拿不到画布量尺时退回单行。
  卡片高度 `max(74, rows*ROW_H + CARD_PAD*2 + 6)`（ROW_H 22、CARD_PAD 8），2 条和 3 条都不会留空。
- **卡片半透明**（`glassCard()`：暗色 `rgba(52,52,52,0.84)`、亮色 `rgba(255,255,255,0.86)` + 阴影 + 细描边），
  **背景的烟花要能从卡片里透出来** —— 用不透明的 `T.card` 会把这个氛围彻底挡住。
- **某个游戏成就全达成 → 整张卡换浅橙底**（`cardColors(dark, allDone)`：暗色 `rgba(150,86,32,0.5)` /
  亮色 `rgba(255,214,170,0.9)`，描边也换成橙 `rgba(224,150,80,0.5)` / `rgba(216,138,66,0.5)`）。
  判断条件 `!game.hidden && achv.length > 0 && every(unlocked)` —— 隐藏成就卡不算「某游戏」。
  仍然是半透明的，烟花照样能透出来。
- **进度药丸**：轨道保持中性（暗 `rgba(255,255,255,0.05)` / 亮 `rgba(0,0,0,0.035)`），
  **已达成的比例部分填浅绿色**：暗 `rgba(79,158,116,0.88)`、亮 `rgba(143,211,175,0.92)`。
  这两个绿是按「填充上还要压文字」挑的 —— 暗色主题浅色文字、亮色主题深色文字都能读。
- **成功态文字的颜色分主题**：暗色主题下「已达成」「x 次」和前面的对钩（`check-all`）一律**白色**
  （`okColor = dark ? '#ffffff' : T.primary`）—— 主色绿正好压在浅绿填充上，几乎看不见；
  亮色主题仍用主色绿。未达成的 `x/target` 与灰点保持 `T.muted`。隐藏成就卡右侧的「已达成」同理。
- **烟花画在卡片之上**（`celebration.draw` 放在列表之后、底部渐隐之前）—— 放在卡片下面会被完全挡住。
  烟花只是绘制、不注册任何命中区，所以滚动 / 长按拖动完全不受影响；透明度仍然很低，不压文字。
- **隐藏成就（列表最末一张卡）**：8 条跨游戏的成就，未达成时名字显示 `******` + 右侧「未达成」，
  达成后换成**橙色**真名 + 一行说明（行高 `HIDDEN_ROW_H = 34`，比普通行高）。卡片不参与拖动排序
  （`hitIndex` 命中隐藏卡返回 -1）。
  - 求知好学：25 个游戏的帮助弹窗都看过（`markHelp`，App 在 `scene.helpOpen` 首次为真时记一次）
  - 我已沉迷：游戏内累计时长 ≥ 1 小时（`addPlayMs`，每帧累加、满 3 秒或 `wx.onHide` 时落盘）
  - 锲而不舍：累计失败 ≥ 100 次（`markFail`，由 `audio.setLoseHook` 注入，不直接依赖 audio）
  - 我爱闯关：`HIDDEN_GAMES`（消除大师 / 连连看 / 消消乐 / 排序 / 滑行 / 麻将英雄 / 炼金术 / 雀圣 / 赌神）
    每个都至少有一个模式**通过第 10 关**（`bestClearedOf(id) >= HIDDEN_PASS_LEVEL`，阈值是**已通关数 10**，
    对应存档里 `best = 11` —— 别写成 11，那会差一关永远解锁不了）。走 LEGACY，老存档也算。
  - 再也不赌了：扑克英雄**单次猜大小输掉的奖金 > 10000**（`peak('poker','lost', bonus)`，
    在 `guess()` 的 `win < 0` 分支、清零 `bonus` 之前记录）
  - 赢上瘾了：任一游戏累计胜利 ≥ 800 次（`bestWinsOfAny`，走 `totalWins`，含历史推算）
  - 闯关英豪：任一闯关游戏关卡 ≥ 500 关（`bestClearedOfAny`，同样走 LEGACY）
  - 成就达人：`unlockedCount() >= 100`（25 张游戏卡 + 每日挑战 5 条的总解锁数；
    **不含隐藏成就自己**，否则会自指）。当前可解锁总数 121，100 这档留了余量。
  - 这些数据不进「成就总数 / 已入门」总览（那三个 chip 只统计 25 张游戏卡）。
  - **`contentHeight()` 必须把隐藏卡也算进去**（`+ cardHeight(hiddenCard()) + CARD_GAP`），
    否则滑到底时最后一张卡会被 ✕ / 底部标签压住；末尾的 84px 留白同时清开 ✕ 与提示行。
- **成就条数 2~8 条**：机制复杂的（关卡 + 连胜 + 分数）给 3~4 条，纯刷分的给 2 条就够，不必凑满；
  目前 **117 条**（炼金术 / 赌神 / 单人麻将 7 行最多，赌神 6 行，扑克 / 传奇 / 1A2B / 滑行 / 麻将英雄 / 雀圣 / 单人麻将 4~5 行），
  卡片高度按行数自动长（冒烟上限 8 行，`rows*22 + 16 + 6`）。
- **「完成第 N 关」一律走 `bestClearedOf(id)`**（= 各模式 `legacyCleared` 取最大，自动满足「任意模式达成即可」）：
  滑行 / 麻将英雄 / 雀圣 / 扑克炼金术各 2 条（**第 50 关 / 第 100 关**）。注意各游戏的上限：
  滑行 `CAP_LEVEL = 15` 之后盘面封顶、只继续收限时（160s 保底）；雀圣 `MAX_LEVEL = 20` 之后配置固定；
  所以 50 / 100 关是「能刷到」而不是「越来越难」，写文案时别暗示难度递增。
- **实时解锁提示**：`core/achv.js` 的 `setUnlockHook(fn)` + 一份 `knownUnlocks` 基线。
  每个写入口（`trackPlay / win / reach / bump`、隐藏成就的 `markHelp / markFail / flushTime`）改完存盘后
  调 `fireUnlocks()` → 取一次解锁快照、和基线 diff 出新增项、回调给 `App` 弹提示条
  （`notifyAchievements` → 同一个 `drawToast`，绿色 + ⚡图标，标题「达成成就」/「Achievement unlocked」）。
  **快照身份必须用稳定 key**（`<游戏 id>#<行号>`、`hidden#<key>`），**不能用名字** —— 名字会随语言变。
  `peak()` 在消除类里每消一组就调一次，**只打 `unlockDirty` 标记**，由 `App.frame` 每秒的
  `achv.sweepUnlocks()` 补查（也顺带兜住「场景直接写存档」的解锁）；第一次只建基线，不弹老存档。
  一次解锁多条只弹一条（`第一条 +N`）。快照内有「同一 key 只读一次」的读缓存，`sweep` 约 0.2ms。
- **成就行的顺序约定（两条，冒烟都会断言）**：
  1. **数量类在前、进度类在后** —— 指标行（`stat`）和计数型（`counter`，右侧显示「x 次」）都必须排在
     带 `x/target` 进度条的行之前。实现是 `SPEC` 定义之后统一做一次稳定重排（`Object.keys(SPEC)` 遍历，
     `qty.concat(prog)`），**加新成就时不用手动挪位置**；
  2. **「连胜」类排在「累计 N 胜」之前**（先看最高纪录、再看总量）—— 这两类都是进度类，
     所以重排后仍要保持这个先后。
- **成就设计原则**：别把 3 条都写成同一指标的三档（「1000 分 / 5000 分 / 20000 分」很偷懒）。
  优先混搭：**首次达成 → 里程碑（关卡/分数/连胜）→ 极限（最少步数 / 最短用时 / 最高难度）**；
  有「当前关卡」和「最高关卡」两个数据的游戏（连连看、滑行等）要分别体现。
- **左侧成绩行（`stats()`）写法**：紧凑前缀 + 值 + 单位，约 12 个汉字宽以内，例如
  `最佳 12 步 · 胜 7`、`当前 12 关 · 最高 15 关`、`最高分 34 · 6 局`、`闯关 8 · 无尽 1200`。
  - 0 / 空数据一律显示 `—`（用 `V()` / `lvOf()` / `withUnit()`），不要出现「最佳 0 关」「— 连胜」；
  - 有胜场就带 `· 胜 N`（`winTag()`）；
  - **`best = 已通关 + 1` 的游戏（link / crush / detective / hunter / gambler）必须用 `cleared()` 换算**，
    否则成就档位会整整差一关（踩过：侦探「通关第 5 关」其实通关 4 关就解锁）。
  - **会重置的 key 不能直接当成就指标**：`level` / `state.level` 这类「当前关」开新游戏会回到 1，
    直接读会让人已解锁的成就倒退。`achv.win(id, { level })` 会记一份历史最高关卡（`bestLevel`），
    master / quesheng / slide 已经在胜利时传了 level；新游戏若有同样的 key，记得也传。
  - 成就 milestone 要「可能达成」：click 早期写过「剩余步数 = n²」，但 score = 上限 − 点击数，至少点一次，
    永远达不到；改成「挑战难度 8」（该难度 best > 0 即视作通关过）。
- **数据来源**：能读存档就优先读（`best` / `level` / `streak` / 秒数），存档里没有的才自己记。
  `__games_hub__achv`（**v2**）= `{ v, plays, wins, bestLevel, perfect, fast, modes, reach, peak, counters, help, timeMs, fails, seen }`
  （后三个是隐藏成就用的：看过帮助的游戏、累计游戏毫秒数、累计失败次数）：
  - 对局：`App.openGame()` → `achv.trackPlay(id)`
  - 胜利：`achv.win(id, { level, mode, perfect, fast })`（全部可选）—— 21 个有胜场的游戏都接了：
    click / guess / poker / puzzle / g2048 / match / link / detective / hunter / crush / sudoku /
    master / sort / slide / alchemy / mahjong / quesheng / mirror / point24 / solo / gambler
    - `level`：本局关卡（1 基）→ 记 `bestLevel` + `modes[id][mode].max / .first`
    - `mode`：模式号 / 难度号 → `modes[id][mode].wins` 分开统计
    - `perfect`：完美操作（见下）
    - `fast`：速通（目前只有 1A2B ≤4 次猜中）
  - 里程碑：`achv.reach(id, value, [1024, 2048, 4096])` —— 2048 在**判负那一帧**、Threes 在
    **无法移动那一帧**各调一次；`reach` 里对每个 ≤ value 的阈值 +1 次。
  - **snake / three / down / legend 没有胜利态**（无尽刷分），成就走分数 / 里程碑 / 对局数，不要硬塞 `win()`。
- **历史成绩推算（老玩家不能吃亏）**：成就系统是后加的，老玩家的 `modes` / `wins` 是空的，
  但存档里已有成绩 —— 只要记录能证明「打过第 N 关」，对应成就就算达成。统一走 `achv.js` 的 `LEGACY` 表：
  - 证据：`best`（= 已通关数 + 1）、`level`（**1 基**游戏 → 当前关 = 已通关 + 1；**0 基**游戏 → 当前关 = 已通关）、
    自己记的 `modes[id][slot].max`，三者取最大得到 `legacyCleared(id, slot)`。
  - 「首关 / 最高关 / 达成 N 关 / 两种模式首胜」都用 `modeFirstCount` / `modeTopCount` / `modeLevelCount`，
    它们内部只读 `LEGACY`，别再传 key 列表（会分叉）。
  - 「累计胜利次数」用 `totalWins(id)` = max(自己记的胜场, 各模式通关数之和)。
  - 里程碑计数（2048 / Threes / 蛇 / 下坠 / 传奇）用 `reachCount(id, 阈值, bestKey)`：
    最高分/最大牌到过这一档就至少记 1 次。
  - master 的 `level` 写的是「刚通关的那一关」，默认值也是 1，分不清「没玩过」和「通了第 1 关」，
    所以额外读 `state.phase === 'won'` 才按 `level` 直接算通关数。
  - 新增「按模式/难度」的成就时，先往 `LEGACY` 里补一行（best / level / caps / levelBase），
    成就定义里直接用 helper，**不要**现场读某个 key。
- **计数型成就**：`A(name, en, fn, { counter: true })` —— 解锁条件是 `value >= 1`，右侧显示「x 次」
  而不是 `x/target`（「累计胜利次数」「达成 2048 x 次」这类）。普通成就才用 target 进度。
- **指标行**：`A(name, en, fn, { stat: true, unit: 'achvLv' })` —— 只显示「数值 + 单位」，**没有进度条**、
  不算成就解锁（`ratio` 恒为 0，`target` 恒为 1）。适合「最高资产 / 最大单次得分 / 最长连胜」这类
  有数值但没目标的口径；一个游戏可以全是指标行（麻将英雄）。
  任意峰值用 `peak(id, field, value)` / `peakOf`，任意计数用 `bump(id, field)` / `countOf`。
- **9 个游戏的口径（2026-11 定稿）**：
  - 关灯：**累计 100 胜 / 累计 500 胜** / 所有难度通关 n/8 / 完美操作胜利（计数）。
    （2026-11 起，「累计胜利次数」这种只显示次数的计数行**在全部 25 款里都删掉了**，统一改成
    100 / 500 胜两档：关灯 / 侦探 / 猎手 / 连连看 / 消消乐 / 消除大师 / 滑行 / 对对碰 / 排序 ——
    都用 `totalWins()`，**不分难度、胜利就算**，老存档的通关关数也算胜场。）
    **完美 = 全程没用撤销-重做，且没开上帝模式**；开了上帝模式的胜利**整局都不计入**。
    难度维度记在 `modes[id][难度]`，老玩家用「该难度 best > 0」补齐。
  - 对对碰：三模式首关通关 n/3 / 三模式最高关通关 n/3（最高关 = 11）/ **累计 100 胜 / 500 胜** / 完美操作。
    **完美 = 整局零次配对失败**（`this.mistakes`）。老玩家用 `best = 通关+1` 换算。
  - 侦探 / 猎手：三模式首关 / 三模式最高关（侦探 [9,10,9]、猎手 [6,6,6]）/ **累计 100 胜 / 500 胜**。
  - 消除大师：三模式首关 / 三模式达成 10 关 / 三模式达成 100 关 / **累计 100 胜 / 500 胜**。
    master 的 `level` 默认也是 1，所以「首关」要靠 `state.phase === 'won'` 才认 `level`（见上面的历史推算）。
  - 24 点 / 1A2B：**第一行是「最长连胜」指标行**（读 `__point24__best_streak` / `__guess_number__best`），
    紧跟 **达成 10 连胜 / 达成 30 连胜**（同一个 key，2026-11 新增），再是**累计 100 / 500 胜**
    （「累计 10 胜」门槛太低，已删）；1A2B 额外「天选之子」（≤4 次猜中，计数）。成绩行只写「胜 M」。
  - 2048 / Threes：最高分 + 达成阈值次数（2048: 1024/2048/4096；Threes: 2000/10000/30000）。
    2048 的「分数」就是盘面最大牌（游戏内也是这么显示的）。
  - 贪吃蛇 / 下坠：最高分 + 达成阈值次数（蛇 100/500/1000；下坠 50/100/1000）。
    两款都**没有胜场**，阈值只在「一局结束」那一帧 `reach()`。
  - 连连看 / 消消乐：最高关卡 + 完成第 10/50/100 关 + **累计 100 胜 / 500 胜**（`totalWins`，关卡通关也算胜场）。
    关卡上限写着 30（连连看）/ 封顶后仍可继续（消消乐），所以 50 / 100 关是**可达**的，别再改成 30。
  - 数字迷宫（难度 3~6）/ 镜像（难度 1~5）/ 数独（难度 1~3）：所有难度通关 n/N + 累计胜场
    （数独是 50 / 100，迷宫与镜像是 100 / 500 —— **都删掉了 10 胜这一档**）。难度维度记在 `modes[id][难度]`。
    数独额外两条 **中等 / 困难难度 0 错误获胜**（计数型，英文标题只写 `Medium · no mistakes` / `Hard · no mistakes`，
    不要写 `win with no mistakes`）；0 错误 = `this.hearts === this.difficulty`
    （每填错一次扣一颗心，清空格子也不回心），通关那一帧 `achv.bump('sudoku','clean2'|'clean3')`；
    `hearts` 会写进存档，恢复局面后继续玩不会白送。
  - 排序：两种模式首胜 n/2 + **累计 100 / 500 胜** + **完成第 50 / 100 关（`bestClearedOf('sort')`，两种模式任一）**
    + **累计 100 / 500 胜**（2026-11 新增，共 6 行）；成绩行「单槽 N 关 · 双槽 M 关」。
    `MAX_LEVEL = 30` 之后关卡配置固定为最后一步（48 张），所以 50 / 100 关是「能刷到」。
  - 滑行：无重排获胜（`perfect` = 本关没用过死局重排）+ **累计 100 胜 / 500 胜** + 完成第 50 / 100 关。
  - 扑克英雄：最高资产 / 单次最高奖金 / 猜大小最长连胜（**指标行**）+ 四条 / 同花顺达成次数（计数）。
    `peak('poker','payout'|'gstreak')` 在结算 / 每次猜大小处更新；
    `bump('poker','four'|'flush')` 在 **`resolveHand()` 评牌时**（猜大小之前）按牌型 +1 ——
    之后猜大小输了也算达成，别等 `settle()`；`resolveHand(silent=true)`（恢复存档）不重复记。
  - 麻将英雄：最高关卡 / 无尽模式最高分 / 最大单次得分（3 条**指标行**，没有进度型成就）。
    `peak('mahjong','gained')` 每次消除记最大单次得分。
  - 单人麻将：最长连胜（指标行）+ 5 次摸牌内获胜（计数）+ **达成 10 连胜 / 达成 30 连胜**
    + 累计 100 胜 / 累计 500 胜 / 累计对局 1000 局（共 7 行）。连胜取
    `max(__solo__best_streak, peakOf('solo','streak'))`，老存档也认。
    **这款没有关卡概念**（存档只有 `__solo__state|streak|best_streak`），
    所以没有「最高关卡」——「累计对局」用 `playsOf('solo')`。
  - 扑克炼金术：两种模式首胜 n/2 + 普通/炸金花各自的最高关卡、最大单次得分（4 条指标行）。
  - 雀圣：两种模式首胜 n/2 + 滑底（mode 1）/ 步进（mode 2）最高关卡。
  - 麻将传奇：最高得分（指标行）+ 1000 / 5000 / 10000 分达成次数 + 字牌消除次数。
    得分在 `gameOver()` 用 `reach('legend', score, […])` 上报。
  - 赌神：**第一行是「最长连胜」指标行**（`gamblerStreak()`：两种模式的 peak 与各自存档取最大），
    紧跟 **达成 10 连胜 / 达成 30 连胜**（同一个 helper，**不区分模式**），再是即时 / 提交各自的最高关卡，
    最后 **累计 100 胜 / 累计 500 胜**（`totalWins()`，同样不区分模式），共 7 行。
    2026-11 删掉了「两种模式首胜」和分模式的「即时 / 提交最长连胜」。
- **成就指标口径**（调研过，改之前先看清）：
  - `best_1` 里的 1 是「存档位 / 模式号」，不是第一名：`__emoji_match__best_1(_2|_3)`、`__emoji_link__best_1`、
    `__mahjong_hero__best_1`（闯关）/ `best_2`（无尽）、`__poker_alchemy__best_1(_2)`。
  - 有的 `best` 是「已通关 + 1」，有的是「已开始的最高关」，别统一 `>= N` 就完事（文案要和语义对得上）。
  - 数独 / 镜像的 best 是**秒**（越小越好），`puzzle` 是**步数**（越小越好）—— 这类用 `A(..., { lte: true })`。
  - click 的 best 只在「破纪录且 >0」时写，所以「首次通关」只能靠 `wins` 计数，不能靠 best 有没有值。
- **庆祝背景**：`AchvPage` 自带 `Celebration` —— 22 颗上升碎金 + 每 0.7~1.5s 一朵小礼花（≤4 朵同屏，
  低透明度画在**卡片上方**（卡片半透明 + 烟花在上，氛围才出得来）；禁止写字 / 贴图，别加高亮闪烁。
- 冒烟断言：25 个游戏都有名字（不能退化成 id）、每个 1~3 条成就、target 合法、总览数量自洽、
  `trackPlay` / `win` 计数 +1、成就页展开后 `achv-close` / `achv-mask` 都在、滚动会被夹住、收起归零、
  拖动换位（`moveItem`）+ 顺序落盘读回 + 拖动状态下渲染不抛错、
  拖动产生位移、松手有惯性且会衰减停下、惯性不会滚过末端、
  分模式胜场 / 首关 / 完美 / 速通 / 里程碑计数都对得上、计数型成就 target 恒为 1、
  历史成绩推算（只给存档不给 achv 记录时，侦探首关 / 对对碰关卡 / 2048 里程碑都要能认定）。

## 每日挑战（`core/daily.js` + `home/daily-page.js`）

- **入口**：首页齿轮左边依次是 **每日挑战 → 成就 → 设置** 三枚 FAB（各 48px、间距 12）。
  每日挑战按钮：**外圈固定蓝色**（暗 `#38bdf8` / 亮 `#0ea5e9`，和游戏内「模式切换」FAB 的蓝同一套）、
  里面是手绘日历；当天没完成时右上角有红点（和成就的新解锁红点同款），红点消失即代表今天已完成。
- **抽题**：`daily.ensureToday()` 在 `App` 启动时调用；同一天重复调用不会换题，隔天才 roll，
  并把昨天的结果归档进 `days`。**最近 5 天的任务 id 不参与抽签**（`recent` 只留 5 条）。
- **中英双语**：任务池每条都有 `cn` / `en`，取文案统一走 `daily.descOf(task)`（内部按 `i18n.lang` 选，
  ⚠️ 不是 `i18n.language`）；月历标题 `monthData().title` 也是 `Nov 2026` / `2026 年 11 月` 两套，
  星期行用 `dailyWeek`（`一二三四五六日` / `MTWTFSS`）。其余标签全走 `t('daily*')`。
- **任务池 40 条**，覆盖 25 个游戏（`POOL`）。任务字段：`{ id, game, kind, need, field?, cn, en }`，
  `game: '*'` 表示任意游戏；`kind` 有 `play / win / perfect / fast / level / reach / bump / peak`。
- **判定挂成就埋点**（不碰 25 个场景）：`core/achv.js` 在 `trackPlay / win / reach / peak / bump`
  里调 `daily.report(gameId, kind, payload)`；`level` 用 `payload.value` 比较，计数类每次 +1。
- **完成反馈**：`daily.setOnComplete()` 由 `App` 注入 → `App.notifyDaily(task)`（提示条与成就解锁共用
  `App.pushToast` 队列，一次显示一条、3.2s 后换下一条）：
  顶部一条 **84px** 提示（「恭喜完成今日挑战」+ 任务名），滑入 / 淡出共 **3.2 秒** + 全屏烟花 + 成功音效。
  **底色完全不透明**（暗 `#2f2f31` / 亮 `#ffffff`）+ 1.2px 橙色描边 + 深阴影 —— 压在花花绿绿的游戏画面上也要看清；
  左边 4px 橙色竖条、36px 圆形对钩图标、标题 15px 加粗、任务名 11.5px。宽度 `min(W-36, 340)`、圆角 18。
  提示**不注册任何按钮**，不打断操作；画在场景之后（帮助 / 二次确认面板仍会盖住它）。
- **面板**：上半是今日挑战卡（任务文案 + 状态行；**完成时整卡变浅橙、左侧胶囊写「已完成」——全卡只写这一次**，
  右侧原来的重复文字已删，未完成时才在右侧画进度条），下半是月历卡
  （周一起的 6×7 网格：达成 = 绿圆白字、今天 = 橙圈、未来 = 淡字）。
  **月历是紧凑版**：`MONTH_HEAD = 40` + `WEEK_H = 22` + 6 行 × `ROW_H = 24`（放不下才压到最小 18），
  卡高约 228px，不再撑满剩余屏幕；底部提示紧贴月历卡（`monthY + monthH + 18`），不贴屏幕底。
  头部两个箭头切月，**不能切到未来**；月历区左右滑动也能切（`dailySwipe`，阈值 44px）。
  **切月是「滑动替换」动画**（`DailyPage.slide`：`{ from, dir, at, dur: 260ms }`，ease-in-out）：
  卡片本身和背景不动，旧月向左（或右）滑出、新月从另一侧滑进来，两个月**同时在场**、横向错开、
  各自的 alpha 跟着进度 1→0 / 0→1，整体 `clip` 在月历卡的圆角内。
  箭头 和 滑动 两条入口都走 `shiftDailyMonth()`，都会带方向触发同一个动画。
  顶部两个 chip 里的「本月达成」用 `pageData().thisMonthDone`（当前自然月），翻看历史月份时不会跟着变。
  关闭 ✕ 画在设置齿轮那一格；**边缘内滑也能关**（`overlayOpen()` / `closeOverlay()` 已包含 `dailyOpen`）。
- **难度校准**：所有任务都要「当天一局或几局能做完」。当前偏难的几条已经降过档：
  猜大小连中 **3** 次（不是 5）、2048 最高牌 **512**、麻将传奇 **3000** 分、任意游戏赢 **4** 局。
  再加任务时按这个量级估，别写「连中 5 次」这种靠运气的。
- **不要写「要回到某一关」的任务**：连连看 / 消消乐 / 消除大师 / 麻将英雄的关卡只能往前，
  玩家已经过了第 6 关就回不去（重开一局又得从头爬）。`kind: 'level'` 的实现还留着，但池子里
  **一条都不用**；涉及关卡的游戏一律用「赢一局 / 赢 N 局」这种随时能做的口径。
- **分数 / 里程碑类任务必须是「今天开的一局」**：老存档里已经有 2048 块 1024 的玩家，
  不能一进游戏就白送「最高牌到 512」。实现：
  - 场景里开始**新的一局**时调 `daily.markNewRun(id)`（g2048 / three / snake / down 在 `startGame()`、
    legend 在 `startNewRun()`；`restore()` 走的恢复路径**不调**）；
  - `daily.report(id, 'reach', …)` 只有在 `cur.runs[id]` 为真时才计数；
  - `kind: 'run'`（「开一局新的 2048」）在 `markNewRun` 时当场完成。
  - 文案统一写成「开一局新的 X，达到 …」，别写「X：单局 50 分」这种含糊说法。
- **太靠运气的任务不要**：已删掉「滑行：不用死局重排赢一局」「扑克：拿到四条」；池子 **40 条**。
- **面板背景要不透明**：先 `fillStyle = T.bg` 铺满整屏，再叠一层淡暖色渐变；
  只画渐变不铺底的话，首页蜂窝会透上来，文字看不清（踩过）。
- **能提前判定的就在场景里直接上报**：2048（合并出新高牌）、贪吃蛇（吃一口）、下坠（消一排）
  调 `daily.report(game, 'reach', { value })`，不必等一局结束的 `achv.reach`。
- **任务下线自愈**：`healToday()` —— 今天这条不在 `POOL` 里时，没完成就重抽一条，已完成就保留并打 `retired`
  标记（标记要持久化，否则每帧都写存档）。改 `POOL` 的 id / 删任务不用清存档。
- **累计次数**用独立字段 `total`（`days` 只留 400 天，数不准）；老存档在 `finish()` 里用已有完成天数垫底再 +1。
- 存储 `__games_hub__daily`：`{ v, total, cur:{date,id,prog,done,doneAt,retired,runs}, days:{ 'YYYY-MM-DD': {id,done,prog,at} }, recent:[id×5] }`。

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

## 震动反馈（`core/haptics.js`）

- **独立开关**：`__games_hub__haptic`（默认开），首页设置面板第二行；与音效开关**互不影响**
  （音效静音时震动照旧；关震动不影响音效）。`haptics.enabled` / `setEnabled(on)`。
- **语义点跟音效对齐**（因为音效调用本身就是「语义点」，见上面的音效接入点）：
  `core/audio.js` 里 `playSuccess` → `haptics.success()`（medium）、`playFail` → `fail()`（medium, 90ms 窗口）、
  `playLose` → `fail()`、`playFirework` → `heavy()`、`playElimination` → `tap()`（light）。
  **不要**在 25 个场景里各写一遍震动；也别把震动塞进 `play()`，因为 `play()` 会被静音拦掉。
- **节流 45ms**：连击 / 连消时不会一直震（`ELIM_REPLACE_MS` 的烟花替换规则也一并继承）。
- `wx.vibrateShort({ type })` 在部分基础库不支持 `type`，包在 try/catch 里、返回 Promise 也 `catch` 掉；
  震动失败绝不影响游戏。冒烟断言：三个语义点各震一次、音效关掉仍震、关开关后完全不震、连续两次只震一次、
  设置面板里点开关真的改存档。

## 结算分享（`core/share.js`）

- **入口位置：25 个游戏全部画在结算面板自己的右上角**（`96×28`、**胭脂红 `#962832`**（`ROSE`）
  实心 + 白色「炫耀一下」+ 图标）。实现统一走两个 helper：
  - `share.resultPanel(c, scene, top, height, { radius, color, share })` —— **宽度自动等于游戏卡片宽**
    （`scene.cw`，没有就 `min(W-32, 440)`），铺遮罩 + 右上角分享入口，**返回面板矩形**；
    23 个游戏直接用它替换原来那块「棋盘大小」的遮罩（`match / link / hunter / master / sudoku / slide /
    alchemy / mirror / down / snake / guess / g2048 / three / sort / point24 / solo / puzzle / crush /
    mahjong / quesheng / legend / gambler / click`）。
  - `share.drawResultChip(c, scene, rect, { filled: true, label: t('app.shareCta') })` —— 需要自定义面板时用：
    侦探（`resultRect()` 自己算）、扑克（牌桌结果遮罩是 `clip + fillRect`，在遮罩上单独画一枚）。
  - 场景注册了 `share-result` 之后，`App` **不再**画兜底那一枚（`hasOwn` 判断）。
  - ⚠️ 面板**只加宽、不改高**：高度继续用各游戏原来的棋盘 / 牌桌范围，所以内容（标题、按钮、分数）
    一行都不用挪；分享入口固定落在面板右上角，冒烟会断言它**不压住**面板里任何别的按钮。
  **兜底**（万一某个场景没注册自己的入口）：`App` 画在右上角 `SAFE_TOP + 44`（96×26）——
  注意**不能**放 `SAFE_TOP + 6`，那里被微信胶囊（关闭 / 更多）压住（踩过）。
  冒烟断言：兜底矩形与 25 个场景的按钮**零重叠**（375/667、320/568、390/844 都验过）。
  - **按钮图标**：图标字体里没有 `share`，`share.drawShareIcon()` 用 canvas 画「盒子 + 向上的箭头」，
    和文字组合居中；`drawResultChip()` 返回 `{ icon, label, rect }`，冒烟据此断言画了图标。
- **结果态判断** `share.shouldShowChip(scene, gameId)`：`scene.phase` 属于
  `won / over / lost / lose / win / draw / finished`，或 `scene.result` 是这些字符串 / 1A2B 的 1|2；
  帮助或二次确认面板打开时不显示。新增游戏只要沿用这些 phase 命名就自动有入口。
- **海报 = 整屏截图（contain，居中）+ 主题底色背景 + 两侧文字**（**600×480**，5:4）：
  `App` 通过 `share.setCapture()` 注入 `paintSceneForPoster(c, x, y, w, h, opts)`：
  - **背景不用游戏画面**（踩过：拿同一张截图 cover 铺底，和中间的截图重复、看着像重影）——
    改成和页面同色系的**渐变底 + 中间一团柔光**（亮 `#fbf8ef→#e4ddc9`、暗 `#18211e→#0e1413`）；
  - 前景按 contain 画：整屏完整显示、**水平垂直都居中**，不裁切不拉伸；`opts.cover` 仍保留但不再使用。
  **海报 / 截图一律包含结算遮罩**（不再把 `drawResult` / `drawWin` 换成空函数 —— 那是旧行为，
  玩家反馈「胜利遮罩没进截图」）：而且结算遮罩有 200ms 出现延时（`Scene.resultVisible`），
  截图时会把 `scene.resultVisible` 临时换成 `() => true`、截完再恢复（有些场景传的是自定义 key，
  改 `_resultGateAt` 会被 key 变化重置，换方法才稳），所以**刚赢下那一瞬间**生成的图里也有遮罩。
  文字配色跟主题走（暗：白字 / 浅玫瑰成绩；亮：深字 / 胭脂红成绩；标签用主色绿系），
  海报缓存键含 `theme.dark`，切主题会重画。
  ⚠️ **截图必须居中**：贴在左边看起来像整张图偏了（踩过）。宽度上限 `POSTER_W * 0.56`，
  两侧各留 ~22% 放文字：左边「游戏合集 · 25 款」标签 + 两行「来挑战 / 我的成绩」，
  右边「游戏名 + 大字成绩」，文字放不下自动缩字号。左右留白必须相等（冒烟断言 ≤1px 偏差）。
  拿不到截图（没有离屏画布 / render 抛错）时才退回纯渐变底。
  ⚠️ 以前整屏按 cover 铺，**上下被裁掉一大截**（只剩分数区和按钮）—— 必须 contain 保留完整界面，
  两侧用同一张画面压暗补底；这样 390×844 的屏幕在 600×480 里占约 203×440（≈31% 面积）。
  ⚠️ **必须在结算出现时预生成**（`App` 每帧调，靠 gameId+文案去重），不能等点击时才生成。
- **预览弹窗**（`openPreview()` / `drawPreview()`）：点入口**先弹预览**（半透明遮罩 + 弹窗卡：
  5:4 海报图 + 标题 + **取消 / 去分享**），点「去分享」才调 `sendResult()`；
  - 尺寸常量在 `PV` 里：**按钮高 42**（34 太矮不好点）、**取消 : 去分享 = 1 : 3**（`btnSplit = 0.25`，
    「去分享」才是主操作，用胭脂红实心）、**卡片上下留白都是 18**（`padTop`，底部不再多空一截）。
  点「取消」/ 点遮罩关闭，不分享。预览的命中区在 `scene.buttons` 里**最后注册**（全屏 `share-mask`
  先注册、取消 / 去分享后注册），所以能压住场景自己的按钮、也不会被遮罩吞掉。
  这样「去分享」是**直接的用户手势**，不依赖异步生成的时机。
- **海报右侧文案**（`posterBody()`）：
  - **实时分享**：游戏名 + **一句玩法**（`share.js` 里的 `INTRO` 表，中英各一行；25 个游戏都在里面，
    不用动各游戏的 i18n）+ 可选 `extra` 统计行；
    **中文 ≤30 字、英文 ≤90 字符**，只写「怎么操作 + 怎么赢」，别抄帮助里的数值表
    （冒烟会静态检查长度和 25 个 id 覆盖率）。文案必须和实际规则一致 —— 曾把 click 写成「点亮所有灯」，
    实际是「全部关掉」，被玩家指出；
  - **结算分享**：游戏名 + **这局成绩**（`resultLine()`），不写玩法；
  - **首页四个面板**：标题换成「游戏合集 / 每日挑战 / 成就殿堂 / 设置」，配各自的介绍一行；
    每日挑战多一行「连续 N 天 · 累计 M 次」，成就多一行「已解锁 x/y」（`App.shareExtras()`）。
- **分享文案**：`resultLine()` 优先用 `scene.shareLine`（游戏自己写），否则按
  `score → points → cash`（`本局 {n} 分`）、`level`（`第 {n} 关`）、`moves / clicks`（`{n} 步完成`）、
  `streak`（`{n} 连胜`）依次兜底，模板都在 `app.shareLine*`（中英都有），所以 25 个游戏不用各写一遍。
- **标题用游戏名**：`resultTitle(gameId, line)` = `游戏名 · 第 N 关 / 本局 N 分`
  （例如「侦探 · 第 3 关」），**不用合集统称「蜂窝益智二十五」**；右上角菜单的分享标题也跟着当前场景走
  （`App.setSceneId()` 里调 `share.syncMenu()`，以前只在 onShow / 切语言时同步，分享出去一直是首页标题）。
- **海报导出（真机最容易错的一步）**：小游戏里 **没有 `wx.canvasToTempFilePath`**（那是小程序的页面 canvas API），
  官方做法是在 Canvas 对象上调用 `toTempFilePathSync()` / `toTempFilePath()`：
  ```js
  const path = canvas.toTempFilePathSync({ destWidth, destHeight, fileType: 'jpg', quality: 0.92 });
  ```
  `exportPoster()` 的优先级：`cv.toTempFilePathSync` → `cv.toTempFilePath`（异步）→ `wx.canvasToTempFilePath`（兜底，
  只有部分基础库/开发者工具有）。导出失败会打 `console.warn('[share] 海报导出失败：', 方式, 原因)`，
  并把 `exported / exportError` 记在 `poster` 上（`share.posterInfo()` 可查）。
  ⚠️ 用错 API 的症状非常迷惑：**预览里的画布是对的，分享出去却是微信默认图**（因为 `imageUrl` 一直是空的）。
- **发送** `sendResult()`：`wx.shareAppMessage({ title, query: 'game=<id>', imageUrl })`。
  ⚠️ **分享卡片图 = 这张海报**，所以有两条必须做对，否则真机上看到的是微信默认截图（"还是旧的那张"）：
  1. 菜单分享（`syncMenu()` 注册的 `onShareAppMessage` / `onShareTimeline`）也要带 `imageUrl`
     （`poster.path` 且 `poster.gameId` 与当前场景一致时才带）；
  2. 预览里的「去分享」必须**等 `poster.path` 出来**才可点（灰色 + 「正在生成分享图…」）；
     导出**明确失败**（`poster.exportError`）时改成「分享图生成失败，可直接分享标题」并允许只发标题，
     只有「还在等」的情况才在 2.5s 后降级 —— 不允许悄悄用默认图冒充。
  **不做「分享得奖励」**：微信判定诱导分享会封。

## 结算数字滚动（`core/draw.js` 的 `countUp`）

- `D.countUp(value, at, dur)`：从 0 滚到最终值（`1 - (1-t)^2.2` 收尾），`at` 传结算开始时刻。
  结算遮罩里直接用基类的 `this._resultGateAt` 当起点（`resultVisible()` 每次返回同一个值，天然稳定）。
- 已接：下坠 / 麻将传奇 / 2048（`D.countUp(this.score, this._resultGateAt, 260)`）；
  新游戏要接就是替换那一处 `String(this.score)`，`at` 为 0 时退化成直接显示最终值。

## 底部控件与 FAB

- **尺寸统一 `fabKit.SIZE = 44`**：首页三枚（每日挑战 / 成就 / 设置）与游戏内的帮助 / 静音 / 模式（开关）/ 分享，
  全部 44×44。各场景的 `this.fabSize`、`FAB_SIZE` 常量、`helpFab` / `helpRect` 都从 `fabKit.SIZE` 取，
  **不要再写字面量 40 / 48**（原来 40/44/48 三种混着用）。
- **边框是按钮自己的一部分**（`App.drawFabRings()` 已删除，不再「先画按钮、事后补一圈」）：
  - `fabKit.draw(scene, c, rect, { id, icon, fallback, color, onTap })` 一次画完**底色 + 边框 + 图标**；
  - 自己画圆的场景用 `fabKit.stroke(c, cx, cy, r, fabKit.borderOf(kind))` 紧跟在 fill 之后描边；
  - 颜色规则（`fabKit.borderOf`）：帮助 = **橙**（`T.god`）、静音 = **绿**（`T.primary`）、
    模式 / 开关（机器人 / 穿墙 / 骰子…）= **蓝**（暗 `#38bdf8` / 亮 `#0ea5e9`）、分享 = **胭脂红**（`#962832`）；
  - 边框贴边描（线宽 2 → 覆盖 r-2..r），和按钮同色闭合，看起来就是按钮自己的边。
  - id 约定：`help` / `fab-help` / `help-fab` / `fab-mute` / `mode` / `fab-mode*` / `fab-share`。
- **左下角「分享」FAB = 全局唯一一颗**（`App.drawShareFab`）：26 个界面（首页 + 25 个游戏）常驻，
  坐标 `x = 16, y = H - SAFE_BOTTOM - 16 - 44`。**任何界面 / 弹窗打开时都在**（帮助、二次确认、首页的
  设置 / 成就 / 每日挑战），因为它画在 `help.draw` / `confirm.draw` **之后**、命中区**最后注册**，
  所以永远在最上层；只有「预览弹窗开着」和「转场动画中」隐藏（那两种情况下会盖住弹窗或跟着抖）。
  - 点是**当前画面的实时截图**（`share.openPreview(scene, id, { live: true, extra })`），
    与结算分享走同一条预览 / 取消 / 去分享链路；
  - **每次点都必须重拍**：`openPreview` 调 `buildPoster(..., { force: true })` 跳过海报缓存
    （缓存键只含 gameId / 文案 / 主题 / 源尺寸，界面上玩几步这些都没变，不 force 就会一直看到第一次的图）。
    每帧预生成的结算海报仍然走缓存，不要给它加 force；
  - live 截图**连结算遮罩、帮助弹窗、二次确认、首页各面板一起截**（`paintSceneForPoster` 的 `opts.live`），
    其中帮助面板会先 `help.forceOpen(scene)` 强制按「完全展开」画（否则动画第 0 帧什么都没有）；
  - **截图裁剪**（`App.captureSize()`）：顶部 `sy = max(0, min(SAFE_TOP, 60) - 24)`
    （**不要裁满安全区**，否则标题贴到图片上缘），再兜一层「标题栏那排按钮上方 ≥22px」；
    海报里截图还**四周各收 4%**（`fgW *= 0.92`），所以 SAFE_TOP=0 的机型也有一圈边距；
    底部按**最低的那个小按钮**（`h ≤ 0.35H`、`w ≤ 0.9W`，全屏遮罩 / 大棋盘不算）再 **+12px**，
    `cropBottom = min(H, lowest + 12)`。**不要按 `SAFE_BOTTOM` 硬留** —— 那会在 FAB 行下面剩一截纯背景（灰边）。
  - 截图的源尺寸每帧通过 `share.setSource(sw, sh)` 同步给海报，**海报的 contain 比例必须用它**
    （不是 `W/H`），否则圆角里会留一条空白；缓存键也带 `srcKey`。
  - 冒烟断言：26 个界面都能画出来、尺寸 44、在最左侧（x ≤ 40）、不与任何已有按钮重叠；
    其余 FAB（`fab-*` / `help` / `robot` / `wall` / `mode`）尺寸也必须是 44。
- **帮助 FAB 的小红点**（`App.drawHelpDot`）：这个游戏的帮助**没看过**时，在帮助按钮右上角
  （`x + w*0.84, y + h*0.16`，半径 4.2，`T.god`）画一个和「每日挑战未完成」同款的小红点；
  打开过一次就没了（`App` 在 `helpOpen` 变真时调 `achv.markHelp(id)` 落盘，**永久**消失）。
  状态来自 `achv.seenHelp(id)`（`__games_hub__achv` 的 `help` 字段）；问号 / 麻将传奇还认各自的老 key
  （`__quesheng__help_showed` / `__mahjong_legend__help_showed`），老玩家不会突然冒一堆红点。
  帮助面板打开着、二次确认中、首页都不画。
- **每个 FAB 都必须真的描上边**：冒烟按「按钮圆心处的描边颜色」断言 —— 帮助 `T.god`、静音 `T.primary`、
  模式 / 开关蓝、分享胭脂红。自己画圆的场景**别忘了 `fabKit.stroke`**（point24 / poker / slide 就漏过）。
  首页三枚 FAB 的环也统一 `r - 1`：每日挑战蓝、设置橙、奖杯「先画淡色轨道再叠进度弧」——**0 进度也要有边**。


## 1A2B 键盘（每行 5 个）

- 第一行 **1 2 3 4 退格**、第二行 **5 6 7 8 提交**；第 5 列是操作键，比数字键**宽 1.35 倍**
  （所以数字键反而略小）。分两行后**第三行只放 FAB**（静音 / 机器人 / 帮助），退格 / 提交不再和 FAB 同行。
- 冒烟断言：数字键 8 个、键盘正好 2 行、第一行 4 个数字键、退格 / 提交都比数字键宽、互不重叠。

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
  没有背景音乐资源，因此**不画「背景音乐」开关**（web 有）；开关卡是**两行**：
  「游戏音效」（`__games_hub__sfx`）和「震动反馈」（`__games_hub__haptic`），都即时生效、无保存按钮；
  开关卡高度 `blockPadY*2 + switchRowH*2 + 8`（两行各 56 + 8 间距），行 y 依次 +64；图标字体没有震动图标，
  用 `bolt` 表示体感反馈、靠底色区分开关。
- 六边形用 `hexPath` 双层（外主色、内白卡），卡片区域整个可点。
- 首页构造时 `tiles.preload()` 预加载麻将雪碧图，进对对碰麻将模式不再先闪空白。
- **边缘内滑关闭面板**：屏幕左右各 20px 的区域内向内滑 ≥72px（竖直偏移 ≤40px）= 关闭设置 / 成就面板，
  由 `App.startEdgeSwipe()` / `moveEdgeSwipe()` 统一处理，场景只需提供 `overlayOpen()` / `closeOverlay()`
  （`HomeScene` 已实现）。首页没有面板打开时**完全不拦**边缘手势，游戏内则是「回到首页」。
  ⚠️ **安卓的全面屏手势（vivo 等「边缘返回」）拦不到**：那次滑动由系统 / 微信在触摸到达 canvas 之前消费，
  小游戏没有对应 API（小游戏 API 里只有 `wx.exitMiniProgram` 这类，没有禁用返回手势的接口）。
  能做的只有：面板内提供多种关闭方式（✕ / 点遮罩 / 边缘内滑），或在用户把导航方式改成三键时自然可用。
- 右下角有**三枚** FAB，从左到右：**每日挑战 → 奖杯（成就）→ 齿轮（设置）**，各 48px、间距 12。
  三枚都是 `T.card` 圆底 + 2px 圆环、半径 `r.w/2 - 2`、`lineCap='round'`：
  **每日挑战是蓝色满圈**（暗 `#38bdf8` / 亮 `#0ea5e9`），**奖杯是绿色按比例**的进度环
  （`achv.unlockedCount / totalCount`，0 时无环），**齿轮是橙色满圈**（`T.god`，常驻）。
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
- **侦探**：`__emoji_detective__mode`、`level[_2|_3]`、`best[_2|_3]`；记忆 → 翻面偷换 → 作答；3 心。
  - **偷换（换掉一张牌）必须等所有牌完全翻到背面再做**：`flips.every(f => f <= 0)` 之后才挑牌替换，
    再停 `REVEAL_HOLD = 160ms` 才开始揭面。以前是「翻面开始后 250ms」就换，牌还在动画中，
    玩家能直接看到哪张牌的内容变了。冒烟会逐帧断言「换牌那一刻所有 flips 都是 0」。
  - **存档要覆盖答题中途**（以前只在胜负结算时写、`onHide()` 是空的 → 中途退出必然丢进度、回来掉回第 1 关）：
    `saveState()` 在 `startLevel`（观察阶段，记 level 好回去接着这一关）、换牌完成、进入答题、每次作答、
    胜负结算、`onHide()`（回首页 / 切后台）、`toggleMode()`（切模式前先存当前模式）都会写。
    `restore()` 按 phase 分流：`answer` → 恢复牌面 / 换牌位置 / 已用时间 / 心数 / 点错的格子接着答（`lock=false`）；
    `won` / `lost` → 保持结算态；`memory` / `flip` → 没有答案可言，重开本关（心数回满）。
    答题态若 `swapped` 越界或心数已经为 0 则不算可恢复 —— 但要按**失败态**恢复（不要重开本关）。
  - **结算面板是「整宽卡」**：`resultRect()` 返回 `{ x: this.cx, y: this.boardY, w: this.cw, h }` ——
    **宽度等于上面那张卡片**（`min(W-32, 440)`），不再只盖棋盘（第 1、2 关棋盘只有 210~312px 宽，
    以前遮罩是一小块补丁）。高度 `max(棋盘高, 196)`，从棋盘顶**只往下长**（往上会盖住选项卡上的「新游戏」按钮），
    并让开底部 FAB 那一行（`H - SAFE_BOTTOM - 16 - 48 - 8`）。面板是 `T.overlay` + `T.border` 细描边，
    内容居中；**分享入口画在面板自己的右上角**（72×26 实心 + 白色「分享」+ 图标）。
    冒烟断言：面板宽 == `cw`、面板不往棋盘上方长、分享按钮完整落在面板内、有图标和文字。
  - **全选错（心扣到 0）不是立刻盖遮罩**：先在正确答案那张牌上**盖一枚章**。
    章是一枚歪 -12° 的标签（`2px T.primary` 边框 + `rgba(255,255,255,0.4)` 半透明白底 + 中间 `✓`
    约 0.42 倍章高 + 下方「正确 / Correct」小字，章高 < 34px 时只留 `✓`），
    **落定后尺寸正好是卡片的一半**（`STAMP_W_RATIO = STAMP_H_RATIO = 0.52`，不封顶；
    82px 的牌 → 42.6px 章，320 宽那档 64px 的牌 → 33px 章）。
    入场像**从 z 轴飞过来**：`STAMP_IN_MS = 420ms`，关键帧 `4.2 →(10%) 3.4 →(30%) 2.0 →(48%) 1.25
    →(62%) 0.96 →(78%) 1.04 → 1` —— 一开始大到显示不全，越靠近卡片缩得越快，贴上去时压过一点再回弹落定。
    然后（`STAMP_SHAKE_DELAY = 450`）**这张牌被按得震一下**（`STAMP_SHAKE_MS = 500`，位移 ±1~2px、
    旋转 ±1.2°，**章本身不动**），合计 `STAMP_TOTAL_MS = 950ms`；
    **动画完整播完再停 `LOSE_AFTER_STAMP = 300ms`** 才进入 `lost`，即 `settleAt = now + 1250ms`。
    章**在所有牌画完之后**单独画一遍（会压住周围的牌，才像真盖上去的），结算态静态保留（不重播）。
    此时 `drawResult()` **不要再走 `resultVisible()` 的 200ms 通用门槛**（延时已在 `settleAt` 里算过）。
    以前是点错后 500ms 直接盖遮罩，玩家来不及看清答案。
    冒烟断言：延时 1200~1300ms、第一帧章缩放 > 3.5、300ms 后回到 1 倍（0.95~1.08）、
    章尺寸 = 卡片 × 0.52（±1.5px）、章上有 `✓`（章高够时还要有「正确」）、
    300ms / 1000ms 时仍是 `answer`、1400ms 才是 `lost`。
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
  - **里程碑庆祝**：`score % MILESTONE === 0` 时 `celebrateScore()`（`MILESTONE = 50`，即每逢 **50 的倍数**）—— 游戏区上方三朵小烟花（**78 颗粒子**：3 朵 × 26，用
    `core/confetti` 的 `update/draw`，只往上方散开）+ 一条夸张的鼓励话（`down.cheer1..cheer8` 随机，
    **不与上一条重复**），`playFirework()` 音效。
    鼓励条是**浅色半透明胶囊**（暗色 `rgba(255,255,255,0.18)` + 白字 / 亮色 `rgba(255,255,255,0.8)` + 主色字，
    带一层柔和投影），**不描边** —— 底下的画面透得出来，不是一整块实心色。
    **从屏幕顶部砸下来（要有重量感）**：`CHEER_DROP_MS = 460ms`，y 从 `topY - 高`（屏幕外）落到
    **`boardY - 高/2`（底边正好贴着游戏区顶部）**。位移曲线 `dropProgress()`：前 66% 用 `u²`
    **重力加速**冲到 1.045（越过落点 4.5%，咚地压进牌面几像素）→ 0.985（弹回）→ 1.008 → 1，约 460ms 停稳；
    同时 `dropSquash()` 做挤压 / 拉伸：下落时 `y 1→1.10 / x 1→0.95`（拉长），触底那一帧直接
    **压扁成 `x 1.12 / y 0.83`**，之后用 `e^-3.2t·cos(2.6πt)` 阻尼回正（还会再轻弹一次）。
    实测落定 `y ≈ 238~272`（牌面顶 272、选项卡 184~256），触底那 2~3 帧会压进牌面约 7px（这是"咚"的感觉），
    平时只压到选项卡下沿、完全不盖牌面；
    消失时**一边放大一边淡出**：`CHEER_EXIT_MS = 360ms`，`grow = 1 + 0.45·t²`（越散越大），
    透明度 `(1 - t)²`（先慢后快）；
    落定后存在到 `CHEER_LIFE = 1500ms`；
    字号从 **17** 起按宽度自适应（英文长句会缩到 10），胶囊高约 34。既不盖住牌面（新行出现的位置），也不压住列点击区。
    烟花在鼓励条上方炸开（`baseY = boardY - 44`），跟着一起下移。
    **音效**：正好到 50 的倍数那一次 `clearRow()` **不播普通消除音**（`(score + 1) % MILESTONE === 0` 时跳过），
    由 `celebrateScore()` 播 `playFirework()`（= 多消 / 连击的烟花音），和鼓励条、烟花同一时刻响；
    其它普通消除照旧 `playElimination()`。冒烟断言 100 / 200 触发、251 不触发（都是 50 的倍数边界）。
    **纯装饰：不注册任何按钮**，按钮数量与平时一致；`update` 里烟花 / 鼓励的推进放在
    「`phase !== PLAY || helpOpen` 提前 return」**之前**，所以暂停或结算时也会安静放完。
- 三者都从首页进入、`app.goHome()` 返回；文字 / 按钮遵循统一约定。

## 消除动画期间的输入

- 配对成功立即标记 `matched` 并开始闪烁；**不能用全局 lock 拦住整盘**。其它未翻牌在闪烁期间必须可以点。
- **不配对的翻回也不锁输入**：那一对只是「亮着 700ms 再翻回去」，玩家可以立刻点别的牌；
  多对同时在翻也要各自排队翻回去（详见「对对碰」一节）。
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
- **不配对不锁整盘**：两张不配对的牌会先亮 `FLIP_BACK_MS = 700ms` 让玩家记住，到点自己翻回去；
  这 700ms 里**其它牌照常可以点**（可以顺手开始下一对）。实现是 `this.mismatches` 数组排队，
  每对一个 `{ a, b, at }`，`update()` 里到点各自 `resolveMismatch(entry)`；
  **不要**再写回 `this.lock = true` —— 以前那样会把整盘锁 700ms，点击没反应、手感很卡
  （冒烟断言：不配对后 `lock === false`、立刻点第三张牌能生效、两对可同时排队、到点都翻回去）。
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
