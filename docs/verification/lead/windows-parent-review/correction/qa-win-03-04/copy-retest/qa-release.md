# Existing QA-WIN-03/04 conditional retest

This supplies the executable boundary for the existing conditional assignment
`handoff_47984d838c7d001ba869d5b2f3fac80a`; it is not a new full campaign.
Lead's native release message supplies the exact pushed candidate SHA. Preserve
the original `c4c84a5` 13/15 result and all passing capture, source, editable-ink,
readback and Stop evidence. The author released the Windows display at
2026-10-01 01:32:33.512 UTC and explicitly retained that release with the final
wording-only commit `41fd2cb`; no later author GUI run is reported.

Use the existing isolated QA runner/build and source-hash audit, with the
original requirement references and controlled-execution rules in
[the original task](../../next-qa-task.md). Inspect current display occupancy
before claiming it; elapsed time or an old release is not permission to close
another owner's or the user's app. Preserve the user preview, ports 4173/8174,
`lc_desktop_preview` and Paperclip. Do not restart services or change providers.

Retest only the changed behavior:

1. QA-WIN-03: real linked app closes by itself while idle, after Stop, and with
   the development service unavailable. The same isolated profile relaunches
   cleanly without killing the previous app. Retain the bounded Stop and
   repeated-quit/original-preservation checks relevant to this change.
2. QA-WIN-04: header/link/ASK copy truthfully distinguishes local originals,
   current storage state, confirmed counts and unknown outcomes. Leave a card
   open through a safely isolated failure/recovery if the existing harness can
   exercise it; its actual selected image/context must remain intact. The card
   now describes conditional storage capability and explicitly says no AI is
   connected; it makes no changing storage claim. An unanswered operation is
   unconfirmed, not proof that storage failed.

Lead has already rerun the bounded missing-original/stuck-job/reconnect and
later-ACK probes. Do not expand the GUI pass into a replay of every portable
fault or the earlier pixel/ink/DB campaign. If real DB use is necessary for the
changed path, retain the existing `lc_p0_test`, private DSN, migration guard and
fresh proven actor restrictions; MemoryStore/fake transport is labeled and is
not substituted for actual app behavior. Do not access user-preview data.

Return the actual candidate/build hashes, runtime/input kind, per-case result,
clean exit/relaunch evidence, any specific regression and explicit owned-process
and display release. Author runs and Lead Linux checks do not close independent
QA. Actual AI, physical pen, audio, interactive Mac and full product acceptance
remain separate and unverified.
