# P0-06A independent contract acceptance

Scope: lead-owned contract 0.1.0, generated TypeScript and generated OpenAPI at
`f02618f907a6e2335bf88a01ddba84b0354a1fd4`. This is a contract-level review. It is
not endpoint, database, provider, native or device acceptance. No gate passes here.

## Environment and commands

- Worktree `wt-review`, branch `team/qa`, clean fast-forward to `f02618f` before work.
- Ubuntu 26.04.1 LTS on WSL2 (Linux 6.18.33.2, x86_64), uv 0.12.19, Python 3.14.4,
  Node 24.21.0 (read-only from `repo/.tools/node-v24.21.0-linux-x64/bin`), npm 11.19.0,
  TypeScript 7.0.2. Python 3.12 was not run locally.
- Contract files are byte-identical from `f02618f` through the later specification
  baselines `57aee9c` and `e432937` (`git diff --stat f02618f e432937 -- packages scripts
  pyproject.toml package.json uv.lock package-lock.json tsconfig.json` prints nothing).
  No integrated-commit check was run on those later commits.

```sh
uv sync --frozen
npm ci --ignore-scripts                 # added 2 packages, 0 vulnerabilities
bash scripts/check.sh                   # exit 0: 69 passed, tsc --noEmit exit 0
git diff --check f02618f~1 f02618f      # exit 0
gh run view 36390073702 ...             # headSha f02618f, both jobs success (read-only)
.venv/bin/python -m pytest -q -rx tests/e2e   # 107 passed, 15 xfailed
```

`tests/e2e/test_p0_06a_contracts.py` holds the independent checks. It also runs
`tests/e2e/ts/contract_types.check.ts` through `tsc`. That file contains 18
`@ts-expect-error` checks. A mutation run showed that an unused directive makes tsc
exit 1 (TS2578), so each expected error is real. Confirmed gaps are
`xfail(strict=True)` tests named QA-01…QA-11, so fixing a gap makes its test fail
until the marker is removed.

## Passed (reproduced independently)

- The generated TS and OpenAPI match `schema.json`, and generation is deterministic.
  Every `$defs` entry is exported to both. No `#/$defs/` refs remain. The OpenAPI 3.1
  document validates, and every core/http example validates against the published
  OpenAPI component schemas.
- The HTTP.md table matches the 8 generated operations exactly: method, path,
  operationId, request and response schemas, 201 only for new-resource writes,
  `Idempotency-Key` only on keyed writes, and scopes. The path and query integers are
  JS-safe.
- A Selection cannot be rebound to another user, source, version, frame, session,
  device, a null position or a different position. The geometry of a nested bridge
  selection is checked.
- NaN, ±Infinity and 1e400 floats are rejected in nested number fields. Integers
  above 2^53−1 are rejected, including in nullable branches. A bool is not an integer.
- Handwritten notes require ink and user authorship. Revisions must follow
  base_revision + 1. Note evidence covers every context-segment event.
  `NoteWriteResult` rejects local-only, queued and mock persistence.
- HTTP URL registration accepts and preserves query, fragment, IPv6 and port values.
  It rejects empty or real userinfo, non-HTTP schemes, `http:host`, broken IPv6,
  a bad port, spaces, DEL, empty strings and values over 8192 characters.
  Idempotency keys reject empty keys, 129+ characters, a leading `-`, spaces, CRLF
  injection, non-ASCII and a trailing newline.
- A registered record cannot claim a snapshot. A fetched record requires one. A
  `needs_auth` record may retain an older version. The request cannot claim a user
  or the synthetic type.
- `remaining_fen` counts reservations and floors at zero on true overage. Unknown
  quota stays null, and exhausted quota means 0. Currency, timezone and
  `paid_executor_enabled=false` are fixed. A settled reservation needs an actual
  amount; a released one has none. Cancellation states require a recorded request.
