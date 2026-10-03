# Locally compiled native speech helper

`NativeSpeech.cs` is the human-approved source, SHA-256
`c4c1f127a85ff1c871ce98895d51584af7936bbf23f3a35c7418002f201cbbfd`.
The exact source-adoption decision is committed at
`69c06ea:docs/verification/lead/live-windows/approved-two-gates/README.md`.
The helper is compiled locally from the pinned source. Source adoption, compilation,
memory synthesis, product permission integration and audible device acceptance
are separate results.

Run these explicit commands with installed Windows Node, from `apps/windows`,
using unused labels. Compilation uses only installed
`C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`, `System.Speech.dll`
and `System.Web.Extensions.dll`; it performs no download or PowerShell policy change.

```text
node scripts/build-native.mjs build-approved-01
node scripts/check-native-memory.mjs build-approved-01 memory-approved-01
```

Build output is `native/build/build-approved-01/`: approved source snapshot,
`NativeSpeech.exe` and `build.json`. Memory evidence is
`native/build/memory-approved-01/`: executed source snapshots and `result.json`.
Both refuse existing output names. No WAV is saved or played; only generated
wave metadata/hashes, synthetic test input, process identity and observed child
close are retained. The runner hard-codes the memory sink regardless of argv or
environment. Installed culture availability and native execution still need an
actual run. Memory completion does not prove speaker audibility, accurate 1.3×
perceptual speed, endpoint behavior, microphone/ASR, caption display or interruption
latency.

Ordinary `npm run build` copies the main-only `.mjs` adapter and explicitly omits
any previously built native helper. To bundle the verified local compilation:

```text
node scripts/copy-static.mjs --native-build native/build/build-approved-01
```

This writes `dist/apps/windows/native/{NativeSpeech.cs,NativeSpeech.exe,build.json}`.
The receipt has schema `lc-native-speech-build/1`, mode `local-compilation`, numeric
`status` (success is `0`), nullable `error` (success is `null`), `source_sha256`,
`executable_sha256`, `compiler: {path, sha256}`, `references: [{path, sha256}]`,
`builder_sha256`, timestamp, Node version and bounded compiler stdout/stderr.
Packaging verifies the approved source and executable bytes against a successful
receipt before copying, then verifies the bundled bytes. Trusted main must verify
the same pinned source/executable/receipt at its fixed packaged path; it must never
accept renderer-provided helper paths or speech permissions.

The existing WSL stage script accepts an explicit local build directory:

```text
node scripts/stage.mjs lc-windows-<fresh-version> --native-build native/build/build-approved-01
```

It keeps the existing fresh-stage rule, starts nothing, and touches no profile.
Windows compilation, memory-helper execution and Windows-temp staging are concrete
operations for the parent to review and submit through normal exact-command approval.
Adding these scripts alone claims none of those executions or device acceptance.
