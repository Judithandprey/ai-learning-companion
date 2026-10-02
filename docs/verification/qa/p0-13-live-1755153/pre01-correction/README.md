# PRE-01 offline correction and exact execution request

2026-10-02. Same-owner P0-07/P0-13 follow-up to Lead's
`handoff_3ee7bb7a7da20aff2325e7f83a77336f`, reviewed at
`55312b5d4d87dd425574573acec8f108a474ec6e`. This is one QA-helper correction;
production remains frozen at `175515308f509fb8c0f531dbdb10e57313fcde5a`.
The prior `d91a326` OS refusal, evidence and resource release remain valid.
No merge, production change, account query or new product campaign occurred.

## Changed behavior

Previously, the owned generated primary surface could pass its geometry/on-top
checks while a private second display existed. Product startup then requested
all-display thumbnails before the helper's later one-display assertion. This
was a future-execution defect; the OS-refused prior run captured nothing.

The emitted exact runner now initializes a native **non-pixel** display baseline
before any owned launch, rechecks immediately before Edge launch, and checks
the owned generated surface immediately inside `Start-App` before Electron
`Start-Process`. The latter is after the launch step's existing 1,500 ms delay.
Unknown/multiple displays, device/handle changes, bounds/work-area changes,
unexpected DPI or unavailable metadata throw before the corresponding launch.

The guard admits only this diagnostic's one primary physical rectangle
`[0,0,2560,1600]`, system DPI192 and browser1280×800/DPR2. It pins the observed
monitor identity and complete work rectangle; no literal device name is assumed.
It reads fresh browser position, outer/inner dimensions and generated-card
geometry, checks the actual owned foreground window rectangle and all16 existing
card/corner ownership points, then reads native topology again. Cached page
`full_screen` truth alone cannot admit a moved window.

Capture Start uses its own guarded runner branch. It resolves the control socket
and encodes the action before the final guard, then sends on that same socket.
The duplicate explicit `lc.listDisplays()` was removed; product Start's existing
internal enumeration remains. The renderer's startup enumeration is covered by
the pre-product-launch admission. Existing AI-off checks and exact-process cleanup
remain. Review also found a candidate-surface binding gap; the launcher now directly
compares the candidate surface bytes with the current reviewed QA template.

Native metadata uses `EnumDisplayMonitors(NULL,NULL)` and `GetMonitorInfo`, with
thread DPI awareness restored in `finally`; these operations enumerate display
metadata without obtaining a screen DC. See [Microsoft enumeration semantics](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-enumdisplaymonitors),
[monitor metadata](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getmonitorinfow)
and [thread DPI context](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setthreaddpiawarenesscontext).

## Actual evidence and limits

| Check | Actual result |
|---|---|
| Focused offline controls | [32 passed / zero failed](offline-controls.json) |
| Changed JS syntax | [4 files passed Node24.21.0 `--check`](source-and-preservation.json) |
| Exact runner + helper PowerShell syntax | [Windows PowerShell parser accepted both](powershell-syntax.json) |
| Pinned existing0.158 binary | [Unchanged `_binary_identity` accepted exact167c… bytes](pinned-binary-admission.json) |
| Candidate identity | 3/3 payload and6/6 current QA source hashes match |
| Prior indexed artifacts | 19 current files unchanged; assigned changed helper's exact old bytes retained at `d91a326`; old index unchanged |
| Native C# compilation, Win32 guard execution, GUI/capture/input | NOT_RUN |
| Product/account/provider/audio/voice | NOT_RUN; zero attempts |

The controls inspect the **actual emitted plan and runner ordering**, reject
guard-removal/unguarded-enumeration mutations, and exercise sensitive-operation
sentinels with multiple, unknown and changed geometry. They also interpret the
preserved old plan to demonstrate that its second-display rejection follows
startup thumbnails. These sentinels are an offline source-bound ordering model,
not execution of native admission. The actual embedded browser predicate runs
in Node VM on synthetic geometry, including moved origin, wrong outer size/DPR,
missing truth and changed cards. A bounded independent Linux review/rerun also
reported32 controls and4 syntax checks passing; it made no native calls.

Only `Parser.ParseInput` ran in the Windows parser host, on text supplied through
stdin. It did not invoke the runner, `Add-Type`, dot-source any file, call Win32,
compile C#, change execution policy or read display/account data. The binary check
read and hashed the existing file using the inherited exact4714615 source-only
copy; it created no client, managed state, lock or provider request.

These fresh checks are point-in-time admission, not atomic isolation from an OS
hotplug/window change after the last query. Full layout/DPI/multi-monitor handling,
physical dragging, capture, inference, Windows/macOS §7.1 gates, speech and
classroom/Notability acceptance remain unverified by this leaf. The exact driver
still has **no real-provider mode**. This does not certify the remaining four-action
real protocol as executable. There is no current display/account/audio lease.

## Exact candidate and permission boundary

[candidate.json](candidate/candidate.json) records the exact script/steps/surface,
source hashes, future scratch directory and both native argument vectors.
Runner SHA256:
`0f6d0b28b7a7bf92adf437dc4d679ea3e53daea73e56c450a5cf34bd7b1f10ec`.
Prepared files remain in this repository only; the prospective Windows scratch
directory was not created. The launcher consumes these exact bytes, refuses
changed sources/payloads, reused scratch or occupied ports, and preserves cleanup.

The ordinary wrapper invocation is recorded here for review, **not authorized now**:

```text
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node tests/e2e/windows/qa_visible_drag.mjs docs/verification/qa/p0-13-live-1755153/pre01-execution docs/verification/qa/p0-13-live-1755153/pre01-correction/candidate/candidate.json
```

The wrapper deliberately retains normal `powershell.exe -NoProfile -NonInteractive
-File ...`. The OS's previously observed effective Restricted policy remains a
dependency; it was not queried again or bypassed. The candidate's
`requested_process_only_invocation` is the concrete **permission request only**:
the same exact runner/arguments with `-ExecutionPolicy RemoteSigned` for that
PowerShell session (and any child sessions). This allows the locally written
QA script while retaining downloaded-script signature requirements, per
[Microsoft's policy documentation](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies?view=powershell-5.1).
It is a proposed narrower permission, not an observed successful run. If a future
local copy is marked/denied or Group Policy refuses, stop; do not unblock it or
escalate to Bypass. No machine/user policy, persistent setting or approval-review
change is requested. Do not execute it directly to skip the wrapper's identity
prechecks/cleanup. Lead must first review the candidate and obtain explicit
process-scoped permission; applying that approved argument to the launcher is a
subsequent bounded change, not an automatic fallback in this delivery.

For the later assigned real connector, the prepared existing trusted setting is:

```json
{"codex_bin":"/home/agentsdock/.codex/packages/standalone/releases/0.158.0-x86_64-unknown-linux-musl/bin/codex"}
```

Require SHA256 `167c0148a849d2444f1b5a7fb5f8bb2de1de5ae13a2a504b833fc765980f5cd9`
again immediately before use. This setting is **inactive** in the AI-disabled
candidate. No launcher/install/model/profile/auth change or0.160 admission was
made; binary identity says nothing about current login, allowance or inference.

The real ledger remains **0/4**, all assigned actions NOT_RUN. Voice remains
unspent/unassigned and the old selected-image slot stays retired. Next owner is
Lead for integration/review, the three existing plan conflicts, explicit script
permission and a fresh exclusive allocation; QA then continues only a substantive
remaining bounded assignment. The separate pending NativeSpeech/native-voice
import approval is unchanged. No root ledger or QA plan was edited here.
