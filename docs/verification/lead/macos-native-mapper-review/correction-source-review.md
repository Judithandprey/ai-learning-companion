# Mac mapper correction source review

**APPROVE the bounded source correction `49e5b75fe7a0ddda5aa2f82930fa0ea3a6512107`.** Both issues from `/tmp/macos-native-df581-review.md` are closed in the actual source. No new blocking flaw was found in this four-file delta. Parent is `df581e8a1d49725c966fdacd0d8e45bcbb9aeb4d`; all four exported files match exact Git blobs.

## PNG identity correction

`MacRetainedFrames.swift:481–498` now requires all eight PNG signature bytes and ImageIO's detected `public.png` type before accepting pixel dimensions. Both existing raw and separate composed paths use this helper. File path/hash/length checks, readable-image and size checks, and raw-alias behavior remain intact. There is no new decoder or dependency.

The native regression adds three focused refusal cases: a JPEG passed directly to the helper, a JPEG at a raw `.png` path, and a JPEG at a composed `.png` path. The last two update the retained SHA/length and corresponding selected binding, so they reach format validation rather than merely failing old hash checks. Each requires the format-specific refusal fragment. The helper/copy/entry call flow was read in full; changes stay inside test-owned copies.

## Competing-ending correction

`MacRetainedFrames.swift:528–551` now emits both recorded endings whenever present and names differences in reason, optional detail and recorded live-ended host. It keeps neither/only-status/only-event handling and the existing unknown/incomplete-file messages. All event dictionary facts remain in the emitted event line; the mapper does not choose which conflicting record is true or mutate originals.

The native regression first asserts matching status/event endings are both present with no disagreement, then modifies only the test session's event reason/detail/live-ended-host. It rereads the actual file and requires the original status facts, edited event facts and exact three-field disagreement line. This exercises the originally reported suppression path.

## Scope and remaining execution

Read the complete changed production functions, native regression call paths, checker delta and documentation. The checker now recomputes ending/filter/ink/stream/unknown categories and tests removal/change/invention; its actual execution remains with the separately owned hosted/checker review. No concrete Swift compile pitfall was found by inspection, including the optional ImageIO type comparison and newly imported system frameworks.

**No Swift build, XCTest, native application, checker or Python mapper emulation was run.** The 44 declared XCTests and these regressions remain NOT_RUN for this candidate until lead's exact-source hosted run. Source approval does not establish real Mac capture, geometry, overlay exclusion, transport or provider acceptance.

Exact export: `/tmp/macos-mapper-49e-export`. Machine/source hashes: `/tmp/macos-mapper-49e-source-review.json`. No repository/worker changes, Git mutation, delegation, service or provider operation occurred; root's dirty CI wiring was untouched.
