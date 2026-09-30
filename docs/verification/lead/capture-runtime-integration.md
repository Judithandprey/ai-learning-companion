# Trusted local desktop runtime integration

Date: 2026-09-30 UTC. Starting main:
`1ece33c03da0f0b7c8885335453ce888e5e863bb`.

## Actual delivery and scope

Backend delivered `e59c288625eeea24e875e101c9e82ce4f9bbe585` through
`handoff_14d066f2a0d68f7e51d1eac39f465c25` at09:14:48Z. The complete ordered
batch was read with stable key `lead-backend-runtime-20260930-0916`. The owner
adopted assigned baseline `07e6691` through normal merge `9fac156a`; the worker
tree was independently observed clean at the delivered commit. Review uses its
six-file commit delta, not older unrelated differences between divergent branches.

The callable `create_local_capture_runtime` composes the existing local identity
adapter, actor store, control registry and capture ASGI application. Explicit
stable identity, original registration pins, frozen scopes/capabilities, ephemeral
token and future expiry are mandatory. Actual fresh scoped consent is a trusted
host obligation. Default reopening reconciles an existing exact grant; it neither
enrolls a new binding nor registers/starts a producer. Consumed retries report the
current stopped/withdrawn state without regrant. No public provisioning endpoint,
second archive, provider, listener, default application or preview change is added.

The small existing registry transaction seam avoids nested initialization
transactions. Actor-document emptiness prevents surviving originals/tombstones
from being treated as a pristine actor after authorization loss. Existing used
identity witnesses, generation/membership pins and revoked/deleted foundations
remain fences. Device/session revocation and membership deletion/revocation are
also checked on current HTTP operations, including cached registration.

Review scope: R07/R27/R35/R36/R51/R52, A12/A14/A16/A30/A31, main §3.9/7.1,
V-LongRunningCompanionship and released process-control 0.2.1 semantics. Existing
wire families 0.1.0–0.2.6 and their capability gates are unchanged. This local
adapter is not production OAuth, OS consent or evidence that a producer stopped.

## Independent review and integrated verification

Lead read the complete new factory/tests, registry/storage delta and existing
auth/control/composed transport path. On the exact clean worker candidate:

- Runtime/control/control-HTTP/composed-app: **231 passed in3.06s**.
- Storage/display-source/ingress/raw-ingress: **243 passed in8.73s**.

These are474 distinct focused MemoryStore/in-process ASGI checks, not a real
desktop, new DB process or provider run. Independent review approved the bounded
delivery without a blocking defect. The reviewer reran231 relevant checks and
added six groups: expiry at bootstrap lock entry rolls back; account revocation
after HTTP authentication rejects; source deletion/revocation each fence reopened
bytes and raw replay; Stop invalidates a prepared successor; account reauthorization
requires a new freshly consented incarnation with retained predecessor. Repeated
author tests are not added to the distinct coverage count.

Normal cherry-pick integrated the reviewed source as
`fa30a255f9d9c8cb610802fa2ff7b8854d6d4b93`. On that main checkout:

```sh
.venv/bin/python -m pytest -q \
  services/api/tests/test_capture_runtime.py services/api/tests/test_control.py \
  services/api/tests/test_control_http.py services/api/tests/test_capture_app.py \
  services/api/tests/test_storage.py services/api/tests/test_display_sources.py \
  services/api/tests/test_ingress_http.py services/api/tests/test_raw_ingress_http.py
```

Actual result: **474 passed in11.49s**, exit0. The unchanged six independent
groups also pass on main. They are preserved in
[`capture-runtime-review-check.py`](capture-runtime-review-check.py), with one
additional Lead integration group connecting the actual runtime HTTP upload to
the released Learning `prepare_observation_window`: exact PNG and editable-ink
references survive, Stop preserves historical reads without a live/provider/help
claim, and token revocation withholds the window. All **seven groups** pass:

```sh
.venv/bin/python -c "import runpy; runpy.run_path('docs/verification/lead/capture-runtime-review-check.py', run_name='__main__')"
```

No actual desktop semantics are assigned to the synthetic ReplayKit-profile
fixture. API/contracts in the candidate parent match the pre-integration main
dependencies; the cherry-pick changes only the six delivered files. Shared wire,
dependency files, default application, preview and platform source are unchanged.
`git diff --check` passes. Independent component review is not role-QA runtime
acceptance. Ordinary publication and exact consumer receipts are recorded below
after their operations succeed.

The owner's separately attributed [PostgreSQL evidence](../backend/capture-runtime.md)
reports six bounded groups on the existing dedicated `lc_p0_test`, fresh store
connections, five synthetic actors cleaned and no migration/listener. Its original
sandbox failure, automatic approval rejection, recovery of the actual current
task authorization and normal subsequent approval remain recorded there. Lead has
not rerun that DB campaign or touched the user-preview database or Paperclip.

## Next consumers and retained limits

After the verified ordinary main push, Lead releases the
exact callable baseline to the existing Windows/macOS owners at their current
safe handoffs. Keep stable identities and registration idempotency keys, protect
and expire tokens outside course content, obtain actual OS/user consent, and
derive Stop evidence independently from the producer. Reopening a backend state
does not restart desktop capture or make a retained frame current.

Windows and macOS keep their current bounded source assignments. Lead must bind
their actual emitted metadata through an explicit compatible desktop profile;
ReplayKit-specific 0.2.5 facts cannot be relabeled as desktop facts. The released
Learning observation-window component is ready for that real evidence binding.
The product vision/audio provider remains disabled and interactive Mac access
unconfirmed. Both full §7.1 gates, desktop audio/input and actual Notability import
remain open; component tests cannot close them or the full desktop product.
