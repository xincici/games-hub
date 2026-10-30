<template>
  <view class="screen">
    <!-- 全站背景（粒子连线 + 底部过山车，与 web 的 ParticleBackground 同款） -->
    <ParticleBackground />
    <view class="page">
      <!-- ① 分数区：最长连胜 / 当前连胜 / 剩余牌数（label 的 emoji 在字典原文里，与 web 一致） -->
      <view class="card score-area">
        <view class="stat">
          <text class="stat-label">{{ tt('bestStreak') }}</text>
          <text class="stat-value">{{ best }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('streak') }}</text>
          <text class="stat-value">{{ streak }}</text>
        </view>
        <view class="divider" />
        <view class="stat">
          <text class="stat-label">{{ tt('wall') }}</text>
          <text class="stat-value">{{ wall.length }}</text>
        </view>
      </view>

      <!-- ② 按钮区：左边是本局缺哪个花色（web 的 opt-half），右边「新游戏」；比例 3 : 3.5，按钮自然宽度 -->
      <view class="card opt-area">
        <view class="opt-half">
          <text v-if="omitText" class="omit-note">{{ omitText }}</text>
        </view>
        <view class="divider" />
        <view class="start-wrapper">
          <button class="game-icon" @click="onNewGameClick">{{ tt('start') }}</button>
        </view>
      </view>

      <!-- 游戏区（结算浮层的定位上下文）：牌墙 → 出牌区 → 手牌区 -->
      <view class="game-area">
        <!-- ③ 牌墙：牌背按真实张数画出来（10 列 × 4 层，最多 40 张），摸走一张就少一张 -->
        <view class="card wall-card">
          <view id="wall-stack" class="wall-stack" :style="{ width: stackW + 'rpx', height: stackH + 'rpx' }">
            <view
              v-for="c in wallCells"
              :key="c.k"
              :id="c.anchor ? 'wall-anchor' : 'wall-back-' + c.id"
              class="tile-back"
              :class="{ deal: dealing }"
              :style="c.style"
            />
          </view>
        </view>

        <!-- ④ 出牌区：前三行打出去的牌（正面朝上），第四行是杠牌（右对齐） -->
        <view class="card discard-card">
          <view class="discard-row">
            <view
              v-for="c in discardCells"
              :id="'disc-' + c.id"
              :key="c.k"
              class="discard-slot"
              :class="{ 'fly-hidden': c.hidden }"
            >
              <MahjongTile :value="c.value" :suit="c.suit" class="mj-face" />
            </view>
            <text v-if="!discards.length" class="discard-empty">{{ tt('hint') }}</text>
          </view>
          <view class="kong-row">
            <view
              v-for="(k, ki) in kongs"
              :id="'kong-set-' + ki"
              :key="'kong-set-' + ki"
              class="kong-set"
              :class="{ 'fly-hidden': ki === hiddenKongIndex }"
            >
              <MahjongTile
                v-for="n in 4"
                :key="n"
                :value="k.value"
                :suit="k.suit"
                class="mj-face"
                :style="smallTileStyle"
              />
            </view>
          </view>
        </view>

        <!-- ⑤ 手牌区：显式槽位绝对定位（7 列），杠组占 4 个槽位宽；打出一张后整副重新排序 -->
        <view id="hand-card" class="card hand-card" :style="{ height: handCardH + 'rpx' }">
          <!-- 杠组：4 张一样的牌被框在一起，上方（下排时下方）浮出「杠牌」tooltip -->
          <view
            v-for="g in kongCells"
            :id="'kong-group-' + g.key"
            :key="g.k"
            class="kong-group"
            :class="{ framing: canFrame, drawn: g.drawn }"
            :style="g.style"
          >
            <button
              v-for="t in g.tiles"
              :key="'kt-' + t.id"
              :id="'hand-' + t.id"
              class="hand-tile kong-tile"
              :class="{ deal: dealing, celebrate: celebrating, 'fly-hidden': t.id === hiddenTileId }"
              :style="g.tileStyle"
              :disabled="phase !== PLAY || busy"
              @click="playTileId(t.id)"
            >
              <MahjongTile :value="t.value" :suit="t.suit" class="mj-face" />
            </button>
            <button
              v-if="kongOpenKey === g.key && phase === PLAY && canFrame"
              class="kong-tip"
              :class="{ below: kongTipBelow }"
              @click="doKong(g)"
            >
              {{ tt('kong') }}
            </button>
          </view>

          <!-- 单张手牌 -->
          <button
            v-for="c in singleCells"
            :id="'hand-' + c.tile.id"
            :key="c.k"
            class="hand-tile single"
            :class="{
              drawn: c.tile.id === drawnId,
              deal: dealing,
              celebrate: celebrating,
              'fly-hidden': c.tile.id === hiddenTileId,
            }"
            :style="c.style"
            :disabled="phase !== PLAY || busy"
            @click="playTileId(c.tile.id)"
          >
            <MahjongTile :value="c.tile.value" :suit="c.tile.suit" class="mj-face" />
          </button>
        </view>

        <!-- 胡牌 / 摸完的浮层：盖住整个游戏区（与 web 的 .result 同一份矩形） -->
        <view v-if="phase !== PLAY" class="result" :class="phase === WON ? 'win' : 'lose'">
          <text class="result-title">{{ phase === WON ? '🎉 ' + tt('win') : '🀄 ' + tt('lose') }}</text>
          <text class="result-streak">{{ tt('streak') }} {{ streak }}</text>
          <!-- 保留连胜继续打：走 dealRound（按当前连胜给更难的档），主色绿、不带 replay-btn -->
          <button class="game-icon" @click="dealRound">{{ tt('nextRound') }}</button>
        </view>
      </view>
    </view>

    <!-- 飞牌替身：摸牌 / 出牌是一张；杠牌是**一整组 4 张**一起飞（不是一张飞过去再变四张） -->
    <view v-if="flying && flying.tiles" class="flying flying-kong" :style="flyingVars">
      <MahjongTile
        v-for="(t, i) in flying.tiles"
        :key="'ft-' + i"
        :value="t.value"
        :suit="t.suit"
        class="mj-face fly-face"
        :style="flyTileStyle(i)"
      />
    </view>
    <view v-else-if="flying" class="flying" :style="flyingVars">
      <MahjongTile :value="flying.tile.value" :suit="flying.tile.suit" class="mj-face" />
    </view>

    <!-- 新游戏二次确认（web 的 shared/ConfirmDialog；小程序没有共享弹窗，这里本地实现） -->
    <view v-if="confirming" class="confirm-mask" @click="confirming = false">
      <view class="card confirm-box" @click.stop>
        <text class="confirm-title">{{ tt('start') }}</text>
        <text class="confirm-msg">{{ tt('newGameConfirm') }}</text>
        <view class="confirm-actions">
          <button class="confirm-cancel" @click="confirming = false">{{ tt('cancel') }}</button>
          <button class="confirm-ok" @click="startNewGame">{{ tt('confirmOk') }}</button>
        </view>
      </view>
    </view>

    <!-- 胜利彩带（纯 CSS 降级版；只在真正胡牌这一刻放，恢复存档不放） -->
    <Confetti v-if="justWon" />

    <!-- 右下角悬浮按钮：本作没有模式切换，只有帮助 -->
    <FloatingActions>
      <view class="fab" @click="showHelp"><view class="fab-ico i-carbon-help" /></view>
    </FloatingActions>
    <HelpSheet :open="helpOpen" :text="helpText" @close="helpOpen = false" />
  </view>
