<template>
  <div class="wrapper">
    <TopHeader @onScoreReset="onScoreReset">
      <!-- 模式切换：即时判断 / 最终判断（提交后统一判卷）。两种模式的记录各自独立 -->
      <span
        class="item-wrapper"
        :class="{ 'mode-busy': revealing || flyingCount > 0 || pending }"
        :title="i18n('modeTip')"
        @click="toggleMode"
      >
        <i v-if="mode === 1" i-mdi-lightning-bolt />
        <i v-else i-mdi-check-all />
      </span>
    </TopHeader>

    <!-- 统计条：最高关卡 / 关卡 / 连胜 / 生命（生命在最右） -->
    <div class="card score-area">
      <div class="stat">
        <span class="stat-label">{{ i18n('best') }}</span>
        <span class="stat-value">{{ best || '--' }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('level') }}</span>
        <span class="stat-value">{{ level }}</span>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <span class="stat-label">{{ i18n('streak') }}</span>
        <span class="stat-value">{{ streak }}</span>
      </div>
      <div class="divider"></div>
      <!-- 剩余生命：放在分数区最右边 -->
      <div class="stat stat-hearts">
        <span class="stat-label">{{ i18n('lives') }}</span>
        <span class="stat-value hearts-row"><Hearts :left="hearts" :max="HEARTS_MAX" /></span>
      </div>
    </div>

    <!-- 操作区：新游戏在左，查看答案在右 -->
    <div class="card opt-area">
      <div class="start-wrapper">
        <button class="game-icon" @click="confirming = true">{{ i18n('start') }}</button>
      </div>
      <div class="divider"></div>
      <div class="start-wrapper">
        <button
          class="game-icon answer-btn"
          :disabled="phase !== 'play' || revealing"
          @click="revealAnswers"
        >
          {{ i18n('reveal') }}
        </button>
      </div>
    </div>

    <div class="game-area">
      <!-- 展示区：13 张听牌手牌（逐张入场） -->
      <div class="card hand-card">
        <div class="hand" :style="handVars">
          <div
            v-for="(key, i) in hand"
            :key="`${roundId}-h-${i}`"
            class="hand-tile"
            :class="{ dealing }"
            :style="{ '--i': i }"
          >
            <MahjongTile :suit="faceOf(key).suit" :value="faceOf(key).value" />
          </div>
        </div>
        <div class="tips">
          <span class="tip-main">{{ i18n('handTip') }}</span>
          <span class="tip-sub">{{ i18n('pickTip') }}</span>
        </div>
      </div>

      <!-- 答案区：玩家选中的牌会从下面的选择区**飞进来**；提示文案常驻在答案区上部居中 -->
      <div class="card answer-card" :class="{ shake: answerShake }">
        <div class="answer-tip">{{ i18n(mode === 2 ? 'answerTipSubmit' : 'answerTip') }}</div>
        <div class="answer-body">
          <div class="answer-row" :style="pickRowVars">
            <div
              v-for="key in pickedKeys"
              :key="`${roundId}-a-${key}`"
              :ref="el => setAnswerEl(key, el)"
              class="answer-tile"
              :class="{ landing: landingKeys.has(key), removable: mode === 2 }"
              :data-key="key"
              :title="mode === 2 ? i18n('unpickTip') : ''"
              @click="unpick(key)"
            >
              <MahjongTile :suit="faceOf(key).suit" :value="faceOf(key).value" />
            </div>
          </div>
          <!-- 最终判断模式：答案区右侧的提交按钮。选中的牌不即时判对错，点它才整组判卷 -->
          <button
            v-if="mode === 2 && phase === 'play'"
            class="game-icon"
            :disabled="!canSubmit"
            @click="submitPicks"
          >{{ i18n('submit') }}</button>
        </div>
      </div>

      <!-- 答案选择区：三门 27 张（逐张入场）；手牌里已满 4 张的置灰、已选走的不可再选 -->
      <div class="card pick-card">
        <div v-for="g in groups" :key="g.key" class="pick-row">
          <div class="row-tiles" :style="pickRowVars">
            <div
              v-for="(key, i) in g.keys"
              :key="`${roundId}-p-${key}`"
              class="pick-tile"
              :class="{
                dealing,
                blocked: blockedSet.has(key),
                // 即时判断模式才用绿圈表示「选对了」；最终判断模式在提交前不能暗示对错
                picked: mode === 1 && pickedSet.has(key),
                used: pickedSet.has(key),
                revealed: revealed && picks.includes(key),
                missed: missedSet.has(key),
                wrong: wrongKey === key,
              }"
              :style="{ '--i': g.offset + i }"
              :data-key="key"
              :ref="el => setPickEl(key, el)"
              :title="blockedSet.has(key) ? i18n('blocked') : ''"
              @click="pick(key)"
            >
              <MahjongTile :suit="faceOf(key).suit" :value="faceOf(key).value" />
            </div>
          </div>
        </div>
        <!-- 查看答案跑完动画后：选择区盖上失败遮罩（答案区仍看得见，方便复盘） -->
        <div v-if="pickFailed" class="pick-mask">
          <span class="mask-text">👻 {{ i18n('revealFailed') }}</span>
          <div class="result-actions">
            <button class="game-icon" @click="retryLevel">{{ i18n('replayLevel') }}</button>
            <!-- 失败遮罩上的「新游戏」是用户指定的例外：不弹二次确认，直接清当前连胜、回第 1 关 -->
            <button class="game-icon" @click="startNewGame">{{ i18n('start') }}</button>
          </div>
        </div>
      </div>

      <!-- 结算浮层：只有获胜用它；失败（扣完心 / 查看答案）一律走选择区的失败遮罩 -->
      <div v-if="phase === 'won'" class="result win">
        <span>🎉🎉 {{ i18n('tipWin') }} 🎉🎉</span>
        <span class="result-note">{{ i18n('winNote').replace('{n}', level) }} · {{ i18n('streakNow').replace('{n}', streak) }}</span>
        <div class="result-actions">
          <button class="game-icon" @click="retryLevel">{{ i18n('replayLevel') }}</button>
          <button class="game-icon" @click="nextLevel">{{ i18n('nextLevel') }}</button>
        </div>
      </div>
    </div>

    <!-- 共用的二次确认弹窗（文案与样式都在 shared/ConfirmDialog.vue 里） -->
    <ConfirmDialog
      :show="confirming"
      @confirm="startNewGame"
      @replay="retryLevel"
      @cancel="confirming = false"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';

