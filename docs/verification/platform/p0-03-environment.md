# P0-03 environment, build/sign/install routes and required user inputs

Date: 2026-09-28 UTC. Baseline `91019c3`. Row IDs refer to
[`p0-03-capability-matrix.md`](p0-03-capability-matrix.md). Research IDs such as `D7-10` refer to
[`research/p0-03-verified-claims.json`](research/p0-03-verified-claims.json).

## 1. Local environment actually inspected

Everything below was run in this worktree. Credentials, `~/.ssh` and private authority files were
not searched or read.

| Check | Command (abridged) | Result |
| --- | --- | --- |
| Host | `uname -a`; `/etc/os-release` | Linux 6.18.33.2-microsoft-standard-WSL2 x86_64, Ubuntu 26.04.1 LTS |
| Apple toolchain | `command -v swift swiftc xcodebuild xcrun xtool` | none found |
| Containers | `command -v docker` | none |
| Python | `command -v python3 uv` | `/usr/bin/python3`, `~/.local/bin/uv` |
| Installed skills | names under `~/.claude/skills/synced/` | built-in-browser, chrome-browser, computer-use, deep-research, docs, docx, import-memory, morning, pdf, pptx, skill-creator, xlsx. None builds for Apple platforms. |
| Session tools | tool search for computer, remote device, Mac or screenshot tools | No computer-use or remote-device tool is connected to this session. |
| Project playbooks | project tree and `.claude/` | No Mac, Xcode or remote-build playbook |
| Environment names | `env \| cut -d= -f1 \| grep -iE 'mac\|xcode\|apple\|ios\|devel'` | none |
| Contract baseline | `git merge --ff-only 91019c3…`; `uv sync --frozen`; `.venv/bin/python -m pytest -q` | fast-forward OK; locked deps installed into ignored `.venv`; `42 passed` |

**Conclusion:** there is no macOS, Xcode, Apple signing identity or remote Mac route in this
environment. Nothing iOS-native can be compiled or installed from here. The official Swift
toolchains for Linux and Windows can build only platform-independent Swift. UIKit, PencilKit,
ReplayKit, ScreenCaptureKit and SafariServices ship only in the Apple SDK inside Xcode (D7-17). The
Xcode SDK license allows the SDK only on Apple-branded hardware (D7-03).

## 2. Build, sign and install routes (ranked)

"Covers" lists what each route could turn from *documented* into *compiled* or *device-tested*.

| # | Route | Cost / decision | Covers | Cannot cover |
| --- | --- | --- | --- | --- |
| A | Apple silicon Mac (M1 or later), macOS Tahoe 26.6+, Xcode 27 (27A266a) | User must own or borrow a Mac; no purchase is authorized | Native app, ScreenCaptureKit capture (iOS 27 SDK), ReplayKit fallback, App Groups, device debugging. On a free team see A-free; the Safari extension parts need A-paid. | Safari extension on the device without the paid program (D7-09) |
| A-paid | Route A plus the paid Apple Developer Program (U3 + U4) | Mac access plus US$99/year; user decision, not authorized here | Everything in A plus the Safari extension on the device, the `SafariWebExtensionHandler` bridge, TestFlight and 1-year profiles | — |
| A-free | Route A with a free Personal Team | Free, but profiles expire after 7 days (DTS statement, D7-05/D7-M10) | Short spikes: app plus App Group and Background modes, which Apple's table lists for the free tier (D7-06) | Safari extension device testing: Apple says it needs the paid program (D7-09). No TestFlight. |
| B | Paid Apple Developer Program without a Mac (US$99/year) | User decision and payment | B1: App Store Connect Safari Web Extension Packager: web-only extension, then TestFlight (G1-02). B2: Swift Playground 4.7 uploads SwiftUI + PencilKit apps to TestFlight (D7-19); uploads built with its iOS 26 SDK are accepted only until April 2027 (D8-03). | Native bridge, app extensions, background modes, ScreenCaptureKit (Playground 4.7 has the iOS 26 SDK) |
| C | Swift Playground 4.7 on the user's iPad, free | Free; the user runs it | Real-device runs of our own SwiftUI/UIKit/PencilKit/WKWebView probe inside the Playground app: Pencil vs finger, ink persistence, device identification (DT-PEN-*, DT-INK-01, DT-INK-03, DT-ENV-01) | Extensions, background modes, capture of other apps, TestFlight, iOS 27-only APIs such as stroke IDs and PKStrokeRecognizer (DT-INK-02), because Playground 4.7 ships the iOS 26 SDK |
| D | GitHub-hosted macOS runner, compile only | Free for public repositories (D7-14). The repository is public by the user's decision (TEAM.md at 57aee9c), so this is free. CI config is lead-owned. | Proof that bounded Swift compiles (`xcodebuild … CODE_SIGNING_ALLOWED=NO`). The `xcode-27` image is in public preview; `macos-26` has Xcode 26.6 only. | Signing, install, any device behavior |
| — | Not recommended | — | xtool or other Linux/WSL cross-signing conflicts with the Xcode SDK license and uses a private-API Apple ID login (D7-18). Cloud Mac rental is paid (not authorized) and still needs TestFlight (D7-23). | — |

