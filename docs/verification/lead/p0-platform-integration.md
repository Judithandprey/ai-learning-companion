# P0 platform plans and independent Web verification

2026-09-28 UTC. Started on clean main
`3ab538e08cf2e64bdafbba3c8742a7e78262b8f6`. This integrates reviewed evidence
and platform plans, not native application implementation or a new protocol.
The four original/English specification pairs still match their manifest.

## Actual deliveries and integration

| Delivery | Actual mailbox message | Disposition on main |
| --- | --- | --- |
| iOS `8fc65f7886206630858263beb1745960870d8453` | `handoff_0185ab1706c392d2b5956297f6357a9a` | Ordered chain a4841d3 → b284db1 → 3f13167 → 8fc65f7 integrated as 26996cd → ee71ad2 → b352f74 → caecce9 |
| QA `3e8e99d28262d01f432f8ab579ff25842516fda8` | `handoff_cc859c43162ecec3bd658fe8ecc8cd00` | QA report, evidence and mutation harness integrated as 2a37b70 |
| Web `4c32e49935bdcbdc01597ea1a684ac8a5fc6dc14` | `handoff_ea8994a7fa609209dc3c16df63761ba3` (read in preceding turn) | c534518/8a32a8a/4c32e49 held for the two model fixes below; no P0-12 code integrated |

Native inbox/read used ordered stable snapshots, with no further pages or
unavailable messages in the iOS and QA batches. No acknowledgement-only reply
was sent. Six existing routes were actually listed; no new recipients or runtime
settings were introduced. Worker worktrees and history were preserved.

## iOS review and precise integration clarifications

Lead and a bounded read-only Astra review checked the relevant full requirements,
confirmed decisions, proposed ADR 0002 and delivered plan/checklists. The prior
three design issues and two requested corrections are addressed:

- Stopping one source ends that live path, preserves existing originals and the
  pre-stop queue, and permits historical synchronization only with independent
  authorization. Other enabled sources continue; sources that were off stay off.
- Original-screen eligibility is judged by the actual user location, operability,
  current composite and obtainable ink, not the compositor name. In-app-browser,
  frozen and owned-canvas alternatives do not pass the original-app A44 path.
- Provider evidence binds the actual transformed request and outcome; wrong/no
  image, timeout, missing vectors and lost ink are explicit negatives. It does
  not establish that the model interpreted the image correctly.
- Opening a share panel is not sharing. Actual target-share completion is still
  not observed Notability import, user-reported import is attributed, and prior
  outcomes are not erased by later cancellation/failure/unknown attempts.

Two residual wording ambiguities were corrected during main integration in the
plan, corresponding checklist and README: freshness applies to the current
view/render capture while retained screen-fixed strokes keep their original
written-at time; `prepared` describes the initial attempt, while reopening an
export preserves previous share/import outcomes and appends a new attempt.
P01 now explicitly includes fresh capture with older same-problem fixed ink.
These implement existing rules and add no user decision or protocol field.

Section 16 compares earlier Web baselines. Web 4c32e49 now agrees about scoped
live stop, authorized history and ordinary same-problem playback; those are no
longer open inter-owner differences. Its export model still needs correction.
Per-frame anchoring/ink transport and measured seek behavior remain formal
contract/platform work, not unresolved user intent. No repeated research assigned.

Main checks: [62-row P0-03 matrix](p0-platform-integration/ios-p003.log),
[48-row P0-11 matrix and 23 rejected mutations](p0-platform-integration/ios-p011.log).
A well-formed failed-device record is correctly accepted as a failure record.
These check consistency, evidence labels and generated tables, not the truth of
platform capabilities. The source research archive is retained as owner-reported
dated research, not independently refetched in this integration. All **58 P0-03
and 43 P0-11 device cases remain not_tested**. No Swift build, signing, provider
connection or real-device execution occurred.

## Independent QA on the integrated F1–F6 candidate

