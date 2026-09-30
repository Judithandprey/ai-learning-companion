# P0-05/10 Mac raw/composed descriptor candidate

2026-09-30. Owner: Learning, by explicit Lead delegation
`handoff_31adff906688ac36f6b448f8a3dbd6e3`. Assigned baseline
`5f80c0926f96d3afdb8da7a00c295b4f4e8fdd63`, preserving merge
`ea3ec234161ea4b404775600d57fc8bf95a124c5` on `team/learning`.
Write scope: isolated `packages/contracts/macos_frame/**`,
`packages/contracts/tests/test_macos_frame.py`, and this Learning evidence.
Reserved **0.2.11 is a candidate, not a released consumer contract**.

The callable validators now represent a retained Mac raw image and its actual
composed / not-composed / unknown outcome, preserve the original producer facts
and bind all distinct PNGs to the existing owner/source/incarnation/Process record.
They reject contradictory raw relations, aliases, clocks, revision/null state,
scope and image bindings without rewriting inputs. No service, app, previous
schema, dependency, root registration or source record was changed.

Applied PONYTAIL LITE with the existing schema definitions, JSON Schema runtime
and TypeScript generator; no abstraction layer or second source store was added.
Read complete affected original/English R35/R36/R46/R51/R52/R59,
§7.1/7.2/7.4, A12/A14/A26/A30/A31/A44 and current decisions at the baseline.
These product gates remain open. The exact source-to-field map, bounded schema
limits and unrepresented facts are in
[the candidate README](../../../packages/contracts/macos_frame/README.md).

## Actual checks

Using the existing read-only interpreter
`/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python`:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest packages/contracts/tests/test_macos_frame.py -q --tb=short
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest packages/contracts/tests -q --tb=short
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m packages.contracts.macos_frame.generate --check
/home/agentsdock/.local/share/paperclip-pilot-runtime/node-v24.21.0-linux-x64/bin/node /home/agentsdock/Projects/learning-companion/repo/node_modules/typescript/bin/tsc --ignoreConfig --strict --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext packages/contracts/macos_frame/generated/contracts.ts
git diff --cached --check
```

- Focused candidate: **182 passed, 0.50 s**. Initial 167-case run also passed;
  subsequent cases cover review findings around same-hash/different-file aliases,
  contradictory reopen/unknown limits, zero ticks and existing batch invariants.
- Full contract suite: **1,442 passed, 4.56 s**, including old-family rejection,
  all retained producer fields, absent/refused/empty-ink distinctions, exact
  owner/version/incarnation, both image roles and input preservation.
- Isolated generated-output check and strict standalone TypeScript check exited 0.
  The first shebang invocation failed before compilation because `node` was not
  on PATH; the existing explicit binary above completed successfully. No install.
- Read-only PNG audit against the lead's exact fixture commit: **12 distinct
  files checked** (7 raw, 5 composed), all file SHA-256, byte lengths, PNG
  signatures and IHDR dimensions match the retained metadata. Frame 1's empty
  composition aliases its raw file. No Mac/device test was executed by Learning.
- Product model/API calls: **0**, product API cost **0**. Development usage was
  not measured. Frozen retrieval corpus, labels and original failures unchanged;
  no retrieval rerun or tuning. Existing 50/50 exact and 25/30 fuzzy evidence
  remains historical, including fuzzy03/22/24/26/29 failures.

## Fixture provenance and approval observation

The hosted fixture supplement is
`484e06ae7b8fb33ac8e67a11d9a25e959311a608`, under
`docs/verification/lead/macos-composed-hosted/macos-composed-fixture/20260921T141320Z-A2ECCA80`.
`producer-status.json` SHA-256:
`ede049b1e10d6072e7aa739fb942d55d5926fbc7918765cb41101083dc7b6d73`.
`producer-events.jsonl` SHA-256:
`d5c7840a55150987ee52b566fdd819cba6b4885cd18b4d246cb74b86a0d55033`.
Each mapped KeptFrame and ComposedFrame reconstructs its exact native fields in
the regression check, including omitted-native optionals mapped to explicit null.

Automatic approval rejected `git merge --no-edit 484e06a…`, citing unrelated
changes/deletions outside the isolated scope. It was not retried or bypassed.
Read-only inspection found the endpoint diff from Learning HEAD contained
137 changed files / 13,421 deletions; from assigned baseline to supplement it
contained 104 files / 4 deletions. An endpoint diff is not a merge result.
The task explicitly permitted `git show`; that path was used to inspect only
the relevant producer fixture and retain exact test metadata in the delegated
family. The full supplement was not merged. This did not block the candidate.

## Limits and next owner

The native app-exclusion scope still says **unverified on a Mac**. Missing
composition stays unknown. PNG byte availability, current authorization, actual
renderer output, editable ink retention/history, capture-filter effectiveness,
geometry validity, cross-session clocks, live delivery and final help permission
are not certified by metadata validation. The document/revision/path cannot
stand in for an immutable ink artifact. Native session events/counters, filter
details, full ink history and ending remain separate originals.

Lead next reviews the candidate fields/version and compatibility, registers the
generator/types and releases a baseline, then coordinates native ingress and
Backend reader/binding adoption. Learning consumer adoption follows that release.
No real provider, interactive display/pen, §7.1 gate, Notability import or complete
R59/A44 acceptance is claimed. Existing source files, main, devices and previews
remain under their assigned owners.

## Pre-release integer-representation correction

Lead review `handoff_7e09a93d1233303dbcc8cf4ce65d7b25` found a runtime mismatch
with the generated schema at candidate `794fbd910051ffda253abf38229f2f40be7dce09`.
JSON Schema accepts integral JSON numeric forms such as `3.0` and `3e0`, but
Python's integer filename format raised an unhandled ValueError for these
callback ordinals. Likewise, reopened revision `2.0`/`2e0` incorrectly demanded
the non-native text `revision 2.0 ...` instead of the truthful `revision 2 ...`.
The original independent nine-case reproduction remains at
`/tmp/macos-frame-contract-negative-probe.py` and its results JSON; neither was
overwritten. The candidate checkpoint and earlier passing evidence are retained.

New regression cases first reproduced **4 failed, 10 passed, 182 deselected in
0.17 s** using:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest packages/contracts/tests/test_macos_frame.py -k 'json_integer_representations or fractional_and_boolean' -q --tb=short
```

The correction converts only the two local formatting operands to Python int
**after** existing integer/range schema validation. It does not modify the
payload, change the schema, round fractional values or admit booleans. Tests
decode actual JSON integer, decimal and exponent forms, check generated-schema
and runtime agreement, and compare serialized inputs to detect a `3.0` to `3`
mutation that Python deep equality alone would miss. Negative cases include
`2.5`, `2.0000000000000004`, `true` and `false` for both affected fields.

After the correction, the focused command above without `-k` passed **196 tests
in 0.53 s**. `python -m packages.contracts.macos_frame.generate --check` and
`git diff --check` exited 0. No generated outputs changed; no full-suite,
retrieval, native/device or provider campaign was rerun. Lead next reviews this
correction before registration/release; 0.2.11 remains unreleased. No further
fixture merge was attempted.
