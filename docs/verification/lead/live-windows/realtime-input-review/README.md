# Reusable realtime input candidate: exact pre-live findings

Same Windows live task, main `612ce3a`; no new role, provider, account or product
requirement. The user's supplied `audio-route-next/realtime_input_probe.py` has
SHA-256 `d9a8320971e6c20ade82f34c6c77c47ed688378e1a69494a40fffe1456407f27`.
It reuses the managed factory, ephemeral thread and official experimental RPCs.
Its eight offline self-checks pass; no actual audio input is demonstrated.

The user explicitly permits either exact-build codec evidence or a reviewed
candidate-codec experiment using generated non-sensitive audio. The unset codec
constant is therefore an implementation/evidence prerequisite, not another user
permission question. A candidate must not be labeled a verified encoding merely
because an enable flag was set. Existing account lock, one durable attempt claim,
no retries and bounded shutdown remain required. No actual account/audio/device
operation was performed in this lead review.

## Concrete failures to fix in the same candidate

[Independent review](review.md) exercised actual connector methods with in-memory
transport, without starting a real child. [Five-case output](boundary-before.txt):
3 pass, 2 fail (log trailing whitespace normalized only). A foreign-thread ordinary `turn/started` and a schema-valid
`thread/realtime/item/completed` / `item.type=bemItemPromoted` with an unrequested
`turn_id` both escape detection and allow a false successful input-only receipt.
The same-thread refusal control works. The existing connector does not supply
that missing guard when the probe has no active ordinary ASK job.

The observer must refuse child-wide unexpected inference before thread filtering,
including canonical promotion evidence. Detection after an event is not proof
that no unexpected submission occurred. Stop/reap and retain failure/uncertainty;
never retry. Final transcript selection still belongs to the exact owned thread.

An additional [isolated oracle case](oracle-before.txt) fails: an empty expected
term matches any transcript. Require meaningful nonempty fixture terms absent
from every outbound prompt. A final upstream `role:user` transcript indicates the
input direction, not independent proof of a particular human speaker or permission
to answer. Keep capture-source and speaker/addressee attribution separate.

[Exact probe tests](test_candidate.py) preserve the counterexamples. The original
five cases were not rerun as a larger campaign after adding the oracle case.
Candidate `run_live` outputs the string `mode:live_fixture` even under these
in-memory fakes; that label does **not** turn any review output into live-account
or audio evidence. No production connector or supplied original was edited.

## Additional exact-source route constraint

Lead inspected Support's in-progress source analysis to coordinate, without
treating its uncommitted draft as a delivered result. The already cached public
source at official build commit `064c6b8c737f5b41d171fdda80bd9ef10ad06eb3` shows:

