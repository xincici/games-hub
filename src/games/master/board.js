// Emoji Master（羊了个羊 / 3 Tiles 玩法）纯逻辑：
// 关卡难度曲线、分层堆叠布局、遮挡判定、保证可解的发牌、收集槽插入位置与洗牌辅助

export const UNITS = 14;       // 盘面 7×7 格，坐标以半格（1 单位）计
export const TILE_UNITS = 2;   // 每张卡片占 2×2 单位
export const TRAY_SIZE = 7;    // 收集槽格数
export const BLOCK_TILES = 9;  // 每 9 张一组发牌（3 组三消轮转，保证按清盘顺序可解）

export const MIN_GROUPS = 8;   // 第 1 关 8 组 = 24 张
export const MAX_GROUPS = 32;  // 组数（emoji 种类）上限 = 96 张
export const MAX_LAYERS = 8;   // 层数上限

// 各层可放置卡片的格点范围（自下而上，上层更小、更居中）
const LAYER_SLOTS = [
  { cols: 7, rows: 7 },
  { cols: 6, rows: 6 },
  { cols: 6, rows: 6 },
  { cols: 5, rows: 5 },
  { cols: 4, rows: 4 },
  { cols: 3, rows: 3 },
  { cols: 2, rows: 2 },
  { cols: 2, rows: 2 },
];

// 关卡难度曲线（两个维度同时线性增长，第 30 关封顶，之后保持最高难度随机盘面）：
// - emoji 种类：8 组（24 张）→ 32 组（96 张），第 30 关到顶
// - 层叠数：2 层 → 8 层，同样第 30 关到顶
export const MAX_LEVEL = 30;

export function levelConfig(level) {
  const lv = Math.max(1, Math.floor(level) || 1);
  const t = Math.min(1, (lv - 1) / (MAX_LEVEL - 1));
  const groups = Math.min(MAX_GROUPS, Math.round(MIN_GROUPS + (MAX_GROUPS - MIN_GROUPS) * t));
  const layers = Math.min(MAX_LAYERS, Math.round(2 + (MAX_LAYERS - 2) * t));
  const tiles = groups * 3;
  return { level: lv, groups, layers, tiles, counts: distributeCounts(tiles, layers) };
}

// 按「下层多、上层少」的权重把卡片分配到各层，并夹在各层格点容量内
function distributeCounts(tiles, layers) {
  const weights = Array.from({ length: layers }, (_, i) => layers - i);
  const total = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map(w => tiles * w / total);
  const counts = exact.map(Math.floor);
  let rest = tiles - counts.reduce((a, b) => a + b, 0);
  // 取整余数按小数部分从大到小补齐
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  let k = 0;
  while (rest > 0) {
    counts[order[k % layers].i]++;
    rest--;
    k++;
  }
  // 夹到该层格点容量：超出部分往下层挪（最下层兜底）
  for (let i = layers - 1; i >= 1; i--) {
    const cap = LAYER_SLOTS[i].cols * LAYER_SLOTS[i].rows;
    if (counts[i] > cap) {
      counts[i - 1] += counts[i] - cap;
      counts[i] = cap;
    }
  }
  const bottomCap = LAYER_SLOTS[0].cols * LAYER_SLOTS[0].rows;
  if (counts[0] > bottomCap) counts[0] = bottomCap;
  // 每层至少 1 张，避免出现空层
  for (let i = 0; i < layers; i++) {
    if (counts[i] < 1) {
      counts[i] = 1;
      counts[i - 1] = Math.max(1, counts[i - 1] - 1);
    }
  }
  return counts;
}

