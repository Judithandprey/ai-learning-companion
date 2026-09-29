# Local document preview wire review

Decision: **one narrow validator blocker before declaring this wire slice fully
validated**. Keep the finite fields/routes/version; correct SavedPreview's local
cross-record checks. Web can prepare against the declared shapes, but the released
validator must not accept cross-bound or AI-authored saved output.

Exact delivery: `f0ecfe132c7529fc8a27497891bcadab13885fd3`.
Read-only base: `01a8adf73d9e62465082c0319c5801ecfc8fb203`.
Reviewed only packages/contracts/document_preview/** and its delegated tests,
existing legacy shapes/selection-frame helper, and the Web capture/request path.
Applied the existing workflow/PONYTAIL LITE refresh rule: relevant source-preservation
requirements/current decisions remain unchanged; current P0-07 card supplies the
explicit finite real-document fallback and delegated scope. No runtime API, DB,
provider, device, source-capture or full requirement acceptance is claimed.

## DP1 — SavedPreview does not validate its composite identity or user-only output

Location: `packages/contracts/document_preview/validation.py`, final
`if name == "SavedPreview"` branch (delivery lines 128–132), plus the nested
legacy validation loop. Individual objects and source bytes are checked, but
source/frame/observation/note are not bound together. The response schema reuses
unrestricted legacy Observation/NoteRevision, so an assistant-authored note and
AI supplement remain accepted alongside `ai_status:provider_unavailable`.

Built a valid coherent SavedPreview from the supplied import/save examples and
legacy core records. Its source bytes/hash, DOM bytes/frame/selection, observation
and user-original note all matched and validation passed. Three independent
mutations still passed:

1. `source.user_id = "other-owner"`, with the frame/request owner unchanged.
2. `observation.source_id = "other-source"` and `frame_id = "other-frame"`,
   with the response's actual source/frame unchanged.
3. `note.authorship = "assistant"`, with an `ai_supplement` block, while keeping
   `ai_status = "provider_unavailable"`.

These are local contradictions visible entirely within the published composite
payload, distinct from service-only facts such as token expiry, actual owned
resources, durable commit, or comparison with previously stored request bytes.
A successful composite validator currently certifies output that violates this
contract's same-source/actual-user/no-AI semantics.

Minimum fix without wire shape/version changes:

- Bind source user/source/version to frame; bind observation's
  owner/source/version/device/session/frame/media to the same frozen context.
- Require the observation to represent the user and preserve request_text according
  to the finite save mapping; bind the note's owner/project/context/event references
  to these exact response records rather than accepting unrelated legacy objects.
- Enforce the documented user note envelope: authorship user, user_original layers,
  no AI supplement/handwriting claim, and preservation of the supplied user_note.
  State its deterministic legacy NoteRevision mapping if the existing description
  does not yet fully specify it. No new generalized note model is needed.
- Add one coherent SavedPreview example and focused mutation cases. Keep path note
  identity, archived request equality, current authority and database commit checks
  explicitly with Backend runtime; a wire helper cannot establish those facts.

## Other bounded review conclusions

- DocumentImport requires source/version/device/session, canonical base64 and digest.
  Decode is strict UTF-8; BOM/non-ASCII/newlines remain exact. NUL, surrogate JSON,
  nonfinite numbers, invalid versions, extra provenance labels, excessive size,
  noncanonical base64 and hash mismatch have direct rejection paths.
- DocumentSave preserves both unchanged request objects. Bridge selection binds
  source/version/owner/device/session/frame/media to the Frame; ExplanationRequest
  binds owner and selection ID. Their request IDs are correctly independent, as
  Web currently creates separate req/brq IDs; do not force those IDs equal.
- DOM hash/UTF-8, duplicate-key rejection, finite closed DomSnapshot, exact capture
  time/selected text, viewport frame dimensions and normalized selection geometry
  are checked. DOM is explicitly not pixels and cannot replace full source bytes.
- All top-level/nested new objects are closed; four route paths and the separate
  document-preview.0.1.0 namespace are finite. Bearer auth and separate preview
  read/write scopes are specified; absent runtime auth/store must fail closed.
  Actual actor/membership/source access remains a service requirement, not client
  provenance or a page-supplied permission claim.
- Save receipt and SavedPreview require provider_unavailable. This constant alone
  cannot enforce no-AI content; DP1 is the necessary local complement.
- Delivery touches only the ten delegated new preview/test files. No old v1,
  capture 0.2.0 or control 0.2.1 source/generated files are changed.

## Actual probes and evidence limits

Temporary package overlay: `/tmp/p0-document-preview-review-1guc0lpf`, built from
`git archive 01a8adf packages/contracts` plus exactly the ten `git show f0ecfe1:path`
files. Used the existing lead Python environment with PYTHONDONTWRITEBYTECODE=1.
No main/worker writes, provider/network/DB action, installs or commits.

Executed only the coherent SavedPreview positive and three distinguishing mutation
probes above, not the owner's 40-test suite. The positive payload is preserved at
`/tmp/p0-document-preview-saved-positive.json`. Each mutation was applied to its
own deepcopy, followed by `validate("SavedPreview", payload)`; all three printed
ACCEPTED. Root retains the exact full-suite/generated-check responsibility after
this review/correction. Owner-reported 40 passes/generated checks are not rerun
results from this reviewer.

Exact reproducible probe: `/tmp/p0-document-preview-wire-probe.py`.
Command (from the repository root):

```sh
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python /tmp/p0-document-preview-wire-probe.py
```

Observed output:

```text
coherent_saved_preview: ACCEPTED
source_owner_mismatch: ACCEPTED
observation_source_frame_mismatch: ACCEPTED
assistant_note_with_provider_unavailable: ACCEPTED
```

Release advice: land the small composite-validator correction in this same
unreleased slice, then publish it promptly. No broader design or runtime API/DB
acceptance gate is requested for publishing this finite wire contract.
