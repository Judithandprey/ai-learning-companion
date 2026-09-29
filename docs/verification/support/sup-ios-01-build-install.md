# SUP-IOS-01 — EnvProbe build and device route

Status on 2026-09-29 UTC: **hosted EnvProbe compilation, artifact upload, actual
download and exact-source verification passed** at
`996d95abb15f0a9d247af048b9e6302936e1c99d`. The unsigned app, source, toolchain
record, build log and result bundle are downloadable and attached. The next
missing device prerequisite is the user's Swift Playground run. No signed
installation, simulator launch or physical-device result is established.

## Assignment and ownership

Read the complete direct assignment:
`/mnt/c/Users/ROG/Documents/Codex/2026-09-27/x-o/work/ipad-delivery/assignment.md`.
Its SHA-256 is
`a33b3f0ce4fe6a55b49100324353c5c7a1861357af095c214cb69bad2a761dcd`.
Read current workflow/support guidance at `2b3429274e6a0998649dbab3bb2d1234a8cb2c82`
and the relevant task, decisions and original requirements. Apply Ponytail LITE
with complete scope, readable code and necessary verification; model/effort remain unchanged.

Early scope notice was accepted as `handoff_9966c55d1751ba7d5f82b3ed368ef2da`.
Lead's substantive reply `handoff_9daf7643b1186958d5a9fa3968ab5833` reconciled the
assignment with an already-created workflow: maintain **`.github/workflows/ios-probe.yml`**
and optional `scripts/ios-build/**`, rather than add a duplicate `ios-prototype.yml`.
Lead will not edit these paths concurrently. Native Swift/project/manifest remain
iOS-owned. Support's uncommitted duplicate workflow draft was withdrawn; it was
neither committed nor pushed. Existing `checks.yml` was not edited.

Lead published the existing integration, and Support inspected its actual result.
No task-branch push is granted. Lead integrates main. Support merged the exact
published `01a8adf` baseline normally into its own clean branch before the CI patch.

## Actual starting evidence

| Observation | Actual result |
| --- | --- |
| Support branch | `team/support`, initially clean at `7cb905723d40525ff5269ffa3bb0a38b6a579229` |
| Native candidate | `402bbcf0a3db78bf14ca066b32cd6cebdb0e70da`, integrated by lead as `91d41e8` |
| Existing CI | `2b3429274e6a0998649dbab3bb2d1234a8cb2c82`, `ios-probe.yml`; proposed `macos-26`, `EnvProbe` scheme, generic iOS, no signing |
| Public repository | Existing `gh` access returned `PUBLIC` and `ADMIN` for `Judithandprey/ai-learning-companion` |
| Initial published revision | `4a2be79525e87542b3ca77ac6fd04ecf28b04b6d`; workflow API initially returned 404. This was superseded by lead's subsequent `01a8adf` publication, not a persistent access failure. |
| Signing configuration metadata | Repository secret names `[]`, variable names `[]`, and no repository environments returned; no secret values read/exported. This does not establish whether the user has an Apple membership elsewhere. |
| Local Apple toolchain | No `swift` or `xcodebuild` found on PATH. No local Apple compilation claimed. |
| Initial GitHub access failure | Restricted-network invocation failed to connect; the normal reviewed network retry succeeded. Not a quota or Apple-signing failure. |

## Actual hosted build and narrow CI patch

[Run 36525663497](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36525663497)
completed successfully at exact main `01a8adf73d9e62465082c0319c5801ecfc8fb203`.
Job `109268042553` ran from 05:20:07 to 05:20:45 UTC. Support inspected this
lead-triggered run; it did not dispatch a duplicate. Native package files are
unchanged from `402bbcf` (empty Git diff for that path).

- Actual image: `macos-26-arm64`, `20260907.0351.1`; macOS `26.6.2` (`25G83`).
- Actual compiler: Xcode `26.6`, build `17F113`; iPhoneOS SDK `26.5`.
- Executed in `apps/ios/probes/EnvProbe.swiftpm`:
  `xcodebuild -scheme EnvProbe -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build`.
- Log records Swift compilation/linking/validation of `Debug-iphoneos/EnvProbe.app`
  and `** BUILD SUCCEEDED **`. The anticipated package/AppleProductTypes failure
  did **not** occur; no native-project workaround is warranted by this run.
- Nonfatal diagnostics retained: scheme supported-platforms-empty diagnostic;
  AppIntents metadata extraction skipped because no AppIntents dependency exists.
  No compile error was observed.
- Artifact API returned `[]`: the existing workflow discarded its unsigned product
  with the hosted runner. This is the observed delivery gap, not a compiler failure.

