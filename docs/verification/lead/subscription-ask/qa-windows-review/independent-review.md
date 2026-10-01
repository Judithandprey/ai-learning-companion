# Windows subscription QA evidence — 9abf587

**APPROVE the historical QA evidence for integration; do not label it image-inference acceptance.** The saved real Check is signed out, the controls use a stand-in, and the typing check uses synthetic Windows OS input. One concrete source finding limits the reusable launcher **check** helper's failure cleanup; it does not negate the successful recorded check or prohibit the prepared user's sign-in entry.

Reviewed exact QA `9abf58797c7c779266651eca333424846c7a04dd`, candidate `3e4b40654460a2dc2407f1d9be60d8e1a5b39a3e`, against main `250f8290cc0a16f8a203b698aa8f2d349b8f0187`. Read exact report/evidence plus relevant launcher/copy helpers. No GUI, connector, login, provider, database, test or build replay.

## Evidence and source checks

All **70 evidence-leaf files** match exact Git blobs. Candidate Windows tree `5bda4761eaef62814a7f376a6e1147246d48bf3f` equals owner `84fc56a`; QA production `apps/services/packages` equal candidate. The candidate Backend trees contain **268 files**, consistent with the recorded full-copy check. Five recorded connector/Learning hashes equal candidate blobs. Actual private-copy execution is QA-attributed; no live copy was touched.

All **166 executed harness hash entries** across eight retained runs equal their individually named commits: six sets of 21 at `110c733`, 21 at `9cac50b`, 19 at `3002218`. Thus the final typing run is not incorrectly attributed to the earlier click implementation. Actual Git delta `677323a` changes only the answer-judge explanatory note (numbers-only matches now say shape/colour unconfirmed); the status predicate remains unchanged. Unlike an unretained working edit, both old/new source versions are inspectable here.

Recomputed saved summary counts:

| Run | Saved outcome |
| --- | --- |
| surfacecheck | 4 pass |
| smoke | 20/20 successful steps |
| subcontrols | 18 pass; 235 steps |
| subselect | 6 pass; all 16 selections ready |
| earlier subselect at 3002218 | 4 pass / 2 fail retained |
| subrehearsal | 6 pass / 10 limit; 81 successful steps |
| subcheck | 10 pass; 76 steps |
| subtype | 7 pass; 103 steps |

The final real `subcheck` metadata has `real_turn_allowed:false`; its selection has no requests, receipt lookup has no request IDs or receipts, and the app transitions from `not_checked` to **`signed_out`**, login `none`. Seven catalog image models do not establish account entitlement or inference. Its watcher records the owned Python/Codex/lsb_release processes and their exits. The separate launcher check also records signed out, Sign in offered, `sign_in_pressed:false`, and app closure. The report's six historical Check starts include earlier runs not fully committed here: that total remains QA-attributed, while these retained final records support no real Ask/sign-in/inference and zero allocated image attempts consumed.

The synthetic controls have **18 Ask presses, 16 unique bridge asks and 16 app request records**; the before-Check and signed-out presses send nothing. Independently matched every bridge question digest and PNG hash/size to its saved request/selection; outcomes remain explicitly synthetic. The claimed 18 refers to checks including run/cleanup checks, not 18 independent inference cases.

The typing evidence contains **six successful OS clicks** on the question box, each reaching the owned overlay, each followed by input events for `4` and `2`, each preserving `Explain what is selected.` and appending `42`. Each caret is collapsed at position 25 before typing. These are synthetic Windows OS clicks/keys, not physical keyboard/pen/mouse verification; the differing earlier WRITE/composition behavior is explicitly retained as unresolved.

Four relevant runs yield **14 image/ink original metadata links** with matching saved filename hashes and lengths. Raw private PNG/ink bytes were not read or rehashed, so this is receipt linkage, not a new pixel inspection. The report preserves the earlier foreign-window capture incident and deletion; this reviewer did not inspect or recreate it. Stage/runtime execution identity remains QA attribution: the evidence contains source comparisons and named stage/runtime, not a separately rehashed stage manifest in this review.

