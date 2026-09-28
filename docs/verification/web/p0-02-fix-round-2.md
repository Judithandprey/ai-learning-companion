# P0-02 fix round 2: peer review F1–F6

Date: 2026-09-28 UTC. Owner: web (05).
- Fixes the review of `127bd4cb4cb505edf791c5f386bda905dcf1369b` by learning (Astra),
  `docs/verification/learning/p0-02-peer-review.md` at `59f8ec7ae75e365edb9929edbca2c8c6ce760788`,
  read with `git show` and not merged.
- Scope, contract `0.1.0`, dependencies and root configuration are unchanged.
- The original commit, report ([`p0-02-web-probe.md`](p0-02-web-probe.md)) and round-1 evidence
  (`evidence/edge-*`) are kept. Round-2 evidence uses the `r2-` prefix.

## Findings, fixes and regressions

| Finding | Fix (`apps/safari-extension`) | Regression check (fails without the fix) |
| --- | --- | --- |
| F1: mouse `pointercancel` in ASK submitted an existing text selection | `src/page.ts` `onPointerUp`: cancellation is handled first for every kind of mark; the pending mouse text selection and any captured stroke are dropped | self-test `ask.mouse_cancel_submits_nothing` |
| F2: a child frame could relay a fixture card in NAV/WRITE/after a cancelled ASK, and zero requests were counted | Top accepts `ask_done` only during its current ASK with the matching epoch. It then records `{epoch, frame}` and accepts **one** card only from that frame, for that epoch, before any newer ASK or dismissal. A frame Cancel sends `ask_cancelled`, which never allows a card. The frame sends `ask_done` before its card, and both carry the top epoch taken at submission | self-test `frame.unauthorized_relay_rejected` (frame-realm messages in NAV, WRITE and after a cancelled ASK; rejection reasons asserted) |
| F3: the adjust box mixed mark-time video time with confirm-time text/version | `src/dom-capture.ts` `captureMarkState`/`snapshotFromMark`. At the mark: visible words and positions, block context, each video's state and position, page version, viewport and scroll. On confirm, the snapshot is built only from that state, with the box mapped back to mark-time coordinates. Changing to fullscreen discards a pending box | self-test `ask.adjust_box_single_moment`; unit `adjust-box snapshot uses one consistent mark-time state (F3)`; trusted `ask.adjust_freezes_mark_time` still passes |
| F4: a late bridge answer for an older mark replaced the newer card | `src/page.ts`: presentation generation, bumped by each submission, each new ASK and each card dismissal, and checked after the last await. A stale result is emitted as evidence with `presented: false` and never rendered or relayed | self-test `ask.late_bridge_answer_not_presented` with a self-test deferred transport (requests held, answered newest-first) |
| F5: frame `captured_at` was read from the clock after the asynchronous hash | `src/frame.ts`: `captured_at` belongs to the snapshot payload, taken synchronously when the page is read (UTC-validated), and the frame copies it. `src/session.ts`: `created_at` is taken before any await | unit `capture time is not shifted by a slow hash (F5)`, `selection time is taken before hashing; frame time is the snapshot time (F5)` |
| F6: "an eigenvector keeps its direction; only its length is scaled" is wrong for λ < 0 and λ = 0 | `src/fixture-data.ts`: "a nonzero eigenvector v satisfies Av = λv … a negative λ reverses its direction; λ = 0 sends it to the zero vector", with the Chinese hint changed to match | unit `eigenvector fixture covers negative and zero eigenvalues (F6)` |

**Counterexamples.** Each fix was reverted alone in a temporary copy, and the unchanged round-2 tests were run.
Every regression above failed without its fix:
- F1: self-test 44/46, failing `ask.mouse_cancel_submits_nothing` and `totals.requests_match_intended_marks`.
- F2: 45/46.
- F3: 45/46. Submitted `version: 3, text: "Totally"`, the confirm-time state.
- F4: 45/46. The late card replaced `eigenvector` with `change of basis`.
- F5: 2 unit tests failed.
- F6: 1 unit test failed.

Details: [`evidence/r2-counterexamples.json`](evidence/r2-counterexamples.json). The F6 check tests the fixture text itself. The correction was
reasoned from the reviewer's counterexample (A = diag(−1, 2), v = (1, 0)). An independent semantic review
of all fixture text has not been done.

## Commands and results (round 2)

```text
$ RUN_PREFIX=r2-edge BROWSER="/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" apps/safari-extension/scripts/check.sh
typecheck: pass; node --test: 48 pass, 0 fail (P0-02 files only); build: pass
checks passed 46/46; failed: none                                  (r2-edge-selftest)
trusted checks passed 37; failed: none; not verifiable here: nav.touch_scroll, nav.pinch_zoom (r2-edge-trusted)
$ PYTHONPATH=. repo/.venv/bin/python apps/safari-extension/scripts/validate_evidence.py \
    docs/verification/web/evidence/r2-edge-selftest.json docs/verification/web/capabilities.json
r2-edge-selftest.json: 14 submitted asks validated, 0 problems
capabilities.json: 20 capability rows validated, 0 problems
```

- **Environment:** unchanged from round 1 (Edge 154.0.4258.37 headless, Windows 10.0.26200 via WSL2, Node 24.21.0,
  TypeScript 7.0.2).
- **One harness change.** WSL localhost forwarding sometimes refuses the first page load right after the port
  was reopened (`net::ERR_CONNECTION_REFUSED`, seen in two mutation runs and once in the round-2
  self-test). `browser-check.mjs` now retries such a refused load once after 5 s and logs it. Any other failure
  is reported as is.
- The node test count above comes from running the committed P0-02 files alone (see the delivery message for
  the isolated check of this commit).
- The reviewer's isolated runner saw 7 file wrappers instead of 44 named tests. That is a runner-output
  difference; in this environment `node --test tests/*.test.ts` reports named tests.

## Corrections to round-1 statements

- The report and capability row said page scripts could not forge cards or ask completion. Only the
  self-posted top-page case was tested, and a child frame could still relay a card (F2). Round 2 fixes the
  unauthorized-state bypass. It remains true that a script inside a peer-origin child frame can complete a
  **live** ASK and show an exact-fixture card for it: window messaging is unauthenticated. The packaged extension
  must use extension messaging (background with `frameId`).
- `ask.adjust_freezes_mark_time` checked only the numeric media position. Round 2 adds the version and text
  consistency check (F3).
- Frame `captured_at` in round-1 evidence is the post-hash time, differing from the snapshot moment only by the
  hash duration in those runs. It is not corrected retroactively.

## Still not verified

No iPad Safari, Apple Pencil, packaged Safari extension, native bridge or ACK, real course page or
Kaltura-style cross-origin player, and no model provider. The F4 case used a self-test transport. Desktop headless
results do not establish device behavior. The remaining device checks are those listed in the round-1 report.
