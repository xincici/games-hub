#!/usr/bin/env node
// 冒烟：构建产物起 preview + headless Chrome，逐路由看「有没有渲染出来 / 有没有控制台异常」。
// 用法：node scripts/smoke.mjs [--sizes 375x667,390x844] [--routes all|mirror,quesheng] [--json]
// 自己起 preview 也自己收尾，跑完不需要手动 pkill。
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name, dflt) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : dflt; };
const SIZES = arg('sizes', '375x667,390x844').split(',').map(s => s.split('x').map(Number));
const ONLY = arg('routes', 'all');
const JSON_OUT = argv.includes('--json');
const PREVIEW_PORT = 4173, CDP_PORT = 10960;
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 路由从注册表推导（永远和实际一致）；首页 + 各游戏
const registry = readFileSync(path.join(ROOT, 'src/shared/games.js'), 'utf8');
const routes = ['/', ...[...registry.matchAll(/path:\s*'\/([a-z0-9]+)'/g)].map(m => '/#/' + m[1])];
const picked = ONLY === 'all' ? routes : routes.filter(r => ONLY.split(',').some(k => r.includes(k)));

// 处理慢的游戏：emoji 镜像开局有约 4s 的不可操作发牌序列
const settle = r => (r === '/#/mirror' ? 6500 : 1400);

const preview = spawn('node_modules/.bin/vite', ['preview', '--port', String(PREVIEW_PORT), '--strictPort'],
  { cwd: ROOT, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=/tmp/dsh-smoke-${process.pid}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill(); } catch {} try { preview.kill(); } catch {} };
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

let list = null;
for (let i = 0; i < 80 && !list; i++) {
  try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`); const j = await r.json(); if (j.length) list = j; } catch {}
  if (!list) await sleep(250);
}
if (!list) { console.error('✗ 连不上 Chrome（CDP 端口 ' + CDP_PORT + '）'); cleanup(); process.exit(1); }

const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
let problems = [];
const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise((res, rej) => { pending.set(i, { res, rej }); setTimeout(() => pending.has(i) && (pending.delete(i), rej(new Error('CDP 超时: ' + method))), 30000); }); };
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
  if (m.method === 'Runtime.exceptionThrown') problems.push('未捕获异常: ' + String(m.params.exceptionDetails.exception?.description || '').slice(0, 160));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') problems.push('console.error: ' + m.params.entry.text.slice(0, 160));
});
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
const evaluate = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
const isNoise = t => /favicon|manifest|sw\.js|ServiceWorker/i.test(t);

const rows = [];
for (const [w, h] of SIZES) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
  for (const route of picked) {
    problems = [];
    await send('Page.navigate', { url: `http://localhost:${PREVIEW_PORT}${route}` });
    await sleep(settle(route));
    const nodes = await evaluate(`document.querySelectorAll('.wrapper *').length`);
    const metrics = await evaluate(`(async () => { const hx = document.documentElement.scrollWidth - innerWidth;
      window.scrollTo(0, 9999); await new Promise(r => setTimeout(r, 120));
      const v = Math.round(window.scrollY); window.scrollTo(0, 0);
      return { 横向: Math.max(0, hx), 纵向: v }; })()`);
    const errs = problems.filter(t => !isNoise(t));
    rows.push({ size: `${w}×${h}`, route, nodes, ...metrics, errors: errs,
      ok: nodes >= 5 && errs.length === 0 });
  }
}
const failed = rows.filter(r => !r.ok);
if (JSON_OUT) console.log(JSON.stringify({ rows, failed: failed.length }, null, 2));
else {
  for (const r of rows) console.log(`${r.ok ? '✓' : '✗'} ${r.size} ${r.route.padEnd(14)} 元素 ${String(r.nodes).padStart(4)} · 横向溢出 ${r.横向} · 纵向 ${r.纵向}${r.errors.length ? ' · ' + r.errors.join(' | ') : ''}`);
  const scrolled = rows.filter(r => r.横向 > 0 || r.纵向 > 0);
  console.log(`\n${failed.length ? '✗' : '✓'} 冒烟 ${rows.length} 项，失败 ${failed.length}`);
  if (scrolled.length) console.log(`  提示（不判失败，见各分册「已知情况」）：${scrolled.map(r => `${r.size} ${r.route} 横向${r.横向}/纵向${r.纵向}`).join('、')}`);
}
try { ws.close(); } catch {}
cleanup();
process.exit(failed.length ? 1 : 0);
