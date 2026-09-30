# macOS composed hosted artifact audit — APPROVE bounded evidence

Run **36737163642**, exact source **`5f80c0926f96d3afdb8da7a00c295b4f4e8fdd63`**, artifact **11108395236**, downloaded at `/tmp/lc-macos-36737163642`. No integrity, source-identity, package-closure or retained-fixture blocker found. This audits the existing successful run; no CI, build, tests, owner validator or native application was rerun.

## Provenance and package

- Downloaded GitHub receipts identify the exact SHA on `main`, attempt 1, one completed/successful `desktop (macos)` job, and successful build/package/upload steps. Artifact identity agrees. Result is `checks-completed / complete / exit 0`.
- **45/45 SHA256SUMS entries pass**, with complete file coverage and no duplicates, including all three fixture trees. Source PAX comment matches the SHA. All **1,869 source files** match Git's raw bytes, modes and names exactly; no CRLF normalization needed. Includes **30 macOS files**.
- All five environment-recorded source/script/workflow/pyproject/lock Git object IDs match. Native tree **`6322ee7f7be852db807be1f23482190e38fec70f`** equals reviewed `a17f6c1ffe1eb760ee20ec8174578183978399b0`, including prior `1539a7c` plus width/opacity checks. Actual manifest exhausts **14 library, 6 application and 4 test Swift sources**.
- Hosted toolchain: macOS **26.6.2 (25G83)**, Xcode **26.6 (17F113)**, Apple Swift **6.3.3**, arm64. Build log compiles both targets, links CompanionDesktop and reports completion in **32.18 s**; plist lint is OK. No external Swift package dependency.
- ZIP CRC and member safety pass. Minimal bundle contains the exact-source plist and executable (mode **100755**), plus directories. Executable is **Mach-O 64-bit arm64**, **1,928,848 bytes**, minimum **15.0.0**, SDK **26.5.0**. Declared linked libraries are Apple system frameworks/runtime libraries; no omitted project dylib. Linker signature presence does not establish project signing/notarization.

## Actual tests and retained files

- **42 distinct XCTest starts and matching passes**, exactly matching all source test names; **0 failures (0 unexpected)**, 0.733 s tests / 0.747 s all-suite wall time. All **five new composition tests** ran, including the corrected width/opacity assertions. The separate Swift Testing footer's zero tests is a different runner. XCTest depends only on DesktopCapture, so app/controller/UI paths were compiled but were not executed by these tests.
- Composed validator log contains **27 PASS / 0 FAIL: 3 positive checks plus 24 negative controls**, ending `all composed fixture checks passed`. Controls explicitly include collapsed 1-pixel strokes and transparent ink. These are actual hosted results, not a rerun of simulated fixtures here.
- Actual Swift-generated composed session has **17 events**, **7 kept raw PNGs**, **6 composition outcomes** and **1 explicit geometry refusal** for sequence 7. Each kept raw has one outcome before `ended`. Revisions are **0,1,2,3,4,4**, with visible IDs `[]`, `[s1]`, `[s2,s3]`, `[s1]`, `[s2,s3]`, `[s2,s3]`. Sequence 1 aliases the exact raw file/hash/length; only five additional PNG files exist.
- Independently checked all file hashes/lengths and decoded the **12 actual 200×100 RGBA8 PNGs**, using standard-library PNG chunk CRC, zlib and filter reconstruction. All seven raw images remain identical opaque gray. Composed images contain opaque sRGB red at top-side stroke locations; off-centre interior rows confirm width, the erased middle is gray, undo restores it, redo removes it, and lower/mirror/background locations remain raw. Undo/redo equivalent decoded images match exactly. This is a saved-byte audit, not a native renderer rerun or live-capture result.
- Saved editable `ink.json` preserves original **s1**, derived **s2/s3** with parent s1, and **mode → stroke → erase → undo → redo** history. Independent replay against each frame time agrees with its revision, visible IDs and commit time. Created-in session, document filename and display bind correctly. Source-time frames and explicit callback-admission fallback remain distinct; composedHost **107** is separate. Raw bytes **4,970**, additional composed bytes **5,034** reconcile with status. Stop is `user_stop`, pixelsCurrent=false, no callbacks after end, and both write-failure counters are zero.
- Existing basic fixture retains samples **1/4**; ingress fixture retains **1/3/6**, exact **UInt64.max**, and blank / complete_without_image / missing / no_callbacks gaps. Its request sizes remain **3 frames/3 records**, **0/4**, **3/8**. Ingress validator logs **83 PASS / 0 FAIL**, with **26 Swift refusal cases**, including the new **app_excluded_scope** refusal. That refusal explicitly preserves the closed released 0.2.7 scope; the older representable synthetic ingress does not make composed live sessions transportable.

## Boundaries and reproducibility

Scope/ink records explicitly retain **unverified on a Mac**, unknown source-time fallback, uncommitted-stroke exclusion and screen-fixed-only limits. Fixture pixels, times, source identities and pen events are synthetic, generated by real Swift library code. No real screen exclusion, native input/Stop/Quit controller execution, provider receipt, physical pen, audio, Notability or either §7.1 gate is established. Result flags `interactive_runtime_verified`, `provider_verified`, `project_signing_performed` remain **false**. The separately reviewed crash-journal/storage limits are not closed by a successful fixture.

| Item | SHA-256 |
| --- | --- |
| source.tar.gz | `147d682aa7c9329a74ee6e8c9c91094a434911355096756af75eb3396bbaa350` |
| MacDesktop.zip | `a882883cbeb72e2aff41ae8081472c76c0e9bf7d97bfdfb6e29f77696857530c` |
| executable | `00d44eb04b9867806c322a5f6099aa3dc31302d0be4da836740169a9b65b821f` |
| composed-fixture.log | `8508a20f61468f4448e7e4a700971ad20cd96cd95855eaf3f11414c4e719158e` |

Machine receipt `/tmp/macos-composed-hosted-audit.json`; checker `/tmp/macos-composed-hosted-audit.py`; log `/tmp/macos-composed-hosted-audit.log`. Final result: **no anomalies**.

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /tmp/macos-composed-hosted-audit.py
```

Adapted the existing macos-ink-hosted audit; reads downloaded files and Git, writes only `/tmp` receipts. No repository/worker changes, network, service, provider, UI launch or test rerun. The outer GitHub download ZIP is not retained, so its API digest is recorded but not independently recomputed; extracted evidence and inner package hashes are checked. Next: Lead records this hosted evidence and owns transport integration; QA still needs an interactive Mac for operational acceptance.
