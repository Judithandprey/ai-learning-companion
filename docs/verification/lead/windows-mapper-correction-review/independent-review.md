# Windows mapper correction — APPROVE (bounded source/metadata scope)

Exact candidate `49305e3df61cfdc2395662796f5edc868d393150`, parent `e03fefc`; reviewed against mapper HOLD `80da708` / lead record `f276dad`. Export: `/tmp/lc-windows-mapper-49305e3`. Five inspected mapper/producer/test/script/doc files were byte-compared with their Git objects. Affected requirements/workflow remain unchanged from the preceding review. Applied project PONYTAIL LITE; no new framework or implementation.

No remaining blocker was found in this bounded correction. This approves the pure mapper changes, not actual HTTP/storage/Learning composition, native capture, provider receipt or the separately assigned alignment-cap repair.

## Confirmed corrections

- Retained `composed` must be exactly null or an object. Missing, primitive and array variants now throw `MappingRefusal`; the earlier distinct-composition sample-10 loss is closed.
- Plan-side `composed` and `ink` similarly require explicit null or an object. Missing/falsy/array bindings cannot silently drop originals. Explicit raw-only and explicit absent ink remain valid; absent editable ink is reported in `unrepresented` when visible composition exists.
- Selected `not_retained` lines enforce the producer's ordering/count/reason conditions. The former `99→1, samples=100` counterexample is refused without repair. Other selected coverage kinds now check their producer facts.
- Parsed incomplete last-line JSON alone gets the internal torn marker and unknown/missing-events coverage. A complete written `kind:'torn'` object, including one with its own `torn:true` member, is refused. A newline-terminated damaged line is refused.
- Extra SourceRef members are refused before request success, and frame/record sources are constructed from exactly the three identity fields. The prior `source_timezone` invalid-output case is closed.
- Every record now emits `external_app` / `visual` / `coverage`, matching the current pixel-admission surface identified by Lead. It does not claim structured acquisition or change authority checks. Windows raw/composed/ink metadata remain intact.

For both normal fixture sets, the independent probe compares the **entire produced request** with the `80da708` request after changing only each record's surface to `external_app`. Equality passes: native 8 records / 5 frames, harness 7 records / 3 frames. Thus no native/image identity, alias, timing, gap, composition, separate ink reference, coverage or order was silently removed to make the correction pass. Exact repeated preparation is deterministic and input plans remain unchanged.

## Producer compatibility checked

Read actual candidate `main.ts` predicates and emitters: `factsProblem` at 492–510, `notRetained` at 565–569, `observationGap` at 574–577, `recordUnfinished` at 245–260, and the pending-frame Stop handler.

Positive boundary cases confirm the stricter checks do not invent stronger producer guarantees:

- Frameless gap duration 7000.5 ms and monotonic observation 100.25 ms remain valid; a parseable offset timestamp is preserved verbatim in `unrepresented`. These facts do not become a Process clock or capture UTC.
- A valid sparse not-retained range may contain fewer samples than its span.
- Refused deferred samples `[2,1,2]` remain in that exact order. Main's sample-facts check permits this; the mapper does not sort or deduplicate it.
- Unfinished lost keys are strictly increasing, while sorted flattened deferred samples may contain duplicates. `[5,7]` with `[1,1,6]` is accepted, reflecting the pending map's possible output. Empty lost and deferred lists remain explicit unknown coverage.
- Invalid ranges, current/later deferred samples, decreasing unfinished lists, missing reasons, and invalid gap observations are refused.
- Existing source mismatch, conflicting same-file pixel facts and ended-live controls still refuse. All frameless output remains image/artifact-free with null clocks.

These are pure declared facts. Current service authority, saved originals, stable cross-request IDs, historical ceilings and exact replay remain trusted caller/Backend responsibilities.

## Executed checks

Focused author test file, once:

```sh
cd /tmp/lc-windows-mapper-49305e3/apps/windows
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node --test tests/frame-ingress.test.ts
```

Exit 0; runner reports one passing file, zero failures, 220.728272 ms. The full 83-test campaign and typecheck were not repeated.

Independent prior-defect and correction controls:

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/windows-mapper-correction-probes.mjs /tmp/lc-windows-mapper-49305e3
```

Exit 0: **41 refusal cases and 10 saved valid metadata cases**. Log: `/tmp/windows-mapper-correction-probes.log`; generated envelopes: `/tmp/windows-mapper-correction-cases/`.

Pure released-contract check, using the already pinned `40f959d` contract export:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/tmp/lc-windows-mapper-contracts-40f959d /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /tmp/windows-mapper-correction-contracts.py
```

Exit 0: all 10 envelopes pass `decode_request` and `validate_frame_batch`. Log: `/tmp/windows-mapper-correction-contracts.log`. No service, original-byte validator or HTTP/Learning composition was invoked.

New probe hashes:

- `windows-mapper-correction-probes.mjs`: `6dad6a18ecf9cb8030ca9cedb6e911ffbf1aa260d215df5cf9f6dde85e6c4e18`
- `windows-mapper-correction-contracts.py`: `0d8bcbdd79cbaef292db1e07c73e5ff942d753b9a87d577153b617426b9e45e6`

Prior bad-behavior probes remain unchanged: `windows-mapper-review-probes.mjs` SHA-256 `9090030d6ae6c345275f13a3aaacbc7a30249de4aaeba373cb0240d3306abddc`; `windows-mapper-extra-source-probe.mjs` SHA-256 `b9e4433ec3b0ca931216a36c20187cdce3af1501e3cee3954ff8c162a869dc1d`.

## Remaining boundaries / next action

Fixture documentation now explicitly marks the native fixture's editable-ink reference as metadata-only: no matching ink bytes exist. That native body is not claimed to pass original-verifying service ingestion. The historical native input and all its metadata are preserved. Harness output remains synthetic platform evidence.

Lead owns the unchanged corrected fixture's real HTTP/stored-readback/Learning composition. This review did not duplicate it or the owner's in-progress alignment-cap correction. Both §7.1 product gates and R35/R36/R46/R51/R52/R59 device/provider acceptance remain open. No native/display/network/DB/service/provider operation, dependency installation, repository/worker edit, Git mutation or task dispatch occurred; all review writes are under `/tmp`.
