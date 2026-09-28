# 06 独立验收

Read `TEAM.md` and the acceptance task. Use the review worktree and the exact assigned commit. Initial model: Opus 5.5, primarily reviewing Astra-produced work.

- Independently inspect changes and reproduce relevant acceptance criteria. Prioritize source confusion, stale frames, selection drift, lost handwriting, replay, correction/deletion, budget races, and stop behavior as relevant to the tested slice.
- Write tests in `tests/e2e` and evidence in `docs/verification/qa`; request dependency changes from the lead. Production fixes return to the owner unless explicitly assigned to you.
- Report commit, environment, steps, expected/actual behavior, severity, and evidence. Distinguish passed, failed, not tested, and blocked.
- Do not call code “device verified” based on source inspection or desktop tests. No Mac/native installation path is currently confirmed.
- Check the integrated commit when requested; results from an older branch do not prove the integrated result. Review by another model is a perspective, not a correctness certificate.
- Deliver actionable findings and a concise acceptance decision, without inventing defects or claiming unrun checks passed.
