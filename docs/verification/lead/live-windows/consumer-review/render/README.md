# Exact Windows candidate: bounded hidden-renderer review

Candidate: `9622b517b74020b2d9e8ffbb03f8d615ff32341d`. Requirements and decisions were read at main `07c9ebd35d412ff4e8b3f5aa2e1b895da9456fe8`; all four original/English manifest pairs match their recorded SHA-256. Scope is the changed toolbar/Talk/card geometry and interaction under §7.1/§7.3, using project PONYTAIL LITE and the existing operator run-05 harness. This does not accept either full desktop gate.

Exact source snapshot and emitted hashes: `build-9622b517b74020b2d9e8ffbb03f8d615ff32341d/source-manifest.json`. The shell exported the exact commit with `git archive`; existing Node 24.21.0 erased TypeScript types and rewrote relative import extensions. No production source/CSS/capability flag was changed, dependency installed, application/profile modified, or product main/preload executed. This is an executable source-renderer build, not the complete Windows package.

Real runtime: cached Windows Electron 44.5.1, SHA-256 `49b61a030a520fc36a4b8fa5cce53fb4e935a7bdbbe4b80e9222f598e49cc7fa`. Each run contains the executed harness/build script snapshots, `result.json`, screenshots and placement evidence where applicable. Only the owned hidden renderer is screenshotted. A generated canvas stands in for capture; fake `lc` IPC stands in for main, provider and voice. `voice:{audible:false}` exposes the six Talk entries and an inert unresolved `say` promise holds the speaking state. No TTS candidate/helper is imported or executed, and no audio device/model/account/microphone/display capture is opened.

## Completed broad bounded run

`run-01`: **53 PASS / 7 FAIL**, completed in about 5 seconds; no fatal error, renderer error or network attempt. The seven failures represent six covered Talk entries plus one out-of-view answer after shrinking the work area, rather than seven independent defects.

At 1000×700:

| State | Actual toolbar size |
| --- | --- |
| NAV, Talk off | 535×89.97 |
| NAV, Talk on before response | 700.92×105.56 |
| WRITE, response pending in inert voice, all six Talk entries | 760×165.16 |

The six entries (Talk, Mute, slower, rate, faster, Stop reading) are individually visible and hit-testable in the wide speaking state. The one-sentence answer is y=634.89..668.48 inside the card y=130..690 without a manual scroll after reply. Real CDP pointer drag moves toolbar approximately (-140,+95) and card (-190,-70), invokes placement, clamps a card dragged past the edge, and preserves mode/ink/selection/submission. Reload and card reopen restore recorded placement. A normal eraser click changes the tool without dragging or modifying ink.

At synthetic 440×320:

- Toolbar x=10, y=10, size=420×253.16; response card x=70, y=54, size=360×256.
- All six Talk entry centers, around y=123, hit the later response card/crop instead of the controls. `run-01/04-narrow-response-speaking.png` shows the actual coverage. Closing the card makes the controls reachable again; narrow Talk off/on with no card stays within the viewport.
- The answer after work-area shrink is y=558.89..592.48, outside the card ending y=310. A focused causal run is recorded below because the broad run also used card drag/Home before shrinking.

This 440×320 check is a synthetic narrow-workarea boundary; it is not a physical monitor, DPI, multi-monitor or actual native session acceptance claim.

## Environment and harness errors kept separate

The first sandbox Windows probe failed at WSL `UtilBindVsockAnyPort:309: socket failed 1`, after `/proc/1/stat` parsing diagnostics. Root then used normal exact-command escalation for the bounded foreground launcher. Node's initial `spawnSync git` raised `EPERM` despite returning stdout; exporting exact git objects with the shell avoided that harness/environment restriction without changing source.

The Windows runtime logged nonfatal UNC cache/network-sandbox directory ACL errors for this run's isolated `\\wsl.localhost\Ubuntu\tmp\...` folders. These are preserved in `launch-run-01.stderr.txt`; the renderer completed with no renderer errors, no network attempts and a never-shown window. They do not explain the measured CSS overlap.

