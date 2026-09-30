# macOS capture: raw and ink-composed retained images

Task: the lead's continuation `handoff_789c03610e5fcd107595ec71aa51637b` (P0-03/11, same card),
started `handoff_00668e0fc5b3411c90daa7cf5e6a51a3`. Baseline: main
`a33932a35a32aed985facfd5de334e1b24512cf0`, normally merged into `team/ios` as `3355763` (clean;
`apps/macos` equals main).

Refreshed at `a33932a`:
- R03, R08, R35, R36, R46, R51, R52 and R59;
- §7.1, §7.2, §7.4 and §7.8 (English);
- A26, A30, A31 and A44;
- the lead's hosted evidence `docs/verification/lead/macos-ink-hosted/` (at `a05b763`);
- the Windows retention design and the lead's retention reviews, for comparable facts and known
  pitfalls.

This is a **bounded local capture segment**, not the §7.1 second gate or A44. The AI does not yet
receive the composed image, and nothing is sent anywhere.

## Outcome

Each kept frame of a capture now has, beside its untouched raw original, **either** a separately
identified ink-composed PNG **or** a recorded reason why there is none. The composed PNG is paired
with the exact committed revision of the user's original ink at the pixels' time.

| Part | Behaviour |
| --- | --- |
| Capture filter | `SCContentFilter(display:excludingApplications: [this app], exceptingWindows: [])`: ScreenCaptureKit's documented application exclusion. This app is found by process ID in the shareable content, with off-screen windows listed too. All other applications' windows on the display stay included. `sharingType = .none` is not relied on. |
| Recorded scope | `DisplayFacts.appExcludedScope`: the configured filter; every window of this app (main window, ink overlay, palette, menu bar item, menus and alerts) excluded *as far as the application exclusion applies*, including windows created after the filter; **unverified on a Mac**. A `capture_filter` event records the method and the excluded process ID, bundle identifier and name. |
| Fallback | If this app is not in the shareable content, nothing is excluded. The session records the earlier unknown-inclusion scope and a `capture_filter` problem, and **composes nothing**: its raw frames may already contain the ink, and drawing it again could duplicate it. |
| Raw original | Unchanged: `frames/NNNNNNNN.png`, as delivered. With the filter in place it is meant to hold no ink or controls. |
| Composed image | The raw original is first re-read under the retained-file policy (SHA-256 and length re-checked).<br>- **With strokes:** it is decoded and drawn over at its own size, then written as `composed/NNNNNNNN.png` (same sequence) by a second `FrameStore` instance, with the same staging and no-replace rules. That instance has its own byte cap, equal to the raw cap, so a session can hold up to twice `byteCap`. The bytes are recorded as `composedBytes`.<br>- **Without strokes** (no document open, or none visible): the composed image is the verified raw original itself, as one file with two references and the same SHA-256. Nothing is re-encoded. |
| Pairing | Done on the main thread, where ink is committed, as soon as the frame is reported. It uses the **pixels' time**: the validated source time, or the callback admission when that is unknown (recorded as such). The document open at that time is taken from the capture's document spans (created, reopened, closed). Its revision is `revision(at:)`, and its visible strokes at that revision come from replaying the operation history (`visibleStrokes(atRevision:)`). So frames paired late still get the ink of their own time. |
| Record | `composed` event with `ComposedFrame`:<br>- the raw sequence, file, SHA-256 and length;<br>- the composed file, SHA-256, length, width, height, media type and encoding;<br>- `ink`: pixels time and basis, document (created-in session, file, display), revision and its commit time, visible stroke IDs, point-to-pixel mapping, rendering style, limits;<br>- the composition time. |
| Not composed | `not_composed` event with the sequence, a reason and a detail. Reasons: `refused` (no app exclusion, geometry changed before the pixels, no geometry, unknown revision, ink history of a replaced capture), `raw_unavailable` (raw missing, changed or undecodable), `render_failed`, `write_failed` (including a `composed/` that cannot be created), `composed_cap_reached`, `composed_store_stopped`, and `session_ended_before_composition`. |
| Exactly one outcome | Every kept frame of a composing session gets exactly one `composed` or `not_composed` before `ended`. On Stop and on a stream error, the ending waits until every frame kept before the gate closed has been reported to the main thread (`settleCompositions`), so its composition request is queued first. At the ending, frames still waiting get `session_ended_before_composition`; this happens at Quit, which writes the ending at once. A later or repeated request is only `composition_request_ignored`, with no pixels. |
| Geometry | `DisplayGeometry` now records when a size or rotation change was noticed. Pixels from before it are composed with the start mapping; pixels at or after it are refused until capture restarts. A change is known only once AppKit reports it. |
| Ink style | Overlay and composed images use one fixed sRGB red (255, 59, 48) instead of the appearance-dependent `systemRed`. Width, round caps and joins, and stroke order match the overlay. |
| Status | Optional `composedFrames`, `composedBytes`, `notComposed` and `lateCompositionRequests`, absent until used. The main window shows "Composed images" and the reasons, or states that this app could not be excluded. |
| events.jsonl | A failed append is now cut back to the last whole line when truncation succeeds. Failures are still counted. A crash in the middle of a write, or a failed truncation, can still leave a torn last line, which makes `RetainedSession.read` refuse the session. |
| Mapper | Released 0.2.7/0.2.8 stay closed. A frame record from a session with the app-excluded scope is refused explicitly ("…excludes this app's windows from capture and composes ink separately; no released 0.2.7 scope value says that…"); refusal case `app_excluded_scope`. Frameless gap records carry no display scope and are mapped as before. |
| ASK | Unchanged pinning of source, frame, geometry and ink revision; its crop comes from the raw original. In an app-excluded session the selection text says the capture is *configured* to exclude this app (unverified on a Mac), and that the frame's composed record or `not_composed` reason is joined by its sequence. It claims neither an ink-free crop nor that a composed image exists. The selection's revision "at that frame's admission" uses the callback time; the composed record's uses the pixels' time. Both are labelled. |
| Commit time | `revisionHost` is given only for a revision committed since the document was last reopened. An earlier revision may be on another boot's clock, so a limit says so instead. |

