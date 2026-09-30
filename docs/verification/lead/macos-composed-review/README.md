# macOS raw/composed source delivery — bounded review

Owner1539a7cb50935cc9eebc6c778595995baf7157ee, actual delivery
handoff_f10cddd61a536f47647d347aa0d8b6cd, retains source raw PNGs and explicitly
paired committed-ink compositions. It declares42XCTests across4files; none has
compiled or run for this revision yet. The previous37-test Mac result remains
valid only for its earlier a33932a source.

[Platform/source review](platform-review.md) approves the bounded AppKit/filter/
render source for hosted compilation while keeping real-Mac claims unverified.
Core recorder/revision/Stop review is finishing separately. One P2 **validation
HOLD** is reproduced:1px centreline ink is accepted when metadata requires8px
width, and all22existing negative controls still trigger. This is Python-synthetic
input to the checker, not Swift output or a proven renderer defect. Exact
[reproduction](width-probe.py) and [output](width-results.txt) are retained.

Next owner Native: one small existing-fixture correction before accepting image
fidelity—require known off-centre interior ink and add a self-consistent collapsed-
width negative control, using actual fixture3pt×2=6px dimensions. Preserve existing
geometry/centreline/flip/background checks. No new rendering framework, capture
scope, wire or real-Mac campaign. Lead owns current CI wiring and later exact
hosted compile/test/validator/artifact audit; source approval is not execution.

Lead prepared the existing desktop runner to emit, validate, retain and hash the
new composed fixture.21portable orchestration tests pass9.632s using fake build/
Swift tools. That wiring is not yet published and cannot establish Swift output.
No provider, interactive Mac, pen, capture exclusion, audio, Notability or either
full desktop gate is accepted here.
