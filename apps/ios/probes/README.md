# Probes: EnvProbe (Swift Playgrounds app project)

Status: **compiled unsigned on hosted macOS**, exact main `01a8adf`,
[run 36525663497](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36525663497).
No simulator launch, signed install or physical iPad result is established.
See [actual toolchain and device-route evidence](../../../docs/verification/support/sup-ios-01-build-install.md).
Device evidence still requires an actual run recorded under
`docs/verification/platform/device/<date>/`.

Purpose: the smallest artifact for the hosted build and proposed free Swift
Playground device route. The unsigned cloud product is not installable proof;
the complete source package must still be opened and run on the user's iPad.

What it reads, and nothing else:
- device identity for DT-ENV-01: `utsname.machine`, system name and version, model
  and interface idiom;
- the read-only first step of DT-G3-05 variant 2: `AVAudioSession.availableModes`
  before any `setCategory`, plus the current category and mode, `currentRoute`
  inputs and outputs with their channels, and `availableInputs`;
- the microphone permission status. It never requests permission.

It never sets a category or mode, never activates the audio session, never records
and never sends anything off the device. The JSON appears on screen and leaves the
device only when the user taps Share.

Run on the iPad (route C, the user's action):
1. Install Swift Playgrounds from the App Store (free; version 4.7 needs iPadOS 18
   or later).
2. Get `apps/ios/probes/EnvProbe.swiftpm` onto the iPad (for example, download the repository ZIP
   in Safari and open the folder from Files), then open it in Swift Playgrounds.
3. Tap Run. Return the displayed JSON or exact error. Share currently exports a
   String, so saving a `.json` file through the share sheet is not established;
   copy/text sharing depends on the options actually offered.

Compile check (route D, Support maintains the delegated `ios-probe.yml`; lead
integrates and pushes):

```sh
cd apps/ios/probes/EnvProbe.swiftpm
xcodebuild -scheme EnvProbe -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

The bundle identifier `org.example.learningcompanion.envprobe` is a local
placeholder. The real prefix is user input U6.
