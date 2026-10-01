# Independent retained-focus helper review

**Scope:** new Lead-owned `packages/contracts/live_companion/focus.py` and `packages/contracts/tests/test_live_focus.py`, snapshotted over main `a8bf1fe` at `/tmp/live-focus-a8bf1fe-c5jft7ap`. Exact new-file hashes are in `/tmp/live-focus-review-snapshot.json`. Existing shared validation and Learning preparation/presentation callers were read. Concurrent dirty documentation was preserved and not used as completed implementation evidence.

**Verdict: approve this bounded, unwired helper. No concrete blocker found.** No live/1 wire change or product integration is claimed.

## Findings

- Inputs are fully validated and copied. Text/voice followup must be explicit; original focus, same session/epoch/capture and non-future sequence are required. Same-frame use also requires complete context and image metadata equality, so a changed source, ink, display, time or image cannot silently inherit the rectangle.
- On a later frame, focus remains null. The appended ordinary history entry retains the original request, image hash/dimensions, complete context and old focus, while explicitly marking old pixels unavailable and provider retention unverified. It does not reassign old coordinates to the new frame or attach old PNG bytes. Learning treats the entry as untrusted historical evidence, not current control or a new user request.
- Current words, audio attribution, permission revision, assistance and presentation remain those of the followup. Old full-solution or spoken permission is not inherited. Existing Learning rechecks current provenance, active/cancelled state and channel permission before output.
- Both input and output copies are detached. A new current focus is rejected rather than overwritten. Exact duplicate historical entries are not appended again. Entry count, per-entry length and total history limits fail explicitly after insertion; originals are neither mutated nor truncated.

Caller prerequisite: construct a valid current-frame Turn; for a later-frame retained-reference use, its `focus` must be null. The helper deliberately does not repair an invalid Turn containing an old rectangle relabelled as current. The caller continues to own the retained original source, actual current intent and final submission/presentation checks.

## Bounded checks

Ran only `packages/contracts/tests/test_live_focus.py` in the snapshot: **15 passed in 0.15s**. The corrected display-scale mutation is effective and was not treated as a source defect.

Four additional pure controls passed:

1. Same-frame followup with current assistance/presentation `none` does not inherit old full-solution/spoken permission; output mutation does not change either input.
2. Later-frame followup retains the same current restrictions and audio attribution; its old metadata and explicit pixel/retention limits remain correct and detached.
3. Adding a historical focus to history already at 32,000 characters fails without mutating either input.
4. Same-frame capture timestamp mutation is rejected even when sequence and image remain equal.

Machine evidence: `/tmp/live-focus-independent-review.json`, `/tmp/live-focus-independent-probes.json` and `/tmp/live-focus-review-snapshot.json`.

This is not wired into current Backend/Web. No actual account, provider, screen, microphone, Windows operation or native Chats call occurred. No production files were edited, and no route denial was bypassed. Next owner/action remains the existing Lead-coordinated consumer handoff when its authorized route is available.
