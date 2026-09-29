# Original-artifact 0.2.2 bounded review

Decision: **APPROVE** the reviewed uncommitted `original_artifact` module and its
test file over `1cbc38fd75b205a795bf5f966b00fc71b3355527`. No consequential
binding, mutability, malformed-input or compatibility blocker found.

Reviewed README, executable __init__.py, generator, emitted schema/types and
test_original_artifact.py. Applied current workflow/PONYTAIL LITE; no source edits.
Exact reviewed file hashes are preserved in
`/tmp/original-artifact-review-fopwhc8w/reviewed-files.json`; unchanged at final check.

- SourceRef/ArtifactReference/Identifier are independent deep copies of existing
  capture definitions. No tracked legacy contract files change; imports leave
  capture's schema untouched. The new namespace and generated types are additive.
- Original shapes are closed. Kind/media agreement, positive 32 MiB bounded length,
  strict trusted-user equality, immutable bytes type, exact length and SHA-256 are
  enforced at the appropriate helper boundary. Canonical base64 is checked after
  strict decoding, with an encoded-size limit before allocation.
- validate_receipt checks version, complete source, complete artifact and kind,
  including byte length; the receipt status is restricted to bytes_committed.
  No provider/live-vision acknowledgement is introduced.
- Helpers neither mutate the supplied binding nor expose a mutable byte buffer.
  Shape-only validate is distinct from decode_upload/validate_bytes. Generated
  structural types do not claim to replace byte/service checks.
- README correctly leaves exact source access, producer/stream authority,
  transactional immutability/replay, corruption, deletion/revocation and durable
  commitment to Backend. It preserves unsupported originals and explicitly does
  not establish an image decoder or editable-ink codec. The existing artifact
  reference gate stays disabled; there is no HTTP/storage/AI activation.

## Focused local evidence

Isolated candidate was created with stdlib tarfile from
`git archive 1cbc38fd75b205a795bf5f966b00fc71b3355527 packages/contracts`, then copied
only the new module and its test into `/tmp/original-artifact-review-fopwhc8w`.

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /tmp/original-artifact-probe.py /tmp/original-artifact-review-fopwhc8w
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m packages.contracts.original_artifact.generate --check
```

Results: exact immutable bytes/nonmutation/schema independence PASS; seven
additional malformed identity/digest/version/receipt-length/buffer/base64 cases
rejected as ValidationError; generated check exit 0. Did not repeat root's 19
focused checks or any older suite. One initial probe invocation used a mistaken
temporary path and failed import; the commands above use the actual candidate.

## Requested specification spot-check

The complete changed §7.1 Chinese/English paragraphs retain two separate gates:
continuous fresh whole-visible-display observation actually reaching real AI, and
original-screen cross-app selection/pen reaching that same context. They retain
NAV → explicit WRITE → draft → partial erase → undo/redo → ASK → finish/cancel
returning to previous WRITE → continued writing → save/reopen/edit originals.
Both placement modes, real Pencil/finger checks, gaps/stops, disclosure and actual
Notability import remain distinct obligations. Single frames, mock providers,
DOM/owned canvases and libraries do not pass either core gate.

The current task section preserves the same flow, explicit unimplemented tools,
provider/signing/source-ingress dependencies and unsupported cross-app overlay
boundary. It does not silently accept a browser fallback. All eight source/English
manifest hashes match after the paired edits.

No provider, device, DB, user-preview, browser or external access occurred. Dirty
lead work was preserved. Approval is for this pure byte-integrity boundary and
the requested wording check, not persistence, codecs or either product gate.
