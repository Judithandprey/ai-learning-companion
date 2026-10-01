# Windows native speech: bounded executable probe

2026-10-01 UTC. Assignment `handoff_cdfa998fe3e79e1b5fa3ccd30e895186`, baseline
`d37f7a442a78122fb351a7aab83ffdff8aec1448`. Read the complete AUDIO-01–15 addendum,
especially AUDIO-06/08/09/13/15, R09/§7.3 in the original and English specification,
current decisions, disclosure/language rules, role and workflow. Existing ownership:
Web/Windows renderer and voice, Backend transport, Lead interfaces/integration.

**Concrete result:** installed Windows `System.Speech` can synthesize English and
Chinese WAV streams and cancel active/queued synthesis without a speaker device.
Installed Chinese dictation returns caption text from the generated WAV, but makes
serious errors. No matching English SAPI recognizer is installed. This is a runnable
native probe and an explicit quality/language gap, not a usable voice-companion or
live-audio acceptance result. Nothing was installed or activated.

## Run and actual result

From the support worktree under WSL:

```sh
python3 tests/probes/support/windows_speech_offline.py \
  --output /tmp/windows-speech-offline-result.json
```

The [launcher](../../../tests/probes/support/windows_speech_offline.py) runs the
[adjacent PowerShell/C# probe](../../../tests/probes/support/windows_speech_offline.ps1)
using Windows PowerShell `-NoProfile -NonInteractive`, a 60-second outer deadline,
and per-operation bounds. It uses existing .NET Framework `System.Speech`; no
download, SDK installation, service, provider account or extra runtime agent.
The PowerShell source is ASCII, with explicit Unicode escapes for the Chinese
synthetic text and UTF-8 JSON output. The observed executable was
`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`, PowerShell
`5.1.26100.9444`, 64-bit, Windows `10.0.26200.0`; the loaded assembly is
`System.Speech, Version=4.0.0.0`, CLR `4.0.30319.42000`.

[Actual receipt](windows-speech-offline-receipt.json), produced at
`2026-10-01T13:52:10.8569011Z`:

| Operation | Actual result | Limit |
| --- | --- | --- |
| Installed voice metadata | Microsoft Huihui Desktop (`zh-CN`), Microsoft Zira Desktop (`en-US`) | Voice availability is not ASR availability. |
| Installed recognizer metadata | Only `MS-2052-80-DESK`, `zh-CN` | No installed matching `en-US` System.Speech recognizer; other Windows APIs were not measured. |
| English TTS into memory | PCM WAV, mono, 22,050 Hz, 16-bit, 259,298 bytes, 5,878.73 ms | No audible output or subjective voice-quality claim. |
| Chinese TTS into memory | Same PCM format, 245,146 bytes, 5,557.82 ms | Synthetic test speech, not microphone input. |
| SSML requested `130%` rate | English 4,628.84 ms; Chinese 4,475.28 ms | Approximate duration ratios 1.270× and 1.242×, not exact measured 1.3× speech. Calibrate product speed rather than equating SAPI integer Rate to 1.3. |
| Chinese open dictation | Two captions with segment offsets/durations and word confidences | Actual errors below; no constrained phrase grammar or emulated recognition. |
| ASR cancellation | Immediate cancel completed, zero captions, about 0.64 ms | Early cancellation only; no late callback occurred, so stale-result suppression was not exercised. |
| TTS interruption/queue cancel | Both prompts cancelled for both voices; about 35.18/9.85 ms | Active **memory synthesis** plus queued prompt; not acoustic-device playback or end-to-end interruption latency. |

Preserved quality failure:

- Generated input: `答案不是三，是五。请先解释这个步骤。`
- Actual dictation: `答案不恤衫75` (confidence about 0.338), then
  `挺先解释这个步骤` (about 0.270).
- The probe retains these outputs unchanged. It does not replace them with the
  known synthetic source or send them to an AI as confirmed questions. Confidence
  is recognizer metadata, not truth or independent mastery evidence.

The single successful Windows run exercised synthesis, WAV parsing/hashing, open
dictation and native cancellation. The PS1 hash matches its receipt. Independent
read-only review found no live-device/provider/old-app access in the source and
confirmed the evidence limits above. Initial compiler inspection corrected use of
word-level timing properties unavailable in this `System.Speech` API; segment timing
comes from `RecognitionResult.Audio`. No word-level timing is claimed.

After the successful run, the Python launcher was hardened to save structured
timeout/nonzero/malformed/unavailable-executable receipts. Four offline mocked
launcher tests pass; they do not execute Windows or re-run the successful speech
case. An outer WSL launcher timeout does **not** establish native-process reaping;
the failure receipt explicitly marks native cleanup unobserved. `runner_status`
and `probe_status: completed` describe execution only, not quality or acceptance.

## Managed audio is present in the protocol, operationally unverified

The [separate protocol evidence](windows-audio-codex-protocol.md) verifies exact
installed 0.158.0 generated schema manifests. Ordinary `turn/start` input includes
`audio` and `localAudio`; six experimental `thread/realtime/*` requests also exist.
It would be incorrect to claim Codex has no audio protocol or to apply SIWC's
separate preview restriction to this managed-ChatGPT route. No account/model/audio
RPC was made, so entitlement, actual audio encoding/limits, activation and acoustic
understanding remain unknown.

At the assigned product baseline, `services/worker/connectors/chatgpt_rpc.py`
`ask(text, image_bytes, ...)` still builds a text/PNG request, validates image input
and does not provide a product audio transport. Protocol availability is therefore
distinct from product implementation and real account acceptance. Backend can
reuse the existing managed lifecycle for a later explicitly scoped compatibility
check; this probe changes no admission, model, authentication, tool isolation or
provider settings. Native ASR is an available **limited text route**, not proof that
discarding original audio fulfills AUDIO-02/10/11.

## Smallest integration path and source/caption seam

Reuse the existing Windows Electron host and existing Backend/learning path:

1. **Web/Windows capture:** after coordinated user release and explicit source
   consent, request system audio with the existing display capture and a distinct
   microphone stream. Current `apps/windows/src/main/main.ts` permits only a
   once-per-session video request, requires `!request.audioRequested`, and returns
   `{video: chosen}`. `renderer/overlay.ts` asks `audio: false`. These must be
   deliberately extended under Web ownership; nothing in this probe enables them.
2. **Native ASR seam:** the runnable code uses an in-process
   `SpeechRecognitionEngine`, `DictationGrammar` and `SetInputToWaveStream` with
   generated memory data. A live owner implementation can feed actual PCM through
   `SetInputToAudioStream(stream, SpeechAudioFormatInfo)` with bounded buffers; EOF
   is not a pause, and capture must not require saving/uploading a lecture file.
   Preserve per-source original/processed correspondence and loss markers. Do not
   silently replace the absent English recognizer, install a pack or route Chromium
   speech recognition to an unverified remote service.
3. **Caption/permission seam:** forward hypotheses with source ID, source generation,
   segment audio offset/duration, capture clock and received time, original language,
   revision and correction provenance. The probe supplies synthetic-source text,
   segment timing, confidence and `speaker: unknown`; screen anchor is explicitly
   null. A later owner binds actual frame/selection/ink versions. Received time is
   not capture time. Do not infer speaker identity, addressee or emotion from an
   endpoint or text. Keep teacher/source transcription independent of replying;
   use the established explicit talk control when attribution is unresolved.
4. **TTS/interrupt seam:** generate speech only under current response/disclosure
   permission. R09 keeps click/card explanations silent; spoken discussion and
   independently authorized reminders retain their separate triggers. Stop the
   current audio sink and pending output queue on interruption; cancel synthesis
   with `SpeakAsyncCancelAll`, invalidate old generations, and recheck permission
   before playing any cached result. Cancel the relevant ASR with
   `RecognizeAsyncCancel` when its source stops. Synthesis cancellation does not
   empty another component's already-buffered playback, and source stop does not
   authorize restarting capture or deleting required transcript history.

Electron documents Windows `audio: 'loopback'` for system audio, distinct from a
microphone. Prefer it over `loopbackWithMute` for this route: muting the user's
course is not the goal. The documented WASAPI backing captures a render endpoint
in shared mode rather than recapturing loudspeakers. Actual headphone endpoint,
microphone concurrency, assistant echo/deduplication, per-app scope, attach/detach,
route loss/recovery and permissions still require a coordinated live test. No
device listing, TTS waveform or caption establishes those signals.

Text-only ASR loses usable waveform/prosody, emphasis, voice quality, overlap and
background-speaker evidence; segment timing/confidence do not restore them. Keep
authorized short original buffers available for later native-audio comparison and
reversible correction. Do not permanently record the session or flatten a source
track into a person. The local error above makes ASR quality and missing English
recognition precise blockers, independent of provider audio acceptance.

## Separate versioned build/stage/access

Do not use `apps/windows/scripts/launch.mjs` while the user runs `3e4b406`: it
unconditionally calls `buildAndStage('lc-windows-app')`, whose implementation
removes/replaces that stage, and immediately launches a GUI. No staging, build,
launch, screenshot, kill or restart occurred in this assignment.

For the next owner, preserve the live app and prepare a distinct exact-commit
checkout/export. Reuse existing locked TypeScript/build scripts and existing
verified Electron `44.5.1` runtime. The helper `windows-runtime.mjs` may download if
its cache is missing, so first verify that exact cached runtime/version exists;
absence is a dependency under this task's no-install rule, not permission to fetch.
Use `buildAndStage` only with a fresh name such as
`lc-windows-<full-reviewed-sha>-voice-<unique-suffix>`, rejecting a pre-existing
destination. Write the source SHA and file hashes beside that new stage. A fresh
stage name is required even for the same SHA because the helper removes an old
destination of the same name.

After the user explicitly releases the shared display, the owner can provide the
exact native launch command for that new stage. `main.ts` already accepts
`LC_USER_DATA` before the single-instance lock; use a separate owned data directory
for acceptance, without copying the user's profile, login state, recordings or
existing originals. Separate files do not isolate a visible display or audio
devices: source capture, GUI and playback still wait for coordinated release.
Keep the old app intact; later migration of real originals/auth remains a separate
reviewed owner action. Existing build availability is not a claim that this new
stage has been built or opened.

## Precise remaining dependencies

Lead coordinates the user's display/audio release and the narrow additive interface.
Web owns actual stream/permission/renderer/playback integration and a language-aware
unavailable state; Backend owns audio transport and a separately authorized managed
audio acceptance check. Native English ASR is not available through the measured
installed engine, and the measured Chinese engine is not accurate enough to accept
this test sentence. No installation/account/model fallback was performed. Real
mic + system playback + headphone/quiet learner/teacher/other-speaker tests,
late-callback/stop and actual AI acoustic understanding remain unrun. Windows and
macOS requirements remain separate; no AVTEST, full P1 or product gate closes.

## Primary references checked 2026-10-01

- [Installed recognizers](https://learn.microsoft.com/en-us/dotnet/api/system.speech.recognition.speechrecognitionengine.installedrecognizers?view=netframework-4.8.1)
  and [recognizer constructors/input configuration](https://learn.microsoft.com/en-us/dotnet/api/system.speech.recognition.speechrecognitionengine.-ctor?view=netframework-4.8).
- [WAV input](https://learn.microsoft.com/en-us/dotnet/api/system.speech.recognition.speechrecognitionengine.setinputtowavestream?view=netframework-4.8),
  [PCM stream input](https://learn.microsoft.com/en-us/dotnet/api/system.speech.recognition.speechrecognitionengine.setinputtoaudiostream?view=netframework-4.8),
  [WAV synthesis output](https://learn.microsoft.com/en-us/dotnet/api/system.speech.synthesis.speechsynthesizer.setoutputtowavestream?view=netframework-4.8).
- [Synthesis queue cancellation](https://learn.microsoft.com/en-us/dotnet/api/system.speech.synthesis.speechsynthesizer.speakasynccancelall),
  [ASR cancellation](https://learn.microsoft.com/en-us/dotnet/api/system.speech.recognition.speechrecognitionengine.recognizeasynccancel),
  [actual public word properties](https://learn.microsoft.com/en-us/dotnet/api/system.speech.recognition.recognizedwordunit?view=netframework-4.8.1).
- [Electron display-media handler](https://www.electronjs.org/docs/latest/api/session#sessetdisplaymediarequesthandlerhandler-opts),
  [Microsoft WASAPI loopback](https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording).

This preserves the full acoustic requirements while making the present native
option and its measured failures concrete. There is no continuing research loop.
