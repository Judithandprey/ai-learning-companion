# Support 3167dbf: independent bounded review

Verdict: **ACCEPT as a dormant/offline diagnostic delivery; HOLD every live audio release.** No blocking defect was found within the delivery's stated offline scope. The unconditional live gate is honest and necessary under the unchanged installed-client/input-only/no-unrequested-backing-turn constraints. This is not delivery of working managed audio or R60/A47–A49 acceptance.

Reviewed exact Support commit `3167dbf103986bf0a6b339c0138ccb9579847135` in its clean worktree. Parent main baseline is `b6029ae0d57334b8ef142f6cf271f553cd31b21c`; ongoing main documentation edits were preserved. Used PONYTAIL LITE and the project workflow. Relevant requirements: D-SUBSCRIPTION-FIRST, AUDIO-01/02/11–15, AVTEST-11/12 and A47–A49. The parent's explicit generated-audio candidate-codec authorization removes a permission question, not the independent transport/delegation blocker.

## Corrected defects and proportional validation

- `Observe.feed()` now observes child-wide ordinary `turn/started`, ordinary item events, and canonical `bemItemPromoted` before thread filtering. The original foreign-thread and canonical promotion counterexamples now fail the attempt. Same-thread refusal and normal synthetic lifecycle remain working controls.
- Empty, whitespace, trivial and prompt-contained oracle terms are refused. Matching respects whole-term boundaries. Complete fixture submission plus all oracle terms is required; pre-input, foreign and post-stop evidence cannot establish success.
- Startup version/ownership/duplication, error close, fatal reader state and unreaped child prevent success. Stop/close and cleanup remain bounded in design. The reported 58 seconds is explicitly nominal arithmetic, not measured end-to-end termination proof.
- CLI `--live` and direct `run_live()` refuse before project imports, fixture/state reads or attempt creation. Codec flags do not override this. Tests replace this gate only inside explicit fake contexts.
- The fixture generator stays passive on import, targets a memory sink, and saves metadata only. Its four tests mock subprocess execution. The existing recorded native synthesis was not repeated; discarded PCM means this review cannot independently reconstruct its recorded byte hash.

Executed once: **17 probe tests + 4 fixture-wrapper mock tests + 6 production-RPC/in-memory tests = 27 passed**. Default plan and exact-commit `git diff --check` also pass. See `commands-results.json` and the five named logs. The six-case harness was copied with only its output directory changed; original pre-fix and Support evidence was not overwritten. It uses frozen exact-baseline production RPC source, a fake launcher/transport, and installed generated schemas. No real factory, account, Codex child, network, microphone, playback or device operation occurred.

All seven changed paths match the delivery commit byte-for-byte; JSON documents parse and all four Python files compile via in-memory `compile()`. `changed-paths.json` supplies exact hashes:

1. `docs/verification/support/windows-realtime-fixture-receipt.json`
2. `docs/verification/support/windows-realtime-offline-checks.json`
3. `docs/verification/support/windows-realtime-protocol-preconditions.md`
4. `tests/probes/support/realtime_input_probe.py`
5. `tests/probes/support/test_realtime_input_probe.py`
6. `tests/probes/support/test_windows_realtime_fixture.py`
7. `tests/probes/support/windows_realtime_fixture.py`

The receipt's probe/test/harness/generator hashes match their actual files. Six candidate source pins match exact `44a576c` source, the frozen test snapshot, and current main files. Six inspected official-source blobs also match the previously cached `064c6b8` release tree. Original/English affected requirement pairs match the manifest at committed `b6029ae`. Details: `source-provenance.json`. This checked cached provenance, not a new network fetch or reproducible-build equivalence to the installed executable.

## Precise route finding

At official source `064c6b8c737f5b41d171fdda80bd9ef10ad06eb3`:

| Route | Source-supported facts | Current decision |
| --- | --- | --- |
| Current V2 text/WebSocket candidate | `realtime_conversation.rs:1407` invokes `realtime_api_key`; resolver `:1873` accepts API-key/explicit-bearer sources and has no managed ChatGPT branch. | Do not run or add a key/token override. No installed-binary/account refusal was measured. |
| WebRTC V1/V3 audio | `core/src/client.rs:679` uses `current_client_setup(ConfiguredProvider)` and matching managed auth for call creation/sideband. `realtime_call.rs:129` sends SDP/session configuration and returns answer SDP/call ID. Core publishes `thread/realtime/sdp`. | This is a real source-supported managed-auth candidate. Account/endpoint/sideband acceptance is unmeasured; model/voice metadata cannot establish it. |
| Input-only isolation on that WebRTC route | `realtime_conversation.rs:1462` requires V1/V3 conversational mode; `:1567` permits text-only output only with V2. Handoff admission starts enabled (`:136–154`, `:668`); `route_handoffs.route()` runs at `:1772` **before** forwarding the event to the client. `clientManagedHandoffs` is applied to outgoing handoff behavior, not this admission. | A client-side observer/whitelist/no-tools prompt cannot enforce no backing submission. The unsupported V2/transcription swap, an unplayed remote track, or faster stop does not fix this boundary. |

The smallest technically relevant next transport is therefore **the existing official managed-auth WebRTC branch**, not another WebSocket/API-key attempt. It is **not executable safely under this task's current input-only scope**: no exposed pre-admission control was established that disables/refuses internal backing work before it is queued. Call creation also supplies the session configuration before media connection, so adding a peer first and changing behavior afterward would not establish the boundary.

## Narrow next implementation decision

Integrate this diagnostic/hardening commit without removing its gate. **Do not build or release an Electron peer solely to work around the codec/auth finding:** it cannot remove the demonstrated delegation blocker and would add code before the required boundary exists. No second survey or repeated account attempt is indicated by these sources.

The precise prerequisite for the existing Backend owner is an official, exact-build, managed-auth control that rejects internal handoff admission before backing work starts (or a separately authorized, explicitly different experiment). Validate that control offline with a forced handoff witness before any live release. Once that prerequisite exists, the smallest adapter is the existing Electron `RTCPeerConnection`, generated media only, an unplayed in-memory remote sink, the official start/SDP-notification path and one bounded attempt; retain cleanup and stale-output rejection. This conditional outline is not an implemented route or a grant to run it.

The currently permitted candidate-codec experiment needs no renewed codec permission; it simply cannot resolve this independent enforceable-boundary problem. Keep native TTS/Windows consumer work moving with existing owners. Ordinary audio attachments and local ASR remain separate unverified alternatives, and this finding does not declare all managed audio impossible.

No main or owner file was edited, no Git mutation performed, and no native Chats invoked. All review artifacts are under `/tmp/lc-support3167-review`.
