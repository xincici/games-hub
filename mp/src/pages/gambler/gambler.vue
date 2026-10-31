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
        <button class="btn" @click="confirming = true">{{ t('start') }}</button>
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
        <view
          v-for="k in picked"
          :key="'a' + k"
          :id="'answer-' + k"
          class="answer-tile"
          :class="{ wrong: wrongKeys.includes(k), landing: landingKeys.includes(k) }"
          @click="unpick(k)"
        >
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
    <!-- 飞牌替身：可同时多张（提交模式允许多张一起飞）。只动 transform，不动 left/top -->
    <view
      v-for="g in flyGhosts"
      :key="'fly' + g.id"
      :id="'fly-' + g.id"
      class="fly-ghost"
      :style="{
        opacity: g.show ? 1 : 0,
        left: g.left + 'px',
        top: g.top + 'px',
        width: g.w + 'px',
        height: g.h + 'px',
        transform: 'translate(' + g.dx + 'px,' + g.dy + 'px) scale(' + g.scale + ')',
      }"
    >
      <MahjongTile :suit="g.key[0]" :value="+g.key.slice(1)" />
    </view>

    <!-- 胜利彩带（纯 CSS 降级版，web 是 confetti canvas） -->
    <Confetti v-if="justWon" />
    <FloatingActions>
      <view class="fab" @click="toggleMode"><view class="fab-ico" :class="mode === 1 ? 'i-mdi-lightning-bolt' : 'i-mdi-check-all'" /></view>
      <view class="fab" @click="showHelp"><view class="fab-ico i-carbon-help" /></view>
    </FloatingActions>
    <!-- 新游戏二次确认：自绘三按钮弹窗（web 的 shared/ConfirmDialog 同款） -->
    <view v-if="confirming" class="confirm-mask" @click="confirming = false">
      <view class="card confirm-box" @click.stop>
        <text class="confirm-title">{{ t('confirmTitle') }}</text>
        <text class="confirm-msg">{{ t('confirmMsg') }}</text>
        <view class="confirm-actions">
          <button class="confirm-cancel" @click="confirming = false">{{ t('cancel') }}</button>
          <button class="confirm-replay" @click="replayLevel">{{ t('confirmReplay') }}</button>
          <button class="confirm-ok" @click="startNewGame">{{ t('confirmOk') }}</button>
        </view>
      </view>
    </view>
    <HelpSheet :open="helpOpen" :text="t('helpG')" @close="helpOpen = false" />
  </view>
</template>

<script setup>
// 赌神 · 微信小程序版
// 逻辑全部来自 web 的 board.js（原样复制：听牌生成 / 胡牌判定 / 答案集 / 关卡曲线）。
// v1 差异：飞牌动画改成直接出现在答案区（小程序没有 cloneNode + element.animate）；
//          「查看答案 / 失败」时只给玩家选错的牌盖「✗ 错误」章，真答案不打标签。
import { computed, getCurrentInstance, nextTick, onMounted, ref } from 'vue';

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
const roundSeq = ref(0);   // 每开一局/恢复一次自增，拼进手牌 key，发牌动画才会重播
const instance = getCurrentInstance();   // selectorQuery 需要组件实例
const wrongKeys = ref([]);    // 复盘时标错的
const phase = ref('play');
// 彩带只在真正赢下的那一刻放：恢复存档的胜利态不放（与 web 一致）
const justWon = ref(false);
let wonTimer = 0;
let shakeTimer = null;
let preparedNext = null;   // 胜利后预生成的下一关，点「下一关」立即落位
let prepareSeq = 0;        // 预生成 / 新开局的竞态令牌

const pickRows = computed(() => [SELECT_KEYS.slice(0, 9), SELECT_KEYS.slice(9, 18), SELECT_KEYS.slice(18, 27)]);
const canSubmit = computed(() => mode.value === 2 && phase.value === 'play' && picked.value.length > 0);

function save() {
  setRaw(stateKeyFor(mode.value), JSON.stringify({
    level: level.value, mode: mode.value, hand: hand.value, picked: picked.value, hearts: hearts.value,
    phase: phase.value, wrong: wrongKeys.value,
  }));
  setRaw(levelKeyFor(mode.value), String(level.value));
  setRaw(bestKeyFor(mode.value), String(bestLevel.value));
  setRaw(streakKeyFor(mode.value), String(streak.value));
}

