#!/usr/bin/env bash
# Module checks for apps/safari-extension (foreground only, no services left running).
#   scripts/check.sh                 typecheck, unit tests, browser build
#   BROWSER=<exe> scripts/check.sh   also the desktop browser self-test and trusted-input check
# Node and TypeScript come from the lead's pinned toolchain (read-only); override
# with NODE_BIN_DIR / TSC if they live elsewhere.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO_TOOLS="${LC_LEAD_REPO:-/home/agentsdock/Projects/learning-companion/repo}"
NODE_BIN_DIR="${NODE_BIN_DIR:-$REPO_TOOLS/.tools/node-v24.21.0-linux-x64/bin}"
TSC="${TSC:-$REPO_TOOLS/node_modules/typescript/bin/tsc}"
export PATH="$NODE_BIN_DIR:$PATH"
echo "node $(node --version); $(node "$TSC" --version)"
node "$TSC" -p tsconfig.json
echo "typecheck: pass"
node --test tests/*.test.ts
rm -rf dist
node "$TSC" -p tsconfig.build.json
echo "build: pass"
if [[ -n "${BROWSER:-}" ]]; then
  OUT="${OUT:-../../docs/verification/web/evidence}"
  node scripts/browser-check.mjs --browser "$BROWSER" --out "$OUT" --run "${RUN_PREFIX:-edge}-selftest"
  node scripts/trusted-check.mjs --browser "$BROWSER" --out "$OUT" --run "${RUN_PREFIX:-edge}-trusted"
  if [[ -f scripts/entries-check.mjs ]]; then
    node scripts/entries-check.mjs --browser "$BROWSER" --out "$OUT" --run "${RUN_PREFIX:-edge}-entries"
  fi
  node scripts/preview-check.mjs --browser "$BROWSER" --out "$OUT" --run "${RUN_PREFIX:-edge}-preview"
fi
