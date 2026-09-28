# P0 resumption and integrated milestone

Date: 2026-09-28 UTC. Owner: lead. Initial main/origin:
`36d5e7d37d82f7be3d7b525db45e653f52bed68c`.
Reviewed implementation milestone:
`7367c2c84743d1c2dce2a6aea243f9a666ee4ab2`.

P0 implementation/review resumed under the user's existing authorization. This
is a tested foundation, not a usable complete application or a passed G1–G7/P1.
The web probe retains six known P2 defects; 13 strict contract xfail cases remain.
Providers are disabled in the probe and no app was deployed. Real PostgreSQL,
real account connectivity, native compilation and device acceptance remain separate.

## Availability and transport observations

The configuration operator reported prior Claude iOS/Web/QA exits with provider
`rate_limit` / `monthly spend limit`, also displaying 03:50 America/Los_Angeles
session reset. Lead did not independently inspect hidden provider state. This
mixed message is not a guarantee of reset at that time and is not a setup-only,
route, filesystem or Git authorization failure.

The native run-bound Chats list/inbox/read calls worked in this turn. Ordered
sender reads used stable request keys, ended with `has_more=false`, and reported
no unavailable messages. All five roles have now sent actual reading reports for
the final `e432937` specification; exact messages are in the
[adoption record](requirements-v1.1-adoption.md). iOS/Web/QA's later reports and
QA's commit prove these particular deliveries, not unlimited continuing capacity.
Later iOS actually delivered P0-03 commit
`a4841d34676b12bf2d24fb4c5a0539e388f01c92` in message
`handoff_e7bd654f61d6fafd61e97a1f21ba7bd8`: 62 capability rows and 58 untested
device cases reported, no Swift implementation/compilation or real-device test.
Its research conclusions remain worker claims pending lead/source review; this
turn does not infer universal overlay availability or accept any platform gate.
iOS reports P0-11 research resumed; that next result is not yet delivered.
An independent read-only static check exported a4841d3 to `/tmp` and ran its
matrix `--self-test` against current main contracts: exit 0, all 13 negative
controls rejected and the valid device-failure control accepted. Its 9 files stay
within iOS/platform ownership; 62 rows comprise 41 documented, 15 not_tested and
6 unsupported claims, with 58 unique unexecuted device checks. This validates
record consistency only, not its 168 externally sourced platform claims. The
delivery is retained for source/architecture review and is not yet merged.
The historical 403 remains recorded separately; no alternate helper, token change,
model/effort switch, permission change or quota purchase was used.

`TEAM.md` and `docs/roles/lead.md` now explicitly say that an accepted send or a
yielded chat turn does not stop P0. Lead continues useful local work and later
processes delivery, review, integration and next assignments. Each limited role
keeps its existing task and one resumption condition, without a retry storm.
The broader product-document audit is awaiting the configuration operator's
promised findings; this milestone does not guess unresolved product decisions.

## Actual source deliveries and integration

| Work | Exact delivered commit | Main integration / outcome |
| --- | --- | --- |
| Learning P0-05 exact UTC timestamp ordering | `ccfcb2c0ad429ab6568727db7addf5f5a0ab14ee`, with `699504c` parent work | Merge `8b9cbef747b6b4ca04c6c72f3a17c04368cb1f2e`; preserved fixtures and deterministic retrieval reproduced |
| Web P0-02 owned-page probe | `127bd4cb4cb505edf791c5f386bda905dcf1369b` | Merge `ad95d1a77e70a77e4efc91ac9ddf4d167f20d3d5`; current tests reproduced, later six P2 findings retained and repairs assigned |
| Independent QA P0-06A | `fac974e4484f0aa9b2958fce2417efddb2422323` | Merge `b31ffc5251cfbe7fae9d218766cd11cb29445ef6`; independent historical result is 107 pass/15 strict xfail |
| Backend P0-04 plus scoped design/review | Original `803916ff5d1663cb970636b22bb897d89d083da0`; fixes `32ca06f3e1e6118689abf118a2d818774e64eb08`; tip `8f13312a9796a276aaa6e538a4e8e4eac7155c1e` | Merge `7e64d46cd01c99ed0d6fb9e0dfa536bc8c1e2389`; fixed two reproduced P1 defects, integrated 25 explicitly unexecuted P0-09 vectors and P0-05 peer review |
| Astra web boundary review | `59f8ec7ae75e365edb9929edbca2c8c6ce760788` | Isolated report cherry-picked as `9b88f60`; unreviewed parent P0-10 application/test changes were not pulled in |
| Lead shared fixes and portable CI | `7367c2c84743d1c2dce2a6aea243f9a666ee4ab2` | Safe integer / timezone guards, 26 added tests, two resolved QA markers removed, backend/learning/QA/web added to root checks |

