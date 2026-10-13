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

## 必须遵守

开工前逐条过 [`CONVENTIONS.md`](CONVENTIONS.md) 顶部的清单。最容易漏的四条：
**safelist**、**`.card`/`.game-icon` 这类 scoped 样式要自己写一份**、**每个 storage key 写进分册**、
**帮助文案只写玩法不写彩蛋**。