</template>

<script setup>
// 单人麻将 · 微信小程序版（web 的 src/games/solo/SoloGame.vue 移植）
// 纯逻辑来自 web 的 board.js（**逐字节复制**，没有 import，因此一行都没改）：
// 发牌 / 胡牌判断 / 杠 / 难度曲线 / 牌墙。
// 这里只重写视图，并把 localStorage → core/storage、Web Audio → core/sfx、
// getBoundingClientRect / getComputedStyle → selectorQuery + rpx 现算。
import { computed, getCurrentInstance, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

import Confetti from '@/components/Confetti.vue';
import FloatingActions from '@/components/FloatingActions.vue';
import HelpSheet from '@/components/HelpSheet.vue';
import MahjongTile from '@/components/MahjongTile.vue';
import { setNavTitle } from '@/core/i18n';
import { playLose, playWin } from '@/core/sfx';
import { getJSON, getRaw, setJSON, setRaw } from '@/core/storage';
import { preloadTiles, TILE_RATIO } from '@/shared/mahjongTiles';
import { tt } from './i18n';
import ParticleBackground from '@/components/ParticleBackground.vue';
import {
  HAND_SIZE, MELD_SIZE, isWin, kongOptions, newRoundSafe, sortTiles, tileKey,
} from './board';

// 原生导航栏标题跟随语言（pages.json 里的标题是静态的）
setNavTitle(() => tt('gameTitle'));

// ---------- 存档 key：与 web 一字不差（grep 自 web 的 SoloGame.vue） ----------
const KEYS = {
  state: '__solo__state',
  streak: '__solo__streak',
  best: '__solo__best_streak',
};

const PLAY = 'play';
const WON = 'won';
const LOST = 'lost';

// web 的 DEAL_WAVE_MS：手牌 14 张 × 45ms、牌堆 40 张 × 30ms（延迟饱和 18）都在这个窗口里跑完
const DEAL_WAVE_MS = 30 * 20 + 380;

// ---------- 尺寸（web 的 px 按 750rpx = 屏宽折算；牌面 131:168） ----------
const HAND_PAD = 15;                 // 手牌卡片内边距 8px
const HAND_GAP = 10;                 // 手牌间隙 5px
const COLS_PER_ROW = 7;              // 手牌每行 7 张
// 手牌单张宽度：**(690 − 左右内边距 − 6 个间隙) / 7**，由内容反算，不写死
const HAND_TILE_W = Math.floor((690 - HAND_PAD * 2 - (COLS_PER_ROW - 1) * HAND_GAP) / COLS_PER_ROW);
const HAND_TILE_H = Math.round(HAND_TILE_W * TILE_RATIO);
const SMALL_W = 37;                  // 出牌区 / 杠区的牌 19px
const SMALL_H = Math.round(SMALL_W * TILE_RATIO);   // 24px
// 牌墙：牌背 26×33px、列步进 29px（26 + 左右各 1px 描边 + 1px 缝）、每层右错 2px / 上错 4px
const BACK_W = 50;
const BACK_H = 64;
const BACK_GAP = 2;
const BACK_STEP = BACK_W + 4 + BACK_GAP;   // 56rpx（含左右各 2rpx 描边）
const LAYER_DX = 4;
const LAYER_DY = 8;
const STACK_COLS = 10;               // 一层 10 张 → 40 张 = 4 层

// ---------- 文案 / 存档小工具 ----------
const readInt = (key, dflt = 0) => {
  const v = Number(getRaw(key));
  return Number.isFinite(v) && v >= 0 ? v : dflt;
};
const write = (key, value) => setRaw(key, String(value));

// 牌上都挂一个 id：v-for 的 key、飞牌动画找元素、以及「刚摸到的那张」都靠它
let nextId = 1;
const withIds = tiles => tiles.map(t => ({ suit: t.suit, value: t.value, id: nextId++ }));
const validTile = t => t && typeof t === 'object'
  && ['m', 's', 'p', 'z'].includes(t.suit)
  && Number.isInteger(t.value) && t.value >= 1 && t.value <= (t.suit === 'z' ? 7 : 9)
  && Number.isInteger(t.id) && t.id > 0;
// 杠只存牌面（4 张同牌、没有 id）；点数范围按字牌 1~7、数牌 1~9 校验
const validKong = k => k && typeof k === 'object'
  && ['m', 's', 'p', 'z'].includes(k.suit)
  && Number.isInteger(k.value) && k.value >= 1 && k.value <= (k.suit === 'z' ? 7 : 9);

// ---------- 状态（**在 setup 里就恢复**，首帧即最终样子） ----------
// ⚠️ restoreState() 里要写到的 ref 必须全部声明在它**之前**，否则是 TDZ，
//    抛错被 catch 吞掉 → 现象是「没有存档时正常、带着存档重进反而重开一局」。
const hand = ref([]);
const drawnId = ref(null);       // 刚摸到的牌：显示时永远排最右，打出一张后清空 → 手牌按顺序重排
const wall = ref([]);
const discards = ref([]);
const kongs = ref([]);           // 已经杠出去的牌：[{ suit, value, count: 4 }]
const phase = ref(PLAY);
const omitSuit = ref(null);      // 本局缺哪个花色（null = 三个花色都在，只有旧存档才可能）
const busy = ref(false);         // 动画中不接受点击
const celebrating = ref(false);  // 胡牌后「挨个跳一下」的那一段
const confirming = ref(false);   // 「新游戏」的二次确认
const dealing = ref(false);      // 发牌波浪进行中
const dealSeq = ref(0);          // 拼进 :key → 重开一局 / 恢复存档时波浪才会重播
const kongOpenKey = ref(null);   // 哪个杠组的 tooltip 正开着（tileKey）
const flying = ref(null);        // 飞牌替身
const hiddenTileId = ref(null);  // 飞行中的那张牌：落点处的实体先藏起来（FLIP 不能露馅）
const hiddenKongIndex = ref(null);   // 杠牌飞行时，杠行里即将出现的那一组也先藏起来
const justWon = ref(false);      // 只有真胡牌才放彩带
const streak = ref(readInt(KEYS.streak, 0));
const best = ref(readInt(KEYS.best, 0));
const helpOpen = ref(false);

let roundSeq = 0;                // 每开一局 +1：异步动画跨局时立刻作废（防止旧流程写进新局）
let dealTimer = 0;
let wonTimer = 0;
const instance = getCurrentInstance();   // selectorQuery 需要组件实例

function restoreState() {
  try {
    const s = getJSON(KEYS.state);
    if (!s || !Array.isArray(s.hand) || !Array.isArray(s.wall)) return false;
    const savedKongs = Array.isArray(s.kongs) ? s.kongs : [];
    if (!savedKongs.every(validKong)) return false;
    // 同一张牌不可能杠两次（每张最多 4 张）
    if (new Set(savedKongs.map(tileKey)).size !== savedKongs.length) return false;
    // ⚠️ 有杠之后手牌不再是 14 张，而是 14 − 3 × 杠数。判据必须和 isWin() 一样按「等效张数」算：
    // 等效 13 张是「刚打出 / 刚杠完、自动补摸还没落盘」的那一瞬间（save() 在 commit 时就写了），
    // 恢复后要补上那次摸牌，见 onMounted 里的 pendingDraw。
    const effective = s.hand.length + MELD_SIZE * savedKongs.length;
    if (effective !== HAND_SIZE && effective !== HAND_SIZE - 1) return false;
    if (![...s.hand, ...s.wall].every(validTile)) return false;
    hand.value = s.hand.map(t => ({ suit: t.suit, value: t.value, id: t.id }));
    kongs.value = savedKongs.map(k => ({ suit: k.suit, value: k.value, count: 4 }));
    wall.value = s.wall.map(t => ({ suit: t.suit, value: t.value, id: t.id }));
    discards.value = Array.isArray(s.discards)
      ? s.discards.filter(validTile).map(t => ({ suit: t.suit, value: t.value, id: t.id }))
      : [];
    drawnId.value = Number.isInteger(s.drawnId) ? s.drawnId : null;
    phase.value = s.phase === WON ? WON : s.phase === LOST ? LOST : PLAY;
    // 缺门也要存：不然中途刷新回来「本局没有X」就没了（web 实测左格变空）
    omitSuit.value = ['m', 's', 'p'].includes(s.omit) ? s.omit : null;
    nextId = Math.max(1, ...[...hand.value, ...wall.value, ...discards.value].map(t => t.id)) + 1;
    return true;
  } catch (e) {
    // 与 web 一致：坏存档不弹窗、只打一条警告，然后按新局重开
    console.warn('[solo] 存档恢复失败，已按新局重开：', e);
    return false;
  }
}
const restored = restoreState();
// 存档可能落在「刚打出一张 / 刚杠完、补摸还没落地」的那一瞬间：等效 13 张 → 恢复后补摸一张
const pendingDraw = restored && phase.value === PLAY
  && hand.value.length + MELD_SIZE * kongs.value.length === HAND_SIZE - 1;

const save = () => {
  setJSON(KEYS.state, {
    hand: hand.value, wall: wall.value, discards: discards.value, kongs: kongs.value,
    omit: omitSuit.value, drawnId: drawnId.value, phase: phase.value,
  });
};

// ---------- 手牌显示项（web 的 displayItems，原样搬过来；拆成纯函数方便自检） ----------
// 除「刚摸到的那张」之外按顺序排列（刚摸的永远在最右），并把**手里凑齐 4 张一样**的
// 那 4 张抽成一个「杠组」——不管它们原本排在哪，包括刚摸到的那张补齐第 4 张的情况。
function buildDisplayItems(tiles, drawnTileId) {
  const drawn = tiles.find(t => t.id === drawnTileId);
  const rest = sortTiles(tiles.filter(t => t.id !== drawnTileId));
  const ordered = drawn ? [...rest, drawn] : rest;
  const counts = new Map();
  for (const t of ordered) { const k = tileKey(t); counts.set(k, (counts.get(k) || 0) + 1); }
  const items = [];
  const taken = new Set();
  for (const t of ordered) {
    if (taken.has(t.id)) continue;
    const k = tileKey(t);
    if ((counts.get(k) || 0) >= 4) {
      const four = ordered.filter(x => tileKey(x) === k);
      four.forEach(x => taken.add(x.id));
      items.push({ kind: 'kong', key: k, suit: t.suit, value: t.value, tiles: four });
    } else {
      taken.add(t.id);
      items.push({ kind: 'tile', tile: t });
    }
  }
  return items;
}

// 手牌槽位：**显式排**，不靠自动布局 —— 杠组是 1 个元素但占 4 张牌宽，
// 用 flex 换行会把它整体挤到下一行、用 grid 自动布局会在行尾留空洞，14 槽摊成 3 行。
// 规则（与 web 一致）：**第 i 个杠组占第 i 行行首**，其余单牌按显示顺序逐行填空位
// → 1 个杠 = 4+3 / 7、2 个杠 = 4+3 / 4+3，都恰好 7+7（3 个杠才需要 3 行，14 张里极罕见）。
function buildHandSlots(items) {
  const slots = items.map(() => null);
  const used = [];                                   // used[row][col] = true（1 基）
  const mark = (row, col, span) => {
    used[row] = used[row] || [];
    for (let c = col; c < col + span; c++) used[row][c] = true;
  };
  let kongNo = 0;
  items.forEach((it, i) => {
    if (it.kind !== 'kong') return;
    kongNo += 1;
    slots[i] = { row: kongNo, col: 1, span: 4 };
    mark(kongNo, 1, 4);
  });
  let row = 1;
  let col = 1;
  items.forEach((it, i) => {
    if (slots[i]) return;
    for (;;) {
      used[row] = used[row] || [];
      if (col > COLS_PER_ROW) { row += 1; col = 1; continue; }
      if (used[row][col]) { col += 1; continue; }
      break;
    }
    slots[i] = { row, col, span: 1 };
    mark(row, col, 1);
    col += 1;
  });
  return slots;
}

const displayItems = computed(() => buildDisplayItems(hand.value, drawnId.value));
const handSlots = computed(() => buildHandSlots(displayItems.value));

// 手牌卡高度也由内容反算：行数 × 牌高 + 行间距 + 上下内边距（正常 2 行）
const handRows = computed(() => {
  let maxRow = 1;
  for (const s of handSlots.value) if (s && s.row > maxRow) maxRow = s.row;
  return Math.max(2, maxRow);
});
const handCardH = computed(
  () => handRows.value * HAND_TILE_H + (handRows.value - 1) * HAND_GAP + HAND_PAD * 2,
);

// 槽位（格子与牌**共用这一份坐标数学**）：left = PAD + (col−1) × (牌宽 + 间隙)
const slotStyle = (i) => {
  const s = handSlots.value[i];
  if (!s) return {};
  return {
    left: `${HAND_PAD + (s.col - 1) * (HAND_TILE_W + HAND_GAP)}rpx`,
    top: `${HAND_PAD + (s.row - 1) * (HAND_TILE_H + HAND_GAP)}rpx`,
    width: `${s.span > 1 ? s.span * HAND_TILE_W + (s.span - 1) * HAND_GAP : HAND_TILE_W}rpx`,
    height: `${HAND_TILE_H}rpx`,
  };
};

// 发牌波浪 / 胡牌跳动：延迟用 CSS 变量给（值恒定，不会因为重渲染把动画重播）
const waveVars = i => ({ '--di': `${i * 45}ms`, '--dc': `${i * 55}ms` });

// 手牌显示列表：单张与杠组分开两个 v-for（小程序里 `:key` 要是简单成员表达式才会编译成 wx:key）
const singleCells = computed(() => {
  const out = [];
  displayItems.value.forEach((it, i) => {
    if (it.kind !== 'tile') return;
    out.push({
      tile: it.tile,
      k: `${dealSeq.value}-t${it.tile.id}`,
      style: { ...slotStyle(i), ...waveVars(i) },
    });
  });
  return out;
});
const kongCells = computed(() => {
  const out = [];
  displayItems.value.forEach((it, i) => {
    if (it.kind !== 'kong') return;
    out.push({
      key: it.key,
      suit: it.suit,
      value: it.value,
      tiles: it.tiles,
      k: `${dealSeq.value}-k${it.key}`,
      style: slotStyle(i),
      tileStyle: {
        width: `${HAND_TILE_W}rpx`,
        height: `${HAND_TILE_H}rpx`,
        ...waveVars(i),
      },
      drawn: it.tiles.some(t => t.id === drawnId.value),
    });
  });
  return out;
});

// tooltip 朝上还是朝下：杠组在**下排**时翻到下方（否则会盖住上排的牌、容易误点）。
// web 靠 getBoundingClientRect 量中心；这里槽位是显式算出来的，直接看它在第几行更准。
const kongTipBelow = computed(() => {
  const idx = displayItems.value.findIndex(it => it.kind === 'kong' && it.key === kongOpenKey.value);
  if (idx < 0) return false;
  const s = handSlots.value[idx];
  return !!s && s.row > 1;
});

// 手里有可杠的牌就自动浮出 tooltip（玩家点牌打出去后它自然消失）
const kongOpts = computed(() => kongOptions(hand.value).map(t => tileKey(t)));
watch(kongOpts, (opts) => {
  if (!opts.length) { kongOpenKey.value = null; return; }
  if (!opts.includes(kongOpenKey.value)) kongOpenKey.value = opts[0];
}, { immediate: true });

// 什么时候可以把 4 张「框起来」（并浮出 tooltip）：**发牌波浪结束** 且 **没有飞行中的牌**。
// 摸到第 4 张是「先提交再飞」的，只判 !dealing 的话牌还在空中就已经被抽成杠组并画上橙框了。
const canFrame = computed(() => !dealing.value && !flying.value);

// ---------- 牌墙 / 出牌区的显示数据 ----------
const stackW = computed(() => Math.min(wall.value.length, STACK_COLS) * BACK_STEP + LAYER_DX + BACK_GAP);
const stackH = computed(() => BACK_H + LAYER_DY + 6);
const backStyle = (i) => {
  const col = i % STACK_COLS;
  const layer = Math.floor(i / STACK_COLS);       // 0 = 下层，1 = 上层
  return {
    left: `${col * BACK_STEP + layer * LAYER_DX}rpx`,
    top: `${LAYER_DY - layer * LAYER_DY}rpx`,
    zIndex: i,
    // 波浪延迟：**饱和**在 18 × 30ms（40 张也不会拖到 1.5s）
    animationDelay: `${Math.min(i, 18) * 30}ms`,
  };
};
const wallCells = computed(() => wall.value.map((b, i) => ({
  id: b.id,
  k: `${dealSeq.value}-w${b.id}`,
  anchor: i === 0,
  style: backStyle(i),
})));

const smallTileStyle = {
  width: `${SMALL_W}rpx`,
  height: `${SMALL_H}rpx`,
  flex: '0 0 auto',
};
// 出牌区的牌用一层 view 包住：**尺寸/圆角/id/隐形都挂在普通节点上**（小程序里
// 自定义组件的宿主节点不适合当 FLIP 的量测目标），牌面组件再 100% 填满它。
const discardCells = computed(() => discards.value.map(t => ({
  id: t.id,
  suit: t.suit,
  value: t.value,
  k: `${dealSeq.value}-d${t.id}`,
  hidden: t.id === hiddenTileId.value,
})));

// i18n 不支持插值，这里直接拼（缺门说明原来在牌堆下方，用户要求挪到按钮区左侧）
const omitText = computed(() => (omitSuit.value ? tt('omit') + tt(`suits.${omitSuit.value}`) : ''));

// ---------- 飞牌（web 用 getBoundingClientRect + 关键帧；这里 selectorQuery + fixed 替身 + transition） ----------
const winW = () => {
  try { return uni.getSystemInfoSync().windowWidth || 375; } catch { return 375; }
};
const rpxPx = v => (v * winW()) / 750;
const sleep = ms => new Promise((resolve) => { setTimeout(resolve, ms); });

function queryRect(selector) {
  return new Promise((resolve) => {
    const run = (scoped) => {
      let q = uni.createSelectorQuery();
      if (scoped && instance && instance.proxy) q = q.in(instance.proxy);
      q.select(selector).boundingClientRect((rect) => {
        if (rect && rect.width) resolve(rect);
        else if (scoped) run(false);
        else resolve(null);
      }).exec();
    };
    run(true);
  });
}
const centerOf = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height });

