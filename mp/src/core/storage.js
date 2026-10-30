// 存储适配层：web 用 localStorage，小程序用 uni 的同步存储。
// **key 与 web 完全一致**（__game_2048__state 等），将来两端数据可以互相迁移。
export const getRaw = (key) => {
  try {
    const v = uni.getStorageSync(key);
    return v === '' || v === undefined || v === null ? null : v;
  } catch {
    return null;
  }
};

export const setRaw = (key, val) => {
  try { uni.setStorageSync(key, val); } catch { /* 存储满了也不影响玩 */ }
};

export const getJSON = (key, fallback = null) => {
  const raw = getRaw(key);
  if (raw === null) return fallback;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return fallback; }
};

export const setJSON = (key, val) => setRaw(key, JSON.stringify(val));
