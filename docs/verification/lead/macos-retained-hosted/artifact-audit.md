# macOS retained-frame hosted artifact audit — APPROVE (bounded)

Audited saved workflow **36752548728**, exact pushed source **ef487cfcfaa7110ddb86c339c2065d0b12f21221**, artifact **11115995320** (`desktop-macos-ef487cfcfaa7110ddb86c339c2065d0b12f21221-1`). Saved GitHub receipts report success, job 110014541289 from **2026-09-30 17:36:13Z to 17:38:24Z**. No blocking discrepancy found.

This review read the downloaded evidence and Git objects only. It did not rerun Swift, Python fixture checkers, CI, native applications, capture, services, providers, or any interactive Mac campaign. It made no repository/worker edits and did not extract the app.

## Provenance and coverage

- **62/62** evidence files are listed exactly once in SHA256SUMS and match their SHA-256; coverage is complete, excluding the checksum manifest itself.
- `source.tar.gz` has **2,227/2,227** exact Git blob bytes, paths and executable/symlink modes, with archive commit metadata equal to ef487cfc. This is raw byte equality, without normalization.
- The **33-file** `apps/macos/CompanionDesktop` tree is `db4a4904ce1fa6dc56436e9cf88622362df1fb63`, identical to reviewed correction **49e5b75fe7a0ddda5aa2f82930fa0ea3a6512107**.
- The saved environment's five build input identities exactly match Git: native tree, desktop-checks.sh, workflow, pyproject.toml and uv.lock. All manifest source lists exhaust the corresponding archived Swift targets, including MacRetainedFrames.swift and its tests. Package metadata records Swift language mode 5, macOS 15.0, no package dependencies.
- Source archive SHA-256: `d3987ba8380ccaa67fbefd2b246706b101b9485224f2a8c6d5412d85231cb67d`.
- MacDesktop.zip SHA-256: `9f0f786836e39bc67dfe3675400e3a23ecffcba5cd1980e7a259d10e2627fd15`.

## Actual native build and tests

The executable build log reports compilation of DesktopCapture and CompanionDesktop, linking CompanionDesktop, and successful product completion in **39.07 s**. The ZIP passes CRC inspection and contains the complete development bundle: executable `CompanionDesktop.app/Contents/MacOS/CompanionDesktop` and exact source Info.plist. The executable is **2,120,384 bytes**, executable-mode **arm64 Mach-O**, minimum OS **15.0**, SDK **26.5**; inspected dependencies are platform/Swift runtime libraries. Binary SHA-256: `53bf7f950ac6bd3fc55a03e4405424baa75e4cce9aae9bbddb974996a03a03bc`.

Toolchain log: **macOS 26.6.2**, **Xcode 26.6**, **Apple Swift 6.3.3**, arm64 target. These records establish a hosted executable build and packaged product, not a reproducible-build proof from binary bytes alone or successful UI launch.

The log contains **44 distinct XCTest starts and 44 passes, 0 failures**, matching every test declaration in exact source: DesktopCaptureTests 20, DesktopIngressTests 7, InkCompositionTests 5, InkTests 10, MacRetainedFramesTests 2. Full-suite summary is 0.497 s test time / 0.509 s elapsed. The separate Swift Testing footer says **0 tests** and is not substituted for the XCTest count.

Both new mapper tests actually passed:

- `testMapsEveryRetainedOutcomeToMacFrameMetadata` emitted the native session, mappings and **42 Swift refusal results**, including `jpeg_bytes_helper`, `raw_jpeg_as_png`, and `composed_jpeg_as_png`. Each of the three JPEG results has its expected format-specific PNG refusal in both manifest and checker log; exact-source helpers exercise ImageIO-generated JPEG bytes with updated hashes/lengths.
- `testIncompleteSessionsNeverImplyEmptyInkOrLiveState` includes the paired-ending regression: original status and changed event ending remain represented, and disagreements on reason/detail/live_ended_host are named. Its exact-source assertions ran in the passing XCTest. Its edited scratch conflict session is **not a separately exported fixture**, so the evidence is the native test result plus source, not an independently re-read conflict artifact.

## Emitted fixtures and checker evidence

