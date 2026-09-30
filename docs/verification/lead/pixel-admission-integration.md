# Desktop pixel producer admission — integrated source

The reviewed Backend base `81e5441bb2a04f4e1f9080c046d19c18d01295bf`
and direct correction `2209a11310f7b782e287c5d948e12af59dd6b693` integrate
as `e4b2d41` and `03feb72`. No conflicts or discarded work. The two pending
Lead runtime/gap probes were preserved and adapted to explicit trusted binding.

The current pixels-only producer must be explicitly bound by trusted host code.
Its records cannot assert structured/mixed editing provenance through any capture
route or cached-success retry. A retained desktop-route gap ACK now prevents
generic fallback after both profile fields are lost. This is a refusal witness,
never positive authority or reconstructed consent. Legitimate generic inputs,
historical originals/readers and released wire contracts remain unchanged.

## Review and actual main checks

- [Initial HOLD](pixel-admission-review.md): retained frame fencing passed, but
  gap-only raw/legacy fallback incorrectly returned 200 after synthetic marker
  loss. This did not demonstrate HTTP ability to remove internal markers.
- [Correction review](pixel-admission-correction-review.md): eight new regressions
  and ten separately authored probes passed on exact corrected export.
- On integrated main `03feb72`, **460 passed in 19.60s** using the existing
  `.venv/bin/python -m pytest -q -p no:cacheprovider` over `test_producer_admission`,
  `test_desktop_frame_ingress`, `test_desktop_ingress_http`,
  `test_desktop_capture_runtime`, `test_control`, `test_capture_runtime`,
  `test_desktop_frame_readers`, and `test_ingress_mounts` under `services/api/tests`.
- [Correction probes](pixel-admission-correction-probes.py) also passed ten
  assertions on main: raw/legacy refusal before write/cached success, compatible
  generic retry and other stream/actor, malformed retained ACK unavailable.
- Existing [runtime probes](desktop-runtime-review-probes.py),
  [gap probes](desktop-gap-review-probes.py), and
  [stored Learning composition](desktop-runtime-context-probes.py) passed
  **12 + 7 + 5 groups** on main. Consent, identities, pixels and MemoryStore are
  synthetic. No provider, native launch, DB, listener or fresh device evidence.
- `git diff --check` passed. No dependency, migration, schema or default route
  activation changed. The original review-candidate labels in older probe
  output are now explicitly named `original_review_candidate`.

Owner evidence remains separately attributed in
[Backend report](../backend/pixel-producer-admission.md): prior real PostgreSQL
16 HTTP checks/five groups and actual earlier Swift fixture composition. Those
campaigns were not rerun for the eight-line correction. Main source approval
does not close QA-DESKTOP-RT-01 until independent QA retests the released revision.

## Next owner and boundaries

Lead publishes this source/evidence, then sends QA one conditional admission
retest after the already active Windows behavior pass. Verify current pixel-only
admission, exact replay/lost-marker cases and retained generic/history controls;
preserve previous PostgreSQL/restart results without another DB campaign.
Backend waits for a concrete consumer/host delta after that release.

Windows retained-frame delivery `04caef61` is under separate source review;
Lead will bind a Windows descriptor to its actual file/source/time facts, never
reuse the Mac-specific 0.2.7 profile silently. Mac ink remains owned by native.
Actual provider input, interactive Mac and both per-OS product gates remain open.