Only scoped deliveries and lead changes were committed. Worker worktrees were
preserved. An initial uncommitted trial merge of the old backend was aborted
after reproducing its defects; its later corrected branch was normally merged.
No delivered history was amended, reset or force-pushed.

## Verification actually run

Environment: WSL Linux, Python 3.14.4, Node 24.21.0, TypeScript 7.0.2, pinned
Python/Node dependency sets. Root CI now installs the existing backend extra and
backend-test group; no dependency version or shared wire field was added here.

| Check | Actual outcome / limitation |
| --- | --- |
| `bash scripts/check.sh` on the integrated code | **407 passed, 13 strict xfailed**, no skipped tests; generated TypeScript/OpenAPI checks, root TypeScript, web typecheck and build passed. Raw output: [integrated checks](p0-resume/integrated-checks.txt). |
| `.venv/bin/python -m compileall -q services/api services/worker/core services/worker/connectors` | Exit 0; compilation does not prove a database/provider connection. |
| `.venv/bin/python -m services.api.tests.postgres_check` | Exit **2**, `BLOCKED: LC_TEST_DATABASE_URL is absent; real PostgreSQL acceptance is unverified`. No green skip or MemoryStore substitution for this gate. |
| Initial direct Python suite before root PATH setup | 406 pass, 1 skip, 13 xfail: QA's TypeScript check skipped for absent Node on PATH. The final root script sets the pinned Node PATH and actually ran that check, producing 407 pass and no skip. |
| Independent read-only review of backend fixes | 91 narrow MemoryStore regression tests passed; both P1 findings closed, no new blocker found in that bounded review. |
| Independent read-only review of shared guard/CI changes | 26 focused guard checks and both shell syntax checks passed; full independent QA of the new candidate remains separately assigned. |
| `git diff --check` / staged equivalent | Passed for reviewed changes. Documentation/receipt edits do not require another full application suite. |

The root suite comprises 95 contract tests, 146 backend tests, 57 learning tests,
and 109 passing QA tests plus 13 unresolved strict xfail cases. It does not run
real PostgreSQL or real-device checks. Hosted CI status must be read for the exact
pushed commit; a workflow file or local result is not a hosted success claim.
Subsequent actual observation: hosted
[run 36397872539](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36397872539)
for **7367c2c84743d1c2dce2a6aea243f9a666ee4ab2** completed successfully,
including both Python 3.12 and 3.14 jobs and their integrated check steps.
[Provider-returned CI record](p0-resume/hosted-ci.json) preserves the exact SHA,
job IDs and status; it does not establish browser/device/real-DB execution.

### Backend correction evidence

Before fixing, lead reproduced running → cancelling → unknown-result returning
`409 job_not_running`, leaving reconciliation flags false and allowing cancellation
acknowledgement and reservation release. `32ca06f` accepts unknown results from
running/cancelling started jobs, records both reconciliation flags atomically,
and retains the reservation until reconciliation. Tests cover both operation
orders, concurrency, replay, terminal/unstarted rejection and transaction rollback.

The second reproduced defect: a note with original handwriting from source B and
a later AI supplement citing A lost B's history/unique ink when A was deleted.
The fix checks all impacted note history before mutation and rejects unresolved
mixed-source deletion with `409 mixed_source_note_conflict`; the complete state
remains unchanged and deletion is not falsely reported. Single-source deletion
and shared-ink retention still pass. This safe rejection is not a completed
cross-source selective-delete implementation. See
[backend fix report](../backend/p0-04-review-fixes.md).

