# Bounded correction review — 75dad5e

**Decision: MERGE the correction. All three confirmed blockers from 096cac1 are closed within the assigned scope.** No new blocker found in this delta. Root's generated-wire import/fallback-fixture cleanup and one integrated user-workflow check remain integration work; this is not full P1/iPad acceptance.

Exact candidate: `75dad5edb7f3d97c94373df3c409294bc1ee4054`, parent `096cac1de412de4761e672a0e8478f89a3a59146`. Isolated candidate `/tmp/p0-web-real-correction-_iiefxpi` combines those exact Web files with shared contracts/services from main `04704654424463ab335187034363619923e966c5`. Main and worker files untouched. Unchanged full P0-07 meaning and prior requirement/workflow review retained.

## Independently reproduced results

| Original blocker | Correction result using the original probe |
| --- | --- |
| Response headers arrive but body stalls; timeout was cleared before JSON read | With timeout 15 ms, at 80 ms save is **settled, signal aborted, outcome unknown**. It no longer stays Saving indefinitely. |
| HTTP200 null incorrectly confirms a pending id | Entry remains **pending:true, saved_at:null**. |
| Valid hashes concealed foreign frame source/note owner and non-user observation | Reopen is **refused**, naming the broken relationships; no item returned as verified. |
| Interim 404 removed an unknown id before its later commit | Entry remains pending before commit, becomes **saved under the same id** after commit, and direct reopen succeeds. |

All **26 focused preview tests pass**, including the 30 isolated binding-negative cases inside one test, accepted canonical released example, truncated/stalled body behavior, identical retry, fresh-store pending recovery and confirmed-entry deletion. TypeScript no-emit typecheck and build pass.

The original in-process ASGI probe also reran: valid import 200 → save POST body paused → GET404 → finish body → POST200 `server_committed` → GET200. That server ordering still exists; the corrected client now preserves the id through it. This uses the actual released ASGI app with MemoryStore, no network listener or PostgreSQL process.

## Code assessment

- The single deadline now covers both fetch and response-body consumption, with a `finally` clearing the timer after the entire operation. The explicit race also settles when a test/body stream ignores abort. A cut-off 200 write is unknown, while a cut-off read is refused.
- One `savedPreviewProblems()` check is used for pending confirmation and reopen. It checks necessary field presence before equality, then the requested id/current owner, committed/provider-unavailable envelope, source/frame/selection/request linkage, DOM capture text/time, source bytes/text, observation attribution/text and exact user-original note revision/block/context relationships. This closes the three demonstrated relation mutations and prevents null/incomplete 200 responses from becoming saved. It is intentionally a bounded relationship check, not a general schema implementation.
- A pending id survives 404 in both list reconciliation and direct reopen. A previously confirmed id can still be pruned when the server reports it gone. A successful reopen confirms a pending id and refreshes the list; list totals now distinguish confirmed and unconfirmed entries.
- The BOM fix is correct: `ignoreBOM:true` preserves the leading U+FEFF when comparing source bytes to Python's retained source text and when decoding exact frame text. `readUtf8Document` still performs strict decode/re-encode equality. The canonical released SavedPreview example is accepted with both hashes verified; the stand-in server now retains its source BOM too.
- Hash mismatches remain separately reported as `verified` warnings, as already scoped; this review does not expand the correction into a universal schema/geometry validator. Permanently unarrived ids can remain visibly unconfirmed; the owner documents that conservative recovery tradeoff.
- README now distinguishes hosted unsigned native compilation from this still-unpackaged Safari module. No iPad/Safari runtime claim was added.

The fallback examples file is **byte-identical** to main's canonical `packages/contracts/document_preview/examples.json` (`cmp` exit 0); the 26-test run selected the canonical file and checked its pinned git blob. Root can remove that fallback and use the generated wire import during integration without needing it for this reviewed run.

## Exact commands and recoverable evidence

Run from `/tmp/p0-web-real-correction-_iiefxpi`:

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node --test --test-isolation=none apps/safari-extension/tests/p0-07-preview.test.ts
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /home/agentsdock/Projects/learning-companion/repo/node_modules/typescript/bin/tsc --noEmit -p apps/safari-extension/tsconfig.json
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /home/agentsdock/Projects/learning-companion/repo/node_modules/typescript/bin/tsc -p apps/safari-extension/tsconfig.build.json
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node review-adapter-probes.mjs
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node review-pending-index.mjs
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python review-pending-race.py
cmp packages/contracts/document_preview/examples.json apps/safari-extension/tests/fixtures/document-preview-examples.json
```

Original probe scripts were copied unchanged; their relative imports now target the correction. Results are saved beside them as `review-adapter-probes.json`, `review-pending-index.json` and `review-pending-race.json`. The prior failing results remain under `/tmp/p0-web-real-adapter-fek88wij` for direct comparison.

Owner evidence inspected, not rerun: new `p0-07-binding-real.json` reports **3/3 real API/database client checks**, including intentionally dropping a post-commit answer, recovering via pending lookup and accepting real readback. The owner's **23 check-mutants killed**, full **113-unit** run and earlier **33-browser** campaign remain owner-attributed. The 30 isolated binding cases did execute independently inside the requested 26-test run; no separate mutation campaign was run.

No browser, network service, database service, provider or native Chats used. No new dependencies, schema or implementation edits. Next: lead integrates the correction with canonical imports, then verifies the combined runnable preview at its current user-outcome boundary.
