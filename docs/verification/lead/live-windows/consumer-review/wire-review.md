# Independent Windows live-wire review

Decision: **HOLD for two reproduced Windows-client defects**, then owner repair and focused recheck. The released wire itself interoperates in the two existing synthetic integration cases. This is neither a real-Windows nor a real-provider acceptance.

Candidate: `9622b517b74020b2d9e8ffbb03f8d615ff32341d`, exported with `git archive` to `/tmp/lc-review-wire-9622b51`. Reviewed delivery leaves `d0e5f80`, `79d0811`, `3766e62`, `a336485`, `9622b51` after `28f0504`. Requirements and released bridge were read from main `07c9ebd35d412ff4e8b3f5aa2e1b895da9456fe8`. Main was clean before/after review. No production, other-owner worktree, account, display, microphone, audio device, DB, dependency, or authentication change was made.

Applied project PONYTAIL LITE: traced the existing production path and used its existing unit harness plus two small independent lifecycle probes; no new production layer or broad mutation audit. Read AGENTS, TEAM, lead role, workflow, current decisions, source/English §7.1/§7.3, relevant original-goal cases, audio boundaries and ADR 0004. The manifest hashes match source and English for main requirements, decisions and original-goal verification.

## 1. P1: AI-only Stop does not fence a result already buffered in the renderer

Locations in the candidate:

- `apps/windows/src/renderer/overlay.ts:1194`: `onLive` updates the state and renders without invalidating buffered results.
- `apps/windows/src/renderer/overlay.ts:1203`: a result arriving before the selection/submission acknowledgement is retained in `a.early`.
- `apps/windows/src/renderer/overlay.ts:1113`: the delayed acknowledgement consumes that result.
- `apps/windows/src/renderer/overlay.ts:1212`: final display checks only `a.cancelling || ended`; `ended` is capture state, so AI-only Stop does not suppress it.
- `apps/windows/src/main/main.ts:907`: AI Stop fences transport and speech but does not invalidate this renderer-buffered presentation.

Actual reproduction uses the real candidate main/overlay/Subscription with their existing fake Electron/display/connector harness. Hold `askSelection` acknowledgement through the existing `holdSubmitAck`, complete a circle, answer its provider request, wait until main has processed it, press control IPC `lc:live-stop`, confirm `live.state === 'ended'`, then release the acknowledgement. The card shows `BUFFERED_BEFORE_AI_STOP` after Stop. The independent assertion expecting no answer fails.

Evidence: `/tmp/lc-review-wire-9622b51-probes.txt`, `LATE_PRESENTATION` record: session `ended: "stopped by you"`, card `answer: "BUFFERED_BEFORE_AI_STOP"`.

Requirement: source/English §7.1 Stop/cancel/revocation must prevent late presentation; ADR 0004 final presentation must retain current session/permission binding. This concerns a result newly shown after Stop, not removal of an answer already shown before Stop.

Owner action: invalidate pending/early presentation for the ended AI session in the final renderer path, including session identity so a later explicit Start cannot revive an old result. Preserve generated-vs-shown history honestly and avoid deleting an original or prior actually displayed answer. Add a regression covering both delayed selection and delayed follow-up acknowledgements.

## 2. P1: explicit Start on an unchanged captured screen can send no first observation

Locations:

- `apps/windows/src/main/main.ts:867`: `startLive` creates a fresh AI session and notifies UI, but neither requests a fresh frame nor seeds an independent first-observation decision.
- `apps/windows/src/main/main.ts:726`: `lookAt` is reached only after a newly retained material frame.
- `apps/windows/src/main/main.ts:968`: a frame retained while no live session exists is simply not offered.
- `apps/windows/src/shared/retention.ts:68`: identical pixels/ink are `unchanged` even after the heartbeat interval, so the old capture-retention baseline continues to suppress them after AI Start.

Reproduction: start capture without AI; retain the current screen at shade90; explicitly Start AI through `lc:live-start`; take fresh samples with identical pixels and ink; fire the observation interval. The AI session reports `on`, `frames:0`, `used:0`, `seen:null`, and the connector has **zero** observation turns. This persists while the screen/ink remain identical; the heartbeat cannot change that branch. The independent assertion expecting one fresh authorized observation fails. An AI restart after Stop has the same retained-baseline issue; initial capture+AI Start also has a race when its first retention finishes before Start's reply.

Evidence: `/tmp/lc-review-wire-9622b51-probes.txt`, `UNCHANGED_START` record: `observations:0`, `retained:1`, session `on` with no observed frame.

