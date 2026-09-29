# P0-13 independent acceptance matrix: A26–A28, A30–A46, G7

Specification: `e43293760c70364584cb597ae01d34a261cc52cf` (R51–R59, A30–A46, G7;
A26–A28 linked). Contract: v0.1.0. P0-08 has no versioned process contract yet.

**Status:** nothing in this matrix is passed. Product execution count is 0.

The "v1 fixtures" column refers to the reviewed learning corpus `problem_solving_v1`
([case review](p0-13-case-review.md)). The `fb445ed` `problem_solving_surfaces_v1`
cases are pending QA review.

Full per-row fields are in [p0-13/acceptance-matrix.json](p0-13/acceptance-matrix.json):
paths, expected evidence, deterministic checks, independent review, device steps,
pass criteria and exclusions. That file is a drafting pass; for case verdicts the
adjudicated case review governs.

## Rules that apply to every row

- **Pass criteria.** Fixed sets need 0 premature disclosures, 0 fabricated steps
  and 0 false independent-mastery labels. Each count is reported with its
  denominator, per channel and per path. Zero executed cases means untested, not
  passed.
- **Checks are layered and reported separately.** These are: source implemented;
  compiled; deterministic rule checks; independent mathematical/semantic review by a
  reviewer who is not the generating model (a human for threshold calls); and
  real-device or consented user trial.
- **Exclusions.** None of these counts as a pass:
  - a structural probe pass or a declared level tag;
  - 37/37 rule agreement;
  - the 71/73 annotation ratio;
  - the generating model's self-score;
  - desktop or simulator results used for iPad/Pencil;
  - one path's result applied to another path;
  - a fallback (A45) used for A44/R59;
  - a share sheet or PDF/PNG export used for A46.

## Matrix

| ID | Scenario focus | v1 fixtures (adjudicated status) | Separately evidenced paths | Owners | Stage | Status / blocker |
| --- | --- | --- | --- | --- | --- | --- |
| A26 | Pencil notes while finger navigation stays normal | none | iPad Safari overlay; native course view/own canvas; native-app layer per app; desktop probe (supporting only) | web, ios, backend, lead, qa | P0 G1 probe → P1 | blocked: no Mac/Xcode/iPad path; P0-02 is a desktop probe only |
| A27 | Autosave, offline, restart; AI layer deletable | none | own-canvas ink; original-screen overlay ink; Safari overlay ink; sync | ios, web, backend, learning, lead, qa | P1 → P2 | blocked: no native build; P0-08/P0-09 not committed |
| A28 | Notability share / OneNote archive truthfulness | none | Notability share and official import; OneNote Graph | ios, backend, lead, qa | P0 G5 → P2 | blocked: device and user account steps |
| A30 | Three methods, erase/undo/redo, branches | p01, p03, p04 reviewed; no visual multi-method case | structured own canvas; visual external app; web DOM/overlay | backend, ios, web, learning, lead, qa | P0 cases → P1 | partial fixture review; no negative control for the visual clause |
| A31 | Fast erase, offline, page switch, resend | p01, p02, p05 reviewed; resend and no-restart not exercised | as A30 | backend, ios, web, learning, qa | P0 → P1 → P3 | partial; gap location missing (p02) |
| A32 | "Let me try", then "check this step" | p18, p19, p36 correctly rejected (tag-dependent); p20 acceptable; no single-trace composite | all presentation channels | learning, ios, web, backend, lead, qa | P0 → P1 | partial; no check-continuation negative control; 0 NAV cases |
| A33 | Escalating hints, then an explicit solution | p21, p22 acceptable; p23 rejected; **p37 leaks** (intended); **p29 leaks** (QA, disputed; not mapped by the author) | body, title, diagram, notification, audio, queued audio, note, review | learning, ios, web, backend, qa | P0 review → P1 | **fixed-set zero-leak target not met on the corpus** |
| A34 | Stale cache, correction, topic switch, retraction, disconnect | p23–p28 rejected; placeholders in p25, p27, p28; intent carried over in p25 | per channel; cross-device | lead, backend, learning, ios, web, qa | P0 → P1 → P3 | partial; single device; no reconnected-but-unsynced case |
| A35 | Valid alternative; invalid reasoning with a correct value | p09, p10, p11 acceptable; math verified | — | learning, qa | P0 → P1 → P2 | partial; elementary algebra only |
| A36 | Ambiguous sign, missing step, unknown reason | p06 (**high**: `has_gap=false`), p07 (unlabeled `absolute_first`), p08, p12 (false arithmetic understated) | visual; structured | learning, ios, web, backend, qa | P0 → P1 | partial; reason and first-error rules check metadata only |
| A37 | Self-correction, then hint, then independent transfer | p13–p16 acceptable; p35 rejected; relabels pass the probe | — | learning, backend, qa | P0 → P2 | partial; no linked chain; mastery not checked against help records |
| A38 | Rebuttal, then a model switch next week | p33 partial; p32 does not exercise A38 | restart; model switch; device | backend, learning, lead, qa | P0 → P1 → P3 | partial |
| A39 | Text, diagram, interactive example, skippable practice | p17 (skip), p34 (open human check), p37 (weak mapping) | diagram; interactive demo | learning, ios, web, qa | P0 → P2 | partial; placeholder diagram payloads |
| A40 | English-first; scoped Chinese override | p27, p29–p32; quotes cannot fail; no voice case | text; voice; notes | backend, learning, ios, web, qa | P1 → P3 | partial |
| A41 | Real iPad: external notes app vs Safari vs own canvas | none | each path separately | ios, web, backend, qa | P0 G7 → P1 | blocked: device |
| A42 | Web choices and inputs; website answers and grading | none in v1 | per site; DOM vs canvas/iframe/shadow DOM | web, backend, learning, lead, qa | P0 → P1 | untested; source attribution enum awaits P0-08 |
| A43 | Mixed entries in one problem; redo vs new problem | none in v1 | all entries | backend, learning, ios, web, lead, qa | P0 → P1 → P3 | untested |
| A44 | Live original-screen annotation seen by the AI | none | **web overlay; Windows desktop (P3); iPad/iPhone native app layer, each separately** | web, ios, backend, lead, qa | P0 → P1 web → P3 Windows | blocked: device; a fallback never counts |
| A45 | Honest frozen/canvas/side-by-side fallback | none | per fallback type | ios, web, backend, qa | P0 → P1 | untested; never counted as A44 |
| A46 | Classroom original-screen notes → Notability import | none | 4 checks: original-screen writing; editable original + anchors; separate AI layer; inspected import | ios, web, backend, learning, lead, qa | P0 → P2 | blocked: A44 device path and a real Notability import |
| G7 | All of the above per path | 37 reviewed ([case review](p0-13-case-review.md)) | per entry, platform, app and OS | all | P0 → P3 | untested at product level |

