# G6 candidate experiment proposal — not executed

Checked primary sources on 2026-09-28. Graphiti documents temporal graphs,
episode provenance and hybrid retrieval; it requires a graph backend and model
clients. Its default model setup uses a paid API, so installing the package is
not enough to authorize or execute this experiment. Local compatible model
endpoints are documented as an alternative. [Official Graphiti README](https://github.com/getzep/graphiti)

The observed release is v0.30.2. The matching manifest declares Python >=3.10,<4
and includes graph/model client dependencies; the FalkorDB Lite extra adds a
local embedded database dependency. Pin a release, not the moving main branch.
[Release v0.30.2](https://github.com/getzep/graphiti/releases/tag/v0.30.2),
[tagged dependency manifest](https://github.com/getzep/graphiti/blob/v0.30.2/pyproject.toml)

## Concrete dependency request to lead

Authorize and lock `graphiti-core[falkordblite]==0.30.2` in a separate experiment
dependency group. Lead owns the root manifest and lock. Resolve and review the
transitive lock plus the embedded server runtime before execution. Do not install
it as a production dependency based on this proposal. The existing baseline
requires no dependency change and stays independently runnable.

Provide a separately approved local model endpoint/configuration with exact model
and embedding weight revisions, dimensions, tokenizer and license. The endpoint
must be verified to run locally without paid fallback. Verify extraction JSON
schema support and a six-query development smoke test before evaluating. No local
endpoint or suitable weights have been established in this task. If paid models
are proposed instead, backend must first implement and verify atomic reservations,
concurrency limits, retries, cancellation and usage reconciliation; no paid run
is authorized here.

## Bounded protocol

1. Use the exact committed `records.json`, `manifest.json`, `queries.json` and
   `labels.json` hashes from the local preflight. Ingest the same 875 observations
   with their SourceSnapshot and Frame metadata. Do not provide query labels or
   ideal answers to graph extraction. Use chronological event order and stable
   source IDs; an episode maps to one original observation, never a new identity.
2. The graph is a disposable derivative. Preserve an episode-to-original-event
   mapping and reject unmatched returned edges. Resolve ranked graph results back
   to the same five-field evidence identity; deduplicate by event, limit to five,
   and count unsupported facts/anchors as failures. Graph facts alone are not
   evidence of original wording, correct actors or factual truth.
3. First run exactly one graph build, then all 80 queries once, with the same
   explicit metadata/current-history semantics. Warm cache and cold-start timing
   must be reported separately. Include the 30 fuzzy queries required by G6 and
   keep all 50 exact-history cases to detect regressions.
4. Proposed local resource ceilings: one foreground experiment, concurrency one,
   30 minutes elapsed, at most 10,000 combined extraction/embedding/rerank requests,
   and 2 million total model tokens. Instrument every client call, including
   internal retries. Stop and retain a partial report if any cap is hit. Proposed
   ceilings are experimental constraints, not a performance claim or approval to
   download large weights. Paid-call ceiling remains **zero**.
5. Report ingestion failures, evidence Recall@5, complete-query success, source/
   actor/version errors, per-query failures, p50/p95/max latency and sample count,
   ingestion time, stored bytes, model/provider versions, tokens, actual local
   requests and API spend. Do not call unpriced local compute free; API spend zero
   and unpriced machine time are separate.
6. Restart and rebuild the graph, compare original file hashes, and re-run the
   same anchored queries. Explicitly test corrections, old versions and missing
   media. Retain first-run and rebuild failures. Independent human review of the
   labels and future consented real-course fixtures remains necessary.

Decision criterion: Graphiti must demonstrate useful fuzzy improvements without
losing exact evidence correctness, with measured acceptable resource usage. Lead
can then record the architecture decision. A second model's agreement, package
installation or an unexecuted proposal cannot pass G6.
