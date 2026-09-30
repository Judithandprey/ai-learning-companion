# Single-origin capture lifecycle integration

Backend delivery `2b0b4e14f9589858f572055e60306f8ff636201b` arrived in
`handoff_5fed12491e9f910b921cf41b9bd65f74` at 2026-09-30 05:36:34 UTC,
replying to the existing bounded assignment. Its preserving merge `d84982e`
contains exact assigned baseline `8e4f52d`. It integrates as **`6cce5fe`**.

## Result and review

`services.api.capture_app.create_capture_app` exposes the existing control and
ingress handlers through one explicitly constructed ASGI callable. The 41-line
factory delegates to the existing child routers; their authorization, transactions,
replay namespaces and closed error families remain in place. No business handlers,
identity/archive, authority cache or grant endpoint are duplicated. Raw ingress
still defaults off; construction does not provision membership, start decisions,
sources, credentials or producers.

Root-level paths support stream registration → display registration → original
PUT → verified raw ACK → Stop → current state and authorized historical reads.
There is no combined OpenAPI endpoint, avoiding incompatible same-name component
merges. Existing child schemas remain available through the separate factories.
Prefix mounting is explicitly unsupported in this slice: a pre-existing raw
child error-family selector uses the full prefixed path incorrectly. Correct and
test it before enabling such deployment; it does not block the released native
root-path contract.

Lead read the complete delta and child call flow. Independent exact-archive review
at `/tmp/capture-app-integration-review.md` approves the bounded integration:
16 selected owner cases plus five independently authored probes passed. The latter
exercise changed authentication inside the transaction for all three route
families, a successful `stream:control` identifier lifecycle, and exact Future
cancellation propagation on cached raw replay. These counts are not added to the
main regression total as distinct coverage.

## Actual main checks

At `6cce5fe`, the following passed **282 checks in 6.58s**:

```sh
.venv/bin/python -m pytest -q \
  services/api/tests/test_capture_app.py \
  services/api/tests/test_capture_app_dispatch.py \
  services/api/tests/test_control_http.py \
  services/api/tests/test_ingress_http.py \
  services/api/tests/test_raw_ingress_http.py
```

The unchanged independent probe was copied to
`/tmp/lead-main-capture-app-review.py` and run with main's pytest configuration,
explicit file path and importlib import mode. The production module location was
asserted inside main. **Five checks passed in 0.23s**; the preload causes one
benign assertion-rewrite warning, not a failure. Existing child/default apps,
shared contracts, dependency files and native workflow are byte-unchanged from
`1e0713a`. `git diff --check` passed.

This is actual in-process HTTP against MemoryStore with declared synthetic
authority and original-image fixtures. No new PostgreSQL run, listener, service
restart, user-preview DB/ports, Paperclip, real native transport or paid provider
was used. Owner's earlier real-DB evidence remains separately attributed.

## Next owner and concrete dependencies

The [current native delivery review](native-raw-ingress-review.md) returned one
same-task correction to iOS for lost raw queue admission, malformed terminal
responses and missing exact original PUT/PNG fixtures. Lead will integrate and
run its native workflow only after that correction, then exercise the actual
Swift-emitted request and bytes through this composed callable and the retained
Learning reader. QA receives that exact integrated candidate for one independent
changed-flow check. No completed Web, Simulator or DB campaign is redispatched.

Trusted runtime bootstrap/authentication, HTTPS deployment, signing/device access
and real provider receipt remain separate dependencies. These checks do not
accept either core §7.1 gate, original-screen cross-app input or Notability import.

## Publication and CI

Reviewed/tested release `b2b2650066f50131a149720cc818ecae51286246` was pushed
normally to `origin/main`; `git ls-remote` confirmed that exact SHA. Normal
[P0 CI 36674902851](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36674902851)
passed both Python 3.12 / Node 24.21.0 (5m21s) and Python 3.14 / Node 24.21.0
(3m28s). No native workflow was triggered for this API-only release. The subsequent
CI-receipt commit changes documentation only.

The Backend integration/next-dependency notice was accepted as
`handoff_8d6f6c20191aa984165f0a1d7291e6bc`, replying to its actual delivery.
Its initial receipt is unread/not started; no additional implementation or reply
was requested. iOS retains the one dispatched correction; Lead retains actual
native-fixture integration and the exact QA release. Support remains on demand.
