<template>
  <view class="screen">
    <!-- 全站背景（粒子连线 + 底部过山车，与 web 的 ParticleBackground 同款） -->
    <ParticleBackground />
    <view class="page">
    <!-- header：标题 + 右侧（牌面切换 + 帮助），与 web 的 TopHeader 一致 -->
    <!-- 分数区：最高关 / 关卡 / 剩余对数（与 web 的 score-area 一致）+ 本关进度条 -->
    <view class="card score-area">
      <view class="stat"><text class="label">🏆 {{ t('mBest') }}</text><text class="value">{{ bestLevel }}</text></view>
      <view class="divider" />
      <view class="stat"><text class="label">🏁 {{ t('mLevel') }}</text><text class="value">{{ level }}</text></view>
      <view class="divider" />
      <view class="stat"><text class="label">🃏 {{ t('mLeft') }}</text><text class="value">{{ leftPairs }}</text></view>
      <view class="progress"><view class="progress-fill" :style="{ width: progressPct + '%' }" /></view>
    </view>

    <!-- 操作区：盘面信息 + 观察/操作倒计时 + 新游戏（与 web 的 opt-area 一致） -->
    <view class="card opt-area">
      <view class="opt-half">
        <text class="info">{{ conf.rows }}×{{ conf.cols }} · {{ conf.pairs }} {{ t('mPairs') }}</text>
      </view>
      <view class="divider" />
      <view class="opt-half">
        <text class="timer" :class="{ warn: clock <= 15 }">{{ phase === PREVIEW ? '👀 ' : '⏳ ' }}{{ clockText }}</text>
      </view>
      <view class="divider" />
      <view class="opt-third">
        <button class="btn" @click="confirming = true">{{ t('start') }}</button>
      </view>
    </view>

    <!-- 阶段提示：与 web 一样贴在棋盘上方（带子里），翻面后让位给连击提示 -->
    <!-- 提示条常驻占位（只有可见性变化），避免下方棋盘上下跳 -->
    <view class="phase-tip" :class="{ empty: !phaseHintText }">{{ phaseHintText }}</view>

    <view class="game-area" :style="{ width: boardW + 'rpx', height: boardH + 'rpx' }">
      <view class="board" :class="{ 'no-deal': silentRestore }" :style="{ width: boardW + 'rpx', height: boardH + 'rpx' }">
          <view
            v-for="(card, i) in cards"
            :key="card.id"
            class="tile"
            :class="{ up: card.flipped || phase === PREVIEW, matched: card.matched, blink: card.bouncing, mjback: !card.flipped && phase !== PREVIEW && mode === MODE_MAHJONG }"
            :style="cardStyle(i)"
            @click="onCardClick(card)"
          >
            <!-- 正反两面常驻（照 Emoji 镜像）：.flip 只负责 3D 舞台，
                 .tile 负责定位 + 发牌动画（两者分开，动画的 transform 不会污染 3D 上下文） -->
            <view class="flip">
              <view class="face face-back">
                <!-- ⚠️ 图标类必须放内层：i-xxx 会加 mask + background-color，
                     写在 .face-back 上会把整块牌背裁成灯泡形状（AGENTS 第八节同一个坑） -->
                <view
                  v-if="mode !== MODE_MAHJONG"
                  class="back-ico i-mdi-lightbulb-on-50"
                  :style="{ fontSize: Math.round(tileSize * 0.56) + 'rpx' }"
                />
              </view>
              <view class="face face-front">
                <text v-if="mode === 1" class="emoji" :style="{ fontSize: faceFont + 'rpx' }">{{ card.item }}</text>
                <MahjongTile v-else :suit="card.item[0]" :value="+card.item.slice(1)" class="mj" />
              </view>
            </view>
          </view>


        <view v-if="phase === WON" class="result win">
          <text class="result-title">{{ t('mWin') }}</text>
          <text class="result-sub">{{ t('mTime') }} {{ usedTime }}s</text>
          <view class="result-btns">
            <button class="btn ghost" @click="replayLevel">{{ t('mReplay') }}</button>
            <button class="btn" @click="nextLevel">{{ t('mNext') }}</button>
          </view>
        </view>
        <view v-else-if="phase === OVER" class="result lose">
          <text class="result-title">{{ t('mLose') }}</text>
          <text class="result-sub">{{ t('mLevel') }} {{ level }}</text>
          <view class="result-btns">
            <button class="btn ghost" @click="replayLevel">{{ t('mReplay') }}</button>
            <button class="btn" @click="confirming = true">{{ t('start') }}</button>
          </view>
        </view>
      </view>
      <!-- 连击提示：落在棋盘上方那条空隙里（web 的 .combo-tip）。
           ⚠️ 必须是 .board 的**兄弟**节点：.board 有 overflow:hidden，放进去会把探出棋盘的那截裁掉 -->
      <view
        v-if="comboTip"
        class="combo-tip"
        :class="comboTipPop"
      >{{ comboTipText }}</view>
    </view>

    </view>
    <!-- 胜利彩带（纯 CSS 降级版，web 是 confetti canvas） -->
    <Confetti v-if="justWon" />
    <!-- 连击小烟花：web 的 burstConfetti（喷发点 = 提示条中心往下 30px） -->
    <FireworkBurst />
    <FloatingActions>
      <view class="fab" @click="toggleMode"><view class="fab-ico" :class="mode === MODE_MAHJONG ? 'i-dinkie-icons-three-of-circles-mahjong' : 'i-mdi-emoticon-happy-outline'" /></view>
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
    <HelpSheet :open="helpOpen" :text="t('helpM')" @close="helpOpen = false" />
  </view>
