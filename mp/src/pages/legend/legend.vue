<template>
  <view class="screen">
    <!-- 全站背景（粒子连线 + 底部过山车，与 web 的 ParticleBackground 同款） -->
    <ParticleBackground />
    <view class="page">
      <!-- 统计条三格「最高分 / 得分 / 消除」（与 web 的 .score-area 一致） -->
      <view class="card score-area">
        <view class="stat">
          <text class="stat-label">{{ tt('best') }}</text>
          <text class="stat-value">{{ best }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('score') }}</text>
          <text class="stat-value">{{ score }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('cleared') }}</text>
          <text class="stat-value">{{ clearedCount }}</text>
        </view>
      </view>

      <!-- 候选区 + 新游戏（照麻将英雄那一行：左半是当前牌 + 后两张，右半只放按钮，无分隔线无标签） -->
      <view class="card opt-area">
        <view class="opt-half hand">
          <view id="hand-current" class="tile-slot current" :style="slotStyle(HAND_W)">
            <MahjongTile
              v-if="queue.length"
              :value="faceOf(queue[0])"
              :suit="displaySuit(queue[0])"
              class="mj"
              :style="slotStyle(HAND_W)"
            />
          </view>
          <view class="preview">
            <view
              v-for="(v, i) in queue.slice(1)"
              :key="'q-' + i"
              class="tile-slot next"
              :style="previewStyle(i)"
            >
              <MahjongTile :value="faceOf(v)" :suit="displaySuit(v)" class="mj" :style="slotStyle(HAND_W)" />
            </view>
          </view>
        </view>
        <view class="opt-half">
          <button class="game-icon" @click="newRun">{{ tt('start') }}</button>
        </view>
      </view>

      <!-- 游戏区：8×7 的绝对定位棋盘，结算浮层正好盖住这块 -->
      <view class="game-area">
        <view class="board dot-board" :class="{ shaking, celebrating }" :style="boardStyle">
          <view
            v-for="i in CELLS"
            :key="'cell-' + i"
            :id="'cell-' + (i - 1)"
            class="grid-cell"
            :style="cellStyle(i - 1)"
            @click="onCellClick(Math.floor((i - 1) / COLS), (i - 1) % COLS)"
          />
          <!-- 盘面上的牌：left/top 自己算（落子 / 下落 / 升行都靠 transition: top/left 滑动） -->
          <view
            v-for="t in tiles"
            :key="t.k"
            class="tile-slot"
            :class="{ placed: popped.has(t.id), incoming: t.id === incomingId, dealt: dealing }"
            :style="tileStyle(t)"
            @click="onCellClick(t.row, t.col)"
          >
            <MahjongTile :value="faceOf(t.v)" :suit="displaySuit(t.v)" class="mj" />
          </view>
          <!-- 刚消掉的牌：先把它从盘面拿掉，这里单独一层浮影播「闪烁 → 消失」 -->
          <view
            v-for="t in clearingTiles"
            :key="t.id"
            class="tile-slot clearing"
            :style="posStyle(t.row, t.col)"
          >
            <MahjongTile :value="faceOf(t.v)" :suit="displaySuit(t.v)" class="mj" />
          </view>

          <!-- 得分浮字：棋盘正中弹出牌组名 / 连消组数 + 本次得分（key 复用会不重播动画） -->
          <view v-if="float" :key="float.id" class="celebrate">
            <text class="celebrate-title">{{ float.title }}</text>
            <text class="celebrate-score">+{{ float.score }}</text>
            <text v-if="float.chain > 1" class="celebrate-chain">{{ tt('chainName').replace('{n}', float.chain) }}</text>
          </view>

          <!-- 结算浮层：矩形与棋盘完全重合（inset: 0 + border-box） -->
          <view v-if="phase === OVER" class="result lose">
            <text>💤💤 {{ tt('tipLost') }} 💤💤</text>
            <text class="final-score">{{ tt('finalScore') }} {{ score }}</text>
            <text v-if="isNewBest" class="result-note">{{ tt('newBest') }}</text>
            <button class="game-icon" @click="newRun">{{ tt('start') }}</button>
          </view>
        </view>
      </view>
    </view>

    <!-- 从候选区飞向目标格的浮牌（fixed 定位，不受棋盘 overflow: hidden 影响） -->
    <view v-if="flying" class="fly-tile" :style="flyStyle">
      <MahjongTile :value="faceOf(flying.v)" :suit="displaySuit(flying.v)" class="mj" />
    </view>

    <!-- 胜利彩带：本作是单局制、没有过关概念（只有「顶出去了」），所以 justWon 永远是 false，
         彩带不会出现；保留这段是为了与其它页面同一套写法（web 本作也没有胜利彩带）。 -->
    <Confetti v-if="justWon" />

    <!-- 右下角悬浮按钮：模式（条牌 / 筒牌展示切换）在上、帮助在下，按钮上不写字 -->
    <FloatingActions>
      <view class="fab" @click="toggleSuit">
        <view
          class="fab-ico"
          :class="suitPref === 's' ? 'i-dinkie-icons-three-of-bamboos-mahjong' : 'i-dinkie-icons-three-of-circles-mahjong'"
        />
      </view>
      <view class="fab" @click="showHelp"><view class="fab-ico i-carbon-help" /></view>
    </FloatingActions>
    <!-- 连击 / 多消的小烟花：burstConfetti 的粒子层，页面里挂一次就接活 -->
    <FireworkBurst />
    <HelpSheet :open="helpOpen" :text="helpText" @close="helpOpen = false" />
  </view>
