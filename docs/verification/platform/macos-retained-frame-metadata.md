# macOS retained session → Mac retained-frame 0.2.11 metadata

Task: the lead's bounded P0-03/11 → P1-02/P2-03 continuation
`handoff_34458e9d8100322f38222c9073308986`, started as `handoff_49b29d7aa7c48ca07bb92a9601b22716`.
Baseline: exact pushed main `c2ac1c7f7f8337424812fb5e53cc078d9715548d`, normally merged into
`team/ios` as `ebae7af` with no conflicts; `apps/macos` was unchanged by the merge.

Read at that baseline:
- the released `packages/contracts/macos_frame` (README, validator, examples, generated schema) and
  `docs/verification/lead/macos-frame-contract-review/`;
- R03, R08, R35, R36, R46, R51, R52 and R59, and A12, A14, A26, A30, A31 and A44;
- current decisions.

The requirement files are unchanged since my last refresh.

**Scope.** This is a callable, pure mapper: descriptors plus binding-plan data. It is **not an
HTTP request or transport**, and nothing is sent, registered, activated or granted. The released
0.2.7/0.2.8 mapper (`DesktopIngress`) is unchanged, and it still refuses the app-excluded and
unknown-overlay scopes. Backend's 0.2.12 and native transport are later work.

## What the mapper does

`MacRetainedFrames.map(_ plan: MacRetainedPlan, session: RetainedSession) -> MacRetainedMapping`
lives in `Sources/DesktopCapture/MacRetainedFrames.swift`.

| Part | Behaviour |
| --- | --- |
| Identities | The trusted host supplies every identity in the plan: device, session and stream; source; one frame ID per kept callback; and the existing 0.2.2 `screen_image` bindings for the raw image and, where needed, the composed image. The native session label never becomes an archive identity. |
| Plan checks (throw) | Identifiers, source, native session, and start display must be the registered ones. Frame IDs and callback sequences must be unique. Every binding must belong to the plan's source. One artifact ID must never name two different PNGs. |
| Entry checks (refused per entry, with reason) | Before any retained original is claimed:<br>- the raw file must have the recorder's exact `frames/NNNNNNNN.png` name, and is re-read under the retained-file policy (no symbolic link, containment, `O_NOFOLLOW`, SHA-256 and length);<br>- its PNG size is checked against the record;<br>- the composed file, when it is its own file, is checked the same way under `composed/`.<br>The released 0.2.11 cross-field rules are mirrored, so tampered records are refused rather than described:<br>- raw relation, alias rules, pairing basis, and scope;<br>- zero ticks agreeing with zero seconds, and the source-time rule;<br>- a positive display size, and the exact mapping text for frame size / startup display size;<br>- the three base limitations first in order; each conditional limitation (unknown time, no document, raw alias) exactly when it applies; the reopened-revision limitation exactly when a revision has no commit time;<br>- document, path, revision and commit-time rules.<br>Text limits are enforced in code points (16,384, 1,024 and 512); oversize text is refused, never truncated. |
| Raw | `raw`: the supplied artifact ID with the file's digest and length, size, `native_file` and encoding. |
| Composition | Each is exactly what the session recorded:<br>- **composed**: image, raw relation, paired ink (time basis, document, revision, commit time, strokes, mapping, rendering, limits) and composition time.<br>- **not_composed**: callback, host, reason, detail.<br>- **unknown** (`no_retained_outcome`): no outcome recorded. That includes a crash, an unfinished session, and a session that could not exclude this app.<br>A frame without an outcome is **never** successful empty ink. |
| Aliases | Without strokes, the composed image is the raw file itself. With no composed binding it reuses the raw binding (one archive reference); a separate binding with identical facts is a second reference. Images with strokes need their own binding. |
| Profile | Native session, pixel format, and display at start in the 0.2.11 scope set. The host clock carries the wall and host anchor, callback, UInt64 display ticks as decimal text, converted seconds, `source_seconds`, and the recorded lead tolerance. The sample facts are included. Capture UTC, media position, pixel orientation and capture latency are always null. |
| Editable ink | Only the document reference (created-in session and path) and the revision the producer recorded are carried. They are **not** an immutable editable original, and none is invented from the current `ink.json`. Since [`macos-ink-originals.md`](macos-ink-originals.md), a composed frame may keep a frozen document snapshot. That snapshot is returned only as a separate 0.2.2 `editable_ink` binding when the host supplies one; the 0.2.11 descriptor is unchanged. |
| Unrepresented facts | Reported, not dropped:<br>- the session's notes and gaps;<br>- its ending from status.json, or from `events.jsonl` when status.json trails it, or that none is recorded, with any disagreement flagged;<br>- stream notes: errors after live ended, and stops after a start or a Quit;<br>- the capture_filter details, or that none is recorded;<br>- outcome-less frames (conflicting ones are not counted among them), conflicting or stray outcomes, and ignored late requests;<br>- kept frames not in the plan;<br>- **always** the ink documents, whether named by outcomes or saved in the session's `ink/` folder, or that there are none. Editable strokes, operations, anchors and ASK selections live in ink documents, possibly in other sessions; a failed save is known only to the app;<br>- the session counts, in sorted order. |
| Session reading | `RetainedSession.read` now also collects composition outcomes, conflicting and stray outcomes, capture_filter, ignored requests, the `ended` event and stream notes. Old fields, notes and messages are unchanged. **One change applies to both paths:** a `composed` or `not_composed` line without its payload now refuses the session, as a `kept`, `gap` or `run` line always did. A torn or unreadable line still refuses the whole session. |