Commit `037c368787d0aa08af6bed83dcc6ad6fc513e4d1` changes only `ios-probe.yml`:
retain exact-source ZIP and hash/toolchain record, build log/result bundle even
on failure, and unsigned app ZIP after successful compilation. It keeps the
original triggers, read-only repository permission and concurrency policy.
Explicit Bash preserves pipeline failure when output is sent through `tee`.
Missing app products cause a failure rather than a false deliverable claim.
Artifact retention is 14 days. No new framework, signing secret or dependency is
required; pinned `actions/upload-artifact` v4 is the standard artifact mechanism.

Local checks: YAML parsed, all shell steps passed `bash -n`, existing trigger/
permission/concurrency mappings were compared unchanged, and `git diff --check`
passed. Executing the actual workflow shell with an injected compiler exit 65
confirmed that `tee` preserves failure and retains the error log. A missing app
product correctly failed with exit 1. A focused independent read-only review found
no concrete defect. These are **not** verification of the new hosted artifact behavior.
Patch and actual build evidence were accepted by the lead route as
`handoff_9287a35164b1a8898fb7cb79d2a9d42c`; acceptance does not prove integration.
The original 111,450-byte run log was attached separately as artifact
`art_80db0bb023a749b7`; SHA-256
`10b2d1116d0832ccd2761bdbe908abea31548bcf5a9789acf8136e99ae7d9e67`.

## Integrated artifact verification

Lead integrated the CI patch as `be85710` and published exact
`996d95abb15f0a9d247af048b9e6302936e1c99d`, then handed off the existing automatic
run in `handoff_fcee7a6a0cf0be5a1197791317ff1cb2`. The integrated workflow matches
Support's patch exactly. Relevant requirements/workflow/role guidance is unchanged;
task-board changes concern other ongoing preview work. No duplicate dispatch occurred.

[Run 36526881401](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36526881401)
succeeded; job `109271767789` ran 05:35:35–05:36:17 UTC. All source/toolchain,
compile, product/result-bundle packaging and artifact-upload steps passed.
The environment record confirms arm64, macOS 26.6.2 (`25G83`), image
`20260907.0351.1`, Xcode 26.6 (`17F113`), and iOS SDK 26.5. The actual log contains
`CODE_SIGNING_ALLOWED = NO` and `BUILD SUCCEEDED`; the retained AppIntents warning
is nonfatal. The recorded source tree is `db982c3f6e5c65c05ce33640e23540fc8b519edb`.

The GitHub artifact is
[`envprobe-996d95abb15f0a9d247af048b9e6302936e1c99d-1`](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36526881401/artifacts/11015510159),
ID `11015510159`, 84,630 bytes, expires `2026-10-13T05:36:14Z`.
Support downloaded the ZIP through the artifact API; its SHA-256 equals GitHub's
reported digest:
`eec0eacb1c15c2e4984a8a7abf0fd62307e0804bb4eaf8f22aa530fefc59c2b6`.
Archive integrity and safe member paths passed before extraction.

| Downloaded member | Bytes | SHA-256 |
| --- | ---: | --- |
| `EnvProbe.app.unsigned.zip` | 60,591 | `d25b690e68f7595fb19bd47fa6291058d74574e05a02fd0b93ab26ae32b4761a` |
| `EnvProbe.swiftpm.zip` | 2,389 | `5e59f858b998b142e45fa8e3b6069d6b16fbf54b9637bcad7c396d0fe9c7e885` |
| `EnvProbe.xcresult.zip` | 18,371 | `2c32f540fc19d88209f3bfcdf3849056eff3a66bb5a1c9261e8615991563a633` |
| `environment.txt` | 524 | `f1a78e82dc3f58f634cded35ea71d26616cea05e6defb5a73b5517cccf77f501` |
| `xcodebuild.log` | 49,792 | `c8f198877fb851456be617c11f8708b90ec9ac678db349a3d8ac441e29d3f2b2` |

Both source files compare byte-for-byte with `git show` at the integrated SHA
and at original `402bbcf`. `EnvProbe.swift` SHA-256 is
`d124d1d6e1adacdc0e08b188da028402044a1d3f62fee71f4470a409d56e47d2`;
`Package.swift` is `1e0ac6ded98d47f519f1df8b45db893f8b26ac667e5547b2b21533297697be8f`.
The local and hosted ZIP hashes differ, while their source files are identical.

Independent read-only inspection of the product/result ZIPs found no CRC errors
or duplicate paths. App `Info.plist` identifies
`org.example.learningcompanion.envprobe`, version `0.1` / build `1`, iPhoneOS,
minimum OS `17.0`, device families `[1,2]`, and the present `EnvProbe` executable.
The executable and two packaged dylibs are ARM64 Mach-O with iOS build-version
commands (minimum 17.0, SDK 26.5); their declared load-command/segment bounds are
valid. The referenced `EnvProbe.debug.dylib` is present. None of the three binaries
contains `LC_CODE_SIGNATURE`; no `_CodeSignature` or `embedded.mobileprovision`
exists. The result bundle has valid format-3.58 metadata, three data/reference
record pairs and its declared root records. These are Linux structural checks,
not `codesign`/`xcresulttool` validation, runtime execution or device acceptance.

