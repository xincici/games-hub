import { ref, watch } from 'vue';

const WALL_KEY = '__snake_game__through_wall';

// 穿墙模式：撞墙不死，从对面钻出
export const throughWall = ref(Boolean(localStorage.getItem(WALL_KEY)));

export const toggle = () => {
  throughWall.value = !throughWall.value;
};

watch(throughWall, val => {
  if (val) localStorage.setItem(WALL_KEY, 1);
  else localStorage.removeItem(WALL_KEY);
});
