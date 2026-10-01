# Realtime probe preconditions: Codex 0.158.0

Checked 2026-10-01. Project baseline:
`44a576c64354c57a83f84ddaa6e097e555c512e3`.

**The adopted candidate remains blocked from real execution under the unchanged
managed ChatGPT client.** The direct WebSocket path has an authentication mismatch, and
the conversational v2 path does not establish the required absence of tools or
backing-Codex delegation. Separate WebRTC possibilities remain unverified, not
declared impossible. This is source analysis, not a measured installed-binary
refusal, account rejection, or proof that all managed audio is unavailable.

This continues the same bounded task after the lead supplied the candidate and
two concrete regression witnesses. Analysis used existing generated schemas,
project source, the supplied sanitized metadata receipt, and public official
source. The existing fake Python child was checked offline. One synthetic English
utterance was generated into memory, as recorded below. Public Rust files were
cached for provenance and never executed. No Codex binary, account/login/auth
operation, inference, microphone, display, physical playback, provider change,
dependency installation or production edit occurred.

## Evidence and provenance

The preceding [audio protocol report](windows-audio-codex-protocol.md) establishes
ordinary `audio`/`localAudio` inputs and six experimental realtime RPCs in the
installed 0.158.0 schemas. Those schemas were reread; they still do not specify
the audio byte encoding, a buffer commit operation, or a tool-disabling start
parameter.

The supplied receipt records seven text/image models and successful
`thread/realtime/listVoices` in
`work/windows-live-experience-20261001/audio-metadata-after-user-exit-01.json`,
SHA-256 `d23d9cc6fe006b87f542ef2fcec40ef8da9b0e922dd0dbf7598cf83cea000829`.
This review did not rerun that metadata operation. The source below explains why
voice-list success provides no additional authentication or audio entitlement
evidence.

The receipt's two connector hashes were independently matched to `git show` at
the assigned project baseline: `chatgpt_launch.py` SHA-256
`b4c89171f025056062a091dab47ac6c3b3f372843da428a72b35f7d8eab49090`,
and `chatgpt_rpc.py` SHA-256
`28d1f3102b5e1d1b5c8eb173748da168a16f19fc21eafbd275395c7c0dd7fdb3`.