</template>

<script setup>
// 麻将传奇 · 微信小程序版
// 纯逻辑来自 web 的 board.js（**原样复制**：8×7 棋盘 + 重力 + DP 找组 + 计分 + 升行），
// 这里只重写视图，并把 localStorage → core/storage、Web Audio → core/sfx、
// getBoundingClientRect/window.innerWidth → selectorQuery / getSystemInfoSync。
import { computed, getCurrentInstance, onMounted, onUnmounted, reactive, ref, watch } from 'vue';

import MahjongTile from '@/components/MahjongTile.vue';
import FloatingActions from '@/components/FloatingActions.vue';
import HelpSheet from '@/components/HelpSheet.vue';
import Confetti from '@/components/Confetti.vue';
import FireworkBurst from '@/components/FireworkBurst.vue';
import { burstConfetti } from '@/core/firework';
import { getJSON, getRaw, setRaw } from '@/core/storage';
import { playElimination, playLose } from '@/core/sfx';
import { preloadTiles, TILE_RATIO } from '@/shared/mahjongTiles';
import { tt } from './i18n';
import {
  COLS, ROWS, PREVIEW, CELLS, CLEAR_MS, FALL_MS, SPAWN_MS,
  multiBonus, chainBonus, emptyGrid, settle, placeTile, replaceTile,
  findGroups, clearGroups, spawnRow, initialGrid, makeTile, resetUid, randomKind, randomRow,
  faceOf, MAX_VALUE, isFlower,
} from './board';

import { setNavTitle } from '@/core/i18n';
import ParticleBackground from '@/components/ParticleBackground.vue';

// 原生导航栏标题跟随语言（pages.json 里的标题是静态的）
setNavTitle(() => tt('gameTitle'));
// ---------- 存档 key：与 web 完全一致 ----------
const STATE_KEY = '__mahjong_legend__state';
const BEST_KEY = '__mahjong_legend__best_1';
const SUIT_KEY = '__legend__suit';            // 条牌 / 筒牌**展示偏好**（只影响牌面）

const PLAY = 'play';
const OVER = 'over';

const FLY_MS = 210;                 // 浮牌从候选区飞到目标格的时长（与麻将英雄一致）
const DEAL_MS = 340;                // 单张牌入场动画时长（波浪）
const HAND_W = 84;                  // 候选牌 44px（web 固定 44×56）
const PREVIEW_SCALES = [0.8, 0.6];  // 后两张：第二张 0.8、第三张 0.6（与 web 一致）
const GAP = 8;                      // 棋盘缝 4px（≈8rpx）
// 页面里除棋盘外的固定高度（rpx）：padding 36/140 + 统计条 168（全局）+ gap 36 + 操作区 120（全局）+ gap 36
// 底部 140 是给右下角悬浮按钮让位，否则 8×7 棋盘的最右列会被压住
const PAGE_FIXED_H = 36 + 168 + 36 + 120 + 36 + 270;   // 底部再多留 130rpx，让棋盘底边让开悬浮按钮
// 条牌 + 少量字牌 + 极少量花牌（概率都在 board.js 里：HONOR_RATE / FLOWER_RATE）
const randKind = () => randomKind();

const instance = getCurrentInstance();   // selectorQuery 需要组件实例