import { playFail, playLose } from '@/shared/audio';
import TopHeader from '@/components/TopHeader.vue';
import ConfirmDialog from '@/shared/ConfirmDialog.vue';
import Hearts from '@/shared/Hearts.vue';
import confetti from '@/shared/confetti';
import { i18n } from '@/shared/i18n';
import { useResultDelay } from '@/shared/resultDelay';
import { TILE_RATIO } from '@/shared/mahjongTiles';
import MahjongTile from '@/games/mahjong/MahjongTile.vue';
import { clearGameStorage } from '@/shared/storage';
import {
  HAND_SIZE, KIND_KEYS, MAX_PER_KIND,
  faceOf, handCounts, isBlocked, newRound, winningPicks,
} from './board';

// ---------- 存档 ----------
// ⚠️ 答案集合（picks）**不写进存档**：恢复时按手牌重算，免得手改存档就能看到答案。
// 两个模式（1 即时判断 / 2 最终判断）的关卡、最高关卡、连胜、局面各自一份：老模式沿用原 key，
// 新模式加 _2 后缀（与麻将英雄 / 雀圣同一套约定）。mode 本身是偏好，清记录时保留。
const KEY_PREFIX = '__gambler__';
const KEYS = {
  mode: '__gambler__mode',
  level: ['__gambler__level', '__gambler__level_2'],
  best: ['__gambler__best', '__gambler__best_2'],
  streak: ['__gambler__streak', '__gambler__streak_2'],
  state: ['__gambler__state', '__gambler__state_2'],
};
const HEARTS_MAX = 2;

const storedMode = Math.floor(+(localStorage.getItem(KEYS.mode) || 1));
const mode = ref(storedMode === 2 ? 2 : 1);         // 1 即时判断 / 2 最终判断（提交后判卷）
const modeIndex = () => (mode.value === 2 ? 1 : 0);
const levelKey = () => KEYS.level[modeIndex()];
const bestKey = () => KEYS.best[modeIndex()];
const streakKey = () => KEYS.streak[modeIndex()];
const stateKey = () => KEYS.state[modeIndex()];

