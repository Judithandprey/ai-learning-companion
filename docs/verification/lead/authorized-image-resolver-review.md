# AuthorizedImageResolver bounded review

**Disposition: APPROVE `f9f34d9885ef655d909639d9873807c85eb68f6c` for internal
integration. No consequential blocker found.** This is authorized point-in-time
byte resolution, not production capture, ongoing permission or provider receipt.

Reviewed the complete three-file delta from parent
`e471063b681fc50783e04b4077e3a5432d450479`, its evidence, and the actual prior
`materialize_image_evidence`, `Archive` authorization/source/storage methods and
original-artifact validation/reference helpers. Applied precisely that delta to a
`git archive` of assigned main `b3c6a2160362a54cb44c9e6a338ec983110419c3` in
`/tmp/authorized-image-resolver-review-399hhfog`. `git apply --check` passed.
No production edits or whole-branch merge. Later lead-owned helper work was preserved.
Requirements/workflow content is unchanged since the assigned `b8ec18e` boundary;
the task-board changes preserve scope. PONYTAIL LITE applied.

## Conclusions

- Complete validated requested/stored Frames must match, including owner, source
  version, artifact, dimensions, times, device/session and representation. The
  resolver copies request data before the transaction, returns a detached Frame
  and immutable bytes, and does not consult detached archive bytes.
- Mandatory current caller guard, account state, source revocation/deletion, exact
  ready snapshot/hash, device/session ownership and both artifact tombstones are
  checked under one existing actor transaction. Typed originals reuse authoritative
  binding/alias checks; legacy frames require their current stored binding and
  actual original bytes. Historical source versions remain readable when authorized.
- Encoded length/padding checks precede either typed validation's decode or the
  direct decode. Both the caller limit and shared 32 MiB ceiling apply. Canonical
  base64, byte length and SHA are checked; output is bounded. The existing store
  still loads a complete JSON row, explicitly disclosed rather than represented
  as a bounded database read. PNG signature availability is not pixel validation:
  Learning still enforces its supported PNG subset, dimensions and pixel limits.
- DOM/non-PNG/unsupported image kinds remain explicit non-image gaps. Source,
  caller and storage failures return no bytes or exception details; failed
  transaction completion cannot publish available bytes. Current/history capture
  restrictions, `not_attested` live/provider status and `not_granted` presentation
  permission remain in the existing materializer. No HTTP/control gate is changed.

## Independent checks

From the isolated candidate:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider \
  services/api/tests/test_image_resolver.py \
  -k 'materialization_rechecks_current_store or byte_limit_is_enforced_before or point_reads_and_current_guard or real_png_composes or available_image_returns or unexpected_failure'
```

**16 passed, 62 deselected in 0.21s.** Includes actual synthetic PNG composition,
post-context revoke/generation/disable/delete/blob-loss/corruption without fallback,
typed/legacy immutable result behavior, one-transaction point reads, pre-decode
bounds, and open/read/commit/guard failures.

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/tmp/authorized-image-resolver-review-399hhfog \
  /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python \
  /tmp/authorized-image-resolver-independent-probes.py
```

**5 additional assertions passed:** typed and legacy oversized encoded rows with a
caller limit above 32 MiB are rejected before any decoder runs; foreign device
and session ownership each produce unavailable with unchanged storage; mutation
of the caller's Frame inside the guard cannot change the validated request copy.

Owner-reported 78 new + 66 Learning tests are separate evidence, not repeated here.
No DB, service, provider, preview/Paperclip, network or device operations. Actual
producer/source/frame ingress, real AI input and both core screen/pen gates remain
unaccepted and outside this resolver.

## Proposed next pure helper (scope advice only)

No blocker in composing existing `validate_record_frame` with a closed validated
0.2.2 binding, exact source/artifact equality, `screen_image` and `screen_capture`.
That can validate metadata compatibility without claiming origin or authority.
Backend's later atomic frame/batch ingress must keep its current control checks,
frame/blob/source binding and writes inside one actor transaction; calling two
separately committing existing methods would not meet that condition. Unknown
foreground-source identity must remain an explicit missing additive baseline.

## Lead-owned pure helper follow-up

**Disposition: APPROVE the reviewed uncommitted `validate_capture_frame` addition,
its tests and README obligations.** This is separate from the resolver verdict.
Reviewed full three-file diff/source after the lead declared it complete; no
production files were edited. The isolated candidate received copies of only
those three files for the checks below.

`validate_capture_frame` first validates the closed 0.2.2 binding, then delegates
all existing record/frame checks to `validate_record_frame`. The additional kind,
representation and exact source/artifact comparisons reject substituting another
valid typed original, including changed media type/length. It returns no receipt,
mutates no input and does not infer actual pixels, capture freshness, authority
or successful persistence. No schemas, existing validators or generated wire
shapes change. Existing screen-image JPEG metadata remains legal; this does not
make JPEG supported by the separate PNG materializer.

The README correctly requires one currently authorized actor transaction,
immutable frame identity, every referenced original/source check, unchanged
default gating and stop/withdrawal/deletion/replay fences. It preserves unknown
foreground-source identity as a missing additive baseline and disclaims fabricated
URLs/fixture ingestion. No additional service or capability claim was found.

Independent isolated checks: coherent JPEG metadata accepted; matching boolean
source versions, an extra Frame field, and record/frame media-position mismatch
all rejected. `python -m packages.contracts.original_artifact.generate --check`
exited 0. The lead's 35-test result is separately reported and was not repeated.
Reviewed file SHA-256 values:

- `original_artifact/__init__.py`: `3ef610f99f91b32b6bb0f7c3b1556a2ab273b156531076e23cc31b61264a868b`
- `original_artifact/README.md`: `f95e0e2bb392dcd00867d44acdef7fdda7938f17be44457c9903fa2528b2fc70`
- `tests/test_capture_frame_binding.py`: `2c5e5ffdcdc696ae98698c84ec6b9ac86daa9cf7a783b0fa33501e14c8b8254d`
