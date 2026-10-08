# Exact admission review — 2026-10-08

**HOLD on `78d6de0f1e1b92113d0829a1f88be6fb84ae96f8`: an option value can be
mistaken for an absolute application operand in both admission predicates.**
QA owns the correction. This is a source review, not approval to run the diagnostic.

Lead release: `handoff_135a4bd2ac6e011fc8453e34e024f09a`; limited native prerequisite
clarification: `handoff_3fbe6d66705e3a91a537fab3a298ed1d`. The final commit includes
`b79d195b77df530b72df943f95188b418af217ba`; comparison baseline is `66c2b43`.
Read exact objects and an isolated `/tmp/support-admission-78d6de0-vo86dg3i` export;
Support's branch and existing work were preserved. Only Support evidence/probes changed.
The [earlier call-graph preparation](../windows-admission-review-20261007.md)
records the affected R03/R35/R36/R59/A44 context. Requirements and role/workflow
files have no delta from that preparation baseline `2d4fee9`.

## Concrete blocker and narrow correction

At this exact revision, `tests/e2e/windows/qa_run_tts_candidate.mjs:85` chooses
`args.slice(1).find(a => !isSwitch(a))`. The saved candidate's
`candidate-admission-20261008/runner.ps1:234` makes the same first-non-switch choice.
That token may be an option's value; it does not establish which app is being run.

The [independent literal-input probe](../../../../tests/probes/support/review_admission_arguments.mjs)
uses the pinned candidate runtime and readable synthetic metadata. Its
[actual output](argument-counterexamples.json) records:

| Synthetic command line | Required boundary | Actual wrapper result |
| --- | --- | --- |
| `electron.exe "C:\Other\Application"` | Unrelated readable absolute app | `null`, control passes |
| `electron.exe .` | Relative app remains relevant | `candidate_runtime_relative_app`, control passes |
| `electron.exe --user-data-dir C:\Other\Profile .` | App operand remains ambiguous/relative | `null`, fails |
| `electron.exe --require C:\Other\preload.cjs .` | App operand remains ambiguous/relative | `null`, fails |
| `electron.exe --user-data-dir C:\Other\Profile` | No unambiguous app established | `null`, fails |

The native code has the same selection and subsequent return path by inspection;
it was **not executed**. These are predicate counterexamples, not observations of
Electron consuming these command lines or proof of an actual stage collision.
They do not reconstruct the discarded first-refusal snapshot.

QA should conservatively require an unambiguous absolute app operand for a
candidate-runtime main process. A small sufficient rule is to require `argv[1]`
itself to be a non-switch absolute path, otherwise return a fixed ambiguity reason.
Preserve the positive same-runtime/different-absolute-app case. Apply the same
rule to JS and emitted native code, add these regressions, regenerate the candidate
and pins, and return a new exact SHA through Lead. No foreign PID exemption or
`AllowForeign` expansion is needed. A separate read-only reviewer independently
confirmed this finding and the unchanged cleanup/surface boundaries.

Reproduce only the offline predicate against an export of the exact commit:

```sh
node --permission --allow-fs-read="$PWD" --allow-fs-read="$REVIEW_EXPORT" \
  tests/probes/support/review_admission_arguments.mjs "$REVIEW_EXPORT"
```

`REVIEW_EXPORT` must contain the exact QA candidate directories and Windows test
sources from `78d6de0`. The probe verifies the wrapper hash before import. Actual
run used Node v24.21.0, no child-process or filesystem-write permission, and exited
**1** because three cases fail the required boundary. It never calls the runner.

## Checks actually completed

| Check | Independent result | Evidence |
| --- | --- | --- |
| Injected wrapper suite | 53 pass, 0 fail | [log](wrapper-checks.txt) |
| Candidate generator suite | 23 pass, 0 fail | [log](generator-checks.txt) |
| Unchanged cleanup suite | 39 pass, 0 fail | [log](cleanup-checks.txt) |
| Additional argument counterexamples | 2 controls pass; 3 failures | [JSON](argument-counterexamples.json) |

The **115** passing checks were run once under Node permission mode with no
child-process or write grant. Commands, read grants, export cwd, static stage
receipt and exits are in [offline-checks.json](offline-checks.json). Windows calls
are injected; the wrapper suite checks that actual child spawning is denied.
QA's additional three launcher checks were not rerun or counted as Support checks.

