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

Hosted macOS compilation,55 declared XCTest methods, actual emitted upload-fixture
validation and exact Swift-byte-to-Backend composition are **pending** at this
source release. Counts are not executed evidence. Lead will record the exact run,
source/artifact audit and actual results before closing this component gate.
No repeated Windows campaign is needed; its portability gate is already closed.

## Actual native mail and next owner

- Task `handoff_bd40c1175a77a0d24244711d89c296ca`; actual start
  `handoff_fbe03247d9a519c02476c193036e3522` after preserving merge64e2302.
- Delivery `handoff_40ad7b78d1d64105d4e2cb8c439bb67b` at20:44:20Z.
- One status-evidence correction `handoff_be02665a7ff962ceacb0309a3a5b8fe3`;
  actual corrective delivery `handoff_5be907decccc8509c817100824716877` at20:52:36Z.

Lead owns the exact hosted check and actual-byte composition; Native owns any
resulting source correction and the next explicitly released app-parent wiring.
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
