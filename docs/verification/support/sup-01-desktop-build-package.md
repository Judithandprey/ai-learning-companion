# SUP-01 desktop build/package preparation

Assigned baseline: `07e669154e6eae9944368c210c3f1f3d309aa258`.
Requirement content: `d2603fd1d3b728a2756d0869d40bbf169cb2de0c`.
Checked 2026-09-30. Scope is the delegated workflow/script and this evidence.
Ponytail LITE preserves full scope and necessary checks; models/effort are unchanged.

Both desktop source directories are absent at that assigned baseline. The lead
has supplied the intended package interfaces, but neither exact owner candidate
has been delivered to Support. This is **source-not-ready**, not a passed build.
No hosted desktop run, installer, application launch or permission test is claimed.
The lead must review the actual scripts/resources/launch needs before dispatching
the combined source. Mobile code and previous acceptance evidence remain preserved.

## Prepared build interface

`.github/workflows/desktop-checks.yml` is manual-only and main-only. Independent
Windows 2025 x64 and macOS 26 jobs use existing pinned checkout, Python 3.12,
Node 24.21.0 (Windows only), and artifact actions, with read-only repository access.
There was no Windows job in the assigned baseline; `windows-2025` is the new
hosted label for the authorized Windows task. This adds no cloud service/account.

```sh
bash scripts/desktop-checks.sh windows /absolute/empty-output
bash scripts/desktop-checks.sh macos /absolute/empty-output
```

Use Git Bash on Windows, Bash on macOS, and Python 3.12 (`PYTHON=python` in CI).
Run only in an isolated reviewed checkout, not the user's running preview.
The output directory must be absent or empty; existing evidence is never deleted.
Relevant source/workflow/script edits, untracked source files, and changed or
missing Windows `apps/safari-extension/src/{ink,mode}.ts` fail before any build.
The script pins one commit, archives its entire committed tree as `source.tar.gz`,
and builds/tests only in the extracted `work/source` snapshot. This includes
transitive sibling inputs and root configuration without consuming ignored local
files or old outputs. Tar extraction preserves executable modes and safe internal
links, and rejects links outside the snapshot. No build tool runs in the original
checkout. Use a reviewed candidate without cleaning or resetting owner work.

| Platform | Prepared command contract | Development artifact |
| --- | --- | --- |
| Windows | App-scoped package/lock with exact Electron 44.5.1 and TypeScript 7.0.2 when used; declared `build`, `test`, and `main`. `npm ci --ignore-scripts --no-audit --no-fund`, `npm run build`, installed Electron CLI `--version`, `npm test`. | `WindowsDesktop.zip`: complete installed Electron runtime plus only `package.json` and freshly built `dist` at `resources/app`; require `main` inside `dist`. Unhandled runtime dependencies or committed old `dist` fail instead of producing an incomplete/stale distribution. |
| macOS | `apps/macos/CompanionDesktop/Package.swift`; `swift package describe --type json`, `swift build --configuration release --product CompanionDesktop`, `swift test`. Swift 5 is the package language mode, not a toolchain version pin. | `MacDesktop.zip`: release executable and adjacent resource bundles/dylibs. This is an executable package, not an invented `.app` bundle, installer, universal binary or notarized release. |

The Windows in-progress interface was inspected read-only: `build` invokes tsc
and `scripts/copy-static.mjs`; `main` is
`dist/apps/windows/src/main/main.js`. Static HTML/CSS/CommonJS preload files are
copied into `dist`, alongside emitted Windows and reused Safari ink/mode modules.
Thus the whole `dist` hierarchy plus `package.json` is the explicit runtime set;
arbitrary app files are not packaged. Its development staging helpers are
WSL-specific and are not invoked by this native hosted workflow. This interface
and the Mac raw-executable launch contract still need confirmation against the
owners' final committed source. No app identity,
Info.plist, entitlement, third-party packager or dependency is manufactured here.
If the owner supplies a packaging script/bundle or additional runtime resources,
consume that exact interface in this one delegated script before claiming a
runnable artifact; do not create a parallel packaging system.

Every job retains the full committed source archive, checkout/source-tree identity, OS/architecture,
actual toolchain output, per-command logs, final phase/exit status and hashes.
Build/package happens before unit tests, so an available product survives a later
test failure. Failure is still nonzero and the artifact is not a release pass.
Missing source, target, script, executable or runtime is an error. No UI launch,
capture, provider or fake-success skip is part of the hosted job.

