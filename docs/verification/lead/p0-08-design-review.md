# P0-08 proposed design and actual review evidence

2026-09-28 UTC. Start: clean main `0f944b9a482f51ab9e6ec57f21e4cea0cc42dded`.
The user-authorized P0-08 card owns this design. No new product decision, task ID,
model, runtime permission, dependency, provider call or database migration is added.

## New delivery actually read

Learning messages `handoff_68513b95ab7ff15a32af4a6a8e982363` and
`handoff_8fa295c1ce677a0000f69d50c62cfcfa` delivered 53300c8 and 45ce567.
Both ordered batches were read with distinct stable request keys and had no more
pages. Lead inspected the full consumer report and both relevant diffs, including
the actual §7.9 → §7.8 correction and four schedule cross-references. There was no
acknowledgement loop or duplicate assignment. The design-review counts are not
transaction tests. Relevant 9ce270c reading is confirmed in the actual reply.

## Design work and bounded checks

[ADR 0002](../../adr/0002-process-evidence-and-presentation.md) proposes separate
version selection and additive process relationships while preserving 0.1.0.
It incorporates both directions of consumer review, versioned evidence/authority,
late/refused requests, actual outcomes, source-preserving deletion, original-screen
evidence, the five confirmed INTENT cases and A30–A46 test plans. It is proposed,
not owner-approved, implemented, provider-connected or device-tested.

Lead inspected actual schema definitions, generators, HTTP/README/ADR 0001 and
the API import/ingest/deletion and learning archive/retrieval call paths. Two
bounded read-only auxiliary reviews checked compatibility and full relevant
semantics. Both found no blocking contradiction in the proposed candidate, while
identifying clarifications incorporated before handoff:

- New stream sequence namespace cannot reset/reuse old Observation sequence slots.
- Old endpoint writes to linked notes also require server-side invariant checks
  and invalidation; a new URL or UI negotiation does not prevent a bypass.
- One active final presenter per problem is an initial presentation design only;
  multiple screen capture, combined understanding and independent share control remain.

These auxiliary reviews are lead support, not independent QA acceptance or proof
of code behavior. The actual fixtures, app code, schema and generated files are
unchanged. No application tests were rerun for this documentation-only candidate.
ID/link/source-preservation/diff checks are stored in
[checks.json](p0-08-design/checks.json); executable protocol and concurrency tests
remain required after the separately versioned contract implementation.

## Formal baseline and owner handoff

Candidate **119108569377edccb606d148436c6962cb418ea6** was normally pushed
(`0f944b9..1191085 main -> main`); git ls-remote returned the same full SHA.
Existing Backend/Learning/QA responsibilities received one bounded review request
each through routes returned by the current native Chats list. No reset, role
replacement, duplicate business task or full-case rerun was requested.

| Role | Actual message ID | Bounded review |
| --- | --- | --- |
| Backend | `handoff_3ec895384d32b138a73a0d718a3e4750` | Sequence/identity, two-order invalidation, minimal deletion state and legacy-write compatibility |
| Learning | `handoff_bae03f52fe200cf610e06e29144a72c7` | Five relationships/J1–J4, precise scope/extent, refusal and same-question evidence |
| QA | `handoff_6c22dca6d6e286ac658fb2e01f3ce8db` | Existing A/INTENT plan plus at most three concrete adversarial timelines, at its current work's safe boundary |

All three receipts were accepted true, duplicate false, unread and
execution_started false. [Native receipts](p0-08-design/native-review-notices.json)
are retained. Owner read/review results are pending, not inferred from transport.
No wait or acknowledgement loop was created. iOS/Web/support keep their current
work; the proposed ADR has not become a released implementation contract.
