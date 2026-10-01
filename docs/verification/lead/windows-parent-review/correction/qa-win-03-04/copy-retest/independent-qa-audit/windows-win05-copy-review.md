# QA-WIN-05 UI/copy and evidence review

**APPROVE this bounded UI/evidence slice.** Delivery `10cbae629b6d7330e0da61b5668c43e338d00a97`, code leaf `d6f4e202c25cbd1297dc20afd7e8b4536c591177`, parent `41fd2cb2845c8139f9ec5a326d38ebf593e290f9`. Exact export `/tmp/windows-win05-10cbae6`. Capture-link state transitions/timing remain the other reviewer's responsibility; no new blocking copy defect was demonstrated.

`control.ts:292–320` replaces the live claim “are also being stored” with sending plus the explicit rule that only service confirmation counts as stored. While `awaiting`, the line says “sending: waiting for the service to confirm”; previously confirmed and unknown counts stay separate. A stalled/retrying send says “storage not confirmed now”, rather than “not stored”. Stop with a send still out uses the unconfirmed header and says nothing new is sent while the last send awaits confirmation. A write fault keeps earlier committed/unknown counts and the unconfirmed-Stop detail; “further sends ... have stopped” does not rewrite prior outcomes. Non-live statuses retain their existing local-flow wording and historical unknown counts, not a claim that earlier unknown records were never stored. This source review does not establish remote quiescence or native timing.

The ASK renderer and preloads are unchanged. Its persistent card remains conditional (“may also store ... only while ... connected and answering”) and explicitly says no AI is connected. It points at the control line/counts without asserting a momentary storage outcome. Updated app regressions retain the card identity/continuation checks while adapting only the changed header/line expectations.

Independent bounded execution: pinned Node 24.21, `--test --test-isolation=none --test-reporter=tap` on the exact export's `control-link.test.ts`: **6 passed, 0 failed/skipped, 58.368315 ms**. These execute the real `showLink` function against fake text nodes in a VM: off, unavailable, live, pending/retry, non-live/Stop with pending work, and prior outcome/fault wording. No Electron, window, local host, listener, database or provider was started. TAP: `/tmp/windows-win05-control.tap`.

Evidence integrity:

- All 10 changed files match raw candidate Git bytes. Code leaf and evidence delivery have identical Windows trees.
- All **57 executed source/test file hashes** in `linux-focused.json` match the candidate. Both reused Safari ink/mode sources also equal the recorded Backend/main revision `5dc1d52bd55ad46acb4c1dda26f7185d53207581`.
- `linux-focused.txt` SHA-256 is exactly `118cbfc02fc5ce321fdc017dee91f9b26aaa6c70e627a6c87b6d87816e083475`; its **94 named passes**, 94 total / 0 failure/cancel/skip match JSON. Duration 40192.40027 ms. This is author Linux evidence using held in-process answers and the released MemoryStore host, not a real Windows hung-service run.
- Main app/quit, uploader, overlay/ASK, shared originals/ink, preloads and dependency files remain unchanged. Full-suite/build claims were not repeated here; they remain author report claims. Prior actual QA-WIN-03/04 results stay historical; the changed Windows behavior is explicitly NOT_RUN in this delivery.

Nonblocking P3 documentation precision: `docs/verification/web/windows-capture-link.md:155` still says a stalled status says “not storing now”. The renderer now says “storage not confirmed now”; the underlying `storing` Boolean remains false. Update that current-flow sentence to distinguish the flag from displayed wording. No production correction is requested by this review.

Artifacts: `/tmp/windows-win05-copy-review.json`, `/tmp/windows-win05-control.tap`. No repository/worker edits, stage build, whole-suite rerun, GUI, DB, network/provider or mutation campaign.