Official tag `rust-v0.158.0` resolves through annotated tag
`54e1bd264b4122fe9471ee7d54c4d021a76bb8ff` to target **type `commit`**,
`064c6b8c737f5b41d171fdda80bd9ef10ad06eb3`. This commit identity comes from the
[annotated-tag response](https://api.github.com/repos/openai/codex/git/tags/54e1bd264b4122fe9471ee7d54c4d021a76bb8ff),
not an inference from the tree response. Public tag/ref/tree responses are cached
alongside source in `/tmp/lc-realtime-0158-source-szjf83fs/`. Each downloaded
source's Git blob hash matches its entry in the returned release tree.

| Cached source file | SHA-256 |
| --- | --- |
| `realtime_conversation.rs` | `1e1d2705f025e442d0935a30cc4654c4a7564b47d61ab899c4f7f1a101b75280` |
| `turn_processor.rs` | `0a1058134accb3f9285aa940708e109704b582b8fc35d04f1dfb84e1231fc1e0` |
| `methods_v2.rs` | `391ddf4fb4563ef780f2eacebd277920b56b8621083e228ac8ccb6f4a64d3e60` |
| `methods_common.rs` | `358bfba763d1885a27df4b451004de1dad724f193675edc095f42e93c2747a3f` |
| `protocol_v2.rs` | `fd9f61fd400066e3109f0786b4d4d13c086b4813ee7aa0085e3fbc93c186f02b` |
| `auth_manager.rs` | `01cb49b1cca566dddc47def60b52848da0717c7de6a33d8b7160b6fc4cafd881` |

The exact admitted Linux executable remains identified by the earlier CLI receipt
and SHA-256 `167c0148a849d2444f1b5a7fb5f8bb2de1de5ae13a2a504b833fc765980f5cd9`.
Same-version public source plus matching schema names is not a reproducible-build
attestation equating these source bytes with that executable. No new binary
measurement or runtime behavior is claimed.

The installed static resource `codex-resources/voice/manifest.json` was also read
under the 0.158.0 standalone package. It declares the same build commit and
`appVersion: 0.158.0`; its SHA-256 is
`5d40dfe25e8575e56a98d31e8c645988c6313bf948fb670eb404d0be7a79a7b9`.
This corroborates package provenance without executing the binary; it is still
not a live authentication result or a reproducible-build attestation.

## Authentication and version constraints

In the [same-tag core implementation](https://github.com/openai/codex/blob/064c6b8c737f5b41d171fdda80bd9ef10ad06eb3/codex-rs/core/src/realtime_conversation.rs#L1407),
WebSocket startup calls `realtime_api_key` (1407–1415). Its resolver (1873–1896)
accepts a provider key, configured experimental bearer token, auth API key, or an
OpenAI-provider environment API key; otherwise it returns
`realtime conversation requires API key auth`. There is no managed-token branch.
Text output requires v2 (1567–1572); WebRTC/existingCall reject v2 (1367–1375,
1463–1475). Incoming handoffs route to Codex (1750–1772);
`clientManagedHandoffs` controls outgoing handoffs (926–928, 1172–1174), not that
admission. Startup preparation errors become error events (1253–1285).
Shutdown cancels input and awaits fanout (1222–1250), then emits closed
(2723–2746); queued handoffs are drained. These paths do not establish backing-turn
cancellation or suppression of already queued client output. Therefore the client
must independently invalidate late output and must not treat realtime stop as a
verified all-work cancellation boundary.

The [auth accessor](https://github.com/openai/codex/blob/064c6b8c737f5b41d171fdda80bd9ef10ad06eb3/codex-rs/login/src/auth/manager.rs#L565)
explicitly returns `None` for `CodexAuth::Chatgpt` and
`CodexAuth::ChatgptAuthTokens`; only `CodexAuth::ApiKey` yields a key (565–576).
This is an inspected implementation distinction, not an assumption about OAuth.

At the assigned project baseline, `chatgpt_launch.py:_settings` uses
`forced_login_method="chatgpt"`, the custom managed provider, Responses transport,
`requires_openai_auth=true`, zero retry settings and `supports_websockets=false`.
It supplies neither provider key nor experimental bearer token; `_environment`
omits inherited API credentials. This configuration cannot be treated as one of
the resolver's API-key overrides. `supports_websockets=false` describes the
Responses configuration and does not authorize a different realtime auth route.
No override, key extraction, environment injection or API activation is proposed.

Audio output to a memory sink was permitted as a design option, so the text/v2
restriction alone does not exclude alternatives. WebRTC audio v1/v3 requires
SDP negotiation and a peer transport absent from the unchanged Python client;
`existingCall` requires a legitimate already-created call ID that is not present.
Neither is an automatic version/auth fallback. Their safe capability and
delegation behavior have not been established here.

Support's bounded fake check extracted the `FAKE` literal with Python's AST from
the exact baseline `test_chatgpt_rpc.py`, without importing that module, and ran
one Python child with a five-second cap. After `initialize`/`initialized`, realtime
listVoices, start and stop each returned empty objects; no realtime notifications
were emitted, and the child exited zero. Temporary synthetic logs were removed.
That establishes a gap in the existing fake's
realtime behavior, not sequence correctness or entitlement. No Codex/account
operation or new fixture implementation was involved.

## What the RPC lifecycle actually establishes

The [RPC processor](https://github.com/openai/codex/blob/064c6b8c737f5b41d171fdda80bd9ef10ad06eb3/codex-rs/app-server/src/request_processors/turn_processor.rs#L328)
returns `RealtimeVoicesList::builtin()` directly (328–337), without an auth lookup
or provider call. Start/input/stop load the supplied thread, check direct-input
eligibility and attach a listener (1165–1189). Start does not create the thread:
a fresh bounded experiment would first need an authorized `thread/start`, not an
invented ID or borrowed user thread. Start, append and stop submit core operations
and return empty acknowledgments (1227–1286, 1289–1313, 1369–1385).

Thus only a conditional structural order is established:
`initialize` with experimental opt-in → separately created fresh thread →
realtime start → successful started/error observation → bounded audio append →
observable result/error → stop acknowledgment and closed observation → owned
process cleanup. This is **not an executable safe recipe**: auth, tool isolation,
input bytes and terminal-result semantics must be satisfied first. Never advance
from an empty start acknowledgment directly to input.

The installed schemas expose no realtime `commit`, `response/create`, or
`cancelResponse` RPC. `transcript/done` finishes a transcript part; `item/completed`
finishes an item; `closed` describes session closure. None alone verifies successful
whole-input acoustic understanding. Stopping early to force a result is not a
proven commit operation.

## Framing, VAD and tools: bounded findings

[V2 session construction](https://github.com/openai/codex/blob/064c6b8c737f5b41d171fdda80bd9ef10ad06eb3/codex-rs/codex-api/src/endpoint/realtime_websocket/methods_v2.rs#L80)
selects PCM input, near-field noise reduction and a transcription model. The
conversational mode enables server VAD, 500 ms silence, response creation and
response interruption (89–104). This is server-driven turn detection, not an
App Server commit primitive. It unconditionally advertises `background_agent`
and `remain_silent` with automatic tool choice (32–37, 115–143).
Transcription mode removes tools/output and VAD (145–167), but changing session
mode is outside the unchanged configuration and does not solve WebSocket auth
or establish native acoustic reasoning.

The [common adapter](https://github.com/openai/codex/blob/064c6b8c737f5b41d171fdda80bd9ef10ad06eb3/codex-rs/codex-api/src/endpoint/realtime_websocket/methods_common.rs#L26)
sets the rate to 24,000 Hz. It normalizes v1/v3 to conversational mode (29–39),
so choosing v1 cannot silently preserve a transcription-only v2 configuration.
The [v2 parser](https://github.com/openai/codex/blob/064c6b8c737f5b41d171fdda80bd9ef10ad06eb3/codex-rs/codex-api/src/endpoint/realtime_websocket/protocol_v2.rs#L140)
turns a completed `background_agent` function call into `HandoffRequested`;
client-side refusal of an unrelated dynamic-tool RPC does not prove this internal
delegation is intercepted.

Exact signedness, endianness, channel packing, base64 framing, accepted chunk
size and input-end behavior were **not fully established** by the bounded files
reviewed. The schema's `data:string`, sample rate and channel count cannot fill
those gaps. In particular, the earlier 22,050 Hz synthetic WAV is not verified
as directly appendable; do not send a RIFF/WAV header or invent transcoding and
silence-padding behavior. Source exploration stops because the independent auth
and delegation blockers already prevent the requested safe sequence.

Following the candidate handoff, three additional exact-commit files were checked
and the codec review stopped at that bound. The
[WebSocket writer](https://github.com/openai/codex/blob/064c6b8c737f5b41d171fdda80bd9ef10ad06eb3/codex-rs/codex-api/src/endpoint/realtime_websocket/methods.rs#L345)
forwards only `frame.data` to the V1/V2 input-audio append message; it does not
transcode or forward the chunk's sample-rate/channel/sample-count/item-ID fields.
Those metadata fields therefore cannot configure the upstream PCM codec.
Its SHA-256 is `2d4dd67a4d61abbc36f8fd0a50875d9643bebfe52f2638d013881f1933cce939`.
The additional protocol realtime-items source
(`19cbfc92752190d6d65f4b0d5692f400dd49eec8807d6ac5b2e3bae33c539c9b`) and audio
preparation utility (`e7e1472c4c6a643f31217039181f1c87a9f5ef3f04294f6959eee09a2c81fc28`)
did not establish the missing input signedness/endianness/channel contract.
Output-side base64 decoding and two-byte samples do not prove the input contract.
PCM at 24 kHz is configured by V2 source; the complete PCM16LE/mono/base64 input
representation, 100 ms chunk size and one-second silence tail remain candidate
choices eligible for a separately reviewed experiment, not verified wire facts.

The core `audio_in` method (829–854) can drop a frame when its queue is full and
still return success. A successful append acknowledgment therefore does not even
prove all input bytes entered the transport. Final user transcription and the
unprompted oracle remain necessary; their absence must not be relabeled as a
typed entitlement or codec failure.

## Adopted candidate and generated utterance

The supplied `audio-route-next/realtime_input_probe.py` (SHA-256
`d9a8320971e6c20ade82f34c6c77c47ed688378e1a69494a40fffe1456407f27`), full README
and offline receipt were read. The candidate is adopted under
`tests/probes/support/realtime_input_probe.py`; it is a reviewed preparation,
not a working authenticated realtime route. Permission for a reviewed candidate
codec experiment is no longer the blocker. The unchanged route's authentication
and delegation conditions remain separate technical blockers, with no CLI flag
to bypass them. Do not treat the prompt's request not to delegate, or detection
of a turn after it has started, as prevention of backing inference.

The lead's independent original-candidate report and synthetic traces were read
at `/tmp/realtime-input-candidate-review.md` and its same-named directory. Preserve
the original outcomes: eight self-checks passed, while a separate lifecycle run
had three passes and two failures (foreign-thread ordinary turn and canonical
`bemItemPromoted`), followed by one isolated empty-oracle failure. They are actual
pre-fix defects, not expected-failure acceptances. The harness used the production
RPC client with in-memory transport; its inherited `mode: live_fixture` label
does **not** mean a real account call occurred. Detection of internal inference
after it is observed remains a limitation even after the false-success bugs are
fixed; no observer can establish prevention by itself.

The adopted candidate pins text output to V2, rejects ordinary turns and canonical
backing-item promotions across the entire private child, rejects repeated/foreign
startup and transcript evidence, and never credits pre-input or post-stop text.
It waits for complete fixture submission and all whole-term, nonempty, unprompted
oracle matches; an error/transport closure or fatal client state cannot pass.
The original per-output exclusive, fsynced attempt claim remains, including after
uncertain failure. It is not a global anti-rerun token across filenames. Primary
work plus bounded stop/close and the existing factory's two shutdown waits is
nominally 58 seconds; this is not a measured hard whole-process deadline.

Both the CLI `--live` path and direct `run_live()` fail before project imports,
fixture/state reads or attempt creation. No flag, codec approval or permission
flag bypasses the source-evidenced block. Six local Python source hashes are
pinned, but package data/installed dependencies and the complete import origin
boundary remain unverified; those hashes are not described as full import
isolation. Existing factory/auth/lock/cleanup source remains unchanged.

The [offline-check receipt](windows-realtime-offline-checks.json) records **17
revised fake-dependency tests, four fixture-wrapper mock tests, and six production
RPC/in-memory-transport checks passing**. The latter reuse the supplied independent
harness against a frozen export of exact baseline `44a576c`, preserving the
original failure artifacts. The live entry gate is mocked only inside an already
fake-process context; the success control now supplies the source-supported
`reason: requested`, and invalid oracles must raise rather than create evidence.
No OS Codex child, real factory/state, account or network was used. Schema checks
use the existing installed-version generated files. The receipt retains original
and adapted harness hashes; temporary harness/source paths are recorded for
review. This verifies corrected observation and reporting, not real entitlement.

Safe default and focused candidate checks:

```sh
python3 tests/probes/support/realtime_input_probe.py
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests/probes/support -p test_realtime_input_probe.py -v
```

The default prints the blocked plan only. There is deliberately no live release
command for the unchanged WebSocket route.

The [fixture generator](../../../tests/probes/support/windows_realtime_fixture.py)
reuses installed `System.Speech` and Microsoft Zira Desktop. It was run once,
with `SetOutputToAudioStream` targeting a `MemoryStream`, explicitly 24,000 Hz,
16-bit mono. It did not select a microphone or speaker. The generated sentence
was **"The silver lantern is beside seven green triangles."** The oracle terms
are `silver lantern` and `seven green triangles`; they must never be included
in the realtime prompt. Its [native receipt](windows-realtime-fixture-receipt.json)
records 181,416 PCM bytes / 90,708 samples / 3,779.5 ms, SHA-256
`d2d080f12e0e6938a4187340588add40772fe57c63dac7669b7d4a19ff33ab3d`, and native
process exit zero. Raw PCM was discarded; no audio/transcript file was retained.
This proves generation of those bytes, not their upstream acceptance.

Importing the generator is passive. Its `generate()` function returns PCM and
metadata in memory for a later reviewed caller; it is deliberately not wired to
an enabled account operation. Its standalone CLI saves only metadata:

```sh
python3 tests/probes/support/windows_realtime_fixture.py --output /tmp/new-fixture-metadata.json
```

That command performs another native synthesis and was **not repeated** for
verification. Four offline mock checks cover malformed audio, existing-output
protection, sanitized failure receipts and non-persistence of raw bytes:

```sh
python3 -m unittest discover -s tests/probes/support -p test_windows_realtime_fixture.py -v
```

## Decision and next owner

The lead then requested one bounded check of the already-present WebRTC branch,
not a general alternative survey. Two exact-commit files were added to that
read-only review:

| File | SHA-256 |
| --- | --- |
| `core/src/client.rs` | `360f2b1c4c8e9053ac6de965e4ba66d94eb2fd8aa89d4d69de9249821af76ef9` |
| `codex-api/src/endpoint/realtime_call.rs` | `b08ffff66ba728d5275e52d5ac04b976a49b5eb1eb8efad9dd65ccafc49271b3` |

**WebRTC has a source-supported managed-auth call-creation path.** It skips the
direct WebSocket `realtime_api_key` check. In
[`create_realtime_call_with_headers`](https://github.com/openai/codex/blob/064c6b8c737f5b41d171fdda80bd9ef10ad06eb3/codex-rs/core/src/client.rs#L679),
`current_client_setup(ConfiguredProvider)` supplies the configured provider and
its resolved auth; the sideband reuses that identity. The source explicitly
handles ChatGPT bearer/account identity, without extracting credentials into this
probe or requiring a new API key. No experimental endpoint/auth override is
needed by this branch's call-creation code. Actual account endpoint access and
sideband acceptance remain untested.

The [HTTP call implementation](https://github.com/openai/codex/blob/064c6b8c737f5b41d171fdda80bd9ef10ad06eb3/codex-rs/codex-api/src/endpoint/realtime_call.rs#L129)
sends SDP/session configuration to the provider's realtime call endpoint; response
SDP and the `Location` call ID are returned internally. Core publishes the answer
through `thread/realtime/sdp`, not the empty start response. The installed SDP
notification schema SHA-256 is
`1e276f48d346e6cace65551f84ef9b0bc8daba2a3ce93499f3a902551de239fc`.

This does **not** make the current input-only candidate safe to switch transports.
WebRTC defaults to V1 and permits V1/V3 conversational audio, rejecting V2 and
transcription mode; the current text-output V2 request is incompatible. Received
audio could be left unplayed in a future generated-media Electron peer, but that
does not disable server audio generation or internal delegation. The same core
handoff route can start backing work before it notifies the client. Its isolation
is therefore still unresolved under the present no-backing-turn scope. No WebRTC
adapter, SDP exchange, media peer or account operation was built or run. The next
precise condition is an official enforceable delegation boundary for that managed
WebRTC path, not another API-key attempt or a generic audio survey.

The supplied candidate was adopted and a new utterance generated, but no audio
was sent and no real account operation was performed.
Startup entitlement, accepted PCM, correct transcript/output, stop/late-output
behavior and real-child cleanup remain unmeasured; the offline fake's clean exit
does not establish any of them.

Lead/backend should retain the unchanged production connector and this concrete
blocker. Reopen this bounded investigation when an official supported managed-auth
transport and enforceable delegation controls are available, or the lead chooses
a separately authorized alternative. First verify byte framing, terminal events,
owned process cleanup and stale-output rejection. Any later real probe still
requires the lead's coordinated account lease, one session and one generated
non-sensitive English utterance, a maximum of 60 seconds, no retry, no physical
microphone/speaker, and sanitized evidence only. This preparation grants no lease.
Ordinary audio attachments,
WebRTC and local ASR remain distinct candidates; this report rejects no whole
product requirement and grants no provider/account/device operation. R60/A47–A49
and live audio/screen acceptance remain open.
