# Capture ingress HTTP integration review

Current implementation **reviewed, integrated and checked on main `6321d0cd167fdd496670645c362344655adfde4c`**; deployment and provider activation remain off. The initial HOLD and its reproductions below are preserved as history.
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

## Correction, integrated checks and next owner

Actual Backend correction `handoff_9f4401b5f11a602bfb9bede50f1a8224` delivered
`c754fc0c9f548f2d2fc6a167bf773ebd9c242b75`. The all-verified guard applies only to
HTTP replay; exact retained-version witnesses distinguish never-issued404 from
lost committed503 without weakening current authorization. Independent targeted
review approved both original reproductions, seven new regression cases, two
legacy controls and the additional last-artifact/sparse-version probes. No broad
review or device campaign was repeated; details remain in the linked report.

Lead integrated base `01241958` as `c128344` and correction `c754fc0` as `6321d0c`.
Actual main verification (2026-09-29 UTC):

```sh
env -u LC_DATABASE_URL .venv/bin/python -m pytest -q \
  services/api/tests/test_ingress_http.py services/api/tests/test_capture.py \
  services/api/tests/test_capture_frames.py services/api/tests/test_display_sources.py \
  services/api/tests/test_original_artifacts.py services/api/tests/test_control.py \
  services/api/tests/test_control_http.py services/api/tests/test_http.py
```

**572 passed in 6.03s.** The same main also executed the HTTP-to-Learning probe
above using the actual repository import of `services.api.ingress_app`: exact124
PNG bytes while active and after Stop, zero bytes after revocation, unchanged
records/references and no composition writes. It remains synthetic MemoryStore
ASGI evidence, not PostgreSQL, a socket transport, device or model receipt.

`git diff ff0b99f` confirms default `app.py`, `auth.py`, `control_app.py`, released
contract code, migrations, `pyproject.toml` and `uv.lock` unchanged. README status
now points consumers to the implemented opt-in factory without activating it.

Next Backend action, once the exact checked release is pushed: one bounded real
`lc_p0_test` HTTP source/original/frame save → stop and wait for its own API child →
fresh API process → exact source/version/byte/ACK readback and retry, including
current stop/revocation refusals. Reuse existing dedicated-DB guards and supervised
ephemeral loopback runner; no full legacy DB campaign, DB restart, new migration or
production endpoint activation. Record actual processes and persistence, keep
synthetic start/pixel facts separate from device/provider proof. Only that run's
unique actor may be cleaned up. No `lc_desktop_preview`, user preview or Paperclip.

iOS continues its assigned original-byte upload/receipt consumer on the unchanged
0.2.4 wire; QA continues the current actual supported-page ink/capture acceptance.
Learning's supplied-context composer remains integrated; coherent production
metadata export and final-use/provider authority are subsequent dependencies.
No account, budget, model or permission change occurred. Publication and actual
next-task delivery/start receipts are recorded below when observed.


## Published baseline and substantive handoff

- Ordinary `git push origin main` succeeded (`ff0b99f..ddcae31`). Independent
  `git ls-remote origin refs/heads/main` returned exact
  `ddcae31daca6f31d12a063c31526eebaca4c5b39`; working tree was clean after release.
- Native `chats list` exposed the existing six routes. Backend continuation
  `handoff_3d8e5e2002879ab6d8dc2094072e80bf` was **accepted/unread**, with
  `execution_started:false`. This is delivery, not an observed start or DB result.
  It supplies the exact baseline, owned test/evidence paths, unique-actor cleanup,
  supervised child lifetime, real HTTP/restart assertions and isolation rules.
- Native iOS dependency update `handoff_9d6d44b5ccd82bbd0d5bebee83e6c2e4` was
  **accepted/unread**, with `execution_started:false`. It updates the existing
  actual-started native consumer, changes no wire shape and requests no new task
  or acknowledgement-only reply. Its earlier actual start remains
  `handoff_3cc5ee1a482d23a2825a30db0c495e36`.
- QA's earlier actual start `handoff_5d5d68b76f52e496f755a6598d3fe05d` continues
  exact `1616cce` supported-page ink/capture acceptance. This backend-only release
  does not change that Web candidate or dispatch another acceptance campaign.
- Automatic [P0 checks](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36599884248)
  completed **SUCCESS** on exact `ddcae31`: Python3.12/Node24.21.0 in2m33s
  and Python3.14/Node24.21.0 in2m57s. Foreground `gh run watch --exit-status`
  returned0. This is the normal pushed matrix, not a repeated local full campaign.

The current unit is the callable HTTP boundary and its retained-evidence checks.
Next concrete integration owners: Backend returns actual DB/process evidence;
iOS returns the native byte consumer for review and a new hosted build/check;
QA returns the already assigned supported-page behavior result. Lead integrates
those deliveries normally. Device signing/trusted producer bootstrap and an
explicitly connected real provider remain separate prerequisites for the two core
gates; no current component or synthetic test closes those gates.
