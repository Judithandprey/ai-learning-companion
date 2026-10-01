# Mac parent host/control review — HOLD

Candidate: `f625b480e591682be75dd6a7617c08eee4cf7bd6`, exact export `/tmp/lc-macos-parent-f625b48`. Review is limited to `CaptureHost.swift`, `CaptureControl.swift`, corresponding tests and necessary released Backend/caller seams. PONYTAIL LITE applied. No repository or worker files changed.

## P2 MAC-CONTROL-01 — later refusal loses an earlier possible commit

**Location:** `apps/macos/CompanionDesktop/Sources/DesktopCapture/CaptureControl.swift:179–180` (whole send loop at 153–184).

The first registration/source/Stop request can commit, followed by a lost response or another ambiguous response. The exact retry may then receive a valid 401/403 because the current bearer expired or authority changed. `send` returns `.refused` unconditionally for that later typed error. The enum explicitly defines this as **known not taken** (lines 64–65), although the earlier attempt is unresolved.

Minimal sequence: an exact Stop POST commits; its response is lost; the second identical POST returns closed `0.2.1` 403 `forbidden`, `retryable:false`; the next state read is also refused/unavailable. The current Backend rechecks current auth before control execution/replay, so the later refusal cannot settle the first attempt. This is not a different-request/key collision.

Observable effect in the actual caller: `CaptureLink.swift:1114–1117` persists Stop `outcome = "refused"`, even though that Stop may have committed. A failed follow-up GET at 1126–1135 leaves that classification in the journal. Registration likewise displays “the stream was not registered” at 540–543 rather than unknown. `registrationSent` remains true and the final server Stop is not falsely confirmed; this finding does **not** claim that the caller entirely loses reconciliation state or resumes capture. It is a concrete incorrect outcome/evidence classification, separate from the other reviewer's Stop-key persistence issue.

Smallest required correction: once any attempt may have committed, retain that uncertainty across subsequent typed refusals. A correctly corresponding successful response may settle it. A first-attempt definitive refusal remains refused; cancellation/Stop before any send remains notSent. Apply consistently to all three control/source operations using this sender. No protocol changes are needed; the existing uploader already follows this rule.

## Executed bounded evidence

Run:

```sh
bash /tmp/macos-parent-f625-host-control-probes/run.sh
```

This uses the already installed `/tmp/lc-review-0212/tc/usr/bin/swift-frontend`, its sysroot/libs, and a module cache under `/tmp`. `prepare.py` extracts the **exact** generic `CaptureControl.send`, typed-error validator, enum and actual JSON/redaction helpers from the candidate. Only `send`'s private visibility is removed. A scripted transport and explicit success callback provide the response sequence; there is no listener, actual HTTP exchange or fake claim of native success.

Actual results: **3 reproduced failures, 3 passing controls**:

- Lost response → valid 401: expected unknown, actual refused.
- Valid 503 → valid 403: expected unknown, actual refused.
- Malformed 200 → valid 403: expected unknown, actual refused.
- First-attempt valid 403: refused, correct.
- Lost response → accepted exact-success control: ok, correct.
- Stop before first send: notSent, zero attempts, correct.

Every attempted retry preserves the same request body, URL and headers. The synthetic success callback isolates sender settlement; it is not a StreamState/parser or actual Backend integration test. Initial extraction/module-cache errors are preserved in `initial-harness-error.stderr`; after the narrow harness repair, interpreter exit was 0 and `probe.stderr` was empty. Those initial errors are not product findings.

## Remaining scoped source review

No additional concrete host blocker established. Read complete new host/control functions and host/control/socket test paths, plus actual `CaptureLink` startup/registration/source/Stop callers and current `services/api/desktop_local.py`/`control_app.py` behavior. Checked:

- Private stdin startup, exact module argv, no DSN/token copied into environment or displayed child output; owner-only no-follow descriptor-based DSN read; random ephemeral bearer produced separately by caller.
- Released startup keys/profile/capabilities, explicit fresh-consent flag and readiness not treated as live authority; READY numeric-loopback validation and excluded preview ports.
- Host failed-spawn/incomplete single-final-LF writes distinguished from completed writes without READY; bounded nonblocking writes, stderr retention, fixed error-code disclosure, child-only EOF/TERM/KILL path. Real Darwin behavior/reaping is still a runtime gate, not proven here.
- Request bearer/content/idempotency headers, per-route 0.2.1/0.2.4 errors, exact state/source ownership/continuity/pins, frozen per-call retry bytes, Stop-before-attempt gate. Existing URLSession transport code is unchanged apart from token visibility, and retains redirect refusal and bounded reply reads.
- Existing new tests cover host config/startup/EOF and a real POSIX loopback stand-in on the intended platform. They do not test ambiguous control response followed by refusal. Owner-reported Linux redirect behavior and all uncompiled macOS tests remain distinct from this review's portable sender execution.

No broad suite, macOS compile, Darwin process, URLSession socket, GUI, PostgreSQL, real capture or provider run occurred. Fix by the existing Native owner, then a focused regression plus ordinary hosted macOS compile/test run; no product/device acceptance inferred.

Machine receipt and all exact source/probe SHA-256 values: `/tmp/macos-parent-f625-host-control-review.json`. Probe files: `/tmp/macos-parent-f625-host-control-probes/`.
