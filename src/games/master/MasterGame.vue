<template>
  <div class="wrapper" :style="layout.vars">
    <!-- 模式开关：emoji ⇄ 麻将牌（放在帮助图标旁边，照 猎手的「emoji ↔ 扑克牌」写法） -->
    <TopHeader @onScoreReset="onScoreReset">
      <span class="item-wrapper" :title="i18n('modeTip')" @click="switchMode">
        <i v-if="mode === 'emoji'" i-mdi-emoticon-happy-outline />
        <i v-else-if="mode === 'poker'" i-mdi-cards-playing-outline />
        <i v-else i-dinkie-icons-three-of-circles-mahjong />
      </span>
    </TopHeader>
    <div class="card score-area">
      <div class="stat">
        <span class="stat-label">{{ i18n('level') }}</span>
        <span class="stat-value">{{ level }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('remain') }}</span>
        <span class="stat-value">{{ tiles.length }}</span>
      </div>
      <!-- 本关进度条（已消除卡片 / 本关总卡片） -->
      <div class="progress"><div class="progress-bar" :style="{ width: `${progress}%` }"></div></div>
    </div>
    <div class="card opt-area">
      <div class="opt-half">
        <span class="level-note">{{ boardLabel }}</span>
      </div>
      <div class="divider"></div>
      <div class="start-wrapper">
        <button class="game-icon" @click="confirming = true">{{ i18n('start') }}</button>
      </div>
    </div>
    <div class="board-wrap dot-board">
      <div class="board">
        <div
          v-for="tile in tiles"
          :key="`${gameId}-${tile.id}`"
          class="tile"
          :class="[`depth-${coverDepth.get(tile.id) || 0}`, { covered: !freeSet.has(tile.id), poker: isPoker, mahjong: isMahjong }]"
          :style="tileStyle(tile)"
          @click="pick(tile, $event)"
        >
          <MahjongTile v-if="isMahjong" :suit="faceOf(tile.emoji).suit" :value="faceOf(tile.emoji).value" />
          <CardItem
            v-else-if="isPoker"
            mini
            :num="pokerFaceOf(tile.emoji).num"
            :type="pokerFaceOf(tile.emoji).type"
            :style="pokerTileVars"
          />
          <template v-else>{{ tile.emoji }}</template>
        </div>
      </div>
      <Transition name="win-pop">
        <div v-if="phase === WON || phase === OVER" class="result" :class="phase === WON ? 'win' : 'lose'">
          <template v-if="phase === WON">
            <span>🎉🎉 {{ i18n('tipWin') }} 🎉🎉</span>
            <span class="level-note">{{ i18n('levelDone').replace('{n}', level) }}</span>
            <div class="result-actions">
              <button class="game-icon replay-btn" @click="replayLevel">{{ i18n('replayLevel') }}</button>
              <button @click="nextLevel" class="game-icon">{{ i18n('nextLevel') }}</button>
            </div>
          </template>
          <template v-else>
            <span>👻👻 {{ i18n('tipLost') }} 👻👻</span>
            <span class="level-note">{{ i18n('level') }} {{ level }}</span>
            <button @click="replayLevel" class="game-icon replay-btn">{{ i18n('replayLevel') }}</button>
          </template>
        </div>
      </Transition>
    </div>
    <div class="card tray">
      <div class="slots">
        <div v-for="i in TRAY_SIZE" :key="i" class="slot"></div>
      </div>
      <div
        v-for="(card, idx) in tray"
        :key="card.uid"
        class="tray-card"
        :class="{ clearing: card.clearing, fresh: card.fresh, poker: isPoker, mahjong: isMahjong }"
        :style="trayCardStyle(idx)"
      >
        <MahjongTile v-if="isMahjong" :suit="faceOf(card.emoji).suit" :value="faceOf(card.emoji).value" />
        <CardItem
          v-else-if="isPoker"
          mini
          :num="pokerFaceOf(card.emoji).num"
          :type="pokerFaceOf(card.emoji).type"
          :style="pokerTrayVars"
        />
        <template v-else>{{ card.emoji }}</template>
      </div>
    </div>
    <Teleport to="body">
      <div
        v-for="f in flights"
        :key="f.uid"
        :ref="el => setFlyEl(f.uid, el)"
        class="fly-card"
        :class="{ poker: isPoker, mahjong: isMahjong }"
        :style="flyStyleOf(f)"
      >
        <MahjongTile v-if="isMahjong" :suit="faceOf(f.emoji).suit" :value="faceOf(f.emoji).value" />
        <CardItem
          v-else-if="isPoker"
          mini
          :num="pokerFaceOf(f.emoji).num"
          :type="pokerFaceOf(f.emoji).type"
          :style="pokerFlyVars(f)"
        />
        <template v-else>{{ f.emoji }}</template>
      </div>
    </Teleport>
    <!-- 共用的二次确认弹窗（文案与样式都在 shared/ConfirmDialog.vue 里） -->
    <ConfirmDialog
      :show="confirming"
      @confirm="startNewGame"
      @replay="replayLevel"
      @cancel="confirming = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';

