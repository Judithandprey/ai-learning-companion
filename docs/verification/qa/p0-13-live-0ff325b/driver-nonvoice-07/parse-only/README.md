# Candidate 07 runner: parse-only check — 2026-10-20

The Lead assigned this check in `handoff_044dbcb0`. It uses the same bounded method as `565bc3d`
([driver-nonvoice-05/parse-compile](../../driver-nonvoice-05/parse-compile/)), narrowed to the one changed file. Nothing
was executed:
- the runner was not dot-sourced, invoked or evaluated, and no script block ran;
- no C# was compiled;
- no product, checker, Edge, account, model, display, microphone, audio or TTS action took place;
- the candidate scratch stayed unused, and no allocation or lease was taken.

## Input

`candidate-nonvoice-07/runner.ps1` at `8bb900b`, SHA-256 `3cf37c29a3254a31b5afc204e95c38a712acf4a91ef4cbad3d3f37972275b6fd`.
Its pin was verified on Linux, then again after the copy into a fresh owned `%TEMP%\lc-qa-parse-cd5725d6…` folder, and a
third time on Windows (`Get-FileHash`). The staging folder was removed afterwards.

Its literal C# blocks are unchanged since candidate 05, whose one changed block compiled at `565bc3d`. This delta changes
only PowerShell lines, so no compile was needed.

## Command

It ran once, at 2026-10-20T11:09:16Z, under the normal Bash approval:

```text
timeout 120 /mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -NonInteractive -Command - < check.ps1
```

[check.ps1](check.ps1) was given on stdin, one statement per line. It calls only
`[System.Management.Automation.Language.Parser]::ParseFile` on the staged file.

## Result

[result.stdout.json](result.stdout.json), from Windows PowerShell 5.1.26100.9711, CLR 4.0.30319.42000:
- **0 parse errors**;
- the file's SHA-256 is the pin.

The exit code was 0, and [result.stderr](result.stderr) was empty. [run.json](run.json) records the details.

This is static validation of the changed source bytes. It is not native behaviour and not evidence about the deadline,
signals or timing. Real actions remain 0/4, and the diagnostic remains 3/3 closed.
