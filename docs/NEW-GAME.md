# 新增 1 个游戏（`docs/NEW-GAME.md`）

按顺序做，每一步都能单独验证；**第 8 步的自检脚本会替你检查有没有漏**。

## 分步清单

1. **看 1 个现成的同类游戏**：emoji 类抄 `src/games/match/`（+ `detective/` 看提示带、`master/` 看立体卡片）；
   数字类抄 `src/games/g2048/`；麻将类抄 `src/games/mahjong/`（雪碧图牌面）。**别从零写样式**。
2. **建目录** `src/games/<id>/`：`<Name>Game.vue`（界面）+ `board.js`（纯逻辑、不碰 DOM，便于离线跑脚本验证）
   + `i18n.js`（中英双语）+ **`README.md`（玩法，面向玩家）** + `AGENTS.md`（实现，照下面模板）。自检会要求这两份都在。
3. **注册**：`src/shared/games.js` 表尾追加一条（字段见下），并把它的字典 `registerGame` 进去。
4. **路由**：`src/router.js` 加 `{ path: '/<id>', component: XxxGame, meta: { game: '<id>' } }`。
5. **首页图标**：把 `icon` 加进 `uno.config.ts` 的 `safelist`（运行时数据 UnoCSS 静态提取不到，**漏了就是空白方块**）。
6. **首页格子**：`HomePage.vue` 的 `ROW_SIZES` 加一格（当前 `1/2/3/4/3/4/3/2` = 22）——
   加完要重新量首页有没有滚动条（宽度约束那条公式的分母是「最宽行格数」，通常不用改）。
7. **文档**：根 `AGENTS.md` 的分册表格加一行；根 `README.md` 的游戏表加一行「emoji + 名字（链到 `src/games/<id>/README.md`）+ 一句话」；跑自检
   （它还会核对 `docs/GAMES.md`）。
8. **验证**：`node scripts/check-conventions.mjs` 全绿 → `node scripts/smoke.mjs` 全绿 →
   再照 [`VERIFY.md`](VERIFY.md) 对自己这个游戏**做一次针对性的量测**（新动画/新尺寸/新状态一定量一遍）。

## 注册表字段（`src/shared/games.js`）

| 字段 | 说明 |
| --- | --- |
| `id` | 游戏 id，等于目录名；也是 i18n 命名空间与路由 `meta.game` |
| `path` | 路由路径，`/<id>` |
| `icon` | 首页图标（`i-carbon-*` / `i-mdi-*`），**必须同步进 safelist** |
| `accent` | 首页分类强调色：`logic` 消除益智 / `number` 逻辑数字 / `memory` 记忆 / `action` 动作 / `card` 卡牌 |
| `helpKey` | 帮助弹窗「已弹过」的 storage key（沿用该游戏前缀） |
| `recordsPrefix` | （可选）清记录彩蛋要清的 key 前缀 |
| `minDifficulty` / `maxDifficulty` | （可选）清记录彩蛋要清几档难度的记录 |

## `<id>/AGENTS.md` 模板

```markdown
# 游戏名（`src/games/<id>/`）

> 这是根目录 [`AGENTS.md`](../../../AGENTS.md) 的**游戏分册**：只讲这个游戏自己的实现、
> 存档 key 和踩过的坑。**改这个游戏前先读这里**；跨游戏共用的约定看
> [`docs/CONVENTIONS.md`](../../../docs/CONVENTIONS.md)。
>
> - 路由：`/#/<id>`
> - i18n key 前缀：`__<prefix>__`
> - 共享组件：（用了哪些 `src/shared/*`）
> - （难度范围 / 是否有计时、进度条、生命、暂停、上帝模式、撤销）

## 玩法
（规则、操作、分数、过关与失败条件。**这段要和 i18n 的帮助文案一致**。）

## 实现要点
（状态机、关键常量与其取值理由、纯逻辑在哪、动画时序。**写"为什么"和实测数字**，
  不要只写"做了什么"。）

## 存档（localStorage）
（**逐个 key** 列出来并说明何时写。自检脚本会核对：游戏代码里用到的 `__<prefix>__*`
  必须在这里出现过。）

## 坑
（按「症状 → 原因 → 定位手段」写。踩过一次就记一条，失败尝试也记 ——
  下次才不会重复试错。）
```

## 脚手架：直接抄这一段，别凭记忆写（最容易丢的就是样式）

**全局只有 CSS 变量，没有 `.card` / `.divider` / `.game-icon` 这三个类规则** —— 它们散在每个游戏的
scoped 块里各写一份。漏写不会报错，只会「看起来像没做样式」（单人麻将就是这么丢的）。所以新组件
的 `<style scoped lang="scss">` **从下面这段开始抄**，再往里加自己的块：

```scss
.wrapper {
  max-width: var(--max-width);
  margin: 0 auto;
  // ⚠️ 必须写**完整简写**：只写 padding-top 会把左右内边距清零 → 所有卡片贴到屏幕两边
  // （左右 16px / 底部 24px 与其它游戏一致）。首屏那 64px 也写在这里，不写 .score-area 的
  // margin-top —— 顶栏是 fixed，首张卡的 margin 会塌陷出 #app（见 PITFALLS）。
  padding: 64px 16px 24px;
  box-sizing: border-box;
  color: var(--text-color);        // ⚠️ 不要写 color: var(--card-color)，那个变量是 #fff（给深色卡用）

  // 这三条每个游戏都要自己写一份（全局没有）
  .card {
    background: var(--card-bg-color);
    border-radius: var(--card-radius);   // ⚠️ 没有 --radius-card 这个变量，写错 var() 解析为空 = 直角
    box-shadow: var(--card-shadow);
    box-sizing: border-box;
  }
  .divider {
    width: 1px;
    height: 24px;
    align-self: center;
    background: var(--border-color);
    opacity: 0.6;
    flex: 0 0 auto;
  }
  .game-icon {
    cursor: pointer;
    padding: 8px 10px;
    font-size: 13px;
    font-weight: bold;
    white-space: nowrap;
    background: var(--primary-bg);
    color: #fff;
    border: 0 none;
    border-radius: var(--radius-tile);
    &:disabled { background-color: #aaa; cursor: not-allowed; }
  }
}
```

**写完先做这一步**：在游戏页里量一下 `getComputedStyle(document.querySelector('.card')).backgroundColor`
—— 是 `rgba(0, 0, 0, 0)` 就说明没命中；同理 `.game-icon` 应该是 `rgb(35, 128, 78)`，`.divider` 应该是
`1px × 24px`。**这三行判定比肉眼看截图靠谱**（浅色主题下"没有卡片"和"白卡片"几乎一样）。

## 必须遵守

开工前逐条过 [`CONVENTIONS.md`](CONVENTIONS.md) 顶部的清单，动手前扫一遍 [`PITFALLS.md`](PITFALLS.md)。
最容易漏的四条：**safelist**、**上面那段 scoped 样式**、**每个 storage key 写进分册**、
**帮助文案只写玩法不写彩蛋**。
