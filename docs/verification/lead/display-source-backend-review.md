# Backend display-source adoption — bounded independent review

**Disposition: APPROVE integration of the assigned internal API delta. No consequential blocker found.**

Reviewed delivery `a659364e581106fd50bf831015f171cf688564a4`, parent `59f7193781c0ffeb257f2afbc1a2dad0d387db68`, applied as its exact commit delta onto main `01645a66b02b5a34a10829ad39a777651b8dae81`. Candidate: `/tmp/display-source-backend-review-9n9cgu_3`. Read all ten changed files, owner evidence, released display-source README, current decisions/task scope, and relevant existing control/capture/original/image transaction paths. PONYTAIL LITE; no new design requirements.

## Result

- Creation and exact registration replay resolve current account, control/capture scopes, membership, producer and stop facts in one actor transaction. Source/project/stream identity is immutable; a restart requires a distinct source ID. Surviving original/receipt witnesses fence missing source heads.
- Display-original uploads require the explicitly supplied trusted live resolver, including exact-byte retry. Descriptor, original and PNG reads retain the old stream incarnation after scoped stop/withdraw/restart while still checking current account/source and ownership. These are deliberately different permissions.
- Atomic frames use both existing typed-original/frame validation and the display descriptor validator. Stored causal ancestors retain their actual device/session/stream identity for validation. A stopped historical parent can legitimately precede a new display source; a mismatched ancestor cannot be accepted by substituting the child's stream.
- Source deletion retains existing tombstones and removes committed/pending display originals without adding fabricated legacy URL/text fields or affecting an independent display. Late registration validation failure rolls back both new source rows.
- The internal callback/guard remains trusted service input; this release does not authenticate producer transport, enable HTTP/default capture, prove live capture/provider delivery, or change the full-display/original-screen gates. Generic worker and broader legacy-consumer adoption are the lead's separate review scope.

## Exact independent checks

Candidate construction (run from the main repository):

```python
import io, subprocess, tarfile, tempfile
base = '01645a66b02b5a34a10829ad39a777651b8dae81'
delivery = 'a659364e581106fd50bf831015f171cf688564a4'
out = tempfile.mkdtemp(prefix='display-source-backend-review-', dir='/tmp')
with tarfile.open(fileobj=io.BytesIO(subprocess.check_output(['git', 'archive', base]))) as t:
    t.extractall(out, filter='data')
patch = subprocess.check_output(['git', 'diff', delivery + '^', delivery])
subprocess.run(['git', 'apply', '--check', '-'], input=patch, cwd=out, check=True)
subprocess.run(['git', 'apply', '-'], input=patch, cwd=out, check=True)
```

Commands run in the candidate directory:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider services/api/tests/test_display_sources.py -k 'registration_rejects_identity or recheck_current_control or failed_write_or_commit or restart_needs or sealed_historical or deletion_erases or current_source_and_account'
# 25 passed, 36 deselected in 0.41s

/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider services/api/tests/test_display_sources.py -k 'display_upload_rechecks_live_authority_even_for_exact_byte_replay'
# 5 passed, 56 deselected in 0.17s

PYTHONPATH=. /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /tmp/display-source-backend-probes.py
# 9 independent probes passed
```

The retained probe covers:

1. Stopped historical display parent → new stream/source child succeeds; old descriptor and PNG bytes remain exact.
2. Stored ancestor stream changed while causal sequence remains valid: 503, exact actor-store equality.
3–4. Coherent source-head/snapshot device or session corruption: descriptor read/atomic replay denied; image unavailable.
5. Consumed grant's producer changed: historical read and exact upload retry denied.
6. Grant changed to pending before source creation: late validation fails, both staged source rows absent, exact store equality.
7. Project owner changed: retained-original read denied.
8. Source-head owner changed: atomic replay denied and image unavailable.
9. Invalid retained stream state: historical metadata denied and image unavailable.

Initial probe construction used equal parent/child sequence after moving the ancestor to the child's stream, correctly receiving 422 before descriptor validation. The probe was narrowed by setting child sequence to 2; it then reached and confirmed the intended descriptor mismatch refusal (503). This was a probe setup correction, not a production defect.

All refusal probes compare complete actor documents. These are portable MemoryStore checks, not DB/concurrent-process/device/provider evidence. Owner-reported 61+33 and 258 regressions were not rerun or claimed as independent results. No repository/worker files were edited; concurrent lead changes in `docs/tasks.md` and `docs/verification/lead/display-source-adoption.md` were observed and left intact.