</template>

<script setup>
// 对对碰 · 微信小程序版
// 关卡曲线与发牌逻辑来自 web 的 board.js（原样复制）；这里重写视图。
// v1 差异：没有 3D 翻面动画（牌背 → 牌面用淡入替代），扑克牌面暂未移植（emoji / 麻将两种）。
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';

import MahjongTile from '@/components/MahjongTile.vue';
import FloatingActions from '@/components/FloatingActions.vue';
import HelpSheet from '@/components/HelpSheet.vue';
import { EMOJIS } from '@/shared/emojis';
import { MAHJONG_FACES } from '@/shared/mahjongFaces';
import { getJSON, getRaw, setRaw } from '@/core/storage';
import { face } from '@/core/settings';
import { t } from '@/core/i18n';
import { playElimination, playLose, playWin } from '@/core/sfx';
import Confetti from '@/components/Confetti.vue';
import FireworkBurst from '@/components/FireworkBurst.vue';
import { burstAtElement } from '@/core/firework';
import { levelConfig } from './board.js';
import { setNavTitle } from '@/core/i18n';
import ParticleBackground from '@/components/ParticleBackground.vue';

// 原生导航栏标题跟随语言（pages.json 里的标题是静态的）
setNavTitle(() => t('mName'));

const [PREVIEW, PLAY, WON, OVER] = ['preview', 'play', 'won', 'over'];
const MODE_EMOJI = 1;
const MODE_MAHJONG = 3;
const PREFIX = '__emoji_match__';
const COMBO_MS = 2500;
const FLIP_BACK_MS = 700;
// 翻面过渡 0.46s：配对成功要等第二张翻完再让两张一起闪 ✗（否则第一张已经在闪、第二张还在翻）
const MATCH_FLIP_MS = 470;

const modeSuffix = (m) => (m === MODE_MAHJONG ? '_3' : '');
const levelKeyFor = (m) => `${PREFIX}level${modeSuffix(m)}`;
const bestKeyFor = (m) => `${PREFIX}best_1${modeSuffix(m)}`;
const stateKeyFor = (m) => `${PREFIX}state${modeSuffix(m)}`;

const rawMode = getRaw(`${PREFIX}mode`);          // 可能是 null（玩家没选过）
const storedMode = +rawMode;
// 牌面：玩家自己选过的（__emoji_match__mode）优先；没选过时用首页设置里的「默认牌面」
const mode = ref(
  storedMode === MODE_MAHJONG || (rawMode == null && face.value === 'mahjong')
    ? MODE_MAHJONG
    : MODE_EMOJI,
);
const level = ref(1);
const bestLevel = ref(1);
const cards = ref([]);
const phase = ref(PREVIEW);
// 彩带只在真正赢下的那一刻放：恢复存档的胜利态不放（与 web 一致）
const justWon = ref(false);
let wonTimer = 0;
const previewLeft = ref(4);
const elapsed = ref(0);
const usedTime = ref(0);
const comboTip = ref(0);
let cardId = 0;
let firstCard = null;
let lock = false;
let previewTick = null;
let previewTimer = null;
let playTick = null;
let mismatchTimer = null;
let matchTimer = null;
// 恢复胜负存档时置 true：牌直接以终态渲染，**不播 card-in / match-blink**
// （用户报过：赢了以后退出重进，会先闪一下卡背再消失）
const silentRestore = ref(false);
let comboTimer = null;
let comboTimerOut = null;
let lastClearAt = 0;
let comboBroken = false;
let comboCount = 0;

