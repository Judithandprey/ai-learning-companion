# macOS ink hosted evidence audit — APPROVE bounded build/package evidence

Run **36725613633**, exact source **`a33932a35a32aed985facfd5de334e1b24512cf0`**. Downloaded artifact directory: `/tmp/lc-macos-36725613633/desktop-macos-a33932a35a32aed985facfd5de334e1b24512cf0-1`.

No artifact integrity, source-identity or package-completeness blocker found. The previously uncompiled app source now has actual hosted compilation/linking evidence, and the 37 declared library tests have actual XCTest pass evidence. This does not establish execution of the app's UI/controller/termination paths.

## Provenance and package

- **29/29 SHA256SUMS entries pass**, with exact file coverage and no duplicate/missing evidence files.
- **1,749/1,749 source files** match the exact Git commit's raw blob bytes, modes and paths. This Mac artifact has raw Git byte identity; no Windows-style line-ending normalization was needed. PAX comment identifies the exact commit.
- The **27 macOS source files** are included. `apps/macos/CompanionDesktop` tree **`f7321f7d8f213f5c14f57f6a9b89fe627d0eb15f`** exactly matches reviewed source **d258856abbf621613fa3ed8a049cb34101924112**. Environment-recorded source/script/workflow/pyproject/lock object IDs all match the audited commit.
- Hosted toolchain: **macOS 26.6.2 (25G83)**, **Xcode 26.6 (17F113)**, **Apple Swift 6.3.3**, arm64 target. Package manifest retains Swift tools 6.0, Swift language mode 5 and minimum macOS 15. No external Swift package dependency is declared.
- Build log explicitly compiles DesktopCapture and CompanionDesktop, links the executable, and reports **`Build of product 'CompanionDesktop' complete! (30.84s)`**. Packager plist lint reports OK. The executable target manifest includes all six actual app sources, including InkController, InkViews and AppDelegate's source file.
- ZIP CRC passes. Complete minimal bundle has `Contents/Info.plist` and executable `Contents/MacOS/CompanionDesktop` (mode 100755), plus directory entries. Plist matches source exactly and names CompanionDesktop as the executable, minimum macOS 15.0.
- Actual binary is **Mach-O 64-bit arm64 executable**, **1,713,056 bytes**, deployment **15.0.0**, SDK **26.5.0**. Its linked libraries are Apple system frameworks and `/usr/lib` Swift/runtime libraries; no omitted project dylib is declared. A linker signature load command is present, consistent with the packager's automatic ad-hoc-signature limitation; this is not proof of project signing or notarization.

## Actual tests and synthetic validator

- Tests.log contains **37 distinct XCTest starts and 37 matching passes**, exactly matching the archived test method names. Final XCTest result: **37 tests, 0 failures (0 unexpected)**, 0.409 seconds test time (0.417 seconds all-suite wall time). The separate Swift Testing footer saying **0 tests** is a different runner, not the XCTest count.
- All **10 InkTests** actually passed, including sparse erase, pinned A→B crop, conflict reopen, and unsaved save/export/discard holder cases. Three reader negative tests ran: altered/escaping/unreadable originals, symlinks, and recognized events missing payloads.
- The test target depends on **DesktopCapture only**. These successes execute library code; they do **not** execute AppDelegate/applicationShouldTerminate, InkController, CaptureController, NSAlert/NSOpenPanel, native pointer routing or screen-permission UI.
- Hosted ingress sample validator logged **82 PASS lines**, **0 FAIL**, ending `all desktop ingress fixture checks passed`. Fixture includes **25 actual Swift refusal cases**, including **ink_overlay_scope**, and **20 logged request-mutation refusals**. The new scope refusal explicitly says no released 0.2.7 scope represents unknown overlay inclusion and retained originals stay unchanged.
- Basic recorder fixture contains actual generated retained samples **1 and 4**, two 4×2 PNGs, eight events, and a blank gap. Ingress fixture contains actual generated samples **1, 3 and 6**, three 4×2 PNGs, ten events, and gaps **blank / complete_without_image / missing / no_callbacks**.
- Independently recomputed each fixture PNG's SHA-256 and byte count, checked signature/IHDR dimensions against its frame record, and reconciled kept-frame counts and byte totals with status. Stop reason is user_stop, pixelsCurrent is false and post-end admitted callbacks remain absent. Sample 3 retains **UInt64.max = 18446744073709551615** exactly. This audit did not launch ImageIO/Swift or claim a new native image-decode test.
- The emitted framed request has 3 frames/3 records, frameless request 0 frames/4 records, mixed request 3 frames/8 records. Frameless gaps have no invented artifacts. The fixture manifest explicitly labels everything **synthetic session, identities and display source; real Swift recorder, FrameStore PNGs and mapper output; nothing sent**.

The successful framed synthetic mapping uses the existing representable fixture scope. It does not override the new live ink-session scope's explicit refusal or prove the live app is connected to backend/provider.

## Hashes and reproducibility

| Item | SHA-256 |
| --- | --- |
| source.tar.gz | `d2b885e73aede2898f6d3916dff2dcee1ef339e0d96b976adf46635cda58383a` |
| MacDesktop.zip | `137526292b9a2ae5c8b49fb412c6a498c2d668c4b7da0af87fd33d6792e36825` |
| CompanionDesktop executable | `ab36d771bab402347ad34e0360dbc45ef14fd1779a8ad41862185ec746646479` |
| SHA256SUMS | `21746f5ba0f30f0a2e577c3035af64310439fb7cd35e10f14fc328bf702bc869` |

Machine evidence: `/tmp/lc-macos-36725613633-audit.json`; standalone checker: `/tmp/lc-macos-36725613633-audit.py`; log: `/tmp/lc-macos-36725613633-audit.log`.

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /tmp/lc-macos-36725613633-audit.py
```

The checker reads downloaded originals and Git, inspects tar/ZIP/Mach-O bytes without extracting or executing the app, and writes only `/tmp` audit outputs. No tests or old artifact campaigns were rerun. No source/worker/main changes, native desktop, DB, provider, service, network research, install or Chats occurred.

Result.json reports **checks-completed / complete / exit 0** and explicitly retains **interactive_runtime_verified=false**, **provider_verified=false**, **project_signing_performed=false**. Actual Quit-alert handling, native capture/pen/panel behavior, scope composition, physical hardware, real AI, audio, Notability and full product acceptance remain unverified.
