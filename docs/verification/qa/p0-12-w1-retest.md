# QA re-test: Web W-1 dismissal and P0-12 repairs at main 71f1389

- **Tested commit:** exact main `71f1389eeb503f652138e23a329f231ad15aacc7`, which
  includes these integrated worker commits:
  - W-1 `b866729` → `746f93d`;
  - P0-12 `c534518` → `a3990b4`, `8a32a8a` → `2d91a3a`, `4c32e49` → `13c0777`,
    `e251447` → `fcf89b2`.
- **Test copy:** a `git archive` of 71f1389 in `/tmp/qa-71f/repo`, with lockfile
  installs (`uv sync --frozen --extra backend --group backend-test`,
  `npm ci --ignore-scripts`). The QA branch was not used as the test subject.
- **Merge:** `team/qa` merged main normally (`9d65e85`). The only conflict was the
  mutation harness; main's version, with the lead's F4b locator, was taken. App code
  equals main.
- **Environment:**
  - WSL2 Ubuntu 26.04.1 with Windows 10.0.26200 interop;
  - Node 24.21.0 and TypeScript 7.0.2 (the lead's pinned tools, read-only);
  - Edge 154 headless with fresh temporary profiles on port 4173 (released by lead;
    no listener found before use);
  - Python 3.14.4.
- **Scope:** desktop only. Events are synthetic (self-test) or CDP `Input.*`
  (trusted and entry checks), on owned fixture pages and the self-test deferred
  transport. Not Safari, iPad, Pencil, a packaged extension, the native bridge, a
  real course site, a provider or a real share/import. The unrelated backend and
  learning suites were not re-run.

## Reproduced checks (QA ran these; lead figures are only a comparison)

Raw logs kept in `p0-12-w1-retest/`, byte-identical to the original run output:
- `offline-close-71f.log`
- `module-check.log`

Both are force-added because `.gitignore` excludes `*.log`. The browser runner logs
(`qa-71f-selftest.log`, `-trusted.log`, `-entries.log`) are **not** committed: they
contain a local Windows user-profile path. Their results are in the committed JSON
reports. The self-test runner log contains no retry or refused-connection line.

| Command (in `/tmp/qa-71f/repo`) | QA result | Lead figure |
| --- | --- | --- |
| `apps/safari-extension/scripts/check.sh` (typecheck, `node --test tests/*.test.ts`, build) | exit 0. Typecheck and build pass; this runner reported **63 tests, 63 pass**. | 10 file-level passes in the lead's environment |
| `node --test --test-isolation=none *.test.ts` (in `tests/`) | **63 named tests, 63 pass** (`p0-12-w1-retest/node-named-tests.txt`) | 63 |
| `browser-check.mjs --run qa-71f-selftest` | **51/51**. All five `dismiss.*` checks and `ask.late_bridge_answer_not_presented` pass. The first load succeeded, so no retry was needed this run. | 51/51 |
| `trusted-check.mjs --run qa-71f-trusted` | **37 pass, 0 fail.** `nav.touch_scroll` and `nav.pinch_zoom` are not verifiable (their controls are `environment_unsupported`); `control.raw_touch_drag` is supported; 0 runner errors | 37 + 2 not verifiable |
| `entries-check.mjs --run qa-71f-entries` | **16/16**, 0 runner errors | 16/16 |
| `validate_evidence.py` on the QA self-test output and `capabilities.json` | **18 submitted asks** and 20 capability rows, 0 problems (shape validity only) | 18 |
| `offline-close.probe.mjs` (lead reproduction) on the exact `disclosure-model.ts` | exit 0. After an unacknowledged offline close and reconnect: `pendingClose: true`, permission `none`. A later old-request policy gives `present: false` (`request_superseded_or_cancelled`). The original failure, preserved in `p0-platform-integration/offline-close.log`, no longer reproduces. | blocked |

## QA mutation check of the W-1 and presentation guards

Harness: `tests/e2e/web/run_p0_02_r2_mutations.py`, run with
`QA_TARGET_ROOT=/tmp/qa-71f/repo`. It uses main's F4/F4b locators and adds QA's own
W1a–W1f. `tests/e2e/web/test_p0_02_r2_mutation_sites.py` confirms all 16 edit sites
are unique in current code. Each mutation used the unchanged 63 unit tests and the
unchanged 51-check self-test. Evidence:
[qa-mutations.json](p0-12-w1-retest/qa-mutations.json).

| ID | Guard removed or weakened (`src/page.ts`) | Unit | Self-test | Caught? |
| --- | --- | --- | --- | --- |
| CONTROL | none | 63 pass | 51/51 | control OK |
| F4 | generation not checked after the bridge await | pass | 48/51: `ask.late_bridge_answer_not_presented`, `dismiss.close_before_delayed_response`, `dismiss.new_ask_retires_pending` | **yes**, matches lead |
| F4b | `closeCard` no longer retires the generation | pass | 50/51: `dismiss.close_before_delayed_response` | **yes**, matches lead |
| W1a | no pending card on a top submission | pass | 48/51: `close_before_delayed_response`, `older_card_replaced_while_newer_pending`, `new_ask_retires_pending` | **yes** |
| W1b | a new ASK leaves the retired pending card on screen | pass | 50/51: `dismiss.new_ask_retires_pending` | **yes** |
| W1c | the pending card is not removed when the outcome has nothing to show | pass | **51/51** | **no** |
| W1d | a new ASK no longer bumps the generation | pass | 50/51: `dismiss.new_ask_retires_pending` | **yes** |
| W1e | the pending card text claims an explanation | pass | **51/51** | **no** |
| W1f | `clearPending` ignores which submission the card belongs to | pass | **51/51** | **no** |

## Findings

- **W-2 (low; owner web).** Three W-1 guards have no regression test (W1c, W1e,
  W1f survive).
  - **W1c.** `not_in_ask` has no card text (`page.ts:521`). It is returned when the
    ASK is cancelled while the snapshot is still hashing (`session.ts:149`). In that
    case `clearPending(gen)` in the `.then` branch is the only thing that removes
    the pending card. Without it, a "Preparing…" card stays on screen indefinitely.
    The text is honest, but the card is stuck.
  - **W1e.** The pending card is documented as "honest status only", but nothing
    asserts that its text makes no explanation claim.
  - **W1f.** With the generation check in `clearPending` weakened, a late result
    for an older submission can hide the newer submission's pending card before
    the newer answer arrives.
  - None of these is a product defect at 71f1389; the current code has all three
    guards. Suggested fix: add three self-test checks — cancel during hash leaves
    no pending card; the pending body makes no explanation claim; an older late
    result does not remove a newer pending card.

## Independent code review with node-only probes

- **Reviewers:** four Opus 5.5 reviewers, one each for W-1 dismissal, the P0-12
  disclosure model, the P0-12 organize/export model and the answer-entry observer.
  Each worked from byte-identical copies of the exact files and wrote node-only
  probes with DOM/event doubles (no browser).
- **Verification:** each area then had an adversarial verifier, who re-ran every
  claim from a fresh copy and downgraded or reclassified where the evidence was
  weaker.
- **QA lead re-check:** I re-ran P012-D1, EO-1 and ORG-3 personally on
  byte-identical files, with the same outputs.
- **Probes:** `tests/e2e/web/p0_12_w1_review/`. The full structured result is
  `p0-12-w1-retest/review-findings.json`.
- **Caveat:** all reviewers are the same model family. This is a QA perspective,
  not a human or cross-model certificate.

**Kinds.** The P0-12 disclosure and organize models are **test-only engineering
models** (not production protocol), so their defects are model defects that the
future contract and client must not inherit. The W-1 and observer items are
fixture/probe code.

### Medium (verified)

| ID | Area / kind | Finding | Reproduction → actual | Owner |
| --- | --- | --- | --- | --- |
| P012-D1 | disclosure model / model defect | After a **connected** "let me try" (or a lowered request), a brief disconnect and a reconnect carrying the same pre-close snapshot version brings back the old full solution. The same snapshot is correctly ignored while connected; the reconnect path (`disclosure-model.ts` ~262 uses `<`) re-applies it. Violates R53 (no solution after "let me try" until the user asks again) and the plan's rule 7. The offline variant holds. | `node probes/adversarial.mjs` → `FAIL S1 … present=true reason=current … permission=full_solution` (also S1b, S1c); control `HELD S1-control … present=false`. Added to the 3,000-seed loop: 22 violations in 2,316 reachable cases; the model's own oracle agreed with all 22. | web |
| P012-D3 | disclosure model / coverage gap | Two mutations that escalate an active request from key_concept to a displayed full solution pass all 63 tests. I15 checks only a boolean "open", I14 only the request id, and I1 compares against the model's own permission. | `probes/mutate.py` + `survivors.mjs` → MA/MB `SURVIVED`; effect `present=true … full_solution` versus the original `exceeds_permission` | web |
| ORG-1 | organize model / model defect | Answer-prompt refusal is a single slot keyed only by problemId. Visiting Q2 erases Q1's refusal (Q1 is asked again). A delayed Q1 refusal applied after moving suppresses Q2. `decline()` cannot name its problem, so "unknown order stays restrictive" and "explicit reopen" cannot be expressed. | `node probes/behavior.ts` P1/P2 | web |
| ORG-3 | organize model / model defect | Evidence of an external effect with no local `dispatch_started`, or arriving after a pre-dispatch cancel or failure, is discarded, and exposure is reported as **none**. This contradicts QA T1 in ADR 0002 (possible external exposure is unknown, not none) and §8 (keep the actual or unknown outcome). | `node probes/behavior.ts` P4 → e.g. `["prepared","panel_opened","target_import_confirmed"] … exposure(help)=none` | web |
| ORG-10 | organize model / coverage gap | Exempting `correction` layers (the most answer-bearing) from the current disclosure check survives all 11 organize tests. Exempting layout layers from disclosure or preview survives too. | `probes/mutate.mjs` N6/N5/N7 `SURVIVED`; N6 effect `{"allowed":true}` versus the original `layer_not_permitted_now` | web |
| ORG-11 | organize model / coverage gap | Reporting an unknown dispatch outcome as `everShared=true` (false success) survives. The tests assert only `latest`. | N3 `SURVIVED` | web |
| EO-1 | entry observer / probe defect | A page script's `click()` on a choice inside a **closed** shadow root is recorded as `actor: user, trusted_event`; the same click in an open root is correctly `site_script`. The plan's matrix row labels the closed-shadow case "user (event)". This breaks R51/A42 (site actions never credited to the learner) and ADR 0002 §3. | `node probes.mjs` → `F1 ['opaque_change:#closed-host:user:trusted_event@set1-q1']`, open: `site_script:scripted_activation` | web |
| EO-2 | entry observer / coverage gap | The static no-write/no-submit/no-network guard in `p0-12-observer-safety.test.ts` misses these inserted lines: `form.requestSubmit()` (its submit pattern is case-sensitive), `HTMLElement.prototype.click.call`, `Object.assign(el,{value})`, `el.value+=`, `setAttribute('checked')`, `new WebSocket`, `new Image().src` beacons, `indexedDB`. A combined mutant passes typecheck and 63/63. The plan (L261) says the guard forbids writes, clicks, submit, network and storage. | `node mutate.mjs` → all 12 `SURVIVES`. The browser `entries.observer_never_writes` would catch only the `.value +=` change. | web |
| W1-QA-02 | W-1 / coverage gap | No unit test imports `page.ts`. The weakened `clearPending` guard survives all unit tests **and**, confirmed by QA's browser run (W1f above), the 51-check self-test. In the self-test, responses arrive newest-first, and each `dismiss.*` case has a single pending request. | Probe S2 with FIFO order: the newer pending card vanishes when the retired older answer lands | web |

### Low and informational (verified)

- **W-1 fixture code** (owner web).
  - *W1-QA-03:* the not_in_ask and error clearing paths are untested (same as W1c).
  - *W1-QA-04:* cosmetic or test-hook survivors: stale `cardSnapshot().pending`
    after close; the pending class kept on the result card; a pending card in
    frames; the old highlight during pending; `frameAsk` not cleared on close.
  - *W1-QA-05 (pre-existing since 693069a):* a second mark in the same ASK while the
    first is hashing retires the submitted request, which is then never shown.
  - *W1-QA-06 (pre-existing):* thrown errors after submit are logged as
    `empty_geometry`, and the page stays in ASK.
  - *W1-QA-07 (doc):* "frames render no cards of their own" is true only for
    submitted outcomes; frames render their own `source_unregistered` and
    `empty_geometry` cards.
  - *W1-QA-01 (reclassified to observation):* a frame's evidence says
    `presented:true` for an answer the top rejects. Per the F4 definition, in a
    frame this means "relayed".
  - *W1-QA-08, W1-QA-09 (info).*
- **Disclosure model** (owner web).
  - *P012-D5:* liveness. An unacknowledged close can block a causally later
    explicit request, because acceptance of a connected request is modeled only
    for provisional requests at reconnect. This errs toward less disclosure.
  - *P012-D2 and P012-D6 (downgraded to observation).*
  - *P012-D4 (info):* the randomized oracle has independent state but mirrors the
    model's logic, and it agreed with all 22 D1 violations.
  - *P012-D7 (doc):* the plan's status table says 13 traces and 19 mutations
    (the fixture has 20 and §2 says 23). No post-fix offline-close log is retained;
    QA's run is `p0-12-w1-retest/offline-close-71f.log`.
  - *P012-D8 (info).*
- **Organize model** (owner web).
  - *ORG-2:* refusal guard mutations survive.
  - *ORG-4:* export events carry no attempt or manifest identity.
  - *ORG-5:* no reconciliation gate before a retry.
  - *ORG-7:* layout-only consent approves an answer-bearing `addition` layer, and a
    test pins this.
  - *ORG-9:* a later confident AI classification reverses the user's explicit
    purpose correction.
  - *ORG-12:* unknown-outcome resolution is untested.
  - *ORG-13:* "never a submit option" is asserted for only one capability
    combination.
  - *ORG-6 and ORG-8 (reclassified to observation):* confirmation is bound only to
    a manifest id string, and purpose changes are not rechecked at dispatch. These
    should be addressed in the P0-08 contract.
- **Entry observer** (owner web). These are fixture-only issues that per-site
  adapters must avoid:
  - *EO-3:* on a multi-problem page, every entry is bound to the first problem.
  - *EO-4:* site feedback that is inserted as new nodes, or revealed by an
    attribute toggle, is not recorded.
  - *EO-5:* `<select>` and ARIA choices are dropped without a gap record.
  - *EO-6:* closed-shadow detection relies on the tag name.
  - *EO-7:* silent site changes are credited to the learner's next click.
  - *EO-8:* reselect is keyed by radio name only.
  - *EO-9:* `getContext('2d')` on the site's canvas can lock its context type.
  - *EO-10:* all non-sensitive text fields on the page are recorded, including
    ones outside the problem.
  - *EO-11:* cleared answers on a problem switch are not marked ambiguous.
  - *EO-12 (observation).*

**Checks that held.** `p0-12-w1-retest/review-findings.json` lists 51 held checks,
each marked as either reviewer-reported or verifier-rechecked.

Explicitly rechecked by a verifier:
- the offline-close reproduction is now blocked and keeps `pendingClose`;
- disclosure-guard mutations that the tests do detect;
- panel-open is not recorded as shared, imported or dispatched;
- a timeout without dispatch creates no exposure, and a timeout after dispatch
  keeps it;
- a late cancel or failure cannot undo a dispatch in the same attempt;
- a draft that becomes a final answer routes to the answer prompt;
- submission is never possible in the unmutated organize model;
- reading is never inferred from exposure;
- a scripted click in an **open** shadow root is never credited to the user;
- `stop()` removes every listener;
- exactly one ask event per result.

Reported by reviewers only:
- W-1 top-document rules 1–3 hold for close-pending, newer submission, new ASK,
  frame relays, the adjust box and fullscreen;
- the unmodified observer has no write, click, submit or network path.

## Decision

- **Lead's checks reproduce on exact main 71f1389:**
  - 63/63 unit;
  - 51/51 self-test;
  - 37 trusted (+2 not verifiable);
  - 16/16 entries;
  - 18 bundles valid;
  - the original offline refusal is now blocked;
  - the F4 and F4b mutations fail as recorded.
- **W-1 top-document dismissal passes at the desktop-probe level.** W-2/W1-QA-02
  (untested `clearPending`, not_in_ask and pending-text guards) is a low,
  non-blocking coverage gap.
- **The P0-12 test models are not acceptance-ready as design references.** Two
  model defects contradict the specification:
  - P012-D1: the full solution returns after a connected "let me try" plus a
    reconnect;
  - ORG-3: possible external exposure is reported as none.

  ORG-1 (the refusal slot) and four medium coverage gaps (D3, ORG-10, ORG-11,
  EO-2) remain. These are test-only models, so no production path is affected.
  They must be fixed before the P0-08 contract or clients adopt them, and before
  their 20 traces and 3,000 sequences are cited as disclosure evidence.
- **EO-1** credits a site script's action inside a closed shadow root to the
  learner. It is fixture-only; per-site adapters must not inherit it.
- All findings return to web; nothing is repaired by QA.
- None of this is native share/import, iPad, provider or wire-protocol evidence.

Not verified: touch scroll and pinch; Safari, iPad and Pencil; the packaged
extension and extension-messaging sender checks; the native bridge and ACK; real
course sites and cross-origin players; real Notability/share/import; providers; the
real cross-device wire protocol; a real slow bridge (the self-test deferred
transport was used). No model or paid API was called.
