# Mac immutable editable originals: source integration

Actual native delivery **89edd5c499a80ffe7454a0924881eec63e79f195** plus
**35c75a45b1a29c3e069e061e077b45f820cfee1e** arrived through
`handoff_f992d1177d1c466ac1f3b6541413ea74`. Both commits integrate as
**4ee63f5 / f046a7c**. The complete apps/macos tree equals the reviewed candidate;
shared contracts are unchanged, and FrameStore stays byte-identical to the
preserved iOS component. [Source comparison](source-check.json).

This reuses the existing document, pairing and retention flow: freeze the whole
editable document at pairing, keep exact content-addressed JSON without replacing
existing entries, record unavailable/unknown outcomes, and preserve snapshot versus
pixel revision/clock and pending-input limits. Existing0.2.2 editable_ink bindings
are separate from unchanged0.2.11 frame metadata. This is not a claim that the
shared schema attests every native association.

[Storage review](storage-review.md) approves the exact source. Its four Linux
POSIX primitive checks and13-file/eight-translation hash checks pass; they do not
execute Swift. One nonblocking diagnostic omission remains: a failed staging-name
unlink after successful link/readback is not surfaced in the retained result.
The verified original remains present; no data-loss failure was demonstrated.

[Mapper/checker review](mapper-review.md) approves the separate existing-wire seam:
five focused Python groups pass, including11 reason-specific negatives, legacy
unknown/unavailable states and association/history controls. Its new association
is Python-built over prior audited Swift bytes, not newly emitted Swift evidence.
The owner's353 simulated checks and47 declared Swift tests are not actual native
passes. **Compilation, Swift tests and new emitted-fixture checks are NOT_RUN at
this source release**, pending the existing hosted macOS workflow at an exact SHA.

No root workflow count change is needed: it already runs the actual declared
XCTests, creates the new fixture, invokes the candidate checker and hashes the
recursive fixture files. Hosted audit must derive actual counts rather than copy
47/51 predictions. Existing historical fixture/provenance stays unchanged.

## Next verification and owner

Lead runs the existing macOS build/package workflow and audits exact source,
checksums,47 expected test declarations and new immutable JSON bindings from the
actual generated artifacts. A bounded adaptation of the existing ASGI composition
check must include the real emitted JSON originals in the same unchanged Process
record before claiming ink upload/readback; old image-only results remain bounded.
Native owns any real compile/check failure. These are synthetic-buffer component
checks, not a usable interactive Mac, physical pen, actual-provider receipt,
Notability import or either complete desktop gate. No native/mobile campaign or
paid provider is activated.

## First actual hosted result — failed test compilation

Published687a58bc91df2bf651c14c2cffd66eabc2907ed6 ran as
[36762827375](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36762827375).
The app release build/package stages completed, but XCTest compilation failed at
InkOriginalTests.swift:239: the 20,000-point inline map expression could not be
type-checked in reasonable time. **Zero new Swift test/fixture passes are claimed.**
[Actual receipt](first-hosted-run.json), [error log](first-hosted-failure.txt).

The original native owner received one bounded correction through
**handoff_8cf29cd69e89aa8be599c77382f98716**: use explicitly typed intermediate
points/arithmetic without reducing the20,000 points or actual size/cap assertion.
No product source rewrite, mobile campaign or fabricated local compile result.

The two [prepared verification scripts](verification-preparation.md) are preserved
with syntax-only status. Neither audit nor new HTTP/ink composition has run, and
they require actual successful newly emitted artifacts; do not run them against
old fixtures to manufacture this missing result. Update the explicit run/SHA
arguments to the eventual corrected candidate while retaining this failed run.

## Minimal compilation correction ready for actual rerun

Native reply **handoff_1c40ac529ba33ed70fa6f1098165d402** delivered
**196d2929dae2002501b509072ec9d7ba8fd8ee14**, integrated as **730777f**.
Only the oversized test expression becomes an explicitly typed loop, retaining
all20,000 points and the cap-size assertion and adding an exact count assertion.
The complete Mac source tree equals196d292; production and wire bytes are unchanged.
Lead reviewed the complete two-file delta. No local Swift result is claimed.
The existing workflow will run once against the following published candidate.