// ---------- 状态 ----------
const phase = ref(PLAY);
const grid = ref(emptyGrid());
const queue = ref([]);                 // 当前待出的牌 + 后面两张
const score = ref(0);
const best = ref(+(getRaw(BEST_KEY) || 0));
const clearedCount = ref(0);
const busy = ref(false);               // 动画/结算期间不收操作
const clearing = ref(new Map());       // 消除浮影层：id → { id, v, row, col }
const popped = reactive(new Set());    // 替换时的小弹出动画
const fromRow = reactive(new Map());   // id → 动画起始行（新一行先设在棋盘下方）
const dealing = ref(false);            // 开局 / 恢复时逐张铺开（左上 → 右下的波浪）
const dealSeq = ref(0);
const float = ref(null);               // 得分浮字（带 id：连击时元素重建，弹出动画才会重播）
const celebrating = ref(false);        // 外圈闪光
const shaking = ref(false);
const isNewBest = ref(false);          // 这一局有没有刷新过最高分（结算浮层用）
const beatBest = ref(false);
const moveMs = ref(FALL_MS);           // 位移过渡时长（升行那一下稍长）
const flying = ref(null);              // 从候选区飞向目标格的那张浮牌
const incomingId = ref(-1);            // 刚落位的那张牌：飞行途中先隐身，落定才显形
// 本作没有「赢」的状态（单局制，只有被顶出去），justWon 恒为 false（见模板注释）
const justWon = ref(false);

let floatId = 0;
let shakeTimer = 0;
let flashTimer = 0;
let flyTimer = 0;

const timers = [];
const wait = ms => new Promise(res => { timers.push(setTimeout(res, ms)); });
// 小程序没有 requestAnimationFrame：用一拍 30ms 替代原来的「两个 rAF」
const nextFrame = () => wait(32);
// 三个独立计时器也一起清：飞行途中点「新游戏」时宁可让那一手停住（与中途打断消除同一结果），
// 也不能让旧的 async 流程继续改刚开的新盘面
function clearTimers() {
  timers.forEach(clearTimeout);
  timers.length = 0;
  clearTimeout(shakeTimer);
  clearTimeout(flashTimer);
  clearTimeout(flyTimer);
}

// ---------- 条牌 / 筒牌展示切换 ----------
const suitPref = ref(getRaw(SUIT_KEY) === 'p' ? 'p' : 's');
function toggleSuit() {
  suitPref.value = suitPref.value === 's' ? 'p' : 's';
  setRaw(SUIT_KEY, suitPref.value);
}
// 花牌 → 'f'、字牌 → 'z'，条牌按偏好给 's' / 'p'（牌的值不变，判组 / 计分 / 存档全都不动）
const displaySuit = v => (isFlower(v) ? 'f' : v > 9 ? 'z' : suitPref.value);

// ---------- 尺寸（web 的 metrics 换成 rpx：750rpx = 屏宽） ----------
const metrics = ref({ cw: 91, ch: Math.round(91 * TILE_RATIO) });
const cw = computed(() => metrics.value.cw);
const ch = computed(() => metrics.value.ch);
const PAD = 12;                       // 棋盘内边距（rpx）：不留的话牌会贴边
const stepX = computed(() => cw.value + GAP);
const stepY = computed(() => ch.value + GAP);
const boardW = computed(() => COLS * cw.value + (COLS - 1) * GAP + PAD * 2);
const boardH = computed(() => ROWS * ch.value + (ROWS - 1) * GAP + PAD * 2);
const boardStyle = computed(() => ({ width: `${boardW.value}rpx`, height: `${boardH.value}rpx` }));

function readViewport() {
  // H5 的 innerHeight 含 uni 自带的导航栏（44px），而小程序的 windowHeight 已经扣掉了原生导航栏
  if (typeof window !== 'undefined' && window.innerWidth) {
    const head = typeof document !== 'undefined' ? document.querySelector('uni-page-head') : null;
    return { w: window.innerWidth, h: window.innerHeight - (head ? head.offsetHeight : 0) };
  }
  try {
    const s = uni.getSystemInfoSync();
    return { w: s.windowWidth || 393, h: s.windowHeight || 852 };
  } catch {
    return { w: 393, h: 852 };
  }
}

// 7 列受宽度约束（卡片 690rpx）、8 行受高度约束，取小；web 的下限 24px / 上限 92px 换成 46 / 176rpx
function computeMetrics() {
  const { w, h } = readViewport();
  const pxToRpx = 750 / w;
  const byW = (690 - GAP * (COLS - 1) - PAD * 2) / COLS;
  const byH = ((h * pxToRpx - PAGE_FIXED_H - GAP * (ROWS - 1)) / ROWS) / TILE_RATIO;
  const size = Math.floor(Math.max(46, Math.min(byW, byH, 176)));
  metrics.value = { cw: size, ch: Math.round(size * TILE_RATIO) };
}

