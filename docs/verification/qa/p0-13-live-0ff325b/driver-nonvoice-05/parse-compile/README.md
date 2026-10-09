# Candidate 05 parse and compile check — 2026-10-09

The Lead assigned this check in `handoff_42053bfccd6885bbee9fe5b3ee7a3d23`, using the method already reviewed in
[driver-nonvoice-04/parse-compile](../../../p0-13-live-52be105/driver-nonvoice-04/parse-compile/). It parses the exact
candidate-05 runner and checker, and compiles their changed literal C# block. Nothing was executed:
- no top-level script;
- no native method, window, process or display read;
- no runner, checker or fixture;
- no app, account, provider or audio.

The refused pure fixture check stays NOT_RUN.

## Inputs

The inputs are `df536b8` (`candidate-nonvoice-05`). They were staged in a fresh owned `%TEMP%` folder, which was then
removed.

| Input | SHA-256 |
| --- | --- |
| `runner.ps1` | `2fbb5eb3c5e734719f6b26fc8066b55626078d3ffdb075d5dc65936326ca2cdb` |
| `admission-checker.ps1` | `9637db613373ef5ba63bc10753033aedaab90bf749aeaa982fed9b65c91eccf1` |
| `cs-03-QaOverlayFacts.cs`: the one changed literal block (`QaOverlayNative`, F3-A), in both files | `7a7c27e53f80acaf374083ce406883f8ecccd2c955baf6aa8466ad5221ada3ea` |

The other five distinct literal blocks are byte-identical to candidate 04's, which already compiled. They were not
compiled again. Their hashes are in [run.json](run.json).

## Command

The command ran once, at 2026-10-09T10:34Z:

```text
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -NonInteractive -Command -
```

[check.ps1](check.ps1) was given on stdin. It calls `Parser::ParseFile` for the two scripts and
`Add-Type -TypeDefinition … -OutputAssembly … -OutputType Library` for the block.

## Result

[result.stdout.json](result.stdout.json), from Windows PowerShell 5.1.26100.9444, CLR 4.0.30319.42000:
- `runner.ps1`: **0 parse errors**;
- `admission-checker.ps1`: **0 parse errors**;
- the changed C# block: **compiled**. The DLL's SHA-256 is in [dlls.sha256](dlls.sha256).

The exit code was 0, and [stderr](result.stderr) was empty.

This is static validation of changed source bytes. It is not native behaviour, latency, overlay, affinity, stdin or
echo evidence. No lease or allocation is involved. Real actions remain 0/4, and the diagnostic remains 3/3 closed.