- Compile-time TS checks reject: `audio:true`, a voice mode, the `execute_code`
  action, a credential field, a null `frame_id`, the NAV input mode, queued
  persistence, an unknown block layer, mutation of readonly fields, paid execution,
  UTC or USD usage, a "stopped" cancel state, a claimed `user_id`, a missing
  `project_id`, synthetic registration and unknown error codes.

## Failed: confirmed contract gaps

Severity is contract-level. "Local" means `validate()` could check the rule inside
one payload. Owner: lead.

| ID | Severity | Finding (requirement) | Reproduction → actual |
| --- | --- | --- | --- |
| QA-01 | medium | `media_position` has no maximum. An integer literal beyond float64 passes the documented finite-number guard, but JS reads it as `Infinity` and re-serializes it as `null` (unknown). A known video position silently becomes unknown. (R10, A02, README "finite JSON") | `Frame.media_position = json.loads("1"+"0"*400)` → accepted. Node `JSON.parse` gives `Infinity`, and `Number.isFinite` is false. 2^53+1 is also accepted and compares equal to 2^53 in JS. |
| QA-02 | medium | A timezone longer than 255 characters makes `validate()` raise `OSError` instead of `ValidationError`, so a service would return a 500 instead of a 422. This affects Observation, Frame and BudgetReservation timezones. | `EventBatch.events[0].source_timezone="Z"*256` → `OSError [Errno 36] File name too long`. At 255 characters it is correctly a ValidationError. |
| QA-03 | medium | The `SourceSnapshot` URLs use `format: uri`, not `HttpUrl`. The GET snapshot route can therefore return `javascript:` or credential-bearing URLs that registration rejects. (HTTP.md URL rules, R44) | Setting `original_url="javascript:alert(1)"` or `canonical_url="https://user:pw@…"` → accepted. |
| QA-04 | medium | A new registration (`already_exists=false`) may claim `ready` with a version, although HTTP.md says new records start registered with no snapshot. Registration and fetch can be confused. (R44, A23) | `SourceRegistrationResult.source` with `access_status=ready, current_version=1` → accepted. |
| QA-05 | medium | Synthetic data can claim learning consent or a user-authorized origin. The README says synthetic data is test-only and must never become user history. | `provenance.consent_scope=learning` → accepted. `type=synthetic` with `origin=user_authorized` → accepted. |
| QA-06 | medium (local) | One EventBatch may reuse an `event_id` with different content, or reuse `(user, device, sequence)` for two events. The README forbids both. The backend must still enforce these rules across batches. (R27, R29, A10) | Two such events in `events[]` → accepted. |
| QA-07 | medium (local) | EventBatchAck can report one event as both accepted and duplicate. The ACK exactness that clients use to resend only missing events is unchecked. | The same event_id acked `accepted` and `duplicate` → accepted. An empty ACK list is also accepted. |
| QA-08 | medium (local) | `frame_id` and `gap_flags` can contradict each other: a frame id together with `missing_frame`, or `stale_frame` with no frame. (A12: an absent capture is reported as missing, never replaced by an invented frame id) | Both variants → accepted. |
| QA-09 | medium (design) | `ContextSegment.frame_id` is required and non-null (minItems 1). A note written while capture is missing can only be stored with an invented frame id or not at all. (R46, A12, A27) | `context_segments[0].frame_id=null` → rejected with "None is not of type 'string'". |
| QA-10 | medium (local) | `CapabilityResult` can claim `device_pass` while its own checks say `device=fail`, with empty evidence and environment. The same applies to automated/compiled claims. This is the record type for gate evidence. | The example in the test → accepted. There is no example or test for this type in the repository. |
| QA-11 | low | In `budget_month`, Python's `\d` accepts non-ASCII digits, but ECMA-262 (JSON Schema/JS) does not. Python and JS validators disagree. | `"２０２６-09"` → accepted by Python. |

Low-severity gaps (reproduced by the review; no xfail tests):

