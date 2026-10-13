# 验证套路（`docs/VERIFY.md`）

没有单测和 lint，**验证 = 构建 + 浏览器实测**。两个脚本已经把常用的部分固化了，
别再每次现写一遍 CDP 脚本（那正是上一轮踩坑最多的地方：脚本自身的 bug 会被当成产品的 bug）。

## 三档验证

| 档 | 做什么 | 何时用 |
| --- | --- | --- |
| ① 构建 | `yarn build`，**看退出码** | 每次都做 |
| ② 冒烟 | `node scripts/smoke.mjs`（23 路由 × 375×667 / 390×844，看控制台异常与渲染不出） | 改完必做 |
| ③ 针对性量测 | 自己写一小段页内脚本，**只量这次改的那件事**，并和「改之前」对比 | 改了动画/尺寸/状态机/存档 |

`scripts/smoke.mjs` 会自己起 `vite preview` 与 headless Chrome 并收尾，**不要**再手动 `pkill`。

## 量测的判据要挑「不会自欺」的那种

| 想量 | 别用 | 用 |
| --- | --- | --- |
| 页面能不能滚 | `body.scrollHeight` / `documentElement.scrollHeight`（后者把塌陷外边距也算进去） | `window.scrollTo(0, 9999)` 后读 `scrollY` |
| 文字有没有被截断 | 肉眼看截图 | 逐个比 `scrollWidth > clientWidth` |
| UnoCSS 图标有没有渲染出来 | `background-image`（presetIcons 用的是 mask，永远是 `none`） | `webkitMaskImage` 或截图 |
| 动画有没有播 | 「看起来在动」 | 监听 `transitionstart` / 逐帧采样 `getComputedStyle().transform` |
| 游戏状态对不对 | 读页面上渲染出来的文字 | 读 `localStorage` 里的存档（渲染文案可能被 i18n / 四舍五入影响） |
| 每个元素表现是否一致 | 看总数 | **按元素分别计数**（「共 16 次过渡」看不出「4 张各 4 次」还是「3/5/4/4」） |

## 常用片段（粘进 `Runtime.evaluate`）

```js
// 逐帧采样 + 过渡计数（起在导航之前，用 Page.addScriptToEvaluateOnNewDocument 更保险）
window.__rec = { starts: [], frames: [] };
document.addEventListener('transitionstart', e => { /* 记 e.target 与 propertyName */ }, true);
(function loop(){ window.__rec.frames.push(/* 采样 */); if (window.__rec.frames.length < 140) requestAnimationFrame(loop); })();

// 对比度（挑按钮/文字颜色时必算，项目要求 ≥4.5:1）
const lum = h => { const m = h.match(/\d+/g).slice(0,3).map(x=>+x/255)
  .map(c => c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055,2.4));
  return 0.2126*m[0]+0.7152*m[1]+0.0722*m[2]; };
const ratio = (a,b) => { const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05); };
```

## 收尾

- 每个场景用**全新页面**，别让上一个场景的监听器/存档串味（重复装监听会导致计数翻倍，
  上一轮就因为「16 次全坏」其实是自己正则写错而白忙一次）。
- 跑完确认没有残留进程（脚本会自己 `pkill`；手写脚本时记得）。
- 把关键实测数字写进分册（例如「16 局全 0」「逐卡各 3 次」），下次才有基线可比。