## Checks

```sh
swift build --package-path apps/macos/CompanionDesktop
COMPANION_DESKTOP_FIXTURE_DIR=... COMPANION_DESKTOP_INGRESS_FIXTURE_DIR=... \
COMPANION_DESKTOP_COMPOSED_FIXTURE_DIR=... COMPANION_DESKTOP_MAC_FRAME_FIXTURE_DIR=<new directory> \
  swift test --package-path apps/macos/CompanionDesktop                    # 44 tests
python3 apps/macos/CompanionDesktop/checks/validate_mac_retained_frames.py <that directory>
```

`Tests/DesktopCaptureTests/MacRetainedFramesTests.swift` adds 2 XCTests (44 declared). One
deterministic session is made by the real recorder, composer and FrameStore from encoded
synthetic 200×100 pixels. It is never finished, and has eight kept frames:

1. composed with no document open (raw alias);
2. composed at revision 0 (raw alias);
3. composed after a stroke (revision 1);
4. composed after a partial erase (revision 2);
5. paired at callback admission (no source time);
6. composed with the same document reopened, whose carried revision 2 has an unknown commit time
   and its limitation;
7. not composed (a rotation before its pixels);
8. no outcome (`unknown`).

| Test | What it checks |
| --- | --- |
| Every outcome | All 8 are described, with none refused:<br>- the outcome kinds, revisions, null document, callback basis, reopened limit and commit times;<br>- the four null fields;<br>- binding counts (1, 1, 2, 2, 2, 2, 1, 1), and alias and composed files;<br>- a second plan giving the raw alias two archive references;<br>- unrepresented facts: no ending, the capture filter, the outcome-less frame, and editable ink;<br>- the 0.2.7 mapper still refusing this scope.<br>It also runs **42 refusal cases**:<br>- a JPEG given to the PNG check, and a consistently recorded same-sized JPEG at a raw and at a composed .png path;<br>- corrupt raw bytes, a missing composed file, corrupt composed bytes, a wrong recorded size;<br>- the source-time rule, an incomplete callback, an unknown scope, composition without exclusion;<br>- the raw relation, strokes on the raw file, empty ink as its own file, the time basis, a commit after the pixels;<br>- a malformed stroke ID, the ink path, revision 0 with strokes, an oversize limit or detail, an unknown reason;<br>- the raw file name, zero ticks, the mapping ratio, base-limit order, a missing raw-alias limit, an added unknown-time limit, and a missing, invented or leading-zero reopened limit;<br>- two outcomes, a missing, stray or mismatched binding, and a non-screen binding;<br>- the plan-level session, display, duplicate frame ID, artifact ID naming two PNGs, foreign source, and bad identifier.<br>A reopened-looking limitation with no revision number is an ordinary extra limitation, as 0.2.11 reads it: the frame is still described, and nothing traps.<br>With the env var set, it writes the session, both mappings and all refusals to the fixture. |
| Incomplete sessions | - A torn last line in `events.jsonl` refuses the session.<br>- With every outcome line lost, all 8 frames are `unknown`. The unrepresented facts name them, the missing ending and the still-saved ink document.<br>- Outcome lines read back from `events.jsonl` (two for one frame, one for no kept frame, an ignored request) give the conflicting frame's refusal and the exact unrepresented lines. The conflicting frame is not listed as outcome-less.<br>- An outcome line without its payload refuses the session.<br>- A session that could not exclude this app composes nothing, maps as `unknown`, and reports its ending, the missing capture_filter and no ink document.<br>- Its two recorded endings (status.json and the `ended` event) both appear. After only the event's reason, detail and live-ended host are edited, both still appear, together with a line naming the three differing fields; neither is chosen. |

