# Support Windows share-lock diagnostic review

**APPROVE** evidence integration and the one bounded hosted diagnostic. No blocking finding. Candidate `d4e6bd1b986653901bc55eb92b36c7b34eeabee1` adds only the seven assigned probe/evidence/proposal files. This is an unresolved test-precondition diagnosis, not an established production uploader fault or verified repair. PONYTAIL LITE applied: existing Node/.NET facilities, no additional framework or dependency.

## Evidence provenance and claims

The final probe SHA-256 is `d7f8a61b9396be0276c07e41edbbc23c2ca7df43a3dd9a4c1656ea46e4069893`, exactly the committed raw Git bytes and final receipt value. Removing TAP comment prefixes yields JSON structurally identical to the saved final JSON. The original test blob at `d49d101cd8d378e57ea54da6cb38fb89b80bb72c` hashes to `d4838fb5112171481badd6ac7a526426ac77e461096a4bf84f4070d2a33df219`. Its PowerShell literal exactly equals the probe's legacy literal (SHA-256 `48fc38f2dbb37119ad42a3d7a05c7dec92cdc390ce07ff96f49c92596ae0b56c`). Pure evaluation of the three script strings confirms all three script hashes in the final receipt; no script was executed.

Both incident-supplied local failed-run originals match the report's hashes: `/tmp/windows-d49d101-job.txt` and `/tmp/desktop-d49d101-run.json`. The retained actual failure is “Missing expected exception” at test line 915, before uploader invocation. It does not establish a production read failure. Earlier diagnostic JSON files carry different probe hashes and are explicitly documented as earlier revisions; they are not used to certify the final source.

The final author-saved native Windows Node 24.19 receipt contains **one passing Node test module, zero failures, three sequential diagnostic arms**, total 1,473.0044 ms. Each arm records open-only and actual-read `EBUSY` immediately and after 150 ms; then exit code 0 after release, no forced kill, and exact synthetic original bytes readable. All three post-release hashes match the 35-byte literal actually written by the final source (`fd3c2810473c07410c9b73ad7efd550f66c3f4fef04d6ef1f5d61c18b14ccf4a`). Traced arms retain held-file path linkage, same-helper .NET sharing violation, release-input/disposal and confirmed child-close events. The final owned-temp removal flag is true. This is coherent **author execution evidence**, not independently rerun Windows evidence and not hosted stock Node 24.21 acceptance.

## Unapplied owner patch

The full proposed `holdUnshared` diff retains the real second-open assertion and uploader/refusal/no-send call path outside the function. Its command remains fixed; only the synthetic file path travels through `LC_HOLD_FILE`. No credential is added. It keeps ReadLine so it does not preselect the unproven raw-stdin hypothesis.

The proposal clears race timers, observes child and all pipe errors, parses an exact readiness line, bounds diagnostic buffers, and makes release idempotent. Release sends the fixed sentinel, waits at most 10 seconds, attempts to kill only its owned child, and observes close for a further bounded 3 seconds. Nonzero/forced/unconfirmed close, missing sentinel and malformed output are test failures, not successful cleanup. Logged phases/error codes are restricted; raw input/environment/error strings are not echoed. Normal release is distinguished from exceptional cleanup. No patch was applied or executed by this review; source inspection cannot prove PowerShell or TypeScript runtime behavior.

The explicit limits are appropriate: an OS refusing termination still requires the outer job/test bound, and parent receipt times on separate streams are not a total order of the child's internal operations. Neither lifecycle hardening nor local passes explain the hosted failure without its new evidence.

## Lead workflow addendum

Read-only approval of `.github/workflows/windows-share-lock-diagnostic.yml`, snapshotted at `/tmp/windows-share-lock-diagnostic-reviewed.yml`, SHA-256 `695e3a9a6055b4622f5a644f239b23349c9fe61f4c0fb53fdf0134e626d4e4a0`:

- Manual `workflow_dispatch`, main-only job, `contents: read`, checkout credentials not persisted. Checkout, setup-node and upload-artifact immutable pins match the existing desktop workflow.
- Exactly one foreground Node probe on `windows-2025`, stock Node 24.21.0, Bash; no npm install, packaging, Mac job, uploader suite, DB or provider operation.
- Quoted runtime environment values, no user-input shell interpolation. Captures actual SHA/run/attempt, executed source hashes, a probe copy, combined stdout/stderr and normal command exit code. Probe's hardcoded `source` labels the legacy baseline; workflow `source.txt` supplies the actual hosted commit.
- Two-minute step and five-minute job bounds, `always()` artifact upload, missing artifact files fail. A killed/timed-out process can yield only partial TAP without `exit-code.txt`; that is failure evidence, never normal success. Windows checkout representation may alter line endings; executed hashes identify actual bytes and must be interpreted accordingly in the later artifact audit.

Machine detail: `/tmp/windows-sharelock-support-review.json`. Exact seven-file export: `/tmp/windows-sharelock-support-d4e6-export`. Only read-only source, hash and JSON checks plus pure script-string evaluation were performed. No test campaign, PowerShell/Windows/GUI/native launch, service/DB/provider call, repository write, Git mutation or application of the proposal occurred.