const flyingVars = computed(() => {
  const f = flying.value;
  if (!f) return {};
  return {
    left: `${f.x}px`,
    top: `${f.y}px`,
    width: `${f.w}px`,
    height: `${f.h}px`,
    transform: f.go
      ? `translate(-50%, -50%) translate(${f.dx}px, ${f.dy}px) scale(${f.scale})`
      : 'translate(-50%, -50%)',
    transitionDuration: `${f.dur}ms`,
  };
});

// 统一 FLIP：**先藏、再提交**（`hiddenTileId` 必须在 commit() 之前设好，落点第一帧就是隐形的），
// 提交后量落点、让替身飞过去。量不到位置就只提交、不飞（绝不卡住操作）。
async function flyToTile(tile, from, targetSelector, dur, commit) {
  if (!from) { commit(); return; }
  hiddenTileId.value = tile.id;
  commit();
  await nextTick();
  const el = await queryRect(targetSelector);
  if (el) {
    const to = centerOf(el);
    await flyTile(tile, from, to, dur, to.w / (from.w || 40));
  }
  // 先露出实体（清 hiddenTileId），等它画出一帧，再撤替身
  hiddenTileId.value = null;
  await nextTick();
  await sleep(24);
  flying.value = null;
}
async function flyTile(tile, from, to, dur, scale) {
  flying.value = {
    tile,
    x: from.x,
    y: from.y,
    dx: to.x - from.x,
    dy: to.y - from.y,
    dur,
    scale,
    w: from.w,
    h: Math.round(from.w * TILE_RATIO),
    go: false,
  };
  await sleep(30);                                  // 先「落原位」，下一拍再改 transform 才会过渡
  if (flying.value) flying.value = { ...flying.value, go: true };
  await sleep(dur);
  // ⚠️ 不在这里清 flying：真机上「替身消失」与「实体牌重画」若落在同一帧，会出现一帧空白（看着像闪一下）。
  // 交给调用方：先露出实体，下一帧再撤替身。
}

