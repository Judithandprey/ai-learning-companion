# P0-13 exact-candidate offline readiness receipt — 2026-10-02

The frozen Windows package is identified and the bounded synthetic flow has usable evidence. Lifecycle slice: **14 PASS, 0 FAIL**. Final controls slice: **10 PASS, 0 FAIL**, with movement deliberately limited to the original handle hit area. Two typed-follow-up assertions passed in an earlier diagnostic run that did **not** pass as a whole. Cross-handle pointer capture remains **BLOCKED in this harness**. The real product journey remains **NOT_RUN**; no provider request, account, real display capture, microphone, speaker or system audio was used.

This is the existing acceptance assignment, adapted once to the released live candidate under lead message `handoff_b37638ed3ce7fd94a4f62226fa9596fa`. The earlier 86-check subscription campaign, 18 controls, owner suites and real probes were not repeated.

## Identity and environment

| Item | Exact identity |
| --- | --- |
| Evidence release | `24c48c38aee660b606ebff5285acbd2ccb300392` |
| Production source | `175515308f509fb8c0f531dbdb10e57313fcde5a` |
| Windows source tree, as assigned | `e85fdd9bb4c84b06c008b6fa5cd8f9169075af7b` (owner `095e259`) |
| Existing stage | `C:\Users\ROG\AppData\Local\Temp\lc-windows-live-1755153` |
| Entrypoint | `dist/apps/windows/src/main/main.js`, SHA256 `581d42c430941f3b5d7b8aaa86ee3588ca1e4b4976a7de6a6dcbb7a00f3d4df5` |
| Complete 70-file payload tree | `3387824a0dee70013104388d4acec2b810475e98953e7c3f196063a8781fd154` |
| Manifest sidecar | SHA256 `24f642370fa8ab3d25a5661cb28d66efe5a0f7995b3bc19e42623cf4a51608e2` |
| Executed runtime | Existing Windows Electron `44.5.1`, through WSL interop; EXE SHA256 `49b61a030a520fc36a4b8fa5cce53fb4e935a7bdbbe4b80e9222f598e49cc7fa` |
| QA source branch at start | `team/qa`, `43fa1cf5bb4f68a3f3eded23961352d949148a9b` |

[Initial identity](stage-verification.json) and [post-run identity](stage-after-rehearsal.json) match all 70 payload files and the separately written manifest; no missing, differing, unexpected or nonregular entries. The runtime hash records the existing executable; it is not independent authentication of the Electron distribution. The product advertises version `0.1.0`, so the file identities, rather than that version alone, distinguish this candidate.

The baseline merge was rejected by automatic approval review because explicit QA branch-merge authorization was absent. QA continued with `git show` and the existing verified stage. No merge, reset, rebuild or stage overwrite was used. The older package/profile/auth state, `lc_desktop_preview` and Paperclip were not operated.

## Method and limits

The harness imports the exact staged main entrypoint and original preloads/renderers, exercising Electron IPC and production local file handling. Original window constructors remain intact with `show:false`; prototype display/focus methods are suppressed. These are **hidden native windows, not `webPreferences.offscreen=true`**. A hidden blank page initializes each renderer before CDP installs the main-world generated-media guard and the actual product page loads. Context isolation and the renderer sandbox remain enabled. Background throttling is disabled and page focus is emulated for this test only; no native focus is requested.

The screen/source/work area and media stream are synthetic. A generated 1000×700 canvas changes deliberately; the real desktop capture callback always denies native requests. The original permission handlers are replayed only against synthetic objects to advance the production capture state. Microphone, camera, speech and external renderer network routes are blocked. The staged `FakeConnector` runs over in-process streams instead of an OS child; no real connector/account/model is contacted. Its synthetic sign-in and `vision-model` labels prove no account capability.

UI actions use CDP pointer and wheel packets plus normal DOM text/control values; business handlers are not substituted. Ink reopen uses the original `lc.openInk` preload API, not the control-page Open button. Every run has a unique sibling QA scratch/profile, finite foreground timeout and cleanup scoped exclusively to that scratch path. Successful runs record hidden window visibility. Cleanup receipts have no remaining owned Electron processes. Run-02 required a separate [cleanup observation](run-02/cleanup-observation.json).

