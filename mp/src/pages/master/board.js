// Emoji Master（羊了个羊 / 3 Tiles 玩法）纯逻辑：
// 关卡难度曲线、分层堆叠布局、遮挡判定、保证可解的发牌、收集槽插入位置

export const UNITS = 14;       // 盘面 14×14 单位（emoji 模式 = 7×7 格）
export const TILE_UNITS = 2;   // emoji 模式每张卡片占 2×2 单位
export const FACE_RATIO = 131 / 168;   // 麻将牌面（竖牌）的宽高比
// 麻将模式的**格距 = 牌面尺寸**：横向 1.56 单位、纵向 2 单位。于是牌与牌正好挨着、
// 卡片本身就是一块竖着的麻将牌（不是「正方形底 + 里面放一张小牌」），
// 而遮挡判定用「|Δx| < 格距x 且 |Δy| < 格距y」，与牌面完全一致。
export const MAHJONG_PITCH = { x: +(TILE_UNITS * FACE_RATIO).toFixed(3), y: TILE_UNITS };
export const pitchOf = mode => {
  if (mode === MODE_MAHJONG) return MAHJONG_PITCH;
  if (mode === MODE_POKER) return POKER_PITCH;
  return { x: TILE_UNITS, y: TILE_UNITS };
};
export const TRAY_SIZE = 7;    // 收集槽格数
export const BLOCK_TILES = 9;  // 每 9 张一组发牌（3 组三消，保证按清盘顺序可解）

export const MIN_TRIPLES = 8;   // 第 1 关 8 组三消 = 24 张
export const MAX_TRIPLES = 32;  // 组数上限 = 96 张（这也是分层布局摆得下的上限，见 layoutTiles）
export const MIN_KINDS = 7;     // 第 1 关用 7 种 emoji
export const MAX_KINDS = 18;    // emoji 种类上限（池子有 147 个，够用）
export const MIN_LAYERS = 2;    // 第 1 关 2 层
export const MAX_LAYERS = 8;    // 层数上限

// 各层可放置区域（单位见方，自下而上逐层收小）。用**单位**而不是列数，
// 这样换成更窄的麻将牌时列数会自动变多（底层 7 列 → 8 列）。
const LAYER_EXTENTS = [14, 12, 12, 10, 8, 6, 4, 4];
// 某层的格点数 = 区域尺寸 / 格距
export function layerSlots(layer, pitch) {
  const extent = LAYER_EXTENTS[layer] ?? LAYER_EXTENTS[LAYER_EXTENTS.length - 1];
  return {
    cols: Math.max(1, Math.floor(extent / pitch.x)),
    rows: Math.max(1, Math.floor(extent / pitch.y)),
    extent,
  };
}

// 关卡难度曲线：三个维度一起线性爬升，第 50 关封顶，之后保持最高难度随机盘面。
// - 组数（三消组数）：8 组（24 张）→ 32 组（96 张），每关只涨 0.5 组，过渡平缓
// - emoji 种类：6 种 → 16 种，涨得比组数慢，因此越到后面同一种 emoji 越可能摊到多组
//   （每种 emoji 的张数恒为 3 的倍数，也就是永远能整组消掉）
// - 层叠数：2 层 → 8 层
export const MAX_LEVEL = 50;

// ---------- 模式：玩法完全一样，只有「牌面池」与「难度曲线」不同 ----------
export const MODE_EMOJI = 'emoji';
export const MODE_POKER = 'poker';
export const MODE_MAHJONG = 'mahjong';
// 切换顺序（用户要求：emoji → 扑克牌 → 麻将 → emoji）
export const MODE_ORDER = [MODE_EMOJI, MODE_POKER, MODE_MAHJONG];

// 麻将模式的牌面池在 **src/shared/mahjongFaces.js**（几个游戏共用；本文件保持不 import）。
// 这里只留「最多用多少种」：34 种牌面里给麻将模式留点余量。
export const MAHJONG_MAX_KINDS = 26;     // 只有 34 种牌面，留点余量
export const POKER_MAX_KINDS = 18;       // 扑克 52 张，但本作的种类曲线本来只到 18，够用
// 扑克牌是 2:3 的竖牌：格距同样跟着牌走（emoji 是 2×2 单位）
export const POKER_PITCH = { x: +(TILE_UNITS * 2 / 3).toFixed(3), y: TILE_UNITS };

// 两种模式的难度调参：
// - emoji：老曲线，种类顺着 50 关从 7 线性爬到 18
// - mahjong：**种类更多（10~26）**，而且种类数**跟着组数走**（kindRatio 0.8）——
//   于是「一种牌摊到两组 = 同一种出现 6 张」的情况明显变少（详见分册里的对照表）
const MODE_TUNING = {
  [MODE_EMOJI]: { minKinds: MIN_KINDS, maxKinds: MAX_KINDS, kindRatio: null },
  [MODE_MAHJONG]: { minKinds: 10, maxKinds: MAHJONG_MAX_KINDS, kindRatio: 0.8 },
  // 扑克模式沿用 emoji 那条曲线（用户只要求补齐这个模式，没要求改难度）
  [MODE_POKER]: { minKinds: MIN_KINDS, maxKinds: POKER_MAX_KINDS, kindRatio: null },
};
export const modeTuning = mode => MODE_TUNING[mode] || MODE_TUNING[MODE_EMOJI];

