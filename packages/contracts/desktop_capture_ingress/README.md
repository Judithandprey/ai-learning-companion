# Desktop capture ingress 0.2.8

An additive **pure contract**. The separate Backend handler is explicitly opt-in;
this package does not activate a route. It carries the
reviewed [desktop frame0.2.7](../desktop_frame/README.md) through a separate
`POST /v2/process/desktop-frames:batch`. Old0.1.0–0.2.7 families and the raw0.2.6
route remain unchanged; no old reader accepts this new envelope.

## Shape and permissions

`DesktopFrameBatchRequest` has exactly `contract_version:'0.2.8'`, unchanged
`batch:ProcessBatch`0.2.0 and `frames:DesktopFrame[]`0.2.7 (0–100). Records remain
1–100. Every named frame ID appears exactly once in frames, with no extra frame.
Multiple records may reference the same retained frame without implying freshness.
Pure validation checks full batch causality/coverage/artifact invariants, the
complete desktop profile including estimate relationships, exact source identity,
incarnation, full PNG reference and null capture/course/Process-clock fields.
It never manufactures retained display facts or a legacy Frame.

A future adapter requires current trusted Bearer auth, `process:capture`,
`process.capture.v0.2` and distinct `process.desktop-ingress.v0.2.8`. These are
resolved by the trusted runtime, never accepted from a page or request declaration.
They do not imply producer consent, stream control or the independent0.2.4
registration/original-byte upload permissions. Those existing operations are
reused; there is no duplicate upload, identity or archive. Source/owner/device/
session/producer/generation, lifecycle and original-byte checks still occur in
one actor transaction, and before replay. Source access is not help permission.

Backend must bind each frame through `desktop_frame.validate_binding` using the
**retained** DisplaySourceSnapshot0.2.3 and OriginalArtifactBinding0.2.2 and verify
all referenced bytes, including separate ink. Stored raw ancestors may have a
known older profile and require their own source/incarnation/original checks.
Unknown/corrupt retained variants fail; no fallback, reconstructed original or
softened missing-slot/child/receipt witness is allowed. Internal adoption remains
provisional-session only until actual attempt authority is released.

## Missing pixels are a recorded gap

The desktop-only frameless form (`frame_id:null`) requires all of:

- `evidence.kind:'coverage'`, with coverage `partial`, `unobserved` or `unknown`;
- no artifact references, no inferred operation or claimed `observed_samples`;
- null `observed_at`, `media_position` and Process `clock`, retaining the existing
  whole-batch missing-sequence and limitations rules.

This allows a batch containing only an honest gap before any pixels exist.
The future adapter must resolve and bind the same retained shared-display source
and current authority as for framed records, then commit the coverage record,
sequence slot and replay facts atomically. It must not manufacture an image,
reuse a stale frame to represent a missing one, or exempt gaps from Stop,
revocation/deletion or pre-stop historical ceilings. A gap is not a control Stop
command, fresh observation or proof of a complete timeline. Existing non-desktop
routes retain their previous frameless restrictions. Backend adoption is recorded
in the [HTTP integration](../../../docs/verification/lead/desktop-http-integration.md);
the default runtime still does not enable this route.

## ACK, replay, transport and errors

Success is HTTP200 with existing ProcessBatchAck0.2.0 only after one atomic
commit. Every original receipt must be verified from exact retained typed bytes;
coverage-only records have zero artifact receipts. `validate_ack` checks full
correspondence and verified-only status, but caller-supplied verification tuples
and synthetic ACKs are not storage evidence.

Key HTTP replay by authenticated owner + method + full desktop route + exactly
one Idempotency-Key. Canonical equality covers the entire ordered envelope and
all nested versions/frames/records/evidence; object member order alone is ignored.
Changed input at the same key returns409. A different key cannot overwrite
immutable identities. Exact replay rechecks current fences, every retained
record/frame/original and all witnesses in the same transaction; no wrapper cache
or internal sorted frame map substitutes for ordered HTTP equality. Exceptions,
cancellation or commit failure publish no partial ACK.

The strict header/media/encoding/length, size, JSON parsing, error sets and
precedence are the [released raw-ingress rules](../raw_capture_ingress/README.md#strict-transport-and-deterministic-errors),
with these explicit desktop substitutions: outer version0.2.8, individual frame
version0.2.7, error shape `DesktopIngressError`, and the separate route/capability
above. Batch remains0.2.0. Unknown explicit outer/batch/frame versions precede
generic shape errors after auth/transport/strict JSON checks. Both raw and
canonical metadata ceilings remain4MiB. Duplicate JSON members, NaN/Infinity,
invalid UTF-8, unsafe integers and excess nesting are rejected, not normalized.
Over-limit inputs must be retained/reported by producers rather than truncated.
Only unavailable/dependency_missing errors can authorize a bounded later retry.

## Executable boundary

`validate`, `validate_frame_batch`, `validate_ack`, `canonical_request`,
`decode_request` and generated schema/types/OpenAPI are pure and make no network,
store, clock, provider or filesystem access except explicit generation output.
Run `python -m packages.contracts.desktop_capture_ingress.generate [--check]` and
its focused contract tests. All fixtures are synthetic. Root owns release;
Backend endpoint adoption has separate exact-baseline implementation/review evidence;
trusted runtime and native host adoption remain distinct. No desktop app is
activated by this contract. Windows
still needs its own reviewed profile; real native/provider evidence, full original
ink, audio, source recovery and both §7.1 gates remain open.
