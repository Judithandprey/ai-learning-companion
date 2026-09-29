# P0-07 snapshot runtime compatibility correction

Lead integration review `handoff_0a2737eac414d26a079b6e3192b72fce` found two valid
backend shapes rejected by initial Learning `1eff66e`: null frame + empty gap list,
and equal/backdated correction capture clocks. The original 159-test delivery
missed these combinations; its stricter-fixture assumptions were incorrect for
runtime v0.1. Read Backend `1596db66803ff1e93026998b12efefd83dee7db1` export,
unit seeds/tests and `docs/verification/backend/p0-07-learning-snapshot.md`.

The shared validator now checks correction owner/source/actor, required parent
membership and explicit graph acyclicity using an iterative linear walk. It does
not infer causal order from capture clocks. `FixtureArchive` alone retains its
existing missing-frame flag and strict exact-time conventions, in addition to
synthetic/test_only provenance. Runtime `ArchiveSnapshot` preserves nulls, gap
lists and clock strings exactly. Context's existing frame/order unknowns and
unresolved correction labels remain; no timestamp winner or new audio semantics.
Owner, schema, hash, frame joins, duplicate identity/sequence and reference checks
are unchanged. Nothing is silently filtered or synthesized.

Actual command on `team/learning`:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest tests/evals/test_archive_snapshot_runtime.py tests/evals/test_archive_snapshot.py tests/evals/test_memory.py -q
# 122 passed in 1.32s (16 new compatibility cases, 49 revised snapshot cases, 57 existing memory cases).
```

Two formerly incorrect negative cases were replaced by legal-input acceptance;
cyclic/foreign/missing-parent/source/actor negatives remain explicit. Equal, earlier
and later clocks × both gap-list shapes retain exact inputs through current and
history context; a reversed-clock branch/chain remains unresolved, while the
fixture-only restrictions still reject the same inputs.

Actual composed check: export main `3636dd6db1e337671892d65b8f5d7919d452986a`
to a temporary directory, overlay Backend1596db6's `services/api/domain.py`,
`services/api/learning_snapshot.py`, `services/api/tests/test_learning_snapshot.py`
and the corrected Learning `archive.py`. In MemoryStore, call
`seed_snapshot_history(store, USER)`, ingest an additional null-frame/empty-gap
observation at device_sequence 8, call `export_learning_snapshot(USER, SOURCE_IDS)`,
then `ArchiveSnapshot(**exported, user_id=USER)` and existing index/context in both
current and history. **PASS:** all 3 sources, 3 frames, 8 observations and artifact
bytes are exact; both equal/backdated corrections and their original appear with
unresolved branch labels; the store is unchanged by export/learning consumption.
The completed script is `/tmp/learning-runtime-export-c54ft_tl/snapshot_integration_check.py`
(ephemeral check location, not a production dependency).

All inputs are synthetic TEST DATA. No PostgreSQL, HTTP service, actual capture,
provider, shared schema or backend modification; only temporary composition.
Backend owns acquisition and rechecks. Full context robustness follow-up remains
separate, including its defense against forged in-memory correction cycles.
Frozen corpus, labels, ranking and original failure reports were not changed or
re-measured. This corrects the runtime seam, not full companion continuity/G6.
