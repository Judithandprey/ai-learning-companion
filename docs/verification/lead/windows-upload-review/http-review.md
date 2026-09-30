# Windows uploader authority/HTTP review

**HOLD: correct outcome uncertainty and bearer reflection before integration.** The original-file/identity and test-host lifecycle reviews are separately owned.

Exact candidate `6c4ac03a43a4681bc1466fd0c894854a0b14df04`, parent `bb6761109cbca86c65e7b3f2e68deb95cab8b1d8`; all seven changed files in `/tmp/windows-upload-6c4-export` match their Git blobs. Read the full uploader, relevant mapper types, tests and delivery report under existing PONYTAIL LITE/workflow and unchanged desktop requirements. This remains a trusted-main callable with no renderer/main wiring; no new account, consent or provider activation is implied.

## P2 — An invalid first 200 response does not prove non-commit

`apps/windows/src/main/uploader.ts:318–321` returns `refused` for an invalid first original receipt; `:333–336` does the same for an invalid first batch ACK. `UploadResult` (`:65`) defines refused as known not taken. A 200 reply failing correspondence establishes no such fact: the server may already have committed before its response was damaged.

Independent no-socket probes reproduce both returned `refused` results, with no `in_doubt`. Lead then exercised the **actual test-owned Backend/MemoryStore**: a relay forwarded the original requests unchanged and modified only the response after real Backend 200. Both original and batch paths returned `refused`. The exact same job subsequently replayed as `committed`; the batch replay retained the original accepted dispositions. This proves a consequential classification error, not merely a hypothetical malformed server.

Lead execution evidence (read, not independently rerun by this reviewer):
- `/tmp/lead-windows-upload-6c4-first200-evidence/independent-first200-original.json`
- `/tmp/lead-windows-upload-6c4-first200-evidence/independent-first200-batch.json`
- `/tmp/lead-windows-upload-6c4-first200-tests.txt`: one named probe, two observations; successful reproduction assertions do not mean the behavior is safe.

The same uncertainty bookkeeping has a related branch: `:278–285` sets `inDoubt` only on exceptions, while 503 is explicitly an unknown outcome. The probe `503 → 409 capture_stopped` returns clean `refused` without retaining the earlier unknown outcome. Preserve uncertainty through later refusal/expiry/cancellation whenever the previous send was classified unknown. **No claim is made that the real Backend committed a particular 503 response.**

Minimal correction: an invalid 200 receipt/ACK stops with `unknown` and the artifact/batch identified as in doubt, without counting an unverified receipt as committed. Retain unknown 503 history consistently; do not turn later refusal into proof that the earlier send failed. Keep the same job/body/key for a later authorized retry. Update existing tests that currently encode `refused` as the desired answer.

## P2 — HTTP error text can return the bearer

`uploader.ts:230` defines token redaction, but applies it only to caught fetch exceptions at `:281`. Parsed HTTP `error` strings at `:276` flow unredacted into returned `reason` and `error` at `:298–304`.

An injected fetch returning `403 {error: "server reflection " + syntheticToken}` produces a result containing that complete token in both fields. This violates the explicit authority/result privacy rule; the tests' “every result excludes token” check misses reflected response text. The probe uses a clearly synthetic token and no socket/server. It does not establish that the current Backend's ordinary fixed error codes echo credentials.

Minimal correction: redact/bound untrusted HTTP error text before including it in any result, consistently with fetch exceptions. Keep structured status/error meaning where available and add the reflected-error regression. No logging of response bodies or credentials is needed.

## P3 — ACK timestamp validation is weaker than the released contract

`uploader.ts:84,192` accepts any string ending `Z` that `Date.parse` normalizes. The otherwise exact ACK with `received_at: "2026-02-30T17:00:00Z"` is accepted by `ackProblem`, although February 30 is not a valid released `UtcTimestamp` (`format: date-time`). The existing negative test uses only `not-a-time`.

Use strict UTC calendar/date-time validation and add this boundary test. This is lower priority than the two issues above; no claim is made that the real Backend emits such a timestamp. Trusted `attempts: Infinity` is also not bounded by `Math.max`, but no unbounded retry was executed and this review did not expand into an options-validation campaign.

## Checks and preserved positives

```sh
<repo>/.tools/node-v24.21.0-linux-x64/bin/node --test --test-isolation=none --test-reporter=tap /tmp/windows-upload-6c4-probe.test.mjs
```

**Eight named probes completed, eight assertions passed, 95.076113 ms.** Three are positive controls; five intentionally assert the problematic current outcomes above. This is reproduction evidence, not eight passing product acceptance cases. Actual candidate code and committed synthetic retained fixture were used with injected `fetch`; this reviewer started no TCP host, app, display, preview, database, provider or service.

Controls confirm seven exact original receipts precede the batch, valid corresponding ACK commits, an in-flight abort returns cancelled with the artifact in doubt, and a lost answer followed by 403 stays unknown with identical retry bytes. Source review confirms loopback-only origin checks, manually refused redirects, snapshotted origin/token/expiry, per-request expiry checks and strict record/artifact correspondence/uniqueness. These positive controls do not remove the result-classification/privacy flaws.

Lead reports the unchanged delivered suite passed **12/12 in 3.024 s**, including the real Backend tests; that run is separate from this review's eight probes. No native Windows or real AI evidence follows.

Artifacts: `/tmp/windows-upload-6c4-review.json`, `/tmp/windows-upload-6c4-probe.test.mjs`, `/tmp/windows-upload-6c4-probe.log`, `/tmp/windows-upload-6c4-probe-results.json`. No repository or worker files were changed. Return one bounded correction to the current owner; no further review campaign is pending.
