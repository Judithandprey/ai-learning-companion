# QA-IOS-01 H1 correction delta review

Recommendation: **INTEGRATE** `259dcf6b9c8d9f5cfb5c71a3ed97a2e05247e085` on
`ca639af834605e71feaea3089de6ed9aedb9e291`. H1 is closed; no new blocker found in
this correction. Main at review entry: `c21e1c2b5891a64b42015f2c7939b6d67ab002e7`.

Only the correction diff was reviewed: check.py/lib.sh/run.sh, four added tests,
README and QA evidence. No repeat of the original native/platform review.
PONYTAIL LITE/current workflow apply; no product/native change is introduced.

The checker now records non-object JSON as an ordinary FAIL. Unexpected exceptions
become a FAIL and exit 2. The shell wrapper preserves nonzero command status and
writes a failure marker that survives subshells. Direct calls retain a shell flag;
run.sh's SHA command substitutions also set the parent flag on failure. Every
normal/setup exit uses finish(), which preserves summary failure and independently
forces failure from the flag/marker. This addresses the original exception-to-green
path without stopping all later phases.

## Actual focused results

Isolated archive: `/tmp/qa-ios-01-correction-2txyqk7k`, extracted with Python stdlib
tarfile from `git archive 259dcf6b9c8d9f5cfb5c71a3ed97a2e05247e085 tests/e2e/ios`.

Commands from that directory:

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider tests/e2e/ios/test_qa_ios_01_check.py
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /tmp/qa-ios-01-correction-probe.py /tmp/qa-ios-01-correction-2txyqk7k
```

**10 passed in 0.97s.** The preserved additional delta probe retests the original
setup-PASS → JSON-null envelope → summary sequence and actual lib.sh failure paths:

| Probe | Result |
| --- | --- |
| Original JSON-null envelope after PASS | Envelope records FAIL; summary exit 1, PASS 1 / FAIL 1 |
| Unexpected directory-read failure in command substitution | Final exit 1, PASS 1 / FAIL 2 |
| Direct checker failure with both FAIL log and marker unwritable | Final exit 1 even after restoring the good log |
| SHA substitution failure with both error writes unwritable, using actual parent guard | Final exit 1 even after restoring the good log |
| pick-sim crash in process substitution/pipeline | Final exit 1, PASS 1 / FAIL 2 |

In the intentionally unwritable-log cases the restored JSON summary contains only
the earlier PASS, but finish() correctly returns 1 and stderr explicitly says the
run is not a pass. CI must retain the final step exit status and stderr, as the
existing invocation requires; summary counts alone are not the run conclusion.

Probe: `/tmp/qa-ios-01-correction-probe.py`.
Exact per-case shell fragments/stdout/stderr/summaries:
`/tmp/qa-ios-01-correction-evidence-rjcl8l9q/`.

No main/worker writes, network, hosted execution, platform calls or native tests.
Root retains the exact integrated-main ten-test run and CI check of `6ab5d22`;
actual macOS/Simulator execution remains the next evidence boundary.
