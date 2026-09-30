# Desktop ingress 0.2.8 release

Lead extends P0-08 on published metadata baseline `9853901754aff94ccc15bb2cff6fd3938a93a77e`.
This is the smallest pure transport slice for the actual Mac descriptor0.2.7:
separate `/v2/process/desktop-frames:batch`, capability and outer version0.2.8,
unchanged ProcessBatch/ACK0.2.0 and exact metadata0.2.7. Existing0.1.0–0.2.7
families and handlers remain unchanged. No service, provider or native app started.

The contract validates unique exhaustive frame membership, full batch causality,
source/incarnation/artifact equality and native time relationships. Explicit
frameless partial/unobserved/unknown coverage retains a gap without inventing
pixels, operations or clocks. Strict JSON/4MiB limits, whole ordered HTTP replay,
verified-only ACKs and deterministic errors reuse the existing released rules.
Current authority, retained display/bytes, Stop/revoke/delete and atomic commit
remain required Backend behavior, not evidence supplied by this pure validator.
See the complete [wire rules](../../../packages/contracts/desktop_capture_ingress/README.md).

## Executed checks and review

- 53 new focused tests passed in0.38s; combined relevant desktop metadata, process,
  legacy/raw ingress and frame suites: **626 passed in2.02s**.
- Independent source review found no blocking implementation defect; **77 extra
  probes** passed. The [retained probes](desktop-ingress-review-probes.py) also
  passed on main with unchanged validator SHA256
  `b9c98917aa8661868538a4384597f454551d2e686600d43244bb748fa4fec45c`.
- Initial local collection rejected a fixture named `request`; renamed it to
  `payload`. A subsequent test constructed an invalid ACK (missing session_id,
  wrong receipt fields). Corrected only the fixture to the existing0.2.0 schema;
  the independent reviewer reran that test:1 passed in0.06s, release hold closed.
  Neither failure was counted as passed or fixed by weakening validation.
- Generated output equality, JSON Schema/OpenAPI reference checks, actual installed
  OpenAPI3.1 validator, root pinned TypeScript, shell syntax and diff checks pass.

All inputs are synthetic. These results do not prove HTTP/storage/native/provider
behavior, freshness in a real runtime, independent QA or either §7.1 product gate.

## Existing owner work and next action

Metadata0.2.7 consumer dispatches at9853901 were accepted as
`handoff_c699eaf967637000c343c3189f102f1d` (Backend) and
`handoff_a4880dc4cc704fea652bf2784dd340e3` (Learning).
Backend actual start `handoff_ccda88a6de2c9a60c6fb1047314d94e8` confirms clean normal
merge41bf53c and internal ingest/read/resolve implementation. Learning actual
start `handoff_cff78163a6158730d6ae25ecc6eb4780` confirms merge016fe716; actual
four-file delivery75a2f715a5ab672c393c91378e22f41f79e641cf arrived via
`handoff_563413d154647585f99bcb5ae53f9b9b` at10:40:48Z and was independently
approved (139 focused checks and five extra probes). It integrates as`c4e8cb6`;
352 affected checks pass on main in3.67s. Inputs/readers are synthetic; actual
Backend composition and product acceptance remain open.

Backend finishes the current internal task first. The ONE conditional next P0-09
segment will implement this separate opt-in HTTP endpoint plus explicit desktop
gap persistence over the same actor transaction/archive. Keep old routes closed,
trusted auth/current generation and retained shared-display source checks even for
gap-only batches, ordered request equality/ACK/witnesses in one transaction,
ancestor/read/deletion invariants and existing Stop/historical/revoke fences.
No new identity/store/listener/provider/default mount, or repeated DB campaign.
Write owned API/tests/evidence only; main/contract ownership stays Lead. Actual
HTTP and stored-byte behavior needs focused in-process tests before integration.
Learning's next integration check uses the actual Backend reader/resolver after
both reviewed deliveries; do not dispatch a duplicate archive or semantic model.

Mac correction8a0b33a is source-approved for hosted build/test, not compiled yet.
Windows remains on its same-owner correction. Lead now integrates/builds Mac
independently while these service consumers progress. QA awaits its existing
corrected runnable Windows candidate; interactive Mac and real AI remain gates.

## Publication and normal CI correction

Published exact59ee862be3e7a51e3b51caa31878db8aa36f6d74 was verified on
origin/main. Mac-only hosted run36704517145 was accepted at that SHA and is
running; that is not a successful build yet. The initial optional lookup of
`ci.yml` returned404 (wrong workflow filename); normal branch run listing
identified actual P0 checks36704480901 without rerunning the native workflow.

Prior9853901 CI36703094322 failed both Python matrices on exactly the independent
legacy README byte-freeze test. Lead had appended desktop navigation links to the
frozen0.1 README; executable old-family bytes were unchanged. Removed only those
new appendices, keeping the separate desktop package READMEs and canonical task
links. Original QA test unchanged:65 passed/2 existing strict xfails in0.52s.
The failed old runs are not passed evidence; subsequent normal CI must confirm
the correction. No assertion or frozen baseline was weakened.

Backend conditional HTTP0.2.8 next task was actually accepted as
`handoff_648963a23121ef1b8a62b49a4c4a28e5`; start remains separate. Meanwhile its
internal1c5eea2 delivery arrived in`handoff_f3ff70729abf3d21a897c84a65173f9c` and
is undergoing independent review before actual Backend/Learning composition.
