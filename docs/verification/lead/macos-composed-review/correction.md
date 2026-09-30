# Width correction and source integration

Native correction **a17f6c1ffe1eb760ee20ec8174578183978399b0**, received as
`handoff_9f6ba9dbaa44172f28ce72e8c81f7c27`, fixes the demonstrated checker gap.
Base1539a7c and this three-file correction integrate as **ad7aba9/3261c5a**.
The full Mac package matches the corrected owner source. The renderer is unchanged.

Lead reviewed the diff: the validator requires opaque ink for pixels confidently
inside the recorded width, and the XCTest adds off-centre checks at the actual
3pt×2 fixture width. New negative controls recompute lengths/hashes for collapsed
width and transparent ink. The unchanged old reproducer now fails at five images.
A separate synthetic positive at3pt×2 passes; all24 mutations of that positive
fail, including width collapse for the intended width reason. [Executed output](width-correction-results.txt).
These are Python-generated pixels, not Swift or display evidence; the full CLI
will next read actual Swift output. Previous negative artifacts stay unchanged.

Lead's existing desktop workflow now passes a nonexistent composed-fixture output
path to Swift, invokes the owner validator, retains actual files on failure and
hashes/uploads that tree. [21 portable orchestration checks](orchestration-tests.txt)
pass using fake tools; their failure cases preserve failure status/artifacts.
No actual macOS compilation or42-XCTest success is claimed by this source release.
The next single existing hosted macOS run supplies those results and genuine
Swift-generated synthetic fixtures. Real screen exclusion, pen, provider, audio,
Notability and both desktop gates remain open.
