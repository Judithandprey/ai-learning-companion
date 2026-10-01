# macOS pending and confirmed storage status

**Native result: passed** on exact published
`1199dbc8436d111c2fb0458e828cc9348943b4a3`,
[macOS-only run36813100587](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36813100587).
The actual App builds/packages and all **83 XCTest methods pass**, including
28 Link tests and all five new storage-status tests.
[Native record](native-verification.json), [actual test output](native-run/tests.txt),
[read-only artifact audit](native-run/audit.json).

The audit verifies115 artifact hashes and2848 source Git blobs/modes/paths,
reviewed native-tree equality, the built Mach-O/plist/package and executed test
names, with zero discrepancies. Existing fixture validators also pass (83 ingress,
27 composition,362 retained-frame and24 upload assertions); these are separate
from XCTest cases and actual-device acceptance. This resolves the pending native
check below without relabeling earlier Linux failures or historical78 results.

Owner delivery `30807f23a911739c089126d86b2b34d51976ea18`, received in
`handoff_5f123c736a6e803ba04d69cc271f5e7d`, answers the existing
MAC-STORAGE-COPY-01 task. [Actual delivery identity](delivery.json).
Review starts from main `c99ffd4733bbb9f2fda36e2849d51139d2f6c9e5`; the normal
owner baseline merge is `1e0e5a1`. The leaf changes only `apps/macos` and native
owner evidence. FrameStore, HTTP contracts, uploader policy, backend, Windows,
dependencies and mobile source remain unchanged.

The linked state now says "Linked to the capture service", while confirmed,
awaiting, unknown, refused and not-sent frame counts remain distinct. Pending
counts publish before the request. Retry intent is recorded before resending;
a failed journal write publishes restored counts without permitting another
send. Status text moves to the existing library so tests exercise the actual
app wording. The local journal optionally retains accepted-original counts for
an unsent batch, avoiding a false implication that nothing reached storage.
The batch-size test parameter keeps default/maximum 20. No new manager or layer
is introduced, and no provider is activated.

At delivery, native compile/test and actual Mac UI are NOT_RUN. Owner Linux
results are 27/28 Link tests and 79/83 whole-suite tests with recorded corelibs/
stub failures; they are not native passes. The previous native 78-test result
on `1a5dc06` remains historical and does not prove this changed source.

The owner said `git diff --check` was clean. Lead's committed-leaf check instead
finds trailing spaces in retained raw XCTest/mutation logs; source/current prose
passes. Preserve raw log bytes and their checksums. This evidence-only whitespace
exception does not weaken source checks or conceal an execution failure.

**Source integrated as `ed572b77db2dc9f4227fddd71683542825783e24`.**
Entire `apps/macos` equals the owner commit.
[Presentation/evidence review](presentation-evidence-review.md) approves the
public library text getters/App import and verifies all seven original log hashes. [Runtime review](runtime-review.md)
finds no blocker; two exact value-type probes pass. Actor/lifecycle conclusions
come from source inspection, not a portable runtime pass.

The existing hosted-artifact auditor now accepts an explicit storage-status
milestone (83 tests, including the five new required methods); historical
parent-link defaults remain78. [Audit review/controls](audit-review.md) checks
the historical default unchanged and rejects old78 evidence under the new mode.
This avoids copying the artifact auditor or re-labeling previous results.

The exact-source native check above now supplies actual compile/test evidence.
The original source-review checkpoint and its then-NOT_RUN boundary remain
historical; it is not a continuing build blocker. Real Mac screen permissions/UI, physical pen,
actual PostgreSQL, real provider/audio/Notability and both full §7.1 gates remain
unverified. User availability of an interactive Mac is pending; no purchase or
new configuration is inferred. Windows' separate focused QA continues on its
published candidate; do not repeat that campaign here.

Next: Lead reviews the independently assigned Windows QA result when delivered.
Native/QA require a usable authorized Mac for interactive permission/UI/capture/
ink/Stop acceptance; the existing availability question remains unanswered.
No duplicate build, mobile campaign or provider activation is assigned. Native
receives the exact tested result and next dependency in one substantive handoff.

The native owner received this tested result through accepted
`handoff_be3269b5c8bbcdb3c3adc1773d90f53e` at exact published evidence baseline
`0c4783e1382d83b23fd4930a9ffd5fa579ab4580`. The initial
[receipt](result-handoff.json) is unread/execution_started:false; delivery does
not prove reading or further execution. No acknowledgment or duplicate task was
requested.
