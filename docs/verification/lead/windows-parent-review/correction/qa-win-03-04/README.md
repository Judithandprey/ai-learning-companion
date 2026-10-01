# QA-WIN-03/04 correction review

Owner code `5cd0bec87db7a1f0989ab8e7f0ed702261dbccf2`, evidence
`70cb7e872e1cc7826d5b108ccc006b758d3cfb70`, parent `5871981`.
Actual delivery `handoff_ad2da359f7d9ade4f5ed7696c5407753` at
2026-10-01 00:56:20 UTC. **HOLD for two remaining QA-WIN-04 copy paths.**
These commits are not integrated into main yet. The existing independent
13/15 result and previous source/ink/storage passes remain unchanged.

Lead ran six affected test files against main `05465cc`'s in-memory Backend:
`app-link`, `capture-link-record`, `capture-link-rules`, `control-link`,
`overlay-frames`, `main-lifecycle`: **76 pass, zero fail/skip**.
[Output](focused-tests.txt). No PostgreSQL, GUI or provider was used.
Fresh TypeScript build and static copy pass; all 57 generated/staged files hash
to `dc2b09ebe995861c685e43fb25db9e5ab18c5b127718204a7277e214c0e55006`,
exactly the author's Windows run. [Check receipt](checks.json).

QA-WIN-03 changes the re-quit to `setImmediate` after the existing bounded,
single pending Stop. The source preserves the repeated-quit and original-ink
guards. Author actual Windows evidence reports seven passing checks, including
154 ms idle close, same-profile relaunch and 164 ms re-close, and unavailable
service copy. This is author evidence, not independent QA. Display/processes
were explicitly released at 00:54:51 UTC; no new display run was made by Lead.

## Remaining QA-WIN-04 findings

The independent [probe](status-probes.mjs) executes exact exported main,
coordinator and renderer code through existing VM/Electron/transport stand-ins.
It uses copied originals in its own temporary folder, no real child, socket,
database, display or provider. [Actual results](status-probes.json) retain two
reproductions and a passing Stop/unknown control.

1. **W-COPY-01: visible ASK card stays “being stored” after the link stalls.**
   Make a card while the link reports storing; an unanswered upload then sets
   `stalled`, `storing:false` and sends `lc:storage=not_storing`. The control
   header updates, but the already-open card remains byte-identical and still
   says the frames “are also being stored”. `overlay.ts:71` only updates a
   variable, whereas `finishAsk` writes the visible message once. A newly opened
   card is correct. Fix the visible metadata or avoid an ongoing storage claim
   in the card; preserve its selected pixels, source/time/ink and learner mode.
2. **W-COPY-02: empty planning after an unresendable unknown restores storing.**
   An upload gets no answer, then its copied local original becomes unavailable.
   The retry correctly preserves unknown and marks the job stuck, but
   `CaptureLink.run()`'s no-next-plan branch returns to `sending`. Status becomes
   `stored:0, unknown:2, storing:true` without any successful batch ACK, and the
   header again asserts ongoing storage. Do not infer a successful/answered
   transfer from an empty plan or skipped unknown job. Preserve the uncertainty
   and the ability to send later valid frames; an actual later success is a
   separate positive control.

One same-owner correction, within `apps/windows/**` and owned Web evidence, is
required. Keep the accepted quit change and all earlier passing evidence. Choose
simple accurate state/copy rather than another manager or protocol. Add focused
regressions for these transitions. No full GUI/DB campaign, shared dependency,
provider or service change is needed. Lead rechecks and integrates the corrected
leaf commits; existing QA then receives one exact release for its already queued
quit/clean-relaunch/failure-copy retest. Both full core AI gates remain open.

[Independent quit review](windows-qa03-quit-review.md) approves QA-WIN-03 source separately: six callback-model/retention checks pass, including the old-code failure control and repeated pending quit. Both old and new staged-tree hashes match. It does not supersede the two QA-WIN-04 holds or independent GUI retest. One nonblocking script note: orchestrator success should also require driver exit zero; the supplied actual driver did exit zero, so this does not invalidate its evidence.
