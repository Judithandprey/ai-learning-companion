# Windows pending-storage actual QA result

Actual delivery `26ac6269ad728266aade944005431008ad1d1675` tests published
`476fd1fb832e708b79ad5e5be1c7ef17925febee`; normal QA merge `0678c9a` preserves
identical app/service/package source. [Delivery identity](delivery.json).
Current main's Windows/services/packages remain identical to that candidate.

The observed acceptance run reports **16/16 checks, 76 steps, none failed**:
waiting is published 0.10s after the sampled frame, confirmed count stays 2 over
10.8s of paused service, and actual resume/ACK changes it to 3 after 0.35s.
A second pending send followed by Stop shows stopping/awaiting, gives up after
5.02s and ends stopped with 3 confirmed/1 unknown. The given-up batch has no
record or receipt; whether its original bytes reached storage is **unknown**
because those bytes equal a previously stored frame. Preserve that distinction.

The supporting first run is retained as 13 pass/1 failed step/2 limits: its
second visual change was below capture's material threshold, so Stop was not
exercised with a pending send. That is a QA scenario correction, not a product
pass or failure. The second run uses the same source with a sufficiently large
QA-page change. Neither run establishes timeout/stalled-state, physical-pen,
real-provider, audio, macOS, Notability or full §7.1 acceptance.

## Header wording decision

**The observed header/line combination meets this bounded task.** The static
header conditions storage on a service confirmation and never asserts current
storage; the adjacent status line promptly says the send awaits confirmation.
This is the design approved before the run in the existing
[copy review](../windows-parent-review/correction/qa-win-03-04/copy-retest/independent-qa-audit/windows-win05-copy-review.md).
R52/A12 require truthful state and explicit missing/unknown evidence, not the
same waiting word in both text elements. The handoff's shorthand "header and
line state waiting/unconfirmed" is interpreted against that previously approved
behavior. No product requirement or failed observation is removed, and no extra
wording change or user decision is needed.

## Evidence and remaining boundary

**QA-WIN-05 closes within this observed changed path.** QA delivery integrates
as `6114aa9491f339f379266e69d6df8bd96b35a3a4`. [Evidence review](evidence-review.md) and
[harness review](harness-review.md) approve the bounded result. The isolated
clean build reproduces the 57-file stage hash; all 12 unchanged executed harness
hashes match, with the disclosed analyzer exception retained. The old analyzer
source was not observed, so the assertion that its predicates did not change
stays QA-attributed. The current analyzer independently reproduces the saved
actual outcome; no historical execution is relabeled.

Two saved baselines and four targeted missing-evidence controls return expected
results. Six earlier scenarios and the frozen 86d2405 evidence are unchanged.
On exact integrated main, one saved-evidence replay produces 16/16 and the entire
summary equals the delivered JSON. [Integration record](integration.json),
[replay output](integrated-replay.txt). This is not another Windows or DB run.
Readback links three records/receipts and four unique original artifacts; the
recorded 32-to-zero cleanup is actor-scoped. Private raw bytes were not decoded
by Lead; byte equality is supported by the retained comparison receipts/code.
External 04:20:01 process/display checks remain QA attestation, separate from
structured process/host exits. Source/prose diff check passes.
The report's real Windows capture/app/owned-host/PostgreSQL behavior is separate
from injected DOM Start/Stop and QA-owned page changes; no physical pen input
occurred. Readback and cleanup concern only fresh actors in `lc_p0_test`.
The process/display release is recorded, but future owners must check current
occupancy. The user preview/database, ports 4173/8174 and Paperclip remain protected.

Next: this evidence integration is complete. The core real-AI path still
needs an explicitly selected authorized product API and available credentials;
a focused question has been asked without activation or spending. Interactive
Mac availability remains the prior pending device question. Neither dependency
is marked complete by these component checks.
