# Mac retained-original upload integration

Native delivery `fb1d1ed3f3f0d35f88367a03551c15ca705f6f12` and evidence correction
`bcfda2c7b5362516135790242767cdb5683a2555` integrate as `8f50f67` / `11e65fc`.
This is a callable native transport component for existing P0-03/11 and Lead
P0-07/08, under R02/R03/R08/R35/R36/R46/R51/R52/R59 and A12/A14/A26/A30/A31/A44.
The app does not call it yet. Both full-product screen-to-AI gates remain open.

## Source review and correction

Three bounded independent Astra source reviews approve the retained-file/batch,
transport, and test slices. [Batch review](macos-upload-batch-review.md) records
nine Linux descriptor probes; [transport review](macos-upload-transport-review.md)
records two source/Backend error-alignment groups, including 34 Backend replies.
These did not execute Swift or native networking.

The [test review](macos-upload-tests-review.md) found that saved exchange statuses
were ignored and hardcoded as200. The existing production sender checks status200;
this demonstrated an evidence gap, not a production acceptance bypass. The owner
correction saves actual `(status, body)` pairs and checks each status. The original
PUT403/POST403-with-success-body probes now refuse, while the same baseline and
bearer-sensitivity control remain correct: [four-group retest](macos-upload-status-fix-review.md).
Old failing evidence is retained. This retest uses the explicitly Python-simulated
fixture, not actual new Swift output.

[Source equality](source-check.json) pins six affected native files to the owner's
final delivery. Contracts0.1.0–0.2.12, production services and dependency locks are
unchanged. The transport reuses the existing retained archive, current authority,
original0.2.2/HTTP0.2.4, Process0.2.0 and Mac0.2.12 paths. It preserves exact retry
bytes/key, local originals, unknown clocks and uncertain outcomes without app
activation or restart replay.

## Verification release

Three [focused CI orchestration tests](ci-wiring.txt) passed, including missing/bad
upload fixture and failed-checker retention. These use tool stubs and do not
establish native compilation or HTTP execution. The existing pinned desktop
workflow now emits, validates, hashes and retains `macos-upload-fixture`.

Exact pushed `e01fd5c2860cbe2d260f7df866649667f65be230` passed the one
[macOS-only hosted run36776189495](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36776189495)
in3m16s. App build/package and **55 actual XCTest methods in seven files** pass;
the new Swift upload fixture passes **24 checker assertions, including18 negative
controls**, with40,320 actual Swift UTC verdicts checked against the released
validator. Existing emitted-fixture checks remain separately83/27/362, not additional
native tests. [Actual test log](tests.txt), [upload checker log](mac-upload-fixture.txt).

[Artifact audit](hosted-audit.json) verifies115 file hashes, all2509 source Git blobs,
exact reviewed native tree, arm64 package and actual run/job/artifact correspondence.
[Audit source](audit.py) does not execute the package or repeat the native checks.
The raw source/fixtures remain in the hosted artifact (14-day retention) and the
local download named in the receipt; this record is not a user-device run.

[Actual-byte composition](composition-result.json) submits the **exact Swift-emitted
14 PUT request bodies and POST bytes/key**, not reconstructed requests, through the
existing actual ASGI handlers with explicit synthetic authority and MemoryStore.
It verifies original readbacks and committed ACK for eight frames, identical replay,
same-store reopen, exact Learning raw/composed pixels and unknown clocks, then Stop,
source withdrawal and token revocation. Both immutable editable JSON originals
remain unchanged. All49 supplied fixture files remain byte-identical. The redacted
synthetic bearer marker is replaced only by the test runtime's token. This did not
execute a native socket, database, application UI or real provider.
[Composition source](composition.py), [execution receipt](execution-manifest.json).

Lead caught two preparation-only probe assumptions before execution: the native
tree path must include `CompanionDesktop`, and legacy `session.live_capture` remains
false independently of the current control stream. Both were corrected before the
one actual composition run; no product source or assertion about physical capture
was weakened. The original status-checker failure remains preserved separately.

No repeated Windows campaign was run; its portability gate is already closed.

## Actual native mail and next owner

- Task `handoff_bd40c1175a77a0d24244711d89c296ca`; actual start
  `handoff_fbe03247d9a519c02476c193036e3522` after preserving merge64e2302.
- Delivery `handoff_40ad7b78d1d64105d4e2cb8c439bb67b` at20:44:20Z.
- One status-evidence correction `handoff_be02665a7ff962ceacb0309a3a5b8fe3`;
  actual corrective delivery `handoff_5be907decccc8509c817100824716877` at20:52:36Z.

Lead has completed the exact hosted check and actual-byte composition. Native is
next owner of one app-parent/Start/Stop wiring task at the published evidence baseline.
The exact evidence baseline `923217b720601c445dac4d1b48ad4d6920513096` was pushed
and verified on origin/main. ONE [next app-parent task](next-parent-task.md) is
accepted as `handoff_8c960a9dda2facc356f60a5408088843`. Actual start reply
`handoff_2184abf05509d9c4a766c1a14beac34c` at21:05:16Z confirms owner merge497e05c.
Lead independently verified baseline ancestry and identical `apps/macos` trees;
[receipt](next-parent-start.json). This is a start, not a completed implementation.
Windows retains its existing independent parent task. QA follows a reviewed runnable
candidate, not this disconnected callable component. No acknowledgment-only reply
or duplicate worker task is needed.

## Remaining limits

No actual interactive Mac, on-socket URLSession/redirect/ATS behavior, screen
permissions, real pen/audio/provider or Notability import is accepted here.
The Foundation response parser's duplicate-member collapsing remains documented;
the current Backend emits unique members. Cross-call uncertainty, trusted bootstrap,
explicit Start/Stop, safe reconnect and no automatic write replay after restart
remain parent responsibilities. A stored receipt does not prove AI saw pixels.
