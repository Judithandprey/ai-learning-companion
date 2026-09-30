# Windows parent app correction review

**APPROVE the bounded APP-Q1 / APP-U1 correction** at `5871981524140e3be986268a941d34e99af25bb9`, parent `d6ef68a03bc3e18569d1b4a85dc20f09b7717dff`. No new blocker found in the assigned app/UI seam. Canonical requirements and released integration target remain main `6425a51`; requirements/PONYTAIL LITE policy are unchanged from the original review. No repository/worker files changed.

Reviewed the complete main/control delta and relevant coordinator status, connection and quit paths, added app/control regressions and related fault tests. Nine inspected source/report files in `/tmp/lc-windows-parent-5871981` match their raw candidate Git blobs; SHA-256 identities are in the machine report. Host supervision and full coordinator persistence validation remain separately reviewed.

## Closed findings

**APP-Q1 — main.ts:1042–1054.** `linkQuitting` retains one pending promise. Every `will-quit` prevents default while it is pending; `linkQuitDone` is set only after resolution/rejection, before one deliberate final `app.quit`. Repeated events no longer bypass the wait or create another Stop. Exact callback probes cover both resolution and rejection, three events while pending, one shutdown invocation, one completion-triggered quit and the final allowed event. The disconnected control remains unblocked. The owner regression also drives real main code under its fake app/child and explicitly emits repeated quit events, filling the old harness coverage gap. The existing bounded `CaptureLink.quit` now clears its deadline timer when the race settles.

**APP-U1 — capture-link.ts:400–419, control.ts:292–295.** A fault with previously recorded streams remains a development status with stored/unknown/refused/not-sent counts, earlier unknown streams and the final Stop detail. `sends_stopped` distinguishes stopped future sends from previous outcomes. The header now says further sends stopped and earlier sends are counted; it keeps “No AI is connected.” Exact status/rendering probes retain two committed records, one unknown record, one stream whose end is unknown and “the Stop is not confirmed,” without changing the record. A first failure before any recorded stream remains unavailable/local-only; off mode remains unchanged.

The new `lc:overlay-ready` expression checks `!linkStatus.sends_stopped`, so a new ready handshake after a fault no longer says storage is enabled. Four exact-handler controls cover off, unavailable, healthy development and faulted development. This is a mode flag at handshake, not a per-frame ACK or a newly claimed live UI update channel.

`connect()` checks the fault before launching; existing `begin()` and send-loop guards also retain the fault latch. A bounded direct guard probe called both fresh and renewed connection paths plus another Start: zero DSN reads, zero spawn attempts, zero transport requests. The owner regression additionally models an expired bearer followed by an injected record write failure and checks that a second child/registration does not occur. Stop handling remains separately assessed; this review does not redefine Stop as a data retry.

## Independent verification

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node \
  --test --test-isolation=none --test-reporter=tap \
  /tmp/windows-parent-app-correction-probes.test.mjs
```

**7 tests passed, 0 failed, 0 skipped; 90.526717 ms; exit 0.** These are actual Linux Node runs of exact source callbacks/status/renderer/guards over explicit in-memory boundaries. No native Electron process, GUI, display, database, socket/listener, provider or host process was launched. Root owns the focused suite, build and all author execution-hash receipts; those were not rerun or relabeled as independent results here.

Artifacts: `/tmp/windows-parent-app-correction-probes.test.mjs`, `.tap` and `/tmp/windows-parent-app-correction-probes.json`; machine review `/tmp/windows-parent-app-correction-review.json`. Original HOLD and reproduction files `/tmp/windows-parent-app-review.{md,json}` and `/tmp/windows-parent-app-probes.{mjs,json,log}` remain unchanged.

The corrected report explicitly keeps the owned PostgreSQL runs at the prior `d6ef68a` as author evidence without executed-source receipts; it does not claim those were rerun for this change. New focused results are separate, and Windows Electron-as-Node remains windowless. Interactive Windows capture/ink/storage/Stop, real AI and full product gates remain unverified by this review.
