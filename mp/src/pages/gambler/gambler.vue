<template>
  <view class="screen">
    <!-- 全站背景（粒子连线 + 底部过山车，与 web 的 ParticleBackground 同款） -->
    <ParticleBackground />
    <view class="page">
    <!-- 分数区：一张卡片装四格（与 web 的 score-area 一致） -->
    <view class="card score-area">
      <view class="bar">
        <view class="stat"><text class="label">🏆 {{ t('gBest') }}</text><text class="value">{{ bestLevel }}</text></view>
        <view class="divider" />
        <view class="stat"><text class="label">🏁 {{ t('gLevel') }}</text><text class="value">{{ level }}</text></view>
        <view class="divider" />
        <view class="stat"><text class="label">🔥 {{ t('gStreak') }}</text><text class="value">{{ streak }}</text></view>
        <view class="divider" />
        <view class="stat"><text class="label">❤️ {{ t('gLives') }}</text><text class="value">{{ '❤️'.repeat(hearts) + '🤍'.repeat(2 - hearts) }}</text></view>
      </view>
    </view>

    <!-- 操作区：新游戏 / 查看答案 两等分 + 分隔线（与 web 的 opt-area 一致，位置在分数区下面） -->
    <view class="card opt-area">
      <view class="opt-half">
        <button class="btn" @click="startNewRun">{{ t('start') }}</button>
      </view>
      <view class="divider" />
      <view class="opt-half">
        <button class="btn orange" :disabled="phase !== 'play'" @click="revealAnswer">{{ t('gReveal') }}</button>
      </view>
    </view>

    <view class="game-area">
    <!-- 手牌 13 张 -->
    <view class="card hand-card">
      <view class="hand">
        <view
            v-for="(k, i) in hand"
            :key="roundSeq + '-h' + i"
            class="hand-tile"
            :style="{ animationDelay: i * 26 + 'ms' }"
          >
          <MahjongTile :suit="k[0]" :value="+k.slice(1)" />
        </view>
      </view>
      <!-- 与 web 一致：手牌下面两行提示，居中 -->
      <view class="tips">
        <text class="tip-main">{{ t('gHandTip') }}</text>
        <text class="tip-sub">{{ t('gPickTip') }}</text>
      </view>
    </view>

    <!-- 答案区 -->
    <view class="card answer">
      <text class="tip">{{ t(mode === 2 ? 'gAnswerTipSubmit' : 'gAnswerTip') }}</text>
      <view id="answer-row" class="answer-row">
        <view v-for="k in picked" :key="'a' + k" class="answer-tile" :class="{ wrong: wrongKeys.includes(k) }" @click="unpick(k)">
          <MahjongTile :suit="k[0]" :value="+k.slice(1)" />
          <view v-if="wrongKeys.includes(k)" class="stamp"><text class="stamp-mark">✗</text><text class="stamp-text">{{ t('gWrong') }}</text></view>
        </view>
      </view>
      <button v-if="mode === 2" class="btn submit" :disabled="!canSubmit" @click="submitPicks">{{ t('gSubmit') }}</button>
    </view>

    <!-- 选择区 27 张（三门各 9 张）；失败遮罩盖在这里（答案区仍看得见，方便复盘） -->
    <view class="card pick-card">
    <view v-for="row in pickRows" :key="'r' + row[0]" class="pick-row">
      <view
        v-for="k in row"
        :key="'p' + k"
        :id="'pick-' + k"
        class="pick-tile"
        :class="{ used: picked.includes(k), wrong: wrongKeys.includes(k), muted: blocked.includes(k) }"
        @click="pick(k)"
      >
        <MahjongTile :suit="k[0]" :value="+k.slice(1)" />
        <view v-if="wrongKeys.includes(k)" class="stamp"><text class="stamp-mark">✗</text><text class="stamp-text">{{ t('gWrong') }}</text></view>
      </view>
    </view>

      <!-- 失败遮罩：只在选择区这一块上（与 web 的 .pick-mask 一致） -->
      <view v-if="phase === 'lost'" class="pick-mask">
        <text class="mask-text">{{ t('gLose') }} · {{ t('gRevealNote') }}</text>
        <view class="result-btns">
          <button class="btn ghost" @click="replayLevel">{{ t('gReplay') }}</button>
          <button class="btn" @click="startNewRun">{{ t('start') }}</button>
        </view>
      </view>
    </view>

    <!-- 胜利浮层：盖在手牌 + 答案区 + 选择区上（与 web 的 .result win 一致） -->
    <view v-if="phase === 'won'" class="result">
      <text class="result-title">{{ t('gWin') }}</text>
      <text class="result-sub">{{ t('gStreak') }} {{ streak }}</text>
      <view class="result-btns">
        <button class="btn ghost" @click="replayLevel">{{ t('gReplay') }}</button>
        <button class="btn" @click="nextLevel">{{ t('gNext') }}</button>
      </view>
    </view>
    </view>

    </view>
    <!-- 飞牌替身：从小牌原位置飞到答案区（web 用 cloneNode + element.animate，这里用 fixed 元素 + transition） -->
    <view
      v-if="flyGhost"
      class="fly-ghost"
      :style="{
        left: flyGhost.left + 'px',
        top: flyGhost.top + 'px',
        width: flyGhost.w + 'px',
        height: flyGhost.h + 'px',
        opacity: 1,
        transform: 'scale(' + (flyGhost.scale || 1) + ')',
      }"
    >
      <MahjongTile :suit="flyGhost.key[0]" :value="+flyGhost.key.slice(1)" />
    </view>

    <!-- 胜利彩带（纯 CSS 降级版，web 是 confetti canvas） -->
    <Confetti v-if="justWon" />
    <FloatingActions>
      <view class="fab" @click="toggleMode"><view class="fab-ico" :class="mode === 1 ? 'i-mdi-lightning-bolt' : 'i-mdi-check-all'" /></view>
      <view class="fab" @click="showHelp"><view class="fab-ico i-carbon-help" /></view>
    </FloatingActions>
    <HelpSheet :open="helpOpen" :text="t('helpG')" @close="helpOpen = false" />
  </view>