Recommended sequence, with each step conditional on the user's inputs in section 4:

1. **Now, free:** C (Swift Playground on the iPad) for the Pencil/ink probes. Also D, if the lead adds
   a compile-only job, so the same probe sources are also compiled.
2. **If the user enrols in the paid program:** B1 (packager plus TestFlight) lets the web role's
   content script and G1 permission, iframe and fullscreen tests run on the real iPad without a Mac.
3. **Only with route A:** ScreenCaptureKit capture (G3 go/no-go) and the full lifecycle tests. The
   Safari extension native bridge needs A-paid. Every G3 row remains `documented`/`not_tested` until
   route A exists.

## 3. Minimal steps per route

Every step that touches the user's device, Apple Account, money or Settings is performed by the user.

**Route C: Swift Playground probe on the iPad (free)**
1. Install Swift Playground from the App Store. Version 4.7 needs iPadOS 18 or later.
2. Open the probe package. The iOS role provides it as a `.swiftpm` app playground after the lead
   approves the probe. Transfer: Files/iCloud Drive or a download from the public repository.
3. Tap Run. Grant any requested permission, for example the microphone.
4. Follow the matching checklist item. The probe writes a JSON log. Export it through Share → Save to
   Files and return it for `docs/verification/platform/device/<date>/`.

**Route B1: web-only Safari extension through TestFlight (paid program)**
1. The user enrols in the Apple Developer Program as an individual. This needs a 2FA Apple Account,
   the user's legal name and their own card (D7-12).
2. In App Store Connect, create an app record with a bundle ID such as
   `<reverse-domain>.learningcompanion`.
3. Xcode Cloud tab → Safari Web Extension Packager → upload the extension's full resources (manifest
   and files) (G1-02).
4. TestFlight: add the user as an internal tester and install the TestFlight app on the iPad.
   Developer Mode is not needed.
5. On the iPad: Settings → Apps → Safari → Extensions → enable. Allow access on
   `bcourses.berkeley.edu` and on the Kaltura player domains when prompted.

**Route A: Mac with Xcode 27**
1. Use an Apple silicon Mac on macOS Tahoe 26.6 or later. Install Xcode 27. Go to Xcode → Settings →
   Apple Accounts and sign in (free or paid).
2. Project with app target (UIScene lifecycle, launch screen, fully resizable; D8-23/D3-11).
   Optional targets: the Safari Web Extension (A-paid for device testing); a Broadcast Upload Extension
   (iPadOS 26.x fallback; on 27 only if DT-G3-07 passes).
   Signing & Capabilities: team, unique bundle ID, App Group `group.<bundle-id>`, and Background Modes
   `audio` + `screen-capture` for the capture probe.
3. Pair the iPad. Device Hub → + → Pair Nearby Device… works wirelessly with iPadOS 27; otherwise use
   a USB-C cable. On the iPad, trust the Mac.
4. On the iPad: Settings → Privacy & Security → Developer Mode → Restart → Enable. The toggle appears
   only after pairing has started (D7-08).
5. Run from Xcode once. Then run lifecycle and capture tests launched from the Home Screen, not under
   the debugger, because the debugger prevents suspension (D5-M11).
6. Free team only: expect "Untrusted Developer" on first launch, and trust it under Settings → General
   → VPN & Device Management (community report, D7-24). The build expires after 7 days. New paid
   teams: the first launch needs network access for the PPQ check (D7-M05).