The [QA report](../qa/p0-02-r2-retest.md) targets exact main
`693069ac9e83ad955f808ca934b7fbec643f40f3`, whose production Web tree is unchanged
in this integration. QA actually reproduced 48 unit tests, 46/46 synthetic browser
checks, 37 trusted-input checks and the 15-case Learning probe. Two touch cases
remain unverifiable because environment controls failed to support them. QA's
independent mutation evidence catches removal of each F1–F6 fix.

QA's branch-wide **464/14** includes QA-only tests; it is not a main test count.
This turn ran only the newly integrated harness-site checks: [10 passed](p0-platform-integration/qa-harness.log).
No broad application or browser rerun was needed: production code, contracts,
dependencies and scripts remain byte-identical to integration base 3ab538e.
Existing exact-main 433/13 and CI evidence remain in the preceding record.

QA W-1 is nonblocking: card dismissal is guarded but Web's own tests miss guard
removal; the external Learning probe catches it. Dismissing an older card while
a newer request is pending also retires that pending result. Web received a bounded
existing P0-02 follow-up to specify/test the intended behavior, preserving the
conservative disclosure boundary. It is not a request for another capability audit.

## P0-12 findings held outside main

1. `organize-model.ts:176–200` treats panel opening as sharing and possible external
   exposure; tests explicitly expect this. Opening alone proves neither dispatch
   nor import. Model actual dispatch, pre-effect cancellation, unknown outcomes,
   actual import and prior attempt facts separately.
2. `disclosure-model.ts:200–223` clears an unresolved offline close on reconnect.
   The sequence old full-solution request → disconnect → let-me-try → reconnect
   without close acknowledgement → newer policy containing the old request
   produces `present:true`. No new user request or causally established reopening
   occurred. The random-test oracle mirrors this reset, so its passing cases do
   not cover the defect.

The read-only reviewer ran the three delivered P0-12 test files: **14 pass**, including
13 named traces and 3,000 seeded sequences. Lead independently reproduced the
second defect with a required-false assertion: [probe](p0-platform-integration/offline-close.probe.mjs),
[actual failing output](p0-platform-integration/offline-close.log), exit **1**.
This is an unintegrated test-model defect, not a measured production leak.
To reproduce, export the delivered commit's `disclosure-model.ts` to a temporary
path and pass its absolute path to that probe using pinned Node 24.21.0.

The narrow repair must retain unresolved refusal across repeated, foreign and
older snapshots; a higher server version alone is not acknowledgement of offline
intent. Add independently derived negative sequences and a genuine later-request
positive control. Existing originals and known failures remain preserved.

## Communication and next dependencies

Actual accepted Web messages, both using its existing route and replying to its
delivered P0-12 result:

- `handoff_4237a6732b5b006b9ea620716fbb91c3`: P0-02 W-1 bounded regression follow-up.
- `handoff_84436c4358e1078f8889585a5eb1304b`: P0-12's two model repairs, after the
  currently active unit, preserving all existing work. No duplicate task ID.

Both receipts were accepted, unread and execution not started at observation;
they do not prove reading or a completed fix. [Native receipts](p0-platform-integration/native-receipts.json).
iOS's substantive delivery confirms scoped reading of English baseline 6efa59e;
the [adoption ledger](english-working-adoption.md#first-actual-reading-report) records
that actual report separately from accepted notices to other roles.

P0-08 remains lead-owned: the next segment is the isolated formal process schema,
auth/HTTP/ACK/error and compatibility baseline, after incorporated owner reviews.
Backend/Learning consume that exact baseline later; no duplicate design review or
permission request is needed. Real PostgreSQL still needs a dedicated test DSN;
native build/device/provider/import evidence remains separate. No product question
has arisen from these fixes, and G7, A44/A46 and full P1 remain unaccepted.

Detailed integration checks: [checks.json](p0-platform-integration/checks.json).
The ordinary commit/push and exact remote observation are appended after success.