const conf = computed(() => levelConfig(level.value, mode.value));
const leftPairs = computed(() => cards.value.filter(c => !c.matched).length / 2);
const clock = computed(() => (phase.value === PREVIEW ? previewLeft.value : Math.max(0, conf.value.time - elapsed.value)));
const clockText = computed(() => `${String(Math.floor(clock.value / 60)).padStart(2, '0')}:${String(clock.value % 60).padStart(2, '0')}`);
const progressPct = computed(() => {
  const c = conf.value;
  const total = c.pairs;
  const left = leftPairs.value;
  return Math.max(0, Math.min(100, Math.round(((total - left) / total) * 100)));
});
// 提示条逻辑与 web 一致：观察期常显「快记住他们」；翻面后「把他们配对找出来」显示 FLIP_HINT_MS(2.6s) 就隐藏；
// 连击提示现在有自己的 .combo-tip 槽位（web 同款），阶段提示在连击期间让位（只留空占位，避免棋盘上下跳）
const FLIP_HINT_MS = 2600;
const showFlipHint = ref(true);
let flipHintTimer = null;
const comboTipText = computed(() => (comboTip.value ? t('mCombo').replace('{n}', comboTip.value) : ''));
// 同一条提示条靠切换两条同内容的关键帧名来重播（连击 1 → 2 → 3 时动画会跟着重播）
const comboTipPop = computed(() => (comboTip.value % 2 ? 'pop-a' : 'pop-b'));
const phaseHintText = computed(() => {
  if (comboTip.value) return '';
  if (phase.value === PREVIEW) return t('mHintRemember');
  if (phase.value === PLAY && showFlipHint.value) return t('mHintMatch');
  return '';
});
const BOARD_MAX_W = 690;      // 内容宽上限（卡片内宽）
const BOARD_GAP = 10;         // 牌与牌的间距
const BOARD_PAD = 8;          // 棋盘内边距（上下左右各 8）
// 牌是绝对定位、撑不起父级，棋盘高度必须自己算：上下各 8rpx 内边距 + 行数×(格宽+缝)
// 牌宽上限：web 用 EMOJI_MAX_W = 96px（麻将同一套）→ 96 × 1.908 ≈ 183rpx。
// 不加这个上限时第一关只有 3 列 → 牌宽 218rpx（≈114px），比 web 大得多 ✗
const MAX_TILE = 183;
const tileSize = computed(() => {
  const c = conf.value;
  const byW = Math.floor((BOARD_MAX_W - BOARD_GAP * (c.cols - 1) - BOARD_PAD * 2) / c.cols);
  return Math.min(MAX_TILE, byW);
});
// 棋盘宽度跟着牌走（不再固定 690）：3 列时 585rpx，靠 margin:auto 居中
const boardW = computed(() => BOARD_PAD * 2 + conf.value.cols * tileSize.value + BOARD_GAP * (conf.value.cols - 1));
// 麻将牌是竖牌（雪碧图 168/131 ≈ 1.282），emoji 是正方形
const TILE_RATIO = 168 / 131;
const tileH = computed(() => (mode.value === MODE_MAHJONG ? Math.round(tileSize.value * TILE_RATIO) : tileSize.value));
// 上下各 8rpx 内边距，行与行之间才有 gap（最后一行后面不留），这样卡片在棋盘里垂直居中
const boardH = computed(() => BOARD_PAD * 2 + conf.value.rows * tileH.value + BOARD_GAP * (conf.value.rows - 1));
const faceFont = computed(() => Math.max(28, Math.round(tileSize.value * 0.42)));
// 发牌时逐张错开（与麻将/扑克同一套「波浪式铺牌」）：延迟按「行 + 列」× 55ms。
// 牌是按 card.id 重建的，所以重开一局 / 恢复记录都会重播；这里不要引入会变化的 flag，
// 否则 animationDelay 一变动画就会整盘重播。
const dealDelay = (i) => {
  const cols = Math.max(1, conf.value.cols);
  const col = i % cols;
  const row = Math.floor(i / cols);
  return (row + col) * 55;
};

