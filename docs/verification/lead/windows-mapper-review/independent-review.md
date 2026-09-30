# Windows pure producer mapper review — HOLD

Exact candidate: `80da708f21ad87a11073de0ab5749b9cb8fee468`, parent `85de89e0bf08fc6919801c0465d220d0ed4aa3a7`. Exact export: `/tmp/lc-windows-mapper-80da708`. Shared WindowsFrame 0.2.9 / HTTP 0.2.10 contracts were exported from assigned main `40f959d` to `/tmp/lc-windows-mapper-contracts-40f959d`. Relevant main requirements/workflow/decision files have no diff from the preceding `a33932a` review. Applied project PONYTAIL LITE: reuse actual mapper, fixture plans and released validators; no implementation, extra framework, or native campaign.

Reviewed mapper, tests, fixture scripts/checker and documentation, with necessary exact producer and contract call paths. Six inspected mapper/producer/test/script/doc paths were byte-compared against candidate Git objects. The inherited alignment defect was not re-reviewed or retested.

## P2 blocker 1 — corrupt composition becomes raw-only success

`apps/windows/src/shared/frame-ingress.ts:276–288`, followed by artifact selection at `:419–422`.

The null-matching guard only distinguishes literal null. If a retained line's `composed` member is missing, `[]`, `false`, or a string, and the caller supplies the required non-null composition binding, the guard passes. `isObj(c)` is false, so the function returns `composed:null` without validating or retaining that original. The resulting record omits the composed PNG reference. `unrepresented` does not report the omission.

Independent reproduction uses **native fixture sample 10**, whose raw and composed PNG SHA values differ. Keep its original plan/bindings and mutate only the retained `composed` member. All four variants succeed. Output contains raw PNG `example-png-082c0c1e63090990` and the separately supplied synthetic ink reference, but loses the distinct composed PNG. `unrepresented` contains only the ended-session note. This is not an explicit raw-only input: a genuine `composed:null` with the same binding is correctly refused by the adjacent guard.

The released 0.2.10 decoder/full validator accepts all four outputs because they now truthfully *declare* a raw-only shape; it cannot recover facts erased by the producer mapper. Files are not deleted locally by this pure function, but the prepared envelope silently loses the composed-original binding and ink-bearing image role. No service commit or upload was performed.

**Bounded correction:** require the selected retained composition to be exactly null or a valid object before interpreting its presence. Missing/primitive/array values must produce `MappingRefusal`; preserve the existing explicit null/null raw-only case. Add the four corruption variants using a distinct-composition fixture and assert no successful envelope, rather than warning after silently dropping the original.

## P2 blocker 2 — impossible not-retained ranges become asserted observations

`frame-ingress.ts:197–200` validates only positive integers before creating `partial` / `sample_only` evidence. The actual producer at `apps/windows/src/main/main.ts:565–569` additionally requires `to_seq >= from_seq`, `samples <= to_seq - from_seq + 1`, and a string reason.

Independent mutation of native manifest line 6 to `from_seq:99, to_seq:1, samples:100`, with an explicit coverage entry for that line, returns a successful frameless record. Its returned note asserts:

```text
samples 99–1 (100) were observed and not retained: pixels changed less than the material threshold since the last retained frame
```

This cannot be a record emitted by the producer's current checks. Nevertheless the mapper labels it partial observed coverage; released HTTP validation also accepts that generic coverage shape. A retained file's semantic corruption should not become an ordinary accepted observation simply because native ordinals are not carried in the wire record.

**Bounded correction:** apply the existing producer range/count/reason invariants before translating a selected `not_retained` line. Refuse an impossible range; do not reorder it or synthesize a corrected count. Preserve zero-artifact/null-clock frameless behavior. This is a direct small comparison with the current producer, not a request for a general manifest framework. Related selected coverage facts should keep their documented unknowns and must not be silently repaired.

## P3 compatibility issue — structural SourceRef extras leak into closed wire objects

`frame-ingress.ts:297,332` spreads `plan.source` into frame/record source objects. A TypeScript value with the three required SourceRef fields plus a harmless `source_timezone:'UTC'` property remains structurally assignable; the mapper accepts it and copies that property into the output. The released decoder then rejects the prepared body: `Additional properties are not allowed ('source_timezone' was unexpected)`.

This is not a privilege bypass or loss of original files: the downstream contract fails closed. It is a smaller producer compatibility issue, separate from the two HOLD reasons. Construct the exact three-field wire SourceRef, or explicitly refuse extra members before returning a prepared request. Do not weaken the released closed contract.

