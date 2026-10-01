#!/usr/bin/env bash
set -euo pipefail
python3 /tmp/mac-control-fb891-probes/prepare.py
LD_LIBRARY_PATH=/tmp/lc-review-0212/libs /tmp/lc-review-0212/tc/usr/bin/swift-frontend \
  -interpret -sdk /tmp/lc-review-0212/sysroot \
  -module-cache-path /tmp/mac-control-fb891-probes/module-cache \
  -swift-version 5 -module-name BoundedHostControl \
  /tmp/mac-control-fb891-probes/probe.swift \
  > /tmp/mac-control-fb891-probes/probe.json \
  2> /tmp/mac-control-fb891-probes/probe.stderr
cat /tmp/mac-control-fb891-probes/probe.json