## Actual corrected Mac result and new-original composition

Published **d49d101cd8d378e57ea54da6cb38fb89b80bb72c**, reviewed native
**196d2929dae2002501b509072ec9d7ba8fd8ee14**, ran in
[36764195464](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36764195464).
The **macOS job succeeded**; the Windows sibling and therefore the overall workflow
failed its separate unreadable-file test precondition. The [raw receipt](hosted-run.json)
and [artifact listing](hosted-artifacts.json) preserve both results. This is no
claim of an overall green desktop workflow.

The actual arm64 development app builds/packages, and **47 declared XCTests all
execute and pass**, with zero failures (1.098s test time). Logged checker output
contains83 ingress,27 composition and362 retained-frame PASS lines; these include
51 native refusal records and are not relabeled as distinct Swift tests.
[Artifact audit](hosted-audit.json) verifies all65 checksummed files, all2405
archived raw Git blobs/paths/modes, the exact reviewed native tree, executable
package and emitted originals. Two immutable JSON files account for three retained
associations; no-document, unavailable and old-unrecorded states remain separate.
[Source check](corrected-source-check.json) also proves API/Learning/contracts
unchanged from the previous source release.

[Independent audit implementation review](audit-review.md) closes a saved-receipt
run-identity omission before use: exact repository/run/job/attempt/artifact binding
and per-platform results now have26 focused gate cases. This is bounded validation
of the audit itself, separate from its actual artifact execution.

The [new actual composition](composition-result.json) uses the emitted Swift bytes
through existing MemoryStore/ASGI HTTP routes and stored Learning. Both unchanged
mapping variants pass, each with8 frames,14/15 original artifact IDs (including
two immutable editable JSON originals), exact receipt/ACK/replay/readback,
false-consent runtime reopening, historical Stop, and token/source revocation
fences. All18 supplied fixture files remain byte-identical. The native association
and pending/freeze facts stay outside unchanged wire schemas; Learning keeps
original references and attaches PNG roles, not an ink interpreter/provider.

The first two composition attempts exposed errors in this new Lead probe:
original GET incorrectly used the batch route's0.2.12 error validator, then
expected batch-style404 after source revocation. Existing original GET uses0.2.4
and403 forbidden. The [failure record](composition-initial-failure.json) preserves
those observations; only the harness was corrected to the existing precise route
semantics, with production and all no-mutation assertions unchanged.

Reproduction against the retained download (no new hosted run):

```sh
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python docs/verification/lead/macos-ink-originals-integration/artifact-audit.py \
  --artifact-dir /tmp/lc-macos-36764195464 \
  --commit d49d101cd8d378e57ea54da6cb38fb89b80bb72c \
  --approved 196d2929dae2002501b509072ec9d7ba8fd8ee14 \
  --run 36764195464 --output /tmp/macos-ink-audit-new.json
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python docs/verification/lead/macos-ink-originals-integration/composition.py \
  /tmp/lc-macos-36764195464/macos-retained-frame-fixture \
  --artifact-audit /tmp/macos-ink-audit-new.json --output /tmp/macos-ink-composition-new.json
```

**Next actual owner/action:** Native receives ONE callable Mac0.2.12 request/HTTP
upload continuation through **handoff_bd40c1175a77a0d24244711d89c296ca**. Actual
start **handoff_fbe03247d9a519c02476c193036e3522** confirms preserving merge64e2302
ofd49d101 and exact Mac source equality. Scope stays apps/macos plus platform
evidence. Lead then reviews/compiles/composes that candidate before native
app-parent wiring and independent integrated QA. No mobile/paid-provider or
automatic app upload task follows from these fixtures.

These results use synthetic native buffers and synthetic API authority. No new
PostgreSQL or listener run, interactive Mac, physical pen, original-screen AI
receipt, audio, Notability or full §7.1 gate is claimed.