- An ExplanationCard can be `ready` with `provenance=none`, or `generating`/`failed`
  with `cache_hit=true`. This is weaker than the README rule that a cache miss must
  not masquerade.
- A nested `SourceRef.user_id` may differ from the enclosing card or job user.
- One note may bind the same frame to different source versions or positions.
  Duplicate NoteBlock ids are accepted, including across the user_original and
  ai_supplement layers.
- A BridgeResponse can be `accepted` with an error code.
- A SourceSnapshot can be `registered` with content, and a SourceReadResult can be
  `registered` with snapshot versions.
- `budget_month` is not tied to `as_of` in America/Los_Angeles
  (`as_of=2026-10-01T03:00Z` with month `2026-10` is accepted). A reservation may use
  any timezone. A reservation may use price version `unknown` with 0 fen.
- A BackgroundJob can be `cancelled` with `cancel_requested=false` or with committed
  outputs, unlike JobCancelResult.
- `authorized_origin` accepts non-origins (`javascript:`, paths, credentials).
  `localtime` and other host-dependent timezone names are accepted.
- HttpUrl accepts non-ASCII whitespace, bidi characters and lone surrogates.
- A client may send `received_at`. `correction_of` may point to the event itself.
  `updated_at` may be earlier than `created_at`. A selection may be created before
  its frame.
- Bridge `polygon`, `selected_text` and `concept_candidates` have no size bound.
  Integral floats (`1.0`, `250.0`) are accepted and re-serialize differently, which
  affects replay fingerprints. Sub-second precision is unbounded (Python truncates to
  6 digits, JS to 3).
- The `--check` flags compare decoded text, so CRLF line-ending changes pass.

## Documentation honesty

- The documents are honest in general. The README, HTTP.md and the lead report
  consistently say the OpenAPI is a specification, not an implemented server, and
  that authentication, persistence, concurrency, providers and devices are
  unverified. The hosted CI claim matches the actual run.
- `p0-http-ci.md` presents a text block as `check.sh` output. Two lines are
  paraphrases (the `--check` commands print nothing), and `git diff --check` is not
  part of `check.sh` or CI. The substantive claims are true.
- `CONTRACT_VERSION` is still 0.1.0, although `AuthorizationContext.scopes` gained
  three values. A worker on the `627e01c` 0.1.0 validator rejects `usage:read`. That
  compatibility note is missing.
- The design is underspecified in these places:
  - The `ApiError.code`→HTTP status mapping: `internal_error` has no 500, and
    `budget_exceeded`, `needs_auth` and `unsupported` have no mapped status.
  - Several unrelated conflicts all return 409 `conflict`: a CAS revision conflict,
    idempotency-key reuse and a conflicting batch.
  - The duplicate-registration identity key (URL vs canonical vs project) and how
    omitted defaults count toward idempotency fingerprints.
  - The ink-byte upload path behind `ink_blob_id`.
  - HTTP.md refers to a "tombstone/cleanup policy" that is not in the repository.
- No P0 route ingests Frames, yet EventBatch and NoteRevision carry `frame_id`
  references that the backend must verify. No owner-scoped source or project list
  exists, so A23 recovery without client-local ids depends on re-sending the URL.
  The documents should state this P0 limitation.

## Not tested / blocked (service or device obligations)

Not testable at contract level. These remain untested, not failed:

- **High risk:** note compare-and-swap across revisions. The backend must preserve
  ink and `user_original` blocks and reject a revision that drops ink or rewrites
  user blocks. `validate()` checks one revision only; a `validate_note_update(prev,
  next)` helper, like `validate_selection_frame`, is recommended.
