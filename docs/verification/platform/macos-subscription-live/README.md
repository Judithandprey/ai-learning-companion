# Recovered Mac live-session evidence

The [delivery record](../macos-subscription-live.md) is authoritative for scope, executed results,
remaining gaps and next owner. This folder contains inspection/replay aids, not native product
code. No log here proves interactive macOS, real ChatGPT, speech or Notability acceptance.

`source-sha256.json` binds all native sources/tests/checkers and read-only released inputs to
exact bytes. `verification-results.json` separates final exact-source runs, earlier restricted
failures and review snapshots. `SHA256SUMS` covers this folder except itself. Review fingerprints
are the original reviewed snapshots, not automatically the final source. The final portable
harness was compared to all 38 production library/test files after its documented import and
corelibs-property substitutions, and all eight source/English manifest hashes matched.

The final approved broad run has 124 methods, 118 passes and six failures, with 14 failing
assertions (one unexpected). The live-only log has 24 methods, 23 passes and the stand-in raster
failure; all exact final live methods also ran in the broad run. Preserve these failures when
comparing with hosted macOS; do not skip tests or weaken assertions. The restricted full/probe
failures are retained. Linux CFSocket warning text alone is not a diagnosis.

`fixture/` contains the actual synthetic lines and bound results accepted by the released
checker (211 checks). Its PNG comes from the Apple stand-in. The connector probe uses the real
production Swift child launcher/link and released Python stream/bridge/Learning checks, replacing
only the inner client with `probe-real-live-stand-in.py`. Its 18 calls are local stand-in calls,
zero provider/model/account calls. The command needed normal exact-command approval for local
process/socket execution; this does not grant future actions or change any permission policy.

Eight correction mutations and raw logs are retained under `mutations/`. The first C02 removed
only `waiting = nil` and survived the independent watermark guard; its log and first summary
remain. The final C02 recreates the original missing-picture implementation and is caught with
unchanged test assertions. The interrupted prepared 51-mutant campaign was not run. Each mutant
used a private temporary source copy, never the production worktree. C08 predates the final
stronger context fixture; the final unmutated regression is included in the broad run.

## Replay prerequisites and commands

The recovered Linux environment was Swift 6.3.3 Ubuntu24.04, Swift 5 language mode, on WSL.
Toolchain source:
`https://download.swift.org/swift-6.3.3-release/ubuntu2404/swift-6.3.3-RELEASE/swift-6.3.3-RELEASE-ubuntu24.04.tar.gz`.
The toolchain is external to Git; `libc6-dev`, `linux-libc-dev` and `libcrypt-dev` headers were
extracted into the private sysroot. No automatic install/download is included.

`linux-checks.sh` records/replays one stage using the actual recovered paths:

- `/tmp/lc-review-0212/tc/usr/bin/{swiftc,swift-frontend}`;
- `/tmp/lc-review-0212/sysroot` and `/tmp/lc-review-0212/libs` (ncurses compatibility link);
- this worktree at `/home/agentsdock/Projects/learning-companion/wt-platform`;
- the existing pinned Python environment at `../repo/.venv/bin/python`.

The small `harness-*` files, framework re-export modules, Apple stand-ins, UI stand-ins and probe
sources reconstruct the harness without retaining a second production-source tree. This replay
helper supersedes the interrupted preparation script's unexecuted `base/mut/finish` stages.
It is not an installer or approval helper. Each replay writes logs chosen by the caller and new
fixtures/mutant logs under `/tmp`; the retained logs in this folder are not overwritten.

```sh
E=docs/verification/platform/macos-subscription-live
bash "$E/linux-checks.sh" prepare
bash "$E/linux-checks.sh" typecheck
bash "$E/linux-checks.sh" module
bash "$E/linux-checks.sh" app
bash "$E/linux-checks.sh" live       # expected exit 1 on these non-rasterizing stand-ins
bash "$E/linux-checks.sh" all        # preserve all six remaining Linux/harness failures
bash "$E/linux-checks.sh" fixture
bash "$E/linux-checks.sh" connector  # local stand-in only; sandbox approval may be required
bash "$E/linux-checks.sh" mutations
```

No macOS app view was type-checked by the Linux script. The controller class was checked with
UI stand-ins against the separately built library's public interface; app sources were parsed.
Native hosted verification uses the app README's existing `swift build`, `swift test`, packaging
and released fixture-check commands on the exact integrated commit. Lead owns that step and
subsequent separately coordinated real-Mac testing; the mobile checkpoint stays deferred.
