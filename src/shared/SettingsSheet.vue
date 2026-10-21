<template>
  <Teleport to="body">
    <div
      class="settings-layer"
      :class="{ open: settingsOpen }"
      :style="layerStyle"
      role="dialog"
      aria-modal="true"
      @click.self="close"
    >
      <div class="sheet" @click.stop>
        <div class="hero">
          <span class="hero-badge"><i i-mdi-cogs /></span>
          <h2>{{ i18n('settingsTitle') }}</h2>
        </div>

        <section class="block">
          <h3>{{ i18n('theme') }}</h3>
          <div class="seg">
            <button
              v-for="opt in themeOptions"
              :key="opt.value"
              class="seg-item"
              :class="{ on: themeMode === opt.value }"
              @click="setThemeMode(opt.value)"
            >
              <i :class="opt.icon" />
              <span>{{ opt.label }}</span>
            </button>
          </div>
        </section>

        <section class="block">
          <h3>{{ i18n('language') }}</h3>
          <div class="seg">
            <button
              v-for="opt in langOptions"
              :key="opt.value"
              class="seg-item"
              :class="{ on: langMode === opt.value }"
              @click="setLangMode(opt.value)"
            >
              <i v-if="opt.icon" :class="opt.icon" />
              <span>{{ opt.label }}</span>
            </button>
          </div>
        </section>

        <section class="block switches">
          <button class="switch-row" :class="{ on: musicOn }" @click="toggleMusic">
            <span class="switch-icon"><i i-mdi-music-note /></span>
            <span class="switch-text">
              <strong>{{ i18n('music') }}</strong>
              <small>{{ i18n('musicHint') }}</small>
            </span>
            <span class="switch" :class="{ on: musicOn }" aria-hidden="true"><span class="knob" /></span>
          </button>

          <button class="switch-row" :class="{ on: sfxOn }" @click="toggleSfx">
            <span class="switch-icon"><i i-mdi-volume-high /></span>
            <span class="switch-text">
              <strong>{{ i18n('sfx') }}</strong>
              <small>{{ i18n('sfxHint') }}</small>
            </span>
            <span class="switch" :class="{ on: sfxOn }" aria-hidden="true"><span class="knob" /></span>
          </button>
        </section>
      </div>

      <button
        class="close-btn"
        :class="{ show: settingsOpen }"
        :style="closeStyle"
        :aria-label="i18n('settingsClose')"
        @click="close"
      >
        <i i-mdi-close />
      </button>
    </div>
  </Teleport>
</template>

<script setup>
// 设置浮层：从点击的设置图标**圆形扩张**铺满全屏，图标同时变成关闭。
// 所有选项即时生效（主题 / 语言立刻应用、音乐立刻起停），没有「保存」按钮。
import { computed, onMounted, onUnmounted, watch } from 'vue';

import { i18n } from '@/shared/i18n';
import { themeMode, langMode, musicOn, sfxOn, setThemeMode, setLangMode } from '@/shared/settings';
import { settingsOpen, settingsOrigin, closeSettings } from '@/shared/ui';

const layerStyle = computed(() => ({
  '--ox': `${settingsOrigin.value.x}px`,
  '--oy': `${settingsOrigin.value.y}px`,
}));

// 关闭按钮贴在与设置按钮**完全相同**的位置与尺寸上（这个矩形是点击时当场量的）
const closeStyle = computed(() => {
  const o = settingsOrigin.value;
  return {
    left: `${o.left}px`,
    top: `${o.top}px`,
    width: `${o.width}px`,
    height: `${o.height}px`,
  };
});

const themeOptions = computed(() => [
  { value: 'system', icon: 'i-carbon-laptop', label: i18n('followSystem') },
  { value: 'light', icon: 'i-carbon-sun', label: i18n('light') },
  { value: 'dark', icon: 'i-carbon-moon', label: i18n('dark') },
]);

const langOptions = computed(() => [
  { value: 'system', icon: 'i-carbon-laptop', label: i18n('followSystem') },
  { value: 'cn', icon: '', label: i18n('chinese') },
  { value: 'en', icon: '', label: i18n('english') },
]);

const close = () => closeSettings();
const toggleMusic = () => { musicOn.value = !musicOn.value; };
const toggleSfx = () => { sfxOn.value = !sfxOn.value; };

function onKeydown(e) {
  if (e.key === 'Escape' && settingsOpen.value) close();
}

// 打开时锁住页面滚动（否则浮层后面的首页还能往下拖）
watch(settingsOpen, open => {
  document.body.classList.toggle('settings-locked', open);
});

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
  document.body.classList.remove('settings-locked');
});
</script>

