// 麻将牌面池（**不 import 任何东西**：几个游戏共用，也方便离线脚本直接读）
//
// key 形如 'm5'（五万）/ 's3'（三条）/ 'p7'（七筒）/ 'z1'（东），
// 拆成 MahjongTile 需要的 suit / value 用 faceOf() 即可 —— 牌面 sprite 见 ./mahjongTiles.js。
//
// 共 34 种：万/条/筒各 1~9（27）+ 字牌 1~7（东南西北中发白）。
export const MAHJONG_FACES = [
  ...['m', 's', 'p'].flatMap(suit => Array.from({ length: 9 }, (_, i) => `${suit}${i + 1}`)),
  ...Array.from({ length: 7 }, (_, i) => `z${i + 1}`),
];

// 'm5' → { suit: 'm', value: 5 }
export function faceOf(key) {
  return { suit: String(key)[0], value: +String(key).slice(1) };
}
