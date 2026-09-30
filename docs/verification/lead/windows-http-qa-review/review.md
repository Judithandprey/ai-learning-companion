# Independent review: Windows ingress QA ee0faee

Decision: APPROVE the QA test/evidence delivery as integratable, with the minor evidence wording/reproduction correction below. Preserve QA-WIN0210-01 as a real Low retained-corruption defect for a bounded Backend correction. This is API component evidence, not full-product acceptance.

Reviewed exact delivery `ee0faee298cded6e4229540e42a46bb123a305dc`, parent `56f8ecd9078d2b97acb622b2ed101c4b87b1f2cd`, against production `7b71d7b19db29f877948f21c9921b2352d9b7d00`. Export: `/tmp/windows-http-qa-ee0faee`. No repository/worker changes. Applied project PONYTAIL LITE: read actual shared call flow, reuse the delivered narrow reproducer, and do not rerun old campaigns.

## Source and test quality

- The delta contains 23 added files: one test and QA documentation/evidence only. `services/` and `packages/` trees are byte-identical across production, QA parent and delivery. Independently checked 244 exported files against raw Git blob IDs (the production trees and all changed files), with no mismatch.
- Test SHA-256: `f5546cc4be4f0ac6214e0a8e9d41e0c7dcd6b1b6478a1364040f0390237c3f8c`; the evidence logs record the same hash.
- The test uses actual `create_local_capture_runtime`, composed ASGI routes and MemoryStore. Registration, display source, original uploads, batches and original reads go through `httpx.ASGITransport`; no TCP listener or database is used. Source/account mutations are explicitly labelled Archive-domain stand-ins. The reused `postgres_desktop_runtime_check.scenario` builds only a scratch MemoryStore fixture; its database runner is not called.
- The fixed runtime clock and reader guard use the same injected time. Refusals compare every actor document, assert exact route-version error bodies, and reject leaked PNG prefixes. The exception spy prevents unexpected errors masked as 503 from satisfying the tests, except the expressly injected storage failure.
- Positive controls, separately bound image IDs, exact original-byte reads, current fresh/cached fences, under-lock token changes and late staged-write rollback are substantive checks. Stored `read_windows` / `resolve_windows` feed actual Learning preparation, retaining raw/composed distinctions and unknown/provider boundaries.
- All five source PNG SHA-256 names, lengths and released artifact descriptors agree; IHDR is 2560 × 1600, 8-bit RGBA. Those are author producer samples, not independent live capture/composition or ink-recovery evidence. Synthetic ink, identities and token are explicitly labelled.

## Independent execution

Working directory `/tmp/windows-http-qa-ee0faee`; interpreter `/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python` (Python 3.14.4, pytest 9.0.2).

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -p no:cacheprovider tests/e2e/test_p0_13_windows_ingress_qa.py -v -ra
# exit 0: 49 passed, 5 xfailed in 11.24 s (54 collected)

PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -p no:cacheprovider -v --runxfail -k 'malformed_gap and not fresh-empty' tests/e2e/test_p0_13_windows_ingress_qa.py
# exit 1: exactly 5 failed, 49 deselected in 1.49 s
```

Every selected failure was `DowngradeAccepted` after an actual HTTP 200, not a setup exception, unexpected 503 or assertion mismatch. The marker is `xfail(raises=DowngradeAccepted, strict=True)` at test lines 610–612, and that exception is raised only inside `response.status_code == 200` at 640–642. A corrected refusal will produce strict XPASS until the corresponding bug marks are removed; remove them with the Backend correction instead of relaxing strictness.

## QA-WIN0210-01: confirmed, Low, two injected retained-state faults

The test first commits a Windows gap-only receipt, then an honest raw 0.2.6 batch and successful exact retry. It directly deletes both internal `producer_profile` fields (test lines 576–577), then independently damages the Windows gap receipt (628–634). These operations are synthetic retained-store damage, not client request fields. No ordinary-client exploit is established.

| Second fault after marker loss | Fresh structured raw request | Cached honest raw retry |
| --- | --- | --- |
| `deleted: 1` in the full receipt | 200; store changed | 200; exact cached ACK; no store change |
| `deleted: true` with all full receipt fields retained | 200; store changed | 200; exact cached ACK; no store change |
| receipt replaced with `{}` | 503; unchanged (passing control) | 200; exact cached ACK; no store change |

Marker loss alone refuses honest, structured and cached raw requests with 403 and no writes; the Windows route also refuses the unmarked stream. Fresh `{}` reaches the independent absent-record receipt decoder at `capture.py:620–625`, whereas the cached retry has no absent records. The unmarked-stream witness at `capture.py:138–142` skips truthy deletion flags and empty keys. `_admit_evidence` at line 726 precedes cached success/commit, but cannot fence what its scan silently skips.

Minimal Backend scope: classify scanned receipt structure before using deletion truthiness or key prefixes; skip only a valid exact `{key, deleted: true}` tombstone, and reject malformed surviving receipt/key/deletion state deliberately with 503 and no mutation. Preserve genuine tombstones, unrelated valid legacy receipts and marked/unmarked compatibility. Reuse these five failing cases, the fresh-empty control and lost-marker-only controls; make the five ordinary passing regressions after correction. A new protocol or host is unnecessary. Other truthiness sites and an extra record witness are not additional proven defects in this review.

## Evidence limits and minor correction

Committed logs consistently show 54 distinct cases, 49 pass / 5 xfail; pre-H1 sensitivity reports precisely the two stated failures; later production reports 49/5. Mutation evidence contains 14 variants with 13 detected and the enabled-bit-only m14 survivor explicitly disclosed. Those historical/regression/mutation/future-clock runs were inspected, not independently repeated. We did not run the 485/312 suites or 14 mutants.

Non-blocking correction: report line 102 calls all 14 mutants “single-point,” but `mutations/m9_write_first_record_early.py:1–2,10` deliberately combines early record staging with m8's non-atomic store. Its final line also hard-codes `/tmp/qa-win0210-review-probes/m8_nonatomic.py`. Call m9 a compound mutation, and either state that reconstruction dependency or resolve the archived sibling `m8_nonatomic.py` relative to the mutation script. This does not invalidate the independently reproduced 49/5 result or the five actual-200 failures. Do not imply m9 isolates early staging alone.

Retained limits are accurate: no independent PostgreSQL/concurrency, transport framing campaign, native Windows, producer transport/mapping, hardware input, provider or §7.1 gate. Account disable is tested as an operation, not an isolated enabled bit. Cached source deletion is also fenced by receipt erasure. No real credentials, database, socket, native UI or provider were used in this review.

Evidence: `/tmp/windows-http-qa-review-source.json`, `/tmp/windows-http-qa-ee0faee-evidence-audit.json`, `/tmp/windows-http-qa-review-runxfail.log`, and `/tmp/windows-http-qa-review-pytest.log`. The last file is the final output chunk including the complete result summary; its first three PASS lines and part of the fourth were returned by the initial tool call before file capture. Committed `pytest-verbose.txt` is the complete author transcript. Originals were preserved.

## Narrow integration follow-up: frozen PNG originals

APPROVE the fixture relocation observed on main `1ee43f7da2f09635a3bcf0308719d47c310ebadc` plus the pending patch. All five PNG files under `tests/e2e/fixtures/windows-ingress-originals/` are byte-for-byte identical to their specified `7b71d7b19db29f877948f21c9921b2352d9b7d00` Git blobs. Each filename, SHA-256, byte count and provenance source path agrees; the directory contains exactly those five PNGs plus `provenance.json`.

Compared the entire test byte string with original QA `ee0faee`: replacing only the one `FRAMES_DIR` line produces the entire current test exactly. No assertions, fault injection, marks or test logic changed. New test SHA-256 is `550f5619cfa75afc8f07318684597c775f7621c6dc194b4caf15e587356fa072`; provenance SHA-256 is `aa80c32dce1087ed80c10453c9e18f21bcd9dfe058b33dad5029d8c203229879`. This preserves the old-source finding and resolves the fixture lifetime dependency on a regenerated native evidence directory.

The report now describes m9 as a compound mutation and expressly states its historical temporary-path reconstruction dependency. m8/m9 scripts and the mutation log remain byte-identical to the QA delivery. No tests/mutants were rerun by this reviewer; the lead owns the focused integrated run. Detailed exact-blob results: `/tmp/windows-http-qa-fixture-freeze-review.json`.
