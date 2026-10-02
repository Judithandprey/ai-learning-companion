# Mac live correction reviewed — healthy frame advancement still blocks a reply

2026-10-02. Actual native delivery `handoff_877ce934ef1115842166b16b50dbcf6e`
contains **4f6c327018d46604b21c57ab4ebf2b0e45278f70**, on original live
`3147291f449105c06255cfc0ea2056f1b2582437`. Lead review baseline is
`1a9e242b6fcbfd325c956b19ac569de000306dd8`. Neither native live leaf is integrated.
The two original defects have bounded corrected evidence, but the pair remains
**HOLD for MAC-LIVE-03**, a reproduced first-presentation regression below.

## MAC-LIVE-03: a healthy new frame suppresses an already-submitted answer

`CaptureController.swift:405` binds `currentSourceProblem` to the frame sequence
obtained for input. This is useful before rendering/sending current pixels.
`LiveLink.swift:1013–1016` passes the same sequence-bound closure into answer
presentation, and `LivePresentation.swift:55` requires it to return nil before
first display. `Freshness.swift:65–67` rejects it as soon as the recorder has a
newer retained frame, even when the source is entirely healthy.

The [paired executable probe](frame-advance-probe.swift) fully submits a typed
follow-up for frame N, holds its fake-provider answer, and then applies either a
real recorder blank callback or a healthy complete/newly-retained N+1 callback.
It releases a valid response still bound to N and attempts first display through
the actual presentation permit. [Raw result](healthy-frame-before.txt):

- Blank source: unavailable, answer not displayed and no shown receipt — expected.
- Healthy new frame: `Freshness.live`, correct original frame and response retained,
  but answer not displayed and no shown receipt — **incorrect**.

One method executes both variants; **one failed assertion, zero unexpected
failures**, exit1. This is actual library/recorder/presentation code with Linux
Apple/UI stand-ins and a fake connector, not real macOS capture or inference.
Ordinary video advancement/scrolling is not Stop or source loss; main §7.1/7.2,
R52 and AUDIO-14 preserve immutable request anchors without calling old pixels
current. The user must still be able to receive the response to that anchored
request while the screen continues to change.

Required same-owner correction: separate current-frame eligibility before dispatch
from the continuing authority to first present an already-submitted, correctly
anchored answer. Preserve request/session/capture/command/expiry fences and actual
source-loss handling; a healthy newer frame alone must not revoke the earlier
answer. Do not rebind its source/frame/ink or claim it describes the new display.
Do not fix this by removing freshness validation from input/queued renders/writes
or removing Stop/source-loss presentation guards wholesale.

Retest the unchanged paired probe, healthy advancement between response receipt
and queued UI first display, and the applicable existing Stop/Cancel/replacement/
true-source-loss/history controls. Preserve passed work and deliver one small
follow-up leaf in the same existing P0-03/11 → P1-02 task; no new wire, manager,
protocol, audio or feature assignment.

## Corrected boundaries and exact evidence

- Independent lifecycle replay: **6/6 methods pass**, including the unchanged
  original Stop counterexample and extracted actual-controller Stop, restart,
  legitimate historical receipt, hidden→visible and final-used-up behavior.
  [Raw log](lifecycle-focused.txt), [source binding](lifecycle-source-sha256.json).
- Independent source/freshness replay: **16/16 XCTest methods finish with zero
  failures**, covering the eight source-dispatch and eight freshness cases.
  [Review](source-review.md), [log](source-focused.txt), [results](source-focused-results.json),
  [manifest](source-focused-manifest.json). The process exit code was not preserved
  by that tool projection; this is the actual XCTest summary, not an invented
  recorded exit status. No additional writer/gate-order blocker was established.
- [Hash audit](hash-audit.json): 57 owned files, nine released inputs, eight
  source/English hashes, 127 overall and 22 interface checksums match. All13 shared
  validator inputs match assigned c917; adapter matches3147291. Four final harness
  transformations match, and55 earlier evidence files are unchanged. The owner
  controller count of44 includes43 app files plus one stand-in; no hash mismatch.
- Owner40/40, controller8/8, synthetic local-child1/1 and fixture211 are separately
  reported/bound evidence; they are not added to independent counts or described
  as a complete native suite. Declared151 tests are not an executed151-test pass.
  Historical118/124 and all intermediate failures remain preserved.

[Reconstruction runner](replay-frame-advance.py) reads the exact native commit,
rebuilds the transformed harness and checks every source against the
[executed manifest](frame-advance-manifest.json) before invoking the existing
Linux review toolchain. From this evidence directory:

```sh
python3 replay-frame-advance.py /home/agentsdock/Projects/learning-companion/repo /tmp/lc-lead-frame-advance-replay-4f6c327
```

The runner was syntax-checked after the recorded probe; the failing probe was
not rerun just to package its evidence. `run-probe.sh` preserves the actual prior
invocation and `frame-advance-main.swift` its one-method registration. Temporary
toolchain paths are not promised to survive. `lifecycle-main.swift.txt` preserves
the earlier six-method selection. No production source, account or device was
modified.

## CI and next owner

The unchanged [pending runner patch](../pending-live-fixture-ci.patch) applied
cleanly and its three focused orchestration methods pass on this main revision;
[log](ci-preparation-checks.txt). It was returned to that stored patch form rather
than enabling a producer missing from main. No hosted build was dispatched.
Native owns MAC-LIVE-03; Lead reviews the corrected exact source, integrates the
native leaves and patch, then runs the existing macOS-only build/package/native
suite and live fixture validator. Actual Mac interaction/provider/audio/pen gates
remain separate. QA retains the previously assigned Windows display/account
lease; this review used neither. Native-TTS approval hold is unchanged.
