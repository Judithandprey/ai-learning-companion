# Windows QA evidence audit — integratable as partial component evidence

Delivery `cba66c862dc287c6f5d53c538017050a501f01ce`, parent `8b5941e`, candidate `061efe287fd965b5a8fcfeced36f1309c2540e2f`. Review export: `/tmp/windows-qa-cba66c8`.

The evidence is suitable for integration with the qualifications below. Preserve **32 pass / 1 fail / 2 limits** as the author's 35-check result; this audit does not promote it to product acceptance or rerun all 35 checks. QA-WIN-01 remains an actual recorded finding and is already assigned by lead. No additional UI campaign is needed for this evidence handoff.

Applied the existing PONYTAIL LITE/workflow and affected §7.1/7.2/7.4 reading from the preceding review. Scope was the exact committed harness, sanitized data and two committed QA crops. No private desktop screenshots, live browser/desktop, native app, provider, database, service, account or Chat was accessed. No repository or worker changes, dependency installs or builds were made.

## Provenance

- All **17** exported files match the exact delivery's raw Git blobs. Hash/size inventory: `/tmp/windows-qa-evidence-hashes.json`.
- `apps/windows` tree is `60d6668741b2f001191d39bc11d47f6b13de30e5` in candidate, QA merge and delivery. Reused sibling source is also identical in all three: `ink.ts` blob `a42551fa8e2a9a33d6aa0b03049a05c75e10a46e`; `mode.ts` blob `487b0345b4214cfbfc630d49bcd1eff8555081b2`. Thus no candidate-source mismatch was found in the Windows/runtime-source closure.
- All six `env.json.harness_sha256_as_executed` values match the committed `run.mjs`, `scenarios.mjs`, PowerShell runner/converter, course HTML and notes.
- Both recorded preload hashes match candidate source directly. The other five staged hashes name generated JavaScript; the generated files are not in this evidence commit and were not rebuilt here. Those build/stage equality claims remain post-run operator attestations. Seven hashes do not independently prove every static asset or the complete launched package closure.
- `env.json` records pinned Node 24.21.0 and Electron 44.5.1 executable SHA-256 `49b61a030a520fc36a4b8fa5cce53fb4e935a7bdbbe4b80e9222f598e49cc7fa`; no executable was launched or independently reread in this audit. Environment facts were collected at 13:09:22 UTC, after the counted 12:43:09.216–12:44:17.166 UTC run, as disclosed.

## Offline recomputation

Command executed successfully:

```sh
python3 /tmp/windows-qa-evidence-recompute.py
```

Output: `/tmp/windows-qa-evidence-recompute.json`. This independent standard-library audit opens only committed sanitized files under the export. It does not follow the recorded private paths or execute the live runner/analyzer.

Confirmed from recorded data:

- 126 successful runner steps, no recorded errors, app exited with code 0. Nine sampled guards (start, seven screenshots, end) saw no foreign Electron process. The guard remains sampled, Electron-only and unable to see unreadable command lines; this is not continuous proof of an exclusive desktop.
- 60 samples in three sessions of 49/10/1 samples; 57 fresh and 3 ended, each session ending explicitly. Source/display facts agree throughout: 1280×800 DIP, scale 2, raw geometry 2560×1600. Recorded held/stream counts and raw/composed presence/hash relationships agree.
- The raw hash stays constant while sampled ink revisions are **0,1,2,3,4,6,7**. Revision 5 was not sampled; “across revisions 0–7” must not mean every revision was individually observed.
- Alignment counts are 4 verified / 0 changed / 1 unknown before scroll, 1 / 3 / 1 after 300 DIP scroll, and 4 / 0 / 1 after returning. These aggregate application observations support preserving QA-WIN-01. The identification of a particular false-verified text stroke and its 0.049 fingerprint change comes from QA's documented reconstruction; the private screenshot reconstruction was not rerun here.
- Five still-display samples record fresh with change 0. Independent screenshot equality remains the original QA pixel analysis.
- DOM observations confirm explicit mouse enablement, mouse-off refusal hint, and ASK finish/cancel returning to WRITE. These are scripted app-state observations, not hardware input or hit-testing.
- Replaying the final document's 11 history operations reconstructs its final seven visible strokes and nine retained stroke records. The partial erase retains the original and produces pieces x=50–288.2 and 313.4–560 around x=300; undo/redo restore the earlier visible sets.
- Reopen occurs in a new capture session in the **same application process**. The first nonempty composed sample reports revision 8 and six visible strokes, agreeing with the saved history and reopen hint. Subsequent undo/add continue the original document (`f31238fcc7bde6db`, no fork). No app restart/relaunch persistence was tested.
- Both long pen-type injected strokes survive as 17-point originals with context references. The separately injected post-Stop stroke shapes are absent from final persisted history; recovery lists are empty and endings say user Stop. The 15/14 DevTools event replies establish protocol completion, not application-level refusal or that input was processed after the Stop handler. Existing W-I5/W-I8 limits remain necessary.
- All seven final context references are nonnull, retain explicit `source_app/source_link/page/media_position` unknowns, and have consistent DIP-to-pixel geometry. Only one referenced context PNG is committed and independently hash-checked here; six other receipt hashes remain QA's original private-run verification.