**Route D: compile-only CI (lead action)**
- Job sketch for the lead's `.github/workflows/checks.yml`:
  `runs-on: xcode-27` (or `macos-26` for code that does not need the 27 SDK), then
  `xcodebuild -scheme <probe> -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build`.
- This proves compilation only. Record it as `compiled`, never as a device result.

## 4. Exact user inputs and decisions needed

| # | Input / decision | Why | Blocks |
| --- | --- | --- | --- |
| U1 | iPad A-number: Settings → General → About → tap Model Number. Also the iPadOS version and build. | Apple Pencil Pro rules out iPad (A16). The 2025 candidates are iPad Air (M3) A3266–A3271 and iPad Pro (M5) A3357–A3362. A 2024 Pencil Pro model bought in 2025 is also possible: Pro M4 A2836/A2837/A3006/A2925/A2926/A3007, Air M2 A2898–A2904, mini A17 Pro A2993/A2995/A2996 (PEN-07, D2-03). ScreenCaptureKit needs iPadOS 27. | Every device test |
| U2 | iPhone model and iOS version | The iPhone leg needs iOS 27 on iPhone 11 or later for ScreenCaptureKit; otherwise ReplayKit (D8-15) | G3 multi-device |
| U3 | Access to an Apple silicon Mac, with its macOS version, even borrowed or temporary | Route A is the only route for capture and lifecycle tests; the G1 native bridge also needs U4 (A-paid) | G3, LC-*, G1 native bridge (with U4) |
| U4 | Whether to join the paid Apple Developer Program (US$99/year, individual, legal name, own card). Not a purchase instruction. | Routes B and A-paid: TestFlight, the Safari extension on the device and its native bridge, 1-year profiles | G1 on the device |
| U5 | Which Apple Account signs builds, with 2FA on | Signing (free or paid) | Routes A and B |
| U6 | Bundle ID prefix, for example `com.<name>.learningcompanion` | App record, App Group and extension IDs | Routes A and B |
| U7 | Consent to turn on Developer Mode (restart and passcode; lowers device security) and to trust a free developer profile | Xcode-installed builds | Route A |
| U8 | Willingness to run Swift Playground probes and return the JSON logs | Free real-device Pencil and ink evidence | Route C |
| U9 | The user's CalNet/Duo sign-in method (Push, passcode or passkey/security key) | Decides whether the in-app browser fallback is viable (D8-27) | G1-12 |
| U10 | Later, for G5: whether to create a free Azure/Entra directory for app registration, and which Microsoft account holds OneNote (personal or Berkeley) | OneNote Graph needs a registered app and delegated consent (G5-05) | G5 OneNote |
| U11 | Whether Apple Intelligence is on, whether the device language is a supported English variant, and whether the iPad was bought outside mainland China | Visual Intelligence entry point (G2-06, D8-16) | G2-06 only |

The team does not perform account creation, enrolment, payment, Settings changes, course login,
Developer Mode or installation. Each is a user action or needs separate authorization.

<a id="resolved-route"></a>

## 5. Resolved route for the reported target (2026-09-29 UTC)

Lead request `handoff_7cedd99e4f141d9ca0d15da8524b91b9`: name a concrete build, signing and device route
that uses existing authorized access, with the exact missing access and its owner. Workflow policy read
at `4a2be79525e87542b3ca77ac6fd04ecf28b04b6d` (`docs/workflow.md`). No purchase, account action,
signing, push or device action was taken.

**Checked now with existing access (read-only):**

| Check | Command or source | Result |
| --- | --- | --- |
| Repository visibility | `gh repo view Judithandprey/ai-learning-companion --json visibility` | `PUBLIC`, so standard GitHub-hosted runners, macOS included, are free (D7-14) |
| Actions enabled | `gh api repos/…/actions/permissions` | `enabled: true`, `allowed_actions: all` |
| Hosted runs execute | `gh run list` | "P0 checks" runs on `ubuntu-24.04` for every push to main. They currently fail in a lead-owned test; see the note below. |
| macOS image for the target | `actions/runner-images` README (sha256 `7691efc4…`) and `images/macos/macos-26-arm64-Readme.md` (sha256 `688dc6f1…`), fetched 2026-09-29 | `macos-26` (= `macos-latest`, arm64) is GA: image 20260907.0351.1, macOS 26.6.2. Xcode 26.6 is the default, with the iOS 26.5 SDK and an "iPad Pro 13-inch (M5)" iOS 26.5 simulator. `xcode-27` is still a public preview. |

