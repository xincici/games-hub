// 穿墙开关（从 web 的 src/games/snake/wall.js 复制，**只改了存储适配层**：
// web 用 localStorage，小程序必须走 core/storage 的 uni 存储；key 一字不改）。
import { ref, watch } from 'vue';

import { getRaw, setRaw } from '@/core/storage';

const WALL_KEY = '__snake_game__through_wall';

// 穿墙模式：撞墙不死，从对面钻出。
// **默认开启** —— 只有显式存过 '0'（玩家自己关掉过）才算关。
// 两种状态都要显式落档：否则「关掉」会变成删 key，下次进来又落回默认的开。
export const throughWall = ref(getRaw(WALL_KEY) !== '0');

export const toggle = () => {
  throughWall.value = !throughWall.value;
};

watch(throughWall, val => {
  setRaw(WALL_KEY, val ? '1' : '0');
});
