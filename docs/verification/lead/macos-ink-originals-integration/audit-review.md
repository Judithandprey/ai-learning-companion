# Prepared Mac immutable-ink artifact audit — reviewed and corrected

**APPROVE for Root to execute the bounded macOS artifact audit.** This approves the audit implementation, not a hosted artifact result. No full audit, build, Swift/native execution or HTTP composition was run here.

Reviewed `docs/verification/lead/macos-ink-originals-integration/artifact-audit.py` against its retained-hosted predecessor and native source `89edd5c`/`35c75a4`. Root subsequently authorized a patch to this file alone, including selection from a two-platform run and explicit handling of a successful Mac job within an overall failed workflow. No other repository files were edited.

The prepared audit retains complete SHA256SUMS coverage, raw Git blob/path/mode and archive SHA comparison, exact reviewed native-tree comparison, package/Mach-O/build-input closure, actual-vs-declared XCTest identities, successful checker logs and refusal receipts. New original checks read the actual immutable JSON, require exact native path/hash/length/source/paired document and revision/history, keep bindings outside the frame wire, account for immutable files/status totals and distinguish unavailable/absent/no-document states. Mutable ink is separately labeled. No source/hash/fixture checks were removed.

## Finding and bounded fix

The original parameterized receipt gate checked artifact.run ID but not the supplied run receipt URL or environment run URL. An exact extracted-gate probe accepted a synthetic `/actions/runs/1` receipt while RUN/artifact named 36752548728. This inherited omission became relevant to explicit metadata inputs. The original probe/log/JSON remain under `/tmp/macos-ink-audit-receipt-probe.*`; they demonstrate that gate only, not a false full-artifact pass.

The patch now:

- Requires the exact project repository/RUN URL in run metadata and a single matching environment `run=` line; binds the selected Mac job URL to that run.
- Reads one valid positive run attempt from the environment and selects exactly one `desktop-macos-<SHA>-<attempt>` artifact, with the same run/SHA/main source and unexpired status. Keeps full `total_count == len(artifacts)` receipt integrity while permitting the Windows artifact.
- Selects exactly one `desktop (macos)` job, requires completed/successful status and both required successful steps; it need not be the first job.
- Requires completed overall status and an overall conclusion of `success` or `failure`. Cancelled/timed-out runs remain refused. An overall failure never overrides Mac-job failures or incomplete artifact checks.
- Preserves raw run metadata and explicitly reports the overall conclusion, whether the whole run succeeded, the selected Mac job and sibling results. Verdict/output state **macOS-only evidence, not an overall workflow gate pass**.

This matches the actual reported disposition of run 36764195464 at `d49d101cd8d378e57ea54da6cb38fb89b80bb72c`: Mac success, Windows failure. No audit acceptance of those downloaded files is claimed here. Failed prior run 36762827375 remains failed and is not substituted.

## Verification

```sh
PYTHONDONTWRITEBYTECODE=1 \
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python \
  /tmp/macos-ink-audit-correction-probes.py
```

**26 extracted-gate cases passed (4 positive, 22 negative), exit 0.** They execute the actual environment/receipt statements via AST over explicit doubles. Positives cover Mac-only, both platforms with Mac second, attempt 2, and Mac success/Windows failure with that failure retained in the result. Negatives cover foreign run/repository/environment/job URLs, duplicate run/invalid attempt, cancelled/timed-out run, missing/duplicate/failed Mac job, failed required step, incomplete listing, missing/duplicate/wrong-attempt/foreign-source/expired Mac artifact, incomplete hosted result and false provider claim. These are gate checks, not native or full artifact checks.

`ast.parse` and `git diff --check` pass. Old prepared source is preserved unchanged at `/tmp/macos-ink-hosted-audit.py` (SHA-256 `4fc694a920b72c9d971b85d0f32e16549e9f9d377e41740a4f520548212b0cae`). Corrected script SHA-256: `102cff7ef3cfe403f4833276f1cd101e3232a2e0b46f872b9b0c5b2895ebb4f7`.

Small exact patch: `/tmp/macos-ink-audit-correction.patch`.
Executable probes, observations and output: `/tmp/macos-ink-audit-correction-probes.{py,json,log}`.

Root next uses the actual downloaded `/tmp/lc-macos-36764195464` and raw receipts, with exact hosted `--commit d49d101cd8d378e57ea54da6cb38fb89b80bb72c` and the reviewed native tree including compile repair `--approved 196d2929dae2002501b509072ec9d7ba8fd8ee14`. Using the older native SHA would correctly fail the full-tree comparison. Root alone runs the full audit and subsequent actual composition. Interactive Mac, provider and whole-product acceptance remain unclaimed.
