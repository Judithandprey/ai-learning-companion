# MAC-PARENT-C1/C2 correction review — APPROVE (bounded source)

Exact delivery `fb891d699cc33cde10c2a1fa25928f3c87346b3f`, parent `f625b480e591682be75dd6a7617c08eee4cf7bd6`; export `/tmp/lc-macos-parent-fb891d6`. Read the complete `CaptureLink.swift` correction delta, its affected callers/guards/serialization, C1/C2 regression tests, the correction report, and the preserved original lead findings. Applied current workflow and PONYTAIL LITE. No product/worker files changed.

**No concrete blocker remains for C1/C2.** This is source/correction approval; macOS compilation, Darwin process/URLSession behavior and interactive device acceptance remain unverified. The separate reviewer owns MAC-CONTROL-01's sender correction.

## Source disposition

- **C1 closed:** `usable` includes the sticky journal fault. Launch, registration, current-state read and source-registration saves must succeed before later requests. The caller checks again after awaited stages; reconnect and refusal recovery also respect the fault. `connect`/`run` close only the owned host on fault. A failed post-launch save ends the newly returned host before exposing it for requests. Stop still saves its witness before dispatch. Fault alone does not close the local capture gate or remove originals. Believed server stop/withdrawal is handled independently of whether its save succeeds.
- **C2 closed:** `sendStop` selects a prior entry only when its body is byte-identical to the current stream's generated Stop at the read revision. It resends that entry's key/body, records replays, and preserves prior answer information in notes. A changed revision creates a new command while keeping the old witness. Stored foreign/different bytes cannot become an outbound command. The strengthened key check binds a consumed Stop key to its stream. A previously unknown/written command remains uncertain after a later definitive refusal; a known refusal sent again is journaled as in flight before dispatch.

No wire/dependency changes were needed. This review does not re-review the original host/process implementation, app UI, uploader or full suite.

## Actual independent checks

Command:

```sh
bash /tmp/mac-parent-fb891-review.probes/run.sh > /tmp/mac-parent-fb891-review.probes/probe.log 2> /tmp/mac-parent-fb891-review.probes/probe.stderr
```

Result: **11/11 cases passed**, interpreter exit 0, stderr empty. The old defect scenarios were adapted in a **new** probe; original failed probes/results remain untouched.

1. Healthy registration → GET → source PUT → Stop/read, owned host ended.
2. Fault when launch returns: zero HTTP requests, returned host ended, local gate preserved.
3. Fault after registration: only registration POST; no GET/source PUT or unwritten Stop, host ended. After reopening, fresh-consent-false GET/Stop/GET settles the durable uncertain record.
4. Fault after state GET: only POST/GET; same fencing, teardown and reopen recovery.
5. Believed withdrawn registration plus save fault: capture gate closes, no later request; host ends.
6. Journal becomes unwritable before user Stop: no unwritten Stop request; host ends.
7. Reopened unknown revision-1 Stop: original `.stop.1`, byte-identical body, one entry and recorded replay.
8. Current revision changes to 2: new `.stop.2` with revision-2 body; original revision-1 body/unknown outcome retained.
9. Reopened unknown Stop followed by 403: same key/body and still unknown.
10. Reopened written Stop: same key/body and correctly settled after success.
11. Reopened known-refused Stop followed by another definitive refusal: remains refused, preserving the meaningful control distinction.

The probe runs exact candidate coordinator logic with the existing Linux Apple/Darwin stubs and previously documented import/corelibs adaptations. Every production input was compared byte-for-byte with Git; normalized hashes are recorded. Launcher/HTTP are in-memory doubles; the write failure is an actual chmod-induced failure in owned `/tmp` directories. This proves these coordinator paths, **not real child EOF/reaping, HTTP, Swift-on-Darwin or capture behavior**. No socket/listener, DB, GUI, provider, new dependency or broad test campaign was used. Owner's 22/23 Linux tests and 78 declared native tests are not counted as this review's execution.

Evidence: `/tmp/mac-parent-fb891-review.probes/{prepare.py,run.sh,src/main.swift,source-manifest.json,results.json,probe.log,probe.stderr}`. Machine receipt and hashes: `/tmp/mac-parent-fb891-review.json`.

Next: Lead integrates after the separate correction reviews; run the existing hosted macOS build/test once against the integrated source. Device/provider gates stay open.
