<template>
  <div class="wrapper">
    <TopHeader @onScoreReset="onScoreReset" />

    <!-- ① 分数区：最长连胜 / 当前连胜 / 剩余牌数 -->
    <div class="card score-area">
      <div class="stat">
        <span class="stat-label">{{ i18n('bestStreak') }}</span>
        <span class="stat-value">{{ best }}</span>
      </div>
      <div class="divider" />
      <div class="stat">
        <span class="stat-label">{{ i18n('streak') }}</span>
        <span class="stat-value">{{ streak }}</span>
      </div>
      <div class="divider" />
      <div class="stat">
        <span class="stat-label">{{ i18n('wall') }}</span>
        <span class="stat-value">{{ wall.length }}</span>
      </div>
    </div>

    <!-- ② 按钮区：左侧固定文案「恭喜发财」+ 新游戏（比例与 Emoji 下坠一致） -->
    <div class="card opt-area">
      <!-- 左格：本局缺哪个花色（没有缺就不显示）—— 原来这里是「恭喜发财」，用户要求换成这个 -->
      <div class="opt-half">
        <span v-if="omitText" class="omit-note">{{ omitText }}</span>
      </div>
      <div class="divider" />
      <div class="start-wrapper">
        <button class="game-icon" @click="onNewGameClick">{{ i18n('start') }}</button>
      </div>
    </div>

    <div class="game-area">
      <!-- ③ 牌墙：背靠上码两层，正面朝下；新牌从这里摸 -->
      <div class="card wall-card">
        <div class="wall-stack" :style="{ width: stackW + 'px', height: stackH + 'px' }">
          <span
            v-for="(b, i) in wall"
            :key="b.id"
            class="tile-back"
            :class="{ deal: dealing }"
            :style="backStyle(i)"
          />
        </div>
      </div>

      <!-- ④ 出牌区：打出去的牌正面朝上排在这里；杠牌摆在**右下角** -->
      <div class="card discard-card">
        <!-- 前两行：打出去的牌（正面朝上、按顺序） -->
        <div class="discard-row">
          <MahjongTile
            v-for="t in discards"
            :key="t.id"
            :value="t.value"
            :suit="t.suit"
            class="discard-tile"
            :class="{ 'fly-hidden': t.id === hiddenTileId }"
            :data-tile="t.id"
            :style="discardVars"
          />
          <span v-if="!discards.length" class="discard-empty">{{ i18n('hint') }}</span>
        </div>
        <!-- 第三行：杠牌（右对齐） -->
        <div class="kong-row">
          <span
            v-for="(k, ki) in kongs"
            :key="ki"
            class="kong-set"
          >
            <MahjongTile
              v-for="n in 4"
              :key="n"
              :value="k.value"
              :suit="k.suit"
              class="discard-tile"
              :style="discardVars"
            />
          </span>
        </div>
      </div>

      <!-- ⑤ 手牌区：14 张，两行排列；刚摸到的牌先在最右侧，打出一张后按顺序归位。
           手里凑齐 4 张一样的牌时，这 4 张会被框成一个「杠组」，并在上方浮出 tooltip 让玩家选是否杠牌 -->
      <div ref="handCardEl" class="card hand-card" :style="{ '--hand-tile-w': handTileW }">
        <template v-for="(it, i) in displayItems" :key="it.kind === 'kong' ? 'kong-' + it.key : it.tile.id">
          <div
            v-if="it.kind === 'kong'"
            class="kong-group"
            :class="{ drawn: it.tiles.some(t => t.id === drawnId), framing: !dealing }"
            :style="slotStyle(i)"
          >
            <button
              v-for="t in it.tiles"
              :key="t.id"
              class="hand-tile"
              :class="{ celebrate: celebrating, deal: dealing, 'fly-hidden': t.id === hiddenTileId }"
              :style="{ '--i': i }"
              :data-tile="t.id"
              :disabled="phase !== PLAY || busy"
              @click="playTileId(t.id)"
            >
              <MahjongTile :value="t.value" :suit="t.suit" :style="handVars" />
            </button>
            <!-- tooltip：浮在这 4 张上方，让玩家选「杠」（不想杠就点牌打出去，tooltip 随之消失） -->
            <!-- tooltip 等发牌波浪走完再浮出来：否则牌还没显形，框和气泡就先摆在那儿了 -->
            <button
              v-if="kongOpenKey === it.key && phase === PLAY && it.tiles.length === 4 && !dealing"
              class="kong-tip"
              :class="{ below: kongTipBelow }"
              @click="doKong(it)"
            >
              {{ i18n('kong') }}
            </button>
          </div>
          <button
            v-else
            class="hand-tile"
            :class="{ drawn: it.tile.id === drawnId, celebrate: celebrating, deal: dealing, 'fly-hidden': it.tile.id === hiddenTileId }"
            :style="[{ '--i': i }, slotStyle(i)]"
            :data-tile="it.tile.id"
            :disabled="phase !== PLAY || busy"
            @click="playTileId(it.tile.id)"
          >
            <MahjongTile :value="it.tile.value" :suit="it.tile.suit" :style="handVars" />
          </button>
        </template>
      </div>
      <!-- 胡牌 / 摸完的浮层：盖在牌墙上（.game-area 是定位上下文） -->
      <div v-if="phase !== PLAY" class="result" :class="phase === WON ? 'win' : 'lose'">
        <div class="result-title">{{ phase === WON ? '🎉 ' + i18n('win') : '🀄 ' + i18n('lose') }}</div>
        <div class="result-streak">🔥 {{ i18n('streak') }} {{ streak }}</div>
      <!-- 保留连胜继续打：走 dealRound（按当前连胜给更难的档，见 board.js 的 RAMP），
           不走会清连胜的 startNewGame（那只是「新游戏」二次确认后的动作） -->
      <button class="game-icon" @click="dealRound">{{ i18n('nextGame') }}</button>
      </div>
    </div>

    <!-- 新游戏要二次确认：会清掉当前连胜、从头开始 -->
    <ConfirmDialog
      :show="confirming"
      :title="i18n('start')"
      :message="i18n('newGameConfirm')"
      :confirm-text="i18n('confirmOk')"
      :cancel-text="i18n('cancel')"
      :show-replay="false"
      @confirm="startNewGame"
      @cancel="confirming = false"
    />

    <!-- 飞牌动画用的临时元素（摸牌 / 打牌各一段） -->
    <MahjongTile
      v-if="flying"
      :value="flying.tile.value"
      :suit="flying.tile.suit"
      class="flying"
      :style="flyingVars"
    />

  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue';

