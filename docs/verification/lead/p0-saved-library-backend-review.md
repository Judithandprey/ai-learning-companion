# Backend saved-library checkpoint review

**Approve exact checkpoint `40aac5c5b95d2a68524ef3adebf5c46752e6686f` for normal
lead integration on `d9fe67050f8d00414ec3479659ba8d17e7a16eba`.** No blocker found
in the bounded discovery/auth/paging/deletion/corruption scope. This preserves
completed storage work; it does not authorize another library feature or campaign
ahead of the user's original Safari-page capture priority.

## Exact candidate and reading

- Candidate: `/tmp/backend-library-checkpoint-review-r2vewy58`, created from
  `git archive d9fe670` and overlaid with the delivery's six exact changed files:
  `services/api/preview.py`, `services/api/preview_app.py`,
  `services/api/tests/test_preview_library.py`,
  `services/api/tests/test_preview_library_http.py`,
  `services/api/tests/postgres_library_check.py`, and
  `docs/verification/backend/p0-07-saved-library.md`.
- Metadata: `/tmp/backend-library-checkpoint-metadata.json`.
- Formal additive wire:
  `06aa07f75b83497ef6ddbdd7f79087e57329cd21`, document-preview.0.1.0.
  Read the complete saved-library contract section and existing transaction,
  authentication, exact-read and deletion call path. Shared contracts, source
  storage, domain deletion and migrations are unchanged in this delivery.
- Delivery parent and named main have identical preview/storage/domain/contract
  baselines, so the review does not hide a merge divergence in this path.
- Refreshed canonical workflow/PONYTAIL LITE, AGENTS/TEAM, Backend role and current
  original-Safari task direction, current decisions, affected source/English
  R27–32 and source/continuity acceptance clauses. All four source/English
  manifest pairs match. Existing global invariants remain applicable.

## Reviewed behavior

**Authorization and privacy:** HTTP authorization occurs before query handling.
The domain method enters the actor transaction and calls the same current
authorization/device/session/membership guard before decoding a cursor or scanning
saved records. The HTTP guard re-authenticates after lock acquisition and checks
the token generation. Scan/get operations remain actor scoped; the cursor's owner
must equal the authenticated actor. Error responses use the existing content-free
HTTP mapping. The new response contains only the six released summary fields.

**Paging:** order is descending actual UTC creation instant, then descending note
ID. Fractional timestamp digits are retained beyond the datetime microsecond
component rather than lexically comparing differently padded timestamp strings.
Cursors encode the strict position, not a required live anchor lookup; earlier
anchor deletion therefore permits continuation. A changed page size preserves
order. Newer insertions are found on refresh, consistent with the formal live-view
contract. The page-size cap does not impose a retention/discovery cap.

**Deletion and revocation:** each page reads current lifecycle state. Deleted or
revoked sources/notes and note tombstones are excluded before summary construction.
Normal source deletion already removes preview metadata and marks save replay
receipts deleted under the same actor lock; listing adds no writes or resurrection
path. Subsequent pages recheck the current state rather than trust a prior cursor.

**Incomplete/corrupt retained data:** the method validates all visible saved rows,
including records outside the requested page, through the existing exact-read
path before returning a list. Missing frames, artifacts, source snapshots,
import metadata, notes/revisions, or mismatched stored identities cause unavailable
rather than partial success. Existing durable save receipts expose missing saved
link rows rather than permit a false empty archive. The note creation time must
match its immutable observation receipt time. Valid later note revisions still
use the original saved revision; this endpoint does not silently rewrite history.

**Scope and simplicity:** one existing archive/transaction/read path is reused.
There is no new identity, persistence store, index, dependency, provider call or
capture action. The per-page full scan/read-validation cost is explicit and
unmeasured at large history sizes; optimizing that is outside this checkpoint.

## Targeted independent reproduction

Python 3.14.4, existing locked environment, temporary candidate, synthetic inputs,
MemoryStore and in-process ASGI only. The review selected 15 named test functions
(27 parameterized cases) from the two new test modules instead of rerunning the
owner's 273-check batch.

**27 passed in 1.60s**, exit 0. They cover:

- Empty server discovery, exact reopen and unchanged stored originals.
- Tied/fractional timestamps, changed page size and 52 saves beyond one maximum page.
- Missing original components outside the selected page, missing saved-link row,
  contradictory creation time and account-bound cursor rejection.
- Missing/bad/expired/foreign/assistant credentials, write-only scope, duplicate
  authorization, account revoke/regrant, token revocation, device/session/member
  fencing and token expiry after the actor lock is acquired.
- Two actors with identical note IDs, source deletion/revocation between pages,
  deleted cursor anchor with newer insertion, and unchanged surviving originals.

Exact selected pytest argv is saved in
`/tmp/backend-library-checkpoint-tests.json`; output is
`/tmp/backend-library-checkpoint-targeted.txt`. Reproduce that exact bounded set:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python - <<'PY'
import json, subprocess
from pathlib import Path
command = json.loads(Path('/tmp/backend-library-checkpoint-tests.json').read_text())
raise SystemExit(subprocess.run(command, cwd='/tmp/backend-library-checkpoint-review-r2vewy58').returncode)
PY
```

Exact delivery `git diff 40aac5c^ 40aac5c --check` passed. No contract generation
or full application suite was repeated because contracts were unchanged.

## Limits and next action

No main/other-worktree modifications or commits. No DB, provider, browser,
user-preview, Paperclip, private credentials, exported user data or running service
was accessed. The new PostgreSQL runner was read, not executed; its reported
`lc_p0_test`/PostgreSQL 18.6 run remains owner evidence, not independent reproduction.

This approval does not certify arbitrary jointly forged/missing database history,
large-history throughput, real cross-device identity, Safari/iPad visual capture,
editable screen ink, provider understanding or full A09–12/G/P1 acceptance. A
cursor is a position rather than an authorization credential, and pages are a
live view rather than a frozen multi-request snapshot.

Lead may integrate these six reviewed files and perform the normal integrated
check. Backend should then await the concrete same-archive capture dependency.
The original Safari learning-page entry and actual visual capture remain the next
user-visible priority; no additional library search/UI/polish work follows from
this review.
