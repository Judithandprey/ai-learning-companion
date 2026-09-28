# P0 HTTP contract and CI foundation

Date: 2026-09-28 UTC. Previous main: `627e01ccfda5333f2f8e9208bc08164420c7e57c`.
The commit containing this report adds compatible HTTP definitions to contract v0.1.0.

Implemented: generated OpenAPI 3.1.1 for 8 operations on 7 paths, shared HTTP
request/response/error types, source registration distinct from archived versions,
exact note revision reads, reserved-money-aware usage, unknown subscription quotas,
and truthful cancellation state. API routes themselves remain backend-owned work.
The original bridge and event formats are unchanged apart from rejecting malformed
trailing-control-character IDs; registration's connection/type fields are optional.

Recorded outcome summary for `bash scripts/check.sh` on Python 3.14.4 / Node
24.21.0, plus a separately executed `git diff --check` (not verbatim stdout):

```text
Generated TypeScript: matches schema
Generated OpenAPI: matches schema
69 passed in 0.51s
TypeScript 7.0.2 tsc --noEmit: exit 0
git diff --check: exit 0
```

The OpenAPI document passes `openapi-spec-validator==0.9.0`. New negative checks
cover embedded URL credentials, non-HTTP/control-character URLs, false registered
snapshot claims, unavailable current versions, ignoring reserved money, fabricated
quota balances, paid execution being enabled, cancellation-state contradictions,
and trailing-control-character IDs/header keys. Authentication/scopes, error shapes,
parameter coverage and required idempotency headers are checked in the specification.
These checks do not prove server authentication, persistence, concurrency or accounts.

Independent read-only review reproduced and reported the trailing-newline regex
defect; strict end anchors and length bounds now reject it. That review also found
the source/idempotency/CAS/usage/cancellation semantics internally consistent.

`.github/workflows/checks.yml` runs the same checks for Python 3.12 and 3.14 with
Node 24.21.0 and uv 0.12.19, locked installs, read-only repository permissions,
15-minute timeout, no credential persistence/caches/secrets/deployment. Action pins
were verified against official upstream release/tag metadata:

- [checkout v7.0.1](https://github.com/actions/checkout/commit/3d3c42e5aac5ba805825da76410c181273ba90b1)
- [setup-python v7.0.0](https://github.com/actions/setup-python/commit/5fda3b95a4ea91299a34e894583c3862153e4b97)
- [setup-node v7.0.0](https://github.com/actions/setup-node/commit/820762786026740c76f36085b0efc47a31fe5020)
- [setup-uv v10.2.0](https://github.com/astral-sh/setup-uv/commit/c18668ad3cf93ea998bef934396af7bb5c839dc7)

Workflow structure is validated locally. Hosted execution must be read from the
GitHub run for the pushed commit; writing this file alone does not constitute CI
success. No provider or real-device capability gate is passed by these checks.

Hosted result subsequently verified: [run 36390073702](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36390073702)
for `f02618f907a6e2335bf88a01ddba84b0354a1fd4` succeeded. Logs show Python 3.12:
69 passed in 0.98s; Python 3.14: 69 passed in 1.26s. Both TypeScript checks passed.
Backend received that fixed interface baseline; QA received an independent
reproduction task on the same commit. Actual message receipts are in
`p0-http-qa-dispatch.json`; receipt acceptance is not worker completion.
