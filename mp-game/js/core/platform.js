// 平台判定（带缓存）。
//
// 为什么要单独一个模块：emoji 居中策略要按平台分流 —— Android 上 `measureText` 常缺
// `actualBoundingBox`、且字体是 Noto Color Emoji，需要按真实墨迹框重新居中；
// iOS / 开发者工具上现有的「墨迹 + 0.18em 光学补偿」已经调好，**不能再动**。
//
// 判定要宽松一点：`wx.getDeviceInfo()` 和 `wx.getSystemInfoSync()` 取所有能拿到的字段拼起来匹配，
// 因为不同基础库版本返回的字段不一致（有的只给 platform，有的只有 system 里带 'iOS 17.x'）。

let cached = null;

function raw() {
  if (cached != null) return cached;
  const parts = [];
  try {
    if (wx.getSystemInfoSync) {
      const s = wx.getSystemInfoSync() || {};
      parts.push(s.platform, s.system, s.model);
    }
  } catch (e) { /* ignore */ }
  try {
    if (wx.getDeviceInfo) {
      const d = wx.getDeviceInfo() || {};
      parts.push(d.platform, d.system, d.model);
    }
  } catch (e) { /* ignore */ }
  cached = parts.filter(Boolean).join(' ').toLowerCase();
  return cached;
}

// 只有在**确定**是 Android 时才返回 true；iOS / devtools / 未知一律 false，
// 让 emoji 继续走已经调好的老逻辑。
function isAndroid() {
  return /android/.test(raw());
}

function isIOS() {
  return /ios|iphone|ipad|ipod/.test(raw());
}

// 冒烟脚本用：换掉假 wx 的平台后清缓存
function resetCache() {
  cached = null;
}

module.exports = { isAndroid, isIOS, resetCache, raw };
