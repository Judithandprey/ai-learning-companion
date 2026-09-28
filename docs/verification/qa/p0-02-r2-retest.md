# QA re-test: P0-02 web fixes F1–F6 at main 693069a

- **Candidate:** `693069ac9e83ad955f808ca934b7fbec643f40f3`. Web `cdc354c` is integrated
  as `638f32f`; learning's review `903b323` as `fc67bae`.
- **Merge:** main was merged normally into `team/qa` (`ccf2953`, no reset). The merge
  result differs from the candidate only in QA-owned files, not in `apps`,
  `packages`, `services` or `scripts`.
- **Scope:** the six peer-review findings, checked by re-running the existing unit,
  browser and trusted-input checks. QA also added its own mutation runs and re-ran
  learning's DOM-double probe.
- **Not re-run:** backend and learning suites. The ADR is out of scope for this task.
- **Environment:**
  - WSL2 Ubuntu 26.04.1 with Windows 10.0.26200 interop;
  - Node 24.21.0 and TypeScript 7.0.2 (the lead's pinned tools, read-only);
  - Microsoft Edge 154 headless, with a fresh temporary profile on port 4173 (the
    lead-allocated port).
- **This is a desktop check only.** Events are synthetic (self-test) or CDP
  `Input.*` (trusted check). It is not Safari, iPad, Apple Pencil, a packaged
  extension or a native bridge.

## Commands and results

| Command | Result |
| --- | --- |
| `bash scripts/check.sh` (root) | exit 0. **464 passed / 14 xfailed.** This includes QA-only tests on this branch; main alone is the lead's 433/13. Web typecheck passes, `node --test` reports 48 tests (48 pass) and the build passes. |
| `node scripts/browser-check.mjs --browser <Edge> --out /tmp/... --run qa-main-selftest` | **46/46**, no failures. Evidence: [qa-main-selftest.json](p0-02-r2/qa-main-selftest.json) and a screenshot. |
| `node scripts/trusted-check.mjs … --run qa-main-trusted` | **37 pass, 0 fail.** `nav.touch_scroll` and `nav.pinch_zoom` are not verifiable, because their control rows (`control.touch_scroll`, `control.pinch`) are `environment_unsupported`. `control.raw_touch_drag` is supported. 0 runner errors. [qa-main-trusted.json](p0-02-r2/qa-main-trusted.json). |
| `validate_evidence.py` on the QA self-test and on `capabilities.json` | 14 submitted asks and 20 capability rows validate, 0 problems. This is shape validity, not capability evidence. |
| Learning `p0-02-r2-peer-probes.mjs` (fc67bae), run from an exported copy of this tree | exit 0. All 15 case results equal the committed `p0-02-r2-peer-results.json`; only the wrapper metadata that learning added afterwards differs. [learning-probe-rerun.json](p0-02-r2/learning-probe-rerun.json). |

These match the owner's and lead's reported 48 / 46 / 37 (+2 not verifiable). QA
ran them itself and did not copy those results.

## Independent mutation check

Each row is **QA's own minimal revert** of one fix, applied to a `/tmp` copy of the
module and checked with the unchanged tests. The harness is
`tests/e2e/web/run_p0_02_r2_mutations.py`; `tests/e2e/web/test_p0_02_r2_mutation_sites.py`
keeps its edit sites valid. Results:
[qa-mutations.json](p0-02-r2/qa-mutations.json).

| ID | QA revert | Unit (48) | Browser self-test (46) | Caught? |
| --- | --- | --- | --- | --- |
| CONTROL | none | 48 pass | 46/46 | harness control OK |
| F1 | pointercancel handled after the pending mouse text (127bd4c order) | pass | 44/46: `ask.mouse_cancel_submits_nothing`, `totals.requests_match_intended_marks` | **yes** |
| F2 | `authorized = true` for relayed frame cards | pass | 45/46: `frame.unauthorized_relay_rejected` | **yes** |
| F2b (extra) | authorized frame card not consumed after use | pass | 45/46: same check. An earlier legitimate frame ASK left its authorization behind, so a card relayed later in NAV was accepted | **yes** (indirectly) |
| F3 | adjust confirm re-reads the live page at confirm time | pass | 45/46: `ask.adjust_box_single_moment` | **yes** |
| F4 | presentation generation not checked after the bridge await | pass | 45/46: `ask.late_bridge_answer_not_presented` | **yes** |
| F4b (extra) | closing a card no longer retires pending results | pass | **46/46** | **no** (see finding W-1) |
| F5a | selection `created_at` taken after the hash await | 1 fail (selection-time F5 test) | not run | **yes** |
| F5b | frame `captured_at` from the wall clock after hashing | 2 fail (both F5 tests) | not run | **yes** |
| F6 | old "keeps its direction" eigenvector text | 1 fail (F6 test) | not run | **yes** |

These agree with web's recorded counterexamples for F1–F6 (44/46, 45/46, 45/46,
45/46, 2 unit failures, 1 unit failure). QA's reverts were written independently,
not taken from web's.

## Findings

- **W-1 (low; owner web).** The dismissal guard is untested in web's own suites, and
  its behavior needs a stated intent.
  - Closing a card bumps the presentation generation (`page.ts:274-276`). Removing
    that bump (F4b) passes all 48 unit and 46 browser checks. Only learning's
    external DOM-double probe catches it (its line 165 asserts that the card stays
    hidden).
  - The card is not hidden when a new ASK starts. So if an **older** card is still
    visible and the user closes it while a **newer** request is pending (possible
    with a slow native bridge), the newer answer is dropped. The evidence still
    records it (`presented: false`), but the learner gets nothing for a request they
    just made.
  - This errs on the side of less disclosure and does not contradict the spec. It
    should still be a deliberate choice, with a regression test in web's own suite
    either way. Examples: close hides the old card only; or a pending request is
    retired only if its own placeholder was dismissed.
- **Claims are not expanded.**
  - `capabilities.json` still has 20 rows, with `device: not_tested` on all of them.
  - Status counts: 14 automated_pass, 2 implemented, 2 unsupported, 2 not_tested.
  - The only changed row withdraws the round-1 overclaim ("page scripts cannot
    forge cards"). It now states that a peer-origin child-frame script can still
    complete a live ASK over `window.postMessage`, and that the packaged extension
    must use extension messaging.
  - `p0-02-fix-round-2.md` keeps its "Still not verified" list.

## Decision

- F1–F6 **pass at the desktop-probe level on exact main 693069a**:
  - every regression reproduces, and fails when its fix is removed;
  - trusted input shows no failures;
  - no expanded device claim.
- W-1 is a low-severity test gap and intent question. It is not a blocker.

Not verified:
- touch scroll and pinch (not verifiable in this environment);
- Safari, iPad and Apple Pencil;
- the packaged Safari extension and the real extension-messaging sender check;
- the native bridge and ACK;
- a real course page and a cross-origin player;
- pixels and model providers;
- the F4 case with a real slow bridge (the self-test transport was used).

No model or paid API was called. Temporary browser profiles and servers were
removed by the harnesses.
