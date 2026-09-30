# Native raw ingress: actual hosted and retained-context evidence

Exact tested source **`81b7e182550d9f70ddc3bf4357bbab935488d6ea`** is pushed to
`origin/main`. Native deliveries `e52de76`, `b86e614`, `c874f98` integrate as
`368efd0`, `6ae5fda`, `fa773a8`; the existing workflow extension is in `81b7e18`.
[Source review and correction history](native-raw-ingress-review.md) remain intact.

## Executed native checks

[Native run 36677566096](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36677566096)
completed successfully in 5m1s. Both unsigned SDK26.5 app and embedded broadcast
extension builds succeeded under Xcode26.6 / macOS26.6.2 arm64. Actual log counts:

| Check | Executed PASS assertions |
| --- | ---: |
| Frame retention / pixel layout | 15 |
| Original upload / durable retry / Stop | 99 |
| Original Swift output against Python contracts | 42 |
| Raw metadata mapper | 40 |
| Raw mapper Swift output against Python contracts | 104 |
| Raw ingress / retry / saved ACK / Stop | 35 |
| Raw ingress Swift output against Python contracts | 56 |

These are distinct check groups, not a product completion score. The historical
33/56 and 35/56 predictions are superseded by these actual logs. No new native
failure or repeat run was required. Runner capacity, action runtime deprecation,
AppIntents metadata and simulator architecture warnings do not establish a failure.

[Normal P0 CI 36677566227](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36677566227)
on the same SHA passed Python3.12 / Node24.21 (3m38s) and Python3.14 / Node24.21
(5m2s). No unrelated suite was manually repeated.

Selected unchanged logs, inputs, build results and actual raw fixture ZIP are
retained in [native-raw-ingress-hosted](native-raw-ingress-hosted/). Its SHA256SUMS
covers the **full** downloaded artifact, not only this selected repository subset.
[Independent artifact audit](native-raw-ingress-hosted/artifact-audit.md) verifies
18/18 full-artifact hashes and105/105 archived source files against exact Git
source, plus app/extension executables and original fixture bindings. This is
integrity review, not independent product QA.
Full source/products remain in artifact
`screen-observer-81b7e182550d9f70ddc3bf4357bbab935488d6ea-1`, locally downloaded to
`/tmp/lead-native-raw-ingress-36677566096`.

## Actual fixture → HTTP → retained Learning context

The two exact Swift-emitted request/PUT pairs were exercised through production
`create_capture_app`, MemoryStore, current-authorized readers/image resolver and
`prepare_stored_process_context`. The test declares fixed synthetic identity,
membership and trusted-start facts independently of the supplied request. It does
not run a listener, database, provider or device. Every original/request byte and
idempotency key remains unchanged.

Both cases pass registration → original PUT → raw POST → verified ACK → ASGI-object
recreation and exact replay → original read → Learning context → Stop → refused
replay and unchanged authorized history. ASGI-object recreation is **not** a
process/database restart. Unknown Stop boundary does not authorize historical
retransmission. Full records, source/version, frames, raw orientation and unknown
capture/course time survive; image bytes are identical before and after Stop.
Current metadata is read twice. Provider/commit/live attestation and permission
flags remain explicitly ungranted or unproven in the Learning packet.

| Actual native fixture | PNG bytes | PNG SHA-256 |
| --- | ---: | --- |
| live | 291 | `ab89c6d23de2e7e580b8abe9f5c4318d06208cf4795d14e1ca191923ea54d361` |
| historical-unknown-clock | 290 | `53d8152de8a37d4a953726323097ade5a8e46453c830843fbabcf92fc507d6a6` |

The historical fixture was built/enqueued, not POSTed by the native harness; it
was actually POSTed by this in-process composition. Neither image is a real
ReplayKit screen observation. [Structured result](native-raw-ingress-hosted/composition-result.json)
retains source/module/fixture hashes and these evidence labels.

The first probe failed because it expected `records` inside Learning's metadata-only
`packet.batch`. The production composer preserves records in ordered `packet.items`.
Only the probe was corrected to compare exact metadata and the complete ordered
record list, retaining all image/count assertions. The unchanged failed script,
reproduction and minimal diff are retained in the local diagnosis directory;
[diagnosis](native-raw-ingress-hosted/composition-diagnosis.md) records the initial
failure rather than counting it as a pass. No product or fixture was modified.

Reproduce with the retained script and unchanged extracted fixture directory:

```sh
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python \
  docs/verification/lead/native-raw-ingress-hosted/composition.py \
  /tmp/lead-native-raw-ingress-36677566096/extracted/raw-frame-ingress-fixtures \
  --repo "$PWD" --fixture-provenance 'actual run36677566096 / source81b7e18'
```

## Next owner and limits

ONE existing P0-07/P0-13 independent QA task was accepted as
`handoff_a5c2b49e4f0f0c2405b798656b043e91`, exact candidate `81b7e18`.
It exercises the actual-fixture retained-context path and challenges current
access/Stop/original correspondence. The initial receipt was unread with
`execution_started:false`; this is dispatch evidence, not QA execution or acceptance.
Actual start `handoff_68d5a94e341569115d6b2ea1dbe7f23b` at06:32:07 UTC
confirms normal merge `ac8f0b6`,105 exact source entries and48 unchanged fixture
files. QA is authoring its own composition and current-access/deletion/replay
negatives; no result is claimed yet. Its preliminary15-file hash count was
corrected to the actual18-entry manifest via one substantive reply; final QA
evidence must recompute that count.
Earlier accepted Web, ink-recovery and Simulator evidence remains unchanged.
iOS received the actual build/result and dependency notice as
`handoff_9942a5c9f4dbedf06844a7caf82e2bb3`; no duplicate build task was sent.

Lead reviews QA's actual result and owns the next bounded trusted runtime bootstrap
and explicit transport integration. Current native seams are still uncalled by
the user-facing app/producer. Signing/provisioning/device access and an authorized
real product connector remain separate missing prerequisites. No accounts,
providers, services, user-preview database/ports or Paperclip state changed.
Both core §7.1 gates, original-screen cross-app editable ink, actual audio and
Notability import remain open. This milestone proves a supporting pipeline;
it is not yet a usable screen-to-real-AI product.
