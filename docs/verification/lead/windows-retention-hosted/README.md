# Windows retained-originals hosted build

Reviewed source **f46ff8737a8e6cc09fe8577d2a2ef7cd2dfcf7dd** passed the existing
Windows-only [run 36723370841](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36723370841),
created at 2026-09-30 13:40:36 UTC. The actual Windows job completed in 1m20s;
queue time is distinct. This is the integrated retention base/fix f185d40/0a3d879,
not Web's subsequent QA-WIN-01 alignment work.

- Pinned TypeScript build, static assets, Electron 44.5.1 acquisition and development
  packaging succeeded on Windows x64, runner win25-vs2026 / 20260922.246.2.
- **54 named tests passed**, no failures/skips/cancellations, reported duration
  2129.2622 ms. These are component tests, not real interactive Windows acceptance.
- `result.json` reports checks-completed, exit 0, with interactive runtime,
  provider and signing verification all false.
- Development ZIP SHA-256:
  `b307982243d48f424f197c6a85e0c90b1df7bf2752c1895eb85556f7aa8bdb80`.
  Source archive SHA-256:
  `5f508dcf16baff6cadb8421ef6a10e5811982e72b40380fa1f8592ce2cd516ee`.

Artifact 11101606896 (`desktop-windows-f46ff8737a8e6cc09fe8577d2a2ef7cd2dfcf7dd-1`)
was successfully downloaded to `/tmp/lc-windows-36723370841`. Large ZIP/source
archives stay outside Git. Exact raw evidence is copied here; original artifact
`build.log`, `tests.log`, `manifest.log` and `electron-version.log` use the local
aliases build.txt, tests.txt, manifest.json and electron-version.txt. SHA256SUMS
retains original artifact names. [Independent package/source audit](artifact-audit.md) passes: 13/13 hashes;
1,717 source files (392 raw Git matches, 1,325 CRLF-only), exactly reproduced
by read-only core.autocrlf=true Git archive. No other source difference was found;
the hosted runner's actual Git config is not inferred. The ZIP contains 103 files:
30 app files with complete runtime imports/preloads/assets and 73 runtime files
identical to the previously reviewed Electron package. All retention corrections
are present; the apps/windows source tree matches reviewed e586b82 exactly.

The package was not launched on the user's desktop and the running user preview
was neither replaced nor restarted. Backend's exact image-consistency correction
and Web's QA-WIN-01 correction remain with their owners. QA receives the reviewed
changed-workflow baseline after correction. Failed final-record retry is currently
process-held, not a durable restart journal. Real AI, physical pen, content-following
ink, audio, actual Notability import, interactive Mac and both full product gates
remain separate and open.

Normal [P0 CI 36723177372](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36723177372)
also completed successfully on exact f46ff87 for Python3.12 and3.14 / Node24.21.0.
Both actual completed receipts are retained here. Earlier normal CI on e98c12d was
cancelled by a subsequent push, not a pass or failure; the integrated f46ff87 run
supplies actual completion evidence. Later documentation-only commits do not
change this build/source baseline or retroactively change its executed SHA.

Substantive next-owner dispatches are actual accepted native receipts: Backend
`handoff_acd2cfa19f40647ec8abbf344fbafe59` owns the precise internal image-fact
and inherited marker correction; Web's current QA-WIN-01 repair retains one next
producer mapping task `handoff_bd9accf12c0c0009e6abeab248fe3faa` at6305389.
Accepted delivery is not execution. Native's original correction remains assigned;
Lead read-only inspection observed modified owned correction files, with no new
start reply yet. No roles, services, quotas, accounts or permissions were changed.
