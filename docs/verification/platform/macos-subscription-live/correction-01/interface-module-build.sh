#!/bin/bash
set -e
B=/tmp/lc-parent-harness
cd $B
export LD_LIBRARY_PATH=/tmp/lc-review-0212/libs
S=/tmp/lc-review-0212/sysroot
SWIFTC=/tmp/lc-review-0212/tc/usr/bin/swiftc
OUT=$B/out
rm -rf $OUT; mkdir -p $OUT
$SWIFTC -sdk $S -swift-version 5 -parse-as-library -emit-module -module-name AppleShim -emit-module-path $OUT/AppleShim.swiftmodule fshim/AppleShim.swift
for m in mods/*.swift; do
  n=$(basename $m .swift)
  $SWIFTC -sdk $S -swift-version 5 -parse-as-library -I $OUT -emit-module -module-name $n -emit-module-path $OUT/$n.swiftmodule $m
done
echo "== DesktopCapture module (Swift 5, -enable-testing)"
$SWIFTC -sdk $S -swift-version 5 -parse-as-library -enable-testing -I $OUT -emit-module -module-name DesktopCapture \
  -emit-module-path $OUT/DesktopCapture.swiftmodule \
  -Xfrontend -warn-long-expression-type-checking=${EXPR_MS:-100} -Xfrontend -warn-long-function-bodies=${BODY_MS:-400} src/*.swift
echo "== module ok"
