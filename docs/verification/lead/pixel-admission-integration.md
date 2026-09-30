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

## Published baseline and actual handoffs

Ordinary `origin/main` push succeeded at
**`d412ed90495b0bb894ec6f7059d9ebf62a2186fb`**. Normal P0 CI36716538614
completed successfully on this exact SHA: both Python3.12 and3.14 / Node24.21.0
matrices passed. This is ordinary CI, not new DB/native/provider evidence.

- QA conditional next admission retest: `handoff_41583813c76f749512b5a52e8031931d`,
  accepted initially unread, after its current Windows pass; actual start pending.
- Backend next bounded shared-file delegation:
  `handoff_521ed80a47b91ad95d545c2bacf102ee`, accepted initially unread.
  Prepare only `packages/contracts/windows_frame/**`,
  `packages/contracts/tests/test_windows_frame.py` and owned evidence against
  actual producer04caef61, with proposed version0.2.9. Lead retains final release,
  compatibility and root registration. No endpoint or consumer is widened.
- Web explicitly released the shared Windows display in
  `handoff_9556abe450b5be4adf7cb752064af877` at12:41:27 UTC: no Electron
  processes at12:40:53/12:41:16, author-only staging removed, no other apps touched.
  Lead forwarded actual release through `handoff_232d939e414ee1c0519fb8d1b2676a90`;
  QA can run the one quiet existing-candidate pass. Web holds interactive launches
  until explicit Lead release. Source/portable work continues.
- Web also disclosed overlapping self-tests12:15–12:38, including the final
  retention40/40 run12:37:09–12:38:00. Do not treat its timing as quiet-desktop
  evidence. Preserve sample-byte facts and unaffected checks with that caveat.

These are actual delivery/release observations, not product acceptance or proof
that a newly accepted async task has started.

QA then actually ran one quiet pass12:43:09–12:44:17 UTC on exact061efe2 and
released its own Windows processes at12:44:19, reported in
`handoff_eee09df967b0d1f2f6e270e16fb52360`. The detailed result/commit is pending;
completion of its run alone is not acceptance. Lead returned the display to Web
without asking for another completed self-test campaign.

Backend actual start `handoff_9e7ec1b77f0068ff1170f1a8dbecd3d3` at12:46:39 UTC
confirms normal merge `3ba7189519f1da66e2a6e28d4d0fa56ea35f2deb` containing the
assigned release and source-based implementation. Its initial read correctly
keeps held frame/sample ordinals and ink/capture sessions distinct, and avoids
inventing exact subtraction or missing gap duration from incomplete producer facts.
