<template>
  <div class="wrapper">
    <TopHeader @onScoreReset="onScoreReset" />

    <!-- ① 分数区：关卡 / 当前连胜 / 最长连胜 -->
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
    </div>

    <!-- ② 按钮区：新游戏 / 查看答案 / 退格 -->
    <div class="card opt-area">
      <!-- 最左侧：这道题的难度评分（1~100） -->
      <div class="opt-half">
        <div class="score-cell">
          <span class="score-label">{{ i18n('difficulty') }} ·</span>
          <span class="score-value">{{ score }}</span>
        </div>
      </div>
      <div class="divider" />
      <div class="start-wrapper">
        <button class="game-icon" @click="startNewGame">{{ i18n('start') }}</button>
      </div>
      <div class="divider" />
      <div class="start-wrapper">
        <button class="game-icon answer-btn" :disabled="phase !== PLAY" @click="revealAnswer">
          {{ i18n('answer') }}
        </button>
      </div>
    </div>

    <div class="game-area">
      <!-- ③ 算式展示区 -->
      <div class="card expr-card">
        <div class="expr">
          <template v-if="shownTokens.length">
            <span v-for="(t, i) in shownTokens" :key="i" class="tok" :class="t.t">{{ tokText(t) }}</span>
          </template>
          <span v-else class="expr-tip">{{ i18n('exprTip') }}</span>
        </div>
        <!-- 退格贴在算式区最右侧（小按钮），不占按钮区的位置 -->
        <button
          class="undo-mini"
          :title="i18n('undo')"
          :disabled="phase !== PLAY || !tokens.length"
          @click="undo"
        >
          ⌫
        </button>
        <div v-if="noteText" class="expr-note" :class="noteClass">{{ noteText }}</div>
      </div>

      <!-- ④ 初始化的数字：用过的置灰 -->
      <div class="card nums-card">
        <button
          v-for="(n, i) in nums"
          :key="i"
          class="num-btn"
          :disabled="phase !== PLAY || !appendable(tokens, { t: 'num', i, v: n })"
          @click="add({ t: 'num', i, v: n })"
        >
          {{ n }}
        </button>
      </div>

      <!-- ⑤ 加减乘除与左右括号：不符合规则时置灰 -->
      <div class="card ops-card">
        <button
          v-for="o in OPS"
          :key="o"
          class="op-btn"
          :disabled="phase !== PLAY || !appendable(tokens, tokOf(o))"
          @click="add(tokOf(o))"
        >
          {{ o }}
        </button>
      </div>

      <!-- 胜利浮层：盖在算式 / 数字 / 符号这三块上 -->
      <div v-if="phase === WON" class="result win">
        <div class="result-title">🎉 {{ i18n('win') }}</div>
        <div class="result-streak">🔥 {{ i18n('streak') }} {{ streak }}</div>
        <button class="game-icon" @click="nextLevel">{{ i18n('nextLevel') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';

import TopHeader from '@/components/TopHeader.vue';
import confetti from '@/shared/confetti';
import { i18n } from '@/shared/i18n';
import {
  appendable, evalTokens, isComplete, usedIndexes, newPuzzle, parseExprText, solveAll, scorePuzzle,
  NUM_COUNT,
} from './board';

const PLAY = 'play';
const WON = 'won';
const GAVEUP = 'gaveup';

const OPS = ['+', '−', '×', '÷', '(', ')'];
// 显示用的 − 要换成运算用的 -（两者字形不同，内部一律用 ASCII 的 -）
const tokOf = o => (o === '(' || o === ')' ? { t: o === '(' ? 'lp' : 'rp' } : { t: 'op', op: o === '−' ? '-' : o });
const tokText = t => (t.t === 'num' ? t.v : t.t === 'lp' ? '(' : t.t === 'rp' ? ')' : t.op === '-' ? '−' : t.op);

const KEYS = {
  state: '__point24__state',
  streak: '__point24__streak',
  best: '__point24__best_streak',
};
const readInt = (key, dflt = 0) => {
  const v = Number(localStorage.getItem(key));
  return Number.isFinite(v) && v >= 0 ? v : dflt;
};
const write = (key, value) => { try { localStorage.setItem(key, String(value)); } catch { /* 隐私模式忽略 */ } };

// ---------- 状态（**在 setup 里就恢复**，这样首帧就是最终样子，不会先画一个空盘再补） ----------
const level = ref(1);
const nums = ref([]);
const tokens = ref([]);
const phase = ref(PLAY);
const streak = ref(readInt(KEYS.streak, 0));
const best = ref(readInt(KEYS.best, 0));
const score = ref(1);                // 当前这道题的难度评分（1~100），发牌 / 恢复时算
const answer = ref('');              // 本题的一个正确答案（发牌时就算好，查看答案零延迟）
// ↑ 必须声明在 restoreState() **之前**：它内部会给 answer.value 赋值，
//   放到后面就是 TDZ，抛错再被下面的 try/catch 吞掉 —— 表现是「退出重进永远恢复不了，每次都在重发」。
const revealed = ref('');            // 查看答案后展示的答案串
const note = ref('');                // 算式下方的一行提示（=N / 答案 / 放弃提示）

function restoreState() {
  try {
    const s = JSON.parse(localStorage.getItem(KEYS.state) || 'null');
    if (!s || !Array.isArray(s.nums) || s.nums.length !== NUM_COUNT) return false;
    if (!s.nums.every(n => Number.isInteger(n) && n >= 1 && n <= 9)) return false;
    // 存下来的牌**必须仍然有解**，否则宁可丢掉这份存档重发 —— 不能把一道死题摆给玩家
    const sols = solveAll(s.nums);
    if (!sols.length) return false;
    answer.value = sols[0].expr;        // 存档里不存答案，恢复时重算（保证「查看答案」一定有内容）
    score.value = scorePuzzle(s.nums, sols);   // 评分同理：不存，按数字重算
    level.value = Math.max(1, Math.floor(s.level) || 1);
    nums.value = s.nums.slice();
    tokens.value = Array.isArray(s.tokens) ? s.tokens : [];
    phase.value = s.phase === WON ? WON : s.phase === GAVEUP ? GAVEUP : PLAY;
    revealed.value = typeof s.revealed === 'string' ? s.revealed : '';
    note.value = typeof s.note === 'string' ? s.note : '';
    return true;
  } catch (e) {
    // 不要静默吞掉：这里曾经因为 TDZ 抛错而被吞，表现为「退出重进永远恢复不了」
    console.warn('[point24] 存档恢复失败，已按新局重开：', e);
    return false;
  }
}
const restored = restoreState();

const save = () => {
  try {
    localStorage.setItem(KEYS.state, JSON.stringify({
      level: level.value, nums: nums.value, tokens: tokens.value, phase: phase.value,
      revealed: revealed.value, note: note.value,
    }));
  } catch { /* 隐私模式忽略 */ }
};

// ---------- 发牌 ----------
const prevNums = ref(null);
function deal(levelNo) {
  const p = newPuzzle(levelNo, Math.random, prevNums.value);
  prevNums.value = p.nums;
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
const usedAll = computed(() => usedIndexes(tokens.value).length === NUM_COUNT);
const complete = computed(() => isComplete(tokens.value));
const current = computed(() => (complete.value ? evalTokens(tokens.value) : null));
// 算式区显示什么：平时是玩家拼的 token；查看答案后直接把答案算式摆出来（不带任何前缀文字）
const answerTokens = computed(() => (phase.value === GAVEUP ? parseExprText(revealed.value) || [] : []));
const shownTokens = computed(() => (phase.value === GAVEUP ? answerTokens.value : tokens.value));
// 「还不是 24」只在这两个条件都满足时出：4 个数字都用完了、算式也完整（否则玩家还在拼，别催）
const wrongResult = computed(() => phase.value === PLAY && usedAll.value && complete.value && !current.value?.is24);

function add(tok) {
  if (phase.value !== PLAY || !appendable(tokens.value, tok)) return;
  tokens.value = [...tokens.value, tok];
  const done = isComplete(tokens.value) && usedIndexes(tokens.value).length === NUM_COUNT;
  if (!done) {
    // 还没拼完（或数字没用完）→ 把上一次留下的「还不是 24」清掉：
    // 答错之后继续点一个运算符，算式已经不完整了，那行提示就不该还挂着（实测发现过）
    note.value = '';
    save();
    return;
  }
  // 4 个数字都用上了、算式也完整 → 立刻判定
  const r = evalTokens(tokens.value);
  if (r.ok && r.is24) return win();
  note.value = `${i18n('notTarget')} · = ${r.ok ? r.value : '?'}`;
  save();
}

function undo() {
  if (phase.value !== PLAY || !tokens.value.length) return;
  tokens.value = tokens.value.slice(0, -1);
  note.value = wrongResult.value ? `${i18n('notTarget')} · = ${current.value?.value}` : '';
  save();
}

function win() {
  phase.value = WON;
  streak.value += 1;
  if (streak.value > best.value) { best.value = streak.value; write(KEYS.best, best.value); }
  write(KEYS.streak, streak.value);
  note.value = '';
  save();
  confetti();          // 只有真正打赢这一局才撒花；重进恢复不撒（见 onMounted）
}

function revealAnswer() {
  if (phase.value !== PLAY) return;
  phase.value = GAVEUP;
  streak.value = 0;                                  // 查看答案 = 放弃：当前连胜清零（最长连胜保留）
  write(KEYS.streak, 0);
  revealed.value = answer.value;
  note.value = '';
  save();
}

// 新游戏：上一局赢了就进下一关，否则同一关换一道题
function startNewGame() {
  const next = phase.value === WON ? level.value + 1 : level.value;
  level.value = next;
  deal(next);
}
const nextLevel = () => { level.value += 1; deal(level.value); };

// ---------- 提示文案 ----------
const noteText = computed(() => (phase.value === GAVEUP ? i18n('gaveUpNote') : note.value || ''));
const noteClass = computed(() => ({ bad: wrongResult.value }));

onMounted(() => {
  if (!restored) deal(level.value);      // 没有存档才发新牌；有存档时上面已经恢复好了
  // 恢复存档时**什么都不播**：胜利局面重进只把遮罩摆出来，不放烟花（用户明确要求）。
  // 这也是本项目的老约定（见根 AGENTS 的「恢复界面时一律不放任何动画」）。
});

// 标题连点 5 次清记录：把连胜记录一起清掉（注册表里给的是 recordsPrefix，数字键不存在，所以这里自己清）
function onScoreReset() {
  for (const k of Object.values(KEYS)) { try { localStorage.removeItem(k); } catch { /* 忽略 */ } }
  level.value = 1; streak.value = 0; best.value = 0;
  deal(1);
}
</script>

<style scoped lang="scss">
.wrapper {
  max-width: var(--max-width);
  margin: 0 auto;
  // 首张卡片的 64px 间距写在 .wrapper 的 padding-top 上，不能写成 .score-area 的 margin-top：
  // 顶栏是 fixed（不在流内），于是 .score-area 是这个页面第一个在流内的元素，它的 margin 会
  // **塌陷到 #app 之外**，而 #app 有 min-height: 100dvh —— 结果整页恒多出 64px 可滚动高度
  //（实测内容总高只有 480 < 667，scrollY 却是 64）。Emoji 镜像踩的是同一个坑。
  padding: 64px 16px 24px;
  box-sizing: border-box;
  color: var(--text-color);

  .card {
    background: var(--card-bg-color);
    border-radius: var(--card-radius);
    box-shadow: var(--card-shadow);
    box-sizing: border-box;
  }

  // 分隔线要在 .wrapper 层级：统计条与别处共用同一个类（嵌进 .score-area 里会没有样式）
  .divider {
    width: 1px;
    height: 24px;
    align-self: center;
    background: var(--border-color);
    opacity: 0.6;
  }

  .score-area {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 0;                 // 见 .wrapper 的 padding-top（在这里写 margin 会塌陷出 #app）
    padding: 8px 12px;
    height: calc(var(--row-height) + 16px);

    .stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      flex: 1;
    }
    .stat-label {
      font-size: 12px;
      color: var(--muted-color);
    }
    .stat-value {
      font-size: 22px;
      font-weight: 700;
    }
  }

  .game-icon {
    cursor: pointer;
    padding: 8px 10px;
    font-size: 13px;
    font-weight: bold;
    background: var(--primary-bg);
    color: #fff;
    border: 0;
    border-radius: var(--radius-tile);
    white-space: nowrap;

    &:disabled {
      background-color: #aaa;
      cursor: not-allowed;
    }
  }

  // 查看答案 = 放弃（会清当前连胜），用橙色和「新游戏」区分开（与上帝模式同一个橙，白字 5.18:1）
  .answer-btn:not(:disabled) {
    background-color: var(--god-bg);
  }

  // 退格：贴在算式区最右侧的小按钮。
  // **定位不能用 transform**：App.vue 有一条全局规则 `#app button:not(:disabled):active { transform: … }`，
  // 按下的那一瞬间会把它顶掉，按钮就往下闪一下再归位（用户报的现象）。改成从卡片顶部固定偏移。
  .undo-mini {
    position: absolute;
    right: 8px;
    // 垂直居中**不用 transform**（`translateY(-50%)` 会被全局 `:active` 的 transform 顶掉，
    // 按下时按钮会下跳再归位）：按钮高 30px，让它的上边落在「中线往上 15px」处即可。
    // 高度若改，这里的 15px 要跟着改。
    top: calc(50% - 15px);
    width: 30px;
    height: 30px;
    padding: 0;
    font-size: 15px;
    line-height: 1;
    color: var(--text-color);
    background: var(--enter-bg);
    border: 0;
    border-radius: 8px;
    cursor: pointer;

    &:disabled {
      color: var(--muted-color);
      opacity: 0.45;
      cursor: not-allowed;
    }
  }

  // 操作区比例**与 Emoji 下坠一致**：评分区 : 两个按钮区 = 3 : 3.5 : 3.5。
  // 关键是按钮**不拉伸**（下面 .game-icon 不写 flex），像下坠那样取自然宽度、在格里居中 ——
  // 第一版写成 `flex: 1` 撑满整格，按钮看起来就"太长"了。
  .opt-area {
    display: flex;
    align-items: center;
    margin: var(--row-gap) 0;
    height: var(--row-height);

    .opt-half {
      flex: 3;
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
  }

  // 最左侧那格里是当前题目的难度评分（1~100）。**一行显示**：「题目评分 · 80」/「Score · 80」
  //（用户要求不换行；标签走 i18n，中间的「·」放在模板里）
  .score-cell {
    display: flex;
    align-items: center;        // 两个 span 字号不同：用居中对齐让它们的视觉中心重合
    justify-content: center;
    gap: 4px;
    white-space: nowrap;

    // line-height 都写 1：盒子紧贴文字，居中对齐之后不会再出现「一个偏上、一个偏下」
    .score-label {
      font-size: 12px;
      line-height: 1;
      color: var(--muted-color);
    }
    .score-value {
      font-size: 16px;
      font-weight: 700;
      line-height: 1;
    }
  }

  .game-area {
    position: relative;      // 胜利浮层的定位上下文
  }

  .expr-card {
    position: relative;
    // 高度固定：算式从一行变成两行时卡片不再长高，右侧的退格和下方那行小字都不会跟着跳
    height: 104px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 6px;
  }
  .expr {
    display: flex;
    flex-wrap: wrap;
    flex: 1;
    overflow-y: auto;        // 极端情况下 token 太多，允许在卡片内滚动，而不是把卡片撑高
    padding: 0 34px;         // 给右侧的小退格留位置
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 30px;
  }
  .expr-tip {
    font-size: 13px;
    color: var(--muted-color);
  }
  .tok {
    font-size: 18px;
    font-weight: 700;
    line-height: 1;
    padding: 5px 8px;
    border-radius: 8px;
    background: var(--enter-bg);
  }
  .tok.op,
  .tok.lp,
  .tok.rp {
    background: transparent;
    color: var(--muted-color);
    padding: 5px 2px;
  }
  .expr-note {
    font-size: 12px;
    text-align: center;
    color: var(--muted-color);

    &.bad {
      color: var(--lose-color);
      font-weight: bold;
    }
    &.answer {
      color: var(--primary-bg);
      font-weight: bold;
    }
  }

  .nums-card,
  .ops-card {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: var(--row-gap);
    padding: 8px 12px;
  }

  .num-btn {
    flex: 0 0 auto;
    width: 56px;
    height: 56px;
    font-size: 26px;
    font-weight: 700;
    color: #fff;
    background: var(--primary-bg);
    border: 0;
    border-radius: var(--radius-tile);
    cursor: pointer;

    &:disabled {
      background-color: #aaa;
      cursor: not-allowed;
      opacity: 0.6;
    }
  }

  .op-btn {
    flex: 1;
    min-width: 0;
    height: 44px;
    font-size: 20px;
    font-weight: 700;
    color: var(--text-color);
    background: var(--enter-bg);
    border: 0;
    border-radius: var(--radius-tile);
    cursor: pointer;

    &:disabled {
      background-color: var(--enter-bg);
      color: var(--muted-color);
      opacity: 0.45;
      cursor: not-allowed;
    }
  }

  // 胜利浮层：盖住算式 / 数字 / 符号三块；一定写 box-sizing（否则会比父容器大一圈）
  .result {
    position: absolute;
    inset: 0;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 12px;
    border-radius: var(--card-radius);
    background: var(--mask-color);
    color: var(--win-color);
    font-size: 18px;
    font-weight: bold;

    .result-streak {
      font-size: 16px;
    }
  }
}
</style>