import { facePref } from '@/shared/settings';
import { playElimination, playLose } from '@/shared/audio';
import TopHeader from '@/components/TopHeader.vue';
import ConfirmDialog from '@/shared/ConfirmDialog.vue';
import confetti from '@/shared/confetti';
import { i18n } from '@/shared/i18n';
import { EMOJIS } from '@/shared/emojis';
import MahjongTile from '@/games/mahjong/MahjongTile.vue';
import { MAHJONG_FACES, faceOf } from '@/shared/mahjongFaces';
import { TILE_RATIO } from '@/shared/mahjongTiles';
import CardItem from '@/games/poker/CardItem.vue';
import { clearGameStorage } from '@/shared/storage';
import {
  TRAY_SIZE, freeIds, generateTiles, insertIndex, levelConfig,
  MODE_EMOJI, MODE_POKER, MODE_MAHJONG, MODE_ORDER, FACE_RATIO,
} from './board';

const [PLAY, WON, OVER] = ['play', 'won', 'over'];
const KEY_PREFIX = '__emoji_master__';
const MODE_KEY = `${KEY_PREFIX}mode`;     // 上次用的牌面模式（两种模式共享这一个偏好）
// **两种模式的进度与局面各存一套**：emoji 模式沿用老 key（老存档无缝），麻将模式另开一套。
// 于是切模式 = 换一整套进度 / 盘面 / 收集槽，互不干扰。
const MODE_KEYS = {
  [MODE_EMOJI]: { level: `${KEY_PREFIX}level`, state: `${KEY_PREFIX}state` },
  [MODE_POKER]: { level: `${KEY_PREFIX}poker_level`, state: `${KEY_PREFIX}poker_state` },
  [MODE_MAHJONG]: { level: `${KEY_PREFIX}mahjong_level`, state: `${KEY_PREFIX}mahjong_state` },
};
// 扑克牌面的池子：52 张（'h7' = 红桃 7；h 红桃 / d 方块 / s 黑桃 / c 梅花），
// key 里不带花色英文全名，渲染时用 pokerFaceOf() 拆成 CardItem 要的 num / type。
const POKER_SUITS = { h: 'heart', d: 'diamond', s: 'spade', c: 'club' };
const POKER_FACES = Object.keys(POKER_SUITS).flatMap(t => Array.from({ length: 13 }, (_, i) => `${t}${i + 1}`));
function pokerFaceOf(key) {
  return { type: POKER_SUITS[String(key)[0]], num: +String(key).slice(1) };
}
const FLY_MS = 260;      // 卡片从原位飞入暂存区
const CLEAR_MS = 560;    // 三消卡片：先闪烁再消失
const WIN_DELAY = 620;   // 最后一组三消闪烁完再弹结算层

// 牌面模式。⚠️ `mode` 必须声明在 `level` **之前**：`loadLevel()` 要按当前模式选 key，
// 反过来就是 TDZ（solo 分册里记过这个坑，这里会直接把 setup 打挂）。
function loadMode() {
  try {
    const m = localStorage.getItem(MODE_KEY);
    // 没改过 → 用设置里的牌面偏好（同样是 'emoji'/'poker'/'mahjong'）；改过就按他自己的
    if (m === null) return MODE_ORDER.includes(facePref.value) ? facePref.value : MODE_EMOJI;
    return MODE_ORDER.includes(m) ? m : MODE_EMOJI;
  } catch { return MODE_EMOJI; }
}
const mode = ref(loadMode());
const isMahjong = computed(() => mode.value === MODE_MAHJONG);
const isPoker = computed(() => mode.value === MODE_POKER);
const levelKey = () => MODE_KEYS[mode.value].level;
const stateKey = () => MODE_KEYS[mode.value].state;

const level = ref(loadLevel());
const tiles = ref([]);
const tray = ref([]);
const phase = ref(PLAY);
// 连点保护：每次点击立刻"接受"并独立播自己的飞行（互不等待），
// 同时也把槽位预留出来，避免连点冲过 7 格上限
const flights = ref([]);
const flyEls = new Map();
const confirming = ref(false); // 「新游戏」二次确认弹窗
const gameId = ref(0);
// 开局/恢复时的逐张入场动画窗口（窗口结束后重挂载的卡片不再延迟）
const revealing = ref(false);
const revealRank = new Map();   // 卡片 id -> 同层内的出场顺序
let revealTimer = null;
let winTimer = null;

