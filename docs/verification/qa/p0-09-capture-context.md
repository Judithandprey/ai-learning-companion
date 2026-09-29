# QA check: QA-14 repair, internal CaptureArchive and Learning callable context at main 3f37521

- **Candidate:** exact main `3f375217eeee8d809e5d906d615870afa08d7a23`. It contains:
  - QA-14 hardening `bc7162d`;
  - Backend `CaptureArchive` `75f4e33 → 76f206c`;
  - Learning context `d25efe8 → 772e579`, with the key-integrity repair `a299477 → 4e7242f`.
- **Carries to current main:** `packages/`, `services/api/` (excluding tests), `context.py`,
  `archive.py` and `timestamps.py` are byte-identical in `fc079e9`. `retrieval.py` only
  gained the regular-file check on `save`/`load`; `search` is unchanged. The findings
  below therefore apply to `fc079e9` code.
- **Merges into `team/qa`:** `324a1c4` (3f37521) and `b231646` (fc079e9).
- **Environment:** WSL2, Python 3.14.4, jsonschema 4.26.0; `git archive` scratch copies.
- **Scope:** in-process only (MemoryStore, ASGI, synthetic data). This is not
  PostgreSQL, production auth, provider, device or G7 acceptance. Backend's PostgreSQL
  lock-contention evidence (`p0-09-lock-contention.md`) is owner evidence, not this
  review.
- **Interruptions:** the review ran as a workflow of 4 reviewers plus 4 adversarial
  verifiers. Two infrastructure interruptions stopped it.
  - 7 of the 8 results were recovered from the run journal:
    [review-findings.json](p0-09-capture-context/review-findings.json).
  - The context-budget verifier did not return. Its partial tool log is kept in
    [verify-context-budget-partial.log](p0-09-capture-context/verify-context-budget-partial.log).
    It shows these re-runs:
    - 6,013 budget calls with 0 violations;
    - the quadratic-cost timings;
    - the query-encoding errors;
    - the parameter edges.
  - I re-ran its unfinished step (BUDGET-04/05) under a 4 GB memory limit; it peaked
    at 39 MB ([log](p0-09-capture-context/budget-semantics-recheck.log)).
  - Both interruptions coincided with that step's exit 137. The rerun shows the probe
    itself is light, so the kill was most likely external.

## QA-14 repair

| Check | Result |
| --- | --- |
| Raw nested body, authenticated `POST /v1/events:batch` and `POST /v1/sources`, depth 1, 63–65, 400, 20k, 48k, **52k**, 57k, 100k, 1M (up to 2 MB) | **422 `invalid_request`** each, ≤ 0.02 s, no echo of the input. Unauthenticated: 401; wrong scope: 403. At `e63b28f` the same bodies crashed with a bare `RecursionError`. |
| v1/v2 `validate` and all process_v2 helpers on a 52k-deep value | `ValidationError: JSON nesting exceeds the supported structural depth` |
| Error stringification | `str`, `repr` and `logging.exception` are payload-free for list and tuple chains at depths 65–52k. `instance` is unset. Cyclic lists and dicts are rejected the same way. |
| Guard boundary | v1 `events[0].text`: `chain(61)` still reaches jsonschema (normal type error that shows the instance, as before QA-14). From `chain(62)`, the leaf is below depth 64, so the guard fires. |
| Exact-copy Python check | Generation `--check` ×3 exit 0; `pytest` **857 passed, 1 skipped (Node absent), 16 xfailed**. The focused run is 413 passed and 2 xfailed (QA-P08-01/02 remain). [Log](p0-09-capture-context/check-3f37521.log) |

- **Observation:** the guard visits shared children once per path. A Python-built
  shared-reference DAG (`x = [x, x]`) took 11.9 s at depth 20 and 47.8 s at depth 22,
  which is below the depth limit. `json.loads` cannot produce shared references, so
  HTTP input cannot reach this; only trusted in-process callers can
  ([log](p0-09-capture-context/qa14-probe.log)).
- **QA-14 is closed** for the reported paths.

## CaptureArchive

Held, per reviewer plus verifier:

- **Auth and errors:**
  - Only state-independent 422 checks run before authorization.
  - A cross-owner source, parent or record is indistinguishable from an absent one
    (404 or 409).
  - A resolver that is missing or returns the wrong shape or identity fails closed
    (503 or 404).
  - Non-bool transmission and live flags, and non-int boundaries, are rejected.
- **Binding:** it persists only on success, and rebinding is 403.
- **Stop is enforced before the cache:** a same-key replay of an accepted live batch
  after stop gets **409 `capture_stopped`**.
- **Replay:** an exact replay after two days returns identical ACK bytes and
  `received_at`.
  - 1 vs 1.0 and NFC vs NFD give a 409 conflict.
  - A different key with the same body returns `duplicate` with the original
    `received_at`.
  - A pending ACK is replayed as pending after the bytes are verified.
- **Delete before the cache:** replay is 404. The replay row keeps only
  `{key, deleted}`, and the secret quote is absent from every stored document.