Requirement: source/English §7.1 says Start actually enables whole-screen AI context rather than merely local capture or waiting for the next Ask/change. Static viewing is part of normal learning. The requirement does not mean sending every identical frame.

Owner action: obtain one current post-authorization capture for each newly started AI session independently of the prior disk-retention change baseline, reusing content-addressed stored bytes where appropriate. Preserve the original retained records, accurate new capture timestamps, reserve/budget behavior and Stop fencing. Do not relabel an old capture as freshly observed.

## Checks and evidence

All commands below ran from `/tmp/lc-review-wire-9622b51/apps/windows`; Node is the project's existing `.tools/node-v24.21.0-linux-x64/bin/node` and Python the existing repo `.venv/bin/python`.

1. Independent regression probes:

   `timeout 20s /home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node tests/review-wire-probes.test.ts`

   **2 tests, 2 expected-behavior assertion failures**, 115 ms. Probe source: `/tmp/lc-review-wire-9622b51/apps/windows/tests/review-wire-probes.test.ts`. Log: `/tmp/lc-review-wire-9622b51-probes.txt`. Only this review test was added to the scratch snapshot; production files remain exact candidate bytes.

2. Released bridge + Learning interoperability:

   `LC_BACKEND_ROOT=/home/agentsdock/Projects/learning-companion/repo LC_PYTHON=/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python timeout 45s /home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node tests/live-bridge.test.ts`

   **2/2 pass**, 2.641 s. Log: `/tmp/lc-review-wire-9622b51-released-bridge.txt`. Exact-command normal auto-review approval was used after sandbox child-process attempts stalled. Actual `run_stream`, released `LiveSubscriptionBridge` and Learning prepare/bind run over real pipes; only the provider is synthetic. Covers whole-image observation, automatic focus, unchanged-frame and later-frame follow-up, strict result provenance, observation replacement, reserve, confirmed/unconfirmed interruption and quota refusal. No Codex/account/network call occurs.

3. Existing app-live suite, direct in-process execution:

   `timeout 40s /home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node tests/app-live.test.ts`

   **17/17 pass**, 6.967 s. Log: `/tmp/lc-review-wire-9622b51-app-live.txt`. Fake display/connector only. `LC_BACKEND_ROOT`/`LC_PYTHON` were absent in this command; the final test's conditional Python validation did not execute despite its composite test title. It is counted as an app check, not extra bridge validation.

4. Focused transport lifetime and uncertainty cases:

   `timeout 25s /home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node --test --test-isolation=none --test-name-pattern='whether a turn reached ChatGPT|an interrupt or a Stop is a confirmed|an end that was not seen is handed|only its output closing' tests/subscription.test.ts`

   **4/4 pass**, 7.317 s. Log: `/tmp/lc-review-wire-9622b51-transport.txt`. Covers known/unknown submission, output-only child loss, strict interrupt/Stop receipts and persistence of unconfirmed connector end including one retry at quit.

The initial multi-file sandbox runs were inconclusive, not product failures. One was interrupted after producing no output; later bounded runs stalled on child processes and/or produced harness cancellation after the timeout. Logs are `/tmp/lc-review-wire-9622b51-focused.txt` and `/tmp/lc-review-wire-9622b51-focused-direct.txt`; timeout receipts remain in tool history. Root cause of sandbox child-pipe stalling was not established. The approved isolated bridge run above is the relevant completed interoperability evidence. No whole-suite or mutation campaign was repeated.

## Scope limits and next owner

The reviewed source keeps the full image separate from focus, does not relabel old-focus geometry onto a newer frame, compares complete result provenance, preserves submission uncertainty, and distinguishes local session reserve from account quota. The selected tests substantiate those bounded paths but do not eliminate the two independent lifecycle defects.

Voice ownership/TTS adapter and renderer layout were explicitly assigned elsewhere and were not duplicated here. Candidate documents correctly state `connectVoice` has no product caller and no native audio-input route. Existing `381 tests / 376 pass / 5 skip` is owner evidence, not this review's total. No real Windows display/pen/audio behavior, provider-image history, actual subscriptions, Notability import, macOS or complete-product gate is accepted by this report.

Next: Web/Windows owner repairs these two defects on its own branch; lead integrates reviewed exact repair commits and rechecks these probes. Actual Windows changed-flow QA remains lead-coordinated and separate. No extra authorization, model change, new dependency or shared-wire change is needed for these client repairs.