Not composed or drawn:
- strokes still being drawn (uncommitted);
- ASK selection outlines;
- the palette.

The composition is not a live claim. Nothing is sent to a provider.

## Checks

```sh
swift build --package-path apps/macos/CompanionDesktop
COMPANION_DESKTOP_FIXTURE_DIR=... COMPANION_DESKTOP_INGRESS_FIXTURE_DIR=... \
COMPANION_DESKTOP_COMPOSED_FIXTURE_DIR=<new directory> \
  swift test --package-path apps/macos/CompanionDesktop                  # 42 tests
python3 apps/macos/CompanionDesktop/checks/validate_composed_frames.py <that directory>
```

`Tests/DesktopCaptureTests/InkCompositionTests.swift` adds 5 XCTests. They use real encoded
synthetic pixels: uniform grey 200×100 buffers for a 100×50 pt display, kept by the real recorder.

| Test | What it checks |
| --- | --- |
| Ink at the pixels' time | Six frames are kept around a stroke, a partial erase, an undo and a redo, plus one without a source time. All are paired only afterwards, and each still gets its own revision (0, 1, 2, 3, 4, 4) and strokes.<br>- **Decoded pixels:** row 20 (10 pt from the top) is ink, and its core is the sRGB ink colour within ±2.<br>- **Width:** 3 pt at 2× is 6 px. Rows 18 and 21, off the centre line, are ink along the stroke and in the erase pieces; rows 14 and 25 stay raw. The mirror row stays raw.<br>- **Erase, undo, redo:** The erased middle shows raw, undo restores it, redo removes it.<br>- **Raw originals:** unchanged and ink-free.<br>- **Records:** raw references, file hashes, sizes, time basis, revision commit times and document file are exact. The empty image is the raw file itself. `composed/` holds exactly the five inked images. `composedBytes` is their sum.<br>- **Geometry:** a rotation noticed before the seventh frame's pixels leaves it `not_composed`.<br>- **Reader:** `RetainedSession.read` still reads the same frames with no gaps or notes.<br>The user document is saved into the session for the validator. With the env var set, this session is the fixture. |
| One outcome each | A repeated request and one after the ending are only noted. A frame not composed by the ending gets `session_ended_before_composition` before `ended`. Status counts match. An empty-ink image has no document, is the raw file itself and writes no `composed/`. A non-composing session writes exactly the old events and files. |
| Refusals and failures | These cases use a document with one stroke, so they reach rendering and storage. Each leaves the raw original byte-identical, gives an actionable reason, and changes nothing else:<br>- a file where `composed/` belongs gives `write_failed`, and later frames compose once it is fixed;<br>- a changed raw original gives `raw_unavailable`;<br>- a capture without app exclusion is refused;<br>- no geometry is refused;<br>- a document reopened after the pixels' time gives an unknown revision;<br>- after a reopening, the carried revision keeps its strokes but no commit time, with a limit. |
| ASK text (new) | In an app-excluded session, the selection text says the exclusion is configured and unverified, and points to the composed record or reason. It contains no "ink-free" claim, and states the missing crop. |
| Revision replay | After strokes, erase, undo, undo, redo, stroke and a full erase, replaying every committed revision (0–8) gives exactly the visible set recorded at that revision. Commit times and bounds are checked too. |

