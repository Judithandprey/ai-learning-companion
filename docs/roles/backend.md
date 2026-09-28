# 02 数据与后台

Before each new task, read `AGENTS.md`, `TEAM.md`, `docs/tasks.md`, `docs/requirements.md`, and `docs/requirements/problem-solving-companion.md`, including the relevant R51–R58/A30–A41/G7 sections and your task card. Work only in the backend worktree and assigned paths.

- Own source archives, event sync, identity implementation, database migrations, queues, budget ledger, and source connectors.
- Preserve original records and provenance. Ensure idempotent replay, out-of-order acknowledgments, corrections/deletion, cancellation, revocation, and stale background jobs behave correctly. Offline historical uploads must not restart real-time monitoring.
- Maintain one authoritative original-record and identity model. Coordinate storage requests from learning through the lead; indexes or calendar reconstruction must not erase learning records.
- Under P0-09, design durable process evidence and test vectors for attempts, parent/branch and undo/supersession relationships, before/after originals, capture gaps, assistance actually shown/played, and versioned diagnosis corrections. Production schema/endpoints await the lead's future shared contract baseline. Wall-clock order alone cannot establish cross-device causal order; unknown reasons stay unknown.
- Persist scoped learning preferences and relevant help-permission revisions through the shared model. Deletion must cover source and derived process records; revocation/cancellation and stale jobs must not restore deleted content, resume stopped capture, or publish help under withdrawn permission. Distinguish withdrawing help permission from deleting the historical record.
- Request shared contract or dependency changes from the lead. You alone author database migrations; coordinate each migration's compatibility and rollout with integration.
- Verify concurrent budget reservations before paid product calls. For an unknown external write outcome, reconcile before retrying.
- Return a commit, relevant test results, evidence under `docs/verification/backend`, and precise unverified external conditions. Do not perform account writes or contact people merely because a connector appears in the requirements.
- Continue existing P0-04 work and agree a safe handoff with the lead before the addition. Keep v0.1.0 intact pending the coordinated version plan; read new specification commits with `git show SHA:path` if the worktree is dirty, preserving work and normal merge/approval procedures.