- **Dependencies:**
  - a 5,000-generation chain works without recursion errors;
  - diamond and 2^60-path ladder graphs are resolved in linear time;
  - cycles give 422;
  - a deleted parent is a 404 fence, and an absent parent is 409;
  - a surviving descendant is still readable without its erased parent's text.
- **Frames and artifacts:** foreign, deleted or revoked frames are rejected.
  - Artifacts are `verified` only with owned bytes, digest, size and a stored MIME
    type.
  - Corrupted blobs give 503.
  - A shared blob is kept until its last reference is gone, then tombstoned.
- **Rollback:** injected failures at every write in `ingest` and in `delete_source`
  leave the store byte-identical. A fuzz run found 0 unmapped production exceptions.

| ID | Severity | Finding (verified) | Owner |
| --- | --- | --- | --- |
| CAPTURE-AUTH-02 / DEPS-02 | **low (availability, realistic trigger)** | `canonical_record` re-validates the whole batch for every record inside the actor transaction (N+2 validations). A schema-maximum authenticated backlog batch (100×100) held the user lock **39–70 s** on MemoryStore. A same-key replay pays the same cost again, and every other operation for that user waits. A scratch-only patch without the per-record revalidation took 11.1 s → 0.4 s with an identical ACK. No throughput is claimed (README favors correctness). | backend / lead (helper) |
| CAPTURE-DEPS-01 | low | Every ingest and every cached replay re-walks the whole stored ancestor chain (about 4 reads per ancestor) under the lock. A naturally chained session is O(N²) overall. | backend |
| CAPTURE-DEPS-03 (+ verifier extension) | **low, needs a rule** | Deleting source X also deletes v1-imported ink bytes that no note references yet, when an X capture record named the same `artifact_id`, even while only `pending`. The later `put_note` fails with 404. The outcome depends on whether the note was written before or after the deletion. The garbage collection keys only on `artifact_id`: bytes whose digest **contradicts** X's own reference are erased too. This conflicts with preserving original ink unless the product rule is that X-linked ink is erased. | lead decision, then backend |
| CAPTURE-DEPS-04 / 05, AUTH missed-1 | low | v1 artifact writers (`import_ink`, `import_fixture`) ignore capture pins and tombstones. A different-byte write under a pending pinned ID makes the capture permanently unverifiable, and the committed request's exact replay becomes 409. An orphaned `capture_artifact_ref` (digest and MIME from a deleted record) survives while v1 still holds the bytes. Triggering this needs a trusted internal writer; no upload API is released yet. | backend (future typed upload must honor pins) |
| CAPTURE-AUTH-01 | low (hardening; prior AUTH-01) | `CaptureArchive` inherits substring and key membership: the scope string `"xprocess:capturex"`, a dict `{"process:capture": False}` and the capability string `"process.capture.v0.20"` are all accepted. `None` or a string for `source_versions` raises a raw `TypeError`. Strict xfail. | backend / lead |
| CAPTURE-AUTH-03, AUTH-04, DEPS-08 | info (documented) | Any authorization-generation bump, even re-enabling an enabled user, permanently fences a bound stream. A cached verified ACK after blob loss returns 503, the retryable class, on every retry. A deleted source's frame bytes survive while another source's pending capture reference names them. | — |
| CAPTURE-AUTH-05 / 06, DEPS-06 / 07, AUTH missed-2 | info | Other observations:<br>• The stop fence is sequence-only (prior AUTH-02).<br>• Trusted-callback and storage failures propagate raw.<br>• Stored ancestors are re-authorized against the child stream's current `source_versions`, so causal links across versions and surfaces need a resolver policy.<br>• A deleted own parent gives 404 while an absent one gives 409.<br>• The v1 session `live_capture` flag is not consulted; only the resolver fences stop. | lead (resolver policy) |

## Learning callable context

Held, per reviewer plus verifier:

- **Neighbor access:** blocked correction neighbors add no quote, ID, session or
  device. This was checked for other projects or versions, 8 non-ready access
  states, and after/before filters, by grepping the canonical packet.
  - A 1,500-query fuzz run (5,197 neighbors) found 0 scope violations.
  - 5,043 raw `evidence` calls never read a filtered event.
- **Filters:** `after` is inclusive and `before` exclusive, identically for hits and
  neighbors.
  - Offsets, date-only values and wrong types raise `ValueError`.
  - Unknown fields and modes are rejected.
- **Current vs history:** current is the default and is labeled
  `snapshot_current_not_as_of`; history must be requested explicitly.
- **Competing branches:** when detected they stay `competing_branches_unresolved`,
  with no timestamp winner.
- **Map keys:** key swaps across owners, placed in the supplied archive, in
  `index.archive` or in both, are rejected before search. So are True, 1.0,
  str-subclass and tuple-subclass aliases.
- **Staleness:** mutation before the call, and mutation inside `search`/`evidence`,
  are rejected.
- **Budget:** every-integer and change-point sweeps (29,135 plus 6,013 packets,
  including crafted multibyte and escape text) found 0 over-budget or truncated
  items, correct greedy order and truthful counts.
  - 12,000 random archives were checked against an independent oracle.
  - Output is byte-deterministic across hash seeds.
  - Returned packets are independent copies.
  - The documented examples reproduce: 4 packets with the documented digest.
