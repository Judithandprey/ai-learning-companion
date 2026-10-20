# Candidate 08 runner: parse-only check — 2026-10-20

The same bounded method as [`c6afeb6`](../../driver-nonvoice-07/parse-only/), for the one changed file. Nothing was executed:
- the runner was not dot-sourced, invoked or evaluated;
- no C# was compiled; its literal blocks are unchanged since candidate 05;
- no product, checker, Edge, account, model, display, microphone, audio or TTS action took place;
- the candidate scratch stayed unused, and no allocation was taken.

**Input.** `candidate-nonvoice-08/runner.ps1`, SHA-256 `4655ec118a01c25839d94c2c004d963cc0f19893a1064dec9e3dea853340ae69`. The hash was checked on Linux, after the copy into a
fresh owned `%TEMP%\lc-qa-parse-24f3e390…` folder, and on Windows (`Get-FileHash`). The folder was removed afterwards.

**Command.** It ran once, at 2026-10-20T11:53:31Z, under the normal Bash approval:
`timeout 120 /mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -NonInteractive -Command - < check.ps1`.
[check.ps1](check.ps1) calls only `[System.Management.Automation.Language.Parser]::ParseFile`.

**Result.** Windows PowerShell 5.1.26100.9711, CLR 4.0.30319.42000: **0 parse errors**, exit 0, empty stderr
([result.stdout.json](result.stdout.json), [run.json](run.json)). This is static validation of the bytes only.
