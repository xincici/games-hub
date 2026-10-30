#!/usr/bin/env bash
# 把 web 仓库里的「纯逻辑 / 词典 / 音效」同步到小程序工程。
# 只做**复制**，绝不修改 web 仓库 —— web 始终是唯一真相。
set -euo pipefail
cd "$(dirname "$0")/.."
WEB="$(cd ../ && pwd)"
for g in g2048; do
  if [ -f "$WEB/src/games/$g/board.js" ]; then
    cp "$WEB/src/games/$g/board.js" "mp/src/pages/$g/board.js"
    echo "  synced $g/board.js"
  fi
done
cp "$WEB"/public/audio/sfx/*.mp3 mp/src/static/audio/ 2>/dev/null || true
echo "  synced sfx"
