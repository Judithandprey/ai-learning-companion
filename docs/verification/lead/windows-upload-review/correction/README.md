# Corrected uploader review — one narrow HOLD

Actual `c09c1518024555afcc3f646195f2c1d0b617ed9d`, parent `6c4ac03`, arrived as
`handoff_a43638b3601d3a700c732f2d78643c61`. Lead read the full corrected uploader
and ran its exact export against the actual current Backend (MemoryStore and
owned loopback processes): **19/19 passed, no skips, 6.472 s**.
[Actual output](actual-http-tests.txt) and synthetic HTTP receipts are retained.
The first malformed-success response now preserves uncertainty and exact replay;
the test host uses no DB, display or product provider and reaps its own child.

[HTTP review](http-review.md) closes the earlier outcome/date/cancellation
failures but reproduces one promised-result privacy defect: an allowed
32-character uppercase synthetic bearer supplied as a fetch exception's
`cause.code` passes the permissive code regex and is returned in `reason`.
Eleven of twelve independent groups pass; the remaining assertion fails.
This uses the author's existing injected-fetch seam. It is not evidence that
native Node derives a real transport code from remote body content. The
correction is a fixed safe classification/finite code allowlist, also applied
to arbitrary local `error.name`, preserving uncertainty and retained originals.
ONE same-task request was accepted as
`handoff_471e395c99db3c5d56fc8d4cd1ee0bfe`; no correction start is inferred yet.

[File review](files-review.md) passes eleven focused controls/probes: the
ordinary after-check leaf/parent substitutions, post-open rename, changed-byte
and caller-mutation failures are corrected. A deliberately hostile writer can
still flip a parent directory between distinct path lookups and cause an
outside-file read. Only exact expected bytes can be sent; different bytes
fail the digest before upload. This is an explicit non-atomic containment
limitation, acceptable only for the trusted main process and its app-owned
capture directory. It is not closure of an absolute adversarial-directory
guarantee or Windows-native race acceptance. No new filesystem framework is
required for this bounded trusted-directory consumer.

The uploader remains unintegrated and inactive until the narrow privacy
correction is reviewed. ONE next same-owner app integration is already accepted
as `handoff_661e0a4cb6a23819b96b2e1e112673b4`, using pushed host baseline
`aebd668607f17710f4255f48233f65ce75fca731`: explicit isolated development Start,
actual successive retained display frames/ink, trusted private-pipe runtime,
control/source reconciliation, truthful stored/unknown status and Stop. The
owner must retain a previous call's uncertainty even if a later call refuses.
This next task follows the current correction; it does not activate a provider,
touch the user's preview or substitute capture/storage for either §7.1 AI gate.

Reports/probes retain their actual temporary export paths as provenance.
Prior failed evidence is unchanged. No native campaign is repeated here.
