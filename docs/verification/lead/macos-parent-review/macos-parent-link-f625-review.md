# macOS parent coordinator — HOLD

Candidate `f625b480e591682be75dd6a7617c08eee4cf7bd6`, read-only export `/tmp/lc-macos-parent-f625b48`; canonical main `b362c1e74f59faede8c3edc1fb13163c9297461f`. Scope: `CaptureLink.swift` journal, registration/source, send/Stop/restart/lineage/reconnect and relevant tests. Host transport/control and App UI have separate assigned reviewers.

**Two concrete coordinator findings require correction.** Three bounded Linux interpreter cases completed: one healthy control and the two reproductions below. This is **not macOS compilation or native XCTest evidence**; all 70 declared native tests remain unexecuted by this review.

## MAC-PARENT-C1 — sticky persistence failure still permits a source mutation

`Sources/DesktopCapture/CaptureLink.swift:596–600` ignores the save failure after a successful registration. `current()` at 475–478 checks gate/Stop/identity but not the sticky fault. Consequently `connect()` continues through `GET` at 552, ignores another save failure at 555, and dispatches `PUT` display-source at 575–576. `launchHost()` at 632–642 and reconnect at 934–951 have the same missing propagation/guard pattern.

Minimal reproduction: let the first stream registration return its exact matching live state, but make the owned journal directory read-only immediately before returning that answer. Its subsequent save fails. The in-memory transport observes:

```text
POST /v2/process/streams                         connecting
GET  /v2/process/streams/<stream>                notConnected; record could not be written; nothing more is sent
PUT  /v2/process/display-sources/<source>         notConnected; record could not be written; nothing more is sent
```

Thus the record fault is already visible before a new mutating request. The positive control completes registration, GET, source PUT and Stop with a writable journal. The failing case sends no Stop while the fault is sticky, consistent with the existing Stop guard; that does not undo the source PUT after the fault.

Scoped fix: propagate persistence failure out of registration/launch/connection transitions and recheck the sticky fault before further host/request work, including reconnect continuations after awaits. End the owned child as appropriate; preserve local capture/originals, unknown outcomes and the journal. Do not equate a storage fault with renewed capture permission or force local capture to stop merely to implement the send gate. Add the above failure-after-registration regression and retain the healthy control.

## MAC-PARENT-C2 — reopening an unknown Stop discards its replay key

`CaptureLink.swift:317–358` reconciles an open stream by reading it and invoking `sendStop`. At 1095–1103, that method always constructs a new `.stop.<count+1>` key and appends a new witness. It never selects the existing persisted Stop body/key. This differs from the promised durable same-key retry and the accepted Windows lifecycle decision.

Minimal reproduction: load a valid registered stream, state live/revision 1, with a persisted `probe-stream.stop.1`, exact unknown-boundary Stop body for revision 1, outcome `unknown`. Fresh-consent-false reconciliation reads live/revision 1. Observed request:

```text
persisted key: probe-stream.stop.1
sent key:      probe-stream.stop.2
body:          byte-identical; expected_revision remains 1
```

The exact candidate validator accepts the seeded journal; reconciliation sends only GET, Stop, GET and launches with `fresh_consent=false`. The finding is the changed identity of the pending operation, not an automatic new capture grant. Released Backend CAS/current-authority checks still constrain duplicate transitions; this probe does not establish a server resurrection or duplicate committed Stop.

Scoped fix: reuse the persisted applicable unresolved Stop key and exact body while reconciling that revision. Create a new command only when a reconciled changed revision requires one, or when no prior command exists. Validate a persisted Stop's body/identity/revision before using it, since this implementation currently does not consume the stored body for replay. Retain old outcomes and originals. Add same-revision unknown-reopen and changed-revision controls without widening the wire contract.

## Evidence and limits

Read the complete 1,296-line coordinator, relevant control/uploader paths and `CaptureLinkTests.swift`, the lead's `macos-upload-integration/next-parent-task.md`, and the owner's report. Applied PONYTAIL LITE and current lifecycle/source/ink decisions and original/English clauses, including R29/R30/R35/R36/R46/R51/R52/R59 and Stop/replay obligations. Relevant canonical sources remained unchanged from the preceding scoped requirement refresh. No implementation or repository/worker file was changed.

The probe uses exact candidate production files with only the existing Linux harness adaptations: Apple/Darwin imports replaced by the existing `AppleShim.swift`, FoundationNetworking/Glibc imports added, and the unrelated corelibs `waitsForConnectivity` assignment omitted. **No coordinator logic was patched.** Both host launcher and HTTP transport are in-memory fakes. The journal write failure is an actual chmod-induced failure in an owned `/tmp` directory. No host child, socket/listener, DB, GUI, provider, real screen/ink input or full suite was run. Source equality and every normalized-file hash are recorded separately.

Reproduce with the already available Linux Swift 6.3.3 toolchain and harness:

```sh
bash /tmp/macos-parent-link-f625-probes/run.sh
```

Files:

- Probe: `/tmp/macos-parent-link-f625-probes/src/main.swift`
- Runner: `/tmp/macos-parent-link-f625-probes/run.sh`
- Actual stdout: `/tmp/macos-parent-link-f625-probes/probe.log`
- Machine results: `/tmp/macos-parent-link-f625-probes/results.json`
- Exact input/normalized source hashes and harness adaptations: `/tmp/macos-parent-link-f625-probes/source-manifest.json`
- Review metadata: `/tmp/macos-parent-link-f625-review.json`

This closes the bounded review with HOLD; no missing-journal expansion or extra campaign. Native compile, interactive macOS Start/Stop/permission/ink, actual Backend socket/DB and provider acceptance remain open.