Saved app exits are code 0 without forced kills; all watched process IDs have matching exits, watcher remainder is empty, observed WSL children are gone, and cursor start/end agree. Broader 10:14 display release and cleanup of earlier discarded runs remain QA's attestation. No reset/read of credential state is implied by this audit.

## Concrete launcher-check finding

**P2 for reuse of `signin_launcher.mjs check`; historical evidence remains valid.** At lines **87–96**, it starts the app through detached `cmd.exe` and does not retain an owned-process handle; no page returns early and a DevTools connection/evaluate failure exits without app cleanup. The evaluator has no response/close timeout. At **118–128**, the outer 150-second timeout can stop the checker while the detached app remains, and the helper then removes its profile before checking checker exit/confirmed app closure. Error JSON or `app_closed_itself:false` can still be printed with a successful outer shell exit.

Source reproduction: after successful spawn, reject the DevTools open or withhold its evaluate response. Trace reaches catch/outer timeout without the normal `window.close()` path, followed by unconditional profile removal. This is a source-proven failure path, **not a Windows failure rerun**. The actual saved launcher record says the app closed, so that result is not disputed.

Minimal correction before reusing automated `check`: keep ownership of the launched app; put bounded close/reap in `finally`; preserve profile until confirmed exit; return nonzero on error/timeout/not closed. The ordinary prepared user `.cmd` entry and successful historical evidence can remain intact. Root owns triage; no patch or new campaign was made here.

## Minimal integration and readiness boundaries

Integrate these owned leaves in order, preserving their history:

1. `d6ecc9884c92edd60db15e1aea01ceae6a83e24b` — initial driver.
2. `f97217628fe933b7f3c57a614211caca35b7df66` — hardening and launcher.
3. `3002218cc36c13d2328bd2f49f90217f2f1e6eca` — frame wait/input/analyzer correction.
4. `110c733786395d5262e1c8b06fa6c5d49d9a2297` — full Backend copy/preparation guard.
5. `4167ab5ebd58eb952269a936f9dc17f22b34bea7` — OS input probe.
6. `9cac50b7051d375f276c0a31ba1130c5b38a860d` — pointer-arrival correction.
7. `677323a58f3a91f9eba391d461c29e5851a5fc79` — truthful analyzer note.
8. `9abf58797c7c779266651eca333424846c7a04dd` — report/evidence.

Do not merge normal adoption merges `27b942c`/`a9ff602` or repeat older already-integrated branch history. Seven harness leaves affect only `tests/e2e/windows/**`; final leaf is documentation/evidence. This audit establishes their exact provenance and needed closure, not a general certification of every new harness branch.

The corrected copy includes packages and records successful offline `_prepare`; this supports removal of the known missing-packages failure. It does **not** prove real `thread/start`/`turn/start`, WSL login callback, account eligibility or image understanding. Login and product QA-SUB-01–08 triage remain with Lead/owners. The reported answer-length/other source findings are author review evidence; they were not independently re-reproduced here. Scope ends at the observed Check, controls and typing. No physical-input, Mac, audio, Notability or full §7.1 acceptance follows.

Audit command: `python3 -B /tmp/qa-subscription-evidence-audit.py` (saved-data/Git checks only). Machine output: `/tmp/qa-subscription-evidence-review.json`. Exact export: `/tmp/qa-subscription-9abf587`.

Privacy check: all 68 committed JSON evidence files were scanned for raw PNG/data-image payloads, JWT/API-key shapes, credential-bearing PostgreSQL URLs and nonempty credential/login URL/email/image-base64 fields; none were found. Saved images remain hashes/dimensions/byte counts. This is bounded inspection, not a universal secret-detection guarantee. Lead separately verified the actual prepared launcher/config hashes and has assigned the same QA owner one no-rerun cleanup/wording correction; do not duplicate it.
