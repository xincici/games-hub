import { ref, watch } from 'vue';

import { DICE_KEY } from './constants.js';

export const dice = ref(Boolean(localStorage.getItem(DICE_KEY)));

watch(dice, val => {
  if (val) localStorage.setItem(DICE_KEY, 1);
  else localStorage.removeItem(DICE_KEY);
});

export const toggle = function() {
  dice.value = !dice.value;
};