const cardStyle = (i) => {
  const c = conf.value;
  const gap = 10;
  const size = tileSize.value;
  const row = Math.floor(i / c.cols);
  const col = i % c.cols;
  return {
    width: size + 'rpx',
    height: tileH.value + 'rpx',
    left: 8 + col * (size + gap) + 'rpx',
    top: 8 + row * (tileH.value + gap) + 'rpx',
      // 安静恢复时不设延迟（配合 .no-deal 关掉动画）
      ...(silentRestore.value ? {} : { animationDelay: dealDelay(i) + 'ms' }),
  };
};

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function drawPool(pairs) {
  const pool = mode.value === MODE_MAHJONG ? MAHJONG_FACES : EMOJIS;
  return shuffle(pool).slice(0, pairs);
}

function save() {
  setRaw(stateKeyFor(mode.value), JSON.stringify({
    level: level.value,
    mode: mode.value,
    phase: phase.value,
    elapsed: elapsed.value,
    usedTime: usedTime.value,
    cards: cards.value.map(c => [c.item, c.matched ? 1 : 0]),
  }));
}

function restore() {
  const s = getJSON(stateKeyFor(mode.value));
  if (!s || !Array.isArray(s.cards) || !s.cards.length) return null;
  if (s.phase !== WON && s.phase !== OVER) return null;   // 只接胜负结算，局中存档重开本关
  return s;
}

function clearTimers() {
  clearInterval(previewTick); clearTimeout(previewTimer);
  clearInterval(playTick); clearTimeout(mismatchTimer); clearTimeout(matchTimer);
  clearTimeout(comboTimer); clearTimeout(comboTimerOut);
  previewTick = previewTimer = playTick = mismatchTimer = matchTimer = comboTimer = comboTimerOut = null;
}

function initLevel(lv, restored = null) {
  clearTimers();
  level.value = Math.max(1, lv);
  setRaw(levelKeyFor(mode.value), level.value);
  if (level.value > bestLevel.value) {
    bestLevel.value = level.value;
    setRaw(bestKeyFor(mode.value), bestLevel.value);
  }
  firstCard = null; lock = false; comboTip.value = 0; comboCount = 0;
  showFlipHint.value = true; clearTimeout(flipHintTimer);
  if (restored) {
      silentRestore.value = true;   // 恢复胜负存档：牌直接以终态出现，不播动画
    elapsed.value = restored.elapsed || 0;
    usedTime.value = restored.usedTime || 0;
    phase.value = restored.phase;
    cards.value = restored.cards.map(([item, matched]) => ({
      id: ++cardId, item, matched: !!matched,
      // 失败结算摊牌：没消掉的亮着（时间到要能复盘）
      flipped: !matched && restored.phase === OVER,
    }));
    return;
  }
    silentRestore.value = false;
  setRaw(stateKeyFor(mode.value), '');
  elapsed.value = 0;
  usedTime.value = 0;
  const c = conf.value;
  const pool = drawPool(c.pairs);
  cards.value = shuffle([...pool, ...pool]).map(item => ({ id: ++cardId, item, flipped: true, matched: false }));
  phase.value = PREVIEW;
  previewLeft.value = c.preview;
  previewTick = setInterval(() => { previewLeft.value = Math.max(0, previewLeft.value - 1); }, 1000);
  previewTimer = setTimeout(endPreview, Math.max(0, previewLeft.value) * 1000);
}

function endPreview() {
  if (phase.value !== PREVIEW) return;
  clearInterval(previewTick); clearTimeout(previewTimer);
  phase.value = PLAY;
  cards.value = cards.value.map(c => ({ ...c, flipped: false }));
  showFlipHint.value = true;
  clearTimeout(flipHintTimer);
  flipHintTimer = setTimeout(() => { showFlipHint.value = false; }, FLIP_HINT_MS);
  elapsed.value = 0;
  playTick = setInterval(() => {
    elapsed.value += 1;
    if (elapsed.value >= conf.value.time) loseLevel();
  }, 1000);
  save();
}

