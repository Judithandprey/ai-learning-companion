# SUP-IOS-01 — CompanionInk build and filesystem evidence

2026-09-29 UTC. **CompanionInk compiled for iOS devices and iOS Simulator; both
artifact downloads and exact-source checks passed. The native real-filesystem
helper ran 13 assertions: 13 PASS, 0 FAIL, 0 SKIP.** No simulator launch, signed
installation, physical iPad/Pencil operation or independent UI acceptance occurred.

## Exact assignment and revisions

This continues the full user-approved iPad delivery assignment, SHA-256
`a33b3f0ce4fe6a55b49100324353c5c7a1861357af095c214cb69bad2a761dcd`, following
the [completed EnvProbe route](sup-ios-01-build-install.md). Lead delivered the
corrected native source and exact integrated baseline through the existing route;
Support did not start a second research task or workflow.

- Native candidate `5d5d8cb3a00cee6fc87528185ccb5a5f6eee1036`, then owner repair
  `c6d0976f17263444c9bca1e03b05533ddaa33b8e`. Read the complete corrected native
  report plus manifest/helper inputs. Source and helper bytes match the integration.
- Support CI `b1cabc1e9fb7b25ea0e62e5abd1190f4b2f0d03a` → main `6f6d863` adds the
  two-SDK matrix; `9775d9f2ad22cb28e5054eb2e148cf24760da7fa` → `2ec7a2b` runs the
  delivered filesystem helper once in the device job. Only `ios-probe.yml` changed.
- Exact tested main: `833a2a63a8bf8442b411ec71133081a9fbe1e43c`, provided in
  `handoff_4a3499ccc5bf765e4f363364ab0f0593`. Read updated role/team/task split at
  this revision. No requirements/workflow change expanded this bounded scope.
- Integrated workflow equals Support's delivered version. EnvProbe job, existing
  triggers, minimal permissions and concurrency remain; `checks.yml` is untouched.
- Used only the latest automatic push run. No workflow dispatch, rerun, branch
  push, signing/account change, native edit or repeat EnvProbe download occurred.

## Actual cloud execution

[Run 36528092111](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36528092111)
finished successfully on the exact SHA above. Both CompanionInk jobs used arm64
macOS 26.6.2 (`25G83`), runner image `20260907.0351.1`, Xcode 26.6 (`17F113`),
and their respective iPhoneOS/iPhoneSimulator 26.5 SDKs.

| Job | Actual interval UTC | Outcome |
| --- | --- | --- |
| CompanionInk (iphoneos), `109275449943` | 05:50:48–05:51:35 | Device-target compilation, unsigned product packaging, filesystem helper, result/source/log upload passed |
| CompanionInk (iphonesimulator), `109275450014` | 05:50:48–05:51:31 | Simulator-target compilation and product/source/log upload passed; duplicate helper step intentionally skipped |
| Existing EnvProbe, `109275449837` | 05:50:51–05:52:03 | Run metadata reports success; no duplicate artifact download or investigation |

Actual app commands execute inside `apps/ios/CompanionInk.swiftpm`, using scheme
`CompanionInk`, Debug configuration, `CODE_SIGNING_ALLOWED=NO`, isolated job-local
derived data and `.xcresult` paths. Destinations are `generic/platform=iOS` and
`generic/platform=iOS Simulator`, with their matching explicit SDKs. Both logs
contain `BUILD SUCCEEDED`. No native compiler error occurred. The earlier
build-reading hypothesis about `ObservableObject` imports was not reproduced;
no speculative native fix is warranted by these builds. Both retain the nonfatal
AppIntents-metadata warning (no AppIntents dependency).

## Downloaded artifacts and source fidelity

| Actual artifact | ID / bytes | ZIP SHA-256 verified against GitHub metadata |
| --- | --- | --- |
| [companionink-iphoneos-833a2a63a8bf8442b411ec71133081a9fbe1e43c-1](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36528092111/artifacts/11015203228) | `11015203228` / 151,476 | `fa9157288c00a069da884e7e2df7448ebd35f39ae11ed5540ad10d2ca6e01cba` |
| [companionink-iphonesimulator-833a2a63a8bf8442b411ec71133081a9fbe1e43c-1](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36528092111/artifacts/11015635836) | `11015635836` / 276,943 | `bd33c97d0530b49e48989c8ab0073e2d30db2d76abb1944dd998eb4374e817f2` |

GitHub expiry is 2026-10-13 at 05:51:28Z (device) / 05:51:25Z (simulator).
Both downloaded archives passed integrity and safe-path checks. Each contains
the exact source ZIP, a platform-specific `.app` ZIP (named `.unsigned.zip`, with
the simulator signing caveat below), `.xcresult` ZIP,
`environment.txt` and `xcodebuild.log`. The device artifact additionally contains
the helper's source ZIP and separate compile/execution logs.

