# Scoped launch admission for the one Windows diagnostic — 2026-10-08

**Source repair and new candidate only. Nothing was run on Windows; no allocation exists.** This is the existing
P0-13 assignment `handoff_ffff4e5f0aabea316351ecf893b9313a`, with its clarifications `handoff_f530b0ce49426ce28fafb9d9f918dc52`
(the native runner's second guard) and `handoff_bf81e29bf2d9dde72c1343d82abeafd1` (both guards, no `-AllowForeign`,
complete cleanup enumeration).

On 2026-10-07 this session's automatic permission review refused the first edit as "Security Weaken". The human then
approved exactly this change: block only the processes that really affect the test, keep the port and screen checks,
and keep cleanup to the test's own processes, with no global permission
(`human-approve-admission-20261008:2dde43ea7f4842619709d034fb8b0534`). The edits went through normal tool review.

## What was wrong

Both the wrapper (`qa_run_tts_candidate.mjs`) and the emitted native runner refused to start beside **any** other
readable Electron main process, judged by image name alone.

The 2026-10-07 attempt stopped at the wrapper's preflight. Its snapshot was discarded, so **the cause of that refusal
is unknown**. A later read-only observation found another owner's Electron app (an AgentsDock development client) running.
This repair does not claim that this app caused the first refusal.

## What refuses now (both the wrapper and the runner)

An `electron.exe` process refuses the run when:

- its creation time, executable path or command line cannot be read, or Windows cannot split its command line;
- it is a main process of the candidate runtime (the pinned path, or an `electron.exe` in a folder of that runtime's
  name or 8.3 short name) with no app argument, or a relative one (its working folder cannot be read);
