# Native original upload review — HOLD

Candidate: `7de89a67bd6f2d06e8cf12b38bc58f1fe44729ae`, parent `146ccaf2073d8a7a5997a841553b5472afcb0cbc`; main inspected at `299788a13a7d34bbc03640695ba994f6cfa468a0`. Only the candidate's eight-file delta was reviewed. Production/worker files were not edited. The subsequently dirty `.github/workflows/ios-screen-observer.yml` belongs to lead and was preserved.

Disposition: **hold for the three durable-state corrections already sent to iOS, plus the small error-domain redaction correction below**. These findings are source-traced, not Swift-runtime reproductions. No Swift compiler is installed locally; native compilation/checks remain required on the existing hosted Mac job. No network, service, DB, provider, device or preview operation occurred.

Read current AGENTS/TEAM/lead/workflow and PONYTAIL LITE; complete affected source/English §3.9, §7.1–7.2, retention/stop requirements and acceptance, AUDIO-14, current decisions, original-goal retention/stop/time cases, and released original_artifact/capture_ingress READMEs. Source/English manifest hashes for requirements and decisions match (four checks).

## NI-1: An existing uploader overwrites newly unreadable durable state

`OriginalUpload.swift:586–588` maps missing/read-error/decode-error to the same nil. `durableStop` at 578–583 treats nil as no persisted stop. `save` at 636–640 then writes the in-memory snapshot over the damaged state. The initializer's protection at 354–359 does not protect already-open instances.

Exact regression using the existing check helpers:

1. `makeSession(frames: 1)`, construct uploader, enqueue its kept original.
2. Replace `original-uploads.json` with `Data("{not json".utf8)` **after** enqueue.
3. Script a matching receipt and call the same uploader's `sendPending`.
4. Source path: 418 → 578 → 586 returns nil; 463 → 636 repeats the failed read, overwrites the file and reaches transport at 476.

Expected: halt without sending and preserve damaged bytes exactly. Current source sends and erases the unreadable evidence. The author test at check `main.swift:662–671` only corrupts before construction, so cannot detect this.

Minimum correction: distinguish first initialization from missing/corrupt previously established state and fail closed for all subsequent mutations/sends; do not reconstruct over unknown state. Also cover removal after opening. Preserve every PNG and sidecar.

## NI-2: Independent actors overwrite newer source bindings, queue items and stops

`OriginalUpload.swift:350–363` loads a private snapshot per actor; only the stop fields are later adopted (578–583). The whole snapshot is written at 640. `.atomic` replaces one file atomically; it does not make the preceding read/modify/write atomic across actors.

Deterministic stale-instance regression (no simultaneous execution needed): create A and B on the same empty session; A enqueues frame 1/source S1; B enqueues frame 2/source S2. B still has `state.source == nil`, so passes 375 and replaces the file with S2 and only frame 2. A's queue entry and durable one-source binding are lost. Similarly, create B before A receives a committed receipt; a later B enqueue rewrites that receipt away. This is more than a lost attempt count, contrary to the delivery report.

Stop-erasure schedule: A's `save` executes its `durableStop` read and sees no stop; B executes and successfully saves `stop`; A writes its previously encoded unstopped state at 640. A can then pass the in-memory check at 467 and dispatch at 476. The author test at check `main.swift:568–586` orders B's whole stop before A's subsequent receipt handling; it does not test this read/write interleaving.

Minimum correction: enforce one authoritative per-session state owner, or serialize/reload/validate the complete state transition with real per-session coordination. Rejecting unsupported duplicate owners is a smaller valid option than pretending last-writer-wins is safe. The stop ordering and dispatch fence must share that coordination. Keep source pin, item identities, validated receipts and stop monotonic across reopening; add stale A/B and ordered stop regressions.

## NI-3: A repeated failed Stop falsely reports successful persistence

`OriginalUpload.swift:592–596`: the first `stop` sets the in-memory reason, then `save()` may return false. A second `stop` returns true immediately because `durableStop()` returns the in-memory reason, without attempting persistence.