**Owner checker.** `checks/validate_mac_retained_frames.py` runs in the repository's pinned
environment. For every described frame it:
- runs the released `validate` and `validate_binding` with the manifest's DisplaySourceSnapshot and
  the Swift-supplied bindings. The ProcessBatch record is synthesized by the checker from the
  descriptor, because the mapper emits none, so those record-side equalities hold by construction;
- cross-checks the native records and files: raw bytes and IHDR; the composition kind against the
  recorded outcome; composed facts, paired ink and composed bytes; the **whole** profile (display
  at start, wall and host clock with exact UInt64 ticks, sample facts) against status.json and the
  kept frame;
- checks full coverage and the exact unrepresented lines: the outcome-less callbacks, ending,
  capture filter and ink documents;
- runs negative controls on frames and bindings, each of which the released contract must refuse
  **for its stated rule** (message fragment);
- requires Swift refusal reasons to contain their expected fragments;
- checks non-vacuity.

Each frame reports its own failures.

**Executed here (Python only; not Swift output):**
- **Mapper port.** A line-by-line Python port of the mapper (local, not committed) was run on the
  lead's **real hosted Swift fixture session**
  (`docs/verification/lead/macos-composed-hosted/macos-composed-fixture/`), with the released
  example's synthetic identities. It reproduced the released
  `packages/contracts/macos_frame/examples/macos-retained.json` **exactly, 7/7 descriptors**.
- **Checker on that manifest.** Everything passed except non-vacuity, which was expected because
  that session has no `unknown`, no-document or reopened frame:
  - the released `validate`/`validate_binding` on every descriptor, including a two-reference
    alias;
  - every native cross-check;
  - 84 mutations refused.
- **Mapper port with the mirrored rules** (exact mapping text, limit rules, zero ticks, raw file
  name): it still reproduces the released examples 7/7.
- **Checker on an edited copy** of that session, with frame 1 before any document, frame 4
  carried across a reopening, and frame 5's outcome removed. All checks passed, with 83 frame and
  binding controls, each refused for its stated rule.
- **Tampering caught** by the native cross-checks:
  - a fabricated `not_composed` for the unknown frame;
  - a changed revision;
  - a changed sample fact;
  - a wrong outcome-less callback list.

**NOT_RUN:** the Swift mapper, the 44 declared XCTests and the Swift-emitted fixture. The lead's
hosted run is next.

**Lead wiring (not edited here).** Wiring needs:
- `COMPANION_DESKTOP_MAC_FRAME_FIXTURE_DIR` on the hosted `swift test`;
- the checker step, run in the pinned environment;
- hashing and upload of the folder;
- the Linux probe stub.

While the variable is unset, nothing breaks. Pinned counts change: 44 tests, a fifth test file
(`MacRetainedFramesTests.swift`), and one new library file (`MacRetainedFrames.swift`). The six
app sources are unchanged.

## Review outcome

`wf_7bc36465-330` was read-only, with 7 agents: compile, behaviour, test trace and checker
lenses, each followed by a skeptic. No compile error was found.

Confirmed and fixed:
- **Released rules.** They were not mirrored, so tampered records could become descriptors that
  0.2.11 rejects.
