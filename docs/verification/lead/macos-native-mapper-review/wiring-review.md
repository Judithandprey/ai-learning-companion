# APPROVE — scoped native mapper fixture wiring

Reviewed the current dirty diff in only:

- `scripts/desktop-checks.sh`
- `.github/workflows/desktop-checks.yml`
- `tests/probes/support/test_desktop_checks.py`

The captured baseline HEAD is `f9b2eca23e92bbee01b9a2cd49bd82925ca5074e`. Exact dirty-file hashes and the reviewed diff are saved alongside this report as `/tmp/macos-native-mapper-wiring-review.json` and `/tmp/macos-native-mapper-wiring-review.diff`.

No new blocker was found in these three files. This approval covers orchestration only. Native owner candidate `df581e8a1d49725c966fdacd0d8e45bcbb9aeb4d` remains independently reviewed; this report does not approve its mapper/checker semantics, claim it is integrated, or establish Swift/native execution evidence.

## Interface and evidence handling

**Fresh fixture directory:** `scripts/desktop-checks.sh:217–221` passes the exact `COMPANION_DESKTOP_MAC_FRAME_FIXTURE_DIR` environment variable and the absolute `$out/macos-retained-frame-fixture` path to the release Swift test invocation. The script creates only the parent evidence directory. The new child is not pre-created. This agrees with `df581e8`'s `MacRetainedFramesTests.swift:145–153`, which refuses an existing output directory and writes its native session beneath `native/`. The native test writes `manifest.json` at that output root (lines 256–275). Its test teardown removes the separate per-test temporary `root`, not the explicitly supplied retained output directory. The fake Swift tool's assertion at `test_desktop_checks.py:107–115` faithfully checks the new-directory precondition.

**Exact checker/source/interpreter:** `desktop-checks.sh:244` calls the owner's actual `checks/validate_mac_retained_frames.py` from the archived native source directory, after Swift and the two older validators. The complete Git archive is pinned to recorded HEAD (`:23`, `:93–115`); dirty relevant build inputs are rejected. The checker is not sourced from a mutable worker path or fetched at runtime. The Mac interpreter is forced to the root `.venv/bin/python` (`:14`), whose locked base dependencies are established by workflow `uv sync --frozen --no-dev` with the selected Python 3.12 (`desktop-checks.yml:43–56`). The owner checker inserts the archived repository root derived from its own `__file__`, so the released contract imports come from that same committed archive. The source SHA is the eventual integrated build HEAD, not a hard-coded assumption that `df581e8` is already present. The positive fake-tool assertions check interpreter, exact archived checker path, argument and ordering (`test_desktop_checks.py:484–493`).

**Failure propagation:** Existing `set -euo pipefail`, `run_logged` and the EXIT trap retain a nonzero tool result through `tee`; the new validator is an ordinary mandatory stage with no catch/ignore path. Missing/bad fixture and injected validator exit 31 are covered by the new negative cases (`test_desktop_checks.py:495–511`). Swift failure remains the `tests` phase and prevents downstream validators; no successful checker result is invented after a failed Swift run (`:586–607`). The existing result JSON keeps interactive runtime/provider verification false.

**Artifacts after failure:** The native fixture is outside the excluded build work directory. The EXIT handler adds its complete recursive files to `SHA256SUMS` (`desktop-checks.sh:45–57`) even if Swift or a later validator fails; logs and the already-created Mac app ZIP remain available. Workflow upload runs under `if: always()` and explicitly includes `macos-retained-frame-fixture/**`, preserving the existing `work/**` exclusion (`desktop-checks.yml:66–78`). The negative tests check saved fixture hashes and app/log survival. This preserves files that were actually emitted; it does not guarantee an unwritten manifest if native execution fails before writing it.

## Review method and limits

Applied project PONYTAIL LITE: reused the existing wrapper, real owner checker, exit handling and artifact mechanism; no new dependency or extra orchestration layer. Read the full wrapper/workflow and actual test setup/calls/failure assertions, and read the exact owner candidate's output-directory/checker import/CLI boundaries via `git show`. Root/worker files were not edited.

Root reported **22 orchestration tests passing in 10.859s**, plus `bash -n` and diff checks. These are root-observed results. I did not rerun the same suite because the bounded review exposed no additional concern requiring repetition. Its fake OS/Swift/checker tools verify orchestration, interpreter selection and failure behavior; they do not verify released-contract semantics, compile Swift, obtain actual native fixture bytes, connect a provider, exercise screen permission or satisfy desktop product acceptance.

Next action: retain this wiring with the independently approved owner source, then perform the separately planned exact integrated hosted build and inspect the real emitted fixture/checker output. No source correction is requested by this review.