// 牌面池：emoji 用共享的 emoji 表，麻将用 34 种牌面（m/s/p 1~9 + 字牌 1~7）
const pool = computed(() => {
  if (isMahjong.value) return MAHJONG_FACES;
  if (isPoker.value) return POKER_FACES;
  return EMOJIS;
});
// 麻将牌面的尺寸：**牌面直接填满卡片内框**（卡片本身就是牌形，不是「方底 + 小牌」）
function faceVars(w, h) {
  // 牌面宽 = 盒子 − 2（左右各 1px 边框），**高必须由宽按 131:168 反算**：
  // 两边都减 2 会把长宽比从 0.7798 拉到 0.759，雪碧图背景被拉伸、取景随之偏移
  //（表现为「牌没在正中间、右侧留白、左上角漏出隔壁那张牌」）。
  const ww = +(w - 2).toFixed(2);
  const hh = +Math.min(ww * TILE_RATIO, h - 2).toFixed(2);
  return { '--mj-w': `${ww}px`, '--mj-h': `${hh}px` };
}
// 扑克牌：CardItem 读 --width / --height 这组变量。**必须内联在 CardItem 自己身上** ——
// 它的 .card-wrapper 自己声明了 `--width: 60px; --height: 90px`，挂在父元素上会被本地声明压掉
//（麻将模式能靠继承是因为 MahjongTile 用的是 `var(--mj-w, 44px)` 这种**回退值**、不是声明）。
// 牌比格子小一圈（用户要求「扑克牌适当小一点」）：高度取格子高的 0.88，宽度按 2:3 反算，
// 并且同时受格子的 0.88 宽约束。飞行落点与托盘卡用的是同一个公式，交接仍然像素级对齐。
const POKER_INSET = 0.88;
// 扑克牌在给定格子里**实际占多大**（托盘槽位底板也要按这个尺寸画，否则框比牌大一圈）
function pokerSize(w, h) {
  const hh = +Math.max(8, Math.min(h * POKER_INSET, (w * POKER_INSET) * 1.5)).toFixed(2);
  const ww = +Math.max(6, hh * 2 / 3).toFixed(2);
  return { w: ww, h: hh };
}
const pokerTileVars = computed(() => pokerVars(layout.value.tileW, layout.value.tileH));
const pokerTrayVars = computed(() => pokerVars(layout.value.slotW, layout.value.slot));
function pokerFlyVars(f) {
  return pokerVars(f.w, f.h);
}
function pokerVars(w, h) {
  const { w: ww, h: hh } = pokerSize(w, h);
  return {
    // -2 是 CardItem 那张牌自己的 1px 描边（content-box）：wrapper 取「目标 − 2」，
    // 配合样式里 :deep(.card) 的 -1px 偏移，可见的牌才正好等于 pokerSize() 的尺寸并居中
    '--width': `${+(ww - 2).toFixed(2)}px`,
    '--height': `${+(hh - 2).toFixed(2)}px`,
    '--margin': '0px',
    '--radius': `${Math.max(2, Math.round(ww * 0.07))}px`,
    '--pos': `${Math.max(1, Math.round(ww * 0.09))}px`,
    '--text-size': `${Math.max(6, Math.round(ww * 0.3))}px`,
    '--icon-size': `${Math.max(8, Math.round(ww * 0.62))}px`,
    '--back-size': `${Math.max(10, Math.round(ww * 0.72))}px`,
  };
}
// 卡片盒上的牌面变量（只有麻将需要：牌面靠继承填满盒子；扑克是内联给 CardItem 自己的）
function cardFaceVars(w, h) {
  return isMahjong.value ? faceVars(w, h) : null;
}

// 当前可点击（亮色）的卡片
const freeSet = computed(() => freeIds(tiles.value, conf.value.pitch));
const activeTray = computed(() => tray.value.filter(c => !c.clearing).length);

// 本关的层级、种类与**格距**（格距随模式变：麻将牌更窄，卡片本身就是一块竖着的牌）
const conf = computed(() => levelConfig(level.value, mode.value));
const boardLabel = computed(() => {
  const c = conf.value;
  return `${i18n('layersLabel').replace('{n}', c.layers)} · ${i18n('kindsLabel').replace('{n}', c.kinds)}`;
});

// 覆盖层级：压在这张牌上面的卡片数（0 张 = 亮色可点）。只用于视觉——
// 被压住的牌整张**不透明**（压得再深也不透光，只有从上层牌边缘漏出来的那一部分看得见，
// 想知道下面是什么就得先把它翻开）；判定可点击与否仍走 freeIds
const MAX_COVER_DEPTH = 4;   // 更深的一律按最深一档算（层级只影响视觉）
const coverDepth = computed(() => {
  const list = tiles.value;
  const pitch = conf.value.pitch;
  const map = new Map();
  for (const tile of list) {
    let n = 0;
    for (const other of list) {
      if (other.layer <= tile.layer) continue;
      if (Math.abs(other.x - tile.x) < pitch.x && Math.abs(other.y - tile.y) < pitch.y) n++;
    }
    map.set(tile.id, Math.min(n, MAX_COVER_DEPTH));
  }
  return map;
});

