# Windows HTTP 0.2.10: historical H1 HOLD

**Resolved by reviewed correction7b46bec**, integrated with its base through
`e3b4fd0`. [Current integration and312 main passes](integration.md) supersede the
pre-correction status below; the negative evidence remains unchanged.

Backend delivered **72e928a4bfd9664b2c733c7d32d8d14d2d2fb813** through
**handoff_0048225fb2bc84af6136c69a74fae150**, following normal merge e7e5620 of
d6a444c. No integration yet. The released pure contract remains unchanged and
all production mounts/providers remain off. This is the existing P0-04/09 task,
not a new HTTP implementation assignment.

[Complete independent review](independent-review.md) and [actual outcomes](original-results.txt) retain exact commands and scope.

The 11-file delta adds the Windows route to existing opt-in factories and the
existing actor transaction engine, reusing original upload and full ordered replay.
Lead inspected the production delta and full 0.2.10 requirements. An independent
review executed the four new modules: **190 passed in 8.07s**. Eight additional
independent cases gave **seven passes and one failure**. The failure blocks release.

## Present-but-corrupt replay receipt is reconstructed

After a successful Windows HTTP200/accepted ACK, the probe replaces the EXISTING
actor `capture_replay` row at `key('POST', WINDOWS_ROUTE, 'windows-http')` with
`{}`. The exact retry returns **HTTP200/duplicate** and replaces that malformed row.
Expected: HTTP503/unavailable and no mutation. This is explicit retained-corruption
injection, not an ordinary-user request, claimed database exploit or real-DB test.

The common engine `services/api/capture.py` uses `if cached:` before retained
receipt validation. A present empty row is treated as absent. Subsequent record
and original checks succeed, permitting ACK reconstruction. The released contract
requires corrupted committed evidence to fail closed; clients cannot repair that
retained receipt merely by retrying an otherwise valid body. The new route exposes
this inherited engine defect; no unrelated corruption framework is requested.

The other independent checks passed: unselected retained R1 image contradictions
(including distinct-ID alias), either original's coexisting empty tombstones, and
scope reduction after initial authorization under the transaction all withhold
success without mutation. Lead also checked merged OpenAPI closure: all 62 component
names across existing/Windows enabled families are compatible, with no conflicting
schema definitions. In-process ASGI/MemoryStore and synthetic PNG/identity inputs
do not establish real DB/native/provider acceptance.

## Narrow same-owner correction

Validate retained replay **presence and shape** before it can be used or replaced;
a malformed existing receipt must produce unavailable without any write/ACK.
Preserve existing default-off behavior, old-family compatibility, ordered-envelope
semantics, valid duplicate receipt identity, deleted/lost evidence and current
permissions. Add this exact regression to the focused suite, including stored-state
invariance and a valid retry positive. Do not silently sanitize, reconstruct or
normalize a malformed row. No migrations, protocol, dependencies or live services.

[Historical independent probe](original-defect-probes.py) imports the candidate's
actual fixture and production path. Its final test is expected to fail on 72e928a;
keep the negative evidence and retest it unchanged on the correction. Next owner:
Backend repairs this single seam, Lead reviews/integrates and runs focused checks,
then QA independently verifies the exact released HTTP candidate. Web's existing
mapper remains separate; transport adoption follows a reviewed HTTP baseline.

The exact correction was accepted through native route receipt
**handoff_4bcecb9d8991b05b8aafb952cb755e26**, replying to the actual delivery at
pushed **181fb6a03dfe09add3af6e4045537bffdd9f161c**. Acceptance returned unread /
execution_started=false; no start or corrected result is claimed here.
