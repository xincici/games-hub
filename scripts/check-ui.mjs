#!/usr/bin/env node
// 交互与结算的统一规范自检（规范正文见 docs/CONVENTIONS.md 的
// 「交互与结算的统一规范（按钮 / 统计条 / 结算层 / 二次确认）」一节）。
//
// 只查**机械可判定**的部分，查不出来的（颜色是否好看、结算时机是否合理）留给人工与分册：
//   1. 模板里不许再用历史别名的 i18n key（retry / playAgain / nextGame / answer）
//   2. `.game-icon` 的特例类只允许 god-btn / pause-btn / answer-btn / replay-btn（别的都是没有规则的空类）
//   3. 规范里那四个按钮文案的 emoji 前缀必须对（start 🎮 / replayLevel 🔄 / nextLevel ➡️ / reveal 🔍）
//   4. 有存档的游戏必须把 <TopHeader> 的 @onScoreReset 绑上，并且处理器里调用 clearGameStorage(自己的前缀)
//   5.（提示级，不判失败）获胜层里有「下一关」却没有「重玩本关」—— 无关卡概念的游戏属合理变体
//
// 用法：node scripts/check-ui.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const GAMES_DIR = join(ROOT, 'src/games');

const LEGACY_KEYS = ['retry', 'playAgain', 'nextGame', 'answer'];
// replay-btn 是「重玩本关」的橙色描边样式（全局规则在 App.vue），属于外观变体而非行为特例
const ALLOWED_SPECIALS = new Set(['god-btn', 'pause-btn', 'answer-btn', 'replay-btn']);
const EMOJI = { start: '🎮', replayLevel: '🔄', nextLevel: '➡️', reveal: '🔍' };

const problems = [];
const hints = [];
const read = p => readFileSync(p, 'utf8');

