# Bounded diagnostic, attempt 1 of 3 — 2026-10-08

**The native runner stopped at step 6 (`launchApp`), before the product was started.** Steps 1–5 passed for the first
time:
- the owned Edge window was bound to the generated surface by its title token;
- the raise succeeded;
- full screen succeeded;
- the surface eval succeeded;
- the on-top check succeeded.

Step 6 aborted with a PowerShell error: `方法调用失败，因为 [System.Object[]] 不包含名为“op_Multiply”的方法。` ("method
invocation failed because [System.Object[]] has no method op_Multiply"). Steps 7–32 were NOT_RUN. This is **not a product
result**, and not device, speech or AI acceptance.

- **Authorization:** the human-bounded continuation `human-bounded-retest-20261008:d41dbbfae11448f7847e26cb54afcd44`:
  at most three additional attempts in total. Its record contains that nonce and the reply "OK，你解决问题吧。". This
  was attempt 1; the lead counts it as consumed (1 of 3).
- **Allocation:** `lc-bounded-display-20261008-01`, issued by the lead in `handoff_c288b88e43f46451b28c7887361aaf54`.
  - File `/tmp/lc-bounded-display-20261008-01.json`, sha256
    `d3f67d96e5654660ec4951f5a2027278b7d41f0fb1a59624349d15aa0c2007a6`.
  - Valid from 22:49:48Z to 23:19:48Z.
  - Exclusive display only, one native attempt, no retry, no account, audio or microphone.
- **Exact source:** `team/qa` `151f7d7`, approved by Support `3b718d8` and integrated at main `0c4c4174`.
  - Wrapper `aad5e81b76e8b329b3c95c6b7ee31359443f6a47ede55312af2ff751fa416816`.
  - Candidate `03344f776afb4ff2110e7450b8c48d86fd0b9d7b394e5473e3ccd7959770cde9`.
  - Runner `301b5053e758938df97059fa52a60715d6ed7d9423a7e44de5e30df681c59dfa`.
  - Steps `e4059d8a…`, surface `69e38e1b…`.
  - Production `52be105`, 77-file tree `531943a8…`.

  At 22:50:39Z, on the Linux side, QA checked: the allocation, wrapper, candidate and runner hashes; a clean tree;
  and that the scratch `…77fadf1a…` and this folder were absent.
- **Command, run once at 22:50:51Z (exit 1 at 22:51:48Z):** `node tests/e2e/windows/qa_run_tts_candidate.mjs
  --execute docs/verification/qa/p0-13-tts-52be105/execution-bounded-20261008-01 /tmp/lc-bounded-display-20261008-01.json
  d3f67d96…`
- **DISPLAY RELEASE** was sent right after, as `handoff_d15c356ef2f7386a3b92d3a7dc4b8e7d`.

## What is known

From the wrapper's printed summary ([wrapper-stdout.json](wrapper-stdout.json)):
- `passed` false, `native_attempts` 1, `provider_attempts` 0.
- `aborted` is the PowerShell message above.

From the runner's results, step kinds and outcomes only:
- steps 1–5 `edgeStart`, `window`, `edgeFullscreen`, `eval` and `onTop` are `ok`;
- step 6 `launchApp` is not `ok`, with the same error;
- six steps were recorded.

**Cleanup**, exact owned identities only (wrapper `releaseOwned`):
- **Edge:** owned Edge 41212 (an app process) was asked to close and signalled; no force was used. Exit `confirmed`;
  nothing left running, unresolved or not revalidated.
- **Electron:** no owned product process was seen. Exit `confirmed`.
- **Foreign processes,** listed by PID and never signalled:
  - the AgentsDock client 100568 and its three children;
  - the user's Edge 23092.
- **Scratch:** kept by design.

**Likely cause,** from source reading only; isolating it is the repair task. Step 6 calls `Start-App`, whose first act
is `Assert-QaSurfaceAdmission 'before_product_launch'`. That runs before `Start-Process`, which fits no owned product
process being seen. Its only multiplications are in the 16-point list (runner line 826, from
`qa_display_admission.ps1:185`, commit `e74d5b5`):

```powershell
$points += ,@((40 + $card % 4 * 210 + 95) * 2, (90 + [Math]::Floor($card / 4) * 170 + 75) * 2)
```

In PowerShell the comma operator binds more tightly than `*`. So this is `(…) * (2, (…)) * 2`: a number multiplied
by an array. This guard ran here for the first time; the earlier attempts stopped before it. A source parse cannot
find this: the wrapper's parser check and Support's parse found no error.

## Not inspected, and why

After the step summary above, a further **read-only** look at `runner-results.json`, in a local `python3` script, was
**refused by this session's automatic permission classifier** as "[Remote Shell Writes]". It would have printed step 6's
full record, the `errors` list and the `processes` summary. As the refusal requires, QA did not read that data by any
other means.

So whether step 6 recorded anything beyond its error is unknown to QA. That includes the admission phase that failed
and any partial admission evidence.

`run.json` and `runner-results.json` are committed byte for byte as the wrapper wrote them. The wrapper copies the
runner's own `results.json`, which by design records PIDs, classes and bounds but no titles or command lines. QA did
not re-check them for private content after the refusal. **The lead or Support should look at them before this is
pushed to the public repository.**

## Files

| File | sha256 |
| --- | --- |
| `run.json` (wrapper report) | `b2aba7ebf5f1dc5daa210cd51e927ed05a3f73c31b53b3ac0112a12af9125458` |
| `runner-results.json` (runner `out/results.json`) | `610de7eaef01c63be66d343a5fba34697cca5a0bf96923e888506b2fb4114251` |
| `runner.stdout.bin`, `runner.stderr.bin` | empty (`e3b0c442…`) |
| `wrapper-stdout.json` (wrapper's printed summary) | see `git` |

Real requests remain **0/4**. Attempts under this nonce: **1 of 3 consumed**. Speech, captions, focus, Stop and the
real-AI and desktop gates remain NOT_RUN.
