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