const readNum = (key, dflt) => {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v >= 0 ? v : dflt;
  } catch { return dflt; }
};

// ---------- 状态（全部先声明，restore() 要用到） ----------
const level = ref(Math.max(1, readNum(levelKey(), 1)));
const best = ref(readNum(bestKey(), 0));
const streak = ref(readNum(streakKey(), 0));
const hearts = ref(HEARTS_MAX);
const hand = ref([]);
const counts = ref({});
const jokers = ref(0);
const picks = ref([]);
const blocked = ref([]);
const pickedKeys = ref([]);
const phase = ref('play');          // play | won | lost
const revealed = ref(false);        // 是否已经「查看答案」
const revealing = ref(false);       // 正在一张张放答案（期间锁输入）
// 最终判断模式允许**多张牌同时飞**：用计数而不是布尔值，每个目标槽位单独隐身。
// 牌一开飞就写进 pickedKeys（认定已选择），所以飞行中也能点别的牌、点提交。
const flyingCount = ref(0);
const landingKeys = ref(new Set());  // 正在飞的目标槽位 key（每张单独隐身，落地才现身）
const pickFailed = ref(false);      // 选择区失败遮罩（失败后）
const missedKeys = ref([]);         // 点错过的牌：标红、不能再选
const reason = ref('');             // '' | 'wrong'（扣完心）| 'reveal'（查看答案）
const roundId = ref(0);
const dealing = ref(false);
const confirming = ref(false);
const wrongKey = ref(null);
const answerShake = ref(false);     // 最终判断模式提交错误时抖一下答案区（不指出是哪张）
const vwTick = ref(0);              // 只为了让尺寸在转屏/缩放后重算

const { pending, later, cancel } = useResultDelay();

const FLY_MS = 420;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pickEls = new Map();
const answerEls = new Map();
const setPickEl = (key, el) => { if (el) pickEls.set(key, el); else pickEls.delete(key); };
const setAnswerEl = (key, el) => { if (el) answerEls.set(key, el); else answerEls.delete(key); };

const blockedSet = computed(() => new Set(blocked.value));
const pickedSet = computed(() => new Set(pickedKeys.value));
const missedSet = computed(() => new Set(missedKeys.value));
// 最终判断模式的提交按钮：只要答案区有牌就能点 —— 飞行中的牌已经算进 pickedKeys，
// 所以不再因为「有张牌还在飞」或「刚答错在抖」而置灰（用户要求）。
const canSubmit = computed(() => mode.value === 2 && phase.value === 'play'
  && !pending.value && !revealing.value && pickedKeys.value.length > 0);

// ---------- 尺寸 ----------
// 手牌 13 张排一行（像真的一手牌）；选择区每行 9 张（字牌 7 张）。
// 牌面一律「宽定高」：高 = 宽 × 168/131，跟 MahjongTile 的真实比例一致
//（两边都减 2 那种写法会把长宽比拉偏，雪碧图背景被拉伸、取景也跟着偏）。
const layout = computed(() => {
  void vwTick.value;
  const avail = Math.min(window.innerWidth || 420, 440) - 32;
  const pad = 8;
  const handGap = 2;
  const pickGap = 3;
  const handW = Math.max(16, Math.floor((avail - pad * 2 - handGap * (HAND_SIZE - 1)) / HAND_SIZE));
  const pickW = Math.max(18, Math.floor((avail - pad * 2 - pickGap * 8) / 9));
  return {
    handW,
    handH: Math.round(handW * TILE_RATIO),
    pickW,
    pickH: Math.round(pickW * TILE_RATIO),
    handGap,
    pickGap,
  };
});
const handVars = computed(() => ({
  gap: `${layout.value.handGap}px`,
  '--mj-w': `${layout.value.handW}px`,
  '--mj-h': `${layout.value.handH}px`,
}));
const pickRowVars = computed(() => ({
  gap: `${layout.value.pickGap}px`,
  '--mj-w': `${layout.value.pickW}px`,
  '--mj-h': `${layout.value.pickH}px`,
}));

// 选择区三行：万 / 条 / 筒（玩家要求去掉左侧文字，也去掉字牌 → 一共 27 张）
const groups = computed(() => [
  { key: 'm', keys: KIND_KEYS.slice(0, 9), offset: 0 },
  { key: 's', keys: KIND_KEYS.slice(9, 18), offset: 9 },
  { key: 'p', keys: KIND_KEYS.slice(18, 27), offset: 18 },
]);