export function levelConfig(level, mode = MODE_EMOJI) {
  const pitch = pitchOf(mode);
  const lv = Math.max(1, Math.floor(level) || 1);
  const t = Math.min(1, (lv - 1) / (MAX_LEVEL - 1));
  const triples = Math.min(MAX_TRIPLES, Math.round(MIN_TRIPLES + (MAX_TRIPLES - MIN_TRIPLES) * t));
  const tune = modeTuning(mode);
  const rawKinds = tune.kindRatio == null
    ? Math.round(tune.minKinds + (tune.maxKinds - tune.minKinds) * t)
    : Math.round(triples * tune.kindRatio);
  // 种类不能超过组数（否则会有「分到 0 组」的牌面白占池子）
  const kinds = Math.min(triples, Math.max(1, Math.min(tune.maxKinds, Math.max(tune.minKinds, rawKinds))));
  const layers = Math.min(MAX_LAYERS, Math.round(MIN_LAYERS + (MAX_LAYERS - MIN_LAYERS) * t));
  const tiles = triples * 3;
  const slots = Array.from({ length: layers }, (_, i) => layerSlots(i, pitch));
  // groups 是历史字段名（早期的「一种 emoji 只出一组」），等价于 triples，保留给旧调用方
  return {
    level: lv, mode, pitch, slots, triples, groups: triples, kinds, layers, tiles,
    counts: distributeCounts(tiles, layers, slots),
  };
}

// 按「下层多、上层少」的权重把卡片分配到各层，并夹在各层格点容量内
function distributeCounts(tiles, layers, slots) {
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
    const cap = slots[i].cols * slots[i].rows;
    if (counts[i] > cap) {
      counts[i - 1] += counts[i] - cap;
      counts[i] = cap;
    }
  }
  const bottomCap = slots[0].cols * slots[0].rows;
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
export function isCovered(tile, tiles, pitch = { x: TILE_UNITS, y: TILE_UNITS }) {
  for (const other of tiles) {
    if (other.layer <= tile.layer) continue;
    if (Math.abs(other.x - tile.x) < pitch.x && Math.abs(other.y - tile.y) < pitch.y) return true;
  }
  return false;
}

// 当前可点击（亮色）的卡片 id 集合
export function freeIds(tiles, pitch) {
  const set = new Set();
  for (const tile of tiles) {
    if (!isCovered(tile, tiles, pitch)) set.add(tile.id);
  }
  return set;
}

// 一种合法的整体清盘顺序：每次取当前未被遮挡的卡片
export function removalOrder(tiles, pitch) {
  const remain = tiles.slice();
  const order = [];
  while (remain.length) {
    const free = remain.filter(t => !isCovered(t, remain, pitch));
    const pick = free.length
      ? free[Math.floor(Math.random() * free.length)]
      : remain[remain.length - 1];
    order.push(pick);
    remain.splice(remain.indexOf(pick), 1);
  }
  return order;
}

// 按关卡配置发一袋「三消」：kinds 种 emoji 平分 triples 组，
// 每组恰好 3 张，所以每种 emoji 的张数恒为 3 的倍数。
export function buildTripleBag(pool, kinds, triples) {
  const emojis = shuffleArray(pool).slice(0, Math.max(1, kinds));
  const base = Math.floor(triples / emojis.length);
  const rest = triples - base * emojis.length;
  const bag = [];
  emojis.forEach((emoji, i) => {
    for (let k = 0; k < base + (i < rest ? 1 : 0); k++) bag.push(emoji);
  });
  return bag;
}

// 沿指定清盘顺序按 BLOCK_TILES 一组发牌：一组 9 张 = 3 个三消，每个三消用同一种 emoji。
// 因此按该顺序点击时，槽内最多同时存在 2×3 = 6 张（第 7 张落下前一定已凑齐一组三消），
// 而且每消完一组 9 张，槽里属于自己的牌全部清空，该顺序必定可解。
export function dealAlongOrder(tiles, bag, order) {
  const list = shuffleArray(bag);
  let cursor = 0;
  for (let start = 0; start < order.length; start += BLOCK_TILES) {
    const block = order.slice(start, start + BLOCK_TILES);
    const picked = [];
    for (let i = 0; i < block.length; i += 3) picked.push(list[cursor++ % list.length]);
    block.forEach((tile, i) => {
      tile.emoji = picked[~~(i / 3)];
    });
  }
}

// 选点权重：越靠中心越优先（堆叠集中成塔），叠加随机让每层铺开
const CENTER_BIAS = 1;
const SPREAD_RANDOM = 3;

const QUADRANTS = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
const keyOf = (x, y) => `${x},${y}`;