- **Ink facts.** They were dropped when no outcome named the document.
- **Fixture mode.** The test failed there, because the scratch root was never created.
- **Outcome-less list.** It included conflicting frames.
- **Endings and stream notes.** The ending and stream notes in `events.jsonl` were ignored.
- **Counts.** The counts line was in nondeterministic order.
- **Untested reads.** Conflicting, stray and ignored reads were not tested.
- **Checker:**
  - the profile comparison was partial;
  - controls were refused for rules other than their label;
  - the unrepresented checks were substring-only;
  - one error aborted the rest of a case;
  - the bindings were checked only positively.
- **Doc wording** about the shared reader and the port manifests.

The focused re-check `wf_07f705a4-0be` (4 agents) found no compile error and no failing
assertion. It confirmed one crash risk, now fixed: a reopened-looking limitation with no digits
made `isReopenedLimit` build an inverted range, and leading zeros were not counted as the released
pattern counts them. The rule is now a prefix, digits and suffix match that cannot trap. A Python
mirror of it agrees with the released regex on 10 edge cases.

Refuted:
- pinning the refusal case names in the checker, which is Swift's own set;
- the record-side vacuity (disclosed above);
- a status/events outcome-count note, since the counts are already reported.

Nothing was compiled.

## Correction (lead review of `df581e8`)

The lead held `df581e8` (`handoff_99972a1c0d59fa1d0fe4dc7680e4e0a8`, review main `f9b2eca`;
0.2.11 unchanged). It found two retained-input handling gaps and a checker weakness. No wire,
transport or scope change was made.

1. **PNG format.** `checkSize` read ImageIO dimensions of any image, so a consistently recorded
   non-PNG at a `.png` path could have been described as PNG. It now requires the PNG signature
   and ImageIO's detected type `public.png` before reading the size. This covers raw and composed
   images. Native regressions: a JPEG through the helper, and a same-sized JPEG with its own
   recorded SHA-256 and length through the mapper at `frames/` and at `composed/`.
2. **Endings.** A status.json ending suppressed the `events.jsonl` ending. Both are now reported
   whenever they exist. When their shared fields (reason, detail, live-ended host) differ, a line
   names the differing fields; neither is chosen. There is a paired-ending regression.
3. **Checker.** The unrepresented check tested prefixes and absence only, so the lead's wrapped
   manifest passed it with no ending text and invented ink-document text. The checker now
   recomputes the exact expected lines from the retained files and compares each category exactly:
   - both endings and any disagreement;
   - stream notes;
   - the capture filter;
   - the ink documents (named by outcomes, and saved in `ink/`);
   - the outcome-less callbacks.

   Controls that remove or change each recomputed line, or add an invented ink document, must
   fail. Non-vacuity requires them. The existing strict controls and non-vacuity are unchanged.

Executed here (Python only):
- **Lead's probe.** Pointed at this checker, it passes all 78 of its fragment-bound controls. Its
  wrapped manifest now **fails the unrepresented check** for three reasons: the missing status and
  events endings, the missing capture-filter line, and the invented ink text. Before, only
  non-vacuity failed.
- **Edited-copy manifest.** From the Python port of this session, the checker passes fully: 133
  checks, including every removal, change and invention control.
- **Delta check.** `wf_36a66f93-e6e` (2 agents) found no compile error or failing assertion. It
  confirmed that the ending, stream, filter, ink and unknown lines match the checker's
  recomputation byte for byte. One checker mismatch was fixed: ink documents were named from
  outcomes of frames that were not kept, which Swift omits.

The Swift checks, the JPEG and ending regressions, and the Swift-emitted fixture are **NOT_RUN**.

## Limits

- This checks declared and retained facts only. It does not verify app exclusion, geometry,
  permissions, live chronology, AI receipt or an immutable editable-ink original.
- The Python port reproduces the released examples; it is not Swift execution.
- An unreadable log refuses the whole session, as before; no partial mapping is attempted.
- A torn last line after a crash therefore blocks mapping until it is repaired by hand. The
  retained files are never changed by the mapper.
- No contract carries the unrepresented facts; they stay in the session and ink files.

## Next owners

- **Lead:** source review, the hosted build and tests, the generated-fixture check, and 0.2.12.
- **Native:** actual compile or test failures first; native 0.2.12 transport later, on its
  baseline.
- **QA:** an actual Mac only when access exists.
