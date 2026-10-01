# Ordinary Codex audio: source boundary

2026-10-01. Backend evidence delivery for the existing Windows live-input task,
against Lead baseline `c7ae4e0c79164af112648e6349c442c678f3f6b8`.
Production connector source remains at `91e72fe5c3d25b0372df79a51a6683df869d757a`
and is identical to that baseline. No adapter or shared RPC extraction was made.

**Decision: stop this ordinary-audio candidate before any real request.** The
pinned source removes audio before sampling when the selected model does not
declare audio input. The available historical model receipt lists seven models,
all with only text/image. A successful ordinary turn under those conditions
could answer after receiving an omission marker, without hearing the supplied
audio. Schema support is insufficient evidence of acoustic input.

This is a source-supported prerequisite, combined with recorded metadata. It is
not an audio execution result from the installed binary, a fresh account query,
or a claim that every managed audio route is impossible. No account, provider,
model, device, microphone, speaker or screen call occurred in this delivery.

## Requirement and delivery boundary

The affected source is R60/A47–A49, especially AUDIO-01/02/11–15 and
AVTEST-09/10/11/12 in the [audio specification](../../requirements/audio-screen-interpretation.md),
plus current D-SUBSCRIPTION-FIRST/D-AUDIO-SCREEN decisions and main §3.8/7.1.
The intended outcome remains real audio with full-screen context, faithful source
history, controlled disclosure, interruption and independent Stop. Text produced
after stripping audio cannot satisfy that outcome. A generated sample would only
test a transport candidate; it would not pass live microphone/system-audio or the
full Windows companion flow. AskEntry and the source archive remain unchanged.

The already recorded real generated-image response through the public live route
is separate positive evidence; see the baseline's
`docs/verification/lead/live-windows/actual-credit-vision/README.md`.
This result neither invalidates that image result nor establishes audio/TTS,
Windows GUI, macOS, personal-memory or full-product acceptance.

## Reproducible provenance

[Machine-readable evidence](ordinary-audio-source-boundary.json) pins source
paths, line ranges, SHA-256 and Git blob IDs. Official tag `rust-v0.158.0`
resolves through annotated tag `54e1bd264b4122fe9471ee7d54c4d021a76bb8ff`
to commit `064c6b8c737f5b41d171fdda80bd9ef10ad06eb3`.

