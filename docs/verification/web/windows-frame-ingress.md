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
- `surface: original_screen_overlay`, `method: visual`, scope `provisional_session`, no causal parents;
- evidence: coverage `observed_samples` with `sample_only`, `unsupported_history`, as for macOS;
- artifacts: the raw reference, the composed reference if it is another identity, then the editable ink if bound.

The surface is this app's live overlay on the original screen (R52: live annotation, frozen screens and canvases are
distinguished), not a frozen or owned canvas.

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
next append) is not an error. The lines before it map, and a coverage entry may name it: `unknown`,
`[missing_events]`, "what it recorded is not known". A damaged line anywhere else refuses the whole manifest.

**Refused visibly, with nothing resized, dropped or repaired:**
- **The manifest:**
  - a damaged line other than a torn last one, a missing or second header, or another capture session;
  - an `ended` or `retained` line used as coverage (the end of a session is not a Process record).
- **Malformed facts:**
  - a non-integer `gap_ms`, presentation facts that do not fit the held count, or marks that do not sum to the
    strokes;
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
  - a synthetic editable-ink original carried with sample 10.

  `historical`, since the session ended.
- **`harness.json` + `harness.body.json`:** a retention record made by the real `main.ts` and `overlay.ts` under the
  unit-test fakes (`scripts/ingress-harness-capture.ts`; files real, Electron/capture/canvas faked, **not a native
  capture**), copied to `harness-capture/`. It has 7 records:
  - a known gap with the same pixels (7000 ms, a gap line only);
  - a retained gap frame (`gap_ms` 5500) with its gap line;
  - a torn line counted as `unwritten`, whose frame file `ffedf0fa…` stays on disk with no line;
  - a frame lost at the Stop bound (`unfinished` [7]);
  - the end.

Each `.json` holds the manifest path and SHA-256, the exact plan (with bindings), the synthetic DisplaySourceSnapshot
0.2.3, the body's SHA-256 and the `unrepresented` list.

## Checks

| Check | Result |
| --- | --- |
| `cd apps/windows && node --test tests/*.test.ts` | 74/74 pass at `80da708` (76/76 with the later alignment correction), including `tests/frame-ingress.test.ts` (13). The ingress tests also pass on a simulated CRLF checkout (every LF of the fixtures and sources as CRLF), as on the hosted Windows runner. |
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

The released Python validators at `6305389`, from an extracted copy, run by
`docs/verification/web/windows-frame-ingress-check.py` (usage in its header) with the repo's `.venv` Python:

- **native:** 8 records (5 framed, 3 frameless), 5 frames, 8 original bindings, body 17651 bytes.
- **harness:** 7 records (3 framed, 4 frameless), 3 frames, 3 original bindings, body 11265 bytes.
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
- The editable-ink original here is synthetic. No real `lc-desktop-ink/v1` bytes are bound, and the mapping does not
  check which ink revision a binding holds.
- Only `provisional_session` scope is produced. Attempt scope needs the caller's attempt relation.
- The Stop is not a Process record. The orphan frame file of a torn line is only on disk. Durations, ranges and reasons
  of events without an image stay in the manifest (`unrepresented`).
- The harness fixture is not a native capture. The native sample has no gap, `unwritten` or `unfinished` lines.
- Both §7.1 gates, R35/R36 multi-device, R46/R59 archive and AI receipt remain open.
