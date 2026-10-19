import { ref, watch } from 'vue';

import { DICE_KEY } from './constants.js';

// 猜大小**默认开启**（用户要求）。关掉时必须显式存 '0' —— 原来关掉是 removeItem，
// 「从没动过」和「主动关掉」就分不出来了，改默认值会把主动关掉的玩家又打开。
const storedDice = localStorage.getItem(DICE_KEY);   // '1' 开 / '0' 关 / null = 没动过 → 默认开
export const dice = ref(storedDice === null ? true : storedDice === '1');

watch(dice, val => {
  localStorage.setItem(DICE_KEY, val ? '1' : '0');
});

export const toggle = function() {
  dice.value = !dice.value;
};

