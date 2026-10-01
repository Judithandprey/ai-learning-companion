# Installed Codex audio protocol evidence

Checked 2026-10-01 against assigned baseline
`d37f7a442a78122fb351a7aab83ffdff8aec1448`.
Scope: read existing official CLI-generated schemas, committed generation receipts,
affected D-SUBSCRIPTION-FIRST/D-AUDIO-SCREEN and AUDIO/AVTEST requirements, and
four current official documentation pages. No CLI execution, server startup,
personal account/auth/config inspection, login, provider request, inference, or activation
was performed. No Windows audio capability is measured by this report.

**Codex 0.158.0 has both ordinary audio input variants and an experimental realtime
RPC surface.** Protocol presence is verified; managed-ChatGPT account/model
acceptance, runtime activation, audio encoding requirements and actual acoustic
understanding remain unverified. A text-only fallback cannot close the native
audio or joint live audio/screen requirements.

## Version and evidence identity

The existing [CLI receipt](codex-app-server-0.158.0-cli-receipt.json) records
`codex-cli 0.158.0`, Linux x86_64-musl binary SHA-256
`167c0148a849d2444f1b5a7fb5f8bb2de1de5ae13a2a504b833fc765980f5cd9`,
and successful offline `app-server generate-json-schema` runs, with and without
`--experimental`. The receipt explicitly records no server, login, account RPC
or inference. Existing schema metadata was inspected before content; neither
bundle was regenerated.

All selected hashes and both complete manifests were independently recomputed
from `/tmp/lc-support-codex-schema-uk50qj_h/{stable,experimental}` and match the
committed [schema audit](codex-app-server-0.158.0-schema-audit.json):

| Bundle | JSON files | SHA-256 of sorted `relative-path + NUL + file-sha256 + newline` manifest |
| --- | ---: | --- |
| stable | 314 | `cd9238d61238dca0566621d17416638307501c5fbf0a90ed2bb882f2f00aa958` |
| experimental | 440 | `20836679ba7d25073e4d2b837fd4d1cc116857dd442174b72fe912c2879415c9` |

