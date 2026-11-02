// 统一三按钮「新游戏」确认：取消 / 重玩本关 / 确定重来。
// 只接管同时有 startNewGame 和 replayLevel|retryLevel 的闯关游戏。
const { W, H } = require('./canvas');
const theme = require('./theme');
const D = require('./draw');
const { t } = require('./i18n');

function canOverride(scene) {
  if (!scene || !scene.confirming) return false;
  if (typeof scene.startNewGame !== 'function') return false;
  return typeof scene.replayLevel === 'function' || typeof scene.retryLevel === 'function';
}

function draw(c, scene) {
  const T = theme.tokens;
  c.fillStyle = 'rgba(0,0,0,0.48)';
  c.fillRect(0, 0, W, H);
  const w = W - 56;
  const x = (W - w) / 2;
  const msgKey = scene.keepBestOnNewGame ? 'confirmNewMsgKeepBest' : 'confirmNewMsg';
  const lines = D.wrapText(c, t(msgKey), w - 40, 13);
  const h = 84 + lines.length * 20 + 58;
  const y = (H - h) / 2;
  D.card(c, x, y, w, h, T);
  D.text(c, t('confirmNewTitle'), x + 20, y + 32, {
    size: 17, weight: 'bold', color: T.text,
  });
  lines.forEach((line, i) => {
    D.text(c, line, x + 20, y + 62 + i * 20, { size: 13, color: T.muted });
  });
  // 遮罩先加，按钮后加（Input 从后往前找）。
  scene.addButton('confirm-mask', 0, 0, W, H, () => { scene.confirming = false; });
  const gap = 10;
  const bw = (w - 40 - gap * 2) / 3;
  const by = y + h - 48;
  const button = (bx, label, kind, onTap) => {
    if (kind === 'primary') D.fillRoundRect(c, bx, by, bw, 32, 8, T.primary);
    else if (kind === 'replay') {
      D.fillRoundRect(c, bx, by, bw, 32, 8, T.card);
      D.strokeRoundRect(c, bx, by, bw, 32, 8, T.god, 1);
    } else D.fillRoundRect(c, bx, by, bw, 32, 8, T.enter);
    D.text(c, label, bx + bw / 2, by + 16, {
      size: 12.5, weight: 'bold',
      color: kind === 'primary' ? '#fff' : kind === 'replay' ? T.god : T.enterColor,
      align: 'center',
    });
    scene.addButton(`confirm-${kind}`, bx, by, bw, 32, onTap);
  };
  button(x + 20, t('cancel'), 'cancel', () => { scene.confirming = false; });
  button(x + 20 + bw + gap, t('confirmReplay'), 'replay', () => {
    const replay = scene.replayLevel || scene.retryLevel;
    replay.call(scene);
  });
  button(x + 20 + (bw + gap) * 2, t('confirmOk'), 'ok', () => scene.startNewGame());
}

module.exports = { canOverride, draw };