import TopHeader from '@/components/TopHeader.vue';
import ConfirmDialog from '@/shared/ConfirmDialog.vue';
import confetti from '@/shared/confetti';
import { i18n } from '@/shared/i18n';
import MahjongTile from '@/games/mahjong/MahjongTile.vue';
import { isWin, kongOptions, newRoundSafe, sameTile, sortTiles, tileKey, HAND_SIZE } from './board';

const PLAY = 'play';
const WON = 'won';
const LOST = 'lost';

const KEYS = {
  state: '__solo__state',
  streak: '__solo__streak',
  best: '__solo__best_streak',
};

const readInt = (key, dflt = 0) => {
  const v = Number(localStorage.getItem(key));
  return Number.isFinite(v) && v >= 0 ? v : dflt;
};
const write = (key, value) => { try { localStorage.setItem(key, String(value)); } catch { /* 隐私模式忽略 */ } };

// 牌上都挂一个 id：v-for 的 key、飞牌动画找元素、以及「刚摸到的那张」都靠它
let nextId = 1;
const withIds = tiles => tiles.map(t => ({ suit: t.suit, value: t.value, id: nextId++ }));
const validTile = t => t && typeof t === 'object'
  && ['m', 's', 'p', 'z'].includes(t.suit)
  && Number.isInteger(t.value) && t.value >= 1 && t.value <= (t.suit === 'z' ? 7 : 9)
  && Number.isInteger(t.id) && t.id > 0;

// ---------- 状态（**在 setup 里就恢复**，首帧即最终样子；所有恢复要用到的 ref 都声明在 restoreState 之前） ----------
const hand = ref([]);
const drawnId = ref(null);       // 刚摸到的牌：显示时永远排最右，打出一张后清空 → 手牌按顺序重排
const wall = ref([]);
const discards = ref([]);
const phase = ref(PLAY);
const busy = ref(false);         // 动画中不接受点击
const celebrating = ref(false);  // 胡牌后「挨个跳一下」的那一段
const confirming = ref(false);   // 「新游戏」的二次确认
const dealing = ref(false);      // 发牌波浪动画进行中（只有发新牌才播，恢复存档不播）
const kongs = ref([]);           // 已经杠出去的牌：[{ suit, value, count: 4 }]
const omitSuit = ref(null);      // 本局缺哪个花色（null = 三个花色都在）
// ↑ 必须声明在 restoreState() **之前**：它内部要给 omitSuit.value 赋值，晚了就是 TDZ，
//   抛错被 catch 吞掉 → 判定「无存档」→ 现象是「有存档时重进反而重开一局、缺门提示消失」。
const kongOpenKey = ref(null);   // 哪个杠组的 tooltip 正开着（tileKey）
const flying = ref(null);        // { tile, x, y, dx, dy, dur, scale, w }
const hiddenTileId = ref(null);  // 飞行中的那张牌：它在落点处的实体先藏起来（FLIP 不能露馅）
const streak = ref(readInt(KEYS.streak, 0));
const best = ref(readInt(KEYS.best, 0));

function restoreState() {
  try {
    const s = JSON.parse(localStorage.getItem(KEYS.state) || 'null');
    if (!s || !Array.isArray(s.hand) || s.hand.length !== HAND_SIZE) return false;
    if (!Array.isArray(s.wall)) return false;
    if (![...s.hand, ...s.wall].every(validTile)) return false;
    hand.value = s.hand.map(t => ({ suit: t.suit, value: t.value, id: t.id }));
    kongs.value = Array.isArray(s.kongs)
      ? s.kongs.filter(k => k && ['m', 's', 'p', 'z'].includes(k.suit) && Number.isInteger(k.value)).map(k => ({ suit: k.suit, value: k.value, count: 4 }))
      : [];
    wall.value = s.wall.map(t => ({ suit: t.suit, value: t.value, id: t.id }));
    discards.value = Array.isArray(s.discards) ? s.discards.filter(validTile).map(t => ({ suit: t.suit, value: t.value, id: t.id })) : [];
    drawnId.value = Number.isInteger(s.drawnId) ? s.drawnId : null;
    phase.value = s.phase === WON ? WON : s.phase === LOST ? LOST : PLAY;
    // 缺门也要存：不然中途刷新回来「本局没有X」就没了（实测左格变空）
    omitSuit.value = ['m', 's', 'p'].includes(s.omit) ? s.omit : null;
    nextId = Math.max(1, ...[...hand.value, ...wall.value, ...discards.value].map(t => t.id)) + 1;
    return true;
  } catch (e) {
    console.warn('[solo] 存档恢复失败，已按新局重开：', e);
    return false;
  }
}
const restored = restoreState();

