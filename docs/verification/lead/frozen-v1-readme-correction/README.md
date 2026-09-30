# Frozen v1 README compatibility correction

Exact main `b08e26e6afd139623e4498377dd9fde116acb848` failed [P0 CI 36746600371](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36746600371) in both Python matrices. Each reported **1 failed / 5,524 passed / 20 strict expected failures**. The sole failure was the unchanged `test_v1_contract_bytes_are_frozen_since_the_pre_v2_baseline[packages/contracts/README.md]`. Later generation/TypeScript/Web steps were not reached and are not claimed passed by that run. [Metadata](failed-run.json), [failure lines](failure-summary.txt).

Lead had added Mac-family navigation to the byte-frozen v0.1.0 README. This correction restores that file byte-for-byte from `7fadd151c83118c22a4846bdb8b2622d47bb0df3` and places current Mac 0.2.11/0.2.12 links in the repository README. No production implementation, wire bytes, workflow, test assertion or compatibility exception changes.

The unchanged frozen-v1 check now passes **11 cases / 56 deselected in 0.09s** on the corrected working tree ([output](focused-tests.txt)); `git diff --check` passes. Ordinary push will run the complete existing CI, whose result is recorded separately. This narrow check is not a complete application run or device/provider acceptance.
