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
Relevant source/workflow/script edits or untracked source files fail before any
build, so the archived `HEAD` actually identifies the inputs. Use a separate
reviewed checkout instead of cleaning or resetting an owner's ongoing work.

| Platform | Prepared command contract | Development artifact |
| --- | --- | --- |
| Windows | App-scoped package/lock with exact Electron 44.5.1 and TypeScript 7.0.2 when used; declared `build`, `test`, and `main`. `npm ci --ignore-scripts --no-audit --no-fund`, `npm run build`, installed Electron CLI `--version`, `npm test`. | `WindowsDesktop.zip`: complete installed Electron runtime plus app files at `resources/app`; verify the built `main` exists. Unhandled runtime dependencies fail instead of producing an incomplete distribution. |
| macOS | `apps/macos/CompanionDesktop/Package.swift`; `swift package describe --type json`, `swift build --configuration release --product CompanionDesktop`, `swift test`. Swift 5 is the package language mode, not a toolchain version pin. | `MacDesktop.zip`: release executable and adjacent resource bundles/dylibs. This is an executable package, not an invented `.app` bundle, installer, universal binary or notarized release. |

These Windows script names and the Mac raw-executable launch contract still need
confirmation against the owner's actual committed source. No app identity,
Info.plist, entitlement, third-party packager or dependency is manufactured here.
If the owner supplies a packaging script/bundle or additional runtime resources,
consume that exact interface in this one delegated script before claiming a
runnable artifact; do not create a parallel packaging system.

Every job retains source ZIP, checkout/source-tree identity, OS/architecture,
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

Nine local tests passed using temporary Git checkouts, real Node/Python/ZIP and
stub OS, npm, Swift and ditto commands. They verify missing source fails on both
platforms; existing evidence and dirty inputs are preserved; Windows packaging
retains the runtime and application; unknown runtime dependencies fail; build and
Mac toolchain failures propagate; Mac resource/executable metadata is retained;
and later owner test failures retain each platform's package. Each generated
evidence set also has its exit status and all listed hashes checked.

Bash syntax and YAML structure checks passed, including manual/main-only scope,
independent matrix failures, pinned actions and unconditional evidence upload.
Read-only independent review prompted the toolchain and source-provenance fixes
and keeping TypeScript optional. These checks do not execute Windows Git Bash,
Electron binary acquisition, Apple's ditto or any native compiler. Cold-cache
Electron 44.5.1 acquisition, native paths and actual source resource contracts
remain for the lead's first coherent hosted candidate. No real OS or product
acceptance result is inferred from stubs.
