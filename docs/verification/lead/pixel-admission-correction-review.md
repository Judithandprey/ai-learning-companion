# Independent correction retest — pixel producer admission

**APPROVE the bounded correction at `2209a11310f7b782e287c5d948e12af59dd6b693`, together with its reviewed base `81e5441bb2a04f4e1f9080c046d19c18d01295bf`.** The one retained-gap/two-marker-loss HOLD in [the retained initial review](pixel-admission-review.md) is resolved. No new blocker was demonstrated in this correction's scope.

## Exact source and bounded change

- Exact correction: `2209a11310f7b782e287c5d948e12af59dd6b693`, direct parent `81e5441bb2a04f4e1f9080c046d19c18d01295bf`.
- Fresh complete export: `/tmp/pixel-admission-review-fix-34iw6m3n` (`review-candidate.json` records identity). No worker worktree or pending lead probe adaptations were used.
- Production delta is eight added lines in `services/api/capture.py` inside the existing common `_admit_evidence` gate. Other changes are eight focused regression cases/helpers in `services/api/tests/test_producer_admission.py` and a bounded evidence update in `docs/verification/backend/pixel-producer-admission.md`.
- The new branch recognizes the canonical desktop HTTP replay namespace, decodes a nondeleted retained ACK through existing `_decode_ack`, and refuses an ACK for the current owner/stream. It remains a negative witness only. It neither repairs the profile nor grants evidence authority, changes wire validators, rewrites old records, or requires a migration.
- The branch remains before cached-success return and archive writes, after current authority/lifecycle/original checks. Prefix construction uses the existing canonical key helper and the route component before the caller's idempotency key. Merely mentioning `desktop-frames:batch` in a valid generic client key does not match the desktop namespace.

## Executed verification

Pinned interpreter: `/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python`. All execution was inside the exact export with MemoryStore and in-process ASGI; no DB/listener/native/provider/install/network campaign ran.

```sh
cd /tmp/pixel-admission-review-fix-34iw6m3n
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python \
  -m pytest -p no:cacheprovider -q services/api/tests/test_producer_admission.py \
  -k gap_replay_witness
```

Observed **8 passed, 48 deselected in 0.84s**. The 48 previously reviewed admission cases were deliberately not rerun; the parent's independent result remains 48 passed at `81e5441`. Backend's reported full 56-case execution is owner evidence, not a newly repeated reviewer campaign.

Independent runnable probe:

```sh
cd /tmp/pixel-admission-review-fix-34iw6m3n
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python \
  review-correction-probes.py
```

Observed **10 checks, all assertions passed**. Results: `/tmp/pixel-admission-review-fix-34iw6m3n/review-correction-results.json`.

| Independent check | Observed outcome |
| --- | --- |
| Original honest first desktop gap, both profile fields removed, new structured raw fallback | 403 forbidden; every actor document unchanged |
| Same original reproduction through legacy frame ingress | 403 forbidden; every actor document unchanged |
| Existing successful generic raw receipt, later desktop gap/profile loss, exact raw retry | 403 forbidden; cached success withheld; no writes |
| Equivalent exact legacy success retry | 403 forbidden; cached success withheld; no writes |
| Never-desktop generic structured raw commit/retry, client key mentions desktop operation | 200 accepted, exact ACK retry, no replay writes |
| Equivalent generic legacy commit/retry | 200 accepted, exact ACK retry, no replay writes |
| Same actor, separately registered generic stream beside retained desktop gap | Accepted; old rows unchanged |
| Other actor with identical stream ID in the same MemoryStore | Accepted; first actor unchanged |
| Recognized desktop replay with invalid JSON ACK, against exact old raw success | 503 unavailable/retryable; no writes |
| Recognized desktop replay with invalid-schema ACK, against exact old raw success | 503 unavailable/retryable; no writes |

The original failed-case evidence remains untouched at `/tmp/pixel-admission-review-q0hyuywq/review-probes.py` and `review-probes-results.json`. It records the actual prior 200 responses and persisted structured claims. The new probe asserts the corrected 403/no-write outcome; the old evidence was not edited to convert failures into passes.

## Scope and integration conclusion

Lead may integrate the reviewed base and this direct-child correction. The adopted ADR's current pixel producer restriction is enforced without globally banning legitimate structured/mixed evidence or changing released Process 0.2.0 / desktop 0.2.7 / ingress 0.2.8 syntax. Explicit trusted-host adoption remains separate from client fallback.

The double-marker deletion is synthetic internal damage, not a demonstrated HTTP capability. This retest covers the retained, attributable desktop replay witness and its malformed ACK conventions, not arbitrary simultaneous destruction of every provenance/witness field. Source deletion/lifecycle tombstones retain their existing handling. No further broad corruption campaign is needed for this delta.

Main/worker source and pending lead edits were preserved; all review artifacts are under `/tmp`. This approval does not assert actual DOM/own-ink acquisition, Windows/macOS live capture, provider input, full mixed-input acceptance or full product completion. Earlier PostgreSQL/hosted Swift results retain their author/QA provenance and original commit scope.
