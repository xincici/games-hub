# 游戏一览（`docs/GAMES.md`）

> **这个文件是生成的**：跑 `node scripts/check-conventions.mjs --write` 刷新（`--write` 之外只校验不改）。
> 字段来源：注册表 `src/shared/games.js`、各游戏代码里的 import 与类名、各自的分册。
> 存档 key 的**逐条含义**在各游戏分册里，这里只列出来方便检索。

| # | 游戏 | id | 路由 | i18n 前缀 | 存档 key | 用到的能力 | 帮助条数 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 点击游戏 | `click` | `/#/click` | `__easy_click_game__` | `__easy_click_game__`<br>`__easy_click_game__difficulty` | 上帝模式 / 撒花 | 4 |
| 2 | 数字迷宫 | `puzzle` | `/#/puzzle` | `__number_puzzle__` | `__number_puzzle__`<br>`__number_puzzle__difficulty` | 撒花 | 2 |
| 3 | 1A2B | `guess` | `/#/guess` | `__guess_number__` | `__guess_number__robot` | 计时 / 撒花 | 3 |
| 4 | 德州扑克 | `poker` | `/#/poker` | `—` | — | — | 5 |
| 5 | Threes | `three` | `/#/three` | `__threes_game__` | `__threes_game__best`<br>`__threes_game__state`<br>`__threes_game__` | 计时 | 6 |
| 6 | 2048 | `g2048` | `/#/2048` | `__game_2048__` | `__game_2048__best`<br>`__game_2048__state`<br>`__game_2048__` | 计时 / 撒花 | 3 |
| 7 | 贪吃蛇 | `snake` | `/#/snake` | `__snake_game__` | `__snake_game__difficulty`<br>`__snake_game__best`<br>`__snake_game__state`<br>`__snake_game__`<br>`__snake_game__through_wall` | 暂停 | 4 |
| 8 | Emoji 对对碰 | `match` | `/#/match` | `__emoji_match__` | `__emoji_match__` | 计时 / 进度条 / 二次确认 / 撒花 | 5 |
| 9 | Emoji 连连看 | `link` | `/#/link` | `__emoji_link__` | `__emoji_link__` | 计时 / 进度条 / 二次确认 / 撒花 | 6 |
| 10 | Emoji 侦探 | `detective` | `/#/detective` | `__emoji_detective__` | `__emoji_detective__` | 计时 / 生命 / 二次确认 / 撒花 | 5 |
| 11 | Emoji 猎手 | `hunter` | `/#/hunter` | `__emoji_hunter__` | `__emoji_hunter__` | 计时 / 生命 / 二次确认 / 撒花 | 5 |
| 12 | Emoji 消消乐 | `crush` | `/#/crush` | `__emoji_crush__` | `__emoji_crush__` | 进度条 / 二次确认 / 撒花 | 9 |
| 13 | 数独 | `sudoku` | `/#/sudoku` | `__sudoku_game__` | `__sudoku_game__` | 计时 / 进度条 / 生命 / 撒花 | 4 |
| 14 | Emoji 大师 | `master` | `/#/master` | `__emoji_master__` | `__emoji_master__` | 进度条 / 二次确认 / 撒花 | 4 |
| 15 | Emoji 下坠 | `down` | `/#/down` | `__emoji_down__` | `__emoji_down__` | 计时 / 暂停 | 5 |
| 16 | Emoji 滑行 | `slide` | `/#/slide` | `__emoji_slide__` | `__emoji_slide__` | 计时 / 进度条 / 二次确认 / 撒花 | 5 |
| 17 | Emoji 排序 | `sort` | `/#/sort` | `__emoji_sort__` | `__emoji_sort__` | 进度条 / 二次确认 / 撒花 | 9 |
| 18 | 扑克炼金术 | `alchemy` | `/#/alchemy` | `__poker_alchemy__` | `__poker_alchemy__mode`<br>`__poker_alchemy__level`<br>`__poker_alchemy__state`<br>`__poker_alchemy__best_`<br>`__poker_alchemy__` | 进度条 / 二次确认 / 撒花 | 3 |
| 19 | 麻将英雄 | `mahjong` | `/#/mahjong` | `__mahjong_hero__` | `__mahjong_hero__mode`<br>`__mahjong_hero__level`<br>`__mahjong_hero__state`<br>`__mahjong_hero__best_`<br>`__mahjong_hero__` | 进度条 / 二次确认 / 撒花 | 3 |
| 20 | 雀圣 | `quesheng` | `/#/quesheng` | `__quesheng__` | `__quesheng__mode`<br>`__quesheng__level_2`<br>`__quesheng__level`<br>`__quesheng__state_2`<br>`__quesheng__state`<br>`__quesheng__` | 进度条 / 上帝模式 / 二次确认 / 撒花 | 3 |
| 21 | 麻将传奇 | `legend` | `/#/legend` | `__mahjong_legend__` | `__mahjong_legend__state`<br>`__mahjong_legend__best_1`<br>`__mahjong_legend__` | 二次确认 / 撒花 | 4 |
| 22 | Emoji 镜像 | `mirror` | `/#/mirror` | `__emoji_mirror__` | `__emoji_mirror__state`<br>`__emoji_mirror__best_`<br>`__emoji_mirror__` | 计时 / 进度条 / 撒花 | 3 |
| 23 | point24 | `point24` | `/#/point24` | `__point24__` | `__point24__state`<br>`__point24__streak`<br>`__point24__best_streak`<br>`__point24__` | 二次确认 / 撒花 | 3 |
| 24 | gambler | `gambler` | `/#/gambler` | `__gambler__` | `__gambler__`<br>`__gambler__mode`<br>`__gambler__level`<br>`__gambler__level_2`<br>`__gambler__best`<br>`__gambler__best_2`<br>`__gambler__streak`<br>`__gambler__streak_2`<br>`__gambler__state`<br>`__gambler__state_2` | 生命 / 二次确认 / 撒花 | 6 |
| 25 | solo | `solo` | `/#/solo` | `__solo__` | `__solo__state`<br>`__solo__streak`<br>`__solo__best_streak`<br>`__solo__` | 二次确认 / 撒花 | 3 |

（共 25 个游戏。改完注册表/存档 key 记得跑一次本脚本刷新这张表。）