Counts below are derived from actual saved logs and manifests; checker PASS lines are not additional XCTest cases.

| Family | Checker PASS / FAIL | Native output / rejection evidence |
| --- | --- | --- |
| Released ingress | **83 / 0** | 3 request cases, **26 native refusals**, 20 logged Python refusal mutations |
| Composed frames | **27 / 0** | 3 positive checks, **24 negative controls** |
| Retained Mac frames | **254 / 0** | **2 mapping cases, 42 native refusals**, 166 logged Python refusal mutations |

Each checker has its successful final summary. All native refusal names exactly match the corresponding saved checker lines; every recorded reason contains its nonempty expected refusal, without an unexpected-error or NOT REFUSED substitute. Other retained-checker PASS lines cover acceptance, native record correspondence, unrepresented facts and completeness; they are not counted as extra native refusals.

All four retained fixture families remain present. Their **29 physical PNG files** match event SHA-256, byte length, PNG signature/IHDR dimensions, and status byte/frame counters. This audit did not repeat the older full pixel-decoding/geometry mutation campaign.

- Base fixture: kept callbacks **1, 4**, 2 PNGs, blank gap.
- Released ingress fixture: kept callbacks **1, 3, 6**, 3 PNGs; blank, complete_without_image, missing and no_callbacks gaps.
- Existing composed fixture: 7 kept, 6 composed, 1 refused, 12 physical PNGs.
- New retained fixture: **8 kept**, **6 composed**, **1 explicitly refused**, **1 missing outcome represented as unknown**; 8 raw PNGs + 4 separate composed PNGs, all **200×100**. First two compositions alias their raw files; remaining four use separate composed files.

Both new mappings describe all eight callbacks. The second varies the alias binding, preserving two artifact references to the same raw PNG. The audit independently compared each mapped source/incarnation, native session, callback identity, original binding/hash/length, native filename/geometry, raw-to-composed relation, clocks, composition outcome, revision, commit time, visible stroke IDs, document identity, mapping/rendering text and limits with the saved native records/files. No mismatch was found.

Composition revisions are **null, 0, 1, 2, 2, 2**; callback 5 retains callback-admission timing with unknown source time, and reopened revision 2 at callback 6 retains a null commit time and its limitation. All descriptors retain null captured_at, media_position, pixel_orientation and capture_latency_ms. Original editable ink exists at the named session path (SHA-256 `3f0cc85ae93fef3140028762dcb30633ed5db4768e358df0cd6630e74ffdbb25`). The output explicitly says its document path/revision is not an immutable editable-original binding.

The new native fixture intentionally has no recorded ending. Both mappings preserve that uncertainty, callback 8's missing outcome, configured/unverified capture filter, editable-ink limitations and retained counts in five unrepresented statements. The status file's `pixelsCurrent: true` is a synthetic recorder state, **not** proof of a live screen or a live descriptor.

New manifest SHA-256: `baa2d8e188cd253043b11a094807af98dd777dc4ab6b1474ab4c175d44101c56`.

## Limits and reproduction

The fixture labels explicitly identify synthetic session pixels, identities, bindings and display source, with real Swift recorder/composer/FrameStore/mapper output and nothing sent. This approves **hosted native compilation, focused native library tests, fixture validation and package provenance**. AppKit interaction, physical pen/capture, actual cross-app exclusion, live AI/context delivery, provider behavior, signing/notarization and full product acceptance remain unverified. Result flags correctly keep interactive_runtime_verified, provider_verified and project_signing_performed false. A linker signature is not project signing.

The outer GitHub artifact ZIP service digest is preserved from the receipt, not independently recomputed from the downloaded directory. The inner source/package and every downloaded evidence file were independently hashed.

Reproduce the same read-only audit with existing local files:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 /tmp/macos-retained-36752548728-audit.py
```

Machine evidence: `/tmp/macos-retained-36752548728-audit.json`; concise execution log: `/tmp/macos-retained-36752548728-audit.log`. The audit completed with exit 0 and no anomalies. A first local audit attempt encountered an older fixture omitting zero-valued composition counters; the audit reader was adapted to those optional fields and rerun, without changing any downloaded evidence. No native test rerun occurred.