The desktop-ingress refusal list gains `app_excluded_scope` inside an existing test, so the
ingress fixture now has 26 refusal cases. The existing mapping fixture session keeps its exact
events and files: sessions that do not compose are unchanged.

**Owner validator** `checks/validate_composed_frames.py` (standard library only). It checks the
fixture session's files:
- the app-excluded scope;
- raw PNGs against their records, decoded, with no ink-coloured pixel;
- exactly one outcome per kept frame, before `ended`, with known reasons;
- composed records against the raw originals and their own PNGs; without strokes, the raw file
  itself;
- the time-basis and document/revision consistency;
- **the saved user document**, for every record with a document, empty ink included:
  - the record's revision must be the one in force at the pixels' time;
  - replaying it must give exactly the record's strokes;
  - its commit time, where given, must be that revision's and no later than the pixels;
- **stroke geometry**, with points mapped by frame size / display size:
  - each stroke's centre line, sampled at most 1 px apart, is ink in the composed image and not in
    the raw one;
  - every pixel whose centre is within half-width − 1 px of a stroke is ink, because it lies wholly
    inside the drawn line. So a line narrower than its recorded width fails;
  - every ink pixel lies on a recorded stroke;
  - every pixel away from the strokes equals the raw pixel.

  So a flip, a wrong scale, a gap or collapsed width in a stroke, another background or a wrong
  revision is caught. "Ink" means opaque: alpha above 250;
- images with the same strokes are equal, and with different strokes differ;
- `composed/` holding exactly the recorded files;
- status counts and composed bytes.

Twenty-four in-memory negative controls must each be reported. They include:
- strokes collapsed to 1 px wide in every inked image (self-consistent hashes);
- transparent ink;
- an upside-down image;
- ink off the strokes;
- another revision's strokes, and a later revision with the same strokes;
- an inked frame recorded as empty ink;
- another background;
- a gap in a stroke;
- ink in a raw original.

It was **executed here only against a Python-simulated session** of the same shape, not Swift
output. All checks passed, all 24 controls were reported, and each for its intended reason.

**Lead wiring needed (shared files; not edited here).** The existing hosted run leaves the new
variable unset, so nothing breaks. To gain the evidence:
- `scripts/desktop-checks.sh` needs `COMPANION_DESKTOP_COMPOSED_FIXTURE_DIR`, the validator step and
  the folder in `finish()` hashing;
- the workflow upload paths and the Linux probe stub need the same change.

The one-off artifact audit pins 37 tests, three test files and 25 ingress refusals. This adds 5
tests and one test file, `InkCompositionTests.swift`, and one ingress refusal case. It adds no app
source file; the library gains `InkComposition.swift`.

## Evidence levels

| Level | State |
| --- | --- |
| Source written | Filter, scope, recorder composition, pairing, replay, rendering, controller wiring, status and tests. **Uncompiled** on this Linux host. |
| Hosted build and the 42 tests | **not_run**; next is the lead's hosted run. |
| Validator | Executed on a Python-simulated session only. |
| Application exclusion on a real display, including panels created after the filter | **not_run**: needs an interactive Mac. |
| Composed image reaching the AI, §7.1 second gate, A44 | **Not implemented**; no wire field or provider. |
| Content-anchored display, pen hardware, Notability | **Not implemented or not run**. |

## Limits

- **Exclusion.** Whether the app-level exclusion hides every window of this app, including
  panels created after the filter and menus or alerts, and what ScreenCaptureKit shows beneath
  them, needs a Mac run. The scope says so. Pixels under this app's main window are whatever
  ScreenCaptureKit renders there, not a view of this app.
