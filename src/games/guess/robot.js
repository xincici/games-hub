import { ref, watch } from 'vue';

const storageKey = '__guess_number__robot'
export const robot = ref(Boolean(localStorage.getItem(storageKey)));

watch(robot, val => {
  if (val) localStorage.setItem(storageKey, 1);
  else localStorage.removeItem(storageKey);
});

export const toggle = function() {
  robot.value = !robot.value;
};