// 本关进度：已消除的卡片占本关总卡片的比例（入场动画期间按满盘算 0%）
const progress = computed(() => {
  const total = conf.value.tiles;
  if (!total) return 0;
  const left = tiles.value.length + tray.value.filter(c => !c.clearing).length;
  return Math.max(0, Math.min(100, Math.round(((total - left) / total) * 100)));
});
// 盘面 7×7 格（坐标半格制），卡片与收集槽尺寸都按视口收缩
// 游戏区做成一张带底色的卡片（和连连看 / 消消乐的棋盘一样），内缩 BOARD_PAD 留出边框
const BOARD_PAD = 8;
const layout = computed(() => {
  const avail = Math.min(window.innerWidth || 420, 440) - 32;
  // 卡片是**平的**（玩家要求去掉立体感）：没有那条厚度，所以「14 格 + 上下内边距」就是盘面总高，
  // unit 直接用可用宽度除出来（以前为了把厚度算进去，反解救过一个小 1% 的 unit，现已不需要）。
  const u0 = (avail - BOARD_PAD * 2) / 14;
  const unit = +u0.toFixed(2);
  const tile = +(unit * 2).toFixed(2);
  const gap = 6;
  const slot = +(((avail - 16) - gap * (TRAY_SIZE - 1)) / TRAY_SIZE).toFixed(2);
  // 牌面**尺寸 = 格距**：emoji 模式是 2u−2 的方牌；麻将模式横向 1.56u−2、纵向 2u−2 ——
  // 卡片本身就是一块竖着的麻将牌，牌面直接填满它（不再是「正方形底 + 里面一张小牌」）。
  const { pitch } = conf.value;
  const tileW = +((pitch.x * unit) - 2).toFixed(2);
  const tileH = +((pitch.y * unit) - 2).toFixed(2);
  // 托盘槽位形状跟着牌走：麻将 131:168、扑克 2:3、emoji 方牌
  const slotW = +(slot * (isMahjong.value ? FACE_RATIO : isPoker.value ? 2 / 3 : 1)).toFixed(2);
  // 槽位底板必须跟**真正显示出来的那张牌**一样大：emoji 是字符填满卡片盒、麻将牌面是「盒 − 2」、
  // 扑克是 CardItem 那张牌（比盒子再内缩 12%）。不跟着缩的话，框和牌之间就会有一圈落差。
  const slotShape = isPoker.value
    ? pokerSize(slotW, slot)
    : isMahjong.value
      // 麻将：宽 = 槽位宽 − 2，高按 131:168 反算（与牌面同一套算法，否则会差零点几像素）
      ? (() => {
        const hh = +Math.min((slotW - 2) * TILE_RATIO, slot - 2).toFixed(2);
        return { w: +(hh / TILE_RATIO).toFixed(2), h: hh };
      })()
      : { w: slotW, h: slot };
  // 底板圆角也要跟**牌**一致，否则框和牌圆角明显不同：
  // 扑克 = CardItem 的 --radius（宽 × 0.07）、麻将 = 牌面的 --mj-w × 0.09、emoji = 全局 --radius-tile
  const slotRadius = isPoker.value
    ? `${Math.max(2, Math.round(pokerSize(slotW, slot).w * 0.07))}px`
    : isMahjong.value
      ? `${+(slotShape.w * 0.09).toFixed(2)}px`
      : 'var(--radius-tile)';
  return {
    avail,
    unit,
    tile,
    tileW,
    tileH,
    slotW,
    slot,
    gap,
    vars: {
      '--tile': `${tile}px`,
      '--tile-w': `${tileW}px`,
      '--tile-h': `${tileH}px`,
      '--tile-fs': `${Math.round(tile * 0.5)}px`,
      '--slot': `${slot}px`,
      '--slot-shape-w': `${slotShape.w}px`,
      '--slot-shape-h': `${slotShape.h}px`,
      '--slot-radius': slotRadius,
      '--slot-gap': `${gap}px`,
      '--tray-fs': `${Math.round(slot * 0.52)}px`,
      '--board-h': `${(unit * 14 + BOARD_PAD * 2).toFixed(2)}px`,
      '--board-pad': `${BOARD_PAD}px`,
      '--board-pad-b': `${BOARD_PAD}px`,
    },
  };
});

// 飞行卡片只负责定位/尺寸，位移与缩放交给 Web Animations API（更可靠，不会被样式批处理吞掉）
function flyStyleOf(f) {
  if (!f) return null;
  return {
    left: `${f.left}px`,
    top: `${f.top}px`,
    width: `${f.w}px`,
    height: `${f.h}px`,
    fontSize: `${Math.round(f.h * 0.5)}px`,
    ...cardFaceVars(f.w, f.h),
  };
}

onMounted(() => {
  if (!restore()) initLevel(level.value);
});

onUnmounted(() => {
  clearTimeout(revealTimer);
  clearTimeout(winTimer);
});

// 逐张入场：自下层向上层堆叠，同层内按生成顺序依次出现。
// 窗口结束后清掉标记，之后重挂载（如撤回卡片）不再走延迟
const REVEAL_STEP = 10;      // 同层内每张间隔
const REVEAL_LAYER = 70;     // 每高一层整体延后
const REVEAL_MS = 1400;
function revealBoard() {
  clearTimeout(revealTimer);
  revealRank.clear();
  const perLayer = new Map();
  tiles.value.forEach(tile => {
    const n = perLayer.get(tile.layer) || 0;
    perLayer.set(tile.layer, n + 1);
    revealRank.set(tile.id, n);
  });
  revealing.value = true;
  revealTimer = setTimeout(() => { revealing.value = false; }, REVEAL_MS);
}

function revealDelay(tile) {
  return tile.layer * REVEAL_LAYER + (revealRank.get(tile.id) || 0) * REVEAL_STEP;
}

// 任何盘面/收集槽变化都实时落盘，退出回主页后可恢复
watch([tiles, tray], saveState, { deep: true });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function tileStyle(tile) {
  const { unit, tileW, tileH } = layout.value;
  return {
    left: `${(tile.x * unit + 1).toFixed(2)}px`,
    top: `${(tile.y * unit + 1).toFixed(2)}px`,
    width: `${tileW}px`,
    height: `${tileH}px`,
    zIndex: tile.layer + 1,
    ...cardFaceVars(tileW, tileH),
    ...(revealing.value ? { animationDelay: `${revealDelay(tile)}ms` } : null),
  };
}

function trayCardStyle(idx) {
  const { slot, gap, slotW } = layout.value;
  // 麻将模式的托盘卡也是竖牌（与盘面 / 飞行卡同一比例），在方形格距里水平居中
  return {
    left: `${(8 + idx * (slot + gap) + (slot - slotW) / 2).toFixed(2)}px`,
    top: '8px',
    width: `${slotW}px`,
    height: `${slot}px`,
    ...cardFaceVars(slotW, slot),
  };
}

// ---------- 关卡 / 新游戏 ----------

