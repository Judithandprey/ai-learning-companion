# Windows retained frames as WindowsFrame 0.2.9 / WindowsFrameBatchRequest 0.2.10

Lead assignment `handoff_bd9accf12c0c0009e6abeab248fe3faa`, one bounded P0-07/12 task. The released contracts are read
at the lead's exact `6305389c37a3183864fc7430917ea321bcbc2786` with `git show`, and are not edited:

- `packages/contracts/windows_frame` (0.2.9)
- `packages/contracts/windows_capture_ingress` (0.2.10)
- Process 0.2.0, OriginalArtifactBinding 0.2.2 and DisplaySourceSnapshot 0.2.3
- the macOS `DesktopIngress.swift` mapping pattern

I also read R35/R36/R46/R51/R52/R59, §7.1/7.2/7.4 and A12/A14/A26/A30/A31/A44 in `docs/requirements.en.md` at `6305389`.

The written paths are `apps/windows/**` and `docs/verification/web/**`. There is no new dependency, root, shared or
contract edit. No network, bootstrap, provider, upload or ACK queue is activated.

## What is callable

`apps/windows/src/shared/frame-ingress.ts` is DOM-free and pure:

```ts
frameRequest(manifestText: string, plan: IngressPlan): IngressRequest   // or throws MappingRefusal
```

- **Input.** It takes the retention manifest's text (`lc-desktop-capture-retention/v1`) and a plan. The trusted
  caller supplies every identity in the plan:
  - batch ID, Idempotency-Key, `live`/`historical`;
  - device, session and stream;
  - the registered source (`SourceRef`);
  - the capture session that source was registered for;
  - one entry per record, with its record ID and Process sequence.
- **Frame entries.** A frame entry names a retained sample by `sample_seq`. It carries a frame ID, the
  OriginalArtifactBinding of its raw PNG, and that of its composed PNG (null exactly when none was retained). It can
  also carry the separate editable-ink original.
- **Coverage entries.** A coverage entry names a manifest line: `gap`, `not_retained`, `refused`, `unfinished` or
  `unwritten`.
- **Output.** The exact request bytes (kept for retries under the key), the parsed request, and the retained facts the
  request cannot carry (`unrepresented`).
- **No I/O.** Nothing is read, written or sent. Native labels and file names never become identities: artifact IDs
  come from the bindings, and frame/record/incarnation IDs come from the plan.

## Mapping

