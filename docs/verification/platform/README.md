# Platform (iPad native) verification evidence

Owner: 04 iPad native. Write scope: `apps/ios/**`, `docs/verification/platform/**`.

## P0-03: G1/G2/G3/G5 capability boundary (2026-09-28 UTC)

Baseline `91019c3fd548e47aca632136012bb961c4af07cb`, contract 0.1.0. The v1.1 specification at
`57aee9c` and the final specification at `e43293760c70364584cb597ae01d34a261cc52cf` (content
`a2567fa`) were read with `git show`, not merged. R59/A44/A45 exist only in `e432937`; the
matrix's R59/A44 section relies on it. G7/R59 work is P0-11.

| File | Content |
| --- | --- |
| [`p0-03-capability-matrix.md`](p0-03-capability-matrix.md) | Preferred/fallback decisions per gate, go/no-go device tests, contract observations for the lead, and the generated matrix table |
| [`p0-03-capability-matrix.json`](p0-03-capability-matrix.json) | 72 rows (62 at P0-03 plus microphone rows G3-15 to G3-24 in the target 26.5 revision). Each wraps a contract `CapabilityResult` with `doc_basis`, OS/SDK, sources with access dates (page dates where the page shows one) and device-test IDs, and records its applicability on the user's iPadOS 26.5 target (`target_26_5`). |
| [`research/audio-routing-26-5-claims.json`](research/audio-routing-26-5-claims.json) | Target 26.5 revision: 94 claims on session modes (`F1`), ports, routes and channels (`F2`) and the target device and 26.x capture (`F3`), each checked by two adversarial verifiers (72 confirmed, 22 corrected), plus 32 verifier additions and the completeness critic's open measurements |
| [`research/p0-03-verified-claims.json`](research/p0-03-verified-claims.json) | 168 researched claims, each with independent verifier verdict, corrections and sources; 89 verifier-added claims; 30 completeness-critic claims; 2 review addenda (RV-01/02) |
| [`p0-03-environment.md`](p0-03-environment.md) | Local environment evidence, ranked build/sign/install routes, minimal steps, exact user inputs |
| [`p0-03-device-checklist.md`](p0-03-device-checklist.md) | Real-device test protocol and 60 tests (all `not_tested`; DT-G3-12/13 added in the target 26.5 revision), with an iPadOS 26.5 applicability table |
| [`p0-03-prototype-plan.md`](p0-03-prototype-plan.md) | Bounded probe sequence, native bridge decision table, input-mode and lifecycle state design |

### Result separation

| Stage | Result |
| --- | --- |
| Documented (primary sources, dated) | Matrix rows marked `documented` or `unsupported` |
| Inferred / undocumented / third-party only | Matrix rows marked `not_tested`; each lists a device test |
| Implemented | None. There is no Swift or extension source. `apps/ios/tools/check_capability_matrix.py` is a Linux-run consistency checker, not app code. |
| Compiled | None (no macOS/Xcode; see environment report) |
| Automated checks | Contract baseline `42 passed`. The matrix checker validates: rows against 0.1.0; that each status agrees with its documentation basis and with the cited research claims' statuses and source kinds; evidence prefixes; ISO access dates; research references; checklist coverage; and markdown sync. Its self-test rejected 13 known-bad mutations at `a4841d3` and accepts a well-formed device failure. The shared checker's later rules raise this to 23 rejects on the `p0-03` profile (28 on `p0-11`), including the iPadOS 26.5 applicability checks. |
| Real provider | None |
| Real device | None |

### Method

The official-documentation research ran as one orchestrated multi-agent workflow on 2026-09-28
(run `wf_00ecfe60-124`). It used seven dimension researchers (Safari extension, Pencil/ink, cross-app,
capture/audio, lifecycle, notes export, build environment). An adversarial verifier re-fetched the
sources for each dimension and tried to refute every claim: 125 were confirmed, 43 were corrected,
none was fully refuted, and 89 missed facts were added. A final critic resolved contradictions and
added 30 claims. The research was read-only: it made no logins, account actions, purchases or posts.

