# Windows ink-original core review — HOLD

Exact candidate **46dbb9023768d7d738b84ffca4d8f8c725b02953**, parent **f277362b5f13a0681a6cd9e5ea5f04e67b05ed86**. Exact export: `/tmp/lc-windows-ink-original-46dbb90`; current main at assignment: `6036026`. No repository/worker modifications or native/display/provider run.

PONYTAIL LITE applied: reviewed current P0-07/12 handoff `handoff_5bd0e9e0c80521828d81466d71a0353e`, affected source/English R07/R08/R46/R51/R52/R59, §7.1/7.2/7.4 and A26/A30/A31/A44, then traced the existing overlay → IPC → parser/writer/manifest/Stop flow. Mapper/API composition is a separate reviewer/Lead scope.

## P2 blocker: an existing hash path is accepted without checking its retained bytes

**`apps/windows/src/main/main.ts:552,593–604`**. `readInkOriginal` hashes/parses the incoming bytes but decides whether they are already retained using only `existsSync(inkOriginalFile(...))`. `retainFrame` also skips the write based solely on existence, then lists the incoming SHA/length and returns `{ok:true}`.

Minimal actual-function reproduction:
1. Retain a valid composed frame plus its matching editable document; assert the written ink bytes match.
2. Replace that exact `captures/<session>/ink/<sha>.json` with `{"damaged":"original"}`.
3. Retain another frame with the same valid snapshot.

**Observed:** success ACK and a new `kind: retained` line with the original SHA/length; the on-disk bytes have another SHA. A directory occupying the expected content-address path is likewise acknowledged/listed as an original, without any readable file. An unchanged-existing-file control succeeds with the correct hash. The probe invokes the actual candidate `lc:retain-frame` handler through the existing fake-Electron harness, with actual filesystem writes. It does not substitute the storage function.

**Effect:** this new frame's exact editable original is not retrievable despite a successful retention claim; the truthful incoming bytes are discarded as an assumed duplicate. The probe leaves the collided path untouched; it does not allege the app caused the initial corruption. Similar existence-only reuse for older PNG paths is inherited; this finding is scoped to the newly added ink-original path.

**Smallest required behavior:** before issuing a successful ink-original reference for an existing address, establish that it is readable retained-file content matching the declared bytes/hash. An unreadable, non-file or mismatched existing entry must produce an explicit refusal/failure, preserving the unexpected existing data; it must not be silently acknowledged as a matching original. No broader storage rewrite is requested.

## Checks that passed

- The composition canvas, document JSON bytes, session/revision/visible count, uncommitted gesture and evidence-pending IDs are taken synchronously before the pixel hash/PNG awaits. Per-request `made` retains those bytes through later edits. Existing writer/parser/cap paths are reused; malformed/oversize ink gets an explicit ink refusal, ink-write failure refuses the frame for retry, and accepted ink bytes count toward the cap.
- **11 named new ink-original tests**, **13 lifecycle tests**, and **5 Stop tests** pass by direct execution of each test file. They cover exact bytes/dedup, delayed write/erase/undo/redo, pending/uncommitted disclosure, malformed input, caps, ink-only failure/retry, normal Stop drain and forced-end gaps. Their harnesses fake Electron/canvas/decoder boundaries; passing is portable source-path evidence, not independent native acceptance. The initial `node --test` launch reported only three file-level results, so named totals above come from retained direct-execution logs.
- **Independent delayed-hash/Open control passes:** pause the first actual WebCrypto pixel digest after the snapshot; invoke the real overlay load callback with another saved-document shape; release the digest. The first retained JSON is byte-for-byte the pre-hash document and strictly readable, the next sample names the newly opened document, and Stop ACK follows both writes. A scratch copy of the existing overlay helper adds only a callback hook and absolute imports; the production source remains exact. This complements the author's PNG-delay/edit test.

## Reproduce and preserve

```sh
NODE=/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node
$NODE /tmp/windows-ink-original-storage-probe.mjs
$NODE /tmp/windows-ink-original-open-probe.mjs
cd /tmp/lc-windows-ink-original-46dbb90/apps/windows
$NODE tests/ink-original.test.ts
$NODE tests/main-lifecycle.test.ts
$NODE tests/overlay-stop.test.ts
```

Storage proof: `/tmp/windows-ink-original-storage-probe.{mjs,log,json}`. Snapshot/Open proof: `/tmp/windows-ink-original-open-probe.{mjs,log}` and `/tmp/windows-ink-original-overlay-page-review.ts`. Named logs: `/tmp/windows-ink-original-new-tests.log`, `/tmp/windows-ink-original-main-lifecycle.log`, `/tmp/windows-ink-original-overlay-stop.log`. Machine receipt with exact source and all artifact hashes: `/tmp/windows-ink-original-core-review.json`.

No broad 99-test replay, mapper re-review, new framework, native UI, network, DB, service or provider call. Frozen snapshot context images may still be pending and are explicitly listed as such; raw/composed metadata is not provider/acquisition authority. Native operation and full §7.1/A44 acceptance remain open. **Next owner: Web**, one consolidated correction from Lead; preserve these failing-behavior probes and the passing delayed-snapshot control.

## Probe hashes

| File | SHA-256 |
| --- | --- |
| `windows-ink-original-storage-probe.mjs` | `cd15ff9c74bac469924872fd6fa1999b94398ba24ac2d1a05bfbb1417bbce1d1` |
| `windows-ink-original-open-probe.mjs` | `ce7c904b3680c2c175afc22a1c2a4cd6d02cd4a1bd5264df7f399791a5a06449` |
| `windows-ink-original-overlay-page-review.ts` | `153379b737e98b2a23365b3a2a604824b9879bb465948240b0952e2144ad17d1` |