const save = () => {
  try {
    localStorage.setItem(KEYS.state, JSON.stringify({
      hand: hand.value, wall: wall.value, discards: discards.value, kongs: kongs.value,
      omit: omitSuit.value, drawnId: drawnId.value, phase: phase.value,
    }));
  } catch { /* 隐私模式忽略 */ }
};

// 手牌显示项：除「刚摸到的那张」之外按顺序排列（刚摸的永远在最右），
// 并且把**手里凑齐 4 张一样**的那 4 张抽成一个「杠组」——不管它们原本排在哪，
// 包括刚摸到的那张补齐第 4 张的情况。
const displayItems = computed(() => {
  const drawn = hand.value.find(t => t.id === drawnId.value);
  const rest = sortTiles(hand.value.filter(t => t.id !== drawnId.value));
  const ordered = drawn ? [...rest, drawn] : rest;
  const counts = new Map();
  for (const t of ordered) { const k = tileKey(t); counts.set(k, (counts.get(k) || 0) + 1); }
  const items = []; const taken = new Set();
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
});

// 手牌槽位（与 displayItems 同序）：grid 只有 7 列，而杠组是**整块 4 列** —— 它一旦落在行中间，
// 行尾只剩 3 格就装不下，浏览器的自动布局会把它整体挪到下一行并**在上一行留下空洞**，
// 于是 14 槽摊成 3 行（用户报的「杠牌换行又出现了」；我上一版只把 padding 去掉、又只测了
// 「杠在最前 / 中段」两个位置，都没踩到）。
// 现在显式排：**第 i 个杠组占第 i 行行首**，其余单牌按显示顺序逐行填空位 ——
// 1 个杠 = 4+3 / 7、2 个杠 = 4+3 / 4+3，都恰好 7+7（3 个杠才需要 3 行，14 张里极罕见）。
const COLS_PER_ROW = 7;
const handSlots = computed(() => {
  const items = displayItems.value;
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
  let row = 1, col = 1;
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
});
const slotStyle = i => {
  const s = handSlots.value[i];
  if (!s) return {};
  return { gridRow: String(s.row), gridColumn: s.span > 1 ? `${s.col} / span ${s.span}` : String(s.col) };
};

// tooltip 朝上还是朝下：杠组在手牌**下排**时翻到下方 —— 否则它会盖住上排的牌，容易误点
//（用户要求「上排的杠牌 tooltip 出现在上方、下排的出现在下方」）。按杠组中心在手牌卡片的上/下半区判断。
const kongTipBelow = ref(false);
function measureTipSide() {
  const g = document.querySelector('.kong-group');
  const card = handCardEl.value;
  if (!g || !card) return;
  const gr = g.getBoundingClientRect();
  const cr = card.getBoundingClientRect();
  kongTipBelow.value = (gr.top + gr.height / 2 - cr.top) > cr.height / 2;
}

// 哪个杠组的 tooltip 该开着：手里有可杠的牌就自动浮出来（玩家点牌打出去后它自然消失）
const kongOpts = computed(() => kongOptions(hand.value).map(t => tileKey(t)));
watch(kongOpts, opts => {
  if (!opts.length) { kongOpenKey.value = null; return; }
  if (!opts.includes(kongOpenKey.value)) kongOpenKey.value = opts[0];
}, { immediate: true });

// 手牌一变（摸牌 / 打牌 / 杠牌）就重量一次 tooltip 该朝哪边
watch(displayItems, async () => { await nextTick(); measureTipSide(); }, { immediate: true });

// 手牌单张宽度：**必须用实测像素**，不能用 `calc((100% - …) / 7)`。
// 因为杠组是把 4 张包在一个 div 里，里面的 `100%` 会按**杠组自身的宽度**解析 → 4 张牌直接塌成竖条
//（实测杠组只有 7px 宽、51px 高）。这里量一次手牌卡片的内宽，7 张 + 6 个间隙 + 左右 8px 内边距。
const handCardEl = ref(null);
const handTileW = ref('44px');
function measureHand() {
  const el = handCardEl.value;
  if (!el) return;
  const inner = el.clientWidth - 16;                 // 卡片左右各 8px 内边距
  const w = Math.max(24, Math.floor((inner - 6 * 5) / 7));
  handTileW.value = `${w}px`;
  nextTick(measureTipSide);
}

