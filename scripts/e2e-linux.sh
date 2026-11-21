#!/usr/bin/env bash
set -euo pipefail

# xvfb-run owns/cleans up the virtual display. The inner shell owns only its
# window manager; never kill an existing desktop or another Obsidian process.
exec xvfb-run -a -s '-screen 0 1600x1200x24 -nolisten tcp' bash -c '
  set -euo pipefail
  mkdir -p e2e-results/logs
  openbox >e2e-results/logs/window-manager.log 2>&1 &
  wm_pid=$!
  trap '\''kill "$wm_pid" 2>/dev/null || true'\'' EXIT
  npm run test:e2e:built
'