// 槽位给布局尺寸、牌面填满槽位（小程序里 MahjongTile 是 100%×100%，尺寸必须由父级给）
// 候选牌圆角：与棋盘牌、web 的 MahjongTile 同口径（牌宽 × 0.09）+ 裁切；
// 宿主节点也要带圆角（小程序组件宿主会插一层，见 §零 第 9 条）。
const slotStyle = w => ({
  width: `${w}rpx`,
  height: `${Math.round(w * TILE_RATIO)}rpx`,
  borderRadius: `${Math.round(w * 0.09)}rpx`,
  overflow: 'hidden',
});
const previewScale = i => PREVIEW_SCALES[i] || 0.6;
// 后两张的槽位仍是 44 宽的布局盒，只把视觉缩到 0.8 / 0.6（与麻将英雄缩预览的做法一致）
const previewStyle = i => ({
  width: `${HAND_W}rpx`,
  height: `${Math.round(HAND_W * TILE_RATIO)}rpx`,
  transform: `scale(${previewScale(i)})`,
});
const posStyle = (row, col) => ({
    left: `${PAD + col * stepX.value}rpx`,
    top: `${PAD + row * stepY.value}rpx`,
  width: `${cw.value}rpx`,
  height: `${ch.value}rpx`,
});
const cellStyle = i => ({
  left: `${PAD + (i % COLS) * stepX.value}rpx`,
  top: `${PAD + Math.floor(i / COLS) * stepY.value}rpx`,
  width: `${cw.value}rpx`,
  height: `${ch.value}rpx`,
  borderRadius: `${Math.round(cw.value * 0.09)}rpx`,
});

// 棋盘上的牌（带行列，供模板定位）；from = 动画起始行（没有就用真实行）
// `k` 是 v-for 的 key（dealSeq 拼进去）：小程序里 `:key` 必须是**简单的成员表达式**才会编译成
// wx:key（复合表达式会被丢掉、退回按下标复用），而 key 不拼 dealSeq 的话 newRun()/restore()
// 里 uid 从 1 重来、key 撞上 → Vue 复用旧元素，入场波浪不重播、掉落的牌还会从错误的位置滑过去。
const tiles = computed(() => {
  const out = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = grid.value[r][c];
      if (t) {
        out.push({
          id: t.id,
          v: t.v,
          row: r,
          col: c,
          k: `${dealSeq.value}-${t.id}`,
          from: fromRow.has(t.id) ? fromRow.get(t.id) : r,
        });
      }
    }
  }
  return out;
});
const clearingTiles = computed(() => [...clearing.value.values()]);

const tileStyle = t => ({
  left: `${PAD + t.col * stepX.value}rpx`,
  top: `${PAD + t.from * stepY.value}rpx`,
  width: `${cw.value}rpx`,
  height: `${ch.value}rpx`,
  // 圆角与格子同款（web 的牌角 = cw × 0.09），否则牌是方的、格子是圆的
  borderRadius: `${Math.round(cw.value * 0.09)}rpx`,
  transitionDuration: `${moveMs.value}ms`,
  animationDelay: dealing.value ? `${dealDelay(t.row, t.col)}ms` : '0ms',
});

// 波浪式铺牌（照麻将英雄）：每张牌延迟 (行 + 列) × 60ms，波前从左上方扫到右下角。
// `dealSeq` 拼进 `:key` —— 不拼的话 newRun()/restore() 里 uid 从 1 重来、key 撞上，
// Vue 会复用元素、入场动画根本不重播（雀圣 / 麻将英雄都踩过同一个坑）。
const dealDelay = (row, col) => (row + col) * 60;
function startDeal() {
  dealing.value = true;
  dealSeq.value += 1;
  const last = (ROWS - 1 + COLS - 1) * 60 + DEAL_MS;
  timers.push(setTimeout(() => { dealing.value = false; }, last));
}

// ---------- 浮牌飞行（web 用 getBoundingClientRect + DOM 浮牌；这里 selectorQuery + fixed 替身） ----------
// 量不到位置时直接结算（牌直接出现在目标格），保证操作永远不会卡住。
function flyTo(value, row, col) {
  return new Promise(resolve => {
    Promise.all([queryRect('#hand-current'), queryRect('#cell-' + (row * COLS + col))]).then(([from, cell]) => {
      if (!from || !cell || !from.width || !cell.width) { resolve(); return; }
      const x = from.left + from.width / 2;
      const y = from.top + from.height / 2;
      flying.value = {
        v: value,
        x,
        y,
        w: from.width,
        dx: cell.left + cell.width / 2 - x,
        dy: cell.top + cell.height / 2 - y,
        scale: cell.width / Math.max(1, from.width),
        go: false,
      };
      // 先「落原位」，下一拍再改 transform 才会触发过渡（同一拍改没有动画）
      setTimeout(() => { if (flying.value) flying.value = { ...flying.value, go: true }; }, 30);
      clearTimeout(flyTimer);
      flyTimer = setTimeout(() => { flying.value = null; resolve(); }, FLY_MS);
    });
  });
}