// 牌堆：**每张都画出来**（20 张以内），从正面偏下往侧上方看的两层码放 ——
// 每层往右上错一点，摸走一张就少一张，牌堆会肉眼可见地矮下去/窄下去。
const BACK_W = 26;                 // 牌背尺寸（比原来 20×26 大一圈，看得清条纹）
const BACK_H = 33;
const BACK_GAP = 1;                // 相邻牌背之间的缝（含左右各 1px 描边，视觉间隔 1px）
const BACK_STEP = BACK_W + 2 + BACK_GAP;   // 26 + 左右各 1px 描边 + 缝 = 29
const LAYER_DX = 2;                // 上层往右错（很小，只为看出是两层，不要参差不齐）
const LAYER_DY = 4;                // 并往上错 → 微微摞起来的感觉就够
const STACK_COLS = 10;
const stackW = computed(() => Math.min(wall.value.length, STACK_COLS) * BACK_STEP + LAYER_DX + BACK_GAP);
const stackH = computed(() => BACK_H + LAYER_DY + 3);
const backStyle = i => {
  const col = i % STACK_COLS;
  const layer = Math.floor(i / STACK_COLS);       // 0 = 下层，1 = 上层
  return {
    left: `${col * BACK_STEP + layer * LAYER_DX}px`,
    top: `${LAYER_DY - layer * LAYER_DY}px`,
    zIndex: i,
    '--i': i,          // 发牌波浪的序号（左→右）
  };
};
// i18n 不支持插值，这里直接拼（omitSuit 已在上面的状态区声明）
const omitText = computed(() => (omitSuit.value ? i18n('omit') + i18n(`suits.${omitSuit.value}`) : ''));

// ---------- 尺寸（雪碧图牌面长宽比 131:168） ----------
const TILE_RATIO = 168 / 131;      // 雪碧图每格 131×168
const handVars = { '--mj-w': '100%', '--mj-h': '100%' };       // 尺寸由 .hand-tile 的 width + aspect-ratio 决定
// 出牌区/杠区的牌**本身就是 flex item**：给它 `--mj-h: 100%` 是循环依赖，会被 flex 行拉满高度
//（实测 26px 宽被拉成 71px 高）。这里直接用像素，不走 aspect-ratio。
const discardVars = { '--mj-w': 'var(--small-tile-w)', '--mj-h': 'var(--small-tile-h)' };
const flyingVars = computed(() => {
  const f = flying.value;
  if (!f) return {};
  return {
    '--mj-w': `${f.w}px`,        // 用出发牌实测的像素宽度：fixed 元素没有可继承的宽度
    '--mj-h': `${Math.round(f.w * TILE_RATIO)}px`,
    '--x': `${f.x}px`,
    '--y': `${f.y}px`,
    '--dx': `${f.dx}px`,
    '--dy': `${f.dy}px`,
    '--dur': `${f.dur}ms`,
    '--scale': f.scale,
  };
});

// ---------- 动画：飞一张牌（fixed 定位 + keyframes，位移用 CSS 变量，见分册） ----------
const centerOf = el => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};
const elOfTile = id => document.querySelector(`[data-tile="${id}"]`);
// 摸牌要从**一张牌背**起飞：量整个 .wall-stack 会得到一个 200px 宽的元素，飞出来像一张巨牌（用户反馈「放大的效果」）
const wallAnchor = () => document.querySelector('.wall-card .tile-back') || document.querySelector('.wall-stack') || document.querySelector('.wall-card');
const discardAnchor = () => document.querySelector('.discard-card');
const kongAnchor = () => document.querySelector('.kong-row') || document.querySelector('.discard-card');
// 统一的 FLIP：量出**目标格子的真实位置**，藏起那格的实体，再让替身从源位置飞过去。
// 尺寸交给关键帧从「源宽」渐变到「目标宽」（scale = 目标宽 / 源宽）——
// 两端尺寸不一样时，替身不缩放就会在换回实体的一瞬间跳一下（摸牌实测：替身 28px、实体 42px）。
async function flyToTile(tile, source, targetSelector, dur, commit) {
  const from = source instanceof Element ? rectOf(source) : source;
  if (!from) { commit(); return; }
  // ⚠️ **先藏、再提交**：`hiddenTileId` 必须在 `commit()` 之前设好，目标格子渲染出来的
  // **第一帧**就是隐形的。第一版是「先 commit → nextTick → 查元素 → 再藏」，中间会露出
  // 1~2 帧真实牌：于是「飞过来的替身」和「手牌区先冒出来的那张」对不上 ——
  // 用户报的「有明显时间差、不像同一张牌」就是这个。
  hiddenTileId.value = tile.id;
  commit();
  await nextTick();
  const el = document.querySelector(targetSelector);
  if (el) {
    const to = rectOf(el);
    await fly(tile, from, to, dur, to.w / (from.w || 40));
  }
  hiddenTileId.value = null;
}
// 两种写法都支持：给元素（内部量中心）或直接给矩形（出牌用 FLIP，需要精确落点）
async function fly(tile, from, to, dur, scale) {
  if (!from || !to) return;
  const a = from instanceof Element ? centerOf(from) : { x: from.x, y: from.y };
  const b = to instanceof Element ? centerOf(to) : { x: to.x, y: to.y };
  const w = (from instanceof Element ? from.getBoundingClientRect().width : from.w) || 40;
  flying.value = { tile, x: a.x, y: a.y, dx: b.x - a.x, dy: b.y - a.y, dur, scale, w };
  await new Promise(r => setTimeout(r, dur));
  flying.value = null;
}
const rectOf = el => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
};

