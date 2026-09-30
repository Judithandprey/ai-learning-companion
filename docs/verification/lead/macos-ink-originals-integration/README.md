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
