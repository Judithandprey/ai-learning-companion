# Windows retention storage review — HOLD

Candidate: `04caef61f251e9df2e6c6f5e433b0a2c1dd6ed68`, parent `99ae568`.
Read-only source/artifact review, 2026-09-30. Exact source export: `/tmp/windows-retention-04caef61`.
Scope: main-process retention storage and IPC, failure/cap/Stop behavior, shared PNG/fact checks, and committed synthetic sample. Renderer queue/pinning is independently reviewed by the other reviewer.

Applied project PONYTAIL LITE and current workflow. Refreshed R27/R46/R51/R52/R59 and A30/A31 source/English clauses, retained originals and source/time unknowns. The owner branch lacks current `docs/workflow.md` and the consolidated English requirements, so these were read from committed main (`03feb7262f708811f07c0fc04cca7f57e46eb7bd` at review start), without altering either tree. Retained originals, honest gaps, error visibility and learner controls remain requirements; this bounded delivery is not full product or independent interactive QA acceptance.

## Blocking findings

### S1 — P2: partial append leaves a corrupt manifest after an acknowledged successful retry

Location: `apps/windows/src/main/main.ts:356`–370 (`appendRetention`), especially line 364, and lines 432–435 (`retainFrame`).

Actual-source reproduction: retain one valid PNG/fact entry; inject an `appendFileSync` failure that writes the first 23 bytes of the next record and then throws ENOSPC; retry the same record with working storage. First call correctly returns `retry:true`; second returns `ok:true`. The third physical JSONL line is now:

```text
{"sample_seq":2,"frame_{"kind":"unwritten","count":1,"reason":"earlier manifest lines could not be written to this device; their events are not listed"}
```

The retry concatenates the recovery marker onto the torn line. The ordinary reader used by the delivery (`split('\n').map(JSON.parse)`) throws, even though the retry increments retained count and reports success. Existing tests only inject a throw before any bytes are written, so they miss this disk-full/interrupted-write boundary. This does not demonstrate destruction of earlier file bytes; it demonstrates invalid durable framing and false successful recovery.

Minimum correction: preserve the known valid prefix and ensure a failed append cannot leave an unterminated record before accepting another successful append. If repairing/truncating the tail also fails, keep the write failure visible and do not acknowledge recovery. Add this exact partial-write regression; no new persistence framework is needed.

### S2 — P2: the Stop deadline discards pending retention while describing only unconfirmed ink

Location: `apps/windows/src/main/main.ts:203`–221, with renderer completion dependency at `apps/windows/src/renderer/overlay.ts:947`–959.

Main-source reproduction: retain sample 1; deliver observed sample 2; hold the renderer's `lc:stopped` acknowledgment as occurs while PNG encoding/retention is pending; invoke the actual captured 10,000 ms timer callback. The overlay is destroyed and `current` becomes null. A late retain of sample 2 is refused. The manifest contains only `header`, `retained`, `ended`; its end reason is `stopped by the user. The overlay did not confirm that its newest ink was saved`. The retention status remains `frames:1, not_retained:0, refused:0, unwritten:0`. Neither durable end status nor visible status identifies incomplete/unknown frame retention.

This probe invokes the actual main timer deterministically; it does not emulate a Windows encoder or prove that ordinary encoding takes ten seconds. Source inspection establishes that renderer Stop waits on the retention promise before acknowledging. Compose this main-boundary result with the renderer reviewer's actual held-encoding reproduction. A synchronous main-process file write blocks the event loop, so this report does **not** claim that the timer interrupts a synchronous write midway.

Minimum correction: make retention completion/failure part of the Stop boundary. Keep pending originals recoverable where possible, and if a bounded forced end is required, record and show unfinished/unknown frame retention explicitly. Do not silently describe this as only an ink-save issue or merely increase the timeout. Preserve immediate capture cessation and existing ink recovery.

### S3 — P2: final manifest write failure is forgotten and never reaches the visible retention status

Location: `apps/windows/src/main/main.ts:214`–224 (`finish`), especially line 221; `appendRetention` lines 368–370.

Actual-source reproduction: successfully retain one frame, then inject EIO for disk writes and complete normal Stop with `lc:stopped(null)`. `finish` clears `current` and ignores `appendRetention` returning false. Disk contains `header, retained` with no `ended`; internal `unwritten` becomes 1 but the last visible retention event still says 0 unwritten. The session event says only `stopped by the user`. There is no later session state to publish/retry this failed final record. Existing successful end test and earlier refusal test do not cover this boundary.

Minimum correction: observe the final append result, publish final incomplete/unwritten status and retain enough state for truthful recovery/reporting after session teardown. A storage failure must not erase its own warning.

## Additional validation observations, limited to the owned renderer boundary

`fromOverlay` at main.ts:679 and IPC at 721–724 correctly require the current app-owned overlay's `webContents`; a wrong sender is refused, and a destroyed/previous overlay is refused. These are not arbitrary public HTTP endpoints and no external exploit is demonstrated.

