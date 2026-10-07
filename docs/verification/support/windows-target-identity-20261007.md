# Windows admission blocker: one targeted identity observation

SUP-01 / existing P0-07 and P0-13 continuation, assigned by Lead in
`handoff_39373f62becfa7e4aea05eb313467536`.
Baseline: `4388217a3784d6979a36b0359b2a49eb6f869750`; QA correction source:
`d60f553df38f1943899007d642e3c97bb79050b3`.
Support branch: `team/support`, starting at `dbc7c54eb3da0234f58556654cfb559361078bbe`.
No branch push, main integration, production change or renewed allocation.

**The exact previously reported process was still observable, but its specific
application and owner remain unknown.** The executable reports generic Electron
resources, and its launch does not match the two pinned QA candidate identities.
This does not establish AgentsDock, another named app, a particular historical
project version, or a product defect.

## Actual result

Normal exact-command review accepted this one foreground command:

```sh
python3 -B tests/probes/support/windows_target_identity.py --output docs/verification/support/windows-target-identity-20261007.json
```

[Original sanitized receipt](windows-target-identity-20261007.json): one native
invocation, native exit **0**, wrapper interval **08:18:06.556745–08:18:09.073070 UTC
on 2026-10-07**. There was no retry, replacement search or parent lookup.

| Field | Observed result |
| --- | --- |
| PID | `100568` |
| Exact creation identity | Matched `639267186912717160`, using CIM `CreationDate.ToUniversalTime().Ticks`, the same source as QA's earlier observation |
| Executable product / company / description | `Electron` / `GitHub, Inc.` / `Electron` |
| Parsed `--type=` child argument | Absent |
| Executable equals pinned QA Electron runtime | False |
| First app argument equals known QA stage | Neither `project_tts_52be105` nor `project_live_1755153` |
| Safe product classification | `unknown` |

The process's raw executable path, command string and unrelated parsed arguments
never leave native memory. Only fixed labels/booleans are serialized. Unknown
file-resource strings are redacted; no window, title, screen, token, authentication
value or private path was emitted or committed. No port query was repeated.

The comparison identifies a snapshot of the requested CIM process, not continuing
liveness. Version resources describe the file at the observed executable path;
they do not establish ownership, authenticity, a verified build, or authority to
close it. Only the two exact QA stage paths were recognized, without substring
matching or directory discovery. A different project stage can therefore remain
unknown. No exact AgentsDock executable/launch identity was found in the assigned
baseline artifacts; generic Electron resources are insufficient to classify it.

## Preserve the distinct observations

At the assigned baseline, the original wrapper refusal stopped before scratch,
native runner or product launch. Its combined guard discarded the conflicting
snapshot. QA's separate 07:55:23.119–07:55:26.487 UTC observation found both ports
free and this non-child Electron process. **Neither that observation nor this new
08:18 observation reconstructs the original refusal's exact cause.** Both prior
records remain unchanged. The current read confirms the reported process identity,
not current display admission or a new test allocation.

Read-only source provenance at `4388217` (retrieve with `git show SHA:path`):

| Path | SHA-256 |
| --- | --- |
| `docs/verification/lead/live-windows/approved-two-gates/resume-20261007/README.md` | `4ff1c82737e32e9d485f0f8b3080b4301ef86eccdc417ffe91e88096a273b5a7` |
| `docs/verification/qa/p0-13-tts-52be105/preflight-refusal-20261007/README.md` | `a7ab8c121a503477454055a0aa5ad306e65e7acd4eaa14d003fa076a65204d2e` |
| `docs/verification/qa/p0-13-tts-52be105/preflight-refusal-20261007/current-metadata.json` | `4da9a6766691170674be0430f6628bc43033e35c993223662694a196f0ea82ae` |
| `docs/verification/qa/p0-13-tts-52be105/preflight-refusal-20261007/metadata-observation-script.txt` | `2458300af991ffa23dfe3b9e3161afb2164ee7ecac5d559f641bafc19e702208` |

The two launch comparators come from the exact baseline's QA
`p0-13-tts-52be105/candidate/candidate.json` and
`p0-13-live-1755153/pre01-correction/candidate/candidate.json`. No unrelated
installation, package manifest or profile was searched.

## Probe, checks and limitations

[Native script](../../../tests/probes/support/windows_target_identity.ps1) SHA-256:
`a55c64759a0501665dacdfbf03eb0360e305d94790a9646cd14e42c8bb3ee32c`.
The [wrapper](../../../tests/probes/support/windows_target_identity.py) reserves a
new output before invocation and validates a fixed schema before retaining output.
The existing QA metadata pattern was reviewed; native `CommandLineToArgvW` avoids
copying its JavaScript parser or passing raw commands over the subprocess pipe.
No dependency or framework was added.

Focused offline command:

```sh
python3 -B -m unittest discover -s tests/probes/support -p test_windows_target_identity.py -v
```

**6 tests passed.** All subprocesses were mocked. Checks cover unknown/stop-state
receipts, exclusion of raw/unrecognized fields, nonzero/malformed output, incorrect
identity/false-success rejection, and existing-output refusal before invocation.
Independent read-only code review found no blocking safety issue before the native
observation. These checks do not claim a Windows application test.

The CIM call has an 8-second operation timeout. There is deliberately no outer
kill timer because no process signalling is assigned; startup, compilation and
file-version reads have no hard overall deadline. The actual command exited
normally. Native absence, creation mismatch or unreadability stops observation;
there is no automatic retry. Raw errors are suppressed.

Primary API references checked **2026-10-07**:
[Win32_Process](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-process)
documents the creation, executable and command fields;
[CommandLineToArgvW](https://learn.microsoft.com/en-us/windows/win32/api/shellapi/nf-shellapi-commandlinetoargvw)
documents native argument parsing and freeing its buffer;
[FileVersionInfo.GetVersionInfo](https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.fileversioninfo.getversioninfo?view=net-10.0)
returns file version resources. None provides application ownership evidence.

## Next owner

**Lead coordinates the operator/actual application owner to identify this exact
PID + creation identity from their known launch/install context.** No further
query, process termination, admission relaxation or diagnostic retry is assigned
to Support. Ownership is the unresolved prerequisite; the observation does not
authorize closing an Electron process. Any later execution remains Lead-owned
under current admission and a fresh reviewed allocation.

Workflow, AGENTS/TEAM, support role, current decisions, relevant original/English
R03/R35/R36/R59/A44 and §7.1/V-DailyResume, and audio source/stop boundaries were
refreshed at the assigned revision; all four translation source/hash pairs matched
the manifest. PONYTAIL LITE preserves full scope and necessary privacy verification;
Astra ultra is unchanged. Display, account, provider, audio and microphone access
were unused; no signals, policy/service action or wrapper execution occurred.
Original-screen gates and all 32 diagnostic steps remain NOT_RUN. Paperclip and
independent `ai` automation remain paused. This bounded question is complete;
Support returns idle pending a new assigned incident.
