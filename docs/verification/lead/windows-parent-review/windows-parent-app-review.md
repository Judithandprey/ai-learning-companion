# Windows capture-link app integration review

**HOLD: APP-Q1 and APP-U1 need a bounded same-owner correction.** No ink-loss, external exploit, real GUI result or provider acceptance is claimed.

Candidate `d6ef68a03bc3e18569d1b4a85dc20f09b7717dff`, supplied exact export `/tmp/lc-windows-parent-d6ef68a`; cumulative app changes from owner base `5dc8493`. Current main `1054236` supplies canonical requirements and released services/contracts; the old/thin candidate service tree was not treated as the integration target. Review covered the complete main/preload/control/overlay delta and relevant call paths, app/control tests, owned wrapper/flow and all eight committed JSON evidence files. Machine report records raw SHA-256 and equality to exact candidate Git blobs. No repository/worker writes.

Refreshed AGENTS/TEAM/lead role, workflow and project PONYTAIL LITE; affected original/English §3.9, §7.1/7.2/7.4 and current desktop decisions. All four source/English pairs match the current translation manifest. Host and coordinator-internal reviews remain separately owned.

## APP-Q1 — P2: repeated quit skips the pending shutdown wait

`apps/windows/src/main/main.ts:1041–1047` sets `linkQuitDone = true` before `link.quit(20_000)` resolves. The next `will-quit` consequently returns without `preventDefault`, even while the first Stop/host shutdown is still pending. The final `app.quit()` has not yet been issued by the continuation. The flag describes *started*, not *done*, so repeated quit cannot reliably keep the promised bounded wait.

The exact extracted callback, using a deferred link and an event emitter boundary, produces `first_prevented=true`, `second_prevented=false`, one link quit call and zero completion-triggered quit calls while pending. Resolving the deferred operation then triggers the completion quit. This is a deterministic source-level callback reproduction, not a claim that Windows/Electron native event ordering was exercised. Main has multiple app.quit callers (`window-all-closed`, control `closed`, saved-session completion); the gate itself must remain idempotent under repeated events.

Minimal correction: retain one pending shutdown operation, prevent each event while it is pending, and mark done only when that operation settles/reaches its intended bound, before the deliberate final quit. Add a focused event-gate check. Current `main-harness.ts` replaces `app.quit()` with a counter, and the six app-link tests never deliver `will-quit`; their successful Stop tests do not cover this gate.

## APP-U1 — P2: failure teardown removes known outcome and Stop uncertainty

`capture-link.ts:311` returns `{mode: 'unavailable', reason}` whenever a coordination-write fault exists after `active` clears. `stopFlow` clears it and sends that status at lines 745–749, even after explaining that the Stop is not confirmed. `control.ts:281–290` then resets the header to “captured frames and ink stay on this device, and nothing is sent anywhere” and renders only the fault. The existing committed/unknown counts and unconfirmed Stop are no longer available to the UI. `control-link.test.ts:41` currently codifies this reset after two prior stored records.

The exact `CaptureLink.status()` and `showLink()` functions, given a retained record with two committed records plus one unknown record and the real write-fault reason, produce no `stored`/`unknown` fields and no corresponding UI counts. The reason accurately says *nothing more* is sent, but the default header and disappeared outcome evidence conflate a failed link after use with an unused/off link. Source call flow establishes that this state is reached when write failure persists through Stop/teardown; the probe supplies that state without starting a host or database.

Minimal correction: keep existing committed/unknown/refused/not-sent counts and unconfirmed stream-end facts visible under a link fault; say that further sends have stopped. Do not imply earlier bytes were never transferred or erase unknown receipt outcomes. Keep “No AI is connected.” A bad initial configuration with no historical activity can retain the ordinary local-only/off wording.

## Positive app/source checks

- `end()` latches `stopSending` synchronously before notifying the overlay; direct `finish()` latches independently before appending the ended line. Local retained frames completing while Stop waits remain on device, and later complete manifest lines do not reopen sending.
- `appendRetention()` notifies only after append succeeds and the valid byte frontier advances. Existing torn-tail repair, retained originals and local ink recovery remain in place; failed append does not publish a new frontier.
- `begin()` is reached only after explicit Start/display selection creates the session. Link initialization/config errors do not add renderer authority, and local capture continues after coordinator storage failure. Source/frame/ink identity and NAV/ASK/WRITE routing are unchanged by the reviewed renderer delta.
- Preload adds only state read/subscription, not credentials or host configuration. Main limits `lc:link-state` to the control sender. Renderer uses textContent and count/state objects, and the reviewed status types have no bearer/DSN. The development ASK text and header explicitly deny AI connection; the overlay's `stored` field is a mode notice, not receipt proof.
- App tests meaningfully cover off behavior, exact retained-byte host flow, a pending-encode frame after Stop, direct finish, service Stop and local capture after record-write failure. Control tests exercise actual extracted rendering, with the fault reset expectation requiring correction above. No other test/build rerun was needed here.

## Owned evidence and guards

Committed Linux/WSL evidence reports **5 passed / 0 failed / 0 skipped**, 28,103.208876 ms. Windows reports **1 passed / 0 failed / 4 Linux-/proc-only skips**, 11,542.7117 ms, Electron 44.5.1 run as Node 24.21.0 on win32 with a WSL host. Each app result lists two distinct synthetic PNG originals and two editable-ink JSON originals read back exactly, one confirmed Stop, and `planned_through=3` before the fourth ended line. These are author execution records inspected read-only, not independently rerun results.

The wrapper calls the existing dedicated local `lc_p0_test`, migration and pristine-actor guards before execution; actors are newly generated per scenario. It requires nonzero passed cases, no failed cases and exit 0; cleans only those actors and only after its owned-working-directory process scan finds none, then verifies no remaining documents. It does not erase unrelated actors. The process check is a `/proc` cwd scan rather than an independent PID receipt; its interpretation relies on the reviewed private-host working directory. I did not execute the wrapper or inspect credentials.

No executed-source SHA/hash receipt is recorded in these JSON results; they bind to the committed report bytes and author account of rerunning after correction, not independent proof of exactly which historical tree ran. The report correctly discloses that real main/overlay code runs under fake windows/frames/input, and Windows Electron runs in Node mode without a window. No false GUI, physical pen, provider, full product or §7.1 gate pass was found. The separate root tests/build and eventual owned interactive QA are still required.

## Reproduction

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/windows-parent-app-probes.mjs
```

Exit 0, two expected defect observations. The assertions demonstrate the defects, not product safety. Exact source/probe observations: `/tmp/windows-parent-app-probes.json`; output: `/tmp/windows-parent-app-probes.log`; full review identity/evidence: `/tmp/windows-parent-app-review.json`. No display, service, DB, provider or network actions and no broad suite/build were performed.
