# Independent source review — MAC-LIVE-03 correction-02

2026-10-02. **No blocking source issue found in the bounded correction.** This is an independent code review, not an independent test execution, compiled macOS result, native UI/capture result, or real-provider/device acceptance.

## Scope and exact binding

Native baseline HEAD: `4f6c327018d46604b21c57ab4ebf2b0e45278f70`. The three production edits and the new five-method regression file were reviewed as working-tree bytes over that commit; the correction commit had not yet been created. The hashes below bind the reviewed bytes exactly and remain valid if the owner commits those bytes unchanged. No future commit SHA is inferred.

Lead's exact assignment/reproduction baseline: `8467e0a55113455f62067d97a8774dca889c3d88`, read through `git show` at `docs/verification/lead/live-windows/macos-live-review/correction-01/README.md`, including its unchanged paired frame-advance probe. The review read current AGENTS/TEAM/workflow/role guidance, current decisions, complete affected main §7.1/7.2 original and English clauses, R52, AUDIO-14 (an original English specification), and V-LongRunningCompanionship/V-SourceTimeRelations original and English cases. All eight source/English manifest hashes matched; affected specification/workflow bytes were unchanged between the native and lead baselines.

| Reviewed file | SHA-256 |
| --- | --- |
| `apps/macos/CompanionDesktop/Sources/CompanionDesktop/CaptureController.swift` | `7a720eb18548a594d48d67ac32d30959f070db832e1cdc0b1667dcf5a2ab42de` |
| `apps/macos/CompanionDesktop/Sources/CompanionDesktop/CaptureRun.swift` | `21e6f73dacfbb8fa5e1e1ddd3adfec0587d6ba2d133ae30c9ce964f83064f138` |
| `apps/macos/CompanionDesktop/Sources/CompanionDesktop/LiveController.swift` | `4b6f619454aeac3201428d06f8c5bcebb6e302ea0940e8bc32a0be594f1b2021` |
| `apps/macos/CompanionDesktop/Sources/DesktopCapture/Freshness.swift` | `a574f0a82ef04d1d20c21b6fcbfe7ea79ee8ad7ab25ee0b05b9fbda46f994450` |
| `apps/macos/CompanionDesktop/Sources/DesktopCapture/LiveFrame.swift` | `afdf0a4e3139dae803a66cb35667ece952a886190adef655497cc0e1c22e263f` |
| `apps/macos/CompanionDesktop/Sources/DesktopCapture/LiveLink.swift` | `05b24c7ebcdf3ce269e8a07bd2688aeaaa06c0d686d00ea7202abfe565080097` |
| `apps/macos/CompanionDesktop/Sources/DesktopCapture/LivePresentation.swift` | `e64d2a0ecc444e52619eaef8c3c04b47f478d12f9a7101cca6405a679de4383c` |
| `apps/macos/CompanionDesktop/Tests/DesktopCaptureTests/LiveFrameAdvanceTests.swift` | `69b49e72bdb0ce55e523a4cec4420ce7ff40feb4eaf10223bec4e225ef5e2e91` |

## Findings and preserved boundaries

- `Freshness.currentFrameProblem` emits the dedicated healthy-advancement classification only after the existing freshness judgment permits live pixels, the requested sequence is positive and strictly older, and the newest retained sequence equals the newest pixel sequence. Missing/unretained pixels, unknown source time, callback silence, stale pixels, blank/suspended callbacks, stopped capture, and future/zero/negative sequence mismatches retain refusal semantics.
- `LiveFrameInput.presentationSourceProblem` wraps the original sequence-bound callback dynamically. It filters only that exact healthy-advancement classification at first presentation; it does not snapshot permission at response receipt. `dispatchProblem` still rejects the older input, and the existing queued-render and write/final-byte admission checks remain strict.
- `LiveLink` uses the wrapper only for the answer's first-display permit. A refusal of obsolete current input does not declare an actual source loss, drop healthy waiting frames, or revoke an already-submitted immutable-frame answer. Actual loss continues through `noPicture`, including permanent revocation of an unseen current-input answer; recovery does not restore that revoked permit. Pinned historical selections retain their existing gate-only admission behavior.
- The renderer advancement path decrements the old reservation before pumping the already-waiting newer frame. It therefore drains N+1 without requiring an additional changed callback and without submitting N as current. The ordinary waiting/coalescing/history mechanisms are reused; no new manager, state store, dependency, wire field, callback contract, or automatic session restart is introduced.
- Capture/session/command gates, request/card/session equality, expiry, Stop, cancellation, selection/follow-up replacement, capture end, and explicit restart controls remain unchanged. `LivePresentation`'s actual `firstShownAt` history branch is unchanged: revocation cannot manufacture a first receipt or erase a legitimate prior display. Original frame/picture/ink/request/response anchors are not relabeled as the newly visible display.

## Regression source review and evidence limit

Reviewed the new five-method `LiveFrameAdvanceTests` and applicable existing `LivePresentationTests`, `LiveSourceDispatchTests`, and `LiveFreshnessTests`. The new checks cover: healthy advancement after response receipt but before first display; refusing an obsolete offer without revoking its submitted answer; draining N+1 after held rendering of N; refusing N before writer completion; newest pixels not retained under the cap; and healthy advancement followed by true loss/recovery without restoring an unseen answer. The retained paired lead probe separately covers fully submitted N awaiting an answer during healthy N+1 versus actual blank loss.

The reviewer did not run these tests and claims no new executable pass count. Author/harness evidence and the unchanged lead probe replay must retain their own logs, denominators and exact source bindings. Source review does not prove real macOS screen permissions, continuous real-AI delivery, native cross-app ink, audio, Notability import, or either full §7.1 gate. Existing native-TTS approval hold and mobile deferral are unchanged.

Next owner: Native finishes focused executable evidence and creates the bounded delivery commit; Lead reviews that exact delivery, integrates the existing native leaves, and performs the already-planned macOS-only build/package/native checks. Interactive Mac and real-provider/device acceptance remain separate prerequisites.
