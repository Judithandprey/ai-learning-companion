# Independent Mac live wire/evidence review — 3147291

Candidate: 3147291f449105c06255cfc0ea2056f1b2582437, parent 5d8d12128721f4eb38d48e526738c34c667cdf53. Read-only candidate inspection and scratch-only exports. No native build, suite rerun, network, account, model, device, audio, or TTS action.

## Disposition

Bounded approval of LiveWire/LiveFrame, same-frame/historical focus metadata, corrected bounded-history omission notices, and recorded evidence integrity. Source integration remains HOLD for the root-confirmed capture-freshness blocker below and the separate lifecycle review. Native compilation/interactive acceptance remain open.

## Freshness blocker corroboration

Candidate CaptureController.swift:397–402 allows `liveInput` when the retained frame sequence equals lastNewPixelsSequence, without currentFreshness. receive:374–382 calls pictureChanged only on a higher lastNewPixelsSequence. The one-second ticker:91–93 changes only now. CaptureRecorder:127–136 and171–175 invalidates pixelsCurrent for status-only/blank/suspended/complete_without_image without replacing lastNewPixelsSequence; no callbacks also eventually makes Freshness unknown. Consequently Start and a typed follow-up can receive the old frame as current; new ink can cause an unattended request over that same stale frame. Existing pending renders/observations are not notified by noPicture.

LiveFrameInput (LiveFrame.swift:18–42) carries no Freshness. LiveTurn.json (LiveWire.swift:534–564) supplies frame_captured_at:null and no capture-loss marker; LiveRendered.composition's historical wording is a local saved record, not model context. The wire does not repair the false current-source claim. Required behavior is in main §7.1, R52 and AUDIO-14: unavailable/stale frames cannot stand in for current pixels, and source loss must fence unsent work.

Executed scratch Swift source-state probe: exact candidate Freshness.swift with small SessionStatus stubs and the candidate retained-frame equality predicate. blank, suspended, complete_without_image all return Freshness.unavailable; no_callbacks returns Freshness.unknown; all four still pass equality and have no new-pixel event. This is not full app or native execution. `swift-frontend -interpret` exit0. Earlier standalone compilation attempt lacked sysroot swiftrt.o; interpretation used the retained approved toolchain without installation.

Probe: freshness-source-probe.swift and freshness-source-probe.txt in this folder. Repair in original app owner: gate new current-frame input on actual Freshness.live, drive the existing noPicture path on loss including timer-driven silence, and check again before sending pending rendered frames. Retained historical selections/context must remain distinguishable and preserved.

## Executed bounded verification

- All53 owned_source hashes and all9 released_read_only_inputs hashes match git-show candidate bytes. Native Swift/checker/README manifest membership is complete.
- All54 SHA256SUMS entries match and cover all evidence files except the checksum file itself. Verification-results source_manifest_sha256 matches actual manifest bytes.
- All8 English/source translation-manifest hashes match both candidate and main0fe1599. All9 released inputs are byte-identical on main.
- Exact candidate validate_live_session.py rerun over saved synthetic fixture: PASS211 checks,10lines,6turns; one same-frame follow-up and one historical-focus follow-up. Rebound six results semantically equal saved fixture/results.jsonl. No native fixture generation claimed.
- Saved broad log count independently parsed:118passed,6failed,124methods; candidate has124test-method declarations. Remaining six failures are retained. No broad suite rerun.
- Fixed latency bound at LiveWire.swift:595 rejects >9007199254740991 before Int conversion. Corrected context(for:extra:) notices partial/current-frame omissions and omitted gap runs while preserving explicit focus, originals,24entry/64gap bounds. Prior review fingerprints correctly identify pre-correction snapshots; they are not final-source approval.

## Limits

No new wire-specific blocker found. UI freshness remains a product correctness issue even though fixture fields validate. LiveFrame raw originals and editable ink stay separate from derived composites; missing URL/time/version remain null. Voice/audio/spoken captions, content anchoring, persistent panel placement, exploration scope, real-AI Mac receipt and Notability import remain explicitly unfinished. Protocol validation and Linux stand-ins do not close those gates.