- Idempotent replay and key scope.
- Atomic batch commit and dedup across batches.
- Atomic budget reservation under concurrency, retry exposure and reconciliation.
- Transactional cancel/version/tombstone recheck.
- Deletion and revocation of replay caches.
- SSRF and redirect policy (HttpUrl accepts loopback and metadata addresses by design).
- Signed or credential-bearing query URLs being stored and returned.
- Native bridge origin and frame binding.
- Actor attribution evidence.
- Showing a fixture card only for its exact fixture.
- Authentication and scopes, PostgreSQL, providers, iPad/Safari/Pencil devices.
- Python 3.12 locally (hosted CI only).

## Decision

**Conditionally accepted as a shape-level contract baseline; not a gate pass.**
Generation, OpenAPI validity, the HTTP table, JS-safe integers, selection binding,
note, budget and cancel invariants all reproduce. No high-severity contract defect
was found. QA-01…QA-10 should be fixed or explicitly documented by lead before
backend and clients depend on those fields; QA-02 is a crash path.

The review used independent Opus sub-reviewers per dimension with an adversarial
re-verification pass and a completeness critic. Each gap above was re-run in this
worktree. Model agreement is a perspective, not a correctness certificate.

## Re-test: candidate `7367c2c84743d1c2dce2a6aea243f9a666ee4ab2`

The lead fixed QA-01/QA-02 and removed those two xfail markers. `team/qa` was merged
normally (fast-forward, no reset) to the candidate. Same environment as above, plus
`uv sync --frozen --extra backend --group backend-test` (the candidate CI command).

```sh
bash scripts/check.sh      # exit 0: 414 passed, 14 xfailed (includes the uncommitted
                           # P0-13 file: 7 passed, 1 xfailed), tsc ok, Safari probe
                           # 44/44 pass, build pass
.venv/bin/python -m pytest -q tests/e2e   # after the tests below: 131 passed, 16 xfailed
```

The same probe script ran against the `f02618f` and `7367c2c` validators. Only these
results changed:

| Input | f02618f | 7367c2c |
| --- | --- | --- |
| `media_position` 2^53 or a 400-digit integer literal | accepted | rejected (QA-01 fixed) |
| timezone of 256 / 5000 characters | `OSError` | `ValidationError` (QA-02 fixed) |
| Frame with an unknown key nested 3000 / 20000 levels | `ValidationError` | **`RecursionError`** |
| `ZoneInfo` raising `PermissionError` (simulated tzdata fault) | `PermissionError` | rejected as an invalid zone |

No valid input is newly rejected. These still pass unchanged: every core/http
example; 2^53−1; floats such as 1e300, −0.0 and 9007199254740991.0; big digit strings
inside text; `UTC`, `America/Los_Angeles`, `Etc/GMT+5` and
`America/Argentina/Buenos_Aires`. `../UTC`, `America`, NUL and `/etc/passwd` are
still rejected, and `localtime` is still accepted (a low item from the list above).

New findings:

- **QA-12, medium (regression from the QA-01 fix).** `_check_safe_integers` recurses
  in Python. A roughly 7 KB JSON body nested about 1000 levels deep parses with
  `json.loads`, then `validate()` raises `RecursionError`. The exact threshold depends
  on the caller's stack depth; the backend path crashes from depth 996. The
  in-process backend reaches this through an authenticated `POST /v1/sources`: depth
  500 returns 422, while depth 996 and 3000 propagate `RecursionError` (a 500 in a
  server) instead of 422. The same body path serves events and notes. Recommended
  fix (owner lead; backend for the HTTP handler): make the guard iterative or
  depth-bounded, and map any residual failure to 422. Tracked by two strict xfail
  tests.
- **QA-13, low.** Catching every `OSError` in the timezone format checker also turns
  environment faults (such as permission or I/O errors in tzdata) into "invalid
  timezone" 422 responses for valid zones, which hides an outage. Catch only the
  name-too-long case, or bound the name length before the lookup.

Status: QA-01 and QA-02 pass at `7367c2c`. QA-03…QA-11 remain open (13 strict xfail
tests). QA-12 is open (2 strict xfail tests). This re-test covers contracts and the
in-process backend only. PostgreSQL, providers and devices remain untested.
