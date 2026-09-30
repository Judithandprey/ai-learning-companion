# APPROVE — bounded Mac cross-family correction

Exact candidate: `b83ee3e6de8275713dddce37f2be0b58376cc0be`, parent `40ab42e4819bf725fd970cc330b8eb6fed7da73f`. Reviewed the complete six-file delta and correction report in an exact Git archive export at `/tmp/lc-macos-adapter-b83`. No repository/worker files changed.

The original cross-family identity HOLD is closed for this correction. In `services/api/frame_variants.py:101–147`, Mac admission/read/resolution now compare artifact-ID and encoded-SHA facts across the known retained families. Raw/desktop delivered dimensions and Windows/Mac raw/composed images participate. Legacy screen dimensions participate; legacy DOM/synthetic viewport dimensions do not. Missing legacy MIME/length remains absent. Known facts accumulate without dropping fuller declarations. Native paths, clocks, Windows RGBA hashes and composition context remain separate; Mac native-session/file checks remain intact. Old validators, wire formats and writers were not widened or rewritten.

Independent corrected versions of the preserved original probe passed **5/5 groups**, using real typed MemoryStore admission, current readers/resolvers and existing audited PNG bytes with explicitly synthetic descriptors:

- Windows width 201 then Mac width 200 for the same artifact: Mac returns **409 `record_conflict`**, no archive writes.
- The same contradiction with a distinct artifact ID for the identical PNG SHA: **409**, no writes.
- Width-200 same-artifact and same-SHA-alias controls: accepted, exact replay unchanged, exact retained descriptor readback, original raw and composed bytes preserved.
- Mac accepted first, then ordinary Windows width-201 declaration accepted by its unchanged writer: exact Mac replay and current metadata read return **503 `unavailable`**; raw and composed resolution both return unavailable without writes. No private-store corruption was used to construct this case.

The old-family writer's acceptance boundary is deliberately unchanged. Thus the fix prevents subsequent Mac success against inconsistent retained history; it does not claim to prohibit every future contradictory old-family admission. This matches the assigned correction scope.

Focused independent execution: **30 tests passed in 2.61 s** (29 new cross-family tests plus the changed metadata-only scan regression). This covers all four older families, composed-image references, ordinary later contradictions, ASGI 200/409, explicitly retained non-screen legacy controls and a separately labeled privileged corruption control. `git diff --check` passed. The complete six exported changed files were compared byte-for-byte with the candidate Git objects. No declared broader author or Lead test run is counted here.

## Reproduce

From `/tmp/lc-macos-adapter-b83`:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider services/api/tests/test_macos_cross_family_identity.py services/api/tests/test_macos_frame_readers.py::test_metadata_scans_each_retained_frame_kind_once_without_decoding_or_writing
```

Independent control command, any working directory:

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /tmp/macos-adapter-b83-correction-probes.py /tmp/lc-macos-adapter-b83
```

Evidence:

- `/tmp/macos-adapter-b83-correction-tests.log`
- `/tmp/macos-adapter-b83-correction-probes.py`
- `/tmp/macos-adapter-b83-correction-probes.log`
- `/tmp/macos-adapter-b83-correction-probes.json`
- `/tmp/macos-adapter-b83-correction-review.json` — source/evidence SHA-256 receipt

The previous `/tmp/macos-adapter-40ab-archive-review-probes.py` was preserved unchanged, with its hash checked before/after the independent controls. Its report and JSON remain separate historical failure evidence.

Limits: PONYTAIL LITE applied by reusing the existing transaction/validator seam and bounded controls. This is correction source/MemoryStore/ASGI evidence only. No native capture, Swift execution, database, listener, provider, real-device or product acceptance is claimed. Root owns integration and final main validation.
