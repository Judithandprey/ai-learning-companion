#!/bin/bash
H=/tmp/lc-link-run
cd $H
export LD_LIBRARY_PATH=/tmp/lc-review-0212/libs
S=/tmp/lc-review-0212/sysroot
files=$(ls src/*.swift | grep -v main.swift)
exec /tmp/lc-review-0212/tc/usr/bin/swift-frontend -interpret -sdk $S -swift-version 5 -module-name LCRun -lXCTest src/main.swift $files "$@"
