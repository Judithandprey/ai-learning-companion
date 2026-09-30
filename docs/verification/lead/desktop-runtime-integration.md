# Trusted desktop runtime integration

Actual Backend delivery `a64961fd9d034273b8024bdd2da988018224b9c9` arrived at
2026-09-30 11:15:30Z as `handoff_2e6efe98c33c710f9b18a6416922d2f9`.
Ordered read: `lead-runtime-desktop-delivery-20260930-1116`.
The six-file delivery is independently approved and integrated as **`8ccf3e7`**.

The existing callable now forwards strict default-off desktop ingress, requiring
explicit released capture/desktop capabilities and scope before store mutation.
Identity, ephemeral token, fresh consent, generation/membership and current
registration lifecycle remain the existing host-supplied boundaries. No new
runtime, identity store, listener or automatic capture was introduced.

The inherited raw mount error is closed: one routed-path lookup selects both
families correctly under root, single and nested mounts. Cancellation propagates,
rolls back staged documents, emits no ACK and permits a clean same-key retry.

## Executed evidence

- Independent exact-candidate review: **413 focused tests** passed in 11.69s;
  **12 additional probes** cover expiry at the transaction boundary, token/account
  revocation after initial authentication, composed-runtime mounted cancellation
  and both runtime instances after account revocation. No blocker found.
- Integrated main: **170 tests** passed in 3.32s across `test_capture_runtime.py`,
  `test_desktop_capture_runtime.py`, `test_ingress_mounts.py` and
  `test_capture_app_dispatch.py`. All **12 preserved review probes** also pass:
  [reproducer](desktop-runtime-review-probes.py).
- Lead executes **five composition groups** through the actual trusted factory,
  registration, HTTP gap/PNG/editable-ink upload and authorized Learning reader:
  [reproducer](desktop-runtime-context-probes.py). The target store begins empty.
  A first gap remains without fabricated pixels; later originals and full selected
  metadata survive same-store runtime recreation with a different token. The old
  host token is explicitly revoked; recreation itself does not revoke other hosts.
  Stop preserves the historical selection and refuses new live submissions.
  Revoking the current token after pixel resolution withholds the entire window.
  Provider receipt remains `not_attested` and presentation permission `not_granted`.

These execute real in-process ASGI/service code over MemoryStore with synthetic
consent/identity/native metadata and project-authored PNG/ink. Same-store recreation
is not an operating-system process restart or durable database proof. No actual
display, OS permission, audio, provider, user preview or destination was used.

Previous HTTP milestone `c588e20d533eb02d6c630010ee897d85e6ccbdd9` was pushed and
verified on origin/main; normal CI
[36707266979](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36707266979)
passed both Python 3.12/3.14 matrices. That CI predates this runtime delta; its new
focused integrated results are recorded above.

## Next owner and remaining gates

Backend's next bounded task is the newly changed desktop path on the existing
dedicated `lc_p0_test`: reuse the PostgreSQL/own-HTTP-process runner for save,
actual process restart, typed-original/gap readback and current retry/Stop fences.
Never use the user's `lc_desktop_preview`, fixed preview identity/token or preview
services. Existing raw/legacy DB campaigns remain accepted; do not replay them.
The native mapper is already active and supplies actual Swift-produced fixtures;
Lead composes those through the released path before the next host/producer handoff.
QA retains its conditional Windows behavioral pass after the correction clears.

Trusted native host identity/consent/token delivery, actual producer lifecycle,
Windows profile/retained-frame integration and a real provider remain separate
dependencies. Interactive Mac access is still unconfirmed. Both §7.1 gates, full
editable ink/anchors/audio/Notability and complete desktop product acceptance
remain open; no mobile-only task or paid activation follows from this release.