// 卡片是否被上层盖得一点不剩（四个象限都被上层卡片占满 = 完全不可见）
export function fullyCovered(tile, tiles, pitch = { x: TILE_UNITS, y: TILE_UNITS }) {
  // 四个象限 = 牌面四条边的中心点（格距的一半）
  const hx = +(pitch.x / 2).toFixed(3);
  const hy = +(pitch.y / 2).toFixed(3);
  return QUADRANTS.every(([sx, sy]) =>
    tiles.some(o => o.layer > tile.layer && o.x === tile.x + sx * hx && o.y === tile.y + sy * hy));
}

function gridSlots(cols, rows, x0, y0, pitch) {
  const slots = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      slots.push({ x: x0 + c * pitch.x, y: y0 + r * pitch.y });
    }
  }
  return slots;
}

// 层内候选位置：每个格点加上 ±1 单位的微抖动（越界丢弃）。
// 抖动让同一层的卡片有一点错落，也让上层有足够多互不重复的落点
const JITTERS = [[0, 0], [-1, 0], [0, -1], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
function gridCandidates(cols, rows, x0, y0, pitch) {
  const out = [];
  // 抖动 ±半个格距（emoji 模式就是 ±1 单位，与改动前完全一致）
  const hx = pitch.x / 2;
  const hy = pitch.y / 2;
  for (const slot of gridSlots(cols, rows, x0, y0, pitch)) {
    for (const [jx, jy] of JITTERS) {
      const x = +(slot.x + jx * hx).toFixed(3);
      const y = +(slot.y + jy * hy).toFixed(3);
      if (x < 0 || y < 0 || x + pitch.x > UNITS || y + pitch.y > UNITS) continue;
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
  const pitch = cfg.pitch || { x: TILE_UNITS, y: TILE_UNITS };
  for (let attempt = 0; attempt < 4; attempt++) {
    const tiles = buildLayout(cfg);
    const hidden = tiles.filter(t => fullyCovered(t, tiles, pitch)).length;
    if (hidden === 0) return tiles;
    if (!best || hidden < best.hidden) best = { tiles, hidden };
  }
  return best.tiles;
}

function buildLayout(cfg) {
  const { layers, counts, slots } = cfg;
  const pitch = cfg.pitch || { x: TILE_UNITS, y: TILE_UNITS };
  const tiles = [];
  const coordMap = new Map();   // 格点 -> 已放置的卡片（格点唯一）
  let id = 0;

  for (let layer = layers - 1; layer >= 0; layer--) {
    const { cols, rows } = slots[layer];
    const baseX = (UNITS - cols * pitch.x) / 2;
    const baseY = (UNITS - rows * pitch.y) / 2;
    // 层间基础偏移（奇偶错开），再叠加逐张微抖动
    const x0 = baseX + (baseX > 0 ? layer % 2 : 0);
    const y0 = baseY + (baseY > 0 ? ((layer / 2) | 0) % 2 : 0);

    const center = (UNITS - pitch.x) / 2;
    const ordered = shuffleArray(gridCandidates(cols, rows, x0, y0, pitch))
      .map(pos => ({
        pos,
        // 越靠中心越优先（上层收成塔尖），叠加随机让每层铺开
        weight: Math.hypot(pos.x - center, pos.y - center) * CENTER_BIAS + Math.random() * SPREAD_RANDOM,
      }))
      .sort((a, b) => a.weight - b.weight)
      .map(item => item.pos);

    // 该落点是否已被上层卡片完全盖住（四个象限都有更高的卡片）
    const hx = +(pitch.x / 2).toFixed(3);
    const hy = +(pitch.y / 2).toFixed(3);
    const hiddenAt = pos => QUADRANTS.every(([sx, sy]) => {
      const other = coordMap.get(keyOf(+(pos.x + sx * hx).toFixed(3), +(pos.y + sy * hy).toFixed(3)));
      return !!other && other.layer > layer;
    });

    const place = (pos, avoidHidden) => {
      if (coordMap.has(keyOf(pos.x, pos.y))) return false;   // 规则 1
      if (tiles.some(t => t.layer === layer
        && Math.abs(t.x - pos.x) < pitch.x
        && Math.abs(t.y - pos.y) < pitch.y)) return false; // 规则 2
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

// 生成指定关卡：难度配置 + 分层堆叠 + 可解发牌。
// 同时返回这条「保证可解」的清盘顺序，便于离线校验发牌确实不会撑爆收集槽
export function generateTiles(pool, level = 1, mode = MODE_EMOJI) {
  const cfg = levelConfig(level, mode);
  const tiles = layoutTiles(cfg);
  const order = removalOrder(tiles, cfg.pitch);
  dealAlongOrder(tiles, buildTripleBag(pool, cfg.kinds, cfg.triples), order);
  return { tiles, cfg, order };
}

// 新卡片在收集槽中的插入位置：贴在同 emoji 组的末尾（同组相邻便于观察）
export function insertIndex(tray, emoji) {
  for (let i = tray.length - 1; i >= 0; i--) {
    if (tray[i].emoji === emoji) return i + 1;
  }
  return tray.length;
}

// 收集槽中某 emoji 的数量
export function countInTray(tray, emoji) {
  return tray.reduce((n, card) => n + (card.emoji === emoji ? 1 : 0), 0);
}
