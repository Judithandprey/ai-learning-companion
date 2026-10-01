# Actual Windows retest and bounded follow-ups

Production candidate `86d240550803022e02dbbb5ae2323793fbfdebfa`; QA delivery
`6a3611e2567cf97e858ff146a55c8d0fda7d832c`, received in native message
`handoff_4eb9dc01ea2f20382a1778e9a2fd44e3` at 2026-10-01 02:45:22 UTC.
Main review baseline is `bde0cb1d01dbdfd4d5486d5686d65c73f28a58d4`.

**The actual run supports closing QA-WIN-03 and the reported QA-WIN-04 cases.**
Its retained 24 pass / two limits are not full product acceptance. The original
13/15 report at `c4c84a5` remains historical. **Current: base and corrected analyzer are integrated as93645a4/f2c883d;
QA-HARNESS-01/02 are closed by focused review and the delivered121-case replay.**
**Current Windows correction is now source-approved and integrated:**
[final integration](windows-win05-integration.md) records 78 affected main passes,
build success and closure of the rollback-notification finding. Actual changed-path
Windows QA awaits exact published release; no full campaign is assigned.
See [historical analyzer integration](analyzer-integration.md). The initial
HOLD evidence below remains historical; do not repeat the desktop/DB run.
The report is readable at `git show 6a3611e:docs/verification/qa/p0-13-windows-quit-copy-retest-86d2405.md`.

## Verified evidence

[Independent evidence audit](windows-qa-retest-evidence-review.md) verifies all
11 recorded harness hashes, exact source trees and an independently rebuilt
57-file stage hash `ce19204576470ef25dddde667ae1c726d573331e1d06e662e4662353867af893`.
All 223 steps completed; eight app processes exited themselves with code 0 in
91–661 ms and seven relaunches followed those exits. No force-kill is counted as
clean exit. The actual second window-close message did not exercise a second
quit during pending link Stop; the 20-second limit was not reached.

Nineteen checkpoints retain 25 original paths: 13 distinct raw/composed PNG
files, eight ink JSON files and four context PNGs. The 13 PNG files are not
13 separate capture events. Recorded readback links eight records and 15 server
originals, 16 image comparisons and eight ink comparisons with no mismatch.
Readback was recorded read-only; scoped cleanup after host exit was 81 documents
to zero for this run's proven actor. No GUI, DB, signal or service run was
repeated by Lead. Private raw bytes were not inspected; saved hash linkage and
comparison code were audited. External final process-list checks remain QA
attestation; structured app exit and watcher release evidence is retained.

## Analyzer correction — same QA owner

[Independent harness review](windows-qa-retest-harness-review.md) and Lead's
reproduction find two missing-evidence false positives: an empty resumed-host
list still passes, and removing all expected ink comparisons still passes.
The actual run has matching resumed-host and all eight ink comparison witnesses;
these flaws do not invalidate that historical result. Removing the missing
status or marking a process killed correctly fails the negative controls.

`handoff_1e29884b68d0ea9599cfdbb56faa481d` requests only complete identity/coverage
checks and pure retained-JSON replay with missing/wrong evidence controls. Keep
executed hashes and observations immutable; record any post-run analyzer revision
separately. Base plus correction will be reviewed and integrated together. No
repeated GUI/DB campaign is assigned.

The exact diagnostic scripts/results are in `probes/`; they operate only on
sanitized Git metadata. To reproduce the original analyzer finding, export
`6a3611e:tests/e2e/windows/analyze_fix.py` to
`/tmp/lc-windows-qa-6a3611e/analyze_fix.py`, copy `probes/analyzer_probes.py` to that
directory, and run it with Python. This reproduces the five saved groups, not a
new actual-operation test. Scenario comparison used the exact leaf/parent
scenario files and confirms all five prior scenario lists remain unchanged.

## Product follow-ups — existing owners

- **Web, QA-WIN-05:** the actual hung request left an affirmative storage claim
  visible until 182.7 seconds. Exact prior confirmed counts remained correct.
  `handoff_f11b8b54812dc73825a10735587c3aa7` assigns timely pending notification
  and truthful pending/confirmed wording within `apps/windows`. Preserve exact
  retry bodies/keys, timeouts, originals, Stop and unknown outcomes. No full
  campaign or protocol rewrite. Lead reviews its actual delivery, then releases
  only changed behavior for independent acceptance.
- **Native, MAC-STORAGE-COPY-01:** [source-only evidence](mac-storage-wording-review.md)
  shows an analogous affirmative label before a frame ACK, and late pending-count
  publication. `handoff_e315d6df5277bb8e006e4d94af5dcfa5` assigns the narrow native
  correction and focused delayed-response checks. This is not a measured Mac
  stall; prior 78 native tests and accepted persistence/control fixes remain
  valid. No mobile task or duplicate build campaign follows.

All three sends were accepted at exact `bde0cb1`; initial receipts were unread
and did not establish execution. Subsequent read-only worktree inspection saw
Web edits to capture-link/control on `41fd2cb`, QA's normal `4a46ed9` merge and
analyzer edit, and Native's normal `1e0e5a1` merge of the assigned baseline.
These are observed adoption/work in progress, not delivered fixes or test passes.
Exact task bodies and accepted receipts are in [coordination.json](coordination.json).

QA released the display/processes at 02:30:23 UTC and separately verified its
Edge/console cleanup at 02:43:52 UTC. Future interactive runs must check current
occupancy; elapsed time is not release. No user-preview database, ports 4173/8174,
Paperclip or existing service was touched. Physical pen, actual AI, audio,
Notability, interactive Mac and both complete §7.1 gates remain unverified.
The outstanding Mac-availability question stays pending, without blocking these
independent source fixes. Lead next publishes the corrected Windows candidate for narrow QA and reviews
Native’s pending delivery. See the current integration link above.