- **Timing.**
  - Ink is committed on the main thread at pointer-up (the operation's host time). A change within
    moments of the pixels' time may be paired either way.
  - Pixels whose source time is unknown are paired at callback admission.
  - Uncommitted strokes are never drawn.
- **Geometry.** A change is known only from AppKit's notification. Frames between the actual change
  and the notification are composed with the start mapping. `contentRect` and `scaleFactor` are
  not applied.
- **Appearance.** Colour, width and antialiasing follow the overlay's style, but are not a
  pixel-exact copy of what the overlay showed. Only screen-fixed ink exists.
- **Durability.** The composed and raw PNGs and events are local only. A crash between keeping a
  frame and composing it leaves that frame without an outcome. No journal replays it after a
  restart, and the reader reports no gap for it.
- **Storage.** Composed PNGs have their own cap, so a session can hold up to twice `byteCap`. They
  compete with raw originals for disk space. A raw frame that cannot be written is still recorded
  as `keep_failed`.
- **Load.** Composition runs on the capture's serial queue after the frame is kept, which can
  delay the admission of later callbacks. Each record states its time basis.
- **Contract.** No released contract can carry the new scope or the composed records. The lead
  owns the smallest explicit versioned extension against these retained facts.

## Review outcome

`wf_83e9984d-b60` was read-only, with 7 agents: compile, behaviour, test trace and
validator-versus-Swift-output lenses, each followed by a skeptic.
- **Compile:** no error found.
- **Test trace:** no failing assertion found.

Confirmed and fixed:
- **Missing refusal test.** The `app_excluded_scope` case was missing although the doc claimed it.
- **Ink colour.** It was set as DeviceRGB; it is now an explicit sRGB `CGColor`, and the test
  checks the core pixel.
- **Composed byte cap.** It was unrecorded and doubled for empty-ink copies. Empty ink now
  references the raw file, and `composedBytes` is recorded.
- **Last frame at Stop.** It was routinely left uncomposed; it is now drained before the ending.
- **ASK text.** It overstated; it is now conditional, and tested.
- **Commit time after a reopen.** It came from another session's clock; it is now scoped.
- **Validator vacuity.** It is now checked by replay, geometry and cross-image comparison, with
  five more controls.
- **Doc overstatements.** Exclusion is conditional, and the torn-line wording is corrected.
- **Status label.** "Composed with ink" is now "Composed images".

The focused re-check `wf_59e7cced-c2e` (4 agents) again found no compile error and no failing
assertion. It confirmed six further items, all fixed:
- **Main window text.** It still said "including this window"; it now depends on the exclusion.
- **Lost stop detail.** A Quit during the new settle wait lost a stream error's or Stop's detail.
  The detail is now kept for the Quit ending.
- **Reopen limit wording.** It now says the commit time "may be" on another clock.
- **Validator strength.** It did not tie the revision to the pixels' time, skipped the replay for
  empty ink, ignored off-stroke pixels, and sampled only stroke end points. Four new controls
  cover these.

A reading of `byteCap` as bounding composed bytes too was refuted; `composedBytes` is recorded
separately.

Refuted:
- the AppKit geometry-notification lag (already disclosed);
- the queue load (disclosed above);
- gap-only mapping (a gap record carries no scope);
- two validator robustness nits. The input handling was nevertheless hardened, so errors become
  FAIL lines.

## Width correction (lead review `8e48f07`)

The lead approved the recorder, pairing and Stop increment, and the AppKit, filter and render
source for hosted compilation. It held composed-fidelity evidence for one P2 validator false-pass:
a self-consistent session with 4 pt strokes at 2× (8 px) drawn as 1-pixel lines passed, and so did
all 22 controls. That was synthetic validator evidence, not a renderer defect.

Corrected in the existing check and test only:
- **Validator.** A new interior-width requirement. "Ink" now requires opaque alpha. There are two
  new self-consistent controls: collapsed width and transparent ink.
- **Swift fixture test.** Off-centre interior pixels (rows 18 and 21) and just-outside pixels
  (rows 14 and 25) are asserted.

Executed here:
- The lead's `width-probe.py`, pointed at this validator, now reports the collapsed width in all
  five inked images. All 24 controls are detected.
- The validator passes on the simulated session, with each control reported for its intended
  reason.

The Swift assertions are **NOT_RUN**. The generated Swift fixture has not been validated. Both
wait for the lead's hosted run.

## Next owners

- **Lead:** source review, the hosted run with the fixture wiring above, and the versioned
  extension.
- **QA:** an actual Mac run of exclusion, composed alignment and permission, when access exists.
- **Native:** fixes actual compile or test failures first.