Raw stdout retains Electron's leading CRLF bytes. The whitespace check excludes only those captured stdout files; source, report, plan and JSON checks pass. CJS and Python syntax checks pass. An independent read-only receipt/source audit confirmed the recorded hashes, counts and proposed cooldown/expiry ordering; it ran no additional product test.

## Results and evidence

| Covered behavior | Result and practical limit |
| --- | --- |
| Explicit Start and fresh first observation | PASS: first synthetic whole-image turn, same live session, no unsolicited answer card. [Lifecycle result](run-12/result.json). Real screen freshness is unverified. |
| Changed whole frame | PASS: new image hash, 1000×700 whole-image metadata, same session. No model interpretation of off-focus values is established. |
| Original ink, undo and redo | PASS: undo removes a visible ID while retaining stroke count; redo restores it. Stop file readback separately compares exact original stroke objects/points and validates `lc-desktop-ink/v1`. No physical pen or cross-app ink was tested. |
| Circle without typing or a second Ask | PASS: one focus turn, `user_text:null`, `allowed_assistance:'hint'`, full image and same-frame focus rectangle, composed ink revision/hash, then automatic return to WRITE. The answer is fixed SYNTHETIC text. |
| Same-frame typed follow-up | PASS assertion: same image/focus/session and history. [Run-11](run-11/result.json) is diagnostic overall, not a passed full run. |
| Later-frame typed follow-up | PASS assertion in run-11: current frame advances, current `focus:null`; original focus is an explicitly historical observation with no attached old pixels and unverified provider retention. No persistent provider-thread memory claim. |
| Cancel and Stop with held turns | PASS in run-12: confirmed cancellation, no displayed late Cancel marker; after Stop no new turn, and the retained Stop request is `submitted`, `cancelled`, `uncertain:false`, `shown:false`, without late answer text. This exercises late duplicate RPC suppression and retained records, not a reply paused at the renderer presentation gate. |
| Explicit restart and reopen | PASS: new live session and first look; original ink reload acknowledges successfully and matches ID/revision/visible IDs/history operation names. Exact reopened point/history objects are not exposed by the renderer summary. |
| Movable controls | PASS only for small within-handle moves and no added ink/request. [Final controls result](run-14/result.json). Outside-handle capture remains BLOCKED as described below. No physical/native drag or position-after-relaunch pass. |
| Work-area fitting/hit targets | PASS: original main work-area event at synthetic 440×320; toolbar modes, handles and Close have unobscured centers within that area. The underlying viewport stays 1000×700. No DPI, monitor switch/removal or complete clipped-edge check. |
| Voice/TTS/floating spoken captions | NOT_RUN: production voice remains null; microphone/system audio are UNCONNECTED. The answer card is not evidence of a spoken caption. |

The narrow work-area screenshots are debug artifacts of the owned hidden renderer. Their compositor freshness is not established; run-11's image visibly retained the earlier layout despite newer DOM rectangles. They are not visual proof of the narrow layout, real display, real source background or speech.

### Retained failed diagnostics

- Run-01 did not launch: sandbox prevented creating native Temp scratch. No run files were produced.
- Run-02 failed before main import because the Electron export is immutable; run-03 failed on an absent preload field in a diagnostic API. No product pass is attributed to either. Native error-dialog visibility in run-02 was not observed.
- Runs 04–06 waited for a CDP target before renderer creation; an additional script-serving evaluation cycle was removed. Run-07 lacked `Page.enable`. Run-08 reached the guarded product control page, then found a control below the viewport; ordinary wheel input was added. These are harness setup failures.
- Runs 09–10 aborted at a drag assertion. Run-11 continued independent checks but failed that drag and timed out waiting for another follow-up after the drag; the cause of that later timeout remains unknown. Lifecycle was isolated rather than claiming those checks passed.
- Run-13's large drag reached each handle on pointerdown, but subsequent packets targeted other elements; no `gotpointercapture` was recorded. Both handle centers stayed unchanged. Severity: **acceptance blocked**, owner/action: QA/lead must distinguish CDP hidden-window behavior from actual native dragging under the released display lease. This is not a confirmed production defect. Run-14 moves inside the initial target and preserves that limitation; it does not shim pointer capture.
- Run-13 incorrectly exited zero despite one nonfatal failed assertion. Its JSON's FAIL remains authoritative. The final runner and harness both inspect failed check counts; run-14 uses that correction. Lifecycle run-12 was not repeated merely for this exit-status correction.

