# Malformed receipt witness correction

Backend **7d19e09aafe2ff7716b585bab809ba89aff25f9e**, received as
`handoff_b5744188b3b6c331e743c21b84d7c3e6`, integrates as **f7ef3ac**.
[Independent review](review.md) approves the three-file change:36 new checks,
six unchanged QA cases with xfail disabled, and74 relevant compatibility checks
pass. The old five actual HTTP200 failures and fixture error remain preserved.

The existing receipt classifier now runs before receipt route/deletion filtering.
Only exact `{key, deleted:true}` with a nonempty string key is intentional erasure;
malformed active rows, nonboolean/full-row deletion, empty/non-string keys and
invalid ACKs deliberately refuse503. Sibling scans reuse that classifier; originals,
old valid clients, exact replay and current auth/Stop fences remain intact. This
is not validation of arbitrary key semantics or a general corruption-proof claim.
The demonstrated defect requires two synthetic retained faults, not a proven
ordinary-client exploit. No wire/dependency/migration/default activation changed.

After integration, Lead removed only the five obsolete strict-xfail annotations
from the original QA cases; assertions and their actual200 exception remain.
Together with new/compatibility checks, the exact main production atf7ef3ac gives
**164 passed in17.31s**, zero xfail/failure ([output](main-tests.txt)). The frozen
five historical producer PNGs remain unchanged. Counts overlap the review and
are not additive evidence. No database, socket, native app or real AI was used.

Next owner QA: one focused independent retest on the released integrated revision,
after its current Windows display assignment. Test all six original corruption
cases, intact witness403, exact erasure/legacy controls and no mutation; retain
previous49-pass API evidence without another complete campaign. Source correction
is approved, while role-QA closure remains pending until an actual result.

## Exact independent follow-up

Candidate **b19930b1d6413ba2f289e2a77a4762356bd13ce0** was actually pushed.
The ONE conditional next QA task is accepted as
`handoff_ae543ceafe81d8cfc3d0ff6c7235383c`, after the already assigned Windows
display retest. The receipt is delivery only, not execution or acceptance. Existing
Windows ink-original work and Learning's isolated Mac metadata implementation
continue independently; Native awaits the reviewed additive mapping release.
