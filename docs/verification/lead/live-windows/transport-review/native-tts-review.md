# Native Windows TTS candidate — bounded pre-integration review

**Source-adoption approval is now granted by the human; the parser correction remains part of Web integration.** See [the exact approved continuation](../approved-two-gates/README.md).

**Historical review: HOLD one small parent-parser correction before production adoption.** The candidate is otherwise suitable for the assigned main-owned integration, with its memory/device limits preserved. No candidate, owner or repository source was edited. Applied project PONYTAIL LITE and current §7.3 / AUDIO-08/09/14/15; this adapter supplies neither speech permission nor full audio/context acceptance.

## P2: JSON null escapes the parent protocol handler

`native-voice.mjs:52–53` catches JSON syntax errors, then reads `msg.type` without checking that the parsed value is a non-null object. A child line `null\n` throws `TypeError: Cannot read properties of null (reading 'type')` out of its stdout data handler. The pending `say` is not settled and cleanup is not started at that point. In a production main process this reaches uncaught-exception handling rather than the promised false-result/failure path.

Independent portable exact-adapter probe:

- Invalid JSON `not-json\n`: no escaped exception; fake child killed once; current promise settled false.
- Valid JSON `null\n`: escaped TypeError; zero cleanup calls; current promise still pending. The probe manually emits a fake close afterward solely to clear its timer.

This is malformed-child-output containment, not an external exploit or an observed real System.Speech failure. The native source normally emits objects. The existing run02 malformed test covers invalid JSON only and does not exercise this boundary.

Minimal existing-Web-owner correction during integration: reject null/non-object protocol values immediately after `JSON.parse` (arrays may also be rejected), route through `fail`, and add the null regression next to the existing malformed-reply test. No C# rewrite, new protocol or new native campaign is needed for this JavaScript fix.

## Source/lifecycle findings

- Startup is lazy after valid explicit `say`. Helper path, sink and culture are trusted-main settings; direct hidden spawn uses `shell:false`. Text is escaped JSON on stdin, never shell/argv source. The C# helper accepts only memory/device and en-US/zh-CN, XML-validates and escapes text, bounds text/line/queue and uses installed matching-language voices. No network, microphone, capture or evaluator call was found.
- Stop resolves the old parent promise false and sends stop before a replacement say. IDs prevent stale completions settling a newer utterance. Native `Current` identity is cleared before cancellation/disposal; stale completion events cannot publish replacement success. Cancellation waits up to one second before disposal. Helper utterance and parent deadlines remain 30/35 seconds; dispose requires an observed close and reports failure after its bounded waits instead of claiming reaping.
- EOF abandons pending/active work and exits; shutdown/cancel/error do not generate success. C# success requires its matching `SpeakCompleted` without error/cancellation. Memory success means WAV synthesis; even device completion would not prove endpoint audibility. Actual device buffer tail/interruption latency and blocking native API behavior remain runtime risks for the later authorized device check.
- There is no product IPC here. The README correctly requires main-owned active response/provenance/chunk derivation, per-chunk permission/epoch checks, visible caption synchronization, and stop/disposal on mute, new request, session end or renderer destruction. The two-argument renderer seam is not permission. Web retains those production changes; they were not duplicated here.

## Evidence provenance

Read all five requested source/build/test files and the rate-measurement script. Independently hashed existing bytes:

- `NativeSpeech.cs`: `c4c1f127a85ff1c871ce98895d51584af7936bbf23f3a35c7418002f201cbbfd`
- `native-voice.mjs`: `1a9279891b691de4cb4787eabcb947c0e3d6c47957f6db318c481dca82ec1077`
- `check.mjs`: `10a26a8a9aee7034646ff6b3289fab425587f3f5667e58e9f7f25020d03a4e29`
- `build-02/NativeSpeech.exe`: `507f070bfed7d446f625e7df39bf066fbf212d46a6484dc72d3e998fdec613ac`

All four equal run02's receipts; all three executed source/test snapshots equal current candidate bytes. Build-02 receipt reports successful compilation and matches actual source/executable hashes. Its compiler hash is recorded but was not independently checked against Windows installation. This is receipt/source consistency, not a fresh independent compilation or execution.

Run02 contains **8 PASS / 0 FAIL** (five fake-parent groups and three native-memory groups), Node v24.19.0, 2026-10-01 14:26:07.669–14:26:09.263Z. Run01's **7 PASS / 1 FAIL** cancellation classification is preserved. The run02 cancellation receipt is false/cancelled at 159 ms total request lifetime; it is not measured audible barge-in latency. English/Chinese WAV metadata and rate-comparison 130% hashes agree; recomputed duration ratios are 1.2700213587 and 1.2418929874. Raw waves were not retained, so their actual sample hashes cannot be independently recomputed here. No exact perceptual 1.3× claim is inferred.

## Executed review probe and limits

```sh
.tools/node-v24.21.0-linux-x64/bin/node --permission --allow-fs-read='*' \
  --allow-fs-write=/tmp/native-tts-review-probe.json \
  /tmp/native-tts-review-probe.mjs
```

Both reproduction/control assertions pass. This runs only the exact JavaScript adapter with EventEmitter/stream doubles; Node is not granted subprocess permission. No build/check/native executable, Windows process, audio device, microphone, capture, user app, account or model operation ran. The original `check.mjs` was **not executed** because it combines fake and native-memory paths.

Artifacts: `/tmp/native-tts-review-probe.{mjs,json,txt}` and `/tmp/native-tts-candidate-review.json`. The latter retains source hashes and all provenance checks. Real audible output, endpoint selection/loss, acoustic quality/ASR, interruption timing, caption visibility, complete screen/ink/context delivery and permission integration remain unverified; memory evidence closes none of those requirements.