## Remaining scope

No native cross-app hit-through/focus, physical pen, real DPI/multi-monitor, device removal, persistent product-main preferences, model/bridge account transport, voice playback/captions timing or microphone/system audio is accepted here. Synthetic response/request identifiers are generated solely for the renderer boundary. Production voice remains unconnected exactly as in the candidate. Original-screen full-product and Notability acceptance remain separate.

## Focused causal result and owner action

`run-02`: **7 PASS / 4 FAIL**, completed in 2.67 seconds; no fatal error, renderer error or network attempt. This run retained the exact candidate/build/preload/isolation but removed every intervening card drag, focus, Home or scroll between the wide response and the direct resize. It then closed the card and generated a fresh circle/response in the narrow area. No additional campaign is required to identify these causes.

### F1 — Response card covers Talk/Mute/Stop reading in a narrow work area

**Confirmed source defect at synthetic 440×320**, in WRITE with the six Talk entries active. The toolbar remains inside the viewport, but its Talk row at y=104..142 is behind the response card at y=54..310. All six centers hit the card/crop. A real CDP click at the computed Stop reading rectangle produces **no `hush` call (0→0)** and leaves the inert speaking state active. This is not just a rectangle assertion. Closing the visible card does reach `hush`; the user has that alternate exit, but the designated Talk/Mute/Stop controls are unavailable while the card is shown. The same coverage remains after a fresh response arrives directly in the narrow area.

Evidence: `run-02/result.json`, checks `narrow_talk_stop_unobstructed`, `click_at_stop_reading_rect_reaches_hush`, `fresh_narrow_talk_stop_unobstructed`; screenshots `run-02/02-direct-resize.png` and `run-02/03-narrow-fresh-response.png`; passive pointer events record the actual hit target. The click neither modifies ink nor creates an ask.

Source mechanism: `apps/windows/src/renderer/overlay.css:7` independently positions and clamps both fixed surfaces; `.toolbar` at line 14 wraps its expanded controls, and `.card` at line 29 occupies up to 80vh. `overlay.html:11` places the toolbar before the card at line 35, with no stacking/reserved-space handling to retain essential toolbar access. Source-level explanation is supported by the real geometry/hit testing. Merely putting one entire surface above the other could instead hide the card's close/drag control; the owner should retain access to both surfaces in the small-area layout.

### F2 — Shrinking the work area hides the currently speaking answer

**Confirmed source defect, independent of driver focus/drag.** Before direct resize: card y=130..690, `scrollTop=109`, answer y=634.89..668.48 and visible. After 440×320 resize: card y=54..310, **the same `scrollTop=109`**, answer y=558.89..592.48 and wholly outside the visible card, while the inert current reading remains active. No intervening focus, keyboard, card drag or wheel input occurs in `run-02`.

A fresh answer received while already narrow **does** become visible (y=254.89..288.48 within card y=54..310, `scrollTop=352`). This localizes the problem to preserving the current caption after work-area/size change, not ordinary answer arrival.

Source mechanism: `overlay.ts:231` handles work-area changes by replacing the area and applying CSS dimensions only. The answer reveal at `overlay.ts:1236` runs on a new outcome; it does not restore the current response visibility after geometry changes. Evidence: `run-02/result.json` checks `direct_resize_keeps_answer_visible` and `fresh_narrow_answer_visible`, with corresponding screenshots.

**Next owner: Windows/Web.** Correct these two bounded layout behaviors while preserving source/ink, disclosure, fake-vs-real capability reporting and the current contracts. Lead should review the actual correction and rerun only the affected hidden-renderer cases. Neither defect is a claim of failed real audio or physical-device behavior; no such route was exercised. The wide layout and all unaffected drag/state/placement checks remain valid evidence for this exact candidate.