// ---------- 摸一张（打牌后、杠牌后都走这里） ----------
async function drawOne() {
  if (!wall.value.length) { lose(); return; }   // 进函数时就没牌了（理论上抽不出牌）
  // 先从牌墙飞到「手牌最右侧」，落位后就停在那（先在最右，不参与排序）。
  // 用 FLIP：替身尺寸从一张牌背（28px）渐变到手牌格（42px），实体在飞行期间藏起来 ——
  // 否则替身落地后换回更大的实体，看起来就是「闪一下才落位」。
  const fromBack = wallAnchor();
  const next = wall.value[0];
  await flyToTile(next, fromBack, `.hand-card [data-tile="${next.id}"]`, 400, () => {
    wall.value = wall.value.slice(1);
    hand.value = [...hand.value, next];
    drawnId.value = next.id;
    save();
  });

  if (isWin(hand.value, kongs.value.length)) {
    await celebrateWin();
    return;
  }
  // 摸完最后一张还没胡 → 稍等一下直接出失败提示（用户要求：不用等玩家再打出去）
  if (!wall.value.length) {
    await new Promise(r => setTimeout(r, 350));
    lose();
  }
}

/** 胡牌收尾：① 手牌排整齐 ② 每张挨个跳一下 ③ 再给胜利提示 */
async function celebrateWin() {
  // 胡牌：① 先把手牌排整齐（清掉 drawnId，刚摸的那张归位）
  drawnId.value = null;
  await nextTick();
  // ② 每张牌挨个跳一下（间隔 55ms）
  celebrating.value = true;
  await new Promise(r => setTimeout(r, 55 * hand.value.length + 450));
  celebrating.value = false;
  // ③ 再给胜利提示
  phase.value = WON;
  streak.value += 1;
  best.value = Math.max(best.value, streak.value);
  write(KEYS.streak, streak.value);
  write(KEYS.best, best.value);
  save();
  confetti();
}

/** 本局结束：当前连胜清零（最长连胜作为记录保留） */
function lose() {
  // 失败就停在 lost 状态并**存进存档**：退出重进还是这个失败局面，由玩家自己点「再来一局」开新局。
  phase.value = LOST;
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
  // 出牌用 **FLIP**：先记下手牌里这张的位置 → 提交（它出现在出牌区的真实格子上）→
  // 量到那个格子的精确位置 → 让一张「飞行牌」从手牌位置飞过去，同时把实体藏起来。
  // 第一版是「飞到出牌区中心」，落位后实体在它自己的格子里 → 会看到明显跳一下。
  const from = elOfTile(tile.id);
  const fromRect = from ? rectOf(from) : null;
  // 同样「先藏后提交」：手牌里那张（源）和被放进出牌区的那张（落点）都立刻隐形，
  // 由替身顶着飞过去 —— 逐步缩小落位。
  await flyToTile(tile, fromRect, `.discard-card [data-tile="${tile.id}"]`, 380, () => {
    hand.value = hand.value.filter(t => t.id !== tile.id);
    discards.value = [...discards.value, tile];
    drawnId.value = null;
    save();
  });
  await drawOne();
  busy.value = false;
}

// ---------- 杠牌：4 张一样的牌出去、进右下角的杠区，再从牌墙补摸一张 ----------
async function doKong(item) {
  if (phase.value !== PLAY || busy.value) return;
  const four = hand.value.filter(t => tileKey(t) === item.key);
  if (four.length < 4) return;
  busy.value = true;
  kongOpenKey.value = null;
  await fly(four[0], elOfTile(four[0].id), kongAnchor(), 380, 0.7);

  hand.value = hand.value.filter(t => tileKey(t) !== item.key);
  kongs.value = [...kongs.value, { suit: item.suit, value: item.value, count: 4 }];
  drawnId.value = null;
  save();
  await drawOne();                     // 杠完补摸一张
  busy.value = false;
}

// 「新游戏」只在**当前连胜 > 0** 时才需要二次确认（连胜本来就是 0 时没什么可清的，直接开新局）
function onNewGameClick() {
  if (streak.value > 0) confirming.value = true;
  else dealRound();
}

// ---------- 新一局 ----------
// 只发一局新牌，**不动连胜**：首次进入（没有存档）、以及浮层上的「再来一局」都走这里。
function dealRound() {
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
  save();

  // 发牌波浪：手牌区与牌堆区都从左往右错开入场（各牌用 --i 做 animation-delay）。
  // ⚠️ 必须放在函数**末尾**：上面那行 `busy.value = false` 会把我这里的 `busy = true` 覆盖掉
  //（第一版写在开头，实测动画期间按钮照样可点）。动画期间 busy=true，牌还没露出来就点不到。
  playDealWave();
}

// 发牌波浪：手牌与牌堆从左往右依次入场。发新牌与「恢复存档」都走这里。
// ⚠️ 只在 dealRound() **末尾**调用：函数中部有一句 busy.value = false 会覆盖这里的 busy。
function playDealWave() {
  dealing.value = true;
  busy.value = true;
  setTimeout(() => { dealing.value = false; busy.value = false; }, 30 * 20 + 380);
}

