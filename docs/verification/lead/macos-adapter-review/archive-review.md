# HOLD — exact Mac adapter archive review

Candidate: `40ab42e4819bf725fd970cc330b8eb6fed7da73f`, direct parent `ee34bf721188e4233567e27a3633e05ff0762678`, adopting released contract baseline `8e2094ee8cd2d99f58a5ed27159c724b07fb103b`.
Exact read-only export: `/tmp/macos-adapter-40ab-archive-review-52edjhay`.

## Finding: common PNG identity is checked only within one retained family

**P2 / correction required before integration.** `services/api/frame_variants.py:116–118` filters the actor's retained descriptors to `macos_frame` before populating artifact-ID and PNG-hash consistency maps. `capture.py:739–744` selects a family-specific consistency check. A valid retained Windows descriptor for the very same typed PNG is invisible to the new Mac check. No privileged storage corruption is required.

Independent reproduction uses the actual authorized fixture, exact audited PNG bytes and real archive code:

1. Upload the audited 200-pixel-wide Mac raw PNG through the existing typed-original fixture. Bind the trusted pixel producer; preserve owner/source/device/session/stream.
2. Submit a schema-valid Windows 0.2.9 descriptor for this original with width **201** and no composition, plus an honest external/visual/coverage Process record. Existing Windows admission returns `accepted`. Its validator deliberately validates declarations rather than decoding PNG dimensions.
3. Submit the valid released Mac descriptor with width **200**, the same original reference, a different frame/record identity and a causal link to the Windows record, through `ControlRegistry.ingest_macos_frame_request` (the complete 0.2.12 envelope entry). It returns `accepted` and commits both contradictory descriptors.
4. Exact Mac envelope replay succeeds without writes. Repeating with a **different archive artifact ID but the same PNG SHA-256** also commits and replays successfully.
5. The matching-dimension control (both width 200) succeeds, demonstrating that legitimate cross-family reuse itself is supported.

The machine evidence records three successful observations: **one compatibility control and two reproduced defects**, not three safety passes. Both defect cases retain identical actual PNG hashes; the forged declared width does not alter PNG bytes. The probe uses synthetic descriptors and in-process setup, and does not claim those pixels originated on Windows or that native capture was exercised.

### Why this belongs to the new released obligation

`packages/contracts/macos_capture_ingress/README.md:30–32` requires one archive artifact ID and one PNG SHA-256 to have consistent dimensions/encoding, while explicitly separating native-session/path identity. Lines 109–113 require cross-batch stored image consistency before every success, including replay. `packages/contracts/macos_frame/README.md:55–59` likewise says identical archive IDs or hashes cannot contradict PNG facts. These identities are archive originals/encoded bytes; a retained family label does not create another original. This is enforceable common **declared-fact consistency**, separate from authenticating producer provenance or decoding PNG IHDR. The independent decoder may later reject the incorrect Windows declaration, but that does not make the two success ACKs consistent with the Mac archival contract.

### Smallest coherent owner correction

Backend should reuse the existing actor transaction and retained-descriptor scan to compare the shared declared PNG facts of Mac images against applicable retained known families (artifact reference, width/height and PNG encoding where defined). Cover artifact-ID and hash aliases, both raw and composed roles, and pre-replay/precommit checks. Do not compare unrelated Windows pixel-digest/clock metadata to Mac facts or conflate native paths across families/sessions. Preserve each released validator and valid consistent cross-family reuse; no wire expansion, PNG decoder, new index, provider work or schema version is needed for this correction.

Use the existing error distinction: a new submitted contradiction is `409 record_conflict` with no writes; contradictory already-retained evidence is `503 unavailable` before cached success. Scope the correction so a later known-family path cannot introduce a contradiction involving retained Mac data. This report demonstrates Windows-before-Mac ordinary admission and Mac replay; it does **not** claim independent execution of every older-family/reverse-order combination. Add proportionate shared-identity regressions, with existing family/native-path compatibility controls.

## Verification and review scope

Observed on this exact export:

- `test_macos_frame_ingress.py`, `test_macos_frame_lifecycle.py`, `test_macos_image_identity.py`: **132 passed in 6.44s**.
- Independent executable: **3 observations, 0 probe errors**; the two defect observations deliberately assert the current undesired successful admission. Keep these as original bug evidence when writing desired-refusal regressions.
- Complete archive/control/frame-variant call paths and affected tests were read, including typed original byte/binding checks, all image and editable-ink references, full ancestor traversal, slots and replay/lost-witness handling, final current-authority guard, atomic staging/rollback, Stop/sealed ceilings, deletion and first-gap downgrade witnesses. The 132 tests exercised those branches without another demonstrated blocker in this bounded review.
- The Mac-only consistency cases, distinct-session relative-path reuse, same-byte aliases and current fences passed. The independent matching cross-family control also passed.

PONYTAIL LITE applied: reused existing exact-source fixtures, actor transactions and installed Python; no implementation, dependencies or speculative layer. Relevant committed playbooks, decisions and complete affected original/English R27/R29/R30/R51/R52/R59 and acceptance context were refreshed under the workflow rule. Unchanged contract-source content was reused from the prior exact-release review, with the new runtime call flow read in full.

This is a read-only internal archive review. HTTP transport/dispatch and reader/Learning review belong to the other reviewers. Owner-reported **2,203 checks** and any prior real-DB evidence remain owner evidence, not my observation. No DB, listener, native/display capture, provider, installation or main/worker edit was performed. Main's concurrent README/contracts README/lead review files were preserved. This does not establish either desktop §7.1 gate, real AI receipt, live ink or Notability import.

## Reproduce

From any directory with the preserved export:

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /tmp/macos-adapter-40ab-archive-review-probes.py /tmp/macos-adapter-40ab-archive-review-52edjhay
```

To reproduce the focused candidate suite, run from that export:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -p no:cacheprovider -q services/api/tests/test_macos_frame_ingress.py services/api/tests/test_macos_frame_lifecycle.py services/api/tests/test_macos_image_identity.py
```

Evidence files:

- `/tmp/macos-adapter-40ab-archive-review-probes.py` — complete runnable independent reproduction.
- `/tmp/macos-adapter-40ab-archive-review-probes.json` — exact observed outcomes and probe hash.
- `/tmp/macos-adapter-40ab-archive-review-checks.json` — focused execution record and exact candidate file hashes checked against Git objects.

Decision: **HOLD for the common PNG identity correction above**. No other correction campaign is requested by this review.