</template>

<script setup>
// 赌神 · 微信小程序版
// 逻辑全部来自 web 的 board.js（原样复制：听牌生成 / 胡牌判定 / 答案集 / 关卡曲线）。
// v1 差异：飞牌动画改成直接出现在答案区（小程序没有 cloneNode + element.animate）；
//          「查看答案 / 失败」时只给玩家选错的牌盖「✗ 错误」章，真答案不打标签。
import { computed, getCurrentInstance, onMounted, ref } from 'vue';

import MahjongTile from '@/components/MahjongTile.vue';
import FloatingActions from '@/components/FloatingActions.vue';
import HelpSheet from '@/components/HelpSheet.vue';
import { getJSON, getRaw, setRaw } from '@/core/storage';
import { t } from '@/core/i18n';
import { playFail, playElimination, playLose, playWin } from '@/core/sfx';
import Confetti from '@/components/Confetti.vue';
import { handCounts, isBlocked, newRound, SELECT_KEYS, sortHand, winningPicks } from './board.js';
import { setNavTitle } from '@/core/i18n';
import ParticleBackground from '@/components/ParticleBackground.vue';

// 原生导航栏标题跟随语言（pages.json 里的标题是静态的）
setNavTitle(() => t('gName'));

const PREFIX = '__gambler__';
const suffix = (m) => (m === 2 ? '_2' : '');
const levelKeyFor = (m) => `${PREFIX}level${suffix(m)}`;
const bestKeyFor = (m) => `${PREFIX}best${suffix(m)}`;
const streakKeyFor = (m) => `${PREFIX}streak${suffix(m)}`;
const stateKeyFor = (m) => `${PREFIX}state${suffix(m)}`;

const storedMode = +(getRaw(`${PREFIX}mode`));
const mode = ref(storedMode === 2 ? 2 : 1);
const level = ref(1);
const bestLevel = ref(0);
const streak = ref(0);
const hearts = ref(2);
const hand = ref([]);
const picks = ref([]);        // 本题的答案集
const blocked = ref([]);
const picked = ref([]);       // 玩家已选（答案区）
const flyGhost = ref(null);
const roundSeq = ref(0);   // 每开一局/恢复一次自增，拼进手牌 key，发牌动画才会重播
const instance = getCurrentInstance();   // selectorQuery 需要组件实例
const wrongKeys = ref([]);    // 复盘时标错的
const phase = ref('play');
// 彩带只在真正赢下的那一刻放：恢复存档的胜利态不放（与 web 一致）
const justWon = ref(false);
let wonTimer = 0;
let shakeTimer = null;

const pickRows = computed(() => [SELECT_KEYS.slice(0, 9), SELECT_KEYS.slice(9, 18), SELECT_KEYS.slice(18, 27)]);
const canSubmit = computed(() => mode.value === 2 && phase.value === 'play' && picked.value.length > 0);

