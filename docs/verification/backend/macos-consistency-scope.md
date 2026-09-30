# QA-MAC-01: scope Mac image consistency to the attested dependencies

Lead assigned this bounded P0-09 correction in
`handoff_6e781019814be6996e63873daeb2d210` after accepting the QA observation.
The clean backend worktree preserved the preceding host delivery and merged
assigned `0c08415bdc092d177dd3bcec9f1d7e7e2f265790` normally as
`daacde7c1f2db6b060967a38fd517abc23424d1b`. The original
[independent review](../lead/macos-api-qa-review/review.md) and QA source remain
unchanged. Deleting originals is not the repair.

## Failure and correction

Previously, the common Mac consistency checker compared all retained image
facts for the actor before examining the requested descriptors. Two ordinary,
well-formed old-family declarations with contradictory dimensions could deny
unrelated Mac frame reads, image resolution, exact ACK replay and even the
actor's first parentless image-free Mac gap. This was an availability defect;
the conflicting images must still be withheld.

The same checker now requires explicit stored targets. A reader supplies all
complete descriptors in its validated selection; a resolver supplies the exact
stored descriptor, including both raw and composed images regardless of the
requested decoding role. Admission supplies all proposals plus the stored
framed ancestors already checked by the existing dependency walk. That walk
collects frames only after source, incarnation, slot, original and binding
validation, including ancestors reached through intermediate frameless gaps.
Read selections retain their existing external-parent semantics; they do not
invent or recursively fetch unselected history.

Relevance follows image artifact ID **or** encoded PNG hash across every known
family and source, plus Mac native-session/path identity. It follows aliases
transitively and independently of scan order. A matching image does not make a
different image in that non-target descriptor relevant: the complete-descriptor
rule applies to descriptors actually admitted, returned or resolved. Otherwise,
an unrelated composed image sharing a common raw image could recreate the
actor-wide refusal. Explicit targets always include both image roles.

Every retained descriptor is still completely validated. Unknown/corrupt
variants fail closed even for empty image scope; only unrelated contradictions
between otherwise valid declarations are excluded. Partial legacy facts still
accumulate without inventing PNG MIME, length or viewport dimensions. Relevant
retained contradictions remain 503; a fresh proposal creating a new conflict
remains 409, or 503 for an exact committed replay. Mixed affected selections
fail atomically, current authorization and final Learning reread remain in
place, and no original is deleted, rewritten or reconstructed.

PONYTAIL LITE reuses the existing actor transaction, family validators,
consistency accumulator and dependency traversal. There is no new store,
persistent index, cache, decoder, wire family or old-writer policy. Each retained
frame kind is scanned once; the in-memory identity walk can be quadratic for a
long reverse-ordered alias chain. This bounded correction does not claim an
archive-scale performance benchmark.

## Verification

Requirements refreshed at the assigned baseline: complete source/English
R29/R30/R52, A12/A30/A31, process evidence/completeness clauses, current
decisions and original archive/time-relation verification; released Mac 0.2.11
and 0.2.12 identity, ancestor, current-access and atomic-replay rules. All four
source/English manifest pairs matched their recorded hashes.

Independent desired-behavior tests reproduced the defect before the production
change: **4 failed in 0.83 s** through HTTP/reader/Learning paths, and **1 failed
in 0.33 s** for the first parentless gap after an ordinary raw/raw contradiction.
These are regression evidence, not additional final passing tests. A test
fixture initially selected two audited composed images with the same hash; it
was corrected to distinct actual images with an explicit hash assertion, rather
than weakening the expected consistency boundary.

The new HTTP/reader/resolver/Learning suite passes **9 tests in 1.77 s**:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider services/api/tests/test_macos_consistency_scope.py
```

It uses ordinary authorized raw/Windows HTTP writes to establish cross-source
same-hash contradictions. Unaffected full-frame/gap reads, both image roles,
Learning and cached/new gap ACKs succeed; affected or mixed requests remain
atomic refusals. Fresh conflicts remain 409; retained conflicts remain 503.
Final Learning reread admits an unrelated new contradiction and withholds a
packet when the selected image changes. Original rows remain intact throughout.

Existing affected identity, reader/resolver, Learning, admission and lifecycle
checks pass **230 tests in 12.13 s**:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider services/api/tests/test_macos_cross_family_identity.py services/api/tests/test_macos_image_identity.py services/api/tests/test_macos_frame_readers.py services/api/tests/test_macos_http_learning.py services/api/tests/test_macos_frame_ingress.py services/api/tests/test_macos_frame_lifecycle.py
```

The new dependency/alias suite passes **25 tests in 1.84 s**:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -p no:cacheprovider -q services/api/tests/test_macos_consistency_dependencies.py
```

This covers direct and transitive framed ancestors from legacy, raw, desktop,
Windows and Mac families; gap admission and replay; path-only conflicts across
sources in one native session; valid path reuse in different native sessions;
partial legacy facts; unknown/corrupt variants with empty targets; reverse-order
alias closure; per-image sibling non-expansion; and both cancellation types
leaving exact documents unchanged before the same request succeeds. Ordinary
old-writer disagreements and explicitly injected immutable-store damage are
labeled separately. The preliminary 24-case run overlaps and is not added.

Final focused total: **264 passed**. Independent read-only review found no
blocker in target completeness, submitted-versus-stored ancestor overlap,
refusal classification, alias closure, current authorization or pre-write
atomicity. Static parsing and final diff checks pass. QA-owned source and the
historical review are byte-unchanged from the assigned baseline; no full QA or
mutation campaign is claimed as rerun.

## Intentional QA expectation changes and limits

Do not mark the unchanged historical QA suite as passing this new behavior.
Its three affected case IDs need the assigned QA changed-case retest:

- `test_observation_mac_withholding_scope_qa_mac_01`: old lines 578–583 expect
  unrelated reads/resolution and new parentless gap admission to fail; line 595
  expects a first Mac gap to fail due to unrelated raw/raw disagreement. Those
  operations should now succeed without deleting the conflicting source.
- `test_later_old_family_contradiction_withholds_mac_replay_read_and_resolve`
  `[raw]` and `[windows]`: the loop at old lines 491–493 includes unrelated `f2`.
  Its resolution should succeed; affected `f6`, whole-chain replay, mixed read
  and mixed Learning refusal remain required.

The released 503 `retryable:true` remains a dependency-repair classification;
it does not request repeated retries against unchanged damage. This change
adds no nondestructive administrative repair API and does not reinterpret
historical capture gaps as observed evidence.

All current checks use MemoryStore and in-process ASGI with explicitly
synthetic identities/ink and audited Swift-generated synthetic PNGs. No real
database, listener, display, native capture, provider, account or preview is
touched. No previous database/native/mutation campaign is repeated. This is
not native Mac, physical ink, real AI, Notability or either desktop core-gate
acceptance. Lead owns review/integration, followed by one independent QA
retest of the changed cases.
