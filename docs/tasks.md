# Task board

P0 authorized by the user on 2026-09-28 UTC. Product requirements remain intact.
Setup is verified; application capability gates are not yet passed. Lead integrates
all deliveries into main and verifies the resulting commit before reporting success.

GitHub public visibility is intentional and authorized by the user's direct
confirmation. Lead may push reviewed/tested milestones to origin/main without
changing visibility or force-pushing. See `verification/lead/github-visibility-mismatch.md`.

| ID | Owner | State | Deliverable / prerequisite |
| --- | --- | --- | --- |
| SETUP-01 | Lead | Verified | Six role chats/worktrees; see verification/setup.md. |
| SETUP-02 | Lead + web | Verified | Actual legacy and async message replies; no application claims. |
| P0-01 | Lead | Shared foundation integrated; QA-14 hardening verified locally | v0.1 wire schema/generated artifacts remain unchanged. QA-12/13 fixes remain; subsequent QA-14 extreme nesting/error-rendering crash is fixed in both validators and v1 HTTP regressions. Explicit validator byte-pin exception and exact integrated checks are in [capture integration](verification/lead/p0-09-capture-integration.md). Other historical QA-03–11 expected failures remain open. |
| P0-02 | Web / Windows | Reviewed browser component retained; Windows capture/input next | Web 7ee1217/8d67aaa/db7400f integrated as 1da1bc9/93674f1/fa5c03a adds W1c/e/f checks and bounded EO-1 attribution repair. Main: 87 named Web tests, TS and build passed. Owner desktop self-test 54/54 is separate evidence; no iPad/Pencil/course acceptance. [Recovered integration](verification/lead/p0-recovered-deliveries.md). |
| P0-03 | Native (macOS; `ios` alias) + Support | Mobile checkpoint preserved; macOS capture slice next | Original a4841d3 → 26996cd retained; target-26.5 extension integrated through bdfdd58/c77ba3c. Main matrix check: 72 rows, 23 rejected mutations. All 60 device cases remain not_tested. Exact EnvProbe compiled at 01a8adf/run 36525663497; no device acceptance or hardware/mode activation. [Current split](#ipad-delivery-split). |
| P0-04 | Backend | Snapshot export and preview persistence integrated | 1596db6/68274f2 → cc2a1c6/f54e1e2 export authorized original records atomically and reject unexplained missing events. Independent B1 reproduction plus main 136 focused checks and corrected Learning composition pass. Preview wire/API through `2118a0e` now has actual integrated Edge/API/PostgreSQL restart evidence and independent recovery acceptance at `9eb6bd5`. Prior owner DB results remain separately attributed. [Evidence](verification/lead/p0-recovered-deliveries.md). |
| P0-05 | Learning | Observation-window component reviewed and integrated; desktop binding next | 1eff66e/fbeaf65 → 792081f/8852876: main 173 focused checks pass, exact originals and legal gaps/clocks retained. Context b21c8e3 → 52f3f1d reviewed and integrated: 150 focused passes/2 retained capture xfails; original QA omission case promoted with assertions unchanged. Independent QA eaef498 → 5d304f4 confirms demonstrated QA-L05-01 repair and reports QA-L05-02/03; main retest 8 passed/2 strict xfails. 13298e6 → 3e0be6b repairs those two cases with 77 integrated publication/QA passes; 187 originals/ranking stay intact. [Evidence](verification/lead/p0-recovered-deliveries.md). |
| P0-06 | QA | Independent initial report integrated; retest received, new defects open | fac974e merged in b31ffc5; lead self-check at 7367c2c was 109 pass/13 strict xfail. Actual retest 4e0dff9 confirms QA-01/02 and reports QA-12 recursive JSON crash plus QA-13 environment-error classification. 4e0dff9 integrated as 6673a3d; shared/HTTP fixes passed exact-main CI; independent QA 62e5ab9 confirms QA-12/13 on 37456ac (Python 3.14). Its added regression tests await review/integration. Mixed-worktree counts are not exact-main evidence. |
| P0-07 | Lead + owners | Desktop preview runnable; recovery and selection QA passed | `096cac1` → `94bf522`, `75dad5e` → `ff52933`; all three original blockers independently closed. Canonical binding `54063bf` passes 26 focused main tests, TS/build and generated check, plus actual Edge/API/PostgreSQL save/restart/reopen. Independent QA at `9eb6bd5`: 30 PASS / 0 FAIL on lost-response recovery and unsaved-work guards. QA-P07-01 correction `b471bdf` → `6c3c1b6` passed independent 10/10 browser checks with the labeled test double and main module checks; actual real-API changed-path QA `aa63f52` → `fee30bd` passed 23/23 on exact `6c3c1b6`. CI's stale F1 mutation anchor is corrected in `0a9139d` (16 targeted tests pass); normal CI follows publication. [QA report](verification/qa/p0-07-preview-recovery.md), [start/access guide](document-preview.md); provider/iPad/full P1 remain separate. |
| P0-08 | Lead | Native replay correction independently accepted; desktop runtime and consumers next | Earlier 0.1.0–0.2.5 compatibility remains unchanged. Explicit raw handler `61401a1` and stored Learning composition pass 472 main checks plus 34 independent probes. Same-origin composition `6cce5fe` passes 282 affected checks plus five independent probes; [native integration](verification/lead/native-raw-ingress-integration.md) at `81b7e18` passes actual35 native/56 fixture checks, both unsigned SDK builds and exact Swift-output HTTP-to-Learning composition. QA delivery `02a47f7` reports 37 pass / 5 strict xfail; lead reproduces all five Low integrity-classification failures. QA helper correction `239e780` and base evidence integrate locally as `5c357d6`/`4e3b245`, with 42 main `--runxfail` checks passing. Final ancestor correction `69e1298` → `94668c7` is independently approved: main37 repair/17 ancestor/five original/four independent checks pass. Exact release `00f4f0b` is pushed; final QA retest accepted as `handoff_8ce7c067616782573b6e850f42dcf106`; actual QA merge `aa96c12` contains the exact baseline. Both P0 CI36685793026 matrices pass. Actual final QA `87bcc07` / `handoff_373f380b623dd74c4c542cdd72354698` integrates as `d1b82da`: 91 integrated checks pass with no xfails; QA-FINDING-NATIVE-01 closes. Mobile control-consumer checkpoint is retained; desktop runtime bootstrap is lead-owned with the bounded Backend delegation above. [Review](verification/lead/native-qa-delivery-review.md). Default routes/providers remain off; exact native request fixtures, trusted runtime bootstrap and device/provider acceptance remain separate. [Current integration](verification/lead/raw-http-integration.md), [contract release](verification/lead/raw-ingress-release.md). |
| P0-09 | Backend | Trusted local runtime reviewed and integrated; desktop embedding next | Internal `6e41895`/`4f51d78` → `1867e2e`/`97f3116`; raw HTTP `f04b1e3` → `61401a1`, independently reviewed and tested on main. Complete ordered replay shares the actor transaction and rechecks retained originals/current fences; default remains off. Owner PostgreSQL migration/immutability evidence stays separate from MemoryStore/ASGI checks. Same-origin composition `2b0b4e1` → `6cce5fe` is independently approved; 282 affected main checks and five independent probes pass. Actual native/build/fixture-to-HTTP-to-Learning integration passes at `81b7e18`. ONE same-card QA-FINDING-NATIVE-01 correction is accepted as `handoff_67a741415017aa82a2a234c248c45a7a`; actual delivery `d1c3c7a` / `handoff_c41d96958a5c13daef1d40c07e6ec868` integrates locally as `0e6d4a3`: 313 affected main checks and five unchanged QA failure reproductions now pass. The reproduced ancestor omission is closed by actual `69e1298` / `handoff_4f43dfda90a5a8ff881de7b35cae6938` → `94668c7`; unchanged independent probes and focused main controls pass. Source HOLD and QA-FINDING-NATIVE-01 are closed by final independent QA `87bcc07` at `00f4f0b`; integrated main `d1b82da` passes 91 checks. The separate ancestor-record observation remains a documented storage-immutability boundary, not a new assigned repair. Trusted local runtime `e59c288` → `fa30a25` now passes independent lifecycle review and474 focused main checks plus seven integration/probe groups. Actual OS consent, desktop host lifecycle and token protection remain owner obligations; Lead retains the embedding release. [Runtime integration](verification/lead/capture-runtime-integration.md). [Composition](verification/lead/capture-app-integration.md). No duplicate DB campaign. [Archive](verification/lead/raw-archive-integration.md), [HTTP](verification/lead/raw-http-integration.md). |
| P0-10 | Learning | 65-case delivery; versioned reconciliation received, review pending | fb445ed adds 28 to 37 preserved cases. Backend 30dc33d reviewed 65/65 (32 reject, 33 conditionally retain); QA 25c63b6 independently reviewed original 37, finding additional issues and disagreement. 7da2298 preserves original cases and adds versioned reconciliation, 32 old-rule probes and 16 unexecuted INTENT scenarios; review pending. 53300c8 plus 45ce567 adds the reciprocal 13-entry design review and existing-schedule links, with the section locator fixed; no runtime execution. Audio design 3bb5e297 → ec370e7 and normalization 2b2859e → 31b224a are integrated: 24 unchanged planned cases, four acoustic pairs/eight conditions, no human references or measured winner. Actual 7fadd15 read confirmed. Structural probe success is not semantic acceptance; all product execution remains zero. |
| P0-11 | Native (macOS; `ios` alias) | Desktop capture/input next; mobile acceptance deferred | ea39a3d → 690ef9c, e221793 → bdfdd58, 7ba5a15 → c77ba3c. Both main checker profiles pass (72/48 rows; 23/28 rejected mutations); 60 P0-03 / 49 P0-11 device cases remain not_tested. The transient-only storage wording is corrected: durable source keyframes, editable originals and pre-stop queues remain. EnvProbe unsigned compile is separate; ink device/simulator targets compiled at `833a2a6`; Simulator run `36532369377` independently passed 25 checks. Physical-device/provider acceptance remains open. [Current split](#ipad-delivery-split). [Review and actual repair](verification/lead/p0-09-capture-integration.md). |
| P0-12 | Web / Windows | Browser repairs retained; Windows original-screen input next | 7ee1217 → 1da1bc9, 8d67aaa → 93674f1, db7400f → fa5c03a. Independent Astra review reproduced core QA races and before/after contrasts; main 87 named tests/TS/build pass. Only test models/owned fixture behavior: exact intent-ID ACK/remote causal basis, actual export reconciliation and EO-7 attribution remain unresolved; stream control 0.2.1 is not presentation permission. Role-QA retest follows its existing output-repair job. [Evidence](verification/lead/p0-recovered-deliveries.md). |
| P0-13 | QA | Earlier acceptance retained; next Windows candidate dependency | Native evidence `02a47f7` plus helper correction `239e780` integrate as `5c357d6`/`4e3b245`. Final Backend source `00f4f0b` is pushed and accepted for ONE narrow retest by `handoff_8ce7c067616782573b6e850f42dcf106`; actual QA merge `aa96c12` contains the released candidate. Final `87bcc07` / `handoff_373f380b623dd74c4c542cdd72354698` integrates as `d1b82da`; 91 main checks pass with no xfails, closing QA-FINDING-NATIVE-01. No repeated campaign is assigned. [Current review](verification/lead/native-qa-delivery-review.md). bd79ca4 → debbbec retains capture/context findings. eaef498 → 5d304f4 confirms QA-L05-01; QA-L05-02/03 repair 13298e6 → 3e0be6b has 77 main publication/QA passes. Web retest `2f83761` → `af4c47f` retains EO-1 shadow activation, revision reset and organize gaps (2 passed / 3 strict xfailed). Actual preview recovery `c0036bc` → `1185997` at `9eb6bd5`: 30 PASS / 0 FAIL, QA-P07-01 is closed for the tested Edge mouse path by `aa63f52` → `fee30bd` (23 PASS / 0 FAIL); CI harness anchor `ac6b3fe` → `0a9139d` has 16 main targeted passes. Native QA `ca705b9` → `29e5409`: 25 PASS / 0 FAIL / 3 device-only NOT_RUN. Actual local DB and Simulator evidence do not claim physical-device/provider or G6/G7/P1 acceptance. [Evidence](verification/lead/p0-recovered-deliveries.md). |

## Current executable continuation — complete Windows and macOS product first (2026-09-30 UTC)

Apply the [current desktop-first decision](requirements/intent-and-decisions.md#desktop-first).
Windows and macOS each retain the complete R01–R60/A01–A49/G1–G7 product, including
all applicable P1–P4 backlog below; P0, minimal P1 and the owned-document preview
are intermediate slices. Native iPad/phone work is deferred, preserved and not
silently counted as a desktop pass. Sidecar is a later optional Mac-app candidate,
not a desktop prerequisite or a native-iPad overlay.

### One next bounded outcome per owner

This table supersedes the earlier platform scheduling recorded below. It reuses
existing cards and seven roles, with no runtime/model/effort/permission changes.
Lead releases the exact decision commit in native handoffs; delivery/start receipts
are recorded in [transition evidence](verification/lead/desktop-priority-transition.md).

| Existing owner / cards | Current bounded implementation / paths | Acceptance and next owner |
| --- | --- | --- |
| Web / P0-02/07/12 → P1-02/P2-03 | Windows original-display entry in `apps/windows/**`: explicit display selection and Start, ongoing actual pixels while navigating original apps, clear freshness/gaps and Stop; reusable native overlay with deliberate NAV/WRITE/ASK and a short durable editable-ink loop. Root delegates only this app's package/lock, Electron 44.5.1 and existing TypeScript 7.0.2 if needed. No import/library prerequisite or page-content authority. | R02/R03/R08/R35/R36/R46/R51/R52/R59; A12/A14/A26/A27/A30/A31/A44 and both §7.1 gates remain open. First capture/input candidate is explicitly not AI-connected. Lead reviews exact source, QA tests actual Windows changed workflow. |
| Native (`ios` alias) / P0-03/11 → P1-02/P2-03 | Checkpoint is received: clean `4cc605a`, no control-client code, reusable native control specification and existing upload/retention pieces retained. Next implement `apps/macos/CompanionDesktop/**`: SwiftUI/AppKit + ScreenCaptureKit explicit display Start/Stop, actual callback frames with source/time/gaps, permission errors and source operability. | Same capture gates as Windows, separately evidenced. First unsigned runnable Mac capture slice precedes original-screen overlay ink, both anchors and real AI. Lead/Support compile reviewed exact source; interactive Mac permission/capture/input/audio remains unverified. No further mobile-only campaign. |
| Backend / P0-04/09 with explicit lead delegation of P0-08 runtime boundary | Delivered `e59c288` / `handoff_14d066f2a0d68f7e51d1eac39f465c25`, independently approved and integrated as `fa30a25`: trusted local callable reuses store/auth/control/capture, requires explicit identity/token/expiry/consent and preserves exact replay/Stop/revocation. Main474 checks and seven probe/integration groups pass; actual original upload → Learning window is verified with synthetic inputs. [Evidence](verification/lead/capture-runtime-integration.md). | R07/R27/R35/R36/R51/R52; A12/A14/A16/A30/A31. Ready for exact baseline release to existing desktop owners; no public provisioning/login or actual OS consent is implied. Desktop raw metadata compatibility remains Lead-owned; retain actual provider/device gates and owner PostgreSQL evidence separately. |
| Learning / P0-05/10 | Actual delivery `a7ffa7d` is locally integrated as `612a6b9`: callable observation-window preparation reuses authorized stored readers/materializers, retains the complete selected metadata, original-image gaps and byte/source/clock comparisons without inventing chronology/meaning. Main 288 affected checks pass; independent review approves with 32 new tests and three extra boundary probes. Three preserved independent probes also pass on main; published baseline `1ece33c` is verified on origin/main. [Integration](verification/lead/observation-window-integration.md). | R03/R51/R52/R54/R55/R57; A30/A31/A35/A37/A38. No semantic/mental-state inference from hashes, no second archive, no provider call or disclosure authorization. Existing originals and final current-access checks preserved. Lead review is complete; platform/provider integration awaits reviewed actual desktop metadata and client binding to the now-reviewed trusted runtime. |
| Support / existing SUP-01 supporting P0-07 | Delivered build preparation `bb56a08` is held for two reproduced provenance fixes: dirty reused sibling input must be checked/archived, and ignored local files must not enter distributions. One same-task correction accepted as `handoff_e03dd4386aa490a12541d2b4fbc3debd`; receipt alone is not implementation. Same delegated workflow/script and support probes/evidence, no app edits. [Review](verification/lead/desktop-build-review.md). | Actual corrected delivery then Lead review, exact Windows/macOS owner source/resource contracts, one coherent hosted build. Nine orchestration tests are stub-tool evidence, not native builds. No purchase/signing/new accounts or mobile builds; interactive Mac remains a separate dependency. |
| QA / P0-13 | One conditional next independent pass on the released Windows original-display capture/input candidate; preserve all earlier accepted native/browser checks. Validate actual original native app changes, whole-display scope, Stop/stale states and the implemented editable-input loop on exact SHA. | Author checks are not independent QA. Do not start before a runnable candidate; missing real provider keeps core Gate 1 open. macOS gets its own actual-runtime pass only when a usable interactive Mac exists. |
| Lead / P0-07/08 | Integrate this decision, inspect/release app dependency and raw-metadata compatibility boundaries, then review and integrate the desktop/shared deliveries with focused checks. | No silent reuse of ReplayKit-specific metadata for desktop. Release an explicit additive mapping if needed, preserve v0.1.0 and existing families. Next owner/action stays recorded through each milestone. |

**External dependencies:** the actual product vision/audio connector is disabled;
no paid provider is selected/activated. A usable interactive Mac is unconfirmed:
minimum later validation is an authorized Mac session on the supported OS where
screen/microphone permission UI, original-app capture/ink/audio and Stop can be
exercised. Hosted builds are not that evidence. Mobile signing/device access is
now deferred, not a blocker for desktop code. No hardware/cloud purchase is assumed.

Actual dispatch baseline is `07e669154e6eae9944368c210c3f1f3d309aa258` (canonical
content `d2603fd`). All six native sends were accepted. Native and Learning sent
actual start replies after normal merges `a08f7ff` / `59521d2`; Backend normal
merge `9fac156` is observed. QA confirms adoption `f78e2d2` and waits for the
runnable Windows candidate without rerunning old suites. Windows later confirms actual start/read-only adoption at `07e6691` while
preserving `d99a3c6`; Backend confirms runtime implementation start. Support's
actual `handoff_a887d4ef2ee24edb5358948d2f0c8525` confirms read-only adoption and
desktop runner implementation start; exact Windows/macOS package commits remain
its named build dependencies. Detailed IDs and timestamps are in the transition evidence. Native
`apps/macos/` source creation is observed after its start, still unreviewed.

### Core acceptance retained; earlier implementation evidence


The ONE core acceptance is [requirements §7.1](requirements.md#71-首次设置与每天使用),
using existing R02/R03/R06–08/R35/R36/R46/R51/R52/R59 and A03/A12/A14/A16/A26–31/A41/A44/G3/G7.
No new requirement IDs or competing history record is introduced. First confirm
necessary sharing, then remain on the original learning screen without file import
or repeated manual selection. **Gate 1:** fresh whole-visible-display pixels reach
real AI over supported app/page/video/handwriting/camera-preview changes with
source/time and explicit gaps. **Gate 2:** original-screen cross-app region selector
and pen reach the same AI context. Browser fullscreen/DOM/owned canvas is neither.
Execute NAV → explicit WRITE → draft → partial erase → undo/redo → ASK → finish/cancel
restores WRITE → continue → save/reopen/edit original strokes. Content-following
and screen-fixed placement remain independent; purpose/Notability/audio/answer
organization and disclosure obligations are unchanged. Capturing one region or
showing screenshots locally is an intermediate dependency, not the usable core.

Current actual Windows preview `5218096` accepts only pen events in WRITE and has
no delivered eraser/undo/redo/durable editable ink; its textarea is not handwriting.
Do not tell the user mouse handwriting already works. Do not replace/restart the
running user preview until a tested replacement is explicitly identified.

| Owner / existing card | One current action, next dependency and actual evidence |
| --- | --- |
| Lead / P0-07/08 | Integrate active source at safe checkpoints, maintain additive contract compatibility and release exact candidates for one behavior-based QA pass. Native packaging `738866f` → `0faa253` pushed, 11 main guard checks passed. Safari workflow `b7ed163` → `ba622b3` reviewed/integrated locally (7 main logic checks); first actual Safari build `36570494322` now used real Web resources and failed on case-mismatched app/extension bundle IDs; iOS delivered correction `d5fb0b0` → `9cdf115`; independent review and 17 main stub guards passed. Exact `d553e5b` hosted Safari run `36572647629` now passes both unsigned SDK builds; P0 matrix `36572647582` also passes. Reviewed additive original-byte validators `4626833` published through `e5bb658` (19 focused checks/typecheck); independent review approved. Resolver `f9f34d9` → `efc362a` and pure exact frame/original binding are published at `0ef6c97931c15b3f4d03ca1ccf4efc414d97df65`; main 78 resolver + 35 binding checks passed with independent reviews. Known-source atomic ingress `edc562b` + AF1 correction `d325e9a` is integrated as `dadd023`/`503871d`; 288 focused main checks pass. Additive shared-display source 0.2.3 and Backend adoption are reviewed/integrated through `2ccf5b9`; exact-main CI `36578997235` passes both matrices. Supplied process/image composition and its cancellation correction are integrated as `0f90833`/`4a30b9d` (140 main checks). Reviewed opt-in control HTTP `1b6a94d` has 176 focused main passes. Additive capture-ingress 0.2.4 is released at `46042429f9e5d714359484d0203aa7cc999073b3`: 79 contract/binding checks, generated check and root TypeScript passed; unchanged earlier contracts. Backend opt-in HTTP delivery `0124195` plus correction `c754fc0` now integrates as `c128344`/`6321d0c` after independent review; 572 focused main checks and synthetic HTTP-to-Learning composition pass. The default app remains unmounted. The focused real `lc_p0_test` HTTP/API-process-restart check is delivered and integrated with cleanup correction; see the Backend row below for the exact evidence. Reviewed Web ink/capture corrections integrate through `3ea7c9d`; 16 main test-file groups, typecheck/build and bundles/icons pass. QA has delivered the exact `1616cce` component pass; its one resulting capture/ink-recovery repair is now reviewed and integrated as `3596124`/`72ecee4`, ready for the focused QA release. Lead has integrated the stored-context consumer and cancellation correction (`65fa1a2`, published `8e2ee58`, 190 focused main passes); iOS original-byte base plus witness corrections are integrated and actual hosted run `36664026247` at `3745c41` passed 99 native / 42 actual-fixture / 15 retention assertions plus both unsigned SDK builds. Pure raw time/orientation metadata 0.2.5 is now released at `3ee3201`; current consumer assignments are in the active adoption table below. Trusted bootstrap and explicit transport remain lead dependencies. Lead integrates actual corrected deliveries at safe boundaries. [Ingress release](verification/lead/capture-ingress-release.md), [Web integration](verification/lead/web-ink-integration.md). No default route, provider activation or new framework. |
| Web / P0-02/07/12 | Capture `fb4450f` + `f934855` + `c6e6cfc` integrated as `ade5717`/`14e2acf`/`bab7ca8` after independent correction review; main 121 named module cases/typecheck/build and bundle/icons passed. Original final-decode/page, Stop/timeout-before-dispatch and active-tab ABA defects are corrected; [review](verification/lead/web-extension-entry-review.md). Correction sent `handoff_a99190076d395d79e1f4f7d5088a36a3`, then the SAME next ink repair `handoff_7c4b5640ff06cacfe736086c704defef`: intentional mouse WRITE, partial eraser, undo/redo, ASK-return, durable original editing and both anchors. Actual ink start `handoff_3012d75706ffcd52054a38b829eece47`; local format constrained by `handoff_989c280bb23c5fccd3b15c7c2e3001dc` to avoid query/fragment or same-URL content misbinding. Independent QA `fcc41b8` at exact `b8ec18e` is NOT ACCEPTED (31/38): QA-EXT-01 scroll away/back and QA-EXT-02 layout movement can show the wrong crop as known. One next correction `handoff_78bd43e7383ed5db767cc417df83ad10` follows the safe ink checkpoint; actual `handoff_2ae943e03e4185903d7b2e333410d59b` delivers ink `366a994` and confirms capture correction has started. The first ink candidate was held for four reproduced defects: changed screen-fixed context, content change during a stroke, erase-undo stacking order, and unreadable durable-document overwrite. [Input review](verification/lead/web-ink-delivery-review.md) and [storage review](verification/lead/web-ink-storage-review.md); corrections sent as `handoff_5d68127324ff5a375b0e9fb7eeb482af` / `handoff_3f632c34c0b2a7717d4e91fabe7f8254` within the existing task. Actual `handoff_9fc6e287a2d73ff7278e31cae049b033` delivers combined repair `30ff273` (parent `366a994`) for these four defects and QA-EXT-01/02; [Independent correction review](verification/lead/web-correction-review.md) closes the original four reproductions and passes 14 controlled capture groups; its narrower off-screen-source INK-A1 finding was corrected by `c88b5f2`, delivered in `handoff_27ed45f1057401e9cc777965e31522a9`. Final review approves after the exact reproduction, seven layer tests and six independent controls. Base/corrections integrate as `c484a42`/`e1669df`/`3ea7c9d`; main module checks pass. Independent QA delivery `efa7900` → `e2688bb` / `handoff_8be950df59531457809e143621692b75` at exact `1616cce` now reports 35/35 ink and 42/44 capture checks: original QA-EXT-01/02 close, but open-shadow movement QA-EXT-03 remains. Lead also identifies refused-tab ink lost on reload as a R46/A27/§7.2 retention defect; a warning alone does not satisfy automatic local saving. ONE same-card repair is accepted as `handoff_501d9d49635ef47ec37bcf573db2cd85` at main `35cfa94` (identical Web source): correct open-shadow capture confidence and retain recoverable editable conflict/corruption-path originals without overwriting existing records. Actual start `handoff_c1ba1077fd8e6b0341b4222c42184bba` at17:30:04 UTC confirms the affected source matches the baseline, report/clauses read and one local capture/recovery implementation. Actual delivery `handoff_fc1d270731e4e98407fd1cb04cb56742` / `32b7768` is now received. The quota-interrupted bounded review resumed by explicit user request. Capture passed 18 independent controlled groups, but the initial `32b7768` review held integration for IR1 (main/copy becomes unreadable after load, ended strokes not durably forked) and IR2 (extra copy kind creates acknowledged unreadable storage). ONE same-task correction was accepted as `handoff_353977da7958c4d41b8c39fa086fe0e5`; actual delivery `handoff_76c291882f08f9fdb3187ee09588614a` now supplies `78f3ba8` on `32b7768`. Independent correction review now approves IR1/IR2 after eight controlled composition probes. Base/correction integrate as `3596124`/`72ecee4`; main 16 test-file groups, module/root typechecks, build and generated-resource check pass. Owner 173 module / 29 ink results stay separate. Exact candidate `ae585e084b4a4292f0ec2d6baaeaac1eabc3f040` is pushed and released to the existing QA task by accepted `handoff_82a7f93ad2e5bde5171c584c5ed47116`; actual start `handoff_2c461afba84c3b327cd02b186ab294c6` at 2026-09-30 03:56:16 UTC confirms normal merge `b41508d` and reports 93/93 exact-source files plus build/resource prechecks. Actual QA delivery `eb0ab45` in `handoff_1dfd277d4c2ab91ced4ef396d01a889d` closes QA-EXT-03 for tested open/inspectable closed roots and passes 20/20 recovery/Export behaviors. It reports QA-EXT-05 (uninspectable closed DIV moves silently) and QA-EXT-04 (false closed-component note). ONE Web correction accepted as `handoff_40100ca466803e4ec4ef97307d0df1ea`; independent QA retains just N6/N7a/N7b with N4/N5 for the corrected candidate. The exact evidence/harness audit approves and integrates `eb0ab45` as `ed09b14`:37 recomputed artifacts match,93 source files verified. Web actual `d99a3c6` / `handoff_9b72057b98495f47ae5ced79b944660e` is independently approved (12 source controls) and integrates as `46565ca`; main163 module tests, typecheck/build/generated checks pass. Exact published candidate `dce0940e04ec620be637310d7b786cc5e4ee99a4` was released for N6/N7a/N7b + N4/N5 by accepted `handoff_409ca620a5447313c05b5e4a15f7ed86` (initially unread). Actual QA delivery `bf1bb1e` / `handoff_7e237e7b0ffba2c9ea8c9bd79b34e009` integrates as `eb75882`: nine behavior/four integrity passes, two disclosed limits, two informational results. QA-EXT-04 closes; QA-EXT-05 remains `limit_disclosed`, not alignment acceptance. Lead recomputes all23 artifacts and verifies93 source/seven loaded files; no browser campaign replay. P0 CI36671239147 and both unsigned Safari SDK builds in36671239245 pass. Missing-introspection warning is a disclosed limit, not geometry acceptance. [QA integration](verification/lead/web-recovery-qa-integration.md). Real Safari/device/provider remain untested. [Retention review](verification/lead/web-ink-recovery-review.md). Owner 167 module / 32 capture / 28 ink assertions remain separate from independent acceptance. Lead reviews/integrates, then QA retests only changed paths and relevant controls; neither core gate passes. No duplicate library task. |
| iOS / P0-03/11/07 | ReplayKit `46ee9c5` + PNG `a6f2ae7` + repair `8f7e5df` integrated as `2739048`/`a27e56a`/`ac1f48f` after independent review of retention/attempt and pixel-layout repairs; [review](verification/lead/screen-observer-review.md). Correction sent `handoff_3a4105240ecd4562d77a5bc32abc2588`; no full converter or original deletion. Exact `98ee104` hosted run `36568288679` passed both unsigned SDK26.5 builds and 15 native buffer/file checks (zero skips). No actual device/broadcast/provider pass; attempt-throttle and cleanup-failure runtime remain untested. Safari repair delivery `handoff_2a314b594b6f2add601305cbc50e2059` (`d5fb0b0` → `9cdf115`) corrects the case-mismatched IDs and failed resource lookup. Independent review and 17 main stub guards pass; actual `d553e5b` hosted run `36572647629` succeeds for both unsigned SDKs, with all 14 archive hashes and actual app/extension plist IDs checked. The released 0.2.4 baseline now unblocks the one bounded native PNG upload/receipt and durable retry consumer at exact `1616cce`, accepted as `handoff_1fe2aea7429ea6838ad2a0d00395f772`; actual start `handoff_3cc5ee1a482d23a2825a30db0c495e36` confirms merge `146ccaf`, full affected-clause/wire reads and app-target-only implementation; actual delivery `handoff_48dc2918c9a40153f38dc6a65b9ac7e3` / `7de89a6` is received, explicitly uncompiled. The original four source-traced state/Stop/token-log corrections were returned through `handoff_063a7e1579386fc6d5ab50916ca781de` and `handoff_255274a5dea2404ee450cdd269a1e4d0`. Actual correction `handoff_e874e76b2858aa3dc6970df18c73202d` / `cb27688` closes those traces, but remains HOLD for one missing durable-initialization witness: a stale or newly reopened instance may recreate a lost queue and forget its saved Stop. The narrow same-task correction now has actual delivery `handoff_2d99cfd05b7c6a849d3a676e94912a28` / `94c5872`; the durable initialization witness and lost-state regressions are independently approved. Base plus corrections integrate as `6b55d3a`/`1fbdbf7`/`b3dde7f`, with the held workflow released at `3745c41`. Actual native run `36664026247` passed 99 native upload, 42 Swift-fixture/Python and 15 existing retention assertions; both unsigned SDK builds succeeded. Independent artifact review verifies 12 hashes and all 86 exact-source files. Owner actual-log reply `handoff_0c09fa96e0ce165ed1e09aba07b6b764` confirms no source change/rerun and supplies evidence-only `2d38189` → `24d65ed`. Counts are now executed hosted evidence, not device/network/provider acceptance. Lead owns the next exact native time/orientation/stream bootstrap mapping; iOS awaits that bounded consumer baseline. [Review/checkpoint](verification/lead/native-ingress-integration.md). This uses explicit supplied source/current authorization, preserves stopped queues and raw orientation/clock sidecars, and does not activate ReplayKit sending. Full frame/process mapping, trusted bootstrap and signing/install remain named dependencies; native page/Safari/device behavior remains untested. Successful ScreenObserver source remains intact. Signing/App Group/device/actual producer ingress remain separate. Capture-only does not pass either core gate. |
| Support / SUP-IOS-01 | Public-SDK overlay check completed (`handoff_b2b756d4aeaecdc0404c74a5135536a6`): no supported arbitrary-native-app interactive selector/Pencil overlay, signing is not an unlock. One next bounded build task sent `handoff_587fbe6d026518ba4e48e772cef5ef91`: explicitly delegated `.github/workflows/ios-screen-observer.yml` plus owned evidence/probes; build both unsigned SDKs from actual corrected ScreenObserver source, retain logs/products, no Simulator campaign. Actual delivery `handoff_7f407ddae99d1c7526007455c0f7b9be`: `3d26f72` → `0218f10`, independently reviewed. Actual first exact-source run `36568288679` passed; returned results `handoff_73212c61ad9792660039c99bfe3e74bb`. No duplicate build; support idle until a concrete incident. No further broad platform research. |
| Backend / P0-04/09 | Typed original-artifact `ce45657` → `3b6ff17` is independently approved and integrated; main 164 focused checks passed. Actual delivery `handoff_7cd872611403dfa6c13ba2d3298c8bc2`. Reuses existing actor store/transactions, exact source/version, current authorization, immutable bytes, typed reference and tombstone fences; owner 479 checks plus narrow real `lc_p0_test` runner are separately attributed. No HTTP, second store or artifact-gate activation. Resolver delivery `handoff_722aa787d3ca009b9c31c3be71b706e1` (`f9f34d9` → `efc362a`) is reviewed/integrated with 78 main passes; [evidence](verification/lead/capture-frame-binding.md). Atomic ingress delivery `handoff_cc1fbd91f8fbea6e60ffd49c936bcc6b` plus correction `handoff_5ba48e0d5bdaf71a52d6f659c157480e` (`edc562b`/`d325e9a` → `dadd023`/`503871d`) is integrated after independent AF1 refusal probes and 17 correction checks; main 288 focused checks pass. Existing control authority, typed originals and default gates remain. Next: explicitly adopt released 0.2.3 shared-display sources in the same store/internal ingress, without fabricated URLs/Observations or HTTP activation; released `91a8085` continuation `handoff_2617deabb08a2a32ee557d34be985e6b` has actual delivery `handoff_6c70faa3381e3b7b34373b93e2238b90` / `a659364` → `a9f3773` integrated after independent authority review (30 cases and nine probes); main 352 display/original/ingress/image checks pass. The 304 legacy passes are isolated-candidate evidence. The reproduced legacy-job gap is fixed by delivered `a72c93d` → `9ec9feb`: main 79 checks and original 409/no-write probe pass; no executor runs. [Adoption review](verification/lead/display-source-adoption.md). Next opt-in transport for the three released 0.2.1 control endpoints was dispatched as `handoff_dd5bcb876213b1f64547d2647e60db91`; actual start `handoff_48892112d6184682baed89552260dc5e` confirms merge of exact `2ccf5b9` as `8b5cfc3`. Separate factory and synthetic in-process HTTP checks only; no default route, producer grant, listener or executor activation. Actual delivery `handoff_c86aae1fdd024531c13557aaf746e402` / `654564c` passed [independent auth/transport review](verification/lead/control-http-review.md), integrates as `1b6a94d`, and passes 176 main control/HTTP/v1 tests. The one next ingress consumer at exact `4604242` was accepted as `handoff_3f6b29b449638555dbca45c430668140`; actual start `handoff_0c572b060d01f5b51e4b6ac406e7ebac` confirms the normal baseline merge and implementation of five opt-in 0.2.4 ASGI operations. Actual delivery `handoff_2ee6149893341f5eec19f30e68aafbda` / `0124195` and correction `handoff_9f4401b5f11a602bfb9bede50f1a8224` / `c754fc0` integrate as `c128344`/`6321d0c`. Both original pending-ACK and sparse-version findings passed independent targeted retest; 572 focused main checks and synthetic HTTP-to-Learning composition pass. The historical HOLD is resolved. Next same-card action: one real `lc_p0_test` new-ingress HTTP save, owned API process restart, exact source/version/original/ACK readback and retry/auth/Stop checks. Only the unique test actor and ephemeral loopback child are in scope; no DB restart, user-preview DB/service, provider or duplicate full DB campaign. Exact release `ddcae31daca6f31d12a063c31526eebaca4c5b39` is pushed; next task `handoff_3d8e5e2002879ab6d8dc2094072e80bf` has actual start `handoff_513f9a7980d0bdd6cf780ad706abdde9` (2026-09-29 16:48:39 UTC): Backend reports normal merge `86c2e9e`, a clean starting tree, the existing dedicated-DB handoff and reuse of supervised loopback/isolation helpers. Actual delivery `handoff_1254c2b4d3aebfcc4587ddf87a1ebd61` / `3a543b0` reports27 real HTTP responses and exact originals/ACK across two API processes. Corrective delivery `handoff_6e585ea89722f92e6c5b051744408c5c` / `806edbe8` closes the reproduced interrupted-wait/cleanup defect after independent targeted review. Base+fix integrate as `2c02f8c`/`3debf1c`; 139 focused main checks and the exact no-cleanup refusal probe pass. Backend separately reports the final27-response real-DB/API restart run; no lead DB or device/provider acceptance is inferred. Process-context reader `4b5b768` plus historical binding repair `9e40baa` are independently reviewed and integrated as `c607c58`/`5360b42`; nine independent correction probes and209 focused main checks pass. Learning delivered the bounded read/compose/recheck consumer. Its actual finding `handoff_bdf94299ea830e3713e903e15ad6fb24` identifies standard Future cancellation swallowed by both Backend adapters; ONE narrow repair accepted as `handoff_cf11967a910cbf9141c9131bfadd843b` preserves cancellation while retaining ordinary sanitized failures. Actual start `handoff_8e841d557f8bc336db125d007a8986d1` at18:00:02 UTC confirms a clean owner tree, exact affected files matching `f022165`, and guard/transaction regression work. [Independent reproduction](verification/lead/backend-context-cancellation-review.md): eight cancellation failures and seven passing ordinary-error controls were retained. Actual correction `09669d6` → `dcc6039` now passes the same 15 independent probes; combined main `65fa1a2` passes 190 adapter/consumer checks. This narrow correction is closed. No duplicate reader or new provider work. [Reader integration](verification/lead/process-context-reader-integration.md). See the P0-09 card below; no new wire/archive. [Restart review/checkpoint](verification/lead/ingress-postgres-integration.md). [Ingress review](verification/lead/ingress-http-integration.md). Full ordered-envelope replay and current trusted guards share the existing transaction; no default mount, new identity/archive, listener or paid provider. [Release evidence](verification/lead/display-source-release.md). Prior library `40aac5c` → `fe1a209` preserved. |
| Learning / P0-05/10 | `afd59a8` → `e410f7a` integrates bounded PNG byte materialization after independent review; all 66 new cases passed on main. Delivery `handoff_d8c71fac410672a3ce2bc550e5cc3056` preserves exact frame/source/time/history and unavailable/current-state gaps. No provider or fake AI receipt. Backend's current-byte resolver is now integrated (`efc362a`). Known-source atomic frame/process ingress is integrated as `503871d`. Next bounded consumer is process/frame evidence composition over explicit supplied released records and current byte resolution, without requiring text retrieval; production atomic export and shared-display service adoption remain Backend dependencies. Continuation `handoff_006b402eac75778c1d942c7bbd67c369` has actual start `handoff_23d3312b98a07e7da915cc50e6a3bc41`: owner read corrected exact `e50e95d` and normally merged it as `eaa6821`; supplied-batch process/image composition delivered as `6ebbeae` in `handoff_57a9c78778110aae883d4c6661ce4b13`. Lead production-callable composition with Backend passed exact original PNG, historical Stop and current-revocation checks using synthetic MemoryStore facts. [Independent review](verification/lead/process-context-delivery-review.md) found synchronous Future cancellation swallowed; correction `6602500` arrived in `handoff_2d28cd06d7784542ff275a59f8e288d1`. Delivery + repair integrate as `0f90833`/`4a30b9d`; 140 focused main tests and the original cancellation/Backend composition probes pass. Coherent metadata reader `c607c58`/`5360b42` is now integrated and209 focused checks pass. The P0-05/10 consumer below is now integrated as `65fa1a2` with cancellation correction `dcc6039`; 190 focused main checks pass. It reads explicit IDs, composes through the existing byte resolver and rechecks all selected metadata before returning; it is not live/provider or presentation authority. The legacy exporter remains separate and does not export process records. No second archive or invented legacy observation. Provider/device evidence remains separate. |
| QA / P0-13/07 | Existing plan amended in place by `handoff_be4b27cf7ddc42cfd8399ce556034f6e`: two evidence gates and full input/edit/save loop, one integrated behavior pass once real dependencies exist. Prior `5eb825b` → `117f8c8` Edge action/capture probe is capability-only. Exact pushed `b8ec18e` released through `handoff_cf720e444dd9b5b8f7fe476fd347776e` for the existing independent component pass. Actual delivery `handoff_6f25d1c28aa69146a288fdffedf46f11` / `fcc41b8` → `bd01e51` reports 31/38 passed and 7 checks failed across QA-EXT-01/02. That original candidate remains NOT ACCEPTED. Corrected Web source is independently reviewed and integrated through `3ea7c9d`, with main module checks passed; Exact `1616cceb1a1fe21a4444919c07477faf749f71c1` was pushed and accepted for the one combined capture+ink pass as `handoff_9be075fa70c023d3969e705825a2334f`; actual QA start `handoff_5d5d68b76f52e496f755a6598d3fe05d` confirms merge `2e4486d`, exact 92/92 source files, type/build checks and the one isolated real Edge run in preparation; actual delivery `efa7900` now records 35/35 ink and 42/44 capture checks with QA-EXT-03 open. Lead retains the exact passed assertions but does not infer conflict/reload durability from them. Web repair `32b7768`/`78f3ba8` is independently approved and integrated as `3596124`/`72ecee4`, with main module checks passing. QA conditional next action `handoff_feff23b156b608c532b216636a48307f` is now ready for the exact release: focused open-shadow and recoverable-originals checks, plus actual Export completion/Export→Stop (including the shared cleanup deadline), preserving prior passing assertions. No immediate repeat campaign. The unrelated stale F1 test locator found by normal CI is a bounded lead-owned correction, coordinated in `handoff_38ea1698aa3b57a3c5f2dc7dcfdad8e7`, without changing the product candidate. Real AI/device/cross-app acceptance remains unverified. QA plan `eee42a8`/`c2eeb87` integrated as `b1d9914`/`4b95210`, preserving independent R49 teaching and actual provider-input evidence without invented vendor hashes. No old recovery/reselection/Simulator campaigns replayed. |

### Released raw-frame metadata and consumer continuation — existing P0-08 / P0-09–11

Backend delivered the ONE additive `capture_frame` **0.2.5 metadata contract**,
reviewed/integrated as `09855ce`; this is not a released transport: closed
raw-frame descriptor, generated structural types/schema and a pure exact binding
check against supplied ProcessBatch, DisplaySourceSnapshot and OriginalArtifactBinding.
[Concrete code boundary](verification/lead/native-frame-mapping-boundary.md) traces
why legacy Frame cannot honestly encode this producer. No new architecture/store.

- Outcome: native unknown pixel-capture UTC, separately labeled callback-wall
  estimate/unknown uncertainty, sample PTS and raw unapplied orientation survive
  validation without invented course time, upright pixels or a legacy Observation.
- Explicit temporary shared-file write scope: `packages/contracts/capture_frame/**`
  and `packages/contracts/tests/test_capture_frame.py`; Backend may also write
  its owned `docs/verification/backend`. No other shared/root/consumer edits.
  Lead owns final field/version decisions, compatibility, integration and release.
- Reuse current primitives. Keep capture UTC and course media position null in this
  native-only slice; finite sample PTS is distinct from media position. Preserve
  buffer sequence separately from process sequencing; all eight CG orientation
  values (including mirrors) and unknown remain distinguishable, unapplied.
- Bind exact source/version/owner/device/session/stream, record frame identity and
  complete PNG original reference. Do not claim stored bytes, decoded geometry,
  live authority, freshness, provider input or presentation permission from metadata.
- Acceptance: focused positive/negative/unknown, cross-binding and mutation-safety
  cases, generated consistency and unchanged released 0.1.0–0.2.4 compatibility.
  Existing 0.2.4 readers must still reject this new descriptor. No endpoint, producer,
  migration, account, provider, dependency or activation changes.
- Exact baseline `f4575b9d74f2a16e0276131bb9e130cc87ff9416` was sent through the
  granted Backend route as `handoff_e0e2ea4f797fb4c180d8e09631b6b1f0`, accepted
  initially unread with `execution_started:false`. Actual start reply
  `handoff_7a8891fab6dcd188a87a50d77e4dcc06` at 2026-09-30 03:52:24 UTC confirms
  the full clause/delegation read and normal merge `5ca0c9859c453030cb93becff669902c39145bcd`;
  its Git parents independently contain the assigned baseline. Implementation is
  delivered as `369ff8d` in actual reply `handoff_4a3db8a4329cd40b8d3c3bdde324683e`.
  Independent exact-source review passed 138 tests plus 24 separate probes; lead
  integrated the approved source and passed 148 focused main checks, generation,
  root TypeScript and shell/diff checks. [Release evidence](verification/lead/native-ingress-integration.md#raw-frame-metadata-release-and-next-executable-adoption).
  This closes only the pure metadata delegation. QA continues its one already
  released browser task independently; no core gate or consumer is passed.

#### Historical adoption after the pure metadata release — evidence retained

Exact reviewed/pushed baseline **`3ee3201b845a457556ba111b4a4f7719db7fd1b0`**.
These are continuations of the same cards, not duplicate tasks. Each uses the
current complete source/English clauses and preserves both core acceptance gates.

| Owner / one bounded outcome | Scope and dependency | Actual native dispatch / state |
| --- | --- | --- |
| iOS P0-03/11: saved native keyframe → exact raw descriptor | `apps/ios/**`, platform evidence. Reuse saved keyframe/status and explicit trusted source/stream/clock/frame/binding inputs; retain all raw bytes/orientation/time unknowns. Add meaningful native mapper checks and Swift-emitted fixtures. No network/bootstrap/UI activation or process-sequence invention. Lead reviews then runs the existing exact-source hosted check/build route. | `handoff_0eacc947a0d86439b93891041abd0219` accepted; actual start `handoff_ea677c0eac12c571c0cf98ce15a4219c` (04:12:27 UTC) confirms merge `355e009`, independently verified tree-equal to the release. Actual delivery `6a33b87` in `handoff_7cbb9489c6ecdb3d95a9299cfc6f8b04` is independently source-reviewed and integrates as `fe5feac`. Exact `2a5e6bc` hosted run36670348178 now passes40 native mapper/104 actual Swift-fixture assertions plus prior99/42/15 and both unsigned SDK26.5 builds. Independent15-hash/102-source artifact audit passes. Next existing-card native0.2.6 sample request/retry/ACK consumer accepted as `handoff_63bc0c142d28c594c19f5d6fafe8d405`; no app/producer activation or device claim. Actual start `handoff_ac8329fbc228fdfe37c5190163df5155` at04:58:06 UTC confirms full wire/affected-clause reads and normal merge `77a33bb`, independently verified tree-equal to exact baseline `2a5e6bc`. Actual delivery `e52de76` / `handoff_26df292974721646503721ce4d0814ef` and correction `b86e614` / `handoff_81591e31985a07388af7d0a7cfa68adf` have bounded retests. Queue-loss admission, error/timestamp handling and exact PUT/PNG fixtures are source-corrected. Final correction `c874f98` / `handoff_f9f7e93ace7ff3cbd5e540c88d0f9a5b` closes saved-ACK correspondence after bounded independent retest. Base/fixes integrate as `368efd0`/`6ae5fda`/`fa773a8`; exact `81b7e18` run36677566096 passes35 native/56 actual-fixture checks plus prior15/99/42/40/104 and both unsigned SDK26.5 builds. Actual unchanged live/historical fixture HTTP-to-Learning composition passes. [Executed evidence](verification/lead/native-raw-ingress-integration.md). Independent QA is assigned; bootstrap/device/provider remain open. [Review and next action](verification/lead/native-raw-ingress-review.md); [prior mapper integration](verification/lead/raw-native-mapper-integration.md). |
| Learning P0-05/10: bounded supplied raw-image context | Owned Learning code/tests/evidence. Explicit 0.2.5 dispatch through existing composer and PNG checks, preserving original descriptor/bytes, all mirrors/unknowns, complete binding, budgets/gaps and cancellation. Keep legacy behavior and provisional-only help boundary. Current-authorized stored readers remain Backend dependency; no fake provider/upright image claim. | `handoff_15256c1fe1246831de7933f7f16bd2b2` accepted; actual start `handoff_7b72beb5ffa9bc48d390594617d315d2` (04:12:31 UTC) confirms preserving merge `42ea154`, whose parents independently contain the release. Prior owner fixtures remain. Actual delivery `0534f5c` in `handoff_a72b9c30946a471053cafeb9d2960136` is independently approved (141 affected tests and 27 separate probes) and integrates as `5b9c413`; all 256 affected main checks pass. [Independent review](verification/lead/raw-process-context-review.md). Stored reader/bytes and actual native/provider evidence remain separate. |

Backend's same-card internal ingest/read/resolve task is now accepted as
`handoff_90e1bfcda3dbc3ea103854f9282d5e72`; actual start reply
`handoff_cc25b2642f27afd76da53b3b6094afe2` at 04:15:09 UTC confirms normal merge
`70107ea`, whose parents include release `3ee3201` and whose released contract
files match exactly. Actual delivery `6e41895` in `handoff_21e5fe31403371cb18849292cdf010b6` is received. Initial lifecycle HOLD (BR1/BR2) was corrected by actual `4f51d78` / `handoff_65bb2f7bb84d5bc3b0c945687c2938be`. Independent retest passes unchanged9 + focused11; reader/resolver review passes45 + separate22. Base/correction integrate as `1867e2e` / `97f3116`, with657 affected main checks and28 extra lifecycle/composition checks passing. [Integration](verification/lead/raw-archive-integration.md). Backend receives corrected published `0bc1571c40520970177343666badd9c4f2e872d4` for its already accepted opt-in0.2.6 adapter via actual accepted `handoff_170aa7ea74dcfa2749d664e5b79d7ea9` (initially unread); actual normal merge `0946204` has the delivered correction and exact release as parents. Actual HTTP delivery `f04b1e3` in `handoff_e7bf51850590d8ef3a0d1de741dab66f` is independently approved and integrates as `61401a1`; main472 focused checks plus34 independent probes pass, including eight HTTP-to-stored-Learning checks. Default remains off. [HTTP integration](verification/lead/raw-http-integration.md). No duplicate internal task or DB rerun.
Owned API/tests/migrations only: a distinct immutable
`raw_capture_frame` document kind in the existing actor store preserves legacy
export shape, with shared frame IDs/tombstones, same-transaction fences and exact
raw metadata/bytes. [Concrete inspected seams](verification/lead/raw-frame-backend-next-scope.md).
No old HTTP shape may silently widen. One narrow `lc_p0_test` migration/immutability
check may follow portable tests; no user-preview data or DB/service restart.
QA completed its bounded `dce0940` closed-root retest; earlier ink/Export evidence stands. Support remains on demand.
Lead P0-08 has implemented/reviewed the separate raw HTTP envelope/route contract
**0.2.6** (`packages/contracts/raw_capture_ingress/**`), preserving all prior wire
bytes. Main 332 focused contract checks, generation/root TypeScript/shell and
OpenAPI checks pass; independent 52 probes approve exact final files. Root checks
include the new generator/types. [Release evidence](verification/lead/raw-ingress-release.md).
The pure baseline did not activate a handler/capability. Backend's subsequent
opt-in adapter is now integrated as `61401a1`, with same-transaction full HTTP
replay and current fences; the default remains off. No source/producer grant follows.
The original conditional dispatch at exact pushed baseline
`0c3e227413bd8cba3312a52445dfdbdde75ca390` and this conditional next task were
accepted by Backend as `handoff_0fd9a24ba7ddfbb576cec71930310ed9`, initially
unread at that historical receipt; actual adoption and completed delivery are
recorded above. Learning received its integration result in
`handoff_edc21ca8023e5c46f7cdccc2d71f2658`; no duplicate assignment is needed.
Lead has now verified its stored reader/composer against the actual HTTP adapter.
Reviewed/local-tested main `8e4f52d0f5e613e8cff59bba888441dcbc847787` is pushed.
iOS confirms reading counterpart notice `handoff_537f473686c84d7e9b7106f6654433e6`
and exact `8e4f52d` in its actual delivery; the bounded correction above continues
that same task. Backend's ONE independent next
implementation composes existing control/ingress handlers on one origin without
creating grants or changing defaults: `handoff_9f5b060c37cd42a3688fd24db28347a1`
was accepted and adopted through normal merge `d84982e`. Actual delivery
`2b0b4e1` / `handoff_5fed12491e9f910b921cf41b9bd65f74` now integrates as
`6cce5fe` after independent review; 282 affected main checks and five independent
probes pass. Default routes/authority remain unchanged. Exact scope, root-path
limitation and next native/QA action are in
[composition integration](verification/lead/capture-app-integration.md).

Lead completed actual Swift request/original composition at exact `81b7e18` after
successful hosted run36677566096; [executed evidence](verification/lead/native-raw-ingress-integration.md).
ONE P0-07/P0-13 independent QA continuation is accepted as
`handoff_a5c2b49e4f0f0c2405b798656b043e91`, with actual start
`handoff_68d5a94e341569115d6b2ea1dbe7f23b` at06:32:07 UTC (merge `ac8f0b6`), targeting
this exact candidate and current-access/Stop/original-retention negatives. Lead
received actual QA delivery `02a47f7` in `handoff_ac938634a83960b54637a377759990ce`:
37 pass / five strict xfail, with all five reproduced by lead. Backend owns one
bounded integrity-error classification repair; QA helper safety correction `239e780` is locally integrated with its evidence;
42 integrated checks pass under `--runxfail`. Backend ancestor correction `69e1298` → `94668c7` is independently approved;
focused main checks pass. The final independent retest has passed at exact `00f4f0b`: actual
QA `87bcc07` integrates as `d1b82da` with 91 main checks and no xfails, preserving all earlier accepted evidence. [Current review/receipts](verification/lead/native-qa-delivery-review.md).
The source repair and independent acceptance are integrated. **Superseded scheduling:**
the following P0-03/P0-11 mobile control-client assignment was checkpointed by the
desktop-first decision. Actual reply `handoff_1edfaab5bd47eb2c9140d3a7f072b426`
reports clean `4cc605a`, no new Swift control implementation, and preserved reusable
specification/hosted evidence. No further mobile-only implementation/build is assigned.
The retained original assignment consumed existing
0.2.1 registration/current-state/restrictive Stop and 0.2.4 display registration.

- Outcome: with explicit trusted caller inputs, obtain validated current stream
  and display identities for the existing upload consumers; durably stop local
  sending before awaiting server Stop synchronization. Never infer a grant from
  IDs/token possession or revive a stopped incarnation from a stale receipt.
- Baseline: the published commit containing this continuation; handoff supplies
  its exact SHA. Read complete affected R02/R03/R07/R35/R36/R51/R52, A12/A14/A16/
  A30/A31, §3.9/§7.1 and released process-control/capture-ingress contracts.
- Write scope: `apps/ios/**`, native checks and `docs/verification/platform/**`.
  Reuse `IngressAuthorization`, `IngressTransport` and uploader retention/Stop;
  no new shared wire family, dependency, identity store or public grant endpoint.
- Require exact response validation and source/incarnation correspondence, stable
  idempotent retries after unknown outcomes, current-state reconciliation on CAS
  conflict, current auth failures and no token logging/persistence. Use an explicit
  ephemeral transport that refuses redirects before forwarding credentials or
  originals; a final response-URL check alone is not preventive. Unknown Stop
  boundary stays unknown. Preserve saved frames, queue witnesses and old receipts.
- Tests: bounded native checks plus emitted valid/invalid fixtures against the
  existing Python contract validators; lost responses, stale/reordered replies,
  Stop races and malformed/wrong-source results. Native runs/builds wait for the
  reviewed exact-source existing hosted route; no old campaign without cause.
- Activation boundary: injected explicit caller configuration only; no default
  endpoint/token or UI/background producer activation. Native client output is
  neither fresh grant issuance nor real AI/device acceptance. Trusted runtime
  user/device/session/start bootstrap remains lead-owned and unimplemented.
- Next owners: iOS implements one consumer, lead reviews/compiles/integrates and
  supplies the trusted runtime composition boundary, QA checks the changed flow
  only after a concrete candidate. No duplicate task or support patrol.

Actual native dispatch `handoff_3cfb4b3ddefec7dd93cbaec12ab26a68` is accepted at
exact pushed `2109ed36acea86b7190e9620022c8a53ee8cdf69`. Its receipt initially
reports unread/not started. Read-only inspection then observes actual iOS normal
merge `e5e344dfadd95023a01b49c459aade572a31ccf7` containing that baseline;
this proves adoption/activity, not implementation or passing checks. Backend's
closure and retained-boundary notice is accepted as
`handoff_3d8e8a9bd1744672a9e2c3634e8e37a7`, without a new task or reply request.
Lead's parallel CI change loads the already committed, SHA-pinned native fixture
ZIP for the normal matrix, so these91 regressions no longer silently skip. Exact
embedded-step extraction and bad-pin rejection pass, and10 existing replay cases
pass against its extracted inputs. Exact `c4f2e38` normal CI36689071699 now passes
both Python3.12/3.14 matrices: 3390 passed/19 unrelated existing xfailed, no skips
in each; the91 cases are included, not additional counts. This does not rerun
native generation/device acceptance. No prior campaign is repeated.
Device/signing/provider access remain separate dependencies; an ASGI callable
and actual native harness output do not activate the user-facing producer. Existing
[P0 CI 36667529194](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36667529194)
on exact `3ee3201` passed both Python 3.12/3.14 + Node 24.21 matrices.

**Concrete blockers:** product connector is disabled (`services/worker/connectors/disabled.py`),
not an active paid or subscription vision backend. User has been asked for an
existing intended official product API/connector (no secrets); developer login is
not product authorization. Existing Apple mobile signing/provisioning/installation remains required for later
mobile delivery, now deferred rather than blocking desktop work. Arbitrary iPad
native-app interactive overlay is unsupported on the established public-SDK route;
not merely pending credentials. Preserve the complete gate as unmet, do not silently
choose a fallback. Independent local implementation above continues.

Web library `cc006fd` remains held for the reproduced overlapping-connect identity/token
mismatch; [review](verification/lead/p0-saved-library-web-review.md). Its prior repair
is parked behind the core input work, not discarded or published. No new library
feature/polish round. The accepted owned-document preview remains a fallback.
Use only `lc_p0_test` if tests require a DB. User `lc_desktop_preview`, ports4173/8174,
exported source/identities/tokens/runtime and Paperclip remain untouched. No provider,
account, hardware, model, effort, permissions or budget change is authorized here.

## Historical recovery and bounded continuations (2026-09-29 UTC)

The WSL/desktop interruption preserved main `fc079e9` and all worktrees. Saved
review/test outputs were recovered; completed Backend `17a7dc8`, Learning
`1504509`, iOS `7ba5a15` and Support deliveries were not replayed. The operator
reports desktop/server/keepalive/quota timer and dedicated PostgreSQL restored,
plus successful QA tool execution after narrowly removing an abandoned OAuth
refresh lock. That is runtime recovery evidence, not product acceptance.
Actual native Backend and Learning replies confirm their snapshot tasks resumed;
Web `db7400f` and QA `bd79ca4` are now integrated and locally checked.
Corrected Learning snapshot and Backend export are now integrated and composed on
main; their original failure reports remain history. Learning context and Backend control are separately reviewed/integrated;
Learning output guard repair 13298e6 is reviewed/integrated as 3e0be6b,
with 77 integrated publication/QA checks passed. QA output retest is integrated;
its Web retest has returned `2f83761` for review. The new referenced native run restored six routes,
read actual deliveries and accepted six policy notices. No old denied call was replayed.
See [current evidence and receipts](verification/lead/p0-recovered-deliveries.md#workflow-adoption).

| Existing owner/card | Current bounded action / dependency |
| --- | --- |
| Lead P0-08/P0-07 | Runnable real preview and normal restart evidence published; QA recovery and the reviewed Web selection repair are integrated; actual narrow QA passed on exact `6c3c1b6`. Publish its reviewed evidence and the F1 CI-anchor fix, then deliver the checked runnable milestone. No duplicate archive, platform study or completed acceptance batch. |
| Backend P0-04/P0-07 | Export/B1 correction integrated. Control e1eb0f6 integrated as 882431a. Preview wire corrected/integrated as `0c77721`; runtime/API `2118a0e` passes 247 focused main checks including wire. Seven real PostgreSQL groups are owner evidence, not independent UI acceptance. Backend alone has the bounded shared preview-file delegation below. |
| Learning P0-05/P0-07 | Snapshot corrected/integrated; context b21c8e3 integrated as 52f3f1d. QA-L05-02/03 guard repair 13298e6 integrated as 3e0be6b, not a rerun of completed snapshot/context work. |
| Web P0-02/P0-07 | Real API adapter and corrections integrated through `54063bf`; actual recovery acceptance passed. QA-P07-01 repair `b471bdf` → `6c3c1b6` passed independent 10/10 focused browser checks and main module checks. Real-API QA `aa63f52` now passes 23/23 and closes the tested Edge defect. The correction is complete; preserve other P0-12 findings without another repair batch. |
| QA P0-13 | Output/Web reports and native result retained. Focused actual preview recovery `c0036bc` → `1185997` passed. Harness/evidence correction `c182581` → `9a58b22` is integrated (1 focused main test / 4 child lifecycle cases); narrow QA-P07-01 retest `aa63f52` → `fee30bd` passed 23/23 on exact `6c3c1b6`; F1 CI-anchor repair `0a9139d` also integrated and targeted-tested. This bounded acceptance is complete. Do not replay the full recovery/native campaign. |
| iOS / Support | CompanionInk `833a2a6` device/simulator builds and actual Simulator acceptance passed (25 PASS / 0 FAIL / 3 device-only NOT_RUN). Physical iPad/Pencil remains unverified; existing device route continues under the [approved split](#ipad-delivery-split); no duplicate workflow. |

## Delivered P0-07 desktop fallback — prior delivery priority

The current original-page entry priority above supersedes this completed fallback
as the next user-visible outcome. The retained scope/evidence below is historical;
it does not require importing a document to begin the intended product. Follow
[delivery and simple design](workflow.md); finish active bounded work, then group
existing owners around this outcome. This changes sequence, not R01–R60/phase
scope or models/permissions. No calendar ETA or completion percentage is claimed.

**Outcome:** from a documented foreground launcher and local address, open a real
user-selected UTF-8 text document, select text using the existing explicit ASK
interaction, see the request state, save the complete original plus selection-time
context and an attributed user note/request, then close/reopen the saved item
without reimporting the document. This owned document surface is an explicit early
desktop fallback; it does not replace original-page/iPad functionality.

**Current state:** the real Web adapter and its three failure-boundary repairs are
integrated through `54063bf`, with independently reproduced corrections and 26
exact-main focused tests/typecheck/build passing. The shared generated contract
and canonical examples replace temporary copies. Exact-main `54063bf` real Edge/API/PostgreSQL
save/restart/reopen passed on its first run; the earlier normal-path composition result
and owner's 33 browser checks remain separately attributed. The [access guide](document-preview.md)
identifies the bounded preview and missing provider/device capabilities. Independent
[role-QA recovery acceptance](verification/qa/p0-07-preview-recovery.md) at exact
`9eb6bd5` now adds 30 PASS / 0 FAIL: real commits with deliberately dropped responses,
safe retry, pending-ID recovery, retained originals and unsaved-work guards. This
is labeled transport injection, not an actual network outage or a second API-restart
claim. QA-P07-01 correction `b471bdf` → `6c3c1b6` is integrated after
[independent review and 10/10 focused browser checks](verification/lead/p0-preview-reselect.md).
Those checks use the labeled test double. Subsequent independent
[real-API QA](verification/qa/p0-07-01-reselect.md) at the exact integrated source
passed 23/23 and closes this defect for the tested Edge mouse path. Main module
tests/typecheck/build pass; the original full recovery pass was not repeated.
CI later found an outdated QA mutation-site anchor; `0a9139d` updates only that
anchor with the assertion intact and 16 targeted main checks passing. Inspected original code baseline
`0c04b2e888fbb7240e9634a6ade2bd309601e3a1`. The exact workflow revision is recorded
in [the adoption/transport record](verification/lead/p0-recovered-deliveries.md#workflow-adoption).
The denied earlier run is historical. The new referenced run actually listed/read
routes and accepted six notices plus the bounded existing-card continuations below.
Accepted/unread receipts are not execution or adoption evidence.

**Requirements:** R03/R06–10/R17/R27–32/R43–44; A02–03/A10–12/A19/A23 and
V-ArchiveCompanionContinuity/V-DailyResume support only. R53 help scope and
English-first/source-language rules remain. This slice does not pass those entire
requirements, real AI understanding, R59/A44/A46, audio or full P1.

| Owner / current and next boundary | State and concrete next action |
| --- | --- |
| Lead, P0-07 | Runnable preview, restart/recovery evidence and selection repair `6c3c1b6` are integrated; actual changed-path QA passed 23/23. Published `5218096` and normal CI `36543445662` passed. At that checkpoint Safari entry was next; the current desktop-first table now supersedes that scheduling. Retain the library checkpoint without extending that detour. |
| Web, existing P0-02/P0-07 | Adapter `096cac1` + correction `75dad5e` integrated as `94bf522`/`ff52933`, canonical imports in `54063bf`. QA-P07-01 delivered as `b471bdf` → `6c3c1b6`: preserves click-on-selection while allowing the same phrase to be dragged again; unknown-save identity/text stay intact. Independent focused 10/10 and main module checks pass. Actual real-API QA passes 23/23: the tested Edge mouse defect is closed. No current repair remains from this handoff; other P0-12 findings stay separately tracked. |
| Backend, existing P0-04/P0-07/P0-09 | Snapshot/control delivered. Wire correction `0c77721` and same-archive/PostgreSQL runtime `2118a0e` integrated after review. Seven actual DB/API restart groups remain owner evidence; support Web integration defects if found. Only Backend has the explicit shared preview-file delegation below. |
| Learning, existing P0-05/P0-07 | Snapshot integrated; context correction integrated. Two QA output-guard repairs integrated as 3e0be6b; 77 integrated publication/QA checks passed. Later connect existing ArchiveSnapshot/context to the same saved evidence; retrieval is not generated teaching. |
| QA, existing P0-13/P0-07 | Actual recovery/unsaved-work acceptance complete at `9eb6bd5`: 30 PASS / 0 FAIL, with one low UX finding. Replay wording/inputs and signaled-child cleanup are corrected in `9a58b22`, with 1 focused test / 4 process cases passing on main. That narrow same-phrase real-API check passed 23/23 at source `6c3c1b6`, integrated as `fee30bd`, with actual tracked-source provenance and click/typed-guard controls. F1 harness repair `0a9139d` fixes the stale cancellation anchor with the uniqueness assertion intact; 16 targeted tests pass. This acceptance segment is complete, with no repeat browser task. Lead's real API-restart evidence stays separate. Do not repeat completed broad reports or infer AI/device acceptance. |
| iOS / Support | CompanionInk exact `833a2a6` compiled for device and simulator; both artifacts are downloaded/verified and 13 native file-preservation checks passed. QA harness `ca639af` + H1 correction `259dcf6` and Support CI `6ab5d22` integrated through `65107f4`; main 10 focused checks pass. Hosted run `36532369377` at `97fec90` completed successfully; QA independently inspected actual logs/images: 25 PASS / 0 FAIL / 3 device-only NOT_RUN. Physical iPad/Pencil remains unverified. Support owns the build/install route under the [approved split](#ipad-delivery-split). Neither blocks independent desktop preview mechanics. |

### Historical first task applying the workflow — Backend/Web P0-07, delivered

- **Observable result:** one committed import/readback/launch boundary lets the
  Web owner render a real document and later recover the exact saved source and
  selection context from the existing store. This is part of the
  single preview; Backend supplies persistence/wire and Web independently builds
  the owned document UI behind a small transport boundary.
- **Baseline/ownership:** exact policy `4a2be79525e87542b3ca77ac6fd04ecf28b04b6d`;
  Backend preserves its delivered `e1eb0f6` branch, Web its integrated `db7400f` work.
  Existing v1 stays compatible; capture 0.2.0/control 0.2.1 remain independent.
  Lead explicitly delegated **only** `packages/contracts/document_preview/**` and
  `packages/contracts/tests/test_document_preview.py` to Backend for this task,
  alongside its owned `services/api/**` and evidence. The finite preview wire is
  separately versioned; Backend publishes that small slice first. No competing
  shared-file writer or standing ownership change. Web owns its UI paths and binds
  real transport only to the exact released wire; lead retains final compatibility,
  review/integration and `scripts/**`/root launch decisions.
- **Reuse and actual gaps:** `/v1/sources` registers URLs but does not ingest a
  real document; `import_fixture` must remain synthetic-only. Existing bridge ACK
  is acceptance, not durable save. A DOM snapshot has no pixels and truncates
  context; retain the complete imported original separately. Reuse current
  immutable source/frame/event/note models and exact version GETs, with a minimal
  trusted local import/frame-byte readback seam and owned device/session binding.
  No duplicate identity/archive or generic upload/capture framework.
- **Relevant checks:** actual non-fixture text (including non-ASCII and markup)
  stays exact and is rendered as text; known source/version/frame/selection is
  retained; current authorization and transaction guards apply; failed saves and
  interrupted requests show unresolved/not-saved status; retry is idempotent;
  reopen after a new API process returns the committed original and user-authored
  content with separate AI state. Keep existing data-loss/permission/cancellation
  regressions on this flow. Unknown context must not be replaced with fabricated
  pixels, frames, OCR or explanations.
- **Deliver/access:** exact code commit, one foreground launch command/address,
  actual UI/API/storage evidence and remaining gaps. Keep credentials on a trusted
  local boundary, never in a course content script; loopback/local auth is not
  production OAuth. No unapproved service/account/provider activation. If no real
  AI route is connected, the request visibly reports provider unavailable while
  document/save/reopen remains independently usable.
- **Next owner:** Web integrates the supplied boundary; Backend implements only
  its necessary import/readback piece at its current safe handoff. QA receives the
  one combined runnable candidate. Typed process uploads, all-app overlays and
  other unrelated future-phase refinements are not prerequisites to this slice.

<a id="ipad-delivery-split"></a>

## Historical approved iPad delivery split — evidence retained, further mobile work deferred

User authorization: 2026-09-29 UTC, complete operator packet
`work/ipad-delivery/assignment.md`, SHA-256
`a33b3f0ce4fe6a55b49100324353c5c7a1861357af095c214cb69bad2a761dcd`.
Lead read the full packet at this saved boundary; its exact source location and
integration evidence are in [the delivery record](verification/lead/ipad-delivery-split.md).
These were existing-card subtasks, not a second tracker. The current desktop-first
decision supersedes every next-action instruction in this historical split; no
mobile-only feature, build/signing/device or Playground campaign is dispatched.
Preserve their evidence, target M5 iPad Pro / iPadOS 26.5, models/efforts, budget,
approvals and all original requirements. Older OS-27 research is history.

| Subtask / owner | Observable outcome, scope and next dependency |
| --- | --- |
| SUP-IOS-01 / Support | Existing `.github/workflows/ios-probe.yml` and optional `scripts/ios-build/**`, plus usual support evidence/probes. Exact EnvProbe source `402bbcf` → main `91d41e8` compiled unsigned at `01a8adf`, actual run 36525663497. Artifact patch `037c368` → `be85710` and evidence `9f0b44b` → `996d95a` pushed; Support verified actual artifact download/source/product in run 36526881401; evidence `df0ca1d` received. Next: CI patch `b1cabc1` → `6f6d863` and corrected ink `c6d0976` → `24d43bc` integrated; Two-SDK compile/artifact workflow and native file-check follow-up `9775d9f` → `2ec7a2b` integrated; Run 36528092111 at `833a2a6` succeeded for both SDKs; 13 macOS file checks PASS/0 SKIP. Support actually downloaded both artifacts and verified hashes/source bytes; `236eaac` → `eaa7611`, [evidence](verification/support/sup-ios-01-companionink-build.md). Build/artifact segment complete; QA harness invocation `6ab5d22` → `65107f4` integrated. Actual hosted run `36532369377` and independent QA inspection passed; native physical-device route remains separate. No repeated build requested. Lead integrates; no branch push, native source/manifest or checks.yml edits. |
| IOS-INK-01 / iOS | Existing early start received; own `apps/ios/**` and platform evidence. One SwiftUI/PencilKit owned learning page, honest stable source identity, user-original editable ink, eraser, atomic local save, close/reopen offline and continued editing. Source `5d5d8cb` → `2eba590` plus reviewed original-file/envelope repair `c6d0976` → `24d43bc` integrated, package/scheme `apps/ios/CompanionInk.swiftpm` / `CompanionInk`; both targets compiled at `833a2a6`. Owner evidence `8a68e39` → `6a14ea2`; actual Simulator QA passed in `36532369377`; physical iPad/Pencil behavior remains not_run. Native owner fixes actual defects, with no unrelated feature expansion. |
| QA-IOS-01 / QA | Already assigned conditionally by operator, not redispatched. Current bounded Web retest `2f83761` delivered; report integrated as `af4c47f`, with 2 pass/3 strict xfail retained. Exact `833a2a6` and simulator artifact 11015635836 supplied. QA harness `ca639af` → `7399524`, H1 correction `259dcf6` → `f1a11fa` and Support invocation through `65107f4` are integrated; 10 exact-main host-check tests pass. Actual run `36532369377` at `97fec90` passed; QA evidence `ca705b9` → `29e5409` records 25 PASS / 0 FAIL / 3 device-only NOT_RUN. Launch, write/erase, relaunch, continued edit, mode guards and save-failure preservation passed on the owned page in Simulator. Next QA work is the bounded combined Web preview acceptance. Keep existing QA paths; actual device-only checks stay not_run without access. |
| Conditional specialist / iOS integration | Not dispatched. Only after project/build boundary is stable may lead/iOS assign one bounded audio OR capture module/probe to available verified expertise, with non-overlapping files, exact interface/version, acceptance and stop condition. No permanent new role or several parallel planners. |

**Precise supersessions:** IOS-INK-01 supersedes research-only/no-Swift-before-route
and arbitrary source-line quotas for this one implementation. Readable complete
behavior and focused data-loss verification remain required. The already-created
`ios-probe.yml` supersedes the packet's proposed duplicate `ios-prototype.yml`;
Support alone maintains the explicitly delegated CI paths. EnvProbe's actual
hosted build supersedes its earlier uncompiled status only for that exact source.
It does not establish CompanionInk compilation, a signed install or device success.

**Acceptance scope:** supports R03/R07–10/R29/R46–48/R51–53/R58, A12/A26 and honest
A45 fallback evidence. Preserve Pencil/finger intent, NAV/ASK/WRITE separation,
original source/ink and separate future AI supplements. Ordinary writing never
requests help; any ASK before connectivity visibly says unavailable and sends
nothing. A bundled page is a labeled fixture, not captured course content. No new
archive/sync/provider or backend contract is needed for local ink. R59/A44 original
live-screen interaction, both intended display modes, A46 actual Notability import,
audio/multi-speaker understanding and full P1 remain separately unverified.

**Historical device/install boundary:** Support prepared exact source/build artifacts and run
steps, distinguishing free Swift Playground execution from standalone signed
installation/TestFlight and extension/background behavior. The later retained physical
prerequisite is opening/running the prepared CompanionInk source on the target iPad;
unsigned `.app` is not installation. No purchase, enrollment, credential creation
or TestFlight upload is authorized. Missing signing/audio/provider access does not
block local ink development or independent desktop preview persistence.

## P0 resumption and provider availability (2026-09-28 UTC)

The following is the historical resumption ledger. Current task states are in
the top table; the latest reviewed integration and exact-main checks are in
[P0 review integration](verification/lead/p0-review-integration.md).

The configuration operator reported provider `rate_limit` / `monthly spend limit`
and a displayed 03:50 America/Los_Angeles session reset for iOS/Web/QA. This is a
reported provider failure, not a setup-only, route, filesystem or Git refusal; the
mixed message does not guarantee recovery at 03:50. Native Chats list/inbox/read
worked in this turn. Later all three roles delivered actual specification reads,
and QA and iOS delivered real commits; continued execution capacity remains
unconfirmed beyond those observed deliveries. Subsequent actual deliveries now
include iOS 3f13167, Web cdc354c/8a32a8a and QA ebc42e0/b82def6. The earlier
quota interruption is historical, not a claim these roles are currently all stopped.
No quota purchase, model/effort/permission change, worktree reset or retry loop was
used. User-directed runtime effort remains Astra ultra / Claude ultracode; this
record does not reconfigure runtime or reinterpret historical directory snapshots.

| Existing owner/task | Single next action and dependency |
| --- | --- |
| Native/macOS P0-03 → P0-11 (mobile variants deferred) | P0-03 formal delivery a4841d3 received; lead review next, then retain existing P0-11 (worker reports resumed research). Native compile/device checks need an actual local or hosted macOS/Xcode/signing/device path; buying a physical Mac is not a prerequisite. |
| Web P0-02 → P0-12 | One repair handoff `handoff_f344c9e0c1347cb1617f52dbfeda3553` covers all six findings in learning review 59f8ec7; retain the later P0-12 plan. Actual repair handoff handoff_e38e1c4b6e64a0f7501e23d5a4568b66 returned cdc354c; review pending, not marked fixed on main. |
| QA P0-06A → P0-13 | Actual replies handoff_d11f00227f0b4440670f9df265db7a7e and handoff_5fd59ec910ad0b916bcee2358dd97567 delivered 4e0dff9/25c63b6. QA-01/02 reproduced, QA-12/13 raised; original 37-case semantic report received, remaining 28-case review continues. QA-12/13 shared and HTTP fixes now have lead reproduction; candidate 37456ac independent retest now received as 62e5ab9, confirming QA-12/13 on Python 3.14. Regression/report integration is separate. |

Available Astra work continued in parallel: Backend independently reviewed
Learning P0-05 (`handoff_4f166699ed064d6563303643961a4b25`, delivery 8f13312);
Learning independently reviewed Web P0-02
(`handoff_97ed5eea1a589ebbf106dd68eec84676`, delivery 59f8ec7). Backend received
and closed two bounded P0-04 fixes under its existing card. Lead integrated the
reviewed deliveries, corrected shared validation, and extended locked CI discovery.
The next Astra evidence slices returned actual deliveries: Backend P0-10
65-case semantics as 30dc33d (`handoff_4bdf285f72aeb186a030e4f90a4cbc2e`);
Learning P0-09 25-vector consumer review as fd5162b
(`handoff_1df53405404af015f49beeabb981690e`). Lead review/integration remains,
with concrete findings feeding existing task cards; shared P0-08 contracts and
P0-13 QA ownership remain unchanged.

Main checks: **407 passed, 13 strict xfailed**, no skipped test in the root script;
TypeScript and web build passed. Pushed code 7367c2c also passed hosted CI
[run 36397872539](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36397872539)
on Python 3.12 and 3.14. The real PostgreSQL runner separately returned
BLOCKED/exit 2; G1–G7 are not promoted by these local checks. Detailed provenance,
known defects and transport receipts are in
[P0 resumption evidence](verification/lead/p0-resume-integration.md).

Sending or yielding ends a chat turn, not this authorized project. Lead continues
independent work and handles later deliveries with review, integration and the next
bounded assignment. The product-document audit has now been received and adopted in the linked
intent/original-verification records. Three recorded user questions are answered;
there is no pending choice among those three. New actual ambiguity must be
recorded and asked without guessing, while independent P0 work continues.

## Shared dispatch baseline and boundaries

Historical first-dispatch repository base: `4684b79ed979ad5162e1c86635a245d68601da84`.
That initial dispatch supplied the exact P0-01 contract commit for clean worker
branches to fast-forward before editing. This is not a merge prerequisite for
later specification adoption or worktrees with ongoing changes. Contract version: `0.1.0`.
Actual baseline: `91019c3fd548e47aca632136012bb961c4af07cb`. The three accepted
mailbox receipts are recorded in `verification/lead/p0-first-dispatch.json`.
Receipt acceptance is not a claim that worker execution or verification completed.
Confirm branch, unrelated changes, baseline and owned paths first. Do not reset or
switch other worktrees. If a shared change is required, send lead a concrete request.
No paid product APIs, account registration, publication, purchase or unrelated
messages are authorized by these task cards. Official documentation research and
reversible local implementation/tests are authorized.

Return a committed delivery with commands/results, evidence, limitations, and
unverified conditions. Use the actual mailbox reply route and `--reply-to` original
assignment ID. Do not acknowledge receipt unless it resolves a concrete blocker.

## P0-02 / Web Windows capture/input

Current executable scope is the Windows row in the top continuation table,
including `apps/windows/**` and the app-scoped package/lock delegation. P0-12
retains disclosure/source behavior. The following original browser probe is
**historical delivered scope**, retained for evidence and reuse, not another
fixture-page implementation or a restriction against desktop application work.

- Historical goal: R01/R03/R06–10/R46, G1, A01–03/A26 supporting probe, not full acceptance.
- Write: `apps/safari-extension/**`, `docs/verification/web/**`; module config/tests
  are allowed. Dependency manifests/locks, shared contracts, root config stay lead-owned.
- Implement explicit NAV/ASK/WRITE behavior and an English-first silent card probe
  in an owned test page. No selection in NAV/WRITE and no ordinary finger interception.
  Use `packages/contracts` types; immutable source/version anchors and honest
  `dom_snapshot` versus actual screenshot capability. Return prior mode on done/cancel.
- Fixture card only for a known fixture; arbitrary text must show provider unavailable,
  not a fabricated explanation. Use safe text rendering and no page credentials.
- Acceptance: compile TS; deterministic mode/anchor tests; run available browser
  checks on owned fixture, enumerate iframe/fullscreen/captions/cross-origin limits.
  Retain all actual failures. Do not log into a real course or distribute an extension.
  iPad/Pencil support remains untested until a real device path exists.

## P0-03 / Native macOS (`ios` route; mobile checkpoint retained)

- Current executable outcome is the macOS row in the current continuation table.
  Historical IOS-INK-01/SUP-IOS-01 evidence is preserved, not an instruction to
  start another mobile build/device/signing campaign.
- Goal: R01/R03/R07–10/R29/R35–36/R46–48/R59/R60; G1/G2/G3/G5;
  A02–03/A12/A14–16/A26–28/A44/A48, desktop variants first.
- Write: `apps/macos/**`, native module tests and `docs/verification/platform/**`;
  preserve `apps/ios/**`. Reuse reviewed protocol/retention components without
  converting ReplayKit-specific facts into unverified macOS facts.
- Implement explicit original-display capture and permission/Stop lifecycle;
  original-screen overlay input, both ink modes and audio follow as bounded
  continuations on the same cards. Use public AppKit/ScreenCaptureKit facilities.
- Evidence separates source, unsigned build, executable harness and actual Mac
  permissions/capture/pen/audio. Interactive Mac access remains unconfirmed;
  hosted compilation is useful independent work, not runtime acceptance.
- No new accounts, hardware/cloud purchase, universal overlay claim or paid
  provider activation. Lead releases exact candidates; QA independently tests
  real desktop behavior when the required runtime is available.

## P0-05 / learning

- Goal: R04/R17/R27–32/R43–44/R50; G6; A04/A09–12/A19/A23 supporting evaluations.
- Write: `services/learning/**`, `services/worker/learning/**`,
  `tests/fixtures/memory/**`, `tests/evals/**`, `docs/verification/learning/**`.
- Approved fixture scope: project-authored synthetic content only, test-only consent,
  English teaching text with short Chinese recall clues where useful. Use v0.1.0
  source/frame/observation provenance; original UTF-8/artifact hashes and stable IDs.
- At least 30 fuzzy/history-correction queries plus 50 exact-history queries, distinct
  labels and plausible distractors. Include actor separation, same concept across
  courses, rare early detail, corrections, missing media and changed source versions.
- Implement a deterministic reproducible lexical + metadata baseline and an evaluation
  command reporting top-5 correct-source recall, latency/sample count, failures and
  zero paid calls. Demonstrate original records unchanged after index rebuild/restart.
  Do not tune on all evaluation answers or hide failures. No second identity/archive.
- Graphiti is a candidate, not a selected production dependency. Research a bounded
  same-input comparison and request exact dependencies/budget controls if required.
  Without an executed real candidate comparison, G6 stays incomplete.

### Existing P0-05 segment: report-output source protection

Independent QA `18ec813` (integrated as `068f593`) confirms the earlier index
recovery/root-alias repair within its local filesystem/process-exit scope, but
QA-L05-01 was returned to Learning as
`handoff_ee50c8b9efb97596254985166eccb697`, based on main `6e50f74` and the complete
QA report. Actual delivery `handoff_757110736dcfe9978ffb7c260ead9390` supplies
`1504509`, reviewed/integrated as `07c684b`. Main passed 215 Learning tests and
seven promoted QA regressions; 187 originals remain unchanged. The demonstrated
local defect is repaired; independent role-QA retest remains pending. Saved files
now carry `published_unverified`/null final preservation: completion requires the
successful exit plus matching complete stdout receipt and artifact hashes. See
[repair integration](verification/lead/p0-output-repair-integration.md). The original
repair scope below is retained as the implemented acceptance boundary.
Protect all four evaluation report paths from planted symlinks/hard links,
determine preservation after the final owned writes, and prevent failed reruns
from presenting mixed old success/new preflight as a completed run. Cover the
adjacent demonstrated non-manifest metadata and directory-identity aliases with
focused temporary-copy checks. Preserve valid dedicated external outputs, frozen
originals/ranking/history and existing ownership. No mount, provider or dependency
work is assigned. Actual APFS/power-loss/concurrent-writer guarantees remain
unverified; this is not a general filesystem framework. See the
[review and exact dispatch](verification/lead/p0-index-output-review.md).

### Existing P0-05 segment: callable provenance-preserving context

Authorized scheduling continuation, 2026-09-28. This is executable implementation
under the existing card, after the atomic snapshot/source-protection repair; not a
new task ID or a repeat of its persistence work. Supporting R27–32/R58,
A09–12/A38 and V-ArchiveCompanionContinuity/V-ModelSwitchContext, with R53's
presentation limits intact. The bounded local packet is not those product passes. Delivery `d25efe8` plus the
actual identity-key repair `a299477` is now reviewed/integrated as `772e579` →
`4e7242f`; independent role-QA and the Backend production adapter remain separate.

- **Owner / baseline:** Learning. Main `1619b023ed7c04d3a498e4e2a9e683f34534f998`
  contains the unchanged v0.1 archive/retrieval; the repaired owner continuation
  `8cdf0c2` → `5678714` supplies atomic cache handling. Preserve both commits and
  current work. Lead supplies the exact integrated/task-card SHA in native dispatch.
- **Implement:** a callable internal context-assembly function/module in
  `services/learning/**` over the existing validated archive and `RetrievalIndex`.
  Reuse their identities, source/frame evidence, exact timestamp comparison and
  frozen scoring. Add focused tests under `tests/evals/**` and a short evidence note.
  Return a deterministic provider-neutral evidence packet with snapshot fingerprint,
  not generated answers. Default this assembler to `current`; require explicit
  `history` rather than accidentally inheriting retrieval's historical default.
- **Behavior:** require explicit trusted user scope; retain original-language
  quotations, actor, exact source/version/hash/URL, event and frame/media/time links,
  available observation confidence, distinct capture/receive time, correction links
  and gap flags. Missing evidence stays unknown. Keep the frozen retrieval/evidence
  output unchanged; assembler-only augmentation can use the same authorized originals.
  Use metadata filtering; any correction-neighbor
  expansion must recheck user/course/source accessibility before calling the raw
  evidence accessor. Competing corrections remain unresolved branches, not a
  timestamp-selected winner. Preserve `candidates` / `ambiguous` / `not_found`
  as retrieval outcomes, never proof that an event did not happen. Existing `current`
  and `history` modes must remain distinct: current means current in this supplied
  archive snapshot; historical records stay labeled as historical/superseded where
  established, with their own original sources. Do not call a time-filtered current
  result an as-of reconstruction; v0.1 lacks full knowledge/confirmation semantics.
- **Corrections and limits:** keep correction relationships visible without
  rewriting originals or guessing absent reasons. Unresolved/filtered relation,
  missing media, unavailable source and unknown order remain explicit. A v0.1
  correction is not an AUDIO proposed/confirmed speaker repair. Packet size limits
  are configurable transport defaults, not a long-term archive cap: omit whole
  evidence items with truthful omission/limit status rather than silently truncating
  quotations. Do not invent a total candidate count unavailable from the retriever.
- **Freshness / acceptance:** reject an index belonging to a different archive
  snapshot; reassemble after correction/deletion instead of reviving a cached packet.
  Test two-user isolation; teacher/user separation; source-version/frame integrity;
  current versus history and a future correction outside a time filter; inaccessible
  correction ancestors, competing corrections and exact fractional time; unknown/gap
  and no-hit cases; deterministic budgeting with originals unchanged; caller output
  mutation not changing the archive; deleted/stale snapshots and fresh-process
  reproducibility. Keep all 187 originals and the frozen query/label/ranking/failure
  evidence intact. No query-specific tuning or new lexical ranking rules.
- **Boundaries / next owner:** no second archive/identity, production DB adapter,
  shared wire change, presentation permission, provider/API call or product model
  selection. Current local `FixtureArchive` remains synthetic; Backend owns the
  future actual archive adapter and authorization/deletion transaction boundary.
  Lead reviews/integrates this callable stage toward P0-07; QA separately verifies
  a consequential exact candidate. Actual model-switch continuity/G6/P1 remain open.

### Existing P0-05/P0-07 segment: owner-scoped archive snapshot

Learning owns the actual in-memory `ArchiveSnapshot(sources, frames, observations,
artifacts, *, user_id)` continuation, supporting R27–32/R58, A09–12/A38 and
V-ArchiveCompanionContinuity. Base `fc079e9a704acd0e5fe25e095f56e57a13d31f48`;
existing allowed Learning paths and no new task ID. Accepted assignment
`handoff_42b04ddaf5650d23b1608eb87970719b`; actual resumption reply recorded above.
Reuse shared record/hash/reference/sequence/correction validation rather than copy
the fixture archive. Accept legal non-synthetic v0.1 records under one explicit
trusted owner; preserve strict synthetic/test_only `FixtureArchive` loading and
all 187 originals/queries/labels/ranking/failure evidence. Existing RetrievalIndex
and context assembly must work over the validated detached snapshot, including
current/history distinction, mutation isolation and stale-index rejection/rebuild.
No disk store, identity, provider, protocol, dependency or Backend edit. Runtime
validation must accept legal null-frame/no-gap and equal/backdated correction
clocks unchanged; fixture-only rules stay in FixtureArchive, with runtime graph
acyclicity explicit. The delivered `1eff66e` violates this seam and awaits the
actual assigned repair/recomposition. All new
fixture inputs stay honestly synthetic even when their provenance enums model
non-fixture records. Backend separately extracts the four values atomically;
actual adapter composition waits for reviewed integration, not a new wire schema.

### Existing P0-05 segment: scoped context repair after snapshot delivery

Actual QA `bd79ca4` reports CONTEXT-ACCESS-01/03 and related trusted-caller
hardening gaps; no provider/device/G6 failure or pass follows. Learning received
one continuation `handoff_ca8db1656947f400557333cfcaeb57e2` over delivered
`1eff66e`, preserving its review and all originals. Implement truthful counts for
eligible versus access-filtered hits, evidenced unresolved fork labels without
rehydrating blocked originals, a bounded correction-cycle guard and early query
validation (including bool/float version aliases and unencodable input). Document
unchanged fail-closed current-mode behavior when a newer version has no events;
explicit history remains available. No ranking, frozen labels, shared schema,
Backend or QA-file edits. Focused regression and current context/snapshot checks;
no repeat of QA's full fuzz batch. Long-chain optimization and packet grouping
remain separate. Lead reviews actual delivery; transport acceptance is not progress
completion. Supporting R27–32/R52/R58, A09–12/A38 and archive continuity.

## P0-04 / backend

- Goal: R02/R04/R27–33/R38–41/R43–44/R46–47; A10–12/A17–18/A21/A23/A27
  supporting skeleton; G4 real account connectivity remains a separate gate.
- Write: `services/api/**`, `services/worker/core/**`,
  `services/worker/connectors/**`, `docs/verification/backend/**`. Backend owns
  migrations under its module. Lead owns shared HTTP/wire schemas and dependencies.
- Baseline: dispatch supplies exact commit containing the backend optional lock.
  Install with `uv sync --frozen --extra backend --group backend-test`.
  FastAPI 0.141.1, Uvicorn 0.54.0, Psycopg 3.3.6, HTTPX 0.28.1 are pinned.
- Implement an executable API and PostgreSQL repository/migrations for immutable
  source snapshots, exact event batch ACKs and revisioned notes. Keep URL registration
  distinct from fetched/parsed content. All references enforce authenticated ownership.
  Same event ID/content is a duplicate; changed payload or reused device sequence is
  409. Mixed invalid batches roll back entirely. Server `received_at` must not break
  replay fingerprints. Note CAS preserves history, original ink and separate AI layers.
- Auth: explicit local test authenticator only; reject access without configured
  authentication. Anonymous/expired/insufficient scope and body identity spoofing
  fail closed. Do not call a test token login real OAuth.
- Budget: 100,000 CNY fen/month in America/Los_Angeles, trusted server month,
  known versioned price/FX, atomic reservations, idempotent settle/release, retry
  exposure included. Unknown execution outcome retains reservation pending
  reconciliation. No paid executor is enabled by this task.
- Worker begin/commit checks include authorization, source version, tombstone and
  cancellation. Final check/derived write must be transactionally protected;
  historical offline upload never reactivates live capture. Tests cover deterministic
  stale-job sequences plus real DB transaction races when a test instance exists.
- Scope HTTP to source registration/read, event batch, note CAS/read, usage and job
  cancellation. Fixed fixture snapshot/frame import may be a controlled local entry
  point. No full OAuth, scraping, media transport or production queue in this slice.
  Propose exact HTTP request/response schemas to lead before diverging from contracts.
- Acceptance: pure domain and in-process ASGI checks; real PostgreSQL migration,
  restart/readback, two-connection CAS/idempotency, concurrent budget and delete/job
  race suite. A missing dedicated DSN must explicitly block DB acceptance, not produce
  a green skip. SQLite/in-memory tests cannot prove PostgreSQL correctness.
- Environment: no docker/podman/psql/postgres/initdb currently found. Prepare SQL
  and a clearly gated integration command; do not provision cloud/accounts or silently
  change the chosen DB. Prefer HTTPX AsyncClient+ASGITransport for current local
  framework checks; the initial synchronous TestClient probe did not complete.
- Deliver commit, module test commands/results, no-secret env example, startup and
  migration/rollback instructions, real/untested separation and required DB conditions.
  Do not bypass any worktree approval denial; return its precise reason.

### Existing P0-04/P0-07 segment: atomic learning snapshot export

Backend owns internal `export_learning_snapshot(user_id, source_ids)` over the
existing Archive/actor transaction, returning detached `sources`, `frames`,
`observations`, and `artifacts` (artifact ID to bytes). Same `fc079e9` baseline and
existing Backend write paths; accepted assignment
`handoff_583048f488fb4c7ba570d4b957130322`, actual resumption reply above. Supporting
R27–32/R58 and A09–12/A38, not a new HTTP API or store. Resolve current ownership,
revocation/deletion and every requested source under the same authorization guard;
reject inaccessible requests without hidden partial success. Preserve every
requested version, original language/provenance, raw correction, frame and verified
artifact bytes/hash/reference; no recent-N truncation. Test snapshot consistency,
mutation isolation, access/deletion/revocation and preserved originals. Validate
receipt→event as well as event→receipt inventory; absent originals require a
matching explicit deletion tombstone, otherwise fail closed. Delivered `1596db6`
misses this reverse check and is held for its actual assigned repair. Consume
Learning's new constructor only after lead releases its reviewed baseline; the
four-value extraction can proceed independently. Use the existing dedicated local
PostgreSQL handoff if necessary; no new provisioning or secret output. Do not
repeat completed `17a7dc8` contention work or change v0.1/migrations/dependencies
for this extraction task. Lead integrates the two owner deliveries toward P0-07;
real capture, provider and UI reopening remain separate.

## P0-06A / QA contract foundation

- Goal: independently reproduce P0-01 invariants supporting R07–10/R27–32/R39/R44/
  R46–47 and A02–03/A10–12/A21/A23/A27; do not treat contract checks as gate passes.
- Exact baseline supplied in dispatch. Work only in review worktree; permitted writes
  `tests/e2e/**` and `docs/verification/qa/**`. Production fixes return to lead.
- Reproduce frozen-source/selection matching, finite/safe numbers, user-original
  note evidence/version checks, malformed URL and header key rejection, registration
  vs fetch distinction, unknown quota and budget presentation, OpenAPI generation.
- Execute lockfile installs and `bash scripts/check.sh`, inspect generated-artifact
  consistency and whether the documented service responsibilities are honest.
  Report additional meaningful failure cases with reproduction rather than mirroring
  every implementation detail. No paid API, course accounts, device claims or deployment.
- Return commit, environment, exact commands and passed/failed/untested separation;
  report any remaining local instruction/approval boundary without bypassing it.

## Historical problem-solving adoption and dispatch order

The user approved the problem-solving supplement and clarified multi-entry process
capture and original-screen annotation on 2026-09-28. Current scope is R51–R59,
A30–A46 and G7. R59 explicitly refines the original R03/R08/R46–48 goal; it is
not a newly invented wish or a replacement for course-viewing notes.
See [main requirements](requirements.md) and the
[problem-solving specification](requirements/problem-solving-companion.md).
Adoption is not implementation or acceptance. Earlier specification baseline
`57aee9cfc86dfa0dcde674d118034063163ddb13` was pushed and its five notices were
accepted; Backend, Learning, iOS and Web have returned reading reports for that
older SHA. Those reports do not establish reading the final clarification.
The final specification content is committed in
`a2567fa63cdc9c73e9902af57eabf5032a15e5a7`; the exact final reading baseline sent
to all five roles is `e43293760c70364584cb597ae01d34a261cc52cf`, which includes
the specification and its integration evidence. The synchronization turn verified
local HEAD and `origin/main` at that SHA with divergence `0 0`; no spec rewrite
was needed. Later P0 integration commits do not replace that reading evidence.
The prior run's native Chats `list`/`inbox` 403 remains in the evidence record.
In this new authorized turn both calls succeeded and all five actual async sends
were accepted. The transport blocker is cleared by observed operations; each
role's final-SHA reading requires its actual report. All five have now returned
actual `e432937` reading reports, with their message IDs in the adoption record.
Backend's design is now integrated as unexecuted vectors; no product acceptance
is implied by reading, design delivery or integration.
No alternate route, runtime-token change or repeated task assignment was used.
Actual notice IDs and reading reports are in
`verification/lead/requirements-v1.1-adoption.md`.
Existing P0-02/P0-03/P0-04, the P0-05 timestamp repair,
and P0-06A retain priority; this supplement does not replace their current states.

For **each of P0-08 through P0-13**, the lead's post-commit dispatch supplies the
exact specification baseline SHA. No uncommitted document is a worker baseline.
Workers can first inspect that SHA with `git show`; preserve ongoing work and
coordinate integration at a safe boundary, without reset or forced fast-forward.
Independent design documents and project-authored, test-only examples can proceed
after dispatch. Implementing a new shared protocol requires the versioned P0-08
contract commit and an explicit bounded implementation assignment. This adoption
does not start parallel implementation of a complete new API. Contract v0.1.0
remains unchanged; only the lead owns shared schemas, dependencies, locks and root
configuration, and only Backend owns migrations.

Teaching state (independent exploration, requested help, review) is independent of
NAV/ASK/WRITE input mode. Authorized writing may record process without requesting
an explanation. English-first teaching and persistent language preferences are
product behavior; Chinese engineering updates do not change that preference.
Retain original language, handwriting and source records. When a platform cannot
observe a step or reason, record the gap rather than reconstructing an invented
history. No new paid calls, account actions, publication or device access follows
merely from adopting these requirements.

The common evidence scope includes option selection/deselection/reselection,
text/formula edits, website canvases, external notes, owned canvases, captured-frame
drafts and switches among these entries on the same problem. Keep user input,
website-provided answers/grading and AI assistance separate. A correct option with
unknown reasoning is not independent mastery; process observation does not authorize
the AI to fill in or submit answers for the user.

R59/A44 requires the original website/Canvas/Notability screen to stay visible and
operable while the learner writes with this product's pen, and evidence that the
AI actually receives the composited view and available ink. Report supported
webpage overlays, Windows/macOS original-desktop layers (current priority, unverified), and arbitrary
iPad/iPhone native-app layers separately. Screen sharing alone proves none of
these. Unverified/unsupported paths retain the requirement without blocking all
other paths indefinitely. Owned canvases, frozen views and side-by-side drafts are
A45 fallbacks, never R59/A44 passes. Course notes still require editable original
ink, source/frame/video anchors, separate necessary AI additions and honest
Notability share/import status under R46–48/A26–28/A46.

## P0-08 / lead evidence and teaching-policy design

- Audio/screen increment at the existing safe handoff: AUDIO-01–15 / A47–49: coordinate the future versioned evidence, correction-status, source/role and cross-source alignment design in ADR 0002 §11. Keep v0.1.0 byte-compatible; do not mistake an unconfirmed correction for a superseding fact. See [coordination](#audio-screen-coordination).

Current candidate: [ADR 0002](adr/0002-process-evidence-and-presentation.md),
candidate 119108569377edccb606d148436c6962cb418ea6 received actual bounded
Backend/Learning/QA reviews. The concrete dispositions and next formal contract
boundary are in [integration evidence](verification/lead/p0-review-integration.md).
The first executable **capture-only 0.2.0** slice is in
[`packages/contracts/process_v2`](../packages/contracts/process_v2/README.md).
It formalizes operation/coverage submission, explicit version/capability and trusted
context checks, exact atomic ACK obligations, artifact-status separation and errors.
Its schema/validator/generated artifacts are executable; Backend's internal
provisional capture transactions are now integrated as `76f206c`. Opt-in control and capture-ingress HTTP factories are now implemented through
`6321d0c`; default deployment/producer activation and all presentation/assessment/
export families remain unimplemented. QA-14 malformed-nesting hardening preserves valid v1 wire shapes;
see [capture integration and independent review](verification/lead/p0-09-capture-integration.md).
See [milestone evidence](verification/lead/p0-08-capture-contract.md); design and
local validation do not establish runtime, DB or device acceptance.

- Goal: R51–59 plus R03/R08/R46–48; A30–46 and A26–28; G7, with G1–G6 preserved. P0 design
  enables the P1 single-problem loop, P2 teaching and P3 cross-device delivery.
- Baseline: exact specification SHA in post-commit dispatch; subsequent consumers
  receive a separate, exact shared-contract SHA and version.
- Write: `docs/adr/**`, `docs/tasks.md`, `docs/requirements-traceability.md`;
  shared contracts under `packages/contracts/**`, root generation checks and
  compatibility tests remain lead-owned. The authorized implementation continuation
  adds a separate 0.2.0 capture namespace without altering v0.1.0 or adding endpoints.
- Design ProblemAttempt, step/revision/branch links, observation coverage,
  AssistanceEvent, DiagnosisRevision and LearningPreference atop the existing
  identity/archive. Specify source/attempt/preference versions and permitted
  disclosure at request, cache and presentation time; stale cards and queued audio
  must not survive changed intent, attempt or device permissions. Separate actual
  observation, user explanation and AI inference; preserve unknown intervals.
- Include input-entry identity, option transitions, text/formula revisions,
  source-of-answer/grading/help attribution, same-problem links versus restart or
  topic change, and missing-DOM/event intervals. Design original-screen editable
  ink, composited-frame evidence, scroll/zoom anchors and share-stop boundaries
  separately from frozen-frame drafts. Carry lecture source/video references,
  separate AI layers and external export/import states through the same archive.
- Dependencies: existing contract baseline plus P0-09/10/11/12 findings; reconcile
  disagreements before committing a future version and compatibility plan.
  Current [consumer review inputs](adr/p0-08-consumer-review-inputs.md) pin the
  Backend/Learning assertions; this partial input map does not close the ADR.
- Acceptance/evidence: ADR with invariants, state transitions, ownership and
  migration/compatibility decisions; worked test-only traces for A30–46; explicit
  unsupported fields/paths and versioned follow-up tasks. Report design review
  separately from executable protocol tests and real-device/provider acceptance.
- Deliver: scoped commit, decision/evidence paths, unresolved questions and exact
  follow-up contract dependencies. No second identity or isolated problem archive.
- Current released boundary: [process control 0.2.1](../packages/contracts/process_control/README.md)
  supplies registration/current-state/restrictive command shapes, pure current
  membership/generation helpers and exact control replay obligations. Scope
  `process:control` and capability `process.control.v0.2.1` are explicit and
  distinct from unchanged capture 0.2.0. Stream ID already is the incarnation;
  fresh registration binds a one-use trusted start to that exact ID and pinned
  generations. No resume on old IDs; unknown stop blocks transmission until its
  independently evidenced pre-stop boundary is sealed. Control replay returns
  current state, never cached live state. The opt-in control HTTP factory is integrated as `1b6a94d`; capture-ingress
  0.2.4 is integrated through `6321d0c`. Default routes remain off.
- Next owner: Backend runs the bounded real PostgreSQL ingress HTTP/API restart
  check in the current continuation table; the internal registry/resolver is
  already integrated, not a new assignment.
  Lead retains typed artifact upload and subsequent attempt/revision/permission/
  presentation/linked-v1 contracts. These future families do not block the released
  internal control segment. Existing `76f206c` ingestion/`ca5c459` contention
  evidence and Web/QA work remain; no duplicate ingestion or acceptance claim.

## P0-09 / backend process persistence

Completed bounded continuation after reviewed ingress/API restart `3debf1c`:
one **internal authorized process-context reader** for existing stored capture
records, exact source versions and Frames. The current Learning
`compose_process_context(batch, sources, frames, resolver, user_id=...)` needs
coherent authorized metadata; manual sequential transaction reads in the lead
composition probe are fixture-only. This reader closes that concrete dependency,
not provider delivery or a new shared protocol.

- Inputs: authenticated owner plus an explicit nonempty, unique list of at most100
  existing record IDs (engineering bound). One provisional-session device/session/
  stream incarnation per call; preserve requested array order without claiming
  chronology. Load immutable records from the archive, never trust supplied record
  bodies. Return only existing released ProcessBatch0.2.0, exact DisplaySourceSnapshot
  0.2.3 / supported existing source shapes and Frame shapes in an internal tuple or
  small structure. No new serialized schema, family or migration; unsupported scopes
  fail explicitly. No second archive, generated Observation/URL, inferred problem or
  presentation authority.
- One existing actor transaction checks a required current caller authorization
  guard, ownership, current source access/tombstones and exact retained record/source/
  frame bindings. Preserve all original operation/evidence/causal-parent fields;
  parents outside the selected set stay unknown, with no recursive history invention.
  Missing, corrupt, foreign or inconsistent committed metadata cannot become a partial
  success. Metadata is finitely bounded (at most4MiB engineering ceiling), with refusal
  rather than truncation. No writes, new capture or unbounded full-archive scan.
- Scoped Stop permits authorized historical reads and never grants fresh/live status;
  current source/account revocation or deletion withholds the metadata. Return detached
  values. Existing AuthorizedImageResolver rechecks exact bytes in its own current
  transaction. The result is a historical/context read, not durable future authority:
  caller must recheck all sources at final use. Do not change Learning's not_attested,
  unknown-completeness or not_granted flags or introduce provider/live attestations.
- Write only existing Backend `services/api/**`, module tests and
  `docs/verification/backend/**`; current contracts, Learning source, root/dependencies,
  production HTTP mounts and all user-preview/Paperclip data remain untouched.
- Verify actual in-process HTTP registration/original/frame commit → new reader →
  existing Learning composer gives exact PNG/source/records with separate editable
  ink references. Include requested-order/copy/boundary checks, mixed/foreign records,
  missing/corrupt retained metadata, auth changed under transaction, Stop/history,
  revoke/delete refusal, no writes and no publication of a failed snapshot. MemoryStore
  transaction probes are appropriate; no repeat real-DB restart campaign is required
  merely for this read-only callable. Report their evidence level honestly.
- Relevant R07/R29/R30/R35/R36/R46/R51/R52/R58/R59 and
  A12/A14/A16/A30/A31/A44; both core gates remain open. Exact baseline `da22f8bdd755450de788826862987fb2e2068625` is pushed. Native
  assignment `handoff_7307a07d2a0b309f41692b59f316e66b` has actual start
  `handoff_1b551b8d9ff66108fa1a471c6759db2c` at2026-09-29 17:16:43 UTC:
  Backend reports normal merge `eecb580`, clean starting tree and full card/call-flow
  reading. Actual delivery `handoff_0ac12fbec712dc82c584004f54445ff6` at17:29:50 UTC supplies `4b5b768` (parent `eecb580`): reader,55 new tests and owner evidence. Owner reports207 original focused passes. Independent review reproduced a historical binding-generation inconsistency. Actual repair `handoff_2cd529713117fd4bd4f1afc6770be449` / `9e40baa` closes it with nine independent checks; validate the retained display incarnation, not today’s account generation. Base/repair integrate as `c607c58`/`5360b42`;209 focused main checks pass. [Review](verification/lead/process-context-reader-review.md) retains the original failure; [integration](verification/lead/process-context-reader-integration.md) separates owner/independent/main evidence. Next owner is Learning for the scoped read/compose/recheck consumer below after exact release.

Historical initial persistence/control handoffs below are retained evidence, not
new duplicate assignments. Current control, typed-original, shared-display and
opt-in ingress implementations are integrated as recorded in the top continuation.

Initial implementation: owner `75f4e33` integrated as `76f206c` after production
and migration review. Internal provisional ingest/read/replay/deletion uses the
released capture-only 0.2.0 contract; no production resolver/upload/HTTP activation.
Owner's initial 26 real PostgreSQL groups establish ordered outcomes. Follow-up
`17a7dc8` integrated as `ca5c459` records actual waiter/blocker/transaction-ID
observations before release in all four stop/delete orders, plus timeout/error
cleanup; the owner ran 27 real-DB groups. Lead portable checks and pending
independent QA remain separate in the [current review](verification/lead/p0-index-output-review.md).
Applied migrations and production store/API are unchanged in that follow-up.
Backend's next **internal persisted control/resolver** segment can consume the
released [0.2.1 control slice](../packages/contracts/process_control/README.md)
after its delivered atomic snapshot export. Exact formal baseline
`9a861d05141bfbf9bdf6465d96392ee047edc408` was pushed; native continuation
`handoff_b89501b25fff47ce5f8452665468a033` is accepted (execution not inferred). It need not wait for typed uploads or all future families. Implement in
existing Backend paths/actor transactions: durable registration and monotonic
stop/seal/withdraw state; owned device-session membership/generation resolution;
exact-ID one-use start grants from an explicit trusted internal entry; idempotency
returning transaction-current state after current access checks; committed-floor
and independent producer-stop facts; mapping into unchanged capture 0.2.0.
Backend alone owns any additive migration; retain old rows and rollback readability.
No public start-grant API or provider/capture activation is authorized by this slice.
Never turn body booleans, two existing IDs or highest received sequence into proof.
Test delayed uncommitted start across revoke/regrant, same-key changed command,
current-state replay after stop/withdraw, unknown/sealed boundaries, fresh restart,
new generations, source deletion and both actual commit orders against existing
capture ingestion. Report portable and real-DB evidence separately using the
existing dedicated instance; do not recreate it. HTTP wiring and typed uploads
remain subsequent bounded work; later record families below remain design only.
The existing test resolver is not production registration.

- Audio/screen increment at the existing safe handoff: R60 / A47–48; AUDIO-02–04/07–08/13–15, AVTEST-01/02/05/07/08/11: preserve original oral attempts, transcript candidates and reversible correction/role history, original utterance time versus correction time, source gaps and scoped late backfill. No permanent recording expansion; production fields await P0-08. See [coordination](#audio-screen-coordination).

- Goal: R51/R52/R53/R54/R55/R57/R58/R59 and R46–48;
  A30–31/A34/A37–38/A40/A42–46, linked A26–28; G7/G5 supporting persistence,
  later P1 recovery and P3 synchronization.
- Baseline: exact adopted-specification SHA in post-commit dispatch; implementers
  must additionally consume the future P0-08 contract commit.
- Write: `services/api/**`, `services/worker/core/**`, module tests and
  `docs/verification/backend/**`; shared contracts/root files stay lead-owned.
  Backend alone owns any later database migration; none is required merely to
  submit this design.
- Design append-only observed steps, editable-ink revisions, parent/branch and
  replacement links, device sequences, correction/diagnosis versions and coverage
  gaps. Define idempotent offline replay, CAS, atomic cancel/intent-change checks,
  deletion tombstones and prevention of stale output/permission revival. Do not
  order cross-device process solely by wall clocks or claim an unobserved step.
- Design durable entry/attempt links for option changes, text/formula editing,
  webpage canvas, external notes, owned canvas and captured-frame drafts. Keep
  user input, website answers/grading and AI help distinct; reconnect or switch
  entries without inventing missing actions or collapsing a restart into the old
  attempt. Preserve original-screen editable ink, source/frame/video positions,
  composite visibility evidence, independent AI additions and Notability export
  versus actual-import evidence; a rendered image cannot replace editable ink.
- Design durable `AssistanceEvent` facts linking the actual help displayed/played
  to its attempt/step version, the user's request scope, permitted disclosure at
  that time, and actual assistance extent. Preserve the evidence needed to
  distinguish self-correction, correction after a hint and completion after seeing
  a solution. Generation, cache storage, queueing, withholding or cancellation
  alone does not establish actual presentation; preserve partial presentation
  when observed. Unknown presentation stays unknown, and display or
  playback does not establish understanding or independent mastery. Field names
  and protocol details remain for P0-08; this is a persistence-design requirement.
- Dependencies: review the received P0-04 delivery and prioritize its required
  fixes before this design; consult P0-08 and learning/platform evidence. A
  persistence proposal and test vectors can precede the new contract;
  production endpoints and schema changes must wait for it.
- Acceptance/evidence: data/transaction design plus deterministic race sequences
  for duplicate replay, branches, cancellation, language override, deletion and
  restart recovery. Include A37 vectors for no help, an actually presented hint,
  an actually presented solution, and generated-but-never-presented/unknown help;
  verify that retained request/permission/actual-help facts support learning-layer
  classification without promoting assisted completion to independent mastery.
  Add A42–46 vectors for entry switches, unknown reasons after a correct choice,
  missing DOM/events, original-screen versus frozen ink anchors, share stop,
  source recovery, separate AI layers and export/import state. Persist evidence
  for A44 without claiming that storage alone proves a working overlay.
  Define separate real PostgreSQL migration/concurrency tests;
  missing DSN remains untested, and an in-memory result cannot be PostgreSQL PASS.
- Deliver: scoped commit, model/transaction diagrams or tables, test-only vectors,
  commands actually run, remaining contract/database dependencies and limitations.

## P0-10 / learning exploration policy and process evaluations


### Current bounded P0-05/10 continuation — stored context preparation

**Integrated component; next owner is lead for the pending native/Web integration.**
Original assigned exact pushed baseline
`7dfb9eaaf6ec7cf6e8c44ebb6fe31d59849cc8d1`; native assignment
`handoff_adb3251867602a8520c131e1df784f26` is accepted. Actual start
`handoff_77b24841fbd8fe312b0b0cc300184ce4` at2026-09-29 17:52:11 UTC confirms
full task/affected-clause reads and normal baseline merge
`ae4ebd5e5a229644f03716520ab43d8a02b43c3f`. Actual delivery
`handoff_6723d6dd2ad532894425bb2d4f46a580` / `cd2533b` integrates as `65fa1a2`.
Its unskipped actual-adapter cancellation regression first failed while 40 other
checks passed. Backend delivered `09669d6` in
`handoff_58afd26b636b553d5fa3f6adbf52ee56`, integrated as `dcc6039`.
Independent review approves both: the same 15 adapter probes now pass; all 41
consumer checks and six added boundary probes pass on the isolated combination.
On integrated main `65fa1a2`, **190 focused checks passed in 17.38s**. Historical
failure evidence is retained. [Combined evidence](verification/lead/stored-context-preparation-integration.md).
No repeat reader/consumer task or provider activation is assigned.
Outcome: one callable prepares process/image evidence from explicit stored IDs and
withholds the whole result if access or retained metadata changes during composition.
This closes the current caller omission; it is not an external provider, live-screen
service or new store. R07/R29/R30/R46/R51/R52/R58, A12/A14/A16/A30/A31 and both
open core gates remain the scope.

- Reuse the released Backend `AuthorizedProcessContextReader` through an injected
  callable and existing `compose_process_context` plus current image resolver. A
  small function in the existing Learning module is sufficient; no class/service,
  cache, new identity/archive, new wire schema or dependency is needed. Backend
  imports belong in integration tests/examples, not a competing Learning reader.
- Freeze/copy the explicit requested IDs; require the current-authorized reader,
  get the complete coherent metadata, and compose with existing limits. Immediately
  before returning, invoke that reader again on the same full selection and verify
  identical canonical metadata. Recheck even frameless/budget-omitted sources;
  image authorization alone does not cover source text or quoted reasons. Missing,
  changed or denied final read rejects the whole result without a partial packet or
  retry loop. Cancellation propagates unchanged. Returned values are detached.
- Preserve original records, PNG bytes, source/frame/clock/parent relations,
  requested order and explicit omission/gap evidence. Do not reinterpret selection
  order as chronology, references as editable ink, or unknown reasons as mastery.
  Keep all current `not_attested`/`not_granted`/`unknown` packet flags unchanged.
- This is an authorized preparation at its last check, **not atomic provider
  dispatch or durable future-use permission**. No caller callback or network send
  is introduced. Any queued, cached or later send/display must recheck current
  source and help permission at that actual boundary; no such activation here.
- Write only `services/learning/**`, relevant `tests/evals/**` and
  `docs/verification/learning/**`. Preserve frozen originals/queries/labels/failure
  evidence; no Backend/root/shared-contract edits or user-preview/Paperclip data.
- Focused evidence: actual in-process HTTP stored PNG/process -> new callable ->
  exact packet; source/account revoke/delete or token expiry during resolution,
  frameless source revoke, changed/corrupt final snapshot, source omitted by
  budget, cancellation, input mutation and detached-result controls. Stop permits
  currently authorized historical context without making it live. Use existing
  MemoryStore/ASGI fixtures; no repeated PostgreSQL or provider/device campaign.
- Deliver one scoped commit and actual commands/results. Lead reviews/integrates;
  actual final provider/presentation wiring retains its named permission/connector
  dependencies. No new paid call, supplier choice, model change or preview restart.

Historical evaluation/design scope below stays open and is not redispatched by
this concrete implementation continuation.


- Audio/screen increment at the existing safe handoff: R60 / A47–49; AUDIO-01–12/14–15, AVTEST-01–12: extend existing case design with context-assisted ASR repair versus actual reasoning error, correctable speakers, quiet-professor loss, tentative acoustic cues, and bounded same-input quality comparisons. Preserve current reconciliation; provider evaluation remains unexecuted until an authorized available route exists. See [coordination](#audio-screen-coordination).

- Goal: R51–59; A30–46 supporting teaching/evidence cases; G7, with G6 still
  requiring its own candidate comparison and platform acceptance owned separately.
  P0 supplies cases/policy; P1 adds requested help and review, P2 targeted practice.
- Baseline: exact specification SHA in post-commit dispatch. Finish the P0-05
  timestamp correction before new work; runtime adapters await P0-08's version.
- Write: `services/learning/**`, `services/worker/learning/**`,
  `tests/fixtures/memory/**`, `tests/evals/**`, `docs/verification/learning/**`.
  Keep process cases versioned and distinct from the frozen P0-05 retrieval set;
  do not overwrite its originals, labels or failures to improve a new result.
- Prepare at least 30 project-authored, test-only process cases with independent
  labels: rapid edits, rollback, branches, valid alternative methods, invalid
  reasoning with a correct answer, missing frames and unknown motives. Cover
  independent exploration, local checking, minimum sufficient hints, explicitly
  requested solutions, user-corrected diagnosis and persistent/temporary language.
- Include selection/deselection/reselection and text/formula editing across
  websites/canvas, external notes, owned canvas and frozen drafts; distinguish
  the same problem, a new attempt and a new problem. Label learner input, website
  solutions/grading and AI help independently. Correct choices with unknown
  reasons remain unknown; seeing a composite is different from inferring unseen
  ink. Cover A44/A45 evidence distinctions and A46's original/AI note layers;
  synthetic examples do not verify live annotation or Notability import.
- Design assistance evidence distinguishing self-correction, hint-assisted work,
  following a solution and independent transfer. Skipping practice is not failure
  and assisted success is not evidence of independent mastery. Keep teaching
  English-first with original technical terms and brief Chinese hints where useful.
- Dependencies: draft cases and policy before P0-08 if useful; protocol-dependent
  execution waits for the committed contract. QA independently reviews relevance,
  mathematical correctness and semantic leakage; the producing model cannot be
  its own sole judge. No new paid/model executor is enabled by these examples.
- Acceptance/evidence: frozen inputs/labels and provenance, reproducible rule
  checks, retained failures and a plan for independent semantic review/user trials.
  Report step retention, order/branch accuracy, valid-method false positives,
  unsupported diagnoses and disclosure violations separately. Targets on the fixed
  set: zero premature answer disclosures, fabricated steps and false independent
  mastery labels; unexecuted semantic checks stay untested, not zero failures.
- Deliver: scoped commit, sample/coverage counts, evaluation commands/results,
  reviewer disagreements, failures and unverified model/real-course behavior.

<a id="deferred-learning-optimization"></a>

### One deferred follow-up — P0-10/P0-13 evaluation-first optimization

**State: deferred; direction registration only, no dispatch or execution.** User
endorsed Agent Lightning as a later candidate on 2026-09-29 UTC. Full read source:
`work/learning-optimization/proposal.md`, SHA-256
`c66fd584cb546f02e7af7bd6547ee0f3a59d0e01a6e46dcad2d11f278a3cce48`.
This one follow-up connects later P1-03 understanding and P2-04 purpose
classification; it does not reprioritize iPad build/ink/install or current QA.

Learning owns later candidate/evaluation implementation in existing learning/eval
paths; QA independently validates an actual released candidate after current work.
Reuse existing archive/context, tests/evals and AVTEST/INTENT/G7 IDs. No second
identity/archive/evaluation service, framework or frozen retrieval-fixture tuning.

- Audio/screen: AUDIO-01–04/07–12, AVTEST-01/02/03/07/08/09/10. Accent, quiet or
  hesitant/code-switched speech, negation, self-correction, unknown speakers,
  absent audio and stale/conflicting screens; paired present/absent or stale
  context. Preserve actual words, errors, reversible candidates and provenance;
  missing input and misinterpretation are different failures.
- Purpose: INTENT-NOTE-CLASSIFICATION/ANSWER-PROMPT/HOMEWORK-CHOICE/FAITHFUL-EXPORT
  and applicable A30–46. Mixed/corrected intent, uncertain completion and pauses;
  display does not determine purpose. Retain drafts, do not auto-export them;
  actual completion prompts real available destination/preview, never submission.
- Help control: G7/A30–46 and AVTEST-08/12. Exploration, smallest hints, revoked
  requests, stale/cached output and ordinary writing/erasing across cards, titles,
  notifications and voice. Preserve English-first teaching; leaks and fabricated
  reasoning/mastery are failures even with a correct final answer.

**Activation gate / lead:** an editable callable learning path, valid permitted
replay inputs and human-reviewed reference labels, authorized available provider
access, and an explicit enforceable run/call/iteration/cost cap within the existing
budget. No new spend budget was granted; larger draft experiment counts are not
spend authorization. No skill installation, paid evaluation, sample collection or
new worker task now. Review/pin actual Agent Lightning revision before any later
bounded use; its proposed v1.0.1 optimization Skill is a candidate, not a selected
provider, closed-weight training permission or measured savings claim.

Freeze code/model/prompt/configuration, inputs/labels and scorer before comparison;
start one family, one change, small representative scope. Separate development and
protected held-out cases, grouping related utterances/sessions against paraphrase
leakage. Model agreement is not human ground truth; no scorer/label tuning to favor
a candidate. Predeclare thresholds/repetitions; retain failures and per-case
critical errors, omissions, task success, latency and actual usage/cost. Any critical
regression blocks adoption; averages cannot offset it and finite zero failures do
not prove universal safety. Keep the baseline unless held-out improvement is real.

Use permitted or clearly synthetic samples with provenance/retention scope. Private
user/lecture audio, screens, answers and transcripts stay out of this public repo;
no new collection/upload provider or full-session recording is authorized. Keep
AUDIO-13, deletion/revocation, unknowns and original evidence intact. Synthetic,
recorded-sample, simulator, live device and real provider evidence stay distinct;
missing capture/access cannot be certified by synthetic success.

## P0-11 / Native macOS G7 input and original-screen implementation

- Current implementation follows the macOS row above. IOS-INK-01 and later
  native control checkpoint `4cc605a` remain retained mobile evidence, not current
  mobile dispatch. Existing source/ink preservation and public-API limits survive.
- R60/A48 and AUDIO-05–09/13–15, AVTEST-03–07/11 require actual macOS system
  playback plus authorized microphone/environment and headphones, separately from
  the deferred iPad variant. Screen/camera and audio legs are distinct; neither
  compilation nor a meter is comprehension evidence. No saved-record prerequisite.

- Goal: R51/R52/R53/R56/R57/R58/R59 and R03/R08/R46–48;
  A30–34/A36/A40–46, linked A26–28; G7 alongside G1/G2/G3/G5.
  P1 needs a supported macOS path and the parallel Windows path; P3 retains cross-device work and later mobile variants.
- Baseline: exact adopted-specification SHA in post-commit dispatch; keep P0-03
  priority and consume P0-08 only when a shared protocol is ready.
- Write: `apps/macos/**`, native module tests and `docs/verification/platform/**`.
  Do not edit shared contracts, root dependencies or other roles' modules.
- Investigate separately external Canvas/Notability/Safari visual observation and
  desktop-owned structured pen operations (mobile Pencil variant deferred). Do not infer an external app's undo
  stack from screen sharing. Specify visible/missing intervals, blur, freshness,
  rapid erase/undo/redo/page switches, explicit stop, offline replay and immutable
  original ink. Keep teaching-state controls separate from normal input modes.
- Separately investigate this product's real-time pen on the still-visible,
  operable original website/Canvas/Notability screen and whether the actual AI
  input contains the composite and available strokes. Test scroll/zoom anchoring,
  touch navigation, share stop and source/video recovery. Current macOS cross-app layers require actual public-API evidence; deferred iPad and iPhone arbitrary
  native-app layers remain unsupported/unverified as documented; sharing pixels does not
  grant overlay/input access. Distinguish website layers, native-app layers, owned
  canvas and frozen/side-by-side drafts, with explicit stale/frozen state and a
  one-step return to the original page. A45 fallback success cannot pass R59/A44.
- Extend A46's lecture-note path from original-screen writing to retained editable
  ink/source/frame/video anchors and separate necessary AI additions, then actual
  Notability share/import. Prepared/shared is not imported; export images/PDFs do
  not establish editable Notability strokes or replace the app's editable original.
- Dependencies: actual build/runtime evidence for the claimed path; P0-08 for
  shared wire integration. The current macOS capture slice can proceed concurrently
  with Support's desktop build wiring. Fix actual compile failures before adding
  further native features; do not wait on unrelated audio/provider contracts.
- Acceptance/evidence: versioned capability matrix, human-reference process and
  exact build/device steps for each path. When runnable, report observed/lost steps,
  resolution, freshness, capture/sync/recognition/reasoning/display latency, power
  and cost separately. Missing device/build access stays untested; explicitly label any
  owned-canvas fallback without substituting it for original-screen acceptance. Report R59/A44
  separately by platform; retain unsupported/unverified targets and continue usable
  paths rather than waiting indefinitely for universal overlays.
- Deliver: scoped commit, sources/dates, measured versus documented results,
  fallback/return-flow plan and concrete missing environment or device inputs.

## P0-12 / Windows original-screen input and disclosure controls

- Audio/screen increment at the existing safe handoff: R60 / A47–48; AUDIO-03/06/08–09/13–15, AVTEST-01/02/04/06/07/08/11: after current W1/P0-12 repairs, link permitted screen/caption/media-time evidence and actual audio-source gaps to the existing plan. Subtitle textTracks, a camera preview or moving meter do not establish received playback audio. Quiet teaching and current disclosure guards still apply. See [coordination](#audio-screen-coordination).

- Goal: R51/R52/R53/R56/R57/R58/R59 and R03/R08/R46–48;
  A30–34/A39–46, linked A26–28; G7 with G1/G3/G5 boundaries.
  P0 now implements the bounded Windows slice above; released contracts apply and any new wire field waits for a lead-owned additive release.
- Baseline: exact specification SHA in post-commit dispatch; preserve P0-02
  priority and wait for P0-08 before implementing new shared message fields.
- Write: `apps/windows/**`, its module tests and `docs/verification/web/**`;
  preserve reviewed `apps/safari-extension/**`. The bounded app package/lock
  delegation above is explicit; no other root/shared/dependency edits. Windows
  is a first-class full-product target, delivered through bounded implementations.
- Plan attempt/source/preference version binding, explicit exploration intent and
  disclosure checks on requests, caches, rendering and queued voice. Cover old
  full solutions, user correction, topic change, "let me try", cross-device intent
  changes and disconnection. Titles, notifications, diagrams, supplements and
  review summaries must follow the same disclosure boundary as card text.
- Plan option selection/deselection/reselection, text/formula edits, website canvas
  and same-problem entry switches. Cover missing DOM, iframe and shadow-root access
  boundaries without inventing operations or auto-filling/submitting answers.
  Distinguish user input, website answers/grading and AI help in each trace.
- Investigate supported webpage overlays where the original page remains visible
  and operable, editable strokes keep scroll/zoom/source anchors, and the AI
  demonstrably receives the composite/available ink. Test share stop explicitly.
  Keep frozen/side-by-side drafts labeled and provide a one-step return; A45 cannot
  certify A44. Windows original-desktop annotation is current P0/P1/P2 work,
  independently unverified until measured; P3-02 retains later hardening only.
- Dependencies: released P0-08 contracts and P0-10 semantic cases for their actual
  consumers. Windows capture/input does not wait for P0-11/macOS runtime evidence;
  only a concrete cross-platform integration needs the corresponding Mac result.
  Independent Windows implementation and verification proceed;
  do not turn NAV/WRITE into automatic explanation triggers or intercept fingers.
- Acceptance/evidence: local deterministic invalidation/state-machine test plan,
  semantic-leakage review checklist and G7 process/fallback matrix. Record DOM,
  iframe/fullscreen/cross-origin and real capture differences. Desktop results
  cannot establish iPad/Pencil behavior, and a correct hint-level enum cannot
  establish that its text/image/audio content avoids leaking the answer.
  Link A46 lecture-note evidence to native export/import owners: retain original
  ink and source/frame/video anchors, separate AI additions, and report Notability
  prepared/shared/imported states without claiming an unperformed import.
- Deliver: scoped commit, trace fixtures/planned checks, actual commands/results,
  platform limitations and the exact contract/device checks still required.

## P0-13 / QA independent problem-solving acceptance design

- Preserve all completed independent retests. QA-IOS-01/mobile follow-ups are
  deferred with their evidence; current next work is the exact runnable Windows
  candidate above, followed by separately available macOS runtime acceptance.
  The single [deferred optimization follow-up](#deferred-learning-optimization)
  shares this card's later independent evaluation ownership; it is not active work.
- Audio/screen increment at the existing safe handoff: R60 / A47–49: cover AUDIO-01–15 / all AVTEST-01–12, including live-device versus recorded-sample evidence, headphone playback, critical-word/negation failures, correction history, professor retention versus reply suppression, and stop/late-audio races. Keep independent product execution not_run; documentation review and DT-G3 probes are not acceptance. See [coordination](#audio-screen-coordination).

- Goal: R51–59 plus R03/R08/R46–48; independent A30–46 and linked A26–28 coverage
  and G7 evidence, preserving existing
  G1–G6/P0-06A acceptance boundaries and later P1/P2/P3 stage distinctions.
- Baseline: exact specification SHA in post-commit dispatch; review future runnable
  candidates only at their separately supplied fixed integration commits.
- Write: `tests/e2e/**`, `docs/verification/qa/**`. Read other roles' fixtures and
  return corrections to owners; do not change their production code or labels.
- Dependencies: P0-06A first; independent matrix/case review may begin before
  P0-08, while protocol execution awaits its commit and runnable candidates.
- Acceptance/evidence: map every A30–46 to fixtures, expected evidence, owner,
  deterministic checks, independent mathematical/semantic review and necessary
  real-device/user steps. Review at least 30 P0-10 cases for reference-process
  adequacy, valid alternative methods, missing evidence, actual disclosure and
  help-versus-mastery distinctions. Keep disagreements and failures visible.
- A42/A43 cover choices/edits/canvas and same-problem entry changes, unknown
  reasons, website-versus-user-versus-AI attribution, restart/topic ambiguity and
  missing DOM/events. A44 requires original-page operability, this product's live
  ink and actual composite visibility to AI, scroll/zoom anchors and share stop;
  validate webpage and Windows/macOS desktop layers separately; retain deferred
  iPad/iPhone native-app cases without assigning another mobile campaign.
  A45 verifies clearly labeled frozen/side-by-side drafts and return navigation,
  and must never be counted as R59/A44. A46 links A26–28 to the complete lecture
  note path and actual Notability import, keeping editable originals and AI layers.
- Fixed-set acceptance requires zero premature disclosures, fabricated steps and
  false independent-mastery labels, with explicit denominators and reviewed cases;
  zero executed cases is untested. Separate each G7 input/annotation/fallback path, device/application,
  source implementation, compilation, automated checks and real verification.
  Limited samples do not establish universal correctness or real-user efficacy.
- Deliver: scoped commit, A30–46 matrix, independent label/content review evidence,
  reproducible failures and precise blocked device/provider/user-trial conditions.

## Stage milestones retained and extended — both desktop OSes first

| Stage | Additional problem-solving delivery | Existing delivery retained / completion boundary |
| --- | --- | --- |
| P0 | P0-08–13 design, multi-entry synthetic cases, G7 process/annotation/fallback plans | Existing G1–G6 work continues; implement/verify Windows/macOS paths separately from webpage layers and retained deferred iPad/iPhone cases. No synthetic or fallback result is an A44 pass. |
| P1 | One real problem on each explicitly supported Windows/macOS path, preserving entry/attempt identity through requested help, review, save and next-day recovery | Require Google Calendar, persistent URL/usable Canvas connection, actual-course point-reading, real voice, usable local notes and next-day memory together under specification §12; P0-07 alone cannot close P1. A usable owned-canvas or A45 fallback can advance this loop but does not pass R59/A44; original-screen annotation status remains separate, without waiting for every platform. |
| P2 | Targeted practice, assistance-aware mastery and richer branch diagnosis | Retain the original lecture-note/Notability delivery: editable ink plus source/frame/video anchors, separate necessary AI additions, actual share/import evidence under A26–28/A46. |
| P3 | Synchronize process/help permissions across Windows/macOS; later extend the retained mobile variants | Keep media/background/calendar/budget scope. Desktop annotation is already a current P1/P2 implementation priority; arbitrary iPad/iPhone native-app overlays remain deferred and individually unverified/unsupported until measured; neither webpage success nor a fallback certifies them. |

P4 work-agent delivery remains as specified. New milestones and all R51–59/A30–46/G7
rows remain unimplemented and unaccepted until their respective evidence exists.

## Current audit adoption and existing P0 handoffs

Read [intent and confirmed decisions](requirements/intent-and-decisions.md) and
[original-goal verification](requirements/original-goal-verification.md), together
with the relevant original clauses. Current display mode, content purpose and
archive destination are independent; Q-INK-DISPLAY, Q-NOTE-EXPORT-SCOPE and
Q-HOMEWORK-DESTINATION are all answered, including the timely final-answer prompt.
The original R01–R50 traceability rows are now rewritten by behavior/owner/stage,
not preserved as generic grouped mappings. Every new V-/INTENT- definition is
unexecuted/unaccepted. Documentation adoption does not close any application gate.

These are bounded updates to existing cards, not new dispatches or a change of
priority. Preserve current branches/work and coordinate the safe handoff with lead.

| Existing card | Increment from the confirmed decisions and audit |
| --- | --- |
| P0-08 Lead | Design independent display/purpose/destination, uncertain completion and refusal/de-duplication, original/organized versions and real destination evidence; compatibility/version plan still precedes code. Track all original goals through backlog, not only R51 onward. |
| P0-09 Backend | Preserve both ink display anchors, source, purpose evidence/corrections, question/assignment/version, completion/choice/refusal and export/import states without overwriting raw attempts. Review learning fd5162b C1–C4 on late help, repeat-attempt exposure, deletion-derived invalidation and separate receipt types; future shared relations await P0-08. |
| P0-10 Learning | Add only needed coverage at a safe boundary for context-based note/draft classification, corrected/mixed purpose, actual versus guessed completion, faithful user answer and independent-mastery evidence. Keep ordinary course proactive teaching/supervision/preparation separate from scoped exploration. Reconcile the actual Backend 65-case and QA 37-case findings without overwriting original examples; retain later QA 28-case review. |
| P0-11 iOS | Continue current research: two display modes separately, source retention, normal touch and actual composite receipt; plan timely completion/available-destination UI and honest import, without universal native overlay claims. P0-03 source review/build/device gaps remain separate. |
| P0-12 Web | Existing P0-02 repair review first; extend the existing plan to both display modes, topic changes, mixed/corrected purposes, real available choices and stop boundaries. Do not auto-fill/submit or equate a fixture with a course. |
| P0-13 QA | Retain P0-06A and 65-case independent reviews; map five INTENT cases and original V- cases to future phase evidence. Two-mode/cross-purpose combinations, final-answer refusal, source association and actual import require behavior evidence, not labels. |

The operator reports the user replenished Claude quota and existing sessions
resumed; subsequent native Web/iOS/QA messages are actual delivery evidence.
Prior rate-limit failures remain historical, not a permanent blocked status.
Per-role future capacity is not guaranteed. The separately installed quota
recovery automation is operator-owned; do not install another one or repeatedly
wake failed chats for notification. The earlier adoption turn's native list had only the original five worker routes.
The subsequent authorized turn now returned the support route as well; SUP-01
below records its bounded first task, without expanding other owners' scope. Current model/effort and permissions stay.

The semantic-audit specification commit is `44e60ec289717e155fb0f4374784c791bf23689c`,
pushed and verified on origin/main. Five actual async notices were accepted;
those receipts alone do not establish reading. Web later explicitly confirmed the exact SHA in handoff_95b6c68d278cd2b92dd70363a8724c23; Learning handoff_d30643e5a2530082c3dede502930ca7f and iOS handoff_db6dcd7d6428e539e6a4189b67e431ab also confirm that SHA; Backend/QA complete new-spec reads remain unconfirmed. Evidence and precise per-role
handoff IDs: [semantic adoption](verification/lead/requirements-semantic-audit.md).
Backend next handles the existing P0-09 C1–C4 design follow-up; Learning first
re-reviews cdc354c under the existing P0-02 boundary review, then reconciles current
P0-10 semantic findings. Existing iOS/Web/QA cards continue; no duplicate task IDs.

<a id="audio-screen-coordination"></a>

Current follow-through at pushed `80b99cc`: independent QA/Backend/Learning evidence
is integrated as described in the [continuation record](verification/lead/qa-continuation-2026-09-28.md).
Web's existing P0-12 repair continues under `handoff_bb3179fd65457fcab0cef5f07db7226b`;
Backend's next P0-09 C1–C4/INTENT gap coverage was accepted as
`handoff_bf3c74aebc53135c2adb482172571b4e`. These are scoped continuations, not new
task IDs or completed repairs. Lead formal shared-contract work remains separate.

Historical final-decision receipts are retained in the [normalization record](verification/lead/audio-final-decisions-normalization.md). Backend `cad63a1` and Learning `3bb5e29` with their normalization follow-ups have since been reviewed/integrated. Web `cb0f89b` hold was resolved by reviewed `ec18580` and integrated as `1c669ed` → `a09c43e`; seek/tie/gap model checks pass. The existing D1/ORG-3/EO-1 repairs remain active and all AVTEST cases remain not_run. Current exact states are in the task rows and [capture milestone](verification/lead/p0-08-capture-contract.md); do not repeat completed packet reviews.

## Audio/screen interpretation increment — existing cards only

Start at [current effective decisions](requirements/intent-and-decisions.md#current-decisions), then the complete [audio specification](requirements/audio-screen-interpretation.md), R60/A47–A49. [Source history](requirements/history/audio-screen-discussion-2026-09-28.md) preserves exact discussion without competing instructions. Required live screen/classroom/playback understanding includes a quiet personal microphone without professor dropout and additional/changing speakers. Current delivery targets: Windows and macOS; the retained later mobile target is iPad Pro 13-inch (M5), iPadOS 26.5. Microphone/camera choices and modes remain unverified engineering options. Live listening needs no saved-record/upload/replay prerequisite; durable source context and authorized buffers stay distinct.

| Existing owner/card | Bounded next design or validation step | Product phase / evidence boundary |
| --- | --- | --- |
| Lead P0-08 | ADR 0002 §11 records actual v0.1.0 gaps. Design source spans, proposed/confirmed/rejected correction history and speaker-role revisions without losing original timestamps; separate cross-source alignment from strict same-source frame identity. | Future versioned contract remains a separate deliverable. No new runtime fields/endpoints in this documentation integration. |
| Backend P0-09 | AUDIO-02–04/07–08/13–15; AVTEST-01/02/05/07/08/11 persistence and stop/deletion vectors. Preserve actual audio/transcript relationship during authorized buffering, oral attempts and unknown source/role gaps; never treat every correction as confirmed. | P1-04 source continuity, P1-03 live evidence, P3-01 cross-source recovery; migration and real PostgreSQL evidence remain separate. |
| Learning P0-10 | AUDIO-01–12/14–15; AVTEST-01–12 policy/quality cases. Acoustic cues require actual audio; transcript-only fallback names missing cues. Same-input available native-audio and ASR-plus-multimodal comparison uses human-reviewed meanings and unknowns, critical failure counts, latency and actual cost. | P1-03 interpretation; P1-04 faithful recovery; G4 route availability and P3-01 joined evidence. No provider selected by reputation, paid calls, threshold or sample count mandated here. |
| Native/macOS P0-03 → P0-11 (mobile variants deferred) | AUDIO-05–09/13–15; AVTEST-03–07/11. Plan live room mixture, actual playback plus microphone/headphones, missing lecturer content, correctable attribution, source-specific stop and displayed camera legibility/time. | G3/P1-03, later P3-01. DT-G3-05/11 help identify paths; neither proves comprehension. No native build/device/stream support inferred from docs or camera preview. |
| Web P0-02 → P0-12 | AUDIO-03/06/08–09/13–15; AVTEST-01/02/04/06/07/08/11. Finish current repairs first; preserve caption/screen/media evidence without promoting it to acoustic evidence or user reasoning. Keep late audio historical and respect every output gate. | P1-03/04 Windows original-screen and supported web contribution; P3-01 cross-desktop. Browser probes cannot certify iPad system playback or arbitrary app audio. |
| QA P0-13 | Map all AUDIO-01–15 and AVTEST-01–12; distinguish synthetic, recorded-sample, live-device, provider, independent review and accepted capability. Preserve negative cases and denominators; unavailable routes remain explicit. | A47–49 / G3/G4 and V-SourceTimeRelations. All twelve AVTEST cases currently not_run; no averaging away professor loss or negation reversal. |
| Support SUP-01 | Read as context for a later specifically assigned bounded incident; preserve existing six-risk report and owner boundaries. | Remain idle after the completed diagnosis. No duplicate platform study, provider activation or quota polling. |

This is one additive update to existing assignments; preserve active branches and current priorities. Ownership, model/effort, budget, normal approvals, contract v0.1.0 and earlier R59/A44/A46 evidence remain unchanged. Accepted notice receipts are not reading or implementation evidence. Exact adoption/receipt records: [audio integration](verification/lead/audio-screen-interpretation-adoption.md).


Current final-decision normalization extends these same cards, with no duplicate dispatch:

- P0-08/09: primary learner interaction input and AI output endpoint are policy roles, not a physical microphone-count constraint. Preserve separately authorized source tracks, changing speaker/role assessments, original utterance times and scoped stops; no v0.1.0 field changes.
- P0-10: AVTEST-09 adds human-reviewed same-word/different-stress/pause/intonation or relevant background-speech pairs, original-audio versus transcript-only comparison, useful interpretations and unknowns without a predetermined winner. Add quiet learner/classroom coexistence and per-person loss/attribution measures to existing cases.
- Deferred mobile P0-03/11 evidence only: retain the [conditional routing candidates](requirements/audio-screen-interpretation.md#microphone-routing-candidates) for the reported 26.5 target. The lead's narrow current-scope annotations correct exclusive readings of historical playAndRecord advice while retaining its evidence. No further mobile campaign is dispatched now. Retained later D5-M03/DT-G3-05/11 and AV01–03/06 checks cover: actual ports/channels, near-mouth learner plus far professor/others, compatible dualRoute headset, attach/detach/recovery, headphones and screen sharing. Keep USB/input-only, multichannel interface and optional two-device alternatives separate. Do not mandate an OS upgrade for the 26.2+ candidate or combine dualRoute with default-mode high-quality Bluetooth recording.
- P0-12: preserve independent source/role/context evidence and actual playback gaps; a camera preview/caption is not audio. Current W1/P0-12 repairs remain integrated and separately reviewed, not restarted by documentation.
- P0-13: live-input, actual AI processing, human-reviewed semantic references and required persistence are cumulative evidence dimensions. “Live” forbids substituting recordings, not dropping processing/reference requirements. Synthetic policy success alone cannot pass audio interpretation; all AVTEST variants remain not_run.

Core live classroom/video understanding stays P1-03, source archive P1-04, optional two-device capture P3-01. The microphone is not yet chosen; evidence-based recommendation is engineering work and no purchase is authorized. The later mobile identity and live-listening decisions remain settled; desktop equivalents are current delivery requirements. See [normalization evidence](verification/lead/audio-final-decisions-normalization.md).

<a id="phase-backlog"></a>

## Complete-product backlog — Windows and macOS first; native mobile variants deferred

These entries preserve the complete P1–P4 scope. Current P0 desktop work prepares
selected P1/P2 behaviors; the full rows remain unaccepted. They are not duplicate
concurrent assignments. Both desktop OSes must meet applicable full-product rows;
native mobile-specific variants are explicitly deferred, not deleted. Desktop
platform ownership is Web/Windows and Native/macOS (`ios` remains the route alias). Phase allocation and
slice size are engineering defaults. Lead supplies exact implementation baseline,
write scope and evidence location when dispatching each existing backlog ID; no
purchase, new account action, external message or homework submission is granted
by this table. QA owns independent acceptance across all rows; listed owner leads
the implementation and coordinates supporting roles within their existing paths.
Evidence must identify commit, real environment/inputs, denominator and failures.

| ID / owner (support) | Prerequisites | Required behavior and direct cases | Completion evidence |
| --- | --- | --- | --- |
| P1-01 Backend (iOS, Learning) | P0-04/08; actual authorized source accounts and G4 | R02/R43–45: initial plus usable incremental Google Calendar, once-saved URL, Canvas usable connection and renewal/revocation, independent website/self-study without Canvas ID; A17/A23–25, V-DailyResume | Actual connection/sync and next-day/next-week restore, duplicate/changed calendar/timezone cases, source version preserved; no repeated material/URL request; registration/login alone insufficient |
| P1-02 Web/Native (Learning, Backend) | G1/G2/G3 per-OS path; P0-02/03/08; actual runtime route | R01/R03/R06–10/R59: original Windows/macOS screen, words/formulas/image parts/captions/board, silent card, original image and frozen source/time; A01–03/A12/A26/A44–45 | Actual input/navigation/source evidence on each desktop OS plus §11 accidental-input and latency checks; both §7.1 gates independently. DOM-only or a fallback is insufficient; mobile/Pencil variant deferred |
| P1-03 Web/Native (Learning, Backend) | Usable audio path G3, model/backend connection and selected source | R09: actual voice follow-up, teacher/user separation, fast adjustable speech and interruption while preserving selected context; A05/A06/A14, V-SourceTimeRelations  R60/A47–49, AUDIO-01–15 and AVTEST-01–12 add live classroom attribution, actual per-OS desktop system/app playback with headphones plus enabled mic; retained mobile playback variant deferred, context repair and measured available-route quality; see audio coordination. | Real input/output/interrupt/old-queue cancellation evidence and §11 timing; missing audio disclosed; text-only silent fixture cannot pass  Required source capture, understanding and reply permission are separately measured; no saved lecture/upload prerequisite. All AVTEST cases remain not_run. Additional/changing speakers and quiet personal microphone must not lose classroom content; one primary interaction input does not cap verified sources. Conditional target-device candidates are untested. |
| P1-04 Backend (Learning, iOS/Web) | P0 source/retrieval contracts; P1-01; G6 evaluation with retained failures | R04/R24/R27–30/R32/R44/R50: original interactions, source lookup, next-session goal, visible progress and model-independent continuity; A09–13/A23–24, V-ModelSwitchContext/V-ArchiveCompanionContinuity/V-LearningProgress  R60/A47–48; AUDIO-02–04/07–08/13–15, AVTEST-01/02/05/07/08/11 add retained oral trials, original-language hypotheses, reversible correction/role history and actual source-time gaps. | Real course/self-study exit/restart/next-day recovery, source hashes and earliest detail, goal/history/progress retrieval; full text remains behind concise UI, test corpus alone insufficient  Required transcript/context retention remains independent of transient audio buffers and does not mandate permanent lecture recordings. |
| P1-05 Web/Native (Backend, Learning) | Local storage/sync and selected source path; P0-04/08 | R17/R28/R46: usable local notes with original source/version/context and recovery; A19/A27 where ink offered | Declare the exact minimum: AI text note + retrievable source can support P1 but cannot complete R46. Any offered ink must actually save/reopen editable originals offline; complete handwriting/export remains P2-03/04 |
| P1-06 Learning (iOS/Web, Backend) | P0-08–13; a declared supported real problem path on each desktop OS | R51–58 with original R03/R08: attempts → requested help → review → save → next-day evidence; A30–43/A45, INTENT-ANSWER-PROMPT/INTENT-HOMEWORK-CHOICE when screen-answer path is enabled | Real problem with unknown gaps, scoped help, attribution, versioned recovery, truthful final-answer prompt and available choices. A45 does not pass A44; no need to wait for all apps |
| P2-01 Learning (iOS/Web, Backend) | P1 real sources, notes and model path | R11–17/R28/R49: adaptive depth, optional multiple directions, reproducible demonstration, prefetch/cache and future-course evidence, short graphical notes; A04/A05/A19/A29/A39, V-CacheProvenanceLatency/V-FutureCourseEvidence/V-ProactiveTeaching | Actual system-predicted candidates with source/personal-state grounds, automatically generated artifacts before user selection and verifiable generation/selection order; then matched/missed cache content and §11 latency, verified formulas/linked visuals, sourced future-course versus general knowledge, optional quiet teaching; no automatic full lecture or compulsory test |
| P2-02 Learning (Backend, QA) | P1-06; independently reviewed evidence/policy | R50/R54–58: branch diagnosis, corrections, targeted optional practice, help-aware mastery and persistent English-first preferences; A35–40, V-LearningProgress | Valid nonstandard method and lucky correct answer distinguished; actual help/unknown reasons retained; independent novel transfer evidence, user correction and model-switch recovery; semantic review plus user trial |
| P2-03 Web/Native (Backend) | Current P0 desktop input slices, G1/G2/G7 per-OS evidence and P0-08 | R03/R08/R46/R59: original live screen pen with content-anchored AND screen-fixed display, independent purpose; A26/A27/A44–45, INTENT-INK-MODES | Each mode tested for normal navigation and supported pen/mouse/trackpad inputs, scroll/zoom/reflow/video/topic change; mobile finger/Pencil variant deferred, editable original/source recovery and AI composite receipt. Native-app restrictions and fallback separate; one mode or owned canvas not substitute |
| P2-04 Web/Native (Learning, Backend) | P2-03 supported path; official G5 capabilities and actual authorized assignment sources | R46–48/R51/R58/R59: contextual note/draft classification, independent AI supplements, Notability notes, timely final-answer organization choices and faithful output; Backend also owns the original P2 OneNote connector; A27/A28/A46, all five INTENT cases | Mixed/corrected purpose, draft→final answer, refusal de-duplication, available destination/assignment/version selection, preserved original layout/answer, preview and actual import/unknown outcomes. OneNote connector requires actual authorized page creation/readback and page ID/link, unknown-result reconciliation and duplicate-safe retry; its delivery is required in P2 but it is not presumed user substitution for Notability; no submission |
| P2-05 Backend (Learning, iOS/Web) | P1 archive/continuity; actual data and transparent storage measurements | R27–32/R58: long-lived original source beyond model context, rebuildable indexes, corrections/deletion, capacity transparency; A09–12/A38, V-ArchiveCompanionContinuity/V-MemoryCapacityTransparency | Real interaction archive and repeated compression/rebuild/source comparisons, retrievable early records, user-authorized deletion without resurrection, measured capacity/cost/limits; no silent recent-N truncation or infinite-memory claim |
| P3-01 Web/Native (Backend, Learning) | G3 and actual desktop paths; later mobile paths; P1 source/voice/session state | R29/R32/R35–36/R51–58: Windows/macOS joint understanding, with iPad/iPhone variants retained for later, separate track controls, main audio and synchronized permissions/preferences; A15/A16/A31/A34/A38/A40, V-MultiDeviceUnderstanding/V-SourceTimeRelations  R60/A48, AUDIO-06–09/14–15 and AVTEST-04/05/06/07/11 extend source/role uncertainty, synchronized shared-screen/audio provenance and late-arrival handling. | Actual related/unrelated/stale multi-source examples for the current desktop scope; retained mobile three-source cases deferred, cross-source provenance/time/audio, individual stop/reconnect, no revived old sharing/help; room membership alone insufficient  Independent tracks are not speaker identities; unavailable/overlapping audio and stopped sources stay explicit. The iPad+iPhone separate-microphone route is optional P3 work and must not defer P1-03 classroom understanding; no hardware is selected. |
| P3-02 Web/Native (Backend) | Working P1-02/P2-03 desktop capture/input and P0-08 | R03/R08/R46/R59: further cross-surface reliability/hardening of Windows/macOS original-desktop annotation and both ink modes; A44/A45/A46, INTENT-INK-MODES. This retained ID no longer defers first desktop ink to P3. | Per-OS window switching/DPI/scroll/zoom/anchor/share-stop regressions and actual AI composite receipt; browser/frozen-canvas success cannot pass desktop gates |
| P3-03 Backend (Learning) | Authorized sources, queue/budget/cancel controls, P1 connections | R12/R33–34/R44–45: autonomous plan → execute → verify → adjust → remember while user offline; A17/A18, V-AutonomousPreparationCycle | New/unchanged/missing/contradictory materials, actual source-backed artifacts/checkpoints, bounded recovery and requests for missing connections, realtime priority; no device recapture or requirement for user to command every step |
| P3-04 Learning (Backend, iOS/Web) | Actual current observations, goal/progress/calendar/history | R19/R21/R23–25/R41: content-aware supervision, discussed goal changes, remembered reasons/reminders and patient firm coaching; A07/A13/A29, V-SupervisionGoalHistory/V-ProactiveTeaching | Related lookup versus real distraction, unknown reasons not psychological facts, cross-day history and user style calibration; no response not noncompletion; exploration forbids answer leaks, not all supervision |
| P3-05 Backend (iOS/Web, Learning) | Real notification/channel grants, persistent clock/stop state | R20/R22/R36/R41: break timing, scoped exit/reminder/source/worker stops, cross-device/channel de-duplication; A08/A14/A16/A22, V-ExitReminderTimer | Contrasted rest responses based on actual studied duration/session context, exit-reminder timing/intensity based on real urgency/importance and recorded decision grounds; wall-clock deadline across restart/devices, actual permitted delivery versus read status, cancellation races and pause effects; unavailable SMS/social paths explicit, no unrequested message in development |
| P3-06 Learning (Backend, QA, Lead) | G4 official entitlements, known prices and ledger; real course questions | R04/R38–42: honest subscription capability, API fallback, selected flagship and tested cost routing; A20/A21, V-EntitlementBudgetQuality | Official real calls/capabilities/quota status, concurrent full-cost reservation/reconciliation, ≥30 actual-course same-input full-flagship comparisons under §11, disable defective downgrade categories; development effort not product routing |
| P3-07 Lead (Backend, iOS/Web, Learning) | Instrumented actual sustained path and cumulative data | R29/R31/R37/R40/R51–52: long companionship, reliable short-change preservation, on-demand reasoning and measured server/resource needs; V-LongRunningCompanionship/V-ResourceNeedEvidence/V-MemoryCapacityTransparency | Quiet/rapid-edit/voice/break/offline long session, actual gaps/freshness/latency/CPU/memory/power/bandwidth/cost, transparent choices at limits; no silent source loss, fabricated unlimited capacity or hardware purchase |
| P3-08 Backend (Learning, iOS) | P1-01 usable Calendar; long-running worker state | R02/R33/R44–45: resilient full background calendar/source incremental synchronization and progress-linked planning; A17/A23–25, V-DailyResume/V-AutonomousPreparationCycle | Pagination/token expiry/revocation/recurring change/cancellation/DST/all-day cases, one calendar projection rebuild preserves goals/notes, actual next-session continuation; P3 hardening does not defer all P1 Calendar functionality |
| P4-01 Web/Native (Backend, Learning, Lead) | Windows/macOS clients, official Codex capability/account permission, unified memory | R05/R32/R35: real existing work-Agent task context, explanation during work and authorized start/steer/pause/cancel; V-WorkAgentActualAction | Actual task/tool events and effects, failure/unknown distinction, preserved work/learning sources and cross-model/task memory; login/prompt/fake receipts insufficient |
| P4-02 Learning (Web, Backend, Lead) | P4-01 behavior contract; official Claude Code supported path | R04/R05/R32/R38/R42: next official work-Agent adapter with preserved tool/task/companion context; V-WorkAgentActualAction/V-EntitlementBudgetQuality | Repeat real-task behavior on Claude Code, expose backend-specific input/quota/unsupported operations, no private credential proxy or blanket parity claim |
| P4-03 Web/Native (Lead; mobile variant deferred) | Public platform permissions and actual selected apps; explicit user scope | R26 with R41: measured distraction-app restriction/release and separately tested forced return, V-DistractionAppCapability | Per-app/platform apply/undo and refusal/revocation/stop evidence; reminder success not app restriction, unavailable control retained as limitation |
| P4-04 Backend (iOS/Web, Lead) | P3-05 core reminders; supported public channel and future specific permission | R22: investigate optional WeChat/Douyin/other requested channels without displacing core reminder delivery; V-ExitReminderTimer | Document and measure allowed message type, user grant, actual result/de-duplication and unsupported limits; no permission inferred from product wish and no automatic contact now |

All module rows also apply V-ReuseEvidence when choosing a dependency/native
facility: record source, suitable terms/license, actual benefit and capability
limits. Reusing a component is allowed; neither a new framework nor a full custom
implementation is required by this backlog. Phase exit is the conjunction of its
required rows and main §12, with supported/unsupported paths honestly reported;
it is never merely the easiest successful slice.

## P0-06A guard follow-up after semantic adoption

QA-12 direct/HTTP recursion crashes were actually reproduced before the change.
Lead replaced the integer recursion and narrowed timezone OSError handling;
Backend d4a503e independently supplied the request JSON decoder boundary,
integrated as 1cd03b7. Current combined local check is **433 pass / 13 strict
xfail**, generated artifacts/TypeScript/web build pass, no skipped tests. The
remaining QA-03–11 and real PostgreSQL/provider/device gaps stay open; CI for
37456ac passed as recorded below, and independent QA 62e5ab9 confirms the two fixes on Python 3.14. See
[QA-12/13 evidence](verification/lead/qa-12-13.md). Existing P0-09/10/11/12/13
follow-ups continue; this repair does not change v0.1.0 or start a new protocol.

The first guard candidate 0c235f9 failed its Python 3.12 CI on an invalid tzdata
region-directory key (`America`), while deep-JSON tests passed. The narrow EISDIR
correction is included in the current 433/13 local result; do not replace that
actual failed run with an assumed CI pass. The subsequent 37456ac run was checked
and passed both supported Python versions, as recorded below.

## SUP-01 / support — bounded integration-risk diagnosis

- State: delivered as 7cb905723d40525ff5269ffa3bb0a38b6a579229 via actual reply handoff_32978ddb6e0ab283ba855418122a642a; reviewed and integrated as 6b9be9a. [Six-risk report](verification/support/sup-01-integration-risk-diagnosis.md) complete; all six proposed integration experiments remain unexecuted. Support is idle until another bounded task; no acknowledgement or repeated research requested.
- Owner: Support (07), GPT-6 Astra ultra; not a standing parallel implementation.
- Baseline: the exact commit containing this card supplied in the native handoff;
  code milestone 37456ac, specification adoption 44e60ec plus the two verification-case
  refinements here. Contract remains 0.1.0. Dirty worktrees may use git show.
- Goal: verify actual role/skill/worktree and granted lead connectivity, then
  identify at most six principal technical risks across original-screen input,
  rapid observable-process retention, cross-device audio/video, long-term source
  evidence, no-premature-disclosure and revocable cancellation. Map to relevant
  R03/R08/R12/R20/R22/R27–36/R41/R46–59, A/G and existing task owners.
- Allowed paths: docs/verification/support/** and tests/probes/support/** in
  wt-support only. No production, shared contract, dependency, migration, root,
  task-board or another worktree edit; no billing/runtime/credentials changes.
- Reuse the existing iOS a4841d3 report, Web cdc354c and 8a32a8a probes/plans,
  Backend P0-09 and Learning fd5162b review, 65-case fb445ed and QA 25c63b6. These
  delivered commits are inputs, not automatically integrated or product passes.
  Concentrate on joins between owners, missing evidence and a smallest
  discriminating experiment; do not duplicate the iOS/Web capability matrices.
- Inspect current committed evidence first. For an unresolved platform/library
  claim, consult current official primary sources and record date/link and actual
  applicability. No paid API, account setup, cloud resource, new service or
  permanent eighth worker. A small local reproducer is allowed only when needed
  to distinguish a stated hypothesis and only in the assigned probe path.
- Deliver one bounded report/commit with observed cause versus hypothesis,
  exact baseline/commands, sanitized evidence, minimal test input and expected
  positive/negative outcomes, owner and next action for each risk. State
  untested/unsupported/blocked precisely; unknown process remains unknown. Report
  support/skill/route readiness and latest-spec reading in the same useful result.
- Stop at that report or a concrete external dependency, and return via the actual
  native reply route/message ID; then idle until a new bounded task. Do not poll
  quota or run recurring model analysis. The operator owns quota automation.
- Dependencies: existing owners keep their current work and shared P0-08 remains
  lead-owned; diagnosis does not reassign their implementation. The confirmed
  two ink modes, independent purpose/destination, timely final-answer choices,
  source preservation and genuine original-screen/Notability evidence all apply.

Code milestone 37456ac passed both Python 3.12 and 3.14 hosted CI
[36402550393](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36402550393).
It follows the preserved failed 0c235f9 run and the narrow EISDIR fix. Independent
QA confirmed QA-12/13 on Python 3.14 in 62e5ab9; its additional tests await integration. This documentation/register update does
not rerun application tests or turn any V/INTENT/device gate into PASS.


## Recovered review findings and remaining owned work (2026-09-29 UTC)

See [exact review/disposition and tests](verification/lead/p0-recovered-deliveries.md).
Web fixes and independent QA report are integrated through `fa5c03a`; main Web
checks pass 87 named tests/TS/build and the new QA module passes 12 / 3 strict xfails.
Learning and Backend snapshot candidates are held for the concrete compatibility/
missing-original failures above; no saved output or isolated pass closes them.
Backend P0-09 control task already has exact released `9a861d0` and one accepted
continuation; fixes retain its current work, not a duplicate assignment.
QA's next existing P0-13 Web retest follows its current output-repair retest, at the
exact pushed integration baseline. No repeated capture/context review or browser
site/account access is requested. Lead still owns artifact pin/deletion rules,
validation-cost improvements and exact presentation/causal contracts; old scope
collection and context omission xfails remain until actual repairs arrive. Real
provider/iPad/Mac build and import acceptance remain separate named dependencies.


### Retained QA Web findings before later teaching/input adoption

QA `2f83761` → main `af4c47f`, [report](verification/qa/p0-12-web-retest.md),
[bounded triage](verification/lead/p0-recovered-deliveries/qa-web-retest-triage.md).
Web retains these in existing P0-12; its immediate task remains the real preview
adapter. They do not occur in that provider-unavailable preview call path:

- EO-1 remains partial: open-shadow non-composed script activation may be labeled
  user; require the exact browser negative plus real-user controls before reuse.
- WEB-DISCLOSURE-01: restore correction revision when leaving/returning to an
  attempt before adopting the teaching model; obsolete help must remain rejected.
- Organize coverage: pin unverified-import timeout, later exposure after failure,
  and permission for every AI layer. Correct unmutated behavior is not adequate
  coverage; three relevant strict known-failure checks remain where applicable.

Lead owns later exact intent-ACK/causal contracts. Independent QA confirms fixed
paths but not full G7/P1. No duplicate repair/review batch was dispatched here.