function save() {
  setRaw(stateKeyFor(mode.value), JSON.stringify({
    level: level.value, mode: mode.value, hand: hand.value, picked: picked.value, hearts: hearts.value,
    phase: phase.value, wrong: wrongKeys.value,
  }));
  setRaw(levelKeyFor(mode.value), String(level.value));
  setRaw(streakKeyFor(mode.value), String(streak.value));
}

function deal(lv) {
  roundSeq.value += 1;          // 手牌 key 换一批 → 发牌动画重播
  clearTimeout(shakeTimer);
  level.value = Math.max(1, lv);
  const r = newRound(level.value);
  hand.value = r.hand;
  picks.value = r.picks;
  blocked.value = r.blocked;
  picked.value = [];
  wrongKeys.value = [];
  hearts.value = 2;
  phase.value = 'play';
  if (level.value > bestLevel.value) { bestLevel.value = level.value; setRaw(bestKeyFor(mode.value), String(bestLevel.value)); }
  save();
}

// ---------- 选择区 → 答案区：飞牌动画（fixed 替身 + selectorQuery；量不到就直接落位）----------
let flying = false;
const queryRect = (sel) => new Promise((resolve) => {
  const q = uni.createSelectorQuery();
  q.select(sel).boundingClientRect((r) => resolve(r && r.width ? r : null)).exec();
});
async function flyThenCommit(key) {
  if (flying) return;
  const [from, to] = await Promise.all([queryRect(`#pick-${key}`), queryRect('#answer-row')]);
  if (!from || !to) { commitPick(key); return; }
  flying = true;
  // 目标：答案区里「这一张将要出现的位置」——步进 = 答案牌宽 52rpx + 间距 6rpx
  const rpx = (v) => v * ((uni.getSystemInfoSync().windowWidth) || 375) / 750;
  const slotW = rpx(52) + rpx(6);
  const index = Math.min(picked.value.length, 11);
  const targetLeft = to.left + 4 + index * slotW;
  const targetTop = to.top + Math.max(0, (to.height - rpx(66)) / 2);
  const scale = rpx(52) / (from.width || 1);   // 缩到答案牌那么大（web: b.width / a.width）
  flyGhost.value = { left: from.left, top: from.top, w: from.width, h: from.height, scale: 1, key };
  // 下一拍再改目标（同一拍改不会触发过渡）；只动 transform/left/top，**全程不透明**
  setTimeout(() => {
    flyGhost.value = { ...flyGhost.value, left: targetLeft, top: targetTop, scale };
  }, 30);
  // 过渡结束再真正放进答案区
  setTimeout(() => { flyGhost.value = null; flying = false; commitPick(key); }, 300);
}

function pick(key) {
  if (phase.value !== 'play' || picked.value.includes(key) || picked.value.length >= 12) return;
  if (flying) return;
  flyThenCommit(key);
}


function commitPick(key) {
  if (phase.value !== 'play' || picked.value.includes(key) || picked.value.length >= 12) return;
  if (mode.value === 2) {
    // 提交模式：选哪张都先放进答案区，不即时判对错
    picked.value = [...picked.value, key];
    save();
    return;
  }
  // 即时判断：选对 → 进答案区；选错 → 扣心 + 打「✗ 错误」章（常驻）
  if (picks.value.includes(key)) {
    picked.value = [...picked.value, key];
    playElimination();
    save();
if (picks.value.every(k => picked.value.includes(k))) {
        // 最后一张刚落到答案区，还要播完 answer-in（0.26s）→ 等它结束再出胜利提示
        setTimeout(winRound, 300);
      }
  } else {
    wrongKeys.value = [...wrongKeys.value, key];
    hearts.value -= 1;
    playFail();
    save();
    if (hearts.value <= 0) finishRound();
  }
}

function unpick(key) {
  if (mode.value !== 2 || phase.value !== 'play') return;
  picked.value = picked.value.filter(k => k !== key);
  save();
}

function submitPicks() {
  if (!canSubmit.value) return;
  const exact = picked.value.length === picks.value.length && picked.value.every(k => picks.value.includes(k));
  if (exact) { winRound(); return; }
  hearts.value = Math.max(0, hearts.value - 1);
  playFail();
  clearTimeout(shakeTimer);
  save();
  if (hearts.value <= 0) finishRound();
}