These are installed Linux-build protocol artifacts, not Windows runtime evidence.
The official guide says generated schemas describe the exact generating CLI
version. Its current Turns section lists text/image examples but omits the audio
variants found here; its body also does not enumerate `thread/realtime/*`.
Those omissions do not override the installed schemas.
[App Server guide](https://learn.chatgpt.com/docs/app-server), checked 2026-10-01.

## Ordinary turn input: audio is present

In **both** `stable/v2/TurnStartParams.json` and the experimental equivalent,
`definitions.UserInput.oneOf` contains these required fields:

| Variant | Required fields |
| --- | --- |
| Audio | `type: "audio"`, `url: string` |
| Local audio | `type: "localAudio"`, `path: string` |

The same union also includes `text`, `image`, `localImage`, `skill`, and `mention`.
The audio variants are present in the stable bundle; they are not merely
experimental realtime append operations. A URL/path schema does not establish
allowed codecs, URL schemes, size/duration limits, media fetching behavior, or
model/backend acceptance. No such operational behavior was tested.

`v2/ModelListResponse.json` defines `InputModality` as `text | image | audio`.
`Model.inputModalities` is an optional array with schema default `["text","image"]`.
Thus audio is representable in model capability metadata; its enum presence does
not mean a particular model advertises audio. An omitted field is not audio
evidence. No actual `model/list` request was made.

Stable `TurnStartParams.json` SHA-256:
`2dfcf68705896fadc344ccfeb2e9fe5a6bcbbb8b9a90cf449ce232b636daf05a`.

## Experimental realtime methods

All six methods occur in experimental `ClientRequest.json` and are absent from
the stable request union. The corresponding parameter schemas label them
experimental.

| Exact method | Required input and significant optional fields |
| --- | --- |
| `thread/realtime/start` | Required `threadId`, `outputModality: "text" | "audio"`. Optional `model`, `version: "v1" | "v2" | "v3"`, `voice`, `prompt`, `realtimeSessionId`, `transport`. |
| `thread/realtime/appendAudio` | Required `threadId`, `audio`; chunk requires `data: string`, `sampleRate: uint32`, `numChannels: uint16`; optional nullable `samplesPerChannel: uint32`, `itemId: string`. |
| `thread/realtime/appendText` | Required `threadId`, `text`; `role: "user" | "developer" | "assistant"`, default `user`. |
| `thread/realtime/appendSpeech` | Required `threadId`, `text`; description identifies speakable **text**, not captured audio input. |
| `thread/realtime/stop` | Required `threadId`. |
| `thread/realtime/listVoices` | Empty-object parameter schema; response requires `voices` with `v1`, `v2`, `defaultV1`, `defaultV2`. No `v3` list field in this build. |

`start.transport` is nullable/optional and selects `{"type":"websocket"}`,
`{"type":"webrtc","sdp":string}`, or
`{"type":"existingCall","callId":string}`. This selects realtime transport,
not the client-to-App-Server JSON-RPC listener. The schema does not document a
default transport, chunk encoding, endianness, or supported sample rates; do not
infer PCM/base64 requirements from `data: string` alone.

Additional start controls matter to privacy and cancellation review:
`includeStartupContext` defaults to inclusion when omitted/null;
`clientManagedHandoffs` defaults false; `realtimeStartInstructions` and
`realtimeEndInstructions` target the backing Codex model;
`flushTranscriptTailOnSessionEnd` can route remaining transcript through Codex
and defaults false. Also present are `backendReasoningStatus`,
`codexResponseHandoffMode`, `codexResponseHandoffChannelPrefixes`,
`codexResponsesAsItems`, `codexResponseItemPrefix`, `delegationAckFiller`, and
`initialItems` (role/text, V3 only, at most 128 items/8,192 estimated text tokens).
`outputModality` is output selection, not proof of accepted audio input.

Both bundles contain notification schemas for `thread/realtime/started`,
`itemAdded`, `item/started`, `item/transcript/delta`, `item/completed`,
`transcript/delta`, `transcript/done`, `outputAudio/delta`, `sdp`, `error`, and
`closed` under the `thread/realtime/` prefix. Their presence in the stable
notification union does not make the request methods stable. `started` describes
accepted startup, not demonstrated input delivery or understanding.

The official general gate is
`initialize.params.capabilities.experimentalApi: true`; omitted/false rejects
experimental methods and fields. This is a protocol opt-in, not an entitlement
grant. [Experimental API opt-in](https://learn.chatgpt.com/docs/app-server#experimental-api-opt-in),
checked 2026-10-01.

## Activation and route boundaries

The committed offline feature receipt reports `realtime_conversation: true`.
That does not prove a usable session. Current official configuration guidance
says `features.realtime_conversation=false` disables the CLI `/voice` command,
does not reliably block desktop or App Server voice, and enabling it does not
bypass client/rollout checks. No flag was changed here.
[Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference),
checked 2026-10-01.

The official desktop Voice page describes live voice, distinguishes dictation
that becomes prompt text, and conditions availability on account/workspace and
rollout. That product documentation is not a promise that this third-party
managed-ChatGPT App Server client can activate these RPCs.
[ChatGPT Voice](https://learn.chatgpt.com/docs/features/voice), checked 2026-10-01.

SIWC token sharing is a separate authentication/provider route. Its current
preview limitations explicitly exclude audio/video input and transcription on
that flow; they also state that text, images, and files depend on the selected
model. Do not turn that route-specific restriction into a claim that installed
managed Codex lacks audio protocol types, or mix SIWC app-owned tokens into the
selected Codex-managed auth lifecycle.
[SIWC preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations),
checked 2026-10-01.

## Remaining acceptance and next owner

This closes the bounded protocol-discovery question. Unknowns remain precise:
which managed-account model accepts ordinary audio; whether this integration is
allowed to start realtime; required audio encoding and limits; selected upstream
model/route and metering; actual audio/screen alignment, acoustic understanding,
quiet/far/overlapping speaker behavior, and stop/revoke/late-tail behavior.
No account eligibility or runtime success is inferred from schemas or docs.

Lead/backend retain the decision and bounded authorization for a later real
audio compatibility check. Do not start one from this report: the existing
D-SUBSCRIPTION-FIRST real-call slice is text/image only, and this assignment is
offline schema/docs only. Native Windows offline speech findings can establish
local recognizer behavior separately, but cannot establish native-audio model
understanding or fulfill R60/A47–A49 and AVTEST-01–12. Preserve original speech
evidence, transcript uncertainty and reversible corrections, per-source timing,
independent sharing/disclosure controls, and separate Windows/macOS live
acceptance. No new provider activation, API-key fallback, purchase or requirement
reduction is recommended.
