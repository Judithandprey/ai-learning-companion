# Capture ingress HTTP integration review

Current candidate **HOLD for two narrow corrections**; not integrated or activated.
Backend delivered `01241958a5810e2ed81512e6650f480c10a87fd7` in actual native
message `handoff_2ee6149893341f5eec19f30e68aafbda`. Parent `c8acd23` is its normal
merge of the assigned `4604242` baseline. Existing P0-04/09 continues; this is not
a new requirement, provider choice or second archive.

Seven owned files add five explicit 0.2.4 ASGI operations over the existing store,
registry, original bytes and capture transaction. Lead read the complete factory,
helper changes, new tests and owner evidence. Author reports 88 new HTTP and 477
related existing tests; those counts remain author evidence. Default app, shared
contracts, migrations and dependencies are unchanged. No server is mounted.

## Actual reproduced findings

[Independent bounded review](ingress-http-review.md) identified two concrete mismatches. Lead reproduced
both on `/tmp/lc-ingress-compose-v460a616`, an archive of main `69a719c` plus only
the candidate's service delta after `git apply --check`. No worker worktree changed.

1. After a valid HTTP frame-batch commit, change only the cached first artifact
   receipt from `verified` to `pending`. Exact replay returns HTTP200 with the
   pending receipt, despite the ingress requirement that every artifact receipt
   be verified. The generic legacy ACK validator intentionally permits pending.
   Probe `/tmp/ingress-http-review-znysfg0g/review_probe.py`; actual storage stays
   unchanged. The HTTP-only path must reject inconsistent retained ACKs as503,
   without rewriting the cache or changing legacy pending semantics. Correction
   accepted as `handoff_198c8e0ac2c5b7a9ce4d34622703a23f`.
2. A legitimate existing archive import contains only source version3. Requests
   for never-issued version1 return legacy404, but new ingress GET/PUT return
   retryable503 because `require_retained_source` assumes all lower version
   numbers committed. Probe `/tmp/ingress-http-originals-review-cctz_b8g/sparse_version_probe.py`;
   storage remains unchanged. Use exact-version/current committed evidence,
   preserve404 for unissued versions and503 for genuinely lost originals.
   Correction accepted as `handoff_4e5abacfb7b3b7fff37db7149173e287`.

These are two corrections on the delivered task, not duplicate assignments.
Current auth/lifecycle/rollback and source preservation remain required. Do not
claim the candidate accepted merely because its original author tests passed.

## Lead HTTP-to-Learning composition

`/tmp/lc-http-learning-composition.py` executed actual candidate HTTP registration,
original PUT/GET and atomic frame/process ingress, then actual authorized image
resolution and integrated `compose_process_context`. It uses synthetic MemoryStore
start/member facts, a project-authored 124-byte PNG and an explicit synthetic
authorization callback; no listener, DB, actual screen or provider. Stored frame
and record metadata is read serially in this controlled fixture, not a claim of
a new production atomic context-export API.

Observed PASS: complete original records/frames/source and PNG bytes retained;
editable ink remains a separate reference; composing writes no actor rows and
mutates no inputs. After Stop, historical GET/context keeps the same124 bytes,
new original PUT returns403 and live frame replay returns409. After source
revocation, historical GET returns403 and cached-metadata composition resolves
zero image bytes with an explicit `revoked` gap. Authorization, commit, live and
provider flags remain `not_attested`, and presentation permission remains
`not_granted`. This successful composition does not excuse the two held errors.

Next: Backend delivers a separate bounded correction with regressions; lead
retests those findings, integrates reviewed commits and checks actual main. iOS
continues its already assigned original-byte upload consumer on the unchanged
released wire. No user-preview/Paperclip, device, provider, paid API, account or
permission action occurred.