export function shuffleArray(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 卡片是否被更高层卡片遮挡（矩形在任一方向相距 < 2 单位即视为有重叠）
export function isCovered(tile, tiles) {
  for (const other of tiles) {
    if (other.layer <= tile.layer) continue;
    if (Math.abs(other.x - tile.x) < TILE_UNITS && Math.abs(other.y - tile.y) < TILE_UNITS) return true;
  }
  return false;
}

// 当前可点击（亮色）的卡片 id 集合
export function freeIds(tiles) {
  const set = new Set();
  for (const tile of tiles) {
    if (!isCovered(tile, tiles)) set.add(tile.id);
  }
  return set;
}

// 一种合法的整体清盘顺序：每次取当前未被遮挡的卡片
export function removalOrder(tiles) {
  const remain = tiles.slice();
  const order = [];
  while (remain.length) {
    const free = remain.filter(t => !isCovered(t, remain));
    const pick = free.length
      ? free[Math.floor(Math.random() * free.length)]
      : remain[remain.length - 1];
    order.push(pick);
    remain.splice(remain.indexOf(pick), 1);
  }
  return order;
}

// 沿指定清盘顺序按 BLOCK_TILES 一组发牌，每组内若干 emoji 轮转：
// 每组的 emoji 种类数 = 组内张数 / 3，因此按该顺序点击时槽内最多同时存在
// 2×种类数 ≤ 6 张（第 7 张落下即完成三消），该顺序必定可解。
// 每组按顺序从打乱后的 emoji 池里取，保证整局正好用掉 groups 种 emoji。
export function dealAlongOrder(tiles, pool, order) {
  const bag = shuffleArray(pool);
  let cursor = 0;
  for (let start = 0; start < order.length; start += BLOCK_TILES) {
    const block = order.slice(start, start + BLOCK_TILES);
    const kinds = Math.max(1, Math.round(block.length / 3));
    const picked = [];
    for (let k = 0; k < kinds; k++) picked.push(bag[cursor++ % bag.length]);
    block.forEach((tile, i) => {
      tile.emoji = picked[i % kinds];
    });
  }
}

// 选点权重：越靠中心越优先（堆叠集中成塔），叠加随机让每层铺开
const CENTER_BIAS = 1;
const SPREAD_RANDOM = 3;

const QUADRANTS = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
const keyOf = (x, y) => `${x},${y}`;

// 卡片是否被上层盖得一点不剩（四个象限都被上层卡片占满 = 完全不可见）
export function fullyCovered(tile, tiles) {
  return QUADRANTS.every(([dx, dy]) =>
    tiles.some(o => o.layer > tile.layer && o.x === tile.x + dx && o.y === tile.y + dy));
}

function gridSlots(cols, rows, x0, y0) {
  const slots = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      slots.push({ x: x0 + c * TILE_UNITS, y: y0 + r * TILE_UNITS });
    }
  }
  return slots;
}

// 层内候选位置：每个格点加上 ±1 单位的微抖动（越界丢弃）。
// 抖动让同一层的卡片有一点错落，也让上层有足够多互不重复的落点
const JITTERS = [[0, 0], [-1, 0], [0, -1], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
function gridCandidates(cols, rows, x0, y0) {
  const out = [];
  for (const slot of gridSlots(cols, rows, x0, y0)) {
    for (const [jx, jy] of JITTERS) {
      const x = slot.x + jx;
      const y = slot.y + jy;
      if (x < 0 || y < 0 || x + TILE_UNITS > UNITS || y + TILE_UNITS > UNITS) continue;
      out.push({ x, y });
    }
  }
  return out;
}

// 生成分层堆叠的位置。规则：
// 1. 任何两张卡片都不允许落在同一格点（否则下面那张会被完全压住、看不出下面有牌）
// 2. 同一层内两张卡片不得互相压住
// 3. 任何卡片都不能被上层盖得四个象限全满（保证每张牌都至少露出一角）
// 做法：自上层向下摆放。上层先落位，下层再挑「不会被完全盖住」的落点，
// 这样规则 3 是放置时就能判定、而且下层格点很多、容易满足的硬约束。
export function layoutTiles(cfg) {
  // 极端情况下（最高难度、层数堆满）兜底路径可能留下一张被完全盖住的牌，
  // 生成很快，直接重试几次取「完全不可见卡片最少」的一版
  let best = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const tiles = buildLayout(cfg);
    const hidden = tiles.filter(t => fullyCovered(t, tiles)).length;
    if (hidden === 0) return tiles;
    if (!best || hidden < best.hidden) best = { tiles, hidden };
  }
  return best.tiles;
}