### Learning retrieval evidence

Lead ran `.venv/bin/python -m services.learning.evaluate --output
/tmp/p0-resume-learning` on the integrated P0-05 code: exact queries **50/50** for
both candidates; fuzzy lexical **17/30**, lexical+metadata **25/30**. Metadata
failures remain `fuzzy-03`, `fuzzy-22`, `fuzzy-24`, `fuzzy-26`, `fuzzy-29`.
No failure was removed or tuned away for this integration.

The corpus contains 90 sources, 89 frames, 875 observations, 80 queries and 600
later observations for early-detail preservation. Original file hashes, deterministic
index bytes, new-process restart and rebuild rankings matched. Result signature:
`b5922ddd8314665e09498c795fc11763f727c126e0a791be3d01d432be157a46`;
archive fingerprint:
`d901387a7b8ab24c33b627ad88f20e8ae1a8ddbb9e2b09dee98cd8fdb6f3220f`.
Provider/paid calls: zero. Graphiti comparison, model switch and context compaction
were not executed. [Machine summary](p0-resume/learning-summary.json) preserves
the actual denominators/failures. Backend independently compared 160 query results
excluding timings and all 187 fixture hashes; see
[its P0-05 report](../backend/p0-05-peer-review.md).

### Web reproduction and remaining counterexamples

Lead ran the existing owned-fixture browser harness in Windows Edge with a new
temporary profile, synthetic page/video, no account or real-course login. A default
sandbox `listen EPERM` was retried only through normal exact-command approval.
Foreground harnesses terminated normally; no durable service was started.

- `node --test --test-isolation=none apps/safari-extension/tests/*.test.ts`:
  **44 passed**, [raw result](p0-resume/web-unit-tests.txt). The default Node test
  invocation reports seven file wrappers; positive/negative controls confirmed
  those wrappers execute their test bodies and a failed assertion exits nonzero.
- `browser-check.mjs --browser <installed Edge> --out /tmp/p0-resume-web
  --run lead-selftest --timeout 55000`: **42/42**,
  [full synthetic report](p0-resume/web-selftest.json).
- `trusted-check.mjs --browser <installed Edge> --out /tmp/p0-resume-web
  --run lead-trusted`: **37 passed**, no failed checks, **2 not verifiable**
  (`nav.touch_scroll`, `nav.pinch_zoom`); three environment controls are separately
  represented in its 42 total rows. [Full report](p0-resume/web-trusted.json).
  Desktop CDP touch/Pen is not iPad, Pencil or native input evidence.
- Existing evidence validator passed for 20 capability rows and the fresh 11 ASK
  bundles; structural provenance validation is not actual screen capture.

Subsequent Astra review found six **P2** counterexamples despite those passing
tests: mouse cancellation submits; child-frame cards bypass request correlation;
box adjustment can mix old media time with new content/version; delayed bridge
results can replace newer cards; timestamp capture occurs after asynchronous
hashing; and the eigenvector fixture mishandles negative/zero eigenvalues. The
bridge race is conditional on a delayed transport, not a claim of a currently
connected provider. The relay issue exposes local fixture text, not arbitrary
remote-model HTML. Full reproductions and limitations are in the
[unaltered peer review](../learning/p0-02-peer-review.md).

Web received **one** consolidated repair handoff under P0-02. At this report's
boundary, no repair delivery was observed. The merged probe remains an explicitly
incomplete local investigation; it must not be promoted to real-course use or
blanket acceptance of cancellation/anchor integrity. P0-12 stays behind the fixes.

### QA findings and self-test versus independent acceptance

The formal independent report is
[P0-06A at fac974e](../qa/p0-06a-contract-acceptance.md). Lead reproduced its
historical 107 pass/15 xfail. Before the formal delivery, a read-only snapshot of
QA's dirty files was copied to `/tmp` for a limited reproduction; it was neither
committed nor misrepresented as a QA-delivered artifact.

Lead fixed QA-01 (integer literals too large for JavaScript even in number fields)
and QA-02 (overlong timezone lookup leaking `OSError`). Their strict markers first
produced XPASS failures, then only those two markers were removed. The independent
report itself was not rewritten. Original safe limits, bool typing and finite
floats remain valid; invalid timezones yield validation errors while unexpected
programming failures remain visible.

