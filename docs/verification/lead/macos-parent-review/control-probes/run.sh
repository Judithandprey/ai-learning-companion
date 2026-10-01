#!/usr/bin/env bash
set -euo pipefail
python3 /tmp/macos-parent-f625-host-control-probes/prepare.py
LD_LIBRARY_PATH=/tmp/lc-review-0212/libs /tmp/lc-review-0212/tc/usr/bin/swift-frontend \
  -interpret -sdk /tmp/lc-review-0212/sysroot \
  -module-cache-path /tmp/macos-parent-f625-host-control-probes/module-cache \
  -swift-version 5 -module-name BoundedHostControl \
  /tmp/macos-parent-f625-host-control-probes/probe.swift \
  > /tmp/macos-parent-f625-host-control-probes/probe.json \
  2> /tmp/macos-parent-f625-host-control-probes/probe.stderr
cat /tmp/macos-parent-f625-host-control-probes/probe.json