No result here passes both desktop §7.1 gates, R59/A44–A46 original-live-screen classroom/Notability flow, R60/A47–A49 real audio, macOS, queued/before-send Stop, older/newer renderer presentation races or real provider usage refusal/lock behavior. The lead's saved consumer renderer evidence also remains qualified: 14 emitted checks have only 13 supported; Close's hush comparison is noncausal, while the separately supported Stop and WIN-LIVE-03/04 evidence is retained.

## Exact harness versions

Each `launch.json` records the copied harness and Python runner hashes. Evidence is never attributed to a later source edit.

| Run/slice | CJS SHA256 | Python SHA256 | Whole-run outcome |
| --- | --- | --- | --- |
| 11 / diagnostic flow | `9233279e3b4a6ee03e5eb0a0f2133fb179693c933995c1d044dd2e55c321159d` | `a66c6f1799a49e6f64da76857a363c6a6a177ddeaa33385eb00289a680b8425f` | 11 PASS, 1 FAIL, later timeout |
| 12 / lifecycle | `c0dce1d473e7e3fb6aec07677619dbf8b1b3c34815eef931116c7523a91c43b5` | `da8fb8e5dd48deb4ed70821faed7008822190ded703a13b3ffdf78e0d3993e9d` | 14 PASS, 0 FAIL |
| 13 / controls diagnostic | same as run-12 | same as run-12 | 9 PASS, 1 FAIL; incorrect zero exit retained |
| 14 / final controls | `2c79946b51496cf94ed4af7bdfabab67dd694b1d6db2ee61d17b6f930a8acc16` | `4c50f8554ddc3a57008c9a1a6ac94f60feaa682908a0160fdfa99b96764e5e2e` | 10 PASS, 0 FAIL |

Final source differs from run-12 only in the controls branch's smaller drag/limitation record and failure exit accounting. No new production layer, dependency, contract or fix was introduced. `[--slice lifecycle|controls]` supports bounded follow-up; the default `all` flow is not claimed to have passed end to end. [Artifact hashes](artifact-hashes.json) identify delivery files and all retained diagnostics.

## Proposed real-request accounting — awaiting lead release

The saved maximum five remains a ceiling, not a lease. For this voice-unconnected candidate, propose **at most four actual attempts**: (1) unattended whole-screen observation, (2) one automatic circle hint, (3) one typed follow-up after a controlled screen change, (4) one Stop interception attempt. The spoken slot stays NOT_RUN and is not reused. LIVE-05's second typed direction and LIVE-08's multiple Stop/race permutations stay offline/NOT_RUN under this ceiling.

Use the actual UI policy `max_submissions:4`, `max_session_ms:60000`, `min_observation_interval_ms:60000`. The first look starts the unattended cooldown; the one-minute session expires before a second unattended look is eligible. Perform the manual steps only within that session, and never restart to recover an expired/used session. This trades coverage for a concrete bound: if response latency prevents later steps, they remain NOT_RUN. Writing/undo/redo and drag/navigation that would change the source are prepared offline, not added to the real attempt sequence. Every possible/unknown/not-submitted attempt counts once; no retry. Any usage, authentication, capability or tool refusal stops real calls immediately. Record request IDs and actual receipts; a local policy/UI count alone does not establish provider submission.

Next owner is the lead: review this bounded schedule and the pointer-capture gap, then coordinate an explicit exclusive generated-display/account lease and exact launch configuration. Audio remains unreleased and unconnected. QA will not launch the real phase or adapt account access automatically. The separate NativeSpeech.cs/native-voice.mjs Untrusted Code Integration decision remains pending; this receipt imports neither and grants no bypass, purchase, additional experiment or release.
