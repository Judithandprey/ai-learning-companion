# Durable connector quit note — bounded source review

**APPROVE with one nonblocking P3 bookkeeping finding.** Exact candidate `4ef42cca8554e9bc1f7e1ca4c63c0873a47e9422`, parent `0b42bbc1088cf48f2c8daf4dcf4b3ea885a566c5`, main baseline `d37f7a442a78122fb351a7aab83ffdff8aec1448`. Reviewed the complete production delta, affected close/quit/end/write call paths, new tests and owner documentation under PONYTAIL LITE. Export `/tmp/quit-note-4ef42cc`; no repository or worker edits.

The central fix is sound in the reviewed source and synthetic scope:

- A connector still running or within its cleanup wait holds the control window open. Repeated close attempts share one promise; Check, Sign in and Start cannot create replacement work during that wait. Existing current-session ink/retention handling and unresolved-ink close protection run first and are unchanged.
- Normal connector end writes no warning. An unconfirmed end is persisted before the close promise resolves; shim exit is explicitly distinguished from the remote connector/Codex process. Existing waits remain bounded at 10 seconds plus a 2-second shim wait, without a new process manager or wider process signalling.
- The file contains only a format, times, shim outcome and older count. It uses the existing atomic write path; malformed existing bytes are reported and left untouched. A failed write is not marked saved: the window stays once, status explains the gap, and later quit retries. A subsequent successful connection does not erase historical uncertainty.
- Startup wording explicitly says these are past records, proving neither current liveness nor later exit. Unusable configuration still displays readable history; disabled configuration leaves it untouched. Forced termination/Windows sign-out remains an explicitly documented limit. Source originals, editable ink, answer records and shared contracts are not changed by this note.

## P3: a late update to an already-compacted note double-counts the end

`apps/windows/src/main/main.ts:1376–1377` deduplicates only against the 50 listed timestamps. If a record has already moved into `older`, `recordConnectorEnd` treats its later shim-exit update as a new row, clips it again, and increments `older` a second time. `subscription.ts:283` supplies this legitimate late update using the original timestamp.

Pure reproduction using the exact production storage functions and a memory-backed atomic-write double:

1. Record 51 distinct unconfirmed connector ends: persisted state is 50 listed + `older:1` (total51).
2. Record the first event again with its same timestamp and `shim:'ended'`, representing its late exit.
3. Persisted state becomes 50 listed + `older:2` (total52), although no new connector ended. Updating an event still listed correctly leaves total1 in the control.

This is inaccurate diagnostic history/counting after a high number of ends, not loss of capture/ink/originals, an unsafe cleanup action or a claim that remote work stopped. It need not hold the near-complete lifecycle integration. Minimal follow-up: distinguish a previously counted event from a new late write when compacting; an update must not increment `older`. Add this one cap-boundary regression to the existing tests. No new archive/framework is needed.

Probe: `/tmp/quit-note-bookkeeping-probe.mjs`, with `/tmp/quit-note-bookkeeping-probe.json` and `.txt` results. It imports no native/process APIs and performs no real directory cleanup.

## Executed focused checks

In `/tmp/quit-note-4ef42cc`, using `/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node`:

```sh
node --test --test-isolation=none --test-reporter=tap \
  --test-name-pattern='fact and its time|the note of an unseen|note is bounded|the close also waits|a line of the note|an end that was not seen is handed' \
  apps/windows/tests/app-ask.test.ts apps/windows/tests/subscription.test.ts
node /tmp/quit-note-bookkeeping-probe.mjs
```

**Six focused tests passed, 0 failed/skipped; 5681.221322 ms.** These cover persisted readback across launches, failure/retry and visible hold, clean/idle close, malformed-file preservation and cap, repeated close/in-progress cleanup and rejected starts, late listed-row update, and invalid/disabled connector configuration. The independent bookkeeping probe passed its reproduction/control assertions. Log `/tmp/quit-note-focused.tap`; machine receipt `/tmp/quit-note-review.json`. Scoped `git diff --check 0b42bbc 4ef42cc -- apps/windows` passed.

All runtime checks here use fake Electron/connector objects or the memory-backed writer. No Windows execution, GUI, process signal, microphone, login/account, provider, database or network operation occurred; the user's active old app was not touched. The whole suite, owner mutation campaign, native build and actual Windows behavior were not repeated or claimed.
