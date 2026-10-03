# Windows current-response speech integration

2026-10-03. Existing P0-07/P0-12 → P1-03 continuation, based on accepted Web
`095e25936c2f75d900a4c6e6b106530ac75ae93c`. Lead's newer human decision is recorded
at `69c06ea:docs/verification/lead/live-windows/approved-two-gates/README.md`, marker
`approved-two-gates-20261002:571427dcdc434c0f820236892925aedf`. It resolves the earlier
specific Untrusted Code Integration rejection for the reviewed source adoption,
parser repair and local compilation. The historical rejection was retained until
that source record arrived. Normal exact-command approval permitted this import,
compilation and memory run; there was no new denial or workaround.

## Result and intended operation

A locally compiled Windows build can now use installed system speech through the
existing main-owned `Voice` / `connectVoice` boundary. Talk starts off. A valid
circle still requests an automatic small contextual hint without typed Ask;
Talk must have been enabled when the response was requested to allow reading.
Main derives each piece, culture and rate from its own verified response and
settings. The overlay requests a selection/request/piece index and retains its
existing movable answer/caption card and controls. A source-only build reports
that no voice is connected. Voice input remains unavailable; follow-ups are typed.

Before each piece and after completion, main checks the current capture/AI session,
current request and main-owned verified response, its shown state and disclosure
scope, Talk/mute and app-quit state. Already shown old text survives as history;
it cannot be read after AI Stop → Start. A new selection/request, Close, Mute,
Talk off, Stop reading and session end fence the old reading and its unsaid queue.
Session/window end releases the child. A culture change waits for observed child
exit; a Stop while waiting prevents the replacement from starting. An unobserved
exit fails closed. The same provider can serve a later explicitly started session
using a fresh child after successful disposal.

`spoken` stays separate from `shown`. Each reported completed prefix is retained
as `partial`, then `interrupted` or `finished`; replay cannot erase a prefix already
reported complete. Zero completed pieces remain `attempted`. Memory synthesis
creates no played-help record. These are provider completion reports, never proof
that the endpoint was audible, the user heard the text or mastered the material.

The adopted adapter contains null/primitives/arrays and malformed child output,
checks completion metadata, fences stale child callbacks and contains cleanup
exceptions. No renderer can name text, helper path, sink or speech provider.
The fixed bundled source/helper must match a successful local compiler receipt,
including compiler/reference metadata. Bytes are checked again at every actual
child spawn, including a same-culture restart after native idle exit.

## Verification on the delivered source

Applied project PONYTAIL LITE: existing private request/session IDs, speech
segmentation/culture selection, provenance, controls and storage were reused.
One direct native child at a time; no new dependency, shared contract or duplicate
speech queue. All writes are in `apps/windows/**` and `docs/verification/web/**`.

- **172 named focused tests pass, zero fail/skip/cancel** on final source:
  `native-voice`, `native-speech`, `overlay-surfaces`, `app-ask`, `app-live`, and
  `main-lifecycle`. Includes 40 portable child-adapter checks, 6 provider/bundle
  checks and current-response/partial-storage/cancellation regressions. Linux
  Node24.21.0; [final raw output](evidence/windows-native-speech/focused-final.txt).
- TypeScript no-emit, static build and explicit verified local-helper bundling pass.
  The compiled provider accepted the final bundle without calling `say` or
  starting a child. [Build output](evidence/windows-native-speech/build.txt).
- **18 portable synthetic packaging checks pass** with subprocess permission
  withheld. Receipt/source/binary inconsistencies and external/nonlocal build
  paths are rejected; ordinary source-only copy omits obsolete native helpers.
  [Probe](evidence/windows-native-speech/packaging-probe.mjs),
  [result](evidence/windows-native-speech/packaging-result.json).
- Independent review observed **91/91** portable checks, then **6/6** on the
  revised loader. Counts overlap the author tests; do not add them. The reviewer
  found the runtime receipt was less strict than packaging; matching metadata
  validation and first/idle-restart spawn regressions resolved it. No blocking
  findings remain. Its counts are observed tool outputs, without retained raw
  logs: [review](evidence/windows-native-speech/independent-review.md).