## Device and user steps QA needs later (summary)

These are not executed. Full steps are in the JSON.

- **A26/A27/A41.** Use a real iPad with Pencil. Write in WRITE mode while
  finger-scrolling, tapping, zooming and scrubbing video. Go offline, force-quit and
  relaunch, then check the strokes are editable and there are no duplicate versions.
  Run the same fast erase/undo/branch script in an external notes app, in Safari
  and on the own canvas, with a second-camera human reference.
- **A32–A34, A36–A40.** Consented user sessions on one supported iPad path. Record
  every channel: card, title, notification preview, diagram, audio and queued audio.
  Include a second device changing the help level, a disconnect, "don't tell me",
  a topic switch and a Chinese override.
- **A42/A43.** Use an owned quiz page and one authorized course quiz. Select,
  deselect, reselect, edit text and formulas, submit and view grading. Then combine
  entry types within one problem, redo it, and move to the next problem.
- **A44 (per platform).**
  - Web: write over the live page, then scroll, zoom, play video, change the problem
    and stop sharing. Inspect the frames the server actually received.
  - Windows (P3): check input passthrough and window switching.
  - iPad/iPhone native apps: rely only on public capabilities, per app and OS.
- **A45.** Enter the fallback from a course page and annotate the frozen frame. Then
  change the original page and check for a warning and a one-step return.
- **A46.** Write on the original screen during a real course, then save, restart and
  verify the anchors. Add an AI layer and delete it. Export to Notability, complete
  the import, and inspect the imported note (not native strokes). Confirm that the
  app's original stays editable.

## Blockers (current)

- The P0-08 versioned process/disclosure contract is not committed.
- There is no fixed runnable integration candidate for protocol execution.
- There is no Mac/Xcode, native build or device path.
- There is no real Notability import evidence, and no authorized real-site DOM run.
- The `problem_solving_surfaces_v1` review is pending.