function buildLayout(cfg) {
  const { layers, counts } = cfg;
  const tiles = [];
  const coordMap = new Map();   // 格点 -> 已放置的卡片（格点唯一）
  let id = 0;

  for (let layer = layers - 1; layer >= 0; layer--) {
    const { cols, rows } = LAYER_SLOTS[layer];
    const baseX = (UNITS - cols * TILE_UNITS) / 2;
    const baseY = (UNITS - rows * TILE_UNITS) / 2;
    // 层间基础偏移（奇偶错开），再叠加逐张微抖动
    const x0 = baseX + (baseX > 0 ? layer % 2 : 0);
    const y0 = baseY + (baseY > 0 ? ((layer / 2) | 0) % 2 : 0);

    const center = (UNITS - TILE_UNITS) / 2;
    const ordered = shuffleArray(gridCandidates(cols, rows, x0, y0))
      .map(pos => ({
        pos,
        // 越靠中心越优先（上层收成塔尖），叠加随机让每层铺开
        weight: Math.hypot(pos.x - center, pos.y - center) * CENTER_BIAS + Math.random() * SPREAD_RANDOM,
      }))
      .sort((a, b) => a.weight - b.weight)
      .map(item => item.pos);

    // 该落点是否已被上层卡片完全盖住（四个象限都有更高的卡片）
    const hiddenAt = pos => QUADRANTS.every(([dx, dy]) => {
      const other = coordMap.get(keyOf(pos.x + dx, pos.y + dy));
      return !!other && other.layer > layer;
    });

    const place = (pos, avoidHidden) => {
      if (coordMap.has(keyOf(pos.x, pos.y))) return false;   // 规则 1
      if (tiles.some(t => t.layer === layer
        && Math.abs(t.x - pos.x) < TILE_UNITS
        && Math.abs(t.y - pos.y) < TILE_UNITS)) return false; // 规则 2
      if (avoidHidden && hiddenAt(pos)) return false;         // 规则 3
      const tile = { id: ++id, emoji: '', layer, x: pos.x, y: pos.y };
      coordMap.set(keyOf(pos.x, pos.y), tile);
      tiles.push(tile);
      return true;
    };

    let placed = 0;
    for (const pos of ordered) {
      if (placed >= counts[layer]) break;
      if (place(pos, true)) placed++;
    }
    // 兜底：极端几何下确实放不下时，才允许落点被完全盖住
    for (const pos of ordered) {
      if (placed >= counts[layer]) break;
      if (place(pos, false)) placed++;
    }
  }
  return tiles;
}

// 生成指定关卡：难度配置 + 分层堆叠 + 可解发牌
export function generateTiles(pool, level = 1) {
  const cfg = levelConfig(level);
  const tiles = layoutTiles(cfg);
  dealAlongOrder(tiles, pool, removalOrder(tiles));
  return { tiles, cfg };
}

// 新卡片在收集槽中的插入位置：贴在同 emoji 组的末尾（同组相邻便于观察）
export function insertIndex(tray, emoji) {
  for (let i = tray.length - 1; i >= 0; i--) {
    if (tray[i].emoji === emoji) return i + 1;
  }
  return tray.length;
}

// 洗牌：只重排剩余卡片上的 emoji（位置/层数不变），
// 遮挡关系与盘面布局都保持有效
export function shuffleEmojis(tiles) {
  if (tiles.length < 2) return false;
  let next = tiles.map(t => t.emoji);
  for (let attempt = 0; attempt < 10; attempt++) {
    next = shuffleArray(next);
    if (next.some((e, i) => e !== tiles[i].emoji)) break;
  }
  tiles.forEach((tile, i) => { tile.emoji = next[i]; });
  return true;
}

// 收集槽中某 emoji 的数量
export function countInTray(tray, emoji) {
  return tray.reduce((n, card) => n + (card.emoji === emoji ? 1 : 0), 0);
}
