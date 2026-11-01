// 小游戏 wx.*StorageSync 与小程序同源；这里保持与 web / 小程序完全一致的 key。
function getRaw(key, fallback) {
  try {
    const value = wx.getStorageSync(key);
    return value === '' || value === undefined || value === null ? fallback : value;
  } catch (e) {
    return fallback;
  }
}

function setRaw(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (e) {
    // 存储满 / 隐私限制时不影响游玩
  }
}

function removeRaw(key) {
  try {
    wx.removeStorageSync(key);
  } catch (e) {
    // ignore
  }
}

function clearPrefix(prefix) {
  try {
    const info = wx.getStorageInfoSync();
    (info.keys || []).forEach((key) => {
      if (String(key).indexOf(prefix) === 0) wx.removeStorageSync(key);
    });
  } catch (e) {
    // ignore
  }
}

module.exports = { getRaw, setRaw, removeRaw, clearPrefix };
