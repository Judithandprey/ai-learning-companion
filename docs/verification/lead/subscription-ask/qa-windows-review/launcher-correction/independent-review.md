# QA sign-in check cleanup correction — 85d79e6 / a926e91

**HOLD the reusable cleanup correction.** The private check directory and finally path improve the original failure, but the current process classifier and PID-only action do not establish “only this check's processes.” Two concrete source boundaries remain. This is a read-only review against main `6a567b8`, not corrected Windows runtime acceptance.

## 1. P2 — a port marker/PID is not a process identity

`tests/e2e/windows/signin_launcher.mjs:94–104` calls every `electron.exe` main process containing either port substring owned. It records neither executable path, exact checker/stage argv, per-launch instance/creation time nor an owned process handle. The `--qa-check-port` substring also lacks a right argument boundary. The pre-start absence check does not prove ownership of processes that appear later.

`signin_cleanup.mjs:39–43` passes the numeric PID from its last look straight into the callback. The actual callback is `taskkill /PID` at launcher line 109, wired at 203–205; it does not revalidate identity. A process can exit and its PID can be reused after the look. The action then addresses the replacement process. A new unrelated Electron using the same port marker can likewise be classified owned even at a fresh look.

Pure exact-helper reproduction: return `owned:[741]` from the last look, change the simulated current holder of PID 741 to an unrelated process before the action, and observe `askToClose(741)` still invoked. The exact extracted `Contains` predicates also classify `C:\OtherApp\electron.exe C:\OtherApp\check.js --qa-check-port=430009` as owned for marker 43000. That latter observation demonstrates substring/path weakness, not a claim that 430009 is a valid TCP port or that an attacker exists.

Minimal correction: ownership must bind the actual check launch instance and exact expected executable/argv/check identity. Any end operation must remain tied to that same instance rather than an unchecked numeric PID. If the implementation cannot safely retain/use an instance-bound handle, preserve/report uncertainty instead of issuing generic taskkill. Merely adding another earlier PID query still leaves a query-to-kill reuse gap. No new general supervisor is needed.

## 2. P2 — unreadable previously owned process can become “confirmed gone”

The caller explicitly classifies an unreadable command line as `foreign` (launcher lines 92, 95–104). If it is not listening on the DevTools port, it appears in neither `owned` nor `others`. The release helper ignores `foreign`, concludes `exit:'confirmed'` at lines 44–47 and calls `removeFolder` at 51–52. An app/checker can be alive without a listening DevTools endpoint; inability to identify it is not proof of exit.

Pure exact-helper reproduction: first look returns owned PID 742; the next look returns `owned:[]`, `others:[]`, `foreign:[742]` while the simulated original process remains alive with unreadable metadata. Actual helper result is `exit:'confirmed'`, and `removeFolder()` is called. No termination occurs, but the promised state-preservation rule is violated.

Minimal correction: retain the identities this launch owns; an inspection that cannot determine the fate of one of them must return unknown, stop further actions and keep the check directory. Exclude known unrelated processes from termination without converting identity uncertainty into exit confirmation. Add these transitions to the existing focused tests.

## Positive checks and limits

- The user's prepared `3e4b406` entry/profile remains separate: `prepare` behavior is unchanged; `check` copies entry/config bytes into a newly created check-specific directory and removes only that directory.
- Initial Windows query failure refuses before launching. Thrown later look failures stop helper actions and keep state. PowerShell/taskkill calls and waits have explicit limits; WSL connector processes are observed, never killed by this helper.
- The new report preserves the earlier successful checks, native NOT_RUN for the correction, the held source/login prerequisites and zero real-inference attempts. Historical evidence files are unchanged.
- The 21 owner tests were read; Root owns their execution. Their doubles supply already-classified numeric `owned` PIDs, so they do not test the two caller/identity transitions above. This review did not repeat that suite.

Executed only the bounded pure source/helper probe:

```
.tools/node-v24.21.0-linux-x64/bin/node /tmp/qa-signin-cleanup-probe.mjs
```

Three observations reproduced. Files: `/tmp/qa-signin-cleanup-probe.mjs`, `.json`, `.txt`; exact helper export `/tmp/qa-signin-cleanup-85d79e6`. These simulate identity transitions and extract the actual classifier substrings; they do not inspect or terminate any Windows/real process. No GUI, account/authentication, provider, display, user entry/profile or repository file was changed.
