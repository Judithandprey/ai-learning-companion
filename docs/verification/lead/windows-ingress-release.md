# Windows capture ingress 0.2.10 release

Lead's next bounded P0-08 segment after released Windows metadata `d3b4b47`.
The explicit delegated patch writes only the new package and its focused test;
Lead reviewed the complete validator/generator/README/tests, registered root
checks, and owns final integration. No existing wire source or generated file
changes. It supports R35/R36/R46/R51/R52/R59 and §7.1 without accepting either gate.

## Executable result

[The pure package](../../../packages/contracts/windows_capture_ingress/README.md)
provides versioned schema, generated TypeScript/OpenAPI, full batch/binding-shape
validation, strict JSON decoding, whole ordered canonical replay and verified-only
ACK checks. The separate `/v2/process/windows-frames:batch` and capability
`process.windows-ingress.v0.2.10` remain **OFF/unimplemented** in HTTP. Outer 0.2.10
contains Process 0.2.0 and released WindowsFrame 0.2.9, never a relabeled Mac frame.

Every selected record retains every complete raw/composed PNG reference; repeated
image identities/native files cannot contradict their image facts across frames.
A gap-only batch has no manufactured image/operation/clock and still requires
current stored display/control authority. Generic wire evidence remains broader
than the trusted pixels-only producer; current Backend admission still applies
before success or replay. ACK/status data does not grant original access or claim
provider input. Actual bytes, aliases, known ancestors, Stop/revoke/delete and
lost-evidence witnesses must be checked in one existing actor transaction.

## Verification actually run

- New focused suite: 104 passes, including actual released metadata examples with
  synthetic archive/HTTP relations, distinct/shared image aliases, contradictory
  cross-frame image facts, both image references, frameless coverage, complete
  Process invariants, foreign source/incarnation, null capture clocks, ordered
  replay, raw/canonical 4 MiB limits, strict JSON, old-reader rejection and ACKs.
- Lead integrated run: **288 passed in 1.68s** across the new Windows, existing
  desktop and raw ingress test modules.
- Generated output check and root pinned TypeScript pass; whitespace check passes.
- Delegated review confirms all 103 previously existing contract files remain
  byte-identical to `d3b4b4779e6bceb7aca0ee0df4c544a22132d61e`.
- Earlier 0.2.9 milestone's normal CI 36719815461 passed both Python matrices. That
  is prior exact-SHA evidence; this later release has only its stated local checks
  until its own CI actually completes.

```sh
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m packages.contracts.windows_capture_ingress.generate --check
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -q -p no:cacheprovider \
  packages/contracts/tests/test_windows_capture_ingress.py \
  packages/contracts/tests/test_desktop_capture_ingress.py \
  packages/contracts/tests/test_raw_capture_ingress.py
.tools/node-v24.21.0-linux-x64/bin/node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
```

## Current downstream boundary

Backend's internal archive/read/resolver assignment
`handoff_389c63debe3a51c58246d6d8d798fe60` delivered `09eb9b5` via actual `handoff_85545c428e26d04423fc30aae05ee0e5`
and is under bounded review before HTTP adoption. Its future
explicit handler may use this released envelope after Lead reviews the internal
slice; no default listener, trusted grant or paid provider is activated by this
package. Preserve original upload0.2.4 and registered control rather than adding
another archive. Windows producer correction `e586b82` is newly delivered and
under bounded review; Learning consumer `18faf4f` is also delivered and under
review. Neither author result is integrated acceptance yet.

QA Windows evidence `cba66c8` integrates as `5741540` with its 32/1/2 observations
and explicit limits. QA-WIN-01 is Web's actual next correction. Independent
pixel-admission result `8b5b0f2` reports 21 passes, but its harness has a fixed-expiry/
real-reader-clock flaw; one QA-only correction is accepted as
`handoff_dce7d28756421c656638adfa5e0ab49c`. The old logs and actual negative evidence
are preserved. QA has now delivered the narrow correction `4a250bd` via
`handoff_c634c1a1f6f824acc27602785cb59b36`, awaiting integrated verification; no
original device or DB campaign is repeated. Both complete
product gates and real AI/audio/pen/Notability/interactive-Mac evidence stay open.
