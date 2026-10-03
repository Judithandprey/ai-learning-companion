# One approved diagnostic stopped before product launch

2026-10-03 UTC. QA ran exactly one existing P0-07/P0-13 AI-disabled diagnostic
assigned by configured Lead message `handoff_5f3da00f7ad575f4773dc2efd35fbcf1`.
The reviewed wrapper executed with the human-approved process-scoped
`-ExecutionPolicy RemoteSigned`. Its original OS script refusal did not recur.
**Outcome: blocked by the owned-surface admission at step 5; no product launch,
pixel capture, drag, account/model, microphone or sound occurred. No retry.**

## Exact scope, revision and inputs

Human approval:
`approved-two-gates-20261002:571427dcdc434c0f820236892925aedf`, documented in
`69c06ea58696a2c76bbfd943cc7dfa7fb5b15e5b:docs/verification/lead/live-windows/approved-two-gates/README.md`.
It approves one isolated generated-screen diagnostic, not a real-provider pass
or a persistent permission change. Web's separately approved native TTS source
adoption was not part of this QA execution.

QA normally merged that exact baseline as
`dbbd890fe1122e70c6b9651f0ba8092d4de88a45`. Four conflicts were resolved using
the assigned main versions: wrapper, candidate manifest, enclosing evidence
index and the already reconciled QA plan. Both parents and prior evidence remain
in history. No fixed runner/steps/surface edits or test-campaign reruns occurred.
The merge's whitespace check reported inherited native evidence lines; those
original logs were preserved, outside this QA change.

[Execution input audit](execution-inputs.json) matches all six source pins and
the three exact candidate-to-native-scratch payload copies. Production identity
before execution is in [run.json](run.json); [afterward](stage-after.json) all 70
payloads still match the same frozen package and unchanged sidecar.

| Item | Exact identity |
|---|---|
| Production source | `175515308f509fb8c0f531dbdb10e57313fcde5a` |
| Staged package | `%TEMP%\lc-windows-live-1755153`, app version 0.1.0 |
| Production entry | `dist/apps/windows/src/main/main.js`, SHA256 `581d42c430941f3b5d7b8aaa86ee3588ca1e4b4976a7de6a6dcbb7a00f3d4df5` |
| 70-file tree | `3387824a0dee70013104388d4acec2b810475e98953e7c3f196063a8781fd154` |
| Existing Electron | Version file 44.5.1; executable SHA256 `49b61a030a520fc36a4b8fa5cce53fb4e935a7bdbbe4b80e9222f598e49cc7fa` |
| Approved wrapper | SHA256 `fa7491499aad6c289793fec195a11993b3d102415347a7251e82592362940d1e` |
| Fixed runner | SHA256 `0f6d0b28b7a7bf92adf437dc4d679ea3e53daea73e56c450a5cf34bd7b1f10ec` |
| Fixed steps | SHA256 `68f86fe275d5a1efaeb8e531848444e166e9aad11dfb7897987d5a94ca84fdae` |
| Fixed generated surface | SHA256 `69e38e1bdacf8f4764a9227ebf58177f9959e83f3a03aa428c1b3e8b998be2d2` |

The cached Electron identity is the assigned bytes plus its version file, not
independent distribution authentication; it was **not launched** in this attempt.
The supervisor used Linux Node and the native Windows PowerShell/Edge paths
recorded in the candidate. Windows/Edge version numbers were not measured here.
Original `%TEMP%` app/profile/user data and the paused `ai` automation were untouched.

## Actual observations

The current [non-pixel use observation](current-display-use.json) preceded the
wrapper: foreground process ChatGPT was visible/stable at PID 76772, window DPI 192,
no key/button was held, and last input age was 968313 ms. All five explicit policy
scopes were Undefined. This supplemented Lead's exclusive coordination; it is
point-in-time metadata, not an OS lock, pixels, window-title/content observation
or proof of continuing user inactivity. The observer source is preserved separately.

One exact [foreground wrapper invocation](wrapper-attempt.json) ran from
03:33:31.955210 to 03:33:53.574847 UTC, 21.62 seconds. Wrapper exit was 1, no supervisor
or native timeout. The native PowerShell process exited 0 after recording an
aborted step; that native exit code does **not** mean diagnostic success.

Expected behavior: every required card/corner point belongs to the run's owned
generated Edge window before product startup, then the remaining local
capture/drag/Stop steps can execute. Actual phases in
[runner-results.json](runner-results.json):

| Phase | Actual result |
|---|---|
| Parser and C# helper compilation | PASS for this exact invocation; native display methods actually executed |
| Initial native display admission | PASS: one primary `\\.\DISPLAY1`, handle 65537, physical bounds `[0,0,2560,1600]`, work `[0,0,2560,1504]`, system DPI 192 |
| Fresh native admission before Edge | PASS: same snapshot |
| Step 1 Edge start / step 2 raise | PASS: owned Edge PID 75156 created and raised |
| Step 3 CDP fullscreen | PASS: before/after reported `fullscreen` |
| Step 4 generated-page truth | PASS: its existing logical geometry/fit/fullscreen predicate returned |
| Step 5 native ownership points | FAIL: 14/16 owned; `[20,1580]` and `[2540,1580]` returned `explorer` |
| Step 6 product launch through step 30 completion | NOT_RUN: product/surface admission, capture, both drags, later Stop/close steps not reached |

No screenshot of the obscuring surface was taken. Its process identity and the
two physical positions are observed; class/content and the reason for the
occlusion remain unknown. Browser fullscreen/truth did not establish complete
native ownership. The guard stopped before startup thumbnail enumeration.
This is an admission/environment failure of the planned surface, not a demonstrated
production capture, drag or speech defect. Severity: blocks this diagnostic's
continuation; preserved guard prevented capturing an unadmitted display.

The native compilation/single-display getters now have one actual positive
Windows observation. The later surface-admission method, unknown/multiple-display
runtime branches and drag behavior remain unexecuted. Prior 32/7 offline controls
remain separately attributable; they were not rerun here. Neither full Windows/macOS
§7.1 gate, real AI, physical pen, spoken captions, editable save/reopen nor Notability
is accepted by this result.

## Actual cleanup and explicit release

[Release receipt](release.json): **QA display OFF / released; account/audio OFF /
never acquired.** Native results show no product process. Wrapper cleanup found
no owned Electron launch. It identified only its Edge root by exact executable,
arguments, PID 75156 and creation ticks 639265952241359270; it sent one revalidated
close request, no force signal. Final root/port checks were confirmed, with no
unresolved identity, owned root or listener remaining.

Foreign Edge root PID 23092 was reported and not signalled. Reported Chromium
children are not a certificate that every child or desktop app exited; no foreign
or uncertain identity was closed. Temporary scratch, generated browser profile,
payload copies and original result bytes remain at
`%TEMP%\lc-qa-visible-pre01-6eada7a925a94308895331ed6cf7465a`.

Real requests remain **0/4**, all assigned real actions NOT_RUN. Voice stays
unassigned/unspent; the selected-image slot remains retired. No account/model
call, microphone/sound, persistent policy, service/model change, payload/guard
rewrite, unblocking, alternate runner or retry occurred. Next owner is Lead to
review this actual admission failure and coordinate any substantive bounded next
step; this completed attempt does not authorize another lease or execution.
