# Mac parent correction: reviewed source, native checks next

Actual [delivery](delivery.json) `handoff_cffbe3c0eeeec20ae95d45b441f5e4d4`
contains owner correction `fb891d699cc33cde10c2a1fa25928f3c87346b3f` on the
preserved parent `f625b48`. The two reviewed leaves integrate as `d3a983b` and
**`295d7787e957ee3fdf4db2a2f586778a383ab0cb`**. Entire `apps/macos` is
byte-identical to the final owner tree. Windows, shared packages/services,
root CI, dependencies and mobile source are unchanged.

All three original source HOLD findings are closed within their demonstrated
scope. The [original failures](../README.md) remain historical evidence.

| Finding | Actual bounded correction evidence |
| --- | --- |
| MAC-PARENT-C1 | Sticky record failure fences later requests and reconnect, ends only its owned host, retains local capture/originals, never sends an unwritten Stop. A believed server end still ends capture when its save fails. |
| MAC-PARENT-C2 | Reopened same-revision Stop reuses exact key/body. A changed revision creates a distinct command, keeping the old witness. Unknown remains unknown; a known-refusal control retains its distinction. |
| MAC-CONTROL-01 | A potentially committed write followed by a typed refusal remains unknown with that later status. Matching success settles it; first refusal and pre-send Stop controls remain valid. GET does not inherit write uncertainty. |

The [coordinator review](mac-parent-fb891-review.md) ran **11/11** groups using
actual candidate coordinator code, real isolated chmod-induced file faults,
existing Apple/Darwin stubs and fake owned hosts/HTTP. Its
[results](link-probes/results.json) preserve healthy flow, teardown, recovery,
same/changed revisions and uncertainty controls. No actual native process or
network behavior is proved by those doubles.

The [control review](mac-control-fb891-review.md) ran **9/9** groups on the
extracted exact sender/validator and existing helpers, checking byte-stable
retries, carried401/403/404, matching success and GET distinction.
[Results](control-probes/probe.json). No socket, DB, GUI or provider was used.
The earlier app/host/source reviews remain applicable to unchanged paths;
no redundant complete Linux suite ran.

[Scope/build preparation](mac-parent-build-review.md) verifies 21 correction
files, all 14 correction checksum entries and unchanged app/package/FrameStore
paths. The 11 original owner evidence hashes also match. FrameStore retains
SHA-256 `0ba0759dde8d09c8d13cd503b6b8da9ce596a3107b4cbc5f270586a9152a19d8`.
Current source declares **78 XCTest methods in eight files**, including 23 Link
tests. These are upcoming native-run expectations, not 78 passed tests.
Owner Linux logs retain **74/78** with four redirect/stub failures; they are not
silently exempted or relabeled as Mac passes.

## Native verification boundary

Lead runs the existing macOS-only `desktop-checks.yml` on the exact pushed
reviewed source. It builds/packages the actual app, runs all release XCTest
methods and existing fixture validators. The scoped [artifact audit](audit.py)
requires the exact approved tree, full archive/blob/package identity, all 78
executed tests and real retained outputs; it cannot infer success from counts
or a workflow-dispatch receipt. The historical 55-test audit is unchanged.

At this source-review checkpoint native build/test is **NOT_RUN**. Append the
actual run/artifact result before claiming native compilation or tests. Hosted
checks cannot prove interactive Mac permission UI, screen/ink, sleep/logout,
physical input, actual PostgreSQL, audio, AI or Notability. Both full §7.1 gates
remain open. Missing interactive Mac access does not block this compiled-source
milestone; it remains a separate next validation dependency.

The tests/probes retain their actual `/tmp` interpreter/harness paths. Committed
`probe.txt` is the exact original `probe.log`; no binaries, cache or credentials
are included. The exact shim is retained in `link-probes/AppleShim.swift`.

Next: Lead executes/audits native CI; Native fixes any concrete compile/test
failure in the same task. Windows QA already adopted release `86d2405` through
`b64669f` and has owned runner edits (read-only observation); no Windows test
result is inferred, and that role is not reassigned to a duplicate Mac campaign.
