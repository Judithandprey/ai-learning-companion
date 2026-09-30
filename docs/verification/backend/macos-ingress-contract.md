# macOS pure HTTP ingress candidate 0.2.12

Lead assignment `handoff_74f8e4e6efe2f243c21d8ff6bfc0bbda`, existing P0-08/P0-04/09.
Exact assigned baseline `c2ac1c7f7f8337424812fb5e53cc078d9715548d` merged normally
into clean `team/backend` as `d8c24328d932ddad34e9990e0181f362fff735ba`.
Only the delegated `packages/contracts/macos_capture_ingress/**`, its single
test module and this Backend evidence change. Lead retains final schema review,
root generator/type registration and release. Version **0.2.12 is UNRELEASED**.

## Outcome and design

The pure `MacOSFrameBatchRequest` envelope binds released 0.2.11 retained Mac
frames to existing 0.2.0 Process records and declares the separate, default-off
`POST /v2/process/macos-frames:batch` capability
`process.macos-ingress.v0.2.12`. No handler is implemented or enabled here.

The existing Process, Mac frame, original/display binding validators, strict JSON
rules, limits, ACK/error conventions and schema/TypeScript/OpenAPI generators are
reused. No dependency, persistence layer or identity model is added. Batch-wide
checks separately compare archive identity, PNG hash facts and
`(native_session_id, native_file)`; this is necessary because each native session
can reuse callback filenames while immutable PNG facts cannot contradict one
another. Same-byte aliases across files or archive IDs remain valid.

All distinct raw/composed PNG references are required on each selected record.
Explicit unknown/refused compositions preserve raw facts without inventing
successful ink or live state. Frameless input is restricted to honest
partial/unobserved/unknown coverage without artifacts or fabricated clocks.
Every frame and record binds exact source/owner and device/session/stream.
The whole ordered envelope participates in canonical retry equality. The later
service still owns authentication, stored originals, current admission and atomic
commit/replay fences; the README and OpenAPI state these obligations explicitly.

## Source fidelity and actual fixture provenance

Refreshed current AGENTS/TEAM/workflow/role and complete affected clauses:
R03/R35/R36/R46/R51/R52/R59, A12/A14/A30/A31/A44, the original/English
problem-solving surfaces/evidence sections, current decisions and original-goal
source/time/archive cases. All four source/English pairs match the current
translation manifest hashes. The full released Mac schema/validator/README and
Lead's `macos-frame-contract-review` were read, including the corrected integral
JSON-number behavior. PONYTAIL LITE applies without weakening fidelity or tests.

The checked-in seven-frame envelope includes the **unchanged descriptor objects**
from `macos_frame/examples/macos-retained.json`. Six have composition outcomes and
one a recorded refusal. Process records and archive bindings are explicitly
synthetic; their local sequence does not claim a native whole-session timeline.
Native provenance remains the audited hosted Swift synthetic fixture at
`484e06ae7b8fb33ac8e67a11d9a25e959311a608`, with status SHA-256
`ede049b1e10d6072e7aa739fb942d55d5926fbc7918765cb41101083dc7b6d73`
and events SHA-256
`d5c7840a55150987ee52b566fdd819cba6b4885cd18b4d246cb74b86a0d55033`.
No native PNG or editable-ink archive is duplicated. These are real
Swift-generated **synthetic buffers**, not an interactive Mac capture run.

## Verification

Execution uses the existing repository virtual environment, no installation:

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m packages.contracts.macos_capture_ingress.generate --check

PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider packages/contracts/tests/test_macos_capture_ingress.py

PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -p no:cacheprovider -q packages/contracts/tests/test_macos_frame.py packages/contracts/tests/test_windows_capture_ingress.py packages/contracts/tests/test_desktop_capture_ingress.py packages/contracts/tests/test_raw_capture_ingress.py packages/contracts/tests/test_process_v2.py

/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /home/agentsdock/Projects/learning-companion/repo/node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict --skipLibCheck --target ES2022 packages/contracts/macos_capture_ingress/generated/contracts.ts
```

The new focused suite passes **124 tests in 1.28 s**. It covers all seven unchanged
native descriptors/provenance, synthetic stored-source/original bindings,
unknown/refused/raw aliases and independent ink, exact source/incarnation and
per-record PNG references, alias/hash/session-path contradictions and valid reuse,
frameless gaps and forbidden promotion, ordered replay, integral/exponent JSON,
strict raw/canonical body and record limits, old-reader misrouting, forged
authority fields, ACK/error metadata and deterministic generated outputs.
Final review added the required `missing_events` limitation to the contradictory
missing/present-sequence fixture, so it reaches that invariant rather than
failing earlier for an absent limitation. The changed four-case parametrized test
passes **4 tests in 0.15 s**, using the same command with
`::test_existing_process_batch_semantics_remain_active`. These four are a retest
subset, not four additional distinct cases. No production defect was found.

The adjacent unchanged families pass **605 tests in 2.73 s**. Generator equality,
schema/OpenAPI validation and standalone strict TypeScript checks pass. A direct runtime invocation
accepts the seven-frame example. The initial `tsc` launcher could not find Node
on PATH; the existing project executable resolved it without installation.
The next standalone command required `--ignoreConfig` (TS5112); the corrected
command above passed. Neither failed invocation is counted as a check passed.

A separate read-only review found no blocker in alias consistency, binding,
unknown/refused outcomes, clocks, replay, ACKs or default-off/runtime obligations.
That review performed no tests or external actions and is not role-QA acceptance.

## Remaining obligations and next owner

Lead next reviews/registers/releases this candidate, then assigns Backend the
bounded handler and archive/readers integration. That later work must verify
stored DisplaySourceSnapshot 0.2.3 and every distinct typed OriginalArtifactBinding
0.2.2 and actual original bytes, including separate editable ink; recheck stored
and proposed image consistency across batches; bind the trusted pixel producer,
source/owner/device/session/generation; honor stop ceilings, revocation, deletion,
cancel and stale-job fences; and atomically commit the full-envelope equality,
receipt, descriptors, records and references. Unknown/corrupt receipts or missing
original witnesses must fail closed even on exact retry. Deterministic HTTP
header/media/version/error precedence still needs adapter execution tests.

No PostgreSQL campaign, migration, service process, new endpoint handler, root
registration, device capture, provider, account, paid API or preview environment
was touched. Pure metadata checks do not verify PNG pixels, native filter/geometry,
editable ink save/reopen, actual AI receipt, audio, Notability import, either
desktop §7.1 gate or P1/full-product acceptance. Unrepresented native session
events and complete editable history remain separate originals for later mapping.
