# Raw capture frame 0.2.5 — APPROVE pure contract candidate

Reviewed exact Backend commit `369ff8dfd3e1acb93625d53ae18ab2f36bfa140b`, parent `5ca0c9859c453030cb93becff669902c39145bcd`. Read the current P0-08/P0-09 shared-file delegation, native mapping report, complete new README/implementation/tests and Backend evidence. Extracted that exact commit into `/tmp/raw-capture-frame-review-hrhjbv2l`; production and worker trees were not changed.

**APPROVE for lead integration/release of this isolated metadata contract. No concrete blocker found.** Generator/root-hook review remains with lead. This approval does not activate a transport or establish native/provider/product acceptance.

The implementation preserves the intended boundary:

- Pixel-capture UTC and course media position remain explicit nulls. A callback estimate requires its declared basis and clock; both uncertainties stay unknown. Sample PTS, callback elapsed time and native buffer sequence remain separate facts. An estimate cannot populate the selected process record's unqualified observation timestamp.
- All eight raw CGImagePropertyOrientation values, including mirrors, and unknown remain distinguishable. `applied_to_pixels` must be boolean false; dimensions, bytes/hash declarations and metadata are not normalized or transformed.
- Binding validates the complete existing ProcessBatch, descriptor, DisplaySourceSnapshot and OriginalArtifactBinding, then matches the explicitly selected record/frame, owner/source/version, device/session/stream and complete PNG reference. It does not silently choose the first record or discard separate ink/scope/evidence. A supplied process clock must match the descriptor's callback clock.
- Validators return None and preserve input values on success and failure. Existing attempt/coverage constraints remain effective. Scope/producer authorization, actual PNG validity/dimensions, immutable persistence and final-use permission are correctly documented as consumer obligations.
- The delta adds exactly the delegated six contract/test files plus one Backend evidence file. Comparing candidate contracts with main `1e6e185fa270fe2aa1f478701ad3069e0685a7f2` reports additions only; released families have no changed bytes. Old Frame and 0.2.4 readers reject the descriptor; there is no silent conversion or route change.

## Actual independent execution

From the exact archive, using the existing main venv with `PYTHONDONTWRITEBYTECODE=1`:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q packages/contracts/tests/test_capture_frame.py
# 138 passed in 0.35s; exit 0

/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python raw_frame_independent_probe.py
# INDEPENDENT RESULT: 24 passed; no input mutations; exit 0
```

The 138 tests include finite/nonfinite/boolean/depth/closed-field checks, identity/reference/time substitutions, all orientations, existing scope and batch invariants, old-reader rejection and generated consistency. These were actually rerun here; the author's separate 10-test compatibility/TypeScript results were read but not recounted as my execution.

The **24 additional independent probes** use a separately constructed two-record historical batch with an explicitly selected **second coverage record**, attempt scope, missing-sequence interval, extra original-ink reference, unequal buffer/process sequences, negative PTS and labeled wall estimate. They verify all eight orientations plus unknown without changing evidence; unknown estimate with retained callback clock; wrong record selection; gap overlap; invalid nonselected coverage; duplicate PNG reference; complete-reference mismatch; UTC/playhead promotion; clock-domain substitution; numeric/boolean orientation or uncertainty confusion; extra hidden timing fields; and rejection by legacy Frame/0.2.4 ingress. The probe is retained inside the isolated directory.

`git diff --check 369ff8d^ 369ff8d` also exited 0. No database, browser, CI, device, network, provider or full legacy campaign ran. Synthetic reference metadata is not proof that matching PNG bytes exist or that any displayed/model image has the intended orientation. Native mapping and explicit Backend/Learning version adoption remain the next assigned work after lead release.
