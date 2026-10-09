# Bounded diagnostic, attempt 2 of 3 — 2026-10-09

**Steps 1–8 passed, including the product launch. The runner stopped at step 9 (`productPlacement: control`) on a
geometry check.** Attempt 1's step-6 failure did not recur. Steps 10–32 were NOT_RUN. This is not a product result, and
not device, speech or AI acceptance.

- **Authorization:** `human-bounded-retest-20261008:d41dbbfae11448f7847e26cb54afcd44` (3 attempts in total); this was
  attempt 2, so 2 of 3 are consumed and 1 remains. The checks between the attempts ran under
  `human-approve-read-arithmetic:1341e2b5d73b432eaefa988058e79172`.
- **Allocation:** `lc-bounded-display-20261008-02`, issued by the lead in `handoff_b80d989dd5af1ae5e2592dddbb2f91d9`.
  - File `/tmp/lc-bounded-display-20261008-02.json`, sha256
    `91e6a0a6656c25f706126ba8d445f0e3b67503f97739bae06ccfd1313876067b`.
  - Valid from 05:37:57Z to 06:07:57Z.
  - Exclusive display, one native attempt, no retry, no account, audio or microphone.
- **Exact source:** `team/qa` `e1ce596`, which is `a3f12b3` plus the approved-check receipt. Support approved `a3f12b3`
  in `55582e0`; it is released as main `6eec313`.
  - Wrapper `8f7d7132ffe8d3edb1477d7716345fb52ba619f6ebc6edec59102e14389ec6bc`.
  - Candidate `320ba2c1dee4b6eb769beec6fafd2b61b085684eeddc14b335fd28a6f41bbcbc`.
  - Runner `01f35325d8c10cfe0b66cdbfc2cf17486e8deb215d5bec033499df9aa4d42d15`.
  - Steps `b7c5cc0b…`, surface `69e38e1b…`; production `52be105`, 77-file tree `531943a8…`.

  At 05:39:05Z QA checked these hashes, the clean tree, and that the scratch `…6bd71cac…` and this folder were absent.
- **Command, run once at 05:39:13Z (exit 1 at 05:40:18Z):** `node tests/e2e/windows/qa_run_tts_candidate.mjs --execute
  docs/verification/qa/p0-13-tts-52be105/execution-bounded-20261008-02 /tmp/lc-bounded-display-20261008-02.json 91e6a0a6…`
- **DISPLAY RELEASE** was sent right after, as `handoff_20143d8bbe58df77aacee28cfff80ee4`.

## What happened

- **The wrapper** ([run.json](run.json)): the parser reported 0 errors. The launcher returned status 0 with no timeout
  and empty stdout and stderr. `native_attempts` 1, `provider_attempts` 0, `owned_launch_cleanup_confirmed` true.
- **The runner** ([runner-results.json](runner-results.json)):

  | Step | Kind | Result |
  | --- | --- | --- |
  | 1 | `edgeStart` | ok |
  | 2 | `window` (raise) | ok |
  | 3 | `edgeFullscreen` | ok |
  | 4 | `eval` | ok |
  | 5 | `onTop` | ok |
  | 6 | `launchApp` | ok: product PID 130764, started 05:39:59.92Z |
  | 7 | `waitEval` | ok |
  | 8 | `eval` | ok |
  | 9 | `productPlacement` (control) | **failed**: "owned control client and browser geometry disagree" |
  | 10–32 | | NOT_RUN |

  The product was closed by the runner's own `finally` (`closed_in_finally`, exit code 0). That is why the wrapper's
  cleanup saw no owned product process.
- **Step 9's recorded geometry:**
  - The owned control window 199756 belongs to the product. It is not topmost, is in the foreground and above Edge, and
    has bounds `[820, 32, 1740, 1472]`. It was raised.
  - Its **client area is `[833, 90, 1727, 1459]` at 192 dpi: 894 × 1369 physical pixels.**
  - The Edge surface window keeps bounds `[0, 0, 2560, 1599]`.

## Why step 9 failed (inferred; the page values were not recorded)

The failed check (runner line 1026, from the reviewed placement `qa_edge_placement.ps1:180`, commit `fc2fe34`) requires
that the client width equal `innerWidth × devicePixelRatio` and the client height equal `innerHeight × devicePixelRatio`
exactly. It also requires dpi 192 and the option centre inside the viewport.

The DPR check in the line before it passed, so `devicePixelRatio` is 2. `innerHeight` is an integer, so
`innerHeight × 2` is even, and the client height of 1369 is odd: **the exact height comparison cannot pass for this
window.** The width, 894, is consistent with an `innerWidth` of 447.

The runner does not record `$box` (the page's viewport and the option's position), so this is an inference from the
recorded client area, not a recorded mismatch. The check had never run before: attempt 1 stopped at step 6.

**The fixes from `a3f12b3`:**
- **Fix 1 held on the display:** step 6's admission computed its 16 points and passed.
- **Fix 2 was not exercised:** the `$clientArea` rename matters at line 1033, after this check.

## Files

| File | sha256 |
| --- | --- |
| `run.json` | `33ebb5e8bdd8a308831d1826fae984db8ff6c3a5a2119883205dd9ea331130b1` |
| `runner-results.json` | `90bd00aa151160d7da32e0863adef471b4f9732346a407ba5a9148553f596597` |
| `runner.stdout.bin`, `runner.stderr.bin` | empty (`e3b0c442…`) |
| `wrapper-stdout.json` | the wrapper's printed summary |

Before committing, QA checked the results for private content. They hold no command lines and no paths outside the run.
The only "title" is the generated surface's title, which carries this run's random token.

Real requests remain **0/4**. Attempts under the nonce: **2 of 3 consumed**, 1 remaining (not reserved). Speech,
captions, focus, Stop and the real-AI and desktop gates remain NOT_RUN.