function loadLevel() {
  const saved = +(localStorage.getItem(levelKey()) || 1);
  return saved >= 1 ? saved : 1;
}

function persistLevel(lv) {
  try { localStorage.setItem(levelKey(), lv); } catch { /* 忽略 */ }
}

// 开始第 lv 关：重新生成盘面并清空收集槽
function initLevel(lv) {
  clearTimeout(winTimer);
  winTimer = null;
  level.value = Math.max(1, lv);
  persistLevel(level.value);
  const { tiles: list } = generateTiles(pool.value, level.value, mode.value);
  tiles.value = list;
  tray.value = [];
  phase.value = PLAY;
  flights.value = [];
  flyEls.clear();
  confirming.value = false;
  gameId.value++;
  revealBoard();
  saveState();
}

// 「新游戏」= 清除闯关记录，回到第 1 关（需二次确认）
function startNewGame() {
  confirming.value = false;
  try { localStorage.removeItem(levelKey()); } catch { /* 忽略 */ }
  initLevel(1);
}

function nextLevel() {
  initLevel(level.value + 1);
}

// 切换牌面模式：**两种模式的进度、盘面、收集槽各自独立**（key 分开），
// 切过去时：该模式有存档就接着打，没有就从第 1 关开新盘；另一个模式的存档一个字都不动。
function switchMode() {
  if (phase.value === PLAY) saveState();          // 当前局面落盘（其实平时也是实时的）
  const at = MODE_ORDER.indexOf(mode.value);
  const next = MODE_ORDER[(at + 1) % MODE_ORDER.length];   // emoji → 扑克牌 → 麻将 → emoji
  mode.value = next;
  try { localStorage.setItem(MODE_KEY, next); } catch { /* 忽略 */ }
  clearTimeout(winTimer);
  winTimer = null;
  tiles.value = [];
  tray.value = [];
  flights.value = [];
  flyEls.clear();
  phase.value = PLAY;
  level.value = loadLevel();
  if (!restore()) initLevel(level.value);         // 没有该模式的存档 → 第 1 关新盘
}

function replayLevel() {
  initLevel(level.value);
}

// ---------- 点击卡片 ----------

// 点击盘面卡片：当场接受并立刻开一条独立的飞行动画。
// 连点不再排队等待——每张牌各飞各的（互不阻塞），动画结束各自落格
function pick(tile, event) {
  if (phase.value !== PLAY) return;
  if (!freeSet.value.has(tile.id)) return;
  // 把飞行中的牌也算进占用，连点仍然不会冲过 7 格
  if (tray.value.length + flights.value.length >= TRAY_SIZE) return;
  // 同一张牌连点两次只算一次
  if (flights.value.some(f => f.uid === tile.id)) return;
  const at = tiles.value.findIndex(t => t.id === tile.id);
  if (at < 0) return;
  // currentTarget 只在事件派发期间有效，必须先取出坐标
  const from = event.currentTarget.getBoundingClientRect();
  const snap = { ...tiles.value[at] };
  // 立即从盘面移除：遮挡关系随之更新，其它卡片会被点亮（渐亮动画）
  tiles.value.splice(at, 1);

  const flight = {
    uid: snap.id,
    emoji: snap.emoji,
    from,
    left: from.left,
    top: from.top,
    w: from.width,
    h: from.height,
    gen: gameId.value,
  };
  flights.value.push(flight);
  fly(flight);
}

// 单条飞行：等飞行卡挂到 DOM 后播放 WAAPI 动画，结束即落格。
// 整个过程不 await 给别人，所以多张牌可以同时在飞
async function fly(flight) {
  await nextTick();
  const el = flyEls.get(flight.uid);
  // 目标槽位：按「当前暂存区 + 其它在飞的牌」算（要排掉自己，否则会多算一格，
  // 看起来就像新牌和前一间隔了一个槽），避免两条飞行盯同一个空槽
  const others = flights.value.filter(f => f.uid !== flight.uid);
  const virtualTray = [...tray.value, ...others.map(f => ({ emoji: f.emoji, clearing: false }))];
  const idx0 = insertIndex(virtualTray, flight.emoji);
  const slotEl = document.querySelectorAll('.tray .slot')[idx0];
  const to = slotEl ? slotEl.getBoundingClientRect() : flight.from;
  const from = flight.from;

  if (el) {
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    // 托盘卡通常比槽位窄（麻将 131:168、扑克 2:3、emoji 一样宽），落点宽度要按牌面形状算，
    // 否则落到托盘时会横着跳一下。比例直接取「托盘卡宽 / 槽位宽」，三种模式通用。
    const { slot: slotPx, slotW: slotCardW } = layout.value;
    const scale = (to.width * (slotCardW / slotPx)) / from.width;
    try {
      await el.animate(
        [
          { transform: 'translate(0, 0) scale(1)', offset: 0 },
          { transform: `translate(${dx * 0.55}px, ${dy * 0.42}px) scale(${(1 + scale) / 2})`, offset: 0.55 },
          { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, offset: 1 },
        ],
        { duration: FLY_MS, easing: 'cubic-bezier(0.35, 0.75, 0.4, 1)', fill: 'forwards' },
      ).finished;
    } catch {
      await sleep(FLY_MS); // 动画被取消时兜底
    }
  } else {
    await sleep(FLY_MS);
  }

  // 期间开了新局 / 恢复存档（或已结算）→ 这次落格作废，直接撤掉飞行卡
  if (flight.gen !== gameId.value || phase.value !== PLAY) {
    flights.value = flights.value.filter(f => f.uid !== flight.uid);
    return;
  }
  // 落格要「先插托盘卡、等它渲染出来，再撤飞行卡」：反过来的话中间至少有一帧
  // 「飞行卡已消失、托盘卡还没出现」，看起来就是闪一下。
  // fresh 让这张卡跳过 card-pop —— 它是飞进来的，再播一次「从 opacity 0 放大淡入」
  // 同样会在交接处闪（普通入场 / 恢复存档的卡仍照常播 card-pop）。
  tray.value.splice(insertIndex(tray.value, flight.emoji), 0, {
    uid: flight.uid, emoji: flight.emoji, clearing: false, fresh: true,
  });
  await nextTick();
  flights.value = flights.value.filter(f => f.uid !== flight.uid);
  saveState();
  settle();
}

