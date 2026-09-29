# Stored evidence preparation — combined integration

Backend correction `09669d654fddb76af4be5a38e5c6052160239dbe` and Learning
consumer `cd2533bc09b329db870411dcce7271497ee1ec25` integrate through ordinary
cherry-picks as `dcc6039` and **`65fa1a2`**. Actual native deliveries are
`handoff_58afd26b636b553d5fa3f6adbf52ee56` and
`handoff_6723d6dd2ad532894425bb2d4f46a580`. No branch ancestry, shared schema,
dependency, migration, provider or default service was changed. The separate
held iOS workflow remains uncommitted during this milestone.

The small callable freezes selected stored IDs, obtains currently authorized
coherent metadata, composes exact original/image evidence with existing limits,
then rechecks the same complete metadata selection. This includes frameless and
budget-omitted records. Changed/denied metadata withholds the packet. The two
Backend adapters now propagate standard Future cancellation unchanged instead
of turning it into an ordinary unavailable result; normal errors remain sanitized.

## Review and actual main checks

[Cancellation review](backend-context-cancellation-review.md) preserves the
original eight failures/seven passing controls. Replaying those same 15 probes
with the correction gives **15 passed in 0.94s**, exit 0. The composer aborts at
the first cancellation instead of attempting the second image.

[Consumer review](stored-context-preparation-review.md) reproduces the owner's
unskipped cancellation failure: 40 passed, one failed before the Backend fix.
After that exact fix, all **41 passed in 1.92s**. Six independent additional
selection/source/budget boundary probes also pass. These are independent scratch
checks, not extra main runs.

On integrated main `65fa1a2`:

```sh
env -u LC_DATABASE_URL -u LC_TEST_DATABASE_URL .venv/bin/python -m pytest -q \
  services/api/tests/test_process_context_reader.py \
  services/api/tests/test_image_resolver.py \
  tests/evals/test_stored_process_context.py
```

**190 passed in 17.38s, exit 0.** This exercises synthetic in-process HTTP stored
originals/process records through the actual reader/resolver and new consumer,
current revocation/deletion and metadata changes, complete final rechecks,
historical Stop, cancellation, exact byte retention and detached results.
`git diff --check` passes. No PostgreSQL, browser, listener, provider or device
was run; no completed old DB/Simulator campaign was repeated.

## Remaining outcome and next owner

Preparation proves its last current authorization check, not an atomic future
send/display, provider receipt or live-screen understanding. Actual use still
requires current source/help permission; all `not_attested`, `not_granted` and
`unknown` flags remain. This milestone does not satisfy the two full core gates.

Lead is reviewing actual iOS correction `cb27688` before the existing hosted
native check/unsigned builds. Web continues the one already accepted open-shadow
capture and recoverable-ink correction; QA's conditional next check awaits that
exact corrected integrated SHA. Backend and Learning have completed this bounded
component and remain available for concrete integration defects, without duplicate
tasks. Real product-provider access, target-device signing/install and cross-app
interaction limits remain separate dependencies. User preview/data and Paperclip
were untouched.
