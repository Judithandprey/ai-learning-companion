# P0 continuation: independent QA, reproduced defects and evidence adoption

Base `af1e1607f1c4265bf21f0e36fd8107ec4e497863`. This continues existing
P0-06A/P0-12/P0-13 after final-decision normalization. Peer deliveries are evidence
within those tasks, not new scope or product acceptance.

## Actual mailbox results

QA message `handoff_ce49c2a42269da8954713abb8e5782e6` delivered exact-main Web
retest e26523e and the complete absent-plan lineage. It also confirms reading
7fadd151c83118c22a4846bdb8b2622d47bb0df3, its current decisions, audio routing,
revised AVTEST cases and task mappings. Backend message
`handoff_e0cf5fdd29663394167eb42b597e7500` delivers c2f3f41 on cad63a1; Learning
message `handoff_a0a26c4ac58a2f21a12a988f7e6f27f2` delivers 2b2859e on 3bb5e297.
Both also report actual 7fadd15 clause reads and matching source/English hashes.
These are three actual substantive reads of the final normalized baseline, not
inferred from the six accepted notices. Other final-baseline reads are unobserved
at this record; this does not imply refusal or inactivity. All read snapshots
completed without pagination. No acknowledgement-only reply was sent.

## QA integration and evidence limits

Read-only Astra review found the seven-commit acceptance-plan bundle consistent
with final source decisions: cumulative live/processing/human/persistence evidence,
actual human reference review distinct from independent AI review, original-screen
and fallback distinctions, and unchanged phases. All planned AVTEST remain not_run.

| Worker commit | Integrated commit | Scope |
| --- | --- | --- |
| 25c63b6 | 3f3e378 | 37-case review, acceptance matrix and historical fixture checks |
| b2c63d1 | d2ab37f | 28-case surface review and corresponding checks |
| e4feafd | c413f6f | INTENT/V/backlog plan creation |
| ebc42e0 | 1751b14 | R12/R20/R22 and reconciliation evidence |
| 321a577 | 3d99dd9 | Audio acceptance mapping |
| 0b15bb1 | fb554aa | Cumulative evidence and human/AI review correction |
| 6351ab6 | 49e047f | Final 7fadd15 decisions, routing candidates and positive acoustic cases |
| e26523e | fd94b13 | Independent Web retest, findings, probes and six W1 guard mutations |
| ddf49a5 | 65aa41c | Original missing offline-close/module logs and retention explanation |
| 24eb97a | efa4666 | Portable exact-source archive, no silent skips, history quote pointer |
| ed9b880 | 2ea23c9 | Actual fresh-clone and tamper evidence |

All selected deltas are QA documents, fixtures/probes or QA harness changes.
No app implementation, contract, dependency, original learning corpus or worker
worktree was changed. The received report remains an independent QA perspective,
with each result's actual evidence scope preserved.

Lead verified committed JSON summaries: QA self-test 51/51; trusted desktop
37 pass with two touch actions unverifiable and three environment-control records;
entry probe 16/16; named unit log 63/63. These are QA's actual runs on 71f1389, not
new lead browser executions. W1 current-submission dismissal reproduces at the
desktop-probe level. All iPad/Safari/Pencil/provider/native import boundaries remain.

The cited offline-close log was initially absent because of `*.log` ignoring.
Lead requested the actual artifact through native message
`handoff_42de100b9c22d89560fa7790df2459ce`; QA returned
`handoff_c758ba6833e918ba6daa5baad3c87777`/ddf49a5, preserving existing bytes rather
than recreating a past run. Raw browser logs with a local profile path remain
withheld; committed result JSON is available, as explained by the QA report.

Two maintenance issues were sent as one continuation, native receipt
`handoff_090f8fdeeec0fa6adcc23f9f4f4b71d7`: the plan's old active-addendum quote
locator must point to history, and historical fixture checks must not silently
skip in a fresh clone without non-main worker Git objects. Local scoped execution
at 65aa41c passed **35 tests with one strict expected failure and zero skips**:

```sh
.venv/bin/python -m pytest -q tests/e2e/test_p0_13_fixture_review.py tests/e2e/web/test_p0_02_r2_mutation_sites.py
```

That combines historical fixture/semantic-blind-spot checks and 16 mutation-site
uniqueness checks. It is not 35 product passes. The expected failure preserves
the original corpus's incomplete A30–A46 mapping. The original corpus commits
exist locally; this result does not establish fresh-clone portability, whose
owner follow-up remains separate until delivered and verified.

That follow-up subsequently arrived as actual message
`handoff_1c6f23f16394ca8cf587b5015bda5490` and is now integrated in the final two
rows above. The historical source archive preserves 21 commit/path entries in
13 content-addressed blobs (238,902 payload bytes), rather than changing original
fixtures or silently substituting newer implementations. Missing or drifted sources
fail. The plan now points to the quotation history. Read-only review verified all
21 original Git byte matches, ran the archive without the original Git objects,
and confirmed corruption/missing blobs fail. The standalone archive checker alone
does not detect an incomplete manifest; the companion pytest completeness check
does, so both are required and were run.

Final [scoped integrated checks](qa-continuation-2026-09-28/scoped-checks.json)
at 2ea23c9: archive 21/21 original-object comparisons; **37 passed, one strict
expected failure, zero skips** for historical QA plus mutation-site checks;
archive-only mode **21 passed, one strict expected failure, zero skips**.
The [QA portability record](../qa/p0-13-portability.md) preserves its separate
actual fresh-clone and tamper runs. No broad application suite was repeated.

