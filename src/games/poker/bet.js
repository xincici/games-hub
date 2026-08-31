import { ref, watchEffect } from 'vue';

import { BET_KEY } from './constants.js';

const INIT_BET = 10;
export const MIN_BET = 1;
export const MAX_BET = 100;

export const bet = ref(+localStorage.getItem(BET_KEY) || INIT_BET);

watchEffect(() => {
  localStorage.setItem(BET_KEY, bet.value);
});

export function changeBet(diff) {
  if (bet.value === MIN_BET && diff < 0 || bet.value === MAX_BET && diff > 0) return;
  bet.value += diff;
}
