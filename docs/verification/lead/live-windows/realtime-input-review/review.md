# Realtime INPUT candidate review

**Verdict: HOLD the supplied candidate before a live run.** The managed factory/RPC interaction can execute the intended bounded flow, but two independent synthetic traces show that unexpected backing inference can be ignored and a success receipt still emitted. Support should harden this same candidate; no production connector edit or competing implementation is needed.

Candidate: `/mnt/c/Users/ROG/Documents/Codex/2026-09-27/x-o/work/windows-live-experience-20261001/audio-route-next/realtime_input_probe.py`

SHA-256: `d9a8320971e6c20ade82f34c6c77c47ed688378e1a69494a40fffe1456407f27`.

Reviewed complete candidate, README and delivered offline-self-test.json; current source at assigned main `612ce3a`; generated experimental schemas in `/tmp/lc-support-codex-schema-uk50qj_h/experimental/v2`. Actual connector hashes match the candidate pins:

- `chatgpt_rpc.py`: `28d1f3102b5e1d1b5c8eb173748da168a16f19fc21eafbd275395c7c0dd7fdb3`
- `chatgpt_launch.py`: `b4c89171f025056062a091dab47ac6c3b3f372843da428a72b35f7d8eab49090`

Requirements context: current D-SUBSCRIPTION-FIRST, ADR 0004, AUDIO-01/02/12–15 and AVTEST-11/12; a generated-file transport experiment does not pass live capture, acoustic understanding, speaker attribution or screen/audio combination. Latest delegated user decision allows either exact-build codec proof or one explicitly candidate-codec generated-only experiment after review. `VERIFIED_WIRE_CONTRACT=None` is therefore a remaining implementation gate to adapt and label honestly, **not a missing user authorization**. Do not relabel an experimental codec assumption as verified.

## Required correction: child-wide backing-inference refusal

Candidate `Observe.feed`, lines 109–140, first ignores every event whose `threadId` differs from `observer.thread`. Its `turn/started` refusal is below that filter. Actual `ChatGPTAppServer._notification` (`chatgpt_rpc.py:426`) performs global tool/reroute checks, but then returns when `_active is None`. This probe uses direct `_rpc` calls and never `ask`, so `_active` remains None throughout.

Independent reproduction exercised candidate `run_live` with the **actual** ChatGPTAppServer `start`, `_rpc`, `_send`, `_read_loop`, `_notification`, `_account`, and `close`. Process stdin/stdout and launcher construction were replaced by in-memory fakes: no OS child, state files, account, audio device, model or network was used.

1. After the valid owned-thread realtime startup, inject ordinary `turn/started` with `threadId="unexpected-helper"` and an unrequested turn ID. Then send the valid final user transcript and normal stop/closed acknowledgements. Expected: immediate failure and reaped child, no successful input-only receipt. Actual: `fixture_transport_and_terms_passed`, `failure=null`; the forbidden event is not even counted. Artifact: `/tmp/realtime-input-candidate-review/foreign_thread_turn.json`.
2. Inject the **schema-valid** owned-thread `thread/realtime/item/completed` item `type="bemItemPromoted"`, carrying `turn_id="unrequested-turn"`, `item_id`, canonical item ID/session ID, and `presentation={"type":"wholeItem"}`. Expected: fail because backing output exists in this input-only experiment. Actual: item counted but ignored; final receipt again says `fixture_transport_and_terms_passed`, `failure=null`. Artifact: `/tmp/realtime-input-candidate-review/bem_promotion.json`.

The same-thread `turn/started` positive refusal control gives `not_passed/unexpected_backing_turn`, so this is a boundary gap rather than a broken fake transport. Ordinary synthetic success also completes one start, 15 paced appends for 0.5 seconds of input plus the one-second tail, one stop, closed observation and cleanup.

Small required fix: before per-thread transcript filtering, treat unexpected ordinary turn/item inference witnesses anywhere in this owned child as a terminal violation. Include the canonical backing-item promotion variants emitted through realtime item notifications, not merely `turn/started`. Keep the existing original `_notification` global tool/security handling and disabled server-request replies. Fail closed, stop/reap, preserve an unsuccessful/uncertain receipt, and never retry or silently authorize a backing turn. Add the two regressions above plus retained same-thread refusal/success controls.

`clientManagedHandoffs` schema explicitly controls forwarding Codex responses; it does not disable backend inference. The source already documents this correctly. An outbound whitelist proves the probe did not send `turn/start`; it cannot prove the server never initiated a turn internally. Even with corrected observation, report any witnessed unexpected inference separately and stop; do not describe detection after `turn/started` as proof of zero backing submission.

## Oracle release preflight

