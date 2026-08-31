<template>
  <div class="wrapper">
    <TopHeader :show-help="false" />
    <div class="game-list">
      <div class="list-inner">
        <router-link
          v-for="game in games"
          :key="game.id"
          :to="game.path"
          class="game-card"
          @click="setLaunchOrigin($event.currentTarget)"
        >
          <i :class="game.icon" />
          <span class="game-name">{{ dictOf(game.id)[language].gameTitle }}</span>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import TopHeader from './TopHeader.vue';
import { games } from '@/shared/games';
import { language, dictOf } from '@/shared/i18n';
import { setLaunchOrigin } from '@/shared/launch';
</script>

<style scoped lang="scss">
.wrapper {
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  box-sizing: border-box;
  background: var(--bg-color);
  color: var(--text-color);
}
.game-list {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 70px 16px 24px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: calc(100vh - 94px);
  min-height: calc(100dvh - 94px);
  > .list-inner {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 16px;
  }
  .game-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 28px 12px;
    text-decoration: none;
    color: var(--text-color);
    background: var(--card-bg-color);
    border: 1px solid var(--border-color);
    border-radius: var(--card-radius);
    box-shadow: var(--card-shadow);
    i {
      font-size: 44px;
      color: var(--primary-bg);
    }
    .game-name {
      font-size: 16px;
      font-weight: bold;
    }
    &:active {
      transform: scale(0.97);
    }
  }
}
</style>