// 「新游戏」确认之后：**当前连胜清零**（最长连胜作为记录保留），再从头发一局
//（连胜归 0 后 roundPlan 给的就是最简单的档）。
function startNewGame() {
  confirming.value = false;
  streak.value = 0;
  write(KEYS.streak, 0);
  dealRound();
}

onMounted(() => {
  measureHand();
  if (typeof ResizeObserver !== 'undefined' && handCardEl.value) {
    const ro = new ResizeObserver(measureHand);
    ro.observe(handCardEl.value);
  }
  // 没有存档时发一局 —— **这里绝不能清连胜**：首次进入也走这条路，
  // 清了就等于每次打开游戏连胜都没了（实测踩过：种下 streak=8 进游戏显示 0）。
  if (!restored) dealRound();
  else playDealWave();     // 恢复存档也播一次发牌波浪（用户要求）；烟花仍然只在真胡牌时放
  // 恢复时什么都不播（老约定：恢复界面不放动画，胜利局面也只摆浮层）
});

function onScoreReset() {
  for (const k of Object.values(KEYS)) { try { localStorage.removeItem(k); } catch { /* 忽略 */ } }
  streak.value = 0; best.value = 0;
  dealRound();
}
</script>

<style scoped lang="scss">
.wrapper {
  max-width: var(--max-width);
  margin: 0 auto;
  // 手牌 14 张两行、每行 7 张：宽度按容器算（手牌卡片左右各 8px 内边距、6 个间隙）
  --hand-gap: 5px;
  --hand-tile-w: calc((100% - 16px - 6 * var(--hand-gap)) / 7);
  --small-tile-w: 19px;
  --small-tile-h: 24px;       // 19 × 1.2824；一行放得下 14 张（3 行 = 42 ≥ 牌堆 40 张）
  // 和其它游戏一致：左右各 16px（否则卡片贴到屏幕两边）、底部 24px。
  // 首屏那 64px 必须写在这里，不能写 .score-area 的 margin-top（会塌陷出 #app，见 24 点分册）。
  padding: 64px 16px 24px;
  box-sizing: border-box;
  color: var(--text-color);

  // 卡片外观：**每个游戏的 scoped 块里都要自己写一遍**（全局没有 .card 规则，只有 --card-* 变量）。
  // 漏了就是「分数区 / 按钮区没有卡片样式」——实测 .card 拿到的是 bg rgba(0,0,0,0)、radius 0。
  // 注意**不要**写 `color: var(--card-color)`：那个变量是 #fff（给深色卡片用的），
  // 浅色主题下就是白底白字 —— 用户报的「分数区都没有数字」就是这个（实测 stat-value 颜色 rgb(255,255,255)）。
  // 文字颜色由上面的 `color: var(--text-color)` 统一给。
  .card {
    background: var(--card-bg-color);
    border-radius: var(--card-radius);
    box-shadow: var(--card-shadow);
    box-sizing: border-box;
  }

  // 分隔线要在 .wrapper 层级：评分区/操作区共用同一个类（嵌进 .score-area 里会没有样式）
  .divider {
    width: 1px;
    height: 24px;
    background: var(--card-border-color);
    flex: 0 0 auto;
  }

  // 按钮外观同理：全局也没有 .game-icon 规则（只有变量），漏了按钮就是灰的
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
}

.score-area {
  display: flex;
  align-items: center;
  height: calc(var(--row-height) + 16px);
  margin-top: 0;

  .stat { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .stat-label { font-size: 12px; color: var(--muted-color); }
  .stat-value { font-size: 20px; font-weight: 700; }
}

// 操作区比例与 Emoji 下坠一致：左侧固定文案 : 按钮 = 3 : 3.5；按钮取自然宽度、不拉伸
.opt-area {
  display: flex;
  align-items: center;
  margin: var(--row-gap) 0;
  height: var(--row-height);

  .opt-half { flex: 3; display: flex; align-items: center; justify-content: center; }
  .start-wrapper { flex: 3.5; display: flex; align-items: center; justify-content: center; }

  .omit-note {
    font-size: 13px;
    color: var(--muted-color);
  }
}

.game-area {
  position: relative;          // 浮层的定位上下文
  display: flex;
  flex-direction: column;
  gap: var(--row-gap);
}

// ③ 牌墙：一摞牌，背靠上码两层（第二层往左上错开几像素）
.wall-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  // 牌背用内联 z-index 排层（0..29，第三层是 10..29），这些值会**和胜利遮罩的 z-index:20 直接比大小**
  // → 第三层的牌会画在遮罩上面（用户报的「第三层牌超出胜利遮罩、没被盖住」）。
  // isolation 让牌堆自己成一个层叠上下文，里面的 z-index 只在牌堆内部生效。
  position: relative;
  isolation: isolate;
  height: 72px;          // 两层牌背 40px + 上下留白（缺门说明已移到按钮区左侧）
  overflow: hidden;

  // 牌堆：绝对定位的 20 张牌背，下层 + 上层往右上错开，看起来像从正面偏下往侧上方看的一摞
  .wall-stack {
    position: relative;
    flex: 0 0 auto;
  }
  // 牌堆波浪：牌背也是左→右依次入场
  // 延迟**饱和**：牌堆可能有 40 张，`i * 30ms` 会拖到 1.5s 以上（冒烟在 1.4s 采样，量到过瞬时纵向溢出）。
  // 用 min(i, 18) 把它压在 540ms 内，墙再大也约 0.9s 跑完，波浪观感不变。
  .tile-back.deal { animation: solo-deal 0.36s ease both; animation-delay: calc(min(var(--i), 18) * 30ms); }
  .tile-back {
    position: absolute;
    width: 26px;
    height: 33px;
    border-radius: 4px;
    // 纯色 + 斜条纹，不带任何图标
    background-color: var(--primary-bg);
    background-image: repeating-linear-gradient(
      45deg,
      rgba(255, 255, 255, 0.20) 0 3px,
      rgba(255, 255, 255, 0) 3px 7px
    );
    border: 1px solid rgba(0, 0, 0, 0.20);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
    // 每张牌背下缘的「厚度」：从正面偏下看过去能看到的那一圈
    &::after {
      content: '';
      position: absolute;
      left: 0;
      top: 3px;        // 下缘那一点厚度，配合 4px 的层间距正好看出两层
      width: 100%;
      height: 100%;
      border-radius: 4px;
      background: rgba(0, 0, 0, 0.26);
      z-index: -1;
    }
  }
}

