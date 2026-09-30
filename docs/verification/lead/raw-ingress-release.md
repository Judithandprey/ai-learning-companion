# Additive raw-frame HTTP baseline 0.2.6

Lead P0-08 continues the actual 0.2.5 native-mapping dependency. The new pure
package `packages/contracts/raw_capture_ingress` defines only a separate
`POST /v2/process/raw-frames:batch` envelope; it does not mount a route or enable
capture/provider access. Existing 0.1.0–0.2.5 files remain byte-for-byte unchanged.
Backend's in-progress internal raw adoption stays with its current owner; no
parallel implementation of its service or migration was assigned.

## Implemented boundary

The closed outer 0.2.6 envelope retains ProcessBatch 0.2.0 and RawCaptureFrame
0.2.5, checks the whole batch plus exact source/incarnation/artifact/time membership,
and enforces strict UTF-8 JSON and raw/canonical 4 MiB ceilings. Frame IDs uniquely
exhaust named record frames. All raw orientations/unknowns remain; a frame does
not become upright, a callback estimate does not become capture UTC, and a pure
metadata match does not invent retained source/producer facts.

Success uses existing ProcessBatchAck 0.2.0 with verified-only artifact receipts.
The whole ordered HTTP envelope must share the actor transaction with immutable
raw descriptors, process records and replay receipts; internal frame-map equality
alone cannot implement HTTP replay. Fresh authorization, Stop/revoke/delete,
retained typed bytes, ancestors, identity conflicts and lost-original witnesses
remain mandatory Backend checks before cached success.

The separate trusted capability `process.raw-ingress.v0.2.6` plus
`process.capture.v0.2`/`process:capture` authorize this route only. Existing source
registration/original PUT/GET capabilities remain independently required. No page
assertion, token possession, new request field or version creates producer/attempt
permission. Closed errors retain the old status/code sets under an explicit new
version. Header/transport syntax precedes strict JSON/version/body validation;
no current handler is claimed to implement the new route.

## Actual verification

- Main focused new wrapper + raw descriptor + old ingress checks: **332 passed in
  0.95s**. This includes the delegate's 131 new cases and relevant released-family
  controls; it is pure/synthetic verification, not actual HTTP/DB/device behavior.
- Generated consistency, root TypeScript and shell syntax passed. OpenAPI 3.1
  validation passed using the existing project venv. The first incidental call
  used system Python, which lacked the validator; retrying with `.venv/bin/python`
  succeeded, with no dependency installation or environment change.
- `git diff --exit-code 3ee3201 -- packages/contracts` confirmed no tracked older
  family change; the new candidate paths were separately inspected. Generated
  compatibility hashes cover all released 0.1.0–0.2.5 families.
- Lead reviewed the complete implementation/generator/README/tests and corrected
  the draft precedence wording to match the existing adapter's actual header-first
  call flow. Only release wording was then changed and OpenAPI regenerated.
- [Independent review](raw-ingress-contract-review.md) approves the final seven-file
  snapshot: 131 owner cases plus **52 independent probes** passed, with final
  generation/reference checks. Lead verified all seven final file hashes match
  that review. This approves pure contract publication, not runtime activation.

The same integration includes approved Learning raw composition `0534f5c` →
`5b9c413`, with 256 affected main checks and a separate 27-probe independent review.
That consumer remains a supplied-data seam until Backend raw readers/bytes are
integrated. The original Web QA candidate is unchanged; its current browser task
is not restarted. Native mapping, physical device, actual real-AI reception,
orientation-aware rendering, cross-app ink and Notability import remain separate.

## Next owner

Lead reviews the actual Backend internal delivery and composes stored raw metadata,
current-authorized bytes and Learning evidence. The new formal baseline allows
ONE subsequent Backend-owned opt-in HTTP adapter continuation at a safe checkpoint,
using the same actor transaction rather than an out-of-transaction idempotency
wrapper. Native mapping continues under its existing task and the existing hosted
workflow after exact-source review. No runtime activation or paid provider action
is authorized by this contract release.