Exact filesystem regression: enqueue normally; temporarily make the state destination unwritable (for a deterministic harness, move its original file aside and place a directory at the state-file path); first `stop` returns false. Restore the previous unstopped state file, then call `stop` again. The second call returns true, but a fresh uploader reads no stop and can send. This contradicts `stop`'s documented Bool result and durable Stop guarantee.

Minimum correction: track/verify durable stop separately from the in-memory immediate sending fence; retry an unpersisted stop and return failure until storage succeeds. Test repeated write failure, recovery, and fresh-instance reopening.

## NI-4: Arbitrary transport error domains can persist the bearer token

`OriginalUpload.swift:75–79` omits `localizedDescription`, but interpolates arbitrary `NSError.domain`. That string is passed through the transport-error branch at 482–484 to `lastOutcome` and the state file at 628–640.

Exact injected-transport regression:

```swift
await server.script([{ request in
    throw NSError(domain: request.value(forHTTPHeaderField: "Authorization")!, code: 1)
}])
```

After one pass, `original-uploads.json` contains `Bearer <token>` in `lastOutcome`. The domain is caller-controlled text, not a safe diagnostic identifier. Existing final token scan only exercises conventional URL errors.

Minimum correction: persist a fixed/allowlisted category and numeric code; map unknown error domains to a constant. Never persist arbitrary transport domain/description/userInfo. Add the adversarial error-domain check to the existing token scan. No new logging framework is needed.

## Receipt and transport assessment

For parsed receipts, the complete source/artifact/version/kind/status comparison rejects missing/extra/foreign fields; boolean-versus-number checking is explicit. Same bytes are read once within 32 MiB + 1, hashed and encoded; canonical ASCII request construction and exact request-hash retries are coherent. New paths exclude separators/query/control characters; credentials are not stored in the normal request/state structures. App-only filesystem-synchronized target placement is consistent; extension/UI activation remains absent. No definite compile defect identified by reading, which is not a compile pass.

`receiptProblem` uses JSONSerialization before comparison. Duplicate member occurrences are not represented in the resulting dictionary. The Python fixture oracle at `validate_fixtures.py:67–69` similarly uses ordinary `json.loads` before `validate_receipt`. A local executable probe confirmed that duplicate `status` and UTF-16 JSON both pass that *parsed-object* oracle. Thus existing fixtures do not establish strict raw-receipt parsing. The released README's strict raw decoding paragraph explicitly governs request bodies; the existing receipt validator accepts parsed objects. Record this limit and add raw parser negatives if claiming strict UTF-8/duplicate-free response parsing; it is not asserted here as a newly released wire-schema requirement or a fifth integration blocker.

The injected transport must enforce its documented no-redirect policy before sending elsewhere; checking the final response URL is not prevention. Plain URLSession conformance does not supply that policy. This remains the already named production transport/activation dependency, not a new requested networking implementation. Memory, timeout/response-read bounds, real TLS/server receipts, signing/device use, current producer bootstrap and frame/time/orientation mapping remain unverified/deferred.

## Commands and evidence

- `git rev-parse HEAD 7de89a6 7de89a6^`; `git show --stat 7de89a6`; `git diff --name-only 7de89a6^ 7de89a6`.
- Read exact candidate `OriginalUpload.swift`, all 733 check lines, fixture validator, evidence and small Shared/StatusView deltas via `git show 7de89a6:<path>`; line references above are candidate lines.
- `command -v swiftc`: no compiler found; no Swift test or unsigned build claimed.
- Python SHA-256 checks against `english-translation-manifest.json`: four affected source/translation files match.
- `.venv/bin/python` imported actual `packages.contracts.original_artifact`; constructed a valid binding/receipt; applied fixture-style `json.loads` to duplicate-status and UTF-16 receipt bytes, then `validate_receipt`: both accepted. This probes the actual Python oracle only, not Foundation runtime behavior.
- No old capture/Simulator/full test campaign rerun. Source is held for owner repair, then exact native compilation plus focused new regressions and Swift-emitted Python fixture validation on hosted macOS.
