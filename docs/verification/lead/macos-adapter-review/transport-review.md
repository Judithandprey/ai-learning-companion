# macOS 0.2.12 transport/runtime review — APPROVE

Exact Backend candidate `40ab42e4819bf725fd970cc330b8eb6fed7da73f`, export `/tmp/lc-macos-adapter-40ab`. Assigned contract baseline `8e2094e`: all `packages/contracts` bytes remain unchanged. Reviewed changed `capture_app.py`, `capture_runtime.py`, `ingress_app.py`, complete affected functions and the ordered-envelope dispatch into ControlRegistry/CaptureArchive. Applied project PONYTAIL LITE and unchanged affected retention/current-authority requirements. No blocker found in this bounded scope.

- The macOS route remains independently default-off in all three factories. Runtime construction requires a strict boolean, explicit macOS/capture capabilities, capture scope and trusted `desktop_pixels` admission before mutation. It neither starts capture nor implicitly grants 0.2.4 original uploads or control authority. Existing ephemeral token/expiry handling and stopped-incarnation reconciliation are preserved.
- HTTP uses current Bearer auth/capabilities/scopes, query/key checks, media/length/encoding limits, strict JSON, explicit outer/batch/frame versions, then generic shape validation. Errors keep the 0.2.12 closed format on the enabled exact route, no-store/nosniff and a Bearer challenge where applicable; unowned/disabled paths retain legacy routing errors. Cancellation has no success conversion.
- The whole request goes to `ingest_macos_frame_request`, with `request_envelope` preserved into the existing actor transaction and macOS route replay namespace. No new wrapper replay cache or sorted-frame envelope replaces the HTTP order. Internals of identity consistency, commit rollback and final archive witnesses remain the other reviewer's scope.
- The combined OpenAPI explicitly renames the new display/host-clock components, preserving the older 0.2.7 Mac shapes. Independent recursive expansion of the complete request/response graphs matches each family’s released schemas across all 16 enable-flag combinations (64 comparisons); the macOS operation also preserves its released ordered-envelope Idempotency-Key description.
- Default application, local-preview and worker source paths are unchanged. Explicit app factories retain `paid_executor_enabled=False`. No route/provider/listener was activated.

## Evidence actually executed

**128 focused tests passed, 53 deliberately deselected; no failures.** These include transport/media/size/version/auth ordering, mounted errors, old route closure, cancellation, runtime gate combinations, explicit admission, pending/consumed reopen, Stop/withdrawal, ordered HTTP replay and selected final-token guards. This independently reruns author tests; it does not adopt the full 2,203-check report or establish product acceptance.

**Five independently authored probe groups passed:**

1. All 16 schema/gate combinations, recursively resolved released request/response graphs and the macOS replay-header definition.
2. A real handler/MemoryStore commit with verified-only 0.2.0 ACK; object-member ordering changes replay identically, while reversing the artifact array conflicts without mutating the archive.
3. Wrong version in a later malformed frame outranks generic shape failure; duplicate members and invalid UTF-8 outrank explicit unsupported versions.
4. Missing auth, missing macOS capability and default-off routing reject before consuming even the first body chunk, with closed versioned errors.
5. A real principal expires after initial authentication while a valid cached-replay body streams. Under-transaction reauthentication returns 401 rather than the cached ACK; archive state remains unchanged. No authenticator, guard or storage implementation was replaced.

`git diff --check 40ab42e^ 40ab42e` passed. Reviewed export source/test files were compared byte-for-byte against the exact Git blobs.

## Repeatable commands

```sh
cd /tmp/lc-macos-adapter-40ab
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider services/api/tests/test_macos_ingress_transport.py services/api/tests/test_macos_capture_runtime.py services/api/tests/test_macos_ingress_http.py -k 'not every_original and not current_fences and not historical_http and not all_seven and not gap_frame and not request_labels and not unknown_composition and not first_http_gap and not transaction_failure and not removed_or_substituted and not final_guard and not late_failure' > /tmp/macos-adapter-40ab-focused-tests.log 2>&1
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /tmp/macos-adapter-40ab-transport-probes.py > /tmp/macos-adapter-40ab-transport-probes.log 2>&1
```

Machine receipt/source and artifact hashes: `/tmp/macos-adapter-40ab-transport-review.json`. Probe results: `/tmp/macos-adapter-40ab-transport-probe-results.json`. No dependency installation was needed.

## Limits / next owner

Synthetic trusted identity and producer facts, existing fixture originals, in-process ASGI and MemoryStore only. No database, listener, native capture/display, preview, provider or paid execution. This does not attest physical Mac acquisition, PNG decoder/device behavior, full transaction implementation or Learning correctness. Other assigned reviewers own those internal seams; Lead owns integration and exact-main composition/verification. No repository or worker files were changed.
