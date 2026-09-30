# Native upload witness correction — APPROVE for hosted verification

Candidate `94c5872fe69853ef1853fe9aac655af4416afe13`, parent `cb27688bd04ce31f1f2dce937c855377c657a7d1`; main inspected at `8c50587e1eb80e1e108c56bbd45ce12dd82f070d`. Reviewed only this three-file correction against `/tmp/native-ingress-correction-review.md`: the complete affected locked-state/witness path, six new regression assertions and owner evidence. PONYTAIL LITE: reuse of the existing session lock is sufficient; no new framework or shared contract is needed.

**APPROVE for lead's existing hosted native check, emitted-fixture validation and unsigned SDK builds.** Both exact lost-state variants are closed by source inspection. No remaining concrete blocker found within this correction. This does not assert compilation, native test execution, runtime activation or device acceptance.

## Exact prior failure paths

In `apps/ios/ScreenObserver/ScreenObserver/OriginalUpload.swift:651–699`, the session lock is acquired before inspecting its witness or the queue. A first queue creation writes and fsyncs the witness before saving the queue (688–689). Every later locked operation reads the witness; a missing queue with that witness throws `stateMissing` at 675–676 **before** invoking its read/mutation closure. Any nonempty witness counts as established/uncertain state, conservatively.

1. **B opened before A creates and stops the queue:** B's local latch may still be false, but A's persistent mark survives queue-only deletion. B's saved/enqueue/send operations now throw or halt rather than initialize or rebind. Fresh `started` capture status cannot bypass the earlier missing-state fence.
2. **B reopened after queue-only deletion:** initialization still permits constructing the object, but its first operative locked read discovers the surviving witness and rejects identically. No empty queue is returned, no replacement is written and no request is admitted.

The correction does not reconstruct the missing source, items or Stop. It preserves the surviving evidence and halts instead. The prior malformed-state, serialized fresh updates, failed-Stop retry and diagnostic/receipt redaction corrections remain intact.

## Controls and recovery behavior

- A genuinely new session has an empty lock and no queue; read-only empty operations leave it new. Its first mutation marks then saves it, allowing ordinary reopen and exact upload.
- Rollback of a failed first creation is limited to `!created` after the earlier `witnessed` rejection, so that cleanup cannot remove a witness protecting an established missing queue. An unsuccessful cleanup may conservatively leave the session blocked; it does not grant permission to reconstruct known history.
- Existing pre-witness queues are marked before decode; an open reader that encounters malformed content therefore protects its later disappearance too. The initializer's earlier unreadable-file rejection and pre-release migration limitations are explicitly documented.
- Both queue and lock loss remains an explicit evidence limit. No broader filesystem or power-loss guarantee was executed in this review.

`apps/ios/checks/CaptureIngressCheck/main.swift:881–965` contains the requested six checks: stale B, reopened B, normal first initialization/reopen/send, failed first save followed by retry, readable pre-witness adoption, and unreadable pre-witness adoption. The two negatives assert `stateMissing` for reads/enqueues, halted sends, zero transport calls and no recreated queue. The malformed-state reader is constructed before corruption, so that test reaches its intended branch. Permission-failure checks require the hosted process to respect the test directory's permission changes.

## Actual evidence and limits

Executed read-only Git inspection and hashing; `git diff --check cb27688 94c5872` returned **exit 0**. `command -v swiftc` returned no path (exit 1). No Swift compilation or test was executed, and no anticipated PASS/count is counted as execution. No compiler defect was identified by source reading; the hosted compiler remains the next authority.

Reviewed using `git diff cb27688 94c5872 -- <three candidate paths>` and `git show 94c5872:<path>`, including full locked-state lines 651–722 and new checks 881–965. Candidate SHA-256:

| File | SHA-256 |
| --- | --- |
| `OriginalUpload.swift` | `2b66e3dc200912adea8347d5e89771f8a263bc636296fc829d11bd285345ddc7` |
| `CaptureIngressCheck/main.swift` | `d554aeeb926803546b67ed062fc0f21d51f9bffc6a33f5e5e97253508ea7334d` |
| `capture-ingress-originals.md` | `2b0140972f1b66d9048225cd337fa6c98fbe3a2fd7757c1f257b3101e3744d95` |

Only this `/tmp` report was written for the correction. Main/worker files and lead's dirty `.github/workflows/ios-screen-observer.yml` were untouched. No CI dispatch, network, DB, provider, browser or device operation occurred. Preserve both historical HOLD reports; this approval supersedes their source blocker only for this exact corrected candidate and the planned verification step.