// 量一个「杠组」的出发口径：外层矩形 + 组内单张尺寸 + 组内间距（间距是本页常量）
async function groupShape(selector) {
  const r = await queryRect(selector);
  if (!r) return null;
  const gap = rpxPx(HAND_GAP);
  return { rect: centerOf(r), tileW: Math.max(8, (r.width - 3 * gap) / 4), tileH: r.height, gap };
}
// 杠牌：**4 张作为一个整体飞过去**。替身是个容器（尺寸 = 出发那一组的实测尺寸），
// 整体按关键帧缩放到落点那一组的**单张牌高** —— 用牌高算缩放比，两端的牌看起来一样大。
async function flyGroup(tiles, shape, toEl, dur) {
  const to = centerOf(toEl);
  const from = shape.rect;
  flying.value = {
    tiles,
    x: from.x,
    y: from.y,
    dx: to.x - from.x,
    dy: to.y - from.y,
    dur,
    scale: rpxPx(SMALL_H) / shape.tileH,
    w: from.w,
    h: from.h,
    tw: shape.tileW,
    th: shape.tileH,
    gap: shape.gap,
    go: false,
  };
  await sleep(30);
  if (flying.value) flying.value = { ...flying.value, go: true };
  await sleep(dur);
  // ⚠️ 不在这里清 flying：真机上「替身消失」与「实体牌重画」若落在同一帧，会出现一帧空白（看着像闪一下）。
  // 交给调用方：先露出实体，下一帧再撤替身。
}
const flyTileStyle = (i) => {
  const f = flying.value;
  if (!f || !f.tiles) return {};
  return {
    left: `${i * (f.tw + f.gap)}px`,
    top: '0px',
    width: `${f.tw}px`,
    height: `${f.th}px`,
  };
};