Support previously generated the stable schema from installed Codex 0.158.0.
The existing `stable/v2/TurnStartParams.json` has SHA-256
`2dfcf68705896fadc344ccfeb2e9fe5a6bcbbb8b9a90cf449ce232b636daf05a`.
This review read that artifact without executing Codex. Its `UserInput.oneOf`
contains `audio` requiring `type,url`, and `localAudio` requiring `path,type`,
with string payloads. No codec, successful submission or acoustic understanding
follows from those shapes. Original schema provenance remains in
[Support's protocol report](../support/windows-audio-codex-protocol.md).

The sanitized `audio-metadata-after-user-exit-01.json` receipt was created at
`2026-10-01T14:58:18.475603+00:00`; its SHA-256 is
`d23d9cc6fe006b87f542ef2fcec40ef8da9b0e922dd0dbf7598cf83cea000829`.
This review independently read only its structural facts: seven models, one
modality set (`text,image`), zero models declaring `audio`. No account identifiers,
credentials, balance, local connection details or model names are copied here.
This receipt establishes the recorded catalog, not its future state or an audio
request to the currently running application.

## Complete relevant ordinary-input chain

All source links below are pinned to the official commit above.

| Boundary | Observed source behavior |
| --- | --- |
| App-server ordinary submission | [turn_processor.rs, 595–620 and 650–660](https://github.com/openai/codex/blob/064c6b8c737f5b41d171fdda80bd9ef10ad06eb3/codex-rs/app-server/src/request_processors/turn_processor.rs#L595) maps ordinary `params.input` through `V2UserInput::into_core` into `TurnInput::UserInput`, then submits via `start_or_steer_turn`. |
| Stable input to core | [v2/turn.rs, 445–450 and 478–480](https://github.com/openai/codex/blob/064c6b8c737f5b41d171fdda80bd9ef10ad06eb3/codex-rs/app-server-protocol/src/protocol/v2/turn.rs#L445) defines both variants. `into_core` carries `Audio.url` into `CoreUserInput::Audio.audio_url` and preserves the local path. [Core input definition](https://github.com/openai/codex/blob/064c6b8c737f5b41d171fdda80bd9ef10ad06eb3/codex-rs/protocol/src/user_input.rs#L42) describes encoded audio rather than a transcript. |
| Core input to content | [protocol/models.rs, 2051–2066](https://github.com/openai/codex/blob/064c6b8c737f5b41d171fdda80bd9ef10ad06eb3/codex-rs/protocol/src/models.rs#L2051) converts direct audio into `InputAudio`. Local input reads the file and [1822–1841](https://github.com/openai/codex/blob/064c6b8c737f5b41d171fdda80bd9ef10ad06eb3/codex-rs/protocol/src/models.rs#L1822) encodes bytes into a data URI using its extension, with surrounding path labels. Unsupported extensions or file-read errors produce placeholder text. No transcription inference appears in these conversions. |
| Catalog to public model list | [manager.rs, 121–131 and 168–179](https://github.com/openai/codex/blob/064c6b8c737f5b41d171fdda80bd9ef10ad06eb3/codex-rs/models-manager/src/manager.rs#L121) obtains catalog entries. [ModelInfo to ModelPreset, 941–974](https://github.com/openai/codex/blob/064c6b8c737f5b41d171fdda80bd9ef10ad06eb3/codex-rs/protocol/src/openai_models.rs#L941) preserves `input_modalities`. [app-server/models.rs, 16–40](https://github.com/openai/codex/blob/064c6b8c737f5b41d171fdda80bd9ef10ad06eb3/codex-rs/app-server/src/models.rs#L16) copies it into the public model; [public model definition, 116–133](https://github.com/openai/codex/blob/064c6b8c737f5b41d171fdda80bd9ef10ad06eb3/codex-rs/app-server-protocol/src/protocol/v2/model.rs#L116) serializes it as `inputModalities`. |
| Selected model to sampling settings | [step_settings.rs, 249–253](https://github.com/openai/codex/blob/064c6b8c737f5b41d171fdda80bd9ef10ad06eb3/codex-rs/core/src/session/step_settings.rs#L249) obtains the selected model's `ModelInfo`. [manager.rs, 229–237 and 782–800](https://github.com/openai/codex/blob/064c6b8c737f5b41d171fdda80bd9ef10ad06eb3/codex-rs/models-manager/src/manager.rs#L229) retains the matching model metadata. The [default modalities, 187–192](https://github.com/openai/codex/blob/064c6b8c737f5b41d171fdda80bd9ef10ad06eb3/codex-rs/protocol/src/openai_models.rs#L187) are text and image; omission is not inferred audio support. |
| Before ordinary sampling | [session/turn.rs, 512–527](https://github.com/openai/codex/blob/064c6b8c737f5b41d171fdda80bd9ef10ad06eb3/codex-rs/core/src/session/turn.rs#L512) calls history `for_prompt` with `step_context.settings.model_info.input_modalities` before `run_sampling_request`. [history.rs, 878–891](https://github.com/openai/codex/blob/064c6b8c737f5b41d171fdda80bd9ef10ad06eb3/codex-rs/core/src/context_manager/history.rs#L878) invokes the audio filter. |
| Decisive filter | [normalize.rs, 379–419](https://github.com/openai/codex/blob/064c6b8c737f5b41d171fdda80bd9ef10ad06eb3/codex-rs/core/src/context_manager/normalize.rs#L379) requires `InputModality::Audio`; otherwise it replaces `InputAudio` content. The [fixed marker, 16–18](https://github.com/openai/codex/blob/064c6b8c737f5b41d171fdda80bd9ef10ad06eb3/codex-rs/core/src/context/unsupported_media.rs#L16) states: “audio content omitted because you do not support audio input”. |

The public modality field and sampling filter derive from the same model metadata
family. Therefore, if the selected model uses the recorded text/image capabilities
without overrides, this pinned ordinary path cannot preserve raw audio to sampling.
This is a conditional source conclusion, not a live observation of a stripped
request. No catalog override was introduced to defeat that condition.

## Malformed and oversized media: retain the qualification

The inspected [audio utility](https://github.com/openai/codex/blob/064c6b8c737f5b41d171fdda80bd9ef10ad06eb3/codex-rs/utils/audio/src/lib.rs#L92)
defines omission-text behavior for invalid input. Its 207–262 region requires a
supported MIME, a base64 parameter, valid nonempty standard base64, and limits
encoded payloads to 69,905,068 characters and decoded content to 52,428,800 bytes.
The [local-media limit](https://github.com/openai/codex/blob/064c6b8c737f5b41d171fdda80bd9ef10ad06eb3/codex-rs/protocol/src/local_media.rs#L14)
is 50 MiB. Recognized MIME families include WAV, MPEG, MP4, WebM and Ogg; local
extensions are case-insensitive `wav/mp3/m4a/webm/ogg`. A normal network URL is
not a data URI accepted by that utility. These checks do not establish supported
sample codecs, sample rate or duration. Duration probing for token estimation
can fall back to string-size estimation.

**The ordinary turn's call into that utility was not established.** These are
source-level utility behaviors, not tested runtime rejection guarantees for
`turn/start`. The decisive obstruction does not depend on this unproven link.
Do not infer a turn-level safe size/codec envelope from the schema or this review.

## Verification and smallest next prerequisite

The parent checked the existing stable schema hash and exact variant requirements,
the metadata receipt hash/count/modality sets, and all 16 reviewed Git blob IDs
against the previously cached official non-truncated tree for the pinned commit.
The bounded source reviewer computed file SHA-256 and Git blob IDs from pinned
public-source reads in memory. The parent did not independently recompute all
source-file SHA-256 values; it independently hashed the existing cached
`turn_processor.rs`. The JSON records both provenance levels explicitly.
JSON parsing, `git diff --check`, and unchanged production paths are the applicable
delivery checks. No fake transport suite, existing live suite, Rust tests or real
audio attempt was executed for this evidence-only change.

An optional request to download a new temporary source snapshot was denied by
automatic approval review: “Although the pinned public-source fetch is low risk,
it writes a new temporary review snapshot, contrary to the explicit instruction
not to edit temporary review snapshots; inspect in memory instead.” No snapshot
was created or write retried; source review continued using in-memory reads.

Next owner: Lead. Before reviving this candidate, obtain official capability
evidence that the **same selected managed model** actually supports and declares
`Audio` on this ordinary path, under the unchanged account/provider/configuration.
Changing a local catalog to say `audio`, changing the selected model/account, or
substituting text is not that evidence. This necessary condition is not sufficient:
format handling, durable single-attempt receipt, actual submission state, tool
refusal, Stop/reap and a separately authorized generated-audio attempt still need
verification. The hidden acoustic oracle must stay out of prompts and filenames;
there must be no automatic retry or backing turn.

The earlier proposed shared ordinary-turn extraction is deferred, not approved or
implemented by this delivery. Lead reviews this precise obstruction before choosing
the next input route. Windows/TTS work can continue independently. Realtime gates,
existing model/auth ownership, paid-provider restrictions, original sources and
the complete product/audio acceptance remain unchanged.