A second independent workflow (run `wf_96e2b4a8-dc1`, 4 reviewers) then reviewed these deliverables.
It reported 55 findings: 4 high, 24 medium and 27 low. The high findings overlap. All findings were
addressed before commit:
- PEN-04, G3-09 and G5-01 were downgraded from `documented_absent` to `inferred`/`undocumented`.
- The inferred part of LC-07 moved to a new row, LC-08.
- G5-06 was relabelled `undocumented`.
- Overstated wording was narrowed in many other rows.
- Forum sources relabelled: DTS reply, other Apple staff, or developer post.
- Checker tightened.
- The native bridge table corrected for `request_id`, duplicates and `AuthorizationContext`.
- Lifecycle state names unified.

The SFExtensionProfileKey fact (RV-01) was re-read from Apple's DocC JSON before being added.
Apple's JS-rendered documentation was read through its public DocC JSON.

### Reproduce

```sh
uv sync --frozen
.venv/bin/python -m pytest -q                                   # contract baseline
.venv/bin/python apps/ios/tools/check_capability_matrix.py --self-test
```

## P0-11: G7 dual path and R59 original-screen annotation (2026-09-28 UTC)

Baselines, all read with `git show` and not merged:
- Specification: `e43293760c70364584cb597ae01d34a261cc52cf` (content `a2567fa`).
- Confirmed user decisions: `44e60ec289717e155fb0f4374784c791bf23689c` (`intent-and-decisions.md`:
  two display modes, contextual note/draft purpose, completion prompt, destination choice).
- Increment `9ce270cc747676889797199b7e8455ccfef07a5f`: it adds R12 and R20/R22 evidence and the
  on-demand support role, and changes nothing in P0-11 scope.
- Main/ADR baseline `693069ac9e83ad955f808ca934b7fbec643f40f3` (proposed ADR 0002, read for revision 3).
- English working-language policy and translations at `6efa59e338d80e5373aad71c0db4e0774ed11bfb`
  (`english-working-policy.md`, four `*.en.md` files). All eight source and translation hashes match
  the manifest, and the four source specifications are unchanged since `9ce270c`, so no P0-11 content
  changes follow from it.

Contract 0.1.0 is unchanged. P0-11 builds on the P0-03 commit `a4841d3`.

| File | Content |
| --- | --- |
| [`p0-11-g7-matrix.md`](p0-11-g7-matrix.md) / [`.json`](p0-11-g7-matrix.json) | 48 rows: R59/A44 surfaces, S path (own canvas), V path (external pixels), confirmed-decision rows (each display mode per surface, completion prompt) and measurement tooling, with A44 status per surface |
| [`p0-11-g7-plan.md`](p0-11-g7-plan.md) | S-path operation log; V-path observation and gaps; offline replay; `CompositeDeliveryProof` (backend receipt vs model input); display modes; purpose, prompt and destination (native end); A45 return flow; A46 end to end; name mapping; teaching state and R57; the 40-case human-reference experiment; bounded hosted build route H; lead requests; user inputs U12–U18 |
| [`p0-11-device-checklist.md`](p0-11-device-checklist.md) | 49 device tests (all `not_tested`), including offline replay, the stop boundary, both display modes, the completion prompt and destinations, A45 fallbacks, and six R60 audio/screen input-path tests (AV01 to AV06), with an iPadOS 26.5 applicability table |
| [`research/p0-11-verified-claims.json`](research/p0-11-verified-claims.json) | 96 claims (62 confirmed, 34 corrected by adversarial verifiers) plus 41 verifier additions, from run `wf_27c2dac1-b0f`. The first attempt failed on a provider quota limit and was re-run after the quota was restored. |

**Review.** An independent 3-reviewer workflow (`wf_50e008b7-112`) reported 47 findings: 2 high, 25
medium and 20 low. A second verification workflow (`wf_793d6bdc-1c6`) then re-checked those fixes and
the new `44e60ec` content. It found 6 fixes incomplete and 12 issues in the new content (none high). All
of these were fixed before commit. The main changes across both rounds:
- offline replay and A45 fallback tests were added;
- the proof now separates backend receipt from model input and has an A44-eligibility rule;
- the indicator promise is scoped to surfaces we render;
- A46 import passes only on an observed import;
- web-ink transfer and routes were corrected;
- inferred clauses in documented rows are marked;
- forum labels and dates were fixed;
- existing 0.1.0 names (`device_sequence`, `gap_flags`) are reused;
- the checker now validates `a44_status`, explicit `a45_only` rows, `v1_1_gate` and forum labels, and
  uses argparse (revision 2 replaced the earlier decision gate with pinned in-app alternative rows);
