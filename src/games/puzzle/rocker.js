import { ref, watch } from 'vue';

const storageKey = '__number_puzzle_rocker'
export const rocker = ref(Boolean(localStorage.getItem(storageKey)));

watch(rocker, val => {
  if (val) localStorage.setItem(storageKey, 1);
  else localStorage.removeItem(storageKey);
});

export const toggle = function() {
  rocker.value = !rocker.value;
};

