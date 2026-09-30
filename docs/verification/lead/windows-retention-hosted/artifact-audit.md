# Windows retention hosted artifact audit — APPROVE bounded build/package evidence

Run **36723370841**, exact pushed source **`f46ff8737a8e6cc09fe8577d2a2ef7cd2dfcf7dd`**, artifact **11101606896**, downloaded originals `/tmp/lc-windows-36723370841`.

No checksum, source representation or static application/runtime closure blocker was found. This audit establishes hosted compilation, recorded tests and packaged-file closure. It does not change the separate product/QA findings or establish interactive acceptance or real AI delivery.

## Integrity and exact source provenance

- **13/13 evidence checksums pass**, with exact SHA256SUMS coverage, no duplicate/missing evidence entries. ZIP integrity/CRC passes for all **103 files**. Archive/ZIP paths are safe, without duplicate members or parent traversal.
- Source PAX comment identifies **f46ff8737a8e6cc09fe8577d2a2ef7cd2dfcf7dd**. All **1,717 Git files**, modes and types are accounted for, including **35 Windows files**.
- **392** source files match raw Git blobs. **1,325** differ only by LF→CRLF conversion. **No difference beyond line endings** was found. Do not describe all hosted source bytes as raw Git-blob identical.
- Read-only `git -c core.autocrlf=true archive --format=tar f46ff8737a8e6cc09fe8577d2a2ef7cd2dfcf7dd` reproduces every archived member's actual bytes, names, types and modes exactly. This explains the Windows archive representation deterministically; the runner's actual core.autocrlf setting was not directly logged.
- The five environment-recorded build input object IDs match this commit. Windows tree **`48aeaa2b943960c4b538f6131669cda39163ff74`** is identical to independently reviewed retention correction **e586b822f81867ecab29ddaeccf5537a40b9f653**. Reused ink **a42551fa8e2a9a33d6aa0b03049a05c75e10a46e** and mode **487b0345b4214cfbfc630d49bcd1eff8555081b2** are included in the source snapshot and emitted runtime closure.

## Hosted result and changed package closure

- Actual tests.log contains **54 named passes**, **0 failures**, **0 skipped**, reported duration **2129.2622 ms**. Included regressions cover S1 torn writes, S2 Stop/unfinished work, S3 end retry, R1 gap duration, R2 clock description, and malformed inputs. These are the source-based Node tests, including fake Electron/canvas/decoder interfaces; running them on Windows does not turn them into interactive GUI tests. No test suite was rerun during this audit.
- Hosted manifest records **Windows x64**, **Node 24.21.0**, **Electron 44.5.1**, **TypeScript 7.0.2**. Build log records `tsc -p tsconfig.json && node scripts/copy-static.mjs` and all eight copied static/preload assets. Result.json is **checks-completed**, **last_phase=complete**, **exit_code=0**. Snapshot and package logs are empty on success; result/ZIP evidence, rather than invented log text, establishes completion. Electron CLI log reports **v44.5.1**.
- ZIP has **30 application files** and **73 Electron runtime files**, with **55 locale files**. All 73 runtime names and SHA-256 values are identical to the previously audited run **36713802500**; no new native dependency investigation or app launch was needed.
- Executable is the same **PE32+ x64 / machine 0x8664**, **245,726,208-byte** Electron binary; RT_VERSION file/product **44.5.1.0** agrees with the packaged version. Previously reviewed native runtime closure is preserved.
- ESM package.json and all **8 copied static/preload assets** match this snapshot's actual bytes. Main entry `dist/apps/windows/src/main/main.js`, both CommonJS preloads, control/overlay/probe pages and assets, shared modules and reused sibling ink/mode modules are present. All relative imports across **12 production JS/CJS modules** and HTML asset references resolve; other imports are Electron or Node built-ins. No omitted runtime npm dependency was found.
- Packaged retention runtime is present: main includes valid-prefix/truncate repair, 60-second Stop cap, unfinished/deferred accounting, final-end retries, nativeImage validation and strict fact validation; overlay includes retentionPending, gap_ms, observationGap, stopping and the combined Stop wait; control includes unfinished/end-record warnings; preload exposes both new channels; shared retention module includes selection/caps/PNG helpers. Per-file hashes and marker checks are recorded in the JSON. This is static inspection of emitted output, not an independent rebuild or dynamic behavior proof.

## Key SHA-256 hashes

| Item | SHA-256 |
| --- | --- |
| WindowsDesktop.zip | `b307982243d48f424f197c6a85e0c90b1df7bf2752c1895eb85556f7aa8bdb80` |
| source.tar.gz | `5f508dcf16baff6cadb8421ef6a10e5811982e72b40380fa1f8592ce2cd516ee` |
| electron.exe | `49b61a030a520fc36a4b8fa5cce53fb4e935a7bdbbe4b80e9222f598e49cc7fa` |
| tests.log | `9f989da0e97d85efbc00e7f5b3944dd05b0012ce56db670cf2bc015ff680eef8` |

Detailed inventory and evidence: `/tmp/windows-retention-hosted-audit.json`. Standalone read-only checker: `/tmp/windows-retention-hosted-audit.py`; log `/tmp/windows-retention-hosted-audit.log`. Independent Git archive reproduction: `/tmp/lc-windows-36723370841-autocrlf.tar`.

Reproduce with the existing environment:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /tmp/windows-retention-hosted-audit.py
```

The checker reads downloaded originals and Git, and writes only its `/tmp` report/reproduction outputs. No executables are extracted or launched, no UI/capture/provider/DB/service/network/install is used, no main/worker files or Git state are changed, and no Chats are sent.

All three result flags remain explicitly **false**: `interactive_runtime_verified`, `provider_verified`, `project_signing_performed`. Hosted compilation/tests/development packaging do not establish physical input, live permission/capture behavior, real AI understanding, signing, full product completion or independent interactive QA. Existing archive-reader and learning-composition findings remain separate and are not superseded by this artifact approval.
