<template>
  <view class="screen">
    <!-- 全站背景（粒子连线 + 底部过山车，与 web 的 ParticleBackground 同款） -->
    <ParticleBackground />
    <view class="page">
    <!-- 分数区：最长连胜 / 当前连胜（关卡不展示，内部仍用它定难度） -->
    <view class="card score-area">
      <view class="stat">
        <text class="label">{{ t('p24Best') }}</text>
        <text class="value">{{ best }}</text>
      </view>
      <view class="divider" />
      <view class="stat">
        <text class="label">{{ t('p24Streak') }}</text>
        <text class="value">{{ streak }}</text>
      </view>
    </view>

    <!-- 操作区：评分 / 新游戏 / 查看答案 三等分，各自居中，中间两条分隔线（与 web 一致） -->
    <view class="card opt-area">
      <view class="opt-half">
        <text class="score-label">{{ t('p24Difficulty') }} · <text class="score-num">{{ score }}</text></text>
      </view>
      <view class="divider" />
      <view class="opt-half">
        <button class="btn" @click="onNewGame">{{ t('start') }}</button>
      </view>
      <view class="divider" />
      <view class="opt-half">
        <button class="btn orange" :disabled="phase !== PLAY" @click="revealAnswer">{{ t('p24Reveal') }}</button>
      </view>
    </view>

    <view class="game-area">
      <!-- 算式区：token 流 + 右下角的退格 -->
    <view class="card expr-card">
      <view class="expr">
        <template v-if="shownTokens.length">
          <text v-for="(tok, i) in shownTokens" :key="i" class="tok" :class="'tok-' + tok.t">{{ tokText(tok) }}</text>
        </template>
        <text v-else class="expr-tip">{{ t('p24ExprTip') }}</text>
      </view>
      <button class="undo" :disabled="phase !== PLAY || !tokens.length" @click="undo">{{ t('p24Undo') }}</button>
      <text v-if="noteText" class="note" :class="{ bad: wrongResult }">{{ noteText }}</text>
    </view>

    <!-- 数字区（4 张，卡片内居中） -->
    <view class="card nums-card">
      <view
        v-for="(n, i) in nums"
        :key="'n' + i"
        class="num"
        :class="{ used: usedIdx.includes(i), disabled: !canAppend({ t: 'num', i, v: n }) }"
        @click="add({ t: 'num', i, v: n })"
      >{{ n }}</view>
    </view>

    <!-- 符号区（6 个，卡片内等分） -->
    <view class="card ops-card">
      <view
        v-for="o in OPS"
        :key="o"
        class="op"
        :class="{ disabled: !canAppend(tokOf(o)) }"
        @click="add(tokOf(o))"
      >{{ o }}</view>
    </view>

      <!-- 胜利浮层：盖在游戏区（算式 / 数字 / 符号）上，与 web 一致 -->
      <view v-if="phase === WON" class="result">
      <text class="result-title">{{ t('p24Win') }}</text>
      <text class="result-sub">{{ t('p24Streak') }} {{ streak }}</text>
        <button class="btn" @click="nextLevel">{{ t('p24NextLevel') }}</button>
      </view>
    </view>
    </view>
    <!-- 胜利彩带（纯 CSS 降级版，web 是 confetti canvas） -->
    <Confetti v-if="justWon" />
    <FloatingActions>
      <view class="fab" @click="showHelp"><view class="fab-ico i-carbon-help" /></view>
    </FloatingActions>
    <HelpSheet :open="helpOpen" :text="t('helpP24')" @close="helpOpen = false" />
  </view>
</template>

<script setup>
// 24 点 · 微信小程序版
// 纯逻辑 board.js 从 web 原样复制（精确分数求解，不 import 任何东西）；
// 这里只重写视图 + 把 localStorage / confetti 换成小程序侧适配。
import { computed, onMounted, ref } from 'vue';

import FloatingActions from '@/components/FloatingActions.vue';
import HelpSheet from '@/components/HelpSheet.vue';