// ---------- 摸一张（打牌后、杠牌后都走这里） ----------
async function drawOne() {
  if (!wall.value.length) { lose(); return; }
  const seq = roundSeq;
  // 摸牌要从**一张牌背**起飞：量整个 .wall-stack 会得到一整堆的宽度，飞出来像一张巨牌
  const fromBack = (await queryRect('#wall-anchor')) || (await queryRect('#wall-stack'));
  if (seq !== roundSeq) return;      // 量位置是异步的：这期间点了「新游戏」就作废，别把旧牌摸进新局
  const next = wall.value[0];
  await flyToTile(next, fromBack ? centerOf(fromBack) : null, `#hand-${next.id}`, 400, () => {
    wall.value = wall.value.slice(1);
    hand.value = [...hand.value, next];
    drawnId.value = next.id;
    save();
  });
  if (seq !== roundSeq) return;
  if (isWin(hand.value, kongs.value.length)) { await celebrateWin(seq); return; }
  // 摸完最后一张还没胡 → 稍等一下直接判负（不用等玩家再打出去）
  if (!wall.value.length) {
    await sleep(350);
    if (seq !== roundSeq) return;
    lose();
  }
}

/** 胡牌收尾：① 手牌排整齐 ② 每张挨个跳一下 ③ 再给胜利提示 + 彩带 + 音效 */
async function celebrateWin(seq) {
  drawnId.value = null;
  await nextTick();
  celebrating.value = true;
  await sleep(55 * hand.value.length + 450);
  celebrating.value = false;
  if (seq !== roundSeq) return;
  phase.value = WON;
  streak.value += 1;
  best.value = Math.max(best.value, streak.value);
  write(KEYS.streak, streak.value);
  write(KEYS.best, best.value);
  save();
  justWon.value = true;
  clearTimeout(wonTimer);
  wonTimer = setTimeout(() => { justWon.value = false; }, 4000);
  playWin();                 // web 的 confetti() 内部就是 playWin() + 撒花
}