- [WebSocket startup and resolver](https://github.com/openai/codex/blob/064c6b8c737f5b41d171fdda80bd9ef10ad06eb3/codex-rs/core/src/realtime_conversation.rs#L1407)
  requires an API key/bearer override and reports an API-key-auth requirement when
  those are absent. The managed factory supplies none. The resolver has no
  managed ChatGPT token branch; this must not be worked around by extracting one.
- The same source contains a separate WebRTC branch with different version/output
  constraints. Its end-to-end managed-auth compatibility is still unverified;
  this finding does not reject every official audio route.

The inspected source SHA-256 is
`1e1d2705f025e442d0935a30cc4654c4a7564b47d61ab899c4f7f1a101b75280`;
the corresponding auth accessor SHA-256 is
`01cb49b1cca566dddc47def60b52848da0717c7de6a33d8b7160b6fc4cafd881`.
Same-build source analysis is not an actual installed-binary/account refusal or
reproducible-build attestation. No live startup was run to manufacture that claim.
The [official App Server page](https://learn.chatgpt.com/docs/app-server) was also
searched/opened; general experimental opt-in does not establish this codec or
account entitlement. No API key, auth override, new billing or purchase is allowed.

## Existing owners and exact next action

Support owns the supplied candidate's reuse/hardening and exact route finding.
Its same-task handoffs are accepted as
`handoff_34606c1f05d997b392a93590af91f8e2` (reuse),
`handoff_cda09af8aaf42f35c0034694646d2c86` and
`handoff_2cd256850362c2aa1fa1933bee75c6bc` (two concrete inference witnesses), and
`handoff_7a52c4e1b3a246a885e2902b96cf9692` (final review/oracle/auth reconciliation).
They amend one current task, not four assignments.

One next bounded check, accepted as `handoff_78ade134c20daf3a257302a4a4a5ffa8`,
is the already exposed official WebRTC call-creation/auth/answer-SDP branch. If it
can preserve managed auth and isolation, reuse Electron's existing peer API for
a generated-audio/no-playback candidate; otherwise return the precise blocker.
Do not construct a known API-key-only production route or repeat a general survey.
Lead retains the exclusive real-account lease; preparation grants none.

Latest receipts initially say unread/execution_started:false. A new Support
protocol draft is observed, not a completed candidate or proof all amendments
were read. Windows continues current trusted TTS and whole-frame/auto-focus/live
consumer work; Backend owns later verified audio transport, and QA retains one
integrated behavior pass. Transcription + image + TTS is an explicitly limited
composition, not native acoustic/visual fusion or complete AUDIO/AVTEST acceptance.

## Received correction and integration

Actual Support delivery `3167dbf103986bf0a6b339c0138ccb9579847135`, received as
`handoff_84e4a609a4fa94991277a031be1521c7`, corrects the inference/oracle failures
above. [Independent review](support-delivery-review.md) approves its **offline
scope**: 17 lifecycle + four fixture mocks + six production-RPC/in-memory cases
pass. Integrated as `e04a196`; all seven changed paths match and 21 resulting-main
unittests pass in 0.065s. [Exact checks](support-delivery-checks.json).
No actual account, microphone, playback or model request was run.

The live gate stays closed: managed WebRTC auth is source-supported, but incoming
handoffs are admitted before client observation, so this input-only experiment
cannot enforce no additional backing inference. A peer implementation alone cannot
fix that. This is not a blanket managed-audio refusal. Existing ordinary
`audio/localAudio` remains untested; Backend owns the next minimal candidate over
the existing managed ordinary-turn lifecycle, with explicit submission accounting,
original guards and no unrequested additional turns. Lead reviews exact source and
allocates at most a bounded generated-audio test when it is ready. No API key,
credential extraction, new billing, endpoint override or uncontrolled retry.

## Ordinary-turn follow-up: actual source finding received

At main `667c31f`, Backend actually replied to its existing continuation
`handoff_43f653a148a064ba56055bf800a90d87`. Initial
`handoff_c85be0aa0b0471cd33288cd50c011eeb` proposed extracting a private ordinary-turn
lifecycle from `chatgpt_rpc.py`; the existing PNG wrapper and text/image receipt
schema cannot truthfully be reused by substituting audio after their checks.
Lead read those actual call paths and started a narrow read-only boundary review.

Before any delegation or production change, Backend's later
`handoff_2ce789671cb5b7b9ed90d2077700106f` withdrew that proposal. It reports pinned
`064c6b8` `core/session/turn.rs` → `history.for_prompt` →
`strip_audio_when_unsupported`: without `InputModality::Audio`, the upstream
request substitutes an unsupported-media text placeholder. The already recorded
14:58 catalog contains seven text/image models, no declared audio model. Exact
source/model-info mapping and artifact provenance are still due in Backend's
bounded evidence delivery; this paragraph records the actual report, not an
independent installed-binary run or an account rejection. No audio request was
made, and successful text after removal of audio could not prove acoustic input.

Lead's substantive same-task reply was actually accepted as
`handoff_4a9dc3e9cba791893944719dbffd404f`: hold the extraction/adapter, finish the
precise evidence and smallest official prerequisite, preserve all production
interfaces and do not take an account/device lease. Initial receipt is unread /
execution_started=false, not proof the reply was adopted. The previous source
response itself establishes actual Backend work, rather than mere dispatch.
No new assignment, auth path, provider, model fallback or broad survey was opened.

The interrupted extraction review made no edits or calls. Its already-observed
constraints remain relevant if a supported route later exists: preserve durable
pre-write intent and post-I/O cancellation fencing; keep audio facts out of the
image receipt; retain modality guards; handle legitimate early turn events while
rejecting foreign inference, and await owned-child reap. These are design
constraints, not implemented changes or executed acceptance. Windows' current
TTS/whole-frame consumer and Mac's current correction retain their owners.

## Independent work while the input source evidence is prepared

Lead's bounded read-only review of Web checkpoint `d0e5f80` (same reviewed paths
at `79d0811`) found two TTS issues before release. Owner work remained untouched:

- `apps/windows/src/main/main.ts:1032` records `spoken=started` before `say()`;
  an immediate throw becomes `interrupted` even without playback. The existing
  `overlay-surfaces.test.ts:643–650` expects that false-positive record. Actual
  voice start/completion evidence must distinguish played help from attempted or
  unknown output. `audible=true` alone is not evidence a piece reached playback.
- `main.ts:1511–1517` joins exit cleanup with `Promise.all(...).catch(...)`. One
  rejection can allow final quit before another disposal finishes. Await each
  owned cleanup within its bound, including synchronous failure isolation.

Current-answer text authority, per-piece Talk/mute/session/request checks and
stale-reading identity guards were inspected; no additional blocker was found
in that limited path. No concrete voice adapter was connected at those commits,
so neither audible output nor child termination was exercised. Both offending
patterns were also observed in current Web WIP; this is source evidence only,
with no new test count or device/account claim.

The existing owner received these two concrete corrections as accepted native
message `handoff_b94b00e95d6fb7fb0c50418399f5c17a`, initially unread with
execution_started=false. They amend the current TTS/live handoff, not a second
task or independent QA campaign. Web fixes and returns exact checks; Lead reviews
and integrates, then QA executes the existing changed-flow acceptance on the
versioned actual app. Input-route evidence remains Backend's current dependency.

## Ordinary audio evidence reviewed and integrated

Actual Backend `35d0defce9c42e77ec0d029082e2a9957a96b7a2`, received as
`handoff_d0d2753648c9c374b1d294ebf014df40`, integrates as `fd199d3`.
[Owner source boundary](../../../backend/p0-04-ordinary-audio-source-boundary.md)
and its adjacent JSON retain the full chain and qualifications. Only those two
documentation files changed; production connectors match assigned `c7ae4e0`.

Lead independently fetched the three decisive pinned public files in memory:
`core/src/session/turn.rs`, `core/src/context_manager/history.rs` and
`core/src/context_manager/normalize.rs`. All SHA-256 and Git blobs match the
delivery. The actual code passes selected model modalities into prompt history
and strips InputAudio unless Audio is present. All 16 reported blob mappings
also match the existing non-truncated official tree. Installed stable schema
hash and both audio variant requirements, saved metadata hash/timestamp and all
seven text/image-only model declarations match. JSON and diff whitespace pass.

The first local validation helper incorrectly looked for wire-style
`inputModalities` in the sanitized receipt; reading its structure and using its
actual `input_modalities` key corrected the helper. Assertions were retained.
Initial web fetch cache misses and sandbox DNS failure were followed by one
normally approved read-only fetch of those three pinned files, with no source
snapshot written. These inspection errors are not product failures.

Decision: accept the evidence and keep this ordinary-audio adapter unimplemented.
The necessary same-model capability prerequisite is absent in the saved catalog;
this is not a fresh account refusal, installed-binary acoustic test, or a blanket
claim that all managed audio is impossible. No provider/account/device/audio
request occurred. Utilities' malformed/size behavior remains source evidence
only, since the ordinary callsite was not established. The prior optional cache
write denial was handled by Backend using read-only memory review; nothing
remains blocked by that denial and no bypass or user action is needed.

Backend completed this bounded source handoff. The existing Windows TTS/live
consumer, two TTS corrections and one eventual integrated QA pass continue.
Lead owns the next input decision; do not run repeated ordinary-audio attempts
or reopen the same schema-only candidate without new capability evidence.

## Next bounded existing-owner route check

Reviewed evidence/current task baseline `3f4580b` was normally pushed to origin/main.
Support's prior System.Speech receipt explicitly leaves other Windows speech APIs
unmeasured. Lead sent one next current-task check of installed
`Windows.Media.SpeechRecognition`/WinRT capability, native runtime and actual local
English recognition availability; no repeated Codex/realtime/account survey.

Native receipt `handoff_c0c29265c5847247938fd5430c5ae5f6` was accepted, initially
unread with execution_started=false. The bounded write paths remain Support's
probe/evidence directories. No installation, online activation, private capture,
audio device, model/account call or new framework is permitted. A single generated
in-memory fixture is conditional on a supported local non-device input interface;
language catalog metadata alone cannot pass. If such a path is unavailable, return
the precise installed/runtime/consent dependency and finish. Lead then decides the
input implementation, retaining Web's production ownership and current TTS/live
work. This continuation is one actual pending owner action, not proof it started
or a claim that usable voice input has been delivered.
