# Windows hosted artifact audit — run 36713802500

**APPROVE this bounded package/provenance evidence. No missing app/runtime dependencies or production-semantic blocker found.** Exact commit `e819bfe4c6650c01c72610109725f30bccb82b47`, artifact `11095048494` (`desktop-windows-e819bfe4c6650c01c72610109725f30bccb82b47-1`). Downloaded originals and repositories were not modified; the app was not launched.

- **Checksums:** all **13/13** evidence files match SHA256SUMS, with exact coverage and no duplicates. ZIP integrity/CRC passes for all **98 files**.
- **Source representation:** the archive names the exact commit in its PAX comment; all **1,599** Git paths/types/modes are present, including **30 Windows files**. **380** files match Git blobs byte-for-byte; **1,219** differ only by LF→CRLF conversion. No other byte differences were found. This is not raw Git-blob byte identity.
- **Bounded provenance confirmation:** a read-only `git -c core.autocrlf=true archive --format=tar e819bfe4c6650c01c72610109725f30bccb82b47` reproduces every hosted member's actual bytes, modes, types and names exactly. The tree has no `.gitattributes`. This deterministically explains the source representation; the actual runner's core.autocrlf setting was not directly logged. No CI configuration change or workflow rerun was made.
- **Hosted build/tests:** manifest reports Windows x64, Node **24.21.0**, Electron **44.5.1**, TypeScript **7.0.2**. Build/static-copy/package logs completed and result records exit 0 / checks-completed. Actual test log contains **31 named passes, zero failures**, including corrected ASK encoding and Stop retention checks. No tests were rerun for this audit.
- **Windows executable:** `electron.exe` is **PE32+ AMD64/x64**, machine `0x8664`, **245,726,208 bytes**. Its actual RT_VERSION resource reports file/product **44.5.1.0**, agreeing with the packaged version file and hosted `v44.5.1` CLI output. The package has **73 Electron runtime files**, including **55 locale files**, Chromium resource packs, ICU, snapshots, media/Vulkan/runtime libraries and default_app.asar. PE imports reference Windows system libraries; no unprovided project/library dependency was identified. The reviewed packager copies the installed Electron runtime directory in full.
- **Boot/application closure:** **25 application files** include ESM `package.json`, main `dist/apps/windows/src/main/main.js`, both sandboxed CommonJS preloads, control/overlay/probe HTML/CSS/JS, shared modules and `dist/apps/safari-extension/src/{ink,mode}.js`. All **11 production JS/CJS modules** have resolvable relative imports; other imports are Electron or Node built-ins. All HTML asset references resolve. Main's app:// dist root and preload paths match the package layout. Package.json and all **8** copied static/preload assets match the archived source bytes exactly. No runtime npm dependency is omitted.
- **Reused source provenance:** ink blob `a42551fa8e2a9a33d6aa0b03049a05c75e10a46e`; mode blob `487b0345b4214cfbfc630d49bcd1eff8555081b2`. Both archived TS inputs and emitted runtime modules are present.

Key SHA-256 values:

| Item | SHA-256 |
| --- | --- |
| WindowsDesktop.zip | `13691cadd5ee9298b7acc427f109ef63b6a01914f8e755fed5468f70750c2071` |
| source.tar.gz | `f2ff7884214b8d029ecba18043c88b657907e61faecac929d7658f8acf5544e7` |
| electron.exe | `49b61a030a520fc36a4b8fa5cce53fb4e935a7bdbbe4b80e9222f598e49cc7fa` |
| tests.log | `01b78af889165dc42d65f7d929ad55cbd3b1fe7af71637161cc7828e0822a726` |

Detailed checks, file lists/import edges, PE dependency names and all evidence hashes: `/tmp/lc-windows-36713802500-audit.json`. Read-only inventory/checker: `/tmp/lc-windows-36713802500-audit.py`; independent Git archive reproduction: `/tmp/lc-windows-36713802500-autocrlf.tar`. The checker requires that recorded reproduction file and may be run with repository `.venv/bin/python`.

This verifies retained build/test evidence and static package closure, not application launch/dynamic loading, physical pen, screen permissions, live capture, audio, real AI, signing/notarization or full product acceptance. Result.json explicitly keeps interactive_runtime_verified/provider_verified/project_signing_performed false. No private user content, queues, worker files or live services were inspected.
