# QA-IOS-01 harness integration review

Recommendation: **HOLD for one narrow checker-error propagation correction**,
then integrate and let Support wire the actual invocation into the existing
ios-probe workflow. No production change or new testing framework is needed.

Reviewed delivery `ca639af834605e71feaea3089de6ed9aedb9e291` against main
`b494fdf4b0d506f8bb4b7b0d7775eb8c95b9cd55`. Native candidate is
`833a2a63a8bf8442b411ec71133081a9fbe1e43c`; its CompanionInk app tree and main's
both equal `030259dea2fa26c0fdbd1552b26f645c2864ff3d`. The hosted build/run evidence
in QA's report was read, not independently rerun or queried in this review.

Read the current workflow/QA card, harness README, shell runner, Python checker,
all XCTest/project/scheme files, six Python tests and the directly exercised native
page/store flow. Applied PONYTAIL LITE and the affected-clause refresh rule, retaining
R46–48/A26–28 and honest A45 fallback limits. No broad design review was repeated.

## H1 — A required host check can crash and disappear from a passing summary

`tests/e2e/ios/qa_ios_01/run.sh:13` uses `set -uo pipefail` intentionally to continue
phases, but `check()` at line 29 only returns the Python process status. Its callers
generally do not handle that nonzero status. `check.py` summary checks only logged
FAIL/PASS rows; it has no knowledge that a required command failed before logging.

Concrete reproduction: a saved envelope containing valid JSON `null` reaches
`envelope_problems`' unguarded `data.get(...)`, raises AttributeError, and appends no
row. After a setup PASS, summary exits successfully despite the failed envelope
check. Similar uncaught PNG/manifest exceptions share this runner error path;
no additional adversarial campaign was run.

Observed from the preserved one-probe script:

```text
setup_exit=0
envelope_exit=1
envelope_error=AttributeError: 'NoneType' object has no attribute 'get'
summary_exit=0
summary_counts={'PASS': 1, 'FAIL': 0, 'NOT_RUN': 0}
```

Minimum fix: central `check()` wrapper records unexpected checker-command failures
as FAIL while allowing subsequent phases to run; retain an error flag/file that
forces the final exit nonzero even if recording the FAIL itself fails. Remember
that `check sha`/`check pick-sim` also run in command substitutions/subshells, so a
shell variable set there alone will not reach the parent. Keep ordinary explicit
FAIL rows and summary behavior. A single focused regression should cover this
actual exception-to-final-status path; no generic orchestration layer is needed.

## Other integration conclusions

- Resource ownership is bounded: creates one simulator, operates on its returned
  UDID/data container, and shuts down/deletes only that simulator via EXIT trap.
  Filesystem fault injection stays in that disposable app's container. No blanket
  simulator deletion or app source mutation is present.
- Simulator target/fallback is recorded and deviations become NOT_RUN. Actual
  `simctl` runtime metadata, Xcode build and standalone UI-runner behavior remain
  first hosted-run evidence; no speculative platform-key blocker is asserted.
- Artifact mode extracts and installs the supplied app, without rebuilding it.
  It records ZIP SHA-256 and checkout/app tree. The runner does not authenticate an
  arbitrary ZIP's provenance: Support must download the exact same-run simulator
  artifact, as README requires, and retain its build/source/hash linkage. For the
  existing matrix, `needs: companionink` refers to the job (both lanes), not a
  separately addressable matrix-lane job ID. This is normal CI wiring, not a
  harness redesign.
- Xcode phase failures/zero tests are recorded FAIL; phase success requires one
  passed test. Required missing screenshot comparisons record FAIL. H1 closes the
  remaining unexpected-checker-error hole. Keep upload `if: always()` and visible
  nonzero exit; do not mask failures with continue-on-error.
- The checks exercise actual GUI touch actions, save/reopen/edit/erase and byte
  preservation with page context. Screenshot comparison and restored-stroke
  editing go beyond a mere file-exists check. Their tolerances and attachment
  format still need actual hosted execution. Envelope checks are structural;
  PencilKit decode/editability is exercised by the app GUI rather than Python.
- Claims remain correctly bounded: finger-touch Simulator, bundled owned page,
  honest AI-unavailable message. Physical Pencil, iPad install, actual Airplane
  Mode, live course overlay, AI reception and Notability are not passed. Static
  absence of app networking is not a physical Airplane Mode test.

## Exact local evidence

Isolated directory: `/tmp/qa-ios-01-review-yhkyzzfv`, populated with stdlib tarfile
from these read-only archives:

```sh
git archive b494fdf4b0d506f8bb4b7b0d7775eb8c95b9cd55 apps/ios/CompanionInk.swiftpm
git archive ca639af834605e71feaea3089de6ed9aedb9e291 tests/e2e/ios
```

Executed from that isolated directory:

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider tests/e2e/ios/test_qa_ios_01_check.py
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /tmp/qa-ios-01-check-error-probe.py /tmp/qa-ios-01-review-yhkyzzfv
```

Existing tests: **6 passed in 0.41s**. One additional probe was explicitly requested
by root after inspection and confirmed H1. Probe:
`/tmp/qa-ios-01-check-error-probe.py`; output/checks/summary:
`/tmp/qa-ios-01-check-error-7g1bhqhv/`.

No Mac/Simulator/device, hosted run, network, provider or native Chats call.
No main/worker writes. Main already had a concurrent `docs/tasks.md` edit at entry;
it was preserved and the committed task card was used for the review.
