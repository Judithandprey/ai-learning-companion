# Mac admission: common image facts across retained families

Same-card correction requested by Lead in
`handoff_458c8366ecf0cab8f732e9d3b99a90df` against delivered
`40ab42e4819bf725fd970cc330b8eb6fed7da73f`. The branch was clean before this work;
all existing delivery work is preserved. Lead's current main
`f9b2eca23e92bbee01b9a2cd49bd82925ca5074e` was inspected read-only; the assigned
released contracts remain `8e2094ee8cd2d99f58a5ed27159c724b07fb103b`.
No shared files, root configuration, old wire shapes or dependencies change.

## Failure and correction

Lead's independent reproduction submitted an ordinary Windows descriptor with
the actual audited PNG bytes but declared width 201, then a Mac descriptor for
those same bytes with width 200. Mac admission and exact replay both incorrectly
ACKed success. A distinct archive ID with the same encoded PNG SHA also passed.
Consistent width-200 reuse passed and must continue to pass. This concerns
contradictory declared image facts, not image decoding or actual OS capture.
The supplied `/tmp/macos-adapter-40ab-archive-review-probes.py` and its JSON were
read without modification; their historical failure evidence was preserved.

Two independently written regression cases reproduced the defect against the
unfixed code: **2 failed in 0.39 s**, both `DID NOT RAISE DomainError` where an
atomic 409 `record_conflict` refusal was required. After the production fix,
those same cases passed (**2 in 0.36 s**). These are subsets of final results.
Two optional DOM/synthetic controls initially attempted typed screen ingress and
hit its existing 409/422 restrictions. Their setup was corrected to explicitly
validated retained-legacy fixtures; no production acceptance rule was weakened
to make a screen-ingress endpoint accept a non-screen representation.

The existing Mac consistency check now reads common facts from every known
retained family. Archive identity compares all known immutable facts; encoded
SHA identity compares known byte length, media type and delivered dimensions.
Raw 0.2.5 and desktop 0.2.7 supply `raw_width/raw_height`; Windows 0.2.9 and
Mac 0.2.11 supply each raw/composed image's dimensions and full PNG reference.
Legacy screen frames contribute SHA/width/height without inventing MIME/length.
DOM and synthetic fixture dimensions do not attest PNG pixels; their immutable
artifact-ID/SHA relationship still participates. Known facts accumulate, so a
partial legacy descriptor cannot erase a fuller declaration or make results
depend on scan order.

Native paths, capture clocks, composition context and Windows RGBA pixel hashes
are not compared across incompatible families. Mac's native-session/file and
encoding check remains separate, as does the existing Windows checker. Both
retained metadata kinds are scanned once per Mac check; no second index, cache,
original store or image decoding is introduced. Old admission paths are not
silently upgraded. A later old-family write can expose inconsistent history;
subsequent Mac admission/replay/read/resolution must then refuse it.

Retained contradictions produce 503 before cached success; new contradictory
Mac declarations produce 409 without writes. Existing actor transaction,
original-byte/source/ancestor/current authorization and cancellation boundaries
remain in place. `read_macos` and `resolve_macos` already call the same check,
so the correction also prevents returning images from contradictory history.

## Focused verification

The existing affected identity, reader/resolver, HTTP-to-Learning, ingress and
lifecycle checks pass **269 tests in 14.21 s**, using the exact command:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider services/api/tests/test_macos_image_identity.py services/api/tests/test_macos_frame_readers.py services/api/tests/test_macos_http_learning.py services/api/tests/test_macos_frame_ingress.py services/api/tests/test_macos_frame_lifecycle.py services/api/tests/test_windows_image_identity.py services/api/tests/test_windows_identity_readers.py
```

The complete new cross-family suite passes **29 tests in 2.29 s**:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider services/api/tests/test_macos_cross_family_identity.py
```

These include ordinary typed submissions for all four old families, same-ID and
same-hash aliases, consistent retry/read/resolution, composed-image reuse, a
later old-family contradiction blocking cached Mac/read/resolution, actual
composed ASGI app 200/409 cases, explicitly retained non-screen legacy fixtures,
and a separately labeled privileged legacy hash-corruption case. Final focused
checks total **298 passed**; preliminary subset runs are not added to this total.
`git diff --check` and parsing the three changed Python files pass.

The existing metadata-only reader assertion now expects exactly one scan of
each retained frame kind; it continues to prohibit byte decoding, writes and
unnecessary original reads. A separate read-only contract/implementation review
found no blocker in comparable facts, partial-known merging, refusal ordering
or preserved family-specific semantics.

## Limits and next owner

PONYTAIL LITE reuses the existing consistency seam and released validators.
No database, native capture, provider, listener or preview operation is needed
or performed. These are MemoryStore/ASGI checks; prior PostgreSQL, device and
provider boundaries are unchanged. Lead retests this correction with the held
delivery, integrates it, and controls the next independent QA continuation.
The earlier 2,203 checks are not rerun wholesale or counted as new evidence.
