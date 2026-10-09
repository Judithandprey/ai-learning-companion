# Bounded diagnostic, attempt 3 of 3 — 2026-10-09

**All 32 steps passed. The wrapper reported `passed: true`.** Both overlay drags passed, and the exact-owned cleanup was
confirmed. This is AI-disabled diagnostic evidence on the generated surface. It is **not** acceptance of the product,
live capture, speech, audio, captions, focus, Stop with a real provider, or any real-AI gate. The bounded budget is now
used up: 3 of 3 attempts, and there is no fourth.

- **Authorization:** `human-bounded-retest-20261008:d41dbbfae11448f7847e26cb54afcd44`, final slot. The read and
  arithmetic checks ran under `human-approve-read-arithmetic:1341e2b5d73b432eaefa988058e79172`.
- **Allocation:** `lc-bounded-display-20261008-03`, issued by the lead in `handoff_6968c97920e69b27bbb6c5ebcb06a48e`.
  - File `/tmp/lc-bounded-display-20261008-03.json`, sha256
    `57604d8eba94e103397a96d7b7341ae9d06eef35027851590f88612e530ba51c`. It is byte-identical to the release copy
    `docs/verification/lead/live-windows/approved-two-gates/bounded-retest-20261008/attempt-03-allocation.json` at
    origin/main.
  - Valid from 05:56:28Z to 06:26:28Z.
  - Exclusive display, one native attempt, no retry, no account, audio or microphone.
- **Exact source:** `team/qa` `30c12c6`, the r4 candidate. Support approved it in `184f712`; the release is
  `1f6f0ff`.
  - Wrapper `153db051aa92a39a5f59859c1d85b107867a6fc6fa1c30eb033692f83ebdbda3`.
  - Candidate `f2104545cdc393522de46ab108fa928bfe475e1cab400cf9af3fbfb6ce8c1503`.
  - Runner `d6640e6c8f24b51dc87feb12f8ce83832c7a6c28c380de8f0b02d1eb644b28c2`.
  - Steps `9af8002c…`, surface `69e38e1b…`.
  - Production `52be105`, 77-file tree `531943a8…`, Electron 44.5.1.

  At 05:57:53Z QA checked these hashes, a clean tree, and that the scratch `…27f0531f…` and this folder were absent.
- **Command, run once at 05:58:02Z (exit 0 at 05:59:39Z):** `node tests/e2e/windows/qa_run_tts_candidate.mjs --execute
  docs/verification/qa/p0-13-tts-52be105/execution-bounded-20261008-03 /tmp/lc-bounded-display-20261008-03.json 57604d8e…`
- **DISPLAY RELEASE** was sent right after, as `handoff_4feb06a5c86a34f92da3b0bcdcd28c11`.

## Result

**The wrapper** ([run.json](run.json)):
- the parser reported 0 errors; the launcher returned status 0 with no timeout and empty stdout and stderr;
- `steps_ok` true;
- drags: `toolbarHandle` ok, `cardHandle` ok;
- `owned_launch_cleanup_confirmed` true;
- `native_attempts` 1, `provider_attempts` 0.

**The runner** ([runner-results.json](runner-results.json)): all 32 steps are `ok`, and the step times span 65.7 s:

| Steps | What passed |
| --- | --- |
| 1–5 | The Edge identity bind, raise, full screen, surface eval, and on-top check (16 of 16 points owned) |
| 6–8 | The product launch, after the product-launch admission accepted 16 of 16 points; the display option present; AI and connectors off |
| 9 | Control placement: client area `[833, 90, 1727, 1459, 192]`, page box `viewport [447, 685]`, DPR 2, option centre (223.5, 210.48), click point (1280, 511) on the control window |
| 10–12 | Edge raised again, surface eval, 16 of 16 points |
| 13–16 | Capture start, with the admission accepting `[0, 0, 2560, 1600]` in the foreground and 16 points; the session running; the overlay frame present; AI off |
| 17 | Overlay placement: owned, topmost, above Edge |
| 18–25 | Both drags, the ASK stroke, the card shown, the card closed, NAV |
| 26–28 | Edge raised again, surface eval, 16 of 16 points |
| 29–30 | Stop pressed; session not running |
| 31 | The product closed by `WM_CLOSE`, exit code 0, in 157 ms |
| 32 | The owned Edge closed |

All 14 display admissions were accepted.

**Cleanup:** electron and edge `exit: confirmed`. No owned process was left; the product and Edge had already closed in
steps 31–32. The foreign processes were listed only and never touched: the AgentsDock client 100568 with its children,
and the user's Edge 23092.

## What this shows about the repairs

| Repair | Shown by |
| --- | --- |
| Edge identity (`151f7d7`) | The surface window was bound and found again at every lookup |
| Fix 1, parenthesized admission points (`a3f12b3`) | The step-6 and step-13 admissions computed 16 points and passed |
| Fix 2, `$clientArea` (`a3f12b3`) | Step 9 finished in 4.9 s through the Edge lookup after the rename, with no 20-s DevTools wait |
| r4 tolerance (`30c12c6`) | Step 9's recorded page box confirms the attempt-2 inference, and the tolerant check passed |

On r4: the page box shows `innerWidth` 447 (894 = 447 × 2 exactly) and `innerHeight` 685. 685 × 2 = 1370 is 1 px
more than the 1369-px client height, so the old exact rule would have refused this run too, and the new rule passed
it. The lead's correction applies: in attempt 2 the width and centre values were not saved and are unknown, and this run
does not change that record.

## The Edge window's 1-px shrink: observed again, still unexplained

Edge's 61 reads were all `[0, 0, 2560, 1600]`, except for:
- one `[20, 20, 2120, 1484]`, the intended normal state during full-screen placement;
- one `[0, 0, 2560, 1599]` at step 10 `before_window`, while the product's control window held the foreground after
  step 9 raised it. The read right after the raise was `[0, 0, 2560, 1600]` in the foreground.

So in both attempts Edge's window lost 1 px at the bottom while another app's window was active, and returned to full
size when raised. The cause is still unknown. The exact full-surface gates were not changed and passed.

## Files

| File | sha256 |
| --- | --- |
| `run.json` | `b02ffa753aeb61884a3adf533946b06dbcc29832d1d34b0ea94421131b236e43` |
| `runner-results.json` | `db540285caf7954e073d4c82adde66da7f14f37cad9f938a7aff6ce402e95254` |
| `runner.stdout.bin`, `runner.stderr.bin` | empty (`e3b0c442…`) |
| `wrapper-stdout.json` | the wrapper's printed summary |

Before committing, QA checked the results for private content. They hold no command lines or private paths. The only
title is the generated surface's title, which carries this run's random token.

## Not shown

- **The product's real work:** AI is disabled, so there were no real capture uploads, model answers or provider
  requests. Real requests remain **0/4**.
- **Not exercised:** speech, TTS, captions, microphone, audio, automatic focus, and continuous context.
- **Coverage:** one run on one display configuration (2560 × 1600, 192 dpi). Behaviour on other displays or with
  another foreground app is untested.
- **Edge's transient 1-px shrink:** unexplained.