<style scoped lang="scss">
.settings-layer {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: var(--bg-color);
  // 圆心是点击时那颗按钮的中心（视口坐标），半径从 0 扩到 150vmax 覆盖全屏
  clip-path: circle(0px at var(--ox, 50%) var(--oy, 0%));
  transition: clip-path 0.52s cubic-bezier(0.22, 0.9, 0.26, 1), visibility 0.52s;
  visibility: hidden;
  pointer-events: none;
  overflow-y: auto;
  overscroll-behavior: contain;

  &.open {
    clip-path: circle(150vmax at var(--ox, 50%) var(--oy, 0%));
    visibility: visible;
    pointer-events: auto;
  }
}

.sheet {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 76px 20px 40px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 18px;
  // 内容比圆形晚一点出现，扩张过程中不会被裁得七零八落
  opacity: 0;
  transform: scale(0.96);
  transition: opacity 0.28s ease 0.16s, transform 0.34s cubic-bezier(0.22, 0.9, 0.26, 1) 0.16s;

  .open & {
    opacity: 1;
    transform: scale(1);
  }
}

.hero {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 4px 2px;

  .hero-badge {
    width: 38px;
    height: 38px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    color: #fff;
    background: linear-gradient(135deg, var(--primary-bg), #37a06a);
    box-shadow: var(--shadow-soft);

    i {
      font-size: 21px;
    }
  }

  h2 {
    margin: 0;
    font-size: 21px;
    letter-spacing: 0.5px;
  }
}

.block {
  background: var(--card-bg-color);
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  padding: 16px;
  box-shadow: var(--shadow-soft);
  display: flex;
  flex-direction: column;
  gap: 12px;

  h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--muted-color);
    letter-spacing: 0.3px;
  }
}

.seg {
  display: flex;
  gap: 6px;
  padding: 4px;
  border-radius: 14px;
  background: var(--bg-color);
}

.seg-item {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 6px;
  border: 0;
  border-radius: 11px;
  background: transparent;
  color: var(--text-color);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;

  i {
    font-size: 17px;
  }

  span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &.on {
    background: var(--primary-bg);
    color: #fff;
    box-shadow: var(--shadow-soft);
  }

  &:not(.on):active {
    transform: scale(0.97);
  }
}


.switches {
  gap: 10px;
}

.switch-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: var(--bg-color);
  color: var(--text-color);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;

  &:active {
    transform: scale(0.99);
  }

  .switch-icon {
    width: 34px;
    height: 34px;
    flex: none;
    border-radius: 11px;
    display: grid;
    place-items: center;
    color: var(--muted-color);
    background: var(--card-bg-color);
    transition: color 0.18s ease, background 0.18s ease;

    i {
      font-size: 19px;
    }
  }

  .switch-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;

    strong {
      font-size: 14px;
      font-weight: 600;
    }

    small {
      font-size: 11.5px;
      color: var(--muted-color);
    }
  }

  &.on {
    .switch-icon {
      color: #fff;
      background: linear-gradient(135deg, var(--primary-bg), #37a06a);
    }
  }
}

// 开关本体：圆角轨道 + 会滑的小球
.switch {
  position: relative;
  flex: none;
  width: 46px;
  height: 28px;
  border-radius: 999px;
  background: var(--border-color);
  transition: background 0.22s ease;

  .knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.28);
    transition: transform 0.24s cubic-bezier(0.34, 1.4, 0.5, 1);
  }

  &.on {
    background: var(--primary-bg);

    .knob {
      transform: translateX(18px);
    }
  }
}

// 关闭按钮：位置与尺寸由 JS 按「点击时那颗设置按钮的矩形」写进内联样式，
// 所以它和设置按钮像素级重合（不再 hard-code top/right 去猜顶栏的布局）。
.close-btn {
  position: fixed;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--text-color);
  // 与顶栏那颗设置图标同字号（实测 20px），这样"同一颗按钮"的观感是连续的
  font-size: 20px;
  cursor: pointer;
  opacity: 0;
  transform: scale(0.6) rotate(-90deg);
  transition: opacity 0.2s ease, transform 0.26s cubic-bezier(0.34, 1.4, 0.5, 1);

  &.show {
    opacity: 1;
    transform: scale(1) rotate(0deg);
    transition-delay: 0.3s;
  }
}
</style>

<style lang="scss">
// 浮层打开时锁住页面滚动（全局，因为 body 在 App.vue 之外）
body.settings-locked {
  overflow: hidden;
}
</style>
