# One explicit ASGI origin for the capture lifecycle

Date: 2026-09-30 UTC. Owner: Backend, existing P0-04/P0-07/P0-09 continuation.
Assigned baseline: `8e4f52d0f5e613e8cff59bba888441dcbc847787`.
Preserving worktree merge: `d84982ef924a8d7838de013d0d028872775c35a8`.
Delivery is the commit containing this evidence; Lead owns integration and push.

## Outcome and design

`services.api.capture_app.create_capture_app` supplies one explicitly constructed
ASGI callable for the existing stream control, source/original ingress and
optionally raw ingress paths. It accepts the same trusted store, authenticator,
frozen capabilities, clock and stop-fact resolver as the child factories, plus
`enable_raw_ingress=False`. [Construction example](../../../services/api/README.md#explicit-single-origin-capture-lifecycle).

Native Starlette Route entries delegate full requests to the child ASGI apps.
The control child still resolves method-sensitive stream IDs ending in `:control`;
the ingress child handles the other original paths and unknown-route refusals.
No business handler, authorization logic, transaction, replay cache, identity or
archive is copied. Child factories, default application, local and preview paths
remain byte-identical. Construction never consults or initializes stored authority,
creates grants/membership/tokens/sources, or starts/resumes a producer.

There is no common OpenAPI endpoint. `/openapi.json` returns the existing closed
0.2.4 404 for all methods, with no-store/nosniff headers. The released schemas have
different `BearerAuth` and `IdempotencyKey` definitions and server metadata;
avoiding a public union prevents silent name overwrites or an incomplete schema.
Independent child OpenAPI endpoints remain unchanged. No new shared contract,
dependency, migration, environment switch or listener was added.

Refreshed complete affected source/English clauses and acceptance:
R07/R29/R30/R35/R36/R46/R51/R52/R58/R59; A12/A14/A16/A30/A31/A44; §7.1;
AUDIO-08/AUDIO-14; process evidence/completeness and V-SourceTimeRelations;
current decisions, workflow/role and the three released transport READMEs.
All four source/English manifest hash pairs match. PONYTAIL LITE applies through
reuse of the existing child applications instead of a new general route manager.
These supporting checks do not pass the complete product requirements.

## Actual execution

The existing locked lead Python environment was used read-only. Final command:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q \
  services/api/tests/test_capture_app.py \
  services/api/tests/test_capture_app_dispatch.py \
  services/api/tests/test_control_http.py \
  services/api/tests/test_ingress_http.py \
  services/api/tests/test_raw_ingress_http.py
```

**282 passed in 6.55s**, exit 0: 53 new composition cases and 229 unchanged child
HTTP cases. Earlier overlapping focused runs were 19 lifecycle cases and 34
dispatch cases; their counts are not additional unique coverage.

The actual HTTPX/ASGITransport lifecycle used one composed callable and one origin:

1. Begin without membership/start grants; constructing the app leaves data intact.
   Missing membership refuses registration with 404, and membership without an
   independently supplied start grant refuses it with 403.
2. Explicit synthetic trusted membership/start provisioning precedes HTTP stream
   registration, display-source registration, typed PNG and editable-ink uploads,
   and raw batch submission. The five HTTP mutations enter exactly five actor
   transactions, with no wrapper transaction. ACK artifacts are all verified.
3. The same Idempotency-Key remains isolated by the existing full route namespaces.
   Exact raw replay preserves the original ACK/data. Raw source/time/orientation
   unknowns and the original bytes remain unchanged.
4. An independently supplied synthetic finite stop fact enables HTTP Stop. GET
   state and registration replay both return current stopped state. Cached live
   raw replay fails `capture_stopped`; source registration and original PUT retry
   are refused. Read-only access still returns the exact retained PNG, ink and
   source descriptor. No stopped state becomes live.
5. Source revocation refuses affected access while another authorized source's
   history remains readable. Account revocation and re-enabling do not revive old
   streams; another actor's same-ID history and replay remain unchanged.

Per-family capability and scope omissions, expired identity and unexpected queries
retain their 0.2.1/0.2.4/0.2.6 closed errors. Default raw ingress stays absent.
Wrong methods, overlapping stream-ID forms, unknown paths and trailing slashes
match the owning child refusal without adding redirects. Tests compare response
bytes and headers, not just status. Factory construction works with injected
objects that would fail on any authority/store read, proving no hidden bootstrap.

Failure/cancellation checks compare standalone children and the composed app.
Ordinary authenticator failure remains sanitized 503. Future cancellation retains
each child's behavior, including propagation on raw ingress. Actual outer request
task cancellation while streaming a body propagates and leaves the store empty.
No accepted ACK or partial state is used to mask cancellation.

Independent static review found no composition blocker. `git diff --check`
passed. No database operation, service/restart, dependency install, native network,
provider, preview data or ports, Paperclip, credentials or account was touched.

## Failed expectations and known deployment limit

Initial test expectations were corrected against unchanged child behavior:
missing membership returns 404 rather than a generic permission error; and raising
`asyncio.CancelledError` inside a synchronous authenticator becomes a sanitized
503 at the existing child task-group boundary. The latter was reproduced for all
three families standalone and composed. An additional real outer-task cancellation
check verifies propagation separately. Production child behavior and the refusal,
unchanged-state and no-success assertions were not relaxed.

The current native contract uses one origin with the released root-level paths.
A pre-existing child limitation was independently identified and reproduced:
with ASGI `root_path='/prefix'` and request path
`/prefix/v2/process/raw-frames:batch`, both the unchanged ingress factory and this
composition emitted 503 `unavailable` with **0.2.4**, rather than raw **0.2.6**, for
the same unconfigured request. The child compares the full URL path when selecting
error/cancellation behavior while its router strips the prefix. This composition
does not alter or claim support for prefix-mounted deployment. Lead should assign
a bounded child selector correction before that deployment is enabled; root-level
errors and cancellation are covered above.

## Next owner and remaining evidence

Lead reviews/integrates this source commit and combines it with iOS's current
request-fixture delivery, then supplies one exact integrated candidate to QA.
Current trusted identity, membership, one-use start and independently verified
stop-fact provisioning remain external dependencies of construction. This factory
provides neither a public grant endpoint nor a production authentication adapter,
TLS listener or native client activation.

These are in-process HTTP operations with synthetic authority/pixels and
MemoryStore. No new PostgreSQL, process restart, TLS/network, device, actual AI,
screen freshness, original-screen cross-app pen or Notability import pass follows.
Both §7.1 gates and the full navigation/write/erase/undo/redo/ASK/save/reopen/edit
experience remain open. A shared server origin alone does not establish the full
P1 product or the original classroom-to-Notability flow.