import { getRaw, setRaw } from '@/core/storage';
import { t } from '@/core/i18n';
import { playLose, playWin } from '@/core/sfx';
import Confetti from '@/components/Confetti.vue';
import {
  appendable, evalTokens, isComplete, usedIndexes, newPuzzle, parseExprText, solveAll, scorePuzzle,
  NUM_COUNT,
} from './board.js';

import { setNavTitle } from '@/core/i18n';
import ParticleBackground from '@/components/ParticleBackground.vue';

// 原生导航栏标题跟随语言（pages.json 里的标题是静态的）
setNavTitle(() => t('p24Title'));
const PLAY = 'play';
const WON = 'won';
const GAVEUP = 'gaveup';

const OPS = ['+', '−', '×', '÷', '(', ')'];
// 界面显示 U+2212 的 −，内部一律 ASCII 的 -
const tokOf = (o) => (o === '(' || o === ')' ? { t: o === '(' ? 'lp' : 'rp' } : { t: 'op', op: o === '−' ? '-' : o });
const tokText = (x) => (x.t === 'num' ? x.v : x.t === 'lp' ? '(' : x.t === 'rp' ? ')' : x.op === '-' ? '−' : x.op);

const KEYS = {
  state: '__point24__state',
  streak: '__point24__streak',
  best: '__point24__best_streak',
};
const readInt = (key, dflt = 0) => {
  const v = Number(getRaw(key));
  return Number.isFinite(v) && v >= 0 ? v : dflt;
};
const write = (key, value) => setRaw(key, String(value));

const level = ref(1);
const nums = ref([]);
const tokens = ref([]);
const phase = ref(PLAY);
// 彩带只在真正赢下的那一刻放：恢复存档的胜利态不放（与 web 一致）
const justWon = ref(false);
let wonTimer = 0;
const streak = ref(readInt(KEYS.streak, 0));
const best = ref(readInt(KEYS.best, 0));
const RECENT_MAX = 10;
const recent = ref([]);
const score = ref(1);
const answer = ref('');
const revealed = ref('');
const note = ref('');

// ---------- 存档 ----------
const save = () => {
  setRaw(KEYS.state, JSON.stringify({
    level: level.value, nums: nums.value, tokens: tokens.value, phase: phase.value,
    revealed: revealed.value, note: note.value, recent: recent.value,
  }));
};

function restoreState() {
  let s = null;
  try { s = JSON.parse(getRaw(KEYS.state) || 'null'); } catch { return false; }
  if (!s || !Array.isArray(s.nums) || s.nums.length !== NUM_COUNT) return false;
  if (!s.nums.every(n => Number.isInteger(n) && n >= 1 && n <= 9)) return false;
  // 存档里的牌必须仍然有解，否则丢掉重发（不能把死题摆给玩家）
  const sols = solveAll(s.nums);
  if (!sols.length) return false;
  answer.value = sols[0].expr;
  score.value = scorePuzzle(s.nums, sols);
  recent.value = (Array.isArray(s.recent) ? s.recent : [])
    .filter(a => Array.isArray(a) && a.length === NUM_COUNT && a.every(n => Number.isInteger(n) && n >= 1 && n <= 9))
    .slice(-RECENT_MAX);
  level.value = Math.max(1, Math.floor(s.level) || 1);
  nums.value = s.nums.slice();
  tokens.value = Array.isArray(s.tokens) ? s.tokens : [];
  phase.value = s.phase === WON ? WON : s.phase === GAVEUP ? GAVEUP : PLAY;
  revealed.value = typeof s.revealed === 'string' ? s.revealed : '';
  note.value = typeof s.note === 'string' ? s.note : '';
  return true;
}

// ---------- 发牌 ----------
function deal(levelNo) {
  const p = newPuzzle(levelNo, Math.random, recent.value);
  recent.value = [...recent.value, p.nums].slice(-RECENT_MAX);
  nums.value = p.nums;
  answer.value = p.answer;
  score.value = p.score;
  tokens.value = [];
  revealed.value = '';
  note.value = '';
  phase.value = PLAY;
  save();
}