function setFlyEl(uid, el) {
  if (el) flyEls.set(uid, el);
  else flyEls.delete(uid);
}

// 结算：三消自动消除；槽满且无消除则失败；盘面与收集槽都空则获胜。
// 多张牌现在可以同时飞行、各自落格，所以这里加一道重入保护：
// 结算进行中又有牌落下时，只置一个标记，等这一轮跑完再补一轮
let settling = false;
let settleAgain = false;

async function settle() {
  if (settling) {
    settleAgain = true;
    return;
  }
  settling = true;
  try {
    do {
      settleAgain = false;
      await settlePass();
    } while (settleAgain && phase.value === PLAY);
  } finally {
    settling = false;
  }
}

async function settlePass() {
  // 只在「还没进入消除动画」的卡片里找三消：
  // 上一组正在闪烁消失时，新落下的一组同样要能结算（否则最后一组永远消不掉、本局无法结束）
  const counts = new Map();
  tray.value.filter(c => !c.clearing).forEach(c => counts.set(c.emoji, (counts.get(c.emoji) || 0) + 1));
  const hit = [...counts.entries()].find(([, n]) => n >= 3);
  if (hit) {
    const emoji = hit[0];
    const picked = tray.value.filter(c => c.emoji === emoji && !c.clearing).slice(0, 3);
    picked.forEach(c => { c.clearing = true; });
    playElimination();
    await sleep(CLEAR_MS);
    const uids = new Set(picked.map(c => c.uid));
    tray.value = tray.value.filter(c => !uids.has(c.uid));
    // 消除完继续结算：可能又凑出一组，或本局刚好结束
    settleAgain = true;
    return;
  }
  if (activeTray.value >= TRAY_SIZE) {
    lose();
    return;
  }
  // 还有牌在飞的时候不能判定通关（盘面已空但牌还没落完）
  if (!tiles.value.length && !activeTray.value && !flights.value.length) win();
}

function win() {
  if (phase.value !== PLAY || winTimer) return;
  // 过关：闯关进度推进到下一关（万一没有结算存档，下次进入直接开新关）
  persistLevel(level.value + 1);
  confetti();
  // 等最后一组三消闪烁消失后再弹结算层；结算层出现后再落盘，
  // 退出重进还是这个结算层，由玩家自己决定点「下一关」还是回主页
  winTimer = setTimeout(() => {
    phase.value = WON;
    saveWinState();
  }, WIN_DELAY);
}

function lose() {
  if (phase.value !== PLAY) return;
  removeState();
  phase.value = OVER;
  playLose();
}

// ---------- 存档（退出回主页后恢复） ----------

function removeState() {
  try { localStorage.removeItem(stateKey()); } catch { /* 忽略 */ }
}

function saveState() {
  if (phase.value !== PLAY) return;
  // 盘面与收集槽都空了 = 本局已结束（胜利结算层有延迟，期间不再落盘）
  if (!tiles.value.length && !tray.value.length) {
    removeState();
    return;
  }
  try {
    localStorage.setItem(stateKey(), JSON.stringify({
      level: level.value,
      // 卡片：[id, emoji, 层, x, y]
      tiles: tiles.value.map(t => [t.id, t.emoji, t.layer, t.x, t.y]),
      tray: tray.value.map(c => [c.uid, c.emoji]),
    }));
  } catch { /* 忽略 */ }
}