- Installed Windows Node24.19.0 and .NET Framework64 `csc.exe` compiled the exact
  pinned source successfully, status0/error null. Source SHA-256
  `c4c1f127a85ff1c871ce98895d51584af7936bbf23f3a35c7418002f201cbbfd`;
  locally compiled executable SHA-256
  `48360d37cdcc0121f03aa5e16975c2343f47090d1d6f19fa93306bd4f10f7d87`.
  Compiler/reference hashes and exact result are in the
  [compiler receipt](evidence/windows-native-speech/compile.json). No external
  precompiled candidate executable was adopted.
- **5 native memory groups pass**, all **7 direct children observed closed**:
  English/Chinese requested1.3×, literal XML/shell-looking text, idle/Stop,
  EOF/oversized input. Actual native memory run lasted1.852s; only synthetic text,
  WAV metadata/hashes and owned process close receipts were retained. No WAV was
  saved or played. [Result](evidence/windows-native-speech/result.json) and exact
  executed source snapshots are retained. Completion does not measure physical
  interruption latency or exact perceptual1.3× speed.

The first focused run's obsolete prefix-reset assertions failed and remain in
`main-focused-first.txt`; correcting them retains already completed playback
evidence. The earlier171-check snapshot is labeled before loader hardening.
Source/tests/scripts/report pass `git diff --check`; the whole staged diff reports
two whitespace-only lines in that retained original failure log (lines68/79).
The raw execution evidence was preserved rather than rewritten.
[Receipt](evidence/windows-native-speech/receipt.json) pins source/test/script,
requirements, evidence and final compiled bundle hashes.

## Build and packaging entry

Only the app worktree's ignored local build/dist outputs were created. No existing
Windows stage/profile was replaced, no user-facing package was published, and
QA's generated-screen display allocation was unused by Web.

From `apps/windows`, using installed **Windows Node** and unused labels:

```text
node scripts/build-native.mjs build-<fresh-label>
node scripts/check-native-memory.mjs build-<fresh-label> memory-<fresh-label>
```

Then run TypeScript build and bundle explicitly:

```text
node node_modules/typescript/bin/tsc -p tsconfig.json
node scripts/copy-static.mjs --native-build native/build/build-<fresh-label>
```

Production entrypoint: `dist/apps/windows/src/main/main.js`.
Bundled helper: `dist/apps/windows/native/{NativeSpeech.cs,NativeSpeech.exe,build.json}`.
Actual retained local build: `native/build/build-approved-20261003-01`.
Actual memory evidence: `native/build/memory-approved-20261003-01`.
The existing fresh-stage script accepts `--native-build` for Lead's later reviewed
candidate; staging was not invoked. Ordinary `npm run build` explicitly omits the
helper and cannot be reported as a voice-enabled package. See
[native build instructions](../../../apps/windows/native/README.md).

## Requirements and next acceptance

Read complete original/English §7.3, R09/R57/R60, A05/A06/A14/A47–49,
AUDIO-08/09/14/15 and existing LIVE-07/08 at the recorded requirements revision.
The bounded evidence supports current-response output permission, queue/session
fencing, original source preservation and the existing caption/control code path.
It does not pass actual A06 voice discussion, §11 physical interruption timing,
LIVE-07 audible captions, complete AVTEST or either original §7.1 desktop gate.

Next owner is Lead for review/integration and exact candidate staging, then existing
QA after an explicit audible/device allocation. That acceptance must start the
actual production entrypoint and exercise default silence, valid Talk-enabled
response and corresponding visible captions, real speaker/headphone output,
Mute/Stop/Close/new request/session end, old-tail and queue cancellation,
language availability/failure, endpoint loss/routing, adjustable rate and movable
controls. Record actual audibility/quality and measured stop latency separately.
No display, microphone, capture, account or model operation ran in this task.
Microphone/system audio/ASR, full live context/ink, interactive macOS, pen/DPI/
multiple monitors and original-data destination acceptance remain separate gaps.

## Later preferred voices

The `Voice` boundary remains replaceable, so this system provider does not restrict
a later preferred voice. Today it chooses an enabled installed voice for each
supported culture; English and Chinese may have different timbres, and mixed
pieces use the existing culture rule. Original text and the English-first learning
preference are preserved without translation or source rewriting. Identity V
Entomologist Melly and consistent bilingual timbre are not implemented or accepted.
They need a separately selected supported provider/material and actual listening
evidence; no custom-voice project, service, training or purchase was performed.
