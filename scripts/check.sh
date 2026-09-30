#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -d .tools/node-v24.21.0-linux-x64/bin ]]; then
  export PATH="$PWD/.tools/node-v24.21.0-linux-x64/bin:$PATH"
fi
if [[ "$(node --version)" != "v24.21.0" ]]; then
  echo "Expected pinned Node v24.21.0" >&2
  exit 1
fi
.venv/bin/python -m packages.contracts.generate_types --check
.venv/bin/python -m packages.contracts.generate_openapi --check
.venv/bin/python -m packages.contracts.process_v2.generate --check
.venv/bin/python -m packages.contracts.process_control.generate --check
.venv/bin/python -m packages.contracts.capture_ingress.generate --check
.venv/bin/python -m packages.contracts.capture_frame.generate --check
.venv/bin/python -m packages.contracts.desktop_frame.generate --check
.venv/bin/python -m packages.contracts.desktop_capture_ingress.generate --check
.venv/bin/python -m packages.contracts.raw_capture_ingress.generate --check
.venv/bin/python -m pytest -q
npm run typecheck
LC_LEAD_REPO="$PWD" \
NODE_BIN_DIR="$(dirname "$(command -v node)")" \
TSC="$PWD/node_modules/typescript/bin/tsc" \
bash apps/safari-extension/scripts/check.sh
