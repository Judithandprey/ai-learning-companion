# Authorized process context reader — HOLD for one retained-pin mismatch

Candidate `4b5b7684bfaf2821d2827622dbcd63019d340b60`, parent `eecb580867ead27d322224bf4d9c5128a47900c1`; assigned baseline `da22f8bdd755450de788826862987fb2e2068625`. Reviewed against current main `35cfa94e7adf560b8dd4e672138c0076a98c5f29` in `/tmp/process-context-review-z8k7uxqo`: `git archive` of that exact main plus only the candidate's three new files. All probes are synthetic MemoryStore/in-process HTTP evidence. No repo/worker edits, DB, listener, provider or device operations. Existing dirty docs and held iOS workflow were preserved; iOS HOLD is unchanged.

Read all three candidate files and current P0-09 task, actual Archive authorization/identity/source logic, capture binding/ingestion, display historical loader/control invalidation, storage transactions, AuthorizedImageResolver and unchanged Learning composer. Current workflow/PONYTAIL LITE and the unchanged affected retention/authorization/Stop/source requirements apply.

## PC1 — capture binding generation is not bound to the historical display incarnation

Location: `services/api/process_context.py:172–178`, alongside `_source`/`load_display` and `:217–218`.

The reader validates capture binding owner/device/session/stream equality, but validates its `authorization_generation` only as a positive integer. The display source's persisted generation is separately cross-checked against the control stream and consumed start grant by `display_sources.load`; nothing compares that validated historical generation with the capture binding. The reader consequently publishes context despite contradictory retained incarnation pins.

Exact independent reproduction, using the candidate's real HTTP-committed `captured` fixture:

```python
c = captured
stream = c.batch['stream_id']
c.store._documents[USER][('capture_binding', stream)]['authorization_generation'] += 10
reader(c)(['process-1'])
```

Actual result: returns complete batch/source/frame context. The original binding generation, display source, control stream and consumed start grant were generation 1; only the capture binding was changed to 11. An assertion requiring `503 unavailable` fails with **DID NOT RAISE DomainError**. This is a retained-provenance consistency defect, **not a demonstrated bypass of the independent current caller authorization guard**. It violates this task's refusal of inconsistent committed metadata and its exact historical display/binding pins.

Smallest fix: compare the capture binding generation against the already validated **historical display incarnation** generation under the same transaction, with explicit type checks. Reuse those point-read facts; no scan, new schema, migration or new authority resolver is needed. Preserve supported legacy histories whose original capture storage predates the control family.

Do **not** compare this historical pin with today's account generation. An independent positive test disables/re-enables the account, supplies a fresh read token for generation 3, then reads intact generation-1 history successfully. That result is correct and must remain valid. Stop/withdraw history must also remain readable with current source access.

## Checks and results

Isolation command: Python `subprocess.check_output(['git','archive','35cfa94...'])` extracted under `/tmp`, then wrote each of the three exact `git show 4b5b768:<path>` file bodies. Existing shared venv interpreter used; no dependencies installed.

Focused owner tests:

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q \
  services/api/tests/test_process_context_reader.py \
  -k 'http_committed or requested_order or detached_nested or one_actor or exact_canonical_metadata or complete_legacy_utf8 or scoped_capture_stop or token_expiry or token_revoked or failed_transaction_exit'
```

Observed **12 passing test indicators, 100%**. Covers HTTP → reader → Learning exact composition, selection order, detached results, one transaction/no scans-writes-blob reads, inclusive complete UTF-8 metadata bounds, Stop/withdraw, current token expiry/revocation, and transaction-exit failure. Initial tool capture did not retain final exit metadata; these are not attributed as a separately rerun full owner suite.

Independent probe file, retained for owner/review reproduction:
`/tmp/process-context-review-z8k7uxqo/services/api/tests/test_process_context_review_probes.py`.

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q \
  services/api/tests/test_process_context_review_probes.py
```

First six cases: **1 failed, 5 passed in 0.63s, exit 1**. Failure is PC1. Passing controls: boolean capture generation rejected; mismatched consumed-start generation rejected; final guard exception withheld output; capture-artifact and original-artifact image tombstones each withheld metadata without mutation.

Then added and ran only `-k history_remains`: **1 passed, 6 deselected in 0.46s, exit 0**, proving fresh current authorization can read unchanged older-generation retained history. Combined independent evidence: **one real failure, six passing controls**. No broad 207-test/old-DB campaign was repeated.

## Other findings and limits

No other consequential defect found. Inputs are copied and bounded to 1–100 unique IDs; strict integer limits reject booleans. Record canonical bytes, selected IDs, slot pins, source ownership/version/hash, artifact reference pins/tombstones and Frame/display bindings are checked. Complete compact UTF-8 output includes wrapper overhead and is refused rather than truncated. One actor transaction contains both caller guard invocations; exceptions/failed exit publish no result, and returned values are detached.

The historical context batch ID is explicitly a selection identity, not an upload or ACK. Requested order is retained without claiming chronology; external parents remain unknown. The reader does not read original blobs, infer provider receipt or confer final-use permission. Image resolution and final authorization of every source remain separate current-use checks. Existing Learning flags remain not_attested/not_granted/unknown. The implementation is a direct small reader using current validators/loaders; PC1 needs a local comparison, not an architectural rewrite.

Recommendation: owner fixes PC1 and runs its narrowly affected tests plus the retained independent failing probe and older-generation positive. Then integrate and run the focused native Python suite on exact main. No new live/device/provider acceptance is implied.


## Lead disposition and continuation

Lead read the implementation and reproduced relationship in the existing source
loaders. The actual independent failure above is retained, not marked repaired.
One same-card correction was accepted by the native Backend route as
`handoff_3584d275af514f673e376ba5fee45794`, replying to actual delivery
`handoff_0ac12fbec712dc82c584004f54445ff6`. Backend owns the local comparison
and regression; no repeated DB campaign, source repair, new schema or provider
action is requested. Next is the corrected commit, targeted review/main checks,
then release before assigning the dependent Learning consumer. No producer/live
permission or current-generation comparison is introduced by this instruction.
