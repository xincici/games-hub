// Emoji Master（羊了个羊 / 3 Tiles 玩法）纯逻辑：
// 分层堆叠布局、遮挡判定、保证可解的发牌、收集槽插入位置与洗牌辅助

export const UNITS = 14;       // 盘面 7×7 格，坐标以半格（1 单位）计
export const TILE_UNITS = 2;   // 每张卡片占 2×2 单位
export const TRAY_SIZE = 7;    // 收集槽格数
export const BLOCK_TILES = 9;  // 每 9 张 = 3 组三消（按生成的可解顺序分配 emoji）

// 各层可放置卡片的格点范围（自下而上，上层更小、更居中）
const LAYERS = [
  { cols: 7, rows: 7 },
  { cols: 6, rows: 6 },
  { cols: 6, rows: 6 },
  { cols: 5, rows: 5 },
  { cols: 4, rows: 4 },
  { cols: 3, rows: 3 },
];
// 每层实际放置张数，合计必须是 BLOCK_TILES 的倍数（13+11+10+9+7+4 = 54 = 6×9）
const COUNTS = [13, 11, 10, 9, 7, 4];

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

// 沿指定清盘顺序每 9 张一组、三组 emoji 轮转分配：
// 按该顺序点击时槽内最多同时存在 6 张（< 7），因此该顺序必定可解
export function dealAlongOrder(tiles, pool, order) {
  for (let start = 0; start < order.length; start += BLOCK_TILES) {
    const block = order.slice(start, start + BLOCK_TILES);
    const emojis = shuffleArray(pool).slice(0, 3);
    block.forEach((tile, i) => {
      tile.emoji = emojis[i % 3];
    });
  }
}

// 生成分层堆叠的位置（唯一格点，中央优先），emoji 待发牌填充
export function layoutTiles() {
  const tiles = [];
  let id = 0;
  LAYERS.forEach((cfg, layer) => {
    const baseX = (UNITS - cfg.cols * TILE_UNITS) / 2;
    const baseY = (UNITS - cfg.rows * TILE_UNITS) / 2;
    // 交错半格偏移制造层间错位；最外层没有余量时不偏移
    const x0 = baseX + (baseX > 0 ? layer % 2 : 0);
    const y0 = baseY + (baseY > 0 ? ((layer / 2) | 0) % 2 : 0);
    const slots = [];
    for (let r = 0; r < cfg.rows; r++) {
      for (let c = 0; c < cfg.cols; c++) {
        slots.push({ x: x0 + c * TILE_UNITS, y: y0 + r * TILE_UNITS });
      }
    }
    // 越靠盘面中央越优先，让堆叠集中在中央
    const center = (UNITS - TILE_UNITS) / 2;
    const picked = shuffleArray(slots)
      .map(slot => ({ slot, weight: Math.hypot(slot.x - center, slot.y - center) + Math.random() * 3 }))
      .sort((a, b) => a.weight - b.weight)
      .slice(0, COUNTS[layer])
      .map(item => item.slot);
    picked.forEach(slot => {
      tiles.push({ id: ++id, emoji: '', layer, x: slot.x, y: slot.y });
    });
  });
  return tiles;
}

// 生成一局：分层堆叠 + 唯一格点 + 可解发牌
export function generateTiles(pool) {
  const tiles = layoutTiles();
  dealAlongOrder(tiles, pool, removalOrder(tiles));
  return tiles;
}

// 新卡片在收集槽中的插入位置：贴在同 emoji 组的末尾（同组相邻便于观察）
export function insertIndex(tray, emoji) {
  for (let i = tray.length - 1; i >= 0; i--) {
    if (tray[i].emoji === emoji) return i + 1;
  }
  return tray.length;
}

// 洗牌：只重排剩余卡片上的 emoji（位置/层数不变），
// 这样遮挡关系与撤回时的原格点都保持有效
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