Final user-only transcript filtering and a static prompt independent of normal fixture terms are good. However, CLI `--expect ''` is accepted: a nonempty list is truthy, and `'' in transcript` is always true. The evidence reports `[true]` for unrelated user speech. Prompt-contained terms such as `speech` are likewise allowed despite the requirement for an unprompted oracle. This must be addressed in Support's prepared release command/preflight: require nonempty, meaningful fixture terms absent from every outbound textual prompt, and freeze their relationship to the generated sentence before the run. Do not count a vacuous or already prompted match as audio evidence.

Minimal in-process negative probe of empty-term acceptance fails as expected: `/tmp/realtime-input-candidate-review/oracle-pytest.txt`. The test stops at that first concrete counterexample; the prompted-term concern additionally follows directly from the unchanged fixed prompt and CLI acceptance. This review did not run a model to test recognition or semantic oracle quality.

## Working boundaries confirmed by source and offline execution

- `create_client()` constructs but does not start the instance, so installing `_send` and `_notification` wrappers before `client.start()` is valid. Startup whitelist matches actual initialize/config/requirements/skills calls. Existing exact binary admission, isolated work directory, environment filtering, managed-state validation and exclusive lock remain in the actual factory. No auth files are read by this candidate; `_account()` uses one nonrefreshing official account RPC. The lock excludes concurrent cooperating factory users; lead must still coordinate the selected existing state/account. This review did not open that state or rerun lock tests.
- Start/append/stop candidate dictionaries validate against the exact generated schemas. Canonical `bemItemPromoted` in the failing trace also validates. Sample-rate/channel fields do not prove PCM encoding; no codec assertion is inferred from schema success.
- Guard allows one backing `thread/start` but no ordinary `turn/start`, login takeover, tool request, appendText or appendSpeech. One realtime start/stop and at most 112 audio appends are bounded; 10-second fixture plus one-second tail needs at most 110 chunks. No automatic retries/model fallback are coded. The report counts guarded attempts, not independently verified billable calls.
- Exclusive output claim is fsynced before connector import/start and retained after uncertain failure. It is per output filename, not a global anti-rerun token; the README correctly forbids using a fresh name to retry automatically. Use one fixed reviewed attempt path.
- Primary live work has a 50-second timeout, stop ACK and closed-event waits are bounded to four seconds each, then factory close terminates/kills and reaps only its own child. Actual RPC EOF/error fail closes the reader; RPC timeouts do not reconnect. On an already fatal client the graceful realtime stop is skipped and success is impossible without stop/closed evidence. Cancellation may leave only the durable uncertain claim, which is not permission to retry. These follow existing code; new timeout/EOF/real-child campaigns were not repeated.
- Assistant transcript, startup ACK, append ACK and metadata do not alone pass. The output stores hashes/booleans/counts rather than raw errors or transcript by default; optional transcript retention is explicitly limited to the generated fixture. The error category is correctly labeled heuristic/unconfirmed.

## Exact checks and retained outcomes

Eight original checks rerun unchanged:

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /mnt/c/Users/ROG/Documents/Codex/2026-09-27/x-o/work/windows-live-experience-20261001/audio-route-next/realtime_input_probe.py --self-test --output /tmp/realtime-input-candidate-selftest-review.json
```

Result: `offline_self_test_passed`, same candidate hash; eight checks. This uses a Sink and fake messages only.

Independent tests:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider /tmp/realtime-input-candidate-review/test_candidate.py --tb=short
```

Initial five-test run: **3 passed, 2 failed in 5.98 s**. Exact output retained `/tmp/realtime-input-candidate-review/pytest.txt`; successful trace `/tmp/realtime-input-candidate-review/ordinary.json`, known-refusal control `/tmp/realtime-input-candidate-review/same_thread_turn.json`. The two failures are the original expected-refusal assertions, not xfails or weakened checks.

Then only the newly added oracle counterexample:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider /tmp/realtime-input-candidate-review/test_candidate.py::test_empty_or_prompted_oracle_terms_must_not_claim_matching_evidence --tb=short
```

Result: **1 failed in 1.44 s**, retained `/tmp/realtime-input-candidate-review/oracle-pytest.txt`. The file now contains six tests; the complete six-test set was not redundantly rerun. Expected failures are preserved for same-owner hardening.

No owner/main/user-candidate edit, live session, actual child launch, credential access, DB/provider/Windows/capture/audio/network operation, or native Chat action occurred. Only temporary review artifacts were written. Next owner: Support fixes the observer/oracle release preflight and truthfully enables the chosen codec-evidence branch; lead reviews the exact resulting candidate and coordinates the single live release if these defects are resolved.

Raw synthetic receipt clarification: the candidate hard-codes `mode=live_fixture` in `run_live`. In the four review JSON artifacts this label is merely the unmodified function's output: **all are in-memory harness receipts, not actual account execution**. `/tmp/realtime-input-candidate-review/README.md` supplies that explicit provenance alongside the preserved raw receipts and the full schema-valid `thread/realtime/item/completed` / `item.type=bemItemPromoted` event. Its backing identifiers are exact snake_case `item_id` and `turn_id`; canonical identity uses `id` and `realtimeSessionId`.
