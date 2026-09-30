# Windows uploader c09c151: bounded HTTP correction review

**Verdict: HOLD — one P2 redaction boundary remains.** Response-certainty, same-call retry/cancellation and calendar/ACK corrections pass the bounded independent controls below. This verdict concerns the callable uploader's no-bearer-in-result promise; it is **not evidence of an exploitable native Node transport leak**.

Candidate: `c09c1518024555afcc3f646195f2c1d0b617ed9d`, parent `6c4ac03a43a4681bc1466fd0c894854a0b14df04`. Exact git archive: `/tmp/lc-windows-uploader-c09`. Read complete changed uploader and relevant tests/report against released capture ingress 0.2.4 / Windows ingress 0.2.10. Applied project PONYTAIL LITE: bounded delta and prior reproductions, no new framework or repository changes.

## P2: a supported bearer survives the short cause-code filter

- `apps/windows/src/main/uploader.ts:318–320` accepts any `cause.code` matching `^[A-Z][A-Z0-9_]{0,40}$`; line 404 interpolates that value into the result's reason through `failure(error)`.
- Use a syntactically valid 32-character uppercase synthetic token. On the first original, inject a rejected fetch whose `TypeError.cause.code` equals that token. With one attempt, the actual uploader returns `unknown`, correctly names the original in doubt, **but its reason contains the complete token**.
- The released runtime accepts tokens of 32–4096 characters with this alphabet (`services/api/capture_runtime.py:120–122`); the uploader does too. The input is inside the supported token shape.
- The author's test at `apps/windows/tests/uploader.test.ts:508–516` already injects a token-bearing `cause.code`. Its 36-random-byte base64url token is 48 characters, so it is rejected by the 41-character code ceiling. The focused 32-character case exposes what that control misses.
- Scope of evidence: actual candidate uploader, real retained fixture bytes, **injected fetch exception**. No actual native Node failure deriving a code from response content was established; no live bearer was used or exposed. Ordinary response bodies are now correctly content-free.
- Smallest required behavior: every supported bearer must remain absent from returned diagnostics, including code-shaped fetch-error values. Keep the current `unknown` / `in_doubt` behavior. No new retry policy, service layer or broad redesign is required.

## Executed evidence

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node \
  --test --test-isolation=none --test-reporter=tap \
  /tmp/windows-uploader-c09-http-probes.test.mjs
```

Actual result: **12 groups, 11 pass / 1 fail**, exit 1, approximately 150 ms. The failing assertion checks that the synthetic token is absent; it observed presence. `/tmp/windows-uploader-c09-http-probes.log` is the actual TAP output; `/tmp/windows-uploader-c09-http-probes.json` contains observations without printing the synthetic token value.

Minimal reproduction uses the same command with `--test-name-pattern='redaction edge'` before the probe path.

Passed groups establish:

1. Seven exact original receipts followed by a corresponding ACK commit (8 sends).
2. Four reflected/non-JSON error-body cases stay content-free and `unknown`, bounded to 3 sends.
3. First wrong ACK stays `unknown` after 3 identical batch sends; a later correct ACK resolves that request to `committed` with the same body/key.
4. First wrong original receipt stays `unknown`, no batch; subsequent typed refusal retains doubt.
5. Typed 503 then typed 409 `capture_stopped` retains batch doubt and exact retry bytes/key.
6. Wrong error version/status/retryable/extra members remain uncertain; a valid initial typed 403 refuses once; `dependency_missing` remains unknown without forced retry.
7. Calendar-invalid ACK and expiry values fail; expiry at the boundary sends nothing; expiry following uncertainty preserves doubt.
8. Closed ACK identity, sequence, artifact bytes, verified-only status and timestamp boundaries reject mismatches.
9. In-flight, retry-pause and preflight cancellation stop further sends and preserve the applicable doubt.
10. Lost answer then typed 403 stays uncertain. A **separate later call** can return `refused`; as now documented, the future parent must retain the previous call's doubt. No historical absence is inferred here.
11. Mutating caller authority/plan/prepared data after the first send does not alter the captured batch bytes/key or commitment result.

An additional Python check using the existing `.venv` and actual released `packages.contracts.validate('UtcTimestamp', value)` agrees with the uploader on **11 focused valid/invalid timestamp strings**. Exact command is saved in the machine receipt; output is `/tmp/windows-uploader-c09-calendar.log`. No owner 20,005-string campaign or full uploader suite was repeated.

The first draft probe had a 33-versus-32-character fixture-length typo before calling the uploader. It was corrected locally; the initial harness-only log is retained separately as `/tmp/windows-uploader-c09-http-probes-initial-harness.log` and is **not** product-failure evidence. The final redaction failure occurs after the actual uploader executes.

## Preservation and limits

Original failed probes and JSON under `docs/verification/lead/windows-upload-review` are unchanged; their hashes are in the machine receipt. All new files are under `/tmp`. No filesystem-race review duplicated, no repository/worker write, no live HTTP listener, Backend execution, database, desktop/display, provider, preview or source activation. The fake fetch responses establish client classification, not server commit facts. Root owns actual integrated HTTP/backend checks and the future trusted parent; the separate file reviewer owns filesystem findings. Ordinary response redaction and old correctness failures are closed within this evidence; native Windows acceptance and product gates remain unclaimed.