The complete downloaded archive was attached as
`EnvProbe-build-evidence-996d95a.zip`, publication
`pub_79e1e5e989fc48ecb1d2f14299d3cdde`, artifact `art_ceaafcbb05884086`.
This delivery closes the observed absence of retrievable build artifacts in the
first run. It does not establish installation or device behavior.

## Prepared source and device action

Generated `EnvProbe.swiftpm.zip` directly from the exact native Git tree:

```sh
git archive --format=zip --prefix=EnvProbe.swiftpm/ \
  --output=/tmp/sup-ios-01/EnvProbe.swiftpm.zip \
  402bbcf0a3db78bf14ca066b32cd6cebdb0e70da:apps/ios/probes/EnvProbe.swiftpm
```

ZIP SHA-256: `ad480c9ff061e784962a003293f43f58d845c500e77566c47f094ca4fc625fff`.
Python's ZIP integrity check passed; both `Package.swift` and `EnvProbe.swift`
were byte-compared successfully with `git show` at that revision. This proves
packaging fidelity, not Swift compilation. The source ZIP was attached through
AgentsDock, publication `pub_9197619f2e7a4c6ba6c467a4835ca0d9`,
artifact `art_e976fedc2ed9483f` (2,389 bytes).

The next device prerequisite is **the user's interaction with Swift Playground**:

1. Install/open the free Swift Playground on the target iPad. The current Apple
   listing identifies version 4.7, Swift 6/iOS 26 SDK, and iPadOS 18+ requirement;
   the reported iPadOS 26.5 meets that app prerequisite. No OS upgrade is requested.
2. Save the attached source ZIP to Files, tap it to extract, then use Swift
   Playground's Browse to open the complete `EnvProbe.swiftpm` package.
3. Tap Run App. If it fails, return the exact issue text and Playground version.
   If it opens, verify `EnvProbe 0.1`, tap Refresh, and return the displayed JSON.
4. Use text selection/copy or the Share text options actually offered. The source
   currently shares a **String**, not a file URL; Share → Save to Files as `.json`
   is not verified. A guaranteed JSON-file export belongs to iOS if needed.

The probe reads device/audio-session status only; source inspection found no
category/mode activation, recording, microphone permission request or network
upload. Opening/running this exact package has not yet been tested on the iPad.

## Signing and evidence boundaries

- Swift Playground's local Run App path can be attempted without enrolling in the
  paid Developer Program. User device interaction is still required.
- A cloud `.app` built with `CODE_SIGNING_ALLOWED=NO` is an **unsigned build artifact**,
  not an installed iPad app. iPadOS executable code requires signing.
- Personal Team deployment is a separate Xcode/provisioning route with an Apple
  Account and short-lived profiles. Ad hoc distribution requires suitable signing
  assets and registered devices. TestFlight requires the appropriate Developer
  Program/App Store Connect access and an uploaded eligible build. None is configured
  or executed by this task; no enrollment, credential creation, payment or upload occurred.
- The current package has one app target; running it proves neither extension
  deployment nor background operation. Do not infer a universal Playground platform
  prohibition from this package's limited contents.
- R59/A44 original-screen ink, A46 Notability import, live audio comprehension,
  and the later owned-page ink candidate remain separate owner/acceptance work.

## Next owner/action

Lead integration and Support's hosted artifact verification are complete. No
further EnvProbe CI patch or repeat compiler investigation is indicated by these
results. Lead can integrate this final evidence update through the normal flow.

The user's next physical action is the prepared Swift Playground route above.
Native owner retains any device compile/runtime repairs and the separate
`apps/ios/CompanionInk.swiftpm` / `CompanionInk` candidate announced by lead before
its delivery commit. QA receives that exact integrated ink candidate through lead.
No signed install or actual Pencil/ink operation is inferred from this build.

## Primary references checked 2026-09-29 UTC

- [Apple Swift Playground listing](https://apps.apple.com/us/app/swift-playgrounds/id908519492)
- [Apple: open a received playground](https://support.apple.com/guide/playgrounds-ipad/manage-playgrounds-itc106ff9caf/ipados)
- [Apple: run your app](https://support.apple.com/en-ph/guide/playgrounds-ipad/itc650868b1f/ipados)
- [Apple: ZIP files in Files](https://support.apple.com/en-eg/102532)
- [Apple: app code signing](https://support.apple.com/en-ca/guide/security/sec7c917bf14/web)
- [Apple: developer account and Personal Team](https://developer.apple.com/help/account/basics/about-your-developer-account)
- [Apple: ad hoc provisioning](https://developer.apple.com/help/account/provisioning-profiles/create-an-ad-hoc-provisioning-profile/)
- [Apple: TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)
- [GitHub: hosted runners and exact image evidence](https://docs.github.com/en/actions/concepts/runners/github-hosted-runners)
- [GitHub: artifact downloads](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts)
