# QA-P07-01 selection correction

2026-09-29 UTC. Existing P0-02/P0-07 continuation, R06–R10/A03 and the preview's
unsaved-work boundaries. The underlying requirements and desktop fallback scope
are unchanged; no shared-contract, migration, dependency, provider or native work.

## Delivery and baseline

Native Web delivery `handoff_1ac41c0bba424d07910bd4e0a45368cc` supplied
`b471bdf301e5d7b598f7fe387f7fe651e1177310`, parent `75dad5e`. The
[owner report](../web/qa-p07-01-reselect.md) records observed native browser events
confirming the cause: the guard left a refused selection highlighted, so the next
ASK drag started the browser's native text drag, causing pointer cancellation
without a new selection. The same interaction occurred after a discarded draft.

The owner reports that its normal main merge was denied by its permission
classifier and was not retried. Lead did not change those permissions or rerun
the denied operation. Lead verified that all four touched source files are
byte-identical between parent `75dad5e` and main `d8b7afa`; the complete patch
passes `git apply --check`. Canonical wire/example changes on main are untouched.
This permits ordinary review and main integration without resetting the worktree.

The correction is limited to desktop mouse ASK: it sets aside a native selection
when a plain primary press would drag it, permits a fresh drag, restores it for
a click with small jitter, and restores/reports a cancelled gesture. Refused
mouse text selections are cleared without changing the retained note or retry
identity. Pen/finger paths retain their existing behavior. A saved DOM range is
transient interaction state, not a second source archive.

## Owner evidence and correction to prior evidence

The focused labeled-test-double browser run changes from **5/10 before to 10/10
after**, with zero runner errors. This includes same-word reselection, an actual
guard refusal, typed-note preservation, a discarded selection, click-on-selection,
padding and small jitter. Owner course-page self-test 54/54, trusted-input 37 pass
(two touch checks not verifiable), entries 21/21 and portable 113/113 remain
separately attributed owner results. The prior 33-browser, database, native and
mutation campaigns were not repeated.

The owner corrected one older evidence claim: `preview.unsaved_item_kept` in the
33-check campaign matched a stale notice after the drag was cancelled; it did not
prove a fresh refusal. That older assertion is not counted as refusal evidence.
The focused checks now show actual refusal transitions. The independent real
[recovery acceptance](../qa/p0-07-preview-recovery.md) remains a separate result.

## Integration and next acceptance boundary

The exact candidate staged on main passed `BROWSER= bash
apps/safari-extension/scripts/check.sh`: all **12 test-file groups** passed, with
TypeScript and browser build passing. This is the runner's file-group count;
owner 113/113 remains separately attributed. The new browser script parses,
`git diff --cached --check` passes, and retained report/JSON links are valid.
No broad browser/database/native campaign was run by lead.

Independent Astra [review](p0-recovered-deliveries/web-reselect-review.md) approved
integration with no blocker. It built the exact delta over isolated main
`d8b7afa`, preserving main's canonical contract imports, and independently ran
only the new focused Edge check: **10/10**, zero runner errors. It observed equal
unknown/refused attempt identities and preserved note text; same-word drafts,
click/padding/jitter and typed-word guards worked. Lifecycle conclusions beyond
those checks are explicitly code review. All 20 added PNGs and five JSON reports
were checked for publication hygiene; visible fixture passwords are synthetic
script inputs, not account credentials.

Lead committed the unchanged reviewed delta as **`6c3c1b6`** (source `b471bdf`).
It changes neither the generated preview wire import nor the canonical fixtures.
The two focused 10/10 results are independent observations, not 20 distinct cases.
The full earlier recovery acceptance stays at its original candidate `9eb6bd5`.
The next role-QA check is only the corrected selection path on an exact integrated
candidate: real save response loss, refusal of a second phrase, successful retry,
then a new ASK draft for that same refused phrase, preserving the original item
and typed-word guard. Retain click-on-existing-selection behavior. Bind any reused
harness evidence to its actual candidate rather than the old hardcoded SHA.

This does not repeat the completed full recovery campaign or claim Safari,
physical iPad/Pencil, original-course overlay, real AI, Notability or full P1.


## Native handoff and verification record

After the source commit existed, lead sent the exact candidate
`6c3c1b65bac13f315bb953158f101245139d9e63` for the already-planned narrow QA
continuation. Receipt `handoff_98c030de0ac944029f84726885abbe7c` was accepted;
its initial state was unread, not execution or a pass. The instruction restricts
the run to the changed real-API path, verifies actual source provenance, preserves
its own actor/data and reuses the repaired foreground cleanup. The application
source remains that exact revision through this documentation publication.

Web received the integration mapping and completed-source disposition in accepted
receipt `handoff_1f364dc60ce1bd9f17f97e80be3a1a63`; no acknowledgement or second
implementation task was requested. The rejected worker merge remains historical.

Lead's record checks: 117 local Markdown link targets exist, retained JSON parses,
new script syntax and `git diff --check` pass. Root changes after `6c3c1b6` are
documentation only. The next decisive evidence is QA's actual changed-path result;
until it arrives, QA-P07-01 is implemented and reviewed, with role-QA still pending.
