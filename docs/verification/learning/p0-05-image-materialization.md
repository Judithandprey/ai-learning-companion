# P0-05/10 original image materialization

Lead task `handoff_8f4ec2916ceb10703361027cc6e513cd`, interface confirmed by
`handoff_3c09df1f7b6446bf7ed8bfbce4247878`. Read exact main
`1cbc38fd75b205a795bf5f966b00fc71b3355527`: current TEAM/workflow, P0-10 card,
affected original/English R07/R29/R30/R35/R36/R51–53/R58/R59, linked acceptance,
process/capture limits and decisions. Canonical requirement/workflow content is
unchanged from the previously verified source-English pairs. Existing archive,
context and evaluation runtime match this branch; newer shared contracts were
used in the temporary baseline composition below without changing this worktree.

## Executable outcome

`services.learning.images.materialize_image_evidence` consumes the existing
archive/context and an explicit trusted bounded resolver. It returns exact PNG
bytes only with matching complete Frame, SHA-256, dimensions and bounded pixel
structure. No source acquisition, URL/path resolution, second store, provider or
wire change. See the callable usage and exact resolver shape in
`services/learning/README.md`, section “Original image evidence”.

Capture restrictions use a `(session_id, device_id)` map, so one active device
does not enable another. Missing states, stop/disconnect/stale states and current
stale-frame gaps suppress current materialization. Explicit authorized history
remains history. References retain original event/frame/source/version/device/time,
actor and provenance; missing/revoked/unavailable/unobservable/corrupt/unsupported
or oversized input yields explicit gaps, without byte fallback or substitution.
No live-input, provider-receipt, complete-observation or disclosure grant is made.

The intentionally small PNG validation path follows [W3C PNG](https://www.w3.org/TR/2025/REC-png-3-20250624/)
sections 5/9/10/11. It checks static 8-bit RGB/RGBA non-interlaced pixel streams;
other variants/formats remain unsupported. Ancillary bytes are CRC-checked and
preserved opaque, not interpreted or sanitized. No new image dependency installed.

## Completed checks

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest tests/evals/test_image_evidence.py tests/evals/test_context.py -q
# 117 passed in 2.38s: 66 image checks + 51 existing context checks.
```

Exported exact main `1cbc38f` runtime/contracts/context tests and frozen fixtures
to `/tmp/learning-images-main-ylbotw71`, overlaid only `images.py` and
`test_image_evidence.py`, then ran the same command: **117 passed in 2.50s**.
This is a temporary baseline composition, not a claim that main was modified/tested.

Cases exercise exact RGB/RGBA byte return; distinct before/after synthetic images
and devices with retained times and historical/current labels; denied resolver
access; unknown/DOM/missing/stale frames; wrong owner/frame/artifact/hash/version;
matching-hash malformed PNG, CRC/decompression/scanline/dimension failures;
compressed expansion and per-image/aggregate/pixel bounds; no filesystem access,
implicit other-device activation, retries or disclosure escalation; input/output
mutation isolation and archive mutation rejection. All images are project-authored
synthetic TEST DATA, with test-only provenance; no actual screen or user samples.

Frozen187 inventory SHA remains
`b57dea1aec1aadfc4b892c0ba95d275f14f56048849cd0ba523c020a61167997`.
Original fixtures, queries/labels, scoring and failure evidence are unchanged.
No old retrieval/snapshot campaign or provider benchmark was repeated.

## Next owner and limits

Lead reviews/integrates and adapts Backend's typed artifact seam to this resolver.
Actual source/frame ingress and current authorization remain Backend/client work;
the caller must bound reads and fence revocation/state changes through final use.
Local snapshot checks are not a concurrent authorization boundary or proof that a
caller-reported active device is still fresh. Already-returned data cannot be
revoked by this function. No source changes, paid calls or runtime credentials.
Continuous real screen/ink acquisition, temporal completeness, provider receipt,
real iPad behavior and Notability remain unverified; passing synthetic pixels
does not close those original goals or G6/G7.