## Launch and permission boundary

Only after the actual owner contract and hosted artifact are verified:

- Windows: extract the entire `WindowsDesktop.zip`, then run
  `WindowsDesktop\electron.exe`. Keep DLLs/resources/locales together; an isolated
  `.exe` is not the package. Electron documents this manual distribution layout in
  [Application Packaging](https://www.electronjs.org/docs/latest/tutorial/application-distribution).
  Its [installation reference](https://www.electronjs.org/docs/latest/tutorial/installation)
  explains binary acquisition by the installed CLI. No project signing is performed;
  retained vendor signatures are not proof of this app's signing or acceptance.
- macOS: the prepared raw-executable archive uses `cd MacDesktop` then
  `./CompanionDesktop` in a foreground Terminal. That route remains untested until
  confirmed by the native owner and used in an authorized interactive session.
  Record actual architecture from the artifact; use a compatible Mac. If an app
  bundle is required for launch/permission attribution, return that concrete
  requirement to the native owner rather than inventing identity or privacy text.
  Record any launch/OS trust failure; this task does not disable OS protection.

**Smallest later Mac action:** provide one authorized interactive macOS 15+
session compatible with the artifact, launch the exact reviewed candidate, and
exercise screen-permission denial followed by an explicit grant, display selection
and Start. Switch between a browser and another native app and change visible
content; verify fresh whole-display frames and source/time/gaps. Use the reachable
Stop and confirm capture/live status ceases. Record SHA, OS, architecture, actual
permission recipient and results. This is a bounded capture check, not full QA.

Apple exposes the grant in System Settings → Privacy & Security →
[Screen & System Audio Recording](https://support.apple.com/guide/mac-help/control-access-screen-system-audio-recording-mchld6aa7d23/mac).
Hosted compilation cannot exercise this user's permission UI. No `tccutil` reset,
automatic grant, accessibility change, microphone grant or new account is made.
Audio, actual pen input, overlay navigation, editable originals and actual AI
receipt require their own implemented per-OS operation checks. Sidecar is optional
later work, not the prerequisite. No access or hardware purchase is assumed.

## Remaining owner action

Lead integrates reviewed owner source plus the bounded CI patch, confirms actual
command/resource contracts, and runs one exact candidate. Windows owner supplies
the complete entry/runtime assets; native owner supplies package/launch needs.
QA then checks each OS separately once runnable. Both §7.1 gates, full editing,
audio, learning, destination and P1–P4 acceptance remain open. Package/test success
would establish none of those by itself.

Primary links were read on 2026-09-30; pages do not show a publication date.

## Actual local checks

Run with Node on PATH:

```sh
bash -n scripts/desktop-checks.sh
python3 -m unittest discover -s tests/probes/support -p test_desktop_checks.py -v
```

The initial nine tests did not cover two defects subsequently reproduced by lead
and Support at `bb56a08`: an ignored `.env` entered the runtime ZIP, and a dirty
sibling source was consumed without appearing in the source archive. Both
incorrectly ended with `checks-completed`. The snapshot and explicit runtime-set
correction above replaces that behavior; the first preparation commit alone must
not be integrated or dispatched.

Sixteen local tests passed using temporary Git checkouts, real Node/Python/TAR/ZIP
and stub OS, npm, Swift and ditto commands. They cover the original failure/log,
package and evidence behavior, plus ignored private files and stale outputs,
changed/deleted/missing committed sibling inputs, transitive committed source
consumption, executable modes, internal/escaping symlinks, and rejection of
committed stale `dist`. Runtime ZIPs exclude committed non-runtime notes too.
Tests assert the original checkout gains no node_modules/dist/.build and that
local files remain untouched. Each evidence set's exit status and all listed
hashes are checked. These are orchestration regressions, not native execution.

Bash syntax and YAML structure checks passed, including manual/main-only scope,
independent matrix failures, pinned actions and unconditional evidence upload.
Read-only independent review prompted the toolchain and source-provenance fixes
and keeping TypeScript optional. These checks do not execute Windows Git Bash,
Electron binary acquisition, Apple's ditto or any native compiler. Cold-cache
Electron 44.5.1 acquisition, native paths and actual source resource contracts
remain for the lead's first coherent hosted candidate. No real OS or product
acceptance result is inferred from stubs.
