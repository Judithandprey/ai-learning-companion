# Independent Learning subscription ASK review

**Outcome: approved for integration within the pure Learning seam; no blocking finding.**

Candidate: `5b4b549105969274f0b0fbcc96fc35530cffd1b1`. Contract checked against clarified ADR 0003 at `1b7c90558165c87c83564b1d6c777905923b8528`. Reviewed the exact module, author tests, owned delivery evidence and reused PNG/time/canonical helpers. Used `git archive` under `/tmp/subscription-learning-5b4b549-_2la3rgm`; dirty main was not edited. Module SHA-256: `3e1d52eb166ffcd83d5c9b2405bee27628faedc13f0798450d473cd5933955ae`.

The implementation preserves the complete closed provenance shape and explicit unknowns, checks local-DIP/full-frame-pixel geometry against actual capture dimensions, returns exact validated PNG bytes, and separates question/assistance from untrusted image metadata. Response binding rejects inconsistent prepared mutations, wrong auth mode, invalid receipt fields and unsupported/oversize output without silently truncating. Copies detach input, prepared provenance and returned provenance. Reusing the existing bounded PNG validator, UTC parser and canonical/hash functions is appropriate; no new dependency, provider or archive is introduced.

Validation performed with root `.venv/bin/python`:

- Author tests rerun on the extracted candidate: `pytest tests/evals/test_subscription_ask.py tests/evals/test_image_evidence.py -q --tb=short` — **180 passed in 0.68 s**.
- Six independent probe groups, **30 checks passed**: actual archived Windows `toFramePixels` agreement across 12 fractional/edge/scaled-display cases with negative global origins; same pixels with different PNG original bytes; detached output and changed question/permission/request; legal/illegal nullable ink bindings; coherent geometry changes after preparation and PNG-header/geometry mismatch; opaque PNG metadata and fixed private-data-free validation errors.

Artifacts: `/tmp/subscription-learning-independent-probe.py` and `/tmp/subscription-learning-5b4b549-review.json`. Initial probe setup could not resolve `node` from PATH; the documented pinned root Node 24.21.0 resolved it. This was a probe-environment issue, not a product defect; its observation remains in `/tmp/subscription-learning-5b4b549-review-initial-setup.json`.

The module correctly leaves authority with its callers: Backend must attest actual successful completion/model/auth and enforce cancellation; desktop main must compare the entire frozen provenance, current intent and session before presenting text. The mutable preparation is not a cryptographic seal, and the prompt is not a semantic disclosure filter. These are explicit scope boundaries rather than claimed guarantees of this pure function.

No provider/auth/display/service work occurred. Real image comprehension, subscription eligibility, actual model latency, Stop races, app presentation, learning semantic quality and Windows end-to-end acceptance remain untested here. Next owner/action: Lead integrates this delivery; Backend/Web compose it with their existing owned work, followed by the already assigned focused QA image/cancellation pass.