## Reproduced blockers and existing owner continuation

The [full QA report](../qa/p0-12-w1-retest.md) retains all findings and controls.
A bounded read-only Astra review independently reproduced these three priority
claims on untouched 71f1389 files, byte-identical to current app files; see
[hashes and method](qa-continuation-2026-09-28/priority-reproduction.json).

| Finding | Observed failure and scope | Original-owner next step |
| --- | --- | --- |
| P012-D1 | Connected refusal/downgrade is overwritten by same-version reconnect or newer unrelated policy. Three cases disclose full_solution; offline refusal control still holds. [Output](qa-continuation-2026-09-28/d1.txt). | Web retains unacknowledged restrictive intent independent of connectivity, proves causal later requests, and adds independent intent/level assertions. Changing `<` to `<=` alone cannot fix the newer-version case. |
| ORG-3 | Five missing/reordered dispatch/effect traces report exposure none. Existing panel-only/timeout and preserved prior-import controls hold. [Output](qa-continuation-2026-09-28/org3.txt). | Web preserves valid effect evidence and possible exposure despite local sequence conflict, with reconciliation uncertainty; no invented import success or authority. |
| EO-1 | Closed-root scripted activation is credited to the learner; open-root scripted control stays attributed to the site. [Output](qa-continuation-2026-09-28/eo1.txt). | Web preserves script/unknown attribution and corrects the plan. This is a Node DOM-double reproduction; actual browser verification is separate. |

Diagnostic scripts exit zero while printing failures; their exits are not passes.
The QA randomized oracle agreeing with the same defects does not certify disclosure
rules. Existing20 traces/3,000 sequences are historical executed tests with known
blind spots, not evidence that the P0-12 model satisfies current intent. P0-08 and
clients must not copy those defects into a shared contract or runtime.

Web received the concrete next segment under existing P0-12 via accepted native
message `handoff_bb3179fd65457fcab0cef5f07db7226b`, after its active timeline repair
at a safe boundary. The instruction also includes ORG-1 refusal scope; D3,
ORG-10/11 and EO-2 coverage; W1c/e/f guards after blockers. It preserves all lower
findings, owner paths and limits. No duplicate task, interruption, quota retry or
model change was requested. Receipt acceptance is not completed repair.
The [full instruction and receipt](qa-continuation-2026-09-28/web-repair-handoff.json)
preserve that exact accepted handoff.

## Remaining work and delivery

Backend and Learning normalization packets passed bounded read-only design review
and were integrated with their necessary dependency only:

| Worker commit | Integrated commit | Scope |
| --- | --- | --- |
| 14d5a7c | 9327676 | Eight consumer extensions/five INTENT schedules and continuation link |
| cad63a1 | a8e10e4 | Ten audio evidence/lifecycle schedules |
| c2f3f41 | 6d02539 | Quiet/multiple-speaker and primary-role switching variants |
| 3bb5e297 | ec370e7 | 24 planned interpretation cases and finite scorecard |
| 2b2859e | 31b224a | Four acoustic pairs and cumulative/per-person evidence |

The [integrated consistency checks](qa-continuation-2026-09-28/design-checks.json)
confirm unchanged original Backend packets and Learning cases/scorecard, all
new variants unexecuted, unreviewed human references/null measurements, eight
matching source/English hashes and no app/contract/dependency change. AP04 keeps
actual teacher text in the text-only arm; comparison does not manufacture an
audio advantage by dropping that source.

Qualification of the historical 14d5a7c design: C4-V25 does not fully spell out
possible external exposure; I05 lacks a later explicit export-dispatch layer
check; T3 does not exhaust connected-presenter/unsynced-device order races; linked
legacy v1 read/write schedules are absent. Current ADR §§2/6–8 governs these gaps,
including minimal opaque deletion fences; the older packet alone is not complete
current-ADR coverage. Other prior consumer-review commits were not needed merely
to resolve file dependencies and were not bulk-merged.

These documents execute no database, provider, device or human-reference experiment.
Shared P0-08, real PostgreSQL, native build/device and product acceptance gaps
remain explicit. Completed normalization is not being reintegrated or reopened.

Final integration checks above passed. A scoped local-link scan checked 103
references with no missing files/anchors; `git diff --check af1e160` passed over
the entire increment, including integrated commits. Full output is retained in
`qa-continuation-2026-09-28/link-checks.json`. No application suite was repeated
merely to adopt documentation. Exact normal push observations follow after delivery.

Normal push succeeded from af1e160 to
`80b99cc45d1f394f771dc0dc8f7d1c86c0e18e3d`; a separate
`git ls-remote origin refs/heads/main` returned that exact SHA. This includes the
reviewed integrations, scoped checks and current task/traceability qualifications.
No history rewriting or changes to model/effort/permission/budget were made.

Backend then received an existing-task continuation at that exact pushed baseline,
accepted as `handoff_bf3c74aebc53135c2adb482172571b4e`; [body and receipt](qa-continuation-2026-09-28/backend-coverage-handoff.json)
bound it to the missing T1/T3/linked-v1 schedule coverage above. It preserves
original vectors and remains documentation/static checks only while lead owns the
formal wire contract. Initial receipt was unread/execution not started, not proof
of completed work. Web's earlier substantive repair segment remains active; no
completion acknowledgement or waiting loop was added.