// ---------- 存档读写 ----------
function save() {
  try {
    localStorage.setItem(levelKey(), String(level.value));
    localStorage.setItem(bestKey(), String(best.value));
    localStorage.setItem(streakKey(), String(streak.value));
    if (phase.value === 'play' && !hand.value.length) return;
    localStorage.setItem(stateKey(), JSON.stringify({
      mode: mode.value,
      level: level.value,
      hand: hand.value,
      picked: pickedKeys.value,
      hearts: hearts.value,
      phase: phase.value,
      // 'reveal' = 查看答案 / 'wrong' = 扣完心：回来都停在同一屏（答案区留着、选择区盖遮罩）
      reason: reason.value,
      missed: missedKeys.value,
    }));
  } catch { /* 存不下就算了 */ }
}

function restore() {
  try {
    const raw = localStorage.getItem(stateKey());
    if (!raw) return false;
    const st = JSON.parse(raw);
    if (!st || !Array.isArray(st.hand) || st.hand.length !== HAND_SIZE) return false;
    if (st.mode !== undefined && st.mode !== mode.value) return false;
    const hc = handCounts(st.hand);
    level.value = Math.max(1, Math.floor(st.level) || 1);
    hand.value = st.hand.slice();
    counts.value = hc.counts;
    jokers.value = hc.jokers;
    const recomputed = winningPicks(hc.counts, hc.jokers);    // 答案重算，不读存档
    // 边界：手牌被改过 / 存档损坏成「一个答案都没有」时是死局 → 当作没有存档，重开一关
    if (!recomputed.length) return false;
    picks.value = recomputed;
    blocked.value = KIND_KEYS.filter(k => isBlocked(k, hc.counts));
    // ⚠️ 已选的是**答案**（手牌之外的牌），所以只能按「合法牌面」校验，不能要求它在手牌里
    //（早先写成 filter(k => st.hand.includes(k)) → 刷新后答案区会被清空大半）
    pickedKeys.value = [...new Set((Array.isArray(st.picked) ? st.picked : []).filter(k => KIND_KEYS.includes(k)))];
    hearts.value = Math.min(HEARTS_MAX, Math.max(0, Math.floor(st.hearts ?? HEARTS_MAX)));
    phase.value = ['play', 'won', 'lost'].includes(st.phase) ? st.phase : 'play';
    // 「查看答案」最后才把 phase 改成 lost，之前有 1~3s 的飞行期：
    // 这期间刷新会读到 0 心 + play，直接按失败处理，免得零心还能继续抢答
    if (phase.value === 'play' && hearts.value <= 0) phase.value = 'lost';
    // 查看答案结束的状态要整屏还原：答案区的牌 + 选择区的失败遮罩（不再弹那个居中浮层）
    reason.value = st.reason === 'reveal' || st.reason === 'wrong' ? st.reason : '';
    revealed.value = st.reason === 'reveal';
    missedKeys.value = [...new Set((Array.isArray(st.missed) ? st.missed : []).filter(k => KIND_KEYS.includes(k)))];
    pickFailed.value = phase.value === 'lost';

    roundId.value += 1;

      playDealAnimation();          // 恢复局面同样播一次入场动画
    return true;
  } catch { return false; }
}

// ---------- 流程 ----------
let dealTimer = 0;
let flashTimer = 0;
let wrongSubmitTimer = 0;

function deal(lv) {
  cancel();
  const round = newRound(lv);
  level.value = round.level;
  hand.value = round.hand;
  counts.value = round.counts;
  jokers.value = round.jokers;
  picks.value = round.picks;
  blocked.value = round.blocked;
  pickedKeys.value = [];
  hearts.value = HEARTS_MAX;
  phase.value = 'play';
  revealed.value = false;
  revealing.value = false;
  flyingCount.value = 0;
  landingKeys.value = new Set();
  pickFailed.value = false;
  missedKeys.value = [];
  reason.value = '';
  wrongKey.value = null;
  answerShake.value = false;
  clearTimeout(wrongSubmitTimer);
  best.value = Math.max(best.value, round.level);
  roundId.value += 1;
  playDealAnimation();
  save();
}