- main.ts:399–405 and 438–442 accept numeric types without finite/integer/range checks or complete required retained facts. A live owned-sender probe with `sample_seq:NaN`, `frame_seq:-1.5`, deferred `[Infinity,-10]`, and only raw dimensions returns `ok:true`; JSON contains null sequence/deferred values and omits time/state/pixel facts. A backwards negative gap decrements the UI's not-retained count. This falls short of the test name's broad claim that malformed facts never write. Define/reuse the actual internal record shape and reject malformed required facts without inventing missing time/source evidence.
- shared/retention.ts:73–78 and main.ts:379–387 only inspect PNG signature/IHDR geometry. A 24-byte prefix, with no complete IHDR/CRC, image data or IEND, is acknowledged and stored as a retained PNG. This is a robustness/integrity gap on the owned renderer channel, **not** evidence that normal `convertToBlob` currently emits corrupt PNGs. Reuse the native decoder or equivalent complete bounded validation if declaring malformed pictures rejected. Do not overstate the existing IHDR-only check as decoding.

Both probes are retained for the owner; the HOLD already follows from S1–S3 independently.

## Checks that passed

Pinned Node 24.21.0, Linux portable tests, no installs:

```sh
cd /tmp/windows-retention-04caef61/apps/windows
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node --test --test-isolation=none tests/retention.test.ts tests/main-lifecycle.test.ts
```

18/18 actual tests passed (5 retention, 13 main lifecycle). These exercise ordinary exact-byte PNG storage and manifest facts, initial/changed/deferred decisions, count/byte caps without deleting retained files, wrong geometry, pre-write failure/recovery, and existing Stop/ink recovery paths. Additional probe positive group passed: wrong sender creates no retention directory; pre-Stop work drains while ending; post-end sender is refused.

The reviewer added only `/tmp` files. `storage-review-harness.ts` is a copy of the author's harness with two diagnostic changes: record actual timers instead of discarding them, and allow one partial append followed by failure. Candidate main.ts and shared retention.ts remain unchanged and run through the existing TypeScript source/VM harness. Filesystem storage is real `/tmp`; Electron/window/capture interfaces are fake. This is not a native build/run.

Reproduce all six bounded probe groups:

```sh
cd /tmp/windows-retention-04caef61/apps/windows
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node tests/storage-review-probe.ts
```

Probe source: `/tmp/windows-retention-04caef61/apps/windows/tests/storage-review-probe.ts`.
Harness: `/tmp/windows-retention-04caef61/apps/windows/tests/storage-review-harness.ts`.
Results and retained failing manifests: `/tmp/windows-retention-storage-probe.json` (contains paths).

## Committed sample artifact audit

All 8 artifact files match their candidate Git blob hashes exactly (raw bytes, not line-ending normalization). Manifest: 8,726 bytes, SHA-256 `bd866444e33ed7581244c2b2ff89a32c626521035b13283d60f6082587891382`.

All 7 PNGs independently passed signature/chunk bounds/CRC/IEND checks, zlib decompression and PNG scanline reconstruction. Each is a complete 2560×1600 RGBA8 image (16,384,000 decoded RGBA bytes), consistent with the recorded 1280×800 display at scale 2. Every manifest reference agrees with actual file SHA-256, byte size, dimensions and decoded RGBA SHA-256. All 7 files are referenced, with no missing/orphan images. Total PNG bytes: 2,388,782. The 5 retained samples are 1, 3, 7, 10, 12; refused 5 and 14; explicitly not retained sample 8; deferred IDs stay documented; ended reason is the self-test. Wall-clock ordering and monotonic minus presentation age agree for all five.

| PNG SHA-256 (also filename stem) | Bytes |
| --- | ---: |
| 035b8e37486902a27491bd26d3148b636ba27980f9808e44eb53d506590fe2cd | 274656 |
| 082c0c1e630909906209a7c91dd81a8adb83c0838934c5b72b427763af596546 | 273978 |
| 4778db2dbf59f40311321d7db5d1b415c1e035b7a1e313328d354e20e6c5ced5 | 357699 |
| 4fd91e94b1fd6b5fd4b1a505e826292fb7c5d04409a1cc2891982ce8b1a58747 | 359048 |
| 8a695b9896960c695d8c4cd3604aa20d7294baace363fadc3d3177ad07eaffb1 | 274877 |
| 9dc2b9a3aaa5261e70f7c1473caea09321db34a38ae69f581a3b5409ce898ce4 | 285487 |
| d68d53bd7333ba67c3a3ed5de3ff008b10d8a18712baace0d01fab7f0489c715 | 563037 |

All seven images were visually inspected: synthetic colored checkerboards/probe counter, pointer and test ink; no private user content or unrelated app visible. The full-screen author self-test intentionally covers the display, and the sample lives in `docs/verification/web/evidence/windows-retention-sample`; it is not course/user evidence. However, the owner reported that the 12:37:09–12:38:00 run may have overlapped QA display use. Therefore treat these bytes as **author synthetic evidence with nonquiet timing**, not independent or controlled desktop acceptance. This audit cannot establish the absence of interference outside the visible committed frames.

Audit script `/tmp/windows-retention-sample-audit.mjs`; detailed result `/tmp/windows-retention-sample-audit.json`; exact candidate Git entries `/tmp/windows-retention-sample-git-tree.txt`. Reproduce:

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/windows-retention-sample-audit.mjs
```

No Windows/Electron/UI/capture/listener/provider/native launch, no interactive input, no workflow rerun, no dependency installation, no main/worker edits or Git mutations. No power-loss durability or fsync guarantee, desktop permission/capture behavior, real AI delivery, full retained-history acceptance, or independent product QA is established by this review. Return the concrete S1–S3 corrections to the same owner; combine with the separate renderer report, then retest the changed failure boundaries only.
