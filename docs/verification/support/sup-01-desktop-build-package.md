# SUP-01 desktop build/package preparation

Current assigned baseline: `afafe82684de966cae74e2cd410f925362ed427b`.
Initial preparation baseline: `07e669154e6eae9944368c210c3f1f3d309aa258`.
Requirement content: `d2603fd1d3b728a2756d0869d40bbf169cb2de0c`.
Checked 2026-09-30. Scope is the delegated workflow/script and this evidence.
Ponytail LITE preserves full scope and necessary checks; models/effort are unchanged.

The lead has now delivered exact, not-yet-accepted owner candidates: Windows
`6584ab1e47a58819aa18bcde973cf64508f8ccb7` and macOS
`7efa46ab75fadf4a6a05f4071526ebd7643df6ea`. Their interfaces were read using
`git show`, including the native verification report, package, script, plist and
sample-session XCTest. Neither application is integrated at the assigned baseline.
This patch adapts build preparation; it claims no hosted desktop run, installer,
application launch or permission test. The 15 declared native XCTests remain
**UNEXECUTED** until the lead runs the coherent reviewed candidate. Mobile code
and previous acceptance evidence remain preserved.

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
| macOS | Require `Package.swift`, executable `package-app.sh`, owner `Packaging/Info.plist` and the declared library/executable/XCTest targets. Call `./package-app.sh NEW_OUTPUT_DIR` once, then `COMPANION_DESKTOP_FIXTURE_DIR=ARTIFACT_DIR swift test --configuration release`. | `MacDesktop.zip`: the owner's entire `CompanionDesktop.app`, zipped by native `ditto -c -k --sequesterRsrc --keepParent`. It is an unsigned development bundle, not an installer, universal binary or notarized release. |

The Windows committed interface was inspected read-only: `build` invokes tsc
and `scripts/copy-static.mjs`; `main` is
`dist/apps/windows/src/main/main.js`. Static HTML/CSS/CommonJS preload files are
copied into `dist`, alongside emitted Windows and reused Safari ink/mode modules.
Thus the whole `dist` hierarchy plus `package.json` is the explicit runtime set;
arbitrary app files are not packaged. Its development staging helpers are
WSL-specific and are not invoked by this native hosted workflow.

The native owner supplies the `.app` interface, placeholder bundle identity
`org.example.learningcompanion.desktop` and plist. Swift tools 6.0 / language 5,
macOS 15, no dependencies/resources/plugins are the recorded contract. The owner
script builds the release executable, assembles the bundle and runs `plutil -lint`;
Support neither reconstructs the app nor adds another release build. The test
command uses the same release configuration. On Apple silicon, the executable may
retain the linker's automatic ad-hoc signature; no signing identity is added.

The full bundle goes directly into the ZIP, using Apple's
[documented archive tool](https://developer.apple.com/documentation/xcode/packaging-mac-software-for-distribution)
and the resource-preserving options used by
[Apple's build example](https://github.com/Apple-Actions/Example-iOS/blob/main/Build).
Actual macOS attribute preservation remains unexecuted locally; the probes use a
stub for `ditto`. No app identity, privacy text, entitlement or dependency is invented.

Every job retains the full committed source archive, checkout/source-tree identity, OS/architecture,
actual toolchain output, per-command logs, final phase/exit status and hashes.
Build/package happens before unit tests, so an available product survives a later
test failure. Failure is still nonzero and the artifact is not a release pass.
Missing source, target, script, executable or runtime is an error. No UI launch,
capture, provider or fake-success skip is part of the hosted job.

`testWritesSampleSessionForMapping` receives `macos-fixture/` under the upload
root, outside excluded `work/`. A successful test run must leave one session with
parseable `status.json` and nonempty JSONL events, `keptFrames=2`, and PNG files
`frames/00000001.png` and `frames/00000004.png`. These are retained unchanged,
with each file included in `SHA256SUMS`; no shell-generated sample substitutes
for them. XCTest owns semantic/pixel checks; the script checks evidence presence
and basic format. Inputs are synthetic, not actual ScreenCaptureKit callbacks.
A failing XCTest retains any emitted fixture plus the packaged app, and keeps its
nonzero exit. Missing/malformed fixture after a successful test command also fails.
The existing unconditional artifact upload includes this directory, so no workflow
change is needed. The full source snapshot also retains XCTest's referenced iOS
`FrameStore.swift` for its identity assertion; no mobile build is run.

## Launch and permission boundary

Only after owner source review and hosted artifact verification:

- Windows: extract the entire `WindowsDesktop.zip`, then run
  `WindowsDesktop\electron.exe`. Keep DLLs/resources/locales together; an isolated
  `.exe` is not the package. Electron documents this manual distribution layout in
  [Application Packaging](https://www.electronjs.org/docs/latest/tutorial/application-distribution).
  Its [installation reference](https://www.electronjs.org/docs/latest/tutorial/installation)
  explains binary acquisition by the installed CLI. No project signing is performed;
  retained vendor signatures are not proof of this app's signing or acceptance.
- macOS: extract `MacDesktop.zip` with Archive Utility or `ditto -x -k` into a
  new directory, then run `open ./CompanionDesktop.app` from that directory in an
  authorized interactive Mac session. This is the owner's permission/runtime
  interface; the provisional raw-executable route is superseded. Record actual
  architecture and use a compatible Mac. Bundle permission attribution, grant,
  relaunch requirements and OS trust remain unverified. Record any launch failure;
  this task does not disable OS protection.

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

Lead completes independent owner-source review, integrates the exact candidates
plus this bounded adaptation, and runs one coherent candidate. Owners resolve
actual compile/test/launch failures in their application paths.
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

Eighteen local tests passed using temporary Git checkouts, real Node/Python/TAR/ZIP
and stub OS, npm, Swift, plutil and ditto commands. They cover the original failure/log,
package and evidence behavior, plus ignored private files and stale outputs,
changed/deleted/missing committed sibling inputs, transitive committed source
consumption, executable modes, internal/escaping symlinks, and rejection of
committed stale `dist`. Runtime ZIPs exclude committed non-runtime notes too.
Tests assert the original checkout gains no node_modules/dist/.build and that
local files remain untouched. Each evidence set's exit status and all listed
hashes are checked. New Mac cases execute the exact owner packaging script against
stub tools: one release product build, complete bundle/executable mode, fixture
retention and hashes, absent/malformed fixture, missing target/script, and retained
app/fixture on later test failure. The versioned fixture script is byte-identical
to `7efa46a:apps/macos/CompanionDesktop/package-app.sh`, Git blob
`0f263fde3e44531cac162e96a064326cc2f3cd21`. These are orchestration regressions,
not native execution; the local stub records are not the requested Swift outputs.

Bash syntax and YAML structure checks passed, including manual/main-only scope,
independent matrix failures, pinned actions and unconditional evidence upload.
Read-only independent review prompted the toolchain and source-provenance fixes
and keeping TypeScript optional. These checks do not execute Windows Git Bash,
Electron binary acquisition, Apple's ditto or any native compiler. Cold-cache
Electron 44.5.1 acquisition, native paths and actual app/package execution
remain for the lead's first coherent hosted candidate. No real OS or product
acceptance result is inferred from stubs.
