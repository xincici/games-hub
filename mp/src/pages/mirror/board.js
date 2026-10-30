// Emoji 镜像的纯逻辑：难度 → emoji 数量、展示区 / 游戏区排列、位置相同的个数
// 玩法：展示区先亮出 n 个 emoji，洗一下再翻面藏起来；游戏区是同样那 n 个 emoji 的另一种排列，
// 但**初始保证一个位置都不对**（错排）。玩家两两交换游戏区的牌，靠提示区「有几个位置相同」
// 把游戏区排成展示区的顺序。
import { EMOJIS } from '@/shared/emojis';

// 五档难度：展示 / 游戏区各放几个 emoji（默认最低难度）
export const DIFFICULTIES = [4, 5, 6, 7, 8];
export const MIN_DIFFICULTY = 1;
export const MAX_DIFFICULTY = DIFFICULTIES.length;

export function emojiCount(difficulty) {
  const d = Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, Math.round(difficulty) || MIN_DIFFICULTY));
  return DIFFICULTIES[d - 1];
}

// 每行放几个：4 单排；5 = 2+3（上 2 下 3，用户指定）；6 = 3+3；7 = 3+4（上 3 下 4）；8 = 4+4
export function rowsOf(count) {
  if (count <= 4) return [count];
  if (count === 5) return [2, 3];
  if (count === 7) return [3, 4];
  return [Math.ceil(count / 2), Math.floor(count / 2)];
}

// 位置相同（值也相同）的个数 —— 提示区显示的就是它
export function sameCount(a, b) {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) n += 1;
  return n;
}

// 洗成「每个位置都和参照不同」的错排：游戏区开局必须一处都对不上
export function derange(target, rand = Math.random) {
  const n = target.length;
  for (let attempt = 0; attempt < 300; attempt++) {
    const next = target.slice();
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    if (sameCount(next, target) === 0) return next;
  }
  // 兜底：整体循环移位一定没有不动点（错排的经典构造）
  return target.map((_, i) => target[(i + 1) % n]);
}

// 开一局：抽出 n 个互不相同的 emoji 当展示区，游戏区取它的错排
export function newRound(difficulty, rand = Math.random) {
  const count = emojiCount(difficulty);
  const pool = EMOJIS.slice();
  const display = [];
  for (let i = 0; i < count && pool.length; i++) {
    const at = Math.floor(rand() * pool.length);
    display.push(pool.splice(at, 1)[0]);
  }
  return { count, display, game: derange(display, rand) };
}

export function swapAt(arr, i, j) {
  const next = arr.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// 秒数 → mm:ss
export function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
