# Windows live consumer review — candidate held for correction

2026-10-01. Exact delivered candidate **9622b517b74020b2d9e8ffbb03f8d615ff32341d**,
reviewed against released main **07c9ebd35d412ff4e8b3f5aa2e1b895da9456fe8**.
The five Windows leaves after already integrated `28f0504` are `d0e5f80`,
`79d0811`, `3766e62`, `a336485`, `9622b51`. No candidate production code is
integrated by this review checkpoint. Existing main and the user's old package,
profile, ink and authentication remain untouched.

This continues P0-02/07/12 → P1-02/P2-03, main specification §7.1/7.3 and
ADR 0004. The delivered source implements the whole-frame live consumer,
automatic focus, optional text follow-up, full quota facts and trusted speech
piece authorization. It connects **no production voice or audio input** yet.
Its source/author tests do not establish the actual Windows/AI user journey.

## Four concrete findings

| Finding | Reproduced behavior | Existing next owner/action |
| --- | --- | --- |
| WIN-LIVE-01 | AI-only Stop followed by a delayed selection acknowledgement displays a previously buffered answer for the ended session. | Web fences pending presentation by current live authority/session, including restart, without deleting prior legitimately shown history. |
| WIN-LIVE-02 | Start AI after the same display was retained while capture-only: fresh identical samples yield zero observations while UI reports on. | Web obtains the first fresh post-Start observation independently of the old retention change baseline, preserving timestamps, Stop, budgets and originals. |
| WIN-LIVE-03 | At a synthetic 440×320 work area, the answer card covers all six Talk controls; a real Chromium pointer click at Stop reading's center hits the card and sends no hush. Closing the card remains a working alternate. | Web keeps immediate interruption controls reachable with the answer card present. |
| WIN-LIVE-04 | Direct resize from 1000×700 to 440×320 moves an already displayed response outside the card viewport during fake speech. No focus, Home, drag or scroll intervention is needed. A newly arriving narrow response is correctly revealed. | Web preserves the visible matching caption on work-area/size changes. |

The two lifecycle probes fail on the delivered candidate; [probe source](review-wire-probes.test.ts)
and [before log](wire-probes-before.txt) are retained unchanged for correction review.
To reproduce, export that exact candidate into a scratch checkout, place the probe
in `apps/windows/tests`, and invoke the project's Node24 executable directly on it.
No account, network, microphone, display or database is used by these probes.

## Completed bounded checks

- [Released bridge](released-bridge.txt): **2/2 pass**, 2.641 seconds. Actual
  public Python live/1 transport and Learning preparation over real pipes, with a
  synthetic provider. A normal exact-command approval followed inconclusive
  sandbox child-pipe stalls; those stalls are not product failures.
- [Existing app-live controls](app-live.txt): **17/17 pass**, 6.967 seconds.
  Conditional Python checks in that file did not execute without their environment;
  do not count the composite test title as extra bridge evidence.
- [Focused transport lifetime](transport.txt): **4/4 pass**, 7.317 seconds.
  Submission uncertainty, output-only loss, interrupt/Stop receipts and unconfirmed
  connector end remain covered.
- [Main/renderer speech-authority controls](voice-surfaces.txt): **16/16 pass**,
  1.801 seconds, direct Node execution. These use a fake voice and do not import
  or execute the blocked native candidate. An earlier isolated Node test wrapper
  reported only one file-level pass; it is not counted as sixteen executed cases.
- [Hidden Chromium layout](render/README.md): exact candidate, cached Electron
  44.5.1. Initial run **53 pass / 7 fail**; one focused causal follow-up **7 pass /
  4 fail**. The failures represent the two layout defects above, not eleven
  independent defects. Wide layout, real pointer drag/hit-testing, clamping,
  restore and no accidental ink/Ask pass. Generated canvas and fake IPC/voice only;
  no real desktop capture, audio output, provider or physical-DPI acceptance.

See [wire review](wire-review.md), [frozen renderer manifest](render/source-manifest.json),
the two saved run results, executed harnesses and generated screenshots. The Windows
processes were foreground-waited and exited. Nonfatal UNC/cache diagnostics are
retained with each run. No test campaign, account retry or new dependency was added.

## Native TTS approval boundary

Web's exact denial evidence arrived in `handoff_aa3365bca99f324830e876b44e250fca`,
corrected for attribution by `handoff_1cb6dae7c17683b9e4bbce6b8215310e`.
At 14:51 UTC its attempted import of external candidate `NativeSpeech.cs` and a
prebuilt `NativeSpeech.exe` into `apps/windows/native` was rejected by Claude's
auto-mode approval classifier with **“[Untrusted Code Integration]”**. The refusal
explicitly applies to the outcome across tools, owners and later turns. No native
candidate has been imported, ported or executed by this review.

Lead had read the supplied source before receiving the exact denial terms. The
specific pending user decision is approval to adopt the reviewed source and adapter
and build locally with the already installed .NET compiler, **without importing the
external prebuilt executable or changing permission settings**. Source SHA-256:
`c4c1f127a85ff1c871ce98895d51584af7936bbf23f3a35c7418002f201cbbfd`;
adapter `1a9279891b691de4cb4787eabcb947c0e3d6c47957f6db318c481dca82ec1077`.
The prompt is pending, not approval. Real output-device/latency and microphone/system
audio acceptance remain independent even after source adoption. No token, private
account receipt or user screen is included here.

## Actual handoff and release condition

- Delivery: `handoff_26f75dc54343f0dfc9edce3c579c35c7`.
- Same-card lifecycle corrections accepted by native Chats as
  `handoff_afb4c0cb9fec9111663fd885b0785bd3`.
- Same-card final layout corrections accepted as
  `handoff_b2ed7453085a3c72bf6726159cb1be88`.

Acceptance receipts initially reported unread / execution_started:false, not
implementation or reading. Web owns one combined correction; Lead rechecks the
unchanged failure probes, integrates the reviewed leaves and prepares a distinct
versioned package. QA retains its one changed-flow pass and the reserved, unreleased
five ordinary image/text actions. No actual-account/display/audio lease is granted
by this checkpoint. Mac's already assigned live consumer continues separately;
its owner worktree has new LiveFrame/LiveLink/LiveSession/LiveWire source and tests.
No repeated mobile/Simulator campaign, runtime change or full-product pass follows.