// 胜利结算局面：盘面与槽都空了，只记「第几关 + 已过关」。
// 必须在 phase 切到 WON 之后写，否则会被 saveState() 的清档分支覆盖
function saveWinState() {
  if (phase.value !== WON) return;
  try {
    localStorage.setItem(stateKey(), JSON.stringify({
      level: level.value,
      phase: WON,
      tiles: [],
      tray: [],
    }));
  } catch { /* 忽略 */ }
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(stateKey()));
    if (!saved || !Array.isArray(saved.tiles) || !Array.isArray(saved.tray)) return false;
    // 胜利结算局面：盘面与槽都是空的，恢复关卡与结算层即可，
    // 由玩家自己决定点「下一关」还是回主页
    if (saved.phase === WON) {
      level.value = Math.max(1, Math.floor(+saved.level) || loadLevel());
      tiles.value = [];
      tray.value = [];
      flights.value = [];
      flyEls.clear();
      clearTimeout(winTimer);
      winTimer = null;
      phase.value = WON;
      return true;
    }
    const list = saved.tiles.map(t => ({ id: +t[0], emoji: String(t[1]), layer: +t[2], x: +t[3], y: +t[4] }));
    const ok = list.length > 0
      && list.every(t => t.id > 0 && t.emoji && t.layer >= 0 && t.x >= 0 && t.y >= 0)
      && new Set(list.map(t => t.id)).size === list.length;
    if (!ok) return false;
    const cards = saved.tray.map(c => ({ uid: +c[0], emoji: String(c[1]), clearing: false }));
    if (cards.length > TRAY_SIZE) return false;
    tiles.value = list;
    tray.value = cards;
    phase.value = PLAY;
    clearTimeout(winTimer);
    winTimer = null;
    flights.value = [];
    flyEls.clear();
    // 关卡进度以存档为准（与闯关记录同步）
    level.value = Math.max(1, Math.floor(+saved.level) || loadLevel());
    persistLevel(level.value);
    gameId.value++;
    revealBoard();   // 恢复存档也逐张堆叠出来
    return true;
  } catch {
    return false;
  }
}
// 连点标题清记录：三种牌面的关卡/局面一起清，然后从第 1 关重开（模式偏好保留）
function onScoreReset() {
  clearGameStorage('__emoji_master__');
  startNewGame();
}

</script>

<style scoped lang="scss">
// 扁平卡片：底色 + 1px 描边 + 一层柔和阴影（玩家要求去掉立体感，三个牌面模式都一样）
// （和麻将英雄的牌同一套做法；区别是这里的卡面跟着主题走，所以侧面色用 color-mix
//  从 --card-bg-color 压暗得到，浅色偏灰、深色更深）
// 「新游戏」二次确认弹窗（Teleport 到 body，层级要盖住帮助弹窗与飞行卡片）