// 失败收尾：把没选出来的答案补进答案区（真答案不打标签），错牌留着盖「✗ 错误」
function finishRound() {
  clearTimeout(shakeTimer);
  const missing = picks.value.filter(k => !picked.value.includes(k));
  picked.value = [...picked.value, ...missing];
  wrongKeys.value = picked.value.filter(k => !picks.value.includes(k));
  phase.value = 'lost';
  playLose();
  save();
}

function revealAnswer() {
  if (phase.value !== 'play') return;
  hearts.value = 0;
  streak.value = 0;
  setRaw(streakKeyFor(mode.value), '0');
  finishRound();
}

function winRound() {
  phase.value = 'won';
  justWon.value = true;
  clearTimeout(wonTimer);
  wonTimer = setTimeout(() => { justWon.value = false; }, 4000);
  streak.value += 1;
  playWin();
  save();
}

function replayLevel() { deal(level.value); }
function nextLevel() { deal(level.value + 1); }
function startNewRun() { streak.value = 0; deal(1); }

function toggleMode() {
  mode.value = mode.value === 2 ? 1 : 2;
  setRaw(`${PREFIX}mode`, String(mode.value));
  bestLevel.value = +(getRaw(bestKeyFor(mode.value)) || 0);
  const restored = restoreState();
  deal(restored ? restored.level : +(getRaw(levelKeyFor(mode.value)) || 1));
}

function restoreState() {
  const s = getJSON(stateKeyFor(mode.value));
  if (!s || !Array.isArray(s.hand) || s.hand.length !== 13) return null;
  return s;
}

function restore() {
  roundSeq.value += 1;          // 恢复记录也重播一次发牌动画
  const s = restoreState();
  if (!s) return false;
  hand.value = sortHand(s.hand);
  level.value = s.level || 1;
  // ⚠️ 答案不能来自 newRound（那是另一副随机手牌），必须按存档手牌重算 ——
  // 否则「答案判断」会和玩家看到的牌完全无关（web 就是这么做的，且答案不写进存档）
  const { counts, jokers } = handCounts(hand.value);
  picks.value = winningPicks(counts, jokers);
  blocked.value = SELECT_KEYS.filter(k => isBlocked(k, counts));
  picked.value = Array.isArray(s.picked) ? s.picked : [];
  wrongKeys.value = Array.isArray(s.wrong) ? s.wrong : [];
  hearts.value = Number.isFinite(s.hearts) ? s.hearts : 2;
  if (!picks.value.length) return false;       // 坏存档 / 死局 → 重开一关
  phase.value = s.phase === 'won' ? 'won' : s.phase === 'lost' ? 'lost' : 'play';
  return true;
}