const gameDirs = readdirSync(GAMES_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

// 模板里用到的 i18n key 必须在**中英两本字典里都存在**。
// i18n() 查不到 key 时会原样返回 key —— 缺哪个语言，那个语言的界面上就会直接显示 key 本身
//（历史上 4 个游戏把 retry 改成 replayLevel 时只改了中文，英文界面就显示了 "replayLevel"）。
async function checkI18nKeys(id, i18nPath, src) {
  if (!existsSync(i18nPath)) return;
  let dict;
  try {
    dict = (await import(pathToFileURL(i18nPath).href)).default;
  } catch (e) {
    problems.push(`${id}/i18n.js: 无法 import（${String(e).slice(0, 80)}）`);
    return;
  }
  const langs = Object.keys(dict || {}).filter(k => dict[k] && typeof dict[k] === 'object');
  const used = new Set([...src.matchAll(/i18n\('([A-Za-z0-9_]+)'\)/g)].map(m => m[1]));
  // 全局 key（shared/i18n.js 里注册的）不在此处校验
  for (const key of used) {
    const missing = langs.filter(l => dict[l][key] === undefined);
    if (missing.length && missing.length < langs.length) {
      problems.push(`${id}: i18n key '${key}' 缺少 ${missing.join(' / ')} 文案（缺哪个语言，那个界面就会显示 key 本身）`);
    }
  }
}

// 每个游戏的 .vue（有的目录有多个 .vue，例如 poker）
const vueFilesOf = id =>
  readdirSync(join(GAMES_DIR, id))
    .filter(f => f.endsWith('.vue'))
    .map(f => join(GAMES_DIR, id, f));

for (const id of gameDirs) {
  const vues = vueFilesOf(id);
  const i18nPath = join(GAMES_DIR, id, 'i18n.js');
  const i18n = existsSync(i18nPath) ? read(i18nPath) : '';
  const src = vues.map(read).join('\n');

  // 0. i18n key 双语齐备（异步，见函数注释）
  await checkI18nKeys(id, i18nPath, src);

  // 1. 历史别名
  for (const key of LEGACY_KEYS) {
    if (src.includes(`i18n('${key}')`)) {
      problems.push(`${id}: 模板仍在用历史别名 i18n('${key}')，按规范应改用 replayLevel / nextLevel / reveal`);
    }
  }

  // 2. .game-icon 特例类：只看**按钮上用到的**（棋盘牌面也大量用 .game-icon v-1024 这类类名，
  //    全扫会几百条误报）+ CSS 里的复合写法 .game-icon.X
  const specials = new Set();
  for (const m of src.matchAll(/\.game-icon\.([a-z][a-z0-9-]*)/g)) specials.add(m[1]);
  for (const m of src.matchAll(/<button[^>]*class="game-icon ([a-z][a-z0-9-]*)"/g)) specials.add(m[1]);
  for (const sp of specials) {
    if (!ALLOWED_SPECIALS.has(sp)) {
      problems.push(`${id}: .game-icon.${sp} 不在允许的特例里（只允许 ${[...ALLOWED_SPECIALS].join(' / ')}；空类请删掉）`);
    }
  }

  // 3. 按钮文案的 emoji 前缀
  for (const [key, emoji] of Object.entries(EMOJI)) {
    const re = new RegExp(`\\n\\s*${key}: '([^']*)'`, 'g');
    const vals = [...i18n.matchAll(re)].map(m => m[1]);
    if (!vals.length) continue;
    for (const v of vals) {
      if (!v.startsWith(emoji)) {
        problems.push(`${id}/i18n.js: ${key} 的文案「${v}」缺少规范前缀 ${emoji}`);
      }
    }
  }

  // 4. 清记录覆盖：有存档就必须能清
  const writes = /localStorage\.setItem|(?:BEST|LEVEL|STATE|STREAK|MODE)_KEY\s*=/.test(src);
  if (writes) {
    const headerTag = src.match(/<TopHeader[^>]*>/s);
    const bound = headerTag && /@onScoreReset/.test(headerTag[0]);
    if (!bound) {
      problems.push(`${id}: 有 localStorage 存档，但 <TopHeader> 没有绑 @onScoreReset（连点标题清记录不会生效）`);
    } else if (!/clearGameStorage\(/.test(src)) {
      problems.push(`${id}: onScoreReset 里没有用 clearGameStorage('<自己的前缀>') 清扫存档（逐 key removeItem 容易漏）`);
    }
  }

  // 4.5 结算层里出现两颗以上按钮时，必须包在按钮行里
  //    （裸放的话会被 .result 的纵向 flex 竖排 —— 对对碰/消消乐/连连看/排序/雀圣/大师 都踩过：
  //     本来是单按钮，补齐「重玩本关 + 下一关」后两颗就上下换行了）
  for (const m of src.matchAll(/<div[^>]*class="[^"]*(?:\bwin\b|\blose\b|pick-mask)[^"]*"[^>]*>/g)) {
    const seg = src.slice(m.index, m.index + 2200);
    const cut = seg.search(/<\/div>\s*\n\s*<div[^>]*class="result-actions/);
    const block = cut > 0 ? seg.slice(0, cut) : seg;
    const btns = [...block.matchAll(/<button[^>]*class="[^"]*game-icon/g)].length;
    if (btns >= 2 && !/class="result-(actions|btns)"/.test(block)) {
      problems.push(`${id}: 结算层里有 ${btns} 颗按钮但没有包在 .result-actions 里（.result 是纵向 flex，会上下换行）`);
    }
  }

  // 5. 提示：获胜层缺「重玩本关」
  const winStart = src.search(/<div[^>]*class="[^"]*\bwin\b[^"]*"/);
  if (winStart >= 0) {
    // 取获胜层开始后的 2500 字符（足够覆盖标题 + 动态值 + 按钮，不用配平 div）
    const winBlock = src.slice(winStart, winStart + 2500);
    const winEnd = winBlock.indexOf('result lose') >= 0 ? winBlock.indexOf('result lose') : winBlock.length;
    const only = winBlock.slice(0, winEnd);
    if (/i18n\('nextLevel'\)/.test(only) && !/i18n\('replayLevel'\)/.test(only)) {
      hints.push(`${id}: 获胜层有「下一关」但没有「重玩本关」（无关卡概念的游戏可忽略）`);
    }
  }
}

console.log(`检查了 ${gameDirs.length} 个游戏的交互与结算规范。`);
if (problems.length) {
  console.log(`\n✗ 问题 ${problems.length} 条：`);
  for (const p of problems) console.log(`  · ${p}`);
} else {
  console.log('✓ 交互与结算规范自检全部通过');
}
if (hints.length) {
  console.log(`\n提示（不判失败，见各游戏分册）：`);
  for (const h of hints) console.log(`  · ${h}`);
}
process.exit(problems.length ? 1 : 0);
