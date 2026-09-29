# Probes: EnvProbe (Swift Playgrounds app project)

Status: **uncompiled source.** It has not been built or run anywhere. It becomes
`compiled` only after the hosted macOS job in
[`p0-03-environment.md` §5](../../../docs/verification/platform/p0-03-environment.md#resolved-route)
passes, and device evidence only after a run on the user's iPad is committed under
`docs/verification/platform/device/<date>/`.

Purpose: the smallest artifact that exercises the free build and device route. It
compiles on a GitHub-hosted `macos-26` runner and runs in Swift Playgrounds on the
user's own iPad, with no Mac, signing or purchase.

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
3. Tap Run. Then tap Share and save the JSON to Files, and return it.

Compile check (route D, lead-owned CI; see the proposed job in the environment
document):

```sh
cd apps/ios/probes/EnvProbe.swiftpm
xcodebuild -scheme EnvProbe -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

The bundle identifier `org.example.learningcompanion.envprobe` is a local
placeholder. The real prefix is user input U6.
