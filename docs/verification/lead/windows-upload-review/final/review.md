# Windows uploader f21b2c3 — final bounded correction review

**APPROVE for the assigned HTTP correction scope.** The prior P2 bearer-in-`cause.code` reproduction is closed; no blocker found in this delta. Filesystem acceptance remains with its separate reviewer, and Root owns integration and the actual 20-test HTTP suite.

Exact candidate: `f21b2c3e078d5ffd44b102ef1d2c2e32a3451777`; parent: `c09c1518024555afcc3f646195f2c1d0b617ed9d`. Export: `/tmp/lc-windows-uploader-f21`. Inspected all three changed files: uploader, focused test addition, and report. Applied project PONYTAIL LITE; no new framework or unrelated investigation.

The production change is confined to finite diagnostic lists: `uploader.ts:321–331` allows known cause-code strings and maps other values to `other`; `uploader.ts:466` does likewise for local error names. Listed diagnostic words are shorter than the minimum bearer length. Response classification, retry/cancellation, receipts, ACKs, expiry, original bytes and authority are unchanged by this correction. The added author test exercises multiple accepted token lengths/cases; its broader claimed execution was not adopted as independent evidence.

Executed command:

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node \
  --test --test-isolation=none --test-reporter=tap \
  /tmp/windows-uploader-f21-probes.test.mjs
```

**13 groups PASS, 0 failures, exit 0, approximately 173 ms.** This reruns the existing 12 groups with only candidate/output paths and the identifying comment changed, then adds one narrow error-name group. The previous 32-character uppercase bearer now yields `unknown` with the original correctly in doubt and no bearer in the result.

The added group verifies:

- A token-valued `error.name` after one acknowledged original becomes `other`, retains that one original, and stops further sends.
- The same local failure during retry after a lost answer remains `unknown` with its original in doubt and no token in the result.
- Known `ECONNRESET` and `RangeError` diagnostics remain named, with the expected uncertainty/partial receipts intact.

All prior controls still pass: malformed first 200, typed 503 then refusal, exact retry bytes/key, closed route-specific errors and ACKs, calendar and expiry boundaries, abort during flight/pause/preflight, copied caller inputs, and the documented difference between same-call uncertainty and previous-call uncertainty retained by the future parent.

Evidence: `/tmp/windows-uploader-f21-probes.{log,json}`, executable `/tmp/windows-uploader-f21-probes.test.mjs`, and machine receipt `/tmp/windows-uploader-f21-review.json`. Old c09 failure probe, failed TAP log, JSON and review are unchanged and verified against their recorded hashes.

Limits: injected fetch responses/exceptions with actual candidate uploader and retained fixture bytes; no live HTTP listener or Backend/DB/native/display/provider execution. This closes the earlier injected-exception privacy failure, without claiming that real Node transport ever supplied such a code. No repository or worker edits, no full suite repeat and no host activation. Root can proceed with its integration verification; the existing queued parent task is unchanged.
