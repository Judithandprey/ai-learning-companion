# Windows pending-storage correction integrated

**Source approved and integrated through `22d4e26d170ac2f3b5a95d989d33a7c0958ff723`.**
Owner code `44fbd503bcbc45f4f3b28ff52d78e379ddbaf8c9` and evidence
`d295a514b531e7fae5ad35df10b4bc10b43bf742` arrived in
`handoff_a92a71278b769c6905a26d2c2cf50b68`. Windows source and owner evidence
match byte-for-byte; the four reviewed leaves were integrated without merging
unrelated branch history. Exact leaf mapping/checks are in
[the machine record](windows-win05-integration.json).

The interface now announces a pending send before waiting for the service. It
counts storage only on confirmation, distinguishes unknown outcomes from known
not-sent records, and no longer says the service is storing while a send waits.
If saving retry intent fails, the final notification reflects restored counts
while preserving the no-further-send fence. Retry bodies/keys, attempt bounds,
timeouts, originals, input and Stop/quit policy are unchanged.

[Correction review](windows-win05-correction-review.md) passes the same three
independent probe groups, including the failed retry-witness write: no fourth
upload, unchanged journal, notified counts equal direct status. This closes
WIN05-STATE-01. [Evidence audit](windows-win05-correction-evidence.md) verifies
all 57 executed-file hashes and preserves the earlier 94-pass author result.
The original failed report/probes remain historical, not rewritten as passes.

On exact integrated main, **78 affected checks passed, zero failures/skips**, in
42.154s: capture-link-record, capture-link-rules, capture-link, control-link and
app-link. [Output](windows-win05-main-tests.txt) uses pinned Node 24.21.0 and the
existing loopback MemoryStore Python host. TypeScript and static build passed.
No PostgreSQL, Windows GUI, real provider or physical-input run occurred here.
These main checks are distinct from the owner's78 checks and independent probes.
All eight source/English manifest hashes and the Git whitespace check pass.

The earlier actual 24-pass/two-limit QA result and QA-WIN-03/04 closure remain
valid within their recorded scope. The corrected 121-case analyzer replay remains
accepted; no repeat was needed. Its historical 86d2405 copy/clock expectations
must not be changed to pretend they exercised the new product wording.

Next: publish this candidate, then release ONE bounded existing P0-13
QA-WIN-05 test of actual pending/confirmed UI. Check waiting promptly, preserved
confirmed counts and actual ACK recovery using only QA-owned processes/data;
no full quit/ink/DB campaign. [Exact next scope](windows-win05-next-qa.md).
Dispatch receipt and actual execution are separate evidence. Native's existing
MAC-STORAGE-COPY-01 remains with its owner. Actual AI, physical pen, interactive
Mac/audio/Notability and both complete §7.1 gates remain open.
