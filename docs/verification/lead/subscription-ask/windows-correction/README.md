# Windows subscription correction review

Candidate `c977df5523b0e57d49205ec9ca691bd965854e59`, on `4944cc3`.
Actual delivery: `handoff_31ae184a77baa3279672bb5152167895`.

Lead reviewed the full main/renderer/preload correction. Both unchanged original
UI reproductions now pass: fast refusal no longer hangs, and failed result
persistence is visibly reported with an explicit Save path. `shown` now follows
renderer presentation acknowledgement. The retained PNG/ink remain unchanged;
failed outcome writes stay in memory for bounded local retry without another
inference. Related app/Stop/lifecycle tests: **49 passed, 0 failed (2.437s)**.
TypeScript/static build passed after linking the already installed app dependencies
into the isolated archive (first attempt lacked the archive's Node type definitions).
No dependency was installed or changed. All 63 source/test hashes and log hashes
in each Windows/Linux author receipt match the exact candidate; author execution
remains separate from Lead review and independent real GUI acceptance.

[Transport review](transport-review.md): the six prior independent cases and
three new focused author cases pass. One reproducible interaction remains:
**W-SUB-T01-FENCE**, a same-chunk account-change/read-result/protocol-fault
sequence automatically spawns a replacement child and publishes signed-in state.
[Exact observed result](fence-probe.json). The same Windows owner has a narrow
follow-up `handoff_d8906c713bc535bbf591fea9e8347dbb`; this candidate is held until
that fence is corrected. This is not another general audit or duplicate task.

Real GUI focus, WSL managed-login browser return, actual official image input,
answer semantics, Windows sign-out/shutdown behavior and Mac/device claims remain
unverified. If storage remains unwritable until the process exits, its unsaved
outcome cannot survive; the existing stored original and unfinished record remain.
This limitation is not a durability pass. The independent QA runner implementation
is unblocked against these stable UI/storage seams, but no display or real request
is allocated before the corrected integrated release.
