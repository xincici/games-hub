// 各游戏共用的「清记录」（连点标题 5 次那个彩蛋）。
//
// 约定（详见 docs/CONVENTIONS.md 的「连点标题清记录」一节）：
//   清掉该游戏**全部**存档（记录 / 进度 / 局面），但保留「偏好类」key —— 模式（emoji / 扑克 / 麻将）
//   与难度这类玩家主动选的设置不该被顺手清掉。
//
// 各游戏只需在 onScoreReset() 里调一次：
//   clearGameStorage('__emoji_master__');   // 前缀就是该游戏自己的存档前缀
//   bestScore.value = 0; deal(1);           // 再复位内存里的值（这部分各游戏自己写）
//
// 为什么用「前缀清扫」而不是逐 key removeItem：各游戏 key 名不一致（有的带难度下标、有的带模式后缀），
// 逐条写很容易漏（历史上 three / 2048 / 贪吃蛇 / 大师 / 麻将传奇 的彩蛋就完全没生效，
// 雀圣的处理器还是个空箭头），清扫前缀是唯一不容易漏的写法。

// 前缀之后跟着这些词的 key 视为「偏好」，不清
const KEEP_SUFFIXES = ['mode', 'difficulty', 'theme', 'speed', 'lang', 'help_showed', 'dice', 'bet'];

export function clearGameStorage(prefix, { keep = KEEP_SUFFIXES } = {}) {
  if (!prefix) return;
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      if (keep.some(s => rest === s || rest.endsWith(`_${s}`) || rest.endsWith(s))) continue;
      localStorage.removeItem(key);
    }
  } catch {
    /* 隐私模式 / 存储被禁用时 localStorage 会抛异常，忽略即可 */
  }
}

// 需要精确控制时用这个（例如只想清某几个 key）
export function clearKeys(keys) {
  try {
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    /* 同上 */
  }
}