@keyframes tile-in {
  from {
    opacity: 0;
    transform: scale(0.6);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes card-pop {
  from {
    opacity: 0;
    transform: scale(0.5);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

// 三消卡片：先闪烁两下，再旋转缩小消失
@keyframes card-clear {
  0% {
    opacity: 1;
    transform: scale(1);
  }
  15% {
    opacity: 0.12;
    transform: scale(1.14);
  }
  30% {
    opacity: 1;
    transform: scale(1);
  }
  45% {
    opacity: 0.12;
    transform: scale(1.14);
  }
  60% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(0.2) rotate(20deg);
  }
}

// 飞行中的卡片被 Teleport 到 body，样式需定义在顶层（scoped 会带上 data-v）
// 位移/缩放由 Web Animations API 驱动，这里不再声明 transition

.fly-card {
  position: fixed;
  z-index: 60;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-tile);
  background: var(--card-bg-color);
  border: 1px solid var(--tile-border-color);
  line-height: 1;
  pointer-events: none;
  will-change: transform;
  // 与盘面 / 托盘的卡一致：同一档扁平阴影（三个卡面都去掉了立体厚度）
  box-shadow: var(--card-shadow);
}

.wrapper {
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  box-sizing: border-box;
  background: var(--bg-color);
  color: var(--text-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  button {
    touch-action: manipulation;
  }
  .card {
    width: calc(100% - 32px);
    max-width: 440px;
    box-sizing: border-box;
    background: var(--card-bg-color);
    border-radius: var(--card-radius);
    box-shadow: var(--card-shadow);
  }
  .divider {
    width: 1px;
    height: 24px;
    align-self: center;
    background: var(--border-color);
    opacity: 0.6;
  }
  .score-area {
    position: relative;
    overflow: hidden;
    margin-top: 64px;
    display: flex;
    align-items: center;
    height: var(--row-height);
    .stat {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      .stat-label {
        font-size: 12px;
        color: var(--muted-color);
      }
      .stat-value {
        font-size: 22px;
        font-weight: bold;
        line-height: 1.2;
        font-variant-numeric: tabular-nums;
      }
    }
  }
  // 顶部卡片底部的本关进度条
  .score-area .progress {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3px;
    background: var(--border-color);
    .progress-bar {
      height: 100%;
      background: var(--primary-bg);
      transition: width 0.3s ease;
    }
  }
  .opt-area {
    display: flex;
    align-items: center;
    margin: var(--row-gap) 0;
    height: var(--row-height);
    .opt-half {
      flex: 1.6;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .level-note {
      font-size: 14px;
      color: var(--muted-color);
      white-space: nowrap;
    }
    .start-wrapper {
      flex: 1.2;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  }
  .game-icon {
    cursor: pointer;
    padding: 8px 16px;
    font-size: 14px;
    font-weight: bold;
    white-space: nowrap;
    background: var(--primary-bg);
    color: #fff;
    border: 0 none;
    border-radius: var(--radius-tile);
    &.again {
      margin-top: 6px;
    }
  }
  .board-wrap {
    position: relative;
    width: calc(100% - 32px);
    max-width: 440px;
    height: var(--board-h);
    box-sizing: border-box;
    // 游戏区本身是一张带底色的卡片（和连连看 / 消消乐的棋盘同色），
    // 浅色主题下卡片才有依托，不然白底白牌糊成一片
    padding: var(--board-pad) var(--board-pad) var(--board-pad-b);
    border-radius: var(--card-radius);
    // 卡片带 z-index（层数），用 isolation 把它们的层叠限制在本区域内，
    // 否则会盖住 Teleport 到 body 的帮助弹窗（z-index 10）
    isolation: isolate;
    z-index: 0;
  }
  .board {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .tile {
    position: absolute;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-tile);
    background: var(--card-bg-color);
    border: 1px solid var(--tile-border-color);
    box-shadow: var(--card-shadow);
    font-size: var(--tile-fs);
    line-height: 1;
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    animation: tile-in 0.22s ease backwards;
    // 亮色 ⇄ 被遮挡之间的明暗变化走渐变（被遮挡时缓缓变暗，重新可点时缓缓变亮）
    transition: filter 0.32s ease, box-shadow 0.32s ease;
    &:not(.covered):active {
      transform: scale(0.93);
    }
    // 被上层卡片遮挡：变暗且不可点击。
    // 被压住的牌保留阴影（filter 会连阴影一起压暗），叠起来仍然有层次
    &.covered {
      filter: brightness(0.5) saturate(0.45);
      cursor: default;
      pointer-events: none;
    }
    // 被压住的牌一律不透明：压得再深也只看得到从上层牌边缘漏出来的那一角，
    // 于是「下面那张是什么」必须靠翻开来确认（depth-N 类保留，作纯样式钩子用）
  }
  .tray {
    position: relative;
    margin: 16px 0 20px;
    padding: 8px;
    height: calc(var(--slot) + 16px);
    .slots {
      display: flex;
      gap: var(--slot-gap);
    }
      // 槽位的**底板形状**跟着牌面走：emoji 模式是方牌、麻将模式是竖牌
      //（否则又变成「正方形底 + 里面一张小牌」）。槽位盒子仍是方形格距，形状交给 ::after 画。
      .slot {
        width: var(--slot);
        height: var(--slot);
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
        &::after {
          content: '';
          width: var(--slot-shape-w, var(--slot));
          height: var(--slot-shape-h, var(--slot));
          border-radius: var(--slot-radius, var(--radius-tile));
          background: var(--cell-bg);
          box-shadow: inset 0 0 0 1px var(--border-color);
        }
      }
    .tray-card {
      position: absolute;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-tile);
      background: var(--card-bg-color);
      border: 1px solid var(--tile-border-color);
      box-shadow: var(--card-shadow);
      font-size: var(--tray-fs);
      line-height: 1;
      z-index: 2;
      transition: left 0.22s ease;
      animation: card-pop 0.2s ease backwards;
      // 刚由飞行卡落格的：位置、尺寸、厚度都已经和飞行卡对齐，不能再播一次 card-pop
      &.fresh { animation: none; }
      // 凑满三张：闪烁两下后旋转缩小消失（时长与 CLEAR_MS 一致）
      &.clearing {
        z-index: 3;
        border-color: var(--primary-bg);
        box-shadow: 0 0 0 2px var(--primary-bg), var(--card-shadow);
        animation: card-clear 0.56s ease-in-out forwards;
      }
    }
  }
  // 结算层/遮罩里的按钮行：横排、居中、12px 间隔（规范见 docs/CONVENTIONS.md）
  .result-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 12px;
  }

  .result {
    position: absolute;
    inset: 0;
    // 必须高于棋盘卡片（层数 1~6）
    z-index: 30;
    border-radius: var(--card-radius);
    background: var(--mask-color);
    color: var(--win-color);
    font-weight: bold;
    font-size: 18px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 12px;
    box-sizing: border-box;
    &.lose {
      color: var(--lose-color);
    }
    .level-note {
      color: var(--text-color);
      font-size: 14px;
      font-weight: 600;
      opacity: 0.75;
    }
  }
  .win-pop-enter-active {
    transition: opacity 0.28s ease;
    > * {
      animation: card-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
  }
  .win-pop-leave-active {
    transition: opacity 0.2s ease;
  }
  .win-pop-enter-from,
  .win-pop-leave-to {
    opacity: 0;
  }
}
// 扑克模式：卡片盒让开（底色 / 描边 / 立体厚度 / 阴影全部不要），整张牌交给 CardItem 自己画。
// 根因：CardItem 的 .card-wrapper 自己声明了 --width: 60px / --height: 90px，把变量挂在父元素上
// 会被本地声明压掉（麻将能靠继承是因为 MahjongTile 用的是 var(--mj-w, 44px) 这种**回退值**），
// 于是牌渲染成 60×90、溢出 29×44 的格子，看起来就是「背景不按扑克牌宽高比渲染」。
// 托盘卡的 clearing 状态要保留，所以用 :not(.clearing) 避开。
.tile.poker,
.tray-card.poker:not(.clearing),
.fly-card.poker {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}


// CardItem 的 .card 是 content-box + 1px 描边，绝对定位在 wrapper 的 0,0，而 wrapper 比它小 2px，
// 于是可见的扑克牌会往右下各偏 1px（也会显得比槽位底板大一圈）。往左上挪 1px 就同心了
//（wrapper 自己由卡片盒 flex 居中，见 .tile / .tray-card 的 align/justify）。
.tile.poker :deep(.card),
.tray-card.poker :deep(.card),
.fly-card.poker :deep(.card) {
  left: -1px;
  top: -1px;
}

// 麻将模式：卡片盒的圆角跟牌面同一套式子（否则盒子的白角从牌面四角漏出来，看着像「没居中」）。
// +1px 是盒子自己的 1px 描边。
.tile.mahjong,
.tray-card.mahjong,
.fly-card.mahjong {
  border-radius: calc(var(--mj-w, 32px) * 0.09 + 1px);
}

</style>