QA-03–11 remain open: snapshot URL validation, registration/snapshot confusion,
trusted consent/origin boundaries, same-batch event/sequence duplicates, ACK
contradictions, frame/gap contradictions, forced context frame for missing capture,
contradictory capability PASS evidence, and Unicode budget month digits. These
are **13 strict xfail cases**, not passed acceptance. Lead owns the next scoped
contract fixes and P0-08 compatibility design; no unknown frame is fabricated.
New-candidate independent QA was requested once, subject to actual provider
availability. Lead self-checks and Astra bounded reviews are labeled separately.

## Next bounded work and actual message receipts

All rows below are native async messages to the five configured roles only.
Acceptance proves a passive mailbox send, not execution or a completed repair.

| Existing task / recipient | Actual accepted message | Outcome or continuation |
| --- | --- | --- |
| P0-05 independent review / Backend | `handoff_4f166699ed064d6563303643961a4b25` | Actual delivery `handoff_1534eb70c18ff3b5c2f90bea342eeec8`, commit 8f13312 integrated |
| P0-02 independent review / Learning | `handoff_97ed5eea1a589ebbf106dd68eec84676` | Actual delivery `handoff_f15e4c38640816302607219ab53e28e2`, report 59f8ec7 integrated |
| P0-04 fixes / Backend | `handoff_aeda4584f4b51b45237304563ca1a503`, `handoff_52b623a821d11dda6a216ff5e00511bc` | Actual delivery `handoff_b3b717b3acea22904ff75818507dbc50`, commit 32ca06f re-reviewed and integrated |
| P0-02 six consolidated repairs / Web | `handoff_f344c9e0c1347cb1617f52dbfeda3553` | Accepted; repair pending. One original card, no repeated retries or owner/model change |
| P0-10 supplementary semantic review / Backend | `handoff_77590dc0f6e10e503855f3a0aec4dbca` | Accepted; independently review 65 cases at fb445ed, preserve author labels, write only backend evidence, do not claim P0-13 complete |
| P0-09 consumer evidence review / Learning | `handoff_ee8cab35ba004a2a946e2e9eafe0a238` | Accepted; review 25 unexecuted vectors and assistance/diagnosis/entry/import semantics, evidence-only, no new v0.1.0 fields |
| P0-06A candidate recheck → existing P0-13 / QA | `handoff_1bad5da5d58b3d68edf2de8b29f2875c` | Accepted; exact main 7367c2c, QA-01/02 verification and remaining failures, preserve worktree; no automatic retries if provider-limited |

The last three sends returned `accepted=true`, `duplicate=false`, `state=unread`,
`execution_started=false`. They are follow-on slices of existing work, not a
duplicate P0 board or a request for receipt acknowledgements. iOS delivered P0-03 during this work and keeps its
existing P0-03 review → P0-11 task without another resend. No acknowledgement
loop, speculative wait, model switch or unrequested external action was used.

## Commit/push evidence

Before pushing, `git fetch origin` succeeded and divergence was `0 15`
(`origin/main...main`), with no unmerged remote commit. A normal `git push origin
main` succeeded, advancing `36d5e7d` to
**`7367c2c84743d1c2dce2a6aea243f9a666ee4ab2`**. `git ls-remote origin
refs/heads/main` returned that exact SHA. No force push, visibility change or
unrelated repository action occurred. This evidence/board/read-receipt update is
a normal subsequent documentation commit; its final push SHA is reported in chat.

Captured test artifacts have [SHA-256 hashes](p0-resume/sha256.json). No source
requirement text, role models/effort, runtime settings, locks or authentication
files were changed by this record. Original R01–R59/A01–A46 remain in effect.

Documentation validation passed: 23 relative links resolve, all 13 P0 board IDs
remain unique, both specification files/directory/locks are byte-identical to
36d5e7d, all six captured evidence hashes match, and all five actual final-spec
reading messages are recorded. Independent read-only review found no false
acceptance promotion or numbering/reference issue. `git diff --check` passed.
