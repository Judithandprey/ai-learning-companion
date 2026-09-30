# Windows QA-WIN-01 saved-evidence review

**Verdict: approve integration as bounded QA-WIN-01 reproduced-case closure.** No blocking source/hash/count/linkage mismatch was found. This is an independent read-only audit of the saved evidence, not a new native run or independent reproduction of its pixel analysis.

Reviewed delivery `890aa3a21af6938f35c798ec82aa1bb104b74092`, tested production `55478f04cab0da3785718469ed69ac8f4e413d1f`, guidance baseline `dc3a7d8`. The relevant guidance/requirements files are unchanged since the prior complete read at `6036026`; existing PONYTAIL LITE and source/English requirement boundaries apply. No repository/worker changes, Git mutations, tests, analyzer execution, app/display launch, network, database or provider operation occurred.

## Verified provenance and counts

- All 36 exported report/evidence/harness files equal the delivery's exact Git blob bytes. The `apps/windows` tree is `9620eb8ec9a7828d1ff4b69946a1bdb789a15563` at tested `55478f0`, Web `f277362` and delivery `890aa3a`.
- All seven executed harness SHA-256 values agree across `run.json`, `env.json` and committed file bytes, including analyzer `3bd0e0eeebba00865c1c35fab0be6c5ebb41a7d1e3a8e56bfd2805572b25cbe7` and runner `14da6677662fcca22e889449938e9d8aa8fe47659cae91ba6bacb7da6216dccd`.
- Private saved `run`, `steps`, selected retained frames, runner results, sample timeline and both saved ink documents reproduce committed JSON bytes exactly after the documented profile-path redaction and ASK data-URL replacement. All 27 files in the saved sanitized analysis output match committed evidence byte for byte; `env.json` is separately recorded environment evidence.
- The eight staged main/renderer/shared/preload file hashes still match `env.json`. The existing Electron executable matches `49b61a030a520fc36a4b8fa5cce53fb4e935a7bdbbe4b80e9222f598e49cc7fa`; package dependency is 44.5.1. No compilation was rerun: fresh-build/stage equivalence remains QA's recorded build observation, with exact production-tree and retained stage hashes independently checked.
- Recount: **46 unique check IDs = 44 pass + 2 limit + 0 fail**. All 300 consecutively numbered runner steps report success, errors are empty, app exited with code 0, runner status is 0. The 158 samples contain 151 fresh, 2 no-new-frame and 5 ended records (five capture sessions). Run times agree: 16:14:49.448–16:17:48.511 UTC.

## Saved image and ink linkage

The independent artifact sub-audit checked all **19 committed PNGs**, all **13 selected retained raw/composed frame pairs**, and their manifest sequence/time, PNG hashes/lengths, 2560×1600 dimensions and timeline pixel hashes. Six committed 1440×600 panel crops exactly equal their saved composed-BMP regions; both ASK PNGs equal saved originals. All 13 retest context originals match their saved hash/dimension and frame-time bindings (1/1/1/2/8 contexts). The cap stroke retains 32 points, eight contexts and four omissions. Stop/reopen/second-Stop saved ink snapshots are byte-identical (SHA-256 `a26bbe7b58673db9e390983ac33246ce35cf6f5ea0e43050691f72db285aeaf3`) and equal the committed revision-5 document with five visible strokes. No linkage anomaly was found. Whole-display private images were not viewed or published.

## Scope supported

The saved QA-WIN-01 check records the intended hard condition: stroke `stk_fa4eea68a0ca` has old-rule coarse difference 0.049 and changed pixels 0.062; actual app status is `changed`, app coarse difference 0.0584 and detailed grid 201×16 with 281 moved cells. The stored counts are 0 verified / 4 changed / 1 unknown after scrolling, restoring to 4 / 0 / 1 after returning. This supports closure of that reproduced false-verification case; the full harness logic is separately reviewed by lead.

The composed-pixel claim is restricted to **11 retained matching states**. Sign/digit controls, raw/composed distinctions, context preservation and reopening evidence are saved for those observations. The report does not establish all continuous capture frames, physical pen/touch/palm behavior, large-stroke glyph sensitivity, exact-period scroll ambiguity, true content anchoring, app-process restart, forced Stop, real AI, either complete desktop §7.1 gate, macOS or Notability.

Both Stop limitations remain correctly visible: held-stroke release was approximately 1 ms after Stop and therefore does not isolate W-I5; post-Stop input refusal itself was not observed, leaving W-I8 limited. Open occurred in a new capture session inside one process. Input was DevTools-injected pen/mouse events on native Windows, not human/hardware pen evidence. Pixel-change omission counts are not user actions or reasoning history. The 85 owner unit tests remain separate author evidence.

## Minor wording correction

`docs/verification/qa/p0-13-windows-qa-win01-55478f0.md:15` says “at any of 23 screenshots.” The runner has **21 `desktopShot` records plus start and end checks = 23 observations**. Every screenshot record has no foreign Electron and cursor `[545, 762]`; start/end agree. Change the sentence to “at start, at each of 21 screenshots, and at end (23 observations).” The summary's 23-observation count is correct. These are point-in-time, Electron-only checks, not continuous proof of exclusive display use. This does not affect QA-WIN-01 closure.

## Reusable evidence

- `/tmp/windows-qa-55478f0-evidence-audit.py`: stdlib saved-record/hash audit; imports no harness, analyzer or app code.
- `/tmp/windows-qa-55478f0-evidence-review.json`: exact per-file hashes, source matches, executed harness/stage/runtime comparisons, counts and limits.
- `/tmp/windows-qa-55478f0-artifact-audit.{json,py}`: saved PNG/manifest/ink/context linkage and crop-byte audit.
- Exact read-only export: `/tmp/windows-qa-55478f0-890aa3a`.
- Original private output was read only for record/hash linkage and remains private; no raw screenshot was published or attached.
