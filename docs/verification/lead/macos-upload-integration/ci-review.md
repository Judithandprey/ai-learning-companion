# Mac upload fixture CI wiring review

**APPROVE. No blocking finding in the three-file working diff.** Read the complete diff and surrounding failure/collection paths against HEAD `11e65fc3a4a038c204f327134df44c7be43d9d89`. No source or test changes made by reviewer.

- The new `COMPANION_DESKTOP_MAC_UPLOAD_FIXTURE_DIR` value is quoted and points outside excluded build work. The script does not create that child directory first, preserving the XCTest's requirement for a previously nonexistent output directory. It accompanies the four existing fixture variables on the same release `swift test` invocation.
- After successful tests and existing fixture validators, `checks/validate_mac_upload.py` runs from the extracted committed Mac package, using the pinned root `.venv/bin/python`. The checker imports contracts from the committed snapshot; no simulated fixture is substituted. Missing/bad output or checker failure remains nonzero under `set -euo pipefail`/`run_logged` and is logged as phase `mac-upload-fixture`.
- A Swift test failure stops before checker invocation. Already emitted new fixture files remain outside `work`; the EXIT handler records failed state/phase/code and recursively hashes `macos-upload-fixture`, including nested exchange bodies and native session content. Existing fixture families stay collected. Package creation precedes tests, so available package/log/source/partial-fixture evidence survives failure.
- Workflow `always()` upload now explicitly includes `macos-upload-fixture/**`, with `work/**` still excluded. Main-only manual dispatch, platform choice, immutable action pins, permissions and runner selection are unchanged. A macOS-only dispatch stays macOS-only.
- The three focused orchestration checks in `/tmp/macos-upload-ci-wiring.txt` passed in **3.293 s**: normal owner bundle/fixture flow, missing/bad/checker-error cases, and owner-test failure retention. Source assertions check the nonexisting fixture destination, exact checker/interpreter/path/order, nested hash entries, retained package/log on failure and injected exit37 preservation. These are stub orchestration checks, not Swift or HTTP acceptance. I inspected their log and assertions; did not rerun them.

The exact candidate still needs committed inputs before the script's dirty-input guard will permit the hosted build. Actual native compile,55 XCTest results,new Swift transcript and24 checker checks remain pending; this wiring review grants no product/provider acceptance.

Reviewed file bytes:

| Path | SHA-256 |
| --- | --- |
| `.github/workflows/desktop-checks.yml` | `663705c4969009a3d2a3842a7224ea2946dd3f96baf67da92215fe4dd8538451` |
| `scripts/desktop-checks.sh` | `7333fe2384d8e56595780dcba3e32ccf10e4eb03f5ca73ea7d97cc55bd233963` |
| `tests/probes/support/test_desktop_checks.py` | `ce9c1e5e6a9c315231fe926b5770013d9d1c5eb9d489b9f949c5f656553556e9` |

Read-only diff snapshot: `/tmp/macos-upload-ci-reviewed.patch`. Existing test-log SHA-256: `7b5ec68d4030bc48d70ba8149f5786706fd18e2c3e452133b8f15cb05bf09fd7`. No new tests, native launch, CI dispatch, database/provider operation or repository edit was performed.
