<script>
export default {
  onLaunch() {
    // 预留：初始化音频、读取偏好等
  },
};
</script>

<style lang="scss">
/* 全局基础样式（小程序不支持 * 选择器，逐个写） */
page {
  /* 底色由页面根元素负责（画布是透明的，只画粒子/轨道） */
  background: #f0f2f5;
  color: #222;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif;
}
view, text, button { box-sizing: border-box; }
button::after { border: none; }

/* 遮罩里的按钮组：整行居中、按钮自然宽度（不要再写 width:70% 或让按钮 flex:1 拉满） */
.result-btns {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  width: 100%;
}
.result-btns .btn { flex: 0 0 auto; }

/* ---------- 结算层按钮统一规格（所有游戏共用一套，别再各写一份） ----------
   主操作（新游戏 / 下一关 / 继续）：绿底白字
   次操作（重玩本关 / 再来一局 / 取消）：**橙色描边**（web 的 .replay-btn 约定）
   两类都用 .btn，次操作额外加 .ghost（或 .game-icon.replay-btn 的老写法） */
.result .btn,
.result-btns .btn,
.result .game-icon,
.result-btns .game-icon {
  box-sizing: border-box !important;
  height: 72rpx !important;
  line-height: 68rpx !important;      /* 72 减上下各 2rpx 边框 */
  padding: 0 28rpx !important;
  margin: 0 !important;
  border-radius: 14rpx !important;
  font-size: 24rpx !important;
  font-weight: 700 !important;
  border: 2rpx solid transparent !important;
}
/* 主操作 */
.result .btn:not(.ghost):not(.replay-btn),
.result-btns .btn:not(.ghost):not(.replay-btn),
.result .game-icon:not(.replay-btn),
.result-btns .game-icon:not(.replay-btn) {
  background: #23804e !important;
  color: #fff !important;
  border-color: #23804e !important;
}
/* 次操作：橙色描边、透明底 */
.result .ghost, .result .replay-btn,
.result-btns .ghost, .result-btns .replay-btn,
.game-icon.replay-btn {
  background: transparent !important;
  color: #c2410c !important;
  border: 2rpx solid #c2410c !important;
}

/* 全局统一的行高（对齐 web 的 --row-height，并按 iPhone 15 的更宽松观感调）：
   分数卡 168rpx ≈ 88px（原来 138rpx 偏矮），操作区 120rpx ≈ 63px（原来 138rpx 偏高） */
.score-area { height: 168rpx; }
.opt-area { height: 120rpx; }

/* 右下角圆形悬浮按钮：全局定义，避免插槽内容拿不到 scoped 作用域 */
.fab {
  width: 84rpx;               /* 96rpx ≈ 50px 仍偏大，再缩到 84rpx ≈ 44px */
  height: 84rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 2rpx solid #e1e1e1;
  background: #fff;
  box-shadow: 0 6rpx 20rpx rgba(0, 0, 0, 0.18);
  color: #333;                 /* UnoCSS 图标用 currentColor 上色 */
  font-size: 36rpx;            /* 图标 1.2em ≈ 43rpx ≈ 23px（按钮缩到 84rpx 后同步） */
  line-height: 1;
}
/* 图标必须放在内层：i-xxx 会给自己套 mask + background-color:currentColor，
   如果和 .fab 是同一个节点，mask 会把整个圆形按钮裁成图标形状（实测变幽灵轮廓） */
.fab-ico { pointer-events: none; }

/* 与 web 的 --card-radius / --card-shadow / --card-bg-color 完全一致（14px / 0 2px 12px rgba(0,0,0,.08) / #fff） */
.card {
  border-radius: 27rpx;
  box-shadow: 0 4rpx 23rpx rgba(0, 0, 0, 0.08);
  background: #fff;
}
</style>