- its executable, or any argument, names the candidate stage or this run's new folder as a whole path component.
  The new folder holds the run's user data, Edge profile, steps and output.
  - Arguments are split by Windows' own `CommandLineToArgvW` in the runner and by the same rules in the wrapper.
    The value of a `-` or `/` switch is checked too.
  - Matches are found in any letter case, with `/` or `\`, a `\\?\` or UNC prefix, a trailing dot or space, or an 8.3
    short name sharing the folder name's first six characters;
- a port, inspect or debug switch carries the app port (43123) or the Edge port (45123), leading zeros allowed;
- anything listens on either port, or the listeners cannot be read.

The wrapper also refuses an `msedge.exe` whose arguments name this run's folder or carry a test-port switch.

Every other process belongs to another owner, the AgentsDock client and its children included:

- It is recorded by PID (the wrapper also records its creation time), never with a path or command line.
- It is never signalled and is no reason to refuse.
- A staged app of another owner on the same cached runtime, with its own absolute app path, is treated the same way.
- Anything it shows over the generated surface is still refused by the unchanged 16 controlled-surface checks.

Runner only: if every relevant row is merely unreadable, the runner reads the process list once more 300 ms later before
refusing (a process caught while it starts or exits). This matters because the attempt is already consumed when the
runner starts.

## What did not change

- **Cleanup.** `signin_cleanup.mjs` is unchanged. The cleanup still receives the complete, unfiltered `electron.exe`
  and `msedge.exe` lists. It signals only an exact launch identity: executable, exact arguments and creation after
  the start, re-validated while the process is held. The admission rule is never applied to the cleanup input; a test
  enforces this.
- **Runner process actions.** The runner's only termination stays the owned app's PID (`endHungApp`, not among the
  32 steps).
- **Foreign-Electron.** It keeps its three call sites (start gate, desktop screenshot, end record). It now lists PIDs
  and reasons only. This run's own app counts as its own only by exact PID and start time, never by PID alone.
- **The candidate.** Production `52be105`, the 77-file stage tree `531943a8…`, Electron 44.5.1, the 32 steps and the
  generated surface are unchanged. The steps differ only in the two paths of the new work folder.
  - The shared `qa-electron-runner.ps1` is unchanged. The delta exists only in this candidate's emitted runner, and
    reverting it gives the reviewed placement runner (a test asserts this).
- **`-AllowForeign`.** It is not used. It appears only in the runner's parameter declaration.
- **Earlier evidence.** The first candidate folder, the consumed attempt's evidence and the 2026-10-07 refusal records
  are unchanged.

The product sets its user data through `LC_USER_DATA` in its environment, which cannot be read from outside. Its
isolation therefore rests on this run's folder being new and created exclusively by the wrapper, not on what the
command line shows.

## New candidate (unused)

| | |
| --- | --- |
| Candidate | [candidate-admission-20261008/candidate.json](../candidate-admission-20261008/candidate.json) sha256 `f580ef5c93484c4cbe89ff3d8af8c53b99571bac897d8570ad1a638f6dd6dc58` |
| Emitted runner | `986077ec88ef8c4d3e626edbb4397e5bd1d56a587bebb5038d8e41c5ab12fad6` |
| Steps | `c7b8f5ed842856de42e0ddd25ac8e534f57eafb40a64e3ca2af0e1ffbef7baa3` |
| Surface | `69e38e1bdacf8f4764a9227ebf58177f9959e83f3a03aa428c1b3e8b998be2d2` (unchanged) |
| Wrapper | `tests/e2e/windows/qa_run_tts_candidate.mjs` sha256 `9f3bc94052246981b9f554823400df4882acdc0906f34b916e7036b952ff7e3f` |
| New work folder | `%TEMP%\lc-qa-tts-output-afad96151bad482f8f4883656cb58e5f`, absent when prepared |

[artifacts.json](artifacts.json) gives the exact `launch_identity` and `native_invocation` an allocation must bind,
the candidate's ten source pins and the reviewed hashes of the two emitted blocks.
[candidate-check.json](candidate-check.json) is the offline identity check against the saved static stage receipt.
The wrapper re-runs the stage check itself at execution time.

Command, only after the lead issues a fresh exclusive display allocation bound to these hashes:

```sh
node tests/e2e/windows/qa_run_tts_candidate.mjs --execute <new QA evidence folder> <allocation.json> <allocation sha256 supplied by the lead>
```

The 140-second bound, the single native attempt, process-and-child `RemoteSigned`, and no account, AI, microphone,
audio or speech helper are enforced as before.

## Checks (offline, injected Windows)

- [wrapper-checks.txt](wrapper-checks.txt): **53 pass, 0 fail**, run with child processes denied (`--permission`).
  - Unrelated readable Electron apps survive admission and are never signalled. The cleanup sees them as foreign or as
    children.
  - Another owner's staged app on the same runtime is admitted. Candidate-runtime main processes with no app or a
    relative app refuse.
  - Stage, folder and profile collisions refuse in every listed form. Arguments that only resemble them (siblings,
    longer names, other short names) do not.
  - Port switches refuse in every listed form. Other numbers, keys such as `--report` or `--import`, and bare words do
    not.
  - Unreadable fields refuse.
  - A PID reused by this run's launch is owned only by its new identity. A PID taken over between look and signal is
    found stale, and nothing is signalled.
  - After the run, a young unreadable row makes the cleanup exit unknown, and a foreign listener is reported.
  - The sanitized refusal record holds no path or command line.
- [generator-checks.txt](generator-checks.txt): **23 pass, 0 fail**.
  - The broad guard is gone and `-AllowForeign` is never read.
  - Foreign-Electron keeps its call sites, and the native patterns, ports and references are the wrapper's.
  - The surface gates and owned-only termination are unchanged. The delta reverts to the reviewed runner.
  - The two emitted blocks are pinned by reviewed hashes, so any change to the native rule fails until re-reviewed.
- [cleanup-checks.txt](cleanup-checks.txt): the unchanged cleanup rule and launcher, **42 pass**.
- **Independent review.** Three read-only lenses: the emitted PowerShell/C#, the rule, and the tests (about 100
  mutants). It found no must-fix. Its should-fix items are applied above:
  - same-runtime processes are judged by their app argument;
  - port keys are anchored, `/` switches and leading zeros are accepted;
  - the end-of-run own-root needs PID and start time;
  - string operations are ordinal;
  - the runner re-reads only-unreadable rows once;
  - the emitted blocks are hash-pinned;
  - the missing cases are added.
- **Targeted mutants afterwards.** 21 targeted mutants were run, each generator mutant with a regenerated candidate and
  re-pinned wrapper, so only behaviour or the reviewed-block pin could catch it. All 21 are caught; one needed two
  added bare-word port negatives. One intended mutant (dropping the scoped guard's `exit 3`) could not be applied as a
  unique text replacement; the block's hash pin covers any change to it.

**PowerShell and C# were not executed or compiled here** (no PowerShell or C# compiler on this host). They were checked
by reading. The wrapper's own pre-launch parser step and the lead's or Support's Windows-side review remain the
compile checks.

## Lead counterexample (handoff_eaea203f)

The lead ran the earlier exported predicate on `C:\Test\lc-windows-tts-52be105.\package.json` and the same path with a
trailing space after the folder name; both were admitted. `b79d195` already trims each path component's trailing dots
and spaces before comparing, in the wrapper (`namesThisRun`) and in the emitted runner (`Test-QaNamesThisRun`). Both
forms, a dot-space mix, and the new work folder with a trailing space now refuse as `names_this_run`. Focused cases were
added to the wrapper test, and an assertion on the emitted trim line to the generator test.

## Not shown, limits

- Windows itself: what `Win32_Process` reports for each process at the time, `CommandLineToArgvW` results, and the
  listener query. Junctions, subst drives and hashed short names of the stage are not resolved.
- A port holder under another image name, or a socket that is bound but not listening: only the listener check covers
  them, once a listener exists.
- That the AgentsDock client never uses the test ports: if it did, the run would correctly refuse.

Real requests remain **0/4**. Native attempts: **0**. The voice slot is unassigned. Automation `ai` and Paperclip stay
paused. This repair is not acceptance of speech, captions, automatic focus, Stop, continuous context or any real-AI
gate.
