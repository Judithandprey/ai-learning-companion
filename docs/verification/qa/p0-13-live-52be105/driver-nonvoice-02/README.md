# Nonvoice driver correction 02: L1, L2 and the Lead decisions — 2026-10-09

**Source and offline checks only.** No Windows, display, account, model, microphone or audio call was made, and no lease
was taken. The real-action ledger is unchanged at **0 of 4**, and the diagnostic is closed at 3 of 3.

This corrects the held `b8f0d9c` (Lead HOLD `b63ecdc`, `handoff_3ec98086b3b4b0a1a8b4c17b14a8746a`) within the same
assignment. The held candidate [candidate-nonvoice-01](../candidate-nonvoice-01/) and its evidence
[driver-nonvoice-01](../driver-nonvoice-01/) are unchanged, because Support is reviewing them. The corrected candidate is
[candidate-nonvoice-02](../candidate-nonvoice-02/).

## The two Lead findings

**L1. Included use was taken for the whole allowance.**
- **Before:** the actual `account_ready` step refused on `ordinary_usage_allowed === false` or on any
  `rate_limit_reached_type`, even beside usable `windows[].credits`.
- **Now it refuses only on:**
  - a spend control the server states as reached (`spend_control_reached === true`);
  - the unchanged account and model gates: not signed in, a pending sign-in or request, a selected model that takes no
    pictures, the AI box disabled.
- **What passes:** an exhausted included window, a reached marker, an unknown balance and an unknown or unread quota.
  The server stays authoritative for those, with no retry, reset credit or billing change. This is what the actual
  credit-backed image result (`91e72fe`) showed.
- **Recorded facts:** included use allowed, included reached, credits present.

**L2. A reached Start with missing records counted nothing.**
- **Now:** once the Start step was reached, slot 1 (the first look) is counted even when every later record is missing:
  - `start_reached_outcome_unknown`, whether the Start step returned or failed;
  - `session_started_no_look_recorded`, when a `started` line exists but no look was recorded.
- **What still counts nothing:** the known pre-Start stops.
  - The connector's own refusal (`not_started`) gives `NOT_RUN_session_not_started`.
  - The final surface admission refused before the Start expression ran (its `before_capture_start` entry not
    accepted) gives `NOT_RUN_start_not_evaluated`.
- **Not distinguishable:** the runner reports any exception in the Start expression only as "guarded capture Start
  failed", so a failure before the click cannot be told from one after it; it is counted.

## The Lead decisions D1–D10, as applied

| | Applied |
| --- | --- |
| D1 | The two typed visual-reading requests select **explain** on the card, recorded in the manifest as a test override. The circle's request is left to the product's own hint cap; no step touches its level |
| D2 | DOM value/input events and the actual production handlers; labelled **NONPHYSICAL** in the manifest |
| D3 | `#liveStop` fences the AI requests; the wind-down capture Stop ends the capture. The fence verdict states the stop scope |
| D4 | Stop as soon as the 4th request is out; the verdicts stay before-submission, in-flight or unknown |
| D5 | 4 requests / 60 s / 60 s and every guard unchanged; a minute run out leaves the rest NOT_RUN |
| D6 | **One fixed 600000 ms** native bound for setup, session and cleanup. The allocation must state exactly that. The steps' worst case, 519 s, fits inside it, and the generator refuses otherwise |
| D7 | Connector descendants observed only; unknown or left-over means not released |
| D8 | Raw receipts are written outside the repository (`~/.local/state/lc-qa-live/<run>/receipts`, 0700). The evidence folder gets `receipts-sanitized.json` (no thread or turn id, no executable path) and a `publish-allowlist.json` of generated files; everything else is excluded by default |
| D9 | Circle card 0, ask for the current top row. The question no longer says the cards changed, and the tests forbid such wording |
| D10 | codex 0.158.0 digest, state_dir null, the selected account and model, unchanged |

## Failures before, passes after

- [failures-before-b8f0d9c.txt](failures-before-b8f0d9c.txt): the corrected test file run against the held sources
  `b8f0d9c` gives **9 of 23 failing**.
  - **L1:** the step refused with "the server states a usage limit as reached".
  - **L2:** a reached Start gave 0 used.
  - **D8:** no sanitizing or allowlist.
  - The rest come from the decisions: explain, the wording, the fixed bound and the new candidate.
