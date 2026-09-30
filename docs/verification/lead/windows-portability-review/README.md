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

## Second repair: source reviewed, hosted validation pending

Actual `handoff_b28ae16cffdeaa0e5e2753ead6d2b44e` delivered
**5dc84936aa0c2d6765696092907a885c9f0ee6a6**, integrated as **f74db00**.
The complete Windows tree equals the reviewed source; its test-only delta replaces
the ineffective numeric flag with an owned PowerShell FileShare.None precondition.
The real second-open denial, uploader local refusal and zero-send assertions remain.
[Independent review](second-review.md) matches all four raw Git hashes in both
author runtime receipts. Stock Node24.19 and Electron24.21 are separate evidence;
stock hosted24.21 is still pending. Production uploader is unchanged.

One changed Linux group passes **8/8**, no skips,168.82ms;
[log](second-main-changed.txt). Four exact-helper doubles reproduce a nonblocking
test-only cleanup limitation: losing timers stay registered, spawn/stdin errors
are not handled, and kill-without-exit may wait indefinitely. This does not show
a false uploader pass or production failure; [probe](second-helper-probe.json).
Record this for the owner's next relevant test-helper edit, without blocking the
hosted gate or creating a parallel application task.

## Actual second hosted result and bounded diagnosis

Exact published **d49d101cd8d378e57ea54da6cb38fb89b80bb72c** ran as
[36764195464](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36764195464).
The **Windows job failed** with133 passes, two failures (the unreadable subcase and
its parent), and five skips. At uploader.test.ts:915 another open still succeeded
after the PowerShell helper signaled readiness. The precondition failed before
this upload path; no production upload failure follows. The Mac sibling succeeded,
which does not change this Windows result. [Raw run receipt](second-hosted-run.json),
[sanitized full Windows job log](second-hosted-windows-job.txt).

Support receives one on-demand diagnosis through
**handoff_38db85647e8969c081580624ea791b9c**: distinguish actual hosted helper
lifetime/environment/filesystem behavior and return a minimal repro or diagnostic
proposal. No broad skip, production change or fourth guessed rerun is authorized
by this failure. Web receives the precise result via
**handoff_83d5d85257a0560b806bd36f88206ed4** and continues its existing app-parent
implementation; original file ownership is unchanged. These are actual delivery
receipts, not proof the diagnostic has executed.

## Support delivery and smallest hosted diagnostic

Actual Support **handoff_66dc55cd193124d56d81a63669acf559** delivered
**d4e6bd1b986653901bc55eb92b36c7b34eeabee1**, integrated as **6fb10d4**.
The seven files contain a standalone stdlib probe, source-pinned local Windows
evidence and an **unapplied** Web-owner diagnostic patch. The local three arms
confirm real open/read denial while their owned helpers hold files, but do not
establish the hosted cause. [Support report](../../support/windows-share-lock-incident.md).

Lead independently reviewed the probe and the small manual-only
`.github/workflows/windows-share-lock-diagnostic.yml`. A second read-only review
checks evidence hashes and helper/workflow boundaries. Node syntax, YAML structure,
embedded Bash syntax and diff checks pass. No product suite is repeated locally.
One Windows2025/stockNode24.21 hosted execution of only this probe is the named
next operation; complete stdout/stderr and failure status will be preserved.
No Mac build, npm install, user-preview action, service or database is involved.
The proposed helper patch is not a verified fix and remains unapplied; Web keeps
its current app-parent ownership and work.

## Actual isolated hosted evidence — denial still fails, lifetime observed

Manual probe candidate **4166529b88e9be402ad98241d609eadccd4247bd** ran once as
[36766951888](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36766951888).
It **failed** (one module,0 passes/1 failure), and allthree diagnostic arms finished.
The [source/workflow review](support-review.md) and [raw artifact](support-hosted/probe.tap)
are preserved with [run](support-hosted/run.json), [artifact metadata](support-hosted/artifacts.json)
and [exact source audit](support-hosted/audit.json). Executed hashes match the
committed probe/test/workflow after Windows checkout LF→CRLF conversion; the raw
executed probe is retained byte-for-byte in `support-hosted/probe.mjs.gz` (local
gzip wrapping, exact decode SHA in `retained-bytes.json`). This keeps Windows
CRLF provenance without normalizing the executed source. The original one-line PowerShell command hash matches
d49d101 unchanged. An initial inspection parser expected GNU text checksum markers;
it was corrected to accept the actual binary `*` markers before auditing, without
changing the artifact or accepting a hash mismatch.

Actual stockNode24.21/libuv1.52.1 opens and reads the expected35 bytes in allthree
arms immediately and150ms later. In both traced arms PowerShell5.1.26100.33438 on
NTFS reports an open handle (`closed=false`), while its .NET second open fails with
HRESULT-2147024864. The release sentinel/byte is received only after the parent's
release event, then the handle is disposed and the helper exits0. No forced kill,
stderr acquisition error or early-input return is observed; all owned temporary
files are removed. This is failed read-denial evidence with complete observed
lifecycle, not an uploader or product pass.

The cause of this runtime/path/access difference remains unresolved. The Node
path contains RUNNER~1 while .NET reports runneradmin; native file identity across
those spellings is not yet measured. No Node regression, permission exception or
filesystem explanation is asserted from this evidence. Three identical reads and
.NET sharing errors alone do not select a repair.

ONE same-incident Support continuation **handoff_2782ba3cdc5039d8c4af06b9cee3b689**
asks for a minimal evidence-based source check/probe and reliable real denial,
with no settings/install/production changes. This send is accepted; a start or
result is not yet claimed. Web receives the concrete result through
**handoff_ecba14f87064bf5e3ba43cbb7b82c49e** and continues the existing parent
implementation. The earlier proposed helper-instrumentation patch stays unapplied:
the isolated probe already reproduces without the uploader or prior fs wrappers.
Lead owns any necessary single hosted follow-up; Web owns the eventual verified
test correction. No whole desktop suite, Mac, GUI, DB or provider run was repeated.

## Actual native-identity / byte-range continuation

Support delivery **handoff_41df7e031b97f69805de6107a69a46e6** supplies
**2010eab8e6dcd5ec6994dcfc6efe253323038ff3**, integrated as **1385cb8**.
Only Support probe/evidence files change; apps, services, contracts and workflows
stay byte-identical. The [follow-up](../../support/windows-share-lock-native-followup.md)
contains actual local Windows24.19 identity, native-open matrix and byte-range
read-denial evidence. This is not the missing hosted24.21 result.

Lead reviewed the complete native interop and cleanup path. Queries use only
owned-process TOKEN_QUERY and held-file facts; no token/ACL/account adjustment.
The byte-range arm requires successful same-file opens followed by real descriptor
and path EBUSY reads, exact hash recovery and normal owned cleanup. Node syntax
and diff checks pass. The existing manual diagnostic workflow will run once,
unchanged; no full desktop suite or product fault is inferred. The old proposed
helper patch is superseded and remains unapplied.
