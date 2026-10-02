# Mac live consumer — bounded review, correction required

2026-10-02. Actual native delivery `handoff_efec9a6244db754c66cbeea17ec713a7`
contains **3147291f449105c06255cfc0ea2056f1b2582437**, parent `5d8d121`, continuing
the existing P0-03/11 → P1-02/ADR0004 task. Review baseline is main
`0fe159902670cdca4fa8273c037b7f73092b6ede`. The candidate is **not integrated or
accepted**. Native owns the two corrections below; Windows QA continues its
existing independent task and the external directory edit remains untouched.

## Concrete findings

### MAC-LIVE-01 — queued answer obtains display authority after Stop

In the exact candidate, `LiveController.swift:38–42` queues copied status values
onto the main queue. `show` assigns that snapshot to the view and reports its
answered card as displayed when the panel is visible. Stop/cancel/capture-stop
schedule actor work but do not immediately invalidate this queued presentation.
`LiveLink.endSession` only fences requests still in `out` (590–597), and
`answerShown` (965–972) checks request/card phase without current session authority.

The [focused probe](queued-presentation-probe.swift) captures an answered status
without displaying it, completes `stopSession`, then delivers the old shown
callback. A **new `.shown.json` is actually written** after Stop. The [raw log](queued-presentation-before.txt)
records **1 test / 1 failed assertion / 0 unexpected failures**, and the resulting
[synthetic receipt](stale-shown.json) is retained. This runs the exact library with
the owner's Linux framework stand-ins and fake connector, not a Mac UI.

Required correction: authorize a first presentation against the current request,
session and capture immediately before rendering, and fence locally queued UI
work at Stop/cancel/replacement/restart boundaries. A delayed callback cannot
create first-display authority after the session ended. Preserve answers already
legitimately displayed and their original history. Fixing only the receipt would
leave stale text presentation open; exercise delayed UI snapshots/approval as well.
Retest the unchanged failing probe, new session and capture-end paths, and an
already-shown historical positive control. Do not change the public live/1 wire.

### MAC-LIVE-02 — live caller ignores existing freshness invalidation

`CaptureController.liveInput` (399–403) only requires the kept frame sequence to
equal `lastNewPixelsSequence`. `receive` (372–379) offers changes only when that
sequence increases; `pictureChanged` (407–413) only reports sequence mismatch.
The ticker updates `now` but does not invalidate live input. Meanwhile
`CaptureRecorder` deliberately leaves the last-new sequence intact for blank,
suspended or unavailable callbacks while clearing `pixelsCurrent`; callback
silence/source-age expiry also makes the existing `Freshness.judge` non-live.

Consequently Start, typed follow-up and ink-change observation can obtain the
last kept frame while the app's own freshness verdict says current pixels are
unknown/unavailable/stale. No freshness facts reach `LiveFrameInput`/the Turn;
`frame_captured_at:null` and the renderer's local historical composition sentence
do not tell the model about this lost source. A previously queued render/turn
also needs invalidation without waiting for another new-pixel sequence.

The [independent wire review](wire-review.md) and [four-case source-state probe](freshness-source-probe.swift) corroborate this: blank, suspended, missing-image and callback-silence states all fail the existing freshness judgment but pass the new input predicate. [Actual output](freshness-source-probe.txt). This is interpreted Swift with minimal state stand-ins and the extracted app predicate, not full AppKit or native execution.

Required correction: reuse the existing freshness/gate judgment at the actual
current-input and dispatch boundary. Propagate loss from callback **and time**
transitions to `noPicture`, with explicit gaps/reason and no stale current-screen
claim. Retain originals and historically anchored selections as history, without
silently relabeling them current. A fresh usable callback can restore observation
under the same still-authorized session; Stop never auto-resumes. Test blank,
suspended, missing image/source time, callback silence and stale source timestamps
alongside healthy idle/new-pixel recovery. No new capture manager or contract.

## Evidence reviewed, without repeating the full suite

Independent artifact review matches **53 owned-source, 9 released-input and 54
evidence hashes**, including all eight source/English hashes. Released inputs are
byte-identical on current main. The saved synthetic fixture passes the candidate's
released checker: **211 checks, 10 lines / 6 turns**; six rebound results match.
This is stored-fixture validation, not a native producer or real AI run.

The owner Linux log has **118 passed / 6 failed** methods out of 124, matching the
actual test declarations. Raster stand-ins, corelibs redirect behavior, source
layout and retained mapper comparison remain explicit failures of that run. No
Linux suite pass or current native build is inferred; old native100-test success
applies only to its old source. No broad test/mutation campaign was repeated.

The [source manifest](probe-source-sha256.json), probe and raw log bind the focused
counterexample. `run-probe.sh` records the actual restored toolchain/temp-harness
paths; reconstruct the owner's documented transformed harness for the exact
candidate and add the retained probe before replay, rather than assuming `/tmp`
survives an outage. This is diagnostic substitution, never Apple-framework proof.

## Prepared next build, held until corrected source

[Pending CI patch](pending-live-fixture-ci.patch) adds the native live fixture's
environment, actual released checker, retained hashes and artifact upload to the
existing desktop runner. It changes no dependencies or native application code.
It was prepared on `0fe1599`; **three focused orchestration methods pass**, including
missing/bad/failed-validator propagation and retained artifacts after owner-test
failure. [Actual log](ci-preparation-checks.txt). The build-tool stubs establish
orchestration only; no macOS build was dispatched.

The patch is retained here rather than enabling a missing producer on current
main. After the same owner's correction, Lead reviews the exact leaf pair,
integrates it normally, applies/rechecks this small patch, and runs the existing
hosted macOS-only build/package/native XCTest/fixture check. Interactive Mac,
actual provider/audio/pen, content-anchored ink and Notability acceptance remain
separate. The prior native-TTS approval rejection is unchanged; no source import,
port, account use or alternate permission path occurred.
