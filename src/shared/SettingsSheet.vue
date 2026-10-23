<template>
  <Teleport to="body">
    <!-- 外壳只负责投影：filter 作用在裁剪**之后**的轮廓上，于是阴影跟着圆形边缘走；
         完全展开后圆边移出屏幕，阴影也就自然看不见了。 -->
    <div class="settings-shell">
      <div
        class="settings-layer"
        :class="{ open: settingsOpen, snapping: settingsSnapping }"
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
              <span class="seg-slider" :style="{ '--i': themeIndex }" aria-hidden="true" />
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
              <span class="seg-slider" :style="{ '--i': langIndex }" aria-hidden="true" />
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

          <section class="block">
          <h3>{{ i18n('face') }}</h3>
          <div class="seg">
            <span class="seg-slider" :style="{ '--i': faceIndex }" aria-hidden="true" />
            <button
              v-for="opt in faceOptions"
              :key="opt.value"
              class="seg-item"
              :class="{ on: facePref === opt.value }"
              @click="setFacePref(opt.value)"
            >
              <span>{{ opt.label }}</span>
            </button>
          </div>
        </section>

        <section class="block switches">
            <button class="switch-row" :class="{ on: musicOn }" @click="toggleMusic">
              <span class="switch-icon"><i i-mdi-music-note /></span>
              <span class="switch-text">
                <strong>{{ i18n('music') }}</strong>
              </span>
              <span class="switch" :class="{ on: musicOn }" aria-hidden="true"><span class="knob" /></span>
            </button>

            <button class="switch-row" :class="{ on: sfxOn }" @click="toggleSfx">
              <span class="switch-icon"><i i-mdi-volume-high /></span>
              <span class="switch-text">
                <strong>{{ i18n('sfx') }}</strong>
              </span>
              <span class="switch" :class="{ on: sfxOn }" aria-hidden="true"><span class="knob" /></span>
            </button>
          </section>
        </div>
      </div>
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
  </Teleport>
</template>

<script setup>
// 设置浮层：从点击的设置图标**圆形扩张**铺满全屏，图标同时变成关闭。
// 所有选项即时生效（主题 / 语言立刻应用、音乐立刻起停），没有「保存」按钮。
import { computed, onMounted, onUnmounted, watch } from 'vue';

import { i18n } from '@/shared/i18n';
import {
  themeMode, langMode, facePref, musicOn, sfxOn,
  setThemeMode, setLangMode, setFacePref, FACE_MODES,
} from '@/shared/settings';
import { settingsOpen, settingsOrigin, settingsSnapping, closeSettings } from '@/shared/ui';

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

// 滑块要去第几格：跟随系统 = 0、第二项 = 1、第三项 = 2
const themeIndex = computed(() => Math.max(0, themeOptions.value.findIndex(o => o.value === themeMode.value)));
const langIndex = computed(() => Math.max(0, langOptions.value.findIndex(o => o.value === langMode.value)));

const faceIndex = computed(() => Math.max(0, FACE_MODES.indexOf(facePref.value)));
const faceOptions = computed(() => [
  { value: 'emoji', label: i18n('faceEmoji') },
  { value: 'poker', label: i18n('facePoker') },
  { value: 'mahjong', label: i18n('faceMahjong') },
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
.settings-shell {
  position: fixed;
  inset: 0;
  z-index: 90;
  pointer-events: none;
  // 双层投影：贴身一层让边缘清楚，外面一层柔和地铺开
  filter: drop-shadow(0 0 1.5px rgba(0, 0, 0, 0.5)) drop-shadow(0 0 16px rgba(0, 0, 0, 0.45));
}

.settings-layer {
  position: absolute;
  inset: 0;
  background: var(--bg-color);
  // 圆心是点击时那颗按钮的中心（视口坐标），半径从 0 扩到 150vmax 覆盖全屏
  clip-path: circle(0px at var(--ox, 50%) var(--oy, 0%));
  // 展开 / 收起：0.6s（比原来慢一点点）+ ease-in-out（起步慢、中段快、收尾也慢）
  // will-change 让浏览器把 clip-path 交给合成层，扩张更顺、不抖
  will-change: clip-path;
  transition: clip-path 0.6s ease-in-out, visibility 0.6s;
  visibility: hidden;
  pointer-events: none;
  overflow-y: auto;
  overscroll-behavior: contain;

  &.open {
    clip-path: circle(150vmax at var(--ox, 50%) var(--oy, 0%));
    visibility: visible;
    pointer-events: auto;   // 外壳是 pointer-events: none，只有打开时才由这一层接管
  }

  // 正在无过渡地挪圆心：这一帧不许播过渡
  &.snapping {
    transition: none;
  }
}

.sheet {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 50px 20px 40px;
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
  padding: 12px 16px;
  box-shadow: var(--shadow-soft);
  display: flex;
  flex-direction: column;
  gap: 10px;

  h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--muted-color);
    letter-spacing: 0.3px;
  }
}

.seg {
  position: relative;
  display: flex;
  gap: 6px;
  padding: 4px;
  border-radius: 14px;
  background: var(--bg-color);
}

// 选中态是一块**共享滑块**：从上一个选项滑到下一个（而不是各画各的背景）
// width = (100% − 左右 padding 8px − 两个 gap 12px) / 3；位移 = i × (自身宽度 + gap)
// （transform 里的 100% 指滑块自己的宽度，所以不用硬算像素）
.seg-slider {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: calc((100% - 20px) / 3);
  border-radius: 11px;
  background: var(--primary-bg);
  box-shadow: var(--shadow-soft);
  transform: translateX(calc(var(--i, 0) * (100% + 6px)));
  transition: transform 0.32s cubic-bezier(0.34, 1.25, 0.5, 1);
  pointer-events: none;
}

.seg-item {
  position: relative;
  z-index: 1;
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

  // 选中时只有文字变白 —— 背景由上面那块滑块负责
  &.on {
    color: #fff;
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
    justify-content: center;
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
  // 必须高于 .settings-shell（z-index 90），否则会被浮层盖住、点不到
  z-index: 95;
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
  // 隐藏时**必须**放弃命中测试：关闭按钮就压在设置按钮上，
  // 否则浮层关掉之后那颗隐形按钮会把「点设置」全部吃掉（点一次就再也打不开）
  pointer-events: none;
  transition: opacity 0.2s ease, transform 0.26s cubic-bezier(0.34, 1.4, 0.5, 1);

  &.show {
    opacity: 1;
    pointer-events: auto;
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