function applyRound(round, lv) {
  prepareSeq += 1;
  preparedNext = null;
  roundSeq.value += 1;          // 手牌 key 换一批 → 发牌动画重播
  clearTimeout(shakeTimer);
  clearTimeout(wonTimer);
  justWon.value = false;
  level.value = Math.max(1, lv);
  hand.value = round.hand;
  picks.value = round.picks;
  blocked.value = round.blocked;
  picked.value = [];
  wrongKeys.value = [];
  hearts.value = 2;
  phase.value = 'play';
  if (level.value > bestLevel.value) { bestLevel.value = level.value; setRaw(bestKeyFor(mode.value), String(bestLevel.value)); }
  save();
}

function deal(lv) {
  prepareSeq += 1;              // 作废已经排队的预生成，避免旧关卡盖到新局上
  preparedNext = null;
  applyRound(newRound(lv), lv);
}

// 胜利浮层出现后，在空闲时间把下一关算好（newRound 在手机上要 100~300ms）。
// 玩家点「下一关」时直接落位，不再等同步生成；没算完时 nextLevel 自己兜底并加锁。
function scheduleNextRound() {
  const lv = level.value + 1;
  if (preparedNext && preparedNext.level === lv) return;
  const seq = ++prepareSeq;
  setTimeout(() => {
    if (seq !== prepareSeq || phase.value !== 'won') return;
    const round = newRound(lv);
    if (seq !== prepareSeq || phase.value !== 'won') return;
    preparedNext = { level: lv, round };
  }, 30);
}

// ---------- 选择区 → 答案区：飞牌动画（照 web 的 flyToAnswer）----------
// web 的做法：先把这张牌写进答案区（目标槽位渲染出来但先隐身）→ 量**真实**目标矩形 →
// 克隆一张从原位飞过去（transform + cubic-bezier）→ 落地那一刻替身消失、槽位现身。
// 小程序没有 cloneNode / element.animate，用 fixed 替身 + transition 复刻同一套时序。
const flyGhosts = ref([]);      // 飞行中的替身（提交模式允许多张并发）
const landingKeys = ref([]);    // 目标槽位还没落地的 key（渲染时先隐身）
const flyingCount = ref(0);
let ghostSeq = 0;
const FLY_MS = 420;             // 与 web 的 FLY_MS 一致
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
const nextFrame = () => new Promise((r) => setTimeout(r, 16));
const queryRect = (sel) => new Promise((resolve) => {
  const q = uni.createSelectorQuery();
  q.select(sel).boundingClientRect((r) => resolve(r && r.width ? r : null)).exec();
});

