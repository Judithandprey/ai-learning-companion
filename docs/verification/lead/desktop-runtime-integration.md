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

## Publication and actual continuation receipts

Runtime/evidence milestone **`01240dff25819efe543f61e54d925a95462d555c`** was normally pushed and verified against origin/main. Backend received the bounded desktop PostgreSQL/own-process restart continuation as `handoff_c5e3c42e025b59f58743bbfe67d3f8f9`. Windows received its same-owner four-finding correction as `handoff_41163a27b822e631477c3f9ef1e81e16`. Both native async sends were accepted with `execution_started:false`; actual starts remain separate evidence. No additional QA/native/support task was created.

A later read-only worktree check confirms actual follow-up activity: Backend normally merged the assigned `01240df` at `fe95d74`; Windows, clean at its delivered `57dab97`, now has changes in `apps/windows/src/main/main.ts` and `apps/windows/src/shared/desktop-ink.ts`. This establishes baseline adoption/edit activity, not completed fixes or successful tests. Neither worktree was modified by Lead.

Actual Backend start arrived at 11:27:44Z as `handoff_fb8c43fc9cd81441d7d6ca4f936ba365`, ordered read `lead-desktop-db-start-20260930-1128`. It confirms normal merge `fe95d7448ae7ca17d9cfd3acc97a241e8eb26079`, full affected-clause reads and scoped runner/guard implementation. The existing READY handoff was found, but connection remains to be checked before writes; neither availability nor a successful DB test is inferred from that file.

Normal CI [36708326026](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36708326026) completed successfully on exact `01240dff25819efe543f61e54d925a95462d555c`: Python 3.12 and 3.14, both with Node 24.21.0. This validates the integrated runtime source and preserved probes under the existing checks. The following receipt/state-only commit does not change application or test source; no additional product-wide campaign is manually requested.
