# macOS subscription ASK library review

Verdict: **request changes — one cancellation blocker** before accepting this consumer's Stop guarantee. No repository edits were made.

Reviewed native commit `a2fe30c9ba1ee99f31e9e1295347085509d167c9` on `d4c2a8c`; delivered merge `7ae84cda7a583573f5cdc73258d64af1d26103a5` has identical `apps/macos` bytes. Scope: `AskWire`, `AskSelection`, `AskChild`, `AskLink`, changed composition helper and their relevant tests/callers. Read the complete assigned ADR 0003 plus its current deltas through `44f5fa6`, and current §7.7/disclosure/Stop rules. Backend compatibility source: `39620fa`.

## MAC-SUB-LIB-01 — blocking: Stop cannot revoke an image still waiting in the IPC writer

Locations (all at `a2fe30c`):

- `AskChild.swift:234–248`: `send` enqueues the entire line on the single `writes` queue; the queue checks only `inputClosed || exited`, once before `writeAll`.
- `AskChild.swift:253–273`: an in-progress, potentially multi-megabyte write has no request/session cancellation check. It resumes after backpressure until the whole image line, including its newline, is sent.
- `AskLink.swift:625–642,680–705`: Stop fences presentation, then `settle` queues `ask/cancel` through that same writer. `session/stop` is sent only after the cancellation call settles. Neither operation revokes the earlier queued/in-progress `ask/start`.

Reproduction schedule: submit a selected image; hold its stdin write before the newline reaches the connector; press Stop or Cancel while `child.send` is suspended; release the writer. The old image line is completed first. Backend can therefore begin inference **after the local Stop** and only subsequently receive `ask/cancel`. The late answer is correctly suppressed locally, but the unintended submission/quota use already occurred. This violates ADR 0003's cancellation-before-submission boundary and the user's required Stop guarantee.

Offline probe: `/tmp/macos-subscription-library-review-probes/queued_cancel.py`. Run with `PYTHONDONTWRITEBYTECODE=1 python3 /tmp/macos-subscription-library-review-probes/queued_cancel.py`. It executes the exact `39620fa` `SubscriptionBridge` with a synthetic client and the serialized IPC schedule dictated by the native source. Observed order: `image_line_queued` → `local_stop_and_presentation_fence` → `ask/start delivered` → `synthetic_inference_started(after_local_stop=true)` → `ask/cancel delivered` → interrupt. The probe deliberately substitutes image validation and provider execution; it is evidence of ordering, **not native Swift execution or real inference**.

Coverage gap: test `FakeConnector.Child.send` (`AskLinkTests.swift:29–32`) delivers synchronously; held-ASK tests hold the answer after delivery. The real-process test checks a large write and EOF independently, not Stop during a queued/partial write.

Next owner: Native. Fence/cancel the pending image transport itself. If any partial JSON line has been written, abandon that child/pipe safely instead of eventually completing the cancelled request or appending another message to it. Do not retry or silently recreate the child. Add a bounded held-reader/partial-write regression showing no `ask/start` becomes actionable after the local fence, plus unchanged late-response suppression; use the existing Backend owner if interface cooperation is necessary. Review the fix and run the actual Mac build afterward.

## Other reviewed paths / nonblockers

- Full frozen provenance comparison, explicit null facts, string display ID, floor/ceil crop rule, retained editable-document hash and unknown-composition null binding are consistent with the current seam. No separate reachable provenance defect found in this review.
- Managed-only connection handling, exact official login host checks, fixed error descriptions, minimal child environment, and no login URL in status/records do not add credential extraction or a second OAuth owner.
- A request requires Submit; cancellation/new selection suppresses late answers; no automatic inference retry was found. These positives do not cure the writer gap above.
- `submit` lacks an explicit `closed` guard during shutdown, but Lead confirmed the app normally fences its capture session first. No separate user-reachable bypass was established; do not count this as another blocker without a failing app-path reproduction.
- Existing limitations remain: response records say “put on card,” not visibly presented; frame wall time is null; this slice has no teaching-state/disclosure synchronization. None proves full §7.7 or complete-product acceptance.

## Verification limits

No credentials/private auth state, Codex process, login, provider, GUI, network test or unrelated suite was used. The native app/library was not compiled here; no Swift executable was found on PATH or common local toolchain paths. Owner-reported Linux stubs and test counts are not adopted as Mac acceptance. Actual ImageIO PNG validation, hosted macOS compile/tests, visible response, physical input, and interactive Mac acceptance remain outstanding; Lead owns app/UI and CI review.