// 发牌动画：手牌与选择区错峰入场，0.9s 后收尾。
// ⚠️ 换关（deal）与**恢复存档**（restore）都要调 —— 玩家反馈「退出重进恢复游戏没有动画效果」，
// 就是因为 restore 只加了 roundId、没开这个开关。
function playDealAnimation() {
  dealing.value = true;
  clearTimeout(dealTimer);
  dealTimer = setTimeout(() => { dealing.value = false; }, 900);
}

// 把一张牌从选择区飞进答案区：**复制一张**飞出去，原位那张立刻置灰留在原地
//（玩家要求「所在位置不要空白」），目标槽位飞行期间先隐身，落地那一刻才现身。
const setLanding = (key, on) => {
  const next = new Set(landingKeys.value);
  if (on) next.add(key); else next.delete(key);
  landingKeys.value = next;
};

async function flyToAnswer(key) {
  const fromEl = pickEls.get(key);
  pickedKeys.value = [...pickedKeys.value, key];   // → 原位立刻变 .used（置灰、不可点）
  setLanding(key, true);                           // 只藏这一张的目标槽位，别的飞行互不影响
  try {
    await nextTick();
    const toEl = answerEls.get(key);
    if (fromEl && toEl) {
      const a = fromEl.getBoundingClientRect();
      const b = toEl.getBoundingClientRect();
      const dx = b.left - a.left;
      const dy = b.top - a.top;
      const sc = a.width ? b.width / a.width : 1;
      // 克隆节点：内联的 --bg-x/--bg-y 与 data-v 属性一起带走，所以牌面一致；
      // 自己加 filter:none 抵消原位那张的置灰，看起来就是「一张干净的牌飞过去」。
      const ghost = fromEl.cloneNode(true);
      Object.assign(ghost.style, {
        position: 'fixed',
        left: `${a.left}px`,
        top: `${a.top}px`,
        width: `${a.width}px`,
        height: `${a.height}px`,
        margin: '0',
        // 压在胜利浮层（z-index 20）下面，飞行中提交成功时替身不会盖在结算层上
        zIndex: '19',
        pointerEvents: 'none',
        filter: 'none',
        opacity: '1',
      });
      document.body.appendChild(ghost);
      try {
        await ghost.animate(
          [{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${sc})` }],
          { duration: FLY_MS, easing: 'cubic-bezier(0.3, 0.7, 0.35, 1)' },
        ).finished;
      } catch { await sleep(FLY_MS); }
      ghost.remove();
    } else {
      await sleep(FLY_MS);
    }
  } finally {
    setLanding(key, false);
  }
}

async function pick(key) {
  // 飞行不再阻塞输入；只有「即时判断」保持原来的一次一张（避免连续点错时扣心节奏失控）。
  // 最终判断模式允许边飞边点，因为牌一开飞就已经写进 pickedKeys（认定已选择）。
  if (phase.value !== 'play' || pending.value || revealing.value) return;
  if (mode.value === 1 && flyingCount.value > 0) return;
  // 已选过 / 已标红（点错过）的都不能再选，选择区里它们也已置灰不可点
  if (blockedSet.value.has(key) || pickedSet.value.has(key) || missedSet.value.has(key)) return;
  if (mode.value === 2) {
    // 最终判断模式：选哪张都先飞进答案区，**不即时判对错**，等玩家点提交再整组判卷
    const flight = flyToAnswer(key);
    save();                                        // 一开飞就落档：飞行中退出也算已选
    flyingCount.value += 1;
    try { await flight; } finally { flyingCount.value = Math.max(0, flyingCount.value - 1); }
    save();
    return;
  }
  if (picks.value.includes(key)) {
    flyingCount.value += 1;
    try { await flyToAnswer(key); } finally { flyingCount.value = Math.max(0, flyingCount.value - 1); }
    save();
    // 胜利遮罩不等待：最后一张牌落位后立刻铺结算层（用户要求）
    if (pickedKeys.value.length === picks.value.length) win();
    return;
  }
  // 点错：标红 + 抖一下 + 扣一颗心（标红后这张不能再选）
  missedKeys.value = [...missedKeys.value, key];
  wrongKey.value = key;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { if (wrongKey.value === key) wrongKey.value = null; }, 620);
  hearts.value -= 1;
  playFail();   // 点错，扣❤️
  // 扣完心：先把正确答案挨个飞进答案区，飞完再盖失败遮罩
  if (hearts.value <= 0) later(() => finishRound('wrong'));
  else save();
}

// 最终判断模式：点答案区的牌把它退回选择区（可以反复调整，提交前不判对错）
function unpick(key) {
  if (mode.value !== 2 || phase.value !== 'play' || pending.value || revealing.value) return;
  if (!pickedSet.value.has(key)) return;
  pickedKeys.value = pickedKeys.value.filter(k => k !== key);
  save();
}

// 最终判断模式的提交：少选 / 多选 / 错选都算错，只扣一颗心，不指出具体是哪张错了
function submitPicks() {
  // 错误提交后 0.52s 内不接受再次提交：避免手快连点两下把两颗心一次扣光
  if (!canSubmit.value || answerShake.value) return;
  const exact = pickedKeys.value.length === picks.value.length
    && pickedKeys.value.every(k => picks.value.includes(k));
  // 胜利遮罩不等待：判卷正确立即铺结算层（用户要求）
  if (exact) { win(); return; }
  hearts.value = Math.max(0, hearts.value - 1);
  playFail();   // 提交错，扣❤️
  // 抖一下整块答案区（不是某一张），玩家只知道「这一版答案不对」，要自己纠正
  answerShake.value = true;
  clearTimeout(wrongSubmitTimer);
  wrongSubmitTimer = setTimeout(() => { answerShake.value = false; }, 520);
  // 扣完心：走和「查看答案」同一套收尾（先把答案补全再盖失败遮罩）
  if (hearts.value <= 0) later(() => finishRound('wrong'));
  else save();
}

// 一局结束（失败）：把玩家还没选出来的正确答案**挨个从选择区飞进答案区**，全部落地后
// 才在选择区盖失败遮罩。kind: 'wrong'（扣完心）| 'reveal'（查看答案）
async function finishRound(kind) {
  if (revealing.value || phase.value !== 'play') return;
  revealing.value = true;
  // 最终判断模式里答案区可能还躺着玩家选错的牌：先清掉，再把正确答案补齐，
  // 失败复盘时答案区就只会剩下真正的答案（不然「已把全部答案标出来」里会混着错牌）
  if (mode.value === 2) pickedKeys.value = pickedKeys.value.filter(k => picks.value.includes(k));
  revealed.value = kind === 'reveal';
  reason.value = kind;
  save();
  const todo = picks.value.filter(k => !pickedSet.value.has(k));
  for (const key of todo) {
    await flyToAnswer(key);
    await sleep(120);
  }
  // 最终判断模式允许提交时还有牌在飞：等这些替身也落完再盖失败遮罩，
  // 否则遮罩会先出现、飞行中的牌从它上面穿过去。
  while (flyingCount.value > 0) await sleep(30);
  revealing.value = false;
  pickFailed.value = true;
  playLose();   // 等答案全部飞进答案区、失败遮罩出现的这一刻才播
  phase.value = 'lost';
  streak.value = 0;
  save();
}

// 查看答案：直接放弃（心清零）→ 走和「扣完心」完全一样的收尾：挨个飞答案 → 失败遮罩。
// 同 24 点的「查看答案 = 放弃」。
async function revealAnswers() {
  if (phase.value !== 'play' || revealing.value || pending.value) return;
  hearts.value = 0;
  save();                                     // 立刻落盘：这一瞬间就算放弃了
  await finishRound('reveal');
}

function win() {
  confetti();                    // 获胜撒花（用户反馈「胜利缺少烟花效果」）
  phase.value = 'won';
  streak.value += 1;
  best.value = Math.max(best.value, level.value + 1);      // 解锁下一关
  pickedKeys.value = picks.value.slice();
  save();
}

function nextLevel() { deal(level.value + 1); }
function retryLevel() {
  // 从「新游戏」的 ConfirmDialog 里点进来时，必须先把弹窗收掉（用户报过：点了重玩本关弹窗不关）
  confirming.value = false;
  deal(level.value);
}

// 切换模式：先落档当前模式，再切到另一种模式自己的关卡 / 最高关卡 / 连胜 / 局面。
// 飞行、查看答案、结算延迟期间不允许切，否则上一模式的异步收尾会改到新模式的数据。
function toggleMode() {
  if (revealing.value || flyingCount.value > 0 || pending.value) return;
  save();
  cancel();
  clearTimeout(dealTimer);
  clearTimeout(flashTimer);
  clearTimeout(wrongSubmitTimer);
  mode.value = mode.value === 1 ? 2 : 1;
  try { localStorage.setItem(KEYS.mode, String(mode.value)); } catch { /* 隐私模式忽略 */ }
  answerShake.value = false;
  wrongKey.value = null;
  revealing.value = false;
  flyingCount.value = 0;
  landingKeys.value = new Set();
  pickFailed.value = false;
  level.value = Math.max(1, readNum(levelKey(), 1));
  best.value = readNum(bestKey(), 0);
  streak.value = readNum(streakKey(), 0);
  if (!restore()) deal(level.value);
}

function startNewGame() {
  confirming.value = false;
  streak.value = 0;
  deal(1);
}

// 连点标题 5 次：清记录（TopHeader 只会按 recordsPrefix 删 key，这里由组件自己清）。
// clearGameStorage 会清掉两种模式各自的关卡 / 最高关卡 / 连胜 / 局面，只保留 mode 偏好。
function onScoreReset() {
  clearGameStorage(KEY_PREFIX);
  streak.value = 0;
  best.value = 0;
  deal(1);
}

function onResize() { vwTick.value += 1; }

onMounted(() => {
  window.addEventListener('resize', onResize);
  if (!restore()) deal(level.value);
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  clearTimeout(dealTimer);
  clearTimeout(flashTimer);
  clearTimeout(wrongSubmitTimer);
});
</script>

<style scoped lang="scss">
.wrapper {
  max-width: var(--max-width);
  margin: 0 auto;
  // ⚠️ 必须写完整简写：只写 padding-top 会把左右内边距清零 → 所有卡片贴到屏幕两边
  padding: 64px 16px 24px;
  box-sizing: border-box;
  color: var(--text-color);

  // 这三条每个游戏都要自己写一份（全局只有变量，没有这三条类规则）
  .card {
    background: var(--card-bg-color);
    border-radius: var(--card-radius);
    box-shadow: var(--card-shadow);
    box-sizing: border-box;
  }
  .divider {
    width: 1px;
    height: 24px;
    align-self: center;
    background: var(--border-color);
    opacity: 0.6;
    flex: 0 0 auto;
  }
  // 切模式在飞行 / 查看答案 / 结算延迟期间不可用（与 toggleMode 的 guard 对应）
  .mode-busy {
    opacity: 0.35;
    pointer-events: none;
  }
  .game-icon {
    cursor: pointer;
    padding: 8px 10px;
    font-size: 13px;
    font-weight: bold;
    white-space: nowrap;
    background: var(--primary-bg);
    color: #fff;
    border: 0 none;
    border-radius: var(--radius-tile);
    &:disabled { background-color: #aaa; cursor: not-allowed; }
  }

  .score-area,
  .opt-area {
    display: flex;
    align-items: center;
    padding: 10px 8px;
  }
  .opt-area { margin-top: 12px; }

  .stat {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .stat-label { font-size: 12px; opacity: 0.75; }
  .stat-value { font-size: 20px; font-weight: bold; }
  // 查看答案 = 放弃（会清当前连胜），用橙色和「新游戏」区分开
  //（与 24 点的 .answer-btn 同一套：全局变量 --god-bg = #c2410c，白字 5.18:1）
  .game-icon.answer-btn:not(:disabled) {
    background-color: var(--god-bg);
  }

  .start-wrapper {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .game-area {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 12px;
  }

  // ---- 展示区 ----
  .hand-card {
    padding: 10px 8px 8px;
  }
  .hand {
    display: flex;
    justify-content: center;
    align-items: flex-end;
  }
  .hand-tile {
    flex: 0 0 auto;
    &.dealing { animation: tile-in 0.34s ease both; animation-delay: calc(var(--i) * 26ms); }
  }
  .tips {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    text-align: center;
    .tip-main { font-size: 13px; font-weight: bold; }
    .tip-sub { font-size: 12px; opacity: 0.7; }
  }

  // ---- 答案区：玩家选中的牌从下面飞进来；提示语常驻在卡片上部居中 ----
  .answer-card {
    padding: 8px;
    // 提示语 + 一张牌的高度；飞行途中布局不跳
    min-height: calc(var(--mj-h, 42px) + 34px);
    display: flex;
    flex-direction: column;
    gap: 4px;
    // 提交错误时只抖整块答案区，不指出具体哪张错
    &.shake { animation: tile-shake 0.5s ease; }
  }
  .answer-tip {
    text-align: center;
    font-size: 12px;
    line-height: 1.35;
    opacity: 0.6;
  }
  .answer-body {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    // 最终判断模式的提交按钮固定在答案区右侧
    > .game-icon { flex: 0 0 auto; }
  }
  .answer-row {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    // 左对齐（玩家要求）：选中的牌从左边开始排；选得多就换行，最多两行后内部滚动
    justify-content: flex-start;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 3px;
    min-height: var(--mj-h, 42px);
    max-height: calc(var(--mj-h, 42px) * 2 + 6px);
    overflow-x: hidden;
    overflow-y: auto;
  }
  .answer-tile {
    flex: 0 0 auto;
    // 目标槽位在飞行期间隐身（visibility 不影响布局，所以量位置照样准）
    &.landing { visibility: hidden; }
    // 最终判断模式：点答案区的牌退回到选择区
    &.removable { cursor: pointer; }
  }

  // ---- 答案选择区 ----
  .pick-card {
    position: relative;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  // 查看答案跑完动画后盖在选择区上的失败遮罩（答案区仍然看得见，方便复盘）
  .pick-mask {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 12px;
    text-align: center;
    border-radius: var(--card-radius);
    background: var(--mask-color);
    backdrop-filter: blur(2px);
    animation: fade-in 0.24s ease both;
    .mask-text {
      font-size: 14px;
      font-weight: bold;
      color: var(--lose-color);
      line-height: 1.5;
    }
  }
  .pick-row {
    display: flex;
    align-items: center;
    // 三行都居中（一行 9 张比卡片内宽略窄，靠左会右侧多出几像素）
    justify-content: center;
    gap: 6px;
  }
  .row-tiles {
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .pick-tile {
    flex: 0 0 auto;
    cursor: pointer;
    border-radius: calc(var(--mj-w, 30px) * 0.09);
    transition: transform 0.12s ease, filter 0.12s ease;
    -webkit-tap-highlight-color: transparent;
    &.dealing { animation: tile-in 0.34s ease both; animation-delay: calc(var(--i) * 16ms); }
    &.picked {
      // 选中：一圈绿环（用 outline，跟着圆角走、又不撑开布局）
      outline: 3px solid var(--primary-bg);
      outline-offset: -1px;
    }
    &.wrong { animation: tile-shake 0.5s ease; }
    // 点错过的：标红 + 不能再选
    &.missed {
      outline: 3px solid var(--lose-color);
      outline-offset: -1px;
      filter: grayscale(0.4) opacity(0.7);
      pointer-events: none;
    }
    // 已经飞进答案区了：不能再选（视觉上留个淡痕）
    &.used {
      pointer-events: none;
      filter: grayscale(0.7) opacity(0.45);
    }
    &.blocked {
      cursor: not-allowed;
      // 手里已经有 4 张：置灰不可选
      filter: grayscale(1) opacity(0.4);
      pointer-events: none;
    }
    // 查看答案标出来的：绿圈 + 轻微发光，和玩家自己选的区分开
    &.revealed {
      outline: 3px solid var(--win-color);
      outline-offset: -1px;
      box-shadow: 0 0 10px 2px color-mix(in srgb, var(--win-color) 45%, transparent);
    }
  }

  // ---- 结算浮层 ----
  .result {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 16px;
    text-align: center;
    font-size: 20px;
    font-weight: bold;
    border-radius: var(--card-radius);
    background: var(--mask-color);
    backdrop-filter: blur(2px);
    animation: fade-in 0.24s ease both;
    &.win { color: var(--win-color); }
    &.lose { color: var(--lose-color); }
    .result-note {
      font-size: 13px;
      font-weight: normal;
      color: var(--text-color);
      opacity: 0.85;
    }
  }
  // 结算/遮罩里的按钮行：提到顶层，浮层与选择区遮罩共用（两处都要有间隔）
  .result-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-top: 2px;
  }
}

@keyframes tile-in {
  from { opacity: 0; transform: translateY(-10px) scale(0.86); }
  to { opacity: 1; transform: none; }
}
@keyframes tile-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-4px); }
  40% { transform: translateX(4px); }
  60% { transform: translateX(-3px); }
  80% { transform: translateX(2px); }
}
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
