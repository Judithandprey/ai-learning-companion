# Windows QA-WIN-03 quit correction / staged evidence review

**APPROVE the bounded QA-WIN-03 source correction and its author evidence. This is not approval of the combined delivery:** QA-WIN-04 remains HOLD from the separate status reviewer (an already-open ASK card retains the old storing claim; an unknown/stuck job can restore storing without a new ACK). No GUI, database, service, native app or provider was run by this reviewer.

Reviewed exact code `5cd0bec87db7a1f0989ab8e7f0ed702261dbccf2`, evidence `70cb7e872e1cc7826d5b108ccc006b758d3cfb70`, parent `5871981524140e3be986268a941d34e99af25bb9`, export `/tmp/lc-win-qafix-70cb7e8`. Current independent QA report is `docs/verification/lead/windows-parent-review/correction/qa-result.md` (13 pass / 2 fail on the prior build); the owner report explicitly preserves the outstanding independent retest. Applied current workflow/PONYTAIL LITE and existing Stop/original-retention requirements R35/R36/A14. No dependency, contract or backend implementation review was repeated.

## Quit behavior

`apps/windows/src/main/main.ts:1044–1057` keeps a single `link.quit(20_000)` promise. Every intervening `will-quit` remains prevented; both completion and rejection reach one final quit. The only behavior change in this path is scheduling that final `app.quit()` with `setImmediate`, after Electron has dropped the prevented quit. This fits the actual author's old/new native result and addresses the immediate-completion case missed by the former event-only harness.

`main-harness.ts:94–116` now models a quit requested during the pending quit delivery as ignored. This is an explicit event-loop model, not independently executed Electron. The two owner app tests use actual main callbacks and fake hosts without starting a process. Their after hooks end fake children, then await CaptureLink shutdown, before removing backend copies. The pending-host case still checks two intervening quits and one final completion.

The existing local `end`/`finish`, unfinished-frame accounting, 10 s quiet / 60 s hard Stop limits, unsaved-ink retry/export/discard protection and control-close guards are byte-identical to the approved parent. They remain in front of the final `will-quit` link shutdown; this change does not bypass the ink Stop or make an unconfirmed save appear saved.

Focused independent check: pinned Node 24.21, `node --test --test-isolation=none --test-reporter=tap /tmp/windows-qa03-quit-probes.test.mjs`: **6 passed, 0 failed/skipped, 45.747053 ms**. Exact old callback under the new event model produced zero completed quits and one ignored quit; corrected callback produced one completed quit and zero ignored quits. Pending resolve/reject both held repeated quits, called shutdown once with 20,000 ms, and completed once; disconnected control exited; two unchanged retention/close spans matched byte-for-byte. Initial Node subprocess Git access produced an environment EPERM before checks, preserved in `windows-qa03-quit-probes-initial-tool-error.tap`; reading a separately exported exact old source removed that irrelevant probe dependency. No source was changed.

## Evidence and script

All 18 changed export files match raw Git bytes. Read-only recomputation of existing local package.json + dist builds matches both author receipts exactly:

| Build | Files | Stage SHA-256 | Author result |
|---|---:|---|---|
| 5871981 | 56 | `b9aaf734396ad8088fb17e7e0809600227abb4c3f014c0fc936dac01cf9e5107` | 1 pass / 2 fail |
| 5cd0bec | 57 | `dc2b09ebe995861c685e43fb25db9e5ab18c5b127718204a7277e214c0e55006` | 7 pass / 0 fail |

The earlier hash also equals the independent QA `build.json` receipt. The new build was freshly produced by Lead, not rebuilt here. Per-file SHA-256 details are retained in the JSON review. These reproduce staged bytes; they do not independently witness the author's Windows execution.

The script uses normal Electron (no LC_SELFTEST exit bypass), owns the driver and app PIDs, closes the control via scoped DevTools, records whether exit occurred before any fallback kill, and allows the same-profile relaunch check. Its WSL driver has a 600 s outer bound; failed close is recorded before killing that owned app. The unavailable-service case uses a nonexistent lc_p0_test socket, explicitly starts capture, obtains an ASK card, stops, then closes. No pixels are included in the committed report, and the temporary capture folder is removed. `node --check` passes.

Actual committed author receipt: Electron 44.5.1 / Node 24.21.0 / win32-x64; old idle close and reclose each exceed 30 s and require own-PID termination. Corrected normal close is 166 ms, linked idle close 154 ms, same-profile reclose 164 ms, unavailable-service Start/Stop close 247 ms, all code 0. Driver exit 0, error null, no Electron remains. These are author-operated DevTools checks without physical pen, reachable storage, or AI. They do not close the independent QA or full-product gates.

One **nonblocking diagnostic guard limitation**: `scripts/link-quit-check.mjs:113` derives orchestrator exit from check results/error/electron state without requiring `result.status === 0`. A future nonzero driver termination after writing an otherwise successful report could return success. The supplied after receipt actually has driver_exit 0, so this does not invalidate this evidence or block the production quit fix. A minimal future guard is to include that status comparison; no new process framework is needed.

Artifacts: `/tmp/windows-qa03-quit-review.json`, `/tmp/windows-qa03-evidence-audit.py`, `/tmp/windows-qa03-quit-probes.test.mjs`, `/tmp/windows-qa03-quit-probes.tap`, `/tmp/windows-qa03-quit-probes.json`. No repository/worker modifications.
