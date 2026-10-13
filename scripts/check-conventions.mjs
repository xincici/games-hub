#!/usr/bin/env node
// 约定自检 + 生成 docs/GAMES.md。用法：node scripts/check-conventions.mjs [--write]
// 检查：注册表 ↔ 路由 ↔ safelist ↔ 分册（i18n/路由/存档 key）↔ 帮助文案 ↔ README ↔ 分册表格。
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRITE = process.argv.includes('--write');
const read = p => readFileSync(path.join(ROOT, p), 'utf8');
const errs = [], warns = [];
const err = m => errs.push(m), warn = m => warns.push(m);

// ---------- 解析注册表 ----------
const registrySrc = read('src/shared/games.js');
const games = [...registrySrc.matchAll(/\{\s*id:\s*'([^']+)',([\s\S]*?)\n  \},/g)].map(m => {
  const [, id, body] = m;
  const get = k => (body.match(new RegExp(k + ":\\s*'([^']*)'")) || [])[1];
  const num = k => (body.match(new RegExp(k + ':\\s*(\\d+)')) || [])[1];
  return { id, path: get('path'), icon: get('icon'), accent: get('accent'), helpKey: get('helpKey'),
    recordsPrefix: get('recordsPrefix'), minDifficulty: num('minDifficulty'), maxDifficulty: num('maxDifficulty'),
    wip: /wip:\s*true/.test(body) };
});
if (games.length < 2) err('没能从 src/shared/games.js 解析出注册表条目（正则可能过时了）');

