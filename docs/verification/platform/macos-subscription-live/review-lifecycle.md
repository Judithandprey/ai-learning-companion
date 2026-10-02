# Independent review: retained Mac live lifecycle

Reviewed on 2026-10-02 in `wt-platform`, HEAD `5d8d12128721f4eb38d48e526738c34c667cdf53`, including the retained dirty live changes. Scope: `LiveLink`, reused `AskChild` writer, `LiveLinkTests`, and the `LiveController` → `CaptureController` → `InkController` call flow. PONYTAIL LITE applied: reuse existing cancellation/writer primitives, retain originals, and check the real call path. No production changes, account/provider calls, compilation, or device operation were performed by this reviewer.

Sources read: AGENTS/TEAM/workflow/ios role and directory, current decisions, complete original/English §3.8/7.1–7.3/7.7, relevant V-LongRunningCompanionship/V-SourceTimeRelations cases, audio boundaries, and ADR 0004. Source/translation hashes for main requirements, decisions and original-goal verification matched their manifest.

Snapshot fingerprints (before the parent's review corrections):

| File | SHA-256 |
| --- | --- |
| `LiveLink.swift` | `f028d9b400c0cbd2f80edc214042ddbc0a6019a00c9d9edcd5c5f4da32fed233` |
| `AskChild.swift` | `39d045b4ec103c0cea99189a71c690fddcaafe27afa40b311295a80cb0849f2e` |
| `LiveSession.swift` | `6e3bfa339536b265ecf0d29fe3adcea8d8ad09198d90b36f133122a0b859dc7c` |
| `LiveLinkTests.swift` | `6354c9e96c360bf04a93a232d81519b2777583355bcab7e4afc47288b01b1d61` |

Line references below name this snapshot. Paths are relative to `apps/macos/CompanionDesktop`.

## Findings requiring correction or a focused regression

**F1 — High: current-picture loss does not supersede queued/preparing observations, and a late observation clears the newer loss.** `Sources/DesktopCapture/LiveLink.swift:632–635` only changes `missed`. A waiting input survives; `LiveSession.swift:173–181` later dequeues it. A render already started at `LiveLink.swift:677` only rechecks session identity/running at 678–686 before sending. `LiveSession.looked`, 259–262, unconditionally clears `missed` when any observation finishes.

Two deterministic regression scenarios are needed (source-derived, not executed here):

1. Configure a 500 ms interval, complete retained F1 at fake host 1000, and offer retained F2 during the cooldown; report newer unretained F3 through `noPicture`; advance the fake clock by 0.5 seconds and await the scheduled pump with the existing bounded `until` helper. F2 must not be newly submitted as the current unattended picture, and F3's loss must remain visible until a newer valid input arrives. Current source submits F2.
2. Make `FakeLiveConnector` hold observation F1; wait for its turn to arrive; call `noPicture("latest F2 unretained")`; release F1 and await the offer task. Keep the useful historical observation receipt, but retain F2's current-picture gap. Current source clears that gap.

Test 1328–1387 only checks a nil follow-up image and the immediate `noPicture` status (1354–1364), with no waiting/rendering/delivered observation. It does not cover either failure. The parent's planned correction should separately withdraw an undelivered observation using the existing revocable writer, preserve partial-write shutdown, and avoid interrupting an already delivered useful historical observation merely to preserve current freshness state. Explicit selected historical pixels remain a different, authorized path.

**F2 — Medium: explicit requests do not honor the observation's local in-flight reservation; an old preparing look can follow a newer focus.** `pump` reserves `session.out` before rendering at `LiveLink.swift:672–677`. `ask`, 772–870, neither rejects/pends an explicit request when `out > 0` nor interrupts the observation. If the focus render finishes first, its `number`/`sent` can advance `frame_seq`; the old render resumes and sends its earlier sequence at 710 without checking that supersession. A delivered held observation and a focus can likewise leave two live turn calls locally. The real connector's one-request guard may reject one as busy/stale; this review does **not** claim that two real provider inferences run concurrently.

Focused scenario: hold an observation, then confirm a focus. Assert the chosen documented policy—visible busy/pending or explicit interruption—and at most one model-bound request. Separately use a deterministic render barrier in the existing harness to let a newer focus overtake a preparing observation; assert the old look is discarded with a stated gap. `FakeLiveConnector` explicitly enforces no connector session rules (`LiveLinkTests.swift:8–11`) and can accept overlapping held turns. Current tests 1392–1512 replace held card requests, but do not test a focus during an observation or render overtaking.

## Lifecycle and coverage assessment

| Boundary | Source assessment and current test scope |
| --- | --- |
| Explicit Start, no renewal | Guarded; stopped capture IDs cannot start again. Tests 837–1015 cover bounds/model rejection, expiry, repeated Start, Start stopped while writing, and later explicit Start. No automatic provider/session renewal found. |
| Stop/cancel/stale results | Session ends before awaiting Stop; `fence` revokes undelivered lines and prevents late card text. `show` checks current card/request/session; full provenance binding is parsed before it. Tests 1392–1570 cover cancel, replacement, Close, Stop, uncertain interrupt, unsent cancellation and synthetic partial-write loss. |
| Revocable writer | Reused implementation locks revocation against delivery of the final newline (`AskChild.swift:116–140`), marks cut-off before later queued writes (302–325), and ends only its own process with bounded escalation (376–415). Dirty changes only parameterize incoming-line size. Real-pipe ASK tests exercise this shared primitive; the live test at 1836 covers live output size. |
| Retired children, Quit/reconnect | `retire`/`retired`, `connect`, `lost` and `shutdown` retain and await children and use launch serials. Source path exists. `FakeLiveConnector.endDelay` is fixed at zero (124–125); live tests do not exercise lingering retired-child Quit, simultaneous Connect, or Connect racing Quit. Existing ASK tests at 1719 and 2434 exercise **AskLink**, not LiveLink. Port the focused delayed-end assertions to live without repeating the whole old mutation campaign. |
| Coalescing/reserve/no retry | Pure state and link tests cover newest waiting frame, interval, request reserve, usage accounting, typed denial, uncertainty and no renewal/retry. F1/F2 are the missing supersession/concurrency boundaries. |
| Invalid focus geometry | `InkController.finishAsk:261–279` passes mapping failure and geometry through `LiveController.selectionConfirmed:125–130`; `LiveLink.selected/ask` suppresses unlocated automatic focus and permits words with a current full picture alone. Builder test 725 and selected-path test 1366–1386 cover supplied invalid geometry/unlocated state. Actual controller wiring and display change remain source-reviewed/uncompiled; no AppKit interaction test proves them. |
| Reopened ink | `InkController.reopenLatest:317–327` opens the retained original, saves, and now calls `capture.pictureChanged`; current input freezes its actual document revision. The callback is present. Current live tests exercise ink composition after drawing, but do not drive `reopenLatest` through the app to assert enqueue/save/reopen. Device acceptance remains open. |
| Fresh picture at UI entry | `CaptureController.liveInput:399–403` rejects last-kept pixels older than `lastNewPixelsSequence`; `pictureChanged:407–413` reports loss. This closes new follow-up input selection, but F1 shows it does not revoke old scheduler input. |
| UI input queue | `LiveController:30–42` uses a default unbounded `AsyncStream`, although `enqueue` itself is short. Loss events use separate Tasks at 134–136, rather than that ordered stream. Under a delayed actor consumer, an older retained input can arrive after its newer loss notification. No measured memory growth is claimed; add a focused ordering assertion and keep the model-bound pending queue bounded/coalesced. |

**Evidence status:** completed source/call-flow review and manifest checks only. No newly executed Swift tests, native compilation, real connector/model call, screen permission, pen, audio, or interactive macOS acceptance. The dirty app changes remain uncompiled on macOS. Prior hosted baseline builds and claimed Linux harness runs cannot certify this reviewed snapshot or the missing UI/device behaviors.

**Next owner:** parent/platform owner corrects F1/F2, runs the narrow regressions and delayed-retirement live check, and records the final source fingerprints/results. Lead retains native hosted-build/integration ownership; independent real Mac acceptance remains a named hardware/session dependency.

## Correction disposition — second source review, 2026-10-02

Rechecked the parent's bounded production corrections; this reviewer changed only this report and executed no additional Swift or old ASK campaign.

**F1 is corrected at the source boundary.** `LiveSession.pictureUnavailable/canObserve` drops waiting input and marks previously numbered renders unavailable. `LiveLink.noPicture` only revokes observation lines whose final newline has not been delivered; delivered historical observations remain useful without interruption. `pump` checks the render watermark, and `looked`/failure handling preserve a newer missing-picture reason. `LiveController` now yields picture and unavailable events through the same ordered stream. The missing-picture test genuinely holds/releases an observation, asserts the loss survives its historical result without interrupting it, drops a cooldown input, waits for its timer, and then restores coverage with a newer valid picture.

**F2 is corrected at the source boundary.** An explicit card first supersedes pending/preparing looks, fences and interrupts prior turn requests, joins their local out slots, then reserves its own rendering slot. The `defer` releases that slot on cancelled/replaced cards, missing input, failed render/validation or an ended session; after handoff, `send` owns its release. `pump` pauses while the explicit card is asking. Stop/replacement/session checks remain before handoff and presentation; full request provenance is unchanged. No new same-session Stop or answer-presentation leak was found in these corrected paths. The focus regression checks the interrupt precedes the focus turn and that the interrupted submitted observation still consumes its allowance. Its fake removes the held turn and emits its terminal cancellation before the control result; it remains a synthetic lifecycle check, not provider acceptance.

**Retirement ownership is corrected.** `lost` registers the old child before its first await; `retire` avoids duplicate registration. The new live retirement test uses a delayed child end and detects overlapping launches, covering both Quit and reconnect. Its fake marks exit only after that delay. Execution was still pending when assigned to this reviewer; the parent owns the final result. The parent reports the other three focused corrections passed on Linux; this reviewer did not independently execute them. No native-build or device result follows.

One minor wording issue remains in this reviewed snapshot: a valid explicit focus that supersedes an observation still being rendered can reach `pump`'s `canObserve` failure and set `missed` to “the current picture is unavailable,” although the picture was displaced by request priority. Preserve the gap, but use a priority/coalescing reason for this case. Direct renderer-stall/cancel-defer and delayed-terminal-interrupt cases remain source-reviewed rather than independently executed by this reviewer. The ordered UI stream still uses an unbounded buffer; no measured memory failure is claimed.

Correction snapshot SHA-256: `LiveLink` `7f0c7423c14f4c922f8102dfc123207ae8a9d288b59512aab9dc0363e11b195a`; `LiveSession` `8505cec146027ffd481e10f7cc07daad255b11e93173a3d41432a2ef806e1bb7`; `LiveController` `f61a381c1e3d016e68993d8a9e2f1b4cb851660a84313b4affa6519ba29f52dc`; live tests `bc56a6443ef92c91654da52d658ce7bae11a158237c467cdb6f5c984c6708b86`. These identify the recheck while the parent continues final tests/edits; its final evidence must identify the delivered snapshot separately.
