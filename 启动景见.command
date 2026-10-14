#!/bin/zsh
set -e
cd "$(dirname "$0")"
if command -v node >/dev/null 2>&1; then
  JINGJIAN_NODE="$(command -v node)"
elif [[ -x "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" ]]; then
  JINGJIAN_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
else
  print '请先安装 Node.js 20 或更新版本：https://nodejs.org/'
  read -k 1
  exit 1
fi
exec "$JINGJIAN_NODE" scripts/start.mjs
