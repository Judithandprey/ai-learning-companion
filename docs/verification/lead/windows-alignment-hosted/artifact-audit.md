# Windows hosted artifact audit — APPROVE bounded evidence

Run **36735587145**, source **`55478f04cab0da3785718469ed69ac8f4e413d1f`**, artifact **11106982186**. Downloaded evidence: `/tmp/lc-windows-36735587145` and the accompanying `-run.json` / `-artifacts.json` receipts.

No checksum, source provenance or static package-closure blocker found. This audits existing hosted evidence; no CI, build, test suite or application was rerun.

- **Run binding:** downloaded GitHub receipts show the exact SHA on `main`, completed/success, one successful `desktop (windows)` job, successful packaging/upload steps and attempt 1. Artifact name, run ID and SHA agree. Result is `checks-completed`, `last_phase=complete`, exit 0. The external receipt was read locally, without a fresh API request.
- **Evidence integrity:** **13/13 SHA256SUMS entries pass**, with exact file coverage and no duplicates. ZIP CRC passes for all **109 files**; archive and ZIP members have safe, unique paths.
- **Exact source:** source PAX commit is the requested SHA. All **1,842 Git files**, types and modes are accounted for, including **41 Windows files**. **412** files match raw Git blob bytes; **1,430** differ only by LF→CRLF conversion. No other byte difference. A read-only `git -c core.autocrlf=true archive --format=tar 55478f04cab0da3785718469ed69ac8f4e413d1f` reproduces every member's bytes, name, mode and type. The runner's actual autocrlf setting was not directly logged; do not describe all downloaded bytes as raw-blob identical.
- **Build inputs:** all five environment-recorded Git object IDs match the exact commit. Windows tree `9620eb8ec9a7828d1ff4b69946a1bdb789a15563` equals the integrated alignment/counter correction `c753c23308f1110504c1a3b969306182c0a91422`; sibling ink/mode sources are included. Hosted metadata records Node **24.21.0**, Electron **44.5.1**, TypeScript **7.0.2**, Windows x64. Build log records `tsc -p tsconfig.json && node scripts/copy-static.mjs`, including all eight static/preload copies.
- **Application closure:** **36 application files** comprise **27 emitted JS files**, **8 exact-snapshot static/preload assets**, and exact package.json. Emitted JS paths exhaust the corresponding TypeScript sources. The main entry, both preloads, control/overlay/probe assets and reused sibling modules are present. All statically enumerated imports across **16 non-test JS/CJS modules** and HTML asset links resolve; external imports are Electron or Node built-ins. Emitted output contains the conservative local-change alignment, last-seen cap counter, eight-context limit, retained-history paths, and corrected mapper's `external_app` surface. This is static closure inspection, not an independent rebuild or behavior proof.
- **Runtime closure:** **73 Electron runtime files**, including **55 locales**, match every name and SHA-256 of previously audited run 36713802500. The executable is PE32+ x64 (`0x8664`), **245,726,208 bytes**, with RT_VERSION file/product **44.5.1.0**. CLI/version-file/package metadata agree.
- **Actual test log:** **85 unique named passes**, matching all **85 test declarations across 9 exact-source test files**; **0 failures, cancelled, skipped or todo**, duration **7271.9122 ms**. Counts by file: frame-ingress 20; main-lifecycle 13; overlay-alignment 5; overlay-capture 4; overlay-frames 4; overlay-stop 5; retention-correction 15; retention 5; shared 14. Included names cover formula/sign/digit changes, unchanged controls, conservative pointer motion, beyond-cap repeat/return counts, below-cap behavior, Stop/recovery, and mapper corruption controls. These source-based Node/harness tests are not interactive Windows or physical-pen QA.

## Hashes

| Evidence | SHA-256 |
| --- | --- |
| WindowsDesktop.zip | `965ea51c79f9d8d245d66a1e2565026cf5e16cf96e57c34394da13c8367eccfa` |
| source.tar.gz | `60d9e011b421bbffe705403f9367743e0a24b3b6000248fb4b88e20388663d22` |
| tests.log | `cd2b41676c674d18b7dc490e8f5eb95f1af27c14d6d5f7f9812bb22597156416` |
| electron.exe | `49b61a030a520fc36a4b8fa5cce53fb4e935a7bdbbe4b80e9222f598e49cc7fa` |

Machine receipt: `/tmp/windows-alignment-hosted-audit.json`. Reusable checker: `/tmp/windows-alignment-hosted-audit.py`; execution log: `/tmp/windows-alignment-hosted-audit.log`. Exact archive reproduction: `/tmp/lc-windows-36735587145-autocrlf.tar`.

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /tmp/windows-alignment-hosted-audit.py
```

The checker adapts the existing retention-hosted audit, reads Git and downloaded artifacts, and writes only `/tmp` audit/reproduction files. Final result: **no anomalies**. All earlier reports and main/worker files are preserved.

**Limits:** the outer GitHub download ZIP is not retained, so its API digest `8c3518c03bfe0ddf07588c662b8d088813837183dfee44d9c26d58b35c7b52c3` is recorded but not independently recomputed; the extracted evidence and inner WindowsDesktop.zip hashes are fully checked. Empty snapshot/package logs are expected from the exact script, not standalone proof. `interactive_runtime_verified`, `provider_verified` and `project_signing_performed` remain **false**. No actual display/capture/input, real AI, signing, independent interactive QA, or full-product acceptance follows. Lead/QA own the next exact-artifact operational retest.
