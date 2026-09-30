# Windows HTTP independent QA integration

QA **ee0faee298cded6e4229540e42a46bb123a305dc** integrates as **1ee43f7**.
Its exact production baseline is7b71d7b. [Independent test/evidence review](review.md)
reproduced49 passes/five strict xfails; running those five without xfail produced
only the expected `DowngradeAccepted` failures after actual HTTP200.

QA-WIN0210-01 was a **Low double retained-corruption defect**, now source-corrected asf7ef3ac with independent review and164 integrated passes; role-QA closure remains pending ([correction](../windows-witness-correction/README.md)). Its reproduction required both internal
producer-profile markers and a surviving receipt must be damaged synthetically.
No normal request/writer path to those faults is established. Backend owns ONE
narrow correction, actually accepted as `handoff_bca7700c4dddc352b5c559b8a1e1e088`
on5f80c09. Existing witness/current-access fences and all original rows must remain
intact. No database campaign is repeated. Independent retest follows QA’s current
Windows UI job; no duplicate QA task has been dispatched.

## Integration fixture correction

The first resulting-main run failed at setup (5 failed/49 errors): later native
sample regeneration had removed two of the five previously used image paths.
[Failure output](main-missing-fixture.txt) is preserved. This was not product
acceptance, and no failure was hidden by xfail. Lead froze all five **unchanged
Git blob bytes from7b71d7b** under `tests/e2e/fixtures/windows-ingress-originals/`
with their source paths, lengths and SHA-256 provenance. Only `FRAMES_DIR` changed
in the QA test; all assertions/strict xfails remain unchanged. Independent review verified all five raw Git blobs, hashes/lengths/provenance and the one-line-only test change ([receipt](fixture-freeze-review.json)). No image was
recaptured, generated or relabelled. The new location is independent of future
native evidence refreshes.

The actual main rerun with this fixture-only correction produced **49 passed,
5 xfailed in11.04s**, using MemoryStore/ASGI and synthetic consent with historical
producer PNGs ([output](main-tests.txt)). This was the pre-correction stage; the later f7ef3ac result above supersedes its five open failures without rewriting this evidence. The m9 mutation report now
accurately describes its compound staging/non-atomic change and historical
temporary-script dependency; original mutation code/logs were not rewritten.
No DB, socket, native capture, provider, physical pen or full-desktop gate was
exercised by this integration check.
