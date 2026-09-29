#!/usr/bin/env bash
# Builds the module and starts the P0-07 document preview in the foreground.
#   apps/safari-extension/scripts/preview.sh   then open http://127.0.0.1:4173/preview/
# Node and TypeScript come from the lead's pinned toolchain (read-only); override
# with NODE_BIN_DIR / TSC if they live elsewhere.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO_TOOLS="${LC_LEAD_REPO:-/home/agentsdock/Projects/learning-companion/repo}"
NODE_BIN_DIR="${NODE_BIN_DIR:-$REPO_TOOLS/.tools/node-v24.21.0-linux-x64/bin}"
TSC="${TSC:-$REPO_TOOLS/node_modules/typescript/bin/tsc}"
export PATH="$NODE_BIN_DIR:$PATH"
rm -rf dist
node "$TSC" -p tsconfig.build.json
exec node scripts/preview-server.mjs
