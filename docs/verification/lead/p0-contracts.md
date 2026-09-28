# P0-01 contract foundation evidence

Date: 2026-09-28 UTC. Source baseline before this change:
`4684b79ed979ad5162e1c86635a245d68601da84`. Contract version: `0.1.0`.
The commit containing this report is the foundation candidate distributed to workers.

## Implemented

- JSON Schema definitions for sources, frames, observations, selections, revisioned
  notes, event batch/ACK, limited native bridge, authorization context, budget,
  jobs, silent explanations and separate capability verification stages.
- Python structural/local-invariant validation and generated TypeScript types.
- Synthetic, hash-checked source text and SVG fixture; no account or private course.
- Exact dependency locks, local Node bootstrap with SHA-256 verification, and a
  foreground-only check script. Full R01–R50 traceability and initial gate matrix.

## Executed checks

Environment: Linux x86_64, Python 3.14.4, uv 0.12.19, Node 24.21.0,
npm 11.19.0, TypeScript 7.0.2, jsonschema 4.26.0, pytest 9.0.2.

`bash scripts/check.sh`:

```text
Generated TypeScript artifact matches schema: pass
42 passed in 0.13s
tsc --noEmit -p tsconfig.json: exit 0
```

`git diff --check`: exit 0. Original requirements remain byte-identical:
SHA-256 `c764160cde78c74d7dd76a950d593ecab45b390c7d9991b4db8ed5ad7f5dc9e4`.

The tests reject source/frame/version/device/user/session rebinding, non-finite
numbers including overflowed JSON `1e400`, out-of-frame geometry, contradictory
polygon/bbox, invalid timezone/time, unsafe integers, invalid revision progression,
missing original ink, incomplete note evidence, unknown bridge actions/credentials,
and inconsistent budget settlement shape. Fixture hashes and type generation are checked.

An independent read-only agent review reproduced four initial weaknesses: NaN,
contradictory geometry, generator structural omissions and an unsafe integer field.
Those were fixed and regression cases added. The note evidence-set ambiguity was
also resolved. This review is not a substitute for QA reproduction on the integrated
application. Numeric constraints, identity and foreign keys still require runtime
service checks; generated TypeScript cannot enforce them alone.

Dependency resolution initially failed due to sandbox DNS. The exact network
operations succeeded through normal approval, without relaxing sandbox settings.
All installed tools are in ignored project directories; no service was started.

## Not yet verified or implemented

This is a contract foundation, not a backend/login service, native app or Safari
extension. No database migration, durable source archive, atomic budget ledger,
real provider call, OAuth refresh, browser interaction, iOS compilation, device
capture, Pencil behavior or external note import is proven. No G1–G6 gate or full
R/A acceptance has passed. Graphiti has not been installed or evaluated.

Next evidence: three assigned module probes, backend persistence/budget skeleton,
then QA on the integrated candidate. Follow `docs/tasks.md` for exact ownership.
