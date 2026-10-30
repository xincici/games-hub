// 用法：node scripts/gen-sprite-data.mjs
// 把 src/static/mahjong-tiles.jpg 转成 src/shared/spriteData.js（base64 data URI）
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const raw = readFileSync(resolve(root, 'src/static/mahjong-tiles.jpg'));
const uri = `data:image/jpeg;base64,${raw.toString('base64')}`;
const out = `// 麻将牌雪碧图的 base64 内联版本（由 scripts/gen-sprite-data.mjs 生成，别手改）。
// 为什么内联：真机上 \`<image src="/static/...">\` 仍可能不显示（路径/格式兼容），
// 而 base64 data URI 是微信明确支持的写法，不依赖包内文件加载，最稳。
export const TILE_SHEET_DATA = '${uri}';
`;
writeFileSync(resolve(root, 'src/shared/spriteData.js'), out);
console.log(`spriteData.js 已生成：${Math.round(uri.length / 1024)} KB`);
