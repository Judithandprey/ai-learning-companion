# Mac upload transport review — fb1d1ed

**Disposition: APPROVE, source scope only.** No concrete blocking transport defect established in the bounded review. This is not a macOS compile/test result, a socket/Backend composition result, an application integration approval, or product acceptance.

Reviewed candidate `fb1d1ed3f3f0d35f88367a03551c15ca705f6f12`, parent `64e2302a436c9c5731e530199c79dbb112c9b0a8`; root baseline at assignment `0704fff237cc52b814f916b302e357bb0007a59d`. Exact read-only export: `/tmp/lc-macos-upload-fb1`. Entire 671-line `apps/macos/CompanionDesktop/Sources/DesktopCapture/MacIngressUpload.swift` read; SHA-256 `e565d96f4dcea983e6df220057b4430146ae613153140cf3a18795217938e469` equals `git show` bytes. Necessary builder API, retained-read call sites, transport tests, owner report, current 0.2.2/0.2.4/0.2.12 contracts and Backend error/local-host boundary were also inspected. Batch/storage and checker implementations remain the other reviewers' scopes.

Applied project PONYTAIL LITE and bounded workflow. Refreshed affected source/English §7.1–7.2, R29/R30/R35/R36 and §3.9, with current decisions: source/ink preservation and independent Stop remain required; storage receipts do not attest real AI, original-screen operation, or Notability import.

## Checked behavior

- **Authority and secrets (lines 30–91, 234–276, 497–515):** immutable host-supplied owner/incarnation/token; exact numeric IPv4 loopback origin and explicit non-default port; no hostname, credentials, path or query accepted. The bearer alphabet/length agree with `desktop_local.parse_startup`. Source owner and incarnation are checked before reads/sends. Authority descriptions/mirror omit the token. Network error messages/domains and response text are never returned; error diagnostics are fixed words or a numeric `URLError` code. Host-supplied artifact IDs are intentionally present in results. No current acquisition authority is inferred from these local checks; actual Backend fences remain necessary.
- **Originals and exact retry (lines 182–228, 234–306, 503–574):** all planned originals are checked before any send, re-read before their individual PUT, and encoded into a request once. Retries use that request's same bytes/headers. Original IDs provide the immutable PUT identity; POST reuses the prepared body and idempotency key. No file mutation/deletion or restart scheduler occurs here. Late local read refusal preserves earlier confirmed original IDs and prevents POST.
- **Response correspondence (lines 308–411):** receipt has exact version/source/kind/reference/status and closed keys. ACK has exact batch/user/incarnation, each record exactly once with matching sequence, accepted/duplicate disposition, committed envelope, real-calendar UTC time, and exactly every referenced artifact with verified status and matching full reference. Extra/missing/wrong identities or artifacts cannot produce a confirmed ACK through these predicates.
- **Route errors and doubt (lines 169–178, 413–425, 453–586):** PUT errors are 0.2.4; POST errors are 0.2.12. Status/code/retryable must correspond to the current Backend. A transport error, malformed/non-corresponding 200, foreign URL, redirect, oversized response, untyped response or 503 stays in doubt. A later typed refusal, dependency, Stop, expiry or cancellation does not erase earlier doubt in the same send. Only an exact accepted answer settles it. `dependency_missing` is not automatically retried. Attempts and delays are finite/clamped.
- **Stop/cancellation/expiry (lines 186–190, 526–535, 576–585):** checks precede every send, including retries. Stop lets an already-issued exchange finish and preserves its known result; task cancellation that abandons an exchange returns in doubt. Expiry during a doubtful attempt remains unknown. Separate-call uncertainty is explicitly the future trusted parent's responsibility; calling this function again does not reconcile previous calls by itself.
- **URLSession (lines 606–671):** ephemeral session, no cookie/cache/credential storage, explicit proxy-disable configuration, request/resource timeouts, redirect delegate returning nil, bounded streaming reads. The uploader requests 64 KiB receipt and 4 MiB ACK bounds; non-200 reads stop by 4097 bytes and only typed errors within 4096 are believed. These are source checks, not observations of actual CFNetwork behavior.

## Executed evidence

One small read-only source/Backend alignment probe:

```sh
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python /tmp/macos-upload-transport-probes.py \
  > /tmp/macos-upload-transport-probes.log
```

Run from `/home/agentsdock/Projects/learning-companion/repo`. **2 groups passed:** exact exported Swift bytes equal the candidate Git blob; the extracted Swift status/code table equals both released contracts, and **34 actual Backend `_error` responses** validate with their own released family, exact retryability, UTF-8 object encoding and response bound. No server/listener, store, DB or provider was used. Probe, JSON receipt and log are `/tmp/macos-upload-transport-probes.{py,json,log}`. This did **not** execute the Swift response predicates.

Relevant authored tests were inspected, including doubtful retries, prior doubt followed by refusal, wrong/missing ACK facts, route-version errors, dependency, Stop/cancel/expiry, local refusal and URLProtocol/delegate behavior. They were not executed here. The owner's declared 55 tests and Linux functional-stub runs are not adopted as independent macOS results.

## Explicit remaining limits / next action

- `object()` deliberately uses Foundation `JSONSerialization` (lines 310–316). Duplicate response members collapse; this review does not certify lexical duplicate-member rejection. The actual released Backend serializer emits unique-member objects. This documented response-parser limit is distinct from the strict duplicate rejection required for requests; no request validation is weakened by this transport.
- The documented `{`-first response restriction and strict integer representation are compatible with inspected Backend output; they are not a general RFC JSON response parser guarantee.
- URLProtocol's 3xx fixture does not trigger a real redirect handshake. The separate delegate call proves its return value only. Actual macOS compilation, URLSession AsyncBytes/cancellation, redirect refusal, on-socket Authorization and packaged-app ATS remain unverified here. No native run was attempted.
- The library is not wired into Start/Stop, trusted bootstrap or a persistent parent. It adds no automatic replay on restart. The parent must retain the exact prepared bytes/key and outstanding uncertainty across calls, refresh authority explicitly, obey current source/Stop/deletion fences, and avoid remapping doubtful requests under new identities. The existing stopped host cannot settle a doubtful batch by simply retrying it as live.
- Next owner: Lead runs the pinned hosted compile/tests/checker and then composes the actual Swift-emitted bytes with Backend; Native owns any resulting defects and later explicitly assigned app wiring. Real Mac permissions/UI/provider and both §7.1 gates remain open.

Repository and worker files were not edited. Only `/tmp` probe/report files were created.