const flyStyle = computed(() => {
  const f = flying.value;
  if (!f) return {};
  return {
    left: `${f.x}px`,
    top: `${f.y}px`,
    width: `${f.w}px`,
    height: `${Math.round(f.w * TILE_RATIO)}px`,
    transform: f.go
      ? `translate(-50%, -50%) translate(${f.dx}px, ${f.dy}px) scale(${f.scale})`
      : 'translate(-50%, -50%)',
  };
});

// ---------- 得分浮字 ----------
function showFloat(groups, gain, chain) {
  const title = groups.length > 1
    ? tt('multiName').replace('{n}', groups.length)
    : tt(`${groups[0].kind}Name`);
  float.value = { id: ++floatId, title, score: gain, chain };
  timers.push(setTimeout(() => { float.value = null; }, 950));
}

// 震动 / 外圈闪光：连击会连着触发。小程序里没有 offsetWidth 强制重排，
// 改成「先摘类名 → 20ms 后再加回」，第二次触发也能重播（麻将英雄就是这么处理的）。
function shakeBoard() {
  clearTimeout(shakeTimer);
  shaking.value = false;
  shakeTimer = setTimeout(() => {
    shaking.value = true;
    shakeTimer = setTimeout(() => { shaking.value = false; }, 340);
  }, 20);
}
function flashBoard() {
  clearTimeout(flashTimer);
  celebrating.value = false;
  flashTimer = setTimeout(() => {
    celebrating.value = true;
    flashTimer = setTimeout(() => { celebrating.value = false; }, 900);
  }, 20);
}

// ---------- 结算级联：消除 → 掉落 → 消除（连击） ----------
async function cascade(chain) {
  let did = false;
  for (;;) {
    const groups = findGroups(grid.value);
    if (!groups.length) break;
    chain += 1;
    const base = groups.reduce((s, g) => s + g.score, 0);
    const gain = base + multiBonus(groups.length) + chainBonus(chain);
    score.value += gain;
    clearedCount.value += groups.length;
    playElimination();                     // 与 web 的「消除一次」落点一致
    // 消除的牌立刻从 grid 里拿掉，单独渲染一层浮影播闪烁
    const map = new Map();
    for (const g of groups) {
      for (const [r, c] of g.cells) {
        const t = grid.value[r][c];
        if (t) map.set(t.id, { id: t.id, v: t.v, row: r, col: c });
      }
    }
    // **先**把牌从盘面拿掉，只留浮影层播闪烁 —— 先闪再删的话，闪烁期间底下还压着一张实牌
    clearing.value = map;
    grid.value = clearGroups(grid.value, groups);
    did = true;
    // 浮字与特效和上面的闪烁同一帧触发（先落位 / 拿掉，再 announce）
    showFloat(groups, gain, chain);
    if (groups.length > 1 || chain > 1) {   // 多消 / 连击：震动 + 外圈闪光 + 撒花
      shakeBoard();
      flashBoard();
      burstConfetti(groups.length > 1 ? 1 : 0.7);
    }
    await wait(CLEAR_MS);
    clearing.value = new Map();
    // 悬空的牌往下落
    grid.value = settle(grid.value);
    await wait(FALL_MS);
  }
  return { did, chain };
}

// 当前得分一超过最高分就**立刻**同步上去（用户要求）：最高分是实时涨的。
// `beatBest` 另外记「这一局刷新过纪录」，供结算浮层显示「新纪录诞生」——
// 不能再用 `score > best` 判断，因为那时 best 已经被同步成 score 了。
watch(score, v => {
  if (v <= best.value) return;
  best.value = v;
  beatBest.value = true;
  setRaw(BEST_KEY, String(best.value));
});

function gameOver() {
  phase.value = OVER;
  playLose();                              // 失败：与 web 的 gameOver() 同语义
  isNewBest.value = beatBest.value;
  save();
}

