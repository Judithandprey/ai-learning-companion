# QA-WIN-04 correction review — HOLD

Exact evidence commit `70cb7e872e1cc7826d5b108ccc006b758d3cfb70`, code `5cd0bec87db7a1f0989ab8e7f0ed702261dbccf2`, parent `5871981524140e3be986268a941d34e99af25bb9`; export `/tmp/lc-win-qafix-70cb7e8`. Current canonical main was `05465cc1d94b3d469b7e49aedcee92b226429271`. This review covers capture-link storage status, main notification, preload and renderer copy. Quit/script is independently owned.

Two remaining false ongoing-storage assertions block this correction's acceptance. The stored counter itself stayed zero; neither finding demonstrates data loss or a false committed ACK.

## C1 — Open ASK card keeps stale ongoing-storage text

`apps/windows/src/renderer/overlay.ts:71` updates only the `storage` variable. The card's present-tense prefix is constructed at lines 723–727 and assigned once at line 735. Main correctly delivers the new state at `src/main/main.ts:1065`.

The existing exact-source app/overlay harness opened an ASK card while storing, then retained a frame and received an unanswered upload via the existing fake service. Actual coordinator status became `stalled`, `stored=0`, `unknown=1`, `storing=false`; main sent `not_storing` and the control header changed. The already-visible card stayed byte-identical: “are also being stored”. Closing and opening a fresh card correctly said the service is not storing frames now. Thus the new notification works, but it does not correct the existing visible assertion.

Small correction: avoid present-tense service assertions in the selection card, or update only its visible storage metadata on notification. Preserve its exact selected image, ink, frame/time anchors and uncertainty; do not recreate the selection. Add a regression leaving the card open across this transition.

## C2 — An exhausted queue is treated as answered storage

`src/main/capture-link.ts:730–734` correctly preserves a previously unknown job as unknown when an original cannot be reread, marking it `stuck`. The loop excludes stuck jobs at line 663; `none`/`ended` at line 687 then unconditionally changes state to `sending`. `status()` line 425 turns that into `storing=true`, and `src/renderer/control.ts:297` claims frames “are also being stored”. No successful batch answer is required for this transition.

The probe copied the existing ink fixture into its own `/tmp` directory. All six batch attempts returned a typed 503; original PUTs received fake byte receipts only. Once status was stalled/unknown, it removed one copied raw PNG. The next retry marked the unknown job stuck; queue exhaustion yielded `state=sending`, `stored=0`, `unknown=2`, `storing=true`, with detail explicitly saying the two records' outcome remained unknown. The header nevertheless claimed ongoing storage. The source fixture remained untouched.

Small correction: queue emptiness must not erase the unanswered/stalled state. Preserve unknown outcomes and allow later legitimate work; use actual answered evidence when transitioning back to an affirmative storage state, or distinguish attempt/readiness wording from verified storage. No new manager, protocol or global wire narrowing is needed.

## Checks and limits

Three independent bounded groups ran on pinned Node v24.21.0: two defect reproductions and one Stop/unknown-preservation control. The process exited 0 because its assertions establish those observations, not because the candidate is approved. Stop retained the unknown record and set storing false. Fresh-card and control-header updates worked. AI-disconnected text remained explicit.

Reproduce:

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/windows-qa04-70cb-probes.mjs
```

Probe source, complete stdout and machine results: `/tmp/windows-qa04-70cb-probes.mjs`, `/tmp/windows-qa04-70cb-probes.log`, `/tmp/windows-qa04-70cb-probes.json`. Machine review: `/tmp/windows-qa04-70cb-review.json`. SHA-256 and exact-commit comparison manifest: `/tmp/windows-qa04-70cb-source-manifest.json` (66 exported production/test/fixture/report files byte-equal to the immutable candidate).

The harness imports the exact exported production coordinator and executes the existing source-loading main/renderer harnesses. It uses fake Electron/browser objects and fake child/transport; no real GUI, child host, socket, database, provider or native platform ran. Author Windows run claims remain owner evidence. Root's focused suite/build is separate and was not repeated. No repository files were changed; root's concurrently created untracked QA evidence was preserved.

The review read the current QA result, owner repair report and changed call paths against the assigned lifecycle/source/ink scope (R03/R08/R35/R36/R46/R59 and A14/A26/A30/A31/A44). PONYTAIL LITE was applied by reusing existing harnesses and limiting checks to actual changed behavior. Existing provider-off and full platform acceptance boundaries remain open. These two copy/state findings do not reopen previously passed storage/permission campaigns.
