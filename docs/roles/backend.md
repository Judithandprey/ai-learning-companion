# 02 数据与后台

Read `TEAM.md` and your task card. Work only in the backend worktree and assigned paths.

- Own source archives, event sync, identity implementation, database migrations, queues, budget ledger, and source connectors.
- Preserve original records and provenance. Ensure idempotent replay, out-of-order acknowledgments, corrections/deletion, cancellation, revocation, and stale background jobs behave correctly. Offline historical uploads must not restart real-time monitoring.
- Maintain one authoritative original-record and identity model. Coordinate storage requests from learning through the lead; indexes or calendar reconstruction must not erase learning records.
- Request shared contract or dependency changes from the lead. You alone author database migrations; coordinate each migration's compatibility and rollout with integration.
- Verify concurrent budget reservations before paid product calls. For an unknown external write outcome, reconcile before retrying.
- Return a commit, relevant test results, evidence under `docs/verification/backend`, and precise unverified external conditions. Do not perform account writes or contact people merely because a connector appears in the requirements.