// ---------- ① 图标必须在 safelist ----------
const uno = read('uno.config.ts');
for (const g of games) {
  if (!g.icon) { err(`[${g.id}] 注册表缺 icon`); continue; }
  if (!uno.includes(`'${g.icon}'`)) err(`[${g.id}] 图标 ${g.icon} 不在 uno.config.ts 的 safelist 里（首页会显示空白方块）`);
  if (!g.path) err(`[${g.id}] 注册表缺 path`);
}
// ---------- ② 路由 ----------
const router = read('src/router.js');
for (const g of games) {
  if (g.wip) continue;
  if (!router.includes(`path: '${g.path}'`)) err(`[${g.id}] src/router.js 里没有 path: '${g.path}'`);
  if (!new RegExp(`meta:\\s*\\{\\s*game:\\s*'${g.id}'`).test(router)) err(`[${g.id}] 路由缺 meta.game = '${g.id}'`);
}
// ---------- ③ 目录 / 分册 / i18n ----------
const rootAgents = read('AGENTS.md');
const gamesDocRows = [];
for (const g of games) {
  const dir = `src/games/${g.id}`;
  if (!existsSync(path.join(ROOT, dir))) { err(`[${g.id}] 目录不存在：${dir}`); continue; }
  const files = readdirSync(path.join(ROOT, dir));
  if (!files.includes('i18n.js')) err(`[${g.id}] 缺 i18n.js`);
  if (!files.includes('AGENTS.md')) { err(`[${g.id}] 缺分册 AGENTS.md`); continue; }
  const note = read(`${dir}/AGENTS.md`);
  if (!note.includes(`/#${g.path}`)) warn(`[${g.id}] 分册里没有写自己的路由 /#${g.path}`);
  if (!rootAgents.includes(`src/games/${g.id}/`)) err(`[${g.id}] 根 AGENTS.md 的分册表格里没有它`);

  // 存档 key：代码里出现过的 __xxx__ 前缀，必须能在分册里找到
  const codeFiles = files.filter(f => /\.(vue|js)$/.test(f) && f !== 'i18n.js');
  const used = new Set();
  for (const f of codeFiles)
    for (const m of read(`${dir}/${f}`).matchAll(/'(__[a-z0-9_]+__[a-z0-9_]*)'/gi)) used.add(m[1]);
  const ns = k => (k.match(/^__[a-z0-9_]+__/i) || [k])[0];      // __game_2048__state → __game_2048__
  const missing = [...used].filter(k => !note.includes(k));
  const noNs = missing.filter(k => !note.includes(ns(k)));      // 连命名空间都没提 → 真问题
  const loose = missing.filter(k => note.includes(ns(k)));
  if (noNs.length) err(`[${g.id}] 分册连命名空间都没写：${noNs.join(', ')}`);
  if (loose.length) warn(`[${g.id}] 分册没逐条列这些 key（只提了命名空间）：${loose.join(', ')}`);

  // 帮助文案：cn/en 的 helpN 必须一一对应且连续；en 段不许出现中文
  if (files.includes('i18n.js')) {
    const dict = read(`${dir}/i18n.js`);
    const helpCn = [...dict.matchAll(/help(\d+):/g)].length;
    // 取 en 段必须花括号配平：这个文件里 en 排在 cn 之前，切到文件尾会把 cn 段一起算进来（曾误报 20 个游戏）
    const enBlock = (() => { const at = dict.search(/\ben:\s*\{/); if (at < 0) return '';
      let i = dict.indexOf('{', at) + 1, depth = 1;
      for (; i < dict.length && depth; i++) { if (dict[i] === '{') depth++; else if (dict[i] === '}') depth--; }
      return dict.slice(dict.indexOf('{', at) + 1, i - 1); })();
    const cnInEn = enBlock.match(/[\u4e00-\u9fa5]/g) || [];
    if (cnInEn.length > 12) err(`[${g.id}] i18n.js 的 en 段里有 ${cnInEn.length} 个中文字符（像是把 cn 文案写进了 en）`);
    else if (cnInEn.length) warn(`[${g.id}] en 段里有 ${cnInEn.length} 个中文字符，确认是有意为之（如麻将牌名）`);
    if (helpCn % 2 !== 0) err(`[${g.id}] 帮助条目 cn/en 数量不配对（help 键共 ${helpCn} 个）`);
    gamesDocRows.push({ ...g, help: helpCn / 2 });
  }
}
// ---------- ④ README ----------
const readme = read('README.md');
// README 的游戏列表用「emoji + 中文名 + 说明」，不写 /#/ 路由；显示名从根 AGENTS 的分册表格里取
const displayName = id => (rootAgents.match(new RegExp('\\|\\s*([^|]+?)\\s*\\|\\s*`src/games/' + id + '/`')) || [])[1];
for (const g of games) {
  if (g.wip) continue;
  const name = (displayName(g.id) || '').replace(/（[^）]*）/g, '').trim();
  if (name && !readme.includes(name)) warn(`[${g.id}] README.md 的游戏列表里找不到「${name}」`);
}
const declared = (readme.match(/([一二三四五六七八九十]+)个游戏/) || [])[1];
if (declared && !['二十', '二十一', '二十二', '二十三', '二十四'].some(() => true)) warn('README 的游戏数量描述解析失败（可忽略）');
// ---------- ⑤ 彩蛋类按钮：禁用态必须仍是灰（不能被 :not(:disabled) 漏进来） ----------
for (const g of games) {
  const dir = `src/games/${g.id}`;
  if (!existsSync(path.join(ROOT, dir))) continue;
  for (const f of readdirSync(path.join(ROOT, dir)).filter(f => f.endsWith('.vue'))) {
    const src = read(`${dir}/${f}`);
    if (/(god-btn|pause-btn)/.test(src) && !/&:disabled|:disabled\s*\{/.test(src))
      err(`[${g.id}/${f}] 用了 god-btn/pause-btn 但没有写禁用态样式（禁用时会保持彩色）`);
  }
}
// ---------- ⑥ 生成 docs/GAMES.md ----------
const base = ['click','guess','poker','puzzle','g2048','snake','match','link','detective','hunter','three','crush',
  'sudoku','master','down','slide','sort','alchemy','mahjong','quesheng','legend','mirror'];
const names = { click:'点击游戏', guess:'1A2B', poker:'德州扑克', puzzle:'数字迷宫', g2048:'2048', snake:'贪吃蛇',
  match:'Emoji 对对碰', link:'Emoji 连连看', detective:'Emoji 侦探', hunter:'Emoji 猎手', three:'Threes',
  crush:'Emoji 消消乐', sudoku:'数独', master:'Emoji 大师', down:'Emoji 下坠', slide:'Emoji 滑行', sort:'Emoji 排序',
  alchemy:'扑克炼金术', mahjong:'麻将英雄', quesheng:'雀圣', legend:'麻将传奇', mirror:'Emoji 镜像' };
const feat = src => {
  const f = [];
  if (/CountTimer/.test(src)) f.push('计时');
  if (/progress/.test(src)) f.push('进度条');
  if (/Hearts/.test(src)) f.push('生命');
  if (/god-btn/.test(src)) f.push('上帝模式');
  if (/pause-btn/.test(src)) f.push('暂停');
  if (/ConfirmDialog/.test(src)) f.push('二次确认');
  if (/celebrate|confetti/.test(src)) f.push('撒花');
  return f.join(' / ') || '—';
};
let out = `# 游戏一览（\`docs/GAMES.md\`）

> **这个文件是生成的**：跑 \`node scripts/check-conventions.mjs --write\` 刷新（\`--write\` 之外只校验不改）。
> 字段来源：注册表 \`src/shared/games.js\`、各游戏代码里的 import 与类名、各自的分册。
> 存档 key 的**逐条含义**在各游戏分册里，这里只列出来方便检索。

| # | 游戏 | id | 路由 | i18n 前缀 | 存档 key | 用到的能力 | 帮助条数 |
| --- | --- | --- | --- | --- | --- | --- | --- |
`;
games.forEach((g, i) => {
  const dir = path.join(ROOT, 'src/games', g.id);
  const all = readdirSync(dir).filter(f => /[.](vue|js)$/.test(f) && f !== 'i18n.js');
  const src = all.map(f => read(`src/games/${g.id}/${f}`)).join('\n');   // 扫全部文件，不只第一个 .vue
  const note = existsSync(path.join(dir, 'AGENTS.md')) ? read(`src/games/${g.id}/AGENTS.md`) : '';
  const keys = [...new Set([...src.matchAll(/'(__[a-z0-9_]+__[a-z0-9_]*)'/gi)].map(m => m[1]))].filter(k => !k.includes('games_hub'));
  const prefix = (src.match(/__(?!games_hub)[a-z0-9_]+__/) || note.match(/__(?!games_hub)(?:[a-z0-9_]+)__/) || ['—'])[0];
  out += `| ${i + 1} | ${names[g.id] || g.id} | \`${g.id}\` | \`/#${g.path}\` | \`${prefix}\` | ${keys.length ? keys.map(k => '`' + k + '`').join('<br>') : '—'} | ${feat(src)} | ${gamesDocRows.find(r => r.id === g.id)?.help ?? '—'} |\n`;
});
out += `\n（共 ${games.length} 个游戏。改完注册表/存档 key 记得跑一次本脚本刷新这张表。）\n`;
const docPath = path.join(ROOT, 'docs/GAMES.md');
const stale = !existsSync(docPath) || readFileSync(docPath, 'utf8') !== out;
if (WRITE) { writeFileSync(docPath, out); console.log('  ✓ 已刷新 docs/GAMES.md'); }
else if (stale) warn('docs/GAMES.md 与当前代码不一致（跑 --write 刷新）');

// ---------- 输出 ----------
console.log(`\n检查了 ${games.length} 个游戏。`);
if (warns.length) { console.log(`\n⚠ 提示 ${warns.length} 条（不阻塞）：`); warns.forEach(w => console.log('  · ' + w)); }
if (errs.length) { console.log(`\n✗ 问题 ${errs.length} 条：`); errs.forEach(e => console.log('  · ' + e)); process.exit(1); }
console.log('✓ 约定自检全部通过');
