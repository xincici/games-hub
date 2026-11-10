// 震动反馈：和音效一样有独立开关（__games_hub__haptic，默认开）。
// 只在「有语义的瞬间」震：消除 / 失败 / 成功 / 里程碑；带节流，避免连击时一直震。
const { getRaw, setRaw } = require('./storage');

const KEY = '__games_hub__haptic';
let lastAt = 0;

function enabled() {
  return getRaw(KEY, '1') !== '0';
}

function setEnabled(on) {
  setRaw(KEY, on ? '1' : '0');
}

// type: 'light' | 'medium' | 'heavy'（部分基础库不支持 type，失败就按默认震一下）
function buzz(type, gap) {
  if (!enabled()) return false;
  const now = Date.now();
  if (now - lastAt < (gap == null ? 45 : gap)) return false;
  lastAt = now;
  try {
    if (typeof wx === 'undefined' || !wx.vibrateShort) return false;
    const ret = wx.vibrateShort({ type });
    // 有的环境返回 Promise，拒了也别抛到游戏里
    if (ret && typeof ret.catch === 'function') ret.catch(() => {});
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  get enabled() { return enabled(); },
  setEnabled,
  tap: () => buzz('light'),        // 消除一下 / 点中
  success: () => buzz('medium'),   // 胜利 / 破纪录 / 解锁
  fail: () => buzz('medium', 90),  // 扣心 / 失败
  heavy: () => buzz('heavy', 140), // 里程碑（整 50 分之类）
  // 测试用：清掉节流窗口
  resetThrottle() { lastAt = 0; },
};