// ---------- 玩家操作：落子 / 替换 ----------
async function onCellClick(row, col) {
  if (busy.value || phase.value !== PLAY || !queue.value.length) return;
  busy.value = true;
  const v = queue.value.shift();
  queue.value.push(randKind());

  // 先把牌落到盘面上（数据立刻更新），但落点先隐身 —— 由飞过去的浮牌「接手」，
  // 等它飞到位再显形，看起来就是牌从候选区飞过去落在那一格（与麻将英雄同一手法）
  if (grid.value[row][col]) {
    // 替换：点到的位置已经有牌，用手上这张换掉它（旧牌直接弃掉）
    const next = replaceTile(grid.value, row, col, v);
    incomingId.value = next[row][col].id;
    grid.value = next;
    const popId = incomingId.value;
    popped.add(popId);
    timers.push(setTimeout(() => popped.delete(popId), 240));
  } else {
    const p = placeTile(grid.value, col, v);
    if (!p) { busy.value = false; return; }
    incomingId.value = p.grid[p.row][col].id;
    grid.value = p.grid;
  }
  await flyTo(v, row, col);
  incomingId.value = -1;
  await wait(60);

  const first = await cascade(0);

  if (!first.did) {
    // 这次操作没消除 → 底部升一行新牌，整盘往上顶一格
    const sp = spawnRow(grid.value, randomRow());
    grid.value = sp.grid;
    const fresh = grid.value[ROWS - 1].filter(Boolean);
    if (fresh.length) {
      moveMs.value = SPAWN_MS;
      fresh.forEach(t => fromRow.set(t.id, ROWS));       // 先设在棋盘下方，下一拍再落到位 → 看得见升起
      await nextFrame();
      fresh.forEach(t => fromRow.delete(t.id));
      await wait(SPAWN_MS);
      moveMs.value = FALL_MS;
    }
    if (sp.overflow) { gameOver(); busy.value = false; return; }
    // 新升上来的那一行本身也可能直接消除计分（继续同一串连击）
    await cascade(first.chain);
  }

  save();
  busy.value = false;
}

// ---------- 开局 / 存档 ----------
// 新游戏：**没有二次确认**（与 web 一致：本作单局制，直接清当前得分重开、保留最高分）
function newRun() {
  clearTimers();
  resetUid();
  busy.value = false;
  phase.value = PLAY;
  isNewBest.value = false;
  beatBest.value = false;
  score.value = 0;
  clearedCount.value = 0;
  clearing.value = new Map();
  popped.clear();
  fromRow.clear();
  float.value = null;
  shaking.value = false;
  celebrating.value = false;
  flying.value = null;
  incomingId.value = -1;      // 清掉「落点隐身」的 id，否则新一局里同 id 的那张牌会看不见
  moveMs.value = FALL_MS;
  queue.value = [];
  while (queue.value.length < 1 + PREVIEW) queue.value.push(randKind());
  // 开局底部摆**两行**，并保证这两行没有任何可消的组（见 board.js 的 initialGrid）
  grid.value = initialGrid().grid;
  startDeal();                         // 从左上角到右下角逐张铺开
  save();
}

function save() {
  setRaw(STATE_KEY, JSON.stringify({
    phase: phase.value,
    score: score.value,
    cleared: clearedCount.value,
    queue: queue.value,
    grid: grid.value.map(row => row.map(t => (t ? t.v : null))),
  }));
}

function restore() {
  const s = getJSON(STATE_KEY);
  if (!s || !Array.isArray(s.grid) || s.grid.length !== ROWS) return false;
  resetUid();
  grid.value = s.grid.map(row =>
    (Array.isArray(row) && row.length === COLS ? row.map(v => (v ? makeTile(v) : null)) : new Array(COLS).fill(null)));
  queue.value = (Array.isArray(s.queue) ? s.queue : []).filter(v => v >= 1 && v <= MAX_VALUE).slice(0, 1 + PREVIEW);
  while (queue.value.length < 1 + PREVIEW) queue.value.push(randKind());
  score.value = Math.max(0, +s.score || 0);
  clearedCount.value = Math.max(0, +s.cleared || 0);
  phase.value = s.phase === OVER ? OVER : PLAY;
  isNewBest.value = false;
  busy.value = false;
  // 恢复的局面同样按「左上 → 右下」的波浪逐张出现（与开新局一套）
  startDeal();
  return true;
}

// ---------- 帮助 ----------
// 文案用 web 的 help1..help4 原文（title 留空，否则第一段会重复出现两次）
const helpOpen = ref(false);
// 帮助文案：导语 + 各条（用空行分段，HelpSheet 会拆成段落）
const helpText = computed(() => {
  const parts = [];
  const keys = ['helpMsg'];
  for (let i = 1; i <= 10; i += 1) keys.push(`help${i}`);
  keys.forEach((k) => { const v = tt(k); if (v && v !== k) parts.push(v); });
  return parts.join('\n\n');
});
function showHelp() {
  helpOpen.value = true;
}

// ---------- selectorQuery（先按组件作用域量，拿不到再退回页面作用域） ----------
function queryRect(selector) {
  return new Promise(resolve => {
    const run = (scoped) => {
      let q = uni.createSelectorQuery();
      if (scoped && instance && instance.proxy) q = q.in(instance.proxy);
      q.select(selector).boundingClientRect(rect => {
        if (rect && rect.width) resolve(rect);
        else if (scoped) run(false);
        else resolve(null);
      }).exec();
    };
    run(true);
  });
}