/** 本局结束：当前连胜清零（最长连胜作为记录保留） */
function lose() {
  // 失败就停在 lost 状态并**存进存档**：退出重进还是这个失败局面，由玩家自己点「下一局」开新局
  phase.value = LOST;
  playLose();
  streak.value = 0;
  write(KEYS.streak, 0);
  save();
}

// ---------- 打一张 → 自动摸一张 ----------
async function playTileId(id) {
  if (phase.value !== PLAY || busy.value) return;
  const tile = hand.value.find(t => t.id === id);
  if (!tile) return;
  busy.value = true;
  kongOpenKey.value = null;
  const seq = roundSeq;
  const from = await queryRect(`#hand-${id}`);
  if (seq !== roundSeq) return;      // 同上：量完位置先确认还是同一局
  // 出牌用 FLIP：手牌里那张（源）与出牌区那张（落点）在飞行期间都隐形，由替身顶着飞过去
  await flyToTile(tile, from ? centerOf(from) : null, `#disc-${id}`, 380, () => {
    hand.value = hand.value.filter(t => t.id !== id);
    discards.value = [...discards.value, tile];
    drawnId.value = null;
    save();
  });
  if (seq !== roundSeq) return;
  await drawOne();
  if (seq !== roundSeq) return;
  busy.value = false;
}

// ---------- 杠牌：4 张一样的牌出去、进右下角的杠区，再从牌墙补摸一张 ----------
async function doKong(item) {
  if (phase.value !== PLAY || busy.value) return;
  const four = hand.value.filter(t => tileKey(t) === item.key);
  if (four.length < 4) return;
  busy.value = true;
  kongOpenKey.value = null;
  const seq = roundSeq;
  // 出发口径 = 手牌里那个被框住的杠组（4 张 + 3 个间隙）
  const shape = await groupShape(`#kong-group-${item.key}`);
  if (seq !== roundSeq) return;      // 同上：量完位置先确认还是同一局
  // 先藏「杠行里即将出现的那一组」，再提交 —— 和摸牌 / 出牌同一个套路：落点第一帧就隐形
  const newIndex = kongs.value.length;
  hiddenKongIndex.value = newIndex;
  hand.value = hand.value.filter(t => tileKey(t) !== item.key);
  kongs.value = [...kongs.value, { suit: item.suit, value: item.value, count: 4 }];
  drawnId.value = null;
  save();
  await nextTick();
  const toEl = await queryRect(`#kong-set-${newIndex}`);
  if (shape && toEl) await flyGroup(four, shape, toEl, 380);
  hiddenKongIndex.value = null;
  if (seq !== roundSeq) return;
  await drawOne();                     // 杠完补摸一张
  if (seq !== roundSeq) return;
  busy.value = false;
}

// 「新游戏」只在**当前连胜 > 0** 时才需要二次确认（连胜本来就是 0 时没什么可清的，直接开新局）
function onNewGameClick() {
  if (streak.value > 0) confirming.value = true;
  else dealRound();
}

// ---------- 新一局 ----------
// 只发一局新牌，**不动连胜**：首次进入（没有存档）、浮层上的「下一局」都走这里。
function dealRound() {
  roundSeq += 1;
  const r = newRoundSafe(Math.random, streak.value);
  hand.value = sortTiles(withIds(r.hand));
  wall.value = withIds(r.wall);
  discards.value = [];
  kongs.value = [];
  kongOpenKey.value = null;
  drawnId.value = null;
  omitSuit.value = r.omitted;
  phase.value = PLAY;
  busy.value = false;
  flying.value = null;
  // 这里只清「隐形」标记即可（同步流程里没有替身要撤）
  hiddenTileId.value = null;
  hiddenKongIndex.value = null;
  justWon.value = false;
  save();
  // 发牌波浪必须放在**末尾**：上面那行 busy=false 会覆盖这里的 busy=true（web 踩过）
  playDealWave();
}

// 发牌波浪：手牌（14 张 × 45ms）与牌堆（40 张 × 30ms）都从左往右依次入场。
// 发新牌与「恢复存档」都走这里；动画期间 busy=true（牌还没露出来就点不到）。
let waveResolve = null;
function playDealWave() {
  // 上一波还没走完就又开一局：先把它的 Promise 结束掉（调用方会用自己的 roundSeq 守卫作废后续动作），
  // 不能让 onMounted 里的 await 永远悬着。
  if (waveResolve) { const done = waveResolve; waveResolve = null; done(); }
  dealing.value = true;
  busy.value = true;
  dealSeq.value += 1;
  clearTimeout(dealTimer);
  return new Promise((resolve) => {
    waveResolve = resolve;
    dealTimer = setTimeout(() => {
      dealing.value = false;
      busy.value = false;
      if (waveResolve) { const done = waveResolve; waveResolve = null; done(); }
    }, DEAL_WAVE_MS);
  });
}

// 「新游戏」确认之后：**当前连胜清零**（最长连胜作为记录保留），再从头发一局
function startNewGame() {
  confirming.value = false;
  streak.value = 0;
  write(KEYS.streak, 0);
  dealRound();
}

// ---------- 帮助 ----------
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