- [passes-after.txt](passes-after.txt): **23 of 23 pass**, with child processes withheld. The new tests are:
  - **L1:** the actual `account_ready` text run in a VM against UI-shaped quota. Five cases pass: credits beside an
    exhausted included window, a reached marker, an unknown quota, an unread quota, an unknown balance. Seven are
    refused: spend control, signed out, login pending, a request out, a text-only model, no model, the AI box disabled.
  - **L2:** the Lead's reproduction with Start returning and failing (1 used, 3 remaining). Also the started-without-look
    case, the connector refusal, the refused admission (both 0 used), and Start never reached.
  - **D8:** sanitized fields, the allowlist over a tree with a `private` folder, and the raw-receipt root under
    `~/.local/state` and outside any checkout.
- [driver-mutants.txt](driver-mutants.txt): **35 of 35 caught**, without counting the pinned-candidate refusals. That is
  the earlier 27, the bound mutant rewritten for the fixed bound, and new mutants:
  - the included-use veto restored, and spend control ignored;
  - a reached Start not counted, a refused admission counted, `not_started` counted;
  - the thread id kept, raw receipts inside a checkout, the allowlist admitting everything.

  The first round left one survivor, raw receipts pointed into the worktree. Its test was tightened.
- [candidate-check.json](candidate-check.json): candidate 02 reproduces from the sources, and its scratch is unused.
- [connector-copy-check.json](connector-copy-check.json): the private copy is still exactly `52be105` (280 files), and
  both the question and the live paths load from it.

## Changed pins (only what changed)

| | candidate-nonvoice-01 (held) | candidate-nonvoice-02 |
| --- | --- | --- |
| `candidate.json` | `694a1acc…` | `74ebc3942022fe0549aa691b45ff5cc4949a56041b2f424b22f4786eb4374fbc` |
| Runner | `f3724262…` | `0f5c23f03e8900b96f0e3c29ea6494af3b510bde3de6b1aefe335f747c6e9590` (r4 bytes; only the new folder name) |
| Steps | `535bb56e…` | `560461adeb84bfb7e614bd29c337b3e72b3363a6c643047fc533b96fc84c4d7a` |
| Surface | `be82967a…` | unchanged |
| Connector configuration | `4729ca1a…` | unchanged |
| Wrapper | `aaa85a7b…` | `9db4b2d39de5df8e7b28d97c801423d4ed0ef00511b42aa2b509bc070acb0454` |
| Scratch | `…c7fc94ca…` (never created) | `%TEMP%\lc-qa-live-nonvoice-29b2ae8a1d4443c0ac905187afed9991`, absent |

[allocation.template.json](allocation.template.json) is written for candidate 02, with `native_bound_ms` 600000 and
still inactive.

## Remaining concrete prerequisites

1. Support's verdict on `b8f0d9c`, consolidated by the Lead; any further finding amends this task. Then Lead review and
   integration of this correction.
2. The normal exact-command, script and resource review of the corrected ready command. The old AI-disabled approvals
   are refused by the wrapper and do not release it. Then a fresh exclusive display and account allocation following
   the template.
3. The user's managed sign-in present and no other lock holder. Otherwise Check connection shows it, and the run stops
   before Start.
4. Run-time rechecks by the wrapper: stage 77/77, the private copy, the codex digest, preflight, scratch unused.

Ready command, only after that allocation:

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node tests/e2e/windows/qa_run_live_candidate.mjs --execute docs/verification/qa/p0-13-live-52be105/execution-nonvoice-01 <allocation.json> <Lead-provided allocation sha256>
```

The earlier limits still hold:
- never executed; latency unmeasured;
- nonphysical input; one display configuration;
- the in-session scene check with a card up is untested;
- no speech, captions, audio, voice slot or §7.1 gate.

`test_qa_run_tts_candidate.mjs` stays at 26/54. That is the consumed r4 scratch, pre-existing; it is not made green by
recreating anything.
