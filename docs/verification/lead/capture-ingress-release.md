# Capture ingress 0.2.4 release checks

Existing lead P0-08 continuation, preparing a callable transport over the reviewed
source/original/frame/process store; no new product requirement or runtime grant.
Code preparation was explicitly delegated only for the new package and contract
test. Lead owns check/TypeScript wiring, final release and consumer coordination.
Existing control ASGI factory is separately reviewed; no route is mounted here.

[Independent review](capture-ingress-review.md) approved the pure new namespace
and its exact final hashes after the observed repeated-validation cost was fixed.
The complete batch is validated once, then existing binding helpers check each
member without changing originals. A representative 100-frame synthetic case
fell from 2.986 s to 0.138 s in one local reviewer timing; not a device benchmark.

On integrated main source with the new package:

```sh
.venv/bin/python -m pytest -q packages/contracts/tests/test_capture_ingress.py packages/contracts/tests/test_capture_frame_binding.py
# 79 passed in 0.31s
.venv/bin/python -m packages.contracts.capture_ingress.generate --check
# passed
PATH="$PWD/.tools/node-v24.21.0-linux-x64/bin:$PATH" npm run typecheck
# passed
```

The 63 new contract cases include unchanged generated-family hashes, exact
original and frame bindings, closed unknown/version/permission fields, path and
owner equality, body limits, ordered HTTP replay equality and whole-batch causal
checks. Reviewer adversarial checks and the author's actual maximum 32 MiB opaque
byte probe are separately attributed in the linked review. No image acquisition,
HTTP listener, database, browser, provider or device was used for this release.

Backend next implements the explicitly opt-in 0.2.4 factory over the existing
actor transaction. The current internal frame cache canonicalizes a frame map;
it is not sufficient for the new full ordered-envelope HTTP equality. Producer
identity must be resolved from trusted existing stream/grant facts inside the
same transaction, never a request field or automatic consent. Source creation and
new display-byte retry require current live authority; historical reads still
need current account/source access. Do not activate default routes or credentials.
Keep stopped queues and frameless-display/attempt limitations explicit; no invented
URL, frame, Observation, user reason or complete coverage claim.

Both core original-screen product gates remain open. Native transport/signing,
actual provider input/grounded responses, cross-app ink, full input/edit/save
behavior and actual Notability import require their own evidence. User preview,
its database/tokens/ports, and Paperclip remain untouched.
