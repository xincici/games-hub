# Threes（`src/games/three/`）

> 这是根目录 [`AGENTS.md`](../../../AGENTS.md) 的**游戏分册**：只讲这个游戏自己的实现、
> 存档 key 和踩过的坑。**改这个游戏前先读这里**；跨游戏共用的约定（视觉语言、共享组件、
> 闯关游戏统一约定、新增游戏流程）看根目录。
>
> - 路由：`/#/three`
> - i18n key 前缀：`__threes_game__`
> - 共享组件：`src/shared/`（`i18n.js` / `theme.js` / `confetti.js` / `CountTimer.vue` / `ConfirmDialog.vue` / `Hearts.vue` / `ParticleBackground.vue` 等）

## 实现

ThreeGame.vue（Threes：1+2=3 合成、牌堆预告、两阶段滑动合成动画；**跟手拖动**：pointer 事件替代了原来的 touch 起止判定（`.wrapper` 必须 `touch-action: none`，否则浏览器把滑动当滚页面收走、发 `pointercancel`，空白处拖动就失效；此页纵向不溢出）——按下记录起点，位移过 `DRAG_SLOP` 10px 锁定方向（方向锁死，手指抖动不会来回跳），拖动中把「这一步真会动的牌」（`dragMovers`，由 `computeMove(dir)` 比对当前盘面得出；该方向动不了时是空集，牌不跟手）沿方向平移 `min(位移, 一格间距)`，位移量直接叠加在 `left`/`top` 的 calc 上（**不能用 transform**：`appear`/`bump` 动画也在写 transform，会互相覆盖），跟手牌加 `.dragging`（`transition: none` 保证 1:1 跟手 + `z-index: 2` + 抬起阴影）压在目标牌上，于是不足一格时就是「重叠覆盖」的效果；两个阈值都按「跟手位移 / 一格间距」算：松手时至少 `DRAG_MIN` **0.5**（盖到一半）才合并，盖不到一半松手就弹回；跟手位移达到 `DRAG_COMMIT` **0.95** 时不等松手就**当场合并**（没锁定方向的轻点不算，往拖不动的方向拖也不动，拖出去又拖回起点再松手同样不合并——实测拖到 60px 不松手时 5 张牌仍在跟手态、盘面未变，拖回起点松手后原封不动）；提交时先清掉跟手位移再调 `move(dir)`，`left`/`top` 的 0.14s 过渡会从手指位置接着滑到目标位；一格间距 = `(grid 宽 - 40) / 4 + 8`（实测 390 宽下 87.5px）；新牌一律从「滑动来源侧」边缘补进（该侧满则退到最近一条线）、盘面上 1 与 2 的个数差恒 ≤ 4（draw/balancedValue 两道校正，开局 9 张同样受约束）；失败局面同样存档恢复（计时停在最终用时，由玩家自己点「新游戏」开新局）；新开局与恢复存档都按行列顺序逐张入场）+ i18n.js（route /three，key 前缀 __threes_game__）

## 存档（localStorage）

  - Threes：`__threes_game__*`（局面存档 `__threes_game__state`，最高分 `__threes_game__best`）
