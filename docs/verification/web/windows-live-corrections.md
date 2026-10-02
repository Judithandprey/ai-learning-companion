# Windows live: Stop, fresh Start and reachable captions

2026-10-02. One continuation of the existing Web assignment, on `team/web` over
`9622b517b74020b2d9e8ffbb03f8d615ff32341d`. The delivered commit is the commit
containing this report; exact tested source hashes are in
[the receipt](evidence/windows-live-corrections/receipt.json).

Recovered the unchanged dirty-work inventory and the original lead handoffs
`afb4c0cb` / `b2ed7453`. Read canonical workflow, current task/role, original and
English clauses, decisions and traceability at
`93491798a000a61328a63f7588916bf6f43ddc42`. All four source/English manifest pairs
match ([recovery receipt](evidence/windows-live-corrections/requirements-recovery.json)).
This supports R03/R06–10/R27/R29–30/R36/R40–41/R46/R52–53/R56–59,
A03/A06/A14/A31/A34, main §7.1/7.3 and ADR 0004. It does not close their full
real-device/product acceptance. PONYTAIL LITE applies: existing session IDs,
capture/original storage, placement and bounds are reused; no dependency or shared
contract changes. `lc-subscription-live/1` stays unchanged.

## Four corrections

| Finding | Result and exercised behavior |
| --- | --- |
| WIN-LIVE-01 | Before rendering an answered result, the overlay asks main to check its current capture, AI session and card/request. A Stop, restart, cancellation or changed card during that round trip suppresses it. Buffered circle/follow-up replies do not appear or play. Already legitimately shown answers retain their history. Write failures remain visible with Save. |
| WIN-LIVE-02 | Each explicit AI Start gets a picture newly acquired for that session even on unchanged pixels. It is kept at its existing content address and offered once within the same scheduling/budget/reserve/gap rules. Stream freshness/age remains explicit; cached pre-Start pixels are not relabeled. Encoding failures are bounded and visible. |
| WIN-LIVE-03 | The card fits into usable room beside the toolbar; tight-area controls/hints are compact and the toolbar has priority where usable separate room is impossible. At 440×320 all six Talk entries have real Chromium hit targets. A real CDP click on Stop reading sends hush and stops the fake reading state. |
| WIN-LIVE-04 | Work-area/window changes refit the card and reveal the current response. Toolbar resizing during reading also keeps it visible; ordinary hint changes do not repeatedly pull a silently viewed card away from the user's scroll. Real resize 1000×700 → 440×320 keeps the caption inside its viewport. Dragging retains caption/handles and produces no ink/Ask or idle jitter. |

Independent source review found one remaining defect in the retained corrections:
wall-clock `since` was used as session identity. Equal Start timestamps caused a
missing new first look and sent an encoded old circle into the new session.
The app now carries its existing unique `live.id` through private IPC; time only
checks freshness. A held bitmap is tagged with the session at acquisition before
awaiting. A retained material frame whose encoding crosses restart still saves its
original, but cannot become an observation in the new session. Three focused
counterexamples fail on the recovered pre-correction scratch source and pass here.

## Executed checks

Linux Node 24.21.0, TypeScript 7.0.2. Windows renderer uses cached Electron 44.5.1
/ Chromium 152.0.7977.130. Checks operate only on generated media and stand-ins;
no account, model, real capture, microphone or audio device was used.

| Check | Result / evidence |
| --- | --- |
| `tsc -p tsconfig.json --noEmit`; `npm run build` | Pass; [build](evidence/windows-live-corrections/build.txt). Compiled static app; no user package staged. |
| `node --test --test-isolation=none --test-reporter=spec tests/{app-live,app-ask,overlay-surfaces,placement,overlay-frames}.test.ts` | **97 pass, 0 fail, 0 skip**; [named cases](evidence/windows-live-corrections/focused.txt). |
| Lead's original two lifecycle probes, copied unchanged into scratch tests | **2/2 pass**; [probe](evidence/windows-live-corrections/review-wire-probes.test.ts), [result](evidence/windows-live-corrections/wire-probes-after.txt). |
| Equal-time first acquisition, retained old encoding, queued circle/follow-up | **3/3 fail before, 3/3 pass after**; [before](evidence/windows-live-corrections/session-probes-before.txt), [after](evidence/windows-live-corrections/session-probes-after.txt). Only the main-process VM clock is injected; the host/overlay clock remains unchanged. |
| Released bridge via Python and real child pipes, provider replaced | **2/2 pass**; [result](evidence/windows-live-corrections/bridge-after.txt). Main `93491798` shared bridge/contracts/Learning sources match the released `07c9ebd` inputs. |
| Actual hidden Windows Chromium, exact renderer snapshot | **14 pass / 0 fail**; [result](evidence/windows-live-corrections/render/result.json), [source hashes](evidence/windows-live-corrections/render/source-manifest.json), [review](evidence/windows-live-corrections/render/REVIEW-run-02.md). |

The renderer response after resize is y=255.078..288.672 within card
y=135.188..310; all six control centers hit their own elements. Stop reading changes
hush 0→1. Generated screenshots, executed build/main/preload harnesses and foreground
launch logs are in `evidence/windows-live-corrections/render`. The window was never
shown; snapshots capture only that hidden renderer, not the user's desktop.

Inspection failures are retained separately: Node was initially absent from PATH;
the existing runtime was used directly. The test wrapper initially emitted five
file-level results; isolation-none exposed actual named checks. A sliced sampling
fixture needed the new `sessionNow` stub; its failure and focused repair are retained.
The ordinary sandbox bridge run stalled at fake sign-in/Start; normal precise-command
approval reran the same local fake-provider tests successfully. Nonfatal Windows
UNC/cache ACL diagnostics remain in the renderer logs; no renderer errors or network
requests occurred. No permission setting was changed.

The old review workflow's raw `/tmp` outputs did not survive migration. Its retained
source/test changes and 74-case mutation script are preserved; all script patterns
match the current sources. That full mutation campaign was not rerun or counted as
a pass. The two original lead probes and current independent source/renderer review
are the direct evidence for this delivery.

## Remaining gates and next owner

No production voice is connected. The rejected `NativeSpeech.cs` / native adapter
source adoption remains a separate pending decision; nothing was imported, ported,
retyped or executed. Fake reading and `voice.audible` do not establish actual speech.
Live voice input/system audio, physical pen, real display freshness, DPI/multi-monitor,
cross-app interaction, real AI replies, both full desktop gates and Notability import
remain unverified. Very small areas with no usable card room use toolbar priority;
440×320 is the exercised narrow case, not a universal minimum-screen guarantee.

Next: Lead reviews/integrates this exact correction with the already delivered
Windows leaves, retains the separate TTS decision and prepares the distinct versioned
candidate when existing release gates permit. QA keeps its one changed-flow acceptance
and current request allocation; this delivery grants no new display/account/audio
lease, paid experiment, package publication or additional QA budget.
