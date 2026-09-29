# IOS-INK-01: owned-page ink slice (native)

Task: IOS-INK-01 in the user-approved iPad delivery split (`assignment.md`, sha256
`a33b3f0ce4fe6a55b49100324353c5c7a1861357af095c214cb69bad2a761dcd`, 2026-09-29 UTC). It is a
bounded subtask of the existing P0-03/P0-11 cards. Base: team/ios `402bbcf`, whose parent `410952c`
is a clean merge of main `4a2be79`.

Target: iPad Pro 13-inch (M5) on iPadOS 26.5.

## Evidence levels (kept separate)

| Level | State | Evidence |
| --- | --- | --- |
| Source written | Yes | `apps/ios/CompanionInk.swiftpm` (commit in the delivery message) |
| Compiled | **No.** There is no Apple toolchain in this environment. | Expected from support's hosted macOS job (SUP-IOS-01) |
| Simulator launch | No | — |
| Installed app | No (no signing) | — |
| Physical iPad and Apple Pencil | No | — |

Until support's job passes, the source is **uncompiled**. No native feature is added beyond this
slice until it compiles.

## Package and build

- Package: `apps/ios/CompanionInk.swiftpm`, a Swift Playgrounds app package (`AppleProductTypes`).
- Scheme: `CompanionInk`. Minimum iOS 17.0.
- Bundle ID: placeholder `org.example.learningcompanion.ink`; the real prefix is user input U6.
- Compile, from the package directory:
  `xcodebuild -scheme CompanionInk -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build`.
- Simulator build: use `-destination 'generic/platform=iOS Simulator'` on the GA `macos-26` runner
  (Xcode 26.6, iOS 26.5 SDK).
- Device without a Mac: open the package in Swift Playgrounds on the iPad and tap Run (route C).
- If `xcodebuild` cannot build the Playgrounds manifest, the actual log goes to iOS for a minimal
  native project adjustment. No syntax-only substitute counts.

## What the slice does

- **One page.** A practice page written for this project and compiled into the app
  (`fixture.practice.linear-equation`, version 1).
  - It is shown as "a bundled practice page, not a captured course page".
  - Its context records a SHA-256 of the page text and a fixed page size of 680 × 860 pt.
  - The page uses fixed font sizes, so ink stays on the same words across devices, windows and
    text-size settings. This slice therefore does not follow Dynamic Type.
- **Input modes.** Modes are separate from any teaching state; there is none in this slice.
  - NAV is the default. The canvas takes no touches, and fingers scroll the page when it does not
    fit.
  - WRITE: Apple Pencil writes, and fingers still scroll. A visible "Finger ink" toggle, off by
    default, allows finger or mouse ink, for example in the Simulator.
  - ASK shows "AI help is not connected in this build. Nothing was selected or sent."
  - Writing never triggers a request or an answer.
- **Tools.** Pen (black, width 3) and a vector eraser, which removes whole strokes.
- **Saving.** Every drawing change saves the editable original, `PKDrawing.dataRepresentation()`,
  inside a JSON envelope. The file is
  `Application Support/Ink/fixture.practice.linear-equation.user_original.json`, and the envelope
  holds:
  - `schemaVersion` 1;
  - `layer: user_original` and `authorship: user`;
  - the full page context;
  - `savedAt` and the drawing data.

  The write is atomic. Nothing goes to the network.
- **Restoring.** At launch the file is read before the canvas exists, and loading is not treated as
  an edit. Strokes can be erased and extended after reopening.
- **AI layer.** None exists. This file only ever holds the user's layer; a future AI supplement
  would be a separate file and never edits it.

### Data-loss rules in the code