// ---------- 生命周期 ----------
onMounted(async () => {
  // 先把牌面图读进缓存再铺盘（H5 下有效；小程序没有 Image 全局，直接跳过 —— 牌面是内联 data URI）
  if (typeof Image !== 'undefined') {
    try { await preloadTiles(); } catch { /* 加载失败也不影响开局 */ }
  }
  if (!restored) { dealRound(); return; }
  // 恢复存档也播一次发牌波浪（用户要求）；烟花仍然只在真胡牌时放
  await playDealWave();
  if (!pendingDraw) return;
  // 波浪期间用户可能点了「新游戏」：只有手牌仍是那副「等效 13 张」的恢复局面时才补摸
  const stillPending = phase.value === PLAY
    && hand.value.length + MELD_SIZE * kongs.value.length === HAND_SIZE - 1;
  if (!stillPending) return;
  if (!wall.value.length) { lose(); return; }
  const seq = roundSeq;
  busy.value = true;
  await drawOne();
  if (seq !== roundSeq) return;
  busy.value = false;
});

onUnmounted(() => {
  clearTimeout(dealTimer);
  clearTimeout(wonTimer);
});
</script>

<style lang="scss" scoped>
/* web 的 keyframes 逐条搬过来（px → rpx 按 1px ≈ 1.923rpx 折算） */
@keyframes solo-deal {
  0%   { opacity: 0; transform: translateY(-23rpx) scale(0.85); }
  60%  { opacity: 1; transform: translateY(-4rpx) scale(1.03); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes solo-drawn {
  from { transform: translateY(-8rpx); }
  to   { transform: translateY(0); }
}
@keyframes solo-celebrate {
  0%, 100% { transform: translateY(0); }
  35%      { transform: translateY(-19rpx); }
  70%      { transform: translateY(0); }
}

/* 一页只允许一处 min-height: 100vh（就在 .screen 上） */
.screen {
  min-height: 100vh;
  background: transparent;  /* 背景交给 ParticleBackground（canvas 自己铺底色） */
}
.page {
  padding: 27rpx 24rpx 140rpx;    /* 底部 140rpx 给右下角悬浮按钮让位 */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 31rpx;                    /* = web 的 --row-gap: 16px */
  background: #f0f2f5;
  color: #2c3e50;
}

/* ---------- 分数区（高度走 App.vue 的全局 .score-area） ---------- */
.score-area {
  width: 690rpx;
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
  flex: 0 0 auto;
}

/* ---------- 操作区：左格文案 : 按钮 = 3 : 3.5，按钮自然宽度 ---------- */
.opt-area {
  width: 690rpx;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}
.opt-half {
  flex: 3;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.start-wrapper {
  flex: 3.5;
  display: flex;
  align-items: center;
  justify-content: center;
}
.omit-note { font-size: 25rpx; color: #5f6b7a; }
.game-icon {
  margin: 0;
  padding: 0 31rpx;
  height: 74rpx;
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

/* ---------- 游戏区（结算浮层的定位上下文） ---------- */
.game-area {
  width: 690rpx;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 31rpx;
}

/* ---------- ③ 牌墙 ---------- */
.wall-card {
  width: 100%;
  height: 138rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 牌背用内联 z-index 排层（0..39），会和结算层的 z-index 直接比大小 →
     z-index: 0 让牌堆自己成为一个层叠上下文，里面的值只在牌堆内部生效
    （web 用的是 isolation: isolate，wxss 用 z-index: 0 等效且更稳）。 */
  position: relative;
  z-index: 0;
  overflow: hidden;
}
.wall-stack {
  position: relative;
  flex: 0 0 auto;
}
/* 牌背：绿色底 + 双向斜纹（与 web 的 shared/MahjongBack `fill` 模式同一套纹理） */
.tile-back {
  position: absolute;
  width: 50rpx;
  height: 64rpx;
  box-sizing: border-box;
  border-radius: 8rpx;
  border: 2rpx solid rgba(0, 0, 0, 0.20);
  background-color: #1f7a4d;
  background-image:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.18) 0, rgba(255, 255, 255, 0.18) 5%, rgba(255, 255, 255, 0) 5%, rgba(255, 255, 255, 0) 12%),
    repeating-linear-gradient(-45deg, rgba(0, 0, 0, 0.12) 0, rgba(0, 0, 0, 0.12) 5%, rgba(0, 0, 0, 0) 5%, rgba(0, 0, 0, 0) 12%);
}
/* 内圈压边（MahjongBack 的 ::after，按百分比内缩 → 小牌背纹理密度与大牌一致） */
.tile-back::before {
  content: '';
  position: absolute;
  left: 6%;
  right: 6%;
  top: 7%;
  bottom: 7%;
  border-radius: 6%;
  border: 1px solid rgba(255, 255, 255, 0.24);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.12);
}
/* 每张牌背下缘那一点「厚度」，配合 8rpx 的层间距看出是微微摞起来的两层 */
.tile-back::after {
  content: '';
  position: absolute;
  left: 0;
  top: 6rpx;
  width: 100%;
  height: 100%;
  border-radius: 8rpx;
  background: rgba(0, 0, 0, 0.26);
  z-index: -1;
}
/* 发牌波浪：牌背从左→右依次入场（延迟由 backStyle() 内联给出，饱和在 18 张） */
.tile-back.deal {
  animation: solo-deal 0.36s ease both;
}

/* ---------- ④ 出牌区：3 行出牌 + 1 行杠牌 ---------- */
.discard-card {
  width: 100%;
  height: 250rpx;                     /* --small-tile-h × 4 + 32px */
  padding: 12rpx 15rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.discard-row {
  flex: 0 0 149rpx;                   /* 3 × 牌高 + 2 × 行间距 */
  overflow-y: auto;
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  align-items: flex-start;            /* 默认 stretch 会把牌纵向拉成竖条 */
  gap: 4rpx;
}
/* 牌面组件宿主：显式宽高/圆角/裁切（小程序里宿主没尺寸就是空白、没圆角就是直角） */
.mj-face {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 8rpx;
  border-radius: 9% / 7%;             /* 与 web 的 `--mj-w × 0.09` 等效，随牌大小等比 */
  overflow: hidden;
}
.discard-slot {
  position: relative;
  width: 37rpx;                      /* 19px */
  height: 47rpx;                     /* 19 × 1.2824 */
  flex: 0 0 auto;
  border-radius: 9% / 7%;
  overflow: hidden;
}
.discard-slot.fly-hidden { visibility: hidden; }   /* FLIP 期间让飞行牌顶替 */
.discard-empty {
  font-size: 23rpx;
  color: #5f6b7a;
  align-self: center;
  margin: 0 auto;
}
.kong-row {
  flex: 1;
  min-height: 47rpx;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12rpx;
}
.kong-set {
  display: flex;
  align-items: center;
  gap: 2rpx;
  padding: 4rpx;
  border-radius: 12rpx;
  background: rgba(35, 128, 78, 0.14);
  box-shadow: inset 0 0 0 2rpx rgba(35, 128, 78, 0.45);
}
.kong-set.fly-hidden { visibility: hidden; }

/* ---------- ⑤ 手牌区：绝对定位的显式槽位 ---------- */
.hand-card {
  position: relative;
  width: 100%;
  box-sizing: border-box;
  padding: 15rpx;
  /* 高度由 handCardH 内联给出（2 行 = 109 × 2 + 10 + 30 = 258rpx） */
}
/* 手牌：单张是**绝对定位的槽位**；杠组里的 4 张是 flex item（不能一起绝对定位，
   否则容器排版会塌掉） —— 两种用法共用下面这份外观 */
.hand-tile {
  display: block;
  margin: 0;
  /* 真机兜底：牌面是 735% 放大的雪碧图，位置/动画变化时容易「先白一下」（合成层问题）。
     固定到合成层后不再重新栅格化（与 match / poker 的 .face 同一套兜底）。 */
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
  -webkit-transform: translateZ(0);
  will-change: transform, opacity;
  padding: 0;
  border: 0;
  background: none;
  overflow: hidden;
  border-radius: 8rpx;
  border-radius: 9% / 7%;
  line-height: 0;
}
.hand-tile.single { position: absolute; }
.hand-tile.kong-tile { position: relative; flex: 0 0 auto; }
/* 小程序里 button[disabled] 自带灰底/灰字，会盖到牌面上 —— 这里显式清掉 */
.hand-tile[disabled] {
  background: none;
  opacity: 1;
}
/* 发牌波浪：14 张按序号依次入场（--di 由 waveVars() 内联给出，值恒定不重播） */
.hand-tile.deal {
  animation: solo-deal 0.36s ease both;
  animation-delay: var(--di, 0ms);
}
.hand-tile.drawn { animation: solo-drawn 0.3s ease; }
/* 胡牌时每张牌挨个跳一下（--dc = 序号 × 55ms） */
.hand-tile.celebrate {
  animation: solo-celebrate 0.42s ease;
  animation-delay: var(--dc, 0ms);
}
.hand-tile.fly-hidden { visibility: hidden; }

/* 杠组：4 张牌框在一起（框必须用 box-shadow 画：它不占布局空间，不会把后面的牌挤换行） */
.kong-group {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 10rpx;
  border-radius: 15rpx;
}
.kong-group.framing {
  box-shadow: 0 0 0 4rpx #c2410c;
  background: rgba(194, 65, 12, 0.10);
}
.kong-group.drawn { animation: solo-drawn 0.3s ease; }

/* 杠牌 tooltip：浮在杠组上方（下排时翻到下方，避免盖住上排的牌造成误点） */
.kong-tip {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 12rpx);
  transform: translateX(-50%);
  z-index: 40;
  margin: 0;
  padding: 17rpx 35rpx;
  height: auto;
  line-height: 1.2;
  white-space: nowrap;
  font-size: 27rpx;
  font-weight: 700;
  color: #fff;
  background: #c2410c;
  border: 0;
  border-radius: 999rpx;
  box-shadow: 0 4rpx 15rpx rgba(0, 0, 0, 0.25);
}
/* 小三角：朝下手牌那侧，**不吃点击**（不然「想点这张牌」会变成触发杠牌） */
.kong-tip::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 100%;
  margin-left: -10rpx;
  border: 10rpx solid transparent;
  border-top-color: #c2410c;
  pointer-events: none;
}
.kong-tip.below {
  top: calc(100% + 12rpx);
  bottom: auto;
}
.kong-tip.below::after {
  top: auto;
  bottom: 100%;
  border-top-color: transparent;
  border-bottom-color: #c2410c;
}

/* ---------- 飞牌替身：fixed 定位（不受滚动影响），位移 / 时长走内联样式 ---------- */
.flying {
  position: fixed;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
  will-change: transform;
  z-index: 60;
  pointer-events: none;
  transform: translate(-50%, -50%);
  transition-property: transform;
  transition-timing-function: cubic-bezier(0.3, 0.9, 0.4, 1);
}
/* 杠牌：4 张作为一个整体 —— 容器整体缩放，组内的牌按出发时的像素尺寸绝对定位 */
.flying-kong {
  transform-origin: center center;
}
.fly-face {
  position: absolute;
  top: 0;
  left: 0;
}

/* ---------- 结算浮层：盖住整个游戏区（矩形与 .game-area 完全重合） ---------- */
.result {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 19rpx;
  padding: 23rpx;
  border-radius: 27rpx;
  background: rgba(255, 255, 255, 0.8);   /* web 的 --mask-color */
  color: #12833f;                          /* web 的 --win-color */
  font-weight: bold;
  z-index: 20;
}
.result.lose { color: #b11; }              /* web 的 --lose-color */
.result-title { font-size: 38rpx; }
.result-streak { font-size: 27rpx; opacity: 0.85; font-weight: 400; }

/* ---------- 新游戏二次确认（本地版 ConfirmDialog） ---------- */
.confirm-mask {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
}
.confirm-box {
  width: calc(100% - 122rpx);
  max-width: 610rpx;
  padding: 38rpx 38rpx 31rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  border-radius: 27rpx;
  background: #fff;
  color: #2c3e50;
}
.confirm-title { font-size: 32rpx; font-weight: bold; margin-bottom: 15rpx; }
.confirm-msg {
  font-size: 27rpx;
  opacity: 0.8;
  line-height: 1.5;
  margin-bottom: 31rpx;
}
.confirm-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 19rpx;
}
.confirm-actions button {
  margin: 0;
  padding: 0 23rpx;
  height: 62rpx;
  line-height: 62rpx;
  font-size: 27rpx;
  border: 0;
  border-radius: 15rpx;
  white-space: nowrap;
  box-sizing: border-box;
}
.confirm-cancel { background: #eef0f4; color: #2c3e50; }
.confirm-ok { background: #23804e; color: #fff; font-weight: bold; }
</style>