- The 187 copied originals were unchanged in every probe.

| ID | Severity | Finding (verified) | Owner |
| --- | --- | --- | --- |
| CONTEXT-ACCESS-01 | low gap | Two contradicting corrections of one original lose the competing label whenever the original is excluded. That includes a time, project or version filter, **or an access-blocked older version with no filter** (verifier). Both show as `current_candidate` with `unknown_filtered_relation`; only the verbatim `correction_of` reveals the fork. No winner is chosen. | learning |
| verifier missed | low gap | A newer source version **in any state, even with zero observations** (registered, fetched, parsed, indexed or needs_auth), makes every observation of that source non-current. Current mode then returns `not_found`. This is consistent with the README and tests ("Unavailable latest source does not revive its predecessor"), but ingestion states are not spelled out. History keeps everything. | learning (current semantics decision) |
| CONTEXT-ACCESS-02 | low gap | The resolution label only walks upward. An ancestor of a deeper fork, or of a filtered grandchild, is labeled `links_only_not_confirmation`. | learning |
| CONTEXT-ACCESS-03 | low defect | A ranked hit rejected by the context re-check is counted as budget-omitted, `omitted_correction_items` goes to **−1**, and the status can say `complete`. This is only reachable through a misbehaving retriever or revoke/restore; nothing leaks. Strict xfail. | learning |
| CONTEXT-ACCESS-04 | low gap | There is no cycle guard, so `correction_resolution` loops forever on a correction cycle when a cycle member is a hit (history mode). The `FixtureArchive` ordering makes cycles impossible; this needs mutation with re-forged fingerprints. | learning |
| CONTEXT-ACCESS-05 / 06 | low gap | The per-call check compares fingerprints only, so tampered in-memory index docs or times silently change ranking; evidence still comes from the key-validated archive. Query values are not type-checked (`source_version` True or 1.0 matches 1), and malformed shapes raise non-`ValueError`. | learning |
| CONTEXT-BUDGET-01 | low | Neighbor closure is transitive and not bounded by `top_k`. Resolution is O(L²), and the budget loop re-serializes the packet once per item: 6.3 s for a 2,000-long chain at the default budget, and 13 s to include 2,000 items (2.6 MB) at `max_bytes` 10^9. Only thousands of links trigger this; real-corpus timings are fine. | learning |
| CONTEXT-BUDGET-02 / 03 | low / info | Unencodable query values (lone surrogate, NaN, set, bytes) fail with codec or `TypeError` errors after evidence has been rehydrated, not with the documented envelope `ValueError`. A `max_bytes` above 2^53−1 is accepted and echoed; one with 4,300 or more digits fails with an unrelated int-to-str error. | learning |
| CONTEXT-BUDGET-04 | info (documented) | Greedy fill can keep a superseded historical neighbor while omitting the current correction it was expanded from. On the real corpus, at `max_bytes` 4318–4357 the packet holds `r-02-u` plus historical `e-02-u` but not rank-2 `e-02-c`. It is labeled `superseded_by_correction` and `relation_references` warns, but a consumer that ignores the labels sees only the old statement. | learning (consider keeping a correction with its superseded original) |
| CONTEXT-BUDGET-05, ACCESS-07/08/09 | info | Other observations:<br>• `temporal_semantics` says `history_filtered_by_capture_time` even with no time filter.<br>• Labels disclose that a blocked correction exists, for the same owner only (intended).<br>• A revoke then restore between the reads goes undetected (documented).<br>• `FixtureArchive` raises `KeyError` when a corrected original is deleted, so context's `missing_record` path is unreachable through the fixture adapter. | — |

## QA regressions

`tests/e2e/test_p0_09_capture_context_qa.py`: **12 passed, 3 strict xfail** on the
merged `fc079e9` tree.

- **QA-14:** raw 65, 52k and 1M events and sources bodies return 422 with no echo;
  depth errors are payload-free; the depth-guard boundary.
- **Capture:** stop is enforced before the cache on same-key replay; replay after
  source deletion is 404 with no stored body.
- **Context:** a budget sweep covering exactness, whole items, order and counts.
- **Strict xfail:**
  - CAPTURE-AUTH-01, for scope and capability strings;
  - CONTEXT-ACCESS-03, for the negative omission count.

## Decision

- **QA-14:** closed for validators, error rendering and both v1 HTTP paths.
- **CaptureArchive:** the internal slice holds its documented auth, stop, replay,
  delete-before-cache, dependency, artifact and rollback behavior in-process.
  - The most practical item is AUTH-02/DEPS-02, lock hold on large batches.
  - DEPS-03 needs an explicit ink-versus-capture deletion rule before capture
    writers share artifact IDs with v1 ink.
- **Context:** the slice holds access, filter, key-integrity, staleness and exact
  budget claims.
  - Remaining items are low gaps in branch labeling, current-mode semantics for new
    source versions, and trusted-caller robustness.
- **Not claimed:** PostgreSQL behavior, real concurrency, the production resolver or
  `/v2` adapter, providers, devices and G6/G7.
