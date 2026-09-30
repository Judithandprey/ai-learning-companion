# Mac retained-frame mapper review

Candidate `a56f348ea02b50ae296fd8fb7164930e41d4a9a5` arrived as
`handoff_b9e69be16808e1ba40efa611f16763da`. The initial delivery was held; the reviewed correction is now integrated as described below. Swift execution is still pending.
This review covers R07/R27/R35/R36/R51/R52/R58 and A12/A14/A16/A30/A31;
the original-screen, editable-ink and actual-provider gates remain open.

Two independent read-only reviews checked the actual retained-session reader,
wire mapping, fixtures and Python checker against released 0.2.7/0.2.8. Exact
UInt64 text, negative PTS, absent versus empty attachments, trusted source and
process identities, and frameless gaps are preserved in the mapping design.
There is no demonstrated additional wire-mapping defect, but source review is
not a Swift build or execution result.

## Bounded corrections required

| Boundary | Executed observation / needed correction |
| --- | --- |
| Retained PNG containment | The lexical `frames/NNNNNNNN.png` check permits a symlink to a matching PNG outside the session. Require explicit canonical containment and a regular-file policy before reading. The reproduction exercises the filesystem and models the exact reader branch; it is not executed Swift. |
| Known event payloads | The optional-payload branches silently drop a recognized `kept`, `gap` or `run` event with its required payload missing. Refuse malformed known events rather than erase observable history. The direct XCTest reproduction is prepared but uncompiled. |
| Checker source/incarnation | Python mutations replacing all frameless record sources/versions, including mixed gaps, or replacing the gap-only incarnation still report 77 PASS. Bind every record to the expected fixture source/incarnation/plan, including zero-frame batches. |
| Checker timing/refusals | Valid non-null wall estimates despite the mapper's null promise, and empty refusal reasons, still report 77 PASS. Assert the mapper's actual null fields and meaningful refusal results. The date-format prerequisite also wrongly accepts `RuntimeError`; catch the intended validation error only. |

The checker mutations ran on explicitly Python-simulated fixture copies, not
Swift output. Byte corruption, changed ticks and `[]` changed to null fail as
expected. Existing useful checks are retained; counts alone do not prove native
fixture correctness. Date-parser normalization and near-limit JSON spelling were
not demonstrated defects and are not additional correction requirements.

Local review artifacts are retained in `/tmp/mac-mapping-review-jKoJvF`
(`reader_boundary_probe.py`, prepared `ReaderBoundaryReviewTests.swift`) and
`/tmp/macos-mapper-contract-review-pw3dfacg` (`checker-adversarial.py`, mutated
copies and logs). Exact source/reproduction details were supplied to the owner.

One same-owner correction was accepted as
`handoff_1f1fd9dcbc9f82407ce7acd7fa418100`, replying to the delivery against
published shared runtime `4fa592ddeef8615a29daf7ec317896f80847c93c`. Its initial
receipt was unread and `execution_started:false`; that is delivery, not a fix.

## Lead preparation and next action

The bounded root adaptation keeps the existing hosted workflow, pins its Python
environment, retains actual Swift ingress outputs separately from the earlier
recorder fixture and invokes the owner's checker from the exact source archive.
Lead reran **20 orchestration tests plus 14 subtests**, passing in 7.78s. An initial
run failed all 20 at prerequisite setup because Node was absent from PATH; the
rerun used the already installed Node 24.21.0. These tests use explicit tool stubs,
not Swift or native evidence. The three-file patch is released together with the corrected mapper, so published
main never calls a missing checker.

Next: Native delivers the bounded correction; Lead reviews/integrates it with the
workflow adaptation, runs the actual hosted Mac build/tests/checker, audits its
artifacts, then composes the actual Swift-produced requests and PNGs through the
trusted Backend/Learning boundary. The earlier successful build at `59ee862`
does not compile this mapper. Interactive Mac permissions/capture, audio, input,
real AI and destinations require separate evidence.

## Corrected source and checker result

Actual correction `a4786afa256047baa422213662e079246d37f843` arrived as
`handoff_e2bfd9814fd06eb6b15b995e3274288b` at 11:48:33Z, read with
`lead-mac-mapper-correction-start-20260930-1151`. Lead reviewed all six changed
files. Normal integration is `64c652f` (mapper) plus `c875266` (correction).

The reader rejects linked frame files/directories, checks canonical containment
and regular-file type, opens without following the final link, and hashes that
descriptor. Known events with missing payloads refuse the session; kept-count
differences remain a note. Two direct reader XCTests await the native run.
The checker now binds complete plans, every source/incarnation, promised nulls
and refusal reasons, with strict exception classification.

Lead's adapted, explicitly simulated baseline has 80 PASS lines (not the owner's
81-case simulation). All seven altered-fixture cases fail as intended: foreign
gap source, foreign gap incarnation, invented valid estimate, empty refusal,
corrupted PNG, changed exact ticks, and empty-to-null rectangles. Both unexpected
exception cases propagate. The first run reached the now-correct RuntimeError
but retained the old expected-bug assertion; after updating that assertion, the
whole correction probe exits zero. This is checker evidence, never Swift evidence.
Probe/copies/logs: `/tmp/lc-mac-correction-f2vurpn2`. Hosted compilation and actual
Swift fixture composition are next; no app/provider activation occurred.

Publication: **`775436f7870abc786b6b50e0dfb54bf7bff84af0`** was pushed normally
and matched origin/main. Mac-only hosted run
[36711170163](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36711170163)
started at 11:52:15Z on that exact SHA. Locked dependency setup passed and native
check/package execution is in progress; no completed result is inferred yet.

## Native execution completed

Run36711170163 finished successfully at 11:53:58Z: 27 actual XCTest passes and
81 actual Swift-output fixture/contract checks. Lead consumed those unchanged
request bodies and PNGs through the trusted runtime/archive/Learning probe: three
requests, 15 records, three frames and eight frameless records pass; historical
state and Stop boundaries remain intact. See [retained native logs and composition](macos-ingress-hosted/README.md).
No actual interactive Mac/permission/provider acceptance follows from this result.