## Positive checks and checked limits

- Normal fixture outputs: native has 8 records / 5 frames; harness has 7 records / 3 frames. Both retain caller-supplied batch/incarnation/source/frame/record identities and deterministic request bytes. Inputs were unchanged.
- Raw/composed declarations remain distinct for shared original, separate IDs for one file, and distinct files. Same native file under different IDs with a changed pixel digest is refused. A foreign composition source version is refused. Full references are kept on selected records in valid cases.
- Records follow selected manifest lines once, with increasing Process sequences; reversed entries are refused. The mapper is stateless across calls: stable record/frame IDs, sequence slots, replay keys and current authority remain trusted-caller/service responsibilities, not guarantees of local labels.
- Known retained gap duration remains 5500 ms; the separate 7000-ms gap is explicitly returned in `unrepresented`. A missing legacy retained duration remains null. Capture UTC/media position/latency and Process observation clocks remain null; local wall/presentation observations are not promoted into these fields.
- Frameless records use no frame, artifacts, operation, Process clock or invented missing Process sequence. Refused/deferred/unfinished/unwritten events do not become images. An `ended` manifest and an `unfinished` manifest lacking its later `ended` line both refuse live delivery. An in-progress Stop with no durable marker remains an explicit caller dependency; no live authority is inferred from the absence of a marker.
- `original_screen_overlay` / `visual` is an observation label. This pure module contains no registration, token, upload, HTTP dispatch or trusted acquisition grant. Backend must revalidate current authority and stored source/originals transactionally.
- The focused author test file also covers 32-MiB original limits, 4-MiB body refusal, IDs, malformed image/timing facts, torn tails, and unrepresented limitations. No resize, provider or actual decoding was added by this module.

## Commands and reproducible artifacts

Existing focused author checks, executed once:

```sh
cd /tmp/lc-windows-mapper-80da708/apps/windows
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node --test tests/frame-ingress.test.ts
```

Exit 0. Runner reported one passing test file, zero failures, duration 242.198336 ms. The source contains 13 named test cases; this report does not reinterpret the runner's file count or claim the author's full 74-case campaign was rerun.

Independent mapper/source controls:

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/windows-mapper-review-probes.mjs /tmp/lc-windows-mapper-80da708 /tmp/windows-mapper-review-cases
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/windows-mapper-extra-source-probe.mjs
```

Both exit 0; output from the main probe is `/tmp/windows-mapper-review-probes.log`. The explicit assertions reproduce the defective acceptance as well as valid/refused controls. A diagnostic PASS is not product acceptance. JSON envelopes are preserved under `/tmp/windows-mapper-review-cases/`.

Released-contract follow-up:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/tmp/lc-windows-mapper-contracts-40f959d /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /tmp/windows-mapper-contract-probe.py
```

Exit 0; `/tmp/windows-mapper-contract-probe.log`: nine envelopes accepted as declared metadata (including the five corrupted-manifest mappings), extra-source-member envelope rejected. This establishes why downstream schema validation cannot repair the first two problems. It does not verify PNG bytes or attest original uploads.

Probe SHA-256 values:

- `windows-mapper-review-probes.mjs`: `9090030d6ae6c345275f13a3aaacbc7a30249de4aaeba373cb0240d3306abddc`
- `windows-mapper-extra-source-probe.mjs`: `b9e4433ec3b0ca931216a36c20187cdce3af1501e3cee3954ff8c162a869dc1d`
- `windows-mapper-contract-probe.py`: `9dfd9946edb2135e042cba38aee509aa42a83d5710dd138df868de7fcd2a8996`

## Evidence boundaries / next owner

The native manifest is historical author capture evidence with synthetic archive identities; its editable-ink binding is an explicit placeholder with no matching original ink bytes. The harness is produced by actual application source under fake Electron/capture/canvas, not a native capture. I did not run the harness-capture script, read/decode fixture PNGs, ingest a batch, or claim native HTTP composition. Lead and its separate reviewer own those byte/storage checks.

No broad suite/typecheck, native/display operation, service, DB, provider, network, install, Chats, repository/worker edit or Git mutation occurred. Existing original files, source records, and prior review reports remain untouched. R35/R36/R46/R51/R52/R59 and both §7.1 product gates remain open. Lead should group the mapper input-validation corrections for Web at the next safe boundary; the already assigned alignment repair remains independent.
