# Windows uploader platform-test correction

Actual owner delivery **3885987a1eef702512f868e6db04550791e319cb** arrived via
`handoff_3a9171ce4a50e0490f5c87016c347a0d`, replying to the exact Windows failure
request. The four-file test/evidence correction integrates as **6a2b71e**.
Production uploader, contracts, app and dependencies are unchanged.

The owner established Windows-specific preconditions: rename over an open file
returned EPERM; chmod zero still allowed reading; an exclusive libuv open denied
another read with EBUSY. The tests now require those actual preconditions, preserve
exact outgoing-byte hashes and zero sends on refusal, name subcases, and assert
that intended race hooks actually execute. File-symlink cases skip only when the
Windows account cannot create them; directory junction cases continue. Original
failed hosted run36758470345 remains preserved.

Owner-local Windows evidence reports **26 pass / eight skips** out of34 including
subtests. Its committed text/JSON lack execution-source hash and timestamp; treat
it as author-reported platform evidence, not independently pinned execution. The
next exact-source hosted Windows run is the platform validation of this release.

Review found one test-only failure cleanup gap: if the exclusive-open precondition
assertion itself failed, its release closure never returned and the owned handle
stayed open. Lead's narrow integration cleanup closes that handle on failure and
restores POSIX permissions on its analogous failure; the original assertion still
throws. This does not change production upload behavior. Three exact extracted
helper probes with filesystem doubles reproduce the old leak and pass the fixed
cleanup; [before](cleanup-before.json), [after](cleanup-after.json). These are
synthetic failure-path checks, not Windows execution.

Lead executes only the two changed uploader groups: **16 tests including14
subcases passed, zero skips**, 246.99ms on Linux with owned loopback stand-ins
and temporary directories. [Actual log](changed-tests.txt). No full uploader,
DB, desktop capture or prior accepted campaign was replayed.

## Existing parent task: actual start and corrected boundaries

The same delivery confirms Web read the complete released host, runtime grants,
contracts, main hooks and affected requirements at aebd668 and started the ONE
existing parent task. Native handoff **handoff_ab13473197eead8de31a4373bd1144f0**
returns concrete implementation decisions, not a duplicate task:

- App restart uses false-consent control/current-state/read reconciliation and
  ends the old stream. It must not automatically replay original/frame/batch
  writes. An unknown batch remains unknown if the existing API cannot prove it.
- Current server Stop/withdraw or source permission loss also ends corresponding
  local capture using existing end/retention handling. Preserve pending prior
  originals; do not silently continue recording in a stopped session.
- Same-process temporary host loss may reconnect false only while explicit Start
  remains active and current authority is still live; it never revives capture.
- Stop latches before awaits, journals one key/body before first dispatch, prevents
  new sends and preserves in-flight uncertainty. Stable request counts do not
  prove a previously attempted write never committed.
- Trusted main node:http transport retains the browser-origin fence. Private FIFO
  and bounded Windows-to-WSL readiness remain development paths. No native-package
  or provider capability is inferred; only isolated lc_p0_test is in test scope.

The actual Mac immutable-original delivery89edd5c/35c75a4 is under independent
source review. It is uncompiled; declared47 tests and the Python fixture simulation
are not Swift execution. Existing Windows/Mac source/display/provider obligations
and user-preview/Paperclip isolation remain intact.

## Actual hosted correction result

Published exact97dd98d6e90fae77a3eb2b0e54ea60b2b8844624 ran as
[36762077273](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36762077273).
It **failed**:140 tests/subtests,133 pass,two reported failures,five skips.
The two reported failures are one unreadable-precondition child and its parent
group. The formerly failing rename-over-open case now passes. All three file-link
cases execute on this runner; remaining skips are POSIX FIFO and four conditional
real-Backend cases. [Receipt](hosted-run.json), [failed step log](hosted-failure.txt).

The actual stock Windows Node24.21.0 allowed another open while the numeric
libuv EXLOCK handle was held. Thus the asserted EBUSY precondition failed before
upload; the local Electron-as-Node observation does not establish this stock
runtime's exclusion behavior. The new catch-close path preserves cleanup on this
failure. No production upload defect follows from a failed test precondition.

Same-owner narrow correction accepted as
**handoff_d4459c7f284275a5bc7f1434aaf2feeb**: establish actual denied reading on the
hosted runtime, assert it, retain the uploader zero-send/refusal check and owned
cleanup. No broad skip/install/display/DB rerun is assigned. Lead will review the
actual delta and rerun the existing Windows workflow once; this remains the same
repair alongside Web's existing parent implementation task.
