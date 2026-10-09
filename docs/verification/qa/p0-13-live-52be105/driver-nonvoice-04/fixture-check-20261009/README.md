# Overlay fixture check: refused by the Windows execution policy — 2026-10-09

The Lead assigned this check in `handoff_709b36d599e63812ff2ac13dfcde75c1`: run the pure data fixture check once,
with the documented invocation, without Bypass and without any policy change. If it was refused, the denial was to be
preserved and the work stopped. **It was refused before the script loaded.** No fixture case ran, and nothing was
executed.

## Inputs

Both inputs are byte-identical to `937788d`. They were copied into a fresh owned folder under `%TEMP%`, which was
removed afterwards.

| Input | SHA-256 |
| --- | --- |
| `driver-nonvoice-04/overlay-fixture-check.ps1` (71 lines; four pure functions plus the synthetic-JSON loop) | `e09a7a942a3ef22fe2644f0b6dfcd2eadc6b0f7dccf837037b762b583c16729f` |
| `tests/e2e/windows/qa_overlay_fixtures.json` | `6a513c5bd0062b0a17d88038ef882abb62c765e521fbbfbd2f87098392607bc3` |

## Command, once, 2026-10-09T10:17:13Z

```text
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -NonInteractive -File <staged>\overlay-fixture-check.ps1 -Fixtures <staged>\qa_overlay_fixtures.json
```

The exact paths are in [run.json](run.json).

## Result

- Exit code 1, with empty [stdout](stdout.txt).
- stderr, as raw bytes in the system code page: [stderr.gbk.bin](stderr.gbk.bin).
- stderr, decoded: [stderr.utf8.txt](stderr.utf8.txt).

> 无法加载文件 …\overlay-fixture-check.ps1，因为在此系统上禁止运行脚本。有关详细信息，请参阅
> https:/go.microsoft.com/fwlink/?LinkID=135170 中的 about_Execution_Policies。
> CategoryInfo: SecurityError: (:) []，ParentContainsErrorRecordException; FullyQualifiedErrorId: UnauthorizedAccess

That is: "Cannot load the file because running scripts is disabled on this system".

## What this means

This command has no process-scoped `-ExecutionPolicy` argument, and the machine's effective policy does not let a
local unsigned script run under it. The runner and the checker configuration both pass `-ExecutionPolicy RemoteSigned`
(process scope, reviewed earlier for the runner); this documented command did not.

Following the assignment, the check was **not retried**:
- no other policy argument;
- no inline or encoded command;
- no other host or tool.

The effective policy was not queried. The fixtures remain prepared and **not executed**; the predicate remains
unverified natively.

## Next action

This is the Lead's decision. One option is to allow the same single run with the process-only
`-ExecutionPolicy RemoteSigned` argument that the runner already uses. Another is to sign the script, or to run the
fixtures another way that the Lead chooses.
