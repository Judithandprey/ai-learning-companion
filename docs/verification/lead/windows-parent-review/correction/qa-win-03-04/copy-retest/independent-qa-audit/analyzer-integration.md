# Analyzer correction integrated; next Windows candidate held

QA `6a3611e` and correction `72bf9a3` integrate as `93645a4` and `f2c883d`.
[Independent review](windows-qa-analyzer-72bf-review.md) closes QA-HARNESS-01/02:
required resumed-host identity and complete expected ink comparison coverage now
fail when absent or wrong. Seven targeted replay groups give the expected
outcomes. The adjacent evidence guards are accepted for this historical fixture;
no further mutation-hunting round is assigned.

Lead ran the delivered replay once on integrated main:

```sh
python3 tests/e2e/windows/replay_analyze_fix.py \
  docs/verification/qa/p0-13-windows-quit-copy-retest-86d2405 \
  --out /tmp/lead-qa-analyzer-f2c883d-replay.json \
  --summary /tmp/lead-qa-analyzer-f2c883d-summary.json
```

Exit 0. Historical baseline remains **24 pass / two limits**. All 121 supplied
negative cases reject success: 117 fail, four explicitly retain limits, zero
unexpected results. The complete replay JSON equals QA's committed corrected
replay, SHA-256 `2fd2d58657cdeed38fc40acf685bfa0bd64d803a7ac0134ca2a5d4768f0ffd8a`.
All 14 original evidence files and the original runtime harness bytes remain
unchanged. Integrated QA paths equal the delivered correction. This is pure
saved-metadata verification, not another Windows/DB run; no new physical-input,
provider or product acceptance is claimed. The actual earlier 24/two result and
QA-WIN-03/04 closure retain their stated boundaries.

The analyzer's exact copy and timing expectations are pinned to **86d2405**.
Do not modify the historical fixture to make a later product candidate pass.
Any new QA-WIN-05 acceptance must have its own exact source, actual observations
and narrowly scoped checks. The expanded correction does not prove an exhaustive
validator or authorize repeated fuzzing/campaigns.

## QA-WIN-05 actual delivery and one remaining source correction

Web delivered code `d6f4e20` and evidence-only `10cbae6` in native message
`handoff_dd97322c29905e4e50c451bb326696e3`. It stays **unintegrated** pending the
single state finding below. [Copy review](windows-win05-copy-review.md) approves
its bounded wording, six pure render checks and 57 executed-source/test hashes.
The 94 affected author passes are Linux/MemoryStore evidence, not Windows QA.
Main app/quit, uploader policy, overlay, editable originals and dependencies are
unchanged by that candidate.

[State review](windows-win05-state-review.md) found WIN05-STATE-01. A job known
not sent is tentatively changed to sending; retry-intent persistence fails and
publishes a write-fault status, then the job rolls back without a fresh notice.
Actual independent injected-ENOSPC evidence shows the direct state is
unknown=0/not_sent=2 while the latest pushed state remains unknown=2/not_sent=0.
No fourth upload occurs and the prior journal bytes remain unchanged. The other
two groups (held ACK/next-pending Stop, refusal before state-read) pass.

The same owner received `handoff_ba867693ad52537dad8e39c7c88f6e38`: publish the
corrected count after rollback while retaining the fault/no-send fence, add one
focused regression, and correct the one stale documentation phrase. No new
GUI/DB/full-suite campaign, retry-policy or protocol change is assigned. Initial
receipt is accepted/unread, not proof of execution. Exact request/receipt and
integration checks are in [analyzer-integration.json](analyzer-integration.json).

Next: Web delivers that leaf; Lead reviews base plus fix, runs affected checks
and publishes the exact candidate; QA checks only the changed pending/copy path.
Native's previously assigned MAC-STORAGE-COPY-01 continues independently.
No repeated old quit/ink/storage or macOS build campaign follows this result.