// ---------- 交互 ----------
const usedIdx = computed(() => usedIndexes(tokens.value));
const usedAll = computed(() => usedIdx.value.length === NUM_COUNT);
const complete = computed(() => isComplete(tokens.value));
const current = computed(() => (complete.value ? evalTokens(tokens.value) : null));
const answerTokens = computed(() => (phase.value === GAVEUP ? parseExprText(revealed.value) || [] : []));
const shownTokens = computed(() => (phase.value === GAVEUP ? answerTokens.value : tokens.value));
const wrongResult = computed(() => phase.value === PLAY && usedAll.value && complete.value && !current.value?.is24);
const canAppend = (tok) => phase.value === PLAY && appendable(tokens.value, tok);

function add(tok) {
  if (phase.value !== PLAY || !appendable(tokens.value, tok)) return;
  tokens.value = [...tokens.value, tok];
  const done = isComplete(tokens.value) && usedIndexes(tokens.value).length === NUM_COUNT;
  if (!done) { note.value = ''; save(); return; }
  const r = evalTokens(tokens.value);
  if (r.ok && r.is24) return win();
  note.value = `${t('p24NotTarget')} · = ${r.ok ? r.value : '?'}`;
  save();
}

function undo() {
  if (phase.value !== PLAY || !tokens.value.length) return;
  tokens.value = tokens.value.slice(0, -1);
  note.value = wrongResult.value ? `${t('p24NotTarget')} · = ${current.value?.value}` : '';
  save();
}

function win() {
  phase.value = WON;
  justWon.value = true;
  clearTimeout(wonTimer);
  wonTimer = setTimeout(() => { justWon.value = false; }, 4000);
  streak.value += 1;
  if (streak.value > best.value) { best.value = streak.value; write(KEYS.best, best.value); }
  write(KEYS.streak, streak.value);
  note.value = '';
  save();
  playWin();
}

function revealAnswer() {
  if (phase.value !== PLAY) return;
  phase.value = GAVEUP;
  playLose();                       // 查看答案 = 放弃这一局
  streak.value = 0;                 // 当前连胜清零（最长连胜保留）
  recent.value = [];
  write(KEYS.streak, 0);
  revealed.value = answer.value;
  note.value = '';
  save();
}

// 「新游戏」：当前连胜 > 0 时先确认（uni.showModal 代替 web 的 ConfirmDialog）
function onNewGame() {
  if (streak.value <= 0) { startNewGame(); return; }
  uni.showModal({
    title: t('newGame'),
    content: t('p24NewGameConfirm'),
    confirmText: t('p24ConfirmOk'),
    cancelText: t('p24Cancel'),
    success: (res) => { if (res.confirm) startNewGame(); },
  });
}

function startNewGame() {
  streak.value = 0;
  recent.value = [];
  write(KEYS.streak, 0);
  level.value = 1;
  deal(1);
}

const nextLevel = () => { level.value += 1; deal(level.value); };

const noteText = computed(() => (phase.value === GAVEUP ? t('p24GaveUpNote') : note.value || ''));

const restored = restoreState();
onMounted(() => { if (!restored) deal(level.value); });

const helpOpen = ref(false);

function showHelp() {
  helpOpen.value = true;
}
</script>

