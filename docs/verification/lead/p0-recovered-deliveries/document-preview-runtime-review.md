# Independent P0-07 document preview runtime review

Reviewed commit: `bf3e58befdfe5982a730fe55d4b469c823c7db4f`.
Lead checkout at assignment: `c18d30b5e47ee10e51d7f7f89250764c5d7310d2`.
Review copy: `/tmp/p0-preview-runtime-review`, produced using `git archive`.
Main and worker worktrees were not edited. No database service, migration,
provider, account, or Chats operation was performed.

## Recommendation

**Integrate the runtime with its separately reviewed preview-wire prerequisites
`f0ecfe1` and `96d8137`. No concrete runtime blocker was found.** This is a bounded
trusted local document archive API, not an end-to-end usable UI milestone or full
P1 acceptance. Lead still owns integrated verification; Web connects its real
transport and QA exercises one combined UI/API save/restart/reopen flow.

Applied project PONYTAIL LITE: reuse existing actor transactions, authentication,
archive models and PostgreSQL store; no new dependency or parallel archive is
needed for the delivered flow. The two small metadata kinds retain request and
filename/retry linkage absent from the existing original-record representations.

Read AGENTS/TEAM, lead role, team directory, workflow, current effective decisions,
P0-07 card, affected original/English requirements and acceptance, original-goal
verification, relevant audio/screen invariants, PREVIEW.md and the owner's evidence.
All four source/English manifest hashes match at the reviewed commit.

## Independently run checks

Interpreter: existing lead `.venv/bin/python`, used read-only. Working directory:
the isolated archive above.

- `python -m pytest -q services/api/tests/test_preview.py services/api/tests/test_preview_http.py services/api/tests/test_preview_local.py`
  — **177 passed in 0.96 s**.
- `python -m pytest -q services/api/tests/test_source_deletion.py services/api/tests/test_capture.py -k 'delet or revoke or tombstone'`
  — **10 passed, 56 deselected in 0.20 s**; targeted because the sole existing
  domain change joins preview cleanup to canonical source deletion.
- `python reviewer_probe.py` — **four PASS groups**, exit 0. Reproduction script
  remains in `/tmp/p0-preview-runtime-review/reviewer_probe.py`:
  1. A 2 MiB UTF-8 document with BOM, Unicode and CRLF imports through HTTP and
     survives construction of a new app instance with exact bytes/hash; the
     separately saved DOM bytes remain exact. This is MemoryStore evidence,
     **not process-restart durability evidence**.
  2. Advancing a saved note via canonical v1 to reference a second preview source
     makes deletion return `409 mixed_source_note_conflict`; the complete store,
     both preview originals and linkage metadata remain unchanged. Reopen still
     returns the exact saved historical revision.
  3. Persisted device revocation fences read and exact import/save retries through
     both app instances with 403 and no new writes.
  4. All four source/English manifest hash pairs match.

## Boundary review

- Authorization is checked before handling the body and again under the canonical
  actor transaction, including current token expiry/generation, actor/scope,
  bound user/device/session and active membership. Retry success is not used to
  bypass these checks. Bootstrap creates absent local identities and refuses to
  revive persisted revoked/deleted/invalid authorization or memberships.
- The foreground launcher requires explicit opt-in, stable explicit identities,
  a supplied PostgreSQL DSN and a sufficiently long printable token. It uses no
  MemoryStore fallback, fixture import or automatic migration. Its listener is
  `127.0.0.1`; proxy headers are disabled. Peer, Host and exact Origin checks plus
  bearer authentication protect the local HTTP seam. Extra CORS origins must be
  explicitly configured HTTP loopback origins. This remains local test auth.
- Full imported UTF-8 bytes are represented losslessly in the canonical immutable
  SourceSnapshot text and checked on readback against length and SHA-256. DOM
  artifacts are separate, explicitly lack pixels, and retain the actual bridge
  and explanation request. The ASK observation uses selection confirmation time;
  the earlier frame time remains distinct. User-authored note blocks remain
  `user_original` despite the documented legacy `kind: ai` enum container.
- Import/save receipts follow transaction commit. Exact retries preserve original
  records, changed bodies conflict, and rereads validate original storage rather
  than trusting a cached success. Source deletion removes preview metadata inside
  the existing deletion transaction and erases replay content while retaining
  tombstones. The focused suite covers rollback, deletion/revocation fences,
  old-version reads, artifact conflicts and missing/corrupt originals.

## Owner-only database evidence

Inspected `docs/verification/backend/p0-07-document-preview.md` and the actual
`services/api/tests/postgres_preview_check.py` runner at this commit. The owner
reports exit 0 and seven PASS groups on PostgreSQL 18.6, including separate
supervised API child processes, exact original/DOM/request readback after API
restart, conflict/auth negatives, deletion/no-resurrection, and unique-actor
cleanup. The runner checks the dedicated local `lc_p0_test` target and actual
database, waits for every child to terminate, and reports success only after
cleanup. Its supplied document is 12,489 bytes and DOM is 594 bytes, with hashes
recorded in the owner report. The selected text matches the supplied document.

**This review did not rerun that database batch or independently observe its
historical execution.** The committed owner report and reviewed runner support
the owner-only evidence category; unit/in-memory results above do not elevate it
to independent real-DB acceptance.

## Remaining scope and next action

Integrate with the corrected wire and have Web use returned owned identity,
separate full source/DOM data, immutable saved note IDs and honest failure state.
Tokens expire one hour after startup; local UI must handle reauthentication.
Then QA starts the integrated version and checks actual document selection,
save, API-process restart and reopen without reimporting.

No provider generation, production auth, real course-page/iPad/Pencil operation,
audio/screen capture, original-live-screen ink, Notability import, DB-server restart,
long-term retrieval or full V-DailyResume/V-ArchiveCompanionContinuity/P1 pass is
claimed by this review.