## Committed image bytes and privacy

Both files pass PNG signature/chunk bounds/CRC/IEND, zlib decompression and scanline reconstruction. Both were independently viewed in this review and contain only QA-authored oscillator text/formula, with a partial ink mark in the ASK crop. No desktop/taskbar/private user content is visible. Lead separately reported the same visual inspection. This establishes the committed images' content, not their absolute desktop placement.

| File | Bytes | Actual decoded dimensions | File SHA-256 |
| --- | ---: | --- | --- |
| `context-first-stroke.png` | 66,253 | 1212×216 RGBA8 | `02421bc37b1351e12d5239657030b85bf6ff45098a94afa7c2bb7070afb38714` |
| `ask-crop.png` | 25,731 | 632×212 RGBA8 | `9266e71a2da6a6963f3b20d78b0579a09c81ed7963f818628afe86ec5e19cd84` |

The first image's bytes/hash/geometry exactly match its context receipt. The ASK geometry agrees with the summary and card region. Its absolute placement and 98.5%/24-level screenshot score cannot be independently regenerated from the committed crop alone; no private screenshot access is required to integrate this appropriately qualified QA evidence.

## Narrow wording corrections for integration

1. **Pending-save concurrency was not observed.** `analyze.py:300–301`, its exported summary note, and report line 100 assert the lifted stroke's save “was still draining when Stop was clicked.” The predicate only checks the persisted stroke/context and final state; the harness does not observe the save promise or instrument completion. Keep the pass for “a lifted 17-point stroke remains saved after the immediately following Stop,” and state that an overlapping pending save was not established. No count change is required for that narrower observed predicate.
2. **An empty recovery list is not proof that no unsaved input existed.** `analyze.py:295` says “nothing was left unsaved”; use “the recovery list was empty.” The report already correctly explains that the pre-fix accepted-then-destroyed W-I8 outcome could look identical. Keep that limitation next to both post-Stop persistence passes.
3. **Post-run cleanup is operator evidence.** Report lines 49–50 say no QA processes remained. Committed runner cleanup attempts root-process termination with suppressed errors (`qa-electron-runner.ps1:334–341`); there is no committed descendant/after-cleanup inventory. Attribute this statement to QA's post-run observation rather than a harness-certified result. The clean application exit itself is recorded.

These clarify evidence wording; they do not require redoing the run, exposing private screenshots, changing product code, or blocking preserved component evidence. Integrate it as a partial component check with QA-WIN-01 open and both Stop limits retained. Physical pen/pressure, NAV pass-through, visible toolbar/hit-testing, app restart, save-failure recovery, geometry/permission loss, content-following ink, real AI and both §7.1 gates remain unaccepted. Source review or this offline replay supplies none of those missing runtime results.

## Lead integration and wording correction

The exact QA delivery integrates as `5741540`. Lead preserves all original counts,
observed data, source hashes and QA-WIN-01, and applies the three wording corrections
above in report/analyzer and the corresponding summary notes. The immutable original
report/summary remains available at `cba66c8`; original-delivery-hashes.json is an
inventory of that exact commit, not a checksum claim for the subsequently qualified
text. The standalone offline replay uses only sanitized retained evidence; no live
run or private pixel analysis is repeated. Both Stop limits and partial acceptance
remain. Current Web retention correction runs first; ONE next alignment repair was
accepted through `handoff_8833420ed4b1c1b6107effe3f5879b22`.