Both `CompanionInk.swiftpm.zip` files are 7,618 bytes, SHA-256
`2688fb6e042ffc3024fa548ba03596e9741cb9309cd232cf6ba23b127ca39231`.
Their exact six-member source sets and bytes match `git show` at both integrated
`833a2a6` and corrected owner `c6d0976`. Source tree:
`030259dea2fa26c0fdbd1552b26f645c2864ff3d`. The downloaded helper source also
matches the integrated commit. Environment records identify the correct run,
commit, SDK/destination and disabled signing separately for each product.

Product ZIP hashes:

- `CompanionInk.app.iphoneos.unsigned.zip`:
  `c98df03f4540c9ffdb4c3fcbeb3f700b6ab4a5587ed7bf5318da234848b56ea1`.
- `CompanionInk.app.iphonesimulator.unsigned.zip`:
  `8a7f086b6ca8baa4e57d43d2a0cbbc3fca8436f5f5278e859ac8d0a9b0c910cc`.

Independent read-only ZIP/Info.plist/Mach-O inspection confirms both products
identify `org.example.learningcompanion.ink`, version `0.1` / build `1`, minimum
OS 17.0, with the main executable and referenced debug/preview dylibs present.
Device binaries are arm64 with Mach-O platform 2 (iOS); simulator binaries have
x86_64 and arm64 slices, each with platform 7 (iOS Simulator). Executable mode
0755 is retained. No device/simulator mix-up was found.

Device code images contain no `LC_CODE_SIGNATURE`. Simulator arm64 slices do
contain signatures; the main arm64 CodeDirectory has ad-hoc flags `0x20002`.
Simulator x86_64 slices have no signature command. Neither bundle includes
`_CodeSignature` or provisioning profiles. Thus the simulator ZIP's filename and
disabled workflow signing must not be interpreted as every binary having no
signature, or as a developer-signed iPad distribution. This structural inspection
does not validate signatures, install or launch either application.

## Executed filesystem checks and limits

The device job compiled the actual owner's `InkFile.swift`, `PracticePage.swift`
and `checks/InkFileCheck/main.swift` with `xcrun swiftc -target arm64-apple-macos14`,
then ran the resulting helper against a fresh real temporary directory. Compiler
output is empty and the compile step succeeded; execution output is retained in
`ink-file-check.log`, SHA-256
`27bc5534a0da3e8ce6e685671b221f3d793436f6ccf68a41baf61fa2bb314987`.

Actual output records 13 PASS, 0 FAIL, **0 runtime SKIP**: absent/previously
unread/unchanged/changed file rules; both mode-000 unreadable-file protections;
original bytes unchanged; valid envelope acceptance; schema/authorship/layer/page
rejection; and unchanged envelope round trip. The unreadable cases actually ran
on this host. The simulator job's conditional helper-step skip avoids executing
the same host check twice and is separate from runtime test skips.

This checks the app's extracted file rules and envelope using synthetic drawing
bytes. It is not PencilKit UI execution, a real stroke serialization/reload test,
an app lifecycle/atomic-save stress test, or independent QA acceptance. No skipped
case is reported as passed. Native UI/device acceptance remains with iOS and QA.

## Prepared delivery and next action

Attached via publication `pub_22329fd46c484fc498ca255a6df571c6`:

- `CompanionInk.swiftpm.zip`, `art_45d73bbebf5f4afb` (the exact cloud source).
- `CompanionInk-device-build-833a2a6.zip`, `art_d92af6395db64756`.
- `CompanionInk-simulator-build-833a2a6.zip`, `art_0efbf5de827a4753`.

Next physical prerequisite: the user opens the prepared source package in Swift
Playground on the reported iPad Pro 13-inch (M5), iPadOS 26.5. No paid enrollment
is required to attempt this source-run route; the unsigned device `.app` is not
an installable signed distribution. The existing [route evidence and official
references](sup-ios-01-build-install.md#signing-and-evidence-boundaries) apply.

1. Save/extract `CompanionInk.swiftpm.zip` in Files; open the complete
   `CompanionInk.swiftpm` in Swift Playground and tap Run App.
2. If compilation/opening fails, return the exact error and Playground version.
   If it opens, record the displayed bundled practice page and NAV mode. This
   page is a labeled owned fixture, not captured course content.
3. For the owner/QA's bounded next check: select WRITE, draw/erase, close/reopen
   offline, and check the same original ink remains editable on the same page.
   Pencil behavior requires the physical Pencil. ASK should say AI is unavailable.
   Return actual observations/errors; no automatic pass is assumed.

QA currently has no Mac/simulator/device execution access. Its simulator artifact
requires a compatible execution host and an actual launch; this build did not
launch it. Lead coordinates that route or the user's device evidence and supplies
the exact candidate to QA. No further CI patch is indicated by these results.
R59/A44, A46, live capture/audio and full P1 remain separate unverified work.