// ④ 出牌区：正面朝上，固定高度内可滚动（一局最多 40 张）
.discard-card {
  // 出牌区一共 **4 行**：前三行放打出去的牌（一行 14 张 → 42 张容量 ≥ 牌堆 40 张），
  // 最后一行放杠牌（右对齐）。
  height: calc(var(--small-tile-h) * 4 + 32px);
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;

  .discard-row {
    // 正好三行：3 × 牌高 + 2 × 行间距（行间距必须和下面 gap 一致，否则会有几像素的内部滚动）
    flex: 0 0 calc(var(--small-tile-h) * 3 + 4px);
    overflow-y: auto;
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    // **别用默认的 stretch**：flex 行会把牌纵向拉满整行高度（牌宽 26px 却被拉成 100px 高，
    // 截图里就是一根根竖条）。牌的高度交给 aspect-ratio。
    align-items: flex-start;
    gap: 2px;      // 必须与 .discard-row 的高度一致（3 × 24 + 2 × 2 = 76）
  }
  .discard-tile { flex: 0 0 auto; }   // 尺寸由 --mj-w / --mj-h（像素）决定，不让 flex 拉伸
  .discard-tile.fly-hidden { visibility: hidden; }   // FLIP 期间让飞行牌顶替
  .discard-empty { font-size: 12px; color: var(--muted-color); align-self: center; margin: 0 auto; }
  // 第三行：杠牌，**右对齐**
  .kong-row {
    flex: 1;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 6px;
    min-height: var(--small-tile-h);
  }
  .kong-set {
    display: flex;
    gap: 1px;
    padding: 2px;
    border-radius: 6px;
    background: rgba(35, 128, 78, 0.14);
    box-shadow: inset 0 0 0 1px rgba(35, 128, 78, 0.45);
  }
}

// ⑤ 手牌区：14 张两行，每行 7 张
.hand-card {
  // **用 grid 按「槽位」排**，不是 flex 按「项」排：杠组是 1 个元素但占 4 张牌宽，
  // flex 换行是按项算的，于是「4 张 + 杠组」那一行放不下、杠组被挤到下一行 → 手牌变 3 行
  //（用户报的「有杠的时候又换行了」）。grid 固定 7 列、杠组 `span 4`，14 张永远 7+7。
  display: grid;
  grid-template-columns: repeat(7, var(--hand-tile-w));
  column-gap: var(--hand-gap);
  row-gap: var(--hand-gap);
  justify-content: start;
  // 手牌波浪：14 张按序号依次入场（--i 由模板给出）
  .hand-tile.deal { animation: solo-deal 0.36s ease both; animation-delay: calc(var(--i) * 45ms); }
  gap: var(--hand-gap);
  padding: 8px;

  // 高度交给 aspect-ratio：--hand-tile-w 里含 %，用它算 height 时那个 % 会被当成
  // 「父元素高度的百分比」，整块手牌会塌成几十像素（实测 21px）。
  // ⚠️ 这条规则**必须和模板里的 `fly-hidden` 绑定成对出现**：模板加了类名但这里没写样式，
  // 实体就不会真的隐形 —— 摸牌时「替身还在飞、手牌里那张已经亮着」，看着就不是同一张牌。
  // （出牌区那条一直有，所以只有摸牌出问题；验证时也别只查类名，要查 computedStyle。）
  .hand-tile.fly-hidden { visibility: hidden; }

  .hand-tile {
    width: var(--hand-tile-w);
    aspect-ratio: 131 / 168;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
    transition: transform 0.16s ease;

    &:disabled { cursor: default; }
    &.drawn { animation: solo-drawn 0.3s ease; }
    &.celebrate { animation: solo-celebrate 0.42s ease var(--delay, 0ms); }
    &.celebrate { --delay: calc(var(--i) * 55ms); }
  }
}