- the display-mode rows are split per surface;
- the screen-fixed, completion-prompt and destination tests now include their negative cases;
- the hosted signed build route H (unverified, not configured) is available to tests that need only an
  installed build;
- E01 uses fixture pages, and a screenshot from a real page is redacted.

**Result separation** is the same as P0-03: documentation only. Nothing is implemented or compiled,
and there are no provider or device results. Status per surface:
- Safari content-script ink: candidate for A44.
- In-app browser: a separate alternative, reported apart; never original-app A44 success.
- Canvas Student, Notability and other native apps: unsupported unless a device test shows otherwise.
- Side-by-side, frozen frames and own canvas: A45 only.

**Revision 2** follows the lead's semantic review (`handoff_a85222994ef188a387b979630233bdcb`,
specification baseline `9ce270c`). It changes the P0-11 plan, matrix, checklist and the checker:
- **Stop boundary.** A stop ends observation and live sending. Only the temporary clip buffer is
  dropped. The following are kept:
  - pre-stop authorized source evidence;
  - the learner's own ink written after the stop (locally, with a `not_sharing` gap);
  - queued items, whose later sync is left to P0-08.

  A new test covers this (DT-G7-R02). (Revision 3 scoped the stop to the stopped source (R36/A16), and
  queued-history sync now follows the proposed ADR 0002 §4; see below.)
- **Model input.** The proof records these facts separately: client upload, backend receipt, a
  transform lineage bound to the capture, the outbound request (image and vectors), the provider's
  input limit, and the provider outcome. `model_input_verified` requires the whole chain plus an ink
  check of this capture's stroke boxes at the provider's effective size; `ink_vectors_in_model_input`
  is a separate fact. Eight negative cases can never pass, and a fixture never sets either fact.
  Neither fact means the model understood the image.
- **A44 eligibility** is judged from evidence, not compositor names.
- **In-app browser.** SURF-07 to SURF-09 and INT-01A/02A are a separate alternative. The checker pins
  these rows and the A45 rows, and its self-test mutates the real rows to confirm an A44 pass is
  rejected.
- **`user_reported` imports** are recorded but never verified. (Revision 3 corrected the share-sheet
  mapping; see below.)
- **Experiment targets** and setup are engineering candidates.
- **Web P0-12 alignment** (plan section 16) covers composite, stop, display modes, export states, A45,
  frames and ink handoff. Revision 2 left four differences for the lead: queued-item sync, screen-fixed
  ink during playback, per-frame anchors, and the ink handoff route. Revision 3 follows the proposed
  (not approved) ADR 0002 on queued-item sync and screen-fixed playback. These two, plus the export-state
  mapping and the per-source stop scope, remain differences with Web P0-12 until the lead closes them.
  Per-frame anchors and ink handoff wait for the formal contract.

A verification workflow (`wf_cd880afb-79f`, 2 reviewers) reported 21 findings on revision 2 (2 high).
All were addressed before commit.

**Revision 3** (`handoff_b1a97c578ac58ecb0c56dff9d9ed7cbc`, main/ADR baseline `693069a`) is a narrow
correction:
- Opening a share sheet only adds a `share_panel_opened` fact; the initial attempt stays `prepared`,
  and reopening preserves any earlier share/import outcomes. Completion to
  the actual target gives `shared` (import pending). Cancel, failure and unknown are separate
  append-only facts that never rewrite earlier history.
- A stop applies only to the stopped source: other enabled sources continue, sources that were off stay
  off, and the stopped source's frames are labelled stale (R36/A16). This also corrects P0-03 DT-G3-10.
- Adopted from the proposed ADR 0002: §4 (history sync after a stop needs independent authorization)
  and §7 (screen-fixed ink keeps its screen position and written-at context while the same known
  problem continues).

```sh
.venv/bin/python apps/ios/tools/check_capability_matrix.py --matrix p0-11 --self-test
```

