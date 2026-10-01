# Managed connector recovery and streaming correction

Actual Backend delivery `1b27a918f265349929d6344f0bbe163c6a854b99`, received as
`handoff_6fe4e44e81ad80dbe0541d88c9766c62`, integrates as `39620fa` on main.
This closes QA-SUB-02/03 within source and synthetic-test scope. It does not
establish user login, actual image inference or desktop behavior acceptance.

The [owner report](../../../backend/p0-04-subscription-recovery-streaming.md)
preserves the pre-fix failures: a fatal inner client left the outer pipe open,
and three 9000-delta streams were rejected by the old notification counter.
It also records the earlier sandbox pipe-test failure and approved retry.

## Reviewed changes

- A terminal inner client wakes and ends its outer stream, even with parent stdin
  open. Existing admitted work gets a one-second settlement allowance before
  bounded cleanup. No replacement child or question replay occurs internally.
  Existing Windows EOF handling marks pending results uncertain; the user's
  explicit Check can create a fresh child while application Stop fences remain.
- Fatal ASK frames are suppressed, including ordinary error frames that Windows
  would otherwise treat as known refusals. Private receipt facts are finalized.
  Actual user cancel remains distinct from internal failure: reserved/unrun stays
  not_submitted and grace-expired submitted work stays uncertain.
- Discarded text/reasoning deltas no longer spend the lifecycle-event counter.
  Lead reviewed that all received wire bytes during ASK, including preflight,
  unrelated threads, replies and unknown notifications, count before filtering.
  The 32 MiB engineering allowance coexists with the existing line, final-text,
  lifecycle/item, timeout and forbidden-tool limits. Yielding every64 lines or
  256 KiB permits deadlines/cancel to run against buffered input. Deltas are not
  assembled into a second answer; authoritative completed items still supply it.

The private `lc-subscription-ask/1` shapes, authentication owner, Linux/Mac binary
pins and user source/presentation permissions remain unchanged. A fatal pipe loss
is not a claim of quota rollback or completed remote cancellation.

## Verification and next action

[Exact main results](main-tests.txt): **189 passed in10.64s**, the two changed
connector suites only. Normal exact-command approval addresses the previously
established sandbox self-pipe restriction; only synthetic owned children run.
The [source/check manifest](verification.json) verifies exact equality to delivered
production/test paths and `git diff --check`. No official Codex, account, product
state, provider, Windows GUI or database operation was executed here.

Independent lifecycle review covers terminal→uncertain, explicit Stop/Cancel,
reserved/not-run and queued-after-terminal fences, with four bounded probe
groups passing and no blocker. The [report](independent-review.md),
[exact-source record](independent-review.json), [probe](independent-probe.py)
and [results](independent-probe.json) accompany this record. The archived probe
expects the exact candidate export at the `/tmp` path recorded in its header. This remains source/in-process evidence, separate from QA behavior.

Web continues the existing frame/preflight/login correction, and Native continues
the existing shared-connector consumer. Neither needs a second protocol or
duplicate implementation task. QA keeps prior passing controls, finishes the
existing launcher-cleanup correction, then retests changed behavior on the exact
combined candidate after Lead release. Its single real image allocation remains
unused and held for the Windows correction plus user-operated official login.
The existing user sign-in entry is preserved; no staged app or user preview is
replaced by this source integration. Full per-OS screen/audio/ink gates stay open.