| Retained | Wire |
| --- | --- |
| header `capture_session`, `started_at`, `source` | `profile.capture_session`, `started_at`, `source_at_start` (verbatim; the manifest must be the plan's capture session) |
| retained line: sample fields | `profile.sample`, unchanged. `gap_ms` is carried as retained, and is null in older lines that lack it (never inferred). Held and stream counts and the separately rounded presentation facts are carried as they are, with no subtraction or rounding. |
| `raw.change_from_previous_sample` | `profile.sample.change_from_previous_sample` |
| `raw` / `composed` file facts | `WindowsPng` (`native_file` = `frames/<sha256>.png`, `pixels_sha256`, size). The artifact is the binding's, which must have the file's SHA-256 and length. |
| `composed` ink facts | `WindowsComposition` verbatim (ink session and revision, visible strokes, marks, transformation) |
| (not retained) | `captured_at`, `media_position`, `capture_latency_ms`: null. The record's `observed_at`, `clock` and `media_position` are null. |

**Framed record:**
- `surface: external_app`, `method: visual`, scope `provisional_session`, no causal parents;
- evidence: coverage `observed_samples` with `sample_only`, `unsupported_history`, as for macOS;
- artifacts: the raw reference, the composed reference if it is another identity, then the editable ink if bound.

Every record, framed or not, is an `external_app` / `visual` pixel observation. This is the existing surface of the
released desktop-pixel admission, as the lead decided in its review of `80da708`. The first version used
`original_screen_overlay`, which that admission refuses (HTTP 403 in the lead's check).

The WindowsFrame keeps the overlay's facts exactly: raw and composed image roles, ink session, revision, marks and
transformation. This claims no structured edit history and does not waive the original-screen ink requirements.

**Raw and composed originals:**
- A raw and composed file that is the same PNG may be one shared original (one binding, one reference) or two archive
  identities. Both forms are kept.
- The composed PNG is a rendered derivative; it is never the editable ink. When a frame with visible ink carries no
  editable-ink original, `unrepresented` says so.

**Events without an image become frameless coverage records:**
- no artifacts, frame, clock or operation;
- `missing_sequences` empty, since native sample ordinals are not Process sequences;
- the engineering defaults below, as for macOS.

| Line | Coverage | Kept in `unrepresented` (the manifest keeps it) |
| --- | --- | --- |
| `gap` (sampler late) | `unknown`, `[unknown]` | `gap_ms`, sample, wall and monotonic time |
| `not_retained` (observed, not kept) | `partial`, `[sample_only]` | the sample range, count and reason |
| `refused` (a limit or a write failure) | `partial`, `[sample_only]` | the sample, its deferred samples and the reason |
| `unfinished`, with lost samples | `partial`, `[sample_only]` | the lost samples and deferred ones; their pixels are lost |
| `unfinished`, none listed | `unknown`, `[unknown]` | later frames may be missing |
| `unwritten` | `unknown`, `[missing_events]` | the count of lines not written |

**Order.** Records follow the manifest: each line at most once, in its order, with rising Process sequences
(A30/A31: no reordered or duplicated events). Several records naming one frame, which the contract allows, is
therefore refused here.

**A torn last line.** A last line without its line end (an append cut short by a crash; main cuts it back only at its
next append) is not an error. Only such a line is torn; a written line whose kind happens to be `torn` is not
coverage. The lines before it map, and a coverage entry may name it: `unknown`,
`[missing_events]`, "what it recorded is not known". A damaged line anywhere else refuses the whole manifest.

**Coverage lines hold what the producer writes.** A selected coverage line must hold what `main.ts` writes for its
kind; otherwise it is refused, never sorted or recounted:
- `not_retained`: a run with from ≤ to, at most as many samples as it spans, and a reason;
- `gap`: a positive, finite duration, a parseable time, a monotonic time and a reason (the duration may be
  fractional: it is not sent);
- `refused`: frame ≤ sample, deferred samples before it, and a reason;
- `unfinished`: lost samples in rising order, and the deferred samples they stand for in rising order (none without a
  lost sample, all before the last lost one), and a reason;
- `unwritten`: a positive count and a reason.

**Refused visibly, with nothing resized, dropped or repaired:**
- **The manifest:**
  - a damaged line other than a torn last one, a missing or second header, or another capture session;
  - an `ended` or `retained` line used as coverage (the end of a session is not a Process record).
- **Malformed facts:**
  - a retained `composed` that is missing or neither an object nor null (a string, an array, false). It is refused,
    never read as raw-only: that would silently drop the composed original. An explicit null with no composed
    binding is raw-only. The same holds on the plan side: a composed or editable-ink binding that is missing or
    neither an object nor null (undefined, false, 0, '') is refused;
  - a non-integer `gap_ms` on a retained sample, presentation facts that do not fit the held count, or marks that do
    not sum to the strokes;
  - a file name not naming its SHA-256;
  - a wall time that is no real instant (30 February, hour 24, year 0);
  - bounds or scale beyond ±2^53−1;
  - a text holding a lone UTF-16 surrogate.
- **The request:**
  - `live` once the manifest shows an end (A44: not live after sharing stops). An end shows as the `ended` line, or
    an `unfinished` line (written only at a forced end, even when the `ended` line failed). A Stop still waiting or
    a crash shows no end in the manifest, so the caller must choose `historical` from the moment the Stop begins;
  - malformed or duplicate record IDs or sequences, or more than 100 records;
  - one frame ID for two frames, one artifact ID for two originals, or one native file with contradictory facts.
- **Bindings:** a binding that is not of the retained file, of another source, of the wrong kind (`screen_image`
  PNG, `editable_ink` JSON), or missing or extra for the composed image.
- **Size limits:**
  - An original over 32 MiB is refused, image or editable ink alike. It stays on this device, whole; main retains
    PNGs up to 96 MiB.
  - A body over 4 MiB is refused and must be split at record boundaries. A single record can exceed it by itself
    (a sample standing for about 700,000 deferred samples); such a record cannot be sent and stays in the manifest.

## Editable ink originals (lead handoff_5bd0e9e0c80521828d81466d71a0353e)

Each composed frame now keeps the exact editable ink it was drawn from, next to its pictures. The baseline is
`55478f0`, whose `apps/windows` equals `f277362`. This is source and portable-fixture work only: the display is QA's,
so there was no native run.

**What is taken, and when.**
- **At composition.** The overlay takes the ink document in the same synchronous step as the composition, before
  anything is awaited (pixel hashing, encoding, sending): the document object the composition was drawn from.
  - It turns that document into its exact JSON bytes.
  - It notes a gesture still in progress (`uncommitted_gesture` `{kind, points}`). That gesture is drawn on screen,
    but it is in neither the composition nor the document.
  - It notes strokes whose evidence was still being made (`evidence_pending`). In that document such a stroke has no
    evidence entry yet, or evidence whose context pictures are `null`, because they are still being made: pending, not
    failed. A stroke whose picture could not be made is removed from the list, and its `null` means "could not be
    made", as elsewhere.
- **Later edits.** Later writing, partial erase, undo or redo do not change what was taken. Ink documents are replaced,
  never changed in place, and the bytes are already made.
- **In main.**
  - The bytes are read back with the existing `parseDesktopInk`. They must match the composition's ink session,
    revision and visible strokes.
  - They are written atomically, content-addressed, as `captures/<id>/ink/<sha256>.json`. Frames drawn from the same
    document share one file.
  - Their bytes count toward the session's byte cap.
- **The manifest.** A retained line's `composed` gains:
  - `ink_original`, which is `{file, sha256, bytes}`, or `{refused: reason}` with the frame still retained;
  - `uncommitted_gesture` and `evidence_pending`.
- **Refused for the ink only**, reason recorded:
  - no document sent;
  - not bytes, not UTF-8 JSON, or not readable by the parser;
  - not the document composed;
  - over 32 MiB (the released original limit).
- **Refused for the whole frame:**
  - a failed write, retried like a picture write, so nothing is listed without its files;
  - a byte cap reached with the ink bytes counted;
  - an ink document without a composition, which is malformed.
- **Older lines** have no `ink_original`: their ink is unknown. No copy is made for them.
- **Stop.** A queued frame's ink original is written before the Stop is confirmed. A frame lost at the Stop bound
  leaves none.

**In the mapper.**
- An `editable_ink` binding must be the ink original retained with that frame's own composition, with its SHA-256
  and length. Otherwise it is refused, so a later document is never bound in its place.
- A frame whose original was refused takes no binding.
- A retained original left unbound is noted in `unrepresented`.
- For a line from before ink originals were kept, a binding is the caller's and is not checked; `unrepresented` says so.
- The gesture in progress and pending evidence cannot go on the wire, so they are listed in `unrepresented`.
- Wire versions 0.2.2, 0.2.9 and 0.2.10 are unchanged. The ink original travels as the record's `editable_ink`
  artifact.

**Tests** (`tests/ink-original.test.ts` and `tests/frame-ingress.test.ts`):
- **Main.**
  - Exact bytes, strict read-back, and one file shared by frames drawn from the same document.
  - Refusals for the ink only: another session, another revision, other visible strokes, not JSON, not readable, not
    sent, or over 32 MiB.
  - An ink document without a composition.
  - The whole frame refused when all writes fail, and when only the ink write fails (the `ink` folder blocked). In the
    second case no `retained` line is written without its files, and the frame is written once storage is back.
  - The byte cap with the ink bytes counted.
  - Malformed gesture and pending facts.
  - An empty document.
- **The whole overlay** (with per-frame pixels):
  - A frame delayed while a second stroke, a partial erase, an undo and a redo follow keeps revision 1, with the
    manifest SHA-256 of its exact bytes. The saved ink keeps `add, add, erase, undo, redo` and reopens strictly.
  - A stroke still being written is recorded as `uncommitted_gesture` and is not in the original.
  - Evidence pending: one stroke's picture still being encoded, another with no evidence entry yet. The list clears
    once they are made, and a picture that could not be made is not pending.
  - Stop writes a queued frame and its ink original before confirming; a frame lost at the Stop bound leaves no
    original.
- **Mapper.**
  - Truthful bindings for every frame.
  - Refused: a later document's original, a length mismatch, a binding for a refused original, a binding on a
    raw-only frame, and malformed `ink_original`, gesture or pending facts.
  - `unrepresented` notes: a retained original left unbound, a refused one (even with no visible strokes), an old
    line, a gesture in progress, and pending evidence.
- **Negative controls:**
  - sending the latest document instead of the composed one fails 2 overlay tests;
  - swallowing an ink write error fails the ink-only-failure test;
  - never clearing the pending list fails the evidence-pending test.

An independent pre-delivery review (three lenses, each finding checked by a skeptic) confirmed:
- one medium test gap: the ink-only write failure was untested;
- five small gaps: pending evidence can have no entry yet, the pending list clearing was untested, the gesture and
  pending facts were copied unchecked by the mapper, a refused original was unreported with no visible strokes, and
  some checks were untested.

All six are fixed as described above.

Refuted as outside the task: the cost of serialising the document once per second (disclosed below), and the byte cap
being reached sooner with ink originals. Each distinct document is kept whole, so the total grows with the number of
revisions retained. The cap refuses frames beyond it explicitly, as intended.

### Correction: stored originals and the shape of `ink_original` (lead handoff_471d4245b1866d3179ac41903d7d8d8b)

The lead's review of `46dbb90` found two faults.

**Stored originals.** The main process reused an address when anything existed there. So different bytes, or a
directory, at `ink/<sha256>.json` still produced `ok:true` and a line naming that hash.
- **Now.** An original already stored at its content address is reused only if it is a regular file with exactly its
  length and SHA-256. That covers ink originals and the frames' PNGs (the same seam). Otherwise the frame is refused,
  and what is there is left untouched: not overwritten, not replaced.
  - The refusal reads "the original already stored as … is not these bytes (…); it is left untouched".
  - It is not retried, since retrying would not change it.
- **Unchanged.** An address with nothing stored (including a path under a blocked folder) is written as before. A
  failed write is refused and retried, and Stop and the caps work as before. A check that fails for any other reason
  is refused and retried.

**The shape of `ink_original`.** The mapper read `{file, sha256, bytes, refused}` as retained, silently dropping the
refusal.
- **Now.** `ink_original` must be exactly retained `{file, sha256, bytes}` or refused `{refused}` with a non-empty
  reason. Mixed, extra, missing or empty members are refused as malformed.

**Tests.**
- An unchanged original is reused without being rewritten (same inode and mtime).
- Each of these at the ink address is refused, not retried, and left untouched (same inode, mtime and size):
  - other bytes of the same length;
  - a file cut short;
  - a directory;
  - a symbolic link to a true copy.
- A stored PNG with other bytes is refused and left untouched.
- The mapper refuses five mixed or partial shapes, with and without an ink binding.
- Both new tests fail with the `46dbb90` code.
- The lead's probes (`/tmp/windows-ink-original-storage-probe.mjs`, `/tmp/windows-ink-mapper-negative-probe.mjs`),
  pointed at this tree, now stop at their assertions of the old behaviour. The storage probe's unchanged control
  passes and the altered case answers `ok:false`; the mapper probe's mixed shape is refused.

## Fixtures (actual emitted bodies)

`docs/verification/web/evidence/windows-frame-ingress/`, written by `node scripts/ingress-fixtures.ts --write`. Every
identity (batch, incarnation, source, records, frames, archive IDs, the editable-ink original) is synthetic, as a
trusted caller would supply it. Every retained fact is the manifest's, unchanged.

- **`native.json` + `native.body.json`:** the native self-test retention sample of the 13:56:37–13:57:58 UTC run
  (session `b937f0b161a5a616`, test content only). Its copy in `native-capture/` keeps it fixed while later self-test
  runs replace `windows-retention-sample/`. It has 8 records: 5
  framed and 3 frameless (two refusals, one run not retained). It also shows:
  - one shared original (sample 1);
  - two identities for one file (sample 3);
  - distinct raw/composed files (samples 10, 12);
  - a synthetic editable-ink original carried with sample 10. It is **metadata only**: a placeholder SHA-256 and
    length (4096) with no original ink bytes, listed under `metadata_only` in `native.json`. The whole native body
    therefore cannot pass a service that verifies original bytes (HTTP 409 `dependency_missing` in the lead's check).
    It is kept as metadata; it is neither removed nor given invented bytes.

  `historical`, since the session ended.
- **`harness.json` + `harness.body.json`:** a retention record made by the real `main.ts` and `overlay.ts` under the
  unit-test fakes (`scripts/ingress-harness-capture.ts`; files real, Electron/capture/canvas faked, **not a native
  capture**), copied to `harness-capture/`. It has 7 records:
  - a known gap with the same pixels (7000 ms, a gap line only);
  - a retained gap frame (`gap_ms` 5500) with its gap line;
  - a torn line counted as `unwritten`, whose frame file `ffedf0fa…` stays on disk with no line;
  - a frame lost at the Stop bound (`unfinished` [7]);
  - the end.

- **`harness-ink.json` + `harness-ink.body.json`:** a record with real ink originals, made by the real `main.ts` and
  `overlay.ts` under the unit-test fakes (`scripts/ingress-harness-ink-capture.ts`, **not a native capture**) and
  copied to `harness-ink-capture/`: manifest, frames and `ink/*.json`. It has 4 framed records. Each carries its own
  retained ink original, bound truthfully (SHA-256 and length of the file):
  - revision 0;
  - revision 1;
  - revision 1 again: the frame composed before a second stroke, a partial erase, an undo and a redo made while its
    encoding was held back. It shares the file of the frame before; the later document is revision 5;
  - revision 5, taken while a stroke was still being written. `unrepresented` says the stroke is in neither the
    composition nor the ink original.

Each `.json` holds the manifest path and SHA-256, the exact plan (with bindings), the synthetic DisplaySourceSnapshot
0.2.3, the body's SHA-256 and the `unrepresented` list.

## Checks

| Check | Result |
| --- | --- |
| `cd apps/windows && node --test tests/*.test.ts` | 101/101 pass, including `tests/frame-ingress.test.ts` (24) and `tests/ink-original.test.ts` (12). There were 99/99 at `46dbb90`. There were 74/74 at `80da708`, 76/76 at `e03fefc`, 83/83 at `49305e3` and 85/85 at `f277362`. The ingress tests also pass on a simulated CRLF checkout (every LF of the fixtures and sources as CRLF), as on the hosted Windows runner. |
| `tsc -p tsconfig.json --noEmit` | clean. `scripts/**/*.ts` is now in the typecheck. |

`tests/frame-ingress.test.ts` checks that:
- the committed fixtures are byte-for-byte what the mapping emits;
- every sample, image and composition fact equals its manifest line;
- identities are the caller's;
- raw and composed are kept apart in each form (shared, two identities, distinct files, ink);
- raw-only frames map;
- `gap_ms` is known, null for older lines, and refused when fractional;
- the coverage vocabulary is as tabled;
- the end is not a record, and nothing is live after it;
- binding, source, kind and 32 MiB refusals hold;
- identity uniqueness and manifest order are enforced;
- the 4 MiB refusal is reachable (a single record);
- an `unfinished` line without `ended` still refuses `live`;
- a torn last line maps as unknown coverage, and other damage is refused;
- impossible dates, unbounded numbers and lone surrogates are refused;
- an editable-ink original over 32 MiB is refused;
- inputs are unchanged.

Added for the lead's review of `80da708` (`docs/verification/lead/windows-mapper-review/` at `f276dad`):
- a retained composition that is missing, a string, an array or false is refused for sample 10 (distinct raw and
  composed), with the plan unchanged. With a valid composition, both PNG originals are kept;
- the coverage invariants, among them the review's run `99–1` of 100 samples, a count larger than the run, and a
  non-string reason. A fractional gap duration is accepted;
- every record is `external_app` / `visual`;
- a source with an extra member (`source_timezone`) is refused, and emitted sources have exactly three fields.

These four tests, and the fixture comparison, fail with the `80da708` mapper; the other 12 still pass.

An independent pre-delivery review (three lenses, each finding checked by a skeptic) confirmed three more gaps, now
fixed and tested:
- a missing or falsy composed or ink binding in the plan silently made a composition raw-only;
- `unfinished` accepted deferred samples without lost samples, or after the last lost one;
- a written line of kind `torn` passed as a torn tail.

Three other claims were refuted as outside the requirements: bindings are inputs and are not emitted, a 4 MiB
serialisation difference is unreachable, and main's 300-character reason cap need not be enforced. The lead's own
probe (`original-defect-probes.mjs`), which asserts the held behaviour, stops at its first assertion against this
tree: it expected `original_screen_overlay` and got `external_app`.

The released Python validators, from an extracted copy at `f276dad` (in `windows_frame` and
`windows_capture_ingress`, only the READMEs differ from `6305389`), run by
`docs/verification/web/windows-frame-ingress-check.py` (usage in its header) with the repo's `.venv` Python:

- **native:** 8 records (5 framed, 3 frameless), 5 frames, 8 image bindings, body 17563 bytes. The placeholder ink
  binding is labelled metadata-only, and the checker requires that label.
- **harness:** 7 records (3 framed, 4 frameless), 3 frames, 3 image bindings, body 11188 bytes.
- **harness-ink:** 4 records, 4 frames, 4 image bindings and 4 ink originals read back, body 13015 bytes. For each:
  - the file's bytes have the binding's SHA-256 and length;
  - the file parses to the composition's ink session, revision and visible strokes;
  - `original_artifact.validate` accepts the `editable_ink` binding.
- **What passes for each:**
  - `decode_request` and `validate_frame_batch` with the owner;
  - `windows_frame.validate_binding` for every framed record, with the snapshot and every distinct binding;
  - `original_artifact.validate` for every binding, the editable ink included;
  - the canonical round trip;
  - each declared PNG's SHA-256 and length read back from the retained file;
  - a changed request (a Process clock) rejected.

## Gaps and next owner

- Lead validates these fixtures against the Python contract and the Backend seam, then assigns the transport consumer.
- The mapping is pure. Reading the retained PNG bytes, obtaining real archive IDs and bindings, uploading originals
  and sending belong to a trusted caller that does not exist yet.
- The native fixture's ink binding stays synthetic and metadata-only. The `harness-ink` fixture binds real ink
  originals, but from the unit-test fakes, not a native capture.
- An ink original references its strokes' context pictures by SHA-256. Those pictures are the ink's own originals,
  under `ink/context/`, and are not copied into the capture record.
- The ink document is serialised at every composition (once per second). Its cost grows with the document and has
  not been measured on a large one.
- Only `provisional_session` scope is produced. Attempt scope needs the caller's attempt relation.
- The Stop is not a Process record. The orphan frame file of a torn line is only on disk. Durations, ranges and reasons
  of events without an image stay in the manifest (`unrepresented`).
- The harness fixture is not a native capture. The native sample has no gap, `unwritten` or `unfinished` lines.
- Both §7.1 gates, R35/R36 multi-device, R46/R59 archive and AI receipt remain open.