**R60 audio/screen increment** (`handoff_045d6c5813d00ad44dc642d8fbf975e9`, read at
`89602e742aea9c6ef6b6ec6a76c371e20bff2edf`: the audio/screen addendum, R60/A47–A49, D-AUDIO-SCREEN,
the task coordination table and proposed ADR 0002 §11). Plan section 17 covers the iOS input paths for
AUDIO-05–09/13–15 and AVTEST-03–07/11:
- the live classroom microphone mixture;
- actual iPad playback audio plus the enabled microphone, with headphones deciding whether the internal
  track was delivered;
- echo versus a real interruption;
- missing lecturer content;
- per-track stop, with an app-level microphone gate kept distinct from the OS microphone;
- no saved recording;
- a camera view on the shared screen.

It reuses existing research only. Anything unresearched (Bluetooth route options, raw audio under OS
voice processing, another app's camera preview in capture) is marked as a probe question. Six device
tests were added, all `not_tested`; the 58 P0-03 and 43 earlier P0-11 tests remain `not_tested`.
P0-03 DT-G3-05 and DT-G3-11 now note that they are prerequisites only. The matrix and contract 0.1.0
are unchanged. The per-span audio fields are proposals for P0-08 (plan section 14, request 12).

## Target 26.5 revision: reported device and microphone scenarios (2026-09-28 UTC)

Baselines: lead normalization `7fadd151c83118c22a4846bdb8b2622d47bb0df3` (content `9edbc1c`,
`handoff_dcbcd28d18a4feba5ff4ba4df6c11fb5`), merged into this branch as `01207b8` with the lead's
edits to these files kept; contract slice `e63b28f187eaf9577273c5131b65e7b9cc33646e`
(`handoff_47d55ffd3140fa91c6d18329a63397ab`), read with `git show`. Contract 0.1.0 is unchanged.

The user reports an iPad Pro 13-inch (M5) on iPadOS 26.5, and 27.0 is not an upgrade prerequisite.
- **Research.** Workflow `wf_951dd183-c00` (13 agents) read Apple's DocC JSON, Apple Support and
  product pages, and archived guides. It produced 94 claims, each checked by a source-fidelity
  verifier and an overclaim verifier, plus 32 verifier additions and a completeness critic. Key
  facts:
  - `dualRoute` is iPadOS 26.2+, requires `multiRoute` + `allowBluetoothHFP`, keeps the built-in route
    primary, lists four secondary types and needs input and output (F1-01 to F1-03).
  - Apple forbids recording others without their awareness (F1-07), and device support must be read
    from `availableModes` (F1-18, F3-20).
  - The `allowBluetoothHFP` page conflicts with it (F1-15).
  - High-quality Bluetooth recording is default-mode only and not in the EU (F1-23, F1-24).
  - The official multidevice article documents input channel maps (F2-M21), while an archived guide
    says multiRoute has a single input (F2-M23).
  - Route metadata never proves independent signals (F2-04).
  - The broadcast microphone's coexistence with our session is undocumented (F3-14).
- **Matrices.** Every row of both matrices records `target_26_5`, defined in each JSON's
  `status_rules` (`available` means the row's APIs and limits hold on 26.5; it is not a capability or
  device result). Two independent classifiers covered the 217 pre-existing row and test decisions,
  with an adjudicator for 5 of them; the iOS owner set the values for G3-15 to G3-24, DT-G3-12/13 and
  the rewritten AV tests. P0-03 adds G3-15 to G3-24 (5 documented, 5 not_tested) and narrows G3-08 to
  the single-input scenario. No status was raised.
- **Checklists.** Both have a per-test iPadOS 26.5 table.
  - P0-03 DT-G3-05 and DT-G3-11 keep their IDs and text and gain the 26.5 extension. It covers the
    M1 and M2 gates, options, port identity, channel topology and independent-signal method; course
    playback and broadcast coexistence; background; attach, detach and recovery; interruptions and case
    closure; per-source stop; and unsupported paths.
  - New tests: DT-G3-12 (multichannel interface) and DT-G3-13 (optional iPad plus iPhone).
  - P0-11 AV01 to AV06 now use the 26.5 broadcast path, with ScreenCaptureKit as a 27-only
    reference.
- **Plan.** Section 17 adds 17.0 (target and scenarios M1 to M4) and revises 17.1 to 17.5. Section 14
  maps the 0.2.0 capture slice (verified versus pending artifacts, scoped historical sync, stream
  incarnations). Section 15 notes that the user's own device is on 26.x.
- **Checker.** It requires `target_26_5` on every row, with a note unless the value is `available` or
  `not_os_bound`. Each checklist test must appear exactly once in its 26.5 table. It cites the new
  archive. Its self-test gains five rejects.

**Review.** An independent workflow (`wf_be1a1bd9-37a`) used three lenses: requirement fidelity,
citation support and consistency. Each finding was then adversarially verified. It confirmed 21
findings (several duplicated across lenses) and rejected 4. All confirmed findings were fixed before
commit:
- `target_26_5` is now defined, and six untested device-behaviour rows are `unknown` instead of
  `available`.
- The dualRoute candidate list no longer includes the high-quality Bluetooth and multichannel rows.
- The classification provenance is stated exactly.
- The USB input-only microphone as the single input is labelled inferred: the page documents it only
  with `defaultToSpeaker`.
- Mid-broadcast microphone switching is marked undocumented.
- The broadcast path is no longer called the only microphone path.
- The ring-buffer storage audit is made consistent. (Narrowed in the follow-up below: the ban covers
  continuous or full-session recordings only.)
- Route H is defined in the P0-03 checklist.
- DT-LC-03 records its 26.5 expectation.
- Equipment wording now says "already owned" only.

Result separation: documentation and planning only. Nothing is implemented, compiled, provider-run or
device-run; no microphone, mode or route was activated and nothing was bought. All 60 P0-03 and 49
P0-11 device tests are `not_tested`, and every AVTEST case is `not_run`.

```sh
.venv/bin/python apps/ios/tools/check_capability_matrix.py --self-test
.venv/bin/python apps/ios/tools/check_capability_matrix.py --matrix p0-11 --self-test
```

**Retention wording follow-up** (lead review `handoff_c1691b710b60972afca802128e948ea4`). Plan section
17.2 rule 7 and DT-G7-AV06 had forbidden every media file in the extension and App Group containers
except the ring buffer. That contradicted sections 3 and 4 and AUDIO-13/14. They now forbid only
continuous or full-session audio/video recordings (and any saved-lecture or replay prerequisite or
automatic recording expansion), and they list the declared transient buffers.

Durable authorized source evidence explicitly remains, including as files: key frames and keyframe
history, editable original ink, observed attempts, process records, transcripts with time relations,
and pre-stop queued items. A stop does not erase it, and buffer overflow records a gap without
replacing it. Explicit deletion stays separate. Rule 5 and DT-G7-AV02 no longer promise to keep every
duplicate copy permanently; copies are not dropped before interpretation. No status changed.

## Build and device route for the reported target (2026-09-29 UTC)

In response to `handoff_7cedd99e4f141d9ca0d15da8524b91b9` (workflow policy read at `4a2be79`),
[`p0-03-environment.md` section 5](p0-03-environment.md#resolved-route) resolves the route using only
existing access:
- compile on the GA GitHub-hosted `macos-26` runner (free for this public repository; Xcode 26.6 with
  the iOS 26.5 SDK);
- run on the user's own iPad in Swift Playgrounds.

Neither needs signing or a purchase. The probe `apps/ios/probes/EnvProbe.swiftpm` is minimal and
read-only (DT-ENV-01 plus `availableModes`), and it was uncompiled at this point; it later compiled
in run 36525663497 (see `apps/ios/probes/README.md`). The lead owns the proposed CI job.
Asking the user to run the probe (U8) is the lead's call. Signed installs, TestFlight, extensions and
background modes still need U4 together with route A or H, which are not available. No device test
changed status.

## IOS-INK-01: owned-page ink slice (2026-09-29 UTC)

This is the user-approved iPad delivery split: one runnable native slice, built on `402bbcf`.
[`ios-ink-01.md`](ios-ink-01.md) covers the package and scheme, the behaviour, the data-loss rules,
the QA steps, and what the slice does not cover (R59/A44, A46, audio, AI). The source
`apps/ios/CompanionInk.swiftpm` was **uncompiled** at this point. It later compiled (run 36528092111)
and passed QA's Simulator acceptance (run 36532369377); see `ios-ink-01.md`. There is still no install
or physical-iPad result, and no device test changed status.

## Safari web extension packaging for the primary iPad (2026-09-29 UTC)

The lead's bounded continuation `handoff_6f672ef6d403967c109730b0a0f39038` (baseline `d9fe670`).
[`safari-extension-packaging.md`](safari-extension-packaging.md) describes:
- the interface: `apps/ios/SafariExtension/package.sh --webext DIR --out DIR --sdk …` and
  `OUT/interface.json`;
- the native onboarding and handler files;
- the resource constraints for Web;
- the evidence levels;
- the physical-install dependency: whether the existing Apple account already has an enrolled
  team with App Store Connect Apps access. Support `c1d9960` records it, and the question to the
  user is pending.

The real packager run, the hosted compile, the Simulator and the device are all not yet run.

## Screen Observer: whole-screen capture on iPadOS 26.5 (2026-09-29 UTC)

Lead continuation `handoff_ff076be6ab84f162254f863bbd840428` (baseline `1cbc38f`).
[`screen-observer.md`](screen-observer.md) covers the ReplayKit broadcast app and extension:
- the capture of gate 1 only; gate 2 stays unmet;
- bounded keyframes and discontinuity events;
- the local App Group seam, which is not a contract;
- the build commands;
- the signed-build device action.

It compiled unsigned for the device and the Simulator ([run 36568288679](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36568288679), main `98ee104`), and
the Mac boundary check passed 15/15. There is no Simulator behaviour, install or device result.

## Screen Observer originals to the capture ingress (2026-09-29 UTC)

Lead continuation `handoff_1fe2aea7429ea6838ad2a0d00395f772` (baseline `1616cce`).
[`capture-ingress-originals.md`](capture-ingress-originals.md) covers the app-only consumer that
sends one kept PNG as an exact `OriginalArtifactUpload` 0.2.2 to
`PUT /v2/process/originals/{artifact_id}` through an injected transport. It counts an original as
stored only after the matching receipt, keeps durable same-request retry state in the session, and
never sends after a stop. The document also has the Mac Swift check, the Python contract check of
the Swift fixtures, and the exact CI command.

Nothing in the app calls the uploader yet. Hosted [run 36664026247](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36664026247) at main `3745c41` passed:
- the Mac check, 99 PASS and 0 FAIL;
- Python validation of the actual Swift fixtures, 42 PASS and 0 FAIL;
- both unsigned SDK builds.

There is no network, server, Simulator or device result.

## Screen Observer keyframe to RawCaptureFrame 0.2.5 (2026-09-30 UTC)

Lead continuation `handoff_0eacc947a0d86439b93891041abd0219` (baseline `3ee3201`).
[`raw-capture-frame-mapper.md`](raw-capture-frame-mapper.md) covers a pure, uncalled, app-only
mapper. It turns an actual saved keyframe record and status, plus an explicitly supplied identity
and original binding, into exact `RawCaptureFrame` 0.2.5 JSON:
- capture time and course position are unknown (null);
- the orientation is raw and unapplied;
- only a labeled callback estimate is given, with its uncertainty unknown;
- the status is bound to the named local capture session;
- malformed, mismatched or out-of-range inputs are refused, with no file touched.

The document also has the Mac check, the Python contract check of the Swift fixtures and the exact
CI command. The Swift is uncompiled until the hosted job runs; there is no device, server or AI
result.

## Screen Observer raw-frame process batches, 0.2.6 (2026-09-30 UTC)

Lead continuation `handoff_63bc0c142d28c594c19f5d6fafe8d405` (baseline `2a5e6bc`).
[`raw-frame-ingress.md`](raw-frame-ingress.md) covers the uncalled, app-only process-batch sender. It
works only after a kept frame's original bytes are committed. It sends one `RawFrameBatchRequest`
0.2.6 to `POST /v2/process/raw-frames:batch` with an `Idempotency-Key`. That request contains a
single framed `provisional_session` record, with surface `external_app` and method `visual`, whose
coverage is `observed_samples` with limitations `sample_only` and `unsupported_history`. The
record's clock and artifact are bound exactly to the mapper's frame.

The batch counts as committed only after a verified `ProcessBatchAck` 0.2.0. Retries send the
unchanged envelope and key, the uploader's lock, witness and Stop are reused, and nothing is sent
after a Stop. The document also has the Mac check, the Python contract check of the Swift fixtures
and the exact CI command.

The Swift is uncompiled until the hosted job runs; there is no Backend adapter, network or device
result.