[static-identity.json](static-identity.json) records independently recomputed
candidate/payload/wrapper hashes, all ten matching source pins, unchanged helper
files, and the Linux-only observation that the new scratch path was absent.
The 32 steps match the previous placement candidate after normalizing only step
zero's isolated profile and surface paths. `endHungApp` is absent from the steps.
The generator suite also verifies that reverting just the two emitted admission
blocks and profile substitution yields the previously reviewed placement runner.

| Pinned object | SHA256 |
| --- | --- |
| Candidate JSON | `f580ef5c93484c4cbe89ff3d8af8c53b99571bac897d8570ad1a638f6dd6dc58` |
| Wrapper | `9f3bc94052246981b9f554823400df4882acdc0906f34b916e7036b952ff7e3f` |
| Emitted runner | `986077ec88ef8c4d3e626edbb4397e5bd1d56a587bebb5038d8e41c5ab12fad6` |
| Steps | `c7b8f5ed842856de42e0ddd25ac8e534f57eafb40a64e3ca2af0e1ffbef7baa3` |
| Surface | `69e38e1bdacf8f4764a9227ebf58177f9959e83f3a03aa428c1b3e8b998be2d2` |

Production remains declared as `52be105a148a28e677f83cc4b7077665f2ff372c`, 77 files,
tree `531943a83d3572ca9c686c7d8cd62bd88da5b0401b84050487722b8e87a02669`.
This review checked the pinned source and saved static receipt, not a fresh stage
inspection. Scratch was `%TEMP%\lc-qa-tts-output-afad96151bad482f8f4883656cb58e5f`.
Absence is a point-in-time file observation, not an allocation or future guarantee.

## Preserved boundaries and remaining limits

- The diff is confined to the two TTS code files, their focused tests and new QA
  candidate/evidence directories. Shared runner, cleanup, display admission,
  placement, visible-candidate builder, drag helper and generated surface are unchanged.
- The wrapper uses the scoped predicate only for admission/refusal evidence. It
  still passes complete Electron and Edge observations to `releaseOwned` after an
  actual native attempt. Cleanup keeps exact executable/full arguments/creation
  bounds, remembered PID-plus-creation identities, held-process revalidation and
  unknown outcomes. The focused suites exercise PID reuse, unreadable identities,
  foreign listeners and refusing signals after identity changes.
- Unreadable Electron metadata and relevant listeners remain blocking; the native
  guard allows only one 300 ms reread when all relevant rows are unreadable.
  Named stage/work components, switch values, bounded port keys and leading-zero
  ports are covered by focused fixtures. The three missing app-operand cases above
  still prevent approval. Junctions, subst drives and hashed short names remain
  documented limitations, not newly verified alias resolution.
- Allocation/payload binding, exclusive fresh scratch creation, no retry, the
  140-second bound and AI-disabled generated-surface scope remain. The 16 surface
  checks and display/foreground/owned-window guards still run before capture.
  Process admission alone cannot establish controlled display content.
- Precision note: runner line 257 classifies its own root for **reporting** using
  matching PID and a creation/start-time difference **below 1 ms**, not exact
  timestamp equality. This does not feed cleanup ownership; cleanup still uses
  exact CIM identity. Do not describe the reporting tolerance as exact equality.

Lead's `handoff_0cfa56d726f9050f0912f746133828ac` reports that the same three cases
were returned to QA and requests holding native parse/type work until corrected
source. Accordingly the [prepared prerequisite harness](../../../../tests/probes/support/review_admission_native_prerequisite.py)
is **unexecuted**. Its Python syntax and unique isolated `QaArgv` extraction were
checked only. There is no Windows syntax, C# compile or native argv receipt for
this review, and no new approval denial. Earlier human approval of QA's source
edit is recorded by Lead/QA; it is not a display or diagnostic allocation.

Actual native invocations, live process/port/window queries, applications launched,
signals, display/account/audio/microphone/provider use: **zero**. No client was
re-probed or stopped. Existing paused automation was not resumed. No product,
real-device or real-AI acceptance is claimed. Next dependency: QA's corrected exact
SHA from Lead, for the same bounded delta review and deferred prerequisite.
