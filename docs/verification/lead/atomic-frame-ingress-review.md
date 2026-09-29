# Atomic frame ingress bounded review

**Disposition: HOLD `edc562b9e6858b61b4dbde9ab8834bdadea9abf5` for one confirmed
missing-original replay defect (AF1).** The lead has sent the precise defect to
the existing Backend owner. No integration or production edit was performed.

Reviewed the complete five-file delta from
`97353023da265f2fd7d026b7b5cd7f88eb810496`, its evidence, released original-artifact
README/frame-binding obligations, current task status, and existing control,
storage and deletion callers. The exact delta applies cleanly to an isolated
archive of main `89d4ccba4fc62ea5cd74035ed5085e766942f1fb`:
`/tmp/atomic-frame-ingress-review-8s2ihdj5`. Requirements/workflow content is
unchanged from `0ef6c97`; PONYTAIL LITE applied without a wider design audit.

## AF1 — A new request key can recreate a lost committed process original

`services/api/capture.py:333–345` rejects a missing `capture_record` only when the
incoming request key already has a cached ACK. A committed `capture_slot` still
naming that record is not treated as a witness that the original has been lost.

Reproduced twice:

1. Successfully call `registry.ingest_frames` for `process-1`, sequence 1.
2. Delete only its `capture_record` through explicit test corruption injection;
   leave its frame, typed bytes, committed slot and original replay receipt intact.
3. Submit `process-1` under a new idempotency key, first with sequence 1 and then
   in a fresh fixture with sequence 2.
4. Both return `disposition=accepted` and write a replacement `capture_record`.
   The second admits a changed sequence for a previously committed original ID.

Thus the identical-key regression passes while changing the key bypasses the
missing-original fence. This contradicts the delivered replay/non-resurrection
invariant; it is not an intended original-recovery operation.

Minimum correction: in the typed ingress path, an absent record ID that has any
committed slot witness must fail closed before writing. Reverse lookup must not
be limited to the proposed slot: a new sequence or stream cannot clear the old
ID's history. Keep existing cached-receipt and record/frame/tombstone checks and
account for relevant durable receipt witnesses rather than treating request-key
absence as permission to rebuild. Focus regressions on same/new sequence and
stream plus unchanged full storage; preserve legitimate new records referencing
an intact shared frame and the existing default gate.

Exact executable reproduction retained at
`/tmp/atomic-frame-ingress-missing-record-probe.py`:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/tmp/atomic-frame-ingress-review-8s2ihdj5 \
  /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python \
  /tmp/atomic-frame-ingress-missing-record-probe.py
```

Output: **REPRODUCED for sequences 1 and 2**, each accepted and restoring the
missing record. The probe intentionally asserts current faulty behavior.

## Other bounded results

No second consequential blocker found. The explicit entry reuses the current
ControlRegistry resolver and one actor transaction, validates every typed original
and source, binds full frame proposals, and keeps normal capture artifact ingress
disabled. Synthetic source/type/provenance/test-only consent is rejected; missing
sources are not registered or invented. Historical sealed backfill remains
historical. New frames/records/receipts roll back together on failure. Source
removal fences frame IDs even when a referenced frame is already absent, and the
common immutable helper protects legacy import from reusing those deleted IDs.
No legacy Observations are manufactured for Learning.

Focused command in the isolated candidate:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider \
  services/api/tests/test_capture_frames.py \
  -k 'uploaded_png_and_editable_ink or sealed_historical or failed_transaction or current_authority_frames or deleted_frame_identity or new_record_cannot_resurrect or synthetic_source_metadata or new_entry_does_not_enable or cached_success_never'
```

**20 passed, 83 deselected in 0.38s.** These cover the positive PNG+ink/readback,
one transaction, bounded historical stop, injected write/commit rollback,
deleted/missing-frame identity, synthetic rejection, default gate, and existing
same-key missing-original checks. They do not negate the independent AF1 probe.
Owner-reported 103 new + 165 existing checks and 11 independent probes remain
separate evidence. No DB/full campaign, services, browser, Simulator, provider,
preview/Paperclip or network calls. Review the focused correction delta and AF1
negative cases when delivered; no repeat of the whole original review is needed.

## AF1 correction — d325e9afe9e4bce43d2d2405c8cb9284978df63d

**2026-09-29 disposition: APPROVE original delivery plus this correction for
integration. AF1 is addressed; no remaining blocker found in this delta review.**
The original HOLD above remains the finding for uncorrected `edc562b`.

Reviewed only `edc562b..d325e9a`: the reverse-witness checks, 17 added tests and
evidence correction. Built a fresh archive of exact main
`89d4ccba4fc62ea5cd74035ed5085e766942f1fb` and sequentially applied only the original
`edc562b^..edc562b` and correction `edc562b..d325e9a` diffs. Both apply checks passed.
Candidate: `/tmp/atomic-frame-ingress-correction-gconk_9s`. The independent dirty
`display_source` contract, its test and `tsconfig.json` were not included or changed.

The typed transaction now rejects absent submitted record IDs witnessed anywhere
in this actor's committed slots, regardless of requested sequence or stream. It
also inspects all surviving valid ACKs rather than only the selected/newest request
key, rejects malformed ACKs, and honors stored children's causal-parent witnesses.
Only committed rows are witnesses, so new parent/child pairs in the same incoming
batch remain legal. All checks occur before writes inside the existing transaction;
no new state, default-gate relaxation or legacy Observation synthesis was added.
The documented limit is accurate: total loss of every original and witness cannot
be detected from this store alone.

Focused correction test command:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider \
  services/api/tests/test_capture_frames.py \
  -k 'new_key_cannot_restore or existing_record_new_key or committed_child_prevents or new_record_receipt_scan'
```

**17 passed, 103 deselected in 0.38s.** Includes same/different stream and sequence,
slot-only/replay-only/both witnesses, an older ACK despite a newer unrelated ACK,
child-only witness, malformed ACK refusal, unrelated deletion receipt handling,
valid newly submitted parent/child, existing-record new-key replay and new-record
same-frame reuse.

Independent rerun of the original two AF1 scenarios, changed only to require denial:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/tmp/atomic-frame-ingress-correction-gconk_9s \
  /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python \
  /tmp/atomic-frame-ingress-correction-probe.py
```

**Both sequence 1 and sequence 2 now return `503 unavailable`, leave the missing
record absent, and preserve exact whole-actor pre/post storage equality.** The
original faulty-behavior probe is retained separately. Owner-reported 263 relevant
passes and additional independent probes are not represented as this review's
execution. No old full suite, DB, service, provider, preview/Paperclip, browser,
Simulator or device operation. Next action is lead integration and the relevant
integrated check; no further design review is required for AF1.
