# Pixel admission QA review — HOLD for one deterministic-clock correction

QA delivery `8b5b0f20c6b15868e37923b2f8bdf19356020bc1`, parent `133ce0a`; production candidate `d412ed90495b0bb894ec6f7059d9ebf62a2186fb`. Exact export: `/tmp/pixel-admission-qa-8b5b0f2`.

The substantive tests are meaningful and the original result is reproduced: **21 passed in 2.01 s**. However, two tests use an expiring real-world date inconsistently, so the test delivery needs a small QA-only correction before durable integration acceptance. This finding does not invalidate the recorded original pass or demonstrate a production admission defect.

## P2 — the historical read tests expire at 2026-09-30 14:00 UTC

Location: `tests/e2e/test_p0_13_pixel_admission_qa.py:30`, `76–81`, and especially `106`.

`NOW` is fixed at `2026-09-30 13:00 UTC`; every rig creates its token with expiry `NOW + 1 hour` and gives the runtime/HTTP app `clock=lambda: NOW`. But `Rig.read()` calls the same authenticator with **real `utc_now()`**. Consequently, at or after 14:00 UTC on that date the raw and legacy historical-read cases fail with an expired token even though their actual runtime/HTTP calls still run at the fixed valid time.

I reproduced this without editing candidate source or changing product time. A review-only pytest plugin replaces only this QA module's imported `utc_now` with `NOW + 2 hours`. It selects the two existing historical-read cases; both fail at `read_before`, through the real `AuthorizedProcessContextReader` guard, with `DomainError: unauthenticated` (underlying authenticator rejects expiry). Result: **2 failed, 19 deselected in 0.64 s**.

Reproducer plugin: `/tmp/pixel_admission_future_clock.py`.
Failure log: `/tmp/pixel-admission-qa-future-clock.txt`.

```sh
cd /tmp/pixel-admission-qa-8b5b0f2
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/tmp \
  /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest \
  -p no:cacheprovider -p pixel_admission_future_clock -v \
  tests/e2e/test_p0_13_pixel_admission_qa.py -k cached_structured
```

Minimal QA-only correction: in `Rig.read.guard`, use the same injected test clock as the runtime, e.g. `runtime.app.state.authenticator.authenticate(TOKEN, NOW)`, and remove the now-unused `utc_now` import. Keep the actual authenticator, principal/generation guard, HTTP paths, assertions and fixed expiry. Alternatively expose one shared rig clock and call it from both places. Do not weaken authentication, extend expiry to a distant arbitrary year, change production code, or rewrite the time-bounded original result as never having passed.

## Source and evidence identity

- All five files added by the QA commit match their raw Git blobs. Inventory: `/tmp/pixel-admission-qa-hashes.json`.
- Test SHA-256 is `581e6164ed009a84a6c9d992b5c29c14a66d9081148aca76c857e985eae4eff4`, agreeing with the report's abbreviation.
- Candidate, QA merge and evidence commit have identical `services` tree `aacc52c6c5969365d14813e32855d4c65f3757d0` and `packages` tree `6c6ba0717e094792d29e27b5b3b4c2a84f413882`.
- The complete 21-case rerun used the exact export and existing main `.venv`, Python 3.14.4 / pytest 9.0.2, with cache and bytecode output disabled. Log: `/tmp/pixel-admission-qa-21-review.txt`.

```sh
cd /tmp/pixel-admission-qa-8b5b0f2
PYTHONDONTWRITEBYTECODE=1 \
  /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest \
  -p no:cacheprovider -v tests/e2e/test_p0_13_pixel_admission_qa.py
```

## Coverage is real within the stated MemoryStore/ASGI boundary

The test calls production `create_local_capture_runtime`; it does not replace the admission registry or use a fake HTTP app. It sends registration, display source, originals and framed batches to the composed app using `httpx.ASGITransport`. The bearer authenticator, runtime profile binding, current state and actual route handlers execute. HTTP is in-process; no listener is opened. The authorized context reads are direct calls to the real reader with the runtime's authenticator, rather than another HTTP endpoint.

The reused Backend `scenario()` provides synthetic payloads from a separate scratch MemoryStore. Its helper's name includes PostgreSQL, but the imported scenario does not connect to a database or start the runner. The tested runtime starts from the newly supplied MemoryStore. The stop-fact resolver is test input and no Stop lifecycle acceptance is inferred from its presence.

Meaningful assertions include:

- Pixel profile binds both current stream and consumed start grant; first gap and honest frame are accepted. Invalid desktop/profile combinations reject before writing any documents.
- Structured spoof is refused on desktop 0.2.8, raw 0.2.6 and legacy 0.2.4. Every `forbidden()` check verifies exact route-version 403 response and complete actor-document equality before/after, including no changed replay/sequence/frame rows.
- Mixed honest/spoof batches are rejected atomically in both orders **on the desktop route**. Mixed-batch atomicity is not separately tested on raw/legacy by this file; keep the report's broad introductory wording scoped accordingly.
- A marked producer still accepts honest raw pixels. Genuine generic raw/legacy structured inputs and their exact ACK replays remain accepted for never-desktop, another actor and another stream/producer. These positives also make the negative spoof-body tests useful rather than merely malformed-body checks.
- Generic success is committed and replayed before trusted adoption. After adoption, an exact retry is refused with no writes. The canonical record and replay row/ACK remain byte-equivalent in their stored JSON, original GET data decodes to the exact PNG bytes, and authorized reader output remains equal with the old structured declaration preserved. The fixed-clock defect occurs in this otherwise meaningful preservation check.
- The first-gap-only fixture explicitly removes both internal profile fields; no raw frame exists yet. Fallback is refused for the four listed route/claim combinations and a generic reopen cannot downgrade the incarnation. This is explicitly synthetic internal damage, not a claim that HTTP clients can delete the markers. Simultaneous loss of every witness remains outside coverage.

## Regression evidence and limits

The committed sensitivity log records exactly four failures on pre-correction `e4b2d41`: raw structured, legacy structured and raw honest fallback after marker loss, plus generic reopen downgrade; it records 21 passes on `d412ed9`. These are summary logs, not full tracebacks, and were not independently rerun in this review. They are appropriately retained as QA's reported negative-control evidence.

The prose also mentions a 21-pass run on `03feb72`, which has no separate block in the committed sensitivity log. Its `services` and `packages` trees are identical to `d412ed9`, so source equivalence is verified; a distinct execution is not established by this file. No new run is needed merely to preserve that distinction.

The 91-case raw-ingress control and 56 owner tests were deliberately **not rerun**. Their three-line control log remains author-reported evidence, with the owner suite explicitly separated from independent QA. No PostgreSQL, native output, real DOM/own-ink acquisition, Windows producer binding, provider, presentation or §7.1 product gate is verified here.

Applied project PONYTAIL LITE and proportional review: one exact 21-case run plus the two-case wall-clock regression prompted by the concrete defect. No source edits, Git mutations, main/worker changes, new agents, Chats, installs, DB, services, native app or provider. Return the one-line clock correction to QA, then rerun only the affected bounded tests; preserve the original 21-pass log as accurate at its recorded time.

Lead returned this one QA-only clock correction in accepted `handoff_dce7d28756421c656638adfa5e0ab49c`; candidate8b5b0f2 is not integrated yet. Actual21 passes remain time-bounded evidence, and the two future-clock failures remain preserved. No production defect or new database/device task is inferred.
