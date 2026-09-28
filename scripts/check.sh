#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -d .tools/node-v24.21.0-linux-x64/bin ]]; then
  export PATH="$PWD/.tools/node-v24.21.0-linux-x64/bin:$PATH"
fi
.venv/bin/python -m packages.contracts.generate_types --check
.venv/bin/python -m pytest -q
npm run typecheck