// ---------- 生命周期 ----------
function onResize() {
  computeMetrics();
}

onMounted(async () => {
  computeMetrics();
  if (typeof uni.onWindowResize === 'function') uni.onWindowResize(onResize);
  // 先把牌面图读进缓存再铺盘（H5 下有效；小程序没有 Image 全局，直接跳过 —— 牌面是内联 data URI）
  if (typeof Image !== 'undefined') {
    try { await preloadTiles(); } catch { /* 加载失败也不影响开局 */ }
  }
  if (!restore()) newRun();
});

onUnmounted(() => {
  if (typeof uni.offWindowResize === 'function') uni.offWindowResize(onResize);
  clearTimers();
  save();
});
</script>

<style lang="scss" scoped>
/* web 的 keyframes 逐条搬过来（px → rpx 按 393 宽、1px ≈ 1.908rpx 折算） */
@keyframes tile-wave {
  from { opacity: 0; transform: translate(-34rpx, -34rpx) scale(0.45); }
  to { opacity: 1; transform: translate(0, 0) scale(1); }
}
@keyframes tile-in {
  0% { transform: scale(0.6); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes tile-pop {
  0% { transform: scale(0.7); opacity: 0.4; }
  60% { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); }
}
@keyframes blink-clear {
  0% { opacity: 1; filter: none; transform: scale(1); }
  16% { opacity: 0.12; }
  32% { opacity: 1; }
  50% { opacity: 0.12; }
  66% { opacity: 1; filter: brightness(1.9); }
  100% { opacity: 0; filter: brightness(2.6); transform: scale(0.72); }
}
@keyframes celebrate-pop {
  0% { opacity: 0; transform: translate(-50%, -30%) scale(0.4) rotate(-6deg); }
  28% { opacity: 1; transform: translate(-50%, -50%) scale(1.16) rotate(3deg); }
  44% { opacity: 1; transform: translate(-50%, -50%) scale(1) rotate(0deg); }
  78% { opacity: 1; transform: translate(-50%, -62%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -100%) scale(0.92); }
}
@keyframes board-celebrate {
  0% { box-shadow: 0 0 0 0 transparent; }
  25% { box-shadow: 0 0 0 8rpx rgba(35, 128, 78, 0.5), 0 0 50rpx 15rpx rgba(35, 128, 78, 0.5); }
  100% { box-shadow: 0 0 0 0 transparent; }
}
@keyframes board-shake {
  0%, 100% { transform: translate(0, 0); }
  15% { transform: translate(-10rpx, 4rpx); }
  30% { transform: translate(8rpx, -6rpx); }
  45% { transform: translate(-6rpx, -4rpx); }
  60% { transform: translate(6rpx, 4rpx); }
}

/* 一页只允许一处 min-height: 100vh（就在 .screen 上） */
.screen {
  min-height: 100vh;
  background: transparent;  /* 背景交给 ParticleBackground（canvas 自己铺底色） */
}
.page {
  padding: 36rpx 24rpx 140rpx;   /* 底部让开右下角悬浮按钮 */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 36rpx;
  background: #f0f2f5;
  color: #2c3e50;
}

/* ---------- 统计条（web --row-height: 72px = 138rpx） ---------- */
.score-area {
  width: 690rpx;
  height: 138rpx;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}
.stat {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
}
.stat-label { font-size: 23rpx; color: #5f6b7a; line-height: 1.2; }
.stat-value { font-size: 42rpx; font-weight: bold; line-height: 1.3; color: #2c3e50; }
.divider {
  width: 2rpx;
  height: 46rpx;
  align-self: center;
  background: #e1e1e1;
  opacity: 0.6;
}

/* ---------- 候选区 ---------- */
.opt-area {
  width: 690rpx;
  height: auto;              /* 牌比行高高，写死行高会盖住候选牌 */
  min-height: 138rpx;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}
.opt-half {
  display: flex;
  align-items: center;
  justify-content: center;
}
.opt-half:first-child { flex: 1.6; }
.opt-half:last-child { flex: 1.2; }
.hand { gap: 15rpx; }
/* 候选牌不画外部容器：只占位、居中，牌直接立在面板上 */
.tile-slot {
  overflow: hidden;          /* 裁出圆角（配合 tileStyle 里内联的 borderRadius） */
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}
.current {
  animation: tile-in 0.26s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  /* 高亮环画在槽位上（槽位由 slotStyle 给了 9% 圆角 + overflow:hidden）：
     画在牌上的话 box-shadow 的 4rpx spread 会把四个圆角补成直角 ✗（麻将英雄踩过同一个坑） */
  border-radius: 8rpx;
  box-shadow: 0 0 0 4rpx #23804e;
}
/* 候选区主次：当前牌描边高亮（web 的 outline 2px + offset 1px，这里用 box-shadow 兼容 WXSS） */
/* 高亮环已移到 .current（槽位）上，牌这里不再画 */
.preview {
  display: flex;
  align-items: center;
  gap: 4rpx;
  opacity: 0.55;
}

/* 主按钮：web 的 .game-icon（8px 16px 内边距 / 8px 圆角 / 14px 字号） */
.game-icon {
  margin: 0;
  padding: 0 31rpx;
  height: 74rpx;             /* web 实测 39px（14px 字 + 上下各 8px 内边距） */
  line-height: 74rpx;
  border: 0;
  border-radius: 15rpx;
  background: #23804e;
  color: #fff;
  font-size: 27rpx;
  font-weight: bold;
  white-space: nowrap;
  box-sizing: border-box;
}

/* ---------- 游戏区 ---------- */
.game-area {
  position: relative;
  margin: 0 auto;
  display: flex;              /* 与 web 一致：棋盘在页面里水平居中 */
  justify-content: center;
}
.board {
  position: relative;
  box-sizing: content-box;   /* 与 web 一致：1px 边框画在宽高之外，最右一列不会被裁 */
  overflow: hidden;          /* 新一行从下方升起、被顶出去的牌都裁掉 */
  border-radius: 27rpx;
  border: 2rpx solid #e1e1e1;
}
/* 点阵底纹（web App.vue 的 .dot-board；小程序没有全局那份，这里本地定义） */
.dot-board {
  background-color: #bbada0;
  background-image: radial-gradient(circle, rgba(255, 255, 255, 0.18) 2rpx, transparent 2rpx);
  background-size: 19rpx 19rpx;
  background-position: 10rpx 10rpx;
}
.board.shaking { animation: board-shake 0.34s ease; }
.board.celebrating { animation: board-celebrate 0.9s ease-out; }

.grid-cell {
  position: absolute;
  box-sizing: border-box;
  border: 2rpx solid #c9d0da;
  background: rgba(255, 255, 255, 0.06);
}
/* 盘面上的牌：点击都交给下面的格子（pointer-events: none）；万一某些运行时忽略它，
   牌自己挂了同一个点击处理，行为完全一致 */
.board .tile-slot {
  position: absolute;
  pointer-events: none;
  transition: top 200ms ease-out, left 200ms ease-out;
}
.board .tile-slot.placed { animation: tile-pop 0.22s ease; }
.board .tile-slot.clearing { animation: blink-clear 0.52s ease-in-out forwards; }
/* 落点隐身：飞行途中那一格先不画牌，等浮牌飞到位再显形 */
.board .tile-slot.incoming { opacity: 0; }

/* 入场波浪（延迟由 dealDelay() 按行列注入；key 里带 dealSeq 才会重播） */
.tile-slot.dealt { animation: tile-wave 0.34s cubic-bezier(0.34, 1.4, 0.64, 1) both; }

/* 得分浮字：棋盘正中弹出 */
.celebrate {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 6;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
  padding: 11rpx 23rpx;
  box-sizing: border-box;
  border-radius: 15rpx;
  background: #23804e;
  color: #fff;
  font-weight: bold;
  text-align: center;
  max-width: calc(100% - 16rpx);
  pointer-events: none;
  animation: celebrate-pop 0.95s ease forwards;
}
.celebrate-title { font-size: 29rpx; line-height: 1.2; }
.celebrate-score { font-size: 38rpx; line-height: 1.2; }
.celebrate-chain { font-size: 25rpx; line-height: 1.2; opacity: 0.92; }

/* 结算浮层：与棋盘矩形完全重合（inset: 0 + border-box） */
.result {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  z-index: 8;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 23rpx;
  padding: 23rpx;
  background: rgba(255, 255, 255, 0.8);
  font-size: 34rpx;
  font-weight: bold;
  text-align: center;
}
.result.lose { color: #b11; }
.result .final-score { font-size: 53rpx; }
.result .result-note { font-size: 27rpx; font-weight: 400; color: #5f6b7a; }

/* 飞行中的浮牌：位置 / 尺寸由 flyStyle 用 px 给（selectorQuery 量出来的是 px） */
.fly-tile {
  position: fixed;
  z-index: 60;
  pointer-events: none;
  transition: transform 0.2s ease-out;
  filter: drop-shadow(0 8rpx 19rpx rgba(0, 0, 0, 0.22));
}
</style>