function onCardClick(card) {
  if (phase.value !== PLAY || lock || card.matched || card.flipped) return;
  card.flipped = true;
  if (!firstCard) { firstCard = card; return; }
  if (firstCard.item === card.item) {
      // 配对成功：等第二张的翻面动画播完（≈470ms）再让两张一起闪。
      // ⚠️ **不要 lock**：玩家手很快，闪烁期间点别的卡片必须照常有反应 ——
      // 这两张牌已经 flipped=true（onCardClick 里本来就会挡住），不需要全局锁。
      const prev = firstCard;
      firstCard = null;
      matchTimer = setTimeout(async () => {
        matchTimer = null;
        prev.matched = true;
        card.matched = true;
        // 先等连击提示条渲染 + 烟花发声（burstAtElement 内部先 playFirework），
        // 再播 elimination —— sfx 的规则是「烟花后 240ms 内不叠 elimination」
        await registerClear();
        playElimination();
        if (cards.value.every(c => c.matched)) {
          usedTime.value = elapsed.value;
          clearInterval(playTick);
          save();
          setTimeout(win, 600);
        } else save();
      }, MATCH_FLIP_MS);
  } else {
    breakCombo();
    lock = true;
    const prev = firstCard;
    firstCard = null;
    mismatchTimer = setTimeout(() => { prev.flipped = false; card.flipped = false; lock = false; }, FLIP_BACK_MS);
  }
}

// 返回 Promise：连击分支要等提示条渲染出来（nextTick）再量它的位置，调用方 await 后才知道烟花已发声
async function registerClear() {
  const now = Date.now();
  const chained = lastClearAt > 0 && !comboBroken && now - lastClearAt < COMBO_MS;
  lastClearAt = now;
  comboBroken = false;
  comboCount = chained ? comboCount + 1 : 1;
  clearTimeout(comboTimer); clearTimeout(comboTimerOut);
  // 只有真的连上了（≥2）才弹提示 + 炸烟花（与 web 的 showCombo 同款条件）
  if (comboCount >= 2) {
    comboTip.value = comboCount;
    comboTimer = setTimeout(() => { comboTip.value = 0; }, COMBO_MS);
    // 提示条是刚渲染的：等一帧再量，喷发点才是「提示条中心往下 30px」（web 的 comboOrigin）
    await nextTick();
    // 强度 / 粒子数照 web：Math.min(3, 1 + (n-2)*0.6) / Math.min(44, 12 + n*4)
    burstAtElement('.combo-tip', Math.min(3, 1 + (comboCount - 2) * 0.6), {
      count: Math.min(44, 12 + comboCount * 4),
    });
  }
}
function breakCombo() { comboBroken = true; lastClearAt = 0; comboCount = 0; comboTip.value = 0; }

function win() {
  if (phase.value !== PLAY) return;
  phase.value = WON;
  justWon.value = true;
  clearTimeout(wonTimer);
  wonTimer = setTimeout(() => { justWon.value = false; }, 4000);
  playWin();
  save();
}

function loseLevel() {
  if (phase.value !== PLAY) return;
  clearInterval(playTick);
  phase.value = OVER;
  // 摊牌：把剩下的牌全翻正面
  cards.value = cards.value.map(c => (c.matched ? c : { ...c, flipped: true }));
  playLose();
  save();
}

function replayLevel() {
  confirming.value = false;
  initLevel(level.value);
}
// 新游戏：清掉**当前牌面**的闯关记录（最高关），从第 1 关重新开始（另两种牌面的记录不动，与 web 一致）
function startNewGame() {
  confirming.value = false;
  setRaw(bestKeyFor(mode.value), '');
  bestLevel.value = 1;
  initLevel(1);
}
function nextLevel() { initLevel(level.value + 1); }

function toggleMode() {
  mode.value = mode.value === MODE_MAHJONG ? MODE_EMOJI : MODE_MAHJONG;
  setRaw(`${PREFIX}mode`, String(mode.value));
  bestLevel.value = Math.max(1, +(getRaw(bestKeyFor(mode.value)) || 1));
  const restored = restore();
  initLevel(restored ? restored.level : +(getRaw(levelKeyFor(mode.value)) || 1), restored);
}

onMounted(() => {
  bestLevel.value = Math.max(1, +(getRaw(bestKeyFor(mode.value)) || 1));
  const restored = restore();
  initLevel(restored ? restored.level : +(getRaw(levelKeyFor(mode.value)) || 1), restored);
});
onUnmounted(clearTimers);