// 发牌波浪：每张从下方淡入、轻微过冲后落位；延迟按 --i 从左往右排开
// 入场从**上方**落下（不是从下方升起）：向上位移不会撑出底部溢出，
// 否则波浪期间整页会多出可滚动高度（实测 375×667 下多 33px，冒烟脚本会报出来）。
@keyframes solo-deal {
  0%   { opacity: 0; transform: translateY(-12px) scale(0.85); }
  60%  { opacity: 1; transform: translateY(-2px) scale(1.03); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

// 杠组：把这 4 张框在一起，并在上方浮出 tooltip（「杠」）
.hand-card .kong-group {
  position: relative;
  display: flex;
  grid-column: span 4;          // 占 4 个槽位（不是 1 个「项」）
  // 组内间距与其它手牌一样，但**不能有 padding**：一行正好是「7 张牌 + 6 个间隙」顶满容器，
  // 多出 2px padding ×2 就会把后面的牌挤到下一行（用户报的「边框把牌挤换行了」）。
  // 所以框改用 outline 画 —— outline 不占布局空间，视觉上同样贴在四张牌外面。
  gap: var(--hand-gap);
  border-radius: 8px;

  // 橙框等发牌波浪结束再出现
  &.framing {
    outline: 2px solid var(--god-bg);
    outline-offset: 2px;
    background: rgba(194, 65, 12, 0.10);
  }

  &.drawn { animation: solo-drawn 0.3s ease; }
}

.kong-tip {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  // ⚠️ **绝对不能用 `transform` 居中**：App.vue 有一条全局规则
  //   `#app button:not(:disabled):active { transform: translateY(1px) }`
  // 按下的那一瞬间会把 `translateX(-50%)` 整个顶掉 —— tooltip 横跳半个宽度，指针跟丢、
  // `:active` 立刻结束又跳回来，表现就是「一按就晃、怎么都点不到」。
  // 这里用**独立属性 `translate`**：它和 `transform` 是两个属性、会叠加，全局那条覆盖不到它，
  // 按下去只多 1px 的下沉反馈，居中始终成立（`.flying` 也是这个写法）。
  translate: -50% 0;
  z-index: 40;
  // 热区：视觉上加大一圈，并再用 ::before 往「上 / 左右」扩，见下
  padding: 9px 18px;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  background: var(--god-bg);
  border: 0 none;
  border-radius: 999px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  cursor: pointer;
  touch-action: manipulation;

  // 热区再扩一圈：**只往上和左右扩，不往手牌那侧扩** ——
  // 往牌那边扩会让「想点牌」的手势误trigger 杠牌。
  &::before {
    content: '';
    position: absolute;
    left: -12px;
    right: -12px;
    top: -12px;
    bottom: 0;
  }

  // 小三角，指明它是这 4 张牌的 tooltip。
  // **它必须不吃点击**：三角是唯一朝向手牌那侧伸出去的部分（往下 10px、宽 10px），
  // 可点的话「想点这张牌」会变成触发杠牌。
  &::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 100%;
    margin-left: -5px;
    border: 5px solid transparent;
    border-top-color: var(--god-bg);
    pointer-events: none;
  }

  // 杠组在**下排**时翻到下方（三角朝上），这样不会盖住上排的手牌
  &.below {
    top: calc(100% + 6px);
    bottom: auto;

    // 翻到下方时方向相反：往下和左右扩，同样不往牌那侧扩
    &::before { top: 0; bottom: -12px; }

    &::after {
      top: auto;
      bottom: 100%;
      border-top-color: transparent;
      border-bottom-color: var(--god-bg);
    }
  }
}

// 飞牌：fixed 定位（视角不受滚动影响），位移与时长走 CSS 变量
.flying {
  position: fixed;
  left: var(--x);
  top: var(--y);
  translate: -50% -50%;
  z-index: 30;
  pointer-events: none;
  animation: solo-fly var(--dur) cubic-bezier(0.3, 0.9, 0.4, 1) forwards;
}

@keyframes solo-fly {
  from { transform: translate(0, 0) scale(1); }
  to { transform: translate(var(--dx), var(--dy)) scale(var(--scale)); }
}

@keyframes solo-drawn {
  from { transform: translateY(-4px); }
  to { transform: translateY(0); }
}

// 胡牌时每张牌挨个跳一下：--i 是它在手牌里的序号，用 animation-delay 串起来
@keyframes solo-celebrate {
  0%, 100% { transform: translateY(0); }
  35% { transform: translateY(-10px); }
  70% { transform: translateY(0); }
}

.result {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 12px;
  // 配色**与其它游戏一致**（2048 / 消消乐 / 连连看…）：遮罩用 --mask-color，
  // 文字用 --win-color，输的时候挂 .lose 换成 --lose-color。
  // 别自己写 rgba 黑底 + 白字：主题切换后会跟别的游戏不一样。
  border-radius: var(--card-radius);
  background: var(--mask-color);
  color: var(--win-color);
  font-weight: bold;
  z-index: 20;

  &.lose { color: var(--lose-color); }

  .result-title { font-size: 20px; }
  .result-streak { font-size: 14px; opacity: 0.85; }
  .game-icon { flex: 0 0 auto; }
}
</style>
