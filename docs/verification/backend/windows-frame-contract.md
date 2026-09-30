# Windows retained metadata 0.2.9 candidate

Lead delegation `handoff_521ed80a47b91ad95d545c2bacf102ee`, clarified by
`handoff_1f0e4b5dc696e8a70604f10cef0a9faa`, supports existing P0-08/P0-09.
Exact baseline `d412ed90495b0bb894ec6f7059d9ebf62a2186fb` was merged normally into
the clean backend branch at `3ba7189519f1da66e2a6e28d4d0fa56ea35f2deb`. No work
was reset. The current workflow's shared-display reservation rule was refreshed;
this task never used an interactive desktop.

Read complete affected original/English §7.1 and R35/R36/R46/R51/R52/R59, current
decisions, source/ink and sustained-visibility acceptance boundaries, ADR 0002 §3,
and the exact candidate producer call flow. PONYTAIL LITE reused existing
identifiers, SourceRef, 32 MiB PNG references, validators and the structural type
generator. New state/dependencies/transport were unnecessary. The lead explicitly
delegated only the new Windows package, its test file and backend evidence;
shared prior contracts, services, root integration and native code were preserved.

## Callable result and actual source

The [package](../../../packages/contracts/windows_frame/README.md) provides
`validate(frame)` and `validate_binding(batch, record_id, frame, source, bindings)`.
One retained sample keeps raw and nullable composed PNG descriptors separately,
with explicit original bindings for every distinct image artifact. Source owner,
version, selected Process record, frame and device/session/stream must match.
Composed pixels neither replace editable originals nor establish trusted input
events. This is a candidate metadata contract pending lead approval and adoption.

Producer source is exactly `04caef61f251e9df2e6c6f5e433b0a2c1dd6ed68`:

- `apps/windows/src/shared/retention.ts`: actual retention decisions and PNG header handling.
- `apps/windows/src/shared/samples.ts`: sample/held-image/gap/alignment semantics.
- `apps/windows/src/renderer/overlay.ts:207`: held-frame acquisition and pinned composition;
  `:840` retention metadata; `:931` ink-document switching.
- `apps/windows/src/main/main.ts:119`: startup selection; `:337` header;
  `:379` PNG file bytes/dimensions/hash; `:397` persistence.
- `docs/verification/web/evidence/windows-retention-sample/manifest.jsonl`:
  exact retained source evidence, including failed and omitted records.

The five sample-derived examples preserve actual native timestamps, ordinals,
source startup facts, file/RGBA hashes, dimensions and composition details. Their
shared archive identities/bindings are explicitly synthetic. Exact manifest
SHA-256: `bd866444e33ed7581244c2b2ff89a32c626521035b13283d60f6082587891382`.

Read-only Git object verification independently matched **seven unique actual PNG
files** against all five samples: SHA-256, byte length, signature and IHDR width/
height. [Recorded file evidence](windows-frame-producer-files.json) preserves
those facts. No images were recaptured, and no actual RGBA hash or composition
correctness is independently attested by reading the PNG header/file digest.

## Source limitations preserved

The independent source review found no basis for equating held `frame_seq` with
`sample_seq`, ink document with capture session, or raw pixel dimensions with
startup DIP bounds times scale. Sample wall clocks may jump. Separately read and
rounded age/presentation values do not satisfy exact subtraction in general,
despite stronger wording in the candidate header. No Mac clocks or actual capture
UTC/course playhead/pre-presentation latency are introduced.

Old retained records omit `gap_ms`, so their new explicit field is null. A
source-supplied positive duration is representable only for `state: gap`; the
corrected producer's mapping remains for lead review. No duration is inferred
from deferred IDs or wall time. Frame-less gaps, refusals, coalescing, unwritten
history and Stop still need explicit later transport treatment; they are not
manufactured retained PNGs. All original records in the example manifest remain.

Candidate `04caef6` is held by lead for lost same-pixel delayed gaps, omitted known
duration, partial JSONL append/retry integrity and Stop/final-write visibility.
Those findings were not downgraded to acceptable product behavior. Main's native
96 MiB PNG ceiling can exceed the existing 32 MiB archive-reference ceiling;
over-limit originals require an honest later refusal without trimming or loss.

Read-only independent draft review found and reproduced a local consistency gap:
different artifact IDs could claim different lengths/RGBA facts for the same
native PNG filename/digest. The draft now checks native-file facts independently
of archive artifact identity; the new focused tests cover both boundaries.

## Executed verification

All Python commands used the existing
`/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python` with
`PYTHONDONTWRITEBYTECODE=1`:

```sh
python -m packages.contracts.windows_frame.generate --check
python -m pytest -q -p no:cacheprovider packages/contracts/tests/test_windows_frame.py
python -m pytest -q -p no:cacheprovider \
  packages/contracts/tests/test_capture_frame.py packages/contracts/tests/test_desktop_frame.py
```

Generation check passed. New Windows metadata/binding suite: **216 passed in
0.58s**. Existing raw/Mac contract regression: **258 passed in 0.73s**. Together,
**474 distinct tests passed**. New checks cover actual sample mapping, finite and
safe values, closed/required fields, null/known gaps, honest held-image clocks,
exact selected-record/source/original binding, PNG-versus-RGBA digest roles,
input preservation and rejection by unchanged 0.1.0–0.2.8 validators. The final
three same-native-file cases additionally guard distinct archive artifact IDs
with matching versus contradictory declared image facts.

Standalone structural TypeScript check passed (no root configuration edits):

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node \
  /home/agentsdock/Projects/learning-companion/repo/node_modules/typescript/bin/tsc \
  --ignoreConfig --noEmit --strict --skipLibCheck --target ES2022 \
  --module ESNext --moduleResolution Bundler \
  packages/contracts/windows_frame/generated/contracts.ts
```

Initial inspection found no `node` on PATH; the existing project Node executable
was used. TypeScript requested `--ignoreConfig` for explicit input files, which
was supplied without changing root config. These initial invocation errors were
not counted as passing tests. Runtime cross-field/binding checks still reside in
Python; generated structural types are not acquisition or authorization proof.

No listener, database, native/paid provider, account or preview action was run.
No existing 0.1.0–0.2.8 package, dependency, root configuration, migration or
service/consumer was modified. Lead next reviews fields/version and corrected
producer mapping, releases/integrates generation/typecheck, then assigns adapters.
Actual producer integrity, independently verified pixel composition, editable ink,
Windows/macOS §7.1 gates and full requirement acceptance remain open.