async function flyToAnswer(key) {
  flyingCount.value += 1;          // 从查询开始就锁住模式切换，别让旧模式的异步收尾写到新模式
  const from = await queryRect(`#pick-${key}`);
  // ① 先落档：答案区立刻渲染这张牌（槽位隐身），这样下面能量到它**真实**的位置
  if (!picked.value.includes(key)) picked.value = [...picked.value, key];
  if (!landingKeys.value.includes(key)) landingKeys.value = [...landingKeys.value, key];
  await nextTick();
  const to = await queryRect(`#answer-${key}`);
  if (!from || !to) {
    // 量不到（首帧未布局 / 极端窄屏）：直接现身，绝不把牌卡在隐身态
    landingKeys.value = landingKeys.value.filter((k) => k !== key);
    flyingCount.value = Math.max(0, flyingCount.value - 1);
    return;
  }
  const id = ++ghostSeq;
  flyGhosts.value = [...flyGhosts.value, {
    id, key,
    left: from.left, top: from.top, w: from.width, h: from.height,
      dx: 0, dy: 0, scale: 1, show: false,   // 先隐藏：位置校正完再显形，玩家看不到「跳一下」
  }];
  await nextFrame();
  // ② 用替身自己的实测矩形校正起点：fixed 的包含块在嵌套/平台差异下可能不是视口，
  //    不校正就会「替身从答案区那一带冒出来」（实测偏过 44px）
  let list = flyGhosts.value;
  const g0 = await queryRect(`#fly-${id}`);
  if (g0) {
    const fixX = from.left - g0.left;
    const fixY = from.top - g0.top;
    if (Math.abs(fixX) > 0.5 || Math.abs(fixY) > 0.5) {
      list = list.map((g) => (g.id === id ? { ...g, left: g.left + fixX, top: g.top + fixY } : g));
      flyGhosts.value = list;
      await nextFrame();
    }
  }
    // ③ 先显形在起点（位置已校准），隔一帧再起飞 ——
    //    否则牌会「在半空中冒出来」，看着像凭空出现而不是从手上飞走
    flyGhosts.value = list.map((g) => (g.id === id ? { ...g, show: true } : g));
    await nextFrame();
    list = flyGhosts.value;
    // ④ 只改 transform：位移 + 缩放到目标槽位（web: translate(dx, dy) scale(b.w / a.w)）
    const dx = to.left - from.left;
    const dy = to.top - from.top;
    const scale = from.width ? to.width / from.width : 1;
    flyGhosts.value = list.map((g) => (g.id === id ? { ...g, dx, dy, scale } : g));
    setTimeout(() => {
      flyGhosts.value = flyGhosts.value.filter((g) => g.id !== id);
      landingKeys.value = landingKeys.value.filter((k) => k !== key);
      flyingCount.value = Math.max(0, flyingCount.value - 1);
    }, FLY_MS + 20);
  }
      
      function pick(key) {
      if (phase.value !== 'play' || picked.value.includes(key) || picked.value.length >= 12) return;
      // 牌组里已经有 4 张的牌不能再选（blocked 由当前手牌实时算出）；答错标红的牌也不可再点
      if (blocked.value.includes(key) || wrongKeys.value.includes(key)) return;
      // 即时判断模式保持「一次一张」（与 web 同）；提交模式允许边飞边点
      if (mode.value !== 2 && flyingCount.value > 0) return;
      if (mode.value === 2) {
      // 提交模式：选哪张都先飞进答案区，不即时判对错
      flyToAnswer(key);
      save();
      return;
      }
      if (picks.value.includes(key)) {
      // 选对：先飞，等它落位再判「是否选齐」（最后一张落位后才出胜利层）
      const willComplete = picks.value.every((k) => picked.value.includes(k) || k === key);
      flyToAnswer(key);
      save();
      if (willComplete) setTimeout(winRound, FLY_MS + 60);
      return;
      }
      // 点错：标红 + 扣心（不飞）
      wrongKeys.value = [...wrongKeys.value, key];
      hearts.value -= 1;
      playFail();
      save();
      if (hearts.value <= 0) finishRound();
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
      async function finishRound() {
      clearTimeout(shakeTimer);
      if (phase.value !== 'play') return;
      const missing = picks.value.filter((k) => !picked.value.includes(k));
      for (const k of missing) {
      await flyToAnswer(k);
      await sleepMs(120);
      }
      while (flyGhosts.value.length) await sleepMs(30);
      wrongKeys.value = picked.value.filter((k) => !picks.value.includes(k));
      phase.value = 'lost';
      playLose();
      save();
      }
      
      function revealAnswer() {
      if (phase.value !== 'play') return;
      hearts.value = 0;
      streak.value = 0;
      setRaw(streakKeyFor(mode.value), '0');
      save();              // 先落档 0 心，飞行期间退出重进也会按失败处理
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
      setTimeout(scheduleNextRound, 30);
      }
      
      function replayLevel() { confirming.value = false; deal(level.value); }
      let nextBusy = false;
      function nextLevel() {
      // 连续点击只认第一下；预生成命中时不再同步跑 newRound
      if (phase.value !== 'won' || nextBusy) return;
      nextBusy = true;
      const lv = level.value + 1;
      const cached = preparedNext && preparedNext.level === lv ? preparedNext.round : null;
      if (cached) {
      preparedNext = null;
      applyRound(cached, lv);
      } else {
      applyRound(newRound(lv), lv);
      }
      nextBusy = false;
      }
      function startNewRun() { streak.value = 0; deal(1); }
      
      function toggleMode() {
      // 飞行 / 查看答案收尾期间不能切：旧模式的异步收尾会写到新模式的状态里
      if (flyingCount.value > 0 || (phase.value === 'play' && hearts.value <= 0)) return;
      save();                         // 先落档当前模式，再切
      clearTimeout(shakeTimer);
      clearTimeout(wonTimer);
      prepareSeq += 1;             // 作废旧模式的预生成
      preparedNext = null;
      flyGhosts.value = [];
      landingKeys.value = [];
      flyingCount.value = 0;
      justWon.value = false;
      confirming.value = false;
      mode.value = mode.value === 2 ? 1 : 2;
      setRaw(`${PREFIX}mode`, String(mode.value));
      bestLevel.value = +(getRaw(bestKeyFor(mode.value)) || 0);
      streak.value = +(getRaw(streakKeyFor(mode.value)) || 0);
      if (!restore()) deal(+(getRaw(levelKeyFor(mode.value)) || 1));
      }
      
      function restoreState() {
      const s = getJSON(stateKeyFor(mode.value));
      if (!s || !Array.isArray(s.hand) || s.hand.length !== 13) return null;
      if (s.mode !== undefined && s.mode !== mode.value) return null;
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
      picked.value = [...new Set((Array.isArray(s.picked) ? s.picked : []).filter(k => SELECT_KEYS.includes(k)))];
      wrongKeys.value = [...new Set((Array.isArray(s.wrong) ? s.wrong : []).filter(k => SELECT_KEYS.includes(k)))];
      hearts.value = Math.min(2, Math.max(0, Number.isFinite(+s.hearts) ? +s.hearts : 2));
      if (!picks.value.length) return false;       // 坏存档 / 死局 → 重开一关
      phase.value = s.phase === 'won' ? 'won' : s.phase === 'lost' ? 'lost' : 'play';
      if (phase.value === 'play' && hearts.value <= 0) phase.value = 'lost';
      justWon.value = false;
      if (phase.value === 'won') setTimeout(scheduleNextRound, 30);
      return true;
      }
      
onMounted(() => {
  bestLevel.value = +(getRaw(bestKeyFor(mode.value)) || 0);
  streak.value = +(getRaw(streakKeyFor(mode.value)) || 0);
  if (!restore()) deal(+(getRaw(levelKeyFor(mode.value)) || 1));
});

const helpOpen = ref(false);
// 「新游戏」二次确认（取消 / 重玩本关 / 确定重来，与 web 的 shared/ConfirmDialog 一致）。
// ⚠️ 失败遮罩上那颗「新游戏」是用户指定的例外：**不弹确认**，直接清连胜回第 1 关（与 web 同）。
const confirming = ref(false);
function startNewGame() {
  confirming.value = false;
  startNewRun();          // = 清连胜 + deal(1)，与 web 的 startNewGame 同一语义
}

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
  /* 与 web 的 element.animate 同一条曲线/时长；只过渡 transform，全程不透明 */
  transition: transform 0.42s cubic-bezier(0.3, 0.7, 0.35, 1);
  /* 关键：以左上角为缩放原点。默认 center 会让 scale 把牌「往右下缩」，
     落点比目标槽位偏 (w 差/2, h 差/2)，替身消失那一刻就会跳一下 */
  transform-origin: 0 0;
  will-change: transform;
}
/* 飞行中的目标槽位先隐身（visibility 不影响布局，量位置照样准）——web 的 .answer-tile.landing */
.answer-tile.landing { visibility: hidden; }
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
}
.answer-tile.wrong { animation: stamp-shake 0.5s ease 0.3s; }
.submit { position: absolute; right: 12rpx; top: 30rpx; margin: 0; width: 96rpx; height: 60rpx; line-height: 60rpx; border-radius: 12rpx; font-size: 22rpx; background: #23804e; color: #fff; }
.submit[disabled] { background: #aaa; }
.pick-row { display: flex; gap: 3rpx; justify-content: center; }
.pick-tile { position: relative; width: 66rpx; height: 84rpx; border-radius: 8rpx; overflow: hidden; background: #f7f4ee; }
.pick-tile.used, .pick-tile.muted { opacity: 0.35; filter: grayscale(0.5); }
.pick-tile.wrong { outline: 2rpx solid #d33; outline-offset: -2rpx; }
.pick-tile.used, .pick-tile.muted, .pick-tile.wrong { pointer-events: none; }
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
/* ---------- 新游戏二次确认（本地版 ConfirmDialog，与其它页面同一套） ---------- */
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
.confirm-actions .confirm-replay {
  background: transparent;
  border: 2rpx solid #c2410c;
  color: #c2410c;
  font-weight: bold;
}
.confirm-ok { background: #23804e; color: #fff; font-weight: bold; }
</style>