const helpOpen = ref(false);
// 「新游戏」二次确认（取消 / 重玩本关 / 确定重来，与 web 的 shared/ConfirmDialog 一致）
const confirming = ref(false);

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
@keyframes card-in {
  from { opacity: 0; transform: scale(0.7); }
  to { opacity: 1; transform: scale(1); }
}
.page {
  padding: 36rpx 24rpx 48rpx; display: flex; flex-direction: column; align-items: center; gap: 36rpx; background: #f0f2f5; }
.score-area {
  position: relative;
  width: 690rpx;
  display: flex;
  align-items: center;
  padding: 0 19rpx;
  background: #fff;
  overflow: hidden;
}
.stat { flex: 1; display: flex; flex-direction: column; align-items: center; }
.stat > .label { font-size: 20rpx; color: #8a8f99; }
.stat > .value { font-size: 34rpx; font-weight: 800; color: #23804e; margin-top: 2rpx; }
.divider { width: 2rpx; height: 40rpx; background: #e6e8eb; }
.progress { position: absolute; left: 0; right: 0; bottom: 0; height: 6rpx; background: #eef0f3; }
.progress-fill { height: 100%; background: #23804e; transition: width 0.2s ease; }
.opt-area {
  width: 690rpx;
  display: flex;
  align-items: center;
  gap: 36rpx;
  padding: 0 19rpx;
  background: #fff;
}
.opt-half { flex: 1.3; display: flex; align-items: center; justify-content: center; }
.opt-third { flex: 1.5; display: flex; align-items: center; justify-content: center; }
.info { font-size: 22rpx; color: #8a8f99; }
.timer { font-size: 28rpx; font-weight: 800; color: #23804e; }
.timer.warn { color: #d33; }
.btn { margin: 0; padding: 0 20rpx; height: 64rpx; line-height: 64rpx; border-radius: 14rpx; background: #23804e; color: #fff; font-size: 22rpx; font-weight: 700; }
.phase-tip {
  align-self: center;
  visibility: visible;
  /* 固定高度：文案消失时只隐藏可见性，高度不变，下面的棋盘不会上跳 */
  height: 56rpx;
  line-height: 44rpx;
  box-sizing: border-box;
  padding: 6rpx 22rpx;
  border-radius: 14rpx;
  background: #fff;
  border: 2rpx solid #e6e8eb;
  color: #333;
  font-size: 24rpx;
  font-weight: 600;
  box-shadow: 0 4rpx 12rpx rgba(0,0,0,0.06);
}
.phase-tip.empty { visibility: hidden; }
/* 游戏区：只负责给棋盘 + 连击提示条做定位上下文（尺寸 = 棋盘，由内联 style 给） */
.game-area { position: relative; margin: 0 auto; }
.board { position: relative; margin: 0 auto; border-radius: 27rpx; background: #3a4a3f; overflow: hidden; }
.tile {
  /* 3D 翻转舞台（与 Emoji 镜像同一套）：透视 + 正反两面常驻 */
  perspective: 700rpx;
  position: absolute; animation: card-in 0.28s ease both; border-radius: 12rpx; background: transparent;
  transition: opacity 0.18s ease, transform 0.18s ease; }
/* 面：各自带底色，翻转时颜色跟着牌一起转（不再是「先变色再翻」） */
.face {
  /* 与 Emoji 镜像的 .face **逐条一致**（longhand 过渡 + 不用 overflow:hidden）：
     overflow:hidden 会在斜角时透出另一面的像素，看起来就是「翻面时另一面闪现」✗ */
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border-radius: 12rpx;
  line-height: 1;
  transform: rotateY(0deg);
  transition-property: transform, opacity;
  transition-duration: 0.46s, 0.01s;
  transition-timing-function: ease-in-out, linear;
  transition-delay: 0s, 0.225s;
}
  /* 真机在翻面收尾时偶尔会闪一下：两面都在 3D 里旋转，合成层在过渡结束重绘时可能把「背面」
     多画一帧。下面四条是稳妥的兜底（模拟器看不出，真机有效）：
       · backface-visibility: hidden —— 背朝观众的那一面永远不画（即使透明度切换晚一帧也看不到镜像）；
       · will-change / translateZ(0) —— 两面各自常驻一个合成层，过渡结束不再重新栅格化；
       · opacity 不参与 3D 变换，避免和 transform 抢同一个合成属性。 */
  .face {
    -webkit-backface-visibility: hidden;
    backface-visibility: hidden;
    -webkit-transform: translateZ(0);
    will-change: transform, opacity;
  }

/* 默认是**背面朝上**（未翻开），.up 才是正面 —— 之前把两面写反了：
   观察期 / 翻开时反而看到牌背，游戏时却看到牌面 ✗ */
.face-back { transform: rotateY(0deg); opacity: 1; background: #23804e; color: #fff; }
.face-front { background: #f7f4ee; }
.back-ico { color: #fff; }
.face-front { transform: rotateY(180deg); opacity: 0; }
.tile.up .face-back { transform: rotateY(180deg); opacity: 0; }
.tile.up .face-front { transform: rotateY(0deg); opacity: 1; }
.tile.matched { animation: match-blink 0.52s ease forwards; }
/* 恢复胜负存档：牌直接以终态出现 —— 不播发牌 card-in，已消除的牌也不重播闪烁 */
.board.no-deal .tile { animation: none; }
.board.no-deal .tile.matched { animation: none; opacity: 0; transform: none; }
@keyframes match-blink {
  0% { opacity: 1; transform: scale(1); }
  30% { opacity: 0.15; transform: scale(1.06); }
  60% { opacity: 1; transform: scale(1.06); }
  100% { opacity: 0; transform: scale(0); }
}
.tile.blink { opacity: 0.4; }
.face-back { color: #fff; }   /* 与 web 的 .back-face 一致：绿底白图标 */
/* 麻将牌背：与 web 的 MahjongBack 一致的绿色纹理（没有图片就用渐变近似） */
.tile.mjback .face-back {
  background: linear-gradient(145deg, #2f8f5b, #1d6b3f);
  box-shadow: inset 0 0 0 4rpx rgba(255, 255, 255, 0.22);
}
.emoji { line-height: 1; }
.mj { width: 100%; height: 100%; }
/* 连击提示（web 的 .combo-tip）：落在棋盘上方那条空隙里，探出棋盘的一截不会被 .board 裁掉。
   高度 36rpx ≈ 18px、22rpx 字号、圆角胶囊、主色底白字 —— 比阶段提示条小一号，不抢戏 */
.combo-tip {
  position: absolute;
  left: 50%;
  top: -30rpx;
  z-index: 5;
  height: 36rpx;
  line-height: 36rpx;
  box-sizing: border-box;
  padding: 0 20rpx;
  border-radius: 999rpx;
  background: #23804e;
  color: #fff;
  font-size: 22rpx;
  font-weight: 800;
  white-space: nowrap;
  pointer-events: none;
  transform: translateX(-50%);
  animation: combo-pop-a 2.5s ease forwards;   /* 停留时长 = COMBO_MS，收得干净 */
}
/* 连击数变化时切一条同内容的关键帧，让「弹入」重播（§零.15：布尔开关不灵，用计数/换名） */
.combo-tip.pop-b { animation-name: combo-pop-b; }
@keyframes combo-pop-a {
  0% { opacity: 0; transform: translate(-50%, 16rpx) scale(0.6); }
  8% { opacity: 1; transform: translate(-50%, 0) scale(1.12); }
  16%, 88% { opacity: 1; transform: translate(-50%, 0) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -16rpx) scale(0.96); }
}
@keyframes combo-pop-b {
  0% { opacity: 0; transform: translate(-50%, 16rpx) scale(0.6); }
  8% { opacity: 1; transform: translate(-50%, 0) scale(1.12); }
  16%, 88% { opacity: 1; transform: translate(-50%, 0) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -16rpx) scale(0.96); }
}
.result { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14rpx; border-radius: 20rpx; background: rgba(250,248,239,0.92); }
.result-title { font-size: 40rpx; font-weight: 800; color: #222; }
.result-sub { font-size: 24rpx; color: #776e65; }
.result-btns {
  display: flex;
  align-items: center;
  justify-content: center;   /* 两颗按钮整体居中 */
  gap: 14rpx;
  width: 100%;
}
.result-btns .btn {
  flex: 0 0 auto;            /* 自然宽度，不平分整行 */
  min-width: 0;
  padding: 0 24rpx;
}
.hint { font-size: 22rpx; color: #8a8f99; }
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
