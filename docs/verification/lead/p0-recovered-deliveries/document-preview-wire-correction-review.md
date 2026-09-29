# Document preview DP1 correction review

Decision: **INTEGRATE** `f0ecfe132c7529fc8a27497891bcadab13885fd3` plus
`96d8137946a7195576740936dc5deb7f93cacad1`. DP1 is closed for this bounded wire
slice; no materially missing local record binding found. This is not runtime API,
PostgreSQL, provider or end-to-end preview acceptance.

Reviewed against clean main `c18d30b5e47ee10e51d7f7f89250764c5d7310d2`.
Read recovered DP1 report/probe and the complete correction. Applied PONYTAIL LITE
and current workflow refresh policy: only tasks changed among AGENTS/TEAM/workflow/
source requirements since prior reviewed `01a8adf`; refreshed the current P0-07
card. No additional design or requirement scope introduced.

## Why the correction is sufficient

The new `_saved_context` binds source owner/version/timezone and document provenance
to the frame; observation owner/source/version/frame/device/session/timezone/media
to that frame; observation time to explicit ASK selection time; observation text
to exact request_text; and request/note project ownership to the source. The note
must reference precisely this observation and frozen context, be revision 1/base 0,
authored by the user, and contain exactly the original user_note text in one
user_original text block, without ink or AI supplement. Source bytes/hash and
DOM/frame/selection/request checks remain intact. Earlier frame capture followed by
later explicit ASK remains supported. Distinct BridgeRequest/ExplanationRequest
IDs remain intact.

Path note identity, stored-request equality, genuine authorization/current actor
state, title preservation against the submitted request and durable commit remain
service duties: those independent facts are not present twice in this composite.
No missing local equality among the DP1 records remains. The correction changes
only preview validation, examples and preview tests; no schemas/generated wire
fields, old v1, capture or control files change.

## Isolated candidate and exact checks

Candidate: `/tmp/p0-preview-correction-r89w7pr8`.
Created using Python stdlib `tempfile`/`tarfile` and the output of:

```sh
git archive c18d30b5e47ee10e51d7f7f89250764c5d7310d2 packages/contracts pyproject.toml docs/verification/lead/p0-recovered-deliveries
```

Overlaid only each commit's delegated files, in original-then-correction order,
using `git diff-tree --no-commit-id --name-only -r COMMIT --
packages/contracts/document_preview packages/contracts/tests/test_document_preview.py`
and `git show COMMIT:PATH`. No cherry-pick, worktree or main/worker edit.

Commands below ran from the isolated candidate:

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider packages/contracts/tests/test_document_preview.py
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m packages.contracts.document_preview.generate --check
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python docs/verification/lead/p0-recovered-deliveries/document-preview-wire-probe.py /tmp/p0-preview-correction-r89w7pr8
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /tmp/p0-document-preview-wire-correction-probe.py /tmp/p0-preview-correction-r89w7pr8
```

Results:

- Preview suite: **70 passed in 0.50s**. Includes all original wire tests, the new
  coherent SavedPreview, 28 cross-record mutations, unrelated event evidence, and
  earlier-capture/later-ASK positive.
- Generated artifact check: exit 0, no stale artifacts.
- Unmodified recovered probe: exits 1 at its old positive. That fixture copied a
  synthetic SourceSnapshot (`type/origin:synthetic`, `consent_scope:test_only`)
  and a nonempty note concept list. It is now correctly excluded by the finite
  real-document/user-note envelope; this is not a source-byte regression.
- Preserved adaptation in `/tmp/p0-document-preview-wire-correction-probe.py`
  changes only that source type/provenance and clears note concept_ids, leaving
  original source/DOM bytes, identities, requests and note text intact. It checks
  a non-mutating positive and applies the identical three original DP1 mutations.

```text
unchanged_original_synthetic_fixture: REJECTED
coherent_positive_original_bytes_requests_note: ACCEPTED_UNCHANGED
source_owner_mismatch: REJECTED
observation_source_frame_mismatch: REJECTED
assistant_note_with_provider_unavailable: REJECTED
```

Main remained clean. No network, provider, native Chats, DB, installs, main/worker
writes or commits. Root can integrate and release the corrected finite wire to
Web; Backend runtime guards and actual persistence/readback evidence remain its
existing active task.