<style lang="scss" scoped>
/* 外层普通 block：header 在这一层，不受 .page 的 flex/align-items 影响，永远贴右边 */
.screen {
  min-height: 100vh;
  background: transparent;  /* 背景交给 ParticleBackground（canvas 自己铺底色） */
}
.page {
  padding: 36rpx 24rpx 48rpx;
  display: flex;
  flex-direction: column;
  gap: 36rpx;
  background: #f0f2f5;
}
.card {
  background: #fff;
}
.score-area {
  display: flex;
  align-items: center;
  padding: 0 23rpx;
}
.stat { flex: 1; display: flex; flex-direction: column; align-items: center; }
.stat > .label { font-size: 22rpx; color: #8a8f99; }
.stat > .value { font-size: 38rpx; font-weight: 800; color: #23804e; margin-top: 4rpx; }
.divider { width: 2rpx; height: 48rpx; background: #e6e8eb; }
@keyframes result-in {
  0% { opacity: 0; transform: scale(0.94); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes tok-in {
  0% { opacity: 0; transform: translateY(8rpx) scale(0.8); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
/* 游戏区：包住 算式 / 数字 / 符号 三块；gap 提供卡片间距，同时是胜利遮罩的定位上下文 */
.game-area {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 36rpx;                 /* web 的 --row-gap: 16px */
  border-radius: 27rpx;
  overflow: hidden;
}

/* 操作区：三等分 + 分隔线（web 是 3 / 3.5 / 3.5，这里按用户要求等分） */
.opt-area {
  display: flex;
  align-items: center;
  padding: 0 23rpx;
}
.opt-half {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.opt-area > .divider {
  width: 2rpx;
  height: 46rpx;
  background: #e1e1e1;
}
.score-label { font-size: 23rpx; color: #5f6b7a; }
.score-num { font-size: 33rpx; font-weight: 800; color: #222; }
.btn {
  margin: 0;
  padding: 0 20rpx;
  height: 72rpx;
  line-height: 72rpx;
  border-radius: 15rpx;
  background: #23804e;
  color: #fff;
  font-size: 24rpx;
  font-weight: 700;
}
.btn.orange { background: #c2410c; }
.btn[disabled] { background: #aaa; color: #fff; }

/* 算式卡片：token 水平居中；退格贴右侧、垂直居中（不用 transform，避免点击时闪一下） */
.expr-card {
  position: relative;
  height: 200rpx;
  padding: 15rpx 23rpx 38rpx;
}
.expr {
  height: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  overflow: hidden;
  padding: 0 65rpx;
}
.expr-tip { font-size: 25rpx; color: #5f6b7a; }
.tok {
  animation: tok-in 0.16s ease-out both;
  font-size: 35rpx;
  font-weight: 700;
  line-height: 1;
  padding: 10rpx 15rpx;
  border-radius: 15rpx;
  background: #e5f6ec;
}
.tok-num { color: #222; }
.tok-op, .tok-lp, .tok-rp { background: transparent; color: #5f6b7a; padding: 10rpx 4rpx; }
.undo {
  position: absolute;
  right: 15rpx;
  top: calc(50% - 29rpx);
  margin: 0;
  width: 58rpx;
  height: 58rpx;
  padding: 0;
  line-height: 58rpx;
  font-size: 29rpx;
  border-radius: 15rpx;
  background: #e5f6ec;
  color: #222;
}
.undo[disabled] { opacity: 0.45; }
.note {
  position: absolute;
  left: 23rpx;
  right: 23rpx;
  bottom: 8rpx;
  font-size: 23rpx;
  line-height: 1.2;
  text-align: center;
  color: #5f6b7a;
}
.note.bad { color: #d33; font-weight: bold; }

/* 数字 / 符号卡片（web 的 .nums-card / .ops-card） */
.nums-card, .ops-card {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 15rpx;
  padding: 15rpx 23rpx;
}
.num {
  flex: 0 0 auto;
  width: 108rpx;
  height: 108rpx;
  line-height: 108rpx;
  text-align: center;
  font-size: 50rpx;
  font-weight: 700;
  color: #fff;
  background: #23804e;
  border-radius: 15rpx;
}
.num.used { background: #aaa; opacity: 0.6; }
.num.disabled { opacity: 0.6; }
.op {
  flex: 1;
  min-width: 0;
  height: 85rpx;
  line-height: 85rpx;
  text-align: center;
  font-size: 38rpx;
  font-weight: 700;
  color: #222;
  background: #e5f6ec;
  border-radius: 15rpx;
}
.op.disabled { color: #5f6b7a; opacity: 0.45; }

.result {
  animation: result-in 0.22s ease-out both;
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 36rpx;
  background: rgba(250, 248, 239, 0.92);
}
.result-title { font-size: 44rpx; font-weight: 800; color: #222; }
.result-sub { font-size: 26rpx; color: #776e65; }
</style>