| Case | Behaviour |
| --- | --- |
| Crash or kill during a save | Atomic write: the old or the new file, never a partial one |
| Save fails, for example on a full disk or a missing directory | The status says "Not saved: …". The ink stays on screen, and the next change retries. |
| Saved file cannot be read or decoded | The file is renamed unchanged to `….unreadable-<unix time>-<random>.json`. The page starts empty and the status names the kept file. |
| Saved file is not a version-1 user-original file (another schema version, a non-`user` authorship or a non-`user_original` layer) | The file is renamed unchanged to `….unsupported-<unix time>-<random>.json` and is never shown as the user's ink |
| Saved file belongs to another page | The file is renamed unchanged to `….other-page-<unix time>-<random>.json` and is never shown on this page |
| The file cannot be moved aside | The file is left untouched. New ink will be saved to `….new-<unix time>-<random>.json`, and the status says it does not reopen automatically. |
| File changed on disk since this window read or wrote it (for example, a second iPad window) | The file is not overwritten. This window saves to `….conflict-<unix time>-<random>.json`, and the status says so. |
| At save time, the file exists but cannot be read (for example, lost permissions) | Treated as changed: never replaced, and this window saves beside it as `….conflict-…`. Only an absent file, or one whose bytes this window last read or wrote, is replaced. (Fixed after the lead's source review of `5d5d8cb`: unreadable was previously treated like absent.) |

The random suffix keeps side-file names unique, even for two in the same second or after the clock
goes back. Kept-aside, `new-` and `conflict-` files are retained but not shown at the next launch,
and the status says so. Merging them is not in this slice.

## Checks run

- Linux: no Swift or Apple SDK is available, so nothing was compiled or run here.
- **Focused data-loss check for the Apple route:** `apps/ios/checks/InkFileCheck/main.swift`. It
  compiles the app's own `InkFile.swift` and `PracticePage.swift` with `xcrun swiftc` on a Mac,
  without the app or PencilKit, and runs against the real file system in a temporary directory.
  - It checks the replace rule: absent file, unchanged file, file changed on disk, and an existing
    mode-000 unreadable file (the reported defect); the original bytes must stay unchanged.
  - It checks load rejection: schema version, authorship, layer and page.
  - It checks the envelope round trip.
  - It exits non-zero on any failure. If the process can read a mode-000 file (for example, as root),
    it prints SKIP for the unreadable cases.
  - Command (for support's job):
    `xcrun swiftc -target arm64-apple-macos14 apps/ios/CompanionInk.swiftpm/InkFile.swift apps/ios/CompanionInk.swiftpm/PracticePage.swift apps/ios/checks/InkFileCheck/main.swift -o "$RUNNER_TEMP/ink-file-check" && "$RUNNER_TEMP/ink-file-check"`.
  - Not run yet: there is no Mac here.
- **The route is proven for this package shape.** Support's hosted job compiled the same kind of Swift
  Playgrounds package, EnvProbe, with no signing: `** BUILD SUCCEEDED **`.
  - Run: <https://github.com/Judithandprey/ai-learning-companion/actions/runs/36525663497>
  - Commit `01a8adf`, runner image `macos-26` 20260907.0351.1, Xcode 26.6 (17F113).

  That is EnvProbe's compile evidence, not CompanionInk's. CompanionInk uses the same manifest form
  (`AppleProductTypes`, `.executableTarget(path: ".")`, no icon or team fields).
- **Independent code reading** (workflow `wf_34970c17-751`; its verification stage was interrupted by
  a session restart):
  - The compile lens found no issues.
  - The behaviour and data-loss lens found two minor issues, which I confirmed by reading the code and
    fixed before commit: side-file names could collide within one second, and one status message
    described a save that had not happened yet.
  - A reading is not a compile. CompanionInk stays uncompiled until its own hosted run.

## Acceptance steps for QA (QA-IOS-01)

Record the commit, the environment, and whether each run used the Simulator or a physical iPad. In
the Simulator, turn on "Finger ink" because it has no Apple Pencil. Pencil-only behaviour is checked
only on a device.

1. Launch. Check that the page title is shown, the mode is NAV, the status says "No saved ink for
   this page yet." and the footer names the bundled page.
2. In NAV, try to draw: nothing is drawn. In ASK, check the not-connected message; nothing is drawn
   and nothing is sent.
3. In WRITE, draw three strokes. The status says "Saved 3 strokes at …". Erase one: "Saved 2
   strokes …".
4. Quit the app from the app switcher. Turn on Airplane Mode. Relaunch. Check "Restored 2 strokes
   …", with the strokes on the same words. Draw again and erase an older stroke; both work.
5. Check the file is still readable. In the Simulator, use
   `xcrun simctl get_app_container booted org.example.learningcompanion.ink data`, then open
   `Library/Application Support/Ink/`. The JSON has `layer: user_original` and the page context.
6. Failed save (Simulator): quit the app. Replace the `Ink` directory with a plain file named `Ink`,
   after keeping a copy. Relaunch, draw, and check "Not saved: …" with the ink still visible. Restore
   the directory.
7. Unreadable file: quit the app. Put invalid text in the JSON file. Relaunch and check the page
   starts empty, the status names the `….unreadable-…` file, and that file is unchanged.
   Unreadable at save time (Simulator): with the app running and ink saved, run `chmod 000` on the
   saved JSON and record its SHA-256. Draw a stroke. The status names a `….conflict-…` file, and the
   original's SHA-256 is unchanged. Then run `chmod 600` on it again.
8. Device only: with Apple Pencil in WRITE, the Pencil draws and a finger scrolls or does nothing;
   it never draws while "Finger ink" is off. Physical cases stay `not_run` until a real device run
   is recorded.

## Not covered by this slice

- **R59/A44:** original live-screen annotation and AI receipt of the composite.
- **A46:** Notability import.
- Capture, app audio and multi-speaker understanding.
- AI help, and the AI supplement layer.
- Backend, contract, sync and multiple pages.
- Undo buttons. The system undo gestures are not verified.

Each item keeps its existing owner and acceptance gap. This owned page is not an A45 original-screen
result either.
