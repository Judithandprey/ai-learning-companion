# Windows subscription QA integration — 2026-10-01

The real image gate remains **not_run**. The actual Windows app starts the
official connector and its Check reports **signed_out**; the user-operated
official login entry is ready. Eighteen independent GUI checks passed with QA's
synthetic bridge, and six question-box click/key cases used synthetic Windows
OS input. These establish neither image inference nor physical-input acceptance.

## Exact source and integration

QA delivered `9abf58797c7c779266651eca333424846c7a04dd` through
`handoff_87fd40c7432af0d1afd157f8e2877412`, for released product source
`3e4b40654460a2dc2407f1d9be60d8e1a5b39a3e` (Windows tree equals owner `84fc56a`).
The [complete QA report](../../../qa/p0-13-subscription-ask-windows-3e4b406.md)
preserves earlier failures, the corrected source-copy mistake and the discarded
covered-window capture; none is counted as passing real-model evidence.

Only the eight reviewed leaves were cherry-picked; no old branch merges:

| QA leaf | Main integration |
| --- | --- |
| d6ecc98 | 0110b3d |
| f972176 | 21b3d58 |
| 3002218 | 552caf4 |
| 110c733 | 1292594 |
| 4167ab5 | 3ee789f |
| 9cac50b | 50f879a |
| 677323a | a2e0514 |
| 9abf587 | 91c7367 |

[Independent review](independent-review.md) and [recomputed evidence](independent-review.json)
verify 70 evidence-leaf files, 166 executed-harness hash entries, five connector
source hashes and the exact candidate Windows tree. They verify saved observations,
not a new GUI execution or a reinspection of private original images. The bounded
privacy scan of 68 JSON files found no raw image payloads or credential patterns;
private auth state was not read. The six historical connection checks remain
QA-attributed; the retained final Check and launcher result were audited directly.

[Integrated checks](integrated-checks.json): nine Python/JavaScript syntax checks,
31 changed answer-judge cases with zero failures, exact equality to the delivered
QA paths, and `git diff --check`. No app, connector, provider or database campaign
was replayed. The full Windows product source was unchanged by these eight leaves. Existing P0 CI on `250f829` passed
([run36834837822](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36834837822));
its earlier `3e4b406` run36834649823 was cancelled, not passed. These are prior
checks; they do not certify the newly integrated QA harness.

The saved `audit.py` is the exact bounded audit: it expects an archive of QA
`9abf587` at `/tmp/qa-subscription-9abf587`, reads local Git/source/evidence and
writes its result in `/tmp`. It never runs an app or provider. The archived
`independent-review.json` also includes the reviewer’s bounded privacy inspection.

## Concrete corrections and next owners

| Finding | Current action |
| --- | --- |
| QA-SUB-01 | Web: freeze the selected frame's dimensions before asynchronous encoding can race sampler bitmap closure; preserve the actual image/frame/ink binding. |
| QA-SUB-02 | Backend: recover from a fatal inner client on an explicit user action, with owned-child cleanup and no inference retry; coordinate any necessary desktop change. |
| QA-SUB-03 | Backend: replace the misleading streamed-notification budget with meaningful bounded accounting; retain memory/time/tool defenses. Fix before the real attempt. |
| QA-SUB-04/05/06 | Web: invalid Unicode preflight, connection-specific errors and pending-login/cancellation lifecycle. |
| QA-SUB-07/08 | Web: bounded assessment of refresh storms and lost-overlay presentation. Unknown presentation is not proof of unseen text or of displayed help; do not infer learner mastery. |
| QA-LAUNCHER-CLEANUP | QA: the automated launcher checker can leave its owned app alive after failure and delete its profile too early. Fix owned cleanup/error reporting before reusing `check`; the successful historical check and prepared user entry remain valid. |

[Actual accepted receipts](dispatch.json) name one existing task per owner. They
initially report `execution_started:false`. Actual Backend start
`handoff_ff4b6ad678fb46b29bf20675cb7c1d24` at10:42:13Z confirms the exact source
read and correction implementation; it is not a completed fix. Native received the shared lifecycle findings within its existing macOS
consumer assignment, without a duplicate task. Support remains on demand.

## Official user login and the one held image attempt

Lead read-only verification confirms the prepared launcher/config hashes equal
QA's recorded hashes and referenced app/runtime/source paths exist:
[file check](launcher-file-check.json). Windows entry:

```text
%TEMP%\lc-subscription-signin-3e4b40654460\Start-Learning-Companion-Subscription.cmd
```

The user opens it, presses **Check connection**, then **Sign in with ChatGPT**,
completes the official browser flow, checks again, and closes the app. No token,
login URL or login screenshot is requested. This procedure sends no image request.
The browser callback into WSL and successful login remain unverified. This entry
uses a dedicated product state, not copied development-agent auth. Temporary
app/runtime cleanup by Windows could require restaging; current existence is not
a permanent installer claim. The Windows display is reserved for this user action.

[The existing request ledger](../request-budget.json) keeps the same one allocation
`handoff_d548b28a9fa5613b7543be19858a5ca2`, **zero actual Ask presses used**. It is
held until reviewed source corrections, a new exact candidate release and verified
managed login are available. Every actual real Ask press spends this allocation,
including a proven `not_submitted` result; an unknown outcome also counts. These
engineering bounds do not claim actual billed consumption. No automatic retry.

Lead approves `full_solution` only for the generated nonsensitive two-card
recognition test asking for a two-line answer. This is faithful to the authorized
randomized-image verification; it does not change hint-first defaults or authorize
homework answers. QA then retests changed paths only and performs the one conditional
real image turn. Official image input, correct image-only identification, complete
provenance and the answer in the ASK card all still need actual evidence.

Continuous whole-screen understanding, both per-OS core gates, audio, physical pen,
interactive Mac and Notability remain open. User preview/database and Paperclip
are untouched. Lead continues review/integration on actual owner deliveries.