The GA `macos-26` image already carries the iOS 26.5 SDK, which matches the user's iPadOS 26.5 and
includes 26.2 symbols such as `dualRoute`. The 27 preview image is not needed for the target.

**Decision: routes D and C together, one package, no signing and no purchase.**
1. **Compile (route D).** A hosted `macos-26` job builds `apps/ios/probes/EnvProbe.swiftpm` with
   `CODE_SIGNING_ALLOWED=NO`. A pass is recorded as `compiled`, never as device evidence.
2. **Device (route C).** The user runs the same package in Swift Playgrounds on their own iPad. Swift
   Playgrounds builds and runs it locally without a Mac, a developer account or signing. The JSON is
   committed under `device/<date>/` and recorded as device evidence for that run only.

The probe (`apps/ios/probes/`, uncompiled) is deliberately minimal. It covers DT-ENV-01 and the
read-only first step of DT-G3-05 variant 2 (`availableModes` before any `setCategory`), and it
reads `currentRoute`, `availableInputs` and the microphone permission status. It sets no category
or mode, activates nothing, records nothing and requests no permission. Its purpose is to prove the
route end to end; larger probes (Pencil and finger, own-canvas ink, the M1 microphone) follow only
after the route works and the lead assigns them.

**Proposed CI job** (lead-owned `.github/`; a separate file, so the existing checks are unchanged):

```yaml
# .github/workflows/ios-probe.yml
name: iOS probe compile
on:
  push:
    branches: [main]
    paths: ['apps/ios/**', '.github/workflows/ios-probe.yml']
  pull_request:
    branches: [main]
    paths: ['apps/ios/**', '.github/workflows/ios-probe.yml']
  workflow_dispatch:
permissions:
  contents: read
jobs:
  envprobe:
    runs-on: macos-26
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - run: xcodebuild -version && xcrun --sdk iphoneos --show-sdk-version
      - working-directory: apps/ios/probes/EnvProbe.swiftpm
        run: xcodebuild -scheme EnvProbe -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

**Who does what next:**

| Step | Owner | Access it needs | State |
| --- | --- | --- | --- |
| Add `ios-probe.yml` and run it (push or `workflow_dispatch`) | Lead (root CI), or a bounded shared-file patch delegated to iOS | Existing repository push; no new account | Not done |
| Fix any compile error from that run | iOS | The job log | After the run |
| Run EnvProbe on the iPad and share the JSON (U8) | User, asked by the lead when the lead decides | Swift Playgrounds (free, App Store) on the user's own iPad | Not requested |
| Commit the JSON under `device/<date>/`; update DT-ENV-01 and the first step of DT-G3-05 variant 2 | iOS | — | After the user's run |
| Signed install, TestFlight, app extensions (Safari W path, broadcast V/AV path), background modes, the native bridge | User decision U4 (paid program, not authorized) together with route A (U3, no Mac available) or route H | Not available with existing access | Blocked; no request is made by this section |

**What the route can and cannot establish.** Route C on 26.5 can produce device evidence for DT-ENV-01,
DT-PEN-*, DT-INK-01/03, the foreground own-canvas S-path tests and the foreground M1 microphone. It can
cover the M2 `dualRoute` gate only if Swift Playgrounds' SDK includes the 26.2 symbols, which is not
yet known. It cannot produce evidence for anything that needs an extension, a background mode or
signing: the Safari W path, the broadcast V path, AV01 to AV06, R59/A44, A46 and Notability import.
Those stay `not_tested`. A simulator launch on the runner would be compile and launch evidence only,
never device evidence, and is not part of the proposed job.

**Note for the lead (lead-owned, not edited here).** Main CI has been red since `3636dd6`.
`tests/e2e/test_p0_08_process_v2_capture.py::test_v1_contract_bytes_are_frozen_since_the_pre_v2_baseline`
runs `git show 7fadd151…:<path>`, and the checkout in `checks.yml` sets no `fetch-depth`. The files do
exist at that commit locally, so the likely fix is `fetch-depth: 0` or an explicit fetch of that
commit.