onMounted(() => {
  bestLevel.value = +(getRaw(bestKeyFor(mode.value)) || 0);
  streak.value = +(getRaw(streakKeyFor(mode.value)) || 0);
  if (!restore()) deal(+(getRaw(levelKeyFor(mode.value)) || 1));
});

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
@keyframes stamp-in {
  0% { opacity: 0; transform: scale(2.1) rotate(-12deg); }
  60% { opacity: 1; }
  100% { opacity: 1; transform: scale(1) rotate(-12deg); }
}
@keyframes stamp-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-3rpx); }
  40% { transform: translateX(3rpx); }
  60% { transform: translateX(-2rpx); }
  80% { transform: translateX(2rpx); }
}
.page {
  padding: 36rpx 24rpx 48rpx; display: flex; flex-direction: column; gap: 36rpx; background: #f0f2f5; }
.score-area { display: flex; align-items: center; padding: 0 23rpx; }
.bar { display: flex; align-items: center; flex: 1; }
/* 每格等宽（与 24 点一致；上次清理时把这条整条删了，导致四格按内容宽挤在一起） */
.stat { flex: 1; display: flex; flex-direction: column; align-items: center; }
.stat > .label { font-size: 22rpx; color: #8a8f99; }
.stat > .value { font-size: 38rpx; font-weight: 800; color: #23804e; margin-top: 4rpx; line-height: 1.1; }
.bar > .divider { width: 2rpx; height: 48rpx; background: #e6e8eb; }



.opt-area { display: flex; align-items: center; padding: 0 19rpx; }
.opt-half { flex: 1; display: flex; align-items: center; justify-content: center; }
.opt-area > .divider { width: 2rpx; height: 46rpx; background: #e1e1e1; }
.hand-card { padding: 12rpx 8rpx 16rpx; }
.tips { display: flex; flex-direction: column; align-items: center; gap: 4rpx; margin-top: 10rpx; text-align: center; }
.tip-main { font-size: 24rpx; font-weight: 700; color: #333; line-height: 1.3; }
.tip-sub { font-size: 22rpx; color: #8a8f99; line-height: 1.3; }
.hand { display: flex; gap: 3rpx; justify-content: center; }
.hand-tile { width: 47rpx; height: 60rpx; border-radius: 6rpx; overflow: hidden; background: #f7f4ee; animation: deal-in 0.34s cubic-bezier(0.2, 0.8, 0.3, 1) both; }
/* 发牌：从上方落下 + 轻微放大回弹（逐张延迟由 :style 的 animationDelay 控制） */
@keyframes deal-in {
  0% { opacity: 0; transform: translateY(-26rpx) scale(0.86); }
  60% { opacity: 1; }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
/* 飞牌替身：与 web 的飞行牌视觉一致（fixed + 过渡） */
.fly-ghost {
  position: fixed;
  z-index: 45;
  pointer-events: none;
  border-radius: 6rpx;
  overflow: hidden;
  box-shadow: 0 10rpx 24rpx rgba(0, 0, 0, 0.22);
  transition: left 0.26s ease, top 0.26s ease, opacity 0.26s ease, transform 0.26s ease;
}
.game-area { position: relative; display: flex; flex-direction: column; gap: 36rpx; border-radius: 27rpx; overflow: hidden; }
.pick-card { position: relative; display: flex; flex-direction: column; gap: 6rpx; padding: 8rpx 6rpx; }
.pick-mask { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14rpx; border-radius: 18rpx; background: rgba(250,248,239,0.92); }
.mask-text { font-size: 22rpx; color: #776e65; text-align: center; padding: 0 24rpx; }
.answer { position: relative; padding: 10rpx 12rpx 12rpx; }
.tip { display: block; width: 100%; text-align: center; font-size: 22rpx; line-height: 1.35; color: #8a8f99; padding: 2rpx 0 6rpx; }
.answer-row { display: flex; flex-wrap: wrap; gap: 6rpx; min-height: 66rpx; margin-top: 6rpx; padding-right: 110rpx; }
.answer-tile {
  position: relative;
  width: 52rpx; height: 66rpx;
  border-radius: 6rpx; overflow: hidden; background: #f7f4ee;
  /* 进入答案区：从下方飞入 + 放大回弹（真·飞行看上面的 ghost，拿不到位置时靠这个兜底） */
  animation: answer-in 0.26s cubic-bezier(0.2, 0.8, 0.3, 1) both;
}
@keyframes answer-in {
  0% { opacity: 0; transform: translateY(26rpx) scale(0.72); }
  60% { opacity: 1; }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.answer-tile.wrong { animation: stamp-shake 0.5s ease 0.3s; }
.submit { position: absolute; right: 12rpx; top: 30rpx; margin: 0; width: 96rpx; height: 60rpx; line-height: 60rpx; border-radius: 12rpx; font-size: 22rpx; background: #23804e; color: #fff; }
.submit[disabled] { background: #aaa; }
.pick-row { display: flex; gap: 3rpx; justify-content: center; }
.pick-tile { position: relative; width: 66rpx; height: 84rpx; border-radius: 8rpx; overflow: hidden; background: #f7f4ee; }
.pick-tile.used { opacity: 0.35; }
.pick-tile.muted { filter: grayscale(0.5); }
.pick-tile.wrong { outline: 2rpx solid #d33; outline-offset: -2rpx; }
.stamp {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.55);
  animation: stamp-in 0.42s cubic-bezier(0.22, 1.5, 0.44, 1) both;
}
.stamp-mark { font-size: 30rpx; color: #d33; font-weight: 900; line-height: 1; }
.stamp-text { font-size: 14rpx; color: #d33; font-weight: 800; }

.btn { margin: 0; padding: 0 26rpx; height: 68rpx; line-height: 68rpx; border-radius: 14rpx; background: #23804e; color: #fff; font-size: 22rpx; font-weight: 700; }
.btn.ghost { background: #e8ecef; color: #333; }
.btn.orange { background: #c2410c; }
.btn.orange[disabled] { background: #aaa; }
.result { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 36rpx; background: rgba(250,248,239,0.94); }
.result-title { font-size: 40rpx; font-weight: 800; color: #222; }
.result-sub { font-size: 24rpx; color: #776e65; }
</style>
